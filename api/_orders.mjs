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
//                   what the pool can fill at each maker's price (fillPool), stop orders once their trigger is crossed.
//                   Runs after every ARCIA DESK tick on Arc (api/desk.mjs) and on its own (?orderstick=1).
// Docs (Firestore through the caller's store; memory otherwise): orders/<token> (the market), orders/_index (markets),
// orders/m_<maker> (a maker's markets).
import { evmChain } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { poolSlot, decodeSlot0, poolIdOf, priceOf } from "./_liq-core.mjs";

const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
export const CFG = {
  address: "", // ArcircleOrders on Arc (set after it's deployed; env ARCIRCLE_ORDERS_ADDRESS overrides)
  chainId: 5042,
  rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  pm: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  keeperKey: () => env("ORDERS_KEEPER_KEY") || null,
  maxTx: 6, // transactions per tick
  now: () => Math.floor(Date.now() / 1000),
};
let ch = null;
export function configure(o) { Object.assign(CFG, o); ch = null; mem.clear(); }
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: CFG.chainId }));
const ordersAddr = () => lc(env("ARCIRCLE_ORDERS_ADDRESS") || CFG.address);
export const FEE_BPS = 10n;
const MAX_OPEN_PER_MAKER = 30, MAX_OPEN_PER_MARKET = 500, KEEP_FILLS = 200, KEEP_DONE = 300;

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
const ORDER_T = "Order(address maker,address sell,address buy,uint256 sellAmount,uint256 buyAmount,uint160 triggerSqrtP,bool triggerBelow,bytes32 poolId,uint64 expiry,uint32 epoch,uint256 salt)";
const ORDER_TYPEHASH = keccakText(ORDER_T);
const DOMAIN_TYPEHASH = keccakText("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
export function domainSeparator(address = ordersAddr(), chainId = CFG.chainId) {
  return keccak("0x" + strip(DOMAIN_TYPEHASH) + strip(keccakText("ARCIRCLE Orders")) + strip(keccakText("1")) + w(chainId) + w(address));
}
const FIELDS = ["maker", "sell", "buy", "sellAmount", "buyAmount", "triggerSqrtP", "triggerBelow", "poolId", "expiry", "epoch", "salt"];
const encOrder = (o) => FIELDS.map((f) => (f === "triggerBelow" ? w(o[f] ? 1 : 0) : w(o[f]))).join("");
export function orderHash(o, address = ordersAddr(), chainId = CFG.chainId) {
  const sh = keccak("0x" + strip(ORDER_TYPEHASH) + encOrder(o));
  return keccak("0x1901" + strip(domainSeparator(address, chainId)) + strip(sh));
}
/// a 65-byte r‖s‖v signature over a 32-byte digest → the signer's address (null if it doesn't parse)
export function recover(digest, sig) {
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
export const cancelMessage = (h) => `Cancel ARCIRCLE order ${lc(h)}`;

/// normalise an order from JSON: every number a decimal string, addresses lower-case
export function normOrder(o) {
  if (!o || typeof o !== "object") return null;
  const out = {};
  for (const f of ["maker", "sell", "buy"]) { if (!isAddr(o[f])) return null; out[f] = lc(o[f]); }
  for (const f of ["sellAmount", "buyAmount", "triggerSqrtP", "expiry", "epoch", "salt"]) { const v = big(o[f] == null ? 0 : o[f]); if (v == null || v < 0n) return null; out[f] = v.toString(); }
  out.triggerBelow = o.triggerBelow === true || o.triggerBelow === "true";
  out.poolId = isH32(o.poolId) ? lc(o.poolId) : "0x" + "0".repeat(64);
  if (BigInt(out.triggerSqrtP) >= 1n << 160n || BigInt(out.expiry) >= 1n << 64n || BigInt(out.epoch) >= 1n << 32n || BigInt(out.sellAmount) >= 1n << 255n || BigInt(out.buyAmount) >= 1n << 255n) return null;
  return out;
}
const normKey = (k) => (k && isAddr(k.currency0) && isAddr(k.currency1) && isAddr(k.hooks) && Number.isInteger(Number(k.fee)) && Number.isInteger(Number(k.tickSpacing))
  ? { currency0: lc(k.currency0), currency1: lc(k.currency1), fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: lc(k.hooks) } : null);

// ---------------------------------------------------------------- ABI
const ORDER_TUPLE = "(address,address,address,uint256,uint256,uint160,bool,bytes32,uint64,uint32,uint256)";
const KEY_TUPLE = "(address,address,uint24,int24,address)";
const SEL = {
  fillPool: sel(`fillPool(${ORDER_TUPLE},bytes,uint256,${KEY_TUPLE})`),
  matchOrders: sel(`matchOrders(${ORDER_TUPLE},bytes,${ORDER_TUPLE},bytes,uint256,uint256)`),
  quote: sel(`quote(${KEY_TUPLE},address,uint256)`),
  filled: sel("filled(bytes32)"), cancelled: sel("cancelled(bytes32)"), epochOf: sel("epochOf(address)"),
  balanceOf: sel("balanceOf(address)"), allowance: sel("allowance(address,address)"),
  decimals: sel("decimals()"), symbol: sel("symbol()"), extsload: sel("extsload(bytes32)"),
};
const QUOTE_RESULT = sel("QuoteResult(uint256)");
export const TOPIC_FILLED = keccakText("Filled(bytes32,address,address,address,uint256,uint256,uint256,uint8)");
const encKey = (k) => w(k.currency0) + w(k.currency1) + w(k.fee) + w(BigInt.asUintN(256, BigInt(k.tickSpacing))) + w(k.hooks);
const encBytes = (sig) => { const b = strip(sig); const n = b.length / 2; return w(n) + b.padEnd(Math.ceil(b.length / 64) * 64, "0"); };
export function encFillPool(o, sig, amount, key) {
  return SEL.fillPool + encOrder(o) + w(18 * 32) + w(amount) + encKey(key) + encBytes(sig);
}
export function encMatch(a, sa, b, sb, aAmt, bAmt) {
  const tailA = encBytes(sa), offA = 26 * 32, offB = offA + tailA.length / 2;
  return SEL.matchOrders + encOrder(a) + w(offA) + encOrder(b) + w(offB) + w(aAmt) + w(bAmt) + tailA + encBytes(sb);
}
const str1 = (hex) => { try { const h = strip(hex), off = Number(BigInt("0x" + h.slice(0, 64))) * 2, len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2; return new TextDecoder().decode(hexToBytes(h.slice(off + 64, off + 64 + len))); } catch { return ""; } };

// ---------------------------------------------------------------- chain reads
const calls = (cs, o) => chain().ethCalls(cs, o);
async function tokenMeta(addrs) {
  const r = await calls(addrs.flatMap((a) => [{ to: a, data: SEL.decimals }, { to: a, data: SEL.symbol }]));
  return addrs.map((a, i) => ({ address: lc(a), decimals: r[2 * i] ? Number(W(r[2 * i], 0)) : 18, symbol: (str1(r[2 * i + 1]) || "TOKEN").replace(/[^\w$.-]/g, "").slice(0, 16) }));
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
const marketKey = (t) => `orders/${lc(t)}`;
const makerKey = (m) => `orders/m_${lc(m)}`;
const INDEX = "orders/_index";
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

// ---------------------------------------------------------------- place / cancel
export async function place(body, { store } = {}) {
  const S = ordersAddr();
  if (!isAddr(S)) return { status: 503, body: { error: "ARCIRCLE Orders isn't live yet" } };
  const o = normOrder(body && body.order), key = normKey(body && body.key), sig = String((body && body.sig) || "");
  if (!o || !key || !/^0x[0-9a-fA-F]{130}$/.test(sig)) return { status: 400, body: { error: "order, sig and key are needed" } };
  const token = lc(body.token);
  if (!isAddr(token)) return { status: 400, body: { error: "token is needed" } };
  const pair = [key.currency0, key.currency1];
  if (!pair.includes(token) || !pair.includes(o.sell) || !pair.includes(o.buy) || o.sell === o.buy) return { status: 400, body: { error: "the order isn't for this pool's pair" } };
  const quote = pair.find((c) => c !== token);
  if (BigInt(o.sellAmount) === 0n || BigInt(o.buyAmount) === 0n) return { status: 400, body: { error: "amounts must be above zero" } };
  const now = CFG.now();
  if (o.expiry !== "0" && (Number(o.expiry) <= now + 30 || Number(o.expiry) > now + 400 * 86400)) return { status: 400, body: { error: "expiry must be between a minute and a year from now" } };
  const poolId = lc(poolIdOf(key, keccak));
  const stop = o.triggerSqrtP !== "0";
  if (stop && o.poolId !== poolId) return { status: 400, body: { error: "a stop order names its pool" } };
  if (!stop && o.poolId !== "0x" + "0".repeat(64) && o.poolId !== poolId) return { status: 400, body: { error: "the order names another pool" } };
  const h = lc(orderHash(o));
  if (lc(recover(h, sig)) !== o.maker) return { status: 401, body: { error: "the signature isn't the maker's" } };
  const [ep, bal, alw, fl, cx] = await calls([
    { to: S, data: SEL.epochOf + w(o.maker) }, { to: o.sell, data: SEL.balanceOf + w(o.maker) }, { to: o.sell, data: SEL.allowance + w(o.maker) + w(S) },
    { to: S, data: SEL.filled + strip(h) }, { to: S, data: SEL.cancelled + strip(h) },
  ]).catch(() => [null, null, null, null, null]);
  if (ep == null) return { status: 502, body: { error: "couldn't read Arc right now" } };
  if (W(ep, 0).toString() !== o.epoch) return { status: 409, body: { error: "this order was signed before your last cancel-all" } };
  if (cx && W(cx, 0) === 1n) return { status: 409, body: { error: "this order is cancelled" } };
  if (fl && W(fl, 0) >= BigInt(o.sellAmount)) return { status: 409, body: { error: "this order is already filled" } };
  if (!bal || W(bal, 0) < BigInt(o.sellAmount)) return { status: 409, body: { error: "not enough balance for this order" } };
  if (!alw || W(alw, 0) < BigInt(o.sellAmount)) return { status: 409, body: { error: "approve ARCIRCLE Orders for this amount first" } };
  const s0 = await slot0Of(poolId).catch(() => null);
  if (!s0 || s0.sqrtP === 0n) return { status: 409, body: { error: "that pool doesn't exist on Arc" } };
  let m = await sget(store, marketKey(token));
  if (!m) {
    const [tm, qm] = await tokenMeta([token, quote]);
    m = { token: tm, quote: qm, key, poolId, tokenIs0: key.currency0 === token, orders: [], fills: [] };
  }
  if (m.quote.address !== quote) return { status: 409, body: { error: `this market trades against ${m.quote.symbol}` } };
  if (m.orders.some((x) => x.h === h)) return { status: 200, body: { ok: true, hash: h, already: true } };
  const open = m.orders.filter((x) => x.status === "open" || x.status === "unfunded");
  if (open.length >= MAX_OPEN_PER_MARKET) return { status: 429, body: { error: "this market's book is full right now" } };
  if (open.filter((x) => x.o.maker === o.maker).length >= MAX_OPEN_PER_MAKER) return { status: 429, body: { error: `at most ${MAX_OPEN_PER_MAKER} open orders per wallet in one market` } };
  const side = o.sell === token ? "sell" : "buy";
  const rec = { h, o, sig, key, poolId, side, type: stop ? "stop" : "limit", status: "open", filled: fl ? W(fl, 0).toString() : "0", at: now, last: now };
  rec.price = side === "sell" ? askPrice(o, m) : bidPrice(o, m);
  if (stop && Number(body.triggerPrice) > 0) rec.triggerPrice = Number(body.triggerPrice); // for display only
  m.orders.push(rec);
  m = await saveMarket(store, m);
  await addTo(store, INDEX, "tokens", token);
  await addTo(store, makerKey(o.maker), "tokens", token);
  mem.delete("book:" + token);
  return { status: 200, body: { ok: true, hash: h, side, type: rec.type, price: rec.price } };
}
export async function cancel(body, { store } = {}) {
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

// ---------------------------------------------------------------- views
const sigFig = (p) => { if (!(p > 0)) return 0; const e = Math.floor(Math.log10(p)) - 3; return Math.round(p / 10 ** e) * 10 ** e; };
const pub = (x, m) => {
  const rem = remOf(x), sell = BigInt(x.o.sellAmount);
  const tokenRem = x.side === "sell" ? rem : x.price > 0 ? BigInt(Math.floor(human(rem, m.quote.decimals) / x.price * 10 ** m.token.decimals)) : 0n;
  return {
    hash: x.h, maker: x.o.maker, side: x.side, type: x.type, status: x.status, price: x.price, at: x.at, last: x.last,
    sellAmount: x.o.sellAmount, buyAmount: x.o.buyAmount, filled: x.filled || "0", filledPct: sell > 0n ? Number((BigInt(x.filled || 0) * 10000n) / sell) / 100 : 0,
    remainingToken: tokenRem.toString(), expiry: Number(x.o.expiry), trigger: x.type === "stop" ? { sqrtP: x.o.triggerSqrtP, below: x.o.triggerBelow, price: x.triggerPrice || null } : null,
    poolId: x.poolId, unfunded: x.status === "unfunded",
  };
};
export async function book(token, { store } = {}) {
  token = lc(token);
  if (!isAddr(token)) return null;
  const c = mem.get("book:" + token);
  if (c && Date.now() - c.t < 4000) return c.v;
  const m = await sget(store, marketKey(token));
  if (!m) return { token, live: isAddr(ordersAddr()), asks: [], bids: [], fills: [], open: 0 };
  const now = CFG.now();
  const open = m.orders.filter((o) => o.status === "open" && o.type === "limit" && !(Number(o.o.expiry) && Number(o.o.expiry) < now));
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
    stops: m.orders.filter((o) => o.status === "open" && o.type === "stop").length,
    fills: (m.fills || []).slice(0, 40).map((f) => ({ at: f.at, side: f.side, price: f.price, amount: f.amount, quote: f.quote, via: f.via, tx: f.tx })),
    day: { trades: fills24.length, volume: fills24.reduce((s, f) => s + (f.quote || 0), 0), high: fills24.length ? Math.max(...fills24.map((f) => f.price)) : null, low: fills24.length ? Math.min(...fills24.map((f) => f.price)) : null },
    last: (m.fills && m.fills[0] && m.fills[0].price) || null, at: m.at,
  };
  mem.set("book:" + token, { t: Date.now(), v });
  return v;
}
export async function mine(wallet, { store } = {}) {
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
export async function markets({ store } = {}) {
  const idx = await sget(store, INDEX);
  const tokens = ((idx && idx.tokens) || []).slice(0, 40);
  const out = [];
  for (const t of tokens) {
    const m = await sget(store, marketKey(t));
    if (!m) continue;
    const open = m.orders.filter((o) => o.status === "open");
    if (!open.length && !(m.fills || []).length) continue;
    out.push({ token: m.token, quote: m.quote, open: open.length, last: (m.fills && m.fills[0] && m.fills[0].price) || null, at: m.at });
  }
  return { markets: out.sort((a, b) => b.open - a.open) };
}

// ---------------------------------------------------------------- the executor
/// after a fill transaction: its Filled events → fills in the market (and the orders' filled amounts)
function recordFills(m, rc, via) {
  const out = [];
  for (const l of (rc && rc.logs) || []) {
    if (lc(l.address) !== ordersAddr() || !l.topics || lc(l.topics[0]) !== TOPIC_FILLED) continue;
    const h = lc(l.topics[1]);
    const x = m.orders.find((o) => o.h === h);
    if (!x) continue;
    const sold = W(l.data, 1), received = W(l.data, 2), fee = W(l.data, 3);
    const gross = received + fee;
    const tokenRaw = x.side === "sell" ? sold : gross, quoteRaw = x.side === "sell" ? gross : sold;
    const amount = human(tokenRaw, m.token.decimals), quote = human(quoteRaw, m.quote.decimals);
    out.push({ at: CFG.now(), h, side: x.side, price: amount > 0 ? quote / amount : 0, amount, quote, via, tx: lc(rc.transactionHash) });
    x.filled = (BigInt(x.filled || 0) + sold).toString(); x.last = CFG.now();
    if (BigInt(x.filled) >= BigInt(x.o.sellAmount)) x.status = "filled";
  }
  // a match fills two orders in one trade: the tape shows it once (the sell side)
  const tape = via === "match" ? out.filter((f) => f.side === "sell") : out;
  m.fills = [...tape, ...(m.fills || [])].slice(0, KEEP_FILLS);
  return out;
}
/// the on-chain state of every open order: filled, cancelled, cancel-all, expiry, and whether the maker still holds
/// and has approved what's left
async function refresh(m) {
  const S = ordersAddr(), now = CFG.now();
  const open = m.orders.filter((o) => o.status === "open" || o.status === "unfunded");
  if (!open.length) return;
  const cs = open.flatMap((x) => [
    { to: S, data: SEL.filled + strip(x.h) }, { to: S, data: SEL.cancelled + strip(x.h) }, { to: S, data: SEL.epochOf + w(x.o.maker) },
    { to: x.o.sell, data: SEL.balanceOf + w(x.o.maker) }, { to: x.o.sell, data: SEL.allowance + w(x.o.maker) + w(S) },
  ]);
  const r = [];
  for (let i = 0; i < cs.length; i += 40) r.push(...(await calls(cs.slice(i, i + 40), { timeoutMs: 8000 })));
  open.forEach((x, i) => {
    const [fl, cx, ep, bal, alw] = r.slice(5 * i, 5 * i + 5);
    if (fl) x.filled = W(fl, 0).toString();
    const rem = remOf(x);
    if (cx && W(cx, 0) === 1n) x.status = "cancelled";
    else if (ep && W(ep, 0).toString() !== x.o.epoch) x.status = "cancelled";
    else if (rem <= 0n) x.status = "filled";
    else if (Number(x.o.expiry) && Number(x.o.expiry) < now) x.status = "expired";
    else if ((bal && W(bal, 0) < rem) || (alw && W(alw, 0) < rem)) x.status = "unfunded";
    else x.status = "open";
    if (x.status !== "open" && x.status !== "unfunded") x.last = now;
  });
}
/// crossing orders, wallet to wallet: the older order's price; both sides checked exactly as the contract does
export function planMatch(a, b, m) {
  // a: a sell (token → quote), b: a buy (quote → token)
  const remA = remOf(a), remB = remOf(b);
  if (remA <= 0n || remB <= 0n) return null;
  const netOf2 = (g) => g - (g * FEE_BPS) / 10000n;
  const grossFor = (need) => { let g = ceilDiv(need * 10000n, 10000n - FEE_BPS); while (netOf2(g) < need) g++; return g; };
  let t, q;
  if (a.at <= b.at) { // the ask was there first: its price
    t = remA; q = grossFor(owed(a.o, t));
    if (q > remB) { t = (t * remB) / q; q = grossFor(owed(a.o, t)); while (q > remB && t > 0n) { t--; q = grossFor(owed(a.o, t)); } }
  } else { // the bid was there first
    q = remB; t = grossFor(owed(b.o, q));
    if (t > remA) { q = (q * remA) / t; t = grossFor(owed(b.o, q)); while (t > remA && q > 0n) { q--; t = grossFor(owed(b.o, q)); } }
  }
  if (t <= 0n || q <= 0n) return null;
  if (netOf2(q) < owed(a.o, t) || netOf2(t) < owed(b.o, q)) return null; // inside the fees: no match
  return { a, b, t, q };
}
/// the most of order `x` the pool fills at its price now (0n if none)
async function poolAmount(x) {
  const rem = remOf(x);
  const ok = async (amt) => { const out = await quoteOut(x.key, x.o.sell, amt).catch(() => null); return out != null && netOf(out) >= owed(x.o, amt); };
  if (await ok(rem)) return rem;
  if (x.type === "stop") return 0n; // a stop sells all of it or waits
  let lo = rem / 64n;
  if (lo === 0n || !(await ok(lo))) return 0n;
  let hi = rem;
  for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2n; if (await ok(mid)) lo = mid; else hi = mid; }
  return lo;
}
export async function tick(store, { budgetMs = 12000, token = null } = {}) {
  const t0 = Date.now(), S = ordersAddr(), key = CFG.keeperKey();
  const out = { markets: 0, matched: 0, filled: 0, txs: [], errors: [] };
  if (!isAddr(S)) return { ...out, skipped: "no ArcircleOrders address" };
  const idx = await sget(store, INDEX);
  let tokens = token ? [lc(token)] : ((idx && idx.tokens) || []);
  if (!token && tokens.length > 1) { const c = Number((idx && idx.cursor) || 0) % tokens.length; tokens = [...tokens.slice(c), ...tokens.slice(0, c)]; await sset(store, INDEX, { ...idx, cursor: c + 1 }); }
  const send = async (data, what) => {
    if (!key) return null;
    if (out.txs.length >= CFG.maxTx || Date.now() - t0 > budgetMs) return null;
    const [pre] = await chain().callsRaw([{ to: S, data }]);
    if (!pre || !pre.ok) { out.errors.push(`${what}: dry run failed`); return null; }
    const r = await chain().sendTx({ to: S, data, key }).catch((e) => ({ ok: false, err: String((e && e.message) || e) }));
    if (r && r.hash) out.txs.push(r.hash);
    if (!r || !r.ok) { out.errors.push(`${what}: ${(r && r.err) || "not confirmed"}`.slice(0, 160)); return null; }
    return r.receipt;
  };
  for (const t of tokens) {
    if (Date.now() - t0 > budgetMs) break;
    let m = await sget(store, marketKey(t));
    if (!m) continue;
    out.markets++;
    try { await refresh(m); } catch (e) { out.errors.push("refresh: " + String((e && e.message) || e).slice(0, 80)); }
    const now = CFG.now();
    const live = (side) => m.orders.filter((x) => x.status === "open" && x.type === "limit" && x.side === side && !(Number(x.o.expiry) && Number(x.o.expiry) < now));
    // 1) wallet to wallet
    for (let guard = 0; guard < 8 && key; guard++) {
      const asks = live("sell").sort((a, b) => a.price - b.price || a.at - b.at), bids = live("buy").sort((a, b) => b.price - a.price || a.at - b.at);
      let plan = null;
      for (const a of asks.slice(0, 6)) { for (const b of bids.slice(0, 6)) { if (a.o.maker === b.o.maker || b.price < a.price * 0.999) continue; plan = planMatch(a, b, m); if (plan) break; } if (plan) break; }
      if (!plan) break;
      const rc = await send(encMatch(plan.a.o, plan.a.sig, plan.b.o, plan.b.sig, plan.t, plan.q), "match");
      if (!rc) break;
      out.matched += recordFills(m, rc, "match").length / 2;
    }
    // 2) against the pool: limit orders at their price, stop orders once triggered
    const s0 = m.poolId ? await slot0Of(m.poolId).catch(() => null) : null;
    if (s0) m.spot = priceOf(s0.sqrtP, m.tokenIs0, m.tokenIs0 ? m.token.decimals : m.quote.decimals, m.tokenIs0 ? m.quote.decimals : m.token.decimals);
    const cands = m.orders.filter((x) => x.status === "open" && !(Number(x.o.expiry) && Number(x.o.expiry) < now));
    for (const x of cands) {
      if (!key || out.txs.length >= CFG.maxTx || Date.now() - t0 > budgetMs) break;
      if (x.type === "stop") {
        const st = x.poolId === m.poolId ? s0 : await slot0Of(x.poolId).catch(() => null);
        if (!st) continue;
        const trig = BigInt(x.o.triggerSqrtP);
        if (x.o.triggerBelow ? st.sqrtP > trig : st.sqrtP < trig) continue;
      } else if (m.spot && x.price) {
        // nowhere near: skip the quote (a sell above spot, a buy below it)
        if (x.side === "sell" && x.price > m.spot * 1.02) continue;
        if (x.side === "buy" && x.price < m.spot * 0.98) continue;
      }
      const amt = await poolAmount(x);
      if (amt <= 0n) continue;
      const rc = await send(encFillPool(x.o, x.sig, amt, x.key), "fill");
      if (rc) out.filled += recordFills(m, rc, "pool").length;
    }
    m = await saveMarket(store, m);
    mem.delete("book:" + t);
  }
  if (!key) out.skipped = "no ORDERS_KEEPER_KEY";
  return out;
}

export const _test = { mem, planMatch, askPrice, bidPrice, encFillPool, encMatch, recover, personalDigest, normOrder };
