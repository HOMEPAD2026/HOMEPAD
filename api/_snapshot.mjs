// api/_snapshot.mjs — Holder Snapshot on the server (/api/social?snap…).
//   run(params)         a snapshot at a block: the shared engine
//                       (api/_snap-core.mjs) walking back from the balance
//                       sheet api/_scan.mjs keeps. A long walk takes a few
//                       calls — progress is kept in the store between them.
//   publish(body)       fixes a filtered list under an id (/snap/<id>): the
//                       server rebuilds it, so the fingerprint is the server's
//   schedule(body)      the same for a moment still to come; it's built the
//                       first time someone opens it after that moment
//   view(id, wallet)    a published snapshot: summary, top wallets, "am I in it?"
//   csvOf(id)           its CSV (the exact bytes the fingerprint is of)
import { rpc, getLogs, latestBlock, blockTs, pool, toQty, isAddr, keccakHex } from "./_arc.mjs";
import * as core from "./_snap-core.mjs";
import * as scanner from "./_scan.mjs";

const lc = (a) => String(a || "").toLowerCase();
export const io = {
  logs: (f) => getLogs(f),
  keccak: (h) => keccakHex(h),
  async calls(calls, tag = "latest") {
    const out = new Array(calls.length).fill(null);
    const groups = [];
    for (let i = 0; i < calls.length; i += 100) groups.push(i);
    await pool(groups, 4, async (i) => {
      const part = calls.slice(i, i + 100);
      const res = await rpc(part.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, tag] })), { timeoutMs: 9000 });
      const byId = new Map((Array.isArray(res) ? res : [res]).map((x) => [x.id, x]));
      part.forEach((_, j) => { const x = byId.get(j); out[i + j] = x && x.result && x.result !== "0x" ? x.result : null; });
    });
    return out;
  },
};
const err = (status, message) => Object.assign(new Error(message), { status });
const mem = new Map();
const memSet = (k, v) => { mem.set(k, v); if (mem.size > 200) mem.delete(mem.keys().next().value); };
async function sget(store, k) { if (mem.has(k)) return mem.get(k); if (!store) return null; try { const d = await store.get(k); if (d) memSet(k, d); return d || null; } catch { return null; } }
async function sset(store, k, d) { memSet(k, d); if (store) { try { await store.set(k, d); } catch { /* too big for a document: this instance keeps it */ } } }
const packMap = (o) => Object.entries(o || {}).map(([a, v]) => `${a.slice(2)}:${v}`);
const unpackMap = (arr) => Object.fromEntries((arr || []).map((s) => { const i = s.indexOf(":"); return ["0x" + s.slice(0, i), s.slice(i + 1)]; }));
const packJob = (j) => ({ ...j, d: packMap(j.d), dB: j.dB ? packMap(j.dB) : null, w: packMap(j.w) });
const unpackJob = (j) => (j ? { ...j, d: unpackMap(j.d), dB: j.dB ? unpackMap(j.dB) : null, w: unpackMap(j.w) } : null);
const { packRows, unpackRows } = core;
export { packRows, unpackRows };

// ---- time → block (the last block before `ts`) ----
const tsCache = new Map();
async function tsOf(n) { if (tsCache.has(n)) return tsCache.get(n); const t = await blockTs(n); tsCache.set(n, t); if (tsCache.size > 5000) tsCache.clear(); return t; }
export async function blockBefore(ts, latest) {
  latest = latest || await latestBlock();
  if (ts > latest.ts) return latest.number;
  const probeN = Math.max(0, latest.number - 400000), probeT = await tsOf(probeN);
  const spb = Math.max(0.01, (latest.ts - probeT) / Math.max(1, latest.number - probeN));
  let guess = Math.round(latest.number - (latest.ts - ts) / spb);
  guess = Math.max(0, Math.min(latest.number, guess));
  let span = 4000, lo, hi;
  for (let k = 0; k < 12; k++) {
    lo = Math.max(0, guess - span); hi = Math.min(latest.number, guess + span);
    const [a, b] = await Promise.all([tsOf(lo), tsOf(hi)]);
    if ((a < ts || lo === 0) && (b >= ts || hi === latest.number)) break;
    span *= 4;
  }
  if (await tsOf(hi) < ts) return hi;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (await tsOf(mid) < ts) lo = mid; else hi = mid; }
  return lo;
}

