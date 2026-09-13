// cnPONS.js — pair a HOMEPAD launch against a real Robinhood Chain Stock
// Token for a Chinese company. Every stock address here is resolved LIVE
// from Robinhood's own public asset registry, proxied through our own
// /api/rh-stock-assets serverless function (CONFIG.RH_STOCK_ASSETS_API) —
// a direct browser fetch to api.robinhood.com failed with a CORS rejection,
// see api/rh-stock-assets.js — filtered to CONFIG.CN_STOCK_TICKERS. Nothing
// is hardcoded, so a wrong or fabricated address is never a risk a visitor
// is exposed to. See the disclaimer block on the page and the comment
// above PAIRED_FACTORY_ADDRESS in config.js for the known, unresolved
// corporate-action pricing risk this carries (the same reason QUOTE_TOKENS
// is empty on the main launch form).

const CN = { stocks: [], picked: null, launches: [] };

// ---------- Language toggle (EN / 中文) — static UI copy only. Company
// names/tickers come live from Robinhood's own registry and stay as-is
// regardless of language, same as any other proper noun. ----------
const CN_I18N = {
  en: {
    eyebrow: "real Robinhood Stock Tokens, resolved live 🇨🇳",
    lede: `Launch a coin paired with a real Chinese-company Stock Token on Robinhood Chain — Alibaba, PDD, Tencent Music, and more. Every address on this page is read live from <a href="https://docs.robinhood.com/chain/building-with-stock-tokens" target="_blank" rel="noopener">Robinhood's own public registry</a>, never typed in by hand.`,
    launchBtn: "Launch",
    statLive: "CN stocks live on-chain",
    statLaunches: "Launches paired so far",
    pickHead: "Pick a Chinese stock",
    pickNote: "The stock your market cap is measured in. Trades settle in the stock's own Stock Token on the curve.",
    searchPh: "Search by name or ticker…",
    loadingStocks: "Loading Stock Tokens from Robinhood's registry…",
    launchHead: "Launch, paired with your picked stock",
    multiplierHint: `Stock Tokens are Robinhood's, not HOMEPAD's — and they carry a <code>currentMultiplier</code> Robinhood adjusts on real corporate actions, which the pool's price won't automatically follow after launch.`,
    pickFirst: "Pick a stock above first.",
    nameLabel: "Name", namePh: "e.g. Example Token",
    symbolLabel: "Symbol", symbolPh: "e.g. EXMPL",
    logoLabel: "Logo", optional: "optional",
    logoPh: "paste an image URL, or upload a file below",
    uploadBtn: "📎 Upload a file",
    imageHint: "A hosted URL is best. Uploading a file embeds the image directly as data — fine for a small icon, but it's stored on-chain as text, so bigger files cost noticeably more gas to launch.",
    descLabel: "Description", descPh: "What's this coin about?",
    websiteLabel: "Website",
    websiteHint: "No dedicated on-chain field for this exists in any HOMEPAD launch contract yet (same on the main launch form) — so this gets folded into the description instead of silently going nowhere.",
    socialsLabel: "Socials",
    twitterPh: "X / Twitter URL", telegramPh: "Telegram URL", discordPh: "Discord URL",
    valuationLabel: "Starting valuation (in the stock's own units)",
    valuationSub: "how many of the stock token it'd take to buy the whole 1B supply at launch",
    numPh: "e.g. 1000",
    valuationHint: "Pick a stock above to pre-fill this from its current price. You can always change it.",
    feeLabel: "Your fee (rent)", feeSub: "optional add-on, 0–2%",
    devbuyLabel: "Dev buy",
    devbuyHint: "Buy your own tokens in the same transaction as the launch, paid in the picked stock's own token. Leave blank to skip.",
    pickStockFirstBtn: "Pick a stock first",
    allLaunchesHead: "All CN-paired launches",
    modalHead: "⚠️ Low liquidity — trading may be difficult",
    modalP1: "has very little real trading activity on Robinhood Chain right now. A coin paired against it may be hard to trade on either side — including buying the stock token itself if you want a dev buy.",
    modalP2: `<b>$BABA (Alibaba)</b> currently has the most real liquidity of any tracked Chinese stock, making it the more usable pair for now. This changes as adoption grows — it's a "for now" recommendation, not a permanent limit.`,
    modalBabaBtn: "Use $BABA instead", modalContinueBtn: "Continue anyway",
  },
  zh: {
    eyebrow: "真实的 Robinhood 股票代币，实时验证 🇨🇳",
    lede: `在 Robinhood Chain 上发行与真实中国公司股票代币配对的代币——阿里巴巴、拼多多、腾讯音乐等。本页面上的每个地址都是从 <a href="https://docs.robinhood.com/chain/building-with-stock-tokens" target="_blank" rel="noopener">Robinhood 官方公开注册表</a>实时读取的，绝不手动输入。`,
    launchBtn: "发行",
    statLive: "链上可用的中国股票",
    statLaunches: "已配对发行数量",
    pickHead: "选择一支中国股票",
    pickNote: "你的市值将以该股票计价，交易也以该股票代币在曲线上结算。",
    searchPh: "按名称或代码搜索…",
    loadingStocks: "正在从 Robinhood 注册表加载股票代币…",
    launchHead: "发行，与你选择的股票配对",
    multiplierHint: `股票代币归属于 Robinhood，而非 HOMEPAD——它们带有一个 <code>currentMultiplier</code>，Robinhood 会根据真实的公司行为（如拆股、分红）进行调整，而发行后资金池的价格不会自动跟随这一调整。`,
    pickFirst: "请先在上方选择一支股票。",
    nameLabel: "名称", namePh: "例如 Example Token",
    symbolLabel: "代码", symbolPh: "例如 EXMPL",
    logoLabel: "图标", optional: "可选",
    logoPh: "粘贴图片链接，或在下方上传文件",
    uploadBtn: "📎 上传文件",
    imageHint: "使用托管链接最理想。上传文件会将图片直接嵌入为数据——小图标没问题，但会以文本形式存储在链上，文件越大，发行所需的 gas 费越高。",
    descLabel: "简介", descPh: "这个代币是关于什么的？",
    websiteLabel: "网站",
    websiteHint: "目前所有 HOMEPAD 发行合约都还没有专门存储网站的字段（主发行页面也是如此）——所以这项内容会并入简介中保存，而不是被默默丢弃。",
    socialsLabel: "社交媒体",
    twitterPh: "X / Twitter 链接", telegramPh: "Telegram 链接", discordPh: "Discord 链接",
    valuationLabel: "起始估值（以该股票自身单位计）",
    valuationSub: "发行时买下全部 10 亿枚供应量所需的股票代币数量",
    numPh: "例如 1000",
    valuationHint: "在上方选择股票后会根据当前价格自动填入，你也可以随时修改。",
    feeLabel: "你的手续费（租金）", feeSub: "可选加成，0–2%",
    devbuyLabel: "开发者购买",
    devbuyHint: "在发行的同一笔交易中购买自己的代币，以所选股票自身的代币支付。留空即跳过。",
    pickStockFirstBtn: "请先选择股票",
    allLaunchesHead: "所有与中国股票配对的发行",
    modalHead: "⚠️ 流动性不足——交易可能较为困难",
    modalP1: "目前在 Robinhood Chain 上几乎没有真实交易活跃度。与其配对的代币在买卖两端都可能难以交易——包括如果你想做开发者购买，也很难买到该股票代币本身。",
    modalP2: `<b>$BABA（阿里巴巴）</b>目前是所有已追踪中国股票中流动性最好的，因此现阶段是更实用的配对选择。随着采用度提高，这个情况会改变——这只是"目前"的建议，并非永久限制。`,
    modalBabaBtn: "改用 $BABA", modalContinueBtn: "仍然继续",
  },
};

