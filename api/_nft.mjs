// api/_nft.mjs — ARCIRCLE NFT Vault (contracts/ArcircleNft.sol) on Robinhood Chain: a coin's Pons creator fees are
// split 50 / 50 by ArcircleNftRouter between the vault and the treasury; the vault buys NFTs (Seaport only) and raffles
// each one to $ARCIRCLE holders on Arc.
//   state()       the vault, the fees, the collections, the next NFT and how close it is, every prize and its raffle
//   me(user)      a wallet's raffle weight in the latest list: wallet $ARCIRCLE + locked in ARCIRCLE Staking + veARCIRCLE
//   list(prize)   a raffle's whole list (wallet, ticket range, weight parts) — what the vault's Merkle root commits to;
//                 with ?u= also that wallet's proof
//   v2: state() also carries the vault's on-chain event log (vaultLog: every purchase, raffle step and listing with
//                 its tx), the fee rate (Funded events → last 7 days + a cumulative series), floor samples per
//                 collection, and the keeper's last run (status, note, gas); col(c) checks a collection for the curator
//   tick()        the keeper (NFT_KEEPER_KEY, else ORDERS_KEEPER_RH_KEY — the vault's keeper or curator):
//                 claims the router's fees, buys the cheapest listed NFT the vault can afford (OpenSea's listings,
//                 OPENSEA_API_KEY), takes the holder snapshot and opens each raffle, then commits, reveals and settles
// The weights: a wallet's $ARCIRCLE (ArcLock locks count) + its $ARCIRCLE locked in ARCIRCLE Staking + its veARCIRCLE
// (so a max lock counts twice), at least `minHold` of held + locked; contracts, burn addresses and team wallets are out.
import { evmChain, addressOfKey } from "./_evm.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import * as M from "./_merkle.mjs";

export const NFT_VAULT_DEFAULT = "0x2eE3ae4140A08930Dc9cEde5cde86f3bC906c304"; // contracts/scripts/deploy-arcircle-nft.js, 2026-10-03, block 78683625
export const NFT_ROUTER_DEFAULT = "0x95B56477722dF40021797121f2faDe759dc88f65"; // block 78683679
export const NFT_VAULT_FROM = 78683625; // the vault's deploy block: its event log starts here
const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const ARCIRCLE = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7";
export const CFG = {
  rpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  chainId: 4663,
  explorer: "https://robinhoodchain.blockscout.com",
  vault: () => { const e = env("NFT_VAULT"); if (e === "none") return null; return isAddr(e) ? lc(e) : isAddr(NFT_VAULT_DEFAULT) ? lc(NFT_VAULT_DEFAULT) : null; },
  router: () => { const e = env("NFT_ROUTER"); return isAddr(e) ? lc(e) : isAddr(NFT_ROUTER_DEFAULT) ? lc(NFT_ROUTER_DEFAULT) : null; },
  keeperKey: () => env("NFT_KEEPER_KEY") || env("ORDERS_KEEPER_RH_KEY") || null,
  opensea: () => ({ key: env("OPENSEA_API_KEY"), chain: env("OPENSEA_CHAIN") || "robinhood", base: "https://api.opensea.io/api/v2" }),
  /// coins whose fees feed the vault (shown on the page): NFT_COINS='[{"sym":"TIE","token":"0x…"}]'
  coins: () => { try { const j = JSON.parse(env("NFT_COINS") || "[]"); return Array.isArray(j) ? j.filter((c) => c && isAddr(c.token)).map((c) => ({ sym: String(c.sym || "").slice(0, 16), token: lc(c.token) })) : []; } catch { return []; } },
  exclude: () => ["0xa066e6c5d1ac561a4065b9d6b00fef89c0bd02f8", "0x1a35a754a4251e46971184046ac57e8ad621672e", "0x9c36023a5e11f7c5013403051cd94a7e4e6887e7",
    "0x809e486817adcbdf244060f4c8c24b4c694af749", ...env("NFT_EXCLUDE").split(",").map(lc).filter(isAddr)],
  minHold: 1000n * 10n ** 18n,
  claimMin: 10n ** 15n, // 0.001 ETH before the keeper spends gas on a claim
  claimEvery: 3600,
  previewEvery: 6 * 3600,
  site: "https://www.arcircle.app",
  /// the $ARCIRCLE holder snapshot on Arc: { done, block, ts, rows: [{ a, v }], contracts: [] } | { done: false, progress }
  holders: async ({ store, budgetMs }) => { const S = await import("./_snapshot.mjs"); return S.run({ token: ARCIRCLE, locks: true }, { store, budgetMs }); },
  /// ARCIRCLE Staking's locks: [{ a, amount, ve }]
  locks: async ({ store }) => { const K = await import("./_stake.mjs"); return K.allLocks({ store }); },
  /// which of these Arc addresses have code (contracts can't be counted on to own the same address on Robinhood Chain)
  arcCode: async (addrs) => { if (!addrs.length) return new Set(); const A = await import("./_arc.mjs"); const out = new Set();
    for (let i = 0; i < addrs.length; i += 80) { const part = addrs.slice(i, i + 80); const r = await A.rpc(part.map((a, id) => ({ jsonrpc: "2.0", id, method: "eth_getCode", params: [a, "latest"] }))).catch(() => []);
      for (const x of Array.isArray(r) ? r : [r]) if (x && x.result && x.result !== "0x") out.add(part[x.id]); } return out; },
  fetch: (u, o) => fetch(u, o),
  now: () => Math.floor(Date.now() / 1000),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random32: () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); },
  cacheMs: 15000,
  logFrom: () => NFT_VAULT_FROM, // where the vault's event log starts (its deploy block)
  logChunk: 50000, // blocks per eth_getLogs
  logChunks: 12, // chunks per read (the log catches up over a few reads)
  sampleEvery: 3600, // a floor sample per collection, at most hourly
};
export function configure(o) { Object.assign(CFG, o || {}); ch = null; mem.clear(); }
let ch = null;
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: CFG.chainId }));
const mem = new Map();

