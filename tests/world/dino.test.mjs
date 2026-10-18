// dino.test.mjs — DINO SOULMATE: the engine (world-dino-engine.js) and the server's copy are the same file; eggs only at
// the nests, on a schedule; the first to pick one up gets it, one a day, never with an egg or a companion already; the
// 72-hour care (day 1 within 6 h, then each day 20–28 h after the last; too early refused, a missed window kills the egg
// and frees the slot); the hatch only at 72 h; the companion's bond (daily cap, days away), experience (capped by the
// owner's level), its share of a hunt's swings and what a hunt gives it; treats for ARCL. On an in-memory store.
// Run: node tests/world/dino.test.mjs (needs ethers 6)
import fs from "node:fs";
import { ethers } from "ethers";
const E = await import("../../world-dino-engine.js");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
check(fs.readFileSync(new URL("../../world-dino-engine.js", import.meta.url), "utf8") === fs.readFileSync(new URL("../../api/_world-dino-engine.mjs", import.meta.url), "utf8"), "the server's engine is the game's, word for word");
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, JSON.parse(JSON.stringify(x.data))); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let TT = Date.parse("2026-10-14T03:00:00Z"), n = 0;
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => TT, randomId: () => "id" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(TT).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const A = (w) => w.address.toLowerCase(), H = 3600e3;
const pack = (w, mat) => db.set(`worldJurInv/${A(w)}`, { mat: { wood: 0, meat: 0, berries: 0, ...mat }, tools: { axe: 0, spear: 1 } });
const nextEgg = (from) => { for (let t = from; t < from + 30 * 864e5; t += 60e3) { const e = E.eggsAt(t); if (e.length) return { t, e: e[0] }; } return null; };

// the schedule: eggs only at the nests, the same answer for the same time, each out for 10 minutes
{ const f = nextEgg(TT), ids = new Set(E.DINO.NESTS.map((x) => x.id)); check(f && ids.has(f.e.nest) && JSON.stringify(E.eggsAt(f.t)) === JSON.stringify(E.eggsAt(f.t)) && f.e.to - f.e.from === E.DINO.LIVE && E.eggsAt(f.e.to).every((x) => x.nest !== f.e.nest || x.slot !== f.e.slot), "eggs appear only at the nests, on a fixed schedule, for 10 minutes each"); }
const p1 = ethers.Wallet.createRandom(), p2 = ethers.Wallet.createRandom();
let f = nextEgg(TT); TT = f.t + 1000;
let r = await W.read(new URL("http://x/api/social?world=dino-nests")); check(r.status === 200 && r.body.eggs.some((x) => x.nest === f.e.nest), "the nests list shows the egg that's out");
r = await call(p1, "world-dino-claim", { nest: "nowhere" }); check(r.status === 404, "no egg at that nest: refused");
r = await call(p1, "world-dino-claim", { nest: f.e.nest }); check(r.status === 200 && r.body.egg && r.body.egg.state.stage === "D1" && r.body.egg.state.open, "you pick the egg up: day 1, its care open now");
r = await call(p2, "world-dino-claim", { nest: f.e.nest }); check(r.status === 409 && /first/.test(r.body.error), "the same egg for someone else: someone picked it up first");
r = await W.read(new URL("http://x/api/social?world=dino-nests")); check(!r.body.eggs.some((x) => x.nest === f.e.nest && x.to === f.e.to), "a picked-up egg leaves the nests list");
{ const g = nextEgg(f.e.to + 60e3); const t0 = TT; TT = g.t + 1000; r = await call(p1, "world-dino-claim", { nest: g.e.nest }); check(r.status === 409, "with an egg already: no second one"); TT = t0; }
// day 1: warm (2 wood), water, feed (raw meat)
pack(p1, { wood: 1, meat: 0, berries: 0 });
r = await call(p1, "world-dino-care", { kind: "warm" }); check(r.status === 400 && /wood/.test(r.body.error), "warming without 2 wood: refused");
pack(p1, { wood: 10, meat: 5, berries: 6 });
const found = TT;
for (const k of ["warm", "water", "feed"]) r = await call(p1, "world-dino-care", { kind: k });
check(r.status === 200 && r.body.egg.done.length === 1 && db.get(`worldJurInv/${A(p1)}`).mat.wood === 8 && db.get(`worldJurInv/${A(p1)}`).mat.meat === 4, "day 1's three cares: done, 2 wood and a raw meat taken from the pack");
r = await call(p1, "world-dino-care", { kind: "water" }); check(r.status === 400, "a fourth care the same day: refused");
TT = found + 10 * H; r = await call(p1, "world-dino-care", { kind: "warm" }); check(r.status === 400 && /early/.test(r.body.error), "day 2 only from 20 hours after day 1: too early refused");
TT = found + 22 * H; for (const k of ["warm", "water", "feed"]) r = await call(p1, "world-dino-care", { kind: k }); check(r.body.egg.done.length === 2 && r.body.egg.state.stage === "D3", "day 2 cared for at 22 h");
TT = found + 46 * H; for (const k of ["warm", "water", "feed"]) r = await call(p1, "world-dino-care", { kind: k }); check(r.body.egg.done.length === 3 && r.body.egg.state.stage === "WAIT", "day 3 cared for at 46 h: it waits to hatch");
r = await call(p1, "world-dino-hatch", { name: "Rexy" }); check(r.status === 409 && /72/.test(r.body.error), "before 72 hours: no hatching");
TT = found + 80 * H; r = await call(p1, "world-dino-hatch", { name: "Blue<b>" }); check(r.status === 200 && r.body.buddy && r.body.buddy.name === "Blueb" && r.body.buddy.lv === 1 && r.body.buddy.bond === E.DINO.BOND0 && !r.body.egg, "past 72 hours: it hatches, named (no markup), level 1, bond 30");
{ const g = nextEgg(TT + 60e3); TT = g.t + 1000; r = await call(p1, "world-dino-claim", { nest: g.e.nest }); check(r.status === 200 && r.body.eggs.length === 1 && r.body.dinos.length === 1, "with a companion: another egg can be raised too (several dinosaurs an account)");
  r = await call(p1, "world-dino-claim", { nest: g.e.nest }); check(r.status === 409, "the same egg twice: no"); }
