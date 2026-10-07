/* global CONFIG */
// arc-home.js — the landing page below the hero:
//   · Happening now: CirclePad's round, the newest ArcPad coins, $ARCIRCLE,
//     the relay — numbers roll up the first time they come into view
//   · the utilities grid (the same list as the ∞ panel) and the contracts
//   · the emblem: it tilts toward the pointer (or the phone's tilt), splits
//     into its two rings as the page scrolls, and a spark circles it whenever
//     something new happens on the chain
// Everything that moves is off under "reduce motion".
(function () {
  "use strict";
  if (!document.body.classList.contains("ax-home")) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var EXPL = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://explorer.arc.io";
  function usd(v) {
    if (window.arcFmt) return window.arcFmt.usd(v);
    if (v == null || !isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(a >= 1e5 ? 0 : a >= 1e4 ? 1 : 2) + "K";
    return "$" + v.toFixed(a >= 100 ? 0 : 2);
  }
  var int = function (v) { return Math.round(v).toLocaleString("en-US"); };
  var compact = function (v) { return v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : int(v); };
  var pct = function (v) { return v.toFixed(2) + "%"; };
  var F = window.arcFmt;
  if (F) { usd = F.usd; compact = F.compact; }
  var priceTxt = function (v) { return F ? F.price(v) : "$" + (v < 0.001 ? v.toPrecision(3) : v.toFixed(6)); };
  var ago = function (ts) { var s = Math.max(1, Date.now() / 1000 - ts); return s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; };

  // ================= numbers that roll up once they're seen =================
  var seen = new WeakSet(), want = new Map();
  function put(key, v, fmt) {
    $$('[data-hm-num="' + key + '"]').forEach(function (el) {
      if (v == null || !isFinite(v)) return;
      want.set(el, { v: v, fmt: fmt });
      if (seen.has(el) || reduce || !("IntersectionObserver" in window)) roll(el, v, fmt);
    });
  }
  function roll(el, v, fmt) {
    var from = el.__v == null ? 0 : el.__v;
    el.__v = v;
    if (reduce || from === v) { el.textContent = fmt(v); return; }
    var t0 = performance.now(), D = from === 0 ? 1200 : 800;
    cancelAnimationFrame(el.__raf);
    (function step(t) {
      var k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (v - from) * e);
      if (k < 1) el.__raf = requestAnimationFrame(step);
    })(t0);
    if (from !== 0) { el.classList.remove("hm-tick"); void el.offsetWidth; el.classList.add("hm-tick"); }
  }
  var numIO = "IntersectionObserver" in window ? new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (!en.isIntersecting) return;
      seen.add(en.target); numIO.unobserve(en.target);
      var w = want.get(en.target); if (w) roll(en.target, w.v, w.fmt);
    });
  }, { threshold: 0.4 }) : null;
  if (numIO) $$("[data-hm-num]").forEach(function (el) { numIO.observe(el); });

  // ================= sections appear as they come into view =================
  var revIO = !reduce && "IntersectionObserver" in window ? new IntersectionObserver(function (ents) {
    ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); revIO.unobserve(en.target); } });
  }, { threshold: 0.15 }) : null;
  $$(".hm-sec").forEach(function (s) { if (revIO) { s.classList.add("hm-rv"); revIO.observe(s); } });

  // ================= live data =================
  var last = {};
  function spark() { // something new on the chain: a light circles the emblem once
    if (reduce) return;
    var mark = $(".ax-hero .ax-mark");
    if (!mark) return;
    var s = document.createElement("i");
    s.className = "hm-spark"; s.setAttribute("aria-hidden", "true");
    mark.appendChild(s);
    setTimeout(function () { s.remove(); }, 2600);
  }
  function changed(k, v) { var was = last[k]; last[k] = v; return was != null && v != null && v > was; }
  var roundTo = 0;
  function paintToken(d) {
    if (!d) return;
    if (d.mcap != null) put("mcap", d.mcap, usd);
    var price = $("[data-hm-price]");
    if (price && d.price != null) price.textContent = priceTxt(d.price);
    var chg = $("[data-hm-chg]");
    if (chg && d.change24h != null) { chg.textContent = (d.change24h >= 0 ? "+" : "") + d.change24h.toFixed(2) + "% 24h"; chg.className = "hm-chg " + (d.change24h >= 0 ? "up" : "down"); }
    var b = d.burned && d.burned.pct;
    if (b != null) { put("burned", b, pct); put("burned2", b, pct); var bar = $("[data-hm-burnbar]"); if (bar) bar.style.width = Math.min(100, b) + "%"; }
    var rv = d.revenue || {};
    if (rv.launches != null) { put("launches", rv.launches, int); if (changed("launches", rv.launches)) spark(); }
    var c = rv.circle;
    // Round #1's numbers, until a later round is live (paintRounds takes the card over then)
    if (c && !laterLive) put("raised", c.raised || 0, function (v) { return v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 }); });
    if (b != null && changed("burned", b)) spark();
  }
  // which CirclePad round the hero button and the round card point at (/api/social?circle=rounds):
  // a later round that's live → "Join CirclePad Round #N"; one prepared but not started → "opening soon";
  // otherwise the next round number, "coming soon". Round #1's result stays one tap away.
  var laterLive = false;
  var RT = function (s, n, c) { return tr(s).replace("{n}", n).replace("{c}", c); };
  function paintRounds(d) {
    if (!d || !Array.isArray(d.rounds) || !d.rounds.length) return;
    var last = d.rounds[d.rounds.length - 1], st = last.state || {}, now = Math.floor(Date.now() / 1000);
    var live = !!(last.started && st.started && now < Number(st.deadline));
    var n = live || !last.started ? last.n : last.n + 1;
    if (n < 2) return; // Round #1 still running: the page as it was
    laterLive = last.n >= 2 && last.started; // the card shows that round's raise, not Round #1's
    var raisedOf = function () { var v = Number(BigInt(st.totalRaised || "0") / 10n ** 14n) / 1e4; put("raised", v, function (x) { return x.toLocaleString("en-US", { maximumFractionDigits: x >= 100 ? 0 : 2 }); }); };
    var btn = $("[data-hm-round-btn]"), lbl = $("[data-hm-round-lbl]"), dot = btn && btn.querySelector(".hm-live-dot");
    // 7 Oct 2026: while no round is live, the team's status line (CONFIG.CIRCLEPAD_STATUS) speaks for CirclePad
    var S = !live && typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_STATUS;
    if (S) {
      if (lbl) lbl.textContent = tr(S.btn);
      if (dot) dot.hidden = true;
      var card0 = $(".hm-round"), tag0 = $("[data-hm-round-st]"), go0 = $("[data-hm-round-go]"), rl0 = $("[data-hm-raised-lbl]"), vb0 = $("[data-hm-votes-box]");
      if (tag0) tag0.textContent = tr(S.line);
      if (go0) go0.textContent = tr(S.go);
      if (rl0) rl0.textContent = RT("Round #{c} raised", n, last.n);
      if (vb0) vb0.hidden = true;
      if (card0) { card0.classList.remove("live"); card0.setAttribute("href", S.href || "/circle"); }
      if (laterLive) raisedOf();
      roundTo = 0; tickClock();
      return;
    }
    if (lbl) lbl.textContent = live ? RT("Join CirclePad Round #{n}", n) : !last.started ? RT("CirclePad Round #{n} · Opening soon", n) : RT("CirclePad Round #{n} · Coming soon", n);
    if (dot) dot.hidden = !live;
    var card = $(".hm-round"), tag = $("[data-hm-round-st]"), go = $("[data-hm-round-go]"), rl = $("[data-hm-raised-lbl]"), vb = $("[data-hm-votes-box]");
    if (live && last.n >= 2) {
      if (tag) tag.textContent = RT("CirclePad · Round #{n} live", n);
      if (rl) rl.textContent = RT("Round #{n} raised", n);
      if (vb) vb.hidden = true;
      if (go) go.textContent = tr("Join the round →");
      if (card) { card.classList.add("live"); card.setAttribute("href", "/circle"); }
      raisedOf();
      roundTo = Number(st.deadline) || 0;
    } else {
      var c = n - 1; // the last round that closed
      if (tag) tag.textContent = RT(!last.started ? "CirclePad · Round #{c} complete · Round #{n} opening soon" : "CirclePad · Round #{c} complete · Round #{n} next", n, c);
      if (rl) rl.textContent = RT("Round #{c} raised", n, c);
      if (vb) vb.hidden = c !== 1; // burn-to-vote ran in Round #1
      if (go) go.textContent = RT("See Round #{c}'s result →", n, c);
      if (card) { card.classList.remove("live"); card.setAttribute("href", c === 1 ? "/circle/round/1" : "/circle#projects"); }
      if (laterLive) raisedOf();
      roundTo = 0;
    }
    tickClock();
  }
  function tickClock() {
    var el = $("[data-hm-to]");
    if (!el) return;
    var s = roundTo - Math.floor(Date.now() / 1000);
    if (!roundTo || s <= 0) { el.hidden = true; return; }
    el.hidden = false;
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    el.textContent = (d ? d + "d " : "") + h + "h " + m + "m " + tr("left");
  }
  function paintBurns(j) {
    if (!j || !j.totals) return;
    var t = Number(BigInt(j.totals.burned || "0") / 1000000000000000000n);
    put("votes", t, compact);
    if (changed("votes", t)) spark();
  }
  function paintCoins(j) {
    var ul = $("#hm-coins");
    if (!ul || !j || !Array.isArray(j.coins)) return;
    if (j.count != null) put("launches", j.count, int);
    if (!j.coins.length) { ul.innerHTML = '<li class="hm-coin-empty">' + esc(tr("No coins yet — be the first.")) + ' <a href="/arc#launch">' + esc(tr("Launch one")) + "</a></li>"; return; }
    ul.innerHTML = j.coins.map(function (c, i) {
      var logo = c.image ? '<img src="' + esc(c.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "";
      return '<li style="--i:' + i + '"><a href="/arc#coin/' + esc(c.token) + '"><span class="hm-coin-logo" data-no-i18n>' + logo + "<em>" + esc((c.symbol || "?").slice(0, 1)) + '</em></span><span class="hm-coin-id"><b data-no-i18n>$' + esc(c.symbol || "") + '</b><small data-no-i18n>' + esc(c.name || "") + '</small></span><span class="hm-coin-v"><b data-no-i18n>' + (c.mcapUsd != null ? usd(c.mcapUsd) : "—") + '</b><small data-no-i18n>' + (c.launchedAt ? ago(c.launchedAt) : "") + "</small></span></a></li>";
    }).join("");
  }
  function getJson(u) { return fetch(u, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function load() {
    if (document.hidden) return;
    getJson("/api/social?token=arcircle").then(paintToken);
    getJson("/api/social?circle=rounds").then(paintRounds);
    getJson("/api/social?circle=burns").then(paintBurns);
  }
  function loadCoins() { if (!document.hidden) getJson("/api/c?view=latest&n=3").then(function (j) { if (j && !j.error) paintCoins(j); else { var ul = $("#hm-coins"); if (ul && ul.querySelector(".hm-skel")) ul.innerHTML = '<li class="hm-coin-empty">' + esc(tr("Couldn't reach Arc just now.")) + ' <a href="/arc#explore">' + esc(tr("Open ArcPad")) + "</a></li>"; } }); }
  load(); loadCoins();
  setInterval(load, 30000); setInterval(loadCoins, 60000); setInterval(tickClock, 30000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { load(); loadCoins(); } });

  // ================= utilities =================
  var UTIL_FALLBACK = [
    ["Locker", "Lock any Arc token until a date you pick", "/arc#locker", "#35d8d0"], ["Token Scanner", "Check any Arc token before you buy", "/arc#scanner", "#4d9fff"],
    ["Multisender", "Send a token to many wallets in one go", "/arc#multisend", "#39ff88"], ["Bridge", "Move USDC between Arc and 14 chains", "/arc#bridge", "#ffc861"],
    ["Snapshot", "Every holder of a token at one moment", "/arc#snapshot", "#b58bff"], ["Liquidity", "Pool dashboard, one-coin shapes and LP locks — Arc and Robinhood", "/arc#liquidity", "#39d0ff"],
    ["Relay Launch", "CirclePad round → Argus coin, relayed to holders", "/arc#relay", "#35d8d0"],
  ];
  function paintUtils() {
    var grid = $("#hm-utils-grid");
    if (!grid) return;
    var list = window.arcUtilities && Array.isArray(window.arcUtilities.list) && window.arcUtilities.list.length
      ? window.arcUtilities.list.filter(function (u) { return u.href; }).map(function (u) { return [u.name, u.sub, u.href, u.acc, u.ico || (u.img ? '<img src="' + esc(u.img) + '" alt="" width="32" height="32" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">' : ""), u.status]; })
      : UTIL_FALLBACK;
    grid.innerHTML = list.map(function (u, i) {
      return '<a class="hm-util" href="' + esc(u[2]) + '" style="--acc:' + esc(u[3]) + ";--i:" + i + '"><span class="hm-util-ico">' + (u[4] || "") + '</span><span class="hm-util-t"><b>' + esc(tr(u[0])) + "</b><small>" + esc(tr(u[1])) + "</small></span>" + (u[5] ? '<em>' + esc(tr(u[5])) + "</em>" : "") + '<i class="hm-util-arrow" aria-hidden="true">→</i></a>';
    }).join("");
  }

  // ================= contracts =================
  function paintContracts() {
    var ul = $("#hm-contracts");
    if (!ul || typeof CONFIG === "undefined") return;
    var rows = [
      ["$ARCIRCLE", CONFIG.ARCIRCLE_TOKEN], ["ArcPad factory", CONFIG.ARCPAD_FACTORY_ADDRESS], ["CirclePad escrow (Round #1)", CONFIG.CIRCLEPAD_ESCROW_ADDRESS],
      ["CirclePad burn-to-vote", CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS], ["Creator lock (ArcLock)", CONFIG.ARCLOCK_ADDRESS], ["LP lock", CONFIG.LPLOCK_ADDRESS],
      ["Multisender", CONFIG.MULTISEND_ADDRESS], ["Relay launches (Argus Portal)", CONFIG.ARGUS && CONFIG.ARGUS.PORTAL],
    ].filter(function (r) { return /^0x[0-9a-fA-F]{40}$/.test(r[1] || ""); });
    ul.innerHTML = rows.map(function (r) {
      return '<li><span>' + esc(tr(r[0])) + '</span><a href="' + EXPL + "/address/" + r[1] + '" target="_blank" rel="noopener" data-no-i18n>' + r[1].slice(0, 6) + "…" + r[1].slice(-4) + ' ↗</a><button type="button" class="hm-copy" data-copy="' + r[1] + '" aria-label="' + esc(tr("Copy address")) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg></button></li>';
    }).join("");
    ul.addEventListener("click", function (e) {
      var b = e.target.closest("[data-copy]");
      if (!b) return;
      try { navigator.clipboard.writeText(b.dataset.copy); b.classList.add("ok"); setTimeout(function () { b.classList.remove("ok"); }, 1400); } catch (err) { /* denied */ }
    });
  }

  // ================= the emblem: tilt, split on scroll =================
  var mark = $(".ax-hero .ax-mark");
  if (mark && !reduce) {
    var img = mark.querySelector("img");
    // two clipped copies (blue ring left, green ring right) that drift apart as the hero scrolls away
    var halves = document.createElement("span");
    halves.className = "hm-halves"; halves.setAttribute("aria-hidden", "true");
    halves.innerHTML = '<img class="l" src="' + img.currentSrc + '" alt=""><img class="r" src="' + img.currentSrc + '" alt="">';
    mark.appendChild(halves);
    var rx = 0, ry = 0, tx = 0, ty = 0, raf = 0;
    var apply = function () {
      raf = 0;
      rx += (tx - rx) * 0.12; ry += (ty - ry) * 0.12;
      mark.style.setProperty("--hm-rx", rx.toFixed(2) + "deg");
      mark.style.setProperty("--hm-ry", ry.toFixed(2) + "deg");
      if (Math.abs(tx - rx) > 0.05 || Math.abs(ty - ry) > 0.05) raf = requestAnimationFrame(apply);
    };
    var aim = function (x, y) { tx = -y * 10; ty = x * 14; if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      aim(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    }, { passive: true });
    window.addEventListener("deviceorientation", function (e) {
      if (e.gamma == null || e.beta == null) return;
      aim(Math.max(-1, Math.min(1, e.gamma / 30)) / 2, Math.max(-1, Math.min(1, (e.beta - 45) / 30)) / 2);
    }, { passive: true });
    var hero = $(".ax-hero");
    var onScroll = function () {
      var h = hero.offsetHeight || innerHeight;
      var p = Math.max(0, Math.min(1, scrollY / (h * 0.6)));
      mark.style.setProperty("--hm-split", p.toFixed(3));
      mark.classList.toggle("hm-splitting", p > 0.02);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function boot() { paintUtils(); paintContracts(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  setTimeout(paintUtils, 800); // the ∞ panel's list, once arcircle-hub.js has built it
  document.addEventListener("arc:lang", function () { paintUtils(); paintContracts(); });
})();
