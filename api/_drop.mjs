// api/_drop.mjs — the server half of the Multisender utility (arc-multisend.js).
// Pure: no store import, so the edge share page (api/c.mjs) can use the
// receipt reader too; callers pass a { get, set } store when they have one.
//
//   receipt(txs)            what a Multisender transaction sent, read from its
//                           receipt: token, sender, every recipient and amount
//   feedTick(store)         follows ArcMultiSend's Sent events from deployment
//                           on, keeps the latest sends (the "Recent airdrops"
//                           feed) and each send's recipient list
//   received(store, wallet) airdrops a wallet got through the Multisender, and
//                           ArcDrop rows it can still claim
//   dropSave / dropProof    ArcDrop claim lists: the list is only stored if its
//                           Merkle root matches the one on-chain; claimers get
//                           their proof back
import { getLogs, latestBlock, blockTs, pool, toQty, rpc, rpcCall, ethCalls, isAddr, keccakHex, pad, strip, wBig, PM_ADDRESS } from "./_arc.mjs";

// Keep in step with config-arc.js (MULTISEND_ADDRESS, MULTISEND_V2_ADDRESS, DROP_ADDRESS).
// The ARC_* environment variables are for a local test chain only.
const ENV = (typeof process !== "undefined" && process.env) || {};
export const MS = ["0x21733285F844cb2F03a5d692de9974F379889956", ENV.ARC_MULTISEND_V2 || ""].filter(Boolean).map((a) => a.toLowerCase());
export const DROP = String(ENV.ARC_DROP_ADDRESS || "").toLowerCase();
const START_TS = 1790394000; // 2026-09-26 04:20 UTC, shortly before ArcMultiSend was deployed

const T = {
  sent: "0x34355b4c5dff25f21b90975d65f648edf2c50bea228323bb74333bfe5f015f3c",      // Sent(address,address,uint256,uint256)
  sentMulti: "0x3ae94f2723eed033ce7d05cf0e37c06a4a79de4453f1d870a3d5441d0c44d9c8", // SentMulti(address,uint256)
  sentNft: "0xb203c68b4075fc3789d6a56ca51fcfec4191b4fffb3f4fa9332c0be10b3f3359",   // SentNFT(address,address,uint256,uint256)
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  single: "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62",    // TransferSingle(address,address,address,uint256,uint256)
};
const SEL = { getDrop: "0x6787d449", symbol: "0x95d89b41", decimals: "0x313ce567" };
const CHUNK = 9000, WAVE = 8, FEED_KEEP = 200, MAX_ROWS = 20000, PART = 2000;
const lc = (a) => String(a || "").toLowerCase();
const addrOf = (topic) => "0x" + strip(topic).slice(24).toLowerCase();
const isTx = (h) => /^0x[0-9a-fA-F]{64}$/.test(String(h || ""));
const mem = { feed: null, tx: new Map(), lists: new Map(), trees: new Map(), meta: new Map() };
const cap = (m, n) => { while (m.size > n) m.delete(m.keys().next().value); };

// ---------------- token names ----------------
const metaMem = new Map();
function decodeStr(hex) {
  const h = strip(hex || "");
  try {
    if (h.length >= 128) {
      const off = Number(BigInt("0x" + h.slice(0, 64))) * 2, len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2;
      return new TextDecoder().decode(Uint8Array.from(h.slice(off + 64, off + 64 + len).match(/../g) || [], (b) => parseInt(b, 16)));
    }
    if (h.length === 64) return new TextDecoder().decode(Uint8Array.from(h.match(/../g), (b) => parseInt(b, 16))).replace(/\0+$/, "");
  } catch { /* odd token */ }
  return "";
}
export async function tokenMeta(token) {
  token = lc(token);
  if (metaMem.has(token)) return metaMem.get(token);
  const [s, d] = await ethCalls([{ to: token, data: SEL.symbol }, { to: token, data: SEL.decimals }]).catch(() => [null, null]);
  const out = { symbol: decodeStr(s).replace(/[^\w$.-]/g, "").slice(0, 16) || "TOKEN", decimals: d ? Number(BigInt(d)) : 18 };
  metaMem.set(token, out); cap(metaMem, 500);
  return out;
}

