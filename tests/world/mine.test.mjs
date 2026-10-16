// mine.test.mjs — the ARCL Mine (api/_world-mine.mjs): the hour and the 6-hour rest, rocks that can't break faster than
// a pickaxe, a break paid once, the mine's own daily limit, pickaxe tiers, and what an hour pays on average.
// On an in-memory store. Run: node tests/world/mine.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { MINE, rockValue, rockType, rockHits } = await import("../../api/_world-mine.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, n] of Object.entries(x.fields)) d[k] = (d[k] || 0) + n; db.set(x.inc, d); } } return { ok: true }; },
};
const json = (status, b, cache) => ({ status, body: b, cache });
let T = Date.parse("2026-10-16T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
let n = 0; const randomId = () => (0x1000000 + ++n * 7919).toString(16).padStart(8, "0") + "deadbeefcafe0000";
let seed = 12345; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId, random });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const bal = (w) => ((db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal) || 0;
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });

// ---- the numbers ----
check(rockValue(0, 0.1, 0.9) === 0 && rockValue(2, 0.19, 1) === 0, "a fifth of rocks are empty");
check(rockValue(0, 0.5, 0) === 10 && rockValue(0, 0.5, 1) === 100, "copper: 10 to 100");
check(rockValue(1, 0.5, 0) === 100 && rockValue(1, 0.5, 1) === 1000, "silver: 100 to 1,000");
check(rockValue(2, 0.5, 0) === 1000 && rockValue(2, 0.5, 1) === 10000, "gold: 1,000 to 10,000");
{ let big = 0, golds = 0, cu = 0, N = 2e6; for (let i = 0; i < N; i++) { const t = rockType(random()); if (t === 2) { golds++; if (rockValue(2, 1, random()) >= 9900) big++; } if (t === 0) cu++; }
  check(golds / N > 0.012 && golds / N < 0.018, "gold is rare: " + (golds / N * 100).toFixed(2) + "% of rocks");
  check(cu / N > 0.88, "copper is common: " + (cu / N * 100).toFixed(1) + "%");
  check(big / golds < 0.006, "a full 10,000 is about 1 gold in a few hundred or more: " + (big / golds * 100).toFixed(2) + "%"); }
check(rockHits(0, 0, 0) === 10 && rockHits(0, 0, 1) === 20, "copper takes 10–20 hits with the Common pickaxe");
check(rockHits(0, 3, 1) === 8 && rockHits(2, 3, 1) < rockHits(2, 0, 1) / 2, "a Legendary pickaxe needs far fewer hits");

// ---- a visit ----
const w1 = ethers.Wallet.createRandom(), a1 = w1.address.toLowerCase();
let r = await W.handle({ action: "world-mine-enter" }); check(r.status >= 400, "no signature: no visit");
r = await call(w1, "world-mine-enter"); const run = r.body;
check(r.status === 200 && run.runId && run.rocks.length === MINE.START_ROCKS && run.left === MINE.SESSION_MS && run.tier === 0, "a visit starts with a full hour and a few rocks");
check(run.rocks.every((x) => x.t >= 0 && x.t <= 2 && x.h >= 3 && !("v" in x)), "the page sees each rock's kind and hits, never what's inside");
// too fast
const rk = run.rocks[0];
T += 1000; r = await call(w1, "world-mine-break", { runId: run.runId, rock: rk.id });
check(r.status === 429, "a rock can't break faster than its hits");
T += rk.h * MINE.SWING_MS; r = await call(w1, "world-mine-break", { runId: run.runId, rock: rk.id });
check(r.status === 200 && r.body.rocks.length === MINE.START_ROCKS - 1 && bal(w1) === r.body.got, "after its hits it breaks and pays: " + JSON.stringify({ got: r.body.got, t: r.body.t }));
r = await call(w1, "world-mine-break", { runId: run.runId, rock: rk.id }); check(r.status === 409, "a broken rock can't pay twice");
// time keeps going while inside (beats), and stops when you leave
T += 10 * 60e3 - rk.h * MINE.SWING_MS - 1000; for (let i = 0; i < 1; i++) { r = await call(w1, "world-mine-beat", { runId: run.runId }); }
check(r.status === 409, "no call for ten minutes: the visit ended (the page went away)");
let v = (await W.read(new URL("https://x/api/social?world=mine&wallet=" + a1))).body;
check(v.left > MINE.SESSION_MS - 60e3 && v.left < MINE.SESSION_MS, "a page that went away is only charged to its last call: " + Math.round(v.left / 1000) + " s left");
r = await call(w1, "world-mine-enter"); const run2 = r.body;
check(r.status === 200 && run2.runId !== run.runId, "in again: a new visit");
r = await call(w1, "world-mine-break", { runId: run.runId, rock: run2.rocks[0].id }); check(r.status === 409, "the old visit's id no longer pays");
for (let i = 0; i < 40; i++) { T += 15e3; r = await call(w1, "world-mine-beat", { runId: run2.runId }); }
check(r.status === 200 && r.body.rocks.length <= MINE.MAX_ROCKS && r.body.rocks.length > run2.rocks.length, "rocks keep turning up while you're in, up to " + MINE.MAX_ROCKS);
r = await call(w1, "world-mine-leave", { runId: run2.runId }); const leftAtLeave = r.body.left;
T += 3 * 3600e3; v = (await W.read(new URL("https://x/api/social?world=mine&wallet=" + a1))).body;
check(v.left === leftAtLeave && v.left > 40 * 60e3 && v.left < 50 * 60e3, "time used stays used, and nothing is used while away: " + Math.round(v.left / 60e3) + " min left");
// use up the rest: the mine rests 6 hours from that moment
r = await call(w1, "world-mine-enter"); const run3 = r.body;
const tEnd = T + run3.left; while (T < tEnd + 20e3) { T += 15e3; r = await call(w1, "world-mine-beat", { runId: run3.runId }); if (r.status !== 200) break; }
check(r.status === 409 && r.body.coolUntil > 0, "the hour runs out: the visit ends");
check(Math.abs(r.body.coolUntil - (tEnd + MINE.COOL_MS)) < 16e3, "the rest is 6 hours from the moment the hour ran out");
r = await call(w1, "world-mine-enter"); check(r.status === 409 && r.body.coolUntil > T, "resting: no way in");
T = r.body.coolUntil + 1000; r = await call(w1, "world-mine-enter"); check(r.status === 200 && r.body.left === MINE.SESSION_MS, "after the rest: the full hour is back");
await call(w1, "world-mine-leave", { runId: r.body.runId });

