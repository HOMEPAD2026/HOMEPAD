// arcpad.js — ArcPad dashboard interactivity: real launches against
// HomepadFactoryArc, real trading against HomepadArcSwapRouter, both live on
// Arc mainnet. Unlike CirclePad (native-currency only), ArcPad's quote token
// is Arc's ERC-20 USDC predeploy (CONFIG.USDC_ADDRESS, 6 decimals) — every
// dev-buy, trade, and approval below moves that token via the normal
// approve/transferFrom dance. The flat 1 USDC launch fee is the one
// exception: it's paid as msg.value (native, 18-decimal representation of
// the same USDC), not pulled from the ERC-20 balance.

const ARC_LOGO_PH = '<svg class="logo-ph-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4.5 17.5l5-5 3.5 3.5 2.5-2.5 4 4"/></svg>';
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
  if (n < 1e12) return "$" + (n / 1_000_000_000).toFixed(2) + "B";
  return "—";
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
async function getLivePriceUsdc(token, quoteToken, quoteIsCurrency0, quoteDecimals = ARC_QUOTE_DECIMALS) {
  // Quote tokens per launched token — "Usdc" in the name is historical: for a
  // launch paired with something else this is in that token's units.
  try {
    const key = await arcpadFactoryRead().poolKeyOf(token);
    (ARC.poolKeys || (ARC.poolKeys = {}))[token.toLowerCase()] = key; // reused by arc-activity.js
    const { sqrtPriceX96 } = await getPoolSlot0(key);
    if (sqrtPriceX96 === 0n) return null;
    return arcPriceInQuote(sqrtPriceX96, quoteIsCurrency0, quoteDecimals);
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
        initialVirtualQuoteRaw: l.initialVirtualQuote,
      });
    });
    if (valid.length < idxs.length) console.warn(`arcpad explore: ${idxs.length - valid.length} launch record(s) in batch ${start} failed to read`);
  }

  // Live price per launch — starting valuation is the fallback for a launch
  // whose pool read fails (RPC hiccup) rather than showing a broken "—".
  // Each launch can be paired with a different token: read every distinct
  // pair token's decimals / symbol and USD price once, then price launches
  // in their pair token and convert to USD.
  const quotes = {};
  // A pair token whose decimals couldn't be read is left unpriced ("—") and
  // re-tried shortly — never priced with a guessed decimals value, which is
  // what turned $ARCIRCLE / FOCI pairs into "$3,352,337B" market caps.
  let unresolved = 0;
  await Promise.all([...new Set(built.map((l) => l.quoteToken.toLowerCase()))].map(async (q) => {
    const meta = await arcQuoteMetaFor(q).catch((err) => {
      console.warn("pair token read failed", q, err);
      unresolved++;
      return { address: q, symbol: "…", decimals: null, isUsdc: arcIsUsdc(q), unresolved: true };
    });
    const px = meta.unresolved ? { price: null } : await arcQuotePriceUsd(meta.address).catch(() => ({ price: null }));
    quotes[q] = { ...meta, usd: px.price };
  }));
  await Promise.all(built.map(async (l) => {
    const q = quotes[l.quoteToken.toLowerCase()];
    l.quoteSymbol = q.symbol; l.quoteDecimals = q.decimals; l.quoteIsUsdc = !!q.isUsdc; l.quoteUsd = q.usd;
    l.priceInQuote = null; l.priceUsdc = null; l.marketCapUsd = null; l.isLivePrice = false;
    if (q.unresolved || l.quoteIsCurrency0 == null) { l.initialVirtualQuote = null; return; }
    l.initialVirtualQuote = Number(ethers.formatUnits(l.initialVirtualQuoteRaw, q.decimals));
    const live = await getLivePriceUsdc(l.token, l.quoteToken, l.quoteIsCurrency0, q.decimals);
    l.priceInQuote = live ?? (l.initialVirtualQuote / ARC_SELLABLE_SUPPLY);
    l.priceUsdc = q.usd != null ? l.priceInQuote * q.usd : null;
    l.marketCapUsd = l.priceUsdc != null ? l.priceUsdc * ARC_DEFAULT_SUPPLY : null;
    // Every coin opens at ≈ $4,350; a reading billions of times off is a bad
    // read (or a broken pair price), not a market cap — don't show it.
    if (l.marketCapUsd != null && !(l.marketCapUsd < 1e11)) {
      console.warn("implausible market cap ignored", l.symbol, l.marketCapUsd);
      l.priceUsdc = null; l.marketCapUsd = null;
    }
    l.isLivePrice = live != null;
  }));
  if (unresolved && (ARC._quoteRetries || 0) < 3) {
    ARC._quoteRetries = (ARC._quoteRetries || 0) + 1;
    setTimeout(() => { loadArcpadLaunches().catch((err) => console.warn("launch reload failed", err)); }, 6000 * ARC._quoteRetries);
  } else if (!unresolved) ARC._quoteRetries = 0;

  built.sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1));
  ARC.launches = built;
  document.getElementById("ap-stat-count").textContent = String(built.length);
  document.getElementById("ap-home-count").textContent = String(built.length);
  const foot = document.getElementById("bp-side-foot-text");
  if (foot) foot.textContent = `${built.length} launch${built.length === 1 ? "" : "es"} live`;
  const okDot = document.getElementById("bp-side-status-dot");
  if (okDot) okDot.classList.remove("bp-bad");
  renderArcpadHome();
  renderArcpadExplore();
  if (typeof arcActivityStart === "function") arcActivityStart();
}

