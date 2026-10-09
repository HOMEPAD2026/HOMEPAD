// api/_perp.mjs — ARCIRCLE Perps (contracts/ArcPerp.sol): reads for the page and the keeper.
// NOT LIVE until the contract is audited and deployed (env PERP_ADDRESS, else PERP_DEFAULT — empty).
//   state(user)  markets (Chainlink price, the keeper's price, open interest, caps), the pool (size, share price, what's
//                reserved for open positions, the queue), fees; for a wallet: its positions (PnL, liquidation price)
//                and its pending orders
//   tick()       the keeper (PERP_KEEPER_KEY, else PREDICT_KEEPER_KEY / ORDERS_KEEPER_KEY): for up to ~45 s, every few
//                seconds — execute pending orders at Hyperliquid's mid prices (only when they're inside the contract's
//                band around Chainlink, else it waits), liquidate positions under the maintenance margin, and once a day
//                share the pool's gains over its high-water mark (skim). Cron: /api/desk?perptick=1&key=<CRON_SECRET>
import { evmChain, addressOfKey } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import * as paper from "./_paper.mjs";

export const PERP_DEFAULT = ""; // contracts/scripts/deploy-arc-perp.js — only after an external audit
const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const te = new TextEncoder();
const hx = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sel = (sig) => hx(keccak_256(te.encode(sig))).slice(0, 8);
const S = Object.fromEntries([
  "marketCount()", "market(uint256)", "position(uint256)", "order(uint256)", "positionCount()", "orderCount()", "poolAmount()", "reserved()", "totalShares()",
  "sharePrice()", "owedTotal()", "queueLength()", "paused()", "lpOpen()", "openFeeBps()", "closeFeeBps()", "borrowBpsPerHour()", "maintBps()", "maxDevBps()",
  "maxProfitBps()", "maxUtilBps()", "execFee()", "minCollateral()", "hwm()", "skimBps()", "positionsOf(address)", "ordersOf(address)", "feedPrice(uint256)",
  "liqPrice(uint256)", "borrowFee(uint256)", "liquidatable(uint256,uint256)", "shares(address)", "lastDeposit(address)", "keeper(address)",
  "execute(uint256[],uint256[],uint256)", "liquidate(uint256[],uint256[],uint256)", "skim()", "payQueue(uint256)",
].map((s) => [s.split("(")[0], sel(s)]));
const strip = (h) => String(h || "").replace(/^0x/, "");
const w = (v) => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, "0");
const wa = (a) => strip(a).toLowerCase().padStart(64, "0");
const W = (h, i) => { const s = strip(h).slice(i * 64, i * 64 + 64); return s ? BigInt("0x" + s) : 0n; };
const A = (h, i) => "0x" + strip(h).slice(i * 64 + 24, i * 64 + 64);
const call = (to, data) => ({ to, data: "0x" + data });
const usd = (x) => Number(x) / 1e6, px8 = (x) => Number(x) / 1e8;
const arr = (h) => { const n = Number(W(h, 1)); return [...Array(n).keys()].map((i) => Number(W(h, 2 + i))); };
const encArrs = (a, b, t) => { const n = a.length; return w(96) + w(96 + 32 * (n + 1)) + w(t) + w(n) + a.map(w).join("") + w(n) + b.map(w).join(""); };

export const CFG = {
  address: () => { const e = env("PERP_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : isAddr(PERP_DEFAULT) ? lc(PERP_DEFAULT) : null; },
  keeperKey: () => env("PERP_KEEPER_KEY") || env("PREDICT_KEEPER_KEY") || env("ORDERS_KEEPER_KEY") || null,
  rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  prices: () => paper.prices(), // { BTC, ETH, SOL } — Hyperliquid mids (Coinbase as the fallback)
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Math.floor(Date.now() / 1000),
  every: 5000,
};
let ch = null;
export function configure(o) { Object.assign(CFG, o); ch = null; }
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: Number(env("PERP_CHAIN_ID")) || 5042 }));

function decMarket(id, h) {
  // the struct has a string, so it comes as an offset: tuple at word 1, its string at 1 + offset/32
  const b = 1, off = Number(W(h, b)) / 32, nameLen = Number(W(h, b + off));
  const name = Buffer.from(strip(h).slice((b + off + 1) * 64, (b + off + 1) * 64 + nameLen * 2), "hex").toString("utf8");
  return { id, name, feed: lc(A(h, b + 1)), enabled: W(h, b + 3) === 1n, maxLev: Number(W(h, b + 4)), maxSize: usd(W(h, b + 5)), maxOiLong: usd(W(h, b + 6)), maxOiShort: usd(W(h, b + 7)), oiLong: usd(W(h, b + 8)), oiShort: usd(W(h, b + 9)) };
}
const decPos = (id, h) => ({ id, owner: lc(A(h, 0)), market: Number(W(h, 1)), isLong: W(h, 2) === 1n, collateral: usd(W(h, 3)), size: usd(W(h, 4)), sizeRaw: W(h, 4), entry: px8(W(h, 5)), openedAt: Number(W(h, 6)), cap: usd(W(h, 8)) });
const decOrder = (id, h) => ({ id, owner: lc(A(h, 0)), kind: Number(W(h, 1)) === 1 ? "open" : "close", market: Number(W(h, 2)), isLong: W(h, 3) === 1n, done: W(h, 4) === 1n,
  collateral: usd(W(h, 5)), size: usd(W(h, 6)), acceptable: px8(W(h, 7)), at: Number(W(h, 8)), block: Number(W(h, 9)), position: Number(W(h, 10)) });

