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
T += 1000; r = await call(A, "world-hw-kill", { zone: "hw-forest", rank: "boss" }); check(r.status === 200 && !r.body.drop && r.body.frag === 0 && r.body.pity > 0, "the same boss again within 10 minutes counts as a plain knock-out");
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
// HX1: every 50th knock-out of a day gives a sure fragment
{ const dk = `worldHwDay/${A.address.toLowerCase()}_${new Date(T + 9 * 3600e3).toISOString().slice(0, 10)}`; db.set(dk, { n: D.HW.FRAG.PITY - 1 }); T += 1000; R = 0.9;
  r = await call(A, "world-hw-kill", { zone: "hw-patch" }); check(r.body.frag === 1 && r.body.sure && r.body.pity === D.HW.FRAG.PITY, `the ${D.HW.FRAG.PITY}th knock-out: a sure fragment, the next in ${D.HW.FRAG.PITY}`);
  T += 1000; r = await call(A, "world-hw-kill", { zone: "hw-patch" }); check(r.body.frag === 0 && r.body.pity === D.HW.FRAG.PITY - 1, "and the count goes on"); }
// the day's cap
db.set(`worldHwDay/${A.address.toLowerCase()}_${new Date(T + 9 * 3600e3).toISOString().slice(0, 10)}`, { n: D.HW.KILL_DAY }); T += 1000;
r = await call(A, "world-hw-kill", { zone: "hw-patch" }); check(r.body.capped, "4,000 knock-outs a day, then nothing more");
// HX2: the night's shared Inferno Jack
{ const B = ethers.Wallet.createRandom(), C = ethers.Wallet.createRandom(); lvSet(B, 400); lvSet(C, 360);
  T = Date.parse("2026-10-29T00:00:00Z"); r = await call(B, "world-hw-jack-hit", { dmg: 1000 }); check(r.status === 400, "by day there's no shared Jack");
  T = Date.parse("2026-10-29T00:21:00Z"); const cy = D.clockOf(T).cycle;
  r = await call(low, "world-hw-jack-hit", { dmg: 1000 }); check(r.status === 403, "Lv 40 can't hit the throne's Jack");
  r = await call(B, "world-hw-jack-hit", { dmg: 1e9 }); check(r.status === 200 && r.body.max - r.body.hp === 60 * 400 && r.body.mine === 24000, "a report is capped at 60 × level");
  r = await call(B, "world-hw-jack-hit", { dmg: 100 }); check(r.status === 429, "one report each 5 s");
  T += 5000; r = await call(C, "world-hw-jack-hit", { dmg: 20000 }); check(r.body.top.length === 2 && r.body.top[0].w === B.address.toLowerCase(), "the board: who hit hardest first");
  r = await call(B, "world-hw-jack-claim", { cycle: cy }); check(r.status === 400, "no reward before he falls");
  db.set(`worldHwNj/${cy}`, { dmg: D.HW.NJACK.hp - 10 }); T += 5000; r = await call(B, "world-hw-jack-hit", { dmg: 100 }); check(r.body.down && r.body.hp <= 0, "the last hit fells him for everyone");
  const f0 = setOf(B).frag || 0; r = await call(B, "world-hw-jack-claim", { cycle: cy }); check(r.body.frag === 30 && r.body.rank === 0 && setOf(B).frag === f0 + 30, "the top hitter: 30 fragments");
  r = await call(B, "world-hw-jack-claim", { cycle: cy }); check(r.body.again && setOf(B).frag === f0 + 30, "once a night");
  r = await call(C, "world-hw-jack-claim", { cycle: cy }); check(r.body.frag === 20, "the second: 20");
  T += 5000; r = await call(C, "world-hw-jack-hit", { dmg: 100 }); check(r.body.down && r.body.mine === 20000, "a fallen Jack takes no more hits");
  const v2 = (await W.read(new URL("https://x/api/social?world=hw-jack&wallet=" + B.address))).body; check(v2.cycle === cy && v2.down && v2.claimed, "the view"); }
// HX2: Trick or Treat
{ const E = ethers.Wallet.createRandom(); lvSet(E, 50); T = Date.parse("2026-10-30T03:00:00Z");
  r = await call(E, "world-hw-treat", { house: "nope" }); check(r.status === 400, "an empty house");
  R = 0.1; r = await call(E, "world-hw-treat", { house: "hwhouse1" }); check(r.body.trick, "a trick: monsters jump out");
  r = await call(E, "world-hw-treat", { house: "hwhouse1" }); check(r.body.again, "each house once a day");
  R = 0.8; r = await call(E, "world-hw-treat", { house: "hwhouse2" }); check(r.body.frag >= 2 && r.body.frag <= 4 && setOf(E).frag === r.body.frag, "a treat: 2–4 fragments");
  R = 0.4; r = await call(E, "world-hw-treat", { house: "hwtreat" }); check(r.status === 200 && (r.body.arcl > 0 || r.body.frag > 0), "or a little ARCL");
  T += 864e5; R = 0.8; r = await call(E, "world-hw-treat", { house: "hwhouse1" }); check(r.body.frag > 0, "the next day again"); }
// HX3: the Blood Moon — every 6th Cursed Night, stronger and richer
{ let t0 = Date.parse("2026-10-28T00:00:00Z"), seen = 0, k = 0; for (let i = 0; i < 12; i++) { const c = D.clockOf(t0 + i * 1800e3 + 1300e3); if (c.blood) { seen++; k = c.cycle; } }
  check(seen === 2 && D.clockOf(t0).nextBlood >= 0 && D.clockOf(t0).nextBlood < 6, `two Blood Moons in 12 cycles (${seen})`);
  const bt = k * 1800e3 + 1300e3, c = D.clockOf(bt); check(c.blood && D.nightOf(c) === D.HW.BLOOD && D.nightOf(D.clockOf(bt - 1300e3)) === null, "the Blood Moon's multipliers only that night");
  check(Math.abs(D.dropChance("jack", true, true) - 0.1) < 1e-12, "a Blood Moon doubles the drop chance");
  const F = ethers.Wallet.createRandom(); lvSet(F, 400); T = bt; R = 0.09; r = await call(F, "world-hw-kill", { zone: "hw-throne", rank: "jack" }); check(r.body.blood && r.body.drop, "on a Blood Moon a 9 % roll still drops Jack's piece"); }
// HX3: the gimmicks
{ const Gm = ethers.Wallet.createRandom(); lvSet(Gm, 120); T = Date.parse("2026-10-31T03:00:00Z");
  r = await call(Gm, "world-hw-gimmick", { kind: "tomb" }); check(r.body.frag === 5 && setOf(Gm).frag === 5, "the tombs lit in order: 5 fragments");
  r = await call(Gm, "world-hw-gimmick", { kind: "tomb" }); check(r.body.again && setOf(Gm).frag === 5, "once a day");
  r = await call(Gm, "world-hw-gimmick", { kind: "chest" }); check(r.body.frag === 3, "the forest's chest: 3");
  r = await call(low, "world-hw-gimmick", { kind: "tomb" }); check(r.status === 403, "the graveyard's puzzle needs its level"); }
// HX3: the week's board
{ const v3 = (await W.read(new URL("https://x/api/social?world=hw-top&wallet=" + A.address))).body; check(v3.week && v3.top.length >= 1 && v3.mine >= 1, `the week's hunters (${v3.top.length}, you ${v3.mine})`); }
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
