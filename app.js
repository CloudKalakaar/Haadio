let songs = [];
let currentSongIndex = 0;
let isPlaying = false;
const audio = document.getElementById('audio-player');

const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const trackTitle = document.getElementById('track-title');
const trackArtist = document.getElementById('track-artist');
const labelTitle = document.getElementById('label-title');
const record = document.getElementById('record');
const recordCenter = document.querySelector('.record-center');
const playlistContainer = document.getElementById('playlist-container');
const favoritesContainer = document.getElementById('favorites-container');
const downloadsContainer = document.getElementById('downloads-container');
const likeBtn = document.getElementById('like-btn');
const downloadBtn = document.getElementById('download-btn');

const albumsSection = document.getElementById('albums-section');
const albumsContainer = document.getElementById('albums-container');
const songsSectionTitle = document.getElementById('songs-section-title');

let likedSongs = JSON.parse(localStorage.getItem('haadio-liked-songs')) || [];

// IndexedDB Setup
const DB_NAME = 'haadio-db';
const STORE_NAME = 'offline-songs';
let db = null;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => {
            reject(e.target.error);
        };
    });
}

function saveOfflineSong(song, audioBlob, imageBlob) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("Database not initialized"));
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const offlineSong = {
            id: song.id,
            title: song.title,
            artist: song.artist,
            audioBlob: audioBlob,
            imageBlob: imageBlob,
            url: song.url,
            image: song.image
        };
        const request = store.put(offlineSong);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function getOfflineSongs() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function deleteOfflineSong(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("Database not initialized"));
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// Navigation Logic
const navBtns = document.querySelectorAll('.nav-btn');
const sections = {
    home: document.getElementById('home'),
    playlist: document.getElementById('playlist'),
    favorites: document.getElementById('favorites'),
    downloads: document.getElementById('downloads')
};

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const target = btn.getAttribute('data-target');
        Object.values(sections).forEach(sec => sec.classList.add('hidden'));
        sections[target].classList.remove('hidden');
        
        if (target === 'favorites') {
            renderFavorites();
        } else if (target === 'downloads') {
            renderDownloads();
        }
    });
});

// Category Logic
const catBtns = document.querySelectorAll('.cat-btn');
catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        catBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const query = btn.getAttribute('data-query');
        fetchSongs(query);
    });
});

// Helper to decode HTML entities returned by JioSaavn API
function decodeHTMLEntities(text) {
    if (!text) return "";
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
}

function mapAPITrack(track) {
    let audioUrl = "";
    if (track.downloadUrl && track.downloadUrl.length > 0) {
        const highQuality = track.downloadUrl.find(d => d.quality === '320kbps') || 
                            track.downloadUrl.find(d => d.quality === '160kbps') || 
                            track.downloadUrl[track.downloadUrl.length - 1];
        audioUrl = highQuality ? highQuality.url : "";
    }
    
    let imgUrl = "";
    if (track.image && track.image.length > 0) {
        const highQualityImg = track.image.find(i => i.quality === '500x500') || 
                               track.image.find(i => i.quality === '150x150') || 
                               track.image[track.image.length - 1];
        imgUrl = highQualityImg ? highQualityImg.url : "";
    }
    
    let artistName = "Unknown Artist";
    if (track.artists && track.artists.primary && track.artists.primary.length > 0) {
        artistName = track.artists.primary.map(a => decodeHTMLEntities(a.name)).join(', ');
    } else if (track.primaryArtists) {
        artistName = track.primaryArtists;
    }
    
    return {
        id: track.id,
        title: decodeHTMLEntities(track.name || track.title) || "Unknown Title",
        artist: artistName,
        url: audioUrl,
        image: imgUrl
    };
}

