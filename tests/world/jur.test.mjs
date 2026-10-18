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
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
