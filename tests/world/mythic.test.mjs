// mythic.test.mjs — the Crimson Celestial set (world-mythic-data.js, api/_world-mythic.mjs): pieces' stats, the set's
// five stacking bonuses (different slots only), a RAID QUEENS win's roll at each dungeon's rate, the piece kept on the
// server with its level to wear, wearing it (yours, your level, its slot), the SECRET's pieces worn from Lv 100.
// On an in-memory store. Run: node tests/world/mythic.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { xpAt, XP_VERSION } = await import("../../api/_world-social.mjs");
const { GM_WALLETS } = await import("../../api/_world-village.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const { RQ } = await import("../../api/_world-raidq.mjs");
const { CC, mythicStats, setBonus, pieceOf } = await import("../../world-mythic-data.js");
const { itemStats } = await import("../../world-rpg-data.js");
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-10-25T03:00:00Z"), R = []; const rand = () => (R.length ? R.shift() : 0.99); // (queued rolls: the drop, then the piece)
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, rand });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const lvSet = (w, lv, name) => db.set(`worldSave/${w.address.toLowerCase()}`, { xp: xpAt(lv), xpv: XP_VERSION, name });
const mine = async (w) => (await W.read(new URL("https://x/api/social?world=mythic&wallet=" + w.address))).body;

// the numbers
check(CC.PIECES.length === 6 && new Set(CC.PIECES.map((p) => p.slot)).size === 6, "six pieces, six different slots");
check(CC.DROP.lysitha.rate === 0.01 && CC.DROP.solvira.rate === 0.02 && Math.abs(CC.DROP.nyxara.rate - 1 / 30) < 1e-12 && CC.DROP.throne.rate === 0.1 && CC.DROP.secret.rate === 0.2, "drop rates 1 % · 2 % · 1/30 · 10 % · 20 %");
check(CC.DROP.secret.req === 100 && CC.DROP.throne.req === 400, "the SECRET's pieces are worn from Lv 100, the Throne's from 400");
{ const leg = itemStats({ b: "weapon-4", r: 4, lv: 100, p: 0 }).atk, m1 = mythicStats({ def: "CC_WEAPON", mult: 1 }).atk, m4 = mythicStats({ def: "CC_WEAPON", mult: 2.8, plus: 15 }).atk;
  check(m1 > leg && m4 > m1 * 2.8, `a Mythic weapon beats the best Legendary (${m1} > ${leg}); Lv 400 +15: ${m4}`); }
check(mythicStats({ def: "CC_RING", mult: 3.2 }).crit <= 55, `critical stays under its cap of 60 (${mythicStats({ def: "CC_RING", mult: 3.2 }).crit})`);
{ const w = (d) => ({ def: d }), b1 = setBonus([w("CC_WEAPON")]), b2 = setBonus([w("CC_WEAPON"), w("CC_WEAPON")]), b3 = setBonus([w("CC_WEAPON"), w("CC_ARMOR"), w("CC_HELMET")]), b6 = setBonus(CC.PIECES.map((p) => w(p.id)));
  check(b1.n === 1 && !b1.active.length && b2.n === 1 && !b2.active.length, "two of the same slot count once");
  check(b3.active.length === 2 && b3.stats.atkPct === 5 && b3.stats.crit === 10, "three pieces: two bonuses");
  check(b6.active.length === 5 && b6.stats.atkPct === 15 && b6.stats.skillPct === 30 && b6.stats.critDmg === 25 && b6.stats.dr === 10 && b6.stats.aura === 1, "six pieces: all five bonuses stack (Crimson Ascension)"); }

// a RAID QUEENS win rolls once
const A = ethers.Wallet.createRandom(); GM_WALLETS.push(A.address.toLowerCase()); RQ.OPEN = true;
const win = async (w, mode, rolls) => { const r0 = await call(w, "world-rq-start", { mode }); T += (RQ.MODES.concat([RQ.SECRET]).find((m) => m.id === mode).min + 5) * 1000; R = rolls.slice(); const r = await call(w, "world-rq-end", { run: r0.body.run, won: true, kills: 40 }); return r.body; };
lvSet(A, 120, "Aria");
let r = await win(A, "lysitha", [0.5]); check(r.ok && !r.mythic, "a roll above 1 % at Lv 100: nothing");
r = await win(A, "lysitha", [0.005, 0.0]); check(r.ok && r.mythic && r.mythic.def === "CC_WEAPON" && r.mythic.req === 100 && r.mythic.mult === 1 && r.mythic.state === "GAME_OWNED", "a roll under 1 %: Crimsonfall Reaper, worn from 100");
const id1 = r.mythic.id; check(db.get(`worldMythic/${id1}`).owner === A.address.toLowerCase(), "the piece is kept on the server, with its owner");
r = await win(A, "secret", [0.19, 0.99]); check(r.ok && r.mythic && r.mythic.def === "CC_BOOTS" && r.mythic.req === 100 && r.mythic.mult === 3.2, "the SECRET: 20 %, Skywalker Boots worn from 100 at ×3.2");
{ const m = await mine(A); check(m.pieces.length === 2, "the owner's list has both pieces"); }

