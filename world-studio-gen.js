// world-studio-gen.js — the page's copy of api/_world-studio-gen.mjs (keep them the same text below this line; tests/world/studio.test.mjs compares them)
// A game is a small set of numbers on a template, never code: the server checks it (clampSpec) and the page builds the
// same level from it (genLevel, seeded), so a game plays the same for everyone and a score can be checked against what
// the level holds. The page's copy is world-studio-gen.js (the same text: tests/world/studio.test.mjs compares them).
//   runner   three lanes, run to the finish: switch lanes past walls, jump the gaps, slide under the lasers, grab coins
//   dash     (Studio 2) the same lanes, no finish: the speed keeps rising until your hearts run out — how far can you go?
//   arena    (Studio 2) a round arena seen from above: drones come at you from the edge, dodge them, grab coins, last the time
//   (puzzle · defense: the next templates, listed as coming)
// Each template reads the same fields its own way (KNOBS: the editor's labels); genLevel(spec).len and .coins are the most
// a run can show (metres, or for the arena 20 a second survived), which the server holds a score to.
export const TEMPLATES = {
  runner: { name: "Sky Runner", open: true },
  dash: { name: "Infinity Dash", open: true },
  arena: { name: "Arena Survival", open: true },
  puzzle: { name: "Ring Puzzle", open: false },
  defense: { name: "Tower Defense", open: false },
};
export const KNOBS = {
  runner: { speed: "Speed", coins: "Coins", walls: "Walls", gaps: "Gaps to jump", lasers: "Lasers to slide under", len: "Length" },
  dash: { speed: "Starting speed", coins: "Coins", walls: "Walls", gaps: "Gaps to jump", lasers: "Lasers to slide under", len: "How fast it speeds up" },
  arena: { speed: "Drone speed", coins: "Coins", walls: "Drones", gaps: "Laser sweeps", lasers: "Big drones", len: "Survive for" },
};
export const DASH_MAX = 240; // (seconds: the dash's track is built this long; nobody's hearts last that far)
export const THEMES = {
  neon: { name: "Neon City", sky: 0x0b1430, fog: 0x14244a, track: 0x18233a, edge: 0x5fd3ff, wall: 0xb48cff, prop: 0x5fd3ff },
  jungle: { name: "Jungle", sky: 0x9fd8c0, fog: 0xb6e3cc, track: 0x5b4a36, edge: 0x7cf5c8, wall: 0x3f7a3a, prop: 0x2f8a46 },
  ice: { name: "Ice Peaks", sky: 0xcfe8ff, fog: 0xdcefff, track: 0xa8c8e8, edge: 0xffffff, wall: 0x7fc6ff, prop: 0xe8f6ff },
  lava: { name: "Lava Core", sky: 0x2a0d0a, fog: 0x4a1a10, track: 0x2b2224, edge: 0xff7a2e, wall: 0xff4d2e, prop: 0xffa13a },
  candy: { name: "Candy Sky", sky: 0xffd6ec, fog: 0xffe3f2, track: 0xfff0f8, edge: 0xff6fae, wall: 0xffb02e, prop: 0x9b6bff },
};
export const LENS = [30, 45, 60, 90];
export const LANES = [-2.2, 0, 2.2];
const int = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
/// a spec made safe: every field in range, unknown ones dropped. → { tpl, title, theme, speed, len, coins, walls, gaps, lasers, seed }
export function clampSpec(s = {}) {
  const title = String(s.title || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24) || "My Sky Run";
  return {
    tpl: TEMPLATES[s.tpl] && TEMPLATES[s.tpl].open ? s.tpl : "runner", title: title === "My Sky Run" && s.tpl === "arena" ? "My Arena" : title === "My Sky Run" && s.tpl === "dash" ? "My Infinity Dash" : title,
    theme: THEMES[s.theme] ? s.theme : "neon",
    speed: int(s.speed, 1, 5, 3), len: LENS.includes(Number(s.len)) ? Number(s.len) : 45,
    coins: int(s.coins, 0, 5, 3), walls: int(s.walls, 0, 5, 2), gaps: int(s.gaps, 0, 3, 1), lasers: int(s.lasers, 0, 3, 1),
    seed: int(s.seed, 1, 999999, 1),
  };
}
export const speedOf = (spec) => 9 + spec.speed * 2.2; // metres a second
/// the dash's speed after t seconds (len picks how fast it climbs: 30 → slow … 90 → fast)
export const dashSpeed = (spec, t) => speedOf(spec) * (1 + t / (150 - spec.len));
/// the level a spec makes: rows along the track (z, metres from the start), each a wall in a lane, a gap across, a
/// laser across (slide) or coins in a lane. → { len (metres), rows: [{ z, k: "wall"|"gap"|"laser"|"coin", lane? }], coins }
export function genLevel(spec0) {
  const spec = clampSpec(spec0);
  if (spec.tpl === "arena") return genArena(spec);
  const v = speedOf(spec), len = spec.tpl === "dash" ? Math.round(Array.from({ length: DASH_MAX }, (_, t) => dashSpeed(spec, t + 0.5)).reduce((a, b) => a + b, 0)) : Math.round(v * spec.len);
  let s = spec.seed >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rows = []; let coins = 0, z = 26; const step = Math.max(9, 22 - spec.walls * 2 - spec.gaps - spec.lasers) * (0.8 + spec.speed * 0.08);
  const W = spec.walls, G = spec.gaps, L = spec.lasers, tot = W * 3 + G * 2 + L * 2 + 0.001;
  while (z < len - 30) {
    const r = rnd() * tot;
    if (r < W * 3) { const free = Math.floor(rnd() * 3); for (let l = 0; l < 3; l++) if (l !== free && (rnd() < 0.55 || W >= 4)) rows.push({ z, k: "wall", lane: l }); if (!rows.some((x) => x.z === z)) rows.push({ z, k: "wall", lane: (free + 1) % 3 }); }
    else if (r < W * 3 + G * 2) rows.push({ z, k: "gap" });
    else if (r < tot - 0.001) rows.push({ z, k: "laser" });
    // coins between this row and the next, in one lane
    const n = Math.round(spec.coins * 1.2), lane = Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) { rows.push({ z: z + step * ((i + 1) / (n + 1)), k: "coin", lane }); coins++; }
    z += step * (0.8 + rnd() * 0.5);
  }
  return { len, rows, coins, v };
}
/// the arena: who comes when — drones from the edge (k "d", a big one "D"), laser sweeps ("L", across the middle) and
/// coins that pop up on the floor. → { len: 20 × seconds, secs, waves: [{ t, k, a }], coinsAt: [{ t, x, z }], coins, R }
export const ARENA_R = 14;
export function genArena(spec) {
  let s = spec.seed >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const secs = spec.len, waves = [], coinsAt = [];
  for (let t = 2; t < secs; t += Math.max(0.35, 2.2 - spec.walls * 0.32) * (1 - t / secs / 2.4)) waves.push({ t: +t.toFixed(2), k: "d", a: +(rnd() * 6.283).toFixed(3) });
  for (let i = 0; i < spec.lasers * Math.ceil(secs / 30); i++) waves.push({ t: +(6 + rnd() * (secs - 8)).toFixed(2), k: "D", a: +(rnd() * 6.283).toFixed(3) });
  for (let i = 0; i < spec.gaps * Math.ceil(secs / 20); i++) waves.push({ t: +(5 + rnd() * (secs - 7)).toFixed(2), k: "L", a: +(rnd() * 3.1416).toFixed(3) });
  waves.sort((p, q) => p.t - q.t);
  const nC = Math.round(spec.coins * secs / 6);
  for (let i = 0; i < nC; i++) { const a = rnd() * 6.283, r = 2 + rnd() * (ARENA_R - 4); coinsAt.push({ t: +((i + 0.5) * (secs / Math.max(1, nC))).toFixed(2), x: +(Math.cos(a) * r).toFixed(2), z: +(Math.sin(a) * r).toFixed(2) }); }
  return { len: secs * 20, secs, waves, coinsAt, coins: nC, R: ARENA_R };
}
/// a run's score: coins and how far (a finish counts the whole track) — the server checks it can't beat the level
export const scoreOf = (coins, dist, done) => Math.max(0, Math.round(coins) * 10 + Math.round(dist / 5) + (done ? 100 : 0));
/// Studio 3: one-tap difficulty for the editor's third step (the settings a preset sets; the rest stay as they are)
export const PRESETS = {
  easy: { speed: 2, coins: 4, walls: 1, gaps: 0, lasers: 0 },
  normal: { speed: 3, coins: 3, walls: 2, gaps: 1, lasers: 1 },
  hard: { speed: 4, coins: 3, walls: 4, gaps: 2, lasers: 2 },
  extreme: { speed: 5, coins: 2, walls: 5, gaps: 3, lasers: 3 },
};
/// Studio 3: how hard a level is, from 40 bots of rising skill playing it on paper (seeded: the same answer on the page and
/// the server). → { clear (0–1, the share who finish — the dash: who last 45 s), stars (1 easy … 5 brutal), fails: 10
/// buckets of where along the level the runs ended, why: the obstacle kind that ended the most ("wall"|"gap"|"laser"|"d"|"D"|"L") }
export function estimate(spec0) {
  const spec = clampSpec(spec0), L = genLevel(spec), N = 40, fails = new Array(10).fill(0), why = {};
  let s = (spec.seed * 2654435761) >>> 0 || 7; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let clears = 0;
  if (spec.tpl === "arena") {
    const dS = 2.6 + spec.speed * 0.9;
    for (let b = 0; b < N; b++) {
      const sk = 0.3 + (0.7 * b) / (N - 1); let hearts = 3, end = -1, recent = [];
      for (const w of L.waves) { recent = recent.filter((t) => w.t - t < 3); recent.push(w.t);
        const p = w.k === "L" ? 0.09 * (1.25 - sk) : (0.012 + (dS - 3) * 0.008 + recent.length * 0.006) * (w.k === "D" ? 1.5 : 1) * (1.3 - sk);
        if (rnd() < Math.min(0.9, p)) { hearts--; if (hearts <= 0) { end = w.t / L.secs; why[w.k] = (why[w.k] || 0) + 1; break; } } }
      if (end < 0) clears++; else fails[Math.min(9, Math.floor(end * 10))]++;
    }
  } else {
    const dash = spec.tpl === "dash", goal = dash ? Array.from({ length: 45 }, (_, t) => dashSpeed(spec, t + 0.5)).reduce((a, x) => a + x, 0) : L.len;
    const ev = []; for (const r of L.rows) { if (r.k === "coin" || r.z > goal) continue; const last = ev[ev.length - 1]; if (last && last.z === r.z) continue; ev.push({ z: r.z, k: r.k }); }
    const vAt = (z) => { if (!dash) return speedOf(spec); let d = 0, t = 0; while (d < z && t < 600) { d += dashSpeed(spec, t + 0.5); t++; } return dashSpeed(spec, t); };
    const vs = ev.map((e) => vAt(e.z));
    for (let b = 0; b < N; b++) {
      const sk = 0.3 + (0.7 * b) / (N - 1), react = 0.55 - 0.3 * sk; let hearts = 3, end = -1, pz = 0, pk = "";
      for (let i = 0; i < ev.length; i++) { const e = ev[i], dt = (e.z - pz) / vs[i], need = react + 0.15 + (pk && pk !== e.k ? 0.15 : 0);
        const p = Math.min(0.95, Math.max(0, ((need - dt) / need) * 1.2) + 0.02 * (1 - sk));
        if (rnd() < p) { hearts--; if (hearts <= 0) { end = e.z / goal; why[e.k] = (why[e.k] || 0) + 1; break; } }
        pz = e.z; pk = e.k; }
      if (end < 0) clears++; else fails[Math.min(9, Math.floor(end * 10))]++;
    }
  }
  const clear = clears / N, stars = clear > 0.8 ? 1 : clear > 0.6 ? 2 : clear > 0.4 ? 3 : clear > 0.2 ? 4 : 5;
  const top = Object.entries(why).sort((a, b) => b[1] - a[1])[0];
  return { clear: Math.round(clear * 100) / 100, stars, fails, why: top ? top[0] : "" };
}
