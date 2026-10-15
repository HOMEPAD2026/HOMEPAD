// rank.test.mjs — weekly bounties, party quests, the popular-village rankings and their prizes (api/_world-rank.mjs):
// kill counts from the server's own hunt points, once-only claims, a server party of friends, week / month / all-time
// top lists, a period's top three frozen once, the level gate on likes. Run: node tests/world/rank.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const R = await import("../../api/_world-rank.mjs");
const { isoWeek } = await import("../../api/_world-shop.mjs");
const { pairKey } = await import("../../api/_world-chat.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

const db = new Map(); let reads = 0;
const store = {
  getDocs: async (ps) => { reads += ps.length; return Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])); },
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => {
    for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; if (x.del && !db.has(x.del)) return { ok: false, conflict: true }; }
    for (const x of ws) {
      if (x.create) db.set(x.create, JSON.parse(JSON.stringify(x.data)));
      else if (x.set) db.set(x.set, JSON.parse(JSON.stringify(x.data)));
      else if (x.del) db.delete(x.del);
      else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, n] of Object.entries(x.fields)) d[k] = (d[k] || 0) + n; db.set(x.inc, d); }
    }
    return { ok: true };
  },
};
const json = (status, body, cache) => ({ status, body, cache });
let T = Date.parse("2026-10-14T03:00:00Z"); // a Wednesday
const caps = { day: 30000 };
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, dayCap: () => caps.day });
const who = async (name, xp = 300) => {
  const w = ethers.Wallet.createRandom(), issued = new Date(T).toISOString(), id = w.address.toLowerCase();
  if (name) db.set("worldSave/" + id, { name, xp, xpv: 2, at: T });
  return { w: id, S: { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) } };
};
const act = (p, a, body) => W.handle({ action: a, ...p.S, ...body });
const get = (q) => W.read(new URL("http://x/api/social?world=" + q));
const bal = (p) => (db.get(`worldArclBal/${p.w}`) || {}).bal || 0;
const wk = () => isoWeek(T);
const setK = (p, k, week = wk()) => db.set(`worldHuntWeek/${week}_${p.w}`, { n: k * 2, k });
const addK = (p, k) => { const d = db.get(`worldHuntWeek/${wk()}_${p.w}`) || { n: 0, k: 0 }; db.set(`worldHuntWeek/${wk()}_${p.w}`, { n: d.n + 2 * k, k: d.k + k }); };
const friends = (a, b) => db.set(`worldFriend/${pairKey(a.w, b.w)}`, { a: a.w, b: b.w, st: "ok" });
const bounty = async (p) => (await get("bounty&wallet=" + p.w)).body;

// ---- the numbers ----
check(R.BOUNTIES.map((b) => b.kills).join() === "100,300,600" && R.BOUNTIES.map((b) => b.arcl).join() === "40,100,200", "bounties: 100 / 300 / 600 kills for 40 / 100 / 200 ARCL");
check(R.PARTY.max === 4 && R.PARTY.kills === 500 && R.VILLAGE_PRIZE.week.join() === "500,300,150" && R.VILLAGE_PRIZE.month.join() === "2000,1000,500" && R.RANK_MIN_LV === 3, "party of 4, 500 kills; prizes 500/300/150 and 2000/1000/500; level 3 for likes");

// ---- the server counts kills: a hunt claim adds one ----
const A = await who("Ann"), B = await who("Bob"), C = await who("Cy"), D = await who("Di"), E = await who("Ed");
let r = await act(A, "world-arcl-claim", { kind: "street" });
check(r.status === 200 && (db.get(`worldHuntWeek/${wk()}_${A.w}`) || {}).k === 1, "a counted knock-out adds 1 to this week's kills (k)");
r = await act(A, "world-arcl-claim", { kind: "bounty" });
check(r.status === 400, "the bounty isn't claimed through the plain ARCL claim");

