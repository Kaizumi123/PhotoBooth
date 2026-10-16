/* SnapBooth service worker: keep the offline copy current. */
const CACHE = 'snapbooth-v52';
const ASSETS = [
  './',
  './index.html',
  './studio.html',
  './gallery.html',
  './style.css?v=20261016.24',
  './site.js?v=20261016.21',
  './script.js?v=20261016.16',
  './gallery.js?v=20261014.9',
  './gallery-store.js',
  './manifest.json',
  './favicon.svg?v=20261014.9',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key.startsWith('snapbooth-') && key !== CACHE)
        .map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  // Prefer the latest deployed file, then use the offline copy if the network is down.
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        return (await caches.match('./index.html')) || Response.error();
      }
      return Response.error();
    })
  );
});
