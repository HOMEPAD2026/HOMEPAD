// sw.js — ARCIRCLE PAD service worker. Deliberately small:
//   pages      network first; the last copy (or offline.html) only when the network is down
//   ?v= files  cache first — the version in the URL changes on every deploy, so they never go stale;
//              older versions of the same file are dropped when a new one is stored
//   /api/*, wallet and chain traffic, other sites: never touched
//   push       v4: ARCIRCLE Orders notifications (fills, stops, price alerts), a tap opens the market
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
// v4 (ARCIRCLE Orders): Web Push — a fill, a triggered stop or a price alert from the executor (api/_webpush.mjs).
// Only same-site paths open on a tap.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const url = typeof d.url === "string" && d.url.startsWith("/") && !d.url.startsWith("//") ? d.url : "/arc#orders";
  e.waitUntil(self.registration.showNotification(String(d.title || "ARCIRCLE Orders").slice(0, 120), {
    body: String(d.body || "").slice(0, 300), icon: "/images/icon-192.png", badge: "/images/icon-192.png", tag: d.tag ? String(d.tag).slice(0, 80) : undefined, renotify: !!d.tag, data: { url },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/arc#orders";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const hit = cs.find((c) => new URL(c.url).origin === location.origin);
    if (hit) { hit.focus(); return hit.navigate ? hit.navigate(url).catch(() => null) : null; }
    return self.clients.openWindow(url);
  }));
});
