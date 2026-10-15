// api/_world-defense.mjs — AC Defense (world-defense.js): a tower-defence game-in-game round the plaza fountain.
//
//   POST { action: "world-defense-start", …signature }                         → { runId, seed, startedAt }
//        one active run a wallet: a new start replaces the last (its end is then refused). The seed decides every wave's
//        size (world-defense-data.js waveOf), so a run can be checked against it.
//   POST { action: "world-defense-end", …signature, runId, wave, kills, ms }   → { credited, runsLeft, best, rank, week }
//        wave = waves cleared. Checked on the server's clock: at least 20 s a wave cleared, kills no more than the
//        scammers sent through the wave after (and no fewer than through the last cleared one). Pays ARCL kind "defense"
//        (5 a wave cleared, 150 a day, for the first 3 runs of a day) through the shop's credit, inside its own daily cap.
//   GET  ?world=defense-top                                                    → { week, top: [{ w, id, n, kills, name }] }
//        the week's best wave, one line a wallet (worldStats/defenseWeek_<isoWeek>)
//
// Firestore: worldDefRun/<wallet> · worldDefEnd/<runId> (once) · worldDefSlot/<wallet>_<day>_<1–3> (a rewarded run)
//            worldDefDay/<wallet>_<day> { n: ARCL today } · worldDefBest/<week>_<wallet> · worldStats/defenseWeek_<week>
// All of it is progress, so each fresh start (epoch) begins empty: none of these is in _world-phase.mjs's KEEP.
// The numbers below are copies of world-defense-data.js (the server doesn't import the game's files); defense.test.mjs
// checks that they agree.
const BOSS_EVERY = 5, MIN_WAVE_S = 20, PER_WAVE = 5, DAY_ARCL = 150, DAY_RUNS = 3, TOP_N = 20, RUN_TTL = 6 * 3600e3;
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const rng = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const waveCount = (seed, w) => 9 + Math.floor(w * 2.8) + Math.floor(rng(((seed >>> 0) ^ Math.imul(w, 0x9e3779b1)) >>> 0)() * 3) + (w % BOSS_EVERY === 0 ? 1 : 0);
export const spawnedThrough = (seed, w) => { let n = 0; for (let i = 1; i <= w; i++) n += waveCount(seed, i); return n; };
export const DEFENSE = { BOSS_EVERY, MIN_WAVE_S, PER_WAVE, DAY_ARCL, DAY_RUNS };
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isoWeek(t), credit(wallet, kind, n) → credited, randomId? }
export function makeDefense(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];
  const week = () => deps.isoWeek(now());

  async function start(b) {
    const s = signer(b); if (s.err) return s.err;
    const runId = rid(), seed = parseInt(runId.slice(0, 8), 16) >>> 0, startedAt = now();
    await setDoc(`worldDefRun/${s.wallet}`, { runId, seed, startedAt });
    return json(200, { runId, seed, startedAt });
  }

  async function end(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), wave = Number(b.wave), kills = Number(b.kills), msIn = Number(b.ms);
    const run = await one(`worldDefRun/${w}`);
    if (!run || run.runId !== String(b.runId || "") || t - run.startedAt > RUN_TTL) return json(409, { error: "that run isn't active" });
    if (![wave, kills, msIn].every(Number.isFinite) || wave < 0 || kills < 0 || wave > 200 || wave !== Math.floor(wave) || kills !== Math.floor(kills)) return json(400, { error: "bad numbers" });
    const ms = t - run.startedAt; // the server's clock, not the game's
    if (msIn > ms + 5000) return json(400, { error: "the run is longer than it has been going" });
    if (ms < wave * MIN_WAVE_S * 1000) return json(400, { error: "too fast" });
    if (kills > spawnedThrough(run.seed, wave + 1)) return json(400, { error: "more knock-outs than scammers sent" });
    if (kills < spawnedThrough(run.seed, wave)) return json(400, { error: "a cleared wave leaves none standing" });
    // the end counts once (a repeated request is refused, a lost reply can't be paid twice)
    if (!(await commit([{ create: `worldDefEnd/${run.runId}`, data: { at: t, wallet: w, wave, kills } }])).ok) return json(409, { error: "that run has ended" });
    const day = seoulDay(t), wk = week(); let credited = 0, runsLeft = 0;
    if (wave >= 1) {
      // a rewarded run takes one of the day's three slots (create-only markers, so two ends at once can't both take the third)
      let slot = 0; for (let k = 1; k <= DAY_RUNS && !slot; k++) if ((await commit([{ create: `worldDefSlot/${w}_${day}_${k}`, data: { at: t, runId: run.runId } }])).ok) slot = k;
      runsLeft = slot ? DAY_RUNS - slot : 0;
      if (slot) {
        const dk = `worldDefDay/${w}_${day}`, got = ((await one(dk)) || {}).n || 0, amt = Math.max(0, Math.min(PER_WAVE * wave, DAY_ARCL - got));
        // (a future weekly token pool would be paid out from the board below, at the week's end; it isn't built)
        if (amt > 0 && deps.credit) { credited = await deps.credit(w, "defense", amt); if (credited > 0) await commit([{ inc: dk, fields: { n: credited } }]); }
      }
    }
    else { const d = await getDocs([1, 2, 3].map((k) => `worldDefSlot/${w}_${day}_${k}`)); runsLeft = DAY_RUNS - Object.values(d).filter(Boolean).length; } // (a run with no wave clears no slot)
    const board = wave >= 1 ? await weekBoard(w, wk, wave, kills) : { best: 0, rank: null };
    return json(200, { ok: true, wave, kills, credited, runsLeft, best: board.best, rank: board.rank, week: wk, capped: credited < PER_WAVE * wave });
  }

  /// the week's best wave: one line a wallet (the higher wave, then more knock-outs); the top TOP_N are kept
  async function weekBoard(w, wk, wave, kills) {
    const bk = `worldDefBest/${wk}_${w}`, key = `worldStats/defenseWeek_${wk}`, [mine, cur] = await Promise.all([one(bk), one(key)]);
    const was = mine || { wave: 0, kills: 0 }, better = wave > was.wave || (wave === was.wave && kills > was.kills), best = better ? { wave, kills } : was;
    if (better) await setDoc(bk, best);
    let top = (cur && cur.top) || [];
    if (better) {
      const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
      top = [{ w: short(w), id: w, n: best.wave, kills: best.kills, name }, ...top.filter((x) => x.id !== w)].sort((a, b) => b.n - a.n || b.kills - a.kills).slice(0, TOP_N);
      await setDoc(key, { top });
    }
    const i = top.findIndex((x) => x.id === w);
    return { best: best.wave, rank: i < 0 ? null : i + 1 };
  }

  return {
    async read(v) {
      if (v === "defense-top") {
        const wk = week(), d = await one(`worldStats/defenseWeek_${wk}`);
        return json(200, { week: wk, top: ((d && d.top) || []).map(({ w, n, kills, name }) => ({ w, n, kills, name: name || "" })) }, "public, max-age=30");
      }
      return null;
    },
    async handle(b) {
      if (b.action === "world-defense-start") return start(b);
      if (b.action === "world-defense-end") return end(b);
      return null;
    },
  };
}
