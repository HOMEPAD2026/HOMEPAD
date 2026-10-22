import fs from "node:fs";
// jur.test.mjs — Jurassic World survival (api/_world-jur.mjs): GM only, swings no faster than real ones, the drop in the
// pack and ore in the mine's pockets, regrowth, making tools and stations (they stand at your camp), cooking and eating.
// On an in-memory store. Run: node tests/world/mine.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { MINE, rockValue, rockType, rockHits, oddsFor, isWeekend, sessionOf, modOf } = await import("../../api/_world-mine.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, n] of Object.entries(x.fields)) d[k] = (d[k] || 0) + n; db.set(x.inc, d); } } return { ok: true }; },
};
const json = (status, b, cache) => ({ status, body: b, cache });
let T = Date.parse("2026-10-16T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
let n = 0; const randomId = () => (0x1000000 + ++n * 7919).toString(16).padStart(8, "0") + "deadbeefcafe0000";
let seed = 12345; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const { JUR } = await import("../../api/_world-jur.mjs");
const { GM_WALLETS } = await import("../../api/_world-village.mjs");
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId, random, tokenBalance: async () => "0" });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const view = async (w) => (await W.read(new URL("https://x/api/social?world=jur&wallet=" + w.address.toLowerCase()))).body;
// a node broken: the first swing, then its swings' worth of time
const fell = async (w, node, kind) => { const s = await call(w, "world-jur-start", { node, kind }); if (s.status !== 200) return s; T += s.body.need * JUR.HIT_MS; return call(w, "world-jur-break", { node }); };

const gm = ethers.Wallet.createRandom(), other = ethers.Wallet.createRandom(); GM_WALLETS.push(gm.address.toLowerCase());
let r = await W.handle({ action: "world-jur-start", node: "tree-broadleaf0:1", kind: "tree" }); check(r.status >= 400 && r.status < 500, "no signature: nothing to gather");
r = await call(other, "world-jur-start", { node: "tree-broadleaf0:5", kind: "tree" }); check(r.status === 200, "open to everyone: any signed-in wallet can gather");
r = await call(gm, "world-jur-start", { node: "tree-broadleaf0:1", kind: "dragon" }); check(r.status === 400, "an unknown kind is refused");
r = await call(gm, "world-jur-start", { node: "tree-broadleaf0:1", kind: "tree" }); const need = r.body.need;
check(r.status === 200 && need >= Math.round(JUR.NODES.tree.hits[0] * JUR.AXE[0]), "bare hands: a tree takes " + need + " swings");
T += 1000; r = await call(gm, "world-jur-break", { node: "tree-broadleaf0:1" }); check(r.status === 429, "it can't fall faster than its swings");
T += need * JUR.HIT_MS; r = await call(gm, "world-jur-break", { node: "tree-broadleaf0:1" });
check(r.status === 200 && r.body.loot.wood >= 4 && r.body.inv.mat.wood === r.body.loot.wood, "it falls: wood in the pack " + JSON.stringify(r.body.loot));
r = await call(gm, "world-jur-start", { node: "tree-broadleaf0:1", kind: "tree" }); check(r.status === 409, "a felled tree isn't back yet");
r = await call(gm, "world-jur-break", { node: "tree-broadleaf0:2" }); check(r.status === 400, "no first swing: nothing breaks");
let v = await view(gm); check(v.ok && v.felled["tree-broadleaf0:1"] > T && v.recipes.axe1 && v.inv.tools.axe === 0, "the view: what's felled, the recipes, the tools");
// rocks: stone, and ore in the mine's pockets
let cu = 0; for (let i = 0; i < 12; i++) { r = await fell(gm, "rock:" + i, "rock"); if (r.body.loot.ore) cu += r.body.loot.ore.cu || 0; }
v = await view(gm); check(v.inv.mat.stone >= 36 && (v.ore.cu || 0) === cu, "rocks: stone in the pack, ore in the mine's pockets (" + cu + " copper)");
r = await call(gm, "world-jur-craft", { recipe: "spear" }); check(r.status === 400, "a spear needs a workbench first");
for (let i = 0; i < 6; i++) { await fell(gm, "fern1:" + i, "fern"); await fell(gm, "tree-araucaria0:" + i, "tree"); }
r = await call(gm, "world-jur-craft", { recipe: "axe1" }); check(r.status === 200 && r.body.inv.tools.axe === 1, "a stone axe");
r = await call(gm, "world-jur-craft", { recipe: "axe1" }); check(r.status === 409, "not twice");
r = await call(gm, "world-jur-start", { node: "tree-broadleaf0:9", kind: "tree" }); check(r.body.need < need * 0.7 + 2, "the axe: fewer swings (" + r.body.need + ")");
for (let i = 10; i < 16; i++) await fell(gm, "tree-broadleaf0:" + i, "tree");
r = await call(gm, "world-jur-build", { op: "place", piece: { k: "bench", x: 2, z: 0 } }); check(r.status === 400, "no camp yet: nothing to build on");
r = await call(gm, "world-jur-camp", { op: "claim" }); check(r.status === 200 && r.body.home === 0 && r.body.camps.list[0].mine, "the first player gets the first camp spot");
{ const a = ethers.Wallet.createRandom(), b = ethers.Wallet.createRandom(); const [ra, rb] = await Promise.all([call(a, "world-jur-camp", { op: "claim" }), call(b, "world-jur-camp", { op: "claim" })]);
  check(ra.status === 200 && rb.status === 200 && ra.body.home !== rb.body.home, "two claiming at once get two different spots (" + ra.body.home + ", " + rb.body.home + ")"); }