async function fetchSongs(category = "trending") {
    trackTitle.textContent = "Loading Songs...";
    trackArtist.textContent = "Please wait";
    playlistContainer.innerHTML = '<div style="color: #fff; width: 100%; text-align: center; padding: 2rem;">Loading amazing tracks...</div>';
    
    if (albumsSection) albumsSection.classList.add('hidden');
    if (songsSectionTitle) songsSectionTitle.style.display = 'none';

    let searchQuery = category;
    if (category === "trending") {
        searchQuery = "latest releases";
    }
    
    const songsEndpoint = `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(searchQuery)}&limit=40`;
    const albumsEndpoint = `https://saavn.sumit.co/api/search/albums?query=${encodeURIComponent(searchQuery)}&limit=12`;
    
    try {
        const [songsResponse, albumsResponse] = await Promise.all([
            fetch(songsEndpoint).catch(err => { console.warn(err); return null; }),
            fetch(albumsEndpoint).catch(err => { console.warn(err); return null; })
        ]);

        if (songsResponse && songsResponse.ok) {
            const songsJson = await songsResponse.json();
            if (songsJson.success && songsJson.data && songsJson.data.results && songsJson.data.results.length > 0) {
                const results = songsJson.data.results;
                songs = results.map(track => mapAPITrack(track)).filter(song => song.url !== "");
                
                if (songs.length > 0) {
                    initPlayer();
                } else {
                    showError("No playable tracks found.");
                }
            } else {
                showError("No tracks found.");
            }
        } else {
            showError("Failed to fetch tracks. Try again.");
        }

        if (albumsResponse && albumsResponse.ok) {
            const albumsJson = await albumsResponse.json();
            if (albumsJson.success && albumsJson.data && albumsJson.data.results && albumsJson.data.results.length > 0) {
                renderAlbums(albumsJson.data.results);
            }
        }
    } catch (e) {
        console.error("API Error:", e);
        showError("Network error. Please try again later.");
    }
}

function renderAlbums(albumsList) {
    if (!albumsContainer || !albumsSection) return;
    albumsContainer.innerHTML = '';
    
    albumsList.forEach(album => {
        const card = document.createElement('div');
        card.className = 'album-card';
        
        let imgUrl = "";
        if (album.image && album.image.length > 0) {
            const highQualityImg = album.image.find(i => i.quality === '500x500') || 
                                   album.image.find(i => i.quality === '150x150') || 
                                   album.image[album.image.length - 1];
            imgUrl = highQualityImg ? highQualityImg.url : "";
        }
        
        const artist = album.artist || album.primaryArtists || "";
        const title = decodeHTMLEntities(album.name || album.title) || "Unknown Album";
        
        card.innerHTML = `
            <img src="${imgUrl || 'file_000000004ed071fb8190e340809155c9.png'}" alt="${title}">
            <h4 title="${title}">${title}</h4>
            <p title="${artist}">${artist}</p>
        `;
        
        card.addEventListener('click', () => {
            playAlbum(album.id, title);
        });
        
        albumsContainer.appendChild(card);
    });
    
    albumsSection.classList.remove('hidden');
    if (songsSectionTitle) songsSectionTitle.style.display = 'block';
}

async function playAlbum(albumId, albumTitle) {
    trackTitle.textContent = "Loading Album...";
    trackArtist.textContent = albumTitle;
    playlistContainer.innerHTML = '<div style="color: #fff; width: 100%; text-align: center; padding: 2rem;">Fetching album tracks...</div>';
    
    const endpoint = `https://saavn.sumit.co/api/albums?id=${albumId}`;
    try {
        const response = await fetch(endpoint);
        if (response.ok) {
            const json = await response.json();
            if (json.success && json.data && json.data.songs && json.data.songs.length > 0) {
                songs = json.data.songs.map(track => mapAPITrack(track)).filter(song => song.url !== "");
                
                if (songs.length > 0) {
                    initPlayer();
                    playSong();
                    
                    // Show a premium toast notification
                    const notification = document.createElement('div');
                    notification.style.position = 'fixed';
                    notification.style.bottom = '80px';
                    notification.style.left = '50%';
                    notification.style.transform = 'translateX(-50%)';
                    notification.style.background = 'rgba(46, 196, 182, 0.95)';
                    notification.style.color = '#fff';
                    notification.style.padding = '12px 24px';
                    notification.style.borderRadius = '30px';
                    notification.style.fontFamily = "'Outfit', sans-serif";
                    notification.style.fontSize = '0.95rem';
                    notification.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
                    notification.style.zIndex = '999';
                    notification.innerHTML = `<i class="fas fa-play" style="margin-right: 8px;"></i> Playing Album: <strong>${albumTitle}</strong>`;
                    document.body.appendChild(notification);
                    setTimeout(() => notification.remove(), 3000);
                    
                    navBtns[0].click();
                } else {
                    showError("No playable tracks in this album.");
                }
            } else {
                showError("Could not retrieve album tracks.");
            }
        } else {
            showError("Failed to fetch album details.");
        }
    } catch (e) {
        console.error("Play Album Error:", e);
        showError("Failed to load album.");
    }
}

