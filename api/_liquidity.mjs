// api/_liquidity.mjs — the Liquidity Manager's read side (/api/social?liq=<token>).
// For one token: every Uniswap v4 pool it trades in, each pool's price, fee
// and active liquidity, every liquidity position (NFT) in those pools with
// its owner, amounts and lock, and how much of the liquidity at the current
// price is locked, burned or free to leave.
//
// Pools are found from Dexscreener's pair list, the token's ArcPad launch,
// pools seen before for this token (lptok/*) and ones the page asks about.
// Each pool's positions come from its own PoolManager ModifyLiquidity log
// (lppool/<id>): position NFT ids, ranges and liquidity, read once from the
// pool's first block and then only the new blocks. The token's ArcPad launch
// record, and Dexscreener's pair list. Liquidity that isn't an NFT (an ArcPad
// launch position sits in the PoolManager under the factory's own name) shows
// up as the part of the active liquidity no known position accounts for.
import { isAddr, getLogs, latestBlock, blockTs, pool, toQty, rpc } from "./_arc.mjs";
import * as snapCore from "./_snap-core.mjs";
import * as scanCore from "./_scan-core.mjs";
import * as L from "./_liq-core.mjs";
import { io as snapIo } from "./_snapshot.mjs";
import { io as scanIo } from "./_scan.mjs";

// eth_call batches that survive a busy RPC: an item that comes back with an
// error other than a revert (rate limits, timeouts) is asked again, so a
// flaky answer is never mistaken for "nothing there". out.failed counts the
// ones that still didn't answer. A call may carry its own block tag.
async function rcalls(calls, tag = "latest") {
  const out = new Array(calls.length).fill(null);
  let todo = calls.map((_, i) => i), failed = 0;
  for (let attempt = 0; attempt < 6 && todo.length; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 150 * attempt));
    const groups = []; for (let i = 0; i < todo.length; i += 50) groups.push(todo.slice(i, i + 50));
    const again = [];
    await pool(groups, 3, async (g) => {
      let res;
      try { res = await rpc(g.map((k, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: calls[k].to, data: calls[k].data }, calls[k].tag || tag] })), { timeoutMs: 9000 }); }
      catch { again.push(...g); return; }
      const byId = new Map((Array.isArray(res) ? res : [res]).map((x) => [x && x.id, x]));
      g.forEach((k, j) => {
        const x = byId.get(j);
        if (x && x.result !== undefined && x.result !== null) out[k] = x.result !== "0x" ? x.result : null;
        else if (x && x.error && /revert|invalid opcode/i.test(String(x.error.message || ""))) out[k] = null;
        else again.push(k);
      });
    });
    todo = again;
  }
  failed = todo.length;
  out.failed = failed;
  return out;
}
const io = { ...scanIo, ...snapIo, calls: rcalls };
const lc = (a) => String(a || "").toLowerCase();
const big = (x) => { try { return BigInt(x || 0); } catch { return 0n; } };
const strip = (h) => String(h || "").replace(/^0x/, "");
const word = (h, i) => strip(h).slice(i * 64, (i + 1) * 64);
const wBig = (h, i) => BigInt("0x" + (word(h, i) || "0"));
const wAddr = (h, i) => "0x" + word(h, i).slice(24);
const pad = (x) => strip(typeof x === "bigint" || typeof x === "number" ? BigInt(x).toString(16) : x).padStart(64, "0");
const sel = (sig) => snapCore.selector(sig, io.keccak);
const utf8 = (hex) => { try { return new TextDecoder().decode(Uint8Array.from((hex.match(/../g) || []).map((b) => parseInt(b, 16)))).replace(/\0+$/, ""); } catch { return ""; } };
function str(h) {
  const x = strip(h);
  if (!x) return "";
  try { if (x.length >= 128) { const off = Number(BigInt("0x" + x.slice(0, 64))) * 2, len = Number(BigInt("0x" + x.slice(off, off + 64))) * 2; return utf8(x.slice(off + 64, off + 64 + len)); } } catch { /* bytes32 below */ }
  return x.length === 64 ? utf8(x) : "";
}

const mem = new Map();
const memSet = (k, v) => { mem.set(k, v); if (mem.size > 200) mem.delete(mem.keys().next().value); };
async function sget(store, k) { if (mem.has(k)) return mem.get(k); if (!store) return null; try { const d = await store.get(k); if (d) memSet(k, d); return d || null; } catch { return null; } }
async function sset(store, k, d) { memSet(k, d); if (store) { try { await store.set(k, d); } catch { /* too big: this instance keeps it */ } } }

async function meta(addrs) {
  const out = new Map();
  const list = [...new Set(addrs.map(lc))];
  const erc = list.filter((a) => a !== L.ZERO_ADDR);
  const r = await io.calls(erc.flatMap((a) => [{ to: a, data: sel("symbol()") }, { to: a, data: sel("name()") }, { to: a, data: sel("decimals()") }]));
  erc.forEach((a, i) => out.set(a, { address: a, symbol: str(r[3 * i]) || "?", name: str(r[3 * i + 1]) || "", decimals: r[3 * i + 2] ? Number(big(r[3 * i + 2])) : 18 }));
  if (list.includes(L.ZERO_ADDR)) out.set(L.ZERO_ADDR, { address: L.ZERO_ADDR, symbol: "USDC", name: "USDC (native)", decimals: 18, native: true });
  return out;
}

