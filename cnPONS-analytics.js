// cnPONS-analytics.js — onchain analytics for $橋 (Chinese PONS) and the
// cnPONS Chinese-stock-pairing launchpad. Everything here is read live,
// same discipline as cnPONS.js: nothing hardcoded beyond the two token
// addresses this page is specifically about ($橋 itself, and the tickers
// in CONFIG.CN_STOCK_TICKERS which cnPONS.js also uses as candidates).
//
// This does NOT load cnPONS.js — that file's boot sequence wires up a lot
// of cnPONS.html-specific DOM (the launch form, the stock picker, etc.)
// that doesn't exist on this page, so it would throw on load. Instead the
// small subset needed here (loading the tracked stocks, loading launches
// paired against them) is reimplemented standalone, sharing only the
// generic helpers from app.js (withRetry, blockAtOrAfter, tokenRead,
// fetchDexscreenerStats, fmtCompact, short).
//
// Scope note: this page is English-only for now — the language toggle in
// the header just switches its own active state, it doesn't translate
// anything yet. Getting the analytics logic itself right took priority;
// happy to add full i18n here the same way cnPONS.html has it, on request.

const QIAO_ADDRESS = CONFIG.ADV_CN_FEATURED_TOKEN.address;
const HOLDER_DISPLAY_COUNT = 10;
const MAX_TRANSFER_EVENTS = 20000; // safety cap — see loadQiaoHolders()

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("#cn-lang-toggle button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#cn-lang-toggle button").forEach((x) => x.classList.toggle("active", x === b));
    });
  });
  document.getElementById("cn-subnav-forum").addEventListener("click", () => {
    document.getElementById("cn-soon-modal-head").textContent = "Forum — coming soon";
    document.getElementById("cn-soon-modal").classList.remove("hidden");
  });
  document.getElementById("cn-soon-modal-close").addEventListener("click", () => {
    document.getElementById("cn-soon-modal").classList.add("hidden");
  });
});

