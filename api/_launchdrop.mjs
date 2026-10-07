// api/_launchdrop.mjs — Launch Drop: stake $ARCIRCLE, get a piece of every new ArcPad coin.
//
// Every ArcPad launch sends 8% of the new coin's supply (80M of 1B) to the platform treasury (HomepadFactoryArc,
// PLATFORM_ALLOCATION_BPS). Half of it (SHARE_BPS, 40M) goes to veARCIRCLE stakers:
//   · weeks follow ARCIRCLE Staking's (Thursday 00:00 UTC). A week's drop holds every coin launched on ArcPad during it,
//     from START on (coins launched before START aren't in any drop)
//   · when the week ends, veARCIRCLE is read at that moment for every lock (ArcircleStaking.balanceOfAt — a lock made
//     after the snapshot doesn't count), and each coin's 40M is split pro rata (at least 1 veARCIRCLE to be in it)
//   · the treasury sends it straight to the stakers' wallets through the Multisender (ArcMultiSend, no fee), from the
//     console on the Staking page — the team signs, nothing here holds a key. Each send is checked against the plan
//     from its own receipt (sender = the treasury, the coin, every wallet and amount) before it counts
//   · the bot admins get a Telegram note when a week's drop is ready to send
// Read-only and keyless. Store: launchDrop/<weekStart> (the plan and what was sent) and launchDrop/index.
import { allPools, ethCalls, isAddr, pad, strip, keccakHex, SITE } from "./_arc.mjs";
import * as stake from "./_stake.mjs";
import { receipt as dropReceipt } from "./_drop.mjs";

const lc = (a) => String(a || "").toLowerCase();
const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const now = () => Math.floor(Date.now() / 1000);
const hexOf = (s) => Buffer.from(String(s), "utf8").toString("hex");
const sel = (sig) => keccakHex(hexOf(sig)).slice(0, 10);
const u256 = (n) => BigInt(n).toString(16).padStart(64, "0");
const str = (h) => { try { const s = strip(h || ""); if (s.length < 128) return ""; const n = Number(BigInt("0x" + s.slice(64, 128))); return Buffer.from(s.slice(128, 128 + n * 2), "hex").toString("utf8").replace(/[^\x20-\x7e]/g, "").slice(0, 32); } catch { return ""; } };

export const WEEK = 7 * 86400;
export const START = 1791417600; // Thu 8 Oct 2026 00:00 UTC — the first week of Launch Drop (future coins only)
const SUPPLY = 10n ** 9n * 10n ** 18n, PLATFORM_BPS = 800n;
export const CFG = {
  factory: "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E",
  multisend: "0x21733285F844cb2F03a5d692de9974F379889956",
  shareBps: () => { const n = parseInt(env("LAUNCH_DROP_BPS"), 10); return Number.isFinite(n) && n >= 0 && n <= 10000 ? n : 5000; },
  minVe: 10n ** 18n, // 1 veARCIRCLE
  chunk: 200, // wallets per Multisender transaction (the contract takes up to 500)
  start: () => { const n = parseInt(env("LAUNCH_DROP_START"), 10); return Number.isFinite(n) && n > 0 ? n : START; },
  now: null, pools: null, locks: null, veAt: null, notify: null, receipt: null, treasury: null, meta: null,
};
export function configure(o) { Object.assign(CFG, o); mem.clear(); }
const T0 = () => (CFG.now ? CFG.now() : now());
const mem = new Map();
export const weekOf = (t) => Math.floor(t / WEEK) * WEEK;
export const perCoin = () => (SUPPLY * PLATFORM_BPS / 10000n) * BigInt(CFG.shareBps()) / 10000n;