// ---------------------------------------------------------------- each pool's own position log
// PoolManager emits ModifyLiquidity(id, sender, tickLower, tickUpper,
// liquidityDelta, salt) for every change. Through Uniswap's PositionManager
// the sender is the PositionManager and the salt is the NFT id — so summing
// one pool's log gives every position NFT in it, its range and its liquidity,
// without reading all ~250k NFTs on Arc. Other senders (an ArcPad launch,
// a router) are kept by (sender, range, salt).
const LOG_CHUNK = 9000;
const T_MODIFY_SIG = "ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)";
const ascii = (x) => "0x" + Array.from(new TextEncoder().encode(x), (b) => b.toString(16).padStart(2, "0")).join("");
const s24h = (h) => Number(BigInt.asIntN(24, BigInt("0x" + h.slice(-6))));
let headMem = null; // { at, v }
async function chainHead() {
  if (headMem && Date.now() - headMem.at < 3000) return headMem.v;
  const v = await latestBlock(); headMem = { at: Date.now(), v }; return v;
}
/// The first block where the pool exists: a 16-way search on its slot0 in past blocks.
async function initBlock(id, latestN, fallback) {
  const data = sel("extsload(bytes32)") + strip(L.poolSlot(id, io.keccak));
  let lo = 0, hi = latestN;
  try {
    while (hi - lo > 2000) {
      const pts = []; for (let k = 1; k < 16; k++) pts.push(Math.floor(lo + ((hi - lo) * k) / 16));
      const r = await rcalls(pts.map((b) => ({ to: L.LIQ_ADDR.poolManager, data, tag: toQty(b) })));
      if (r.failed) throw new Error("no history");
      const k = pts.findIndex((_, j) => big(r[j]) !== 0n);
      if (k < 0) lo = pts[14]; else { hi = pts[k]; if (k > 0) lo = pts[k - 1]; }
    }
    return Math.max(0, lo - 1);
  } catch { return fallback; }
}
/// → { done, progress, st } ; st = { from, hi, pos: ["id|tl|tu|liquidity"], direct: ["sender|tl|tu|salt|liquidity"] }
export async function poolLog(id, { store = null, until = () => false, startHint = null } = {}) {
  const key = `lppool/${id}`;
  let st = await sget(store, key);
  const latest = await chainHead();
  if (!st || !Array.isArray(st.pos)) {
    const from = await initBlock(id, latest.number, startHint != null ? startHint : 0);
    st = { from, hi: from - 1, pos: [], direct: [] };
  }
  if (st.hi >= latest.number) return { done: true, progress: 1, st };
  const pm = new Map(st.pos.map((r) => { const [i, tl, tu, l] = r.split("|"); return [i, [Number(tl), Number(tu), BigInt(l)]]; }));
  const dm = new Map(st.direct.map((r) => { const x = r.split("|"); return [x.slice(0, 4).join("|"), BigInt(x[4])]; }));
  const tM = io.keccak(ascii(T_MODIFY_SIG)), posm = lc(L.LIQ_ADDR.positions);
  let moved = false;
  while (st.hi < latest.number && !until()) {
    const ranges = [];
    let a = st.hi + 1;
    for (let k = 0; k < 8 && a <= latest.number; k++) { const b = Math.min(latest.number, a + LOG_CHUNK - 1); ranges.push([a, b]); a = b + 1; }
    let logs;
    try { logs = (await pool(ranges, 8, ([x, y]) => getLogs({ address: L.LIQ_ADDR.poolManager, topics: [tM, id], fromBlock: toQty(x), toBlock: toQty(y) }))).flat(); }
    catch { break; } // try again next time from the same block
    for (const l of logs) {
      const d = strip(l.data), w = (k) => d.slice(k * 64, (k + 1) * 64);
      const delta = BigInt.asIntN(256, BigInt("0x" + w(2)));
      if (delta === 0n) continue;
      const sender = "0x" + strip(l.topics[2]).slice(24), tl = s24h(w(0)), tu = s24h(w(1));
      if (lc(sender) === posm) {
        const nid = String(BigInt("0x" + w(3)));
        const cur = pm.get(nid) || [tl, tu, 0n];
        cur[2] += delta; pm.set(nid, cur);
      } else {
        const k = `${lc(sender)}|${tl}|${tu}|0x${w(3)}`;
        dm.set(k, (dm.get(k) || 0n) + delta);
      }
    }
    st.hi = ranges[ranges.length - 1][1]; moved = true;
  }
  st.pos = [...pm].filter(([, v]) => v[2] > 0n).map(([i, v]) => `${i}|${v[0]}|${v[1]}|${v[2]}`);
  st.direct = [...dm].filter(([, v]) => v > 0n).map(([k, v]) => `${k}|${v}`);
  if (moved) await sset(store, key, st);
  const span = Math.max(1, latest.number - st.from);
  return { done: st.hi >= latest.number, progress: Math.min(0.99, Math.max(0, (st.hi - st.from) / span)), st };
}
// pools seen for a token, and every pool indexed (for "your liquidity")
async function remember(store, token, ids) {
  const k = `lptok/${token}`, d = (await sget(store, k)) || { pools: [] };
  const add = ids.filter((x) => !d.pools.includes(x));
  if (add.length) await sset(store, k, { pools: [...d.pools, ...add].slice(-24) });
  const g = (await sget(store, "lppools/all")) || { pools: [] };
  const add2 = ids.filter((x) => !g.pools.includes(x));
  if (add2.length) await sset(store, "lppools/all", { pools: [...g.pools, ...add2].slice(-1500) });
}

