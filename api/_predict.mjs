// api/_predict.mjs — ARCIRCLE Predict (contracts/ArcPredict.sol): UP / DOWN rounds on Arc tokens, paid in USDC.
// Every market follows one token's Uniswap v4 USDC pool; rounds run back to back (5 minutes, 15 minutes, an hour).
//   state()          every market with its running round, its price in dollars and its last results (cached a few s)
//   mine(user)       a wallet's bets in each market's recent rounds, with what it can claim
//   tick()           the keeper (PREDICT_KEEPER_KEY, else ORDERS_KEEPER_KEY — the contract's operator): for every market
//                    whose round has ended (or that has none yet), samples the pool three times in different blocks,
//                    then settles — the contract closes the round on the median and opens the next one on it.
//                    Prices only ever come from the pool; the keeper decides when to look, never what it sees.
// Contract: env PREDICT_ADDRESS, else PREDICT_DEFAULT below (set once it's deployed).
import { evmChain, addressOfKey } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { priceOf } from "./_liq-core.mjs";

export const PREDICT_DEFAULT = "";
const env = (k) => String(process.env[k] || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const USDC = "0x3600000000000000000000000000000000000000";
export const CFG = {
  rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  chainId: 5042,
  address: () => { const e = env("PREDICT_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : PREDICT_DEFAULT ? lc(PREDICT_DEFAULT) : null; },
  usdc: USDC, // the ERC-20 face of USDC (6 decimals); a pool paired with native USDC (address 0) counts 18
  keeperKey: () => env("PREDICT_KEEPER_KEY") || env("ORDERS_KEEPER_KEY") || null,
  recent: 8, // settled rounds shown per market
  mineRounds: 40, // rounds per market looked at for a wallet
  cacheMs: 4000,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};
let ch = null;
export function configure(o) { Object.assign(CFG, o || {}); ch = null; mem.clear(); }
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: CFG.chainId }));
const mem = new Map();