function applyCnLang(lang) {
  const dict = CN_I18N[lang] || CN_I18N.en;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] != null) el.textContent = dict[key];
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (dict[key] != null) el.innerHTML = dict[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key] != null) el.placeholder = dict[key];
  });
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("#cn-lang-toggle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
  try { localStorage.setItem("homepad.cnLang", lang); } catch { /* private mode etc — just won't persist */ }
}

// Robinhood's own logoUrl 404s for at least these two tickers (confirmed —
// broken image on the stock picker card). Locally-hosted fallback logos,
// used only as an override for tickers actually confirmed broken — every
// other ticker still uses Robinhood's own live logoUrl untouched. Extend
// this map if the same turns out to be true for others.
const CN_LOGO_OVERRIDES = { FUTU: "images/logo-futu.jpg", BABA: "images/logo-baba.jpg" };

async function loadCnStocks() {
  const grid = document.getElementById("cn-stock-grid");
  try {
    // withRetry (app.js) already treats "failed to fetch"/network errors as
    // transient and retries — this fetch was failing intermittently with no
    // retry before, which meant CN.stocks could end up empty for an
    // unlucky page load, and loadCnExplore() would then show a false
    // "no launches yet" instead of the real list (nothing in CN.stocks to
    // match a real launch's quoteToken against).
    const data = await withRetry(() => fetch(CONFIG.RH_STOCK_ASSETS_API).then((r) => r.json()));
    const wanted = new Set((CONFIG.CN_STOCK_TICKERS || []).map((s) => s.toUpperCase()));
    CN.stocks = (data.assets || [])
      .filter((a) => wanted.has((a.tokenSymbol || "").toUpperCase()) && a.status === "ASSET_STATUS_ACTIVE")
      .map((a) => ({
        symbol: a.tokenSymbol,
        name: (a.tokenName || "").replace(/\s*•\s*Robinhood Token$/i, ""),
        address: a.deployments?.find((d) => d.chainId === CONFIG.CHAIN_ID_DECIMAL)?.contractAddress || a.deployments?.[0]?.contractAddress,
        logoUrl: CN_LOGO_OVERRIDES[a.tokenSymbol] || a.logoUrl,
        decimals: a.tokenDecimals || 18,
        multiplier: Number(a.currentMultiplier || 1),
      }))
      .filter((s) => s.address)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error("loadCnStocks failed", err);
    grid.innerHTML = `<div class="empty-state">Couldn't reach Robinhood's asset registry. <span class="err-detail">${String(err && err.message || err)}</span></div>`;
    return;
  }
  document.getElementById("cn-stock-count").textContent = String(CN.stocks.length);
  renderStockGrid();
}

