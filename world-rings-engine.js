// world-rings-engine.js — INFINITY RINGS' rules, its level maker and its solver. Shared word for word with the server
// (api/_world-rings-engine.mjs is a copy; tests/world/rings.test.mjs checks the two are the same), so a clear the game
// shows is the clear the server pays. Nothing here draws, and nothing reads the clock or Math.random: the same level
// number makes the same level everywhere (a seeded random, and only + − × and comparisons on numbers).
//
// The puzzle: C-shaped rings lie on a board. Each has a gap that points one of 8 ways (0 = right, counting
// anticlockwise in 45° steps; a move turns one ring one step). Two rings that overlap are hooked together; they come
// apart when either ring's gap faces the clasp that joins them (rings touch; a gold clasp holds each pair). Some rings also hang on a metal peg fixed to the board: only that
// ring's own gap facing the peg lets it off. A ring whose hooks are all open falls (and a fall can free its
// neighbours: a chain). Clear the board in as few moves as you can: par or better is 3 stars.
//   lock ring:   can't turn until its key ring has fallen (the boss's core: until every small ring has)
//   energy ring: turns clockwise only
//   gear rings:  a pair that turns together (turn one, both move the same way)
//
// level = { id, n, rings: [{ x, y, r, g, k, key, gear, peg, c }], links: [[i, j, dij, dji]], par, boss }
//   k: 0 normal · 1 lock · 2 energy · 3 gear; key: the ring a lock waits for (-2: all the rings that aren't core);
//   gear: the pair's number (-1 none); peg: the peg's way (-1 none); c: the colour (0–5)
// moves (what the server replays): [[ring, +1 | -1], …] (+1 anticlockwise, -1 clockwise), [ring, 0] = the hammer
export const RINGS = { STEPS: 8, D: 2, NEAR: 2.6, GAP: 64, LEVELS: 100, PAY: [0, 100, 200, 300], DAY_ARCL: 10000, DAILY: 3, HAMMERS: 1, HINTS: 3 };
const S = Math.SQRT1_2;
export const DIRS = [[1, 0], [S, S], [0, 1], [-S, S], [-1, 0], [-S, -S], [0, -1], [S, -S]];
const W_MAX = 6.05, H_MAX = 10.05; // the spread of ring centres a phone's portrait screen holds (4 across, 6 down)

export function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const cw = (from, to) => (from - to + 8) % 8; // clockwise steps from one way to another
const ccw = (from, to) => (to - from + 8) % 8;

/// what a level of the campaign (1–100), a daily puzzle or the endless run asks for
export function specOf(n) {
  const b = (lo, hi) => [lo, hi];
  if (n <= 10) return { N: [2, 2, 3, 3, 3, 4, 4, 4, 4, 4][n - 1], peg: n <= 2 ? 0 : 0.34, cyc: 0, lock: 0, energy: 0, gear: 0, par: b(n <= 2 ? 1 : 2, 8) };
  if (n <= 20) return { N: 4 + Math.floor((n - 11) / 4), peg: 0.4, cyc: 0.3, lock: 0, energy: 0, gear: 0, par: b(4, 14) };
  if (n <= 40) return { N: 6 + Math.floor((n - 21) / 6), peg: 0.45, cyc: 0.3, lock: n < 24 ? 1 : 1 + ((n % 3) === 0 ? 1 : 0), energy: 0, gear: 0, par: b(6, 22) };
  if (n <= 60) return { N: 8 + Math.floor((n - 41) / 5), peg: 0.45, cyc: 0.35, lock: 1 + (n % 2), energy: n < 45 ? 1 : 1 + (n % 3), gear: n >= 46 ? 1 : 0, par: b(8, 32) };
  if (n <= 80) return { N: 10 + Math.floor((n - 61) / 4), peg: 0.5, cyc: 0.4, lock: 2 + (n % 2), energy: 2 + (n % 3), gear: 1 + (n % 2), par: b(10, 44) };
  return { N: Math.min(18, 12 + Math.floor((n - 81) / 3)), peg: 0.5, cyc: 0.45, lock: 2 + (n % 3), energy: 2 + (n % 3), gear: 1 + (n % 3 === 0 ? 1 : 0), par: b(12, 60) };
}

