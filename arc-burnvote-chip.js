/* global CONFIG */
// arc-burnvote-chip.js — "$ARCIRCLE burned by CirclePad votes" on the hub
// (live bar), the $ARCIRCLE page (burn card) and ArcPad's $ARCIRCLE tab.
// Reads /api/social?circle=burns; shows nothing until the first vote.
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || CONFIG.CIRCLEPAD_VOTE_MODE !== "burn" || !/^0x[0-9a-fA-F]{40}$/.test(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS || "")) return;
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tok = (raw) => Math.round(Number(BigInt(raw || 0) / 10n ** 18n)).toLocaleString("en-US");
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  let d = null;
  function paint() {
    if (!d || !d.totals || !d.totals.votes) return;
    const burned = tok(d.totals.burned), last = d.events && d.events[0];
    // hub: one more item on the live bar
    const bar = document.getElementById("ax-livebar");
    if (bar) {
      let a = bar.querySelector("[data-lb-burnvote]");
      if (!a) { a = document.createElement("a"); a.className = "ax-lb-item"; a.href = "/circle#governance"; a.setAttribute("data-lb-burnvote", ""); bar.appendChild(a); }
      a.innerHTML = `<span>${esc(tr("Burned by votes"))}</span><b data-no-i18n>${burned}</b><span>$ARCIRCLE</span>`;
    }
    // $ARCIRCLE page burn card / ArcPad $ARCIRCLE tab
    const spots = [document.querySelector("#burn .ax-burn-main"), document.querySelector("#bp-panel-arcircle .ac2p-burned") && document.querySelector("#bp-panel-arcircle .ac2p-burned").closest("dl")];
    spots.forEach((host) => {
      if (!host) return;
      let el = host.querySelector(".arc-bv-chip");
      if (!el) { el = document.createElement("a"); el.className = "arc-bv-chip"; el.href = "/circle#governance"; host.appendChild(el); }
      el.innerHTML = `<i aria-hidden="true"></i><span><b data-no-i18n>${burned}</b> <span>${esc(tr("$ARCIRCLE burned by CirclePad votes"))}</span> · <b data-no-i18n>${d.totals.voters}</b> <span>${esc(tr("voters"))}</span></span>${last ? `<small><span data-no-i18n>${short(last.voter)}</span> <span>${esc(tr("burned"))}</span> <span data-no-i18n>${(last.votes * 1000).toLocaleString("en-US")}</span></small>` : ""}<em aria-hidden="true">→</em>`;
    });
  }
  async function load() {
    try { const r = await fetch("/api/social?circle=burns"); if (r.ok) { d = await r.json(); paint(); } } catch { /* next time */ }
  }
  load();
  setInterval(() => { if (!document.hidden) load(); }, 60000);
  document.addEventListener("arc:lang", paint);
})();
