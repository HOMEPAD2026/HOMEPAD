// api/_argus-arcpad.mjs — coins launched on Argus through ArcPad (arc-argus.js).
//
// An ArcPad launch on Argus Portal #8 is an ordinary Argus launch whose creator fees are
// split on Argus's own CreatorRegistry: 70% the creator, 30% the ARCIRCLE PAD platform
// treasury. That split is the on-chain mark: a coin counts as "launched through ArcPad"
// while CreatorRegistry.payoutSplit(token) gives the treasury at least 30%.
//
//   register(token, tx)   the launch page reports a launch right after the split is set:
//                         the receipt must be a Portal #8 launch of that token, the split
//                         must be in place — then it's listed
//   list()                every listed coin with its price and market cap (slot0 of its
//                         Uniswap v4 pool), the split re-checked each time; coins whose
//                         split was removed are marked inactive. New PayoutSplitSet events
//                         are also scanned, so a launch whose report never arrived is found.
//   coin(token)           one listed coin with its price and market cap (the share image)
// A new listing from the last 15 minutes is announced once in the Telegram launch channel
// (api/_tg.mjs), the same as an ArcPad factory launch.
import { ethCalls, rpcCall, getLogs, latestBlock, blockTs, isAddr, keccakHex, pad, strip, wAddr, wBig } from "./_arc.mjs";
import { tokenMeta } from "./_locker.mjs";
import { announceArgus } from "./_tg.mjs";

export const PORTAL = "0xeed7559b8a6abf64427dc41cb5cc6400109c5d93"; // config-arc.js ARGUS_V5.PORTAL
export const REGISTRY = "0x986b478be2f05b44b47c61e26a0bbcbcc07610ed"; // ARGUS_V5.CREATOR_REGISTRY
export const PLATFORM = "0xa066e6c5d1ac561a4065b9d6b00fef89c0bd02f8"; // ARGUS_V5.PLATFORM_WALLET
export const PLATFORM_BPS = 3000;
const USDC = "0x3600000000000000000000000000000000000000";
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const DYNAMIC_FEE = 0x800000, TICK_SPACING = 200;
const LIST_DOC = "argusArc/list", CURSOR_DOC = "argusArc/cursor";
const lc = (a) => String(a || "").toLowerCase();
const hexOf = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
const sig = (s) => keccakHex(hexOf(s));
const sel = (s) => sig(s).slice(0, 10);
export const TOPIC = {
  launched: sig("Launched(address,address,address,address,address,uint256,int24,int24)"),
  meta: sig("LaunchMetadata(address,string,string,string,string,string)"),
  splitSet: sig("PayoutSplitSet(address,address,uint256)"),
};
const SEL = { payoutSplit: sel("payoutSplit(address)"), payoutOf: sel("payoutOf(address)"), launches: sel("launches(address)"), extsload: sel("extsload(bytes32)") };
const topicAddr = (t) => "0x" + strip(t).slice(24).toLowerCase();
const int24 = (v) => { const n = Number(v & 0xffffffn); return n >= 0x800000 ? n - 0x1000000 : n; };

function str(hex, i) {
  try {
    const h = strip(hex), off = Number(BigInt("0x" + h.slice(i * 64, i * 64 + 64))) * 2;
    const len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2;
    const bytes = h.slice(off + 64, off + 64 + len);
    return new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) || [], (b) => parseInt(b, 16)));
  } catch { return ""; }
}
/// payoutSplit(token) → { recipients[], bps[] }
export function decodeSplit(hex) {
  if (!hex) return null;
  const h = strip(hex), w = (i) => BigInt("0x" + (h.slice(i * 64, i * 64 + 64) || "0"));
  try {
    const a = Number(w(0)) / 32, b = Number(w(1)) / 32, n = Number(w(a)), m = Number(w(b));
    if (n !== m || n > 16) return null;
    const recipients = [], bps = [];
    for (let k = 0; k < n; k++) { recipients.push("0x" + h.slice((a + 1 + k) * 64 + 24, (a + 2 + k) * 64).toLowerCase()); bps.push(Number(w(b + 1 + k))); }
    return { recipients, bps };
  } catch { return null; }
}
/// the platform treasury's share of the creator fees, in bps (0 if it has none)
export function platformShare(split) {
  if (!split) return 0;
  const i = split.recipients.indexOf(PLATFORM);
  return i >= 0 ? split.bps[i] : 0;
}
export const poolIdOf = (token, hook) => {
  const t0 = BigInt(token) < BigInt(USDC);
  const [c0, c1] = t0 ? [token, USDC] : [USDC, token];
  return { id: keccakHex(pad(c0) + pad(c1) + pad(DYNAMIC_FEE.toString(16)) + pad(TICK_SPACING.toString(16)) + pad(hook)), tokenIs0: t0 };
};
/// USD per token from a pool's sqrtPriceX96 (token 18 decimals, USDC 6)
export function priceFromSqrt(sqrtP, tokenIs0, dec = 18) {
  const p = Number(sqrtP) / 2 ** 96, raw = p * p;
  if (!(raw > 0)) return null;
  const scale = 10 ** (dec - 6);
  return tokenIs0 ? raw * scale : scale / raw;
}

