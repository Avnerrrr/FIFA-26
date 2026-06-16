// FIFA 2026 Hub — service worker
// App shell loads instantly and works offline. index.html is fetched network-first
// when online, so new versions appear on next open with no cache-clearing.
// data.json is ALWAYS fetched fresh from the network when online.
const CACHE = 'fifa2026-hub-v7';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // data.json -> network-first (fresh data when online, cached copy when offline)
  if (url.origin === self.location.origin && url.pathname.endsWith('data.json')) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // player photos + flagcdn flags -> stale-while-revalidate
  const isPhoto = url.origin === self.location.origin && url.pathname.includes('/player-photos/');
  const isFlag = url.hostname.endsWith('flagcdn.com');
  if (isPhoto || isFlag) {
    e.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req).then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // index.html / navigations -> network-first, so a fresh app shell loads
  // whenever you're online (new versions show up on next open, no cache-clearing).
  // Falls back to the cached shell only when offline.
  const isNavigation = req.mode === 'navigate';
  const isShellDoc = url.origin === self.location.origin &&
    (url.pathname.endsWith('/') || url.pathname.endsWith('index.html'));
  if (isNavigation || isShellDoc) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
        }
        return res;
      }).catch(() => caches.match('./index.html').then((m) => m || caches.match('./')))
    );
    return;
  }

  // everything else same-origin -> cache-first, fall back to index.html
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached || fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => caches.match('./index.html'))
      )
    );
  }
});
