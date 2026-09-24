/* global state, APC, apcSpot, refreshAccountDependentViews */
// arc-uxfx.js — small motion layer for ArcPad and CirclePad:
//   • a thin gradient progress bar across the top whenever the tab changes
//   • the new tab slides in from the side it sits on in the menu
//   • connecting a wallet plays the two ARCIRCLE rings locking together
//   • on a coin page, the logo's rim sweeps green / red when the price ticks
// Everything is skipped under prefers-reduced-motion.
(function () {
  "use strict";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  // ---------------- tab progress bar + direction ----------------
  const panels = [...document.querySelectorAll(".bp-panel")];
  if (panels.length) {
    const bar = document.createElement("div");
    bar.className = "ux-bar";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    let barT = null;
    const runBar = () => {
      clearTimeout(barT);
      bar.classList.remove("run", "done"); void bar.offsetWidth;
      bar.classList.add("run");
      barT = setTimeout(() => { bar.classList.add("done"); }, 420);
    };
    let cur = panels.findIndex((p) => p.classList.contains("active"));
    const mo = new MutationObserver(() => {
      const i = panels.findIndex((p) => p.classList.contains("active"));
      if (i < 0 || i === cur) return;
      const prev = cur; cur = i;
      runBar();
      const p = panels[i];
      if (prev < 0 || p.id === "bp-panel-coin" || document.documentElement.classList.contains("vt-active")) return;
      p.classList.remove("ux-from-l", "ux-from-r"); void p.offsetWidth;
      p.classList.add(i > prev ? "ux-from-r" : "ux-from-l");
      setTimeout(() => p.classList.remove("ux-from-l", "ux-from-r"), 450);
    });
    panels.forEach((p) => mo.observe(p, { attributes: true, attributeFilter: ["class"] }));
  }

  // ---------------- wallet connected: rings lock together ----------------
  const bootAt = Date.now();
  let lastAcct = null;
  function ringsAt(el) {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const o = document.createElement("div");
    o.className = "ux-rings";
    o.style.left = `${r.left + r.width / 2}px`;
    o.style.top = `${r.top + r.height / 2}px`;
    o.innerHTML = '<svg viewBox="0 0 120 80" aria-hidden="true"><circle class="ux-r1" cx="46" cy="40" r="22"/><circle class="ux-r2" cx="74" cy="40" r="22"/></svg>';
    document.body.appendChild(o);
    el.classList.remove("ux-wallet-glow"); void el.offsetWidth; el.classList.add("ux-wallet-glow");
    setTimeout(() => { o.remove(); el.classList.remove("ux-wallet-glow"); }, 1500);
  }
  function onAccount() {
    const acct = typeof state !== "undefined" && state.account ? String(state.account).toLowerCase() : null;
    if (acct && !lastAcct && Date.now() - bootAt > 1500) {
      let seen = false;
      try { seen = sessionStorage.getItem("arcircle.rings") === acct; sessionStorage.setItem("arcircle.rings", acct); } catch (e) { /* ignore */ }
      if (!seen) setTimeout(() => { const w = document.getElementById("wallet-slot"); if (w) ringsAt(w); }, 60);
    }
    lastAcct = acct;
  }
  if (typeof refreshAccountDependentViews === "function") {
    const orig = refreshAccountDependentViews;
    // eslint-disable-next-line no-global-assign
    refreshAccountDependentViews = function () { orig.apply(this, arguments); try { onAccount(); } catch (e) { /* ignore */ } };
  }
  setTimeout(() => { try { onAccount(); } catch (e) { /* ignore */ } }, 1600);

  // ---------------- coin page: price tick ring ----------------
  const price = document.getElementById("apc-price");
  if (price && typeof APC !== "undefined") {
    let last = null, lastTok = null;
    new MutationObserver(() => {
      const wrap = document.querySelector("#bp-panel-coin .apc-logo-wrap");
      const spot = typeof apcSpot === "function" ? apcSpot() : null;
      const tok = APC.l && APC.l.token;
      if (!wrap || spot == null || !(spot > 0)) return;
      if (tok !== lastTok) { lastTok = tok; last = spot; return; }
      if (last != null && spot !== last) {
        wrap.classList.remove("ux-tick-up", "ux-tick-down"); void wrap.offsetWidth;
        wrap.classList.add(spot > last ? "ux-tick-up" : "ux-tick-down");
      }
      last = spot;
    }).observe(price, { childList: true, characterData: true, subtree: true });
  }
})();
