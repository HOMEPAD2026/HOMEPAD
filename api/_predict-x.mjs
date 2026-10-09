// api/_predict-x.mjs — ARCIRCLE Predict × (contracts/ArcPredictBands.sol): multiplier rounds on Arc tokens.
// The same schedule and keeper as ARCIRCLE Predict (api/_predict.mjs), with up to four bands instead of UP / DOWN —
// by default "down more than x%", "down", "up", "up more than x%" (x = 1% for 5 minutes, 2% for 15, 5% for an hour).
// Each band has its own pool and the winning band splits the whole pot, so the far bands pay a multiple of the near ones.
//   state()      every market: the live round (price to beat, pools, the band it's in now) and the round open for bets
//                (pools and each band's multiplier), the last results
//   mine(user)   a wallet's bets in recent rounds and what it can claim
//   tick()       the keeper — run from the Predict cron job after Predict's own tick: samples each due boundary three
//                times in different blocks and settles on the median, pushes the fees once an hour, and keeps
//                $ARCIRCLE's 5m / 15m / 1h markets open
// Env PREDICTX_ADDRESS ("none" turns it off), else PREDICTX_DEFAULT; keeper PREDICT_KEEPER_KEY, else ORDERS_KEEPER_KEY.
import { evmChain, addressOfKey } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { priceOf } from "./_liq-core.mjs";

export const PREDICTX_DEFAULT = "0x4C271594f8382BaCeAfB484a7D761ecd82946D64"; // ArcPredictBands, deploy-arc-predict-bands.js, 2026-10-10 (block 25128713)
const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const USDC = "0x3600000000000000000000000000000000000000";
const ARCIRCLE = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7";
const DURS = [300, 900, 3600];
const U64 = 2n ** 63n;
const te = new TextEncoder();
const hx = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sel = (sig) => hx(keccak_256(te.encode(sig))).slice(0, 8);
const S = {
  marketCount: sel("marketCount()"), market: sel("market(uint256)"), marketKey: sel("marketKey(uint256)"), bandsOf: sel("bandsOf(uint256)"),
  priceOf: sel("priceOf(uint256)"), roundsOf: sel("roundsOf(uint256,uint256,uint256)"), bettingEpoch: sel("bettingEpoch(uint256)"), currentEpoch: sel("currentEpoch(uint256)"),
  roundOf: sel("roundOf(uint256,uint256)"), round: sel("round(uint256)"), priceAt: sel("priceAt(uint256,uint256)"), bets: sel("bets(uint256,address)"), claimable: sel("claimable(uint256,address)"),
  feeBps: sel("feeBps()"), minBet: sel("minBet()"), maxBet: sel("maxBet()"), maxSide: sel("maxSide()"), paused: sel("paused()"), feesOwed: sel("feesOwed()"),
  operator: sel("operator()"), owner: sel("owner()"), minSamples: sel("minSamples()"), sampleGap: sel("sampleGap()"),
  sample: sel("sample(uint256[])"), settle: sel("settle(uint256[])"), payFees: sel("payFees()"),
  addMarket: sel("addMarket((address,address,uint24,int24,address),uint32,uint32,uint8,int32[3])"),
  symbol: sel("symbol()"), decimals: sel("decimals()"),
};
const strip = (h) => String(h || "").replace(/^0x/, "");
const w = (v) => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, "0");
const wa = (a) => strip(a).toLowerCase().padStart(64, "0");
const W = (h, i) => { const s = strip(h).slice(i * 64, i * 64 + 64); return s ? BigInt("0x" + s) : 0n; };
const Ws = (h, i) => BigInt.asIntN(256, W(h, i));
const A = (h, i) => "0x" + strip(h).slice(i * 64 + 24, i * 64 + 64);
const call = (to, data) => ({ to, data: "0x" + data });
const encIds = (ids) => w(32) + w(ids.length) + ids.map(w).join("");
const amt = (x) => Number(x) / 1e18;
function str(h) { try { const s = strip(h); if (!s) return ""; if (s.length === 64) return Buffer.from(s, "hex").toString("utf8").replace(/\0+$/, ""); const n = Number(W(h, 1)); return Buffer.from(s.slice(128, 128 + n * 2), "hex").toString("utf8"); } catch { return ""; } }

