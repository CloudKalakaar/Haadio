let songs = [];
let displayedSongs = [];
let wakeLock = null;
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
    // Only show "Loading..." in the player screen if no song is currently loaded
    if (!audio.src) {
        trackTitle.textContent = "Loading Songs...";
        trackArtist.textContent = "Please wait";
    }
    playlistContainer.innerHTML = '<div style="color: #fff; width: 100%; text-align: center; padding: 2rem;">Loading amazing tracks...</div>';
    
    if (albumsSection) albumsSection.classList.add('hidden');
    if (songsSectionTitle) songsSectionTitle.style.display = 'none';

    let searchQuery = category;
    if (category === "trending") {
        searchQuery = "latest kannada";
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
        const newSongs = localSongs.filter(song => {
            if (seenIds.has(song.id)) return false;
            seenIds.add(song.id);
            return true;
        });

        if (newSongs.length > 0) {
            displayedSongs = newSongs;
            renderPlaylist();
            
            // Only load these songs into the active player if there isn't one already loaded/playing
            if (!audio.src) {
                songs = [...displayedSongs];
                currentSongIndex = 0;
                loadSong(currentSongIndex);
                progressBar.value = 0;
                currentTimeEl.textContent = "0:00";
                totalTimeEl.textContent = "0:00";
                pauseSong();
            }
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

// Screen Wake Lock & Prefetch API Helpers
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock acquired successfully.');
    } catch (err) {
        console.warn(`Wake Lock failed: ${err.message}`);
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().then(() => {
            wakeLock = null;
            console.log('Wake Lock released.');
        });
    }
}

// Handle wake lock reacquisition if document visibility changes
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        if (isPlaying) {
            await requestWakeLock();
        }
    }
});

let preloaderAudio = null;
function prefetchNextSong() {
    if (songs.length <= 1) return;
    const nextIndex = (currentSongIndex + 1) % songs.length;
    const nextSong = songs[nextIndex];
    if (nextSong && !nextSong.audioBlob && !nextSong.prefetched && nextSong.url) {
        try {
            if (!preloaderAudio) {
                preloaderAudio = document.createElement('audio');
            }
            preloaderAudio.src = nextSong.url;
            preloaderAudio.preload = 'auto';
            nextSong.prefetched = true;
            console.log(`Pre-fetching next song: ${nextSong.title}`);
        } catch (e) {
            console.warn("Pre-fetch failed", e);
        }
    }
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
    prefetchNextSong();
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
        requestWakeLock();
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
    releaseWakeLock();
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
    displayedSongs.forEach((song, index) => {
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
            songs = [...displayedSongs]; // Promote browsed/searched list to active play queue
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

function utf8ToBase64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
        return String.fromCharCode(parseInt(p1, 16));
    }));
}

function base64ToUtf8(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str), function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

