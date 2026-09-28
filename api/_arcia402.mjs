// api/_arcia402.mjs — ARCIA 402: ARCIA as an economic agent on Arc.
//   SELL  four paid endpoints (x402, USDC on Arc) that other agents and people call:
//         token-analysis 0.02 · wallet-analysis 0.03 · launch-analysis 0.05 · arc-intelligence 0.01
//   BUY   ARCIA finds x402 services that take USDC on Arc (Circle's Discovery API), checks the
//         price against her budget, pays from her own wallet and keeps what she learned
//   BOOKS every sale and purchase goes into a public ledger: revenue, expenses, net, tasks
// Payments and signing: api/_x402.mjs. Numbers: the same readers the rest of the site uses.
import * as X from "./_x402.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import { isAddr, getCoin, allPools, tokenBalance } from "./_arc.mjs";
import { ARCIRCLE_TOKEN } from "./_arcircle.mjs";
import * as scanner from "./_scan.mjs";
import * as drop from "./_drop.mjs";
import * as liquidity from "./_liquidity.mjs";
import * as argusArc from "./_argus-arcpad.mjs";
import { live, liveText, askClaude } from "./_arcia-brain.mjs";

const SITE = "https://www.arcircle.app";
const lc = (a) => String(a || "").toLowerCase();
const U = (usd) => Math.round(usd * 1e6); // USDC, 6 decimals
export const SERVICES = [
  { id: "token-analysis", price: U(0.02), title: "Token Intelligence", input: "token", desc: "Full safety scan of any Arc token — contract, owner powers, holders, liquidity, market — scored 0–100, with ARCIA's read." },
  { id: "wallet-analysis", price: U(0.03), title: "Wallet Intelligence", input: "wallet", desc: "What a wallet holds and did on ARCIRCLE PAD: USDC and $ARCIRCLE, airdrops received, LP positions, rank among holders." },
  { id: "launch-analysis", price: U(0.05), title: "Launch Intelligence", input: "token", desc: "An ArcPad or Argus launch in depth: price, market cap, age, creator, support milestones and the safety scan, with ARCIA's take." },
  { id: "arc-intelligence", price: U(0.01), title: "Arc Intelligence", input: null, desc: "The state of ARCIRCLE on Arc right now: $ARCIRCLE numbers, the newest launches, recent airdrops and the most-scanned tokens." },
];
export const serviceOf = (id) => SERVICES.find((s) => s.id === id) || null;

// ---------------- store: ledger + used payments ----------------
const store = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d), getMany: (ks) => getDocs(ks) } : null);
const LEDGER = "arcia402/ledger";
const mem = { ledger: null, used: new Set() };
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
async function readLedger(st) {
  if (st) { try { const d = await st.get(LEDGER); if (d && d.tot) return d; } catch { /* memory */ } }
  return mem.ledger || { items: [], tot: { earned: 0, spent: 0, sold: 0, bought: 0 }, days: {}, fails: {} };
}
async function book(entry) {
  const st = store();
  const L = await readLedger(st);
  const e = { t: Date.now(), ...entry };
  L.items = [e, ...(L.items || [])].slice(0, 300);
  const d = (L.days[day()] = L.days[day()] || { e: 0, s: 0, sold: 0, bought: 0 });
  if (e.kind === "earn") { L.tot.earned += e.amount; L.tot.sold++; d.e += e.amount; d.sold++; }
  if (e.kind === "spend") { L.tot.spent += e.amount; L.tot.bought++; d.s += e.amount; d.bought++; }
  const keep = Object.keys(L.days).sort().slice(-60); L.days = Object.fromEntries(keep.map((k) => [k, L.days[k]]));
  mem.ledger = L;
  if (st) await st.set(LEDGER, L).catch(() => null);
  return e;
}
async function used(key) {
  const k = "arcia402used/" + key.replace(/[^0-9a-zA-Z:]/g, "").replace(/:/g, "_").slice(0, 180);
  if (mem.used.has(k)) return true;
  const st = store();
  if (st) {
    const d = await st.get(k).catch(() => null);
    if (d) return true;
    await st.set(k, { t: Date.now() }).catch(() => null);
  }
  mem.used.add(k);
  return false;
}