// ---------------- reads ----------------
async function treasury() {
  if (CFG.treasury) return lc(CFG.treasury);
  if (mem.has("tr")) return mem.get("tr");
  const [h] = await ethCalls([{ to: CFG.factory, data: sel("platformTreasury()") }]);
  const a = h ? lc("0x" + strip(h).slice(24, 64)) : null;
  if (isAddr(a)) mem.set("tr", a);
  return a;
}
async function metaOf(tokens) {
  if (CFG.meta) return CFG.meta(tokens);
  const r = await ethCalls(tokens.flatMap((t) => [{ to: t, data: "0x95d89b41" }, { to: t, data: "0x06fdde03" }]));
  return Object.fromEntries(tokens.map((t, i) => [lc(t), { sym: str(r[i * 2]) || "?", name: str(r[i * 2 + 1]) || "" }]));
}
/// the ArcPad coins launched in the week starting `ws` (and not before START)
async function coinsOf(ws) {
  const pools = CFG.pools ? await CFG.pools() : await allPools();
  const from = Math.max(ws, CFG.start()), to = ws + WEEK;
  const list = pools.filter((p) => p.launchedAt >= from && p.launchedAt < to).map((p) => ({ token: lc(p.token), launchedAt: p.launchedAt }));
  if (!list.length) return [];
  const m = await metaOf(list.map((c) => c.token)).catch(() => ({}));
  return list.map((c) => ({ ...c, ...(m[c.token] || { sym: "?", name: "" }) })).sort((a, b) => a.launchedAt - b.launchedAt);
}
/// veARCIRCLE of every lock at time t, from the contract's own history
async function weightsAt(t, store) {
  const locks = CFG.locks ? await CFG.locks() : await stake.allLocks({ store });
  const addrs = [...new Set(locks.map((l) => lc(l.a)))];
  let ve;
  if (CFG.veAt) ve = await CFG.veAt(addrs, t);
  else {
    const S = stake.CFG.address();
    if (!S) return [];
    ve = [];
    for (let i = 0; i < addrs.length; i += 150) {
      const r = await ethCalls(addrs.slice(i, i + 150).map((a) => ({ to: S, data: sel("balanceOfAt(address,uint256)") + pad(a) + u256(t) })));
      ve.push(...r.map((h) => (h ? BigInt(h) : 0n)));
    }
  }
  return addrs.map((a, i) => [a, BigInt(ve[i] || 0n)]).filter(([, v]) => v >= CFG.minVe).sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
}
/// each coin's share split pro rata; the rounding dust goes to the largest staker
export function split(weights, amount) {
  const W = weights.reduce((s, [, v]) => s + v, 0n);
  if (W === 0n) return [];
  const rows = weights.map(([a, v]) => [a, (amount * v) / W]);
  const dust = amount - rows.reduce((s, [, x]) => s + x, 0n);
  if (rows.length) rows[0][1] += dust;
  return rows.filter(([, x]) => x > 0n);
}

