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
import { makeDaily } from "./_galaxy-daily.mjs";

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
// CCTP V2: mainnet Token Messenger / Message Transmitter, and the testnet's (Circle's testnet V2 addresses)
const BRIDGE = new Set(["0x28b5a0e9c621a5badaa536219b3a228c8168cf5d", "0x81d40f21f12a8f0e3252bccb954d722d4c464b64", "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa", "0xe737e5cebeeba77efe34d4aa090756590b1ce275"]);
const TRANSMITTERS = new Set(["0x81d40f21f12a8f0e3252bccb954d722d4c464b64", "0xe737e5cebeeba77efe34d4aa090756590b1ce275"]);
const MESSENGERS = new Set(["0x28b5a0e9c621a5badaa536219b3a228c8168cf5d", "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa"]);
const SWAPPERS = new Set(["0x8366a39cc670b4001a1121b8f6a443a643e40951", "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1", "0x305da1b305249072b13b73ab394e02046c865d56", "0xfca8fd788d44bb335b1451257366e06d67114785"]);
const SEL_APPROVE = new Set(["0x095ea7b3", "0x87517c45", "0xd505accf"]); // approve, Permit2 approve, permit
const SEL_TRANSFER = new Set(["0xa9059cbb", "0x23b872dd"]);              // transfer, transferFrom
// GX7: EIP-3009 signed USDC payments — transferWithAuthorization (v,r,s and bytes forms) / receiveWithAuthorization —
// how x402 and AI agents pay without holding gas; a relayer's batch is caught by USDC's AuthorizationUsed log
export const SEL_AUTH = new Set(["0xe3ee160e", "0xcf092995", "0xef55bec6"]);
export const T_AUTH_USED = "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";

