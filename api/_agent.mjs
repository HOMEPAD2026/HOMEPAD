// api/_agent.mjs — ARCIA AGENT: paste an Arc token's address and ARCIA works on it.
//   report(st, token)   the token read in full (Token Scanner v3 + market), ARCIA's take, and her SAFETY CALL:
//                       "safe" / "caution" / "risky" for the next 24 hours, recorded with a hash BEFORE the outcome
//                       exists and graded afterwards from the market (price −60% or liquidity −50% = it went bad).
//                       Calls are about risk, not price direction — never a buy or sell signal.
//   record(st)          every call and how they were graded (hit rate for "safe" and "risky")
//   vaults(st, …)       per-token burn vaults (contracts/contracts/ArciaAgent.sol): people fund one with USDC and
//                       ARCIA decides WHEN to spend it — the vault can only buy its token and send it to 0x…dEaD
//   tick(st)            runs after each ARCIA DESK tick: grades due calls and works the vaults (buy & burn, in dips,
//                       sized to the pool, never chasing a pump), every action recorded with its reason
// Nothing here trades for profit, and no message or command can make ARCIA act: a vault acts only on these rules.
// Robinhood Chain (Oct 2026, chain "rh"): the same reports and calls (the Token Scanner reads Robinhood Chain), and
// burn vaults from contracts/contracts/ArciaAgentRH.sol — funded with ETH, buying in the token's Uniswap v3 (WETH)
// or v4 (ETH / WETH) pool. Factory: env ARCIA_AGENT_RH_FACTORY; ARCIA's key there: ARCIA_AGENT_RH_KEY, else the
// same ARCIA_AGENT_KEY. The rules are in dollars on both chains (ETH at today's price, api/_fx.mjs).
import { ethCalls, isAddr, pad, strip, keccakHex, rpc, rpcCall } from "./_arc.mjs";
import { sendTx, addressOfKey } from "./_x402.mjs";
import { evmChain } from "./_evm.mjs";
import { RH_CFG } from "./_snap-rh.mjs";
import { prices as fxPrices } from "./_fx.mjs";
import * as scanner from "./_scan.mjs";
import * as scanCore from "./_scan-core.mjs";

const lc = (a) => String(a || "").toLowerCase();
const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const r2 = (n, d = 2) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const now = () => Math.floor(Date.now() / 1000);
const hexOf = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
const sel = (s) => keccakHex(hexOf(s)).slice(0, 10);
const u = (n) => BigInt(n).toString(16).padStart(64, "0");
const W = (h, i) => BigInt("0x" + (strip(h || "0x").slice(i * 64, i * 64 + 64) || "0"));
const A = (h, i) => "0x" + strip(h || "0x").slice(i * 64 + 24, i * 64 + 64);

export const USDC = "0x3600000000000000000000000000000000000000";
export const AGENT_VERSION = 1;
export const ARCIA_AGENT_RH_DEFAULT = "0x4c24092cb1319fe503f4342de97b443e64321112";
export const CFG = {
  factory: () => (isAddr(env("ARCIA_AGENT_FACTORY")) ? lc(env("ARCIA_AGENT_FACTORY")) : null),
  key: () => env("ARCIA_AGENT_KEY") || null,
  usdc: USDC,
  budgetMs: 15000,
  // Robinhood Chain
  // ArciaAgentFactoryRH on Robinhood Chain (deployed 2026-10-02, block 78103976); env ARCIA_AGENT_RH_FACTORY overrides,
  // "none" turns the vaults off
  rhFactory: () => { const e = env("ARCIA_AGENT_RH_FACTORY"); if (e === "none") return null; return isAddr(e) ? lc(e) : ARCIA_AGENT_RH_DEFAULT; },
  rhKey: () => env("ARCIA_AGENT_RH_KEY") || env("ARCIA_AGENT_KEY") || null,
  weth: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
  v3Factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  ethUsd: null, // tests pin the ETH price
};
export function configure(o) { Object.assign(CFG, o); rhCh = null; }
const chainOf = (c) => (c === "rh" ? "rh" : "arc");
const CNAME = (c) => (c === "rh" ? "Robinhood Chain" : "Arc");
let rhCh = null;
const rh = () => (rhCh = rhCh || evmChain({ rpcs: () => RH_CFG.rpcs(), chainId: 4663, timeoutMs: 12000 }));
async function ethUsd() { if (CFG.ethUsd) return CFG.ethUsd; const p = await fxPrices().catch(() => null); return p && p.eth ? p.eth : null; }
/// one chain's reads and writes for the vaults
function net(c) {
  if (chainOf(c) === "rh") return { ch: "rh", factory: CFG.rhFactory(), key: CFG.rhKey(), ethCalls: (x, o) => rh().ethCalls(x, o), rpc: (b, o) => rh().rpc(b, o), rpcCall: (m, p) => rh().rpcCall(m, p),
    send: ({ to, data, key }) => rh().sendTx({ to, data, key }) };
  return { ch: "arc", factory: CFG.factory(), key: CFG.key(), ethCalls, rpc, rpcCall, send: sendTx };
}

// ---------------------------------------------------------------- store (one JSON string per doc, like the desk)
const pack = (o) => ({ j: JSON.stringify(o) });
const unpack = (d) => { if (!d) return null; if (typeof d.j === "string") { try { return JSON.parse(d.j); } catch { return null; } } return d; };
// Robinhood Chain reports and calls: agentRep/rh-…, agentCall/rh-… (one list of calls for both, each call names its chain)
const K = { rep: (t, c) => `agentRep/${c === "rh" ? "rh-" : ""}${t}`, call: (t, c) => `agentCall/${c === "rh" ? "rh-" : ""}${t}`, calls: "agent/calls", vault: (v) => `agentVault/${v}`, acts: "agent/acts", cursor: "agent/cursor", cursorRh: "agent/cursor-rh", anchors: "agent/anchors" };
const getJ = async (st, k) => (st ? unpack(await st.get(k).catch(() => null)) : null);
const putJ = (st, k, v) => (st ? st.set(k, pack(v)) : Promise.resolve());
export function memStore() { const m = new Map(); return { get: async (k) => m.get(k) ?? null, getMany: async (ks) => Object.fromEntries(ks.map((k) => [k, m.get(k) ?? null])), set: async (k, v) => { m.set(k, v); } }; }