// ---------------- the plan for a finished week ----------------
const KEY = (ws) => `launchDrop/${ws}`;
async function getDoc(store, k) { if (!store) return mem.get(k) || null; try { return (await store.get(k)) || null; } catch { return mem.get(k) || null; } }
async function putDoc(store, k, d) { mem.set(k, d); if (store) { try { await store.set(k, d); } catch { /* this instance keeps it */ } } }
export async function plan(ws, store) {
  if (ws + WEEK > T0()) return null; // the week isn't over
  if (ws + WEEK <= CFG.start()) return null;
  const hit = await getDoc(store, KEY(ws));
  if (hit && hit.v === 1) return hit;
  const at = ws + WEEK;
  const [coins, weights] = await Promise.all([coinsOf(ws), weightsAt(at, store)]);
  const each = perCoin();
  const rows = split(weights, each);
  const totalVe = weights.reduce((s, [, v]) => s + v, 0n);
  const doc = {
    v: 1, ws, at, made: T0(), per: each.toString(), totalVe: totalVe.toString(), stakers: rows.length,
    rows: rows.map(([a, x]) => [a, x.toString()]),
    coins: coins.map((c) => ({ token: c.token, sym: c.sym, name: c.name, launchedAt: c.launchedAt, sent: {}, txs: [], done: !rows.length, skipped: rows.length ? null : "no stakers that week" })),
  };
  await putDoc(store, KEY(ws), doc);
  if (doc.coins.length && rows.length) await notifyReady(doc).catch(() => null);
  const ix = (await getDoc(store, "launchDrop/index")) || { weeks: [] };
  if (!ix.weeks.includes(ws)) { ix.weeks = [...ix.weeks, ws].sort((a, b) => b - a).slice(0, 104); await putDoc(store, "launchDrop/index", ix); }
  return doc;
}
async function notifyReady(doc) {
  const text = `🪂 <b>Launch Drop ready</b> — week of ${new Date(doc.ws * 1000).toISOString().slice(0, 10)}\n\n${doc.coins.length} coin${doc.coins.length === 1 ? "" : "s"} (${doc.coins.map((c) => "$" + c.sym).join(", ")}) → ${doc.stakers} veARCIRCLE staker${doc.stakers === 1 ? "" : "s"}, ${(Number(BigInt(doc.per) / 10n ** 18n) / 1e6).toFixed(0)}M of each.\n\nConnect the treasury wallet and send it: ${SITE}/arc#staking?drop=console`;
  if (CFG.notify) return CFG.notify(text);
  const { tg, loadCfg } = await import("./_tg-lib.mjs");
  const admins = ((await loadCfg().catch(() => null)) || {}).admins || [];
  for (const a of admins) await tg("sendMessage", { chat_id: a, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

// ---------------- recording a send (checked against its receipt) ----------------
export async function record({ ws, tx }, store) {
  ws = Number(ws);
  if (!Number.isFinite(ws) || ws % WEEK) return { status: 400, body: { error: "bad week" } };
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(tx || ""))) return { status: 400, body: { error: "bad transaction hash" } };
  const doc = await plan(ws, store);
  if (!doc) return { status: 404, body: { error: "no drop for that week" } };
  const r = CFG.receipt ? await CFG.receipt(tx) : await dropReceipt(tx);
  if (!r || r.kind !== "token") return { status: 400, body: { error: "that isn't a Multisender token send (yet) — try again in a few seconds" } };
  const tr = await treasury();
  if (lc(r.sender) !== tr) return { status: 400, body: { error: "that send didn't come from the platform treasury" } };
  const coin = doc.coins.find((c) => c.token === lc(r.token));
  if (!coin) return { status: 400, body: { error: "that coin isn't in this week's drop" } };
  if (coin.txs.includes(lc(tx))) return { status: 200, body: { ok: true, dup: true, coin: view(coin, doc) } };
  const want = new Map(doc.rows);
  let n = 0;
  for (const [a, x] of r.rows) {
    const k = lc(a);
    if (!want.has(k) || coin.sent[k]) continue;
    if (BigInt(x) !== BigInt(want.get(k))) continue; // only the planned amount counts
    coin.sent[k] = 1; n++;
  }
  if (!n) return { status: 400, body: { error: "nothing in that send matches this week's plan" } };
  coin.txs.push(lc(tx));
  coin.done = Object.keys(coin.sent).length >= doc.rows.length;
  await putDoc(store, KEY(ws), doc);
  return { status: 200, body: { ok: true, counted: n, coin: view(coin, doc) } };
}
const view = (c, doc) => ({ token: c.token, sym: c.sym, name: c.name, launchedAt: c.launchedAt, sent: Object.keys(c.sent).length, of: doc.rows.length, done: !!c.done, skipped: c.skipped || null, txs: c.txs.slice(-12) });

// ---------------- public views ----------------
/// this week so far (live coins and an estimate), the finished weeks, and for a wallet: what it got / will get
export async function state({ store, user = "" } = {}) {
  const t = T0(), ws = weekOf(t), me = isAddr(user) ? lc(user) : "";
  const [coins, tr] = await Promise.all([coinsOf(ws).catch(() => []), treasury().catch(() => null)]);
  // the estimate: veARCIRCLE now (the real split uses the value at the week's end)
  let est = null;
  if (me) {
    const w = await weightsAt(t, store).catch(() => []);
    const W = w.reduce((s, [, v]) => s + v, 0n), mine = (w.find(([a]) => a === me) || [, 0n])[1];
    est = { ve: (mine / 10n ** 16n).toString(), share: W > 0n ? Number((mine * 1000000n) / W) / 1e6 : 0, perCoin: W > 0n ? ((perCoin() * mine) / W).toString() : "0" };
  }
  const ix = (await getDoc(store, "launchDrop/index")) || { weeks: [] };
  // make sure the week that just ended is planned
  const prev = ws - WEEK;
  if (prev + WEEK > CFG.start() && !ix.weeks.includes(prev)) { await plan(prev, store).catch(() => null); }
  const ix2 = (await getDoc(store, "launchDrop/index")) || ix;
  const past = [];
  for (const w of ix2.weeks.slice(0, 8)) {
    const d = await getDoc(store, KEY(w));
    if (!d) continue;
    const mineRow = me ? d.rows.find(([a]) => a === me) : null;
    past.push({ ws: d.ws, at: d.at, stakers: d.stakers, per: d.per, coins: d.coins.map((c) => ({ ...view(c, d), mine: mineRow ? { amount: mineRow[1], sent: !!c.sent[me] } : null })) });
  }
  return {
    v: 1, start: CFG.start(), shareBps: CFG.shareBps(), per: perCoin().toString(), treasury: tr, multisend: lc(CFG.multisend),
    week: { ws, ends: ws + WEEK, coins: coins.map((c) => ({ token: c.token, sym: c.sym, name: c.name, launchedAt: c.launchedAt })) },
    me: est, past, started: t >= CFG.start(),
  };
}
/// the treasury's to-do: the unsent wallets of each coin, in Multisender-sized chunks
export async function consoleOf({ store, ws }) {
  const out = [];
  const ix = (await getDoc(store, "launchDrop/index")) || { weeks: [] };
  const weeks = ws ? [Number(ws)] : ix.weeks.slice(0, 6);
  for (const w of weeks) {
    const d = await plan(w, store).catch(() => null);
    if (!d) continue;
    for (const c of d.coins) {
      if (c.done) continue;
      const left = d.rows.filter(([a]) => !c.sent[a]);
      const chunks = [];
      for (let i = 0; i < left.length; i += CFG.chunk) chunks.push(left.slice(i, i + CFG.chunk));
      out.push({ ws: d.ws, token: c.token, sym: c.sym, name: c.name, total: left.reduce((s, [, x]) => s + BigInt(x), 0n).toString(), wallets: left.length, chunks });
    }
  }
  return { treasury: await treasury(), multisend: lc(CFG.multisend), todo: out };
}
export const _test = { split, perCoin, weekOf, coinsOf, weightsAt };