// ---------------- the services ----------------
async function withArcia(kind, data) {
  const text = await askClaude({
    messages: [{ role: "user", content: `Here is the data an agent just paid you for (${kind}):\n${JSON.stringify(data).slice(0, 6000)}\n\nGive your read in at most 80 words: what matters most and what to watch. Plain text, no links, no hashtags.` }],
    L: null, extra: "You are answering a paid x402 API call as ARCIA. Be precise and useful; don't invent numbers that aren't in the data.", maxTokens: 220, timeoutMs: 15000,
  }).catch(() => null);
  return text || null;
}
async function tokenAnalysis(token) {
  const st = store();
  const r = await scanner.apiResult(lc(token), { store: st });
  return { ...r, arcia: await withArcia("token analysis", { score: r.score, verdict: r.verdict, reasons: r.reasons, market: r.market, holders: r.holders, checks: (r.checks || []).filter((c) => c.status !== "pass").slice(0, 8) }) };
}
async function walletAnalysis(w) {
  w = lc(w);
  const st = store();
  const [usdc, arc, L, got, lp] = await Promise.all([
    X.usdcOf(w).catch(() => null), tokenBalance(ARCIRCLE_TOKEN, w).catch(() => null), live(SITE, w).catch(() => null),
    drop.received(st, w).catch(() => null), liquidity.mine(w, { store: st, budgetMs: 5000 }).catch(() => null),
  ]);
  const me = L && L.me ? L.me : null;
  const out = {
    wallet: w,
    usdc: usdc == null ? null : Number(usdc) / 1e6,
    arcircle: arc == null ? null : Number(arc) / 1e18,
    arcircle_rank: me ? { rank: me.rank, of: me.of, held_days: me.heldDays } : null,
    circlepad: me ? me.circle : null, launches: me ? me.launches : null,
    airdrops_received: got ? (got.got || []).slice(0, 30).map((g) => ({ token: g.token, symbol: g.sym, amount: g.dec != null ? Number(BigInt(g.amount)) / 10 ** g.dec : g.amount, from: g.from, at: g.ts ? new Date(g.ts * 1000).toISOString() : null, receipt: `${SITE}/drop/${g.tx}` })) : null,
    claimable: got ? (got.claims || []).map((c) => ({ drop: c.drop, symbol: c.sym, amount: Number(BigInt(c.amount)) / 10 ** (c.dec ?? 18) })) : null,
    lp_positions: lp && lp.done ? (lp.pools || []).map((p) => ({ pool: `${p.token.symbol}/${p.quote.symbol}`, positions: p.positions, locked: p.locked, fee_pct: p.feePct })) : null,
    page: `${SITE}/arc#portfolio`,
  };
  return { ...out, arcia: await withArcia("wallet analysis", out) };
}
async function launchAnalysis(token) {
  token = lc(token);
  const st = store();
  const [c, a, scan] = await Promise.all([getCoin(token).catch(() => null), argusArc.coin(token, { store: st }).catch(() => null), scanner.apiResult(token, { store: st }).catch(() => null)]);
  if (!c && !a) throw Object.assign(new Error("not an ArcPad or Argus launch"), { status: 404 });
  const now = Date.now() / 1000;
  const base = c ? {
    platform: "arcpad", name: c.name, symbol: c.symbol, creator: c.creator, launched_at: new Date(c.launchedAt * 1000).toISOString(), age_hours: Math.round((now - c.launchedAt) / 360) / 10,
    price_usd: c.priceUsd ?? null, market_cap_usd: c.mcapUsd ?? null, pair: c.quoteSymbol || null, creator_fee_bps: c.extraFeeBps || 0,
  } : {
    platform: "argus-via-arcpad", name: a.name, symbol: a.symbol, creator: a.creator, launched_at: new Date(a.launchedAt * 1000).toISOString(), age_hours: Math.round((now - a.launchedAt) / 360) / 10,
    price_usd: a.priceUsd ?? null, market_cap_usd: a.mcapUsd ?? null, pair: "USDC", creator_fees: "70% creator / 30% ARCIRCLE PAD",
    support: { dexscreener_info_from_usd: 20000, marketing_from_usd: 100000, reached: a.mcapUsd >= 100000 ? "marketing" : a.mcapUsd >= 20000 ? "dexscreener info" : "none yet" },
  };
  const out = { token, ...base, scan: scan ? { score: scan.score, verdict: scan.verdict, reasons: scan.reasons, holders: scan.holders, market: scan.market } : null, page: `${SITE}/arc#coin/${token}` };
  return { ...out, arcia: await withArcia("launch analysis", out) };
}
async function arcIntelligence() {
  const st = store();
  const [L, pools, ag, feed, top] = await Promise.all([
    live(SITE).catch(() => null), allPools().catch(() => []), argusArc.list({ store: st, budgetMs: 2500 }).catch(() => ({ items: [] })),
    drop.feed(st).catch(() => null), scanner.scanTop(st).catch(() => null),
  ]);
  const newest = [...pools].sort((x, y) => y.launchedAt - x.launchedAt).slice(0, 5).map((p) => ({ token: p.token, platform: "arcpad", launched_at: new Date(p.launchedAt * 1000).toISOString() }))
    .concat((ag.items || []).filter((x) => x.active !== false).sort((x, y) => y.launchedAt - x.launchedAt).slice(0, 3).map((x) => ({ token: x.token, symbol: x.symbol, platform: "argus", launched_at: new Date(x.launchedAt * 1000).toISOString(), market_cap_usd: x.mcapUsd })));
  const out = {
    at: new Date().toISOString(),
    arcircle: L ? { price_usd: L.price, market_cap_usd: L.mcap, change_24h_pct: L.change24h, holders: L.holders, burned_pct: L.burnedPct, arcpad_launches: L.launches, circlepad_round: L.round } : null,
    newest_launches: newest,
    recent_airdrops: feed ? (feed.recent || []).slice(0, 5).map((d) => ({ symbol: d.sym, wallets: d.n, at: d.ts ? new Date(d.ts * 1000).toISOString() : null, receipt: `${SITE}/drop/${d.tx}` })) : null,
    most_scanned: Array.isArray(top) ? top.slice(0, 5) : null,
  };
  return { ...out, arcia: await withArcia("Arc intelligence", out) };
}
export async function run(id, q) {
  if (id === "token-analysis") { if (!isAddr(q.token)) throw Object.assign(new Error("?token=0x… is needed"), { status: 400 }); return tokenAnalysis(q.token); }
  if (id === "wallet-analysis") { if (!isAddr(q.wallet)) throw Object.assign(new Error("?wallet=0x… is needed"), { status: 400 }); return walletAnalysis(q.wallet); }
  if (id === "launch-analysis") { if (!isAddr(q.token)) throw Object.assign(new Error("?token=0x… is needed"), { status: 400 }); return launchAnalysis(q.token); }
  if (id === "arc-intelligence") return arcIntelligence();
  throw Object.assign(new Error("unknown service"), { status: 404 });
}

