// blackjack.test.mjs — ARCIA POKER LOUNGE's blackjack: the engine (world-blackjack-engine.js) and the server's copy are
// the same file; totals and soft hands; blackjack 3:2, the dealer's peek and soft 17, doubles, splits (aces take one
// card), surrender, insurance; the basic strategy plays thousands of rounds with every move legal and every chip
// accounted for; and the server (api/_world-poker.mjs): blackjack dealt there against the chips in your record, the
// hole card hidden, the daily mission's ARCL once a day at a person's pace and never for winning; the chip shop
// (ARCL → chips, one way, a daily limit, a purchase that can't be lost). On an in-memory store. Run: node tests/world/blackjack.test.mjs (needs ethers 6)
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
db.set("worldStats/pokerFest", { start: 0, day0: "1970-01-01" }); // (the Opening Festival long over: these are ordinary days; tests/world/pokerfest.test.mjs has the festival)
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => TT, randomId: () => "id" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(TT).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const p1 = ethers.Wallet.createRandom();
const prog = (w) => db.get(`worldPokerProg/${w.address.toLowerCase()}`) || {};
let r = await call(p1, "world-bj-state"); check(r.status === 200 && r.body.round === null && r.body.prog.chips === 20000, "no round yet; today's free chips are the bank");
r = await call(p1, "world-bj-deal", { table: "b1", bet: 5 }); check(r.status === 400, "a bet under the table's minimum: refused");
r = await call(p1, "world-bj-deal", { table: "b1", bet: 100000 }); check(r.status === 400 && /chips/.test(r.body.error), "a bet over your chips: refused");
// thirty-odd rounds by ARCIA's tip, seen the way the browser sees them (the hole card hidden until the end)
let net = 0, rounds = 0, hid = true, paidAt = -1, credited = 0;
const playRound = async (gap) => {
  TT += gap; let q = await call(p1, "world-bj-deal", { table: "b1", bet: 100 }); if (q.status !== 200) return q; rounds++;
  if (q.body.round.phase !== "done" && q.body.round.dealer[1] !== -1) hid = false;
  for (let g = 0; g < 30 && q.body.round.phase !== "done"; g++) {
    if (q.body.round.phase === "ins") q = await call(p1, "world-bj-ins", { take: false });
    else q = await call(p1, "world-bj-act", { a: { H: "hit", S: "stand", D: "double", P: "split", R: "surrender" }[E.advice(q.body.round)] });
    if (q.status !== 200) return q;
  }
  const v = q.body.round; net += v.hands.reduce((a, h) => a + h.pay - h.bet, 0) + v.insPay - v.ins; credited += q.body.credited || 0; return q;
};
const b0 = bal(p1);
for (let k = 0; k < 40 && (prog(p1).mis || {}).bj < 30; k++) { r = await playRound(4000); if (r.status !== 200) { console.log("round", r.status, JSON.stringify(r.body)); break; } }
check(hid, "the dealer's hole card stays hidden while you play");
check(prog(p1).chips === 20000 + net, `the chips in your record follow every round to the chip (${rounds} rounds, ${net >= 0 ? "+" : ""}${net})`);
check(credited === 300 && bal(p1) - b0 === 300 && prog(p1).mis.bj >= 30, "30 blackjack hands at a person's pace: the mission pays 300 ARCL, whatever the chips did");
{ const m0 = prog(p1).mis.bj; for (let k = 0; k < 3; k++) await playRound(100); check(prog(p1).mis.bj === m0, "rounds faster than a person plays them don't count toward the mission"); }
r = await call(p1, "world-bj-deal", { table: "b2", bet: 100 });
if (r.body.round && r.body.round.phase !== "done") { const again = await call(p1, "world-bj-deal", { table: "b2", bet: 100 }); const st = await call(p1, "world-bj-state");
  check(again.status === 409 && st.body.round && st.body.round.hands[0].bet === 100, "a round in play waits for you: no second deal, and it's there when you come back"); }
else check(true, "(a round over at the deal: nothing waits)");
// the chip shop: ARCL → chips, one way, at most 20,000 ARCL a day
const p2 = ethers.Wallet.createRandom(), a2 = p2.address.toLowerCase();
r = await call(p2, "world-poker-buy", { pack: "p1" }); check(r.status === 400 && /ARCL/.test(r.body.error), "no ARCL, no chips");
db.set(`worldArclBal/${a2}`, { bal: 30000 }); await call(p2, "world-poker-me"); const old = structuredClone(db.get(`worldPokerProg/${a2}`));
r = await call(p2, "world-poker-buy", { pack: "p1" }); check(r.status === 200 && r.body.prog.chips === 30000 && r.body.bal === 29000 && bal(p2) === 29000, "1,000 ARCL buys 10,000 chips");
r = await call(p2, "world-poker-buy", { pack: "p3" }); check(r.status === 400 && /limit/.test(r.body.error) && bal(p2) === 29000, "past 20,000 ARCL of chips today: refused, nothing taken");
db.set(`worldPokerProg/${a2}`, old); r = await call(p2, "world-poker-me"); check(r.body.prog.chips === 30000, "a record written over by an older copy still has the bought chips");
r = await W.handle({ action: "world-poker-cashout", ...(await sign(p2)) }); check(!r || r.status >= 400, "no way to turn chips into ARCL");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
