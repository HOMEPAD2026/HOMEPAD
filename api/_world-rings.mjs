// api/_world-rings.mjs — INFINITY RINGS (world-rings.js), the Game Village's ring puzzle. What pays is decided here:
// the server makes the level itself (api/_world-rings-engine.mjs, a copy of the game's world-rings-engine.js), plays the
// moves on it and counts the stars — never the game's own word.
//
//   POST { action: "world-rings-start", …signature, lv }                        → { runId, startedAt, lv }
//        lv: "1"–"100" (the campaign) or today's daily puzzle "d:<Seoul date>:<0–2>"; one active board a wallet
//   POST { action: "world-rings-end", …signature, runId, moves, hints }          → { stars, prev, credited, why, today, master, rank }
//        the moves ([[ring, ±1 | 0]…], world-rings-engine.js replay()) must clear the board, and not faster than a
//        person could play them. Stars: par or fewer 3, a little over 2, any clear 1 (a hint caps it at 2, the hammer at 1).
//        Each star of each level pays once, 100 ARCL a star (so 100 / 200 / 300, and a better clear later pays the
//        difference); each of the day's 3 daily puzzles the same, once a day. At most DAY_ARCL a day from this game,
//        through the shop's credit (inside its own daily cap). A star that today's limit can't pay stays owed: the
//        next clear of that level pays it. ARCL kind "rings". Clearing level 100 makes the wallet an INFINITY MASTER.
//   GET  ?world=rings&wallet=…                                                   → { best, daily, today, cap, master }
//   GET  ?world=rings-top                                                        → { week, top: [{ w, name, stars }] }
//        the week's most stars won (new stars only: a level's best counts once), one line a wallet
//
// Firestore: worldRingsRun/<wallet> · worldRingsEnd/<runId> (once) · worldRingsPay/<wallet>_<level key>_<star> (once)
//            worldRingsProg/<wallet> { best: { c12: 3, d2026-10-18_1: 2 }, moves: {…}, master } · worldRingsDay/<wallet>_<day>
//            worldRingsWeek/<week>_<wallet> { n } · worldStats/ringsWeek_<week>
// All of it is progress, so each fresh start (epoch) begins empty (none of it is in _world-phase.mjs's KEEP).
import { RINGS, level, replay, starsOf } from "./_world-rings-engine.mjs";

