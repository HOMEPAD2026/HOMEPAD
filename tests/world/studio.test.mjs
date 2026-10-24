import fs from "node:fs";
// studio.test.mjs — ARCIRCLE Studio Lite (api/_world-studio.mjs, AD-City 3): a game is a clamped spec on a template;
// drafts, publish to the Creator Arcade, plays checked against the level, likes once, the agent's draft (the model
// stubbed; without it the rules). Behind AGENT DIMENSION's door. The page's generator is the server's (same text).
// On an in-memory store. Run: node tests/world/studio.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { AGENT } = await import("../../api/_world-agent.mjs");
const { STUDIO } = await import("../../api/_world-studio.mjs");
AGENT.OPEN = false;
const G = await import("../../api/_world-studio-gen.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); } return { ok: true }; },
};
const json = (status, b, cache) => ({ status, body: b, cache });
let T = Date.parse("2026-10-23T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
let n = 0; const randomId = () => (0x1000000 + ++n * 7919).toString(16) + "abcdef";
let aiReply = '{"title":"Dino Dash","theme":"jungle","speed":9,"len":60,"coins":5,"walls":3,"gaps":2,"lasers":1,"evil":"x"}';
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId, random: Math.random, ai: async () => aiReply, tokenBalance: async () => "0" });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const get = async (q) => (await W.read(new URL("https://x/api/social?world=" + q))).body;
const me = ethers.Wallet.createRandom(), fan = ethers.Wallet.createRandom();

// the generator: the same text in the page's copy; clamped; seeded; a free lane at every wall row
const a = fs.readFileSync(new URL("../../api/_world-studio-gen.mjs", import.meta.url), "utf8").split("\n").slice(1).join("\n"), b = fs.readFileSync(new URL("../../world-studio-gen.js", import.meta.url), "utf8").split("\n").slice(1).join("\n");
check(a === b, "the page's generator is the server's (same text below the first line)");
const sp = G.clampSpec({ tpl: "evil", theme: "x", speed: 99, len: 7, coins: -3, walls: "2", title: "<b>hi</b>  there" + "x".repeat(40), code: "alert(1)" });
check(sp.tpl === "runner" && sp.theme === "neon" && sp.speed === 5 && sp.len === 45 && sp.coins === 0 && sp.walls === 2 && !("code" in sp) && sp.title.length <= 24 && !/[<>]/.test(sp.title), "a spec is clamped: " + JSON.stringify(sp));
const L1 = G.genLevel({ seed: 42, walls: 5, gaps: 3, lasers: 3, coins: 5 }), L2 = G.genLevel({ seed: 42, walls: 5, gaps: 3, lasers: 3, coins: 5 });
check(JSON.stringify(L1) === JSON.stringify(L2) && L1.rows.length > 10 && L1.coins > 0, "seeded: the same level twice (" + L1.rows.length + " rows, " + L1.coins + " coins)");
const walls = {}; for (const r of L1.rows) if (r.k === "wall") (walls[r.z] = walls[r.z] || new Set()).add(r.lane);
check(Object.values(walls).every((s) => s.size < 3), "every wall row leaves a lane open");

// Studio 2: the dash (no finish, speeding up) and the arena (drones, sweeps, coins over the time)
const D = G.genLevel({ tpl: "dash", seed: 9, len: 60 }), A = G.genLevel({ tpl: "arena", seed: 9, len: 45, walls: 3, gaps: 2, lasers: 1, coins: 4 });
check(D.len > G.genLevel({ tpl: "runner", seed: 9, len: 90 }).len && D.rows.length > 40, "the dash's track runs on far past a runner's (" + D.len + " m)");
check(A.secs === 45 && A.len === 900 && A.waves.some((w) => w.k === "d") && A.waves.some((w) => w.k === "L") && A.waves.some((w) => w.k === "D") && A.coins > 0 && A.waves.every((w, i) => !i || A.waves[i - 1].t <= w.t), "the arena: drones, sweeps and big drones in time order, coins (" + A.waves.length + " waves)");
check(G.clampSpec({ tpl: "arena" }).title === "My Arena" && G.clampSpec({ tpl: "puzzle" }).tpl === "puzzle" && G.clampSpec({ tpl: "defense" }).tpl === "defense" && G.clampSpec({ tpl: "nope" }).tpl === "runner", "templates: arena, puzzle and (S4d) defense open, an unknown one falls back to the runner");
// Studio 3: one-tap difficulty and the bots' estimate (seeded: the same answer twice; harder presets clear less)
for (const tpl of ["runner", "dash", "arena"]) { const e = (k) => G.estimate({ tpl, seed: 11, len: 45, ...G.PRESETS[k] }), a = e("easy"), z = e("extreme");
  check(JSON.stringify(e("hard")) === JSON.stringify(e("hard")) && a.clear >= z.clear && a.stars <= z.stars && a.clear >= 0 && a.clear <= 1 && z.fails.length === 10, `${tpl}: easy clears ${a.clear}, extreme ${z.clear} (${z.why})`); }
