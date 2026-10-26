// world-studio-gen.js — the page's copy of api/_world-studio-gen.mjs (keep them the same text below this line; tests/world/studio.test.mjs compares them)
// A game is a small set of numbers on a template, never code: the server checks it (clampSpec) and the page builds the
// same level from it (genLevel, seeded), so a game plays the same for everyone and a score can be checked against what
// the level holds. The page's copy is world-studio-gen.js (the same text: tests/world/studio.test.mjs compares them).
//   runner   three lanes, run to the finish: switch lanes past walls, jump the gaps, slide under the lasers, grab coins
//   dash     (Studio 2) the same lanes, no finish: the speed keeps rising until your hearts run out — how far can you go?
//   arena    (Studio 2) a round arena seen from above: drones come at you from the edge, dodge them, grab coins, last the time
//   puzzle   (Studio 3) INFINITY RINGS' rings on a board of the maker's choosing: clear it in as few moves as you can — the
//            board is the rings engine's (a level id "s:<seed>:<size>:<pegs>:<locks>:<ice>:<energy>", puzzleId), solved for its par
//   climb    (S4d) a tower of platforms seen from the side: you bounce on your own, steer left and right (the sides wrap round),
//            reach the top — moving, breaking and spring platforms, spikes, coins and hearts on the way
//   defense  (S4d) a path across a grid from the portal to your crystal, pads beside it: build Bolt / Frost / Cannon towers
//            on the pads with the gold you're given and earn, stop the waves (grunts, runners, tanks) — 10 lives
// Each template reads the same fields its own way (KNOBS: the editor's labels); genLevel(spec).len and .coins are the most
// a run can show (metres, or for the arena 20 a second survived), which the server holds a score to.
export const TEMPLATES = {
  runner: { name: "Sky Runner", open: true },
  dash: { name: "Infinity Dash", open: true },
  arena: { name: "Arena Survival", open: true },
  puzzle: { name: "Ring Puzzle", open: true },
  climb: { name: "Sky Climb", open: true },
  defense: { name: "Tower Defense", open: true },
  rush: { name: "Coin Rush", open: true }, // (STU-D: the arena's engine — as many coins as you can in the time, a few drones in the way)
  jump: { name: "JUMP WORLD", open: true }, // (SB-2: a platformer on a grid, smart prefabs, a dragon boss)
  dungeon: { name: "Dungeon Crawl", open: true }, // (SB-3: JUMP WORLD's engine in a cave: chests, keys, doors)
  escape: { name: "Escape Room", open: true }, // (SB-3: keys, doors and switches against the clock)
  boss: { name: "Boss Battle", open: true }, // (SB-3: the finish opens when the boss falls)
  mining: { name: "Mine Rush", open: true }, // (SB-3: dig ores against the clock)
  survival: { name: "Monster Survival", open: true }, // (SB-3: SURVIVORS ARENA's engine on the maker's numbers)
  rhythm: { name: "Beat Maker", open: true }, // (SB-3: four lanes on a beat made on the page)
  race: { name: "Hover Race", open: true }, // (SB-3: rings, boost pads, orbs and pillars; laps against the clock)
};
export const KNOBS = {
  runner: { speed: "Speed", coins: "Coins", walls: "Walls", gaps: "Gaps to jump", lasers: "Lasers to slide under", len: "Length" },
  dash: { speed: "Starting speed", coins: "Coins", walls: "Walls", gaps: "Gaps to jump", lasers: "Lasers to slide under", len: "How fast it speeds up" },
  arena: { speed: "Drone speed", coins: "Coins", walls: "Drones", gaps: "Laser sweeps", lasers: "Big drones", len: "Survive for" },
  puzzle: { speed: "Rings", coins: "Pegs", walls: "Lock rings", gaps: "Ice rings", lasers: "Energy rings", len: "Hints" },
  defense: { speed: "Enemy speed", coins: "Starting gold", walls: "Enemies a wave", gaps: "Tanks", lasers: "Runners", len: "Waves" },
  rush: { speed: "Drone speed", coins: "Coins", walls: "Drones", gaps: "Laser sweeps", lasers: "Big drones", len: "Time" },
  climb: { speed: "Bounce", coins: "Coins", walls: "Moving platforms", gaps: "Breaking platforms", lasers: "Spikes", len: "Height" },
  jump: { speed: "Run speed", coins: "Coins", walls: "Enemies", gaps: "Pits", lasers: "Traps", len: "Length" },
  dungeon: { speed: "Run speed", coins: "Coins", walls: "Monsters", gaps: "Pits", lasers: "Traps", len: "Length" },
  escape: { speed: "Run speed", coins: "Coins", walls: "Guards", gaps: "Pits", lasers: "Traps", len: "Time limit" },
  boss: { speed: "Boss speed", coins: "Coins", walls: "Minions", gaps: "Pits", lasers: "Traps", len: "Warm-up" },
  mining: { speed: "Run speed", coins: "Ore", walls: "Cave bats", gaps: "Pits", lasers: "Traps", len: "Time limit" },
  survival: { speed: "Difficulty", coins: "Monster health", walls: "Crowd", gaps: "Elites", lasers: "Bosses", len: "Survive for" },
  rhythm: { speed: "Tempo", coins: "Forgiveness", walls: "Notes", gaps: "Chords", lasers: "Off-beats", len: "Song length" },
  race: { speed: "Board speed", coins: "Orbs", walls: "Pillars", gaps: "Boost pads", lasers: "Laps", len: "Track length" },
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
  const out = clampBase(s), lanes = out.tpl === "runner" || out.tpl === "dash", b = s.build && typeof s.build === "object" ? (lanes && Array.isArray(s.build.r) && !s.build.climb ? cleanBuild(s.build, out) : (out.tpl === "arena" || out.tpl === "rush") && Array.isArray(s.build.w) ? cleanArena(s.build, out) : out.tpl === "climb" && Array.isArray(s.build.r) && s.build.climb ? cleanClimb(s.build, out) : out.tpl === "defense" && s.build.td && Array.isArray(s.build.path) ? cleanDefense(s.build, out) : JUMPS[out.tpl] && s.build.jw && Array.isArray(s.build.c) ? cleanJump(s.build, out) : out.tpl === "rhythm" && s.build.bt && Array.isArray(s.build.n) ? cleanBeat(s.build, out) : out.tpl === "race" && s.build.rc && Array.isArray(s.build.r) ? (() => { const c = cleanRace(s.build); return c.r.length >= RACE.MIN ? c : null; })() : null) : null; // (a layout only for its own kind: a template change drops it)
  if (b) out.build = b;
  return out;
}
function clampBase(s) {
  const title = String(s.title || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24) || "My Sky Run";
  return {
    tpl: TEMPLATES[s.tpl] && TEMPLATES[s.tpl].open ? s.tpl : "runner", title: title === "My Sky Run" && s.tpl === "arena" ? "My Arena" : title === "My Sky Run" && s.tpl === "rush" ? "My Coin Rush" : title === "My Sky Run" && s.tpl === "dash" ? "My Infinity Dash" : title === "My Sky Run" && s.tpl === "puzzle" ? "My Ring Puzzle" : title === "My Sky Run" && s.tpl === "climb" ? "My Sky Climb" : title === "My Sky Run" && s.tpl === "defense" ? "My Tower Defense" : title === "My Sky Run" && (JUMPS[s.tpl] || s.tpl === "survival" || s.tpl === "rhythm" || s.tpl === "race") && TEMPLATES[s.tpl] ? "My " + TEMPLATES[s.tpl].name.replace(/^JUMP WORLD$/, "Jump World") : title,
    theme: THEMES[s.theme] ? s.theme : "neon",
    speed: int(s.speed, 1, 5, 3), len: LENS.includes(Number(s.len)) ? Number(s.len) : 45,
    coins: int(s.coins, 0, 5, 3), walls: int(s.walls, 0, 5, 2), gaps: int(s.gaps, 0, 3, 1), lasers: int(s.lasers, 0, 3, 1),
    seed: int(s.seed, 1, 999999, 1),
    ...((s.tpl === "runner" || s.tpl === "dash") && Array.isArray(s.rules) && s.rules.some((r) => RULES.includes(r)) ? { rules: [...new Set(s.rules.filter((r) => RULES.includes(r)))].slice(0, RULES_MAX) } : {}),
  };
}
/// Studio 4 ("Build it yourself"): a runner or dash laid out by hand. build = { L: track metres, r: [[z, k, lane]] } with k
/// w (wall, a lane) · g (gap, across) · l (laser, across) · c (coin, a lane) · h (heart, a lane: one back, up to 3). The server
/// keeps only what can be played: an obstacle row leaves a lane open (walls in ≤ 2 lanes), one kind of obstacle a row,
/// obstacle rows at least a reaction apart (BUILD.GAP s at the track's speed), nothing on top of a wall, ≤ BUILD.HEARTS hearts.
export const BUILD = { MIN: 150, MAX: 2000, STEP: 10, ROWS: 600, HEARTS: 5, GAP: 0.32, KINDS: ["w", "m", "g", "l", "b", "c", "h"] }; // (S4b: m a wall that slides across the lanes, b a laser that blinks)
const ACROSS = new Set(["g", "l", "b", "m"]);
/// S4b rule cards: up to RULES_MAX on any runner or dash — low gravity, mirrored controls, night, a single heart, a run that speeds up
export const RULES = ["low", "mirror", "night", "onehp", "speedup"], RULES_MAX = 2;
export const buildGap = (spec) => Math.max(4, Math.round(speedOf(spec) * BUILD.GAP));
export function cleanBuild(b, spec) {
  const L = Math.max(BUILD.MIN, Math.min(BUILD.MAX, Math.round((Number(b.L) || 0) / BUILD.STEP) * BUILD.STEP)), gap = buildGap(spec), raw = Array.isArray(b.r) ? b.r.slice(0, BUILD.ROWS * 2) : [];
  const rows = []; for (const x of raw) { if (!Array.isArray(x)) continue; const z = Math.round(Number(x[0])), k = String(x[1]), ln = Math.round(Number(x[2]) || 0); if (!Number.isFinite(z) || z < 20 || z > L - 12 || !BUILD.KINDS.includes(k)) continue; rows.push([z, k, ACROSS.has(k) ? 0 : Math.max(0, Math.min(2, ln))]); }
  rows.sort((p, q) => p[0] - q[0] || BUILD.KINDS.indexOf(p[1]) - BUILD.KINDS.indexOf(q[1]) || p[2] - q[2]);
  const out = [], seen = new Set(); let lastZ = -99, lastK = "", hearts = 0;
  const walls = new Map(); // z → lanes walled
  for (const [z, k, ln] of rows) {
    const key = z + k + ln; if (seen.has(key)) continue;
    if (k === "w" || ACROSS.has(k)) {
      if (z !== lastZ && z - lastZ < gap) continue; // (too close to the last obstacle row to react)
      if (z === lastZ && (k !== "w" || lastK !== "w")) continue; // (one kind a row)
      if (k === "w") { const set = walls.get(z) || new Set(); if (set.size >= 2) continue; set.add(ln); walls.set(z, set); }
      lastZ = z; lastK = k;
    } else {
      if (k === "h" && hearts >= BUILD.HEARTS) continue;
      const set = walls.get(z); if (set && set.has(ln)) continue; // (not inside a wall)
      if (k === "h") hearts++;
    }
    seen.add(key); out.push([z, k, ln]); if (out.length >= BUILD.ROWS) break;
  }
  return { L, r: out };
}
/// S4c: an arena laid out by hand. build = { p: pillars [[x, z]], w: waves [[t, k, deg]] (k d drone · D big drone · L sweep),
/// c: coins [[t, x, z]] } — x/z metres from the middle, t seconds, deg the side a drone comes from (a sweep's line: 0–179).
/// The server keeps: ≤ ARENA_B.PILLARS pillars inside the ring, clear of the middle (where you start) and of each other; waves
/// from 2 s to the end, ≤ ARENA_B.BURST in any second (a crowd you could dodge); coins on the floor, not inside a pillar.
export const ARENA_B = { PILLARS: 10, PR: 1, WAVES: 400, COINS: 120, BURST: 6 };
export function cleanArena(b, spec) {
  const secs = spec.len, R = ARENA_R, num = (v) => Math.round(Number(v) * 10) / 10, p = [], w = [], c = [];
  for (const x of Array.isArray(b.p) ? b.p.slice(0, 40) : []) { if (!Array.isArray(x)) continue; const px = num(x[0]), pz = num(x[1]), r = Math.hypot(px, pz);
    if (!Number.isFinite(r) || r > R - 3 || r < 3.2 || p.some((q) => Math.hypot(q[0] - px, q[1] - pz) < 2.6)) continue; p.push([px, pz]); if (p.length >= ARENA_B.PILLARS) break; }
  const ws = (Array.isArray(b.w) ? b.w.slice(0, ARENA_B.WAVES * 2) : []).filter(Array.isArray).map((x) => [num(x[0]), String(x[1]), Math.round(Number(x[2]))]).filter(([t, k, a]) => Number.isFinite(t) && Number.isFinite(a) && t >= 2 && t <= secs - 0.5 && (k === "d" || k === "D" || k === "L")).map(([t, k, a]) => [t, k, ((a % 360) + 360) % (k === "L" ? 180 : 360)]);
  ws.sort((x, y) => x[0] - y[0] || x[2] - y[2]); const seen = new Set();
  for (const x of ws) { const key = x.join(); if (seen.has(key)) continue; let n = 0; for (let i = w.length - 1; i >= 0 && x[0] - w[i][0] < 1; i--) n++; if (n >= ARENA_B.BURST) continue; seen.add(key); w.push(x); if (w.length >= ARENA_B.WAVES) break; }
  for (const x of Array.isArray(b.c) ? b.c.slice(0, ARENA_B.COINS * 2) : []) { if (!Array.isArray(x)) continue; const t = num(x[0]), cx = num(x[1]), cz = num(x[2]), r = Math.hypot(cx, cz);
    if (!Number.isFinite(t + r) || t < 0 || t > secs - 1 || r > R - 1.5 || p.some((q) => Math.hypot(q[0] - cx, q[1] - cz) < ARENA_B.PR + 0.7)) continue; c.push([t, cx, cz]); if (c.length >= ARENA_B.COINS) break; }
  c.sort((x, y) => x[0] - y[0]);
  return { p, w, c };
}
const KIND_OF = { w: "wall", m: "mwall", g: "gap", l: "laser", b: "blink", c: "coin", h: "heart" };
/// a built layout as the level's rows (the dash: the layout again and again, back to back, to DASH_MAX's length)
function buildRows(spec, len) {
  const B = spec.build, rows = [], reps = spec.tpl === "dash" ? Math.ceil(len / B.L) : 1;
  for (let i = 0; i < reps; i++) for (const [z, k, ln] of B.r) { const zz = z + i * B.L; if (zz > len - 12) break; rows.push(ACROSS.has(k) ? { z: zz, k: KIND_OF[k] } : { z: zz, k: KIND_OF[k], lane: ln }); }
  return rows;
}
export const speedOf = (spec) => 9 + spec.speed * 2.2; // metres a second
/// the dash's speed after t seconds (len picks how fast it climbs: 30 → slow … 90 → fast)
export const dashSpeed = (spec, t) => speedOf(spec) * (1 + t / (150 - spec.len));
/// the level a spec makes: rows along the track (z, metres from the start), each a wall in a lane, a gap across, a
/// laser across (slide) or coins in a lane. → { len (metres), rows: [{ z, k: "wall"|"gap"|"laser"|"coin", lane? }], coins }
export function genLevel(spec0) {
  const spec = clampSpec(spec0);
  if (spec.tpl === "arena" || spec.tpl === "rush") return genArena(spec);
  if (spec.tpl === "climb") return genClimb(spec);
  if (spec.tpl === "defense") return genDefense(spec);
  if (JUMPS[spec.tpl]) return genJump(spec);
  if (spec.tpl === "survival") return genSurv(spec);
  if (spec.tpl === "rhythm") return genBeat(spec);
  if (spec.tpl === "race") return genRace(spec);
  if (spec.tpl === "puzzle") return { puzzle: true, id: puzzleId(spec), len: 0, coins: 0, hints: puzzleHints(spec) };
  const v = speedOf(spec), len = spec.tpl === "dash" ? Math.round(Array.from({ length: DASH_MAX }, (_, t) => dashSpeed(spec, t + 0.5)).reduce((a, b) => a + b, 0)) : spec.build ? spec.build.L : Math.round(v * spec.len);
  if (spec.build) { const rows = buildRows(spec, len); return { len, rows, coins: rows.filter((r) => r.k === "coin").length, v, built: true }; }
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
  if (spec.build) { const B = spec.build; return { len: spec.len * 20, secs: spec.len, waves: B.w.map(([t, k, a]) => ({ t, k, a: +((a * Math.PI) / 180).toFixed(3) })), coinsAt: B.c.map(([t, x, z]) => ({ t, x, z })), coins: B.c.length, R: ARENA_R, pillars: B.p.map(([x, z]) => ({ x, z })), built: true }; }
  let s = spec.seed >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const secs = spec.len, waves = [], coinsAt = [], rush = spec.tpl === "rush"; // (Coin Rush: half the drones, three times the coins)
  for (let t = 2; t < secs; t += Math.max(0.35, 2.2 - spec.walls * 0.32) * (1 - t / secs / 2.4) * (rush ? 2 : 1)) waves.push({ t: +t.toFixed(2), k: "d", a: +(rnd() * 6.283).toFixed(3) });
  for (let i = 0; i < spec.lasers * Math.ceil(secs / 30); i++) waves.push({ t: +(6 + rnd() * (secs - 8)).toFixed(2), k: "D", a: +(rnd() * 6.283).toFixed(3) });
  for (let i = 0; i < spec.gaps * Math.ceil(secs / 20); i++) waves.push({ t: +(5 + rnd() * (secs - 7)).toFixed(2), k: "L", a: +(rnd() * 3.1416).toFixed(3) });
  waves.sort((p, q) => p.t - q.t);
  const nC = Math.round(spec.coins * secs / (rush ? 2 : 6));
  for (let i = 0; i < nC; i++) { const a = rnd() * 6.283, r = 2 + rnd() * (ARENA_R - 4); coinsAt.push({ t: +((i + 0.5) * (secs / Math.max(1, nC))).toFixed(2), x: +(Math.cos(a) * r).toFixed(2), z: +(Math.sin(a) * r).toFixed(2) }); }
  return { len: secs * 20, secs, waves, coinsAt, coins: nC, R: ARENA_R };
}
/// S4d SKY CLIMB: five columns across (CLIMB.COLS, metres), height up. You bounce on whatever you land on: jumpH(spec) metres
/// (springs ×2.5), so the next platform must be within reach — the builder shows a gap you can't jump in red, the bots fail it.
/// rows: { z: height, k: "plat"|"mplat" (slides)|"break" (once)|"spring"|"spike"|"coin"|"heart", lane: 0–4 }
export const CLIMB = { COLS: [-4, -2, 0, 2, 4], W: 10, G: 24, MIN: 60, MAX: 600, STEP: 10, ROWS: 600, HEARTS: 5, KINDS: ["n", "m", "b", "s", "k", "c", "h"] };
const KIND_C = { n: "plat", m: "mplat", b: "break", s: "spring", k: "spike", c: "coin", h: "heart" }, CODE_C = Object.fromEntries(Object.entries(KIND_C).map(([a, b]) => [b, a]));
export const jumpH = (spec) => 3 + spec.speed * 0.25, reachOf = (spec) => jumpH(spec) - 0.5;
export function cleanClimb(b, spec) {
  const L = Math.max(CLIMB.MIN, Math.min(CLIMB.MAX, Math.round((Number(b.L) || 0) / CLIMB.STEP) * CLIMB.STEP)), out = [], seen = new Set(); let hearts = 0;
  const rows = (Array.isArray(b.r) ? b.r.slice(0, CLIMB.ROWS * 2) : []).filter(Array.isArray).map((x) => [Math.round(Number(x[0]) * 2) / 2, String(x[1]), Math.round(Number(x[2]) || 0)]).filter(([z, k, c]) => Number.isFinite(z) && z >= 1.5 && z <= L - 1 && CLIMB.KINDS.includes(k) && c >= 0 && c <= 4);
  rows.sort((p, q) => p[0] - q[0] || p[2] - q[2]);
  for (const x of rows) { const [z, k, c] = x; if (out.some((o) => o[2] === c && Math.abs(o[0] - z) < (k === "c" || o[1] === "c" ? 0.5 : 1))) continue; // (one thing a spot: nothing inside a platform)
    if (k === "h" && hearts >= CLIMB.HEARTS) continue; const key = z + ":" + c; if (seen.has(key)) continue; seen.add(key); if (k === "h") hearts++; out.push([z, k, c]); if (out.length >= CLIMB.ROWS) break; }
  return { climb: 1, L, r: out };
}
/// where a climb can't go on: the heights where the next thing to land on is out of reach (a spring reaches further)
export function climbGaps(spec, rows, len) {
  const land = rows.filter((r) => r.k === "plat" || r.k === "mplat" || r.k === "break" || r.k === "spring").sort((a, b) => a.z - b.z), out = []; let y = 0, sp = false;
  for (const r of land) { if (r.z <= y) { if (r.k === "spring") sp = true; continue; } const reach = sp ? reachOf(spec) * 2.5 : reachOf(spec); if (r.z - y > reach) out.push([y, r.z]); sp = r.k === "spring"; y = r.z; }
  if (len - y > (sp ? reachOf(spec) * 2.5 : reachOf(spec))) out.push([y, len]);
  return out;
}
export function genClimb(spec) {
  const len = spec.build ? spec.build.L : spec.len * 4;
  if (spec.build) { const rows = spec.build.r.map(([z, k, c]) => ({ z, k: KIND_C[k], lane: c })); return { len, rows, coins: rows.filter((r) => r.k === "coin").length, climb: true, built: true, H: jumpH(spec) }; }
  let s = spec.seed >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const reach = reachOf(spec), rows = []; let z = 0, col = 2, coins = 0, sinceSpring = 0;
  while (true) { z += Math.round((1.6 + rnd() * (reach - 1.6) * (0.55 + spec.walls * 0.05 + spec.gaps * 0.04)) * 2) / 2; if (z > len - 1.5) break;
    col = Math.max(0, Math.min(4, col + Math.round((rnd() - 0.5) * 4))); const r = rnd();
    const k = sinceSpring > 40 && rnd() < 0.3 ? "spring" : r < spec.walls * 0.07 ? "mplat" : r < spec.walls * 0.07 + spec.gaps * 0.08 ? "break" : "plat";
    if (k === "spring") sinceSpring = 0; else sinceSpring += z - (rows.length ? rows[rows.length - 1].z : 0);
    rows.push({ z, k, lane: col });
    if (spec.lasers && rnd() < spec.lasers * 0.09) rows.push({ z: z + 1, k: "spike", lane: (col + 2 + Math.floor(rnd() * 2)) % 5 });
    if (rnd() < spec.coins * 0.12) { rows.push({ z: z + 1.5, k: "coin", lane: col }); coins++; } }
  rows.sort((a, b) => a.z - b.z);
  return { len, rows, coins, climb: true, H: jumpH(spec) };
}
/// S4d TOWER DEFENSE: a grid DEF.C × DEF.R; the path is a chain of side-by-side cells from the top row (the portal) to the
/// bottom row (your crystal); pads sit beside the path. waves: [grunts, runners, tanks] each. The run's score: kills as coins,
/// 100 a wave held as distance, the whole set held as the finish. build = { td: 1, path: [[c, r]], pads: [[c, r]], waves: [[g, r, t]] }
export const DEF = { C: 7, R: 11, PADS: 12, WAVES: 20, PER: 30, LIVES: 10, WAVES_OF: { 30: 5, 45: 8, 60: 10, 90: 15 },
  TOWERS: { bolt: { cost: 50, range: 3.2, dmg: 6, rate: 0.45 }, frost: { cost: 70, range: 2.6, dmg: 2, rate: 0.8, slow: 0.5 }, cannon: { cost: 90, range: 3, dmg: 14, rate: 1.4, splash: 1.3 } },
  FOES: { g: { hp: 26, v: 1, gold: 5, hurt: 1 }, r: { hp: 14, v: 1.8, gold: 4, hurt: 1 }, t: { hp: 90, v: 0.6, gold: 12, hurt: 2 } } };