// ============================================================
// $橋 — burn history
// ============================================================
async function loadQiaoBurns() {
  const summaryEl = document.getElementById("qiao-burn-summary");
  const chartEl = document.getElementById("qiao-burn-chart");
  const legendEl = document.getElementById("qiao-burn-legend");
  try {
    const tok = tokenRead(QIAO_ADDRESS);
    const fromBlock = await blockAtOrAfter(CONFIG.PONS_V2_LIVE_SINCE, "pons");
    const [totalSupply, burnEvents] = await Promise.all([
      withRetry(() => tok.totalSupply()),
      withRetry(() => tok.queryFilter(tok.filters.Transfer(null, BURN_ADDRESS), fromBlock, "latest")),
    ]);
    const burnedTotal = burnEvents.reduce((sum, ev) => sum + ev.args.value, 0n);
    const pct = totalSupply > 0n ? Number((burnedTotal * 1000000n) / totalSupply) / 10000 : 0;

    if (!burnEvents.length) {
      summaryEl.innerHTML = `<strong>0</strong> burned so far.`;
      chartEl.innerHTML = `<div class="empty-state">No burns yet.</div>`;
      legendEl.innerHTML = "";
      return;
    }

    // Bucket by day if the burn history spans under ~45 days, else by week —
    // keeps the chart at a readable number of bars either way.
    const timestamps = await Promise.all(
      [...new Set(burnEvents.map((ev) => ev.blockNumber))].map((bn) => withRetry(() => readProvider().getBlock(bn)).then((b) => [bn, Number(b.timestamp)]))
    );
    const tsByBlock = new Map(timestamps);
    const spanDays = (Date.now() / 1000 - Math.min(...tsByBlock.values())) / 86400;
    const bucketDays = spanDays > 45 ? 7 : 1;
    const bucketSeconds = bucketDays * 86400;

    const buckets = new Map(); // bucketStart(unix) -> bigint burned
    for (const ev of burnEvents) {
      const ts = tsByBlock.get(ev.blockNumber);
      const bucketStart = Math.floor(ts / bucketSeconds) * bucketSeconds;
      buckets.set(bucketStart, (buckets.get(bucketStart) || 0n) + ev.args.value);
    }
    const sortedBuckets = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
    const maxAmt = Math.max(...sortedBuckets.map(([, v]) => Number(ethers.formatUnits(v, 18))));

    chartEl.innerHTML = sortedBuckets.map(([start, amt]) => {
      const amtNum = Number(ethers.formatUnits(amt, 18));
      const heightPct = maxAmt > 0 ? Math.max(2, (amtNum / maxAmt) * 100) : 2;
      const label = new Date(start * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `<div class="cn-bar" style="height:${heightPct}%" data-tip="${label}: ${fmtCompact(amtNum)}"></div>`;
    }).join("");
    legendEl.innerHTML = `<span>${new Date(sortedBuckets[0][0] * 1000).toLocaleDateString()}</span><span>${bucketDays === 7 ? "weekly" : "daily"} buckets</span><span>${new Date().toLocaleDateString()}</span>`;
    summaryEl.innerHTML = `<strong>${fmtCompact(Number(ethers.formatUnits(burnedTotal, 18)))}</strong> burned total (${pct.toFixed(4)}% of supply) across ${burnEvents.length} burn transaction${burnEvents.length === 1 ? "" : "s"}.`;
  } catch (err) {
    console.error("loadQiaoBurns failed", err);
    summaryEl.innerHTML = `<span class="err-detail">Couldn't load burn history: ${String(err && err.message || err)}</span>`;
    chartEl.innerHTML = "";
  }
}

// ============================================================
// $橋 — holder concentration
// ============================================================
// Reconstructs current balances from the full Transfer log rather than
// reading a pre-built holder list (no such API exists for an arbitrary
// ERC-20 here) — every transfer in either direction adjusts a running
// balance map. Capped at MAX_TRANSFER_EVENTS as a safety valve: $橋 is a
// small community token, not a high-frequency trading pair, so this is
// expected to comfortably finish, but an unexpectedly large log stops
// cleanly with a note rather than hanging the page.
async function loadQiaoHolders() {
  const summaryEl = document.getElementById("qiao-holder-summary");
  const listEl = document.getElementById("qiao-holder-list");
  try {
    const tok = tokenRead(QIAO_ADDRESS);
    const fromBlock = await blockAtOrAfter(CONFIG.PONS_V2_LIVE_SINCE, "pons");
    const [totalSupply, transfers] = await Promise.all([
      withRetry(() => tok.totalSupply()),
      withRetry(() => tok.queryFilter(tok.filters.Transfer(), fromBlock, "latest")),
    ]);

    let truncatedNote = "";
    let events = transfers;
    if (events.length > MAX_TRANSFER_EVENTS) {
      // A partial slice of the log can't give correct running balances —
      // missing early transfers corrupts the sum for every address that
      // was ever involved in one, not just recent activity. Honest "can't
      // compute this" beats a partial number that looks precise but isn't.
      summaryEl.innerHTML = `This token has ${transfers.length.toLocaleString()} transfers — too many to reconstruct holder balances reliably client-side (capped at ${MAX_TRANSFER_EVENTS.toLocaleString()}).`;
      listEl.innerHTML = "";
      return;
    }

    const balances = new Map();
    const bump = (addr, delta) => balances.set(addr, (balances.get(addr) || 0n) + delta);
    for (const ev of events) {
      const { from, to, value } = ev.args;
      if (from !== ethers.ZeroAddress && from !== BURN_ADDRESS) bump(from, -value);
      if (to !== ethers.ZeroAddress && to !== BURN_ADDRESS) bump(to, value);
    }
    const holders = [...balances.entries()]
      .filter(([, bal]) => bal > 0n)
      .sort((a, b) => (b[1] > a[1] ? 1 : -1));

    const top = holders.slice(0, HOLDER_DISPLAY_COUNT);
    const topSum = top.reduce((s, [, bal]) => s + bal, 0n);
    const topPct = totalSupply > 0n ? (Number(topSum * 10000n / totalSupply) / 100) : 0;

    summaryEl.innerHTML = `<strong>${holders.length.toLocaleString()}</strong> current holders. Top ${top.length} hold <strong>${topPct.toFixed(2)}%</strong> of supply.`;
    listEl.innerHTML = top.map(([addr, bal]) => {
      const pct = totalSupply > 0n ? Number(bal * 10000n / totalSupply) / 100 : 0;
      return `
        <div class="cn-holder-row">
          <div class="cn-holder-row-top"><span class="addr">${short(addr)}</span><span class="pct">${pct.toFixed(2)}%</span></div>
          <div class="cn-holder-bar-track"><div class="cn-holder-bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
        </div>`;
    }).join("");
  } catch (err) {
    console.error("loadQiaoHolders failed", err);
    summaryEl.innerHTML = `<span class="err-detail">Couldn't load holder data: ${String(err && err.message || err)}</span>`;
    listEl.innerHTML = "";
  }
}

// ============================================================
// Launchpad-wide: shared data load (tracked stocks + matching launches)
// ============================================================
// A lightweight, DOM-free version of what cnPONS.js's loadCnStocks() /
// loadCnExplore() do — same source data and matching logic, no rendering
// side effects tied to cnPONS.html's specific elements.
async function loadCnAnalyticsData() {
  const assetsRes = await withRetry(() => fetch(CONFIG.RH_STOCK_ASSETS_API).then((r) => r.json()));
  const wanted = new Set((CONFIG.CN_STOCK_TICKERS || []).map((s) => s.toUpperCase()));
  const stocks = (assetsRes.assets || [])
    .filter((a) => wanted.has((a.tokenSymbol || "").toUpperCase()) && a.status === "ASSET_STATUS_ACTIVE")
    .map((a) => ({
      symbol: a.tokenSymbol,
      name: (a.tokenName || "").replace(/\s*•\s*Robinhood Token$/i, ""),
      address: a.deployments?.find((d) => d.chainId === CONFIG.CHAIN_ID_DECIMAL)?.contractAddress || a.deployments?.[0]?.contractAddress,
      decimals: a.tokenDecimals || 18,
      multiplier: Number(a.currentMultiplier || 1),
    }))
    .filter((s) => s.address);
  const stockByAddr = new Map(stocks.map((s) => [s.address.toLowerCase(), s]));

  const f = pairedFactoryRead();
  const fromBlock = await blockAtOrAfter(CONFIG.CONTRACTS_LIVE_SINCE, "homepad");
  const events = await withRetry(() => f.queryFilter(f.filters.Launched(), fromBlock, "latest"));
  const candidates = events.filter((ev) => stockByAddr.has(ev.args.quoteToken.toLowerCase()));

  const launches = await Promise.all(candidates.map(async (ev) => {
    const stock = stockByAddr.get(ev.args.quoteToken.toLowerCase());
    const base = { token: ev.args.token, symbol: ev.args.symbol, name: ev.args.name, creator: ev.args.creator, stock };
    try {
      const idx = await withRetry(() => f.launchIndexOf(ev.args.token));
      const l = await withRetry(() => f.launches(idx - 1n));
      return { ...base, marketCapQuote: Number(ethers.formatUnits(l.initialVirtualQuote, stock.decimals)) };
    } catch {
      return { ...base, marketCapQuote: null };
    }
  }));

  if (launches.length) {
    const dexMap = await fetchDexscreenerStats(launches.map((l) => l.token));
    for (const l of launches) applyDexStats(l, dexMap.get(l.token.toLowerCase()));
  }

  return { stocks, launches };
}

// ============================================================
// Stock pairing leaderboard
// ============================================================
function renderStockLeaderboard(stocks, launches) {
  const el = document.getElementById("cn-stock-leaderboard");
  const bySymbol = new Map();
  for (const l of launches) {
    const key = l.stock.symbol;
    const cur = bySymbol.get(key) || { symbol: key, name: l.stock.name, count: 0, mcapUsd: 0 };
    cur.count += 1;
    cur.mcapUsd += l.marketCapUsd || 0;
    bySymbol.set(key, cur);
  }
  const rows = [...bySymbol.values()].sort((a, b) => b.mcapUsd - a.mcapUsd);
  if (!rows.length) { el.innerHTML = `<div class="empty-state">No launches yet.</div>`; return; }
  const maxMcap = Math.max(...rows.map((r) => r.mcapUsd), 1);
  el.innerHTML = rows.map((r) => `
    <div class="cn-lb-row">
      <div class="cn-lb-row-top"><span class="name">${r.symbol} — ${r.count} launch${r.count === 1 ? "" : "es"}</span><span class="val">${r.mcapUsd > 0 ? fmtUsd(r.mcapUsd) : "—"}</span></div>
      <div class="cn-lb-bar-track"><div class="cn-lb-bar-fill" style="width:${Math.max(2, (r.mcapUsd / maxMcap) * 100)}%"></div></div>
    </div>`).join("");
}

// ============================================================
// Paired coins' combined mcap vs. the Stock Token's own mcap
// ============================================================
async function renderMcapCompare(stocks, launches) {
  const el = document.getElementById("cn-mcap-compare");
  const symbolsWithLaunches = [...new Set(launches.map((l) => l.stock.symbol))];
  if (!symbolsWithLaunches.length) { el.innerHTML = `<div class="empty-state">No launches yet.</div>`; return; }

  const stockAddrs = symbolsWithLaunches.map((sym) => stocks.find((s) => s.symbol === sym)?.address).filter(Boolean);
  const dexMap = await fetchDexscreenerStats(stockAddrs);

  const rows = symbolsWithLaunches.map((sym) => {
    const stock = stocks.find((s) => s.symbol === sym);
    const stockMcap = stock ? dexMap.get(stock.address.toLowerCase())?.marketCapUsd : null;
    const coinsMcap = launches.filter((l) => l.stock.symbol === sym).reduce((s, l) => s + (l.marketCapUsd || 0), 0);
    return { sym, stockMcap, coinsMcap };
  }).filter((r) => r.stockMcap != null || r.coinsMcap > 0);

  if (!rows.length) { el.innerHTML = `<div class="empty-state">No Dexscreener data for either side yet.</div>`; return; }
  el.innerHTML = rows.map((r) => {
    const ratio = r.stockMcap ? r.coinsMcap / r.stockMcap : null;
    return `
      <div class="cn-lb-row">
        <div class="cn-lb-row-top"><span class="name">${r.sym}</span><span class="val">${ratio != null ? `${(ratio * 100).toFixed(1)}%` : "—"}</span></div>
        <div class="cn-mech-note" style="margin:0">coins: ${r.coinsMcap > 0 ? fmtUsd(r.coinsMcap) : "—"} · stock token itself: ${r.stockMcap != null ? fmtUsd(r.stockMcap) : "not indexed"}</div>
      </div>`;
  }).join("");
}

// ============================================================
// Liquidity health per stock — same signal the launch-form warning uses
// ============================================================
async function renderLiquidityHealth(stocks, launches) {
  const el = document.getElementById("cn-liquidity-health");
  const symbolsWithLaunches = [...new Set(launches.map((l) => l.stock.symbol))];
  const relevantStocks = symbolsWithLaunches.length
    ? stocks.filter((s) => symbolsWithLaunches.includes(s.symbol))
    : stocks.filter((s) => s.symbol === "BABA"); // before any launches exist, at least show the one stock the warning already names
  if (!relevantStocks.length) { el.innerHTML = `<div class="empty-state">Nothing to show yet.</div>`; return; }

  const dexMap = await fetchDexscreenerStats(relevantStocks.map((s) => s.address));
  el.innerHTML = relevantStocks.map((s) => {
    const stats = dexMap.get(s.address.toLowerCase());
    let level = "none", label = "No real trading found";
    if (stats && stats.liquidityUsd > 20000) { level = "high"; label = "Real liquidity"; }
    else if (stats && (stats.liquidityUsd > 0 || stats.volume24hUsd > 0)) { level = "low"; label = "Thin / intermittent"; }
    return `<div class="cn-flag-row"><span>${s.symbol} — ${s.name}</span><span class="cn-health-pill ${level}">${label}</span></div>`;
  }).join("");
}

// ============================================================
// Stocks with an active price adjustment (currentMultiplier != 1)
// ============================================================
function renderMultiplierFlags(stocks) {
  const el = document.getElementById("cn-multiplier-flags");
  const flagged = stocks.filter((s) => s.multiplier !== 1);
  if (!flagged.length) { el.innerHTML = `<div class="empty-state">None of the tracked stocks currently show an adjustment.</div>`; return; }
  el.innerHTML = flagged.map((s) => `<div class="cn-flag-row"><span>${s.symbol} — ${s.name}</span><span class="mult">×${s.multiplier.toFixed(4)}</span></div>`).join("");
}

// ============================================================
// Repeat launchers
// ============================================================
function renderRepeatLaunchers(launches) {
  const el = document.getElementById("cn-repeat-launchers");
  if (!launches.length) { el.innerHTML = `No launches yet.`; return; }
  const byCreator = new Map();
  for (const l of launches) byCreator.set(l.creator, (byCreator.get(l.creator) || 0) + 1);
  const repeatCreators = [...byCreator.values()].filter((n) => n > 1).length;
  const launchesFromRepeats = [...byCreator.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);
  el.innerHTML = `<strong>${byCreator.size}</strong> unique launcher${byCreator.size === 1 ? "" : "s"} so far. <strong>${repeatCreators}</strong> of them launched more than once, accounting for <strong>${launchesFromRepeats}</strong> of ${launches.length} total launches (${((launchesFromRepeats / launches.length) * 100).toFixed(0)}%).`;
}

(async () => {
  loadQiaoBurns();
  loadQiaoHolders();
  try {
    const { stocks, launches } = await loadCnAnalyticsData();
    renderStockLeaderboard(stocks, launches);
    renderMcapCompare(stocks, launches);
    renderLiquidityHealth(stocks, launches);
    renderMultiplierFlags(stocks);
    renderRepeatLaunchers(launches);
  } catch (err) {
    console.error("cnPONS-analytics load failed", err);
    ["cn-stock-leaderboard", "cn-mcap-compare", "cn-liquidity-health", "cn-multiplier-flags", "cn-repeat-launchers"].forEach((id) => {
      document.getElementById(id).innerHTML = `<span class="err-detail">Couldn't load: ${String(err && err.message || err)}</span>`;
    });
  }
})();
