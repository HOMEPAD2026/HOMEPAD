// api/_arcia402.mjs — ARCIA 402: ARCIA as an economic agent on Arc.
//   SELL  paid endpoints (x402, USDC on Arc) that other agents and people call — see SERVICES.
//         Every input is checked BEFORE the payment is asked for (a bad token address never
//         costs anything), and if ARCIA still can't finish after being paid, that payment becomes
//         a credit: the same X-PAYMENT header works once more. A free preview (?preview=1) shows
//         what the full answer starts with.
//   BUY   ARCIA finds x402 services that take USDC on Arc (Circle's Discovery API), checks the
//         price against her budget, pays from her own wallet and writes down what she learned
//   BOOKS every sale, hire, tip and "looked, none fit" goes into a public ledger: revenue,
//         expenses, tips, net, customers, milestones — and each sale gets a receipt (/a402/<tx>)
//   SAFETY ARCIA402_PAUSE=sell|hire|all (or ?pause= with CRON_SECRET) stops either side at once;
//         ARCIA402_BLOCK=host,host keeps her away from services; a Telegram note goes out when
//         her daily hiring budget is used up
// Payments and signing: api/_x402.mjs. Numbers: the same readers the rest of the site uses.
import * as X from "./_x402.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import { isAddr, getCoin, allPools, tokenBalance, ethCalls, fmtUsd } from "./_arc.mjs";
import { ARCIRCLE_TOKEN } from "./_arcircle.mjs";
import * as scanner from "./_scan.mjs";
import * as drop from "./_drop.mjs";
import * as liquidity from "./_liquidity.mjs";
import * as argusArc from "./_argus-arcpad.mjs";
import * as snap from "./_snapshot.mjs";
import { roundState } from "./_round.mjs";
import { ballotReport } from "./_burnvote.mjs";
import { live, askClaude } from "./_arcia-brain.mjs";

const SITE = "https://www.arcircle.app";
const lc = (a) => String(a || "").toLowerCase();
const U = (usd) => Math.round(usd * 1e6); // USDC, 6 decimals
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const SERVICES = [
  { id: "token-analysis", price: U(0.02), title: "Token Intelligence", input: "token", ai: true, gets: ["Safety score 0–100 and verdict", "Owner powers, holders, liquidity, market", "ARCIA's read"],
    desc: "Full safety scan of any Arc token — contract, owner powers, holders, liquidity, market — scored 0–100, with ARCIA's read." },
  { id: "wallet-analysis", price: U(0.03), title: "Wallet Intelligence", input: "wallet", ai: true, gets: ["USDC and $ARCIRCLE, rank among holders", "Airdrops received, LP positions", "ARCIA's read"],
    desc: "What a wallet holds and did on ARCIRCLE PAD: USDC and $ARCIRCLE, airdrops received, LP positions, rank among holders." },
  { id: "launch-analysis", price: U(0.05), title: "Launch Intelligence", input: "token", ai: true, gets: ["Price, market cap, age, creator", "Support milestones and the safety scan", "ARCIA's take"],
    desc: "An ArcPad or Argus launch in depth: price, market cap, age, creator, support milestones and the safety scan, with ARCIA's take." },
  { id: "arc-intelligence", price: U(0.01), title: "Arc Intelligence", input: null, ai: true, gets: ["$ARCIRCLE numbers", "Newest launches, recent airdrops", "Most-scanned tokens and ARCIA's read"],
    desc: "The state of ARCIRCLE on Arc right now: $ARCIRCLE numbers, the newest launches, recent airdrops and the most-scanned tokens." },
  { id: "airdrop-check", price: U(0.01), title: "Airdrop Check", input: "wallet", ai: false, gets: ["Every airdrop the wallet received", "Anything still waiting to be claimed", "A receipt link for each"],
    desc: "Every airdrop a wallet received on Arc through the ARCIRCLE PAD Multisender, and anything still waiting to be claimed." },
  { id: "holder-snapshot", price: U(0.05), title: "Holder Snapshot", input: "token", ai: false, gets: ["Top 500 holders at the latest block", "Balance and share of supply each", "A fingerprint anyone can re-check"],
    desc: "The holders of any Arc token at the latest block, ranked (top 500), locked tokens counted, contracts left out — with a fingerprint anyone can re-check." },
  { id: "round-report", price: U(0.01), title: "CirclePad Round Report", input: null, ai: false, gets: ["Raised, cap and time left", "Burn-to-vote: every category", "Burned $ARCIRCLE and voters"],
    desc: "CirclePad Round #1's report: USDC raised, the close, and the burn-to-vote result in every category." },
  { id: "new-launches", price: U(0.01), title: "Launch Watch", input: null, ai: false, gets: ["Coins launched since ?since= (unix s)", "ArcPad and Argus via ArcPad", "Poll it to watch for launches"],
    desc: "Coins launched on ArcPad and on Argus through ArcPad since the time you pass (?since=unix seconds; default the last 24 h). Poll it to watch for launches." },
];
export const serviceOf = (id) => SERVICES.find((s) => s.id === id) || null;

