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
import { ethCalls, isAddr, pad, strip, keccakHex, rpc } from "./_arc.mjs";
import { sendTx, addressOfKey } from "./_x402.mjs";
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
export const CFG = {
  factory: () => (isAddr(env("ARCIA_AGENT_FACTORY")) ? lc(env("ARCIA_AGENT_FACTORY")) : null),
  key: () => env("ARCIA_AGENT_KEY") || null,
  usdc: USDC,
  budgetMs: 15000,
};
export function configure(o) { Object.assign(CFG, o); }

// ---------------------------------------------------------------- store (one JSON string per doc, like the desk)
const pack = (o) => ({ j: JSON.stringify(o) });
const unpack = (d) => { if (!d) return null; if (typeof d.j === "string") { try { return JSON.parse(d.j); } catch { return null; } } return d; };
const K = { rep: (t) => `agentRep/${t}`, call: (t) => `agentCall/${t}`, calls: "agent/calls", vault: (v) => `agentVault/${v}`, acts: "agent/acts", cursor: "agent/cursor" };
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
  if (score != null && score >= 75 && liq != null && liq >= 5000 && (top10 == null || top10 <= 35)) return { call: "safe", why: [`scanner score ${score}/100`, `$${Math.round(liq).toLocaleString("en-US")} of liquidity`, top10 != null ? `top 10 hold ${Math.round(top10)}%` : "holders spread"] };
  const w = [];
  if (score != null) w.push(`scanner score ${score}/100`);
  if (liq == null) w.push("no market data yet"); else if (liq < 5000) w.push(`$${Math.round(liq).toLocaleString("en-US")} of liquidity`);
  if (top10 != null && top10 > 35) w.push(`top 10 hold ${Math.round(top10)}%`);
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
const hashOf = (c) => keccakHex(hexOf(JSON.stringify({ t: c.t, call: c.call, px0: c.px0, liq0: c.liq0, at: c.at, until: c.until })));

// ---------------------------------------------------------------- market (light: Dexscreener, else the full scan)
async function marketOf(token, st) {
  const m = await scanCore.readMarket(scanner.io, token).catch(() => null);
  const p = m && m.pairs && m.pairs[0];
  if (p && p.price) return { px: p.price, liq: m.pairs.reduce((t, x) => t + (x.liq || 0), 0), src: "dex" };
  const r = await scanner.apiResult(token, { store: st }).catch(() => null);
  return r && r.market && r.market.price_usd ? { px: r.market.price_usd, liq: r.market.liquidity_usd ?? null, src: "scan" } : null;
}

