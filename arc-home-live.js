// arc-home-live.js — the landing page's live line under the title:
// ArcPad launches so far · $ARCIRCLE market cap · CirclePad's raise, from the
// shared /api/social?token=arcircle answer (edge-cached, refreshed every 30s).
// Numbers roll smoothly from their old value to the new one.
(function () {
  "use strict";
  var bar = document.getElementById("ax-livebar");
  if (!bar || !window.fetch) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var el = function (k) { return bar.querySelector('[data-lb="' + k + '"]'); };
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  function usd(v) {
    if (v == null || !isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(a >= 1e5 ? 0 : a >= 1e4 ? 1 : 2) + "K";
    return "$" + v.toFixed(a >= 100 ? 0 : 2);
  }
  var int = function (v) { return Math.round(v).toLocaleString("en-US"); };
  // roll a number from what it shows now to v
  function roll(node, v, fmt) {
    if (!node || v == null || !isFinite(v)) return;
    var from = node.__v;
    node.__v = v;
    if (from == null || from === v || reduce) { node.textContent = fmt(v); if (from != null && from !== v) flash(node); return; }
    var t0 = performance.now(), D = 900;
    cancelAnimationFrame(node.__raf);
    var step = function (t) {
      var k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(from + (v - from) * e);
      if (k < 1) node.__raf = requestAnimationFrame(step);
    };
    node.__raf = requestAnimationFrame(step);
    flash(node);
  }
  function flash(node) { node.classList.remove("ax-lb-tick"); void node.offsetWidth; node.classList.add("ax-lb-tick"); }
  function paint(d) {
    var rv = (d && d.revenue) || {};
    if (rv.launches != null) roll(el("launches"), rv.launches, int);
    if (d && d.mcap != null) roll(el("mcap"), d.mcap, usd);
    var c = rv.circle, box = el("circle");
    if (box) {
      if (c && c.started) { box.parentNode.classList.remove("soon"); roll(box, c.raised || 0, usd); el("circle-lbl").textContent = tr("raised"); }
      else { box.parentNode.classList.add("soon"); box.textContent = tr("Opening soon"); box.__v = null; el("circle-lbl").textContent = ""; }
    }
    bar.classList.add("ready");
  }
  function load() {
    if (document.hidden) return;
    fetch("/api/social?token=arcircle").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && !d.error) paint(d); }).catch(function () {});
  }
  load();
  setInterval(load, 30000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
})();
