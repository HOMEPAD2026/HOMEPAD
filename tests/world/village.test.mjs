// village.test.mjs — the village (api/_world-village.mjs): score, XP and level, the paid levels from 5, the blessing,
// the weekly contest and the GM. Run: node tests/world/village.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const V = await import("../../api/_world-village.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.inc) { const cur = db.get(w.inc) || {}; for (const [k, v] of Object.entries(w.fields)) cur[k] = (cur[k] || 0) + v; db.set(w.inc, cur); } } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Date.parse("2026-10-13T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T });
const who = async () => { const w = ethers.Wallet.createRandom(), issued = new Date(T).toISOString(); return { w: w.address.toLowerCase(), S: { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) } }; };
const build = (N, bricks) => { const u = new Uint8Array(2 + bricks.length * 5); u[0] = 1; u[1] = N; bricks.forEach((b, i) => u.set(b, 2 + i * 5)); return Buffer.from(u).toString("base64"); };

// the numbers
check(V.needXp(2) === 100 && V.needXp(5) === 1000 && V.needXp(6) === 1500, "XP for a level: 100, …, 1,000 for 5, 1,500 for 6");
check(V.upCost(4) === 0 && V.upCost(5) === 1000 && V.upCost(6) === 2000 && V.upCost(7) === 4000 && V.upCost(8) === 7000 && V.upCost(9) === 11000, "levels from 5 cost 1,000, 2,000, 4,000, 7,000, 11,000 $ARCIRCLE");
check(V.villageLevel(999999, 0) === 4 && V.villageLevel(999999, 6) === 6 && V.villageLevel(700, 9) === 4 && V.villageLevel(150, 0) === 2, "XP alone takes a village to 4; past that, paid levels (as far as the XP reaches)");
check(V.blessing(1).xp === 0 && V.blessing(6).xp === 10 && V.blessing(6).hp === 5 && V.blessing(30).xp === 40, "the blessing: +2% XP and +1% HP a level, capped");
check(V.isGM("0x1250Fe3b1DE11Da51457BCA3fc8840F4ab4Aeac1") && !V.isGM("0x" + "1".repeat(40)), "the GM wallet");
check(ethers.getAddress("0x1250fe3b1de11da51457bca3fc8840f4ab4aeac1") === "0x1250Fe3b1DE11Da51457BCA3fc8840F4ab4Aeac1", "the GM address is a valid checksummed address");
const small = V.villageScore(build(36, [[1, 0, 1, 0, 0]])).score, rich = V.villageScore(build(36, [[1, 0, 1, 0, 0], [2, 0, 1, 18, 4], [3, 0, 1, 13, 8], [4, 0, 1, 39, 12], [4, 1, 1, 0, 0]]), "style-neon").score;
check(small > 0 && rich > small * 5, "more kinds, colours, lights, plants, a trophy and a theme score higher: " + small + " → " + rich);
check(V.villageScore("@@@").score === 0, "a broken build scores nothing");

// saving builds XP; likes add 10
const a = await who(), b = await who();
let r = await W.handle({ action: "world-island-save", ...a.S, data: build(36, [[1, 0, 1, 0, 0], [2, 0, 1, 13, 8]]), name: "Arc Town", n: 2, res: 0 });
check(r.status === 200 && r.body.village.level >= 1 && r.body.village.score > 0, "a save returns the village: level " + r.body.village.level + ", score " + r.body.village.score);
const s1 = r.body.village.score;
T += 9000; r = await W.handle({ action: "world-island-save", ...a.S, data: build(36, [[1, 0, 1, 0, 0]]), name: "Arc Town", n: 1, res: 0 });
check(r.body.village.xp === s1, "a smaller build later: XP stays (it only grows with a new best)");
r = await W.handle({ action: "world-like", ...b.S, target: a.S.wallet });
r = await W.read(new URL("http://x/api/social?world=village&wallet=" + a.w));
check(r.body.xp === s1 + 10, "a like is 10 village XP");
// the Village upgrade: not before level 4 and the XP for 5
r = await W.handle({ action: "world-pay-quote", ...a.S, item: "isleup" }); check(r.status === 400, "a Village upgrade before the XP is there: refused (" + r.body.error + ")");
db.set("worldIsland/" + a.w, { ...db.get("worldIsland/" + a.w), vxp: 1600 });
r = await W.read(new URL("http://x/api/social?world=village&wallet=" + a.w));
check(r.body.level === 4 && r.body.next === 5 && r.body.cost === 1000 && r.body.payable, "with the XP for 5: level 4, level 5 for 1,000 $ARCIRCLE");
r = await W.handle({ action: "world-pay-quote", ...a.S, item: "isleup" });
check(r.status === 200 && r.body.tokens === 1000, "the quote is 1,000 $ARCIRCLE");
check(db.get("worldPayQuote/" + r.body.quote).target === "lv:5", "the quote remembers which level it buys");