/// → { done:false, stage, progress } while a pool's position log catches up, then the full picture.
/// extra: pool ids the page already knows for this token (e.g. one it just created) — checked here.
export async function run(token, { store = null, wallet = "", budgetMs = 8000, extra = [] } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  token = lc(token); wallet = lc(wallet);
  if (!isAddr(token)) throw Object.assign(new Error("token must be an address"), { status: 400 });

  // ---- which pools ----
  const [arcpad, argus, dex, seen] = await Promise.all([
    scanCore.readArcPad(io, token).catch(() => null),
    scanCore.readArgus(io, token).catch(() => null),
    scanCore.readMarket(io, token).catch(() => null),
    sget(store, `lptok/${token}`),
  ]);
  const ids = new Set([...((seen && seen.pools) || []), ...(extra || [])].map(lc).filter((x) => /^0x[0-9a-f]{64}$/.test(x)));
  const dexBy = new Map();
  for (const p of (dex && dex.pairs) || []) {
    const id = lc(p.pair);
    if (/^0x[0-9a-f]{64}$/.test(id)) { ids.add(id); dexBy.set(id, p); }
  }
  let arcpadKey = null;
  if (arcpad && arcpad.quote) {
    const [tsH] = await io.calls([{ to: L.LIQ_ADDR.arcpadFactory, data: sel("tickSpacing()") }]);
    const q = lc(arcpad.quote), [c0, c1] = q < token ? [q, token] : [token, q];
    let ts = tsH ? Number(big(tsH)) : 0; if (ts & 0x800000) ts -= 0x1000000;
    if (ts > 0) { arcpadKey = { currency0: c0, currency1: c1, fee: 0, tickSpacing: ts, hooks: L.LIQ_ADDR.arcpadHook }; ids.add(lc(L.poolIdOf(arcpadKey, io.keccak))); }
  }
  const poolIds = [...ids].slice(0, 12);

  // ---- keys, prices, active liquidity ----
  const selKeys = sel("poolKeys(bytes25)"), selX = sel("extsload(bytes32)");
  const calls = poolIds.flatMap((id) => {
    const slot = L.poolSlot(id, io.keccak);
    return [
      { to: L.LIQ_ADDR.positions, data: selKeys + strip(id).slice(0, 50).padEnd(64, "0") },
      { to: L.LIQ_ADDR.poolManager, data: selX + strip(slot) },
      { to: L.LIQ_ADDR.poolManager, data: selX + strip(L.plusSlot(slot, 3)) },
    ];
  });
  const r = poolIds.length ? await io.calls(calls) : [];
  if (r.failed) throw Object.assign(new Error("Arc's RPC is busy — try again in a moment"), { status: 503 });
  const pools = [];
  poolIds.forEach((id, i) => {
    const kh = r[3 * i], s0 = r[3 * i + 1], lh = r[3 * i + 2];
    let key = null;
    if (kh && strip(kh).length >= 320) {
      let ts = Number(wBig(kh, 3) & 0xffffffn); if (ts & 0x800000) ts -= 0x1000000;
      if (ts) key = { currency0: lc(wAddr(kh, 0)), currency1: lc(wAddr(kh, 1)), fee: Number(wBig(kh, 2)), tickSpacing: ts, hooks: lc(wAddr(kh, 4)) };
    }
    if (!key && arcpadKey && lc(L.poolIdOf(arcpadKey, io.keccak)) === id) key = arcpadKey;
    const st = L.decodeSlot0(s0);
    if (!st.sqrtP) return; // not initialised
    if (key && key.currency0 !== token && key.currency1 !== token) return;
    pools.push({ id, key, ...st, liquidity: lh ? big(lh) & ((1n << 128n) - 1n) : 0n });
  });

  // ---- currencies ----
  const cur = await meta([token, ...pools.flatMap((p) => (p.key ? [p.key.currency0, p.key.currency1] : []))]);
  const tokenMeta = cur.get(token);

  if (pools.length) await remember(store, token, pools.filter((p) => p.key).map((p) => p.id)).catch(() => null);

  // ---- positions in those pools: each pool's own ModifyLiquidity log ----
  const latestH = await chainHead();
  const hint = (p) => { // where to start if the past can't be searched: the pair's age on Dexscreener
    const dx = dexBy.get(p.id);
    return dx && dx.created ? Math.max(0, latestH.number - Math.ceil((latestH.ts - dx.created + 86400) / 0.4)) : 0;
  };
  const logs = [];
  let slow = 0;
  for (const p of pools.filter((x) => x.key)) {
    const r = await poolLog(p.id, { store, until: () => left() < Math.min(3000, budgetMs * 0.4), startHint: hint(p) });
    logs.push([p, r]);
    if (!r.done) slow += 1 - r.progress;
  }
  if (logs.some(([, r]) => !r.done)) return { done: false, stage: "positions", progress: Math.max(0.01, 1 - slow / logs.length) };
  const inPools = logs.flatMap(([p, r]) => r.st.pos.map((row) => { const [id, tl, tu, l] = row.split("|"); return { id: Number(id), poolId: p.id, tl: Number(tl), tu: Number(tu), liquidity: BigInt(l) }; }))
    .sort((a, b) => (b.liquidity > a.liquidity ? 1 : -1)).slice(0, 400);
  const own = inPools.length ? await io.calls(inPools.map((q) => ({ to: L.LIQ_ADDR.positions, data: sel("ownerOf(uint256)") + pad(q.id) }))) : [];
  if (own.failed) throw Object.assign(new Error("Arc's RPC is busy — try again in a moment"), { status: 503 });
  const pos = inPools.map((q, j) => (own[j] ? { ...q, owner: lc(wAddr(own[j], 0)) } : null)).filter(Boolean);
  // Argus V5 keeps a launch's position in its own locker contract, which has no way
  // out: it answers positionId() with the NFT it holds and hook() with the pool's hook.
  const owners = [...new Set(pos.map((q) => q.owner))];
  const oc = owners.length ? await io.calls(owners.flatMap((o) => [{ to: o, data: sel("positionId()") }, { to: o, data: sel("hook()") }])) : [];
  if (oc.failed) throw Object.assign(new Error("Arc's RPC is busy — try again in a moment"), { status: 503 });
  const v5 = new Map(); // owner → { positionId, hook }
  owners.forEach((o, j) => { const pid = oc[2 * j], hk = oc[2 * j + 1]; if (pid && strip(pid).length === 64 && hk && strip(hk).length === 64) v5.set(o, { positionId: Number(big(pid)), hook: lc(wAddr(hk, 0)) }); });
  // ---- fees each position has earned and not collected yet ----
  // feeGrowthInside from the pool's globals and the two ticks' "outside"
  // values, minus what the position last recorded (StateLibrary layout:
  // pool state slot +1/+2 globals, +4 ticks mapping, +6 positions mapping).
  const feeBy = new Map();
  try {
    const M = (1n << 256n) - 1n, Q128 = 1n << 128n;
    const sgn = (t) => BigInt.asUintN(256, BigInt(t)).toString(16).padStart(64, "0");
    const tickSlot = (base, t) => io.keccak("0x" + sgn(t) + strip(L.plusSlot(base, 4)));
    const posSlot = (base, q) => {
      const t24 = (t) => (BigInt.asUintN(24, BigInt(t))).toString(16).padStart(6, "0");
      const key = io.keccak("0x" + strip(L.LIQ_ADDR.positions) + t24(q.tl) + t24(q.tu) + pad(q.id));
      return io.keccak(key + strip(L.plusSlot(base, 6)));
    };
    const calls = [], meta = [];
    const bases = new Map(pools.map((p) => [p.id, L.poolSlot(p.id, io.keccak)]));
    for (const p of pools) { const b = bases.get(p.id); calls.push({ to: L.LIQ_ADDR.poolManager, data: selX + strip(L.plusSlot(b, 1)) }, { to: L.LIQ_ADDR.poolManager, data: selX + strip(L.plusSlot(b, 2)) }); meta.push(["g", p.id]); }
    const tickKeys = new Set();
    for (const q of pos) { const pid = lc(q.poolId); tickKeys.add(pid + "|" + q.tl); tickKeys.add(pid + "|" + q.tu); }
    const tickList = [...tickKeys];
    for (const k of tickList) { const [pid, t] = k.split("|"); const ts = tickSlot(bases.get(pid), Number(t)); calls.push({ to: L.LIQ_ADDR.poolManager, data: selX + strip(L.plusSlot(ts, 1)) }, { to: L.LIQ_ADDR.poolManager, data: selX + strip(L.plusSlot(ts, 2)) }); }
    for (const q of pos) { const ps = posSlot(bases.get(lc(q.poolId)), q); calls.push({ to: L.LIQ_ADDR.poolManager, data: selX + strip(L.plusSlot(ps, 1)) }, { to: L.LIQ_ADDR.poolManager, data: selX + strip(L.plusSlot(ps, 2)) }); }
    const r = calls.length ? await io.calls(calls) : [];
    if (r.failed) throw new Error("fees");
    let i = 0;
    const glob = new Map(); for (const p of pools) { glob.set(p.id, [big(r[i]), big(r[i + 1])]); i += 2; }
    const outs = new Map(); for (const k of tickList) { outs.set(k, [big(r[i]), big(r[i + 1])]); i += 2; }
    for (const q of pos) {
      const pid = lc(q.poolId), p = pools.find((x) => x.id === pid);
      const last = [big(r[i]), big(r[i + 1])]; i += 2;
      const g = glob.get(pid), lo = outs.get(pid + "|" + q.tl), hi = outs.get(pid + "|" + q.tu);
      const f = [0, 1].map((k) => {
        const below = p.tick >= q.tl ? lo[k] : (g[k] - lo[k]) & M;
        const above = p.tick < q.tu ? hi[k] : (g[k] - hi[k]) & M;
        const inside = (g[k] - below - above) & M;
        return (((inside - last[k]) & M) * q.liquidity) / Q128;
      });
      feeBy.set(q.id, f);
    }
  } catch (e) { /* fees are a nice-to-have: leave them out */ }
  // ---- each pool's whole liquidity curve, read from PoolManager storage ----
  // The tick bitmap (pool state +5) says which ticks are initialised; each
  // tick's liquidityNet (+4, high 128 bits) says how the active liquidity
  // changes when the price crosses it. Anchored at the current liquidity, that
  // gives the depth at every price — launch liquidity that isn't an NFT included.
  const curveBy = new Map();
  try {
    const sgn = (t) => BigInt.asUintN(256, BigInt(t)).toString(16).padStart(64, "0");
    const plan = [];
    for (const p of pools) {
      if (!p.key) continue;
      const ts = p.key.tickSpacing, base = L.poolSlot(p.id, io.keccak);
      const wOf = (t) => Math.floor(Math.floor(t / ts) / 256);
      let lo = wOf(L.minUsable(ts)), hi = wOf(L.maxUsable(ts)), partial = false;
      if (hi - lo > 240) { const c = wOf(p.tick); lo = Math.max(lo, c - 120); hi = Math.min(hi, c + 120); partial = true; }
      const words = []; for (let w = lo; w <= hi; w++) words.push(w);
      plan.push({ p, ts, base, words, partial });
    }
    const wr = plan.length ? await io.calls(plan.flatMap((x) => x.words.map((w) => ({ to: L.LIQ_ADDR.poolManager, data: selX + strip(io.keccak("0x" + sgn(w) + strip(L.plusSlot(x.base, 5)))) })))) : [];
    if (wr.failed) throw new Error("bitmap");
    let i = 0;
    for (const x of plan) {
      const ticks = [];
      for (const w of x.words) {
        const v = big(wr[i++]);
        if (v) for (let b = 0; b < 256; b++) if ((v >> BigInt(b)) & 1n) ticks.push((w * 256 + b) * x.ts);
      }
      x.ticks = ticks.sort((a, b) => a - b);
      if (x.ticks.length > 400) { // keep the ones nearest the price
        const near = x.ticks.slice().sort((a, b) => Math.abs(a - x.p.tick) - Math.abs(b - x.p.tick)).slice(0, 400);
        x.ticks = near.sort((a, b) => a - b); x.partial = true;
      }
    }
    const nCalls = plan.reduce((a, x) => a + x.ticks.length, 0);
    const nr = !nCalls ? [] : await io.calls(plan.flatMap((x) => x.ticks.map((t) => ({ to: L.LIQ_ADDR.poolManager, data: selX + strip(io.keccak("0x" + sgn(t) + strip(L.plusSlot(x.base, 4)))) }))));
    if (nr.failed) throw new Error("ticks");
    i = 0;
    for (const x of plan) {
      const net = x.ticks.map(() => BigInt.asIntN(128, big(nr[i++]) >> 128n));
      const T = x.ticks, n = T.length;
      if (n < 2) continue;
      // seg[j] = liquidity on [T[j], T[j+1]); the segment holding the price has the pool's liquidity
      const seg = new Array(n - 1).fill(0n);
      let c = -1; for (let j = 0; j < n - 1; j++) if (T[j] <= x.p.tick && x.p.tick < T[j + 1]) c = j;
      if (c < 0) { // price outside every range: build from the lowest tick (exact when the whole bitmap was read)
        if (x.partial) continue;
        let acc = 0n; for (let j = 0; j < n - 1; j++) { acc += net[j]; seg[j] = acc; }
      } else {
        seg[c] = x.p.liquidity;
        for (let j = c + 1; j < n - 1; j++) seg[j] = seg[j - 1] + net[j];
        for (let j = c - 1; j >= 0; j--) seg[j] = seg[j + 1] - net[j + 1];
      }
      curveBy.set(x.p.id, { ticks: T, liq: seg.map((v) => (v > 0n ? v : 0n).toString()), partial: x.partial });
    }
  } catch (e) { /* the chart falls back to the position NFTs */ }
  // locks held in ArcLPLock
  const lockBy = new Map();
  const lp = L.LIQ_ADDR.lplock;
  const inLock = lp ? pos.filter((p) => p.owner === lc(lp)) : [];
  if (inLock.length) {
    const data = sel("locksOfPositions(uint256[])") + pad(32) + pad(inLock.length) + inLock.map((p) => pad(p.id)).join("");
    const lr = await io.calls([{ to: lp, data }]);
    if (lr.failed) throw Object.assign(new Error("Arc's RPC is busy — try again in a moment"), { status: 503 });
    const h = lr[0];
    if (h) {
      const x = strip(h), n = inLock.length;
      const idsOff = Number(BigInt("0x" + x.slice(0, 64))) * 2, outOff = Number(BigInt("0x" + x.slice(64, 128))) * 2;
      for (let k = 0; k < n; k++) {
        const lockId = Number(BigInt("0x" + x.slice(idsOff + 64 + k * 64, idsOff + 128 + k * 64)));
        const b = outOff + 64 + k * 5 * 64, w = (m) => x.slice(b + m * 64, b + (m + 1) * 64);
        lockBy.set(inLock[k].id, { lockId, owner: "0x" + w(0).slice(24), lockedAt: Number(BigInt("0x" + w(2))), unlockAt: Number(BigInt("0x" + w(3))), withdrawn: BigInt("0x" + w(4)) !== 0n });
      }
    }
  }
  const argusLocker = argus && argus.locker ? lc(argus.locker) : null;
  // the chain's clock decides whether a lock has ended
  const head = await io.rpc("eth_getBlockByNumber", ["latest", false]).catch(() => null);
  const now = head && head.timestamp ? Number(BigInt(head.timestamp)) : Math.floor(Date.now() / 1000);

  const outPools = pools.map((p) => {
    const k = p.key;
    const tokenIs0 = k ? k.currency0 === token : true;
    const quoteAddr = k ? (tokenIs0 ? k.currency1 : k.currency0) : null;
    const quote = quoteAddr ? cur.get(quoteAddr) : null;
    const d0 = k ? cur.get(k.currency0).decimals : 18, d1 = k ? cur.get(k.currency1).decimals : 18;
    const argusHere = k && [...v5].some(([o, x]) => x.hook === k.hooks && pos.some((q) => q.owner === o && q.id === x.positionId && lc(q.poolId) === p.id));
    const venue = k && ((argus && argus.hook && lc(argus.hook) === k.hooks) || argusHere) ? "Argus" : k && k.hooks === L.LIQ_ADDR.arcpadHook ? "ArcPad" : k && k.hooks !== L.ZERO_ADDR ? "Uniswap v4 · hook" : "Uniswap v4";
    const shares = { locked: 0n, burned: 0n, free: 0n, launch: 0n, other: 0n };
    let known = 0n;
    const plist = pos.filter((q) => lc(q.poolId) === p.id).map((q) => {
      const [a0, a1] = L.amountsFor(p.sqrtP, q.tl, q.tu, q.liquidity);
      const inRange = q.tl <= p.tick && p.tick < q.tu;
      let kind = "wallet", lock = null, label = null;
      if (L.LIQ_BURN.includes(q.owner)) kind = "burn";
      else if (lp && q.owner === lc(lp)) { lock = lockBy.get(q.id) || null; kind = lock && lock.unlockAt > now ? "locked" : "unlocking"; }
      else if (argusLocker && q.owner === argusLocker) { kind = "forever"; label = "Argus locker"; }
      else if (v5.has(q.owner) && v5.get(q.owner).positionId === q.id && k && v5.get(q.owner).hook === k.hooks) { kind = "forever"; label = "Argus locker"; }
      if (inRange) {
        known += q.liquidity;
        if (kind === "burn") shares.burned += q.liquidity;
        else if (kind === "locked" || kind === "forever") shares.locked += q.liquidity;
        else shares.free += q.liquidity;
      }
      const full = k && q.tl <= L.minUsable(k.tickSpacing) && q.tu >= L.maxUsable(k.tickSpacing);
      return {
        id: q.id, owner: q.owner, kind, label, lock, liquidity: q.liquidity.toString(), tl: q.tl, tu: q.tu, inRange, full: !!full,
        token: (tokenIs0 ? a0 : a1).toString(), quote: (tokenIs0 ? a1 : a0).toString(),
        mine: !!wallet && (q.owner === wallet || (lock && lc(lock.owner) === wallet)),
        fees: feeBy.has(q.id) ? { token: feeBy.get(q.id)[tokenIs0 ? 0 : 1].toString(), quote: feeBy.get(q.id)[tokenIs0 ? 1 : 0].toString() } : null,
      };
    }).sort((a, b) => (big(b.liquidity) > big(a.liquidity) ? 1 : -1));
    const residual = p.liquidity > known ? p.liquidity - known : 0n;
    if (venue === "ArcPad") shares.launch = residual; else shares.other = residual;
    const act = p.liquidity || 1n;
    const pct = (x) => Number((x * 10000n) / act) / 100;
    const dx = dexBy.get(p.id);
    const totals = plist.reduce((a, q) => [a[0] + big(q.token), a[1] + big(q.quote)], [0n, 0n]);
    return {
      id: p.id, venue, key: k, tokenIs0, quote, tick: p.tick, sqrtP: p.sqrtP.toString(), lpFee: p.lpFee, feePct: k ? L.feePct(k.fee) : null,
      price: k ? L.priceOf(p.sqrtP, tokenIs0, d0, d1) : null,
      liquidity: p.liquidity.toString(),
      share: { locked: pct(shares.locked + shares.launch), burned: pct(shares.burned), free: pct(shares.free + shares.other), launch: pct(shares.launch), other: pct(shares.other) },
      positions: plist.slice(0, 200), positionCount: plist.length, curve: curveBy.get(p.id) || null,
      inPositions: { token: totals[0].toString(), quote: totals[1].toString() },
      dex: dx ? { liqUsd: dx.liq, vol: dx.vol, url: dx.url, price: dx.price } : null,
      manageable: !!k,
    };
  }).sort((a, b) => ((b.dex && b.dex.liqUsd) || 0) - ((a.dex && a.dex.liqUsd) || 0) || (big(b.liquidity) > big(a.liquidity) ? 1 : -1));

  const external = ((dex && dex.pairs) || []).filter((p) => !/^0x[0-9a-f]{64}$/i.test(String(p.pair || ""))).map((p) => ({ dex: p.dex, pair: p.pair, url: p.url, liqUsd: p.liq, quote: p.quote }));
  return {
    done: true, token: tokenMeta, pools: outPools, external,
    launch: arcpad ? { venue: "ArcPad", creator: arcpad.creator || null } : argus ? { venue: "Argus", creator: argus.creator || null, locker: argusLocker }
      : outPools.some((p) => p.venue === "Argus") ? { venue: "Argus", creator: null, locker: (pos.find((q) => v5.has(q.owner)) || {}).owner || null } : null,
    lplock: lp || null, at: now,
  };
}

