// api/_scan.mjs — the server half of the Token Scanner.
//   holderScan(token, { store })  who holds a token, from its own event log:
//        walks the token's logs (Transfer, ownership, pause, upgrade) backwards
//        from the newest block until the mints it has seen add up to the supply
//        (complete history), inside a time budget. With a store the progress is
//        kept, so every later scan only reads new blocks and carries on further
//        back where the last one stopped — old tokens fill in over a few scans.
//   scanToken(token, opts)       the whole scan (api/_scan-core.mjs) run on the
//        server: Telegram /scan and the X share card use it.
//   scanTop / bumpScan            "most scanned this week" (needs the store)
// Works on the edge (no store) and in Node functions (store passed in).
// Two chains (Oct 2026): Arc, and Robinhood Chain (chain: "rh") — the same engine through ctxOf("rh"),
// its own RPC, explorer and store keys (scan/rh-…, scanScore/rh-…), and the pools found for each token
// (Uniswap v3 pools, a Pons curve) labelled so they count as the market, not as holders.
import { rpc, rpcCall, getLogs, latestBlock, blockTs, pool, toQty, ethCalls, isAddr, pad, keccakHex, getCoin, RPCS } from "./_arc.mjs";
import { evmChain } from "./_evm.mjs";
import { RH_CFG } from "./_snap-rh.mjs";
import * as core from "./_scan-core.mjs";

const lc = (a) => String(a || "").toLowerCase();
async function fetchJson(url, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
/// The dry-run trades need eth_call's state-override argument; try each Arc
/// endpoint until one accepts it.
async function rpcSim(method, params) {
  let last;
  for (const url of RPCS) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: ctl.signal }).finally(() => clearTimeout(t));
      const j = await r.json();
      if (j.error) { last = new Error(j.error.message || "rpc error"); if (/override|unsupported|invalid.*param|not supported|too many arguments|expected 2|unknown field/i.test(last.message)) continue; throw last; }
      return j.result;
    } catch (e) { last = e; }
  }
  throw last || new Error("no rpc");
}
// ---- the chain a scan reads: Arc (default) or Robinhood Chain ----
export const EXPLORER_API = "https://explorer.arc.io";
export const EXPLORER_RH = "https://robinhoodchain.blockscout.com";
const ARC = { id: "arc", pre: "", rpc, rpcCall, getLogs, latestBlock, blockTs, ethCalls, rpcSim, chunk: 9000, wave: 10, earlySpan: 3000, snipeBlocks: 20,
  explorer: EXPLORER_API, etherscanId: 5042, split: false };
let RHX = null;
function rhCtx() {
  const ch = evmChain({ rpcs: () => RH_CFG.rpcs(), chainId: 4663, timeoutMs: 12000 });
  // ~0.25 s blocks: wider log windows (halved when the node refuses one), and the launch look spans the same minutes
  return { id: "rh", pre: "rh-", rpc: (b, o) => ch.rpc(b, o), rpcCall: (m, p) => ch.rpcCall(m, p), getLogs: (f) => ch.getLogs(f, 2), latestBlock: () => ch.latestBlock(),
    blockTs: async (n) => { const b = await ch.rpcCall("eth_getBlockByNumber", [toQty(n), false]); return b ? parseInt(b.timestamp, 16) : null; },
    ethCalls: (c, o) => ch.ethCalls(c, o), rpcSim: (m, p) => ch.rpcCall(m, p), chunk: 250000, wave: 4, earlySpan: 6000, snipeBlocks: 40,
    explorer: EXPLORER_RH, etherscanId: 4663, split: true };
}
export const chainId = (c) => (c === "rh" ? "rh" : "arc");
export const ctxOf = (c) => (chainId(c) === "rh" ? (RHX = RHX || rhCtx()) : ARC);
/// the io the shared engine reads through, for one chain
export function ioOf(c) { const C = ctxOf(c); return { rpc: C.rpcCall, rpcSim: C.rpcSim, fetchJson, keccak: (h) => keccakHex(h), chain: C.id }; }
export const io = ioOf("arc");

const TOPIC = {
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  owner: "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0",
  paused: "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258",
  unpaused: "0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa",
  upgraded: "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b",
};
const ZERO = "0x0000000000000000000000000000000000000000";
const MAX_EVENTS = 60, MAX_KEEP = 8000;
const mem = new Map(); // token → state, per server instance