// ---- bounties ----
setK(A, 99);
r = await act(A, "world-bounty-claim", { id: "b100" }); check(r.status === 400, "99 kills: the 100-kill bounty is refused");
let v = await bounty(A);
check(v.kills === 99 && v.bounties.length === 3 && v.bounties.every((b) => !b.done && !b.claimed) && v.week === wk(), "the view shows progress, nothing done");
setK(A, 100); const before = bal(A);
r = await act(A, "world-bounty-claim", { id: "b100" });
check(r.status === 200 && r.body.credited === 40 && bal(A) - before === 40, "100 kills: 40 ARCL");
r = await act(A, "world-bounty-claim", { id: "b100" }); check(r.status === 409 && bal(A) - before === 40, "a bounty is claimed once a week");
r = await act(A, "world-bounty-claim", { id: "b300" }); check(r.status === 400, "300-kill bounty: not yet");
v = await bounty(A); check(v.bounties[0].claimed && v.bounties[0].done && !v.bounties[1].done, "the view: first claimed, second not done");
setK(A, 650);
r = await act(A, "world-bounty-claim", { id: "b300" }); const r2 = await act(A, "world-bounty-claim", { id: "b600" });
check(r.body.credited === 100 && r2.body.credited === 200 && bal(A) - before === 340, "300 and 600: 100 and 200 ARCL");
r = await act(A, "world-bounty-claim", { id: "nope" }); check(r.status === 400, "an unknown bounty: refused");
// next week: counts and claims start over
T += 7 * 864e5; v = await bounty(A); check(v.kills === 0 && v.bounties.every((b) => !b.claimed), "a new week starts the kills and the claims over");
setK(A, 100); r = await act(A, "world-bounty-claim", { id: "b100" }); check(r.status === 200 && r.body.credited === 40, "next week the bounty can be claimed again");
// the daily cap holds: no room today, the claim isn't spent
const dayOf = () => new Date(T + 9 * 3600e3).toISOString().slice(0, 10), full = (p) => db.set(`worldArclDay/${p.w}_${dayOf()}`, { n: 30000 });
full(B); setK(B, 100);
r = await act(B, "world-bounty-claim", { id: "b100" }); check(r.status === 429 && !db.has(`worldRankOnce/${B.w}_b100_${wk().replace(/\W/g, "")}`), "no room in today's ARCL cap: refused and the claim isn't used up");
db.set(`worldArclDay/${B.w}_${dayOf()}`, { n: 0 }); r = await act(B, "world-bounty-claim", { id: "b100" }); check(r.status === 200 && r.body.credited === 40, "...and works once there is room");
const rd0 = reads; await bounty(C); check(reads - rd0 <= 6, `the bounty view for a player with no party reads ${reads - rd0} documents (≤ 6)`);
r = await get("bounty"); check(r.status === 200 && /max-age=30/.test(r.cache) && r.body.bounties.length === 3, "no wallet: the public list, cached 30 s");

