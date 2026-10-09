// api/_paper.mjs — ARCIRCLE Paper Trading: a weekly trading event with play money on live prices (arc-paper.js).
//
// Every week (Monday 00:00 UTC to the next Monday) every wallet that joins starts with $10,000 of play money and
// trades BTC, ETH and SOL long or short with up to 1000x leverage (SOL 500x) — no slippage, no funding. Nothing touches a chain and nothing can be
// won or lost — it's practice and a weekly board. The same rules as a real perp, kept simple:
//   · a position: margin × leverage = size, opened at the live mid price (no slippage, no funding); 0.05% of the size
//     on open and on close, at most 2% of the margin each time (so 1000x isn't eaten by fees)
//   · PnL = size × (price ÷ entry − 1), negative for a short. It can't lose more than its margin: it's liquidated when
//     the loss reaches the margin less the maintenance margin — 0.5% of the size, at most half the margin
//   · optional take-profit and stop-loss prices; they, and liquidations, are checked whenever the event is read (every
//     few seconds while anyone has the page open) and close at their own price
// Prices: Hyperliquid's mid prices (public, keyless), Coinbase's spot price if Hyperliquid doesn't answer.
// Sign-in: the wallet signs a plain message once a week (no gas, no transaction); the server answers with a session
// token, and only that token's holder can trade that wallet's account that week.
// Store: paper/<week>/u/<wallet> (the account), paper/<week>/ix (every account in short, for the board),
// paper/seasons (each finished week's top 10).
import { keccak_256 } from "@noble/hashes/sha3.js";

export const START = 10_000;
export const FEE_BPS = 5;   // 0.05% of the size, on open and on close
export const MM_BPS = 50;   // maintenance margin: 0.5% of the size…
export const MM_CAP = 0.5;  // …at most half the margin (high leverage)
export const FEE_CAP_BPS = 200; // a fee is at most 2% of the margin
const feeOf = (sz, mg) => Math.min((sz * FEE_BPS) / 10000, (mg * FEE_CAP_BPS) / 10000);
const mmOf = (sz, mg) => Math.min((sz * MM_BPS) / 10000, mg * MM_CAP);
export const MIN_MARGIN = 10;
export const MAX_OPEN = 10;
export const MARKETS = {
  BTC: { name: "Bitcoin", max: 1000, cb: "BTC-USD" },
  ETH: { name: "Ethereum", max: 1000, cb: "ETH-USD" },
  SOL: { name: "Solana", max: 500, cb: "SOL-USD" },
};
const te = new TextEncoder();
const hx = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const r2 = (n) => Math.round(n * 100) / 100;
export const CFG = {
  now: () => Math.floor(Date.now() / 1000),
  prices: null, // tests pin prices: async () => ({ BTC, ETH, SOL })
  fetch: (...a) => fetch(...a),
};
export function configure(o) { Object.assign(CFG, o); mem.clear(); }
const mem = new Map();
export function memStore() { const m = new Map(); return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), set: async (k, v) => { m.set(k, JSON.stringify(v)); } }; }
let fallbackStore = null;
const S = (store) => store || (fallbackStore = fallbackStore || memStore());

/// the week's Monday (UTC), e.g. 2026-10-05, and when it ends
export function weekOf(t) { const d = new Date(t * 1000); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); d.setUTCHours(0, 0, 0, 0); return { wk: d.toISOString().slice(0, 10), start: Math.floor(d.getTime() / 1000), end: Math.floor(d.getTime() / 1000) + 7 * 86400 }; }

// ---------------------------------------------------------------- prices
export async function prices() {
  if (CFG.prices) return { ...(await CFG.prices()), src: "test", at: CFG.now() };
  const hit = mem.get("px");
  if (hit && Date.now() - hit.t < 2000) return hit.v;
  let v = null;
  if (!v) {
    try {
      const r = await CFG.fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "allMids" }), signal: AbortSignal.timeout(4000) });
      const j = r.ok ? await r.json() : null;
      if (j) { v = {}; for (const k of Object.keys(MARKETS)) { const p = Number(j[k]); if (p > 0) v[k] = p; } v.src = "Hyperliquid"; }
    } catch { v = null; }
  }
  if (!v || Object.keys(MARKETS).some((k) => !(v[k] > 0))) {
    const out = { ...(v || {}) };
    await Promise.all(Object.entries(MARKETS).filter(([k]) => !(out[k] > 0)).map(async ([k, m]) => {
      try { const r = await CFG.fetch(`https://api.coinbase.com/v2/prices/${m.cb}/spot`, { signal: AbortSignal.timeout(4000) }); const j = r.ok ? await r.json() : null; const p = Number(j && j.data && j.data.amount); if (p > 0) out[k] = p; } catch { /* missing */ }
    }));
    out.src = out.src || "Coinbase";
    v = out;
  }
  v.at = CFG.now();
  if (Object.keys(MARKETS).every((k) => v[k] > 0)) mem.set("px", { t: Date.now(), v });
  return v;
}

