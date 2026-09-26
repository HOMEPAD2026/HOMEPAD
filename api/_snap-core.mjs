// api/_snap-core.mjs — the Holder Snapshot engine, shared by the browser and
// the server so a snapshot gives the same list — and the same fingerprint —
// everywhere:
//   • arcpad.html#snapshot (arc-snapshot.js) — tools/build-bundles.mjs turns
//     this file into snap-core.js (window.ArcSnapCore) for the ArcPad bundle
//   • api/_snapshot.mjs — published and scheduled snapshots, the public API
// Pure JavaScript, no imports. Chain reads go through the `io` the caller
// passes in:
//   io.logs(filter)            → raw eth_getLogs result (throws on an error)
//   io.calls([{to, data}], tag) → [hex | null] — eth_call at a block tag
//   io.keccak(hex)             → 0x-prefixed keccak-256 of the bytes
//
// How a snapshot at block B is built. The server keeps every token's balance
// sheet up to date from its Transfer log (api/_scan.mjs, "the base", at block
// `hi`). Every Transfer after B is then undone, newest first, which gives the
// exact balance of every wallet at B. Going on further back to block H gives
// the lowest balance each wallet had anywhere in [H, B] — "held throughout".
// The walk is a job that can stop and resume (a server call has seconds).
// Locked tokens: with `locks`, moves into and out of ArcLock don't count and
// ArcLock's balance is handed back to each lock's owner, so locking never
// costs anyone their place. LP: positions in the token's Uniswap v4 pools are
// valued at B and added to their owners.

export const SNAP_VERSION = 1;
export const SNAP_ADDR = {
  arclock: "0x64f893947fe2c4fe7058cfba899ea269cba9f006",
  poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  positions: "0x6049c9a0e26405c0985f9e3685c87d0ae917f82b",
};
export const SNAP_BURN = ["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead", "0xdead000000000000000042069420694206942069"];
const ZERO = SNAP_BURN[0];
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const lcs = (a) => String(a || "").toLowerCase();
const big = (x) => { try { return BigInt(x || 0); } catch { return 0n; } };

