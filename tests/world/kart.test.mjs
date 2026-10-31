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
// ---- K5: four tracks — each one's minLap from its own spline, the places on it, the daily's track ----
const curveOf = (id) => new THREE.CatmullRomCurve3(C.TRACKS[id].pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "centripetal");
check(JSON.stringify(C.TRACK_IDS) === JSON.stringify(KART.TRACK_IDS) && C.TRACK_IDS.every((id) => KART.TRACKS[id] && C.TRACKS[id]) && Object.keys(KART.TRACKS).length === C.TRACK_IDS.length, "K5: the same four tracks on both sides (" + C.TRACK_IDS.join(", ") + ")");
for (const id of C.TRACK_IDS) { const len = curveOf(id).getLength();
  check(KART.TRACKS[id].minLap === Math.floor((len / C.BOOST_TOP) * 0.85) && KART.TRACKS[id].laps === C.LAPS, `${id}: minLap ${KART.TRACKS[id].minLap} = floor(${len.toFixed(1)} m / ${C.BOOST_TOP} m/s × 0.85), ${C.LAPS} laps`);
  check(len >= 1000 && len <= 1300 && len <= C.MAX_LEN, `${id}: ${len.toFixed(0)} m long (1,000–1,300, under MAX_LEN for the gaps' marks)`);
  check(len / (C.BOOST_TOP * 1.15) >= KART.TRACKS[id].minLap, `${id}: the fastest lap items or the turbo rule allow (${(len / (C.BOOST_TOP * 1.15)).toFixed(1)} s) is no faster than minLap`); }
{ const D = await import("../../world-kart-dress.js"), N = 900, WALL = 8 + 3.2;
  for (const id of C.TRACK_IDS) { const T0 = C.TRACKS[id], curve = curveOf(id), P = curve.getSpacedPoints(N), len = curve.getLength();
    const S = P.slice(0, N).map((p, i) => { const t = P[(i + 1) % N].clone().sub(p).normalize(); return { p, t, r: new THREE.Vector3(-t.z, 0, t.x) }; });
    const yaw = (i) => { const s0 = S[((i % N) + N) % N]; return Math.atan2(s0.t.x, s0.t.z); }, turn = (a, b) => Math.abs(Math.atan2(Math.sin(yaw(a) - yaw(b)), Math.cos(yaw(a) - yaw(b))));
    const near = (a, b, n) => Math.min(Math.abs(a - b), N - Math.abs(a - b)) < n, inT = (i, m) => !!T0.tunnel && i >= T0.tunnel[0] - m && i <= T0.tunnel[1] + m, inL = (i) => i > T0.last[0] && i < T0.last[1];
    const fly = Math.ceil((((C.TOP * 1.1) / 6 + 1.6) * 2) / T0.feel.grav * C.TOP / (len / N)); // (samples flown off a ramp at top speed)
    check(T0.ramps.length >= 1 && T0.ramps.every((r) => !T0.pads.some((p) => near(r.i, p, 25)) && !inT(r.i, 20) && !near(r.i, 0, 60) && !inL(r.i) && Math.abs(r.lat) + D.RAMP.w / 2 <= 8 && turn(r.i, r.i + fly) < 0.45), `${id}: ${T0.ramps.length} ramp(s) on the road, on a straight (lands within 0.45 rad over ${fly} samples), clear of the pads, a tunnel, the line and the last corner`);
    check(T0.rows.length === 3 && T0.rows.every((r) => !T0.ramps.some((x) => near(r, x.i, 30)) && !T0.pads.some((p) => near(r, p, 25)) && !inT(r, 10) && !inL(r) && !near(r, 0, 60)), `${id}: three item-box rows clear of the ramps, pads, tunnel, last corner and line`);
    check(T0.pads.length === 3 && T0.pads.every((p) => !inT(p, 0)), `${id}: three boost pads, none in a tunnel`);
    const clear = (x, z, i0, m) => { for (let j = 0; j < N; j += 2) { if (near(j, i0, 45)) continue; const dx = S[j].p.x - x, dz = S[j].p.z - z; if (dx * dx + dz * dz < m * m) return false; } return true; }, at = (i, l) => [S[i].p.x + S[i].r.x * l, S[i].p.z + S[i].r.z * l];
    const off = []; for (const [a, b] of T0.stands) for (let i = a; i < b; i += 4) { const sd = D.outSide(S, i, T0.c[0], T0.c[1]); for (const l of [WALL + 1.6, WALL + 6, WALL + 11]) if (!clear(...at(i, sd * l), i, WALL + 1)) off.push("stand " + i); }
    { const sd = -D.outSide(S, T0.screen, T0.c[0], T0.c[1]); if (!clear(...at(T0.screen, sd * (WALL + 7)), T0.screen, WALL + 4)) off.push("screen"); }
    { const sd = -D.outSide(S, T0.podium, T0.c[0], T0.c[1]); if (!clear(...at(T0.podium, sd * (WALL + 9)), T0.podium, WALL + 6)) off.push("podium"); }
    check(T0.stands.length === 2 && !off.length, `${id}: the grandstands, the screen and the podium stand off every other stretch of road${off.length ? ": " + off.slice(0, 6).join(", ") : ""}`);
    let sep = 1e9; for (let i = 0; i < N; i += 3) for (let j = 0; j < N; j += 3) if (!near(i, j, Math.ceil(60 / (len / N)))) sep = Math.min(sep, S[i].p.distanceTo(S[j].p));
    check(sep > 2 * WALL + 8, `${id}: no two stretches of road closer than ${(2 * WALL + 8).toFixed(1)} m (${sep.toFixed(1)} m)`); }
  const F = C.TRACKS; check(F.moon.feel.grav < F.nexus.feel.grav && F.ice.feel.grip < 1 && F.volcano.feel.lava && !F.nexus.feel.lava && F.nexus.feel.grip === 1, "each new track has its feel: the moon's low gravity, the ice's grip, the volcano's lava"); }
{ let same = true; for (let t = Date.parse("2026-10-30T00:00:00Z"), i = 0; i < 40; i++, t += 7 * 3600e3) { const a = dailyOf(t), b = C.dailyOf(t); if (a.day !== b.day || a.seed !== b.seed || a.rule !== b.rule || a.track !== b.track) same = false; }
  { const tr = new Set(); for (let i = 0; i < 60; i++) tr.add(dailyOf(Date.parse("2026-11-01T00:00:00Z") + i * 864e5).track); check(tr.size === 4, "K5: every track comes up as the daily's over two months"); }
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
  for (const id of C.TRACK_IDS) { want.add(C.TRACKS[id].name); want.add(C.TRACKS[id].line); if (C.TRACKS[id].short) want.add(C.TRACKS[id].short); } // (K5: the tracks' names and lines)
  const miss = []; for (const s of want) for (const l of ["ko", "zh", "tr"]) if (C.LW[l][s] == null) miss.push(l + "|" + s);
  check(want.size > 60 && miss.length === 0, `world-kart.js's ${want.size} strings are in ko/zh/tr${miss.length ? ": " + miss.slice(0, 12).join(", ") : ""}`); }
