// Service Worker for Riichi Tracker - Offline-first caching
const CACHE_NAME = 'riichi-tracker-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/Mahjong.html',
  '/Mahjong-cheatsheet.html',
  '/404.html',
  '/app.js',
  '/styles.css',
  '/scoresheet.css',
  '/manifest.json',
  '/riichi/score.js',
  '/riichi/yaku.js',
  '/riichi/tiles.js',
  '/riichi/fu.js',
  '/riichi/decompose.js',
  // Fonts
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
  // Tailwind CDN
  'https://cdn.tailwindcss.com'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { credentials: 'omit' })))
        .catch(err => console.warn('SW: Some assets failed to cache:', err));
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - stale-while-revalidate for navigation, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (except fonts/CDN)
  if (url.origin !== location.origin &&
      !url.hostname.includes('fonts.googleapis.com') &&
      !url.hostname.includes('fonts.gstatic.com') &&
      !url.hostname.includes('cdn.tailwindcss.com')) {
    return;
  }

  // Navigation requests - network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful navigations
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Static assets - cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Background sync for future enhancements
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-scores') {
    event.waitUntil(syncScores());
  }
});

async function syncScores() {
  // Placeholder for future IndexedDB -> server sync
  console.log('SW: Background sync triggered');
}