r = await call(gm, "world-jur-camp", { op: "claim" }); check(r.status === 200 && r.body.home === 0, "claiming again keeps the same spot");
r = await call(gm, "world-jur-build", { op: "place", piece: { k: "bench", x: 20, z: 0 } }); check(r.status === 400, "nothing outside the camp");
r = await call(gm, "world-jur-build", { op: "place", piece: { k: "bench", x: 2, z: 0 } }); check(r.status === 200 && r.body.plot.some((p) => p.k === "bench"), "a workbench built at the camp");
r = await call(gm, "world-jur-build", { op: "place", piece: { k: "bench", x: -2, z: 3 } }); check(r.status === 409, "one workbench a camp");
r = await call(gm, "world-jur-build", { op: "place", piece: { k: "campfire", x: 3, z: 1 } }); check(r.status === 409, "not on top of the workbench");
r = await call(gm, "world-jur-build", { op: "place", piece: { k: "campfire", x: -3, z: 1 } }); check(r.status === 200, "a campfire at the camp");
// 20 spots: then there's no spot left, and a newcomer joins someone's camp
const ws = []; for (let i = 0; i < 17; i++) { const x = ethers.Wallet.createRandom(); GM_WALLETS.push(x.address.toLowerCase()); ws.push(x); r = await call(x, "world-jur-camp", { op: "claim" }); }
check(r.status === 200 && r.body.home === 19 && r.body.camps.free === 0, "twenty camps, all taken");
const late = ethers.Wallet.createRandom(); GM_WALLETS.push(late.address.toLowerCase());
r = await call(late, "world-jur-camp", { op: "claim" }); check(r.status === 409 && r.body.full, "the 21st: no spot of their own");
r = await call(late, "world-jur-camp", { op: "join", slot: 0 }); check(r.status === 200 && r.body.home === 0 && r.body.camps.list[0].members === 2, "they join a camp and live there");
r = await call(late, "world-jur-build", { op: "remove", piece: { k: "bench", x: 2, z: 0 } }); check(r.status === 403, "a guest can't take down the owner's workbench");
// hunting: a raptor, then cooking its meat at the fire and eating it
r = await fell(gm, "raptor:0", "raptor"); check(r.status === 200 && r.body.loot.meat >= 2 && r.body.loot.hide >= 2, "a raptor hunted: meat, hide, bone");
r = await call(gm, "world-jur-craft", { recipe: "cook" }); check(r.status === 200 && r.body.inv.mat.cooked === 1, "meat cooked at the campfire");
r = await call(gm, "world-jur-craft", { recipe: "spear" }); check(r.status === 200 && r.body.inv.tools.spear === 1, "a spear at the workbench");
r = await call(gm, "world-jur-eat", { food: "cooked" }); check(r.status === 200 && r.body.fed === JUR.FOOD.cooked && r.body.inv.mat.cooked === 0, "eaten");
r = await call(gm, "world-jur-eat", { food: "cooked" }); check(r.status === 400, "none left to eat");
r = await fell(gm, "titan:0", "titan"); check(r.status === 200 && r.body.loot.hide >= 8, "the Thornback Titan can be hunted");
r = await fell(gm, "claw:0", "claw"); check(r.status === 200 && r.body.loot.meat >= 3, "a Clawstrider can be hunted");
r = await fell(gm, "spino:0", "spino"); check(r.status === 200 && r.body.loot.hide >= 5, "the Spinosaurus can be hunted");
// a hut is hollow: a bed or a chest fits inside it, a wall through it doesn't; the game's copy of the rule is the same
{ const J = await import("../../api/_world-jur.mjs"), src = fs.readFileSync(new URL("../../world-jursurv.js", import.meta.url), "utf8"), srv = fs.readFileSync(new URL("../../api/_world-jur.mjs", import.meta.url), "utf8");
  const body = (t) => t.slice(t.indexOf("const RAD = {"), t.indexOf("return d < (r1 + r2) * 0.8;")).replace("export ", "");
  check(body(src) === body(srv), "the game and the server judge a piece's room the same way");
  check(!J.clash("hut", 0, 0, "bed", 0, -1) && !J.clash("hut", 0, 0, "chest", 1, 1) && J.clash("hut", 0, 0, "wall", 0, 2) && J.clash("hut", 0, 0, "bed", 0, -2) && J.clash("bed", 0, 0, "chest", 0, 1), "inside a hut: a bed and a chest fit, a wall or a bed through its wall doesn't"); }
