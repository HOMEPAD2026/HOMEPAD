// pokersng.test.mjs — b-pky2 in ARCIA POKER LOUNGE (api/_world-poker.mjs): the scheduled Sit & Go (sign up with the
// entry in chips and get it back if you change your mind, the computers fill the seats at the start, tournament chips
// that aren't yours, the blinds by the hand, the places from the top, the top 3's prizes in chips + XP + the title,
// paid once even if everyone left), the lounge's presence and emotes, and the count of people watching a table.
// On an in-memory store. Run: node tests/world/pokersng.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { SNG, sngAt, sngBlinds, sngPrizes } = await import("../../api/_world-poker.mjs");
const E = await import("../../world-poker-engine.js");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, JSON.parse(JSON.stringify(x.data))); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let TT = Date.parse("2026-10-14T03:10:00Z"), n = 0;
db.set("worldStats/pokerFest", { start: 0, day0: "1970-01-01" });
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => TT, randomId: () => "id" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(TT).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const chips = (w) => (db.get(`worldPokerProg/${w.address.toLowerCase()}`) || {}).chips || 0;
const bought = (w) => (db.get(`worldPokerBought/${w.address.toLowerCase()}`) || {}).n || 0;
const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), C = ethers.Wallet.createRandom();

// the clock: every 2 hours on even UTC hours; the blinds by the hand; the prizes from the entries + the house's
check(sngAt(TT) === Date.parse("2026-10-14T04:00:00Z") && sngAt(TT, 1) === Date.parse("2026-10-14T06:00:00Z"), "a Sit & Go every 2 hours (04:00, 06:00 UTC …)");
check(sngBlinds(1)[1] === 20 && sngBlinds(SNG.LV_HANDS)[1] === 20 && sngBlinds(SNG.LV_HANDS + 1)[1] === 40 && sngBlinds(999)[1] === SNG.BLINDS.at(-1)[1], "the blinds rise every 5 hands, up to the last level");
{ const { pool, pay } = sngPrizes(2); check(pool === 2 * SNG.ENTRY + SNG.HOUSE && pay.reduce((a, b) => a + b, 0) <= pool && pay[0] > pay[1] && pay[1] > pay[2], `prizes: ${pay.join(" / ")} of ${pool}`); }

