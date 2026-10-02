// api/_predict.mjs — ARCIRCLE Predict (contracts/ArcPredict.sol): scheduled UP / DOWN rounds on Arc tokens, paid in
// native USDC. Every market follows one token's Uniswap v4 USDC pool; round e runs [start + e·d, start + (e+1)·d), and
// betting on it opens when round e−1 locks.
//   state()          every market: the live round, the round open for bets, the price, last results, badges
//   mine(user)       a wallet's recent bets + what it can claim, its referrer and referral earnings, its stats
//   chart(m)         the pool's price through the live round (its swaps), for the round card's chart
//   feed()           the latest bets on every market
//   leaderboard()    this week's and all-time PnL / volume leaders (kept up to date by the keeper)
//   tick()           the keeper (PREDICT_KEEPER_KEY, else ORDERS_KEEPER_KEY — the contract's operator): at every round
//                    boundary it samples the pool three times in different blocks, then settles — the contract finalizes
//                    the boundary on the median. Prices only come from the pool. Once an hour it pushes the fees to the
//                    fee burn, it keeps the leaderboard, and it posts big rounds to Telegram (PREDICT_TG_CHAT).
// Contract: env PREDICT_ADDRESS ("none" turns it off), else PREDICT_DEFAULT below.
import { evmChain, addressOfKey } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { priceOf } from "./_liq-core.mjs";

export const PREDICT_DEFAULT = "0x41149F8ce23d9B4E737e51C97fFE14bBb4C09ce6"; // ArcPredict on Arc (deployed 2026-10-02)
export const PREDICT_DEFAULT_BLOCK = 23867674; // its deployment block (the leaderboard starts there)
const env = (k) => String(process.env[k] || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const USDC = "0x3600000000000000000000000000000000000000";
const ZERO = "0x0000000000000000000000000000000000000000";
const ARCIRCLE = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7";
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
export const CFG = {
  rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  chainId: 5042,
  address: () => { const e = env("PREDICT_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : PREDICT_DEFAULT ? lc(PREDICT_DEFAULT) : null; },
  fromBlock: () => Number(env("PREDICT_FROM_BLOCK")) || PREDICT_DEFAULT_BLOCK || 0,
  keeperKey: () => env("PREDICT_KEEPER_KEY") || env("ORDERS_KEEPER_KEY") || null,
  usdc: USDC, // the ERC-20 face of USDC (6 decimals); a pool paired with native USDC (address 0) counts 18
  poolManager: PM,
  recent: 10, // settled rounds shown per market
  mineRounds: 40, // rounds per market looked at for a wallet
  cacheMs: 3000,
  logChunk: 9000,
  tgMinPot: 10, // a round's pot (USDC) worth a Telegram post
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Math.floor(Date.now() / 1000),
  extras: true, // badges and logos (scanner, ARCIA, coin images) — off in tests
};
let ch = null;
export function configure(o) { Object.assign(CFG, o || {}); ch = null; mem.clear(); }
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: CFG.chainId }));
const mem = new Map();
const cached = async (k, ms, fn) => { const h = mem.get(k); if (h && Date.now() - h.t < ms) return h.v; const v = await fn(); mem.set(k, { t: Date.now(), v }); return v; };
export function memStore() { const m = new Map(); return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); } }; }

