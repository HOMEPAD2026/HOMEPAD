// arc-arcia-fab.js — ARCIA's floating "Ask ARCIA" button, on every ARCIRCLE PAD page.
// On ArcPad (/arc) her code comes with the tools bundle (arc-lazy.js); everywhere else it's
// arcia.bundle.js, loaded on the first tap into a hidden host, and she opens as the drawer.
// The button sits above the page's floating bars (the quick bar and the dock at the bottom,
// CirclePad's action bar…) so it never covers them, on phones and on desktop alike.
(function () {
  "use strict";
  if (window.arcArciaFab) return;
  var me = document.currentScript && document.currentScript.src;
  var v = (/[?&]v=(\d+)/.exec(me || "") || [])[1] || "";
  var BUNDLE = "/arcia.bundle.js" + (v ? "?v=" + v : "");
  var BARS = ".ax-quick, .ax-dock, .cpx-bar, .asn-sticky";
  var b = null, st = 0, waiters = [], bare = false;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };

  function loadStandalone(cb) {
    waiters.push(cb);
    if (st === 2) return flush();
    if (st === 1) return;
    st = 1;
    if (!document.getElementById("bp-panel-arcia")) {
      var host = document.createElement("section");
      host.id = "bp-panel-arcia"; host.className = "bp-panel aa-host"; host.hidden = true;
      host.setAttribute("data-host", "float");
      document.body.appendChild(host);
    }
    var s = document.createElement("script");
    s.src = BUNDLE;
    s.onload = function () { st = 2; flush(); };
    s.onerror = function () { st = 0; waiters = []; if (b) b.classList.remove("busy"); location.href = "/arc#arcia"; };
    document.body.appendChild(s);
  }
  function flush() { var w = waiters; waiters = []; w.forEach(function (f) { try { f(); } catch (e) { /* keep going */ } }); }
  function ready(cb) {
    if (window.arcArcia && window.arcArcia.open) return cb();
    if (window.arcLazy && document.getElementById("bp-panel-arcia") && !document.querySelector("#bp-panel-arcia[data-host]")) return window.arcLazy.load(cb); // ArcPad
    loadStandalone(cb);
  }

  // above whatever floats at the bottom under the button
  function place() {
    if (!b || b.hidden || bare) return;
    var vw = window.innerWidth, vh = window.innerHeight, mob = vw <= 900;
    var right = mob ? 14 : 20, w = b.offsetWidth || (mob ? 46 : 140);
    var x0 = vw - right - w - 8, x1 = vw - right + 8;
    var lift = 0;
    var els = document.querySelectorAll(BARS);
    for (var i = 0; i < els.length; i++) {
      var el = els[i], cs = getComputedStyle(el);
      if (el.hidden || cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
      var r = el.getBoundingClientRect();
      // phones: anything under the button; desktop: the whole bar line, so the button always sits above it
      if (!r.width || !r.height || (mob && (r.right < x0 || r.left > x1)) || r.top < vh * 0.45 || r.top > vh) continue;
      lift = Math.max(lift, vh - r.top + (mob ? 10 : 14));
    }
    b.style.bottom = lift ? Math.round(lift) + "px" : "";
  }
  var placeSoon = (function () { var t = 0; return function () { clearTimeout(t); t = setTimeout(place, 60); }; })();

  function mount() {
    if (document.querySelector(".aa-fab")) return;
    b = document.createElement("button");
    b.type = "button"; b.className = "aa-fab"; b.setAttribute("aria-label", tr("Ask ARCIA"));
    b.innerHTML = '<img src="/images/arcia-avatar-96.jpg" alt="" width="48" height="48"><i aria-hidden="true"></i><span>' + tr("Ask ARCIA") + "</span>";
    // a page without the site stylesheet (the whitepaper): the button styles itself and opens ARCIA's page
    b.addEventListener("click", function () {
      if (bare) { location.href = "/arc#arcia"; return; }
      b.classList.add("busy");
      ready(function () { b.classList.remove("busy"); if (window.arcArcia && window.arcArcia.open) window.arcArcia.open(); });
    });
    document.body.appendChild(b);
    if (getComputedStyle(b).position !== "fixed") {
      bare = true;
      b.style.cssText = "position:fixed;right:16px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:60;display:flex;align-items:center;gap:8px;padding:5px 14px 5px 5px;border-radius:99px;border:1px solid rgba(91,140,255,.45);background:rgba(8,14,26,.92);color:#eef3f7;font:700 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 24px rgba(63,123,255,.25)";
      var im = b.querySelector("img"); im.style.cssText = "width:36px;height:36px;border-radius:50%;object-fit:cover";
      var dot = b.querySelector("i"); dot.style.cssText = "position:absolute;left:31px;top:5px;width:9px;height:9px;border-radius:50%;background:#39ff88;box-shadow:0 0 0 2px #080e1a";
      if (window.innerWidth <= 900) { b.style.padding = "4px"; b.querySelector("span").style.display = "none"; }
    }
    // on ArcPad's own ARCIA tab the button would only repeat the page
    var sync = function () { var t = location.hash.replace(/^#/, "").split(/[?/]/)[0]; b.hidden = !!document.querySelector("#bp-panel-arcia:not([data-host])") && t === "arcia"; placeSoon(); };
    document.addEventListener("arcpad:tab", function () { setTimeout(sync, 0); });
    window.addEventListener("hashchange", sync);
    window.addEventListener("resize", placeSoon);
    window.addEventListener("orientationchange", placeSoon);
    window.addEventListener("load", function () { setTimeout(place, 400); });
    [300, 1200, 3000, 6000].forEach(function (ms) { setTimeout(place, ms); });
    if ("ResizeObserver" in window) { try { var ro = new ResizeObserver(placeSoon); document.querySelectorAll(BARS).forEach(function (el) { ro.observe(el); }); } catch (e) { /* fine */ } }
    sync();
  }
  window.arcArciaFab = { place: place };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