// ---- parties ----
setK(A, 0); setK(B, 50); setK(C, 0); setK(D, 0); setK(E, 0);
r = await act(B, "world-party-invite", { to: A.w }); check(r.status === 400, "no party yet: can't invite");
r = await act(A, "world-party-create", {}); check(r.status === 200 && r.body.party && r.body.party.lead === A.w && r.body.party.members.length === 1 && r.body.party.goal === 500, "a party is created, you are its leader");
r = await act(A, "world-party-create", {}); check(r.status === 409, "one party at a time");
r = await act(A, "world-party-invite", { to: B.w }); check(r.status === 403, "an invite goes to friends only");
friends(A, B); friends(A, C); friends(A, D); friends(A, E);
r = await act(A, "world-party-invite", { to: B.w }); check(r.status === 200, "a friend is invited");
r = await act(B, "world-party-invite", { to: C.w }); check(r.status === 400 || r.status === 403, "an invited friend can't invite yet");
let m = (await get("party&wallet=" + B.w)).body; check(m.party === null && m.invites.length === 1 && m.invites[0].from === A.w, "their small view shows the invitation");
const pid = m.invites[0].id;
r = await act(C, "world-party-accept", { id: pid }); check(r.status === 404, "an invitation can only be taken by the one it was sent to");
r = await act(B, "world-party-accept", { id: pid });
check(r.status === 200 && r.body.party.members.length === 2 && r.body.invites.length === 0, "the friend accepts and is in");
m = (await get("party&wallet=" + B.w)).body; check(m.party && m.party.members.map((x) => x.w).sort().join() === [A.w, B.w].sort().join() && m.party.lead === A.w, "the small view lists the party (the XP bonus comes from it)");
r = await act(A, "world-party-invite", { to: C.w }); await act(A, "world-party-invite", { to: D.w });
await act(C, "world-party-accept", { id: pid }); r = await act(D, "world-party-accept", { id: pid });
check(r.status === 200 && r.body.party.members.length === 4, "up to four (the leader and three friends)");
r = await act(A, "world-party-invite", { to: E.w }); check(r.status === 409, "a fifth: refused");
// kills since each joined count: B had 50 before joining
addK(A, 300); addK(B, 150); addK(C, 60);
v = await bounty(A);
check(v.party.total === 510 && v.party.members.find((x) => x.w === B.w).k === 150 && v.party.done, "the party's total is the kills since joining (B's 50 before don't count): 510");
r = await act(D, "world-party-claim", {}); check(r.status === 400, "a member with fewer than 20 kills of their own can't claim");
const b0 = bal(A); r = await act(A, "world-party-claim", {});
check(r.status === 200 && r.body.credited === R.PARTY.arcl && bal(A) - b0 === R.PARTY.arcl && r.body.party.claimed, "a member who did their part claims the party's ARCL");
r = await act(A, "world-party-claim", {}); check(r.status === 409, "...once");
const bb = bal(B); r = await act(B, "world-party-claim", {}); check(r.status === 200 && bal(B) - bb === R.PARTY.arcl, "each member claims for themselves");
r = await act(B, "world-party-kick", { to: C.w }); check(r.status === 403, "only the leader removes someone");
r = await act(A, "world-party-kick", { to: C.w }); check(r.status === 200 && r.body.party.members.length === 3, "the leader removes a member");
check(((await get("party&wallet=" + C.w)).body.party) === null, "...who then has no party");
r = await act(C, "world-party-claim", {}); check(r.status === 400, "...and can't claim through it");
r = await act(A, "world-party-leave", {}); v = await bounty(B);
check(r.status === 200 && r.body.party === null && v.party && v.party.lead === B.w && v.party.members.length === 2, "the leader leaves: the next member leads");
r = await act(B, "world-party-leave", {}); r = await act(D, "world-party-leave", {});
check((await get("party&wallet=" + D.w)).body.party === null && db.get(`worldParty/${pid}`).closed === 1, "the last one out closes the party");
// idle: no new kills for two hours and it's gone
r = await act(A, "world-party-create", {}); const pid2 = r.body.party.id; await act(A, "world-party-invite", { to: B.w }); await act(B, "world-party-accept", { id: pid2 });
T += 3 * 3600e3; v = await bounty(A); check(v.party === null, "a party with no new kills for 2 hours ends");
r = await act(A, "world-party-create", {}); check(r.status === 200, "...and a new one can start");
// kills keep a party alive
T += 90 * 60e3; addK(A, 1); v = await bounty(A); check(v.party && v.party.total === 1, "a kill refreshes the party");
T += 90 * 60e3; v = await bounty(A); check(v.party !== null, "(1.5 h later it is still there)");
// a new week: the quest starts over for the party that's still hunting
T += 7 * 864e5; addK(A, 5); v = await bounty(A); check(v.party && v.party.total === 5 && !v.party.claimed, "a new week starts the party's count over");
// invitations expire
r = await act(A, "world-party-invite", { to: D.w }); check(r.status === 200, "(an invitation)");
T += 2 * 3600e3; check((await get("party&wallet=" + D.w)).body.invites.length === 0, "an invitation lapses after an hour");
r = await act(D, "world-party-decline", { id: "000000000000" }); check(r.status === 200, "declining one that's gone is harmless");

