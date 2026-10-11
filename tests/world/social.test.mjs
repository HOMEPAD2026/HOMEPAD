// social.test.mjs — the World API (social) against an in-memory store. Run: node tests/world/social.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.get(p) || null])),
  setDoc: async (p, d) => { db.set(p, d); },
  commit: async (ws) => { for (const w of ws) { if (w.create) { if (db.has(w.create)) return { ok: false, conflict: true }; db.set(w.create, w.data); } else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; db.set(w.inc, d); } } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Date.now();
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && new Date(t).toISOString() === iso && T - t <= max; };
const { cleanNote, RAID_HP, RAID_MIN, raidMax, nextWeekAt } = await import("../../api/_world-social.mjs");
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T });
const k0 = ethers.Wallet.createRandom(); // hardhat test key #0 (public)
const k1 = ethers.Wallet.createRandom(); // hardhat test key #1 (public)
const iss = new Date(T).toISOString();
const me = { wallet: k0.address, issued: iss, signature: await k0.signMessage(loginMessage(k0.address, iss)) };
const them = { wallet: k1.address, issued: iss, signature: await k1.signMessage(loginMessage(k1.address, iss)) };
const A = k0.address.toLowerCase(), B = k1.address.toLowerCase();
// notes
check(cleanNote("  So   cozy!  ") === "So cozy!", "a note is trimmed");
check(cleanNote("ha ".repeat(40)).length <= 60 && cleanNote("ha ".repeat(40)).length >= 58, "a note is cut at 60");
check(cleanNote("visit scam.xyz now") === null, "a domain: refused");
check(cleanNote("https://a.b") === null, "a link: refused");
check(cleanNote("send to 0xabcdef1234") === null, "an address: refused");
check(cleanNote("call 010 1234 5678") === null, "a long number: refused");
check(cleanNote("<b>hi</b>") === "b hi /b" && cleanNote("So3vKu8JqUZbg6c2ZVVq1V4ZcJZHnGJd9dbVMH7q9u7F") === null, "tags are stripped");
check(cleanNote("") === "", "no note is fine");
const build = (N, bricks) => Buffer.from([1, N, ...bricks.flat()]).toString("base64");
let r = await W.handle({ action: "world-island-save", ...me, data: build(36, [[1, 0, 1, 0, 0]]), name: "kmp", n: 1, res: 0 });
check(r.status === 200, "island saved");
r = await W.handle({ action: "world-stamp", ...them, target: A, k: 1, msg: "join my t.me/xyz" }); check(r.status === 400, "a stamp with a link in its note: refused");
r = await W.handle({ action: "world-stamp", ...them, target: A, k: 1, msg: "Love the tower!" });
check(r.status === 200 && r.body.stamps[0].m === "Love the tower!", "a stamp with a note");
const at = r.body.stamps[0].at;
r = await W.handle({ action: "world-stamp-hide", ...them, at }); check(r.status === 404, "someone else can't hide it");
r = await W.handle({ action: "world-stamp-hide", ...me, at }); check(r.status === 200, "the owner hides it");
r = await W.read(new URL("http://x/api/social?world=island&wallet=" + A)); check(r.body.stamps[0].h === 1 && !r.body.stamps[0].m, "a hidden note keeps the stamp, not the words");
r = await W.handle({ action: "world-stamp-hide", ...me, at }); r = await W.read(new URL("http://x/api/social?world=island&wallet=" + A)); check(r.body.stamps[0].m === "Love the tower!", "shown again");
// weekly contest
r = await W.handle({ action: "world-like", ...them, target: A }); check(r.status === 200, "a like");
r = await W.read(new URL("http://x/api/social?world=island-week")); check(r.body.top.length === 1 && r.body.top[0].wallet === A && r.body.top[0].likes === 1 && /^\d{4}-W\d\d$/.test(r.body.week), "this week's contest has it");
// friends
r = await W.read(new URL("http://x/api/social?world=friends&wallets=" + A + "," + B + ",junk")); check(Object.keys(r.body.friends).length === 2 && r.body.friends[A].isle === 1 && r.body.friends[A].likes === 1, "friends' cards");
// ghosts
await W.handle({ action: "world-ping", id: "ghostghost0001", g: { x: 12.34, z: -5, c: "female-b", lv: 7 } });
await W.handle({ action: "world-ping", id: "ghostghost0002", g: { x: 900, z: 0, c: "x", lv: 7 } });
await W.handle({ action: "world-ping", id: "ghostghost0003", g: { x: 1, z: 1, c: "<script>", lv: 500 } });
r = await W.read(new URL("http://x/api/social?world=ghosts"));
check(r.body.ghosts.length === 2 && r.body.ghosts.some((g) => g.x === 12.3 && g.c === "female-b") && r.body.ghosts.some((g) => g.c === "bot" && g.lv === 99), "wanderers: off-map dropped, fields cleaned");
T += 130e3; r = await W.read(new URL("http://x/api/social?world=ghosts")); check(r.body.ghosts.length === 0, "wanderers fade after 2 minutes");
// raid
const T0 = T, iss2 = new Date(T).toISOString();
const me2 = { wallet: k0.address, issued: iss2, signature: await k0.signMessage(loginMessage(k0.address, iss2)) };
r = await W.handle({ action: "world-raid-hit", ...me2, dmg: 500 }); check(r.status === 400, "no save: level 1, too low for the raid");
db.set("worldSave/" + A, { xp: 1900, name: "kmp", at: T }); // level 20
r = await W.handle({ action: "world-raid-hit", ...me2, dmg: 99999 }); check(r.status === 200 && r.body.counted === 1200, "a hit is capped at 60 × level");
r = await W.handle({ action: "world-raid-hit", ...me2, dmg: 100 }); check(r.status === 429, "one report every 5 seconds");
r = await W.handle({ action: "world-raid-claim", ...me2 }); check(r.status === 400, "nothing to claim while it stands");
r = await W.read(new URL("http://x/api/social?world=raid&wallet=" + A)); check(r.body.hp === RAID_HP - 1200 && r.body.mine === 1200 && r.body.top[0].name === "kmp" && !r.body.top[0].id, "raid state: hp, my damage, the top list (no full wallet)");
// bring it down
const wk = r.body.week; db.set("worldStats/raid_" + wk, { ...db.get("worldStats/raid_" + wk), dmg: RAID_HP - 300 });
T += 6e3; r = await W.handle({ action: "world-raid-hit", ...me2, dmg: 1000 }); check(r.body.counted === 300 && r.body.down, "the last hit only takes what's left; it falls");
r = await W.handle({ action: "world-raid-claim", ...me2 }); check(r.status === 200 && r.body.credited === 40 && r.body.claimed, "claimed: 40 ARCL");
r = await W.handle({ action: "world-raid-claim", ...me2 }); check(r.status === 409, "once a week");
const me3 = { wallet: k1.address, issued: iss2, signature: await k1.signMessage(loginMessage(k1.address, iss2)) };
r = await W.handle({ action: "world-raid-claim", ...me3 }); check(r.status === 400, "no damage, no share");
r = await W.handle({ action: "world-arcl-claim", ...me3, kind: "raid" }); check(r.status === 400, "the raid's ARCL can't be claimed the ordinary way");
const L = db.get("worldArcl/" + A); check(!(L.got || []).includes("raid"), "the raid stays repeatable week to week");
check(raidMax(0) === RAID_HP && raidMax(3) === 200000 && raidMax(40) === 1000000 && raidMax(500) === 2000000, "raid HP follows last week's raiders, within 200k–2M");
{ const n = nextWeekAt(Date.UTC(2026, 9, 11, 10)); const k = new Date(n + 9 * 3600e3); check(k.getUTCDay() === 1 && k.getUTCHours() === 0 && k.getUTCDate() === 12, "the next raid: Monday 00:00 Seoul"); }
r = await W.read(new URL("http://x/api/social?world=raid&wallet=" + A)); check(r.body.players === 1 && r.body.fellAt > 0 && r.body.next > Date.now(), "raid state: raiders this week, when it fell, when the next comes");
{ const { isoWeek } = await import("../../api/_world-shop.mjs"); const pw = isoWeek(T - 7 * 864e5); db.set("worldStats/raid_" + pw, { dmg: 600000, players: 24 }); db.set("worldRaidFell/" + pw, { at: nextWeekAt(T - 7 * 864e5) - 7 * 864e5 + 30 * 3600e3 });
  r = await W.read(new URL("http://x/api/social?world=raid-history")); const w0 = r.body.weeks.find((x) => x.week === pw); check(w0 && w0.players === 24 && w0.fell && w0.hours === 30 && !JSON.stringify(r.body).includes("0x"), "raid history: raiders, fell after 30 h, no wallets"); }
db.set("worldStats/islandWeek_" + (await import("../../api/_world-shop.mjs")).isoWeek(T - 7 * 864e5), { top: [{ wallet: A, name: "kmp", n: 1, likes: 9 }] });
r = await W.read(new URL("http://x/api/social?world=plaza")); check(r.body.isle && r.body.isle.contest && r.body.isle.wallet === A, "the plaza screen falls back to last week's top island");
console.log(ok, "pass", bad, "fail");
if (bad) process.exit(1);
