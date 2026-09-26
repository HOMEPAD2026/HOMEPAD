/* global ethers, CONFIG, state, readProvider, withRetry, multicallRead, blockAtOrAfter, connectWallet,
          ensureArcForWrite, TRANSIENT_RPC, RATE_LIMITED, ERC20_ABI, ARC, ARC_FACTORY_ABI, ARC_SWAP_ROUTER_ABI,
          arcpadFactoryRead, loadArcpadLaunches */
// arcpad-coin.js — the full coin page for any ArcPad launch (arcpad.html#coin/<token>).
//
// Every ArcPad coin trades in its own Uniswap v4 pool (HomepadFactoryArc
// creates it; HomepadHybridHook takes the trade fee from each swap's output).
// Everything here is read straight from Arc — no backend:
//   • price / reserves: the pool's slot0 + liquidity via PoolManager.extsload
//     (same technique as v4-periphery's StateLibrary)
//   • trades: the PoolManager's Swap events for this pool id; the real wallet
//     comes from the token's own Transfer events in the same transaction
//   • holders: every Transfer of the token since launch
//   • swap: approve → HomepadArcSwapRouter.buy / sell with a slippage floor
// The launch's liquidity is one single-sided position from the start price to
// the far end of the tick range, so inside it the pool is exactly x·y = L²
// with virtual reserves x = L/√P, y = L·√P. The quote maths below uses that.
// UI classes are the $ARCIRCLE page's .ac2-* styles; ids are apc-*.

const APC_SWAP_TOPIC = ethers.id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const APC_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const APC_LAUNCHED_TOPIC = ethers.id("Launched(address,address,address,string,string,uint16,uint256,string,string)");
const APC_Q96 = 2n ** 96n;
const APC_SELLABLE_RAW = 920_000_000n * 10n ** 18n;
const APC_SUPPLY = 1_000_000_000;
const APC_CHUNK = 9_000;
const APC_PM_ABI = ["function extsload(bytes32) view returns (bytes32)"];

const APC = {
  token: null, l: null, poolId: null, stateSlot: null, key: null, tokenIs0: true, feeBps: 100n,
  q: { address: CONFIG.USDC_ADDRESS, symbol: "USDC", decimals: 6, isUsdc: true, usd: 1 }, // the pair token
  s: null, user: null, logs: null, ts: {}, anchor: null, trades: [], holders: null,
  side: "buy", slipPct: 2, range: 0, filter: "all", shown: 25, chartSrc: "onchain", dexPair: null,
  busy: false, scanning: false, wired: false, pollTimer: null, loadSeq: 0,
};

const apc$ = (id) => document.getElementById(id);
const apcEsc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const apcShort = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
// Amounts of the pair ("quote") token — USDC unless the coin was paired with something else.
const apcUsdc = (raw) => Number(ethers.formatUnits(raw, APC.q.decimals));
const apcToUsd = (qAmt) => (qAmt == null || APC.q.usd == null ? null : qAmt * APC.q.usd);
const apcTok = (raw) => Number(ethers.formatUnits(raw, 18));
const apcExplorer = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
// Shared number formatting with the $ARCIRCLE page (defined in arcircle-coin.js, loaded after this file).
const apcFmtPrice = (p) => (typeof ac2FmtPrice === "function" ? ac2FmtPrice(p) : (p == null ? "—" : "$" + p.toPrecision(4)));
const apcFmtUsd = (n, o) => (typeof ac2FmtUsd === "function" ? ac2FmtUsd(n, o) : (n == null ? "—" : "$" + n.toFixed(2)));
const apcFmtNum = (n, d) => (typeof ac2FmtNum === "function" ? ac2FmtNum(n, d) : (n == null ? "—" : n.toLocaleString("en-US")));
const apcAgo = (ts) => (typeof ac2Ago === "function" ? ac2Ago(ts) : "—");
/// A per-token price given in pair-token units → shown in USD when the pair's price is known.
function apcFmtUnitPrice(pQuote) {
  if (pQuote == null) return "—";
  if (APC.q.usd != null) return apcFmtPrice(pQuote * APC.q.usd);
  return `${apcFmtPrice(pQuote).replace("$", "")} ${APC.q.symbol}`;
}
/// An amount of the pair token → "$12.30" for USDC, "1.2M ARCIRCLE" otherwise.
function apcFmtQuoteAmt(qAmt, { usdHint = false } = {}) {
  if (qAmt == null) return "—";
  if (APC.q.isUsdc) return apcFmtUsd(qAmt, { exact: qAmt < 1000 });
  const base = `${apcFmtNum(qAmt)} ${APC.q.symbol}`;
  const usd = apcToUsd(qAmt);
  return usdHint && usd != null ? `${base} <span class="apc-usd">≈ ${apcFmtUsd(usd)}</span>` : base;
}
/// A USD value if the pair's price is known, else the pair-token amount.
function apcFmtValue(qAmt) {
  const usd = apcToUsd(qAmt);
  return usd != null ? apcFmtUsd(usd) : apcFmtQuoteAmt(qAmt);
}
function apcSafeUrl(u) {
  const s = String(u || "").trim();
  if (/^https?:\/\//i.test(s) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(s)) return s;
  return "";
}
function apcSocialUrl(u, base) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (base && /^@?[A-Za-z0-9_.-]{1,64}$/.test(s)) return base + s.replace(/^@/, "");
  return "";
}

// ---------- pool maths ----------
function apcReserves(sqrtX96, L) {
  if (!sqrtX96 || !L) return null;
  let tokenRes, quoteRes, sqrt0;
  if (APC.tokenIs0) {
    tokenRes = (L * APC_Q96) / sqrtX96;           // currency0 = token
    quoteRes = (L * sqrtX96) / APC_Q96;           // currency1 = USDC (virtual)
    sqrt0 = (L * APC_Q96) / APC_SELLABLE_RAW;     // start: the whole sellable supply in the pool
  } else {
    quoteRes = (L * APC_Q96) / sqrtX96;           // currency0 = USDC (virtual)
    tokenRes = (L * sqrtX96) / APC_Q96;           // currency1 = token
    sqrt0 = (APC_SELLABLE_RAW * APC_Q96) / L;
  }
  const quote0 = APC.tokenIs0 ? (L * sqrt0) / APC_Q96 : (L * APC_Q96) / sqrt0;
  const realQuote = quoteRes > quote0 ? quoteRes - quote0 : 0n;
  const sold = APC_SELLABLE_RAW > tokenRes ? APC_SELLABLE_RAW - tokenRes : 0n;
  return { tokenRes, quoteRes, realQuote, sold, startPrice: apcPriceFromSqrt(sqrt0) };
}
function apcPriceFromSqrt(sqrtX96) {
  // pair-token units per launched token
  return arcPriceInQuote(sqrtX96, !APC.tokenIs0, APC.q.decimals);
}
function apcSpot() { return APC.s && APC.s.r ? apcUsdc(APC.s.r.quoteRes) / apcTok(APC.s.r.tokenRes) : null; }
function apcQuoteBuy(quoteIn) {
  const r = APC.s && APC.s.r; if (!r || quoteIn <= 0n) return null;
  const gross = (r.tokenRes * quoteIn) / (r.quoteRes + quoteIn);
  const fee = (gross * APC.feeBps) / 10000n;
  return { out: gross - fee, gross, fee, feeUnit: "token" };
}
function apcQuoteSell(tokensIn) {
  const r = APC.s && APC.s.r; if (!r || tokensIn <= 0n) return null;
  const gross = (r.quoteRes * tokensIn) / (r.tokenRes + tokensIn);
  const fee = (gross * APC.feeBps) / 10000n;
  return { out: gross - fee, gross, fee, feeUnit: "usdc" };
}