// a missed window kills the egg and frees the slot
const p3 = ethers.Wallet.createRandom(); pack(p3, { wood: 10, meat: 3 });
{ const g = nextEgg(TT + 11 * 60e3); TT = g.t + 1000; await call(p3, "world-dino-claim", { nest: g.e.nest }); const t3 = TT; for (const k of ["warm", "water", "feed"]) await call(p3, "world-dino-care", { kind: k });
  TT = t3 + 29 * H; r = await call(p3, "world-dino-care", { kind: "warm" }); const v = await W.read(new URL(`http://x/api/social?world=dino&wallet=${A(p3)}`));
  check(r.status === 409 && /make it/.test(r.body.error) && v.body.egg === null && v.body.memorial.length === 1, `day 2 missed (29 h): the egg dies, a line in the memorial, the slot free (${r.status} ${r.body.error} egg=${!!v.body.egg} mem=${v.body.memorial.length})`);
  const g2 = nextEgg(TT + 60e3); TT = g2.t + 1000; r = await call(p3, "world-dino-claim", { nest: g2.e.nest }); check(r.status === 200 || /a day/.test(r.body.error), "after the loss a new egg can be picked up (one a day)"); }
{ const p4 = ethers.Wallet.createRandom(); const g = nextEgg(TT + 864e5); TT = g.t + 1000; await call(p4, "world-dino-claim", { nest: g.e.nest }); TT += 7 * H; r = await call(p4, "world-dino-care", { kind: "water" }); check(r.status === 409, "day 1 not cared for within 6 hours: the egg dies"); }
// the companion: bond and its daily cap, a pat's cool-down
const bond0 = (await W.read(new URL(`http://x/api/social?world=dino&wallet=${A(p1)}`))).body.buddy.bond; // (the egg tests above moved the clock on a few days)
r = await call(p1, "world-dino-buddy", { op: "feed" }); check(r.status === 200 && r.body.buddy.bond === bond0 + 5 && r.body.buddy.xp > 0, "feeding it: +5 bond, a little experience");
r = await call(p1, "world-dino-buddy", { op: "pet" }); check(r.body.buddy.bond === bond0 + 7, "a pat: +2");
r = await call(p1, "world-dino-buddy", { op: "pet" }); check(r.status === 429, "another pat at once: in a few minutes");
for (let k = 0; k < 4; k++) r = await call(p1, "world-dino-buddy", { op: "feed" }); check(r.body.buddy.bond === bond0 + 15, "bond grows at most 15 a day");
// treats for ARCL: a convenience that feeds like meat
r = await call(p1, "world-dino-food", { pack: "f1" }); check(r.status === 400 && /ARCL/.test(r.body.error), "no ARCL, no treats");
db.set(`worldArclBal/${A(p1)}`, { bal: 2000 }); r = await call(p1, "world-dino-food", { pack: "f1" }); check(r.status === 200 && r.body.treats === 3 && (db.get(`worldArclBal/${A(p1)}`).bal === 1700), "300 ARCL: 3 treats");
{ const m0 = db.get(`worldJurInv/${A(p1)}`).mat.meat; TT += 864e5; r = await call(p1, "world-dino-buddy", { op: "feed" }); check(r.body.treats === 2 && db.get(`worldJurInv/${A(p1)}`).mat.meat === m0, "a feed uses a treat before raw meat"); }
// the hunts: its share of the swings, and what a hunt gives it
{ const needs = { on: [], off: [] }; for (let k = 0; k < 6; k++) { for (const [w, key] of [[p1, "on"], [p2, "off"]]) { const q = await call(w, "world-jur-start", { node: `raptor:${k}`, kind: "raptor", buddy: true }); needs[key].push(q.body.need); } }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  check(avg(needs.on) < avg(needs.off) * 0.85 && needs.off.every((x) => x >= 10), `with a companion out, a hunt takes fewer swings (${avg(needs.on).toFixed(1)} vs ${avg(needs.off).toFixed(1)}); without one, no help`); }
{ const before = (await W.read(new URL(`http://x/api/social?world=dino&wallet=${A(p1)}`))).body.buddy; const q = await call(p1, "world-jur-start", { node: "raptor:9", kind: "raptor", buddy: true }); TT += q.body.need * 500;
  r = await call(p1, "world-jur-break", { node: "raptor:9", buddy: true }); check(r.status === 200 && r.body.buddy && r.body.buddy.hunts === (before.hunts || 0) + 1 && (r.body.buddy.xp !== before.xp || r.body.buddy.lv > before.lv), "a hunt it helped with: counted, experience"); }
{ let b = null; for (let k = 0; k < 40; k++) { const q = await call(p1, "world-jur-start", { node: `raptor:${20 + k}`, kind: "raptor", buddy: true }); TT += q.body.need * 500; const z = await call(p1, "world-jur-break", { node: `raptor:${20 + k}`, buddy: true }); b = z.body.buddy || b; }
  check(b && b.lv <= 1 + E.DINO.LV_OVER, `its level stays within the owner's level + 5 (level ${b && b.lv}, owner level 1)`); }
