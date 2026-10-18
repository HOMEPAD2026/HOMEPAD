// blackjack.test.mjs — ARCIA POKER LOUNGE's blackjack: the engine (world-blackjack-engine.js) and the server's copy are
// the same file; totals and soft hands; blackjack 3:2, the dealer's peek and soft 17, doubles, splits (aces take one
// card), surrender, insurance; the basic strategy plays thousands of rounds with every move legal and every chip
// accounted for; and the server (api/_world-poker.mjs): hands counted only at a person's pace, the daily mission's
// ARCL once a day and never for winning. On an in-memory store. Run: node tests/world/blackjack.test.mjs (needs ethers 6)
import fs from "node:fs";
import { ethers } from "ethers";
const E = await import("../../world-blackjack-engine.js");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
check(fs.readFileSync(new URL("../../world-blackjack-engine.js", import.meta.url), "utf8") === fs.readFileSync(new URL("../../api/_world-blackjack-engine.mjs", import.meta.url), "utf8"), "the server's engine is the game's, word for word");
const c = (x) => "shdc".indexOf(x.slice(-1)) * 13 + "23456789TJQKA".indexOf(x[0]), C = (q) => q.split(" ").map(c);
check(E.total(C("As 6h")).t === 17 && E.total(C("As 6h")).soft && E.total(C("As 6h Ts")).t === 17 && !E.total(C("As 6h Ts")).soft && E.total(C("As Ad 9c")).t === 21 && E.total(C("Ks Qh 5d")).t === 25, "totals: soft 17, hard 17, two aces and a nine, a bust");
// a round from a stacked shoe: the deal order is player, dealer, player, dealer, then the draws
const rig = (cards, bank = 1000, bet = 100) => { const s = E.deal(null, { bank, bet, seed: 1 }); const sh = C(cards); s.shoe = [...sh, ...s.shoe.slice(sh.length)]; s.ptr = 0; const h = s.hands[0]; h.cards = []; s.dealer = []; h.cards.push(s.shoe[s.ptr++]); s.dealer.push(s.shoe[s.ptr++]); h.cards.push(s.shoe[s.ptr++]); s.dealer.push(s.shoe[s.ptr++]); s.phase = "play"; return s; };
{ const s = E.deal(null, { bank: 1000, bet: 100, seed: 7 }); check(s && s.bank === 900 && s.hands[0].cards.length === 2 && s.dealer.length === 2 && E.deal(null, { bank: 50, bet: 100, seed: 7 }) === null && E.deal(null, { bank: 1000, bet: 5, seed: 7 }) === null, "a deal takes the bet; a bet over the bank or under the table minimum is refused"); }
{ let s = rig("As 9d Kh 7c"); s = E.act(s, "stand"); check(s.phase === "done" && s.hands[0].res === "blackjack" && s.hands[0].pay === 250 && s.bank === 1150, "blackjack pays 3 to 2"); }
{ const s = rig("Ts 6d 9h Ac 2c"); E.act(s, "stand"); check(s.dealer.length === 2 && E.total(s.dealer).t === 17 && s.hands[0].res === "win", "the dealer stands on soft 17"); }
{ const s = rig("Ts 6d 6h 7c 9c"); E.act(s, "stand"); check(s.dealer.length === 3 && s.hands[0].res === "win", "the dealer draws to 16 and busts: your 16 wins"); }
{ const s = rig("5s 9d 6h 7c Ts 8c"); E.act(s, "double"); check(s.hands[0].bet === 200 && s.hands[0].cards.length === 3 && s.hands[0].res === "win" && s.bank === 1200, "double: twice the bet, one card, paid double"); }
{ const s = rig("As 9d Ah 7c 2c 3d 9h"); E.act(s, "split"); check(s.hands.length === 2 && s.hands.every((h) => h.cards.length === 2 && h.done) && s.phase === "done", "split aces: one card each, then the dealer plays"); }
{ const s = rig("8s 9d 8h 7c"); E.act(s, "split"); check(s.hands.length === 2 && s.cur === 0 && E.legal(s).double && !E.legal(s).surrender, "split eights: two hands to play, double allowed after the split, no surrender"); }
{ const s = rig("Ts Td 6h 7c"); E.act(s, "surrender"); check(s.hands[0].res === "surrender" && s.bank === 950, "surrender: half the bet back"); }
{ const s = E.deal(null, { bank: 1000, bet: 100, seed: 1 }); s.dealer = C("Ad Kc"); s.hands[0].cards = C("9s 7h"); s.phase = "ins"; E.insure(s, true); check(s.phase === "done" && s.ins === 50 && s.insPay === 150 && s.hands[0].res === "lose" && s.bank === 1000, "insurance against a dealer blackjack pays 2 to 1 (the round costs nothing)"); }
{ const s = E.deal(null, { bank: 1000, bet: 100, seed: 1 }); s.dealer = C("Ad 9c"); s.hands[0].cards = C("9s 7h"); s.phase = "ins"; E.insure(s, true); check(s.phase === "play" && s.bank === 850, "insurance lost when the dealer has no blackjack; the hand plays on"); }
{ const v = E.viewOf(rig("Ts 6d 9h Ac")); check(v.dealer[1] === -1 && v.shoe === undefined, "the dealer's hole card and the shoe stay hidden until the dealer plays"); }
// basic strategy: 30,000 rounds, every move legal, every chip accounted for
{ let bank = 1e9, prev = null, bad2 = 0, flow = 0, bj = 0;
  for (let k = 0; k < 30000; k++) { const b0 = bank; let s = E.deal(prev, { bank, bet: 100, seed: k + 11 }); if (s.phase === "ins") s = E.insure(s, k % 4 === 0); let g = 0;
    while (s.phase === "play" && g++ < 60) { const a = { H: "hit", S: "stand", D: "double", P: "split", R: "surrender" }[E.advice(s)]; if (!E.act(s, a)) { bad2++; break; } }
    if (s.phase !== "done") bad2++; const staked = s.hands.reduce((a, h) => a + h.bet, 0) + s.ins, paid = s.hands.reduce((a, h) => a + h.pay, 0) + s.insPay; if (s.bank !== b0 - staked + paid) bad2++; bank = s.bank; prev = s; bj += s.hands.filter((h) => h.res === "blackjack").length; flow += 100; }
  const edge = (1e9 - bank) / flow; check(bad2 === 0 && edge > -0.02 && edge < 0.03 && bj > 30000 * 0.04, `30,000 rounds by the basic strategy: every move legal, every chip accounted for, house edge ${(edge * 100).toFixed(2)}%`); }

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
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => TT, randomId: () => "id" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(TT).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const p1 = ethers.Wallet.createRandom();
let r = await call(p1, "world-bj-start"); let id = r.body.runId; TT += 5e3;
r = await call(p1, "world-bj-end", { runId: id, hands: 10 }); check(r.status === 400, "ten hands in five seconds: refused");
r = await call(p1, "world-bj-end", { runId: "nope", hands: 1 }); check(r.status === 409, "an unknown game: refused");
const b0 = bal(p1);
for (let k = 0; k < 2; k++) { r = await call(p1, "world-bj-start"); id = r.body.runId; TT += 40e3; r = await call(p1, "world-bj-end", { runId: id, hands: 12, net: 300, bj: 1 }); }
check(r.status === 200 && r.body.credited === 0 && r.body.prog.mis.bj === 24 && r.body.prog.bjHands === 24 && r.body.prog.bjBJ === 2 && r.body.xp > 0, "24 hands counted at a person's pace: poker XP, no mission yet");
const again = await call(p1, "world-bj-end", { runId: id, hands: 12 }); check(again.status === 409, "the same game can't be counted twice");
r = await call(p1, "world-bj-start"); id = r.body.runId; TT += 40e3; r = await call(p1, "world-bj-end", { runId: id, hands: 10, net: -500 });
check(r.status === 200 && r.body.credited === 300 && bal(p1) - b0 === 300, "30 hands today: the mission pays 300 ARCL, whatever the chips did");
r = await call(p1, "world-bj-start"); id = r.body.runId; TT += 40e3; r = await call(p1, "world-bj-end", { runId: id, hands: 10 });
check(r.status === 200 && r.body.credited === 0 && bal(p1) - b0 === 300, "the mission pays once a day");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