// ---------------------------------------------------------------- the maths
const pnlOf = (p, px) => (px > 0 ? p.sz * p.s * (px / p.en - 1) : 0);
export const liqPrice = (p) => p.en * (1 - p.s * (p.mg - mmOf(p.sz, p.mg)) / p.sz);
const value = (p, px) => Math.max(0, p.mg + pnlOf(p, px)); // what a position is worth now (never below 0)
export function equity(acc, px) { return acc.cash + (acc.pos || []).reduce((s, p) => s + value(p, px[p.m]), 0); }
/// close `p` at `price` for `why`: its margin plus PnL, less the closing fee, back to cash
function closeAt(acc, p, price, why, t) {
  const pnl = why === "liquidated" ? -p.mg : pnlOf(p, price);
  const fee = why === "liquidated" ? 0 : feeOf(p.sz * (price / p.en), p.mg);
  const back = Math.max(0, p.mg + pnl - fee);
  acc.cash = r2(acc.cash + back);
  acc.pos = acc.pos.filter((x) => x.id !== p.id);
  acc.hist = [{ id: p.id, m: p.m, s: p.s, mg: p.mg, lv: p.lv, sz: p.sz, en: p.en, ex: price, pnl: r2(back - p.mg), why, at: p.at, cl: t }, ...(acc.hist || [])].slice(0, 50);
  acc.closed = (acc.closed || 0) + 1;
  if (why === "liquidated") acc.liqs = (acc.liqs || 0) + 1;
  if (back - p.mg > (acc.best || 0)) acc.best = r2(back - p.mg);
  return back;
}
/// liquidations, take-profits and stop-losses at the current prices; returns whether anything closed
export function sweep(acc, px, t) {
  let any = false;
  for (const p of [...(acc.pos || [])]) {
    const x = px[p.m];
    if (!(x > 0)) continue;
    const lq = liqPrice(p);
    if (p.s > 0 ? x <= lq : x >= lq) { closeAt(acc, p, lq, "liquidated", t); any = true; continue; }
    if (p.sl && (p.s > 0 ? x <= p.sl : x >= p.sl)) { closeAt(acc, p, p.sl, "stop-loss", t); any = true; continue; }
    if (p.tp && (p.s > 0 ? x >= p.tp : x <= p.tp)) { closeAt(acc, p, p.tp, "take-profit", t); any = true; }
  }
  return any;
}
function fresh(a, t) { return { v: 1, a, cash: START, pos: [], hist: [], n: 0, closed: 0, liqs: 0, best: 0, joined: t, seq: 0 }; }
const view = (acc, px) => {
  const eq = equity(acc, px);
  return {
    a: acc.a, cash: acc.cash, equity: r2(eq), pnl: r2(eq - START), pnlPct: Math.round(((eq - START) / START) * 10000) / 100, trades: acc.n, closed: acc.closed, liqs: acc.liqs, best: acc.best,
    pos: (acc.pos || []).map((p) => ({ ...p, px: px[p.m] || null, pnl: r2(pnlOf(p, px[p.m])), roe: Math.round((pnlOf(p, px[p.m]) / p.mg) * 10000) / 100, liq: liqPrice(p) })),
    hist: (acc.hist || []).slice(0, 20),
  };
};

// ---------------------------------------------------------------- the store
const KU = (wk, a) => `paper/${wk}/u/${a}`;
const KI = (wk) => `paper/${wk}/ix`;
async function load(store, wk, a) { return (await S(store).get(KU(wk, a)).catch(() => null)) || null; }
async function save(store, wk, acc) {
  await S(store).set(KU(wk, acc.a), acc);
  const ix = (await S(store).get(KI(wk)).catch(() => null)) || { users: {} };
  ix.users[acc.a] = { cash: acc.cash, pos: (acc.pos || []).map(({ m, s, mg, sz, en, tp, sl }) => ({ m, s, mg, sz, en, tp, sl })), n: acc.n, joined: acc.joined, liqs: acc.liqs };
  await S(store).set(KI(wk), ix);
}
const tokHash = (tok) => hx(keccak_256(te.encode(String(tok))));

