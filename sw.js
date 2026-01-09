// Service Worker for Grand Grant Matcher
// Provides caching for faster repeat visits

const CACHE_NAME = 'ggm-cache-v5';

// Static assets to cache on install (small files only)
// Large data files (grants.json, reranked_matches.json, etc.) use network-first
// to prevent blocking service worker install on mobile devices
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/teaser.js'
  // Removed large data files to prevent SW install blocking
];

// Data files use network-first with optional caching
const DATA_FILES = [
  '/data/grants.json',
  '/data/reranked_matches.json',
  '/data/affiliation_dict.json',
  '/data/collaborations.json',
  '/data/matches.json'
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Check if URL is a data file
function isDataFile(pathname) {
  return DATA_FILES.some(file => pathname.endsWith(file));
}

// Fetch: cache-first for static assets, network-first for API and data files
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for API calls (voting backend)
  if (url.origin === 'https://ggm-backend.onrender.com') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Same-origin requests
  if (url.origin === self.location.origin) {
    // Network-first for large data files (stale-while-revalidate pattern)
    if (isDataFile(url.pathname)) {
      event.respondWith(
        fetch(event.request)
          .then(response => {
            // Cache the fresh response for offline use
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, clone);
              });
            }
            return response;
          })
          .catch(() => caches.match(event.request))
      );
      return;
    }

    // Cache-first for static assets
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            // Cache successful responses
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, clone);
              });
            }
            return response;
          });
        })
    );
  }
});
