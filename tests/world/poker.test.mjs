// poker.test.mjs — ARCIA POKER LOUNGE: the engine (world-poker-engine.js) and the server's copy are the same file; the
// hand ranking; side pots paid to the right players; no chips made or lost over thousands of computer hands; and the
// server (api/_world-poker.mjs): free daily chips, a solo game counted only if it took a person's time, the missions'
// ARCL once a day and never for winning, a table dealt and settled there, a seat seeing only its own cards, leaving
// paying the stack back. On an in-memory store. Run: node tests/world/poker.test.mjs (needs ethers 6)
import fs from "node:fs";
import { ethers } from "ethers";
const E = await import("../../world-poker-engine.js");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

check(fs.readFileSync(new URL("../../world-poker-engine.js", import.meta.url), "utf8") === fs.readFileSync(new URL("../../api/_world-poker-engine.mjs", import.meta.url), "utf8"), "the server's engine is the game's, word for word");
const c = (x) => "shdc".indexOf(x[1]) * 13 + E.RANKS.indexOf(x[0]), h = (q) => E.best(q.split(" ").map(c));
const T = [["As Ks Qs Js Ts 2d 3c", 9], ["9h 8h 7h 6h 5h Ad Kc", 8], ["Ah 2h 3h 4h 5h 9d Kc", 8], ["As Ad Ac Ah 2d 3c 4s", 7], ["As Ad Ac Kh Kd 3c 4s", 6], ["As 9s 7s 4s 2s Kd Kc", 5], ["Ad 2c 3h 4s 5d 9c Kh", 4], ["7d 7c 7h Ks 2d 9c 4h", 3], ["7d 7c Kh Ks 2d 9c 4h", 2], ["7d 7c Ah Ks 2d 9c 4h", 1], ["2d 7c Ah Ks Jd 9c 4h", 0]];
check(T.every(([q, k]) => h(q).cat === k), "every hand category, the royal flush and the wheel");
check(h("Ad 2c 3h 4s 5d 9c Kh").v < h("2d 3c 4h 5s 6d 9c Kh").v && h("Ks Kd 9c 8c 2h 3h 4d").v > h("Ks Kd 9c 7c 2h 3h 4d").v, "the wheel below six-high; kickers decide");
// a side pot: A all-in 100, B and C 300 each → A wins the main pot (300), the best of B/C the side (400)
{ const s = E.newHand({ players: [{ id: "a", stack: 100 }, { id: "b", stack: 1000 }, { id: "c", stack: 1000 }], button: 2, sb: 10, bb: 20, seed: 1 });
  s.p[0].hole = [c("As"), c("Ah")]; s.p[1].hole = [c("Ks"), c("Kh")]; s.p[2].hole = [c("2c"), c("7d")];
  s.deck = [c("As"), c("Ah"), c("Ks"), c("Kh"), c("2c"), c("7d"), c("3d"), c("9c"), c("Jd"), c("4h"), c("5c"), c("8s"), c("Qd"), c("6h"), c("Tc")]; s.ptr = 6;
  // pre-flop: a (UTG, 3-handed: button c, sb a? — read who acts), then everyone in
  let guard = 20; while (s.street < 4 && guard--) { const L = E.legal(s), p = s.p[s.toAct]; const m = p.id === "a" ? { t: "allin" } : p.id === "b" && s.street === 0 && s.curBet < 300 && L.raise ? { t: "raise", to: Math.max(L.raise.min, 300) } : L.check ? { t: "check" } : { t: "call" }; if (!E.act(s, s.toAct, m)) { console.log("refused", JSON.stringify(m), JSON.stringify(L)); break; } }
  const r = s.result; check(r && r.pots.length === 2 && r.pots[0].amt === 300 && r.pots[0].win[0] === 0 && r.pots[1].amt === 400 && r.pots[1].win[0] === 1 && s.p[0].stack === 300 && s.p[1].stack === 1100 && s.p[2].stack === 700, "side pot: A takes the main 300, B the side 400 (" + JSON.stringify(r && r.pots.map((p) => [p.amt, p.win])) + ")"); }
