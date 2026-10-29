// obby.test.mjs — OBBY WORLD (2026-10-28): the 3D course's data (world-studio-gen.js OB / cleanObby / obReach / genObby /
// the logic script / the director's rules / the test players' pace report) and its server side (api/_world-studiox.mjs:
// the director, Meshy assets with their day caps, the remix tree; a run scored against the course). On an in-memory store.
// Run: node tests/world/obby.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const G = await import("../../api/_world-studio-gen.mjs");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { ASSET, CREDIT, PREFAB } = await import("../../api/_world-studiox.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const { OB, clampSpec, cleanObby, obReach, genLevel, genObbyBuild, estimate, obParse, obScript, obTweak, obWants, scoreOf, packPrefab, placePrefab, cleanPrefab, PF } = G;

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

// ---- G1/G3 (2026-10-28): every genre on the same engine — modes, wins, terrain, tracks, the hierarchy ----
for (const md of ["combat", "race", "explore"]) { const sp = clampSpec({ tpl: "obby", seed: 77, len: 60 }), b = genObbyBuild(sp, { md }), S2 = clampSpec({ ...sp, build: b }), Rr = obReach(b, S2), Lm = genLevel(S2);
  check(b.md === md && b.win === { combat: "enemies", race: "race", explore: "collect" }[md] && Rr.ok && estimate(S2).clear > 0, `a quick-start ${md} game: its own win, every target reachable, the bots can win it`);
  if (md === "combat") check(Lm.coins === b.o.filter((q) => q[0] === "o").length + b.o.filter((q) => q[0] === "E").length * OB.EC, "the run's ceiling counts the coins enemies drop");
  if (md === "explore") check(b.bp === 1 && b.o.some((q) => q[0] === "H") && b.o.some((q) => q[0] === "W"), "an explore world: a baseplate, hills, water"); }
check(obWants("a monster fight arena").md === "combat" && obWants("링 레이스").md === "race" && obWants("보석 찾는 탐험").md === "explore", "the director reads the genre (and in Korean)");
const ringOut = cleanObby({ o: [["S", 0, 0, 0], ["b", 0, -1, 0, 0, 4, 1, 4], ["R", 0, 0, 40, 0, 5, 5, 0.4, 0, 1]], win: "race" });
check(!obReach(ringOut).ok && obReach(cleanObby({ ...ringOut, o: [...ringOut.o, ["b", 0, -1, 6, 0, 4, 1, 4], ["b", 0, -1, 12, 0, 4, 1, 4], ["b", 0, -1, 18, 0, 4, 1, 4], ["b", 0, -1, 24, 0, 4, 1, 4], ["b", 0, -1, 30, 0, 4, 1, 4], ["b", 0, -1, 36, 0, 4, 1, 4]] })).ok, "a race ring out of reach fails the check; a path to it passes");
check(obReach(cleanObby({ o: [["S", 0, 0, 0], ["H", 8, 0, 0, 0, 12, 6], ["Q", 8, 6.4, 0]], win: "collect", bp: 1 })).ok, "a gem on a hill's top: walked up from its foot");
check(!obReach(cleanObby({ o: [["S", 0, 0, 0], ["b", 0, -1, 0, 0, 4, 1, 4], ["b", 0, 3, 8, 0, 4, 1, 4], ["g", 0, 4, 8]] })).ok && obReach(cleanObby({ o: [["S", 0, 0, 0], ["b", 0, -1, 0, 0, 4, 1, 4], ["b", 0, 3, 8, 0, 4, 1, 4], ["g", 0, 4, 8]], gv: 40 })).ok, "low gravity: a ledge out of reach becomes reachable");
const X = cleanObby({ o: [["S", 0, 0, 0], ["b", 0, -1, 0]], gn: [[1, "Castle", 2], [2, "Keep", 1], [3, "Gate", 1]], tk: [[1, 1, 1, [[0, 0, 0, 0, 0], [2, 0, 3, 0, 90], [4, 0, 0, 0, 0]]], [5, 0, 0, [[0, 0, 0, 0, 0], [1, 1, 1, 1, 0]]]], cs: [[0, 0, 20, 30, 0, 0, 0], [3, 30, 10, 0, 0, 0, 0]], md: "nope", gv: 999, sv: 1 });
check(X.gn.length === 3 && X.gn.every((g) => g[0] !== g[2]) && X.gn.filter((g) => g[2]).length < 3, "the hierarchy: named groups with parents, no loops");
check(X.tk.length === 1 && X.tk[0][3].length === 3 && X.cs.length === 2 && X.md === "obby" && X.gv === 200 && X.sv === 1, "a track on a real piece, a cutscene's camera keys, clamped mode / gravity / saves");
const sc2 = obParse("when enemies down then cutscene\nwhen ring 3 then track 2\nwhen collect 5 then win"); check(!sc2.errs.length && sc2.lg.length === 3 && obScript(sc2.lg).includes("enemies down"), "the script knows the new events and actions");
// G2 prefabs: a boss bundle packed with its rules, placed twice into another game with fresh channels, groups and tracks
const host = cleanObby({ o: [["S", 0, 0, 0], ["y", 20, -1, 0, 0, 16, 1, 16], ["B", 20, 0, 0, 0, 3, 3, 3, 11, 12, 1], ["u", 14, 0, 4, 0, 1.6, 0.3, 1.6, 0, 2], ["d", 26, 0, 0, 0, 4, 4, 0.5, 4, 2], ["m", 30, 0, 0, 0, 3.5, 0.6, 3.5, 2]],
  lg: [["bosshalf", 0, "say", 6, 0], ["boss", 0, "open", 2, 0], ["button", 2, "say", 1, 0], ["start", 0, "track", 1, 0], ["every", 5, "say", 2, 1]], tk: [[5, 1, 1, [[0, 0, 0, 0, 0], [2, 0, 2, 0, 0]]]] });
