// hwrealm.test.mjs — the HALLOWEEN REALM (api/_world-hwrealm.mjs, world-hwrealm-data.js): the 30-minute clock (20 day,
// 10 night), the grounds' level gate, knock-out reports spaced and capped, drops at the spec's rates (×1.5 at night), a
// boss once in 10 minutes and Inferno Jack once in 20, fragments → salvage / craft / enhance, wearing a piece in its slot,
// the set's bonuses, and a piece's stats below a Crimson Celestial piece's. On an in-memory store.
// Run: node tests/world/hwrealm.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { xpAt, XP_VERSION } = await import("../../api/_world-social.mjs");
const D = await import("../../world-hwrealm-data.js");
const { itemStats } = await import("../../world-rpg-data.js");
const MY = await import("../../world-mythic-data.js");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-10-28T00:00:00Z"), R = 0.5; // R: the next roll
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, rand: () => R });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const lvSet = (w, lv) => db.set(`worldSave/${w.address.toLowerCase()}`, { xp: xpAt(lv), xpv: XP_VERSION, name: "P" });
const setOf = (w) => db.get(`worldHwSet/${w.address.toLowerCase()}`) || { pieces: [], frag: 0, eq: {} };

// the clock
{ const day = Date.parse("2026-10-28T00:00:00Z"); // a multiple of 30 minutes: a cycle's start
  check(!D.clockOf(day).night && D.clockOf(day).left === 1200, "a cycle starts with 20 minutes of day");
  check(D.clockOf(day + 1140e3).warn && !D.clockOf(day + 1139e3).warn, "the last minute of the day is the warning");
  check(D.clockOf(day + 1200e3).night && D.clockOf(day + 1200e3).left === 600, "then 10 minutes of night");
  check(!D.clockOf(day + 1800e3).night && D.clockOf(day + 1800e3).cycle === D.clockOf(day).cycle + 1, "and the next day"); }
// the grounds
{ const xs = D.GROUNDS.map(D.groundXZ); let apart = true;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (Math.hypot(xs[i][0] - xs[j][0], xs[i][1] - xs[j][1]) < D.GROUNDS[i].r + D.GROUNDS[j].r) apart = false;
  check(apart, "the six grounds don't overlap");
  check(D.GROUNDS.every((g, i) => Math.hypot(xs[i][0] - D.HW.LAND.x, xs[i][1] - D.HW.LAND.z) - g.r > D.HW.VILLAGE_R && Math.hypot(xs[i][0] - D.HW.LAND.x, xs[i][1] - D.HW.LAND.z) + g.r < D.HW.LAND.r), "each ground is past the village and inside the land");
  check(Math.max(...D.GROUNDS.map((g) => g.lv[1])) === 400 && D.GROUNDS[0].lv[0] === 15, "levels 15 to 400 (the owner: the high grounds up to 400)"); }
// a piece's stats: the Lv 100 Legendary of its slot, under Crimson Celestial's
{ const a = D.pieceStats({ k: "blade", p: 0 }, itemStats), cc = MY.mythicStats({ def: "CC_WEAPON", plus: 0, mult: 1 });
  check(a.atk > 0 && cc.atk > a.atk, `the Inferno Blade (${a.atk}) is below the Crimson weapon at its lowest (${cc.atk})`);
  const a10 = D.pieceStats({ k: "blade", p: 10 }, itemStats), cc10 = MY.mythicStats({ def: "CC_WEAPON", plus: 10, mult: 1 });
  check(a10.atk > a.atk && cc10.atk > a10.atk, `at +10 too (${a10.atk} < ${cc10.atk})`);
  const b = D.setBonus([{ k: "blade" }, { k: "armor" }, { k: "crown" }, { k: "ring" }, { k: "pendant" }, { k: "boots" }]);
  check(b.n === 6 && b.stats.atkPct === 5 && b.stats.hpPct === 8 && b.stats.hwXp === 15 && b.stats.hwDmg === 10 && b.stats.soul === 1, "six worn: the five bonuses stack");
  check(D.setBonus([{ k: "blade" }, { k: "blade" }]).n === 1 && !D.setBonus([{ k: "blade" }]).stats.atkPct, "two of one slot count once; one piece, no bonus");
  check(D.dropChance("", false) === 0.0003 && Math.abs(D.dropChance("jack", true) - 0.075) < 1e-12 && Math.abs(D.dropChance("elite", true) - 0.0045) < 1e-12, "the drop rates (night ×1.5)"); }

