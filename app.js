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
const shuffleBtn = document.getElementById('shuffle-btn');
const repeatBtn = document.getElementById('repeat-btn');

let isShuffle = false;
let repeatMode = 'off'; // 'off', 'all', 'one'

const albumsSection = document.getElementById('albums-section');
const albumsContainer = document.getElementById('albums-container');
const songsSectionTitle = document.getElementById('songs-section-title');

let likedSongs = JSON.parse(localStorage.getItem('haadio-liked-songs')) || [];
let playQueue = [];

function addToQueue(song) {
    playQueue.push(song);
    showToast(`"${song.title}" added to queue`);
}

function showToast(message) {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

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
        const target = btn.getAttribute('data-target');
        
        // Remove active class from all buttons and sync selected target across views
        navBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`.nav-btn[data-target="${target}"]`).forEach(b => b.classList.add('active'));
        
        Object.values(sections).forEach(sec => sec.classList.add('hidden'));
        sections[target].classList.remove('hidden');
        
        if (target === 'favorites') {
            renderLibrary();
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

function mapItunesTrack(track) {
    return {
        id: `itunes-${track.trackId}`,
        title: decodeHTMLEntities(track.trackName) || "Unknown Title",
        artist: decodeHTMLEntities(track.artistName) || "Unknown Artist",
        url: track.previewUrl,
        image: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '500x500bb') : ""
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
    
    const songsEndpoint = `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(searchQuery)}&limit=30`;
    const albumsEndpoint = `https://saavn.sumit.co/api/search/albums?query=${encodeURIComponent(searchQuery)}&limit=12`;
    const itunesEndpoint = `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&media=music&limit=25`;
    
    try {
        const [songsResponse, albumsResponse, itunesResponse] = await Promise.all([
            fetch(songsEndpoint).catch(err => { console.warn(err); return null; }),
            fetch(albumsEndpoint).catch(err => { console.warn(err); return null; }),
            fetch(itunesEndpoint).catch(err => { console.warn(err); return null; })
        ]);

        let localSongs = [];

        if (songsResponse && songsResponse.ok) {
            const songsJson = await songsResponse.json();
            if (songsJson.success && songsJson.data && songsJson.data.results && songsJson.data.results.length > 0) {
                localSongs = songsJson.data.results.map(track => mapAPITrack(track)).filter(song => song.url !== "");
            }
        }

        if (itunesResponse && itunesResponse.ok) {
            const itunesJson = await itunesResponse.json();
            if (itunesJson.results && itunesJson.results.length > 0) {
                const itunesSongs = itunesJson.results.map(track => mapItunesTrack(track)).filter(song => song.url !== "");
                localSongs = [...localSongs, ...itunesSongs];
            }
        }

        const seenIds = new Set();
        songs = localSongs.filter(song => {
            if (seenIds.has(song.id)) return false;
            seenIds.add(song.id);
            return true;
        });

        if (songs.length > 0) {
            initPlayer();
        } else {
            showError("No playable tracks found.");
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
    
    // Set album art on the record center and blurred home background
    let songImg = '';
    if (song.imageBlob) {
        songImg = URL.createObjectURL(song.imageBlob);
    } else if (song.image) {
        songImg = song.image;
    }

    if (songImg) {
        recordCenter.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('${songImg}')`;
        recordCenter.style.backgroundSize = 'cover';
        recordCenter.style.backgroundPosition = 'center';
        labelTitle.style.display = 'block';
    } else {
        recordCenter.style.backgroundImage = 'none';
        labelTitle.style.display = 'block';
    }

    // Dynamic blurred backdrop updates
    const homeBackdrop = document.querySelector('.home-backdrop');
    if (homeBackdrop) {
        if (songImg) {
            homeBackdrop.style.backgroundImage = `url('${songImg}')`;
            homeBackdrop.classList.add('active');
        } else {
            homeBackdrop.style.backgroundImage = 'none';
            homeBackdrop.classList.remove('active');
        }
    }
    
    updateLikeButtonState();
    updateDownloadButtonState();
    updateMediaSession();
}

// Media Session API for background playing and notification control
function updateMediaSession() {
    if ('mediaSession' in navigator && songs[currentSongIndex]) {
        const song = songs[currentSongIndex];
        let artworkUrl = song.image || 'file_000000004ed071fb8190e340809155c9.png';
        if (song.imageBlob) {
            artworkUrl = URL.createObjectURL(song.imageBlob);
        }
        
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: 'Haadio Music',
            artwork: [
                { src: artworkUrl, sizes: '96x96', type: 'image/png' },
                { src: artworkUrl, sizes: '128x128', type: 'image/png' },
                { src: artworkUrl, sizes: '192x192', type: 'image/png' },
                { src: artworkUrl, sizes: '256x256', type: 'image/png' },
                { src: artworkUrl, sizes: '384x384', type: 'image/png' },
                { src: artworkUrl, sizes: '512x512', type: 'image/png' }
            ]
        });
    }
}

function setupMediaSessionHandlers() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
            playSong();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            pauseSong();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            prevSong();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            nextSong();
        });
    }
}

// Initialize handlers
setupMediaSessionHandlers();

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
    audio.play().then(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }
    }).catch(e => {
        console.error("Playback failed", e);
        pauseSong();
    });
}

function pauseSong() {
    isPlaying = false;
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
    record.classList.remove('playing');
    audio.pause();
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = "paused";
    }
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
    
    if (playQueue.length > 0) {
        const nextQueuedSong = playQueue.shift();
        songs.splice(currentSongIndex + 1, 0, nextQueuedSong);
        currentSongIndex++;
        if (sections.playlist && !sections.playlist.classList.contains('hidden')) {
            renderPlaylist();
        }
    } else {
        if (repeatMode === 'one') {
            // Repeat current song: do not change index
        } else if (isShuffle) {
            if (songs.length > 1) {
                let nextIndex = Math.floor(Math.random() * songs.length);
                while (nextIndex === currentSongIndex) {
                    nextIndex = Math.floor(Math.random() * songs.length);
                }
                currentSongIndex = nextIndex;
            }
        } else {
            currentSongIndex++;
            if (currentSongIndex > songs.length - 1) {
                if (repeatMode === 'all') {
                    currentSongIndex = 0;
                } else {
                    currentSongIndex = 0;
                    loadSong(currentSongIndex);
                    pauseSong();
                    return;
                }
            }
        }
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
            <div class="song-details">
                <h4 title="${song.title}">${song.title}</h4>
                <p title="${song.artist}">${song.artist}</p>
            </div>
            <button class="card-queue-btn" title="Add to Queue">
                <i class="fas fa-plus"></i>
            </button>
        `;
        card.addEventListener('click', () => {
            currentSongIndex = index;
            loadSong(currentSongIndex);
            playSong();
            navBtns[0].click(); // Navigate to player
        });
        const queueBtn = card.querySelector('.card-queue-btn');
        if (queueBtn) {
            queueBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addToQueue(song);
            });
        }
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

function updateControlsUI() {
    if (shuffleBtn) {
        if (isShuffle) {
            shuffleBtn.style.color = 'var(--primary-color)';
            shuffleBtn.style.textShadow = '0 0 10px rgba(240, 84, 84, 0.6)';
            shuffleBtn.style.borderColor = 'var(--primary-color)';
        } else {
            shuffleBtn.style.color = 'var(--text-color)';
            shuffleBtn.style.textShadow = 'none';
            shuffleBtn.style.borderColor = 'transparent';
        }
    }
    
    if (repeatBtn) {
        if (repeatMode === 'off') {
            repeatBtn.style.color = 'var(--text-color)';
            repeatBtn.style.textShadow = 'none';
            repeatBtn.style.borderColor = 'transparent';
            repeatBtn.innerHTML = '<i class="fas fa-repeat"></i>';
        } else if (repeatMode === 'all') {
            repeatBtn.style.color = '#30e3ca';
            repeatBtn.style.textShadow = '0 0 10px rgba(48, 227, 202, 0.6)';
            repeatBtn.style.borderColor = '#30e3ca';
            repeatBtn.innerHTML = '<i class="fas fa-repeat"></i>';
        } else if (repeatMode === 'one') {
            repeatBtn.style.color = '#30e3ca';
            repeatBtn.style.textShadow = '0 0 10px rgba(48, 227, 202, 0.6)';
            repeatBtn.style.borderColor = '#30e3ca';
            repeatBtn.innerHTML = '<i class="fas fa-repeat"></i><span style="font-size: 7px; position: absolute; bottom: -2px; right: -2px; font-weight: bold; background: #2a3644; border-radius: 50%; width: 11px; height: 11px; display: flex; align-items: center; justify-content: center; border: 1px solid #30e3ca; color: #30e3ca; font-family: sans-serif;">1</span>';
        }
    }
}

if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
        isShuffle = !isShuffle;
        showToast(isShuffle ? "Shuffle Mode ON" : "Shuffle Mode OFF");
        updateControlsUI();
    });
}