// ---------------------------------------------------------------- the safety call
export const CALL = { hours: 24, badPx: -60, badLiq: -50, every: 12 * 3600 };
/// safe / caution / risky from the scan, with the reasons shown to people
export function callOf(s) {
  const why = [];
  const crit = (s.critical || []).length, score = s.score ?? null, liq = s.liq ?? null, top10 = s.top10 ?? null;
  if (crit) why.push(`critical flag: ${s.critical[0]}`);
  if (score != null && score < 45) why.push(`scanner score ${score}/100`);
  if (liq != null && liq < 500) why.push(`only $${Math.round(liq)} of liquidity`);
  if (top10 != null && top10 > 70) why.push(`top 10 wallets hold ${Math.round(top10)}%`);
  if (why.length) return { call: "risky", why };
  // Safe needs the holders read too: an unknown top 10 is never called safe
  if (score != null && score >= 75 && liq != null && liq >= 5000 && top10 != null && top10 <= 35) return { call: "safe", why: [`scanner score ${score}/100`, `$${Math.round(liq).toLocaleString("en-US")} of liquidity`, `top 10 hold ${Math.round(top10)}%`] };
  const w = [];
  if (score != null) w.push(`scanner score ${score}/100`);
  if (liq == null) w.push("no market data yet"); else if (liq < 5000) w.push(`$${Math.round(liq).toLocaleString("en-US")} of liquidity`); else w.push(`$${Math.round(liq).toLocaleString("en-US")} of liquidity`);
  if (top10 == null) w.push("holders not read yet"); else if (top10 > 35) w.push(`top 10 hold ${Math.round(top10)}%`);
  return { call: "caution", why: w };
}
/// what happened since the call: "bad" if the price fell 60%+ or the liquidity 50%+; "ok" otherwise
export function outcomeOf(c, m) {
  if (!m || m.px == null || !c.px0) return null;
  const dPx = (m.px / c.px0 - 1) * 100, dLiq = c.liq0 && m.liq != null ? (m.liq / c.liq0 - 1) * 100 : null;
  const bad = dPx <= CALL.badPx || (dLiq != null && dLiq <= CALL.badLiq);
  return { bad, dPx: r2(dPx, 1), dLiq: r2(dLiq, 1) };
}
/// safe → right when it didn't go bad; risky → right when it did; caution isn't graded
export function gradeOf(c, o) { if (!o || c.call === "caution") return null; return c.call === "safe" ? !o.bad : o.bad; }
// a Robinhood Chain call's hash names its chain too (Arc's stay exactly as before)
const hashOf = (c) => keccakHex(hexOf(JSON.stringify({ t: c.t, call: c.call, px0: c.px0, liq0: c.liq0, at: c.at, until: c.until, ...(c.ch === "rh" ? { ch: "rh" } : {}) })));

// ---------------------------------------------------------------- market (light: Dexscreener, else the full scan)
async function marketOf(token, st, ch = "arc") {
  const m = await scanCore.readMarket(scanner.ioOf(chainOf(ch)), token).catch(() => null);
  const p = m && m.pairs && m.pairs[0];
  if (p && p.price) return { px: p.price, liq: m.pairs.reduce((t, x) => t + (x.liq || 0), 0), src: "dex" };
  const r = await scanner.apiResult(token, { store: st, chain: chainOf(ch) }).catch(() => null);
  return r && r.market && r.market.price_usd ? { px: r.market.price_usd, liq: r.market.liquidity_usd ?? null, src: "scan" } : null;
}

