// api/_token.mjs — $ARCIRCLE's public numbers for the $ARCIRCLE and Reward
// pages, served through /api/social (no extra function):
//
//   GET /api/social?token=arcircle[&wallet=0x…]
//     price, market cap, graduation, 24h volume, 7-day price line, holders,
//     supply split, treasury buybacks and balances, ecosystem revenue so far,
//     and (with a wallet) that wallet's holding period, rank, CirclePad
//     contribution and referral total.
//   GET  /api/social?poll=rewards[&wallet=0x…]   candidate-mechanics poll
//   POST /api/social { action: "rpoll", mech, wallet, signature }
//
// Everything is read from Arc. The curve's trades and the token's transfers
// are scanned once on the server (in chunks, resumable: memory, and Firestore
// when configured, so a cold function carries on where the last one stopped)
// and the derived state — balances, first-received blocks, the last 8 days of
// trades, buybacks — is what gets stored, not the raw logs.
import { ethCalls, rpcCall, getLogs, latestBlock, blockTs, toQty, pad, wAddr, isAddr, TOPIC } from "./_arc.mjs";
import { storeEnabled, getDocs, setDoc, commit, queryDocs } from "./_store.mjs";
import { ARCIRCLE, ARCIRCLE_LIVE, FACTORY, kec, S, big, roundState, contributionOf } from "./_round.mjs";
import { ARCIRCLE_CURVE, ARCIRCLE_POOL_ID, ARCIRCLE_LAUNCHED_AT, ARCIRCLE_VENUE_CONTRACTS, ARCIRCLE_QUOTE, ARCIRCLE_QUOTE_DECIMALS,
  ARCIRCLE_IS_CURRENCY0, ARGUS_PORTALS, ARGUS_POOL_FEE, ARGUS_POOL_FEE_DYNAMIC, ARGUS_TICK_SPACING, ARGUS_SHARE_BPS, arcircleUsd } from "./_arcircle.mjs";
import { PM_ADDRESS, keccakHex } from "./_arc.mjs";
import { creatorCounts, blockAtOrBefore } from "./_circle.mjs";

export const CURVE = ARCIRCLE_CURVE.toLowerCase(); // foci-style curve (first launch); "" otherwise
// Uniswap v4 pool (Argus launch): Swap events on the PoolManager for this pool id.
export const POOL = ARCIRCLE_POOL_ID.toLowerCase();
const PM = PM_ADDRESS.toLowerCase();
const VENUE = new Set(ARCIRCLE_VENUE_CONTRACTS.map((a) => a.toLowerCase()));
const signed128 = (w) => BigInt.asIntN(128, w);
export const TREASURY = "0xa066e6c5d1ac561a4065b9d6b00fef89c0bd02f8";
const LAUNCHED_AT = ARCIRCLE_LAUNCHED_AT;
const SUPPLY = 1e9;
const ZERO = "0x0000000000000000000000000000000000000000";
// tokens sent here are gone for good (no one holds a key): counted as burned, never as a holder
const DEAD = "0x000000000000000000000000000000000000dead";
const BURN_SINKS = new Set([DEAD, ZERO]);
const CHUNK = 9000, PARALLEL = 4, MAX_CHUNKS = 40, KEEP = 8 * 86400;
const DOC = "tokenStats/arcircle_" + (ARCIRCLE ? ARCIRCLE.slice(2, 10) : "none") + "_v4"; // new coin / new fields → fresh state
const lc = (a) => String(a || "").toLowerCase();
const sel = (sig) => kec(sig).slice(0, 10);
const T = {
  getReserves: sel("getReserves()"), realQuoteReserve: sel("realQuoteReserve()"), graduationThreshold: sel("graduationThreshold()"),
  graduated: sel("graduated()"), platformTreasury: sel("platformTreasury()"), platformWallet: sel("platformWallet()"),
};
const word = (hex, i) => BigInt("0x" + (String(hex).replace(/^0x/, "").slice(i * 64, (i + 1) * 64) || "0"));

// ---- the wallets whose $ARCIRCLE buys count as treasury buybacks ----
let walletsCache = null;
export async function treasuryWallets() {
  if (walletsCache && Date.now() - walletsCache.at < 10 * 60e3) return walletsCache.list;
  const r = await ethCalls([{ to: FACTORY, data: T.platformTreasury }, { to: FACTORY, data: T.platformWallet }]).catch(() => [null, null]);
  const real = (h) => !!h && !/^0x0{40}$/.test(wAddr(h, 0));
  const list = [{ addr: real(r[0]) ? lc(wAddr(r[0], 0)) : TREASURY, label: "Treasury" }];
  if (real(r[1]) && lc(wAddr(r[1], 0)) !== list[0].addr) list.push({ addr: lc(wAddr(r[1], 0)), label: "Platform wallet" });
  walletsCache = { at: Date.now(), list };
  return list;
}

