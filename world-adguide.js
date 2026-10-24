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
  function css() { if (document.getElementById("adg-css")) return; const l = document.createElement("link"); l.id = "adg-css"; l.rel = "stylesheet"; l.href = "/ad-guide.css" + (ctx.ver || ""); document.head.appendChild(l); }
  function paint() {
    if (!data || !el) return; const D = data[ctx.lang] || data.en;
    el.innerHTML = `<div class="wpg-in adg" role="document"><button type="button" class="wpg-x" data-x aria-label="${esc(D.close)}">×</button>${data.html(ctx.lang, tab, esc, 2)}</div>`;
    const b = el.querySelector(".wpg-in"); if (b) b.scrollTop = 0;
  }
  async function open(which) {
    if (which === "ad" || which === "studio") tab = which;
    if (!el) { el = document.createElement("div"); el.className = "wpg"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); document.body.appendChild(el);
      el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-x]")) return close(); const t = e.target.closest("[data-adg]"); if (t) { tab = t.dataset.adg; paint(); } }); }
    css(); el.hidden = false; el.innerHTML = `<div class="wpg-in adg"><p class="adg-lead">…</p></div>`; if (ctx.onOpen) ctx.onOpen();
    try { data = await load(); paint(); } catch { close(); throw new Error("guide"); }
  }
  function close() { if (el && !el.hidden) { el.hidden = true; if (ctx.onClose) ctx.onClose(); } }
  return { open, close, shown: () => !!(el && !el.hidden) };
}
