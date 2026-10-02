// api/_stake.mjs — ARCIRCLE Staking (contracts/ArcircleStaking.sol): veARCIRCLE on Arc.
//   state()     totals, the last weeks' rewards, this week's and last week's pool votes, the stakers, what the treasury
//               owes stakers (half of what it received from ARCIRCLE Orders and Predict fees since staking opened, less
//               what it already funded), and the pools anyone can vote for
//   me(user)    a wallet's lock, veARCIRCLE, claimable USDC and this week's vote
// Read-only: nobody's key is used here. Contract: env STAKING_ADDRESS ("none" turns it off), else STAKING_DEFAULT.
import { evmChain } from "./_evm.mjs";
import { RPCS, allPools } from "./_arc.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";

export const STAKING_DEFAULT = ""; // set once deployed (contracts/scripts/deploy-arcircle-staking.js)
export const STAKING_DEFAULT_BLOCK = 0;
const env = (k) => String(process.env[k] || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const USDC = "0x3600000000000000000000000000000000000000";
const ARCIRCLE = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7";
const FEE_BURN = "0x7f53f5014bc2cfe52ed8fb9370f2bcd497b93034"; // ArcircleFeeBurn: Orders and Predict fees → 50% burn, 50% treasury
const WEEK = 7 * 86400;
export const CFG = {
  rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  chainId: 5042,
  address: () => { const e = env("STAKING_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : isAddr(STAKING_DEFAULT) ? lc(STAKING_DEFAULT) : null; },
  fromBlock: () => Number(env("STAKING_BLOCK")) || STAKING_DEFAULT_BLOCK || 0,
  feeBurn: FEE_BURN,
  usdc: USDC,
  logChunk: 9000,
  cacheMs: 5000,
  extraPools: () => [], // tests: [{ poolId, token }]
  predictMarkets: async () => { try { const p = await import("./_predict.mjs"); const s = await p.state(); return (s.markets || []).map((m) => ({ poolId: m.poolId, token: m.token })); } catch { return []; } },
  arcpadPools: async () => { try { return (await allPools()).map((p) => ({ poolId: p.poolId, token: p.token })); } catch { return []; } },
  now: () => Math.floor(Date.now() / 1000),
};
export function configure(o) { Object.assign(CFG, o); ch = null; mem.clear(); }
let ch = null;
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: CFG.chainId }));
const mem = new Map();

// ---- abi bits ----
const kec = (s) => "0x" + Array.from(keccak_256(new TextEncoder().encode(s)), (b) => b.toString(16).padStart(2, "0")).join("");
const sel = (s) => kec(s).slice(0, 10);
const strip = (h) => String(h || "").replace(/^0x/, "");
const pad = (x) => (typeof x === "bigint" || typeof x === "number" ? BigInt(x).toString(16) : strip(x).toLowerCase()).padStart(64, "0");
const W = (h, i) => { const s = strip(h).slice(i * 64, (i + 1) * 64); return s ? BigInt("0x" + s) : 0n; };
const T = {
  Locked: kec("Locked(address,uint256,uint256,uint256)"),
  Withdrawn: kec("Withdrawn(address,uint256)"),
  Funded: kec("Funded(uint256,address,uint256)"),
  Claimed: kec("Claimed(address,uint256,uint256)"),
  Voted: kec("Voted(uint256,address,bytes32,uint256)"),
  Burned: kec("Burned(uint256,uint256,uint256)"),
  Flushed: kec("Flushed(address,uint256,uint256)"),
};
const S = Object.fromEntries(["totalLocked()", "totalSupply()", "currentWeek()", "startWeek()", "totalFunded()", "totalClaimed()"].map((f) => [f.replace("()", ""), sel(f)]));
const call = (to, sig, ...args) => ({ to, data: sel(sig) + args.map(pad).join("") });
const str = (h) => { try { const s = strip(h); const off = Number(BigInt("0x" + s.slice(0, 64))) * 2, n = Number(BigInt("0x" + s.slice(off, off + 64))); return new TextDecoder().decode(Uint8Array.from((s.slice(off + 64, off + 64 + n * 2).match(/../g) || []).map((x) => parseInt(x, 16)))); } catch { return ""; } };
const num = (x, d) => Number(x) / 10 ** d;

