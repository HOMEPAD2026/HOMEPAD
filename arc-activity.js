/* global ethers, CONFIG, ARC, ARC_FACTORY_ABI, ARC_SELLABLE_SUPPLY, readProvider, withRetry, multicallRead,
          arcPriceInQuote, TRANSIENT_RPC, RATE_LIMITED, renderArcpadExploreGrid, arcExploreSort */
// arc-activity.js — live trading activity across every ArcPad pool (plus the
// $ARCIRCLE curve), read straight from Arc. No indexer, no backend:
//   • one eth_getLogs per ~9k-block chunk for the PoolManager's Swap events,
//     filtered to all ArcPad pool ids at once (topic1 = [id, id, …])
//   • the last 24h are kept, cached in localStorage, and topped up every 20s
// It powers three things on ArcPad:
//   1. the live trade ticker (#ap-ticker)
//   2. per-coin stats on launch cards — 24h volume, sparkline, change since
//      launch, age — painted in place so carousels don't restart
//   3. the Explore sorts that need activity (Volume 24h, Gainers, Last trade)

const ACT_SWAP = ethers.id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const ACT_CURVE_BUY = ethers.id("CurveBuy(address,address,uint256,uint256,uint256,uint256)");
const ACT_CURVE_SELL = ethers.id("CurveSell(address,address,uint256,uint256,uint256,uint256)");
const ACT_CURVE = "0xa37A96C43e2335553BD79171DE6dB2806414AC64";
const ACT_CHUNK = 9_000;
const ACT_WINDOW_SEC = 24 * 3600;
const ACT_CACHE_KEY = `arcpad.activity.v1.${CONFIG.CHAIN_ID_DECIMAL}`;
const ACT = {
  started: false, busy: false,
  pools: new Map(),        // poolId -> launch
  recs: [], lo: null, hi: null,
  curve: [], curveHi: null,
  anchor: null, spb: 0.5,  // latest block {block, ts}; seconds per block
  stats: new Map(),        // token(lower) -> {vol, trades, lastB, spark:[price…]}
  ticker: [], seen: new Set(),
};

// ---------- helpers ----------
function actSigned(hex) { const v = BigInt(hex); return v >= (1n << 255n) ? v - (1n << 256n) : v; }
function actTs(b) { return ACT.anchor ? Math.round(ACT.anchor.ts - (ACT.anchor.block - b) * ACT.spb) : null; }
function actAgo(sec) {
  if (sec == null || !isFinite(sec)) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function actUsd(n) {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toPrecision(2);
}
function actEsc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
async function actGetLogs(params) {
  for (let attempt = 0; ; attempt++) {
    try { return await readProvider().send("eth_getLogs", [params]); } catch (err) {
      const text = JSON.stringify(err && err.error || "") + String(err && (err.shortMessage || err.message) || err);
      if (!(RATE_LIMITED.test(text) || TRANSIENT_RPC.test(text)) || attempt >= 6) throw err;
      if (typeof rpcNoteFailure === "function") { const sw = rpcNoteFailure(); if (sw) await sw; }
      await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt)));
    }
  }
}

/// The exact opening price of an ArcPad pool, in pair-token units per coin —
/// mirrors HomepadFactoryArc: price = virtualQuote / sellable, converted to
/// a tick (floor), truncated toward zero to the 200-tick spacing.
function arcStartPrice(l) {
  if (!l || l.initialVirtualQuoteRaw == null || l.quoteIsCurrency0 == null || l.quoteDecimals == null) return null;
  const sellableRaw = ARC_SELLABLE_SUPPLY * 1e18;
  const q = Number(l.initialVirtualQuoteRaw);
  if (!(q > 0)) return null;
  const raw = l.quoteIsCurrency0 ? sellableRaw / q : q / sellableRaw; // currency1 per currency0, raw units
  let tick = Math.floor(Math.log(raw) / Math.log(1.0001));
  tick = Math.trunc(tick / 200) * 200;
  const alignedRaw = Math.pow(1.0001, tick);
  const scale = Math.pow(10, 18 - (l.quoteDecimals ?? 6));
  const p = l.quoteIsCurrency0 ? scale / alignedRaw : alignedRaw * scale;
  return isFinite(p) && p > 0 ? p : null;
}
function arcChangeSinceLaunch(l) {
  const p0 = arcStartPrice(l);
  if (!p0 || l.priceInQuote == null) return null;
  const c = l.priceInQuote / p0 - 1;
  return Math.abs(c) < 0.0005 ? 0 : c;
}
function arcActStats(token) { return ACT.stats.get(String(token).toLowerCase()) || null; }
function arcLaunchAge(l) { return l && l.launchedAt ? actAgo(l.launchedAt) : ""; }

