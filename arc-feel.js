// arc-feel.js — small moments of feedback on every ARCIRCLE PAD page (styles in arc-polish.css):
//   · stat tiles count up the first time their number arrives (only once they're on screen)
//   · a value that never arrives says so in words, instead of a bare "—"
//   · a successful launch / swap / stake: a light burst (one pooled canvas, ≤ 60 particles, removed when done)
//     and a receipt card that slides in — pages announce it with document "arc:success"
//       detail: { kind: "launch" | "swap" | "stake", rows: [[label, value]…], url }
//   · copying to the clipboard: a check pops beside the button
// Motion is transform / opacity (and one canvas), nothing loops, and all of it is off under prefers-reduced-motion.
(function () {
  "use strict";
  if (window.arcFeel) return;
  var D = document;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  // ---------------- stat tiles count up when their number first arrives ----------------
  var COUNT = ".ap-stat > strong:not(#ap-stat-count):not(#ap-stat-vol), .bp-mini-stat strong";
  var NUM = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/;
  var onScreen = new WeakMap(), waiting = new WeakMap(), watched = new WeakSet();
  var io = !reduce && "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      onScreen.set(e.target, e.isIntersecting);
      if (!e.isIntersecting) return;
      var w = waiting.get(e.target);
      if (w) { waiting.delete(e.target); count(e.target, w); }
    });
  }, { threshold: 0.3 }) : null;
  function count(el, txt) {
    var m = NUM.exec(txt.trim());
    if (!m) return;
    var v = parseFloat(m[2].replace(/,/g, ""));
    if (!(v > 0)) return;
    var dec = (m[2].split(".")[1] || "").length, comma = /,/.test(m[2]) || v >= 1000, t0 = performance.now(), ms = 700;
    var fmt = function (x) { return m[1] + x.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: comma }) + m[3]; };
    el.__feelMine = fmt(0); el.textContent = el.__feelMine;
    (function step(t) {
      if (el.textContent !== el.__feelMine) return; // the page wrote a fresher value: it wins
      var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.__feelMine = k < 1 ? fmt(v * e) : txt;
      el.textContent = el.__feelMine;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function watch(el) {
    if (watched.has(el)) return;
    watched.add(el);
    var had = /\d/.test(el.textContent);
    if (had || !io) return; // already has its number (or no motion): leave it be
    io.observe(el);
    var mo = new MutationObserver(function () {
      var txt = el.textContent;
      if (txt === el.__feelMine || !/\d/.test(txt)) return;
      mo.disconnect();
      if (onScreen.get(el)) count(el, txt); else waiting.set(el, txt);
    });
    mo.observe(el, { childList: true, characterData: true, subtree: true });
  }

  // ---------------- values that never came: say so in words ----------------
  // the home page's small numbers inside a sentence ("— coins launched so far"): a skeleton while they load, then
  // the whole sentence becomes one friendly line (arc-polish.css hides the rest of it)
  var SMALL = [
    [".hm-foot [data-hm-num]", "Coin count is on its way"],
    [".hm-node [data-hm-num]", "Burn total is on its way"],
  ];
  function empties() {
    SMALL.forEach(function (x) {
      [].forEach.call(D.querySelectorAll(x[0]), function (el) {
        if (el.__feelE || el.textContent.trim() !== "—") return;
        el.__feelE = Date.now(); el.classList.add("v9-skel");
        var mo = new MutationObserver(function () { if (el.textContent.trim() !== "—") { el.classList.remove("v9-skel", "pol-empty"); el.removeAttribute("data-empty"); mo.disconnect(); } });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(function () { if (el.textContent.trim() === "—") { el.classList.remove("v9-skel"); el.classList.add("pol-empty"); el.setAttribute("data-empty", tr(x[1])); } }, 6000);
      });
    });
    // a big value v9 gave up on (arc-v9.js pending()): words instead of a faded "—"
    [].forEach.call(D.querySelectorAll(".v9-na:not([data-empty])"), function (el) { el.setAttribute("data-empty", tr("Waiting for Arc")); });
    // v9 lets go of .v9-na when the number arrives; the label goes with it
    [].forEach.call(D.querySelectorAll("[data-empty]:not(.v9-na):not(.pol-empty)"), function (el) { el.removeAttribute("data-empty"); });
    [].forEach.call(D.querySelectorAll(COUNT), watch);
  }

  // ---------------- success: a light burst and a receipt ----------------
  var MAX = 60, pool = [], cv = null, ctx = null, running = false, W = 0, H = 0;
  var COLORS = ["#3a78ff", "#2ba6ff", "#3fe0ef", "#9df3ff", "#ffffff"];
  for (var i = 0; i < MAX; i++) pool.push({ on: false });
  function burst(x, y) {
    if (reduce) return;
    if (!cv) {
      cv = D.createElement("canvas"); cv.className = "pol-burst"; cv.setAttribute("aria-hidden", "true");
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr;
      ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
      D.body.appendChild(cv);
    }
    pool.forEach(function (p, k) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, s = 5 + Math.random() * 7;
      p.on = true; p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.r = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 0.35;
      p.w = 4 + Math.random() * 4; p.h = 6 + Math.random() * 6; p.c = COLORS[k % COLORS.length]; p.life = 0; p.max = 60 + Math.random() * 40;
    });
    if (!running) { running = true; requestAnimationFrame(frame); }
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    var alive = 0;
    pool.forEach(function (p) {
      if (!p.on) return;
      p.life++; p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.life > p.max || p.y > H + 20) { p.on = false; return; }
      alive++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max); ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
      ctx.restore();
    });
    if (alive) requestAnimationFrame(frame);
    else { running = false; cv.remove(); cv = null; ctx = null; }
  }
  var TITLE = { launch: "Coin launched", swap: "Swap complete", stake: "Stake locked" };
  var card = null;
  function receipt(d) {
    if (card) card.remove();
    var rows = (d.rows || []).filter(function (r) { return r && r[1] != null && r[1] !== ""; });
    card = D.createElement("div");
    card.className = "pol-rcpt"; card.setAttribute("role", "status"); card.setAttribute("aria-live", "polite");
    card.innerHTML = '<div class="pol-rcpt-h"><i>' + CHECK + "</i><b>" + esc(tr(TITLE[d.kind] || "Transaction confirmed")) + "</b></div>" +
      (rows.length ? "<dl>" + rows.map(function (r) { return "<dt>" + esc(tr(r[0])) + '</dt><dd data-no-i18n title="' + esc(r[1]) + '">' + esc(r[1]) + "</dd>"; }).join("") + "</dl>" : "") +
      (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(tr("View transaction")) + " ↗</a>" : "") +
      '<button type="button" class="pol-rcpt-x" aria-label="' + esc(tr("Close")) + '">×</button>';
    D.body.appendChild(card);
    var me = card, gone = false;
    var close = function () { if (gone) return; gone = true; me.classList.remove("in"); me.classList.add("out"); setTimeout(function () { me.remove(); if (card === me) card = null; }, reduce ? 0 : 300); };
    me.querySelector(".pol-rcpt-x").addEventListener("click", close);
    var t = setTimeout(close, 8000);
    me.addEventListener("pointerenter", function () { clearTimeout(t); });
    me.addEventListener("pointerleave", function () { clearTimeout(t); t = setTimeout(close, 4000); });
    requestAnimationFrame(function () {
      me.classList.add("in");
      // the coin page's own "coin is born" moment already celebrates a launch on ArcPad
      if (D.querySelector(".coin-birth")) return;
      var r = me.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + 8);
    });
  }
  D.addEventListener("arc:success", function (e) { receipt((e && e.detail) || {}); });

  // ---------------- copied: a check beside the button ----------------
  var tap = { el: null, at: 0 };
  D.addEventListener("pointerdown", function (e) { var b = e.target && e.target.closest && e.target.closest("button, a, [role=button], [data-copy]"); if (b) tap = { el: b, at: Date.now() }; }, true);
  D.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && D.activeElement) tap = { el: D.activeElement, at: Date.now() }; }, true);
  function copied(el) {
    if (!el || !el.getBoundingClientRect || !D.body.contains(el)) return;
    var r = el.getBoundingClientRect();
    if (!r.width) return;
    var c = D.createElement("span");
    c.className = "pol-copy"; c.setAttribute("aria-hidden", "true"); c.innerHTML = CHECK;
    c.style.left = Math.round(Math.min(innerWidth - 16, r.right + 2)) + "px";
    c.style.top = Math.round(Math.max(16, r.top + 2)) + "px";
    D.body.appendChild(c);
    setTimeout(function () { c.remove(); }, reduce ? 1200 : 950);
  }
  var CP = window.Clipboard && window.Clipboard.prototype;
  if (CP && CP.writeText && !CP.__feel) {
    var orig = CP.writeText;
    CP.writeText = function () {
      var el = Date.now() - tap.at < 2000 ? tap.el : null;
      var p = orig.apply(this, arguments);
      if (p && p.then) p.then(function () { copied(el); }, function () { /* the page says it failed */ });
      return p;
    };
    CP.__feel = true;
  }

  function start() {
    empties();
    setInterval(function () { if (!D.hidden) empties(); }, 1500);
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
  window.arcFeel = { success: receipt, burst: burst };
})();
