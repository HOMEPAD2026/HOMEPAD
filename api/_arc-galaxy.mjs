// api/_arc-galaxy.mjs — ARC GALAXY's feed (arcircle.app/galaxy): every transaction on Arc (chain 5042), live.
// GET /api/social?arc=galaxy → the last WINDOW_MS of transactions (compact rows), the last KEEP_MS of block summaries,
// the stats and the labels of the contracts that appear. Community-built by ARCIRCLE: it reads Arc's public RPCs
// (api/_arc.mjs rpc, with failover) and keeps what it has read in the warm function, so each call only reads the new
// blocks; the CDN caches the answer for a couple of seconds, so viewers never multiply the RPC calls.
//
// A row: [hash, block, from, to, kind, usd (cents), ok (1 / 0 / -1 = not known), selector]
//   kind: an index into KINDS; to: "" for a deployment; for a plain USDC send between wallets `to` is the receiver.
// Nothing here writes or signs anything.
import { rpc as arcRpc } from "./_arc.mjs";

export const KINDS = ["usdc", "swap", "bridge", "token", "nft", "deploy", "approve", "call"];
const K = Object.fromEntries(KINDS.map((k, i) => [k, i]));
export const WINDOW_MS = 120e3;   // the rows sent: the last two minutes (the page replays them when it opens)
export const KEEP_MS = 600e3;     // the block summaries and the counts behind the stats: ten minutes
export const MAX_ROWS = 1800;     // more than that in the window → evenly sampled (sampled: true)
export const MAX_BLOCKS = 48;     // blocks read in one call at most (a cold start reads the last BACKFILL)
export const BACKFILL = 40;
export const MIN_GAP_MS = 900;    // calls closer than this share one read

const lc = (a) => String(a || "").toLowerCase();
export const USDC = "0x3600000000000000000000000000000000000000";
const T = {
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  approval: "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
  v4swap: "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f",
  v3swap: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  v2swap: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
  single: "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62",
  batch: "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb",
};
const SWAP_TOPICS = new Set([T.v4swap, T.v3swap, T.v2swap]);

