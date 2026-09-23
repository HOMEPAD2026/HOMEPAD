// arcircle-hub.js — shared behaviour for the ARCIRCLE hub pages (index.html
// and arcircle.html): the "Reward — coming soon" popup opened from the
// floating dock, and copy-to-clipboard for the $ARCIRCLE contract address.
// No chain calls, no dependencies. index.html#rewards opens the popup
// directly, so the reward announcement can be linked from anywhere.
(function () {
  "use strict";

  var ICON_HOLDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/><path d="M9.5 9.6c0-1.2 1.1-2.1 2.5-2.1s2.5.8 2.5 1.9c0 2.5-5 1.2-5 3.7 0 1.1 1.1 1.9 2.5 1.9s2.5-.8 2.5-2"/></svg>';
  var ICON_CREATOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8z"/></svg>';

  var MODAL_HTML =
    '<div class="ax-modal-backdrop" data-close></div>' +
    '<div class="ax-modal-card">' +
      '<button type="button" class="ax-modal-x" data-close aria-label="Close">&times;</button>' +
      '<span class="ax-badge">Coming soon</span>' +
      '<h2 id="ax-reward-title">Rewards for holders &amp; creators</h2>' +
      '<p class="ax-modal-lede">We\'re building a reward system that gives back to the people who grow ARCIRCLE PAD — the ones who hold $ARCIRCLE and the ones who launch. It isn\'t live yet; here\'s what\'s on the way.</p>' +
      '<div class="ax-reward-grid">' +
        '<div class="ax-reward-card"><div class="ax-rc-ico">' + ICON_HOLDER + '</div>' +
          '<h3>Holder rewards</h3>' +
          '<p>For $ARCIRCLE holders, funded by what ArcPad and CirclePad earn.</p></div>' +
        '<div class="ax-reward-card"><div class="ax-rc-ico">' + ICON_CREATOR + '</div>' +
          '<h3>Creator rewards</h3>' +
          '<p>For creators who launch on ArcPad or raise on CirclePad and bring real activity to Arc.</p></div>' +
      '</div>' +
      '<div class="ax-next">' +
        '<div class="ax-next-title">In the next update</div>' +
        '<ul>' +
          '<li>Who qualifies — holder and creator eligibility</li>' +
          '<li>How rewards are funded, visible on-chain</li>' +
          '<li>Where and how to claim</li>' +
        '</ul>' +
      '</div>' +
      '<div class="ax-modal-actions">' +
        '<a class="ax-btn ax-btn-grad" href="/arcircle#flywheel">How $ARCIRCLE is funded</a>' +
        '<button type="button" class="ax-btn ax-btn-ghost" data-close>Close</button>' +
      '</div>' +
    '</div>';

  var modal = null;
  var lastFocus = null;

  function buildModal() {
    var el = document.createElement("div");
    el.className = "ax-modal";
    el.id = "ax-reward-modal";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "ax-reward-title");
    el.hidden = true;
    el.innerHTML = MODAL_HTML;
    document.body.appendChild(el);
    return el;
  }

  function focusables() {
    return Array.prototype.slice.call(
      modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    );
  }

  function openReward() {
    modal = modal || buildModal();
    if (!modal.hidden) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("ax-modal-open");
    var x = modal.querySelector(".ax-modal-x");
    if (x) x.focus();
  }

  function closeReward() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("ax-modal-open");
    if (location.hash === "#rewards" && window.history && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

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
    if (t.closest("[data-close]")) { closeReward(); return; }
    // Only this file's own .ax-copy buttons — arc-shared.js already handles
    // the .ac-copy[data-copy] buttons in the ArcPad/CirclePad Contracts tab.
    var copyBtn = t.closest(".ax-copy[data-copy]");
    if (copyBtn) handleCopy(copyBtn);
  });

  document.addEventListener("keydown", function (e) {
    if (!modal || modal.hidden) return;
    if (e.key === "Escape") { closeReward(); return; }
    if (e.key !== "Tab") return;
    var items = focusables();
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
      '<a class="ax-quick-item ax-quick-launch" href="/arc#launch" data-arc-tab="launch">' + ICON_ROCKET + '<span>Launch</span></a>' +
      '<a class="ax-quick-item" href="/arc#explore" data-arc-tab="explore">' + ICON_GRID + '<span>Explore</span></a>';
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

  if (location.hash === "#rewards") openReward();
  window.addEventListener("hashchange", function () { if (location.hash === "#rewards") openReward(); });
})();