if (repeatBtn) {
    repeatBtn.addEventListener('click', () => {
        if (repeatMode === 'off') {
            repeatMode = 'all';
            showToast("Repeat All ON");
        } else if (repeatMode === 'all') {
            repeatMode = 'one';
            showToast("Repeat One ON");
        } else {
            repeatMode = 'off';
            showToast("Repeat Mode OFF");
        }
        updateControlsUI();
    });
}

updateControlsUI();

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
let customPlaylists = JSON.parse(localStorage.getItem('haadio-playlists')) || [];
let currentActivePlaylistName = null;

// Playlist Modal DOM elements
const playlistModal = document.getElementById('playlist-modal');
const closePlModalBtn = document.getElementById('close-playlist-modal-btn');
const optionsList = document.getElementById('playlist-options-list');

function openPlaylistModal() {
    if (songs.length === 0 || !songs[currentSongIndex]) return;
    const currentSong = songs[currentSongIndex];
    
    if (optionsList) {
        optionsList.innerHTML = '';
        
        // Option 1: Liked Songs
        const isLiked = likedSongs.some(s => s.id === currentSong.id);
        const likedItem = document.createElement('div');
        likedItem.className = `playlist-option-item ${isLiked ? 'active' : ''}`;
        likedItem.innerHTML = `
            <span><i class="fas fa-heart" style="margin-right: 8px; color: ${isLiked ? 'var(--primary-color)' : '#9ba0a6'}"></i> Liked Songs</span>
            ${isLiked ? '<i class="fas fa-check" style="color: var(--primary-color)"></i>' : '<i class="fas fa-plus"></i>'}
        `;
        likedItem.addEventListener('click', () => {
            const index = likedSongs.findIndex(s => s.id === currentSong.id);
            if (index !== -1) {
                likedSongs.splice(index, 1);
            } else {
                likedSongs.push(currentSong);
            }
            localStorage.setItem('haadio-liked-songs', JSON.stringify(likedSongs));
            updateLikeButtonState();
            openPlaylistModal();
            
            if (sections.favorites && !sections.favorites.classList.contains('hidden')) {
                if (currentActivePlaylistName === 'Liked Songs') {
                    renderFavorites();
                } else if (!currentActivePlaylistName) {
                    renderLibrary();
                }
            }
        });
        optionsList.appendChild(likedItem);
        
        // Option 2: Custom Playlists
        customPlaylists.forEach((pl) => {
            const inPlaylist = pl.songs.some(s => s.id === currentSong.id);
            const plItem = document.createElement('div');
            plItem.className = `playlist-option-item ${inPlaylist ? 'active' : ''}`;
            plItem.innerHTML = `
                <span><i class="fas fa-list" style="margin-right: 8px; color: ${inPlaylist ? '#30e3ca' : '#9ba0a6'}"></i> ${pl.name}</span>
                ${inPlaylist ? '<i class="fas fa-check" style="color: #30e3ca"></i>' : '<i class="fas fa-plus"></i>'}
            `;
            plItem.addEventListener('click', () => {
                const songIndex = pl.songs.findIndex(s => s.id === currentSong.id);
                if (songIndex !== -1) {
                    pl.songs.splice(songIndex, 1);
                } else {
                    pl.songs.push(currentSong);
                }
                localStorage.setItem('haadio-playlists', JSON.stringify(customPlaylists));
                openPlaylistModal();
                
                if (sections.favorites && !sections.favorites.classList.contains('hidden')) {
                    if (currentActivePlaylistName === pl.name) {
                        renderFavorites();
                    } else if (!currentActivePlaylistName) {
                        renderLibrary();
                    }
                }
            });
            optionsList.appendChild(plItem);
        });
    }
    
    if (playlistModal) {
        playlistModal.classList.add('show');
    }
}

