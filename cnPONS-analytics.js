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
// Scope note: bilingual (EN/中文), same data-i18n pattern as cnPONS.js —
// including the dynamic summary sentences below, not just static markup,
// since the set here is small and fixed-shape enough to be worth it.
// Shares its language preference with cnPONS.html via the same
// localStorage key (homepad.cnLang).

const QIAO_ADDRESS = CONFIG.ADV_CN_FEATURED_TOKEN.address;
const HOLDER_DISPLAY_COUNT = 10;
const MAX_TRANSFER_EVENTS = 20000; // safety cap — see loadQiaoHolders()

// ============================================================
// EN / 中文 — static copy + the dynamic summary sentences below (unlike
// cnPONS.html, which left dynamic strings English-only, this page
// translates those too since the set here is small and fixed-shape).
// Subnav/modal keys match cnPONS.js's own dictionary values for
// consistency — duplicated rather than shared, since these are two
// separate JS files with no module system between them.
// ============================================================
const CN_A_I18N = {
  en: {
    subnavExplore: "Explore", subnavForum: "Forum", subnavAnalytics: "Analytics", soonTag: "soon",
    soonBody: "This isn't live yet — still being built. Check back soon.", soonClose: "Got it",
    bnExplore: "Explore", bnStocks: "Stocks!", bnCommodities: "Commodities", bnLaunch: "Launch", bnRewards: "Rewards", bnAnalytics: "Analytics", bnDocs: "Docs",
    pageTitle: "Analytics",
    pageLede: `Onchain numbers behind $橋 and the cnPONS Chinese-stock launchpad — read directly from Robinhood Chain and Robinhood's own live registry, not typed in by hand.`,
    qiaoSectionHead: "🏮 $橋 (Chinese PONS)",
    burnTitle: "🔥 Burn history", holderTitle: "👥 Holder concentration",
    loading: "Loading…",
    launchpadSectionHead: "📊 cnPONS launchpad",
    launchpadNote: "Aggregated across every launch this page has found paired against a tracked Chinese stock.",
    leaderboardTitle: "🏆 Stock pairing leaderboard",
    compareTitle: "⚖️ Paired coins vs. the Stock Token itself",
    compareNote: "Combined market cap of coins launched against a stock, compared to that Stock Token's own market cap on Robinhood Chain.",
    liquidityTitle: "💧 Liquidity health by stock",
    liquidityNote: "From the same check behind the low-liquidity warning on the launch form — not a separate opinion.",
    multiplierTitle: "⚠️ Stocks with an active price adjustment",
    multiplierNote: `Stocks currently carrying a non-1.0 <code>currentMultiplier</code> — meaning a real corporate action has already happened at least once. No history of when, only that one is in effect now.`,
    repeatTitle: "🔁 Repeat launchers",
    noBurns: "No burns yet.", noLaunches: "No launches yet.",
    weekly: "weekly buckets", daily: "daily buckets",
    burnedTotal: (amt, pct, n) => `<strong>${amt}</strong> burned total (${pct}% of supply) across ${n} burn transaction${n === 1 ? "" : "s"}.`,
    burnedZero: (n) => `<strong>${n}</strong> burned so far.`,
    holderSummary: (n, top, pct) => `<strong>${n}</strong> current holders. Top ${top} hold <strong>${pct}%</strong> of supply.`,
    holderTooMany: (total, cap) => `This token has ${total} transfers — too many to reconstruct holder balances reliably client-side (capped at ${cap}).`,
    noDexData: "No Dexscreener data for either side yet.",
    coinsVsStock: (coins, stock) => `coins: ${coins} · stock token itself: ${stock}`,
    notIndexed: "not indexed",
    healthHigh: "Real liquidity", healthLow: "Thin / intermittent", healthNone: "No real trading found",
    noAdjustments: "None of the tracked stocks currently show an adjustment.",
    nothingYet: "Nothing to show yet.",
    repeatSummary: (unique, repeatN, repeatLaunches, total, pct) =>
      `<strong>${unique}</strong> unique launcher${unique === 1 ? "" : "s"} so far. <strong>${repeatN}</strong> of them launched more than once, accounting for <strong>${repeatLaunches}</strong> of ${total} total launches (${pct}%).`,
    launch: "launch", launches: "launches",
  },
  zh: {
    subnavExplore: "探索", subnavForum: "论坛", subnavAnalytics: "数据分析", soonTag: "即将上线",
    soonBody: "还没上线，仍在开发中，敬请期待。", soonClose: "知道了",
    bnExplore: "探索", bnStocks: "股票！", bnCommodities: "大宗商品", bnLaunch: "发行", bnRewards: "奖励", bnAnalytics: "数据分析", bnDocs: "文档",
    pageTitle: "数据分析",
    pageLede: `$橋 与 cnPONS 中国股票发行平台背后的链上数据——直接从 Robinhood Chain 和 Robinhood 官方实时注册表读取，绝不手动输入。`,
    qiaoSectionHead: "🏮 $橋（Chinese PONS）",
    burnTitle: "🔥 销毁历史", holderTitle: "👥 持有集中度",
    loading: "加载中…",
    launchpadSectionHead: "📊 cnPONS 发行平台",
    launchpadNote: "汇总了本页面发现的所有与已追踪中国股票配对的发行。",
    leaderboardTitle: "🏆 股票配对排行榜",
    compareTitle: "⚖️ 配对代币 vs. 股票代币本身",
    compareNote: "与某股票配对发行的代币的合计市值，对比该股票代币自身在 Robinhood Chain 上的市值。",
    liquidityTitle: "💧 各股票的流动性状况",
    liquidityNote: "与发行表单上流动性不足警告所用的检测完全相同——不是另一套单独的判断标准。",
    multiplierTitle: "⚠️ 当前存在价格调整的股票",
    multiplierNote: `目前带有非 1.0 <code>currentMultiplier</code> 的股票——意味着至少发生过一次真实的公司行为。这里不显示发生时间的历史记录，只显示当前是否生效。`,
    repeatTitle: "🔁 重复发行者",
    noBurns: "目前还没有销毁记录。", noLaunches: "目前还没有发行。",
    weekly: "按周统计", daily: "按日统计",
    burnedTotal: (amt, pct, n) => `累计销毁 <strong>${amt}</strong>（占供应量 ${pct}%），共 ${n} 笔销毁交易。`,
    burnedZero: (n) => `目前累计销毁 <strong>${n}</strong>。`,
    holderSummary: (n, top, pct) => `目前共有 <strong>${n}</strong> 位持有者。前 ${top} 名持有 <strong>${pct}%</strong> 的供应量。`,
    holderTooMany: (total, cap) => `该代币共有 ${total} 笔转账——数量过多，无法在客户端可靠地重建持有者余额（上限为 ${cap}）。`,
    noDexData: "双方目前都没有 Dexscreener 数据。",
    coinsVsStock: (coins, stock) => `配对代币：${coins} · 股票代币本身：${stock}`,
    notIndexed: "尚未被收录",
    healthHigh: "有真实流动性", healthLow: "流动性稀薄/间歇性", healthNone: "未发现真实交易",
    noAdjustments: "目前被追踪的股票中没有出现价格调整。",
    nothingYet: "目前暂无内容可显示。",
    repeatSummary: (unique, repeatN, repeatLaunches, total, pct) =>
      `目前共有 <strong>${unique}</strong> 位独立发行者。其中 <strong>${repeatN}</strong> 位发行超过一次，占全部 ${total} 次发行中的 <strong>${repeatLaunches}</strong> 次（${pct}%）。`,
    launch: "次发行", launches: "次发行",
  },
};