// ---------- load one launch ----------
async function apcLoadLaunch(token) {
  const want = token.toLowerCase();
  let l = (typeof ARC !== "undefined" && ARC.launches || []).find((x) => x.token.toLowerCase() === want) || null;
  const f = arcpadFactoryRead();
  if (!l) {
    const idx = Number(await withRetry(() => f.launchIndexOf(token)));
    if (!idx) throw new Error("This address isn't an ArcPad launch.");
    const rec = await withRetry(() => f.launches(idx - 1));
    const t = new ethers.Contract(rec.token, ERC20_ABI, readProvider());
    const [name, symbol] = await Promise.all([t.name().catch(() => ""), t.symbol().catch(() => "")]);
    l = {
      token: rec.token, name, symbol, creator: rec.creator, quoteToken: rec.quoteToken, quoteIsCurrency0: rec.quoteIsCurrency0,
      extraFeeBps: Number(rec.extraFeeBps), imageUrl: rec.imageUrl, description: rec.description, launchedAt: Number(rec.launchedAt),
      twitter: rec.twitter, telegram: rec.telegram, discord: rec.discord, website: rec.website,
    };
  }
  let base = typeof ARC !== "undefined" && ARC.baseFeeBps != null ? ARC.baseFeeBps : null;
  if (base == null) { try { base = Number(await f.baseFeeBps()); } catch { base = 100; } }
  const key = await withRetry(() => f.poolKeyOf(l.token));
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const poolId = ethers.keccak256(coder.encode(["address", "address", "uint24", "int24", "address"],
    [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
  const stateSlot = BigInt(ethers.keccak256(ethers.concat([poolId, ethers.toBeHex(6, 32)])));
  const qMeta = await arcQuoteMetaFor(l.quoteToken || CONFIG.USDC_ADDRESS);
  const qPx = await arcQuotePriceUsd(qMeta.address).catch(() => ({ price: null }));
  return { l, key, poolId, stateSlot, feeBps: BigInt(base + (l.extraFeeBps || 0)), q: { ...qMeta, usd: qPx.price } };
}

async function apcFetchState() {
  if (!APC.stateSlot) return null;
  const pm = new ethers.Contract(CONFIG.POOL_MANAGER_ADDRESS, APC_PM_ABI, readProvider());
  const calls = [
    { contract: pm, method: "extsload", args: [ethers.toBeHex(APC.stateSlot, 32)] },
    { contract: pm, method: "extsload", args: [ethers.toBeHex(APC.stateSlot + 3n, 32)] },
  ];
  let ui = -1;
  if (state.account) {
    const usdc = new ethers.Contract(APC.q.address, ERC20_ABI, readProvider());
    const tok = new ethers.Contract(APC.token, ERC20_ABI, readProvider());
    ui = calls.length;
    calls.push(
      { contract: usdc, method: "balanceOf", args: [state.account] },
      { contract: tok, method: "balanceOf", args: [state.account] },
      { contract: usdc, method: "allowance", args: [state.account, CONFIG.ARCPAD_ROUTER_ADDRESS] },
      { contract: tok, method: "allowance", args: [state.account, CONFIG.ARCPAD_ROUTER_ADDRESS] },
    );
  }
  const token = APC.token;
  const res = await withRetry(() => multicallRead(calls));
  if (token !== APC.token) return null; // navigated to another coin meanwhile
  if (!res[0] || !res[1]) throw new Error("Couldn't read the pool");
  const slot0 = BigInt(res[0]);
  const sqrtX96 = slot0 & ((1n << 160n) - 1n);
  const L = BigInt(res[1]) & ((1n << 128n) - 1n);
  APC.s = { sqrtX96, L, r: apcReserves(sqrtX96, L), at: Date.now() };
  APC.user = ui >= 0 ? { usdc: res[ui] ?? 0n, tok: res[ui + 1] ?? 0n, allowUsdc: res[ui + 2] ?? 0n, allowTok: res[ui + 3] ?? 0n } : null;
  return APC.s;
}

// ---------- logs: pool swaps + token transfers ----------
const apcCacheKey = () => `arcpad.coin.v1.${CONFIG.CHAIN_ID_DECIMAL}.${APC.token.toLowerCase()}`;
const APC_TS_KEY = `arcpad.coin.ts.v1.${CONFIG.CHAIN_ID_DECIMAL}`;
function apcLoadCache() {
  APC.logs = null;
  try {
    const c = JSON.parse(localStorage.getItem(apcCacheKey()) || "null");
    if (c && Array.isArray(c.recs) && Number.isFinite(c.lo) && Number.isFinite(c.hi)) APC.logs = c;
  } catch { /* storage blocked */ }
  try { APC.ts = JSON.parse(localStorage.getItem(APC_TS_KEY) || "{}") || {}; } catch { APC.ts = {}; }
}
function apcSaveCache() { try { localStorage.setItem(apcCacheKey(), JSON.stringify(APC.logs)); } catch { /* fine */ } }
function apcSaveTs() { try { localStorage.setItem(APC_TS_KEY, JSON.stringify(APC.ts)); } catch { /* fine */ } }

const apcSigned = (hex) => BigInt.asIntN(128, BigInt(hex));
function apcCompact(log) {
  const base = { b: parseInt(log.blockNumber, 16), i: parseInt(log.logIndex, 16), h: log.transactionHash };
  if (log.topics[0] === APC_SWAP_TOPIC) {
    const d = log.data.slice(2);
    const w = (k) => "0x" + d.slice(k * 64, (k + 1) * 64);
    return { ...base, k: "S", a0: apcSigned(w(0)).toString(), a1: apcSigned(w(1)).toString(), sq: BigInt(w(2)).toString() };
  }
  if (log.topics[0] === APC_TRANSFER_TOPIC) {
    return { ...base, k: "T", fr: "0x" + log.topics[1].slice(26), to: "0x" + log.topics[2].slice(26), v: BigInt(log.data).toString() };
  }
  return null;
}
async function apcGetLogs(params) {
  for (let attempt = 0; ; attempt++) {
    try { return await readProvider().send("eth_getLogs", [params]); } catch (err) {
      const text = JSON.stringify(err && err.error || "") + String(err && (err.shortMessage || err.message) || err);
      if (!(RATE_LIMITED.test(text) || TRANSIENT_RPC.test(text)) || attempt >= 9) throw err;
      if (typeof rpcNoteFailure === "function") { const sw = rpcNoteFailure(); if (sw) await sw; }
      await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt)));
    }
  }
}
async function apcFetchRange(from, to) {
  const range = { fromBlock: ethers.toQuantity(from), toBlock: ethers.toQuantity(to) };
  const swaps = await apcGetLogs({ address: CONFIG.POOL_MANAGER_ADDRESS, topics: [APC_SWAP_TOPIC, APC.poolId], ...range });
  const transfers = await apcGetLogs({ address: APC.token, topics: [APC_TRANSFER_TOPIC], ...range });
  return swaps.concat(transfers).map(apcCompact).filter(Boolean).sort((a, b) => (a.b - b.b) || (a.i - b.i));
}