// ---- scan state: stored as strings (Firestore can't nest arrays) ----
function load(doc) {
  const W = { from: null, scannedTo: null, anchors: [], hold: new Map(), trades: [], bb: [], recent: [], burns: [], p0: null, agg: { vol: 0, n: 0, tax: 0, fee: 0, buyVol: 0, sellVol: 0 } };
  if (!doc) return W;
  W.from = doc.from; W.scannedTo = doc.scannedTo; W.p0 = doc.p0 == null ? null : doc.p0;
  W.anchors = (doc.anchors || []).map((s) => String(s).split("|").map(Number));
  for (const s of doc.hold || []) { const [a, bal, first, since] = String(s).split("|"); W.hold.set(a, { bal: BigInt(bal), first: Number(first), since: Number(since) }); }
  W.trades = (doc.trades || []).map((s) => { const [b, k, usd, price] = String(s).split("|"); return { b: Number(b), buy: k === "1", usd: Number(usd), price: Number(price) }; });
  W.bb = (doc.bb || []).map((s) => { const [b, usd, tok, h, w] = String(s).split("|"); return { b: Number(b), usd: Number(usd), tok: Number(tok), h, w }; });
  W.burns = (doc.burns || []).map((s) => { const [b, tok, h, fr] = String(s).split("|"); return { b: Number(b), tok: Number(tok), h, fr }; });
  W.recent = (doc.recent || []).map((s) => { const [b, k, usd, tok, tr, h] = String(s).split("|"); return { b: Number(b), buy: k === "1", usd: Number(usd), tok: Number(tok), trader: tr, h }; });
  if (doc.agg) W.agg = { vol: doc.agg.vol || 0, n: doc.agg.n || 0, tax: doc.agg.tax || 0, fee: doc.agg.fee || 0, buyVol: doc.agg.buyVol || 0, sellVol: doc.agg.sellVol || 0 };
  return W;
}
function save(W) {
  return {
    from: W.from, scannedTo: W.scannedTo, p0: W.p0, agg: W.agg, at: Date.now(),
    anchors: W.anchors.map((a) => a.join("|")),
    hold: [...W.hold.entries()].map(([a, h]) => [a, h.bal.toString(), h.first, h.since].join("|")),
    trades: W.trades.map((t) => [t.b, t.buy ? 1 : 0, +t.usd.toFixed(6), +t.price.toPrecision(8)].join("|")),
    bb: W.bb.map((x) => [x.b, +x.usd.toFixed(6), +x.tok.toFixed(4), x.h, x.w].join("|")),
    burns: W.burns.map((x) => [x.b, +x.tok.toFixed(6), x.h, x.fr].join("|")),
    recent: W.recent.map((x) => [x.b, x.buy ? 1 : 0, +x.usd.toFixed(6), +x.tok.toFixed(2), x.trader, x.h].join("|")),
  };
}

/// Block → unix time, interpolated between the chunk ends we have timestamps for.
export function tsAt(W, b) {
  const A = W.anchors;
  if (!A.length || !b) return null;
  let lo = null, hi = null;
  for (const a of A) { if (a[0] <= b) lo = a; else { hi = a; break; } }
  if (lo && hi) return Math.round(lo[1] + ((hi[1] - lo[1]) * (b - lo[0])) / Math.max(1, hi[0] - lo[0]));
  const i = lo ? A.indexOf(lo) : 0;
  const p = A[Math.max(0, i - 1)], q = A[Math.min(A.length - 1, Math.max(1, i))];
  const spb = q && p && q[0] !== p[0] ? (q[1] - p[1]) / (q[0] - p[0]) : 0.5;
  const ref = lo || hi;
  return Math.round(ref[1] + (b - ref[0]) * spb);
}

function move(W, addr, delta, b) {
  if (addr === ZERO) return;
  let h = W.hold.get(addr);
  if (!h) { h = { bal: 0n, first: 0, since: 0 }; W.hold.set(addr, h); }
  const before = h.bal;
  h.bal += delta;
  if (delta > 0n) { if (!h.first) h.first = b; if (before <= 0n) h.since = b; }
  if (h.bal <= 0n) W.hold.delete(addr);
}