if (likeBtn) {
    likeBtn.addEventListener('click', openPlaylistModal);
}

if (closePlModalBtn && playlistModal) {
    closePlModalBtn.addEventListener('click', () => {
        playlistModal.classList.remove('show');
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === playlistModal) {
            playlistModal.classList.remove('show');
        }
    });
}

// Library & Playlist views
function renderLibrary() {
    currentActivePlaylistName = null;
    const mainView = document.getElementById('library-main-view');
    const detailView = document.getElementById('library-playlist-detail-view');
    if (mainView && detailView) {
        mainView.classList.remove('hidden');
        detailView.classList.add('hidden');
    }
    
    const playlistsContainer = document.getElementById('library-playlists-container');
    if (!playlistsContainer) return;
    playlistsContainer.innerHTML = '';
    
    // Liked Songs card
    const likedCard = document.createElement('div');
    likedCard.className = 'library-card';
    likedCard.innerHTML = `
        <div class="library-card-icon" style="background: linear-gradient(135deg, #f05454, #e84545);">
            <i class="fas fa-heart"></i>
        </div>
        <h4>Liked Songs</h4>
        <p>${likedSongs.length} songs</p>
    `;
    likedCard.addEventListener('click', () => {
        openPlaylistDetail('Liked Songs');
    });
    playlistsContainer.appendChild(likedCard);
    
    // Custom Playlists
    customPlaylists.forEach((pl, idx) => {
        const card = document.createElement('div');
        card.className = 'library-card';
        card.innerHTML = `
            <button class="delete-playlist-btn" title="Delete playlist" data-index="${idx}">&times;</button>
            <div class="library-card-icon" style="background: linear-gradient(135deg, #30e3ca, #11999e);">
                <i class="fas fa-music"></i>
            </div>
            <h4 title="${pl.name}">${pl.name}</h4>
            <p>${pl.songs.length} songs</p>
        `;
        
        card.querySelector('.delete-playlist-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete "${pl.name}"?`)) {
                customPlaylists.splice(idx, 1);
                localStorage.setItem('haadio-playlists', JSON.stringify(customPlaylists));
                renderLibrary();
            }
        });
        
        card.addEventListener('click', () => {
            openPlaylistDetail(pl.name);
        });
        
        playlistsContainer.appendChild(card);
    });
}

