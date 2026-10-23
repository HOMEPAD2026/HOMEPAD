// pumpking.test.mjs — the Halloween Pumpkin Kings (api/_world-halloween.mjs): nights on the US Eastern clock (20:00–05:00,
// across the 1 November clock change), 14 nights from 22 October; everyone's HP, reports capped by level and spaced 5 s,
// the level gate (the king's − 10), the fall once a night, the top 3 sharing its reward (ARCL outside the daily cap, in
// the ledger; a +piece of gear, Jack's Inferno Blade for Lv 95's first), a claim paid once; the game's copy of the rules.
// On an in-memory store. Run: node tests/world/pumpking.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { xpAt, XP_VERSION } = await import("../../api/_world-social.mjs");
const { PK, nightOf, dayOn, rewardOf, etAt } = await import("../../api/_world-halloween.mjs");
const D = await import("../../world-pumpking-data.js");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
const ET = (iso) => Date.parse(iso); // ISO with its own offset
let T = ET("2026-10-22T21:00:00-04:00");
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const lvSet = (w, lv, name) => db.set(`worldSave/${w.address.toLowerCase()}`, { xp: xpAt(lv), xpv: XP_VERSION, name });
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const view = async (w) => (await W.read(new URL("https://x/api/social?world=pk" + (w ? "&wallet=" + w.address : "")))).body;

// the game's copy
check(JSON.stringify(PK) === JSON.stringify(D.PK), "the game's rules are the server's (world-pumpking-data.js)");
for (const t of [ET("2026-10-22T19:59:00-04:00"), ET("2026-10-22T20:00:00-04:00"), ET("2026-10-23T04:59:00-04:00"), ET("2026-11-01T01:30:00-05:00"), ET("2026-11-04T23:00:00-05:00"), ET("2026-11-05T21:00:00-05:00")])
  check(JSON.stringify(nightOf(t)) === JSON.stringify(D.nightOf(t)), "the game's night is the server's at " + new Date(t).toISOString());

// the clock (US Eastern)
check(!nightOf(ET("2026-10-22T19:59:00-04:00")).on && nightOf(ET("2026-10-22T20:00:00-04:00")).on, "the first night starts 22 Oct 20:00 ET");
check(nightOf(ET("2026-10-23T04:59:00-04:00")).id === "2026-10-22" && !nightOf(ET("2026-10-23T05:00:00-04:00")).on, "it ends at 05:00, still the 22nd's night");
check(nightOf(ET("2026-10-22T12:00:00-04:00")).next === ET("2026-10-22T20:00:00-04:00"), "by day: the next night's start");
check(nightOf(ET("2026-11-01T22:00:00-05:00")).id === "2026-11-01" && nightOf(ET("2026-11-01T22:00:00-05:00")).at === ET("2026-11-02T05:00:00-05:00"), "after the clock change (EST): 22:00 is night, it ends 05:00 EST");
check(etAt("2026-11-01", 20) === ET("2026-11-01T20:00:00-05:00") && etAt("2026-10-31", 20) === ET("2026-10-31T20:00:00-04:00"), "20:00 on both sides of the clock change");
check(nightOf(ET("2026-11-04T21:00:00-05:00")).on && !nightOf(ET("2026-11-05T21:00:00-05:00")).on && nightOf(ET("2026-11-05T21:00:00-05:00")).next === 0, "14 nights: the last starts 4 Nov; none after");
check(!dayOn(ET("2026-10-21T23:00:00-04:00")) && dayOn(ET("2026-10-22T08:00:00-04:00")) && dayOn(ET("2026-11-05T23:00:00-05:00")) && !dayOn(ET("2026-11-06T00:30:00-05:00")), "the kings walk the town 22 Oct – 5 Nov");
{ let n = 0; for (let d = 0; d < 20; d++) if (nightOf(ET("2026-10-22T22:00:00-04:00") + d * 864e5).on) n++; check(n === 14, `14 event nights (${n})`); }

// rewards
{ const a = rewardOf("k95", 0, "0xabc", "2026-10-22"), b = rewardOf("k95", 1, "0xabc", "2026-10-22"), c = rewardOf("k95", 2, "0xabc", "2026-10-22");
  check(a.arcl === 30000 && a.item.r === 4 && a.item.p === 5 && a.item.u === "jack" && a.item.b === "weapon-4", "Lv 95's first: 30,000 ARCL and Jack's Inferno Blade (Legendary +5)");
  check(b.arcl === 18000 && b.item.p === 4 && !b.item.u && c.arcl === 12000 && c.item.p === 3, "2nd: 60% and +4 · 3rd: 40% and +3");
  check(rewardOf("k15", 0, "0x1", "n").item.b.endsWith("-3") && rewardOf("k15", 0, "0x1", "n").item.r === 2, "Lv 15: a Rare piece of the Lv 15 tier");
  check(/^[a-z0-9]{4,10}$/.test(a.item.id) && JSON.stringify(rewardOf("k55", 1, "0xabc", "x")) === JSON.stringify(rewardOf("k55", 1, "0xabc", "x")), "the item's id is a save-safe id, the same every time"); }

