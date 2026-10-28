// obby.test.mjs — OBBY WORLD (2026-10-28): the 3D course's data (world-studio-gen.js OB / cleanObby / obReach / genObby /
// the logic script / the director's rules / the test players' pace report) and its server side (api/_world-studiox.mjs:
// the director, Meshy assets with their day caps, the remix tree; a run scored against the course). On an in-memory store.
// Run: node tests/world/obby.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const G = await import("../../api/_world-studio-gen.mjs");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { ASSET } = await import("../../api/_world-studiox.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const { OB, clampSpec, cleanObby, obReach, genLevel, genObbyBuild, estimate, obParse, obScript, obTweak, obWants, scoreOf } = G;

// ---- the data ----
const junk = cleanObby({ o: [["b", 999, 999, -999, 1000, 99, 0, -4, 77, 9, 9, 99], ["zz", 0, 0, 0], ["o", 1, 1, 1, 0, 50, 50, 50], "x", ["S", 1, 2, 3], ["S", 9, 9, 9], ["d", 0, 0, 0, 0, 3, 4, 0.5, 0, 42, 7, 0]], lg: [["coins", 10, "open", 99, 0], ["nope", 1, "win", 0], ["every", 0, "toggle", 1, 0], ["start", 0, "rm -rf", 0]], lk: "evil", ui: 9999, as: ["ok123456", "../../x", "<script>"] });
check(junk.o.length === 4 && junk.o[0][1] === OB.R && junk.o[0][2] === OB.Y && junk.o[0][3] === -OB.R && junk.o[0][5] === OB.SZ, "positions and sizes held inside the map");
check(junk.o.filter((q) => q[0] === "S").length === 1 && junk.o.find((q) => q[0] === "o")[5] === 1, "one start; a coin keeps its own size");
check(junk.o.find((q) => q[0] === "d")[9] === 8 && junk.lg.length === 2 && junk.lg[0][3] === 8 && junk.lg[1][1] === 2 && junk.lg[1][4] === 1, "options and rules clamped, unknown ones dropped, 'every' always repeats");
check(junk.lk === "day" && junk.ui === 255 && junk.as.length === 1, "an unknown look falls back, bits clamped, only clean asset ids kept");
check(cleanObby({}).o[0][0] === "S", "an empty course still has a start");
const caps = cleanObby({ o: Array.from({ length: 10 }, (_, i) => ["B", i, 0, 0]) }); check(caps.o.filter((q) => q[0] === "B").length === OB.CAP.B, "a kind's cap holds (two bosses)");
const many = cleanObby({ o: Array.from({ length: 900 }, (_, i) => ["b", i % 80, 0, 0]) }); check(many.o.length === OB.MAX, "a course holds at most " + OB.MAX + " pieces");

// reach: a gap too wide, a pad that lifts, a teleporter pair, a baseplate
const course = (o, extra = {}) => cleanObby({ o: [["S", 0, 0, 0], ["b", 0, -1, 0, 0, 4, 1, 4], ...o], ...extra });
check(obReach(course([["b", 0, -1, 8, 0, 4, 1, 4], ["g", 0, 0, 8]])).ok, "a short hop to the goal is reachable");
check(!obReach(course([["b", 0, -1, 30, 0, 4, 1, 4], ["g", 0, 0, 30]])).ok, "a 26 m gap is not");
check(!obReach(course([["b", 0, 7, 6, 0, 4, 1, 4], ["g", 0, 8, 6]])).ok && obReach(course([["p", 0, 0, 1], ["b", 0, 7, 6, 0, 4, 1, 4], ["g", 0, 8, 6]])).ok, "a ledge 8 m up needs a jump pad");
check(obReach(course([["t", 1, 0, 1, 0, 2, 0.2, 2, 0, 3], ["b", 60, -1, 60, 0, 4, 1, 4], ["t", 60, 0, 60, 0, 2, 0.2, 2, 0, 3], ["g", 61, 0, 61]])).ok, "a teleporter pair carries you across the map");
check(obReach(course([["g", 40, 0, 40]], { bp: 1 })).ok, "on a baseplate everything on the ground is reachable");
check(obReach(course([["b", 0, -1, 30, 0, 4, 1, 4], ["g", 0, 0, 30]])).far.length >= 1, "the pieces out of reach are listed (the editor marks them red)");

