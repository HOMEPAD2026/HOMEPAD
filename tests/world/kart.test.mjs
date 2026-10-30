// kart.test.mjs — ARCIRCLE KART K2 (api/_world-kart.mjs): a race opened and closed on the server's clock, laps no faster
// than the track allows (minLap measured from world-kart.js's own track), an end counted once, ARCL by place for the first
// five races a Seoul day inside the game's day cap, the daily challenge paid once, time attack paying nothing, ghosts kept
// for a better time only, the week's board, the five achievements; the client's copies (dailyOf, the ghost format, its
// words in ko/zh/tr) agree. On an in-memory store. Run: node tests/world/kart.test.mjs (needs ethers 6)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { KART, dailyOf, GHOST_RE, kartLv } = await import("../../api/_world-kart.mjs");
const C = await import("../../world-kart.js");
const THREE = await import("../../vendor/three/three-0.186.1.module.min.js");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

// ---- the client's copies ----
{ const curve = new THREE.CatmullRomCurve3(C.TRACK_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "centripetal"), len = curve.getLength();
  check(KART.TRACKS.nexus.minLap === Math.floor((len / C.BOOST_TOP) * 0.85), `minLap ${KART.TRACKS.nexus.minLap} = floor(${len.toFixed(1)} m / ${C.BOOST_TOP} m/s × 0.85)`);
  check(KART.TRACKS.nexus.laps === C.LAPS, "the laps match the game's"); }
{ let same = true; for (let t = Date.parse("2026-10-30T00:00:00Z"), i = 0; i < 40; i++, t += 7 * 3600e3) { const a = dailyOf(t), b = C.dailyOf(t); if (a.day !== b.day || a.seed !== b.seed || a.rule !== b.rule) same = false; }
  check(same && JSON.stringify(KART.RULES) === JSON.stringify(C.RULES), "the daily rule is the same day, seed and rule on both sides");
  const rules = new Set(); for (let i = 0; i < 60; i++) rules.add(dailyOf(Date.parse("2026-11-01T00:00:00Z") + i * 864e5).rule); check(rules.size === 5, "every rule comes up over two months"); }
{ const s = [[12.34, -56.78, 3.1], [-0.05, 1000.1, -3.14159], [200.5, 240.25, 7]], g = C.ghostEnc(s), d = C.ghostDec(g);
  check(GHOST_RE.test(g) && d.length === 3 && Math.abs(d[0][0] - 12.3) < 0.051 && Math.abs(d[1][1] - 1000.1) < 0.051 && Math.abs(d[2][2] - Math.atan2(Math.sin(7), Math.cos(7))) < 0.006, "a ghost: base-36 text the server takes, back within a decimetre (" + g + ")");
  const long = Array.from({ length: C.GHOST_MAX }, (_, i) => [-200 + i * 0.13, 240 - i * 0.07, -3.14]); check(C.ghostEnc(long).length <= KART.MAX_GHOST, "the longest ghost the game records fits MAX_GHOST (" + C.ghostEnc(long).length + ")"); }
{ // every literal T("…") in world-kart.js and the names in its tables have ko / zh / tr in its own dictionary (LW)
  const src = fs.readFileSync(path.join(ROOT, "world-kart.js"), "utf8"), want = new Set();
  for (const m of src.matchAll(/\bT\("((?:[^"\\]|\\.)*)"/g)) want.add(JSON.parse('"' + m[1] + '"'));
  for (const name of ["RULE_NAME", "RULE_LINE", "MODE_NAME", "MODE_LINE", "ACH_NAME"]) { const m = src.match(new RegExp("(?:const |, )" + name + " = \\{([^}]*)\\}")); for (const x of m[1].matchAll(/: "((?:[^"\\]|\\.)*)"/g)) want.add(JSON.parse('"' + x[1] + '"')); }
  for (const r of C.RACERS) want.add(r.line);
  const miss = []; for (const s of want) for (const l of ["ko", "zh", "tr"]) if (C.LW[l][s] == null) miss.push(l + "|" + s);
  check(want.size > 60 && miss.length === 0, `world-kart.js's ${want.size} strings are in ko/zh/tr${miss.length ? ": " + miss.slice(0, 12).join(", ") : ""}`); }