/// Renders the stock picker as a plain grid — search filters it in place.
function renderStockGrid() {
  const grid = document.getElementById("cn-stock-grid");
  const q = (document.getElementById("cn-stock-search").value || "").trim().toLowerCase();
  const rows = CN.stocks.filter((s) => !q || s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q));
  document.getElementById("cn-stock-picker-count").textContent = `${rows.length} available`;
  if (!rows.length) {
    grid.innerHTML = CN.stocks.length
      ? `<div class="empty-state">No match.</div>`
      : `<div class="empty-state">None of the tracked Chinese tickers are currently listed as active Stock Tokens on Robinhood Chain.</div>`;
    return;
  }
  grid.innerHTML = rows.map((s) => `
    <button type="button" class="cn-stock-card ${CN.picked && CN.picked.address === s.address ? "is-picked" : ""}" data-address="${s.address}">
      <img class="cn-stock-logo" src="${s.logoUrl}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span class="cn-stock-name">${s.name}</span>
      <span class="cn-stock-symbol">${s.symbol}</span>
      ${s.multiplier !== 1 ? `<span class="cn-stock-mult">×${s.multiplier.toFixed(4)} adj.</span>` : ""}
    </button>`).join("");
  grid.querySelectorAll(".cn-stock-card").forEach((btn) => {
    btn.addEventListener("click", () => pickStock(btn.dataset.address));
  });
}

function pickStock(address) {
  CN.picked = CN.stocks.find((s) => s.address === address) || null;
  renderStockGrid();
  const picked = document.getElementById("cn-launch-picked");
  const form = document.getElementById("cn-launch-form");
  const submitBtn = document.getElementById("cn-launch-submit");
  if (!CN.picked) { picked.style.display = ""; form.style.display = "none"; return; }
  picked.style.display = "none";
  form.style.display = "";
  submitBtn.disabled = false;
  submitBtn.textContent = `Launch, paired with ${CN.picked.symbol}`;
  document.getElementById("cn-devbuy").placeholder = "0.0"; // symbol now shown by the persistent suffix instead
  document.getElementById("cn-devbuy-suffix").textContent = CN.picked.symbol;
  document.getElementById("cn-launch").scrollIntoView({ behavior: "smooth", block: "start" });
  suggestCnStartValuation(CN.picked);
  if (CN.picked.symbol !== "BABA") showCnLiquidityWarning(CN.picked);
  updateCnDevBuyPreview();
}

/// Warns when a non-BABA stock is picked — BABA is currently the only
/// tracked Chinese stock with real trading activity on Robinhood Chain;
/// the rest have little to no real circulation, which can make both
/// dev-buying in and later trading the launched coin difficult.
function showCnLiquidityWarning(stock) {
  document.getElementById("cn-liquidity-modal-symbol").textContent = `$${stock.symbol}`;
  document.getElementById("cn-liquidity-modal").classList.remove("hidden");
}