async function apcSeedFromServer(token, latest) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(`/api/holders?token=${token}`, { signal: ctl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) return false;
    const d = await r.json();
    if (!d || d.v !== 1 || d.token !== token.toLowerCase() || !Array.isArray(d.recs) || !(d.lo <= d.launchBlock)) return false;
    if (!(d.hi >= latest - 4 * APC_CHUNK) || d.hi > latest + 50) return false;
    const hi = Math.min(d.hi, latest);
    const mine = APC.logs ? APC.logs.recs.filter((x) => x.b > hi) : [];
    APC.logs = { launchBlock: d.launchBlock, lo: d.lo, hi: Math.max(hi, APC.logs ? APC.logs.hi : hi), recs: d.recs.filter((x) => x.b <= hi).concat(mine) };
    apcSaveCache();
    return true;
  } catch { return false; }
}

async function apcScan() {
  if (APC.scanning || !APC.token) return;
  APC.scanning = true;
  const token = APC.token;
  try {
    const p = readProvider();
    const latestBlock = await withRetry(() => p.getBlock("latest"));
    const latest = latestBlock.number;
    APC.anchor = { block: latest, ts: Number(latestBlock.timestamp) };
    // First visit (or history not finished): one edge-cached request for the
    // whole history (api/holders.mjs), then only scan forward from its end.
    if (!APC.logs || APC.logs.lo > APC.logs.launchBlock) {
      const seeded = await apcSeedFromServer(token, latest);
      if (token !== APC.token) return;
      if (seeded) { apcDerive(); apcRenderData(); }
    }
    if (!APC.logs) {
      const launchBlock = await blockAtOrAfter(new Date(APC.l.launchedAt * 1000).toISOString(), "arcpad-coin");
      APC.logs = { launchBlock, lo: latest + 1, hi: latest, recs: [] };
    }
    const L = APC.logs;
    if (L.hi < latest && L.lo <= L.hi) {
      const fresh = [];
      for (let a = L.hi + 1; a <= latest; a += APC_CHUNK) {
        const b = Math.min(latest, a + APC_CHUNK - 1);
        fresh.push(...await apcFetchRange(a, b));
        if (token !== APC.token) return;
        L.hi = b;
      }
      if (fresh.length) { L.recs.push(...fresh); apcDerive(); apcRenderData(); }
      apcSaveCache();
    } else if (L.lo > L.hi) {
      L.hi = latest;
    }
    let chunks = 0;
    const total = Math.max(1, Math.ceil((L.lo - L.launchBlock) / APC_CHUNK));
    while (L.lo > L.launchBlock) {
      const a = Math.max(L.launchBlock, L.lo - APC_CHUNK);
      const got = await apcFetchRange(a, L.lo - 1);
      if (token !== APC.token) return;
      L.recs = got.concat(L.recs);
      L.lo = a;
      chunks++;
      if (got.length || chunks % 5 === 0 || L.lo <= L.launchBlock) { apcSaveCache(); apcDerive(); apcRenderData(); }
      const el = apc$("apc-scan");
      if (el) el.textContent = L.lo > L.launchBlock ? `Indexing history… ${Math.round((chunks / total) * 100)}%` : "";
    }
    apcSaveCache();
    apcDerive();
    await apcResolveTimestamps();
    if (token !== APC.token) return;
    apcRenderData();
  } catch (err) {
    console.error("ArcPad coin: log scan failed", err);
    const el = apc$("apc-scan");
    if (el) el.textContent = "Couldn't reach Arc to load trades — retrying shortly.";
    if (APC.logs) apcSaveCache();
  } finally {
    APC.scanning = false;
  }
}

function apcDerive() {
  const recs = APC.logs ? APC.logs.recs : [];
  const byTx = new Map();
  for (const r of recs) if (r.k === "T") { if (!byTx.has(r.h)) byTx.set(r.h, []); byTx.get(r.h).push(r); }
  const pm = CONFIG.POOL_MANAGER_ADDRESS.toLowerCase();
  const router = CONFIG.ARCPAD_ROUTER_ADDRESS.toLowerCase();
  const trades = [];
  for (const r of recs) {
    if (r.k !== "S") continue;
    const a0 = BigInt(r.a0), a1 = BigInt(r.a1);
    const tokD = APC.tokenIs0 ? a0 : a1, quoteD = APC.tokenIs0 ? a1 : a0;
    const buy = tokD > 0n; // swapper receives the token
    const absT = tokD < 0n ? -tokD : tokD, absQ = quoteD < 0n ? -quoteD : quoteD;
    const tx = (byTx.get(r.h) || []).slice().sort((x, y) => x.i - y.i);
    let trader = null;
    if (buy) { const t = tx.filter((x) => x.fr.toLowerCase() === pm).pop(); trader = t ? t.to : (tx.length ? tx[tx.length - 1].to : null); }
    else { const t = tx.find((x) => x.to.toLowerCase() === router || x.to.toLowerCase() === pm); trader = t ? t.fr : (tx.length ? tx[0].fr : null); }
    let usdc, tok;
    if (buy) { const net = absT - (absT * APC.feeBps) / 10000n; usdc = apcUsdc(absQ); tok = apcTok(net); }
    else { const net = absQ - (absQ * APC.feeBps) / 10000n; usdc = apcUsdc(net); tok = apcTok(absT); }
    trades.push({ side: buy ? "buy" : "sell", b: r.b, i: r.i, h: r.h, trader, usdc, tok,
      price: tok > 0 ? usdc / tok : null, after: apcPriceFromSqrt(BigInt(r.sq)) });
  }
  trades.sort((a, b) => (b.b - a.b) || (b.i - a.i));
  APC.trades = trades;
  if (APC.logs && APC.logs.lo <= APC.logs.launchBlock) {
    const bal = new Map();
    for (const r of recs) if (r.k === "T") {
      const v = BigInt(r.v), fr = r.fr.toLowerCase(), to = r.to.toLowerCase();
      if (fr !== ethers.ZeroAddress) bal.set(fr, (bal.get(fr) ?? 0n) - v);
      if (to !== ethers.ZeroAddress) bal.set(to, (bal.get(to) ?? 0n) + v);
    }
    APC.holders = [...bal.entries()].filter(([, v]) => v > 0n).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  } else APC.holders = null;
}

function apcTsOf(block) {
  if (APC.ts[block]) return APC.ts[block];
  if (!APC.anchor) return null;
  let best = APC.anchor;
  for (const k in APC.ts) { const kb = Number(k); if (Math.abs(kb - block) < Math.abs(best.block - block)) best = { block: kb, ts: APC.ts[k] }; }
  return Math.round(best.ts + (block - best.block) * 0.5);
}
async function apcResolveTimestamps() {
  const need = [...new Set(APC.trades.slice(0, 120).map((t) => t.b))].filter((b) => !APC.ts[b]);
  const p = readProvider();
  for (let i = 0; i < need.length; i += 5) {
    const batch = need.slice(i, i + 5);
    const blocks = await Promise.all(batch.map((b) => withRetry(() => p.getBlock(b)).catch(() => null)));
    blocks.forEach((blk, k) => { if (blk) APC.ts[batch[k]] = Number(blk.timestamp); });
  }
  if (need.length) apcSaveTs();
}

