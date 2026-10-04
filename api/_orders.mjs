// api/_orders.mjs — ARCIRCLE Orders (arcpad.html#orders, arc-orders.js; contract ArcircleOrders.sol): the order book,
// the signed orders it holds, and the executor that fills them.
//
// An order is the maker's EIP-712 signature over "sell X of A for at least Y of B, after the 0.1% fee". Tokens stay in
// the maker's wallet; ArcircleOrders can only carry out a signed order at its price or better. Signatures are kept
// here and never published (the book shows price levels, not orders).
//
//   place(body)     a new order: the signature, the pair, the pool, the maker's balance and approval are checked
//   cancel(body)    off-chain cancel (a signed message); an on-chain cancel is picked up from the contract
//   book(token)     price levels (asks / bids), recent fills, the order count — no signatures
//   mine(wallet)    a wallet's orders across every market
//   tick(store)     the executor (ORDERS_KEEPER_KEY): matches crossing orders wallet to wallet (matchOrders), then fills
//                   what the pool can fill at each maker's price (fillPool): stop orders once their trigger is crossed,
//                   trailing stops once the price falls back from its peak, timed (TWAP/DCA) orders as they're released,
//                   one-cancels-other legs until one of them fills. Failed fills back off. It also records market
//                   orders (swapMarket) from the chain, keeps a status for the page, an event feed for Telegram, and
//                   spends the fee burn's USDC on $ARCIRCLE once an hour (ArcircleFeeBurn).
//                   Runs after every ARCIA DESK tick on Arc (api/desk.mjs) and on its own (?orderstick=1).
//   candles(pool)   5-minute candles for any Arc v4 pool from its Swap logs (the page's own chart)
//   v3 (4 Oct 2026):
//   recent()        the latest fills across every market (the page's live tape)
//   burns()         every Burned event of the fee burn since it was deployed: $ARCIRCLE burned, quote spent, count
//   alerts / alertSet / alertsDue   price alerts a wallet keeps here (opened with its 30-day view signature); the
//                   Telegram bot (api/arcia-tg.mjs) checks them for wallets with /orderalerts on and sends a DM
//   ethUsd()        Robinhood Chain: the ETH price, for the page's dollar values
// Two chains, one module (makeOrders): ARC (ArcircleOrders, markets against USDC — the named exports, as before) and
// RH, Robinhood Chain (ArcircleOrdersNative, markets against ETH: orders name WETH, pools may be native ETH). forChain().
// Docs (Firestore through the caller's store; memory otherwise), under orders/ on Arc and ordersrh/ on Robinhood Chain:
// <p>/<token> (the market), <p>/_index (markets), <p>/m_<maker> (a maker's markets), <p>/_status (the executor),
// <p>/_events (fills for Telegram), <p>/_scan (the market-order log cursor), <p>/c_<poolId> (candles).
import { evmChain, addressOfKey } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { poolSlot, decodeSlot0, poolIdOf, priceOf } from "./_liq-core.mjs";

const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const ZERO_ADDR = "0x" + "0".repeat(40);
/// Arc: ArcircleOrders + ArcircleFeeBurn, markets against USDC
const ARC_CFG = {
  id: "arc", name: "Arc", prefix: "orders", msgTag: "",
  address: "0x1a31c2539d6e3fbdf276e8d74ba67aec4de9008e", // ArcircleOrders on Arc, block 23739979 (env ARCIRCLE_ORDERS_ADDRESS overrides)
  feeBurn: "0x7f53f5014bc2cfe52ed8fb9370f2bcd497b93034", // ArcircleFeeBurn on Arc, block 23739974 (env ARCIRCLE_FEEBURN_ADDRESS overrides)
  feeBurnFrom: 23739974, logRange: 9000, // Arc's RPC refuses wider eth_getLogs
  addressEnv: "ARCIRCLE_ORDERS_ADDRESS", feeBurnEnv: "ARCIRCLE_FEEBURN_ADDRESS",
  base: "0x3600000000000000000000000000000000000000", baseDec: 6, baseSym: "USDC", // what markets trade against and fees burn from
  weth: null, // native currency 0x0 in a pool key stands for this (none on Arc)
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3", // Uniswap's Permit2: makers can allow ArcircleOrders with a signature
  chainId: 5042,
  rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  pm: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  keeperKey: () => env("ORDERS_KEEPER_KEY") || null,
  burnMin: 5_000_000n, // 5 USDC before the hourly burn bothers
  lowGas: 10n ** 18n, gasSym: "USDC", // under 1 USDC of gas: the executor is low
  maxTx: 6, // transactions per tick
  now: () => Math.floor(Date.now() / 1000),
};
/// Robinhood Chain: ArcircleOrdersNative + ArcircleFeeBurnNative, markets against ETH (orders name WETH; pools may be
/// native ETH). Live since 4 Oct 2026 (env ARCIRCLE_ORDERS_RH_ADDRESS / ARCIRCLE_FEEBURN_RH_ADDRESS override).
const RH_CFG = {
  id: "rh", name: "Robinhood Chain", prefix: "ordersrh", msgTag: " on Robinhood Chain",
  address: "0xa53dbd06d8c604107e1fe1b5936efcf32d895ee3", feeBurn: "0x88be9a0e1b13f5a10bf155e052cb0327fd6c88d1", // contracts/scripts/deploy-arcircle-orders-rh.js
  addressEnv: "ARCIRCLE_ORDERS_RH_ADDRESS", feeBurnEnv: "ARCIRCLE_FEEBURN_RH_ADDRESS",
  feeBurnFrom: 79560003, logRange: 50000, // ArcircleFeeBurnNative's deploy block (env ARCIRCLE_FEEBURN_RH_FROM)
  base: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", baseDec: 18, baseSym: "ETH",
  weth: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3", // Uniswap's Permit2, confirmed at deploy (env ARCIRCLE_ORDERS_RH_PERMIT2)
  permit2Env: "ARCIRCLE_ORDERS_RH_PERMIT2",
  chainId: 4663,
  rpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  pm: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  keeperKey: () => env("ORDERS_KEEPER_RH_KEY") || env("ORDERS_KEEPER_KEY") || null,
  dexChain: "robinhood", explorerApi: "https://robinhoodchain.blockscout.com/api", // where pools() looks a token's pools up
  burnMin: 2n * 10n ** 15n, // 0.002 ETH
  lowGas: 5n * 10n ** 14n, gasSym: "ETH", // under 0.0005 ETH
  maxTx: 6,
  now: () => Math.floor(Date.now() / 1000),
};
export const FEE_BPS = 10n;
const MAX_OPEN_PER_MAKER = 30, MAX_OPEN_PER_MARKET = 500, KEEP_FILLS = 200, KEEP_DONE = 300;

/// one chain's ARCIRCLE Orders: its contracts, its executor and its own docs (`<prefix>/…`)
function makeOrders(CFG) {
let ch = null;
function configure(o) { Object.assign(CFG, o); ch = null; mem.clear(); }
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: CFG.chainId }));
const ordersAddr = () => lc(env(CFG.addressEnv) || CFG.address);
const feeBurnAddr = () => lc(env(CFG.feeBurnEnv) || CFG.feeBurn);
const P2 = () => lc((CFG.permit2Env && env(CFG.permit2Env)) || CFG.permit2 || ZERO_ADDR);
const hasP2 = () => P2() !== ZERO_ADDR;
/// a pool currency as orders name it: native ETH (0x0) is WETH
const cur = (a) => (lc(a) === ZERO_ADDR && CFG.weth ? CFG.weth : lc(a));
const P = CFG.prefix;

// ---------------------------------------------------------------- bits
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const isH32 = (h) => /^0x[0-9a-fA-F]{64}$/.test(String(h || ""));
const strip = (h) => String(h).replace(/^0x/, "");
const hexToBytes = (h) => { h = strip(h); if (h.length % 2) h = "0" + h; return Uint8Array.from(h.match(/../g) || [], (b) => parseInt(b, 16)); };
const bytesToHex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const keccak = (hex) => bytesToHex(keccak_256(hexToBytes(hex)));
const keccakText = (s) => bytesToHex(keccak_256(new TextEncoder().encode(s)));
const w = (v) => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, "0");
const W = (h, i) => BigInt("0x" + (strip(h).slice(i * 64, i * 64 + 64) || "0"));
const sel = (s) => keccakText(s).slice(0, 10);
const ceilDiv = (a, b) => (a + b - 1n) / b;
const big = (v) => { try { return BigInt(v); } catch { return null; } };