let cnALang = "en";
function applyCnALang(lang) {
  cnALang = lang;
  const dict = CN_A_I18N[lang] || CN_A_I18N.en;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (typeof dict[key] === "string") el.textContent = dict[key];
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (typeof dict[key] === "string") el.innerHTML = dict[key];
  });
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("#cn-lang-toggle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
  try { localStorage.setItem("homepad.cnLang", lang); } catch { /* private mode etc */ }
}

document.addEventListener("DOMContentLoaded", () => {
  let savedLang = "en";
  try { savedLang = localStorage.getItem("homepad.cnLang") || "en"; } catch { /* private mode etc */ }
  applyCnALang(savedLang);
  document.querySelectorAll("#cn-lang-toggle button").forEach((b) => {
    b.addEventListener("click", () => applyCnALang(b.dataset.lang));
  });
  function showCnASoon(labelKey) {
    const dict = CN_A_I18N[cnALang] || CN_A_I18N.en;
    document.getElementById("cn-soon-modal-head").textContent = `${dict[labelKey]} — ${cnALang === "zh" ? "即将上线" : "coming soon"}`;
    document.getElementById("cn-soon-modal").classList.remove("hidden");
  }
  document.getElementById("cn-subnav-forum").addEventListener("click", () => showCnASoon("subnavForum"));
  document.getElementById("cn-bn-commodities").addEventListener("click", () => showCnASoon("bnCommodities"));
  document.getElementById("cn-bn-rewards").addEventListener("click", () => showCnASoon("bnRewards"));
  document.getElementById("cn-bn-docs").addEventListener("click", () => showCnASoon("bnDocs"));
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
  const dict = () => CN_A_I18N[cnALang] || CN_A_I18N.en;
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
      summaryEl.innerHTML = dict().burnedZero("0");
      chartEl.innerHTML = `<div class="empty-state">${dict().noBurns}</div>`;
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
    legendEl.innerHTML = `<span>${new Date(sortedBuckets[0][0] * 1000).toLocaleDateString()}</span><span>${bucketDays === 7 ? dict().weekly : dict().daily}</span><span>${new Date().toLocaleDateString()}</span>`;
    summaryEl.innerHTML = dict().burnedTotal(fmtCompact(Number(ethers.formatUnits(burnedTotal, 18))), pct.toFixed(4), burnEvents.length);
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
  const dict = () => CN_A_I18N[cnALang] || CN_A_I18N.en;
  try {
    const tok = tokenRead(QIAO_ADDRESS);
    const fromBlock = await blockAtOrAfter(CONFIG.PONS_V2_LIVE_SINCE, "pons");
    const [totalSupply, transfers] = await Promise.all([
      withRetry(() => tok.totalSupply()),
      withRetry(() => tok.queryFilter(tok.filters.Transfer(), fromBlock, "latest")),
    ]);

    let events = transfers;
    if (events.length > MAX_TRANSFER_EVENTS) {
      // A partial slice of the log can't give correct running balances —
      // missing early transfers corrupts the sum for every address that
      // was ever involved in one, not just recent activity. Honest "can't
      // compute this" beats a partial number that looks precise but isn't.
      summaryEl.innerHTML = dict().holderTooMany(transfers.length.toLocaleString(), MAX_TRANSFER_EVENTS.toLocaleString());
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

    summaryEl.innerHTML = dict().holderSummary(holders.length.toLocaleString(), top.length, topPct.toFixed(2));
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
  const dict = () => CN_A_I18N[cnALang] || CN_A_I18N.en;
  const bySymbol = new Map();
  for (const l of launches) {
    const key = l.stock.symbol;
    const cur = bySymbol.get(key) || { symbol: key, name: l.stock.name, count: 0, mcapUsd: 0 };
    cur.count += 1;
    cur.mcapUsd += l.marketCapUsd || 0;
    bySymbol.set(key, cur);
  }
  const rows = [...bySymbol.values()].sort((a, b) => b.mcapUsd - a.mcapUsd);
  if (!rows.length) { el.innerHTML = `<div class="empty-state">${dict().noLaunches}</div>`; return; }
  const maxMcap = Math.max(...rows.map((r) => r.mcapUsd), 1);
  el.innerHTML = rows.map((r) => `
    <div class="cn-lb-row">
      <div class="cn-lb-row-top"><span class="name">${r.symbol} — ${r.count} ${r.count === 1 ? dict().launch : dict().launches}</span><span class="val">${r.mcapUsd > 0 ? fmtUsd(r.mcapUsd) : "—"}</span></div>
      <div class="cn-lb-bar-track"><div class="cn-lb-bar-fill" style="width:${Math.max(2, (r.mcapUsd / maxMcap) * 100)}%"></div></div>
    </div>`).join("");
}

// ============================================================
// Paired coins' combined mcap vs. the Stock Token's own mcap
// ============================================================
async function renderMcapCompare(stocks, launches) {
  const el = document.getElementById("cn-mcap-compare");
  const dict = () => CN_A_I18N[cnALang] || CN_A_I18N.en;
  const symbolsWithLaunches = [...new Set(launches.map((l) => l.stock.symbol))];
  if (!symbolsWithLaunches.length) { el.innerHTML = `<div class="empty-state">${dict().noLaunches}</div>`; return; }

  const stockAddrs = symbolsWithLaunches.map((sym) => stocks.find((s) => s.symbol === sym)?.address).filter(Boolean);
  const dexMap = await fetchDexscreenerStats(stockAddrs);

  const rows = symbolsWithLaunches.map((sym) => {
    const stock = stocks.find((s) => s.symbol === sym);
    const stockMcap = stock ? dexMap.get(stock.address.toLowerCase())?.marketCapUsd : null;
    const coinsMcap = launches.filter((l) => l.stock.symbol === sym).reduce((s, l) => s + (l.marketCapUsd || 0), 0);
    return { sym, stockMcap, coinsMcap };
  }).filter((r) => r.stockMcap != null || r.coinsMcap > 0);

  if (!rows.length) { el.innerHTML = `<div class="empty-state">${dict().noDexData}</div>`; return; }
  el.innerHTML = rows.map((r) => {
    const ratio = r.stockMcap ? r.coinsMcap / r.stockMcap : null;
    return `
      <div class="cn-lb-row">
        <div class="cn-lb-row-top"><span class="name">${r.sym}</span><span class="val">${ratio != null ? `${(ratio * 100).toFixed(1)}%` : "—"}</span></div>
        <div class="cn-mech-note" style="margin:0">${dict().coinsVsStock(r.coinsMcap > 0 ? fmtUsd(r.coinsMcap) : "—", r.stockMcap != null ? fmtUsd(r.stockMcap) : dict().notIndexed)}</div>
      </div>`;
  }).join("");
}

// ============================================================
// Liquidity health per stock — same signal the launch-form warning uses
// ============================================================
async function renderLiquidityHealth(stocks, launches) {
  const el = document.getElementById("cn-liquidity-health");
  const dict = () => CN_A_I18N[cnALang] || CN_A_I18N.en;
  const symbolsWithLaunches = [...new Set(launches.map((l) => l.stock.symbol))];
  const relevantStocks = symbolsWithLaunches.length
    ? stocks.filter((s) => symbolsWithLaunches.includes(s.symbol))
    : stocks.filter((s) => s.symbol === "BABA"); // before any launches exist, at least show the one stock the warning already names
  if (!relevantStocks.length) { el.innerHTML = `<div class="empty-state">${dict().nothingYet}</div>`; return; }

  const dexMap = await fetchDexscreenerStats(relevantStocks.map((s) => s.address));
  el.innerHTML = relevantStocks.map((s) => {
    const stats = dexMap.get(s.address.toLowerCase());
    let level = "none", label = dict().healthNone;
    if (stats && stats.liquidityUsd > 20000) { level = "high"; label = dict().healthHigh; }
    else if (stats && (stats.liquidityUsd > 0 || stats.volume24hUsd > 0)) { level = "low"; label = dict().healthLow; }
    return `<div class="cn-flag-row"><span>${s.symbol} — ${s.name}</span><span class="cn-health-pill ${level}">${label}</span></div>`;
  }).join("");
}

// ============================================================
// Stocks with an active price adjustment (currentMultiplier != 1)
// ============================================================
function renderMultiplierFlags(stocks) {
  const el = document.getElementById("cn-multiplier-flags");
  const dict = () => CN_A_I18N[cnALang] || CN_A_I18N.en;
  const flagged = stocks.filter((s) => s.multiplier !== 1);
  if (!flagged.length) { el.innerHTML = `<div class="empty-state">${dict().noAdjustments}</div>`; return; }
  el.innerHTML = flagged.map((s) => `<div class="cn-flag-row"><span>${s.symbol} — ${s.name}</span><span class="mult">×${s.multiplier.toFixed(4)}</span></div>`).join("");
}

// ============================================================
// Repeat launchers
// ============================================================
function renderRepeatLaunchers(launches) {
  const el = document.getElementById("cn-repeat-launchers");
  const dict = () => CN_A_I18N[cnALang] || CN_A_I18N.en;
  if (!launches.length) { el.innerHTML = dict().noLaunches; return; }
  const byCreator = new Map();
  for (const l of launches) byCreator.set(l.creator, (byCreator.get(l.creator) || 0) + 1);
  const repeatCreators = [...byCreator.values()].filter((n) => n > 1).length;
  const launchesFromRepeats = [...byCreator.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);
  el.innerHTML = dict().repeatSummary(byCreator.size, repeatCreators, launchesFromRepeats, launches.length, ((launchesFromRepeats / launches.length) * 100).toFixed(0));
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