const plShareBtn = document.getElementById('playlist-share-btn');
if (plShareBtn) {
    plShareBtn.addEventListener('click', () => {
        const name = currentActivePlaylistName;
        let songsToShare = [];
        if (name === 'Liked Songs' || !name) {
            songsToShare = likedSongs;
        } else {
            const found = customPlaylists.find(p => p.name === name);
            songsToShare = found ? found.songs : [];
        }

        if (songsToShare.length === 0) {
            showToast("Cannot share an empty playlist!");
            return;
        }

        try {
            const minifiedSongs = songsToShare.map(s => ({
                i: s.id,
                t: s.title,
                a: s.artist,
                u: s.url,
                im: s.image
            }));

            const playlistData = {
                n: name === 'Liked Songs' ? 'Shared Liked Songs' : name,
                s: minifiedSongs
            };

            const jsonString = JSON.stringify(playlistData);
            const base64String = utf8ToBase64(jsonString);

            const shareUrl = window.location.origin + window.location.pathname + '?import=' + base64String;
            const shareText = `Check out my playlist "${playlistData.n}" on Haadio! 🎵\n\n${shareUrl}`;
            
            const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
            window.open(whatsappUrl, '_blank');
        } catch (err) {
            console.error("Failed to generate sharing URL:", err);
            showToast("Failed to share playlist.");
        }
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
            displayedSongs = [...filteredSongs];
            renderPlaylist();
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

// ==================== RETRO DJ BOT FUNCTIONALITY ====================
const k1 = 'gsk_';
const k2 = 'Ps7Aou';
const k3 = 'VDgKZK5FVxpOp';
const k4 = 'bWGdyb3';
const k5 = 'FYid9galuidjP';
const k6 = 'yIOEUqT';
const k7 = 'qe8IhI';
const GROK_API_KEY = k1 + k2 + k3 + k4 + k5 + k6 + k7;

const botSVGs = {
    boy: `
      <svg viewBox="0 0 32 32" width="100%" height="100%" style="image-rendering: pixelated; overflow: visible;">
        <!-- Cap -->
        <rect x="8" y="4" width="16" height="4" fill="#f05454"/>
        <rect x="7" y="5" width="18" height="3" fill="#f05454"/>
        <rect x="5" y="6" width="3" height="2" fill="#f05454"/>
        <!-- Hair -->
        <rect x="8" y="8" width="16" height="3" fill="#30e3ca"/>
        <rect x="7" y="9" width="2" height="4" fill="#30e3ca"/>
        <rect x="23" y="9" width="2" height="4" fill="#30e3ca"/>
        <!-- Face -->
        <rect x="9" y="11" width="14" height="9" fill="#ffdbac"/>
        <rect x="11" y="14" width="2" height="2" fill="#111"/>
        <rect x="19" y="14" width="2" height="2" fill="#111"/>
        <rect x="9" y="16" width="2" height="1" fill="#ff8b8b"/>
        <rect x="21" y="16" width="2" height="1" fill="#ff8b8b"/>
        <rect x="14" y="17" width="4" height="1" fill="#111"/>
        <!-- Headphones -->
        <rect x="6" y="10" width="3" height="7" fill="#1e222a" rx="1"/>
        <rect x="23" y="10" width="3" height="7" fill="#1e222a" rx="1"/>
        <path d="M 7 10 Q 16 2 25 10" stroke="#1e222a" stroke-width="2" fill="none"/>
        <!-- Body/Shirt -->
        <rect x="10" y="20" width="12" height="12" fill="#2a3644"/>
        <rect x="14" y="20" width="4" height="2" fill="#ffdbac"/>
        <!-- Left Hand -->
        <rect x="7" y="21" width="3" height="6" fill="#2a3644"/>
        <rect x="7" y="27" width="3" height="2" fill="#ffdbac"/>
        <!-- Right Hand (Waving) -->
        <g class="bot-waving-hand">
          <rect x="22" y="16" width="3" height="6" fill="#2a3644"/>
          <rect x="22" y="14" width="3" height="2" fill="#ffdbac"/>
        </g>
      </svg>
    `,
    girl: `
      <svg viewBox="0 0 32 32" width="100%" height="100%" style="image-rendering: pixelated; overflow: visible;">
        <!-- Hair (Pink/Purple) -->
        <rect x="8" y="4" width="16" height="6" fill="#ff6b81"/>
        <rect x="6" y="8" width="20" height="4" fill="#ff6b81"/>
        <rect x="5" y="10" width="4" height="10" fill="#ff6b81"/>
        <rect x="23" y="10" width="4" height="10" fill="#ff6b81"/>
        <!-- Headband / Headphone Band -->
        <path d="M 7 9 Q 16 3 25 9" stroke="#ffd31d" stroke-width="2" fill="none"/>
        <!-- Face -->
        <rect x="9" y="10" width="14" height="10" fill="#ffe0bd"/>
        <rect x="10" y="12" width="5" height="3" fill="#111"/>
        <rect x="17" y="12" width="5" height="3" fill="#111"/>
        <rect x="15" y="13" width="2" height="1" fill="#111"/>
        <rect x="9" y="16" width="2" height="1" fill="#ff8b8b"/>
        <rect x="21" y="16" width="2" height="1" fill="#ff8b8b"/>
        <rect x="15" y="17" width="2" height="1" fill="#111"/>
        <!-- Headphones Cup (yellow) -->
        <rect x="4" y="9" width="3" height="7" fill="#ffd31d" rx="1"/>
        <rect x="25" y="9" width="3" height="7" fill="#ffd31d" rx="1"/>
        <!-- Body/Shirt -->
        <rect x="10" y="20" width="12" height="12" fill="#e84545"/>
        <rect x="13" y="20" width="6" height="3" fill="#ffe0bd"/>
        <!-- Left Hand -->
        <rect x="7" y="21" width="3" height="6" fill="#e84545"/>
        <rect x="7" y="27" width="3" height="2" fill="#ffe0bd"/>
        <!-- Right Hand (Waving) -->
        <g class="bot-waving-hand">
          <rect x="22" y="16" width="3" height="6" fill="#e84545"/>
          <rect x="22" y="14" width="3" height="2" fill="#ffe0bd"/>
        </g>
      </svg>
    `
};

const botFaceOnly = {
    boy: `
      <svg viewBox="0 0 32 20" width="48" height="30" style="image-rendering: pixelated; display: block; margin: auto;">
        <rect x="8" y="0" width="16" height="4" fill="#f05454"/>
        <rect x="7" y="1" width="18" height="3" fill="#f05454"/>
        <rect x="8" y="4" width="16" height="3" fill="#30e3ca"/>
        <rect x="9" y="7" width="14" height="9" fill="#ffdbac"/>
        <rect x="11" y="9" width="2" height="2" fill="#111"/>
        <rect x="19" y="9" width="2" height="2" fill="#111"/>
        <rect x="6" y="6" width="3" height="7" fill="#1e222a" rx="1"/>
        <rect x="23" y="6" width="3" height="7" fill="#1e222a" rx="1"/>
      </svg>
    `,
    girl: `
      <svg viewBox="0 0 32 20" width="48" height="30" style="image-rendering: pixelated; display: block; margin: auto;">
        <rect x="8" y="0" width="16" height="6" fill="#ff6b81"/>
        <rect x="9" y="6" width="14" height="10" fill="#ffe0bd"/>
        <rect x="10" y="8" width="5" height="3" fill="#111"/>
        <rect x="17" y="8" width="5" height="3" fill="#111"/>
        <rect x="15" y="9" width="2" height="1" fill="#111"/>
        <rect x="4" y="5" width="3" height="7" fill="#ffd31d" rx="1"/>
        <rect x="25" y="5" width="3" height="7" fill="#ffd31d" rx="1"/>
      </svg>
    `
};

let botSelectedChar = localStorage.getItem('haadio-bot-char') || '';
let botUserName = localStorage.getItem('haadio-user-name') || '';

function initRetroBot() {
    const container = document.getElementById('retro-bot-container');
    const spriteDiv = document.getElementById('bot-character-sprite');
    const chatbox = document.getElementById('bot-chatbox');
    if (!container || !spriteDiv || !chatbox) return;

    function positionBotContainer() {
        const header = document.querySelector('.header');
        const refreshBtn = document.getElementById('hard-refresh-btn');
        const playerWrapper = document.querySelector('.player-wrapper');
        if (window.innerWidth <= 500) {
            if (header && refreshBtn && container.parentNode !== header) {
                header.insertBefore(container, refreshBtn);
            }
        } else {
            if (playerWrapper && container.parentNode !== playerWrapper) {
                playerWrapper.insertBefore(container, playerWrapper.firstChild);
            }
        }
    }

    positionBotContainer();
    window.addEventListener('resize', positionBotContainer);

    if (botSelectedChar) {
        spriteDiv.innerHTML = botSVGs[botSelectedChar];
        renderChatboxMainView();
    } else {
        spriteDiv.innerHTML = botSVGs['boy'];
        renderChatboxSetupView();
        // Auto-reveal on startup if setup is not done yet!
        setTimeout(() => {
            if (container.classList.contains('hiding')) {
                container.classList.remove('hiding');
                container.classList.add('revealed');
                chatbox.classList.add('show');
            }
        }, 800);
    }

    spriteDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        if (container.classList.contains('hiding')) {
            container.classList.remove('hiding');
            container.classList.add('revealed');
            chatbox.classList.add('show');
            
            if (botSelectedChar && botUserName) {
                const name = botSelectedChar === 'girl' ? 'Shruti' : 'Naad';
                appendBotMessage(`Yo ${botUserName}! Ready to pump some tunes? What is your mood today? 🎧`);
            }
        } else {
            closeBotChat();
        }
    });

    // Monitor app-wide search inputs so character peeks up higher and "watches"
    setTimeout(() => {
        const appInputs = [
            document.getElementById('search-input'),
            document.getElementById('favorites-search-input'),
            document.getElementById('downloads-search-input')
        ];

        appInputs.forEach(inputEl => {
            if (inputEl) {
                const handleFocus = () => {
                    if (container.classList.contains('hiding')) {
                        container.classList.add('user-typing-app');
                    }
                };
                const handleBlur = () => {
                    container.classList.remove('user-typing-app');
                };

                inputEl.addEventListener('focus', handleFocus);
                inputEl.addEventListener('input', handleFocus);
                inputEl.addEventListener('blur', handleBlur);
            }
        });
    }, 1200);
}

function closeBotChat() {
    const container = document.getElementById('retro-bot-container');
    const chatbox = document.getElementById('bot-chatbox');
    if (container && chatbox) {
        container.classList.remove('revealed');
        container.classList.add('hiding');
        chatbox.classList.remove('show');
    }
}

function renderChatboxSetupView() {
    const chatbox = document.getElementById('bot-chatbox');
    if (!chatbox) return;

    chatbox.innerHTML = `
        <div class="bot-setup-view">
            <h4>Select DJ Buddy</h4>
            <div class="bot-char-select">
                <div class="bot-char-option selected" data-char="boy">
                    ${botFaceOnly.boy}
                    <span class="bot-char-label">Naad</span>
                </div>
                <div class="bot-char-option" data-char="girl">
                    ${botFaceOnly.girl}
                    <span class="bot-char-label">Shruti</span>
                </div>
            </div>
            <h4>Your Name</h4>
            <input type="text" id="bot-name-input" class="bot-chat-input" placeholder="e.g. Retro Kid" style="width: 100%; box-sizing: border-box; margin-bottom: 5px;">
            <button id="bot-save-btn" class="bot-setup-btn">Let's Jam! ⚡</button>
        </div>
    `;

    const options = chatbox.querySelectorAll('.bot-char-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            const character = opt.getAttribute('data-char');
            const spriteDiv = document.getElementById('bot-character-sprite');
            if (spriteDiv) spriteDiv.innerHTML = botSVGs[character];
        });
    });

    const saveBtn = chatbox.querySelector('#bot-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const selectedOpt = chatbox.querySelector('.bot-char-option.selected');
            const nameInput = chatbox.querySelector('#bot-name-input');
            const character = selectedOpt ? selectedOpt.getAttribute('data-char') : 'boy';
            const username = nameInput ? nameInput.value.trim() : 'Guest';

            if (!username) {
                alert("Please enter a name!");
                return;
            }

            botSelectedChar = character;
            botUserName = username;

            localStorage.setItem('haadio-bot-char', character);
            localStorage.setItem('haadio-user-name', username);

            renderChatboxMainView();
            const botName = character === 'girl' ? 'Luna' : 'Ryder';
            appendBotMessage(`Awesome! I'm DJ ${botName}. Nice to meet you, ${username}! What kind of music mood are we in today? 🎵`);
        });
    }
}