function showError(msg) {
    trackTitle.textContent = "Error";
    trackArtist.textContent = msg;
    playlistContainer.innerHTML = `<div style="color: #f05454; width: 100%; text-align: center; padding: 2rem;">${msg}</div>`;
}

function initPlayer() {
    if (songs.length === 0) return;
    currentSongIndex = 0;
    loadSong(currentSongIndex);
    renderPlaylist();
    progressBar.value = 0;
    currentTimeEl.textContent = "0:00";
    totalTimeEl.textContent = "0:00";
    pauseSong(); // Ensure it doesn't auto-play on load
}

function applyMarquee(element) {
    if (!element) return;
    element.style.animation = 'none';
    element.style.transform = 'translate3d(0, 0, 0)';
    const parent = element.parentElement;
    if (parent) {
        parent.style.textAlign = 'center';
    }
    
    // Tiny timeout to ensure the layout has rendered new text
    setTimeout(() => {
        const parentWidth = parent ? parent.clientWidth : 0;
        const textWidth = element.scrollWidth;
        
        if (parentWidth && textWidth > parentWidth) {
            if (parent) {
                parent.style.textAlign = 'left';
            }
            const scrollDistance = textWidth - parentWidth + 25; // 25px scroll offset
            element.style.setProperty('--scroll-distance', `-${scrollDistance}px`);
            const duration = Math.max(8, textWidth / 35);
            element.style.animation = `marquee-scroll ${duration}s linear infinite`;
        }
    }, 150);
}

function loadSong(index) {
    if (!songs[index]) return;
    const song = songs[index];
    
    if (song.audioBlob) {
        audio.src = URL.createObjectURL(song.audioBlob);
    } else {
        audio.src = song.url;
    }
    
    trackTitle.textContent = song.title;
    trackArtist.textContent = song.artist;
    labelTitle.textContent = song.title.substring(0, 8).toUpperCase();
    
    // Trigger smooth marquee animations for title and artist info
    applyMarquee(trackTitle);
    applyMarquee(trackArtist);
    
    // Set album art on the record center
    if (song.imageBlob) {
        const imgUrl = URL.createObjectURL(song.imageBlob);
        recordCenter.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('${imgUrl}')`;
        recordCenter.style.backgroundSize = 'cover';
        recordCenter.style.backgroundPosition = 'center';
        labelTitle.style.display = 'block';
    } else if (song.image) {
        recordCenter.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('${song.image}')`;
        recordCenter.style.backgroundSize = 'cover';
        recordCenter.style.backgroundPosition = 'center';
        labelTitle.style.display = 'block';
    } else {
        recordCenter.style.backgroundImage = 'none';
        labelTitle.style.display = 'block';
    }
    
    updateLikeButtonState();
    updateDownloadButtonState();
}

function togglePlay() {
    if (songs.length === 0) return;
    if (isPlaying) {
        pauseSong();
    } else {
        playSong();
    }
}

function playSong() {
    if (!audio.src) return;
    isPlaying = true;
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    record.classList.add('playing');
    audio.play().catch(e => {
        console.error("Playback failed", e);
        pauseSong();
    });
}

function pauseSong() {
    isPlaying = false;
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
    record.classList.remove('playing');
    audio.pause();
}

function prevSong() {
    if (songs.length === 0) return;
    currentSongIndex--;
    if (currentSongIndex < 0) {
        currentSongIndex = songs.length - 1;
    }
    loadSong(currentSongIndex);
    if (isPlaying) playSong();
}

function nextSong() {
    if (songs.length === 0) return;
    currentSongIndex++;
    if (currentSongIndex > songs.length - 1) {
        currentSongIndex = 0;
    }
    loadSong(currentSongIndex);
    if (isPlaying) playSong();
}

