// api/_pump-arcpad.mjs — coins launched on Pump.fun (Solana) through ArcPad (arc-pump.js), and the little Solana
// plumbing the launch page needs (its metadata JSON, an RPC relay).
//
// An ArcPad launch on Pump.fun is an ordinary Pump.fun coin (create_v2, from the creator's own Solana wallet) whose
// creator fees are shared through Pump's own fee-sharing program: create_fee_sharing_config, then update_fee_shares_v2
// with [creator 70%, ARCIRCLE PAD treasury 30%]. update_fee_shares_v2 revokes the sharing config's admin, so nobody —
// the creator included — can change the split again. That sharing config is the on-chain mark: a coin counts as
// "launched through ArcPad" while its bonding curve's creator is the sharing config, the config is active and revoked,
// and its shareholders are exactly the creator at 7000 bps and the treasury at 3000.
//
//   register({mint, sig})  the launch page reports a launch: checked on chain as above, then listed
//   list()                 every listed coin: price and market cap (the curve's virtual reserves; a graduated coin's
//                          from Dexscreener), progress to graduation, the creator fees waiting, the split re-checked
//   saveMeta(b)            the coin's metadata JSON (name, symbol, description, image, links) — pump.fun reads it from
//                          the uri in create_v2; stored under its own hash at a short URL, so it can't change
//   proxy(body)            a JSON-RPC relay to Solana for the launch page, limited to the calls it makes
// A new listing from the last 15 minutes is announced once in the Telegram launch channel (api/_tg.mjs).
import { sha256 } from "@noble/hashes/sha2.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { announcePump } from "./_tg.mjs";
import { withDexStats } from "./_dexstats.mjs";

const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
// keep in step with config-arc.js CONFIG.PUMP
export const CFG = {
  treasury: "DHu2grfJTNV9ipJWkfLXiRR6yLWQWvg4aVDcZJTERmLR", // ARCIRCLE PAD's Solana wallet (env PUMP_TREASURY overrides; empty closes listing)
  rpcs: () => [env("SOLANA_RPC_URL"), "https://api.mainnet-beta.solana.com"].filter(Boolean),
  rpc: null, // tests: (method, params) => result
  solUsd: null, // tests pin the SOL price
  dex: null, // tests: (mints) => { mint: { priceUsd, mcapUsd } }
  metaFetch: null, // tests: (uri) => json
};
export function configure(o) { Object.assign(CFG, o); mem.list = null; mem.view = null; }
export const PROGRAM = {
  pump: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  fees: "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ",
  token2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
};
export const PLATFORM_BPS = 3000;
const LIST_DOC = "pumpArc/list";
const ANNOUNCE_WINDOW = 15 * 60;
const INITIAL_REAL_TOKENS = 793_100_000_000_000n; // Global.initial_real_token_reserves: what the curve sells before it graduates
const RENT_EMPTY = 890_880n; // a zero-data account's rent-exempt minimum, which the creator vault keeps
const treasury = () => env("PUMP_TREASURY") || CFG.treasury;

// ---------------- base58 and program addresses ----------------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58enc(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}
export function b58dec(s) {
  s = String(s || "");
  let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("not base58"); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== "1") break; out.unshift(0); }
  return Uint8Array.from(out);
}
export const isPubkey = (s) => { try { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || "")) && b58dec(s).length === 32; } catch { return false; } };
const onCurve = (b) => { try { ed25519.Point.fromBytes(b); return true; } catch { return false; } };
const te = new TextEncoder();
/// findProgramAddress: the first bump (255 down) whose hash is off the ed25519 curve
export function pda(seeds, program) {
  const prog = b58dec(program), tail = te.encode("ProgramDerivedAddress");
  const parts = seeds.map((x) => (typeof x === "string" ? te.encode(x) : x));
  for (let bump = 255; bump >= 0; bump--) {
    const all = [...parts, Uint8Array.of(bump), prog, tail];
    const buf = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let o = 0; for (const p of all) { buf.set(p, o); o += p.length; }
    const h = sha256(buf);
    if (!onCurve(h)) return b58enc(h);
  }
  throw new Error("no program address");
}
export const sharingConfigPda = (mint) => pda(["sharing-config", b58dec(mint)], PROGRAM.fees);
export const bondingCurvePda = (mint) => pda(["bonding-curve", b58dec(mint)], PROGRAM.pump);
export const creatorVaultPda = (creator) => pda(["creator-vault", b58dec(creator)], PROGRAM.pump);