// b-jx1: the daily missions (gather 60 · make or build 3 · cook 2): 300 ARCL each, once a day, for taking part
{ const bal = async (w) => (((await W.read(new URL("https://x/api/social?world=arcl&wallet=" + w.address.toLowerCase()))).body) || {}).bal || 0;
  const p = ethers.Wallet.createRandom(); GM_WALLETS.push(p.address.toLowerCase());
  let v0 = await view(p); check(Array.isArray(v0.inv.mis) && v0.inv.mis.length === 3 && v0.inv.mis.every((m) => !m.paid && m.n === 0 && m.arcl === 300), "three missions, none done yet");
  const b0 = await bal(p); let paidAll = [];
  for (let i = 0; i < 40 && !(paidAll.some((x) => x.key === "gather")); i++) { r = await fell(p, "tree-cycad0:" + i, "tree"); paidAll = paidAll.concat((r.body && r.body.paid) || []); }
  check(paidAll.some((x) => x.key === "gather" && x.n === 300), "gathering 60 materials pays 300 ARCL once");
  const b1 = await bal(p); check(b1 - b0 === 300, "the balance rose by 300 (" + b0 + " → " + b1 + ")");
  r = await fell(p, "tree-cycad0:99", "tree"); check(!((r.body.paid || []).length), "not paid twice the same day");
  for (let i = 0; i < 4; i++) await fell(p, "fern2:" + i, "fern");
  let got = []; for (const rc of ["rope", "torch", "rope"]) { r = await call(p, "world-jur-craft", { recipe: rc }); got = got.concat(r.body.paid || []); }
  check(got.some((x) => x.key === "make" && x.n === 300), "making 3 things pays 300 ARCL");
  v0 = await view(p); check(v0.inv.mis.find((m) => m.key === "make").paid && !v0.inv.mis.find((m) => m.key === "cook").paid, "the view shows which are paid");
  r = await fell(gm, "raptor:1", "raptor"); r = await call(gm, "world-jur-craft", { recipe: "cook" });
  check((r.body.paid || []).some((x) => x.key === "cook"), "cooking 2 meals pays (the day's second meal: one was cooked earlier)");
  v0 = await view(gm); check(v0.inv.hunted.raptor >= 2 && v0.inv.hunted.titan === 1, "hunts are counted for the goal card " + JSON.stringify(v0.inv.hunted));
  T += 864e5; v0 = await view(p); check(v0.inv.mis.every((m) => !m.paid && m.n === 0), "a new day: the missions start again"); }
