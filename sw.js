const CACHE_NAME = 'numera-shell-v1.1.1';
const ASSETS = [
  './', './index.html',
  './styles.css?v=1.1.1',
  './app.mjs?v=1.1.1',
  './engine.mjs?v=1.1.1',
  './manifest.webmanifest?v=1.1.1',
  './icon-192.png?v=1.1.1',
  './icon-512.png?v=1.1.1'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(ASSETS))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('numera-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const offline = await caches.match('./index.html');
        if (offline) return offline;
      }
      return Response.error();
    }
  })());
});
