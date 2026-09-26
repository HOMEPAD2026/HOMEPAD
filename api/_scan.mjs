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
import { rpc, rpcCall, getLogs, latestBlock, blockTs, pool, toQty, ethCalls, isAddr, pad, keccakHex, getCoin, RPCS } from "./_arc.mjs";
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
export const io = { rpc: rpcCall, rpcSim, fetchJson, keccak: (h) => keccakHex(h) };

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
  return { ...doc, net: toMap(doc.net), got: toMap(doc.got), mints: BigInt(doc.mints || 0), burns: BigInt(doc.burns || 0), events: doc.events || [], hist: doc.hist || [], cand: doc.cand || [] };
}
/// Tokens with more wallets than MAX_KEEP are kept "lite": no full balance
/// sheet, just the place in the chain, the counters, the events and the
/// wallets worth re-reading — so they still only scan new blocks.
function save(S) {
  const arr = (m) => [...m.entries()].filter(([, v]) => v !== 0n).map(([a, v]) => `${a}:${v}`);
  const base = { v: 2, hi: S.hi, lo: S.lo, complete: S.complete, mints: S.mints.toString(), burns: S.burns.toString(),
    transfers: S.transfers, first: S.first, events: S.events, deployer: S.deployer, hist: (S.hist || []).slice(-90), at: Date.now() };
  if (S.lite || S.net.size + (S.complete ? 0 : S.got.size) > MAX_KEEP) {
    return { ...base, lite: true, net: [], got: [], cand: (S.cand || []).slice(0, 300), count: S.count || 0 };
  }
  return { ...base, net: arr(S.net), got: S.complete ? [] : arr(S.got) };
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
  let holderCount = S.complete && !S.lite ? [...S.net.values()].filter((v) => v > 0n).length : top.length;
  if (S.lite) holderCount = Math.max(S.count || 0, top.length);
  if (!S.lite && S.net.size + (S.complete ? 0 : S.got.size) > MAX_KEEP) { S.lite = true; S.count = holderCount; }
  if (S.lite) { S.cand = bals.filter(([, v]) => v > 0n).sort(byDesc).slice(0, 300).map(([a]) => a); S.count = holderCount; S.net = new Map(); S.got = new Map(); }
  // one holder count per day, for the growth chart
  const day = new Date().toISOString().slice(0, 10);
  S.hist = (S.hist || []).filter((x) => x.d !== day).concat([{ d: day, n: holderCount }]).slice(-90);
  mem.set(token, S);
  if (mem.size > 300) mem.delete(mem.keys().next().value);
  if (store) { const doc = save(S); if (doc) { try { await store.set(key, doc); } catch { /* memory copy still works */ } } }
  const fromTs = await blockTs(S.lo).catch(() => null);
  return {
    v: 2, token, supply: supply.toString(), decimals, complete: S.complete, more: !S.complete && S.lo > 0 && !!store,
    transfers: S.transfers, fromBlock: S.lo, toBlock: S.hi, fromTs, nowTs: latest.ts,
    firstMint: S.complete && S.first ? { block: S.first.block, ts: firstTs, tx: S.first.tx, to: S.first.to } : null,
    deployer: S.deployer, holderCount, holderCountExact: S.complete && !S.lite, hist: S.hist,
    top: top.map(([a, v], i) => (codes[i] ? [a, v.toString(), { c: 1 }] : [a, v.toString()])),
    events: S.events.map((e) => ({ ...e })),
  };
}