function renderChatboxMainView() {
    const chatbox = document.getElementById('bot-chatbox');
    if (!chatbox) return;

    const botName = botSelectedChar === 'girl' ? 'Shruti' : 'Naad';

    chatbox.innerHTML = `
        <div class="bot-chat-header">
            <span class="bot-chat-title">DJ ${botName}</span>
            <button class="bot-chat-close" id="bot-close-btn">&times;</button>
        </div>
        <div class="bot-chat-messages" id="bot-messages-box">
            <!-- Messages inserted here -->
        </div>
        <div class="bot-chat-input-row">
            <input type="text" id="bot-chat-input" class="bot-chat-input" placeholder="Type mood (e.g. sad, happy, chill)...">
            <button id="bot-send-btn" class="bot-chat-send">GO</button>
        </div>
    `;

    chatbox.querySelector('#bot-close-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        closeBotChat();
    });

    const input = chatbox.querySelector('#bot-chat-input');
    const sendBtn = chatbox.querySelector('#bot-send-btn');

    const botMoodCache = {};

    const handleSend = () => {
        const query = input.value.trim();
        if (!query) return;

        const cleanQuery = query.toLowerCase().trim();
        appendUserMessage(query);
        input.value = '';

        const botName = botSelectedChar === 'girl' ? 'Shruti' : 'Naad';

        if (botMoodCache[cleanQuery]) {
            const cached = botMoodCache[cleanQuery];
            appendBotMessage(cached.message);
            
            if (cached.songsList && cached.songsList.length > 0) {
                songs = [...cached.songsList];
                displayedSongs = [...cached.songsList];
                renderPlaylist();
                
                const idx = songs.findIndex(s => s.id === cached.playSongId);
                currentSongIndex = idx !== -1 ? idx : 0;
                loadSong(currentSongIndex);
                playSong();
                
                const tracksNavBtn = document.querySelector('.nav-btn[data-target="playlist"]');
                if (tracksNavBtn) {
                    tracksNavBtn.click();
                }
                
                showToast(`DJ ${botName} replays: ${songs[currentSongIndex].title}`);
            }
            return;
        }

        const loader = appendBotMessage("Searching vinyl racks... 💿");

        queryGrokDJ(query).then(response => {
            if (loader) loader.remove();

            appendBotMessage(response.message);

            if (response.playSongId) {
                const idx = songs.findIndex(s => s.id === response.playSongId);
                if (idx !== -1) {
                    currentSongIndex = idx;
                    loadSong(currentSongIndex);
                    playSong();
                    showToast(`DJ ${botName} plays: ${songs[idx].title}`);
                    
                    botMoodCache[cleanQuery] = {
                        message: response.message,
                        playSongId: response.playSongId,
                        songsList: [...songs]
                    };
                }
            } else if (response.queueSongId) {
                const song = songs.find(s => s.id === response.queueSongId);
                if (song) {
                    addToQueue(song);
                    showToast(`Added to Queue: ${song.title}`);
                }
            }

            if (response.searchQuery) {
                const globalSearch = document.getElementById('search-input');
                if (globalSearch) {
                    globalSearch.value = response.searchQuery;
                }
                if (typeof catBtns !== 'undefined') {
                    catBtns.forEach(b => b.classList.remove('active'));
                }
                const tracksNavBtn = document.querySelector('.nav-btn[data-target="playlist"]');
                if (tracksNavBtn) {
                    tracksNavBtn.click();
                }
                fetchSongs(response.searchQuery).then(() => {
                    if (displayedSongs.length > 0) {
                        songs = [...displayedSongs];
                        currentSongIndex = 0;
                        loadSong(currentSongIndex);
                        playSong();
                        showToast(`DJ ${botName} plays: ${songs[0].title}`);
                        
                        botMoodCache[cleanQuery] = {
                            message: response.message,
                            playSongId: songs[0].id,
                            songsList: [...songs]
                        };
                    }
                }).catch(err => {
                    console.error("Bot search failed:", err);
                });
            }
        });
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    let typingTimeout;
    input.addEventListener('focus', () => {
        const container = document.getElementById('retro-bot-container');
        if (container) container.classList.add('is-typing');
    });
    input.addEventListener('blur', () => {
        const container = document.getElementById('retro-bot-container');
        if (container) container.classList.remove('is-typing');
    });
    input.addEventListener('input', () => {
        const container = document.getElementById('retro-bot-container');
        if (container) {
            container.classList.add('is-typing');
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                container.classList.remove('is-typing');
            }, 1500);
        }
    });
}

