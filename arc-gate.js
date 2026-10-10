// arc-gate.js — the front door of arcircle.app: a 3D ARCIRCLE World and two ways in.
//   Game World      → /play, the planet you walk as a robot (world-play.js)
//   Platform World  → the site as it is (this overlay goes away)
// Game World asks for the test password first (world-lock.js). Shown once per browser session on the home page. ?gate shows it again; ?skip or automation skips it.
// The 3D scene (world-gate.js + world-kit.js + three.js) loads only here, after the overlay is up.
(function () {
  "use strict";
  var p = location.pathname;
  if (p !== "/" && !/\/index\.html$/.test(p)) return;
  var qs = new URLSearchParams(location.search), force = qs.has("gate");
  var seen = function () { try { return !!sessionStorage.getItem("arc.gate"); } catch (e) { return false; } };
  var mark = function () { try { sessionStorage.setItem("arc.gate", "1"); } catch (e) { /* private */ } };
  if (!force && (qs.has("skip") || navigator.webdriver || seen())) return;
  var me = document.currentScript, ver = me && me.src.indexOf("?") > 0 ? me.src.slice(me.src.indexOf("?")) : "";
  var H = document.documentElement, reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lang = (H.getAttribute("lang") || "en").slice(0, 2);
  try { lang = localStorage.getItem("arcircle.lang") || lang; } catch (e) { /* private */ }
  var T = {
    ko: { h: "두 개의 세계, 하나의 지갑", p: "같은 코인, 같은 USDC와 $ARCIRCLE. 들어가는 길만 두 갈래예요.", g: "게임 월드", gb: "행성으로 뛰어들어 걸어 다녀요", gs: "상점에서 진짜 코인을 런칭하고 거래하고, 나만의 섬을 짓고, 스캐머를 물리쳐요.", f: "플랫폼 월드", fb: "ARCIRCLE PAD 전체", fs: "지금의 사이트 그대로, 모든 도구가 한 곳에.", hint: "드래그해서 둘러보기", skip: "사이트로 바로 가기", world: "World", on: "{n}명 접속 중", vis: "누적 방문 {n}명", cont: "{name}(으)로 계속하기" },
    zh: { h: "两个世界，一个钱包", p: "同样的币，同样的 USDC 和 $ARCIRCLE，两条入口。", g: "游戏世界", gb: "跃入星球，自由漫步", gs: "在商店里发行真实代币、交易，搭建自己的岛屿，并击败骗子。", f: "平台世界", fb: "完整的 ARCIRCLE PAD", fs: "保持现在的网站，所有工具一页可达。", hint: "拖动查看四周", skip: "直接进入网站", world: "World", on: "{n} 人在线", vis: "累计访问 {n} 人", cont: "以 {name} 继续" },
    en: { h: "Two worlds. One wallet.", p: "The same coins, the same USDC and $ARCIRCLE. Two ways in.", g: "Game World", gb: "Dive in and walk the world", gs: "Launch real coins and trade in the shops, build your own island, beat the scammers.", f: "Platform World", fb: "The full ARCIRCLE PAD", fs: "The site as it is, every tool in one place.", hint: "Drag to look around", skip: "Skip to the site", world: "World", on: "{n} online now", vis: "{n} visitors so far", cont: "Continue as {name}" },
  }[lang === "ko" || lang === "zh" ? lang : "en"];

  // a saved character on this browser turns the Game World door into "Continue as <name>"
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem("arc.world") || "null"); } catch (e) { saved = null; }
  var who = saved && typeof saved.name === "string" ? saved.name.replace(/[<>&"'`]/g, "").slice(0, 16) : "";
  var gb = who ? T.cont.replace("{name}", who) : T.gb;
  var el = document.createElement("div");
  el.className = "wg"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wg-h");
  el.innerHTML =
    '<canvas class="wg-cv" aria-hidden="true"></canvas>' +
    '<div class="wg-top"><span class="wg-brand"><img src="/images/arcircle-mark-sm.png" alt="" width="34" height="20"><b>ARCIRCLE</b><i>' + T.world + '</i></span>' +
    '<button type="button" class="wg-skip" data-no-i18n>' + T.skip + "</button></div>" +
    '<div class="wg-main"><h1 id="wg-h" data-no-i18n>' + T.h + '</h1><p data-no-i18n>' + T.p + "</p>" +
    '<div class="wg-doors">' +
    '<a class="wg-door wg-game" href="/play" data-no-i18n><span class="wg-k">' + T.g + "</span><b>" + gb + "</b><small>" + T.gs + '</small><span class="wg-stats" hidden></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>' +
    '<button type="button" class="wg-door wg-plat" data-no-i18n><span class="wg-k">' + T.f + "</span><b>" + T.fb + "</b><small>" + T.fs + '</small><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
    '</div><p class="wg-hint" data-no-i18n>' + T.hint + "</p></div>";
  (document.body || H).appendChild(el);
  H.classList.add("wg-lock");
  requestAnimationFrame(function () { el.classList.add("wg-in"); });
  var scene = null, gone = false;

  function close() {
    if (gone) return; gone = true; mark();
    el.classList.add("wg-out"); H.classList.remove("wg-lock");
    setTimeout(function () { if (scene) try { scene.dispose(); } catch (e) { /* gone */ } el.remove(); }, reduce ? 0 : 650);
  }
  el.querySelector(".wg-plat").addEventListener("click", close);
  el.querySelector(".wg-skip").addEventListener("click", close);
  el.querySelector(".wg-game").addEventListener("click", function (e) {
    e.preventDefault();
    var go = function () {
      mark();
      if (!scene || reduce) { location.href = "/play"; return; }
      el.classList.add("wg-diving");
      scene.dive().then(function () { location.href = "/play"; });
    };
    // Game World is password-locked while it's being tested (world-lock.js)
    var L = window.arcWorldLock;
    if (L && !L.ok()) L.ask().then(function (v) { if (v) go(); }); else go();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !gone) close(); });

  // who's in the world now and how many have visited (api/_world.mjs); hidden until there's a number to show
  var fmt = function (n) { try { return Number(n).toLocaleString(lang === "zh" ? "zh-CN" : lang === "ko" ? "ko-KR" : "en-US"); } catch (e) { return String(n); } };
  fetch("/api/social?world=stats").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || gone || j.visitors == null) return;
    var box = el.querySelector(".wg-stats"), parts = [];
    if (j.online > 0) parts.push('<i class="wg-live-dot" aria-hidden="true"></i>' + T.on.replace("{n}", fmt(j.online)));
    if (j.visitors > 0) parts.push(T.vis.replace("{n}", fmt(j.visitors)));
    if (!parts.length) return;
    box.innerHTML = parts.join('<span aria-hidden="true">/</span>'); box.hidden = false;
  }).catch(function () { /* the door works without numbers */ });
  setTimeout(function () { var b = el.querySelector(".wg-game"); if (b) b.focus({ preventScroll: true }); }, 60);

  // the 3D world, when the browser can draw it
  var ok = false;
  try { var c = document.createElement("canvas"); ok = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { ok = false; }
  var saveData = navigator.connection && navigator.connection.saveData;
  if (!ok || saveData) { el.classList.add("wg-flat"); return; }
  import("/world-gate.js" + ver).then(function (m) {
    if (gone) return;
    return m.start(el.querySelector(".wg-cv"), { reduce: reduce }).then(function (s) { scene = s; if (gone) s.dispose(); else el.classList.add("wg-live"); });
  }).catch(function (err) { el.classList.add("wg-flat"); if (window.console) console.warn("ARCIRCLE World could not start:", err); });
})();
