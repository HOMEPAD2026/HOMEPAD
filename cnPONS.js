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
        logoUrl: a.logoUrl,
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
  document.getElementById("cn-launch").scrollIntoView({ behavior: "smooth", block: "start" });
  suggestCnStartValuation(CN.picked);
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
      const idx = await withRetry(() => f.launchIndexOf(ev.args.token));
      const l = await withRetry(() => f.launches(idx));
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

  CN.launches.sort((a, b) => b.launchedAt - a.launchedAt);
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
  if (!CN.launches.length) {
    track.innerHTML = `<div class="empty-state">No launches paired with a tracked Chinese stock yet — be the first.</div>`;
    return;
  }
  const cardsHtml = CN.launches.map(launchCardHtml).join("");
  track.innerHTML = CN.launches.length > 3 ? cardsHtml + cardsHtml + cardsHtml : cardsHtml;
  if (CN.launches.length > 3) {
    setupCarouselAutoScroll(document.getElementById("cn-explore-viewport"), track, CN.launches.length);
  }
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
  const description = document.getElementById("cn-description").value.trim();
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
  document.getElementById("cn-stock-search").addEventListener("input", renderStockGrid);
  document.getElementById("cn-launch-form").addEventListener("submit", submitCnLaunch);
  wireCnImageUpload();
  wireCnFeePreview();
  await loadCnStocks();
  try { await loadCnExplore(); } catch (err) {
    console.error("loadCnExplore failed", err);
    document.getElementById("cn-explore-track").innerHTML = `<div class="empty-state">Couldn't load launches. <span class="err-detail">${String(err && err.message || err)}</span></div>`;
  }
})();
