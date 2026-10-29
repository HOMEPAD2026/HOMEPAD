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
  obby: { name: "Obby World", open: true }, // (OBBY, 2026-10-28: a 3D course placed freely in the 3D editor, smart objects, logic, looks)
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
  obby: { speed: "Run speed", coins: "Coins", walls: "Spinners & movers", gaps: "Gaps", lasers: "Lava", len: "Length" },
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
  const out = clampBase(s), lanes = out.tpl === "runner" || out.tpl === "dash", b = s.build && typeof s.build === "object" ? (lanes && Array.isArray(s.build.r) && !s.build.climb ? cleanBuild(s.build, out) : (out.tpl === "arena" || out.tpl === "rush") && Array.isArray(s.build.w) ? cleanArena(s.build, out) : out.tpl === "climb" && Array.isArray(s.build.r) && s.build.climb ? cleanClimb(s.build, out) : out.tpl === "defense" && s.build.td && Array.isArray(s.build.path) ? cleanDefense(s.build, out) : JUMPS[out.tpl] && s.build.jw && Array.isArray(s.build.c) ? cleanJump(s.build, out) : out.tpl === "rhythm" && s.build.bt && Array.isArray(s.build.n) ? cleanBeat(s.build, out) : out.tpl === "race" && s.build.rc && Array.isArray(s.build.r) ? (() => { const c = cleanRace(s.build); return c.r.length >= RACE.MIN ? c : null; })() : out.tpl === "obby" && s.build.ob && Array.isArray(s.build.o) ? cleanObby(s.build) : null) : null; // (a layout only for its own kind: a template change drops it)
  if (b) out.build = b;
  return out;
}
function clampBase(s) {
  const title = String(s.title || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24) || "My Sky Run";
  return {
    tpl: TEMPLATES[s.tpl] && TEMPLATES[s.tpl].open ? s.tpl : "runner", title: title === "My Sky Run" && s.tpl === "arena" ? "My Arena" : title === "My Sky Run" && s.tpl === "rush" ? "My Coin Rush" : title === "My Sky Run" && s.tpl === "dash" ? "My Infinity Dash" : title === "My Sky Run" && s.tpl === "puzzle" ? "My Ring Puzzle" : title === "My Sky Run" && s.tpl === "climb" ? "My Sky Climb" : title === "My Sky Run" && s.tpl === "defense" ? "My Tower Defense" : title === "My Sky Run" && (JUMPS[s.tpl] || s.tpl === "survival" || s.tpl === "rhythm" || s.tpl === "race" || s.tpl === "obby") && TEMPLATES[s.tpl] ? "My " + TEMPLATES[s.tpl].name.replace(/^JUMP WORLD$/, "Jump World") : title,
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
  if (spec.tpl === "obby") return genObby(spec);
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
    1: ["Copper ore", "ore"], 2: ["Silver ore", "ore"], 3: ["Gold ore", "ore"], x: ["Ghost block", "thing"], j: ["Vanish block", "thing"] },
  ORE: { 1: [2, 2], 2: [3, 5], 3: [4, 10] }, // (hits to break, coins)
  CHEST: 5, FOE: 1, BOSS: 20, BOSS_HP: 3 };
export const JUMPS = { jump: "jump", dungeon: "dungeon", escape: "escape", boss: "boss", mining: "mining" };
const SOLID = new Set(["g", "s", "i", "w", "p", "d", "r", "z", "1", "2", "3", "j"]); // (what you stand on in the grid itself; f / b / m / v are solid too, as things)
export const jwTimer = (spec) => (spec.tpl === "escape" || spec.tpl === "mining" ? spec.len * 2 : 0); // seconds (0: no clock)
export const jwSpeed = (spec) => 5.4 + spec.speed * 0.55; // metres a second running
// STB5 (2026-10-27): event blocks — WHEN something happens THEN something else, at most JEV.MAX a level, each once a run.
// WHEN coins (a = how many) · switch (pressed) · key (picked up) · boss (all bosses down) · time (a seconds) · col (you reach column a)
// THEN doors (every door opens) · say (b = one of JEV.MSGS) · time (+b seconds on the clock) · heart (+1) · coins (b coins rain down) · speed (faster for 6 s)
// STB7 (2026-10-27): WHEN every (each a seconds, again and again) · count (the counter reaches a); AND a second WHEN (x[4], x[5]) that
// must hold too; THEN add (+b on the counter) · show (the ghost blocks appear) · hide (the vanish blocks go) · flip (red ⇄ blue, like a switch)
export const JEV = { MAX: 10, WHEN: ["coins", "switch", "key", "boss", "time", "col", "every", "count"], THEN: ["doors", "say", "time", "heart", "coins", "speed", "add", "show", "hide", "flip"],
  AND: ["coins", "switch", "key", "boss", "time", "col", "count"],
  MSGS: ["Nice work!", "The doors are open!", "Hurry up!", "Watch out!", "Almost there!", "Bonus coins!", "The boss is angry!", "You found a secret!"] };