// ---- abi bits ----
const strip = (h) => String(h || "").replace(/^0x/, "");
const kec = (s) => "0x" + Array.from(keccak_256(new TextEncoder().encode(s)), (b) => b.toString(16).padStart(2, "0")).join("");
const sel = (s) => kec(s).slice(0, 10);
const pad = (x) => (typeof x === "bigint" || typeof x === "number" ? BigInt(x).toString(16) : strip(x).toLowerCase()).padStart(64, "0");
const W = (h, i) => { const s = strip(h).slice(i * 64, (i + 1) * 64); return s ? BigInt("0x" + s) : 0n; };
const A = (h, i) => "0x" + strip(h).slice(i * 64 + 24, (i + 1) * 64);
const call = (to, sig, ...args) => ({ to, data: sel(sig) + args.map(pad).join("") });
const strAt = (h, i) => { try { const s = strip(h); const off = Number(W(h, i)) * 2; const n = Number(BigInt("0x" + s.slice(off, off + 64))); return new TextDecoder().decode(Uint8Array.from((s.slice(off + 64, off + 64 + n * 2).match(/../g) || []).map((x) => parseInt(x, 16)))); } catch { return ""; } };
const str = (h) => strAt(h, 0);
const eth = (wei) => Number(wei) / 1e18;
const STATUS = ["none", "held", "open", "drawn", "won"];
const bytesEnc = (h) => { const b = strip(h); return pad(BigInt(b.length / 2)) + b.padEnd(Math.ceil(b.length / 64) * 64, "0"); };

