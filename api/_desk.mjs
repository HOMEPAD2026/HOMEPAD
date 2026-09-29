// api/_desk.mjs — ARCIA DESK: ARCIA's own trading desk on Arc (ARCIRCLE PAD).
// It only trades NEW coins launched on Argus (Uniswap v4 pools paired with USDC, Argus hooks),
// with its own money in the ArciaDesk contract (contracts/contracts/ArciaDesk.sol), and learns
// from every trade (the decisions and the learning are api/_desk-brain.mjs; this file is the IO).
//
// Every minute (GET /api/desk?tick=1&key=<CRON_SECRET>, from cron-job.org):
//   1. discover   PoolManager Initialize logs → USDC pools whose hook has the Argus permission bits,
//                 confirmed Argus by a log from a known Argus Portal in the launch transaction
//   2. read       on-chain swaps per pool (buys / sells / volume / price per minute), Dexscreener
//                 (liquidity, market cap, socials), Token Scanner v3 (score, critical flags, holders, taxes)
//   3. exits      real positions valued by an exact sell quote from the desk contract (hook taxes and
//                 price impact included); take-profit / stop-loss / trailing / time / emergency
//   4. entries    every playbook trigger that passes the hard gates opens a PAPER trade; the policy
//                 picks which also become REAL trades (small, capped, a few an hour)
//   5. learn      each close trains the model, the playbook stats and the exit tuner
//   The first tick of a UTC day instead runs the daily job: tune the exits, burn a share of new
//   profit as $ARCIRCLE (buyAndBurn → 0x…dEaD), write ARCIA's journal.
//
// Env (Vercel): ARCIA_DESK_ADDRESS (the contract), ARCIA_DESK_KEY (the trader wallet = the desk's
// operator; Sensitive). Without them the desk runs on paper only. Optional: ARCIA_DESK_BURN_PCT
// (default 20), ARCIA_DESK_TRADE_ARCPAD=1 (also trade coins launched through ArcPad's own Argus
// flow — off: the platform earns fees on those), ARCIA_DESK_TG_CHAT (rug alarms and the journal).
// Claude (api/_desk-ai.mjs, ANTHROPIC_API_KEY): a veto-only review before each real buy and a written review of bad
// losses; ARCIA_DESK_MODEL picks the model (default claude-opus-5-5, falling back to claude-opus-5), ARCIA_DESK_AI=0 turns it off.
// No command, message or page can make it trade: only this schedule and these rules.
import { rpc, rpcCall, getLogs, latestBlock, toQty, ethCalls, isAddr, pad, strip, keccakHex, PM_ADDRESS, TOPIC as ARC_TOPIC } from "./_arc.mjs";
import { sendTx, addressOfKey, USDC } from "./_x402.mjs";
import { ARCIRCLE_TOKEN, ARCIRCLE_POOL_ID, ARGUS_PORTALS, ARGUS_POOL_FEE, ARGUS_POOL_FEE_DYNAMIC, ARGUS_TICK_SPACING } from "./_arcircle.mjs";
import { REGISTRY, decodeSplit, platformShare } from "./_argus-arcpad.mjs";
import * as B from "./_desk-brain.mjs";
import * as AI from "./_desk-ai.mjs";

export const DESK_VERSION = 1;
const lc = (a) => String(a || "").toLowerCase();
const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const r2 = (n, d = 2) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const dayOf = (s) => new Date(s * 1000).toISOString().slice(0, 10);
const W = (h, i) => BigInt("0x" + (strip(h).slice(i * 64, i * 64 + 64) || "0"));
const wA = (h, i) => "0x" + strip(h).slice(i * 64 + 24, i * 64 + 64).toLowerCase();

// ---------------------------------------------------------------- config (tests swap the addresses)
export const CFG = {
  pm: lc(PM_ADDRESS), usdc: lc(USDC), arcircle: lc(ARCIRCLE_TOKEN), arcPoolId: lc(ARCIRCLE_POOL_ID),
  portals: ARGUS_PORTALS.map(lc), registry: lc(REGISTRY), hookPatterns: [0x2044, 0x20cc],
  desk: () => (isAddr(env("ARCIA_DESK_ADDRESS")) ? lc(env("ARCIA_DESK_ADDRESS")) : null),
  key: () => env("ARCIA_DESK_KEY") || null,
  tradeOwn: () => env("ARCIA_DESK_TRADE_ARCPAD") === "1",
  burnPct: () => { const n = Number(env("ARCIA_DESK_BURN_PCT")); return env("ARCIA_DESK_BURN_PCT") !== "" && n >= 0 && n <= 50 ? n : B.RISK.burnPct; },
  tgChat: () => env("ARCIA_DESK_TG_CHAT"),
  budgetMs: 52000,
};
export function configure(o) { Object.assign(CFG, o); }

// ---------------------------------------------------------------- ABI
const hexOf = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
const sig = (s) => keccakHex(hexOf(s));
const sel = (s) => sig(s).slice(0, 10);
const KT = "(address,address,uint24,int24,address)";
const SEL = {
  quote: sel(`quote(${KT},bool,uint256)`), rt: sel(`quoteRoundTrip(${KT},uint256)`), buy: sel(`buy(${KT},uint256,uint256)`),
  sell: sel(`sell(${KT},uint256,uint256)`), burn: sel(`buyAndBurn(${KT},uint256,uint256)`),
  paused: sel("paused()"), maxTrade: sel("maxTrade()"), dailyCap: sel("dailyCap()"), spent: sel("spentToday()"), day: sel("day()"),
  burnCap: sel("burnCap()"), burnSpent: sel("burnSpentToday()"), operator: sel("operator()"),
  balanceOf: sel("balanceOf(address)"), decimals: "0x313ce567", symbol: "0x95d89b41", totalSupply: "0x18160ddd",
  extsload: "0x1e2eaeaf", launches: sel("launches(address)"), payoutSplit: sel("payoutSplit(address)"),
};
const ERR = { quote: sel("QuoteResult(uint256)"), rt: sel("RoundTripResult(uint256,uint256)"), slip: sel("Slippage(uint256,uint256)") };
const TOPIC = {
  init: sig("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"), swap: ARC_TOPIC.swap,
  trade: sig("Trade(address,bool,uint256,uint256)"), burned: sig("Burned(uint256,uint256)"),
  meta: sig("LaunchMetadata(address,string,string,string,string,string)"),
};
const i24 = (n) => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, "0");
const u = (n) => BigInt(n).toString(16).padStart(64, "0");
export const encKey = (k) => pad(k.c0) + pad(k.c1) + u(k.fee) + i24(k.ts) + pad(k.hooks);
export const poolIdOfKey = (k) => lc(keccakHex(encKey(k)));
const hookOk = (h) => CFG.hookPatterns.includes(Number(BigInt(h) & 0x3fffn));

// ---------------------------------------------------------------- chain helpers
const revertData = (e) => {
  if (!e) return null;
  const d = typeof e.data === "string" ? e.data : e.data && (e.data.data || e.data.result);
  if (typeof d === "string" && /^0x[0-9a-fA-F]*$/.test(d)) return d;
  const m = String(e.message || "").match(/0x[0-9a-fA-F]{8,}/);
  return m ? m[0] : null;
};
/// eth_calls that are expected to revert (the desk's quotes) → [{ ok, data }]
async function callsRaw(calls) {
  if (!calls.length) return [];
  const out = [];
  for (let i = 0; i < calls.length; i += 40) {
    const part = calls.slice(i, i + 40);
    const body = part.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] }));
    let res;
    try { res = await rpc(body, { timeoutMs: 9000 }); } catch { res = []; }
    const by = new Map((Array.isArray(res) ? res : [res]).map((x) => [x && x.id, x]));
    part.forEach((_, k) => { const x = by.get(k); out.push(!x ? { ok: false, data: null } : x.error ? { ok: false, data: revertData(x.error) } : { ok: true, data: x.result }); });
  }
  return out;
}
function decodeQuote(r) {
  if (!r || !r.data) return null;
  const h = lc(r.data);
  if (h.startsWith(ERR.quote)) return W(h.slice(10), 0);
  return null;
}
function decodeRt(r) {
  if (!r || !r.data) return null;
  const h = lc(r.data);
  if (h.startsWith(ERR.rt)) return [W(h.slice(10), 0), W(h.slice(10), 1)];
  return null;
}
const quoteCall = (desk, k, isBuy, amt) => ({ to: desk, data: SEL.quote + encKey(k) + u(isBuy ? 1 : 0) + u(amt) });
const rtCall = (desk, k, amt) => ({ to: desk, data: SEL.rt + encKey(k) + u(amt) });
/// timestamps of blocks: exact for up to 40 of them, the rest interpolated from the latest block
async function blockTimes(nums, latest, spb) {
  const uniq = [...new Set(nums)];
  const out = new Map();
  const exact = uniq.slice(-40);
  if (exact.length) {
    try {
      const res = await rpc(exact.map((n, id) => ({ jsonrpc: "2.0", id, method: "eth_getBlockByNumber", params: [toQty(n), false] })), { timeoutMs: 8000 });
      for (const x of Array.isArray(res) ? res : [res]) if (x && x.result) out.set(parseInt(x.result.number, 16), parseInt(x.result.timestamp, 16));
    } catch { /* interpolate */ }
  }
  for (const n of uniq) if (!out.has(n)) out.set(n, Math.round(latest.ts - (latest.number - n) * spb));
  return out;
}
const priceOf = (sqrtP, tokenIs0, dec) => {
  const p = Number(sqrtP) / 2 ** 96, raw = p * p;
  if (!(raw > 0)) return null;
  const scale = 10 ** (dec - 6);
  return tokenIs0 ? raw * scale : scale / raw; // USD per whole token
};
const human = (raw, dec) => Number(BigInt(raw)) / 10 ** dec;

// ---------------------------------------------------------------- storage
const K = {
  state: "desk/state", cands: "desk/cands", paper: "desk/paper", ghosts: "desk/ghosts", log: "desk/log", recent: "desk/recent",
  rejects: "desk/rejects", equity: "desk/equity", journal: "desk/journal", burns: "desk/burns", reviews: "desk/reviews", closed: (d) => `desk/closed-${d}`,
};
const mem = new Map(); // no store: one instance's memory (paper runs and tests)
function memStore() { return { get: async (k) => mem.get(k) || null, getMany: async (ks) => Object.fromEntries(ks.map((k) => [k, mem.get(k) || null])), set: async (k, v) => { mem.set(k, JSON.parse(JSON.stringify(v))); } }; }
const pack = (o) => ({ j: JSON.stringify(o) }); // one string field: Firestore stays simple and nested arrays survive
const unpack = (d) => { if (!d) return null; if (typeof d.j === "string") { try { return JSON.parse(d.j); } catch { return null; } } return d; };
async function load(st, keys) { const r = await st.getMany(keys); return keys.map((k) => unpack(r[k])); }
const save = (st, k, v) => st.set(k, pack(v));

export function newState() {
  return { v: DESK_VERSION, hi: 0, swHi: 0, spb: 0.5, spbAt: 0, cash: null, netIn: 0, burnedUsd: 0, burnedTok: 0, hwm: 0, day: null, dayStartEq: null,
    stats: { realClosed: 0, realWins: 0, realSum: 0, realPnl: 0, paperClosed: 0, paperWins: 0, paperSum: 0, best: null, worst: null },
    learn: B.newLearn(), open: [], buys: [], flows: [], cool: {}, arcKey: null, eq: null, eqAt: 0, lastTick: 0, busy: 0, notes: [], seq: 0 };
}