const evA = (w, v, W) => (w === "coins" || w === "time" || w === "count" ? Math.max(1, Math.min(300, Math.round(Number(v) || 10))) : w === "every" ? Math.max(3, Math.min(120, Math.round(Number(v) || 10))) : w === "col" ? Math.max(2, Math.min((W || JW.MAX) - 2, Math.round(Number(v) || 10))) : 0);
export function cleanEvents(ev, W) {
  const out = []; for (const x of (Array.isArray(ev) ? ev : []).slice(0, JEV.MAX * 2)) { if (!Array.isArray(x)) continue; const w = String(x[0]), t = String(x[2]);
    if (!JEV.WHEN.includes(w) || !JEV.THEN.includes(t)) continue;
    const a = evA(w, x[1], W);
    const b = t === "say" ? Math.max(0, Math.min(JEV.MSGS.length - 1, Math.round(Number(x[3]) || 0))) : t === "time" ? Math.max(5, Math.min(60, Math.round(Number(x[3]) || 10))) : t === "coins" ? Math.max(1, Math.min(20, Math.round(Number(x[3]) || 5))) : t === "add" ? Math.max(1, Math.min(10, Math.round(Number(x[3]) || 1))) : 0;
    const w2 = String(x[4] || ""); out.push(JEV.AND.includes(w2) ? [w, a, t, b, w2, evA(w2, x[5], W)] : [w, a, t, b]); if (out.length >= JEV.MAX) break; }
  return out;
}
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
  const ev = cleanEvents(b.ev, W);
  return ev.length ? { jw: 1, W, c: out, ev } : { jw: 1, W, c: out };
}
/// the grid as a lookup: cell → kind, plus the lists the engine and the bots need
export function jwGrid(B) {
  const at = new Map(), list = []; for (const c of B.c) { at.set(c[0] + ":" + c[1], c); list.push(c); }
  return { at, list, W: B.W, get: (x, y) => at.get(x + ":" + y), solid: (x, y) => { const c = at.get(x + ":" + y); return !!c && SOLID.has(c[2]); } };
}
/// where you can stand and get to (a rough walk: run along, jump up to REACH, fall any way; springs throw higher, doors and
/// switches are treated as passed) → { ok: the finish is reached, far: the furthest column, dead: [x] columns you can't pass }
export function jwReach(B) {
  const G = jwGrid(B), stand = (x, y) => y >= 0 && y < JW.H && x >= 0 && x < B.W && !G.solid(x, y) && !G.solid(x, y + 1) && (y === 0 ? false : G.solid(x, y - 1) || ["m", "v", "f", "b", "r", "u", "w", "x"].includes((G.get(x, y - 1) || [])[2]));
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
/// OBBY WORLD (2026-10-28, the owner's "easier and more premium, a Roblox feel" list): a 3D course placed freely in the 3D
/// scene editor — blocks, ramps, round platforms, lava, spinners, moving platforms, jump pads, checkpoints, coins, hearts,
/// Meshy props and the smart objects (doors opened by buttons on a channel, elevators, teleporter pairs, a shop, a boss) —
/// played from behind your own hero. build = { ob: 1, bp: a baseplate (0 / 1), o: [[k, x, y, z, ry, sx, sy, sz, c, a, b, g]]
/// (kind, the centre's bottom, a turn in degrees, the size, a colour, two options of the kind, a group), lg: the logic
/// [[when, its number, then, its number, again]], hg: the groups hidden at the start, lk: the look, ui: the HUD's pieces
/// (bits), cn: the cinematics (bits), av: your hero's gear / pet (bits), hp: hearts (0 = endless tries), tl: a time limit
/// in seconds (0 = none), q: the quest line, vl: what counter A is called, as: the maker's own Meshy assets }.
/// A run's dist: 100 a checkpoint reached (in the course's order), the whole at the goal; its coins: coins, the boss's
/// hits ×5 and what the logic gives.
export const OB = {
  R: 80, Y: 60, MAX: 300, LG: 16, TAGS: 32, SZ: 30, AS: 16, G: 32, TK: 16, KEYS: 8, EC: 3, /* (coins an enemy drops) */ MODES: ["obby", "combat", "race", "explore"], WINS: ["goal", "enemies", "collect", "race", "varA"],
  K: { b: [1, 4, 1, 4], r: [1, 4, 2, 6], y: [1, 4, 1, 4], k: [0, 4, 0.4, 4], s: [0, 8, 0.6, 0.6], m: [1, 4, 0.6, 4], p: [1, 2, 0.3, 2], c: [1, 3, 0.3, 3], S: [1, 3, 0.3, 3], g: [1, 3, 0.3, 3],
    o: [0, 1, 1, 1], h: [0, 1, 1, 1], d: [1, 3, 4, 0.5], u: [0, 1.6, 0.3, 1.6], e: [1, 3, 0.5, 3], t: [0, 2, 0.2, 2], n: [0, 1.2, 2, 1.2], B: [0, 3, 3, 3], x: [0, 2, 2, 2], X: [0, 2, 2, 2],
    E: [0, 1.2, 1.6, 1.2], R: [0, 5, 5, 0.4], Q: [0, 1, 1, 1], H: [1, 16, 5, 16], W: [0, 10, 2, 10], P: [1, 1.5, 1.5, 1.5], A: [0, 1, 1.8, 1] }, // (G1/G3 2026-10-28: enemies, race rings, collectibles, hills, water, crates to push, actors) // (solid?, its size when placed)
  CAP: { S: 1, g: 4, o: 200, h: 10, n: 4, B: 2, x: 40, X: 16, t: 16, d: 16, u: 16, e: 12, m: 30, s: 30, E: 40, R: 30, Q: 100, H: 20, W: 12, P: 20, A: 12 },
  // the two options a kind has: [label, min, max, default]
  OPT: { b: [["Surface", 0, 4, 0]], y: [["Surface", 0, 4, 0]], r: [["Surface", 0, 4, 0]], H: [["Surface", 0, 4, 0]], E: [["Health", 1, 20, 3], ["Type", 0, 2, 0]], R: [["Order", 1, 30, 1]], A: [["Look", 0, 2, 0], ["Says", 0, 11, 0]], s: [["Speed", 1, 5, 2], ["Direction", 0, 1, 0]], m: [["Axis", 0, 2, 0], ["Distance", 2, 20, 6]], p: [["Strength", 1, 3, 2]],
    d: [["Channel", 1, 8, 1], ["Opens", 0, 1, 0]], u: [["Channel", 1, 8, 1], ["Open for (s, 0 = stays)", 0, 60, 0]], e: [["Height", 2, 30, 8], ["Speed", 1, 5, 2]], t: [["Pair", 1, 8, 1], ["One way", 0, 1, 0]],
    n: [["Sells", 0, 3, 0], ["Price", 1, 50, 10]], B: [["Health", 3, 30, 8], ["Attack", 0, 2, 0]], x: [["Model", 0, 23, 0], ["Solid", 0, 1, 1]], X: [["Asset", 0, 15, 0], ["Solid", 0, 1, 1]] },
  COLORS: [0x5fd3ff, 0x7cf5c8, 0xffd23a, 0xff6fae, 0xb48cff, 0xff7a2e, 0xeef4fb, 0x3a4a6a, 0x39c46a, 0x9b6b3a, 0x1a2238, 0xff3b5c],
  WHEN: ["start", "button", "coins", "every", "after", "varA", "varB", "phase", "bosshalf", "boss", "checkpoint", "enemies", "collect", "ring", "touch", "broken"],
  THEN: ["open", "close", "toggle", "say", "addA", "addB", "setA", "setB", "phase", "show", "hide", "heart", "coins", "time", "speed", "win", "hurt", "track", "cutscene", "lose", "dmg", "sound", "spawn", "on", "off"],
  MSGS: ["Nice work!", "A door opened!", "Hurry up!", "Watch out!", "Almost there!", "Bonus coins!", "The boss is angry!", "You found a secret!", "Phase 2!", "Checkpoint!", "The shop is open!", "A new path opened!"],
  QUESTS: ["Reach the goal!", "Collect every coin!", "Defeat the boss!", "Find the hidden door!", "Escape before time runs out!", "Climb to the top!", "Press every button!", "Survive the spinners!", "Defeat every enemy!", "Fly through every ring!", "Find every gem!"],
  VARL: ["Score", "Keys", "Gems", "Kills", "Stars", "Points"],
  SHOP: [["speed", "⚡", "Speed boost"], ["djump", "🪽", "Double jump"], ["heart", "❤️", "Extra heart"], ["shield", "🛡️", "Shield"]],
  LOOKS: ["day", "sunset", "night", "mist", "toon", "space", "cine"],
  UI: { hearts: 1, coins: 2, timer: 4, boss: 8, quest: 16, varA: 32, best: 64, map: 128 }, UI0: 1 | 2 | 4 | 8 | 16,
  CN: { intro: 1, boss: 2, clear: 4 }, CN0: 7, AV: { gear: 1, pet: 2 }, AV0: 3,
  // Meshy's props already packed for the game (each one's file and its height when placed)
  PROPS: [["tree-round", "trees/tree-round", 4], ["tree-blossom", "trees/tree-blossom", 4.5], ["tree-pine", "trees/tree-pine", 5], ["bush", "trees/bush-cluster", 1.4], ["bench", "plaza/park-bench", 1], ["lamp", "plaza/street-lamp", 4],
    ["planter", "plaza/flower-planter", 1.2], ["crate", "plaza/goods-crate", 1.2], ["banner", "plaza/banner-pole", 5], ["hedge", "plaza/hedge-block", 1.4], ["sign", "plaza/signpost", 2.2], ["trophy", "studio/fx/trophy", 2],
    ["rocket", "studio/fx/rocket", 4], ["toy-cubes", "cc/props/toy-cubes", 2], ["holo", "cc/props/holo-board", 3], ["pot-tree", "cc/props/tree-pot", 3], ["statue", "cc/props/trophy-statue", 4], ["chest", "studio/jw/chest", 1],
    ["cannon", "studio/jw/cannon", 1.2], ["spring", "studio/jw/spring", 1], ["neon-prop", "studio/prop-neon", 3], ["jungle-prop", "studio/prop-jungle", 3], ["ice-prop", "studio/prop-ice", 3], ["lava-prop", "studio/prop-lava", 3]],
};
export const obSpeed = (spec) => 6 + spec.speed * 0.6; // metres a second running (×1.35 sprinting)
export const OBJ = { VY: 10, G: 25, AIR: 0.8, UP: 1.85, PAD: 7 }; // the jump: up speed, gravity, time in the air, how high, a jump pad's height a strength
export const obFar = (spec) => obSpeed(spec) * 1.35 * OBJ.AIR * 0.92; // the widest gap a sprinting jump clears
const q4 = (v, a, b) => Math.max(a, Math.min(b, Math.round((Number(v) || 0) * 4) / 4));
const iv = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
export function cleanObby(b) {
  const out = [], n = {};
  for (const x of (Array.isArray(b.o) ? b.o : []).slice(0, OB.MAX * 2)) {
    if (!Array.isArray(x)) continue; const k = String(x[0]), K = OB.K[k]; if (!K) continue;
    if ((n[k] || 0) >= (OB.CAP[k] || OB.MAX)) continue;
    const px = q4(x[1], -OB.R, OB.R), py = q4(x[2], -10, OB.Y), pz = q4(x[3], -OB.R, OB.R); if (![px, py, pz].every(Number.isFinite)) continue;
    const fix = k === "o" || k === "h" || k === "n" || k === "u" || k === "t" || k === "c" || k === "S" || k === "g" || k === "p" || k === "Q" || k === "A" || k === "E"; // (these keep their own size)
    const sx = fix ? K[1] : q4(x[5] || K[1], 0.25, OB.SZ), sy = fix ? K[2] : q4(x[6] || K[2], 0.25, OB.SZ), sz = fix ? K[3] : k === "y" || k === "H" ? sx : q4(x[7] || K[3], 0.25, OB.SZ);
    const O = OB.OPT[k] || [], a = O[0] ? iv(x[9], O[0][1], O[0][2], O[0][3]) : 0, bb = O[1] ? iv(x[10], O[1][1], O[1][2], O[1][3]) : 0;
    const q = [k, px, py, pz, ((iv(x[4], -720, 720, 0) % 360) + 360) % 360, sx, sy, sz, iv(x[8], 0, OB.COLORS.length - 1, 0), a, bb, iv(x[11], 0, OB.G, 0)], ex = cleanX(x[12], k, n); if (ex) q.push(ex);
    out.push(q); n[k] = (n[k] || 0) + 1;
    if (out.length >= OB.MAX) break;
  }
  if (!n.S) { if (out.length >= OB.MAX) out.pop(); out.unshift(["S", 0, 0, 0, 0, 3, 0.3, 3, 1, 0, 0, 0]); } // (a start, always)
  tagUp(out);
  const lg = [];
  for (const r of (Array.isArray(b.lg) ? b.lg : []).slice(0, OB.LG * 2)) { if (!Array.isArray(r)) continue; const w = String(r[0]), t = String(r[2]); if (!OB.WHEN.includes(w) || !OB.THEN.includes(t)) continue;
    const wa = w === "touch" || w === "broken" ? iv(r[1], 1, OB.TAGS, 1) : w === "button" ? iv(r[1], 1, 8, 1) : w === "coins" || w === "varA" || w === "varB" ? iv(r[1], 1, 999, 10) : w === "every" ? iv(r[1], 2, 120, 10) : w === "after" ? iv(r[1], 1, 600, 10) : w === "phase" ? iv(r[1], 1, 5, 2) : w === "checkpoint" || w === "ring" ? iv(r[1], 1, 30, 1) : w === "collect" ? iv(r[1], 1, 999, 5) : 0;
    const ta = t === "open" || t === "close" || t === "toggle" ? iv(r[3], 1, 8, 1) : t === "say" ? iv(r[3], 0, OB.MSGS.length - 1, 0) : t === "dmg" || t === "spawn" || t === "on" || t === "off" ? iv(r[3], 1, OB.TAGS, 1) : t === "sound" ? iv(r[3], 0, CMP_SND.length - 1, 0) : t === "addA" || t === "addB" ? iv(r[3], -10, 10, 1) || 1 : t === "setA" || t === "setB" ? iv(r[3], 0, 999, 0)
      : t === "phase" ? iv(r[3], 1, 5, 2) : t === "show" || t === "hide" ? iv(r[3], 1, OB.G, 1) : t === "track" ? iv(r[3], 1, OB.TK, 1) : t === "heart" ? iv(r[3], 1, 3, 1) : t === "coins" ? iv(r[3], 1, 20, 5) : t === "time" ? iv(r[3], 5, 60, 10) : t === "speed" ? iv(r[3], 2, 10, 4) : 0;
    const rr = [w, wa, t, ta, w === "every" || w === "touch" ? 1 : Number(r[4]) === 1 ? 1 : 0], cd = condOf(r[5]); if (cd || t === "dmg") rr.push(cd || 0); if (t === "dmg") rr.push(iv(r[6], 1, 20, 1));
    lg.push(rr); if (lg.length >= OB.LG) break; }
  const as = (Array.isArray(b.as) ? b.as : []).map(String).filter((s) => /^[a-z0-9]{6,40}$/.test(s)).slice(0, OB.AS);
  return { ob: 1, bp: Number(b.bp) === 1 ? 1 : 0, o: out, lg, hg: [...new Set((Array.isArray(b.hg) ? b.hg : []).map((g) => iv(g, 1, OB.G, 0)).filter((g) => g))].slice(0, OB.G),
    lk: OB.LOOKS.includes(b.lk) ? b.lk : "day", ui: iv(b.ui, 0, 255, OB.UI0), cn: iv(b.cn, 0, 7, OB.CN0), av: iv(b.av, 0, 3, OB.AV0), hp: iv(b.hp, 0, 5, 3), tl: iv(b.tl, 0, 900, 0), q: iv(b.q, 0, OB.QUESTS.length - 1, 0), vl: iv(b.vl, 0, OB.VARL.length - 1, 0), as, ...cleanObbyX(b, out.length) };
}
/// G1/G3 (2026-10-28, the owner's "one making system for every genre"): the course's mode (obby / combat / race /
/// explore) and how it's won, laps, gravity, progress saved for each player, the hierarchy (named groups with a parent),
/// animation tracks (an object's moves over time, looped or played by the logic), a camera cutscene, prefab instances
function cleanObbyX(b, n) {
  const f = (v, a, z) => Math.max(a, Math.min(z, Math.round((Number(v) || 0) * 4) / 4)), md = OB.MODES.includes(b.md) ? b.md : "obby";
  const gn = []; for (const g of (Array.isArray(b.gn) ? b.gn : []).slice(0, OB.G * 2)) { if (!Array.isArray(g)) continue; const id = iv(g[0], 1, OB.G, 0); if (!id || gn.some((x) => x[0] === id)) continue;
    const par = iv(g[2], 0, OB.G, 0); gn.push([id, String(g[1] || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 24) || "Group " + id, par === id ? 0 : par]); }
  for (const g of gn) { let p = g[2], hops = 0; while (p && hops < OB.G) { if (p === g[0]) { g[2] = 0; break; } const q = gn.find((x) => x[0] === p); p = q ? q[2] : 0; hops++; } } // (no loops in the tree)
  const tk = []; for (const t of (Array.isArray(b.tk) ? b.tk : []).slice(0, OB.TK * 2)) { if (!Array.isArray(t)) continue; const oi = Math.round(Number(t[0])); if (!(oi >= 0 && oi < n) || tk.some((x) => x[0] === oi) || !Array.isArray(t[3])) continue; // (a real piece, one track each)
    const keys = t[3].filter(Array.isArray).slice(0, OB.KEYS).map((k) => [f(k[0], 0, 60), f(k[1], -40, 40), f(k[2], -20, 40), f(k[3], -40, 40), iv(k[4], -720, 720, 0)]).sort((a, c) => a[0] - c[0]);
    if (keys.length < 2) continue; tk.push([oi, Number(t[1]) === 1 ? 1 : 0, Number(t[2]) === 1 ? 1 : 0, keys]); if (tk.length >= OB.TK) break; }
  const cs = (Array.isArray(b.cs) ? b.cs : []).filter(Array.isArray).slice(0, OB.KEYS).map((k) => [f(k[0], 0, 30), f(k[1], -120, 120), f(k[2], -10, 90), f(k[3], -120, 120), f(k[4], -120, 120), f(k[5], -10, 90), f(k[6], -120, 120)]).sort((a, c) => a[0] - c[0]);
  const pi = (Array.isArray(b.pi) ? b.pi : []).filter((x) => Array.isArray(x) && /^[a-z0-9]{6,24}$/.test(String(x[1]))).slice(0, OB.G).map((x) => [iv(x[0], 1, OB.G, 1), String(x[1])]);
  return { md, win: OB.WINS.includes(b.win) ? b.win : md === "combat" ? "enemies" : md === "race" ? "race" : md === "explore" ? "collect" : "goal", lp: iv(b.lp, 1, 5, 1), gv: iv(b.gv, 30, 200, 100), sv: Number(b.sv) === 1 ? 1 : 0,
    gn, tk, ...(cs.length >= 2 ? { cs } : {}), pi, ...(cleanHf(b.hf) ? { hf: cleanHf(b.hf) } : {}) };
}
/// G2 PREFABS (the owner: "a boss made once — its health, attacks, animation, reward and UI as one bundle, used again in
/// any game"): a set of pieces round an origin, with the rules and tracks that belong to them and a few facts for the
/// market card. pack: the chosen pieces of a course → a prefab; place: a prefab into a course at a point and a turn — its
/// pieces get a new group of their own (the prefab's parent in the hierarchy), free channels, free teleporter pairs and
/// free track numbers, and its rules follow them.
export const PF = { MAX: 120, LG: 8, KINDS: ["boss", "enemy", "building", "device", "terrain", "set"], LIC: ["cc-by", "remix", "personal"], NAME: 30 };
export function cleanPrefab(p) {
  if (!p || typeof p !== "object") return null; const name = String(p.n || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, PF.NAME); if (name.length < 2) return null;
  const C = cleanObby({ o: (Array.isArray(p.o) ? p.o : []).slice(0, PF.MAX).map((q) => (Array.isArray(q) && q[0] === "S" ? null : q)).filter(Boolean), lg: (p.lg || []).slice(0, PF.LG), tk: p.tk || [] });
  const o = C.o.filter((q) => q[0] !== "S" || (p.o || []).some((x) => x && x[0] === "S")); if (!o.length || o.length > PF.MAX) return null;
  const tk = (C.tk || []).map((t) => [t[0] - (C.o.length - o.length), t[1], t[2], t[3]]).filter((t) => t[0] >= 0);
  const boss = o.find((q) => q[0] === "B"), en = o.filter((q) => q[0] === "E");
  const kind = PF.KINDS.includes(p.k) ? p.k : boss ? "boss" : en.length ? "enemy" : o.some((q) => q[0] === "H" || q[0] === "W") ? "terrain" : o.some((q) => "dutne".includes(q[0])) ? "device" : "building";
  const reward = C.lg.reduce((a, r) => a + (r[2] === "coins" ? r[3] : 0), 0) + (boss ? boss[9] * 5 : 0) + en.reduce((a, q) => a + q[9] * 3, 0);
  return { pf: 1, n: name, k: kind, o, lg: C.lg, tk, meta: { pieces: o.length, hp: boss ? boss[9] : en.reduce((a, q) => a + q[9], 0), atk: boss ? boss[10] : 0, reward, rules: C.lg.length, tracks: tk.length } };
}
/// the chosen pieces (indexes into B.o) as a prefab, round their bottom centre
export function packPrefab(B, idx, name, kind) {
  const set = [...new Set(idx)].filter((i) => B.o[i] && B.o[i][0] !== "S").sort((a, b) => a - b); if (!set.length) return null;
  const xs = set.map((i) => B.o[i][1]), zs = set.map((i) => B.o[i][3]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, cy = Math.min(...set.map((i) => B.o[i][2]));
  const o = set.map((i) => { const q = B.o[i].slice(); q[1] = Math.round((q[1] - cx) * 4) / 4; q[2] = Math.round((q[2] - cy) * 4) / 4; q[3] = Math.round((q[3] - cz) * 4) / 4; q[11] = 0; return q; });
  const chans = new Set(set.map((i) => B.o[i]).filter((q) => q[0] === "d" || q[0] === "u").map((q) => q[9])), hasB = set.some((i) => B.o[i][0] === "B"), hasE = set.some((i) => B.o[i][0] === "E");
  const tkMap = new Map(); (B.tk || []).forEach((t, n) => { if (set.includes(t[0])) tkMap.set(n + 1, tkMap.size + 1); });
  const tk = (B.tk || []).filter((t) => set.includes(t[0])).map((t) => [set.indexOf(t[0]), t[1], t[2], t[3]]);
  // the rules that belong to these pieces: their channels, their boss / enemies, their tracks
  const mine = (r) => (r[0] === "button" && chans.has(r[1])) || (["open", "close", "toggle"].includes(r[2]) && chans.has(r[3])) || ((r[0] === "bosshalf" || r[0] === "boss") && hasB) || (r[0] === "enemies" && hasE) || (r[2] === "track" && tkMap.has(r[3]));
  const lg = (B.lg || []).filter(mine).map((r) => (r[2] === "track" ? [r[0], r[1], r[2], tkMap.get(r[3]) || 1, r[4]] : r.slice())).slice(0, PF.LG);
  return cleanPrefab({ n: name, k: kind, o, lg, tk });
}
export function placePrefab(B0, P0, at = [0, 0, 0], turn = 0, id = "") {
  const B = JSON.parse(JSON.stringify(B0)), P = cleanPrefab(P0); if (!P) return { B, ok: false, why: "bad" };
  if (B.o.length + P.o.length > OB.MAX) return { B, ok: false, why: "full" };
  const used = (k, ix) => new Set(B.o.filter((q) => q[0] === k || (Array.isArray(k) && k.includes(q[0]))).map((q) => q[ix]));
  const freeOf = (taken, max) => { for (let i = 1; i <= max; i++) if (!taken.has(i)) return i; return 0; };
  const gUsed = new Set([...B.o.map((q) => q[11]), ...(B.gn || []).map((g) => g[0])]), g = freeOf(gUsed, OB.G); if (!g) return { B, ok: false, why: "groups" };
  const chMap = new Map(), chTaken = used(["d", "u"], 9); for (const q of P.o) if ((q[0] === "d" || q[0] === "u") && !chMap.has(q[9])) { const c = freeOf(chTaken, 8) || q[9]; chMap.set(q[9], c); chTaken.add(c); }
  const tpMap = new Map(), tpTaken = used("t", 9); for (const q of P.o) if (q[0] === "t" && !tpMap.has(q[9])) { const c = freeOf(tpTaken, 8) || q[9]; tpMap.set(q[9], c); tpTaken.add(c); }
  const r = (turn * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), base = B.o.length;
  for (const q0 of P.o) { const q = q0.slice(), x = q[1], z = q[3]; q[1] = Math.round((at[0] + x * c + z * s) * 4) / 4; q[3] = Math.round((at[2] - x * s + z * c) * 4) / 4; q[2] = Math.round((at[1] + q[2]) * 4) / 4; q[4] = (((q[4] + turn) % 360) + 360) % 360; q[11] = g;
    if (q[0] === "d" || q[0] === "u") q[9] = chMap.get(q[9]); if (q[0] === "t") q[9] = tpMap.get(q[9]); B.o.push(q); }
  const tk0 = (B.tk || []).length;
  for (const r0 of P.lg) { if (B.lg.length >= OB.LG) break; const rr = r0.slice(); if (rr[0] === "button") rr[1] = chMap.get(rr[1]) || rr[1]; if (["open", "close", "toggle"].includes(rr[2])) rr[3] = chMap.get(rr[3]) || rr[3]; if (rr[2] === "track") rr[3] = tk0 + rr[3]; B.lg.push(rr); }
  B.tk = [...(B.tk || []), ...(P.tk || []).map((t) => [base + t[0], t[1], t[2], t[3]])].slice(0, OB.TK);
  B.gn = [...(B.gn || []), [g, P.n, 0]]; if (id) B.pi = [...(B.pi || []), [g, id]];
  return { B: cleanObby(B), ok: true, g };
}
/// G2: ARCIRCLE's own prefabs — ready bundles for any course (the editor's library, the director's "add a cave / a house /
/// an enemy camp"): each a set of pieces round its bottom centre with its rules
const pk = (k, x, y, z, sx, sy, sz, c = 0, a, b, ry = 0) => { const O = OB.OPT[k] || [], K = OB.K[k]; return [k, x, y, z, ry, sx || K[1], sy || K[2], sz || K[3], c, a != null ? a : O[0] ? O[0][3] : 0, b != null ? b : O[1] ? O[1][3] : 0, 0]; };
export const PREFABS = {
  bxarena: { n: "Boss arena", k: "boss", o: [pk("y", 0, -1, 0, 18, 1, 18, 4), pk("B", 0, 0, 0, 3, 3, 3, 11, 10, 1), pk("k", -6, 0, 6, 2.5, 0.3, 2.5, 5), pk("k", 6, 0, -6, 2.5, 0.3, 2.5, 5), pk("h", -7, 0.2, -7), pk("o", 7, 0.6, 7), pk("o", -7, 0.6, 7), pk("o", 7, 0.6, -7)], lg: [["bosshalf", 0, "say", 6, 0], ["bosshalf", 0, "phase", 2, 0]] },
  bxcamp: { n: "Enemy camp", k: "enemy", o: [pk("b", 0, -1, 0, 14, 1, 14, 9), pk("E", -3, 0, 2, 0, 0, 0, 0, 3, 0), pk("E", 3, 0, 2, 0, 0, 0, 0, 3, 0), pk("E", 0, 0, -3, 0, 0, 0, 0, 4, 2), pk("P", -5, 0, -5, 1.5, 1.5, 1.5, 9), pk("P", 5, 0, -5, 1.5, 1.5, 1.5, 9), pk("x", -6, 0, 5, 1.2, 1.2, 1.2, 0, 7, 1), pk("x", 6, 0, 5, 1.2, 1.2, 1.2, 0, 7, 1)], lg: [["enemies", 0, "say", 0, 0], ["enemies", 0, "coins", 10, 0]] },
  bxhouse: { n: "House", k: "building", o: [pk("b", 0, -1, 0, 10, 1, 8, 9), pk("b", 0, 0, -3.75, 10, 4, 0.5, 6), pk("b", -4.75, 0, 0, 0.5, 4, 8, 6), pk("b", 4.75, 0, 0, 0.5, 4, 8, 6), pk("b", -3.25, 0, 3.75, 3.5, 4, 0.5, 6), pk("b", 3.25, 0, 3.75, 3.5, 4, 0.5, 6), pk("b", 0, 3, 3.75, 3, 1, 0.5, 6), pk("r", 0, 4, -2, 10.5, 2, 4.5, 11, 0, 0, 180), pk("r", 0, 4, 2, 10.5, 2, 4.5, 11), pk("A", 0, 0, -1, 0, 0, 0, 0, 0, 0), pk("x", 3, 0, -2, 1, 1, 1, 0, 4, 1)], lg: [] },
  bxcave: { n: "Cave", k: "terrain", o: [pk("b", 0, -1, 0, 16, 1, 12, 7), pk("b", 0, 0, -5.5, 16, 5, 1, 7), pk("b", -7.5, 0, 0, 1, 5, 12, 7), pk("b", 7.5, 0, 0, 1, 5, 12, 7), pk("b", 0, 5, 0, 16, 1.5, 12, 7), pk("b", -4.5, 0, 5.5, 7, 5, 1, 7), pk("b", 4.5, 0, 5.5, 3, 5, 1, 7), pk("Q", -4, 0.4, -3), pk("Q", 4, 0.4, -3), pk("k", 0, 0, -1, 3, 0.3, 2, 5), pk("E", -4, 0, 1, 0, 0, 0, 0, 2, 1), pk("x", 5.5, 0, -4, 1, 1, 1, 0, 17, 1)], lg: [] },
  bxgates: { n: "Race gates", k: "set", o: [pk("b", 0, -1, 0, 6, 1, 30, 6, 4), pk("R", 0, 0, -10, 5, 5, 0.4, 0, 1), pk("R", 0, 0, 0, 5, 5, 0.4, 0, 2), pk("R", 0, 0, 10, 5, 5, 0.4, 0, 3), pk("p", 0, 0, 13.5, 2, 0.3, 2, 1, 1)], lg: [] },
  bxvault: { n: "Treasure vault", k: "device", o: [pk("b", 0, -1, 0, 10, 1, 10, 7), pk("b", 0, 0, -4.75, 10, 4, 0.5, 7), pk("b", -4.75, 0, 0, 0.5, 4, 10, 7), pk("b", 4.75, 0, 0, 0.5, 4, 10, 7), pk("b", -3.25, 0, 4.75, 3.5, 4, 0.5, 7), pk("b", 3.25, 0, 4.75, 3.5, 4, 0.5, 7), pk("d", 0, 0, 4.75, 3, 4, 0.5, 4, 1, 0), pk("u", 0, 0, 8, 0, 0, 0, 0, 1, 0), pk("x", 0, 0, -2, 1, 1, 1, 0, 17, 1), pk("Q", -2, 0.4, -2), pk("Q", 2, 0.4, -2), pk("o", 0, 0.6, 0)], lg: [["button", 1, "say", 1, 0]] },
};
/// a solid thing's top as a rectangle on the ground (its turn folded into the box round it): what you stand on
export function obTops(B) {
  const T = [];
  B.o.forEach((o, i) => { const [k, x, y, z, ry, sx, sy, sz, , a, bb] = o; if (!OB.K[k][0] && !((k === "x" || k === "X") && bb) && k !== "W") return; if (k === "d") return; // (a door is a wall, not a floor; water is swum across)
    const r = (ry * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)); let hw = (sx * c + sz * s) / 2, hd = (sx * s + sz * c) / 2, top = y + sy, top2 = top;
    if (k === "m") { if (a === 0) hw += bb / 2; else if (a === 2) hd += bb / 2; else top2 = top + bb; } // (a mover's reach along its axis)
    if (k === "e") top2 = top + a;
    T.push({ i, k, x, z, hw, hd, top, top2, bot: k === "H" ? y : top }); }); // (a hill is walked up from its foot)
  if (B.bp || B.hf) T.push({ i: -1, k: "bp", x: 0, z: 0, hw: OB.R, hd: OB.R, top: 0, top2: 0, bot: 0 });
  return T;
}
const gapOf = (p, q) => Math.hypot(Math.max(0, Math.abs(p.x - q.x) - p.hw - q.hw), Math.max(0, Math.abs(p.z - q.z) - p.hd - q.hd));
/// can the goal be reached from the start, hopping top to top (a sprinting jump, a pad's lift, an elevator's ride, a
/// teleporter's pair)? → { ok, seen: the tops reached, path: the tops from the start to a goal, far: the thing indexes out of reach }
export function obReach(B, spec = { speed: 3 }) {
  const gk = 100 / (B.gv || 100), T = obTops(B), far = obFar(spec) * gk, on = (o) => T.findIndex((t) => Math.abs(o[1] - t.x) <= t.hw + 0.3 && Math.abs(o[3] - t.z) <= t.hd + 0.3 && o[2] >= t.top - 0.6 && o[2] <= t.top2 + 0.8);
  const S = B.o.find((o) => o[0] === "S"), s0 = S ? on(S) : -1, tele = new Map();
  B.o.forEach((o) => { if (o[0] === "t") { const ti = on(o); if (ti >= 0) { const l = tele.get(o[9]) || []; l.push({ ti, one: o[10] }); tele.set(o[9], l); } } });
  const pads = new Map(); B.o.forEach((o) => { if (o[0] === "p") { const ti = on(o); if (ti >= 0) pads.set(ti, Math.max(pads.get(ti) || 0, o[9])); } });
  const prev = new Map(), Q = []; if (s0 >= 0) { prev.set(s0, -1); Q.push(s0); }
  while (Q.length) { const i = Q.shift(), p = T[i], lift = (OBJ.UP + (pads.get(i) || 0) * OBJ.PAD) * gk + (p.k === "W" ? 1.5 : 0), hi = p.top2;
    const go = (j) => { if (!prev.has(j)) { prev.set(j, i); Q.push(j); } };
    for (let j = 0; j < T.length; j++) { if (prev.has(j)) continue; const q = T[j], up = q.bot - hi, d = gapOf(p, q); if (up > lift) continue; if (d <= far + Math.min(4, Math.max(0, -up) * 0.5) + (pads.get(i) ? 2 : 0)) go(j); }
    for (const l of tele.values()) { const me = l.findIndex((t) => t.ti === i); if (me < 0 || l.length < 2 || (l.some((t) => t.one) && me !== 0)) continue; l.forEach((t, k) => { if (k !== me) go(t.ti); }); } } // (a one-way pair sends only from its first)
  // G1: what wins the game — the goal, every enemy, every collectible, the race's rings, or the rules alone (then the start is enough)
  const win = B.win || "goal", tk = win === "enemies" ? "EB" : win === "collect" ? "Q" : win === "race" ? "R" : "", reachT = (o) => { let best = -1, bd = 1e9; prev.forEach((_, j) => { const t = T[j], d = Math.hypot(Math.max(0, Math.abs(o[1] - t.x) - t.hw), Math.max(0, Math.abs(o[3] - t.z) - t.hd)), up = o[2] - t.top2;
      if (d <= far + 1 && up <= (OBJ.UP + 1) * gk + (o[0] === "R" ? 1 : 0) && up >= -6 && d < bd) { bd = d; best = j; } }); return best; };
  let gi = null;
  if (win === "goal") { const goals = T.map((t, j) => (t.k === "g" ? j : -1)).filter((j) => j >= 0); gi = goals.find((j) => prev.has(j)); }
  else if (tk) { const at = B.o.filter((o) => tk.includes(o[0]) && !(o[12] && o[12].po)).map(reachT); /* (the enemies' win: bosses count too) */ if (at.length && at.every((j) => j >= 0)) gi = at.reduce((a, j) => (order(prev, j) > order(prev, a) ? j : a), at[0]); if (!at.length) gi = null; }
  else if (s0 >= 0) gi = [...prev.keys()].pop();
  const path = []; if (gi != null) { let j = gi; while (j >= 0) { path.unshift(j); j = prev.get(j); } }
  const farI = []; B.o.forEach((o, i) => { if (OB.K[o[0]][0] || o[0] === "x" || o[0] === "X") { const t = T.findIndex((q) => q.i === i); if (t >= 0 && !prev.has(t)) farI.push(i); } });
  return { ok: gi != null, seen: prev, path, T, far: farI };
}
const order = (prev, j) => { let n = 0, k = j; while (k >= 0 && n < 400) { k = prev.get(k); n++; } return n; }; // (hops from the start)
/// the course's order: the start, then each checkpoint as the way to the goal passes it (or by how far it is from the start)
export function obOrder(B, R) {
  const T = R.T, at = (o) => T.findIndex((t) => Math.abs(o[1] - t.x) <= t.hw + 0.3 && Math.abs(o[3] - t.z) <= t.hd + 0.3 && Math.abs(o[2] - t.top) < 0.9);
  const S = B.o.find((o) => o[0] === "S") || [0, 0, 0, 0], cps = B.o.map((o, i) => (o[0] === "c" ? i : -1)).filter((i) => i >= 0);
  const step = (i) => { const t = at(B.o[i]), p = R.path.indexOf(t); return p >= 0 ? p : 1e3 + Math.hypot(B.o[i][1] - S[1], B.o[i][3] - S[3]); };
  return cps.sort((a, b) => step(a) - step(b));
}
export function genObby(spec) {
  const B = compOf(spec.build && spec.build.ob ? spec.build : genObbyBuild(spec)), R = obReach(B, spec), cps = obOrder(B, R), n = (k) => B.o.filter((o) => o[0] === k && !(o[12] && o[12].po)).length;
  const bossHp = B.o.filter((o) => o[0] === "B").reduce((s, o) => s + o[9], 0), give = B.lg.reduce((s, r) => s + (r[2] === "coins" ? r[3] * (r[4] ? 20 : 1) : 0), 0);
  const pkC = B.o.reduce((s0, o) => s0 + (o[12] && o[12].pk && o[12].pk[0] === 0 ? o[12].pk[1] : 0), 0);
  return { obby: true, built: !!(spec.build && spec.build.ob), B, R, cps, len: (cps.length + 1) * 100, coins: n("o") + bossHp * 5 + give + n("E") * OB.EC + pkC, v: obSpeed(spec), tl: B.tl };
}
/// a quick-start course from the knobs (and the director's wishes): sections of hops, lava bridges, spinners, movers, pads
/// and stairs, a checkpoint after each, the goal at the end; turns keep it inside the map
export function genObbyBuild(spec, want = {}) {
  let s = spec.seed >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const md = OB.MODES.includes(want.md) ? want.md : "obby", o = [], far = obFar(spec) * 0.8, secs = want.secs || ({ 30: 4, 45: 6, 60: 8, 90: 11 })[spec.len] || 6, col = () => Math.floor(rnd() * 6);
  let x = 0, y = 0, z = 0, h = 0, cp = 0; const dir = () => [Math.sin(h), Math.cos(h)];
  const put = (k, px, py, pz, sx, sy, sz, c = 0, a, b, ry = Math.round((h * 180) / Math.PI), g = 0) => { const O = OB.OPT[k] || []; o.push([k, px, py, pz, ry, sx, sy, sz, c, a != null ? a : O[0] ? O[0][3] : 0, b != null ? b : O[1] ? O[1][3] : 0, g]); };
  const fwd = (d) => { const [dx, dz] = dir(); x += dx * d; z += dz * d; };
  put("b", 0, -1, 0, 8, 1, 8, 6); put("S", 0, 0, 0, 3, 0.3, 3, 1);
  const kinds = ["hop", "lava", "spin", "move", "pad", "stairs"].filter((k) => (k === "lava" ? spec.lasers > 0 : k === "spin" || k === "move" ? spec.walls > 0 : k === "hop" ? true : k === "pad" ? spec.gaps > 0 || spec.walls > 0 : true));
  fwd(4);
  for (let i = 0; i < secs; i++) {
    if (Math.hypot(x, z) > OB.R - 30) h = Math.atan2(-x, -z) + (rnd() - 0.5) * 0.6; else if (rnd() < 0.35) h += (rnd() < 0.5 ? -1 : 1) * Math.PI / 2;
    const kind = i === secs - 1 && want.boss ? "arena" : kinds[Math.floor(rnd() * kinds.length)];
    if (kind === "hop") { const n = 3 + Math.floor(rnd() * 3); for (let j = 0; j < n; j++) { const gap = 1.5 + rnd() * (far - 1.5) * (0.4 + spec.gaps * 0.2), w = 2.5 + rnd() * 2; fwd(gap + w / 2 + 1); y = Math.max(0, y + (rnd() - 0.4) * 1.6); put(rnd() < 0.3 ? "y" : "b", x, y - 1, z, w, 1, w, col()); fwd(w / 2); if (rnd() < spec.coins * 0.18) put("o", x, y + 0.6, z, 1, 1, 1); } }
    else if (kind === "lava") { fwd(4); put("b", x, y - 1, z, 4, 1, 12, 6); const [dx, dz] = dir(); for (let j = 0; j < spec.lasers + 1; j++) { const t = -4 + j * (8 / Math.max(1, spec.lasers)), side = j % 2 ? 1 : -1; put("k", x + dx * t + dz * side * 1, y, z + dz * t - dx * side * 1, 2, 0.3, 2.5, 5); } for (let j = 0; j < spec.coins; j++) put("o", x + dx * (j * 2 - 4), y + 0.6, z + dz * (j * 2 - 4), 1, 1, 1); fwd(6); }
    else if (kind === "spin") { fwd(6); put("y", x, y - 1, z, 10, 1, 10, col()); for (let j = 0; j < Math.min(2, spec.walls); j++) put("s", x, y + 0.4 + j * 0.9, z, 9, 0.5, 0.5, 11, Math.min(5, 1 + spec.walls), j % 2); for (let j = 0; j < spec.coins; j++) { const a = (j / Math.max(1, spec.coins)) * 6.28; put("o", x + Math.cos(a) * 3, y + 0.6, z + Math.sin(a) * 3, 1, 1, 1); } fwd(5); }
    else if (kind === "move") { fwd(3); const [dx] = dir(), ax = Math.abs(dx) > 0.5 ? 0 : 2; fwd(far * 0.6 + 2); put("m", x, y - 0.6, z, 3.5, 0.6, 3.5, 2, ax, Math.min(12, 4 + spec.walls * 2)); fwd(far * 0.6 + 5); put("b", x, y - 1, z, 5, 1, 5, col()); fwd(2.5); }
    else if (kind === "pad") { fwd(3); put("b", x, y - 1, z, 4, 1, 4, col()); put("p", x, y, z, 2, 0.3, 2, 1, 1); fwd(4); y += 5; put("b", x, y - 1, z, 5, 1, 5, col()); if (spec.coins) put("o", x, y + 0.6, z, 1, 1, 1); fwd(2.5); }
    else if (kind === "stairs") { for (let j = 0; j < 3; j++) { fwd(3); put("r", x, y, z, 3, 1.4, 4, col()); fwd(2); y += 1.4; put("b", x, y - 1, z, 3, 1, 3, col()); } }
    else if (kind === "arena") { fwd(9); put("y", x, y - 1, z, 16, 1, 16, 4); put("B", x, y, z, 3, 3, 3, 11, Math.min(30, 5 + spec.walls * 3), spec.speed >= 4 ? 1 : 0); fwd(9); }
    if (want.doors && i === Math.floor(secs / 2)) { fwd(2); const [dx, dz] = dir(); put("b", x, y - 1, z, 6, 1, 6, 6); put("u", x - dz * 2, y, z + dx * 2, 1.6, 0.3, 1.6, 2, 1, 0); fwd(3); put("d", x, y, z, 4, 4, 0.5, 4, 1, 0); fwd(1); }
    if (want.shop && i === 1) { const [dx, dz] = dir(); put("b", x + dz * 5, y - 1, z - dx * 5, 4, 1, 4, 6); put("n", x + dz * 5, y, z - dx * 5, 1.2, 2, 1.2, 0, 1, 10); }
    if (want.elevator && i === Math.floor(secs / 3)) { fwd(3); put("e", x, y - 0.5, z, 3, 0.5, 3, 1, 8, 2); fwd(3); y += 8; put("b", x, y - 1, z, 5, 1, 5, col()); fwd(2.5); }
    if (md === "combat" && i % 2 === 1 && i < secs - 1) { fwd(7); put("y", x, y - 1, z, 11, 1, 11, col()); const n = 1 + Math.floor(rnd() * 2) + (spec.walls > 3 ? 1 : 0); for (let j = 0; j < n; j++) { const a = (j / n) * 6.28 + rnd(); put("E", x + Math.cos(a) * 3, y + (j === 2 ? 2 : 0), z + Math.sin(a) * 3, 1.2, 1.6, 1.2, 0, Math.min(6, 2 + spec.speed - 2 + Math.floor(i / 3)), i < 2 ? 0 : j === 2 ? 1 : Math.floor(rnd() * 3)); } fwd(6); }
    if (md === "race") { fwd(1.5); put("R", x, y, z, 5, 5, 0.4, 0, i + 1); fwd(1.5); }
    fwd(3); put("b", x, y - 1, z, 5, 1, 5, 6); put(i === secs - 1 ? "g" : "c", x, y, z, 3, 0.3, 3, i === secs - 1 ? 2 : 1); cp++; fwd(2.5);
    if (md === "explore" && rnd() < 0.7) put("Q", x + (rnd() - 0.5) * 3, y + 0.4, z + (rnd() - 0.5) * 3, 1, 1, 1);
  }
  if (md === "explore") { for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = 18 + rnd() * 45, hx = Math.cos(a) * r, hz = Math.sin(a) * r; const hh = Math.round((3 + rnd() * 4) * 4) / 4; put("H", hx, 0, hz, 12 + rnd() * 10, hh, 0, 8, 0); put("Q", hx, hh + 0.4, hz, 1, 1, 1); }
    for (let i = 0; i < 3; i++) { const a = rnd() * 6.28, r = 20 + rnd() * 40; put("W", Math.cos(a) * r, 0, Math.sin(a) * r, 10, 1.6, 10, 0); put("Q", Math.cos(a) * r, 0.4, Math.sin(a) * r, 1, 1, 1); } } // (pools on the baseplate: swum through)
  for (let i = 0; i < (want.props != null ? want.props : 6); i++) { const a = rnd() * 6.28, r = 10 + rnd() * 60; put("x", Math.cos(a) * r, -4 - rnd() * 3, Math.sin(a) * r, 1, 1, 1, 0, Math.floor(rnd() * 4), 0, Math.floor(rnd() * 360)); } // (trees far below, round the course)
  const lg = want.boss ? [["bosshalf", 0, "say", 6, 0], ["boss", 0, "say", 0, 0]] : [];
  if (want.doors) lg.push(["button", 1, "say", 1, 0]);
  return cleanObby({ o, lg, md, bp: want.bp || md === "explore" ? 1 : 0, lk: want.look || ({ neon: "night", jungle: "day", ice: "mist", lava: "sunset", candy: "toon" })[spec.theme] || "day", ui: OB.UI0 | (want.boss ? OB.UI.boss : 0) | (md !== "obby" ? OB.UI.map : 0), cn: OB.CN0, hp: spec.speed >= 4 || md === "combat" ? 3 : 0, q: want.boss ? 2 : ({ combat: 8, race: 9, explore: 10 })[md] || 0, tl: want.timer || (md === "race" ? 120 : 0) });
}
/// the bots on a course: each hop on the way there (how far, how high, a mover, a pad) and what is near it (lava,
/// spinners) can cost a try — back to the last checkpoint, a heart gone when hearts count; a boss takes its hits; the clock
/// (if any) against how long a bot of that skill takes. → its clears, and where the course is dull or too easy (pace)
function estimateObby(spec, L, N, fails, why, rnd) {
  const B = L.B, R = L.R; if (!R.ok) { fails[Math.min(9, Math.floor(Math.min(0.99, R.seen.size / Math.max(1, R.T.length)) * 10))] += N; why.reach = N; return 0; }
  const T = R.T, P = R.path, haz = (p, q) => { let h = 0, sp = 0; for (const o of B.o) { const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, d = Math.hypot(o[1] - mx, o[3] - mz), r = Math.hypot(p.x - q.x, p.z - q.z) / 2 + 2;
    if (o[0] === "k" && d < r + Math.max(o[5], o[7]) / 2) h += 0.06; if (o[0] === "s" && d < r + o[5] / 2) { h += 0.05 + o[9] * 0.025; sp++; } } return { h, sp }; };
  const hops = []; let dist = 0; const cpAt = new Set(B.o.map((o, i) => (o[0] === "c" ? T.findIndex((t) => Math.abs(o[1] - t.x) <= t.hw + 0.3 && Math.abs(o[3] - t.z) <= t.hd + 0.3 && Math.abs(o[2] - t.top) < 0.9) : -2)));
  for (let i = 1; i < P.length; i++) { const p = T[P[i - 1]], q = T[P[i]], gap = gapOf(p, q), up = Math.max(0, q.top - p.top2), walk = Math.hypot(p.x - q.x, p.z - q.z), H = haz(p, q);
    const pr = Math.min(0.85, (gap / obFar(spec)) ** 2 * 0.3 + (up / OBJ.UP) * 0.05 + (q.k === "m" || p.k === "m" ? 0.07 : 0) + (q.k === "e" ? 0.02 : 0) + (q.k === "y" && q.hw < 1.6 ? 0.05 : 0) + H.h);
    dist += walk; hops.push({ pr, dist, cp: cpAt.has(P[i]), k: H.sp ? "s" : H.h ? "k" : gap > 2 ? "gap" : q.k === "m" ? "m" : "hop" }); }
  const total = Math.max(1, dist), boss = B.o.filter((o) => o[0] === "B"), hp0 = B.hp, tl = B.tl, v = obSpeed(spec);
  let clears = 0;
  for (let b = 0; b < N; b++) { const sk = 0.3 + (0.7 * b) / (N - 1), patience = 3 + Math.round(sk * 9); let hearts = hp0 || 99, t = 0, end = -1, back = 0, falls = 0; // (endless tries still end when a player gives up)
    for (let i = 0; i < hops.length && end < 0; i++) { const h = hops[i];
      while (rnd() < h.pr * (1.5 - sk)) { falls++; t += 4 + (h.dist - back) / v; if (hp0) hearts--; if ((hp0 && hearts <= 0) || falls > patience) { end = h.dist / total; why[h.k] = (why[h.k] || 0) + 1; break; } }
      t += (h.dist - (i ? hops[i - 1].dist : 0)) / (v * (0.7 + sk * 0.4)) + 0.4; if (h.cp) back = h.dist;
      if (tl && t > tl && end < 0) { end = h.dist / total; why.time = (why.time || 0) + 1; } }
    if (end < 0) for (const o of B.o) if (o[0] === "E") for (let k = 0; k < o[9] && end < 0; k++) if (rnd() < (0.022 + o[10] * 0.012) * (1.5 - sk)) { if (hp0) { hearts--; if (hearts <= 0) { end = 0.9; why.E = (why.E || 0) + 1; } } t += 2; } // (G1: each enemy's hits can cost a heart)
    if (end < 0) for (const o of boss) { for (let k = 0; k < o[9] && end < 0; k++) if (rnd() < (0.05 + o[10] * 0.02) * (1.5 - sk)) { if (hp0) { hearts--; if (hearts <= 0) { end = 0.97; why.B = (why.B || 0) + 1; } } t += 3; } t += o[9] * 1.2; }
    if (end < 0 && tl && t > tl) { end = 0.98; why.time = (why.time || 0) + 1; }
    if (end < 0) clears++; else fails[Math.min(9, Math.floor(end * 10))]++; }
  // the pace: tenths of the course with nothing to do (no hazard, no coin, flat walking) are dull
  const busy = new Array(10).fill(0); for (const h of hops) if (h.pr > 0.06) busy[Math.min(9, Math.floor((h.dist / total) * 10))]++;
  for (const o of B.o) if (o[0] === "o") { const ti = T.findIndex((t) => Math.abs(o[1] - t.x) <= t.hw + 0.5 && Math.abs(o[3] - t.z) <= t.hd + 0.5), pi = P.indexOf(ti); if (pi > 0) busy[Math.min(9, Math.floor(((hops[pi - 1] || { dist: 0 }).dist / total) * 10))] += 0.5; }
  L.pace = { dull: total > 40 ? busy.map((n, i) => (n < 0.5 && i > 0 ? i : -1)).filter((i) => i >= 0) : [], hard: hops.filter((h) => h.pr > 0.3).length };
  return clears;
}
/// the director's wishes from a sentence (the page and the server read it the same way; the agent's model can add more)
export function obWants(text) {
  const t = String(text || "").toLowerCase(), has = (re) => re.test(t);
  return { boss: has(/boss|dragon|보스|드래곤|king/), shop: has(/shop|store|buy|상점|가게/), doors: has(/door|button|key|switch|문|버튼|열쇠|스위치/), elevator: has(/elevator|lift|tower|엘리베이터|탑|높이/),
    bp: has(/baseplate|flat|open world|베이스|평지/), timer: has(/timer|time limit|clock|race against|시간|타이머/) ? 180 : 0,
    look: has(/night|neon|밤|네온/) ? "night" : has(/sunset|노을|저녁/) ? "sunset" : has(/fog|mist|spooky|안개|으스스/) ? "mist" : has(/space|galaxy|우주/) ? "space" : has(/cartoon|toon|cute|귀여|만화/) ? "toon" : has(/cinematic|epic|movie|영화|웅장/) ? "cine" : "",
    secs: has(/short|quick|짧/) ? 4 : has(/long|epic|huge|길|거대/) ? 10 : 0,
    theme: has(/lava|fire|volcano|용암|불/) ? "lava" : has(/ice|snow|frozen|얼음|눈/) ? "ice" : has(/jungle|forest|정글|숲/) ? "jungle" : has(/candy|sweet|사탕/) ? "candy" : has(/neon|cyber|네온|사이버/) ? "neon" : "",
    hard: has(/hard|brutal|insane|어렵|극악/) ? 1 : has(/easy|kid|chill|쉬|초보/) ? -1 : 0,
    md: has(/fight|enem|combat|monster|battle|전투|몬스터|적 |싸움/) ? "combat" : has(/\brace|racing|ring|lap|레이스|경주|링/) ? "race" : has(/explor|adventure|open world|gems?\b|탐험|모험|보석/) ? "explore" : "" };
}
/// the director's second step: a change asked in words on a course that's already there ("add a boss", "harder ending",
/// "more coins", "add a shop", "night look" …) → { build, did: [what changed] }
export function obTweak(spec, text) {
  const B = JSON.parse(JSON.stringify(spec.build && spec.build.ob ? spec.build : genObbyBuild(spec))), t = String(text || "").toLowerCase(), did = [], R = obReach(B, spec), T = R.T;
  const end = R.path.length ? T[R.path[R.path.length - 1]] : T[0], late = R.path.slice(Math.floor(R.path.length * 0.6)).map((j) => T[j]).filter((q) => q.i >= 0 && q.k !== "g");
  let s = (spec.seed * 31 + t.length) >>> 0 || 1; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const add = (o) => { if (B.o.length < OB.MAX) B.o.push(o); };
  if (/boss|보스|드래곤|dragon/.test(t) && !B.o.some((o) => o[0] === "B") && end) { const g = B.o.find((o) => o[0] === "g"); const x = end.x + 12, z = end.z; add(["y", x, end.top - 1, z, 0, 16, 1, 16, 4, 1, 0, 0]); add(["B", x, end.top, z, 0, 3, 3, 3, 11, 10, 0, 0]); if (g) { g[1] = x + 6; g[3] = z; g[2] = end.top; } B.lg.push(["bosshalf", 0, "say", 6, 0]); B.ui |= OB.UI.boss; did.push("boss"); }
  if (/harder|hard|difficult|어렵|빡세/.test(t)) { for (const q of late.slice(0, 6)) if (rnd() < 0.7) add(["k", q.x + (rnd() < 0.5 ? -1 : 1) * q.hw * 0.5, q.top, q.z, 0, Math.min(1.5, q.hw * 0.7), 0.3, Math.min(2, q.hd * 1.2), 5, 0, 0, 0]); for (const o of B.o) if (o[0] === "s") o[9] = Math.min(5, o[9] + 1); did.push("harder"); }
  if (/easier|easy|쉽|쉬운/.test(t)) { B.o = B.o.filter((o, i) => !(o[0] === "k" && i % 2)); for (const o of B.o) if (o[0] === "s") o[9] = Math.max(1, o[9] - 1); if (!B.hp) B.hp = 0; did.push("easier"); }
  if (/coin|코인|동전/.test(t)) { for (const j of R.path) { const q = T[j]; if (q.i >= 0 && rnd() < 0.6) add(["o", q.x, q.top + 0.6, q.z, 0, 1, 1, 1, 0, 0, 0, 0]); } did.push("coins"); }
  if (/shop|상점|가게/.test(t) && !B.o.some((o) => o[0] === "n") && T[R.path[1]]) { const q = T[R.path[1]]; add(["n", q.x + q.hw - 0.8, q.top, q.z, 0, 1.2, 2, 1.2, 0, 1, 10, 0]); did.push("shop"); }
  if (/checkpoint|체크/.test(t)) { for (let k = 2; k < R.path.length - 1; k += 4) { const q = T[R.path[k]]; if (q.i >= 0 && !B.o.some((o) => o[0] === "c" && Math.hypot(o[1] - q.x, o[3] - q.z) < 2)) add(["c", q.x, q.top, q.z, 0, 3, 0.3, 3, 1, 0, 0, 0]); } did.push("checkpoints"); }
  if (/spinner|스피너|회전/.test(t)) { for (const q of late.slice(0, 3)) if (q.hw >= 2) add(["s", q.x, q.top + 0.4, q.z, 0, Math.min(10, q.hw * 2), 0.5, 0.5, 11, 2, 0, 0]); did.push("spinners"); }
  for (const [id, re, d] of [["bxhouse", /house|home|집/, "house"], ["bxcave", /cave|동굴/, "cave"], ["bxcamp", /enemy camp|enemies|monsters?|적 |몬스터/, "camp"], ["bxvault", /vault|treasure|보물/, "vault"], ["bxgates", /race gates?|rings?|레이스|링/, "gates"]]) if (re.test(t) && !(B.pi || []).some((x) => x[1] === id)) { // (G2: the director places ARCIRCLE's own prefabs beside the way)
    const q = late[0] || end; if (!q) continue; const side = did.length % 2 ? -1 : 1, r = placePrefab(B, PREFABS[id], [q.x + side * (q.hw + 10), (q.top || 0) - 0, q.z], 0, id); if (r.ok) { Object.assign(B, r.B); did.push(d); } }
  if (/timer|time|시간|타이머/.test(t)) { B.tl = B.tl || 180; B.ui |= OB.UI.timer; did.push("timer"); }
  for (const lk of OB.LOOKS) if (t.includes(lk) || (lk === "night" && /밤|neon|네온/.test(t)) || (lk === "sunset" && /노을/.test(t)) || (lk === "mist" && /안개|fog/.test(t)) || (lk === "space" && /우주/.test(t)) || (lk === "toon" && /cartoon|만화/.test(t)) || (lk === "cine" && /cinematic|영화/.test(t))) { B.lk = lk; did.push("look"); break; }
  return { build: cleanObby(B), did };
}
/// OB5: the logic as a small script for those who like to type — one rule a line, `when <event> then <action> [again]`
/// (events: start · button N · coins N · every N · after N · A >= N · B >= N · phase N · boss half · boss down ·
/// checkpoint N · enemies down · collect N · ring N; actions: track N · cutscene · open N · close N · toggle N · say N · A += N · A -= N · B += N · A = N · B = N · phase N · show N ·
/// hide N · heart N · coins N · time N · speed N · win · hurt). Nothing in it runs as code: it reads into the same rules
/// the blocks make (and the server cleans), so a game can't do anything the blocks can't.
const SW = { button: "button", coins: "coins", every: "every", after: "after", phase: "phase", checkpoint: "checkpoint", collect: "collect", ring: "ring", touch: "touch", broken: "broken" }, ST = { open: "open", close: "close", toggle: "toggle", say: "say", phase: "phase", show: "show", hide: "hide", heart: "heart", coins: "coins", time: "time", speed: "speed", track: "track", sound: "sound", spawn: "spawn", on: "on", off: "off" };
export function obScript(lg) {
  const ev = (w, a) => (w === "start" ? "start" : w === "varA" ? `A >= ${a}` : w === "varB" ? `B >= ${a}` : w === "bosshalf" ? "boss half" : w === "boss" ? "boss down" : w === "enemies" ? "enemies down" : `${w} ${a}`);
  const ac = (t, a, r) => (t === "addA" ? (a < 0 ? `A -= ${-a}` : `A += ${a}`) : t === "addB" ? (a < 0 ? `B -= ${-a}` : `B += ${a}`) : t === "setA" ? `A = ${a}` : t === "setB" ? `B = ${a}` : t === "win" || t === "hurt" || t === "cutscene" || t === "lose" ? t : t === "dmg" ? `dmg ${a} ${r[6] || 1}` : `${t} ${a}`);
  return (lg || []).map((r) => `when ${ev(r[0], r[1])} then ${ac(r[2], r[3], r)}${r[5] ? " if " + condText(r[5]) : ""}${r[4] && r[0] !== "every" && r[0] !== "touch" ? " again" : ""}`).join("\n");
}
export function obParse(text) {
  const lg = [], errs = [];
  String(text || "").split(/\r?\n/).slice(0, 60).forEach((line0, i) => {
    const line = line0.replace(/\/\/.*$|#.*$/, "").trim().toLowerCase(); if (!line) return;
    const m = /^when\s+(.+?)\s+then\s+(.+?)(?:\s+if\s+(.+?))?(\s+again)?$/.exec(line); if (!m) { errs.push(i + 1); return; }
    let w = null, wa = 0, t = null, ta = 0; const e = m[1].replace(/\s+/g, " "), a = m[2].replace(/\s+/g, " ");
    let q;
    if (e === "start") w = "start"; else if (e === "boss half") w = "bosshalf"; else if (e === "boss down" || e === "boss") w = "boss"; else if (e === "enemies down" || e === "enemies") w = "enemies";
    else if ((q = /^([ab]) ?>= ?(\d+)$/.exec(e))) { w = q[1] === "a" ? "varA" : "varB"; wa = +q[2]; }
    else if ((q = /^([a-z]+) (\d+)$/.exec(e)) && SW[q[1]]) { w = SW[q[1]]; wa = +q[2]; }
    let amt = 0; if (a === "win" || a === "hurt" || a === "cutscene" || a === "lose") t = a; else if ((q = /^dmg (\d+)(?: (\d+))?$/.exec(a))) { t = "dmg"; ta = +q[1]; amt = +(q[2] || 1); }
    else if ((q = /^([ab]) ?(\+=|-=|=) ?(\d+)$/.exec(a))) { t = (q[2] === "=" ? "set" : "add") + q[1].toUpperCase(); ta = q[2] === "-=" ? -q[3] : +q[3]; }
    else if ((q = /^([a-z]+) (\d+)$/.exec(a)) && ST[q[1]]) { t = ST[q[1]]; ta = +q[2]; }
    const cd = m[3] ? condParse(m[3]) : 0; if (!w || !t || cd === null) { errs.push(i + 1); return; }
    const rr = [w, wa, t, ta, m[4] ? 1 : 0]; if (cd || t === "dmg") rr.push(cd || 0); if (t === "dmg") rr.push(amt || 1); lg.push(rr);
  });
  return { lg: cleanObby({ o: [], lg }).lg, errs };
}
/// ED1 (2026-10-29, the owner: "a pro 3D editor — objects as entities and components"): every piece of a course is an
/// entity. Its kind is a bundle of preset components (lava = a block + Damage, a spinner = a bar + Spinner …); more
/// components ride on any piece in its 13th slot, an object: n its name, id its tag (1–TAGS, for rules and scripts),
/// nc no collision, iv invisible, lk / eh locked / hidden in the editor, and the components below ([fields] each).
/// The run reads them (world-studio-obby.js), the reach check and the server's coin bound count them; nothing is code.
export const CMP = {
  mv: ["Mover", [["Axis", 0, 2, 0], ["Distance", 1, 20, 6], ["Speed", 1, 5, 2]]],
  sp: ["Spinner", [["Speed", 1, 5, 2], ["Direction", 0, 1, 0]]],
  dm: ["Damage", [["Hearts", 1, 3, 1]]],
  pk: ["Pickup", [["Gives", 0, 2, 0], ["Amount", 1, 20, 1]]],
  tg: ["Trigger", [["Channel (0 = rules only)", 0, 8, 0], ["Once", 0, 1, 0]]],
  hl: ["Health", [["Hits", 1, 20, 3]]],
  sn: ["Sound", [["Sound", 0, 5, 0]]],
  lt: ["Light", [["Colour", 0, 11, 1], ["Strength", 1, 3, 2]]],
  sw: ["Spawner", [["Every (s)", 2, 30, 6], ["At most", 1, 6, 3], ["Enemy", 0, 2, 0]]],
  sc: ["Script", null],
};
export const CMP_CAP = { lt: 6, sw: 6, sc: 16 }, CMP_SND = ["coin", "jump", "hit", "dash", "hurt", "perfect"], CMP_PK = ["Coins", "Counter A", "A heart"];
export const SC_MAX = 800; // (a script's characters)
/// a rule's condition [what (0 A · 1 B · 2 coins · 3 phase), how (0 ≥ · 1 < · 2 =), the number] — or 0
export function condOf(c) { if (!Array.isArray(c)) return 0; const v = iv(c[0], 0, 3, -1), o = iv(c[1], 0, 2, -1); if (v < 0 || o < 0) return 0; return [v, o, iv(c[2], 0, 999, 0)]; }
const CV = ["a", "b", "coins", "phase"], CO = [">=", "<", "=="];
export const condText = (c) => `${["A", "B", "coins", "phase"][c[0]]} ${CO[c[1]]} ${c[2]}`;
/// "A >= 3" · "coins < 10" · "phase == 2" → the condition, null when it can't be read
export function condParse(t) { const m = /^\s*(a|b|coins|phase)\s*(>=|<|==|=)\s*(\d+)\s*$/i.exec(String(t || "")); if (!m) return null; return [CV.indexOf(m[1].toLowerCase()), m[2] === "=" ? 2 : CO.indexOf(m[2]), Math.min(999, +m[3])]; }
function cleanX(x, k, n) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null; const out = {};
  if (typeof x.n === "string") { const nm = x.n.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 24); if (nm) out.n = nm; }
  const t = iv(x.id, 0, OB.TAGS, 0); if (t) out.id = t;
  for (const f of ["nc", "iv", "lk", "eh"]) if (Number(x[f]) === 1) out[f] = 1;
  if (out.nc && !OB.K[k][0] && k !== "x" && k !== "X") delete out.nc; // (only a solid piece has a collision to switch off)
  for (const [c, [, F]] of Object.entries(CMP)) { if (x[c] == null) continue;
    if (c === "sc") { if (typeof x.sc === "string" && x.sc.trim() && (n.$sc || 0) < CMP_CAP.sc) { out.sc = x.sc.replace(/\r/g, "").slice(0, SC_MAX); n.$sc = (n.$sc || 0) + 1; } continue; }
    if (!Array.isArray(x[c]) || (CMP_CAP[c] && (n["$" + c] || 0) >= CMP_CAP[c])) continue;
    out[c] = F.map((f, j) => iv(x[c][j], f[1], f[2], f[3])); if (CMP_CAP[c]) n["$" + c] = (n["$" + c] || 0) + 1; }
  if (Number(x.po) >= 1) out.po = iv(x.po, 1, OB.TAGS, 1); // (a spawner's pooled enemy — made by compOf, never saved by the editor)
  return Object.keys(out).length ? out : null;
}
/// tags: unique; a piece that needs one (a trigger, health, a script, a spawner) gets the lowest free one
const NEEDS = ["tg", "hl", "sc", "sw"];
function tagUp(o) {
  const seen = new Set(); for (const q of o) { const x = q[12]; if (!x || !x.id || x.po) continue; if (seen.has(x.id)) delete x.id; else seen.add(x.id); }
  for (const q of o) { const x = q[12]; if (!x || x.id || x.po || !NEEDS.some((c) => x[c] != null)) continue; let t = 1; while (seen.has(t) && t <= OB.TAGS) t++; if (t > OB.TAGS) continue; x.id = t; seen.add(t); }
}
/// what the run plays: the course with every piece's script read into rules (tagged to it) and each spawner's enemies
/// waiting hidden beside it (po: the spawner's tag) — the editor keeps the course as it is
export function compOf(B0) {
  const B = JSON.parse(JSON.stringify(B0)); B.lg = (B.lg || []).slice(); const errs = [];
  for (const q of B.o) { const x = q[12]; if (!x || !x.sc || !x.id) continue; const r = edParse(x.sc, x.id); for (const e of r.errs) errs.push({ ...e, tag: x.id }); for (const rr of r.lg) if (B.lg.length < OB.LG + 32) B.lg.push(rr); }
  const add = []; for (const q of B.o) { const x = q[12]; if (!x || !x.sw || !x.id) continue; const [, max, ty] = x.sw;
    for (let j = 0; j < max; j++) add.push(["E", q[1], q[2] + q[6], q[3], 0, 1.2, 1.6, 1.2, 0, 2, ty, 0, { po: x.id }]); }
  B.o = B.o.concat(add); B.cerr = errs; return B;
}
/// the entity view of a course (the inspector's, and the format a developer reads): { id, i, name, parent, t: [x, y, z,
/// rx, ry, rz, sx, sy, sz], c: { the kind's preset components, then the piece's own } }
const PRESET = { b: ["mesh", "collider"], r: ["mesh", "collider"], y: ["mesh", "collider"], H: ["mesh", "collider"], k: ["mesh", "damage"], s: ["mesh", "spinner", "knock"], m: ["mesh", "collider", "mover"], p: ["mesh", "collider", "jump"],
  c: ["mesh", "collider", "checkpoint"], S: ["mesh", "collider", "spawn"], g: ["mesh", "collider", "goal"], o: ["pickup"], h: ["pickup"], Q: ["pickup"], d: ["mesh", "collider", "door"], u: ["trigger"], e: ["mesh", "collider", "elevator"],
  t: ["teleport"], n: ["shop"], B: ["mesh", "health", "ai", "boss"], E: ["mesh", "health", "ai"], R: ["ring"], W: ["water"], P: ["mesh", "collider", "rigidbody"], A: ["mesh", "npc"], x: ["mesh", "collider"], X: ["mesh", "collider"] };