// ---- K6's helpers: the gaps, the photo finish, the settings, tilt, where the ramps and the tunnel sit ----
{ const M = new Float32Array(40).fill(-1); let mk = 0; mk = C.markAt(M, mk, 0, 0); mk = C.markAt(M, mk, 23, 1); mk = C.markAt(M, mk, 51, 2); // (0 m at 0 s, 23 m at 1 s, 51 m at 2 s)
  check(M[0] === 0 && M[1] === 1 && M[4] === 1 && M[5] === 2 && M[10] === 2 && M[11] === -1 && mk === 11, "markAt fills every bin it passes, once (" + Array.from(M.slice(0, 12)).join(",") + ")");
  const again = C.markAt(M, mk, 52, 9); check(M[10] === 2 && again === 11, "markAt never moves a bin that is filled");
  check(Math.abs(C.gapTo(M, 24, 2.8) - 1.8) < 1e-9 && C.gapTo(M, 0, 0.5) === 0.5 && C.gapTo(M, 60, 3) === null && C.gapTo(M, -3, 1) === null, "gapTo: how long ago the leader passed where the trailer is; null where it never was");
  check(Math.abs(C.gapTo(M, 5 * C.GAP_M, 2.5) - 0.5) < 1e-9 && Math.abs(C.gapTo(M, 5 * C.GAP_M - 0.01, 2.5) - 1.5) < 1e-9, "gapTo reads the bin of GAP_M metres the trailer is in"); }
{ const o = (finish, rem, speed) => ({ finish, rem, speed });
  check(C.photoFinish(60, [o(59.9, 0, 30)]) && C.photoFinish(60, [o(0, 3, 30)]) && C.photoFinish(60, [o(60.15, 0, 0)]), "a photo finish: one over the line 0.1 s before, one 3 m behind at 30 m/s, one 0.15 s after");
  check(!C.photoFinish(60, [o(59.7, 0, 30), o(0, 8, 30), o(0, 200, 34)]) && !C.photoFinish(60, []), "no photo finish 0.3 s apart, 8 m behind at 30 m/s, or alone");
  check(!C.photoFinish(60, [o(0, 1, 0)]), "a stopped kart 1 m short isn't a photo finish (speed floor 1 m/s)"); }
{ const d = C.optsOf(null, true), p = C.optsOf(null, false), j = C.optsOf('{"assist":false,"autogas":true,"tilt":1,"size":"xl"}', true), bad = C.optsOf("{oops", false);
  check(d.assist && !d.autogas && !d.tilt && d.size === "m" && !p.assist, "settings: steering assist on by default on a phone, off on a computer; the rest off, buttons M");
  check(!j.assist && j.autogas && !j.tilt && j.size === "m" && !bad.assist && bad.size === "m", "settings: saved choices kept, odd values back to the default, broken JSON → the defaults"); }
check(C.tiltSteer(2) === 0 && C.tiltSteer(24) === 1 && C.tiltSteer(-40) === -1 && Math.abs(C.tiltSteer(14) - 0.5) < 1e-9 && C.tiltSteer(null) === 0, "tilt: a 4° dead zone, full lock at 24°, both ways");
{ const D = await import("../../world-kart-dress.js"), pads = [180, 420, 650];
  const near = (a, b, n) => Math.min(Math.abs(a - b), 900 - Math.abs(a - b)) < n;
  check(D.RAMPS.every((r) => pads.every((p) => !near(r.i, p, 25)) && !(r.i >= D.TUNNEL[0] - 20 && r.i <= D.TUNNEL[1] + 20) && !near(r.i, 0, 60) && Math.abs(r.lat) + D.RAMP.w / 2 <= 8), "the ramps: on the road, clear of the boost pads, the tunnel and the start line");
  check(D.RAMPS.every((r) => !(r.i > 760 && r.i < 890)), "no ramp in the last corner (the side camera's place)");
  check(pads.every((p) => !(p > D.TUNNEL[0] && p < D.TUNNEL[1])) && C.K6_GLB.every((n) => ["lights", "podium", "ramp"].includes(n)), "no pad in the tunnel; K6_GLB names only the three hooks"); }
check(kartLv(0) === 1 && kartLv(100) === 2 && kartLv(400) === 3 && kartLv(1e9) === KART.LV.max, "the racer's level from XP");