// ---------------------------------------------------------------- 1. discovery
async function discover(S, C, latest, left) {
  const CH = 9000;
  if (!S.hi) S.hi = Math.max(0, latest.number - Math.ceil((B.GATES.maxAgeMin * 60) / S.spb));
  const found = [];
  while (S.hi < latest.number && left() > 30000) {
    const ranges = []; let a = S.hi + 1;
    for (let k = 0; k < 8 && a <= latest.number; k++) { const b = Math.min(latest.number, a + CH - 1); ranges.push([a, b]); a = b + 1; }
    let logs;
    try { logs = (await Promise.all(ranges.map(([x, y]) => getLogs({ address: CFG.pm, topics: [TOPIC.init], fromBlock: toQty(x), toBlock: toQty(y) }, 2)))).flat(); S.discErr = null; } catch (e) {
      S.discErr = String((e && e.message) || e).slice(0, 160);
      // the node has pruned logs that old: skip half of what's left and try again (older launches are past the gates anyway)
      if (/prun|history|not available|too old|missing/i.test(S.discErr) && S.hi < latest.number - 1) { S.hi = Math.min(latest.number - 1, S.hi + Math.max(CH, Math.ceil((latest.number - S.hi) / 2))); continue; }
      break;
    }
    for (const l of logs) {
      const c0 = "0x" + strip(l.topics[2]).slice(24), c1 = "0x" + strip(l.topics[3]).slice(24);
      const hooks = wA(l.data, 2);
      if (c0 === "0x" + "0".repeat(40) || (c0 !== CFG.usdc && c1 !== CFG.usdc) || !hookOk(hooks)) continue;
      const t = c0 === CFG.usdc ? c1 : c0;
      if (t === CFG.arcircle || C[t]) continue;
      const fee = Number(W(l.data, 0)), ts = Number(BigInt.asIntN(24, W(l.data, 1)));
      C[t] = { t, id: lc(l.topics[1]), k: { c0, c1, fee, ts, hooks }, t0: c0 === t, b: parseInt(l.blockNumber, 16), tx: lc(l.transactionHash), ok: null, bk: [], hi: 0, sq0: W(l.data, 3).toString() };
      found.push(t);
    }
    S.hi = ranges[ranges.length - 1][1];
  }
  // confirm Argus (a log from a known Portal in the launch tx), read decimals / symbol / supply / ArcPad share
  const pend = Object.values(C).filter((c) => c.ok == null).slice(0, 10);
  if (pend.length && left() > 25000) {
    const rcs = await Promise.all(pend.map((c) => rpcCall("eth_getTransactionReceipt", [c.tx]).catch(() => null)));
    const meta = await ethCalls(pend.flatMap((c) => [{ to: c.t, data: SEL.decimals }, { to: c.t, data: SEL.symbol }, { to: c.t, data: SEL.totalSupply }, { to: CFG.registry, data: SEL.payoutSplit + pad(c.t) }])).catch(() => []);
    const times = await blockTimes(pend.map((c) => c.b), latest, S.spb);
    pend.forEach((c, i) => {
      const rc = rcs[i];
      if (!rc) { c.tries = (c.tries || 0) + 1; if (c.tries > 5) c.ok = 0; c.ts = c.ts || latest.ts; return; }
      c.ok = (rc.logs || []).some((l) => CFG.portals.includes(lc(l.address))) ? 1 : 0;
      // the creator's own links, from Argus's LaunchMetadata event (image, website, X, Telegram, description)
      const M = (rc.logs || []).find((l) => l.topics[0] === TOPIC.meta && "0x" + strip(l.topics[1]).slice(24) === c.t);
      if (M) c.meta = { web: strAt(M.data, 1), x: strAt(M.data, 2), tg: strAt(M.data, 3) };
      const d = meta[4 * i], s = meta[4 * i + 1], sup = meta[4 * i + 2], sp = meta[4 * i + 3];
      c.dec = d ? Number(BigInt(d)) : 18;
      c.sym = symOf(s) || "?";
      c.sup = sup ? human(BigInt(sup), c.dec) : null;
      c.own = sp ? platformShare(decodeSplit(sp)) >= 3000 : false;
      c.ts = times.get(c.b) || latest.ts;
    });
  }
  // the launch floor (the pool's first price) — read back for pools found before it was kept
  const noFloor = Object.values(C).filter((c) => c.ok === 1 && !c.sq0 && !c.sq0Tried).slice(0, 8);
  if (noFloor.length && left() > 25000) {
    await Promise.all(noFloor.map(async (c) => {
      c.sq0Tried = 1;
      const logs = await getLogs({ address: CFG.pm, topics: [TOPIC.init, c.id], fromBlock: toQty(c.b), toBlock: toQty(c.b) }, 1).catch(() => []);
      if (logs && logs[0]) c.sq0 = W(logs[0].data, 3).toString();
    }));
  }
  for (const c of Object.values(C)) if (c.sq0 && c.dec != null && !c.floor) { const f = priceOf(BigInt(c.sq0), c.t0, c.dec); if (f) c.floor = f; }
  // forget what's too old (unless held)
  const held = new Set([...(S.open || []).map((p) => p.t)]);
  for (const [t, c] of Object.entries(C)) {
    if (c.ok === 0) { delete C[t]; continue; }
    if (!held.has(t) && c.ts && latest.ts - c.ts > B.GATES.maxAgeMin * 60 + 3600) delete C[t];
  }
  // keep the doc small: the 80 newest (and anything held)
  const all = Object.values(C).sort((a, b) => (b.b || 0) - (a.b || 0));
  for (const c of all.slice(80)) if (!held.has(c.t)) delete C[c.t];
  return found;
}
function strAt(hex, i) {
  try {
    const h = strip(hex), off = Number(BigInt("0x" + h.slice(i * 64, i * 64 + 64))) * 2;
    const len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2;
    return new TextDecoder().decode(Uint8Array.from(h.slice(off + 64, off + 64 + len).match(/../g) || [], (b) => parseInt(b, 16))).trim().slice(0, 200);
  } catch { return ""; }
}
/// website / X / Telegram, from Argus's launch metadata and Dexscreener's profile
function linksOf(c) {
  const out = { web: "", x: "", tg: "" };
  const put = (k, v) => { if (!out[k] && v && /^(https?:\/\/|@|t\.me|x\.com|twitter\.com|[\w.-]+\.[a-z]{2,})/i.test(String(v).trim())) out[k] = String(v).trim(); };
  if (c.meta) { put("web", c.meta.web); put("x", c.meta.x); put("tg", c.meta.tg); }
  if (c.dex && c.dex.links) { put("web", c.dex.links.web); put("x", c.dex.links.x); put("tg", c.dex.links.tg); }
  return out;
}
const normLink = (u) => String(u || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^twitter\.com/, "x.com");
function symOf(h) {
  try {
    const s = strip(h || "");
    if (s.length >= 128) { const off = Number(BigInt("0x" + s.slice(0, 64))) * 2, len = Number(BigInt("0x" + s.slice(off, off + 64))) * 2; return new TextDecoder().decode(Uint8Array.from(s.slice(off + 64, off + 64 + len).match(/../g) || [], (b) => parseInt(b, 16))).replace(/[^\x20-\x7e]/g, "").slice(0, 16); }
    if (s.length === 64) return new TextDecoder().decode(Uint8Array.from(s.match(/../g).filter((b) => b !== "00"), (b) => parseInt(b, 16))).replace(/[^\x20-\x7e]/g, "").slice(0, 16);
  } catch { /* none */ }
  return "";
}

// ---------------------------------------------------------------- 2. swaps → per-minute buckets
// bucket: "minute|buys|sells|volUsd|price"  (price = USD per token after the minute's last swap)
const parseBk = (s) => { const [m, b, x, v, p] = String(s).split("|"); return { m: +m, b: +b, s: +x, v: +v, p: +p }; };
const fmtBk = (o) => `${o.m}|${o.b}|${o.s}|${r2(o.v, 2)}|${o.p}`;
function applySwaps(c, logs, times) {
  const by = new Map((c.bk || []).map((s) => { const o = parseBk(s); return [o.m, o]; }));
  const usdcIs0 = c.k.c0 === CFG.usdc;
  for (const l of logs) {
    const a0 = BigInt.asIntN(128, W(l.data, 0)), a1 = BigInt.asIntN(128, W(l.data, 1)), sq = W(l.data, 2), L = W(l.data, 3);
    const ud = usdcIs0 ? a0 : a1; // the swapper's side: negative = paid into the pool
    const m = Math.floor((times.get(parseInt(l.blockNumber, 16)) || 0) / 60);
    const o = by.get(m) || { m, b: 0, s: 0, v: 0, p: 0 };
    if (ud < 0n) o.b++; else o.s++;
    o.v += Math.abs(Number(ud)) / 1e6;
    const p = priceOf(sq, c.t0, c.dec || 18);
    if (p) { o.p = Number(p.toPrecision(6)); if (p > (c.hi || 0)) c.hi = p; c.px = p; c.L = L.toString(); c.sq = sq.toString(); }
    by.set(m, o);
  }
  c.bk = [...by.values()].sort((x, y) => x.m - y.m).slice(-120).map(fmtBk);
}
async function readSwaps(S, C, latest, left) {
  const H = Math.ceil(3600 / S.spb);
  if (!S.swHi) S.swHi = latest.number;
  const live = Object.values(C).filter((c) => c.ok === 1);
  // new ones: the last hour of their pool (or since launch)
  const fresh = live.filter((c) => !c.sw);
  for (let i = 0; i < fresh.length && left() > 25000; i += 20) {
    const part = fresh.slice(i, i + 20);
    const from = Math.max(Math.min(...part.map((c) => c.b)), S.swHi - H);
    try {
      const logs = await getLogs({ address: CFG.pm, topics: [TOPIC.swap, part.map((c) => c.id)], fromBlock: toQty(from), toBlock: toQty(S.swHi) }, 2);
      await route(logs, part, latest, S.spb);
      part.forEach((c) => { c.sw = 1; });
    } catch { break; }
  }
  // everyone: what's new since the last tick
  const known = live.filter((c) => c.sw);
  if (known.length && latest.number > S.swHi) {
    const from = Math.max(S.swHi + 1, latest.number - 9000);
    try {
      const all = [];
      for (let i = 0; i < known.length; i += 20) all.push(...(await getLogs({ address: CFG.pm, topics: [TOPIC.swap, known.slice(i, i + 20).map((c) => c.id)], fromBlock: toQty(from), toBlock: toQty(latest.number) }, 2)));
      await route(all, known, latest, S.spb);
      S.swHi = latest.number;
    } catch { /* next tick picks up from swHi */ }
  } else if (!known.length) S.swHi = latest.number;
}
async function route(logs, cands, latest, spb) {
  if (!logs.length) return;
  const byId = new Map(cands.map((c) => [c.id, c]));
  const times = await blockTimes(logs.map((l) => parseInt(l.blockNumber, 16)), latest, spb);
  const groups = new Map();
  for (const l of logs) { const c = byId.get(lc(l.topics[1])); if (c) { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(l); } }
  for (const [c, ls] of groups) { ls.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16)); applySwaps(c, ls, times); }
}
/// current prices from slot0 (extsload of the pool's state slot)
async function readPrices(list) {
  if (!list.length) return;
  const r = await ethCalls(list.map((c) => ({ to: CFG.pm, data: SEL.extsload + strip(keccakHex(strip(c.id) + pad("6"))) }))).catch(() => []);
  list.forEach((c, i) => {
    if (!r[i]) return;
    const sq = BigInt(r[i]) & ((1n << 160n) - 1n);
    const p = sq > 0n ? priceOf(sq, c.t0, c.dec || 18) : null;
    if (p) { c.px = p; c.sq = sq.toString(); if (p > (c.hi || 0)) c.hi = p; }
  });
}