// ---- the event log, kept incrementally ----
async function scan(store) {
  const A = CFG.address();
  const key = `stake/scan/${A}`;
  let st = mem.get(key) || null;
  if (!st && store) { try { st = await store.get(key); } catch { st = null; } }
  if (!st || !st.v) st = { v: 1, hi: CFG.fromBlock() - 1, locks: {}, funded: [], votes: {}, fees: "0", feesN: 0, claims: "0" };
  const head = await chain().latestBlock();
  let moved = false;
  const t0 = Date.now();
  while (st.hi < head.number && Date.now() - t0 < 8000) {
    const from = st.hi + 1, to = Math.min(head.number, from + CFG.logChunk - 1);
    const [mine, fees] = await Promise.all([
      chain().getLogs({ address: A, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }),
      chain().getLogs({ address: CFG.feeBurn, topics: [[T.Burned, T.Flushed]], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }),
    ]);
    for (const l of mine || []) {
      const t0 = l.topics[0], who = l.topics[1] ? "0x" + l.topics[1].slice(26) : "";
      if (t0 === T.Locked) st.locks[who] = { a: W(l.data, 1).toString(), end: Number(W(l.data, 2)), b: parseInt(l.blockNumber, 16) };
      else if (t0 === T.Withdrawn) delete st.locks[who];
      else if (t0 === T.Funded) st.funded.unshift({ w: Number(BigInt(l.topics[1])), by: "0x" + l.topics[2].slice(26), a: W(l.data, 0).toString(), tx: l.transactionHash });
      else if (t0 === T.Voted) { const w = String(Number(BigInt(l.topics[1]))), p = l.topics[3]; (st.votes[w] = st.votes[w] || []).includes(p) || st.votes[w].push(p); }
      else if (t0 === T.Claimed) st.claims = (BigInt(st.claims) + W(l.data, 0)).toString();
    }
    for (const l of fees || []) {
      // the treasury's USDC: Burned(usdcIn, burned, usdcToTreasury) · Flushed(token, burned, toTreasury) for USDC
      if (l.topics[0] === T.Burned) { st.fees = (BigInt(st.fees) + W(l.data, 2)).toString(); st.feesN++; }
      else if (l.topics[0] === T.Flushed && lc("0x" + l.topics[1].slice(26)) === CFG.usdc) { st.fees = (BigInt(st.fees) + W(l.data, 1)).toString(); st.feesN++; }
    }
    st.funded = st.funded.slice(0, 60);
    st.hi = to; moved = true;
  }
  if (moved) { mem.set(key, st); if (store) { try { await store.set(key, st); } catch { /* this instance keeps it */ } } }
  return { st, head };
}

// ---- pools: a directory of pools people can vote for, and token names ----
const metaCache = new Map();
async function tokenMeta(tokens) {
  const need = [...new Set(tokens.map(lc))].filter((t) => isAddr(t) && !metaCache.has(t));
  if (need.length) {
    const r = await chain().ethCalls(need.flatMap((t) => [call(t, "symbol()"), call(t, "name()")]));
    need.forEach((t, i) => metaCache.set(t, { sym: str(r[i * 2]) || "?", name: str(r[i * 2 + 1]) || "" }));
  }
  return Object.fromEntries(tokens.map((t) => [lc(t), metaCache.get(lc(t)) || { sym: "?", name: "" }]));
}
async function directory() {
  const hit = mem.get("dir");
  if (hit && Date.now() - hit.at < 300e3) return hit.v;
  const [fb, pm, ap] = await Promise.all([
    chain().ethCalls([call(CFG.feeBurn, "poolKey()")]).catch(() => [null]),
    CFG.predictMarkets(), CFG.arcpadPools(),
  ]);
  const list = [];
  const add = (poolId, token, src) => { if (!/^0x[0-9a-f]{64}$/i.test(String(poolId || "")) || !isAddr(token)) return; const id = lc(poolId); const ex = list.find((x) => x.poolId === id); if (ex) { if (!ex.src.includes(src)) ex.src.push(src); return; } list.push({ poolId: id, token: lc(token), src: [src] }); };
  // $ARCIRCLE's own pool (the fee burn trades in it): keccak of its PoolKey
  if (fb && fb[0]) { const k = strip(fb[0]).slice(0, 5 * 64); add(kec0(k), ARCIRCLE, "arcircle"); }
  for (const m of pm) add(m.poolId, m.token, "predict");
  for (const p of ap.slice(-60)) add(p.poolId, p.token, "arcpad");
  for (const p of CFG.extraPools()) add(p.poolId, p.token, p.src || "extra");
  const meta = await tokenMeta(list.map((x) => x.token)).catch(() => ({}));
  for (const x of list) Object.assign(x, meta[x.token] || {});
  mem.set("dir", { at: Date.now(), v: list });
  return list;
}
function kec0(hex) { const b = Uint8Array.from((hex.match(/../g) || []).map((x) => parseInt(x, 16))); return "0x" + Array.from(keccak_256(b), (x) => x.toString(16).padStart(2, "0")).join(""); }

