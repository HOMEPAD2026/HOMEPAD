/* global CONFIG */

async function loadHomeStats() {
  const statsEl = document.getElementById("home-stats");
  const chartEl = document.getElementById("home-chart");

  // Chart embed doesn't need JS — just point the iframe at Dexscreener.
  chartEl.innerHTML = `
    <iframe
      src="https://dexscreener.com/${CONFIG.DEXSCREENER_CHAIN_SLUG}/${CONFIG.DEXSCREENER_PAIR_ADDRESS}?embed=1&theme=dark&trades=0&info=0"
      style="width:100%;height:100%;border:0;"
      title="$HOME price chart">
    </iframe>
  `;

  // Dexscreener: price / liquidity / volume / market cap
  fetchDexscreener().catch((err) => console.error("dexscreener fetch failed", err));
  // Blockscout: holder count + total supply, straight from the chain's own explorer
  fetchHolderStats().catch((err) => console.error("blockscout fetch failed", err));
  // HOMEPAD's own launches, biggest market cap first, auto-scrolling carousel
  // Deferred slightly (idle callback, or a short timeout where that API
  // isn't available) so this doesn't compete with the page's first paint
  // and the chart/stats fetches above for RPC bandwidth and main-thread
  // time — it's the heaviest of the three (several rounds of on-chain
  // reads across every launch), and it's further down the page anyway.
  const startCarousel = () => loadLaunchCarousel().catch((err) => console.error("launch carousel failed", err));
  if (window.requestIdleCallback) requestIdleCallback(startCarousel, { timeout: 1500 });
  else setTimeout(startCarousel, 300);
}

async function loadLaunchCarousel() {
  const track = document.getElementById("launch-carousel-track");
  if (!track) return;
  track.innerHTML = skeletonCardsHtml(5); // from app.js — placeholder cards while the real ones load

  const entries = await fetchAllLaunches({ skipHistory: true }); // from app.js — fast path, no per-token event-log queries
  if (!entries.length) {
    track.innerHTML = `<p style="color:var(--ink-dim);padding:20px 0">No launches yet.</p>`;
    return;
  }

  entries.sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0));

  // Three copies back-to-back so there's always a full screen of cards to
  // drag into on either side before the loop-reset kicks in — two copies
  // isn't enough buffer once someone drags backward past the start.
  const cardsHtml = entries.map(launchCardHtml).join("");
  track.innerHTML = cardsHtml + cardsHtml + cardsHtml;

  setupCarouselAutoScroll(document.getElementById("launch-carousel-viewport"), track, entries.length);
}