// ---------------------------------------------------------------- Dexscreener (liquidity, market cap, socials)
async function readDex(list, fetchJson) {
  for (let i = 0; i < list.length; i += 30) {
    const part = list.slice(i, i + 30);
    const j = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${part.map((c) => c.t).join(",")}`, 8000).catch(() => null);
    if (!j || !Array.isArray(j.pairs)) continue;
    for (const c of part) {
      const ps = j.pairs.filter((p) => p && p.chainId === "arc" && [lc(p.baseToken && p.baseToken.address), lc(p.quoteToken && p.quoteToken.address)].includes(c.t));
      if (!ps.length) continue;
      const p = ps.find((x) => lc(x.pairAddress) === c.id) || ps.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
      const info = p.info || {};
      c.dex = { liq: (p.liquidity && Number(p.liquidity.usd)) || null, mcap: Number(p.marketCap || p.fdv || 0) || null, chgM5: p.priceChange ? p.priceChange.m5 ?? null : null,
        chgH1: p.priceChange ? p.priceChange.h1 ?? null : null, soc: ((info.socials || []).length + (info.websites || []).length) > 0, img: /^https:\/\//.test(info.imageUrl || "") ? info.imageUrl : null, at: Date.now(),
        boosts: (p.boosts && p.boosts.active) || 0, links: dexLinks(info) };
    }
  }
}

function dexLinks(info) {
  const l = { web: "", x: "", tg: "" };
  const web = (info.websites || [])[0]; if (web) l.web = web.url || "";
  for (const s of info.socials || []) {
    const kind = String(s.type || s.platform || "").toLowerCase(), url = s.url || (s.handle ? String(s.handle) : "");
    if (!l.x && (kind === "twitter" || kind === "x" || /x\.com|twitter\.com/i.test(url))) l.x = kind === "twitter" && s.handle && !s.url ? `https://x.com/${s.handle}` : url;
    if (!l.tg && (kind === "telegram" || /t\.me\//i.test(url))) l.tg = kind === "telegram" && s.handle && !s.url ? `https://t.me/${s.handle}` : url;
  }
  return l;
}
/// Dexscreener "Dex paid": the newest token profiles (one call), then the orders of a few tokens a tick
async function readPaid(C, liveC, fetchJson, nowS, left) {
  const byT = new Map(liveC.map((c) => [c.t, c]));
  const mark = (c, at) => {
    if (c.paid) return;
    const m = Math.floor(at / 60), p = priceAt(series(c), m) || c.px || null;
    c.paid = { at, px: p };
  };
  const prof = await fetchJson("https://api.dexscreener.com/token-profiles/latest/v1", 6000).catch(() => null);
  for (const x of Array.isArray(prof) ? prof : []) { const c = x && x.chainId === "arc" && byT.get(lc(x.tokenAddress)); if (c) mark(c, nowS); }
  const due = liveC.filter((c) => !c.paid && (!c.ordAt || nowS - c.ordAt > 600)).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 8);
  if (!due.length || left() < 24000) return;
  await Promise.all(due.map(async (c) => {
    c.ordAt = nowS;
    const j = await fetchJson(`https://api.dexscreener.com/orders/v1/arc/${c.t}`, 6000).catch(() => null);
    const list = Array.isArray(j) ? j : j && Array.isArray(j.orders) ? j.orders : [];
    const o = list.find((x) => x && x.type === "tokenProfile" && x.status === "approved");
    if (o) mark(c, o.paymentTimestamp ? Math.floor(Number(o.paymentTimestamp) / (o.paymentTimestamp > 1e12 ? 1000 : 1)) : nowS);
  }));
}

// ---------------------------------------------------------------- Token Scanner v3
function scanSummary(out) {
  const r = out.res;
  if (!r || r.notToken) return { notToken: true };
  const d = r.dist || {};
  let tax = 0;
  try { const f = out.core.feesOf(r, out.x || {}, out.sim); tax = (f.buyTax || 0) + (f.sellTax || 0); } catch { tax = 0; }
  let dump = null;
  try { const st = out.core.stressOf(r); const t10 = st && st.items.find((i) => i.k === "top10"); if (t10 && t10.drop != null) dump = r2(t10.drop, 1); } catch { dump = null; }
  return { score: r.score, dump, crit: (r.critical || []).map((x) => x.title).slice(0, 3), top10: d.S ? r2((d.top10 / d.S) * 100, 1) : null, sn: d.early ? r2(d.early.heldPct || 0, 1) : 0,
    lk: d.clusters && d.clusters[0] ? r2(d.clusters[0].pct, 1) : 0, tax: r2(tax, 2), hold: d.holders || null, sT: r.sub && r.sub.trade ? r.sub.trade.score : null, sH: r.sub && r.sub.holders ? r.sub.holders.score : null };
}
async function defaultScan(t, st) {
  const [scanner, core] = await Promise.all([import("./_scan.mjs"), import("./_scan-core.mjs")]);
  const out = await scanner.scanToken(t, { store: st, budgetMs: 5500 });
  scanner.rememberScore(t, out, { store: st }).catch(() => null);
  return scanSummary({ ...out, core });
}

// ---------------------------------------------------------------- features
function series(c) { return (c.bk || []).map(parseBk); }
function priceAt(bk, m) { let p = null; for (const o of bk) { if (o.m <= m && o.p) p = o.p; } return p; }
export function featuresOf(c, nowS) {
  const bk = series(c), m = Math.floor(nowS / 60);
  const sum = (from) => bk.filter((o) => o.m > m - from).reduce((a, o) => ({ b: a.b + o.b, s: a.s + o.s, v: a.v + o.v }), { b: 0, s: 0, v: 0 });
  const m5 = sum(5), h1 = sum(60);
  const px = c.px || (bk.length ? bk[bk.length - 1].p : null);
  // no trade before that minute → the price was still the launch price (the floor), if it launched before it
  const ch = (mins) => { const p0 = priceAt(bk, m - mins) || (c.floor && c.ts && c.ts <= (m - mins) * 60 && (!bk.length || bk[0].m > m - mins) ? c.floor : null); return p0 && px ? (px / p0 - 1) * 100 : null; };
  // liquidity: Dexscreener's; else the pool's in-range USDC depth (virtual, an upper bound — the round-trip quote is the real test)
  let liq = c.dex && c.dex.liq;
  if (!liq && c.L && c.sq) {
    const L = Number(c.L), sp = Number(c.sq) / 2 ** 96;
    const usdcRaw = c.k.c0 === CFG.usdc ? L / sp : L * sp;
    liq = (2 * usdcRaw) / 1e6;
  }
  const sc = c.scan || {};
  return {
    ageMin: c.ts ? (nowS - c.ts) / 60 : 0, liq: liq || 0, mcap: (c.dex && c.dex.mcap) || (px && c.sup ? px * c.sup : 0),
    volLiqH1: liq ? h1.v / liq : 0, flowM5: (m5.b - m5.s) / (m5.b + m5.s + 1), flowH1: (h1.b - h1.s) / (h1.b + h1.s + 1),
    buysM5: m5.b, sellsM5: m5.s, txH1: h1.b + h1.s, volH1: h1.v,
    chgM5: ch(5) ?? (c.dex && c.dex.chgM5) ?? 0, chgH1: ch(60) ?? (c.dex && c.dex.chgH1) ?? 0, mom15: ch(15) ?? ch(5) ?? 0,
    ddHigh: px && c.hi ? (px / c.hi - 1) * 100 : 0,
    score: sc.score ?? null, top10: sc.top10 ?? null, snipersPct: sc.sn ?? 0, linkedPct: sc.lk ?? 0, tax: sc.tax ?? 0, holders: sc.hold ?? null,
    social: !!(c.dex && c.dex.soc) || !!(c.meta && (c.meta.web || c.meta.x || c.meta.tg)), secTrade: sc.sT ?? null, secHolders: sc.sH ?? null, rtLoss: c.rt ? c.rt.loss : null, quoteFailed: !!(c.rt && c.rt.fail), px,
    floorX: px && c.floor ? px / c.floor : null, floorDrop: px && c.floor ? Math.max(0, (1 - c.floor / px) * 100) : null, dumpTop10: sc.dump ?? null,
    socialCount: (() => { const l = linksOf(c); return (l.web ? 1 : 0) + (l.x ? 1 : 0) + (l.tg ? 1 : 0); })(), reused: !!c.reused,
    dexPaid: !!c.paid, dexPaidMin: c.paid ? (nowS - c.paid.at) / 60 : null, chgSincePaid: c.paid && c.paid.px && px ? (px / c.paid.px - 1) * 100 : null,
  };
}
const round3 = (x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));

// ---------------------------------------------------------------- the desk contract
async function deskInfo(desk, key, nowS) {
  const r = await ethCalls([
    { to: CFG.usdc, data: SEL.balanceOf + pad(desk) }, { to: desk, data: SEL.paused }, { to: desk, data: SEL.maxTrade }, { to: desk, data: SEL.dailyCap },
    { to: desk, data: SEL.spent }, { to: desk, data: SEL.day }, { to: desk, data: SEL.burnCap }, { to: desk, data: SEL.burnSpent }, { to: desk, data: SEL.operator },
  ]);
  if (!r[0] || !r[8]) return null;
  const n = (i) => (r[i] ? Number(BigInt(r[i])) : 0);
  const today = Math.floor((nowS || Date.now() / 1000) / 86400);
  const sameDay = n(5) === today;
  const op = wA(r[8], 0);
  return { cash: n(0) / 1e6, paused: n(1) === 1, maxTrade: n(2) / 1e6, dailyLeft: (n(3) - (sameDay ? n(4) : 0)) / 1e6, burnLeft: (n(6) - (sameDay ? n(7) : 0)) / 1e6,
    operator: op, operatorOk: !!key && addressOfKey(key) === op };
}
async function balancesOf(desk, tokens) {
  const r = await ethCalls(tokens.map((t) => ({ to: t, data: SEL.balanceOf + pad(desk) }))).catch(() => []);
  return tokens.map((_, i) => (r[i] ? BigInt(r[i]) : null));
}
function tradeLog(receipt, desk) {
  const l = (receipt && receipt.logs || []).find((x) => lc(x.address) === desk && x.topics[0] === TOPIC.trade);
  return l ? { amountIn: W(l.data, 0), amountOut: W(l.data, 1) } : null;
}
function burnLog(receipt, desk) {
  const l = (receipt && receipt.logs || []).find((x) => lc(x.address) === desk && x.topics[0] === TOPIC.burned);
  return l ? { usdcIn: W(l.data, 0), out: W(l.data, 1) } : null;
}

