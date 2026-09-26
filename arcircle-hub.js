// arcircle-hub.js — shared behaviour for the ARCIRCLE hub pages (index.html
// and arcircle.html, plus the dock on ArcPad / CirclePad / Reward): the quick
// bar above the dock, copy-to-clipboard for the $ARCIRCLE contract address,
// and redirecting old #rewards links to the Reward page. No chain calls.
(function () {
  "use strict";

  // Invite links: ?ref=<wallet>. The first one a visitor arrives with is kept
  // for 30 days (this browser only) so a future referral program can credit
  // it; the parameter is then dropped from the address bar.
  (function captureRef() {
    try {
      var u = new URL(location.href);
      var ref = (u.searchParams.get("ref") || "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(ref)) return;
      var KEY = "arcircle.ref.v1";
      var cur = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!cur || !cur.at || Date.now() - cur.at > 30 * 864e5) localStorage.setItem(KEY, JSON.stringify({ ref: ref.toLowerCase(), at: Date.now(), page: u.pathname }));
      u.searchParams.delete("ref");
      if (history.replaceState) history.replaceState(history.state, "", u.pathname + (u.search || "") + u.hash);
    } catch (e) { /* storage blocked or old browser */ }
  })();
  window.arcRef = function () {
    try { var c = JSON.parse(localStorage.getItem("arcircle.ref.v1") || "null"); return c && Date.now() - c.at < 30 * 864e5 ? c.ref : null; } catch (e) { return null; }
  };

  // ---- $ARCIRCLE: live or not ----
  // The contract lives in one place (config-arc.js → CONFIG.ARCIRCLE_TOKEN).
  // Until it's set, <html> gets .arc-notlive: anything marked .arc-live-only
  // stays hidden and .arc-nl-only ("Not live") shows — which is also what a
  // page looks like before any script runs. Once set, addresses and links
  // are filled in from the config:
  //   [data-arc-ca="full|short|curve-short"]  text
  //   [data-arc-href="scan|curve|buy"]         href
  //   .ax-copy[data-copy-arc]                  copies the contract
  (function arcircleState() {
    var C = typeof CONFIG !== "undefined" ? CONFIG : {};
    var tok = /^0x[0-9a-fA-F]{40}$/.test(C.ARCIRCLE_TOKEN || "") ? C.ARCIRCLE_TOKEN : "";
    var curve = /^0x[0-9a-fA-F]{40}$/.test(C.ARCIRCLE_CURVE || "") ? C.ARCIRCLE_CURVE : "";
    var pool = /^0x[0-9a-fA-F]{64}$/.test(C.ARCIRCLE_POOL_ID || "") ? C.ARCIRCLE_POOL_ID : "";
    var root = document.documentElement;
    root.classList.toggle("arc-live", !!tok);
    root.classList.toggle("arc-notlive", !tok);
    // how it trades: a Uniswap v4 pool (Argus) or a bonding curve
    root.classList.toggle("arc-pool", !!tok && !!pool && !curve);
    root.classList.toggle("arc-curve", !!tok && !!curve);
    window.arcircleToken = function () { return tok; };
    if (!tok) return;
    var ex = C.BLOCK_EXPLORER || "https://arc.etherscan.io";
    var sh = function (a) { return a.slice(0, 6) + "…" + a.slice(-4); };
    var fill = function () {
      document.querySelectorAll("[data-arc-ca]").forEach(function (el) {
        var k = el.getAttribute("data-arc-ca");
        el.textContent = k === "full" ? tok : k === "curve-short" ? (curve ? sh(curve) : "—") : k === "pool-short" ? (pool ? sh(pool) : "—") : sh(tok);
        if (k !== "curve-short") el.title = tok;
      });
      document.querySelectorAll("[data-arc-href]").forEach(function (el) {
        var k = el.getAttribute("data-arc-href");
        el.href = k === "scan" ? ex + "/token/" + tok : k === "curve" ? (curve ? ex + "/address/" + curve + "#code" : ex + "/token/" + tok)
          : k === "chart" ? (C.ARCIRCLE_CHART_URL || ex + "/token/" + tok) : (C.ARCIRCLE_BUY_URL || "/arc#arcircle");
      });
      document.querySelectorAll("[data-copy-arc]").forEach(function (el) { el.setAttribute("data-copy", tok); });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill); else fill();
  })();

  // Rewards used to be a "coming soon" popup; they now have their own page
  // (/reward). Old links — index.html#rewards, arcircle.html#rewards, any
  // leftover [data-reward] button — are sent there.
  function openReward() { location.href = "/reward"; }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); }
      catch (err) { reject(err); }
      document.body.removeChild(ta);
    });
  }

  function handleCopy(btn) {
    var original = btn.getAttribute("data-label") || btn.textContent;
    btn.setAttribute("data-label", original);
    copyText(btn.getAttribute("data-copy")).then(function () {
      // the label morphs into a check mark (style.css: .ax-copy.is-done)
      btn.innerHTML = '<svg class="ax-copy-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg><span>Copied</span>';
      btn.classList.add("is-done");
    }, function () {
      btn.textContent = "Copy failed";
    }).then(function () {
      setTimeout(function () {
        btn.textContent = original;
        btn.classList.remove("is-done");
      }, 1600);
    });
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-reward]")) { e.preventDefault(); openReward(); return; }
    // Only this file's own .ax-copy buttons — arc-shared.js already handles
    // the .ac-copy[data-copy] buttons in the ArcPad/CirclePad Contracts tab.
    var copyBtn = t.closest(".ax-copy[data-copy]");
    if (copyBtn) handleCopy(copyBtn);
  });

  // ---- Quick bar: a slim second floating row just above the dock, the same
  // on every page (hub, ArcPad, CirclePad, Reward, $ARCIRCLE): Launch,
  // Explore, and the utilities button (infinity + plus) that opens the
  // utilities panel upwards. Launch / Explore go to ArcPad; on ArcPad itself
  // they switch tabs in place.
  var ICON_ROCKET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3 2 4.5 5.4 4.5 9 0 2-.5 3.7-1.2 5l-3.3 3-3.3-3c-.7-1.3-1.2-3-1.2-5 0-3.6 1.5-7 4.5-9z"/><circle cx="12" cy="10.5" r="2"/><path d="M8 15.5l-3 1 .8-3.3M16 15.5l3 1-.8-3.3"/></svg>';
  var ICON_GRID = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/></svg>';
  // A drawn lemniscate (not the emoji): gradient stroke with a light that
  // travels round the loop, and a small plus that turns into a close mark.
  var ICON_INFINITY = '<svg class="ax-inf" viewBox="0 0 40 20" aria-hidden="true">' +
    '<defs><linearGradient id="axInfGrad" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4d9fff"/><stop offset=".5" stop-color="#35d8d0"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>' +
    '<path class="ax-inf-base" d="M20 10C16.6 5.4 13.8 3.2 10.4 3.2a6.8 6.8 0 0 0 0 13.6c3.4 0 6.2-2.2 9.6-6.8s6.2-6.8 9.6-6.8a6.8 6.8 0 0 1 0 13.6c-3.4 0-6.2-2.2-9.6-6.8z"/>' +
    '<path class="ax-inf-shine" pathLength="100" d="M20 10C16.6 5.4 13.8 3.2 10.4 3.2a6.8 6.8 0 0 0 0 13.6c3.4 0 6.2-2.2 9.6-6.8s6.2-6.8 9.6-6.8a6.8 6.8 0 0 1 0 13.6c-3.4 0-6.2-2.2-9.6-6.8z"/></svg>';
  var ICON_PLUS = '<svg class="ax-plus" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>';

  // The four utilities. A tile with an href is live; the others show "Soon"
  // until their page exists. Multisender says "Preview" until its contract
  // address is set in config-arc.js (MULTISEND_ADDRESS).
  var UTILS = [
    { id: "locker", name: "Locker", sub: "Lock any Arc token until a date you pick", status: "Live", acc: "#35d8d0", href: "/arc#locker",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/><circle cx="12" cy="15.5" r="1.4"/></svg>' },
    { id: "scanner", name: "Token Scanner", sub: "Check any Arc token before you buy", status: "v1", acc: "#4d9fff", href: "/arc#scanner",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z"/><circle cx="11.5" cy="11.5" r="3"/><path d="M13.7 13.7l2.3 2.3"/></svg>' },
    { id: "multisender", name: "Multisender", sub: "Send a token to many wallets in one go", acc: "#39ff88", href: "/arc#multisend",
      status: typeof CONFIG !== "undefined" && /^0x[0-9a-fA-F]{40}$/.test(CONFIG.MULTISEND_ADDRESS || "") ? "v1" : "Preview",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="2.2"/><circle cx="18.5" cy="5.5" r="2"/><circle cx="18.5" cy="12" r="2"/><circle cx="18.5" cy="18.5" r="2"/><path d="M7.7 12h8.8M7.4 10.9l9.2-4.6M7.4 13.1l9.2 4.6"/></svg>' },
    { id: "bridge", name: "Bridge", sub: "Move USDC between Arc and 8 chains", status: "Live", acc: "#ffc861", href: "/arc#bridge",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5h18"/><path d="M4.5 15.5V19M19.5 15.5V19"/><path d="M4.5 15.5c2-5.3 4.7-8 7.5-8s5.5 2.7 7.5 8"/><path d="M8.5 15.5v-3.6M12 15.5V7.5M15.5 15.5v-3.6"/></svg>' },
  ];
  // Page 2: Snapshot, then the next utilities — placeholders until each is decided.
  var UTILS2 = [
    { id: "snapshot", name: "Snapshot", sub: "Every holder of a token at one moment", status: "New", acc: "#b58bff", href: "/arc#snapshot",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><circle cx="12" cy="10.3" r="2.3"/><path d="M8.3 16.2c.8-1.9 2.1-2.8 3.7-2.8s2.9.9 3.7 2.8"/></svg>' },
    { id: "liquidity", name: "Liquidity", sub: "Pools, LP positions and LP locks for any token", status: "New", acc: "#39d0ff", href: "/arc#liquidity",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c3.2 3.8 5.5 7 5.5 9.9a5.5 5.5 0 0 1-11 0c0-2.9 2.3-6.1 5.5-9.9z"/><path d="M9.3 14.2a2.8 2.8 0 0 0 2.7 2.4"/></svg>' },
  ];
  var NEXT = [
    { id: "next-7", sub: "On the drawing board" },
    { id: "next-8", sub: "Details soon" },
  ];
  var ICON_SOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M6.7 17.3l2.1-2.1M15.2 8.8l2.1-2.1"/></svg>';

  function mountQuickBar() {
    var dock = document.querySelector("nav.ax-dock");
    if (!dock || document.querySelector("nav.ax-quick")) return;
    var bar = document.createElement("nav");
    bar.className = "ax-quick";
    bar.setAttribute("aria-label", "Quick actions");
    bar.innerHTML =
      '<a class="ax-quick-item ax-quick-launch" href="/arc#launch" data-arc-tab="launch"><span class="ax-quick-ico">' + ICON_ROCKET + '</span><span>Launch</span></a>' +
      '<a class="ax-quick-item" href="/arc#explore" data-arc-tab="explore"><span class="ax-quick-ico">' + ICON_GRID + '</span><span>Explore</span></a>' +
      '<button type="button" class="ax-quick-util" aria-haspopup="dialog" aria-expanded="false" aria-controls="ax-util" aria-label="Utilities" title="Utilities">' + ICON_INFINITY + '<span class="ax-plus-wrap">' + ICON_PLUS + "</span></button>";
    dock.parentNode.insertBefore(bar, dock);

    // Sit exactly one gap above the dock, whatever height it renders at, and
    // reserve exactly that much room at the bottom of the page (dock + bar +
    // gaps) so the last cards are never hidden behind them.
    // On a wide screen the two sit side by side in one row, centred as a pair
    // (html.ax-float-row), so they cover half the height.
    var root = document.documentElement, GAP = 12;
    var sync = function () {
      var d = dock.getBoundingClientRect(), q = bar.getBoundingClientRect();
      root.style.setProperty("--ax-dock-h", Math.round(d.height) + "px");
      var dockBottom = Math.max(0, window.innerHeight - d.bottom);
      var row = window.innerWidth >= 901 && q.width + GAP + d.width + 48 <= window.innerWidth;
      root.classList.toggle("ax-float-row", row);
      if (row) {
        root.style.setProperty("--ax-q-shift", -Math.round((GAP + d.width) / 2) + "px");
        root.style.setProperty("--ax-d-shift", Math.round((q.width + GAP) / 2) + "px");
        root.style.setProperty("--ax-q-lift", Math.round((d.height - q.height) / 2) + "px");
        root.style.setProperty("--ax-float-space", Math.round(dockBottom + Math.max(d.height, q.height) + 20) + "px");
      } else root.style.setProperty("--ax-float-space", Math.round(dockBottom + d.height + 10 + q.height + 20) + "px");
    };
    sync();
    if (window.ResizeObserver) { var ro = new ResizeObserver(sync); ro.observe(dock); ro.observe(bar); }
    window.addEventListener("resize", sync);

    // Out of the way while reading: hide on scroll down, back on scroll up
    // (and always shown near the top and at the very bottom of the page).
    var lastY = window.scrollY, acc = 0, ticking = false;
    var setHidden = function (h) { bar.classList.toggle("ax-quick-hidden", h); };
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = window.scrollY, dy = y - lastY;
        lastY = y;
        var atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
        if (y < 80 || atBottom || root.classList.contains("ax-float-row") || bar.classList.contains("ax-quick-pinned") || bar.classList.contains("util-open")) { acc = 0; setHidden(false); return; }
        acc = (acc > 0) === (dy > 0) ? acc + dy : dy; // distance travelled in the current direction
        if (acc > 24) setHidden(true);
        else if (acc < -16) setHidden(false);
      });
    }, { passive: true });
    document.addEventListener("arcpad:tab", function () { acc = 0; setHidden(false); });

    mountUtilities(bar);

    bar.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("[data-arc-tab]");
      if (!a || typeof window.arcpadShowTab !== "function") return; // other pages: normal navigation
      e.preventDefault();
      window.arcpadShowTab(a.getAttribute("data-arc-tab"));
    });

    var mark = function (tab) {
      Array.prototype.forEach.call(bar.querySelectorAll("[data-arc-tab]"), function (a) {
        if (a.getAttribute("data-arc-tab") === tab) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    };
    document.addEventListener("arcpad:tab", function (e) { mark(e.detail && e.detail.tab); });
    var active = document.querySelector(".bp-panel.active");
    if (active && typeof window.arcpadShowTab === "function") mark(active.id.replace("bp-panel-", ""));
  }
  // ---- Utilities panel: opens upwards from the infinity button, on phones
  // and desktop alike. Escape, the scrim or the button close it.
  function mountUtilities(bar) {
    var btn = bar.querySelector(".ax-quick-util");
    if (!btn) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var scrim = document.createElement("div");
    scrim.className = "ax-util-scrim";
    scrim.hidden = true;
    var panel = document.createElement("div");
    panel.className = "ax-util";
    panel.id = "ax-util";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Utilities");
    panel.setAttribute("tabindex", "-1");
    panel.hidden = true;
    var tile = function (u, i) {
      var tag = u.href ? "a" : "div";
      return "<" + tag + ' class="ax-util-tile' + (u.soon ? " is-soon" : "") + (u.href ? "" : " is-off") + '" data-util="' + u.id + '" style="--acc:' + u.acc + ";--i:" + i + '"' +
        (u.href ? ' href="' + u.href + '"' : ' aria-disabled="true"') + ">" +
        '<span class="ax-util-ico">' + (u.ico || ICON_SOON) + "</span>" +
        '<span class="ax-util-txt"><strong>' + u.name + "</strong><small>" + u.sub + "</small></span>" +
        '<em class="ax-util-st">' + u.status + "</em></" + tag + ">";
    };
    var next = function (u, i) {
      return '<div class="ax-util-tile is-soon is-off is-next" data-util="' + u.id + '" style="--acc:#8c98a6;--i:' + i + '" aria-disabled="true">' +
        '<span class="ax-util-ico ax-util-q" aria-hidden="true"><b>?</b></span>' +
        '<span class="ax-util-txt"><strong>Coming soon</strong><small>' + u.sub + "</small></span>" +
        '<em class="ax-util-st">Soon</em><i class="ax-util-no" aria-hidden="true">0' + (i + 5) + "</i></div>";
    };
    panel.innerHTML =
      '<div class="ax-util-head"><span class="ax-util-mark">' + ICON_INFINITY + '</span><div><strong>Utilities</strong><small>Tools for everyone on Arc</small></div>' +
      '<button type="button" class="ax-util-x" aria-label="Close">' + ICON_PLUS + "</button></div>" +
      '<div class="ax-util-pages" aria-roledescription="carousel">' +
        '<div class="ax-util-track">' +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 1 of 2" data-page="0">' + UTILS.map(tile).join("") + "</div>" +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 2 of 2" data-page="1">' + UTILS2.map(tile).join("") + NEXT.map(function (u, i) { return next(u, i + UTILS2.length); }).join("") + "</div>" +
        "</div></div>" +
      '<div class="ax-util-pager" role="tablist" aria-label="Pages">' +
        '<button type="button" role="tab" data-go-page="0" aria-selected="true" aria-label="Page 1">1</button>' +
        '<button type="button" role="tab" data-go-page="1" aria-selected="false" aria-label="Page 2">2</button>' +
      "</div>";
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    // ---- two pages: the numbers below, a swipe / drag, arrow keys or a sideways trackpad scroll ----
    var track = panel.querySelector(".ax-util-track"), pages = [].slice.call(panel.querySelectorAll(".ax-util-grid"));
    var page = 0, dragX = null, dragDx = 0, dragT = 0, moved = false;
    function goPage(n, instant) {
      page = Math.max(0, Math.min(pages.length - 1, n));
      track.classList.toggle("instant", !!instant || reduce);
      track.style.transform = "translateX(" + (-100 * page) + "%)";
      pages.forEach(function (g, i) { if (i === page) g.removeAttribute("inert"); else g.setAttribute("inert", ""); g.classList.toggle("on", i === page); });
      panel.querySelectorAll("[data-go-page]").forEach(function (b) { b.setAttribute("aria-selected", String(Number(b.getAttribute("data-go-page")) === page)); });
      panel.classList.toggle("on-p2", page === 1);
    }
    goPage(0, true);
    panel.querySelector(".ax-util-pager").addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-go-page]");
      if (b) goPage(Number(b.getAttribute("data-go-page")));
    });
    var vp = panel.querySelector(".ax-util-pages");
    vp.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragX = e.clientX; dragDx = 0; dragT = Date.now(); moved = false;
    });
    window.addEventListener("pointermove", function (e) {
      if (dragX == null) return;
      dragDx = e.clientX - dragX;
      if (!moved && Math.abs(dragDx) > 6) { moved = true; track.classList.add("instant"); try { vp.setPointerCapture(e.pointerId); } catch (err) { /* ok */ } }
      if (!moved) return;
      var edge = (page === 0 && dragDx > 0) || (page === pages.length - 1 && dragDx < 0);
      track.style.transform = "translateX(calc(" + (-100 * page) + "% + " + (edge ? dragDx / 3 : dragDx) + "px))";
    });
    var endDrag = function () {
      if (dragX == null) return;
      var dx = dragDx, fast = Math.abs(dx) / Math.max(1, Date.now() - dragT) > 0.4;
      dragX = null;
      if (!moved) return;
      var w = vp.clientWidth || 1;
      if ((Math.abs(dx) > w * 0.22 || (fast && Math.abs(dx) > 24)) && ((dx < 0 && page < pages.length - 1) || (dx > 0 && page > 0))) goPage(page + (dx < 0 ? 1 : -1));
      else goPage(page);
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    // a drag isn't a tap on the tile underneath
    vp.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    var wheelT = 0;
    vp.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) < 12 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (Date.now() - wheelT < 450) return;
      wheelT = Date.now();
      goPage(page + (e.deltaX > 0 ? 1 : -1));
    }, { passive: false });

    var open = false, closeT = 0;
    function place() {
      var r = bar.getBoundingClientRect();
      var w = Math.min(440, window.innerWidth - 24);
      var cx = r.left + r.width / 2;
      var left = Math.max(12, Math.min(window.innerWidth - w - 12, cx - w / 2));
      panel.style.width = w + "px";
      panel.style.left = left + "px";
      panel.style.bottom = Math.round(window.innerHeight - r.top + 10) + "px";
      // the panel grows out of the button
      var b = btn.getBoundingClientRect();
      panel.style.setProperty("--ox", Math.round(b.left + b.width / 2 - left) + "px");
    }
    function show() {
      if (open) return;
      open = true;
      clearTimeout(closeT);
      bar.classList.remove("ax-quick-hidden");
      bar.classList.add("util-open");
      btn.setAttribute("aria-expanded", "true");
      scrim.hidden = false; panel.hidden = false;
      // open on the page that holds the utility you're on
      var act = document.querySelector(".bp-panel.active"), here = act && /^\/arc(?:pad\.html)?\/?$/.test(location.pathname) ? act.id.replace("bp-panel-", "") : "";
      var cur = here ? panel.querySelector('.ax-util-tile[href="/arc#' + here + '"]') : null;
      Array.prototype.forEach.call(panel.querySelectorAll(".ax-util-tile[href]"), function (a) { if (a === cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
      goPage(cur ? Number(cur.parentNode.getAttribute("data-page")) || 0 : 0, true);
      place();
      void panel.offsetWidth;
      panel.classList.add("in"); scrim.classList.add("in");
      // focus moves into the panel itself (keyboard users Tab on from there)
      setTimeout(function () { if (open) panel.focus({ preventScroll: true }); }, reduce ? 0 : 180);
      if (typeof window.arcHaptic === "function") window.arcHaptic("tap");
    }
    function hide(back) {
      if (!open) return;
      open = false;
      bar.classList.remove("util-open");
      btn.setAttribute("aria-expanded", "false");
      panel.classList.remove("in"); scrim.classList.remove("in");
      closeT = setTimeout(function () { panel.hidden = true; scrim.hidden = true; }, reduce ? 0 : 260);
      if (back) btn.focus({ preventScroll: true });
    }
    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); if (open) hide(true); else show(); });
    scrim.addEventListener("click", function () { hide(false); });
    panel.querySelector(".ax-util-x").addEventListener("click", function () { hide(true); });
    panel.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a.ax-util-tile")) { hide(false); return; }
      var t = e.target.closest && e.target.closest(".ax-util-tile.is-off");
      if (!t) return;
      t.classList.remove("nudge"); void t.offsetWidth; t.classList.add("nudge");
    });
    document.addEventListener("keydown", function (e) {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); hide(true); return; }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && panel.contains(document.activeElement)) { e.preventDefault(); goPage(page + (e.key === "ArrowRight" ? 1 : -1)); return; }
      if (e.key !== "Tab") return;
      var f = [].slice.call(panel.querySelectorAll("a[href], button")).filter(function (el) { return !el.closest("[inert]"); }).concat([btn]);
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    window.addEventListener("resize", function () { if (open) place(); });
    document.addEventListener("arcpad:tab", function () { hide(false); });
    window.arcUtilities = { open: show, close: hide, list: UTILS.concat(UTILS2), page: function (n) { if (n == null) return page; goPage(n); } };
  }

  // ---- Dock: the "you are here" highlight slides from the page you came
  // from to this one (the item you clicked is remembered for one hop).
  function mountGlider() {
    var dock = document.querySelector("nav.ax-dock");
    if (!dock || dock.querySelector(".ax-dock-glider")) return;
    var items = [].slice.call(dock.querySelectorAll(".ax-dock-item"));
    var cur = items.findIndex(function (a) { return a.getAttribute("aria-current") === "page"; });
    var KEY = "ax-dock-from";
    dock.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest(".ax-dock-item");
      if (!a || cur < 0 || items.indexOf(a) === cur) return;
      try { sessionStorage.setItem(KEY, String(cur)); } catch (err) { /* private mode */ }
    });
    if (cur < 0) return;
    var g = document.createElement("span");
    g.className = "ax-dock-glider";
    g.setAttribute("aria-hidden", "true");
    dock.insertBefore(g, dock.firstChild);
    dock.classList.add("has-glider");
    var put = function (i) {
      var it = items[i];
      g.style.left = it.offsetLeft + "px"; g.style.top = it.offsetTop + "px";
      g.style.width = it.offsetWidth + "px"; g.style.height = it.offsetHeight + "px";
    };
    var from = null;
    try { from = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch (err) { from = null; }
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fi = from == null ? -1 : Number(from);
    if (!reduce && fi >= 0 && fi < items.length && fi !== cur) {
      put(fi);
      requestAnimationFrame(function () { requestAnimationFrame(function () { g.classList.add("glide"); put(cur); }); });
    } else { put(cur); requestAnimationFrame(function () { g.classList.add("glide"); }); }
    var re = function () { put(cur); };
    window.addEventListener("resize", re);
    if (window.ResizeObserver) new ResizeObserver(re).observe(dock);
  }

  // Loading skeletons: a live number that hasn't arrived yet shows a soft
  // shimmering bar instead of a bare "—". Only fields that are filled from
  // the network (not ones that stay "—" by design, like a disconnected
  // wallet's balance), and never longer than a few seconds — if the data
  // still isn't there the "—" comes back.
  function mountSkeletons() {
    var SEL = "[data-tk],[data-arl],[data-ac2],[data-lb],#ap-stat-vol,#ac2-liq,#rw-launches,#lkr-count,#apc-price,#apc-mcap,#apc-liq,#apc-vol,#apc-txns,#apc-holders-count,#apc-age";
    var els = [].slice.call(document.querySelectorAll(SEL)).filter(function (el) {
      return !el.children.length && el.textContent.trim() === "\u2014" && !el.closest("[data-no-skel]");
    });
    if (!els.length) return;
    els.forEach(function (el) {
      el.classList.add("arc-skel");
      if (getComputedStyle(el).display === "inline") el.classList.add("arc-skel-i");
      var mo = new MutationObserver(function () {
        if (el.textContent.trim() !== "\u2014") { el.classList.remove("arc-skel", "arc-skel-i"); mo.disconnect(); }
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
      el.__skelMo = mo;
    });
    setTimeout(function () { els.forEach(function (el) { el.classList.remove("arc-skel", "arc-skel-i"); if (el.__skelMo) el.__skelMo.disconnect(); }); }, 8000);
  }

  mountQuickBar();
  mountGlider();
  mountSkeletons();

  if (location.hash === "#rewards") location.replace("/reward");
  window.addEventListener("hashchange", function () { if (location.hash === "#rewards") openReward(); });
})();