// Studio 3c: the Ring Puzzle — the rings engine's board from the spec, a clear checked by replaying the moves
const RE = await import("../../api/_world-rings-engine.mjs");
const PZ = G.clampSpec({ tpl: "puzzle", seed: 4821, speed: 3, coins: 2, walls: 1, gaps: 1, lasers: 1, len: 45 }), PL = RE.level(G.genLevel(PZ).id);
check(PZ.title === "My Ring Puzzle" && PL && PL.rings.length === 6 && PL.par > 0, "a puzzle's board: " + G.genLevel(PZ).id + " · " + (PL && PL.rings.length) + " rings, par " + (PL && PL.par));
// closed (STUDIO.OPEN false): only GMs
STUDIO.OPEN = false; let r = await call(me, "world-studio-save", { spec: {} }); check(r.status === 403 && r.body.closed, "closed: a player can't save a game yet");
STUDIO.OPEN = true;
r = await W.handle({ action: "world-studio-save", spec: {} }); check(r.status >= 400 && r.status < 500, "no signature: nothing");
r = await call(me, "world-studio-save", { spec: { title: "Neon Rush", theme: "neon", speed: 3, len: 30, coins: 4, walls: 2, gaps: 1, lasers: 1, seed: 7 } });
const id = r.body.game && r.body.game.id; check(r.status === 200 && /^g[a-z0-9]+$/.test(id) && r.body.game.pub === false, "a draft saved: " + id);
r = await call(me, "world-studio-save", { id, spec: { ...r.body.game.spec, title: "Neon Rush 2" } }); check(r.status === 200 && r.body.game.title === "Neon Rush 2", "changed");
r = await call(fan, "world-studio-save", { id, spec: { title: "mine now" } }); check(r.status === 404, "someone else can't change it");
r = await call(fan, "world-studio-play", { id, coins: 1, dist: 10 }); check(r.status === 403, "not published: others can't play it");
let ar = await get("studio-arcade"); check(ar.ok && !ar.games.some((g) => g.id === id), "a draft isn't on the arcade");
r = await call(me, "world-studio-publish", { id, on: true }); ar = await get("studio-arcade"); check(r.status === 200 && ar.games.some((g) => g.id === id && g.title === "Neon Rush 2"), "published: on the Creator Arcade");
{ r = await call(me, "world-studio-save", { spec: PZ }); const pid = r.body.game.id; await call(me, "world-studio-publish", { id: pid, on: true });
  const sol = RE.plan(PL, RE.stateOf(PL), 10, 2); T += 30e3;
  r = await call(fan, "world-studio-play", { id: pid, moves: [[0, 1], [0, 1], [0, 1]].slice(0, 1) }); check(r.status === 200 && r.body.score === 0, "a puzzle not cleared scores nothing");
  T += 30e3; r = await call(fan, "world-studio-play", { id: pid, moves: [[99, 1]] }); check(r.status === 400, "moves that can't be played are turned away");
  T += 30e3; r = await call(fan, "world-studio-play", { id: pid, moves: sol, hints: 9 }); check(r.status === 200 && r.body.score === G.puzzleScore(PL.par, sol.length, 1), "a clear: replayed and scored (" + r.body.score + ", " + sol.length + " moves, par " + PL.par + ", hints held to the game's 1)");
  await call(me, "world-studio-del", { id: pid }); }