// the quick-start courses: every size and seed is finishable and inside the map
let allOk = true, inMap = true; for (const len of G.LENS) for (const seed of [1, 7, 42, 999]) for (const walls of [0, 5]) { const sp = clampSpec({ tpl: "obby", len, seed, walls, gaps: 3, lasers: 3, speed: 3 }), L = genLevel(sp); if (!L.R.ok) allOk = false; if (L.B.o.some((q) => Math.abs(q[1]) > OB.R || Math.abs(q[3]) > OB.R)) inMap = false; }
check(allOk && inMap, "every quick-start course can be finished and stays inside the map");
const W = genObbyBuild(clampSpec({ tpl: "obby", seed: 5, len: 60 }), { boss: 1, shop: 1, doors: 1, elevator: 1, timer: 120, look: "night" });
check(["B", "n", "d", "u", "e"].every((k) => W.o.some((q) => q[0] === k)) && W.lk === "night" && W.tl === 120 && W.ui & OB.UI.boss, "the director's wishes: a boss, a shop, a door + button, an elevator, a timer, a look");
check(obReach(W, { speed: 3 }).ok, "and that course is still finishable");
const L1 = genLevel(clampSpec({ tpl: "obby", seed: 5, len: 60, build: W }));
check(L1.coins >= W.o.filter((q) => q[0] === "o").length + W.o.find((q) => q[0] === "B")[9] * 5 && L1.len === (L1.cps.length + 1) * 100, "a run's ceiling counts coins, the boss's hits, checkpoints");
check(scoreOf(L1.coins + 999, L1.len + 999, true) > scoreOf(L1.coins, L1.len, true), "(the server clamps a claimed run to that ceiling)");

// the test players: harder settings clear less; a long empty stretch is reported dull; an easy flat one too easy
const easy = estimate(clampSpec({ tpl: "obby", seed: 3, len: 60, speed: 1, walls: 0, gaps: 0, lasers: 0 })), hard = estimate(clampSpec({ tpl: "obby", seed: 3, len: 60, speed: 5, walls: 5, gaps: 3, lasers: 3 }));
check(easy.clear > hard.clear && hard.stars > easy.stars, "harder knobs, fewer clears (" + easy.clear + " → " + hard.clear + ")");
const flat = course([...Array.from({ length: 12 }, (_, i) => ["b", 0, -1, 6 + i * 6, 0, 4, 1, 4]), ["g", 0, 0, 72]]), fe = estimate(clampSpec({ tpl: "obby", seed: 1, build: flat }));
check(fe.easy && fe.dull.length >= 3, "a flat row of platforms: too easy, dull stretches found");
check(Array.isArray(estimate(clampSpec({ tpl: "runner", seed: 2 })).dull), "the other templates get the pace report too");
check(estimate(clampSpec({ tpl: "obby", seed: 1, build: course([["b", 0, -1, 40, 0, 4, 1, 4], ["g", 0, 0, 40]]) })).why === "reach", "a goal out of reach: every bot stops, the reason is 'reach'");

// the logic as a script: it reads into the same cleaned rules, and back
const sc = "when coins 10 then open 2\nwhen every 5 then toggle 1\nwhen A >= 3 then phase 2 again\n// a note\nwhen boss half then say 6\nwhen start then A = 0\nwhen button 1 then A += 1 again\nwhen nonsense then fetch('x')";
const P = obParse(sc); check(P.lg.length === 6 && P.errs.length === 1 && P.errs[0] === 8, "the script: six rules read, the bad line reported");
check(JSON.stringify(obParse(obScript(P.lg)).lg) === JSON.stringify(P.lg), "the script round-trips");
check(obParse(Array.from({ length: 40 }, () => "when start then win").join("\n")).lg.length === OB.LG, "at most " + OB.LG + " rules");