// the fight
const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), C = ethers.Wallet.createRandom(), Dw = ethers.Wallet.createRandom(), low = ethers.Wallet.createRandom();
lvSet(A, 95, "Ace"); lvSet(B, 92, "Bee"); lvSet(C, 88, "Cee"); lvSet(Dw, 90, "Dee"); lvSet(low, 40, "Low");
T = ET("2026-10-22T12:00:00-04:00");
let r = await call(A, "world-pk-hit", { king: "k95", dmg: 100 }); check(r.status === 400, "no fighting by day");
let v = await view(A); check(v.on && !v.night.on && v.kings.length === 5 && v.night.next === ET("2026-10-22T20:00:00-04:00"), "the day view: in town, the night's start");
T = ET("2026-10-22T21:00:00-04:00");
r = await call(low, "world-pk-hit", { king: "k95", dmg: 100 }); check(r.status === 403 && r.body.need === 85, "Lv 40 can't fight the Lv 95 king (85+)");
r = await call(low, "world-pk-hit", { king: "k35", dmg: 99999 }); check(r.status === 200 && r.body.counted === 60 * 40, "a report is capped at 60 × level");
r = await call(low, "world-pk-hit", { king: "k35", dmg: 10 }); check(r.status === 429, "one report every 5 s");
r = await call(A, "world-pk-hit", { king: "nope", dmg: 10 }); check(r.status === 400, "an unknown king");
// A, B, C, D hit the Lv 95 king down (285,000): A most, then B, C; D a little
const hitN = async (w, n) => { let s = 0; for (let i = 0; i < n; i++) { T += 5000; const x = await call(w, "world-pk-hit", { king: "k95", dmg: 99999 }); s += x.body.counted || 0; } return s; };
await hitN(A, 20); await hitN(B, 14); await hitN(C, 8); await hitN(Dw, 1);
v = await view(A); const k95 = v.kings.find((k) => k.id === "k95");
check(k95.hp === 285000 - (20 * 5700 + 14 * 5520 + 8 * 5280 + 5400) && !k95.down, `everyone's HP goes down (${k95.hp} left)`);
check(k95.top[0].name === "Ace" && k95.top[0].me && k95.top.length === 4, "the board: Ace first");
r = await call(A, "world-pk-claim", { king: "k95" }); check(r.status === 400, "no reward before it falls");
let left = k95.hp, guard = 0; while (left > 0 && guard++ < 50) { T += 5000; const x = await call(A, "world-pk-hit", { king: "k95", dmg: 99999 }); left = x.body.kings.find((k) => k.id === "k95").hp; }
v = await view(A); check(v.kings.find((k) => k.id === "k95").down && v.wins.length === 1 && v.wins[0].rank === 1 && !v.wins[0].claimed, "it fell: Ace's win waits");
T += 5000; r = await call(B, "world-pk-hit", { king: "k95", dmg: 5000 }); check(r.status === 200 && r.body.counted === 0, "a fallen king takes no more damage");
const a0 = bal(A); r = await call(A, "world-pk-claim", { king: "k95" });
check(r.status === 200 && r.body.rank === 1 && r.body.arcl === 30000 && r.body.credited === 30000 && bal(A) - a0 === 30000, "Ace: 30,000 ARCL (outside the 10,000 daily cap)");
check(r.body.item.u === "jack" && r.body.item.p === 5 && r.body.item.r === 4, "and Jack's Inferno Blade +5");
const ledger = [...db.entries()].filter(([k, x]) => k.startsWith("worldArclTx/") && x && x.k === "halloween");
check(ledger.length >= 1, "the ARCL is in the ledger as halloween");
r = await call(A, "world-pk-claim", { king: "k95" }); check(r.status === 200 && r.body.again && r.body.credited === 0 && bal(A) - a0 === 30000 && r.body.item.u === "jack", "asked again: the same reward back, paid once");
r = await call(B, "world-pk-claim", { king: "k95" }); check(r.body.rank === 2 && r.body.credited === 18000 && r.body.item.p === 4, "Bee 2nd: 18,000 and +4");
r = await call(C, "world-pk-claim", { king: "k95" }); check(r.body.rank === 3 && r.body.credited === 12000, "Cee 3rd: 12,000");
r = await call(Dw, "world-pk-claim", { king: "k95" }); check(r.status === 403, "4th: no reward");
// the next night: back at full HP; last night's reward still claimable the next day
T = ET("2026-10-23T21:00:00-04:00"); v = await view(A); check(v.night.id === "2026-10-23" && !v.kings.find((k) => k.id === "k95").down && v.kings.find((k) => k.id === "k95").hp === 285000, "the next night: back at full HP");
r = await call(B, "world-pk-claim", { king: "k95", night: "2026-10-22" }); check(r.status === 200 && r.body.again, "yesterday's claim stays (asked again)");
r = await call(A, "world-pk-claim", { king: "k95", night: "2026-10-01" }); check(r.status === 400, "an old night's rewards are gone");
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
