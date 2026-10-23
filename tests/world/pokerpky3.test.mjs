// pokerpky3.test.mjs — b-pky3 in ARCIA POKER LOUNGE: the computer players' styles (world-poker-engine.js STYLES), a
// hand's counts and the badges, the daily rule, blackjack's side bets (world-blackjack-engine.js), and on the server
// (api/_world-poker.mjs): looks bought with chips (once, never back), a solo game's counts kept within its hands, the
// daily rule's board, table hands counted into your record, and crew tables (only the crew sits down; the crews' week).
// On an in-memory store. Run: node tests/world/pokerpky3.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const E = await import("../../world-poker-engine.js");
const BJE = await import("../../world-blackjack-engine.js");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

// ---------------- the engine ----------------
// the styles: from the same spots, NEX raises more often than LUMI; ARC (calm) plays as before
{
  const raises = (name) => { let n = 0; for (let k = 0; k < 400; k++) { const H = E.newHand({ players: [{ id: "a", name, stack: 1500, bot: true, lvl: 2 }, { id: "b", name: "x", stack: 1500 }], button: 0, sb: 10, bb: 20, seed: 1000 + k }); const m = E.botMove(H, E.rng(k)); if (m && (m.t === "raise" || m.t === "allin")) n++; } return n; };
  const nex = raises("AI NEX"), lumi = raises("AI LUMI"), aron = raises("AI ARON");
  check(nex > lumi && aron > lumi, `styles: NEX ${nex} · ARON ${aron} · LUMI ${lumi} raises in 400 spots`);
  check(E.STYLE_OF["AI ARC"] === "calm" && E.STYLES.calm.size === 1, "ARC plays it straight");
}
// a hand's counts: someone who raises and everyone folds wins a steal; the counts add up; badges by thresholds
{
  const H = E.newHand({ players: [{ id: "a", name: "A", stack: 1500 }, { id: "b", name: "B", stack: 1500 }, { id: "c", name: "C", stack: 1500 }], button: 0, sb: 10, bb: 20, seed: 7 });
  const first = H.toAct; E.act(H, first, { t: "raise", to: 60 }); while (H.street < 4) E.act(H, H.toAct, { t: "fold" });
  const x = E.handStats(H, first);
  check(x && x.h === 1 && x.vpip === 1 && x.win === 1 && x.steal === 1 && x.sd === 0 && x.big >= 1, `a raise everyone folds to: a steal (${JSON.stringify(x)})`);
  let st = {}; for (let k = 0; k < 25; k++) st = E.addStats(st, x);
  check(st.steal === 25 && st.h === 25 && E.badgesOf(st).includes("steal25") && !E.badgesOf(st).includes("hands100"), "25 steals: Bluff Master, not yet Regular Seat");
  const y = E.handStats(H, (first + 1) % 3); check(y && y.win === 0 && y.vpip === 0, "a fold: no money in, no win");
}
// the daily rule: one a day, the same for everyone
check(E.ruleOf("2026-10-23") === E.ruleOf("2026-10-23") && E.RULES.includes(E.ruleOf("2026-10-23")) && new Set(Array.from({ length: 30 }, (_, k) => E.ruleOf("2026-11-" + String(k + 1).padStart(2, "0")).id)).size >= 3, "the daily rule: fixed for a day, changing over the month");
// blackjack's side bets
{
  const c = (r, s) => s * 13 + r; // (rank 0 = 2 … 12 = A; suit 0 ♠ 1 ♥ 2 ♦ 3 ♣)
  check(BJE.sideOf([c(5, 0), c(5, 0)], c(2, 1)).pp === "perfect" && BJE.sideOf([c(5, 1), c(5, 2)], c(2, 1)).pp === "colored" && BJE.sideOf([c(5, 0), c(5, 1)], c(2, 1)).pp === "mixed" && BJE.sideOf([c(5, 0), c(6, 0)], c(2, 1)).pp === "", "Perfect Pairs: perfect · colored · mixed · none");
  check(BJE.sideOf([c(3, 0), c(4, 0)], c(5, 0)).t3 === "sflush" && BJE.sideOf([c(3, 0), c(4, 1)], c(5, 0)).t3 === "straight" && BJE.sideOf([c(12, 0), c(0, 1)], c(1, 0)).t3 === "straight" && BJE.sideOf([c(9, 2), c(9, 2)], c(9, 2)).t3 === "strips" && BJE.sideOf([c(9, 2), c(9, 1)], c(9, 0)).t3 === "trips" && BJE.sideOf([c(2, 3), c(7, 3)], c(11, 3)).t3 === "flush" && BJE.sideOf([c(2, 3), c(7, 1)], c(11, 3)).t3 === "", "21+3: straight flush · straight (A-2-3 too) · suited trips · trips · flush · none");
  let paid = 0, lost = 0, n = 0;
  for (let seed = 1; seed < 400; seed++) { const s = BJE.deal(null, { bank: 1000, bet: 50, seed, side: { pp: 20, t3: 20 } }); if (!s) continue; n++; const sd = s.side, r = BJE.sideOf(s.hands[0].cards, s.dealer[0]); const want = (r.pp ? 20 * (BJE.BJ.PP[r.pp] + 1) : 0) + (r.t3 ? 20 * (BJE.BJ.T3[r.t3] + 1) : 0); if (sd.ppPay + sd.t3Pay === want) paid++; else lost++; }
  check(n === 399 && lost === 0, `side bets paid as the cards say in ${paid} deals`);
  const s0 = BJE.deal(null, { bank: 1000, bet: 50, seed: 3, side: { pp: 20, t3: 0 } }); check(s0 && s0.bank === 1000 - 50 - 20 + s0.side.ppPay, "the side bet comes off the bank with the bet, its pay back on");
  check(!BJE.deal(null, { bank: 1000, bet: 50, seed: 3, side: { pp: 60 } }) && !BJE.deal(null, { bank: 1000, bet: 50, seed: 3, side: { pp: 5 } }) && !BJE.deal(null, { bank: 100, bet: 50, seed: 3, side: { pp: 40, t3: 40 } }), "a side bet over the bet, under the table's least, or past your chips: refused");
}