export const OBN = { b: "Block", r: "Ramp", y: "Round platform", k: "Lava", s: "Spinner", m: "Moving platform", p: "Jump pad", c: "Checkpoint", S: "Start", g: "Goal", o: "Coin", h: "Heart", d: "Door", u: "Button", e: "Elevator", t: "Teleporter", n: "Shop", B: "Boss", x: "Prop", X: "My asset", E: "Enemy", R: "Race ring", Q: "Gem", H: "Hill", W: "Water", P: "Crate", A: "Character" };
export const presetOf = (k) => PRESET[k] || ["mesh"];
export function entsOf(B) {
  const cnt = {};
  return (B.o || []).map((q, i) => { const x = q[12] || {}, k = q[0]; cnt[k] = (cnt[k] || 0) + 1; const c = { kind: k, opt: [q[9], q[10]], colour: q[8] };
    for (const p of presetOf(k)) c[p] = p === "collider" ? (x.nc ? 0 : 1) : 1; c.visible = x.iv ? 0 : 1;
    for (const key of Object.keys(CMP)) if (x[key] != null) c[key] = Array.isArray(x[key]) ? x[key].slice() : x[key];
    return { id: x.id ? "t" + x.id : "e" + i, i, tag: x.id || 0, name: x.n || OBN[k] + " " + cnt[k], parent: q[11] || 0, t: [q[1], q[2], q[3], 0, q[4], 0, q[5], q[6], q[7]], c, lock: x.lk ? 1 : 0, hide: x.eh ? 1 : 0 }; });
}
/// …and back: entities → the course's pieces (cleaned like any course)
export function entsToOb(ents, B = {}) {
  const o = (Array.isArray(ents) ? ents : []).filter((e) => e && e.c && OB.K[e.c.kind]).map((e) => { const c = e.c, t = Array.isArray(e.t) ? e.t : [], x = {};
    if (e.name && !(e.name === OBN[c.kind] || new RegExp("^" + OBN[c.kind] + " \\d+$").test(e.name))) x.n = e.name; if (e.tag) x.id = e.tag; if (c.collider === 0) x.nc = 1; if (c.visible === 0) x.iv = 1; if (e.lock) x.lk = 1; if (e.hide) x.eh = 1;
    for (const key of Object.keys(CMP)) if (c[key] != null) x[key] = c[key];
    const q = [c.kind, t[0], t[1], t[2], t[4], t[6], t[7], t[8], c.colour, (c.opt || [])[0], (c.opt || [])[1], e.parent || 0]; if (Object.keys(x).length) q.push(x); return q; });
  return cleanObby({ ...B, ob: 1, o });
}
/// ED3: the developer's script — handlers with a few statements, read (never run as code) into the same rules, tagged to
/// the piece it sits on:  onTouch(player) { this.hp -= 1; coins += 5; say("Nice work!") }  ·  every(5) { toggle(2) }
const HANDLERS = { onstart: "start", ontouch: "touch", onbreak: "broken", every: "every", after: "after", oncoins: "coins", onbutton: "button", ona: "varA", onb: "varB", onphase: "phase", onbosshalf: "bosshalf", onboss: "boss", onenemies: "enemies", oncheckpoint: "checkpoint", onring: "ring", oncollect: "collect" };
export const SC_HELP = ["onStart() { … }", "onTouch(player) { … }", "onBreak() { … }", "every(5) { … }", "after(10) { … }", "onCoins(10) { … }", "onButton(1) { … }", "onA(3) { … }", "onPhase(2) { … }", "onBoss() { … }"];
export const SC_DO = ["this.hp -= 1", "this.hide()", "this.show()", "player.hurt()", "player.heal(1)", "coins += 5", "A += 1", "A = 0", "B += 1", "say(\"Nice work!\")", "open(1)", "close(1)", "toggle(1)", "showGroup(1)", "hideGroup(1)", "phase(2)", "track(1)", "speed(5)", "time(10)", "sound(\"coin\")", "spawn()", "win()", "lose()", "cutscene()", "if (A >= 3) win()"];
export function edParse(text, tag = 1) {
  const lg = [], errs = [], src = String(text || "").slice(0, SC_MAX).replace(/\/\/[^\n]*/g, "");
  const at = (pos) => src.slice(0, pos).split("\n").length; // (the line a place in the text is on)
  const re = /([A-Za-z]+)\s*\(([^)]*)\)\s*(repeat\s*)?\{([^{}]*)\}/g; let m, last = 0;
  const stray = (a, b) => { const bit = src.slice(a, b); if (bit.trim()) errs.push({ line: at(a + bit.search(/\S/)), msg: "outside a handler: " + bit.trim().slice(0, 30) }); };
  while ((m = re.exec(src))) { stray(last, m.index); last = m.index + m[0].length;
    const h = HANDLERS[m[1].toLowerCase()], ln = at(m.index); if (!h) { errs.push({ line: ln, msg: "unknown handler " + m[1] + "()" }); continue; }
    const arg = m[2].trim(), num = /^\d+$/.test(arg) ? +arg : 0, needN = ["every", "after", "coins", "button", "varA", "varB", "phase", "checkpoint", "ring", "collect"].includes(h);
    if (needN && !num) { errs.push({ line: ln, msg: m[1] + "(N) needs a number" }); continue; }
    const wa = h === "touch" || h === "broken" ? tag : num, again = m[3] || h === "every" || h === "touch" ? 1 : 0;
    const body = m[4], off = m.index + m[0].indexOf("{") + 1; let p0 = 0;
    for (const st0 of body.split(/;|\n/)) { const pos = body.indexOf(st0, p0); p0 = pos + st0.length; const st = st0.trim(); if (!st) continue;
      const r = stmt(st, tag); if (r.err) { errs.push({ line: at(off + pos + st0.search(/\S/)), msg: r.err }); continue; }
      lg.push([h, wa, r.t, r.ta, again, ...(r.cd || r.t === "dmg" ? [r.cd || 0] : []), ...(r.t === "dmg" ? [r.amt] : [])]); } }
  stray(last, src.length);
  if (lg.length > OB.LG) errs.push({ line: 1, msg: "at most " + OB.LG + " statements" });
  return { lg: cleanObby({ o: [], lg: lg.slice(0, OB.LG) }).lg, errs };
}
function stmt(s0, tag) {
  let s = s0, cd = 0; const ifm = /^if\s*\((.+?)\)\s*(.+)$/.exec(s); if (ifm) { cd = condParse(ifm[1]); if (!cd) return { err: "can't read the condition " + ifm[1] }; s = ifm[2].trim(); }
  const k = s.replace(/\s+/g, " ").replace(/\s*\(\s*/g, "(").replace(/\s*\)/g, ")");
  let q;
  if ((q = /^this\.hp ?-= ?(\d+)$/.exec(k))) return { t: "dmg", ta: tag, amt: +q[1], cd };
  if (/^this\.hide\(\)$/.test(k)) return { t: "off", ta: tag, cd }; if (/^this\.show\(\)$/.test(k)) return { t: "on", ta: tag, cd };
  if ((q = /^(?:target|piece)\((\d+)\)\.hp ?-= ?(\d+)$/.exec(k))) return { t: "dmg", ta: +q[1], amt: +q[2], cd };
  if (/^(?:player\.)?hurt\(\)$/.test(k)) return { t: "hurt", ta: 0, cd };
  if ((q = /^(?:player\.)?heal\((\d*)\)$/.exec(k))) return { t: "heart", ta: q[1] ? +q[1] : 1, cd };
  if ((q = /^coins ?\+= ?(\d+)$/.exec(k)) || (q = /^addcoins\((\d+)\)$/i.exec(k))) return { t: "coins", ta: +q[1], cd };
  if ((q = /^([AB]) ?(\+=|-=|=) ?(\d+)$/i.exec(k))) return { t: (q[2] === "=" ? "set" : "add") + q[1].toUpperCase(), ta: q[2] === "-=" ? -q[3] : +q[3], cd };
  if ((q = /^say\((?:"([^"]*)"|'([^']*)'|(\d+))\)$/.exec(k))) { const txt = (q[1] ?? q[2] ?? "").toLowerCase(), i = q[3] != null ? +q[3] : OB.MSGS.findIndex((mm) => mm.toLowerCase() === txt); if (i < 0 || i >= OB.MSGS.length) return { err: "say() knows only the course's messages: " + OB.MSGS.slice(0, 3).join(" · ") + " …" }; return { t: "say", ta: i, cd }; }
  if ((q = /^sound\((?:"([a-z]+)"|'([a-z]+)'|(\d+))\)$/.exec(k))) { const i = q[3] != null ? +q[3] : CMP_SND.indexOf(q[1] || q[2]); if (i < 0 || i >= CMP_SND.length) return { err: "sound() is one of " + CMP_SND.join(", ") }; return { t: "sound", ta: i, cd }; }
  if ((q = /^spawn\((\d*)\)$/.exec(k))) return { t: "spawn", ta: q[1] ? +q[1] : tag, cd };
  if ((q = /^(open|close|toggle|phase|track|speed|time)\((\d+)\)$/.exec(k))) return { t: q[1], ta: +q[2], cd };
  if ((q = /^(show|hide)group\((\d+)\)$/i.exec(k))) return { t: q[1].toLowerCase(), ta: +q[2], cd };
  if ((q = /^(on|off)\((\d+)\)$/.exec(k))) return { t: q[1], ta: +q[2], cd };
  if (/^(win|lose|cutscene)\(\)$/.test(k)) return { t: k.slice(0, -2), ta: 0, cd };
  return { err: "can't read: " + s0.slice(0, 40) };
}
/// ED4 (2026-10-29): terrain — a heightfield over the course's ground, HF.N vertices a side across −R…R, each height in
/// half metres (HF.MIN…HF.MAX) and a painted ground (HF.PAINT) per vertex, kept as two short strings (b.hf = { h, p }).
/// The run stands players and walkers on it; the reach check counts it as a floor (like the baseplate).
export const HF = { N: 33, MIN: -16, MAX: 60, PAINT: ["Grass", "Sand", "Rock", "Snow", "Dirt"] };
const HCH = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-./:;=?@[]^_{|}~";
/// the heights in metres (N×N, row by row from −R z) and the paint, or null
export function hfDec(hf) { if (!hf || typeof hf.h !== "string") return null; const n = HF.N * HF.N, h = new Float32Array(n), p = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const v = HCH.indexOf(hf.h[i]); h[i] = (v < 0 ? -HF.MIN : v) + HF.MIN; h[i] /= 2; const q = typeof hf.p === "string" ? hf.p.charCodeAt(i) - 48 : 0; p[i] = q >= 0 && q < HF.PAINT.length ? q : 0; } return { h, p }; }
export function hfEnc(h, p) { let a = "", b = ""; for (let i = 0; i < HF.N * HF.N; i++) { const v = Math.max(HF.MIN, Math.min(HF.MAX, Math.round((h[i] || 0) * 2))); a += HCH[v - HF.MIN]; b += String.fromCharCode(48 + Math.max(0, Math.min(HF.PAINT.length - 1, p ? p[i] | 0 : 0))); } return { h: a, p: b }; }
export const cleanHf = (hf) => { const d = hfDec(hf); return d ? hfEnc(d.h, d.p) : null; };
/// the ground's height at x, z (bilinear), and the paint under it
export function hfAt(d, x, z) { if (!d) return -1e9; const N = HF.N, s = (2 * OB.R) / (N - 1), fx = (x + OB.R) / s, fz = (z + OB.R) / s; if (fx < 0 || fz < 0 || fx > N - 1 || fz > N - 1) return -1e9;
  const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fz)), u = fx - i, w = fz - j, H = d.h;
  return (H[j * N + i] * (1 - u) + H[j * N + i + 1] * u) * (1 - w) + (H[(j + 1) * N + i] * (1 - u) + H[(j + 1) * N + i + 1] * u) * w; }