export const CFG = {
  address: () => { const e = env("PREDICTX_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : isAddr(PREDICTX_DEFAULT) ? lc(PREDICTX_DEFAULT) : null; },
  keeperKey: () => env("PREDICT_KEEPER_KEY") || env("ORDERS_KEEPER_KEY") || null,
  rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  autoMarkets: () => { const e = env("PREDICTX_AUTO"); if (e === "none") return []; return e ? e.split(",").map((x) => x.trim()).filter(isAddr).map(lc) : [ARCIRCLE]; },
  poolKeyOf: async (token) => { const P = await import("./_predict.mjs"); return P.CFG.poolKeyOf(token); },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Math.floor(Date.now() / 1000),
};
let ch = null;
const mem = new Map();
export function configure(o) { Object.assign(CFG, o); ch = null; mem.clear(); }
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: 5042 }));
const cached = async (k, ms, fn) => { const h = mem.get(k); if (h && Date.now() - h.t < ms) return h.v; const v = await fn(); mem.set(k, { t: Date.now(), v }); return v; };

const decRound = (id, h) => (h ? { id: Number(id), market: Number(W(h, 0)), epoch: Number(W(h, 1)), feeBps: Number(W(h, 2)), result: Number(W(h, 4)),
  moveBps: Number(Ws(h, 5)), openP: W(h, 6), closeP: W(h, 7), pools: [8, 9, 10, 11].map((i) => W(h, i)) } : null);
/// a band's label from the market's edges (bps): "< −1%", "−1% to 0", "0 to +1%", "> +1%"
export function bandLabels(n, edges) {
  const p = (b) => `${b > 0 ? "+" : b < 0 ? "−" : ""}${Math.abs(b) / 100}%`;
  const out = [];
  for (let i = 0; i < n; i++) out.push(i === 0 ? `< ${p(edges[0])}` : i === n - 1 ? `≥ ${p(edges[n - 2])}` : `${p(edges[i - 1])} to ${p(edges[i])}`);
  return out;
}
const multOf = (pools, i, feeBps, add = 0n) => { const pot = pools.reduce((s, x) => s + x, 0n) + add, mine = pools[i] + add; return mine > 0n ? (Number(pot) * (1 - feeBps / 10000)) / Number(mine) : null; };

