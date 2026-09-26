// api/_liquidity.mjs — the Liquidity Manager's read side (/api/social?liq=<token>).
// For one token: every Uniswap v4 pool it trades in, each pool's price, fee
// and active liquidity, every liquidity position (NFT) in those pools with
// its owner, amounts and lock, and how much of the liquidity at the current
// price is locked, burned or free to leave.
//
// Pools are found three ways: the PositionManager's NFTs (one shared index of
// every position on Arc, lpidx/*), the token's ArcPad launch
// record, and Dexscreener's pair list. Liquidity that isn't an NFT (an ArcPad
// launch position sits in the PoolManager under the factory's own name) shows
// up as the part of the active liquidity no known position accounts for.
import { isAddr } from "./_arc.mjs";
import * as snapCore from "./_snap-core.mjs";
import * as scanCore from "./_scan-core.mjs";
import * as L from "./_liq-core.mjs";
import { io as snapIo } from "./_snapshot.mjs";
import { io as scanIo } from "./_scan.mjs";

const io = { ...scanIo, ...snapIo };
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

// ---------------------------------------------------------------- the position index
// Every PositionManager NFT's pool and range never change once minted, so they
// are read once for all of Arc and kept in chunks of 500 ids (lpidx/c<k>);
// full chunks are cached for good. A new token only filters the chunks — no
// per-token walk through every position.
const CH = 500;
const chunkMem = new Map(); // k → { hi, rows: [parsed] }
const parseRow = (r) => {
  const [id, c0, c1, fee, ts, hooks, tl, tu] = String(r).split("|");
  const key = { currency0: "0x" + c0, currency1: "0x" + c1, fee: Number(fee), tickSpacing: Number(ts), hooks: "0x" + hooks };
  return { id: Number(id), c0: key.currency0, c1: key.currency1, key, tl: Number(tl), tu: Number(tu), raw: r };
};
async function loadChunks(store, ks) {
  const need = ks.filter((k) => { const c = chunkMem.get(k); return !c || c.hi < (k + 1) * CH - 1; });
  if (need.length && store) {
    const keys = need.map((k) => `lpidx/c${k}`);
    for (let i = 0; i < keys.length; i += 40) {
      const part = keys.slice(i, i + 40);
      const got = store.getMany ? await store.getMany(part).catch(() => ({})) : Object.fromEntries(await Promise.all(part.map(async (k) => [k, await store.get(k).catch(() => null)])));
      for (const k of part) { const d = got[k]; if (d && Array.isArray(d.rows)) chunkMem.set(Number(k.slice(7)), { hi: Number(d.hi) || 0, rows: d.rows.map(parseRow) }); }
    }
  }
}
export async function positionsIndex(store, until = () => false) {
  const [nxH] = await io.calls([{ to: L.LIQ_ADDR.positions, data: sel("nextTokenId()") }]);
  const next = nxH ? Number(big(nxH)) : 1;
  const meta = (store ? await store.get("lpidx/meta").catch(() => null) : null) || mem.get("lpidx/meta") || { next: 1 };
  let at = Math.max(1, Number(meta.next) || 1);
  if (at < next) {
    // read what's missing, a few hundred ids per round, until the budget runs out
    const selI = sel("getPoolAndPositionInfo(uint256)");
    const touched = new Set();
    await loadChunks(store, [Math.floor(at / CH)]);
    while (at < next && !until()) {
      const ids = []; for (let x = at; x < Math.min(next, at + 800); x++) ids.push(x);
      const res = await io.calls(ids.map((x) => ({ to: L.LIQ_ADDR.positions, data: selI + pad(x) })));
      ids.forEach((x, j) => {
        const k = Math.floor(x / CH);
        const c = chunkMem.get(k) || { hi: k * CH - 1, rows: [] };
        const h = res[j];
        if (h && strip(h).length >= 64 * 6) {
          const c0 = word(h, 0).slice(24), c1 = word(h, 1).slice(24);
          if (!/^0+$/.test(c0 + c1)) {
            const info = wBig(h, 5);
            const s24 = (n) => (n & 0x800000 ? n - 0x1000000 : n);
            let ts = Number(wBig(h, 3) & 0xffffffn); if (ts & 0x800000) ts -= 0x1000000;
            const tl = s24(Number((info >> 8n) & 0xffffffn)), tu = s24(Number((info >> 32n) & 0xffffffn));
            const raw = [x, c0, c1, Number(wBig(h, 2)), ts, word(h, 4).slice(24), tl, tu].join("|");
            if (!c.rows.some((r) => r.id === x)) c.rows.push(parseRow(raw));
          }
        }
        c.hi = Math.max(c.hi, x);
        chunkMem.set(k, c); touched.add(k);
      });
      at = ids[ids.length - 1] + 1;
    }
    if (store) await Promise.all([...touched].map((k) => { const c = chunkMem.get(k); return store.set(`lpidx/c${k}`, { hi: c.hi, rows: c.rows.map((r) => r.raw) }).catch(() => null); }));
    const m2 = { next: at };
    mem.set("lpidx/meta", m2);
    if (store) await store.set("lpidx/meta", m2).catch(() => null);
    if (at < next) return { done: false, progress: Math.min(0.99, at / next) };
  }
  const K = Math.floor((next - 1) / CH);
  const ks = []; for (let k = 0; k <= K; k++) ks.push(k);
  await loadChunks(store, ks);
  const rows = [];
  for (const k of ks) { const c = chunkMem.get(k); if (c) for (const r of c.rows) { if (!r.poolId) r.poolId = lc(L.poolIdOf(r.key, io.keccak)); rows.push(r); } }
  return { done: true, rows, next };
}

