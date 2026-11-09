// FinWin service worker: makes the app work offline. Only the app's own files are cached;
// your financial data lives in localStorage and is never sent anywhere.
// The screenshot reader (vendor/ocr) is cached the first time it's used, not up front.
var CACHE = 'finwin-v2';
var FILES = ['./', 'index.html', 'styles.css', 'engine.js', 'statement-parser.js', 'app.js', 'vendor/morphdom.min.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-500-normal.woff2', 'fonts/inter-latin-600-normal.woff2', 'fonts/inter-latin-700-normal.woff2',
  'fonts/fraunces-latin-400-normal.woff2', 'fonts/fraunces-latin-500-normal.woff2', 'fonts/fraunces-latin-600-normal.woff2'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Serve from cache, refresh the cache in the background (so updates arrive on the next visit).
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