/// One ArcLPLock lock, for its certificate page and share card (/lplock/<id>).
/// → { id, owner, tokenId, lockedAt, unlockAt, withdrawn, active, pair, token, quote, amounts, poolShare } or null
export async function lockInfo(lockId, { store = null } = {}) {
  const lp = L.LIQ_ADDR.lplock;
  const id = Number(lockId);
  if (!lp || !Number.isInteger(id) || id < 0) return null;
  const ck = `lplockinfo/${id}`;
  const cached = mem.get(ck);
  if (cached && Date.now() - cached.at < 60e3) return cached.v;
  const [lh, head] = await Promise.all([
    io.calls([{ to: lp, data: sel("getLock(uint256)") + pad(id) }]).then((r) => r[0]),
    io.rpc("eth_getBlockByNumber", ["latest", false]).catch(() => null),
  ]);
  if (!lh || strip(lh).length < 320) return null;
  const owner = lc(wAddr(lh, 0)), tokenId = Number(wBig(lh, 1)), lockedAt = Number(wBig(lh, 2)), unlockAt = Number(wBig(lh, 3)), withdrawn = wBig(lh, 4) !== 0n;
  const [ph, lqh] = await io.calls([
    { to: L.LIQ_ADDR.positions, data: sel("getPoolAndPositionInfo(uint256)") + pad(tokenId) },
    { to: L.LIQ_ADDR.positions, data: sel("getPositionLiquidity(uint256)") + pad(tokenId) },
  ]);
  if (!ph || strip(ph).length < 64 * 6) return null;
  let ts = Number(wBig(ph, 3) & 0xffffffn); if (ts & 0x800000) ts -= 0x1000000;
  const key = { currency0: lc(wAddr(ph, 0)), currency1: lc(wAddr(ph, 1)), fee: Number(wBig(ph, 2)), tickSpacing: ts, hooks: lc(wAddr(ph, 4)) };
  const info = wBig(ph, 5);
  const s24 = (n) => (n & 0x800000 ? n - 0x1000000 : n);
  const tl = s24(Number((info >> 8n) & 0xffffffn)), tu = s24(Number((info >> 32n) & 0xffffffn));
  const poolId = L.poolIdOf(key, io.keccak);
  const slot = L.poolSlot(poolId, io.keccak);
  const [s0, lq] = await io.calls([{ to: L.LIQ_ADDR.poolManager, data: sel("extsload(bytes32)") + strip(slot) }, { to: L.LIQ_ADDR.poolManager, data: sel("extsload(bytes32)") + strip(L.plusSlot(slot, 3)) }]);
  const st = L.decodeSlot0(s0);
  const active = lq ? big(lq) & ((1n << 128n) - 1n) : 0n;
  const liq = big(lqh);
  const cur = await meta([key.currency0, key.currency1]);
  // the "token" is the side that isn't USDC
  const usdcLike = (a) => a === L.LIQ_ADDR.usdc || a === L.ZERO_ADDR;
  // the quote is USDC when there is one; otherwise the side with fewer decimals (stablecoins use 6)
  const m0 = cur.get(key.currency0), m1 = cur.get(key.currency1);
  const tokenIs0 = usdcLike(key.currency1) ? true : usdcLike(key.currency0) ? false : m1.decimals < m0.decimals ? true : m0.decimals < m1.decimals ? false : true;
  const [a0, a1] = st.sqrtP ? L.amountsFor(st.sqrtP, tl, tu, liq) : [0n, 0n];
  const token = tokenIs0 ? m0 : m1, quote = tokenIs0 ? m1 : m0;
  const now = head && head.timestamp ? Number(BigInt(head.timestamp)) : Math.floor(Date.now() / 1000);
  const inRange = tl <= st.tick && st.tick < tu;
  const v = {
    id, owner, tokenId, lockedAt, unlockAt, withdrawn, active: !withdrawn && unlockAt > now, now,
    poolId, fee: key.fee, token, quote, full: tl <= L.minUsable(ts) && tu >= L.maxUsable(ts),
    amounts: { token: (tokenIs0 ? a0 : a1).toString(), quote: (tokenIs0 ? a1 : a0).toString() },
    poolShare: inRange && active > 0n ? Number((liq * 10000n) / active) / 100 : 0,
  };
  memSet(ck, { at: Date.now(), v });
  return v;
}