// the server
const A = ethers.Wallet.createRandom(), low = ethers.Wallet.createRandom(); lvSet(A, 380); lvSet(low, 40);
let r = await call(low, "world-hw-kill", { zone: "hw-grave", rank: "" }); check(r.status === 403 && r.body.need === 90, "Lv 40 can't hunt the Graveyard (90+)");
r = await call(A, "world-hw-kill", { zone: "nope" }); check(r.status === 400, "an unknown ground");
r = await call(A, "world-hw-kill", { zone: "hw-grave", rank: "jack" }); check(r.status === 400, "Inferno Jack only in the throne");
R = 0.9; r = await call(A, "world-hw-kill", { zone: "hw-patch", rank: "" }); check(r.status === 200 && !r.body.drop && r.body.frag === 0, "a plain knock-out: most of the time nothing");
r = await call(A, "world-hw-kill", { zone: "hw-patch", rank: "" }); check(r.status === 429, "one report each 0.7 s");
T += 1000; R = 0.0001; r = await call(A, "world-hw-kill", { zone: "hw-patch", rank: "" }); check(r.status === 200 && r.body.drop && D.pieceOf(r.body.drop.k), "a lucky roll drops a piece");
T += 1000; R = 0.01; r = await call(A, "world-hw-kill", { zone: "hw-forest", rank: "boss" }); check(r.body.drop && r.body.frag >= 1, "a ground's boss: 2 % for a piece and fragments");
T += 1000; r = await call(A, "world-hw-kill", { zone: "hw-forest", rank: "boss" }); check(r.body.again && !r.body.drop, "the same boss again within 10 minutes counts nothing");
T += 1000; R = 0.04; r = await call(A, "world-hw-kill", { zone: "hw-throne", rank: "jack" }); check(r.body.drop && r.body.frag >= 5 && r.body.frag <= 10, "Inferno Jack: 5 % and 5–10 fragments by day");
// night ×1.5: a roll between the day's and the night's chance drops only at night
T = Date.parse("2026-10-28T01:20:00Z"); check(D.clockOf(T).night, "(now night)"); R = 0.06; r = await call(A, "world-hw-kill", { zone: "hw-throne", rank: "jack" }); check(r.body.night && r.body.drop, "at night Inferno Jack's 7.5 % catches a roll of 6 %");
T = Date.parse("2026-10-28T02:00:00Z"); R = 0.06; r = await call(A, "world-hw-kill", { zone: "hw-throne", rank: "jack" }); check(!r.body.night && !r.body.drop, "by day the same roll misses");
// the set
const S0 = setOf(A); check(S0.pieces.length === 4, `four pieces held (${S0.pieces.length})`);
const p0 = S0.pieces[0], slot0 = D.pieceOf(p0.k).slot;
r = await call(A, "world-hw-equip", { slot: slot0, id: p0.id }); check(r.status === 200 && r.body.set.eq[slot0] === p0.id, "wear a piece in its slot");
const other = D.SET.PIECES.find((p) => p.slot !== slot0).slot; r = await call(A, "world-hw-equip", { slot: other, id: p0.id }); check(r.status === 400, "not in another slot");
r = await call(A, "world-hw-craft", { slot: "boots" }); check(r.status === 400 && r.body.need === 100, "crafting needs 100 fragments");
db.set(`worldHwSet/${A.address.toLowerCase()}`, { ...setOf(A), frag: 140 });
r = await call(A, "world-hw-craft", { slot: "boots" }); check(r.status === 200 && r.body.drop.k === "boots" && r.body.set.frag === 40, "100 fragments → Shadow Boots");
R = 0.5; r = await call(A, "world-hw-enhance", { id: p0.id }); check(r.body.up && r.body.plus === 1 && r.body.set.frag === 35, "+0 → +1 is sure (5 fragments)");
R = 0.99; db.set(`worldHwSet/${A.address.toLowerCase()}`, { ...setOf(A), pieces: setOf(A).pieces.map((p) => (p.id === p0.id ? { ...p, p: 7 } : p)), frag: 60 });
r = await call(A, "world-hw-enhance", { id: p0.id }); check(r.status === 200 && !r.body.up && r.body.plus === 7, "a miss keeps the +");
r = await call(A, "world-hw-salvage", { id: p0.id }); check(r.status === 200 && r.body.frag === 20 + 14 && !r.body.set.eq[slot0], "salvage: 20 + its + × 2, and it comes off");
const v = (await W.read(new URL("https://x/api/social?world=hw&wallet=" + A.address))).body; check(v.clock && v.set && v.set.pieces.length === 4, "the view: the clock and your set");
// the day's cap
db.set(`worldHwDay/${A.address.toLowerCase()}_${new Date(T + 9 * 3600e3).toISOString().slice(0, 10)}`, { n: D.HW.KILL_DAY }); T += 1000;
r = await call(A, "world-hw-kill", { zone: "hw-patch" }); check(r.body.capped, "4,000 knock-outs a day, then nothing more");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
