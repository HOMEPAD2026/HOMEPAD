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
import * as fstore from "./_store.mjs";

export const KINDS = ["usdc", "swap", "bridge", "token", "nft", "deploy", "approve", "call"];
const K = Object.fromEntries(KINDS.map((k, i) => [k, i]));
export const WINDOW_MS = 120e3;   // the rows sent: the last two minutes (the page replays them when it opens)
export const KEEP_MS = 600e3;     // the block summaries and the counts behind the stats: ten minutes
export const MAX_ROWS = 1800;     // more than that in the window → evenly sampled (sampled: true)
export const MAX_BLOCKS = 120;    // blocks read in one call at most (a cold start reads the last BACKFILL)
export const BACKFILL = 100;      // ≈ 50 s of Arc (0.5 s blocks, measured 2026-11-07)
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
// CCTP V2 on Arc (GX2): MessageReceived on the Message Transmitter carries the source domain (data word 0);
// DepositForBurn on the Token Messenger carries the destination domain (data word 2)
export const CCTP = {
  received: "0xff48c13eda96b1cceacc6b9edeedc9e9db9d6226afbc30146b720c19d3addb1c",
  deposit: "0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5",
  mint: "0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63", // MintAndWithdraw: word 0 = the amount minted (6 decimals)
  transmitter: "0x81d40f21f12a8f0e3252bccb954d722d4c464b64", messenger: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d",
};
const word = (data, i) => { const h = String(data || "").replace(/^0x/, "").slice(64 * i, 64 * i + 64); return h.length === 64 ? parseInt(h.slice(-8), 16) : null; };

/// The contracts we can name for sure (from this repo's own config: config-arc.js, api/_scan-core.mjs ADDR, Circle's
/// CCTP V2 addresses). Group = the star system it orbits in the galaxy; everything else is "other" and shows its address.
export const GROUPS = {
  circle: { name: "Circle", hue: 0.52 },
  uniswap: { name: "Uniswap", hue: 0.88 },
  arcircle: { name: "ARCIRCLE", hue: 0.47 },
  launch: { name: "Launchpads", hue: 0.12 },
  infra: { name: "Smart accounts (4337)", hue: 0.62 },
  token: { name: "Tokens", hue: 0.08 },
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
  let usd = 0n, swap = false, bridge = BRIDGE.has(to), nft = false, token = false, br = 0, mint = 0n;
  for (const l of logs) {
    const a = lc(l.address), t0 = lc(l.topics && l.topics[0]);
    if (BRIDGE.has(a)) bridge = true;
    if (a === CCTP.transmitter && t0 === CCTP.received) { const d = word(l.data, 0); if (d != null && d < 1000) br = "i" + d; }
    if (a === CCTP.messenger && t0 === CCTP.deposit) { const d = word(l.data, 2); if (d != null && d < 1000) br = "o" + d; }
    if (a === CCTP.messenger && t0 === CCTP.mint) { const m = big("0x" + String(l.data || "").replace(/^0x/, "").slice(0, 64)) / 10000n; if (m > mint) mint = m; }
    if (SWAP_TOPICS.has(t0)) swap = true;
    if (t0 === T.single || t0 === T.batch) nft = true;
    if (t0 === T.transfer) {
      if (l.topics.length === 4) nft = true;
      else if (a === USDC) usd += big(l.data) / 10000n; // 6 decimals → cents
      else token = true;
    }
  }
  if (mint > usd) usd = mint;
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
  // GX3: a swap's route — the other contracts whose logs it left (pools, tokens), at most 3; a deployment's new address
  let route = 0;
  if (k === K.swap) { const seen = new Set([to, USDC]); const r = []; for (const l of logs) { const a = lc(l.address); if (!seen.has(a)) { seen.add(a); r.push(a); if (r.length >= 3) break; } } if (r.length) route = r; }
  if (k === K.deploy && rc && rc.contractAddress) route = "c" + lc(rc.contractAddress);
  const cents = usd > 9007199254740991n ? 9007199254740991 : Number(usd);
  return { k, usd: cents, ok, sel, br, route };
}

const hx = (n) => "0x" + Number(n).toString(16);