/// Fold one chunk of curve + token logs into the state.
export function apply(W, logs, bbSet) {
  logs = logs.slice().sort((x, y) => (parseInt(x.blockNumber, 16) - parseInt(y.blockNumber, 16)) || (parseInt(x.logIndex, 16) - parseInt(y.logIndex, 16)));
  const byTx = new Map();
  for (const l of logs) if (lc(l.address) === ARCIRCLE && lc(l.topics[0]) === TOPIC.transfer) {
    if (!byTx.has(l.transactionHash)) byTx.set(l.transactionHash, []);
    byTx.get(l.transactionHash).push(l);
  }
  for (const l of logs) {
    const b = parseInt(l.blockNumber, 16), t0 = lc(l.topics[0]);
    if (lc(l.address) === ARCIRCLE && t0 === TOPIC.transfer) {
      const v = BigInt(l.data), fr = lc("0x" + l.topics[1].slice(26)), to = lc("0x" + l.topics[2].slice(26));
      move(W, fr, -v, b); move(W, to, v, b);
      // a transfer into a burn sink (not the mint, which comes from zero)
      if (BURN_SINKS.has(to) && fr !== ZERO) W.burns.push({ b, tok: Number(v) / 1e18, h: l.transactionHash, fr });
      continue;
    }
    if (POOL && lc(l.address) === PM && t0 === TOPIC.swap && lc(l.topics[1]) === POOL) { applySwap(W, l, byTx.get(l.transactionHash) || [], bbSet, b); continue; }
    if (!CURVE || lc(l.address) !== CURVE || (t0 !== TOPIC.curveBuy && t0 !== TOPIC.curveSell)) continue;
    const buy = t0 === TOPIC.curveBuy;
    const q = word(l.data, buy ? 0 : 1), n = word(l.data, buy ? 1 : 0), fee = word(l.data, 2), tax = word(l.data, 3);
    // foci's router can sit in the middle of a trade; the real wallet is the
    // end of the token's path for a buy and the start of it for a sell
    const tx = byTx.get(l.transactionHash) || [];
    let trader = lc("0x" + String(l.topics[2] || l.topics[1]).slice(26));
    if (tx.length) trader = lc("0x" + (buy ? tx[tx.length - 1].topics[2] : tx[0].topics[1]).slice(26));
    if (trader === CURVE) trader = lc("0x" + String(l.topics[2]).slice(26));
    const usd = Number(q) / 1e6, tok = Number(n) / 1e18;
    const price = tok > 0 ? (buy ? Number(q - fee - tax) : Number(q + fee + tax)) / 1e6 / tok : 0;
    if (!(price > 0)) continue;
    W.trades.push({ b, buy, usd, price });
    pushRecent(W, { b, buy, usd, tok, trader, h: l.transactionHash });
    W.agg.vol += usd; W.agg.n += 1; W.agg.tax += Number(tax) / 1e6; W.agg.fee += Number(fee) / 1e6;
    if (buy && bbSet.has(trader)) W.bb.push({ b, usd, tok, h: l.transactionHash, w: trader });
  }
}
function pushRecent(W, t) { W.recent.push(t); if (W.recent.length > 30) W.recent.splice(0, W.recent.length - 30); }
/// USD per $ARCIRCLE from the pool's sqrtPriceX96 (currency order and the
/// quote's decimals are handled in _arcircle.mjs).
export const poolPrice = arcircleUsd;
/// One v4 Swap on the $ARCIRCLE pool. amount0 / amount1 are the swapper's
/// deltas: $ARCIRCLE coming in (> 0) is a buy; the other leg is USDC.
export function applySwap(W, l, tx, bbSet, b) {
  const a0 = signed128(word(l.data, 0)), a1 = signed128(word(l.data, 1)), sq = word(l.data, 2);
  const dTok = ARCIRCLE_IS_CURRENCY0 ? a0 : a1, dQ = ARCIRCLE_IS_CURRENCY0 ? a1 : a0;
  const buy = dTok > 0n;
  const usd = Number(dQ < 0n ? -dQ : dQ) / 10 ** ARCIRCLE_QUOTE_DECIMALS, tok = Number(dTok < 0n ? -dTok : dTok) / 1e18;
  const price = poolPrice(sq);
  if (!(price > 0) || !(tok > 0)) return;
  // the real wallet: where the tokens ended up (buy) or came from (sell),
  // skipping the PoolManager, the router in between and the launchpad's contracts
  const skip = (a) => a === PM || VENUE.has(a) || a === ZERO;
  const moves = tx.map((t) => ({ fr: lc("0x" + t.topics[1].slice(26)), to: lc("0x" + t.topics[2].slice(26)) }));
  let trader = lc("0x" + String(l.topics[2] || "").slice(26));
  if (buy) { const m = moves.filter((x) => !skip(x.to)).pop(); if (m) trader = m.to; }
  else { const m = moves.find((x) => !skip(x.fr)); if (m) trader = m.fr; }
  W.trades.push({ b, buy, usd, price });
  pushRecent(W, { b, buy, usd, tok, trader, h: l.transactionHash });
  W.agg.vol += usd; W.agg.n += 1;
  if (buy) W.agg.buyVol = (W.agg.buyVol || 0) + usd; else W.agg.sellVol = (W.agg.sellVol || 0) + usd;
  if (buy && bbSet.has(trader)) W.bb.push({ b, usd, tok, h: l.transactionHash, w: trader });
}

