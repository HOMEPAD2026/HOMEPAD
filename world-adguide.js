// world-adguide.js — the guide window for AGENT DIMENSION and ARCIRCLE Studio Lite (the owner's ask, 2026-10-24: easy, with
// the Studio in most detail). The words live in /ad-guide-data.js (window.ARC_AD_GUIDE, en/ko/zh/tr), shared with /game's
// guide section; this only draws them: two tabs, each part a card of numbered steps and tips.
// ctx: { lang, ver, esc, onOpen, onClose }
export function createAdGuide(ctx) {
  const { esc } = ctx;
  let el = null, tab = "ad", data = null, loading = null;
  function load() {
    if (window.ARC_AD_GUIDE) return Promise.resolve(window.ARC_AD_GUIDE);
    return loading || (loading = new Promise((ok, no) => { const s = document.createElement("script"); s.src = "/ad-guide-data.js" + (ctx.ver || ""); s.onload = () => (window.ARC_AD_GUIDE ? ok(window.ARC_AD_GUIDE) : no(new Error("no guide"))); s.onerror = () => { loading = null; no(new Error("guide didn't load")); }; document.head.appendChild(s); }));
  }
  const L = () => (data && (data[ctx.lang] || data.en)) || null;
  function paint() {
    const D = L(); if (!D || !el) return; const G = D[tab];
    const part = (p, i) => `<section class="wpg-part" style="--d:${i}"><h3><span aria-hidden="true">${p.icon}</span>${esc(p.h)}</h3>${p.p ? `<p>${esc(p.p)}</p>` : ""}
      ${p.steps ? `<ol class="wpg-steps">${p.steps.map(([ic, t, x]) => `<li><i aria-hidden="true">${ic}</i><span><b>${esc(t)}</b><small>${esc(x)}</small></span></li>`).join("")}</ol>` : ""}
      ${p.tips ? `<ul class="wpg-tips">${p.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</section>`;
    el.innerHTML = `<div class="wpg-in" role="document"><header class="wpg-h"><small>📖 ${esc(D.title)}</small><h2>${esc(G.title)}</h2><button type="button" class="wpg-x" data-x aria-label="${esc(D.close)}">×</button>
      <nav class="wpg-tabs">${["ad", "studio"].map((k) => `<button type="button" data-tab="${k}" class="${k === tab ? "on" : ""}">${k === "ad" ? "🤖" : "🎮"} ${esc(D.tabs[k])}</button>`).join("")}</nav></header>
      <div class="wpg-body"><p class="wpg-lead">${esc(G.lead)}</p>${G.parts.map(part).join("")}</div></div>`;
    const b = el.querySelector(".wpg-body"); if (b) b.scrollTop = 0;
  }
  async function open(which) {
    if (which === "ad" || which === "studio") tab = which;
    if (!el) { el = document.createElement("div"); el.className = "wpg"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); document.body.appendChild(el);
      el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-x]")) return close(); const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; paint(); } }); }
    el.hidden = false; el.innerHTML = `<div class="wpg-in"><p class="wpg-lead">…</p></div>`; if (ctx.onOpen) ctx.onOpen();
    try { data = await load(); paint(); } catch { close(); throw new Error("guide"); }
  }
  function close() { if (el && !el.hidden) { el.hidden = true; if (ctx.onClose) ctx.onClose(); } }
  return { open, close, shown: () => !!(el && !el.hidden) };
}
