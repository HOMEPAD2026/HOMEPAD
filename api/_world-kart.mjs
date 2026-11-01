// api/_world-kart.mjs — ARCIRCLE KART (world-kart.js), stage K2 (2026-10-30): races checked and paid here, the racer's
// meta (level, wins, titles), the week's board and its ghosts, the daily challenge. Modelled on _world-survivors.mjs.
//
//   POST { action: "world-kart-start", …signature, track, mode: "race" | "ta" | "daily", racer } → { raceId, startedAt, mode, daily? }
//        one active race a wallet: a new start replaces the last (its end is then refused)
//   POST { action: "world-kart-end", …signature, raceId, place 1–5, time (s), laps [s], ghost?, racer }
//        → { credited, earned, why, racesLeft, today, cap, rank, dailyRank, best, newBest, newAch, meta, ev? (the event's progress) }
//        checked on the server's clock: the race can't be longer than it has been going (+5 s), every lap at least the
//        track's minLap, as many laps as the track has, the laps adding up to the time; counted once (worldKartEnd).
//        Mode "race" pays PAY[place − 1] for the first DAY_RACES races of a Seoul day; mode "daily" pays DAILY_PAY once a
//        Seoul day; both inside DAY_ARCL a day (and the shop's daily cap); mode "ta" (time attack) pays nothing.
//        ARCL kind "kart".
//   KG (2026-11-01) guests: world-kart-start / -end with { guest: <16–32 hex> } in place of the signature — the same checks, nothing
//        paid; the end → { guest, earned (this race, if claimed today), pending (the day's waiting ARCL), waiting, ev, claimable }
//        and waits in worldKartGuest/<gid> (the last GUEST.KEEP; ghosts in worldKartGuestG/<raceId>). A guest id starts at most
//        GUEST.START_HR races an hour (worldKartGRate/<gid>_<hour>).
//   POST { action: "world-kart-claim", …signature, gid } → { credited, races: [{ place, mode, credited, why }], expired, ev?, … }
//        binds the guest id to the wallet (worldKartGuestBy/<gid>, once; another wallet is refused; ≤ GUEST.GIDS a wallet) and
//        runs each of TODAY's waiting ends (Seoul day) through the signed end's settle(): the same caps (the wallet's own races
//        today count), the daily once, meta, boards, the event with the race's real start / end. Older days aren't paid. A
//        claimed race that overlaps another counted race of the wallet (worldKartSpan/<wallet>_<day>) isn't counted ("overlap").
//   GET  ?world=kart&wallet=…              → { today, cap, racesLeft, meta }
//   GET  ?world=kart-top&track=nexus       → { week, track, top: [{ w, name, t, racer }] }  (race or time attack, best time)
//   GET  ?world=kart-daily                 → { day, rule, seed, track, top }
//   GET  ?world=kart-ghost&track=nexus&who=top|me&wallet=0x… → { t, g, racer, name }   (404 when there's none)
//
// Firestore: worldKartRace/<wallet> · worldKartEnd/<raceId> (once) · worldKartSlot/<wallet>_<day>_<1–5> (a paid race)
//            worldKartDailyPay/<wallet>_<day> (once) · worldKartDay/<wallet>_<day> { n: ARCL today } · worldKartMeta/<wallet>
//            worldKartGhost/<track>_<wallet> { t, g, racer } · worldStats/kartWeek_<track>_<isoWeek> · worldStats/kartDaily_<day>
// All of it is progress, so each fresh start (epoch) begins empty: none of these is in _world-phase.mjs's KEEP.
//
// minLap: the fastest a lap could possibly be — the track's length at BOOST_TOP (47 m/s, the kart's speed in a boost, in
// world-kart.js) the whole way, with 15 % to spare for the boosts' overshoot: floor(len / 47 × 0.85). The Nexus Circuit is
// 1,079 m long (world-kart.js TRACK_PTS as a closed centripetal Catmull-Rom spline) → floor(19.5) = 19 s.
// K5 (2026-10-30): three more tracks, the same rule — Lunar Loop 1,170 m → 21 s, Frost Drift 1,092 m → 19 s, Magma Run
// 1,056 m → 19 s (world-kart.js TRACKS[id].pts). Their feel (low gravity, ice, lava) never makes a kart faster than BOOST_TOP.
// tests/world/kart.test.mjs measures every client track and checks these numbers. The pay rules and day caps are the same
// on every track (PAY, DAILY_PAY, DAY_RACES, DAY_ARCL — one place). The daily's track comes from the day like its rule.
// KS (2026-11-01, the owner): the SHOP — cars bought with $ARCIRCLE (world-kart-shop-data.js KSHOP: the cars, prices, numbers).
//   GET  ?world=kart-shop[&wallet=0x…]          → { cars, depts, prices, burnPct, owned: [ids], pay: { token, to } }
//   POST { action: "world-kart-car-buy", …sig, id, tx } → { ok, owned } — the player's wallet sent the car's price in $ARCIRCLE to
//        FeeBurn (BURN_PCT burned, the rest to the treasury); the server reads the receipt's Transfer (from this wallet to FeeBurn,
//        at least the price) and takes each transaction once (worldPayTx/<tx>). Without tx → 400 with the payment's details.
//   world-kart-start { car }: the car counts only if this wallet owns it (a guest's / an unowned car → the racer's own kart, "").
// Firestore: worldKartCars/<wallet> { ids } · worldStats/kartShop { sold, arc, burned, <id> }
export const KART = {
  DAY_RACES: 5, DAY_ARCL: 2500, PAY: [500, 350, 250, 150, 100], DAILY_PAY: 300,
  TRACKS: { nexus: { laps: 3, minLap: 19 }, moon: { laps: 3, minLap: 21 }, ice: { laps: 3, minLap: 19 }, volcano: { laps: 3, minLap: 19 } }, MAX_GHOST: 40000,
  TRACK_IDS: ["nexus", "moon", "ice", "volcano"], /* (the order the daily's track is drawn from: world-kart.js TRACK_IDS is the same) */
  RACERS: ["pepe", "doge", "pengu", "wif", "bonk"], RULES: ["mirror", "nitro", "nodrift", "night", "turbo"],
  XP: { place: [60, 45, 35, 25, 20], lap: 10, ta: 30, daily: 20 }, LV: { per: 100, max: 50 },
  // KG (2026-11-01): guests' races — kept under the guest id (the last KEEP), claimed by a wallet the same Seoul day; a guest id
  // starts at most START_HR races an hour; a wallet takes at most GIDS guest ids (a phone and a computer, say)
  GUEST: { KEEP: 12, START_HR: 30, GIDS: 4 },
};
export const GID_RE = /^[0-9a-f]{16,32}$/;
export const kartLv = (xp) => Math.min(KART.LV.max, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / KART.LV.per)));
const dayHash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
/// the day's challenge: the same rule for everyone on a Seoul day (world-kart.js has the same function)
export const dailyOf = (t) => { const day = new Date(t + 9 * 3600e3).toISOString().slice(0, 10), seed = dayHash("kart:" + day); return { day, seed, rule: KART.RULES[seed % KART.RULES.length], track: KART.TRACK_IDS[(seed >>> 8) % KART.TRACK_IDS.length] }; };
export const GHOST_RE = /^[0-9a-z,;.-]*$/;
import { KSHOP, carOf, priceOf } from "../world-kart-shop-data.js";
import { ARCIRCLE, FEE_BURN } from "./_world-shop.mjs";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad32 = (a) => "0x" + String(a || "").toLowerCase().replace(/^0x/, "").padStart(64, "0");
const RACE_TTL = 30 * 60e3, TOP_N = 20, MODES = ["race", "ta", "daily"];
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), credit(wallet, kind, n) → credited, isoWeek(t)?, randomId?, event? (api/_world-kartevent.mjs) }
export function makeKart(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];
  const week = () => (deps.isoWeek ? deps.isoWeek(now()) : seoulDay(now()).slice(0, 7));
  const nameOf = async (w) => String(((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
  const trackOf = (t) => (KART.TRACKS[t] ? t : "");

  // KG: a guest races under a random id (no wallet, no signature): the same start and the same checks at the end, but nothing
  // is paid — the accepted end waits under worldKartGuest/<gid> until a wallet claims it the same Seoul day (world-kart-claim)
  const guestOf = (b) => (!b.wallet && !b.signature && GID_RE.test(String(b.guest || "")) ? String(b.guest) : "");
  async function start(b) {
    const gid = guestOf(b); let key;
    if (gid) {
      const hk = `worldKartGRate/${gid}_${Math.floor(now() / 3600e3)}`, h = (await one(hk)) || { n: 0 };
      if (h.n >= KART.GUEST.START_HR) return json(429, { error: "too many races — take a short break" });
      await setDoc(hk, { n: h.n + 1, at: now() }); key = `worldKartRace/g_${gid}`;
    } else { const s = signer(b); if (s.err) return s.err; key = `worldKartRace/${s.wallet}`; }
    let track = trackOf(String(b.track || "nexus")); if (!track) return json(400, { error: "no such track" });
    const mode = MODES.includes(b.mode) ? b.mode : "race", racer = KART.RACERS.includes(b.racer) ? b.racer : KART.RACERS[0];
    const car = !gid && carOf(String(b.car || "")) && (await carsOf(key.slice("worldKartRace/".length))).includes(String(b.car)) ? String(b.car) : ""; // (KS: only a car this wallet owns)
    const raceId = rid(), startedAt = now(), dd = mode === "daily" ? dailyOf(startedAt) : null;
    if (dd) track = dd.track; // (K5: the daily runs on the day's track — one board, one track)
    await setDoc(key, { raceId, startedAt, mode, track, racer, ...(car ? { car } : {}), ...(dd ? { day: dd.day, rule: dd.rule } : {}) });
    return json(200, { raceId, startedAt, mode, track, car, ...(gid ? { guest: true } : {}), ...(dd ? { daily: { day: dd.day, rule: dd.rule, seed: dd.seed, track: dd.track } } : {}) });
  }

  /// the end's numbers checked against the race and the server's clock → { place, tm, laps } or { err }
  function checkEnd(run, b, t) {
    if (!run || run.raceId !== String(b.raceId || "") || t - run.startedAt > RACE_TTL) return { err: json(409, { error: "that race isn't active" }) };
    const TR = KART.TRACKS[run.track] || KART.TRACKS.nexus, time = Number(b.time), laps = Array.isArray(b.laps) ? b.laps.map(Number) : null;
    if (!Number.isFinite(time) || time <= 0 || time > 3600 || !laps || laps.length !== TR.laps || !laps.every((x) => Number.isFinite(x) && x > 0 && x < 1200)) return { err: json(400, { error: "bad numbers" }) };
    if (laps.some((x) => x < TR.minLap)) return { err: json(400, { error: "a lap faster than the track allows" }) };
    if (Math.abs(laps.reduce((a, x) => a + x, 0) - time) > 1) return { err: json(400, { error: "the laps don't add up to the time" }) };
    if (time * 1000 > t - run.startedAt + 5000) return { err: json(400, { error: "the race is longer than it has been going" }) };
    const racing = run.mode !== "ta", place = racing ? Math.floor(Number(b.place)) : 0;
    if (racing && !(place >= 1 && place <= KART.PAY.length)) return { err: json(400, { error: "bad place" }) };
    return { place, tm: Math.round(time * 1000) / 1000, laps };
  }

  async function end(b) {
    const gid = guestOf(b); if (gid) return guestEnd(gid, b);
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), run = await one(`worldKartRace/${w}`), c = checkEnd(run, b, t); if (c.err) return c.err;
    // the end counts once (a repeated request is refused, a lost reply can't be paid twice)
    if (!(await commit([{ create: `worldKartEnd/${run.raceId}`, data: { at: t, wallet: w, mode: run.mode, track: run.track, place: c.place, time: c.tm, laps: c.laps, racer: run.racer, car: run.car || "" } }])).ok) return json(409, { error: "that race has ended" });
    return json(200, await settle(w, run, { place: c.place, tm: c.tm, laps: c.laps, t }, typeof b.ghost === "string" ? b.ghost : ""));
  }

  /// an accepted end paid and counted for a wallet: the racer's meta, the event, the boards and the ghost, ARCL by the day's rules.
  /// A signed end comes here straight away; a guest's end when a wallet claims it (rec.t is when it really ended).
  async function settle(w, run, rec, g) {
    const { place, tm, laps } = rec, day = seoulDay(now());
    await addSpan(w, seoulDay(rec.t), run.startedAt, rec.t);
    const M = await metaEnd(w, { mode: run.mode, track: run.track, place, time: tm, laps: laps.length });
    // the KART GRAND OPENING EVENT (api/_world-kartevent.mjs): an accepted end inside its window counts there
    const ev = deps.event ? await deps.event.onEnd(w, { mode: run.mode, track: run.track, startedAt: run.startedAt, t: rec.t, time: tm, laps, racer: run.racer, ghost: g }).catch((e) => { console.warn("kart event:", e && e.message); return null; }) : null;
    // the week's board and the ghost: race or time attack (a daily runs under a twist: its own board)
    let rank = null, dailyRank = null;
    if (run.mode === "daily") dailyRank = run.day === day ? await dailyBoard(w, day, tm, run.racer).catch(() => null) : null;
    else {
      rank = await board(w, run.track, tm, run.racer).catch(() => null);
      if (M.newBest && g && g.length <= KART.MAX_GHOST && GHOST_RE.test(g)) await setDoc(`worldKartGhost/${run.track}_${w}`, { t: tm, g, racer: run.racer, at: rec.t }).catch(() => {});
    }
    const out = { ok: true, rank, dailyRank, best: M.best, newBest: M.newBest, newAch: M.newAch, meta: M.meta, cap: KART.DAY_ARCL, ...(ev ? { ev } : {}) };
    const dk = `worldKartDay/${w}_${day}`, todayOf = async () => ((await one(dk)) || {}).n || 0;
    const pay = async (amt0) => { const got = await todayOf(), amt = Math.max(0, Math.min(amt0, KART.DAY_ARCL - got)); let c = 0; if (amt > 0 && deps.credit) { c = await deps.credit(w, "kart", amt); if (c > 0) await commit([{ inc: dk, fields: { n: c } }]); } return c; };
    if (run.mode === "ta") return { ...out, credited: 0, earned: 0, why: "ta", racesLeft: await left(w, day), today: await todayOf() };
    if (run.mode === "daily") {
      if (!(await commit([{ create: `worldKartDailyPay/${w}_${day}`, data: { at: rec.t, raceId: run.raceId } }])).ok) return { ...out, credited: 0, earned: 0, why: "daily-done", racesLeft: await left(w, day), today: await todayOf() };
      const c = await pay(KART.DAILY_PAY); return { ...out, credited: c, earned: KART.DAILY_PAY, why: c > 0 ? "" : "cap", racesLeft: await left(w, day), today: await todayOf() };
    }
    const amt0 = KART.PAY[place - 1];
    // a paying race takes one of the day's slots (create-only markers, so two ends at once can't both take the last)
    let slot = 0; for (let k = 1; k <= KART.DAY_RACES && !slot; k++) if ((await commit([{ create: `worldKartSlot/${w}_${day}_${k}`, data: { at: rec.t, raceId: run.raceId } }])).ok) slot = k;
    if (!slot) return { ...out, credited: 0, earned: amt0, why: "races", racesLeft: 0, today: await todayOf() };
    const c = await pay(amt0);
    return { ...out, credited: c, earned: amt0, why: c > 0 ? "" : "cap", racesLeft: KART.DAY_RACES - slot, today: await todayOf() };
  }
  // the times a wallet's counted races ran, a Seoul day (signed and claimed alike): a claimed guest race that overlaps one of them
  // isn't counted — one kart at a time, as with a signed wallet's one active race
  const spanKey = (w, day) => `worldKartSpan/${w}_${day}`;
  async function addSpan(w, day, a, b) { const k = spanKey(w, day), d = (await one(k)) || { s: [] }; d.s = [...(d.s || []), [a, b]].slice(-80); await setDoc(k, d).catch(() => {}); }
  const overlaps = (spans, a, b) => (spans || []).some(([x, y]) => a < y - 1000 && x < b - 1000);

  // ---- KG: guests ----
  /// what a guest's waiting ends of the day would pay if claimed by a wallet with nothing yet today (an estimate: the
  /// wallet's own races today count toward the same caps), and how many count toward the event
  function pendingOf(ends, day) {
    let arcl = 0, races = 0, daily = false, ev = 0; const each = {};
    for (const e of ends) { if (e.claimed || e.day !== day) continue;
      let a = 0; if (e.mode === "race" && races < KART.DAY_RACES) { races++; a = KART.PAY[e.place - 1] || 0; } else if (e.mode === "daily" && !daily) { daily = true; a = KART.DAILY_PAY; }
      a = Math.max(0, Math.min(a, KART.DAY_ARCL - arcl)); arcl += a; each[e.id] = a;
      if (deps.event && deps.event.counts && deps.event.counts(e)) ev++; }
    return { arcl, n: ends.filter((e) => !e.claimed && e.day === day).length, ev, each };
  }
  async function guestEnd(gid, b) {
    const t = now(), run = await one(`worldKartRace/g_${gid}`), c = checkEnd(run, b, t); if (c.err) return c.err;
    if (!(await commit([{ create: `worldKartEnd/${run.raceId}`, data: { at: t, guest: gid, mode: run.mode, track: run.track, place: c.place, time: c.tm, laps: c.laps, racer: run.racer } }])).ok) return json(409, { error: "that race has ended" });
    const g = typeof b.ghost === "string" && b.ghost.length <= KART.MAX_GHOST && GHOST_RE.test(b.ghost) ? b.ghost : "";
    if (g) await setDoc(`worldKartGuestG/${run.raceId}`, { g }).catch(() => {});
    const k = `worldKartGuest/${gid}`, d = (await one(k)) || { ends: [] }, day = seoulDay(t);
    const e = { id: run.raceId, place: c.place, mode: run.mode, track: run.track, time: c.tm, laps: c.laps, startedAt: run.startedAt, t, racer: run.racer, day, ...(run.day ? { rday: run.day } : {}), g: !!g };
    d.ends = [...(d.ends || []), e].slice(-KART.GUEST.KEEP); await setDoc(k, d);
    const p = pendingOf(d.ends, day), by = await one(`worldKartGuestBy/${gid}`);
    return json(200, { ok: true, guest: true, earned: p.each[e.id] || 0, pending: p.arcl, waiting: p.n, ev: p.ev, claimable: !by, why: run.mode === "ta" ? "ta" : p.each[e.id] ? "" : run.mode === "daily" ? "daily-done" : "races", cap: KART.DAY_ARCL });
  }
  /// world-kart-claim { gid } (signed): the guest id bound to the wallet (once, never to another), its waiting ends of today
  /// counted and paid as signed ones would have been, in the order they ran
  async function claim(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, gid = String(b.gid || "");
    if (!GID_RE.test(gid)) return json(400, { error: "bad guest id" });
    if (!(await commit([{ create: `worldKartGuestBy/${gid}`, data: { w, at: now() } }])).ok) {
      const by = await one(`worldKartGuestBy/${gid}`); if (!by || by.w !== w) return json(409, { error: "those races were claimed by another wallet" });
    } else {
      const gk = `worldKartGids/${w}`, gl = (await one(gk)) || { list: [] };
      if (!gl.list.includes(gid)) { if (gl.list.length >= KART.GUEST.GIDS) { await commit([{ del: `worldKartGuestBy/${gid}` }]).catch(() => {}); return json(409, { error: "this wallet has claimed races from too many devices" }); } gl.list.push(gid); await setDoc(gk, gl); }
    }
    const k = `worldKartGuest/${gid}`, d = (await one(k)) || { ends: [] }, day = seoulDay(now()), done = [];
    let credited = 0, expired = 0, last = null, ev = null; const newAch = [];
    for (const e of [...(d.ends || [])].sort((a, x) => a.t - x.t)) {
      if (e.claimed) continue;
      if (e.day !== day) { expired++; continue; }
      if (!(await commit([{ create: `worldKartClaim/${e.id}`, data: { w, gid, at: now() } }])).ok) continue; // (counted once, even with two claims at once)
      e.claimed = w;
      const spans = ((await one(spanKey(w, day))) || {}).s;
      if (overlaps(spans, e.startedAt, e.t)) { done.push({ id: e.id, mode: e.mode, track: e.track, place: e.place, credited: 0, why: "overlap" }); continue; }
      const g = e.g ? (((await one(`worldKartGuestG/${e.id}`)) || {}).g || "") : "";
      const r = await settle(w, { raceId: e.id, mode: e.mode, track: e.track, racer: e.racer, startedAt: e.startedAt, day: e.rday }, { place: e.place, tm: e.time, laps: e.laps, t: e.t }, g);
      credited += r.credited || 0; last = r; if (r.ev) ev = { ...(ev || {}), ...r.ev }; for (const a of r.newAch || []) if (!newAch.includes(a)) newAch.push(a);
      done.push({ id: e.id, mode: e.mode, track: e.track, place: e.place, time: e.time, credited: r.credited || 0, earned: r.earned || 0, why: r.why });
    }
    // what's left of the old days can't be claimed any more: dropped from the list
    d.ends = (d.ends || []).filter((e) => !e.claimed && e.day === day); await setDoc(k, d);
    const dk = `worldKartDay/${w}_${day}`;
    return json(200, { ok: true, credited, races: done, expired, newAch, ...(ev ? { ev } : {}), meta: last ? last.meta : metaView(metaOf(await one(`worldKartMeta/${w}`))), racesLeft: await left(w, day), today: ((await one(dk)) || {}).n || 0, cap: KART.DAY_ARCL });
  }

  // ---- KS: the shop's cars ----
  const carsOf = async (w) => (/^0x[0-9a-f]{40}$/.test(w) ? ((await one(`worldKartCars/${w}`)) || {}).ids || [] : []);
  const payOf = () => ({ token: ARCIRCLE, to: FEE_BURN, burnPct: KSHOP.BURN_PCT });
  async function shopView(w) {
    return json(200, { cars: KSHOP.CARS.map((c) => ({ id: c.id, price: priceOf(c), grade: c.grade })), depts: KSHOP.DEPTS.map((d) => ({ id: d.id, open: d.open })), prices: KSHOP.PRICE, burnPct: KSHOP.BURN_PCT, owned: await carsOf(w), pay: payOf() }, "no-store");
  }
  async function buyCar(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, c = carOf(String(b.id || ""));
    if (!c) return json(404, { error: "no such car" });
    const price = priceOf(c), own = await carsOf(w);
    if (own.includes(c.id)) return json(200, { ok: true, owned: own, already: true });
    const tx = String(b.tx || "").toLowerCase(); if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "which transaction?", pay: { ...payOf(), amount: (BigInt(price) * 10n ** 18n).toString(), price } });
    const txk = `worldPayTx/${tx}`; if (await one(txk)) return json(409, { error: "this transaction was already used" });
    const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null;
    if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet" });
    if (rc.status !== "0x1") return json(400, { error: "the transaction failed" });
    const lcs = (a) => String(a || "").toLowerCase();
    const paid = (rc.logs || []).filter((l) => lcs(l.address) === lcs(ARCIRCLE) && l.topics && lcs(l.topics[0]) === TRANSFER && lcs(l.topics[1]) === pad32(w) && lcs(l.topics[2]) === pad32(FEE_BURN)).reduce((x, l) => x + BigInt(l.data), 0n);
    if (paid < BigInt(price) * 10n ** 18n) return json(400, { error: `the transfer is less than ${price.toLocaleString("en-US")} $ARCIRCLE` });
    if (!(await commit([{ create: txk, data: { wallet: w, item: "kart-car-" + c.id, at: now() } }])).ok) return json(409, { error: "this transaction was already used" });
    const ids = [...new Set([...(await carsOf(w)), c.id])]; await setDoc(`worldKartCars/${w}`, { ids, at: now() });
    const tok = Number(paid / 10n ** 12n) / 1e6, burned = (tok * KSHOP.BURN_PCT) / 100;
    await commit([{ inc: "worldStats/kartShop", fields: { sold: 1, arc: tok, burned, [c.id]: 1 } }, { inc: "worldStats/shop", fields: { paid: 1, arcPaid: tok, arcBurned: burned } }]).catch(() => {});
    return json(200, { ok: true, owned: ids, car: c.id });
  }

  // the racer's meta: races, wins, XP → level, the best time a track, the five achievements (town titles "kt-<id>")
  const metaOf = (m) => ({ races: 0, wins: 0, xp: 0, best: {}, ach: {}, ...(m || {}) });
  const metaView = (m) => ({ races: m.races, wins: m.wins, xp: m.xp, lv: kartLv(m.xp), best: m.best, ach: Object.keys(m.ach) });
  async function metaEnd(w, r) {
    const k = `worldKartMeta/${w}`, m = metaOf(await one(k)), racing = r.mode !== "ta";
    m.races++; if (racing && r.place === 1) m.wins++;
    m.xp += (racing ? KART.XP.place[r.place - 1] || 0 : KART.XP.ta) + r.laps * KART.XP.lap + (r.mode === "daily" ? KART.XP.daily : 0);
    const was = m.best[r.track] || 0, newBest = r.mode !== "daily" && (!was || r.time < was); if (newBest) m.best[r.track] = r.time;
    const reach = { first: racing, win: racing && r.place === 1, win10: m.wins >= 10, ta: r.mode === "ta", daily: r.mode === "daily" }, fresh = [];
    for (const id of Object.keys(reach)) if (reach[id] && !m.ach[id]) { m.ach[id] = now(); fresh.push(id); }
    await setDoc(k, m);
    return { newAch: fresh, meta: metaView(m), best: m.best[r.track] || 0, newBest };
  }
  /// the week's board of a track: the best time (race or time attack), one line a wallet; returns your place (or null)
  async function board(w, track, t, racer) {
    const key = `worldStats/kartWeek_${track}_${week()}`, cur = await one(key); let top = (cur && cur.top) || [];
    const was = top.find((x) => x.id === w);
    if (!was || t < was.t) { const name = await nameOf(w); top = [{ w: short(w), id: w, t, racer, name }, ...top.filter((x) => x.id !== w)].sort((a, b) => a.t - b.t).slice(0, TOP_N); await setDoc(key, { top }); }
    const i = top.findIndex((x) => x.id === w); return i < 0 ? null : i + 1;
  }
  async function dailyBoard(w, day, t, racer) {
    const key = `worldStats/kartDaily_${day}`, cur = await one(key); let top = (cur && cur.top) || [];
    const was = top.find((x) => x.id === w);
    if (!was || t < was.t) { const name = await nameOf(w); top = [{ w: short(w), id: w, t, racer, name }, ...top.filter((x) => x.id !== w)].sort((a, b) => a.t - b.t).slice(0, TOP_N); await setDoc(key, { top }); }
    const i = top.findIndex((x) => x.id === w); return i < 0 ? null : i + 1;
  }
  async function left(w, day) { const d = await getDocs(Array.from({ length: KART.DAY_RACES }, (_, k) => `worldKartSlot/${w}_${day}_${k + 1}`)); return KART.DAY_RACES - Object.values(d).filter(Boolean).length; }
  const pub = (top) => (top || []).map(({ w, name, t, racer }) => ({ w, name: name || "", t, racer: racer || "" }));

  return {
    async read(v, url) {
      const q = (k) => String((url && url.searchParams && url.searchParams.get(k)) || "");
      if (v === "kart-top") { const track = trackOf(q("track") || "nexus"); if (!track) return json(400, { error: "no such track" }); const wk = week(), d = await one(`worldStats/kartWeek_${track}_${wk}`); return json(200, { week: wk, track, top: pub(d && d.top) }, "public, max-age=30"); }
      if (v === "kart-daily") { const dd = dailyOf(now()), d = await one(`worldStats/kartDaily_${dd.day}`); return json(200, { day: dd.day, rule: dd.rule, seed: dd.seed, track: dd.track, top: pub(d && d.top) }, "public, max-age=30"); }
      if (v === "kart-ghost") {
        const track = trackOf(q("track") || "nexus"); if (!track) return json(400, { error: "no such track" });
        let w = q("wallet").toLowerCase();
        if (q("who") !== "me") { const d = await one(`worldStats/kartWeek_${track}_${week()}`); w = (d && d.top && d.top[0] && d.top[0].id) || ""; } // (the board's #1 is the pointer)
        if (!/^0x[0-9a-f]{40}$/.test(w)) return json(404, { error: "no ghost" });
        const g = await one(`worldKartGhost/${track}_${w}`); if (!g || !g.g) return json(404, { error: "no ghost" });
        return json(200, { t: g.t, g: g.g, racer: g.racer || "", name: await nameOf(w) }, q("who") === "me" ? "no-store" : "public, max-age=30");
      }
      if (v === "kart-shop") { const w = q("wallet").toLowerCase(); return shopView(/^0x[0-9a-f]{40}$/.test(w) ? w : ""); }
      if (v !== "kart") return null;
      const w = q("wallet").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, { today: 0, cap: KART.DAY_ARCL, racesLeft: KART.DAY_RACES });
      const day = seoulDay(now()), today = ((await one(`worldKartDay/${w}_${day}`)) || {}).n || 0, dailyPaid = !!(await one(`worldKartDailyPay/${w}_${day}`));
      return json(200, { today, cap: KART.DAY_ARCL, racesLeft: await left(w, day), dailyPaid, meta: metaView(metaOf(await one(`worldKartMeta/${w}`))) }, "no-store");
    },
    async handle(b) {
      if (b.action === "world-kart-start") return start(b);
      if (b.action === "world-kart-end") return end(b);
      if (b.action === "world-kart-claim") return claim(b);
      if (b.action === "world-kart-car-buy") return buyCar(b);
      return null;
    },
  };
}
