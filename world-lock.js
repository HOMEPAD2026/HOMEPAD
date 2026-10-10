// world-lock.js — Game World is in private testing: it opens with a password (the Platform World stays open to all).
// This is a light, browser-side lock for the test period, not access control: the page compares a SHA-256 of what's
// typed with the hash below and remembers a match on this device. To open the world to everyone, set OPEN = true.
//   window.arcWorldLock: { ok() → bool, ask({ cancelHref }) → Promise<bool> }
(function () {
  "use strict";
  var OPEN = false;
  var HASH = "41c17fbf19937f1594c92af1f8acb6d19b7777ae11f6840036d34a9b0defcd75";
  var KEY = "arc.world.key";
  function ok() { if (OPEN) return true; try { return localStorage.getItem(KEY) === HASH; } catch (e) { return false; } }
  function sha(s) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve("");
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) { return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join(""); });
  }
  var lang = (document.documentElement.getAttribute("lang") || "en").slice(0, 2);
  try { lang = localStorage.getItem("arcircle.lang") || lang; } catch (e) { /* private */ }
  var T = {
    ko: { h: "게임 월드는 테스트 중이에요", p: "비밀번호를 입력하면 들어갈 수 있어요. 플랫폼 월드는 누구나 그대로 쓸 수 있어요.", l: "비밀번호", go: "들어가기", back: "플랫폼 월드로", bad: "비밀번호가 맞지 않아요." },
    zh: { h: "游戏世界正在测试中", p: "输入密码即可进入。平台世界照常对所有人开放。", l: "密码", go: "进入", back: "去平台世界", bad: "密码不正确。" },
    en: { h: "Game World is in testing", p: "Enter the password to step in. The Platform World is open to everyone as usual.", l: "Password", go: "Enter", back: "Go to the Platform World", bad: "That password isn't right." },
  }[lang === "ko" || lang === "zh" ? lang : "en"];
  function ask(o) {
    o = o || {};
    if (ok()) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var el = document.createElement("div");
      el.className = "wl"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wl-h");
      el.innerHTML = '<form class="wl-card" novalidate><img src="/images/arcircle-mark-sm.png" alt="" width="44" height="26"><h2 id="wl-h" data-no-i18n>' + T.h + '</h2><p data-no-i18n>' + T.p + '</p>' +
        '<label class="wl-f"><span data-no-i18n>' + T.l + '</span><input type="password" inputmode="numeric" autocomplete="off" maxlength="32" required></label>' +
        '<p class="wl-bad" role="alert" hidden data-no-i18n>' + T.bad + '</p>' +
        '<div class="wl-act"><button type="submit" class="wl-go" data-no-i18n>' + T.go + '</button><a class="wl-back" href="' + (o.cancelHref || "#") + '" data-no-i18n>' + T.back + '</a></div></form>';
      document.body.appendChild(el);
      var f = el.querySelector("form"), inp = el.querySelector("input"), bad = el.querySelector(".wl-bad");
      setTimeout(function () { inp.focus(); }, 30);
      function done(v) { el.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); }
      function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); if (o.cancelHref) location.href = o.cancelHref; else done(false); } }
      document.addEventListener("keydown", onKey, true);
      el.querySelector(".wl-back").addEventListener("click", function (e) { if (!o.cancelHref) { e.preventDefault(); done(false); } });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        sha(inp.value.trim()).then(function (h) {
          if (h === HASH) { try { localStorage.setItem(KEY, HASH); } catch (x) { /* private: this visit only */ } done(true); }
          else { bad.hidden = false; inp.value = ""; inp.focus(); f.classList.remove("wl-shake"); void f.offsetWidth; f.classList.add("wl-shake"); }
        });
      });
    });
  }
  window.arcWorldLock = { ok: ok, ask: ask };
})();