// ---------------- the rules ----------------
export function stateOf(L) { return { g: L.rings.map((r) => r.g), alive: L.rings.map(() => true), moves: 0, hammer: 0 }; }
export const cloneState = (s) => ({ g: s.g.slice(), alive: s.alive.slice(), moves: s.moves, hammer: s.hammer });
const linkOpen = (s, l) => s.g[l[0]] === l[2] || s.g[l[1]] === l[3];
/// is the ring free (every hook on it open)?
export function isFree(L, s, i) {
  if (!s.alive[i]) return false;
  const r = L.rings[i]; if (r.peg >= 0 && s.g[i] !== r.peg) return false;
  for (const l of L.adj[i]) { const o = l[0] === i ? l[1] : l[0]; if (s.alive[o] && !linkOpen(s, l)) return false; }
  return true;
}
/// let every free ring fall, again and again until none is: the waves of the chain (lists of ring numbers)
export function settle(L, s) {
  const waves = [];
  for (;;) { const w = []; for (let i = 0; i < L.rings.length; i++) if (isFree(L, s, i)) w.push(i); if (!w.length) break; for (const i of w) s.alive[i] = false; waves.push(w); }
  return waves;
}
const keyDown = (L, s, r) => (r.key === -2 ? L.rings.every((o, j) => o.key === -2 || !s.alive[j]) : r.key < 0 || !s.alive[r.key]);
/// the rings one turn of ring i moves (its gear pair turns with it), or null if it can't turn that way now
export function turnSet(L, s, i, dir) {
  if (!s.alive[i] || (dir !== 1 && dir !== -1)) return null;
  const r = L.rings[i], set = r.gear >= 0 ? L.gears[r.gear].filter((j) => s.alive[j]) : [i];
  for (const j of set) { const o = L.rings[j]; if (o.k === 2 && dir !== -1) return null; if (o.k === 1 && !keyDown(L, s, o)) return null; }
  return set;
}
/// one move: turn ring i one step (dir +1 anticlockwise, -1 clockwise), then the falls; returns the waves, or null if not allowed
export function turn(L, s, i, dir) {
  const set = turnSet(L, s, i, dir); if (!set) return null;
  for (const j of set) s.g[j] = (s.g[j] + dir + 8) % 8;
  s.moves++; return settle(L, s);
}
/// the hammer: ring i is knocked off the board (it caps the level at 1 star)
export function hammer(L, s, i) { if (!s.alive[i] || s.hammer >= RINGS.HAMMERS) return null; s.alive[i] = false; s.hammer++; const w = settle(L, s); return [[i], ...w]; }
export const cleared = (s) => s.alive.every((a) => !a);
/// stars for a clear: par or fewer moves 3, within half again (at least 2 more) 2, any clear 1; the hammer caps it at 1, a hint at 2
export function starsOf(L, moves, hammers = 0, hints = 0) {
  if (hammers > 0) return 1;
  const s = moves <= L.par ? 3 : moves <= L.par + Math.max(2, Math.ceil(L.par * 0.5)) ? 2 : 1;
  return hints > 0 ? Math.min(2, s) : s;
}
/// the server's check: play the moves on a fresh board; { ok, clear, moves, hammer, why }
export function replay(L, moves) {
  if (!Array.isArray(moves) || moves.length > 2000) return { ok: false, why: "bad moves" };
  const s = stateOf(L);
  if (settle(L, s).length) return { ok: false, why: "bad level" };
  for (const m of moves) {
    if (!Array.isArray(m) || m.length !== 2 || !Number.isInteger(m[0]) || m[0] < 0 || m[0] >= L.rings.length) return { ok: false, why: "bad move" };
    if (cleared(s)) return { ok: false, why: "moves after the clear" };
    const r = m[1] === 0 ? hammer(L, s, m[0]) : turn(L, s, m[0], m[1]);
    if (!r) return { ok: false, why: "a move that can't be made" };
  }
  return { ok: true, clear: cleared(s), moves: s.moves, hammer: s.hammer };
}