/// → { done:false, stage, progress } while the position index catches up, then the full picture.
export async function run(token, { store = null, wallet = "", budgetMs = 8000 } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  token = lc(token); wallet = lc(wallet);
  if (!isAddr(token)) throw Object.assign(new Error("token must be an address"), { status: 400 });

  // ---- the position index (shared with the Holder Snapshot) ----
  // one index of every position on Arc, shared by every token (see positionsIndex)
  const ix = await positionsIndex(store, () => left() < 2500);
  if (!ix.done) return { done: false, stage: "positions", progress: ix.progress };
  const idx = { ids: ix.rows.filter((r) => r.c0 === token || r.c1 === token).map((r) => ({ id: r.id, poolId: r.poolId, is0: r.c0 === token, tl: r.tl, tu: r.tu })) };

  // ---- which pools ----
  const [arcpad, argus, dex] = await Promise.all([
    scanCore.readArcPad(io, token).catch(() => null),
    scanCore.readArgus(io, token).catch(() => null),
    scanCore.readMarket(io, token).catch(() => null),
  ]);
  const ids = new Set(idx.ids.map((p) => lc(p.poolId)));
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

  // ---- positions in those pools ----
  const inPools = idx.ids.filter((p) => pools.some((q) => q.id === lc(p.poolId)));
  const pos = [];
  for (let i = 0; i < inPools.length; i += 60) {
    const part = inPools.slice(i, i + 60);
    const res = await io.calls(part.flatMap((p) => [{ to: L.LIQ_ADDR.positions, data: sel("getPositionLiquidity(uint256)") + pad(p.id) }, { to: L.LIQ_ADDR.positions, data: sel("ownerOf(uint256)") + pad(p.id) }]));
    part.forEach((p, j) => { const liq = big(res[2 * j]); const own = res[2 * j + 1]; if (liq > 0n && own) pos.push({ ...p, liquidity: liq, owner: lc(wAddr(own, 0)) }); });
  }
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
    const [h] = await io.calls([{ to: lp, data }]);
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
    const venue = k && argus && argus.hook && lc(argus.hook) === k.hooks ? "Argus" : k && k.hooks === L.LIQ_ADDR.arcpadHook ? "ArcPad" : k && k.hooks !== L.ZERO_ADDR ? "Uniswap v4 · hook" : "Uniswap v4";
    const shares = { locked: 0n, burned: 0n, free: 0n, launch: 0n, other: 0n };
    let known = 0n;
    const plist = pos.filter((q) => lc(q.poolId) === p.id).map((q) => {
      const [a0, a1] = L.amountsFor(p.sqrtP, q.tl, q.tu, q.liquidity);
      const inRange = q.tl <= p.tick && p.tick < q.tu;
      let kind = "wallet", lock = null, label = null;
      if (L.LIQ_BURN.includes(q.owner)) kind = "burn";
      else if (lp && q.owner === lc(lp)) { lock = lockBy.get(q.id) || null; kind = lock && lock.unlockAt > now ? "locked" : "unlocking"; }
      else if (argusLocker && q.owner === argusLocker) { kind = "forever"; label = "Argus locker"; }
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
    launch: arcpad ? { venue: "ArcPad", creator: arcpad.creator || null } : argus ? { venue: "Argus", creator: argus.creator || null, locker: argusLocker } : null,
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
