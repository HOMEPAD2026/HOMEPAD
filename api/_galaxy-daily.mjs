// api/_galaxy-daily.mjs — ARC GALAXY's daily records (GXD): every block of a chain read once, a UTC day at a time, kept.
// The live feed (api/_arc-galaxy.mjs) only holds ten minutes in a warm function; this keeper reads the chain on a clock
// (cron-job.org's every-minute call: api/arcia-tg.mjs ?buys=1, or /api/social?arc=galaxy-collect&key=<CRON_SECRET>) from
// a cursor, so a day's numbers don't depend on anyone watching the page.
//
// Stored (the store, api/_store.mjs):
//   <key>Daily/cursor            { n: the last block read, ts, at, gaps: blocks skipped after a long sleep }
//   <key>DailyLock/<n>_<slot>    create-once: only one call reads from a cursor (a crashed call frees it in LOCK_SLOT_MS)
//   <key>Day/<YYYY-MM-DD>        { j: JSON(day), at } — see blank() for the day's fields
// Read: dailyList(days) — the last days' totals; dailyOne(d) — one day in full (hours, minutes, top contracts, CCTP).
// Nothing here writes to a chain or signs anything.
import * as fstore from "./_store.mjs";

export const CHUNK = 60;              // blocks a read (block + receipts = 2 calls each, batches of 40)
export const MAX_PER_CALL = 1200;     // blocks one call reads at most (Arc makes ~120 a minute)
export const MAX_BEHIND = 14400;      // further behind than this (~2 h of Arc) → skip ahead, counted as a gap
export const START_BACK = 120;        // the very first call starts this many blocks back
export const LOCK_SLOT_MS = 5 * 60e3;
export const TOP_KEEP = 200, TOP_CAP = 400;
export const HLL_P = 11, HLL_M = 1 << HLL_P;
const hx = (n) => "0x" + Number(n).toString(16);
const lc = (a) => String(a || "").toLowerCase();
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// ---------------------------------------------------------------- HyperLogLog (active wallets, ≈ 2.3 %)
// 11 bits of one hash pick the register, the other gives the rank. Registers as one string (a char a register) so a
// day stays small.
export const hllNew = () => "0".repeat(HLL_M);
// any address (vanity ones start with zeros): two 32-bit hashes of the whole string (FNV-1a + murmur3's finaliser)
const fmix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
function hHash(a) {
  const s = lc(a); let x = 2166136261, y = 0x811c9dc5 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); x = Math.imul(x ^ c, 16777619); y = Math.imul(y ^ c, 0x01000193) + i; }
  return [fmix(x >>> 0), fmix((y ^ 0x9e3779b9) >>> 0)];
}
export function hllAdd(reg, addrs) {
  const r = reg.split("").map((c) => c.charCodeAt(0) - 48);
  for (const a of addrs) {
    if (!a) continue;
    const [x, y] = hHash(a), i = x >>> (32 - HLL_P), rank = Math.min(40, Math.clz32(y) + 1);
    if (rank > r[i]) r[i] = rank;
  }
  return String.fromCharCode(...r.map((v) => 48 + v));
}
export function hllCount(reg) {
  let sum = 0, zeros = 0;
  for (let i = 0; i < reg.length; i++) { const v = reg.charCodeAt(i) - 48; sum += 2 ** -v; if (!v) zeros++; }
  const m = reg.length, alpha = 0.7213 / (1 + 1.079 / m), e = alpha * m * m / sum;
  return Math.round(e <= 2.5 * m && zeros ? m * Math.log(m / zeros) : e);
}
export function hllMerge(a, b) { let o = ""; for (let i = 0; i < a.length; i++) o += a.charCodeAt(i) >= b.charCodeAt(i) ? a[i] : b[i]; return o; }

// ---------------------------------------------------------------- a day
export function blank(d) {
  return {
    d, blocks: 0, txs: 0, fail: 0, known: 0, usd: 0, fee: 0, feeTxs: 0, auth: 0,
    kinds: new Array(8).fill(0),
    hTx: new Array(24).fill(0), hUsd: new Array(24).fill(0), hFail: new Array(24).fill(0), hFee: new Array(24).fill(0),
    min: new Array(1440).fill(0),          // txs a minute → the peak minute, the hours' shape
    secs: 0,                               // seconds of the day covered by blocks read back to back
    first: 0, last: 0,                     // the first / last block read for the day
    peakBlock: null,                       // [txs, block, ts]
    whale: null,                           // [cents, tx, ts] — the biggest USDC move that succeeded
    cIn: {}, cOut: {},                     // CCTP: domain → cents (in = minted on this chain from it; out = burned to it)
    top: {},                               // contract → calls (not plain USDC sends, not deployments)
    born: 0,                               // contracts deployed
    hll: hllNew(),
  };
}
const capTop = (top) => { const e = Object.entries(top); if (e.length <= TOP_CAP) return top; return Object.fromEntries(e.sort((a, b) => b[1] - a[1]).slice(0, TOP_KEEP)); };