// the director's second step: changes from words
const base = clampSpec({ tpl: "obby", seed: 9, len: 45 }), tw = obTweak(base, "add a boss and more coins, harder ending, night look");
check(tw.did.includes("boss") && tw.did.includes("coins") && tw.did.includes("harder") && tw.did.includes("look") && tw.build.lk === "night" && tw.build.o.some((q) => q[0] === "B"), "a tweak adds a boss, coins, a harder end and a look");
check(obReach(tw.build).ok, "the tweaked course can still be finished");
check(obWants("보스와 상점이 있는 용암 탑, 밤").boss && obWants("보스와 상점이 있는 용암 탑, 밤").shop && obWants("용암").theme === "lava", "the director reads Korean too");

// ---- the server ----
const db = new Map();
const store = { getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])), setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); }, commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.set) db.set(x.set, x.data); } return { ok: true }; } };
const json = (status, b, cache) => ({ status, body: b, cache });
let T = Date.parse("2026-10-28T03:00:00Z"); const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
let n = 0; const randomId = () => (0x1000000 + ++n * 7919).toString(16) + "abcdef";
let aiReply = '{"boss": true, "shop": true, "look": "space", "secs": 5, "title": "Star Tower"}', meshyCalls = [], meshyState = "IN_PROGRESS";
const meshy = async (m, u, b) => { meshyCalls.push([m, u, b]); if (m === "POST") return { ok: true, j: { result: "task" + meshyCalls.length } }; return { ok: true, j: { status: meshyState, progress: 50, model_urls: { glb: "https://assets.meshy.ai/x.glb" } } }; };
const W0 = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId, random: () => 0.5, ai: async () => aiReply, meshy, raw: (status, body, headers) => ({ status, body, headers, raw: true }), fetchBytes: async () => new Uint8Array([1, 2, 3]).buffer, tokenBalance: async () => "0", receipt: async () => null });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W0.handle({ action, ...(await sign(w)), ...extra });
const get = async (q) => (await W0.read(new URL("https://x/api/social?world=" + q)));
const me = ethers.Wallet.createRandom(), you = ethers.Wallet.createRandom(), them = ethers.Wallet.createRandom(); const lc = (w) => w.address.toLowerCase();

// the director on the server: the model's wishes become a course; a change from words
const d1 = await call(me, "world-studio-obby-ai", { t: "a space tower with a boss and a shop", spec: { tpl: "obby", seed: 2 } });
check(d1.status === 200 && d1.body.by === "agent" && d1.body.build.lk === "space" && d1.body.build.o.some((q) => q[0] === "B") && d1.body.build.o.some((q) => q[0] === "n"), "the director: the model's wishes made into a course");
aiReply = '{"do": ["add checkpoints", "night look"]}';
const d2 = await call(me, "world-studio-obby-ai", { t: "make it night and add checkpoints", spec: { tpl: "obby", seed: 2 }, build: d1.body.build });
check(d2.body.build.lk === "night" && d2.body.did.includes("look"), "the director: a change from words on the course you have");
aiReply = "not json"; const d3 = await call(me, "world-studio-obby-ai", { t: "a lava course with doors", spec: { tpl: "obby", seed: 2 } });
check(d3.body.by === "rules" && d3.body.build.o.some((q) => q[0] === "d"), "a reply that isn't JSON: the rules read the words");