// b-jx2: the boss hour — one HP for everyone there, swings no faster than real ones, a hunter's share once it falls
{ const rd = async (q, w) => (await W.read(new URL("https://x/api/social?world=" + q + (w ? "&wallet=" + w.address.toLowerCase() : "")))).body;
  const base = Date.parse("2026-10-21T02:50:00Z"); T = base; // 11:50 in Seoul: the noon hour is next
  let b = await rd("jur-boss"); check(!b.on && b.kind === "alpha" && b.start === Date.parse("2026-10-21T03:00:00Z"), "before noon: the next boss hour is the Alpha Raptor's at 12:00 KST");
  const h1 = ethers.Wallet.createRandom(), h2 = ethers.Wallet.createRandom(), lazy = ethers.Wallet.createRandom();
  r = await call(h1, "world-jur-boss-hit", { n: 5 }); check(r.status === 409, "no hits outside the hour");
  T = Date.parse("2026-10-21T03:01:00Z"); b = await rd("jur-boss"); check(b.on && b.hp === JUR.BOSS.hp.alpha && b.hunters === 0, "12:01: it's on, at full HP");
  r = await call(h1, "world-jur-boss-hit", { n: 500 }); check(r.status === 200 && r.body.mine.n <= JUR.BOSS.post, "no more than a post's worth at once (" + r.body.mine.n + ")");
  r = await call(h1, "world-jur-boss-hit", { n: 20 }); check(r.body.mine.n <= JUR.BOSS.post + 1, "and no faster than real swings (" + r.body.mine.n + ")");
  r = await call(lazy, "world-jur-boss-hit", { n: 3 }); check(r.body.hunters === 2, "two hunters on it");
  for (let i = 0; i < 80 && !r.body.down; i++) { T += JUR.BOSS.post * JUR.HIT_MS; r = await call(i % 2 ? h1 : h2, "world-jur-boss-hit", { n: JUR.BOSS.post }); }
  check(r.body.down && r.body.hp === 0, "it falls when the hunters' hits add up");
  const id = r.body.id;
  r = await call(lazy, "world-jur-boss-claim", { id }); check(r.status === 403, "3 hits isn't enough for a share");
  r = await call(h2, "world-jur-boss-claim", { id }); check(r.status === 200 && r.body.loot.amber >= 2 && r.body.inv.hunted.alpha === 1, "a hunter's share: amber and the rest, the hunt counted " + JSON.stringify(r.body.loot));
  r = await call(h2, "world-jur-boss-claim", { id }); check(r.status === 409, "once");
  // b-jy3/4: the MVP card's numbers, who landed the last hit, and a little ARCL for the share (taking part: 10 hits)
  b = await rd("jur-boss"); check(b.top && b.top.length >= 2 && b.top[0].n >= b.top[1].n && b.by && b.down, "the fallen boss shows its top hunters and the last hit " + JSON.stringify({ top: b.top.slice(0, 2), by: b.by }));
  r = await call(h1, "world-jur-boss-claim", { id }); check(r.status === 200 && r.body.arcl === JUR.BOSS.arcl.alpha, "a hunter's share pays " + JUR.BOSS.arcl.alpha + " ARCL (" + r.body.arcl + ")");
  T = Date.parse("2026-10-21T11:10:00Z"); b = await rd("jur-boss"); check(b.on && b.kind === "titan", "20:10 KST: the Thornback Titan's hour");
  const top = await rd("jur-top"); check(top.top.length >= 1 && top.top.some((x) => x.n >= JUR.HUNT_PTS.alpha), "the week's hunters board counts the boss share");
  // b-jx3: fishing needs a rod and a few seconds; the second land's rock gives obsidian; an obsidian spear
  const f = ethers.Wallet.createRandom();
  r = await call(f, "world-jur-start", { node: "fish:1", kind: "fish" }); check(r.status === 400, "no rod: no fishing");
  for (let i = 0; i < 14; i++) await fell(f, "fern3:" + i, "fern");
  for (let i = 0; i < 3; i++) await fell(f, "tree-cycad1:" + i, "tree");
  r = await call(f, "world-jur-craft", { recipe: "rope" }); r = await call(f, "world-jur-craft", { recipe: "rod" }); check(r.status === 200 && r.body.inv.tools.rod === 1, "a fishing rod");
  r = await call(f, "world-jur-start", { node: "fish:1", kind: "fish" }); T += 1000; const r2 = await call(f, "world-jur-break", { node: "fish:1" }); check(r2.status === 429, "a fish takes a few seconds");
  T += 5000; r = await call(f, "world-jur-break", { node: "fish:1" }); check(r.status === 200 && r.body.loot.fish >= 1, "a fish caught");
  r = await fell(f, "obsidian:0", "obsidian"); check(r.status === 200 && r.body.loot.obsidian >= 2, "obsidian from the Ember Basin's rock");
  check(JUR.RECIPES.spear2.tool[1] === 2 && JUR.SPEAR[2] < JUR.SPEAR[1] && JUR.RECIPES.cloak && JUR.RECIPES.armor, "an obsidian spear (fewer swings), a heat cloak, hide armour"); }