for (const w of [A, B, C]) await call(w, "world-poker-me");
let r = await call(A, "world-poker-sng"); const next = r.body.list[0];
check(r.status === 200 && r.body.list.length === 2 && next.state === "reg" && next.n === 0 && next.at === sngAt(TT), "the lobby: the next two, open for sign-up");
const c0 = chips(A);
r = await call(A, "world-poker-sng-reg", { id: next.id, ch: "custom-lumi", tn: 1 }); check(r.status === 200 && r.body.sng.n === 1 && r.body.sng.mine && chips(A) === c0 - SNG.ENTRY, "sign up: the entry comes off your chips");
r = await call(A, "world-poker-sng-reg", { id: next.id }); check(r.status === 200 && r.body.sng.n === 1 && chips(A) === c0 - SNG.ENTRY, "signing up twice: once");
r = await call(A, "world-poker-sng-unreg", { id: next.id }); check(r.status === 200 && r.body.sng.n === 0 && chips(A) === c0, "changed your mind: the entry back");
r = await call(A, "world-poker-sng-reg", { id: String(sngAt(TT, 3)) }); check(r.status === 400, "sign-up opens for the next two only");
r = await call(A, "world-poker-sng-reg", { id: "1234567890123" }); check(r.status === 400, "a made-up Sit & Go: refused");
await call(A, "world-poker-sng-reg", { id: next.id, ch: "custom-lumi" }); await call(B, "world-poker-sng-reg", { id: next.id, ch: "custom-nex" });
// it starts: 2 people + 4 computers, the tournament chips
TT = next.at + 1000; r = await call(C, "world-poker-sng");
const S = r.body.list[0]; check(S.id === next.id && S.state === "play" && S.room, "at the time: it starts, a table of its own");
r = await call(C, "world-poker-sng-reg", { id: next.id }); check(r.status === 409, "too late to sign up once it's started");
r = await call(A, "world-poker-view", { room: S.room }); const V = r.body.room;
check(V.me >= 0 && V.tour && V.tour.n === 6 && V.seats.filter((x) => x && x.bot).length === 4 && V.seats.every((x) => !x || x.stack <= SNG.START) && V.tour.sb === 10, "2 people, 4 computers, 1,500 tournament chips each, blinds 10/20");
r = await call(C, "world-poker-join", { room: S.room }); check(r.status === 409, "someone not signed up can't sit down");
r = await call(A, "world-poker-bots", { room: S.room, n: 1 }); check(r.status === 409, "no extra computers at a Sit & Go");
const roomsL = await W.read(new URL("http://x/api/social?world=poker-rooms")); check(!roomsL.body.rooms.some((x) => x.id === S.room), "not in the open tables list");
// a watcher is counted
r = await W.handle({ action: "world-poker-view", room: S.room, vt: "watch123" }); check(r.status === 200 && r.body.room.watch === 1 && r.body.room.me === -1, "a watcher: 1 watching");
// A plays its hands; B leaves (its seat folds from then on); the table plays to the end
await call(B, "world-poker-leave", { room: S.room });
let guard = 0, fails = 0, lastV = null;
while (guard++ < 4000) {
  TT += 1500; const q = await call(A, "world-poker-view", { room: S.room }); if (q.status !== 200) { fails++; break; } lastV = q.body.room;
  if (lastV.tour && lastV.tour.done) break;
  const H = lastV.hand; if (H && H.street < 4 && H.toAct === H.mine) { const L = E.legal(H); const m = L.raise && guard % 3 === 0 ? { t: "allin" } : L.check ? { t: "check" } : { t: "call" }; const a = await call(A, "world-poker-act", { room: S.room, ...m }); if (a.status !== 200) fails++; }
}
check(lastV && lastV.tour && lastV.tour.done && fails === 0, `played to the end (${guard} looks, the blinds at ${lastV && lastV.tour ? lastV.tour.bb : "?"})`);
const places = lastV.tour.places || [];
check(places.length === 6 && new Set(places.map((y) => y.name)).size === 6, "six places, everyone once: " + places.map((y) => y.name).join(", "));
const Raw = db.get(`worldPokerRoom/${S.room}`); const tour = Raw.tour, aw = A.address.toLowerCase(), bw = B.address.toLowerCase();
const rankOf = (w) => places.findIndex((y) => y.w && w.startsWith(y.w.slice(0, 6)) && w.endsWith(y.w.slice(-4)));
const ra = rankOf(aw), rb = rankOf(bw);
check(ra >= 0 && rb >= 0 && lastV.tour.mine === ra, `your place shown to you (A ${ra + 1}, B ${rb + 1})`);
const want = (r) => (r >= 0 && r < 3 ? tour.pay[r] : 0);
check(bought(A) === want(ra) && bought(B) === want(rb), `the top 3's prizes in chips (A +${bought(A)}, B +${bought(B)})`);
const pa = db.get(`worldPokerProg/${aw}`);
check((ra === 0) === ((db.get(`worldPokerAward/${aw}`) || { titles: [] }).titles.includes(SNG.TITLE)) && (ra < 3 ? (pa.news || []).some((x) => x.t === "sng") : true), "the winner's title, a line in the news");
// paid once: another look changes nothing
for (let k = 0; k < 3; k++) { TT += 2000; await call(A, "world-poker-view", { room: S.room }); await call(A, "world-poker-sng"); }
check(bought(A) === want(ra) && bought(B) === want(rb), "paid once, however many look afterwards");
await call(A, "world-poker-me"); check(chips(A) === c0 - SNG.ENTRY + want(ra) && ![...db.keys()].some((k) => k.startsWith("worldPokerWeek/") && k.endsWith(aw)), `tournament chips never go back to your chips (only the prize: ${chips(A)}), nor on the week's board`);
r = await call(C, "world-poker-sng"); const done = r.body.list.find((g) => g.id === next.id); check(done && done.state === "done" && done.places && done.places.length === 6, "the lobby shows the finished one with its places");

// a Sit & Go no one signed up for: skipped quietly
{ const id = String(sngAt(TT)); TT = Number(id) + 500; r = await call(C, "world-poker-sng"); const g = db.get(`worldPokerSng/${id}`); check(r.status === 200 && (!g || !g.room), "no one signed up: no table"); }
// everyone left: the lobby's look finishes it and the places are paid
{ TT += 60e3; const id = String(sngAt(TT)); await call(C, "world-poker-sng-reg", { id }); const cb = bought(C); TT = Number(id) + 1000; r = await call(C, "world-poker-sng"); const rm = r.body.list.find((g) => g.id === id).room;
  await call(C, "world-poker-leave", { room: rm }); for (let k = 0; k < 40; k++) { TT += 3000; r = await call(A, "world-poker-sng"); const g = r.body.list.find((x) => x.id === id); if (g && g.state === "done") break; }
  const g = r.body.list.find((x) => x.id === id); check(g && g.state === "done" && bought(C) >= cb, `everyone left: it still finishes and pays (C +${bought(C) - cb})`); }

// the lounge: who's walking it, their emotes
r = await call(A, "world-poker-here", { x: 1, z: 8, f: 0.5, ch: "custom-lumi", tn: 2 }); check(r.status === 200 && Array.isArray(r.body.list), "presence: you're in the lounge");
r = await call(B, "world-poker-here", { x: -2, z: 6, em: "wave", ch: "custom-nex" }); check(r.status === 200 && r.body.list.length === 1 && r.body.list[0].ch === "custom-lumi" && r.body.list[0].x === 1, "another person sees you there, as your hero");
r = await call(A, "world-poker-here", { x: 1, z: 8 }); check(r.body.list.length === 1 && r.body.list[0].em === "wave", "and their wave");
r = await call(A, "world-poker-here", { x: 500, z: 0 }); check(r.status === 400, "a spot outside the lounge: refused");
r = await call(A, "world-poker-here", { x: 0, z: 0, em: "<script>" }); check(r.status === 200, "an emote that isn't one is dropped");
TT += 30e3; r = await call(A, "world-poker-here", { x: 0, z: 0 }); check(r.body.list.length === 0, "gone after 20 seconds without a word");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