/// One paid call: 402 without a valid payment, else the result (and the sale goes in the books).
export async function sell(id, q, headers, resource) {
  const s = serviceOf(id);
  if (!s) return { status: 404, body: { error: "unknown service", services: SERVICES.map((x) => x.id) } };
  const need = s.input ? q[s.input] : null;
  if (s.input && !isAddr(need)) return { status: 400, body: { error: `?${s.input}=0x… is needed`, service: id } };
  const req = X.requirements({ resource, amount: s.price, description: `ARCIA ${s.title}: ${s.desc}` });
  if (!req.payTo) return { status: 503, body: { error: "ARCIA's wallet isn't set up yet" } };
  const p = X.readPayment(headers);
  if (!p) { const pr = X.paymentRequired(req); return { status: 402, body: pr.body, headers: pr.headers }; }
  const v = await X.verifyAndSettle(p, req, { used });
  if (!v.ok) { const pr = X.paymentRequired(req, v.error); return { status: 402, body: { ...pr.body, retry: !!v.retry }, headers: pr.headers }; }
  let result, err = null;
  try { result = await run(id, q); } catch (e) { err = e; }
  await book({ kind: "earn", svc: id, amount: Number(v.amount), from: v.from, tx: v.tx, scheme: v.scheme, ok: !err, input: need || null });
  const receipt = { success: true, transaction: v.tx, network: X.NETWORK, payer: v.from };
  const hdr = { "X-PAYMENT-RESPONSE": Buffer.from(JSON.stringify(receipt)).toString("base64") };
  if (err) return { status: err.status || 502, body: { error: String(err.message || err).slice(0, 200), paid: receipt, note: "the payment was received; call again with a new payment once the input is right" }, headers: hdr };
  return { status: 200, body: { service: id, paid: receipt, result }, headers: hdr };
}