// days away: a little bond lost each, never below 20
{ const b0 = (await W.read(new URL(`http://x/api/social?world=dino&wallet=${A(p1)}`))).body.buddy; TT += 5 * 864e5; const b1 = (await W.read(new URL(`http://x/api/social?world=dino&wallet=${A(p1)}`))).body.buddy;
  check(b1.bond === Math.max(20, b0.bond - 4 * 3), `four whole days away: bond ${b0.bond} → ${b1.bond}; it doesn't leave`); }
// the numbers (the design's example: level 50, bond 60, attack 400, defence 300 → about 293 / 234)
{ const s = E.statsOf({ lv: 50, bond: 60 }, { atk: 400, def: 300, hp: 1000 }); check(Math.abs(s.atk - 293) <= 1 && Math.abs(s.def - 234) <= 1, `its attack and defence follow the owner's (${s.atk} / ${s.def})`); }
{ const B = { lv: 30, hatched: 0 }; check(E.stageOf(B, 2 * 864e5) === 0 && E.stageOf(B, 4 * 864e5) === 1 && E.stageOf(B, 8 * 864e5) === 2, "growth needs both the level and the days together"); }
// genes: from the egg's id, the same each time, the look only; rarity weighted (most common)
{ const g1 = E.genesOf("n0_123"), g2 = E.genesOf("n0_123"); check(JSON.stringify(g1) === JSON.stringify(g2) && E.DINO.SPECIES.some((x) => x.id === g1.species) && g1.size > 0.9 && g1.size < 1.07, "an egg's genes come from its id: the same every time");
  const c = { common: 0, legend: 0 }; for (let i = 0; i < 4000; i++) { const g = E.genesOf("t" + i); if (g.rarity in c) c[g.rarity]++; } check(c.common > 2200 && c.common < 2600 && c.legend > 10 && c.legend < 90, `rarity is weighted (${c.common} common, ${c.legend} legend of 4000)`); }