function updateProgress(e) {
    const { duration, currentTime } = e.srcElement;
    if (isNaN(duration)) return;
    
    const progressPercent = (currentTime / duration) * 100;
    progressBar.value = progressPercent;
    
    currentTimeEl.textContent = formatTime(currentTime);
    totalTimeEl.textContent = formatTime(duration);
}

function formatTime(time) {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
}

function setProgress(e) {
    if (songs.length === 0) return;
    const duration = audio.duration;
    if (!isNaN(duration)) {
        audio.currentTime = (e.target.value / 100) * duration;
    }
}

function renderPlaylist() {
    playlistContainer.innerHTML = '';
    songs.forEach((song, index) => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.innerHTML = `
            <div class="song-icon" style="${song.image ? `background-image: url('${song.image}'); background-size: cover;` : ''}">
                ${song.image ? '' : '<i class="fas fa-music"></i>'}
            </div>
            <h4 title="${song.title}">${song.title.length > 20 ? song.title.substring(0,20)+'...' : song.title}</h4>
            <p title="${song.artist}">${song.artist.length > 20 ? song.artist.substring(0,20)+'...' : song.artist}</p>
        `;
        card.addEventListener('click', () => {
            currentSongIndex = index;
            loadSong(currentSongIndex);
            playSong();
            navBtns[0].click(); // Navigate to player
        });
        playlistContainer.appendChild(card);
    });
}

// Event Listeners
playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', prevSong);
nextBtn.addEventListener('click', nextSong);
audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('ended', nextSong);
progressBar.addEventListener('input', setProgress);

// Search Feature Listeners
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
            catBtns.forEach(b => b.classList.remove('active'));
            fetchSongs(query);
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                catBtns.forEach(b => b.classList.remove('active'));
                fetchSongs(query);
            }
        }
    });
}

// Favorites Functionality & Event Listeners
function updateLikeButtonState() {
    if (!likeBtn) return;
    if (songs.length === 0 || !songs[currentSongIndex]) {
        likeBtn.style.opacity = '0.3';
        likeBtn.style.pointerEvents = 'none';
        return;
    }
    likeBtn.style.opacity = '1';
    likeBtn.style.pointerEvents = 'auto';
    const currentSong = songs[currentSongIndex];
    const isLiked = likedSongs.some(s => s.id === currentSong.id);
    if (isLiked) {
        likeBtn.innerHTML = '<i class="fas fa-heart" style="color: var(--primary-color);"></i>';
    } else {
        likeBtn.innerHTML = '<i class="far fa-heart"></i>';
    }
}

if (likeBtn) {
    likeBtn.addEventListener('click', () => {
        if (songs.length === 0 || !songs[currentSongIndex]) return;
        const currentSong = songs[currentSongIndex];
        const index = likedSongs.findIndex(s => s.id === currentSong.id);
        if (index !== -1) {
            likedSongs.splice(index, 1);
        } else {
            likedSongs.push(currentSong);
        }
        localStorage.setItem('haadio-liked-songs', JSON.stringify(likedSongs));
        updateLikeButtonState();
        
        // Re-render Favorites if it is open
        if (!sections.favorites.classList.contains('hidden')) {
            renderFavorites();
        }
    });
}

function renderFavorites() {
    if (!favoritesContainer) return;
    favoritesContainer.innerHTML = '';
    if (likedSongs.length === 0) {
        favoritesContainer.innerHTML = '<div style="color: #9ba0a6; width: 100%; text-align: center; padding: 3rem; grid-column: 1 / -1;">No liked songs yet. Go search and like some tracks!</div>';
        return;
    }
    
    likedSongs.forEach((song, index) => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.innerHTML = `
            <div class="song-icon" style="${song.image ? `background-image: url('${song.image}'); background-size: cover;` : ''}">
                ${song.image ? '' : '<i class="fas fa-music"></i>'}
            </div>
            <h4 title="${song.title}">${song.title.length > 20 ? song.title.substring(0,20)+'...' : song.title}</h4>
            <p title="${song.artist}">${song.artist.length > 20 ? song.artist.substring(0,20)+'...' : song.artist}</p>
        `;
        card.addEventListener('click', () => {
            songs = [...likedSongs];
            currentSongIndex = index;
            loadSong(currentSongIndex);
            playSong();
            navBtns[0].click(); // Navigate to player
        });
        favoritesContainer.appendChild(card);
    });
}