// ---- contracts among the holders (cached per token) ----
async function contractsOf(store, token, addrs, known, left) {
  const key = `snapcode/${token}`;
  const doc = (await sget(store, key)) || { c: [], n: [] };
  const C = new Set([...(doc.c || []), ...known]), N = new Set(doc.n || []);
  const need = addrs.filter((a) => !C.has(a) && !N.has(a)).slice(0, 4000);
  for (let i = 0; i < need.length && left() > 1200; i += 100) {
    const part = need.slice(i, i + 100);
    try {
      const r = await rpc(part.map((a, id) => ({ jsonrpc: "2.0", id, method: "eth_getCode", params: [a, "latest"] })), { timeoutMs: 8000 });
      const byId = new Map((Array.isArray(r) ? r : [r]).map((x) => [x.id, x.result]));
      part.forEach((a, k) => { const c = byId.get(k); if (c == null) return; if (c !== "0x") C.add(a); else N.add(a); });
    } catch { break; }
  }
  if (need.length) await sset(store, key, { c: [...C], n: [...N].slice(-12000) });
  return C;
}

/// params: { token, block?, at? (unix), hold? (seconds), locks?, lp? } → { done:false, progress, stage } | { done:true, ... }
export async function run(params, { store = null, budgetMs = 8000 } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  const token = lc(params.token);
  if (!isAddr(token)) throw err(400, "token must be an address");
  const hold = Math.max(0, Math.min(90 * 86400, Number(params.hold) || 0));
  const locks = params.locks !== false && params.locks !== "0", lp = params.lp === true || params.lp === "1";
  const base = await scanner.holderSnapshot(token, { store, limit: 8000, budgetMs: Math.min(5000, budgetMs / 2) });
  if (!base.complete || base.lite) {
    if (base.more) return { done: false, stage: "history", progress: 0, holders: base.holderCount };
    if (params.block || params.at || hold) throw err(422, "this token has too many holders to rebuild an earlier moment");
  }
  const hi = base.block;
  if (!hi) throw err(422, "this token has too many holders for a full snapshot");
  let B = hi;
  if (params.block) B = Math.min(hi, Math.max(1, Number(params.block) || hi));
  else if (params.at) {
    const at = Number(params.at);
    if (!(at > 0)) throw err(400, "bad time");
    const latest = await latestBlock();
    if (at > latest.ts) throw err(409, "that moment hasn't come yet");
    B = Math.min(hi, await blockBefore(at, latest));
  }
  const tsB = await tsOf(B);
  const H = hold ? Math.min(B, await blockBefore(tsB - hold)) : B;
  const rkey = `snapres/${token}-${B}-${H}-${locks ? 1 : 0}${lp ? 1 : 0}`;
  const cached = await sget(store, rkey);
  if (cached && cached.v === core.SNAP_VERSION) return { done: true, ...cached, rows: unpackRows(cached.rows) };
  const jkey = `snapjob/${token}-${B}-${H}-${locks ? 1 : 0}`;
  let job = unpackJob(await sget(store, jkey));
  if (!job || job.v !== core.SNAP_VERSION) job = core.newJob({ token, hi, B, H, locks });
  if (job.hi > hi) return { done: false, stage: "catching up", progress: 0 };
  if (job.hi < hi) await core.extendJob(io, job, hi, { wave: 10 });
  await core.stepJob(io, job, { wave: 10, until: () => left() < 2500 });
  await sset(store, jkey, packJob(job));
  const span = Math.max(1, job.hi - job.H);
  if (!job.done) return { done: false, stage: "rewind", progress: (job.hi - job.cursor) / span, logs: job.logs };
  // ---- the extras, then the rows ----
  let locked = null, lockCount = 0;
  if (locks) { try { const L = await core.readLocks(io, token); lockCount = L.filter((l) => !l.withdrawn).length; locked = core.lockedByOwner(L); } catch { locked = null; } }
  let lpRes = null;
  if (lp) {
    const pkey = `snaplp/${token}`;
    const idx = (await sget(store, pkey)) || { next: 1, ids: [] };
    const sc = await core.scanPositions(io, token, idx.next, { until: () => left() < 2000 });
    if (!sc.unsupported) {
      idx.next = sc.next; idx.ids = idx.ids.concat(sc.ids);
      await sset(store, pkey, idx);
      const [nx] = await io.calls([{ to: core.SNAP_ADDR.positions, data: core.selector("nextTokenId()", io.keccak) }]);
      if (nx && idx.next < Number(BigInt(nx))) return { done: false, stage: "positions", progress: 0.99 };
      lpRes = await core.lpAt(io, idx.ids, toQty(B));
    }
  }
  const baseMap = new Map(base.holders.map(([a, v]) => [lc(a), BigInt(v)]));
  const { rows, supply } = core.finishRows(job, baseMap, { supplyNow: base.supply, locked, lp: lpRes && lpRes.byOwner });
  const known = base.holders.filter((h) => h[2]).map((h) => lc(h[0]));
  const contracts = await contractsOf(store, token, rows.slice(0, 8000).map((x) => x.a), known, left);
  const out = {
    v: core.SNAP_VERSION, token, decimals: base.decimals, supply: supply.toString(), supplyNow: base.supply,
    block: B, ts: tsB, hold, holdBlock: H, holdTs: H === B ? tsB : await tsOf(H), hi, locks, lp,
    lockCount, lpCount: lpRes ? lpRes.positions.length : 0, lpApprox: !!(lpRes && lpRes.approx), odd: rows.some((x) => x.odd),
    holdClipped: !!(hold && base.firstMint && base.firstMint.ts && tsB - hold < base.firstMint.ts), launchTs: base.firstMint ? base.firstMint.ts : null,
    contracts: rows.filter((x) => contracts.has(x.a)).map((x) => x.a), deployer: base.deployer || null, holderCount: base.holderCount, hist: base.hist || [],
  };
  if (B < hi) await sset(store, rkey, { ...out, rows: packRows(rows) });
  return { done: true, ...out, rows };
}

