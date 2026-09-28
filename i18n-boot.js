// i18n-boot.js — first thing in every bundle: if the visitor reads Korean or Chinese, start
// downloading that dictionary (i18n-ko.js / i18n-zh.js) right away, while the rest of the page's
// code runs. i18n.js (last in the bundle) does the translating; English visitors download nothing.
(function () {
  "use strict";
  var l = "en";
  try {
    var q = /[?&]lang=(en|ko|zh)(?:&|$)/.exec(location.search);
    var nav = (navigator.language || "").toLowerCase();
    l = q ? q[1] : localStorage.getItem("arcircle.lang") || (nav.indexOf("ko") === 0 ? "ko" : nav.indexOf("zh") === 0 ? "zh" : "en");
  } catch (e) { /* default en */ }
  if (l !== "ko" && l !== "zh") return;
  if (l === "zh" && /^\/whitepaper/.test(location.pathname)) return;
  var busy = window.__arcDictLoading || (window.__arcDictLoading = {});
  if (busy[l]) return;
  busy[l] = true;
  var me = document.currentScript && document.currentScript.src;
  var v = (/[?&]v=(\d+)/.exec(me || "") || [])[1] || "";
  var s = document.createElement("script");
  s.src = "/i18n-" + l + ".js" + (v ? "?v=" + v : "");
  s.async = true;
  s.onerror = function () { busy[l] = false; };
  (document.head || document.documentElement).appendChild(s);
})();
