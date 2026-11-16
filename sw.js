const PREFIX = `gyoza-${new URL(self.registration.scope).pathname}-`;
const CACHE = `${PREFIX}v2`;
const ROOT = self.registration.scope;
const SHELL = new URL('./index.html', ROOT).href;
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './pwa.js',
  './assets/site.css', './assets/lucide.min.js',
  './assets/icons/gyoza-180.png', './assets/icons/gyoza-192.png',
  './assets/icons/gyoza-512.png', './assets/icons/gyoza-maskable-512.png'
].map(path => new URL(path, ROOT).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!request.url.startsWith(ROOT) || url.origin !== self.location.origin) return;

  // Show the latest page online; fall back to the saved home page offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(SHELL)));
    return;
  }
  if (ASSETS.includes(request.url)) {
    event.respondWith(caches.open(CACHE).then(async cache =>
      (await cache.match(request)) || fetch(request)));
  }
});