// ---------------- account layouts (pump-public-docs idl/pump.json, idl/pump_fees.json) ----------------
const DISC = { curve: [23, 183, 248, 55, 96, 216, 172, 96], sharing: [216, 74, 9, 0, 56, 140, 93, 75] };
const disc = (b, d) => b.length >= 8 && d.every((x, i) => b[i] === x);
const u64 = (b, o) => { let n = 0n; for (let i = 7; i >= 0; i--) n = n * 256n + BigInt(b[o + i]); return n; };
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 2 ** 24;
const key = (b, o) => b58enc(b.subarray(o, o + 32));
export function decodeCurve(b) {
  if (!b || !disc(b, DISC.curve) || b.length < 81) return null;
  return {
    virtualTokenReserves: u64(b, 8), virtualQuoteReserves: u64(b, 16), realTokenReserves: u64(b, 24), realQuoteReserves: u64(b, 32),
    tokenTotalSupply: u64(b, 40), complete: b[48] === 1, creator: key(b, 49),
    quoteMint: b.length >= 115 ? key(b, 83) : "11111111111111111111111111111111",
  };
}
export function decodeSharing(b) {
  if (!b || !disc(b, DISC.sharing) || b.length < 8 + 3 + 64 + 1 + 4) return null;
  let o = 8;
  const bump = b[o++], version = b[o++], status = b[o++] === 1 ? "active" : "paused";
  const mint = key(b, o); o += 32;
  const admin = key(b, o); o += 32;
  const adminRevoked = b[o++] === 1;
  const n = u32(b, o); o += 4;
  if (n > 10 || b.length < o + n * 34) return null;
  const shareholders = [];
  for (let i = 0; i < n; i++) { shareholders.push({ address: key(b, o), shareBps: u16(b, o + 32) }); o += 34; }
  return { bump, version, status, mint, admin, adminRevoked, shareholders };
}
/// is this sharing config ArcPad's 70 / 30? → { ok, creator, why }
export function splitCheck(sc, mint) {
  const T = treasury();
  if (!isPubkey(T)) return { ok: false, why: "ArcPad × Pump.fun isn't set up yet (no treasury)" };
  if (!sc) return { ok: false, why: "this coin has no fee-sharing config" };
  if (sc.mint !== mint) return { ok: false, why: "the fee-sharing config is for another coin" };
  if (sc.status !== "active") return { ok: false, why: "the fee-sharing config is paused" };
  if (!sc.adminRevoked) return { ok: false, why: "the fee split isn't locked yet (update_fee_shares_v2 hasn't run)" };
  const t = sc.shareholders.find((s) => s.address === T), c = sc.shareholders.find((s) => s.address !== T);
  if (sc.shareholders.length !== 2 || !t || !c || t.shareBps !== PLATFORM_BPS || c.shareBps !== 10000 - PLATFORM_BPS) return { ok: false, why: "the fee split isn't 70% creator / 30% ARCIRCLE PAD" };
  return { ok: true, creator: c.address };
}

