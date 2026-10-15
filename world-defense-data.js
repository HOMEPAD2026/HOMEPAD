// world-defense-data.js — AC Defense's rules, with no DOM and no three.js (so the tests and the game read the same
// numbers): the arena, the towers, the waves out of a seed, scrap, and the plausibility check and ARCL reward the
// server repeats (api/_world-defense.mjs keeps a copy of waveCount and the constants it needs; tests/world/defense.test.mjs
// proves the two agree).
export const ARENA = { r: 10.5, padR: 6.9, pads: 8, gateR: 10.2, coreR: 4.6 }; // the plaza's radius is 11; the Core is the fountain
export const BUILD_S = 30, BREAK_S = 15, BOSS_EVERY = 5, MAX_TOWERS = 8, CORE_HP = 40, START_SCRAP = 140, MIN_WAVE_S = 20;
export const CAP = { coarse: 14, desk: 24 }; // scammers alive at once (a phone, a desktop)
// towers: cost in scrap (never ARCL), then per level (1–3) its numbers. Upgrades cost UP[lvl-1] × cost; a sale gives half of everything paid.
export const TOWERS = {
  shock: { name: "Shock", cost: 60, color: 0xb48cff, range: 8.2, dmg: [18, 28, 42], cd: [0.9, 0.8, 0.7], hops: [2, 3, 4], note: "Chain zap" },
  frost: { name: "Frost", cost: 45, color: 0x8fe6ff, range: 5.4, dmg: [2, 4, 7], cd: [1, 1, 1], r: [5.4, 6.2, 7], note: "Slow aura" },
  flame: { name: "Flame", cost: 55, color: 0xff7a2a, range: 6.4, dmg: [5, 8, 13], cd: [1.3, 1.2, 1.1], n: [1, 2, 3], note: "Burn over time" },
  barrier: { name: "Barrier", cost: 30, color: 0x35d8d0, range: 0, hp: [120, 240, 420], note: "Blocks a lane" },
};
export const UP = [0.8, 1.4];
export const TOWER_IDS = Object.keys(TOWERS);
export const upCost = (id, lvl) => (lvl >= 3 ? 0 : Math.round(TOWERS[id].cost * UP[lvl - 1]));
export const paid = (id, lvl) => TOWERS[id].cost + (lvl >= 2 ? upCost(id, 1) : 0) + (lvl >= 3 ? upCost(id, 2) : 0);
export const refund = (id, lvl) => Math.floor(paid(id, lvl) / 2);
// where a pad stands (angle from +x), the gates at the plaza's edge in between (two pads a lane on four of them)
export const padAt = (i) => { const a = (i / ARENA.pads) * Math.PI * 2; return { x: Math.cos(a) * ARENA.padR, z: Math.sin(a) * ARENA.padR, a }; };
export const gateAt = (i) => { const a = (Math.PI / 4) + (i * Math.PI) / 2; return { x: Math.cos(a) * ARENA.gateR, z: Math.sin(a) * ARENA.gateR, a }; };

/// a small seeded random stream (mulberry32): the same seed is the same run
export const rng = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const waveRng = (seed, w) => rng(((seed >>> 0) ^ Math.imul(w, 0x9e3779b1)) >>> 0);
/// how many scammers wave w sends (the boss counts): the part the server repeats
// (a crowd to mow down: more scammers a wave, each one a little easier than you — see world-defense.js spawn)
export const waveCount = (seed, w) => 9 + Math.floor(w * 2.8) + Math.floor(waveRng(seed, w)() * 3) + (w % BOSS_EVERY === 0 ? 1 : 0);
export const isBoss = (w) => w > 0 && w % BOSS_EVERY === 0;
export const spawnedThrough = (seed, w) => { let n = 0; for (let i = 1; i <= w; i++) n += waveCount(seed, i); return n; };
/// the wave's scammers: { t: type, g: gate (0–3), at: seconds after the wave starts, boss } plus its stats (they grow with w)
export function waveOf(seed, w) {
  const r = waveRng(seed, w); r(); // the first draw is waveCount's jitter
  const total = waveCount(seed, w), boss = isBoss(w), n = total - (boss ? 1 : 0), gap = Math.min(1.3, 24 / Math.max(1, n));
  const list = [];
  for (let i = 0; i < n; i++) { const k = r(); list.push({ t: k < 0.4 ? "spam" : k < 0.75 ? "drop" : "rug", g: Math.floor(r() * 4), at: Math.round((i * gap + r() * 0.6) * 10) / 10, boss: false }); }
  if (boss) list.push({ t: "drop", g: Math.floor(r() * 4), at: Math.round(n * gap * 0.5 * 10) / 10, boss: true });
  list.sort((a, b) => a.at - b.at);
  const hp = Math.round((28 + w * 9) * (1 + w * 0.04));
  return { w, n: total, boss, list, hp, bossHp: hp * 12, spd: Math.min(0.9, 0.42 + w * 0.02), def: Math.floor(w * 0.5), coreDmg: 1, bossDmg: 4 };
}
/// scrap: the run starts with START_SCRAP; a knock-out and a cleared wave add more
export const killScrap = (w) => Math.round(3 + w * 0.4);
export const clearScrap = (w) => 20 + w * 4;

// ---- the end of a run: what the server checks, and what it pays ----
export const PER_WAVE = 5, DAY_ARCL = 150, DAY_RUNS = 3;
// A future weekly token pool would plug in at the server's run end (api/_world-defense.mjs): the weekly board's top
// wallets could share a pool. Nothing of that is built (no audited claim contract); today a run pays ARCL only.
export const arclFor = (wave, earnedToday = 0) => Math.max(0, Math.min(PER_WAVE * Math.max(0, Math.floor(wave)), DAY_ARCL - Math.max(0, earnedToday)));
/// a run that says it cleared `wave` waves with `kills` knock-outs in `ms` (the server's own clock): possible?
export function plausible(seed, { wave, kills, ms }) {
  if (![wave, kills, ms].every(Number.isFinite) || wave < 0 || kills < 0 || ms < 0 || wave !== Math.floor(wave) || kills !== Math.floor(kills)) return { ok: false, why: "bad numbers" };
  if (wave > 200) return { ok: false, why: "too many waves" };
  if (ms < wave * MIN_WAVE_S * 1000) return { ok: false, why: "too fast" };
  if (kills > spawnedThrough(seed, wave + 1)) return { ok: false, why: "more knock-outs than scammers sent" };
  if (kills < spawnedThrough(seed, wave)) return { ok: false, why: "a cleared wave leaves none standing" };
  return { ok: true };
}