// ---------- pool ids ----------
async function actResolvePools() {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const f = new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, readProvider());
  const keys = ARC.poolKeys || (ARC.poolKeys = {});
  const missing = ARC.launches.filter((l) => !keys[l.token.toLowerCase()]);
  if (missing.length) {
    const got = await multicallRead(missing.map((l) => ({ contract: f, method: "poolKeyOf", args: [l.token] }))).catch(() => []);
    missing.forEach((l, i) => { if (got[i]) keys[l.token.toLowerCase()] = got[i]; });
  }
  for (const l of ARC.launches) {
    const k = keys[l.token.toLowerCase()];
    if (!k) continue;
    const id = ethers.keccak256(coder.encode(["address", "address", "uint24", "int24", "address"],
      [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks])).toLowerCase();
    ACT.pools.set(id, l);
  }
}

// ---------- scanning ----------
function actLoadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(ACT_CACHE_KEY) || "null");
    if (c && Array.isArray(c.recs) && Number.isFinite(c.lo) && Number.isFinite(c.hi)) { ACT.recs = c.recs; ACT.lo = c.lo; ACT.hi = c.hi; }
  } catch { /* storage blocked */ }
}
function actSaveCache() {
  try { localStorage.setItem(ACT_CACHE_KEY, JSON.stringify({ lo: ACT.lo, hi: ACT.hi, recs: ACT.recs })); } catch { /* fine */ }
}
function actCompact(log) {
  const d = log.data.slice(2);
  const w = (k) => "0x" + d.slice(k * 64, (k + 1) * 64);
  return { b: parseInt(log.blockNumber, 16), i: parseInt(log.logIndex, 16), h: log.transactionHash, p: log.topics[1].toLowerCase(),
    a0: actSigned(w(0)).toString(), a1: actSigned(w(1)).toString(), sq: BigInt(w(2)).toString() };
}
async function actFetchSwaps(from, to) {
  const ids = [...ACT.pools.keys()];
  if (!ids.length || from > to) return [];
  const logs = await actGetLogs({ address: CONFIG.POOL_MANAGER_ADDRESS, topics: [ACT_SWAP, ids],
    fromBlock: ethers.toQuantity(from), toBlock: ethers.toQuantity(to) });
  return logs.map(actCompact);
}
async function actFetchCurve(from, to) {
  if (from > to) return [];
  const logs = await actGetLogs({ address: ACT_CURVE, topics: [[ACT_CURVE_BUY, ACT_CURVE_SELL]],
    fromBlock: ethers.toQuantity(from), toBlock: ethers.toQuantity(to) });
  return logs.map((log) => {
    const d = log.data.slice(2);
    const w = (k) => BigInt("0x" + d.slice(k * 64, (k + 1) * 64));
    const buy = log.topics[0] === ACT_CURVE_BUY;
    return { b: parseInt(log.blockNumber, 16), i: parseInt(log.logIndex, 16), h: log.transactionHash, buy,
      usd: Number(buy ? w(0) : w(1)) / 1e6 };
  });
}

