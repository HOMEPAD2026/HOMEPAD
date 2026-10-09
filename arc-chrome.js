// arc-chrome.js — the shared top-bar pieces every page gets:
//   · product switcher (desktop): ArcPad · CirclePad · $ARCIRCLE · Relay · Stats
//   · alerts bell: new ArcPad coins, the CirclePad round clock, relay launches and site news.
//     What counts as "new" is remembered in this browser only (localStorage, optional).
//   · service worker registration (sw.js) so the site installs as an app and opens offline.
(function () {
  "use strict";
  if (window.arcChrome) return;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var F = window.arcFmt || { ago: function (t) { var s = Math.max(1, Date.now() / 1000 - t); return s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; }, usd: function (v) { return "$" + Math.round(v); } };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  var now = function () { return Math.floor(Date.now() / 1000); };
  var path = (location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/").replace(/^\/arcpad$/, "/arc").replace(/^\/circlepad$/, "/circle");

  // ---------- product switcher ----------
  var PRODUCTS = [["ArcPad", "/arc"], ["CirclePad", "/circle"], ["$ARCIRCLE", "/arcircle"], ["Relay", "/relay"], ["Stats", "/stats"]];
  function switcher(host) {
    if (host.querySelector(".ps")) return;
    var hash = location.hash;
    var nav = document.createElement("nav");
    nav.className = "ps";
    nav.setAttribute("aria-label", "Products");
    nav.innerHTML = PRODUCTS.map(function (p) {
      var on = p[1] === "/relay" ? path === "/arc" && /^#relay/.test(hash) : p[1] === "/arc" ? path === "/arc" && !/^#relay/.test(hash) : path === p[1] || path.indexOf(p[1] + "/") === 0;
      return '<a href="' + p[1] + '"' + (on ? ' aria-current="page" class="on"' : "") + (p[0] === "$ARCIRCLE" ? " data-no-i18n" : "") + ">" + esc(p[0] === "Stats" ? tr("Stats") : p[0]) + "</a>";
    }).join("");
    var brand = host.querySelector(".ax-brand");
    if (brand) brand.insertAdjacentElement("afterend", nav);
  }

  // ---------- alerts ----------
  var SEEN = "arc-nb-seen";
  var NEWS = [
    { id: "news:pages", ts: 1790496000, t: "New: My ARCIRCLE, Stats, Roadmap and site search", s: "Look up any wallet, or press Ctrl/⌘K anywhere", href: "/me" },
    { id: "news:relay", ts: 1790488800, t: "Relay Launch is in Utilities", s: "Every CirclePad coin relayed to contributors and $ARCIRCLE holders", href: "/relay" },
  ];
  var items = [], btn, panel, open = false, loaded = false;
  // v10: "Mine" — what the wallet this browser last connected can claim, or has to act on (arc-v10.js)
  var mine = [], tab = "", mineAt = 0;
  function gatherMine() {
    var V = window.arcV10, a = V && V.account && V.account();
    if (!a || !V.claims) { mine = []; return Promise.resolve(); }
    if (Date.now() - mineAt < 60000) return Promise.resolve();
    mineAt = Date.now();
    return V.claims(a).then(function (rows) {
      mine = rows.filter(function (r) { return r.ready || r.warn; }).map(function (r) {
        return { k: r.warn ? "lock" : "claim", t: r.t, s: r.v, href: r.href };
      });
      paint();
    }).catch(function () { /* later */ });
  }
  var seenAt = function () { var v = Number(store.get(SEEN)); return v > 0 ? v : now() - 3 * 86400; };
  function gather() {
    var tasks = [
      fetch("/api/c?view=latest&n=5").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch("/api/social?token=arcircle").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    ];
    return Promise.all(tasks).then(function (r) {
      var out = NEWS.slice();
      var latest = r[0], tok = r[1];
      if (latest && Array.isArray(latest.coins)) latest.coins.forEach(function (c) {
        if (!c || !c.token || !c.launchedAt) return;
        out.push({ id: "coin:" + c.token, ts: c.launchedAt, k: "coin", t: tr("New coin on ArcPad") + ": $" + c.symbol, s: c.name + (c.mcapUsd != null ? " · " + F.usd(c.mcapUsd) : ""), href: "/arc#coin/" + c.token, raw: true });
      });
      var c = tok && tok.revenue && tok.revenue.circle;
      if (c && c.deadline) {
        var left = c.deadline - now();
        if (c.open && left > 0 && left < 86400) out.push({ id: "round1:24h", ts: c.deadline - 86400, k: "round", t: "CirclePad Round #1 closes within 24 hours", s: tr("Raised so far") + ": " + (F.num ? F.num(c.raised || 0, 2) : c.raised) + " USDC", href: "/circle" });
        if (left <= 0) out.push({ id: "round1:closed", ts: c.deadline, k: "round", t: "CirclePad Round #1 has closed", s: "See the results and the winning coin", href: "/circle/round/1" });
      }
      var rounds = (window.CONFIG && CONFIG.RELAY && CONFIG.RELAY.ROUNDS) || [];
      rounds.forEach(function (rd) {
        if (!rd.launch || !rd.launch.token) return;
        var at = rd.launch.at ? Math.floor(Date.parse(rd.launch.at) / 1000) : 0;
        out.push({ id: "relay:" + rd.n, ts: at || now(), k: "relay", t: "Relay N" + rd.n + " is live", s: rd.launch.symbol ? "$" + rd.launch.symbol : "", href: "/relay", raw: true });
      });
      out.sort(function (a, b) { return b.ts - a.ts; });
      items = out.slice(0, 12);
      loaded = true;
      paint();
    });
  }
  function unread() { var s = seenAt(); return items.filter(function (i) { return i.ts > s; }).length; }
  function paint() {
    if (!btn) return;
    var n = unread() + mine.length;
    var badge = btn.querySelector(".nb-n");
    badge.textContent = n > 9 ? "9+" : String(n);
    badge.hidden = !n;
    btn.setAttribute("aria-label", tr("Alerts") + (n ? " (" + n + ")" : ""));
    if (open) list();
  }
  function tabs() {
    var t = panel.querySelector(".v10-ntabs");
    if (!t) {
      t = document.createElement("div");
      t.className = "v10-ntabs"; t.setAttribute("role", "tablist");
      t.innerHTML = '<button type="button" role="tab" data-nt="mine"></button><button type="button" role="tab" data-nt="all"></button>';
      panel.querySelector(".nb-h").insertAdjacentElement("afterend", t);
      t.addEventListener("click", function (e) { var b = e.target.closest("[data-nt]"); if (!b) return; e.stopPropagation(); tab = b.getAttribute("data-nt"); list(); });
    }
    t.querySelector('[data-nt="mine"]').textContent = tr("For you") + (mine.length ? " (" + mine.length + ")" : "");
    t.querySelector('[data-nt="all"]').textContent = tr("All");
    [].forEach.call(t.querySelectorAll("[data-nt]"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-nt") === tab ? "true" : "false"); });
  }
  function list() {
    if (!tab) tab = mine.length ? "mine" : "all";
    tabs();
    var s = Number(panel.getAttribute("data-seen")) || seenAt();
    var ul = panel.querySelector(".nb-list");
    if (tab === "mine") {
      var V = window.arcV10, a = V && V.account && V.account();
      if (!a) { ul.innerHTML = '<li class="nb-none">' + esc(tr("Connect a wallet on ArcPad and your rewards, claims and lock dates show up here.")) + ' <a href="/arc#staking">' + esc(tr("Open Staking")) + " →</a></li>"; return; }
      if (!mine.length) { ul.innerHTML = '<li class="nb-none">' + esc(tr("Nothing to claim right now.")) + ' <a href="/me?w=' + esc(a) + '">' + esc(tr("My ARCIRCLE")) + " →</a></li>"; return; }
      ul.innerHTML = mine.map(function (i) {
        return '<li class="nb-i nb-' + i.k + ' new"><a href="' + esc(i.href) + '"><i aria-hidden="true"></i><span><b>' + esc(i.t) + '</b><small data-no-i18n>' + esc(i.s) + "</small></span></a></li>";
      }).join("") + '<li class="nb-none"><a href="/me?w=' + esc(a) + '">' + esc(tr("Everything to claim, in one place")) + " →</a></li>";
      return;
    }
    if (!loaded) { ul.innerHTML = '<li class="nb-none">' + esc(tr("Loading…")) + "</li>"; return; }
    if (!items.length) { ul.innerHTML = '<li class="nb-none">' + esc(tr("Nothing new yet.")) + "</li>"; return; }
    ul.innerHTML = items.map(function (i) {
      return '<li class="nb-i nb-' + (i.k || "news") + (i.ts > s ? " new" : "") + '"><a href="' + esc(i.href) + '"><i aria-hidden="true"></i><span><b' + (i.raw ? " data-no-i18n" : "") + ">" + esc(i.raw ? i.t : tr(i.t)) + "</b><small" + (i.raw ? " data-no-i18n" : "") + ">" + esc(i.raw ? i.s : tr(i.s)) + '</small></span><em data-no-i18n>' + esc(F.ago(i.ts)) + "</em></a></li>";
    }).join("");
  }
  function toggle(force) {
    open = force == null ? !open : force;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      panel.setAttribute("data-seen", String(seenAt()));
      panel.querySelector(".nb-h b").textContent = tr("Alerts");
      list();
      if (!loaded) gather();
      gatherMine();
      store.set(SEEN, String(now()));
      paint();
    }
  }
  function bell(host) {
    if (host.querySelector(".nb-btn")) return;
    var wrap = document.createElement("div");
    wrap.className = "nb";
    wrap.innerHTML = '<button type="button" class="nb-btn" aria-haspopup="true" aria-expanded="false" aria-label="Alerts">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg><span class="nb-n" hidden>0</span></button>' +
      '<div class="nb-panel" hidden><div class="nb-h"><b>Alerts</b><a href="/roadmap">' + esc(tr("Roadmap")) + ' →</a></div><ul class="nb-list"></ul></div>';
    var search = host.querySelector(".ck-btn");
    if (search) search.insertAdjacentElement("afterend", wrap);
    else { var cta = host.querySelector(".bp-chain-pill, .ax-top-right, .ax-top-cta"); if (cta) host.insertBefore(wrap, cta); else host.appendChild(wrap); }
    btn = wrap.querySelector(".nb-btn");
    panel = wrap.querySelector(".nb-panel");
    btn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener("click", function (e) { if (open && !wrap.contains(e.target)) toggle(false); });
    document.addEventListener("keydown", function (e) { if (open && e.key === "Escape") { toggle(false); btn.focus(); } });
  }

  // One order on every page's top bar: [search] [alerts] [language] [page action / wallet].
  // On ArcPad / CirclePad phones the bar floats over the "Home ▾" row, so that row is told how
  // much room the right-hand group takes (--bp-right) and never runs underneath it.
  function tidy(head) {
    var lang = head.querySelector(":scope > .lang-toggle");
    var nb = head.querySelector(":scope > .nb");
    if (lang && nb) nb.insertAdjacentElement("afterend", lang);
    if (!head.matches(".bp-topbar-right")) return;
    var root = document.documentElement;
    var fit = function () { root.style.setProperty("--bp-right", Math.ceil(head.getBoundingClientRect().width + 26) + "px"); };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(head);
    window.addEventListener("resize", fit);
  }
  function init() {
    var top = document.querySelector("header.ax-top");
    var head = document.querySelector(".bp-topbar-right") || top;
    if (top) switcher(top);
    if (head) {
      bell(head);
      tidy(head);
      setTimeout(gather, 2500);
      setTimeout(gatherMine, 3500);
      document.addEventListener("arc:v10acct", function () { mineAt = 0; gatherMine(); });
      setInterval(function () { if (!document.hidden) { gather(); gatherMine(); } }, 180000);
    }
  }
  // search (arc-cmdk.js) adds its button on DOMContentLoaded too; wait a tick so the bell sits after it
  var go = function () { setTimeout(init, 0); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();

  // ---------- installable app ----------
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () { /* unsupported */ }); });
  }

  window.arcChrome = { refresh: gather };
})();