// a published obby, played and scored against the course
const sv = await call(me, "world-studio-save", { spec: { tpl: "obby", title: "Sky Steps", seed: 4, build: d1.body.build } }), gid = sv.body.game.id;
await call(me, "world-studio-publish", { id: gid, on: true });
const Lg = genLevel(clampSpec(db.get(`worldStudio/${gid}`).spec));
const pl = await call(you, "world-studio-play", { id: gid, coins: 99999, dist: 99999, done: true });
check(pl.body.score === scoreOf(Lg.coins, Lg.len, true), "a run is held to the course's ceiling");
check(db.get(`worldStudio/${gid}`).spec.build.ob === 1, "the course is saved whole (cleaned)");

// the remix tree: a remix of a remix keeps the root; plays reach the original's count; its maker hears of it
T += 30e3; const r1 = await call(you, "world-studio-save", { spec: { tpl: "obby", title: "Sky Steps+", seed: 4, build: d1.body.build }, from: gid }), kid = r1.body.game.id;
await call(you, "world-studio-publish", { id: kid, on: true });
T += 30e3; const r2 = await call(them, "world-studio-save", { spec: { tpl: "obby", title: "Sky Steps++", seed: 4 }, from: kid }), grand = r2.body.game.id;
await call(them, "world-studio-publish", { id: grand, on: true });
check(db.get(`worldStudio/${grand}`).root.id === gid && db.get(`worldStudio/${grand}`).rootW === lc(me), "a remix of a remix keeps the original as its root");
T += 30e3; await call(me, "world-studio-play", { id: grand, coins: 1, dist: 10, done: false });
const tr0 = (await get("studio-remixes&id=" + gid)).body, tr1 = (await get("studio-remixes&id=" + grand)).body;
check(tr0.kids.length === 1 && tr0.kids[0].id === kid && tr0.rx === 1, "the original lists its remix and counts the play through the chain");
check(tr1.chain.length === 2 && tr1.chain[0].id === kid && tr1.chain[1].id === gid, "the grandchild's chain goes back to the original");
check((db.get(`worldStudioOrigin/${lc(me)}`) || {}).plays === 1, "the original maker's all-time remix plays (for a future share of earnings)");
const inbox = (await get("hub-inbox&wallet=" + lc(me))).body; check(inbox.items.some((x) => x.kind === "remix" && x.id === kid), "the original's maker hears about the remix");

// Meshy assets: made on the server with a triangle budget, a day cap, polled from shape to paint to ready
const a1 = await call(me, "world-studio-asset-make", { t: "a glowing crystal tree" });
check(a1.status === 200 && meshyCalls[0][2].target_polycount === ASSET.POLYS && meshyCalls[0][2].should_remesh, "an asset is asked for at the phone's triangle budget");
const aid = a1.body.asset.id; let pa = await call(me, "world-studio-asset-poll", { id: aid }); check(!pa.body.asset.ready, "still being made");
meshyState = "SUCCEEDED"; pa = await call(me, "world-studio-asset-poll", { id: aid }); check(!pa.body.asset.ready && db.get(`worldStudioAsset/${aid}`).st === "paint", "the shape done: its paint starts");
pa = await call(me, "world-studio-asset-poll", { id: aid }); check(pa.body.asset.ready, "painted: ready");
check((await call(you, "world-studio-asset-poll", { id: aid })).status === 404, "someone else can't touch it");
const glb = await get("studio-asset-glb&id=" + aid); check(glb.status === 200 && glb.raw && glb.headers["content-type"] === "model/gltf-binary", "its model is served through our own address");
await call(me, "world-studio-asset-make", { t: "a red mushroom house" }); const a3 = await call(me, "world-studio-asset-make", { t: "a third one today" });
check(a3.status === 429, ASSET.DAY + " a day");
const lst = (await get("studio-assets&wallet=" + lc(me))).body; check(lst.assets.length === 2 && lst.open, "the maker's list");

check([...db.keys()].every((k) => /^[^/]+\/[^/]+$/.test(k)), "every document is collection/id");
console.log(`\n${ok} pass ${bad} fail`); process.exit(bad ? 1 : 0);
