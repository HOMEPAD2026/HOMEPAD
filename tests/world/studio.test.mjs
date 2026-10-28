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
const receipts = {};
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId, random: Math.random, ai: async () => aiReply, tokenBalance: async () => "0", receipt: async (h) => receipts[h] || null });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const get = async (q) => (await W.read(new URL("https://x/api/social?world=" + q))).body;
const me = ethers.Wallet.createRandom(), fan = ethers.Wallet.createRandom();

// the generator: the same text in the page's copy; clamped; seeded; a free lane at every wall row
const a = fs.readFileSync(new URL("../../api/_world-studio-gen.mjs", import.meta.url), "utf8").split("\n").slice(1).join("\n"), b = fs.readFileSync(new URL("../../world-studio-gen.js", import.meta.url), "utf8").split("\n").slice(1).join("\n");
check(a === b, "the page's generator is the server's (same text below the first line)");
{ const ev = G.cleanEvents([["coins", 9999, "say", 99], ["evil", 1, "doors", 0], ["col", 1, "speed", 0], ["time", 20, "hack", 0], ["switch", 0, "time", 999], "x", ["key", 0, "coins", -5], ["boss", 0, "heart", 0], ["coins", 5, "doors", 0], ["coins", 6, "doors", 0], ["coins", 7, "doors", 0], ["coins", 8, "doors", 0], ["coins", 9, "doors", 0], ["coins", 11, "doors", 0]], 40);
  check(ev.length === G.JEV.MAX && ev[0][1] === 300 && ev[0][3] === G.JEV.MSGS.length - 1 && ev[1][1] === 2 && ev[2][3] === 60 && ev[3][3] === 1 && ev.every((x) => G.JEV.WHEN.includes(x[0]) && G.JEV.THEN.includes(x[2])), "Jump World events: unknown kinds dropped, numbers clamped, at most " + G.JEV.MAX);
  const e2 = G.cleanEvents([["every", 1, "add", 99, "coins", 5000], ["count", 3, "show", 7, "evil", 1], ["time", 4, "hide", 0, "count", 0], ["switch", 0, "flip", 0, "every", 5]], 40);
  check(e2.length === 4 && e2[0][1] === 3 && e2[0][3] === 10 && e2[0][4] === "coins" && e2[0][5] === 300 && e2[1].length === 4 && e2[1][3] === 0 && e2[2][4] === "count" && e2[2][5] === 10 && e2[3].length === 4,
    "STB7 events: every ≥ 3 s, the counter's +b ≤ 10, an AND kept only for a known condition (never every), numbers clamped");
  const jx = G.cleanJump({ W: 40, c: [[5, 1, "x"], [6, 1, "j"], [7, 1, "Q"]] }, { tpl: "jump" });
  check(jx.c.some((c) => c[2] === "x") && jx.c.some((c) => c[2] === "j") && !jx.c.some((c) => c[2] === "Q"), "STB7: ghost and vanish blocks are kept, an unknown kind is not");
  const jb = G.cleanJump({ W: 40, c: [[0, 0, "g"]], ev: [["coins", 3, "doors", 0]] }, { tpl: "jump" }), jn = G.cleanJump({ W: 40, c: [[0, 0, "g"]] }, { tpl: "jump" });
  check(jb.ev && jb.ev.length === 1 && !("ev" in jn), "Jump World events: kept in the build, none means no field"); }
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
// STB5: the arcade says how many runs were played in the last 10 minutes ("playing now"); older ones drop off
{ let ar = await get("studio-arcade"); const g = ar.games.find((x) => x.id === id); check(g && g.now === 2, "playing now: the last 10 minutes' runs (" + (g && g.now) + ")");
  T += 11 * 60e3; ar = await get("studio-arcade"); const g2 = ar.games.find((x) => x.id === id); check(g2 && !g2.now, "playing now: gone after 10 minutes"); }
// Studio 3b: the #1 leaves a ghost (their run every 0.2 s) for others to race; a bad trace is left out
{ const tr = Array.from({ length: 40 }, (_, i) => [0, 0, i * 3]); T += 30e3; const third = ethers.Wallet.createRandom(); r = await call(third, "world-studio-play", { id, coins: 1, dist: 30, trace: tr }); let gh = await get("studio-ghost&id=" + id);
  check(r.body.ghost === false && !gh.ghost, "a run that isn't the #1 leaves no ghost");
  r = await call(fan, "world-studio-play", { id, coins: 9999, dist: 1e9, done: true, trace: tr }); gh = await get("studio-ghost&id=" + id);
  T += 30e3; r = await call(third, "world-studio-play", { id, coins: 0, dist: 1, trace: [["x"]] }); check(r.status === 200 && !r.body.ghost, "a broken trace: the run counts, no ghost");
  check(r.body && gh.ghost && Array.isArray(gh.ghost.tr) && gh.ghost.tr.length === 40 && gh.ghost.score === G.scoreOf(L.coins, L.len, true), "the #1's run is the ghost: " + JSON.stringify(gh.ghost && { n: gh.ghost.name, s: gh.ghost.score, l: gh.ghost.tr.length }));
  const bd = (await get("studio-game&id=" + id)).game.best, pl = bd.findIndex((x) => x.gh && x.score === G.scoreOf(1, 30, false)) + 1, gp = await get("studio-ghost&id=" + id + "&p=" + pl);
  check(pl > 1 && gp.ghost && gp.ghost.tr.length === 40 && gp.ghost.score === bd[pl - 1].score && !("w" in gp.ghost) && !bd.some((x) => "w" in x), "STB5: a board player's best leaves a ghost too, raced by place (no wallet shown)");
  check(!(await get("studio-ghost&id=" + id + "&p=99")).ghost, "STB5: a place that isn't on the board has no ghost"); }