// ---------- render ----------
function apcRenderHeader() {
  const l = APC.l; if (!l) return;
  const sym = l.symbol ? `$${l.symbol}` : "";
  apc$("apc-name").textContent = l.name || l.symbol || "Unnamed coin";
  apc$("apc-sym").textContent = sym;
  const img = apc$("apc-logo"), fb = apc$("apc-logo-fallback");
  const src = apcSafeUrl(l.imageUrl);
  if (src) { img.src = src; img.hidden = false; fb.hidden = true; img.onerror = () => { img.hidden = true; fb.hidden = false; }; }
  else { img.hidden = true; fb.hidden = false; }
  fb.textContent = (l.symbol || l.name || "?").slice(0, 1).toUpperCase();
  apc$("apc-ca-full").textContent = l.token;
  apc$("apc-ca-short").textContent = apcShort(l.token);
  apc$("apc-scan-link").href = apcExplorer("token", l.token);
  if (apc$("apc-safety")) apc$("apc-safety").href = `#scanner?t=${l.token}`;
  const desc = apc$("apc-desc");
  if (l.description) { desc.textContent = l.description; desc.hidden = false; } else desc.hidden = true;
  apc$("apc-th-sym").textContent = sym || "Tokens";
  apc$("apc-th-quote").textContent = APC.q.symbol;
  const pb = apc$("apc-pair-badge");
  pb.hidden = APC.q.isUsdc; pb.textContent = `Paired with ${APC.q.symbol}`;
  apc$("apc-about-quote").innerHTML = `<a href="${apcExplorer("token", APC.q.address)}" target="_blank" rel="noopener">${apcEsc(APC.q.symbol)} ↗</a>${APC.q.usd != null && !APC.q.isUsdc ? ` <span class="ac2-muted">≈ ${apcFmtPrice(APC.q.usd)}</span>` : ""}`;
  apc$("apc-about-lede").textContent = `${sym || "This coin"} was launched on ArcPad and trades in its own Uniswap v4 pool on Arc, paired with ${APC.q.isUsdc ? "USDC" : APC.q.symbol}.${APC.q.isUsdc ? "" : ` Prices in USD are converted at ${APC.q.symbol}'s current price.`}`;
  apc$("apc-about-token").innerHTML = `<a href="${apcExplorer("token", l.token)}" target="_blank" rel="noopener">${apcShort(l.token)} ↗</a>`;
  apc$("apc-about-creator").innerHTML = l.creator ? `<a href="${apcExplorer("address", l.creator)}" target="_blank" rel="noopener">${apcShort(l.creator)} ↗</a>` : "—";
  apc$("apc-about-fee").textContent = `${Number(APC.feeBps) / 100}% per trade${l.extraFeeBps ? ` (incl. ${l.extraFeeBps / 100}% creator add-on)` : ""}`;
  apc$("apc-about-pool").innerHTML = `<a href="${apcExplorer("address", CONFIG.POOL_MANAGER_ADDRESS)}" target="_blank" rel="noopener" title="${APC.poolId}">v4 · ${apcShort(APC.poolId)}</a>`;
  if (l.launchedAt) {
    apc$("apc-about-launched").textContent = new Date(l.launchedAt * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    apc$("apc-age").textContent = apcAgo(l.launchedAt).replace(" ago", "");
  }
  apc$("apc-q-fee-label").textContent = `(${Number(APC.feeBps) / 100}%)`;
  // links
  const links = [
    ["ArcScan", "Token & holders", apcExplorer("token", l.token)],
    ["Website", "", apcSocialUrl(l.website)],
    ["X", "", apcSocialUrl(l.twitter, "https://x.com/")],
    ["Telegram", "", apcSocialUrl(l.telegram, "https://t.me/")],
    ["Discord", "", apcSocialUrl(l.discord)],
  ].filter(([, , u]) => u);
  const box = apc$("apc-links");
  box.innerHTML = `<h3>Links</h3>` + links.map(([t, sub, u]) =>
    `<a href="${apcEsc(u)}" target="_blank" rel="noopener nofollow"><span>${t}</span><small>${apcEsc(sub || u.replace(/^https?:\/\//, "").slice(0, 28))}</small></a>`).join("")
    + `<a href="#" id="apc-dex-link" target="_blank" rel="noopener" hidden><span>Dexscreener</span><small>Pool chart</small></a>`;
  document.title = `${sym || l.name} — ArcPad`;
  const mobileLabel = apc$("bp-mobile-menu-label");
  if (mobileLabel) mobileLabel.textContent = sym || "Coin";
}

function apcRenderState() {
  const r = APC.s && APC.s.r; if (!r) return;
  const spot = apcSpot();
  apc$("apc-price").innerHTML = apcFmtUnitPrice(spot);
  const pq = apc$("apc-price-quote");
  pq.hidden = APC.q.isUsdc || APC.q.usd == null;
  if (!pq.hidden) pq.textContent = `${apcFmtPrice(spot).replace("$", "")} ${APC.q.symbol}`;
  apc$("apc-mcap").textContent = spot != null ? apcFmtValue(spot * APC_SUPPLY) : "—";
  const liqQ = apcUsdc(r.realQuote), liqUsd = apcToUsd(liqQ);
  apc$("apc-liq").innerHTML = APC.q.isUsdc || liqUsd == null
    ? apcFmtQuoteAmt(liqQ)
    : `${apcFmtUsd(liqUsd, { exact: liqUsd < 1000 })}<span class="apc-sub">${apcFmtNum(liqQ)} ${APC.q.symbol}</span>`;
  const soldPct = (apcTok(r.sold) / 920_000_000) * 100;
  apc$("apc-sold-text").textContent = `${apcFmtNum(apcTok(r.sold))} of 920M · ${soldPct.toFixed(soldPct < 10 ? 2 : 1)}%`;
  apc$("apc-sold-fill").style.width = `${Math.max(soldPct, 0.6)}%`;
  apcRenderSwap();
}

function apcRenderData() { apcRenderStats(); apcRenderTrades(); apcRenderHolders(); apcRenderChart(); }

function apcRenderStats() {
  const now = Math.floor(Date.now() / 1000);
  const day = APC.trades.filter((t) => { const ts = apcTsOf(t.b); return ts && now - ts <= 86400; });
  apc$("apc-vol").textContent = APC.logs ? apcFmtValue(day.reduce((s, t) => s + t.usdc, 0)) : "—";
  const b = day.filter((t) => t.side === "buy").length;
  apc$("apc-txns").innerHTML = APC.logs ? `${day.length} <span class="ac2-bs"><em class="b">${b}B</em> <em class="s">${day.length - b}S</em></span>` : "—";
  const skip = new Set([CONFIG.POOL_MANAGER_ADDRESS.toLowerCase()]);
  apc$("apc-holders-count").textContent = APC.holders ? String(APC.holders.filter(([a]) => !skip.has(a)).length) : "…";
  const ch = apc$("apc-change");
  const spot = apcSpot();
  const start = APC.s && APC.s.r ? APC.s.r.startPrice : null;
  if (spot != null) {
    const before = APC.trades.find((t) => { const ts = apcTsOf(t.b); return ts && now - ts >= 86400; });
    const launchedRecently = APC.l && now - APC.l.launchedAt < 86400;
    const ref = before ? before.after : (launchedRecently || !APC.trades.length ? start : null);
    if (ref) {
      const pct = (spot / ref - 1) * 100;
      ch.className = "ac2-change " + (pct >= 0 ? "up" : "down");
      ch.textContent = `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(2)}% ${before ? "24h" : "since launch"}`;
    }
  }
}

function apcRenderTrades() {
  const body = apc$("apc-trades"); if (!body) return;
  let rows = APC.trades;
  if (APC.filter === "buy" || APC.filter === "sell") rows = rows.filter((t) => t.side === APC.filter);
  const me = state.account && state.account.toLowerCase();
  if (APC.filter === "mine") rows = me ? rows.filter((t) => t.trader && t.trader.toLowerCase() === me) : [];
  const more = apc$("apc-more");
  if (!rows.length) {
    const scanning = APC.logs && APC.logs.lo > APC.logs.launchBlock;
    const msg = APC.filter === "mine" && !state.account ? "Connect a wallet to see your trades."
      : scanning || !APC.logs ? "Loading trades…" : "No trades yet — be the first to buy.";
    body.innerHTML = `<tr><td colspan="7" class="ac2-empty">${msg}</td></tr>`;
    if (more) more.hidden = true;
    return;
  }
  body.innerHTML = rows.slice(0, APC.shown).map((t) => {
    const ts = apcTsOf(t.b);
    const mine = me && t.trader && t.trader.toLowerCase() === me;
    return `<tr class="${t.side}">
      <td title="${ts ? new Date(ts * 1000).toLocaleString() : ""}">${apcAgo(ts)}</td>
      <td><span class="ac2-type ${t.side}">${t.side === "buy" ? "Buy" : "Sell"}</span></td>
      <td class="r">${APC.q.isUsdc ? apcFmtUsd(t.usdc, { exact: t.usdc < 1000 }) : apcFmtNum(t.usdc)}</td>
      <td class="r">${apcFmtNum(t.tok)}</td>
      <td class="r">${apcFmtUnitPrice(t.price)}</td>
      <td>${t.trader ? `<a href="${apcExplorer("address", t.trader)}" target="_blank" rel="noopener" class="ac2-addr">${apcShort(t.trader)}</a>` : "—"}${mine ? ' <span class="ac2-you">you</span>' : ""}</td>
      <td class="r"><a href="${apcExplorer("tx", t.h)}" target="_blank" rel="noopener" class="ac2-tx" aria-label="View transaction">↗</a></td>
    </tr>`;
  }).join("");
  if (more) more.hidden = rows.length <= APC.shown;
}

function apcRenderHolders() {
  const el = apc$("apc-holders"); if (!el) return;
  if (!APC.holders) { el.innerHTML = `<div class="ac2-empty">Holders appear once the history finishes indexing.</div>`; return; }
  const tags = {
    [CONFIG.POOL_MANAGER_ADDRESS.toLowerCase()]: "Pool",
    [CONFIG.ARCPAD_HOOK_ADDRESS.toLowerCase()]: "Fee hook",
    [CONFIG.ARCPAD_FACTORY_ADDRESS.toLowerCase()]: "Factory",
    ["0xa066e6c5d1ac561a4065b9d6b00fef89c0bd02f8"]: "Platform treasury",
  };
  const creator = APC.l && APC.l.creator ? APC.l.creator.toLowerCase() : "";
  const me = state.account && state.account.toLowerCase();
  el.innerHTML = `<div class="ac2-holders">` + APC.holders.slice(0, 25).map(([addr, raw], i) => {
    const amt = apcTok(raw), pct = (amt / APC_SUPPLY) * 100;
    const t = tags[addr] || (addr === creator ? "Creator" : "");
    const tag = t ? `<span class="ac2-tag">${t}</span>` : addr === me ? '<span class="ac2-you">you</span>' : "";
    return `<div class="ac2-holder">
      <span class="ac2-rank">${i + 1}</span>
      <span class="ac2-holder-who"><a href="${apcExplorer("address", addr)}" target="_blank" rel="noopener" class="ac2-addr">${apcShort(addr)}</a>${tag}</span>
      <span class="ac2-holder-bar"><span style="width:${Math.max(pct, 0.4)}%"></span></span>
      <span class="ac2-holder-amt">${apcFmtNum(amt)}</span>
      <span class="ac2-holder-pct">${pct < 0.01 ? "<0.01" : pct.toFixed(2)}%</span>
    </div>`;
  }).join("") + `</div><p class="ac2-note">Balances rebuilt from every transfer since launch. "Pool" is the unsold supply still in the Uniswap v4 pool.</p>`;
}

function apcChartPoints() {
  const k = APC.q.usd != null ? APC.q.usd : 1; // plot in USD when the pair's price is known
  const pts = apcChartPointsQuote().map((x) => ({ ...x, p: x.p * k }));
  return pts;
}
function apcFmtAxis(v) { return APC.q.usd != null ? apcFmtPrice(v) : `${apcFmtPrice(v).replace("$", "")} ${APC.q.symbol}`; }
function apcChartPointsQuote() {
  const pts = [];
  const r = APC.s && APC.s.r;
  if (APC.l && r && r.startPrice) pts.push({ ts: APC.l.launchedAt, p: r.startPrice, side: "start" });
  for (const t of APC.trades.slice().reverse()) { const ts = apcTsOf(t.b); if (ts && t.after) pts.push({ ts, p: t.after, side: t.side }); }
  const spot = apcSpot(), now = Math.floor(Date.now() / 1000);
  if (spot != null) pts.push({ ts: now, p: spot, side: "now" });
  pts.sort((a, b) => a.ts - b.ts);
  if (!APC.range) return pts;
  const from = now - APC.range;
  const inRange = pts.filter((x) => x.ts >= from);
  const before = pts.filter((x) => x.ts < from).pop();
  return before ? [{ ...before, ts: from, side: "carry" }, ...inRange] : inRange;
}

function apcRenderChart() {
  const box = apc$("apc-chart");
  if (!box || APC.chartSrc !== "onchain") return;
  const pts = apcChartPoints();
  if (pts.length < 2) { box.innerHTML = `<div class="ac2-empty">${APC.s ? "No price history in this range yet." : "Loading…"}</div>`; return; }
  const W = Math.max(320, box.clientWidth || 640), H = 280, padL = 12, padR = 76, padT = 16, padB = 28;
  const t0 = pts[0].ts, t1 = pts[pts.length - 1].ts;
  let lo = Math.min(...pts.map((x) => x.p)), hi = Math.max(...pts.map((x) => x.p));
  if (hi === lo) { hi *= 1.02; lo *= 0.98; }
  const pad = (hi - lo) * 0.12; hi += pad; lo = Math.max(0, lo - pad);
  const X = (ts) => padL + ((ts - t0) / Math.max(1, t1 - t0)) * (W - padL - padR);
  const Y = (p) => padT + (1 - (p - lo) / (hi - lo)) * (H - padT - padB);
  let d = `M${X(pts[0].ts).toFixed(1)},${Y(pts[0].p).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${X(pts[i].ts).toFixed(1)} V${Y(pts[i].p).toFixed(1)}`;
  const area = `${d} V${H - padB} H${X(pts[0].ts).toFixed(1)} Z`;
  const col = pts[pts.length - 1].p >= pts[0].p ? "#39ff88" : "#ff6b6b";
  const yTicks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const span = t1 - t0;
  const fmtT = (ts) => { const dt = new Date(ts * 1000); return span > 2 * 86400 ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); };
  const xTicks = [0, 1, 2, 3].map((k) => t0 + (span * k) / 3);
  const dots = pts.filter((x) => x.side === "buy" || x.side === "sell").map((x) => `<circle cx="${X(x.ts).toFixed(1)}" cy="${Y(x.p).toFixed(1)}" r="3.5" class="ac2-dot ${x.side}"/>`).join("");
  const last = pts[pts.length - 1];
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Price chart">
    <defs><linearGradient id="apcArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${yTicks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="ac2-grid-line"/><text x="${W - padR + 8}" y="${(Y(v) + 4).toFixed(1)}" class="ac2-axis">${apcFmtPrice(v).replace("$", "")}</text>`).join("")}
    ${xTicks.map((t) => `<text x="${X(t).toFixed(1)}" y="${H - 8}" class="ac2-axis" text-anchor="middle">${fmtT(t)}</text>`).join("")}
    <path d="${area}" fill="url(#apcArea)"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
    ${dots}
    <line x1="${padL}" x2="${W - padR}" y1="${Y(last.p).toFixed(1)}" y2="${Y(last.p).toFixed(1)}" class="ac2-last-line" stroke="${col}"/>
    <rect x="${W - padR + 2}" y="${(Y(last.p) - 10).toFixed(1)}" width="${padR - 4}" height="20" rx="5" fill="${col}"/>
    <text x="${W - padR + 8}" y="${(Y(last.p) + 4).toFixed(1)}" class="ac2-axis ac2-axis-last">${apcFmtPrice(last.p).replace("$", "")}</text>
    <g id="apc-hover" style="display:none"><line y1="${padT}" y2="${H - padB}" class="ac2-cross"/><circle r="4.5" class="ac2-cross-dot"/></g>
    <rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" fill="transparent" id="apc-hit"/>
  </svg><div class="ac2-tip" id="apc-tip" hidden></div>`;
  const hit = apc$("apc-hit"), g = apc$("apc-hover"), tip = apc$("apc-tip"), svg = box.querySelector("svg");
  const move = (ev) => {
    const rc = svg.getBoundingClientRect();
    const x = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rc.left) * (W / rc.width);
    const ts = t0 + ((x - padL) / (W - padL - padR)) * (t1 - t0);
    let cur = pts[0];
    for (const pnt of pts) { if (pnt.ts <= ts) cur = pnt; else break; }
    const cx = Math.min(Math.max(x, padL), W - padR), cy = Y(cur.p);
    g.style.display = "";
    g.querySelector("line").setAttribute("x1", cx); g.querySelector("line").setAttribute("x2", cx);
    g.querySelector("circle").setAttribute("cx", cx); g.querySelector("circle").setAttribute("cy", cy);
    tip.hidden = false;
    tip.innerHTML = `<strong>${apcFmtAxis(cur.p)}</strong><span>${new Date(Math.min(ts, t1) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>`;
    tip.style.left = `${Math.min(Math.max((cx / W) * rc.width - 60, 4), rc.width - 128)}px`;
  };
  const leave = () => { g.style.display = "none"; tip.hidden = true; };
  hit.addEventListener("mousemove", move);
  hit.addEventListener("touchmove", move, { passive: true });
  hit.addEventListener("mouseleave", leave);
  hit.addEventListener("touchend", leave);
}

async function apcCheckDexscreener() {
  const token = APC.token;
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/arc/${token}`);
    if (!r.ok) return;
    const pairs = await r.json();
    if (token !== APC.token) return;
    const mine = (Array.isArray(pairs) ? pairs : []).filter((p) => p && p.chainId === "arc" && p.baseToken && String(p.baseToken.address).toLowerCase() === token.toLowerCase());
    if (!mine.length) return;
    mine.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
    APC.dexPair = mine[0];
    apc$("apc-src").hidden = false;
    const link = apc$("apc-dex-link");
    if (link) { link.href = APC.dexPair.url || `https://dexscreener.com/arc/${APC.dexPair.pairAddress}`; link.hidden = false; }
  } catch { /* on-chain chart stays */ }
}
function apcSetChartSrc(src) {
  if (src === "dex" && !APC.dexPair) return;
  APC.chartSrc = src;
  document.querySelectorAll("#apc-src button").forEach((b) => b.classList.toggle("active", b.dataset.src === src));
  const dex = apc$("apc-dex"), chart = apc$("apc-chart"), range = apc$("apc-range"), label = apc$("apc-chart-src-label");
  if (src === "dex") {
    dex.innerHTML = `<iframe title="Dexscreener chart" loading="lazy" src="https://dexscreener.com/arc/${encodeURIComponent(APC.dexPair.pairAddress)}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15"></iframe>`;
    dex.hidden = false; chart.hidden = true; range.hidden = true; label.textContent = "· Dexscreener";
  } else {
    dex.hidden = true; dex.innerHTML = ""; chart.hidden = false; range.hidden = false; label.textContent = "· on-chain";
    apcRenderChart();
  }
}