// ---- the village rankings ----
const liker = async (n, xp) => who("L" + n, xp);
const owner = async (name, vxp = 0) => { const p = await who(name); db.set(`worldIsland/${p.w}`, { data: "AQ==", name, n: 3, res: 0, at: T, vscore: 70, vxp }); return p; };
const likeIt = (from, to) => act(from, "world-like", { target: to.w });
const O1 = await owner("Alpha", 100), O2 = await owner("Beta"), O3 = await owner("Gamma"), O4 = await owner("Delta");
const low = await who("Newbie", 0), noSave = await who("", 0), L1 = await liker(1, 300), L2 = await liker(2, 300), L3 = await liker(3, 300), L4 = await liker(4, 300);
r = await likeIt(low, O1); check(r.status === 200 && r.body.likes === 1, "a like from a level-1 player is recorded");
r = await likeIt(noSave, O1); check(r.status === 200, "(and from a wallet with no save)");
check(((await get("village-top&p=week")).body.top.length) === 0 && !db.has(`worldIslandAll/${O1.w}`), "...but doesn't count for the rankings");
for (const x of [L1, L2, L3]) await likeIt(x, O2);
for (const x of [L1, L2]) await likeIt(x, O1);
await likeIt(L1, O3);
let tp = await get("village-top&p=week");
check(tp.status === 200 && /max-age=30/.test(tp.cache) && tp.body.p === "week" && tp.body.top.map((x) => x.name).join() === "Beta,Alpha,Gamma", "the week's list, most likes first (level 3+ likers only)");
check(tp.body.top[0].likes === 3 && tp.body.top[1].level === 2 && tp.body.top[1].score === 70 && tp.body.top[0].wallet === O2.w, "each row: wallet, name, likes, village level, score");
for (const p of ["month", "all"]) { const x = (await get("village-top&p=" + p)).body; check(x.top.map((y) => y.name).join() === "Beta,Alpha,Gamma" && x.p === p, `the ${p} list matches`); }
check((await get("village-top&p=bogus")).body.p === "all", "an unknown period shows all-time");
const rd1 = reads; await get("village-top&p=week"); check(reads - rd1 <= 4, `a ranking read: ${reads - rd1} documents (no scans)`);
// twenty at most
for (let i = 0; i < 22; i++) { const o = await owner("Z" + i); await likeIt(L1, o); }
check((await get("village-top&p=all")).body.top.length === 20, "the list holds the top 20");
// the island visit is cached for a minute, your own isn't
r = await get("island&wallet=" + O1.w); check(/s-maxage=60/.test(r.cache) && /max-age=15/.test(r.cache), "an island visit is cached 60 s at the edge");
r = await get("island&fresh=1&wallet=" + O1.w); check(r.cache === "no-store", "your own island (fresh=1) is never cached");

