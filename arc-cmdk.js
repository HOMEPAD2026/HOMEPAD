// arc-cmdk.js — one search box for the whole site. ⌘K / Ctrl+K (or "/") opens it anywhere;
// the search button in the top bar does the same on touch screens.
// It finds pages, utilities, docs sections and ArcPad coins (by name, symbol or address).
// A pasted 0x address offers: open the coin, scan the token, or look the wallet up on /me.
(function () {
  "use strict";
  if (window.arcCmdk) return;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var isAddr = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(a); };
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

  var PAGES = [
    ["Home", "ARCIRCLE PAD", "/", "page"],
    ["ArcPad", "Launch a coin in one transaction", "/arc", "page"],
    ["Launch a coin", "ArcPad launch form", "/arc#launch", "page"],
    ["CirclePad", "Community-funded launches · Round #3: $ARCIA + Round #4 on Solana", "/circle", "page"],
    ["$ARCIRCLE", "Price, holders, burns and buybacks", "/arcircle", "page"],
    ["Relay Launch", "Every CirclePad coin relayed to holders", "/relay", "page"],
    ["Reward", "Holder rewards", "/reward", "page"],
    ["My ARCIRCLE", "One wallet across the whole site", "/me", "page"],
    ["Stats", "ARCIRCLE PAD in numbers", "/stats", "page"],
    ["Roadmap", "What's done, what's next", "/roadmap", "page"],
    ["Get started", "Add Arc, bring USDC, pick a path", "/start", "page"],
    ["Brand kit", "Logo and colours", "/brand", "page"],
    ["Round #1 report", "CirclePad round results", "/circle/round/1", "page"],
    ["Whitepaper", "How everything fits together", "/whitepaper", "doc"],
    ["백서 (한국어)", "Whitepaper in Korean", "/whitepaper/ko", "doc"],
    ["ArcPad docs", "Fees, curve, graduation", "/arc#docs", "doc"],
    ["CirclePad docs", "Rounds, voting, refunds", "/circle#docs", "doc"],
    ["X / Twitter", "@ARCIRCLEonArc", "https://x.com/ARCIRCLEonArc", "link"],
    ["Telegram", "Community chat", "https://t.me/ARCIRCLEonarc", "link"],
  ];
  var KIND = { page: "Page", doc: "Docs", util: "Utility", coin: "Coin", link: "Link", addr: "Address" };

  var coins = null, coinsLoading = false;
  function loadCoins() {
    if (coins || coinsLoading) return;
    coinsLoading = true;
    fetch("/api/c?view=coins").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      coins = (j && Array.isArray(j.coins)) ? j.coins : [];
      coinsLoading = false;
      if (open) render();
    }).catch(function () { coins = []; coinsLoading = false; });
  }
  function utils() {
    var l = (window.arcUtilities && Array.isArray(window.arcUtilities.list)) ? window.arcUtilities.list : [];
    if (!l.length) l = [
      { name: "Locker", sub: "Lock any Arc token", href: "/arc#locker" }, { name: "Token Scanner", sub: "Check any Arc token", href: "/arc#scanner" },
      { name: "Multisender", sub: "Send a token to many wallets", href: "/arc#multisend" }, { name: "Snapshot", sub: "Every holder at one moment", href: "/arc#snapshot" },
      { name: "Liquidity", sub: "Pool dashboard, one-coin shapes, LP locks", href: "/arc#liquidity" }, { name: "Bridge", sub: "Move USDC to Arc", href: "/arc#bridge" },
    ];
    return l.filter(function (u) { return u.href; }).map(function (u) { return [u.name, u.sub || "", u.href, "util"]; });
  }

  function score(q, a, b) {
    a = String(a || "").toLowerCase(); b = String(b || "").toLowerCase();
    if (!q) return 1;
    if (a === q) return 100;
    if (a.indexOf(q) === 0) return 60;
    if (a.indexOf(q) > 0) return 40;
    if (b.indexOf(q) >= 0) return 20;
    // loose: every char in order
    var i = 0; for (var k = 0; k < a.length && i < q.length; k++) if (a[k] === q[i]) i++;
    return i === q.length ? 8 : 0;
  }
  function results(q) {
    q = q.trim();
    var ql = q.toLowerCase(), out = [];
    if (isAddr(q)) {
      out.push(["Open coin on ArcPad", q, "/arc#coin/" + q, "addr"]);
      out.push(["Scan this token", "Token Scanner", "/arc#scanner?t=" + q, "addr"]);
      out.push(["Look up this wallet", "My ARCIRCLE", "/me?w=" + q.toLowerCase(), "addr"]);
      out.push(["View on the explorer", "arc.etherscan.io", ((window.CONFIG && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io") + "/address/" + q, "link"]);
      return out;
    }
    var pool = PAGES.concat(utils());
    var seen = {};
    pool.forEach(function (it) {
      if (seen[it[2]]) return; seen[it[2]] = 1;
      var s = Math.max(score(ql, it[0], it[1]), score(ql, tr(it[0]), tr(it[1])));
      if (s) out.push(it.concat([s + (it[3] === "page" ? 2 : 0)]));
    });
    if (ql && coins) {
      coins.forEach(function (c) {
        var s = Math.max(score(ql.replace(/^\$/, ""), c.s, c.n), score(ql, c.n, ""));
        if (!s && ql.length >= 4 && c.t.toLowerCase().indexOf(ql) === 0) s = 30;
        if (s) out.push(["$" + c.s, c.n, "/arc#coin/" + c.t, "coin", s - 1]);
      });
    }
    out.sort(function (a, b) { return (b[4] || 0) - (a[4] || 0); });
    return out.slice(0, ql ? 12 : 14);
  }

  var root, input, list, open = false, sel = 0, items = [], lastFocus = null;
  function build() {
    root = document.createElement("div");
    root.className = "ck";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Search");
    root.innerHTML =
      '<div class="ck-bg" data-ck-close></div>' +
      '<div class="ck-box">' +
        '<div class="ck-in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="M20 20l-4.5-4.5"/></svg>' +
          '<input type="text" spellcheck="false" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="ck-list" aria-autocomplete="list">' +
          '<kbd data-ck-close>Esc</kbd></div>' +
        '<ul class="ck-list" id="ck-list" role="listbox"></ul>' +
        '<div class="ck-foot"><span><kbd>↑</kbd><kbd>↓</kbd> <em></em></span><span><kbd>↵</kbd> <em></em></span><span class="ck-hint"></span></div>' +
      "</div>";
    document.body.appendChild(root);
    input = root.querySelector("input");
    list = root.querySelector(".ck-list");
    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-ck-close]")) return hide();
      var li = e.target.closest("[data-ck-i]");
      if (li) go(Number(li.getAttribute("data-ck-i")), e);
    });
    list.addEventListener("mousemove", function (e) {
      var li = e.target.closest("[data-ck-i]");
      if (li) { var i = Number(li.getAttribute("data-ck-i")); if (i !== sel) { sel = i; paintSel(); } }
    });
    input.addEventListener("input", function () { sel = 0; render(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paintSel(true); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); paintSel(true); }
      else if (e.key === "Enter") { e.preventDefault(); go(sel, e); }
      else if (e.key === "Escape") { e.preventDefault(); hide(); }
      else if (e.key === "Tab") e.preventDefault();
    });
  }
  function render() {
    var q = input.value;
    items = results(q);
    if (!items.length) {
      list.innerHTML = '<li class="ck-none">' + esc(coinsLoading ? tr("Loading coins…") : tr("Nothing found. Paste a token or wallet address to jump straight to it.")) + "</li>";
      return;
    }
    list.innerHTML = items.map(function (it, i) {
      var ext = /^https?:/.test(it[2]);
      return '<li role="option" id="ck-o' + i + '" data-ck-i="' + i + '" class="ck-' + it[3] + '"><span class="ck-k">' + esc(tr(KIND[it[3]] || "")) + '</span>' +
        '<span class="ck-t"><b' + (it[3] === "coin" || it[3] === "addr" && i === 0 ? " data-no-i18n" : "") + ">" + esc(it[3] === "coin" ? it[0] : tr(it[0])) + "</b><small" + (it[3] === "coin" || it[3] === "addr" ? " data-no-i18n" : "") + ">" +
        esc(it[3] === "coin" || /^0x/.test(it[1]) ? it[1] : tr(it[1])) + "</small></span>" + (ext ? '<span class="ck-x" aria-hidden="true">↗</span>' : "") + "</li>";
    }).join("");
    paintSel();
  }
  function paintSel(scroll) {
    var lis = list.querySelectorAll("[data-ck-i]");
    lis.forEach(function (li, i) { li.classList.toggle("on", i === sel); li.setAttribute("aria-selected", i === sel ? "true" : "false"); });
    input.setAttribute("aria-activedescendant", lis[sel] ? "ck-o" + sel : "");
    if (scroll && lis[sel]) lis[sel].scrollIntoView({ block: "nearest" });
  }
  function go(i, e) {
    var it = items[i];
    if (!it) return;
    var href = it[2];
    hide();
    if (/^https?:/.test(href)) { window.open(href, "_blank", "noopener"); return; }
    var here = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
    var tgt = href.split("#")[0].split("?")[0] || "/";
    var norm = function (p) { return p === "/arcpad" ? "/arc" : p === "/circlepad" ? "/circle" : p; };
    if (e && (e.metaKey || e.ctrlKey)) { window.open(href, "_blank", "noopener"); return; }
    if (norm(here) === norm(tgt) && href.indexOf("#") >= 0 && href.indexOf("?") < 0) { location.hash = href.slice(href.indexOf("#")); return; }
    location.href = href;
  }
  function show(prefill) {
    if (!root) build();
    lastFocus = document.activeElement;
    root.hidden = false;
    open = true;
    document.documentElement.classList.add("ck-open");
    input.placeholder = tr("Search pages, utilities, coins, or paste an address");
    var f = root.querySelectorAll(".ck-foot em");
    f[0].textContent = tr("to move"); f[1].textContent = tr("to open");
    root.querySelector(".ck-hint").textContent = (mac ? "⌘" : "Ctrl") + " K";
    input.value = prefill || "";
    sel = 0;
    render();
    loadCoins();
    requestAnimationFrame(function () { input.focus(); root.classList.add("in"); });
  }
  function hide() {
    if (!root || !open) return;
    open = false;
    root.classList.remove("in");
    root.hidden = true;
    document.documentElement.classList.remove("ck-open");
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* gone */ }
  }

  document.addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === "k") { e.preventDefault(); open ? hide() : show(); return; }
    if (k === "/" && !open && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      e.preventDefault(); show();
    }
  });
  document.addEventListener("paste", function (e) {
    if (open) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
    var s = ((e.clipboardData && e.clipboardData.getData("text")) || "").trim();
    if (isAddr(s)) { e.preventDefault(); show(s); }
  });

  // the visible trigger in the top bar (every page has either .ax-top or ArcPad/CirclePad's .headbar)
  function addTrigger() {
    if (document.querySelector(".ck-btn")) return;
    var bar = document.querySelector(".bp-topbar-right");
    var host = bar || document.querySelector("header.ax-top");
    if (!host) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "ck-btn";
    b.setAttribute("aria-label", "Search");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="M20 20l-4.5-4.5"/></svg><span>Search</span><kbd>' + (mac ? "⌘K" : "Ctrl K") + "</kbd>";
    b.addEventListener("click", function () { show(); });
    if (bar) { b.classList.add("ck-btn-bar"); b.setAttribute("aria-label", "Search the whole site"); bar.insertBefore(b, bar.querySelector(".bp-chain-pill") || bar.firstChild); return; }
    var cta = host.querySelector(".ax-top-right, .ax-top-cta");
    if (cta) host.insertBefore(b, cta); else host.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addTrigger); else addTrigger();

  window.arcCmdk = { open: show, close: hide };
})();
