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
//   GET  ?world=surv-top                                                                    → { week, top: [{ w, name, secs, kills }] }
//        the week's longest runs (then the most knock-outs), one line a wallet (worldStats/survWeek_<isoWeek>); no prizes yet
//
// Firestore: worldSurvRun/<wallet> · worldSurvEnd/<runId> (once) · worldSurvSlot/<wallet>_<day>_<1–3> (a paid run)
//            worldSurvDay/<wallet>_<day> { n: ARCL today } · worldSurvBest/<week>_<wallet> · worldStats/survWeek_<week>
// All of it is progress, so each fresh start (epoch) begins empty: none of these is in _world-phase.mjs's KEEP.
export const SURV = {
  RUN_S: 720, BOSS_AT: [180, 360, 540, 720], DAY_RUNS: 3, DAY_ARCL: 10000, MAX_KPS: 10,
  DIFF: { easy: { k: 0.7, cap: 2100 }, normal: { k: 1, cap: 3000 }, hard: { k: 1.5, cap: 5000 } },
};
// b-svx: what carries over between runs — arena coins (not ARCL: never paid out, never bought) for permanent
// upgrades, achievements (coins once + a title), the evolutions found, and the daily challenge (the same twist and
// card luck for everyone on a Seoul day, its own board, coins only: a challenge run pays no ARCL). A copy of
// world-survivors-data.js META / coinsOf / COIN_DAY / ACH / DAILY_MODS / DAILY_BONUS / dailyOf (tests/world/surv.test.mjs checks).
//   POST { action: "world-surv-up", …signature, key }  → { meta }        (one level of a permanent upgrade, for coins)
//   GET  ?world=surv-daily                             → { day, mod, top } (today's challenge and its board)
// Firestore: worldSurvMeta/<wallet> { coins, up, ach, evo, bosses, hardClears, cday, cn, dday } · worldStats/survDaily_<day>
export const META = { hp: { max: 5, cost: [40, 80, 140, 220, 320] }, atk: { max: 5, cost: [50, 100, 170, 260, 380] }, spd: { max: 5, cost: [40, 80, 140, 220, 320] }, luck: { max: 3, cost: [80, 180, 320] }, magnet: { max: 3, cost: [40, 90, 160] }, reroll: { max: 2, cost: [120, 260] } };
export const COIN_DAY = 600, DAILY_BONUS = 50;
export const coinsOf = ({ secs, kills, bosses, clear, daily }) => Math.floor(Math.min(150, Math.floor(Math.max(0, secs) / 20) + Math.floor(Math.max(0, kills) / 40) + Math.max(0, bosses) * 10 + (clear ? 30 : 0)) * (daily ? 1.5 : 1));
export const ACH = [{ id: "first", coins: 100 }, { id: "boss", coins: 80 }, { id: "k1000", coins: 80 }, { id: "evo", coins: 80 }, { id: "hard", coins: 200 }, { id: "legend", coins: 400 }];
export const DAILY_MODS = ["swarm", "glass", "speed", "elite", "lucky"];
const EVO_IDS = ["thunder", "star", "inferno", "zero", "legion", "eclipse"];
const dayHash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
export const dailyOf = (t) => { const day = new Date(t + 9 * 3600e3).toISOString().slice(0, 10), seed = dayHash("surv:" + day); return { day, seed, mod: DAILY_MODS[seed % DAILY_MODS.length] }; };
const RUN_TTL = 45 * 60e3, TOP_N = 20;
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
export function survReward({ secs, kills, bosses, diff, clear }) {
  const d = SURV.DIFF[diff] || SURV.DIFF.normal, mins = Math.floor(Math.max(0, secs) / 60);
  const base = Math.min(1200, mins * 100) + Math.min(800, Math.floor(Math.max(0, kills) / 10) * 20) + (clear ? Math.max(0, bosses) * 300 + 800 : 0);
  return Math.min(d.cap, Math.floor(base * d.k));
}