// ---------------------------------------------------------------- text
/// Raw amount → plain decimal ("1234.5"), no rounding, no exponent.
export function units(raw, dec) {
  let v = big(raw); const neg = v < 0n; if (neg) v = -v;
  const s = v.toString().padStart(dec + 1, "0");
  const i = dec ? s.slice(0, -dec) : s, f = dec ? s.slice(-dec).replace(/0+$/, "") : "";
  return (neg ? "-" : "") + (f ? `${i}.${f}` : i);
}
/// Decimal text → raw amount; undefined when it isn't a number.
export function parseUnits(str, dec) {
  const v = String(str == null ? "" : str).trim().replace(/,/g, "");
  if (!v) return null;
  if (!/^\d*\.?\d+$/.test(v) && !/^\d+\.$/.test(v)) return undefined;
  const [i, f = ""] = (v.startsWith(".") ? "0" + v : v).split(".");
  if (f.length > dec) return BigInt(i) * 10n ** BigInt(dec) + BigInt(f.slice(0, dec));
  return BigInt(i) * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0");
}
export const pctOf = (v, of) => (of > 0n ? Number((big(v) * 1000000n) / of) / 10000 : 0);
const asciiHex = (s) => "0x" + [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
/// EIP-55 checksum.
export function checksum(a, keccak) {
  const h = lcs(a).slice(2), k = keccak(asciiHex(h)).slice(2);
  let out = "0x";
  for (let i = 0; i < 40; i++) out += parseInt(k[i], 16) >= 8 ? h[i].toUpperCase() : h[i];
  return out;
}
export const selector = (sig, keccak) => keccak(asciiHex(sig)).slice(0, 10);
const word = (hex, i) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
const wordBig = (hex, i) => BigInt("0x" + (word(hex, i) || "0"));
const wordAddr = (hex, i) => "0x" + word(hex, i).slice(24);
const padHex = (h) => String(h).replace(/^0x/, "").padStart(64, "0");
const enc = (n) => big(n).toString(16).padStart(64, "0");
const signed24 = (n) => (n & 0x800000 ? n - 0x1000000 : n);

// ---------------------------------------------------------------- the rewind job
/// A job: undo every Transfer of `token` after block B, from the base at `hi`,
/// down to block H (H = B without a hold period).
export function newJob({ token, hi, B, H, locks }) {
  return { v: SNAP_VERSION, token: lcs(token), hi, B, H: H == null ? B : Math.min(H, B), locks: !!locks, cursor: hi, d: {}, dB: null, w: {}, mint: "0", burn: "0", logs: 0, done: hi <= (H == null ? B : Math.min(H, B)) };
}
const toMap = (o) => new Map(Object.entries(o || {}).map(([k, v]) => [k, BigInt(v)]));
const toObj = (m) => { const o = {}; m.forEach((v, k) => { if (v !== 0n) o[k] = v.toString(); }); return o; };
function live(job) {
  return { d: toMap(job.d), dB: job.dB ? toMap(job.dB) : null, w: toMap(job.w), mint: big(job.mint), burn: big(job.burn) };
}
function store(job, L) {
  job.d = toObj(L.d); job.dB = L.dB ? toObj(L.dB) : null; job.w = toObj(L.w); job.mint = L.mint.toString(); job.burn = L.burn.toString();
}
function parse(l) {
  return { b: parseInt(l.blockNumber, 16), i: parseInt(l.logIndex, 16), fr: "0x" + l.topics[1].slice(26).toLowerCase(), to: "0x" + l.topics[2].slice(26).toLowerCase(), v: big(l.data && l.data !== "0x" ? l.data.slice(0, 66) : "0x0") };
}
function moves(job, x) {
  // with locks on, a move into or out of ArcLock stays with its owner
  if (job.locks && (x.to === SNAP_ADDR.arclock || x.fr === SNAP_ADDR.arclock)) return false;
  return x.fr !== x.to;
}
function applyLog(job, L, x) {
  const snapB = () => { L.dB = new Map(L.d); L.w = new Map(L.d); };
  if (!L.dB && x.b <= job.B) snapB();
  if (x.fr === ZERO) { if (x.b > job.B) L.mint += x.v; }
  if (x.to === ZERO) { if (x.b > job.B) L.burn += x.v; }
  if (!moves(job, x)) return;
  if (x.to !== ZERO) L.d.set(x.to, (L.d.get(x.to) || 0n) + x.v);
  if (x.fr !== ZERO) L.d.set(x.fr, (L.d.get(x.fr) || 0n) - x.v);
  if (x.b <= job.B && x.b > job.H) {
    for (const a of [x.fr, x.to]) {
      if (a === ZERO) continue;
      const cur = L.d.get(a) || 0n, was = L.w.has(a) ? L.w.get(a) : (L.dB.get(a) || 0n);
      L.w.set(a, cur > was ? cur : was);
    }
  }
}
/// Walks the job further back. opts: { chunk, wave, until(): bool (stop early), onProgress(frac) }.
export async function stepJob(io, job, { chunk = 9000, wave = 1, until = null, onProgress = null } = {}) {
  if (job.done) return job;
  const L = live(job);
  const low = job.H + 1, span = Math.max(1, job.hi - job.H);
  let first = true;
  while (job.cursor >= low) {
    // always at least one wave per call, so a short budget still makes progress
    if (!first && until && until()) break;
    first = false;
    const ranges = [];
    let b = job.cursor;
    for (let k = 0; k < wave && b >= low; k++) { const a = Math.max(low, b - chunk + 1); ranges.push([a, b]); b = a - 1; }
    const got = await Promise.all(ranges.map(([a, z]) => io.logs({ address: job.token, topics: [T_TRANSFER], fromBlock: "0x" + a.toString(16), toBlock: "0x" + z.toString(16) })));
    for (let r = 0; r < ranges.length; r++) {
      const xs = (got[r] || []).filter((l) => l.topics && l.topics.length >= 3).map(parse).sort((p, q) => q.b - p.b || q.i - p.i);
      for (const x of xs) applyLog(job, L, x);
      job.logs += xs.length;
      job.cursor = ranges[r][0] - 1;
      if (!L.dB && job.cursor <= job.B) { L.dB = new Map(L.d); L.w = new Map(L.d); }
    }
    if (onProgress) onProgress(Math.min(1, (job.hi - job.cursor) / span));
  }
  if (job.cursor < low) { job.done = true; if (!L.dB) { L.dB = new Map(L.d); L.w = new Map(L.d); } }
  store(job, L);
  return job;
}
/// The base moved on to `newHi`: fold the transfers in (hi, newHi] into the job.
export async function extendJob(io, job, newHi, { chunk = 9000, wave = 1 } = {}) {
  if (newHi <= job.hi) return job;
  const L = live(job);
  const ranges = [];
  for (let a = job.hi + 1; a <= newHi; a += chunk) ranges.push([a, Math.min(newHi, a + chunk - 1)]);
  for (let i = 0; i < ranges.length; i += wave) {
    const part = ranges.slice(i, i + wave);
    const got = await Promise.all(part.map(([a, z]) => io.logs({ address: job.token, topics: [T_TRANSFER], fromBlock: "0x" + a.toString(16), toBlock: "0x" + z.toString(16) })));
    for (const logs of got) for (const x of (logs || []).filter((l) => l.topics && l.topics.length >= 3).map(parse)) {
      if (x.fr === ZERO) L.mint += x.v;
      if (x.to === ZERO) L.burn += x.v;
      if (!moves(job, x)) continue;
      const add = (a, v) => { if (a === ZERO) return; L.d.set(a, (L.d.get(a) || 0n) + v); if (L.dB) L.dB.set(a, (L.dB.get(a) || 0n) + v); if (L.w.has(a)) L.w.set(a, L.w.get(a) + v); };
      add(x.to, x.v); add(x.fr, -x.v);
    }
  }
  job.hi = newHi;
  store(job, L);
  return job;
}

// ---------------------------------------------------------------- ArcLock
/// ArcLock.locksOfToken(token) → [{ id, owner, amount, lockedAt, unlockAt, withdrawn }]
export async function readLocks(io, token, tag = "latest") {
  const data = selector("locksOfToken(address)", io.keccak) + padHex(lcs(token).slice(2));
  const [hex] = await io.calls([{ to: SNAP_ADDR.arclock, data }], tag);
  if (!hex || hex === "0x") return [];
  const oIds = Number(wordBig(hex, 0)) / 32, oOut = Number(wordBig(hex, 1)) / 32;
  const n = Number(wordBig(hex, oIds)), m = Number(wordBig(hex, oOut));
  const out = [];
  for (let k = 0; k < Math.min(n, m); k++) {
    const base = oOut + 1 + k * 6;
    out.push({ id: Number(wordBig(hex, oIds + 1 + k)), token: wordAddr(hex, base), owner: wordAddr(hex, base + 1), amount: wordBig(hex, base + 2), lockedAt: Number(wordBig(hex, base + 3)), unlockAt: Number(wordBig(hex, base + 4)), withdrawn: wordBig(hex, base + 5) !== 0n });
  }
  return out;
}
/// Owner → tokens still sitting in ArcLock for them (what ArcLock's balance is made of).
export function lockedByOwner(locks) {
  const m = new Map();
  for (const l of locks) if (!l.withdrawn && l.amount > 0n) m.set(lcs(l.owner), (m.get(lcs(l.owner)) || 0n) + l.amount);
  return m;
}

// ---------------------------------------------------------------- Uniswap v4 LP
const Q96 = 1n << 96n, MAXU = (1n << 256n) - 1n;
const TICK_K = [
  [0x2, 0xfff97272373d413259a46990580e213an], [0x4, 0xfff2e50f5f656932ef12357cf3c7fdccn], [0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10, 0xffcb9843d60f6159c9db58835c926644n], [0x20, 0xff973b41fa98c081472e6896dfb254c0n], [0x40, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80, 0xfe5dee046a99a2a811c461f1969c3053n], [0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4n], [0x200, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400, 0xf3392b0822b70005940c7a398e4b70f3n], [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n], [0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5n], [0x4000, 0x70d869a156d2a1b890bb3df62baf32f7n], [0x8000, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9n], [0x20000, 0x5d6af8dedb81196699c329225ee604n], [0x40000, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000, 0x48a170391f7dc42444e8fa2n],
];
/// Uniswap's TickMath.getSqrtPriceAtTick, in BigInt.
export function sqrtAtTick(tick) {
  const abs = Math.abs(tick);
  let p = abs & 1 ? 0xfffcb933bd6fad37aa2d162d1a594001n : 1n << 128n;
  for (const [bit, k] of TICK_K) if (abs & bit) p = (p * k) >> 128n;
  if (tick > 0) p = MAXU / p;
  return (p >> 32n) + (p % (1n << 32n) === 0n ? 0n : 1n);
}
/// LiquidityAmounts.getAmountsForLiquidity → [amount0, amount1]
export function amountsFor(sqrtP, tickLower, tickUpper, liq) {
  let a = sqrtAtTick(tickLower), b = sqrtAtTick(tickUpper);
  if (a > b) [a, b] = [b, a];
  const a0 = (x, y) => ((liq << 96n) * (y - x)) / y / x;
  const a1 = (x, y) => (liq * (y - x)) / Q96;
  if (sqrtP <= a) return [a0(a, b), 0n];
  if (sqrtP < b) return [a0(sqrtP, b), a1(a, sqrtP)];
  return [0n, a1(a, b)];
}
/// Scans the PositionManager's NFTs from `from` for positions in pools that
/// hold `token`. → { next, ids: [{ id, poolId, c0, is0, tl, tu }] }
export async function scanPositions(io, token, from = 1, { batch = 100, max = 3000, until = null } = {}) {
  token = lcs(token);
  const k = io.keccak;
  const [nx] = await io.calls([{ to: SNAP_ADDR.positions, data: selector("nextTokenId()", k) }], "latest");
  if (!nx || nx === "0x") return { next: from, ids: [], unsupported: true };
  const next = Number(big(nx));
  const sel = selector("getPoolAndPositionInfo(uint256)", k);
  const ids = [];
  let id = Math.max(1, from), seen = 0;
  while (id < next && seen < max) {
    if (seen && until && until()) break;
    const part = [];
    for (let j = 0; j < batch && id < next; j++, id++) part.push(id);
    seen += part.length;
    const res = await io.calls(part.map((x) => ({ to: SNAP_ADDR.positions, data: sel + enc(x) })), "latest");
    part.forEach((x, j) => {
      const h = res[j];
      if (!h || h.length < 2 + 64 * 6) return;
      const c0 = wordAddr(h, 0), c1 = wordAddr(h, 1);
      if (c0 !== token && c1 !== token) return;
      const info = wordBig(h, 5);
      const tl = signed24(Number((info >> 8n) & 0xffffffn)), tu = signed24(Number((info >> 32n) & 0xffffffn));
      const poolId = k("0x" + [0, 1, 2, 3, 4].map((i) => word(h, i)).join(""));
      ids.push({ id: x, poolId, is0: c0 === token, tl, tu });
    });
  }
  return { next: id, ids };
}
/// The positions' owners and their share of `token` at a block tag.
/// → { byOwner: Map, positions: [{ id, owner, amount }], approx }
export async function lpAt(io, positions, tag) {
  const k = io.keccak;
  const out = { byOwner: new Map(), positions: [], approx: false };
  if (!positions.length) return out;
  const selL = selector("getPositionLiquidity(uint256)", k), selO = selector("ownerOf(uint256)", k), selX = selector("extsload(bytes32)", k);
  const pools = [...new Set(positions.map((p) => p.poolId))];
  const slot0 = async (t) => io.calls(pools.map((id) => ({ to: SNAP_ADDR.poolManager, data: selX + k("0x" + padHex(id) + padHex("0x6")).slice(2) })), t);
  let s0 = await slot0(tag).catch(() => null);
  if (!s0 || s0.some((x) => x == null)) { s0 = await slot0("latest"); out.approx = tag !== "latest"; }
  const price = new Map(pools.map((id, i) => [id, big(s0[i]) & ((1n << 160n) - 1n)]));
  for (let i = 0; i < positions.length; i += 50) {
    const part = positions.slice(i, i + 50);
    const calls = part.flatMap((p) => [{ to: SNAP_ADDR.positions, data: selL + enc(p.id) }, { to: SNAP_ADDR.positions, data: selO + enc(p.id) }]);
    let r = await io.calls(calls, tag).catch(() => null);
    if (!r) { r = await io.calls(calls, "latest"); out.approx = true; }
    part.forEach((p, j) => {
      const liq = big(r[2 * j]), ownHex = r[2 * j + 1];
      if (!liq || !ownHex || ownHex.length < 66) return;
      const owner = "0x" + ownHex.slice(-40).toLowerCase();
      const sp = price.get(p.poolId);
      if (!sp) return;
      const [a0, a1] = amountsFor(sp, p.tl, p.tu, liq);
      const amount = p.is0 ? a0 : a1;
      if (amount <= 0n) return;
      out.positions.push({ id: p.id, owner, amount });
      out.byOwner.set(owner, (out.byOwner.get(owner) || 0n) + amount);
    });
  }
  return out;
}

// ---------------------------------------------------------------- rows
/// base: Map(address → balance at job.hi). → { rows: [{ a, v, min, now, locked, lp }], supply }
export function finishRows(job, base, { supplyNow, locked = null, lp = null } = {}) {
  const eff = new Map(base);
  if (job.locks && locked) {
    eff.delete(SNAP_ADDR.arclock);
    locked.forEach((v, a) => eff.set(a, (eff.get(a) || 0n) + v));
  }
  const dB = toMap(job.dB), w = toMap(job.w), hold = job.H < job.B;
  const all = new Set([...eff.keys(), ...dB.keys()]);
  const rows = [];
  for (const a of all) {
    const now = eff.get(a) || 0n, atB = now - (dB.get(a) || 0n);
    let min = hold ? now - (w.has(a) ? w.get(a) : (dB.get(a) || 0n)) : atB;
    if (min > atB) min = atB;
    const extra = lp ? lp.get(a) || 0n : 0n;
    if (atB + extra <= 0n) continue;
    rows.push({ a, v: (atB > 0n ? atB : 0n) + extra, min: (min > 0n ? min : 0n) + extra, now, locked: job.locks && locked ? locked.get(a) || 0n : 0n, lp: extra, odd: atB < 0n });
  }
  rows.sort((x, y) => (y.v > x.v ? 1 : y.v < x.v ? -1 : x.a < y.a ? -1 : 1));
  return { rows, supply: big(supplyNow) - big(job.mint) + big(job.burn) };
}

// ---------------------------------------------------------------- filters
/// opts: { min, max (raw | null), top, noC, contracts: Set, since: any|some|all,
///         skip: Set, hold: bool (use the held-throughout balance), also: { mode: and|or, set: Set } }
export function applyFilters(rows, o = {}) {
  const why = { burn: 0, contract: 0, small: 0, big: 0, sold: 0, skip: 0, hold: 0, other: 0 };
  const val = (x) => (o.hold ? x.min : x.v);
  let list = [];
  const extra = o.also && o.also.mode === "or" ? new Set(o.also.set) : null;
  for (const x of rows) {
    if (extra) extra.delete(x.a);
    if (SNAP_BURN.includes(x.a)) { why.burn++; continue; }
    if (o.skip && o.skip.has(x.a)) { why.skip++; continue; }
    if (o.noC && o.contracts && o.contracts.has(x.a)) { why.contract++; continue; }
    if (o.also && o.also.mode === "and" && !o.also.set.has(x.a)) { why.other++; continue; }
    if (o.hold && val(x) <= 0n) { why.hold++; continue; }
    if (o.min != null && val(x) < o.min) { why.small++; continue; }
    if (o.max != null && val(x) > o.max) { why.big++; continue; }
    if (o.since === "some" && x.now === 0n) { why.sold++; continue; }
    if (o.since === "all" && x.now < x.v) { why.sold++; continue; }
    list.push(x);
  }
  if (o.hold) list.sort((x, y) => (y.min > x.min ? 1 : y.min < x.min ? -1 : x.a < y.a ? -1 : 1));
  if (o.top && list.length > o.top) list = list.slice(0, o.top);
  if (extra) for (const a of [...extra].sort()) {
    if (SNAP_BURN.includes(a) || (o.skip && o.skip.has(a)) || (o.noC && o.contracts && o.contracts.has(a))) continue;
    list.push({ a, v: 0n, min: 0n, now: 0n, locked: 0n, lp: 0n, added: true });
  }
  return { list, why };
}

// ---------------------------------------------------------------- airdrop calculator
const isqrt = (n) => { if (n < 2n) return n; let x = n, y = (x + 1n) >> 1n; while (y < x) { x = y; y = (x + n / x) >> 1n; } return x; };
/// opts: { total, method: prop|sqrt|equal|tiers, cap, min, tiers: [[threshold, amount]], hold }
/// → amounts (BigInt[]) aligned with `list`; 0 = gets nothing.
export function calcAmounts(list, o) {
  const n = list.length, out = new Array(n).fill(0n);
  if (!n) return out;
  const val = (x) => (o.hold ? x.min : x.v);
  if (o.method === "tiers") {
    const tiers = (o.tiers || []).filter(([t, a]) => a > 0n).sort((p, q) => (q[0] > p[0] ? 1 : -1));
    list.forEach((x, i) => { const t = tiers.find(([th]) => val(x) >= th); out[i] = t ? t[1] : 0n; });
    return out;
  }
  const total = big(o.total);
  if (total <= 0n) return out;
  const weight = (x) => (o.method === "equal" ? 1n : o.method === "sqrt" ? isqrt(val(x) * 10n ** 18n) : val(x));
  let open = list.map((_, i) => i).filter((i) => weight(list[i]) > 0n);
  let left = total;
  const cap = o.cap && o.cap > 0n ? o.cap : null, min = o.min && o.min > 0n ? o.min : null;
  for (let round = 0; round < 60 && open.length && left > 0n; round++) {
    const W = open.reduce((s, i) => s + weight(list[i]), 0n);
    if (W === 0n) break;
    const share = new Map(open.map((i) => [i, (left * weight(list[i])) / W]));
    const over = cap ? open.filter((i) => out[i] + share.get(i) > cap) : [];
    if (over.length) { for (const i of over) { left -= cap - out[i]; out[i] = cap; } open = open.filter((i) => !over.includes(i)); continue; }
    const under = min ? open.filter((i) => out[i] + share.get(i) < min) : [];
    if (under.length) { open = open.filter((i) => !under.includes(i)); continue; }
    let given = 0n;
    for (const i of open) { out[i] += share.get(i); given += share.get(i); }
    left -= given;
    // the rounding dust goes to the first (largest) open wallet, within the cap
    if (left > 0n && open.length) { const i = open[0]; const room = cap ? cap - out[i] : left; const add = left < room ? left : room; out[i] += add; left -= add; }
    break;
  }
  return out;
}

// ---------------------------------------------------------------- outputs
/// meta: { decimals, supply, hold, since (a past snapshot: add balance_now), amounts, keccak }
export function toCsv(list, meta) {
  const dec = meta.decimals, k = meta.keccak;
  const cols = ["rank", "address", "balance", "percent_of_supply"];
  if (meta.hold) cols.push("held_throughout");
  if (meta.since) cols.push("balance_now");
  if (meta.amounts) cols.push("airdrop");
  const lines = list.map((x, i) => {
    const c = [i + 1, checksum(x.a, k), units(x.v, dec), pctOf(x.v, big(meta.supply))];
    if (meta.hold) c.push(units(x.min, dec));
    if (meta.since) c.push(units(x.now, dec));
    if (meta.amounts) c.push(units(meta.amounts[i] || 0n, meta.amountDecimals == null ? dec : meta.amountDecimals));
    return c.join(",");
  });
  return `${cols.join(",")}\n${lines.join("\n")}\n`;
}
export const fingerprint = (csv, keccak) => keccak(asciiHexUtf8(csv));
function asciiHexUtf8(s) {
  let h = "0x";
  for (const b of new TextEncoder().encode(s)) h += b.toString(16).padStart(2, "0");
  return h;
}
/// Claim-drop Merkle root over (index, account, amount) — ArcDrop's leaf format.
export function merkleRoot(entries, keccak) {
  if (!entries.length) return null;
  let level = entries.map(([i, a, v]) => keccak(keccak("0x" + enc(i) + padHex(lcs(a).slice(2)) + enc(v))));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 >= level.length) { next.push(level[i]); continue; }
      const [x, y] = [level[i], level[i + 1]].sort();
      next.push(keccak("0x" + x.slice(2) + y.slice(2)));
    }
    level = next;
  }
  return level[0];
}
/// Two lists → who joined, left, went up, went down.
export function diffLists(before, after, hold) {
  const val = (x) => (hold ? x.min : x.v);
  const A = new Map(before.map((x) => [x.a, val(x)])), B = new Map(after.map((x) => [x.a, val(x)]));
  const out = { joined: [], left: [], up: [], down: [], same: 0 };
  B.forEach((v, a) => { if (!A.has(a)) out.joined.push([a, 0n, v]); else if (v > A.get(a)) out.up.push([a, A.get(a), v]); else if (v < A.get(a)) out.down.push([a, A.get(a), v]); else out.same++; });
  A.forEach((v, a) => { if (!B.has(a)) out.left.push([a, v, 0n]); });
  const by = (r) => (x, y) => (r(y) > r(x) ? 1 : r(y) < r(x) ? -1 : 0);
  out.joined.sort(by((x) => x[2])); out.left.sort(by((x) => x[1])); out.up.sort(by((x) => x[2] - x[1])); out.down.sort(by((x) => x[1] - x[2]));
  return out;
}
/// Lorenz curve points (share of wallets → share of tokens, poorest first) and the Gini index.
export function lorenz(list, hold, points = 40) {
  const vals = list.map((x) => Number(hold ? x.min : x.v)).filter((v) => v > 0).sort((a, b) => a - b);
  const n = vals.length, tot = vals.reduce((s, v) => s + v, 0);
  if (!n || !tot) return { pts: [[0, 0], [1, 1]], gini: 0 };
  let cum = 0, area = 0, prev = 0;
  const pts = [[0, 0]];
  vals.forEach((v, i) => {
    cum += v;
    const y = cum / tot;
    area += (prev + y) / 2 / n; prev = y;
    if (n <= points || (i + 1) % Math.ceil(n / points) === 0 || i === n - 1) pts.push([(i + 1) / n, y]);
  });
  return { pts, gini: Math.max(0, Math.min(1, 1 - 2 * area)) };
}
/// rows travel/are kept as "addr|v|min|now|locked|lp" in base 36, "=" for "same as v"
const b36 = (v) => (v === 0n ? "" : v.toString(36));
const u36 = (s) => { if (!s) return 0n; let n = 0n; for (const ch of s) n = n * 36n + BigInt(parseInt(ch, 36)); return n; };
export const packRows = (rows) => rows.map((x) => [x.a.slice(2), b36(x.v), x.min === x.v ? "=" : b36(x.min), x.now === x.v ? "=" : b36(x.now), b36(x.locked || 0n), b36(x.lp || 0n)].join("|"));
export function unpackRows(arr) {
  return (arr || []).map((s) => {
    const [a, v, m, n, l, p] = s.split("|");
    const V = u36(v);
    return { a: "0x" + a, v: V, min: m === "=" || m == null ? V : u36(m), now: n === "=" || n == null ? V : u36(n), locked: u36(l), lp: u36(p) };
  });
}

