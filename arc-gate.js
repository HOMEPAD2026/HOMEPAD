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
    ko: { h: "두 개의 세계, 하나의 지갑", p: "같은 코인, 같은 USDC와 $ARCIRCLE. 들어가는 길만 두 갈래예요.", g: "게임 월드", gb: "로봇으로 행성을 걸어 다녀요", gs: "상점에서 진짜 코인을 런칭하고 거래하고, 스캐머를 물리쳐요.", f: "플랫폼 월드", fb: "ARCIRCLE PAD 전체", fs: "지금의 사이트 그대로, 모든 도구가 한 곳에.", hint: "드래그해서 둘러보기", skip: "사이트로 바로 가기", world: "World" },
    zh: { h: "两个世界，一个钱包", p: "同样的币，同样的 USDC 和 $ARCIRCLE，两条入口。", g: "游戏世界", gb: "以机器人身份漫游星球", gs: "在商店里发行真实代币、交易，并击败骗子。", f: "平台世界", fb: "完整的 ARCIRCLE PAD", fs: "保持现在的网站，所有工具一页可达。", hint: "拖动查看四周", skip: "直接进入网站", world: "World" },
    en: { h: "Two worlds. One wallet.", p: "The same coins, the same USDC and $ARCIRCLE. Two ways in.", g: "Game World", gb: "Walk the planet as your robot", gs: "Launch real coins and trade in the shops. Beat the scammers.", f: "Platform World", fb: "The full ARCIRCLE PAD", fs: "The site as it is, every tool in one place.", hint: "Drag to look around", skip: "Skip to the site", world: "World" },
  }[lang === "ko" || lang === "zh" ? lang : "en"];

  var el = document.createElement("div");
  el.className = "wg"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wg-h");
  el.innerHTML =
    '<canvas class="wg-cv" aria-hidden="true"></canvas>' +
    '<div class="wg-top"><span class="wg-brand"><img src="/images/arcircle-mark-sm.png" alt="" width="34" height="20"><b>ARCIRCLE</b><i>' + T.world + '</i></span>' +
    '<button type="button" class="wg-skip" data-no-i18n>' + T.skip + "</button></div>" +
    '<div class="wg-main"><h1 id="wg-h" data-no-i18n>' + T.h + '</h1><p data-no-i18n>' + T.p + "</p>" +
    '<div class="wg-doors">' +
    '<a class="wg-door wg-game" href="/play" data-no-i18n><span class="wg-k">' + T.g + "</span><b>" + T.gb + "</b><small>" + T.gs + '</small><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>' +
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
