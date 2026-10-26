const CACHE = 'clock-v6';
const FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './digits.ttf',
  './pen-ring.png',
  './pen-cap.png',
  './pen-body.png',
  './pen-tip.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(FILES.map((f) => c.add(f).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Always ask the network first (skipping the browser's own stored copy),
// and use the saved copy only when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(
    fetch(e.request, sameOrigin ? { cache: 'no-store' } : undefined)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
