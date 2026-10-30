// api/_world-kart.mjs — ARCIRCLE KART (world-kart.js), stage K2 (2026-10-30): races checked and paid here, the racer's
// meta (level, wins, titles), the week's board and its ghosts, the daily challenge. Modelled on _world-survivors.mjs.
//
//   POST { action: "world-kart-start", …signature, track, mode: "race" | "ta" | "daily", racer } → { raceId, startedAt, mode, daily? }
//        one active race a wallet: a new start replaces the last (its end is then refused)
//   POST { action: "world-kart-end", …signature, raceId, place 1–5, time (s), laps [s], ghost?, racer }
//        → { credited, earned, why, racesLeft, today, cap, rank, dailyRank, best, newBest, newAch, meta }
//        checked on the server's clock: the race can't be longer than it has been going (+5 s), every lap at least the
//        track's minLap, as many laps as the track has, the laps adding up to the time; counted once (worldKartEnd).
//        Mode "race" pays PAY[place − 1] for the first DAY_RACES races of a Seoul day; mode "daily" pays DAILY_PAY once a
//        Seoul day; both inside DAY_ARCL a day (and the shop's daily cap); mode "ta" (time attack) pays nothing.
//        ARCL kind "kart".
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
export const KART = {
  DAY_RACES: 5, DAY_ARCL: 2500, PAY: [500, 350, 250, 150, 100], DAILY_PAY: 300,
  TRACKS: { nexus: { laps: 3, minLap: 19 }, moon: { laps: 3, minLap: 21 }, ice: { laps: 3, minLap: 19 }, volcano: { laps: 3, minLap: 19 } }, MAX_GHOST: 40000,
  TRACK_IDS: ["nexus", "moon", "ice", "volcano"], /* (the order the daily's track is drawn from: world-kart.js TRACK_IDS is the same) */
  RACERS: ["pepe", "doge", "pengu", "wif", "bonk"], RULES: ["mirror", "nitro", "nodrift", "night", "turbo"],
  XP: { place: [60, 45, 35, 25, 20], lap: 10, ta: 30, daily: 20 }, LV: { per: 100, max: 50 },
};
export const kartLv = (xp) => Math.min(KART.LV.max, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / KART.LV.per)));
const dayHash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
/// the day's challenge: the same rule for everyone on a Seoul day (world-kart.js has the same function)
export const dailyOf = (t) => { const day = new Date(t + 9 * 3600e3).toISOString().slice(0, 10), seed = dayHash("kart:" + day); return { day, seed, rule: KART.RULES[seed % KART.RULES.length], track: KART.TRACK_IDS[(seed >>> 8) % KART.TRACK_IDS.length] }; };
export const GHOST_RE = /^[0-9a-z,;.-]*$/;
const RACE_TTL = 30 * 60e3, TOP_N = 20, MODES = ["race", "ta", "daily"];
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), credit(wallet, kind, n) → credited, isoWeek(t)?, randomId? }
export function makeKart(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];
  const week = () => (deps.isoWeek ? deps.isoWeek(now()) : seoulDay(now()).slice(0, 7));
  const nameOf = async (w) => String(((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
  const trackOf = (t) => (KART.TRACKS[t] ? t : "");

  async function start(b) {
    const s = signer(b); if (s.err) return s.err;
    let track = trackOf(String(b.track || "nexus")); if (!track) return json(400, { error: "no such track" });
    const mode = MODES.includes(b.mode) ? b.mode : "race", racer = KART.RACERS.includes(b.racer) ? b.racer : KART.RACERS[0];
    const raceId = rid(), startedAt = now(), dd = mode === "daily" ? dailyOf(startedAt) : null;
    if (dd) track = dd.track; // (K5: the daily runs on the day's track — one board, one track)
    await setDoc(`worldKartRace/${s.wallet}`, { raceId, startedAt, mode, track, racer, ...(dd ? { day: dd.day, rule: dd.rule } : {}) });
    return json(200, { raceId, startedAt, mode, track, ...(dd ? { daily: { day: dd.day, rule: dd.rule, seed: dd.seed, track: dd.track } } : {}) });
  }

  async function end(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), run = await one(`worldKartRace/${w}`);
    if (!run || run.raceId !== String(b.raceId || "") || t - run.startedAt > RACE_TTL) return json(409, { error: "that race isn't active" });
    const TR = KART.TRACKS[run.track] || KART.TRACKS.nexus, time = Number(b.time), laps = Array.isArray(b.laps) ? b.laps.map(Number) : null;
    if (!Number.isFinite(time) || time <= 0 || time > 3600 || !laps || laps.length !== TR.laps || !laps.every((x) => Number.isFinite(x) && x > 0 && x < 1200)) return json(400, { error: "bad numbers" });
    if (laps.some((x) => x < TR.minLap)) return json(400, { error: "a lap faster than the track allows" });
    if (Math.abs(laps.reduce((a, x) => a + x, 0) - time) > 1) return json(400, { error: "the laps don't add up to the time" });
    if (time * 1000 > t - run.startedAt + 5000) return json(400, { error: "the race is longer than it has been going" });
    const racing = run.mode !== "ta", place = racing ? Math.floor(Number(b.place)) : 0;
    if (racing && !(place >= 1 && place <= KART.PAY.length)) return json(400, { error: "bad place" });
    const tm = Math.round(time * 1000) / 1000;
    // the end counts once (a repeated request is refused, a lost reply can't be paid twice)
    if (!(await commit([{ create: `worldKartEnd/${run.raceId}`, data: { at: t, wallet: w, mode: run.mode, track: run.track, place, time: tm, laps, racer: run.racer } }])).ok) return json(409, { error: "that race has ended" });
    const day = seoulDay(t), M = await metaEnd(w, { mode: run.mode, track: run.track, place, time: tm, laps: laps.length });
    // the week's board and the ghost: race or time attack (a daily runs under a twist: its own board)
    let rank = null, dailyRank = null;
    if (run.mode === "daily") dailyRank = run.day === day ? await dailyBoard(w, day, tm, run.racer).catch(() => null) : null;
    else {
      rank = await board(w, run.track, tm, run.racer).catch(() => null);
      const g = typeof b.ghost === "string" ? b.ghost : "";
      if (M.newBest && g && g.length <= KART.MAX_GHOST && GHOST_RE.test(g)) await setDoc(`worldKartGhost/${run.track}_${w}`, { t: tm, g, racer: run.racer, at: t }).catch(() => {});
    }
    const out = { ok: true, rank, dailyRank, best: M.best, newBest: M.newBest, newAch: M.newAch, meta: M.meta, cap: KART.DAY_ARCL };
    const dk = `worldKartDay/${w}_${day}`, todayOf = async () => ((await one(dk)) || {}).n || 0;
    const pay = async (amt0) => { const got = await todayOf(), amt = Math.max(0, Math.min(amt0, KART.DAY_ARCL - got)); let c = 0; if (amt > 0 && deps.credit) { c = await deps.credit(w, "kart", amt); if (c > 0) await commit([{ inc: dk, fields: { n: c } }]); } return c; };
    if (run.mode === "ta") return json(200, { ...out, credited: 0, earned: 0, why: "ta", racesLeft: await left(w, day), today: await todayOf() });
    if (run.mode === "daily") {
      if (!(await commit([{ create: `worldKartDailyPay/${w}_${day}`, data: { at: t, raceId: run.raceId } }])).ok) return json(200, { ...out, credited: 0, earned: 0, why: "daily-done", racesLeft: await left(w, day), today: await todayOf() });
      const c = await pay(KART.DAILY_PAY); return json(200, { ...out, credited: c, earned: KART.DAILY_PAY, why: c > 0 ? "" : "cap", racesLeft: await left(w, day), today: await todayOf() });
    }
    const amt0 = KART.PAY[place - 1];
    // a paying race takes one of the day's slots (create-only markers, so two ends at once can't both take the last)
    let slot = 0; for (let k = 1; k <= KART.DAY_RACES && !slot; k++) if ((await commit([{ create: `worldKartSlot/${w}_${day}_${k}`, data: { at: t, raceId: run.raceId } }])).ok) slot = k;
    if (!slot) return json(200, { ...out, credited: 0, earned: amt0, why: "races", racesLeft: 0, today: await todayOf() });
    const c = await pay(amt0);
    return json(200, { ...out, credited: c, earned: amt0, why: c > 0 ? "" : "cap", racesLeft: KART.DAY_RACES - slot, today: await todayOf() });
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
      if (v !== "kart") return null;
      const w = q("wallet").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, { today: 0, cap: KART.DAY_ARCL, racesLeft: KART.DAY_RACES });
      const day = seoulDay(now()), today = ((await one(`worldKartDay/${w}_${day}`)) || {}).n || 0, dailyPaid = !!(await one(`worldKartDailyPay/${w}_${day}`));
      return json(200, { today, cap: KART.DAY_ARCL, racesLeft: await left(w, day), dailyPaid, meta: metaView(metaOf(await one(`worldKartMeta/${w}`))) }, "no-store");
    },
    async handle(b) {
      if (b.action === "world-kart-start") return start(b);
      if (b.action === "world-kart-end") return end(b);
      return null;
    },
  };
}