const PB = packPrefab(host, [1, 2, 3, 4, 5], "Dragon gate", "boss");
check(PB && PB.k === "boss" && PB.o.length === 5 && PB.meta.hp === 12 && PB.meta.atk === 1 && PB.meta.reward === 60 && PB.lg.length === 4 && PB.tk.length === 1, "a boss prefab keeps its health, attack, reward, its rules and its track (not the course's other rules)");
const tgt = cleanObby({ o: [["S", 0, 0, 0], ["d", 5, 0, 5, 0, 4, 4, 0.5, 4, 2], ["b", 9, -1, 9, 0, 3, 3, 3, 0, 0, 0, 1]], gn: [[1, "Start area", 0]], tk: [[2, 0, 1, [[0, 0, 0, 0, 0], [1, 0, 1, 0, 0]]]] });
const p1 = placePrefab(tgt, PB, [-30, 0, 20], 90, "pabcdef1"), p2 = placePrefab(p1.B, PB, [30, 0, -20], 0, "pabcdef1");
const ch1 = p1.B.o.filter((q) => q[0] === "d" && q[11] === p1.g)[0][9], ch2 = p2.B.o.filter((q) => q[0] === "d" && q[11] === p2.g)[0][9];
check(p1.ok && p2.ok && p1.g !== p2.g && p1.g !== 1 && ch1 !== 2 && ch2 !== ch1, "placed twice: each copy gets its own group and channel (the host's channel 2 untouched)");
check(p2.B.gn.filter((g) => g[1] === "Dragon gate").length === 2 && p2.B.pi.length === 2 && p2.B.tk.length === 3 && p2.B.lg.some((r) => r[2] === "track" && r[3] === 2), "each copy shows in the hierarchy, remembers its prefab, brings its track and the rule that starts it");
check(!placePrefab(cleanObby({ o: Array.from({ length: 299 }, (_, i) => ["b", i % 80, -1, Math.floor(i / 80) * 5]) }), PB).ok, "a full course refuses a prefab");
check(cleanPrefab({ n: "x", o: [["b", 0, 0, 0]] }) === null && cleanPrefab({ n: "Ok", o: [] }) === null, "a prefab needs a name and a piece");

