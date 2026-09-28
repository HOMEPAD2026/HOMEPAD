// i18n.js — English / Korean / Simplified Chinese for every ARCIRCLE PAD page.
//
// The pages are written in English; this file swaps visible text for Korean
// or Chinese in place, and swaps it back. It works on text nodes and a few attributes
// (placeholder / title / aria-label), matching the exact English string or a
// pattern for strings with live numbers in them. A MutationObserver catches
// everything the page scripts render later (statuses, cards, tickers), so no
// page script needs to know about translation. Contract addresses, code and
// anything inside [data-no-i18n] are never touched.
//
// Choice is remembered per visitor (localStorage "arcircle.lang"); the first
// visit follows the browser language.
//
// The dictionaries live in i18n-ko.js and i18n-zh.js and are loaded only for the language in use
// (i18n-boot.js, first in every bundle, starts that download as early as it can). Until one
// arrives the page stays in English; then everything is translated in one pass and "arc:lang"
// fires so scripts that render their own text repaint.
(function () {
  "use strict";

  var ATTRS = ["placeholder", "title", "aria-label"];
  var SKIP = "script,style,noscript,code,textarea,[data-no-i18n],.ac2-ca-full,.ac2-ca-short";
  var KEY = "arcircle.lang";
  var DICT = {}, PAT = {};
  var started = false;
  var ver = (function () { var c = document.currentScript && document.currentScript.src; return (/[?&]v=(\d+)/.exec(c || "") || [])[1] || ""; })();
  function adopt(l) { var x = window.__arcDict && window.__arcDict[l]; if (x && !DICT[l]) { DICT[l] = x.d; PAT[l] = x.p; } return !!DICT[l]; }
  function need(l) {
    if (l === "en" || adopt(l)) return;
    var busy = window.__arcDictLoading || (window.__arcDictLoading = {});
    if (busy[l]) return;
    busy[l] = true;
    var s = document.createElement("script");
    s.src = "/i18n-" + l + ".js" + (ver ? "?v=" + ver : "");
    s.async = true;
    s.onerror = function () { busy[l] = false; };
    (document.head || document.documentElement).appendChild(s);
  }
  var LANGS = ["en", "ko", "zh"];
  var LABEL = { en: "EN", ko: "한", zh: "中" };
  var ARIA = { en: "English", ko: "한국어", zh: "简体中文" };
  // The whitepaper has its own English and Korean editions — no Chinese one.
  var noZh = /^\/whitepaper/.test(location.pathname);
  var lang = "en";
  try {
    var nav = (navigator.language || "").toLowerCase();
    lang = localStorage.getItem(KEY) || (nav.indexOf("ko") === 0 ? "ko" : nav.indexOf("zh") === 0 ? "zh" : "en");
  } catch (e) { /* default en */ }
  // ?lang=ko|zh|en in the address (used by the /ko/coin/ and /zh/coin/
  // pages' "Trade" links) picks the language and remembers it.
  var qLang = /[?&]lang=(en|ko|zh)(?:&|$)/.exec(location.search);
  if (qLang) { lang = qLang[1]; try { localStorage.setItem(KEY, lang); } catch (e) { /* fine */ } }
  if (LANGS.indexOf(lang) < 0 || (noZh && lang === "zh")) lang = "en";

  function translate(en, l) {
    l = l || lang;
    adopt(l);
    var d = DICT[l], pats = PAT[l];
    if (!d) return null;
    var t = en.replace(/\s+/g, " ").trim();
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(d, t)) return d[t];
    for (var i = 0; i < pats.length; i++) if (pats[i][0].test(t)) return t.replace(pats[i][0], pats[i][1]);
    return null;
  }
  function skip(el) { return !el || (el.closest && el.closest(SKIP)); }

  // Each text node remembers its English source (__en) and what we last put
  // there (__tr); anything else in it is fresh English from a page script.
  function doText(n) {
    if (skip(n.parentElement)) return;
    var cur = n.nodeValue;
    if (n.__tr != null && cur === n.__tr) return;
    n.__en = cur; n.__tr = null;
    if (lang === "en") return;
    var tr = translate(cur);
    if (tr == null) return;
    var lead = cur.match(/^\s*/)[0], trail = cur.match(/\s*$/)[0];
    n.__tr = lead + tr + trail;
    n.nodeValue = n.__tr;
  }
  function doAttrs(el) {
    if (skip(el)) return;
    var store = el.__i18nAttr || (el.__i18nAttr = {});
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      var v = el.getAttribute(a), s = store[a];
      if (s && s.tr != null && v === s.tr) return;
      store[a] = { en: v, tr: null };
      if (lang === "en") return;
      var tr = translate(v);
      if (tr != null) { store[a].tr = tr; el.setAttribute(a, tr); }
    });
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || skip(root)) return;
    if (root.hasAttribute && ATTRS.some(function (a) { return root.hasAttribute(a); })) doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else if (ATTRS.some(function (a) { return n.hasAttribute(a); })) doAttrs(n);
    }
  }
  function restoreAll() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (n.__tr != null && n.nodeValue === n.__tr) n.nodeValue = n.__en; n.__tr = null; }
      else if (n.__i18nAttr) {
        var st = n.__i18nAttr;
        Object.keys(st).forEach(function (a) { if (st[a].tr != null && n.getAttribute(a) === st[a].tr) n.setAttribute(a, st[a].en); st[a].tr = null; });
      }
    }
  }

  var paused = false;
  var observer = new MutationObserver(function (muts) {
    if (paused || lang === "en") return;
    paused = true;
    try {
      muts.forEach(function (m) {
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      });
    } finally { paused = false; }
  });

  function setLang(next, save) {
    lang = LANGS.indexOf(next) >= 0 && !(noZh && next === "zh") ? next : "en";
    if (save) { try { localStorage.setItem(KEY, lang); } catch (e) { /* fine */ } }
    var de = document.documentElement;
    de.lang = lang === "zh" ? "zh-CN" : lang;
    de.classList.toggle("lang-ko", lang === "ko");
    de.classList.toggle("lang-zh", lang === "zh");
    if (lang !== "en" && !adopt(lang)) need(lang); // translated when it arrives (_ready)
    paused = true;
    restoreAll();
    if (lang !== "en" && DICT[lang]) walk(document.body);
    paused = false;
    document.querySelectorAll(".lang-toggle [data-l]").forEach(function (b) {
      var on = b.getAttribute("data-l") === lang;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    try { document.dispatchEvent(new CustomEvent("arc:lang", { detail: { lang: lang } })); } catch (e) { /* old browser */ }
  }

  function mountToggle() {
    var host = document.querySelector(".bp-topbar-right") || document.querySelector("header.ax-top");
    if (!host || host.querySelector(".lang-toggle")) return;
    var g = document.createElement("div");
    g.className = "lang-toggle";
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", "Language");
    g.setAttribute("data-no-i18n", "");
    g.innerHTML = LANGS.filter(function (l) { return !(noZh && l === "zh"); }).map(function (l) {
      return '<button type="button" data-l="' + l + '" lang="' + (l === "zh" ? "zh-CN" : l) + '" aria-label="' + ARIA[l] + '" title="' + ARIA[l] + '">' + LABEL[l] + "</button>";
    }).join("");
    // On phones the group is compact (only the active language shows): tapping it opens the
    // other choices below, tapping one of those switches and closes it.
    g.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-l]");
      if (!b) return;
      if (b.classList.contains("on")) { g.classList.toggle("open"); return; }
      g.classList.remove("open");
      setLang(b.getAttribute("data-l"), true);
    });
    document.addEventListener("click", function (e) { if (!g.contains(e.target)) g.classList.remove("open"); });
    if (host.matches(".bp-topbar-right")) host.insertBefore(g, host.firstChild);
    else {
      var cta = host.querySelector(".ax-top-cta");
      var wrap = document.createElement("div");
      wrap.className = "ax-top-right";
      host.insertBefore(wrap, cta || null);
      wrap.appendChild(g);
      if (cta) wrap.appendChild(cta);
    }
  }

  function start() {
    started = true;
    mountToggle();
    setLang(lang, false);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  window.arcI18n = { set: function (l) { setLang(l, true); }, get: function () { return lang; }, translate: function (s, l) { return translate(s, l); },
    // i18n-ko.js / i18n-zh.js call this when they arrive
    _ready: function (l) { adopt(l); if (started && l === lang) setLang(lang, false); } };
  need(lang);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
