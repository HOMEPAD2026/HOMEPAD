// arcpad.js — ArcPad dashboard interactivity: real launches against
// HomepadFactoryArc, real trading against HomepadArcSwapRouter, both live on
// Arc mainnet. Unlike CirclePad (native-currency only), ArcPad's quote token
// is Arc's ERC-20 USDC predeploy (CONFIG.USDC_ADDRESS, 6 decimals) — every
// dev-buy, trade, and approval below moves that token via the normal
// approve/transferFrom dance. The flat 1 USDC launch fee is the one
// exception: it's paid as msg.value (native, 18-decimal representation of
// the same USDC), not pulled from the ERC-20 balance.

const ARC = { launches: [], baseFeeBps: null, tradeToken: null, tradeSide: "buy" };
const ARC_TOKEN_DECIMALS = 18;
const ARC_QUOTE_DECIMALS = 6;
const ARC_DEFAULT_SUPPLY = 1_000_000_000;
const ARC_PLATFORM_ALLOC_BPS = 800; // 8% to platform treasury, every launch — see HomepadFactoryArc.sol
const ARC_SELLABLE_SUPPLY = ARC_DEFAULT_SUPPLY * (10000 - ARC_PLATFORM_ALLOC_BPS) / 10000; // 920,000,000
// Every launch opens at the same point: a 4,000 USDC virtual reserve against
// the 920M sellable tokens → ≈ $0.0000043 per token, ≈ $4,350 market cap.
// Not user-editable (it confused people and there's no reason to vary it).
const ARC_START_VALUATION_USDC = "4000";

// ---------- Contract accessors ----------
function arcpadFactoryConfigured() {
  return !!(CONFIG.ARCPAD_FACTORY_ADDRESS && CONFIG.ARCPAD_FACTORY_ADDRESS.length === 42);
}
function arcpadFactoryRead() {
  return new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, readProvider());
}
function arcpadFactoryWrite() {
  return new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, state.signer);
}
function arcpadRouterRead() {
  return new ethers.Contract(CONFIG.ARCPAD_ROUTER_ADDRESS, ARC_SWAP_ROUTER_ABI, readProvider());
}
function arcpadRouterWrite() {
  return new ethers.Contract(CONFIG.ARCPAD_ROUTER_ADDRESS, ARC_SWAP_ROUTER_ABI, state.signer);
}
function tokenRead(addr) {
  return new ethers.Contract(addr, ERC20_ABI, readProvider());
}
function tokenWrite(addr) {
  return new ethers.Contract(addr, ERC20_ABI, state.signer);
}

function fmtCompact(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1000) return n.toFixed(n < 1 ? 4 : n < 10 ? 3 : 1).replace(/\.?0+$/, "");
  if (n < 1_000_000) return (n / 1000).toFixed(2) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + "M";
  return (n / 1_000_000_000).toFixed(2) + "B";
}
function fmtUsd(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1000) return "$" + n.toFixed(n < 1 ? 4 : 2);
  if (n < 1_000_000) return "$" + (n / 1000).toFixed(2) + "K";
  if (n < 1_000_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  return "$" + (n / 1_000_000_000).toFixed(2) + "B";
}

// ---------- Live pool price, read directly from PoolManager's storage via
// extsload — the same technique @uniswap/v4-periphery's StateLibrary.sol
// uses (getSlot0), reproduced here in JS since no StateView contract is
// deployed on Arc yet. This is a real on-chain read, not an approximation —
// only the trade-preview math built on top of it (below) is approximate.
// See StateLibrary.sol: POOLS_SLOT = 6; stateSlot = keccak256(poolId ++
// POOLS_SLOT); slot0 = extsload(stateSlot) packs
// [lpFee(24) | protocolFee(24) | tick(24) | sqrtPriceX96(160)] LSB-first.
const POOLS_SLOT = "0x0000000000000000000000000000000000000000000000000000000000000006";
async function getPoolSlot0(poolKey) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    ["address", "address", "uint24", "int24", "address"],
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
  );
  const poolId = ethers.keccak256(encoded);
  const stateSlot = ethers.keccak256(ethers.concat([poolId, POOLS_SLOT]));
  const pm = new ethers.Contract(CONFIG.POOL_MANAGER_ADDRESS, ["function extsload(bytes32) view returns (bytes32)"], readProvider());
  const data = BigInt(await pm.extsload(stateSlot));
  const sqrtPriceX96 = data & ((1n << 160n) - 1n);
  return { sqrtPriceX96 };
}