// ---- the server ----
const db = new Map();
const store = { getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])), setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); }, commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.set) db.set(x.set, x.data); else if (x.inc) { const d = { ...(db.get(x.inc) || {}) }; for (const [f, v] of Object.entries(x.fields)) d[f] = (d[f] || 0) + v; db.set(x.inc, d); } } return { ok: true }; } };
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
check(a3.status === 402 && a3.body.credit === CREDIT.ASSET, ASSET.DAY + " free a day — then an offer of a paid credit");
const a4 = await call(me, "world-studio-asset-make", { t: "a third one today", pay: 1 }); check(a4.status === 402 && /not enough/.test(a4.body.error), "a paid credit needs the ARCL");
db.set(`worldArclBal/${lc(me)}`, { bal: 100000 }); const mc = meshyCalls.length, a5 = await call(me, "world-studio-asset-make", { t: "a third one today", pay: 1 });
check(a5.status === 200 && meshyCalls.length === mc + 1 && db.get(`worldArclBal/${lc(me)}`).bal === 100000 - CREDIT.ASSET && db.get("worldArclBal/platform").bal >= CREDIT.ASSET, "paid: Meshy makes it, the ARCL goes to the platform");
aiReply = '{"boss": false}'; for (let i = 0; i < 9; i++) await call(me, "world-studio-obby-ai", { t: "a tower " + i, spec: { tpl: "obby", seed: 2 } });
const dOver = await call(me, "world-studio-obby-ai", { t: "one more", spec: { tpl: "obby", seed: 2 } }); check(dOver.body.over && dOver.body.credit === CREDIT.DIRECTOR && dOver.body.by === "rules", "the director past the free ones: the rules, and an offer");
T += 3000; aiReply = '{"boss": true}'; const dPaid = await call(me, "world-studio-obby-ai", { t: "one more", spec: { tpl: "obby", seed: 2 }, pay: 1 }); check(dPaid.body.by === "agent" && !dPaid.body.over, "paid: the agent's model again");

// G2/G4 prefabs: free (installed, the author credited and told), paid (80/20 through the market), licences
const hostB = clampSpec({ tpl: "obby", seed: 5, build: host }), Pk = packPrefab(host, [1, 2, 3, 4, 5], "Dragon gate", "boss");
const ps1 = await call(me, "world-studio-prefab-save", { name: "Dragon gate", k: "boss", lic: "remix", price: 0, pf: Pk }), pf1 = ps1.body.prefab.id;
check(ps1.status === 200 && ps1.body.prefab.meta.hp === 12 && ps1.body.prefab.lic === "remix", "a prefab saved with its licence and facts");
const ps2 = await call(me, "world-studio-prefab-save", { name: "Royal boss", k: "boss", lic: "personal", price: 500, pf: Pk }), pf2 = ps2.body.prefab.id;
const plist = (await get("studio-prefabs&k=boss&wallet=" + lc(you))).body; check(plist.items.length === 2 && plist.items.every((c) => !c.pf) && plist.owned.length === 0, "the market lists cards without their pieces");
const g1 = await call(you, "world-studio-prefab-get", { id: pf1 }); check(g1.status === 200 && g1.body.prefab.pf.o.length === 5 && db.get(`worldStudioPrefab/${pf1}`).uses === 1, "a free prefab: installed, counted");
await call(you, "world-studio-prefab-get", { id: pf1 }); check(db.get(`worldStudioPrefab/${pf1}`).uses === 1, "counted once a wallet");
check((await get("hub-inbox&wallet=" + lc(me))).body.items.some((x) => x.kind === "pfuse"), "its author hears of it");
check((await call(you, "world-studio-prefab-get", { id: pf2 })).status === 402, "a paid one: not before it's bought");
check((await call(you, "world-studio-prefab-buy", { id: pf2, expectedPrice: 500 })).status === 402, "buying needs the ARCL");
db.set(`worldArclBal/${lc(you)}`, { bal: 2000 }); db.set(`worldArclBkt/${lc(you)}`, { purchased: 2000 });
const bz = await call(you, "world-studio-prefab-buy", { id: pf2, expectedPrice: 500 }); const sale = db.get(`worldMktSale/pf${pf2}_${lc(you)}`);
check(bz.status === 200 && bz.body.prefab.pf && bz.body.bal === 1500 && sale && sale.elig === 400 && sale.platform === 100 && sale.status === "pending", "bought: 80 % to its maker (pending 14 days, from purchased ARCL so settleable), 20 % to the platform");
check((await get("studio-prefabs&wallet=" + lc(you))).body.owned.includes(pf2) && (await call(you, "world-studio-prefab-get", { id: pf2 })).status === 200, "owned from then on");
check((await call(you, "world-studio-prefab-save", { name: "My royal boss", lic: "cc-by", pf: Pk, from: pf2 })).status === 403, "a personal licence can't be shared again");
const rs = await call(you, "world-studio-prefab-save", { name: "Dragon gate II", lic: "remix", price: 1000, pf: Pk, from: pf1 }), pf3 = rs.body.prefab.id;
check(rs.status === 200 && db.get(`worldStudioPrefab/${pf3}`).origW === lc(me), "a remix of a remix-licensed prefab keeps its original maker");
db.set(`worldArclBal/${lc(them)}`, { bal: 5000 }); db.set(`worldArclBkt/${lc(them)}`, { purchased: 5000 });
T += 3000; await call(them, "world-studio-prefab-buy", { id: pf3, expectedPrice: 1000 }); const s3 = db.get(`worldMktSale/pf${pf3}_${lc(them)}`), s3o = db.get(`worldMktSale/pf${pf3}_${lc(them)}_o`);
check(s3 && s3o && s3o.creator === lc(me) && s3.elig + s3o.elig === 800 && s3o.elig === 200, "a remix's sale: the original maker gets their share of the creator's 80 %");
// RV: the cards carry a picture's worth of pieces; this week's popular prefabs and the creators' board; the maker's waiting sales
check(plist.items.every((c) => Array.isArray(c.th) && c.th.length === 5 && c.th[0].length === 8), "a card carries its pieces in short for its picture");
const top = (await get("studio-prefab-top")).body; check(top.ok && top.week.length >= 2 && top.week[0].wk >= top.week[1].wk && top.creators[0].byW && top.creators.some((x) => x.sold >= 1), "this week's popular prefabs (a sale counts ×3) and the creators' board");
const mme = (await get("market-me&wallet=" + lc(me))).body; check(mme.sales && mme.sales.some((x) => x.price === 500 && x.elig === 400 && x.matureAt > x.at), "the maker sees each sale still waiting its 14 days");
// premium templates: a remix fee in ARCL; a personal game can't be remixed
await call(me, "world-studio-game-lic", { id: gid, lic: "remix", fee: 300 });
check((await call(them, "world-studio-save", { spec: { tpl: "obby", seed: 4 }, from: gid })).status === 402, "a premium template: remixing it waits for its fee");
check(!(await get(`studio-remix-ok&id=${gid}&wallet=${lc(them)}`)).body.ok, "…and says so");
T += 3000; const rb = await call(them, "world-studio-remix-buy", { id: gid, expectedPrice: 300 }); check(rb.status === 200 && db.get(`worldMktSale/rx${gid}_${lc(them)}`).platform === 60, "the fee paid: the same 80/20");
check((await call(them, "world-studio-save", { spec: { tpl: "obby", seed: 4 }, from: gid })).status === 200, "then the remix saves");
await call(me, "world-studio-game-lic", { id: gid, lic: "personal" }); check((await call(you, "world-studio-save", { spec: { tpl: "obby", seed: 4 }, from: gid })).status === 403, "a personal game can't be remixed");
// saves: a player's progress kept for a course
await call(you, "world-studio-prog", { id: gid, d: { cp: 7, n: 2, c: 99999999, q: [1, 2], dj: 1, sk: 9 } }); const pg = (await get(`studio-prog&id=${gid}&wallet=${lc(you)}`)).body.d;
check(pg && pg.n === 2 && pg.c === 99999 && pg.sk === 1.25 && pg.q.length === 2, "progress saved (clamped)");
await call(you, "world-studio-prog", { id: gid, clear: 1 }); check((await get(`studio-prog&id=${gid}&wallet=${lc(you)}`)).body.d === null, "and cleared on a win");
const lst = (await get("studio-assets&wallet=" + lc(me))).body; check(lst.assets.length === 3 && lst.open, "the maker's list (the paid one too)");