// ---- K6's helpers: the gaps, the photo finish, the settings, tilt, where the ramps and the tunnel sit ----
{ const M = new Float32Array(40).fill(-1); let mk = 0; mk = C.markAt(M, mk, 0, 0); mk = C.markAt(M, mk, 23, 1); mk = C.markAt(M, mk, 51, 2); // (0 m at 0 s, 23 m at 1 s, 51 m at 2 s)
  check(M[0] === 0 && M[1] === 1 && M[4] === 1 && M[5] === 2 && M[10] === 2 && M[11] === -1 && mk === 11, "markAt fills every bin it passes, once (" + Array.from(M.slice(0, 12)).join(",") + ")");
  const again = C.markAt(M, mk, 52, 9); check(M[10] === 2 && again === 11, "markAt never moves a bin that is filled");
  check(Math.abs(C.gapTo(M, 24, 2.8) - 1.8) < 1e-9 && C.gapTo(M, 0, 0.5) === 0.5 && C.gapTo(M, 60, 3) === null && C.gapTo(M, -3, 1) === null, "gapTo: how long ago the leader passed where the trailer is; null where it never was");
  check(Math.abs(C.gapTo(M, 5 * C.GAP_M, 2.5) - 0.5) < 1e-9 && Math.abs(C.gapTo(M, 5 * C.GAP_M - 0.01, 2.5) - 1.5) < 1e-9, "gapTo reads the bin of GAP_M metres the trailer is in"); }
{ const o = (finish, rem, speed) => ({ finish, rem, speed });
  check(C.photoFinish(60, [o(59.95, 0, 30)]) && C.photoFinish(60, [o(0, 1.5, 30)]) && C.photoFinish(60, [o(60.05, 0, 0)]), "a photo finish: one over the line 0.05 s before, one 1.5 m behind at 30 m/s, one 0.15 s after");
  check(!C.photoFinish(60, [o(59.85, 0, 30), o(0, 4, 30), o(0, 200, 34)]) && !C.photoFinish(60, []), "no photo finish 0.3 s apart, 8 m behind at 30 m/s, or alone");
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
// ---- K3's items: weighted by place, none in Time Attack, the server's minLap still true with them ----
{ const N = 2000, avg = [], seen = []; for (let pl = 1; pl <= 5; pl++) { let sum = 0; const got = new Set(); for (let i = 0; i < N; i++) { const it = C.itemFor(pl, 5, (i + 0.5) / N); got.add(it); sum += C.ITEM_POW[it]; } avg.push(sum / N); seen.push(got); }
  check(avg.every((v, i) => i === 0 || v >= avg[i - 1] - 1e-9) && avg[4] - avg[0] > 1, "items: the further back, the stronger (" + avg.map((v) => v.toFixed(2)).join(" ≤ ") + ")");
  check(!seen[0].has("rocket") && !seen[0].has("pump") && !seen[4].has("rug") && seen[4].has("rocket") && seen[4].has("pump"), "1st never draws a rocket or a pump; last never a rug, but rockets and pumps");
  check([...Array(5)].every((_, i) => C.ITEMS.every((it) => C.ITEM_POW[it] > 0)) && seen.reduce((a, s) => a + s.size, 0) >= 20 && new Set(seen.flatMap((s) => [...s])).size === 6, "all six items come out of the boxes");
  check(C.itemFor(1, 1, 0.5) && C.tierOf(1, 5) === "front" && C.tierOf(5, 5) === "back" && C.tierOf(3, 5) === "mid" && C.ITEMS.includes(C.itemFor(3, 5, 1)) && C.ITEMS.includes(C.itemFor(3, 5, 0)), "itemFor's edges: alone, r = 0 and r = 1"); }
check(C.itemsOn("race") && C.itemsOn("daily") && !C.itemsOn("ta"), "items in Race and the Daily, never in Time Attack");
{ const D = await import("../../world-kart-dress.js"), near = (a, b, n) => Math.min(Math.abs(a - b), 900 - Math.abs(a - b)) < n;
  check(C.ITEM.rows.every((r) => D.RAMPS.every((x) => !near(r, x.i, 30)) && [180, 420, 650].every((p) => !near(r, p, 25)) && !(r >= D.TUNNEL[0] - 10 && r <= D.TUNNEL[1] + 10) && !(r > 760 && r < 890) && !near(r, 0, 60)), "the box rows: clear of the ramps, the pads, the tunnel, the last corner and the line");
  check(((C.ITEM.per - 1) / 2) * C.ITEM.gap + 0.8 <= 8, "the boxes sit on the road"); }
{ const curve = new THREE.CatmullRomCurve3(C.TRACK_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "centripetal"), len = curve.getLength();
  check(C.ITEM.pump.k <= 1 && C.TOP * C.ITEM.magnet.top < C.BOOST_TOP, `the pump is a boost (≤ BOOST_TOP ${C.BOOST_TOP} m/s) and the magnet pulls to ${(C.TOP * C.ITEM.magnet.top).toFixed(1)} m/s — under it`);
  check(len / (C.BOOST_TOP * 1.15) >= KART.TRACKS.nexus.minLap, `the fastest lap items allow (BOOST_TOP the whole way, even under the turbo rule ×1.15: ${(len / (C.BOOST_TOP * 1.15)).toFixed(1)} s) is no faster than minLap ${KART.TRACKS.nexus.minLap} s`); }
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
check((await call(p1, "world-kart-start", { track: "mars", mode: "race" })).status === 400, "no such track: refused");
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
// K5: the new tracks — each its own minLap, its own week board and ghost; the daily runs on the day's track whatever is sent
{ const p4 = ethers.Wallet.createRandom(), L = KART.TRACKS.moon.minLap;
  let s = await call(p4, "world-kart-start", { track: "moon", mode: "race", racer: "pengu" }); T += 120e3;
  check((await call(p4, "world-kart-end", { raceId: s.body.raceId, place: 1, laps: [L - 1, 40, 40], time: L + 79 })).status === 400, `Lunar Loop: a ${L - 1} s lap is under its minLap ${L}: refused`);
  r = await call(p4, "world-kart-end", { raceId: s.body.raceId, place: 2, ...L3(L, 33, 33), ghost: G2 });
  check(r.status === 200 && r.body.credited === 350 && r.body.rank === 1 && r.body.best === L + 66 && db.get(`worldKartGhost/moon_${p4.address.toLowerCase()}`).g === G2 && !db.has(`worldKartGhost/nexus_${p4.address.toLowerCase()}`), "Lunar Loop: paid by the same PAY table, #1 on its own week board, its own ghost");
  const tm = await read("world=kart-top&track=moon"), tn = await read("world=kart-top&track=nexus"); check(tm.body.track === "moon" && tm.body.top.length === 1 && !tn.body.top.some((x) => x.t === L + 66), "the week's boards are per track");
  check((await read("world=kart-ghost&track=moon&who=top")).body.g === G2 && (await read("world=kart-ghost&track=volcano&who=top")).status === 404, "the #1's ghost per track (none yet on Magma Run)");
  for (const id of ["ice", "volcano"]) { s = await call(p4, "world-kart-start", { track: id, mode: "ta", racer: "pengu" }); T += 100e3; r = await call(p4, "world-kart-end", { raceId: s.body.raceId, place: 0, ...L3(KART.TRACKS[id].minLap, 30, 30) }); check(r.status === 200 && r.body.credited === 0 && r.body.newBest && r.body.meta.best[id] > 0, `${id}: a time attack at its minLap is accepted, a best of its own`); }
  const dd = dailyOf(T), other = KART.TRACK_IDS.find((x) => x !== dd.track); s = await call(p4, "world-kart-start", { track: other, mode: "daily", racer: "pengu" });
  check(s.body.track === dd.track && s.body.daily.track === dd.track && db.get(`worldKartRace/${p4.address.toLowerCase()}`).track === dd.track && (await read("world=kart-daily")).body.track === dd.track, `the daily runs on the day's track (${dd.track}) even when another (${other}) is sent`); }
{ const p3 = ethers.Wallet.createRandom(), lap = Math.ceil(1079 / C.BOOST_TOP); r = await race(p3, "race", 1, L3(lap, lap, lap)); check(r.status === 200 && r.body.credited === 500, `K3: an honest race at the items' top pace (${lap} s laps — a pump or a magnet can't beat BOOST_TOP) is accepted and paid`); }
// ---- KQ (the premium remaster): every track's props stand off the road, clear of the line, the screen, the podium; fewer on a phone, a quarter and no landmarks on low; the flames and the speed lines grow with speed ----
{ const Q = await import("../../world-kart-kq.js"), N = 900, WALL = 8 + 3.2, ROAD = 16, fs2 = await import("node:fs");
  for (const id of C.TRACK_IDS) { const T0 = C.TRACKS[id], P = curveOf(id).getSpacedPoints(N), S = []; for (let i = 0; i < N; i++) { const p = P[i], q = P[(i + 1) % N], t = q.clone().sub(p).normalize(); S.push({ p, t, r: new THREE.Vector3(-t.z, 0, t.x) }); }
    const archN = Math.floor(curveOf(id).getLength() / 60), arches = []; for (let k = 0; k < archN; k++) arches.push(Math.floor((k / archN) * N));
    const all = Q.propSpots(S, N, T0, Q.KQ[id], { WALL, ROAD, arches }), ph = Q.propSpots(S, N, T0, Q.KQ[id], { WALL, ROAD, arches, coarse: true }), lo = Q.propSpots(S, N, T0, Q.KQ[id], { WALL, ROAD, arches, low: true });
    const cnt = (o) => Object.values(o).reduce((n, a) => n + a.length, 0), over = ["gate", "blimp", "ice/ice-arch", "moon/float-rock"];
    let worst = 1e9, at = ""; for (const [k, a] of Object.entries(all)) { if (over.includes(k)) continue; for (const [x, z] of a) for (let j = 0; j < N; j += 2) { const d = Math.hypot(S[j].p.x - x, S[j].p.z - z); if (d < worst) { worst = d; at = k; } } }
    check(worst > WALL, `KQ ${id}: no prop on the road or the rail (nearest ${worst.toFixed(1)} m from the line's middle, ${at}; the rail at ${WALL})`);
    check(cnt(ph) <= cnt(all) * 0.75 && cnt(lo) <= cnt(all) * 0.45 && !lo.gate && !lo.blimp && !lo["nexus/billboard"] && !lo["moon/float-rock"] && !lo.stand, `KQ ${id}: ${cnt(all)} props on a computer, ${cnt(ph)} on a phone, ${cnt(lo)} on low (no landmarks, no Meshy stands)`);
    check(Object.keys(all).every((k) => fs2.existsSync(`${ROOT}/models/world/kart/${{ stand: "shared/grandstand", fence: "shared/fence", gate: "shared/arch-gate", blimp: "shared/blimp" }[k] || k}.glb`)), `KQ ${id}: every kind's model is packed (${Object.keys(all).join(", ")})`);
    check(fs2.existsSync(`${ROOT}/images/kart/tracks/${id}-sky.webp`) && fs2.existsSync(`${ROOT}/images/kart/tracks/${id}-road.webp`) && T0.look.sky.endsWith(`${id}-sky.webp`) && T0.look.road.endsWith(`${id}-road.webp`), `KQ ${id}: its own Meshy sky and road`); }
  const f0 = Q.flameOf({ sp: 0.3 }), f1 = Q.flameOf({ sp: 1 }), fb = Q.flameOf({ sp: 1, boost: true, lv: 3 });
  check(f0.len < f1.len && f1.len < fb.len && f0.op < f1.op && fb.op === 1, `KQ: the flames grow with speed and a boost (${f0.len.toFixed(2)} → ${f1.len.toFixed(2)} → ${fb.len.toFixed(2)} m)`);
  check(Q.streakOf(0.78, false) === 0 && Q.streakOf(1, false) > 0.99 && Q.streakOf(0.5, true, 1) > 0.5 && Q.overlayOf(1) <= 0.5, "KQ: speed lines from 80 % of the top speed, a boost lifts them, the screen overlay at half"); }
// ---- KX2 (feel, FX, music): PERFECT windows on every track, the bump's impulse, the hold-behind items, the racing music's patterns ----
{ const N = 900, M = await import("../../world-kart-music.js");
  for (const id of C.TRACK_IDS) { for (const flip of [false, true]) { const P = new THREE.CatmullRomCurve3(C.TRACKS[id].pts.map(([x, z]) => new THREE.Vector3(flip ? -x : x, 0, z)), true, "centripetal").getSpacedPoints(N), S = []; for (let i = 0; i < N; i++) { const t = P[(i + 1) % N].clone().sub(P[i]).normalize(); S.push({ p: P[i], t }); }
    const tab = C.perfectTable(S, N); let win = 0, runs = 0, signsOk = true; for (let i = 0; i < N; i++) { if (tab[i]) win++; if (tab[i] && !tab[(i - 1 + N) % N]) runs++; }
    // the steer it asks for turns the kart the corner's way: world-kart.js turns yaw by −steer, yaw = atan2(t.x, t.z)
    for (let i = 0; i < N; i++) { if (!tab[i]) continue; let q = -1; for (let j = C.PERFECT.from; j <= C.PERFECT.to + 8; j++) { const a = S[(i + j - C.PERFECT.w + N) % N].t, b = S[(i + j + C.PERFECT.w) % N].t; if (Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))) > C.PERFECT.bend) { q = (i + j) % N; break; } } if (q < 0) continue;
      const ya = Math.atan2(S[(q - C.PERFECT.w + N) % N].t.x, S[(q - C.PERFECT.w + N) % N].t.z), yb = Math.atan2(S[(q + C.PERFECT.w) % N].t.x, S[(q + C.PERFECT.w) % N].t.z), dy = Math.atan2(Math.sin(yb - ya), Math.cos(yb - ya)); if (Math.sign(-dy) !== tab[i]) signsOk = false; }
    check(runs >= 3 && win > 0 && win < N * 0.3 && signsOk, `KX2 ${id}${flip ? " (mirrored)" : ""}: ${runs} corners with a PERFECT window (${win} samples), each asking the corner's way`); } }
  check(C.bumpJ(30, 0, 10, 0, 1, 0) > 0 && C.bumpJ(10, 0, 30, 0, 1, 0) === 0 && Math.abs(C.bumpJ(20, 0, 0, 0, 1, 0) - 20 * (1 + C.BUMP.e) / 2) < 1e-9, "KX2: a bump's impulse from the closing speed only (none when they part)");
  check(C.HOLDABLE.shield && C.HOLDABLE.rug && !C.HOLDABLE.rocket && !C.HOLDABLE.bomb && C.HOLD_S > 0.15 && C.HOLD_S < 0.5, "KX2: only a shield or a rug can be held behind; a hold starts after " + C.HOLD_S + " s");
  for (const id of C.TRACK_IDS) { const st = M.STYLES[id]; let n = 0, nf = 0, bad2 = 0; for (let b = 0; b < 16; b++) for (let s = 0; s < 16; s++) { const a = M.patternAt(st, b, s, false), f = M.patternAt(st, b, s, true); n += a.length; nf += f.length; for (const e of [...a, ...f]) if (e.m != null && !(e.m >= 24 && e.m <= 100)) bad2++; }
    const parts = new Set(); for (let b = 0; b < 16; b++) for (const e of M.patternAt(st, b, 0, false).concat(M.patternAt(st, b, 4, false))) parts.add(e.v);
    check(st && st.bpm >= 110 && st.bpm <= 140 && M.bpmOf(st, true) > st.bpm && nf > n && !bad2 && parts.has("kick") && parts.has("bass"), `KX2 music ${id}: ${st.name} at ${st.bpm} BPM (final lap ${M.bpmOf(st, true).toFixed(0)}), ${n} notes a 16-bar song, ${nf} on the final lap, all in range`); }
  check(!M.partsOf(0, false).arp && M.partsOf(4, false).arp && M.partsOf(8, false).lead && M.partsOf(3, false).fill && M.partsOf(0, true).lead, "KX2 music: sections add the arp then the lead, a fill every 4 bars, the final lap plays all");
  const src = fs.readFileSync(ROOT + "/world-kart.js", "utf8"); check(fs.existsSync(ROOT + "/images/kart/fx/rugged.webp") && fs.existsSync(ROOT + "/images/kart/fx/perfect.webp") && /stickers\.show\(k, "rugged"\)/.test(src) && /stickers\.show\(k, "perfect"\)/.test(src), "KX2: the RUGGED! and PERFECT! stickers are in and shown"); }
console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