async function head(addr) {
  const keys = ["marketCount", "poolAmount", "reserved", "totalShares", "sharePrice", "owedTotal", "queueLength", "paused", "lpOpen", "openFeeBps", "closeFeeBps", "borrowBpsPerHour", "maintBps", "maxDevBps", "maxProfitBps", "maxUtilBps", "execFee", "minCollateral", "hwm", "skimBps", "orderCount", "positionCount"];
  const r = await chain().ethCalls(keys.map((k) => call(addr, S[k])));
  if (r[0] == null) throw new Error("Arc's RPC didn't answer");
  return Object.fromEntries(keys.map((k, i) => [k, W(r[i], 0)]));
}
async function markets(addr, n) {
  const ids = [...Array(n).keys()];
  const r = await chain().ethCalls(ids.flatMap((i) => [call(addr, S.market + w(i)), call(addr, S.feedPrice + w(i))]));
  return ids.map((i) => ({ ...decMarket(i, r[i * 2]), chainlink: r[i * 2 + 1] ? px8(W(r[i * 2 + 1], 0)) : null, chainlinkAt: r[i * 2 + 1] ? Number(W(r[i * 2 + 1], 1)) : null }));
}

/// everything the page shows
export async function state({ user = "" } = {}) {
  const addr = CFG.address();
  if (!addr) return { live: false };
  const [g, px] = await Promise.all([head(addr), CFG.prices().catch(() => ({}))]);
  const ms = await markets(addr, Number(g.marketCount));
  const out = {
    live: true, address: addr, paused: g.paused === 1n, lpOpen: g.lpOpen === 1n,
    pool: { amount: usd(g.poolAmount), reserved: usd(g.reserved), shares: Number(g.totalShares) / 1e18, sharePrice: Number(g.sharePrice) / 1e18, hwm: Number(g.hwm) / 1e18, owed: usd(g.owedTotal), queue: Number(g.queueLength), util: g.poolAmount > 0n ? Number((g.reserved * 10000n) / g.poolAmount) / 100 : 0 },
    fees: { openBps: Number(g.openFeeBps), closeBps: Number(g.closeFeeBps), borrowBpsH: Number(g.borrowBpsPerHour), exec: usd(g.execFee) },
    risk: { maintBps: Number(g.maintBps), maxDevBps: Number(g.maxDevBps), maxProfitBps: Number(g.maxProfitBps), maxUtilBps: Number(g.maxUtilBps), minCollateral: usd(g.minCollateral), skimBps: Number(g.skimBps) },
    markets: ms.map((m) => ({ ...m, price: px[m.name] || null, src: px.src || null })), me: null,
  };
  if (isAddr(user)) {
    const u = lc(user);
    const [pids, oids, sh] = await chain().ethCalls([call(addr, S.positionsOf + wa(u)), call(addr, S.ordersOf + wa(u)), call(addr, S.shares + wa(u))]);
    const P = pids ? arr(pids).slice(-30) : [], O = oids ? arr(oids).slice(-20) : [];
    const r = await chain().ethCalls([...P.flatMap((id) => [call(addr, S.position + w(id)), call(addr, S.liqPrice + w(id)), call(addr, S.borrowFee + w(id))]), ...O.map((id) => call(addr, S.order + w(id)))]);
    const positions = P.map((id, i) => {
      const p = decPos(id, r[i * 3]);
      if (!p.size) return null;
      const m = out.markets[p.market] || {}, x = m.price;
      const pnlRaw = x ? p.size * (x / p.entry - 1) * (p.isLong ? 1 : -1) : null;
      const pnl = pnlRaw == null ? null : Math.min(pnlRaw, p.cap);
      return { ...p, sizeRaw: undefined, name: m.name, mark: x, pnl, roe: pnl == null ? null : (pnl / p.collateral) * 100, liq: px8(W(r[i * 3 + 1], 0)), borrowFee: usd(W(r[i * 3 + 2], 0)) };
    }).filter(Boolean).reverse();
    const orders = O.map((id, i) => decOrder(id, r[P.length * 3 + i])).filter((o) => !o.done).map((o) => ({ ...o, name: (out.markets[o.market] || {}).name, cancelAt: o.at + 180 }));
    out.me = { positions, orders, shares: sh ? Number(W(sh, 0)) / 1e18 : 0, lpValue: sh ? (Number(W(sh, 0)) / 1e18) * out.pool.sharePrice : 0 };
  }
  return out;
}