/// deps: { getDocs, setDoc, commit, json, now, signer(b), credit(wallet, kind, n) → credited, isoWeek(t)?, randomId? }
export function makeSurvivors(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];

  async function start(b) {
    const s = signer(b); if (s.err) return s.err;
    const daily = b.daily === true, diff = daily ? "normal" : SURV.DIFF[b.diff] ? b.diff : "normal", runId = rid(), startedAt = now(), dd = daily ? dailyOf(startedAt) : null;
    await setDoc(`worldSurvRun/${s.wallet}`, { runId, startedAt, diff, ...(dd ? { daily: dd.day } : {}) });
    return json(200, { runId, startedAt, diff, ...(dd ? { daily: dd.day, mod: dd.mod, seed: dd.seed } : {}) });
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
    if (!(await commit([{ create: `worldSurvEnd/${run.runId}`, data: { at: t, wallet: w, secs, kills, bosses, clear, diff: run.diff, hero: String(b.hero || "").slice(0, 16), lv: Math.max(0, Math.min(200, Math.floor(Number(b.lv) || 0))), how: /^(dead|win|time|quit)$/.test(String(b.how)) ? b.how : "" } }])).ok) return json(409, { error: "that run has ended" });
    const day = seoulDay(t), M = await metaEnd(w, { secs, kills, bosses, clear, diff: run.diff, daily: !!run.daily, evo: b.evo, day }).catch(() => ({}));
    if (run.daily) { const dRank = run.daily === day ? await dailyBoard(w, day, secs, kills).catch(() => null) : null; return json(200, { ok: true, credited: 0, runsLeft: await left(w, day), why: "daily", dailyRank: dRank, ...M }); }
    const amt0 = survReward({ secs, kills, bosses, diff: run.diff, clear });
    const rank = await board(w, secs, kills).catch(() => null);
    if (amt0 <= 0) return json(200, { ok: true, credited: 0, runsLeft: await left(w, day), why: "none", rank, ...M });
    // a paying run takes one of the day's slots (create-only markers, so two ends at once can't both take the last)
    let slot = 0; for (let k = 1; k <= SURV.DAY_RUNS && !slot; k++) if ((await commit([{ create: `worldSurvSlot/${w}_${day}_${k}`, data: { at: t, runId: run.runId } }])).ok) slot = k;
    if (!slot) return json(200, { ok: true, credited: 0, runsLeft: 0, why: "runs", rank, ...M });
    const dk = `worldSurvDay/${w}_${day}`, got = ((await one(dk)) || {}).n || 0, amt = Math.max(0, Math.min(amt0, SURV.DAY_ARCL - got));
    let credited = 0;
    if (amt > 0 && deps.credit) { credited = await deps.credit(w, "surv", amt); if (credited > 0) await commit([{ inc: dk, fields: { n: credited } }]); }
    return json(200, { ok: true, credited, runsLeft: SURV.DAY_RUNS - slot, why: credited > 0 ? "" : "cap", earned: amt0, rank, ...M });
  }
  // the run's coins (inside the day's COIN_DAY), the evolutions it found, the achievements it reached
  const metaOf = (m) => ({ coins: 0, up: {}, ach: {}, evo: {}, bosses: 0, hardClears: 0, cday: "", cn: 0, dday: "", ...(m || {}) });
  const metaView = (m) => ({ coins: m.coins, up: m.up, ach: Object.keys(m.ach), evo: Object.keys(m.evo), dailyDone: m.dday === seoulDay(now()) });
  async function metaEnd(w, r) {
    const k = `worldSurvMeta/${w}`, m = metaOf(await one(k));
    if (m.cday !== r.day) { m.cday = r.day; m.cn = 0; }
    let got = Math.max(0, Math.min(coinsOf(r), COIN_DAY - m.cn)); m.cn += got;
    if (r.daily && m.dday !== r.day) { m.dday = r.day; got += DAILY_BONUS; }
    for (const e of (Array.isArray(r.evo) ? r.evo : []).slice(0, 6)) if (EVO_IDS.includes(e)) m.evo[e] = 1;
    m.bosses += r.bosses; if (r.clear && r.diff === "hard") m.hardClears++;
    const reach = { first: r.clear, boss: m.bosses >= 10, k1000: r.kills >= 1000, evo: Object.keys(m.evo).length >= 3, hard: r.clear && r.diff === "hard", legend: m.hardClears >= 5 }, fresh = [];
    for (const a of ACH) if (reach[a.id] && !m.ach[a.id]) { m.ach[a.id] = now(); got += a.coins; fresh.push(a.id); }
    m.coins += got; await setDoc(k, m);
    return { coinsGot: got, newAch: fresh, meta: metaView(m) };
  }
  async function up(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, key = String(b.key || ""), def = META[key]; if (!def) return json(400, { error: "no such upgrade" });
    const k = `worldSurvMeta/${w}`, m = metaOf(await one(k)), lv = m.up[key] || 0; if (lv >= def.max) return json(409, { error: "that upgrade is at its top" });
    const cost = def.cost[lv]; if (m.coins < cost) return json(400, { error: "not enough arena coins", coins: m.coins, cost });
    if (!(await commit([{ create: `worldSurvUp/${w}_${key}_${lv + 1}`, data: { at: now(), cost } }])).ok) return json(409, { error: "already bought" });
    m.coins -= cost; m.up[key] = lv + 1; await setDoc(k, m);
    return json(200, { ok: true, meta: metaView(m) });
  }
  async function dailyBoard(w, day, secs, kills) {
    const key = `worldStats/survDaily_${day}`, cur = await one(key); let top = (cur && cur.top) || [];
    const was = top.find((x) => x.id === w); if (!was || secs > was.secs || (secs === was.secs && kills > was.kills)) {
      const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
      top = [{ w: short(w), id: w, secs, kills, name }, ...top.filter((x) => x.id !== w)].sort((a, b) => b.secs - a.secs || b.kills - a.kills).slice(0, TOP_N); await setDoc(key, { top });
    }
    const i = top.findIndex((x) => x.id === w); return i < 0 ? null : i + 1;
  }
  const week = () => (deps.isoWeek ? deps.isoWeek(now()) : seoulDay(now()).slice(0, 7));
  /// the week's board: your best run (longest, then most knock-outs) and the top TOP_N; returns your place (or null)
  async function board(w, secs, kills) {
    const wk = week(), bk = `worldSurvBest/${wk}_${w}`, key = `worldStats/survWeek_${wk}`, [mine, cur] = await Promise.all([one(bk), one(key)]);
    const was = mine || { secs: -1, kills: 0 }, better = secs > was.secs || (secs === was.secs && kills > was.kills), best = better ? { secs, kills } : was;
    if (better) await setDoc(bk, best);
    let top = (cur && cur.top) || [];
    if (better) {
      const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
      top = [{ w: short(w), id: w, secs: best.secs, kills: best.kills, name }, ...top.filter((x) => x.id !== w)].sort((a, b) => b.secs - a.secs || b.kills - a.kills).slice(0, TOP_N);
      await setDoc(key, { top });
    }
    const i = top.findIndex((x) => x.id === w); return i < 0 ? null : i + 1;
  }
  async function left(w, day) { const d = await getDocs([1, 2, 3].map((k) => `worldSurvSlot/${w}_${day}_${k}`)); return SURV.DAY_RUNS - Object.values(d).filter(Boolean).length; }

  return {
    async read(v, url) {
      if (v === "surv-top") { const wk = week(), d = await one(`worldStats/survWeek_${wk}`); return json(200, { week: wk, top: ((d && d.top) || []).map(({ w, name, secs, kills }) => ({ w, name: name || "", secs, kills })) }, "public, max-age=30"); }
      if (v === "surv-daily") { const dd = dailyOf(now()), d = await one(`worldStats/survDaily_${dd.day}`); return json(200, { day: dd.day, mod: dd.mod, top: ((d && d.top) || []).map(({ w, name, secs, kills }) => ({ w, name: name || "", secs, kills })) }, "public, max-age=30"); }
      if (v !== "surv") return null;
      const w = String((url && url.searchParams && url.searchParams.get("wallet")) || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, { today: 0, cap: SURV.DAY_ARCL, runsLeft: SURV.DAY_RUNS });
      const day = seoulDay(now()), today = ((await one(`worldSurvDay/${w}_${day}`)) || {}).n || 0;
      return json(200, { today, cap: SURV.DAY_ARCL, runsLeft: await left(w, day), meta: metaView(metaOf(await one(`worldSurvMeta/${w}`))) }, "no-store");
    },
    async handle(b) {
      if (b.action === "world-surv-start") return start(b);
      if (b.action === "world-surv-end") return end(b);
      if (b.action === "world-surv-up") return up(b);
      return null;
    },
  };
}