// ---------------- the solver ----------------
// a good (not always the best) way to clear the board from here, ring by ring: for each ring still up, what it takes to
// let it fall now (its gap onto its peg, or onto one hook; its other neighbours' gaps onto it), played out on a copy;
// the cheapest per ring that fell is kept. Restarts with a little randomness keep the best plan found. For a board of up
// to 4 rings an exact search finds the true best.
function costTo(L, s, j, want) { // moves for ring j to point at want, and the way to turn; Infinity if it can't
  const r = L.rings[j]; if (s.g[j] === want) return [0, 0];
  if (r.k === 1 && !keyDown(L, s, r)) return [Infinity, 0];
  const a = cw(s.g[j], want), b = ccw(s.g[j], want);
  const gearEnergy = r.gear >= 0 && L.gears[r.gear].some((o) => s.alive[o] && L.rings[o].k === 2);
  if (r.k === 2 || gearEnergy) return [a, -1];
  return a <= b ? [a, -1] : [b, 1];
}
function tryDrop(L, s0, i) { // play out letting ring i fall; returns [copy, the moves] or null
  const s = cloneState(s0), r = L.rings[i], plan = [];
  const go = (j, want) => { let guard = 9; while (s.alive[j] && s.g[j] !== want && guard--) { const [c, d] = costTo(L, s, j, want); if (!Number.isFinite(c) || !d) return false; if (!turn(L, s, j, d)) return false; plan.push([j, d]); } return true; };
  const nb = L.adj[i].map((l) => (l[0] === i ? [l[1], l[3], l[2]] : [l[0], l[2], l[3]])).filter(([o]) => s.alive[o]); // [other, other's way to i, i's way to other]
  let target = r.peg;
  if (target < 0) { // no peg: the gap goes onto the neighbour that's dearest to bring round (or stays put if nothing needs it)
    let best = -1, bc = Infinity;
    for (const cand of [-1, ...nb.map((x) => x[2])]) {
      let c = cand < 0 ? 0 : costTo(L, s, i, cand)[0];
      for (const [o, oi, io] of nb) if (io !== cand && !(cand < 0 && s.g[i] === io)) c += costTo(L, s, o, oi)[0];
      if (c < bc) { bc = c; best = cand; }
    }
    if (!Number.isFinite(bc)) return null;
    target = best < 0 ? s.g[i] : best;
  }
  for (const [o, oi, io] of nb) { if (!s.alive[i]) break; if (io === target && r.peg < 0) continue; if (!go(o, oi)) return null; }
  if (s.alive[i] && !go(i, target)) return null;
  return s.alive[i] ? null : [s, plan];
}
export function plan(L, s0, tries = 10, seed = 1) {
  const R = rng(seed * 2654435761 + 7); let best = null;
  for (let t = 0; t < tries; t++) {
    let s = cloneState(s0); const moves = []; let guard = 64;
    while (!cleared(s) && guard--) {
      let pick = null, score = Infinity;
      for (let i = 0; i < L.rings.length; i++) {
        if (!s.alive[i]) continue; const r = tryDrop(L, s, i); if (!r) continue;
        const fell = r[0].alive.filter((a, j) => s.alive[j] && !a).length, sc = (r[1].length + 0.5) / fell + (t ? R() * 1.2 : 0);
        if (sc < score) { score = sc; pick = r; }
      }
      if (!pick) break;
      s = pick[0]; moves.push(...pick[1]);
      if (best && moves.length >= best.length) break;
    }
    if (cleared(s) && (!best || moves.length < best.length)) best = moves;
  }
  return best;
}
function exact(L, s0, cap = 60000) { // breadth-first over every board (small boards only); the fewest moves, or null
  const n = L.rings.length, key = (s) => { let k = 0; for (let i = 0; i < n; i++) k = k * 9 + (s.alive[i] ? s.g[i] + 1 : 0); return k; };
  const seen = new Map([[key(s0), 0]]); let front = [s0], depth = 0;
  while (front.length && seen.size < cap) {
    depth++; const next = [];
    for (const s of front) for (let i = 0; i < n; i++) for (const d of [-1, 1]) {
      const c = cloneState(s); if (!turn(L, c, i, d)) continue;
      if (cleared(c)) return depth;
      const k = key(c); if (!seen.has(k)) { seen.set(k, depth); next.push(c); }
    }
    front = next;
  }
  return null;
}
/// the next move worth making from here (a hint): [ring, dir] or null
export function hint(L, s) { const p = plan(L, s, 6, 3 + s.moves); return p && p.length ? p[0] : null; }