r = await call(me, "world-studio-play", { id, coins: 2, dist: 50 }); check(r.status === 200 && r.body.plays === 5, "the maker's own runs aren't counted as plays (" + r.body.plays + ")");
let gm = await get("studio-game&id=" + id); check(gm.ok && gm.game.best.length === 3 && gm.game.spec.seed === 7, "the game's page: its spec and the best runs");
// likes
r = await call(fan, "world-studio-like", { id }); check(r.status === 200 && r.body.likes === 1, "liked");
r = await call(fan, "world-studio-like", { id }); check(r.body.likes === 1 && r.body.already, "once a wallet");
r = await call(me, "world-studio-like", { id }); check(r.status === 400, "not your own game");
// Studio Beta: a player's rating after a run — once a wallet, not your own, the maker sees it
r = await call(fan, "world-studio-rate", { id, fun: 1, dif: 2 }); check(r.status === 200 && r.body.fb && r.body.fb.up === 1 && r.body.fb.d[2] === 1, "rated: fun, hard");
r = await call(fan, "world-studio-rate", { id, fun: -1, dif: 0 }); check(r.body.already, "rated once a wallet");
r = await call(me, "world-studio-rate", { id, fun: 1, dif: 1 }); check(r.status === 400, "can't rate your own game");
r = await call(fan, "world-studio-rate", { id, fun: 3, dif: 1 }); check(r.status === 400 || r.body.already, "a bad rating is refused");
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
// STU-A: the official games — listed from the start, one a template, playable and likeable, never anyone's to change
{ const { OFFICIAL } = await import("../../api/_world-studio.mjs"); const arc = await get("studio-arcade"), off = arc.games.filter((g) => g.off);
  check(off.length === 15 && new Set(off.map((g) => g.tpl)).size === 15 && off.every((g) => g.byName === "ARCIRCLE" && g.s && g.s.tpl === g.tpl), "fifteen official games on the arcade, one a template, each with its small spec");
  const g1 = (await get("studio-game&id=goffrun")).game; check(g1 && g1.off && g1.spec && g1.spec.title === OFFICIAL.goffrun.title, "an official game opens");
  const L = G.genLevel(g1.spec), r1 = await call(fan, "world-studio-play", { id: "goffrun", coins: 2, dist: L.len, done: true }); check(r1.status === 200 && r1.body.score > 0 && r1.body.place === 1, "an official game is played and scored (#" + r1.body.place + ")");
  const r2 = await call(fan, "world-studio-like", { id: "goffrun" }); check(r2.status === 200 && r2.body.likes === 1, "an official game can be liked");
  const arc2 = await get("studio-arcade"), e = arc2.games.filter((g) => g.id === "goffrun"); check(e.length === 1 && e[0].plays === 1 && e[0].likes === 1 && e[0].off, "listed once, with its plays and likes");
  const r3 = await call(me, "world-studio-save", { id: "goffrun", spec: g1.spec }), r4 = await call(me, "world-studio-del", { id: "goffrun" }); check(r3.status === 404 && r4.status === 404, "nobody can change or delete an official game");
  check((await get("studio-game&id=goffnope")).ok !== true, "an unknown id isn't made up"); }
// STU-C: the weekly contest (this week's template: others' plays + likes ×5) and remixes
{ const { weekOf, contestTpl } = await import("../../api/_world-studio.mjs"); const wk = weekOf(T), tpl = contestTpl(wk);
  check(wk === "2026-10-19" && weekOf(Date.parse("2026-10-25T14:59:00Z")) === "2026-10-19" && weekOf(Date.parse("2026-10-25T15:00:00Z")) === "2026-10-26", "weeks run Monday to Sunday, Seoul time");
  const mk = ethers.Wallet.createRandom(); let r = await call(mk, "world-studio-save", { spec: { tpl, title: "Week Entry", seed: 77 } }); const id = r.body.game.id; await call(mk, "world-studio-publish", { id, on: true });
  const other = tpl === "runner" ? "arena" : "runner"; r = await call(mk, "world-studio-save", { spec: { tpl: other, title: "Off theme", seed: 78 } }); const id2 = r.body.game.id; await call(mk, "world-studio-publish", { id: id2, on: true });
  const gs = (await get("studio-game&id=" + id)).game, L = G.genLevel(gs.spec);
  await call(fan, "world-studio-play", { id, coins: 0, dist: 1, done: false, moves: [], hints: 0 }); await call(fan, "world-studio-like", { id }); await call(fan, "world-studio-play", { id: id2, coins: 0, dist: 1, done: false }); await call(mk, "world-studio-play", { id, coins: 0, dist: 1, done: false });
  const wkb = await get("studio-week"), e = wkb.top.find((x) => x.id === id);
  check(wkb.ok && wkb.tpl === tpl && e && e.l === 1 && e.pts >= 5 && !wkb.top.some((x) => x.id === id2), "this week's board: the theme's games, likes ×5, other templates left out (" + tpl + ", " + (e && e.pts) + " pts)");
  T += 7 * 86400e3; const nx = await get("studio-week"); check(nx.week !== wk && nx.last && nx.last.top[0] && nx.last.top[0].id === id && nx.top.length === 0, "a new week starts empty and shows last week's top 3"); T -= 7 * 86400e3;
  // ARC3: a GM's USDC prize for the top 3, paid from the GM's own wallet after the week and checked here
  { const { GM_WALLETS } = await import("../../api/_world-village.mjs"); const gm = ethers.Wallet.createRandom(); GM_WALLETS.push(gm.address.toLowerCase());
    let z = await call(fan, "world-studio-prize", { op: "set", usd: [1000, 500, 250] }); check(z.status === 403, "only a GM sets a contest prize");
    z = await call(gm, "world-studio-prize", { op: "set", usd: [1000, 500, 999999999] }); check(z.status === 200 && z.body.prize.usd[0] === 1000 && z.body.prize.usd[2] === 100000, "a GM sets this week's prize (capped at 1,000 USDC a place)");
    check((await get("studio-week")).prize.usd[1] === 500, "the board shows this week's prize");
    z = await call(gm, "world-studio-prize", { op: "paid", week: wk, rank: 0, tx: "0x" + "1".repeat(64) }); check(z.status === 400, "no paying before the week ends");
    T += 7 * 86400e3;
    const pad = (a) => "0x" + a.toLowerCase().slice(2).padStart(64, "0"), tx = "0x" + "2".repeat(64), TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    receipts[tx] = { status: "0x1", logs: [{ address: "0x3600000000000000000000000000000000000000", topics: [TR, pad(gm.address), pad(mk.address)], data: "0x" + (5000000n).toString(16) }] };
    z = await call(gm, "world-studio-prize", { op: "paid", week: wk, rank: 0, tx }); check(z.status === 400, "a transfer short of the prize is refused (5 of 10 USDC)");
    const tx2 = "0x" + "3".repeat(64); receipts[tx2] = { status: "0x1", logs: [{ ...receipts[tx].logs[0], data: "0x" + (10000000n).toString(16) }] };
    z = await call(gm, "world-studio-prize", { op: "paid", week: wk, rank: 0, tx: tx2 }); check(z.status === 200 && z.body.prize.paid[0].to === mk.address.toLowerCase(), "the winner's prize: GM → the maker's wallet, checked");
    z = await call(gm, "world-studio-prize", { op: "paid", week: wk, rank: 0, tx: tx2 }); check(z.status === 409, "paid once");
    const lw = await get("studio-week"); check(lw.last.prize && lw.last.prize.paid[0] && lw.last.prize.paid[0].tx === tx2, "last week's board shows the prize as paid");
    T -= 7 * 86400e3; }
  r = await call(fan, "world-studio-save", { spec: gs.spec, from: id }); const rm = r.body.game; check(r.status === 200 && rm.from && rm.from.id === id && rm.from.title === "Week Entry", "a remix keeps where it came from");
  check(((await get("studio-game&id=" + id)).game.remixes || 0) === 1, "the original counts its remixes");
  await call(fan, "world-studio-del", { id: rm.id }); await call(mk, "world-studio-del", { id }); await call(mk, "world-studio-del", { id: id2 }); }
