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

  // The four utilities. Locker is next to build (ArcLock is already live on
  // Arc and takes any token); the other three are placeholders until they are
  // picked. Set href on an entry when its page exists.
  var UTILS = [
    { id: "locker", name: "Locker", sub: "Lock any Arc token until a date you pick", status: "Next up", acc: "#35d8d0",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/><circle cx="12" cy="15.5" r="1.4"/></svg>' },
    { id: "u2", name: "New utility", sub: "Coming soon", status: "Soon", acc: "#4d9fff", soon: true },
    { id: "u3", name: "New utility", sub: "Coming soon", status: "Soon", acc: "#39ff88", soon: true },
    { id: "u4", name: "New utility", sub: "Coming soon", status: "Soon", acc: "#ffc861", soon: true },
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
    var root = document.documentElement;
    var sync = function () {
      var d = dock.getBoundingClientRect(), q = bar.getBoundingClientRect();
      root.style.setProperty("--ax-dock-h", Math.round(d.height) + "px");
      var dockBottom = Math.max(0, window.innerHeight - d.bottom);
      root.style.setProperty("--ax-float-space", Math.round(dockBottom + d.height + 10 + q.height + 20) + "px");
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
        if (y < 80 || atBottom || bar.classList.contains("ax-quick-pinned") || bar.classList.contains("util-open")) { acc = 0; setHidden(false); return; }
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
    panel.innerHTML =
      '<div class="ax-util-head"><span class="ax-util-mark">' + ICON_INFINITY + '</span><div><strong>Utilities</strong><small>Tools for everyone on Arc</small></div>' +
      '<button type="button" class="ax-util-x" aria-label="Close">' + ICON_PLUS + "</button></div>" +
      '<div class="ax-util-grid">' + UTILS.map(function (u, i) {
        var tag = u.href ? "a" : "div";
        return "<" + tag + ' class="ax-util-tile' + (u.soon ? " is-soon" : "") + (u.href ? "" : " is-off") + '" data-util="' + u.id + '" style="--acc:' + u.acc + ";--i:" + i + '"' +
          (u.href ? ' href="' + u.href + '"' : ' aria-disabled="true"') + ">" +
          '<span class="ax-util-ico">' + (u.ico || ICON_SOON) + "</span>" +
          '<span class="ax-util-txt"><strong>' + u.name + "</strong><small>" + u.sub + "</small></span>" +
          '<em class="ax-util-st">' + u.status + "</em></" + tag + ">";
      }).join("") + "</div>";
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

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
      var t = e.target.closest && e.target.closest(".ax-util-tile.is-off");
      if (!t) return;
      t.classList.remove("nudge"); void t.offsetWidth; t.classList.add("nudge");
    });
    document.addEventListener("keydown", function (e) {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); hide(true); return; }
      if (e.key !== "Tab") return;
      var f = [].slice.call(panel.querySelectorAll("a[href], button")).concat([btn]);
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    window.addEventListener("resize", function () { if (open) place(); });
    document.addEventListener("arcpad:tab", function () { hide(false); });
    window.arcUtilities = { open: show, close: hide, list: UTILS };
  }

  mountQuickBar();

  if (location.hash === "#rewards") location.replace("/reward");
  window.addEventListener("hashchange", function () { if (location.hash === "#rewards") openReward(); });
})();