// ---------------- the level maker ----------------
function index(L) { L.adj = L.rings.map(() => []); for (const l of L.links) { L.adj[l[0]].push(l); L.adj[l[1]].push(l); } L.gears = []; L.rings.forEach((r, i) => { if (r.gear >= 0) (L.gears[r.gear] = L.gears[r.gear] || []).push(i); }); return L; }
const near2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
const dirOf = (a, b, d) => { for (let k = 0; k < 8; k++) { const ex = a.x + DIRS[k][0] * d - b.x, ey = a.y + DIRS[k][1] * d - b.y; if (ex * ex + ey * ey < 1e-9) return k; } return -1; };
function layout(R, sp, preset) {
  const rings = preset ? preset.rings.map((r) => ({ ...r })) : [{ x: 0, y: 0, r: 1 }], links = preset ? preset.links.map((l) => l.slice()) : [], D = RINGS.D;
  let tries = 0;
  while (rings.length < sp.N && tries++ < 600) {
    const pi = preset && rings.length < preset.grow ? preset.from[rings.length - preset.rings.length] : Math.floor(R() * rings.length), p = rings[pi];
    const vertical = R() < 0.55, d = vertical ? (R() < 0.5 ? 2 : 6) : Math.floor(R() * 8), dist = (D / 2) * (p.r + 1);
    const c = { x: p.x + DIRS[d][0] * dist, y: p.y + DIRS[d][1] * dist, r: 1 };
    const add = [[pi, rings.length, d, (d + 4) % 8]]; let ok = true;
    for (let q = 0; q < rings.length && ok; q++) {
      if (q === pi) continue; const o = rings[q], dd = (D / 2) * (o.r + 1), lim = (RINGS.NEAR / 2) * (o.r + 1), e2 = near2(c, o);
      const k = Math.abs(e2 - dd * dd) < 1e-6 ? dirOf(o, c, dd) : -1;
      if (k >= 0 && o.r === 1 && sp.cyc && R() < sp.cyc) add.push([q, rings.length, k, (k + 4) % 8]);
      else if (e2 < lim * lim) ok = false;
    }
    if (!ok) continue;
    const xs = rings.map((o) => o.x).concat(c.x), ys = rings.map((o) => o.y).concat(c.y);
    if (Math.max(...xs) - Math.min(...xs) > (preset ? 11.6 : W_MAX) + 1e-9 || Math.max(...ys) - Math.min(...ys) > (preset ? 12.1 : H_MAX) + 1e-9) continue;
    // a ring's neighbours stay at least 90° apart round it (closer and they'd overlap each other)
    rings.push(c); links.push(...add);
  }
  return { rings, links };
}
function dress(R, sp, L, n) { // pegs, kinds, colours and the starting gaps
  const { rings, links } = L, linkDirs = rings.map(() => []);
  for (const l of links) { linkDirs[l[0]].push(l[2]); linkDirs[l[1]].push(l[3]); }
  rings.forEach((r, i) => {
    r.k = r.k || 0; r.key = r.key != null ? r.key : -1; r.gear = -1; r.peg = -1; r.c = r.c != null ? r.c : (i * 5 + n) % 6;
    if (r.core || R() >= sp.peg) return;
    const ways = []; for (let k = 0; k < 8; k++) {
      if (linkDirs[i].some((d) => Math.min(cw(d, k), ccw(d, k)) < 2)) continue; // not on (or next to) a hook
      const px = r.x + DIRS[k][0] * r.r, py = r.y + DIRS[k][1] * r.r;
      if (rings.every((o, j) => j === i || near2({ x: px, y: py }, o) > (o.r + 0.4) * (o.r + 0.4))) ways.push(k);
    }
    if (ways.length) r.peg = ways[Math.floor(R() * ways.length)];
  });
  const plain = () => rings.map((r, i) => i).filter((i) => !rings[i].core && rings[i].k === 0);
  const pickOut = (list) => list.splice(Math.floor(R() * list.length), 1)[0];
  let pool = plain();
  for (let g = 0; g < sp.gear && pool.length >= 2; g++) { const a = pickOut(pool), b = pickOut(pool); rings[a].k = rings[b].k = 3; rings[a].gear = rings[b].gear = g; }
  for (let e = 0; e < sp.energy && pool.length; e++) rings[pickOut(pool)].k = 2;
  for (let k = 0; k < sp.lock && pool.length; k++) { const a = pickOut(pool), keys = rings.map((r, i) => i).filter((i) => i !== a && !rings[i].core && rings[i].k !== 1); if (!keys.length) break; rings[a].k = 1; rings[a].key = keys[Math.floor(R() * keys.length)]; }
  for (const r of rings) r.g = Math.floor(R() * 8);
}
function finish(L, id, n) { // no ring may be free at the start; its gap is turned off a hook until none is
  index(L); const s = stateOf(L);
  for (let pass = 0; pass < 8; pass++) { let any = false; for (let i = 0; i < L.rings.length; i++) if (isFree(L, s, i)) { any = true; L.rings[i].g = s.g[i] = (s.g[i] + 3) % 8; } if (!any) break; }
  if (L.rings.some((r, i) => isFree(L, s, i))) return null;
  L.id = id; L.n = n; return L;
}
const cache = new Map();
/// a level: "12" (the campaign), "d:2026-10-18:0" (a daily puzzle, 0–2), "e:7" (the endless run's 7th board)
export function level(id) {
  id = String(id); if (cache.has(id)) return cache.get(id);
  let m, n, seed, boss = false;
  if ((m = /^([1-9]\d?|100)$/.exec(id))) { n = Number(m[1]); seed = n * 7919 + 101; boss = n === 100; }
  else if ((m = /^d:(\d{4})-(\d\d)-(\d\d):([0-2])$/.exec(id))) { n = [32, 56, 86][Number(m[4])]; seed = (Number(m[1]) * 400 + Number(m[2]) * 32 + Number(m[3])) * 31 + Number(m[4]) * 977 + 5; }
  else if ((m = /^e:([1-9]\d{0,4})$/.exec(id))) { n = 81 + (Number(m[1]) % 19); seed = Number(m[1]) * 104729 + 3; }
  else return null;
  const sp = specOf(boss ? 99 : n); let L = null;
  for (let t = 0; t < 80 && !L; t++) {
    const R = rng(seed + t * 15485863), base = boss ? bossPreset() : null, lay = layout(R, boss ? { ...sp, N: 16, cyc: 0 } : sp, base);
    if (!boss && lay.rings.length < sp.N) continue;
    const cand = { rings: lay.rings, links: lay.links, boss };
    dress(R, boss ? { ...sp, lock: 0, gear: 1, energy: 2, peg: 0.6 } : t > 50 ? { ...sp, lock: 0, gear: 0 } : sp, cand, n);
    if (!finish(cand, id, n)) continue;
    const s = stateOf(cand), p = plan(cand, s, 12, seed + t);
    if (!p) continue;
    let par = p.length; if (cand.rings.length <= 4) { const e = exact(cand, s); if (e != null) par = Math.min(par, e); }
    if (par < sp.par[0] || (par > sp.par[1] && t < 70)) continue;
    cand.par = par; L = cand;
  }
  if (L) cache.set(id, L);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return L;
}
// the INFINITY BOSS (level 100): two big core rings crossed in the middle (blue and mint), locked until every small
// ring around them has fallen; small rings hang off their tops, bottoms and outer sides, and more off those
function bossPreset() {
  const C = 1.9, h = RINGS.D / 2, a = { x: -h * C, y: 0, r: C, core: true, k: 1, key: -2, c: 1 }, b = { x: h * C, y: 0, r: C, core: true, k: 1, key: -2, c: 3 };
  const rings = [a, b], links = [[0, 1, 0, 4]], dist = h * (C + 1), from = [];
  for (const [ci, d] of [[0, 2], [0, 4], [0, 6], [1, 2], [1, 0], [1, 6]]) { const o = rings[ci]; rings.push({ x: o.x + DIRS[d][0] * dist, y: o.y + DIRS[d][1] * dist, r: 1 }); links.push([ci, rings.length - 1, d, (d + 4) % 8]); }
  for (let k = 2; k < 8; k++) from.push(k);
  return { rings, links, grow: 0, from };
}