// computer players over many hands: chips conserved, every hand ends, only legal moves
{ const R = E.rng(11); let cons = true, stuck = 0, n = 0;
  for (let g = 0; g < 1500; g++) { const k = 2 + (g % 5), P = Array.from({ length: k }, (_, i) => ({ id: "p" + i, stack: 50 + Math.floor(R() * 4000), bot: true, lvl: g % 4 })), t0 = P.reduce((a, p) => a + p.stack, 0);
    const s = E.newHand({ players: P, button: g % k, sb: 10, bb: 20, seed: g + 5 }); let guard = 300; while (s.street < 4 && guard--) if (!E.act(s, s.toAct, E.botMove(s, R))) { stuck++; break; }
    if (s.street < 4) stuck++; if (s.p.reduce((a, p) => a + p.stack, 0) !== t0) cons = false; n++; }
  check(cons && stuck === 0, `${n} computer hands: no chips made or lost, every hand ends`); }
{ const s = E.newHand({ players: [{ id: "a", stack: 500 }, { id: "b", stack: 500 }], button: 0, sb: 10, bb: 20, seed: 3 });
  check(E.act(s, s.toAct, { t: "check" }) === null && E.act(s, (s.toAct + 1) % 2, { t: "fold" }) === null && E.act(s, s.toAct, { t: "raise", to: 25 }) === null, "illegal moves refused: a check facing a bet, acting out of turn, a raise below the minimum");
  const v = E.viewOf(s, 0); check(v.p[1].hole.every((x) => x === -1) && v.p[0].hole.every((x) => x >= 0) && v.deck === undefined, "a seat sees only its own cards, never the deck"); }

// the server
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, JSON.parse(JSON.stringify(x.data))); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let TT = Date.parse("2026-10-14T03:00:00Z"), n = 0;
db.set("worldStats/pokerFest", { start: 0, day0: "1970-01-01" }); // (the Opening Festival long over: these are ordinary days; tests/world/pokerfest.test.mjs has the festival)
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => TT, randomId: () => "id" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(TT).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const p1 = ethers.Wallet.createRandom(), p2 = ethers.Wallet.createRandom();

