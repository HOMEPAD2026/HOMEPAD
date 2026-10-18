// rings.test.mjs — INFINITY RINGS: the engine (world-rings-engine.js) and the server's copy are the same file; every
// campaign level, today's daily puzzles and the endless boards are made the same way every time, start with nothing
// free and have a clear the solver finds; the rules (hooks, pegs, locks, energy, gears, the hammer); and the server
// (api/_world-rings.mjs): the moves replayed there, 100 ARCL a new star, the difference for a better clear, the daily
// puzzles, the day's 10,000 limit, too-fast clears refused, an end counted once, INFINITY MASTER at level 100.
// On an in-memory store. Run: node tests/world/rings.test.mjs (needs ethers 6)
import fs from "node:fs";
import { ethers } from "ethers";
const E = await import("../../world-rings-engine.js");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

check(fs.readFileSync(new URL("../../world-rings-engine.js", import.meta.url), "utf8") === fs.readFileSync(new URL("../../api/_world-rings-engine.mjs", import.meta.url), "utf8"), "the server's engine is the game's, word for word");
// every level
let all = true, start = true, solved = true, sizes = true, why = "";
for (let n = 1; n <= 100; n++) {
  const L = E.level(String(n)); if (!L) { all = false; why += " no " + n; continue; }
  const s = E.stateOf(L); if (E.settle(L, s).length) { start = false; why += " free " + n; }
  const p = E.plan(L, E.stateOf(L), 8, 2), r = p && E.replay(L, p); if (!r || !r.clear) { solved = false; why += " unsolved " + n; }
  if (n <= 10 && L.rings.length > 4 || n > 80 && n < 100 && L.rings.length < 12 || L.par < 1) { sizes = false; why += " size " + n; }
}
check(all && start && solved && sizes, "100 levels: made, nothing free at the start, each has a clear, sizes as planned" + why);
check(JSON.stringify(E.level("37")) === JSON.stringify((E.level("37"), E.level("37"))), "the same level every time");
check(E.level("100").boss && E.level("100").rings.filter((r) => r.core).length === 2, "level 100 is the INFINITY BOSS: two core rings");
check(E.level("d:2026-10-18:0") && E.level("d:2026-10-18:2") && E.level("e:5") && !E.level("101") && !E.level("d:2026-10-18:3") && !E.level("x"), "daily puzzles 0–2 and the endless boards exist; nothing else does");
// the rules on a hand-made board: A–B hooked (A's way to B 0, B's to A 4), B on a peg at 2
const H = { rings: [{ x: 0, y: 0, r: 1, g: 2, k: 0, key: -1, gear: -1, peg: -1 }, { x: 1.85, y: 0, r: 1, g: 6, k: 0, key: -1, gear: -1, peg: 2 }], links: [[0, 1, 0, 4]], par: 3 };
H.adj = [[H.links[0]], [H.links[0]]]; H.gears = [];
let s = E.stateOf(H); check(!E.isFree(H, s, 0) && !E.isFree(H, s, 1), "hooked rings aren't free");
E.turn(H, s, 0, -1); E.turn(H, s, 0, -1); check(s.alive[0] === false && s.alive[1] === true, "A's gap onto B: A falls; B stays on its peg");
let w = E.turn(H, s, 1, -1); const up = s.alive[1]; E.turn(H, s, 1, -1); E.turn(H, s, 1, -1); E.turn(H, s, 1, -1); check(!!w && up && s.g[1] === 2 && !s.alive[1], "B off once its gap faces its peg");
s = E.stateOf(H); H.rings[1].k = 2; check(E.turn(H, s, 1, 1) === null && !!E.turn(H, s, 1, -1), "an energy ring turns clockwise only"); H.rings[1].k = 0;
s = E.stateOf(H); H.rings[1].k = 1; H.rings[1].key = 0; check(E.turn(H, s, 1, -1) === null, "a lock ring waits for its key"); E.turn(H, s, 0, -1); E.turn(H, s, 0, -1); check(!!E.turn(H, s, 1, -1), "…and turns once the key has fallen"); H.rings[1].k = 0; H.rings[1].key = -1;
s = E.stateOf(H); H.rings[0].gear = H.rings[1].gear = 0; H.gears = [[0, 1]]; E.turn(H, s, 0, 1); check(s.g[0] === 3 && s.g[1] === 7, "gear rings turn together"); H.rings[0].gear = H.rings[1].gear = -1; H.gears = [];
check(E.starsOf({ par: 10 }, 10) === 3 && E.starsOf({ par: 10 }, 15) === 2 && E.starsOf({ par: 10 }, 16) === 1 && E.starsOf({ par: 10 }, 8, 1) === 1 && E.starsOf({ par: 10 }, 8, 0, 1) === 2, "stars: par 3, a little over 2, else 1; the hammer 1, a hint at most 2");
check(!E.replay(E.level("5"), [[0, 2]]).ok && !E.replay(E.level("5"), [[99, 1]]).ok && E.replay(E.level("5"), []).clear === false, "replay refuses moves that can't be made");
check(E.hint(E.level("12"), E.stateOf(E.level("12"))) !== null, "a hint from the start");

