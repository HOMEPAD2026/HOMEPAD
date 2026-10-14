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
// the card's showcase: earned titles, the worn one, the gear on, the crew's tag
{ const sv = db.get(`worldSave/${A}`) || {}; db.set(`worldSave/${A}`, { ...sv, rpg: { eq: { weapon: { id: "abcd12", b: "weapon-2", r: 3, lv: 10, p: 4, k: 1 }, ring: { id: "ring01", b: "ring-1", r: 1, lv: 5, p: 0 } }, bag: [], x: { ach: ["k10", "b1", "<bad>"], title: "b1", stitle: 1 } } });
  db.set(`worldCrewOf/${A}`, { id: "0123456789ab" }); db.set("worldCrew/0123456789ab", { id: "0123456789ab", tag: "ARC", members: [A], owner: A, code: "ZZZZZZ" });
  r = await W.read(new URL("http://x/api/social?world=friends&wallets=" + A)); const f = r.body.friends[A];
  check(f.ach.join() === "k10,b1" && f.t === "b1" && f.st === 1, "a card lists the titles earned and the one worn");
  check(f.gear.length === 2 && f.gear[0].b === "weapon-2" && f.gear[0].p === 4 && f.gear[0].k === 1 && f.gear[1].b === "ring-1" && !("lv" in f.gear[0]), "a card shows the gear on (slot, rarity, +, kind)");
  check(f.cr === "ARC" && !("code" in f), "a card shows the crew's tag (and never its code)");
  db.set("worldCrew/0123456789ab", { id: "0123456789ab", tag: "ARC", members: [], owner: A, closed: 1 });
  r = await W.read(new URL("http://x/api/social?world=friends&wallets=" + A)); check(!r.body.friends[A].cr, "a closed crew's tag is gone from the card"); }