// ---------------------------------------------------------------- the report
export async function report(st, token, { ask = null, maxAgeS = 600 } = {}) {
  token = lc(token);
  if (!isAddr(token)) return { error: "paste an Arc token address (0x…)" };
  const hit = await getJ(st, K.rep(token));
  if (hit && now() - hit.at < maxAgeS && hit.v === AGENT_VERSION) return { ...hit, cached: true, call: await currentCall(st, token, hit) };
  const scan = await scanner.apiResult(token, { store: st });
  if (!scan || !scan.verdict) return { error: "that address isn't a token ARCIA can read on Arc", token };
  const m = scan.market || {}, h = scan.holders || {};
  const facts = { score: scan.score, verdict: scan.verdict, critical: scan.critical || [], liq: m.liquidity_usd ?? null, px: m.price_usd ?? null, mcap: m.market_cap_usd ?? null,
    top10: h.top10_pct ?? null, holders: h.count ?? null, linked: h.linked_top_pct ?? null, created: m.pool_created ?? null, sections: scan.sections || {}, confidence: scan.confidence ?? null };
  const rep = { v: AGENT_VERSION, t: token, at: now(), name: scan.name || "", sym: scan.symbol || "", dec: scan.decimals ?? 18, facts,
    reasons: (scan.reasons || []).slice(0, 6), checks: (scan.checks || []).filter((c) => c.status !== "ok").slice(0, 10).map((c) => ({ group: c.group, status: c.status, title: c.title, detail: c.detail })),
    summary: scan.summary || "", page: scan.page };
  const c0 = callOf(facts);
  rep.take = await takeOf(rep, c0, ask).catch(() => null);
  await putJ(st, K.rep(token), rep).catch(() => {});
  return { ...rep, call: await makeCall(st, rep, c0) };
}
/// ARCIA's own words about the token: Claude when the key is set, else a plain line from the rules
async function takeOf(rep, c0, ask) {
  const f = rep.facts;
  const plain = c0.call === "risky" ? `I'd stay careful with ${rep.sym || "this one"}: ${c0.why.join(", ")}.`
    : c0.call === "safe" ? `${rep.sym || "This token"} reads clean to me right now — ${c0.why.join(", ")}. Clean isn't a promise; I'll grade myself in 24 hours.`
    : `${rep.sym || "This token"} is somewhere in between: ${c0.why.join(", ") || "not enough data yet"}. I'm watching, not cheering.`;
  if (!env("ANTHROPIC_API_KEY") || env("ARCIA_AGENT_AI") === "0") return { text: plain, ai: false };
  const askFn = ask || (await import("./_arcia-brain.mjs")).askClaude;
  const text = await askFn({ L: null, maxTokens: 220, messages: [{ role: "user", content:
    `You are ARCIA reading an Arc token for someone who pasted its address into ARCIA AGENT. Write 2–3 short sentences in first person, plain English, calm and honest: what stands out (good and bad) and what to watch. Never tell anyone to buy or sell, never predict price, no hype, no emojis. Your safety call for the next 24h is "${c0.call}" (${c0.why.join("; ")}). Only use these facts:\n` +
    JSON.stringify({ symbol: rep.sym, name: rep.name, ...f, reasons: rep.reasons.map((r) => r.title || r), issues: rep.checks.map((c) => c.title) }) }] });
  return text ? { text: String(text).slice(0, 600), ai: true } : { text: plain, ai: false };
}
/// one call per token per 12 hours; a newer report reuses the open one
async function makeCall(st, rep, c0) {
  const open = await getJ(st, K.call(rep.t));
  if (open && now() - open.at < CALL.every) return open;
  const c = { id: `${rep.t.slice(2, 10)}${now().toString(36)}`, t: rep.t, sym: rep.sym, call: c0.call, why: c0.why, px0: rep.facts.px, liq0: rep.facts.liq, score0: rep.facts.score, at: now(), until: now() + CALL.hours * 3600, graded: null };
  c.hash = hashOf(c);
  await putJ(st, K.call(rep.t), c).catch(() => {});
  const L = (await getJ(st, K.calls)) || { items: [] };
  L.items = [c, ...(L.items || [])].slice(0, 400);
  await putJ(st, K.calls, L).catch(() => {});
  return c;
}
async function currentCall(st, token, rep) { return (await getJ(st, K.call(token))) || makeCall(st, rep, callOf(rep.facts)); }

/// grade the calls whose 24 hours are up (a few per run)
export async function gradeDue(st, { max = 3, market = marketOf } = {}) {
  const L = (await getJ(st, K.calls)) || { items: [] };
  const due = (L.items || []).filter((c) => !c.graded && now() >= c.until).slice(0, max);
  let n = 0;
  for (const c of due) {
    const m = await market(c.t, st).catch(() => null);
    const o = outcomeOf(c, m);
    // no market 48h after the deadline: void (the pool is gone or unreadable)
    if (!o && now() < c.until + 48 * 3600) continue;
    c.graded = { at: now(), px: m ? m.px : null, liq: m ? m.liq : null, ...(o || { void: true }), right: o ? gradeOf(c, o) : null };
    n++;
  }
  if (n) await putJ(st, K.calls, L);
  return n;
}
export async function record(st) {
  const L = (await getJ(st, K.calls)) || { items: [] };
  const items = L.items || [];
  const g = (k) => { const x = items.filter((c) => c.call === k && c.graded && c.graded.right != null); return { n: x.length, right: x.filter((c) => c.graded.right).length }; };
  return { calls: items.slice(0, 60), stats: { total: items.length, open: items.filter((c) => !c.graded).length, safe: g("safe"), risky: g("risky") }, rules: CALL };
}