// ---------------------------------------------------------------- activity feed
// Liquidity added to / taken out of these pools (PoolManager ModifyLiquidity)
// and ArcLPLock locks, withdrawals and extensions, over the last `hours`.
const T_MODIFY = "ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)";
const T_LOCKED = "Locked(uint256,address,uint256,uint64)", T_WITHDRAWN = "Withdrawn(uint256,address,uint256)", T_EXTENDED = "Extended(uint256,uint64)";
const FEED_CHUNK = 9000;
export async function feed(poolIds, { hours = 24 } = {}) {
  const ids = [...new Set((poolIds || []).map(lc).filter((x) => /^0x[0-9a-f]{64}$/.test(x)))].slice(0, 12);
  if (!ids.length) throw Object.assign(new Error("pools must be pool ids"), { status: 400 });
  hours = Math.max(1, Math.min(72, Number(hours) || 24));
  const latest = await latestBlock();
  let spb = 0.5;
  try {
    const back = Math.max(0, latest.number - 20000), ts = await blockTs(back);
    const m = (latest.ts - ts) / Math.max(1, latest.number - back);
    if (m > 0.05 && m < 20) spb = m;
  } catch { /* default */ }
  const lo = Math.max(0, latest.number - Math.ceil((hours * 3600) / spb));
  const ranges = [];
  for (let a = lo; a <= latest.number; a += FEED_CHUNK) ranges.push([a, Math.min(latest.number, a + FEED_CHUNK - 1)]);
  const topic = (s) => io.keccak("0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join(""));
  const [tM, tL, tW, tE] = [T_MODIFY, T_LOCKED, T_WITHDRAWN, T_EXTENDED].map(topic);
  const lp = L.LIQ_ADDR.lplock;
  const [mods, locks] = await Promise.all([
    pool(ranges, 8, ([a, b]) => getLogs({ address: L.LIQ_ADDR.poolManager, topics: [tM, ids], fromBlock: toQty(a), toBlock: toQty(b) })).then((x) => x.flat()),
    lp ? pool(ranges, 8, ([a, b]) => getLogs({ address: lp, topics: [[tL, tW, tE]], fromBlock: toQty(a), toBlock: toQty(b) })).then((x) => x.flat()) : [],
  ]);
  const s24 = (h) => { const v = BigInt.asIntN(24, BigInt("0x" + h.slice(-6))); return Number(v); };
  const pos = lc(L.LIQ_ADDR.positions);
  const out = [];
  for (const l of mods) {
    const d = strip(l.data), w = (k) => d.slice(k * 64, (k + 1) * 64);
    const delta = BigInt.asIntN(256, BigInt("0x" + w(2)));
    if (delta === 0n) continue; // a fee collection, not a liquidity change
    const sender = "0x" + strip(l.topics[2]).slice(24);
    out.push({ k: delta > 0n ? "add" : "remove", b: parseInt(l.blockNumber, 16), i: parseInt(l.logIndex, 16), h: l.transactionHash, pool: lc(l.topics[1]),
      sender, tl: s24(w(0)), tu: s24(w(1)), liq: (delta < 0n ? -delta : delta).toString(), id: lc(sender) === pos ? Number(BigInt("0x" + w(3))) : null });
  }
  for (const l of locks) {
    const t0 = l.topics[0], d = strip(l.data);
    const e = { b: parseInt(l.blockNumber, 16), i: parseInt(l.logIndex, 16), h: l.transactionHash, lockId: Number(BigInt(l.topics[1])) };
    if (t0 === tL) out.push({ ...e, k: "lock", id: Number(BigInt(l.topics[3])), unlockAt: Number(BigInt("0x" + d.slice(0, 64))) });
    else if (t0 === tW) out.push({ ...e, k: "withdraw", id: Number(BigInt(l.topics[3])) });
    else if (t0 === tE) out.push({ ...e, k: "extend", unlockAt: Number(BigInt("0x" + d.slice(0, 64))) });
  }
  out.sort((x, y) => (y.b - x.b) || (y.i - x.i));
  return { pools: ids, hours, lo, hi: latest.number, anchor: { block: latest.number, ts: latest.ts }, spb, events: out.slice(0, 80) };
}

// ---------------------------------------------------------------- one wallet's positions, every token
// Across every pool this site has indexed (ArcPad coins, $ARCIRCLE and any
// token looked up here): the live NFTs from each pool's log, then ownerOf —
// kept for a couple of minutes per instance.
const ownerMem = new Map(); // id → [owner, at]
export async function mine(wallet, { store = null, budgetMs = 8000 } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  wallet = lc(wallet);
  if (!isAddr(wallet)) throw Object.assign(new Error("wallet must be an address"), { status: 400 });
  const reg = ((await sget(store, "lppools/all")) || { pools: [] }).pools;
  const states = store && store.getMany ? await store.getMany(reg.map((id) => `lppool/${id}`)).catch(() => ({})) : {};
  const rows = [];
  for (const id of reg) {
    const st = states[`lppool/${id}`] || mem.get(`lppool/${id}`);
    if (st && Array.isArray(st.pos)) for (const r of st.pos) { const [nid, tl, tu, l] = r.split("|"); rows.push({ id: Number(nid), poolId: id, tl: Number(tl), tu: Number(tu), liquidity: BigInt(l) }); }
  }
  const fresh = Date.now() - 120e3;
  const need = rows.filter((r) => { const o = ownerMem.get(r.id); return !o || o[1] < fresh; });
  const selO = sel("ownerOf(uint256)");
  for (let i = 0; i < need.length && left() > 1500; i += 400) {
    const part = need.slice(i, i + 400);
    const res = await io.calls(part.map((r) => ({ to: L.LIQ_ADDR.positions, data: selO + pad(r.id) })));
    part.forEach((r, j) => { if (res[j] || !res.failed) ownerMem.set(r.id, [res[j] ? lc(wAddr(res[j], 0)) : "", Date.now()]); });
  }
  const done = rows.filter((r) => { const o = ownerMem.get(r.id); return o && o[1] >= fresh; }).length;
  if (done < rows.length) return { done: false, progress: done / Math.max(1, rows.length) };
  // positions sitting in ArcLPLock under this wallet's name
  const locked = new Map();
  const lp = L.LIQ_ADDR.lplock;
  if (lp) {
    const [h] = await io.calls([{ to: lp, data: sel("locksOfOwner(address)") + pad(wallet) }]);
    if (h) {
      const x = strip(h), idsOff = Number(BigInt("0x" + x.slice(0, 64))) * 2, outOff = Number(BigInt("0x" + x.slice(64, 128))) * 2;
      const n = Number(BigInt("0x" + x.slice(idsOff, idsOff + 64)));
      for (let k = 0; k < n; k++) {
        const b = outOff + 64 + k * 5 * 64, w = (m) => x.slice(b + m * 64, b + (m + 1) * 64);
        if (BigInt("0x" + w(4)) === 0n) locked.set(Number(BigInt("0x" + w(1))), Number(BigInt("0x" + w(3))));
      }
    }
  }
  const live = rows.filter((r) => ownerMem.get(r.id)[0] === wallet || locked.has(r.id));
  // the pools' keys
  const pids = [...new Set(live.map((r) => r.poolId))];
  const kr = pids.length ? await io.calls(pids.map((id) => ({ to: L.LIQ_ADDR.positions, data: sel("poolKeys(bytes25)") + strip(id).slice(0, 50).padEnd(64, "0") }))) : [];
  const keyBy = new Map();
  pids.forEach((id, j) => { const kh = kr[j]; if (kh && strip(kh).length >= 320) keyBy.set(id, { currency0: lc(wAddr(kh, 0)), currency1: lc(wAddr(kh, 1)), fee: Number(wBig(kh, 2)) }); });
  for (const r of live) { const k = keyBy.get(r.poolId); if (k) { r.c0 = k.currency0; r.c1 = k.currency1; r.key = k; } }
  const liveK = live.filter((r) => r.key);
  const cur = await meta(liveK.flatMap((r) => [r.c0, r.c1]));
  const QUOTES = [L.ZERO_ADDR, "0x3600000000000000000000000000000000000000"];
  const byPool = new Map();
  for (const r of liveK) {
    const g = byPool.get(r.poolId) || { poolId: r.poolId, fee: r.key.fee, positions: 0, locked: 0, c0: cur.get(lc(r.c0)), c1: cur.get(lc(r.c1)) };
    g.positions++; if (locked.has(r.id)) g.locked++;
    byPool.set(r.poolId, g);
  }
  const pools = [...byPool.values()].map((g) => {
    // the quote is USDC (ERC-20 or native) when there is one, else the side with fewer decimals
    const tokenSide = QUOTES.includes(lc(g.c0.address)) ? g.c1 : QUOTES.includes(lc(g.c1.address)) ? g.c0 : g.c1.decimals < g.c0.decimals ? g.c0 : g.c1;
    const quoteSide = tokenSide === g.c0 ? g.c1 : g.c0;
    return { poolId: g.poolId, feePct: L.feePct(g.fee), positions: g.positions, locked: g.locked, token: tokenSide, quote: quoteSide };
  }).sort((a, b) => b.positions - a.positions);
  return { done: true, wallet, pools };
}
