/* global CONFIG */

// Small monochrome line icons (24x24, stroke = currentColor). Kept inline so
// the footer has zero extra requests; the social ones are brand marks, the
// rest are generic lucide-style glyphs.
const FT_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13c-1.5 1.5-1.5 4.5-1.5 4.5s3 0 4.5-1.5"/><path d="M14 4c3 0 6 1 6 1s-1 3-1 6c0 3-6 9-9 9l-4-4c0-3 6-12 8-12z"/><circle cx="14.5" cy="9.5" r="1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><path d="M12 17h.01"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/></svg>',
  loop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 6-8"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 15 2 2 4-4"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.05 2.5 2.6 10.13c-1.33.53-1.32 1.27-.24 1.6l4.98 1.55 11.5-7.25c.54-.33 1.04-.15.63.22L10.7 14.3l-.36 5.16c.52 0 .75-.24 1.03-.52l2.48-2.4 5.15 3.8c.95.52 1.63.25 1.87-.88l3.38-15.9c.36-1.39-.53-2.02-1.9-1.06z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>',
};
const ftIcon = (name) => `<span class="ft-ico" aria-hidden="true">${FT_ICONS[name] || ""}</span>`;

function renderSiteFooter() {
  const slot = document.getElementById("site-footer-slot");
  if (!slot) return;

  const DEAD = "0x0000000000000000000000000000000000dead";
  const isLive = (addr) => !!(addr && addr.length === 42 && addr.toLowerCase() !== DEAD);

  const dexscreenerUrl = `https://dexscreener.com/${CONFIG.DEXSCREENER_CHAIN_SLUG}/${CONFIG.DEXSCREENER_PAIR_ADDRESS}`;
  // $HOME and the rest of HOMEPAD (Hybrid + Instant) are both live on mainnet now.
  // Bonding Curve and Stock Pair are still deferred — see config.js.
  const homeContractUrl = homeExplorerUrl();

  const contractRow = (label, addr) => isLive(addr)
    ? `<a class="ft-link" href="${CONFIG.BLOCK_EXPLORER}/address/${addr}" target="_blank">${ftIcon("file")}<span>${label}</span></a>`
    : `<span class="ft-link ft-soon">${ftIcon("file")}<span>${label}</span><span class="soon-tag">soon</span></span>`;

  const contracts = [
    ["Hybrid Factory", CONFIG.HYBRID_FACTORY_ADDRESS],
    ["Hybrid Hook", CONFIG.HYBRID_HOOK_ADDRESS],
    ["Hybrid Swap Router", CONFIG.HYBRID_SWAP_ROUTER_ADDRESS],
    ["Bonding Curve Factory", CONFIG.FACTORY_ADDRESS],
    ["Instant Liquidity Factory", CONFIG.INSTANT_FACTORY_ADDRESS],
    ["Instant Hook", CONFIG.HOOK_ADDRESS],
    ["Instant Swap Router", CONFIG.SWAP_ROUTER_ADDRESS],
    ["Stock Pair Factory", CONFIG.PAIRED_FACTORY_ADDRESS],
    ["Stock Pair Hook", CONFIG.PAIRED_HOOK_ADDRESS],
    ["Stock Pair Swap Router", CONFIG.PAIRED_SWAP_ROUTER_ADDRESS],
  ];
  const liveCount = contracts.filter(([, a]) => isLive(a)).length;

  // The contracts list is long; on phones it starts collapsed.
  const contractsOpen = window.innerWidth > 640 ? " open" : "";

  slot.innerHTML = `
    <footer class="site-footer">
      <div class="wrap">

        <div class="ft-top">
          <div class="ft-brand">
            <div class="ft-brand-row">
              <img class="ft-avatar" src="images/apple-touch-icon.png" alt="" width="44" height="44">
              <div class="ft-wordmark">HOMEPAD <span class="ft-by">by $HOME</span></div>
            </div>
            <p class="ft-desc">Permissionless token launchpad on Robinhood Chain. Every launch pays rent, and rent goes home — a share of every trade fee buys back $HOME.</p>
            <div class="ft-social">
              <a href="https://x.com/HOMEonRobinhood" target="_blank" title="X">${FT_ICONS.x}</a>
              <a href="https://t.me/HOMEonRobin" target="_blank" title="Telegram">${FT_ICONS.telegram}</a>
              <a href="${dexscreenerUrl}" target="_blank" title="Dexscreener">${FT_ICONS.chart}</a>
              <a href="https://github.com/HOMEPAD2026/HOMEPAD" target="_blank" title="GitHub">${FT_ICONS.github}</a>
            </div>
          </div>

          <div class="ft-col">
            <h4>Platform</h4>
            <a class="ft-link" href="index.html">${ftIcon("home")}<span>Home</span></a>
            <a class="ft-link" href="explore.html">${ftIcon("compass")}<span>Explore</span></a>
            <a class="ft-link" href="launch.html" onclick="if (typeof openLaunchModal === 'function') { openLaunchModal(); return false; } return true;">${ftIcon("rocket")}<span>Launch a token</span></a>
            <a class="ft-link" href="explore.html#/profile">${ftIcon("user")}<span>My profile</span></a>
          </div>

          <div class="ft-col">
            <h4>Learn</h4>
            <a class="ft-link" href="mechanism.html">${ftIcon("help")}<span>How it works</span></a>
            <a class="ft-link" href="docs.html">${ftIcon("book")}<span>Docs</span></a>
            <a class="ft-link" href="flywheel.html">${ftIcon("loop")}<span>The Flywheel</span></a>
            <a class="ft-link" href="${homeContractUrl}" target="_blank">${ftIcon("link")}<span>$HOME contract</span></a>
          </div>

          <div class="ft-col">
            <h4>Quick guide</h4>
            <a class="ft-link" href="guide-launch.html">${ftIcon("rocket")}<span>Launch — Hybrid, Curve, or Instant</span></a>
            <a class="ft-link" href="guide-trade.html">${ftIcon("zap")}<span>Trade — every fee pays rent</span></a>
            <a class="ft-link" href="guide-rent.html">${ftIcon("shield")}<span>Rent goes home — $HOME buyback</span></a>
          </div>
        </div>

        <details class="ft-contracts"${contractsOpen}>
          <summary>
            <span class="ft-contracts-title">Contracts <span class="network-badge">Mainnet</span></span>
            <span class="ft-contracts-count">${liveCount} of ${contracts.length} live</span>
          </summary>
          <div class="ft-contracts-grid">
            ${contracts.map(([l, a]) => contractRow(l, a)).join("")}
            <a class="ft-link" href="https://docs.robinhood.com/chain" target="_blank">${ftIcon("link")}<span>Robinhood Chain docs</span></a>
          </div>
        </details>

        <div class="ft-bottom">
          <p class="ft-line">HOMEPAD — live on Robinhood Chain mainnet. Permissionless, no admin key: contracts can't stop or reverse a trade, and can't vouch for what anyone launches. Verify the contract address before you buy. Nothing here is financial advice.</p>
          <p class="ft-copy">© 2026 HOMEPAD</p>
        </div>

      </div>
    </footer>
  `;
}