// ---------------------------------------------------------------- EIP-712
const ORDER_T = "Order(address maker,address sell,address buy,uint256 sellAmount,uint256 buyAmount,uint160 triggerSqrtP,bool triggerBelow,bytes32 poolId,uint64 expiry,uint64 start,uint32 duration,uint256 group,uint32 epoch,uint256 salt)";
const ORDER_TYPEHASH = keccakText(ORDER_T);
const DOMAIN_TYPEHASH = keccakText("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
function domainSeparator(address = ordersAddr(), chainId = CFG.chainId) {
  return keccak("0x" + strip(DOMAIN_TYPEHASH) + strip(keccakText("ARCIRCLE Orders")) + strip(keccakText("1")) + w(chainId) + w(address));
}
const FIELDS = ["maker", "sell", "buy", "sellAmount", "buyAmount", "triggerSqrtP", "triggerBelow", "poolId", "expiry", "start", "duration", "group", "epoch", "salt"];
const encOrder = (o) => FIELDS.map((f) => (f === "triggerBelow" ? w(o[f] ? 1 : 0) : w(o[f]))).join("");
function orderHash(o, address = ordersAddr(), chainId = CFG.chainId) {
  const sh = keccak("0x" + strip(ORDER_TYPEHASH) + encOrder(o));
  return keccak("0x1901" + strip(domainSeparator(address, chainId)) + strip(sh));
}
/// a 65-byte r‖s‖v signature over a 32-byte digest → the signer's address (null if it doesn't parse)
function recover(digest, sig) {
  try {
    const b = hexToBytes(sig);
    if (b.length !== 65) return null;
    let v = b[64]; if (v >= 27) v -= 27;
    if (v !== 0 && v !== 1) return null;
    const rec = new Uint8Array(65); rec[0] = v; rec.set(b.subarray(0, 64), 1);
    const pk = secp256k1.recoverPublicKey(rec, hexToBytes(digest), { prehash: false });
    const full = secp256k1.Point.fromBytes(pk).toBytes(false);
    return bytesToHex(keccak_256(full.subarray(1)).subarray(12));
  } catch { return null; }
}
const personalDigest = (msg) => { const m = new TextEncoder().encode(msg); return bytesToHex(keccak_256(new Uint8Array([...new TextEncoder().encode(`\x19Ethereum Signed Message:\n${m.length}`), ...m]))); };
const cancelMessage = (h) => `Cancel ARCIRCLE order ${lc(h)}`;
/// one signature shows a wallet its own orders for up to 30 days (orders aren't public until they fill)
const viewMessage = (wallet, until) => `ARCIRCLE Orders: show my orders\n${lc(wallet)}\nuntil ${Number(until)}`;
const cancelMarketMessage = (token, maker, at) => `Cancel all my ARCIRCLE orders in ${lc(token)}${CFG.msgTag}\n${lc(maker)}\n${Number(at)}`;
function viewOk(wallet, until, sig) {
  const now = CFG.now(), u = Number(until);
  if (!isAddr(wallet) || !(u > now) || u > now + 31 * 86400 || !/^0x[0-9a-fA-F]{130}$/.test(String(sig || ""))) return false;
  return lc(recover(personalDigest(viewMessage(wallet, u)), sig)) === lc(wallet);
}

/// normalise an order from JSON: every number a decimal string, addresses lower-case
function normOrder(o) {
  if (!o || typeof o !== "object") return null;
  const out = {};
  for (const f of ["maker", "sell", "buy"]) { if (!isAddr(o[f])) return null; out[f] = lc(o[f]); }
  for (const f of ["sellAmount", "buyAmount", "triggerSqrtP", "expiry", "start", "duration", "group", "epoch", "salt"]) { const v = big(o[f] == null ? 0 : o[f]); if (v == null || v < 0n) return null; out[f] = v.toString(); }
  out.triggerBelow = o.triggerBelow === true || o.triggerBelow === "true";
  out.poolId = isH32(o.poolId) ? lc(o.poolId) : "0x" + "0".repeat(64);
  if (BigInt(out.triggerSqrtP) >= 1n << 160n || BigInt(out.expiry) >= 1n << 64n || BigInt(out.start) >= 1n << 64n || BigInt(out.duration) >= 1n << 32n || BigInt(out.group) >= 1n << 256n || BigInt(out.epoch) >= 1n << 32n || BigInt(out.sellAmount) >= 1n << 255n || BigInt(out.buyAmount) >= 1n << 255n) return null;
  return out;
}
const normKey = (k) => (k && isAddr(k.currency0) && isAddr(k.currency1) && isAddr(k.hooks) && Number.isInteger(Number(k.fee)) && Number.isInteger(Number(k.tickSpacing))
  ? { currency0: lc(k.currency0), currency1: lc(k.currency1), fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: lc(k.hooks) } : null);

// ---------------------------------------------------------------- ABI
const ORDER_TUPLE = "(address,address,address,uint256,uint256,uint160,bool,bytes32,uint64,uint64,uint32,uint256,uint32,uint256)";
const KEY_TUPLE = "(address,address,uint24,int24,address)";
const SEL = {
  fillPool: sel(`fillPool(${ORDER_TUPLE},bytes,uint256,${KEY_TUPLE})`),
  matchOrders: sel(`matchOrders(${ORDER_TUPLE},bytes,${ORDER_TUPLE},bytes,uint256,uint256)`),
  quote: sel(`quote(${KEY_TUPLE},address,uint256)`),
  filled: sel("filled(bytes32)"), cancelled: sel("cancelled(bytes32)"), epochOf: sel("epochOf(address)"), groupTakenBy: sel("groupTakenBy(address,uint256)"),
  feeOf: sel("feeOf(address,uint256)"), p2allowance: sel("allowance(address,address,address)"),
  p2permit: sel("permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)"),
  burn: sel("burn(uint256)"), flush: sel("flush(address)"), fbQuote: sel("quote(uint256)"), burnBps: sel("burnBps()"),
  balanceOf: sel("balanceOf(address)"), allowance: sel("allowance(address,address)"),
  decimals: sel("decimals()"), symbol: sel("symbol()"), extsload: sel("extsload(bytes32)"),
};
const QUOTE_RESULT = sel("QuoteResult(uint256)");
const TOPIC_FILLED = keccakText("Filled(bytes32,address,address,address,uint256,uint256,uint256,uint8)");
const TOPIC_SWAP = keccakText("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const encKey = (k) => w(k.currency0) + w(k.currency1) + w(k.fee) + w(BigInt.asUintN(256, BigInt(k.tickSpacing))) + w(k.hooks);
const encBytes = (sig) => { const b = strip(sig); const n = b.length / 2; return w(n) + b.padEnd(Math.ceil(b.length / 64) * 64, "0"); };
function encFillPool(o, sig, amount, key) {
  return SEL.fillPool + encOrder(o) + w((FIELDS.length + 7) * 32) + w(amount) + encKey(key) + encBytes(sig);
}
function encMatch(a, sa, b, sb, aAmt, bAmt) {
  const tailA = encBytes(sa), offA = (FIELDS.length * 2 + 4) * 32, offB = offA + tailA.length / 2;
  return SEL.matchOrders + encOrder(a) + w(offA) + encOrder(b) + w(offB) + w(aAmt) + w(bAmt) + tailA + encBytes(sb);
}
/// Permit2's permit(owner, PermitSingle, sig) — the executor sends a maker's signed allowance before their first fill
const encPermit = (owner, p) => SEL.p2permit + w(owner) + w(p.details.token) + w(p.details.amount) + w(p.details.expiration) + w(p.details.nonce) + w(p.spender) + w(p.sigDeadline) + w(8 * 32) + encBytes(p.sig);
function normPermit(p) {
  if (!p || typeof p !== "object" || !p.details || !/^0x[0-9a-fA-F]{130}$/.test(String(p.sig || ""))) return null;
  const d = p.details, n = (v, bits) => { const x = big(v); return x != null && x >= 0n && x < 1n << BigInt(bits) ? x.toString() : null; };
  const out = { details: { token: lc(d.token), amount: n(d.amount, 160), expiration: n(d.expiration, 48), nonce: n(d.nonce, 48) }, spender: lc(p.spender), sigDeadline: n(p.sigDeadline, 256), sig: String(p.sig) };
  if (!isAddr(out.details.token) || !isAddr(out.spender) || [out.details.amount, out.details.expiration, out.details.nonce, out.sigDeadline].some((v) => v == null)) return null;
  return out;
}
const str1 = (hex) => { try { const h = strip(hex), off = Number(BigInt("0x" + h.slice(0, 64))) * 2, len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2; return new TextDecoder().decode(hexToBytes(h.slice(off + 64, off + 64 + len))); } catch { return ""; } };

// ---------------------------------------------------------------- chain reads
const calls = (cs, o) => chain().ethCalls(cs, o);
async function tokenMeta(addrs) {
  const r = await calls(addrs.flatMap((a) => [{ to: a, data: SEL.decimals }, { to: a, data: SEL.symbol }]));
  // WETH shows as ETH: on Robinhood Chain it's the ETH side of every market (native ETH pools included)
  return addrs.map((a, i) => ({ address: lc(a), decimals: r[2 * i] ? Number(W(r[2 * i], 0)) : 18, symbol: CFG.weth && lc(a) === CFG.weth ? "ETH" : (str1(r[2 * i + 1]) || "TOKEN").replace(/[^\w$.-]/g, "").slice(0, 16) }));
}
async function slot0Of(poolId) {
  const [s] = await calls([{ to: CFG.pm, data: SEL.extsload + strip(poolSlot(poolId, keccak)) }]);
  return s ? decodeSlot0(s) : null;
}
/// what `amount` of `sell` brings from pool `key` before the fee (the contract's quote(), which always reverts)
async function quoteOut(key, sell, amount) {
  const [r] = await chain().callsRaw([{ to: ordersAddr(), data: SEL.quote + encKey(key) + w(sell) + w(amount) }]);
  const d = r && r.data ? String(r.data) : "";
  if (d.startsWith(QUOTE_RESULT)) return W(d.slice(10), 0);
  return null;
}
const netOf = (out) => out - (out * FEE_BPS) / 10000n;
const owed = (o, amount) => ceilDiv(amount * BigInt(o.buyAmount), BigInt(o.sellAmount));

// ---------------------------------------------------------------- storage
const mem = new Map();
async function sget(store, k) {
  if (store) { const d = await store.get(k).catch(() => null); if (d) { mem.set(k, d); return d; } }
  return mem.get(k) || null;
}
async function sset(store, k, d) { mem.set(k, d); if (store) await store.set(k, d).catch(() => null); }
const marketKey = (t) => `${P}/${lc(t)}`;
const makerKey = (m) => `${P}/m_${lc(m)}`;
const INDEX = `${P}/_index`;
/// write a market back, merging with what's there now (a placement and the executor may overlap)
async function saveMarket(store, m) {
  const tk = typeof m.token === "string" ? m.token : m.token.address;
  const cur = await sget(store, marketKey(tk));
  if (cur && cur.orders) {
    const mine = new Map(m.orders.map((o) => [o.h, o]));
    const merged = cur.orders.map((o) => {
      const x = mine.get(o.h);
      if (!x) return o;
      mine.delete(o.h);
      // the further-along state wins
      const rank = (s) => ({ open: 0, unfunded: 0, expired: 1, filled: 2, cancelled: 2 }[s] || 0);
      const f = BigInt(x.filled || 0) > BigInt(o.filled || 0) ? x.filled : o.filled;
      return { ...o, ...x, filled: f, status: rank(x.status) >= rank(o.status) ? x.status : o.status, cancelledOff: o.cancelledOff || x.cancelledOff };
    });
    for (const x of mine.values()) merged.push(x);
    const seen = new Set();
    const fills = [...(m.fills || []), ...(cur.fills || [])].filter((f) => { const k = f.tx + ":" + f.h; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.at - a.at).slice(0, KEEP_FILLS);
    m = { ...cur, ...m, orders: merged, fills };
  }
  // keep the doc small: open orders all, finished ones the latest few hundred
  const open = m.orders.filter((o) => o.status === "open" || o.status === "unfunded");
  const done = m.orders.filter((o) => !(o.status === "open" || o.status === "unfunded")).sort((a, b) => (b.last || b.at) - (a.last || a.at)).slice(0, KEEP_DONE);
  m.orders = [...open, ...done];
  m.at = CFG.now();
  await sset(store, marketKey(tk), m);
  return m;
}
async function addTo(store, key, field, value) {
  const d = (await sget(store, key)) || {};
  const l = Array.isArray(d[field]) ? d[field] : [];
  if (!l.includes(value)) { l.unshift(value); await sset(store, key, { ...d, [field]: l.slice(0, 500), at: CFG.now() }); }
}

// ---------------------------------------------------------------- prices (gross: before the fee, quote per token)
const human = (raw, dec) => Number(raw) / 10 ** dec;
/// a sell order (token → quote): the price per token it asks for, before the fee
const askPrice = (o, m) => human(BigInt(o.buyAmount), m.quote.decimals) / (1 - 0.001) / human(BigInt(o.sellAmount), m.token.decimals);
/// a buy order (quote → token): the price per token it pays, before the fee
const bidPrice = (o, m) => human(BigInt(o.sellAmount), m.quote.decimals) / (human(BigInt(o.buyAmount), m.token.decimals) / (1 - 0.001));
const remOf = (x) => BigInt(x.o.sellAmount) - BigInt(x.filled || 0);
/// what a timed order has released by now (all of it for other orders) — the contract's released()
function releasedOf(o, now = CFG.now()) {
  const sell = BigInt(o.sellAmount), d = BigInt(o.duration || 0), st = BigInt(o.start || 0), t = BigInt(now);
  if (d === 0n) return sell;
  if (t <= st) return 0n;
  return t - st >= d ? sell : (sell * (t - st)) / d;
}

// ---------------------------------------------------------------- place / cancel
async function place(body, { store } = {}) {
  const S = ordersAddr();
  if (!isAddr(S)) return { status: 503, body: { error: "ARCIRCLE Orders isn't live yet" } };
  const o = normOrder(body && body.order), key = normKey(body && body.key), sig = String((body && body.sig) || "");
  if (!o || !key || !/^0x[0-9a-fA-F]{130}$/.test(sig)) return { status: 400, body: { error: "order, sig and key are needed" } };
  const token = lc(body.token);
  if (!isAddr(token)) return { status: 400, body: { error: "token is needed" } };
  const pair = [cur(key.currency0), cur(key.currency1)];
  if (!pair.includes(token) || !pair.includes(o.sell) || !pair.includes(o.buy) || o.sell === o.buy) return { status: 400, body: { error: "the order isn't for this pool's pair" } };
  const quote = pair.find((c) => c !== token);
  if (BigInt(o.sellAmount) === 0n || BigInt(o.buyAmount) === 0n) return { status: 400, body: { error: "amounts must be above zero" } };
  const now = CFG.now();
  if (o.expiry !== "0" && (Number(o.expiry) <= now + 30 || Number(o.expiry) > now + 400 * 86400)) return { status: 400, body: { error: "expiry must be between a minute and a year from now" } };
  const poolId = lc(poolIdOf(key, keccak));
  const stop = o.triggerSqrtP !== "0";
  if (stop && o.poolId !== poolId) return { status: 400, body: { error: "a stop order names its pool" } };
  if (!stop && o.poolId !== "0x" + "0".repeat(64) && o.poolId !== poolId) return { status: 400, body: { error: "the order names another pool" } };
  const side0 = o.sell === token ? "sell" : "buy";
  const twap = o.duration !== "0", trail = body.trail != null && body.trail !== "";
  let parts = 0, trailPct = 0;
  if (twap) {
    if (stop || trail) return { status: 400, body: { error: "a timed order can't also be a stop" } };
    parts = Math.round(Number(body.parts));
    if (!(parts >= 2 && parts <= 200)) return { status: 400, body: { error: "a timed order is split into 2 to 200 parts" } };
    if (Number(o.duration) < 300 || Number(o.duration) > 90 * 86400) return { status: 400, body: { error: "a timed order runs for 5 minutes to 90 days" } };
    if (Number(o.start) < now - 600 || Number(o.start) > now + 30 * 86400) return { status: 400, body: { error: "a timed order starts within 30 days" } };
    if (o.expiry !== "0" && Number(o.expiry) < Number(o.start) + Number(o.duration)) return { status: 400, body: { error: "the order expires before it's fully released" } };
  }
  if (trail) {
    trailPct = Number(body.trail);
    if (stop) return { status: 400, body: { error: "a trailing stop has no fixed trigger" } };
    if (!(trailPct >= 0.5 && trailPct <= 50)) return { status: 400, body: { error: "a trailing stop trails by 0.5% to 50%" } };
    if (o.poolId !== poolId) return { status: 400, body: { error: "a trailing stop names its pool" } };
    if (side0 !== "sell") return { status: 400, body: { error: "trailing stops sell" } };
  }
  const h = lc(orderHash(o));
  if (lc(recover(h, sig)) !== o.maker) return { status: 401, body: { error: "the signature isn't the maker's" } };
  const P2a = P2();
  const [ep, bal, alw, fl, cx, toP2, p2a] = await calls([
    { to: S, data: SEL.epochOf + w(o.maker) }, { to: o.sell, data: SEL.balanceOf + w(o.maker) }, { to: o.sell, data: SEL.allowance + w(o.maker) + w(S) },
    { to: S, data: SEL.filled + strip(h) }, { to: S, data: SEL.cancelled + strip(h) },
    { to: o.sell, data: SEL.allowance + w(o.maker) + w(P2a) }, { to: P2a, data: SEL.p2allowance + w(o.maker) + w(o.sell) + w(S) },
  ]).catch(() => [null, null, null, null, null, null, null]);
  if (ep == null) return { status: 502, body: { error: `couldn't read ${CFG.name} right now` } };
  if (W(ep, 0).toString() !== o.epoch) return { status: 409, body: { error: "this order was signed before your last cancel-all" } };
  if (cx && W(cx, 0) === 1n) return { status: 409, body: { error: "this order is cancelled" } };
  if (fl && W(fl, 0) >= BigInt(o.sellAmount)) return { status: 409, body: { error: "this order is already filled" } };
  if (!bal || W(bal, 0) < BigInt(o.sellAmount)) return { status: 409, body: { error: "not enough balance for this order" } };
  const need = BigInt(o.sellAmount), viaP2 = hasP2() && toP2 && W(toP2, 0) >= need;
  const p2ok = viaP2 && p2a && W(p2a, 0) >= need && Number(W(p2a, 1)) > now + 60;
  let permit = null;
  if (!(alw && W(alw, 0) >= need) && !p2ok) {
    permit = normPermit(body.permit);
    const pOk = permit && viaP2 && permit.spender === S && permit.details.token === o.sell && BigInt(permit.details.amount) >= need && Number(permit.details.expiration) > now + 60 && Number(permit.sigDeadline) > now + 60;
    const [dry] = pOk ? await chain().callsRaw([{ to: P2a, data: encPermit(o.maker, permit) }]) : [null];
    if (!pOk || !dry || !dry.ok) return { status: 409, body: { error: "approve ARCIRCLE Orders for this amount first" } };
  }
  const s0 = await slot0Of(poolId).catch(() => null);
  if (!s0 || s0.sqrtP === 0n) return { status: 409, body: { error: `that pool doesn't exist on ${CFG.name}` } };
  let m = await sget(store, marketKey(token));
  if (!m) {
    const [tm, qm] = await tokenMeta([token, quote]);
    m = { token: tm, quote: qm, key, poolId, tokenIs0: key.currency0 === token, orders: [], fills: [] };
  }
  if (m.quote.address !== quote) return { status: 409, body: { error: `this market trades against ${m.quote.symbol}` } };
  if (!m.key) Object.assign(m, { key, poolId, tokenIs0: key.currency0 === token }); // a market that so far only had market orders
  if (m.orders.some((x) => x.h === h)) return { status: 200, body: { ok: true, hash: h, already: true } };
  const open = m.orders.filter((x) => x.status === "open" || x.status === "unfunded");
  if (open.length >= MAX_OPEN_PER_MARKET) return { status: 429, body: { error: "this market's book is full right now" } };
  if (open.filter((x) => x.o.maker === o.maker).length >= MAX_OPEN_PER_MAKER) return { status: 429, body: { error: `at most ${MAX_OPEN_PER_MAKER} open orders per wallet in one market` } };
  const side = side0;
  const rec = { h, o, sig, key, poolId, side, type: stop ? "stop" : twap ? "twap" : trail ? "trail" : "limit", status: "open", filled: fl ? W(fl, 0).toString() : "0", at: now, last: now };
  rec.price = side === "sell" ? askPrice(o, m) : bidPrice(o, m);
  if (stop && Number(body.triggerPrice) > 0) rec.triggerPrice = Number(body.triggerPrice); // for display only
  if (twap) rec.parts = parts;
  if (trail) { const sp = priceOf(s0.sqrtP, key.currency0 === token, key.currency0 === token ? m.token.decimals : m.quote.decimals, key.currency0 === token ? m.quote.decimals : m.token.decimals); rec.trail = { pct: trailPct, peak: sp, armed: false }; }
  if (o.group !== "0") { rec.group = o.group; rec.leg = ["tp", "sl"].includes(body.leg) ? body.leg : null; }
  if (permit) rec.permit = permit; // sent by the executor before the first fill
  m.orders.push(rec);
  m = await saveMarket(store, m);
  await addTo(store, INDEX, "tokens", token);
  await addTo(store, makerKey(o.maker), "tokens", token);
  mem.delete("book:" + token);
  return { status: 200, body: { ok: true, hash: h, side, type: rec.type, price: rec.price } };
}
async function cancel(body, { store } = {}) {
  const token = lc(body && body.token), h = lc(body && body.hash), sig = String((body && body.sig) || "");
  if (!isAddr(token) || !isH32(h) || !/^0x[0-9a-fA-F]{130}$/.test(sig)) return { status: 400, body: { error: "token, hash and sig are needed" } };
  const m = await sget(store, marketKey(token));
  const x = m && m.orders.find((o) => o.h === h);
  if (!x) return { status: 404, body: { error: "no such order" } };
  if (lc(recover(personalDigest(cancelMessage(h)), sig)) !== x.o.maker) return { status: 401, body: { error: "only the maker can cancel it" } };
  x.status = "cancelled"; x.cancelledOff = true; x.last = CFG.now();
  await saveMarket(store, { ...m, orders: [x], fills: [] });
  mem.delete("book:" + token);
  return { status: 200, body: { ok: true, hash: h } };
}
/// every open order of one maker in one market, with one signed message
async function cancelMarket(body, { store } = {}) {
  const token = lc(body && body.token), maker = lc(body && body.maker), at = Number(body && body.at), sig = String((body && body.sig) || "");
  if (!isAddr(token) || !isAddr(maker) || !/^0x[0-9a-fA-F]{130}$/.test(sig)) return { status: 400, body: { error: "token, maker, at and sig are needed" } };
  if (!(Math.abs(CFG.now() - at) < 600)) return { status: 400, body: { error: "that signature is too old — try again" } };
  if (lc(recover(personalDigest(cancelMarketMessage(token, maker, at)), sig)) !== maker) return { status: 401, body: { error: "only the maker can cancel these" } };
  const m = await sget(store, marketKey(token));
  const mine = m ? m.orders.filter((x) => x.o.maker === maker && (x.status === "open" || x.status === "unfunded")) : [];
  for (const x of mine) { x.status = "cancelled"; x.cancelledOff = true; x.last = CFG.now(); }
  if (mine.length) await saveMarket(store, { ...m, orders: mine, fills: [] });
  mem.delete("book:" + token);
  return { status: 200, body: { ok: true, cancelled: mine.length } };
}

// ---------------------------------------------------------------- views
const sigFig = (p) => { if (!(p > 0)) return 0; const e = Math.floor(Math.log10(p)) - 3; return Math.round(p / 10 ** e) * 10 ** e; };
const pub = (x, m) => {
  const rem = remOf(x), sell = BigInt(x.o.sellAmount);
  const tokenRem = x.side === "sell" ? rem : x.price > 0 ? BigInt(Math.floor(human(rem, m.quote.decimals) / x.price * 10 ** m.token.decimals)) : 0n;
  return {
    hash: x.h, maker: x.o.maker, side: x.side, type: x.type, status: x.status, price: x.price, at: x.at, last: x.last,
    sellAmount: x.o.sellAmount, buyAmount: x.o.buyAmount, filled: x.filled || "0", filledPct: sell > 0n ? Number((BigInt(x.filled || 0) * 10000n) / sell) / 100 : 0,
    remainingToken: tokenRem.toString(), expiry: Number(x.o.expiry), trigger: x.type === "stop" ? { sqrtP: x.o.triggerSqrtP, below: x.o.triggerBelow, price: x.triggerPrice || null } : null,
    poolId: x.poolId, unfunded: x.status === "unfunded", note: x.note || null,
    trail: x.trail ? { pct: x.trail.pct, peak: x.trail.peak, at: x.trail.peak * (1 - x.trail.pct / 100), armed: !!x.trail.armed } : null,
    twap: x.type === "twap" ? { parts: x.parts, start: Number(x.o.start), duration: Number(x.o.duration), releasedPct: Math.round(Number((releasedOf(x.o) * 10000n) / sell)) / 100 } : null,
    group: x.group || null, leg: x.leg || null,
    retry: x.fails ? { fails: x.fails, next: x.nextTry || 0, why: x.lastErr || null } : null,
  };
};
async function book(token, { store } = {}) {
  token = lc(token);
  if (!isAddr(token)) return null;
  const c = mem.get("book:" + token);
  if (c && Date.now() - c.t < 4000) return c.v;
  const m = await sget(store, marketKey(token));
  if (!m) return { token, live: isAddr(ordersAddr()), asks: [], bids: [], fills: [], open: 0 };
  const now = CFG.now();
  const open = m.orders.filter((o) => o.status === "open" && o.type === "limit" && !(Number(o.o.expiry) && Number(o.o.expiry) < now));
  const kinds = (t) => m.orders.filter((o) => o.status === "open" && o.type === t).length;
  const levels = (side) => {
    const g = new Map();
    for (const x of open.filter((o) => o.side === side)) {
      const p = sigFig(x.price), t = Number(pub(x, m).remainingToken) / 10 ** m.token.decimals;
      if (!(t > 0)) continue;
      const v = g.get(p) || { price: p, amount: 0, orders: 0 };
      v.amount += t; v.orders++; g.set(p, v);
    }
    return [...g.values()].sort((a, b) => (side === "sell" ? a.price - b.price : b.price - a.price)).slice(0, 40);
  };
  const day = now - 86400, fills24 = (m.fills || []).filter((f) => f.at >= day);
  const v = {
    token: m.token, quote: m.quote, key: m.key, poolId: m.poolId, live: isAddr(ordersAddr()),
    asks: levels("sell"), bids: levels("buy"), open: m.orders.filter((o) => o.status === "open").length,
    stops: kinds("stop"), trails: kinds("trail"), twaps: kinds("twap"),
    fills: (m.fills || []).slice(0, 40).map((f) => ({ at: f.at, side: f.side, price: f.price, amount: f.amount, quote: f.quote, via: f.via, tx: f.tx })),
    day: { trades: fills24.length, volume: fills24.reduce((s, f) => s + (f.quote || 0), 0), high: fills24.length ? Math.max(...fills24.map((f) => f.price)) : null, low: fills24.length ? Math.min(...fills24.map((f) => f.price)) : null },
    last: (m.fills && m.fills[0] && m.fills[0].price) || null, at: m.at, spot: m.spot || null,
  };
  v.dayChange = (() => { const old = fills24.length ? fills24[fills24.length - 1].price : null; return old && v.last ? ((v.last - old) / old) * 100 : null; })();
  mem.set("book:" + token, { t: Date.now(), v });
  return v;
}
async function mine(wallet, { store } = {}) {
  wallet = lc(wallet);
  if (!isAddr(wallet)) return null;
  const idx = await sget(store, makerKey(wallet));
  const tokens = (idx && idx.tokens) || [];
  const out = [];
  const docs = store && store.getMany ? await store.getMany(tokens.map(marketKey)).catch(() => null) : null;
  for (const t of tokens.slice(0, 40)) {
    const m = (docs && docs[marketKey(t)]) || (await sget(store, marketKey(t)));
    if (!m) continue;
    for (const x of m.orders.filter((o) => o.o.maker === wallet)) out.push({ ...pub(x, m), token: m.token, quote: m.quote, key: x.key, order: x.o }); // the order itself (no signature): what an on-chain cancel needs
  }
  out.sort((a, b) => (b.last || b.at) - (a.last || a.at));
  return { wallet, orders: out.slice(0, 200) };
}
async function markets({ store } = {}) {
  const idx = await sget(store, INDEX);
  const tokens = ((idx && idx.tokens) || []).slice(0, 40);
  const out = [];
  for (const t of tokens) {
    const m = await sget(store, marketKey(t));
    if (!m) continue;
    const open = m.orders.filter((o) => o.status === "open");
    if (!open.length && !(m.fills || []).length) continue;
    const now = CFG.now(), live = open.filter((o) => o.type === "limit" && o.status === "open");
    const asks = live.filter((o) => o.side === "sell").map((o) => o.price), bids = live.filter((o) => o.side === "buy").map((o) => o.price);
    const f24 = (m.fills || []).filter((f) => f.at >= now - 86400);
    out.push({ token: m.token, quote: m.quote, open: open.length, last: (m.fills && m.fills[0] && m.fills[0].price) || null, at: m.at,
      bestAsk: asks.length ? Math.min(...asks) : null, bestBid: bids.length ? Math.max(...bids) : null, spot: m.spot || null,
      vol24: f24.reduce((s, f) => s + (f.quote || 0), 0), trades24: f24.length, poolId: m.poolId || null,
      // the last day's fill prices, oldest first (the markets list draws a line), and the change across them
      spark: f24.slice(0, 24).map((f) => f.price).filter((p) => p > 0).reverse(),
      change24: f24.length > 1 && f24[f24.length - 1].price > 0 ? ((f24[0].price - f24[f24.length - 1].price) / f24[f24.length - 1].price) * 100 : null });
  }
  return { markets: out.sort((a, b) => b.open - a.open) };
}

// ---------------------------------------------------------------- events and status
const EVENTS = `${P}/_events`, STATUS = `${P}/_status`, SCAN = `${P}/_scan`;
const ZERO32 = "0x" + "0".repeat(64);
async function pushEvents(store, list) {
  if (!list.length) return;
  const d = (await sget(store, EVENTS)) || { list: [], seq: 0 };
  for (const e of list) { d.seq = (d.seq || 0) + 1; d.list.unshift({ id: d.seq, ...e }); }
  d.list = d.list.slice(0, 300);
  await sset(store, EVENTS, d);
}
/// fills, triggered stops and one-cancels-other cancels after `since` (Telegram's alerts read these)
async function events({ store, since = 0 } = {}) {
  const d = (await sget(store, EVENTS)) || { list: [], seq: 0 };
  return { seq: d.seq || 0, list: d.list.filter((e) => e.id > since).reverse() };
}
/// the executor's last run: when, its wallet's gas, what it did, the fee burn
async function status({ store } = {}) {
  const d = (await sget(store, STATUS)) || {};
  const now = CFG.now();
  return { chain: CFG.id, live: isAddr(ordersAddr()), at: d.at || 0, ago: d.at ? now - d.at : null, ok: !!d.at && now - d.at < 300 && !d.low, low: !!d.low, gas: d.gas ?? null,
    keeper: d.keeper || null, gasSym: CFG.gasSym, last: d.last || null, burn: d.burn || null, feeBurn: feeBurnAddr() || null, orders: ordersAddr() || null };
}

// ---------------------------------------------------------------- the executor
/// after a fill transaction: its Filled events → fills in the market (and the orders' filled amounts), plus events
function recordFills(m, rc, via, evs = []) {
  const out = [];
  const now = CFG.now();
  for (const l of (rc && rc.logs) || []) {
    if (lc(l.address) !== ordersAddr() || !l.topics || lc(l.topics[0]) !== TOPIC_FILLED) continue;
    const h = lc(l.topics[1]);
    const x = m.orders.find((o) => o.h === h);
    if (!x) continue;
    const sold = W(l.data, 1), received = W(l.data, 2), fee = W(l.data, 3);
    const gross = received + fee;
    const tokenRaw = x.side === "sell" ? sold : gross, quoteRaw = x.side === "sell" ? gross : sold;
    const amount = human(tokenRaw, m.token.decimals), quote = human(quoteRaw, m.quote.decimals);
    out.push({ at: now, h, side: x.side, price: amount > 0 ? quote / amount : 0, amount, quote, via, tx: lc(rc.transactionHash) });
    x.filled = (BigInt(x.filled || 0) + sold).toString(); x.last = now; x.fails = 0; x.nextTry = 0; x.lastErr = null;
    if (BigInt(x.filled) >= BigInt(x.o.sellAmount)) x.status = "filled";
    evs.push({ at: now, kind: "fill", maker: x.o.maker, token: m.token.address, sym: m.token.symbol, qsym: m.quote.symbol, side: x.side, type: x.type, leg: x.leg || null,
      amount, quote, price: amount > 0 ? quote / amount : 0, done: x.status === "filled", pct: Number((BigInt(x.filled) * 10000n) / BigInt(x.o.sellAmount)) / 100, via, tx: lc(rc.transactionHash), h });
    // one-cancels-other: the other legs of its group can't fill any more (the contract refuses them too)
    if (x.group) for (const y of m.orders) {
      if (y.h === x.h || y.group !== x.group || y.o.maker !== x.o.maker || !(y.status === "open" || y.status === "unfunded")) continue;
      y.status = "cancelled"; y.note = "oco"; y.last = now;
      evs.push({ at: now, kind: "oco", maker: y.o.maker, token: m.token.address, sym: m.token.symbol, qsym: m.quote.symbol, side: y.side, type: y.type, leg: y.leg || null, h: y.h });
    }
  }
  // a match fills two orders in one trade: the tape shows it once (the sell side)
  const tape = via === "match" ? out.filter((f) => f.side === "sell") : out;
  m.fills = [...tape, ...(m.fills || [])].slice(0, KEEP_FILLS);
  return out;
}
/// the on-chain state of every open order: filled, cancelled, cancel-all, its group, expiry, and whether the maker
/// still holds and has approved what's left
async function refresh(m) {
  const S = ordersAddr(), now = CFG.now();
  const open = m.orders.filter((o) => o.status === "open" || o.status === "unfunded");
  if (!open.length) return;
  const cs = [], at = [];
  for (const x of open) {
    at.push(cs.length);
    cs.push({ to: S, data: SEL.filled + strip(x.h) }, { to: S, data: SEL.cancelled + strip(x.h) }, { to: S, data: SEL.epochOf + w(x.o.maker) },
      { to: x.o.sell, data: SEL.balanceOf + w(x.o.maker) }, { to: x.o.sell, data: SEL.allowance + w(x.o.maker) + w(S) },
      { to: x.o.sell, data: SEL.allowance + w(x.o.maker) + w(P2()) }, { to: P2(), data: SEL.p2allowance + w(x.o.maker) + w(x.o.sell) + w(S) });
    if (x.group) cs.push({ to: S, data: SEL.groupTakenBy + w(x.o.maker) + w(x.group) });
  }
  const r = [];
  for (let i = 0; i < cs.length; i += 40) r.push(...(await calls(cs.slice(i, i + 40), { timeoutMs: 8000 })));
  open.forEach((x, i) => {
    const k = at[i];
    const [fl, cx, ep, bal, alw, toP2, p2a] = r.slice(k, k + 7);
    const grp = x.group ? r[k + 7] : null;
    if (fl) x.filled = W(fl, 0).toString();
    const rem = remOf(x);
    if (cx && W(cx, 0) === 1n) x.status = "cancelled";
    else if (ep && W(ep, 0).toString() !== x.o.epoch) x.status = "cancelled";
    else if (rem <= 0n) x.status = "filled";
    else if (grp && W(grp, 0) !== 0n && lc("0x" + strip(grp).slice(0, 64)) !== x.h) { x.status = "cancelled"; x.note = "oco"; }
    else if (Number(x.o.expiry) && Number(x.o.expiry) < now) x.status = "expired";
    else {
      // allowed: approved to the contract, or through Permit2 (an allowance already set, or a signed permit to send)
      const direct = alw && W(alw, 0) >= rem, viaP2 = hasP2() && toP2 && W(toP2, 0) >= rem;
      const p2set = viaP2 && p2a && W(p2a, 0) >= rem && Number(W(p2a, 1)) > now + 30;
      const p2sig = viaP2 && x.permit && !x.permit.used && Number(x.permit.sigDeadline) > now + 30 && BigInt(x.permit.details.amount) >= rem;
      x.needPermit = !direct && !p2set && !!p2sig;
      x.status = (bal && W(bal, 0) < rem) || !(direct || p2set || p2sig) ? "unfunded" : "open";
    }
    if (x.status !== "open" && x.status !== "unfunded") x.last = now;
  });
}
/// crossing orders, wallet to wallet: the older order's price; both sides checked exactly as the contract does
function planMatch(a, b, m, free = new Set()) {
  // a: a sell (token → quote), b: a buy (quote → token); `free`: makers the fee policy waives
  const remA = remOf(a), remB = remOf(b);
  if (remA <= 0n || remB <= 0n) return null;
  const netFor = (maker) => (g) => (free.has(maker) ? g : g - (g * FEE_BPS) / 10000n);
  const grossFor = (maker) => (need) => { if (free.has(maker)) return need; const n = netFor(maker); let g = ceilDiv(need * 10000n, 10000n - FEE_BPS); while (n(g) < need) g++; return g; };
  const gA = grossFor(a.o.maker), gB = grossFor(b.o.maker);
  let t, q;
  if (a.at <= b.at) { // the ask was there first: its price
    t = remA; q = gA(owed(a.o, t));
    if (q > remB) { t = (t * remB) / q; q = gA(owed(a.o, t)); while (q > remB && t > 0n) { t--; q = gA(owed(a.o, t)); } }
  } else { // the bid was there first
    q = remB; t = gB(owed(b.o, q));
    if (t > remA) { q = (q * remA) / t; t = gB(owed(b.o, q)); while (t > remA && q > 0n) { q--; t = gB(owed(b.o, q)); } }
  }
  if (t <= 0n || q <= 0n) return null;
  if (netFor(a.o.maker)(q) < owed(a.o, t) || netFor(b.o.maker)(t) < owed(b.o, q)) return null; // inside the fees: no match
  return { a, b, t, q };
}
/// the most of order `x` (up to `cap`) the pool fills at its price now (0n if none)
async function poolAmount(x, cap = remOf(x), free = false) {
  const ok = async (amt) => { const out = await quoteOut(x.key, x.o.sell, amt).catch(() => null); return out != null && (free ? out : netOf(out)) >= owed(x.o, amt); };
  if (cap <= 0n) return 0n;
  if (await ok(cap)) return cap;
  if (x.type === "stop" || x.type === "trail") return 0n; // a stop sells all of it or waits
  let lo = cap / 64n;
  if (lo === 0n || !(await ok(lo))) return 0n;
  let hi = cap;
  for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2n; if (await ok(mid)) lo = mid; else hi = mid; }
  return lo;
}
const priceIn = (m, key, sqrtP) => { const t0 = cur(key.currency0) === m.token.address; return priceOf(sqrtP, t0, t0 ? m.token.decimals : m.quote.decimals, t0 ? m.quote.decimals : m.token.decimals); };
const backoff = (x, why) => { const now = CFG.now(); x.fails = (x.fails || 0) + 1; x.nextTry = now + Math.min(3600, 60 * 2 ** Math.min(x.fails, 6)); x.lastErr = String(why || "").slice(0, 120); };

/// market orders (swapMarket) from their Filled events: into the market's tape, once each
async function recordMarket(store, logs) {
  const S = ordersAddr(), usdc = lc(CFG.base);
  const byToken = new Map();
  for (const l of logs || []) {
    if (lc(l.address) !== S || !l.topics || lc(l.topics[0]) !== TOPIC_FILLED || lc(l.topics[1]) !== ZERO32) continue;
    const sell = lc("0x" + strip(l.topics[3]).slice(24)), buy = lc("0x" + strip(l.data).slice(24, 64));
    const side = sell === usdc ? "buy" : buy === usdc ? "sell" : null;
    if (!side) continue;
    const token = side === "buy" ? buy : sell;
    if (!byToken.has(token)) byToken.set(token, []);
    byToken.get(token).push({ l, side, sold: W(l.data, 1), received: W(l.data, 2), fee: W(l.data, 3) });
  }
  let n = 0;
  for (const [token, list] of byToken) {
    let m = await sget(store, marketKey(token));
    if (!m) { const [tm, qm] = await tokenMeta([token, usdc]); m = { token: tm, quote: qm, key: null, poolId: null, tokenIs0: null, orders: [], fills: [] }; }
    const seen = new Set((m.fills || []).map((f) => f.tx + ":" + (f.li ?? "")));
    const add = [];
    for (const { l, side, sold, received, fee } of list) {
      const tx = lc(l.transactionHash), li = parseInt(l.logIndex, 16);
      if (seen.has(tx + ":" + li)) continue;
      const gross = received + fee;
      const amount = human(side === "sell" ? sold : gross, m.token.decimals), quote = human(side === "sell" ? gross : sold, m.quote.decimals);
      add.push({ at: l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : CFG.now(), h: ZERO32, side, price: amount > 0 ? quote / amount : 0, amount, quote, via: "market", tx, li });
    }
    if (!add.length) continue;
    m.fills = [...add.reverse(), ...(m.fills || [])].slice(0, KEEP_FILLS);
    await saveMarket(store, m);
    await addTo(store, INDEX, "tokens", token);
    mem.delete("book:" + token);
    n += add.length;
  }
  return n;
}
/// right after a market order: the page sends its transaction so the tape shows it at once
async function noteMarketTx(tx, { store } = {}) {
  if (!isH32(tx) || !isAddr(ordersAddr())) return { status: 400, body: { error: "tx is needed" } };
  const rc = await chain().rpcCall("eth_getTransactionReceipt", [lc(tx)]).catch(() => null);
  if (!rc || rc.status !== "0x1") return { status: 404, body: { error: "no such transaction yet" } };
  const n = await recordMarket(store, rc.logs);
  return { status: 200, body: { ok: true, recorded: n } };
}

async function tick(store, { budgetMs = 12000, token = null } = {}) {
  const t0 = Date.now(), S = ordersAddr(), key = CFG.keeperKey();
  const out = { markets: 0, matched: 0, filled: 0, txs: [], errors: [] };
  if (!isAddr(S)) return { ...out, skipped: "no ArcircleOrders address" };
  const evs = [];
  const idx = await sget(store, INDEX);
  let tokens = token ? [lc(token)] : ((idx && idx.tokens) || []);
  if (!token && tokens.length > 1) { const c = Number((idx && idx.cursor) || 0) % tokens.length; tokens = [...tokens.slice(c), ...tokens.slice(0, c)]; await sset(store, INDEX, { ...idx, cursor: c + 1 }); }
  /// one transaction from the executor: { rc } once it's in, { fail } when it would revert or didn't go through,
  /// { skip } when this run is out of room
  const send = async (data, what, to = S) => {
    if (!key) return { skip: true };
    if (out.txs.length >= CFG.maxTx || Date.now() - t0 > budgetMs) return { skip: true };
    const [pre] = await chain().callsRaw([{ to, data }]);
    if (!pre || !pre.ok) { out.errors.push(`${what}: dry run failed`); return { fail: "would revert" }; }
    const r = await chain().sendTx({ to, data, key }).catch((e) => ({ ok: false, err: String((e && e.message) || e) }));
    if (r && r.hash) out.txs.push(r.hash);
    if (!r || !r.ok) { const err = `${(r && r.err) || "not confirmed"}`.slice(0, 160); out.errors.push(`${what}: ${err}`); return { fail: err }; }
    return { rc: r.receipt };
  };
  for (const t of tokens) {
    if (Date.now() - t0 > budgetMs) break;
    let m = await sget(store, marketKey(t));
    if (!m || !m.orders || !m.orders.length) continue;
    out.markets++;
    try { await refresh(m); } catch (e) { out.errors.push("refresh: " + String((e && e.message) || e).slice(0, 80)); }
    const now = CFG.now();
    // which makers the fee policy waives (holders of enough $ARCIRCLE)
    const makers = [...new Set(m.orders.filter((x) => x.status === "open").map((x) => x.o.maker))].slice(0, 60);
    const fr = makers.length ? await calls(makers.map((a) => ({ to: S, data: SEL.feeOf + w(a) + w(10000) }))).catch(() => []) : [];
    const free = new Set(makers.filter((a, i) => fr[i] && W(fr[i], 0) === 0n));
    /// a maker who allowed us with a Permit2 signature: send it (the biggest one of theirs for that token) first
    const permitFor = async (x) => {
      if (!x.needPermit || !x.permit) return true;
      const same = m.orders.filter((y) => y.o.maker === x.o.maker && y.o.sell === x.o.sell && y.permit && !y.permit.used && y.permit.details.nonce === x.permit.details.nonce);
      const best = same.sort((p, q) => (BigInt(q.permit.details.amount) > BigInt(p.permit.details.amount) ? 1 : -1))[0] || x;
      const r = await send(encPermit(x.o.maker, best.permit), "permit", P2());
      if (r.rc || r.fail) for (const y of same) y.permit.used = true; // sent, or no longer valid (a newer nonce): either way done with it
      if (r.rc) { for (const y of m.orders.filter((z) => z.o.maker === x.o.maker && z.o.sell === x.o.sell)) y.needPermit = false; return true; }
      if (r.fail) backoff(x, r.fail);
      return false;
    };
    const waiting = (x) => x.nextTry && x.nextTry > now;
    const live = (side) => m.orders.filter((x) => x.status === "open" && x.type === "limit" && x.side === side && !waiting(x) && !(Number(x.o.expiry) && Number(x.o.expiry) < now));
    // 1) wallet to wallet
    for (let guard = 0; guard < 8 && key; guard++) {
      const asks = live("sell").sort((a, b) => a.price - b.price || a.at - b.at), bids = live("buy").sort((a, b) => b.price - a.price || a.at - b.at);
      let plan = null;
      for (const a of asks.slice(0, 6)) { for (const b of bids.slice(0, 6)) { if (a.o.maker === b.o.maker || b.price < a.price * 0.999) continue; plan = planMatch(a, b, m, free); if (plan) break; } if (plan) break; }
      if (!plan) break;
      if (!(await permitFor(plan.a)) || !(await permitFor(plan.b))) break;
      const r = await send(encMatch(plan.a.o, plan.a.sig, plan.b.o, plan.b.sig, plan.t, plan.q), "match");
      if (r.fail) { backoff(plan.a, r.fail); backoff(plan.b, r.fail); }
      if (!r.rc) break;
      out.matched += recordFills(m, r.rc, "match", evs).length / 2;
    }
    // 2) against the pool: stops and trailing stops first (they're about time), then limits and timed orders
    const slots = new Map();
    const slotOf = async (id) => { if (!id) return null; if (!slots.has(id)) slots.set(id, await slot0Of(id).catch(() => null)); return slots.get(id); };
    const s0 = await slotOf(m.poolId);
    if (s0 && m.key) m.spot = priceIn(m, m.key, s0.sqrtP);
    const rank = { stop: 0, trail: 0, twap: 1, limit: 2 };
    const cands = m.orders.filter((x) => x.status === "open" && !waiting(x) && !(Number(x.o.expiry) && Number(x.o.expiry) < now)).sort((a, b) => (rank[a.type] ?? 3) - (rank[b.type] ?? 3));
    for (const x of cands) {
      if (!key || out.txs.length >= CFG.maxTx || Date.now() - t0 > budgetMs) break;
      let cap = remOf(x);
      if (x.type === "stop") {
        const st = await slotOf(x.poolId);
        if (!st) continue;
        const trig = BigInt(x.o.triggerSqrtP);
        if (x.o.triggerBelow ? st.sqrtP > trig : st.sqrtP < trig) continue;
        if (!x.triggered) { x.triggered = now; evs.push({ at: now, kind: "stop", maker: x.o.maker, token: m.token.address, sym: m.token.symbol, qsym: m.quote.symbol, side: x.side, type: x.type, leg: x.leg || null, price: priceIn(m, x.key, st.sqrtP), h: x.h }); }
      } else if (x.type === "trail") {
        const st = await slotOf(x.poolId);
        if (!st) continue;
        const p = priceIn(m, x.key, st.sqrtP);
        if (!(p > 0)) continue;
        if (!x.trail.armed) {
          if (p > x.trail.peak) x.trail.peak = p;
          if (p > x.trail.peak * (1 - x.trail.pct / 100)) continue;
          x.trail.armed = now;
          evs.push({ at: now, kind: "trail", maker: x.o.maker, token: m.token.address, sym: m.token.symbol, qsym: m.quote.symbol, side: x.side, type: x.type, price: p, peak: x.trail.peak, h: x.h });
        }
      } else {
        // nowhere near: skip the quote (a sell above spot, a buy below it)
        if (m.spot && x.price) {
          if (x.side === "sell" && x.price > m.spot * 1.02) continue;
          if (x.side === "buy" && x.price < m.spot * 0.98) continue;
        }
        if (x.type === "twap") {
          // 15 s behind our clock: the chain's may run a little late, and a fill past the release would revert
          const rel = releasedOf(x.o, now - 15), avail = rel - BigInt(x.filled || 0), chunk = BigInt(x.o.sellAmount) / BigInt(x.parts || 10);
          if (avail <= 0n || (avail < chunk && rel < BigInt(x.o.sellAmount))) continue;
          cap = avail < cap ? avail : cap;
        }
      }
      const amt = await poolAmount(x, cap, free.has(x.o.maker));
      if (amt <= 0n) continue;
      if (!(await permitFor(x))) continue;
      const r = await send(encFillPool(x.o, x.sig, amt, x.key), "fill");
      if (r.fail) backoff(x, r.fail);
      if (r.rc) out.filled += recordFills(m, r.rc, "pool", evs).length;
    }
    m = await saveMarket(store, m);
    mem.delete("book:" + t);
  }
  // 3) market orders from the chain (the page also reports its own right away)
  try {
    const sc = (await sget(store, SCAN)) || {};
    const head = await chain().latestBlock();
    let from = sc.to ? sc.to + 1 : Math.max(0, head.number - 2000);
    for (let k = 0; k < 3 && from <= head.number && Date.now() - t0 < budgetMs + 4000; k++) {
      const to = Math.min(head.number, from + 8999);
      const logs = await chain().getLogs({ address: S, topics: [TOPIC_FILLED, ZERO32], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }, 2);
      out.market = (out.market || 0) + (await recordMarket(store, logs));
      sc.to = to; from = to + 1;
    }
    await sset(store, SCAN, sc);
  } catch (e) { out.errors.push("market scan: " + String((e && e.message) || e).slice(0, 80)); }
  // 4) the fee burn, once an hour: USDC (WETH on Robinhood Chain) → $ARCIRCLE → 0x…dEaD (half), the rest to the treasury; other tokens flushed
  const st = (await sget(store, STATUS)) || {};
  const FB = feeBurnAddr();
  if (key && isAddr(FB) && CFG.now() - (st.burnAt || 0) > 3600 && Date.now() - t0 < budgetMs) {
    st.burnAt = CFG.now();
    try {
      const [ub, bps] = await calls([{ to: CFG.base, data: SEL.balanceOf + w(FB) }, { to: FB, data: SEL.burnBps }]);
      const bal = ub ? W(ub, 0) : 0n, spend = (bal * (bps ? W(bps, 0) : 0n)) / 10000n;
      if (bal >= CFG.burnMin && spend > 0n) {
        const [q] = await chain().callsRaw([{ to: FB, data: SEL.fbQuote + w(spend) }]);
        const d = q && q.data ? String(q.data) : "";
        const got = d.startsWith(QUOTE_RESULT) ? W(d.slice(10), 0) : 0n;
        if (got > 0n) {
          const r = await send(SEL.burn + w((got * 97n) / 100n), "fee burn", FB);
          if (r.rc) st.burn = { at: CFG.now(), [CFG.baseSym.toLowerCase()]: Number(spend) / 10 ** CFG.baseDec, arcircle: Number(got) / 1e18, tx: lc(r.rc.transactionHash) };
        }
      }
      const toks = ((idx && idx.tokens) || []).filter((x) => x !== lc(CFG.base)).slice(0, 12);
      const bals = toks.length ? await calls(toks.map((x) => ({ to: x, data: SEL.balanceOf + w(FB) }))) : [];
      let flushed = 0;
      for (let i = 0; i < toks.length && flushed < 2; i++) if (bals[i] && W(bals[i], 0) > 0n) { const r = await send(SEL.flush + w(toks[i]), "fee flush", FB); if (r.rc) flushed++; }
    } catch (e) { out.errors.push("fee burn: " + String((e && e.message) || e).slice(0, 80)); }
  }
  await pushEvents(store, evs).catch(() => null);
  // 5) the status the page and Telegram show
  if (key) {
    const me = addressOfKey(key);
    const gas = me ? await chain().balance(me).catch(() => null) : null;
    st.keeper = me; st.gas = gas == null ? null : Number(gas) / 1e18; st.gasSym = CFG.gasSym; st.low = gas != null && gas < CFG.lowGas;
  } else { st.keeper = null; st.low = false; }
  st.at = CFG.now(); st.last = { matched: out.matched, filled: out.filled, txs: out.txs.length, errors: out.errors.slice(0, 3) };
  await sset(store, STATUS, st);
  if (!key) out.skipped = "no ORDERS_KEEPER_KEY";
  out.events = evs.length;
  return out;
}

// ---------------------------------------------------------------- pools (Robinhood Chain's market picker)
/// a token's Uniswap v4 pools against ETH / WETH: Dexscreener names them, the PoolManager's Initialize log gives each
/// key (Blockscout's log search, else a search around the pool's creation block), slot0 the price. Cached a day.
const TOPIC_INIT = keccakText("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
async function getJson(u, ms = 6000) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(u, { signal: ctl.signal, headers: { accept: "application/json" } }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(tm); }
}
const dexPairs = async (token) => {
  if (CFG.dexPairs) return CFG.dexPairs(token);
  const j = await getJson(`https://api.dexscreener.com/token-pairs/v1/${CFG.dexChain}/${token}`);
  return Array.isArray(j) ? j : [];
};
/// the first block at or after `ts` (binary search on block timestamps)
async function blockAt(ts, head) {
  let lo = 0, hi = head.number;
  for (let i = 0; i < 40 && lo < hi; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const b = await chain().rpcCall("eth_getBlockByNumber", ["0x" + mid.toString(16), false]).catch(() => null);
    if (!b) break;
    if (parseInt(b.timestamp, 16) < ts) lo = mid + 1; else hi = mid;
  }
  return lo;
}
async function initLog(id, createdTs, head) {
  if (CFG.explorerApi) {
    const j = await getJson(`${CFG.explorerApi}?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=${CFG.pm}&topic0=${TOPIC_INIT}&topic1=${id}&topic0_1_opr=and`, 6000);
    const l = j && Array.isArray(j.result) && j.result[0];
    if (l && l.topics) return { topics: l.topics.filter(Boolean), data: l.data };
  }
  const b = createdTs ? await blockAt(createdTs - 120, head) : Math.max(0, head.number - 9000);
  for (let k = 0; k < 4; k++) {
    const from = b + k * 4000, to = Math.min(head.number, from + 3999);
    if (from > head.number) break;
    const logs = await chain().getLogs({ address: CFG.pm, topics: [TOPIC_INIT, id], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }, 2).catch(() => []);
    if (logs && logs[0]) return logs[0];
  }
  return null;
}
async function pools(token, { store } = {}) {
  token = lc(token);
  if (!isAddr(token)) return null;
  const hit = mem.get("pools:" + token);
  if (hit && Date.now() - hit.t < 60000) return hit.v;
  const k = `${P}/p_${token}`;
  const c = await sget(store, k);
  if (c && CFG.now() - (c.at || 0) < 86400 && c.pools && c.pools.length) return fresh(c);
  const ethSide = (a) => lc(a) === ZERO_ADDR || lc(a) === CFG.weth;
  const pairs = (await dexPairs(token)).filter((p) => p && /^0x[0-9a-fA-F]{64}$/.test(String(p.pairAddress || "")) && [lc(p.baseToken && p.baseToken.address), lc(p.quoteToken && p.quoteToken.address)].includes(token))
    .sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0)).slice(0, 4);
  const head = await chain().latestBlock();
  const out = [];
  let info = null;
  for (const p of pairs) {
    const id = lc(p.pairAddress);
    const l = await initLog(id, p.pairCreatedAt ? Math.floor(p.pairCreatedAt / 1000) : 0, head);
    if (!l) continue;
    const key = { currency0: lc("0x" + strip(l.topics[2]).slice(24)), currency1: lc("0x" + strip(l.topics[3]).slice(24)), fee: Number(W(l.data, 0)), tickSpacing: Number(BigInt.asIntN(24, W(l.data, 1))), hooks: lc("0x" + strip(l.data).slice(128 + 24, 192)) };
    if (lc(poolIdOf(key, keccak)) !== id) continue;
    const other = key.currency0 === token ? key.currency1 : key.currency1 === token ? key.currency0 : null;
    if (!other || !ethSide(other)) continue;
    out.push({ id, key, tokenIs0: key.currency0 === token, venue: [p.dexId ? p.dexId[0].toUpperCase() + p.dexId.slice(1) : "Uniswap", (p.labels || []).join(" ") || "v4", key.currency0 === ZERO_ADDR ? "ETH" : "WETH"].join(" "),
      dex: { liqUsd: (p.liquidity && p.liquidity.usd) || null, url: p.url || null }, feePct: key.fee === 0x800000 ? null : key.fee / 10000 });
    // the logo on a pair is its base token's: only a pair where this token is the base has this token's
    if (!info && p.info && p.info.imageUrl && lc(p.baseToken && p.baseToken.address) === token) info = { logo: p.info.imageUrl };
  }
  const [tm] = await tokenMeta([token]);
  const v = { token: { ...tm, logo: (info && info.logo) || null }, quote: { address: CFG.weth || CFG.base, symbol: "ETH", decimals: 18 }, pools: out, at: CFG.now() };
  if (out.length) await sset(store, k, v);
  return fresh(v);
  // the price now, from each pool's slot0
  async function fresh(v0) {
    const v1 = { ...v0, done: true, pools: await Promise.all(v0.pools.map(async (x) => {
      const s0 = await slot0Of(x.id).catch(() => null);
      const td = v0.token.decimals;
      return { ...x, quote: v0.quote, price: s0 && s0.sqrtP > 0n ? priceOf(s0.sqrtP, x.tokenIs0, x.tokenIs0 ? td : 18, x.tokenIs0 ? 18 : td) : null };
    })) };
    mem.set("pools:" + token, { t: Date.now(), v: v1 });
    return v1;
  }
}

