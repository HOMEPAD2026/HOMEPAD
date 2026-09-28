/* global state, connectWallet */
// arc-tglink.js — "Link your wallet to ARCIA on Telegram" (arcpad.html#tglink?c=<code>).
// ARCIA's bot (api/arcia-tg.mjs) sends people here from /link. They connect a wallet and sign one
// message (no transaction); the signature goes to /api/arcia-tg?link=1, which checks who signed it and
// ties the wallet to their Telegram account for /me, /watch and holder-only groups.
(function () {
  "use strict";
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  let box = null, busy = false;
  const code = () => { const m = /^#tglink\?(?:.*&)?c=([a-z0-9]{8,20})/.exec(location.hash); return m ? m[1] : null; };
  function close() {
    if (box) box.remove();
    box = null;
    if (/^#tglink/.test(location.hash) && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
  }
  function paint(html) {
    if (!box) {
      box = document.createElement("div");
      box.className = "tgl-back";
      box.innerHTML = '<div class="tgl-card" role="dialog" aria-modal="true" aria-labelledby="tgl-h"></div>';
      box.addEventListener("click", (e) => { if (e.target === box || e.target.closest("[data-tgl-close]")) close(); if (e.target.closest("[data-tgl-go]")) go(); });
      document.body.appendChild(box);
    }
    box.querySelector(".tgl-card").innerHTML = '<button type="button" class="tgl-x" data-tgl-close aria-label="Close">×</button>' +
      '<img src="/images/arcia-avatar-96.jpg" alt="" width="64" height="64" class="tgl-face">' + html;
  }
  async function open() {
    const c = code();
    if (!c) return;
    paint(`<h2 id="tgl-h">${T("Link your wallet to ARCIA")}</h2><p class="tgl-p">${T("Checking the link…")}</p>`);
    let info = null;
    try { const r = await fetch(`/api/arcia-tg?linkinfo=${c}`, { cache: "no-store" }); info = r.ok ? await r.json() : null; } catch { info = null; }
    if (!info || !info.message) { paint(`<h2 id="tgl-h">${T("This link expired")}</h2><p class="tgl-p">${T("Send /link to ARCIA on Telegram again for a new one.")}</p><a class="bp-btn-primary tgl-btn" href="https://t.me/ARCIAonArc_bot" target="_blank" rel="noopener">${T("Open ARCIA on Telegram")}</a>`); return; }
    box.__msg = info.message; box.__code = c;
    paint(`<h2 id="tgl-h">${T("Link your wallet to ARCIA")}</h2>
      <p class="tgl-p">${T("Connect the wallet you hold $ARCIRCLE in and sign one message. It's only a signature — no transaction, nothing can move.")}</p>
      <pre class="tgl-msg" data-no-i18n>${esc(info.message)}</pre>
      <button type="button" class="bp-btn-primary tgl-btn" data-tgl-go>${T("Connect & sign")}</button>
      <p class="tgl-note">${T("Then /me on Telegram shows your holdings, rank and airdrops, and holder-only groups let you in.")}</p>`);
  }
  async function go() {
    if (busy || !box) return;
    busy = true;
    const btn = box.querySelector("[data-tgl-go]");
    const set = (t) => { if (btn) btn.textContent = tr(t); };
    try {
      if (!state.account && typeof connectWallet === "function") { set("Connecting…"); await connectWallet(); }
      if (!state.account || !state.signer) { set("Connect & sign"); return; }
      set("Sign in your wallet…");
      const sig = await state.signer.signMessage(box.__msg);
      set("Linking…");
      const r = await fetch("/api/arcia-tg?link=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ c: box.__code, address: state.account, sig }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { paint(`<h2 id="tgl-h">${T("Couldn't link")}</h2><p class="tgl-p">${esc(tr(j.error || "Try again from Telegram."))}</p><a class="bp-btn-primary tgl-btn" href="https://t.me/ARCIAonArc_bot" target="_blank" rel="noopener">${T("Open ARCIA on Telegram")}</a>`); return; }
      if (typeof window.arcConfetti === "function") window.arcConfetti({ count: 90 });
      paint(`<h2 id="tgl-h">${T("Linked!")} 💙</h2><p class="tgl-p">${T("ARCIA sent you a message on Telegram. Try /me there.")}</p><p class="tgl-p" data-no-i18n><code>${esc(state.account)}</code></p><a class="bp-btn-primary tgl-btn" href="https://t.me/ARCIAonArc_bot" target="_blank" rel="noopener">${T("Back to Telegram")}</a>`);
    } catch (e) {
      set("Connect & sign");
      const m = e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? tr("You cancelled in your wallet.") : String(e && (e.shortMessage || e.message) || e).slice(0, 140);
      if (typeof window.arcToast === "function") window.arcToast(m);
    } finally { busy = false; }
  }
  window.addEventListener("hashchange", () => { if (code()) open(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && box) close(); });
  if (code()) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", open); else open(); }
})();