// ---- the server ----
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-10-14T03:00:00Z"), n = 0; // a Wednesday
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, randomId: () => "race" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const read = (q) => W.read(new URL("http://x/api/social?" + q));
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const p1 = ethers.Wallet.createRandom(), p2 = ethers.Wallet.createRandom();
const L3 = (a = 30, b = 30, c = 30) => ({ laps: [a, b, c], time: a + b + c });
/// a whole race: start, wait as long as it takes, end
async function race(w, mode, place, laps = L3(), extra = {}) { const s = await call(w, "world-kart-start", { track: "nexus", mode, racer: "doge" }); T += (laps.time + 4) * 1000; return call(w, "world-kart-end", { raceId: s.body.raceId, place, ...laps, racer: "doge", ...extra }); }
const G1 = C.ghostEnc([[0, 0, 0], [1, 1, 0.1], [2, 2, 0.2], [3, 3, 0.3], [4, 4, 0.4], [5, 5, 0.5], [6, 6, 0.6]]);

let r = await call(p1, "world-kart-start", { track: "nexus", mode: "race", racer: "pepe" }); const r1 = r.body;
check(r.status === 200 && r1.raceId && r1.mode === "race" && !r1.daily, "a race starts");
check((await call(p1, "world-kart-start", { track: "moon", mode: "race" })).status === 400, "no such track: refused");
r = await call(p1, "world-kart-start", { track: "nexus", mode: "race", racer: "pepe" }); const r1b = r.body;
T += 95e3;
check((await call(p1, "world-kart-end", { raceId: r1.raceId, place: 1, ...L3() })).status === 409, "a replaced race can't end (one active race a wallet)");
check((await call(p1, "world-kart-end", { raceId: r1b.raceId, place: 1, laps: [30, 10, 30], time: 70 })).status === 400, "a lap faster than minLap: refused");
check((await call(p1, "world-kart-end", { raceId: r1b.raceId, place: 1, laps: [30, 30], time: 60 })).status === 400, "too few laps: refused");
check((await call(p1, "world-kart-end", { raceId: r1b.raceId, place: 1, laps: [30, 30, 30], time: 80 })).status === 400, "laps that don't add up to the time: refused");
check((await call(p1, "world-kart-end", { raceId: r1b.raceId, place: 1, ...L3(40, 40, 40) })).status === 400, "longer than it has been going: refused");
check((await call(p1, "world-kart-end", { raceId: r1b.raceId, place: 7, ...L3() })).status === 400, "a place past 5th: refused");
r = await call(p1, "world-kart-end", { raceId: r1b.raceId, place: 1, ...L3(), ghost: G1 });
check(r.status === 200 && r.body.credited === 500 && r.body.racesLeft === 4 && r.body.today === 500 && bal(p1) === 500, "1st: 500 ARCL, 4 paid races left");
check(r.body.newAch.join() === "first,win" && r.body.meta.wins === 1 && r.body.meta.races === 1 && r.body.meta.xp === 60 + 30 && r.body.newBest && r.body.best === 90 && r.body.rank === 1, "the first win: Kart Rookie + Kart Winner, 90 XP, a new best, #1 on the week (" + JSON.stringify(r.body.newAch) + ")");
check(db.get(`worldKartGhost/nexus_${p1.address.toLowerCase()}`).g === G1, "the ghost is kept with the new best");
check((await call(p1, "world-kart-end", { raceId: r1b.raceId, place: 1, ...L3(), ghost: G1 })).status === 409, "an end counts once");
// pay by place, the day's five paid races, the day's cap
r = await race(p1, "race", 3, L3(31, 31, 31), { ghost: "zz;zz" }); check(r.body.credited === 250 && r.body.racesLeft === 3 && !r.body.newBest && db.get(`worldKartGhost/nexus_${p1.address.toLowerCase()}`).g === G1, "3rd: 250 ARCL; a slower time keeps the old ghost");
r = await race(p1, "race", 5); check(r.body.credited === 100, "5th: 100 ARCL");
r = await race(p1, "race", 1); r = await race(p1, "race", 1); check(r.body.credited === 500 && r.body.racesLeft === 0 && r.body.today === 1850 && bal(p1) === 1850, "five paid races: 500 + 250 + 100 + 500 + 500");
r = await race(p1, "race", 1); check(r.status === 200 && r.body.credited === 0 && r.body.why === "races" && r.body.racesLeft === 0, "a sixth race: no ARCL (five paid races a day)");
// time attack: nothing paid; ghosts: a better time only, size- and character-checked
r = await race(p1, "ta", 3, L3(29, 29, 29), { ghost: "x".repeat(KART.MAX_GHOST + 1) });
check(r.status === 200 && r.body.credited === 0 && r.body.why === "ta" && r.body.newBest && r.body.newAch.includes("ta") && db.get(`worldKartGhost/nexus_${p1.address.toLowerCase()}`).g === G1, "time attack: no ARCL, Time Trialist, a new best — but a ghost over MAX_GHOST isn't kept");
r = await race(p1, "ta", 0, L3(28, 28, 28), { ghost: "AB;<script>" }); check(r.body.newBest && db.get(`worldKartGhost/nexus_${p1.address.toLowerCase()}`).t === 90, "a ghost with other characters isn't kept");
const G2 = C.ghostEnc([[9, 9, 1], [8, 8, 1], [7, 7, 1], [6, 6, 1], [5, 5, 1], [4, 4, 1], [3, 3, 1]]);
r = await race(p1, "ta", 0, L3(27, 27, 27), { ghost: G2 }); const gd = db.get(`worldKartGhost/nexus_${p1.address.toLowerCase()}`);
check(r.body.newBest && r.body.best === 81 && gd.g === G2 && gd.t === 81 && gd.racer === "doge", "a better time attack keeps its ghost");
// the daily challenge: 300 once a day, inside the day's cap; its own board
r = await call(p1, "world-kart-start", { track: "nexus", mode: "daily", racer: "wif" }); check(r.body.daily && KART.RULES.includes(r.body.daily.rule) && r.body.daily.day === "2026-10-14", "a daily starts with the day's rule (" + (r.body.daily && r.body.daily.rule) + ")");
T += 100e3; r = await call(p1, "world-kart-end", { raceId: r.body.raceId, place: 2, ...L3(32, 32, 32) });
check(r.status === 200 && r.body.credited === 300 && r.body.dailyRank === 1 && r.body.newAch.includes("daily") && !r.body.newBest && bal(p1) === 2150, "the daily pays 300, Daily Racer, the day's board (not the week's best)");
r = await race(p1, "daily", 1); check(r.body.credited === 0 && r.body.why === "daily-done", "a second daily the same day: no ARCL");
// the cap: a new day, five wins (2,500) then the daily → nothing left
T += 864e5; for (let i = 0; i < 5; i++) r = await race(p1, "race", 1);
check(r.body.today === KART.DAY_ARCL && r.body.meta.wins === 10 && r.body.newAch.join() === "win10", "a new day: five wins pay up to the day's 2,500; the tenth win (unpaid and daily wins count too): Kart Champion");
r = await race(p1, "daily", 1); check(r.body.credited === 0 && r.body.why === "cap" && r.body.today === KART.DAY_ARCL && r.body.newAch.length === 0, "the daily past the cap pays nothing");
// the week's board: the fastest first, one line a wallet, shortened wallets
T += 3600e3; r = await race(p2, "race", 2, L3(26, 26, 26), { ghost: G1 }); check(r.body.rank === 1 && r.body.credited === 350, "another racer, faster: #1 on the week, 2nd pays 350");
r = await race(p2, "ta", 0, L3(29, 29, 29)); check(r.body.rank === 1, "a slower run keeps their place");
const top = await read("world=kart-top&track=nexus"); check(top.status === 200 && top.body.top.length === 2 && top.body.top[0].t === 78 && top.body.top[1].t === 81 && top.body.top[0].racer === "doge" && !("id" in top.body.top[0]) && /…/.test(top.body.top[0].w), "the week's board: 78 then 81, wallets shortened");
let gh = await read("world=kart-ghost&track=nexus&who=top"); check(gh.status === 200 && gh.body.g === G1 && gh.body.t === 78, "the #1's ghost");
gh = await read("world=kart-ghost&track=nexus&who=me&wallet=" + p1.address.toLowerCase()); check(gh.status === 200 && gh.body.g === G2 && gh.body.t === 81, "your own ghost");
gh = await read("world=kart-ghost&track=nexus&who=me&wallet=0x" + "1".repeat(40)); check(gh.status === 404, "no ghost: 404");
const dv = await read("world=kart-daily"); check(dv.status === 200 && KART.RULES.includes(dv.body.rule) && Array.isArray(dv.body.top), "the daily view: rule and board");
const v = await read("world=kart&wallet=" + p1.address.toLowerCase()); check(v.status === 200 && v.body.today === KART.DAY_ARCL && v.body.racesLeft === 0 && v.body.dailyPaid && v.body.meta.ach.length === 5 && v.body.meta.lv >= 2, "your view: today's ARCL, races left, all five titles, a level");
const v0 = await read("world=kart"); check(v0.body.racesLeft === KART.DAY_RACES && v0.body.cap === KART.DAY_ARCL, "a guest's view: the day's rules");
r = await call(p1, "world-arcl-claim", { kind: "kart" }); check(r.status === 400, "KART's ARCL can't be claimed");
console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
