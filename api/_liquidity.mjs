// api/_liquidity.mjs — the Liquidity Manager's read side (/api/social?liq=<token>).
// For one token: every Uniswap v4 pool it trades in, each pool's price, fee
// and active liquidity, every liquidity position (NFT) in those pools with
// its owner, amounts and lock, and how much of the liquidity at the current
// price is locked, burned or free to leave.
//
// Pools are found three ways: the PositionManager's NFTs (the same resumable
// index the Holder Snapshot keeps, snaplp/<token>), the token's ArcPad launch
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

/// → { done:false, stage, progress } while the position index catches up, then the full picture.
export async function run(token, { store = null, wallet = "", budgetMs = 8000 } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  token = lc(token); wallet = lc(wallet);
  if (!isAddr(token)) throw Object.assign(new Error("token must be an address"), { status: 400 });

  // ---- the position index (shared with the Holder Snapshot) ----
  const pkey = `snaplp/${token}`;
  const idx = (await sget(store, pkey)) || { next: 1, ids: [] };
  const [nxH] = await io.calls([{ to: L.LIQ_ADDR.positions, data: sel("nextTokenId()") }]);
  const next = nxH ? Number(big(nxH)) : 0;
  if (next && idx.next < next) {
    const sc = await snapCore.scanPositions(io, token, idx.next, { until: () => left() < 2500 });
    if (!sc.unsupported) { idx.next = sc.next; idx.ids = idx.ids.concat(sc.ids); await sset(store, pkey, idx); }
    if (idx.next < next) return { done: false, stage: "positions", progress: Math.min(0.99, idx.next / next) };
  }

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
      positions: plist.slice(0, 200), positionCount: plist.length,
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