// ---------------------------------------------------------------- the report
export async function report(st, token, { maxAgeS = 600, chain = "arc" } = {}) {
  token = lc(token);
  const ch = chainOf(chain);
  if (!isAddr(token)) return { error: `paste ${ch === "rh" ? "a Robinhood Chain" : "an Arc"} token address (0x…)` };
  const hit = await getJ(st, K.rep(token, ch));
  // a report still waiting for the holders is only kept for 45 s, so the next visit reads further
  const fresh = hit && hit.v === AGENT_VERSION && now() - hit.at < (hit.holdersPending ? 45 : maxAgeS);
  if (fresh) return { ...hit, cached: true, call: await currentCall(st, token, hit) };
  const scan = await scanner.apiResult(token, { store: st, chain: ch });
  if (!scan || !scan.verdict) return { error: `that address isn't a token ARCIA can read on ${CNAME(ch)}`, token };
  const m = scan.market || {}, h = scan.holders || {};
  const facts = { score: scan.score, verdict: scan.verdict, critical: scan.critical || [], liq: m.liquidity_usd ?? null, px: m.price_usd ?? null, mcap: m.market_cap_usd ?? null,
    top10: h.top10_pct ?? null, holders: h.count ?? null, linked: h.linked_top_pct ?? null, created: m.pool_created ?? null, sections: scan.sections || {}, confidence: scan.confidence ?? null };
  const rep = { v: AGENT_VERSION, t: token, ...(ch === "rh" ? { ch } : {}), at: now(), name: scan.name || "", sym: scan.symbol || "", dec: scan.decimals ?? 18, facts,
    reasons: (scan.reasons || []).slice(0, 6), checks: (scan.checks || []).filter((c) => c.status !== "ok").slice(0, 10).map((c) => ({ group: c.group, status: c.status, title: c.title, detail: c.detail })),
    summary: scan.summary || "", page: scan.page, take: hit && hit.take && hit.t === token && now() - (hit.takeAt || 0) < 3600 ? hit.take : null, takeAt: hit ? hit.takeAt || 0 : 0 };
  // the holders: a big token's balance sheet is read over several visits; the call waits for it (at most 10 minutes)
  if (facts.top10 == null && !facts.critical.length) {
    rep.pendSince = (hit && hit.pendSince) || now();
    if (now() - rep.pendSince < 600) {
      rep.holdersPending = true;
      scanner.holderScan(token, { store: st, budgetMs: 2500, chain: ch }).catch(() => null);
    }
  }
  await putJ(st, K.rep(token, ch), rep).catch(() => {});
  const open = await getJ(st, K.call(token, ch));
  const call = open && now() - open.at < CALL.every ? open : rep.holdersPending ? { pending: true, why: ["reading the holders first"], at: rep.pendSince } : await makeCall(st, rep, callOf(facts));
  return { ...rep, call };
}
/// ARCIA's words, asked for after the report is on screen (GET ?agent=take&t=): cached an hour with the report
export async function take(st, token, { ask = null, chain = "arc" } = {}) {
  token = lc(token);
  const ch = chainOf(chain);
  const rep = await getJ(st, K.rep(token, ch));
  if (!rep) return { error: "read the token first" };
  if (rep.take && now() - (rep.takeAt || 0) < 3600) return { take: rep.take };
  const c = (await getJ(st, K.call(token, ch))) || callOf(rep.facts);
  const t = await takeOf(rep, { call: c.call || "caution", why: c.why || [] }, ask).catch(() => null);
  if (t) { rep.take = t; rep.takeAt = now(); await putJ(st, K.rep(token, ch), rep).catch(() => {}); }
  return { take: t };
}
/// ARCIA's own words about the token: Claude when the key is set, else a plain line from the rules
async function takeOf(rep, c0, ask) {
  const f = rep.facts;
  const plain = c0.call === "risky" ? `I'd stay careful with ${rep.sym || "this one"}: ${c0.why.join(", ")}.`
    : c0.call === "safe" ? `${rep.sym || "This token"} reads clean to me right now — ${c0.why.join(", ")}. Clean isn't a promise; I'll grade myself in 24 hours.`
    : `${rep.sym || "This token"} is somewhere in between: ${c0.why.join(", ") || "not enough data yet"}. I'm watching, not cheering.`;
  if (!env("ANTHROPIC_API_KEY") || env("ARCIA_AGENT_AI") === "0") return { text: plain, ai: false };
  const askFn = ask || (await import("./_arcia-brain.mjs")).askClaude;
  const text = await askFn({ L: null, maxTokens: 220, timeoutMs: 9000, messages: [{ role: "user", content:
    `You are ARCIA reading ${rep.ch === "rh" ? "a Robinhood Chain" : "an Arc"} token for someone who pasted its address into ARCIA AGENT. Write 2–3 short sentences in first person, plain English, calm and honest: what stands out (good and bad) and what to watch. Plain text only: no markdown, no headings, no bold, no lists. Don't restate the safety call (the page shows it next to your words). Never tell anyone to buy or sell, never predict price, no hype, no emojis. For context, your safety call for the next 24h is "${c0.call}" (${c0.why.join("; ")}). Only use these facts:\n` +
    JSON.stringify({ symbol: rep.sym, name: rep.name, ...f, reasons: rep.reasons.map((r) => r.title || r), issues: rep.checks.map((c) => c.title) }) }] });
  return text ? { text: plainText(text), ai: true } : { text: plain, ai: false };
}
/// Claude's words as plain text: no markdown, no restated call line, at most ~600 characters
export function plainText(t) {
  let x = String(t || "").replace(/\*\*|__|`/g, "").replace(/^#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "");
  x = x.split(/\n+/).filter((l) => !/^\s*safety call\b/i.test(l)).join(" ").replace(/\s+/g, " ").trim();
  if (x.length > 600) x = x.slice(0, 600).replace(/[^.!?]*$/, "").trim() || x.slice(0, 600);
  return x;
}
/// one call per token per 12 hours; a newer report reuses the open one
async function makeCall(st, rep, c0) {
  const ch = chainOf(rep.ch);
  const open = await getJ(st, K.call(rep.t, ch));
  if (open && now() - open.at < CALL.every) return open;
  const c = { id: `${ch === "rh" ? "r" : ""}${rep.t.slice(2, 10)}${now().toString(36)}`, t: rep.t, ...(ch === "rh" ? { ch } : {}), sym: rep.sym, call: c0.call, why: c0.why, px0: rep.facts.px, liq0: rep.facts.liq, score0: rep.facts.score, at: now(), until: now() + CALL.hours * 3600, graded: null };
  c.hash = hashOf(c);
  await putJ(st, K.call(rep.t, ch), c).catch(() => {});
  const L = (await getJ(st, K.calls)) || { items: [] };
  L.items = [c, ...(L.items || [])].slice(0, 400);
  await putJ(st, K.calls, L).catch(() => {});
  return c;
}
async function currentCall(st, token, rep) {
  const c = await getJ(st, K.call(token, chainOf(rep.ch)));
  if (c && now() - c.at < CALL.every) return c;
  if (rep.holdersPending) return { pending: true, why: ["reading the holders first"], at: rep.pendSince };
  return makeCall(st, rep, callOf(rep.facts));
}

/// ARCIA's latest safety call on a token, if it's less than a day old (ARCIRCLE Predict shows it on its markets)
export async function lastCall(st, token, chain = "arc") {
  const c = await getJ(st, K.call(lc(token), chainOf(chain))).catch(() => null);
  return c && c.call && now() - c.at < 86400 ? { call: c.call, at: c.at } : null;
}

/// grade the calls whose 24 hours are up (a few per run)
export async function gradeDue(st, { max = 3, market = marketOf } = {}) {
  const L = (await getJ(st, K.calls)) || { items: [] };
  const due = (L.items || []).filter((c) => !c.graded && now() >= c.until).slice(0, max);
  let n = 0;
  for (const c of due) {
    const m = await market(c.t, st, chainOf(c.ch)).catch(() => null);
    const o = outcomeOf(c, m);
    // no market 48h after the deadline: void (the pool is gone or unreadable)
    if (!o && now() < c.until + 48 * 3600) continue;
    c.graded = { at: now(), px: m ? m.px : null, liq: m ? m.liq : null, ...(o || { void: true }), right: o ? gradeOf(c, o) : null };
    n++;
  }
  if (n) await putJ(st, K.calls, L);
  return n;
}
export async function record(st, { day = null } = {}) {
  const L = (await getJ(st, K.calls)) || { items: [] };
  const items = L.items || [];
  if (day != null) {
    // one day's calls, in the anchor's order, to check its root
    const A = ((await getJ(st, K.anchors)) || { items: [] }).items || [];
    const row = A.find((x) => x.day === Number(day));
    const byId = new Map(items.map((c) => [c.id, c]));
    const list = row ? row.ids.map((id) => byId.get(id)).filter(Boolean) : items.filter((c) => Math.floor(c.at / 86400) === Number(day)).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    return { day: Number(day), anchor: row || null, dayCalls: list.map((c) => ({ id: c.id, t: c.t, ...(c.ch ? { ch: c.ch } : {}), sym: c.sym, call: c.call, at: c.at, hash: c.hash })) };
  }
  const g = (k) => { const x = items.filter((c) => c.call === k && c.graded && c.graded.right != null); return { n: x.length, right: x.filter((c) => c.graded.right).length }; };
  // how often tokens went bad, by the scanner score at the call (Caution included — every call has an outcome)
  const out = items.filter((c) => c.graded && !c.graded.void && c.graded.bad != null);
  const B = [["75+", 75, 101], ["50–74", 50, 75], ["<50", -1, 50]].map(([label, lo, hi]) => { const x = out.filter((c) => (c.score0 ?? -1) >= lo && (c.score0 ?? -1) < hi); return { label, n: x.length, bad: x.filter((c) => c.graded.bad).length }; });
  // the hit rate as calls were graded (Safe + Risky), oldest first
  const gr = items.filter((c) => c.graded && c.graded.right != null).sort((a, b) => a.graded.at - b.graded.at);
  let ok = 0; const series = gr.map((c, i) => { if (c.graded.right) ok++; return [c.graded.at, Math.round((ok / (i + 1)) * 1000) / 10]; });
  const A = ((await getJ(st, K.anchors)) || { items: [] }).items || [];
  return { calls: items.slice(0, 60), stats: { total: items.length, open: items.filter((c) => !c.graded).length, safe: g("safe"), risky: g("risky") }, buckets: B, series: series.slice(-120), anchors: A.slice(0, 30), rules: CALL };
}

// ---------------------------------------------------------------- vaults (reads)
const S = {
  vaultsOf: sel("vaultsOf(address)"), allVaults: sel("allVaults()"), paused: sel("paused()"), operator: sel("operator()"), createBurn: sel("createBurn()"),
  owner: sel("owner()"), token: sel("token()"), agentOn: sel("agentOn()"), maxBuy: sel("maxBuy()"), dailyCap: sel("dailyCap()"), cooldown: sel("cooldown()"),
  lastBuyAt: sel("lastBuyAt()"), spendable: sel("spendableToday()"), totalSpent: sel("totalSpent()"), totalBurned: sel("totalBurned()"), buys: sel("buys()"),
  pending: sel("pending()"), poolId: sel("poolId()"), balanceOf: sel("balanceOf(address)"), kind: sel("kind()"), pool: sel("pool()"),
  quote: sel("quote(uint256)"), rt: sel("quoteRoundTrip(uint256)"), burn: sel("buyAndBurn(uint256,uint256)"), apply: sel("applyLimits()"),
};
const ERR = { quote: sel("QuoteResult(uint256)"), rt: sel("RoundTripResult(uint256,uint256)") };
function addrList(h) { if (!h) return []; const n = Number(W(h, 1)); return Array.from({ length: Math.min(n, 500) }, (_, i) => lc(A(h, 2 + i))); }
/// each vault's limits and money: Arc in USDC (6 decimals), Robinhood Chain in ETH (18) — `unit` says which
export async function vaultState(addrs, chain = "arc") {
  if (!addrs.length) return [];
  const N = net(chain), isRh = N.ch === "rh", D = isRh ? 1e18 : 1e6;
  const F = ["owner", "token", "paused", "agentOn", "maxBuy", "dailyCap", "cooldown", "lastBuyAt", "spendable", "totalSpent", "totalBurned", "buys", "pending", "poolId", ...(isRh ? ["kind", "pool"] : [])];
  const money = isRh ? CFG.weth : CFG.usdc;
  const calls = addrs.flatMap((v) => [...F.map((f) => ({ to: v, data: S[f] })), { to: money, data: S.balanceOf + pad(v) }]);
  const r = await N.ethCalls(calls, { timeoutMs: 8000 });
  const per = F.length + 1;
  return addrs.map((v, i) => {
    const x = r.slice(i * per, i * per + per), g = (k) => x[F.indexOf(k)];
    if (!g("owner")) return null;
    const pend = g("pending");
    return { vault: v, ...(isRh ? { ch: "rh", kind: g("kind") ? Number(W(g("kind"), 0)) : null, pool: g("pool") ? lc(A(g("pool"), 0)) : null } : {}), unit: isRh ? "ETH" : "USDC",
      owner: lc(A(g("owner"), 0)), token: lc(A(g("token"), 0)), paused: W(g("paused"), 0) === 1n, agentOn: W(g("agentOn"), 0) === 1n,
      maxBuy: Number(W(g("maxBuy"), 0)) / D, dailyCap: Number(W(g("dailyCap"), 0)) / D, cooldown: Number(W(g("cooldown"), 0)), lastBuyAt: Number(W(g("lastBuyAt"), 0)),
      spendable: Number(W(g("spendable"), 0)) / D, spent: Number(W(g("totalSpent"), 0)) / D, burned: W(g("totalBurned"), 0).toString(), buys: Number(W(g("buys"), 0)),
      pending: pend && W(pend, 3) > 0n ? { maxBuy: Number(W(pend, 0)) / D, dailyCap: Number(W(pend, 1)) / D, cooldown: Number(W(pend, 2)), readyAt: Number(W(pend, 3)) } : null,
      poolId: g("poolId") ? lc(g("poolId")) : null, usdc: x[per - 1] ? Number(W(x[per - 1], 0)) / D : 0 };
  }).filter(Boolean);
}
/// symbol and decimals of each vault's token (for the lists)
async function tokenMeta(tokens, chain = "arc") {
  const u = [...new Set(tokens)];
  const r = await net(chain).ethCalls(u.flatMap((t) => [{ to: t, data: "0x95d89b41" }, { to: t, data: "0x313ce567" }]), { timeoutMs: 8000 }).catch(() => []);
  const str = (h) => { try { const x = strip(h); const len = Number(BigInt("0x" + x.slice(64, 128))); return new TextDecoder().decode(Uint8Array.from((x.slice(128, 128 + len * 2).match(/../g) || []).map((b) => parseInt(b, 16)))).replace(/[^\x20-\x7e]/g, "").slice(0, 16); } catch { return ""; } };
  return Object.fromEntries(u.map((t, i) => [t, { sym: r[i * 2] ? str(r[i * 2]) : "", dec: r[i * 2 + 1] ? Number(W(r[i * 2 + 1], 0)) : 18 }]));
}
/// is ARCIA's key on this server the factory's operator, and does it have gas (Arc: USDC, 18 decimals natively; Robinhood Chain: ETH)
async function keyHealth(operator, chain = "arc") {
  const N = net(chain);
  const key = N.key;
  const me = key ? lc(addressOfKey(key) || "") : "";
  let gas = null;
  if (operator) { try { gas = Number(BigInt(await N.rpcCall("eth_getBalance", [operator, "latest"]))) / 1e18; } catch { gas = null; } }
  // the key's ADDRESS (public) helps find a wrong key; the key itself never leaves the server
  return { key: !!key, valid: !!me, keyAddr: me ? `${me.slice(0, 6)}…${me.slice(-4)}` : null, match: !!me && me === operator, gas: gas == null ? null : Math.round(gas * (N.ch === "rh" ? 1e5 : 1000)) / (N.ch === "rh" ? 1e5 : 1000),
    unit: N.ch === "rh" ? "ETH" : "USDC", low: gas != null && gas < (N.ch === "rh" ? 0.002 : 0.5) };
}
export async function vaults(st, { token = "", vault = "", chain = "arc" } = {}) {
  const N = net(chain), f = N.factory;
  if (!f) return { live: false, chain: N.ch, vaults: [], note: N.ch === "rh" ? "Robinhood Chain vaults open once the ARCIA AGENT RH factory is deployed." : "Vaults open once the ARCIA AGENT factory is deployed." };
  const [list, fp, fop, fcb] = await N.ethCalls([token && isAddr(token) ? { to: f, data: S.vaultsOf + pad(lc(token)) } : { to: f, data: S.allVaults }, { to: f, data: S.paused }, { to: f, data: S.operator }, { to: f, data: S.createBurn }]);
  let addrs = addrList(list);
  if (vault && isAddr(vault)) addrs = addrs.filter((a) => a === lc(vault));
  const vs = await vaultState(addrs.slice(0, 60), N.ch);
  const acts = (((await getJ(st, K.acts)) || { items: [] }).items || []).filter((a) => chainOf(a.ch) === N.ch);
  const docs = await Promise.all(vs.map((v) => getJ(st, K.vault(v.vault))));
  const operator = fop ? lc(A(fop, 0)) : null;
  const [meta, health, px] = await Promise.all([tokenMeta(vs.map((v) => v.token), N.ch), keyHealth(operator, N.ch), N.ch === "rh" ? ethUsd() : null]);
  return { live: true, chain: N.ch, unit: N.ch === "rh" ? "ETH" : "USDC", ...(N.ch === "rh" ? { ethUsd: px } : {}), factory: f, paused: fp ? W(fp, 0) === 1n : null, operator, createBurn: fcb ? W(fcb, 0).toString() : "0", health, modes: MODES,
    vaults: vs.map((v, i) => ({ ...v, ...(meta[v.token] || {}), mode: (docs[i] && docs[i].mode) || "dip", status: (docs[i] && docs[i].status) || null, acts: acts.filter((a) => a.vault === v.vault).slice(0, 20) })),
    recent: (token ? acts.filter((a) => a.token === lc(token)) : acts).slice(0, 30).map((a) => ({ ...a, ...(meta[a.token] || {}) })) };
}
/// Robinhood Chain: where a vault can buy the token — its Uniswap v3 pools with WETH (each fee tier) and its v4 pools with
/// ETH / WETH (keys from ARCIRCLE Orders' pool finder), deepest first
export async function poolsRh(token, { store = null } = {}) {
  token = lc(token);
  if (!isAddr(token)) return { error: "token must be an address" };
  const fees = [100, 500, 3000, 10000];
  const r = await rh().ethCalls(fees.map((f) => ({ to: CFG.v3Factory, data: sel("getPool(address,address,uint24)") + pad(token) + pad(CFG.weth) + u(f) }))).catch(() => []);
  const v3 = fees.map((f, i) => ({ f, a: r[i] ? lc(A(r[i], 0)) : null })).filter((x) => x.a && !/^0x0{40}$/.test(x.a));
  let dex = [];
  try { const j = await (await fetch(`https://api.dexscreener.com/token-pairs/v1/robinhood/${token}`, { signal: AbortSignal.timeout(6000) })).json(); dex = Array.isArray(j) ? j : []; } catch { dex = []; }
  const liqOf = (id) => { const p = dex.find((x) => lc(x && x.pairAddress) === lc(id)); return p && p.liquidity ? p.liquidity.usd || null : null; };
  const out = v3.map((x) => ({ v: 3, pool: x.a, venue: "Uniswap v3 · WETH", feePct: x.f / 10000, liqUsd: liqOf(x.a) }));
  try {
    const OX = (await import("./_orders.mjs")).forChain("rh");
    const p4 = await OX.pools(token, { store });
    for (const p of (p4 && p4.pools) || []) out.push({ v: 4, id: p.id, key: p.key, venue: p.venue || "Uniswap v4", feePct: p.feePct, liqUsd: (p.dex && p.dex.liqUsd) || null });
  } catch { /* v3 only */ }
  out.sort((a, b) => (b.liqUsd || 0) - (a.liqUsd || 0));
  return { token, pools: out };
}

// ---------------------------------------------------------------- each vault's strategy (its owner signs it)
/// dip — buys only in pullbacks (never after +8%/15m or +20%/1h) · steady — one buy each cooldown whatever the price
/// did (still sized to the pool and stopped by a hostile tax) · volume — like dip, but each buy is at most 2% of the
/// token's hourly volume, so busy tokens get more and quiet ones less
export const MODES = ["dip", "steady", "volume"];
export const modeMessage = (vault, mode, issued) => `ARCIRCLE PAD — ARCIA AGENT vault strategy\nVault: ${lc(vault)}\nStrategy: ${mode}\nIssued: ${issued}`;
export async function saveMode(st, b, recover) {
  const vault = lc(b && b.vault), mode = String((b && b.mode) || "");
  if (!isAddr(vault) || !MODES.includes(mode)) return { status: 400, body: { error: "unknown vault or strategy" } };
  const issued = String((b && b.issued) || ""), t = Date.parse(issued);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== issued || t > Date.now() + 120e3 || Date.now() - t > 10 * 60e3) return { status: 400, body: { error: "the signature is too old — sign again" } };
  let signer;
  try { signer = lc(recover(modeMessage(vault, mode, issued), String(b.signature || ""))); } catch { return { status: 400, body: { error: "bad signature" } }; }
  const N = net(b && b.chain), f = N.factory;
  if (!f) return { status: 503, body: { error: "vaults aren't open yet" } };
  const [isV] = await N.ethCalls([{ to: f, data: sel("isVault(address)") + pad(vault) }]);
  if (!isV || W(isV, 0) !== 1n) return { status: 404, body: { error: "not an ARCIA AGENT vault" } };
  const [ow] = await N.ethCalls([{ to: vault, data: S.owner }]);
  if (!ow || lc(A(ow, 0)) !== signer) return { status: 403, body: { error: "only the vault's owner can change its strategy" } };
  if (!st) return { status: 503, body: { error: "the store isn't configured" } };
  const doc = (await getJ(st, K.vault(vault))) || {};
  doc.mode = mode; doc.modeBy = signer; doc.modeAt = now();
  await putJ(st, K.vault(vault), doc);
  return { status: 200, body: { ok: true, mode } };
}