// STU-D: the maker's numbers, reports + a GM's hide, the agent's tweak
{ const { GM_WALLETS } = await import("../../api/_world-village.mjs"); const gm = ethers.Wallet.createRandom(); GM_WALLETS.push(gm.address.toLowerCase());
  const mk = ethers.Wallet.createRandom(), p2 = ethers.Wallet.createRandom(); let r = await call(mk, "world-studio-save", { spec: { tpl: "runner", title: "Stats Run", seed: 31 } }); const id = r.body.game.id; await call(mk, "world-studio-publish", { id, on: true });
  const L = G.genLevel((await get("studio-game&id=" + id)).game.spec);
  await call(fan, "world-studio-play", { id, coins: 0, dist: L.len * 0.35, done: false }); T += 21e3; await call(p2, "world-studio-play", { id, coins: 1, dist: L.len, done: true }); T += 21e3; await call(mk, "world-studio-play", { id, coins: 0, dist: 1, done: false });
  let mine = (await get("studio-mine&wallet=" + mk.address.toLowerCase())).games.find((g) => g.id === id);
  check(mine.stats && mine.stats.runs === 2 && mine.stats.clears === 1 && mine.stats.ends[3] === 1 && mine.stats.ends.reduce((a, x) => a + x, 0) === 1, "the maker's numbers: runs, clears, where the others' runs ended (the maker's own not counted)");
  check(!(await get("studio-game&id=" + id)).game.stats, "the numbers are the maker's: not on the public page");
  r = await call(fan, "world-studio-report", { id, why: "unfair" }); const r2 = await call(fan, "world-studio-report", { id, why: "rude" }); const r3 = await call(mk, "world-studio-report", { id, why: "rude" });
  const rep = await get("studio-reports"); check(r.status === 200 && r2.body.already && r3.status === 400 && rep.list[0] && rep.list[0].id === id && rep.list[0].n === 1, "a report once a wallet, not your own; the GM's list");
  r = await call(fan, "world-studio-hide", { id, on: true }); check(r.status === 403, "only a GM hides a game");
  r = await call(gm, "world-studio-hide", { id, on: true }); let arc = await get("studio-arcade"); check(r.body.hidden && !arc.games.some((g) => g.id === id), "a GM hides a game: off the arcade");
  r = await call(gm, "world-studio-hide", { id, on: false }); arc = await get("studio-arcade"); check(!r.body.hidden && arc.games.some((g) => g.id === id) && !(await get("studio-reports")).list.some((x) => x.id === id), "and back, its reports cleared");
  aiReply = '{"lasers":0,"walls":1,"say":"Fewer lasers, an easier start","tpl":"arena","seed":5}'; const base = (await get("studio-game&id=" + id)).game.spec;
  r = await call(mk, "world-studio-tweak", { spec: base, t: "make it easier, no lasers" }); check(r.status === 200 && r.body.by === "agent" && r.body.spec.lasers === 0 && r.body.spec.walls === 1 && r.body.spec.tpl === "runner" && r.body.spec.seed === base.seed && /easier/.test(r.body.say), "the agent's tweak: only the settings it changed, the template and layout kept");
  aiReply = "no json here"; r = await call(mk, "world-studio-tweak", { spec: { ...base, coins: 2 }, t: "more coins please" }); check(r.body.by === "rules" && r.body.spec.coins === 3, "without the model the words are read by rules (more coins: " + r.body.spec.coins + ")");
  await call(mk, "world-studio-del", { id }); }
// ---- SB-2 / SB-3: JUMP WORLD and its modes — the grid's rules, a level for each, the score held to what it holds ----
{ const sp = G.clampSpec({ tpl: "jump", build: { jw: 1, W: 9999, c: [[0, 0, "g"], [0, 0, "s"], [-1, 0, "g"], [5, 20, "g"], [3, 1, "nope"], [4, 1, "B"], [5, 2, "o"], [8, 1, "B"], [9, 1, "B"], [12, 1, "B"], [2, 1, "S"], [3, 3, "S"]] } }), c = sp.build.c, has = (x, y, k) => c.some((q) => q[0] === x && q[1] === y && q[2] === k);
  check(sp.build.W === G.JW.MAX && has(0, 0, "g") && !has(0, 0, "s") && !c.some((q) => q[0] < 0 || q[1] >= G.JW.H || q[2] === "nope"), "JUMP WORLD: the grid's bounds, one thing a cell, unknown pieces dropped");
  check(!has(5, 2, "o") && c.filter((q) => q[2] === "B").length === G.JW.BOSSES && c.filter((q) => q[2] === "S").length === 1 && c.some((q) => q[2] === "F"), "a dragon takes 2 × 2 (a coin inside it goes), two bosses at most, one start, a finish added"); }