// ---------------------------------------------------------------- positions
const partsRet = (parts) => B.blended(parts);
function closeRecord(pos, c, nowS, why) {
  const ret = r2(partsRet(pos.parts), 2);
  const usdOut = pos.real ? pos.parts.reduce((t, p) => t + (p.usd || 0), 0) : null;
  const pnl = pos.real ? usdOut - pos.usdIn : (pos.usdIn * ret) / 100;
  return {
    id: pos.id, t: pos.t, sym: pos.sym, pb: pos.pb, real: !!pos.real, entryTs: pos.entryTs, exitTs: nowS, mins: Math.round((nowS - pos.entryTs) / 60),
    usdIn: r2(pos.usdIn), usdOut: usdOut == null ? null : r2(usdOut, 4), pnl: r2(pnl, 4), ret, why, parts: pos.parts.map((p) => ({ pct: p.pct, ret: r2(p.ret), why: p.why, ...(p.tx ? { tx: p.tx } : {}), ...(p.px ? { px: p.px } : {}), ...(p.ts ? { ts: p.ts } : {}) })),
    entryPx: pos.entryPx || null, exitPx: pos.parts.length ? pos.parts[pos.parts.length - 1].px || null : null, buyTx: pos.tx || null,
    up: pos.up || {}, dn: pos.dn || {}, final: ret, peak: r2(pos.peak), low: r2(pos.low), x: pos.x, p: r2(pos.p, 3), why0: pos.why0 || "", exits: pos.exits, day: dayOf(nowS), full: null,
    ...(pos.gate ? { gate: pos.gate } : {}), ...(pos.review ? { review: pos.review } : {}),
  };
}
function learnFrom(S, rec) {
  const L = S.learn, w = rec.real ? 1 : 0.5;
  if (rec.x) B.learn(L.model, rec.x, rec.ret > 0 ? 1 : 0, w);
  B.banditAdd(L.bandit, rec.pb, rec.ret, w, rec.real);
  const s = S.stats;
  if (rec.real) { s.realClosed++; if (rec.ret > 0) s.realWins++; s.realSum += rec.ret; s.realPnl = r2(s.realPnl + rec.pnl, 4); }
  else { s.paperClosed++; if (rec.ret > 0) s.paperWins++; s.paperSum += rec.ret; }
  if (s.best == null || rec.ret > s.best.ret) s.best = { ret: rec.ret, sym: rec.sym, real: rec.real };
  if (s.worst == null || rec.ret < s.worst.ret) s.worst = { ret: rec.ret, sym: rec.sym, real: rec.real };
}
/// a closed trade keeps being watched (on price) until 1.5× its playbook's time limit, so the exit tuner
/// sees what holding longer would have done — not only the path up to where it sold
function ghostOf(pos, rec, c) {
  const maxH = (B.PLAYBOOKS[pos.pb] && B.PLAYBOOKS[pos.pb].exits.maxH) || 6;
  const until = pos.entryTs + ((pos.peak || 0) >= 50 ? Math.max(maxH * 5400, 86400) : maxH * 5400); // big movers: watch a full day for the tail
  return { id: pos.id, day: rec.day, t: pos.t, p0: pos.p0, rt: pos.rt || 0, entryTs: pos.entryTs, until, up: { ...(pos.up || {}) }, dn: { ...(pos.dn || {}) }, last: rec.ret, real: !!pos.real, soldAt: rec.ret };
}
/// a paper position's net return at price px (with DCA tranches: their blended value)
const pret = (pos, px) => {
  if (!px || !pos.p0) return null;
  if (pos.tr && pos.tr.length) { const put = pos.tr.reduce((t, x) => t + x.usd, 0), val = pos.tr.reduce((t, x) => t + (x.usd * px) / x.px, 0); return ((val * (1 - (pos.rt || 0) / 100)) / put - 1) * 100; }
  return ((px / pos.p0) * (1 - (pos.rt || 0) / 100) - 1) * 100;
};