// ---------------------------------------------------------------- the agent's rules for a vault
export const RULES = {
  probeUsd: 0.2, // a tiny quote for the price now
  minBuy: 0.5, // USDC — below this a buy isn't worth the gas
  maxImpactPct: 3, // a buy may move the price at most this much (halved until it fits)
  chase15: 8, chase60: 20, // no buy after a +8% move in 15 minutes or +20% in an hour: wait for a pullback
  needPts: 3, // price points seen before the first buy
  maxTaxPct: 30, // a buy-and-sell round trip losing more than this = hostile tax: stop
  slipPct: 2, // minOut = the quote minus this
  perTick: 3, // vault buys per run
};
/// the dollar amount a vault spends, in its own units: USDC (6 decimals) on Arc, wei of ETH on Robinhood Chain
const unitsOf = (usd, px) => (px ? BigInt(Math.floor((usd / px) * 1e18)) : BigInt(Math.round(usd * 1e6)));
const quoteOf = async (v, usd, ch = "arc", px = null) => {
  const r = await rawCalls([{ to: v, data: S.quote + u(unitsOf(usd, px)) }], ch);
  const d = r[0];
  return d && lc(d).startsWith(ERR.quote) ? W("0x" + strip(d).slice(8), 0) : null;
};
/// [tokens, what came back scaled to 1e6 per dollar put in] — the same tax maths on both chains
const rtOf = async (v, usd, ch = "arc", px = null) => {
  const amt = unitsOf(usd, px);
  const r = await rawCalls([{ to: v, data: S.rt + u(amt) }], ch);
  const d = r[0];
  if (!(d && lc(d).startsWith(ERR.rt))) return null;
  const back = W("0x" + strip(d).slice(8), 1);
  return [W("0x" + strip(d).slice(8), 0), px ? (back * BigInt(Math.round(usd * 1e6))) / amt : back];
};
/// eth_calls expected to revert: the revert data of each
async function rawCalls(calls, ch = "arc") {
  const body = calls.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] }));
  let res; try { res = await net(ch).rpc(body, { timeoutMs: 8000 }); } catch { return calls.map(() => null); }
  const by = new Map((Array.isArray(res) ? res : [res]).map((x) => [x && x.id, x]));
  return calls.map((_, i) => { const x = by.get(i); if (!x || !x.error) return null; const e = x.error; const d = typeof e.data === "string" ? e.data : e.data && (e.data.data || e.data.result); if (typeof d === "string") return d; const m = String(e.message || "").match(/0x[0-9a-fA-F]{8,}/); return m ? m[0] : null; });
}
/// the decision for one vault: { go, usd, minOut, why } or { go:false, why }
export async function decide(v, doc, { t = now(), q = quoteOf, rt = rtOf } = {}) {
  if (v.paused) return { go: false, why: "paused by its owner" };
  if (!v.agentOn) return { go: false, why: "the owner turned ARCIA off" };
  if (v.usdc < RULES.minBuy) return { go: false, why: "waiting for USDC" };
  // the price is followed every run, cooling down or not, so the pullback check always has an hour of points
  const probe = await q(v.vault, RULES.probeUsd);
  if (!probe || probe === 0n) return { go: false, why: "the pool can't be quoted right now" };
  const px = RULES.probeUsd / Number(probe); // USDC per token unit
  const pts = [...((doc && doc.pts) || []).filter((p) => t - p[0] <= 3600), [t, px]].slice(-90);
  doc.pts = pts;
  if (v.lastBuyAt && t < v.lastBuyAt + v.cooldown) return { go: false, why: "cooling down between buys", quiet: true };
  // the vault's own limits come before the pool: a used-up day isn't a thin pool
  if (v.spendable < RULES.minBuy) return { go: false, why: "today's limit is used up — buying again after 00:00 UTC", quiet: true };
  if (v.maxBuy < RULES.minBuy) return { go: false, why: "the per-buy limit is under the $0.50 minimum", quiet: true };
  const mode = MODES.includes(doc.mode) ? doc.mode : "dip";
  if (mode !== "steady") {
    if (pts.length < RULES.needPts) return { go: false, why: "watching the price before the first buy", quiet: true };
    const lo15 = Math.min(...pts.filter((p) => t - p[0] <= 900).map((p) => p[1])), first60 = pts[0][1];
    const up15 = (px / lo15 - 1) * 100, up60 = (px / first60 - 1) * 100;
    if (up15 >= RULES.chase15 || up60 >= RULES.chase60) return { go: false, why: `up ${r2(Math.max(up15, up60), 1)}% — waiting for a pullback, not chasing` };
  }
  if (!doc.taxAt || t - doc.taxAt > 6 * 3600) {
    const r = await rt(v.vault, 1);
    doc.taxAt = t;
    doc.tax = r ? r2((1 - Number(r[1]) / 1e6) * 100, 1) : null;
  }
  if (doc.tax != null && doc.tax > RULES.maxTaxPct) return { go: false, why: `a buy-and-sell round trip loses ${doc.tax}% — hostile tax, not buying` };
  let usd = Math.min(v.maxBuy, v.spendable, v.usdc);
  if (mode === "volume") {
    const hourly = doc.vol24 != null ? doc.vol24 / 24 : null;
    if (hourly == null) return { go: false, why: "waiting for the token's trading volume", quiet: true };
    usd = Math.min(usd, Math.max(RULES.minBuy, hourly * 0.02));
  }
  let out = null;
  for (let i = 0; i < 5 && usd >= RULES.minBuy; i++) {
    out = await q(v.vault, usd);
    if (!out) return { go: false, why: "the pool can't be quoted right now" };
    const impact = (1 - (Number(out) / usd) / (Number(probe) / RULES.probeUsd)) * 100;
    if (impact <= RULES.maxImpactPct) return { go: true, usd: Math.floor(usd * 100) / 100, out, minOut: (out * BigInt(100 - RULES.slipPct)) / 100n, why: `${mode === "steady" ? "steady buy" : mode === "volume" ? "volume-sized buy" : "dip-safe buy"} · impact ${r2(Math.max(0, impact), 1)}%` };
    usd = usd / 2;
  }
  return { go: false, why: "the pool is too thin for even a small buy" };
}

