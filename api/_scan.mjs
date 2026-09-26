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
import { rpc, rpcCall, getLogs, latestBlock, blockTs, pool, toQty, ethCalls, isAddr, pad, keccakHex, getCoin } from "./_arc.mjs";
import * as core from "./_scan-core.mjs";

const lc = (a) => String(a || "").toLowerCase();
async function fetchJson(url, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
export const io = { rpc: rpcCall, fetchJson, keccak: (h) => keccakHex(h) };

const TOPIC = {
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  owner: "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0",
  paused: "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258",
  unpaused: "0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa",
  upgraded: "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b",
};
const ZERO = "0x0000000000000000000000000000000000000000";
const CHUNK = 9000, WAVE = 10, MAX_EVENTS = 60, MAX_KEEP = 8000;
const mem = new Map(); // token → state, per server instance

function fresh() { return { v: 2, hi: null, lo: null, complete: false, net: new Map(), got: new Map(), mints: 0n, burns: 0n, transfers: 0, first: null, events: [], deployer: null }; }
function load(doc) {
  if (!doc || doc.v !== 2) return null;
  const toMap = (arr) => new Map((arr || []).map((s) => { const i = String(s).indexOf(":"); return [s.slice(0, i), BigInt(s.slice(i + 1))]; }));
  return { ...doc, net: toMap(doc.net), got: toMap(doc.got), mints: BigInt(doc.mints || 0), burns: BigInt(doc.burns || 0), events: doc.events || [] };
}
function save(S) {
  if (S.net.size + (S.complete ? 0 : S.got.size) > MAX_KEEP) return null; // too big to keep: rescan next time
  const arr = (m) => [...m.entries()].filter(([, v]) => v !== 0n).map(([a, v]) => `${a}:${v}`);
  return { v: 2, hi: S.hi, lo: S.lo, complete: S.complete, net: arr(S.net), got: S.complete ? [] : arr(S.got), mints: S.mints.toString(), burns: S.burns.toString(),
    transfers: S.transfers, first: S.first, events: S.events, deployer: S.deployer, at: Date.now() };
}
function take(S, logs, supply) {
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

/// store: { get(key) → doc | null, set(key, doc) } — or null (edge: one pass, nothing kept).
export async function holderScan(token, { store = null, budgetMs = 6500, maxChunks = 400 } = {}) {
  if (!isAddr(token)) throw Object.assign(new Error("not an address"), { status: 400 });
  token = lc(token);
  const t0 = Date.now();
  const [supHex, decHex] = await ethCalls([{ to: token, data: "0x18160ddd" }, { to: token, data: "0x313ce567" }]);
  if (supHex == null) throw Object.assign(new Error("not an ERC-20 token (no totalSupply)"), { status: 404 });
  const supply = BigInt(supHex), decimals = decHex ? Number(BigInt(decHex)) : 18;
  const key = `scan/${token}`;
  let S = mem.get(token) || null;
  if (!S && store) { try { S = load(await store.get(key)); } catch { S = null; } }
  if (!S) S = fresh();
  const latest = await latestBlock();
  const left = () => budgetMs - (Date.now() - t0);
  const logsIn = (a, b) => getLogs({ address: token, fromBlock: toQty(a), toBlock: toQty(b) });
  let chunks = 0;
  // 1. new blocks since the last scan (forward, contiguous)
  if (S.hi != null && latest.number > S.hi) {
    while (S.hi < latest.number && left() > 1500 && chunks < maxChunks) {
      const ranges = [];
      let a = S.hi + 1;
      for (let k = 0; k < WAVE && a <= latest.number; k++) { const b = Math.min(latest.number, a + CHUNK - 1); ranges.push([a, b]); a = b + 1; }
      const logs = (await pool(ranges, WAVE, ([x, y]) => logsIn(x, y))).flat();
      take(S, logs, supply);
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
    take(S, logs, supply);
    S.lo = ranges[ranges.length - 1][0];
    chunks += ranges.length;
    if (supply > 0n && S.mints - S.burns >= supply) S.complete = true;
    else if (S.lo === 0) S.complete = S.mints > 0n;
  }
  if (!S.complete && supply > 0n && S.mints - S.burns >= supply) S.complete = true;
  trimEvents(S);
  // Candidates → real balances (fee-on-transfer / rebasing tokens stay right).
  const byDesc = (x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0);
  const cand = S.complete
    ? [...S.net.entries()].filter(([, v]) => v > 0n).sort(byDesc).slice(0, 150).map(([a]) => a)
    : [...new Set([
      ...[...S.got.entries()].sort(byDesc).slice(0, 120).map(([a]) => a),
      ...[...S.net.entries()].filter(([, v]) => v < 0n).sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0)).slice(0, 30).map(([a]) => a),
    ])];
  const bals = [];
  for (let i = 0; i < cand.length; i += 50) {
    const part = cand.slice(i, i + 50);
    const r = await ethCalls(part.map((a) => ({ to: token, data: "0x70a08231" + pad(a) })));
    part.forEach((a, k) => bals.push([a, r[k] ? BigInt(r[k]) : 0n]));
  }
  const top = bals.filter(([, v]) => v > 0n).sort(byDesc).slice(0, 25);
  // which of the biggest wallets are contracts (vaults, pools, lockers) rather than people
  let codes = [];
  try {
    const out = await rpc(top.map(([a], id) => ({ jsonrpc: "2.0", id, method: "eth_getCode", params: [a, "latest"] })));
    const byId = new Map((Array.isArray(out) ? out : [out]).map((x) => [x.id, x.result]));
    codes = top.map((_, i) => { const c = byId.get(i); return !!(c && c !== "0x"); });
  } catch { codes = []; }
  if (S.complete && S.first && S.first.tx && !S.deployer) {
    try { const tx = await rpcCall("eth_getTransactionByHash", [S.first.tx]); if (tx && tx.from) S.deployer = lc(tx.from); } catch { /* next time */ }
  }
  // timestamps for the timeline (a few at most per request, then kept)
  const need = S.events.filter((e) => e.ts == null).slice(-16);
  await Promise.all(need.map(async (e) => { e.ts = await blockTs(e.b).catch(() => null); }));
  const firstTs = S.first ? (S.events.find((e) => e.k === "mint" && e.b === S.first.block) || {}).ts || null : null;
  const holderCount = S.complete ? [...S.net.values()].filter((v) => v > 0n).length : top.length;
  mem.set(token, S);
  if (mem.size > 300) mem.delete(mem.keys().next().value);
  if (store) { const doc = save(S); if (doc) { try { await store.set(key, doc); } catch { /* memory copy still works */ } } }
  const fromTs = await blockTs(S.lo).catch(() => null);
  return {
    v: 2, token, supply: supply.toString(), decimals, complete: S.complete, more: !S.complete && S.lo > 0 && !!store,
    transfers: S.transfers, fromBlock: S.lo, toBlock: S.hi, fromTs, nowTs: latest.ts,
    firstMint: S.complete && S.first ? { block: S.first.block, ts: firstTs, tx: S.first.tx, to: S.first.to } : null,
    deployer: S.deployer, holderCount, holderCountExact: S.complete,
    top: top.map(([a, v], i) => (codes[i] ? [a, v.toString(), { c: 1 }] : [a, v.toString()])),
    events: S.events.map((e) => ({ ...e })),
  };
}

/// Market for a launchpad token Dexscreener hasn't listed yet, read from the chain.
export async function marketFallback(addr, { arcpad, argus }) {
  if (arcpad) {
    const coin = await getCoin(addr).catch(() => null);
    return { source: "arcpad", pairs: [], price: coin && coin.priceUsd, mcap: coin && coin.mcapUsd, created: arcpad.launchedAt || null,
      links: [["Website", arcpad.website], ["Twitter", arcpad.twitter], ["Telegram", arcpad.telegram]].filter(([, u]) => /^https:\/\//.test(u || "")).map(([t, u]) => ({ t, u })) };
  }
  if (argus) return { source: "argus", pairs: [] };
  return null;
}

/// The whole scan, server side.
export async function scanToken(addr, { store = null, budgetMs = 6000 } = {}) {
  return core.scanAll(io, addr, { holders: (a) => holderScan(a, { store, budgetMs }), marketFallback });
}

// ---- "most scanned this week" ----
const TOP_KEY = "scanTop/v1";
const seenBump = new Map();
export async function bumpScan(store, token, symbol) {
  if (!store) return;
  token = lc(token);
  const last = seenBump.get(token) || 0;
  if (Date.now() - last < 5 * 60e3) return; // one count per token per instance every 5 minutes
  seenBump.set(token, Date.now());
  try {
    const doc = (await store.get(TOP_KEY)) || { items: [] };
    const week = Date.now() - 7 * 86400e3;
    const items = (doc.items || []).map((s) => { const [t, sym, n, at] = String(s).split("|"); return { t, sym, n: Number(n) || 0, at: Number(at) || 0 }; }).filter((x) => x.at > week);
    const it = items.find((x) => x.t === token);
    if (it) { it.n++; it.at = Date.now(); if (symbol) it.sym = symbol; } else items.push({ t: token, sym: symbol || "", n: 1, at: Date.now() });
    items.sort((a, b) => b.n - a.n);
    await store.set(TOP_KEY, { items: items.slice(0, 40).map((x) => `${x.t}|${String(x.sym).replace(/\|/g, "").slice(0, 16)}|${x.n}|${x.at}`) });
  } catch { /* best effort */ }
}
export async function scanTop(store) {
  if (!store) return [];
  try {
    const doc = await store.get(TOP_KEY);
    const week = Date.now() - 7 * 86400e3;
    return ((doc && doc.items) || []).map((s) => { const [t, sym, n, at] = String(s).split("|"); return { token: t, symbol: sym, scans: Number(n) || 0, at: Number(at) || 0 }; })
      .filter((x) => x.at > week && isAddr(x.token)).slice(0, 12);
  } catch { return []; }
}