// ---------------- store: ledger, used payments, credits, sales, control ----------------
const store = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d), getMany: (ks) => getDocs(ks) } : null);
const LEDGER = "arcia402/ledger", CTL = "arcia402/ctl";
const mem = { ledger: null, used: new Set(), credits: new Map(), sales: new Map(), cache: new Map(), ctl: null, ctlAt: 0 };
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const keyOf = (prefix, key) => prefix + "/" + String(key).replace(/[^0-9a-zA-Z:]/g, "").replace(/:/g, "_").slice(0, 180);
async function readLedger(st) {
  let L = null;
  if (st) { try { const d = await st.get(LEDGER); if (d && d.tot) L = d; } catch { /* memory */ } }
  L = L || mem.ledger || { items: [], tot: { earned: 0, spent: 0, sold: 0, bought: 0 }, days: {}, fails: {} };
  L.tot.tips = L.tot.tips || 0; L.tot.tipn = L.tot.tipn || 0; L.tot.calls = L.tot.calls || 0;
  L.cust = L.cust || {}; L.badges = L.badges || {};
  return L;
}
// milestones, checked after every entry; a new one goes to Telegram
const BADGES = [
  { id: "first-sale", title: "First sale", test: (L) => L.tot.sold >= 1 },
  { id: "first-hire", title: "First hire", test: (L) => L.tot.bought >= 1 },
  { id: "first-tip", title: "First tip", test: (L) => L.tot.tipn >= 1 },
  { id: "first-dollar", title: "First $1 earned", test: (L) => L.tot.earned + L.tot.tips >= 1e6 },
  { id: "calls-100", title: "100 paid calls", test: (L) => L.tot.sold >= 100 },
  { id: "in-profit", title: "Earned more than she spent", test: (L) => L.tot.bought >= 1 && L.tot.earned + L.tot.tips > L.tot.spent },
  { id: "ten-dollars", title: "$10 earned", test: (L) => L.tot.earned + L.tot.tips >= 10e6 },
];
async function book(entry) {
  const st = store();
  const L = await readLedger(st);
  const e = { t: Date.now(), ...entry };
  L.items = [e, ...(L.items || [])].slice(0, 300);
  const d = (L.days[day()] = L.days[day()] || { e: 0, s: 0, sold: 0, bought: 0 });
  d.tip = d.tip || 0;
  if (e.kind === "earn") { L.tot.earned += e.amount; L.tot.sold++; d.e += e.amount; d.sold++; }
  if (e.kind === "earn" || e.kind === "redo") L.tot.calls++;
  if (e.kind === "spend") { L.tot.spent += e.amount; L.tot.bought++; d.s += e.amount; d.bought++; }
  if (e.kind === "tip") { L.tot.tips += e.amount; L.tot.tipn++; d.tip += e.amount; }
  if ((e.kind === "earn" || e.kind === "tip") && isAddr(e.from)) {
    const c = (L.cust[lc(e.from)] = L.cust[lc(e.from)] || { n: 0, usd: 0, tips: 0, t: 0 });
    if (e.kind === "earn") c.n++; else c.tips++;
    c.usd += e.amount; c.t = e.t;
    const top = Object.entries(L.cust).sort((x, y) => y[1].usd - x[1].usd).slice(0, 50);
    L.cust = Object.fromEntries(top);
  }
  const fresh = BADGES.filter((b) => !L.badges[b.id] && b.test(L));
  for (const b of fresh) L.badges[b.id] = e.t;
  const keep = Object.keys(L.days).sort().slice(-60); L.days = Object.fromEntries(keep.map((k) => [k, L.days[k]]));
  mem.ledger = L;
  if (st) await st.set(LEDGER, L).catch(() => null);
  for (const b of fresh) await telegram(`🏅 <b>ARCIA 402 milestone:</b> ${h(b.title)}\n\nARCIA's public books: ${SITE}/arc#arcia402`);
  return e;
}
async function used(key) {
  const k = keyOf("arcia402used", key);
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
async function getDoc(k) { const st = store(); if (!st) return null; return st.get(k).catch(() => null); }
async function putDoc(k, d) { const st = store(); if (st) await st.set(k, d).catch(() => null); }
async function control() {
  if (mem.ctl && Date.now() - mem.ctlAt < 20e3) return mem.ctl;
  const d = (await getDoc(CTL)) || {};
  mem.ctl = { pause: String(d.pause || ""), block: Array.isArray(d.block) ? d.block : [] }; mem.ctlAt = Date.now();
  return mem.ctl;
}
/// is this side of ARCIA 402 paused? kind: "sell" | "hire"
export async function paused(kind) {
  const env = String(process.env.ARCIA402_PAUSE || "").trim().toLowerCase();
  const c = await control();
  const hit = (v) => v === "all" || v === "1" || v === "on" || v === kind;
  return hit(env) || hit(c.pause);
}
/// flip the switch without a redeploy (the API checks CRON_SECRET first)
export async function setPause(v) {
  v = String(v || "").toLowerCase();
  if (!["", "off", "sell", "hire", "all"].includes(v)) throw Object.assign(new Error("pause must be sell, hire, all or off"), { status: 400 });
  const c = { ...(await control()), pause: v === "off" ? "" : v };
  await putDoc(CTL, c); mem.ctl = c; mem.ctlAt = Date.now();
  await telegram(`⏸ <b>ARCIA 402</b> — ${c.pause ? `paused: <b>${h(c.pause)}</b>` : "running again"}`);
  return { ok: true, pause: c.pause || "off" };
}

// ---------------- Telegram (the same bot and channel as the launch alerts) ----------------
const h = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function telegram(text, buttons) {
  const bot = process.env.TG_BOT_TOKEN, chat = process.env.ARCIA402_TG_CHAT || process.env.TG_CHAT_ID;
  if (!bot || !chat || /^(0|off|false)$/i.test(String(process.env.ARCIA402_TG || ""))) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(6000),
      body: JSON.stringify({ chat_id: chat, parse_mode: "HTML", text, link_preview_options: { is_disabled: true }, ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}) }),
    });
    return r.ok;
  } catch { return false; }
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
  const r = await scanner.apiResult(lc(token), { store: store() });
  return { ...r, arcia: await withArcia("token analysis", { score: r.score, verdict: r.verdict, confidence: r.confidence, critical: r.critical, summary: r.summary, sections: r.sections, reasons: r.reasons, market: r.market, holders: r.holders, checks: (r.checks || []).filter((c) => c.status !== "pass").slice(0, 10) }) };
}
async function airdrops(w) {
  const got = await drop.received(store(), lc(w));
  return {
    received: (got.got || []).slice(0, 50).map((g) => ({ token: g.token, symbol: g.sym, amount: g.dec != null ? Number(BigInt(g.amount)) / 10 ** g.dec : g.amount, from: g.from, at: g.ts ? new Date(g.ts * 1000).toISOString() : null, receipt: `${SITE}/drop/${g.tx}` })),
    claimable: (got.claims || []).map((c) => ({ drop: c.drop, symbol: c.sym, amount: Number(BigInt(c.amount)) / 10 ** (c.dec ?? 18) })),
  };
}
async function walletAnalysis(w) {
  w = lc(w);
  const st = store();
  const [usdc, arc, L, got, lp] = await Promise.all([
    X.usdcOf(w).catch(() => null), tokenBalance(ARCIRCLE_TOKEN, w).catch(() => null), live(SITE, w).catch(() => null),
    airdrops(w).catch(() => null), liquidity.mine(w, { store: st, budgetMs: 5000 }).catch(() => null),
  ]);
  const me = L && L.me ? L.me : null;
  const out = {
    wallet: w,
    usdc: usdc == null ? null : Number(usdc) / 1e6,
    arcircle: arc == null ? null : Number(arc) / 1e18,
    arcircle_rank: me ? { rank: me.rank, of: me.of, held_days: me.heldDays } : null,
    circlepad: me ? me.circle : null, launches: me ? me.launches : null,
    airdrops_received: got ? got.received.slice(0, 30) : null,
    claimable: got ? got.claimable : null,
    lp_positions: lp && lp.done ? (lp.pools || []).map((p) => ({ pool: `${p.token.symbol}/${p.quote.symbol}`, positions: p.positions, locked: p.locked, fee_pct: p.feePct })) : null,
    page: `${SITE}/arc#portfolio`,
  };
  return { ...out, arcia: await withArcia("wallet analysis", out) };
}
async function launchInfo(token) {
  token = lc(token);
  const st = store();
  const [c, a] = await Promise.all([getCoin(token).catch(() => null), argusArc.coin(token, { store: st }).catch(() => null)]);
  return { c, a };
}
async function launchAnalysis(token) {
  token = lc(token);
  const [{ c, a }, scan] = await Promise.all([launchInfo(token), scanner.apiResult(token, { store: store() }).catch(() => null)]);
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
  const out = { token, ...base, scan: scan ? { score: scan.score, verdict: scan.verdict, confidence: scan.confidence, critical: scan.critical, summary: scan.summary, reasons: scan.reasons, holders: scan.holders, market: scan.market } : null, page: `${SITE}/arc#coin/${token}` };
  return { ...out, arcia: await withArcia("launch analysis", out) };
}
async function launches(since) {
  const st = store();
  const [pools, ag] = await Promise.all([allPools().catch(() => []), argusArc.list({ store: st, budgetMs: 2500 }).catch(() => ({ items: [] }))]);
  const list = pools.filter((p) => p.launchedAt > since).map((p) => ({ token: p.token, platform: "arcpad", launched_at: new Date(p.launchedAt * 1000).toISOString(), t: p.launchedAt, page: `${SITE}/arc#coin/${p.token}` }))
    .concat((ag.items || []).filter((x) => x.active !== false && x.launchedAt > since).map((x) => ({ token: x.token, symbol: x.symbol, name: x.name, platform: "argus", launched_at: new Date(x.launchedAt * 1000).toISOString(), t: x.launchedAt, market_cap_usd: x.mcapUsd ?? null, page: `${SITE}/arc#coin/${x.token}` })));
  return list.sort((x, y) => y.t - x.t);
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
async function holderSnapshot(token) {
  const q = { token: lc(token), min: "", top: "500", contracts: "0", locks: "1" };
  const until = Date.now() + 42e3;
  for (;;) {
    const r = await snap.api(q, { store: store() });
    if (!r.pending) return { ...r, holders: (r.holders || []).slice(0, 500), tool: `${SITE}/arc#snapshot` };
    if (Date.now() > until) throw Object.assign(new Error("the snapshot is still being read — try again in a minute"), { status: 503 });
    await new Promise((res) => setTimeout(res, 2500));
  }
}
async function roundReport() {
  const [st, b] = await Promise.all([roundState(), ballotReport().catch(() => null)]);
  const now = Math.floor(Date.now() / 1000);
  return {
    round: 1, open: st.isOpen, raised_usdc: Number(st.totalRaised / 10n ** 16n) / 100, cap_usdc: st.cap > 0n ? Number(st.cap / 10n ** 16n) / 100 : null,
    closes_at: st.deadline ? new Date(st.deadline * 1000).toISOString() : null, seconds_left: st.deadline ? Math.max(0, st.deadline - now) : null,
    burn_to_vote: b ? { burned_arcircle: Number(BigInt(b.burned) / 10n ** 18n), votes: b.votes, voters: b.voters, categories: b.categories.map((c) => ({ category: c.label, leading: [...c.options].sort((x, y) => y.votes - x.votes)[0] || null, options: c.options })) } : null,
    report: `${SITE}/circle/round/1`,
  };
}
export async function run(id, q) {
  if (id === "token-analysis") return tokenAnalysis(q.token);
  if (id === "wallet-analysis") return walletAnalysis(q.wallet);
  if (id === "launch-analysis") return launchAnalysis(q.token);
  if (id === "arc-intelligence") return arcIntelligence();
  if (id === "airdrop-check") return { wallet: lc(q.wallet), ...(await airdrops(q.wallet)), page: `${SITE}/arc#portfolio` };
  if (id === "holder-snapshot") return holderSnapshot(q.token);
  if (id === "round-report") return roundReport();
  if (id === "new-launches") { const since = sinceOf(q); return { since: new Date(since * 1000).toISOString(), launches: await launches(since) }; }
  throw Object.assign(new Error("unknown service"), { status: 404 });
}
const sinceOf = (q) => { const n = Number(q.since); const now = Math.floor(Date.now() / 1000); return Number.isFinite(n) && n > 1.6e9 && n < now ? Math.floor(n) : now - 86400; };

/// checked before ARCIA asks to be paid: null when the input is fine, else { status, error }
async function erc20(token) {
  const [d, t] = await ethCalls([{ to: lc(token), data: "0x313ce567" }, { to: lc(token), data: "0x18160ddd" }]).catch(() => [null, null]);
  return d != null && d !== "0x" && t != null && t !== "0x";
}
export async function precheck(id, q) {
  const s = serviceOf(id);
  if (!s) return { status: 404, error: "unknown service" };
  if (s.input && !isAddr(q[s.input])) return { status: 400, error: `?${s.input}=0x… is needed` };
  if (id === "token-analysis" || id === "holder-snapshot") { if (!(await erc20(q.token))) return { status: 404, error: "that address isn't a token on Arc — nothing was charged" }; }
  if (id === "launch-analysis") { const { c, a } = await launchInfo(q.token); if (!c && !a) return { status: 404, error: "that token isn't an ArcPad or Argus-via-ArcPad launch — nothing was charged" }; }
  return null;
}

// the same paid answer for the same input within 5 minutes (saves ARCIA's model calls and chain reads)
const TTL = 5 * 60e3;
async function cached(id, q) {
  const s = serviceOf(id);
  if (id === "new-launches") return run(id, q); // depends on ?since
  const k = `${id}_${lc(s.input ? q[s.input] : "")}`;
  const m = mem.cache.get(k);
  if (m && Date.now() - m.t < TTL) return m.r;
  const dk = keyOf("arcia402cache", k);
  const d = s.ai ? await getDoc(dk) : null;
  if (d && d.r && Date.now() - d.t < TTL) { mem.cache.set(k, d); return d.r; }
  const r = await run(id, q);
  const row = { t: Date.now(), r };
  mem.cache.set(k, row);
  if (mem.cache.size > 200) mem.cache.delete(mem.cache.keys().next().value);
  if (s.ai && JSON.stringify(r).length < 60000) await putDoc(dk, row);
  return r;
}

/// free: what the full answer starts with — no model call, nothing booked
export async function preview(id, q) {
  const bad = await precheck(id, q);
  if (bad) return { status: bad.status, body: { error: bad.error } };
  const s = serviceOf(id);
  let p = {};
  if (id === "token-analysis") { const r = await scanner.apiResult(lc(q.token), { store: store() }); p = { score: r.score, verdict: r.verdict, reasons: (r.reasons || []).slice(0, 2) }; }
  else if (id === "launch-analysis") { const { c, a } = await launchInfo(q.token); const x = c || a; p = { platform: c ? "arcpad" : "argus-via-arcpad", name: x.name, symbol: x.symbol, market_cap_usd: x.mcapUsd ?? null }; }
  else if (id === "wallet-analysis") { const arc = await tokenBalance(ARCIRCLE_TOKEN, lc(q.wallet)).catch(() => null); p = { arcircle: arc == null ? null : Number(arc) / 1e18 }; }
  else if (id === "airdrop-check") { const a = await airdrops(q.wallet).catch(() => null); p = { airdrops_received: a ? a.received.length : null }; }
  else if (id === "arc-intelligence") { const L = await live(SITE).catch(() => null); p = { arcircle_price_usd: L ? L.price : null }; }
  else if (id === "holder-snapshot") { const [t] = await ethCalls([{ to: lc(q.token), data: "0x18160ddd" }]).catch(() => [null]); p = { token: lc(q.token), has_supply: !!t }; }
  else if (id === "round-report") { const st = await roundState(); p = { open: st.isOpen, raised_usdc: Number(st.totalRaised / 10n ** 16n) / 100 }; }
  else if (id === "new-launches") { p = { launches: (await launches(sinceOf(q))).length }; }
  return { status: 200, body: { service: id, preview: true, ...p, full: { price_usd: s.price / 1e6, gets: s.gets, endpoint: `${SITE}/arcia402/${id}` } } };
}

/// One paid call: 402 without a valid payment, else the result (and the sale goes in the books).
export async function sell(id, q, headers, resource) {
  const s = serviceOf(id);
  if (!s) return { status: 404, body: { error: "unknown service", services: SERVICES.map((x) => x.id) } };
  if (await paused("sell")) return { status: 503, body: { error: "ARCIA 402 is paused for a moment — nothing was charged" } };
  const bad = await precheck(id, q);
  if (bad) return { status: bad.status, body: { error: bad.error, service: id } };
  const req = X.requirements({ resource, amount: s.price, description: `ARCIA ${s.title}: ${s.desc}` });
  const p = X.readPayment(headers);
  if (!p) { const pr = X.paymentRequired(req); return { status: 402, body: pr.body, headers: pr.headers }; }
  const input = s.input ? lc(q[s.input]) : null;

  // a payment ARCIA took but couldn't answer for is good for one more call
  const pk = X.paymentKey(p);
  const ck = pk ? keyOf("arcia402credit", pk) : "";
  const credit = ck ? (mem.credits.get(ck) || (await getDoc(ck))) : null;
  if (credit && credit.left > 0 && credit.amount >= s.price) {
    if (pk.startsWith("auth:") && (await X.authSigner(p)) !== credit.from) return { status: 402, body: { error: "that credit belongs to another payer" } };
    const c2 = { ...credit, left: credit.left - 1 };
    mem.credits.set(ck, c2); await putDoc(ck, c2);
    let result, err = null;
    try { result = await cached(id, q); } catch (e) { err = e; }
    const receipt = { success: true, transaction: credit.tx, network: X.NETWORK, payer: credit.from, credit: true };
    if (err) { const c3 = { ...c2, left: c2.left + (c2.tries < 3 ? 1 : 0), tries: (c2.tries || 1) + 1 }; mem.credits.set(ck, c3); await putDoc(ck, c3); return { status: err.status || 502, body: { error: String(err.message || err).slice(0, 200), paid: receipt, credit: c3.left > 0 ? "still good for one more call — send the same X-PAYMENT again" : "used up" } }; }
    await book({ kind: "redo", svc: id, amount: 0, from: credit.from, tx: credit.tx, input });
    return { status: 200, body: { service: id, paid: receipt, result }, headers: { "X-PAYMENT-RESPONSE": Buffer.from(JSON.stringify(receipt)).toString("base64") } };
  }

  const v = await X.verifyAndSettle(p, req, { used });
  if (!v.ok) { const pr = X.paymentRequired(req, v.error); return { status: 402, body: { ...pr.body, retry: !!v.retry }, headers: pr.headers }; }
  let result, err = null;
  try { result = await cached(id, q); } catch (e) { err = e; }
  const amount = Number(v.amount);
  await book({ kind: "earn", svc: id, amount, from: v.from, tx: v.tx, scheme: v.scheme, ok: !err, input });
  const receipt = { success: true, transaction: v.tx, network: X.NETWORK, payer: v.from, receipt: `${SITE}/a402/${v.tx}` };
  const hdr = { "X-PAYMENT-RESPONSE": Buffer.from(JSON.stringify(receipt)).toString("base64") };
  if (err) {
    const c = { svc: id, amount, from: v.from, tx: v.tx, left: 1, tries: 1, t: Date.now() };
    if (ck) { mem.credits.set(ck, c); await putDoc(ck, c); }
    return { status: err.status || 502, body: { error: String(err.message || err).slice(0, 200), paid: receipt, credit: "your payment stays good for one more call — send the same X-PAYMENT header again" }, headers: hdr };
  }
  const sale = { tx: v.tx, svc: id, title: s.title, amount, from: v.from, input, t: Date.now(), scheme: v.scheme, headline: headline(id, result), arcia: result && result.arcia ? String(result.arcia).slice(0, 400) : null };
  mem.sales.set(v.tx, sale); await putDoc(keyOf("arcia402sale", v.tx), sale);
  await telegram(`💚 <b>ARCIA just earned ${(amount / 1e6).toFixed(2)} USDC</b>\n\n${h(s.title)}${sale.headline ? ` · ${h(sale.headline)}` : ""}\nPaid by <code>${h(short(v.from))}</code> with x402 on Arc`,
    [{ text: "Receipt", url: `${SITE}/a402/${v.tx}` }, { text: "ARCIA's books", url: `${SITE}/arc#arcia402` }]);
  return { status: 200, body: { service: id, paid: receipt, result }, headers: hdr };
}
function headline(id, r) {
  if (!r) return "";
  if (r.score != null) return `score ${r.score}/100${r.verdict ? ` · ${r.verdict}` : ""}`;
  if (id === "launch-analysis" && r.symbol) return `$${r.symbol}${r.market_cap_usd != null ? ` · ${fmtUsd(r.market_cap_usd)}` : ""}`;
  if (id === "holder-snapshot") return `${r.count} holders`;
  if (id === "airdrop-check") return `${(r.received || []).length} airdrops`;
  if (id === "new-launches") return `${(r.launches || []).length} launches`;
  if (id === "round-report") return `${r.raised_usdc} USDC raised`;
  return "";
}
/// one sale's receipt (for /a402/<tx> and its card)
export async function receipt(tx) {
  tx = lc(tx);
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return null;
  const s = mem.sales.get(tx) || (await getDoc(keyOf("arcia402sale", tx)));
  if (s) return s;
  const L = await readLedger(store());
  const e = (L.items || []).find((x) => x.tx === tx && x.kind === "earn");
  if (!e) return null;
  const sv = serviceOf(e.svc);
  return { tx, svc: e.svc, title: sv ? sv.title : e.svc, amount: e.amount, from: e.from, input: e.input || null, t: e.t, scheme: e.scheme, headline: "", arcia: null };
}

/// a tip: USDC sent straight to ARCIA's wallet, counted once
export async function tip(txHash) {
  const me = X.wallet();
  const got = await X.readTransfer(txHash, me);
  if (!got.ok) return { status: got.retry ? 409 : 400, body: { error: got.error, retry: !!got.retry } };
  if (got.paid < 10000n) return { status: 400, body: { error: "the smallest tip is 0.01 USDC" } };
  if (await used(`tip:${got.tx}`) || await used(`tx:${got.tx}`)) return { status: 409, body: { error: "that transaction is already on ARCIA's books" } };
  const e = await book({ kind: "tip", amount: Number(got.paid), from: got.from, tx: got.tx });
  await telegram(`💙 <b>${h(short(got.from))} tipped ARCIA ${(Number(got.paid) / 1e6).toFixed(2)} USDC</b>`, [{ text: "ARCIA's books", url: `${SITE}/arc#arcia402` }]);
  return { status: 200, body: { ok: true, tip: { ...e, amount: e.amount / 1e6 } } };
}

// ---------------- the public books ----------------
export async function stats() {
  const me = X.wallet();
  const [L, usdc, arc, sellOff, hireOff] = await Promise.all([readLedger(store()), me ? X.usdcOf(me).catch(() => null) : null, me ? tokenBalance(ARCIRCLE_TOKEN, me).catch(() => null) : null, paused("sell"), paused("hire")]);
  const days = Object.keys(L.days || {}).sort().slice(-14).map((k) => ({ day: k, earned: L.days[k].e / 1e6, spent: L.days[k].s / 1e6, tips: (L.days[k].tip || 0) / 1e6, sold: L.days[k].sold, bought: L.days[k].bought }));
  const wc = X.walletCheck();
  return {
    wallet: me || null, network: X.NETWORK, canPay: X.canSign(), keyMatches: wc.matches, paused: { sell: sellOff, hire: hireOff },
    balances: { usdc: usdc == null ? null : Number(usdc) / 1e6, arcircle: arc == null ? null : Number(arc) / 1e18 },
    totals: { earned: L.tot.earned / 1e6, spent: L.tot.spent / 1e6, tips: L.tot.tips / 1e6, net: (L.tot.earned + L.tot.tips - L.tot.spent) / 1e6, sold: L.tot.sold, bought: L.tot.bought, tipn: L.tot.tipn, calls: L.tot.calls },
    days, items: (L.items || []).slice(0, 40).map((e) => ({ ...e, amount: e.amount / 1e6 })),
    customers: Object.entries(L.cust || {}).sort((x, y) => y[1].usd - x[1].usd).slice(0, 5).map(([a, c]) => ({ address: a, calls: c.n, tips: c.tips, usd: c.usd / 1e6 })),
    badges: BADGES.map((b) => ({ id: b.id, title: b.title, at: L.badges[b.id] || null })),
    services: SERVICES.map((s) => ({ id: s.id, title: s.title, price: s.price / 1e6, input: s.input, desc: s.desc, gets: s.gets, endpoint: `${SITE}/arcia402/${s.id}` })),
    budget: budget(),
  };
}

/// for crawlers and agent directories: every paid resource with its x402 terms
export function manifest() {
  return {
    x402Version: 1, provider: { name: "ARCIA 402", by: "ARCIRCLE PAD", url: `${SITE}/arc#arcia402`, docs: `${SITE}/llms.txt`, mcp: `${SITE}/arcia402/mcp` },
    items: SERVICES.map((s) => ({
      type: "http", resource: `${SITE}/arcia402/${s.id}`, x402Version: 1,
      accepts: [X.requirements({ resource: `${SITE}/arcia402/${s.id}`, amount: s.price, description: `ARCIA ${s.title}: ${s.desc}` })],
      metadata: { title: s.title, description: s.desc, method: "GET", category: "FINANCIAL_ANALYSIS", provider: "ARCIRCLE PAD", preview: `${SITE}/arcia402/${s.id}?preview=1`,
        inputSchema: s.input ? { type: "object", properties: { [s.input]: { type: "string", description: `${s.input === "wallet" ? "Wallet" : "Token"} address on Arc (0x…)` } }, required: [s.input] } : (s.id === "new-launches" ? { type: "object", properties: { since: { type: "integer", description: "unix seconds; default 24 h ago" } } } : { type: "object", properties: {} }) },
    })),
  };
}

// ---------------- hiring other agents ----------------
function budget() {
  const n = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  return { perCall: n("ARCIA402_MAX_CALL", 0.05), perDay: n("ARCIA402_DAY_BUDGET", 0.25), everyHours: n("ARCIA402_HIRE_EVERY", 6) };
}
async function blocked() {
  const env = String(process.env.ARCIA402_BLOCK || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return new Set([...env, ...(await control()).block.map(lc)]);
}
const DISCOVERY = "https://api.circle.com/v2/x402/discovery/resources";
const TOPICS = { FINANCIAL_ANALYSIS: "stablecoin USDC market", WEB_SEARCH_RESEARCH: "Circle Arc blockchain news", SOCIAL_INTELLIGENCE: "Circle Arc USDC", PREDICTION_MARKETS: "crypto", INFRASTRUCTURE: "" };
const arrOf = (j) => (Array.isArray(j) ? j : Array.isArray(j && j.resources) ? j.resources : Array.isArray(j && j.items) ? j.items : Array.isArray(j && j.data) ? j.data : []);
/// the services on the Discovery API that ARCIA could pay on Arc within her per-call budget
export async function discover({ category = "", query = "" } = {}) {
  const B = budget(), block = await blocked(), me = X.wallet();
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
  }).filter((x) => {
    if (!x.acc || !x.resource || !/^https:\/\//.test(x.resource) || /[{}]/.test(x.resource) || x.method !== "GET" || !(x.amount > 0) || x.amount > U(B.perCall)) return false;
    let host = ""; try { host = new URL(x.resource).host.toLowerCase(); } catch { return false; }
    return !block.has(host) && !host.endsWith("arcircle.app") && lc(x.acc.payTo) !== me;
  });
}
/// ARCIA hires one agent: discover → check price and budget → pay → keep the answer.
export async function hire({ force = false } = {}) {
  const me = X.wallet();
  if (await paused("hire")) return { ok: false, skipped: "hiring is paused" };
  if (!X.canSign() || !me) return { ok: false, error: "ARCIA's wallet key isn't set (ARCIA_WALLET_KEY)" };
  const B = budget(), L = await readLedger(store());
  const today = (L.days && L.days[day()]) || { s: 0 };
  const lastSpend = (L.items || []).find((e) => e.kind === "spend" || e.kind === "look");
  if (!force && lastSpend && Date.now() - lastSpend.t < B.everyHours * 3600e3) return { ok: false, skipped: "not due yet", next: new Date(lastSpend.t + B.everyHours * 3600e3).toISOString() };
  const left = U(B.perDay) - today.s;
  if (left <= 0) return { ok: false, skipped: "today's budget is spent" };
  const bal = await X.usdcOf(me).catch(() => 0n);
  if (bal < 200000n) { await book({ kind: "look", amount: 0, note: "wanted to hire an agent, but my wallet is low on USDC" }); return { ok: false, skipped: "ARCIA's wallet is low on USDC" }; }
  // look across categories, cheapest first; skip ones that failed lately
  const cats = Object.keys(TOPICS).sort(() => Math.random() - 0.5);
  let pool = [], looked = 0;
  for (const c of cats) { try { const got = await discover({ category: c }); looked++; pool = pool.concat(got.map((x) => ({ ...x, category: x.category || c }))); } catch { /* next */ } if (pool.length >= 12) break; }
  const recentFail = new Set(Object.entries(L.fails || {}).filter(([, t]) => Date.now() - t < 7 * 86400e3).map(([k]) => k));
  pool = pool.filter((x) => x.amount <= left && !recentFail.has(x.resource));
  if (!pool.length) { await book({ kind: "look", amount: 0, note: looked ? "looked for an agent on Arc to hire — none fit the budget yet" : "couldn't reach the agent directory today" }); return { ok: false, skipped: "no service on Arc fits the budget right now" }; }
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
  // the terms must match what the directory listed (a service can't raise its price between the two)
  if (!(amount > 0) || amount > U(B.perCall) || amount > left || amount > pick.amount * 1.5) return fail(`price ${amount / 1e6} USDC is over budget`);
  if (lc(terms.payTo) === me) return fail("that service pays ARCIA herself");
  const pay = await X.signPayment({ payTo: terms.payTo, amount, timeout: Math.min(600, Number(terms.maxTimeoutSeconds) || 300) });
  let r2;
  try { r2 = await fetch(url, { headers: { accept: "application/json", "X-PAYMENT": X.encodePayment(pay), "PAYMENT-SIGNATURE": X.encodePayment({ ...pay, x402Version: 2, accepted: terms }) }, signal: AbortSignal.timeout(25000) }); } catch { return fail("no answer after paying"); }
  let settle = null;
  try { const hh = r2.headers.get("x-payment-response") || r2.headers.get("payment-response"); if (hh) settle = JSON.parse(Buffer.from(hh, "base64").toString("utf8")); } catch { settle = null; }
  const stx = settle && (settle.transaction || settle.txHash) || null;
  const provider = pick.provider || new URL(pick.resource).host;
  if (!r2.ok) {
    // they may have taken the payment anyway — if they say so, it goes in the books
    if (stx) await book({ kind: "spend", amount, to: lc(terms.payTo), svc: pick.resource, category: pick.category, provider, tx: stx, note: `paid, but the service answered ${r2.status}` });
    const out = await fail(`paid call answered ${r2.status}`);
    await budgetNote(amount, left);
    return out;
  }
  const text = (await r2.text()).slice(0, 4000);
  const learned = await askClaude({ messages: [{ role: "user", content: `You (ARCIA) just paid another AI agent ${amount / 1e6} USDC on Arc for this (${pick.description || pick.resource}):\n${text.slice(0, 3000)}\n\nWrite one diary line, first person, at most 35 words: what you bought and what you learned from it. Plain text.` }], L: null, maxTokens: 110, timeoutMs: 12000 }).catch(() => null);
  const e = await book({ kind: "spend", amount, to: lc(terms.payTo), svc: pick.resource, category: pick.category, provider, tx: stx, note: learned || text.replace(/\s+/g, " ").slice(0, 200) });
  await telegram(`🛒 <b>ARCIA hired an agent</b> for ${(amount / 1e6).toFixed(2)} USDC\n\n${h(provider)}${learned ? `\n<i>${h(learned)}</i>` : ""}`, [{ text: "ARCIA's books", url: `${SITE}/arc#arcia402` }]);
  await budgetNote(amount, left);
  return { ok: true, hired: e };
}
async function budgetNote(amount, left) {
  if (amount >= left) await telegram(`⏹ <b>ARCIA 402</b> — today's hiring budget (${budget().perDay} USDC) is used up. She'll shop again tomorrow.`);
}