// ---- an hour of steady mining: the average, and the daily limit ----
async function hour(w) {
  const e = (await call(w, "world-mine-enter")).body; let got = 0, rocks = e.rocks, brk = 0;
  const end = T + MINE.SESSION_MS - 5000; let last = T;
  while (T < end) {
    if (!rocks.length) { T += 5000; const b = await call(w, "world-mine-beat", { runId: e.runId }); if (b.status !== 200) break; rocks = b.body.rocks; continue; }
    const x = rocks[0]; T += Math.ceil(x.h * MINE.SWING_MS) + 2500; // the hits plus a couple of seconds to walk over
    if (T - last > 14e3) { /* a beat now and then, as the page sends */ }
    const b = await call(w, "world-mine-break", { runId: e.runId, rock: x.id }); last = T;
    if (b.status === 200) { got += b.body.found; brk++; rocks = b.body.rocks; } else if (b.status === 409 && b.body.rocks) rocks = b.body.rocks; else break;
  }
  await call(w, "world-mine-leave", { runId: e.runId }).catch(() => {});
  return { got, brk };
}
{ let sum = 0, H = 60, bks = 0; const ws = [];
  for (let i = 0; i < H; i++) { const w = ethers.Wallet.createRandom(); ws.push(w); const h = await hour(w); sum += h.got; bks += h.brk; T += 7 * 3600e3; }
  const avg = sum / H; check(avg > 9500 && avg < 15500, "the Common pickaxe's hour averages about 12,000 ARCL: " + Math.round(avg) + " (" + Math.round(bks / H) + " rocks)"); }
{ const w = ethers.Wallet.createRandom(), a = w.address.toLowerCase(); db.set(`worldMineDay/${a}_` + new Date(T + 9 * 3600e3).toISOString().slice(0, 10), { n: MINE.DAY_CAP - 50 });
  const e = (await call(w, "world-mine-enter")).body; let paid = 0, found = 0;
  for (const x of e.rocks) { T += x.h * MINE.SWING_MS + 100; const b = (await call(w, "world-mine-break", { runId: e.runId, rock: x.id })).body; paid += b.got || 0; found += b.found || 0; }
  check(paid <= 50 && bal(w) === paid, "the mine's own daily limit (" + MINE.DAY_CAP + "): only what's left of it is paid (" + paid + " of " + found + ")");
  check(!db.get(`worldArclDay/${a}_` + new Date(T + 9 * 3600e3).toISOString().slice(0, 10)), "mined ARCL stays outside the shop's daily cap"); }
// ---- a bought pickaxe ----
{ const w = ethers.Wallet.createRandom(), a = w.address.toLowerCase(); db.set(`worldOwn/${a}`, { items: ["pick3"], renames: 0, lots: [] });
  const e = (await call(w, "world-mine-enter")).body; check(e.tier === 3 && e.k === 0.4 && e.rocks.every((x) => x.h <= rockHits(x.t, 3, 1)), "a Legendary pickaxe: tier 3, fewer hits a rock"); }
// ---- the claim route can't pay mine ARCL ----
r = await call(w1, "world-arcl-claim", { kind: "mine" }); check(r.status === 400, "mine ARCL can't be claimed directly");

console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
