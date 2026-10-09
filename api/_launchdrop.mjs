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
//
// The vault (contracts/ArcLaunchDrop.sol) replaces all of the above once LAUNCHDROP_ADDRESS (or LAUNCHDROP_DEFAULT) is
// set: the treasury deposits each coin's 4% into it once; the contract snapshots veARCIRCLE at the start of the week the
// coin launched (Thursday 00:00 UTC) and pays pro rata — holders claim, or anyone pushes. This file then only reads the
// vault: the drops and a wallet's claimable amounts, the coins still waiting for their deposit (the treasury console),
// and the holders a push would pay. The weekly Multisender plan stays only for a site with no vault.
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
  // the vault: env LAUNCHDROP_ADDRESS ("none" turns it off), else LAUNCHDROP_DEFAULT
  vault: () => { const e = env("LAUNCHDROP_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : isAddr(LAUNCHDROP_DEFAULT) ? lc(LAUNCHDROP_DEFAULT) : null; },
};
export const LAUNCHDROP_DEFAULT = ""; // contracts/scripts/deploy-arc-launch-drop.js — filled in once it's deployed
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
const coinsOf = (ws) => coinsBetween(ws, ws + WEEK);
async function coinsBetween(from0, to) {
  const pools = CFG.pools ? await CFG.pools() : await allPools();
  const from = Math.max(from0, CFG.start());
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
  if (CFG.vault()) return { status: 400, body: { error: "Launch Drop is paid by the vault now — nothing to record" } };
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


// ---------------- the vault (contracts/ArcLaunchDrop.sol) ----------------
const W = (h, i) => { const s = strip(h || ""); const w = s.slice(i * 64, i * 64 + 64); return w.length === 64 ? BigInt("0x" + w) : 0n; };
const addrW = (h, i) => "0x" + strip(h || "").slice(i * 64 + 24, i * 64 + 64);
const VS = {
  dropCount: sel("dropCount()"), tokens: sel("tokens(uint256)"), drops: sel("drops(address)"),
  claimable: sel("claimable(address,address)"), paid: sel("paid(address,address)"),
  balAt: sel("balanceOfAt(address,uint256)"), supAt: sel("totalSupplyAt(uint256)"), bal: sel("balanceOf(address)"), sup: sel("totalSupply()"),
};
async function calls(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 150) out.push(...(await ethCalls(list.slice(i, i + 150))));
  return out;
}
/// every drop in the vault (oldest first), with what `me` can claim and has been paid
export async function vaultDrops(me = "") {
  const V = CFG.vault();
  const [cnt] = await ethCalls([{ to: V, data: VS.dropCount }]);
  const n = Math.min(cnt ? Number(BigInt(cnt)) : 0, 500);
  if (!n) return [];
  const toks = (await calls(Array.from({ length: n }, (_, i) => ({ to: V, data: VS.tokens + u256(i) })))).map((h) => lc(addrW(h, 0)));
  const per = await calls(toks.flatMap((t) => [
    { to: V, data: VS.drops + pad(t) },
    ...(me ? [{ to: V, data: VS.claimable + pad(t) + pad(me) }, { to: V, data: VS.paid + pad(t) + pad(me) }] : []),
  ]));
  const k = me ? 3 : 1;
  const m = await metaOf(toks).catch(() => ({}));
  return toks.map((t, i) => {
    const d = per[i * k];
    const row = { token: t, ...(m[t] || { sym: "?", name: "" }), ws: Number(W(d, 0)), supply: W(d, 1).toString(), amount: W(d, 2).toString(), claimed: W(d, 3).toString() };
    if (me) row.mine = { claimable: W(per[i * k + 1], 0).toString(), paid: W(per[i * k + 2], 0).toString() };
    return row;
  });
}
/// a wallet's veARCIRCLE share at a week's snapshot and now
async function shareOf(me, ws) {
  const S = stake.CFG.address();
  if (!S || !me) return null;
  const [b0, s0, b1, s1] = await ethCalls([
    { to: S, data: VS.balAt + pad(me) + u256(ws) }, { to: S, data: VS.supAt + u256(ws) },
    { to: S, data: VS.bal + pad(me) }, { to: S, data: VS.sup },
  ]);
  const f = (b, s) => (W(s, 0) > 0n ? Number((W(b, 0) * 1000000n) / W(s, 0)) / 1e6 : 0);
  return { ve: (W(b0, 0) / 10n ** 16n).toString(), share: f(b0, s0), perCoin: W(s0, 0) > 0n ? ((perCoin() * W(b0, 0)) / W(s0, 0)).toString() : "0", veNow: (W(b1, 0) / 10n ** 16n).toString(), shareNext: f(b1, s1) };
}
/// coins launched from START on whose 4% isn't (fully) in the vault yet. A coin whose snapshot had no veARCIRCLE can't
/// be deposited (the vault would revert) — it's marked `blocked` and the treasury keeps it.
async function waiting(drops) {
  const all = await coinsBetween(CFG.start(), T0() + 1).catch(() => []);
  const have = new Map(drops.map((d) => [d.token, BigInt(d.amount)]));
  const need = perCoin();
  const list = all.filter((c) => (have.get(c.token) || 0n) < need);
  const S = stake.CFG.address();
  const sup = S && list.length ? await calls(list.map((c) => ({ to: S, data: VS.supAt + u256(weekOf(c.launchedAt)) }))).catch(() => []) : [];
  return list.map((c, i) => {
    const got = have.get(c.token) || 0n;
    return { token: c.token, sym: c.sym, name: c.name, launchedAt: c.launchedAt, ws: weekOf(c.launchedAt), deposited: got.toString(), need: (need - got).toString(), blocked: !got && sup[i] && W(sup[i], 0) === 0n ? "no veARCIRCLE at the snapshot" : null };
  });
}
async function notifyWaiting(store, list) {
  if (!list.length) return;
  const seen = (await getDoc(store, "launchDrop/notified")) || { t: [] };
  const fresh = list.filter((c) => !c.blocked && !seen.t.includes(c.token));
  if (!fresh.length) return;
  seen.t = [...seen.t, ...fresh.map((c) => c.token)].slice(-500);
  await putDoc(store, "launchDrop/notified", seen);
  const text = `🪂 <b>Launch Drop: deposit waiting</b>\n\n${fresh.map((c) => "$" + c.sym).join(", ")} — ${(Number(perCoin() / 10n ** 18n) / 1e6).toFixed(0)}M of each into the vault, then veARCIRCLE holders claim on their own.\n\nConnect the treasury wallet: ${SITE}/arc#staking?drop=console`;
  if (CFG.notify) return CFG.notify(text);
  const { tg, loadCfg } = await import("./_tg-lib.mjs");
  const admins = ((await loadCfg().catch(() => null)) || {}).admins || [];
  for (const a of admins) await tg("sendMessage", { chat_id: a, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}
async function vaultState({ store, me }) {
  const t = T0(), ws = weekOf(t);
  const [coins, tr, drops, mine] = await Promise.all([coinsOf(ws).catch(() => []), treasury().catch(() => null), vaultDrops(me).catch(() => []), me ? shareOf(me, ws).catch(() => null) : null]);
  const wait = await waiting(drops);
  await notifyWaiting(store, wait).catch(() => null);
  const claimable = me ? drops.filter((d) => d.mine && BigInt(d.mine.claimable) > 0n).map((d) => d.token) : [];
  return {
    v: 2, mode: "vault", vault: CFG.vault(), staking: stake.CFG.address(), start: CFG.start(), per: perCoin().toString(), treasury: tr, started: t >= CFG.start(),
    week: { ws, ends: ws + WEEK, coins: coins.map((c) => ({ token: c.token, sym: c.sym, name: c.name, launchedAt: c.launchedAt })) },
    me: mine, drops: drops.slice().reverse(), waiting: wait.map(({ token, sym, launchedAt, ws: w, blocked }) => ({ token, sym, launchedAt, ws: w, blocked })), claimable,
  };
}
/// the treasury's to-do with a vault: deposit each waiting coin's 4% (approve + deposit)
async function vaultConsole() {
  const drops = await vaultDrops().catch(() => []);
  const wait = await waiting(drops);
  return { mode: "vault", vault: CFG.vault(), treasury: await treasury(), todo: wait.map((c) => ({ ...c, total: c.need })) };
}
/// the wallets a push of `token` would pay now (anyone can send it)
export async function holders({ store, token }) {
  if (!CFG.vault() || !isAddr(token)) return { error: "bad token" };
  const V = CFG.vault(), t = lc(token);
  const locks = CFG.locks ? await CFG.locks() : await stake.allLocks({ store });
  const addrs = [...new Set(locks.map((l) => lc(l.a)))];
  const r = await calls(addrs.map((a) => ({ to: V, data: VS.claimable + pad(t) + pad(a) })));
  const rows = addrs.map((a, i) => [a, W(r[i], 0)]).filter(([, x]) => x > 0n).sort((x, y) => (y[1] > x[1] ? 1 : -1));
  return { token: t, vault: V, holders: rows.map(([a, x]) => [a, x.toString()]), total: rows.reduce((s, [, x]) => s + x, 0n).toString() };
}

// ---------------- public views ----------------
/// this week so far (live coins and an estimate), the finished weeks, and for a wallet: what it got / will get
export async function state({ store, user = "" } = {}) {
  const t = T0(), ws = weekOf(t), me = isAddr(user) ? lc(user) : "";
  if (CFG.vault()) return vaultState({ store, me });
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
  if (CFG.vault()) return vaultConsole();
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
