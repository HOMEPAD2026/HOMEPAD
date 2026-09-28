// arc-lazy.js — ArcPad's utilities (arcpad-tools.bundle.js) load the first time one of their tabs
// opens, instead of with every visit. Each utility already starts itself when its panel is active
// at load, so nothing has to be replayed. When the page is idle the file is prefetched, so a later
// click opens instantly.
(function () {
  "use strict";
  if (window.arcLazy) return;
  var TOOLS = ["locker", "bridge", "scanner", "multisend", "snapshot", "relay", "arcia", "liquidity", "omni"];
  var me = document.currentScript && document.currentScript.src;
  var v = (/[?&]v=(\d+)/.exec(me || "") || [])[1] || "";
  var URL_ = "/arcpad-tools.bundle.js" + (v ? "?v=" + v : "");
  var st = 0; // 0 idle · 1 loading · 2 ready
  var waiters = [];
  function load(cb) {
    if (cb) waiters.push(cb);
    if (st === 2) { flush(); return; }
    if (st === 1) return;
    st = 1;
    document.documentElement.classList.add("arc-tools-loading");
    var s = document.createElement("script");
    s.src = URL_;
    s.onload = function () { st = 2; document.documentElement.classList.remove("arc-tools-loading"); flush(); };
    s.onerror = function () { st = 0; document.documentElement.classList.remove("arc-tools-loading"); };
    document.body.appendChild(s);
  }
  function flush() { var w = waiters; waiters = []; w.forEach(function (f) { try { f(); } catch (e) { /* keep going */ } }); }
  var isTool = function (t) { return TOOLS.indexOf(t) >= 0; };
  document.addEventListener("arcpad:tab", function (e) { if (e.detail && isTool(e.detail.tab)) load(); });
  // opened straight on a utility (/arc#scanner?t=…, /arcia → /arc#arcia)
  var first = (location.hash.replace(/^#/, "").split(/[?/]/)[0] || "");
  if (isTool(first)) load();
  else {
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 2500); };
    window.addEventListener("load", function () {
      if (navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ""))) return;
      idle(function () {
        if (st) return;
        var l = document.createElement("link");
        l.rel = "prefetch"; l.as = "script"; l.href = URL_;
        document.head.appendChild(l);
      }, { timeout: 6000 });
    });
  }
  window.arcLazy = { load: load, ready: function () { return st === 2; } };

  // ARCIA over any ArcPad page: a small floating button; her chat opens in a drawer
  // (arc-arcia.js lives in the tools bundle, loaded on the first tap)
  function arciaFab() {
    if (!document.getElementById("bp-panel-arcia") || document.querySelector(".aa-fab")) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "aa-fab"; b.setAttribute("aria-label", "Ask ARCIA");
    b.innerHTML = '<img src="/images/arcia-avatar-96.jpg" alt="" width="48" height="48"><i aria-hidden="true"></i><span>Ask ARCIA</span>';
    b.addEventListener("click", function () {
      b.classList.add("busy");
      load(function () { b.classList.remove("busy"); if (window.arcArcia && window.arcArcia.open) window.arcArcia.open(); });
    });
    document.body.appendChild(b);
    var sync = function () { var t = location.hash.replace(/^#/, "").split(/[?/]/)[0]; b.hidden = t === "arcia"; };
    document.addEventListener("arcpad:tab", function () { setTimeout(sync, 0); });
    window.addEventListener("hashchange", sync);
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arciaFab); else arciaFab();
})();