/// USDC per whole token, from a live pool read. Returns null if the pool
/// can't be read (e.g. RPC hiccup) — callers fall back to the launch's own
/// starting valuation instead of showing a broken price.
async function getLivePriceUsdc(token, quoteToken, quoteIsCurrency0) {
  try {
    const key = await arcpadFactoryRead().poolKeyOf(token);
    const { sqrtPriceX96 } = await getPoolSlot0(key);
    if (sqrtPriceX96 === 0n) return null;
    const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
    const rawPrice = sqrtPrice * sqrtPrice; // currency1 raw per currency0 raw
    const decDiff = ARC_TOKEN_DECIMALS - ARC_QUOTE_DECIMALS; // 12
    const price = quoteIsCurrency0 ? Math.pow(10, decDiff) / rawPrice : rawPrice * Math.pow(10, decDiff);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch (err) {
    console.warn("getLivePriceUsdc failed for", token, err);
    return null;
  }
}

// ---------- Explore: every launch, read from the factory's own Launched
// event log (bounded by CONTRACTS_LIVE_SINCE), enriched with the full
// struct + a live price read per launch. ----------
async function loadArcpadLaunches() {
  if (!arcpadFactoryConfigured()) {
    document.getElementById("ap-explore-grid").innerHTML = `<div class="empty-state">ArcPad's factory isn't configured yet.</div>`;
    return;
  }
  const f = arcpadFactoryRead();
  if (ARC.baseFeeBps == null) {
    try { ARC.baseFeeBps = Number(await f.baseFeeBps()); } catch { ARC.baseFeeBps = 100; }
  }
  // Every launch is read straight from the factory's own storage
  // (launchCount + launches(i)), plus name/symbol from the token itself —
  // no event-log scan at all. Arc's RPC caps eth_getLogs at ~10k blocks
  // (~84 minutes of chain), so the old "all Launched events since deploy"
  // query failed outright within hours of going live. This costs the same
  // few multicalls however old the factory gets. Batched so a page of
  // launches with embedded data-URI logos stays within eth_call limits.
  const count = Number(await withRetry(() => f.launchCount()));
  const BATCH = 20;
  const built = [];
  for (let start = 0; start < count; start += BATCH) {
    const idxs = Array.from({ length: Math.min(BATCH, count - start) }, (_, k) => start + k);
    const rows = await withRetry(() => multicallRead(idxs.map((i) => ({ contract: f, method: "launches", args: [i] }))));
    const valid = rows.filter(Boolean);
    const names = await multicallRead(valid.flatMap((l) => {
      const t = tokenRead(l.token);
      return [{ contract: t, method: "name" }, { contract: t, method: "symbol" }];
    }));
    valid.forEach((l, k) => {
      built.push({
        token: l.token, name: names[2 * k] ?? "", symbol: names[2 * k + 1] ?? "",
        creator: l.creator, quoteToken: l.quoteToken, extraFeeBps: Number(l.extraFeeBps),
        imageUrl: l.imageUrl, description: l.description, launchedAt: Number(l.launchedAt),
        twitter: l.twitter, telegram: l.telegram, discord: l.discord, website: l.website,
        quoteIsCurrency0: l.quoteIsCurrency0,
        initialVirtualQuote: Number(ethers.formatUnits(l.initialVirtualQuote, ARC_QUOTE_DECIMALS)),
      });
    });
    if (valid.length < idxs.length) console.warn(`arcpad explore: ${idxs.length - valid.length} launch record(s) in batch ${start} failed to read`);
  }

  // Live price per launch — starting valuation is the fallback for a launch
  // whose pool read fails (RPC hiccup) rather than showing a broken "—".
  await Promise.all(built.map(async (l) => {
    if (l.quoteIsCurrency0 == null) { l.priceUsdc = null; l.marketCapUsd = null; return; }
    const live = await getLivePriceUsdc(l.token, l.quoteToken, l.quoteIsCurrency0);
    l.priceUsdc = live ?? (l.initialVirtualQuote != null ? l.initialVirtualQuote / ARC_SELLABLE_SUPPLY : null);
    l.marketCapUsd = l.priceUsdc != null ? l.priceUsdc * ARC_DEFAULT_SUPPLY : null;
    l.isLivePrice = live != null;
  }));

  built.sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1));
  ARC.launches = built;
  document.getElementById("ap-stat-count").textContent = String(built.length);
  document.getElementById("ap-home-count").textContent = String(built.length);
  const foot = document.getElementById("bp-side-foot-text");
  if (foot) foot.textContent = `${built.length} launch${built.length === 1 ? "" : "es"} live`;
  renderArcpadHome();
  renderArcpadExplore();
}

function launchCardHtml(l) {
  const img = l.imageUrl
    ? `<img src="${l.imageUrl}" alt="" style="width:36px;height:36px;border-radius:9px;object-fit:cover;margin-bottom:8px" onerror="this.style.display='none'">`
    : "";
  return `
    <button type="button" class="launch-card card-type-curve ap-launch-card" data-token="${l.token}" style="text-align:left;cursor:pointer;width:100%;border:1px solid var(--line);font:inherit;">
      ${img}
      <div class="sym">$${l.symbol}</div>
      <div class="name">${l.name}</div>
      <div class="meta">
        <span>${l.marketCapUsd != null ? fmtUsd(l.marketCapUsd) : "—"} mcap</span>
        <span>${l.priceUsdc != null ? "$" + l.priceUsdc.toPrecision(4) : "—"}</span>
      </div>
    </button>`;
}