// ---------- swap ----------
function apcParseAmount() {
  const raw = (apc$("apc-amount").value || "").trim().replace(/,/g, "");
  if (!raw || !/^\d*\.?\d*$/.test(raw) || Number(raw) <= 0) return null;
  const dec = APC.side === "buy" ? APC.q.decimals : 18;
  const [w, f = ""] = raw.split(".");
  try { return ethers.parseUnits(`${w || "0"}.${f.slice(0, dec) || "0"}`, dec); } catch { return null; }
}
function apcCurrentQuote() {
  const amt = apcParseAmount();
  if (!amt || !APC.s) return null;
  const q = APC.side === "buy" ? apcQuoteBuy(amt) : apcQuoteSell(amt);
  if (!q) return null;
  const slip = BigInt(Math.round(APC.slipPct * 100));
  const min = (q.out * (10000n - slip)) / 10000n;
  const spot = apcSpot();
  let impact = null;
  if (spot) {
    if (APC.side === "buy" && q.gross > 0n) impact = (apcUsdc(amt) / apcTok(q.gross)) / spot - 1;
    if (APC.side === "sell") impact = 1 - (apcUsdc(q.gross) / apcTok(amt)) / spot;
  }
  return { amt, ...q, min, impact };
}

function apcRenderSwap() {
  if (!APC.l) return;
  const buy = APC.side === "buy";
  const sym = APC.l.symbol ? `$${APC.l.symbol}` : "tokens";
  document.querySelectorAll("#apc-swap .ac2-swap-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.side === APC.side));
  apc$("apc-swap").classList.toggle("is-sell", !buy);
  apc$("apc-in-label").textContent = buy ? "You pay" : "You sell";
  const qs = APC.q.symbol;
  apc$("apc-in-unit").textContent = buy ? qs : sym;
  apc$("apc-out-unit").textContent = buy ? sym : qs;
  const bal = apc$("apc-bal");
  bal.textContent = APC.user ? (buy ? `Balance ${apcFmtNum(apcUsdc(APC.user.usdc), 4)} ${qs}` : `Balance ${apcFmtNum(apcTok(APC.user.tok))} ${APC.l.symbol || ""}`) : "Balance —";
  const quick = apc$("apc-quick");
  const qkey = `${APC.side}:${APC.q.isUsdc ? "usd" : "pct"}`;
  if (quick.dataset.side !== qkey) {
    quick.dataset.side = qkey;
    quick.innerHTML = buy && APC.q.isUsdc
      ? ["1", "5", "10", "50"].map((v) => `<button type="button" data-q="${v}" title="${v} USDC">$${v}</button>`).join("") + `<button type="button" data-q="max">Max</button>`
      : buy
      ? ["25", "50", "75"].map((v) => `<button type="button" data-q="${v}%">${v}%</button>`).join("") + `<button type="button" data-q="max">Max</button>`
      : ["25", "50", "75"].map((v) => `<button type="button" data-q="${v}%">${v}%</button>`).join("") + `<button type="button" data-q="100%">Max</button>`;
  }
  const q = apcCurrentQuote();
  const fmtOut = (raw) => (buy ? apcTok(raw).toLocaleString("en-US", { maximumFractionDigits: apcTok(raw) >= 1000 ? 0 : 2 }) : apcUsdc(raw).toLocaleString("en-US", { maximumFractionDigits: apcUsdc(raw) >= 1000 ? 2 : 4 }));
  apc$("apc-out").textContent = q ? fmtOut(q.out) : "0";
  const imp = apc$("apc-q-impact");
  if (q && q.impact != null) { imp.textContent = `${(q.impact * 100).toFixed(2)}%`; imp.className = q.impact > 0.05 ? "warn" : ""; } else imp.textContent = "—";
  apc$("apc-q-fee").textContent = q ? (buy ? `${apcFmtNum(apcTok(q.fee))} ${APC.l.symbol || ""}` : `${apcUsdc(q.fee).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${qs}`) : "—";
  apc$("apc-q-min").textContent = q ? `${fmtOut(q.min)} ${buy ? APC.l.symbol || "" : qs}` : "—";
  const btn = apc$("apc-submit");
  let label = "Enter an amount", disabled = true, warn = "";
  if (!state.account) { label = "Connect wallet"; disabled = false; }
  else if (!APC.s) label = "Loading…";
  else if (q) {
    const have = buy ? (APC.user ? APC.user.usdc : 0n) : (APC.user ? APC.user.tok : 0n);
    const allow = buy ? (APC.user ? APC.user.allowUsdc : 0n) : (APC.user ? APC.user.allowTok : 0n);
    if (q.amt > have) label = `Not enough ${buy ? qs : sym}`;
    else if (allow < q.amt) { label = `Approve ${buy ? qs : sym}`; disabled = false; }
    else { label = buy ? `Buy ${sym}` : `Sell ${sym}`; disabled = false; }
    if (q.impact != null && q.impact > 0.05) warn = `High price impact (${(q.impact * 100).toFixed(1)}%).`;
  }
  if (!APC.busy) { btn.textContent = label; btn.disabled = disabled; }
  btn.classList.toggle("neutral", !state.account);
  const st = apc$("apc-status");
  if (!APC.busy && st.dataset.kind !== "result") st.innerHTML = warn ? `<div class="ac2-msg warn">${apcEsc(warn)}</div>` : "";
}

function apcStatus(kind, html) {
  const st = apc$("apc-status");
  st.dataset.kind = kind === "success" || kind === "error" ? "result" : "";
  st.innerHTML = `<div class="ac2-msg ${kind}">${html}</div>`;
}
function apcErrText(err) {
  if (err && (err.code === "ACTION_REJECTED" || err.code === 4001)) return "You rejected the request in your wallet.";
  const m = String(err && (err.reason || err.shortMessage || err.message) || err);
  if (/slippage/i.test(m)) return "Price moved past your slippage limit — try again or raise slippage.";
  if (/insufficient funds|missing revert data|exceeds balance/i.test(m)) return "The trade can't go through — usually not enough balance for the amount, or not enough USDC left for gas.";
  return m.slice(0, 200);
}

async function apcSubmit() {
  if (APC.busy) return;
  if (!state.account) { await connectWallet(); await apcRefresh(); return; }
  const btn = apc$("apc-submit");
  APC.busy = true; btn.disabled = true;
  const buy = APC.side === "buy";
  const sym = APC.l.symbol ? `$${APC.l.symbol}` : "tokens";
  const unit = buy ? APC.q.symbol : sym;
  try {
    await ensureArcForWrite();
    if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
    await apcFetchState();
    const q = apcCurrentQuote();
    if (!q) throw new Error("Enter an amount.");
    if (q.amt > (buy ? APC.user.usdc : APC.user.tok)) throw new Error(`Not enough ${unit}.`);
    const asset = buy ? APC.q.address : APC.token;
    if ((buy ? APC.user.allowUsdc : APC.user.allowTok) < q.amt) {
      btn.textContent = `Approve ${unit} in wallet…`;
      apcStatus("pending", `Step 1 of 2 — approve ${apcEsc(unit)} for the ArcPad router.`);
      const atx = await new ethers.Contract(asset, ERC20_ABI, state.signer).approve(CONFIG.ARCPAD_ROUTER_ADDRESS, q.amt);
      btn.textContent = "Approving…";
      await atx.wait();
      await apcFetchState();
    }
    const router = new ethers.Contract(CONFIG.ARCPAD_ROUTER_ADDRESS, ARC_SWAP_ROUTER_ABI, state.signer);
    const fresh = apcCurrentQuote();
    btn.textContent = "Checking…";
    if (buy) await router.buy.staticCall(APC.token, fresh.amt, fresh.min);
    else await router.sell.staticCall(APC.token, fresh.amt, fresh.min);
    btn.textContent = "Confirm in wallet…";
    apcStatus("pending", `${buy ? "Buying" : "Selling"} — confirm in your wallet.`);
    const tx = buy ? await router.buy(APC.token, fresh.amt, fresh.min) : await router.sell(APC.token, fresh.amt, fresh.min);
    btn.textContent = buy ? "Buying…" : "Selling…";
    apcStatus("pending", `Submitted — waiting for Arc. <a href="${apcExplorer("tx", tx.hash)}" target="_blank" rel="noopener">View tx ↗</a>`);
    const rc = await tx.wait();
    apcStatus("success", `${buy ? "Bought" : "Sold"}! <a href="${apcExplorer("tx", rc.hash)}" target="_blank" rel="noopener">View tx ↗</a>`);
    apc$("apc-amount").value = "";
    await apcRefresh();
    apcScan();
  } catch (err) {
    console.error("ArcPad coin swap failed", err);
    apcStatus("error", apcEsc(apcErrText(err)));
  } finally {
    APC.busy = false;
    apcRenderSwap();
  }
}

function apcQuick(v) {
  const input = apc$("apc-amount");
  apc$("apc-status").dataset.kind = "";
  if (APC.side === "buy") {
    if (v === "max" || /%$/.test(v)) {
      if (!APC.user) return;
      // USDC is also Arc's gas token: "Max" leaves a little for fees.
      const reserve = APC.q.isUsdc && v === "max" ? ethers.parseUnits("0.05", 6) : 0n;
      const pct = v === "max" ? 100n : BigInt(parseInt(v, 10));
      const avail = APC.user.usdc > reserve ? APC.user.usdc - reserve : 0n;
      input.value = ethers.formatUnits((avail * pct) / 100n, APC.q.decimals).replace(/\.0$/, "");
    } else input.value = v;
  } else {
    if (!APC.user) return;
    input.value = ethers.formatUnits((APC.user.tok * BigInt(parseInt(v, 10))) / 100n, 18).replace(/\.0$/, "");
  }
  apcRenderSwap();
}

async function apcRefresh() {
  try { await apcFetchState(); apcRenderState(); apcRenderStats(); } catch (err) { console.warn("ArcPad coin: state refresh failed", err); }
}

function apcWire() {
  if (APC.wired) return;
  APC.wired = true;
  document.querySelectorAll("#apc-swap .ac2-swap-tabs button").forEach((b) => b.addEventListener("click", () => {
    if (APC.side === b.dataset.side) return;
    APC.side = b.dataset.side;
    apc$("apc-amount").value = ""; apc$("apc-status").dataset.kind = "";
    apcRenderSwap();
  }));
  apc$("apc-amount").addEventListener("input", () => { apc$("apc-status").dataset.kind = ""; apcRenderSwap(); });
  apc$("apc-quick").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (b) apcQuick(b.dataset.q); });
  apc$("apc-bal").addEventListener("click", () => apcQuick(APC.side === "buy" ? "max" : "100%"));
  apc$("apc-slip").addEventListener("click", (e) => {
    const b = e.target.closest("[data-slip]"); if (!b) return;
    APC.slipPct = Number(b.dataset.slip);
    document.querySelectorAll("#apc-slip button").forEach((x) => x.classList.toggle("active", x === b));
    apcRenderSwap();
  });
  apc$("apc-submit").addEventListener("click", apcSubmit);
  apc$("apc-range").addEventListener("click", (e) => {
    const b = e.target.closest("[data-range]"); if (!b) return;
    APC.range = Number(b.dataset.range);
    document.querySelectorAll("#apc-range button").forEach((x) => x.classList.toggle("active", x === b));
    apcRenderChart();
  });
  apc$("apc-src").addEventListener("click", (e) => { const b = e.target.closest("[data-src]"); if (b) apcSetChartSrc(b.dataset.src); });
  apc$("apc-filter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]"); if (!b) return;
    APC.filter = b.dataset.filter; APC.shown = 25;
    document.querySelectorAll("#apc-filter button").forEach((x) => x.classList.toggle("active", x === b));
    apcRenderTrades();
  });
  apc$("apc-more").addEventListener("click", () => { APC.shown += 25; apcRenderTrades(); });
  document.querySelectorAll("#bp-panel-coin [data-apctab]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#bp-panel-coin [data-apctab]").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll("#bp-panel-coin [data-apcpanel]").forEach((p) => { p.hidden = p.dataset.apcpanel !== b.dataset.apctab; });
  }));
  apc$("apc-copy-ca").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    const sp = b.querySelector("span") || b;
    try { await navigator.clipboard.writeText(APC.token); sp.textContent = "Copied"; b.classList.add("copied"); } catch { sp.textContent = "Copy failed"; }
    setTimeout(() => { sp.textContent = "Copy"; b.classList.remove("copied"); }, 1400);
  });
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(apcRenderChart, 150); });
}