// ghosts
await W.handle({ action: "world-ping", id: "ghostghost0001", g: { x: 12.34, z: -5, c: "female-b", lv: 7 } });
await W.handle({ action: "world-ping", id: "ghostghost0002", g: { x: 900, z: 0, c: "x", lv: 7 } });
await W.handle({ action: "world-ping", id: "ghostghost0003", g: { x: 1, z: 1, c: "<script>", lv: 500 } });
r = await W.read(new URL("http://x/api/social?world=ghosts"));
check(r.body.ghosts.length === 2 && r.body.ghosts.some((g) => g.x === 12.3 && g.c === "female-b") && r.body.ghosts.some((g) => g.c === "bot" && g.lv === 99), "wanderers: off-map dropped, fields cleaned");
await W.handle({ action: "world-ping", id: "ghostghost0004", g: { x: 2, z: 2, c: "kk-ranger", lv: 9 } });
r = await W.read(new URL("http://x/api/social?world=ghosts")); check(r.body.ghosts.some((g) => g.c === "kk-ranger"), "a wanderer can be a KayKit adventurer");
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
// ---- the directory, gifts, guestbook replies, race times, named wanderers ----
{
  const rd = async (q) => W.read(new URL("http://x/api/social?world=" + q));
  T += 9000; r = await W.handle({ action: "world-save", ...me, reset: true, data: { xp: 1250, name: "kmp", char: "arc-luna", rpg: { x: { title: "k10", seen: { spam: 3, drop: 1 } } }, beaten: ["phisher"] } }); // below the 1,900 set above: a start-over (b417)
  check(r.status === 200, "saved");
  r = await rd("players"); const row = (r.body.list || []).find((x) => x.w === A);
  check(row && row.name === "kmp" && row.lv === 13 && row.char === "arc-luna" && row.t === "k10" && row.cx === 3 && r.body.n >= 1, "the directory has the player: name, level, character, title, codex pages");
  T += 9000; r = await W.handle({ action: "world-save", ...them, data: { xp: 50, name: "them", char: "male-a" } });
  r = await rd("players"); check(r.body.list[0].w === B && r.body.list.length >= 2, "newest first");
  // gifts
  r = await W.handle({ action: "world-gift", ...me, to: B, kind: "hp", n: 3 }); check(r.status === 200, "a gift of 3 health potions");
  r = await W.handle({ action: "world-gift", ...me, to: B, kind: "hp", n: 4 }); check(r.status === 400, "more than 3 potions: refused");
  r = await W.handle({ action: "world-gift", ...me, to: B, kind: "arcl", n: 1 }); check(r.status === 400, "ARCL can't be gifted");
  r = await W.handle({ action: "world-gift", ...me, to: A, kind: "hp", n: 1 }); check(r.status === 400, "not to yourself");
  r = await W.handle({ action: "world-gift", ...me, to: "0x" + "9".repeat(40), kind: "hp", n: 1 }); check(r.status === 404, "not to a wallet that hasn't played");
  for (let i = 0; i < 4; i++) await W.handle({ action: "world-gift", ...me, to: B, kind: "scrap", n: 50 });
  r = await W.handle({ action: "world-gift", ...me, to: B, kind: "scrap", n: 50 }); check(r.status === 429, "five gifts a day");
  r = await rd("gifts&wallet=" + B); check(r.body.n === 5, "five waiting");
  r = await W.handle({ action: "world-gifts-take", ...them }); check(r.status === 200 && r.body.gifts.length === 5 && r.body.gifts[0].name === "kmp" && r.body.gifts[0].kind === "hp", "the receiver collects them, with who sent them");
  r = await W.handle({ action: "world-gifts-take", ...them }); check(r.body.gifts.length === 0, "collected once");
  // guestbook replies
  r = await W.handle({ action: "world-stamp-reply", ...me, at, r: 2 }); check(r.status === 200 && r.body.stamps.find((x) => x.at === at).r === 2, "the owner answers a stamp");
  r = await W.handle({ action: "world-stamp-reply", ...them, at, r: 1 }); check(r.status === 404, "only on your own island");
  r = await W.handle({ action: "world-stamp-reply", ...me, at, r: 9 }); check(r.status === 400, "only the fixed replies");
  // race
  r = await W.handle({ action: "world-race", ...me, ms: 3000 }); check(r.status === 400, "an impossible time: refused");
  r = await W.handle({ action: "world-race", ...me, ms: 24000 }); r = await W.handle({ action: "world-race", ...me, ms: 30000 });
  check(r.body.best === 24000, "a slower run keeps the best");
  r = await W.handle({ action: "world-race", ...them, ms: 21000 }); r = await rd("race-top");
  check(r.body.top.length === 2 && r.body.top[0].ms === 21000 && r.body.top[0].name === "them" && !/^0x[0-9a-f]{40}$/.test(r.body.top[0].w), "the week's best, fastest first, wallets shortened");
  // the week's biggest fish and fastest boss knock-outs
  r = await W.handle({ action: "world-fish", ...me, fish: "guppy", cm: 99 }); check(r.status === 400, "a guppy can't be 99 cm");
  r = await W.handle({ action: "world-fish", ...me, fish: "shark", cm: 20 }); check(r.status === 400, "no fish we don't have");
  r = await W.handle({ action: "world-fish", ...me, fish: "angler", cm: 80 }); r = await W.handle({ action: "world-fish", ...me, fish: "carp", cm: 40 });
  check(r.body.best === 80, "a smaller catch keeps the biggest");
  r = await W.handle({ action: "world-fish", ...them, fish: "leviathan", cm: 250 }); r = await rd("fish-top");
  check(r.body.top.length === 2 && r.body.top[0].v === 250 && r.body.top[0].fish === "leviathan" && r.body.top[1].v === 80, "the biggest catches first");
  r = await W.handle({ action: "world-bossrun", ...me, zone: "reef", ms: 2000 }); check(r.status === 400, "an impossible boss time: refused");
  r = await W.handle({ action: "world-bossrun", ...me, zone: "moon", ms: 60000 }); check(r.status === 400, "only our grounds");
  r = await W.handle({ action: "world-bossrun", ...me, zone: "reef", ms: 90000 }); r = await W.handle({ action: "world-bossrun", ...them, zone: "void", ms: 60000 }); r = await rd("boss-top");
  check(r.body.top.length === 2 && r.body.top[0].v === 60000 && r.body.top[0].zone === "void", "the fastest boss knock-outs first");
  // named wanderers
  T += 1000; await W.handle({ action: "world-ping", id: "namedghost0001", g: { x: 3, z: 4, c: "arc-luna", lv: 13 }, s: me });
  await W.handle({ action: "world-ping", id: "plainghost0002", g: { x: 5, z: 6, c: "bot", lv: 2 } });
  r = await rd("ghosts"); const gN = r.body.ghosts.find((g) => g.x === 3), gP = r.body.ghosts.find((g) => g.x === 5);
  check(gN && gN.n === "kmp" && gN.l === 13 && gN.w === A, "a signed-in wanderer shows its name and level");
  check(gP && !gP.n && !gP.w, "an anonymous one doesn't");
  await W.handle({ action: "world-ping", id: "fakeghost00003", g: { x: 7, z: 7, c: "bot", lv: 2 }, s: { ...me, signature: them.signature } });
  r = await rd("ghosts"); check(!r.body.ghosts.find((g) => g.x === 7).n, "a forged sign-in shows no name");
}
console.log(ok, "pass", bad, "fail");
if (bad) process.exit(1);