function fresh() { return { v: 3, hi: null, lo: null, complete: false, net: new Map(), got: new Map(), mints: 0n, burns: 0n, transfers: 0, first: null, events: [], deployer: null, lk: new Map(), tr: [] }; }
// v3: who first sent each wallet its tokens (linked wallets), and the latest trades with the pool (who trades)
const MAX_LINKS_MEM = 6000, MAX_LINKS_KEEP = 800, MAX_TRADES = 400;
const marketBy = (lab) => (a) => { const k = lab(a); return !!(k && (k.kind === "pool" || k.kind === "infra")); };
function load(doc) {
  if (!doc || doc.v !== 3) return null; // v3 re-reads each token once to learn who sent whom what
  const toMap = (arr) => new Map((arr || []).map((s) => { const i = String(s).indexOf(":"); return [s.slice(0, i), BigInt(s.slice(i + 1))]; }));
  const lk = new Map((doc.lk || []).map((s) => { const [to, fr, b] = String(s).split(":"); return ["0x" + to, ["0x" + fr, Number(b) || 0]]; }));
  const tr = (doc.tr || []).map((s) => { const [b, w, side] = String(s).split(":"); return [Number(b) || 0, "0x" + w, Number(side) || 0]; });
  return { ...doc, net: toMap(doc.net), got: toMap(doc.got), mints: BigInt(doc.mints || 0), burns: BigInt(doc.burns || 0), events: doc.events || [], hist: doc.hist || [], cand: doc.cand || [], lk, tr };
}
/// Tokens with more wallets than MAX_KEEP are kept "lite": no full balance
/// sheet, just the place in the chain, the counters, the events and the
/// wallets worth re-reading — so they still only scan new blocks.
function save(S, keep) {
  const arr = (m) => [...m.entries()].filter(([, v]) => v !== 0n).map(([a, v]) => `${a}:${v}`);
  // links: the ones about the wallets that matter (largest holders, early buyers) first
  const want = new Set(keep || []);
  const lkAll = [...(S.lk || new Map()).entries()];
  const lk = [...lkAll.filter(([to]) => want.has(to)), ...lkAll.filter(([to]) => !want.has(to))].slice(0, MAX_LINKS_KEEP)
    .map(([to, [fr, b]]) => `${to.slice(2)}:${fr.slice(2)}:${b}`);
  const tr = (S.tr || []).slice(-MAX_TRADES).map(([b, w, side]) => `${b}:${w.slice(2)}:${side}`);
  const base = { v: 3, hi: S.hi, lo: S.lo, complete: S.complete, mints: S.mints.toString(), burns: S.burns.toString(),
    transfers: S.transfers, first: S.first, events: S.events, deployer: S.deployer, hist: (S.hist || []).slice(-90), early: S.early || null, at: Date.now(), lk, tr,
    ...(S.lb ? { lb: S.lb, lbAt: S.lbAt || 0 } : {}) };
  if (S.lite || S.net.size + (S.complete ? 0 : S.got.size) > MAX_KEEP) {
    return { ...base, lite: true, net: [], got: [], cand: (S.cand || []).slice(0, 300), count: S.count || 0 };
  }
  return { ...base, net: arr(S.net), got: S.complete ? [] : arr(S.got) };
}
function take(S, logs, supply, lab = (a) => core.labelOf(a)) {
  const isMarket = marketBy(lab);
  const big = supply > 0n ? supply / 100n : 0n; // 1% of supply = a "large transfer"
  for (const l of logs) {
    const t0 = lc(l.topics && l.topics[0]), b = parseInt(l.blockNumber, 16), tx = l.transactionHash || null;
    if (t0 === TOPIC.transfer && l.topics.length >= 3) {
      const fr = "0x" + l.topics[1].slice(26).toLowerCase(), to = "0x" + l.topics[2].slice(26).toLowerCase();
      const v = BigInt(l.data && l.data !== "0x" ? l.data.slice(0, 66) : "0x0");
      S.transfers++;
      if (fr === ZERO) {
        S.mints += v;
        if (!S.first || b < S.first.block) S.first = { block: b, tx, to };
        S.events.push({ k: "mint", b, v: v.toString(), to, tx });
      } else S.net.set(fr, (S.net.get(fr) || 0n) - v);
      if (to === ZERO) { S.burns += v; if (fr !== ZERO) S.events.push({ k: "burn", b, v: v.toString(), from: fr, tx }); }
      else { S.net.set(to, (S.net.get(to) || 0n) + v); S.got.set(to, (S.got.get(to) || 0n) + v); }
      if (big > 0n && v >= big && fr !== ZERO && to !== ZERO) S.events.push({ k: "big", b, v: v.toString(), from: fr, to, tx });
      if (fr !== ZERO && to !== ZERO) {
        if (isMarket(fr) && !lab(to)) S.tr.push([b, to, 1]);
        else if (isMarket(to) && !lab(fr)) S.tr.push([b, fr, 0]);
        else if (!lab(fr) && !lab(to) && (supply === 0n || v >= supply / 100000n)) {
          // the first wallet that sent this one tokens (the scan runs both ways in time: keep the earliest)
          const cur = S.lk.get(to);
          if ((!cur && S.lk.size < MAX_LINKS_MEM) || (cur && b < cur[1])) S.lk.set(to, [fr, b]);
        }
      }
    } else if (t0 === TOPIC.owner && l.topics.length >= 3) {
      S.events.push({ k: "owner", b, from: "0x" + l.topics[1].slice(26).toLowerCase(), to: "0x" + l.topics[2].slice(26).toLowerCase(), tx });
    } else if (t0 === TOPIC.paused) S.events.push({ k: "pause", b, tx });
    else if (t0 === TOPIC.unpaused) S.events.push({ k: "unpause", b, tx });
    else if (t0 === TOPIC.upgraded && l.topics.length >= 2) S.events.push({ k: "upgrade", b, impl: "0x" + l.topics[1].slice(26).toLowerCase(), tx });
  }
}
function trimEvents(S) {
  const seen = new Set();
  let ev = S.events.filter((e) => { const k = `${e.k}:${e.b}:${e.tx}:${e.v || ""}:${e.to || ""}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.b - b.b);
  // keep every ownership / pause / upgrade event and the mints, only the latest large transfers and burns
  const bigs = ev.filter((e) => e.k === "big" || e.k === "burn").slice(-12);
  ev = ev.filter((e) => (e.k !== "big" && e.k !== "burn") || bigs.includes(e));
  if (ev.length > MAX_EVENTS) ev = [...ev.slice(0, 10), ...ev.slice(-(MAX_EVENTS - 10))];
  S.events = ev;
}

// ---- the first minutes of trading: snipers, bundled buys, deployer hand-outs ----
// Read once per token from one eth_getLogs over the blocks right after it was
// created (C.earlySpan blocks ≈ 25 min: 3,000 at Arc's ~0.5 s blocks, 6,000 at
// Robinhood Chain's ~0.25 s), then only the early wallets' balances are re-read on later scans.
// "Snipers" bought within C.snipeBlocks of the first buy (~10 seconds).
async function earlyLook(S, token, C = ARC, lab = (a) => core.labelOf(a)) {
  if (!S.first || S.first.block == null) return null;
  const EARLY_SPAN = C.earlySpan, SNIPE_BLOCKS = C.snipeBlocks;
  if (!S.early) {
    const L = S.first.block;
    const logs = await C.getLogs({ address: token, fromBlock: toQty(L), toBlock: toQty(L + EARLY_SPAN), topics: [TOPIC.transfer] }).catch(() => null);
    if (!logs) return null;
    const dep = lc(S.deployer || ""), minted = lc(S.first.to || "");
    const isMarket = marketBy(lab);
    const skip = (a) => a === ZERO || !!lab(a) || a === dep || a === minted;
    const tx = logs.map((l) => ({ b: parseInt(l.blockNumber, 16), fr: "0x" + l.topics[1].slice(26).toLowerCase(), to: "0x" + l.topics[2].slice(26).toLowerCase() })).sort((a, b) => a.b - b.b);
    const buys = tx.filter((t) => isMarket(t.fr) && !skip(t.to));
    const lb = buys.length ? buys[0].b : null;
    const snipers = [...new Set(buys.filter((t) => t.b < lb + SNIPE_BLOCKS).map((t) => t.to))];
    const firstBlock = [...new Set(buys.filter((t) => t.b === lb).map((t) => t.to))];
    const handout = [...new Set(tx.filter((t) => (t.fr === dep || t.fr === minted) && !isMarket(t.fr) && !skip(t.to)).map((t) => t.to))];
    S.early = { lb, span: EARLY_SPAN, snipers: snipers.length, sameBlock: firstBlock.length, handout: handout.length, buyers: new Set(buys.map((t) => t.to)).size,
      ws: snipers.slice(0, 30), wh: handout.filter((a) => !snipers.includes(a)).slice(0, 20), fb: firstBlock.slice(0, 30) };
  }
  const e = S.early, ws = e.ws || [], wh = e.wh || [];
  const all = [...ws, ...wh];
  const base = { lb: e.lb, span: e.span, snipers: e.snipers, sameBlock: e.sameBlock, handout: e.handout, buyers: e.buyers, fb: e.fb || [] };
  if (!all.length) return { ...base, held: "0", top: [] };
  const r = await C.ethCalls(all.map((a) => ({ to: token, data: "0x70a08231" + pad(a) }))).catch(() => []);
  const bal = all.map((a, i) => [a, r[i] ? BigInt(r[i]) : 0n, i < ws.length ? "s" : "h"]);
  // "held" counts only the snipers (the hand-out wallets are shown, not scored twice)
  const held = bal.filter((x) => x[2] === "s").reduce((t, [, v]) => t + v, 0n);
  return { ...base, held: held.toString(), top: bal.filter(([, v]) => v > 0n).sort((x, y) => (y[1] > x[1] ? 1 : -1)).slice(0, 12).map(([a, v, k]) => [a, v.toString(), k]) };
}

/// Robinhood Chain: the token's pools, so they count as the market rather than as holders — its Uniswap v3 pools
/// with WETH (each fee tier), its Pons bonding curve, and any other pool Dexscreener lists. Kept 6 hours.
const V3_FEES = [100, 500, 3000, 10000];
export async function poolLabels(token, C = ctxOf("rh")) {
  const R = core.ADDR_RH, out = {};
  const calls = V3_FEES.map((f) => ({ to: R.v3Factory, data: "0x1698ee82" + pad(token) + pad(R.weth) + pad(f.toString(16)) }));
  calls.push({ to: R.ponsV2, data: "0x3cf28b5a" + pad(token) });
  const r = await C.ethCalls(calls).catch(() => []);
  const word = (h, i) => String(h || "").replace(/^0x/, "").slice(i * 64, i * 64 + 64);
  V3_FEES.forEach((f, i) => { const a = r[i] ? "0x" + word(r[i], 0).slice(24) : null; if (a && isAddr(a) && !/^0x0{40}$/.test(a)) out[a] = { name: `Uniswap v3 pool (${f / 10000}%)`, kind: "pool" }; });
  const L = r[V3_FEES.length];
  if (L && word(L, 14) && BigInt("0x" + word(L, 14)) === 1n) { const curve = "0x" + word(L, 1).slice(24); if (isAddr(curve) && !/^0x0{40}$/.test(curve)) out[curve] = { name: "Pons curve", kind: "pool" }; }
  const j = await fetchJson(`https://api.dexscreener.com/token-pairs/v1/robinhood/${token}`, 5000);
  for (const p of Array.isArray(j) ? j : []) {
    const a = lc(p && p.pairAddress);
    if (isAddr(a) && !out[a] && !core.labelOf(a)) out[a] = { name: `${p.dexId ? String(p.dexId).charAt(0).toUpperCase() + String(p.dexId).slice(1) : "DEX"} pool`, kind: "pool" };
  }
  return out;
}
/// eth_getLogs over [a, b], halved until the node takes it (Robinhood Chain's wide windows)
async function logsSplit(C, f, a, b, depth = 0) {
  try { return await C.getLogs({ ...f, fromBlock: toQty(a), toBlock: toQty(b) }); }
  catch (e) {
    if (b - a < 100 || depth > 10) throw e;
    const m = Math.floor((a + b) / 2);
    return [...(await logsSplit(C, f, a, m, depth + 1)), ...(await logsSplit(C, f, m + 1, b, depth + 1))];
  }
}

/// store: { get(key) → doc | null, set(key, doc) } — or null (edge: one pass, nothing kept).
/// chain: "arc" (default) or "rh" (Robinhood Chain).
export async function holderScan(token, { store = null, budgetMs = 6500, maxChunks = 400, chain = "arc" } = {}) {
  if (!isAddr(token)) throw Object.assign(new Error("not an address"), { status: 400 });
  token = lc(token);
  const C = ctxOf(chain), CHUNK = C.chunk, WAVE = C.wave;
  const t0 = Date.now();
  const [supHex, decHex] = await C.ethCalls([{ to: token, data: "0x18160ddd" }, { to: token, data: "0x313ce567" }]);
  if (supHex == null) throw Object.assign(new Error("not an ERC-20 token (no totalSupply)"), { status: 404 });
  const supply = BigInt(supHex), decimals = decHex ? Number(BigInt(decHex)) : 18;
  const key = `scan/${C.pre}${token}`, mk = C.pre + token;
  let S = mem.get(mk) || null;
  if (!S && store) { try { S = load(await store.get(key)); } catch { S = null; } }
  if (!S) S = fresh();
  const [latest] = await Promise.all([C.latestBlock(),
    C.id === "rh" && (!S.lb || Date.now() - (S.lbAt || 0) > 6 * 3600e3) ? poolLabels(token, C).then((lb) => { S.lb = { ...(S.lb || {}), ...lb }; S.lbAt = Date.now(); }).catch(() => null) : null]);
  const lab = (a) => core.labelOf(a, S.lb);
  const left = () => budgetMs - (Date.now() - t0);
  const logsIn = (a, b) => (C.split ? logsSplit(C, { address: token }, a, b) : C.getLogs({ address: token, fromBlock: toQty(a), toBlock: toQty(b) }));
  let chunks = 0;
  // 1. new blocks since the last scan (forward, contiguous)
  if (S.hi != null && latest.number > S.hi) {
    while (S.hi < latest.number && left() > 1500 && chunks < maxChunks) {
      const ranges = [];
      let a = S.hi + 1;
      for (let k = 0; k < WAVE && a <= latest.number; k++) { const b = Math.min(latest.number, a + CHUNK - 1); ranges.push([a, b]); a = b + 1; }
      const logs = (await pool(ranges, WAVE, ([x, y]) => logsIn(x, y))).flat();
      take(S, logs, supply, lab);
      S.hi = ranges[ranges.length - 1][1];
      chunks += ranges.length;
    }
  }
  // 2. further back, until the mints cover the supply
  if (S.hi == null) { S.hi = latest.number; S.lo = latest.number + 1; }
  while (!S.complete && S.lo > 0 && left() > 1500 && chunks < maxChunks) {
    const ranges = [];
    let hi = S.lo - 1;
    for (let k = 0; k < WAVE && hi >= 0; k++) { const a = Math.max(0, hi - CHUNK + 1); ranges.push([a, hi]); hi = a - 1; }
    const logs = (await pool(ranges, WAVE, ([x, y]) => logsIn(x, y))).flat();
    take(S, logs, supply, lab);
    S.lo = ranges[ranges.length - 1][0];
    chunks += ranges.length;
    if (supply > 0n && S.mints - S.burns >= supply) S.complete = true;
    else if (S.lo === 0) S.complete = S.mints > 0n;
  }
  if (!S.complete && supply > 0n && S.mints - S.burns >= supply) S.complete = true;
  trimEvents(S);
  // Candidates → real balances (fee-on-transfer / rebasing tokens stay right).
  const byDesc = (x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0);
  const cand = S.lite
    ? [...new Set([...(S.cand || []), ...[...S.got.entries()].sort(byDesc).slice(0, 100).map(([a]) => a)])].slice(0, 250)
    : S.complete
    ? [...S.net.entries()].filter(([, v]) => v > 0n).sort(byDesc).slice(0, 150).map(([a]) => a)
    : [...new Set([
      ...[...S.got.entries()].sort(byDesc).slice(0, 120).map(([a]) => a),
      ...[...S.net.entries()].filter(([, v]) => v < 0n).sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0)).slice(0, 30).map(([a]) => a),
    ])];
  const bals = [];
  for (let i = 0; i < cand.length; i += 50) {
    const part = cand.slice(i, i + 50);
    const r = await C.ethCalls(part.map((a) => ({ to: token, data: "0x70a08231" + pad(a) })));
    part.forEach((a, k) => bals.push([a, r[k] ? BigInt(r[k]) : 0n]));
  }
  const top = bals.filter(([, v]) => v > 0n).sort(byDesc).slice(0, 25);
  // which of the biggest wallets are contracts (vaults, pools, lockers) rather than people
  let codes = [];
  try {
    const out = await C.rpc(top.map(([a], id) => ({ jsonrpc: "2.0", id, method: "eth_getCode", params: [a, "latest"] })));
    const byId = new Map((Array.isArray(out) ? out : [out]).map((x) => [x.id, x.result]));
    codes = top.map((_, i) => { const c = byId.get(i); return !!(c && c !== "0x"); });
  } catch { codes = []; }
  // how many transactions each of the biggest wallets has ever sent (0–2 = a fresh wallet)
  let nonces = [];
  try {
    const out = await C.rpc(top.map(([a], id) => ({ jsonrpc: "2.0", id, method: "eth_getTransactionCount", params: [a, "latest"] })));
    const byId = new Map((Array.isArray(out) ? out : [out]).map((x) => [x.id, x.result]));
    nonces = top.map((_, i) => { const n = byId.get(i); return n ? parseInt(n, 16) : null; });
  } catch { nonces = []; }
  if (S.complete && S.first && S.first.tx && !S.deployer) {
    try { const tx = await C.rpcCall("eth_getTransactionByHash", [S.first.tx]); if (tx && tx.from) S.deployer = lc(tx.from); } catch { /* next time */ }
  }
  const early = S.complete ? await earlyLook(S, token, C, lab).catch(() => null) : null;
  // timestamps for the timeline (a few at most per request, then kept)
  const need = S.events.filter((e) => e.ts == null).slice(-16);
  await Promise.all(need.map(async (e) => { e.ts = await C.blockTs(e.b).catch(() => null); }));
  const firstTs = S.first ? (S.events.find((e) => e.k === "mint" && e.b === S.first.block) || {}).ts || null : null;
  let holderCount = S.complete && !S.lite ? [...S.net.values()].filter((v) => v > 0n).length : top.length;
  if (S.lite) holderCount = Math.max(S.count || 0, top.length);
  if (!S.lite && S.net.size + (S.complete ? 0 : S.got.size) > MAX_KEEP) { S.lite = true; S.count = holderCount; }
  if (S.lite) { S.cand = bals.filter(([, v]) => v > 0n).sort(byDesc).slice(0, 300).map(([a]) => a); S.count = holderCount; S.net = new Map(); S.got = new Map(); }
  // one holder count per day, for the growth chart
  const day = new Date().toISOString().slice(0, 10);
  S.hist = (S.hist || []).filter((x) => x.d !== day).concat([{ d: day, n: holderCount }]).slice(-90);
  // v3: linked wallets among the largest holders, and who does the trading
  S.tr = (S.tr || []).sort((x, y) => x[0] - y[0]).slice(-MAX_TRADES);
  const topSet = top.map(([a]) => a);
  const fanout = new Map();
  for (const [, [fr]] of S.lk || new Map()) fanout.set(fr, (fanout.get(fr) || 0) + 1);
  // a sender that handed tokens to very many wallets is an airdrop or a distributor, not one person's wallets
  const links = [...new Set([...topSet, ...((early && early.fb) || [])])].map((a) => { const l = (S.lk || new Map()).get(a); return l && (fanout.get(l[0]) || 0) <= 25 ? [a, l[0]] : null; }).filter(Boolean);
  const flow = flowOf(S.tr);
  mem.set(mk, S);
  if (mem.size > 300) mem.delete(mem.keys().next().value);
  if (store) { const doc = save(S, [...topSet, ...((early && early.fb) || [])]); if (doc) { try { await store.set(key, doc); } catch { /* memory copy still works */ } } }
  const fromTs = await C.blockTs(S.lo).catch(() => null);
  return {
    v: 3, chain: C.id, token, supply: supply.toString(), decimals, complete: S.complete, more: !S.complete && S.lo > 0 && !!store,
    transfers: S.transfers, fromBlock: S.lo, toBlock: S.hi, fromTs, nowTs: latest.ts,
    firstMint: S.complete && S.first ? { block: S.first.block, ts: firstTs, tx: S.first.tx, to: S.first.to } : null,
    deployer: S.deployer, holderCount, holderCountExact: S.complete && !S.lite, hist: S.hist,
    top: top.map(([a, v], i) => { const f = {}; if (codes[i]) f.c = 1; if (nonces[i] != null) f.n = nonces[i]; return Object.keys(f).length ? [a, v.toString(), f] : [a, v.toString()]; }),
    early, links, flow, labels: S.lb && Object.keys(S.lb).length ? S.lb : null,
    events: S.events.map((e) => ({ ...e })),
  };
}
/// The latest trades with the pool → how many, how many wallets on each side, and how much the busiest 3 wallets make up.
function flowOf(tr) {
  if (!tr || !tr.length) return null;
  const by = new Map(), buyers = new Set(), sellers = new Set();
  for (const [, w, side] of tr) { by.set(w, (by.get(w) || 0) + 1); (side ? buyers : sellers).add(w); }
  const counts = [...by.values()].sort((a, b) => b - a);
  const top3 = counts.slice(0, 3).reduce((t, n) => t + n, 0) / tr.length;
  const repeat = [...by.entries()].filter(([w, n]) => n >= 4 && buyers.has(w) && sellers.has(w)).length;
  return { n: tr.length, buyers: buyers.size, sellers: sellers.size, wallets: by.size, top3: Math.round(top3 * 1000) / 1000, repeat, from: tr[0][0], to: tr[tr.length - 1][0],
    busiest: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => [w, n, buyers.has(w) ? 1 : 0, sellers.has(w) ? 1 : 0]) };
}