// ---------------------------------------------------------------- sign-in
export const joinMessage = (a, wk, t) => `ARCIRCLE Paper Trading\nWallet: ${lc(a)}\nWeek: ${wk}\nIssued: ${t}\n\nPlay money only — signing costs nothing and sends no transaction.`;
export async function join({ addr, msg, sig }, { store, recover }) {
  if (!isAddr(addr)) return { status: 400, body: { error: "bad wallet" } };
  const a = lc(addr), t = CFG.now(), { wk } = weekOf(t);
  const m = /^ARCIRCLE Paper Trading\nWallet: (0x[0-9a-f]{40})\nWeek: (\d{4}-\d\d-\d\d)\nIssued: (\d+)\n/.exec(String(msg || ""));
  if (!m || m[1] !== a || m[2] !== wk || Math.abs(t - Number(m[3])) > 600 || msg !== joinMessage(a, wk, Number(m[3]))) return { status: 400, body: { error: "The message is out of date — sign again." } };
  let who;
  try { who = lc(recover(msg, sig)); } catch (e) { return { status: 400, body: { error: String((e && e.message) || e) } }; }
  if (who !== a) return { status: 403, body: { error: "That signature isn't from this wallet." } };
  const tok = hx(globalThis.crypto.getRandomValues(new Uint8Array(24)));
  let acc = await load(store, wk, a);
  const isNew = !acc;
  if (!acc) acc = fresh(a, t);
  acc.tok = [tokHash(tok), ...(acc.tok || []).filter((x) => typeof x === "string")].slice(0, 4); // up to 4 devices
  await save(store, wk, acc);
  return { status: 200, body: { ok: true, tok, wk, isNew } };
}

// ---------------------------------------------------------------- trading
const err = (status, error) => ({ status, body: { error } });
export async function act(b, { store }) {
  if (!isAddr(b.addr)) return err(400, "bad wallet");
  const a = lc(b.addr), t = CFG.now(), { wk } = weekOf(t);
  const acc = await load(store, wk, a);
  if (!acc) return err(401, "Join this week's event first.");
  if (!b.tok || !(acc.tok || []).includes(tokHash(b.tok))) return err(401, "Sign in again for this week.");
  const px = await prices();
  sweep(acc, px, t);
  const op = String(b.op || "");
  if (op === "open") {
    const m = String(b.m || "").toUpperCase(), M = MARKETS[m];
    if (!M) return err(400, "Unknown market.");
    if (!(px[m] > 0)) return err(503, "No live price for that market right now — try again in a moment.");
    const s = b.side === "short" ? -1 : b.side === "long" ? 1 : 0;
    if (!s) return err(400, "Pick long or short.");
    const mg = r2(Number(b.margin)), lv = Math.round(Number(b.lev));
    if (!(mg >= MIN_MARGIN)) return err(400, `The smallest margin is $${MIN_MARGIN}.`);
    if (!(lv >= 1 && lv <= M.max)) return err(400, `Leverage on ${m} is 1–${M.max}x.`);
    if ((acc.pos || []).length >= MAX_OPEN) return err(400, `At most ${MAX_OPEN} open positions.`);
    const sz = r2(mg * lv), fee = feeOf(sz, mg);
    if (acc.cash < mg + fee - 1e-9) return err(400, "Not enough play money for that margin plus the fee.");
    const en = px[m];
    const tp = Number(b.tp) > 0 ? Number(b.tp) : null, sl = Number(b.sl) > 0 ? Number(b.sl) : null;
    if (tp && (s > 0 ? tp <= en : tp >= en)) return err(400, `Take-profit has to be ${s > 0 ? "above" : "below"} the price.`);
    if (sl && (s > 0 ? sl >= en : sl <= en)) return err(400, `Stop-loss has to be ${s > 0 ? "below" : "above"} the price.`);
    const p = { id: ++acc.seq, m, s, mg, lv, sz, en, at: t, tp, sl };
    if (sl && (s > 0 ? sl <= liqPrice(p) : sl >= liqPrice(p))) p.sl = null; // liquidation comes first anyway
    acc.cash = r2(acc.cash - mg - fee);
    acc.pos = [...(acc.pos || []), p];
    acc.n = (acc.n || 0) + 1;
  } else if (op === "close") {
    const p = (acc.pos || []).find((x) => x.id === Number(b.id));
    if (!p) return err(404, "That position is already closed.");
    if (!(px[p.m] > 0)) return err(503, "No live price for that market right now — try again in a moment.");
    closeAt(acc, p, px[p.m], "closed", t);
  } else if (op === "closeall") {
    for (const p of [...(acc.pos || [])]) if (px[p.m] > 0) closeAt(acc, p, px[p.m], "closed", t);
  } else if (op === "tpsl") {
    const p = (acc.pos || []).find((x) => x.id === Number(b.id));
    if (!p) return err(404, "That position is already closed.");
    const tp = Number(b.tp) > 0 ? Number(b.tp) : null, sl = Number(b.sl) > 0 ? Number(b.sl) : null, x = px[p.m];
    if (tp && (p.s > 0 ? tp <= x : tp >= x)) return err(400, `Take-profit has to be ${p.s > 0 ? "above" : "below"} the price.`);
    if (sl && (p.s > 0 ? sl >= x : sl <= x)) return err(400, `Stop-loss has to be ${p.s > 0 ? "below" : "above"} the price.`);
    p.tp = tp; p.sl = sl;
  } else if (op !== "sync") return err(400, "unknown op");
  await save(store, wk, acc);
  return { status: 200, body: { ok: true, me: view(acc, px), px } };
}