// ---------------- the server ----------------
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let TT = Date.parse("2026-10-23T03:10:00Z"), n = 0;
db.set("worldStats/pokerFest", { start: 0, day0: "1970-01-01" });
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => TT, randomId: () => "id" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(TT).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const lw = (w) => w.address.toLowerCase();
const chips = (w) => (db.get(`worldPokerProg/${lw(w)}`) || {}).chips || 0;
const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), C = ethers.Wallet.createRandom();
for (const w of [A, B, C]) { db.set(`worldSave/${lw(w)}`, { name: "P" + w.address.slice(2, 6), lv: 20 }); await call(w, "world-poker-me"); }

// looks for chips
{
  const c0 = chips(A), it = E.POKER.SHOP[0];
  let r = await call(A, "world-poker-look-buy", { id: it.id });
  check(r.status === 200 && chips(A) === c0 - it.chips && r.body.prog.unlocks.includes(it.id), `buy ${it.id} for ${it.chips} chips`);
  r = await call(A, "world-poker-look-buy", { id: it.id }); check(r.status === 409 && chips(A) === c0 - it.chips, "the same look twice: refused, nothing taken");
  r = await call(A, "world-poker-look-buy", { id: "felt:nope" }); check(r.status === 400, "a look that isn't for sale: refused");
  db.set(`worldPokerProg/${lw(B)}`, { ...db.get(`worldPokerProg/${lw(B)}`), chips: 100 });
  r = await call(B, "world-poker-look-buy", { id: E.POKER.SHOP.at(-1).id }); check(r.status === 400 && chips(B) === 100, "not enough chips: refused");
  db.set(`worldPokerProg/${lw(B)}`, { ...db.get(`worldPokerProg/${lw(B)}`), chips: 50000 });
}
// a solo game's counts and the daily rule
{
  const rule = E.ruleOf("2026-10-23");
  let r = await call(A, "world-poker-solo-start", { lvl: 1, rule: rule.id }); const runId = r.body.runId;
  TT += 120e3;
  r = await call(A, "world-poker-solo-end", { runId, hands: 8, won: true, best: 3, chips: 4200, st: { vpip: 99, win: 5, steal: 3, sd: 2, allin: 1, big: 40 } });
  const st = r.body.prog.st;
  check(r.status === 200 && st.h === 8 && st.vpip === 8 && st.win === 5 && st.big === 40 && st.rule === 1, `the game's counts kept within its 8 hands (${JSON.stringify(st)})`);
  const q = await W.read(new URL("http://x/api/social?world=poker-rule"));
  check(q.status === 200 && q.body.rule.id === rule.id && q.body.top[0] && q.body.top[0].n === 4200 && q.body.top[0].won, "today's rule board: your finish");
  r = await call(A, "world-poker-solo-start", { lvl: 1, rule: "not-today" }); TT += 120e3;
  r = await call(A, "world-poker-solo-end", { runId: r.body.runId, hands: 6, won: true, best: 1, chips: 9000, st: {} });
  check(r.status === 200 && r.body.rule === null && r.body.prog.st.rule === 1, "another day's rule doesn't count");
  r = await call(A, "world-poker-solo-start", { lvl: 0, tut: true }); TT += 60e3;
  r = await call(A, "world-poker-solo-end", { runId: r.body.runId, hands: 3, won: false, best: 1, st: {} });
  check(r.status === 200 && r.body.prog.badges.includes("tut") && (r.body.prog.news || []).some((x) => x.t === "badge" && x.id === "tut"), "the tutorial: Lounge Student, and a line of news");
}
// table hands into your record, and crew tables
{
  let r = await call(A, "world-crew-create", { name: "Aces High", tag: "ACE" });
  check(r.status === 200 && r.body.crew && r.body.crew.code, "a crew for the test");
  r = await call(B, "world-crew-join", { code: r.body.crew.code }); check(r.status === 200, "B joins the crew");
  r = await call(A, "world-poker-create", { stake: "s1", crew: true }); const room = r.body.room;
  check(r.status === 200 && room.priv && room.crew === "ACE", "a crew table: private, with the crew's tag");
  r = await call(C, "world-poker-join", { room: room.id }); check(r.status === 403, "someone outside the crew can't sit down");
  r = await call(B, "world-poker-join", { room: room.id }); check(r.status === 200 && r.body.room.me >= 0, "a crewmate sits down");
  r = await call(B, "world-poker-crew"); check(r.status === 200 && r.body.crew.tag === "ACE" && r.body.rooms.some((x) => x.id === room.id), "the crew's tables list it");
  r = await call(C, "world-poker-crew"); check(r.status === 200 && r.body.crew === null && r.body.rooms.length === 0, "no crew: no crew tables");
  let hands0 = 0, guard = 0; const base = ((db.get(`worldPokerProg/${lw(A)}`) || {}).st || {}).h || 0;
  while (guard++ < 600) {
    TT += 1500;
    for (const w of [A, B]) { const q = await call(w, "world-poker-view", { room: room.id }); const H = q.body.room && q.body.room.hand; if (H && H.street < 4 && H.toAct === H.mine) { const L = E.legal(H); await call(w, "world-poker-act", { room: room.id, ...(guard % 4 === 0 && L.raise ? { t: "raise", to: L.raise.min } : L.check ? { t: "check" } : { t: "call" }) }); } }
    const st = (db.get(`worldPokerProg/${lw(A)}`) || {}).st || {}; hands0 = (st.h || 0) - base; if (hands0 >= 4 && [...db.keys()].some((k) => k.startsWith("worldStats/pokerCrewWeek_"))) break;
  }
  check(hands0 >= 4, `table hands counted into the record (${hands0})`);
  r = await call(A, "world-poker-crew"); const brd = r.body.board;
  check(brd.length === 1 && brd[0].tag === "ACE" && brd[0].mine, `the crews' week board (${JSON.stringify(brd)})`);
}

console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
