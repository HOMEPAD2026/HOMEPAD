// kartevent.test.mjs — the ARCIRCLE KART GRAND OPENING EVENT (api/_world-kartevent.mjs, world-kart-event-data.js): the window
// and its five time zones across the US daylight-time change, Race / Daily ends counted only when the kart server accepted
// them inside it (never Time Attack, never before / after), the Time Attack board on Magma Run only (order, ties → the earlier
// time, ghosts for the top 10), clip URLs checked and held once, the GM-only list (?world=kart-event-gm). Only the tally:
// nothing pays. On an in-memory store. Run: node tests/world/kartevent.test.mjs
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { KEV, kevPhase, kevOn, taPrize, TA_TOTAL, clipOf, taOrder, EVENT_START, EVENT_END, kevTimes, kevWhen } = await import("../../world-kart-event-data.js");
const { GM_WALLETS } = await import("../../api/_world-village.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

// ---- the shared numbers ----
check(KEV.END - KEV.START === 72 * 3600e3 && /Z$/.test(EVENT_START) && /Z$/.test(EVENT_END), `the window is 72 h, both ends in UTC (${EVENT_START} → ${EVENT_END})`);
check(kevPhase(KEV.START - 1) === "soon" && kevPhase(KEV.START) === "on" && kevPhase(KEV.END - 1) === "on" && kevPhase(KEV.END) === "over" && !kevOn(KEV.END), "the phases: soon · on · over");
check(TA_TOTAL === 8000000 && taPrize(1) === 3000000 && taPrize(2) === 2000000 && taPrize(3) === 1000000 && taPrize(5) === 500000 && taPrize(6) === 200000 && taPrize(10) === 200000 && taPrize(11) === 0, "Time Attack prizes: 3M · 2M · 1M · 500k ×2 · 200k ×5 = 8,000,000");
check(KEV.RACES.need === 10 && KEV.RACES.arcl === 50000 && KEV.CLIP.usd.join() === "30,20,10" && KEV.TA.track === "volcano", "10 races → 50,000 ARCL; clips 30 / 20 / 10 USDC; Magma Run");
check(clipOf("https://x.com/Racer_1/status/1850000000000000001").url === "https://x.com/Racer_1/status/1850000000000000001", "an x.com post is taken");
check(clipOf("https://twitter.com/abc/status/123456789?s=20").url === "https://x.com/abc/status/123456789" && clipOf(" https://www.x.com/abc/status/123456789/video/1 ").id === "123456789" && !!clipOf("https://mobile.twitter.com/abc/status/123456"), "twitter.com / www. / mobile. and ?s= / /video/1 normalize to x.com");
check(!clipOf("http://x.com/abc/status/123456") && !clipOf("https://x.com/abc") && !clipOf("https://evil.com/abc/status/123456") && !clipOf("https://x.com.evil.com/a/status/123456") && !clipOf("https://x.com/i/status/123456") && !clipOf("javascript:alert(1)") && !clipOf("https://x.com/a b/status/123456"), "not an X post: refused (http, no status, other hosts, look-alikes, spaces)");
check([{ t: 60, at: 5 }, { t: 59, at: 9 }, { t: 60, at: 2 }].sort(taOrder).map((x) => x.at).join() === "9,2,5", "the board's order: the faster time, a tie → the earlier");

// ---- the five time zones across the US daylight-time change (Sun 1 Nov 2026, inside the event) ----
{ const s = Date.parse("2026-10-31T16:00:00Z"), e = Date.parse("2026-11-03T16:00:00Z"), en = kevTimes("en", s, e);
  check(en.main[0] === "Oct 31, 12:00 PM ET → Nov 3, 11:00 AM ET" && en.main[1] === "Oct 31, 9:00 AM PT → Nov 3, 8:00 AM PT", "ET / PT: 12:00 PM EDT → 11:00 AM EST, 9:00 AM PDT → 8:00 AM PST (" + en.main.join(" | ") + ")");
  check(en.rest === "KST Nov 1, 1:00 AM → Nov 4, 1:00 AM · CST Nov 1, 12:00 AM → Nov 4, 12:00 AM · TRT Oct 31, 7:00 PM → Nov 3, 7:00 PM", "KST / CST / TRT don't move: " + en.rest);
  check(kevWhen(Date.parse("2026-11-01T05:30:00Z"), "America/New_York") === "Nov 1, 1:30 AM" && kevWhen(Date.parse("2026-11-01T06:30:00Z"), "America/New_York") === "Nov 1, 1:30 AM", "1:30 AM ET happens twice on 1 Nov (EDT, then EST)");
  const ko = kevTimes("ko", s, e), zh = kevTimes("zh", s, e), tr = kevTimes("tr", s, e);
  check(ko.main.length === 1 && /KST/.test(ko.main[0]) && /1:00/.test(ko.main[0]) && /^ET /.test(ko.rest), "ko: KST first (" + ko.main[0] + ")");
  check(/北京时间/.test(zh.main[0]) && /0:00/.test(zh.main[0]) && /TSİ/.test(tr.main[0]) && /19:00/.test(tr.main[0]), "zh: 北京时间 first, tr: TSİ first (" + zh.main[0] + " | " + tr.main[0] + ")");
  check(kevTimes("en").main.length === 2, "the event's own window formats"); }

// ---- the server ----
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let T = KEV.START - 3600e3, n = 0;
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, randomId: () => "kev" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const read = async (q) => (await W.read(new URL("http://x/api/social?" + q))).body;
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const lc = (w) => w.address.toLowerCase();
const L3 = (a = 30, b = 30, c = 30) => ({ laps: [a, b, c], time: a + b + c });
async function race(w, mode, track = "nexus", laps = L3(), place = 2) { const s = await call(w, "world-kart-start", { track, mode, racer: "pepe" }); T += (laps.time + 4) * 1000; return call(w, "world-kart-end", { raceId: s.body.raceId, place, ...laps, racer: "pepe", ghost: "a,b,c;d,e,f" }); }
const p1 = ethers.Wallet.createRandom(), p2 = ethers.Wallet.createRandom(), p3 = ethers.Wallet.createRandom(), p4 = ethers.Wallet.createRandom(), gm = ethers.Wallet.createRandom();
GM_WALLETS.push(lc(gm));
db.set(`worldSave/${lc(p1)}`, { name: "Speedy" }); db.set(`worldSave/${lc(p2)}`, { name: "Drifter" });

// before the window: nothing counts, no clips
let r = await race(p1, "race"); check(r.status === 200 && !r.body.ev, "a race before the event: accepted by KART, not counted by the event");
check((await call(p1, "world-kev-clip", { url: "https://x.com/a/status/123456" })).status === 400, "no clip before the event");
let ev = await read("world=kart-event&wallet=" + lc(p1)); check(ev.phase === "soon" && ev.races.n === 0 && ev.start === KEV.START && ev.end === KEV.END, "the event's read: soon, 0 races");
// a race started before the window and ended inside it doesn't count either
{ T = KEV.START - 60e3; const s = await call(p1, "world-kart-start", { track: "nexus", mode: "race", racer: "pepe" }); T = KEV.START + 60e3; r = await call(p1, "world-kart-end", { raceId: s.body.raceId, place: 1, ...L3() }); check(r.status === 200 && !r.body.ev, "a race started before the window: not counted"); }
// inside: Race and Daily count, Time Attack doesn't
r = await race(p1, "race"); check(r.body.ev && r.body.ev.races === 1 && r.body.ev.need === 10, "a race inside the window: 1/10 (" + JSON.stringify(r.body.ev) + ")");
r = await race(p1, "daily"); check(r.body.ev && r.body.ev.races === 2, "a daily counts: 2/10");
r = await race(p1, "ta", "nexus"); check(!(r.body.ev && r.body.ev.races), "Time Attack on another track: not a race, not on the board");
// a refused end isn't counted
{ const s = await call(p1, "world-kart-start", { track: "nexus", mode: "race", racer: "pepe" }); T += 95e3; r = await call(p1, "world-kart-end", { raceId: s.body.raceId, place: 1, laps: [30, 10, 30], time: 70 }); check(r.status === 400 && (db.get(`worldKevRace/${lc(p1)}`) || {}).n === 2, "a refused end (a lap too fast) isn't counted"); }
for (let i = 0; i < 8; i++) r = await race(p1, i % 2 ? "race" : "daily");
check(r.body.ev.races === 10 && (db.get("worldStats/kevQual").list || []).includes(lc(p1)), "ten races: qualified (on the GM's list)");
r = await race(p1, "race"); check(r.body.ev.races === 10 && r.body.ev.n === 11, "an 11th race: progress stays 10/10");
ev = await read("world=kart-event&wallet=" + lc(p1)); check(ev.phase === "on" && ev.races.n === 11 && !ev.races.paid && ev.counts.qualified === 1, "the read: on, 11 races, not paid yet");
for (let i = 0; i < 9; i++) await race(p2, "race"); check(!(db.get("worldStats/kevQual").list || []).includes(lc(p2)), "nine races: not qualified");

// Time Attack championship on Magma Run
const taRun = (w, a) => race(w, "ta", "volcano", L3(a, a, a));
r = await taRun(p1, 25); check(r.body.ev && r.body.ev.ta.rank === 1 && r.body.ev.ta.t === 75, "a Magma Run time attack: #1 on the event board");
check(db.get(`worldKevGhost/${lc(p1)}`).t === 75, "the top 10's ghost is kept");
r = await taRun(p2, 24); check(r.body.ev.ta.rank === 1, "a faster time takes #1");
r = await taRun(p1, 26); check(r.body.ev.ta.rank === 2 && r.body.ev.ta.t === 75 && !r.body.ev.ta.better && db.get(`worldKevGhost/${lc(p1)}`).t === 75, "a slower run keeps the wallet's best and its ghost");
r = await taRun(p3, 25); check(r.body.ev.ta.rank === 3, "a tie: the earlier time stays ahead (3rd behind p1's 75)");
r = await race(p4, "race", "volcano"); check(!(r.body.ev && r.body.ev.ta), "a race on Magma Run isn't on the Time Attack board");
const board = await read("world=kart-event-ta&wallet=" + lc(p3)); check(board.top.length === 3 && board.top[0].name === "Drifter" && board.top.map((x) => x.t).join() === "72,75,75" && board.me.rank === 3 && !board.top[0].id && !board.top[0].laps, "the board: top in order, your place, no full wallets in public (" + JSON.stringify(board.top.map((x) => x.t)) + ")");
check(db.get(`worldKevGhost/${lc(p2)}`).t === 72, "the #1's ghost is kept for review");

// clips
r = await call(p1, "world-kev-clip", { url: "notalink" }); check(r.status === 400, "a clip that isn't an X post: refused");
r = await call(p1, "world-kev-clip", { url: "https://twitter.com/speedy/status/1111111111?s=20" }); check(r.status === 200 && r.body.clip.url === "https://x.com/speedy/status/1111111111", "a clip sent in (normalized)");
r = await call(p2, "world-kev-clip", { url: "https://x.com/speedy/status/1111111111" }); check(r.status === 409, "the same post from another wallet: refused");
r = await call(p1, "world-kev-clip", { url: "https://x.com/speedy/status/2222222222" }); check(r.status === 200 && !db.has("worldKevClipUrl/1111111111") && db.get("worldStats/kevClips").list.length === 1, "editable: one a wallet, the old post let go");
r = await call(p2, "world-kev-clip", { url: "https://x.com/drifter/status/1111111111" }); check(r.status === 200, "the let-go post can be sent by someone else");
await call(p3, "world-kev-clip", { url: "https://x.com/p3/status/3333333333" });
ev = await read("world=kart-event&wallet=" + lc(p1)); check(ev.clip && ev.clip.url === "https://x.com/speedy/status/2222222222" && ev.counts.clips === 3, "the read shows my clip");

// the team's list: GM only, a signed session in the query; nothing in it pays
const gmq = async (w) => { const s0 = await sign(w); return W.read(new URL(`http://x/api/social?world=kart-event-gm&wallet=${s0.wallet}&issued=${encodeURIComponent(s0.issued)}&signature=${s0.signature}`)); };
r = await gmq(p1); check(r.status === 403, "a player can't read the GM list");
r = await W.read(new URL(`http://x/api/social?world=kart-event-gm&wallet=${lc(gm)}`)); check(r.status !== 200, "no signature: refused");
r = await gmq(gm); check(r.status === 200 && r.body.races.length === 1 && r.body.races[0].name === "Speedy" && r.body.races[0].n === 11 && r.body.races[0].last > 0 && r.body.ta.length === 3 && r.body.ta[0].w === lc(p2) && r.body.ta[0].t === 72 && r.body.ta[0].ghost === `worldKevGhost/${lc(p2)}` && r.body.clips.length === 3 && r.body.clips.every((c) => /^https:\/\/x\.com\//.test(c.url) && c.w && c.at), "the GM list: qualified wallets (name, races, last), the top 10 (name, wallet, time, ghost id), the clips (name, wallet, url, time)");
T = KEV.END + 1;
r = await race(p2, "race"); check(!r.body.ev, "a race after the event: not counted");
r = await taRun(p4, 20); check(!(r.body.ev && r.body.ev.ta) && (await read("world=kart-event-ta")).top.length === 3, "a time attack after the event: not on the board");
r = await call(p2, "world-kev-clip", { url: "https://x.com/drifter/status/4444444444" }); check(r.status === 400, "no clip edits after the end");
check(![...db.keys()].some((k) => /^worldKevPaid/.test(k)) && ![...db.values()].some((v) => JSON.stringify(v || "").includes("kartevent")), "the event pays nothing itself (no payout records, no \"kartevent\" ledger lines)");
console.log(`\n${ok} pass ${bad} fail`); process.exit(bad ? 1 : 0);