// ---------------------------------------------------------------- ABI bits
const te = new TextEncoder();
const hex = (b) => Buffer.from(b).toString("hex");
const sel = (sig) => hex(keccak_256(te.encode(sig))).slice(0, 8);
const topic = (sig) => "0x" + hex(keccak_256(te.encode(sig)));
const S = {
  marketCount: sel("marketCount()"), roundCount: sel("roundCount()"), market: sel("market(uint256)"), marketKey: sel("marketKey(uint256)"),
  round: sel("round(uint256)"), roundsOf: sel("roundsOf(uint256,uint256,uint256)"), priceOf: sel("priceOf(uint256)"), bets: sel("bets(uint256,address)"),
  claimable: sel("claimable(uint256,address)"), roundOf: sel("roundOf(uint256,uint256)"), priceAt: sel("priceAt(uint256,uint256)"),
  bettingEpoch: sel("bettingEpoch(uint256)"), currentEpoch: sel("currentEpoch(uint256)"),
  refStakeOf: sel("refStakeOf(uint256,address)"), refClaimable: sel("refClaimable(uint256,address)"), referrerOf: sel("referrerOf(address)"), refEarned: sel("refEarned(address)"),
  paused: sel("paused()"), feeBps: sel("feeBps()"), refShare: sel("refShare()"), minBet: sel("minBet()"), maxBet: sel("maxBet()"), maxSide: sel("maxSide()"),
  minSamples: sel("minSamples()"), sampleGap: sel("sampleGap()"), volume: sel("volume()"), feesOwed: sel("feesOwed()"), feesPaid: sel("feesPaid()"),
  owner: sel("owner()"), operator: sel("operator()"), feeTo: sel("feeTo()"), listOpen: sel("listOpen()"), listBurn: sel("listBurn()"), minQuote: sel("minQuote(address)"),
  sample: sel("sample(uint256[])"), settle: sel("settle(uint256[])"), payFees: sel("payFees()"),
  symbol: sel("symbol()"), name: sel("name()"), decimals: sel("decimals()"),
};
const TOPIC = {
  bet: topic("BetPlaced(uint256,address,uint256,uint64,bool,uint256,address)"),
  settled: topic("RoundSettled(uint256,uint256,uint64,uint8,uint160,uint160,uint256,uint256,uint256,uint256)"),
  swap: topic("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"),
};
const strip = (h) => String(h || "").replace(/^0x/, "");
const w = (v) => BigInt(v).toString(16).padStart(64, "0");
const wa = (a) => strip(a).toLowerCase().padStart(64, "0");
const W = (h, i) => { const s = strip(h).slice(i * 64, i * 64 + 64); return s ? BigInt("0x" + s) : 0n; };
const A = (h, i) => "0x" + strip(h).slice(i * 64 + 24, i * 64 + 64);
const encIds = (ids) => w(32) + w(ids.length) + ids.map(w).join("");
function str(h) { // an ABI string (or a bytes32 one)
  try {
    const s = strip(h);
    if (!s) return "";
    if (s.length === 64) return Buffer.from(s, "hex").toString("utf8").replace(/\0+$/, "");
    const len = Number(W(h, 1));
    return Buffer.from(s.slice(128, 128 + len * 2), "hex").toString("utf8");
  } catch { return ""; }
}
const RESULT = ["open", "up", "down", "refund"];
const decRound = (id, h) => (h ? { id: Number(id), market: Number(W(h, 0)), epoch: Number(W(h, 1)), feeBps: Number(W(h, 2)), refShare: Number(W(h, 3)),
  result: RESULT[Number(W(h, 4))] || "open", openP: W(h, 5), closeP: W(h, 6), up: W(h, 7), down: W(h, 8), refStake: W(h, 9) } : null);
const usdOf = (wei) => Number(wei) / 1e18; // native USDC: 18 decimals
const call = (to, data) => ({ to, data: "0x" + data });

