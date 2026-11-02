// api/_world-swap.mjs — the Exchange: $ARCL (the game's balance) ⇄ $ARCIRCLE (the token on Arc), by request, settled by
// the TREASURY wallet (EX, 2026-11-02, the owner). The treasury signs in to the game with its own wallet, sees the queue,
// and pays each request from its wallet at the posted rate; the server only records and checks the transfer on Arc. The
// rate (how many $ARCL make one $ARCIRCLE) is set by the treasury and shown to everyone; every settled exchange is on a
// public record with its transaction. Where the $ARCIRCLE comes from: what's spent in the game's shops goes through
// FeeBurn — 50 % burned, 50 % to this treasury — and that half funds the exchange.
//
//   ARCL → $ARCIRCLE: the ARCL is held from the player's balance when they ask (it can't be spent twice) and the rate is
//                     locked into the request; the treasury sends $ARCIRCLE on Arc (its wallet signs a plain transfer) and
//                     the server checks the receipt — a Transfer of $ARCIRCLE from the treasury to that player — once.
//   $ARCIRCLE → ARCL: the player sends $ARCIRCLE to the treasury first (from the window) and the server checks the
//                     transfer (from them, to the treasury, at least the amount, once); the treasury then credits the
//                     ARCL at the locked rate (or turns it down and sends the tokens back on Arc).
//
// The day's limit (SWAP.DAY_ARC, the owner 2026-11-02): one wallet asks for at most 300,000 $ARCIRCLE in a Seoul day (ARCL → $ARCIRCLE;
// worldSwapDay/<wallet>_<day>.arc counts the quotes; a cancelled / turned-down request gives its share back) — more is refused.
//
// The relaunch (SWAP.RELAUNCH): every request still waiting from before it is closed once, by itself — held ARCL goes back
// to its owner ("refunded"); a $ARCIRCLE → ARCL one sent to the old desk is marked "returning" until the treasury sends
// the tokens back (op return, checked on Arc).
//
//   GET  ?world=swap[&wallet=0x…]   → { ok, rate, open, treasury, token, limits, totals, log, reserve, arcl?, arcircle?, mine?, treasury? }
//   GET  ?world=swap-log            → { ok, totals, log }  (the public record: the latest 100)
//   POST { action: "world-swap-ask", …signature, dir, amount, tx? }   → { request }
//   POST { action: "world-swap-cancel", …signature, id }             → (a waiting ARCL → $ARCIRCLE: the ARCL back)
//   POST { action: "world-swap-admin", …signature (the treasury), op: list | done | reject | return | rate | open, … }
//
// Firestore: worldSwap/<id> · worldSwapMine/<wallet> { ids } · worldSwapQ/<yyyy-mm> { ids } · worldSwapTx/<tx>
//            worldSwapCfg/main { rate, open, at, hist } · worldSwapLog/main { ids } · worldStats/swap { n, arcl, arc }
import { ARCIRCLE } from "./_world-shop.mjs";
export const SWAP = {
  // the treasury: the one wallet that settles (FeeBurn's 50 % lands here too)
  TREASURY: "0xa066e6c5d1ac561a4065b9d6b00fef89c0bd02f8",
  // the old exchange desk (before the relaunch, $ARCIRCLE → ARCL transfers went here): only its returns are still checked
  DESK: "0x1250fe3b1de11da51457bca3fc8840f4ab4aeac1",
  RELAUNCH: Date.parse("2026-11-02T06:00:00Z"), // requests before it that were still waiting are closed and refunded once
  MIN: { arcl: 1000, arc: 100 }, MAX: { arcl: 50_000_000, arc: 100_000_000 },
  RATE: { min: 0.0001, max: 1_000_000 }, // $ARCL per 1 $ARCIRCLE
  DAY_ARC: 300_000, // the most $ARCIRCLE one wallet can ask for in a Seoul day (ARCL → $ARCIRCLE; the owner, 2026-11-02) — over it a request is refused
  KEEP: 30, // a player's own list: the latest 30
  LOG: 300, // the public record keeps the latest 300 ids (the read gives 100)
};
const DIRS = { arcl2arc: { from: "arcl", to: "arc" }, arc2arcl: { from: "arc", to: "arcl" } };
const lc = (a) => String(a || "").toLowerCase();
const pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const WEI = 10n ** 18n;
/// how much $ARCIRCLE a request of `arcl` ARCL gets at `rate` ARCL per $ARCIRCLE (whole tokens, rounded down)
export const arcFor = (arcl, rate) => (rate > 0 ? Math.floor(arcl / rate + 1e-9) : 0);
/// how much ARCL `arc` $ARCIRCLE gets at `rate`
export const arclFor = (arc, rate) => (rate > 0 ? Math.floor(arc * rate + 1e-9) : 0);
const cleanRate = (x) => { const n = Math.round(Number(x) * 1e4) / 1e4; return Number.isFinite(n) && n >= SWAP.RATE.min && n <= SWAP.RATE.max ? n : 0; };
// the $ARCIRCLE a receipt moved from → to (wei)
const moved = (rc, from, to) => (rc.logs || []).filter((l) => lc(l.address) === ARCIRCLE && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[1]) === pad32(from) && lc(l.topics[2]) === pad32(to)).reduce((x, l) => x + BigInt(l.data), 0n);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), tokenBalance?, receipt?, randomId?, ledger? }
export function makeSwap(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps, now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const rid = () => (deps.randomId ? deps.randomId() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/[^0-9a-z]/gi, "").slice(0, 24);
  const month = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 7);
  const dayOf = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10); // (a Seoul day)
  const usedOf = async (w, t) => Math.floor(((await one(`worldSwapDay/${w}_${dayOf(t)}`)) || {}).arc || 0);
  // a request that ends without paying gives its $ARCIRCLE back to that day's allowance
  const unday = (r) => (r.dir === "arcl2arc" && r.day && r.quote ? [{ inc: `worldSwapDay/${r.w}_${r.day}`, fields: { arc: -r.quote } }] : []);
  const isTreasury = (w) => lc(w) === SWAP.TREASURY;
  const arclOf = async (w) => { const b = (await one(`worldArclBal/${w}`)) || {}; return { bal: Math.floor(b.bal || 0), held: Math.floor(b.held || 0) }; };
  const arcOf = async (w) => { try { return deps.tokenBalance ? Number(BigInt(await deps.tokenBalance(ARCIRCLE, w)) / WEI) : null; } catch { return null; } };
  const cfgOf = async () => { const c = (await one("worldSwapCfg/main")) || {}; const rate = cleanRate(c.rate); return { rate, open: !!(rate && c.open !== false), at: c.at || 0, hist: Array.isArray(c.hist) ? c.hist.slice(0, 20) : [] }; };
  const short = (w) => (w ? lc(w).slice(0, 6) + "…" + lc(w).slice(-4) : "");
  const pub = (r) => ({ id: r.id, dir: r.dir, amount: r.amount, status: r.status, at: r.at, doneAt: r.doneAt || 0, give: r.give || 0, quote: r.quote || 0, rate: r.rate || 0, gmTx: r.gmTx || "", tx: r.tx || "", retTx: r.retTx || "", note: r.note || "", reason: r.reason || "" });
  const rowOf = (r) => ({ id: r.id, dir: r.dir, who: short(r.w), amount: r.amount, give: r.give || 0, rate: r.rate || 0, at: r.doneAt || r.at, tx: r.dir === "arcl2arc" ? r.gmTx || "" : r.tx || "" });
  async function listOf(ids) { const d = ids.length ? await getDocs(ids.map((i) => `worldSwap/${i}`)) : {}; return ids.map((i) => d[`worldSwap/${i}`]).filter(Boolean); }
  // a list doc kept by read-modify-write: re-read after writing so two at once can't drop each other's entry
  async function push(path, id, keep = 0) {
    for (let k = 0; k < 4; k++) { const d = (await one(path)) || {}, ids = Array.isArray(d.ids) ? d.ids : []; if (ids.includes(id)) return;
      const next = [id, ...ids]; await setDoc(path, { ids: keep ? next.slice(0, keep) : next }); const chk = (await one(path)) || {}; if ((chk.ids || []).includes(id)) return; }
  }
  // a held amount going back: into the buckets it came out of (b-ec1)
  const back = (r) => (deps.ledger && r.parts ? deps.ledger.bucketOps(r.w, r.parts, +1) : []);
  async function publicLog(n = 100) {
    const [lg, st] = await Promise.all([one("worldSwapLog/main"), one("worldStats/swap")]);
    const list = await listOf(((lg && lg.ids) || []).slice(0, n));
    return { totals: { n: Math.floor((st && st.n) || 0), arcl: Math.floor((st && st.arcl) || 0), arc: Math.floor((st && st.arc) || 0) }, log: list.filter((r) => r.status === "done").map(rowOf) };
  }
  const monthsSince = (from, t) => { const out = []; let [y, m] = from.split("-").map(Number); const end = month(t); for (let k = 0; k < 36; k++) { const key = `${y}-${String(m).padStart(2, "0")}`; out.push(key); if (key === end) break; m++; if (m > 12) { m = 1; y++; } } return out; };

  // ---- the relaunch: every request that was still waiting from before it, closed once (by itself, the first time the
  // exchange is read after the deploy). Each request is closed under its own lock (worldSwapEnd/<id>), so a second run,
  // or a cancel at the same moment, can't pay it back twice.
  let migrated = false;
  async function relaunch() {
    if (migrated) return; const done = await one("worldSwapMig/relaunch"); if (done && done.done) { migrated = true; return; }
    const t = now(); if (!(await commit([{ create: `worldSwapMigRun/${Math.floor(t / 60000)}`, data: { at: t } }])).ok) return; // (one run a minute)
    const ks = monthsSince("2026-08", t), d = await getDocs(ks.map((k) => `worldSwapQ/${k}`));
    const ids = [...new Set(ks.flatMap((k) => (d[`worldSwapQ/${k}`] || {}).ids || []))], list = await listOf(ids);
    let refunded = 0, returning = 0;
    for (const r of list) {
      if (r.status !== "pending" || !(r.at < SWAP.RELAUNCH || !r.rate)) continue; // (an old-style request: no rate locked in)
      if (!(await commit([{ create: `worldSwapEnd/${r.id}`, data: { at: t, by: "relaunch" } }])).ok) continue;
      if (r.dir === "arcl2arc") {
        await commit([{ inc: `worldArclBal/${r.w}`, fields: { bal: r.amount, held: -r.amount } }, ...back(r)]);
        if (deps.ledger) deps.ledger.record(r.w, "unhold", "swap-relaunch", r.amount, { b: r.parts, ref: r.id }).catch(() => {});
        await setDoc(`worldSwap/${r.id}`, { ...r, status: "refunded", reason: "The exchange relaunched — your $ARCL is back in your balance", doneAt: t }); refunded++;
      } else { await setDoc(`worldSwap/${r.id}`, { ...r, status: "returning", reason: "The exchange relaunched — the treasury sends your $ARCIRCLE back on Arc", doneAt: t }); returning++; }
    }
    await setDoc("worldSwapMig/relaunch", { done: true, at: t, refunded, returning }); migrated = true;
  }

  async function view(w) {
    await relaunch().catch(() => {});
    const [cfg, lg, reserve] = await Promise.all([cfgOf(), publicLog(30), arcOf(SWAP.TREASURY)]);
    const out = { ok: true, rate: cfg.rate, open: cfg.open, rateAt: cfg.at, rateHist: cfg.hist.slice(0, 8), treasury: SWAP.TREASURY, token: ARCIRCLE, limits: { min: SWAP.MIN, max: SWAP.MAX }, reserve, ...lg };
    if (!w) return json(200, out);
    const [arcl, arc, mine] = await Promise.all([arclOf(w), arcOf(w), one(`worldSwapMine/${w}`)]);
    const reqs = await listOf(((mine && mine.ids) || []).slice(0, SWAP.KEEP));
    return json(200, { ...out, arcl, arcircle: arc, mine: reqs.map(pub), daily: { cap: SWAP.DAY_ARC, used: await usedOf(w, now()) }, isTreasury: isTreasury(w), gm: !!(deps.isGM && deps.isGM(w)) });
  }
  async function logView() { await relaunch().catch(() => {}); return json(200, { ok: true, ...(await publicLog(100)) }, "public, max-age=20"); }

  async function ask(b) {
    const s = signer(b); if (s.err) return s.err;
    await relaunch().catch(() => {});
    const w = s.wallet, dir = String(b.dir || ""), D = DIRS[dir]; if (!D) return json(400, { error: "which way?" });
    if (isTreasury(w)) return json(400, { error: "the treasury settles the exchange; it can't ask for one" });
    const cfg = await cfgOf(); if (!cfg.open) return json(409, { error: cfg.rate ? "the exchange is paused for a moment" : "the treasury hasn't set the rate yet" });
    const amount = Math.floor(Number(b.amount)); if (!Number.isFinite(amount) || amount < SWAP.MIN[D.from]) return json(400, { error: `the least is ${SWAP.MIN[D.from].toLocaleString("en-US")}` });
    if (amount > SWAP.MAX[D.from]) return json(400, { error: `the most at once is ${SWAP.MAX[D.from].toLocaleString("en-US")}` });
    const quote = dir === "arcl2arc" ? arcFor(amount, cfg.rate) : arclFor(amount, cfg.rate); if (!(quote > 0)) return json(400, { error: "too little for one token at this rate" });
    // one open request at a time
    const mine = (await one(`worldSwapMine/${w}`)) || {}, open = (await listOf((mine.ids || []).slice(0, 5))).find((r) => r.status === "pending");
    if (open) return json(409, { error: "you have a request waiting already", id: open.id });
    const id = rid(), t = now(), rec = { id, w, dir, amount, rate: cfg.rate, quote, status: "pending", at: t };
    if (dir === "arcl2arc") {
      const used = await usedOf(w, t); if (used + quote > SWAP.DAY_ARC) return json(400, { error: `the most a day is ${SWAP.DAY_ARC.toLocaleString("en-US")} $ARCIRCLE — ${Math.max(0, SWAP.DAY_ARC - used).toLocaleString("en-US")} left today`, daily: { cap: SWAP.DAY_ARC, used } });
      rec.day = dayOf(t);
      const a = await arclOf(w); if (a.bal < amount) return json(400, { error: "not enough ARCL" });
      // held in the same write as a lock (two at once can't both spend the same balance)
      if (!(await commit([{ create: `worldSwapLock/${w}_${Math.floor(t / 3000)}`, data: { at: t } }, { inc: `worldArclBal/${w}`, fields: { bal: -amount, held: amount } }, { inc: `worldSwapDay/${w}_${rec.day}`, fields: { arc: quote } }])).ok) return json(429, { error: "one moment" });
      if (deps.ledger) try { rec.parts = await deps.ledger.afterSpend(w, amount); await deps.ledger.record(w, "hold", "swap", -amount, { b: rec.parts, ref: id }); } catch { /* recorded best effort */ }
    } else {
      const tx = lc(b.tx); if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "send the $ARCIRCLE to the treasury first, then give its transaction hash", pay: { token: ARCIRCLE, to: SWAP.TREASURY, amount: (BigInt(amount) * WEI).toString() } });
      const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null;
      if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet — try again in a moment" });
      if (rc.status !== "0x1") return json(400, { error: "that transaction failed" });
      if (moved(rc, w, SWAP.TREASURY) < BigInt(amount) * WEI) return json(400, { error: "that transfer to the treasury is less than the amount" });
      if (!(await commit([{ create: `worldSwapTx/${tx}`, data: { w, id, at: t } }])).ok) return json(409, { error: "this transaction was already used" });
      rec.tx = tx;
    }
    await setDoc(`worldSwap/${id}`, rec);
    await push(`worldSwapMine/${w}`, id, SWAP.KEEP); await push(`worldSwapQ/${month(t)}`, id);
    return json(200, { ok: true, request: pub(rec) });
  }
  async function cancel(b) {
    const s = signer(b); if (s.err) return s.err;
    const r = await one(`worldSwap/${String(b.id || "").replace(/[^0-9a-z]/gi, "")}`);
    if (!r || r.w !== s.wallet) return json(404, { error: "no such request" });
    if (r.status !== "pending") return json(409, { error: "it's not waiting any more" });
    if (r.dir !== "arcl2arc") return json(400, { error: "a $ARCIRCLE transfer can't be taken back here: the treasury will return it" });
    if (!(await commit([{ create: `worldSwapEnd/${r.id}`, data: { at: now(), by: "cancel" } }])).ok) return json(409, { error: "it's being settled" });
    await commit([{ inc: `worldArclBal/${r.w}`, fields: { bal: r.amount, held: -r.amount } }, ...back(r), ...unday(r)]);
    if (deps.ledger) deps.ledger.record(r.w, "unhold", "swap-cancel", r.amount, { b: r.parts, ref: r.id }).catch(() => {});
    const next = { ...r, status: "cancelled", doneAt: now() }; await setDoc(`worldSwap/${r.id}`, next);
    return json(200, { ok: true, request: pub(next) });
  }

  // ---- the treasury's side: the queue, settle one (checked on Arc), turn one down, send an old one back, the rate
  async function admin(b) {
    const s = signer(b); if (s.err) return s.err;
    const op = String(b.op || ""), tre = isTreasury(s.wallet), gm = !!(deps.isGM && deps.isGM(s.wallet));
    if (!tre && !(gm && op === "list")) return json(403, { error: "only the treasury wallet settles the exchange" });
    await relaunch().catch(() => {});
    if (op === "list") {
      const t = now(), ks = monthsSince("2026-08", t).reverse(), d = await getDocs(ks.map((k) => `worldSwapQ/${k}`));
      const ids = [...new Set(ks.flatMap((k) => (d[`worldSwapQ/${k}`] || {}).ids || []))], all = await listOf(ids);
      const open = all.filter((r) => r.status === "pending" || r.status === "returning"), rest = all.filter((r) => !open.includes(r)).slice(0, 60);
      return json(200, { ok: true, list: [...open, ...rest].map((r) => ({ ...pub(r), w: r.w })), cfg: await cfgOf() });
    }
    if (op === "rate") {
      const rate = cleanRate(b.rate); if (!rate) return json(400, { error: `the rate is $ARCL per 1 $ARCIRCLE, between ${SWAP.RATE.min} and ${SWAP.RATE.max.toLocaleString("en-US")}` });
      const c = await cfgOf(), t = now(), open = b.open === undefined ? (c.rate ? c.open : true) : !!b.open;
      await setDoc("worldSwapCfg/main", { rate, open, at: t, by: s.wallet, hist: [{ rate, at: t }, ...c.hist].slice(0, 20) });
      return json(200, { ok: true, cfg: await cfgOf() });
    }
    if (op === "open") { const c = await cfgOf(); if (!c.rate) return json(400, { error: "set the rate first" }); await setDoc("worldSwapCfg/main", { rate: c.rate, open: !!b.open, at: c.at, by: s.wallet, hist: c.hist }); return json(200, { ok: true, cfg: await cfgOf() }); }
    const r = await one(`worldSwap/${String(b.id || "").replace(/[^0-9a-z]/gi, "")}`); if (!r) return json(404, { error: "no such request" });
    const note = String(b.note || "").slice(0, 200);
    if (op === "return") { // an old $ARCIRCLE → ARCL request: the tokens sent back on Arc (from the treasury or the old desk)
      if (r.status !== "returning" && !(r.status === "rejected" && r.dir === "arc2arcl" && !r.retTx)) return json(409, { error: "nothing to return" });
      const tx = lc(b.tx); if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "that isn't a transaction hash" });
      const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null; if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet — try again in a moment" });
      if (rc.status !== "0x1") return json(400, { error: "that transaction failed" });
      const sent = moved(rc, SWAP.TREASURY, r.w) + moved(rc, SWAP.DESK, r.w); if (sent < BigInt(r.amount) * WEI) return json(400, { error: "that transfer back is less than what they sent" });
      if (!(await commit([{ create: `worldSwapTx/${tx}`, data: { w: r.w, id: r.id, at: now(), ret: 1 } }])).ok) return json(409, { error: "this transaction was already used" });
      const next = { ...r, status: r.status === "returning" ? "returned" : r.status, retTx: tx, doneAt: now(), by: s.wallet }; await setDoc(`worldSwap/${r.id}`, next);
      return json(200, { ok: true, request: { ...pub(next), w: r.w } });
    }
    if (r.status !== "pending") return json(409, { error: "already " + r.status });
    if (op === "done") {
      if (r.dir === "arcl2arc") {
        // the treasury's own transfer, read back from Arc: $ARCIRCLE from the treasury to this player, the tx used once
        const tx = lc(b.gmTx); if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "send the $ARCIRCLE from the treasury wallet first" });
        const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null; if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet — try again in a moment" });
        if (rc.status !== "0x1") return json(400, { error: "that transaction failed" });
        const wei = moved(rc, SWAP.TREASURY, r.w), give = Number(wei / WEI); if (!(give > 0)) return json(400, { error: "that transaction doesn't send $ARCIRCLE from the treasury to this player" });
        if (!(await commit([{ create: `worldSwapEnd/${r.id}`, data: { at: now(), by: s.wallet } }, { create: `worldSwapTx/${tx}`, data: { w: r.w, id: r.id, at: now(), pay: 1 } }])).ok) return json(409, { error: "already settled, or this transaction was already used" });
        await commit([{ inc: `worldArclBal/${r.w}`, fields: { held: -r.amount, spent: r.amount } }]);
        if (deps.ledger) deps.ledger.record(r.w, "settle", "swap-sold", -r.amount, { ref: r.id + " " + tx }).catch(() => {});
        const next = { ...r, status: "done", give, gmTx: tx, note, doneAt: now(), by: s.wallet }; await setDoc(`worldSwap/${r.id}`, next);
        await commit([{ inc: "worldStats/swap", fields: { n: 1, arcl: r.amount, arc: give } }]).catch(() => {}); await push("worldSwapLog/main", r.id, SWAP.LOG);
        return json(200, { ok: true, request: { ...pub(next), w: r.w } });
      }
      // $ARCIRCLE → ARCL: credited at the rate locked into the request
      if (!(await commit([{ create: `worldSwapEnd/${r.id}`, data: { at: now(), by: s.wallet } }])).ok) return json(409, { error: "it's being settled" });
      const give = r.quote || arclFor(r.amount, r.rate || (await cfgOf()).rate);
      await commit([{ inc: `worldArclBal/${r.w}`, fields: { bal: give, earned: give } }, ...(deps.ledger ? deps.ledger.intoOps(r.w, "purchased", give) : [])]); // (bought with $ARCIRCLE: PURCHASED ARCL)
      if (deps.ledger) deps.ledger.record(r.w, "earn", "swap-buy", give, { b: { purchased: give }, ref: r.id }).catch(() => {});
      const next = { ...r, status: "done", give, note, doneAt: now(), by: s.wallet }; await setDoc(`worldSwap/${r.id}`, next);
      await commit([{ inc: "worldStats/swap", fields: { n: 1, arclOut: give, arcIn: r.amount } }]).catch(() => {}); await push("worldSwapLog/main", r.id, SWAP.LOG);
      return json(200, { ok: true, request: { ...pub(next), w: r.w } });
    }
    if (op === "reject") {
      if (!(await commit([{ create: `worldSwapEnd/${r.id}`, data: { at: now(), by: s.wallet } }])).ok) return json(409, { error: "it's being settled" });
      if (r.dir === "arcl2arc") { await commit([{ inc: `worldArclBal/${r.w}`, fields: { bal: r.amount, held: -r.amount } }, ...back(r), ...unday(r)]); if (deps.ledger) deps.ledger.record(r.w, "unhold", "swap-reject", r.amount, { b: r.parts, ref: r.id }).catch(() => {}); }
      const next = { ...r, status: r.dir === "arcl2arc" ? "rejected" : "returning", reason: note || (r.dir === "arcl2arc" ? "turned down — your $ARCL is back" : "turned down — the treasury sends your $ARCIRCLE back"), doneAt: now(), by: s.wallet }; await setDoc(`worldSwap/${r.id}`, next);
      return json(200, { ok: true, request: { ...pub(next), w: r.w } });
    }
    return json(400, { error: "list, done, reject, return, rate or open" });
  }
  return {
    view, logView, relaunch,
    async handle(b) {
      if (b.action === "world-swap-ask") return ask(b);
      if (b.action === "world-swap-cancel") return cancel(b);
      if (b.action === "world-swap-admin") return admin(b);
      return null;
    },
  };
}