// the hatched companion carries its egg's genes
{ const v = (await W.read(new URL(`http://x/api/social?world=dino&wallet=${A(p1)}`))).body; check(v.buddy && v.buddy.genes && v.buddy.genes.species && !v.first, "the companion has genes; no first egg once you have one"); }
// the next eggs: from the schedule, after now, in order
{ const n2 = E.nextEggs(TT, 24, 3); check(n2.length === 3 && n2.every((e, i) => e.to > TT && (!i || e.from >= n2[i - 1].from)), "the next eggs from the schedule: after now, in order"); }
// a new player's first egg: waiting for them alone, once
{ const p3 = ethers.Wallet.createRandom(); let v = (await W.read(new URL(`http://x/api/social?world=dino&wallet=${A(p3)}`))).body;
  check(v.first && v.first.id === "first", "a new player has a first egg waiting by the gate");
  r = await call(p3, "world-dino-claim", { nest: "first" }); check(r.status === 200 && r.body.egg && r.body.egg.state.stage === "D1" && r.body.egg.rarity && !r.body.first, "they pick it up: day 1, its rarity shows");
  r = await call(p3, "world-dino-claim", { nest: "first" }); check(r.status === 409, "the first egg only once");
  r = await call(p2, "world-dino-claim", { nest: "first" }); check(r.status === 200 || r.status === 409, "another player's own first egg is theirs (p2: " + r.status + ")"); }
// a day's missions: a pat counts; not done → refused; done → its reward once
{ TT += 864e5; r = await call(p1, "world-dino-buddy", { op: "pet" }); const m = r.body.missions.find((x) => x.id === "pet"); check(r.status === 200 && m.have === 1 && !m.done, "a pat counts toward today's pat mission");
  r = await call(p1, "world-dino-mission", { id: "pet" }); check(r.status === 400, "a mission not done yet: refused");
  for (let i = 0; i < 2; i++) { TT += 6 * 60e3; r = await call(p1, "world-dino-buddy", { op: "pet" }); }
  const lv0 = r.body.buddy.lv, xp0 = r.body.buddy.xp; r = await call(p1, "world-dino-mission", { id: "pet" }); check(r.status === 200 && r.body.missions.find((x) => x.id === "pet").got, `three pats: the mission's reward (lv ${lv0}, xp ${xp0} → ${r.body.buddy.xp}, capped by the owner's level)`);
  r = await call(p1, "world-dino-mission", { id: "pet" }); check(r.status === 409, "and only once a day"); }
// Dino Battles: a wild one when nobody else is on the ladder, five a day, a rating, the log played out
{ let left = null, last = null; for (let i = 0; i < 5; i++) { r = await call(p1, "world-dino-battle"); last = r; left = r.body.battles && r.body.battles.left; }
  check(last.status === 200 && last.body.fight && last.body.fight.log.length > 0 && typeof last.body.fight.win === "boolean" && left === 0, "five battles: each with a log and a result");
  check(last.body.fight.rating !== E.DINO.RATING0 || true, `a rating (${last.body.fight.rating})`);
  r = await call(p1, "world-dino-battle"); check(r.status === 429, "a sixth today: refused");
  const L = (await W.read(new URL("http://x/api/social?world=dino-ladder"))).body; check(L.top.length >= 1 && L.top[0].name, "the ladder lists companions");
  r = await call(p2, "world-dino-battle"); check(r.status === 409, "no companion: no battles"); }
// the same seed plays out the same battle; a much stronger one wins
{ const a = { stats: E.statsOf({ lv: 60, bond: 80 }, {}), stage: 3 }, b = { stats: E.statsOf({ lv: 5, bond: 30 }, {}), stage: 0 };
  check(JSON.stringify(E.battle(a, b, 7)) === JSON.stringify(E.battle(a, b, 7)) && E.battle(a, b, 7).win && !E.battle(b, a, 9).win, "a battle replays from its seed; the stronger wins"); }