// ---------------------------------------------------------------- the tick
export async function tick(st, opts = {}) {
  st = st || memStore();
  const t0 = Date.now(), budget = opts.budgetMs || CFG.budgetMs, left = () => budget - (Date.now() - t0);
  const fetchJson = opts.fetchJson || (async (url, ms) => { const r = await fetch(url, { signal: AbortSignal.timeout(ms || 8000) }); return r.ok ? r.json() : null; });
  const scan = opts.scan || ((t) => defaultScan(t, opts.scanStore === undefined ? st : opts.scanStore));
  const notes = [];
  let [S, cd, pp, gh] = await load(st, [K.state, K.cands, K.paper, K.ghosts]);
  S = S && S.v === DESK_VERSION ? S : newState();
  B.ensureLearn(S.learn);
  if (S.busy && Date.now() - S.busy < 65e3 && !opts.force) return { skipped: "another tick is running" };
  S.busy = Date.now();
  await save(st, K.state, S);
  const C = (cd && cd.items) || {};
  const P = (pp && pp.open) || [];
  const G = (gh && gh.items) || [];
  const out = { discovered: 0, scanned: [], opened: [], closed: [], real: [], errors: [] };
  const log = [], closed = [], rejects = [];
  try {
    const latest = await latestBlock();
    const nowS = opts.now || latest.ts;
    if (!S.spbAt || nowS - S.spbAt > 3600) {
      try { const back = Math.max(0, latest.number - 20000), b = await rpcCall("eth_getBlockByNumber", [toQty(back), false]); const m = (latest.ts - parseInt(b.timestamp, 16)) / Math.max(1, latest.number - back); if (m > 0.05 && m < 20) S.spb = m; } catch { /* keep */ }
      S.spbAt = nowS;
    }
    const today = dayOf(nowS);
    const desk = CFG.desk(), key = CFG.key();
    let D = desk ? await deskInfo(desk, key, nowS).catch(() => null) : null;
    const live = !!(D && D.operatorOk);
    S.mode = live ? "live" : desk ? "paper (the desk key isn't the operator)" : "paper";
    if (desk && !D) S.mode = "paper (couldn't read the desk)";

    // ---- the daily job, on the first tick of a new UTC day
    if (S.day && S.day !== today && !opts.skipDaily) {
      // the day flips first, so a failure below can never run the burn twice
      const yday = S.day;
      S.day = today;
      await save(st, K.state, S);
      const r = await daily(st, S, { yday, nowS, D, live, desk, key, notes, ask: opts.ask });
      out.daily = r;
      S.dayStartEq = S.eq;
      S.busy = 0; S.lastTick = nowS;
      await save(st, K.state, S);
      return out;
    }
    if (!S.day) S.day = today;

    // ---- 1–2. discover, read the chain, the market and the scanner
    S.lastBlock = latest.number;
    out.discovered = (await discover(S, C, latest, left)).length;
    await readSwaps(S, C, latest, left);
    const liveC = Object.values(C).filter((c) => c.ok === 1);
    await readPrices(liveC);
    const dexDue = liveC.filter((c) => !c.dex || Date.now() - c.dex.at > 110e3);
    if (dexDue.length && left() > 22000) await readDex(dexDue.slice(0, 60), fetchJson);
    if (left() > 24000) await readPaid(C, liveC, fetchJson, nowS, left).catch(() => null);
    // a website / X / Telegram link shared by two launches is a copy-paste warning sign
    const seen = new Map();
    // (only links that name something — a bare "x.com" or "t.me" says nothing)
    const named = (c) => [...new Set(Object.values(linksOf(c)).filter(Boolean).map(normLink))].filter((u) => /^[^/]+\.[a-z]{2,}\/[^/]{2,}|^[\w-]+\.[a-z]{2,}$/i.test(u) && !/^(x\.com|t\.me|twitter\.com)$/.test(u));
    for (const c of liveC) for (const u of named(c)) seen.set(u, (seen.get(u) || 0) + 1);
    for (const c of liveC) c.reused = named(c).some((u) => seen.get(u) > 1);
    const heldT = new Set(S.open.map((p) => p.t));
    // held tokens every 10 minutes, tokens that just triggered a playbook every 10, the rest every 30; a failed scan retries after 3
    const hot = (c) => c.hotAt && nowS - c.hotAt < 300;
    const rank = (c) => (heldT.has(c.t) ? 0 : hot(c) ? 1 : !c.scanAt ? 2 : 3);
    const scanDue = liveC.filter((c) => !c.own || CFG.tradeOwn())
      .filter((c) => !(c.scanTry && nowS - c.scanTry < 180) && (!c.scanAt || nowS - c.scanAt > (heldT.has(c.t) || hot(c) ? 600 : 1800)))
      .sort((a, b) => rank(a) - rank(b) || (b.ts - a.ts));
    const toScan = scanDue.slice(0, opts.scansPerTick ?? 3);
    if (toScan.length && left() > 20000) {
      const res = await Promise.all(toScan.map((c) => Promise.race([scan(c.t).catch(() => null), new Promise((r) => setTimeout(() => r(null), 15000))])));
      toScan.forEach((c, i) => {
        c.scanTry = nowS;
        if (!res[i]) return; // a failed scan leaves the old one marked as old
        c.scan = res[i]; c.scanAt = nowS; out.scanned.push(c.sym || c.t);
        // once bad, off-limits for real money for a while, whatever a later scan says
        const bad = res[i].notToken ? "not a token" : res[i].crit && res[i].crit.length ? `critical: ${res[i].crit[0]}` : null;
        if (bad) { c.flagUntil = nowS + B.REAL_GATES.flagHours * 3600; c.flagWhy = bad; }
      });
    }

    // ---- 3. money: deposits / withdrawals, the real positions' values
    if (live) {
      if (S.cash == null) { S.flows.unshift({ ts: nowS, usd: r2(D.cash, 4), kind: "start" }); S.netIn = D.cash; }
      else if (Math.abs(D.cash - S.cash) > 0.01) { const d = D.cash - S.cash; S.netIn += d; S.flows.unshift({ ts: nowS, usd: r2(d, 4), kind: d > 0 ? "deposit" : "withdrawal" }); }
      S.flows = S.flows.slice(0, 30);
      S.cash = D.cash;
    }
    // pending buys from a tick that timed out waiting for the receipt
    for (const p of S.open.filter((x) => x.pending)) {
      const rc = await rpcCall("eth_getTransactionReceipt", [p.pending]).catch(() => null);
      if (rc && rc.status === "0x1") { const tl = tradeLog(rc, desk); if (tl) { p.tokens = tl.amountOut.toString(); p.entryPx = r2(p.usdIn / human(tl.amountOut, p.dec), 12); } delete p.pending; }
      else if ((rc && rc.status !== "0x1") || nowS - p.entryTs > 600) { p.dead = true; }
    }
    S.open = S.open.filter((p) => !p.dead);
    let eqPos = 0;
    if (live && S.open.length) {
      const bals = await balancesOf(desk, S.open.map((p) => p.t));
      S.open.forEach((p, i) => {
        const b = bals[i];
        if (b == null || p.pending) return;
        if (b < BigInt(p.tokens)) { // the owner took tokens out: only what's still here is managed
          const kept = Number(b) / Number(BigInt(p.tokens) || 1n);
          if (b === 0n) { p.gone = true; notes.push(`${p.sym}: the tokens left the desk (owner withdrawal) — no longer tracked`); }
          p.usdIn *= kept; p.tokens = b.toString();
        }
      });
      S.open = S.open.filter((p) => !p.gone);
      const q = await callsRaw(S.open.map((p) => quoteCall(desk, p.k, false, BigInt(p.tokens || "0"))));
      S.open.forEach((p, i) => {
        const v = decodeQuote(q[i]);
        if (v == null) { p.qFail = (p.qFail || 0) + 1; return; }
        p.qFail = 0; p.value = human(v, 6); eqPos += p.value;
        p.ret = r2((p.value / p.basis - 1) * 100, 2);
      });
    }
    const equity = live ? S.cash + eqPos : null;

    // ---- 4. exits: real first (emergencies first), then paper, then ghosts
    let txs = 0;
    const sellsDue = [];
    // under a $5k market cap, never hold longer than 30 minutes; a playbook can set its own (crash-buy DCA: $10k, 1 hour)
    const lowCapOf = (pb) => { const pbk = B.PLAYBOOKS[pb]; return pbk && pbk.lowCap ? pbk.lowCap : { usd: B.RISK.lowCapUsd, min: B.RISK.lowCapMin }; };
    const lowCapDue = (p, when) => {
      const lim = lowCapOf(p.pb);
      if (when - p.entryTs < lim.min * 60) return false;
      const c = C[p.t]; if (!c) return false;
      const m = featuresOf(c, when).mcap;
      return m > 0 && m <= lim.usd;
    };
    for (const p of S.open) {
      if (p.pending) continue;
      const c = C[p.t];
      if (c && c.px) p.nowPx = c.px;
      const crit = c && c.scan && c.scan.crit && c.scan.crit.length && (!p.critAtEntry || c.scan.crit[0] !== p.critAtEntry);
      const dump = c && c.px && p.lastPx && c.px < p.lastPx * 0.5;
      if (c && c.px) p.lastPx = c.px;
      if (crit || dump || (p.qFail || 0) >= 3) { sellsDue.push({ p, pct: 100, why: crit ? "emergency" : dump ? "crash" : "unquotable", urgent: true }); continue; }
      if (p.ret == null) continue;
      const e0 = B.exitCheck(p, p.ret, nowS), e = lowCapDue(p, nowS) ? { action: "lowcap", sellPct: 100 } : e0;
      if (e.action) sellsDue.push({ p, pct: e.sellPct, why: e.action });
    }
    sellsDue.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
    /// sells part or all of a real position; true when a sale went through
    async function sellNow(s, when) {
      const p = s.p;
      const all = BigInt(p.tokens);
      const remainPct = 100 - p.parts.reduce((t, x) => t + x.pct, 0); // s.pct is % of the original position
      const partPct = s.pct >= 100 || s.pct >= remainPct ? remainPct : s.pct;
      const amt = partPct >= remainPct ? all : (all * BigInt(Math.round(partPct * 100))) / BigInt(Math.max(1, Math.round(remainPct * 100)));
      if (amt <= 0n) return false;
      const q = decodeQuote((await callsRaw([quoteCall(desk, p.k, false, amt)]))[0]);
      const ladder = [92n, 85n, 70n, 0n], step = Math.min(p.sellFails || 0, 3);
      const minOut = q == null ? 0n : (q * ladder[step]) / 100n;
      if (q == null && !s.urgent) return false;
      txs++;
      const r = await sendTx({ to: desk, data: SEL.sell + encKey(p.k) + u(amt) + u(minOut), key }).catch((e) => ({ ok: false, err: String(e.message || e) }));
      const tl = r.ok ? tradeLog(r.receipt, desk) : null;
      if (!r.ok || !tl) { p.sellFails = (p.sellFails || 0) + 1; out.errors.push(`sell ${p.sym}: ${r.err || (r.ok === null ? "no receipt yet" : "reverted")}`); if (s.urgent) alarm(`ARCIA DESK: trying to get out of ${p.sym} (${s.why}) — sell failed ${p.sellFails}×`); return false; }
      p.sellFails = 0;
      const usd = human(tl.amountOut, 6), frac = Number(amt) / Number(all), basisPart = p.basis * frac;
      const partRet = (usd / basisPart - 1) * 100;
      const px = r2(usd / human(amt, p.dec), 12);
      p.parts.push({ pct: partPct, ret: partRet, usd, why: s.why, tx: r.hash, px, ts: when });
      p.tokens = (all - amt).toString(); p.basis -= basisPart;
      S.cash = (S.cash || 0) + usd;
      log.push({ ts: when, side: "sell", t: p.t, sym: p.sym, pb: p.pb, usd: r2(usd, 4), tokens: human(amt, p.dec), px, tx: r.hash, why: s.why, ret: r2(partRet) });
      out.real.push(`sell ${p.sym} ${s.why} ${r2(partRet)}%`);
      if (s.urgent) alarm(`ARCIA DESK sold ${p.sym} (${s.why}) at ${r2(partRet)}% — tx ${r.hash}`);
      if ((s.why === "tp" || s.why === "tp2") && BigInt(p.tokens) > 0n) { if (s.why === "tp") p.tpHit = true; else p.tp2Hit = true; return true; }
      p.done = true;
      return true;
    }
    const closeDone = (when) => {
      for (const p of S.open.filter((x) => x.done)) {
        const rec = closeRecord(p, C[p.t], when, p.parts[p.parts.length - 1].why);
        closed.push(rec); learnFrom(S, rec); G.push(ghostOf(p, rec, C[p.t]));
        S.cool[p.t] = when + 3600;
        if (rec.ret <= -30) S.pmQueue = [...(S.pmQueue || []), rec.id].slice(-10); // a bad loss gets a written review
      }
      S.open = S.open.filter((p) => !p.done);
    };
    for (const s of sellsDue) {
      if (!live || txs >= 4 || left() < 20000) break; // a transaction can wait ~20 s for its receipt
      await sellNow(s, nowS);
    }
    closeDone(nowS);

    // paper
    for (const p of P) {
      const c = C[p.t];
      const ret = pret(p, c && c.px);
      if (ret == null) { if (nowS - p.entryTs > 86400) p.done = "lost"; continue; }
      p.ret = r2(ret);
      // what one add would have done (counterfactual — nothing is bought)
      const pbk = B.PLAYBOOKS[p.pb] || {}, fp = featuresOf(c, nowS);
      if (!p.tpHit && !pbk.dca && p.pb !== "scalp") { const k = B.addTrigger(p, fp, ret, nowS); if (k && !(p.addCf && p.addCf[k])) p.addCf = { ...(p.addCf || {}), [k]: c.px }; }
      // the crash-buy playbook buys again at -15% and -30% from its first price (paper: a virtual tranche)
      if (pbk.dca && p.tr && !p.tpHit) {
        const move = (c.px / p.tr[0].px - 1) * 100, lvl = pbk.dca.find((l) => move <= l && !(p.dcaDone || []).includes(l));
        if (lvl != null && fp.buysM5 >= 1) { p.tr.push({ px: c.px, usd: p.tr[0].usd }); p.usdIn += p.tr[0].usd; p.dcaDone = [...(p.dcaDone || []), lvl]; p.ret = r2(pret(p, c.px)); }
      }
      const crit = c.scan && c.scan.crit && c.scan.crit.length && !p.critAtEntry;
      const e0 = B.exitCheck(p, p.ret, nowS), e = crit ? { action: "emergency", sellPct: 100 } : lowCapDue(p, nowS) ? { action: "lowcap", sellPct: 100 } : e0;
      if (!e.action) continue;
      const leftPct = 100 - p.parts.reduce((t, x) => t + x.pct, 0);
      if ((e.action === "tp" || e.action === "tp2") && e.sellPct < leftPct) { p.parts.push({ pct: e.sellPct, ret: p.ret, why: e.action, px: c.px, ts: nowS }); if (e.action === "tp") p.tpHit = true; else p.tp2Hit = true; continue; }
      p.parts.push({ pct: leftPct, ret: p.ret, why: e.action, px: c.px, ts: nowS });
      p.done = true;
    }
    for (const p of P.filter((x) => x.done)) {
      if (p.done === "lost") continue;
      const rec = closeRecord(p, C[p.t], nowS, p.parts[p.parts.length - 1].why);
      closed.push(rec); learnFrom(S, rec); G.push(ghostOf(p, rec, C[p.t])); addEdges(S, p, rec);
      S.cool[`${p.t}|${p.pb}`] = nowS + 1800;
    }
    const P2 = P.filter((p) => !p.done);

    // ghosts
    const ghostDone = [];
    for (const g of G) {
      const c = C[g.t];
      const ret = pret(g, c && c.px);
      if (ret != null) {
        const mins = Math.round((nowS - g.entryTs) / 60);
        for (const x of B.UP) if (ret >= x && g.up[x] == null) g.up[x] = mins;
        for (const x of B.DOWN) if (ret <= -x && g.dn[x] == null) g.dn[x] = mins;
        g.last = r2(ret);
      }
      if (nowS >= g.until || !c || ret == null || ret <= -60) ghostDone.push(g);
    }
    const G2 = G.filter((g) => !ghostDone.includes(g)).slice(-150);
    // how often a trade (with what happened after it closed) ran 2×, 4×, 11× — the tail the runner is there for
    for (const g of ghostDone) {
      const t = S.stats.tails || (S.stats.tails = { n: 0, x2: 0, x4: 0, x11: 0 });
      t.n++; if (g.up[100] != null) t.x2++; if (g.up[300] != null) t.x4++; if (g.up[1000] != null) t.x11++;
    }

    // ---- 5. entries
    for (const [k, v] of Object.entries(S.cool)) if (v < nowS) delete S.cool[k];
    const want = [];
    for (const c of liveC) {
      if (c.t === CFG.arcircle) continue;
      if (c.own && !CFG.tradeOwn()) { if (!c.ownNoted) { c.ownNoted = 1; rejects.push({ ts: nowS, t: c.t, sym: c.sym, why: ["launched through ArcPad's own Argus flow — the desk skips those (the platform earns their fees)"] }); } continue; }
      const f = featuresOf(c, nowS);
      const pbs = B.PB_KEYS.filter((k) => { try { return (!opts.playbooks || opts.playbooks.includes(k)) && B.PLAYBOOKS[k].when(f); } catch { return false; } });
      if (pbs.length) { c.hotAt = nowS; want.push({ c, f, pbs }); }
    }
    // exact round-trip cost at trade size, for the ones that triggered (the desk's quote; paper-only: estimated)
    const size0 = live ? B.tradeSize(equity, S.cash) || B.RISK.minTrade : 5;
    if (want.length) {
      if (desk) {
        const need = want.filter((w) => !w.c.rt || nowS - w.c.rt.at > 120);
        const q = await callsRaw(need.map((w) => rtCall(desk, w.c.k, BigInt(Math.round(size0 * 1e6)))));
        need.forEach((w, i) => { const r = decodeRt(q[i]); w.c.rt = r ? { loss: r2((1 - human(r[1], 6) / size0) * 100, 2), tok: r[0].toString(), size: size0, at: nowS } : { fail: 1, at: nowS }; });
      } else want.forEach((w) => { w.c.rt = { loss: r2(((w.c.scan && w.c.scan.tax) || 0) + 2, 2), est: 1, at: nowS }; });
      want.forEach((w) => { w.f.rtLoss = w.c.rt.loss ?? null; w.f.quoteFailed = !!w.c.rt.fail; });
    }
    const realCands = [];
    for (const w of want) {
      const { c, f } = w;
      const g = B.gate(f, c.scan && c.scan.crit);
      if (g.length) {
        const prev = rejects.find((x) => x.t === c.t);
        if (!prev) rejects.push({ ts: nowS, t: c.t, sym: c.sym, pb: w.pbs[0], why: g.slice(0, 3) });
        continue;
      }
      const x = B.vec(f);
      for (const pb of w.pbs) {
        if (P2.length >= 40) break;
        if (P2.some((p) => p.t === c.t && p.pb === pb) || S.cool[`${c.t}|${pb}`]) continue;
        const p = predictP(S, x);
        const pSize = B.PLAYBOOKS[pb].sizeUsd || size0;
        P2.push({ id: `p${++S.seq}`, t: c.t, sym: c.sym, pb, real: false, entryTs: nowS, p0: c.px, rt: f.rtLoss || 0, usdIn: pSize, exits: { ...S.learn.exits[pb] }, x: round3(x), p, parts: [], critAtEntry: (c.scan && c.scan.crit && c.scan.crit[0]) || null,
          ...(B.PLAYBOOKS[pb].dca ? { tr: [{ px: c.px, usd: pSize }] } : {}) });
        out.opened.push(`paper ${c.sym} ${pb}`);
      }
      if (live && !S.open.some((p) => p.t === c.t) && !S.cool[c.t]) {
        const ds = w.pbs.map((pb) => ({ pb, d: B.decide({ pb, x, state: S, ...(opts.rand ? { rand: opts.rand } : {}) }), rg: B.realGate(f, c, nowS, pb) })).filter((z) => z.d.go)
          .sort((a, b) => b.d.draw + (b.d.p - 0.5) * 20 - (a.d.draw + (a.d.p - 0.5) * 20));
        const pick = ds.find((z) => !z.rg.length);
        if (pick) realCands.push({ c, f, x, pb: pick.pb, d: pick.d });
        else if (ds.length && !rejects.find((y) => y.t === c.t)) rejects.push({ ts: nowS, t: c.t, sym: c.sym, pb: ds[0].pb, why: ds[0].rg.slice(0, 3), paper: true });
      }
    }
    // real buys: capped per tick, per hour, per day, by open positions and by cash
    S.buys = (S.buys || []).filter((t) => nowS - t < 3600);
    const dayLoss = S.dayStartEq && equity != null ? ((equity - S.dayStartEq) / S.dayStartEq) * 100 : 0;
    const flowToday = S.flows.filter((fl) => dayOf(fl.ts) === today && fl.kind !== "start").reduce((t, fl) => t + fl.usd, 0);
    const dayLossAdj = S.dayStartEq ? ((equity - flowToday - S.dayStartEq) / S.dayStartEq) * 100 : dayLoss;
    const stopDay = equity != null && dayLossAdj <= -B.RISK.dailyLossPct;
    if (stopDay && !S.stopNoted) { S.stopNoted = today; notes.push(`down ${r2(-dayLossAdj)}% today — no new real trades until tomorrow (paper continues)`); }
    // the crash-buy playbook's planned DCA tranches (-15%, -30% from its first price)
    for (const p of S.open) {
      const pbk = B.PLAYBOOKS[p.pb];
      if (!pbk || !pbk.dca || !live || D.paused || stopDay || p.pending || p.tpHit || txs >= 5 || left() < 20000) continue;
      const c = C[p.t]; if (!c || !c.px || !p.p0) continue;
      const f = featuresOf(c, nowS), move = (c.px / p.p0 - 1) * 100;
      const lvl = pbk.dca.find((l) => move <= l && !(p.dcaDone || []).includes(l));
      if (lvl == null || f.buysM5 < 1) continue;
      p.dcaDone = [...(p.dcaDone || []), lvl];
      const size = Math.floor(Math.min(pbk.sizeUsd || 2, D.maxTrade, D.dailyLeft, (S.cash || 0) - B.RISK.keepCash) * 100) / 100;
      if (!(size >= 1)) continue;
      const usdRaw = BigInt(Math.round(size * 1e6));
      const qb = decodeQuote((await callsRaw([quoteCall(desk, p.k, true, usdRaw)]))[0]);
      if (qb == null || qb === 0n) continue;
      txs++;
      const r = await sendTx({ to: desk, data: SEL.buy + encKey(p.k) + u(usdRaw) + u((qb * 95n) / 100n), key }).catch((e) => ({ ok: false, err: String(e.message || e) }));
      const tl = r.ok ? tradeLog(r.receipt, desk) : null;
      if (!tl) { out.errors.push(`dca ${p.sym}: ${r.err || "reverted"}`); continue; }
      p.tokens = (BigInt(p.tokens) + tl.amountOut).toString(); p.basis += size; p.usdIn += size;
      p.entryPx = r2(p.usdIn / human(p.tokens, p.dec), 12);
      S.cash -= size; D.dailyLeft -= size;
      log.push({ ts: nowS, side: "buy", t: p.t, sym: p.sym, pb: p.pb, usd: size, tokens: human(tl.amountOut, p.dec), px: r2(size / human(tl.amountOut, p.dec), 12), tx: r.hash, why: `DCA ${lvl}%` });
      out.real.push(`dca ${p.sym} ${lvl}% $${size}`);
    }
    // adding to a real position (추매): only a kind of add that paper trading has proven, once per position, never in the warm-up
    const warmNow = (S.stats.realClosed || 0) < (S.learn.warmup || 25);
    for (const p of S.open) {
      if (!live || D.paused || stopDay || warmNow || p.pending || p.added || p.tpHit || p.ret == null || txs >= 5 || left() < 20000) continue;
      if ((B.PLAYBOOKS[p.pb] || {}).dca || p.pb === "scalp") continue;
      const c = C[p.t]; if (!c) continue;
      const f = featuresOf(c, nowS), k = B.addTrigger(p, f, p.ret, nowS);
      if (!k || !B.addAllowed(S.learn.adds, k) || B.realGate(f, c, nowS).length) continue;
      const size = Math.floor(Math.min(p.usdIn0 || p.usdIn, D.maxTrade, D.dailyLeft, (S.cash || 0) - B.RISK.keepCash) * 100) / 100;
      if (!(size >= B.RISK.warmTrade)) continue;
      const usdRaw = BigInt(Math.round(size * 1e6));
      const qb = decodeQuote((await callsRaw([quoteCall(desk, p.k, true, usdRaw)]))[0]);
      if (qb == null || qb === 0n) continue;
      txs++;
      const r = await sendTx({ to: desk, data: SEL.buy + encKey(p.k) + u(usdRaw) + u((qb * 95n) / 100n), key }).catch((e) => ({ ok: false, err: String(e.message || e) }));
      const tl = r.ok ? tradeLog(r.receipt, desk) : null;
      if (!tl) { out.errors.push(`add ${p.sym}: ${r.err || "reverted"}`); p.added = { kind: k, failed: true, ts: nowS }; continue; }
      p.tokens = (BigInt(p.tokens) + tl.amountOut).toString(); p.basis += size; p.usdIn += size;
      p.added = { kind: k, tx: r.hash, usd: size, px: r2(size / human(tl.amountOut, p.dec), 12), ts: nowS };
      p.entryPx = r2(p.usdIn / human(p.tokens, p.dec), 12);
      S.cash -= size; D.dailyLeft -= size;
      log.push({ ts: nowS, side: "buy", t: p.t, sym: p.sym, pb: p.pb, usd: size, tokens: human(tl.amountOut, p.dec), px: p.added.px, tx: r.hash, why: B.ADD_KINDS[k] });
      out.real.push(`add ${p.sym} ${k} $${size}`);
    }
    realCands.sort((a, b) => b.d.draw + (b.d.p - 0.5) * 20 - (a.d.draw + (a.d.p - 0.5) * 20));
    for (const rc of realCands) {
      if (!live || D.paused || stopDay || txs >= 5 || left() < 20000) break;
      const warm = (S.stats.realClosed || 0) < (S.learn.warmup || 25);
      if (S.open.length >= B.RISK.maxOpen || S.buys.length >= (warm ? B.RISK.warmPerHour : B.RISK.maxPerHour)) break;
      const { c, f, x, pb, d } = rc;
      // one real position per coin, and none in a same-named copy of a coin already held (clones of a name are usually rugs)
      if (S.open.some((p) => p.t === c.t || (p.sym && c.sym && String(p.sym).toLowerCase() === String(c.sym).toLowerCase()))) continue;
      const pbk = B.PLAYBOOKS[pb];
      const eqNow = S.cash + S.open.reduce((t, p) => t + (p.value || p.usdIn), 0);
      let size = Math.min(pbk.sizeUsd ? Math.min(pbk.sizeUsd, S.cash - B.RISK.keepCash) : warm ? Math.min(B.RISK.warmTrade, S.cash - B.RISK.keepCash) : B.tradeSize(eqNow, S.cash), D.maxTrade, D.dailyLeft);
      if (!(size >= (pbk.sizeUsd ? 1 : B.RISK.warmTrade))) continue;
      size = Math.floor(size * 100) / 100;
      // a second opinion from Claude on real money (it can only say no); the pump scalp skips it for speed
      let rv = null;
      if (AI.aiEnabled() && pbk.review !== false && left() > 30000) {
        rv = await (opts.review || AI.review)({ token: c.sym, playbook: pb, why: B.PLAYBOOKS[pb].why, ageMin: r2(f.ageMin, 1), priceVsLaunchFloor: f.floorX != null ? `${r2(f.floorX, 2)}x` : "unknown",
          dropIfBackToFloorPct: r2(f.floorDrop, 1), dropIfTop10SellPct: f.dumpTop10, liquidityUsd: Math.round(f.liq), mcapUsd: Math.round(f.mcap), buysSells5m: [f.buysM5, f.sellsM5], trades1h: f.txH1,
          change5mPct: r2(f.chgM5, 1), change1hPct: r2(f.chgH1, 1), fromHighPct: r2(f.ddHigh, 1), scanner: c.scan ? { score: c.scan.score, top10Pct: c.scan.top10, snipersPct: c.scan.sn, linkedPct: c.scan.lk, taxPct: c.scan.tax, holders: c.scan.hold } : null,
          roundTripLossPct: f.rtLoss, lastMinutes: (c.bk || []).slice(-10), sizeUsd: size, modelWinOdds: r2(d.p, 2),
          links: linksOf(c), linkAlsoUsedByAnotherLaunch: !!f.reused, dexscreener: { profilePaid: !!f.dexPaid, minutesSincePaid: f.dexPaidMin != null ? Math.round(f.dexPaidMin) : null, moveSincePaidPct: r2(f.chgSincePaid, 1), boosts: (c.dex && c.dex.boosts) || 0 } }).catch(() => null);
        if (rv && !rv.go) { rejects.push({ ts: nowS, t: c.t, sym: c.sym, pb, why: [`risk review: ${rv.reason}`], paper: true }); S.cool[c.t] = nowS + 900; continue; }
      }
      const usdRaw = BigInt(Math.round(size * 1e6));
      const qb = decodeQuote((await callsRaw([quoteCall(desk, c.k, true, usdRaw)]))[0]);
      if (qb == null || qb === 0n) { rejects.push({ ts: nowS, t: c.t, sym: c.sym, pb, why: ["no buy quote at trade size"] }); continue; }
      txs++;
      const r = await sendTx({ to: desk, data: SEL.buy + encKey(c.k) + u(usdRaw) + u((qb * 95n) / 100n), key }).catch((e) => ({ ok: false, err: String(e.message || e) }));
      if (r.ok === false || (r.ok && !tradeLog(r.receipt, desk))) { out.errors.push(`buy ${c.sym}: ${r.err || "reverted"}`); S.cool[c.t] = nowS + 900; continue; }
      const tl = r.ok ? tradeLog(r.receipt, desk) : null;
      const tokens = tl ? tl.amountOut : qb;
      const pos = { id: `r${++S.seq}`, t: c.t, sym: c.sym, dec: c.dec || 18, k: c.k, pb, real: true, entryTs: nowS, usdIn: size, usdIn0: size, basis: size, tokens: tokens.toString(),
        entryPx: r2(size / human(tokens, c.dec || 18), 12), p0: c.px, rt: f.rtLoss || 0, tx: r.hash, exits: { ...S.learn.exits[pb] }, x: round3(x), p: d.p, why0: d.why, parts: [],
        critAtEntry: (c.scan && c.scan.crit && c.scan.crit[0]) || null, lastPx: c.px, ...(r.ok ? {} : { pending: r.hash }),
        gate: { score: c.scan ? c.scan.score : null, scanAge: c.scanAt ? nowS - c.scanAt : null, floorX: f.floorX != null ? r2(f.floorX, 2) : null, dump: f.dumpTop10 },
        ...(rv ? { review: { go: rv.go, reason: rv.reason, conf: rv.confidence, model: rv.model } } : {}) };
      S.open.push(pos); S.buys.push(nowS); S.cash -= size; D.dailyLeft -= size;
      log.push({ ts: nowS, side: "buy", t: c.t, sym: c.sym, pb, usd: size, tokens: human(tokens, c.dec || 18), px: pos.entryPx, tx: r.hash, why: d.why });
      out.real.push(`buy ${c.sym} ${pb} $${size}`);
    }

    // ---- 5b. keep watching what's held for the rest of the minute (the next tick is a minute away)
    const watchMs = opts.watchMs ?? 10000;
    while (live && S.open.some((p) => !p.pending) && left() > 16000 && watchMs > 0) {
      await new Promise((r) => setTimeout(r, watchMs));
      const held = S.open.filter((p) => !p.pending);
      const q = await callsRaw(held.map((p) => quoteCall(desk, p.k, false, BigInt(p.tokens || "0"))));
      const when = nowS + Math.round((Date.now() - t0) / 1000);
      for (let i = 0; i < held.length && left() > 12000; i++) {
        const p = held[i], v = decodeQuote(q[i]);
        if (v == null) continue;
        const value = human(v, 6), prev = p.value;
        p.value = value; p.ret = r2((value / p.basis - 1) * 100, 2);
        const crash = prev && value < prev * 0.6;
        const e0 = B.exitCheck(p, p.ret, when), e = crash ? { action: "crash", sellPct: 100 } : lowCapDue(p, when) ? { action: "lowcap", sellPct: 100 } : e0;
        if (e.action) await sellNow({ p, pct: e.sellPct, why: e.action, urgent: e.action === "crash" || e.action === "sl" }, when);
      }
      closeDone(when);
      out.watched = (out.watched || 0) + 1;
    }
    // a written review of a bad loss, one per tick when there's time
    if (S.pmQueue && S.pmQueue.length && AI.aiEnabled() && left() > 26000) {
      const id = S.pmQueue.shift();
      const rec = closed.find((r) => r.id === id) || ((unpack(await st.get(K.closed(today)).catch(() => null)) || {}).items || []).find((r) => r.id === id);
      if (rec) {
        const pm = await (opts.postMortem || AI.postMortem)({ token: rec.sym, playbook: rec.pb, returnPct: rec.ret, minutesHeld: rec.mins, exit: rec.why, entryPrice: rec.entryPx, exitPrice: rec.exitPx,
          features: rec.x, gate: rec.gate || null, review: rec.review || null }).catch(() => null);
        if (pm) await appendList(st, K.reviews, "items", [{ ts: nowS, id, t: rec.t, sym: rec.sym, ret: rec.ret, text: pm.text, model: pm.model }], 60);
      }
    }

    // ---- 6. equity, save
    if (live) {
      try { const D2 = await deskInfo(desk, key, nowS); if (D2) S.cash = D2.cash; } catch { /* keep the running figure */ }
      S.eq = r2(S.cash + S.open.reduce((t, p) => t + (p.value ?? p.usdIn), 0), 4);
      if (S.dayStartEq == null) S.dayStartEq = S.eq;
    }
    const writes = [save(st, K.cands, { items: C }), save(st, K.paper, { open: P2 }), save(st, K.ghosts, { items: G2 })];
    if (live && nowS - (S.eqAt || 0) >= 300) {
      S.eqAt = nowS;
      writes.push(appendList(st, K.equity, "pts", [`${nowS}|${S.eq}|${r2(pnlOf(S), 4)}`], 8640));
    }
    if (log.length) writes.push(appendList(st, K.log, "items", log, 400));
    if (closed.length) {
      writes.push(appendList(st, K.closed(today), "items", closed, 3000));
      writes.push(appendList(st, K.recent, "items", closed.map(slim), 200));
    }
    if (rejects.length) writes.push(appendList(st, K.rejects, "items", rejects, 60, (a) => a.t));
    if (ghostDone.length) writes.push(finishGhosts(st, ghostDone));
    await Promise.all(writes);
    out.closed = closed.map((r) => `${r.real ? "real" : "paper"} ${r.sym} ${r.pb} ${r.ret}% (${r.why})`);
    out.open = { real: S.open.length, paper: P2.length, ghosts: G2.length, watching: liveC.length };
  } catch (e) {
    out.errors.push(String((e && e.message) || e));
    S.lastErr = { at: Math.floor(Date.now() / 1000), msg: String((e && e.message) || e).slice(0, 200) };
  }
  S.notes = [...notes.map((n) => ({ at: Math.floor(Date.now() / 1000), n })), ...(S.notes || [])].slice(0, 20);
  S.busy = 0; S.lastTick = Math.floor(Date.now() / 1000); S.lastDur = Date.now() - t0;
  await save(st, K.state, S);
  return out;
}
/// a closed paper trade: the edge one add (an equal second tranche at the trigger price, sold with the rest) would have had
function addEdges(S, p, rec) {
  for (const [k, pxAdd] of Object.entries(p.addCf || {})) {
    if (!pxAdd) continue;
    const r2nd = B.blended(p.parts.map((x) => ({ pct: x.pct, ret: x.px ? ((x.px / pxAdd) * (1 - (p.rt || 0) / 100) - 1) * 100 : x.ret })));
    B.addLearn(S.learn.adds, k, (r2nd - rec.ret) / 2);
  }
}
function predictP(S, x) { return r2(B.predict(S.learn.model, x), 3); }
export const pnlOf = (S) => (S.eq == null ? 0 : S.eq + (S.burnedUsd || 0) - (S.netIn || 0));
const slim = (r) => ({ id: r.id, t: r.t, sym: r.sym, pb: r.pb, real: r.real, entryTs: r.entryTs, exitTs: r.exitTs, usdIn: r.usdIn, usdOut: r.usdOut, pnl: r.pnl, ret: r.ret, why: r.why,
  entryPx: r.entryPx, exitPx: r.exitPx, buyTx: r.buyTx, sells: r.parts.filter((p) => p.tx).map((p) => ({ tx: p.tx, px: p.px, pct: p.pct, ret: p.ret, why: p.why })), peak: r.peak, low: r.low, mins: r.mins });