function arcEscHtml(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function launchCardHtml(l) {
  const safe = /^https?:\/\//i.test(l.imageUrl || "") || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(l.imageUrl || "");
  const img = safe
    ? `<img class="ap-card-logo" src="${arcEscHtml(l.imageUrl)}" alt="" onerror="this.style.visibility='hidden'">`
    : `<span class="ap-card-logo ph" style="${typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(l.token) : ""}">${arcEscHtml(String(l.symbol || "?").slice(0, 1).toUpperCase())}</span>`;
  return `
    <button type="button" class="launch-card card-type-curve ap-launch-card" data-token="${l.token}" style="text-align:left;cursor:pointer;border:1px solid var(--line);font:inherit;">
      <div class="ap-card-top">${img}<span class="ap-card-age" data-act="age">${typeof arcLaunchAge === "function" ? arcLaunchAge(l) : ""}</span></div>
      <div class="sym">$${arcEscHtml(l.symbol)}${l.quoteIsUsdc === false ? ` <span class="ap-pair-tag">/ ${arcEscHtml(l.quoteSymbol)}</span>` : ""}</div>
      <div class="name">${arcEscHtml(l.name)}</div>
      <svg class="ap-spark" data-act="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="meta">
        <span>${l.marketCapUsd != null ? fmtUsd(l.marketCapUsd) : l.priceInQuote != null && l.quoteDecimals != null && l.priceInQuote * ARC_DEFAULT_SUPPLY < 1e15 ? `${fmtCompact(l.priceInQuote * ARC_DEFAULT_SUPPLY)} ${arcEscHtml(l.quoteSymbol)}` : "—"} mcap</span>
        <span class="ap-chg" data-act="chg">—</span>
      </div>
      <div class="ap-card-vol" data-act="vol">Vol 24h …</div>
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
  if (typeof arcPaintCard === "function") track.querySelectorAll(".ap-launch-card").forEach(arcPaintCard);
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
  if (arcExploreSort === "watch") rows = rows.filter((l) => typeof arcIsWatched === "function" && arcIsWatched(l.token));
  const st = (l) => (typeof arcActStats === "function" && arcActStats(l.token)) || null;
  if (arcExploreSort === "name") rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  else if (arcExploreSort === "new") rows = [...rows].sort((a, b) => b.launchedAt - a.launchedAt);
  else if (arcExploreSort === "vol") rows = [...rows].sort((a, b) => ((st(b) || {}).vol || 0) - ((st(a) || {}).vol || 0) || b.launchedAt - a.launchedAt);
  else if (arcExploreSort === "last") rows = [...rows].sort((a, b) => ((st(b) || {}).lastB || 0) - ((st(a) || {}).lastB || 0) || b.launchedAt - a.launchedAt);
  else if (arcExploreSort === "gainers") rows = [...rows].sort((a, b) => ((typeof arcChangeSinceLaunch === "function" ? arcChangeSinceLaunch(b) : 0) ?? -1) - ((typeof arcChangeSinceLaunch === "function" ? arcChangeSinceLaunch(a) : 0) ?? -1));
  else rows = [...rows].sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1));
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const empty = ARC.launches.length === 0
    ? "No coins have launched on ArcPad yet — the Launch tab is where the first one starts."
    : arcExploreSort === "watch" && !q ? "Your watchlist is empty. Tap the star on any coin to keep it here."
    : `No launches match “${esc(q)}”.`;
  grid.innerHTML = rows.length ? rows.map(launchCardHtml).join("") : `<div class="empty-state">${empty}</div>`;
  wireLaunchCardClicks(grid);
  if (typeof arcPaintCard === "function") grid.querySelectorAll(".ap-launch-card").forEach(arcPaintCard);
}

function wireLaunchCardClicks(root) {
  root.querySelectorAll(".ap-launch-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (typeof openArcCoin === "function") openArcCoin(card.dataset.token);
      else openTradeModal(card.dataset.token);
    });
  });
}

// Same auto-scroll/drag carousel technique used elsewhere on the site
// (cnPONS.js's setupCarouselAutoScroll), copied here rather than shared —
// arc-shared.js is loaded by CirclePad too, which has no carousel at all.
function setupCarouselAutoScroll(viewport, track, itemCount) {
  if (!viewport || !track || itemCount === 0) return;
  // Re-rendering the track (a reload after a launch) must not start a second
  // animation loop on the same viewport — just re-measure.
  if (viewport._carousel) { viewport._carousel.remeasure(); return; }
  let singleSetWidth = track.scrollWidth / 3;
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
  viewport._carousel = { remeasure() { singleSetWidth = track.scrollWidth / 3; currentScroll = singleSetWidth; viewport.scrollLeft = currentScroll; } };
  // Pointer capture only once the pointer has actually moved: capturing on
  // pointerdown makes Chrome deliver the click to the viewport instead of
  // the card, so a plain tap on a card (or its ★) did nothing.
  let pressed = false, moved = false, pid = null;
  viewport.addEventListener("pointerdown", (e) => {
    pressed = true; moved = false; pid = e.pointerId;
    isDragging = true; dragStartX = e.clientX; dragStartScroll = viewport.scrollLeft;
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!pressed) return;
    if (!moved && Math.abs(e.clientX - dragStartX) > 6) {
      moved = true;
      try { viewport.setPointerCapture(pid); } catch { /* pointer already gone */ }
      viewport.classList.add("dragging");
    }
    if (moved) viewport.scrollLeft = dragStartScroll - (e.clientX - dragStartX);
  });
  // A drag ends with a click on whatever is under the pointer — swallow it.
  viewport.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  function endDrag() {
    if (!pressed) return;
    pressed = false; isDragging = false; viewport.classList.remove("dragging");
    currentScroll = viewport.scrollLeft; wrap(); viewport.scrollLeft = currentScroll;
    if (moved) setTimeout(() => { moved = false; }, 0);
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("pointerleave", endDrag);
}

// ---------- Launch form ----------
function wireArcpadImageUpload() {
  const imgInput = document.getElementById("ap-logo");
  const imgPreview = document.getElementById("ap-image-preview");
  const updatePreview = (url) => { imgPreview.innerHTML = url ? `<img src="${url}" onerror="this.parentElement.innerHTML=ARC_LOGO_PH">` : ARC_LOGO_PH; };
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
        // The image is stored on-chain inside the launch transaction, so
        // every byte costs gas (~740 gas per character of the data URL) and
        // Arc caps a single transaction's gas — a normal 256px JPEG was big
        // enough to make the launch impossible ("missing revert data").
        // Shrink until it fits comfortably: 128px first, then smaller.
        const encode = (dim, q) => {
          let { width, height } = img;
          const scale = Math.min(1, dim / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale)); height = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height); // JPEG has no alpha
          ctx.drawImage(img, 0, 0, width, height);
          let url = canvas.toDataURL("image/webp", q);
          if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", q);
          return { url, width, height };
        };
        let best = null;
        outer: for (const dim of [128, 112, 96, 80, 64]) {
          for (const q of [0.82, 0.7, 0.58, 0.45]) {
            const r = encode(dim, q);
            if (!best || r.url.length < best.url.length) best = r;
            if (r.url.length <= ARC_IMAGE_TARGET_CHARS) { best = r; break outer; }
          }
        }
        const resized = best.url;
        const resizedKb = (resized.length * 0.75 / 1024).toFixed(1);
        imgInput.value = resized;
        updatePreview(resized);
        const gasUsdc = arcImageGasUsdcHint(resized.length);
        hintEl.innerHTML = resized.length <= ARC_IMAGE_MAX_CHARS
          ? `Resized from ${originalKb}KB to ~${resizedKb}KB (${best.width}×${best.height}) — stored on-chain, adds ≈ ${gasUsdc} USDC of gas.`
          : `<strong style="color:var(--red)">This image is still too large to store on-chain. Use a simpler image or paste a hosted image URL.</strong>`;
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
  const pr = ARC.pair;
  if (!pr || !pr.reserveRaw) { el.textContent = ""; return; }
  const virtualQuote = Number(ethers.formatUnits(pr.reserveRaw, pr.meta.decimals));
  const devBuy = Number(devBuyStr);
  const tokensOut = ARC_SELLABLE_SUPPLY - (virtualQuote * ARC_SELLABLE_SUPPLY) / (virtualQuote + devBuy);
  el.textContent = `≈ ${fmtCompact(tokensOut)} tokens (${((tokensOut / ARC_SELLABLE_SUPPLY) * 100).toFixed(2)}% of the sellable supply) — approximate, before the trading fee.`;
}

// ---------- Pair token (USDC by default, $ARCIRCLE, or any token CA) ----------
ARC.pair = null;
let arcPairSeq = 0;
function arcFmtAmount(n) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e6) return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 2 : 6 });
}
function arcFmtUsdPrice(p) {
  if (typeof ac2FmtPrice === "function") return ac2FmtPrice(p);
  return p == null ? "—" : "$" + p.toPrecision(4);
}
async function arcpadSelectPair(key) {
  const seq = ++arcPairSeq;
  const seg = document.getElementById("ap-pair-seg");
  seg.querySelectorAll("button").forEach((b) => { const on = b.dataset.pair === key; b.classList.toggle("active", on); b.setAttribute("aria-checked", on ? "true" : "false"); });
  const caInput = document.getElementById("ap-pair-ca");
  caInput.hidden = key !== "custom";
  const info = document.getElementById("ap-pair-info");
  const setInfo = (html, kind) => { info.className = "ap-pair-info" + (kind ? " " + kind : ""); info.innerHTML = html; };
  let addr = null;
  if (key === "custom") {
    addr = caInput.value.trim();
    if (!addr) { ARC.pair = { key, error: "Paste the contract address of the token to pair with." }; setInfo("Paste the contract address of the token to pair with.", "muted"); arcpadRenderPair(); return; }
  } else addr = (ARC_QUOTE_PRESETS.find((p) => p.key === key) || ARC_QUOTE_PRESETS[0]).address;
  ARC.pair = { key, loading: true };
  setInfo("Checking the token and its price…", "muted");
  arcpadRenderPair();
  try {
    const meta = await arcQuoteMeta(addr);
    if (seq !== arcPairSeq) return;
    const px = await arcQuotePriceUsd(meta.address);
    if (seq !== arcPairSeq) return;
    if (px.price == null) {
      ARC.pair = { key, meta, error: `Couldn't find a USD price for ${meta.symbol} on Arc (checked the $ARCIRCLE curve, ArcPad pools and Dexscreener), so the starting market cap can't be set. Pick USDC, $ARCIRCLE or a token with a live market.` };
    } else {
      const reserveRaw = arcStartReserveRaw(px.price, meta.decimals);
      ARC.pair = reserveRaw ? { key, meta, usd: px.price, source: px.source, reserveRaw, at: Date.now() }
        : { key, meta, error: `${meta.symbol}'s price is out of range for a launch.` };
    }
    const m = ARC.pair.meta;
    if (ARC.pair.error) setInfo(arcEscHtml(ARC.pair.error), "bad");
    else {
      const warn = key === "custom" ? `<span class="ap-pair-warn">Only pair with a token you trust — tokens that tax transfers, rebase, or can freeze wallets can break the pool and trap funds.</span>` : "";
      setInfo(`<span class="ap-pair-ok">${arcEscHtml(m.name)} <b>${arcEscHtml(m.symbol)}</b> · <a href="${CONFIG.BLOCK_EXPLORER}/token/${m.address}" target="_blank" rel="noopener">${m.address.slice(0, 6)}…${m.address.slice(-4)} ↗</a> · 1 ${arcEscHtml(m.symbol)} ≈ ${arcFmtUsdPrice(ARC.pair.usd)} <span class="ap-pair-src">(${arcEscHtml(ARC.pair.source)})</span></span>${warn}`, "ok");
    }
  } catch (err) {
    if (seq !== arcPairSeq) return;
    ARC.pair = { key, error: String(err && err.message || err) };
    setInfo(arcEscHtml(ARC.pair.error), "bad");
  }
  arcpadRenderPair();
}
function arcpadRenderPair() {
  const pr = ARC.pair || {};
  const m = pr.meta;
  const sym = m ? m.symbol : "USDC";
  document.getElementById("ap-devbuy-unit").textContent = sym;
  document.getElementById("ap-devbuy-hint").textContent = `Buy your own tokens in the same transaction as the launch, before anyone else can. Requires a one-time ${sym} approval first. Leave blank to skip.`;
  const hint = document.getElementById("ap-start-hint");
  if (pr.reserveRaw) {
    const amt = Number(ethers.formatUnits(pr.reserveRaw, m.decimals));
    hint.textContent = m.isUsdc
      ? "Every ArcPad coin opens at the same price — the pool starts with a 4,000 USDC virtual reserve against the 920M sellable tokens, so there's nothing to set here."
      : `Every ArcPad coin opens at the same price — here the pool starts with a virtual reserve of ${arcFmtAmount(amt)} ${sym} (≈ $4,000 at today's ${sym} price) against the 920M sellable tokens. After launch the price moves with ${sym}'s own price too.`;
  } else if (pr.loading) hint.textContent = "Working out the opening reserve for this pair…";
  else if (pr.error) hint.textContent = "Choose a pair token with a known price to set the opening reserve.";
  const btnLabel = document.querySelector("#ap-launch-submit .ap-launch-btn-label");
  if (btnLabel && !document.getElementById("ap-launch-submit").classList.contains("is-busy")) btnLabel.textContent = m && !m.isUsdc && pr.reserveRaw ? `Launch coin / ${sym}` : "Launch coin";
  updateArcpadDevBuyPreview();
  updateArcpadLaunchBalance();
}
function wireArcpadPair() {
  document.getElementById("ap-pair-seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pair]"); if (!b) return;
    arcpadSelectPair(b.dataset.pair);
    if (b.dataset.pair === "custom") setTimeout(() => document.getElementById("ap-pair-ca").focus(), 0);
  });
  let t;
  document.getElementById("ap-pair-ca").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => arcpadSelectPair("custom"), 450); });
  arcpadSelectPair("usdc");
}