// ---------------------------------------------------------------- the board
function board(ix, px) {
  return Object.entries((ix && ix.users) || {}).map(([a, u]) => {
    const acc = { cash: u.cash, pos: u.pos || [] };
    const eq = equity(acc, px);
    return { a, equity: r2(eq), pnlPct: Math.round(((eq - START) / START) * 10000) / 100, n: u.n || 0, open: (u.pos || []).length, joined: u.joined || 0 };
  }).sort((x, y) => y.equity - x.equity || x.joined - y.joined);
}
/// a finished week's top 10, kept once (valued at the first read after the week ended)
async function freeze(store, px) {
  const t = CFG.now(), prev = weekOf(weekOf(t).start - 1).wk;
  const ss = (await S(store).get("paper/seasons").catch(() => null)) || { weeks: [] };
  if (ss.weeks.some((w) => w.wk === prev)) return ss;
  const ix = await S(store).get(KI(prev)).catch(() => null);
  if (!ix || !Object.keys(ix.users || {}).length) return ss;
  const rows = board(ix, px);
  ss.weeks = [{ wk: prev, traders: rows.length, top: rows.slice(0, 10) }, ...ss.weeks].slice(0, 26);
  await S(store).set("paper/seasons", ss);
  return ss;
}
/// everything the page shows: prices, the board (top 50 + where `user` stands), the account, past weeks
export async function state({ store, user = "" } = {}) {
  const t = CFG.now(), wk = weekOf(t), a = isAddr(user) ? lc(user) : "";
  const px = await prices();
  let [ix, ss] = await Promise.all([S(store).get(KI(wk.wk)).catch(() => null), freeze(store, px).catch(() => null)]);
  // anyone whose liquidation, take-profit or stop-loss is hit at these prices gets it applied now (up to 25 a read)
  const hit = (q) => { const x = px[q.m]; if (!(x > 0)) return false; const lq = liqPrice(q); return (q.s > 0 ? x <= lq : x >= lq) || (q.sl && (q.s > 0 ? x <= q.sl : x >= q.sl)) || (q.tp && (q.s > 0 ? x >= q.tp : x <= q.tp)); };
  const due = Object.entries((ix && ix.users) || {}).filter(([, u]) => (u.pos || []).some(hit)).slice(0, 25).map(([x]) => x);
  for (const x of due) { const acc = await load(store, wk.wk, x); if (acc && sweep(acc, px, t)) await save(store, wk.wk, acc); }
  if (due.length) ix = await S(store).get(KI(wk.wk)).catch(() => ix);
  const rows = board(ix, px);
  let me = null;
  if (a) {
    const acc = await load(store, wk.wk, a);
    if (acc) { if (sweep(acc, px, t)) await save(store, wk.wk, acc); me = { ...view(acc, px), rank: rows.findIndex((r) => r.a === a) + 1 }; }
  }
  return {
    wk: wk.wk, start: wk.start, ends: wk.end, now: t, px, markets: Object.fromEntries(Object.entries(MARKETS).map(([k, m]) => [k, { name: m.name, max: m.max }])),
    rules: { start: START, feeBps: FEE_BPS, feeCapBps: FEE_CAP_BPS, mmBps: MM_BPS, mmCap: MM_CAP, minMargin: MIN_MARGIN, maxOpen: MAX_OPEN },
    traders: rows.length, top: rows.slice(0, 50), me, seasons: ((ss && ss.weeks) || []).slice(0, 8),
  };
}
export const _test = { pnlOf, closeAt, board, tokHash };