async function actSeedFromServer(latestNumber) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch("/api/activity", { signal: ctl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) return false;
    const d = await r.json();
    if (!d || d.v !== 1 || !Array.isArray(d.recs) || !Array.isArray(d.pools)) return false;
    const have = new Set(d.pools.map((x) => String(x).toLowerCase()));
    if ([...ACT.pools.keys()].some((id) => !have.has(id))) return false; // a launch newer than the edge copy
    if (!(d.hi >= latestNumber - 4 * ACT_CHUNK) || d.hi > latestNumber + 50) return false;
    ACT.recs = d.recs.filter((x) => ACT.pools.has(x.p));
    ACT.lo = d.lo; ACT.hi = Math.min(d.hi, latestNumber);
    if (ACT.curveHi == null && Array.isArray(d.curve)) { ACT.curve = d.curve; ACT.curveHi = Math.min(d.curveHi || d.hi, latestNumber); }
    return true;
  } catch { return false; }
}

async function actScan() {
  if (ACT.busy) return;
  ACT.busy = true;
  try {
    const p = readProvider();
    const latest = await withRetry(() => p.getBlock("latest"));
    if (!ACT.anchor) {
      // seconds per block, measured once per visit
      try {
        const back = await withRetry(() => p.getBlock(Math.max(0, latest.number - 20_000)));
        const spb = (Number(latest.timestamp) - Number(back.timestamp)) / Math.max(1, latest.number - back.number);
        if (spb > 0.05 && spb < 20) ACT.spb = spb;
      } catch { /* keep default */ }
    }
    ACT.anchor = { block: latest.number, ts: Number(latest.timestamp) };
    const windowStart = latest.number - Math.ceil(ACT_WINDOW_SEC / ACT.spb);
    const newIds = ACT.pools.size !== ACT._poolCount;
    ACT._poolCount = ACT.pools.size;

    // A new launch since the cache was written: its pool isn't in the cached
    // filter, so start over rather than miss its trades.
    if (ACT.hi == null || ACT.hi < windowStart || (newIds && ACT._scannedOnce)) {
      // Nothing usable cached: take the last 24h in one edge-cached request
      // (api/activity.mjs) and only scan forward from there ourselves.
      if (!(await actSeedFromServer(latest.number))) { ACT.recs = []; ACT.lo = latest.number + 1; ACT.hi = latest.number; }
    }
    ACT._scannedOnce = true;

    // 1) forward: everything since the last visit / poll
    for (let a = ACT.hi + 1; a <= latest.number; a += ACT_CHUNK) {
      const b = Math.min(latest.number, a + ACT_CHUNK - 1);
      ACT.recs.push(...await actFetchSwaps(a, b));
      ACT.hi = b;
    }
    // $ARCIRCLE trades for the ticker: last chunk on first load, then forward
    const cFrom = ACT.curveHi == null ? latest.number - ACT_CHUNK + 1 : ACT.curveHi + 1;
    try { ACT.curve.push(...await actFetchCurve(cFrom, latest.number)); ACT.curveHi = latest.number; } catch { /* ticker just skips them */ }
    actDerive(); actPaint();

    // 2) backward: fill the rest of the 24h window, newest first
    while (ACT.lo > windowStart) {
      const a = Math.max(windowStart, ACT.lo - ACT_CHUNK);
      ACT.recs = (await actFetchSwaps(a, ACT.lo - 1)).concat(ACT.recs);
      ACT.lo = a;
      actDerive(); actPaint();
    }
    // trim to the window
    ACT.recs = ACT.recs.filter((r) => r.b >= windowStart);
    ACT.lo = Math.max(ACT.lo, windowStart);
    ACT.curve = ACT.curve.filter((r) => r.b >= latest.number - 4 * ACT_CHUNK).slice(-200);
    actSaveCache();
    actDerive(); actPaint();
    if (!ACT._sortedOnce && typeof arcExploreSort !== "undefined" && ["vol", "gainers", "last"].includes(arcExploreSort)) {
      ACT._sortedOnce = true;
      renderArcpadExploreGrid();
    }
  } catch (err) {
    console.warn("ArcPad activity scan failed", err);
  } finally {
    ACT.busy = false;
  }
}