function apcResetView() {
  APC.q = { address: CONFIG.USDC_ADDRESS, symbol: "USDC", decimals: 6, isUsdc: true, usd: 1 };
  APC.s = null; APC.user = null; APC.trades = []; APC.holders = null; APC.dexPair = null; APC.chartSrc = "onchain";
  APC.side = "buy"; APC.filter = "all"; APC.shown = 25; APC.range = 0;
  apc$("apc-amount").value = ""; apc$("apc-status").innerHTML = ""; apc$("apc-status").dataset.kind = "";
  apc$("apc-src").hidden = true; apc$("apc-dex").hidden = true; apc$("apc-dex").innerHTML = ""; apc$("apc-chart").hidden = false; apc$("apc-range").hidden = false;
  document.querySelectorAll("#apc-range button").forEach((x) => x.classList.toggle("active", x.dataset.range === "0"));
  document.querySelectorAll("#apc-filter button").forEach((x) => x.classList.toggle("active", x.dataset.filter === "all"));
  document.querySelectorAll("#bp-panel-coin [data-apctab]").forEach((x) => x.classList.toggle("active", x.dataset.apctab === "trades"));
  document.querySelectorAll("#bp-panel-coin [data-apcpanel]").forEach((p) => { p.hidden = p.dataset.apcpanel !== "trades"; });
  ["apc-price", "apc-mcap", "apc-liq", "apc-vol", "apc-txns", "apc-holders-count", "apc-sold-text"].forEach((id) => { apc$(id).textContent = "—"; });
  apc$("apc-change").innerHTML = "&nbsp;"; apc$("apc-change").className = "ac2-change";
  apc$("apc-sold-fill").style.width = "0";
  apc$("apc-chart").innerHTML = `<div class="ac2-empty">Loading…</div>`;
  apc$("apc-trades").innerHTML = `<tr><td colspan="7" class="ac2-empty">Loading trades…</td></tr>`;
  apc$("apc-scan").textContent = "";
}