// ---------------------------------------------------------------- proof the calls came first
/// one root for a day's calls: keccak256 of their hashes in the order they were made
export const rootOf = (hashes) => keccakHex(hashes.map((h) => strip(h)).join(""));
export const anchorData = (date, root) => "0x" + hexOf(`ARCIA AGENT calls ${date}:`) + strip(root);
export async function anchorDay(st, { key, send = sendTx, clock = now } = {}) {
  const d = Math.floor(clock() / 86400) - 1, date = new Date(d * 86400e3).toISOString().slice(0, 10);
  const Adoc = (await getJ(st, K.anchors)) || { items: [] };
  if ((Adoc.items || []).some((x) => x.day === d)) return null;
  const L = (await getJ(st, K.calls)) || { items: [] };
  const cs = (L.items || []).filter((c) => c.hash && Math.floor(c.at / 86400) === d).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const row = { day: d, date, n: cs.length, root: null, tx: null, ids: cs.map((c) => c.id) };
  if (cs.length) {
    row.root = rootOf(cs.map((c) => c.hash));
    const me = addressOfKey(key);
    const r = await send({ to: me, data: anchorData(date, row.root), key });
    if (!r || !r.ok) return { error: "the anchor transaction didn't go through" };
    row.tx = r.hash;
  }
  Adoc.items = [row, ...(Adoc.items || [])].slice(0, 120);
  await putJ(st, K.anchors, Adoc);
  return row;
}