// ---------------- one transaction ----------------
/// → { tx, block, ts, sender, contract, kind: "token"|"multi"|"nft", token, symbol, decimals, rows: [[to, value, tokenOrId?]], n, total } or null
export async function parseTx(tx) {
  tx = lc(tx);
  if (!isTx(tx)) return null;
  if (mem.tx.has(tx)) return mem.tx.get(tx);
  const rc = await rpcCall("eth_getTransactionReceipt", [tx]);
  if (!rc || !Array.isArray(rc.logs)) return null;
  const logs = rc.logs;
  const ev = logs.find((l) => MS.includes(lc(l.address)) && [T.sent, T.sentMulti, T.sentNft].includes(lc(l.topics[0])));
  if (!ev || String(rc.status) === "0x0") return null;
  const t0 = lc(ev.topics[0]);
  let out;
  if (t0 === T.sent) {
    const token = addrOf(ev.topics[1]), sender = addrOf(ev.topics[2]);
    const rows = logs.filter((l) => lc(l.address) === token && lc(l.topics[0]) === T.transfer && l.topics.length === 3 && addrOf(l.topics[1]) === sender)
      .map((l) => [addrOf(l.topics[2]), BigInt(strip(l.data).slice(0, 64) ? "0x" + strip(l.data).slice(0, 64) : "0x0").toString()]);
    out = { kind: "token", token, sender, n: Number(wBig(ev.data, 0)), total: wBig(ev.data, 1).toString(), rows };
  } else if (t0 === T.sentMulti) {
    const sender = addrOf(ev.topics[1]);
    const rows = logs.filter((l) => lc(l.topics[0]) === T.transfer && l.topics.length === 3 && addrOf(l.topics[1]) === sender)
      .map((l) => [addrOf(l.topics[2]), BigInt("0x" + (strip(l.data).slice(0, 64) || "0")).toString(), lc(l.address)]);
    out = { kind: "multi", token: null, sender, n: Number(wBig(ev.data, 0)), total: null, rows };
  } else {
    const token = addrOf(ev.topics[1]), sender = addrOf(ev.topics[2]);
    const rows = [];
    for (const l of logs) {
      if (lc(l.address) !== token) continue;
      if (lc(l.topics[0]) === T.transfer && l.topics.length === 4 && addrOf(l.topics[1]) === sender) rows.push([addrOf(l.topics[2]), "1", BigInt(l.topics[3]).toString()]);
      else if (lc(l.topics[0]) === T.single && addrOf(l.topics[2]) === sender) rows.push([addrOf(l.topics[3]), wBig(l.data, 1).toString(), wBig(l.data, 0).toString()]);
    }
    out = { kind: "nft", token, sender, n: Number(wBig(ev.data, 0)), total: wBig(ev.data, 1).toString(), rows };
  }
  const block = parseInt(rc.blockNumber, 16);
  const meta = out.token ? await tokenMeta(out.token) : { symbol: "", decimals: 18 };
  out = { tx, block, ts: await blockTs(block).catch(() => null), contract: lc(ev.address), symbol: meta.symbol, decimals: out.kind === "nft" ? 0 : meta.decimals, ...out };
  mem.tx.set(tx, out); cap(mem.tx, 400);
  return out;
}
/// Several transactions of one send (batches) → one summary.
export async function receipt(txs) {
  const list = [...new Set(String(txs || "").split(",").map(lc).filter(isTx))].slice(0, 25);
  const parts = (await Promise.all(list.map((t) => parseTx(t).catch(() => null)))).filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0];
  const same = parts.every((p) => p.sender === first.sender && p.token === first.token && p.kind === first.kind);
  const use = same ? parts : [first];
  const rows = use.flatMap((p) => p.rows);
  const total = first.kind === "token" ? use.reduce((s, p) => s + BigInt(p.total || 0), 0n).toString() : first.kind === "nft" ? use.reduce((s, p) => s + BigInt(p.total || 0), 0n).toString() : null;
  return {
    kind: first.kind, token: first.token, symbol: first.symbol, decimals: first.decimals, sender: first.sender,
    txs: use.map((p) => p.tx), ts: Math.min(...use.map((p) => p.ts || Infinity)) || null, block: first.block,
    n: use.reduce((s, p) => s + (p.n || 0), 0), wallets: new Set(rows.map((r) => r[0])).size, total, rows: rows.slice(0, 5000),
  };
}