/// Every holder of a token with its balance (Multisender "airdrop to holders").
/// Runs holderScan to bring the balance sheet up to date first; until the scan
/// has reached the token's first mint the list is partial (more: true — call
/// again). Tokens with more than MAX_KEEP wallets only have their largest
/// holders (lite: true). The biggest 1,000 are flagged when they're contracts.
export async function holderSnapshot(token, { store = null, budgetMs = 7000, limit = 5000, chain = "arc" } = {}) {
  limit = Math.max(1, Math.min(MAX_KEEP, Number(limit) || 5000));
  const C = ctxOf(chain);
  const out = await holderScan(token, { store, budgetMs, chain: C.id });
  const t = lc(token);
  let S = mem.get(C.pre + t) || null;
  if (!S && store) { try { S = load(await store.get(`scan/${C.pre}${t}`)); } catch { S = null; } }
  const byDesc = (x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0);
  let list, lite = false;
  if (S && S.complete && !S.lite) list = [...S.net.entries()].filter(([, v]) => v > 0n).sort(byDesc);
  else { lite = !!(S && S.lite); list = out.top.map(([a, v]) => [a, BigInt(v)]); }
  list = list.slice(0, limit);
  const flags = new Map();
  const head = list.slice(0, 1000).map(([a]) => a);
  for (let i = 0; i < head.length; i += 100) {
    const part = head.slice(i, i + 100);
    try {
      const r = await C.rpc(part.map((a, id) => ({ jsonrpc: "2.0", id, method: "eth_getCode", params: [a, "latest"] })));
      const byId = new Map((Array.isArray(r) ? r : [r]).map((x) => [x.id, x.result]));
      part.forEach((a, k) => { const c = byId.get(k); if (c && c !== "0x") flags.set(a, 1); });
    } catch { /* unflagged */ }
  }
  // Which block the balances are for: the scanned-up-to block for the
  // event-log sheet, "now" for the balanceOf reads of a very wide token.
  const exact = S && S.complete && !S.lite;
  return {
    token: t, decimals: out.decimals, supply: out.supply, complete: out.complete && !lite, more: out.more, lite,
    block: exact ? out.toBlock : null, ts: out.nowTs || null, deployer: out.deployer || null, hist: out.hist || [], firstMint: out.firstMint || null,
    holderCount: out.holderCount, checkedContracts: head.length,
    holders: list.map(([a, v]) => (flags.has(a) ? [a, v.toString(), 1] : [a, v.toString()])),
  };
}