check([...db.keys()].every((k) => /^[^/]+\/[^/]+$/.test(k)), "every document is collection/id");

// ---- ED1–ED3 (2026-10-29): entities + components, the converter, conditions, the developer's script ----
{ const { CMP, entsOf, entsToOb, compOf, edParse, condParse, OBN } = G;
  const base = genObbyBuild(clampSpec({ tpl: "obby", seed: 7 })), old = cleanObby(base);
  check(JSON.stringify(entsToOb(entsOf(old), old).o) === JSON.stringify(old.o), "an existing course → entities → back is the same course");
  const ents = entsOf(old); check(ents.some((e) => e.c.kind === "S") && ents.every((e) => e.c.visible === 1 && Array.isArray(e.t) && e.t.length === 9) && entsOf({ o: [["k", 0, 0, 0, 0, 4, 0.4, 4, 0, 0, 0, 0]] })[0].c.damage === 1, "each kind shows its preset components (lava: Damage)");
  const B = cleanObby({ ob: 1, o: [["S", 0, 0, 0, 0, 3, 0.3, 3, 1, 0, 0, 0], ["b", 4, 0, 0, 0, 4, 1, 4, 0, 0, 0, 0, { n: "Platform 01", mv: [0, 50, 9], sp: [2, 1], dm: [9], hl: [4], lt: [3, 2], junk: 1 }],
    ["b", 8, 0, 0, 0, 4, 1, 4, 0, 0, 0, 0, { sc: "onTouch(player) { this.hp -= 2; coins += 5 }", sw: [5, 3, 1] }], ["o", 0, 1, 4, 0, 1, 1, 1, 0, 0, 0, 0, { nc: 1 }], ["b", 0, 0, 9, 0, 4, 1, 4, 0, 0, 0, 0, { pk: [0, 7] }]] });
  const x1 = B.o[1][12], x2 = B.o[2][12];
  check(x1.n === "Platform 01" && x1.mv[1] === 20 && x1.mv[2] === 5 && x1.dm[0] === 3 && !("junk" in x1) && x1.id >= 1, "components are clamped, unknown keys dropped, a piece with Health gets a tag");
  check(x2.id && x2.id !== x1.id && !B.o[3][12], "tags stay unique; 'no collision' only on a solid piece");
  const R = compOf(B), pool = R.o.filter((q) => q[12] && q[12].po === x2.id);
  check(pool.length === 3 && pool.every((q) => q[0] === "E" && q[10] === 1), "a spawner's enemies wait hidden beside it");
  check(R.lg.some((r) => r[0] === "touch" && r[1] === x2.id && r[2] === "dmg" && r[3] === x2.id && r[6] === 2) && R.lg.some((r) => r[0] === "touch" && r[2] === "coins" && r[3] === 5), "the piece's script becomes rules tagged to it");
  const L = genLevel(clampSpec({ tpl: "obby", build: B })), L0 = genLevel(clampSpec({ tpl: "obby", build: { ...B, o: B.o.map((q) => q.slice(0, 12)) } }));
  check(L.coins >= L0.coins + 7 && L.R.T && !L.B.o.some((q, i) => q[12] && q[12].po && L.R.far.includes(i)), "the server's coin bound counts pickups and script coins; pooled enemies aren't 'out of reach'");
  const P = edParse('onStart() { A = 0; say("Nice work!") }\nevery(4) { toggle(2) }\nonTouch(p) {\n  if (A >= 3) win()\n  blah()\n}\nonCoins() { win() }\nstray', 4);
  check(P.lg.length === 4 && P.lg[2][0] === "every" && P.lg[2][4] === 1 && P.lg[3][0] === "touch" && P.lg[3][1] === 4 && JSON.stringify(P.lg[3][5]) === "[0,0,3]", "the script reads handlers, an if, and 'every' repeats");
  check(P.errs.length === 3 && P.errs.some((e) => e.line === 5) && P.errs.some((e) => /needs a number/.test(e.msg)) && P.errs.some((e) => /outside/.test(e.msg) && e.line === 8), "bad lines are named with their line numbers");
  check(edParse("say(\"hello there\")").errs.length === 1 && edParse("onStart() { fetch('x') }").errs.length === 1 && edParse("onStart() { eval(1) }").lg.length === 0, "nothing outside the allowed statements is read (never run as code)");
  check(JSON.stringify(condParse("coins < 10")) === "[2,1,10]" && condParse("x > 1") === null, "conditions read");
  const sc = obParse("when touch 3 then dmg 3 2\nwhen start then open 1 if A >= 2 again\nwhen broken 3 then lose"); check(!sc.errs.length && sc.lg.length === 3 && sc.lg[0][6] === 2 && JSON.stringify(sc.lg[1][5]) === "[0,0,2]" && sc.lg[1][4] === 1, "the one-line script knows touch / broken / dmg / lose and 'if'");
  check(JSON.stringify(obParse(obScript(sc.lg)).lg) === JSON.stringify(sc.lg), "and round-trips them");
  check(Object.keys(CMP).length === 10 && OBN.b === "Block", "ten components");
  const many = cleanObby({ ob: 1, o: Array.from({ length: 9 }, (_, i) => ["b", i * 5, 0, 0, 0, 4, 1, 4, 0, 0, 0, 0, { lt: [1, 2], sw: [5, 2, 0] }]) });
  check(many.o.filter((q) => q[12] && q[12].lt).length === 6 && many.o.filter((q) => q[12] && q[12].sw).length === 6, "at most 6 lights and 6 spawners a course"); }
console.log("");
console.log(`\n${ok} pass ${bad} fail`); process.exit(bad ? 1 : 0);
