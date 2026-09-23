// arcircle-hub.js — shared behaviour for the ARCIRCLE hub pages (index.html
// and arcircle.html, plus the dock on ArcPad / CirclePad / Reward): the quick
// bar above the dock, copy-to-clipboard for the $ARCIRCLE contract address,
// and redirecting old #rewards links to the Reward page. No chain calls.
(function () {
  "use strict";

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
      btn.textContent = "Copied";
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

  function mountQuickBar() {
    var dock = document.querySelector("nav.ax-dock");
    if (!dock || document.querySelector("nav.ax-quick")) return;
    var bar = document.createElement("nav");
    bar.className = "ax-quick";
    bar.setAttribute("aria-label", "Quick actions");
    bar.innerHTML =
      '<a class="ax-quick-item ax-quick-launch" href="/arc#launch" data-arc-tab="launch"><span class="ax-quick-ico">' + ICON_ROCKET + '</span><span>Launch</span></a>' +
      '<a class="ax-quick-item" href="/arc#explore" data-arc-tab="explore"><span class="ax-quick-ico">' + ICON_GRID + '</span><span>Explore</span></a>';
    dock.parentNode.insertBefore(bar, dock);

    // Sit exactly one gap above the dock, whatever height it renders at.
    var root = document.documentElement;
    var sync = function () { root.style.setProperty("--ax-dock-h", Math.round(dock.getBoundingClientRect().height) + "px"); };
    sync();
    if (window.ResizeObserver) new ResizeObserver(sync).observe(dock);
    else window.addEventListener("resize", sync);

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
  mountQuickBar();

  if (location.hash === "#rewards") location.replace("/reward");
  window.addEventListener("hashchange", function () { if (location.hash === "#rewards") openReward(); });
})();