function openPlaylistDetail(playlistName) {
    currentActivePlaylistName = playlistName;
    const mainView = document.getElementById('library-main-view');
    const detailView = document.getElementById('library-playlist-detail-view');
    if (mainView && detailView) {
        mainView.classList.add('hidden');
        detailView.classList.remove('hidden');
    }
    
    const detailTitle = document.getElementById('playlist-detail-title');
    if (detailTitle) detailTitle.textContent = playlistName;
    
    const searchInput = document.getElementById('favorites-search-input');
    if (searchInput) searchInput.value = '';
    
    renderFavorites();
}

const createPlBtn = document.getElementById('create-playlist-btn');
if (createPlBtn) {
    createPlBtn.addEventListener('click', () => {
        const name = prompt("Enter new playlist name:");
        if (name && name.trim()) {
            const playlistName = name.trim();
            if (customPlaylists.some(p => p.name.toLowerCase() === playlistName.toLowerCase())) {
                alert("A playlist with this name already exists!");
                return;
            }
            customPlaylists.push({ name: playlistName, songs: [] });
            localStorage.setItem('haadio-playlists', JSON.stringify(customPlaylists));
            renderLibrary();
        }
    });
}

const plBackBtn = document.getElementById('playlist-back-btn');
if (plBackBtn) {
    plBackBtn.addEventListener('click', () => {
        renderLibrary();
    });
}