// ---- published / scheduled snapshots ----
const clean = (f) => core.normFilters(f);
/// The list a snapshot + filters give, and its CSV / fingerprint.
export function listOf(res, f) {
  const dec = res.decimals;
  const { list, why } = core.applyFilters(res.rows, {
    min: core.parseUnits(f.min, dec) || null, max: core.parseUnits(f.max, dec) || null, top: Number(f.top) || 0,
    noC: f.noC, contracts: new Set(res.contracts || []), since: res.block < res.hi ? f.since : "any", skip: new Set(f.skip), hold: res.hold > 0,
  });
  const csv = core.toCsv(list, { decimals: dec, supply: res.supply, hold: res.hold > 0, keccak: io.keccak });
  return { list, why, csv, fp: core.fingerprint(csv, io.keccak) };
}
async function symbolOf(token) {
  try {
    const [h] = await io.calls([{ to: token, data: "0x95d89b41" }]);
    if (!h) return "";
    const len = Number(BigInt("0x" + h.slice(66, 130)));
    const bytes = h.slice(130, 130 + len * 2);
    return decodeURIComponent(bytes.replace(/../g, "%$&")).replace(/[^\w$.-]/g, "").slice(0, 16);
  } catch { return ""; }
}
// a signature proves who published / scheduled it (the page checks it too)
function signer(kind, d, sig, by, recover) {
  if (!sig || !by || !recover) return { by: null, sig: null };
  try { return lc(recover(core.sigText(kind, d), sig)) === by ? { by, sig } : { by: null, sig: null }; } catch { return { by: null, sig: null }; }
}
function meta(res, f, extra) {
  return { v: 1, token: res.token, decimals: res.decimals, supply: res.supply, block: res.block, ts: res.ts, hold: res.hold, holdTs: res.holdTs, hi: res.hi,
    locks: res.locks, lp: res.lp, f, ...extra };
}
export async function publish(body, { store, recover = null }) {
  if (!store) throw err(503, "publishing isn't available right now");
  const f = clean(body.filters), token = lc(body.token);
  const res = await run({ token, block: Number(body.block) || 0, hold: f.hold, locks: f.locks, lp: f.lp }, { store, budgetMs: 8500 });
  if (!res.done) return { pending: true, progress: res.progress, stage: res.stage };
  const { list, csv, fp } = listOf(res, f);
  if (!list.length) throw err(422, "no wallets left after these filters");
  const id = fp.slice(2, 14);
  const title = String(body.title || "").replace(/[<>]/g, "").slice(0, 80);
  const { by, sig } = signer("publish", { token, block: res.block, f, title }, /^0x[0-9a-f]{130}$/i.test(body.sig || "") ? body.sig : null, isAddr(body.by) ? lc(body.by) : null, recover);
  const doc = meta(res, f, { id, symbol: await symbolOf(token), status: "done", fp, count: list.length, total: list.reduce((s, x) => s + (f.hold ? x.min : x.v), 0n).toString(), title, by, sig, created: Date.now(), bytes: csv.length, rows: packRows(list) });
  const prev = await sget(store, `snap/${id}`);
  if (!prev) await sset(store, `snap/${id}`, doc);
  return { id, fp, count: list.length };
}
export async function schedule(body, { store, recover = null }) {
  if (!store) throw err(503, "scheduling isn't available right now");
  const token = lc(body.token);
  if (!isAddr(token)) throw err(400, "token must be an address");
  const at = Math.floor(Number(body.at));
  const now = Math.floor(Date.now() / 1000);
  if (!(at > now + 60) || at > now + 90 * 86400) throw err(400, "pick a time between a minute and 90 days from now");
  const f = clean(body.filters);
  const title = String(body.title || "").replace(/[<>]/g, "").slice(0, 80);
  const { by, sig } = signer("schedule", { token, at, f, title }, /^0x[0-9a-f]{130}$/i.test(body.sig || "") ? body.sig : null, isAddr(body.by) ? lc(body.by) : null, recover);
  const id = io.keccak("0x" + Buffer.from(JSON.stringify([token, at, f, title, by])).toString("hex")).slice(2, 14);
  const prev = await sget(store, `snap/${id}`);
  if (!prev) await sset(store, `snap/${id}`, { v: 1, id, status: "scheduled", token, symbol: await symbolOf(token), at, f, title, by, sig, created: Date.now() });
  return { id, at };
}
async function finalize(doc, store) {
  // a scheduled snapshot whose moment has passed: build it (over a few visits if it's long)
  const res = await run({ token: doc.token, at: doc.at, hold: doc.f.hold, locks: doc.f.locks, lp: doc.f.lp }, { store, budgetMs: 8000 });
  if (!res.done) return { ...doc, status: "building", progress: res.progress };
  const { list, csv, fp } = listOf(res, doc.f);
  const done = { ...doc, ...meta(res, doc.f, {}), status: "done", fp, count: list.length, total: list.reduce((s, x) => s + (doc.f.hold ? x.min : x.v), 0n).toString(), bytes: csv.length, rows: packRows(list), builtAt: Date.now() };
  await sset(store, `snap/${doc.id}`, done);
  return done;
}
export async function view(id, { store, wallet = "" }) {
  if (!/^[0-9a-f]{12}$/.test(id || "")) throw err(400, "bad id");
  let doc = await sget(store, `snap/${id}`);
  if (!doc) throw err(404, "no snapshot with that id");
  if (doc.status === "scheduled" || doc.status === "building") {
    if (Date.now() / 1000 < doc.at + 5) return { ...strip(doc), now: Math.floor(Date.now() / 1000) };
    try { doc = await finalize(doc, store); } catch (e) { return { ...strip(doc), status: "building", note: String(e.message || e).slice(0, 120) }; }
    if (doc.status !== "done") return { ...strip(doc), now: Math.floor(Date.now() / 1000) };
  }
  const rows = unpackRows(doc.rows), hold = doc.hold > 0;
  const w = lc(wallet);
  const mine = isAddr(w) ? rows.findIndex((x) => x.a === w) : -1;
  return {
    ...strip(doc), top: rows.slice(0, 100).map((x) => [x.a, x.v.toString(), hold ? x.min.toString() : undefined].filter((y) => y !== undefined)),
    me: isAddr(w) ? (mine >= 0 ? { rank: mine + 1, v: rows[mine].v.toString(), min: rows[mine].min.toString() } : { rank: 0 }) : null,
  };
}
const strip = (d) => { const o = { ...d }; delete o.rows; return o; };
export async function csvOf(id, { store }) {
  const doc = await sget(store, `snap/${id}`);
  if (!doc || doc.status !== "done") throw err(404, "not built yet");
  const csv = core.toCsv(unpackRows(doc.rows), { decimals: doc.decimals, supply: doc.supply, hold: doc.hold > 0, keccak: io.keccak });
  return { csv, ok: core.fingerprint(csv, io.keccak) === doc.fp, doc };
}
/// The public API: /api/v1/snapshot/<token>?block=&at=&hold=&locks=&lp=&min=&max=&top=&contracts=
export async function api(q, { store }) {
  const res = await run({ token: q.token, block: q.block, at: q.at, hold: q.hold, locks: q.locks !== "0", lp: q.lp === "1" }, { store, budgetMs: 8500 });
  if (!res.done) return { pending: true, progress: Math.round((res.progress || 0) * 100), stage: res.stage, retry_after: 3 };
  const f = clean({ min: q.min, max: q.max, top: q.top, noC: q.contracts !== "1", since: q.since, hold: res.hold, locks: res.locks, lp: res.lp, skip: String(q.skip || "").split(",") });
  const { list, fp } = listOf(res, f);
  const hold = res.hold > 0;
  return {
    token: res.token, block: res.block, timestamp: res.ts, decimals: res.decimals, supply: res.supply,
    hold_seconds: res.hold, hold_from_block: res.holdBlock, locks_counted: res.locks, lp_counted: res.lp, fingerprint: fp, count: list.length,
    holders: list.map((x, i) => ({ rank: i + 1, address: core.checksum(x.a, io.keccak), balance: core.units(x.v, res.decimals), ...(hold ? { held_throughout: core.units(x.min, res.decimals) } : {}), percent: core.pctOf(x.v, BigInt(res.supply)) })),
  };
}