/// Every holder of a token with its balance (Multisender "airdrop to holders").
/// Runs holderScan to bring the balance sheet up to date first; until the scan
/// has reached the token's first mint the list is partial (more: true — call
/// again). Tokens with more than MAX_KEEP wallets only have their largest
/// holders (lite: true). The biggest 1,000 are flagged when they're contracts.
export async function holderSnapshot(token, { store = null, budgetMs = 7000, limit = 5000 } = {}) {
  limit = Math.max(1, Math.min(MAX_KEEP, Number(limit) || 5000));
  const out = await holderScan(token, { store, budgetMs });
  const t = lc(token);
  let S = mem.get(t) || null;
  if (!S && store) { try { S = load(await store.get(`scan/${t}`)); } catch { S = null; } }
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
      const r = await rpc(part.map((a, id) => ({ jsonrpc: "2.0", id, method: "eth_getCode", params: [a, "latest"] })));
      const byId = new Map((Array.isArray(r) ? r : [r]).map((x) => [x.id, x.result]));
      part.forEach((a, k) => { const c = byId.get(k); if (c && c !== "0x") flags.set(a, 1); });
    } catch { /* unflagged */ }
  }
  // Which block the balances are for: the scanned-up-to block for the
  // event-log sheet, "now" for the balanceOf reads of a very wide token.
  const exact = S && S.complete && !S.lite;
  return {
    token: t, decimals: out.decimals, supply: out.supply, complete: out.complete && !lite, more: out.more, lite,
    block: exact ? out.toBlock : null, ts: out.nowTs || null,
    holderCount: out.holderCount, checkedContracts: head.length,
    holders: list.map(([a, v]) => (flags.has(a) ? [a, v.toString(), 1] : [a, v.toString()])),
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

// ---- cached server scores: Explore badges, the embeddable badge, the public API ----
const scoreMem = new Map();
/// → { score, k, t (verdict), sym, at } — from the store when fresh, else a new server scan.
export async function scoreOf(token, { store = null, maxAgeMs = 30 * 60e3, compute = true } = {}) {
  token = lc(token);
  const key = `scanScore/${token}`;
  let hit = scoreMem.get(token) || null;
  if (!hit && store) { try { hit = await store.get(key); } catch { hit = null; } }
  if (hit && Date.now() - (hit.at || 0) < maxAgeMs && hit.v === core.CORE_VERSION) { scoreMem.set(token, hit); return hit; }
  if (!compute) return hit || null;
  const out = await scanToken(token, { store, budgetMs: 5000 });
  const r = out.res;
  const doc = r.notToken ? { v: core.CORE_VERSION, notToken: true, at: Date.now() }
    : { v: core.CORE_VERSION, score: r.score, k: r.verdict.k, t: r.verdict.t, sym: (out.c && out.c.symbol) || "", reasons: r.reasons.map((x) => `${x.status}|${x.title}`), at: Date.now() };
  scoreMem.set(token, doc);
  if (store) { try { await store.set(key, doc); } catch { /* memory copy */ } }
  return doc;
}
/// The public JSON shape (GET /api/v1/scan/<address>).
export async function apiResult(token, { store = null } = {}) {
  const out = await scanToken(token, { store, budgetMs: 5500 });
  const r = out.res, c = out.c || {};
  if (r.notToken) return { token: lc(token), token_standard: null, verdict: null, checks: r.rows.map(({ group, status, title, detail }) => ({ group, status, title, detail })) };
  const d = r.dist, m = r.market;
  return {
    token: lc(token), name: c.name, symbol: c.symbol, decimals: c.decimals, supply: c.supply,
    score: r.score, verdict: r.verdict.t, reasons: r.reasons,
    checks: r.rows.map(({ group, status, title, detail, pts, addr }) => ({ group, status, title, detail, points: pts || 0, ...(addr ? { address: addr } : {}) })),
    market: m ? { source: m.source, price_usd: m.price ?? null, market_cap_usd: m.mcap ?? null, liquidity_usd: m.liq ?? null, pool_created: m.created ?? null } : null,
    holders: d ? { count: d.holders, exact: d.exact, top10_pct: d.S ? (d.top10 / d.S) * 100 : null, deployer: d.deployer } : null,
    engine: core.CORE_VERSION, scanned_at: new Date().toISOString(), page: `https://www.arcircle.app/s/${lc(token)}`,
  };
}
/// A small shields-style SVG: "ARCIRCLE PAD scan | 82 · Looks OK".
export function badgeSvg(doc) {
  const esc = (x) => String(x).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const left = "ARCIRCLE PAD scan";
  const right = !doc ? "not scanned" : doc.notToken ? "not a token" : `${doc.score} · ${doc.t}`;
  const col = !doc || doc.notToken ? "#5b6472" : doc.k === "ok" ? "#1f9d57" : doc.k === "care" ? "#c98a12" : "#d0473a";
  const w = (t) => Math.round(t.length * 6.4 + 16);
  const lw = w(left) + 14, rw = w(right), W = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="22" role="img" aria-label="${esc(left)}: ${esc(right)}"><title>${esc(left)}: ${esc(right)}</title>
<linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${W}" height="22" rx="4"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="22" fill="#0b1320"/><rect x="${lw}" width="${rw}" height="22" fill="${col}"/><rect width="${W}" height="22" fill="url(#g)"/></g>
<g fill="none" stroke="#35d8d0" stroke-width="1.6"><path d="M11 4.5l5 2.1v3.8c0 3.1-2.1 5.8-5 6.7-2.9-.9-5-3.6-5-6.7V6.6z"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="${(lw + 14) / 2}" y="15">${esc(left)}</text><text x="${lw + rw / 2}" y="15" font-weight="bold">${esc(right)}</text></g></svg>`;
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
export async function tgWatchTick(store) {
  const doc = (await store.get(WATCH_KEY)) || { items: [], snaps: {} };
  const items = (doc.items || []).map((s) => { const [c, t] = String(s).split("|"); return { c, t }; });
  const snaps = doc.snaps || {};
  const tokens = [...new Set(items.map((x) => x.t))].slice(0, 40);
  const alerts = [];
  await pool(tokens, 5, async (t) => {
    let c, m;
    try { c = await core.readContract(io, t); m = await core.readMarket(io, t).catch(() => null); } catch { return; }
    const p = m && m.pairs && m.pairs[0];
    const now = { owner: c.owner || "", supply: c.supply || "0", liq: p ? Math.round(p.liq) : null, sym: c.symbol || "" };
    const old = snaps[t];
    if (old) {
      const msgs = [];
      if (lc(old.owner) !== lc(now.owner)) msgs.push(core.BURN.includes(lc(now.owner)) ? "ownership was renounced" : `the owner changed to ${core.short(now.owner)}`);
      if (old.supply !== now.supply) msgs.push(BigInt(now.supply) > BigInt(old.supply || 0) ? "new tokens were minted" : "the supply went down");
      if (old.liq && now.liq != null && now.liq < old.liq * 0.7) msgs.push(`liquidity fell ${Math.round((1 - now.liq / old.liq) * 100)}% (to ${core.usd(now.liq)})`);
      if (msgs.length) items.filter((x) => x.t === t).forEach((x) => alerts.push({ chat: x.c, token: t, sym: now.sym, text: msgs.join(", ") }));
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