function renderArcpadHome() {
  const track = document.getElementById("ap-home-track");
  const viewport = document.getElementById("ap-home-viewport");
  if (!ARC.launches.length) {
    // .carousel-viewport reserves ~300px for a row of cards; with nothing to
    // show that's just a hole in the page, so collapse it (see .is-empty).
    viewport.classList.add("is-empty");
    track.innerHTML = `<div class="empty-state">No launches yet — be the first. <button type="button" class="bp-card-link" data-tab-link="launch">Launch a coin →</button></div>`;
    track.querySelector("[data-tab-link]").addEventListener("click", () => document.querySelector(".bp-nav-item[data-tab='launch']").click());
    return;
  }
  viewport.classList.remove("is-empty");
  const newest = [...ARC.launches].sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 12);
  const cardsHtml = newest.map(launchCardHtml).join("");
  track.innerHTML = cardsHtml + cardsHtml + cardsHtml;
  wireLaunchCardClicks(track);
  setupCarouselAutoScroll(viewport, track, newest.length);
}

/// Shown when the factory read itself fails (RPC down, wrong network on a
/// read-only provider, etc.) — every surface that said "Loading…" flips to
/// the same honest error instead of spinning forever.
function renderArcpadLoadError(err) {
  const msg = String(err && (err.shortMessage || err.message) || err);
  const viewport = document.getElementById("ap-home-viewport");
  if (viewport) viewport.classList.add("is-empty");
  const html = `<div class="empty-state">Couldn't reach Arc to load launches — check your connection and refresh. <span class="err-detail">${msg.slice(0, 160)}</span></div>`;
  const track = document.getElementById("ap-home-track");
  if (track) track.innerHTML = html;
  const grid = document.getElementById("ap-explore-grid");
  if (grid) grid.innerHTML = html;
  const foot = document.getElementById("bp-side-foot-text");
  if (foot) foot.textContent = "Couldn't reach Arc RPC";
  const dot = document.getElementById("bp-side-status-dot");
  if (dot) dot.classList.add("bp-bad");
  for (const id of ["ap-stat-count", "ap-home-count"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  }
}

let arcExploreSort = "mcap";
function renderArcpadExplore() {
  renderArcpadExploreGrid();
}
function renderArcpadExploreGrid() {
  const grid = document.getElementById("ap-explore-grid");
  const q = (document.getElementById("ap-explore-search").value || "").trim().toLowerCase();
  let rows = ARC.launches.filter((l) => !q || l.name.toLowerCase().includes(q) || l.symbol.toLowerCase().includes(q));
  if (arcExploreSort === "name") rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  else if (arcExploreSort === "new") rows = [...rows].sort((a, b) => b.launchedAt - a.launchedAt);
  else rows = [...rows].sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1));
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const empty = ARC.launches.length === 0
    ? "No coins have launched on ArcPad yet — the Launch tab is where the first one starts."
    : `No launches match “${esc(q)}”.`;
  grid.innerHTML = rows.length ? rows.map(launchCardHtml).join("") : `<div class="empty-state">${empty}</div>`;
  wireLaunchCardClicks(grid);
}

function wireLaunchCardClicks(root) {
  root.querySelectorAll(".ap-launch-card").forEach((card) => {
    card.addEventListener("click", () => openTradeModal(card.dataset.token));
  });
}