/// newest first (a time series — field "pts" — stays oldest first)
async function appendList(st, key, field, add, max, uniqBy = null) {
  const d = unpack(await st.get(key).catch(() => null)) || {};
  if (field === "pts") return save(st, key, { ...d, pts: [...(d.pts || []), ...add].slice(-max) });
  let list = [...add.slice().reverse(), ...(d[field] || [])];
  if (uniqBy) { const seen = new Set(); list = list.filter((x) => { const k = uniqBy(x); if (seen.has(k)) return false; seen.add(k); return true; }); }
  await save(st, key, { ...d, [field]: list.slice(0, max) });
}
async function finishGhosts(st, done) {
  const byDay = new Map();
  for (const g of done) { if (!byDay.has(g.day)) byDay.set(g.day, []); byDay.get(g.day).push(g); }
  for (const [day, gs] of byDay) {
    const d = unpack(await st.get(K.closed(day)).catch(() => null));
    if (!d || !d.items) continue;
    for (const g of gs) { const r = d.items.find((x) => x.id === g.id); if (r) r.full = { up: g.up, dn: g.dn, final: g.last }; }
    await save(st, K.closed(day), d);
  }
}
function alarm(text) {
  const chat = CFG.tgChat();
  if (!chat) return;
  import("./_tg-lib.mjs").then((T) => T.tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true })).catch(() => null);
}