// ---- the Argus launch record (hook / locker / splitter, taxes, bonding) ----
// Read from the Portals once; trusted only when the hook it names, together
// with the pair, hashes to ARCIRCLE_POOL_ID. Its contracts then join VENUE.
const ARGUS_SEL = { launches: sel("launches(address)"), bonded: sel("bonded()") };
let argusCache = null; // { at, v }
export function argusRecord(hex) {
  const h = strip0(hex || "");
  const n = Math.floor(h.length / 64);
  if (n < 9) return null;
  const w = (i) => BigInt("0x" + h.slice(i * 64, (i + 1) * 64));
  const addr = (i) => "0x" + h.slice(i * 64 + 24, (i + 1) * 64).toLowerCase();
  const int24 = (i) => Number(BigInt.asIntN(256, w(i)));
  const rec = {
    creator: addr(0), tickStart: int24(1), tokenIsToken0: w(2) === 1n, locker: addr(3), hook: addr(4), splitter: addr(5),
    buyTaxBps: Number(w(6)), sellTaxBps: Number(w(7)), tickBond: n >= 10 ? int24(9) : null, quote: n >= 11 ? addr(10) : lc(ARCIRCLE_QUOTE),
  };
  if (/^0x0{40}$/.test(rec.creator) || /^0x0{40}$/.test(rec.hook) || rec.buyTaxBps > 1000 || rec.sellTaxBps > 1000) return null;
  return rec;
}
export function argusPoolId(token, quote, hook, fee = ARGUS_POOL_FEE) {
  const [c0, c1] = BigInt(token) < BigInt(quote) ? [token, quote] : [quote, token];
  return keccakHex([c0, c1].map((a) => strip0(a).toLowerCase().padStart(64, "0")).join("") +
    fee.toString(16).padStart(64, "0") + ARGUS_TICK_SPACING.toString(16).padStart(64, "0") + strip0(hook).toLowerCase().padStart(64, "0")).toLowerCase();
}
async function argusLaunch() {
  if (!POOL) return null;
  if (argusCache && (argusCache.v || Date.now() - argusCache.at < 10 * 60e3)) return argusCache.v;
  let v = null;
  try {
    const r = await ethCalls(ARGUS_PORTALS.map((p) => ({ to: p, data: ARGUS_SEL.launches + pad(ARCIRCLE) })));
    for (let i = 0; i < r.length && !v; i++) {
      const rec = argusRecord(r[i]);
      if (rec && [ARGUS_POOL_FEE, ARGUS_POOL_FEE_DYNAMIC].some((f) => argusPoolId(ARCIRCLE, rec.quote, rec.hook, f) === POOL)) v = { ...rec, portal: ARGUS_PORTALS[i] };
    }
  } catch { v = null; }
  if (v) for (const a of [v.hook, v.locker, v.splitter]) VENUE.add(a);
  argusCache = { at: Date.now(), v };
  return v;
}