// ---- the prizes: a finished week's top three, frozen once ----
const week0 = wk(), top0 = (await get("village-top&p=week")).body.top.slice(0, 3), oct = (await get("village-top&p=month")).body.key;
check(/^\d{4}-\d\d$/.test(oct), "the month's key is a Seoul month");
// the top this week: Beta 3, Alpha 2, then the ones with one like (Gamma first, as the earliest)
T += 7 * 864e5;
r = await get("village-top&p=week");
check(r.body.top.length === 0 && r.body.last && r.body.last.key === week0 && r.body.last.winners.length === 3 && r.body.last.winners[0].prize === 500 && r.body.last.winners[1].prize === 300 && r.body.last.winners[2].prize === 150, "the first request after the week freezes last week's top three with their prizes");
const frozenDoc = JSON.stringify(db.get(`worldStats/villageWin_${week0}`));
check(db.get(`worldStats/villageWin_${week0}`).winners[0].wallet === top0[0].wallet, "...in worldStats/villageWin_<week>");
await likeIt(L4, O4); await likeIt(L3, O4); await likeIt(L2, O4); await get("village-top&p=week"); await get("bounty&wallet=" + O4.w);
check(JSON.stringify(db.get(`worldStats/villageWin_${week0}`)) === frozenDoc, "later requests (and later likes) don't change the frozen result");
const win1 = top0[0].wallet === O2.w ? O2 : O1, win2 = top0[1].wallet === O1.w ? O1 : O2;
v = await bounty(win1); const wv = v.wins.find((x) => x.p === "week");
check(wv.rank === 1 && wv.prize === 500 && !wv.claimed && wv.key === week0, "the winner's view shows their place, prize and that it's unclaimed");
const w0 = bal(win1); r = await act(win1, "world-vwin-claim", { p: "week", key: week0 });
check(r.status === 200 && r.body.credited === 500 && bal(win1) - w0 === 500 && r.body.award === false, "1st: 500 ARCL (credit, inside the daily cap)");
r = await act(win1, "world-vwin-claim", { p: "week", key: week0 }); check(r.status === 409, "claimed once");
check((await bounty(win1)).wins.find((x) => x.p === "week").claimed, "the view shows it claimed");
r = await act(win2, "world-vwin-claim", { p: "week", key: week0 }); check(r.status === 200 && r.body.credited === 300, "2nd: 300 ARCL");
r = await act(L4, "world-vwin-claim", { p: "week", key: week0 }); check(r.status === 403, "not in the top three: refused");
r = await act(win1, "world-vwin-claim", { p: "week", key: wk() }); check(r.status === 400, "this week isn't over: no prize yet");
r = await act(win1, "world-vwin-claim", { p: "week", key: "2020-W01" }); check(r.status === 400, "an old key: refused");
// a month: likes in October, ask in November
r = await get("village-top&p=month");
check(r.body.top.length === 1 && r.body.top[0].name === "Delta" && r.body.last.key === oct && r.body.last.winners.map((x) => x.prize).join() === "2000,1000,500", "a new month freezes the old one's top three: 2000 / 1000 / 500");
const mTop = db.get(`worldStats/villageWin_${oct}`).winners, mw = [O1, O2, O3, O4].concat(await Promise.resolve([])).find((x) => x.w === mTop[0].wallet);
const m0 = bal(mw); r = await act(mw, "world-vwin-claim", { p: "month", key: oct });
check(r.status === 200 && r.body.credited === 2000 && bal(mw) - m0 === 2000, "the month's winner claims 2,000 ARCL");
r = await act(mw, "world-vwin-claim", { p: "month", key: oct }); check(r.status === 409, "...once");
// with the day's ARCL room used up a prize isn't lost
const mw2 = [O1, O2, O3, O4].find((x) => x.w === mTop[1].wallet); full(mw2);
r = await act(mw2, "world-vwin-claim", { p: "month", key: oct }); check(r.status === 429, "no room in today's cap: told to come back");
db.set(`worldArclDay/${mw2.w}_${dayOf()}`, { n: 0 }); r = await act(mw2, "world-vwin-claim", { p: "month", key: oct }); check(r.status === 200 && r.body.credited === 1000, "...and the prize is still there (1,000)");
// a prize above the daily cap is paid by award()
caps.day = 400; const mw3 = [O1, O2, O3, O4].find((x) => x.w === mTop[2].wallet); const m3 = bal(mw3);
r = await act(mw3, "world-vwin-claim", { p: "month", key: oct }); check(r.status === 200 && r.body.credited === 500 && r.body.award === true && bal(mw3) - m3 === 500, "a prize above the daily cap is paid in full as an award");
// all-time keeps counting: the old week's likes are in it
check((await get("village-top&p=all")).body.top[0].likes >= 3, "all-time keeps the total");

console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