/// The contracts we can name for sure (from this repo's own config: config-arc.js, api/_scan-core.mjs ADDR, Circle's
/// CCTP V2 addresses). Group = the star system it orbits in the galaxy; everything else is "other" and shows its address.
export const GROUPS = {
  circle: { name: "Circle", hue: 0.52 },
  uniswap: { name: "Uniswap", hue: 0.88 },
  arcircle: { name: "ARCIRCLE", hue: 0.47 },
  launch: { name: "Launchpads", hue: 0.12 },
  infra: { name: "Smart accounts (4337)", hue: 0.62 },
  other: { name: "Other contracts", hue: 0.72 },
};
export const LABELS = {
  [USDC]: ["USDC", "circle"],
  "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d": ["CCTP Token Messenger", "circle"],
  "0x81d40f21f12a8f0e3252bccb954d722d4c464b64": ["CCTP Message Transmitter", "circle"],
  "0x8366a39cc670b4001a1121b8f6a443a643e40951": ["Uniswap v4 PoolManager", "uniswap"],
  "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1": ["Uniswap Router", "uniswap"],
  "0x6049c9a0e26405c0985f9e3685c87d0ae917f82b": ["Uniswap Positions", "uniswap"],
  "0x000000000022d473030f116ddee9f6b43ac78ba3": ["Permit2", "uniswap"],
  "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7": ["$ARCIRCLE", "arcircle"],
  "0x305da1b305249072b13b73ab394e02046c865d56": ["ARCIRCLE Swap", "arcircle"],
  "0x1a31c2539d6e3fbdf276e8d74ba67aec4de9008e": ["ARCIRCLE Orders", "arcircle"],
  "0x7f53f5014bc2cfe52ed8fb9370f2bcd497b93034": ["ARCIRCLE FeeBurn", "arcircle"],
  "0x301e1e8dcb43cdddd3244889063ad4220536b38a": ["ARCIRCLE Staking", "arcircle"],
  "0x0921638a292bd7dfd001ed62367cf8b6f0f7d613": ["ARCIRCLE Launch Drop", "arcircle"],
  "0x21733285f844cb2f03a5d692de9974f379889956": ["ARCIRCLE Multisender", "arcircle"],
  "0x674e7010dab5ccb519e06df72b1d4c063952f45b": ["ArcLock (LP locks)", "arcircle"],
  "0x64f893947fe2c4fe7058cfba899ea269cba9f006": ["ArcLock", "arcircle"],
  "0x1538c76917de5911d71c5c397ff18ca09d52b019": ["Builder Mine", "arcircle"],
  "0x9ebfb3a7724ece9ce3f0df62532471d532223fd2": ["Quantum Launch", "arcircle"],
  "0x709e1b65c529567fbe1c79de278c2abba0086ff5": ["Crimson Celestial NFT", "arcircle"],
  "0xe0f065334a1cd845f7ebf93ecab1f8c80a04cd19": ["Crimson Market", "arcircle"],
  "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789": ["ERC-4337 EntryPoint v0.6", "infra"],
  "0x0000000071727de22e5e9d8baf0edac6f37da032": ["ERC-4337 EntryPoint v0.7", "infra"],
  "0x0ebd6df354056ff469f17f8fd14dc0d2c87bd65e": ["ArcPad Factory", "launch"],
  "0x484d416e73eb44d276ddef04cdbadf2f4907c044": ["ArcPad Hook", "launch"],
  "0xfca8fd788d44bb335b1451257366e06d67114785": ["ArcPad Router", "launch"],
  "0xb021be536808f551b31789422fd28a6c9c6e97da": ["Argus Portal", "launch"],
  "0xa5628a11c412596e1f63b75a2c0284f843c549d6": ["Argus Portal (v1)", "launch"],
  "0x07a688a001f416cc433c68ff56aa26bc5131cc6e": ["Argus Portal (v2)", "launch"],
};
const BRIDGE = new Set(["0x28b5a0e9c621a5badaa536219b3a228c8168cf5d", "0x81d40f21f12a8f0e3252bccb954d722d4c464b64"]);
const SWAPPERS = new Set(["0x8366a39cc670b4001a1121b8f6a443a643e40951", "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1", "0x305da1b305249072b13b73ab394e02046c865d56", "0xfca8fd788d44bb335b1451257366e06d67114785"]);
const SEL_APPROVE = new Set(["0x095ea7b3", "0x87517c45", "0xd505accf"]); // approve, Permit2 approve, permit
const SEL_TRANSFER = new Set(["0xa9059cbb", "0x23b872dd"]);              // transfer, transferFrom