const big = (h) => { try { return BigInt(h || "0x0"); } catch { return 0n; } };
/// the chain's money rules (GXR): Arc's native coin is USDC (18 decimals, a cent = 1e16) and so is its gas; another EVM
/// chain (Robinhood Chain: ETH) prices its native coin and its fees through a live dollar price (cfg.px(), dollars an ETH)
export const ARC_MONEY = {
  usdc: USDC, nativeCents: (wei) => wei / 10n ** 16n, feeMicro: (w) => w / 10n ** 12n,
  bridgeOf: () => null, skip: () => false,
};
export function evmMoney({ usdc, px, bridgeOf = () => null, skip = () => false }) {
  const pc = () => { const p = Number(px && px()); return p > 0 ? BigInt(Math.round(p * 1e6)) : 0n; }; // micro-dollars an ETH
  return { usdc: lc(usdc || "") || "0x-none", nativeCents: (wei) => (wei * pc()) / 10n ** 22n, feeMicro: (w) => (w * pc()) / 10n ** 18n, bridgeOf, skip };
}
/// one transaction (+ its receipt when the RPC gives receipts) → { k, usd (cents), ok } — null for a chain's own system tx
export const classify = (tx, rc) => classifyWith(ARC_MONEY, tx, rc);
export function classifyWith(M, tx, rc) {
  if (M.skip(tx)) return null;
  const USDC = M.usdc;
  const to = lc(tx.to), input = String(tx.input || tx.data || "0x"), sel = input.length >= 10 ? input.slice(0, 10).toLowerCase() : "";
  const logs = (rc && rc.logs) || [];
  let usd = 0n, swap = false, bridge = BRIDGE.has(to), nft = false, token = false, br = 0, mint = 0n, xb = M.bridgeOf(tx), auth = to === USDC && SEL_AUTH.has(sel);
  for (const l of logs) {
    const a = lc(l.address), t0 = lc(l.topics && l.topics[0]);
    if (BRIDGE.has(a)) bridge = true;
    if (TRANSMITTERS.has(a) && t0 === CCTP.received) { const d = word(l.data, 0); if (d != null && d < 1000) br = "i" + d; }
    if (MESSENGERS.has(a) && t0 === CCTP.deposit) { const d = word(l.data, 2); if (d != null && d < 1000) br = "o" + d; }
    if (MESSENGERS.has(a) && t0 === CCTP.mint) { const m = big("0x" + String(l.data || "").replace(/^0x/, "").slice(0, 64)) / 10000n; if (m > mint) mint = m; }
    if (a === USDC && t0 === T_AUTH_USED) auth = true;
    if (SWAP_TOPICS.has(t0)) swap = true;
    if (t0 === T.single || t0 === T.batch) nft = true;
    if (t0 === T.transfer) {
      if (l.topics.length === 4) nft = true;
      else if (a === USDC) usd += big(l.data) / 10000n; // 6 decimals → cents
      else token = true;
    }
  }
  if (mint > usd) usd = mint;
  if (xb) { bridge = true; br = xb; }
  // the native coin is USDC (18 decimals); count it when no USDC Transfer log says the same thing already
  const native = M.nativeCents(big(tx.value));
  if (native > usd) usd = native;
  if (!usd && to === USDC && SEL_AUTH.has(sel)) usd = big("0x" + input.slice(138, 202)) / 10000n; // (from, to, value, …)
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
  // GX7: the fee in USDC (the native gas coin, 18 decimals) in millionths of a dollar
  let fee = 0;
  if (rc && rc.gasUsed) { const f = M.feeMicro(big(rc.gasUsed) * big(rc.effectiveGasPrice || tx.gasPrice || "0x0")); fee = f > 9007199254740991n ? 9007199254740991 : Number(f); }
  return { k, usd: cents, ok, sel, br, route, auth: auth ? 1 : 0, fee };
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

// ---------------------------------------------------------------- claim a star (GX8)
// A contract's owner names its star: they sign a message with the wallet that the contract's owner() returns, the
// server recovers the signer (EIP-191) and reads owner() from the chain. Only what the chain proves: no owner() → no
// claim. Names that pretend to be Arc / Circle / USDC / us, or anything already labelled, are refused.
export const CLAIM_RESERVED = /\b(arc|circle|usdc|eurc|cctp|uniswap|arcircle|arcia|official|tether|usdt|metamask|binance|coinbase)\b/i;
export const CLAIM_TTL_MS = 10 * 60e3;
export function cleanClaimName(n) {
  const v = String(n || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (v.length < 2 || v.length > 28) return null;
  if (!/^[\p{L}\p{N} .\-_&'·!+]+$/u.test(v)) return null;
  if (CLAIM_RESERVED.test(v)) return null;
  return v;
}
export const claimMessage = (addr, name, issued) => `ARC GALAXY — name a star\nContract: ${String(addr).toLowerCase()}\nName: ${name}\nIssued: ${issued}`;
const ownerOfWord = (res) => { const h = String(res || "").replace(/^0x/, ""); return h.length >= 64 && /^0{24}/.test(h.slice(0, 24)) && !/^0+$/.test(h.slice(24, 64)) ? "0x" + h.slice(24, 64).toLowerCase() : null; };
// GX6: what kind of contract it is, from its code alone (when it has no token name): an EIP-1167 clone (the
// implementation's address is in the code), an EIP-1967 proxy (the implementation in its storage slot), a Safe wallet
// (the proxy's masterCopy() selector). Only what the bytes prove — the label names the pattern, never a guess at the app.
export const SLOT_1967 = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const shortA = (a) => a.slice(0, 6) + "…" + a.slice(-4);
export function codeKind(code, slot) {
  const c = String(code || "").toLowerCase();
  if (!c || c === "0x") return null;
  const m = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/.exec(c);
  if (m) return { kind: "clone", impl: "0x" + m[1] };
  const sl = String(slot || "").toLowerCase().replace(/^0x/, "");
  if (/^[0-9a-f]{64}$/.test(sl) && !/^0+$/.test(sl)) return { kind: "proxy", impl: "0x" + sl.slice(24) };
  if (c.length < 2400 && c.includes("a619486e")) return { kind: "safe" };
  return null;
}
export function kindLabel(k, implName) {
  if (!k) return null;
  if (k.kind === "safe") return { n: "Safe wallet", g: "infra" };
  const who = implName ? implName[0] : shortA(k.impl);
  return { n: (k.kind === "clone" ? "Clone · " : "Proxy · ") + who, g: implName ? implName[1] : "other" };
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
// maxBlocks / backfill / batch: Arc reads 120 / 100 blocks a call in batches of 40; Robinhood Chain (0.1 s blocks, an RPC that
// rate-limits bursts of ~150 requests) 60 / 30 in batches of 20 with 0.25 s between them — its explorer API sits behind a bot check, so names come from eth_call
export function makeGalaxy({ rpc = arcRpc, now = () => Date.now(), store = defaultStore, explorer = explorerFor(null), snapEvery = 45e3, key = "arcGalaxy", cls = classify, chain = 5042, before = null, maxBlocks = MAX_BLOCKS, backfill = BACKFILL, batch = 40, pause = 0 } = {}) {
  const st = { head: 0, rows: [], blocks: [], receipts: true, readAt: 0, out: null, busy: null, err: null, names: new Map(), loaded: false, snapAt: 0, day: [], claims: new Map(), rec: null };
  const call = async (method, params) => { const r = await rpc({ jsonrpc: "2.0", id: 1, method, params }); if (r.error) throw new Error(r.error.message || "rpc error"); return r.result; };

  async function readBlocks(from, to) {
    const ns = []; for (let n = from; n <= to; n++) ns.push(n);
    const body = [];
    ns.forEach((n, i) => { body.push({ jsonrpc: "2.0", id: 2 * i, method: "eth_getBlockByNumber", params: [hx(n), true] }); if (st.receipts) body.push({ jsonrpc: "2.0", id: 2 * i + 1, method: "eth_getBlockReceipts", params: [hx(n)] }); });
    const out = [];
    // Arc's RPC takes 100 a batch; Robinhood Chain's refuses bursts, so it gets a pause between batches. A refused batch after
    // some were read keeps what was read (the next call goes on from there) instead of losing the whole read
    for (let i = 0; i < body.length; i += batch) {
      try { out.push(...(await rpc(body.slice(i, i + batch)))); } catch (e) { if (!out.length) throw e; break; }
      if (pause && i + batch < body.length) await new Promise((r) => setTimeout(r, pause));
    }
    const by = new Map(out.map((r) => [r.id, r]));
    const res = [];
    for (let i = 0; i < ns.length; i++) {
      const b = by.get(2 * i), r = st.receipts ? by.get(2 * i + 1) : null;
      if (!b || !b.result || (st.receipts && !r)) break; // contiguous: stop at the first block not (fully) read
      if (r && r.error && /not (found|supported|available)|unknown|does not exist/i.test(String(r.error.message))) st.receipts = false;
      res.push({ b: b.result, rcs: r && Array.isArray(r.result) ? r.result : null });
    }
    return res;
  }

  // GX9: records — today's (UTC) and everything ARC GALAXY has seen: the biggest USDC move [cents, tx, t], the busiest
  // block [txs, number, t], the peak tx/s over a minute [x100, head, t]; kept with the snapshot
  const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
  function bump(kind, v, ref, t) {
    if (!(v > 0)) return;
    const r = st.rec || (st.rec = { day: dayKey(t), today: {}, ever: {} });
    if (r.day !== dayKey(t)) { r.day = dayKey(t); r.today = {}; }
    if (!r.today[kind] || v > r.today[kind][0]) r.today[kind] = [v, ref, t];
    if (!r.ever[kind] || v > r.ever[kind][0]) r.ever[kind] = [v, ref, t];
  }
  function add({ b, rcs }) {
    const n = Number(b.number), ts = Number(b.timestamp) * 1000;
    const byHash = new Map((rcs || []).map((r) => [lc(r.transactionHash), r]));
    let fails = 0, usd = 0, fee = 0, auth = 0;
    let nTx = 0;
    for (const tx of b.transactions || []) {
      if (typeof tx !== "object") continue;
      const c = cls(tx, byHash.get(lc(tx.hash)) || null);
      if (!c) continue; // a chain's own system tx (Robinhood Chain's ArbOS start-of-block) isn't anyone's transaction
      nTx++;
      if (c.ok === 0) fails++;
      usd += c.usd; fee += c.fee; auth += c.auth;
      if (c.usd > 0 && c.ok !== 0) bump("usd", c.usd, lc(tx.hash), ts);
      st.rows.push([lc(tx.hash), n, lc(tx.from), lc(tx.to || ""), c.k, c.usd, c.ok, c.sel, ts, c.br || 0, c.route || 0, c.auth]);
    }
    st.blocks.push([n, ts, nTx, fails, usd, Number(big(b.gasUsed)), fee, auth]);
    bump("block", nTx, n, ts);
  }

  function trim(t) {
    const keep = t - KEEP_MS;
    while (st.blocks.length && st.blocks[0][1] < keep) st.blocks.shift();
    let i = 0; while (i < st.rows.length && st.rows[i][8] < keep) i++;
    if (i) st.rows.splice(0, i);
  }

  // names: what the store already knows, then the chain, then the explorer
  const nameOf = (a) => { const n = LABELS[a] ? { n: LABELS[a][0], g: LABELS[a][1], at: Infinity } : st.claims.get(a) || st.names.get(a); return n && n.n ? [n.n, n.g] : null; };
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
      if (!lab) { // GX6: the code says what it is
        try {
          const out = await rpc([{ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [a, "latest"] }, { jsonrpc: "2.0", id: 2, method: "eth_getStorageAt", params: [a, SLOT_1967, "latest"] }]);
          const byId = new Map((Array.isArray(out) ? out : []).filter(Boolean).map((r) => [r.id, r])), c = byId.get(1), sl = byId.get(2);
          const k = codeKind(c && c.result, sl && sl.result);
          const kl = kindLabel(k, k && k.impl ? nameOf(k.impl) : null);
          if (kl) { lab = kl.n; g = kl.g; }
        } catch { /* stays unnamed */ }
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
    try { const c = (await store.get([key + "/claims"]).catch(() => ({})))[key + "/claims"]; if (c && Array.isArray(c.list)) for (const x of c.list) if (x && x.a && x.n) st.claims.set(x.a, { n: x.n, g: x.g || "other", by: x.by, at: x.at }); } catch { /* none yet */ }
    const d = (await store.get([key + "/snap"]).catch(() => ({})))[key + "/snap"];
    if (!d || !d.j) return;
    try {
      const j = JSON.parse(d.j);
      if (Array.isArray(j.day)) st.day = j.day.filter((m) => m[0] > t - 864e5);
      if (!(t - (j.at || 0) < 10 * 60e3) || !Array.isArray(j.rows)) return;
      if (j.names) for (const [a, n, g] of j.names) if (!st.names.has(a)) st.names.set(a, { n, g, at: t });
      if (j.rec && !st.rec) st.rec = j.rec;
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
    const rows = st.rows.slice(-900), j = JSON.stringify({ at: t, head: st.head, rows, blocks: st.blocks, day: dayOut(), names, rec: st.rec });
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
    // rates only over blocks read back to back: a feed that sleeps between viewers skips blocks, and the time across a gap
    // isn't time the chain was idle (Robinhood Chain showed 3.8 s blocks for 0.1 s ones in production)
    const runs = (arr) => { let sec = 0, tx = 0, usd = 0, pairs = 0; for (let i = 1; i < arr.length; i++) if (arr[i][0] === arr[i - 1][0] + 1) { sec += (arr[i][1] - arr[i - 1][1]) / 1000; tx += arr[i][2]; usd += arr[i][4]; pairs++; } return { sec, tx, usd, pairs }; };
    const R = runs(b), R1 = runs(m1);
    const bt = R.pairs ? R.sec / R.pairs : b.length > 1 ? span / (b.length - 1) : null;
    return {
      chain, head: st.head, at: t, receipts: st.receipts, sampled,
      stats: {
        span, txs: total, tps: R.sec > 0 ? R.tx / R.sec : span > 0 ? total / span : null, tps1m: R1.sec >= 5 ? R1.tx / R1.sec : span1 > 0 ? tx1 / span1 : null,
        cover: R.sec, usdCover: R.usd,
        blockTime: bt, usd1m: m1.reduce((s, x) => s + x[4], 0), usd10m: b.reduce((s, x) => s + x[4], 0),
        failRate: known.length ? failed / known.length : null, kinds, wallets: new Set(st.rows.map((r) => r[2])).size,
        // GX7: fees paid in USDC (millionths of a dollar) and signed (EIP-3009) payments over the ten minutes; blocks read without receipts carry no fee
        fee10m: b.reduce((s, x) => s + (x[6] || 0), 0), feeTxs: st.receipts ? total : 0, auth10m: b.reduce((s, x) => s + (x[7] || 0), 0),
      },
      top: topList, blocks: b.map((x) => x.slice(0, 5)),
      rows: rows.map((r) => r.slice(0, 12)), labels, groups: GROUPS, kindNames: KINDS, claimed: [...st.claims.keys()].filter((a) => labels[a]),
      err: st.err,
    };
  }

  async function refresh() {
    const t = now();
    if (before) await before().catch(() => {}); // e.g. the ETH price for a chain whose money is ETH
    const head = Number(await call("eth_blockNumber", []));
    let from = st.head ? st.head + 1 : head - backfill + 1;
    if (head - from + 1 > maxBlocks) from = head - maxBlocks + 1; // asleep too long: skip the gap (the older rows age out)
    if (from <= head) { const got = await readBlocks(from, head); for (const x of got) add(x); st.head = got.length ? Number(got[got.length - 1].b.number) : st.head || from - 1; }
    trim(Math.max(t, st.blocks.length ? st.blocks[st.blocks.length - 1][1] : 0));
    // name what's busy or just flew (the busiest first)
    const cnt = new Map(); for (const r of st.rows) if (r[3] && r[4] !== K.usdc) cnt.set(r[3], (cnt.get(r[3]) || 0) + 1);
    await Promise.race([resolveNames([...cnt.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40).map((x) => x[0]), t), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
    addDay(); saveSnap(t);
    st.err = null; st.readAt = t; st.out = shape(t);
    if (st.out.stats && st.out.stats.tps1m != null && st.blocks.length > 60) bump("tps", Math.round(st.out.stats.tps1m * 100), st.head, t);
    st.out.records = st.rec;
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
    const c = cls(t, rc || null) || { k: 7, usd: 0, ok: -1, sel: "", br: 0, route: 0, auth: 0, fee: 0 }, n = Number(t.blockNumber);
    const b = await rpc({ jsonrpc: "2.0", id: 3, method: "eth_getBlockByNumber", params: [hx(n), false] }).catch(() => null);
    const ts = b && b.result ? Number(b.result.timestamp) * 1000 : now();
    const to = lc(t.to || "");
    await resolveNames([to].filter(Boolean), now()).catch(() => {});
    const labels = {}; const nm = to && nameOf(to); if (nm) labels[to] = nm;
    return { row: [lc(t.hash), n, lc(t.from), to, c.k, c.usd, c.ok, c.sel, ts, c.br || 0, c.route || 0, c.auth], fee: c.fee, labels, contract: rc && rc.contractAddress ? lc(rc.contractAddress) : null };
  }
  /// GX8: the owner names its star — { addr, name, issued, sig } signed by the wallet owner() returns
  async function claim(body, recover, t = now()) {
    const addr = lc(body && body.addr), name = cleanClaimName(body && body.name), issued = String((body && body.issued) || "");
    if (!/^0x[0-9a-f]{40}$/.test(addr)) return { error: "not a contract address", status: 400 };
    if (!name) return { error: "pick a name of 2–28 letters or numbers (Arc, Circle, USDC and other brands are reserved)", status: 400 };
    if (LABELS[addr]) return { error: "this star already carries its known name", status: 409 };
    const it = Date.parse(issued); if (!(it > 0) || Math.abs(t - it) > CLAIM_TTL_MS) return { error: "the signature is too old — sign again", status: 400 };
    let signer = null; try { signer = lc(recover(claimMessage(addr, String(body.name), issued), String(body.sig || ""))); } catch { signer = null; } // (signed as sent; stored cleaned)
    if (!signer || !/^0x[0-9a-f]{40}$/.test(signer)) return { error: "couldn't read the signature", status: 400 };
    let owner = null;
    try { const out = await rpc({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: addr, data: "0x8da5cb5b" }, "latest"] }); owner = ownerOfWord(out && out.result); } catch { owner = null; }
    if (!owner) return { error: "this contract has no owner() to check, so it can't be claimed yet", status: 409 };
    if (owner !== signer) return { error: "only the wallet that owner() returns can name this star", status: 403 };
    const prev = st.claims.get(addr), g = (st.names.get(addr) && st.names.get(addr).g) || "other";
    st.claims.set(addr, { n: name, g, by: signer, at: t });
    if (st.claims.size > 500) st.claims.delete(st.claims.keys().next().value);
    await store.set(key + "/claims", { at: t, list: [...st.claims.entries()].map(([a, v]) => ({ a, ...v })) });
    if (st.out) st.out = shape(t);
    return { ok: true, addr, name, by: signer, renamed: !!prev };
  }
  /// GX8: a contract's own page (/galaxy/c/<address>): the galaxy, opened on that star, with its own link card
  function pageMeta(addr) {
    const a = lc(addr); if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
    const n = nameOf(a), c = st.rows.filter((r) => r[3] === a).length, top = st.out && st.out.top ? st.out.top.findIndex((x) => x[0] === a) : -1;
    const title = (n ? n[0] : a.slice(0, 6) + "…" + a.slice(-4)) + " on ARC GALAXY";
    const desc = (top >= 0 ? `#${top + 1} busiest contract on Arc right now · ` : "") + (c ? `${c} transactions in the last 10 minutes · ` : "") + "watch it live in 3D on ARC GALAXY";
    return { addr: a, title, desc, claimed: st.claims.has(a) };
  }
  /// the last 24 hours, a minute at a time: [minute, txs, usd cents, failed] (only minutes the feed read)
  async function day() { if (!st.loaded) await loadSnap(now()).catch(() => {}); return { at: now(), minutes: dayOut() }; }
  return { live, day, tx, claim, pageMeta, state: st, nameOf, ready: async () => { if (!st.loaded) await loadSnap(now()).catch(() => {}); } };
}

// GXR: ROBINHOOD CHAIN (chain 4663, Arbitrum Orbit, gas in ETH) through the same engine. Labels: only what this repo's
// own config proves (config-arc.js ARCPAD_RH / PONS / NFT / OMNI, liq-core.js); names otherwise from its Blockscout.
export const ROBINHOOD = {
  chainId: 4663, explorer: "https://robinhoodchain.blockscout.com",
  rpcs: () => [process.env.ROBINHOOD_RPC_URL, "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  // the dollar that moves there: USDG "Global Dollar" (6 decimals) — the worker's measurement 2026-11-07: no USDC Transfer
  // in 200 blocks, USDG 110; ROBINHOOD_USDC overrides once a USDC is live
  usdc: process.env.ROBINHOOD_USDC || "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
  weth: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
  arbsys: "0x0000000000000000000000000000000000000064",
  internal: "0x6a", // ArbOS's start-of-block system transaction (from 0x…0a4b05) — no one's transaction
  deposits: new Set(["0x64", "0x65", "0x66", "0x68", "0x69"]), // Arbitrum deposit / retryable kinds: value arriving from the parent chain
  parentDomain: 0, // drawn at the Ethereum gate
};
Object.assign(LABELS, {
  "0x58daec3116aae6d93017baaea7749052e8a04fa7": ["Uniswap Positions (Robinhood)", "uniswap"],
  [ROBINHOOD.weth]: ["WETH", "token"],
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": ["USDG · Global Dollar", "token"],
  "0x0000000000000068f116a894984e2db1123eb395": ["Seaport", "other"],
  "0x1446af2d4b86cf31a96bde8173c2bc39c8a2eeaf": ["ArcPad Factory (Robinhood)", "launch"],
  "0x0ab746332b5b85091b62cbc6f1ce90f1557465b3": ["ArcPad Router (Robinhood)", "launch"],
  "0xd49d2d593fcf79651e2db7f554d4e13f434e8044": ["ArcPad Hook (Robinhood)", "launch"],
  "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e": ["Pons Launch Factory", "launch"],
  "0x8e67b75b4b91c5c95c4562f99980371e4f466daa": ["ARCIRCLE Launch Drop (Robinhood)", "arcircle"],
  "0x6f9ebd0dfc6de9ed47eec18efeb69a9b97c71ee4": ["$ARCIRCLE (Robinhood)", "arcircle"],
  "0xf0c0fc281314a48ae4e52a9db08731cb6a38ca25": ["$ARCIA", "arcircle"],
  "0x2ee3ae4140a08930dc9cede5cde86f3bc906c304": ["ARCIRCLE NFT Vault", "arcircle"],
  "0x95b56477722df40021797121f2fade759dc88f65": ["ARCIRCLE NFT Router", "arcircle"],
  [ROBINHOOD.arbsys]: ["ArbSys (withdrawals)", "infra"],
});
SWAPPERS.add("0x0ab746332b5b85091b62cbc6f1ce90f1557465b3");
let ethPx = null;
export const RH_MONEY = evmMoney({
  usdc: ROBINHOOD.usdc, px: () => ethPx,
  skip: (tx) => lc(tx.type) === ROBINHOOD.internal,
  bridgeOf: (tx) => (ROBINHOOD.deposits.has(lc(tx.type)) ? "i" + ROBINHOOD.parentDomain : lc(tx.to) === ROBINHOOD.arbsys ? "o" + ROBINHOOD.parentDomain : null),
});
let rIdx = 0;
export async function rhRpc(body) {
  const urls = ROBINHOOD.rpcs(); let err;
  for (let k = 0; k < urls.length; k++) {
    const url = urls[(rIdx + k) % urls.length];
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      if (r.status === 429 || r.status >= 500) throw new Error("rpc " + r.status);
      const out = await r.json();
      if (Array.isArray(body) && !Array.isArray(out)) throw new Error((out && out.error && out.error.message) || "batch refused");
      rIdx = (rIdx + k) % urls.length; return out;
    } catch (e) { err = e; }
  }
  throw err || new Error("no robinhood rpc");
}
async function rhPrice() { if (ethPx && Date.now() - (rhPrice.at || 0) < 60e3) return; try { const P = await import("./_pons-arcpad.mjs"); const p = await P.ethUsd(); if (p > 0) { ethPx = p; rhPrice.at = Date.now(); } } catch { /* keep the last price */ } }

// GX4: Arc TESTNET (chain 5042002) — its own RPCs (checked by the worker 2026-11-07: every one takes 100 a batch except
// dRPC; a -32005 'rate limit' right after a big batch passes a moment later → the next RPC), names from eth_call + its
// Blockscout (explorer.testnet.arc.io answers, CORS *), kept apart in the store (arcGalaxyTest…)
export const TESTNET = { chainId: 5042002, rpcs: ["https://rpc.testnet.arc.io", "https://rpc.testnet.arc.network", "https://rpc.quicknode.testnet.arc.io", "https://rpc.blockdaemon.testnet.arc.io"], explorer: "https://explorer.testnet.arc.io" };
let tIdx = 0;
export async function testRpc(body) {
  let err;
  for (let k = 0; k < TESTNET.rpcs.length; k++) {
    const url = TESTNET.rpcs[(tIdx + k) % TESTNET.rpcs.length];
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      if (r.status === 429 || r.status >= 500) throw new Error("rpc " + r.status);
      const out = await r.json();
      const bad = (Array.isArray(out) ? out : [out]).find((x) => x && x.error && /rate|limit|batch/i.test(String(x.error.message)));
      if (bad || (Array.isArray(body) && !Array.isArray(out))) throw new Error((bad && bad.error.message) || "batch refused");
      tIdx = (tIdx + k) % TESTNET.rpcs.length;
      return out;
    } catch (e) { err = e; }
  }
  throw err || new Error("no testnet rpc");
}
let one = null, test = null;
let rh = null;
const inst = (net) => net === "testnet" ? (test || (test = makeGalaxy({ rpc: testRpc, explorer: explorerFor(TESTNET.explorer), key: "arcGalaxyTest" })))
  : net === "robinhood" ? (rh || (rh = makeGalaxy({ rpc: rhRpc, explorer: explorerFor(null), maxBlocks: 60, backfill: 30, batch: 20, pause: 250, key: "rhGalaxy", chain: ROBINHOOD.chainId, cls: (tx, rc) => classifyWith(RH_MONEY, tx, rc), before: rhPrice })))
  : (one || (one = makeGalaxy()));
export const galaxy = (net) => inst(net).live().then((o) => (net === "testnet" ? { ...o, chain: TESTNET.chainId, net: "testnet" } : net === "robinhood" ? { ...o, net: "robinhood", ethUsd: ethPx } : o));
export const galaxyDay = (net) => inst(net).day();
export const galaxyTx = (h, net) => inst(net).tx(h);
export const galaxyClaim = (body, recover, net) => inst(net).claim(body, recover);
// GXD: the daily records — every block read once by a keeper on a clock (api/_galaxy-daily.mjs), kept a UTC day a doc
let dly = null;
const dailyOf = () => dly || (dly = makeDaily({ rpc: arcRpc, classify, key: "arcGalaxy" }));
export const galaxyCollect = (o) => dailyOf().collect(o);
export const galaxyDailyList = (days) => dailyOf().list(days);
export async function galaxyDailyOne(d) {
  const r = await dailyOf().one(d);
  if (!r) return null;
  const g = inst("mainnet"); await g.ready().catch(() => {});
  const want = r.top.map((x) => x[0]).filter((a) => !g.nameOf(a));
  const docs = want.length ? await defaultStore.get(want.map((a) => "arcGalaxyName/" + a)).catch(() => ({})) : {};
  const labels = {};
  for (const [a] of r.top) { const n = g.nameOf(a) || ((docs["arcGalaxyName/" + a] || {}).n ? [docs["arcGalaxyName/" + a].n, docs["arcGalaxyName/" + a].g || "other"] : null); if (n) labels[a] = n; }
  return { ...r, labels };
}
/// GX8: /galaxy/c/<address> — galaxy.html with that contract's title / description / link card and the star to open
export async function galaxyPage(addr, origin, net, fetchTpl) {
  const g = inst(net); await g.ready();
  const m = g.pageMeta(addr);
  let tpl = ""; try { tpl = fetchTpl ? await fetchTpl() : await fetch(new URL("/galaxy.html", origin)).then((r) => (r.ok ? r.text() : "")); } catch { tpl = ""; }
  if (!tpl || !m) return { status: m ? 502 : 404, html: tpl || "<!doctype html><title>ARC GALAXY</title><p><a href=\"/galaxy\">ARC GALAXY</a></p>" };
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const url = `https://www.arcircle.app/galaxy/c/${m.addr}`;
  let h = tpl
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(m.title)}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(m.title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(m.desc)}`)
    .replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${esc(m.desc)}`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(m.desc)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`);
  h = h.replace("</head>", `<link rel="canonical" href="${url}">\n<script>window.__GX = { focus: "${m.addr}" };</script>\n</head>`);
  return { status: 200, html: h };
}

// GX12: how many times ARC GALAXY has been opened, all told — every page open counts (a reload, the same browser or IP
// again, mainnet and testnet together); one counter doc, incremented atomically
export function makeViews({ commit = (w) => fstore.commit(w), get = (p) => fstore.getDocs(p), on = storeOn, doc = "arcGalaxy/views" } = {}) {
  let mem = 0; // no store (a local run): this function's own count
  async function count() {
    if (!on()) return mem;
    const d = await get([doc]).catch(() => ({}));
    return (d[doc] || {}).n || 0;
  }
  async function hit() {
    if (!on()) { mem++; return { views: mem }; }
    await commit([{ inc: doc, fields: { n: 1 } }]).catch(() => null);
    return { views: await count() };
  }
  return { hit, count };
}
let views = null;
const viewsOf = () => views || (views = makeViews());
export const galaxyView = () => viewsOf().hit();
export const galaxyViews = () => viewsOf().count();