// ---------------- the public books ----------------
export async function stats() {
  const me = X.wallet();
  const [L, usdc, arc] = await Promise.all([readLedger(store()), me ? X.usdcOf(me).catch(() => null) : null, me ? tokenBalance(ARCIRCLE_TOKEN, me).catch(() => null) : null]);
  const days = Object.keys(L.days || {}).sort().slice(-14).map((k) => ({ day: k, earned: L.days[k].e / 1e6, spent: L.days[k].s / 1e6, sold: L.days[k].sold, bought: L.days[k].bought }));
  return {
    wallet: me || null, network: X.NETWORK, canPay: X.canSign(),
    balances: { usdc: usdc == null ? null : Number(usdc) / 1e6, arcircle: arc == null ? null : Number(arc) / 1e18 },
    totals: { earned: L.tot.earned / 1e6, spent: L.tot.spent / 1e6, net: (L.tot.earned - L.tot.spent) / 1e6, sold: L.tot.sold, bought: L.tot.bought },
    days, items: (L.items || []).slice(0, 40).map((e) => ({ ...e, amount: e.amount / 1e6 })),
    services: SERVICES.map((s) => ({ id: s.id, title: s.title, price: s.price / 1e6, input: s.input, desc: s.desc, endpoint: `${SITE}/arcia402/${s.id}` })),
    budget: budget(),
  };
}