// ---------- derive ----------
function actDerive() {
  const stats = new Map();
  const trades = [];
  const sorted = ACT.recs.slice().sort((a, b) => (a.b - b.b) || (a.i - b.i));
  const now = Date.now() / 1000;
  for (const r of sorted) {
    const l = ACT.pools.get(r.p);
    if (!l || l.quoteDecimals == null) continue; // pair token not read yet
    const tokenIs0 = !l.quoteIsCurrency0;
    const a0 = BigInt(r.a0), a1 = BigInt(r.a1);
    const tokD = tokenIs0 ? a0 : a1, quoteD = tokenIs0 ? a1 : a0;
    const buy = tokD > 0n;
    const absQ = Number(quoteD < 0n ? -quoteD : quoteD) / Math.pow(10, l.quoteDecimals ?? 6);
    const usd = l.quoteUsd != null ? absQ * l.quoteUsd : null;
    const price = arcPriceInQuote(BigInt(r.sq), l.quoteIsCurrency0, l.quoteDecimals ?? 6);
    const key = l.token.toLowerCase();
    let s = stats.get(key);
    if (!s) { s = { vol: 0, trades: 0, lastB: 0, spark: [], vol1h: 0, trades1h: 0 }; stats.set(key, s); }
    s.vol += usd || 0; s.trades++; s.lastB = r.b;
    const ts = actTs(r.b);
    if (ts != null && now - ts <= 3600) { s.vol1h += usd || 0; s.trades1h++; }
    if (price) s.spark.push(price);
    trades.push({ b: r.b, i: r.i, h: r.h, buy, usd, sym: l.symbol, token: l.token, img: l.imageUrl });
  }
  for (const c of ACT.curve) trades.push({ b: c.b, i: c.i, h: c.h, buy: c.buy, usd: c.usd, sym: "ARCIRCLE", token: null, img: "images/arcircle-mark-sm.png" });
  trades.sort((a, b) => (b.b - a.b) || (b.i - a.i));
  ACT.stats = stats;
  ACT.ticker = trades.slice(0, 24);
}