// the contest: enter, then only the GM picks
r = await W.handle({ action: "world-contest-enter", ...a.S }); check(r.status === 200 && r.body.contest.entries.length === 1, "a village enters this week's contest");
r = await W.handle({ action: "world-contest-enter", ...b.S }); check(r.status === 400, "no island yet: can't enter");
r = await W.read(new URL("http://x/api/social?world=contest")); check(r.body.prize === 50000 && r.body.entries[0].wallet === a.w, "the first week's prize is 50,000 ARCL");
r = await W.handle({ action: "world-contest-pick", ...b.S, winners: [{ wallet: a.w, arcl: 50000 }] }); check(r.status === 403, "someone else can't pick the winners");
// the GM (signer stubbed: no private key for that wallet here)
const GM = "0x1250fe3b1de11da51457bca3fc8840f4ab4aeac1";
const G = V.makeVillage({ ...store, json, now: () => T, signer: (x) => ({ wallet: x.wallet }), isoWeek: () => r.body && "w", award: async (w, k, n) => { const c = db.get("worldArclBal/" + w) || {}; db.set("worldArclBal/" + w, { ...c, bal: (c.bal || 0) + n }); return n; } });
db.set("worldContest/w", { entries: [{ w: a.w, name: "Arc Town", at: T }] });
r = await G.handle({ action: "world-contest-pick", wallet: GM, winners: [{ wallet: b.w, arcl: 1000 }] }); check(r.status === 400, "the GM picks from the entries only");
r = await G.handle({ action: "world-contest-pick", wallet: GM, winners: [{ wallet: a.w, arcl: 150000 }] }); check(r.status === 400 && !db.get("worldArclBal/" + a.w), "at most 100,000 ARCL a week");
r = await G.handle({ action: "world-contest-enter", wallet: GM }); check(r.status === 400, "the GM doesn't enter the contest");
db.set("worldContest/w", { entries: [{ w: a.w, name: "Arc Town", at: T }, { w: GM, name: "GM", at: T }] });
r = await G.handle({ action: "world-contest-pick", wallet: GM, winners: [{ wallet: GM, arcl: 1000 }] }); check(r.status === 400, "nor picks their own village");
r = await G.handle({ action: "world-contest-pick", wallet: GM, winners: [{ wallet: a.w, arcl: 50000 }] });
check(r.status === 200 && r.body.contest.winners[0].wallet === a.w && db.get("worldArclBal/" + a.w).bal === 50000, "the GM picks the winner: 50,000 ARCL credited");
r = await G.handle({ action: "world-contest-pick", wallet: GM, winners: [{ wallet: a.w, arcl: 10 }] }); check(r.status === 409, "a week is judged once");
r = await G.read("contest", new URL("http://x/?world=contest")); check(r.body.past[0].winners[0].arcl === 50000 && r.body.prize === null, "the result stays for everyone to see");
// names can't wear [GM]
const { cleanSave } = await import("../../api/_world.mjs");
check(cleanSave({ name: "[GM] Park" }).name === "Park" && cleanSave({ name: "[ g m ]x" }).name === "x", "a name can't carry [GM] (it comes from the wallet)");
console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
