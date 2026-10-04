/* Offline shell: the app files are content-hashed, so cache on first fetch and
 * serve from cache afterwards. Everything under content/ is not — bundle.json
 * and the practice topics keep their names from one build to the next — so they
 * are fetched network-first and only fall back to the cached copy when the
 * network is gone. Cache-first there would pin a visitor to whatever content
 * they saw on their first visit, for ever.
 *
 * The version is part of the cache's name and activate drops every other one,
 * so raising it is how a visitor is let out of a cache that has gone bad.
 */
/* The build writes the stamp: a digest of the precached files, so the cache's
   name changes exactly when something in it changes and activate drops the old
   one. It was a hand-raised 'v2', and a hand-raised number is a promise to
   remember — change the icon, forget the number, and every returning visitor
   keeps the old icon out of a cache nothing will ever evict. */
var CACHE = 'creating-__BUILD__';
var PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg'];

/* Only a real answer is worth keeping.
 *
 * This used to keep whatever came back, and that was a trap with no way out. A
 * picture asked for in the moment before its file finished deploying answers
 * 404; the 404 went in the cache; pictures are cache-first; the cache is only
 * ever dropped when its name changes. So one unlucky request left a card grey
 * on that visitor's screen for ever, and no later deploy could reach them. */
function keep(req, res) {
  if (!res || !res.ok || res.status !== 200 || res.type !== 'basic') return;
  caches.open(CACHE).then(function (c) { c.put(req, res); });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  var networkFirst = req.mode === 'navigate' || /\/content\/.*\.json$|index\.html$/.test(req.url);
  if (networkFirst) {
    /* `cache: 'reload'` is the whole point of this branch.
     *
     * A plain fetch() here still goes through the browser's own HTTP cache, and
     * GitHub Pages serves the page with max-age=600 — so "network first" quietly
     * meant "ten-minute-old copy first", and a visitor kept being handed a page
     * that named the previous build's icon and asked for none of the new one.
     * This asks the network for real. The document and the content bundle are
     * the only things fetched this way, so it costs one conditional request.
     *
     * Built from the URL rather than passed the Request: a navigation request
     * cannot be reconstructed with new options and throws if you try. */
    e.respondWith(fetch(req.url, { cache: 'reload', credentials: 'same-origin' }).then(function (res) {
      keep(req, res.clone()); return res;
    }).catch(function () { return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); }); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) { keep(req, res.clone()); return res; });
  }));
});
