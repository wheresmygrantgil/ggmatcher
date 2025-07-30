const CACHE_NAME = 'ggmatcher-static-v1';
const URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/teaser.js',
  '/grants.json',
  '/matches.json',
  '/reranked_matches.json',
  '/assets/wizardoc.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(URLS)));
});
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});