// b-jy3: who's hunting here — your spot, the others' spots, a ping that lasts a few seconds
{ const a = ethers.Wallet.createRandom(), c = ethers.Wallet.createRandom();
  let r = await W.handle({ action: "world-jur-here", x: 1, z: 2 }); check(r.status >= 400, "no signature: not shown");
  r = await call(a, "world-jur-here", { x: 900, z: 0 }); check(r.status === 400, "off the land: refused");
  r = await call(a, "world-jur-here", { x: 10, z: 20, f: 1, hp: 80, c: "male-1", lv: 42 }); check(r.status === 200 && Array.isArray(r.body.list) && !r.body.list.some((y) => y.id.startsWith(a.address.slice(0, 6))), "your spot posted (you're not in your own list)");
  T += 3000; r = await call(c, "world-jur-here", { x: 12, z: 18, pk: 2 }); const seenA = r.body.list.find((y) => y.x === 10 && y.z === 20);
  check(seenA && seenA.lv === 42 && seenA.hp === 80 && seenA.c === "male-1", "another hunter sees you: spot, level, HP, look");
  T += 3000; r = await call(a, "world-jur-here", { x: 11, z: 20 }); const pc = r.body.list.find((y) => y.x === 12 && y.z === 18);
  check(pc && pc.pk === 2 && pc.pa >= 0 && pc.pa < JUR.HERE.PING_MS, "their ping (help) reaches you " + JSON.stringify(pc));
  T += JUR.HERE.PING_MS + 1000; r = await call(c, "world-jur-here", { x: 12, z: 18 }); T += JUR.HERE.MEMO + 10; r = await call(a, "world-jur-here", { x: 11, z: 20 }); const pc2 = r.body.list.find((y) => y.x === 12 && y.z === 18);
  check(pc2 && !pc2.pk, "the ping is gone after a few seconds");
  T += JUR.HERE.LIFE * 2 + 1000; r = await call(a, "world-jur-here", { x: 11, z: 20 }); check(!r.body.list.length, "a hunter who left is gone from the list");
  // b-jy4: the night raid's ARCL — only with all three waves' raiders hunted, once a night
  const nk = (() => { const d = new Date(T + 9 * 3600e3); return d.toISOString().slice(0, 10).replace(/-/g, "") + (d.getUTCHours() < 6 ? "a" : "b"); })();
  r = await call(a, "world-jur-raid-claim", { key: "20200101a" }); check(r.status === 400, "an old night: refused");
  r = await call(a, "world-jur-raid-claim", { key: nk }); check(r.status === 403, "no raiders hunted: nothing");
  for (let i = 0; i < JUR.RAID.need; i++) { const x = await fell(a, `raid:${nk}:${i}`, "raptor"); if (x.status !== 200) { check(false, "a raider hunted " + JSON.stringify(x.body)); break; } }
  r = await call(a, "world-jur-raid-claim", { key: nk }); check(r.status === 200 && r.body.arcl === JUR.RAID.arcl, "three waves held: " + JUR.RAID.arcl + " ARCL (" + r.body.arcl + ")");
  r = await call(a, "world-jur-raid-claim", { key: nk }); check(r.status === 409, "once a night"); }