function renderFavorites() {
    if (!favoritesContainer) return;
    favoritesContainer.innerHTML = '';
    
    let activeSongsList = [];
    if (currentActivePlaylistName === 'Liked Songs' || !currentActivePlaylistName) {
        activeSongsList = likedSongs;
    } else {
        const found = customPlaylists.find(p => p.name === currentActivePlaylistName);
        activeSongsList = found ? found.songs : [];
    }
    
    const searchVal = document.getElementById('favorites-search-input') ? 
        document.getElementById('favorites-search-input').value.toLowerCase().trim() : '';
        
    const filteredSongs = activeSongsList.filter(song => 
        song.title.toLowerCase().includes(searchVal) || 
        song.artist.toLowerCase().includes(searchVal)
    );

    if (filteredSongs.length === 0) {
        favoritesContainer.innerHTML = `<div style="color: #9ba0a6; width: 100%; text-align: center; padding: 3rem; grid-column: 1 / -1;">
            ${activeSongsList.length === 0 ? "No songs in this playlist yet." : "No matching songs found."}
        </div>`;
        return;
    }
    
    filteredSongs.forEach((song, index) => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.innerHTML = `
            <div class="song-icon" style="${song.image ? `background-image: url('${song.image}'); background-size: cover;` : ''}">
                ${song.image ? '' : '<i class="fas fa-music"></i>'}
            </div>
            <div class="song-details">
                <h4 title="${song.title}">${song.title}</h4>
                <p title="${song.artist}">${song.artist}</p>
            </div>
            <button class="card-queue-btn" title="Add to Queue">
                <i class="fas fa-plus"></i>
            </button>
        `;
        card.addEventListener('click', () => {
            songs = [...filteredSongs];
            currentSongIndex = index;
            loadSong(currentSongIndex);
            playSong();
            navBtns[0].click();
        });
        const queueBtn = card.querySelector('.card-queue-btn');
        if (queueBtn) {
            queueBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addToQueue(song);
            });
        }
        favoritesContainer.appendChild(card);
    });
}

const favSearchInput = document.getElementById('favorites-search-input');
if (favSearchInput) {
    favSearchInput.addEventListener('input', renderFavorites);
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
    
    const searchVal = document.getElementById('downloads-search-input') ? 
        document.getElementById('downloads-search-input').value.toLowerCase().trim() : '';
        
    getOfflineSongs().then(offlineList => {
        const filteredSongs = offlineList.filter(song => 
            song.title.toLowerCase().includes(searchVal) || 
            song.artist.toLowerCase().includes(searchVal)
        );

        if (filteredSongs.length === 0) {
            downloadsContainer.innerHTML = `<div style="color: #9ba0a6; width: 100%; text-align: center; padding: 3rem; grid-column: 1 / -1;">
                ${offlineList.length === 0 ? "No downloaded songs yet. Download some tracks from the player!" : "No matching offline songs found."}
            </div>`;
            return;
        }
        
        filteredSongs.forEach((song, index) => {
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
                <div class="song-details">
                    <h4 title="${song.title}">${song.title}</h4>
                    <p title="${song.artist}">${song.artist}</p>
                </div>
                <button class="card-queue-btn" title="Add to Queue">
                    <i class="fas fa-plus"></i>
                </button>
            `;
            card.addEventListener('click', () => {
                songs = [...filteredSongs];
                currentSongIndex = index;
                loadSong(currentSongIndex);
                playSong();
                navBtns[0].click(); // Navigate to player
            });
            const queueBtn = card.querySelector('.card-queue-btn');
            if (queueBtn) {
                queueBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addToQueue(song);
                });
            }
            downloadsContainer.appendChild(card);
        });
    }).catch(err => {
        console.error('Failed to get offline songs:', err);
    });
}

const dlSearchInput = document.getElementById('downloads-search-input');
if (dlSearchInput) {
    dlSearchInput.addEventListener('input', renderDownloads);
}

// Hard Refresh Button Handler (Clear Cache and Force Reload)
const hardRefreshBtn = document.getElementById('hard-refresh-btn');
if (hardRefreshBtn) {
    hardRefreshBtn.addEventListener('click', async () => {
        const icon = hardRefreshBtn.querySelector('i');
        if (icon) icon.className = 'fas fa-rotate fa-spin';
        
        try {
            // Unregister service workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }
            
            // Delete cache storage caches
            if ('caches' in window) {
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.map(key => caches.delete(key)));
            }
            
            // Perform reload bypassing caches
            window.location.reload(true);
        } catch (e) {
            console.error('Hard refresh clear cache error:', e);
            window.location.reload(true);
        }
    });
}

// Initialize database and start player
initDB().then(() => {
    fetchSongs();
}).catch(err => {
    console.error('IndexedDB initialization failed:', err);
    fetchSongs(); // Fallback to fetching anyway
});