async function marketsRaw(addr) {
  const [cnt] = await chain().ethCalls([call(addr, S.marketCount)]);
  if (cnt == null) throw new Error("Arc's RPC didn't answer");
  const n = Number(W(cnt, 0)), ids = [...Array(n).keys()], per = 7;
  const r = await chain().ethCalls(ids.flatMap((i) => [call(addr, S.market + w(i)), call(addr, S.marketKey + w(i)), call(addr, S.bandsOf + w(i)), call(addr, S.priceOf + w(i)),
    call(addr, S.roundsOf + w(i) + w(0) + w(12)), call(addr, S.bettingEpoch + w(i)), call(addr, S.currentEpoch + w(i))]));
  return ids.map((i) => {
    const h = r[i * per], k = r[i * per + 1], b = r[i * per + 2], rs = r[i * per + 4];
    if (!h) return null;
    const nr = rs ? Number(W(rs, 1)) : 0;
    return { id: i, token: lc(A(h, 0)), tokenIs0: W(h, 2) === 1n, duration: Number(W(h, 3)), lock: Number(W(h, 4)), start: Number(W(h, 5)), stopEpoch: W(h, 6), next: Number(W(h, 7)),
      key: k ? { currency0: lc(A(k, 0)), currency1: lc(A(k, 1)), fee: Number(W(k, 2)), tickSpacing: Number(BigInt.asIntN(24, W(k, 3))), hooks: lc(A(k, 4)) } : null,
      bands: b ? Number(W(b, 0)) : 2, edges: b ? [1, 2, 3].map((j) => Number(Ws(b, j))) : [0, 0, 0], priceP: r[i * per + 3] ? W(r[i * per + 3], 0) : 0n,
      roundIds: [...Array(nr).keys()].map((j) => Number(W(rs, 2 + j))), betting: Number(W(r[i * per + 5], 0)), current: Number(W(r[i * per + 6], 0)) };
  }).filter(Boolean);
}
async function tokenMeta(tokens) {
  return cached("meta:" + tokens.join(","), 600e3, async () => {
    const r = await chain().ethCalls(tokens.flatMap((t) => [call(t, S.symbol), call(t, S.decimals)]));
    return Object.fromEntries(tokens.map((t, i) => [t, { sym: str(r[i * 2]) || "?", dec: r[i * 2 + 1] ? Number(W(r[i * 2 + 1], 0)) : 18 }]));
  });
}
const qdec = (c) => (lc(c) === USDC ? 6 : 18);
const pxFn = (m, dec) => { const k = m.key || {}; const d0 = m.tokenIs0 ? dec : qdec(k.currency0), d1 = m.tokenIs0 ? qdec(k.currency1) : dec; return (p) => (p ? priceOf(p, m.tokenIs0, d0, d1) : null); };
const moveOf = (o, p, tokenIs0) => { if (!o || !p) return null; const r = Number(tokenIs0 ? p : o) / Number(tokenIs0 ? o : p); return Math.round((r * r - 1) * 10000); };
const bandOf = (n, edges, mv) => { for (let i = 0; i + 1 < n; i++) if (mv < edges[i]) return i; return n - 1; };