// b-jy7: the Mire, fossils, meteors (only in a shower), taming, camp likes and notes
{ const { weatherAt, WEATHER } = await import("../../api/_world-jur.mjs"), a = ethers.Wallet.createRandom(), c = ethers.Wallet.createRandom();
  let r = await fell(a, "reed:0", "reed"); check(r.status === 200 && r.body.loot.reed >= 2, "reeds in the Mire " + JSON.stringify(r.body.loot));
  r = await fell(a, "mire:0", "mire"); check(r.status === 200 && (r.body.loot.clay || 0) >= 1, "mud: clay");
  r = await call(a, "world-jur-start", { node: "fossil:0", kind: "fossil" }); T += 2000; let r2 = await call(a, "world-jur-break", { node: "fossil:0" }); check(r2.status === 429, "a fossil takes its few seconds of brushing");
  T += 8000; r2 = await call(a, "world-jur-break", { node: "fossil:0" }); check(r2.status === 200 && r2.body.loot.fossil === 1, "a fossil dug up");
  // the weather: a storm and a meteor shower by turns, 8 minutes every 2 hours from 00:30 Seoul
  const base = Date.parse("2026-10-22T15:30:00Z"); /* 00:30 KST */ const w0 = weatherAt(base), w1 = weatherAt(base + WEATHER.EVERY), w2 = weatherAt(base + WEATHER.LEN + 1000);
  check(w0.on && w1.on && w0.kind !== w1.kind && !w2.on, "a storm and a meteor shower take turns, eight minutes each " + JSON.stringify([w0.kind, w1.kind, w2.on]));
  const met = [w0, w1].find((x) => x.kind === "meteor"); T = met.start + 1000; r = await call(a, "world-jur-start", { node: "meteor:1", kind: "meteor" }); check(r.status === 200, "a meteor can be mined while the shower is on");
  T = met.start + WEATHER.LEN + 5000; r = await call(a, "world-jur-start", { node: "meteor:2", kind: "meteor" }); check(r.status === 409, "and not after it");
  // taming: a bola and 3 berries a try
  r = await call(a, "world-jur-tame", { kind: "trike" }); check(r.status === 400, "no bola: no try");
  for (let i = 0; i < 6; i++) await fell(a, "rock:" + (100 + i), "rock");
  for (let i = 0; i < 20; i++) await fell(a, "fern9:" + i, "fern");
  for (let i = 0; i < 8; i++) await fell(a, "bush9:" + i, "bush");
  r = await call(a, "world-jur-craft", { recipe: "rope" }); r = await call(a, "world-jur-craft", { recipe: "bola" }); check(r.status === 200 && r.body.inv.mat.bola === 1, "a bola " + (r.body.error || ""));
  r = await call(a, "world-jur-tame", { kind: "titan" }); check(r.status === 400, "a boss can't be tamed");
  r = await call(a, "world-jur-tame", { kind: "trike" }); check(r.status === 200 && typeof r.body.tamed === "boolean" && r.body.inv.mat.bola === 0, "a try uses the bola and berries (" + (r.body.tamed ? "tamed" : "it broke free") + ")");
  r = await call(a, "world-jur-tame", { kind: "trike" }); check(r.status === 429 || r.status === 400, "not again at once");
  // a camp: like it once a week (not your own), a note from the list once a day
  r = await call(c, "world-jur-camp", { op: "claim" }); const own = r.body.home, slot = Number.isInteger(own) && own >= 0 ? own : (await view(a)).camps.list.find((x) => x.owner).slot;
  if (Number.isInteger(own) && own >= 0) { r = await call(c, "world-jur-like", { slot }); check(r.status === 400, "not your own camp"); }
  r = await call(a, "world-jur-like", { slot }); check(r.status === 200 && r.body.likes === 1, "a visitor likes it ");
  r = await call(a, "world-jur-like", { slot }); check(r.status === 409, "once a week");
  r = await call(a, "world-jur-note", { slot, t: 9 }); check(r.status === 400, "only a line from the list");
  r = await call(a, "world-jur-note", { slot, t: 2 }); check(r.status === 200 && r.body.notes[0].t === 2, "a note left");
  r = await call(a, "world-jur-note", { slot, t: 3 }); check(r.status === 409, "one a day per camp");
  const ci = (await W.read(new URL("https://x/api/social?world=jur-camp&slot=" + slot))).body; check(ci.likes === 1 && ci.notes.length >= 1 && ci.members >= 1, "the camp's card: likes and notes " + JSON.stringify({ l: ci.likes, n: ci.notes.length }));
  const tp = (await W.read(new URL("https://x/api/social?world=jur-top"))).body; check(tp.camps && tp.camps.some((x) => x.slot === slot && x.n === 1), "the week's best camps"); }
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