/// Live "how many tokens would this buy" preview for the Dev buy field —
/// approximate constant-product math against the same virtual reserves
/// the launch itself will use (Starting valuation as the quote side,
/// DEFAULT_SUPPLY as the token side), same model every HOMEPAD bonding
/// curve already uses. Ignores the base trading fee, so the real result
/// on launch will be slightly lower than this — labeled "approximately"
/// rather than implying an exact quote.
function updateCnDevBuyPreview() {
  const el = document.getElementById("cn-devbuy-preview");
  const devBuyStr = document.getElementById("cn-devbuy").value.trim();
  const valuationStr = document.getElementById("cn-start-valuation").value.trim();
  if (!CN.picked || !devBuyStr || Number(devBuyStr) <= 0 || !valuationStr || Number(valuationStr) <= 0) {
    el.textContent = "";
    return;
  }
  const virtualQuote = Number(valuationStr);
  const supply = Number(CONFIG.DEFAULT_SUPPLY);
  const devBuy = Number(devBuyStr);
  const tokensOut = supply - (virtualQuote * supply) / (virtualQuote + devBuy);
  el.textContent = `≈ ${fmtCompact(tokensOut)} tokens (${((tokensOut / supply) * 100).toFixed(2)}% of supply) — approximate, before the trading fee.`;
}

/// Pre-fills "Starting valuation" from the stock's real current price,
/// matching Hybrid's own starting USD market cap — same convention as
/// computeQuoteEquivalentStartPrice() in app.js, just sourced from
/// Robinhood's live price API instead of Dexscreener (a stock that's never
/// been paired has no Dexscreener data to read). Never blocks the form —
/// on any failure this just leaves the field for manual entry, same as
/// before this existed.
async function suggestCnStartValuation(stock) {
  const input = document.getElementById("cn-start-valuation");
  const hint = document.getElementById("cn-valuation-hint");
  if (input.value.trim()) return; // don't clobber something the person already typed
  hint.textContent = `Looking up ${stock.symbol}'s current price…`;
  try {
    const [priceRes, virtualEthWei, ethUsd] = await Promise.all([
      fetch(`${CONFIG.RH_STOCK_PRICE_API}?symbol=${encodeURIComponent(stock.symbol)}`).then((r) => r.json()),
      hybridFactoryRead().initialVirtualEth(),
      getEthUsdPrice(),
    ]);
    const quote = priceRes?.quotes?.[0];
    const bid = Number(quote?.bid), ask = Number(quote?.ask);
    if (!quote || !(bid > 0) || !(ask > 0) || ethUsd == null) throw new Error("no live price available");
    const midPrice = (bid + ask) / 2;
    // currentMultiplier is "shares-per-token" — the raw per-share price
    // times that ratio gives the USD value of one raw on-chain token,
    // per Robinhood's own docs on mixing /prices with /assets.
    const tokenUsdValue = midPrice * stock.multiplier;
    const virtualEth = Number(ethers.formatEther(virtualEthWei));
    const startCapUsd = virtualEth * ethUsd;
    const quoteAmount = startCapUsd / tokenUsdValue;
    const suggested = quoteAmount >= 1000 ? String(Math.round(quoteAmount)) : quoteAmount.toPrecision(4);
    if (input.value.trim()) return; // picked another stock, or typed something, while this was in flight
    input.value = suggested;
    updateCnDevBuyPreview();
    hint.innerHTML = `Pre-filled from ${stock.symbol}'s current price (~$${midPrice.toFixed(2)}/share) — matches Hybrid's usual starting market cap. Adjust if you want a different valuation.`;
  } catch (err) {
    console.warn("suggestCnStartValuation failed", err);
    hint.textContent = `Couldn't look up a live price for ${stock.symbol} — enter a starting valuation by hand.`;
  }
}

