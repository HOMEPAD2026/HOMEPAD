// raidq.test.mjs — RAID QUEENS (api/_world-raidq.mjs): everyone's HP per queen, reports capped by level and spaced 5 s,
// the level gate, the fall and the comeback 20 min later, everyone with ≥ 3 % sharing (top 3 more), one paid claim a queen a
// Seoul day, the chronicle's clears; the game's copy of the rules. On an in-memory store. Run: node tests/world/raidq.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { xpAt, XP_VERSION } = await import("../../api/_world-social.mjs");
const { RQ, rewardOf, phaseOf, seoulDay } = await import("../../api/_world-raidq.mjs");
const D = await import("../../world-raidq-data.js");
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
const view = async (w) => (await W.read(new URL("https://x/api/social?world=rq" + (w ? "&wallet=" + w.address : "")))).body;

check(JSON.stringify(RQ) === JSON.stringify(D.RQ), "the game's rules are the server's (world-raidq-data.js)");
check(phaseOf(600000, 600000) === 1 && phaseOf(360000, 600000) === 2 && phaseOf(359999, 600000) === 2 && phaseOf(150000, 600000) === 3 && D.phaseOf(150000, 600000) === 3, "phases at 60 % and 25 %");
{ const a = rewardOf("nyxara", 0, "0xabc", 3), b = rewardOf("nyxara", 1, "0xabc", 3), z = rewardOf("nyxara", 7, "0xabc", 3);
  check(a.arcl === 25000 && a.item.r === 4 && a.item.p === 5 && a.item.lv === 300 && /-4$/.test(a.item.b), "Nyxara's first: 25,000 ARCL, a Legendary +5 Lv 300 piece");
  check(b.arcl === 15000 && b.item.p === 4 && z.arcl === 6250 && z.item.r === 3 && z.item.p === 2, "2nd 60 % +4 · the 8th: 25 % and an Epic +2");
  check(JSON.stringify(rewardOf("lysitha", 2, "0x1", 0)) === JSON.stringify(rewardOf("lysitha", 2, "0x1", 0)) && /^[a-z0-9]{4,10}$/.test(a.item.id), "the same reward every time, a save-safe id"); }

T = Date.parse("2026-10-24T03:00:00Z");
const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), C = ethers.Wallet.createRandom(), Dw = ethers.Wallet.createRandom(), Ew = ethers.Wallet.createRandom(), low = ethers.Wallet.createRandom();
lvSet(A, 160, "Ace"); lvSet(B, 140, "Bee"); lvSet(C, 120, "Cee"); lvSet(Dw, 110, "Dee"); lvSet(Ew, 105, "Eve"); lvSet(low, 60, "Low");
{ const X = ethers.Wallet.createRandom(); lvSet(X, 200, "Ex"); const r0 = await call(X, "world-rq-hit", { queen: "lysitha", dmg: 10 }), c0 = await call(X, "world-rq-claim", { queen: "lysitha", cyc: 0 });
  check(!RQ.OPEN && r0.status === 403 && c0.status === 403, "closed (GM wallets only): a player's hits and claims are refused"); }