/// everything the page shows
export async function state() {
  const addr = CFG.address();
  if (!addr) return { live: false };
  return cached("state", 2500, async () => {
    const [g, ms] = await Promise.all([chain().ethCalls([call(addr, S.feeBps), call(addr, S.minBet), call(addr, S.maxBet), call(addr, S.maxSide), call(addr, S.paused)]), marketsRaw(addr)]);
    const feeBps = Number(W(g[0], 0));
    const meta = ms.length ? await tokenMeta([...new Set(ms.map((m) => m.token))]) : {};
    // the live and the betting round of each market, its price to beat, and the last results
    const q = ms.flatMap((m) => [call(addr, S.roundOf + w(m.id) + w(m.current)), call(addr, S.roundOf + w(m.id) + w(m.betting)), call(addr, S.priceAt + w(m.id) + w(m.current))]);
    const r1 = await chain().ethCalls(q);
    const rids = []; ms.forEach((m, i) => { m.curId = Number(W(r1[i * 3], 0)); m.betId = Number(W(r1[i * 3 + 1], 0)); m.open = W(r1[i * 3 + 2], 0); rids.push(m.curId, m.betId, ...m.roundIds.slice(0, 10)); });
    const uniq = [...new Set(rids.filter((x) => x > 0))];
    const rr = uniq.length ? await chain().ethCalls(uniq.map((id) => call(addr, S.round + w(id)))) : [];
    const R = new Map(uniq.map((id, i) => [id, decRound(id, rr[i])]));
    const markets = ms.filter((m) => m.stopEpoch >= U64 || m.betting < Number(m.stopEpoch)).map((m) => {
      const mt = meta[m.token] || { sym: "?", dec: 18 }, px = pxFn(m, mt.dec);
      const cur = R.get(m.curId), bet = R.get(m.betId), zero = Array(m.bands).fill(0n);
      const pools = (x) => (x ? x.pools.slice(0, m.bands) : zero);
      const mvNow = moveOf(m.open, m.priceP, m.tokenIs0);
      const curPools = pools(cur), betPools = pools(bet);
      return {
        id: m.id, token: m.token, sym: mt.sym, duration: m.duration, lock: m.lock, start: m.start, bands: m.bands, edges: m.edges.slice(0, m.bands - 1), labels: bandLabels(m.bands, m.edges),
        price: px(m.priceP),
        live: { epoch: m.current, id: m.curId || null, endsAt: m.start + (m.current + 1) * m.duration, open: px(m.open), moveBps: mvNow, band: mvNow == null || mvNow === 0 ? null : bandOf(m.bands, m.edges, mvNow),
          pools: curPools.map(amt), pot: amt(curPools.reduce((s, x) => s + x, 0n)) },
        betting: { epoch: m.betting, id: m.betId || null, startsAt: m.start + m.betting * m.duration, locksAt: m.start + (m.betting + 1) * m.duration - m.lock,
          pools: betPools.map(amt), pot: amt(betPools.reduce((s, x) => s + x, 0n)), mult: betPools.map((_, i) => multOf(betPools, i, feeBps)) },
        last: m.roundIds.slice(0, 10).map((id) => R.get(id)).filter((x) => x && x.result).map((x) => ({ epoch: x.epoch, result: x.result === 255 ? "refund" : x.result, moveBps: x.moveBps, pot: amt(x.pools.reduce((s, y) => s + y, 0n)) })),
      };
    });
    return { live: true, address: addr, unit: "USDC", feeBps, minBet: amt(W(g[1], 0)), maxBet: amt(W(g[2], 0)), maxSide: amt(W(g[3], 0)), paused: W(g[4], 0) === 1n, now: CFG.now(), markets };
  });
}
/// a wallet's bets in the recent rounds of every market, and what it can claim
export async function mine(user) {
  const addr = CFG.address();
  if (!addr) return { live: false };
  if (!isAddr(user)) return { error: "bad wallet" };
  const u = lc(user), ms = await marketsRaw(addr);
  const r1 = await chain().ethCalls(ms.flatMap((m) => [call(addr, S.roundOf + w(m.id) + w(m.current)), call(addr, S.roundOf + w(m.id) + w(m.betting))]));
  const ids = [...new Set(ms.flatMap((m, i) => [Number(W(r1[i * 2], 0)), Number(W(r1[i * 2 + 1], 0)), ...m.roundIds]).filter((x) => x > 0))].slice(0, 120);
  if (!ids.length) return { bets: [], claimIds: [], claimable: 0 };
  const r = await chain().ethCalls(ids.flatMap((id) => [call(addr, S.bets + w(id) + wa(u)), call(addr, S.claimable + w(id) + wa(u)), call(addr, S.round + w(id))]));
  const sym = Object.fromEntries(Object.entries(await tokenMeta([...new Set(ms.map((m) => m.token))])).map(([k, v]) => [k, v.sym]));
  const bets = ids.map((id, i) => {
    const b = r[i * 3], c = W(r[i * 3 + 1], 0), rd = decRound(id, r[i * 3 + 2]);
    if (!b || W(b, 1) === 0n || !rd) return null;
    const m = ms.find((x) => x.id === rd.market) || {};
    return { id, market: rd.market, sym: sym[m.token] || "?", duration: m.duration, epoch: rd.epoch, pick: Number(W(b, 0)), amount: amt(W(b, 1)), claimed: W(b, 2) === 1n,
      result: rd.result === 255 ? "refund" : rd.result || "open", moveBps: rd.result ? rd.moveBps : null, claimable: amt(c), label: m.bands ? bandLabels(m.bands, m.edges)[Number(W(b, 0)) - 1] : "" };
  }).filter(Boolean).sort((a, b) => b.id - a.id);
  const claimIds = bets.filter((b) => b.claimable > 0).map((b) => b.id);
  return { bets: bets.slice(0, 40), claimIds, claimable: bets.reduce((s, b) => s + b.claimable, 0) };
}