/// Open the coin page for an ArcPad launch. Used by launch cards, the post-
/// launch redirect and /arc#coin/<address> links.
async function openArcCoin(token) {
  if (!ethers.isAddress(token)) return;
  const seq = ++APC.loadSeq;
  apcWire();
  const same = APC.token && APC.token.toLowerCase() === token.toLowerCase();
  if (!same) {
    APC.token = ethers.getAddress(token);
    APC.l = null;
    apcResetView();
    apc$("apc-name").textContent = "Loading…"; apc$("apc-sym").textContent = "";
  }
  if (typeof window.arcpadShowTab === "function") window.arcpadShowTab("coin");
  if (history.replaceState) history.replaceState(null, "", `${location.pathname}${location.search}#coin/${APC.token}`);
  try {
    if (!same || !APC.l) {
      const info = await apcLoadLaunch(APC.token);
      if (seq !== APC.loadSeq) return;
      Object.assign(APC, { l: info.l, key: info.key, poolId: info.poolId, stateSlot: info.stateSlot, feeBps: info.feeBps, tokenIs0: !info.l.quoteIsCurrency0, q: info.q });
      apcRenderHeader();
      apcLoadCache();
      apcDerive();
      apcRenderData();
      apcCheckDexscreener();
    }
    await apcRefresh();
    if (seq !== APC.loadSeq) return;
    apcRenderData();
    apcScan();
  } catch (err) {
    console.error("ArcPad coin: load failed", err);
    if (seq !== APC.loadSeq) return;
    apc$("apc-name").textContent = "Couldn't load this coin";
    apc$("apc-chart").innerHTML = `<div class="ac2-empty">${apcEsc(String(err && (err.shortMessage || err.message) || err).slice(0, 160))}</div>`;
  }
  if (APC.pollTimer) clearInterval(APC.pollTimer);
  APC.pollTimer = setInterval(() => {
    const panel = apc$("bp-panel-coin");
    if (!panel || !panel.classList.contains("active") || document.hidden || !APC.l) return;
    apcRefresh().then(() => apcRenderChart());
    apcScan();
  }, 12000);
}
window.openArcCoin = openArcCoin;