// ---------------- Solana RPC ----------------
async function rpc(method, params) {
  if (CFG.rpc) return CFG.rpc(method, params);
  let last = null;
  for (const u of CFG.rpcs()) {
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => null);
      if (j && j.error) { last = new Error(String(j.error.message || "rpc error")); continue; }
      if (j && "result" in j) return j.result;
      last = new Error(`rpc ${r.status}`);
    } catch (e) { last = e; }
  }
  throw last || new Error("no Solana RPC");
}
const b64 = (s) => Uint8Array.from(Buffer.from(String(s || ""), "base64"));
/// addresses → [{ owner, lamports, data: Uint8Array } | null]
async function accounts(addrs) {
  const out = [];
  for (let i = 0; i < addrs.length; i += 100) {
    const r = await rpc("getMultipleAccounts", [addrs.slice(i, i + 100), { encoding: "base64", commitment: "confirmed" }]);
    for (const a of (r && r.value) || []) out.push(a ? { owner: a.owner, lamports: BigInt(a.lamports || 0), data: b64(Array.isArray(a.data) ? a.data[0] : "") } : null);
  }
  return out;
}
/// name / symbol / uri from the Token-2022 mint's metadata extension
async function mintMeta(mint) {
  const r = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]).catch(() => null);
  const ext = r && r.value && r.value.data && r.value.data.parsed && r.value.data.parsed.info && r.value.data.parsed.info.extensions;
  const md = Array.isArray(ext) ? (ext.find((e) => e && e.extension === "tokenMetadata") || {}).state : null;
  return md ? { name: String(md.name || "").slice(0, 32), symbol: String(md.symbol || "").slice(0, 13), uri: String(md.uri || "").slice(0, 200) } : { name: "", symbol: "", uri: "" };
}
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const httpsOr = (v) => (/^https:\/\/[^\s"'<>]+$/i.test(String(v || "")) ? String(v).slice(0, 300) : "");
/// the metadata JSON the uri points at (https only, small)
async function metaJson(uri) {
  if (!/^https:\/\//i.test(uri)) return {};
  try {
    const j = CFG.metaFetch ? await CFG.metaFetch(uri) : await fetch(uri, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } }).then(async (r) => {
      if (!r.ok) return null;
      const t = await r.text();
      return t.length > 20000 ? null : JSON.parse(t);
    });
    if (!j || typeof j !== "object") return {};
    return { image: httpsOr(j.image), description: clean(j.description, 400), twitter: httpsOr(j.twitter), telegram: httpsOr(j.telegram), website: httpsOr(j.website) };
  } catch { return {}; }
}

// ---------------- prices ----------------
const px = { usd: null, at: 0 };
async function solUsd() {
  if (CFG.solUsd) return CFG.solUsd;
  if (px.usd && Date.now() - px.at < 60e3) return px.usd;
  const get = (u) => fetch(u, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const cb = await get("https://api.coinbase.com/v2/prices/SOL-USD/spot");
  let p = cb && cb.data ? Number(cb.data.amount) : null;
  if (!(p > 0)) { const cg = await get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"); p = cg && cg.solana ? Number(cg.solana.usd) : null; }
  if (p > 0) { px.usd = p; px.at = Date.now(); }
  return px.usd;
}
/// graduated coins trade on PumpSwap: their price from Dexscreener
async function dexPrices(mints) {
  if (!mints.length) return {};
  if (CFG.dex) return CFG.dex(mints);
  const out = {};
  for (let i = 0; i < mints.length; i += 30) {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mints.slice(i, i + 30).join(",")}`, { signal: AbortSignal.timeout(5000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    for (const p of Array.isArray(r) ? r : []) {
      const m = p && p.baseToken && p.baseToken.address;
      if (!m || (out[m] && (out[m].liq || 0) >= ((p.liquidity && p.liquidity.usd) || 0))) continue;
      out[m] = { priceUsd: Number(p.priceUsd) || null, mcapUsd: Number(p.marketCap || p.fdv) || null, liq: (p.liquidity && p.liquidity.usd) || 0 };
    }
  }
  return out;
}

// ---------------- storage ----------------
const mem = { list: null, view: null };
async function readList(store) {
  if (store) { const d = await store.get(LIST_DOC).catch(() => null); return (d && Array.isArray(d.items) ? d.items : null) || mem.list || []; }
  return mem.list || [];
}
async function writeList(store, items) {
  mem.list = items;
  if (store) await store.set(LIST_DOC, { items, at: Date.now() }).catch(() => null);
}

/// mint → { curve, sc, check } read live
async function chainOf(mint) {
  const scA = sharingConfigPda(mint), cvA = bondingCurvePda(mint);
  const [sc, cv] = await accounts([scA, cvA]);
  const curve = cv && cv.owner === PROGRAM.pump ? decodeCurve(cv.data) : null;
  const sharing = sc && sc.owner === PROGRAM.fees ? decodeSharing(sc.data) : null;
  return { scA, cvA, curve, sharing };
}

/// price, market cap, graduation progress and the waiting creator fees, live; the split re-checked
async function withPrices(items) {
  if (!items.length) return [];
  const sol = await solUsd();
  const addrs = items.flatMap((x) => [x.curve, x.sharingConfig, x.vault]);
  const acc = await accounts(addrs).catch(() => addrs.map(() => undefined));
  const grads = [];
  const rows = items.map((x, j) => {
    const [cv, sc, va] = acc.slice(3 * j, 3 * j + 3);
    const read = cv !== undefined;
    const curve = cv && cv.owner === PROGRAM.pump ? decodeCurve(cv.data) : null;
    const sharing = sc && sc.owner === PROGRAM.fees ? decodeSharing(sc.data) : null;
    let priceSol = null, progress = null, graduated = !!x.graduated, supply = 1e9;
    if (curve) {
      graduated = curve.complete;
      supply = Number(curve.tokenTotalSupply) / 1e6 || 1e9;
      if (!curve.complete && curve.virtualTokenReserves > 0n) priceSol = (Number(curve.virtualQuoteReserves) / 1e9) / (Number(curve.virtualTokenReserves) / 1e6);
      progress = curve.complete ? 100 : Math.max(0, Math.min(100, (Number(INITIAL_REAL_TOKENS - curve.realTokenReserves) / Number(INITIAL_REAL_TOKENS)) * 100));
    }
    if (graduated) grads.push(x.mint);
    const waiting = va ? (va.lamports > RENT_EMPTY ? va.lamports - RENT_EMPTY : 0n) : read ? 0n : null;
    const chk = sharing ? splitCheck(sharing, x.mint) : null;
    const priceUsd = priceSol != null && sol ? priceSol * sol : null;
    return {
      ...x, graduated, progress: progress != null ? Math.round(progress * 10) / 10 : x.progress ?? null,
      priceSol, priceUsd, mcapUsd: priceUsd != null ? priceUsd * supply : null, solUsd: sol || null,
      feesWaitingLamports: waiting != null ? waiting.toString() : null,
      active: read ? !!(chk && chk.ok && curve && curve.creator === x.sharingConfig) : x.active !== false, checked: read,
    };
  });
  if (grads.length) {
    const d = await dexPrices(grads).catch(() => ({}));
    for (const r of rows) if (r.graduated && d[r.mint]) { r.priceUsd = d[r.mint].priceUsd; r.mcapUsd = d[r.mint].mcapUsd; r.priceSol = r.priceUsd && sol ? r.priceUsd / sol : null; }
  }
  return rows;
}

async function maybeAnnounce(item, { force = false } = {}) {
  if (item.tg && !force) return "already";
  const age = Date.now() / 1000 - (item.launchedAt || 0);
  if (!force && !(age >= -60 && age <= ANNOUNCE_WINDOW)) return "too old";
  const [live] = await withPrices([item]).catch(() => [item]);
  const r = await announcePump(live).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
  if (r && r.ok) item.tg = Math.floor(Date.now() / 1000);
  return r && r.ok ? "sent" : (r && r.error) || "not sent";
}

/// GET ?pumparc=list
export async function list({ store = null } = {}) {
  if (mem.view && Date.now() - mem.view.at < 45e3) return mem.view;
  const items = await readList(store);
  const view = await withDexStats("solana", await withPrices(items), "mint");
  mem.view = { items: view, treasury: treasury() || null, platformBps: PLATFORM_BPS, at: Date.now() };
  return mem.view;
}
/// POST {action:"pumpreg", mint, sig?} → list a Pump.fun coin whose creator fees are split 70 / 30 with ARCIRCLE PAD
export async function register({ mint, sig }, { store } = {}) {
  mint = String(mint || "").trim(); sig = String(sig || "").trim();
  if (!isPubkey(mint)) return { status: 400, body: { error: "mint must be a Solana address" } };
  if (sig && !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) sig = "";
  const c = await chainOf(mint);
  if (!c.curve) return { status: 404, body: { error: "that isn't a Pump.fun coin (no bonding curve yet — wait a few seconds)" } };
  const chk = splitCheck(c.sharing, mint);
  if (!chk.ok) return { status: 409, body: { error: chk.why } };
  if (c.curve.creator !== c.scA) return { status: 409, body: { error: "the coin's creator fees don't go to its fee-sharing config" } };
  const items = await readList(store);
  let item = items.find((x) => x.mint === mint);
  if (!item) {
    const m = await mintMeta(mint);
    const j = await metaJson(m.uri);
    item = {
      mint, creator: chk.creator, curve: c.cvA, sharingConfig: c.scA, vault: creatorVaultPda(c.scA), sig,
      name: m.name, symbol: m.symbol, uri: m.uri, image: j.image || "", description: j.description || "",
      twitter: j.twitter || "", telegram: j.telegram || "", website: j.website || "", launchedAt: Math.floor(Date.now() / 1000),
    };
    items.push(item);
  }
  const tg = await maybeAnnounce(item);
  await writeList(store, items);
  mem.view = null;
  return { status: 200, body: { ok: true, mint, creator: item.creator, sharingConfig: item.sharingConfig, tg } };
}

// ---------------- the coin's metadata JSON ----------------
/// POST {action:"pumpmeta", name, symbol, description, image, twitter, telegram, website} → { id, uri, doc }
export function metaDoc(b) {
  const name = clean(b.name, 32), symbol = clean(b.symbol, 13);
  if (!name || !symbol) return { error: "name and symbol are needed" };
  const image = httpsOr(b.image);
  if (b.image && !image) return { error: "the logo must be an https:// link" };
  const doc = { name, symbol, description: clean(b.description, 1000), image, showName: true, createdOn: "https://www.arcircle.app/arc" };
  for (const k of ["twitter", "telegram", "website"]) { const v = httpsOr(b[k]); if (v) doc[k] = v; }
  const body = JSON.stringify(doc);
  const id = Array.from(sha256(te.encode(body)).subarray(0, 12), (x) => x.toString(16).padStart(2, "0")).join("");
  return { id, uri: `https://www.arcircle.app/pm/${id}`, doc, body };
}
export const META_ID = /^[0-9a-f]{24}$/;

// ---------------- the RPC relay ----------------
// only what arc-pump.js (web3.js Connection + the pump SDK) calls; no account scans
const ALLOW = new Set(["getAccountInfo", "getMultipleAccounts", "getBalance", "getLatestBlockhash", "getSignatureStatuses", "sendTransaction",
  "simulateTransaction", "getMinimumBalanceForRentExemption", "getFeeForMessage", "getSlot", "getBlockHeight", "getRecentPrioritizationFees", "getTokenAccountBalance", "getEpochInfo", "getGenesisHash", "getVersion", "isBlockhashValid"]);
export async function proxy(body) {
  const qs = Array.isArray(body) ? body : [body];
  if (!qs.length || qs.length > 20) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch too large" } };
  const bad = qs.find((q) => !q || q.jsonrpc !== "2.0" || !ALLOW.has(q.method));
  if (bad) return { jsonrpc: "2.0", id: bad && bad.id != null ? bad.id : null, error: { code: -32601, message: "not available through ArcPad's relay" } };
  const clean = qs.map((q) => ({ jsonrpc: "2.0", id: q.id != null ? q.id : null, method: q.method, params: Array.isArray(q.params) ? q.params : [] }));
  const send = Array.isArray(body) ? clean : clean[0];
  if (CFG.rpc) { const one = async (q) => { try { return { jsonrpc: "2.0", id: q.id, result: await CFG.rpc(q.method, q.params) }; } catch (e) { return { jsonrpc: "2.0", id: q.id, error: { code: -32000, message: String(e.message || e) } }; } }; return Array.isArray(body) ? Promise.all(clean.map(one)) : one(clean[0]); }
  // the node's answer as it is (a failed simulation's logs included); the next node only when this one is down or busy
  let last = null;
  for (const u of CFG.rpcs()) {
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(send), signal: AbortSignal.timeout(12000) });
      if (r.status === 429 || r.status >= 500) { last = `rpc ${r.status}`; continue; }
      const j = await r.json().catch(() => null);
      if (j) return j;
      last = `rpc ${r.status}`;
    } catch (e) { last = String((e && e.message) || e); }
  }
  return { jsonrpc: "2.0", id: Array.isArray(body) ? null : clean[0].id, error: { code: -32000, message: "Solana RPC unreachable: " + String(last || "").slice(0, 120) } };
}

export const _test = { decodeCurve, decodeSharing, splitCheck, mem, withPrices };