// ---------------------------------------------------------------- vaults (reads)
const S = {
  vaultsOf: sel("vaultsOf(address)"), allVaults: sel("allVaults()"), paused: sel("paused()"), operator: sel("operator()"), createBurn: sel("createBurn()"),
  owner: sel("owner()"), token: sel("token()"), agentOn: sel("agentOn()"), maxBuy: sel("maxBuy()"), dailyCap: sel("dailyCap()"), cooldown: sel("cooldown()"),
  lastBuyAt: sel("lastBuyAt()"), spendable: sel("spendableToday()"), totalSpent: sel("totalSpent()"), totalBurned: sel("totalBurned()"), buys: sel("buys()"),
  pending: sel("pending()"), poolId: sel("poolId()"), balanceOf: sel("balanceOf(address)"),
  quote: sel("quote(uint256)"), rt: sel("quoteRoundTrip(uint256)"), burn: sel("buyAndBurn(uint256,uint256)"),
};
const ERR = { quote: sel("QuoteResult(uint256)"), rt: sel("RoundTripResult(uint256,uint256)") };
function addrList(h) { if (!h) return []; const n = Number(W(h, 1)); return Array.from({ length: Math.min(n, 500) }, (_, i) => lc(A(h, 2 + i))); }
export async function vaultState(addrs) {
  if (!addrs.length) return [];
  const F = ["owner", "token", "paused", "agentOn", "maxBuy", "dailyCap", "cooldown", "lastBuyAt", "spendable", "totalSpent", "totalBurned", "buys", "pending", "poolId"];
  const calls = addrs.flatMap((v) => [...F.map((f) => ({ to: v, data: S[f] })), { to: CFG.usdc, data: S.balanceOf + pad(v) }]);
  const r = await ethCalls(calls, { timeoutMs: 8000 });
  const per = F.length + 1;
  return addrs.map((v, i) => {
    const x = r.slice(i * per, i * per + per), g = (k) => x[F.indexOf(k)];
    if (!g("owner")) return null;
    const pend = g("pending");
    return { vault: v, owner: lc(A(g("owner"), 0)), token: lc(A(g("token"), 0)), paused: W(g("paused"), 0) === 1n, agentOn: W(g("agentOn"), 0) === 1n,
      maxBuy: Number(W(g("maxBuy"), 0)) / 1e6, dailyCap: Number(W(g("dailyCap"), 0)) / 1e6, cooldown: Number(W(g("cooldown"), 0)), lastBuyAt: Number(W(g("lastBuyAt"), 0)),
      spendable: Number(W(g("spendable"), 0)) / 1e6, spent: Number(W(g("totalSpent"), 0)) / 1e6, burned: W(g("totalBurned"), 0).toString(), buys: Number(W(g("buys"), 0)),
      pending: pend && W(pend, 3) > 0n ? { maxBuy: Number(W(pend, 0)) / 1e6, dailyCap: Number(W(pend, 1)) / 1e6, cooldown: Number(W(pend, 2)), readyAt: Number(W(pend, 3)) } : null,
      poolId: g("poolId") ? lc(g("poolId")) : null, usdc: x[per - 1] ? Number(W(x[per - 1], 0)) / 1e6 : 0 };
  }).filter(Boolean);
}
export async function vaults(st, { token = "", vault = "" } = {}) {
  const f = CFG.factory();
  if (!f) return { live: false, vaults: [], note: "Vaults open once the ARCIA AGENT factory is deployed." };
  const [list, fp, fop, fcb] = await ethCalls([token && isAddr(token) ? { to: f, data: S.vaultsOf + pad(lc(token)) } : { to: f, data: S.allVaults }, { to: f, data: S.paused }, { to: f, data: S.operator }, { to: f, data: S.createBurn }]);
  let addrs = addrList(list);
  if (vault && isAddr(vault)) addrs = addrs.filter((a) => a === lc(vault));
  const vs = await vaultState(addrs.slice(0, 60));
  const acts = ((await getJ(st, K.acts)) || { items: [] }).items || [];
  const docs = await Promise.all(vs.map((v) => getJ(st, K.vault(v.vault))));
  return { live: true, factory: f, paused: fp ? W(fp, 0) === 1n : null, operator: fop ? lc(A(fop, 0)) : null, createBurn: fcb ? W(fcb, 0).toString() : "0",
    vaults: vs.map((v, i) => ({ ...v, status: (docs[i] && docs[i].status) || null, acts: acts.filter((a) => a.vault === v.vault).slice(0, 20) })),
    recent: token ? acts.filter((a) => a.token === lc(token)).slice(0, 20) : acts.slice(0, 30) };
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
const quoteOf = async (v, usd) => {
  const r = await rawCalls([{ to: v, data: S.quote + u(Math.round(usd * 1e6)) }]);
  const d = r[0];
  return d && lc(d).startsWith(ERR.quote) ? W("0x" + strip(d).slice(8), 0) : null;
};
const rtOf = async (v, usd) => {
  const r = await rawCalls([{ to: v, data: S.rt + u(Math.round(usd * 1e6)) }]);
  const d = r[0];
  return d && lc(d).startsWith(ERR.rt) ? [W("0x" + strip(d).slice(8), 0), W("0x" + strip(d).slice(8), 1)] : null;
};
/// eth_calls expected to revert: the revert data of each
async function rawCalls(calls) {
  const body = calls.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] }));
  let res; try { res = await rpc(body, { timeoutMs: 8000 }); } catch { return calls.map(() => null); }
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
  if (pts.length < RULES.needPts) return { go: false, why: "watching the price before the first buy", quiet: true };
  const lo15 = Math.min(...pts.filter((p) => t - p[0] <= 900).map((p) => p[1])), first60 = pts[0][1];
  const up15 = (px / lo15 - 1) * 100, up60 = (px / first60 - 1) * 100;
  if (up15 >= RULES.chase15 || up60 >= RULES.chase60) return { go: false, why: `up ${r2(Math.max(up15, up60), 1)}% — waiting for a pullback, not chasing` };
  if (!doc.taxAt || t - doc.taxAt > 6 * 3600) {
    const r = await rt(v.vault, 1);
    doc.taxAt = t;
    doc.tax = r ? r2((1 - Number(r[1]) / 1e6) * 100, 1) : null;
  }
  if (doc.tax != null && doc.tax > RULES.maxTaxPct) return { go: false, why: `a buy-and-sell round trip loses ${doc.tax}% — hostile tax, not buying` };
  let usd = Math.min(v.maxBuy, v.spendable, v.usdc);
  let out = null;
  for (let i = 0; i < 5 && usd >= RULES.minBuy; i++) {
    out = await q(v.vault, usd);
    if (!out) return { go: false, why: "the pool can't be quoted right now" };
    const impact = (1 - (Number(out) / usd) / (Number(probe) / RULES.probeUsd)) * 100;
    if (impact <= RULES.maxImpactPct) return { go: true, usd: Math.floor(usd * 100) / 100, out, minOut: (out * BigInt(100 - RULES.slipPct)) / 100n, why: `dip-safe buy · impact ${r2(Math.max(0, impact), 1)}%` };
    usd = usd / 2;
  }
  return { go: false, why: "the pool is too thin for even a small buy" };
}

