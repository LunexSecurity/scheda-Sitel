// Page: network first so updates show at once, cache when there is no signal. Other files: cache first.
const CACHE = "scheda-bts-v126";
const FILES = ["./", "index.html", "manifest.json", "jspdf.umd.min.js", "asr-worker.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon.png",
  "fonts/barlow-latin-400-normal.woff2", "fonts/barlow-latin-500-normal.woff2", "fonts/barlow-latin-600-normal.woff2",
  "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("scheda-bts-") && k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    // weak signal in the countryside: after 3 seconds open the saved copy instead of waiting
    const net = fetch(req, { cache: "no-store" }).then(r => { if (r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put("index.html", cl)); } return r; });
    const slow = new Promise(ok => setTimeout(ok, 3000)).then(() => caches.match("index.html"));
    e.respondWith(Promise.race([net.catch(() => caches.match("index.html")), slow.then(hit => hit || net)]).then(r => r || net));
    return;
  }
  // the voice engine is big: keep it once fetched, in a cache that survives updates (the model itself sits in transformers-cache)
  if (new URL(req.url).pathname.includes("/vendor/")) {
    e.respondWith(caches.open("sitel-voce-v1").then(c => c.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
