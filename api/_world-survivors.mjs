// api/_world-survivors.mjs — SURVIVORS ARENA (world-survivors.js), the Game Village's 12-minute survival game.
//
//   POST { action: "world-surv-start", …signature, diff }                                   → { runId, startedAt, diff }
//        one active run a wallet: a new start replaces the last (its end is then refused)
//   POST { action: "world-surv-end", …signature, runId, secs, kills, bosses, clear, ms }    → { credited, runsLeft, why }
//        checked on the server's clock: the run can't be longer than it has been going, no more than MAX_KPS knock-outs a
//        second, a boss only once its minute has come, "clear" only at 12:00. The reward is computed here (reward(), the
//        same as world-survivors-data.js; never the client's number): minutes, knock-outs, and — for a run that reached
//        12:00 — the bosses and the survival bonus, times the difficulty, capped by it. The first DAY_RUNS paying runs of
//        a day (the Seoul date) pay, at most DAY_ARCL of this game's ARCL a day, through the shop's credit (inside its
//        daily cap). ARCL kind "surv".
//   GET  ?world=surv&wallet=…                                                               → { today, cap, runsLeft }
//
// Firestore: worldSurvRun/<wallet> · worldSurvEnd/<runId> (once) · worldSurvSlot/<wallet>_<day>_<1–3> (a paid run)
//            worldSurvDay/<wallet>_<day> { n: ARCL today }
// All of it is progress, so each fresh start (epoch) begins empty: none of these is in _world-phase.mjs's KEEP.
export const SURV = {
  RUN_S: 720, BOSS_AT: [180, 360, 540, 720], DAY_RUNS: 3, DAY_ARCL: 10000, MAX_KPS: 6,
  DIFF: { easy: { k: 0.7, cap: 2100 }, normal: { k: 1, cap: 3000 }, hard: { k: 1.5, cap: 5000 } },
};
const RUN_TTL = 45 * 60e3;
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
export function survReward({ secs, kills, bosses, diff, clear }) {
  const d = SURV.DIFF[diff] || SURV.DIFF.normal, mins = Math.floor(Math.max(0, secs) / 60);
  const base = Math.min(1200, mins * 100) + Math.min(800, Math.floor(Math.max(0, kills) / 10) * 20) + (clear ? Math.max(0, bosses) * 300 + 800 : 0);
  return Math.min(d.cap, Math.floor(base * d.k));
}

/// deps: { getDocs, setDoc, commit, json, now, signer(b), credit(wallet, kind, n) → credited, randomId? }
export function makeSurvivors(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];

  async function start(b) {
    const s = signer(b); if (s.err) return s.err;
    const diff = SURV.DIFF[b.diff] ? b.diff : "normal", runId = rid(), startedAt = now();
    await setDoc(`worldSurvRun/${s.wallet}`, { runId, startedAt, diff });
    return json(200, { runId, startedAt, diff });
  }

  async function end(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), secs = Number(b.secs), kills = Number(b.kills), bosses = Number(b.bosses), msIn = Number(b.ms);
    const run = await one(`worldSurvRun/${w}`);
    if (!run || run.runId !== String(b.runId || "") || t - run.startedAt > RUN_TTL) return json(409, { error: "that run isn't active" });
    if (![secs, kills, bosses, msIn].every(Number.isFinite) || [secs, kills, bosses].some((n) => n < 0 || n !== Math.floor(n)) || secs > 3600 || bosses > 4) return json(400, { error: "bad numbers" });
    const ms = t - run.startedAt; // the server's clock, not the game's
    if (secs * 1000 > ms + 5000 || msIn > ms + 5000) return json(400, { error: "the run is longer than it has been going" });
    if (kills > secs * SURV.MAX_KPS + 30) return json(400, { error: "more knock-outs than could come" });
    if (bosses > SURV.BOSS_AT.filter((x) => secs >= x).length) return json(400, { error: "a boss before its time" });
    const clear = b.clear === true && secs >= SURV.RUN_S;
    // the end counts once (a repeated request is refused, a lost reply can't be paid twice)
    if (!(await commit([{ create: `worldSurvEnd/${run.runId}`, data: { at: t, wallet: w, secs, kills, bosses, clear, diff: run.diff } }])).ok) return json(409, { error: "that run has ended" });
    const amt0 = survReward({ secs, kills, bosses, diff: run.diff, clear }), day = seoulDay(t);
    if (amt0 <= 0) return json(200, { ok: true, credited: 0, runsLeft: await left(w, day), why: "none" });
    // a paying run takes one of the day's slots (create-only markers, so two ends at once can't both take the last)
    let slot = 0; for (let k = 1; k <= SURV.DAY_RUNS && !slot; k++) if ((await commit([{ create: `worldSurvSlot/${w}_${day}_${k}`, data: { at: t, runId: run.runId } }])).ok) slot = k;
    if (!slot) return json(200, { ok: true, credited: 0, runsLeft: 0, why: "runs" });
    const dk = `worldSurvDay/${w}_${day}`, got = ((await one(dk)) || {}).n || 0, amt = Math.max(0, Math.min(amt0, SURV.DAY_ARCL - got));
    let credited = 0;
    if (amt > 0 && deps.credit) { credited = await deps.credit(w, "surv", amt); if (credited > 0) await commit([{ inc: dk, fields: { n: credited } }]); }
    return json(200, { ok: true, credited, runsLeft: SURV.DAY_RUNS - slot, why: credited > 0 ? "" : "cap", earned: amt0 });
  }
  async function left(w, day) { const d = await getDocs([1, 2, 3].map((k) => `worldSurvSlot/${w}_${day}_${k}`)); return SURV.DAY_RUNS - Object.values(d).filter(Boolean).length; }

  return {
    async read(v, url) {
      if (v !== "surv") return null;
      const w = String((url && url.searchParams && url.searchParams.get("wallet")) || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, { today: 0, cap: SURV.DAY_ARCL, runsLeft: SURV.DAY_RUNS });
      const day = seoulDay(now()), today = ((await one(`worldSurvDay/${w}_${day}`)) || {}).n || 0;
      return json(200, { today, cap: SURV.DAY_ARCL, runsLeft: await left(w, day) }, "no-store");
    },
    async handle(b) {
      if (b.action === "world-surv-start") return start(b);
      if (b.action === "world-surv-end") return end(b);
      return null;
    },
  };
}