// ---------------------------------------------------------------- names (GX1)
// A contract nobody labelled gets a name once: an ERC-20's symbol / name read from the chain (eth_call), else the
// explorer's (Blockscout at explorer.arc.io: a verified contract's name or its token). Kept in the warm function and in
// the store (arcGalaxyName/<address>, a week; a miss is kept a day so it isn't asked again every call).
export const NAME_PER_READ = 8, NAME_TTL = 7 * 864e5, MISS_TTL = 864e5;
export const EXPLORER_API = "https://explorer.arc.io";
export function decodeStr(hex) {
  const h = String(hex || "").replace(/^0x/, "");
  if (!h || /^0*$/.test(h)) return "";
  let bytes;
  if (h.length >= 128) { // abi-encoded string: offset, length, data
    const len = parseInt(h.slice(64, 128), 16);
    if (!(len > 0 && len < 200)) return "";
    bytes = h.slice(128, 128 + len * 2);
  } else bytes = h.slice(0, 64).replace(/(00)+$/, ""); // bytes32
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
  try { out = decodeURIComponent(escape(out)); } catch { /* keep as is */ }
  return out.replace(/[^\x20-\x7e\u00a0-\uffff]/g, "").trim().slice(0, 40);
}
export function tokenLabel(sym, name) {
  sym = String(sym || "").trim(); name = String(name || "").trim();
  if (!sym && !name) return null;
  if (sym && name && name.toLowerCase() !== sym.toLowerCase() && (sym + " · " + name).length <= 30) return `${sym} · ${name}`;
  return (sym || name).slice(0, 30);
}
async function fetchJson(url, ms = 3500) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null; const t = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try { const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, headers: { accept: "application/json" } }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { if (t) clearTimeout(t); }
}
const storeOn = () => { try { return fstore.storeEnabled(); } catch { return false; } };
export const defaultStore = {
  async get(paths) { if (!storeOn()) return {}; try { return await fstore.getDocs(paths); } catch { return {}; } },
  async set(path, data) { if (!storeOn()) return; try { await fstore.setDoc(path, data); } catch { /* best effort */ } },
};
/// makeGalaxy({ rpc, now }) — rpc(body) is api/_arc.mjs's raw JSON-RPC (single or batch, with failover)
// explorer: off on mainnet — explorer.arc.io's API sits behind a Cloudflare bot check (the worker's check, 2026-11-07); the
// testnet's Blockscout answers (explorerFor). Names come from eth_call + LABELS.
export const explorerFor = (base) => (base ? (a) => fetchJson(`${base}/api/v2/addresses/${a}`) : async () => null);
export function makeGalaxy({ rpc = arcRpc, now = () => Date.now(), store = defaultStore, explorer = explorerFor(null), snapEvery = 45e3, key = "arcGalaxy" } = {}) {
  const st = { head: 0, rows: [], blocks: [], receipts: true, readAt: 0, out: null, busy: null, err: null, names: new Map(), loaded: false, snapAt: 0, day: [] };
  const call = async (method, params) => { const r = await rpc({ jsonrpc: "2.0", id: 1, method, params }); if (r.error) throw new Error(r.error.message || "rpc error"); return r.result; };

  async function readBlocks(from, to) {
    const ns = []; for (let n = from; n <= to; n++) ns.push(n);
    const body = [];
    ns.forEach((n, i) => { body.push({ jsonrpc: "2.0", id: 2 * i, method: "eth_getBlockByNumber", params: [hx(n), true] }); if (st.receipts) body.push({ jsonrpc: "2.0", id: 2 * i + 1, method: "eth_getBlockReceipts", params: [hx(n)] }); });
    const out = [];
    for (let i = 0; i < body.length; i += 40) out.push(...(await rpc(body.slice(i, i + 40)))); // Arc's RPC takes 100 a batch
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
      st.rows.push([lc(tx.hash), n, lc(tx.from), lc(tx.to || ""), c.k, c.usd, c.ok, c.sel, ts, c.br || 0, c.route || 0]);
    }
    st.blocks.push([n, ts, (b.transactions || []).length, fails, usd, Number(big(b.gasUsed))]);
  }

  function trim(t) {
    const keep = t - KEEP_MS;
    while (st.blocks.length && st.blocks[0][1] < keep) st.blocks.shift();
    let i = 0; while (i < st.rows.length && st.rows[i][8] < keep) i++;
    if (i) st.rows.splice(0, i);
  }

  // names: what the store already knows, then the chain, then the explorer
  const nameOf = (a) => { const n = LABELS[a] ? { n: LABELS[a][0], g: LABELS[a][1], at: Infinity } : st.names.get(a); return n && n.n ? [n.n, n.g] : null; };
  async function resolveNames(addrs, t) {
    const want = addrs.filter((a) => a && !LABELS[a] && !(st.names.get(a) && t - st.names.get(a).at < (st.names.get(a).n ? NAME_TTL : MISS_TTL)));
    if (!want.length) return;
    const fromStore = await store.get(want.slice(0, 40).map((a) => key + "Name/" + a)).catch(() => ({}));
    for (const a of want) { const d = fromStore[key + "Name/" + a]; if (d && t - (d.at || 0) < (d.n ? NAME_TTL : MISS_TTL)) st.names.set(a, { n: d.n || "", g: d.g || "other", at: d.at }); }
    const left = want.filter((a) => !st.names.has(a) || t - st.names.get(a).at >= (st.names.get(a).n ? NAME_TTL : MISS_TTL)).slice(0, NAME_PER_READ);
    if (!left.length) return;
    const body = [];
    left.forEach((a, i) => { body.push({ jsonrpc: "2.0", id: 3 * i, method: "eth_call", params: [{ to: a, data: "0x95d89b41" }, "latest"] }); body.push({ jsonrpc: "2.0", id: 3 * i + 1, method: "eth_call", params: [{ to: a, data: "0x06fdde03" }, "latest"] }); body.push({ jsonrpc: "2.0", id: 3 * i + 2, method: "eth_call", params: [{ to: a, data: "0x313ce567" }, "latest"] }); });
    let res = []; try { res = await rpc(body); } catch { res = []; }
    const by = new Map((Array.isArray(res) ? res : []).filter(Boolean).map((r) => [r.id, r]));
    await Promise.all(left.map(async (a, i) => {
      const sym = by.get(3 * i) && by.get(3 * i).result, nm = by.get(3 * i + 1) && by.get(3 * i + 1).result, dec = by.get(3 * i + 2) && by.get(3 * i + 2).result;
      let lab = dec && dec !== "0x" && sym && sym !== "0x" ? tokenLabel(decodeStr(sym), decodeStr(nm)) : null, g = lab ? "token" : "other";
      if (!lab) {
        const j = await explorer(a).catch(() => null);
        if (j && typeof j === "object") {
          if (j.token && (j.token.symbol || j.token.name)) { lab = tokenLabel(j.token.symbol, j.token.name); g = "token"; }
          else if (j.name) lab = String(j.name).slice(0, 30);
        }
      }
      const rec = { n: lab || "", g, at: t };
      st.names.set(a, rec);
      store.set(key + "Name/" + a, rec);
    }));
    if (st.names.size > 3000) st.names.delete(st.names.keys().next().value);
  }
  // the snapshot: the last rows + ten minutes of blocks + the day's minutes, so a cold start opens with a full replay
  async function loadSnap(t) {
    st.loaded = true;
    const d = (await store.get([key + "/snap"]).catch(() => ({})))[key + "/snap"];
    if (!d || !d.j) return;
    try {
      const j = JSON.parse(d.j);
      if (Array.isArray(j.day)) st.day = j.day.filter((m) => m[0] > t - 864e5);
      if (!(t - (j.at || 0) < 10 * 60e3) || !Array.isArray(j.rows)) return;
      if (j.names) for (const [a, n, g] of j.names) if (!st.names.has(a)) st.names.set(a, { n, g, at: t });
      st.rows = j.rows; st.blocks = j.blocks || []; st.head = j.head || 0; st.out = shape(t); st.out.warming = true;
    } catch { /* start fresh */ }
  }
  function addDay() {
    const by = new Map(st.day.map((m) => [m[0], m]));
    for (const b of st.blocks) { const k = Math.floor(b[1] / 60e3) * 60e3; const m = by.get(k) || [k, 0, 0, 0, new Set()]; if (!(m[4] instanceof Set)) m[4] = new Set(); if (!m[4].has(b[0])) { m[4].add(b[0]); m[1] += b[2]; m[2] += b[4]; m[3] += b[3]; } by.set(k, m); }
    st.day = [...by.values()].sort((x, y) => x[0] - y[0]).slice(-1440);
  }
  const dayOut = () => st.day.map((m) => [m[0], m[1], m[2], m[3]]);
  function saveSnap(t) {
    if (t - st.snapAt < snapEvery) return;
    st.snapAt = t;
    const names = [...st.names.entries()].filter(([, v]) => v.n).slice(-300).map(([a, v]) => [a, v.n, v.g]);
    const rows = st.rows.slice(-900), j = JSON.stringify({ at: t, head: st.head, rows, blocks: st.blocks, day: dayOut(), names });
    store.set(key + "/snap", { j, at: t });
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
    for (const r of rows) { const n = r[3] && nameOf(r[3]); if (n) labels[r[3]] = n; }
    for (const [a] of topList) { const n = nameOf(a); if (n) labels[a] = n; }
    const bt = b.length > 1 ? span / (b.length - 1) : null;
    return {
      chain: 5042, head: st.head, at: t, receipts: st.receipts, sampled,
      stats: {
        span, txs: total, tps: span > 0 ? total / span : null, tps1m: span1 > 0 ? tx1 / span1 : null,
        blockTime: bt, usd1m: m1.reduce((s, x) => s + x[4], 0), usd10m: b.reduce((s, x) => s + x[4], 0),
        failRate: known.length ? failed / known.length : null, kinds, wallets: new Set(st.rows.map((r) => r[2])).size,
      },
      top: topList, blocks: b.map((x) => x.slice(0, 5)),
      rows: rows.map((r) => r.slice(0, 11)), labels, groups: GROUPS, kindNames: KINDS,
      err: st.err,
    };
  }

  async function refresh() {
    const t = now();
    const head = Number(await call("eth_blockNumber", []));
    let from = st.head ? st.head + 1 : head - BACKFILL + 1;
    if (head - from + 1 > MAX_BLOCKS) from = head - MAX_BLOCKS + 1; // asleep too long: skip the gap (the older rows age out)
    if (from <= head) { for (const x of await readBlocks(from, head)) add(x); st.head = head; }
    trim(Math.max(t, st.blocks.length ? st.blocks[st.blocks.length - 1][1] : 0));
    // name what's busy or just flew (the busiest first)
    const cnt = new Map(); for (const r of st.rows) if (r[3] && r[4] !== K.usdc) cnt.set(r[3], (cnt.get(r[3]) || 0) + 1);
    await Promise.race([resolveNames([...cnt.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40).map((x) => x[0]), t), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
    addDay(); saveSnap(t);
    st.err = null; st.readAt = t; st.out = shape(t);
    return st.out;
  }

  /// the feed; calls within MIN_GAP_MS of the last read (or while one runs) get the same answer
  async function live() {
    const t = now();
    if (!st.loaded) await loadSnap(t).catch(() => {});
    if (st.out && !st.out.warming && t - st.readAt < MIN_GAP_MS) return st.out;
    if (st.busy) return st.out && st.out.warming ? st.out : st.busy;
    st.busy = refresh().catch((e) => { st.err = String(e && e.message || e).slice(0, 120); if (st.out) return { ...st.out, err: st.err, stale: true }; throw e; }).finally(() => { st.busy = null; });
    // a cold start with a snapshot answers at once (warming) when the first read takes longer than 2.5 s
    if (st.out && st.out.warming) return Promise.race([st.busy, new Promise((r) => setTimeout(() => r(st.out), 2500))]);
    return st.busy;
  }
  /// one transaction by hash (the page's search): the same row as the feed's, or null
  async function tx(h) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(h || ""))) return null;
    const out = await rpc([{ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [h] }, { jsonrpc: "2.0", id: 2, method: "eth_getTransactionReceipt", params: [h] }]);
    const by = new Map((Array.isArray(out) ? out : []).filter(Boolean).map((r) => [r.id, r.result]));
    const t = by.get(1), rc = by.get(2);
    if (!t || !t.blockNumber) return null;
    const c = classify(t, rc || null), n = Number(t.blockNumber);
    const b = await rpc({ jsonrpc: "2.0", id: 3, method: "eth_getBlockByNumber", params: [hx(n), false] }).catch(() => null);
    const ts = b && b.result ? Number(b.result.timestamp) * 1000 : now();
    const to = lc(t.to || "");
    await resolveNames([to].filter(Boolean), now()).catch(() => {});
    const labels = {}; const nm = to && nameOf(to); if (nm) labels[to] = nm;
    return { row: [lc(t.hash), n, lc(t.from), to, c.k, c.usd, c.ok, c.sel, ts, c.br || 0, c.route || 0], labels, contract: rc && rc.contractAddress ? lc(rc.contractAddress) : null };
  }
  /// the last 24 hours, a minute at a time: [minute, txs, usd cents, failed] (only minutes the feed read)
  async function day() { if (!st.loaded) await loadSnap(now()).catch(() => {}); return { at: now(), minutes: dayOut() }; }
  return { live, day, tx, state: st, nameOf };
}

let one = null;
export const galaxy = () => (one || (one = makeGalaxy())).live();
export const galaxyDay = () => (one || (one = makeGalaxy())).day();
export const galaxyTx = (h) => (one || (one = makeGalaxy())).tx(h);