// ---------------------------------------------------------------- candles (the page's own chart)
/// 5-minute OHLC for any Arc v4 pool from its Swap logs, kept for 3 days: [t, open, high, low, close, vol0, vol1] in
/// raw currency1-per-currency0 (the page turns it into quote per token). Filled forwards first, then backwards.
async function candles(poolId, { store, budgetMs = 5000 } = {}) {
  poolId = lc(poolId);
  if (!isH32(poolId)) return null;
  const hit = mem.get("cnd:" + poolId);
  if (hit && Date.now() - hit.t < 15000) return hit.v;
  const k = `${P}/c_${poolId}`, t0 = Date.now(), ch = chain();
  const d = (await sget(store, k)) || { lo: 0, hi: 0, c: {} };
  const head = await ch.latestBlock();
  if (!d.spb || CFG.now() - (d.spbAt || 0) > 86400) {
    const n = Math.max(1, head.number - 200000);
    const b = await ch.rpcCall("eth_getBlockByNumber", ["0x" + n.toString(16), false]).catch(() => null);
    d.spb = b ? Math.max(0.05, (head.ts - parseInt(b.timestamp, 16)) / Math.max(1, head.number - n)) : 0.5;
    d.spbAt = CFG.now();
  }
  const tsAt = (n) => head.ts - (head.number - n) * d.spb;
  const RANGE = 9000, WINDOW = Math.ceil((3 * 86400) / d.spb), edge = Math.max(0, head.number - WINDOW);
  const i128 = (x) => { const v = BigInt.asIntN(128, x); return v < 0n ? -v : v; };
  let changed = false;
  const add = (logs) => {
    for (const l of logs || []) {
      if (l.removed) continue;
      const n = parseInt(l.blockNumber, 16), li = parseInt(l.logIndex, 16), kk = n * 100000 + li;
      const ts = l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : tsAt(n);
      const b = String(Math.floor(ts / 300) * 300);
      const sp = Number(W(l.data, 2)) / 2 ** 96, p = sp * sp;
      if (!(p > 0)) continue;
      const v0 = Number(i128(W(l.data, 0))), v1 = Number(i128(W(l.data, 1)));
      const c = d.c[b];
      if (!c) d.c[b] = [p, p, p, p, v0, v1, kk, kk];
      else {
        if (kk < c[6]) { c[0] = p; c[6] = kk; }
        if (kk > c[7]) { c[3] = p; c[7] = kk; }
        c[1] = Math.max(c[1], p); c[2] = Math.min(c[2], p); c[4] += v0; c[5] += v1;
      }
      changed = true;
    }
  };
  const get = (from, to) => ch.getLogs({ address: CFG.pm, topics: [TOPIC_SWAP, poolId], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }, 2);
  try {
    let from = Math.max(d.hi ? d.hi + 1 : head.number - RANGE * 2, edge);
    if (!d.hi) d.lo = from;
    while (from <= head.number && Date.now() - t0 < budgetMs) { const to = Math.min(head.number, from + RANGE - 1); add(await get(from, to)); d.hi = to; from = to + 1; changed = true; }
    while (d.lo > edge && Date.now() - t0 < budgetMs) { const to = d.lo - 1, fr = Math.max(edge, to - RANGE + 1); add(await get(fr, to)); d.lo = fr; changed = true; }
  } catch { /* what we have so far */ }
  const cut = head.ts - 3 * 86400;
  for (const b of Object.keys(d.c)) if (Number(b) < cut - 300) { delete d.c[b]; changed = true; }
  if (changed) await sset(store, k, d);
  const v = { poolId, tf: 300, from: Math.round(tsAt(d.lo)), to: head.ts, complete: d.lo <= edge,
    candles: Object.keys(d.c).map(Number).sort((a, b) => a - b).map((b) => [b, ...d.c[String(b)].slice(0, 6)]) };
  mem.set("cnd:" + poolId, { t: Date.now(), v });
  return v;
}

