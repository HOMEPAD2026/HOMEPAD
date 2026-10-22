// world-partner.js — the Partner Village's windows: our official partners' utilities, one tap from the game. The first is
// the KAIRO Finance Hub (the KAIRO Tower, 2026-10-22): Swap, Klik and Disperse open on kairo.market in a new tab (stage A:
// links; nothing here signs or moves funds), with $ARCIRCLE's address ready to copy for a swap.
// Loaded by world-play.js the first time the tower (or Menu → Partner Village) is opened.
//
// ctx: { T, esc, toast, coarse, reduce, Snd?, arcircle }
const PARTNERS = {
  kairo: {
    name: "KAIRO", hub: "KAIRO Finance Hub", color: "#38e1d6", site: "https://kairo.market/", docs: "https://kairo.market/docs", x: "https://x.com/kairo_market",
    mark: "/images/partners/kairo-mark-256.webp", banner: "/images/partners/kairo-banner-1500.webp", banner2: "/images/partners/kairo-banner-750.webp",
    tools: [
      { id: "swap", ic: "🔄", url: "https://kairo.market/swap", title: "Swap", line: "Buy and swap $ARCIRCLE and other Arc tokens." },
      { id: "klik", ic: "⚡", url: "https://kairo.market/klik", title: "Klik", line: "Buy $ARCIRCLE the easy way with KAIRO Klik." },
      { id: "disperse", ic: "🎁", url: "https://kairo.market/disperse", title: "Disperse", line: "Send tokens to many wallets at once — for rewards, tournaments and community events." },
    ],
  },
};

export function createPartners(ctx) {
  const { T, esc } = ctx;
  let el = null;
  function shell() {
    if (el) return el;
    el = document.createElement("div"); el.className = "wpt"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
    document.body.appendChild(el);
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    return el;
  }
  function paint(id) {
    const P = PARTNERS[id] || PARTNERS.kairo, ar = ctx.arcircle;
    el.innerHTML = `<div class="wpt-card" style="--ac:${P.color}" tabindex="-1">
      <header class="wpt-hero"><picture><source media="(max-width: 760px)" srcset="${P.banner2}"><img src="${P.banner}" alt="${esc(P.name)}"></picture>
        <span class="wpt-tag">🤝 ${esc(T("Official partner"))}</span><button type="button" class="wpt-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
      <div class="wpt-body">
        <div class="wpt-head"><img class="wpt-mark" src="${P.mark}" alt=""><div><small>${esc(T("PARTNER VILLAGE"))}</small><h2>${esc(T(P.hub))}</h2><p>${esc(T("KAIRO's Web3 utilities on Arc, one tap from ARCIRCLE WORLD."))}</p></div></div>
        <div class="wpt-tools">${P.tools.map((t) => `<button type="button" class="wpt-tool" data-go="${esc(t.url)}"><i aria-hidden="true">${t.ic}</i><span><b>${esc(T(t.title))}</b><small>${esc(T(t.line))}</small></span><em aria-hidden="true">↗</em></button>`).join("")}</div>
        ${ar ? `<div class="wpt-addr"><span><small>${esc(T("$ARCIRCLE token address (paste it in Swap)"))}</small><code>${esc(ar)}</code></span><button type="button" data-copy="${esc(ar)}">${esc(T("Copy"))}</button></div>` : ""}
        <p class="wpt-note">🔒 ${esc(T("These open kairo.market in a new tab. Check the address and every transaction in your own wallet before you sign."))}</p>
        <div class="wpt-links"><button type="button" data-go="${esc(P.site)}">🌐 kairo.market</button><button type="button" data-go="${esc(P.docs)}">📘 ${esc(T("Docs"))}</button><button type="button" data-go="${esc(P.x)}">𝕏 @kairo_market</button></div>
        <div class="wpt-more"><b>🏘️ ${esc(T("More partners are coming to the Partner Village."))}</b></div>
      </div></div>`;
  }
  function open(id) { shell(); paint(id); el.hidden = false; const c = el.querySelector(".wpt-card"); if (c && !ctx.coarse) c.focus({ preventScroll: true }); }
  function close() { if (el) el.hidden = true; }
  async function onClick(e) {
    if (e.target === el || e.target.closest("[data-x]")) return close();
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.go) { const a = document.createElement("a"); a.href = b.dataset.go; a.target = "_blank"; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); a.remove(); return; }
    if (b.dataset.copy) { try { await navigator.clipboard.writeText(b.dataset.copy); ctx.toast(T("Copied")); } catch { ctx.toast(b.dataset.copy); } }
  }
  return { open, close, shown: () => !!(el && !el.hidden) };
}