// Same auto-scroll/drag carousel technique used elsewhere on the site
// (cnPONS.js's setupCarouselAutoScroll), copied here rather than shared —
// arc-shared.js is loaded by CirclePad too, which has no carousel at all.
function setupCarouselAutoScroll(viewport, track, itemCount) {
  if (!viewport || !track || itemCount === 0) return;
  const singleSetWidth = track.scrollWidth / 3;
  let currentScroll = singleSetWidth;
  viewport.scrollLeft = currentScroll;
  const SPEED = 0.5;
  let isDragging = false, dragStartX = 0, dragStartScroll = 0;
  function wrap() {
    if (currentScroll >= singleSetWidth * 2) currentScroll -= singleSetWidth;
    if (currentScroll < 0) currentScroll += singleSetWidth;
  }
  function tick() {
    if (!isDragging) { currentScroll += SPEED; wrap(); viewport.scrollLeft = currentScroll; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  viewport.addEventListener("pointerdown", (e) => {
    isDragging = true; dragStartX = e.clientX; dragStartScroll = viewport.scrollLeft;
    viewport.setPointerCapture(e.pointerId); viewport.classList.add("dragging");
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    viewport.scrollLeft = dragStartScroll - (e.clientX - dragStartX);
  });
  function endDrag() {
    if (!isDragging) return;
    isDragging = false; viewport.classList.remove("dragging");
    currentScroll = viewport.scrollLeft; wrap(); viewport.scrollLeft = currentScroll;
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("pointerleave", endDrag);
}

// ---------- Launch form ----------
function wireArcpadImageUpload() {
  const imgInput = document.getElementById("ap-logo");
  const imgPreview = document.getElementById("ap-image-preview");
  const updatePreview = (url) => { imgPreview.innerHTML = url ? `<img src="${url}" onerror="this.parentElement.innerHTML='🅰️'">` : "🅰️"; };
  imgInput.addEventListener("input", (e) => updatePreview(e.target.value.trim()));
  document.getElementById("ap-logo-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const hintEl = document.getElementById("ap-image-hint");
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

function wireArcpadFeePreview() {
  const BASE_FEE_BPS = 100, CREATOR_SHARE_BPS = 7000;
  const slider = document.getElementById("ap-extrafee");
  const preview = document.getElementById("ap-fee-preview");
  const render = () => {
    const extraBps = Number(slider.value);
    const totalBps = BASE_FEE_BPS + extraBps;
    const baseCreatorBps = (BASE_FEE_BPS * CREATOR_SHARE_BPS) / 10000;
    const basePlatformBps = BASE_FEE_BPS - baseCreatorBps;
    const creatorTotalBps = baseCreatorBps + extraBps;
    const pct = (bps) => (bps / 100).toFixed(2) + "%";
    preview.innerHTML = `
      <div class="fee-preview-total">Total trade fee: <strong>${pct(totalBps)}</strong></div>
      <div class="fee-preview-row"><span>Base fee</span><span>${pct(BASE_FEE_BPS)}</span></div>
      <div class="fee-preview-row sub"><span>→ you (70%)</span><span>${pct(baseCreatorBps)}</span></div>
      <div class="fee-preview-row sub"><span>→ platform (30%)</span><span>${pct(basePlatformBps)}</span></div>
      ${extraBps > 0 ? `<div class="fee-preview-row"><span>Your extra fee</span><span>${pct(extraBps)}</span></div><div class="fee-preview-row sub"><span>→ you (100%)</span><span>${pct(extraBps)}</span></div>` : ""}
      <div class="fee-preview-row highlight"><span>You earn per trade</span><span>${pct(creatorTotalBps)}</span></div>`;
  };
  slider.addEventListener("input", render);
  render();
}

/// Approximate "tokens out" for a dev buy, same constant-product formula
/// the contract's own single-sided seed uses at t=0 (before any real
/// trading has moved the price) — matches cnPONS.js's own devbuy preview
/// convention. Ignores the trading fee, so the real result is slightly
/// lower — labeled "approximately".
function updateArcpadDevBuyPreview() {
  const el = document.getElementById("ap-devbuy-preview");
  const devBuyStr = document.getElementById("ap-devbuy").value.trim();
  if (!devBuyStr || Number(devBuyStr) <= 0) { el.textContent = ""; return; }
  const virtualQuote = Number(ARC_START_VALUATION_USDC);
  const devBuy = Number(devBuyStr);
  const tokensOut = ARC_SELLABLE_SUPPLY - (virtualQuote * ARC_SELLABLE_SUPPLY) / (virtualQuote + devBuy);
  el.textContent = `≈ ${fmtCompact(tokensOut)} tokens (${((tokensOut / ARC_SELLABLE_SUPPLY) * 100).toFixed(2)}% of the sellable supply) — approximate, before the trading fee.`;
}

async function submitArcpadLaunch(ev) {
  ev.preventDefault();
  const statusEl = document.getElementById("ap-launch-status");
  const btn = document.getElementById("ap-launch-submit");
  const name = document.getElementById("ap-name").value.trim();
  const symbol = document.getElementById("ap-symbol").value.trim().toUpperCase();
  const imageUrl = document.getElementById("ap-logo").value.trim();
  const website = document.getElementById("ap-website").value.trim();
  const description = document.getElementById("ap-description").value.trim();
  const twitter = document.getElementById("ap-twitter").value.trim();
  const telegram = document.getElementById("ap-telegram").value.trim();
  const discord = document.getElementById("ap-discord").value.trim();
  const startValuation = ARC_START_VALUATION_USDC;
  const extraFeeBps = Number(document.getElementById("ap-extrafee").value);
  const devBuyStr = document.getElementById("ap-devbuy").value.trim();

  if (!name || !symbol) { statusEl.innerHTML = `<div class="status error">Name and symbol are required.</div>`; return; }
  if (imageUrl.startsWith("data:") && imageUrl.length > 280_000) {
    statusEl.innerHTML = `<div class="status error">That embedded image is too large and will likely make the transaction fail — use a hosted image URL or a smaller file.</div>`;
    return;
  }
  if (!arcpadFactoryConfigured()) { statusEl.innerHTML = `<div class="status error">ArcPad's factory isn't configured yet.</div>`; return; }

  if (!state.account) {
    statusEl.innerHTML = `<div class="status pending">Connect a wallet first…</div>`;
    await connectWallet();
    if (!state.account) { statusEl.innerHTML = `<div class="status error">Connect a wallet to launch.</div>`; return; }
  }

  btn.disabled = true;
  btn.classList.add("is-busy");
  const btnLabel = btn.querySelector(".ap-launch-btn-label");
  if (btnLabel) btnLabel.textContent = "Launching…";
  try {
    const initialVirtualQuote = ethers.parseUnits(startValuation, ARC_QUOTE_DECIMALS);
    const devBuyQuote = devBuyStr && Number(devBuyStr) > 0 ? ethers.parseUnits(devBuyStr, ARC_QUOTE_DECIMALS) : 0n;
    const meta = { imageUrl, description, twitter, telegram, discord, website };
    const factory = arcpadFactoryWrite();
    const launchFee = await withRetry(() => factory.LAUNCH_FEE());

    if (devBuyQuote > 0n) {
      const allowance = await tokenRead(CONFIG.USDC_ADDRESS).allowance(state.account, CONFIG.ARCPAD_FACTORY_ADDRESS);
      if (allowance < devBuyQuote) {
        statusEl.innerHTML = `<div class="status pending">Approve USDC for the dev buy in your wallet…</div>`;
        const tx = await tokenWrite(CONFIG.USDC_ADDRESS).approve(CONFIG.ARCPAD_FACTORY_ADDRESS, devBuyQuote);
        await tx.wait();
      }
    }

    statusEl.innerHTML = `<div class="status pending">Confirm the launch in your wallet…</div>`;
    const tx = devBuyQuote > 0n
      ? await factory.launchAndBuy(name, symbol, CONFIG.USDC_ADDRESS, initialVirtualQuote, extraFeeBps, meta, devBuyQuote, { value: launchFee })
      : await factory.launch(name, symbol, CONFIG.USDC_ADDRESS, initialVirtualQuote, extraFeeBps, meta, { value: launchFee });
    statusEl.innerHTML = `<div class="status pending">Launching… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">tx ↗</a></div>`;
    const receipt = await tx.wait();
    statusEl.innerHTML = `<div class="status success">Launched! <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${receipt.hash}" target="_blank">tx ↗</a></div>`;
    document.getElementById("ap-launch-form").reset();
    document.getElementById("ap-image-preview").innerHTML = "🅰️";
    document.getElementById("ap-image-hint").textContent = "A hosted URL is best. Uploading a file embeds the image directly as data — fine for a small icon, but bigger files cost noticeably more gas to launch.";
    // reset() puts the slider back to 0 but fires no input event, so the fee
    // breakdown and dev-buy preview have to be re-rendered by hand.
    document.getElementById("ap-extrafee").dispatchEvent(new Event("input"));
    updateArcpadDevBuyPreview();
    loadArcpadLaunches().catch((err) => console.error(err));
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<div class="status error">${String(err && (err.shortMessage || err.message) || err).slice(0, 220)}</div>`;
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-busy");
    if (btnLabel) btnLabel.textContent = "Launch coin";
  }
}

// ---------- Trade modal (Buy / Sell) ----------
function openTradeModal(tokenAddr) {
  const l = ARC.launches.find((x) => x.token.toLowerCase() === tokenAddr.toLowerCase());
  if (!l) return;
  ARC.tradeToken = l;
  ARC.tradeSide = "buy";
  document.getElementById("ap-trade-img").src = l.imageUrl || "";
  document.getElementById("ap-trade-img").style.display = l.imageUrl ? "" : "none";
  document.getElementById("ap-trade-name").textContent = l.name;
  document.getElementById("ap-trade-sym").textContent = "$" + l.symbol;
  document.getElementById("ap-trade-price").textContent = l.priceUsdc != null ? "$" + l.priceUsdc.toPrecision(4) : "—";
  document.getElementById("ap-trade-mcap").textContent = l.marketCapUsd != null ? fmtUsd(l.marketCapUsd) : "—";
  document.getElementById("ap-trade-explorer-link").href = `${CONFIG.BLOCK_EXPLORER}/address/${l.token}`;
  document.getElementById("ap-trade-amount").value = "";
  document.getElementById("ap-trade-status").innerHTML = "";
  setTradeTab("buy");
  document.getElementById("ap-trade-modal").classList.remove("hidden");
  refreshTradeBalance();
}
function closeTradeModal() {
  document.getElementById("ap-trade-modal").classList.add("hidden");
  ARC.tradeToken = null;
}

function setTradeTab(side) {
  ARC.tradeSide = side;
  document.getElementById("ap-tab-buy").classList.toggle("active", side === "buy");
  document.getElementById("ap-tab-sell").classList.toggle("active", side === "sell");
  document.getElementById("ap-trade-amount").value = "";
  document.getElementById("ap-trade-preview").textContent = "";
  refreshTradeBalance();
  updateTradeSubmitLabel();
}

async function refreshTradeBalance() {
  const label = document.getElementById("ap-trade-balance-label");
  if (!ARC.tradeToken) return;
  if (!state.account) { label.textContent = "Connect a wallet to see your balance"; return; }
  try {
    const addr = ARC.tradeSide === "buy" ? CONFIG.USDC_ADDRESS : ARC.tradeToken.token;
    const dec = ARC.tradeSide === "buy" ? ARC_QUOTE_DECIMALS : ARC_TOKEN_DECIMALS;
    const bal = await tokenRead(addr).balanceOf(state.account);
    const human = Number(ethers.formatUnits(bal, dec));
    label.textContent = `Balance: ${fmtCompact(human)} ${ARC.tradeSide === "buy" ? "USDC" : ARC.tradeToken.symbol}`;
    label.dataset.raw = bal.toString();
  } catch (err) {
    console.warn("refreshTradeBalance failed", err);
    label.textContent = "Balance: —";
  }
}

function updateTradePreview() {
  const el = document.getElementById("ap-trade-preview");
  const amountStr = document.getElementById("ap-trade-amount").value.trim();
  if (!ARC.tradeToken || !amountStr || Number(amountStr) <= 0 || ARC.tradeToken.priceUsdc == null) { el.textContent = ""; return; }
  const amount = Number(amountStr);
  const totalFeeBps = (ARC.baseFeeBps ?? 100) + ARC.tradeToken.extraFeeBps;
  const feeMult = 1 - totalFeeBps / 10000;
  if (ARC.tradeSide === "buy") {
    const tokensOut = (amount / ARC.tradeToken.priceUsdc) * feeMult;
    el.textContent = `≈ ${fmtCompact(tokensOut)} $${ARC.tradeToken.symbol} — estimate, before price impact. Actual output is protected by a 5% slippage floor.`;
  } else {
    const usdcOut = amount * ARC.tradeToken.priceUsdc * feeMult;
    el.textContent = `≈ ${fmtCompact(usdcOut)} USDC — estimate, before price impact. Actual output is protected by a 5% slippage floor.`;
  }
}

function updateTradeSubmitLabel() {
  const btn = document.getElementById("ap-trade-submit");
  if (!state.account) { btn.textContent = "Connect wallet"; return; }
  btn.textContent = ARC.tradeSide === "buy" ? "Buy" : "Sell";
}

async function submitTrade() {
  const statusEl = document.getElementById("ap-trade-status");
  const btn = document.getElementById("ap-trade-submit");
  if (!state.account) { await connectWallet(); updateTradeSubmitLabel(); if (!state.account) return; }
  const amountStr = document.getElementById("ap-trade-amount").value.trim();
  if (!amountStr || Number(amountStr) <= 0) { statusEl.innerHTML = `<div class="status error">Enter an amount.</div>`; return; }
  const l = ARC.tradeToken;
  if (!l) return;

  btn.disabled = true;
  try {
    const router = arcpadRouterWrite();
    if (ARC.tradeSide === "buy") {
      const quoteAmount = ethers.parseUnits(amountStr, ARC_QUOTE_DECIMALS);
      const allowance = await tokenRead(CONFIG.USDC_ADDRESS).allowance(state.account, CONFIG.ARCPAD_ROUTER_ADDRESS);
      if (allowance < quoteAmount) {
        statusEl.innerHTML = `<div class="status pending">Approve USDC for the router…</div>`;
        const tx = await tokenWrite(CONFIG.USDC_ADDRESS).approve(CONFIG.ARCPAD_ROUTER_ADDRESS, quoteAmount);
        await tx.wait();
      }
      // Simulate the exact swap first (eth_call of the real buy) so the
      // slippage floor is 5% under what the pool would ACTUALLY return right
      // now — price impact included — rather than 5% under the spot price,
      // which made any buy big enough to move the price >5% revert with
      // "slippage". Falls back to the spot estimate only if the simulation
      // itself can't run.
      let minTokensOut = 0n;
      try {
        const simOut = await router.buy.staticCall(l.token, quoteAmount, 0n);
        minTokensOut = (simOut * 95n) / 100n;
      } catch (simErr) {
        console.warn("buy simulation failed — falling back to spot estimate", simErr);
        const estTokensOut = l.priceUsdc ? (Number(amountStr) / l.priceUsdc) : 0;
        minTokensOut = ethers.parseUnits((estTokensOut * 0.95).toFixed(18), ARC_TOKEN_DECIMALS);
      }
      statusEl.innerHTML = `<div class="status pending">Confirm the buy in your wallet…</div>`;
      const tx = await router.buy(l.token, quoteAmount, minTokensOut > 0n ? minTokensOut : 0n);
      statusEl.innerHTML = `<div class="status pending">Buying… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">tx ↗</a></div>`;
      const receipt = await tx.wait();
      statusEl.innerHTML = `<div class="status success">Bought! <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${receipt.hash}" target="_blank">tx ↗</a></div>`;
    } else {
      const tokenAmount = ethers.parseUnits(amountStr, ARC_TOKEN_DECIMALS);
      const allowance = await tokenRead(l.token).allowance(state.account, CONFIG.ARCPAD_ROUTER_ADDRESS);
      if (allowance < tokenAmount) {
        statusEl.innerHTML = `<div class="status pending">Approve $${l.symbol} for the router…</div>`;
        const tx = await tokenWrite(l.token).approve(CONFIG.ARCPAD_ROUTER_ADDRESS, tokenAmount);
        await tx.wait();
      }
      let minQuoteOut = 0n;
      try {
        const simOut = await router.sell.staticCall(l.token, tokenAmount, 0n);
        minQuoteOut = (simOut * 95n) / 100n;
      } catch (simErr) {
        console.warn("sell simulation failed — falling back to spot estimate", simErr);
        const estUsdcOut = l.priceUsdc ? Number(amountStr) * l.priceUsdc : 0;
        minQuoteOut = ethers.parseUnits((estUsdcOut * 0.95).toFixed(6), ARC_QUOTE_DECIMALS);
      }
      statusEl.innerHTML = `<div class="status pending">Confirm the sell in your wallet…</div>`;
      const tx = await router.sell(l.token, tokenAmount, minQuoteOut > 0n ? minQuoteOut : 0n);
      statusEl.innerHTML = `<div class="status pending">Selling… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">tx ↗</a></div>`;
      const receipt = await tx.wait();
      statusEl.innerHTML = `<div class="status success">Sold! <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${receipt.hash}" target="_blank">tx ↗</a></div>`;
    }
    document.getElementById("ap-trade-amount").value = "";
    refreshTradeBalance();
    loadArcpadLaunches().catch((err) => console.error(err));
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<div class="status error">${String(err && (err.shortMessage || err.message) || err).slice(0, 220)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

// This page's own version of app.js's global refreshAccountDependentViews()
// — arc-shared.js is a shared library across ARCPAD and CIRCLEPAD, so it
// doesn't know which page-specific refresh functions exist.
function refreshAccountDependentViews() {
  updateTradeSubmitLabel();
  if (ARC.tradeToken) refreshTradeBalance();
}

// ---------- Boot ----------
(() => {
  // Sidebar tabs — identical mechanism to circlepad.js's (generic, not
  // CirclePad-specific): matches .bp-nav-item[data-tab] to #bp-panel-<tab>.
  const navItems = document.querySelectorAll(".bp-nav-item[data-tab]");
  const panels = document.querySelectorAll(".bp-panel");
  const sidebar = document.getElementById("bp-sidebar");
  const mobileMenuLabel = document.getElementById("bp-mobile-menu-label");
  function showTab(tab) {
    navItems.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    panels.forEach((p) => p.classList.toggle("active", p.id === `bp-panel-${tab}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (mobileMenuLabel) {
      const activeBtn = [...navItems].find((b) => b.dataset.tab === tab);
      if (activeBtn) mobileMenuLabel.textContent = activeBtn.textContent.trim();
    }
    if (sidebar) sidebar.classList.remove("bp-menu-open");
    // Keep the URL shareable (/arc#launch, /arc#explore, …) without adding
    // history entries, and let the floating quick bar highlight its item.
    if (history.replaceState) {
      const want = tab === "home" ? "" : `#${tab}`;
      if (location.hash !== want) history.replaceState(null, "", location.pathname + location.search + want);
    }
    document.dispatchEvent(new CustomEvent("arcpad:tab", { detail: { tab } }));
  }
  window.arcpadShowTab = showTab;
  const tabFromHash = () => {
    const t = location.hash.slice(1);
    return t && document.getElementById(`bp-panel-${t}`) ? t : null;
  };
  window.addEventListener("hashchange", () => { const t = tabFromHash(); if (t) showTab(t); });
  navItems.forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
  const menuTrigger = document.getElementById("bp-mobile-menu-trigger");
  if (menuTrigger && sidebar) {
    menuTrigger.addEventListener("click", (e) => { e.stopPropagation(); sidebar.classList.toggle("bp-menu-open"); });
    document.addEventListener("click", (e) => {
      if (sidebar.classList.contains("bp-menu-open") && !sidebar.contains(e.target)) sidebar.classList.remove("bp-menu-open");
    });
  }
  document.querySelectorAll("[data-tab-link]").forEach((el) => el.addEventListener("click", () => showTab(el.dataset.tabLink)));
  { const t = tabFromHash(); if (t && t !== "home") showTab(t); }

  // Docs sub-tabs
  document.querySelectorAll(".bp-doc-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".bp-doc-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".bp-doc-panel").forEach((p) => p.classList.toggle("active", p.id === `bp-doc-${tab.dataset.doc}`));
    });
  });

  // Explore toolbar
  document.getElementById("ap-explore-search").addEventListener("input", renderArcpadExploreGrid);
  document.getElementById("ap-topbar-search").addEventListener("input", (e) => {
    document.getElementById("ap-explore-search").value = e.target.value;
    showTab("explore");
    renderArcpadExploreGrid();
  });
  document.querySelectorAll("#ap-sort-group button").forEach((b) => {
    b.addEventListener("click", () => {
      arcExploreSort = b.dataset.sort;
      document.querySelectorAll("#ap-sort-group button").forEach((x) => x.classList.toggle("active", x === b));
      renderArcpadExploreGrid();
    });
  });

  // Launch form
  document.getElementById("ap-launch-form").addEventListener("submit", submitArcpadLaunch);
  document.getElementById("ap-devbuy").addEventListener("input", updateArcpadDevBuyPreview);
  wireArcpadImageUpload();
  wireArcpadFeePreview();

  // Trade modal
  document.getElementById("ap-trade-modal-close").addEventListener("click", closeTradeModal);
  document.getElementById("ap-trade-modal").addEventListener("click", (e) => { if (e.target.id === "ap-trade-modal") closeTradeModal(); });
  document.getElementById("ap-tab-buy").addEventListener("click", () => setTradeTab("buy"));
  document.getElementById("ap-tab-sell").addEventListener("click", () => setTradeTab("sell"));
  document.getElementById("ap-trade-amount").addEventListener("input", updateTradePreview);
  document.getElementById("ap-trade-submit").addEventListener("click", submitTrade);
  document.getElementById("ap-trade-max").addEventListener("click", () => {
    const label = document.getElementById("ap-trade-balance-label");
    const raw = label.dataset.raw;
    if (!raw) return;
    const dec = ARC.tradeSide === "buy" ? ARC_QUOTE_DECIMALS : ARC_TOKEN_DECIMALS;
    let amount = BigInt(raw);
    // On Arc the USDC you spend IS the gas token, so "Max" on a buy has to
    // leave room for the approve + swap gas (~0.01 USDC at today's fees) or
    // the transaction fails for insufficient funds. 0.05 USDC is ample.
    if (ARC.tradeSide === "buy") {
      const reserve = ethers.parseUnits("0.05", ARC_QUOTE_DECIMALS);
      amount = amount > reserve ? amount - reserve : 0n;
    }
    document.getElementById("ap-trade-amount").value = ethers.formatUnits(amount, dec);
    updateTradePreview();
  });

  // Deep links: arcpad.html#launch / #explore / #docs open that tab directly
  // (the splash page's EXPLORE / LAUNCH nav uses these). Falls back to Home
  // for any hash that isn't a tab.
  const openTabFromHash = () => {
    const tab = (location.hash || "").replace(/^#\/?/, "");
    if (tab && document.getElementById(`bp-panel-${tab}`)) showTab(tab);
  };
  openTabFromHash();
  window.addEventListener("hashchange", openTabFromHash);

  renderArcpadContracts();

  loadArcpadLaunches().catch((err) => {
    console.error("loadArcpadLaunches failed", err);
    renderArcpadLoadError(err);
  });
})();

/// Docs → "Contracts": every live address, read straight from config-arc.js
/// so the page can never drift from what's actually deployed. Empty entries
/// (e.g. a not-yet-deployed contract) render as "not deployed yet".
function renderArcpadContracts() {
  const el = document.getElementById("ap-contracts");
  if (!el) return;
  const rows = [
    ["HomepadFactoryArc", CONFIG.ARCPAD_FACTORY_ADDRESS, "Launches, seeds the pool, collects the 1 USDC fee"],
    ["HomepadHybridHook", CONFIG.ARCPAD_HOOK_ADDRESS, "Uniswap v4 hook — routes trade fees to creator / platform"],
    ["HomepadArcSwapRouter", CONFIG.ARCPAD_ROUTER_ADDRESS, "Buy / sell against the pool from this page"],
    ["Uniswap v4 PoolManager", CONFIG.POOL_MANAGER_ADDRESS, "Uniswap's own core on Arc — every pool lives here"],
    ["USDC (ERC-20, 6 decimals)", CONFIG.USDC_ADDRESS, "Arc's native USDC predeploy — the quote token"],
  ];
  el.innerHTML = renderContractRows(rows);
}