/// ready-made grounds: flat, rolling hills, a valley, an island, ridges (seeded so a course looks the same each time)
export function hfPreset(kind, seed = 1) {
  const N = HF.N, h = new Float32Array(N * N), p = new Uint8Array(N * N); let s0 = seed >>> 0 || 1; const rnd = () => ((s0 = (s0 * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bumps = Array.from({ length: 7 }, () => [rnd() * 2 - 1, rnd() * 2 - 1, 0.12 + rnd() * 0.25, 2 + rnd() * 5]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1, z = (j / (N - 1)) * 2 - 1, r = Math.hypot(x, z); let y = 0;
    if (kind === "hills") for (const [bx, bz, br, bh] of bumps) y += bh * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (br * br));
    else if (kind === "valley") y = Math.min(12, r * r * 14) - 2;
    else if (kind === "island") y = r < 0.7 ? 1.5 + Math.cos((r / 0.7) * Math.PI) * 1.5 : -4 - (r - 0.7) * 6;
    else if (kind === "ridges") y = Math.abs(Math.sin(x * 4 + rnd() * 0.2)) * 4 + Math.abs(Math.sin(z * 3)) * 2;
    h[j * N + i] = Math.round(y * 2) / 2; p[j * N + i] = kind === "island" && y < 0.2 ? 1 : y > 7 ? 3 : y > 4 ? 2 : 0; }
  return hfEnc(h, p);
}
/// ED5: what a course costs a phone — triangles the run draws (a kind's shape, Meshy props and bodies by their packed
/// budgets), lights, moving pieces — against the budget the town's rules set (CLAUDE.md: about 150 k triangles a scene)
export const OB_BUDGET = { tris: 150000, lights: 6, moving: 60 };
const TRI = { b: 12, r: 8, y: 64, k: 12, s: 76, m: 24, p: 128, c: 192, S: 192, g: 320, o: 80, h: 220, d: 12, u: 128, t: 360, n: 40, B: 700, x: 3500, X: 5000, E: 3000, R: 720, Q: 8, H: 720, W: 12, P: 12, A: 4000 };
export function obBudget(B) {
  let tris = 0, lights = 0, moving = 0; const kinds = new Set(), tk = new Set((B.tk || []).map((t) => t[0]));
  (B.o || []).forEach((q, i) => { tris += TRI[q[0]] || 50; const x = q[12] || {}; if (x.lt) lights++; if (x.mv || x.sp || tk.has(i) || "mesEB".includes(q[0])) moving++; if ("byr".includes(q[0]) && !x.mv && !x.sp && !tk.has(i)) kinds.add(q[0] + q[8] + q[9]); });
  if (B.hf) tris += HF.N * HF.N * 2; // (the terrain's mesh)
  const k = Math.max(tris / OB_BUDGET.tris, lights / OB_BUDGET.lights, moving / OB_BUDGET.moving);
  return { tris, lights, moving, pieces: (B.o || []).length, batches: kinds.size, k, heavy: k > 1 };
}
/// OB6 (the AI test players' second report): the tenths of a level with nothing in the way (dull) and a level the bots
/// all clear with little to do (too easy) — the obby counts its own hops; the lane runs count their rows
function paceOf(spec, L, clear) {
  let dull = [], hard = 0;
  if (L.pace) ({ dull, hard } = L.pace);
  else if (L.rows && L.len > 0 && (spec.tpl === "runner" || spec.tpl === "dash")) { const goal = spec.tpl === "dash" ? Math.min(L.len, speedOf(spec) * 45) : L.len, busy = new Array(10).fill(0);
    for (const r of L.rows) if (r.z < goal && r.z > goal * 0.04) busy[Math.min(9, Math.floor((r.z / goal) * 10))] += r.k === "coin" ? 0.3 : 1;
    dull = busy.map((n, i) => (n < 0.6 && i > 0 ? i : -1)).filter((i) => i >= 0); hard = L.rows.filter((r) => r.k !== "coin" && r.k !== "heart").length; }
  return { dull, easy: clear >= 0.95 && hard <= 3 };
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
  if (spec.tpl === "obby") clears = estimateObby(spec, L, N, fails, why, rnd); else
  if (spec.tpl === "survival" || spec.tpl === "rhythm" || spec.tpl === "race") clears = estimateOther(spec, L, N, fails, why, rnd); else
  if (spec.tpl === "puzzle") { const k = spec.speed * 1.2 + spec.walls * 0.5 + spec.gaps * 0.5 + spec.lasers * 0.4 + spec.coins * 0.15 - puzzleHints(spec) * 0.6, clear = Math.max(0.05, Math.min(1, 1.15 - k / 7)), st = clear > 0.8 ? 1 : clear > 0.6 ? 2 : clear > 0.4 ? 3 : clear > 0.2 ? 4 : 5; return { clear: Math.round(clear * 100) / 100, stars: st, fails, why: "" }; }
  if (JUMPS[spec.tpl] || spec.tpl === "survival" || spec.tpl === "rhythm" || spec.tpl === "race" || spec.tpl === "obby") { /* (counted above) */ } else if (spec.tpl === "defense") { // (S4d: each wave's hit points coming at the towers the gold and pads allow, against how long the path keeps them in reach)
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
  return { clear: Math.round(clear * 100) / 100, stars, fails, why: top ? top[0] : "", ...paceOf(spec, L, clear) };
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
  if (spec.tpl === "obby") return genObbyBuild(spec);
  if (spec.tpl === "defense") return cleanDefense({ td: 1, path: L.path, pads: L.pads, waves: L.waves.map((w) => [w.g, w.r, w.t]) }, spec); // (S4d)
  if (spec.tpl === "climb") return cleanClimb({ L: L.len, r: L.rows.map((r) => [r.z, CODE_C[r.k], r.lane]) }, spec); // (S4d)
  if (spec.tpl === "arena" || spec.tpl === "rush") return cleanArena({ p: [], w: L.waves.map((w) => [w.t, w.k, Math.round((w.a * 180) / Math.PI)]), c: L.coinsAt.map((c) => [c.t, c.x, c.z]) }, spec); // (S4c)
  const CODE = { wall: "w", gap: "g", laser: "l", coin: "c", heart: "h" };
  const len = spec.tpl === "dash" ? Math.max(BUILD.MIN, Math.min(600, Math.round(speedOf(spec) * 30 / BUILD.STEP) * BUILD.STEP)) : Math.max(BUILD.MIN, Math.min(BUILD.MAX, Math.round(L.len / BUILD.STEP) * BUILD.STEP));
  return cleanBuild({ L: len, r: L.rows.filter((r) => r.z <= len - 12).map((r) => [Math.round(r.z), CODE[r.k], r.lane || 0]) }, spec);
}