/// Market for a launchpad token Dexscreener hasn't listed yet, read from the chain.
export async function marketFallback(addr, { arcpad, argus, pons }) {
  // Robinhood Chain: a Pons token Dexscreener hasn't listed trades on its curve (or the v4 pool Pons made for it)
  if (pons) return { source: "pons", pairs: [], phase: pons.phase || "curve" };
  if (arcpad) {
    const coin = await getCoin(addr).catch(() => null);
    return { source: "arcpad", pairs: [], price: coin && coin.priceUsd, mcap: coin && coin.mcapUsd, created: arcpad.launchedAt || null,
      links: [["Website", arcpad.website], ["Twitter", arcpad.twitter], ["Telegram", arcpad.telegram]].filter(([, u]) => /^https:\/\//.test(u || "")).map(([t, u]) => ({ t, u })) };
  }
  if (argus) return { source: "argus", pairs: [] };
  return null;
}

// ---- v3: published source, the deployer's other contracts, same-code tokens ----
// The explorer is the chain's Blockscout (keyless API: Arc's, or Robinhood Chain's); an
// Etherscan API key (ETHERSCAN_API_KEY, optional) is the fallback. Answers are kept a day.
const cacheMem = new Map();
async function cached(store, key, maxAgeMs, fn) {
  const m = cacheMem.get(key);
  if (m && Date.now() - m.at < maxAgeMs) return m.v;
  if (store) { try { const d = await store.get(key); if (d && Date.now() - (d.at || 0) < maxAgeMs) { cacheMem.set(key, { at: d.at, v: d.v }); return d.v; } } catch { /* read through */ } }
  const v = await fn();
  if (v != null) {
    cacheMem.set(key, { at: Date.now(), v });
    if (cacheMem.size > 800) cacheMem.delete(cacheMem.keys().next().value);
    if (store) { try { await store.set(key, { at: Date.now(), v }); } catch { /* memory copy */ } }
  }
  return v;
}
async function blockscoutVerified(a, base = EXPLORER_API) {
  const j = await fetchJson(`${base}/api/v2/addresses/${a}`, 7000);
  if (!j || typeof j !== "object" || !("is_contract" in j || "is_verified" in j)) return null;
  const impls = (j.implementations || []).map((x) => lc(x.address_hash || x.address || "")).filter(isAddr);
  let name = j.name || "", compiler = "";
  if (j.is_verified) {
    const sc = await fetchJson(`${base}/api/v2/smart-contracts/${a}`, 7000);
    if (sc) { name = sc.name || name; compiler = sc.compiler_version || ""; }
  }
  return { verified: !!j.is_verified, name, compiler, impls, creator: isAddr(j.creator_address_hash) ? lc(j.creator_address_hash) : null };
}
async function etherscanVerified(a, chainid = 5042) {
  const key = String(process.env.ETHERSCAN_API_KEY || "").trim();
  if (!key) return null;
  const j = await fetchJson(`https://api.etherscan.io/v2/api?chainid=${chainid}&module=contract&action=getsourcecode&address=${a}&apikey=${encodeURIComponent(key)}`, 7000);
  const r = j && Array.isArray(j.result) ? j.result[0] : null;
  if (!r) return null;
  return { verified: !!(r.SourceCode && String(r.SourceCode).length > 0), name: r.ContractName || "", compiler: r.CompilerVersion || "", impls: isAddr(r.Implementation) ? [lc(r.Implementation)] : [] };
}
/// the explorer's answer right now, no cache (CirclePad's "source verified" badge): true / false, or null when no explorer answered
export async function verifiedNow(addr, chain = "arc") {
  addr = lc(addr);
  if (!isAddr(addr)) return null;
  const C = ctxOf(chain);
  const r = (await blockscoutVerified(addr, C.explorer).catch(() => null)) || (await etherscanVerified(addr, C.etherscanId).catch(() => null));
  return r ? !!r.verified : null;
}
/// → { verified, name, compiler, impl?: { verified, name } } or null when no explorer answered
export async function sourceOf(addr, impl, store = null, chain = "arc") {
  addr = lc(addr);
  if (!isAddr(addr)) return null;
  const C = ctxOf(chain);
  return cached(store, `scanSrc/${C.pre}${addr}`, 24 * 3600e3, async () => {
    const one = async (a) => (await blockscoutVerified(a, C.explorer).catch(() => null)) || (await etherscanVerified(a, C.etherscanId).catch(() => null));
    const me = await one(addr);
    if (!me) return null;
    const im = impl ? lc(impl) : me.impls && me.impls[0];
    if (im && isAddr(im) && im !== addr) {
      const i2 = await one(im);
      // behind a proxy what matters is the logic contract's code
      if (i2) return { verified: i2.verified, name: i2.name || me.name, compiler: i2.compiler || me.compiler, proxyVerified: me.verified, impl: im };
    }
    return { verified: me.verified, name: me.name, compiler: me.compiler };
  });
}
/// The contracts the deployer created (explorer), with their cached scanner scores.
export async function deployerOf(dep, exclude, store = null, chain = "arc") {
  dep = lc(dep); exclude = lc(exclude);
  if (!isAddr(dep)) return null;
  const C = ctxOf(chain);
  const base = await cached(store, `scanDep/${C.pre}${dep}`, 6 * 3600e3, async () => {
    const j = await fetchJson(`${C.explorer}/api?module=account&action=txlist&address=${dep}&sort=desc&page=1&offset=200`, 8000);
    if (!j || !Array.isArray(j.result)) return null;
    const made = j.result.filter((t) => t && (!t.to || t.to === "") && isAddr(t.contractAddress) && lc(t.from) === dep && String(t.isError || "0") === "0")
      .map((t) => ({ a: lc(t.contractAddress), ts: Number(t.timeStamp) || null }));
    let nonce = null;
    try { nonce = parseInt(await C.rpcCall("eth_getTransactionCount", [dep, "latest"]), 16); } catch { nonce = null; }
    return { addr: dep, created: made.length, list: made.slice(0, 24), nonce, capped: j.result.length >= 200 };
  });
  if (!base) return null;
  const others = base.list.filter((x) => x.a !== exclude).slice(0, 12);
  const docs = await Promise.all(others.map((x) => scoreOf(x.a, { store, compute: false, chain: C.id }).catch(() => null)));
  const tokens = others.map((x, i) => { const d = docs[i]; return d && !d.notToken && d.score != null ? { token: x.a, sym: d.sym || "", score: d.score, k: d.k, ts: x.ts } : { token: x.a, ts: x.ts, score: null }; });
  return { addr: dep, created: base.created, nonce: base.nonce, capped: base.capped, tokens };
}
/// Other scanned tokens whose running code has exactly the same functions (the same template).
export async function clonesOf(fp, addr, store = null, chain = "arc") {
  if (!store || !/^[0-9a-f]{16}$/.test(String(fp || ""))) return null;
  let doc = null;
  try { doc = await store.get(`scanFp/${ctxOf(chain).pre}${fp}`); } catch { return null; }
  const items = ((doc && doc.items) || []).map((s) => { const [t, sym, sc, at, crit] = String(s).split("|"); return { token: t, sym, score: sc === "" ? null : Number(sc), at: Number(at) || 0, crit: crit || null }; })
    .filter((x) => isAddr(x.token) && x.token !== lc(addr));
  return { fp, items: items.slice(0, 20) };
}
async function fpRemember(store, fp, token, sym, score, crit, chain = "arc") {
  if (!store || !/^[0-9a-f]{16}$/.test(String(fp || ""))) return;
  try {
    const key = `scanFp/${ctxOf(chain).pre}${fp}`, doc = (await store.get(key)) || { items: [] };
    const items = (doc.items || []).filter((x) => String(x).split("|")[0] !== lc(token));
    items.unshift(`${lc(token)}|${String(sym || "").replace(/\|/g, "").slice(0, 16)}|${score == null ? "" : score}|${Date.now()}|${String(crit || "").replace(/\|/g, "/").slice(0, 60)}`);
    await store.set(key, { items: items.slice(0, 40) });
  } catch { /* best effort */ }
}

/// The whole scan, server side.
export async function scanToken(addr, { store = null, budgetMs = 6000, chain = "arc" } = {}) {
  const C = ctxOf(chain);
  // the liquidity lock row (Arc): only when the position index already knows the token (a short read)
  const lpP = C.id === "arc" ? import("./_liquidity.mjs").then((L) => L.run(addr, { store, budgetMs: 2500 })).then((j) => core.lpSummary(j)).catch(() => null) : null;
  const sio = { ...ioOf(C.id), source: (a, i) => sourceOf(a, i, store, C.id) };
  return core.scanAll(sio, addr, {
    holders: (a) => holderScan(a, { store, budgetMs, chain: C.id }), marketFallback, lp: lpP,
    clones: (fp, a) => clonesOf(fp, a, store, C.id), deployer: (d, a) => deployerOf(d, a, store, C.id),
    block: () => C.latestBlock().then((b) => b.number), // asked for only when the scan gets that far
  });
}

// ---- "most scanned this week" ----
const TOP_KEY = "scanTop/v1";
const topKey = (chain) => (chainId(chain) === "rh" ? "scanTop/rh-v1" : TOP_KEY);
const seenBump = new Map();
export async function bumpScan(store, token, symbol, chain = "arc") {
  if (!store) return;
  token = lc(token);
  const sk = ctxOf(chain).pre + token, last = seenBump.get(sk) || 0;
  if (Date.now() - last < 5 * 60e3) return; // one count per token per instance every 5 minutes
  seenBump.set(sk, Date.now());
  try {
    const TOP_KEY = topKey(chain);
    const doc = (await store.get(TOP_KEY)) || { items: [] };
    const week = Date.now() - 7 * 86400e3;
    const items = (doc.items || []).map((s) => { const [t, sym, n, at] = String(s).split("|"); return { t, sym, n: Number(n) || 0, at: Number(at) || 0 }; }).filter((x) => x.at > week);
    const it = items.find((x) => x.t === token);
    if (it) { it.n++; it.at = Date.now(); if (symbol) it.sym = symbol; } else items.push({ t: token, sym: symbol || "", n: 1, at: Date.now() });
    items.sort((a, b) => b.n - a.n);
    await store.set(TOP_KEY, { items: items.slice(0, 40).map((x) => `${x.t}|${String(x.sym).replace(/\|/g, "").slice(0, 16)}|${x.n}|${x.at}`) });
  } catch { /* best effort */ }
}
export async function scanTop(store, chain = "arc") {
  if (!store) return [];
  try {
    const doc = await store.get(topKey(chain));
    const week = Date.now() - 7 * 86400e3;
    return ((doc && doc.items) || []).map((s) => { const [t, sym, n, at] = String(s).split("|"); return { token: t, symbol: sym, scans: Number(n) || 0, at: Number(at) || 0 }; })
      .filter((x) => x.at > week && isAddr(x.token)).slice(0, 12);
  } catch { return []; }
}

// ---- v4: recent score drops (the scanner's front page) ----
const dropKey = (chain) => (chain === "rh" ? "scanDrops/rh" : chain === "sol" ? "scanDrops/sol" : "scanDrops/v1");
/// keeps the last 20 drops of 10+ points from the last 3 days, one per token
export async function recordDrop(store, chain, token, sym, from, to, crit = []) {
  if (!store) return;
  const doc = (await store.get(dropKey(chain)).catch(() => null)) || { items: [] };
  const since = Date.now() - 3 * 86400e3;
  const items = (doc.items || []).map((x) => String(x).split("|")).filter((x) => Number(x[4]) > since && x[0] !== String(token));
  items.unshift([String(token), String(sym || "").replace(/\|/g, "").slice(0, 16), from, to, Date.now(), String((crit || [])[0] || "").replace(/\|/g, "").slice(0, 60)]);
  await store.set(dropKey(chain), { items: items.slice(0, 20).map((x) => x.join("|")) });
}
export async function scanDrops(store, chain = "arc") {
  if (!store) return [];
  try {
    const doc = await store.get(dropKey(chain));
    const since = Date.now() - 3 * 86400e3;
    return ((doc && doc.items) || []).map((s2) => { const [t, sym, from, to, at, crit] = String(s2).split("|"); return { token: t, symbol: sym, from: Number(from), to: Number(to), at: Number(at), crit: crit || "" }; })
      .filter((x) => x.at > since && x.token).slice(0, 12);
  } catch { return []; }
}
/// v4: the ERC-20 tokens a wallet holds (the chain's Blockscout), with their cached scanner scores
export async function walletTokens(wallet, store, chain = "arc") {
  const C = ctxOf(chain);
  const j = await fetchJson(`${C.explorer}/api/v2/addresses/${lc(wallet)}/tokens?type=ERC-20`, 9000);
  if (!j || !Array.isArray(j.items)) return null;
  const list = j.items.map((it) => {
    const t = it.token || {}, addr = lc(t.address_hash || t.address || "");
    const dec = Number(t.decimals || 18), bal = Number(it.value || 0) / 10 ** dec;
    const rate = t.exchange_rate != null ? Number(t.exchange_rate) : null;
    return { token: addr, symbol: String(t.symbol || "").slice(0, 16), name: String(t.name || "").slice(0, 40), bal, usd: rate != null && isFinite(rate) ? bal * rate : null };
  }).filter((x) => isAddr(x.token) && x.bal > 0).slice(0, 60);
  await Promise.all(list.map(async (x) => {
    const d = await scoreOf(x.token, { store, compute: false, chain: C.id }).catch(() => null);
    if (d && !d.notToken && d.score != null) { x.score = d.score; x.k = d.k; x.t = d.t; x.crit = d.crit || []; }
  }));
  list.sort((a, b) => (b.usd || 0) - (a.usd || 0) || (a.score == null) - (b.score == null));
  return { wallet: lc(wallet), chain: C.id, tokens: list };
}

// ---- cached server scores: Explore badges, the embeddable badge, the public API ----
const scoreMem = new Map();
/// → { score, k, t (verdict), sym, at, crit, conf, sub, cmp, prev } — from the store when fresh, else a new server scan.
export async function scoreOf(token, { store = null, maxAgeMs = 30 * 60e3, compute = true, chain = "arc" } = {}) {
  token = lc(token);
  const C = ctxOf(chain), key = `scanScore/${C.pre}${token}`, mk = C.pre + token;
  let hit = scoreMem.get(mk) || null;
  if (!hit && store) { try { hit = await store.get(key); } catch { hit = null; } }
  if (hit && Date.now() - (hit.at || 0) < maxAgeMs && hit.v === core.CORE_VERSION) { scoreMem.set(mk, hit); return hit; }
  if (!compute) return hit && hit.v === core.CORE_VERSION ? hit : hit ? { ...hit, stale: true } : null;
  const out = await scanToken(token, { store, budgetMs: 5000, chain: C.id });
  return rememberScore(token, out, { store, hit, chain: C.id });
}
/// Keeps a finished server scan as the token's score doc (and in the same-code index).
export async function rememberScore(token, out, { store = null, hit = undefined, chain = "arc" } = {}) {
  token = lc(token);
  const C = ctxOf(chain), key = `scanScore/${C.pre}${token}`, mk = C.pre + token;
  if (hit === undefined) { hit = scoreMem.get(mk) || null; if (!hit && store) { try { hit = await store.get(key); } catch { hit = null; } } }
  const r = out.res;
  const today = new Date().toISOString().slice(0, 10);
  const cmp = r.notToken ? null : core.compactOf(r, out.c);
  // the snapshot to compare with: the last one that's at least an hour older
  const prev = hit && hit.cmp && cmp && cmp.at - (hit.cmp.at || 0) >= 3600e3 ? hit.cmp : (hit && hit.prev) || null;
  const doc = r.notToken ? { v: core.CORE_VERSION, notToken: true, at: Date.now() }
    : { v: core.CORE_VERSION, score: r.score, k: r.verdict.k, t: r.verdict.t, sym: (out.c && out.c.symbol) || "", reasons: r.reasons.map((x) => `${x.status}|${x.title}`),
      trade: r.rows.filter((x) => x.group === "trade").map((x) => `${x.status}|${x.title}`), at: Date.now(),
      crit: (r.critical || []).map((x) => x.title), conf: r.confidence, sub: Object.fromEntries(Object.entries(r.sub || {}).map(([k2, v]) => [k2, v.score])),
      fp: (out.c && out.c.fp) || null, cmp, prev, summary: core.summaryText(r.summary),
      // one score per day, for the "score over time" line on the scanner
      hist: ((hit && hit.hist) || []).filter((x) => String(x).split("|")[0] !== today).concat([`${today}|${r.score}`]).slice(-60) };
  scoreMem.set(mk, doc);
  if (scoreMem.size > 2000) scoreMem.delete(scoreMem.keys().next().value);
  // v4: a big drop goes on the "score drops" list on the scanner's front page
  if (!r.notToken && hit && hit.score != null && hit.score - r.score >= 10) recordDrop(store, C.id, token, doc.sym, hit.score, r.score, doc.crit).catch(() => null);
  if (store) { try { await store.set(key, doc); } catch { /* memory copy */ } }
  const codeCrit = (r.critical || []).find((x) => ["sim", "fresh", "size", "power", "proxy"].includes(x.id));
  if (!r.notToken && out.c && out.c.fp && !(out.x && (out.x.arcpad || out.x.argus || out.x.pons))) fpRemember(store, out.c.fp, token, out.c.symbol, r.score, codeCrit ? codeCrit.title : "", C.id);
  return doc;
}
/// The public JSON shape (GET /api/v1/scan/<address>).
export async function apiResult(token, { store = null, chain = "arc" } = {}) {
  const C = ctxOf(chain);
  const out = await scanToken(token, { store, budgetMs: 5500, chain: C.id });
  const r = out.res, c = out.c || {};
  if (r.notToken) return { token: lc(token), chain: C.id, token_standard: null, verdict: null, checks: r.rows.map(({ group, status, title, detail }) => ({ group, status, title, detail })) };
  rememberScore(token, out, { store, chain: C.id }).catch(() => null);
  const d = r.dist, m = r.market;
  return {
    token: lc(token), chain: C.id, name: c.name, symbol: c.symbol, decimals: c.decimals, supply: c.supply,
    score: r.score, verdict: r.verdict.t, reasons: r.reasons,
    confidence: r.confidence, unknown: r.missing, critical: (r.critical || []).map((x) => x.title),
    sections: Object.fromEntries(Object.entries(r.sub || {}).map(([k, v]) => [k, v.score])),
    summary: core.summaryText(r.summary),
    checks: r.rows.map(({ group, status, title, detail, pts, addr, src, crit }) => ({ group, status, title, detail, points: pts || 0, source: src || "chain", ...(crit ? { critical: true } : {}), ...(addr ? { address: addr } : {}) })),
    market: m ? { source: m.source, price_usd: m.price ?? null, market_cap_usd: m.mcap ?? null, liquidity_usd: m.liq ?? null, pool_created: m.created ?? null } : null,
    holders: d ? { count: d.holders, exact: d.exact, top10_pct: d.S ? (d.top10 / d.S) * 100 : null, deployer: d.deployer, linked_top_pct: d.clusters && d.clusters[0] ? d.clusters[0].pct : null } : null,
    block: r.block || null, engine: core.CORE_VERSION, scanner: core.SCANNER_VERSION, scanned_at: new Date().toISOString(),
    page: C.id === "rh" ? `https://www.arcircle.app/arc#scanner?c=rh&t=${lc(token)}` : `https://www.arcircle.app/s/${lc(token)}`,
  };
}
/// Embeddable badge (/badge/<address>): "Scanned by ARCIRCLE | 82/100 · Looks OK".
/// style "card" is a bigger tile with a score ring, the ticker and the scan date.
export function badgeSvg(doc, style = "pill") {
  const esc = (x) => String(x).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const ok = doc && !doc.notToken && Number.isFinite(doc.score);
  const col = !ok ? "#5b6472" : doc.k === "ok" ? "#1f9d57" : doc.k === "care" ? "#c98a12" : "#d0473a";
  const glow = !ok ? "#9aa4b2" : doc.k === "ok" ? "#39ff88" : doc.k === "care" ? "#ffc861" : "#ff6e5a";
  const verdict = !doc ? "not scanned" : doc.notToken ? "not a token" : doc.t;
  const mark = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke-width="1.7"><circle cx="5" cy="6" r="4.3" stroke="#35d8d0"/><circle cx="11" cy="6" r="4.3" stroke="#39ff88"/></g>`;
  const FONT = 'font-family="Verdana,DejaVu Sans,Geneva,sans-serif"';
  if (style === "card") {
    const sym = ok && doc.sym ? "$" + String(doc.sym).slice(0, 12) : "Arc token";
    const score = ok ? doc.score : null;
    const C = 2 * Math.PI * 22, dash = score == null ? 0 : (C * score) / 100;
    const date = doc && doc.at ? new Date(doc.at).toISOString().slice(0, 10) : "";
    const label = `Scanned by ARCIRCLE: ${ok ? `${sym} ${score}/100, ${verdict}` : verdict}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="76" viewBox="0 0 260 76" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>
<rect x=".5" y=".5" width="259" height="75" rx="12" fill="#0b1320" stroke="${glow}" stroke-opacity=".55"/>
<circle cx="38" cy="38" r="22" fill="none" stroke="#1d2a38" stroke-width="6"/>
${score == null ? "" : `<circle cx="38" cy="38" r="22" fill="none" stroke="${glow}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 38 38)"/>`}
<text x="38" y="${score == null ? 42 : 43}" text-anchor="middle" ${FONT} font-size="${score == null ? 11 : 15}" font-weight="bold" fill="#fff">${score == null ? "—" : score}</text>
<text x="74" y="27" ${FONT} font-size="14" font-weight="bold" fill="#fff">${esc(sym)}</text>
<text x="74" y="44" ${FONT} font-size="11" font-weight="bold" fill="${glow}">${esc(ok ? `${score}/100 · ${verdict}` : verdict)}</text>
${mark(74, 53, 0.85)}<text x="90" y="63" ${FONT} font-size="9" fill="#9fb0c4">Scanned by ARCIRCLE${date ? ` · ${date}` : ""}</text></svg>`;
  }
  const left = "Scanned by ARCIRCLE";
  const right = ok ? `${doc.score}/100 · ${verdict}` : verdict;
  const lt = Math.round(left.length * 6.3), rt = Math.round(right.length * 7.1); // Verdana 11px, bold on the right
  const lw = 24 + lt + 8, rw = rt + 16, W = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="22" role="img" aria-label="${esc(left)}: ${esc(right)}"><title>${esc(left)}: ${esc(right)}</title>
<linearGradient id="arcb-g${W}" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="arcb-r${W}"><rect width="${W}" height="22" rx="4"/></clipPath>
<g clip-path="url(#arcb-r${W})"><rect width="${lw}" height="22" fill="#0b1320"/><rect x="${lw}" width="${rw}" height="22" fill="${col}"/><rect width="${W}" height="22" fill="url(#arcb-g${W})"/></g>
${mark(5, 5)}
<g fill="#fff" ${FONT} font-size="11"><text x="24" y="15" textLength="${lt}" lengthAdjust="spacingAndGlyphs">${esc(left)}</text><text x="${lw + 8}" y="15" font-weight="bold" textLength="${rt}" lengthAdjust="spacingAndGlyphs">${esc(right)}</text></g></svg>`;
}

// ---- Telegram watch list: "/watch 0x…" in the bot, checked every 15 min ----
const WATCH_KEY = "tgWatch/v1";
export async function tgWatchOp(store, { chat, token, op }) {
  const doc = (await store.get(WATCH_KEY)) || { items: [], snaps: {} };
  let items = (doc.items || []).map((s) => { const [c, t] = String(s).split("|"); return { c, t }; });
  chat = String(chat); token = lc(token);
  if (op === "watch") {
    if (!items.some((x) => x.c === chat && x.t === token)) items.push({ c: chat, t: token });
    if (items.filter((x) => x.c === chat).length > 10) return { ok: false, error: "up to 10 tokens per chat" };
    if (items.length > 300) return { ok: false, error: "the watch list is full" };
  } else if (op === "unwatch") items = items.filter((x) => !(x.c === chat && x.t === token));
  const mine = items.filter((x) => x.c === chat).map((x) => x.t);
  await store.set(WATCH_KEY, { items: items.map((x) => `${x.c}|${x.t}`), snaps: doc.snaps || {} });
  return { ok: true, mine };
}
/// Compares each watched token with its last snapshot; returns the alerts to send.
/// hooks: Pro webhooks ({ id, token, url, ev }) watched the same way; their alerts come back with `hook` set.
/// v3: every tick also re-scans up to two watched tokens in full (oldest first) for score drops,
/// new critical flags and large sells into the pool.
export async function tgWatchTick(store, { hooks = [] } = {}) {
  const doc = (await store.get(WATCH_KEY)) || { items: [], snaps: {} };
  const items = (doc.items || []).map((s) => { const [c, t] = String(s).split("|"); return { c, t }; });
  const snaps = doc.snaps || {};
  const tokens = [...new Set([...items.map((x) => x.t), ...hooks.map((h) => lc(h.token))])].slice(0, 60);
  const deep = tokens.slice().sort((x, y) => ((snaps[x] && snaps[x].sat) || 0) - ((snaps[y] && snaps[y].sat) || 0)).slice(0, 2);
  const alerts = [];
  await pool(tokens, 5, async (t) => {
    let c, m;
    try { c = await core.readContract(io, t); m = await core.readMarket(io, t).catch(() => null); } catch { return; }
    const p = m && m.pairs && m.pairs[0];
    const now = { owner: c.owner || "", supply: c.supply || "0", liq: p ? Math.round(p.liq) : null, sym: c.symbol || "" };
    const old = snaps[t];
    // LP locks (Liquidity Manager): how much of the liquidity can't be pulled, and the next lock to end
    let lp = null;
    try { const Lm = await import("./_liquidity.mjs"); lp = core.lpSummary(await Lm.run(t, { store, budgetMs: 4000 })); } catch { lp = null; }
    now.lp = lp ? { safe: Math.round((lp.locked + lp.burned) * 10) / 10, soonest: lp.soonest || null, warned: (old && old.lp && old.lp.warned) || null } : (old && old.lp) || null;
    // the full re-scan (two tokens a tick)
    now.score = old && old.score != null ? old.score : null; now.crit = (old && old.crit) || []; now.bb = (old && old.bb) || 0; now.sat = (old && old.sat) || 0;
    let deepOut = null;
    if (deep.includes(t)) {
      try { deepOut = await scanToken(t, { store, budgetMs: 4500 }); await rememberScore(t, deepOut, { store }); } catch { deepOut = null; }
      now.sat = Date.now();
    }
    const msgs = [];
    const add = (k, text) => msgs.push({ k, text });
    if (old) {
      if (old.lp && lp && now.lp.safe < old.lp.safe - 15) add("lp", `locked liquidity fell from ${old.lp.safe}% to ${now.lp.safe}%`);
      const sec = Date.now() / 1000;
      if (lp && lp.soonest && lp.soonest > sec && lp.soonest - sec < 86400 && now.lp.warned !== lp.soonest) {
        add("lp", `an LP lock ends in under 24 hours (${new Date(lp.soonest * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC)`);
        now.lp.warned = lp.soonest;
      }
      if (lc(old.owner) !== lc(now.owner)) add("owner", core.BURN.includes(lc(now.owner)) ? "ownership was renounced" : `the owner changed to ${core.short(now.owner)}`);
      if (old.supply !== now.supply) add("supply", BigInt(now.supply) > BigInt(old.supply || 0) ? "new tokens were minted" : "the supply went down");
      if (old.liq && now.liq != null && now.liq < old.liq * 0.7) add("liquidity", `liquidity fell ${Math.round((1 - now.liq / old.liq) * 100)}% (to ${core.usd(now.liq)})`);
    }
    if (deepOut && deepOut.res && !deepOut.res.notToken) {
      const r = deepOut.res;
      if (old && old.score != null && r.score <= old.score - 10) add("score", `the scanner score dropped from ${old.score} to ${r.score} (${r.verdict.t})`);
      const newCrit = (r.critical || []).map((x) => x.title).filter((x) => !(now.crit || []).includes(x));
      if (old && newCrit.length) add("score", `new critical flag: ${newCrit.join(", ")}`);
      now.score = r.score; now.crit = (r.critical || []).map((x) => x.title);
      // large sells into the pool since the last look (1%+ of the supply in one transfer)
      const dec = deepOut.c.decimals, S = core.units(deepOut.c.supply, dec);
      const sells = ((deepOut.h && deepOut.h.events) || []).filter((e) => e.k === "big" && lc(e.to) === core.ADDR.poolManager && e.b > (now.bb || 0));
      if (old && old.bb && sells.length) {
        const top = sells.reduce((a, e) => (BigInt(e.v) > BigInt(a.v) ? e : a), sells[0]);
        add("sell", `${sells.length === 1 ? "a wallet" : `${sells.length} large sells — the biggest`} sold ${core.pct((core.units(top.v, dec) / S) * 100)} of the supply into the pool`);
      }
      const maxB = ((deepOut.h && deepOut.h.events) || []).reduce((mx, e) => Math.max(mx, e.b || 0), 0);
      now.bb = Math.max(now.bb || 0, maxB);
    }
    if (msgs.length) {
      const text = msgs.map((x) => x.text).join(", ");
      items.filter((x) => x.t === t).forEach((x) => alerts.push({ chat: x.c, token: t, sym: now.sym, text }));
      hooks.filter((h) => lc(h.token) === t).forEach((h) => {
        const kinds = msgs.filter((x) => (h.ev || []).includes(x.k));
        if (kinds.length) alerts.push({ hook: h, token: t, sym: now.sym, kinds: kinds.map((x) => x.k), text: kinds.map((x) => x.text).join(", "), score: now.score });
      });
    }
    snaps[t] = now;
  });
  for (const k of Object.keys(snaps)) if (!tokens.includes(k)) delete snaps[k];
  await store.set(WATCH_KEY, { items: doc.items || [], snaps });
  return alerts;
}

// ---- simple per-instance rate limits ----
const hits = new Map();
export function limited(key, max, windowMs) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return false;
}
