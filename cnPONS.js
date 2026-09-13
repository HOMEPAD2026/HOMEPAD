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
    const res = await fetch(CONFIG.RH_STOCK_ASSETS_API);
    const data = await res.json();
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
  document.getElementById("cn-stock-picker-count").textContent = `${CN.stocks.length} available`;
  renderStockGrid();
}

function renderStockGrid() {
  const grid = document.getElementById("cn-stock-grid");
  const q = (document.getElementById("cn-stock-search").value || "").trim().toLowerCase();
  const rows = CN.stocks.filter((s) => !q || s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q));
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
  grid.querySelectorAll(".cn-stock-card").forEach((btn) => btn.addEventListener("click", () => pickStock(btn.dataset.address)));
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
}

// ---------- Explore: existing launches paired against any tracked CN stock ----------
async function loadCnExplore() {
  const f = pairedFactoryRead();
  const count = Number(await withRetry(() => f.launchCount()));
  const stockByAddr = new Map(CN.stocks.map((s) => [s.address.toLowerCase(), s]));
  const all = await Promise.all(Array.from({ length: count }, (_, i) => withRetry(() => f.launches(i)).catch(() => null)));
  const matched = all
    .map((l, i) => (l ? { ...l, index: i } : null))
    .filter((l) => l && stockByAddr.has(l.quoteToken.toLowerCase()))
    .map((l) => ({ ...l, stock: stockByAddr.get(l.quoteToken.toLowerCase()) }));
  CN.launches = await Promise.all(matched.map(async (l) => {
    const t = tokenRead(l.token);
    const [name, symbol] = await Promise.all([
      withRetry(() => t.name()).catch(() => short(l.token)),
      withRetry(() => t.symbol()).catch(() => "?"),
    ]);
    return { ...l, tokenName: name, tokenSymbol: symbol };
  }));
  CN.launches.sort((a, b) => Number(b.launchedAt) - Number(a.launchedAt));
  document.getElementById("cn-launch-count").textContent = String(CN.launches.length);
  renderCnExplore();
}

function renderCnExplore() {
  const list = document.getElementById("cn-explore-list");
  document.getElementById("cn-explore-count").textContent = CN.launches.length ? `${CN.launches.length} tracked` : "";
  if (!CN.launches.length) {
    list.innerHTML = `<div class="empty-state">No launches paired with a tracked Chinese stock yet — be the first.</div>`;
    return;
  }
  list.innerHTML = CN.launches.map((l) => `
    <a class="adv-launch-row" href="explore.html#/token/${l.token}">
      <img class="adv-launch-logo" src="${l.stock.logoUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
      <span class="adv-launch-main">
        <span class="adv-launch-name">${l.tokenName} <span class="adv-launch-symbol">$${l.tokenSymbol}</span></span>
        <span class="adv-launch-sub">paired with ${l.stock.symbol} · by ${short(l.creator)} · ${timeAgo(Number(l.launchedAt))}</span>
      </span>
    </a>`).join("");
}

// ---------- Launch ----------
async function submitCnLaunch(ev) {
  ev.preventDefault();
  const statusEl = document.getElementById("cn-launch-status");
  const btn = document.getElementById("cn-launch-submit");
  if (!CN.picked) { statusEl.innerHTML = `<div class="status error">Pick a stock first.</div>`; return; }
  const name = document.getElementById("cn-name").value.trim();
  const symbol = document.getElementById("cn-symbol").value.trim();
  const imageUrl = document.getElementById("cn-logo").value.trim();
  const description = document.getElementById("cn-description").value.trim();
  const startValuation = document.getElementById("cn-start-valuation").value.trim();
  if (!name || !symbol || !startValuation) { statusEl.innerHTML = `<div class="status error">Name, symbol, and starting valuation are required.</div>`; return; }

  if (!state.account) {
    statusEl.innerHTML = `<div class="status pending">Connect a wallet first…</div>`;
    await connectWallet();
    if (!state.account) { statusEl.innerHTML = `<div class="status error">Connect a wallet to launch.</div>`; return; }
  }

  btn.disabled = true;
  try {
    const initialVirtualQuote = ethers.parseUnits(startValuation, CN.picked.decimals);
    const meta = { imageUrl, description, twitter: "", telegram: "", discord: "" };
    statusEl.innerHTML = `<div class="status pending">Confirm the launch in your wallet…</div>`;
    let tx = typeof tryWagmiWrite === "function"
      ? await tryWagmiWrite({ address: CONFIG.PAIRED_FACTORY_ADDRESS, abi: PAIRED_FACTORY_ABI, functionName: "launch", args: [name, symbol, CN.picked.address, initialVirtualQuote, 0, meta], value: 0n })
      : null;
    if (!tx) {
      if (typeof ensureAppKitChain === "function") await ensureAppKitChain();
      const overrides = await getTxOverrides(6_000_000n);
      tx = await pairedFactoryWrite().launch(name, symbol, CN.picked.address, initialVirtualQuote, 0, meta, overrides);
    }
    statusEl.innerHTML = `<div class="status pending">Launching… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">tx ↗</a></div>`;
    const receipt = await tx.wait();
    statusEl.innerHTML = `<div class="status success">Launched, paired with ${CN.picked.symbol}. <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${receipt.hash}" target="_blank">tx ↗</a></div>`;
    document.getElementById("cn-launch-form").reset();
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
  await loadCnStocks();
  try { await loadCnExplore(); } catch (err) {
    console.error("loadCnExplore failed", err);
    document.getElementById("cn-explore-list").innerHTML = `<div class="empty-state">Couldn't load launches. <span class="err-detail">${String(err && err.message || err)}</span></div>`;
  }
})();
