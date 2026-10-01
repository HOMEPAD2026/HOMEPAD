// api/_pons-arcpad.mjs — coins launched on Pons V2 (Robinhood Chain) through ArcPad (arc-pons.js).
//
// An ArcPad launch on Pons is an ordinary Pons V2 launch from the creator's own wallet whose creatorFeeRecipient is the
// creator's ArcPadPonsSplitter (contracts/contracts/ArcPadPonsSplits.sol): 70% the creator, 30% the ARCIRCLE PAD
// treasury. That recipient is the on-chain mark: a coin counts as "launched through ArcPad" while
// PonsV2LaunchFactory.getLaunchedToken(token).creatorFeeRecipient == ArcPadPonsSplits.splitterOf(deployer). Pons lets
// only the current recipient move it and the splitter has no function that does, so it stays — unless Pons's owner
// overrides it (their timelocked recovery power); such a coin is marked inactive.
//
//   register(token, tx)   the launch page reports a launch: the receipt must be a Pons V2 launch of that token by the
//                         factory, its recipient the creator's splitter — then it's listed
//   list()                every listed coin: price and market cap (the curve's reserves, or the graduated v4 pool's
//                         slot0), progress to graduation, the recipient re-checked. New TokenLaunched logs are also
//                         scanned, so a launch whose report never arrived is found.
//   coin(token)           one listed coin, live
// A new listing from the last 15 minutes is announced once in the Telegram launch channel (api/_tg.mjs).
import { evmChain } from "./_evm.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { announcePons } from "./_tg.mjs";

const env = (k) => (typeof process !== "undefined" && process.env ? process.env[k] : undefined);
// keep in step with config-arc.js CONFIG.PONS
export const CFG = {
  factory: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e", // PonsV2LaunchFactory
  splits: "", // ArcPadPonsSplits (set after it's deployed; env ARCPAD_PONS_SPLITS overrides)
  fromBlock: 0, // the block ArcPadPonsSplits was deployed in (the scan starts there)
  rpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  ethUsd: null, // tests pin the ETH price
};
export function configure(o) { Object.assign(CFG, o); ch = null; mem.list = null; mem.cursor = null; mem.view = null; mem.k = null; }
const splitsAddr = () => lc(env("ARCPAD_PONS_SPLITS") || CFG.splits);
export const PLATFORM_BPS = 3000;
const LIST_DOC = "ponsArc/list", CURSOR_DOC = "ponsArc/cursor";
const ANNOUNCE_WINDOW = 15 * 60;

const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const strip = (h) => String(h).replace(/^0x/, "");
const pad = (h) => strip(h).toLowerCase().padStart(64, "0");
const hexOf = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
const keccakHex = (hex) => "0x" + Array.from(keccak_256(Uint8Array.from((strip(hex).match(/../g) || []).map((b) => parseInt(b, 16)))), (b) => b.toString(16).padStart(2, "0")).join("");
const sig = (s) => keccakHex(hexOf(s));
const sel = (s) => sig(s).slice(0, 10);
const W = (h, i) => BigInt("0x" + (strip(h).slice(i * 64, i * 64 + 64) || "0"));
const wAddr = (h, i) => "0x" + strip(h).slice(i * 64 + 24, i * 64 + 64).toLowerCase();
const topicAddr = (t) => "0x" + strip(t).slice(24).toLowerCase();
const int24 = (v) => { const n = Number(BigInt.asUintN(24, v)); return n >= 0x800000 ? n - 0x1000000 : n; };
export const TOPIC = { launched: sig("TokenLaunched(address,address,address,address,uint256,uint256)") };
const SEL = {
  launched: sel("getLaunchedToken(address)"), splitterOf: sel("splitterOf(address)"), memeHook: sel("memeHook()"), poolManager: sel("poolManager()"),
  reserves: sel("getReserves()"), real: sel("realQuoteReserve()"), extsload: sel("extsload(bytes32)"),
  name: "0x06fdde03", symbol: "0x95d89b41", totalSupply: "0x18160ddd", logo: sel("logo()"), description: sel("description()"), socials: sel("socials()"),
};
// GraduationPhase { NotGraduated, Swept, PoolCreated, Rescued }
const PHASE = ["curve", "swept", "pool", "rescued"];

let ch = null;
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: 4663 }));
const ethCalls = (c, o) => chain().ethCalls(c, o);
const rpcCall = (m, p) => chain().rpcCall(m, p);
const getLogs = (f) => chain().getLogs(f, 2);