// ---- live reads (15s) ----
const EXTSLOAD = "0x1e2eaeaf"; // extsload(bytes32)
const strip0 = (h) => String(h).replace(/^0x/, "");
const kecHex = (hexNo0x) => keccakHex(hexNo0x);
/// Pool liquidity in USD from Dexscreener (the pool's own reserves can't be
/// read per pool from the v4 singleton). Cached a minute; null when unreachable.
let dexCache = null;
async function dexLiquidity() {
  if (dexCache && Date.now() - dexCache.at < 60e3) return dexCache.v;
  let v = null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/arc/${POOL}`, { signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    const p = (j && (j.pair || (j.pairs || [])[0])) || null;
    v = p && p.liquidity && Number(p.liquidity.usd) > 0 ? Number(p.liquidity.usd) : null;
  } catch { v = null; }
  dexCache = { at: Date.now(), v };
  return v;
}
let liveCache = null;
async function liveReads(wallets) {
  if (liveCache && Date.now() - liveCache.at < 15e3) return liveCache.v;
  const launch = POOL ? await argusLaunch() : null;
  // head: the curve's four views, or the pool's slot0 (extsload of its state slot)
  const head = POOL
    ? [{ to: PM, data: EXTSLOAD + strip0(kecHex(POOL.slice(2) + "6".padStart(64, "0"))) }]
    : [{ to: CURVE, data: T.getReserves }, { to: CURVE, data: T.realQuoteReserve }, { to: CURVE, data: T.graduationThreshold }, { to: CURVE, data: T.graduated }];
  const calls = [
    ...head,
    { to: FACTORY, data: S.launchCount },
    ...wallets.map((w) => ({ to: ARCIRCLE, data: S.balanceOf + pad(w.addr) })),
    ...(launch ? [{ to: launch.hook, data: ARGUS_SEL.bonded }] : []),
  ];
  const [r0, natives, round, dex] = await Promise.all([
    ethCalls(calls),
    Promise.all(wallets.map((w) => rpcCall("eth_getBalance", [w.addr, "latest"]).then((h) => Number(BigInt(h)) / 1e18).catch(() => null))),
    roundState().catch(() => null),
    POOL ? dexLiquidity() : Promise.resolve(null),
  ]);
  // normalise both shapes to [price-ish reads x4, launchCount, balances…]
  const r = POOL ? [r0[0], null, null, null, ...r0.slice(1)] : r0;
  if (!r[0]) throw new Error(POOL ? "pool unreadable" : "curve unreadable");
  let price;
  let tick = null;
  if (POOL) {
    const slot0 = BigInt(r[0]);
    price = poolPrice(slot0 & ((1n << 160n) - 1n));
    tick = Number(BigInt.asIntN(24, (slot0 >> 160n) & 0xffffffn));
  }
  else { const qr = Number(word(r[0], 0)) / 1e6, tr = Number(word(r[0], 1)) / 1e18; price = tr > 0 ? qr / tr : null; }
  const v = {
    price, real: POOL ? null : Number(big(r[1])) / 1e6, threshold: POOL ? null : Number(big(r[2])) / 1e6, graduated: POOL ? false : big(r[3]) > 0n,
    liquidityUsd: dex, venue: POOL ? "pool" : "curve", tick, launch,
    bonded: launch && r[5 + wallets.length] ? big(r[5 + wallets.length]) > 0n : null,
    launches: Number(big(r[4])),
    wallets: wallets.map((w, i) => ({ ...w, arcircle: Number(big(r[5 + i])) / 1e18, usdc: natives[i] })),
    round: round ? { started: round.started, raised: Number(round.totalRaised) / 1e18, deadline: round.deadline, isOpen: round.isOpen } : null,
  };
  liveCache = { at: Date.now(), v };
  return v;
}

// ---- the scan ----
let mem = null; // { at, W, out }
let running = null;
async function scanState() {
  if (mem && Date.now() - mem.at < 12e3) return mem;
  if (running) return running;
  running = (async () => {
    let W = mem ? mem.W : null;
    if (!W && storeEnabled()) { try { W = load((await getDocs([DOC]))[DOC]); } catch { W = null; } }
    if (!W) W = load(null);
    const head = await latestBlock();
    if (W.from == null) {
      W.from = Math.max(0, await blockAtOrBefore(LAUNCHED_AT - 60, head) - 10);
      W.scannedTo = W.from - 1;
      W.anchors.push([W.from, (await blockTs(W.from)) || LAUNCHED_AT]);
    }
    const bbSet = new Set((await treasuryWallets()).map((w) => w.addr));
    if (POOL) await argusLaunch(); // its hook / locker / splitter are never traders
    let chunks = 0;
    const t0 = Date.now(); // stay well inside a short function timeout; the next request carries on
    while (W.scannedTo < head.number && chunks < MAX_CHUNKS && Date.now() - t0 < 6000) {
      const ranges = [];
      for (let a = W.scannedTo + 1; a <= head.number && ranges.length < PARALLEL; a += CHUNK) ranges.push([a, Math.min(head.number, a + CHUNK - 1)]);
      const got = await Promise.all(ranges.map(([a, b]) => Promise.all([
        POOL
          ? Promise.all([
            getLogs({ address: PM, topics: [TOPIC.swap, POOL], fromBlock: toQty(a), toBlock: toQty(b) }),
            getLogs({ address: ARCIRCLE, topics: [TOPIC.transfer], fromBlock: toQty(a), toBlock: toQty(b) }),
          ]).then(([x, y]) => x.concat(y))
          : getLogs({ address: [CURVE, ARCIRCLE], topics: [[TOPIC.curveBuy, TOPIC.curveSell, TOPIC.transfer]], fromBlock: toQty(a), toBlock: toQty(b) }),
        b === head.number ? head.ts : blockTs(b).catch(() => null),
      ])));
      got.forEach(([logs, ts], k) => {
        apply(W, logs, bbSet);
        W.scannedTo = ranges[k][1];
        if (ts) W.anchors.push([ranges[k][1], ts]);
      });
      chunks += ranges.length;
    }
    // keep the last 8 days of trades (and the price just before them)
    const cut = head.ts - KEEP;
    let k = 0;
    while (k < W.trades.length && (tsAt(W, W.trades[k].b) || 0) < cut) k++;
    if (k) { W.p0 = W.trades[k - 1].price; W.trades = W.trades.slice(k); }
    // anchors: the first one, plus the last 9 days
    if (W.anchors.length > 2) W.anchors = W.anchors.filter((a, i) => i === 0 || a[1] >= head.ts - 9 * 86400 || i >= W.anchors.length - 2);
    if (storeEnabled() && chunks) { try { await setDoc(DOC, save(W)); } catch (err) { console.error("token stats save", err && err.message || err); } }
    mem = { at: Date.now(), W, head, complete: W.scannedTo >= head.number };
    return mem;
  })();
  try { return await running; } finally { running = null; }
}

const r2 = (n, d = 2) => (n == null || !Number.isFinite(n) ? null : Number(n.toFixed(d)));
function priceAt(W, ts) {
  let p = W.p0;
  for (const t of W.trades) { if ((tsAt(W, t.b) || 0) > ts) break; p = t.price; }
  return p;
}

/// While $ARCIRCLE is not live (relaunching): no price, curve or holders —
/// just what doesn't depend on it (launch fees, CirclePad, treasury USDC, and
/// a wallet's CirclePad contribution / launches / referrals).
async function notLiveStats(wallet) {
  const wl = await treasuryWallets();
  const [r, natives, round] = await Promise.all([
    ethCalls([{ to: FACTORY, data: S.launchCount }]),
    Promise.all(wl.map((w) => rpcCall("eth_getBalance", [w.addr, "latest"]).then((h) => Number(BigInt(h)) / 1e18).catch(() => null))),
    roundState().catch(() => null),
  ]);
  const launches = Number(big(r[0]));
  const out = {
    v: 1, live: false, complete: true, price: null, mcap: null,
    buybacks: { n: 0, usdc: 0, tokens: 0, list: [] },
    treasury: { wallets: wl.map((w, i) => ({ address: w.addr, label: w.label, arcircle: null, usdc: r2(natives[i]) })), arcircle: null,
      usdc: r2(natives.reduce((s, v) => s + (v || 0), 0)) },
    revenue: {
      launches, launchFees: launches, allocationCoins: launches, creatorTax: null,
      circle: round ? { started: round.started, raised: r2(Number(round.totalRaised) / 1e18), share: r2((Number(round.totalRaised) / 1e18) * 0.05), open: round.isOpen, deadline: round.deadline } : null,
    },
  };
  if (isAddr(wallet)) {
    const w = lc(wallet);
    const [contrib, creators, refs] = await Promise.all([
      contributionOf(w).catch(() => null), creatorCounts().catch(() => null),
      storeEnabled() ? queryDocs("circleRefs", "ref", w).catch(() => null) : Promise.resolve(null),
    ]);
    out.wallet = {
      address: w, balance: null, holdingSince: null, heldDays: 0, rank: null, indexed: true,
      circle: contrib == null ? null : r2(Number(contrib) / 1e18, 4),
      launches: creators ? creators.get(w) || 0 : null,
      referrals: refs ? { n: refs.length, usdc: r2(refs.reduce((s, x) => s + (x.amount || 0), 0), 4) } : null,
    };
  }
  return out;
}

/// GET /api/social?token=arcircle
export async function tokenStats(wallet) {
  if (!ARCIRCLE_LIVE || (!CURVE && !POOL)) return notLiveStats(wallet);
  const wl = await treasuryWallets();
  const [st, live] = await Promise.all([scanState(), liveReads(wl)]);
  const { W, head } = st;
  const now = head.ts;
  const price = live.price;
  // 24h
  const day = W.trades.filter((t) => (tsAt(W, t.b) || 0) >= now - 86400);
  const p24 = priceAt(W, now - 86400);
  // 7 days in 4-hour steps (last point = the live spot price)
  const spark = [];
  if (W.trades.length || W.p0) {
    let i = 0, p = W.p0;
    for (let s = 0; s < 42; s++) {
      const end = now - 7 * 86400 + (s + 1) * 4 * 3600;
      while (i < W.trades.length && (tsAt(W, W.trades[i].b) || 0) <= end) { p = W.trades[i].price; i++; }
      spark.push(p == null ? null : Number(p.toPrecision(6)));
    }
    if (price) spark[spark.length - 1] = Number(price.toPrecision(6));
  }
  // holders and supply split
  const tset = new Set(wl.map((w) => w.addr));
  // the pool's tokens sit in the v4 PoolManager (or, for a curve, in the curve)
  const HOME = POOL ? PM : CURVE;
  const rows = [...W.hold.entries()].filter(([a, h]) => h.bal > 0n && a !== HOME && !VENUE.has(a) && !BURN_SINKS.has(a)).sort((x, y) => (y[1].bal > x[1].bal ? 1 : y[1].bal < x[1].bal ? -1 : 0));
  const tokOf = (h) => Number(h.bal) / 1e18;
  const curveTok = W.hold.get(HOME) ? tokOf(W.hold.get(HOME)) : 0;
  const treasTok = wl.reduce((s, w) => s + (W.hold.get(w.addr) ? tokOf(W.hold.get(w.addr)) : 0), 0);
  const others = rows.filter(([a]) => !tset.has(a));
  const top10 = others.slice(0, 10).reduce((s, [, h]) => s + tokOf(h), 0);
  // burned: what sits at the dead address (zero-address burns shrink the supply instead)
  const burnedTok = W.hold.get(DEAD) ? tokOf(W.hold.get(DEAD)) : 0;
  const rest = Math.max(0, SUPPLY - curveTok - treasTok - top10 - burnedTok);
  const bbSpent = W.bb.reduce((s, x) => s + x.usd, 0), bbTok = W.bb.reduce((s, x) => s + x.tok, 0);
  const L = live.launch || null;
  const out = {
    v: 1, live: true, complete: st.complete, scannedTo: W.scannedTo, head: head.number, ts: now,
    price, mcap: price != null ? price * SUPPLY : null, change24h: p24 && price ? r2(((price - p24) / p24) * 100) : null,
    venue: POOL ? "pool" : "curve", poolId: POOL || null,
    liquidity: POOL ? r2(live.liquidityUsd) : r2(live.real), threshold: POOL ? null : r2(live.threshold), graduated: live.graduated,
    progress: POOL ? null : live.graduated ? 100 : live.threshold > 0 ? r2(Math.min(100, (live.real / live.threshold) * 100), 3) : 0,
    toGraduate: POOL ? null : live.graduated ? 0 : r2(Math.max(0, live.threshold - live.real)),
    recent: W.recent.slice(-20).reverse().map((x) => ({ side: x.buy ? "buy" : "sell", usdc: r2(x.usd, 4), tokens: Math.round(x.tok), trader: x.trader, tx: x.h, ts: tsAt(W, x.b) })),
    vol24h: r2(day.reduce((s, t) => s + t.usd, 0)), trades24h: day.length,
    buys24h: day.filter((t) => t.buy).length, sells24h: day.filter((t) => !t.buy).length,
    spark, sparkStep: 4 * 3600,
    holders: rows.length,
    split: { curve: Math.round(curveTok), treasury: Math.round(treasTok), top10: Math.round(top10), others: Math.round(rest), burned: Math.round(burnedTok) },
    burned: {
      tokens: r2(burnedTok, 2), pct: r2((burnedTok / SUPPLY) * 100, 3), circulating: Math.round(SUPPLY - burnedTok),
      list: W.burns.slice(-20).reverse().map((x) => ({ tokens: r2(x.tok, 2), pct: r2((x.tok / SUPPLY) * 100, 3), tx: x.h, from: x.fr, ts: tsAt(W, x.b) })),
    },
    top: others.slice(0, 10).map(([a, h]) => ({ address: a, pct: r2((tokOf(h) / SUPPLY) * 100, 3) })),
    buybacks: {
      n: W.bb.length, usdc: r2(bbSpent), tokens: Math.round(bbTok),
      list: W.bb.slice(-20).reverse().map((x) => ({ usdc: r2(x.usd, 4), tokens: Math.round(x.tok), tx: x.h, wallet: x.w, ts: tsAt(W, x.b) })),
    },
    treasury: { wallets: live.wallets.map((w) => ({ address: w.addr, label: w.label, arcircle: Math.round(w.arcircle), usdc: r2(w.usdc) })),
      arcircle: Math.round(live.wallets.reduce((s, w) => s + (w.arcircle || 0), 0)), usdc: r2(live.wallets.reduce((s, w) => s + (w.usdc || 0), 0)) },
    revenue: {
      launches: live.launches, launchFees: live.launches * 1, allocationCoins: live.launches,
      creatorTax: POOL ? (L ? r2((((W.agg.buyVol || 0) * L.buyTaxBps + (W.agg.sellVol || 0) * L.sellTaxBps) / 1e4) * (1 - ARGUS_SHARE_BPS / 1e4)) : null) : r2(W.agg.tax),
      curveVolume: r2(W.agg.vol), curveTrades: W.agg.n,
      circle: live.round ? { started: live.round.started, raised: r2(live.round.raised), share: r2(live.round.raised * 0.05), open: live.round.isOpen, deadline: live.round.deadline } : null,
    },
    launchedAt: LAUNCHED_AT,
    argus: POOL ? argusOut(L, live) : null,
  };
  if (isAddr(wallet)) out.wallet = await walletStats(st, rows, lc(wallet), now);
  return out;
}

/// The Argus side of the answer: taxes, and progress toward its bonding
/// milestone (progress = (tick - tickStart) / (tickBond - tickStart); the
/// latch itself is read from the hook). null fields = not resolved (yet).
function argusOut(L, live) {
  if (!L) return { verified: false, buyTaxBps: null, sellTaxBps: null, bonded: null, bondProgress: null };
  let bondProgress = null;
  if (live.tick != null && L.tickBond != null && L.tickBond !== L.tickStart) bondProgress = r2(Math.max(0, Math.min(100, ((live.tick - L.tickStart) / (L.tickBond - L.tickStart)) * 100)), 2);
  if (live.bonded) bondProgress = 100;
  return { verified: true, buyTaxBps: L.buyTaxBps, sellTaxBps: L.sellTaxBps, venueShareBps: ARGUS_SHARE_BPS, bonded: live.bonded, bondProgress,
    hook: L.hook, locker: L.locker, splitter: L.splitter, portal: L.portal };
}

async function walletStats(st, rows, w, now) {
  const { W } = st;
  const h = W.hold.get(w);
  const [balRaw, contrib, creators, refs] = await Promise.all([
    ethCalls([{ to: ARCIRCLE, data: S.balanceOf + pad(w) }]).then((r) => big(r[0])).catch(() => null),
    contributionOf(w).catch(() => null),
    creatorCounts().catch(() => null),
    storeEnabled() ? queryDocs("circleRefs", "ref", w).catch(() => null) : Promise.resolve(null),
  ]);
  const since = h && h.since ? tsAt(W, h.since) : null;
  const first = h && h.first ? tsAt(W, h.first) : null;
  const rank = rows.findIndex(([a]) => a === w);
  return {
    address: w,
    balance: balRaw == null ? (h ? Number(h.bal) / 1e18 : 0) : Number(balRaw) / 1e18,
    firstReceived: first, holdingSince: since, heldDays: since ? r2((now - since) / 86400, 2) : 0,
    maxDays: r2((now - LAUNCHED_AT) / 86400, 2),
    rank: rank >= 0 ? rank + 1 : null, of: rows.length, indexed: st.complete,
    circle: contrib == null ? null : r2(Number(contrib) / 1e18, 4),
    launches: creators ? creators.get(w) || 0 : null,
    referrals: refs ? { n: refs.length, usdc: r2(refs.reduce((s, r) => s + (r.amount || 0), 0), 4) } : null,
  };
}

// ================= candidate-mechanics poll (Reward page) =================
export const POLL_MECHS = ["twa", "score", "ref"];
export const pollMessage = (mech, wallet) => `ARCIRCLE PAD — rewards poll\nI support: ${mech}\nWallet: ${lc(wallet)}`;
export async function pollData(wallet) {
  const w = lc(wallet);
  const paths = ["rewardPoll/main", ...(isAddr(w) ? POLL_MECHS.map((m) => `rewardVotes/${m}_${w}`) : [])];
  const d = await getDocs(paths);
  const t = d["rewardPoll/main"] || {};
  return {
    enabled: true,
    tally: Object.fromEntries(POLL_MECHS.map((m) => [m, { n: t[m] || 0, holders: t[m + "_h"] || 0 }])),
    mine: isAddr(w) ? POLL_MECHS.filter((m) => d[`rewardVotes/${m}_${w}`]) : [],
  };
}
export async function pollVote(b, recoverSigner, json) {
  const w = lc(b.wallet), mech = String(b.mech || "");
  if (!isAddr(w)) return json(400, { error: "wallet must be an address" });
  if (!POLL_MECHS.includes(mech)) return json(400, { error: "unknown mechanic" });
  let signer;
  try { signer = recoverSigner(pollMessage(mech, w), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== w) return json(403, { error: "signature doesn't match the wallet" });
  const [bal] = ARCIRCLE_LIVE ? await ethCalls([{ to: ARCIRCLE, data: S.balanceOf + pad(w) }]).catch(() => [null]) : [null];
  const holder = big(bal) > 0n;
  const r = await commit([
    { create: `rewardVotes/${mech}_${w}`, data: { mech, wallet: w, holder, at: Date.now() } },
    { inc: "rewardPoll/main", fields: { [mech]: 1, ...(holder ? { [mech + "_h"]: 1 } : {}) } },
  ]);
  if (r.conflict) return json(409, { error: "you already support this one", already: true });
  return json(200, { ok: true, holder, ...(await pollData(w)) });
}

// test hooks
export const _test = { load, save, reset: () => { mem = null; liveCache = null; walletsCache = null; running = null; } };