/// Filter options in one normal form (published snapshots, signatures, links).
export function normFilters(f = {}) {
  const num = (x) => (/^\d*\.?\d+$/.test(String(x == null ? "" : x).trim()) ? String(x).trim() : "");
  return {
    min: num(f.min), max: num(f.max), top: Math.max(0, Math.min(8000, parseInt(f.top, 10) || 0)) || "", noC: f.noC !== false,
    since: ["some", "all"].includes(f.since) ? f.since : "any", hold: Math.max(0, Math.min(90 * 86400, Number(f.hold) || 0)),
    locks: f.locks !== false, lp: !!f.lp,
    skip: [...new Set((Array.isArray(f.skip) ? f.skip : []).map(lcs).filter((a) => /^0x[0-9a-f]{40}$/.test(a)))].sort().slice(0, 500),
  };
}
/// The text a publisher signs (personal_sign) — built the same on both sides.
export function sigText(kind, d) {
  return [`ARCIRCLE PAD snapshot — ${kind === "schedule" ? "scheduled" : "published"}`, `Token: ${lcs(d.token)}`,
    kind === "schedule" ? `At: ${new Date(d.at * 1000).toISOString()}` : `Block: ${d.block}`, `Filters: ${filterKey(d.f)}`, d.title ? `Title: ${d.title}` : ""].filter(Boolean).join("\n");
}
/// Normalised filter options → a short stable string (share links, published snapshots).
export function filterKey(o) {
  return [o.min || "", o.max || "", o.top || "", o.noC ? 1 : 0, o.since || "any", o.hold || 0, o.locks ? 1 : 0, o.lp ? 1 : 0, [...(o.skip || [])].sort().join(".")].join("~");
}