// ---------------------------------------------------------------- the run (after each desk tick)
export async function tick(st, { budgetMs = CFG.budgetMs, send = sendTx, clock = now } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  const out = { graded: 0, vaults: 0, acts: [], skipped: [] };
  out.graded = await gradeDue(st, { max: 2 }).catch(() => 0);
  const f = CFG.factory(), key = CFG.key();
  if (!f || left() < 4000) return out;
  const [list, fp, fop] = await ethCalls([{ to: f, data: S.allVaults }, { to: f, data: S.paused }, { to: f, data: S.operator }]);
  if (fp && W(fp, 0) === 1n) { out.skipped.push("all vaults paused by the team"); return out; }
  const me = key ? lc(addressOfKey(key)) : null;
  const opOk = !!me && fop && lc(A(fop, 0)) === me;
  const addrs = addrList(list);
  if (!addrs.length) return out;
  // round-robin: a different slice each run
  const cur = (await getJ(st, K.cursor)) || { i: 0 };
  const start = cur.i % addrs.length, order = [...addrs.slice(start), ...addrs.slice(0, start)].slice(0, 20);
  await putJ(st, K.cursor, { i: start + order.length }).catch(() => {});
  const vs = await vaultState(order);
  out.vaults = vs.length;
  let sent = 0;
  const acts = [];
  for (const v of vs) {
    if (left() < 5000) break;
    const doc = (await getJ(st, K.vault(v.vault))) || {};
    const d = await decide(v, doc, { t: clock() }).catch((e) => ({ go: false, why: "error: " + String(e.message || e).slice(0, 80) }));
    doc.status = { at: clock(), why: d.why, go: !!d.go };
    if (d.go && opOk && sent < RULES.perTick) {
      const r = await send({ to: v.vault, data: S.burn + u(Math.round(d.usd * 1e6)) + u(d.minOut), key }).catch((e) => ({ ok: false, err: String(e.message || e) }));
      sent++;
      if (r.ok) { acts.push({ ts: clock(), vault: v.vault, token: v.token, usd: d.usd, burned: d.out.toString(), tx: r.hash, why: d.why }); doc.status.why = `bought and burned with $${d.usd}`; }
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
  return out;
}
export const _test = { K, unpack, pack, S };