// ---------------- the feed: every Multisender send since deployment ----------------
async function blockAtOrBefore(ts, head) {
  let lo = Math.max(0, head.number - Math.ceil((head.ts - ts) * 2.2) - 5000), loTs = await blockTs(lo);
  while (loTs != null && loTs > ts && lo > 0) { lo = Math.max(0, lo - 200000); loTs = await blockTs(lo); }
  let hi = head.number;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2), t = await blockTs(mid); if (t != null && t <= ts) lo = mid; else hi = mid; }
  return lo;
}
const FEED = "dropFeed/v1";
const pack = (p) => ({ tx: p.tx, b: p.block, ts: p.ts || 0, kind: p.kind, token: p.token || "", sym: p.symbol || "", dec: p.decimals, sender: p.sender, n: p.n, total: p.total || "" });
let ticking = null; // one scan at a time per instance: two requests at once would both add the same sends
export async function feedTick(store, opts) {
  if (ticking) return ticking;
  ticking = tick(store, opts);
  try { return await ticking; } finally { ticking = null; }
}
async function tick(store, { budgetMs = 5000 } = {}) {
  const t0 = Date.now();
  let F = mem.feed;
  if (!F && store) { try { F = await store.get(FEED); } catch { F = null; } }
  if (!F || F.v !== 1) F = { v: 1, hi: null, items: [] };
  if (!MS.length) return F;
  const head = await latestBlock();
  if (F.hi == null) F.hi = (await blockAtOrBefore(START_TS, head)) - 1;
  const found = [];
  let changed = false;
  while (F.hi < head.number && Date.now() - t0 < budgetMs - 1500) {
    const ranges = [];
    let a = F.hi + 1;
    for (let k = 0; k < WAVE && a <= head.number; k++) { const b = Math.min(head.number, a + CHUNK - 1); ranges.push([a, b]); a = b + 1; }
    const logs = (await pool(ranges, WAVE, ([x, y]) => getLogs({ address: MS, fromBlock: toQty(x), toBlock: toQty(y), topics: [[T.sent, T.sentMulti, T.sentNft]] }))).flat();
    found.push(...new Set(logs.map((l) => lc(l.transactionHash))));
    F.hi = ranges[ranges.length - 1][1];
    changed = true;
  }
  const have = new Set(F.items.map((x) => x.tx));
  const fresh = [...new Set(found)].filter((t) => !have.has(t));
  const parsed = (await pool(fresh.slice(0, 40), 4, (t) => parseTx(t).catch(() => null))).filter(Boolean);
  for (const p of parsed) {
    if (F.items.some((x) => x.tx === p.tx)) continue;
    F.items.push(pack(p));
    // each send's recipients, for "did I get an airdrop?" (strings: the store can't nest arrays)
    if (store) { try { await store.set(`dropTx/${p.tx}`, { tx: p.tx, rows: p.rows.slice(0, 600).map((r) => r.join("|")) }); } catch { /* memory copy */ } }
  }
  F.items.sort((x, y) => y.b - x.b);
  F.items = F.items.slice(0, FEED_KEEP);
  mem.feed = F;
  if (store && (changed || parsed.length)) { try { await store.set(FEED, F); } catch { /* memory copy */ } }
  return F;
}
/// The batches of one send (same sender and token, a few minutes apart) as one entry.
export function group(items) {
  const out = [];
  for (const x of [...items].sort((a, b) => b.b - a.b)) {
    const g = out.find((y) => y.sender === x.sender && y.token === x.token && y.kind === x.kind && Math.abs(y.b0 - x.b) <= 600 && y.txs.length < 25);
    if (g) {
      g.txs.push(x.tx); g.n += x.n; g.b0 = Math.min(g.b0, x.b); g.ts = Math.min(g.ts || x.ts, x.ts || g.ts);
      if (g.total !== "" && x.total !== "") g.total = (BigInt(g.total) + BigInt(x.total)).toString();
    } else out.push({ ...x, txs: [x.tx], b0: x.b });
  }
  // oldest batch first in the receipt link
  out.forEach((g) => { g.txs.reverse(); g.tx = g.txs.join(","); });
  return out;
}
/// Recent sends + the biggest ones, for the page.
export async function feed(store) {
  const F = await feedTick(store, { budgetMs: 4000 });
  const items = group(F.items.filter((x) => x.kind !== "multi"));
  return { recent: items.slice(0, 12), biggest: [...items].sort((a, b) => b.n - a.n).slice(0, 5), count: F.items.length };
}

