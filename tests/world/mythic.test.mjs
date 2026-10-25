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
check(CC.PIECES.length === 7 && new Set(CC.PIECES.map((p) => p.slot)).size === 7, "seven pieces, seven different slots (the shield is the seventh)");
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
r = await win(A, "secret", [0.19, 0.99]); check(r.ok && r.mythic && r.mythic.def === "CC_SHIELD" && r.mythic.req === 100 && r.mythic.mult === 3.2, "the SECRET: 20 %, the Crimson Eclipse Shield worn from 100 at ×3.2");
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
// b6: shards, the drop's slot, claiming, reforging, awakening, a miss's bonus, resonance, bids, the boards, what others see
{ const M = await import("../../world-mythic-data.js"), a = A.address.toLowerCase(), b = B.address.toLowerCase();
  { const own = db.get(`worldMythicOwn/${a}`); check((own.shards || {}).lysitha === 2 && own.shards.secret === 1, `every won run adds its dungeon's shard (lysitha ${own.shards.lysitha}, secret ${own.shards.secret})`); }
  { const t = Date.parse("2026-10-26T00:00:00Z"); check(M.blessedSlot(t) !== M.blessedSlot(t + 7 * 864e5) && M.blessedSlot(t) === M.blessedSlot(t + 6 * 864e5 - 1), "the blessed slot changes on Monday (Seoul) and holds all week");
    const odds = M.slotOdds(["weapon", "armor"], t), bl = M.blessedSlot(t), miss = CC.PIECES.map((p) => p.slot).find((x) => !["weapon", "armor", bl].includes(x));
    check(Math.abs(Object.values(odds).reduce((x, y) => x + y, 0) - 1) < 1e-9 && odds[miss] > odds.weapon * 2.9 && odds[bl] > odds[miss], "a slot you don't hold weighs three times one you do; the blessed slot more");
    let held = ["weapon", "armor", "helm", "ring", "necklace", "boots"], c = 0; for (let i = 0; i < 1000; i++) if (M.rollSlot(held, t, i / 1000).slot === "shield") c++; check(c > 300, `holding six of seven: the missing shield comes up ${c / 10} % of the time`); }
  // claiming from shards
  r = await call(A, "world-mythic-claim", { src: "lysitha", slot: "ring" }); check(r.status === 400 && r.body.need === CC.SHARD.lysitha, "not enough shards: refused, with how many are needed");
  { const own = db.get(`worldMythicOwn/${a}`); own.shards = { ...own.shards, solvira: CC.SHARD.solvira + 3 }; db.set(`worldMythicOwn/${a}`, own); }
  r = await call(A, "world-mythic-claim", { src: "solvira", slot: "ring" }); check(r.status === 200 && r.body.piece.def === "CC_RING" && r.body.piece.req === 200 && r.body.piece.mult === 1.5 && r.body.shards === 3 && r.body.piece.first === a, "40 Solvira shards → the Eclipse Ring from Solvira (Lv 200, ×1.5), the first owner kept");
  const ringId = r.body.piece.id;
  // reforging
  { const own = db.get(`worldMythicOwn/${a}`); own.ess = 500; db.set(`worldMythicOwn/${a}`, own); const pc = db.get(`worldMythic/${ringId}`); pc.plus = 4; db.set(`worldMythic/${ringId}`, pc); }
  r = await call(A, "world-mythic-reforge", { id: ringId, slot: "ring" }); check(r.status === 400, "reforging into the same piece: refused");
  r = await call(A, "world-mythic-reforge", { id: ringId, slot: "necklace" }); check(r.status === 200 && r.body.piece.def === "CC_NECKLACE" && r.body.piece.plus === 0 && r.body.piece.mult === 1.5 && r.body.ess === 500 - CC.REFORGE.solvira && r.body.piece.log.some((x) => x.k === "reforge"), "reforged into the Crimson Heart: same dungeon and multiplier, + back to 0, Essence spent, in its log");
  // awakening
  { const own = db.get(`worldMythicOwn/${a}`); own.shards = { ...own.shards, solvira: CC.SHARD.solvira * 2 }; db.set(`worldMythicOwn/${a}`, own); }
  const c1 = (await call(A, "world-mythic-claim", { src: "solvira", slot: "necklace" })).body.piece, c2 = (await call(A, "world-mythic-claim", { src: "solvira", slot: "helm" })).body.piece;
  r = await call(A, "world-mythic-awaken", { id: ringId, fodder: c2.id }); check(r.status === 400, "a different piece can't awaken it");
  const st0 = M.mythicStats(db.get(`worldMythic/${ringId}`));
  r = await call(A, "world-mythic-awaken", { id: ringId, fodder: c1.id }); check(r.status === 200 && r.body.piece.stars === 1 && db.get(`worldMythic/${c1.id}`).state === "AWAKENED_INTO" && !db.get(`worldMythicOwn/${a}`).ids.includes(c1.id), "the same piece given up: one star, the copy gone");
  { const st1 = M.mythicStats(db.get(`worldMythic/${ringId}`)); check((st1.hpPct || 0) === (st0.hpPct || 0) + CC.AWAKEN.necklace[0].hpPct, "the first star opens the slot's own option"); }
  // a miss's bonus
  check(M.enhCost(10, 0).rate === 0.4 && M.enhCost(10, 2).rate === 0.5 && M.enhCost(10, 99).rate === 0.65, "each miss at a + adds 5 %, up to 25 %");
  { const pc = db.get(`worldMythic/${ringId}`); pc.plus = 10; pc.fails = 0; db.set(`worldMythic/${ringId}`, pc); db.set(`worldArclBal/${a}`, { bal: 1e6 }); }
  T += 2000; R = [0.99]; r = await call(A, "world-mythic-enhance", { id: ringId }); check(r.status === 200 && !r.body.hit && r.body.fails === 1 && Math.abs(r.body.next - 0.45) < 1e-9, "a miss: the next try at +10 is 45 %");
  T += 2000; R = [0.0]; r = await call(A, "world-mythic-enhance", { id: ringId }); check(r.status === 200 && r.body.hit && r.body.fails === 0 && db.get(`worldMythic/${ringId}`).log.some((x) => x.k === "plus" && x.v === 11), "a hit: back to no bonus, +11 in its log");
  // resonance
  { const full = CC.PIECES.map((P) => ({ def: P.id, plus: 10 })), low = CC.PIECES.map((P, i) => ({ def: P.id, plus: i ? 10 : 9 }));
    check(M.setBonus(full).resonance && M.setBonus(full).stats.atkPct === 15 + CC.RESONANCE.stats.atkPct, "all seven at +10: Crimson Resonance on top of the five");
    check(!M.setBonus(low).resonance && !M.setBonus(full.slice(1)).resonance, "one at +9, or six worn: no resonance"); }
  // bids
  db.set(`worldArclBal/${b}`, { bal: 50000 });
  r = await call(B, "world-mythic-bid", { def: "CC_NECKLACE", minPlus: 5, price: 20000 }); check(r.status === 200 && db.get(`worldArclBal/${b}`).bal === 30000, "Bo asks to buy a Crimson Heart +5 or better for 20,000: the ARCL is held");
  const bidId = r.body.bid.bid;
  { const m = (await W.read(new URL("https://x/api/social?world=mythic-market"))).body; check(m.bids.length === 1 && m.bids[0].price === 20000 && !/^0x[0-9a-f]{40}$/.test(m.bids[0].w), "the market shows the request (the wallet shortened)"); }
  r = await call(A, "world-mythic-fill", { bid: bidId, id: c2.id }); check(r.status === 400, "a helmet doesn't fill a necklace request");
  r = await call(A, "world-mythic-fill", { bid: bidId, id: ringId }); const aBal = db.get(`worldArclBal/${a}`).bal;
  check(r.status === 200 && r.body.fee === 400 && db.get(`worldMythic/${ringId}`).owner === b && db.get(`worldMythic/${ringId}`).first === a, "Aria fills it with her +11 Heart: it's Bo's, Aria stays its first owner");
  r = await call(A, "world-mythic-fill", { bid: bidId, id: c2.id }); check(r.status === 404, "filled: the request is gone");
  { const m = (await W.read(new URL("https://x/api/social?world=mythic-market"))).body; check(m.sales.length >= 2 && m.sales[m.sales.length - 1].price === 20000 && m.sales[m.sales.length - 1].plus === 11, "recent sales hold it for the price line"); }
  T += 3000; r = await call(B, "world-mythic-bid", { def: "CC_RING", price: 5000 }); const b2 = r.body.bid.bid, before = db.get(`worldArclBal/${b}`).bal;
  r = await call(A, "world-mythic-unbid", { bid: b2 }); check(r.status === 403, "someone else's request can't be taken back");
  r = await call(B, "world-mythic-unbid", { bid: b2 }); check(r.status === 200 && db.get(`worldArclBal/${b}`).bal === before + 5000, "taken back: the 5,000 returned");
  // the boards, what others see
  await new Promise((ok) => setTimeout(ok, 30)); // (the boards are written after the answer)
  { const tp = (await W.read(new URL("https://x/api/social?world=mythic-top"))).body; check(tp.collect.length >= 2 && tp.plus[0].best >= 11 && tp.collect.every((x) => !/^0x[0-9a-f]{40}$/.test(x.w)), "the boards: collection and best +"); }
  r = await call(B, "world-mythic-equip", { slot: "necklace", id: ringId });
  { const v = (await W.read(new URL("https://x/api/social?world=mythic-worn&wallet=" + B.address))).body; check(v.n >= 1 && v.worn.some((x) => x.def === "CC_NECKLACE" && x.plus === 11 && x.stars === 1), "anyone can see what Bo wears: the Heart +11 ★1"); }
}
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