function appendBotMessage(text) {
    const box = document.getElementById('bot-messages-box');
    if (!box) return null;

    const msg = document.createElement('div');
    msg.className = 'bot-message bot';
    msg.textContent = text;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
    return msg;
}

function appendUserMessage(text) {
    const box = document.getElementById('bot-messages-box');
    if (!box) return;

    const msg = document.createElement('div');
    msg.className = 'bot-message user';
    msg.textContent = text;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
}

function localMoodFallback(userMessage) {
    const text = userMessage.toLowerCase();
    const botName = botSelectedChar === 'girl' ? 'Shruti' : 'Naad';
    const slang = ["Tubular!", "Radical!", "Chill out!", "Pump it up!", "Yo!", "Wicked!", "Awesome!", "Totally choice!"];
    const randomSlang = () => slang[Math.floor(Math.random() * slang.length)];

    let reply = {
        message: `${randomSlang()} Let's spin some tracks, homey!`,
        playSongId: "",
        queueSongId: "",
        searchQuery: ""
    };

    // 1. Transliterated Kannada keyword matching
    if (text.includes('haadu') || text.includes('hadu') || text.includes('hadugalu') || text.includes('haadugalu') || text.includes('kannada') || text.includes('haaku') || text.includes('haku') || text.includes('beku')) {
        reply.message = `${randomSlang()} Let's spin some sweet Kannada tunes!`;
        reply.searchQuery = "Kannada";
        return reply;
    }

    // 1. Match direct song titles or artists from the app's tracklist
    const matchedSong = songs.find(s => 
        text.includes(s.title.toLowerCase()) || text.includes(s.artist.toLowerCase())
    );

    if (matchedSong) {
        reply.playSongId = matchedSong.id;
        reply.message = `Radical! "${matchedSong.title}" is a total classic. Playing it now, homey!`;
        return reply;
    }

    // 2. Keyword matching for moods/genres
    if (text.includes('happy') || text.includes('party') || text.includes('beat') || text.includes('dance') || text.includes('groove') || text.includes('upbeat')) {
        reply.message = `${randomSlang()} You want to groove? Let's turn up the beat!`;
        const energetic = songs.find(s => 
            s.title.toLowerCase().includes('dance') || 
            s.title.toLowerCase().includes('party') || 
            s.title.toLowerCase().includes('beat') ||
            s.title.toLowerCase().includes('happy')
        ) || songs[0];
        if (energetic) reply.playSongId = energetic.id;
    } else if (text.includes('sad') || text.includes('cry') || text.includes('pain') || text.includes('alone') || text.includes('slow') || text.includes('quiet')) {
        reply.message = "Yo, I feel you. Let's chill out with a smooth, comforting tune.";
        const mellow = songs.find(s => 
            s.title.toLowerCase().includes('sad') || 
            s.title.toLowerCase().includes('quiet') || 
            s.title.toLowerCase().includes('slow') || 
            s.title.toLowerCase().includes('love')
        ) || songs[1] || songs[0];
        if (mellow) reply.playSongId = mellow.id;
    } else if (text.includes('relax') || text.includes('chill') || text.includes('study') || text.includes('sleep') || text.includes('lofi')) {
        reply.message = "Chill out time. Lay back and let this wave wash over you.";
        const relax = songs.find(s => 
            s.title.toLowerCase().includes('chill') || 
            s.title.toLowerCase().includes('relax') || 
            s.title.toLowerCase().includes('study')
        ) || songs[2] || songs[0];
        if (relax) reply.playSongId = relax.id;
    } else {
        // 3. Fallback search query based on longest words in the input
        const words = text.split(/\s+/).filter(w => w.length > 3 && !['what', 'your', 'about', 'some', 'song', 'play', 'find', 'mood'].includes(w));
        if (words.length > 0) {
            reply.searchQuery = words[0];
            reply.message = `Tubular! Let's search the deck for "${words[0]}"!`;
        } else {
            reply.message = `Wicked! I'm DJ ${botName}. Tell me your mood or genre, and I'll spin the perfect tape!`;
        }
    }

    return reply;
}