// ---- ABI pieces
const utf8 = (hx) => new TextDecoder().decode(Uint8Array.from(hx.match(/../g) || [], (b) => parseInt(b, 16)));
/// a function returning one string
function str1(hex) {
  if (!hex) return "";
  try { const h = strip(hex), off = Number(BigInt("0x" + h.slice(0, 64))) * 2, len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2; return utf8(h.slice(off + 64, off + 64 + len)); }
  catch { return ""; }
}
/// socials() → (twitter, telegram, discord, website, farcaster): five separate string returns (PonsV2LauncherToken),
/// so five head words, each an offset from the start of the return data
export function decodeSocials(hex) {
  try {
    const h = strip(hex);
    const one = (i) => { const off = Number(W(h, i)) * 2, len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2;
      return utf8(h.slice(off + 64, off + 64 + len)); };
    return { twitter: one(0), telegram: one(1), discord: one(2), website: one(3), farcaster: one(4) };
  } catch { return { twitter: "", telegram: "", discord: "", website: "", farcaster: "" }; }
}
/// getLaunchedToken(token): fifteen static fields, inline
export function decodeLaunched(hex) {
  if (!hex || strip(hex).length < 15 * 64) return null;
  return {
    token: wAddr(hex, 0), curve: wAddr(hex, 1), deployer: wAddr(hex, 2), recipient: wAddr(hex, 3), pairToken: wAddr(hex, 4),
    graduationThreshold: W(hex, 5).toString(), poolFee: Number(W(hex, 6)), tickSpacing: int24(W(hex, 7)), creatorTaxBps: Number(W(hex, 8)),
    buyback: W(hex, 9) === 1n, phase: PHASE[Number(W(hex, 10))] || "curve", exists: W(hex, 14) === 1n,
  };
}
const ZERO = "0x0000000000000000000000000000000000000000";
/// the graduated pool's id: (currency0, currency1, fee, tickSpacing, memeHook); native ETH sorts first
export function poolIdOf(token, pairToken, fee, ts, hook) {
  const q = lc(pairToken || ZERO), t = lc(token);
  const t0 = BigInt(t) < BigInt(q);
  const [c0, c1] = t0 ? [t, q] : [q, t];
  return { id: keccakHex(pad(c0) + pad(c1) + pad(Number(fee).toString(16)) + pad(BigInt.asUintN(256, BigInt(ts)).toString(16)) + pad(hook)), tokenIs0: t0 };
}

