const CACHE_NAME = 'todo-pwa-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest'
  // opcionálisan:
  // '/icon-192.png',
  // '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request).catch(() => cached);
    })
  );
});