// ---- the page's picture ----
export async function state({ store } = {}) {
  const A = CFG.address();
  if (!A) return { live: false };
  const hit = mem.get("state");
  if (hit && Date.now() - hit.at < CFG.cacheMs) return hit.v;
  const [{ st, head }, dir] = await Promise.all([scan(store), directory().catch(() => [])]);
  const g = await chain().ethCalls(Object.keys(S).map((k) => ({ to: A, data: S[k] })));
  const v = Object.fromEntries(Object.keys(S).map((k, i) => [k, W(g[i], 0)]));
  const cur = Number(v.currentWeek), start = Number(v.startWeek);
  const weeks = [];
  for (let k = 0; k < 6; k++) { const w = cur - k * WEEK; if (w < start) break; weeks.push(w); }
  const wr = await chain().ethCalls(weeks.flatMap((w) => [call(A, "tokensPerWeek(uint256)", w), call(A, "weekSupply(uint256)", w)]));
  const wk = weeks.map((w, i) => ({ week: w, usdc: num(W(wr[i * 2], 0), 6), ve: num(W(wr[i * 2 + 1], 0), 18), open: w === cur }));
  // votes: this week and last week, on-chain totals for every pool voted for
  const vweeks = [cur, cur - WEEK];
  const vq = vweeks.flatMap((w) => (st.votes[String(w)] || []).map((p) => ({ w, p })));
  const vr = vq.length ? await chain().ethCalls([...vq.map(({ w, p }) => call(A, "poolVotes(uint256,bytes32)", w, p)), ...vweeks.map((w) => call(A, "weekVotes(uint256)", w))]) : [];
  const byId = new Map(dir.map((d) => [d.poolId, d]));
  const votes = vweeks.map((w, k) => {
    const pools = vq.map((x, i) => ({ ...x, ve: num(W(vr[i], 0), 18) })).filter((x) => x.w === w && x.ve > 0)
      .map((x) => { const d = byId.get(lc(x.p)) || {}; return { poolId: lc(x.p), token: d.token || null, sym: d.sym || null, ve: x.ve }; })
      .sort((a, b) => b.ve - a.ve);
    return { week: w, total: num(W(vr[vq.length + k], 0), 18), pools };
  });
  const stakers = Object.entries(st.locks).map(([a, x]) => ({ a, amount: num(BigInt(x.a), 18), end: x.end })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  // the treasury's share of the fees since staking opened, half of it promised to stakers
  const feesIn = num(BigInt(st.fees), 6), funded = num(v.totalFunded, 6);
  const due = feesIn / 2;
  const out = {
    live: true, address: A, chainId: CFG.chainId, now: head.ts, week: cur, startWeek: start, nextWeek: cur + WEEK,
    totals: { locked: num(v.totalLocked, 18), ve: num(v.totalSupply, 18), funded, claimed: num(v.totalClaimed, 6), stakers: stakers.length },
    weeks: wk, votes,
    treasury: { feesIn, due, funded, owed: Math.max(0, Math.round((due - funded) * 1e6) / 1e6), fills: st.feesN },
    funded: st.funded.slice(0, 12).map((f) => ({ ...f, a: num(BigInt(f.a), 6) })),
    stakers: stakers.slice(0, 20),
    pools: dir.map((d) => ({ poolId: d.poolId, token: d.token, sym: d.sym, name: d.name, src: d.src })),
    rules: { maxLockDays: 365, week: WEEK, rewards: "USDC", share: "half of the treasury's share of ARCIRCLE Orders and Predict fees" },
  };
  mem.set("state", { at: Date.now(), v: out });
  return out;
}

export async function me(user) {
  const A = CFG.address();
  if (!A) return { live: false };
  if (!isAddr(user)) return { error: "u must be an address" };
  const u = lc(user);
  const [lk, bal, cl, nw, cw] = await chain().ethCalls([call(A, "locked(address)", u), call(A, "balanceOf(address)", u), call(A, "claimable(address)", u), call(A, "nextClaimWeek(address)", u), { to: A, data: S.currentWeek }]);
  const cur = Number(W(cw, 0));
  const vp = await chain().ethCalls([call(A, "votedPools(uint256,address)", cur, u)]);
  const h = strip(vp[0] || "");
  let pools = [];
  try { const n = Number(BigInt("0x" + h.slice(64, 128))); pools = Array.from({ length: n }, (_, i) => "0x" + h.slice(128 + i * 64, 192 + i * 64)); } catch { pools = []; }
  const pv = pools.length ? await chain().ethCalls(pools.map((p) => call(A, "userPoolVote(uint256,address,bytes32)", cur, u, p))) : [];
  return {
    live: true, user: u, week: cur,
    lock: { amount: num(W(lk, 0), 18), end: Number(W(lk, 1)) },
    ve: num(W(bal, 0), 18),
    claimable: num(W(cl, 0), 6), claimUntil: Number(W(cl, 1)), nextClaimWeek: Number(W(nw, 0)),
    vote: pools.map((p, i) => ({ poolId: lc(p), ve: num(W(pv[i], 0), 18) })),
  };
}