/// Auto-scrolls a carousel right-to-left endlessly, and switches to
/// following the pointer while actively dragging — same technique as the
/// main homepage's launch carousel (home-stats.js), copied here rather than
/// loading that file, since it also boots its own $HOME-specific carousel
/// that has no place on this page.
function setupCarouselAutoScroll(viewport, track, itemCount) {
  if (!viewport || !track || itemCount === 0) return;

  const singleSetWidth = track.scrollWidth / 3;
  let currentScroll = singleSetWidth;
  viewport.scrollLeft = currentScroll;

  const SPEED = 0.5;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartScroll = 0;

  function wrap() {
    if (currentScroll >= singleSetWidth * 2) currentScroll -= singleSetWidth;
    if (currentScroll < 0) currentScroll += singleSetWidth;
  }

  function tick() {
    if (!isDragging) {
      currentScroll += SPEED;
      wrap();
      viewport.scrollLeft = currentScroll;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  viewport.addEventListener("pointerdown", (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartScroll = viewport.scrollLeft;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("dragging");
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    viewport.scrollLeft = dragStartScroll - (e.clientX - dragStartX);
  });
  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    viewport.classList.remove("dragging");
    currentScroll = viewport.scrollLeft;
    wrap();
    viewport.scrollLeft = currentScroll;
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("pointerleave", endDrag);
}

// ---------- Explore: existing launches paired against any tracked CN stock,
// rendered with the SAME launch-card component and carousel treatment used
// on the main homepage ----------
// Finds candidates via the factory's own Launched event log (bounded by
// CONTRACTS_LIVE_SINCE, the same bound every other page uses for HOMEPAD's
// own contracts) — cheaper and more robust than looping launches(i) over
// every index in the whole factory, and a single bounded log query can't
// drop one matching launch while keeping its neighbors the way N separate
// calls in one Promise.all could. Only for the (typically few) matches does
// this then fetch the full struct (imageUrl/description/socials/launchedAt),
// since the event itself doesn't carry those.
async function loadCnExplore() {
  if (!CN.stocks.length) {
    // Nothing to match a launch's quoteToken against — almost always means
    // loadCnStocks() itself failed (see its own error message above), not
    // that there are genuinely zero launches. Say so plainly instead of
    // rendering a false "no launches yet".
    document.getElementById("cn-explore-track").innerHTML = `<div class="empty-state">Couldn't check for launches — Chinese stock data didn't load (see above). Try refreshing.</div>`;
    return;
  }
  const f = pairedFactoryRead();
  const fromBlock = await blockAtOrAfter(CONFIG.CONTRACTS_LIVE_SINCE, "homepad");
  const events = await withRetry(() => f.queryFilter(f.filters.Launched(), fromBlock, "latest"));
  const stockByAddr = new Map(CN.stocks.map((s) => [s.address.toLowerCase(), s]));
  const candidates = events.filter((ev) => stockByAddr.has(ev.args.quoteToken.toLowerCase()));

  // Never drop a matched candidate outright on an enrichment failure —
  // that's the same all-or-nothing failure mode the earlier index-looping
  // approach had, just moved to a different call. If launchIndexOf/
  // launches(idx) fails for any reason, fall back to what the Launched
  // event itself already carries (token/name/symbol/creator/quoteToken)
  // plus the block's own timestamp — the card just shows with less detail
  // (no image/socials) instead of vanishing.
  const built = await Promise.all(candidates.map(async (ev) => {
    const stock = stockByAddr.get(ev.args.quoteToken.toLowerCase());
    const base = { token: ev.args.token, symbol: ev.args.symbol, name: ev.args.name, creator: ev.args.creator, type: "paired", quoteSymbol: stock.symbol, stock };
    try {
      // launchIndexOf returns realIndex + 1 (0 is the "not found" sentinel,
      // since Solidity mappings default to 0) — confirmed against app.js's
      // own findPairedLaunchMeta(), which does the same idx-1n subtraction.
      // Without it, this called launches(idx) one past the real slot —
      // harmless for an old launch (just reads a neighbor's data), but for
      // a RECENT launch idx can equal launchCount() itself, an
      // out-of-bounds read that reverts — which is exactly why newer
      // launches were silently falling back to the placeholder thumbnail.
      const idx = await withRetry(() => f.launchIndexOf(ev.args.token));
      const l = await withRetry(() => f.launches(idx - 1n));
      return {
        ...base, launchedAt: Number(l.launchedAt), imageUrl: l.imageUrl,
        twitter: l.twitter, telegram: l.telegram, discord: l.discord,
        marketCapQuote: Number(ethers.formatUnits(l.initialVirtualQuote, stock.decimals)),
      };
    } catch (err) {
      console.warn("cn explore: full launch data failed for", ev.args.token, "— showing with reduced detail", err);
      const launchedAt = await withRetry(() => readProvider().getBlock(ev.blockNumber)).then((b) => Number(b.timestamp)).catch(() => 0);
      return { ...base, launchedAt, imageUrl: "", twitter: "", telegram: "", discord: "", marketCapQuote: null };
    }
  }));
  CN.launches = built;

  // Overlay real market data where it exists: the pair's own Dexscreener
  // stats if indexed, else the stock's own live price as a fallback (same
  // two-step applyDexStats/applyQuoteUsdFallback pattern the main
  // homepage's cards already use for every other paired launch).
  if (CN.launches.length) {
    const dexMap = await fetchDexscreenerStats(CN.launches.map((l) => l.token));
    const stockPrices = await loadCnStockUsdPrices([...new Set(CN.launches.map((l) => l.stock.symbol))]);
    for (const l of CN.launches) {
      applyDexStats(l, dexMap.get(l.token.toLowerCase()));
      const stockPriceUsd = stockPrices.get(l.stock.symbol);
      if (stockPriceUsd != null) applyQuoteUsdFallback(l, { priceUsd: stockPriceUsd });
    }
  }

  // Market cap descending — marketCapUsd may be missing for a launch
  // where neither Dexscreener nor the stock's own live price resolved;
  // those sort to the bottom rather than breaking the sort.
  CN.launches.sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1));
  document.getElementById("cn-launch-count").textContent = String(CN.launches.length);
  renderCnExplore();
}