export const defGold = (spec) => 100 + spec.coins * 40, defSpeed = (spec) => 0.9 + spec.speed * 0.22; // (cells a second for a grunt)
export function cleanDefense(b, spec) {
  const path = [], seen = new Set(), cell = (x) => (Array.isArray(x) ? [Math.round(Number(x[0])), Math.round(Number(x[1]))] : [NaN, NaN]), inG = ([c, r]) => c >= 0 && c < DEF.C && r >= 0 && r < DEF.R;
  for (const x of (Array.isArray(b.path) ? b.path : []).slice(0, DEF.C * DEF.R)) { const q = cell(x); if (!inG(q) || seen.has(q.join())) break; const l = path[path.length - 1];
    if (!l ? q[1] !== 0 : Math.abs(l[0] - q[0]) + Math.abs(l[1] - q[1]) !== 1) break; path.push(q); seen.add(q.join()); if (q[1] === DEF.R - 1) break; } // (side by side, from the top row down to the bottom one)
  const done = path.length > 1 && path[path.length - 1][1] === DEF.R - 1, pads = [];
  if (done) for (const x of (Array.isArray(b.pads) ? b.pads : []).slice(0, 60)) { const q = cell(x); if (!inG(q) || seen.has(q.join()) || pads.some((p) => p[0] === q[0] && p[1] === q[1])) continue;
    if (!path.some((p) => Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1)) continue; pads.push(q); if (pads.length >= DEF.PADS) break; }
  const waves = (Array.isArray(b.waves) ? b.waves : []).slice(0, DEF.WAVES).filter(Array.isArray).map((w) => { let [g, r, t] = [0, 1, 2].map((i) => Math.max(0, Math.round(Number(w[i]) || 0))); while (g + r + t > DEF.PER) { if (g >= r && g >= t) g--; else if (r >= t) r--; else t--; } return [g, r, t]; }).filter((w) => w[0] + w[1] + w[2] > 0);
  return { td: 1, path: done ? path : [], pads, waves };
}
/// the quick start: a path that winds down the grid (seeded), pads spread along it, waves that grow
export function genDefense(spec) {
  let B = spec.build && spec.build.path && spec.build.path.length ? spec.build : null;
  if (!B) { let s = spec.seed >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const path = []; let c = 1 + Math.floor(rnd() * (DEF.C - 2)); for (let r = 0; r < DEF.R; r++) { path.push([c, r]); if (r % 3 === 1 && r < DEF.R - 2) { const to = Math.max(0, Math.min(DEF.C - 1, c + (rnd() < 0.5 ? -1 : 1) * (2 + Math.floor(rnd() * 3)))); while (c !== to) { c += Math.sign(to - c); path.push([c, r]); } } }
    const on = new Set(path.map(String)), cand = []; for (let i = 1; i < path.length - 1; i += 2) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = [path[i][0] + dc, path[i][1] + dr]; if (q[0] >= 0 && q[0] < DEF.C && q[1] >= 0 && q[1] < DEF.R && !on.has(String(q)) && !cand.some((x) => String(x) === String(q))) cand.push(q); }
    const pads = []; const want = 6 + Math.round(spec.coins * 0.8); for (let i = 0; i < cand.length && pads.length < want; i += Math.max(1, Math.floor(cand.length / want))) pads.push(cand[i]);
    const n = DEF.WAVES_OF[spec.len] || 8, waves = Array.from({ length: n }, (_, i) => [Math.min(DEF.PER, 3 + spec.walls + Math.round(i * (0.8 + spec.walls * 0.15))), Math.min(DEF.PER, Math.round((spec.lasers * i) / 3)), Math.min(DEF.PER, Math.round((spec.gaps * i) / 4))]);
    B = cleanDefense({ td: 1, path, pads, waves }, spec); }
  const foes = B.waves.reduce((a, w) => a + w[0] + w[1] + w[2], 0);
  return { len: B.waves.length * 100, coins: foes, defense: true, built: !!(spec.build && spec.build.path && spec.build.path.length), path: B.path, pads: B.pads, waves: B.waves.map((w, i) => ({ g: w[0], r: w[1], t: w[2], hp: +(1 + i * 0.16).toFixed(2) })), gold: defGold(spec), v: defSpeed(spec) };
}
/// SB-2 JUMP WORLD (the owner's Studio Beta plan, phase 2 — "Mario Maker"): a level on a grid seen from the side, JW.H rows
/// high and W columns long (a cell is a metre). Every piece is a SMART PREFAB: put it down and it already works (its rule,
/// its motion, its sound). build = { jw: 1, W, c: [[x, y, k, d?]] } (y 0 = the bottom row; d: a direction, 0 or 1).
/// SB-3: the same engine under other names — dungeon (a dark cave, chests and keys), escape (keys, doors and switches
/// against the clock), boss (the finish opens when the boss falls), mining (dig ores against the clock).
export const JW = { H: 14, MIN: 30, MAX: 240, CELLS: 2200, ENEMIES: 40, BOSSES: 2, HEARTS: 6, KEYS: 8, G: 34, V0: 14.6, REACH: [4, 3], SPRING: 7,
  // kind → [name, group]: ground and brick take the theme's look
  K: { g: ["Ground", "block"], s: ["Brick", "block"], i: ["Ice", "block"], l: ["Lava", "block"], w: ["Bridge", "block"],
    m: ["Moving platform", "move"], v: ["Lift", "move"], f: ["Falling platform", "move"], b: ["Blinking platform", "move"],
    p: ["Spring", "thing"], k: ["Spikes", "thing"], c: ["Checkpoint", "thing"], o: ["Coin", "item"], y: ["Key", "item"], d: ["Door", "thing"],
    t: ["Switch", "thing"], r: ["Red block", "thing"], u: ["Blue block", "thing"], h: ["Potion", "item"], q: ["Chest", "item"],
    e: ["Walker", "foe"], n: ["Flyer", "foe"], z: ["Cannon", "foe"], B: ["Dragon boss", "foe"], S: ["Start", "goal"], F: ["Finish", "goal"],
    1: ["Copper ore", "ore"], 2: ["Silver ore", "ore"], 3: ["Gold ore", "ore"] },
  ORE: { 1: [2, 2], 2: [3, 5], 3: [4, 10] }, // (hits to break, coins)
  CHEST: 5, FOE: 1, BOSS: 20, BOSS_HP: 3 };