// the server
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-10-14T03:00:00Z"), n = 0;
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, randomId: () => "run" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const p1 = ethers.Wallet.createRandom(), p2 = ethers.Wallet.createRandom();
const best = (id) => E.plan(E.level(id), E.stateOf(E.level(id)), 8, 2);
const worse = (id) => { const p = best(id).slice(), L = E.level(id); const extra = L.par + Math.max(2, Math.ceil(L.par * 0.5)) + 1 - p.length; const i = p.findIndex(() => true); const pad = []; for (let k = 0; k < Math.ceil(extra / 2) * 2 && k < 40; k++) pad.push([p[0][0], k % 2 ? -1 : 1]); return [...pad, ...p]; };
const play = async (w, lv, moves, wait = 60e3, hints = 0) => { const r = await call(w, "world-rings-start", { lv }); if (r.status !== 200) return r; T += wait; return call(w, "world-rings-end", { runId: r.body.runId, moves, hints }); };

let r = await call(p1, "world-rings-start", { lv: "101" }); check(r.status === 400, "no level 101");
r = await play(p1, "3", best("3").slice(0, -1)); check(r.status === 400, "a board that isn't clear doesn't pay");
r = await play(p1, "3", best("3"), 300); check(r.status === 400, "faster than a person can play: refused");
const L3 = E.level("3"), m3 = best("3");
r = await play(p1, "3", m3); check(r.status === 200 && r.body.stars === (m3.length <= L3.par ? 3 : 2) && r.body.credited === r.body.stars * 100 && bal(p1) === r.body.stars * 100, "a clear pays 100 a star (" + r.body.stars + "★ → " + r.body.credited + ")");
r = await play(p1, "3", m3); check(r.status === 200 && r.body.credited === 0 && r.body.why === "already", "the same stars again: nothing");
r = await play(p1, "8", worse("8"), 60e3, 0); const s8 = r.body.stars; check(r.status === 200 && s8 < 3 && r.body.credited === s8 * 100, "a slow clear: fewer stars (" + s8 + "★)");
r = await play(p1, "8", best("8")); check(r.status === 200 && r.body.stars === 3 && r.body.credited === (3 - s8) * 100, "a better clear later pays the difference");
r = await play(p1, "9", best("9"), 60e3, 2); check(r.status === 200 && r.body.stars === 2, "with a hint: at most 2 stars");
r = await call(p1, "world-rings-start", { lv: "10" }); T += 60e3; const e10 = await call(p1, "world-rings-end", { runId: r.body.runId, moves: best("10") }); const again = await call(p1, "world-rings-end", { runId: r.body.runId, moves: best("10") });
check(e10.status === 200 && again.status === 409, "an end counts once");
const day = new Date(T + 9 * 3600e3).toISOString().slice(0, 10);
r = await play(p1, `d:${day}:0`, best(`d:${day}:0`)); check(r.status === 200 && r.body.credited > 0, "today's daily puzzle pays");
r = await call(p1, "world-rings-start", { lv: "d:2020-01-01:0" }); check(r.status === 400, "another day's daily puzzle can't be played for pay");
// the day's limit: p2 clears level after level with 3 stars until the 10,000
let paid = 0, lvN = 0; for (let k = 11; k <= 99 && paid < 10000; k++) { r = await play(p2, String(k), best(String(k))); if (r.status === 200) { paid += r.body.credited; lvN = k; } }
check(paid === 10000 && bal(p2) === 10000, "the day's 10,000 ARCL limit (" + (lvN - 10) + " levels)");
r = await play(p2, "98", best("98")); const k98 = r.body; check(r.status === 200 && k98.credited === 0 && k98.why === "cap", "over the limit: nothing paid, and the stars stay unpaid…");
T += 24 * 3600e3; r = await play(p2, "98", best("98")); check(r.status === 200 && r.body.credited > 0, "…so the next day the same level pays them");
r = await play(p2, "100", best("100")); check(r.status === 200 && r.body.master === true, "level 100: INFINITY MASTER");
const v = await W.read(new URL("http://x/api/social?world=rings&wallet=" + p2.address.toLowerCase())); check(v.status === 200 && v.body.master && v.body.best.c100 >= 1 && v.body.cap === 10000, "progress reads back");
const top = await W.read(new URL("http://x/api/social?world=rings-top")); check(top.status === 200 && top.body.top.length === 2 && top.body.top[0].stars >= top.body.top[1].stars, "the week's star board");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