const big = (h) => { try { return BigInt(h || "0x0"); } catch { return 0n; } };
/// one transaction (+ its receipt when the RPC gives receipts) → { k, usd (cents), ok }
export function classify(tx, rc) {
  const to = lc(tx.to), input = String(tx.input || tx.data || "0x"), sel = input.length >= 10 ? input.slice(0, 10).toLowerCase() : "";
  const logs = (rc && rc.logs) || [];
  let usd = 0n, swap = false, bridge = BRIDGE.has(to), nft = false, token = false;
  for (const l of logs) {
    const a = lc(l.address), t0 = lc(l.topics && l.topics[0]);
    if (BRIDGE.has(a)) bridge = true;
    if (SWAP_TOPICS.has(t0)) swap = true;
    if (t0 === T.single || t0 === T.batch) nft = true;
    if (t0 === T.transfer) {
      if (l.topics.length === 4) nft = true;
      else if (a === USDC) usd += big(l.data) / 10000n; // 6 decimals → cents
      else token = true;
    }
  }
  // the native coin is USDC (18 decimals); count it when no USDC Transfer log says the same thing already
  const native = big(tx.value) / 10n ** 16n;
  if (native > usd) usd = native;
  if (!usd && to === USDC && SEL_TRANSFER.has(sel)) { // no receipt: read the amount from the call itself
    const amt = big("0x" + input.slice(sel === "0xa9059cbb" ? 74 : 138, sel === "0xa9059cbb" ? 138 : 202));
    usd = amt / 10000n;
  }
  let k;
  if (!tx.to) k = K.deploy;
  else if (bridge) k = K.bridge;
  else if (swap || SWAPPERS.has(to)) k = K.swap;
  else if (nft) k = K.nft;
  else if (to === USDC || (input === "0x" && native > 0n)) k = SEL_APPROVE.has(sel) ? K.approve : K.usdc;
  else if (SEL_APPROVE.has(sel)) k = K.approve;
  else if (token || SEL_TRANSFER.has(sel)) k = K.token;
  else if (usd > 0n && logs.length && logs.every((l) => lc(l.address) === USDC)) k = K.usdc;
  else k = K.call;
  const ok = rc ? (lc(rc.status) === "0x1" ? 1 : 0) : -1;
  const cents = usd > 9007199254740991n ? 9007199254740991 : Number(usd);
  return { k, usd: cents, ok, sel };
}