/// A wallet's own sends (for "Your sends" on any device).
export async function sentBy(store, wallet) {
  wallet = lc(wallet);
  if (!isAddr(wallet)) throw Object.assign(new Error("wallet must be an address"), { status: 400 });
  const F = await feedTick(store, { budgetMs: 3000 });
  return { items: group(F.items.filter((x) => x.sender === wallet)).slice(0, 30) };
}

// ---------------- what a wallet received ----------------
export async function received(store, wallet) {
  wallet = lc(wallet);
  if (!isAddr(wallet)) throw Object.assign(new Error("wallet must be an address"), { status: 400 });
  const F = await feedTick(store, { budgetMs: 3000 });
  const got = [];
  const need = F.items.filter((x) => !mem.tx.has(x.tx)).map((x) => `dropTx/${x.tx}`);
  let docs = {};
  if (store && need.length && store.getMany) { try { docs = await store.getMany(need); } catch { docs = {}; } }
  for (const it of F.items) {
    let rows = mem.tx.has(it.tx) ? mem.tx.get(it.tx).rows : null;
    if (!rows) { const d = docs[`dropTx/${it.tx}`]; rows = d && Array.isArray(d.rows) ? d.rows.map((s) => String(s).split("|")) : null; }
    if (!rows) continue;
    for (const r of rows) if (r[0] === wallet) got.push({ tx: it.tx, ts: it.ts, kind: it.kind, token: r[2] && it.kind === "multi" ? r[2] : it.token, sym: it.sym, dec: it.dec, amount: r[1], id: it.kind === "nft" ? r[2] : null, from: it.sender });
  }
  const claims = [];
  if (DROP && store) {
    let idx = null;
    try { idx = await store.get("dropIdx/v1"); } catch { idx = null; }
    for (const id of ((idx && idx.ids) || []).slice(-60)) {
      const list = await loadList(store, id).catch(() => null);
      if (!list) continue;
      list.rows.forEach(([a, v], i) => { if (a === wallet) claims.push({ drop: id, index: i, amount: v, token: list.meta.token, sym: list.meta.sym, dec: list.meta.dec, endsAt: list.meta.endsAt || 0 }); });
    }
  }
  return { wallet, got: got.slice(0, 100), claims: claims.slice(0, 50), since: START_TS };
}

