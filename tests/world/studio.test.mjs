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
check(G.clampSpec({ tpl: "arena" }).title === "My Arena" && G.clampSpec({ tpl: "puzzle" }).tpl === "runner", "templates: the arena opens, a closed one falls back to the runner");
// closed: only GMs while AGENT DIMENSION is closed
let r = await call(me, "world-studio-save", { spec: {} }); check(r.status === 403 && r.body.closed, "closed: a player can't save a game yet");
AGENT.OPEN = true;
r = await W.handle({ action: "world-studio-save", spec: {} }); check(r.status >= 400 && r.status < 500, "no signature: nothing");
r = await call(me, "world-studio-save", { spec: { title: "Neon Rush", theme: "neon", speed: 3, len: 30, coins: 4, walls: 2, gaps: 1, lasers: 1, seed: 7 } });
const id = r.body.game && r.body.game.id; check(r.status === 200 && /^g[a-z0-9]+$/.test(id) && r.body.game.pub === false, "a draft saved: " + id);
r = await call(me, "world-studio-save", { id, spec: { ...r.body.game.spec, title: "Neon Rush 2" } }); check(r.status === 200 && r.body.game.title === "Neon Rush 2", "changed");
r = await call(fan, "world-studio-save", { id, spec: { title: "mine now" } }); check(r.status === 404, "someone else can't change it");
r = await call(fan, "world-studio-play", { id, coins: 1, dist: 10 }); check(r.status === 403, "not published: others can't play it");
let ar = await get("studio-arcade"); check(ar.ok && !ar.games.some((g) => g.id === id), "a draft isn't on the arcade");
r = await call(me, "world-studio-publish", { id, on: true }); ar = await get("studio-arcade"); check(r.status === 200 && ar.games.some((g) => g.id === id && g.title === "Neon Rush 2"), "published: on the Creator Arcade");
// plays: checked against the level; counted once in 20 s; the best kept
const L = G.genLevel(db.get(`worldStudio/${id}`).spec);
r = await call(fan, "world-studio-play", { id, coins: 9999, dist: 1e9, done: true }); check(r.status === 200 && r.body.score === G.scoreOf(L.coins, L.len, true) && r.body.plays === 1, "a run can't beat the level: " + r.body.score);
r = await call(fan, "world-studio-play", { id, coins: 1, dist: 20 }); check(r.body.plays === 1 && r.body.best === G.scoreOf(L.coins, L.len, true), "the same player again within 20 s: not counted twice, the best kept");
T += 30e3; r = await call(fan, "world-studio-play", { id, coins: 1, dist: 20 }); check(r.body.plays === 2, "later: counted");
r = await call(me, "world-studio-play", { id, coins: 2, dist: 50 }); check(r.status === 200 && r.body.plays === 2, "the maker's own runs aren't counted as plays");
let gm = await get("studio-game&id=" + id); check(gm.ok && gm.game.best.length === 2 && gm.game.spec.seed === 7, "the game's page: its spec and the best runs");
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
check([...db.keys()].every((k) => /^[^/]+\/[^/]+$/.test(k)), "every document is collection/id (Firestore refuses a bare name: the arcade once was one)");
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