// ---------------------------------------------------------------- the run (after each desk tick)
export async function tick(st, { budgetMs = CFG.budgetMs, send = sendTx, sendRh = null, clock = now } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  const out = { graded: 0, vaults: 0, acts: [], skipped: [] };
  out.graded = await gradeDue(st, { max: 2 }).catch(() => 0);
  if (left() < 4000) return out;
  // Arc first (with the day's anchor), then Robinhood Chain in what's left
  if (CFG.factory()) await work(st, "arc", { left, send, clock, out, anchor: true });
  if (CFG.rhFactory() && left() > 6000) {
    out.rh = { vaults: 0, acts: [], skipped: [] };
    await work(st, "rh", { left, send: sendRh || net("rh").send, clock, out: out.rh });
    out.acts.push(...out.rh.acts);
  }
  return out;
}
async function work(st, ch, { left, send, clock, out, anchor = false }) {
  const N = net(ch), f = N.factory, key = N.key, isRh = N.ch === "rh";
  const [list, fp, fop] = await N.ethCalls([{ to: f, data: S.allVaults }, { to: f, data: S.paused }, { to: f, data: S.operator }]);
  if (fp && W(fp, 0) === 1n) { out.skipped.push("all vaults paused by the team"); return; }
  const me = key ? lc(addressOfKey(key)) : null;
  const opOk = !!me && fop && lc(A(fop, 0)) === me;
  // once a day: yesterday's call hashes (both chains'), written on Arc by ARCIA's key
  if (anchor && opOk && left() > 8000) out.anchor = await anchorDay(st, { key, send, clock }).catch((e) => ({ error: String(e.message || e).slice(0, 120) }));
  const addrs = addrList(list);
  if (!addrs.length) return;
  const px = isRh ? await ethUsd() : null;
  if (isRh && !px) { out.skipped.push("no ETH price right now"); return; }
  // round-robin: a different slice each run
  const ck = isRh ? K.cursorRh : K.cursor;
  const cur = (await getJ(st, ck)) || { i: 0 };
  const start = cur.i % addrs.length, order = [...addrs.slice(start), ...addrs.slice(0, start)].slice(0, 20);
  await putJ(st, ck, { i: start + order.length }).catch(() => {});
  const vs = await vaultState(order, N.ch);
  out.vaults = vs.length;
  let sent = 0;
  const acts = [];
  for (const v of vs) {
    if (left() < 5000) break;
    const doc = (await getJ(st, K.vault(v.vault))) || {};
    if (doc.mode === "volume" && (!doc.volAt || clock() - doc.volAt > 1800)) {
      const m = await scanCore.readMarket(scanner.ioOf(N.ch), v.token).catch(() => null);
      doc.vol24 = m && m.pairs ? m.pairs.reduce((a, x) => a + (x.vol || 0), 0) : null; doc.volAt = clock();
    }
    // an owner's looser limits (queued an hour): ARCIA applies them herself once they're due (anyone may)
    if (v.pending && v.pending.readyAt && v.pending.readyAt <= clock() && opOk && left() > 8000) {
      const r = await send({ to: v.vault, data: S.apply, key }).catch((e) => ({ ok: false, err: String(e.message || e) }));
      if (r.ok) {
        const spentToday = Math.max(0, v.dailyCap - v.spendable);
        v.maxBuy = v.pending.maxBuy; v.dailyCap = v.pending.dailyCap; v.cooldown = v.pending.cooldown;
        v.spendable = Math.max(0, v.dailyCap - spentToday); v.pending = null;
        (out.applied = out.applied || []).push({ vault: v.vault, tx: r.hash });
      }
    }
    // the rules are in dollars: a Robinhood Chain vault's ETH counted at today's price
    const vd = isRh ? { ...v, maxBuy: v.maxBuy * px, dailyCap: v.dailyCap * px, spendable: v.spendable * px, usdc: v.usdc * px } : v;
    const q = (a, usd) => quoteOf(a, usd, N.ch, px);
    const rt = (a, usd) => rtOf(a, isRh ? Math.min(usd, vd.usdc * 0.9) : usd, N.ch, px); // a v3 round trip spends the vault's own WETH inside the call
    const d = await decide(vd, doc, { t: clock(), q, rt }).catch((e) => ({ go: false, why: "error: " + String(e.message || e).slice(0, 80) }));
    doc.status = { at: clock(), why: d.why, go: !!d.go };
    if (d.go && opOk && sent < RULES.perTick) {
      const amt = unitsOf(d.usd, px);
      const r = await send({ to: v.vault, data: S.burn + u(amt) + u(d.minOut), key }).catch((e) => ({ ok: false, err: String(e.message || e) }));
      sent++;
      if (r.ok) { acts.push({ ts: clock(), ...(isRh ? { ch: "rh", eth: Number(amt) / 1e18 } : {}), vault: v.vault, token: v.token, usd: d.usd, burned: d.out.toString(), tx: r.hash, why: d.why }); doc.status.why = `bought and burned with $${d.usd}`; }
      else doc.status.why = `buy failed: ${String(r.err || (r.ok === null ? "no receipt yet" : "reverted")).slice(0, 80)}`;
    } else if (d.go && !opOk) doc.status.why = "ready — ARCIA's agent key isn't set on this server";
    await putJ(st, K.vault(v.vault), doc).catch(() => {});
  }
  if (acts.length) {
    const L = (await getJ(st, K.acts)) || { items: [] };
    L.items = [...acts.reverse(), ...(L.items || [])].slice(0, 500);
    await putJ(st, K.acts, L).catch(() => {});
  }
  out.acts = acts;
}
export const _test = { K, unpack, pack, S, keyHealth, unitsOf, quoteOf, rtOf };