for (const tpl of ["jump", "dungeon", "escape", "boss", "mining"]) { const sp = G.clampSpec({ tpl, seed: 4242, len: 45 }), L = G.genLevel(sp), R = G.jwReach(L.B);
  check(L.jump && L.B.c.length > 40 && L.len > 30 && L.coins > 0 && R.ok && (tpl === "escape" || tpl === "mining" ? L.timer > 0 : !L.timer) && (tpl !== "boss" || L.B.c.some((q) => q[2] === "B")), `${tpl}: a quick-start level that can be finished${tpl === "boss" ? ", with its dragon" : ""}${L.timer ? ", against the clock" : ""}`);
  check(JSON.stringify(G.toBuild(sp)) === JSON.stringify(G.genJumpBuild(sp)) && G.estimate(sp).stars >= 1, `${tpl}: the builder starts from the quick-start level; the bots rate it`); }
{ const mk = ethers.Wallet.createRandom(), other = ethers.Wallet.createRandom(), r = await call(mk, "world-studio-save", { spec: { tpl: "jump", title: "JW test", seed: 99 } }); const id = r.body && r.body.game && r.body.game.id; if (id) { await call(mk, "world-studio-publish", { id, on: true });
  const L = G.genLevel(G.clampSpec({ tpl: "jump", seed: 99 })), q = await call(other, "world-studio-play", { id, coins: 99999, dist: 99999, done: true });
  check(q.status === 200 && q.body.score === G.scoreOf(L.coins, L.len, true), "a JUMP WORLD run's score is held to the level's coins and length"); await call(mk, "world-studio-del", { id }); } else check(false, "a JUMP WORLD game saves"); }
// ---- SB-3: MONSTER SURVIVAL, BEAT MAKER, HOVER RACE ----
{ const L = G.genLevel(G.clampSpec({ tpl: "survival", len: 60, lasers: 2, walls: 4, speed: 5 }));
  check(L.survival && L.secs === 240 && L.bossAt.length === 3 && L.bossAt.every((t, i, a) => t > 0 && t < L.secs && (!i || t > a[i - 1])) && L.diff === "hard" && L.rate > 1 && L.len === L.secs * 20, "survival: the maker's length, crowd, bosses spread over the run, the arena's difficulty"); }
{ const sp = G.clampSpec({ tpl: "rhythm", len: 30, speed: 3, build: { bt: 1, n: [[2, 0], [10, 0], [10, 0], [10, 1], [10, 2], [12, 9], [99999, 1], [20, 3]] } }), n = sp.build.n;
  check(n.length === 3 && n.every(([s0, l]) => s0 >= 8 && s0 < G.stepsOf(sp) && l >= 0 && l < 4) && n.filter((q) => q[0] === 10).length === 2, "beat: notes on the song's steps and lanes, none in the count-in, two at once at most");
  const L = G.genLevel(G.clampSpec({ tpl: "rhythm", seed: 5 })); check(L.beat && L.B.n.length > 20 && L.coins === L.B.n.length * 2 && L.bpm === G.bpmOf(G.clampSpec({ tpl: "rhythm" })), "beat: a quick-start chart, 2 coins a note at most"); }
{ const sp = G.clampSpec({ tpl: "race", build: { rc: 1, laps: 9, r: [[0, 0], [2, 2], [30, 0], [30, 30], [999, 0], [0, 30]], w: [[30, 1], [10, 10]], o: [[5, 5]] } }), b = sp.build;
  check(b.laps === 3 && b.r.length === 4 && b.w.length === 1 && b.o.length === 1, "race: laps 1–3, rings apart and on the ground, no pillar inside a ring");
  check(G.clampSpec({ tpl: "race", build: { rc: 1, r: [[0, 0], [20, 0]] } }).build === undefined, "race: a track of fewer than 3 rings isn't kept");
  const L = G.genLevel(G.clampSpec({ tpl: "race", seed: 9, len: 60 })); check(L.race && L.B.r.length === 11 && L.limit > 20 && L.coins === L.B.o.length + L.limit, "race: a quick-start loop, a time limit, orbs + seconds left as coins"); }