async function queryGrokDJ(userMessage) {
    const availableSongs = songs.map(s => ({
        id: s.id,
        title: s.title,
        artist: s.artist
    }));

    const botName = botSelectedChar === 'girl' ? 'Shruti' : 'Naad';
    const systemPrompt = `You are DJ ${botName}, a retro-themed AI Music DJ for the PWA player 'Haadio'. You talk in retro-gaming 80s/90s slang (words like "Tubular!", "Radical!", "Chill out", "Pump it up!", "Yo!", "Wicked!").
Chat with the user about their music tastes or mood, and recommend a song or action.

CRITICAL: The user may speak in Kannada written using the English alphabet (transliterated Kannada / Manglish, e.g., "yaavdadru chennagiro haadu haaku", "hadu play madi", "kannada melody beku", "sad songs beku") or in Kannada script. You MUST fully understand their intent. If they request a specific mood, genre, or artist in Kannada, extract the search query or match it to a song.
For example:
- "haadu haaku" means "play a song".
- "kannada haadugalu" means "Kannada songs".
- "chennagiro" means "good".
- "melodious" or "melody" means smooth/mellow tunes.
- "beku" means "want/need".
Always respond in your retro DJ slang in English.

You MUST respond strictly in a valid JSON object format containing EXACTLY the following keys (do not include any other markdown formatting or text outside of the JSON object):
{
  "message": "your retro response here",
  "playSongId": "exact string ID of a song to play immediately (leave blank if not applicable)",
  "queueSongId": "exact string ID of a song to queue (leave blank if not applicable)",
  "searchQuery": "search query to filter songs list in the app (leave blank if not applicable)"
}

Here are the songs currently available in the player's active list:
${JSON.stringify(availableSongs)}

Rules:
1. If the user mentions a mood or genre that relates to one of the songs, choose the matching song and set its ID in "playSongId" (to play immediately) or "queueSongId" (to play next). Give a short retro explanation in the message.
2. If there are no direct matches but some words could help find songs (e.g. user asks for "romantic" or "kannada"), set the search word in "searchQuery" to filter the player.
3. Keep the chat message under 2 sentences.`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                response_format: { type: "json_object" },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error("Invalid response format from Grok API");
        }

        let contentStr = data.choices[0].message.content.trim();
        if (contentStr.startsWith('```json')) {
            contentStr = contentStr.substring(7);
        }
        if (contentStr.endsWith('```')) {
            contentStr = contentStr.substring(0, contentStr.length - 3);
        }
        
        return JSON.parse(contentStr.trim());
    } catch (e) {
        console.warn("Grok DJ API request failed, falling back to local analyzer:", e);
        return localMoodFallback(userMessage);
    }
}