let r = await call(p1, "world-poker-me"); check(r.status === 200 && r.body.prog.chips === E.POKER.DAY_CHIPS && r.body.prog.lv === 1, "today's free chips: " + E.POKER.DAY_CHIPS);
r = await call(p1, "world-poker-solo-start", { lvl: 1 }); const run1 = r.body.runId; TT += 5e3;
r = await call(p1, "world-poker-solo-end", { runId: run1, hands: 8, won: true, best: 4 }); check(r.status === 400, "a solo game faster than a person can play: refused");
for (let g = 0; g < 3; g++) { r = await call(p1, "world-poker-solo-start", { lvl: 1 }); const id = r.body.runId; TT += 80e3; r = await call(p1, "world-poker-solo-end", { runId: id, hands: 10, won: g === 0, best: 2 }); }
check(r.status === 200 && r.body.prog.mis.solo === 3 && r.body.credited === 300 && bal(p1) === 300 && r.body.prog.games === 3 && r.body.prog.wins === 1, "three finished solo games: 150 poker XP, the mission's 300 ARCL (won or not)");
r = await call(p1, "world-poker-solo-start", {}); { const id = r.body.runId; TT += 80e3; r = await call(p1, "world-poker-solo-end", { runId: id, hands: 10 }); } check(r.status === 200 && r.body.credited === 0 && bal(p1) === 300, "the mission pays once a day");
// a table: p1 sits down, adds two computer players; the table deals and plays itself while p1 is away
r = await call(p1, "world-poker-create", { stake: "s1" }); const room = r.body.room.id; check(r.status === 200 && r.body.room.me === 0 && db.get(`worldPokerProg/${p1.address.toLowerCase()}`).chips === E.POKER.DAY_CHIPS - 2000, "a table: you sit down with the buy-in (2,000 of your chips)");
r = await call(p1, "world-poker-bots", { room, n: 2, lvl: 2 }); check(r.status === 200 && r.body.room.seats.filter(Boolean).length === 3 && r.body.room.hand, "two computer seats; a hand is dealt");
const v0 = r.body.room; check(v0.hand.p.every((p, k) => (k === v0.hand.mine ? p.hole.every((x) => x >= 0) : p.hole.every((x) => x === -1))), "your view: your own two cards, the others face down");
// play 25 hands: on our turn call or check, else let time pass (computers think, a missed turn times out)
let hands0 = 0, legalFail = 0, guard = 0;
while (guard++ < 1500) {
  TT += 1000; r = await call(p1, "world-poker-view", { room }); const V = r.body.room; if (!V || r.status !== 200) { console.log("view", r.status, JSON.stringify(r.body).slice(0, 200)); break; }
  if (V.me < 0) { const j = await call(p1, "world-poker-join", { room }); if (j.status !== 200) { console.log("rejoin", JSON.stringify(j.body)); break; } continue; } // (broke: sit down again with today's chips)
  if (V.hand && V.hand.street < 4 && V.hand.toAct === V.hand.mine) { const L = E.legal(V.hand); const m = L.check ? { t: "check" } : { t: "call" }; const a = await call(p1, "world-poker-act", { room, ...m }); if (a.status !== 200) { legalFail++; } }
  const pr = db.get(`worldPokerProg/${p1.address.toLowerCase()}`); hands0 = pr.hands || 0; if (process.env.DBG && guard % 25 === 0) console.log(guard, hands0, V.hand && V.hand.street, V.hand && V.hand.toAct, V.hand && V.hand.mine, JSON.stringify(V.seats.map((x) => x && [x.stack, x.sit, x.away])), V.hand && JSON.stringify(V.hand.result && V.hand.result.net)); if (hands0 >= 21) break;
}
const pr1 = db.get(`worldPokerProg/${p1.address.toLowerCase()}`);
check(hands0 >= 20 && legalFail === 0 && bal(p1) === 600, `${hands0} table hands, every move accepted, the 20-hand mission paid (ARCL ${bal(p1)})`);
check(pr1.xp >= 150 + 100, "table XP: 50 for every 10 hands (" + pr1.xp + ")");
// a second person joins by the table's id, sees no one else's cards; then p1 leaves and gets the stack back
r = await call(p2, "world-poker-join", { room }); check(r.status === 200 && r.body.room.me >= 0, "a second person sits down");
const before = db.get(`worldPokerProg/${p1.address.toLowerCase()}`).chips, roomDoc = db.get(`worldPokerRoom/${room}`), stack = roomDoc.seats[0] ? roomDoc.seats[0].stack : 0;
r = await call(p1, "world-poker-leave", { room }); for (let k = 0; k < 12; k++) { TT += 1000; await call(p2, "world-poker-view", { room }); }
const after = db.get(`worldPokerProg/${p1.address.toLowerCase()}`).chips, seated = (db.get(`worldPokerRoom/${room}`).seats || []).some((x) => x && x.w === p1.address.toLowerCase());
check(!seated && after > before && after <= before + stack + 4000, `leaving: the seat is freed and the stack goes back to your chips (+${after - before})`);
// a private table by code
r = await call(p2, "world-poker-create", { stake: "s1", priv: true }); const code = r.body.room.code; r = await call(p1, "world-poker-join", { code }); check(code && code.length === 6 && r.status === 200, "a private table, joined by its 6-digit code");
r = await call(p1, "world-poker-chat", { room: r.body.room.id, text: ":gg:" }); check(r.status === 200 && r.body.room.chat.length === 1 && r.body.room.chat[0].e, "table chat and emotes");
// the last person at a table of computer players leaves mid-hand: the hand finishes at once and the stack comes back
{ const p3 = ethers.Wallet.createRandom(); await call(p3, "world-poker-me"); let q = await call(p3, "world-poker-create", { stake: "s1" }); const rm = q.body.room.id;
  q = await call(p3, "world-poker-bots", { room: rm, n: 3, lvl: 1 }); const mid = q.body.room.hand && q.body.room.hand.street < 4, chips0 = db.get(`worldPokerProg/${p3.address.toLowerCase()}`).chips;
  q = await call(p3, "world-poker-leave", { room: rm }); const R3 = db.get(`worldPokerRoom/${rm}`), chips1 = db.get(`worldPokerProg/${p3.address.toLowerCase()}`).chips;
  check(mid && q.status === 200 && !R3.seats.some((x) => x && !x.bot) && chips1 > chips0 && chips1 <= chips0 + 2000 * 4, `leaving mid-hand as the last person: the hand ends now and the stack comes back (${chips0} → ${chips1})`); }
const rooms = await W.read(new URL("http://x/api/social?world=poker-rooms")); check(rooms.status === 200 && rooms.body.rooms.length >= 1 && rooms.body.rooms.every((x) => x.stake), "the open public tables list");
const top = await W.read(new URL("http://x/api/social?world=poker-top")); check(top.status === 200 && Array.isArray(top.body.top), "the week's table board");
check(!JSON.stringify(rooms.body).includes("deck") && !JSON.stringify(r.body).includes('"deck"'), "nothing the server sends carries the deck");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