for (const tpl of ["survival", "rhythm", "race"]) { const sp = G.clampSpec({ tpl, seed: 3 }); check(G.estimate(sp).stars >= 1 && (tpl === "survival" || JSON.stringify(G.toBuild(sp)) === JSON.stringify(tpl === "rhythm" ? G.genBeatChart(sp) : G.genRaceBuild(sp))), `${tpl}: the bots rate it${tpl === "survival" ? "" : "; the builder starts from the quick start"}`); }
// ---- the web: creator IDs and game addresses (/game/@<id>/<game>) ----
{ const S = await import("../../api/_world-studio.mjs"), cr = ethers.Wallet.createRandom(), cr2 = ethers.Wallet.createRandom(), other = ethers.Wallet.createRandom();
  check(S.slugOf("Neon Rush!") === "neon-rush" && S.slugOf("Café  Run--") === "cafe-run" && S.slugOf("네온 러시") === "" && S.normHandle("@Mint_01") === "mint_01", "web: a title becomes an address (letters, numbers, -); an ID is lower case without its @");
  let r = await call(cr, "world-studio-handle", { h: "ab" }); check(r.status === 400, "web: an ID needs 3–20 letters, numbers or _");
  r = await call(cr, "world-studio-handle", { h: "arcircle" }); check(r.status === 400, "web: a reserved ID (arcircle, gm, admin …) can't be taken");
  r = await call(cr, "world-studio-handle", { h: "@MintMaker" }); check(r.status === 200 && r.body.h === "mintmaker", "web: a creator picks an ID: " + JSON.stringify(r.body));
  r = await call(cr2, "world-studio-handle", { h: "mintmaker" }); check(r.status === 409, "web: an ID is one creator's (taken → 409)");
  check((await get("studio-handle&wallet=" + cr.address.toLowerCase())).h === "mintmaker", "web: a wallet's ID is read back");
  r = await call(cr, "world-studio-save", { spec: { tpl: "jump", title: "Neon Run", seed: 7 } }); const id1 = r.body.game.id; await call(cr, "world-studio-publish", { id: id1, on: true });
  r = await call(cr, "world-studio-save", { spec: { tpl: "runner", title: "Neon Run", seed: 8 } }); const id2 = r.body.game.id; await call(cr, "world-studio-publish", { id: id2, on: true });
  r = await call(cr, "world-studio-save", { spec: { tpl: "runner", title: "네온 러시", seed: 9 } }); const id3 = r.body.game.id; await call(cr, "world-studio-publish", { id: id3, on: true });
  r = await call(cr, "world-studio-save", { spec: { tpl: "runner", title: "Secret", seed: 10 } }); const id4 = r.body.game.id; // (a draft: never on the web)
  let c = await get("studio-creator&h=@mintmaker"); const sl = Object.fromEntries(c.games.map((g) => [g.id, g.slug]));
  check(c.creator.h === "mintmaker" && c.games.length === 3 && sl[id1] === "neon-run" && sl[id2] === "neon-run-2" && sl[id3] === id3 && !(id4 in sl), "web: a creator's page lists the published games, each with its own address: " + JSON.stringify(sl));
  let at = await get("studio-at&h=mintmaker&g=neon-run-2"); check(at.game && at.game.id === id2 && at.game.spec && at.creator.h === "mintmaker", "web: a game is found by its address");
  check((await get("studio-game&id=" + id1)).game.h === "mintmaker" && (await get("studio-game&id=" + id1)).game.slug === "neon-run", "web: a game says its address (for the share links)");
  await call(cr, "world-studio-save", { id: id1, spec: { tpl: "jump", title: "Sky Run", seed: 7 } }); at = await get("studio-at&h=mintmaker&g=neon-run");
  check(at.game && at.game.id === id1 && at.game.slug === "sky-run", "web: a renamed game gets a new address and the old one still finds it");
  check((await get("studio-at&h=mintmaker&g=" + id4)).error, "web: a draft has no address");
  r = await call(cr, "world-studio-handle", { h: "mintqueen" }); check(r.status === 200 && r.body.left === S.HANDLE.CHANGES - 1, "web: an ID can change (" + S.HANDLE.CHANGES + " times)");
  check((await get("studio-creator&h=mintmaker")).moved === "mintqueen", "web: the old ID points to the new one");
  r = await call(cr2, "world-studio-handle", { h: "mintmaker" }); check(r.status === 409, "web: an old ID stays its creator's (nobody else can take a link that's out there)");
  r = await call(cr, "world-studio-handle", { h: "mintmaker" }); check(r.status === 200 && !(await get("studio-creator&h=mintmaker")).moved, "web: a creator can go back to an old ID of their own");
  const pg = (q) => W.read(new URL("https://www.arcircle.app/api/social?world=studio-page&" + q));
  let P = await pg("h=mintmaker&g=sky-run"); const html = P.body.__html || "";
  check(P.status === 200 && /og:title" content="Sky Run — @mintmaker/.test(html) && /twitter:card" content="summary_large_image"/.test(html) && /images\/studio\/tpl\/jump-768\.webp/.test(html) && /window\.__SG = \{/.test(html), "web: a game's page carries its card for X (title, picture) and its data");
  P = await pg("h=mintmaker&g=neon-run"); check(P.status === 301 && P.body.headers.location === "/game/@mintmaker/sky-run", "web: an old address sends you on to the game's current one");
  await call(cr, "world-studio-handle", { h: "mintqueen" }); P = await pg("h=mintmaker&g=sky-run"); check(P.status === 301 && P.body.headers.location === "/game/@mintqueen/sky-run", "web: an old ID's link sends you on to the new ID");
  P = await pg("h=nobodyhere&g=x"); check(P.status === 404 && /noindex/.test(P.body.__html), "web: an address that isn't there is a 404 page (not indexed)");
  P = await pg("h=arcircle&g=neon-rush"); check(P.status === 200 && /Neon Rush — @arcircle/.test(P.body.__html), "web: ARCIRCLE's own games live at /game/@arcircle/<game>");
  P = await pg("h=arcircle"); check(P.status === 200 && (P.body.__html.match(/"slug":/g) || []).length >= 15, "web: @arcircle's page lists the official games");
  await call(cr, "world-studio-save", { id: id2, spec: { tpl: "runner", title: "<img src=x onerror=alert(1)>", seed: 8 } }); P = await pg("h=mintqueen");
  check(!/<img src=x/.test(P.body.__html) && !/<\/script><img/.test(P.body.__html), "web: a title can't put markup into the page");
}
// STB7: the card's picture kept on the server
{ const S = await import("../../api/_world-studio.mjs"), mk = ethers.Wallet.createRandom(), ot = ethers.Wallet.createRandom();
  let r = await call(mk, "world-studio-save", { spec: { tpl: "runner", title: "Pic Run", seed: 3 } }); const id = r.body.game.id, jpg = "data:image/jpeg;base64," + Buffer.from("fakejpegbytes").toString("base64");
  check((await call(ot, "world-studio-thumb", { id, img: jpg })).status === 404, "thumb: only the maker sets a game's picture");
  check((await call(mk, "world-studio-thumb", { id, img: "data:image/svg+xml;base64,PHN2Zz4=" })).status === 400, "thumb: a JPEG or WebP only (no SVG)");
  check((await call(mk, "world-studio-thumb", { id, img: "data:image/jpeg;base64," + "A".repeat(S.THUMB_MAX * 2) })).status === 400, "thumb: at most " + S.THUMB_MAX / 1024 + " KB");
  r = await call(mk, "world-studio-thumb", { id, img: jpg }); const t = await get("studio-thumb&id=" + id);
  check(r.status === 200 && r.body.th && t.__bin === Buffer.from("fakejpegbytes").toString("base64") && t.mime === "image/jpeg", "thumb: kept and served as a picture");
  await call(mk, "world-studio-publish", { id }); const a = await get("studio-arcade");
  check(a.games.find((g) => g.id === id).th === r.body.th, "thumb: the arcade's card points at it (versioned)"); }
// STB6: build together — a code, one partner, the pen
{ const S = await import("../../api/_world-studio.mjs"), own = ethers.Wallet.createRandom(), pal = ethers.Wallet.createRandom(), x3 = ethers.Wallet.createRandom(), x4 = ethers.Wallet.createRandom();
  let r = await call(own, "world-studio-save", { spec: { tpl: "jump", title: "Duo Jump", seed: 4 } }); const id = r.body.game.id;
  r = await call(pal, "world-studio-co-invite", { id }); check(r.status === 404, "co: only the owner opens a code");
  r = await call(own, "world-studio-co-invite", { id }); const code = r.body.code; check(r.status === 200 && /^[A-Z0-9]{6}$/.test(code), "co: the owner gets a 6-letter code");
  check((await call(own, "world-studio-co-invite", { id })).body.code === code, "co: asking again gives the same code while it's open");
  r = await call(own, "world-studio-co-join", { code }); check(r.status === 400, "co: you can't join your own game");
  r = await call(pal, "world-studio-co-join", { code: code.toLowerCase() }); check(r.status === 200 && r.body.game.shared && r.body.game.co, "co: a friend joins with the code");
  r = await call(x3, "world-studio-co-join", { code }); check(r.status === 200 && r.body.game.co.n === 2, "co: a second friend joins the same code (a team of " + S.CO.TEAM + ")");
  let m = await get("studio-mine&wallet=" + pal.address.toLowerCase()); check(m.shared.length === 1 && m.shared[0].id === id && m.games.length === 0, "co: the game shows in the partner's My games as shared");
  r = await call(pal, "world-studio-save", { id, spec: { tpl: "jump", title: "Duo Jump", seed: 9 } }); check(r.status === 200 && r.body.game.co.pen && r.body.game.co.pen.w === pal.address.toLowerCase(), "co: the partner saves and holds the pen");
  r = await call(own, "world-studio-save", { id, spec: { tpl: "jump", title: "Duo Jump", seed: 5 } }); check(r.status === 409 && r.body.pen, "co: the other one can't save while the pen is out");
  r = await call(own, "world-studio-co-pen", { id }); check(r.status === 409, "co: nor take the pen");
  await call(pal, "world-studio-co-pen", { id, off: true }); r = await call(own, "world-studio-co-pen", { id }); check(r.status === 200 && r.body.pen.w === own.address.toLowerCase(), "co: once it's passed, the other takes it");
  T += S.CO.PEN_MS + 1000; r = await call(pal, "world-studio-save", { id, spec: { tpl: "jump", title: "Duo Jump", seed: 11 } }); check(r.status === 200, "co: a pen left alone frees itself after " + S.CO.PEN_MS / 60e3 + " min");
  check((await call(pal, "world-studio-publish", { id })).status === 404 && (await call(pal, "world-studio-del", { id })).status === 404, "co: the partner can't publish or delete");
  check((await call(x4, "world-studio-save", { id, spec: { tpl: "jump", seed: 1 } })).status === 404, "co: nobody else saves it");
  r = await call(pal, "world-studio-co-leave", { id }); m = await get("studio-mine&wallet=" + pal.address.toLowerCase());
  check(r.status === 200 && m.shared.length === 0 && (await call(pal, "world-studio-save", { id, spec: { tpl: "jump", seed: 2 } })).status === 404, "co: leaving takes it off the partner's list and they can't save it any more");
  await call(x3, "world-studio-co-leave", { id });
  r = await call(own, "world-studio-save", { id, spec: { tpl: "jump", title: "Duo Jump", seed: 3 } }); check(r.status === 200 && !r.body.game.co, "co: alone again, the owner saves without a pen"); }
// STB7 (2026-10-27): comments, reactions, a creator's picks, the day's creator challenge, a creator's level and badges
{ const S7 = await import("../../api/_world-studio.mjs"), mk = ethers.Wallet.createRandom(), pl = ethers.Wallet.createRandom(), pl2 = ethers.Wallet.createRandom();
  const d0 = new Date(T + 9 * 3600e3).toISOString().slice(0, 10), ch = S7.dailyOf(d0);
  let r = await call(mk, "world-studio-save", { spec: { tpl: ch.tpl, theme: ch.theme, title: "Daily One", seed: 77 } }); const gid = r.body.game.id; await call(mk, "world-studio-publish", { id: gid, on: true });
  r = await call(pl, "world-studio-comment", { id: gid, t: "So <b>fun</b>!\n" + "x".repeat(300) }); const c0 = r.body.comments && r.body.comments[0];
  check(r.status === 200 && c0 && c0.t.length <= S7.SOCIAL.CMT && !c0.t.includes("<") && !("w" in c0) && c0.by.length === 6, "comments: clipped, no tags, the wallet stays on the server (a short tag)");
  r = await call(pl, "world-studio-comment", { id: gid, t: "again right away" }); check(r.status === 429, "comments: one every " + S7.SOCIAL.GAP / 1000 + " s");
  T += S7.SOCIAL.GAP + 1000; r = await call(mk, "world-studio-comment", { id: gid, t: "Thanks for playing!" }); check(r.status === 200 && r.body.comments[0].maker, "comments: the maker's is marked");
  r = await call(pl2, "world-studio-uncomment", { id: gid, k: c0.k }); check(r.status === 403, "comments: someone else can't remove one");
  r = await call(mk, "world-studio-uncomment", { id: gid, k: c0.k }); check(r.status === 200 && r.body.comments.length === 1, "comments: the maker removes one on their game");
  let g7 = await get("studio-comments&id=" + gid); check(g7.comments.length === 1 && g7.comments[0].t === "Thanks for playing!", "comments: read back");
  r = await call(pl, "world-studio-react", { id: gid, r: "fire" }); const r2 = await call(pl, "world-studio-react", { id: gid, r: "fire" }), r3 = await call(pl, "world-studio-react", { id: gid, r: "nope" });
  await call(pl2, "world-studio-react", { id: gid, r: "fire" }); g7 = await get("studio-comments&id=" + gid);
  check(r.body.rx.fire === 1 && r2.body.already && r3.status === 400 && g7.rx.fire === 2, "reactions: once a wallet each, only known ones");
  r = await call(pl, "world-studio-play", { id: gid, coins: 1, dist: 5, done: false }); r = await call(pl2, "world-studio-like", { id: gid }); const dd = await get("studio-day");
  check(dd.tpl === ch.tpl && dd.theme === ch.theme && dd.top.some((x) => x.id === gid && x.likes === 1), "the day's challenge: a game published today in its template + theme is on the board (" + ch.tpl + " · " + ch.theme + ")");
  r = await call(pl, "world-studio-picks", { ids: [gid, "gnope00", gid, "evil/../x"] }); check(r.status === 200 && r.body.ids.length === 1 && r.body.ids[0] === gid, "picks: only real published games, once each");
  await call(pl, "world-studio-handle", { h: "picker7" }); const cr = await get("studio-creator&h=picker7");
  check(cr.picks && cr.picks.length === 1 && cr.picks[0].id === gid && cr.creator.lv === 1, "picks: on the creator's page");
  await call(mk, "world-studio-handle", { h: "maker7" }); const cm = await get("studio-creator&h=maker7");
  check(cm.creator.lv >= 1 && cm.creator.xp === 1 + 5 + 20 && Array.isArray(cm.creator.badges), "creator level: plays + likes ×5 + games ×20");
  const lv = S7.creatorLevel(1200, 150, 12); check(lv.badges.includes("p1k") && lv.badges.includes("l100") && lv.badges.includes("g10") && !lv.badges.includes("p10k") && lv.lv > 1 && lv.next > lv.xp, "creator badges at 100 / 1,000 plays, 10 / 100 likes, 3 / 10 games"); }
// WS4: a live race — a code, up to RACE.MAX, the host starts it, places bounded by the level's speed, the first over the line
{ const { RACE, OFFICIAL } = await import("../../api/_world-studio.mjs"); const P = [ethers.Wallet.createRandom(), ethers.Wallet.createRandom(), ethers.Wallet.createRandom(), ethers.Wallet.createRandom(), ethers.Wallet.createRandom()];
  let r = await call(P[0], "world-studio-race-new", { id: "goffarena" }); check(r.status === 400, "race: not for an arena game");
  r = await call(P[0], "world-studio-race-new", { id: "goffrun", c: "lumi" }); const code = r.body.race && r.body.race.code;
  check(r.status === 200 && /^[A-Z0-9]{5}$/.test(code) && r.body.race.players.length === 1 && r.body.race.players[0].c === "lumi", "race: a 5-letter code, the host seated (" + code + ")");
  r = await call(P[0], "world-studio-race-start", { code }); check(r.status === 400, "race: not alone");
  r = await call(P[1], "world-studio-race-start", { code }); check(r.status === 404 || r.status === 403, "race: a stranger can't start it");
  for (const p of P.slice(1, 4)) await call(p, "world-studio-race-join", { code: code.toLowerCase() });
  r = await call(P[4], "world-studio-race-join", { code }); check(r.status === 409, "race: full at " + RACE.MAX);
  r = await call(P[1], "world-studio-race-join", { code }); check(r.status === 200 && r.body.race.players.length === 4, "race: joining twice keeps one seat");
  r = await call(P[3], "world-studio-race-leave", { code }); let v = await get("studio-race&code=" + code); check(v.race.players.length === 3, "race: leaving the lobby frees the seat");
  r = await call(P[1], "world-studio-race-start", { code }); check(r.status === 403, "race: only the host starts it");
  r = await call(P[1], "world-studio-race-tick", { code, z: 10 }); check(r.status === 404, "race: no places before the start");
  r = await call(P[0], "world-studio-race-start", { code }); const st = r.body.race.start; check(r.status === 200 && st === T + RACE.CD_MS, "race: the start is the server's clock + the countdown");
  r = await call(P[3], "world-studio-race-join", { code }); check(r.status === 409 && r.body.started, "race: no joining once it's started");
  const L = G.genLevel(G.clampSpec(OFFICIAL.goffrun)), sp = G.speedOf(G.clampSpec(OFFICIAL.goffrun));
  T = st + 10e3; r = await call(P[0], "world-studio-race-tick", { code, z: 99999, x: 2.2, hp: 3, coins: 2 }); let me0 = r.body.race.players.find((x) => x.w === P[0].address.toLowerCase()) || r.body.race.players[0];
  check(me0.z <= sp * 1.25 * 10 + 8 && me0.z > 0 && !me0.fin, "race: a place no further than the level's speed allows (" + Math.round(me0.z) + " m in 10 s)");
  r = await call(P[0], "world-studio-race-tick", { code, z: 5 }); me0 = r.body.race.players[0]; check(me0.z > 5, "race: a place never goes back");
  r = await call(P[0], "world-studio-race-tick", { code, z: 50, fin: true }); check(!r.body.race.players[0].fin, "race: no finish short of the line");
  T = st + 60e3; r = await call(P[0], "world-studio-race-tick", { code, z: L.len, fin: true, hp: 2 }); check(r.body.race.players[0].fin === 60e3, "race: over the line — the time on the server's clock");
  r = await call(P[1], "world-studio-race-tick", { code, z: 100, hp: 0 }); check(r.body.race.players[1].out, "race: out of hearts is out");
  r = await call(P[1], "world-studio-race-tick", { code, z: L.len, fin: true }); check(r.body.race.players[1].out && !r.body.race.players[1].fin, "race: once out, nothing changes");
  r = await call(P[2], "world-studio-race-leave", { code }); v = await get("studio-race&code=" + code); check(v.race.players[2].out, "race: leaving a running race is out");
  r = await call(P[1], "world-studio-race-new", { id: "goffrun", from: code }); v = await get("studio-race&code=" + code); check(r.status === 200 && !v.race.next, "race: only the host's new race is the rematch");
  r = await call(P[0], "world-studio-race-new", { id: "goffrun", from: code }); v = await get("studio-race&code=" + code); check(r.status === 200 && v.race.next === r.body.race.code && v.race.next !== code, "race: the host's rematch code shows on the last race (" + v.race.next + ")");
  T = st + RACE.RUN_MS + 1; v = await W.read(new URL("https://x/api/social?world=studio-race&code=" + code)); check(v.status === 404, "race: gone after " + RACE.RUN_MS / 60e3 + " minutes");
}
// WS5: a challenge carries the run as a ghost; following a maker shows their new games in your feed
{ const { CHAL } = await import("../../api/_world-studio.mjs"); const mk = ethers.Wallet.createRandom(), fa = ethers.Wallet.createRandom();
  let r = await call(mk, "world-studio-save", { spec: { tpl: "runner", theme: "neon", title: "Follow Me", speed: 3, len: 45, coins: 3, walls: 2, gaps: 1, lasers: 1, seed: 99 } }); const id = r.body.game.id;
  r = await call(fa, "world-studio-follow", { id }); check(r.status === 404, "follow: not before it's published… (a draft's maker can't be followed)");
  await call(mk, "world-studio-publish", { id, on: true });
  r = await call(mk, "world-studio-follow", { id }); check(r.status === 400, "follow: not yourself");
  r = await call(fa, "world-studio-follow", { id }); const r2 = await call(fa, "world-studio-follow", { id }); check(r.body.on && r.body.fans === 1 && r2.body.fans === 1, "follow: once, the fans counted");
  let g = (await get("studio-game&id=" + id + "&me=" + fa.address.toLowerCase())).game; check(g.fans === 1 && g.fol === true, "follow: the game page says you follow its maker");
  r = await call(fa, "world-studio-follow", { id: "goffrun" }); check(r.status === 404, "follow: not ARCIRCLE's own games");
  r = await call(mk, "world-studio-save", { spec: { tpl: "dash", theme: "ice", title: "Second One", speed: 3, len: 45, coins: 3, walls: 2, gaps: 1, lasers: 1, seed: 7 } }); const id2 = r.body.game.id; T += 60e3; await call(mk, "world-studio-publish", { id: id2, on: true });
  let f = await get("studio-feed&wallet=" + fa.address.toLowerCase()); check(f.games.length === 2 && f.games[0].id === id2 && f.games[1].id === id && f.following.length === 1, "feed: the maker's games, newest first");
  await call(mk, "world-studio-publish", { id: id2, on: false }); await call(mk, "world-studio-publish", { id: id2, on: true }); f = await get("studio-feed&wallet=" + fa.address.toLowerCase()); check(f.games.length === 2, "feed: a game published again isn't listed twice");
  r = await call(fa, "world-studio-follow", { id, on: false }); g = (await get("studio-game&id=" + id + "&me=" + fa.address.toLowerCase())).game; f = await get("studio-feed&wallet=" + fa.address.toLowerCase());
  check(r.body.fans === 0 && g.fol === false && f.games.length === 0, "unfollow: fans down, the feed empty");
  const L = G.genLevel(G.clampSpec({ tpl: "runner", theme: "neon", speed: 3, len: 45, coins: 3, walls: 2, gaps: 1, lasers: 1, seed: 99 }));
  r = await call(fa, "world-studio-chal", { id, coins: 999, dist: L.len, done: true, trace: [[0, 0, 0], [0, 0, 4], [22, 0, 9]] }); const code = r.body.code;
  const c = await get("studio-chal&c=" + code); check(/^[a-z0-9]{8}$/.test(code) && c.chal.id === id && c.chal.score === G.scoreOf(L.coins, L.len, true) && c.chal.tr.length === 3, "challenge: a code, the score checked against the level, the run kept as its ghost");
  T += CHAL.DAYS * 86400e3 + 1; const cx = await W.read(new URL("https://x/api/social?world=studio-chal&c=" + code)); check(cx.status === 404, "challenge: gone after " + CHAL.DAYS + " days");
}
// RM3: quick races — the race hour's game, a second racer joins the open one, it starts by itself after QWAIT; the watch list
{ const { RACE, hourGame } = await import("../../api/_world-studio.mjs"); const Q = [ethers.Wallet.createRandom(), ethers.Wallet.createRandom(), ethers.Wallet.createRandom()];
  let r = await call(Q[0], "world-studio-race-quick", { c: "custom-nex" }); const code = r.body.race && r.body.race.code;
  check(r.status === 200 && r.body.race.id === hourGame(T) && !r.body.race.start, "quick race: the hour's game (" + hourGame(T) + "), waiting");
  r = await call(Q[1], "world-studio-race-quick", {}); check(r.body.race.code === code && r.body.race.players.length === 2, "quick race: the next racer lands in the same one");
  let L = await get("studio-races"); check(L.hour.id === hourGame(T) && L.hour.waiting === 2 && L.open.some((x) => x.code === code), "the race list: the hour's game and who's waiting");
  r = await call(Q[1], "world-studio-race-leave", { code }); let v = await get("studio-race&code=" + code); check(v.race.players.length === 1, "quick race: leaving the lobby frees the seat, the race stays");
  r = await call(Q[0], "world-studio-race-leave", { code }); v = await W.read(new URL("https://x/api/social?world=studio-race&code=" + code)); check(v.status === 404, "quick race: empty, it closes");
  r = await call(Q[2], "world-studio-race-quick", {}); const c2 = r.body.race.code; check(c2 !== code, "quick race: a closed one isn't joined — a new one opens");
  T += RACE.QWAIT + 1; v = await get("studio-race&code=" + c2); check(v.race.start === T + RACE.CD_MS, "quick race: it starts by itself after " + RACE.QWAIT / 1000 + " s, even alone (ghosts fill the pads)");
  L = await get("studio-races"); check(L.live.some((x) => x.code === c2) && !L.open.some((x) => x.code === c2), "the race list: it moves to the live ones (to watch)");
  T += RACE.CD_MS + 5e3; r = await call(Q[2], "world-studio-race-tick", { code: c2, z: 30, hp: 3 }); check(r.status === 200 && r.body.race.players[0].z > 0, "quick race: racing");
}
// RM5: the creator season (others' plays + likes ×5 this month) and the maker's daily plays + followers on My games
{ const { SEASON, monthOf } = await import("../../api/_world-studio.mjs"); const mk = ethers.Wallet.createRandom(), p1 = ethers.Wallet.createRandom(), p2 = ethers.Wallet.createRandom();
  let r = await call(mk, "world-studio-save", { spec: { tpl: "runner", theme: "candy", title: "Season Star", speed: 2, len: 30, coins: 3, walls: 1, gaps: 0, lasers: 0, seed: 31 } }); const id = r.body.game.id; await call(mk, "world-studio-publish", { id, on: true });
  await call(p1, "world-studio-play", { id, coins: 1, dist: 10, done: false }); T += 21e3; await call(p2, "world-studio-play", { id, coins: 1, dist: 10, done: false }); await call(mk, "world-studio-play", { id, coins: 1, dist: 10, done: false }); await call(p1, "world-studio-like", { id });
  const S = await get("studio-season"), me = S.top.find((x) => x.plays === 2 && x.likes === 1);
  check(S.month === monthOf(T) && me && me.pts === 2 + SEASON.LIKE, "season: others' plays + likes ×" + SEASON.LIKE + " (the maker's own play not counted)");
  await call(p1, "world-studio-follow", { id }); const M = await get("studio-mine&wallet=" + mk.address.toLowerCase()), g = M.games.find((x) => x.id === id);
  check(M.fans === 1 && g.dl && Object.values(g.dl).reduce((a, x) => a + x, 0) === 2, "dashboard: followers and the daily plays by others on My games");
  const pub = (await get("studio-game&id=" + id)).game; check(!pub.dl, "dashboard: the daily plays are the maker's only");
}
check([...db.keys()].every((k) => /^[^/]+\/[^/]+$/.test(k)), "every document is collection/id (Firestore refuses a bare name: the arcade once was one)");
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