// ---------------- ArcDrop claim lists ----------------
const coder = (i, a, v) => pad(BigInt(i).toString(16)) + pad(a) + pad(BigInt(v).toString(16));
export const leaf = (i, a, v) => keccakHex(keccakHex(coder(i, a, v)));
const pairHash = (a, b) => (a < b ? keccakHex(strip(a) + strip(b)) : keccakHex(strip(b) + strip(a)));
export function buildTree(rows) {
  const layers = [rows.map(([a, v], i) => leaf(i, a, v))];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1], next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? pairHash(cur[i], cur[i + 1]) : cur[i]);
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], proof: (k) => { const p = []; for (let l = 0; l < layers.length - 1; l++) { const s = k ^ 1; if (s < layers[l].length) p.push(layers[l][s]); k >>= 1; } return p; } };
}
/// On-chain record of a drop.
export async function dropOnChain(id) {
  if (!DROP) return null;
  const [h] = await ethCalls([{ to: DROP, data: SEL.getDrop + pad(BigInt(id).toString(16)) }]);
  if (!h || strip(h).length < 640) return null;
  const w = (i) => wBig(h, i);
  return { token: "0x" + strip(h).slice(24, 64).toLowerCase(), creator: "0x" + strip(h).slice(64 + 24, 128).toLowerCase(), root: "0x" + strip(h).slice(128, 192).toLowerCase(),
    total: w(3).toString(), claimed: w(4).toString(), createdAt: Number(w(5)), endsAt: Number(w(6)), recipients: Number(w(7)), claims: Number(w(8)), reclaimed: w(9) !== 0n };
}
export async function dropSave(store, body) {
  const id = Number(body && body.id);
  if (!DROP) return { ok: false, error: "claim drops aren't live yet" };
  if (!Number.isInteger(id) || id < 0) return { ok: false, error: "bad drop id" };
  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows || !rows.length || rows.length > MAX_ROWS) return { ok: false, error: `a list of 1–${MAX_ROWS} rows` };
  const clean = [];
  for (const r of rows) {
    if (!Array.isArray(r) || !isAddr(r[0]) || !/^\d{1,78}$/.test(String(r[1]))) return { ok: false, error: "bad row" };
    clean.push([lc(r[0]), BigInt(r[1]).toString()]);
  }
  const d = await dropOnChain(id);
  if (!d) return { ok: false, error: "no such drop on Arc" };
  const tree = buildTree(clean);
  if (tree.root.toLowerCase() !== d.root) return { ok: false, error: "this list doesn't match the drop's Merkle root" };
  if (clean.reduce((s, r) => s + BigInt(r[1]), 0n).toString() !== d.total) return { ok: false, error: "amounts don't add up to the deposit" };
  const existing = await store.get(`dropM/${id}`).catch(() => null);
  if (existing) return { ok: true, duplicate: true };
  const meta = await tokenMeta(d.token);
  const parts = Math.ceil(clean.length / PART);
  for (let k = 0; k < parts; k++) await store.set(`dropL/${id}_${k}`, { rows: clean.slice(k * PART, (k + 1) * PART).map((r) => r.join("|")) });
  await store.set(`dropM/${id}`, { id, token: d.token, sym: meta.symbol, dec: meta.decimals, n: clean.length, parts, root: d.root, total: d.total, creator: d.creator, endsAt: d.endsAt, at: Date.now() });
  const idx = (await store.get("dropIdx/v1").catch(() => null)) || { ids: [] };
  if (!idx.ids.includes(id)) { idx.ids = idx.ids.concat(id).slice(-300); await store.set("dropIdx/v1", idx); }
  mem.lists.set(id, { meta: { id, token: d.token, sym: meta.symbol, dec: meta.decimals, endsAt: d.endsAt }, rows: clean });
  return { ok: true };
}
async function loadList(store, id) {
  if (mem.lists.has(id)) return mem.lists.get(id);
  const m = await store.get(`dropM/${id}`);
  if (!m) return null;
  const rows = [];
  for (let k = 0; k < (m.parts || 0); k++) {
    const p = await store.get(`dropL/${id}_${k}`);
    if (!p || !Array.isArray(p.rows)) return null;
    for (const s of p.rows) { const [a, v] = String(s).split("|"); rows.push([a, v]); }
  }
  const out = { meta: m, rows };
  mem.lists.set(id, out); cap(mem.lists, 40);
  return out;
}
/// → { drop, token, sym, dec, endsAt, n, rows: [{ index, amount, proof }] } for one wallet
export async function dropProof(store, id, wallet) {
  id = Number(id); wallet = lc(wallet);
  if (!Number.isInteger(id) || id < 0 || !isAddr(wallet)) throw Object.assign(new Error("drop id and wallet needed"), { status: 400 });
  const list = await loadList(store, id);
  if (!list) return { drop: id, known: false, rows: [] };
  let tree = mem.trees.get(id);
  if (!tree) { tree = buildTree(list.rows); mem.trees.set(id, tree); cap(mem.trees, 20); }
  const rows = [];
  list.rows.forEach(([a, v], i) => { if (a === wallet) rows.push({ index: i, amount: v, proof: tree.proof(i) }); });
  return { drop: id, known: true, token: list.meta.token, sym: list.meta.sym, dec: list.meta.dec, endsAt: list.meta.endsAt || 0, n: list.rows.length, rows };
}

// ---------------- system addresses no airdrop should go to ----------------
export const SYSTEM = new Set([
  "0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead",
  lc(PM_ADDRESS), "0x64f893947fe2c4fe7058cfba899ea269cba9f006", ...MS, DROP,
].filter(Boolean));
export { rpc };