// ---- storage (Firestore docs through the caller's store; memory otherwise) ----
const mem = { list: null, cursor: null, view: null };
async function readList(store) {
  if (store) { const d = await store.get(LIST_DOC).catch(() => null); return (d && Array.isArray(d.items) ? d.items : null) || mem.list || []; }
  return mem.list || [];
}
async function writeList(store, items) {
  mem.list = items;
  if (store) await store.set(LIST_DOC, { items, at: Date.now() }).catch(() => null);
}

/// Everything about one Portal #8 launch, from its launch transaction
async function fromLaunchTx(tx, token) {
  const rc = await rpcCall("eth_getTransactionReceipt", [tx]);
  if (!rc || rc.status !== "0x1") return null;
  const logs = (rc.logs || []).filter((l) => lc(l.address) === PORTAL);
  const L = logs.find((l) => l.topics[0] === TOPIC.launched && (!token || topicAddr(l.topics[1]) === lc(token)));
  if (!L) return null;
  const tok = topicAddr(L.topics[1]);
  const M = logs.find((l) => l.topics[0] === TOPIC.meta && topicAddr(l.topics[1]) === tok);
  const bn = parseInt(rc.blockNumber, 16);
  return {
    token: tok, creator: topicAddr(L.topics[2]), tx: lc(tx), block: bn,
    hook: lc(wAddr(L.data, 0)), escrow: lc(wAddr(L.data, 1)), locker: lc(wAddr(L.data, 2)),
    positionId: wBig(L.data, 3).toString(), tickStart: int24(wBig(L.data, 4)), tickBond: int24(wBig(L.data, 5)),
    image: M ? str(M.data, 0).slice(0, 400) : "", website: M ? str(M.data, 1).slice(0, 200) : "", twitter: M ? str(M.data, 2).slice(0, 200) : "",
    telegram: M ? str(M.data, 3).slice(0, 200) : "", description: M ? str(M.data, 4).slice(0, 400) : "",
  };
}
async function complete(rec) {
  const [meta, ts] = await Promise.all([tokenMeta(rec.token).catch(() => null), blockTs(rec.block).catch(() => null)]);
  return { ...rec, name: meta ? meta.name : "", symbol: meta ? meta.symbol : "", supply: meta ? meta.supply : "1000000000000000000000000000", launchedAt: ts || Math.floor(Date.now() / 1000) };
}

/// price and market cap of listed coins, from their pools' slot0 (and the split, re-checked)
async function withPrices(items) {
  const calls = [];
  const t0s = items.map((x) => {
    const { id, tokenIs0 } = poolIdOf(x.token, x.hook);
    calls.push({ to: REGISTRY, data: SEL.payoutSplit + pad(x.token) }, { to: PM, data: SEL.extsload + strip(keccakHex(strip(id) + pad("6"))) });
    return tokenIs0;
  });
  const out = [];
  for (let i = 0; i < calls.length; i += 120) out.push(...(await ethCalls(calls.slice(i, i + 120), { timeoutMs: 8000 }).catch(() => calls.slice(i, i + 120).map(() => null))));
  return items.map((x, k) => {
    const sp = out[2 * k], s0 = out[2 * k + 1];
    const share = sp ? platformShare(decodeSplit(sp)) : null;
    const sqrtP = s0 ? BigInt(s0) & ((1n << 160n) - 1n) : 0n;
    const price = sqrtP > 0n ? priceFromSqrt(sqrtP, t0s[k]) : null;
    const supply = Number(BigInt(x.supply || "0")) / 1e18 || 1e9;
    return { ...x, tokenIs0: t0s[k], active: share == null ? true : share >= PLATFORM_BPS, splitChecked: share != null, priceUsd: price, mcapUsd: price != null ? price * supply : null };
  });
}

/// a launch from the last 15 minutes, not announced yet → the Telegram launch channel, once
const ANNOUNCE_WINDOW = 15 * 60;
async function maybeAnnounce(item, { force = false } = {}) {
  if (item.tg && !force) return "already";
  const age = Date.now() / 1000 - (item.launchedAt || 0);
  if (!force && !(age >= -60 && age <= ANNOUNCE_WINDOW)) return "too old";
  const [live] = await withPrices([item]).catch(() => [item]);
  const r = await announceArgus(live).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
  if (r && r.ok) item.tg = Math.floor(Date.now() / 1000);
  return r && r.ok ? "sent" : (r && r.error) || "not sent";
}