/// one block (+ receipts) into its day; prev = the block read just before it (for the seconds covered)
export function addBlock(day, b, rcs, classify, prev, opt = {}) {
  const n = Number(b.number), ts = Number(b.timestamp) * 1000, d = new Date(ts), h = d.getUTCHours(), mi = h * 60 + d.getUTCMinutes();
  const byHash = new Map((rcs || []).map((r) => [lc(r.transactionHash), r]));
  const txs = (b.transactions || []).filter((t) => typeof t === "object");
  const from = [];
  for (const tx of txs) {
    const c = classify(tx, byHash.get(lc(tx.hash)) || null);
    day.txs++; day.kinds[c.k] = (day.kinds[c.k] || 0) + 1;
    if (c.ok !== -1) { day.known++; if (c.ok === 0) { day.fail++; day.hFail[h]++; } }
    day.usd += c.usd; day.hUsd[h] += c.usd;
    if (rcs) { day.fee += c.fee || 0; day.hFee[h] += c.fee || 0; day.feeTxs++; }
    day.auth += c.auth || 0;
    if (c.k === 5) day.born++;
    if (c.usd > 0 && c.ok !== 0 && (!day.whale || c.usd > day.whale[0])) day.whale = [c.usd, lc(tx.hash), ts];
    if (c.br && typeof c.br === "string") { const box = c.br[0] === "i" ? day.cIn : day.cOut, k = c.br.slice(1); box[k] = (box[k] || 0) + c.usd; }
    const to = lc(tx.to || "");
    if (to && c.k !== 0 && c.k !== 5 && !(opt.skipTop && opt.skipTop(to))) day.top[to] = (day.top[to] || 0) + 1;
    from.push(lc(tx.from));
  }
  day.blocks++; day.hTx[h] += txs.length; day.min[mi] += txs.length;
  if (!day.peakBlock || txs.length > day.peakBlock[0]) day.peakBlock = [txs.length, n, ts];
  if (!day.first || n < day.first) day.first = n;
  if (n > day.last) day.last = n;
  if (prev && prev.n === n - 1 && dayOf(prev.ts) === day.d && ts >= prev.ts && ts - prev.ts < 60e3) day.secs += (ts - prev.ts) / 1000;
  if (from.length) day.hll = hllAdd(day.hll, from);
  day.top = capTop(day.top);
  return { n, ts };
}

/// a day's totals (the list / the trends): what the page draws without the minutes
export function summary(day) {
  const pm = day.min.reduce((m, v, i) => (v > m[0] ? [v, i] : m), [0, 0]);
  const sum = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0);
  return {
    d: day.d, blocks: day.blocks, txs: day.txs, usd: day.usd, fee: day.fee, feeTxs: day.feeTxs, auth: day.auth, born: day.born,
    failRate: day.known ? day.fail / day.known : null, wallets: hllCount(day.hll), kinds: day.kinds,
    peakTps: pm[0] / 60, peakMin: pm[1], peakBlock: day.peakBlock, whale: day.whale,
    avgTps: day.secs > 0 ? day.txs / day.secs : null, cov: Math.min(1, day.secs / 86400),
    bridgeIn: sum(day.cIn), bridgeOut: sum(day.cOut),
  };
}

const storeOn = () => { try { return fstore.storeEnabled(); } catch { return false; } };
export const realStore = {
  get: (p) => fstore.getDocs(p),
  set: (p, d) => fstore.setDoc(p, d),
  commit: (w) => fstore.commit(w),
  on: storeOn,
};
const pack = (day) => ({ j: JSON.stringify(day), at: Date.now(), d: day.d });
const unpack = (doc, d) => { if (!doc || !doc.j) return blank(d); try { const o = JSON.parse(doc.j); return { ...blank(d), ...o, hll: o.hll && o.hll.length === HLL_M ? o.hll : hllNew() }; } catch { return blank(d); } };