// plays: checked against the level; counted once in 20 s; the best kept
const L = G.genLevel(db.get(`worldStudio/${id}`).spec);
r = await call(fan, "world-studio-play", { id, coins: 9999, dist: 1e9, done: true }); check(r.status === 200 && r.body.score === G.scoreOf(L.coins, L.len, true) && r.body.plays === 1, "a run can't beat the level: " + r.body.score);
r = await call(fan, "world-studio-play", { id, coins: 1, dist: 20 }); check(r.body.plays === 1 && r.body.best === G.scoreOf(L.coins, L.len, true), "the same player again within 20 s: not counted twice, the best kept");
T += 30e3; r = await call(fan, "world-studio-play", { id, coins: 1, dist: 20 }); check(r.body.plays === 2, "later: counted");
// Studio 3b: the #1 leaves a ghost (their run every 0.2 s) for others to race; a bad trace is left out
{ const tr = Array.from({ length: 40 }, (_, i) => [0, 0, i * 3]); T += 30e3; const third = ethers.Wallet.createRandom(); r = await call(third, "world-studio-play", { id, coins: 1, dist: 30, trace: tr }); let gh = await get("studio-ghost&id=" + id);
  check(r.body.ghost === false && !gh.ghost, "a run that isn't the #1 leaves no ghost");
  r = await call(fan, "world-studio-play", { id, coins: 9999, dist: 1e9, done: true, trace: tr }); gh = await get("studio-ghost&id=" + id);
  T += 30e3; r = await call(third, "world-studio-play", { id, coins: 0, dist: 1, trace: [["x"]] }); check(r.status === 200 && !r.body.ghost, "a broken trace: the run counts, no ghost");
  check(r.body && gh.ghost && Array.isArray(gh.ghost.tr) && gh.ghost.tr.length === 40 && gh.ghost.score === G.scoreOf(L.coins, L.len, true), "the #1's run is the ghost: " + JSON.stringify(gh.ghost && { n: gh.ghost.name, s: gh.ghost.score, l: gh.ghost.tr.length })); }