// wearing one
r = await call(A, "world-mythic-equip", { slot: "weapon", id: id1 }); check(r.status === 200 && r.body.eq.weapon === id1, "Aria wears the Reaper");
r = await call(A, "world-mythic-equip", { slot: "armor", id: id1 }); check(r.status === 400, "not in another slot");
const B = ethers.Wallet.createRandom(); lvSet(B, 450, "Bo");
r = await call(B, "world-mythic-equip", { slot: "weapon", id: id1 }); check(r.status === 403, "someone else's piece: refused");
{ const id4 = "m" + "t4est000"; db.set(`worldMythic/${id4}`, { id: id4, def: "CC_HELMET", owner: A.address.toLowerCase(), req: 400, mult: 2.8, plus: 0, state: "GAME_OWNED" }); const own = db.get(`worldMythicOwn/${A.address.toLowerCase()}`); own.ids.push(id4); db.set(`worldMythicOwn/${A.address.toLowerCase()}`, own);
  r = await call(A, "world-mythic-equip", { slot: "helm", id: id4 }); check(r.status === 403 && r.body.need === 400, "a Lv 400 piece at Lv 120: refused"); }
r = await call(A, "world-mythic-equip", { slot: "weapon", id: null }); check(r.status === 200 && !r.body.eq.weapon, "taken off");
// b5: enhancing, salvaging, the market
{ const { enhCost, essOf } = await import("../../world-mythic-data.js"); const a = A.address.toLowerCase(), b = B.address.toLowerCase();
  db.set(`worldArclBal/${a}`, { bal: 100000 }); db.set(`worldArclBal/${b}`, { bal: 20000 });
  check(enhCost(0).rate === 1 && enhCost(5).rate === 0.75 && enhCost(10).rate === 0.4 && enhCost(14).rate >= 0.15, "the chance: sure to +5, then 75 % → 40 % → lower");
  r = await call(A, "world-mythic-enhance", { id: id1 }); check(r.status === 400 && /Essence/.test(r.body.error), "no Essence: refused");
  r = await call(A, "world-mythic-salvage", { id: "mt4est000" }); check(r.status === 200 && r.body.gain === essOf({ src: undefined, plus: 0 }) && db.get("worldMythic/mt4est000").state === "SALVAGED", `salvage: +${r.body.gain} Essence, the piece is gone`);
  { const own = db.get(`worldMythicOwn/${a}`); own.ess = 200; db.set(`worldMythicOwn/${a}`, own); }
  R = [0.5]; r = await call(A, "world-mythic-enhance", { id: id1 }); check(r.status === 200 && r.body.hit && r.body.plus === 1 && r.body.ess === 200 - enhCost(0).ess && db.get(`worldArclBal/${a}`).bal === 100000 - enhCost(0).arcl, "+0 → +1: Essence and ARCL spent");
  { const pc = db.get(`worldMythic/${id1}`); pc.plus = 6; db.set(`worldMythic/${id1}`, pc); }
  T += 2000; R = [0.95]; r = await call(A, "world-mythic-enhance", { id: id1 }); check(r.status === 200 && !r.body.hit && r.body.plus === 6 && db.get(`worldMythic/${id1}`).plus === 6, "a miss at +6 keeps the +");
  r = await call(A, "world-mythic-list", { id: id1, price: 500 }); check(r.status === 400, "a price under 1,000: refused");
  r = await call(A, "world-mythic-equip", { slot: "weapon", id: id1 });
  r = await call(A, "world-mythic-list", { id: id1, price: 10000 }); check(r.status === 200 && db.get(`worldMythic/${id1}`).state === "GAME_LISTED" && !(db.get(`worldMythicOwn/${a}`).eq || {}).weapon, "listed for 10,000: taken off, not wearable");
  r = await call(A, "world-mythic-equip", { slot: "weapon", id: id1 }); check(r.status === 409, "a listed piece can't be worn");
  { const m = (await W.read(new URL("https://x/api/social?world=mythic-market"))).body; check(m.items.length === 1 && m.items[0].price === 10000 && !/^0x[0-9a-f]{40}$/.test(m.items[0].seller), "the market lists it (the seller's wallet shortened)"); }
  r = await call(A, "world-mythic-buy", { id: id1 }); check(r.status === 400, "your own piece: refused");
  const sellerBefore = db.get(`worldArclBal/${a}`).bal;
  r = await call(B, "world-mythic-buy", { id: id1 }); check(r.status === 200 && r.body.fee === 200, "Bo buys it: 2 % fee");
  check(db.get(`worldArclBal/${b}`).bal === 10000 && db.get(`worldArclBal/${a}`).bal - sellerBefore === 9800, "Bo paid 10,000, Aria got 9,800");
  { const pc = db.get(`worldMythic/${id1}`); check(pc.owner === b && pc.state === "GAME_OWNED" && pc.plus === 6 && pc.hist.length === 1 && pc.hist[0].price === 10000, "the piece is Bo's: its +, its history kept"); }
  check(!(db.get(`worldMythicOwn/${a}`).ids || []).includes(id1) && (db.get(`worldMythicOwn/${b}`).ids || []).includes(id1), "off Aria's list, on Bo's");
  r = await call(B, "world-mythic-buy", { id: id1 }); check(r.status === 404, "sold: gone from sale");
  r = await call(B, "world-mythic-equip", { slot: "weapon", id: id1 }); check(r.status === 200, "Bo wears it");
  { const m = (await W.read(new URL("https://x/api/social?world=mythic-market"))).body; check(m.items.length === 0, "the market is empty again"); }
  r = await call(B, "world-mythic-list", { id: id1, price: 3000 }); r = await call(B, "world-mythic-unlist", { id: id1 }); check(r.status === 200 && db.get(`worldMythic/${id1}`).state === "GAME_OWNED", "listed and taken back"); }
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