const hx = (n) => "0x" + Number(n).toString(16);
/// makeGalaxy({ rpc, now }) — rpc(body) is api/_arc.mjs's raw JSON-RPC (single or batch, with failover)
export function makeGalaxy({ rpc = arcRpc, now = () => Date.now() } = {}) {
  const st = { head: 0, rows: [], blocks: [], receipts: true, readAt: 0, out: null, busy: null, err: null };
  const call = async (method, params) => { const r = await rpc({ jsonrpc: "2.0", id: 1, method, params }); if (r.error) throw new Error(r.error.message || "rpc error"); return r.result; };

  async function readBlocks(from, to) {
    const ns = []; for (let n = from; n <= to; n++) ns.push(n);
    const body = [];
    ns.forEach((n, i) => { body.push({ jsonrpc: "2.0", id: 2 * i, method: "eth_getBlockByNumber", params: [hx(n), true] }); if (st.receipts) body.push({ jsonrpc: "2.0", id: 2 * i + 1, method: "eth_getBlockReceipts", params: [hx(n)] }); });
    const out = [];
    for (let i = 0; i < body.length; i += 24) out.push(...(await rpc(body.slice(i, i + 24))));
    const by = new Map(out.map((r) => [r.id, r]));
    const res = [];
    ns.forEach((n, i) => {
      const b = by.get(2 * i), r = st.receipts ? by.get(2 * i + 1) : null;
      if (!b || !b.result) return;
      if (r && r.error && /not (found|supported|available)|unknown|does not exist/i.test(String(r.error.message))) st.receipts = false;
      res.push({ b: b.result, rcs: r && Array.isArray(r.result) ? r.result : null });
    });
    return res;
  }

  function add({ b, rcs }) {
    const n = Number(b.number), ts = Number(b.timestamp) * 1000;
    const byHash = new Map((rcs || []).map((r) => [lc(r.transactionHash), r]));
    let fails = 0, usd = 0;
    for (const tx of b.transactions || []) {
      if (typeof tx !== "object") continue;
      const c = classify(tx, byHash.get(lc(tx.hash)) || null);
      if (c.ok === 0) fails++;
      usd += c.usd;
      st.rows.push([lc(tx.hash), n, lc(tx.from), lc(tx.to || ""), c.k, c.usd, c.ok, c.sel, ts]);
    }
    st.blocks.push([n, ts, (b.transactions || []).length, fails, usd, Number(big(b.gasUsed))]);
  }

  function trim(t) {
    const keep = t - KEEP_MS;
    while (st.blocks.length && st.blocks[0][1] < keep) st.blocks.shift();
    let i = 0; while (i < st.rows.length && st.rows[i][8] < keep) i++;
    if (i) st.rows.splice(0, i);
  }

  function shape(t) {
    const b = st.blocks, last = b[b.length - 1];
    const span = b.length > 1 ? (b[b.length - 1][1] - b[0][1]) / 1000 : 0;
    const total = b.reduce((s, x) => s + x[2], 0);
    const m1 = b.filter((x) => x[1] >= (last ? last[1] : t) - 60e3);
    const span1 = m1.length > 1 ? (m1[m1.length - 1][1] - m1[0][1]) / 1000 : 0;
    const tx1 = m1.reduce((s, x) => s + x[2], 0);
    const known = st.rows.filter((r) => r[6] !== -1), failed = known.filter((r) => r[6] === 0).length;
    const top = new Map(), kinds = new Array(KINDS.length).fill(0);
    for (const r of st.rows) { kinds[r[4]]++; if (r[3] && r[4] !== K.usdc && r[4] !== K.deploy) top.set(r[3], (top.get(r[3]) || 0) + 1); }
    const topList = [...top.entries()].sort((a, c) => c[1] - a[1]).slice(0, 16);
    const winFrom = (last ? last[1] : t) - WINDOW_MS;
    let rows = st.rows.filter((r) => r[8] >= winFrom), sampled = false;
    if (rows.length > MAX_ROWS) { const step = rows.length / MAX_ROWS; rows = Array.from({ length: MAX_ROWS }, (_, i) => rows[Math.floor(i * step)]); sampled = true; }
    const labels = {};
    for (const r of rows) if (LABELS[r[3]]) labels[r[3]] = LABELS[r[3]];
    for (const [a] of topList) if (LABELS[a]) labels[a] = LABELS[a];
    const bt = b.length > 1 ? span / (b.length - 1) : null;
    return {
      chain: 5042, head: st.head, at: t, receipts: st.receipts, sampled,
      stats: {
        span, txs: total, tps: span > 0 ? total / span : null, tps1m: span1 > 0 ? tx1 / span1 : null,
        blockTime: bt, usd1m: m1.reduce((s, x) => s + x[4], 0), usd10m: b.reduce((s, x) => s + x[4], 0),
        failRate: known.length ? failed / known.length : null, kinds, wallets: new Set(st.rows.map((r) => r[2])).size,
      },
      top: topList, blocks: b.map((x) => x.slice(0, 5)),
      rows: rows.map((r) => r.slice(0, 8).concat([r[8]])), labels, groups: GROUPS, kindNames: KINDS,
      err: st.err,
    };
  }

  async function refresh() {
    const t = now();
    const head = Number(await call("eth_blockNumber", []));
    let from = st.head ? st.head + 1 : head - BACKFILL + 1;
    if (head - from + 1 > MAX_BLOCKS) { from = head - MAX_BLOCKS + 1; st.rows = []; st.blocks = []; } // asleep too long: start over
    if (from <= head) { for (const x of await readBlocks(from, head)) add(x); st.head = head; }
    trim(Math.max(t, st.blocks.length ? st.blocks[st.blocks.length - 1][1] : 0));
    st.err = null; st.readAt = t; st.out = shape(t);
    return st.out;
  }

  /// the feed; calls within MIN_GAP_MS of the last read (or while one runs) get the same answer
  async function live() {
    const t = now();
    if (st.out && t - st.readAt < MIN_GAP_MS) return st.out;
    if (st.busy) return st.busy;
    st.busy = refresh().catch((e) => { st.err = String(e && e.message || e).slice(0, 120); if (st.out) return { ...st.out, err: st.err, stale: true }; throw e; }).finally(() => { st.busy = null; });
    return st.busy;
  }
  return { live, state: st };
}

let one = null;
export const galaxy = () => (one || (one = makeGalaxy())).live();
