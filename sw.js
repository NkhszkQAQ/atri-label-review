const CACHE = 'atri-label-review-shell-v1';
const FILES = ['./', './index.html', './styles.css', './theme.js', './app.js', './logic.mjs'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('atri-label-review-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin || new URL(event.request.url).pathname.endsWith('/dataset.enc')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(cached => cached || Response.error())));
});