/// The dropdown menu is positioned with `position:fixed`, computed here on
/// open, rather than plain CSS `position:absolute` — the shared <nav> has
/// `overflow-x:auto` for horizontal scroll on mobile, which also clips the
/// Y axis per the CSS spec, so an absolutely-positioned child would be cut
/// off. Fixed positioning escapes that since it's relative to the
/// viewport, not the scrolling ancestor.
function wireNavDropdown() {
  const dd = document.getElementById("nav-more");
  if (!dd) return;
  const trigger = dd.querySelector(".nav-more-trigger");
  const menu = dd.querySelector(".nav-more-menu");
  function positionMenu() {
    const r = trigger.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${r.bottom + 8}px`;
    menu.style.left = `${r.left}px`;
  }
  function open() { positionMenu(); dd.classList.add("is-open"); }
  function close() { dd.classList.remove("is-open"); }
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    dd.classList.contains("is-open") ? close() : open();
  });
  document.addEventListener("click", (e) => { if (!dd.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  window.addEventListener("resize", () => { if (dd.classList.contains("is-open")) positionMenu(); });
  window.addEventListener("scroll", () => { if (dd.classList.contains("is-open")) close(); }, { passive: true, capture: true });
}

document.addEventListener("DOMContentLoaded", renderSiteFooter);
document.addEventListener("DOMContentLoaded", wireNavDropdown);