// ---- reads ----
async function reads(addr, fns) {
  const r = await chain().ethCalls(fns.map((f) => ({ to: addr, data: sel(f.includes("(") ? f : f + "()") })));
  return Object.fromEntries(fns.map((f, i) => [f.replace(/\(.*$/, ""), r[i]]));
}
async function vaultRaw() {
  const V = CFG.vault();
  const g = await reads(V, ["prizeCount", "collectionCount", "totalIn", "totalSpent", "keeper", "curator", "seaport", "currentBlock"]);
  const nP = Number(W(g.prizeCount, 0)), nC = Number(W(g.collectionCount, 0));
  const cl = nC ? await chain().ethCalls(Array.from({ length: nC }, (_, i) => call(V, "collectionList(uint256)", i))) : [];
  const caddrs = cl.map((h) => lc(A(h, 0)));
  const cr = caddrs.length ? await chain().ethCalls(caddrs.map((c) => call(V, "collections(address)", c))) : [];
  const collections = caddrs.map((c, i) => ({ address: c, maxPrice: W(cr[i], 0), activeAt: Number(W(cr[i], 1)), listed: W(cr[i], 2) === 1n }));
  const idx = Array.from({ length: nP }, (_, i) => i);
  const pr = nP ? await chain().ethCalls(idx.flatMap((i) => [call(V, "prizes(uint256)", i), call(V, "raffles(uint256)", i)])) : [];
  const prizes = idx.map((i) => {
    const p = pr[i * 2], r = pr[i * 2 + 1];
    const raffle = r ? { root: "0x" + strip(r).slice(0, 64), total: W(r, 1), snapshotBlock: Number(W(r, 2)), drawAfter: Number(W(r, 3)), commitHash: "0x" + strip(r).slice(4 * 64, 5 * 64),
      commitBlock: Number(W(r, 5)), attempts: Number(W(r, 6)), openedAt: Number(W(r, 7)), seed: "0x" + strip(r).slice(8 * 64, 9 * 64), winner: lc(A(r, 9)), list: strAt(r, 10) } : null;
    return { i, collection: lc(A(p, 0)), tokenId: W(p, 1), paid: W(p, 2), at: Number(W(p, 3)), status: STATUS[Number(W(p, 4))] || "none", donated: W(p, 5) === 1n, raffle };
  });
  const bal = await chain().balance(V);
  return { V, keeper: lc(A(g.keeper, 0)), curator: lc(A(g.curator, 0)), seaport: lc(A(g.seaport, 0)), totalIn: W(g.totalIn, 0), totalSpent: W(g.totalSpent, 0),
    block: Number(W(g.currentBlock, 0)), bal, collections, prizes };
}
async function routerRaw() {
  const R = CFG.router();
  if (!R) return null;
  const g = await reads(R, ["toVaultTotal", "toTreasuryTotal", "pending", "treasury", "manager"]).catch(() => null);
  if (!g) return null;
  return { address: R, toVault: W(g.toVaultTotal, 0), toTreasury: W(g.toTreasuryTotal, 0), pending: W(g.pending, 0), treasury: lc(A(g.treasury, 0)), manager: lc(A(g.manager, 0)) };
}

// ---- NFT names and pictures ----
const ipfs = (u) => String(u || "").replace(/^ipfs:\/\/(ipfs\/)?/, "https://ipfs.io/ipfs/");
async function collectionMeta(c) {
  const k = "cm/" + c;
  if (mem.has(k)) return mem.get(k);
  const [n, s] = await chain().ethCalls([call(c, "name()"), call(c, "symbol()")]).catch(() => [null, null]);
  const v = { name: n ? str(n) : "", symbol: s ? str(s) : "" };
  mem.set(k, v);
  return v;
}
async function tokenMeta(c, id) {
  const k = `tm/${c}/${id}`;
  if (mem.has(k)) return mem.get(k);
  let v = { image: null, name: null };
  try {
    const [u] = await chain().ethCalls([call(c, "tokenURI(uint256)", BigInt(id))]);
    let uri = u ? ipfs(str(u)) : "";
    if (uri.startsWith("data:application/json;base64,")) { const j = JSON.parse(atob(uri.slice(29))); v = { image: ipfs(j.image || j.image_url || ""), name: j.name || null }; }
    else if (/^https:\/\//.test(uri)) { const r = await CFG.fetch(uri, { signal: AbortSignal.timeout(5000) }); const j = r.ok ? await r.json() : null; if (j) v = { image: ipfs(j.image || j.image_url || "") || null, name: j.name || null }; }
  } catch { /* no picture */ }
  if (v.image && !/^https:\/\//.test(v.image)) v.image = null;
  mem.set(k, v);
  return v;
}

// ---- OpenSea: the cheapest listing of a collection, and the Seaport call that fills it ----
async function os(path, { method = "GET", body = null } = {}) {
  const o = CFG.opensea();
  if (!o.key) throw new Error("no OPENSEA_API_KEY");
  const r = await CFG.fetch(o.base + path, { method, headers: { "x-api-key": o.key, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`opensea ${r.status}`);
  return r.json();
}
async function slugOf(c) {
  const k = "slug/" + c;
  if (mem.has(k)) return mem.get(k);
  const j = await os(`/chain/${CFG.opensea().chain}/contract/${c}`);
  const s = j && (j.collection || (j.collection && j.collection.collection)) || null;
  mem.set(k, s);
  return s;
}
/// the cheapest ETH listings of a collection: [{ hash, protocol, tokenId, price (wei), image }]
export async function listings(c, { limit = 10 } = {}) {
  const k = "ls/" + c;
  const hit = mem.get(k);
  if (hit && Date.now() - hit.at < 60e3) return hit.v;
  const slug = await slugOf(c);
  if (!slug) return [];
  const j = await os(`/listings/collection/${encodeURIComponent(slug)}/best?limit=${limit}`);
  const v = ((j && j.listings) || []).map((l) => {
    const cur = l.price && l.price.current, offer = (l.protocol_data && l.protocol_data.parameters && l.protocol_data.parameters.offer) || [];
    const item = offer[0] || {};
    return { hash: l.order_hash, protocol: l.protocol_address, chain: l.chain, tokenId: String(item.identifierOrCriteria || ""), token: lc(item.token), currency: cur && cur.currency, price: cur ? BigInt(cur.value) : 0n };
  }).filter((l) => l.hash && l.token === lc(c) && /^\d+$/.test(l.tokenId) && (l.currency === "ETH" || !l.currency) && l.price > 0n).sort((a, b) => (a.price < b.price ? -1 : 1));
  mem.set(k, { at: Date.now(), v });
  return v;
}
const BASIC_T = "(address,uint256,uint256,address,address,address,uint256,uint256,uint8,uint256,uint256,bytes32,uint256,bytes32,bytes32,uint256,(uint256,address)[],bytes)";
/// Seaport fulfillBasicOrder / fulfillBasicOrder_efficient_6GL6yc calldata from OpenSea's fulfillment parameters
export function encodeBasicOrder(fn, p) {
  const name = String(fn || "").startsWith("fulfillBasicOrder_efficient_6GL6yc") ? "fulfillBasicOrder_efficient_6GL6yc" : String(fn || "").startsWith("fulfillBasicOrder") ? "fulfillBasicOrder" : null;
  if (!name) throw new Error(`can't fill a ${String(fn).split("(")[0] || "?"} order`);
  const add = p.additionalRecipients || [];
  const head = [p.considerationToken, BigInt(p.considerationIdentifier), BigInt(p.considerationAmount), p.offerer, p.zone, p.offerToken, BigInt(p.offerIdentifier), BigInt(p.offerAmount),
    BigInt(p.basicOrderType), BigInt(p.startTime), BigInt(p.endTime), p.zoneHash, BigInt(p.salt), p.offererConduitKey, p.fulfillerConduitKey, BigInt(p.totalOriginalAdditionalRecipients)].map(pad).join("");
  const addTail = pad(BigInt(add.length)) + add.map((x) => pad(BigInt(x.amount)) + pad(x.recipient)).join("");
  const offAdd = 18 * 32, offSig = offAdd + addTail.length / 2;
  const tuple = head + pad(BigInt(offAdd)) + pad(BigInt(offSig)) + addTail + bytesEnc(p.signature || "0x");
  return sel(name + "(" + BASIC_T + ")") + pad(32n) + tuple;
}
async function fulfillment(l, fulfiller) {
  const j = await os("/listings/fulfillment_data", { method: "POST", body: { listing: { hash: l.hash, chain: l.chain || CFG.opensea().chain, protocol_address: l.protocol }, fulfiller: { address: fulfiller } } });
  const t = j && j.fulfillment_data && j.fulfillment_data.transaction;
  if (!t) throw new Error("no fulfillment data");
  return { to: lc(t.to), value: BigInt(t.value || 0), data: encodeBasicOrder(t.function, (t.input_data && t.input_data.parameters) || {}) };
}

// ---- the holder list ----
/// the raffle list now: { done, block, ts, rows: [{ a, w, bal, lock, ve }], count, total } (rows by weight, largest first)
export async function buildList({ store = null, budgetMs = 8000 } = {}) {
  const res = await CFG.holders({ store, budgetMs });
  if (!res || !res.done) return { done: false, progress: res ? res.progress || 0 : 0, stage: res && res.stage };
  const skip = new Set([...CFG.exclude(), "0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead", "0xdead000000000000000042069420694206942069"]);
  const contracts = new Set((res.contracts || []).map(lc));
  const by = new Map();
  for (const x of res.rows || []) { const a = lc(x.a); if (skip.has(a) || contracts.has(a)) continue; by.set(a, { a, bal: BigInt(x.v), lock: 0n, ve: 0n }); }
  const locks = await CFG.locks({ store }).catch(() => []);
  const fresh = locks.map((l) => l.a).filter((a) => !by.has(a) && !skip.has(a));
  const code = await CFG.arcCode(fresh).catch(() => new Set());
  for (const l of locks) {
    if (skip.has(l.a) || contracts.has(l.a) || code.has(l.a)) continue;
    const r = by.get(l.a) || { a: l.a, bal: 0n, lock: 0n, ve: 0n };
    r.lock += BigInt(l.amount); r.ve += BigInt(l.ve);
    by.set(l.a, r);
  }
  const rows = [...by.values()].filter((r) => r.bal + r.lock >= CFG.minHold).map((r) => ({ ...r, w: r.bal + r.lock + r.ve }))
    .sort((x, y) => (y.w > x.w ? 1 : y.w < x.w ? -1 : x.a < y.a ? -1 : 1));
  const total = rows.reduce((s, r) => s + r.w, 0n);
  return { done: true, block: res.block, ts: res.ts, rows, count: rows.length, total };
}
const packList = (l, t) => ({ v: 1, block: l.block, ts: l.ts, count: l.count, total: l.total.toString(), root: t ? t.root : null, at: CFG.now(),
  rows: l.rows.map((r) => [r.a.slice(2), r.w.toString(36), r.bal.toString(36), r.lock.toString(36), r.ve.toString(36)].join(":")) });
const unpackList = (d) => ({ ...d, total: BigInt(d.total), rows: d.rows.map((s) => { const [a, w, b, l, v] = s.split(":"); const n = (x) => [...x].reduce((t, c) => t * 36n + BigInt(parseInt(c, 36)), 0n);
  return { a: "0x" + a, w: n(w), bal: n(b), lock: n(l), ve: n(v) }; }) });
const listKey = (i) => `nft/list/${CFG.vault()}/${i}`;
const PREVIEW = () => `nft/preview/${CFG.vault()}`;
async function sget(store, k) { if (mem.has(k)) return mem.get(k); if (!store) return null; try { const d = await store.get(k); if (d) mem.set(k, d); return d || null; } catch { return null; } }
async function sset(store, k, d) { mem.set(k, d); if (store) { try { await store.set(k, d); } catch { /* this instance keeps it */ } } }

// ---- the page ----
export async function state({ store = null } = {}) {
  const V = CFG.vault();
  if (!V) return { live: false, coins: CFG.coins() };
  const hit = mem.get("state");
  if (hit && Date.now() - hit.at < CFG.cacheMs) return hit.v;
  const [v, r, head] = await Promise.all([vaultRaw(), routerRaw(), chain().latestBlock()]);
  const now = head.ts; // the chain's clock: what the vault's delays are measured on
  const metas = await Promise.all(v.collections.map((c) => collectionMeta(c.address)));
  let next = null;
  const collections = await Promise.all(v.collections.map(async (c, k) => {
    let floor = null, best = null;
    if (c.listed && CFG.opensea().key) { try { const ls = await listings(c.address); best = ls.find((l) => l.price <= c.maxPrice) || null; floor = ls[0] ? eth(ls[0].price) : null; } catch { /* no listings */ } }
    const out = { address: c.address, ...metas[k], maxPrice: eth(c.maxPrice), activeAt: c.activeAt, active: c.listed && c.activeAt <= now, listed: c.listed, floor };
    if (out.active && best && (!next || best.price < next.priceWei)) next = { collection: c.address, ...metas[k], tokenId: best.tokenId, priceWei: best.price, price: eth(best.price) };
    return out;
  }));
  if (!next) { const c = collections.filter((x) => x.active).sort((a, b) => a.maxPrice - b.maxPrice)[0]; if (c) next = { collection: c.address, name: c.name, symbol: c.symbol, tokenId: null, price: c.maxPrice, cap: true }; }
  if (next) {
    if (next.tokenId) Object.assign(next, await tokenMeta(next.collection, next.tokenId));
    next.progress = next.price > 0 ? Math.min(1, eth(v.bal) / next.price) : 0;
    delete next.priceWei;
  }
  const prizes = await Promise.all(v.prizes.map(async (p) => {
    const cm = await collectionMeta(p.collection), tm = await tokenMeta(p.collection, p.tokenId);
    const r = p.raffle && p.raffle.total > 0n ? p.raffle : null;
    const list = r ? await sget(store, listKey(p.i)) : null;
    return { i: p.i, collection: p.collection, ...cm, tokenId: p.tokenId.toString(), image: tm.image, title: tm.name, paid: eth(p.paid), at: p.at, status: p.status, donated: p.donated,
      raffle: r ? { drawAfter: r.drawAfter, attempts: r.attempts, snapshotBlock: r.snapshotBlock, holders: list ? list.count : null, total: r.total.toString(),
        ticket: r.seed !== "0x" + "0".repeat(64) ? (BigInt(r.seed) % r.total).toString() : null, winner: p.status === "won" ? r.winner : null, root: r.root, list: r.list } : null };
  }));
  const pv = await sget(store, PREVIEW());
  const st = (await sget(store, "nft/status")) || {};
  const lg = await vaultLog(store).catch(() => null);
  const floors = await floorSamples(store, collections, now).catch(() => null);
  const out = {
    live: true, chainId: CFG.chainId, explorer: CFG.explorer, vault: V, router: r ? r.address : null, now, block: v.block,
    balance: eth(v.bal), totalIn: eth(v.totalIn), totalSpent: eth(v.totalSpent),
    fees: r ? { toVault: eth(r.toVault), toTreasury: eth(r.toTreasury), pending: eth(r.pending), treasury: r.treasury, total: eth(r.toVault + r.toTreasury) } : null,
    keeper: v.keeper, curator: v.curator, seaport: v.seaport, serverKeeper: CFG.keeperKey() ? lc(addressOfKey(CFG.keeperKey())) : null,
    collections, next, prizes: prizes.reverse(),
    bought: v.prizes.filter((p) => !p.donated).length, won: v.prizes.filter((p) => p.status === "won").length,
    holders: pv ? { count: pv.count, total: pv.total, block: pv.block, ts: pv.ts, at: pv.at } : null,
    coins: await coinsOf(store), keeperAt: st.at || 0,
    keeperRun: { at: st.at || 0, note: st.note || null, last: Array.isArray(st.last) ? st.last.slice(0, 6) : [], gas: st.gas != null ? st.gas : null, wallet: st.keeper || null },
    log: lg ? { events: lg.events.slice(-80).reverse(), hi: lg.hi, done: lg.done } : null,
    flow: lg ? flowOf(lg.events, now) : null,
    floors,
    rules: { minHold: 1000, weight: "wallet + locked in ARCIRCLE Staking + veARCIRCLE", challengeHours: 6, split: "50% NFT Vault / 50% treasury" },
  };
  mem.set("state", { at: Date.now(), v: out });
  return out;
}

/// a wallet's place in the latest list (an open raffle's, else the keeper's preview)
export async function me(user, { store = null } = {}) {
  if (!isAddr(user)) return { error: "u must be an address" };
  const u = lc(user);
  if (!CFG.vault()) return { live: false };
  const s = await state({ store });
  const open = s.prizes.find((p) => p.status === "open" || p.status === "drawn");
  const doc = (open && (await sget(store, listKey(open.i)))) || (await sget(store, PREVIEW()));
  const won = s.prizes.filter((p) => p.raffle && p.raffle.winner === u).map((p) => ({ i: p.i, name: p.name, tokenId: p.tokenId, image: p.image }));
  if (!doc) return { live: true, user: u, inList: false, won };
  const L = unpackList(doc);
  const r = L.rows.find((x) => x.a === u);
  return { live: true, user: u, list: open ? `raffle #${open.i}` : "preview", block: L.block, ts: L.ts, count: L.count, inList: !!r, won,
    weight: r ? Number(r.w) / 1e18 : 0, held: r ? Number(r.bal) / 1e18 : 0, locked: r ? Number(r.lock) / 1e18 : 0, ve: r ? Number(r.ve) / 1e18 : 0,
    chance: r && L.total > 0n ? Number((r.w * 1000000n) / L.total) / 1e4 : 0, minHold: Number(CFG.minHold / 10n ** 18n) };
}

/// a raffle's list as the vault committed to it (and a wallet's proof)
export async function list(prize, { store = null, user = "" } = {}) {
  const d = await sget(store, listKey(Number(prize)));
  if (!d) return null;
  const L = unpackList(d);
  const t = M.build(L.rows);
  const rows = t.ranges.map((r) => ({ a: r.a, start: r.s.toString(), end: r.e.toString(), weight: (Number(r.w) / 1e18).toFixed(4), held: (Number(r.bal) / 1e18).toFixed(4), locked: (Number(r.lock) / 1e18).toFixed(4), ve: (Number(r.ve) / 1e18).toFixed(4) }));
  const out = { prize: Number(prize), root: t.root, total: t.total.toString(), block: L.block, ts: L.ts, count: L.count, rows };
  if (isAddr(user)) { const i = t.ranges.findIndex((r) => r.a === lc(user)); if (i >= 0) out.proof = { i, start: rows[i].start, end: rows[i].end, proof: M.proofOf(t, i) }; }
  return out;
}

// ---- v2: the vault's own event log ----
const EV = {
  "Funded(address,uint256)": "funded",
  "CollectionProposed(address,uint256,uint256)": "listed",
  "CollectionCapLowered(address,uint256)": "capLowered",
  "CollectionRemoved(address)": "removed",
  "KeeperSet(address)": "keeper",
  "CuratorSet(address)": "curator",
  "Bought(uint256,address,uint256,uint256)": "bought",
  "Donated(uint256,address,uint256,address)": "donated",
  "RaffleOpened(uint256,bytes32,uint256,uint256,uint256,string)": "opened",
  "RaffleCancelled(uint256)": "cancelled",
  "Committed(uint256,bytes32,uint256,uint256)": "committed",
  "Drawn(uint256,bytes32,uint256,bool)": "drawn",
  "Won(uint256,address,address,uint256)": "won",
};
let TOP = null;
const topics = () => (TOP = TOP || Object.fromEntries(Object.entries(EV).map(([s, k]) => [kec(s), k])));
const tA = (t) => lc("0x" + strip(t).slice(24));
/// one log → a small record: { k, b, tx, li, prize?, a?, c?, id?, eth?, ... }
export function parseVaultLog(l) {
  const k = topics()[lc(l.topics && l.topics[0])];
  if (!k) return null;
  const t = l.topics, d = l.data, e = { k, b: parseInt(l.blockNumber, 16), tx: lc(l.transactionHash), li: parseInt(l.logIndex, 16) };
  if (k === "funded") { e.a = tA(t[1]); e.eth = eth(W(d, 0)); }
  else if (k === "listed") { e.c = tA(t[1]); e.cap = eth(W(d, 0)); e.activeAt = Number(W(d, 1)); }
  else if (k === "capLowered") { e.c = tA(t[1]); e.cap = eth(W(d, 0)); }
  else if (k === "removed") e.c = tA(t[1]);
  else if (k === "keeper" || k === "curator") e.a = tA(t[1]);
  else if (k === "bought") { e.prize = Number(BigInt(t[1])); e.c = tA(t[2]); e.id = BigInt(t[3]).toString(); e.eth = eth(W(d, 0)); }
  else if (k === "donated") { e.prize = Number(BigInt(t[1])); e.c = tA(t[2]); e.id = BigInt(t[3]).toString(); e.a = lc(A(d, 0)); }
  else if (k === "opened") { e.prize = Number(BigInt(t[1])); e.root = "0x" + strip(d).slice(0, 64); e.total = W(d, 1).toString(); e.snap = Number(W(d, 2)); e.drawAfter = Number(W(d, 3)); }
  else if (k === "cancelled") e.prize = Number(BigInt(t[1]));
  else if (k === "committed") { e.prize = Number(BigInt(t[1])); e.hash = "0x" + strip(d).slice(0, 64); e.attempt = Number(W(d, 2)); }
  else if (k === "drawn") { e.prize = Number(BigInt(t[1])); e.seed = "0x" + strip(d).slice(0, 64); e.ticket = W(d, 1).toString(); e.forced = W(d, 2) === 1n; }
  else if (k === "won") { e.prize = Number(BigInt(t[1])); e.a = tA(t[2]); e.c = lc(A(d, 0)); e.id = W(d, 1).toString(); }
  return e;
}
/// the vault's events since its deploy block, kept in the store and read forward from where it stopped
export async function vaultLog(store) {
  const V = CFG.vault();
  if (!V) return null;
  const key = `nft/log/${V}`;
  const hit = mem.get("log");
  if (hit && Date.now() - hit.at < CFG.cacheMs) return hit.v;
  const d = (await sget(store, key)) || { hi: CFG.logFrom() - 1, events: [] };
  const head = await chain().latestBlock();
  let n = 0, moved = false;
  while (d.hi < head.number && n < CFG.logChunks) {
    const from = d.hi + 1, to = Math.min(head.number, from + CFG.logChunk - 1);
    const logs = await chain().getLogs({ address: V, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) });
    const fresh = (logs || []).map(parseVaultLog).filter(Boolean);
    if (fresh.length) {
      const blocks = [...new Set(fresh.map((e) => e.b))];
      const ts = new Map();
      for (let i = 0; i < blocks.length; i += 40) {
        const part = blocks.slice(i, i + 40);
        const r = await chain().rpc(part.map((b, id) => ({ jsonrpc: "2.0", id, method: "eth_getBlockByNumber", params: ["0x" + b.toString(16), false] }))).catch(() => []);
        for (const x of Array.isArray(r) ? r : [r]) if (x && x.result) ts.set(part[x.id], parseInt(x.result.timestamp, 16));
      }
      for (const e of fresh) { e.ts = ts.get(e.b) || 0; d.events.push(e); }
    }
    d.hi = to; n++; moved = true;
  }
  if (d.events.length > 600) d.events = d.events.filter((e) => e.k !== "funded").concat(d.events.filter((e) => e.k === "funded").slice(-300)).sort((x, y) => x.b - y.b || x.li - y.li);
  if (moved) await sset(store, key, d);
  const v = { events: d.events, hi: d.hi, done: d.hi >= head.number };
  mem.set("log", { at: Date.now(), v });
  return v;
}
/// ETH into the vault: the last 7 days, a per-day rate, and a cumulative series (for the sparkline and the ETA)
export function flowOf(events, now) {
  const f = events.filter((e) => e.k === "funded" && e.ts);
  let cum = 0;
  const series = f.map((e) => [e.ts, (cum += e.eth)]);
  const d7 = f.filter((e) => e.ts >= now - 7 * 86400).reduce((s, e) => s + e.eth, 0);
  const first = f.length ? f[0].ts : 0;
  const days = first ? Math.max(1, Math.min(7, (now - first) / 86400)) : 0;
  return { d7, perDay: days ? d7 / days : 0, total: cum, series: series.slice(-60), first };
}
/// a floor sample per collection, at most hourly (kept 14 days)
async function floorSamples(store, cols, now) {
  const V = CFG.vault();
  const key = `nft/floors/${V}`;
  const d = (await sget(store, key)) || { at: 0, c: {} };
  const have = cols.filter((c) => c.floor != null);
  if (have.length && now - (d.at || 0) >= CFG.sampleEvery) {
    for (const c of have) d.c[c.address] = [...(d.c[c.address] || []), [now, c.floor]].filter((x) => x[0] >= now - 14 * 86400).slice(-336);
    d.at = now;
    await sset(store, key, d);
  }
  return d.c;
}
/// the curator's check before listing: is it an ERC-721 on Robinhood Chain, its name, and its floor
export async function col(c) {
  if (!isAddr(c)) return { error: "c must be an address" };
  const a = lc(c);
  const [code, iface] = await Promise.all([chain().rpcCall("eth_getCode", [a, "latest"]).catch(() => "0x"), chain().ethCalls([call(a, "supportsInterface(bytes4)", "80ac58cd" + "0".repeat(56))]).catch(() => [null])]);
  if (!code || code === "0x") return { address: a, contract: false };
  const m = await collectionMeta(a);
  let floor = null, listings = null;
  if (CFG.opensea().key) { try { const ls = await listings(a); listings = ls.length; floor = ls[0] ? eth(ls[0].price) : null; } catch { /* no listings */ } }
  const V = CFG.vault();
  let listed = null;
  if (V) { try { const [r] = await chain().ethCalls([call(V, "collections(address)", a)]); listed = r ? { maxPrice: eth(W(r, 0)), activeAt: Number(W(r, 1)), listed: W(r, 2) === 1n } : null; } catch { listed = null; } }
  return { address: a, contract: true, erc721: !!(iface[0] && W(iface[0], 0) === 1n), ...m, floor, listings, opensea: !!CFG.opensea().key, vault: listed };
}

// ---- the coins whose fees feed the vault ----
const PONS_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const COINS = () => `nft/coins/${CFG.router()}`;
/// a Pons V2 coin whose creator fee recipient is the router → added to the page's list (anyone may ask; it's checked)
export async function addCoin(token, { store = null } = {}) {
  const R = CFG.router();
  if (!R) return { status: 503, body: { error: "the NFT router isn't deployed yet" } };
  if (!isAddr(token)) return { status: 400, body: { error: "token must be an address" } };
  const t = lc(token);
  const [lt, sy] = await chain().ethCalls([call(PONS_FACTORY, "getLaunchedToken(address)", t), call(t, "symbol()")]);
  if (!lt || strip(lt).length < 15 * 64 || W(lt, 14) !== 1n || lc(A(lt, 0)) !== t) return { status: 404, body: { error: "not a Pons V2 launch" } };
  if (lc(A(lt, 3)) !== R) return { status: 409, body: { error: "this coin's creator fees don't go to the ARCIRCLE NFT router" } };
  const d = (await sget(store, COINS())) || { list: [] };
  if (!d.list.some((c) => c.token === t)) { d.list.push({ token: t, sym: sy ? str(sy).slice(0, 16) : "", at: CFG.now() }); await sset(store, COINS(), d); mem.delete("state"); }
  return { status: 200, body: { ok: true, token: t, coins: d.list } };
}
async function coinsOf(store) {
  const d = (await sget(store, COINS())) || { list: [] };
  const all = [...CFG.coins(), ...d.list.map((c) => ({ sym: c.sym, token: c.token }))];
  return all.filter((c, i) => all.findIndex((x) => x.token === c.token) === i);
}

// ---------------------------------------------------------------- the keeper
export async function tick({ store = null, budgetMs = 45000 } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  const V = CFG.vault(), key = CFG.keeperKey();
  if (!V) return { skipped: "no vault" };
  if (!key) return { skipped: "no keeper key (NFT_KEEPER_KEY or ORDERS_KEEPER_RH_KEY)" };
  const meA = lc(addressOfKey(key));
  const st = (await sget(store, "nft/status")) || {};
  const out = { txs: [], did: [] };
  const send = async (to, data, kind) => {
    const r = await chain().sendTx({ to, data, key }).catch((e) => ({ ok: false, err: String((e && e.message) || e).slice(0, 200) }));
    out.txs.push({ kind, hash: r.hash || null, ok: r.ok, err: r.err });
    return r;
  };
  const now = (await chain().latestBlock()).ts; // the chain's clock (the vault's delays use it)
  // 1 · the router's fees, at most hourly (anyone may claim; the keeper pays the gas)
  const r = await routerRaw();
  if (r && r.pending >= CFG.claimMin && now - (st.claimAt || 0) >= CFG.claimEvery) {
    st.claimAt = now;
    const x = await send(r.address, sel("claim()"), "claim");
    if (x.ok) out.did.push(`claimed ${eth(r.pending).toFixed(5)} ETH`);
  }
  let v = await vaultRaw();
  const ops = meA === v.keeper || meA === v.curator;
  if (!ops) { st.at = now; st.keeper = meA; st.note = "the keeper key is neither the vault's keeper nor its curator"; await sset(store, "nft/status", st); return { ...out, skipped: st.note }; }
  // 2 · raffles past their draw time: commit, then reveal on a later block
  for (const p of v.prizes.filter((x) => x.status === "open")) {
    if (left() < 20000) break;
    const R = p.raffle;
    if (now < R.drawAfter) continue;
    const live = R.commitHash !== "0x" + "0".repeat(64) && v.block <= R.commitBlock + 1 + 200;
    let secret = live ? (st.secrets || {})[p.i] : null;
    if (!live) {
      secret = CFG.random32();
      const h = M.keccakHex(secret);
      st.secrets = { ...(st.secrets || {}), [p.i]: secret };
      await sset(store, "nft/status", st);
      const c = await send(V, sel("commit(uint256,bytes32)") + pad(BigInt(p.i)) + pad(h), "commit");
      if (!c.ok) continue;
    }
    if (!secret) continue;
    const [rb] = await chain().ethCalls([call(V, "raffles(uint256)", BigInt(p.i))]);
    const cb = Number(W(rb, 5));
    for (let k = 0; k < 40 && left() > 8000; k++) {
      const [b] = await chain().ethCalls([{ to: V, data: sel("currentBlock()") }]);
      if (Number(W(b, 0)) > cb + 1) break;
      if (k === 6) await send(meA, "0x", "poke"); // a quiet chain makes no blocks: one of ours does
      await CFG.sleep(500);
    }
    const x = await send(V, sel("reveal(uint256,bytes32)") + pad(BigInt(p.i)) + pad(secret), "reveal");
    if (x.ok) { out.did.push(`drew raffle #${p.i}`); delete st.secrets[p.i]; }
  }
  v = await vaultRaw();
  // 3 · drawn raffles: send the NFT to the ticket's wallet
  for (const p of v.prizes.filter((x) => x.status === "drawn")) {
    if (left() < 8000) break;
    const d = await sget(store, listKey(p.i));
    if (!d) { out.did.push(`raffle #${p.i}: its list is missing`); continue; }
    const t = M.build(unpackList(d).rows);
    if (BigInt(t.root) !== BigInt(p.raffle.root)) { out.did.push(`raffle #${p.i}: the stored list doesn't match the root`); continue; }
    const ticket = BigInt(p.raffle.seed) % p.raffle.total;
    const k = M.indexOfTicket(t.ranges, ticket);
    if (k < 0) continue;
    const g = t.ranges[k], proof = M.proofOf(t, k);
    const data = sel("settle(uint256,address,uint256,uint256,bytes32[])") + pad(BigInt(p.i)) + pad(g.a) + pad(g.s) + pad(g.e) + pad(160n) + pad(BigInt(proof.length)) + proof.map(pad).join("");
    const x = await send(V, data, "settle");
    if (x.ok) { out.did.push(`raffle #${p.i} → ${g.a}`); st.events = [{ k: "won", i: p.i, a: g.a, at: now, tx: x.hash }, ...(st.events || [])].slice(0, 40); }
  }
  // 4 · NFTs waiting for a raffle: take the snapshot (it may need a few ticks), then open
  const held = v.prizes.filter((x) => x.status === "held");
  if (held.length && left() > 15000) {
    const L = await buildList({ store, budgetMs: Math.min(12000, left() - 10000) });
    if (!L.done) out.did.push(`snapshot ${Math.round((L.progress || 0) * 100)}%`);
    else if (L.count > 0) {
      const t = M.build(L.rows);
      const p = held[0];
      await sset(store, listKey(p.i), packList(L, t));
      await sset(store, PREVIEW(), packList(L, t));
      const url = `${CFG.site}/api/desk?nft=list&prize=${p.i}`;
      const enc = new TextEncoder().encode(url), uh = Array.from(enc, (b) => b.toString(16).padStart(2, "0")).join("");
      const data = sel("open(uint256,bytes32,uint128,uint64,string)") + pad(BigInt(p.i)) + pad(t.root) + pad(t.total) + pad(BigInt(L.block)) + pad(160n) + bytesEnc("0x" + uh);
      const x = await send(V, data, "open");
      if (x.ok) { out.did.push(`opened raffle #${p.i} · ${L.count} wallets`); st.events = [{ k: "open", i: p.i, n: L.count, at: now, tx: x.hash }, ...(st.events || [])].slice(0, 40); }
    }
  }
  // 5 · buy: the cheapest listing of an active collection, under its cap, that the vault can pay for
  if (CFG.opensea().key && left() > 12000) {
    const active = v.collections.filter((c) => c.listed && c.activeAt <= now);
    let best = null;
    for (const c of active) {
      try { const l = (await listings(c.address)).find((x) => x.price <= c.maxPrice && x.price <= v.bal); if (l && (!best || l.price < best.price)) best = { ...l, collection: c.address }; } catch (e) { out.did.push(`listings: ${String(e.message || e).slice(0, 80)}`); }
    }
    if (best) {
      try {
        const f = await fulfillment(best, V);
        if (f.to !== v.seaport) throw new Error("the listing isn't on the vault's Seaport");
        if (f.value > v.bal || f.value > (active.find((c) => c.address === best.collection) || {}).maxPrice) throw new Error("the fill costs more than the vault can pay");
        const data = sel("buy(address,uint256,uint256,bytes)") + pad(best.collection) + pad(BigInt(best.tokenId)) + pad(f.value) + pad(128n) + bytesEnc(f.data);
        const x = await send(V, data, "buy");
        if (x.ok) { out.did.push(`bought #${best.tokenId} for ${eth(f.value)} ETH`); st.events = [{ k: "buy", c: best.collection, id: best.tokenId, eth: eth(f.value), at: now, tx: x.hash }, ...(st.events || [])].slice(0, 40); }
      } catch (e) { out.did.push(`buy: ${String(e.message || e).slice(0, 120)}`); }
    }
  }
  // 6 · the preview list for the page ("your weight"), every few hours
  if (!held.length && now - (st.previewAt || 0) >= CFG.previewEvery && left() > 12000) {
    const L = await buildList({ store, budgetMs: Math.min(12000, left() - 8000) });
    if (L.done) { await sset(store, PREVIEW(), packList(L, null)); st.previewAt = now; out.did.push(`preview list · ${L.count} wallets`); }
  }
  st.at = now; st.keeper = meA; st.note = null; st.last = out.did.slice(0, 8);
  try { st.gas = eth(await chain().balance(meA)); } catch { /* keep */ }
  await sset(store, "nft/status", st);
  mem.delete("state");
  return { ...out, status: { at: st.at, gas: st.gas, last: st.last } };
}
export async function status(store) { const s = (await sget(store, "nft/status")) || null; if (s) delete s.secrets; return s; }
/// the keeper's latest events (bought / raffle open / won) for ARCIA's posts
export async function events(store, since = 0) { const s = (await sget(store, "nft/status")) || {}; return (s.events || []).filter((e) => e.at > since).reverse(); }
export const _test = { encodeBasicOrder, packList, unpackList, sel, kec };