r = await call(me, "world-studio-play", { id, coins: 2, dist: 50 }); check(r.status === 200 && r.body.plays === 5, "the maker's own runs aren't counted as plays (" + r.body.plays + ")");
let gm = await get("studio-game&id=" + id); check(gm.ok && gm.game.best.length === 3 && gm.game.spec.seed === 7, "the game's page: its spec and the best runs");
// likes
r = await call(fan, "world-studio-like", { id }); check(r.status === 200 && r.body.likes === 1, "liked");
r = await call(fan, "world-studio-like", { id }); check(r.body.likes === 1 && r.body.already, "once a wallet");
r = await call(me, "world-studio-like", { id }); check(r.status === 400, "not your own game");
// the agent drafts one: the model's JSON clamped; without the model, the rules read the words
r = await call(me, "world-studio-ai", { t: "a fast dinosaur jungle run with lots of coins" }); check(r.status === 200 && r.body.by === "agent" && r.body.spec.theme === "jungle" && r.body.spec.speed === 5 && !("evil" in r.body.spec) && r.body.spec.title === "Dino Dash", "the agent's draft, clamped: " + JSON.stringify(r.body.spec));
aiReply = "sorry, I can't"; r = await call(me, "world-studio-ai", { t: "얼음 위 쉬운 짧은 게임" }); check(r.status === 200 && r.body.by === "rules" && r.body.spec.theme === "ice" && r.body.spec.len === 30 && r.body.spec.speed === 2, "no JSON: the rules read the words (ko): " + JSON.stringify(r.body.spec));
aiReply = '{"title":"Drone Storm","theme":"lava","speed":4,"len":60,"coins":2,"walls":5,"gaps":1,"lasers":2}'; r = await call(me, "world-studio-ai", { t: "lots of drones", tpl: "arena" }); check(r.body.by === "agent" && r.body.spec.tpl === "arena" && r.body.spec.walls === 5, "the agent drafts for the template you're on (arena)");
r = await call(me, "world-studio-save", { spec: { tpl: "arena", len: 30, coins: 3, seed: 4 } }); const aid = r.body.game.id; await call(me, "world-studio-publish", { id: aid, on: true });
T += 30e3; r = await call(fan, "world-studio-play", { id: aid, coins: 999, dist: 99999, done: true }); const AL = G.genLevel(db.get(`worldStudio/${aid}`).spec); check(r.status === 200 && r.body.score === G.scoreOf(AL.coins, AL.len, true), "an arena run is held to the arena's coins and time: " + r.body.score);
// mine, the draft cap, delete
let mine = await get("studio-mine&wallet=" + me.address.toLowerCase()); check(mine.ok && mine.games.length === 2 && mine.games.some((g) => g.id === id), "my games");
for (let i = 0; i < STUDIO.DRAFTS - 2; i++) await call(me, "world-studio-save", { spec: { title: "x" + i } });
r = await call(me, "world-studio-save", { spec: { title: "one too many" } }); check(r.status === 400 && /delete/.test(r.body.error), "the draft cap: " + STUDIO.DRAFTS);
r = await call(me, "world-studio-del", { id }); ar = await get("studio-arcade"); mine = await get("studio-mine&wallet=" + me.address.toLowerCase());
check(r.status === 200 && !ar.games.some((g) => g.id === id) && mine.games.length === STUDIO.DRAFTS - 1, "deleted: off the arcade and my list");
// Studio 4: a hand-built layout ("Build it yourself"): the server keeps only what can be played, plays it as built, and keeps versions
{ const bad = G.clampSpec({ tpl: "runner", build: { L: 300, r: [[30, "w", 0], [30, "w", 1], [30, "w", 2], [32, "g", 0], [60, "l", 0], [60, "c", 1], [60, "w", 1], [90, "h", 1], [90, "h", 1], [5, "c", 0], [400, "c", 0], [120, "x", 0]] } });
  check(JSON.stringify(bad.build.r) === JSON.stringify([[30, "w", 0], [30, "w", 1], [60, "w", 1], [90, "h", 1]]), "a built layout keeps only what can be played (a free lane, the reaction gap, one kind a row — the wall first —, nothing in a wall): " + JSON.stringify(bad.build.r));
  const many = G.clampSpec({ tpl: "runner", build: { L: 2000, r: Array.from({ length: 20 }, (_, i) => [40 + i * 2, "h", i % 3]) } }); check(many.build.r.length === G.BUILD.HEARTS, "at most " + G.BUILD.HEARTS + " hearts");
  check(G.clampSpec({ tpl: "arena", build: { L: 300, r: [[40, "w", 0]] } }).build === undefined, "only runner and dash take a layout");
  const qb = G.toBuild(G.clampSpec({ tpl: "runner", speed: 3, seed: 9 })), sp = G.clampSpec({ tpl: "runner", speed: 3, build: qb }), L = G.genLevel(sp);
  check(qb.r.length > 10 && L.built && L.len === qb.L && L.coins === qb.r.filter((x) => x[1] === "c").length, "a quick-start level becomes an editable layout: " + qb.r.length + " pieces, " + qb.L + " m");
  const ds = G.genLevel(G.clampSpec({ tpl: "dash", build: { L: 200, r: [[40, "w", 1], [80, "g", 0], [120, "c", 2]] } })); check(ds.rows.length > 30 && ds.rows[3].z === 240, "the dash plays its layout again and again: " + ds.rows.length + " rows");
  let r2 = await call(me, "world-studio-save", { spec: { tpl: "runner", title: "Built", build: { L: 300, r: [[40, "w", 0], [60, "c", 1]] } } }); const bid = r2.body.game && r2.body.game.id;
  check(r2.status === 200 && r2.body.game.spec.build && r2.body.game.spec.build.r.length === 2, "a built game is saved with its layout");
  r2 = await call(me, "world-studio-save", { id: bid, spec: { ...r2.body.game.spec, build: { L: 300, r: [[40, "w", 0], [60, "c", 1], [80, "c", 2]] } } });
  check(r2.status === 200 && r2.body.game.vers && r2.body.game.vers.length === 1 && r2.body.game.vers[0].spec.build.r.length === 2, "the save before is kept as a version");
  await call(me, "world-studio-publish", { id: bid, on: true }); T += 30e3;
  r2 = await call(fan, "world-studio-play", { id: bid, coins: 99, dist: 9999, done: true }); check(r2.status === 200 && r2.body.score === G.scoreOf(2, 300, true), "a built game's score is held to its own layout: " + r2.body.score);
  await call(me, "world-studio-del", { id: bid }); }