export const JUMPS = { jump: "jump", dungeon: "dungeon", escape: "escape", boss: "boss", mining: "mining" };
const SOLID = new Set(["g", "s", "i", "w", "p", "d", "r", "z", "1", "2", "3"]); // (what you stand on in the grid itself; f / b / m / v are solid too, as things)
export const jwTimer = (spec) => (spec.tpl === "escape" || spec.tpl === "mining" ? spec.len * 2 : 0); // seconds (0: no clock)
export const jwSpeed = (spec) => 5.4 + spec.speed * 0.55; // metres a second running
export function cleanJump(b, spec) {
  const W = Math.max(JW.MIN, Math.min(JW.MAX, Math.round(Number(b.W) || 60))), seen = new Set(), out = [], n = {};
  for (const x of (Array.isArray(b.c) ? b.c : []).slice(0, JW.CELLS * 2)) {
    if (!Array.isArray(x)) continue; const cx = Math.round(Number(x[0])), cy = Math.round(Number(x[1])), k = String(x[2]), d = Number(x[3]) === 1 ? 1 : 0;
    if (!JW.K[k] || !(cx >= 0 && cx < W && cy >= 0 && cy < JW.H)) continue;
    if (k === "B" && (cx >= W - 1 || cy >= JW.H - 1)) continue; // (the dragon takes 2 × 2)
    const key = cx + ":" + cy; if (seen.has(key)) continue;
    const g = JW.K[k][1], lim = k === "S" || k === "F" ? 1 : k === "B" ? JW.BOSSES : g === "foe" ? JW.ENEMIES : k === "h" ? JW.HEARTS : k === "y" ? JW.KEYS : 1e9;
    if ((n[k === "B" || g !== "foe" ? k : "foe"] || 0) >= lim) continue; n[k === "B" || g !== "foe" ? k : "foe"] = (n[k === "B" || g !== "foe" ? k : "foe"] || 0) + 1;
    seen.add(key); if (k === "B") for (const [a, c2] of [[1, 0], [0, 1], [1, 1]]) seen.add(cx + a + ":" + (cy + c2));
    out.push(d ? [cx, cy, k, 1] : [cx, cy, k]); if (out.length >= JW.CELLS) break;
  }
  // a start and a finish always: the start on the left, the finish on the right, each standing on the highest thing there
  const top = (cx) => { let y = -1; for (const c of out) if (c[0] === cx && SOLID.has(c[2]) && c[1] > y) y = c[1]; return Math.min(JW.H - 2, y + 1); };
  if (!out.some((c) => c[2] === "S")) { const y = top(1); if (!seen.has("1:" + y)) out.push([1, y, "S"]); }
  if (spec.tpl !== "mining" && !out.some((c) => c[2] === "F")) { const y = top(W - 2); if (!seen.has(W - 2 + ":" + y)) out.push([W - 2, y, "F"]); }
  return { jw: 1, W, c: out };
}
/// the grid as a lookup: cell → kind, plus the lists the engine and the bots need
export function jwGrid(B) {
  const at = new Map(), list = []; for (const c of B.c) { at.set(c[0] + ":" + c[1], c); list.push(c); }
  return { at, list, W: B.W, get: (x, y) => at.get(x + ":" + y), solid: (x, y) => { const c = at.get(x + ":" + y); return !!c && SOLID.has(c[2]); } };
}
/// where you can stand and get to (a rough walk: run along, jump up to REACH, fall any way; springs throw higher, doors and
/// switches are treated as passed) → { ok: the finish is reached, far: the furthest column, dead: [x] columns you can't pass }
export function jwReach(B) {
  const G = jwGrid(B), stand = (x, y) => y >= 0 && y < JW.H && x >= 0 && x < B.W && !G.solid(x, y) && !G.solid(x, y + 1) && (y === 0 ? false : G.solid(x, y - 1) || ["m", "v", "f", "b", "r", "u", "w"].includes((G.get(x, y - 1) || [])[2]));
  const S = B.c.find((c) => c[2] === "S"), F = B.c.find((c) => c[2] === "F"); if (!S) return { ok: false, far: 0 };
  let sy = S[1]; while (sy > 0 && !stand(S[0], sy)) sy--; const seen = new Set([S[0] + ":" + sy]), q = [[S[0], sy]]; let far = S[0], ok = false;
  while (q.length && seen.size < 6000) {
    const [x, y] = q.shift(); far = Math.max(far, x); if (F && Math.abs(F[0] - x) <= 1 && Math.abs(F[1] - y) <= 2) ok = true;
    const spring = (G.get(x, y - 1) || [])[2] === "p", up = spring ? JW.SPRING : JW.REACH[1];
    for (let dx = -JW.REACH[0] - 1; dx <= JW.REACH[0] + 1; dx++) for (let dy = -JW.H; dy <= up; dy++) {
      const nx = x + dx, ny = y + dy; if (seen.has(nx + ":" + ny) || !stand(nx, ny)) continue; if (dy > 0 && Math.abs(dx) > JW.REACH[0]) continue;
      seen.add(nx + ":" + ny); q.push([nx, ny]); }
  }
  return { ok: ok || (!F && far >= B.W - 3), far };
}
/// the quick start: a seeded level for each mode from the six knobs
export function genJumpBuild(spec) {
  let s = spec.seed >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mode = spec.tpl, W = mode === "boss" ? 70 : mode === "escape" ? 70 + spec.len / 3 : ({ 30: 60, 45: 90, 60: 120, 90: 170 })[spec.len] || 90, c = [], put = (x, y, k, d) => { if (x >= 0 && x < W && y >= 0 && y < JW.H) c.push(d ? [x, y, k, 1] : [x, y, k]); };
  const gk = mode === "dungeon" || mode === "mining" ? "s" : "g", col = (x, h, k = gk) => { for (let y = 0; y < h; y++) put(x, y, y === h - 1 ? k : "s"); };
  let x = 0, h = 2; const heights = [];
  const flat = (n) => { for (let i = 0; i < n && x < W; i++, x++) { col(x, h); heights[x] = h; } };
  flat(6); put(1, h, "S");
  const bossAt = mode === "boss" ? W - 34 : -1, mid = Math.round(W * 0.5); let cp = false, keysOut = 0;
  while (x < W - 8) {
    if (bossAt > 0 && x >= bossAt) break;
    if (!cp && x >= mid) { flat(2); put(x - 1, h, "c"); cp = true; continue; }
    const r = rnd() * (3 + spec.walls + spec.gaps + spec.lasers + 1.5);
    if (r < 2) { const n = 3 + Math.floor(rnd() * 4); const x0 = x; flat(n); if (rnd() < spec.coins * 0.18) for (let i = 0; i < Math.min(n, 3); i++) put(x0 + i, h + 1 + (i === 1 ? 1 : 0), "o"); }
    else if (r < 3) { h = Math.max(1, Math.min(6, h + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 2)))); flat(3); }
    else if (r < 3 + spec.walls) { const x0 = x; flat(5); put(x0 + 3, h, rnd() < 0.3 && spec.walls >= 3 ? "n" : "e"); if (rnd() < 0.25 && spec.walls >= 4) put(x0 + 2, h + 3, "n"); }
    else if (r < 3 + spec.walls + spec.gaps) { const w = 2 + Math.floor(rnd() * (spec.gaps >= 2 ? 3 : 2)); if (w >= 4) { put(x + 1, h, rnd() < 0.5 ? "m" : "f"); } x += w; flat(2); if (rnd() < 0.4) for (let i = 0; i < 3; i++) put(x - 2 - w + i + 1, h + 2, "o"); }
    else if (r < 3 + spec.walls + spec.gaps + spec.lasers) { const x0 = x; flat(4); const t = rnd(); if (t < 0.45) put(x0 + 2, h, "k"); else if (t < 0.75) { x -= 3; for (let i = 0; i < 2; i++, x++) { for (let y = 0; y < h - 1; y++) put(x, y, "s"); put(x, h - 1, "l"); heights[x] = h; } flat(1); } else put(x0 + 1, h, "z", rnd() < 0.5 ? 1 : 0); }
    else { const x0 = x; flat(5); put(x0 + 1, h, "p"); for (let y = h; y < Math.min(JW.H - 2, h + 5); y++) put(x0 + 4, y, "s"); put(x0 + 4, Math.min(JW.H - 2, h + 5), "o"); }
    if (mode === "dungeon" && rnd() < 0.12) put(x - 1, h, "q");
    if ((mode === "dungeon" || mode === "escape") && keysOut < (mode === "escape" ? 3 : 1) && rnd() < 0.08) { put(x - 2, h + 1, "y"); keysOut++; }
    if (mode === "escape" && rnd() < 0.1) { put(x - 2, h, "t"); for (let y = h; y < JW.H - 1; y++) put(x + 1, y, "r"); } // (red blocks to the ceiling: step on the switch and they let you through)
    if (mode === "mining" && rnd() < 0.55 + spec.coins * 0.07) { const ox = x - 2, oy = h + 1 + Math.floor(rnd() * 3), o = rnd() < 0.15 ? "3" : rnd() < 0.45 ? "2" : "1"; for (const [a, b2] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (rnd() < 0.8) put(ox + a, oy + b2, o); } // (a cluster of ore in the air: dig it, stand on it)
  }
  if (bossAt > 0) { x = Math.max(x, bossAt); for (let i = 0; i < 26 && x < W - 6; i++, x++) { col(x, 2); heights[x] = 2; } for (let y = 2; y < 6; y++) { put(bossAt - 1, y, "s"); } put(bossAt + 16, 2, "B"); put(bossAt + 5, 5, "w"); put(bossAt + 6, 5, "w"); put(bossAt + 18, 6, "w"); put(bossAt + 19, 6, "w"); put(bossAt + 3, 2, "h"); h = 2; }
  flat(W - x); if (mode === "dungeon" || mode === "escape") { for (let i = 0; i < keysOut; i++) { const dx = W - 6 - i * 2, dy = heights[dx] || 2; put(dx, dy, "d"); put(dx, dy + 1, "d"); for (let y = dy + 2; y < JW.H - 1; y++) put(dx, y, "s"); } } // (a door from the floor to the ceiling: you need its key)
  if (mode !== "jump" && mode !== "boss") for (let i = 0; i < W; i++) put(i, JW.H - 1, "s"); // (a cave's ceiling)
  put(W - 2, heights[W - 2] || 2, "F");
  return cleanJump({ W, c }, spec);
}
export function genJump(spec) {
  const B = spec.build && spec.build.jw ? spec.build : genJumpBuild(spec), F = B.c.find((c) => c[2] === "F"), n = (k) => B.c.filter((c) => c[2] === k).length;
  const ores = B.c.reduce((a, c) => a + (JW.ORE[c[2]] ? JW.ORE[c[2]][1] : 0), 0), foes = B.c.filter((c) => c[2] === "e" || c[2] === "n").length;
  return { jump: true, mode: spec.tpl, built: !!(spec.build && spec.build.jw), B, len: F ? F[0] : B.W - 1, coins: n("o") + n("q") * JW.CHEST + foes * JW.FOE + n("B") * JW.BOSS + ores, timer: jwTimer(spec), v: jwSpeed(spec) };
}
/// SB-3: the bots on a survival run (the crowd, the elites, the bosses against the time), a beat chart (how dense and how
/// fast it comes, against the groove) and a race (the turns and pillars against the clock)
function estimateOther(spec, L, N, fails, why, rnd) {
  let clears = 0;
  for (let b = 0; b < N; b++) { const sk = 0.3 + (0.7 * b) / (N - 1); let end = -1;
    if (L.survival) { const DK = { easy: 0.75, normal: 1, hard: 1.4 }[L.diff], k = (L.rate * L.hp * DK + L.bossAt.length * 0.22 + (50 - L.elite) / 90) * (L.secs / 240) * (1.5 - sk); const f = rnd() * 0.5 + 0.3;
      if (k * (0.6 + rnd() * 0.8) > 1) { end = Math.min(0.99, f / Math.max(0.6, k)); why[L.bossAt.length && end > L.bossAt[0] / L.secs ? "boss" : "crowd"] = (why.boss || 0) + 1; } }
    else if (L.beat) { const nps = L.B.n.length / Math.max(1, L.secs), hard = nps * (L.bpm / 140) * (1 + L.B.n.filter((q, i, a) => i && a[i - 1][0] === q[0]).length / Math.max(1, L.B.n.length)); let g = L.groove;
      for (let i = 0; i < L.B.n.length; i += 4) { if (rnd() < Math.min(0.9, hard * 0.34 * (1.45 - sk))) { g -= 1; if (g <= 0) { end = i / L.B.n.length; why.notes = (why.notes || 0) + 1; break; } } else g = Math.min(L.groove, g + 0.25); } }
    else if (L.race) { const n = L.B.r.length; let turn = 0; for (let i = 0; i < n; i++) { const a = L.B.r[(i + n - 1) % n], c = L.B.r[i], d = L.B.r[(i + 1) % n], a1 = Math.atan2(c[1] - a[1], c[0] - a[0]), a2 = Math.atan2(d[1] - c[1], d[0] - c[0]); let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da; turn += da; }
      const k = (turn / (Math.PI * 2)) * 0.25 * L.B.laps + L.B.w.length * 0.02 + (raceSpeed(spec) - 20) * 0.02; if (rnd() < Math.min(0.95, k * 0.55 * (1.5 - sk))) { end = 0.5 + rnd() * 0.45; why.time = (why.time || 0) + 1; } }
    if (end < 0) clears++; else fails[Math.min(9, Math.floor(end * 10))]++; }
  return clears;
}
/// the bots on a jump level: each thing on the way can cost a heart, harder for slower bots; a finish out of reach ends them all there
function estimateJump(spec, L, N, fails, why, rnd) {
  const R = jwReach(L.B), things = L.B.c.filter((c) => ["e", "n", "z", "k", "l", "B", "f", "b", "m", "v", "i"].includes(c[2])).sort((a, b) => a[0] - b[0]), pits = [];
  { const G = jwGrid(L.B); let run = 0; for (let x = 0; x < L.B.W; x++) { let any = false; for (let y = 0; y < 4; y++) if (G.solid(x, y)) any = true; if (!any) run++; else { if (run >= 2) pits.push([x - run, run]); run = 0; } } }
  const P = { e: 0.1, n: 0.13, z: 0.11, k: 0.08, l: 0.11, B: 0.5, f: 0.09, b: 0.09, m: 0.07, v: 0.05, i: 0.03 };
  let clears = 0; const tm = jwTimer(spec);
  for (let b = 0; b < N; b++) {
    const sk = 0.3 + (0.7 * b) / (N - 1); let hearts = 3, end = -1;
    const ev = [...things.map((c) => ({ x: c[0], k: c[2], p: P[c[2]] })), ...pits.map(([x, w]) => ({ x, k: "pit", p: 0.04 + w * 0.04 }))].sort((a, b2) => a.x - b2.x);
    for (const e of ev) { if (e.x > R.far + 1) break; const p = Math.min(0.9, e.p * (1.65 - sk) * (0.55 + spec.speed * 0.2) * 1.5); if (rnd() < p) { hearts--; if (hearts <= 0) { end = e.x / L.B.W; why[e.k] = (why[e.k] || 0) + 1; break; } } if (e.k === "B") { for (let h = 1; h < JW.BOSS_HP; h++) if (rnd() < p * 0.6) { hearts--; if (hearts <= 0) { end = e.x / L.B.W; why.B = (why.B || 0) + 1; break; } } if (end >= 0) break; } }
    if (end < 0 && tm && L.len / (jwSpeed(spec) * (0.35 + sk * 0.4)) > tm) { end = 0.9; why.time = (why.time || 0) + 1; }
    if (end < 0 && !R.ok) { end = Math.min(0.99, R.far / L.B.W); why.reach = (why.reach || 0) + 1; }
    if (end < 0) clears++; else fails[Math.min(9, Math.floor(end * 10))]++;
  }
  return clears;
}
/// SB-3 MONSTER SURVIVAL: SURVIVORS ARENA's own engine on the maker's numbers — how long, how strong, how many, how many
/// elites, how many bosses (spread over the run). A run's dist is 20 a second survived; its coins are its knock-outs.
export const SURV_S = { 30: 120, 45: 180, 60: 240, 90: 360 };
export function genSurv(spec) {
  const secs = SURV_S[spec.len] || 180, n = Math.min(4, spec.lasers + (spec.len >= 60 ? 1 : 0));
  return { survival: true, secs, bossAt: Array.from({ length: n }, (_, i) => Math.round((secs * (i + 1)) / (n + 1))), rate: +(0.6 + spec.walls * 0.2).toFixed(2), hp: +(0.7 + spec.coins * 0.16).toFixed(2), elite: Math.max(12, 50 - spec.gaps * 12),
    diff: spec.speed <= 2 ? "easy" : spec.speed >= 4 ? "hard" : "normal", len: secs * 20, coins: Math.round(secs * (3 + spec.walls)) + 60 * n };
}
/// SB-3 BEAT MAKER: four lanes, notes on half-beats at the maker's tempo; the beat is made on the page (Web Audio), so the
/// notes and the sound agree. build = { bt: 1, n: [[step, lane]] }. A run's coins: 2 a perfect, 1 a good; dist 10 a note.
export const BEAT = { LANES: 4, MAX: 900, PERFECT: 0.075, GOOD: 0.15 };
export const bpmOf = (spec) => 80 + spec.speed * 12, beatSecs = (spec) => spec.len, stepsOf = (spec) => Math.floor((beatSecs(spec) * bpmOf(spec)) / 60) * 2;
export function cleanBeat(b, spec) {
  const N = stepsOf(spec), seen = new Set(), out = [];
  for (const x of (Array.isArray(b.n) ? b.n : []).slice(0, BEAT.MAX * 2)) { if (!Array.isArray(x)) continue; const s0 = Math.round(Number(x[0])), l = Math.round(Number(x[1])); if (!(s0 >= 8 && s0 < N && l >= 0 && l < BEAT.LANES)) continue;
    const k = s0 + ":" + l; if (seen.has(k) || out.filter((q) => q[0] === s0).length >= 2) continue; seen.add(k); out.push([s0, l]); if (out.length >= BEAT.MAX) break; } // (two at once at most: two thumbs)
  return { bt: 1, n: out.sort((a, c) => a[0] - c[0] || a[1] - c[1]) };
}
export function genBeatChart(spec) {
  let s = spec.seed >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const N = stepsOf(spec), n = []; let lane = 1;
  for (let i = 8; i < N; i++) { const on = i % 2 === 0, p = on ? 0.22 + spec.walls * 0.11 : spec.lasers * 0.09; if (rnd() >= p) continue;
    lane = (lane + 1 + Math.floor(rnd() * 3)) % 4; n.push([i, lane]); if (on && i % 8 === 0 && rnd() < spec.gaps * 0.22) n.push([i, (lane + 2) % 4]); }
  return cleanBeat({ n }, spec);
}
export function genBeat(spec) { const B = spec.build && spec.build.bt ? spec.build : genBeatChart(spec); return { beat: true, built: !!(spec.build && spec.build.bt), B, bpm: bpmOf(spec), secs: beatSecs(spec), steps: stepsOf(spec), groove: 6 + spec.coins * 2, len: B.n.length * 10, coins: B.n.length * 2 }; }
/// SB-3 HOVER RACE: a loop of rings on open ground (seen from behind your board), boost pads, orbs and pillars; laps.
/// build = { rc: 1, laps, r: [[x, z]], p: [[x, z]], o: [[x, z]], w: [[x, z]] }. A run's coins: orbs + the seconds left
/// under the limit at the finish; dist 20 a ring passed.
export const RACE = { R: 70, RINGS: 30, MIN: 3, PADS: 30, ORBS: 160, PILLARS: 40, GAP: 8 };
export const raceSpeed = (spec) => 15 + spec.speed * 2.5;
const inR = (q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1]) && Math.abs(+q[0]) <= RACE.R && Math.abs(+q[1]) <= RACE.R;
const pt = (q) => [Math.round(+q[0] * 2) / 2, Math.round(+q[1] * 2) / 2];
export function cleanRace(b) {
  const r = []; for (const q of (Array.isArray(b.r) ? b.r : []).slice(0, RACE.RINGS * 2)) { if (!inR(q)) continue; const p = pt(q), l = r[r.length - 1]; if (l && Math.hypot(p[0] - l[0], p[1] - l[1]) < RACE.GAP) continue; r.push(p); if (r.length >= RACE.RINGS) break; }
  const list = (a, n) => (Array.isArray(a) ? a : []).filter(inR).slice(0, n).map(pt);
  return { rc: 1, laps: Math.max(1, Math.min(3, Math.round(Number(b.laps) || 1))), r, p: list(b.p, RACE.PADS), o: list(b.o, RACE.ORBS), w: list(b.w, RACE.PILLARS).filter((q) => !r.some((g) => Math.hypot(g[0] - q[0], g[1] - q[1]) < 4)) }; // (no pillar inside a ring)
}
export function genRaceBuild(spec) {
  let s = spec.seed >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = ({ 30: 7, 45: 9, 60: 11, 90: 14 })[spec.len] || 9, r = [], A = 40 + spec.len * 0.2, Bz = 28 + spec.len * 0.15, wob = 4 + spec.lasers * 4;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; r.push([Math.cos(a) * A + (rnd() - 0.5) * wob, Math.sin(a) * Bz + (rnd() - 0.5) * wob]); }
  const mid = (i, f) => { const a = r[i], c = r[(i + 1) % n]; return [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f]; };
  const p = [], o = [], w = []; for (let i = 0; i < n; i++) { if (rnd() < spec.gaps * 0.22) p.push(mid(i, 0.5)); for (let k = 0; k < spec.coins; k++) o.push(mid(i, 0.2 + (k / Math.max(1, spec.coins)) * 0.6));
    if (rnd() < spec.walls * 0.2) { const m = mid(i, 0.35 + rnd() * 0.3), side = rnd() < 0.5 ? -1 : 1, c = r[(i + 1) % n], a = r[i], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1; w.push([m[0] - (dz / l) * side * 3.5, m[1] + (dx / l) * side * 3.5]); } }
  return cleanRace({ laps: spec.lasers >= 2 ? 3 : spec.lasers + 1, r, p, o, w });
}
export function genRace(spec) {
  const B = spec.build && spec.build.rc ? spec.build : genRaceBuild(spec), n = B.r.length;
  let path = 0; for (let i = 0; i < n; i++) { const a = B.r[i], c = B.r[(i + 1) % n]; path += Math.hypot(c[0] - a[0], c[1] - a[1]); }
  const limit = Math.round(((path * B.laps) / raceSpeed(spec)) * 1.9 + 10);
  return { race: true, built: !!(spec.build && spec.build.rc), B, path, limit, len: n * B.laps * 20, coins: B.o.length + limit };
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
  if (JUMPS[spec.tpl]) clears = estimateJump(spec, L, N, fails, why, rnd); else
  if (spec.tpl === "survival" || spec.tpl === "rhythm" || spec.tpl === "race") clears = estimateOther(spec, L, N, fails, why, rnd); else
  if (spec.tpl === "puzzle") { const k = spec.speed * 1.2 + spec.walls * 0.5 + spec.gaps * 0.5 + spec.lasers * 0.4 + spec.coins * 0.15 - puzzleHints(spec) * 0.6, clear = Math.max(0.05, Math.min(1, 1.15 - k / 7)), st = clear > 0.8 ? 1 : clear > 0.6 ? 2 : clear > 0.4 ? 3 : clear > 0.2 ? 4 : 5; return { clear: Math.round(clear * 100) / 100, stars: st, fails, why: "" }; }
  if (JUMPS[spec.tpl] || spec.tpl === "survival" || spec.tpl === "rhythm" || spec.tpl === "race") { /* (counted above) */ } else if (spec.tpl === "defense") { // (S4d: each wave's hit points coming at the towers the gold and pads allow, against how long the path keeps them in reach)
    const T0 = DEF.TOWERS.bolt, reachCells = (p) => L.path.filter((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) <= T0.range).length;
    const cover = L.pads.map(reachCells).sort((a, b) => b - a);
    for (let b = 0; b < N; b++) {
      const sk = 0.3 + (0.7 * b) / (N - 1), pow = []; let lives = DEF.LIVES, gold = L.gold, towers = 0, end = -1;
      for (let i = 0; i < L.waves.length; i++) { const w = L.waves[i];
        while (towers < L.pads.length && gold >= T0.cost) { gold -= T0.cost; towers++; pow.push(1); }
        if (towers >= L.pads.length) for (let k = 0; k < pow.length * 3 && gold >= T0.cost * 0.8; k++) { const j = pow.indexOf(Math.min(...pow)); if (pow[j] >= 2) break; pow[j] += 0.35; gold -= T0.cost * 0.8; } // (all pads built: upgrades)
        const n0 = w.g + w.r + w.t, cv = cover.slice(0, towers), dps = cv.length ? cv.reduce((a, c, j) => a + pow[j] * (T0.dmg / T0.rate) * (c / L.v + n0 * 0.4), 0) * (0.45 + sk * 0.6) : 0, hp = (w.g * DEF.FOES.g.hp + w.r * DEF.FOES.r.hp * 1.8 + w.t * DEF.FOES.t.hp * 0.7) * w.hp;
        const leak = Math.max(0, (hp - dps) / hp), n = n0, lost = Math.round(leak * n * (1 + w.t / Math.max(1, n)) * (0.6 + rnd() * 0.8));
        lives -= lost; gold += Math.round((1 - leak) * (w.g * 5 + w.r * 4 + w.t * 12)); if (lives <= 0) { end = (i + 0.5) / L.waves.length; why[w.t > w.r ? "t" : w.r > 0 ? "r" : "g"] = (why[w.t > w.r ? "t" : w.r > 0 ? "r" : "g"] || 0) + 1; break; } }
      if (end < 0) clears++; else fails[Math.min(9, Math.floor(end * 10))]++;
    }
  } else   if (spec.tpl === "climb") { // (S4d: each hop up — how far, how far across, what kind — and the spikes beside the way)
    const land = L.rows.filter((r) => r.k !== "coin" && r.k !== "heart" && r.k !== "spike"), spikes = L.rows.filter((r) => r.k === "spike"), reach = reachOf(spec), gapsAt = climbGaps(spec, L.rows, L.len);
    for (let b = 0; b < N; b++) {
      const sk = 0.3 + (0.7 * b) / (N - 1); let hearts = 3, end = -1, y = 0, c = 2, sp = false;
      for (const r of land) { if (r.z <= y) continue; const gap = gapsAt.find((g) => g[0] === y); if (gap) { end = y / L.len; why.gap = (why.gap || 0) + 1; break; }
        const across = Math.min(Math.abs(r.lane - c), 5 - Math.abs(r.lane - c)) / 2.5, up = (r.z - y) / (sp ? reach * 2.5 : reach), near = spikes.some((x) => x.z > y && x.z < r.z + 1.5) ? 0.05 : 0;
        const p = Math.max(0, up * up * 0.012 + across * 0.01 + (r.k === "mplat" ? 0.05 : r.k === "break" ? 0.035 : 0) + near + (spec.speed - 1) * 0.004) * (1.35 - sk) * 0.8;
        if (rnd() < Math.min(0.9, p)) { hearts--; if (hearts <= 0) { end = r.z / L.len; why[r.k] = (why[r.k] || 0) + 1; break; } }
        y = r.z; c = r.lane; sp = r.k === "spring"; }
      if (end < 0 && gapsAt.length && gapsAt[gapsAt.length - 1][1] >= L.len) { end = gapsAt[gapsAt.length - 1][0] / L.len; why.gap = (why.gap || 0) + 1; }
      if (end < 0) clears++; else fails[Math.min(9, Math.floor(end * 10))]++;
    }
  } else if (spec.tpl === "arena" || spec.tpl === "rush") {
    const dS = 2.6 + spec.speed * 0.9, shield = 1 - 0.035 * ((L.pillars || []).length); // (S4c: pillars stop drones)
    for (let b = 0; b < N; b++) {
      const sk = 0.3 + (0.7 * b) / (N - 1); let hearts = 3, end = -1, recent = [];
      for (const w of L.waves) { recent = recent.filter((t) => w.t - t < 3); recent.push(w.t);
        const p = (w.k === "L" ? 0.09 * (1.25 - sk) : (0.012 + (dS - 3) * 0.008 + recent.length * 0.006) * (w.k === "D" ? 1.5 : 1) * (1.3 - sk)) * (w.k === "L" ? 1 : shield);
        if (rnd() < Math.min(0.9, p)) { hearts--; if (hearts <= 0) { end = w.t / L.secs; why[w.k] = (why[w.k] || 0) + 1; break; } } }
      if (end < 0) clears++; else fails[Math.min(9, Math.floor(end * 10))]++;
    }
  } else {
    const dash = spec.tpl === "dash", goal = dash ? Array.from({ length: 45 }, (_, t) => dashSpeed(spec, t + 0.5)).reduce((a, x) => a + x, 0) : L.len;
    const ev = []; for (const r of L.rows) { if (r.k === "coin" || r.k === "heart" || r.z > goal) continue; const last = ev[ev.length - 1]; if (last && last.z === r.z) continue; ev.push({ z: r.z, k: r.k }); }
    const vAt = (z) => { if (!dash) return speedOf(spec); let d = 0, t = 0; while (d < z && t < 600) { d += dashSpeed(spec, t + 0.5); t++; } return dashSpeed(spec, t); };
    const vs = ev.map((e) => vAt(e.z));
    for (let b = 0; b < N; b++) {
      const rs = spec.rules || [], rp = (rs.includes("mirror") ? 0.08 : 0) + (rs.includes("night") ? 0.05 : 0);
      const sk = 0.3 + (0.7 * b) / (N - 1), react = 0.55 - 0.3 * sk; let hearts = (spec.rules || []).includes("onehp") ? 1 : 3, end = -1, pz = 0, pk = "";
      for (let i = 0; i < ev.length; i++) { const e = ev[i], dt = (e.z - pz) / vs[i], need = react + 0.15 + (pk && pk !== e.k ? 0.15 : 0) + (e.k === "mwall" || e.k === "blink" ? 0.12 : 0) + rp;
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
/// Studio 3: the Ring Puzzle's board — the rings engine's level id (the page and the server build it with their own copy of
/// world-rings-engine); its score: a clear, fewer moves than par … over par, hints cost a little
export const puzzleId = (spec) => `s:${spec.seed % 1000000}:${spec.speed}:${spec.coins}:${spec.walls}:${spec.gaps}:${spec.lasers}`;
export const puzzleHints = (spec) => ({ 30: 0, 45: 1, 60: 2, 90: 3 })[spec.len] || 0;
export const puzzleScore = (par, moves, hints = 0) => Math.max(100, 1000 - 40 * Math.max(0, moves - par) + 20 * Math.max(0, par - moves) - 50 * hints);
/// Studio 4: a quick-start level as a layout to edit by hand (its rows, its length) — the second tier starts from the first
export function toBuild(spec0) {
  const spec = clampSpec({ ...spec0, build: null }); delete spec.build; const L = genLevel(spec);
  if (JUMPS[spec.tpl]) return genJumpBuild(spec); // (SB-2)
  if (spec.tpl === "rhythm") return genBeatChart(spec); // (SB-3)
  if (spec.tpl === "race") return genRaceBuild(spec);
  if (spec.tpl === "defense") return cleanDefense({ td: 1, path: L.path, pads: L.pads, waves: L.waves.map((w) => [w.g, w.r, w.t]) }, spec); // (S4d)
  if (spec.tpl === "climb") return cleanClimb({ L: L.len, r: L.rows.map((r) => [r.z, CODE_C[r.k], r.lane]) }, spec); // (S4d)
  if (spec.tpl === "arena" || spec.tpl === "rush") return cleanArena({ p: [], w: L.waves.map((w) => [w.t, w.k, Math.round((w.a * 180) / Math.PI)]), c: L.coinsAt.map((c) => [c.t, c.x, c.z]) }, spec); // (S4c)
  const CODE = { wall: "w", gap: "g", laser: "l", coin: "c", heart: "h" };
  const len = spec.tpl === "dash" ? Math.max(BUILD.MIN, Math.min(600, Math.round(speedOf(spec) * 30 / BUILD.STEP) * BUILD.STEP)) : Math.max(BUILD.MIN, Math.min(BUILD.MAX, Math.round(L.len / BUILD.STEP) * BUILD.STEP));
  return cleanBuild({ L: len, r: L.rows.filter((r) => r.z <= len - 12).map((r) => [Math.round(r.z), CODE[r.k], r.lane || 0]) }, spec);
}
