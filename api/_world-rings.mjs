// api/_world-rings.mjs — INFINITY RINGS (world-rings.js), the Game Village's ring puzzle. What pays is decided here:
// the server makes the level itself (api/_world-rings-engine.mjs, a copy of the game's world-rings-engine.js), plays the
// moves on it and counts the stars — never the game's own word.
//
//   POST { action: "world-rings-start", …signature, lv }                        → { runId, startedAt, lv }
//        lv: "1"–"200" (the campaign) or today's daily puzzle "d:<Seoul date>:<0–2>"; one active board a wallet
//   POST { action: "world-rings-end", …signature, runId, moves, hints }          → { stars, prev, credited, why, today, master, rank }
//        the moves ([[ring, ±1 | 0]…], world-rings-engine.js replay()) must clear the board, and not faster than a
//        person could play them. Stars: par or fewer 3, a little over 2, any clear 1 (a hint caps it at 2, the hammer at 1).
//        Each star of each level pays once, 100 ARCL a star (so 100 / 200 / 300, and a better clear later pays the
//        difference; levels 101–200 pay PAY2 = 50 a star — kept small while the new rings settle in); each of the day's 3 daily puzzles the same, once a day. At most DAY_ARCL a day from this game,
//        through the shop's credit (inside its own daily cap). A star that today's limit can't pay stays owed: the
//        next clear of that level pays it. ARCL kind "rings". Clearing level 100 makes the wallet an INFINITY MASTER,
//        level 200 an INFINITY LEGEND. vs: { w } (a friend's challenge link): the verified moves go into that
//        friend's challenge box (worldRingsChal/<w>, the last 20).
//        All three of the day's puzzles at 3 stars: a BONUS once that day (and the streak of such days). A clear faster
//        than 0.35 s a par move is refused; under 0.7 s a par move it is noted for the team (worldRingsFast).
//   POST { action: "world-rings-ta-start", …signature }                         → { runId, seed, sec }
//   POST { action: "world-rings-ta-end", …signature, runId, boards: [moves…] }   → { cleared, best, rank }
//        TIME ATTACK: boards t:<seed>:0, 1, … one after another in TA_SEC seconds; every board but the last must be
//        clear (replayed here); the count of clears goes on the week's board (XP only, no ARCL).
//   GET  ?world=rings-ta                                                         → { week, top: [{ w, name, n }] }
//   GET  ?world=rings-chal&wallet=…                                              → { list: [{ name, lv, moves, vs, at }] }
//   GET  ?world=rings&wallet=…                                                   → { best, daily, today, cap, master }
//   GET  ?world=rings-top                                                        → { week, top: [{ w, name, stars }], day, daily: [3 × [{ w, name, moves, ms }]] }
//        and today's three daily boards: the fewest moves, then the quickest
//        the week's most stars won (new stars only: a level's best counts once), one line a wallet
//
// Firestore: worldRingsTa/<wallet> · worldRingsTaEnd/<runId> · worldRingsTaBest/<week>_<wallet> · worldStats/ringsTA_<week> · worldRingsChal/<wallet>
//            worldRingsRun/<wallet> · worldRingsEnd/<runId> (once) · worldRingsPay/<wallet>_<level key>_<star> (once)
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
  const okLv = (lv, day) => /^([1-9]\d?|1\d\d|200)$/.test(lv) || new RegExp(`^d:${day}:[0-2]$`).test(lv);
  const perStar = (lv) => (/^\d+$/.test(lv) && Number(lv) > 100 ? RINGS.PAY2 : RINGS.PAY[1]);

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
    // a person needs time to look and to turn: at least 0.12 s a move and 0.35 s a par move (a clear under twice that
    // is noted for the team: worldRingsFast/<wallet>_<day>)
    const took = t - run.startedAt;
    if (took < 1200 + r.moves * 120 || took < L.par * 350) return json(400, { error: "faster than it can be played" });
    if (took < L.par * 700) await commit([{ inc: `worldRingsFast/${w}_${seoulDay(t)}`, fields: { n: 1 } }]).catch(() => {});
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
      if (got + amt + perStar(run.lv) > RINGS.DAY_ARCL) { capped = true; break; }
      if ((await commit([{ create: `worldRingsPay/${w}_${key}_${k}`, data: { at: t, runId: run.runId } }])).ok) amt += perStar(run.lv);
    }
    // the day's three puzzles all at 3 stars: a bonus once that day, and the streak of such days
    let bonus = 0, streak = (prog.streak && prog.streak.n) || 0;
    const dm = /^d:(\d{4}-\d\d-\d\d):([0-2])$/.exec(run.lv);
    if (dm) {
      const bestD = { ...(prog.best || {}), [key]: Math.max(prev, stars) }, all3 = [0, 1, 2].every((k) => (bestD[`d${dm[1]}_${k}`] || 0) >= 3);
      if (all3 && got + amt + RINGS.BONUS <= RINGS.DAY_ARCL && (await commit([{ create: `worldRingsPay/${w}_d${dm[1]}_bonus`, data: { at: t } }])).ok) {
        bonus = RINGS.BONUS; amt += bonus;
        const yest = new Date(Date.parse(dm[1] + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
        streak = prog.streak && prog.streak.last === yest ? (prog.streak.n || 0) + 1 : 1; prog.streak = { last: dm[1], n: streak };
      }
      await dailyBoard(w, dm[1], dm[2], r.moves, took).catch(() => {});
    }
    let credited = 0;
    if (amt > 0 && deps.credit) { credited = await deps.credit(w, "rings", amt); if (credited > 0) await commit([{ inc: dk, fields: { n: credited } }]); }
    const best = Math.max(prev, stars), master = !!prog.master || (run.lv === "100" && stars > 0), legend = !!prog.legend || (run.lv === "200" && stars > 0);
    const mv = { ...(prog.moves || {}) }; if (!mv[key] || r.moves < mv[key]) mv[key] = r.moves;
    await setDoc(pk, { best: { ...(prog.best || {}), [key]: best }, moves: mv, master, legend, streak: prog.streak || null, at: t });
    // a friend's challenge: their box gets your real moves on that board
    const vw = String((b.vs && b.vs.w) || "").toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(vw) && vw !== w) await chalAdd(vw, { from: w, lv: run.lv, moves: r.moves, vs: Math.max(0, Math.min(999, Math.floor(Number(b.vs.moves) || 0))), at: t }).catch(() => {});
    const rank = stars > prev ? await board(w, stars - prev).catch(() => null) : null;
    const why = credited > 0 ? (capped ? "cap" : "") : capped || amt > 0 ? "cap" : "already";
    return json(200, { ok: true, stars, prev, credited, earned: amt, bonus, streak, why, today: got + credited, cap: RINGS.DAY_ARCL, master, legend, rank, moves: r.moves, par: L.par });
  }
  async function chalAdd(to, x) {
    const key = `worldRingsChal/${to}`, cur = await one(key), name = (((await one(`worldSave/${x.from}`)) || {}).name || short(x.from)).slice(0, 16);
    await setDoc(key, { list: [{ name, lv: x.lv, moves: x.moves, vs: x.vs, at: x.at }, ...(((cur && cur.list) || []))].slice(0, 20) });
  }
  // ---------------- TIME ATTACK ----------------
  async function taStart(b) {
    const s = signer(b); if (s.err) return s.err;
    const t = now(), runId = rid(), seed = 1 + ([...runId].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, t % 997) % 900000000);
    await setDoc(`worldRingsTa/${s.wallet}`, { runId, seed, startedAt: t });
    return json(200, { runId, seed, sec: RINGS.TA_SEC });
  }
  async function taEnd(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), run = await one(`worldRingsTa/${w}`);
    if (!run || run.runId !== String(b.runId || "") || t - run.startedAt > (RINGS.TA_SEC + 60) * 1000) return json(409, { error: "that run isn't active" });
    const boards = Array.isArray(b.boards) ? b.boards.slice(0, 40) : [];
    let n = 0, mv = 0;
    for (let k = 0; k < boards.length; k++) {
      const L = level(`t:${run.seed}:${k}`), r = L && replay(L, boards[k]);
      if (!r || !r.ok) return json(400, { error: (r && r.why) || "no such board" });
      if (!r.clear) { if (k !== boards.length - 1) return json(400, { error: "a board left half done" }); break; }
      n++; mv += r.moves;
    }
    const took = t - run.startedAt;
    if (took < 1000 + mv * 150) return json(400, { error: "faster than it can be played" });
    if (!(await commit([{ create: `worldRingsTaEnd/${run.runId}`, data: { at: t, wallet: w, n } }])).ok) return json(409, { error: "that run has ended" });
    const wk = week(), mk = `worldRingsTaBest/${wk}_${w}`, mine = await one(mk), best = Math.max(n, (mine && mine.n) || 0);
    let rank = null;
    if (n > ((mine && mine.n) || 0)) {
      await setDoc(mk, { n });
      const key = `worldStats/ringsTA_${wk}`, cur = await one(key), name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
      const top = [{ w: short(w), id: w, n, name }, ...(((cur && cur.top) || []).filter((x) => x.id !== w))].sort((a, c) => c.n - a.n).slice(0, TOP_N);
      await setDoc(key, { top }); const i = top.findIndex((x) => x.id === w); rank = i < 0 ? null : i + 1;
    }
    return json(200, { ok: true, cleared: n, best, rank });
  }
  /// a daily puzzle's board: the fewest moves, then the quickest; one line a wallet (worldStats/ringsDaily_<day>_<k>)
  async function dailyBoard(w, day, k, moves, ms) {
    const key = `worldStats/ringsDaily_${day}_${k}`, cur = await one(key), top0 = (cur && cur.top) || [], mine = top0.find((x) => x.id === w);
    if (mine && (mine.moves < moves || (mine.moves === moves && mine.ms <= ms))) return;
    const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
    const top = [{ w: short(w), id: w, moves, ms: Math.round(ms), name }, ...top0.filter((x) => x.id !== w)].sort((a, b) => a.moves - b.moves || a.ms - b.ms).slice(0, TOP_N);
    await setDoc(key, { top });
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
      if (v === "rings-top") {
        const wk = week(), day = seoulDay(now()), ks = [`worldStats/ringsWeek_${wk}`, ...[0, 1, 2].map((k) => `worldStats/ringsDaily_${day}_${k}`)], d = await getDocs(ks);
        const daily = [0, 1, 2].map((k) => ((d[ks[k + 1]] && d[ks[k + 1]].top) || []).map(({ w, name, moves, ms }) => ({ w, name: name || "", moves, ms })));
        return json(200, { week: wk, day, top: ((d[ks[0]] && d[ks[0]].top) || []).map(({ w, name, stars }) => ({ w, name: name || "", stars })), daily }, "public, max-age=30");
      }
      if (v === "rings-ta") { const wk = week(), d = await one(`worldStats/ringsTA_${wk}`); return json(200, { week: wk, top: ((d && d.top) || []).map(({ w, name, n }) => ({ w, name: name || "", n })) }, "public, max-age=30"); }
      if (v === "rings-chal") { const w = String((url && url.searchParams && url.searchParams.get("wallet")) || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, { list: [] }); const d = await one(`worldRingsChal/${w}`); return json(200, { list: (d && d.list) || [] }, "no-store"); }
      if (v !== "rings") return null;
      const w = String((url && url.searchParams && url.searchParams.get("wallet")) || "").toLowerCase(), day = seoulDay(now());
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, { best: {}, today: 0, cap: RINGS.DAY_ARCL, master: false, day });
      const d = await getDocs([`worldRingsProg/${w}`, `worldRingsDay/${w}_${day}`]), p = d[`worldRingsProg/${w}`] || {};
      return json(200, { best: p.best || {}, moves: p.moves || {}, master: !!p.master, legend: !!p.legend, streak: p.streak || null, today: (d[`worldRingsDay/${w}_${day}`] || {}).n || 0, cap: RINGS.DAY_ARCL, day }, "no-store");
    },
    async handle(b) {
      if (b.action === "world-rings-start") return start(b);
      if (b.action === "world-rings-end") return end(b);
      if (b.action === "world-rings-ta-start") return taStart(b);
      if (b.action === "world-rings-ta-end") return taEnd(b);
      return null;
    },
  };
}