/// one listed coin, with its price (for the share image and a re-post)
export async function coin(token, { store } = {}) {
  token = lc(token);
  if (!isAddr(token)) return null;
  const items = await readList(store);
  const x = items.find((i) => i.token === token);
  if (!x) return null;
  const [live] = await withPrices([x]);
  return live;
}

/// the owner re-posting a listed coin to Telegram (TG_TEST_KEY), or a late launch-page report
export async function announce({ token, key }, { store } = {}) {
  token = lc(token);
  const test = !!(process.env.TG_TEST_KEY && key && String(key) === process.env.TG_TEST_KEY);
  const items = await readList(store);
  const i = items.findIndex((x) => x.token === token);
  if (i < 0) return { status: 404, body: { ok: false, error: "not an Argus launch listed through ArcPad" } };
  const tg = await maybeAnnounce(items[i], { force: test });
  if (tg === "sent") await writeList(store, items);
  return { status: 200, body: { ok: tg === "sent", tg, test } };
}

/// POST {action:"argusreg", token, tx} → list a launch whose 70/30 split is set
export async function register({ token, tx }, { store } = {}) {
  token = lc(token); tx = lc(tx);
  if (!isAddr(token) || !/^0x[0-9a-f]{64}$/.test(tx)) return { status: 400, body: { error: "token and tx are needed" } };
  const rec = await fromLaunchTx(tx, token);
  if (!rec) return { status: 404, body: { error: "that transaction isn't an Argus Portal #8 launch of this token" } };
  const [sp, po] = await ethCalls([{ to: REGISTRY, data: SEL.payoutSplit + pad(token) }, { to: REGISTRY, data: SEL.payoutOf + pad(token) }]);
  const split = decodeSplit(sp);
  if (platformShare(split) < PLATFORM_BPS) return { status: 409, body: { error: "the 70/30 fee split isn't set yet", split } };
  const items = await readList(store);
  const i = items.findIndex((x) => x.token === token);
  const item = await complete({ ...rec, payout: po ? lc(wAddr(po, 0)) : rec.creator });
  if (i >= 0) items[i] = { ...items[i], ...item }; else items.push(item);
  const saved = i >= 0 ? items[i] : item;
  const tg = await maybeAnnounce(saved);
  await writeList(store, items.slice(-2000));
  mem.view = null;
  return { status: 200, body: { ok: true, item: saved, tg } };
}

/// PayoutSplitSet events since the last look: launches whose report never arrived
async function scan(store, items, budgetMs) {
  const t0 = Date.now();
  let cur = mem.cursor;
  if (store) { const d = await store.get(CURSOR_DOC).catch(() => null); if (d && d.block) cur = Math.max(cur || 0, d.block); }
  const head = await latestBlock();
  let from = cur ? cur + 1 : head - 20000;
  let found = 0;
  while (from <= head && Date.now() - t0 < budgetMs) {
    const to = Math.min(head, from + 9000);
    const logs = await getLogs({ address: REGISTRY, topics: [TOPIC.splitSet], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }).catch(() => null);
    if (!logs) break;
    for (const l of logs) {
      const token = topicAddr(l.topics[1]);
      if (items.some((x) => x.token === token)) continue;
      const [sp] = await ethCalls([{ to: REGISTRY, data: SEL.payoutSplit + pad(token) }]);
      if (platformShare(decodeSplit(sp)) < PLATFORM_BPS) continue;
      // the launch itself: Portal #8's Launched event for this token, shortly before the split
      const bn = parseInt(l.blockNumber, 16);
      const ls = await getLogs({ address: PORTAL, topics: [TOPIC.launched, "0x" + pad(token)], fromBlock: "0x" + Math.max(0, bn - 9000).toString(16), toBlock: "0x" + bn.toString(16) }).catch(() => []);
      if (!ls.length) continue;
      const rec = await fromLaunchTx(ls[0].transactionHash, token);
      if (!rec) continue;
      const item = await complete({ ...rec, payout: rec.creator });
      await maybeAnnounce(item);
      items.push(item);
      found++;
    }
    mem.cursor = to;
    from = to + 1;
  }
  if (store && mem.cursor) await store.set(CURSOR_DOC, { block: mem.cursor, at: Date.now() }).catch(() => null);
  if (found) await writeList(store, items);
  return found;
}

/// GET ?argusarc=list → { items: [...], at }
export async function list({ store = null, budgetMs = 4000 } = {}) {
  if (mem.view && Date.now() - mem.view.at < 60e3) return mem.view;
  const items = await readList(store);
  await scan(store, items, budgetMs).catch(() => 0);
  const view = await withPrices(items);
  mem.view = { items: view, at: Date.now() };
  return mem.view;
}