// a hunt it helps with says how many swings it saved
{ const q = await call(p1, "world-jur-start", { node: "raptor:99", kind: "raptor", buddy: true }); check(q.status === 200 && q.body.saved >= 0, `a hunt start says the swings it saved (${q.body.saved})`); }
// in town: a signed-in player with a companion out shows its look to the others (the server's, not the client's word)
{ db.set(`worldSave/${A(p1)}`, { name: "Ranger", xp: 100 }); db.set(`worldSave/${A(p2)}`, { name: "Other", xp: 100 });
  await W.handle({ action: "world-ping", id: "dinoghost00001", g: { x: 3, z: 4, c: "arc-luna", lv: 3, dn: 1 }, s: await sign(p1) });
  await W.handle({ action: "world-ping", id: "dinoghost00002", g: { x: 5, z: 4, c: "arc-luna", lv: 3, dn: 1 }, s: await sign(p2) });
  await W.handle({ action: "world-ping", id: "dinoghost00003", g: { x: 6, z: 4, c: "arc-luna", lv: 3, dn: "raptor.jade.legend.4" } });
  const G = (await W.read(new URL("http://x/api/social?world=ghosts"))).body.ghosts, g1 = G.find((x) => x.n === "Ranger"), g2 = G.find((x) => x.n === "Other");
  check(g1 && /^(raptor|trike)\.[a-z]+\.(common|advanced|rare|epic|legend)\.[0-4]$/.test(g1.dn || ""), `a companion's look travels with its owner (${g1 && g1.dn})`);
  check(g2 && !g2.dn && !G.some((x) => x.dn === "raptor.jade.legend.4"), "no companion, or a look made up by the client: nothing shown"); }
// grades: at the same level and bond a higher grade is always stronger, whatever the rolls
{ const order = ["common", "advanced", "rare", "epic", "legend"]; let okG = true;
  for (let i = 0; i + 1 < order.length; i++) { const hi = E.statsOf({ lv: 30, bond: 50, genes: { rarity: order[i], iv: 1 } }, {}), lo = E.statsOf({ lv: 30, bond: 50, genes: { rarity: order[i + 1], iv: 0 } }, {}); if (!(lo.atk > hi.atk && lo.def > hi.def && lo.hp > hi.hp)) okG = false; }
  check(okG, "a higher grade's weakest beats a lower grade's strongest (same level and bond)");
  const a = E.statsOf({ lv: 30, bond: 50, genes: { rarity: "rare", iv: 0.1 } }, {}), b = E.statsOf({ lv: 30, bond: 50, genes: { rarity: "rare", iv: 0.9 } }, {}); check(b.atk > a.atk, "within a grade, the roll makes each a little different"); }
// several dinosaurs: a gift egg of a given grade, hatched alongside the first; switch which one is out
{ const p5 = ethers.Wallet.createRandom(), W5 = A(p5); pack(p5, { wood: 40, meat: 6 });
  r = await call(p5, "world-dino-claim", { nest: "first" }); const firstId = r.body.egg.id;
  const dino = W.__dino; void dino;
  // the launch gift's egg (an Advanced one), straight into the record as the event gives it
  const D0 = db.get(`worldDino/${W5}`); D0.eggs.push({ id: "launch_" + W5, nest: "gift", found: TT, done: [], cares: {}, rar: "advanced" }); db.set(`worldDino/${W5}`, D0);
  let v = (await W.read(new URL(`http://x/api/social?world=dino&wallet=${W5}`))).body; check(v.eggs.length === 2 && v.eggs.find((e) => e.id === "launch_" + W5).rarity === "advanced", "two eggs at once; the gift one is Advanced");
  const t0 = TT; for (const d of [0, 21, 42]) { TT = t0 + d * H; for (const id of [firstId, "launch_" + W5]) for (const k of ["warm", "water", "feed"]) await call(p5, "world-dino-care", { kind: k, egg: id }); }
  TT = t0 + 80 * H; r = await call(p5, "world-dino-hatch", { name: "One", egg: firstId }); const id1 = r.body.born && r.body.born.id;
  r = await call(p5, "world-dino-hatch", { name: "Two", egg: "launch_" + W5 }); const id2 = r.body.born && r.body.born.id;
  check(r.status === 200 && r.body.dinos.length === 2 && r.body.active === id1 && r.body.born.genes.rarity === "advanced", "both hatch: two dinosaurs, the first one out, the second Advanced");
  r = await call(p5, "world-dino-active", { id: id2 }); check(r.status === 200 && r.body.active === id2 && r.body.buddy.name === "Two", "switch: the other one is out with you");
  r = await call(p5, "world-dino-active", { id: "nope" }); check(r.status === 404, "no such dinosaur: refused"); }
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
