// world-shell.js — the frame around ARCIRCLE World on a computer when Settings → Screen is "Window" or "Mobile" (b416).
// play.html decides (window.__arcShell) before anything else runs; this page then draws only the bar and the frame,
// and the game runs inside it (play.html?frame=window|mobile):
//   window  a 16:9 window, up to 1280 wide, in the middle of the page
//   mobile  the phone layout (980 wide, 19.5:9), scaled to fit the height; the mouse works its stick and buttons,
//           and the keyboard works as on a computer
// The bar switches between Full screen, Window and Mobile (localStorage "arc.world.view"; the page reloads).
(function () {
  "use strict";
  var V = window.__arcShell; if (!V) return;
  var lang = (document.documentElement.getAttribute("lang") || "en").slice(0, 2);
  try { lang = localStorage.getItem("arcircle.lang") || lang; } catch (e) { /* private */ }
  var T = { ko: { full: "전체 화면", window: "창 모드", mobile: "모바일", bar: "화면" }, zh: { full: "全屏", window: "窗口", mobile: "手机", bar: "画面" }, en: { full: "Full screen", window: "Window", mobile: "Mobile", bar: "Screen" } }[lang === "ko" || lang === "zh" ? lang : "en"];
  var PHONE_W = 980, PHONE_H = Math.round(980 * 19.5 / 9), BAR = 56;
  var css = ".wp-shell{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;background:radial-gradient(70% 60% at 50% 0%,rgba(63,155,255,.16),transparent 70%),#04070e;font-family:Sora,system-ui,sans-serif;color:#eef3f7}" +
    ".wp-shell-bar{flex:none;height:" + BAR + "px;width:100%;display:flex;align-items:center;justify-content:center;gap:14px;padding:0 16px;box-sizing:border-box}" +
    ".wp-shell-bar b{font:800 14px Sora,system-ui,sans-serif;letter-spacing:.01em;margin-right:6px}" +
    ".wp-shell-seg{display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(120,180,255,.2)}" +
    ".wp-shell-seg button{appearance:none;border:0;border-radius:9px;padding:7px 14px;background:none;color:#cfe0f5;font:700 13px Sora,system-ui,sans-serif;cursor:pointer}" +
    ".wp-shell-seg button[aria-pressed=true]{background:linear-gradient(90deg,#3f9bff,#35d8d0);color:#04121a}" +
    ".wp-shell-seg button:focus-visible{outline:2px solid #35d8d0;outline-offset:2px}" +
    ".wp-shell-stage{flex:1;width:100%;display:flex;align-items:flex-start;justify-content:center;min-height:0}" +
    ".wp-shell-box{position:relative;overflow:hidden;border-radius:14px;box-shadow:0 0 0 1px rgba(120,180,255,.28),0 30px 80px rgba(0,0,0,.6)}" +
    ".wp-shell-box.phone{border-radius:28px;box-shadow:0 0 0 8px #0d1424,0 0 0 9px rgba(120,180,255,.3),0 30px 80px rgba(0,0,0,.6)}" +
    ".wp-shell-box iframe{position:absolute;left:0;top:0;border:0;display:block;transform-origin:0 0;background:#000}";
  function build() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var el = document.createElement("div"); el.className = "wp-shell";
    el.innerHTML = '<div class="wp-shell-bar" role="toolbar" aria-label="' + T.bar + '"><img src="/images/arcircle-mark-sm.png" alt="" width="34" height="20"><b>ARCIRCLE World</b><div class="wp-shell-seg">' +
      ["full", "window", "mobile"].map(function (v) { return '<button type="button" data-view="' + v + '" aria-pressed="' + (v === V) + '">' + T[v] + "</button>"; }).join("") +
      '</div></div><div class="wp-shell-stage"><div class="wp-shell-box' + (V === "mobile" ? " phone" : "") + '"><iframe title="ARCIRCLE World" allow="fullscreen; autoplay; clipboard-write; web-share"></iframe></div></div>';
    document.body.appendChild(el);
    var fr = el.querySelector("iframe"), box = el.querySelector(".wp-shell-box");
    function fit() {
      var aw = innerWidth - 32, ah = innerHeight - BAR - 16;
      if (V === "window") {
        var w = Math.min(1280, aw), h = w * 9 / 16; if (h > ah) { h = ah; w = h * 16 / 9; }
        w = Math.round(w); h = Math.round(h);
        fr.style.width = w + "px"; fr.style.height = h + "px"; fr.style.transform = ""; box.style.width = w + "px"; box.style.height = h + "px"; return 1;
      }
      var k = Math.min(ah / PHONE_H, aw / PHONE_W);
      fr.style.width = PHONE_W + "px"; fr.style.height = PHONE_H + "px"; fr.style.transform = "scale(" + k + ")";
      box.style.width = Math.round(PHONE_W * k) + "px"; box.style.height = Math.round(PHONE_H * k) + "px"; return k;
    }
    var k = fit();
    var u = new URL(location.href); u.searchParams.set("frame", V); if (V === "mobile") u.searchParams.set("k", k.toFixed(3));
    fr.src = u.pathname + u.search + u.hash;
    addEventListener("resize", fit);
    fr.addEventListener("load", function () { try { fr.contentWindow.focus(); } catch (e) { /* fine */ } });
    el.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.view === V) { try { fr.contentWindow.focus(); } catch (e) { /* fine */ } return; }
        try { localStorage.setItem("arc.world.view", b.dataset.view); } catch (e) { /* private */ }
        location.reload();
      });
    });
  }
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
})();