/// the keeper (the contract's operator)
export async function tick({ budgetMs = 30000, store = null } = {}) {
  const t0 = Date.now(), addr = CFG.address(), key = CFG.keeperKey();
  if (!addr) return { skipped: "no contract" };
  if (!key) return { skipped: "no keeper key" };
  const g = await chain().ethCalls([call(addr, S.operator), call(addr, S.owner), call(addr, S.minSamples), call(addr, S.sampleGap), call(addr, S.feesOwed)]);
  if (g[0] == null) throw new Error("Arc's RPC didn't answer");
  const me = lc(addressOfKey(key));
  if (me !== lc(A(g[0], 0)) && me !== lc(A(g[1], 0))) return { skipped: "the keeper key isn't this contract's operator" };
  const need = Math.max(1, Number(W(g[2], 0))), gap = Number(W(g[3], 0));
  const ms = await marketsRaw(addr), lb = await chain().latestBlock();
  const due = ms.filter((m) => m.stopEpoch >= BigInt(m.next) && lb.ts >= m.start + m.next * m.duration).map((m) => m.id);
  const out = { due: due.length, sampled: 0, settled: null, txs: [] };
  const send = async (data, kind) => { const r = await chain().sendTx({ to: addr, data: "0x" + data, key }).catch((e) => ({ ok: false, err: String((e && e.message) || e).slice(0, 160) })); out.txs.push({ kind, hash: r.hash || null, ok: r.ok, err: r.err }); return r; };
  if (due.length) {
    for (let k = 0; k < need + 1; k++) {
      if (Date.now() - t0 > budgetMs - 8000) break;
      const r = await send(S.sample + encIds(due), "sample");
      if (r.ok) out.sampled++;
      if (out.sampled >= need) break;
      await CFG.sleep((gap + 1) * 1000);
    }
    out.settled = (await send(S.settle + encIds(due), "settle")).ok;
  }
  const st = (store && (await store.get("predictx/status").catch(() => null))) || {};
  if (W(g[4], 0) >= 10n ** 18n && CFG.now() - (st.feesAt || 0) > 3600 && Date.now() - t0 < budgetMs - 4000) { st.feesAt = CFG.now(); await send(S.payFees, "fees"); }
  // $ARCIRCLE (or PREDICTX_AUTO) gets 5m / 15m / 1h markets, checked every 10 minutes
  if (CFG.now() - (st.autoAt || 0) > 600 && Date.now() - t0 < budgetMs - 8000) {
    st.autoAt = CFG.now();
    for (const t of CFG.autoMarkets()) {
      const have = new Set(ms.filter((m) => m.token === t && m.stopEpoch >= U64).map((m) => m.duration));
      const miss = DURS.filter((d) => !have.has(d));
      if (!miss.length) continue;
      const k = await CFG.poolKeyOf(t).catch(() => null);
      if (!k) continue;
      for (const d of miss) {
        if (Date.now() - t0 > budgetMs - 5000) break;
        const r = await send(S.addMarket + wa(k.currency0) + wa(k.currency1) + w(k.fee) + w(k.tickSpacing) + wa(k.hooks) + w(d) + w(0) + w(0) + w(0) + w(0) + w(0), "add");
        if (r.ok) out.opened = (out.opened || 0) + 1;
      }
    }
  }
  st.at = lb.ts; st.keeper = me; st.last = { due: out.due, sampled: out.sampled, settled: out.settled };
  const bad = out.txs.filter((x) => !x.ok);
  st.error = bad.length ? { at: CFG.now(), msg: `${bad[0].kind}: ${bad[0].err || "failed"}`.slice(0, 200) } : null;
  if (store) await store.set("predictx/status", st).catch(() => null);
  mem.clear();
  return out;
}
export const _test = { bandLabels, decRound, moveOf, bandOf, multOf, S };