// ---------------------------------------------------------------- v3: the tape, the burn, alerts, ETH
/// the latest fills across every market, newest first
async function recent({ store } = {}) {
  const c = mem.get("recent");
  if (c && Date.now() - c.t < 10000) return c.v;
  const idx = await sget(store, INDEX);
  const tokens = ((idx && idx.tokens) || []).slice(0, 40);
  const docs = store && store.getMany ? await store.getMany(tokens.map(marketKey)).catch(() => null) : null;
  const out = [];
  for (const t of tokens) {
    const m = (docs && docs[marketKey(t)]) || (await sget(store, marketKey(t)));
    if (!m || !m.token) continue;
    for (const f of (m.fills || []).slice(0, 12)) out.push({ token: m.token.address, sym: m.token.symbol, quote: m.quote && m.quote.symbol, at: f.at, side: f.side, price: f.price, amount: f.amount, value: f.quote || null, via: f.via, tx: f.tx });
  }
  out.sort((a, b) => b.at - a.at);
  const v = { chain: CFG.id, fills: out.slice(0, 30) };
  mem.set("recent", { t: Date.now(), v });
  return v;
}
const TOPIC_BURNED = keccakText("Burned(uint256,uint256,uint256)"); // ArcircleFeeBurn and ArcircleFeeBurnNative alike
/// every Burned event of the fee burn: the quote it spent, the $ARCIRCLE it burned, what went to the treasury (read forward from a cursor)
async function burns({ store, chunks = 24 } = {}) {
  const FB = feeBurnAddr(), from0 = Number(env(CFG.id === "rh" ? "ARCIRCLE_FEEBURN_RH_FROM" : "ARCIRCLE_FEEBURN_FROM")) || CFG.feeBurnFrom;
  if (!isAddr(FB) || !from0) return { chain: CFG.id, live: false };
  const c = mem.get("burns");
  if (c && Date.now() - c.t < 30000) return c.v;
  const key = `${P}/_burns`;
  const d = (await sget(store, key)) || { hi: from0 - 1, n: 0, arcircle: 0, quote: 0, treasury: 0, last: null };
  const head = (await chain().latestBlock()).number;
  let k = 0, moved = false;
  while (d.hi < head && k < chunks) {
    const a = d.hi + 1, b = Math.min(head, a + CFG.logRange - 1);
    const logs = await chain().getLogs({ address: FB, topics: [TOPIC_BURNED], fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) });
    for (const l of logs || []) {
      d.n++; d.quote += Number(W(l.data, 0)) / 10 ** CFG.baseDec; d.arcircle += Number(W(l.data, 1)) / 1e18; d.treasury += Number(W(l.data, 2)) / 10 ** CFG.baseDec;
      d.last = { block: parseInt(l.blockNumber, 16), tx: lc(l.transactionHash), arcircle: Number(W(l.data, 1)) / 1e18 };
    }
    d.hi = b; k++; moved = true;
  }
  if (moved) await sset(store, key, d);
  const v = { chain: CFG.id, live: true, n: d.n, arcircle: d.arcircle, quote: d.quote, quoteSym: CFG.baseSym, treasury: d.treasury, last: d.last, done: d.hi >= head, feeBurn: FB };
  mem.set("burns", { t: Date.now(), v });
  return v;
}
/// Robinhood Chain: dollars per ETH (null on Arc, where the quote is USDC)
async function ethUsd() {
  if (CFG.id !== "rh") return null;
  try { const P0 = await import("./_pons-arcpad.mjs"); return await P0.ethUsd(); } catch { return null; }
}
// price alerts: { t, sym, price, dir: "up"|"down", poolId, tokenIs0, td, qd, at } per wallet, at most 20
const alertKey = (wa) => `${P}/al_${lc(wa)}`;
const ALERTS_IDX = `${P}/_alerts`;
async function alerts(wallet, { store } = {}) {
  if (!isAddr(wallet)) return null;
  const d = (await sget(store, alertKey(wallet))) || { list: [] };
  return { wallet: lc(wallet), list: d.list || [] };
}
/// add or remove one (the wallet's view signature authorizes it, the same one that opens its orders)
async function alertSet(body, { store } = {}) {
  const wa = lc(body.wallet);
  if (!viewOk(wa, body.until, body.sig)) return { status: 401, body: { error: "sign once to manage your alerts" } };
  const d = (await sget(store, alertKey(wa))) || { list: [] };
  if (body.remove != null) {
    d.list = d.list.filter((a) => !(a.t === lc(body.token) && Math.abs(a.price - Number(body.price)) <= Math.abs(a.price) * 1e-9));
  } else {
    const t = lc(body.token), price = Number(body.price), dir = body.dir === "down" ? "down" : "up";
    if (!isAddr(t) || !(price > 0) || !isH32(body.poolId)) return { status: 400, body: { error: "token, price and pool are needed" } };
    d.list = [{ t, sym: String(body.sym || "").replace(/[^\w$.-]/g, "").slice(0, 16), price, dir, poolId: lc(body.poolId), tokenIs0: !!body.tokenIs0, td: Number(body.td) || 18, qd: Number(body.qd) || (CFG.baseDec), at: CFG.now() },
      ...d.list.filter((a) => !(a.t === t && a.price === price && a.dir === dir))].slice(0, 20);
  }
  await sset(store, alertKey(wa), d);
  const ix = (await sget(store, ALERTS_IDX)) || { wallets: [] };
  const has = ix.wallets.includes(wa);
  if (d.list.length && !has) { ix.wallets = [wa, ...ix.wallets].slice(0, 2000); await sset(store, ALERTS_IDX, ix); }
  else if (!d.list.length && has) { ix.wallets = ix.wallets.filter((x) => x !== wa); await sset(store, ALERTS_IDX, ix); }
  return { status: 200, body: { ok: true, list: d.list } };
}
/// the alerts whose price has been crossed, for these wallets (each fires once and is removed)
async function alertsDue(wallets, { store } = {}) {
  const out = [];
  const want = new Set((wallets || []).map(lc));
  const ix = (await sget(store, ALERTS_IDX)) || { wallets: [] };
  const px = new Map();
  for (const wa of ix.wallets.filter((x) => want.has(x)).slice(0, 200)) {
    const d = await sget(store, alertKey(wa));
    if (!d || !d.list || !d.list.length) continue;
    const keep = [];
    for (const a of d.list) {
      let p = px.get(a.poolId);
      if (p === undefined) {
        try { const s0 = await slot0Of(a.poolId); p = s0 && s0.sqrtP > 0n ? priceOf(s0.sqrtP, a.tokenIs0, a.tokenIs0 ? a.td : a.qd, a.tokenIs0 ? a.qd : a.td) : null; } catch { p = null; }
        px.set(a.poolId, p);
      }
      if (p != null && ((a.dir === "up" && p >= a.price) || (a.dir === "down" && p <= a.price))) out.push({ wallet: wa, ...a, now: p });
      else keep.push(a);
    }
    if (keep.length !== d.list.length) await sset(store, alertKey(wa), { ...d, list: keep });
  }
  return out;
}

const _test = { mem, releasedOf, planMatch, askPrice, bidPrice, encFillPool, encMatch, recover, personalDigest, normOrder };
return { CFG, id: CFG.id, configure, domainSeparator, orderHash, recover, cancelMessage, viewMessage, cancelMarketMessage, viewOk, normOrder,
  TOPIC_FILLED, encFillPool, encMatch, place, cancel, cancelMarket, book, mine, markets, events, status, planMatch, noteMarketTx, tick, candles, pools,
  recent, burns, ethUsd, alerts, alertSet, alertsDue, _test };
}

export const ARC = makeOrders(ARC_CFG);
export const RH = makeOrders(RH_CFG);
/// ?chain=rh (or 4663) → Robinhood Chain; anything else → Arc
export const forChain = (c) => (String(c || "").toLowerCase() === "rh" || String(c) === "4663" ? RH : ARC);
// Arc's, as before
export const { CFG, configure, domainSeparator, orderHash, recover, cancelMessage, viewMessage, cancelMarketMessage, viewOk, normOrder,
  TOPIC_FILLED, encFillPool, encMatch, place, cancel, cancelMarket, book, mine, markets, events, status, planMatch, noteMarketTx, tick, candles, _test } = ARC;