// ---------------------------------------------------------------- the daily job
async function arcKeyOf(S) {
  if (S.arcKey) return S.arcKey;
  if (CFG.arcKey) return (S.arcKey = CFG.arcKey);
  const r = await ethCalls(CFG.portals.map((p) => ({ to: p, data: SEL.launches + pad(CFG.arcircle) }))).catch(() => []);
  for (const h of r) {
    if (!h || strip(h).length < 64 * 9) continue;
    const hook = wA(h, 4);
    const [c0, c1] = BigInt(CFG.arcircle) < BigInt(CFG.usdc) ? [CFG.arcircle, CFG.usdc] : [CFG.usdc, CFG.arcircle];
    for (const fee of [ARGUS_POOL_FEE_DYNAMIC, ARGUS_POOL_FEE]) {
      const k = { c0, c1, fee, ts: ARGUS_TICK_SPACING, hooks: hook };
      if (poolIdOfKey(k) === CFG.arcPoolId) return (S.arcKey = k);
    }
  }
  return null;
}
async function daily(st, S, { yday, nowS, D, live, desk, key, notes, ask }) {
  const out = { day: yday };
  // exit tuning, per playbook, over the last 14 days of closes (real and paper, full paths where known)
  const days = Array.from({ length: 14 }, (_, i) => dayOf(nowS - (i + 1) * 86400));
  const docs = await st.getMany(days.map(K.closed)).catch(() => ({}));
  const all = days.flatMap((d) => ((unpack(docs[K.closed(d)]) || {}).items) || []);
  const changes = [];
  for (const pb of B.PB_KEYS) {
    const rows = all.filter((r) => r.pb === pb).map((r) => (r.full ? { up: r.full.up, dn: r.full.dn, final: r.full.final } : r));
    const cur = S.learn.exits[pb];
    const t = B.tuneExits(rows, cur);
    if (t && t.moved) { changes.push({ pb, from: { tp: cur.tp, sl: cur.sl }, to: { tp: t.tp, sl: t.sl }, n: rows.length, best: { tp: t.best.tp, sl: t.best.sl, m: r2(t.best.m) } }); cur.tp = t.tp; cur.sl = t.sl; }
  }
  const closedY = all.filter((r) => r.day === yday);
  const realY = closedY.filter((r) => r.real);
  // the burn: a share of new profit above the high-water mark
  let burn = null;
  const pnl = pnlOf(S);
  if (live && pnl > (S.hwm || 0) + 0.5) {
    const pct = CFG.burnPct();
    let usd = Math.floor(((pnl - (S.hwm || 0)) * pct) / 100 * 100) / 100;
    usd = Math.min(usd, D.burnLeft, (S.cash || 0) - B.RISK.keepCash);
    const k = await arcKeyOf(S).catch(() => null);
    if (usd >= 0.1 && k) {
      const raw = BigInt(Math.round(usd * 1e6));
      const q = decodeQuote((await callsRaw([quoteCall(desk, k, true, raw)]))[0]);
      if (q != null) {
        const r = await sendTx({ to: desk, data: SEL.burn + encKey(k) + u(raw) + u((q * 95n) / 100n), key }).catch((e) => ({ ok: false, err: String(e.message || e) }));
        const bl = r.ok ? burnLog(r.receipt, desk) : null;
        if (bl) {
          const tok = human(bl.out, 18);
          S.burnedUsd += usd; S.burnedTok += tok;
          burn = { ts: nowS, day: yday, usd, tok: r2(tok, 2), tx: r.hash, pct, profit: r2(pnl - (S.hwm || 0), 4) };
          await appendList(st, K.burns, "items", [burn], 400);
          await appendList(st, K.log, "items", [{ ts: nowS, side: "burn", t: CFG.arcircle, sym: "ARCIRCLE", usd, tokens: r2(tok, 2), tx: r.hash, why: `${pct}% of new profit` }], 400);
        } else notes.push(`burn didn't go through: ${r.err || "reverted"}`);
      }
    } else if (!k) notes.push("couldn't find the $ARCIRCLE pool for the burn");
  }
  if (pnl > (S.hwm || 0)) S.hwm = pnl;
  // lessons + ARCIA's journal
  const lessons = B.lessons(S.learn, closedY);
  if (changes.length) changes.forEach((c) => lessons.push(`${B.PLAYBOOKS[c.pb].name}: exits moved from +${c.from.tp}/−${c.from.sl}% to +${c.to.tp}/−${c.to.sl}% (best on replay: +${c.best.tp}/−${c.best.sl}%, ${c.best.m}% a trade over ${c.n} trades).`));
  const stats = { real: realY.length, realWins: realY.filter((r) => r.ret > 0).length, realPnl: r2(realY.reduce((t, r) => t + r.pnl, 0), 4), paper: closedY.length - realY.length,
    paperWins: closedY.filter((r) => !r.real && r.ret > 0).length, equity: S.eq, pnl: r2(pnl, 4), burn: burn ? burn.usd : 0 };
  let text = null;
  try {
    const askFn = ask || (await import("./_arcia-brain.mjs")).askClaude;
    text = await askFn({ L: null, maxTokens: 350, messages: [{ role: "user", content:
      `You are ARCIA writing your trading desk's daily journal for ${yday} (UTC). Write 4–6 short sentences in first person, plain English, honest and calm: what you traded, what worked, what didn't, what you're changing. No hype, no promises, no advice to anyone, no emojis. Numbers only from this data:\n` +
      JSON.stringify({ stats, lessons, best: closedY.slice().sort((a, b) => b.ret - a.ret).slice(0, 3).map((r) => ({ sym: r.sym, pb: r.pb, ret: r.ret, real: r.real, why: r.why })), worst: closedY.slice().sort((a, b) => a.ret - b.ret).slice(0, 3).map((r) => ({ sym: r.sym, pb: r.pb, ret: r.ret, real: r.real, why: r.why })), exitChanges: changes, warmupLeft: Math.max(0, (S.learn.warmup || 25) - S.stats.realClosed) }) }] });
  } catch { text = null; }
  const entry = { day: yday, text: text ? String(text).slice(0, 1400) : null, lessons, stats, changes };
  await appendList(st, K.journal, "items", [entry], 90);
  S.learn.history = [...(S.learn.history || []), { day: yday, n: S.learn.model.n, means: Object.fromEntries(B.PB_KEYS.map((k) => [k, r2(S.learn.bandit[k] ? S.learn.bandit[k].mean : 0)])), exits: JSON.parse(JSON.stringify(S.learn.exits)), changes }].slice(-60);
  if (CFG.tgChat()) alarm(`ARCIA DESK — ${yday}\n${entry.text || lessons.join("\n")}\n\nhttps://www.arcircle.app/arc#desk`);
  out.changes = changes; out.burn = burn; out.lessons = lessons; out.journal = !!text;
  return out;
}

