// world-shell.js — the frame around ARCIRCLE World on a computer when Settings → Screen is "Window" or "Mobile" (b416).
// play.html decides (window.__arcShell) before anything else runs; this page then draws only the frame, and the game
// runs inside it (play.html?frame=window|mobile):
//   window  (b-win, the default on a computer) the game in a window with its own title bar, over ARCIRCLE scenery:
//           — a smaller window · □ the whole page (again: back) · × leave. The size is kept (localStorage
//           "arc.world.win": s / m / max) and changes without a reload: the game only sees its window resize.
//           A smaller window is also a lighter one: fewer pixels to draw every frame.
//   mobile  the phone layout (980 wide, 19.5:9), scaled to fit the height; the mouse works its stick and buttons,
//           and the keyboard works as on a computer
// The view switch (Full screen, Window, Mobile) is in the title bar, or the bar above the phone (localStorage
// "arc.world.view"; the page reloads).
(function () {
  "use strict";
  var V = window.__arcShell; if (!V) return;
  var lang = (document.documentElement.getAttribute("lang") || "en").slice(0, 2);
  try { lang = localStorage.getItem("arcircle.lang") || lang; } catch (e) { /* private */ }
  var T = {
    ko: { full: "전체 화면", window: "창 모드", mobile: "모바일", bar: "화면", small: "작게", max: "최대화", restore: "원래 크기", leave: "나가기", ask: "ARCIRCLE WORLD에서 나갈까요?", stay: "계속하기", go: "나가기" },
    zh: { full: "全屏", window: "窗口", mobile: "手机", bar: "画面", small: "缩小", max: "最大化", restore: "还原", leave: "离开", ask: "要离开 ARCIRCLE WORLD 吗？", stay: "继续玩", go: "离开" },
    tr: { full: "Tam ekran", window: "Pencere", mobile: "Mobil", bar: "Ekran", small: "Küçült", max: "Büyüt", restore: "Eski boyut", leave: "Çık", ask: "ARCIRCLE WORLD'den çıkılsın mı?", stay: "Kal", go: "Çık" },
    en: { full: "Full screen", window: "Window", mobile: "Mobile", bar: "Screen", small: "Smaller", max: "Maximize", restore: "Restore", leave: "Leave", ask: "Leave ARCIRCLE WORLD?", stay: "Stay", go: "Leave" },
  }[lang === "ko" || lang === "zh" || lang === "tr" ? lang : "en"];
  var PHONE_W = 980, PHONE_H = Math.round(980 * 19.5 / 9), BAR = 44, TB = 40;
  var size = "m"; try { size = localStorage.getItem("arc.world.win") || "m"; } catch (e) { /* private */ }
  if (size !== "s" && size !== "m" && size !== "max") size = "m";
  var ICON = {
    full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    window: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 20h6"/>',
    mobile: '<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 17.5h2"/>',
    small: '<path d="M6 12h12"/>', max: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>',
    restore: '<rect x="4.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M8.5 8.5V5.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3"/>',
    leave: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  var svg = function (k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + "</svg>"; };
  var css = ".wp-shell{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;font-family:Sora,system-ui,sans-serif;color:#eef3f7;" +
      "background:radial-gradient(90% 80% at 50% 50%,transparent 55%,rgba(2,10,24,.45)),url(/images/world-win-bg.webp) center/cover no-repeat,#0b2a44}" +
    ".wp-shell-bar{flex:none;height:" + BAR + "px;width:100%;display:flex;align-items:center;justify-content:center;gap:14px;padding:0 16px;box-sizing:border-box}" +
    ".wp-shell-seg{display:flex;gap:2px;padding:3px;border-radius:11px;background:rgba(6,16,32,.55);border:1px solid rgba(120,180,255,.25)}" +
    ".wp-shell-seg button,.wp-shell-ctl button{appearance:none;display:grid;place-items:center;width:34px;height:28px;border:0;border-radius:8px;padding:0;background:none;color:#cfe0f5;cursor:pointer}" +
    ".wp-shell-seg button:hover,.wp-shell-ctl button:hover{background:rgba(255,255,255,.1)}" +
    ".wp-shell-ctl button[data-win=leave]:hover{background:#e5484d;color:#fff}" +
    ".wp-shell svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}" +
    ".wp-shell-seg button[aria-pressed=true]{background:linear-gradient(90deg,#3f9bff,#35d8d0);color:#04121a}" +
    ".wp-shell button:focus-visible{outline:2px solid #35d8d0;outline-offset:2px}" +
    ".wp-shell-stage{flex:1;width:100%;display:flex;align-items:flex-start;justify-content:center;min-height:0}" +
    ".wp-shell.win .wp-shell-stage{align-items:center;padding-top:4vh;box-sizing:border-box}.wp-shell.win.max .wp-shell-stage{padding-top:0}" + // (a little low: the scenery's logo stays clear above it)
    ".wp-shell-box{position:relative;overflow:hidden;border-radius:14px;box-shadow:0 0 0 1px rgba(120,180,255,.28),0 30px 80px rgba(0,0,0,.6)}" +
    ".wp-shell-box.phone{border-radius:28px;box-shadow:0 0 0 8px #0d1424,0 0 0 9px rgba(120,180,255,.3),0 30px 80px rgba(0,0,0,.6)}" +
    ".wp-shell-box iframe{position:absolute;left:0;top:0;border:0;display:block;transform-origin:0 0;background:#000}" +
    // the window: a glass frame with a cyan glow, a title bar, and the game under it
    ".wp-shell-box.win{border-radius:16px;background:rgba(6,18,36,.86);box-shadow:0 0 0 2px rgba(110,200,255,.55),0 0 28px rgba(53,216,208,.35),0 30px 90px rgba(0,0,0,.55);animation:wpWinIn .5s cubic-bezier(.2,.9,.3,1.2) both}" +
    ".wp-shell-box.win iframe{top:" + TB + "px}" +
    ".wp-shell.max .wp-shell-box.win{border-radius:0;box-shadow:none;animation:none}" +
    ".wp-shell-tb{position:absolute;left:0;right:0;top:0;height:" + TB + "px;display:flex;align-items:center;gap:10px;padding:0 8px 0 14px;box-sizing:border-box;background:linear-gradient(180deg,rgba(24,48,86,.95),rgba(10,24,46,.95));border-bottom:1px solid rgba(110,200,255,.3);user-select:none}" +
    ".wp-shell-tb img{width:30px;height:15px;object-fit:contain}" +
    ".wp-shell-tb b{font:800 14px/1 Sora,system-ui,sans-serif;letter-spacing:.06em;flex:1;white-space:nowrap}" +
    ".wp-shell-tb .wp-shell-seg{padding:2px;border-radius:9px}.wp-shell-tb .wp-shell-seg button{width:30px;height:24px}" +
    ".wp-shell-ctl{display:flex;gap:2px}" +
    ".wp-shell-ask{position:absolute;inset:0;display:grid;place-items:center;background:rgba(2,8,18,.55);z-index:2}" +
    ".wp-shell-ask div{padding:22px 24px;border-radius:16px;background:linear-gradient(180deg,#183058,#0c1d38);box-shadow:0 0 0 1px rgba(110,200,255,.4),0 20px 60px rgba(0,0,0,.5);text-align:center}" +
    ".wp-shell-ask p{margin:0 0 16px;font:700 16px Sora,system-ui,sans-serif}" +
    ".wp-shell-ask button{appearance:none;border:0;border-radius:10px;padding:10px 20px;margin:0 5px;font:800 14px Sora,system-ui,sans-serif;cursor:pointer;color:#fff;background:rgba(255,255,255,.1)}" +
    ".wp-shell-ask button.go{background:#e5484d}" +
    "@keyframes wpWinIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}" +
    "@media (prefers-reduced-motion:reduce){.wp-shell-box.win{animation:none}}";
  function build() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var el = document.createElement("div"); el.className = "wp-shell" + (V === "window" ? " win" : "");
    var seg = '<div class="wp-shell-seg" role="toolbar" aria-label="' + T.bar + '">' +
      ["full", "window", "mobile"].map(function (v) { return '<button type="button" data-view="' + v + '" aria-pressed="' + (v === V) + '" title="' + T[v] + '" aria-label="' + T[v] + '">' + svg(v) + "</button>"; }).join("") + "</div>";
    var frame = '<iframe title="ARCIRCLE World" allow="fullscreen; autoplay; clipboard-write; web-share; screen-wake-lock"></iframe>';
    el.innerHTML = V === "window"
      ? '<div class="wp-shell-stage"><div class="wp-shell-box win"><div class="wp-shell-tb"><img src="/images/brand/mark-sm-v2.webp" alt=""><b>ARCIRCLE WORLD</b>' + seg +
        '<div class="wp-shell-ctl"><button type="button" data-win="small" title="' + T.small + '" aria-label="' + T.small + '">' + svg("small") + '</button><button type="button" data-win="max"></button><button type="button" data-win="leave" title="' + T.leave + '" aria-label="' + T.leave + '">' + svg("leave") + "</button></div></div>" + frame + "</div></div>"
      : '<div class="wp-shell-bar">' + seg + '</div><div class="wp-shell-stage"><div class="wp-shell-box' + (V === "mobile" ? " phone" : "") + '">' + frame + "</div></div>";
    document.body.appendChild(el);
    var fr = el.querySelector("iframe"), box = el.querySelector(".wp-shell-box"), maxB = el.querySelector("[data-win=max]");
    var focus = function () { try { fr.contentWindow.focus(); } catch (e) { /* fine */ } };
    function fit() {
      if (V === "window") {
        el.classList.toggle("max", size === "max");
        if (maxB) { var m = size === "max"; maxB.innerHTML = svg(m ? "restore" : "max"); maxB.title = m ? T.restore : T.max; maxB.setAttribute("aria-label", maxB.title); }
        var w, h;
        if (size === "max") { w = innerWidth; h = innerHeight - TB; }
        else {
          // a 16:9 game under the title bar, with room for the scenery around it (m: about 80% of the page, s: 62%)
          var aw = innerWidth * (size === "s" ? 0.62 : 0.8), ah = innerHeight * (size === "s" ? 0.66 : 0.8) - TB;
          w = Math.min(size === "s" ? 1200 : 1640, aw); h = w * 9 / 16; if (h > ah) { h = ah; w = h * 16 / 9; }
        }
        w = Math.round(w); h = Math.round(h);
        fr.style.width = w + "px"; fr.style.height = h + "px"; fr.style.transform = ""; box.style.width = w + "px"; box.style.height = h + TB + "px"; return 1;
      }
      var aw2 = innerWidth - 32, ah2 = innerHeight - BAR - 16;
      var k = Math.min(ah2 / PHONE_H, aw2 / PHONE_W);
      fr.style.width = PHONE_W + "px"; fr.style.height = PHONE_H + "px"; fr.style.transform = "scale(" + k + ")";
      box.style.width = Math.round(PHONE_W * k) + "px"; box.style.height = Math.round(PHONE_H * k) + "px"; return k;
    }
    var k = fit();
    var u = new URL(location.href); u.searchParams.set("frame", V); if (V === "mobile") u.searchParams.set("k", k.toFixed(3));
    fr.src = u.pathname + u.search + u.hash;
    addEventListener("resize", fit);
    fr.addEventListener("load", focus);
    var setSize = function (s) { size = s; try { localStorage.setItem("arc.world.win", s); } catch (e) { /* private */ } fit(); focus(); };
    el.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.view === V) { focus(); return; }
        try { localStorage.setItem("arc.world.view", b.dataset.view); } catch (e) { /* private */ }
        location.reload();
      });
    });
    el.querySelectorAll("[data-win]").forEach(function (b) {
      b.addEventListener("click", function () {
        var a = b.dataset.win;
        if (a === "small") setSize(size === "s" ? "m" : "s");
        else if (a === "max") setSize(size === "max" ? "m" : "max");
        else if (a === "leave") {
          var ask = document.createElement("div"); ask.className = "wp-shell-ask"; ask.setAttribute("role", "dialog"); ask.setAttribute("aria-modal", "true");
          ask.innerHTML = "<div><p>" + T.ask + '</p><button type="button" class="stay">' + T.stay + '</button><button type="button" class="go">' + T.go + "</button></div>";
          box.appendChild(ask); ask.querySelector(".stay").focus();
          ask.addEventListener("click", function (e) { if (e.target.closest(".go")) location.href = "/?skip"; else if (e.target.closest(".stay") || e.target === ask) { ask.remove(); focus(); } });
          ask.addEventListener("keydown", function (e) { if (e.key === "Escape") { ask.remove(); focus(); } });
        }
      });
    });
    var tb = el.querySelector(".wp-shell-tb");
    if (tb) tb.addEventListener("dblclick", function (e) { if (!e.target.closest("button")) setSize(size === "max" ? "m" : "max"); });
  }
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
})();
