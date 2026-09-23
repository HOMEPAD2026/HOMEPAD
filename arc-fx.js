// arc-fx.js — small, dependency-free motion helpers shared by the ARCIRCLE
// PAD pages. Everything respects prefers-reduced-motion.
//   • price flash: any live price / market-cap readout briefly glows green
//     when its number goes up and red when it goes down
//   • confetti: window.arcConfetti() — used after a successful launch
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- price flash ----
  var WATCH = '[data-ac2="price"],[data-ac2="mcap"],[data-arl="price"],[data-arl="mcap"],#apc-price,#apc-mcap,.ap-launch-card .meta span:first-child';
  var last = new WeakMap();
  var SUBS = "₀₁₂₃₄₅₆₇₈₉";
  function toNumber(text) {
    if (!text) return null;
    var t = String(text).replace(/[,\s$]/g, "");
    // Dexscreener-style small prices: 0.0₅4842 → 0.000004842
    t = t.replace(/0\.0([₀-₉]+)(\d+)/, function (_, sub, digits) {
      var n = sub.split("").map(function (c) { return SUBS.indexOf(c); }).join("");
      return "0." + "0".repeat(Number(n)) + digits;
    });
    var m = /(-?\d+(?:\.\d+)?)([KMBT])?/i.exec(t);
    if (!m) return null;
    var v = parseFloat(m[1]);
    var mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || "").toUpperCase()] || 1;
    return v * mult;
  }
  function check(el) {
    var now = toNumber(el.textContent);
    var prev = last.get(el);
    last.set(el, now);
    if (reduce || prev == null || now == null || now === prev) return;
    el.classList.remove("fx-up", "fx-down");
    void el.offsetWidth; // restart the animation
    el.classList.add(now > prev ? "fx-up" : "fx-down");
  }
  function scan(root) {
    if (!root.querySelectorAll) return;
    if (root.matches && root.matches(WATCH)) check(root);
    root.querySelectorAll(WATCH).forEach(check);
  }
  function start() {
    scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var el = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        if (!el) return;
        var hit = el.closest && el.closest(WATCH);
        if (hit) check(hit);
        else m.addedNodes && m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // ---- confetti ----
  window.arcConfetti = function (opts) {
    if (reduce) return;
    opts = opts || {};
    var colors = opts.colors || ["#3f9bff", "#35d8d0", "#39ff88", "#ffc861", "#ffffff"];
    var c = document.createElement("canvas");
    c.className = "fx-confetti";
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    var parts = [];
    var n = opts.count || 160;
    for (var i = 0; i < n; i++) {
      var fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : W + 10, y: H * (0.55 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 9), vy: -(10 + Math.random() * 12),
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 10, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        color: colors[i % colors.length],
      });
    }
    var t0 = performance.now();
    function frame(t) {
      var dt = Math.min(2, (t - (frame.prev || t)) / 16.7); frame.prev = t;
      ctx.clearRect(0, 0, W, H);
      var alive = false;
      parts.forEach(function (p) {
        p.vy += 0.42 * dt; p.vx *= Math.pow(0.99, dt); p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        if (p.y < H + 40) alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - (t - t0) / 4200);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
        ctx.restore();
      });
      if (alive && t - t0 < 4200) requestAnimationFrame(frame);
      else c.remove();
    }
    requestAnimationFrame(frame);
  };
})();