const RUN_TTL = 3 * 3600e3, TOP_N = 20;
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const keyOf = (lv) => (/^d:/.test(lv) ? "d" + lv.slice(2).replace(":", "_") : "c" + lv);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), credit(wallet, kind, n) → credited, isoWeek(t)?, randomId? }
export function makeRings(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];
  const week = () => (deps.isoWeek ? deps.isoWeek(now()) : seoulDay(now()).slice(0, 7));
  const okLv = (lv, day) => /^([1-9]\d?|100)$/.test(lv) || new RegExp(`^d:${day}:[0-2]$`).test(lv);

  async function start(b) {
    const s = signer(b); if (s.err) return s.err;
    const lv = String(b.lv || ""), t = now();
    if (!okLv(lv, seoulDay(t))) return json(400, { error: "no such level" });
    const runId = rid(); await setDoc(`worldRingsRun/${s.wallet}`, { runId, startedAt: t, lv });
    return json(200, { runId, startedAt: t, lv });
  }

  async function end(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), run = await one(`worldRingsRun/${w}`);
    if (!run || run.runId !== String(b.runId || "") || t - run.startedAt > RUN_TTL) return json(409, { error: "that board isn't active" });
    const L = level(run.lv); if (!L) return json(400, { error: "no such level" });
    const r = replay(L, b.moves);
    if (!r.ok) return json(400, { error: r.why });
    if (!r.clear) return json(400, { error: "the board isn't clear" });
    if (t - run.startedAt < 1200 + r.moves * 120) return json(400, { error: "faster than it can be played" });
    if (!(await commit([{ create: `worldRingsEnd/${run.runId}`, data: { at: t, wallet: w, lv: run.lv, moves: r.moves, hammer: r.hammer } }])).ok) return json(409, { error: "that board has ended" });
    const hints = Math.max(0, Math.min(99, Math.floor(Number(b.hints) || 0)));
    const stars = starsOf(L, r.moves, r.hammer, hints), key = keyOf(run.lv), pk = `worldRingsProg/${w}`, day = seoulDay(t), dk = `worldRingsDay/${w}_${day}`;
    const [prog0, dayDoc] = await Promise.all([one(pk), one(dk)]);
    const prog = prog0 || { best: {}, moves: {} }, prev = (prog.best && prog.best[key]) || 0, got = (dayDoc && dayDoc.n) || 0;
    // each new star once (create-only markers, so two ends at once can't both pay it), only as far as today's limit reaches
    let amt = 0, capped = false;
    // (the markers, not the best stars, say what's paid: a star the limit couldn't pay is still owed)
    const paidK = await getDocs([1, 2, 3].map((k) => `worldRingsPay/${w}_${key}_${k}`));
    for (let k = 1; k <= stars; k++) {
      if (paidK[`worldRingsPay/${w}_${key}_${k}`]) continue;
      if (got + amt + RINGS.PAY[1] > RINGS.DAY_ARCL) { capped = true; break; }
      if ((await commit([{ create: `worldRingsPay/${w}_${key}_${k}`, data: { at: t, runId: run.runId } }])).ok) amt += RINGS.PAY[1];
    }
    let credited = 0;
    if (amt > 0 && deps.credit) { credited = await deps.credit(w, "rings", amt); if (credited > 0) await commit([{ inc: dk, fields: { n: credited } }]); }
    const best = Math.max(prev, stars), master = !!prog.master || (run.lv === "100" && stars > 0);
    const mv = { ...(prog.moves || {}) }; if (!mv[key] || r.moves < mv[key]) mv[key] = r.moves;
    await setDoc(pk, { best: { ...(prog.best || {}), [key]: best }, moves: mv, master, at: t });
    const rank = stars > prev ? await board(w, stars - prev).catch(() => null) : null;
    const why = credited > 0 ? (capped ? "cap" : "") : capped || amt > 0 ? "cap" : "already";
    return json(200, { ok: true, stars, prev, credited, earned: amt, why, today: got + credited, cap: RINGS.DAY_ARCL, master, rank, moves: r.moves, par: L.par });
  }
  /// the week's board: stars won this week (a level's new stars only), the top TOP_N; returns your place (or null)
  async function board(w, add) {
    const wk = week(), mk = `worldRingsWeek/${wk}_${w}`, key = `worldStats/ringsWeek_${wk}`;
    await commit([{ inc: mk, fields: { n: add } }]);
    const [mine, cur] = await Promise.all([one(mk), one(key)]), n = (mine && mine.n) || add;
    const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
    const top = [{ w: short(w), id: w, stars: n, name }, ...(((cur && cur.top) || []).filter((x) => x.id !== w))].sort((a, b) => b.stars - a.stars).slice(0, TOP_N);
    await setDoc(key, { top });
    const i = top.findIndex((x) => x.id === w); return i < 0 ? null : i + 1;
  }

  return {
    async read(v, url) {
      if (v === "rings-top") { const wk = week(), d = await one(`worldStats/ringsWeek_${wk}`); return json(200, { week: wk, top: ((d && d.top) || []).map(({ w, name, stars }) => ({ w, name: name || "", stars })) }, "public, max-age=30"); }
      if (v !== "rings") return null;
      const w = String((url && url.searchParams && url.searchParams.get("wallet")) || "").toLowerCase(), day = seoulDay(now());
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, { best: {}, today: 0, cap: RINGS.DAY_ARCL, master: false, day });
      const d = await getDocs([`worldRingsProg/${w}`, `worldRingsDay/${w}_${day}`]), p = d[`worldRingsProg/${w}`] || {};
      return json(200, { best: p.best || {}, moves: p.moves || {}, master: !!p.master, today: (d[`worldRingsDay/${w}_${day}`] || {}).n || 0, cap: RINGS.DAY_ARCL, day }, "no-store");
    },
    async handle(b) {
      if (b.action === "world-rings-start") return start(b);
      if (b.action === "world-rings-end") return end(b);
      return null;
    },
  };
}