/// the keeper
export async function tick({ budgetMs = 45000, store = null } = {}) {
  const t0 = Date.now(), addr = CFG.address(), key = CFG.keeperKey();
  if (!addr) return { skipped: "no contract" };
  if (!key) return { skipped: "no keeper key" };
  const me = lc(addressOfKey(key));
  const [isK] = await chain().ethCalls([call(addr, S.keeper + wa(me))]);
  if (!isK || W(isK, 0) !== 1n) return { skipped: "the keeper key isn't one of the contract's keepers" };
  const st = (store && (await store.get("perp/status").catch(() => null))) || { cursor: 1, open: [], posSeen: 0 };
  const out = { rounds: 0, executed: 0, liquidated: 0, txs: [] };
  const send = async (data, kind) => { const r = await chain().sendTx({ to: addr, data: "0x" + data, key }).catch((e) => ({ ok: false, err: String((e && e.message) || e).slice(0, 160) })); out.txs.push({ kind, ok: r.ok, hash: r.hash || null, err: r.err }); return r; };
  while (Date.now() - t0 < budgetMs - 6000) {
    out.rounds++;
    const g = await head(addr);
    const ms = await markets(addr, Number(g.marketCount));
    const px = await CFG.prices().catch(() => ({}));
    const dev = Number(g.maxDevBps) * 0.9;
    // a market's keeper price, only when it sits inside the contract's band around Chainlink (else: wait)
    const priceOf = (m) => { const k = ms[m]; const x = k && px[k.name]; if (!(x > 0) || !k.chainlink) return null; return Math.abs(x / k.chainlink - 1) * 10000 <= dev ? BigInt(Math.round(x * 1e8)) : null; };
    const lb = await chain().latestBlock();
    // pending orders, from the cursor (the oldest one not done)
    const n = Number(g.orderCount), ids = [];
    for (let i = st.cursor; i <= n && ids.length < 60; i++) ids.push(i);
    const r = ids.length ? await chain().ethCalls(ids.map((id) => call(addr, S.order + w(id)))) : [];
    const pend = ids.map((id, i) => decOrder(id, r[i])).filter((o) => !o.done && o.owner !== "0x0000000000000000000000000000000000000000");
    st.cursor = pend.length ? pend[0].id : n + 1;
    const ready = pend.filter((o) => o.block < lb.number && priceOf(o.market) != null && o.at <= lb.ts);
    if (ready.length) {
      const x = await send(S.execute + encArrs(ready.map((o) => o.id), ready.map((o) => priceOf(o.market)), lb.ts), "execute");
      if (x.ok) out.executed += ready.length;
    }
    // open positions: new ones since last time, then the ones still open
    const pc = Number(g.positionCount);
    for (let i = (st.posSeen || 0) + 1; i <= pc; i++) st.open.push(i);
    st.posSeen = pc;
    if (st.open.length) {
      const pr = await chain().ethCalls(st.open.map((id) => call(addr, S.position + w(id))));
      const live = st.open.map((id, i) => decPos(id, pr[i])).filter((p) => p.size > 0);
      st.open = live.map((p) => p.id);
      const chk = live.filter((p) => priceOf(p.market) != null);
      const lq = chk.length ? await chain().ethCalls(chk.map((p) => call(addr, S.liquidatable + w(p.id) + w(priceOf(p.market))))) : [];
      const bad = chk.filter((p, i) => lq[i] && W(lq[i], 0) === 1n);
      if (bad.length) {
        const blk = await chain().latestBlock();
        const x = await send(S.liquidate + encArrs(bad.map((p) => p.id), bad.map((p) => priceOf(p.market)), blk.ts), "liquidate");
        if (x.ok) out.liquidated += bad.length;
      }
    }
    // once a day: the pool's gains over its mark → the fee burn and veARCIRCLE
    if (CFG.now() - (st.skimAt || 0) > 86400) { st.skimAt = CFG.now(); await send(S.skim, "skim"); }
    if (Date.now() - t0 > budgetMs - 6000 - CFG.every) break;
    await CFG.sleep(CFG.every);
  }
  st.at = CFG.now(); st.keeper = me;
  st.error = out.txs.filter((x) => !x.ok).map((x) => `${x.kind}: ${x.err || "failed"}`)[0] || null;
  if (store) await store.set("perp/status", st).catch(() => null);
  return out;
}
export const _test = { decMarket, decPos, decOrder, encArrs, S };
