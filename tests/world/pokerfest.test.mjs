// pokerfest.test.mjs — ARCIA POKER LOUNGE's Opening Festival (api/_world-poker.mjs, POKER.FEST): its first day set by
// the first request; free chips doubled for 7 days; +50% on a wallet's first chip purchase, once; the stamp card (10
// real table or blackjack hands a day → a stamp; ARCL at 3 / 5 / 7 stamps, once each; the Opening Night card back at
// 7); happy hour (20:00–22:00 Seoul) doubling mission progress but not stamps; three blackjacks in a row → chips; the
// festival week's top 3 table winners paid once the week is over (chips, the Champion Gold felt, a title); and
// ordinary days after it. On an in-memory store. Run: node tests/world/pokerfest.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const E = await import("../../world-blackjack-engine.js");
const { POKER } = await import("../../world-poker-engine.js");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { isoWeek } = await import("../../api/_world-shop.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, JSON.parse(JSON.stringify(x.data))); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
const KST = (s) => Date.parse(s + "+09:00");
let TT = KST("2026-10-14T12:00:00"), n = 0;
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => TT, randomId: () => "id" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(TT).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const F = POKER.FEST, p1 = ethers.Wallet.createRandom(), a1 = p1.address.toLowerCase();

let r = await call(p1, "world-poker-me");
check(r.status === 200 && r.body.prog.fest && r.body.prog.fest.day === 1 && r.body.prog.chips === F.CHIPS && db.get("worldStats/pokerFest").day0 === "2026-10-14", "the first request starts the festival; day 1's free chips are doubled (40,000)");
db.set(`worldArclBal/${a1}`, { bal: 50000 });
r = await call(p1, "world-poker-buy", { pack: "p1" }); check(r.status === 200 && r.body.bonus === 5000 && r.body.prog.chips === F.CHIPS + 15000 && r.body.prog.news.some((x) => x.t === "first"), "a first chip purchase in the festival: +50% (10,000 + 5,000)");
TT += 2000; r = await call(p1, "world-poker-buy", { pack: "p1" }); check(r.status === 200 && r.body.bonus === 0 && r.body.prog.chips === F.CHIPS + 25000, "the second purchase: no bonus");
// blackjack rounds by ARCIA's tip, at a person's pace
const playRound = async (gap = 4000) => {
  TT += gap; let q = await call(p1, "world-bj-deal", { table: "b1", bet: 100 }); if (q.status !== 200) return q;
  for (let g = 0; g < 30 && q.body.round.phase !== "done"; g++) { q = q.body.round.phase === "ins" ? await call(p1, "world-bj-ins", { take: false }) : await call(p1, "world-bj-act", { a: { H: "hit", S: "stand", D: "double", P: "split", R: "surrender" }[E.advice(q.body.round)] }); if (q.status !== 200) return q; }
  return q;
};
const playDay = async (k = 10) => { let q; for (let i = 0; i < k; i++) q = await playRound(); return q; };
r = await playDay(); const st1 = r.body.prog.fest.stamps;
check(st1.length === 1 && st1[0] === "2026-10-14" && r.body.prog.mis.played >= 10, "10 blackjack hands on day 1: the first stamp");
// three blackjacks in a row: a shoe stacked A♠ 5♥ K♠ 6♥ (you: A K; ARCIA: 5 6, no peek)
{ const R = db.get(`worldBjRound/${a1}`), shoe = Array.from({ length: 312 }, (_, i) => [12, 16, 11, 17][i % 4]); R.s = { ...R.s, shoe, ptr: 0, phase: "done" }; R.bjRun = 0; db.set(`worldBjRound/${a1}`, R);
  const c0 = (await call(p1, "world-poker-me")).body.prog.chips; let q; for (let i = 0; i < 3; i++) { TT += 4000; q = await call(p1, "world-bj-deal", { table: "b1", bet: 100 }); }
  check(q.body.round.hands[0].res === "blackjack" && q.body.prog.chips === c0 + 3 * 150 + F.BJ3 && q.body.prog.news.some((x) => x.t === "bj3"), "three blackjacks in a row: +10,000 chips on top of the 3:2 pays"); }
// day 2 in happy hour: mission progress ×2, the stamp counts real hands
TT = KST("2026-10-15T20:30:00"); r = await call(p1, "world-poker-me"); check(r.body.prog.fest.happy === true && r.body.prog.fest.day === 2, "20:30 Seoul on day 2: happy hour");
r = await playDay(5); check(r.body.prog.mis.bj >= 10 && r.body.prog.mis.played >= 5 && r.body.prog.mis.played < 10 && r.body.prog.fest.stamps.length === 1, "happy hour: 5 hands count 10+ toward the mission, but a stamp still needs 10 real hands");
r = await playDay(5); check(r.body.prog.fest.stamps.length === 2, "10 real hands on day 2: the second stamp");
// (the festival week's table board, as the tables would have written it)
const p2 = ethers.Wallet.createRandom(), p3 = ethers.Wallet.createRandom(), a2 = p2.address.toLowerCase(), a3 = p3.address.toLowerCase();
const wk = isoWeek(KST("2026-10-16T12:00:00")); db.set(`worldStats/pokerWeek_${wk}`, { top: [{ id: a2, w: "x", name: "Two", n: 9000 }, { id: a3, w: "y", name: "Three", n: 4000 }, { id: a1, w: "z", name: "One", n: -50 }] });
// days 3–7: the stamp card pays 500, 1,000, 2,000 ARCL and the Opening Night card back
const b0 = bal(p1); let at3 = 0, at5 = 0;
for (let d = 3; d <= 7; d++) { TT = KST(`2026-10-${13 + d}T12:00:00`); r = await playDay(); if (d === 3) at3 = bal(p1) - b0; if (d === 5) at5 = bal(p1) - b0; }
check(at3 === 500 && at5 === 1500 && bal(p1) - b0 === 3500, `the stamp card: +500 at 3 stamps, +1,000 at 5, +2,000 at 7 (${bal(p1) - b0} ARCL from stamps over these days, missions apart)`);
r = await call(p1, "world-poker-me"); check(r.body.prog.fest.stamps.length === 7 && r.body.prog.unlocks.includes("back:night"), "all 7 stamps: the Opening Night card back");
{ const b1 = bal(p1); TT += 60e3; await playDay(10); check(bal(p1) === b1, "the stamp card pays each step once"); }
// the festival week's top 3 table winners, paid once the week is over
TT = KST("2026-10-19T09:00:00"); r = await W.read(new URL("http://x/api/social?world=poker-top"));
const g2 = await call(p2, "world-poker-me"), g3 = await call(p3, "world-poker-me");
check(g2.body.prog.chips === F.CHAMP[0] && g2.body.prog.unlocks.includes("felt:champ") && g2.body.prog.titles.includes("Table Champion") && g3.body.prog.chips === F.CHAMP[1], "the week over: 1st +500,000 chips, 2nd +300,000 (the free top-up only fills a stack under 40,000), with the Champion Gold felt and the title");
check(!(await call(p1, "world-poker-me")).body.prog.unlocks.includes("felt:champ"), "a week's net loss wins nothing");
await W.read(new URL("http://x/api/social?world=poker-top")); check((await call(p2, "world-poker-me")).body.prog.chips === F.CHAMP[0], "the champions are paid once");
// a royal flush shown at a table: chips, a title, a line in everyone's feed — once
{ const PE = await import("../../world-poker-engine.js");
  let q = await call(p1, "world-poker-create", { stake: "s1" }); const rid = q.body.room.id; q = await call(p1, "world-poker-bots", { room: rid, n: 1, lvl: 1 });
  const R = db.get(`worldPokerRoom/${rid}`), H = R.hand; H.street = 4; H.toAct = -1; H.paid = false; H.endAt = TT;
  H.result = { pots: [{ amt: 40, win: [H.seatOf.indexOf(0)], elig: [0, 1] }], shown: [{ i: H.seatOf.indexOf(0), hole: [12, 11], cat: 9, name: PE.HANDS[9], five: [12, 11, 10, 9, 8] }, { i: 1 - H.seatOf.indexOf(0), hole: [0, 14], cat: 0, name: PE.HANDS[0], five: [] }], net: [0, 0], uncontested: false };
  db.set(`worldPokerRoom/${rid}`, R); const c0 = (await call(p1, "world-poker-me")).body.prog.chips;
  TT += 1000; q = await call(p1, "world-poker-view", { room: rid }); TT += 1000; await call(p1, "world-poker-view", { room: rid });
  const me1 = (await call(p1, "world-poker-me")).body.prog, feed = (await W.read(new URL("http://x/api/social?world=drops"))).body.drops || [];
  check(me1.chips - c0 >= F.ROYAL && me1.titles.includes("ARCIA's Chosen") && feed.some((d) => d.k === "royal"), "a royal flush at a table: +100,000 chips, the \"ARCIA's Chosen\" title, and everyone's feed hears it");
  await call(p1, "world-poker-leave", { room: rid }); }
// after the festival: ordinary days
TT = KST("2026-10-22T12:00:00"); const p4 = ethers.Wallet.createRandom(); r = await call(p4, "world-poker-me");
check(r.body.prog.fest === null && r.body.prog.chips === POKER.DAY_CHIPS, "day 8: the festival is over, free chips back to 20,000");
db.set(`worldArclBal/${p4.address.toLowerCase()}`, { bal: 5000 }); r = await call(p4, "world-poker-buy", { pack: "p1" }); check(r.body.bonus === 0, "no first-purchase bonus after the festival");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