/// makeDaily({ rpc, classify, key }) — rpc(body) a raw JSON-RPC (single or batch); classify(tx, rc) → { k, usd, ok, fee, auth, br }
export function makeDaily({ rpc, classify, key = "arcGalaxy", store = realStore, now = () => Date.now(), chunk = CHUNK, batch = 40, skipTop = null } = {}) {
  const K = { cursor: key + "Daily/cursor", day: (d) => key + "Day/" + d, lock: (n, t) => key + "DailyLock/" + n + "_" + Math.floor(t / LOCK_SLOT_MS) };
  const call = async (method, params) => { const r = await rpc({ jsonrpc: "2.0", id: 1, method, params }); if (r && r.error) throw new Error(r.error.message || "rpc error"); return r.result; };
  let receipts = true;
  async function readBlocks(from, to) {
    const ns = []; for (let n = from; n <= to; n++) ns.push(n);
    const body = [];
    ns.forEach((n, i) => { body.push({ jsonrpc: "2.0", id: 2 * i, method: "eth_getBlockByNumber", params: [hx(n), true] }); if (receipts) body.push({ jsonrpc: "2.0", id: 2 * i + 1, method: "eth_getBlockReceipts", params: [hx(n)] }); });
    const out = [];
    for (let i = 0; i < body.length; i += batch) { const r = await rpc(body.slice(i, i + batch)); out.push(...(Array.isArray(r) ? r : [])); }
    const by = new Map(out.filter(Boolean).map((r) => [r.id, r]));
    const res = [];
    for (let i = 0; i < ns.length; i++) {
      const b = by.get(2 * i), r = receipts ? by.get(2 * i + 1) : null;
      if (!b || !b.result) break; // keep it contiguous: stop at the first block we couldn't read
      if (r && r.error && /not (found|supported|available)|unknown|does not exist/i.test(String(r.error.message))) receipts = false;
      res.push({ b: b.result, rcs: r && Array.isArray(r.result) ? r.result : null });
    }
    return res;
  }

  /// one keeper call: read from the cursor for up to budgetMs, fold the blocks into their days, save
  async function collect({ budgetMs = 18000 } = {}) {
    const t0 = now();
    if (!store.on()) return { skipped: "no store" };
    const head = Number(await call("eth_blockNumber", []));
    const cur = (await store.get([K.cursor]))[K.cursor] || null;
    let from = cur && cur.n ? cur.n + 1 : head - START_BACK + 1, gap = 0;
    if (head - from + 1 > MAX_BEHIND) { gap = head - START_BACK + 1 - from; from = head - START_BACK + 1; }
    if (from > head) return { head, upToDate: true };
    const lk = await store.commit([{ create: K.lock(from, t0), data: { at: t0, from } }]);
    if (!lk.ok) return { head, busy: true };
    let prev = cur && cur.n === from - 1 ? { n: cur.n, ts: cur.ts } : null;
    const days = new Map(); // d → day (loaded once)
    const load = async (d) => { if (!days.has(d)) days.set(d, unpack((await store.get([K.day(d)]))[K.day(d)], d)); return days.get(d); };
    let read = 0, n = from - 1;
    const stop = Math.min(head, from + MAX_PER_CALL - 1);
    const save = async () => {
      if (!prev) return;
      const w = [...days.values()].map((day) => ({ set: K.day(day.d), data: pack(day) }));
      w.push({ set: K.cursor, data: { n: prev.n, ts: prev.ts, at: now(), gaps: ((cur && cur.gaps) || 0) + gap, head } });
      await store.commit(w);
    };
    try {
      while (n < stop && now() - t0 < budgetMs) {
        const to = Math.min(stop, n + chunk), want = to - n;
        const got = await readBlocks(n + 1, to);
        if (!got.length) break;
        for (const { b, rcs } of got) { const day = await load(dayOf(Number(b.timestamp) * 1000)); prev = addBlock(day, b, rcs, classify, prev, { skipTop }); }
        n = prev.n; read += got.length;
        if (got.length < want) break; // the node doesn't have the rest yet
      }
    } finally {
      if (read) await save();
      await store.commit([{ del: K.lock(from, t0) }]).catch(() => null); // free it (a crash leaves it to its slot)
    }
    const today = days.get(dayOf(now()));
    return { head, from, to: n, read, behind: head - n, gap, receipts, ms: now() - t0, today: today ? { txs: today.txs, blocks: today.blocks, cov: Math.round(Math.min(1, today.secs / 86400) * 1000) / 10 } : null };
  }

  /// the last `days` days' totals, newest last (days with nothing read are left out)
  async function list(days = 30) {
    days = Math.max(1, Math.min(120, Number(days) || 30));
    const t = now(), ds = Array.from({ length: days }, (_, i) => dayOf(t - (days - 1 - i) * 864e5));
    const got = store.on() ? await store.get(ds.map(K.day)) : {};
    const out = []; for (const d of ds) { const doc = got[K.day(d)]; if (doc && doc.j) out.push(summary(unpack(doc, d))); }
    const c = store.on() ? (await store.get([K.cursor]))[K.cursor] : null;
    return { at: t, days: out, cursor: c ? { n: c.n, ts: c.ts, at: c.at, gaps: c.gaps || 0 } : null };
  }
  /// one day in full: totals + hours + minutes + top contracts + CCTP by domain
  async function one(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ""))) return null;
    const doc = store.on() ? (await store.get([K.day(d)]))[K.day(d)] : null;
    if (!doc || !doc.j) return null;
    const day = unpack(doc, d);
    const top = Object.entries(day.top).sort((a, b) => b[1] - a[1]).slice(0, 20);
    return { ...summary(day), hTx: day.hTx, hUsd: day.hUsd, hFail: day.hFail, hFee: day.hFee, min: day.min, top, cIn: day.cIn, cOut: day.cOut, first: day.first, last: day.last };
  }
  return { collect, list, one, readBlocks };
}