// Downloads Functionality & Event Listeners
async function updateDownloadButtonState() {
    if (!downloadBtn) return;
    if (songs.length === 0 || !songs[currentSongIndex]) {
        downloadBtn.style.opacity = '0.3';
        downloadBtn.style.pointerEvents = 'none';
        return;
    }
    downloadBtn.style.opacity = '1';
    downloadBtn.style.pointerEvents = 'auto';
    const currentSong = songs[currentSongIndex];
    const offlineList = await getOfflineSongs();
    const isDownloaded = offlineList.some(s => s.id === currentSong.id);
    if (isDownloaded) {
        downloadBtn.innerHTML = '<i class="fas fa-circle-check" style="color: #2ec4b6;"></i>';
    } else {
        downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
    }
}

if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
        if (songs.length === 0 || !songs[currentSongIndex]) return;
        const song = songs[currentSongIndex];
        
        const offlineList = await getOfflineSongs();
        const isDownloaded = offlineList.some(s => s.id === song.id);
        if (isDownloaded) {
            await deleteOfflineSong(song.id);
            updateDownloadButtonState();
            if (!sections.downloads.classList.contains('hidden')) {
                renderDownloads();
            }
            return;
        }
        
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        downloadBtn.style.pointerEvents = 'none';
        
        try {
            const audioResponse = await fetch(song.url);
            if (!audioResponse.ok) throw new Error('Audio download failed');
            const audioBlob = await audioResponse.blob();
            
            let imageBlob = null;
            if (song.image) {
                try {
                    const imageResponse = await fetch(song.image);
                    if (imageResponse.ok) {
                        imageBlob = await imageResponse.blob();
                    }
                } catch (imgError) {
                    console.warn('Image fetch failed:', imgError);
                }
            }
            
            await saveOfflineSong(song, audioBlob, imageBlob);
            updateDownloadButtonState();
            
            if (!sections.downloads.classList.contains('hidden')) {
                renderDownloads();
            }
        } catch (err) {
            console.error('Download error:', err);
            alert('Failed to download song for offline play.');
        } finally {
            downloadBtn.style.pointerEvents = 'auto';
        }
    });
}

function renderDownloads() {
    if (!downloadsContainer) return;
    downloadsContainer.innerHTML = '';
    getOfflineSongs().then(offlineList => {
        if (offlineList.length === 0) {
            downloadsContainer.innerHTML = '<div style="color: #9ba0a6; width: 100%; text-align: center; padding: 3rem; grid-column: 1 / -1;">No downloaded songs yet. Download some tracks from the player!</div>';
            return;
        }
        
        offlineList.forEach((song, index) => {
            const card = document.createElement('div');
            card.className = 'song-card';
            
            let imgStyle = '';
            if (song.imageBlob) {
                imgStyle = `background-image: url('${URL.createObjectURL(song.imageBlob)}'); background-size: cover;`;
            } else if (song.image) {
                imgStyle = `background-image: url('${song.image}'); background-size: cover;`;
            }
            
            card.innerHTML = `
                <div class="song-icon" style="${imgStyle}">
                    ${song.imageBlob || song.image ? '' : '<i class="fas fa-music"></i>'}
                </div>
                <h4 title="${song.title}">${song.title.length > 20 ? song.title.substring(0,20)+'...' : song.title}</h4>
                <p title="${song.artist}">${song.artist.length > 20 ? song.artist.substring(0,20)+'...' : song.artist}</p>
            `;
            card.addEventListener('click', () => {
                songs = [...offlineList];
                currentSongIndex = index;
                loadSong(currentSongIndex);
                playSong();
                navBtns[0].click(); // Navigate to player
            });
            downloadsContainer.appendChild(card);
        });
    }).catch(err => {
        console.error('Failed to get offline songs:', err);
    });
}

// Initialize database and start player
initDB().then(() => {
    fetchSongs();
}).catch(err => {
    console.error('IndexedDB initialization failed:', err);
    fetchSongs(); // Fallback to fetching anyway
});
