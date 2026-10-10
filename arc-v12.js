// arc-v12.js — layout and motion pass (v12), on every app page that loads the shared chrome:
//   · Staking: four tabs (Your lock · Launch Drop · Pool vote · Treasury & stats) instead of one long page; the
//     Launch Drop tab shows a dot when there's something to claim, and #staking?drop… opens on it
//   · Home: on a phone each menu card shows its first four links and a "+N more" that opens the rest
//   · Coin page: the header's chips get their names as aria-labels (the phone shows icons only)
//   · Coin page trades: a trade that wasn't there before slides in, and a big one (≥ $100) glows
// The styles are in arc-v10.css ("v12"). Everything respects prefers-reduced-motion.
(function () {
  "use strict";
  var D = document;
  var $ = function (id) { return D.getElementById(id); };
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

  // ---------------- Staking: tabs ----------------
  var STK_TABS = [["lock", "Your lock"], ["drop", "Launch Drop"], ["vote", "Pool vote"], ["more", "Treasury & stats"]];
  function stkTabs() {
    var panel = $("bp-panel-staking"), ld = $("ld-body");
    if (!panel || !ld) return;
    var bar = $("v12-stabs");
    if (!bar) {
      bar = D.createElement("div");
      bar.id = "v12-stabs"; bar.className = "v12-stabs"; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "ARCIRCLE Staking");
      ld.parentNode.insertBefore(bar, ld);
      bar.addEventListener("click", function (e) { var b = e.target.closest("[data-v12-tab]"); if (b) stkSet(b.dataset.v12Tab, true); });
      bar.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var ks = STK_TABS.map(function (x) { return x[0]; }), i = ks.indexOf(panel.dataset.v12tab);
        var n = ks[(i + (e.key === "ArrowRight" ? 1 : ks.length - 1)) % ks.length];
        stkSet(n, true); var nb = bar.querySelector('[data-v12-tab="' + n + '"]'); if (nb) nb.focus();
      });
      new MutationObserver(stkBadge).observe(ld, { childList: true, subtree: true });
      var start = /[#?&]staking\?[^#]*drop|[?&]drop\b/.test(location.hash) ? "drop" : ls.get("arc.v12.stk") || "lock";
      stkSet(STK_TABS.some(function (x) { return x[0] === start; }) ? start : "lock", false);
      window.addEventListener("hashchange", function () { if (/staking\?[^#]*drop/.test(location.hash)) stkSet("drop", false); });
    }
    bar.innerHTML = STK_TABS.map(function (x) {
      var on = panel.dataset.v12tab === x[0];
      return '<button type="button" role="tab" data-v12-tab="' + x[0] + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' + esc(tr(x[1])) + (x[0] === "drop" ? '<i class="v12-dot" hidden></i>' : "") + "</button>";
    }).join("");
    stkBadge();
  }
  function stkSet(k, user) {
    var panel = $("bp-panel-staking"), bar = $("v12-stabs");
    if (!panel) return;
    var was = panel.dataset.v12tab;
    panel.dataset.v12tab = k;
    D.documentElement.dataset.v12stk = k;
    if (user) ls.set("arc.v12.stk", k);
    if (bar) [].forEach.call(bar.querySelectorAll("[data-v12-tab]"), function (b) { var on = b.dataset.v12Tab === k; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    if (user && was !== k && !reduce) { panel.classList.remove("v12-swap"); void panel.offsetWidth; panel.classList.add("v12-swap"); }
    if (user && bar) { var top = bar.getBoundingClientRect().top; if (top < 60) window.scrollBy({ top: top - 70, behavior: reduce ? "auto" : "smooth" }); }
  }
  function stkBadge() {
    var bar = $("v12-stabs"), ld = $("ld-body");
    if (!bar || !ld) return;
    var dot = bar.querySelector(".v12-dot");
    if (dot) dot.hidden = !ld.querySelector('[data-ld="claim"]');
  }

  // ---------------- Home: shorter menu cards on a phone ----------------
  function homeMap() {
    var grid = $("hm-map-grid");
    if (!grid) return;
    var paint = function () {
      [].forEach.call(grid.querySelectorAll(".hm-mapc"), function (c) {
        var l = c.querySelector(".hm-mapc-l"), n = l ? l.children.length : 0;
        if (!l || n <= 4 || c.querySelector(".v12-more")) return;
        var b = D.createElement("button");
        b.type = "button"; b.className = "v12-more"; b.setAttribute("aria-expanded", "false");
        b.textContent = tr("Show {n} more").replace("{n}", n - 4);
        b.addEventListener("click", function () { var open = !c.classList.contains("v12-open"); c.classList.toggle("v12-open", open); b.setAttribute("aria-expanded", String(open)); b.textContent = open ? tr("Show less") : tr("Show {n} more").replace("{n}", n - 4); });
        c.appendChild(b);
      });
    };
    paint();
    new MutationObserver(paint).observe(grid, { childList: true });
  }

  // ---------------- Coin page: chip names for icon-only chips ----------------
  function chipNames() {
    var row = D.querySelector("#bp-panel-coin .ac2-ca-row");
    if (!row) return;
    [].forEach.call(row.querySelectorAll(".ac2-chip-btn"), function (b) {
      var s = b.querySelector("span");
      var name = s && s.textContent.trim();
      if (name && b.getAttribute("aria-label") !== name) { b.setAttribute("aria-label", name); if (!b.title) b.title = name; }
    });
  }

  // ---------------- Coin page: new trades slide in ----------------
  var seen = { coin: "", keys: null, at: 0 };
  function tradeKey(tr0) { var a = tr0.querySelector("a.ac2-tx"); return a ? a.getAttribute("href") : ""; }
  function usdOf(tr0) { var td = tr0.children[2]; if (!td) return 0; var m = /\$?([\d,.]+)\s*([KMB])?/.exec(td.textContent || ""); if (!m) return 0; return Number(m[1].replace(/,/g, "")) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1); }
  function trades() {
    var body = $("apc-trades");
    if (!body || body.__v12) return;
    body.__v12 = true;
    new MutationObserver(function () {
      var coin = (location.hash.match(/coin\/(0x[0-9a-fA-F]{40})/) || [])[1] || "";
      var rows = [].slice.call(body.querySelectorAll("tr")).filter(function (r) { return tradeKey(r); });
      if (!rows.length) return;
      var keys = rows.map(tradeKey);
      // a new coin, or the first list: remember what's there, animate nothing
      if (coin.toLowerCase() !== seen.coin || !seen.keys) { seen = { coin: coin.toLowerCase(), keys: new Set(keys), top: keys[0] }; return; }
      var fresh = rows.filter(function (r) { return !seen.keys.has(tradeKey(r)); });
      var prevTop = seen.top;
      keys.forEach(function (k) { seen.keys.add(k); });
      seen.top = keys[0];
      // only trades that arrived on top of the list we had (a filter switch or "show more" brings older rows into view)
      var n = fresh.length;
      if (!n || n > 4 || keys.indexOf(prevTop) !== n || rows.indexOf(fresh[n - 1]) !== n - 1) return;
      if (reduce) return;
      fresh.forEach(function (r, i) {
        r.style.setProperty("--v12d", i * 70 + "ms");
        r.classList.add("v12-new");
        if (usdOf(r) >= 100) r.classList.add("v12-big");
        setTimeout(function () { r.classList.remove("v12-new", "v12-big"); }, 2600);
      });
    }).observe(body, { childList: true });
  }

  // ---------------- count-up: [data-v12-count="1,234.5"] counts from 0 the first time its key shows ----------------
  // (ARCIRCLE Swap's "$ARCIRCLE burned" after a swap; the page may redraw the same message, so each key plays once)
  var counted = {};
  function countUp(el) {
    var key = el.getAttribute("data-v12-key") || el.getAttribute("data-v12-count");
    var txt = el.getAttribute("data-v12-count") || "";
    var m = /^([\d,]*\.?\d*)\s*([KMB])?$/.exec(txt.trim());
    if (!m || !m[1]) return;
    var to = Number(m[1].replace(/,/g, "")), suf = m[2] || "", dec = (m[1].split(".")[1] || "").length;
    if (reduce || !(to > 0) || counted[key]) return;
    counted[key] = 1;
    var t0 = performance.now(), dur = 900;
    var wrap = el.closest(".v12-burn"); if (wrap) { wrap.classList.remove("v12-pop"); void wrap.offsetWidth; wrap.classList.add("v12-pop"); }
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * e).toLocaleString("en-US", { minimumFractionDigits: k < 1 ? 0 : dec, maximumFractionDigits: dec }) + suf;
      if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = txt;
    })(t0);
  }
  new MutationObserver(function (ms) {
    ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType !== 1) return; if (n.matches("[data-v12-count]")) countUp(n); [].forEach.call(n.querySelectorAll("[data-v12-count]"), countUp); }); });
  }).observe(D.documentElement, { childList: true, subtree: true });

  function boot() {
    stkTabs(); homeMap(); trades(); chipNames();
    var head = D.querySelector("#bp-panel-coin .ac2-ca-row");
    if (head && !head.__v12) { head.__v12 = true; new MutationObserver(chipNames).observe(head, { childList: true, subtree: true, characterData: true }); }
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot); else boot();
  setTimeout(boot, 1500);
  D.addEventListener("arc:lang", function () { stkTabs(); });
  window.arcV12 = { stkSet: stkSet };
})();