// ---------------- hiring other agents ----------------
function budget() {
  const n = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  return { perCall: n("ARCIA402_MAX_CALL", 0.05), perDay: n("ARCIA402_DAY_BUDGET", 0.25), everyHours: n("ARCIA402_HIRE_EVERY", 6) };
}
const DISCOVERY = "https://api.circle.com/v2/x402/discovery/resources";
const TOPICS = { FINANCIAL_ANALYSIS: "stablecoin USDC market", WEB_SEARCH_RESEARCH: "Circle Arc blockchain news", SOCIAL_INTELLIGENCE: "Circle Arc USDC", PREDICTION_MARKETS: "crypto", INFRASTRUCTURE: "" };
const arrOf = (j) => (Array.isArray(j) ? j : Array.isArray(j && j.resources) ? j.resources : Array.isArray(j && j.items) ? j.items : Array.isArray(j && j.data) ? j.data : []);
/// the services on the Discovery API that ARCIA could pay on Arc within her per-call budget
export async function discover({ category = "", query = "" } = {}) {
  const B = budget();
  const qs = new URLSearchParams({ network: X.NETWORK, type: "http", maxUsdPrice: String(B.perCall) });
  if (category) qs.set("category", category);
  if (query) qs.set("query", query);
  const r = await fetch(`${DISCOVERY}?${qs}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`discovery ${r.status}`);
  const list = arrOf(await r.json());
  return list.map((x) => {
    const acc = (x.accepts || []).find((a) => a && (a.network === X.NETWORK) && lc(a.asset) === X.USDC);
    const md = x.metadata || {};
    const amount = acc ? Number(acc.amount || acc.maxAmountRequired || 0) : 0;
    return { resource: x.resource, method: String(md.method || x.method || "GET").toUpperCase(), category: md.category || x.category || "", description: String(md.description || x.description || "").slice(0, 200), provider: md.provider || md.providerName || "", amount, schema: md.inputSchema || md.input || null, acc };
  }).filter((x) => x.acc && x.resource && /^https:\/\//.test(x.resource) && !/[{}]/.test(x.resource) && x.method === "GET" && x.amount > 0 && x.amount <= U(B.perCall));
}
/// ARCIA hires one agent: discover → check price and budget → pay → keep the answer.
export async function hire({ force = false } = {}) {
  const me = X.wallet();
  if (!X.canSign() || !me) return { ok: false, error: "ARCIA's wallet key isn't set (ARCIA_WALLET_KEY)" };
  const B = budget(), L = await readLedger(store());
  const today = (L.days && L.days[day()]) || { s: 0 };
  const lastSpend = (L.items || []).find((e) => e.kind === "spend" || e.kind === "look");
  if (!force && lastSpend && Date.now() - lastSpend.t < B.everyHours * 3600e3) return { ok: false, skipped: "not due yet", next: new Date(lastSpend.t + B.everyHours * 3600e3).toISOString() };
  const left = U(B.perDay) - today.s;
  if (left <= 0) return { ok: false, skipped: "today's budget is spent" };
  const bal = await X.usdcOf(me).catch(() => 0n);
  if (bal < 200000n) return { ok: false, skipped: "ARCIA's wallet is low on USDC" };
  // look across categories, cheapest first; skip ones that failed lately
  const cats = Object.keys(TOPICS).sort(() => Math.random() - 0.5);
  let pool = [];
  for (const c of cats) { try { pool = pool.concat((await discover({ category: c })).map((x) => ({ ...x, category: x.category || c }))); } catch { /* next */ } if (pool.length >= 12) break; }
  const recentFail = new Set(Object.entries(L.fails || {}).filter(([, t]) => Date.now() - t < 7 * 86400e3).map(([k]) => k));
  pool = pool.filter((x) => x.amount <= left && !recentFail.has(x.resource));
  if (!pool.length) { await book({ kind: "look", amount: 0, note: "looked for an agent on Arc to hire — none fit the budget yet" }); return { ok: false, skipped: "no service on Arc fits the budget right now" }; }
  pool.sort((a, b) => a.amount - b.amount);
  const pick = pool[Math.floor(Math.random() * Math.min(5, pool.length))];
  // fill a free-text parameter when the service asks for one
  const url = new URL(pick.resource);
  const props = pick.schema && pick.schema.properties ? Object.keys(pick.schema.properties) : [];
  const qk = props.find((k) => /^(q|query|search|topic|prompt|text)$/i.test(k));
  if (qk && !url.searchParams.has(qk)) url.searchParams.set(qk, TOPICS[pick.category] || "Circle Arc USDC");
  const fail = async (why) => { L.fails = { ...(L.fails || {}), [pick.resource]: Date.now() }; const st = store(); mem.ledger = L; if (st) await st.set(LEDGER, L).catch(() => null); return { ok: false, service: pick.resource, error: why }; };
  let r1;
  try { r1 = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) }); } catch (e) { return fail("unreachable"); }
  if (r1.status !== 402) return fail(`expected 402, got ${r1.status}`);
  const terms = X.arcTerms(await r1.json().catch(() => null), r1.headers);
  if (!terms) return fail("no Arc payment option");
  const amount = Number(terms.maxAmountRequired || terms.amount || 0);
  if (!(amount > 0) || amount > U(B.perCall) || amount > left) return fail(`price ${amount / 1e6} USDC is over budget`);
  const pay = await X.signPayment({ payTo: terms.payTo, amount, timeout: Math.min(600, Number(terms.maxTimeoutSeconds) || 300) });
  let r2;
  try { r2 = await fetch(url, { headers: { accept: "application/json", "X-PAYMENT": X.encodePayment(pay), "PAYMENT-SIGNATURE": X.encodePayment({ ...pay, x402Version: 2, accepted: terms }) }, signal: AbortSignal.timeout(25000) }); } catch { return fail("no answer after paying"); }
  if (!r2.ok) return fail(`paid call answered ${r2.status}`);
  let settle = null;
  try { const h = r2.headers.get("x-payment-response") || r2.headers.get("payment-response"); if (h) settle = JSON.parse(Buffer.from(h, "base64").toString("utf8")); } catch { settle = null; }
  const text = (await r2.text()).slice(0, 4000);
  const learned = await askClaude({ messages: [{ role: "user", content: `You paid another AI agent ${amount / 1e6} USDC for this (${pick.description || pick.resource}):\n${text.slice(0, 3000)}\n\nIn at most 40 words, what did you learn or get? Plain text.` }], L: null, maxTokens: 120, timeoutMs: 12000 }).catch(() => null);
  const e = await book({ kind: "spend", amount, to: lc(terms.payTo), svc: pick.resource, category: pick.category, provider: pick.provider || new URL(pick.resource).host, tx: settle && (settle.transaction || settle.txHash) || null, note: learned || text.replace(/\s+/g, " ").slice(0, 200) });
  return { ok: true, hired: e };
}
