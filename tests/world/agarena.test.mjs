// agarena.test.mjs — the Agent Arena (api/_world-agarena.mjs, AD-City 4): server-dealt quiz runs (no answers sent), the
// agent's 50:50 once a run, marking on the server's clock, 3 runs a day, the arena hour twice, the week's board.
// Behind AGENT DIMENSION's door; you need an agent. On an in-memory store. Run: node tests/world/agarena.test.mjs
import fs from "node:fs";
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { AGENT } = await import("../../api/_world-agent.mjs");
AGENT.OPEN = false; AGENT.PRELAUNCH = true; // (written for the pre-launch: closed, free)
const { ARENA, BANK, hourOf, ptsOf } = await import("../../api/_world-agarena.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); } return { ok: true }; },
};
const json = (status, b, cache) => ({ status, body: b, cache });
let T = Date.parse("2026-10-23T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
let n = 0; const randomId = () => (0x1000000 + ++n * 7919).toString(16) + "abcdef";
let aiReply = '{"title":"Dino Dash","theme":"jungle","speed":9,"len":60,"coins":5,"walls":3,"gaps":2,"lasers":1,"evil":"x"}';
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId, random: Math.random, ai: async () => aiReply, tokenBalance: async () => "0" });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const get = async (q) => (await W.read(new URL("https://x/api/social?world=" + q))).body;
const me = ethers.Wallet.createRandom(), fan = ethers.Wallet.createRandom();
const ag = async (w, id) => { db.set(`worldAgent/${w.address.toLowerCase()}`, { kind: "orion", id, name: id.toUpperCase(), xp: 0, at: T, jobs: [], log: [] }); };
check(BANK.length >= 20 && BANK.every((q) => q.q && q.a && q.b.length === 2), "the bank: " + BANK.length + " questions, each with one right and two wrong");
check(ptsOf(true, 1000) === 200 && ptsOf(true, ARENA.SECS * 1000) === 100 && ptsOf(false, 500) === 0, "points: 100 right, up to 100 more for speed");
check(hourOf(Date.parse("2026-10-23T03:30:00Z")).on && !hourOf(Date.parse("2026-10-23T05:00:00Z")).on && hourOf(Date.parse("2026-10-23T12:10:00Z")).on, "the arena hour: 12:00 and 21:00 Seoul");
let r = await call(me, "world-agarena-start"); check(r.status === 403 && r.body.closed, "closed: a player can't start yet");
AGENT.OPEN = true;
r = await W.handle({ action: "world-agarena-start" }); check(r.status >= 400 && r.status < 500, "no signature: nothing");
r = await call(me, "world-agarena-start"); check(r.status === 400 && r.body.noAgent, "no agent: make one first");
await ag(me, "orbit"); await ag(fan, "nyx");
T = Date.parse("2026-10-23T05:00:00Z"); // (not the arena hour)
r = await call(me, "world-agarena-start"); const qs = r.body.qs;
check(r.status === 200 && qs.length === ARENA.Q && qs.every((q) => q.opts.length === 3) && !JSON.stringify(r.body).includes('"right"') && r.body.left === 2 && !r.body.hour, "a run dealt: 7 questions, no answers sent, 2 runs left");
const right = qs.map((q) => { const B = BANK.find((x) => x.q === q.q); return q.opts.indexOf(B.a); });
r = await call(me, "world-agarena-help", { q: 0 }); check(r.status === 200 && r.body.cut !== right[0] && r.body.cut >= 0 && r.body.cut < 3, "the agent's help takes a wrong option away");
r = await call(me, "world-agarena-help", { q: 1 }); check(r.status === 400, "once a run");
T += 300; r = await call(me, "world-agarena-end", { picks: right, ms: right.map(() => 1000) }); const k0 = `worldAgArena/${me.address.toLowerCase()}_2026-10-23`;
check(r.status === 200 && r.body.correct < ARENA.Q, "answered faster than the server's clock allows: not all counted (" + r.body.correct + ")");
r = await call(me, "world-agarena-start"); const qs2 = r.body.qs; const right2 = qs2.map((q) => q.opts.indexOf(BANK.find((x) => x.q === q.q).a));
check(!qs2.some((q) => qs.some((p) => p.q === q.q)), "a second run today: new questions");
T += 20e3; r = await call(me, "world-agarena-end", { picks: right2, ms: right2.map(() => 2000) });
check(r.body.correct === ARENA.Q && r.body.perfect && r.body.pts === ARENA.Q * 200 + ARENA.PERFECT && !r.body.hour && JSON.stringify(r.body.right) === JSON.stringify(right2), "all right and fast: " + r.body.pts + " points, a perfect run");
T += 1000; r = await call(me, "world-agarena-end", { picks: right2, ms: [] }); check(r.status === 400, "a run is marked once");
const wk = r && (await get("agarena-top")); check(wk.top.length === 1 && wk.top[0].agent === "ORBIT" && wk.top[0].runs === 2, "the week's board: " + JSON.stringify(wk.top[0]));
r = await call(me, "world-agarena-start"); check(r.status === 200 && r.body.left === 0, "the third run");
T += 15e3; r = await call(me, "world-agarena-end", { picks: [9, 9], ms: [99e9] }); check(r.status === 200 && r.body.pts === 0, "wrong picks: nothing");
r = await call(me, "world-agarena-start"); check(r.status === 400 && r.body.left === 0, "3 runs a day");
// the arena hour: twice the points; the page's times past the server's clock: no speed points
T = Date.parse("2026-10-23T12:05:00Z"); r = await call(fan, "world-agarena-start"); check(r.body.hour, "21:00 Seoul: the arena hour");
const rf = r.body.qs.map((q) => q.opts.indexOf(BANK.find((x) => x.q === q.q).a));
T += 10e3; r = await call(fan, "world-agarena-end", { picks: rf, ms: rf.map(() => 14000) });
check(r.body.pts === (ARENA.Q * 100 + ARENA.PERFECT) * 2, "the hour counts twice, speed only when the times add up: " + r.body.pts);
const top = await get("agarena-top"); check(top.top[0].agent === "NYX" && top.top.length === 2, "the board sorted");
// a run left open counts nothing and a new one starts
T = Date.parse("2026-10-24T05:00:00Z"); await call(fan, "world-agarena-start"); r = await call(fan, "world-agarena-start"); const d = db.get(`worldAgArena/${fan.address.toLowerCase()}_2026-10-24`);
check(r.status === 200 && d.runs.length === 2 && d.runs[0].end && d.runs[0].pts === 0, "a run left open is closed with 0");
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
