const C = 'bodycare-v6';
const V = '?v=6';
const F = [
  './', 'index.html', 'style.css' + V, 'js/app.js' + V, 'js/analyze.js' + V, 'js/db.js' + V,
  'vendor/html5-qrcode.min.js' + V, 'data/us-products.json' + V, 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png', 'icon.ico'
];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  // cache: 'reload' skips the browser's 10-minute HTTP cache, so a new version never stores old files.
  e.waitUntil(caches.open(C).then((c) => Promise.all(F.map((u) =>
    fetch(new Request(u, { cache: 'reload' })).then((r) => { if (r.ok) return c.put(u, r); }).catch(() => {})
  ))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'VERSION' && e.ports && e.ports[0]) e.ports[0].postMessage({ version: C });
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // product data and OCR files are never cached here
  if (/\.(png|ico|svg)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request)));
    return;
  }
  // Network first, always asking the server for a fresh copy; the saved copy is only for offline use.
  const fresh = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(
    fresh.then((r) => {
      if (r && r.ok) { const copy = r.clone(); caches.open(C).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((m) => m || caches.match(e.request, { ignoreSearch: true })).then((m) => m || caches.match('./index.html')))
  );
});