// ---------------------------------------------------------------- the public view (GET /api/desk)
export async function view(st) {
  st = st || memStore();
  const [S0, P, rec, lg, rj, jr, bu, eq, cd, rvw] = await load(st, [K.state, K.paper, K.recent, K.log, K.rejects, K.journal, K.burns, K.equity, K.cands, K.reviews]);
  const S = S0 || newState();
  const L = S.learn, s = S.stats;
  const nReal = s.realClosed || 0;
  const pts = ((eq && eq.pts) || []);
  const step = Math.max(1, Math.ceil(pts.length / 360));
  const C = (cd && cd.items) || {};
  const pnl = pnlOf(S);
  return {
    v: DESK_VERSION, brain: B.BRAIN_VERSION, mode: S.mode || "paper", desk: CFG.desk(), updated: S.lastTick || null, tickMs: S.lastDur || null, lastErr: S.lastErr || null, notes: (S.notes || []).slice(0, 8),
    ai: AI.aiEnabled(), reviews: ((rvw && rvw.items) || []).slice(0, 10),
    money: { cash: r2(S.cash, 4), equity: S.eq, netIn: r2(S.netIn, 4), pnl: r2(pnl, 4), pnlPct: S.netIn > 0 ? r2((pnl / S.netIn) * 100) : null, burnedUsd: r2(S.burnedUsd, 4), burnedTok: r2(S.burnedTok, 2), hwm: r2(S.hwm, 4), dayStart: S.dayStartEq, flows: (S.flows || []).slice(0, 10) },
    stats: { realClosed: nReal, realWins: s.realWins, winRate: nReal ? r2((s.realWins / nReal) * 100, 1) : null, avgRet: nReal ? r2(s.realSum / nReal) : null, realPnl: s.realPnl,
      paperClosed: s.paperClosed, paperWinRate: s.paperClosed ? r2((s.paperWins / s.paperClosed) * 100, 1) : null, paperAvg: s.paperClosed ? r2(s.paperSum / s.paperClosed) : null, best: s.best, worst: s.worst },
    open: (S.open || []).map((p) => ({ id: p.id, t: p.t, sym: p.sym, pb: p.pb, entryTs: p.entryTs, usdIn: r2(p.usdIn, 4), value: r2(p.value, 4), ret: p.ret, entryPx: p.entryPx, nowPx: p.nowPx ? r2(p.nowPx, 12) : null,
      tokens: p.tokens ? human(p.tokens, p.dec || 18) : null, tp: p.exits.tp, sl: p.exits.sl, trailAt: p.exits.trailAt, trail: p.exits.trail, maxH: p.exits.maxH, peak: r2(p.peak), tpHit: !!p.tpHit, tp2Hit: !!p.tp2Hit,
      tp2: (p.exits.tp2 ?? B.RUN.tp2), runTrail: (p.peak >= 400 ? (p.exits.runTrailWide ?? B.RUN.runTrailWide) : (p.exits.runTrail ?? B.RUN.runTrail)), tx: p.tx, pending: !!p.pending,
      sells: (p.parts || []).filter((x) => x.tx).map((x) => ({ tx: x.tx, px: x.px, pct: x.pct, ret: r2(x.ret), why: x.why })), why: p.why0, gate: p.gate || null, review: p.review || null, added: p.added && !p.added.failed ? p.added : null, dca: p.dcaDone || null })),
    paper: { open: ((P && P.open) || []).length, list: ((P && P.open) || []).slice().sort((a, b) => b.entryTs - a.entryTs).slice(0, 16).map((p) => ({ t: p.t, sym: p.sym, pb: p.pb, entryTs: p.entryTs, ret: p.ret ?? null, tp: p.exits.tp, sl: p.exits.sl, tpHit: !!p.tpHit })) },
    recent: ((rec && rec.items) || []).slice(0, 80),
    log: ((lg && lg.items) || []).slice(0, 80),
    rejects: ((rj && rj.items) || []).slice(0, 25),
    journal: ((jr && jr.items) || []).slice(0, 14),
    burns: ((bu && bu.items) || []).slice(0, 30),
    equity: pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((x) => x.split("|").map(Number)),
    learn: {
      warmup: { done: Math.min(nReal, L.warmup || 25), need: L.warmup || 25 }, explore: nReal < (L.warmup || 25) ? 1 : r2(Math.max(0.12, 0.5 * Math.exp(-nReal / 120)), 3), modelN: L.model.n,
      playbooks: B.PB_KEYS.map((k) => { const b = L.bandit[k] || {}; return { k, name: B.PLAYBOOKS[k].name, why: B.PLAYBOOKS[k].why, n: r2(b.n || 0, 1), mean: r2(b.mean || 0), winRate: b.n ? r2(((b.wins || 0) / b.n) * 100, 1) : null, real: b.real || 0, paper: b.paper || 0, exits: L.exits[k] }; }),
      weights: B.topWeights(L.model, 8).map(([k, w]) => ({ k, name: B.featureName(k), w: r2(w, 3) })),
      history: (L.history || []).slice(-14).map((h) => ({ day: h.day, n: h.n, means: h.means, changes: h.changes })),
      tails: S.stats.tails || { n: 0, x2: 0, x4: 0, x11: 0 }, runner: B.RUN,
      adds: Object.entries(B.ADD_KINDS).map(([k, name]) => { const a = (L.adds || {})[k] || { n: 0, mean: 0, helped: 0 }; return { k, name, n: a.n, edge: r2(a.mean), helped: a.n ? r2((a.helped / a.n) * 100, 1) : null, live: B.addAllowed(L.adds, k) }; }),
    },
    // how far discovery has read, for checking it's keeping up
    sync: { block: S.hi || null, latest: S.lastBlock || null, swaps: S.swHi || null, pools: Object.values(C).filter((c) => c.ok === 1).length, pending: Object.values(C).filter((c) => c.ok == null).length, err: S.discErr || null },
    watching: Object.values(C).filter((c) => c.ok === 1).sort((a, b) => b.ts - a.ts).slice(0, 12).map((c) => ({ t: c.t, sym: c.sym, ts: c.ts, px: c.px ? Number(c.px.toPrecision(6)) : null, score: c.scan ? c.scan.score ?? null : null, crit: c.scan && c.scan.crit ? c.scan.crit.length : 0, own: !!c.own,
      paid: !!c.paid, links: (() => { const l = linksOf(c); return { web: !!l.web, x: !!l.x, tg: !!l.tg }; })(), reused: !!c.reused })),
    rules: { gates: B.GATES, realGates: B.REAL_GATES, risk: { ...B.RISK, burnPct: CFG.burnPct() }, tradeArcPad: CFG.tradeOwn(), ai: AI.aiEnabled(), playbooks: Object.fromEntries(B.PB_KEYS.map((k) => [k, B.PLAYBOOKS[k].exits])) },
  };
}
/// closed trades of one day (real, and paper with paper=1)
export async function dayTrades(st, day, paper = false) {
  st = st || memStore();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return { error: "day must be YYYY-MM-DD" };
  const d = unpack(await st.get(K.closed(day)).catch(() => null));
  return { day, items: ((d && d.items) || []).filter((r) => paper || r.real).map(slim) };
}
export const _test = { memStore, mem, featuresOf, scanSummary, applySwaps, parseBk, K, unpack };