/// Live USD price for a set of stock symbols (mid of bid/ask, multiplier-
/// adjusted to a per-raw-token value — same conversion as
/// suggestCnStartValuation) — used only as a fallback for launches whose
/// own pool Dexscreener hasn't indexed yet. Best-effort: a symbol that
/// fails to price just isn't in the returned map, and its cards fall back
/// to showing marketCapQuote in the stock's own units instead of a $ figure.
async function loadCnStockUsdPrices(symbols) {
  const out = new Map();
  await Promise.all(symbols.map(async (sym) => {
    try {
      const stock = CN.stocks.find((s) => s.symbol === sym);
      const res = await fetch(`${CONFIG.RH_STOCK_PRICE_API}?symbol=${encodeURIComponent(sym)}`).then((r) => r.json());
      const quote = res?.quotes?.[0];
      const bid = Number(quote?.bid), ask = Number(quote?.ask);
      if (quote && bid > 0 && ask > 0 && stock) out.set(sym, ((bid + ask) / 2) * stock.multiplier);
    } catch { /* best-effort */ }
  }));
  return out;
}

function renderCnExplore() {
  const track = document.getElementById("cn-explore-track");
  const grid = document.getElementById("cn-explore-grid");
  if (!CN.launches.length) {
    track.innerHTML = `<div class="empty-state">No launches paired with a tracked Chinese stock yet — be the first.</div>`;
    grid.innerHTML = "";
    document.getElementById("cn-explore-grid-count").textContent = "";
    return;
  }
  const cardsHtml = CN.launches.map(launchCardHtml).join("");
  // Always loop the carousel, even with very few cards — three copies of
  // one card still visibly scrolls, which matters more here than a
  // "why bother looping two cards" purity argument.
  track.innerHTML = cardsHtml + cardsHtml + cardsHtml;
  setupCarouselAutoScroll(document.getElementById("cn-explore-viewport"), track, CN.launches.length);

  // Full flat grid at the bottom, same launch-card component, no looping —
  // same "grid-launches" pattern the main Explore page's own list uses.
  grid.innerHTML = cardsHtml;
  document.getElementById("cn-explore-grid-count").textContent = `${CN.launches.length} tracked`;
}