/// The new token's address from a launch receipt (Launched event, topic 1).
function arcLaunchedTokenFromReceipt(receipt) {
  const log = (receipt && receipt.logs || []).find((l) => l.topics && l.topics[0] === APC_LAUNCHED_TOPIC
    && String(l.address).toLowerCase() === CONFIG.ARCPAD_FACTORY_ADDRESS.toLowerCase());
  return log ? ethers.getAddress("0x" + log.topics[1].slice(26)) : null;
}
window.arcLaunchedTokenFromReceipt = arcLaunchedTokenFromReceipt;

(() => {
  if (!apc$("bp-panel-coin")) return;
  const fromHash = () => { const m = /^#coin\/(0x[0-9a-fA-F]{40})$/.exec(location.hash); return m ? m[1] : null; };
  const initial = fromHash();
  if (initial) setTimeout(() => openArcCoin(initial), 0);
  window.addEventListener("hashchange", () => { const t = fromHash(); if (t) openArcCoin(t); });
  const prev = typeof refreshAccountDependentViews === "function" ? refreshAccountDependentViews : null;
  // eslint-disable-next-line no-global-assign
  refreshAccountDependentViews = function () {
    if (prev) prev();
    if (APC.l) { apcRefresh(); apcRenderTrades(); apcRenderHolders(); }
  };
})();