/// Auto-scrolls right endlessly at a steady pace, and switches to
/// following the pointer while the person is actively dragging (mouse
/// or touch — Pointer Events cover both with one code path). Three
/// looping copies of the card set give enough room to drag either
/// direction without ever hitting the real start/end of the scroll area.
function setupCarouselAutoScroll(viewport, track, itemCount) {
  if (!viewport || !track || itemCount === 0) return;

  const singleSetWidth = track.scrollWidth / 3;
  let currentScroll = singleSetWidth; // start in the middle copy
  viewport.scrollLeft = currentScroll;

  const SPEED = 0.5; // px per frame — slow, readable drift, not a blur
  let isDragging = false;
  let dragStartX = 0;
  let dragStartScroll = 0;

  function wrap() {
    // Keep currentScroll within the middle copy's range so there's
    // always a full set of cards to drag into on either side.
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

async function fetchDexscreener() {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CONFIG.HOME_TOKEN_ADDRESS}`);
  if (!res.ok) throw new Error("dexscreener http " + res.status);
  const data = await res.json();
  const pair = (data.pairs || []).find((p) => p.pairAddress?.toLowerCase() === CONFIG.DEXSCREENER_PAIR_ADDRESS.toLowerCase())
    || (data.pairs || [])[0];
  if (!pair) return;

  setStat("stat-price", pair.priceUsd ? `$${Number(pair.priceUsd).toPrecision(4)}` : "—");
  setStat("stat-change", pair.priceChange?.h24 != null ? `${pair.priceChange.h24 > 0 ? "+" : ""}${pair.priceChange.h24}%` : "—",
    pair.priceChange?.h24 > 0 ? "up" : pair.priceChange?.h24 < 0 ? "down" : "");
  setStat("stat-liquidity", pair.liquidity?.usd ? formatUsd(pair.liquidity.usd) : "—");
  setStat("stat-volume", pair.volume?.h24 ? formatUsd(pair.volume.h24) : "—");
  setStat("stat-mcap", pair.marketCap ? formatUsd(pair.marketCap) : (pair.fdv ? formatUsd(pair.fdv) : "—"));
}

async function fetchHolderStats() {
  const base = CONFIG.HOME_BLOCKSCOUT_API_BASE || CONFIG.BLOCKSCOUT_API_BASE;

  try {
    // $HOME is on mainnet, so the modern v2 counters endpoint (the one
    // actually documented for this) should work correctly here — it
    // only failed before because it was being pointed at the testnet
    // explorer, where $HOME doesn't exist at all.
    const res = await fetch(`${base}/api/v2/tokens/${CONFIG.HOME_TOKEN_ADDRESS}/counters`);
    if (res.ok) {
      const data = await res.json();
      if (data.token_holders_count != null) {
        setStat("stat-holders", Number(data.token_holders_count).toLocaleString());
        const subEl = document.querySelector('[data-stat-sub="stat-holders"]');
        if (subEl) subEl.textContent = "via Blockscout";
        return;
      }
    }
  } catch (err) { /* fall through to the next attempt */ }

  try {
    const res = await fetch(`${base}/api/v2/tokens/${CONFIG.HOME_TOKEN_ADDRESS}`);
    if (res.ok) {
      const data = await res.json();
      if (data.holders_count != null) {
        setStat("stat-holders", Number(data.holders_count).toLocaleString());
        const subEl = document.querySelector('[data-stat-sub="stat-holders"]');
        if (subEl) subEl.textContent = "via Blockscout";
        return;
      }
    }
  } catch (err) { /* fall through to the next attempt */ }

  try {
    const res = await fetch(`${base}/api?module=token&action=getToken&contractaddress=${CONFIG.HOME_TOKEN_ADDRESS}`);
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }
    const result = data?.result;
    const holders = (result && typeof result === "object")
      ? (result.holders ?? result.holdersCount ?? result.holder_count ?? result.HoldersCount)
      : null;
    if (holders != null) {
      setStat("stat-holders", Number(holders).toLocaleString());
      const subEl = document.querySelector('[data-stat-sub="stat-holders"]');
      if (subEl) subEl.textContent = "via Blockscout";
      return;
    }
    const subEl = document.querySelector('[data-stat-sub="stat-holders"]');
    if (subEl) subEl.textContent = `HTTP ${res.status}: ${raw.slice(0, 300)}`;
    setStat("stat-holders", "—");
  } catch (err) {
    console.error("Holders fetch failed", err);
    setStat("stat-holders", "—");
    const subEl = document.querySelector('[data-stat-sub="stat-holders"]');
    if (subEl) subEl.textContent = "fetch blocked: " + err.message;
  }
}

function formatUsd(n) {
  n = Number(n);
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function setStat(id, value, cssClass) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  if (cssClass) el.classList.add(cssClass);
}

/// Shared by both address pills ($HOME and $HOMEPAD) — copies whichever
/// address the button belongs to.
function copyCA(address, btnId) {
  navigator.clipboard.writeText(address);
  const btn = document.getElementById(btnId);
  const original = btn.textContent;
  btn.textContent = "copied!";
  setTimeout(() => (btn.textContent = original), 1500);
}

document.addEventListener("DOMContentLoaded", loadHomeStats);