// ---- the ETH price (Coinbase, else CoinGecko), cached a minute
const px = { usd: null, at: 0 };
async function ethUsd() {
  if (CFG.ethUsd) return CFG.ethUsd;
  if (px.usd && Date.now() - px.at < 60e3) return px.usd;
  const get = (u) => fetch(u, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const cb = await get("https://api.coinbase.com/v2/prices/ETH-USD/spot");
  let p = cb && cb.data ? Number(cb.data.amount) : null;
  if (!(p > 0)) { const cg = await get("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"); p = cg && cg.ethereum ? Number(cg.ethereum.usd) : null; }
  if (p > 0) { px.usd = p; px.at = Date.now(); }
  return px.usd;
}

// ---- storage (Firestore docs through the caller's store; memory otherwise)
const mem = { list: null, cursor: null, view: null, k: null };
async function readList(store) {
  if (store) { const d = await store.get(LIST_DOC).catch(() => null); return (d && Array.isArray(d.items) ? d.items : null) || mem.list || []; }
  return mem.list || [];
}
async function writeList(store, items) {
  mem.list = items;
  if (store) await store.set(LIST_DOC, { items, at: Date.now() }).catch(() => null);
}
/// the factory's meme hook and pool manager (fixed; read once)
async function consts() {
  if (mem.k) return mem.k;
  const [h, pm] = await ethCalls([{ to: CFG.factory, data: SEL.memeHook }, { to: CFG.factory, data: SEL.poolManager }]);
  if (!h || !pm) throw new Error("couldn't read the Pons factory");
  mem.k = { hook: wAddr(h, 0), pm: wAddr(pm, 0) };
  return mem.k;
}

/// is `token` a Pons V2 launch whose fee recipient is its creator's ArcPad splitter? → its record (or why not)
async function check(token) {
  const S = splitsAddr();
  if (!isAddr(S)) return { error: "ArcPad × Pons isn't set up yet (no splitter factory)" };
  const [lt] = await ethCalls([{ to: CFG.factory, data: SEL.launched + pad(token) }]);
  const L = decodeLaunched(lt);
  if (!L || !L.exists || L.token !== lc(token)) return { error: "not a Pons V2 launch" };
  const [sp] = await ethCalls([{ to: S, data: SEL.splitterOf + pad(L.deployer) }]);
  const splitter = sp ? wAddr(sp, 0) : null;
  if (!splitter) return { error: "couldn't read the splitter" };
  return { L, splitter, ok: L.recipient === splitter };
}
/// name, symbol, supply, logo, description, links — from the token itself
async function meta(token) {
  const r = await ethCalls([SEL.name, SEL.symbol, SEL.totalSupply, SEL.logo, SEL.description, SEL.socials].map((d) => ({ to: token, data: d })));
  const so = r[5] ? decodeSocials(r[5]) : {};
  return {
    name: str1(r[0]).slice(0, 64), symbol: str1(r[1]).slice(0, 16), supply: r[2] ? W(r[2], 0).toString() : "1000000000000000000000000000",
    image: str1(r[3]).slice(0, 512), description: str1(r[4]).slice(0, 400),
    twitter: String(so.twitter || "").slice(0, 200), telegram: String(so.telegram || "").slice(0, 200), website: String(so.website || "").slice(0, 200),
  };
}
async function blockTs(bn) {
  const b = await rpcCall("eth_getBlockByNumber", ["0x" + Number(bn).toString(16), false]).catch(() => null);
  return b ? parseInt(b.timestamp, 16) : null;
}
async function recordOf(token, L, splitter, tx, block) {
  const [m, ts] = await Promise.all([meta(token).catch(() => ({})), blockTs(block)]);
  return {
    token: lc(token), curve: L.curve, creator: L.deployer, splitter, pairToken: L.pairToken, tx: lc(tx), block,
    graduationThreshold: L.graduationThreshold, poolFee: L.poolFee, tickSpacing: L.tickSpacing, creatorTaxBps: L.creatorTaxBps,
    launchedAt: ts || Math.floor(Date.now() / 1000), name: "", symbol: "", supply: "1000000000000000000000000000", image: "", description: "", twitter: "", telegram: "", website: "", ...m,
  };
}

/// price, market cap and graduation progress, live; the fee recipient re-checked
async function withPrices(items) {
  if (!items.length) return [];
  const [k, eth] = await Promise.all([consts().catch(() => null), ethUsd()]);
  const S = splitsAddr();
  const calls = [];
  const pids = items.map((x) => {
    const p = k ? poolIdOf(x.token, x.pairToken, x.poolFee, x.tickSpacing, k.hook) : null;
    calls.push({ to: CFG.factory, data: SEL.launched + pad(x.token) }, { to: x.curve, data: SEL.reserves }, { to: x.curve, data: SEL.real },
      p && k ? { to: k.pm, data: SEL.extsload + strip(keccakHex(strip(p.id) + pad("6"))) } : { to: CFG.factory, data: SEL.memeHook },
      isAddr(S) ? { to: S, data: SEL.splitterOf + pad(x.creator) } : { to: CFG.factory, data: SEL.memeHook });
    return p;
  });
  const out = [];
  for (let i = 0; i < calls.length; i += 40) out.push(...(await ethCalls(calls.slice(i, i + 40), { timeoutMs: 8000 }).catch(() => calls.slice(i, i + 40).map(() => null))));
  return items.map((x, j) => {
    const [lt, rs, real, s0, sp] = out.slice(5 * j, 5 * j + 5);
    const L = decodeLaunched(lt);
    const splitter = sp && isAddr(S) ? wAddr(sp, 0) : x.splitter;
    const supply = Number(BigInt(x.supply || "0")) / 1e18 || 1e9;
    const phase = L ? L.phase : x.phase || "curve";
    let priceEth = null, progress = null;
    if (phase === "pool" && s0 && pids[j]) {
      const sq = BigInt(s0) & ((1n << 160n) - 1n), p = Number(sq) / 2 ** 96, raw = p * p;
      if (raw > 0) priceEth = pids[j].tokenIs0 ? raw : 1 / raw; // both sides 18 decimals (native ETH)
      progress = 100;
    } else if (rs) {
      const q = Number(W(rs, 0)) / 1e18, t = Number(W(rs, 1)) / 1e18;
      if (q > 0 && t > 0) priceEth = q / t;
      const thr = Number(BigInt(x.graduationThreshold || "0")) / 1e18;
      if (real && thr > 0) progress = Math.min(100, (Number(W(real, 0)) / 1e18 / thr) * 100);
    }
    const priceUsd = priceEth != null && eth ? priceEth * eth : null;
    return {
      ...x, phase, graduated: phase === "pool" || phase === "swept", progress: progress != null ? Math.round(progress * 10) / 10 : null,
      priceEth, priceUsd, mcapUsd: priceUsd != null ? priceUsd * supply : null, ethUsd: eth || null,
      active: L ? L.recipient === splitter : true, recipientChecked: !!L,
    };
  });
}

/// new TokenLaunched logs since the cursor → any whose recipient is the creator's splitter is listed
async function scan(store, items, budgetMs) {
  const S = splitsAddr();
  if (!isAddr(S)) return 0;
  const t0 = Date.now();
  let cur = mem.cursor;
  if (store) { const d = await store.get(CURSOR_DOC).catch(() => null); if (d && d.block) cur = Math.max(cur || 0, d.block); }
  const head = parseInt(await rpcCall("eth_blockNumber", []), 16);
  let from = cur ? cur + 1 : CFG.fromBlock || Math.max(0, head - 50000);
  let found = 0;
  while (from <= head && Date.now() - t0 < budgetMs) {
    const to = Math.min(head, from + 9000);
    const logs = await getLogs({ address: CFG.factory, topics: [TOPIC.launched], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }).catch(() => null);
    if (!logs) break;
    const fresh = logs.filter((l) => !items.some((x) => x.token === topicAddr(l.topics[1])));
    if (fresh.length) {
      // the launched records and each deployer's splitter, in one batch
      const r = await ethCalls(fresh.flatMap((l) => [{ to: CFG.factory, data: SEL.launched + pad(topicAddr(l.topics[1])) }, { to: S, data: SEL.splitterOf + pad(topicAddr(l.topics[3])) }])).catch(() => null);
      if (!r) break;
      for (let i = 0; i < fresh.length; i++) {
        const L = decodeLaunched(r[2 * i]), sp = r[2 * i + 1] ? wAddr(r[2 * i + 1], 0) : null;
        if (!L || !sp || L.recipient !== sp) continue;
        const l = fresh[i];
        const item = await recordOf(L.token, L, sp, l.transactionHash, parseInt(l.blockNumber, 16));
        await maybeAnnounce(item);
        items.push(item);
        found++;
      }
    }
    mem.cursor = to;
    from = to + 1;
  }
  if (store && mem.cursor) await store.set(CURSOR_DOC, { block: mem.cursor, at: Date.now() }).catch(() => null);
  if (found) await writeList(store, items);
  return found;
}

async function maybeAnnounce(item, { force = false } = {}) {
  if (item.tg && !force) return "already";
  const age = Date.now() / 1000 - (item.launchedAt || 0);
  if (!force && !(age >= -60 && age <= ANNOUNCE_WINDOW)) return "too old";
  const [live] = await withPrices([item]).catch(() => [item]);
  const r = await announcePons(live).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
  if (r && r.ok) item.tg = Math.floor(Date.now() / 1000);
  return r && r.ok ? "sent" : (r && r.error) || "not sent";
}

/// GET ?ponsarc=list
export async function list({ store = null, budgetMs = 4000 } = {}) {
  if (mem.view && Date.now() - mem.view.at < 60e3) return mem.view;
  const items = await readList(store);
  await scan(store, items, budgetMs).catch(() => 0);
  const view = await withPrices(items);
  mem.view = { items: view, splits: splitsAddr() || null, at: Date.now() };
  return mem.view;
}
/// one listed coin, live
export async function coin(token, { store } = {}) {
  token = lc(token);
  if (!isAddr(token)) return null;
  const x = (await readList(store)).find((i) => i.token === token);
  return x ? (await withPrices([x]))[0] : null;
}
/// POST {action:"ponsreg", token, tx} → list a Pons V2 launch whose fee recipient is the creator's ArcPad splitter
export async function register({ token, tx }, { store } = {}) {
  token = lc(token); tx = lc(tx);
  if (!isAddr(token) || !/^0x[0-9a-f]{64}$/.test(tx)) return { status: 400, body: { error: "token and tx are needed" } };
  const rc = await rpcCall("eth_getTransactionReceipt", [tx]).catch(() => null);
  if (!rc || rc.status !== "0x1") return { status: 404, body: { error: "that transaction isn't confirmed on Robinhood Chain" } };
  const L0 = (rc.logs || []).find((l) => lc(l.address) === CFG.factory && l.topics[0] === TOPIC.launched && topicAddr(l.topics[1]) === token);
  if (!L0) return { status: 404, body: { error: "that transaction isn't a Pons V2 launch of this token" } };
  const c = await check(token);
  if (c.error) return { status: 409, body: { error: c.error } };
  if (!c.ok) return { status: 409, body: { error: "this coin's fee recipient isn't its creator's ArcPad splitter", recipient: c.L.recipient, splitter: c.splitter } };
  const items = await readList(store);
  let item = items.find((x) => x.token === token);
  if (!item) { item = await recordOf(token, c.L, c.splitter, tx, parseInt(rc.blockNumber, 16)); items.push(item); }
  const tg = await maybeAnnounce(item);
  await writeList(store, items);
  mem.view = null;
  return { status: 200, body: { ok: true, token, splitter: c.splitter, tg } };
}

export const _test = { decodeLaunched, decodeSocials, poolIdOf, check, mem };