// ---------- paint ----------
function actSparkPath(pts, w = 100, h = 24) {
  if (!pts || pts.length < 2) return "";
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || hi || 1;
  return pts.map((v, i) => `${i ? "L" : "M"}${(i / (pts.length - 1) * w).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`).join("");
}
function arcPaintCard(card) {
  const l = ARC.launches.find((x) => x.token.toLowerCase() === String(card.dataset.token).toLowerCase());
  if (!l) return;
  const s = arcActStats(l.token);
  const chg = arcChangeSinceLaunch(l);
  const chgEl = card.querySelector("[data-act=chg]");
  if (chgEl) {
    chgEl.textContent = chg == null ? "—" : `${chg > 0 ? "▲" : chg < 0 ? "▼" : ""}${Math.abs(chg * 100) >= 1000 ? Math.round(chg * 100).toLocaleString("en-US") : Math.abs(chg * 100).toFixed(Math.abs(chg) < 0.1 ? 1 : 0)}%`;
    chgEl.className = `ap-chg ${chg > 0 ? "up" : chg < 0 ? "down" : "flat"}`;
    chgEl.title = "Change since launch";
  }
  const volEl = card.querySelector("[data-act=vol]");
  if (volEl) volEl.textContent = ACT.hi == null ? "Vol 24h …" : `Vol 24h ${s ? actUsd(s.vol) : "$0"} · ${s ? s.trades : 0} trade${s && s.trades === 1 ? "" : "s"}`;
  const ageEl = card.querySelector("[data-act=age]");
  if (ageEl) ageEl.textContent = arcLaunchAge(l);
  const sp = card.querySelector("[data-act=spark]");
  if (sp) {
    const pts = s && s.spark.length ? s.spark.slice(-40) : [];
    const p0 = arcStartPrice(l);
    // New coins: draw from the opening price so a first buy shows as a rise.
    if (p0 && l.launchedAt && Date.now() / 1000 - l.launchedAt < ACT_WINDOW_SEC) pts.unshift(p0);
    const d = actSparkPath(pts);
    sp.innerHTML = d ? `<path d="${d}"/>` : `<path class="flat" d="M0,12L100,12"/>`;
    sp.classList.toggle("down", pts.length > 1 && pts[pts.length - 1] < pts[0]);
  }
}
function actPaintTicker() {
  const host = document.getElementById("ap-ticker");
  if (!host) return;
  const items = ACT.ticker;
  if (!items.length) { host.hidden = true; return; }
  host.hidden = false;
  const fresh = new Set();
  for (const t of items) { const id = t.h + ":" + t.i; if (ACT._tickerInit && !ACT.seen.has(id)) fresh.add(id); ACT.seen.add(id); }
  ACT._tickerInit = true;
  const html = items.map((t) => {
    const id = t.h + ":" + t.i;
    const href = t.token ? `/arc#coin/${t.token}` : "/arc#arcircle";
    const safeImg = /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(t.img || "") || /^https?:\/\//i.test(t.img || "") || /^images\//.test(t.img || "");
    return `<a class="tk-item ${t.buy ? "tk-buy" : "tk-sell"}${fresh.has(id) ? " tk-new" : ""}" href="${href}">`
      + (safeImg ? `<img src="${actEsc(t.img)}" alt="">` : `<span class="tk-ph" style="${t.token && typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(t.token) : ""}">${actEsc(String(t.sym || "?").slice(0, 1))}</span>`)
      + `<b>$${actEsc(t.sym)}</b><span class="tk-side">${t.buy ? "buy" : "sell"}</span>`
      + `<strong>${actUsd(t.usd)}</strong><time>${actAgo(actTs(t.b))}</time></a>`;
  }).join("");
  const track = host.querySelector(".tk-track");
  track.innerHTML = html + html; // doubled for a seamless loop
  // Speed follows the market: ~40px/s when quiet, up to 2.5× with a busy
  // last hour. Only re-set when it changes enough to notice (a new duration
  // makes the strip jump).
  let hour = 0;
  ACT.stats.forEach((st) => { hour += st.trades1h || 0; });
  const pxPerSec = 40 * (1 + Math.min(1.5, hour / 20));
  const dur = Math.max(12, Math.round((track.scrollWidth / 2) / pxPerSec));
  const cur = parseFloat(track.style.getPropertyValue("--tk-dur")) || 0;
  if (!cur || Math.abs(dur - cur) / cur > 0.2) track.style.setProperty("--tk-dur", `${dur}s`);
  host.classList.toggle("tk-busy", hour >= 10);
}
function actPaint() {
  document.querySelectorAll(".ap-launch-card[data-token]").forEach(arcPaintCard);
  actPaintTicker();
}

function arcActivityStart() {
  (async () => {
    await actResolvePools();
    if (!ACT.started) {
      ACT.started = true;
      actLoadCache();
      setInterval(() => { if (!document.hidden) actScan(); }, 20_000);
      setInterval(() => { document.querySelectorAll("[data-act=age]").forEach((el) => { const c = el.closest(".ap-launch-card"); if (c) arcPaintCard(c); }); actPaintTicker(); }, 60_000);
    }
    actDerive(); actPaint();
    await actScan();
  })().catch((err) => console.warn("ArcPad activity failed to start", err));
}

