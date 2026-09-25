/* global CONFIG, ARCIRCLE_LIVE */
// arcircle-tab.js — ArcPad's $ARCIRCLE tab and Home / Explore banners while
// $ARCIRCLE trades in a Uniswap v4 pool (launched on Argus, argus.world).
// Numbers come from arcToken (/api/social?token=arcircle, which scans the
// pool's Swap events and the token's transfers once for everyone); the chart
// is Dexscreener's embed of the pool; buying happens on Argus.
// arcircle-coin.js still runs the tab for a bonding-curve launch.
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !CONFIG.ARCIRCLE_TOKEN || CONFIG.ARCIRCLE_CURVE || !CONFIG.ARCIRCLE_POOL_ID) return;
  if (typeof ARCIRCLE_LIVE !== "undefined" && !ARCIRCLE_LIVE) return;
  const T = window.arcToken;
  if (!T) return;
  const F = T.fmt;
  const $ = (id) => document.getElementById(id);
  const panel = $("bp-panel-arcircle");
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const setAll = (sel, v) => document.querySelectorAll(sel).forEach((el) => { if (el.textContent !== v) el.textContent = v; });
  const age = (ts) => {
    if (!ts) return "—";
    const s = Math.max(0, Date.now() / 1000 - ts);
    return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
  };

  function paint(d) {
    if (!d || d.live === false) return;
    setAll('[data-ac2="price"]', F.price(d.price));
    setAll('[data-ac2="mcap"]', F.usd(d.mcap));
    if (!panel) return;
    const q = (k) => panel.querySelectorAll(`[data-tk="${k}"]`);
    q("change").forEach((el) => {
      const c = d.complete === false ? null : d.change24h;
      el.textContent = c == null ? "" : `${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(Math.abs(c) < 10 ? 2 : 1)}% 24h`;
      el.className = "ax-chg " + (c == null ? "" : c >= 0 ? "up" : "down");
    });
    if (d.partial) return; // only the pool's price answered (API unreachable)
    const liq = d.liquidity != null ? F.usd(d.liquidity) : "—";
    setAll('#bp-panel-arcircle [data-tk="liq-usd"]', liq);
    setAll('#bp-panel-arcircle [data-tk="argus-tax"]', F.tax(d));
    setAll('[data-tk="banner-sub"]', d.liquidity != null ? `Liquidity ${liq} · locked on Argus` : "Trading on Argus · liquidity locked");
    const indexing = d.complete === false;
    setAll('#bp-panel-arcircle [data-tk="vol"]', indexing ? "…" : F.usd(d.vol24h));
    setAll('#bp-panel-arcircle [data-tk="trades24"]', indexing ? "…" : String(d.trades24h));
    setAll('#bp-panel-arcircle [data-tk="holders"]', indexing ? "…" : String(d.holders));
    setAll('#bp-panel-arcircle [data-tk="age"]', age(d.launchedAt));
    const scan = $("ac2p-scan");
    if (scan) scan.textContent = indexing ? tr("Indexing the pool's history…") : "";
    // recent trades
    const box = $("ac2p-trades");
    if (box && !indexing) {
      const rows = (d.recent || []).slice(0, 12).map((t) => `<a class="ac2p-row" href="${F.explorer("tx", t.tx)}" target="_blank" rel="noopener">
          <span class="ac2p-s ${t.side}">${t.side === "buy" ? tr("Buy") : tr("Sell")}</span><b>${F.usd(t.usdc)}</b>
          <span class="ac2p-tok" data-no-i18n>${F.num(t.tokens)}</span><span class="ac2p-who" data-no-i18n>${F.short(t.trader)}</span><time>${F.ago(t.ts)}</time></a>`).join("");
      const html = rows || `<p class="ac2p-empty">${F.esc(tr("No trades yet."))}</p>`;
      if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
    }
    // treasury buybacks
    const bb = $("ac2p-bb");
    if (bb && d.buybacks && !indexing) {
      const b = d.buybacks;
      const head = `<div class="ac2p-bb-stats"><div><small>${F.esc(tr("Buybacks"))}</small><strong>${b.n}</strong></div><div><small>${F.esc(tr("USDC spent"))}</small><strong>${F.usd(b.usdc)}</strong></div><div><small>${F.esc(tr("$ARCIRCLE bought"))}</small><strong>${F.num(b.tokens)}</strong></div></div>`;
      const list = b.list.length ? b.list.slice(0, 6).map((x) => `<a class="ac2p-row" href="${F.explorer("tx", x.tx)}" target="_blank" rel="noopener"><span class="ac2p-s buy">${F.esc(tr("Buy"))}</span><b>${F.usd(x.usdc)}</b><span class="ac2p-tok" data-no-i18n>${F.num(x.tokens)}</span><span></span><time>${F.ago(x.ts)}</time></a>`).join("")
        : `<p class="ac2p-empty">${F.esc(tr("No buybacks yet — each one will appear here with its transaction."))}</p>`;
      const html = head + list;
      if (bb.__html !== html) { bb.innerHTML = html; bb.__html = html; }
    }
  }

  // Dexscreener's embed of the pool — loaded the first time the tab opens
  function chart() {
    const f = $("ac2p-frame");
    if (!f || f.__on) return;
    f.__on = true;
    const src = `https://dexscreener.com/arc/${encodeURIComponent(CONFIG.ARCIRCLE_POOL_ID)}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15`;
    f.innerHTML = `<iframe title="$ARCIRCLE chart on Dexscreener" loading="lazy" src="${src}"></iframe>`;
  }
  if (panel) {
    const onActive = () => { if (panel.classList.contains("active")) { chart(); if (location.hash !== "#arcircle" && history.replaceState) history.replaceState(null, "", "#arcircle"); } };
    new MutationObserver(onActive).observe(panel, { attributes: true, attributeFilter: ["class"] });
    onActive();
    if (location.hash === "#arcircle") { const nav = document.querySelector('.bp-nav-item[data-tab="arcircle"]'); if (nav) nav.click(); }
    const copy = $("ac2p-copy");
    if (copy) copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(CONFIG.ARCIRCLE_TOKEN); copy.textContent = tr("Copied"); } catch { copy.textContent = tr("Copy failed"); }
      setTimeout(() => { copy.textContent = tr("Copy"); }, 1400);
    });
  }
  T.subscribe(paint);
})();