// ---------- Launch ----------
// ---------- Logo: URL field + file upload, same resize-to-256px pattern
// as the main launch form (app.js renderCreate) ----------
function wireCnImageUpload() {
  const imgInput = document.getElementById("cn-logo");
  const imgPreview = document.getElementById("cn-image-preview");
  const updatePreview = (url) => {
    imgPreview.innerHTML = url ? `<img src="${url}" onerror="this.parentElement.innerHTML='🏡'">` : "🏡";
  };
  imgInput.addEventListener("input", (e) => updatePreview(e.target.value.trim()));
  document.getElementById("cn-logo-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const hintEl = document.getElementById("cn-image-hint");
    const originalKb = Math.round(file.size / 1024);
    hintEl.innerHTML = "Resizing…";
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 256;
        let { width, height } = img;
        if (width > height && width > MAX_DIM) { height = Math.round(height * (MAX_DIM / width)); width = MAX_DIM; }
        else if (height > MAX_DIM) { width = Math.round(width * (MAX_DIM / height)); height = MAX_DIM; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const resized = canvas.toDataURL("image/jpeg", 0.85);
        const resizedKb = Math.round((resized.length * 0.75) / 1024);
        imgInput.value = resized;
        updatePreview(resized);
        hintEl.innerHTML = `Resized from ${originalKb}KB to ~${resizedKb}KB (${width}×${height}) — safe to launch with.`;
      };
      img.onerror = () => { hintEl.innerHTML = `<strong style="color:var(--red)">Couldn't read that file as an image.</strong>`; };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Fee slider: same preview numbers as the main launch form
// (app.js renderCreate) — illustrative base-fee split, not fetched live
// per-factory, matching how the main form already presents it ----------
function wireCnFeePreview() {
  const BASE_FEE_BPS = 100, CREATOR_SHARE_BPS = 7000;
  const slider = document.getElementById("cn-extrafee");
  const preview = document.getElementById("cn-fee-preview");
  const render = () => {
    const extraBps = Number(slider.value);
    const totalBps = BASE_FEE_BPS + extraBps;
    const baseCreatorBps = (BASE_FEE_BPS * CREATOR_SHARE_BPS) / 10000;
    const basePlatformBps = BASE_FEE_BPS - baseCreatorBps;
    const creatorTotalBps = baseCreatorBps + extraBps;
    const pct = (bps) => (bps / 100).toFixed(2) + "%";
    preview.innerHTML = `
      <div class="fee-preview-total">Total fee (rent): <strong>${pct(totalBps)}</strong></div>
      <div class="fee-preview-row"><span>Base fee (rent)</span><span>${pct(BASE_FEE_BPS)}</span></div>
      <div class="fee-preview-row sub"><span>→ you (70%)</span><span>${pct(baseCreatorBps)}</span></div>
      <div class="fee-preview-row sub"><span>→ $HOME / platform (30%)</span><span>${pct(basePlatformBps)}</span></div>
      ${extraBps > 0 ? `<div class="fee-preview-row"><span>Your extra fee (rent)</span><span>${pct(extraBps)}</span></div><div class="fee-preview-row sub"><span>→ you (100%)</span><span>${pct(extraBps)}</span></div>` : ""}
      <div class="fee-preview-row highlight"><span>You earn per trade</span><span>${pct(creatorTotalBps)}</span></div>`;
  };
  slider.addEventListener("input", render);
  render();
}

async function submitCnLaunch(ev) {
  ev.preventDefault();
  const statusEl = document.getElementById("cn-launch-status");
  const btn = document.getElementById("cn-launch-submit");
  if (!CN.picked) { statusEl.innerHTML = `<div class="status error">Pick a stock first.</div>`; return; }
  const name = document.getElementById("cn-name").value.trim();
  const symbol = document.getElementById("cn-symbol").value.trim().toUpperCase();
  const imageUrl = document.getElementById("cn-logo").value.trim();
  const website = document.getElementById("cn-website").value.trim();
  // No dedicated on-chain field for a website exists in any HOMEPAD launch
  // contract yet (LaunchMeta is {imageUrl,description,twitter,telegram,
  // discord} everywhere — 5 fields, no website; ethers only encodes what
  // the ABI declares, so a separate value here would just be silently
  // dropped, same as it already is on the main launch form). Folding it
  // into the description instead means it's actually preserved somewhere.
  const descriptionRaw = document.getElementById("cn-description").value.trim();
  const description = website ? `${descriptionRaw}${descriptionRaw ? " · " : ""}Website: ${website}` : descriptionRaw;
  const twitter = document.getElementById("cn-twitter").value.trim();
  const telegram = document.getElementById("cn-telegram").value.trim();
  const discord = document.getElementById("cn-discord").value.trim();
  const startValuation = document.getElementById("cn-start-valuation").value.trim();
  const extraFeeBps = Number(document.getElementById("cn-extrafee").value);
  const devBuyStr = document.getElementById("cn-devbuy").value.trim();
  if (!name || !symbol || !startValuation) { statusEl.innerHTML = `<div class="status error">Name, symbol, and starting valuation are required.</div>`; return; }
  if (imageUrl.startsWith("data:") && imageUrl.length > 280_000) {
    statusEl.innerHTML = `<div class="status error">That embedded image is too large and will likely make the transaction fail — please use a hosted image URL instead, or a smaller file.</div>`;
    return;
  }

  if (!state.account) {
    statusEl.innerHTML = `<div class="status pending">Connect a wallet first…</div>`;
    await connectWallet();
    if (!state.account) { statusEl.innerHTML = `<div class="status error">Connect a wallet to launch.</div>`; return; }
  }

  btn.disabled = true;
  try {
    const initialVirtualQuote = ethers.parseUnits(startValuation, CN.picked.decimals);
    const devBuyQuote = devBuyStr && Number(devBuyStr) > 0 ? ethers.parseUnits(devBuyStr, CN.picked.decimals) : 0n;
    const meta = { imageUrl, description, twitter, telegram, discord };

    if (devBuyQuote > 0n) {
      // Dev buy is pulled with transferFrom in launchAndBuy — approve the
      // factory for the stock token first, same pattern the main launch
      // form's Token-pair mode already uses.
      const allowance = await tokenRead(CN.picked.address).allowance(state.account, CONFIG.PAIRED_FACTORY_ADDRESS);
      if (allowance < devBuyQuote) {
        statusEl.innerHTML = `<div class="status pending">Approve ${CN.picked.symbol} for the dev buy in your wallet…</div>`;
        const approveTx = typeof tryWagmiWrite === "function"
          ? await tryWagmiWrite({ address: CN.picked.address, abi: ERC20_ABI, functionName: "approve", args: [CONFIG.PAIRED_FACTORY_ADDRESS, devBuyQuote] })
          : null;
        if (approveTx) await approveTx.wait();
        else await (await tokenWrite(CN.picked.address).approve(CONFIG.PAIRED_FACTORY_ADDRESS, devBuyQuote)).wait();
      }
    }

    statusEl.innerHTML = `<div class="status pending">Confirm the launch in your wallet…</div>`;
    const functionName = devBuyQuote > 0n ? "launchAndBuy" : "launch";
    const args = devBuyQuote > 0n
      ? [name, symbol, CN.picked.address, initialVirtualQuote, extraFeeBps, meta, devBuyQuote]
      : [name, symbol, CN.picked.address, initialVirtualQuote, extraFeeBps, meta];
    let tx = typeof tryWagmiWrite === "function"
      ? await tryWagmiWrite({ address: CONFIG.PAIRED_FACTORY_ADDRESS, abi: PAIRED_FACTORY_ABI, functionName, args, value: 0n })
      : null;
    if (!tx) {
      if (typeof ensureAppKitChain === "function") await ensureAppKitChain();
      const overrides = await getTxOverrides(6_000_000n);
      tx = await pairedFactoryWrite()[functionName](...args, overrides);
    }
    statusEl.innerHTML = `<div class="status pending">Launching… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">tx ↗</a></div>`;
    const receipt = await tx.wait();
    statusEl.innerHTML = `<div class="status success">Launched, paired with ${CN.picked.symbol}. <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${receipt.hash}" target="_blank">tx ↗</a></div>`;
    document.getElementById("cn-launch-form").reset();
    document.getElementById("cn-image-preview").innerHTML = "🏡";
    loadCnExplore().catch((err) => console.error(err));
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<div class="status error">${String(err && (err.shortMessage || err.message) || err).slice(0, 220)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

(async () => {
  let savedLang = "en";
  try { savedLang = localStorage.getItem("homepad.cnLang") || "en"; } catch { /* private mode etc */ }
  applyCnLang(savedLang);
  document.querySelectorAll("#cn-lang-toggle button").forEach((b) => {
    b.addEventListener("click", () => applyCnLang(b.dataset.lang));
  });
  document.getElementById("cn-stock-search").addEventListener("input", renderStockGrid);
  document.getElementById("cn-launch-form").addEventListener("submit", submitCnLaunch);
  document.getElementById("cn-devbuy").addEventListener("input", updateCnDevBuyPreview);
  document.getElementById("cn-liquidity-modal-continue").addEventListener("click", () => {
    document.getElementById("cn-liquidity-modal").classList.add("hidden");
  });
  document.getElementById("cn-liquidity-modal-baba").addEventListener("click", () => {
    document.getElementById("cn-liquidity-modal").classList.add("hidden");
    const baba = CN.stocks.find((s) => s.symbol === "BABA");
    if (baba) pickStock(baba.address);
  });
  document.getElementById("cn-start-valuation").addEventListener("input", updateCnDevBuyPreview);
  wireCnImageUpload();
  wireCnFeePreview();
  await loadCnStocks();
  try { await loadCnExplore(); } catch (err) {
    console.error("loadCnExplore failed", err);
    document.getElementById("cn-explore-track").innerHTML = `<div class="empty-state">Couldn't load launches. <span class="err-detail">${String(err && err.message || err)}</span></div>`;
  }
})();