// ---------- sharing & launch celebration ----------
const ARC_SITE = "https://www.arcircle.app";
function arcShareText(kind) {
  if (kind === "arcircle") {
    const price = (document.querySelector('#bp-panel-arcircle [data-ac2="price"]') || {}).textContent || "";
    const mcap = (document.querySelector('#bp-panel-arcircle [data-ac2="mcap"]') || {}).textContent || "";
    const me = typeof state !== "undefined" && state.account ? `?ref=${state.account.toLowerCase()}` : "";
    return { text: `$ARCIRCLE — the core coin of ARCIRCLE PAD on Circle's Arc 💚\n${price && price !== "—" ? `Price ${price} · MC ${mcap}\n` : ""}`, url: `${ARC_SITE}/arcircle${me}` };
  }
  const sym = ((document.getElementById("apc-sym") || {}).textContent || "").trim();
  const name = ((document.getElementById("apc-name") || {}).textContent || "").trim();
  const price = ((document.getElementById("apc-price") || {}).textContent || "").trim();
  const mcap = ((document.getElementById("apc-mcap") || {}).textContent || "").trim();
  const token = typeof APC !== "undefined" && APC.token ? APC.token : "";
  const tag = sym ? (sym.startsWith("$") ? sym : `$${sym}`) : name;
  return {
    text: `${tag}${name && sym ? ` (${name})` : ""} is live on ArcPad — a real Uniswap v4 pool on Circle's Arc 💚\n${price && price !== "—" ? `Price ${price} · MC ${mcap}\n` : ""}`,
    url: arcCoinShareUrl(token),
  };
}
/// Per-coin share link: /c/<address> has its own preview card (title, market
/// cap, generated image) on X / Telegram / Discord, then opens the coin page.
/// A connected wallet is added as ?ref= so invites can be credited later.
function arcCoinShareUrl(token) {
  const me = typeof state !== "undefined" && state.account ? `?ref=${state.account.toLowerCase()}` : "";
  return `${ARC_SITE}/c/${token}${me}`;
}
function arcOpenShare(kind) {
  const s = arcShareText(kind);
  const u = `https://x.com/intent/post?text=${encodeURIComponent(s.text)}&url=${encodeURIComponent(s.url)}&via=HOMEonRobinhood`;
  window.open(u, "_blank", "noopener,width=600,height=560");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-share]");
  if (!b) return;
  e.preventDefault();
  arcOpenShare(b.dataset.share);
});

function arcCelebrateLaunch(token) {
  if (typeof window.arcConfetti === "function") window.arcConfetti();
  // Announce it on the project's Telegram channel (no-op unless the site
  // owner configured a bot — see api/tg-launch.mjs). The server re-checks the
  // launch on-chain, so this can't be used to post anything else.
  try { fetch("/api/tg-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), keepalive: true }).catch(() => {}); } catch { /* offline */ }
  const host = document.querySelector("#bp-panel-coin .ac2");
  if (!host) return;
  const old = document.getElementById("apc-celebrate");
  if (old) old.remove();
  const el = document.createElement("div");
  el.id = "apc-celebrate";
  el.className = "apc-celebrate";
  el.dataset.token = token.toLowerCase();
  el.innerHTML = `
    <div class="apc-cel-glow" aria-hidden="true"></div>
    <div class="apc-cel-copy">
      <strong>Your coin is live.</strong>
      <span>The pool is open and trading on Uniswap v4. Tell people where to find it.</span>
    </div>
    <div class="apc-cel-actions">
      <button type="button" class="apc-cel-btn apc-cel-primary" data-share="coin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.2 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.6-5.9 6.6H1.8l7.7-8.8L1.3 2.5h6.8l4.7 6.1zm-1.2 17h1.8L7.1 4.4H5.2z"/></svg>Share on X</button>
      <button type="button" class="apc-cel-btn" id="apc-cel-copy">Copy link</button>
      <button type="button" class="apc-cel-x" aria-label="Dismiss">&times;</button>
    </div>`;
  const back = host.querySelector(".ac2-back");
  host.insertBefore(el, back ? back.nextSibling : host.firstChild);
  el.querySelector(".apc-cel-x").addEventListener("click", () => el.remove());
  el.querySelector("#apc-cel-copy").addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    const url = arcCoinShareUrl(token);
    (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(url) : Promise.reject()).then(
      () => { btn.textContent = "Copied"; setTimeout(() => { btn.textContent = "Copy link"; }, 1600); },
      () => { btn.textContent = url; });
  });
}
// Leave the banner behind when the visitor opens a different coin.
window.addEventListener("hashchange", () => {
  const el = document.getElementById("apc-celebrate");
  if (el && !location.hash.toLowerCase().includes(el.dataset.token)) el.remove();
});
