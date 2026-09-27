// sw.js — ARCIRCLE PAD service worker. Deliberately small:
//   pages      network first; the last copy (or offline.html) only when the network is down
//   ?v= files  cache first — the version in the URL changes on every deploy, so they never go stale;
//              older versions of the same file are dropped when a new one is stored
//   /api/*, wallet and chain traffic, other sites: never touched
const CACHE = "arc-sw-1";
const OFFLINE = "/offline.html";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/images/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_vercel/") || url.pathname === "/sw.js") return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); }
        return res;
      }).catch(() => caches.open(CACHE).then((c) => c.match(url.pathname).then((hit) => hit || c.match(OFFLINE))))
    );
    return;
  }
  if (url.searchParams.has("v")) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        c.keys().then((ks) => Promise.all(ks.filter((k) => { const u = new URL(k.url); return u.pathname === url.pathname && u.search !== url.search; }).map((k) => c.delete(k))))
          .then(() => c.put(req, copy));
      }
      return res;
    }))));
  }
});