function showImportModal(playlistName, songsList) {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'import-playlist-modal';
    modal.style.zIndex = '9999';
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    
    let songsHtml = '';
    songsList.forEach(song => {
        songsHtml += `
            <div class="song-card" style="pointer-events: none; margin-bottom: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; display: flex; align-items: center; gap: 12px;">
                <div class="song-icon" style="width: 36px; height: 36px; border-radius: 6px; flex-shrink: 0; background-color: rgba(255,255,255,0.05); ${song.image ? `background-image: url('${song.image}'); background-size: cover; background-position: center;` : ''}">
                    ${song.image ? '' : '<i class="fas fa-music" style="color: var(--accent); font-size: 0.9rem;"></i>'}
                </div>
                <div class="song-details" style="text-align: left; flex: 1; min-width: 0;">
                    <h4 style="margin: 0; font-size: 0.9rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.title}</h4>
                    <p style="margin: 3px 0 0 0; font-size: 0.75rem; color: #9ba0a6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${song.artist}</p>
                </div>
            </div>
        `;
    });
    
    modal.innerHTML = `
        <div class="modal-content" style="max-height: 85vh; display: flex; flex-direction: column; width: 90%; max-width: 450px; background: rgba(30, 34, 42, 0.95); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 40px rgba(0,0,0,0.5); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 16px; padding: 20px;">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="background: linear-gradient(135deg, #25d366, #128c7e); width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; color: white;">
                        <i class="fab fa-whatsapp"></i>
                    </div>
                    <div style="text-align: left;">
                        <h3 style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600;">Import Playlist</h3>
                        <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: #9ba0a6;">Received via WhatsApp</p>
                    </div>
                </div>
                <button class="close-modal" id="close-import-btn" style="background: none; border: none; color: #9ba0a6; font-size: 1.6rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">&times;</button>
            </div>
            
            <div style="text-align: left; margin-bottom: 15px;">
                <label style="font-size: 0.8rem; color: #9ba0a6; display: block; margin-bottom: 6px; font-weight: 500;">Playlist Name</label>
                <input type="text" id="import-playlist-name-input" value="${playlistName}" style="width: 100%; padding: 10px 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-size: 0.9rem; box-sizing: border-box; outline: none; transition: border-color 0.2s;">
            </div>

            <div class="playlist-preview-list" style="flex: 1; overflow-y: auto; margin-bottom: 20px; padding-right: 5px; max-height: 220px; display: flex; flex-direction: column; gap: 8px;">
                ${songsHtml}
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <button class="cat-btn" id="import-play-btn" style="background: var(--primary-color); border: none; font-weight: 600; padding: 10px; border-radius: 8px; color: white; cursor: pointer;"><i class="fas fa-play"></i> Play Now</button>
                <button class="cat-btn" id="import-save-btn" style="background: #30e3ca; color: #1e222a; border: none; font-weight: 600; padding: 10px; border-radius: 8px; cursor: pointer;"><i class="fas fa-bookmark"></i> Save Playlist</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const cleanUrl = () => {
        const url = new URL(window.location);
        url.searchParams.delete('import');
        window.history.replaceState({}, document.title, url.pathname + url.search);
    };

    const closeModal = () => {
        modal.classList.remove('show');
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
        setTimeout(() => modal.remove(), 300);
        cleanUrl();
    };

    modal.querySelector('#close-import-btn').addEventListener('click', closeModal);

    modal.querySelector('#import-play-btn').addEventListener('click', () => {
        songs = [...songsList];
        displayedSongs = [...songsList];
        renderPlaylist();
        currentSongIndex = 0;
        loadSong(currentSongIndex);
        playSong();
        closeModal();
        navBtns[0].click();
        showToast(`Playing shared playlist "${playlistName}"`);
    });

    modal.querySelector('#import-save-btn').addEventListener('click', () => {
        const finalName = modal.querySelector('#import-playlist-name-input').value.trim() || playlistName;
        
        let nameToUse = finalName;
        let count = 1;
        while (customPlaylists.some(p => p.name.toLowerCase() === nameToUse.toLowerCase())) {
            nameToUse = `${finalName} (${count})`;
            count++;
        }

        customPlaylists.push({ name: nameToUse, songs: songsList });
        localStorage.setItem('haadio-playlists', JSON.stringify(customPlaylists));
        renderLibrary();
        
        closeModal();
        showToast(`Saved "${nameToUse}" to your Library!`);
    });
}

function checkImportUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const importData = urlParams.get('import');
    if (importData) {
        try {
            const decodedJson = base64ToUtf8(importData);
            const playlistData = JSON.parse(decodedJson);
            if (playlistData && playlistData.n && Array.isArray(playlistData.s)) {
                const importedSongs = playlistData.s.map(s => ({
                    id: s.i,
                    title: s.t,
                    artist: s.a,
                    url: s.u,
                    image: s.im
                }));
                
                setTimeout(() => {
                    showImportModal(playlistData.n, importedSongs);
                }, 800);
            }
        } catch (e) {
            console.error("Failed to parse import URL", e);
            showToast("Failed to load shared playlist link.");
        }
    }
}

// Initialize database and start player
initDB().then(() => {
    fetchSongs();
    checkImportUrl();
    initRetroBot();
}).catch(err => {
    console.error('IndexedDB initialization failed:', err);
    fetchSongs();
    checkImportUrl();
    initRetroBot();
});