RQ.OPEN = true; // (the rest: as when it opens to everyone)
let v = await view(null); check(v.queens.length === 3 && v.queens.every((q) => q.hp === q.max && !q.down && q.phase === 1 && q.cyc === 0), "the guest view: three queens at full HP");
let r = await call(low, "world-rq-hit", { queen: "lysitha", dmg: 100 }); check(r.status === 403 && r.body.need === 100, "Lv 60 can't fight Lysitha (Lv 100+)");
r = await call(A, "world-rq-hit", { queen: "solvira", dmg: 100 }); check(r.status === 403 && r.body.need === 200, "Lv 160 can't fight Solvira (200+)");
r = await call(A, "world-rq-hit", { queen: "nope", dmg: 1 }); check(r.status === 400, "an unknown queen");
r = await call(A, "world-rq-hit", { queen: "lysitha", dmg: 9e9 }); check(r.status === 200 && r.body.counted === 60 * 160, "a report is capped at 60 × level");
r = await call(A, "world-rq-hit", { queen: "lysitha", dmg: 10 }); check(r.status === 429, "one report every 5 s");
const hitN = async (w, n, q = "lysitha") => { let s = 0; for (let i = 0; i < n; i++) { T += 5000; const x = await call(w, "world-rq-hit", { queen: q, dmg: 9e9 }); s += x.body.counted || 0; } return s; };
await hitN(A, 22); await hitN(B, 12); await hitN(C, 6); await hitN(Ew, 1); // Eve: 6,300 = 1.05 % — under 3 %
v = await view(A); let L = v.queens.find((q) => q.id === "lysitha");
check(L.hp === 600000 - (23 * 9600 + 12 * 8400 + 6 * 7200 + 6300) && L.phase === 2 && L.top[0].name === "Ace" && L.top[0].me, `everyone's HP (${L.hp}), phase 2, Ace on top`);
r = await call(A, "world-rq-claim", { queen: "lysitha", cyc: 0 }); check(r.status === 400, "no reward before she falls");
let left = L.hp, guard = 0; while (left > 0 && guard++ < 80) { T += 5000; const x = await call(Dw, "world-rq-hit", { queen: "lysitha", dmg: 9e9 }); left = x.body.queens.find((q) => q.id === "lysitha").hp; }
v = await view(Dw); L = v.queens.find((q) => q.id === "lysitha");
check(L.down && L.hp === 0 && L.back === T + 20 * 60e3, "she falls; back in 20 minutes");
r = await call(A, "world-rq-hit", { queen: "lysitha", dmg: 100 }); check(r.status === 200 && r.body.counted === 0, "no more hits while she's down");
const wins = v.wins.filter((x) => x.queen === "lysitha"); check(wins.length === 1 && wins[0].rank >= 1, "Dee (who finished her) has a share");
v = await view(Ew); check(!v.wins.length, "Eve (1 %) has no share");
const b0 = bal(A); r = await call(A, "world-rq-claim", { queen: "lysitha", cyc: 0 });
const rankA = r.body.rank; check(r.status === 200 && r.body.arcl > 0 && r.body.item && r.body.today === 1 && bal(A) - b0 === r.body.arcl, `Ace's share paid (${r.body.arcl} ARCL, place ${rankA})`);
r = await call(A, "world-rq-claim", { queen: "lysitha", cyc: 0 }); check(r.body.again && bal(A) - b0 === r.body.arcl, "asked again: the same back, not paid twice");
r = await call(Ew, "world-rq-claim", { queen: "lysitha", cyc: 0 }); check(r.status === 403, "Eve can't claim");
v = await view(A); check(v.wins[0].claimed && (v.clears.lysitha || 0) === 1, "claimed; the chronicle counts a clear");
// she comes back 20 minutes later: a new cycle at full HP
T += 20 * 60e3 + 1000; v = await view(A); L = v.queens.find((q) => q.id === "lysitha"); check(!L.down && L.hp === L.max && L.cyc === 1, "20 minutes on: back at full HP (cycle 1)");
r = await call(A, "world-rq-hit", { queen: "lysitha", dmg: 9e9 }); check(r.body.counted === 9600, "the new cycle takes hits");
left = 1, guard = 0; while (left > 0 && guard++ < 80) { T += 5000; const x = await call(A, "world-rq-hit", { queen: "lysitha", dmg: 9e9 }); left = x.body.queens.find((q) => q.id === "lysitha").hp; }
const b1 = bal(A); r = await call(A, "world-rq-claim", { queen: "lysitha", cyc: 1 });
check(r.status === 200 && r.body.today === 0 && r.body.arcl === 0 && bal(A) === b1, "the second fall the same Seoul day: counted, not paid again");
v = await view(A); check((v.clears.lysitha || 0) === 2, "two clears in the chronicle");
check(seoulDay(Date.parse("2026-10-24T14:59:00Z")) === "2026-10-24" && seoulDay(Date.parse("2026-10-24T15:00:00Z")) === "2026-10-25", "the Seoul day turns at 15:00 UTC");
r = await call(A, "world-rq-claim", { queen: "lysitha", cyc: 9 }); check(r.status === 400, "a fall that hasn't happened");
const ld = (db.get(`worldArclTx/${A.address.toLowerCase()}`) || db.get(`worldArclLog/${A.address.toLowerCase()}`) || null); check(ld !== undefined, "ledger noted");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