const metaCache = new Map();
async function tokenMeta(tokens) {
  const need = [...new Set(tokens.map(lc))].filter((t) => !metaCache.has(t));
  if (need.length) {
    const r = await chain().ethCalls(need.flatMap((t) => [call(t, S.symbol), call(t, S.name), call(t, S.decimals)]));
    need.forEach((t, i) => metaCache.set(t, { sym: str(r[i * 3]) || "?", name: str(r[i * 3 + 1]) || "", dec: r[i * 3 + 2] ? Number(W(r[i * 3 + 2], 0)) : 18 }));
  }
  return Object.fromEntries(tokens.map((t) => [lc(t), metaCache.get(lc(t))]));
}
/// a token's picture: $ARCIRCLE's own, an ArcPad launch's, else Dexscreener's (cached a day)
const logoCache = new Map();
async function logoOf(token) {
  token = lc(token);
  if (token === ARCIRCLE) return "/images/arcircle-mark-sm.png";
  const h = logoCache.get(token);
  if (h && Date.now() - h.t < 86400e3) return h.v;
  let v = null;
  try { const { getCoin } = await import("./_arc.mjs"); const c = await getCoin(token); if (c && /^https?:\/\//.test(c.imageUrl || "")) v = c.imageUrl; } catch { /* next */ }
  if (!v) {
    try {
      const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/arc/${token}`, { signal: AbortSignal.timeout(4000) });
      const j = r.ok ? await r.json() : null;
      const p = Array.isArray(j) ? j.find((x) => x && x.info && x.info.imageUrl) : null;
      v = p ? p.info.imageUrl : null;
    } catch { /* none */ }
  }
  logoCache.set(token, { t: Date.now(), v });
  return v;
}
/// the scanner's score and ARCIA's call on a token, when they're known (never computed here)
async function badgeOf(token, store) {
  const out = {};
  try { const sc = await import("./_scan.mjs"); const s = await sc.scoreOf(token, { store, compute: false }); if (s && s.score != null) out.score = s.score; } catch { /* none */ }
  try { const ag = await import("./_agent.mjs"); const c = await ag.lastCall(store, token); if (c) out.call = c.call; } catch { /* none */ }
  return out;
}

// ---------------------------------------------------------------- reads
async function reads(addr, names) {
  const r = await chain().ethCalls(names.map((n) => call(addr, S[n])));
  return Object.fromEntries(names.map((n, i) => [n, r[i]]));
}
const qDec = (c) => (lc(c) === lc(CFG.usdc) ? 6 : 18);
function pxFn(m) {
  const k = m.key || {};
  const d0 = m.tokenIs0 ? m.dec : qDec(k.currency0), d1 = m.tokenIs0 ? qDec(k.currency1) : m.dec;
  return (p) => (p ? priceOf(p, m.tokenIs0, d0, d1) : null);
}

async function marketsRaw(addr) {
  const g = await reads(addr, ["marketCount"]);
  if (g.marketCount == null) throw new Error("Arc's RPC didn't answer");
  const n = Number(W(g.marketCount, 0));
  const ids = [...Array(n).keys()];
  const per = 6;
  const r = await chain().ethCalls(ids.flatMap((i) => [call(addr, S.market + w(i)), call(addr, S.marketKey + w(i)), call(addr, S.priceOf + w(i)),
    call(addr, S.roundsOf + w(i) + w(0) + w(CFG.recent + 2)), call(addr, S.bettingEpoch + w(i)), call(addr, S.currentEpoch + w(i))]));
  return ids.map((i) => {
    const h = r[i * per], k = r[i * per + 1], p = r[i * per + 2], rs = r[i * per + 3];
    if (!h) return null;
    const nr = rs ? Number(W(rs, 1)) : 0;
    return { id: i, token: lc(A(h, 0)), lister: lc(A(h, 1)), tokenIs0: W(h, 2) === 1n, duration: Number(W(h, 3)), lock: Number(W(h, 4)), start: Number(W(h, 5)),
      stopEpoch: W(h, 6), next: Number(W(h, 7)), samples: Number(W(h, 8)), poolId: "0x" + strip(h).slice(9 * 64, 10 * 64), rounds: Number(W(h, 10)),
      key: k ? { currency0: lc(A(k, 0)), currency1: lc(A(k, 1)), fee: Number(W(k, 2)), tickSpacing: Number(BigInt.asIntN(24, W(k, 3))), hooks: lc(A(k, 4)) } : null,
      priceP: p ? W(p, 0) : 0n, roundIds: [...Array(nr).keys()].map((j) => Number(W(rs, 2 + j))),
      betting: Number(W(r[i * per + 4], 0)), current: Number(W(r[i * per + 5], 0)) };
  }).filter(Boolean);
}

/// everything the page shows
export async function state({ fresh = false, store = null } = {}) {
  const addr = CFG.address();
  if (!addr) return { live: false, chainId: CFG.chainId, note: "ARCIRCLE Predict opens once its contract is deployed on Arc." };
  if (!fresh) { const h = mem.get("state"); if (h && Date.now() - h.t < CFG.cacheMs) return h.v; }
  const g = await reads(addr, ["roundCount", "paused", "feeBps", "refShare", "minBet", "maxBet", "maxSide", "volume", "feesOwed", "feesPaid", "owner", "operator", "feeTo", "listOpen", "listBurn"]);
  const mq = await chain().ethCalls([call(addr, S.minQuote + wa(CFG.usdc))]);
  const ms = await marketsRaw(addr);
  for (const m of ms) Object.assign(m, (await tokenMeta([m.token]))[m.token] || { sym: "?", name: "", dec: 18 });
  // the live round (current epoch) and the round open for bets (current or next): their round ids and boundary prices
  const q = ms.flatMap((m) => [call(addr, S.roundOf + w(m.id) + w(m.current)), call(addr, S.roundOf + w(m.id) + w(m.betting)), call(addr, S.priceAt + w(m.id) + w(m.current))]);
  const qr = q.length ? await chain().ethCalls(q) : [];
  ms.forEach((m, i) => { m.liveId = qr[i * 3] ? Number(W(qr[i * 3], 0)) : 0; m.betId = qr[i * 3 + 1] ? Number(W(qr[i * 3 + 1], 0)) : 0; m.openP = qr[i * 3 + 2] ? W(qr[i * 3 + 2], 0) : 0n; });
  const allRounds = [...new Set(ms.flatMap((m) => [...m.roundIds, m.liveId, m.betId]).filter(Boolean))];
  const rr = allRounds.length ? await chain().ethCalls(allRounds.map((id) => call(addr, S.round + w(id)))) : [];
  const R = new Map(allRounds.map((id, i) => [id, decRound(id, rr[i])]));
  const lb = await chain().latestBlock().catch(() => ({ ts: CFG.now() }));
  const extras = CFG.extras ? await Promise.all(ms.map(async (m) => ({ logo: await logoOf(m.token).catch(() => null), badge: await badgeOf(m.token, store).catch(() => ({})) }))) : ms.map(() => ({}));
  const out = {
    live: true, address: addr, chainId: CFG.chainId, now: lb.ts, paused: g.paused ? W(g.paused, 0) === 1n : false,
    feeBps: Number(W(g.feeBps, 0)), refShare: Number(W(g.refShare, 0)),
    limits: { minBet: usdOf(W(g.minBet, 0)), maxBet: usdOf(W(g.maxBet, 0)), maxSide: usdOf(W(g.maxSide, 0)) },
    volume: usdOf(W(g.volume, 0)), fees: usdOf(W(g.feesOwed, 0) + W(g.feesPaid, 0)), rounds: Number(W(g.roundCount, 0)),
    owner: g.owner ? lc(A(g.owner, 0)) : null, operator: g.operator ? lc(A(g.operator, 0)) : null, feeTo: g.feeTo ? lc(A(g.feeTo, 0)) : null,
    listing: { open: g.listOpen ? W(g.listOpen, 0) === 1n : false, burn: g.listBurn ? Number(W(g.listBurn, 0) / 10n ** 14n) / 1e4 : 0, minUsdc: mq[0] ? Number(W(mq[0], 0)) / 1e6 : null },
    markets: ms.map((m, i) => {
      const px = pxFn(m);
      const at = (e) => m.start + e * m.duration;
      const stopped = m.stopEpoch < 2n ** 63n;
      const rd = (id) => R.get(id) || null;
      const live = (() => {
        const r = rd(m.liveId), e = m.current;
        return { epoch: e, id: m.liveId || null, startAt: at(e), lockAt: at(e + 1) - m.lock, endAt: at(e + 1), open: m.next > e ? px(m.openP) : null, openPending: m.next <= e,
          up: r ? usdOf(r.up) : 0, down: r ? usdOf(r.down) : 0, betting: m.betting === e && (!stopped || BigInt(e) < m.stopEpoch) };
      })();
      const nx = m.betting > m.current && (!stopped || BigInt(m.betting) < m.stopEpoch) ? (() => {
        const r = rd(m.betId), e = m.betting;
        return { epoch: e, id: m.betId || null, startAt: at(e), lockAt: at(e + 1) - m.lock, endAt: at(e + 1), up: r ? usdOf(r.up) : 0, down: r ? usdOf(r.down) : 0 };
      })() : null;
      const past = m.roundIds.map((id) => rd(id)).filter((r) => r && r.result !== "open").slice(0, CFG.recent).map((r) => ({
        id: r.id, epoch: r.epoch, result: r.result, endAt: at(r.epoch + 1), open: px(r.openP), close: px(r.closeP), up: usdOf(r.up), down: usdOf(r.down), feeBps: r.feeBps }));
      return { id: m.id, token: m.token, sym: m.sym, name: m.name, dec: m.dec, logo: extras[i].logo || null, badge: extras[i].badge || {}, lister: m.lister,
        duration: m.duration, lock: m.lock, start: m.start, stopped, poolId: m.poolId, key: m.key, price: px(m.priceP), rounds: m.rounds,
        betting: stopped && BigInt(m.betting) >= m.stopEpoch ? null : m.betting, live, next: nx, past };
    }),
  };
  mem.set("state", { t: Date.now(), v: out });
  return out;
}

/// a wallet's recent bets, what it can claim, its referrals and its stats
export async function mine(user, { rounds = CFG.mineRounds, store = null } = {}) {
  const addr = CFG.address();
  if (!addr) return { live: false, items: [] };
  if (!isAddr(user)) return { error: "a wallet address (0x…)" };
  const g = await reads(addr, ["marketCount"]);
  const n = Number(W(g.marketCount, 0));
  const rs = n ? await chain().ethCalls([...Array(n).keys()].map((i) => call(addr, S.roundsOf + w(i) + w(0) + w(rounds)))) : [];
  const ids = rs.flatMap((h) => (h ? [...Array(Number(W(h, 1))).keys()].map((j) => Number(W(h, 2 + j))) : []));
  const head = await chain().ethCalls([call(addr, S.referrerOf + wa(user)), call(addr, S.refEarned + wa(user))]);
  const ref = { referrer: head[0] && W(head[0], 0) > 0n ? lc(A(head[0], 0)) : null, earned: head[1] ? usdOf(W(head[1], 0)) : 0, claimable: 0, claimIds: [], invited: 0 };
  let items = [];
  if (ids.length) {
    const r = await chain().ethCalls(ids.flatMap((id) => [call(addr, S.bets + w(id) + wa(user)), call(addr, S.claimable + w(id) + wa(user)), call(addr, S.refStakeOf + w(id) + wa(user)), call(addr, S.refClaimable + w(id) + wa(user))]));
    const mineIds = ids.filter((_, i) => r[i * 4] && (W(r[i * 4], 0) > 0n || W(r[i * 4], 1) > 0n));
    const rr = mineIds.length ? await chain().ethCalls(mineIds.map((id) => call(addr, S.round + w(id)))) : [];
    items = mineIds.map((id, j) => {
      const i = ids.indexOf(id), b = r[i * 4], rd = decRound(id, rr[j]);
      const up = W(b, 0), down = W(b, 1);
      return { round: id, market: rd ? rd.market : null, epoch: rd ? rd.epoch : null, side: up > 0n ? "up" : "down", stake: usdOf(up + down), result: rd ? rd.result : "open",
        claimable: r[i * 4 + 1] ? usdOf(W(r[i * 4 + 1], 0)) : 0, claimed: W(b, 2) === 1n,
        pot: rd ? usdOf(rd.up + rd.down) : 0, sidePot: rd ? usdOf(up > 0n ? rd.up : rd.down) : 0, feeBps: rd ? rd.feeBps : 0 };
    }).sort((a, b) => b.round - a.round);
    ids.forEach((id, i) => {
      const rc = r[i * 4 + 3] ? usdOf(W(r[i * 4 + 3], 0)) : 0;
      if (r[i * 4 + 2] && W(r[i * 4 + 2], 0) > 0n) ref.invited += 1;
      if (rc > 0) { ref.claimable += rc; ref.claimIds.push(id); }
    });
  }
  const lbd = await lbDoc(store).catch(() => null);
  const st = lbd && lbd.users ? lbd.users[lc(user)] || null : null;
  return { live: true, items, claimable: items.reduce((s, x) => s + x.claimable, 0), claimIds: items.filter((x) => x.claimable > 0).map((x) => x.round), ref,
    stats: st ? { pnl: st.pnl, vol: st.vol, n: st.n, wins: st.w, losses: st.l, streak: st.s, best: st.b, week: (st.wk && st.wk[weekKey()]) || { pnl: 0, vol: 0 } } : null };
}

// ---------------------------------------------------------------- block ↔ time
async function blockRate() {
  return cached("rate", 600e3, async () => {
    const lb = await chain().latestBlock();
    const back = Math.max(0, lb.number - 20000);
    const b = await chain().rpcCall("eth_getBlockByNumber", ["0x" + back.toString(16), false]).catch(() => null);
    const sec = b ? (lb.ts - parseInt(b.timestamp, 16)) / Math.max(1, lb.number - back) : 0.5;
    return sec > 0 ? sec : 0.5;
  });
}
async function headTime() { return cached("head", 1500, () => chain().latestBlock()); }
const blockAt = (head, rate, t) => Math.max(0, Math.floor(head.number - (head.ts - t) / rate));
const timeAt = (head, rate, n) => Math.round(head.ts - (head.number - n) * rate);
async function logsRange(filter, from, to) {
  const out = [];
  for (let a = from; a <= to; a += CFG.logChunk) {
    const b = Math.min(to, a + CFG.logChunk - 1);
    out.push(...((await chain().getLogs({ ...filter, fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) })) || []));
  }
  return out;
}

/// the pool's price through the live round: its swaps, in dollars ([t, price] pairs)
export async function chart(m) {
  const addr = CFG.address();
  if (!addr) return { live: false, points: [] };
  m = Number(m);
  return cached("chart" + m, CFG.cacheMs, async () => {
    const st = await state();
    const mk = st.markets.find((x) => x.id === m);
    if (!mk) return { error: "no such market" };
    const [head, rate] = await Promise.all([headTime(), blockRate()]);
    const from = Math.max(mk.live.startAt - Math.round(mk.duration / 2), 0);
    const logs = await logsRange({ address: CFG.poolManager, topics: [TOPIC.swap, mk.poolId] }, blockAt(head, rate, from), head.number).catch(() => []);
    const px = pxFn({ ...mk, tokenIs0: mk.key ? lc(mk.key.currency0) === mk.token : false });
    const points = logs.map((l) => [timeAt(head, rate, parseInt(l.blockNumber, 16)), px(W(l.data, 2))]).filter((p) => p[1] > 0);
    return { live: true, market: m, from, now: head.ts, open: mk.live.open, price: mk.price, startAt: mk.live.startAt, endAt: mk.live.endAt, points: points.slice(-400) };
  });
}

/// the latest bets on every market
export async function feed({ limit = 30 } = {}) {
  const addr = CFG.address();
  if (!addr) return { live: false, items: [] };
  return cached("feed", CFG.cacheMs, async () => {
    const [head, rate] = await Promise.all([headTime(), blockRate()]);
    const logs = await logsRange({ address: addr, topics: [TOPIC.bet] }, Math.max(0, head.number - Math.max(2000, Math.round(3600 / rate))), head.number).catch(() => []);
    const items = logs.slice(-limit).reverse().map((l) => ({ round: Number(BigInt(l.topics[1])), user: lc("0x" + l.topics[2].slice(26)), market: Number(BigInt(l.topics[3])),
      epoch: Number(W(l.data, 0)), up: W(l.data, 1) === 1n, amount: usdOf(W(l.data, 2)), t: timeAt(head, rate, parseInt(l.blockNumber, 16)), tx: lc(l.transactionHash) }));
    return { live: true, items };
  });
}

// ---------------------------------------------------------------- leaderboard
const LB = "predict/lb";
function weekKey(t = CFG.now()) { const d = new Date(t * 1000); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); } // the week's Monday (UTC)
let lbMem = null;
async function lbDoc(store) {
  if (store) { const d = await store.get(LB).catch(() => null); if (d) return typeof d.j === "string" ? JSON.parse(d.j) : d; }
  return lbMem;
}
async function lbSave(store, d) { lbMem = d; if (store) await store.set(LB, { j: JSON.stringify(d) }).catch(() => null); }
/// read new BetPlaced / RoundSettled logs and fold settled rounds into each wallet's numbers
export async function lbScan(store, { budgetMs = 8000 } = {}) {
  const addr = CFG.address();
  if (!addr) return null;
  const t0 = Date.now();
  const head = await chain().latestBlock();
  let d = await lbDoc(store);
  if (!d || d.addr !== addr) d = { addr, cursor: Math.max(0, (CFG.fromBlock() || head.number - 50000) - 1), users: {}, pend: {}, rounds: 0 };
  const wk = weekKey();
  while (d.cursor < head.number && Date.now() - t0 < budgetMs) {
    const to = Math.min(head.number, d.cursor + CFG.logChunk);
    const logs = (await chain().getLogs({ address: addr, topics: [[TOPIC.bet, TOPIC.settled]], fromBlock: "0x" + (d.cursor + 1).toString(16), toBlock: "0x" + to.toString(16) })) || [];
    logs.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16));
    for (const l of logs) {
      const rid = String(BigInt(l.topics[1]));
      if (l.topics[0] === TOPIC.bet) (d.pend[rid] = d.pend[rid] || []).push([lc("0x" + l.topics[2].slice(26)), W(l.data, 1) === 1n ? 1 : 0, usdOf(W(l.data, 2))]);
      else {
        const res = Number(W(l.data, 1)), up = usdOf(W(l.data, 4)), down = usdOf(W(l.data, 5)), fee = usdOf(W(l.data, 6));
        const bets = d.pend[rid] || [];
        delete d.pend[rid];
        d.rounds += 1;
        for (const [u, side, amt] of bets) {
          const x = (d.users[u] = d.users[u] || { pnl: 0, vol: 0, n: 0, w: 0, l: 0, s: 0, b: 0, wk: {} });
          const k = (x.wk[wk] = x.wk[wk] || { pnl: 0, vol: 0 });
          x.vol += amt; x.n += 1; k.vol += amt;
          if (res === 1 || res === 2) {
            const won = (res === 1) === (side === 1);
            const winPot = res === 1 ? up : down;
            const pnl = won ? (amt * (up + down - fee)) / winPot - amt : -amt;
            x.pnl += pnl; k.pnl += pnl;
            if (won) { x.w += 1; x.s += 1; x.b = Math.max(x.b, x.s); } else { x.l += 1; x.s = 0; }
          }
          for (const key of Object.keys(x.wk)) if (key < weekKey(CFG.now() - 14 * 86400)) delete x.wk[key];
        }
      }
    }
    d.cursor = to;
  }
  // keep the doc small: the 1,500 busiest wallets
  const us = Object.entries(d.users);
  if (us.length > 1500) d.users = Object.fromEntries(us.sort((a, b) => b[1].vol - a[1].vol).slice(0, 1500));
  d.at = CFG.now();
  await lbSave(store, d);
  return d;
}
export async function leaderboard(store) {
  const d = await lbDoc(store);
  if (!d) return { live: !!CFG.address(), week: [], all: [], at: null };
  const wk = weekKey();
  const row = ([u, x], wkOnly) => ({ user: u, pnl: wkOnly ? (x.wk[wk] || {}).pnl || 0 : x.pnl, vol: wkOnly ? (x.wk[wk] || {}).vol || 0 : x.vol, n: x.n, wins: x.w, losses: x.l, best: x.b });
  const us = Object.entries(d.users || {});
  const week = us.map((e) => row(e, true)).filter((r) => r.vol > 0).sort((a, b) => b.pnl - a.pnl).slice(0, 25);
  const all = us.map((e) => row(e, false)).sort((a, b) => b.pnl - a.pnl).slice(0, 25);
  const streaks = us.map(([u, x]) => ({ user: u, best: x.b, streak: x.s })).sort((a, b) => b.best - a.best).slice(0, 10);
  return { live: true, weekOf: wk, week, all, streaks, players: us.length, rounds: d.rounds, at: d.at };
}

// ---------------------------------------------------------------- the keeper
/// sample every market whose boundary is due (three times, in different blocks), then settle them
export async function tick({ budgetMs = 40000, store = null } = {}) {
  const t0 = Date.now();
  const addr = CFG.address(), key = CFG.keeperKey();
  if (!addr) return { skipped: "no contract" };
  if (!key) return { skipped: "no keeper key (PREDICT_KEEPER_KEY or ORDERS_KEEPER_KEY)" };
  const g = await reads(addr, ["operator", "owner", "minSamples", "sampleGap", "feesOwed"]);
  const me = lc(addressOfKey(key));
  if (me !== lc(A(g.operator, 0)) && me !== lc(A(g.owner, 0))) return { skipped: `the keeper key (${me.slice(0, 6)}…${me.slice(-4)}) isn't the contract's operator` };
  const need = Math.max(1, Number(W(g.minSamples, 0))), gap = Number(W(g.sampleGap, 0));
  const ms = await marketsRaw(addr);
  const lb = await chain().latestBlock();
  // a boundary is due from its time until 2 minutes after; a market whose window passed is due too (the contract skips ahead)
  const due = ms.filter((m) => m.stopEpoch >= BigInt(m.next) && lb.ts >= m.start + m.next * m.duration).map((m) => m.id);
  const out = { due: due.length, sampled: 0, settled: null, txs: [] };
  const send = async (data, kind) => {
    const r = await chain().sendTx({ to: addr, data: "0x" + data, key }).catch((e) => ({ ok: false, err: String((e && e.message) || e).slice(0, 160) }));
    out.txs.push({ kind, hash: r.hash || null, ok: r.ok, err: r.err });
    return r;
  };
  if (due.length) {
    for (let k = 0; k < need + 1; k++) { // one spare sample in case two land in one block
      if (Date.now() - t0 > budgetMs - 8000) break;
      const r = await send(S.sample + encIds(due), "sample");
      if (r.ok) out.sampled++;
      if (out.sampled >= need) break;
      await CFG.sleep((gap + 1) * 1000);
    }
    const r = await send(S.settle + encIds(due), "settle");
    out.settled = r.ok;
    if (r.ok && r.receipt) await announce(r.receipt, ms).catch(() => null);
  }
  // the fees, once an hour: to ArcircleFeeBurn (its keeper burns half of it as $ARCIRCLE)
  const st = (store && (await store.get("predict/status").catch(() => null))) || {};
  if (W(g.feesOwed, 0) >= 10n ** 18n && CFG.now() - (st.feesAt || 0) > 3600 && Date.now() - t0 < budgetMs - 4000) {
    st.feesAt = CFG.now();
    const r = await send(S.payFees, "fees");
    if (r.ok) st.fees = { at: CFG.now(), usdc: usdOf(W(g.feesOwed, 0)), tx: r.hash };
  }
  if (Date.now() - t0 < budgetMs - 3000) { try { await lbScan(store, { budgetMs: Math.min(8000, budgetMs - (Date.now() - t0) - 2000) }); } catch (e) { out.lbError = String((e && e.message) || e).slice(0, 120); } }
  st.at = lb.ts; st.keeper = me; st.last = { due: out.due, sampled: out.sampled, settled: out.settled };
  try { const gas = await chain().balance(me); st.gas = Number(gas) / 1e18; } catch { /* keep */ }
  if (store) await store.set("predict/status", st).catch(() => null);
  out.status = st;
  mem.clear();
  return out;
}
export async function status(store) { return (store && (await store.get("predict/status").catch(() => null))) || null; }

/// big rounds to the Telegram channel (PREDICT_TG_CHAT): "▲ UP won $PLAIN 5m · pot $42 · +3.2%"
async function announce(receipt, ms) {
  const chat = env("PREDICT_TG_CHAT");
  if (!chat) return;
  const addr = CFG.address();
  const evs = (receipt.logs || []).filter((l) => lc(l.address) === addr && l.topics && l.topics[0] === TOPIC.settled);
  const { tg, h } = await import("./_tg-lib.mjs");
  for (const l of evs.slice(0, 3)) {
    const res = Number(W(l.data, 1)), pot = usdOf(W(l.data, 4) + W(l.data, 5));
    if ((res !== 1 && res !== 2) || pot < CFG.tgMinPot) continue;
    const m = ms.find((x) => x.id === Number(BigInt(l.topics[2])));
    if (!m) continue;
    const meta = (await tokenMeta([m.token]))[m.token] || {};
    const px = pxFn({ ...m, dec: meta.dec || 18 });
    const o = px(W(l.data, 2)), c = px(W(l.data, 3));
    const ch = o && c ? ((c / o - 1) * 100) : null;
    const text = `${res === 1 ? "▲ <b>UP</b>" : "▼ <b>DOWN</b>"} won · <b>$${h(meta.sym || "?")}</b> ${m.duration % 3600 === 0 ? m.duration / 3600 + "h" : m.duration / 60 + "m"} round\nPot <b>$${pot.toFixed(2)}</b>${ch != null ? ` · ${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%` : ""}\n\nNext round is open → https://www.arcircle.app/arc#predict?m=${m.id}`;
    await tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }).catch(() => null);
  }
}

/// one round for a share card: the round, its market and (with a wallet) that wallet's bet
export async function roundCard(id, user) {
  const addr = CFG.address();
  if (!addr || !/^\d{1,9}$/.test(String(id))) return null;
  const [rh] = await chain().ethCalls([call(addr, S.round + w(id))]);
  const r = decRound(id, rh);
  if (!r) return null;
  const ms = await marketsRaw(addr);
  const m = ms.find((x) => x.id === r.market);
  if (!m) return null;
  const meta = (await tokenMeta([m.token]))[m.token] || {};
  const px = pxFn({ ...m, dec: meta.dec || 18 });
  let bet = null;
  if (isAddr(user)) {
    const [b, c] = await chain().ethCalls([call(addr, S.bets + w(id) + wa(user)), call(addr, S.claimable + w(id) + wa(user))]);
    if (b && (W(b, 0) > 0n || W(b, 1) > 0n)) {
      const stake = usdOf(W(b, 0) + W(b, 1)), side = W(b, 0) > 0n ? "up" : "down";
      const won = r.result === side;
      const payout = won ? (stake * usdOf(r.up + r.down) * (1 - r.feeBps / 10000)) / usdOf(side === "up" ? r.up : r.down) : 0;
      bet = { side, stake, won, payout, claimable: c ? usdOf(W(c, 0)) : 0 };
    }
  }
  return { id: r.id, market: m.id, sym: meta.sym || "?", duration: m.duration, result: r.result, open: px(r.openP), close: px(r.closeP), pot: usdOf(r.up + r.down), up: usdOf(r.up), down: usdOf(r.down), bet };
}

export const _test = { sel, encIds, decRound, weekKey, TOPIC };