// S4b: moving walls and blinking lasers are obstacle rows of their own; rule cards (≤ 2, runner and dash only)
{ const s4 = G.clampSpec({ tpl: "runner", rules: ["mirror", "nope", "onehp", "night"], build: { L: 300, r: [[40, "m", 2], [70, "b", 1], [70, "c", 0], [100, "m", 0], [100, "w", 1]] } });
  check(JSON.stringify(s4.rules) === '["mirror","onehp"]' && JSON.stringify(s4.build.r) === JSON.stringify([[40, "m", 0], [70, "b", 0], [70, "c", 0], [100, "w", 1]]), "S4b: rule cards and the new obstacles kept by the rules: " + JSON.stringify(s4));
  check(G.clampSpec({ tpl: "arena", rules: ["low"] }).rules === undefined, "rule cards are for runner and dash");
  const e1 = G.estimate(G.clampSpec({ tpl: "runner", speed: 4, walls: 4, seed: 3 })), e2 = G.estimate(G.clampSpec({ tpl: "runner", speed: 4, walls: 4, seed: 3, rules: ["onehp", "mirror"] }));
  check(e2.clear <= e1.clear, `one heart and mirrored controls make it harder for the bots (${e1.clear} → ${e2.clear})`); }
// S4c: a hand-built arena — pillars inside the ring and off the start, at most BURST arrivals a second, coins off the pillars
{ const a = G.clampSpec({ tpl: "arena", len: 30, build: { p: [[0, 0], [6, 0], [7, 0], [0, 13], [-6, 2]], w: [[1, "d", 0], [5, "d", 10], [5, "d", 20], [5, "d", 30], [5, "d", 40], [5, "d", 50], [5.2, "d", 60], [5.4, "d", 70], [8, "L", 270], [9, "D", -90], [40, "d", 0]], c: [[3, 6, 0], [3, 3, 3], [50, 1, 1]] } });
  check(JSON.stringify(a.build.p) === "[[6,0],[-6,2]]", "S4c: pillars off the start, apart, inside the ring: " + JSON.stringify(a.build.p));
  check(a.build.w.length === 8 && !a.build.w.some((w) => w[0] === 5.4) && a.build.w.find((w) => w[1] === "L")[2] === 90 && a.build.w.find((w) => w[1] === "D")[2] === 270, "S4c: waves from 2 s, ≤ " + G.ARENA_B.BURST + " a second, angles folded");
  check(JSON.stringify(a.build.c) === "[[3,3,3]]", "S4c: coins not inside a pillar and within the time");
  const L = G.genLevel(a); check(L.built && L.pillars.length === 2 && L.waves.length === 8 && L.coins === 1 && L.len === 600, "S4c: the arena plays as built");
  const q = G.toBuild(G.clampSpec({ tpl: "arena", len: 45, walls: 3, seed: 5 })); check(q.w.length > 20 && q.c.length > 5 && q.p.length === 0, "S4c: a quick-start arena opens as its timeline");
  check(G.clampSpec({ tpl: "runner", build: q }).build === undefined && G.clampSpec({ tpl: "arena", build: { L: 300, r: [] } }).build === undefined, "S4c: a layout only for its own kind");
  const e0 = G.estimate(G.clampSpec({ tpl: "arena", len: 45, walls: 3, seed: 5, build: q })), e1 = G.estimate(G.clampSpec({ tpl: "arena", len: 45, walls: 3, seed: 5, build: { ...q, p: [[5, 5], [-5, 5], [5, -5], [-5, -5], [9, 0], [-9, 0]] } }));
  check(e1.clear >= e0.clear, `S4c: pillars make it a little easier for the bots (${e0.clear} → ${e1.clear})`); }
// S4d: SKY CLIMB — a tower of platforms; its layout kept to one thing a spot, hearts capped; a gap out of reach is found
{ const L = G.genLevel({ tpl: "climb", seed: 4 }); check(L.climb && L.len === 180 && L.rows.length > 40 && G.climbGaps(G.clampSpec({ tpl: "climb", seed: 4 }), L.rows, L.len).length === 0, "S4d: a quick-start climb is reachable all the way up");
  const c = G.clampSpec({ tpl: "climb", build: { climb: 1, L: 100, r: [[3, "n", 2], [3.2, "c", 2], [3, "n", 2], [6, "s", 9], [-1, "n", 0], [50, "n", 1], ...Array.from({ length: 9 }, (_, i) => [10 + i * 2, "h", 0])] } });
  check(c.build.r.length === 2 + 5 && c.build.r.filter((x) => x[1] === "h").length === G.CLIMB.HEARTS, "S4d: one thing a spot, columns 0–4, hearts capped: " + JSON.stringify(c.build.r.slice(0, 3)));
  const lv = G.genLevel(c), gaps = G.climbGaps(c, lv.rows, lv.len); check(gaps.length >= 2 && gaps[0][0] === 3 && gaps[0][1] === 50, "S4d: a gap out of reach is found: " + JSON.stringify(gaps));
  check(G.estimate(c).clear === 0 && G.estimate({ tpl: "climb", seed: 4, ...G.PRESETS.easy }).clear > G.estimate({ tpl: "climb", seed: 4, ...G.PRESETS.extreme }).clear, "S4d: the bots can't clear an unreachable tower; easy beats extreme");
  const tb = G.toBuild({ tpl: "climb", seed: 4 }); check(tb.climb && tb.r.length >= L.rows.length - 6 && G.genLevel({ tpl: "climb", build: tb }).built, "S4d: a quick-start climb opens as its layout");
  check(!G.clampSpec({ tpl: "runner", build: tb }).build && !G.clampSpec({ tpl: "climb", build: { L: 300, r: [] } }).build, "S4d: a climb takes only a climb layout"); }