// ---------- Can this wallet afford the launch? ----------
// On Arc, gas and the launch fee are both paid in native USDC, and the
// ERC-20 USDC used for a dev buy is the SAME balance (just 6 decimals).
// Without a check, an underfunded wallet only got ethers' raw
// "missing revert data" from gas estimation.
const ARC_LAUNCH_FEE_FALLBACK = 10n ** 18n; // 1 USDC (native, 18 dp)
// Measured on Arc mainnet: a launch costs ≈1.05M gas plus ≈740 gas per
// character of metadata (the logo data URL dominates); one transaction may
// use at most ~16.7M gas. Keep embedded logos well under that.
const ARC_LAUNCH_BASE_GAS = 1_150_000n;
const ARC_GAS_PER_META_CHAR = 740n;
const ARC_IMAGE_TARGET_CHARS = 6_000;
const ARC_IMAGE_MAX_CHARS = 14_000;
let arcGasPriceCache = null;
function arcImageGasUsdcHint(chars) {
  const gp = arcGasPriceCache || 21_000_000_000n;
  return Number(ethers.formatEther(ARC_GAS_PER_META_CHAR * BigInt(chars) * gp)).toFixed(3);
}
function arcpadMetaChars() {
  return ["ap-logo", "ap-description", "ap-website", "ap-twitter", "ap-telegram", "ap-discord", "ap-name", "ap-symbol"]
    .reduce((n, id) => n + ((document.getElementById(id) || {}).value || "").trim().length, 0);
}
let arcLaunchFeeCache = null;
async function arcpadLaunchCost(devBuyStr) {
  if (arcLaunchFeeCache == null) {
    try { arcLaunchFeeCache = await withRetry(() => arcpadFactoryRead().LAUNCH_FEE()); } catch { arcLaunchFeeCache = ARC_LAUNCH_FEE_FALLBACK; }
  }
  const pr = ARC.pair && ARC.pair.meta ? ARC.pair.meta : { decimals: ARC_QUOTE_DECIMALS, isUsdc: true, symbol: "USDC" };
  let devQuote = 0n;
  try { devQuote = devBuyStr && Number(devBuyStr) > 0 ? ethers.parseUnits(devBuyStr, pr.decimals) : 0n; } catch { devQuote = 0n; }
  // On Arc, USDC's ERC-20 and native balances are the same money (6 vs 18 dp).
  const dev = pr.isUsdc ? devQuote * 10n ** 12n : 0n;
  const gasUnits = (ARC_LAUNCH_BASE_GAS + ARC_GAS_PER_META_CHAR * BigInt(arcpadMetaChars()) + (dev > 0n ? 500_000n : 0n)) * 12n / 10n;
  let gas = gasUnits * 21_000_000_000n;
  try {
    const fd = await readProvider().getFeeData();
    const gp = fd.gasPrice || fd.maxFeePerGas;
    if (gp) { arcGasPriceCache = gp; gas = gp * gasUnits; }
  } catch { /* keep the flat estimate */ }
  return { fee: arcLaunchFeeCache, dev, gas, gasUnits, total: arcLaunchFeeCache + dev + gas, devQuote, pairMeta: pr };
}
const fmtUsdc18 = (v) => Number(ethers.formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

async function updateArcpadLaunchBalance() {
  const el = document.getElementById("ap-launch-balance");
  if (!el) return;
  if (!state.account) { el.textContent = ""; el.className = "ap-launch-balance"; return; }
  try {
    const devBuyStr = document.getElementById("ap-devbuy").value.trim();
    const [bal, cost] = await Promise.all([withRetry(() => readProvider().getBalance(state.account)), arcpadLaunchCost(devBuyStr)]);
    let ok = bal >= cost.total;
    let text = ok
      ? `Wallet: ${fmtUsdc18(bal)} USDC · this launch needs ≈ ${fmtUsdc18(cost.total)} USDC`
      : `Not enough USDC — this launch needs ≈ ${fmtUsdc18(cost.total)} USDC (1 USDC fee${cost.dev > 0n ? " + dev buy" : ""} + gas), this wallet has ${fmtUsdc18(bal)} USDC on Arc.`;
    if (!cost.pairMeta.isUsdc && cost.devQuote > 0n) {
      const qb = await tokenRead(cost.pairMeta.address).balanceOf(state.account);
      const fmtQ = (v) => Number(ethers.formatUnits(v, cost.pairMeta.decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 });
      if (qb < cost.devQuote) { ok = false; text = `Not enough ${cost.pairMeta.symbol} for the dev buy — needs ${fmtQ(cost.devQuote)}, this wallet has ${fmtQ(qb)}.`; }
      else if (ok) text += ` · dev buy ${fmtQ(cost.devQuote)} ${cost.pairMeta.symbol} (you have ${fmtQ(qb)})`;
    }
    el.className = "ap-launch-balance " + (ok ? "ok" : "short");
    el.textContent = text;
  } catch { el.textContent = ""; }
}

/// Plain-language version of the errors wallets / ethers throw.
function arcpadTxErrorText(err) {
  const raw = String(err && (err.shortMessage || err.reason || err.message) || err);
  if (/user rejected|user denied|rejected the request|ACTION_REJECTED|4001/i.test(raw)) return "Cancelled in your wallet.";
  if (/insufficient funds|exceeds balance|missing revert data/i.test(raw)) return "The transaction can't go through — most often the wallet doesn't have enough USDC on Arc for the amount plus gas. Top up and try again.";
  return raw.slice(0, 220);
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
  const extraFeeBps = Number(document.getElementById("ap-extrafee").value);
  const devBuyStr = document.getElementById("ap-devbuy").value.trim();

  if (!name || !symbol) { statusEl.innerHTML = `<div class="status error">Name and symbol are required.</div>`; return; }
  if (imageUrl.startsWith("data:") && imageUrl.length > ARC_IMAGE_MAX_CHARS) {
    statusEl.innerHTML = `<div class="status error">That logo is too large to store on-chain (${Math.round(imageUrl.length / 1000)}K characters; max ≈ ${ARC_IMAGE_MAX_CHARS / 1000}K). Upload it again — it's shrunk automatically — or paste a hosted image URL.</div>`;
    return;
  }
  if (!arcpadFactoryConfigured()) { statusEl.innerHTML = `<div class="status error">ArcPad's factory isn't configured yet.</div>`; return; }

  // Pair token: must be resolved with a price; refresh a stale price so the
  // opening reserve still means ≈ $4,000.
  if (ARC.pair && ARC.pair.meta && !ARC.pair.error && Date.now() - (ARC.pair.at || 0) > 90_000) await arcpadSelectPair(ARC.pair.key);
  const pair = ARC.pair;
  if (!pair || pair.loading) { statusEl.innerHTML = `<div class="status error">Still checking the pair token — try again in a moment.</div>`; return; }
  if (pair.error || !pair.reserveRaw) { statusEl.innerHTML = `<div class="status error">${arcEscHtml(pair.error || "Choose a pair token first.")}</div>`; return; }
  const quoteAddr = pair.meta.address, quoteSym = pair.meta.symbol, quoteDec = pair.meta.decimals;
  let devBuyQuote = 0n;
  try { devBuyQuote = devBuyStr && Number(devBuyStr) > 0 ? ethers.parseUnits(devBuyStr, quoteDec) : 0n; }
  catch { statusEl.innerHTML = `<div class="status error">That dev-buy amount has too many decimals for ${arcEscHtml(quoteSym)}.</div>`; return; }

  if (!state.account) {
    statusEl.innerHTML = `<div class="status pending">Connect a wallet first…</div>`;
    await connectWallet();
    if (!state.account) { statusEl.innerHTML = `<div class="status error">Connect a wallet to launch.</div>`; return; }
  }

  try {
    const [bal, cost] = await Promise.all([withRetry(() => readProvider().getBalance(state.account)), arcpadLaunchCost(devBuyStr)]);
    if (bal < cost.total) {
      statusEl.innerHTML = `<div class="status error">Not enough USDC on Arc. This launch needs about <b>${fmtUsdc18(cost.total)} USDC</b> (1 USDC fee${cost.dev > 0n ? ` + ${fmtUsdc18(cost.dev)} USDC dev buy` : ""} + ≈${fmtUsdc18(cost.gas)} gas) — this wallet has <b>${fmtUsdc18(bal)} USDC</b>.</div>`;
      updateArcpadLaunchBalance();
      return;
    }
    if (!pair.meta.isUsdc && devBuyQuote > 0n) {
      const qb = await tokenRead(quoteAddr).balanceOf(state.account);
      if (qb < devBuyQuote) {
        statusEl.innerHTML = `<div class="status error">Not enough ${arcEscHtml(quoteSym)} for the dev buy — this wallet has ${ethers.formatUnits(qb, quoteDec)} ${arcEscHtml(quoteSym)}.</div>`;
        return;
      }
    }
  } catch (err) { console.warn("launch balance check skipped", err && err.message); }

  // Dry run the plain launch (a dev buy needs its USDC approval first, so it
  // can't be simulated yet) — turns a would-fail launch into a clear reason
  // before the wallet is ever asked.
  if (!(devBuyStr && Number(devBuyStr) > 0)) {
    try {
      const f = arcpadFactoryRead();
      const fee = arcLaunchFeeCache || await f.LAUNCH_FEE();
      const meta = { imageUrl, description, twitter, telegram, discord, website };
      await readProvider().estimateGas({
        from: state.account, to: CONFIG.ARCPAD_FACTORY_ADDRESS, value: fee,
        data: f.interface.encodeFunctionData("launch", [name, symbol, quoteAddr, pair.reserveRaw, extraFeeBps, meta]),
      });
    } catch (err) {
      const raw = String(err && (err.shortMessage || err.reason || err.message) || err);
      const reason = err && err.reason;
      let msg;
      if (reason) msg = `The launch would fail: ${reason}`;
      else if (imageUrl.length > ARC_IMAGE_TARGET_CHARS) msg = "The launch would fail — most likely the logo is too large to store on-chain. Upload a smaller image (it's shrunk automatically) or paste a hosted image URL.";
      else msg = `The launch would fail: ${raw.slice(0, 180)}`;
      statusEl.innerHTML = `<div class="status error">${msg}</div>`;
      return;
    }
  }

  btn.disabled = true;
  btn.classList.add("is-busy");
  const btnLabel = btn.querySelector(".ap-launch-btn-label");
  if (btnLabel) btnLabel.textContent = "Launching…";
  try {
    const initialVirtualQuote = pair.reserveRaw;
    const meta = { imageUrl, description, twitter, telegram, discord, website };
    await ensureArcForWrite();
    const factory = arcpadFactoryWrite();
    const launchFee = await withRetry(() => factory.LAUNCH_FEE());

    if (devBuyQuote > 0n) {
      const allowance = await tokenRead(quoteAddr).allowance(state.account, CONFIG.ARCPAD_FACTORY_ADDRESS);
      if (allowance < devBuyQuote) {
        statusEl.innerHTML = `<div class="status pending">Approve ${arcEscHtml(quoteSym)} for the dev buy in your wallet…</div>`;
        const tx = await tokenWrite(quoteAddr).approve(CONFIG.ARCPAD_FACTORY_ADDRESS, devBuyQuote);
        await tx.wait();
      }
    }

    statusEl.innerHTML = `<div class="status pending">Confirm the launch in your wallet…</div>`;
    const tx = devBuyQuote > 0n
      ? await factory.launchAndBuy(name, symbol, quoteAddr, initialVirtualQuote, extraFeeBps, meta, devBuyQuote, { value: launchFee })
      : await factory.launch(name, symbol, quoteAddr, initialVirtualQuote, extraFeeBps, meta, { value: launchFee });
    statusEl.innerHTML = `<div class="status pending">Launching… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">tx ↗</a></div>`;
    const receipt = await tx.wait();
    const newToken = typeof arcLaunchedTokenFromReceipt === "function" ? arcLaunchedTokenFromReceipt(receipt) : null;
    statusEl.innerHTML = `<div class="status success">Launched!${newToken ? " Opening your coin's page…" : ""} <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${receipt.hash}" target="_blank">tx ↗</a></div>`;
    document.getElementById("ap-launch-form").reset();
    document.getElementById("ap-image-preview").innerHTML = ARC_LOGO_PH;
    document.getElementById("ap-image-hint").textContent = "A hosted URL is best. An uploaded file is shrunk to a small icon (~128px) and stored on-chain — the bigger it is, the more gas the launch costs.";
    // reset() puts the slider back to 0 but fires no input event, so the fee
    // breakdown and dev-buy preview have to be re-rendered by hand.
    document.getElementById("ap-extrafee").dispatchEvent(new Event("input"));
    arcpadSelectPair("usdc");
    const reload = loadArcpadLaunches().catch((err) => console.error(err));
    if (newToken && typeof openArcCoin === "function") {
      // Straight to the new coin's page (it reads from chain, so it doesn't
      // need the launch list to finish reloading first).
      setTimeout(() => {
        openArcCoin(newToken); statusEl.innerHTML = "";
        if (typeof arcCelebrateLaunch === "function") arcCelebrateLaunch(newToken);
      }, 900);
      reload.then(() => { if (typeof APC !== "undefined" && APC.token && APC.token.toLowerCase() === newToken.toLowerCase()) apcRefresh(); });
    }
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<div class="status error">${arcpadTxErrorText(err)}</div>`;
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-busy");
    if (btnLabel) btnLabel.textContent = "Launch coin";
    arcpadRenderPair();
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
    await ensureArcForWrite();
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
    statusEl.innerHTML = `<div class="status error">${arcpadTxErrorText(err)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

// This page's own version of app.js's global refreshAccountDependentViews()
// — arc-shared.js is a shared library across ARCPAD and CIRCLEPAD, so it
// doesn't know which page-specific refresh functions exist.
function refreshAccountDependentViews() {
  updateArcpadLaunchBalance();
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
    if (tab !== "coin" && history.replaceState) { // the coin page writes its own #coin/<address>
      const want = tab === "home" ? "" : `#${tab}`;
      if (location.hash !== want) history.replaceState(null, "", location.pathname + location.search + want);
    }
    document.dispatchEvent(new CustomEvent("arcpad:tab", { detail: { tab } }));
    if (tab === "launch") updateArcpadLaunchBalance();
  }
  window.arcpadShowTab = showTab;
  const tabFromHash = () => {
    const t = location.hash.slice(1);
    if (t === "coin" || t.startsWith("coin/")) return null; // handled by arcpad-coin.js
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
  let balT; const queueBal = () => { clearTimeout(balT); balT = setTimeout(updateArcpadLaunchBalance, 350); };
  ["ap-devbuy", "ap-logo", "ap-description"].forEach((id) => document.getElementById(id).addEventListener("input", queueBal));
  document.getElementById("ap-logo-file").addEventListener("change", () => setTimeout(queueBal, 600));
  wireArcpadImageUpload();
  wireArcpadPair();
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

  let loadingLaunches = null;
  const loadLaunches = () => {
    if (loadingLaunches) return loadingLaunches;
    loadingLaunches = loadArcpadLaunches().catch((err) => {
      console.error("loadArcpadLaunches failed", err);
      if (!ARC.launches.length) renderArcpadLoadError(err);
    }).finally(() => { loadingLaunches = null; });
    return loadingLaunches;
  };
  loadLaunches();
  // Reads switched to a fallback RPC: load again if the first try failed.
  window.addEventListener("arc:rpc-switched", () => {
    Promise.resolve(loadingLaunches).then(() => { if (!ARC.launches.length) loadLaunches(); });
    if (typeof APC !== "undefined" && APC.token && !APC.l && typeof openArcCoin === "function") setTimeout(() => openArcCoin(APC.token), 400);
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
