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

  // ---- Quick bar: a slim second floating row just above the dock with the
  // two things people come to do — launch a coin and browse launches. Both
  // go to ArcPad; on ArcPad itself they switch tabs in place.
  var ICON_ROCKET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3 2 4.5 5.4 4.5 9 0 2-.5 3.7-1.2 5l-3.3 3-3.3-3c-.7-1.3-1.2-3-1.2-5 0-3.6 1.5-7 4.5-9z"/><circle cx="12" cy="10.5" r="2"/><path d="M8 15.5l-3 1 .8-3.3M16 15.5l3 1-.8-3.3"/></svg>';
  var ICON_GRID = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/></svg>';

  var ICON_COIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/><path d="M9.5 9.6c0-1.2 1.1-2.1 2.5-2.1s2.5.8 2.5 1.9c0 2.5-5 1.2-5 3.7 0 1.1 1.1 1.9 2.5 1.9s2.5-.8 2.5-2"/></svg>';
  var ICON_CHART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 19.5h17"/><path d="M5 15l4.5-4.5 3.5 3 6-6.5"/><path d="M15 7h4v4"/></svg>';
  var ICON_WALLET = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 9.5h17"/><circle cx="16.5" cy="14" r="1.2"/><path d="M6 6l9-2.5 1 2.5"/></svg>';
  var ICON_ROAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="5.5" r="2"/><path d="M7.5 18.5h7a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7h7"/></svg>';

  function mountQuickBar() {
    var dock = document.querySelector("nav.ax-dock");
    if (!dock || document.querySelector("nav.ax-quick")) return;
    var bar = document.createElement("nav");
    bar.className = "ax-quick";
    bar.setAttribute("aria-label", "Quick actions");
    // CirclePad gets its own two: the round (Contribute while it's open —
    // circlepad-fx.js relabels it) and the leaderboard.
    // The $ARCIRCLE page and the Reward page get theirs too.
    var cp = document.body.classList.contains("circlepad-page");
    var rw = document.body.classList.contains("ax-reward-page");
    var tk = !rw && document.body.classList.contains("ax-token");
    var item = function (cls, href, ico, label, extra) {
      return '<a class="ax-quick-item' + (cls ? " " + cls : "") + '" href="' + href + '"' + (extra || "") + '><span class="ax-quick-ico">' + ico + "</span><span>" + label + "</span></a>";
    };
    bar.innerHTML = cp
      ? '<a class="ax-quick-item ax-quick-launch" href="#" data-cp="round"><span class="ax-quick-ico">' + ICON_ROCKET + '</span><span>The round</span></a>' +
        '<a class="ax-quick-item" href="#leaderboard" data-cp="leaderboard"><span class="ax-quick-ico">' + ICON_GRID + '</span><span>Leaderboard</span></a>'
      : tk ? item("ax-quick-launch", "/arc#arcircle", ICON_COIN, "Buy $ARCIRCLE") + item("", "#market", ICON_CHART, "Chart", ' data-scroll="market"')
      : rw ? item("ax-quick-launch", "#check", ICON_WALLET, "Check my wallet", ' data-scroll="check"') + item("", "#timeline", ICON_ROAD, "Roadmap", ' data-scroll="timeline"')
      : '<a class="ax-quick-item ax-quick-launch" href="/arc#launch" data-arc-tab="launch"><span class="ax-quick-ico">' + ICON_ROCKET + '</span><span>Launch</span></a>' +
        '<a class="ax-quick-item" href="/arc#explore" data-arc-tab="explore"><span class="ax-quick-ico">' + ICON_GRID + '</span><span>Explore</span></a>';
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
    // $ARCIRCLE / Reward: the hero already has these buttons, so the bar
    // only comes in once the hero's own actions have scrolled away — it never
    // sits on top of the first screen.
    var gate = (tk || rw) ? document.querySelector("main .ax-actions") : null;
    var gateOpen = !gate;
    if (gate && "IntersectionObserver" in window) {
      setHidden(true);
      new IntersectionObserver(function (ents) {
        var e = ents[ents.length - 1];
        gateOpen = !e.isIntersecting && e.boundingClientRect.top < 0;
        acc = 0;
        setHidden(!gateOpen);
      }).observe(gate);
    } else gateOpen = true;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = window.scrollY, dy = y - lastY;
        lastY = y;
        var atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
        if (!gateOpen) { acc = 0; setHidden(true); return; }
        if (y < 80 || atBottom || bar.classList.contains("ax-quick-pinned")) { acc = 0; setHidden(false); return; }
        acc = (acc > 0) === (dy > 0) ? acc + dy : dy; // distance travelled in the current direction
        if (acc > 24) setHidden(true);
        else if (acc < -16) setHidden(false);
      });
    }, { passive: true });
    document.addEventListener("arcpad:tab", function () { acc = 0; setHidden(false); });

    bar.addEventListener("click", function (e) {
      var sc = e.target.closest && e.target.closest("[data-scroll]");
      if (sc) {
        var target = document.getElementById(sc.getAttribute("data-scroll"));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
          try { history.replaceState(history.state, "", "#" + target.id); } catch (err) { /* fine */ }
          document.dispatchEvent(new CustomEvent("ax:quick", { detail: target.id }));
        }
        return;
      }
      var c = e.target.closest && e.target.closest("[data-cp]");
      if (c) { e.preventDefault(); document.dispatchEvent(new CustomEvent("circlepad:quick", { detail: c.getAttribute("data-cp") })); return; }
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
  mountQuickBar();

  if (location.hash === "#rewards") location.replace("/reward");
  window.addEventListener("hashchange", function () { if (location.hash === "#rewards") openReward(); });
})();