// S4d: TOWER DEFENSE — the path must be side by side from the top row down to the bottom; pads must touch it; waves capped
{ const L = G.genLevel({ tpl: "defense", seed: 2 }); check(L.defense && L.path[0][1] === 0 && L.path[L.path.length - 1][1] === G.DEF.R - 1 && L.pads.length >= 6 && L.waves.length === 8, "S4d: a quick-start defense map has a full path, pads and 8 waves");
  const d = G.clampSpec({ tpl: "defense", build: { td: 1, path: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7], [3, 8], [3, 9], [3, 10]], pads: [[2, 2], [5, 5], [3, 3], [4, 9], [2, 2]], waves: [[40, 0, 0], [0, 0, 0], [3, 2, 1]] } });
  check(JSON.stringify(d.build.pads) === "[[2,2],[4,9]]" && d.build.waves.length === 2 && d.build.waves[0][0] === G.DEF.PER, "S4d: pads beside the path only, empty waves dropped, a wave capped at " + G.DEF.PER);
  const broken = G.clampSpec({ tpl: "defense", build: { td: 1, path: [[3, 0], [3, 1], [5, 2]], pads: [[2, 1]], waves: [[5, 0, 0]] } }); check(broken.build.path.length === 0 && broken.build.pads.length === 0, "S4d: a path with a jump in it isn't a path");
  const Ld = G.genLevel(d); check(Ld.built && Ld.len === 200 && Ld.coins === G.DEF.PER + 6, "S4d: the defense plays as built (score held to its foes and waves)");
  check(G.estimate({ tpl: "defense", seed: 2, len: 90, ...G.PRESETS.easy }).clear >= G.estimate({ tpl: "defense", seed: 2, len: 90, ...G.PRESETS.extreme }).clear, "S4d: easy defense is easier for the bots than extreme");
  const tb = G.toBuild({ tpl: "defense", seed: 2 }); check(tb.td && tb.path.length === L.path.length && G.genLevel({ tpl: "defense", build: tb }).built, "S4d: a quick-start map opens in the builder"); }
// S4 finish: editor's picks — only a GM stars a published game; the arcade lists picks first
{ const { GM_WALLETS } = await import("../../api/_world-village.mjs"); const gm = ethers.Wallet.createRandom(); GM_WALLETS.push(gm.address.toLowerCase());
  const mk = ethers.Wallet.createRandom(), a = (await call(mk, "world-studio-save", { spec: { title: "Pick me", tpl: "climb", seed: 3 } })).body.game.id, b2 = (await call(mk, "world-studio-save", { spec: { title: "Not yet" } })).body.game.id;
  await call(mk, "world-studio-publish", { id: a, on: true });
  let r3 = await call(fan, "world-studio-pick", { id: a, on: true }); check(r3.status === 403, "a player can't pick");
  r3 = await call(gm, "world-studio-pick", { id: b2, on: true }); check(r3.status === 404, "only a published game is picked");
  r3 = await call(gm, "world-studio-pick", { id: a, on: true }); let arc = await get("studio-arcade");
  check(r3.status === 200 && r3.body.pick && arc.games[0].id === a && arc.games[0].pick, "a GM's pick is listed first with its star");
  await call(gm, "world-studio-pick", { id: a, on: false }); arc = await get("studio-arcade"); check(!arc.games.find((x) => x.id === a).pick, "a pick taken off");
  await call(mk, "world-studio-del", { id: a }); await call(mk, "world-studio-del", { id: b2 }); }
check([...db.keys()].every((k) => /^[^/]+\/[^/]+$/.test(k)), "every document is collection/id (Firestore refuses a bare name: the arcade once was one)");
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