// ---------------------------------------------------------------- ABI bits
const te = new TextEncoder();
const sel = (sig) => Buffer.from(keccak_256(te.encode(sig))).subarray(0, 4).toString("hex");
const S = {
  marketCount: sel("marketCount()"), roundCount: sel("roundCount()"), market: sel("market(uint256)"), marketKey: sel("marketKey(uint256)"),
  round: sel("round(uint256)"), roundsOf: sel("roundsOf(uint256,uint256,uint256)"), priceOf: sel("priceOf(uint256)"), bets: sel("bets(uint256,address)"),
  claimable: sel("claimable(uint256,address)"), paused: sel("paused()"), feeBps: sel("feeBps()"), minBet: sel("minBet()"), maxBet: sel("maxBet()"),
  maxSide: sel("maxSide()"), lockSecs: sel("lockSecs()"), minSamples: sel("minSamples()"), sampleGap: sel("sampleGap()"), volume: sel("volume()"),
  feesOwed: sel("feesOwed()"), feesPaid: sel("feesPaid()"), owner: sel("owner()"), operator: sel("operator()"),
  sample: sel("sample(uint256[])"), settle: sel("settle(uint256[])"),
  symbol: sel("symbol()"), name: sel("name()"), decimals: sel("decimals()"),
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
const decRound = (id, h) => (h ? { id: Number(id), market: Number(W(h, 0)), feeBps: Number(W(h, 1)), result: RESULT[Number(W(h, 2))] || "open",
  startAt: Number(W(h, 3)), lockAt: Number(W(h, 4)), endAt: Number(W(h, 5)), openP: W(h, 6), closeP: W(h, 7), up: W(h, 8), down: W(h, 9) } : null);
const usdOf = (wei) => Number(wei) / 1e18; // native USDC: 18 decimals

const metaCache = new Map();
async function tokenMeta(tokens) {
  const need = tokens.filter((t) => !metaCache.has(lc(t)));
  if (need.length) {
    const r = await chain().ethCalls(need.flatMap((t) => [{ to: t, data: "0x" + S.symbol }, { to: t, data: "0x" + S.name }, { to: t, data: "0x" + S.decimals }]));
    need.forEach((t, i) => metaCache.set(lc(t), { sym: str(r[i * 3]) || "?", name: str(r[i * 3 + 1]) || "", dec: r[i * 3 + 2] ? Number(W(r[i * 3 + 2], 0)) : 18 }));
  }
  return Object.fromEntries(tokens.map((t) => [lc(t), metaCache.get(lc(t))]));
}

// ---------------------------------------------------------------- reads
async function reads(addr, names) {
  const r = await chain().ethCalls(names.map((n) => ({ to: addr, data: "0x" + S[n] })));
  return Object.fromEntries(names.map((n, i) => [n, r[i]]));
}

/// everything the page shows
export async function state({ fresh = false } = {}) {
  const addr = CFG.address();
  if (!addr) return { live: false, chainId: CFG.chainId, note: "ARCIRCLE Predict opens once its contract is deployed on Arc." };
  const hit = mem.get("state");
  if (!fresh && hit && Date.now() - hit.t < CFG.cacheMs) return hit.v;
  const g = await reads(addr, ["marketCount", "roundCount", "paused", "feeBps", "minBet", "maxBet", "maxSide", "lockSecs", "volume", "feesOwed", "feesPaid", "owner", "operator"]);
  if (g.marketCount == null) throw new Error("Arc's RPC didn't answer");
  const n = Number(W(g.marketCount, 0));
  const ids = [...Array(n).keys()];
  const mr = await chain().ethCalls(ids.flatMap((i) => [{ to: addr, data: "0x" + S.market + w(i) }, { to: addr, data: "0x" + S.marketKey + w(i) }, { to: addr, data: "0x" + S.priceOf + w(i) }, { to: addr, data: "0x" + S.roundsOf + w(i) + w(0) + w(CFG.recent + 1) }]));
  const markets = ids.map((i) => {
    const h = mr[i * 4], k = mr[i * 4 + 1], p = mr[i * 4 + 2], rs = mr[i * 4 + 3];
    if (!h) return null;
    const nr = rs ? Number(W(rs, 1)) : 0;
    return { id: i, token: lc(A(h, 0)), tokenIs0: W(h, 1) === 1n, active: W(h, 2) === 1n, duration: Number(W(h, 3)), cur: Number(W(h, 4)), samples: Number(W(h, 5)), poolId: "0x" + strip(h).slice(7 * 64, 8 * 64), rounds: Number(W(h, 8)),
      key: k ? { currency0: lc(A(k, 0)), currency1: lc(A(k, 1)), fee: Number(W(k, 2)), tickSpacing: Number(BigInt.asIntN(24, W(k, 3))), hooks: lc(A(k, 4)) } : null,
      priceP: p ? W(p, 0) : 0n, roundIds: [...Array(nr).keys()].map((j) => Number(W(rs, 2 + j))) };
  }).filter(Boolean);
  const meta = await tokenMeta(markets.map((m) => m.token));
  const allRounds = [...new Set(markets.flatMap((m) => m.roundIds))];
  const rr = allRounds.length ? await chain().ethCalls(allRounds.map((id) => ({ to: addr, data: "0x" + S.round + w(id) }))) : [];
  const R = new Map(allRounds.map((id, i) => [id, decRound(id, rr[i])]));
  const lb = await chain().latestBlock().catch(() => ({ ts: Math.floor(Date.now() / 1000) }));
  const out = {
    live: true, address: addr, chainId: CFG.chainId, now: lb.ts, paused: g.paused ? W(g.paused, 0) === 1n : false, feeBps: Number(W(g.feeBps, 0)),
    limits: { minBet: usdOf(W(g.minBet, 0)), maxBet: usdOf(W(g.maxBet, 0)), maxSide: usdOf(W(g.maxSide, 0)), lockSecs: Number(W(g.lockSecs, 0)) },
    volume: usdOf(W(g.volume, 0)), fees: usdOf(W(g.feesOwed, 0) + W(g.feesPaid, 0)), rounds: Number(W(g.roundCount, 0)),
    owner: g.owner ? lc(A(g.owner, 0)) : null, operator: g.operator ? lc(A(g.operator, 0)) : null,
    markets: markets.map((m) => {
      const md = meta[m.token] || { sym: "?", name: "", dec: 18 };
      const k = m.key || {};
      const qDec = (c) => (c === lc(CFG.usdc) ? 6 : 18); // ERC-20 face of USDC: 6; native USDC (address 0): 18
      const d0 = m.tokenIs0 ? md.dec : qDec(k.currency0), d1 = m.tokenIs0 ? qDec(k.currency1) : md.dec;
      const px = (p) => (p ? priceOf(p, m.tokenIs0, d0, d1) : null);
      const pub = (r) => r && { id: r.id, result: r.result, startAt: r.startAt, lockAt: r.lockAt, endAt: r.endAt, open: px(r.openP), close: r.closeP ? px(r.closeP) : null,
        up: usdOf(r.up), down: usdOf(r.down), feeBps: r.feeBps };
      const cur = m.cur ? pub(R.get(m.cur)) : null;
      const past = m.roundIds.filter((id) => id !== m.cur).map((id) => pub(R.get(id))).filter((r) => r && r.result !== "open").slice(0, CFG.recent);
      return { id: m.id, token: m.token, sym: md.sym, name: md.name, dec: md.dec, active: m.active, duration: m.duration, poolId: m.poolId, key: m.key,
        price: px(m.priceP), rounds: m.rounds, samples: m.samples, cur, past };
    }),
  };
  mem.set("state", { t: Date.now(), v: out });
  return out;
}

/// a wallet's bets in each market's recent rounds: { items: [{round, market, side, stake, result, claimable, claimed}], claimable }
export async function mine(user, { rounds = CFG.mineRounds } = {}) {
  const addr = CFG.address();
  if (!addr) return { live: false, items: [] };
  if (!isAddr(user)) return { error: "a wallet address (0x…)" };
  const g = await reads(addr, ["marketCount"]);
  const n = Number(W(g.marketCount, 0));
  const rs = await chain().ethCalls([...Array(n).keys()].map((i) => ({ to: addr, data: "0x" + S.roundsOf + w(i) + w(0) + w(rounds) })));
  const ids = rs.flatMap((h) => (h ? [...Array(Number(W(h, 1))).keys()].map((j) => Number(W(h, 2 + j))) : []));
  if (!ids.length) return { live: true, items: [], claimable: 0 };
  const r = await chain().ethCalls(ids.flatMap((id) => [{ to: addr, data: "0x" + S.bets + w(id) + wa(user) }, { to: addr, data: "0x" + S.claimable + w(id) + wa(user) }]));
  const mineIds = ids.filter((_, i) => r[i * 2] && (W(r[i * 2], 0) > 0n || W(r[i * 2], 1) > 0n));
  const rr = mineIds.length ? await chain().ethCalls(mineIds.map((id) => ({ to: addr, data: "0x" + S.round + w(id) }))) : [];
  const items = mineIds.map((id, j) => {
    const i = ids.indexOf(id), b = r[i * 2], rd = decRound(id, rr[j]);
    const up = W(b, 0), down = W(b, 1);
    return { round: id, market: rd ? rd.market : null, side: up > 0n ? "up" : "down", stake: usdOf(up + down), result: rd ? rd.result : "open",
      endAt: rd ? rd.endAt : 0, claimable: r[i * 2 + 1] ? usdOf(W(r[i * 2 + 1], 0)) : 0, claimed: W(b, 2) === 1n };
  }).sort((a, b) => b.round - a.round);
  return { live: true, items, claimable: items.reduce((s, x) => s + x.claimable, 0), claimIds: items.filter((x) => x.claimable > 0).map((x) => x.round) };
}

// ---------------------------------------------------------------- the keeper
/// sample every due market three times (in different blocks), then settle them
export async function tick({ budgetMs = 40000 } = {}) {
  const t0 = Date.now();
  const addr = CFG.address(), key = CFG.keeperKey();
  if (!addr) return { skipped: "no contract" };
  if (!key) return { skipped: "no keeper key (PREDICT_KEEPER_KEY or ORDERS_KEEPER_KEY)" };
  const g = await reads(addr, ["marketCount", "operator", "owner", "minSamples", "sampleGap"]);
  const me = lc(addressOfKey(key));
  if (me !== lc(A(g.operator, 0)) && me !== lc(A(g.owner, 0))) return { skipped: `the keeper key (${me.slice(0, 6)}…${me.slice(-4)}) isn't the contract's operator` };
  const n = Number(W(g.marketCount, 0)), need = Math.max(1, Number(W(g.minSamples, 0))), gap = Number(W(g.sampleGap, 0));
  const ids = [...Array(n).keys()];
  const mr = await chain().ethCalls(ids.map((i) => ({ to: addr, data: "0x" + S.market + w(i) })));
  const lb = await chain().latestBlock();
  const curIds = ids.map((i) => (mr[i] ? Number(W(mr[i], 4)) : 0));
  const rr = await chain().ethCalls(curIds.map((c) => (c ? { to: addr, data: "0x" + S.round + w(c) } : { to: addr, data: "0x" + S.roundCount })));
  const due = ids.filter((i) => {
    if (!mr[i]) return false;
    const active = W(mr[i], 2) === 1n, cur = curIds[i];
    if (!cur) return active;
    const r = decRound(cur, rr[i]);
    return r && lb.ts >= r.endAt;
  });
  if (!due.length) return { due: 0 };
  const out = { due: due.length, sampled: 0, settled: null, txs: [] };
  for (let k = 0; k < need + 1; k++) { // one spare sample in case a block is shared
    if (Date.now() - t0 > budgetMs - 6000) break;
    const r = await chain().sendTx({ to: addr, data: "0x" + S.sample + encIds(due), key }).catch((e) => ({ ok: false, err: String((e && e.message) || e).slice(0, 160) }));
    out.txs.push({ kind: "sample", hash: r.hash || null, ok: r.ok, err: r.err });
    if (r.ok) out.sampled++;
    if (out.sampled >= need) break;
    await CFG.sleep((gap + 1) * 1000);
  }
  const r = await chain().sendTx({ to: addr, data: "0x" + S.settle + encIds(due), key }).catch((e) => ({ ok: false, err: String((e && e.message) || e).slice(0, 160) }));
  out.txs.push({ kind: "settle", hash: r.hash || null, ok: r.ok, err: r.err });
  out.settled = r.ok;
  mem.clear();
  return out;
}

export const _test = { sel, encIds, decRound };
