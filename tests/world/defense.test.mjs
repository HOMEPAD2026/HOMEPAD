// defense.test.mjs — AC Defense: the pure rules (world-defense-data.js: waves out of a seed, scrap, plausibility, ARCL), the
// server's copy of them, and its endpoints (start, end, the weekly board) on an in-memory store.
// Run: node tests/world/defense.test.mjs (needs ethers 6)
import fs from "node:fs";
import { ethers } from "ethers";
const D = await import("../../world-defense-data.js");
const S0 = await import("../../api/_world-defense.mjs");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

// ---- the rules ----
const seeds = [0, 1, 7, 12345, 0xdeadbeef, 4294967295, 99999999];
check(JSON.stringify(D.waveOf(777, 4)) === JSON.stringify(D.waveOf(777, 4)), "the same seed and wave: the same scammers");
check(JSON.stringify(D.waveOf(777, 4)) !== JSON.stringify(D.waveOf(778, 4)), "another seed: another wave");
check(seeds.every((s) => [1, 2, 3, 4, 5, 9, 10, 25, 60].every((w) => D.waveOf(s, w).list.length === D.waveCount(s, w) && D.waveOf(s, w).n === D.waveCount(s, w))), "a wave lists exactly waveCount scammers");
check(seeds.every((s) => [1, 2, 3, 4, 6, 7].every((w) => !D.waveOf(s, w).boss && D.waveOf(s, w).list.every((x) => !x.boss))), "no boss on waves that aren't every 5th");
check(seeds.every((s) => [5, 10, 15].every((w) => D.waveOf(s, w).boss && D.waveOf(s, w).list.filter((x) => x.boss).length === 1)), "a boss, once, on every 5th wave");
check(seeds.every((s) => { let c = 0; for (let w = 1; w <= 40; w++) c += D.waveCount(s, w); return c === D.spawnedThrough(s, 40); }), "spawnedThrough adds up the waves");
check([3, 9, 20].every((w) => D.waveOf(5, w + 1).hp > D.waveOf(5, w).hp && D.waveOf(5, w + 1).spd >= D.waveOf(5, w).spd), "HP and speed grow by wave");
check(D.waveOf(5, 200).spd <= 0.9 && D.waveOf(1, 1).list.every((x) => x.g >= 0 && x.g < 4 && x.at >= 0), "speed is capped; gates are 0–3");
check(D.waveOf(5, 30).list.every((x, i, a) => !i || a[i - 1].at <= x.at) && D.waveOf(5, 30).list[D.waveOf(5, 30).list.length - 1].at < 40, "the scammers come in order within about 40 s");
check([1, 2, 3, 4, 5, 6, 7].every((i) => D.TOWER_IDS.length === 4) && D.MAX_TOWERS === 8 && D.ARENA.pads === 8, "four towers, eight pads, at most eight towers");
for (const id of D.TOWER_IDS) check(D.refund(id, 1) === Math.floor(D.TOWERS[id].cost / 2) && D.refund(id, 3) === Math.floor(D.paid(id, 3) / 2) && D.upCost(id, 3) === 0 && D.upCost(id, 1) > 0, `${id}: half back on a sale (all upgrades counted), no upgrade past 3`);
check(D.TOWER_IDS.every((id) => D.TOWERS[id].cost > 0 && D.START_SCRAP >= D.TOWERS.shock.cost + D.TOWERS.flame.cost), "scrap pays for towers, and the start covers two");
check([0, 1, 2, 3].every((i) => Math.hypot(D.gateAt(i).x, D.gateAt(i).z) > D.ARENA.padR) && D.padAt(1).x > 0 && Math.abs(Math.hypot(D.padAt(3).x, D.padAt(3).z) - D.ARENA.padR) < 1e-9, "gates sit outside the pad ring");
// reward math
check(D.arclFor(1) === 5 && D.arclFor(10) === 50 && D.arclFor(40) === 150 && D.arclFor(40, 100) === 50 && D.arclFor(3, 150) === 0 && D.arclFor(-4) === 0, "5 ARCL a wave, 150 a day");
// plausibility
const sd = 4242, need = D.spawnedThrough(sd, 3);
check(D.plausible(sd, { wave: 3, kills: need, ms: 61000 }).ok, "a real 3-wave run passes");
check(!D.plausible(sd, { wave: 3, kills: need, ms: 59000 }).ok, "under 20 s a wave: too fast");
check(!D.plausible(sd, { wave: 3, kills: D.spawnedThrough(sd, 4) + 1, ms: 90000 }).ok, "more knock-outs than scammers sent: refused");
check(!D.plausible(sd, { wave: 3, kills: need - 1, ms: 90000 }).ok, "a cleared wave leaves none standing: refused");
check(D.plausible(sd, { wave: 3, kills: D.spawnedThrough(sd, 4), ms: 90000 }).ok, "kills up to the next wave's count: fine (it ended mid-wave)");
check(!D.plausible(sd, { wave: 1.5, kills: 5, ms: 90000 }).ok && !D.plausible(sd, { wave: -1, kills: 0, ms: 1 }).ok && !D.plausible(sd, { wave: 3, kills: NaN, ms: 90000 }).ok && D.plausible(sd, { wave: 0, kills: 0, ms: 0 }).ok, "bad numbers refused; wave 0 is fine");
// the server's copy agrees with the game's
check(seeds.every((s) => { for (let w = 0; w <= 80; w++) if (S0.waveCount(s, w) !== D.waveCount(s, w) || S0.spawnedThrough(s, w) !== D.spawnedThrough(s, w)) return false; return true; }), "the server's wave sizes match the game's (80 waves, 7 seeds)");
check(S0.DEFENSE.BOSS_EVERY === D.BOSS_EVERY && S0.DEFENSE.MIN_WAVE_S === D.MIN_WAVE_S && S0.DEFENSE.PER_WAVE === D.PER_WAVE && S0.DEFENSE.DAY_ARCL === D.DAY_ARCL && S0.DEFENSE.DAY_RUNS === D.DAY_RUNS, "the server's constants match the game's");
// the game's wiring
const play = fs.readFileSync(new URL("../../world-play.js", import.meta.url), "utf8"), def = fs.readFileSync(new URL("../../world-defense.js", import.meta.url), "utf8");
check(/import\("\.\/world-defense\.js/.test(play) && !/^import .*world-defense\.js/m.test(play), "world-play.js loads world-defense.js lazily (import(), not a static import)");
check(/world-defense-start/.test(def) && /world-defense-end/.test(def) && /world=defense-top/.test(def), "the game calls start, end and the weekly board");

// ---- the server ----
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, n] of Object.entries(x.fields)) d[k] = (d[k] || 0) + n; db.set(x.inc, d); } } return { ok: true }; },
};
const json = (status, b, cache) => ({ status, body: b, cache });
let T = Date.parse("2026-10-14T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
let n = 0; const randomId = () => (0x1000000 + ++n * 7919).toString(16).padStart(8, "0") + "deadbeefcafe0000";
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const w1 = ethers.Wallet.createRandom(), me = w1.address.toLowerCase(), S = await sign(w1);
const bal = () => (db.get(`worldArclBal/${me}`) || {}).bal || 0;
const play1 = async (waves, extra = {}) => {
  const st = (await W.handle({ action: "world-defense-start", ...S })).body, seed = st.seed;
  T += waves * 21000 + 5000;
  return { st, r: await W.handle({ action: "world-defense-end", ...S, runId: st.runId, wave: waves, kills: D.spawnedThrough(seed, waves), ms: waves * 21000, ...extra }) };
};

let r = await W.handle({ action: "world-defense-start", wallet: w1.address, issued: S.issued, signature: "0x" + "00".repeat(65) });
check(r.status >= 400, "start needs the wallet's signature");
r = await W.handle({ action: "world-defense-start", ...S });
check(r.status === 200 && /^[0-9a-f]{8,}$/.test(r.body.runId) && Number.isInteger(r.body.seed) && r.body.startedAt === T, "start returns { runId, seed, startedAt }");
const first = r.body;
r = await W.handle({ action: "world-defense-start", ...S });
check(r.status === 200 && r.body.runId !== first.runId, "a new start replaces the run (one active run)");
r = await W.handle({ action: "world-defense-end", ...S, runId: first.runId, wave: 0, kills: 0, ms: 0 });
check(r.status === 409, "the replaced run can't end");
r = await W.handle({ action: "world-defense-end", ...S, runId: "nope", wave: 0, kills: 0, ms: 0 });
check(r.status === 409, "an unknown run can't end");
const cur = (await W.handle({ action: "world-defense-start", ...S })).body;
T += 30000;
r = await W.handle({ action: "world-defense-end", ...S, runId: cur.runId, wave: 3, kills: D.spawnedThrough(cur.seed, 3), ms: 30000 });
check(r.status === 400 && /too fast/.test(r.body.error) && bal() === 0, "3 waves in 30 s: too fast, nothing paid");
r = await W.handle({ action: "world-defense-end", ...S, runId: cur.runId, wave: 1, kills: D.spawnedThrough(cur.seed, 2) + 1, ms: 30000 });
check(r.status === 400, "more knock-outs than scammers sent: refused");
r = await W.handle({ action: "world-defense-end", ...S, runId: cur.runId, wave: 1, kills: D.spawnedThrough(cur.seed, 1), ms: 999999999 });
check(r.status === 400, "a run longer than it has been going: refused");
r = await W.handle({ action: "world-defense-end", ...S, runId: cur.runId, wave: 1, kills: D.spawnedThrough(cur.seed, 1), ms: 30000 });
check(r.status === 200 && r.body.credited === 5 && bal() === 5 && r.body.runsLeft === 2, "the failed tries left the run open; 1 wave pays 5 ARCL (2 rewarded runs left)");
check((db.get(`worldArcl/${me}`).log || []).some((x) => x.k === "defense" && x.n === 5) && !(db.get(`worldArcl/${me}`).got || []).includes("defense"), "the ledger notes kind \"defense\" (and it isn't a once-only kind)");
r = await W.handle({ action: "world-defense-end", ...S, runId: cur.runId, wave: 1, kills: D.spawnedThrough(cur.seed, 1), ms: 30000 });
check(r.status === 409 && bal() === 5, "ending twice pays once");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "defense" });
check(r.status === 400, "defense can't be claimed through world-arcl-claim");
let p2 = await play1(10);
check(p2.r.status === 200 && p2.r.body.credited === 50 && bal() === 55 && p2.r.body.runsLeft === 1, "10 waves pay 50");
let p3 = await play1(30);
check(p3.r.status === 200 && p3.r.body.credited === 95 && bal() === 150 && p3.r.body.runsLeft === 0, "30 waves would be 150, but the day's 150 ARCL are 55 spent: 95 paid");
let p4 = await play1(6);
check(p4.r.status === 200 && p4.r.body.credited === 0 && p4.r.body.runsLeft === 0 && bal() === 150, "a 4th run in a day: no reward");
check(p4.r.body.best === 30 && p4.r.body.rank === 1, "...but the board still knows the best wave (30, rank 1)");
// the weekly board
r = await W.read(new URL("https://x/api/social?world=defense-top"));
check(r.status === 200 && r.body.top.length === 1 && r.body.top[0].n === 30 && r.body.top[0].kills === D.spawnedThrough(p3.st.seed, 30) && r.body.top[0].id === undefined && /^\d{4}-W\d\d$/.test(r.body.week), "?world=defense-top: this week's best wave, one line a wallet, no full address");
const w2 = ethers.Wallet.createRandom(), S2 = await sign(w2);
const st2 = (await W.handle({ action: "world-defense-start", ...S2 })).body; T += 5 * 21000;
r = await W.handle({ action: "world-defense-end", ...S2, runId: st2.runId, wave: 5, kills: D.spawnedThrough(st2.seed, 6), ms: 5 * 21000 });
check(r.status === 200 && r.body.credited === 25 && r.body.rank === 2, "another wallet: 5 waves, 25 ARCL, rank 2");
r = await W.read(new URL("https://x/api/social?world=defense-top"));
check(r.body.top.map((x) => x.n).join() === "30,5", "the board is sorted by wave");
// a day later: the slots and the daily ARCL come back
T += 24 * 3600e3; const S3 = await sign(w1);
const st3 = (await W.handle({ action: "world-defense-start", ...S3 })).body; T += 3 * 21000;
r = await W.handle({ action: "world-defense-end", ...S3, runId: st3.runId, wave: 3, kills: D.spawnedThrough(st3.seed, 3), ms: 3 * 21000 });
check(r.status === 200 && r.body.credited === 15 && r.body.runsLeft === 2, "the next day: rewards again");
// a run that ends at wave 0
const st0 = (await W.handle({ action: "world-defense-start", ...S3 })).body; T += 10000;
r = await W.handle({ action: "world-defense-end", ...S3, runId: st0.runId, wave: 0, kills: 0, ms: 10000 });
check(r.status === 200 && r.body.credited === 0 && r.body.runsLeft === 2 && r.body.rank === null, "wave 0: no reward, no slot used, no board line");
// the daily cap of the shop's own credit still holds
const cap = 20; const W2 = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId, dayCap: () => cap });
const w5 = ethers.Wallet.createRandom(), S5 = await sign(w5), st5 = (await W2.handle({ action: "world-defense-start", ...S5 })).body; T += 10 * 21000;
r = await W2.handle({ action: "world-defense-end", ...S5, runId: st5.runId, wave: 10, kills: D.spawnedThrough(st5.seed, 10), ms: 10 * 21000 });
check(r.status === 200 && r.body.credited === 20 && r.body.capped === true, "the shop's own daily cap still limits the payout");
// the unknown view / the epoch scope
r = await W.read(new URL("https://x/api/social?world=defense-nope"));
check(r.status === 400, "an unknown view is still refused");
// b447: last week's top three are paid 10,000 / 5,000 / 2,500 once the week is over (each place once)
{
  check(JSON.stringify(S0.PRIZES) === "[10000,5000,2500]", "the weekly prizes are 10,000 / 5,000 / 2,500");
  T += 14 * 864e5; const Wp = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId });
  const ws = [0, 1, 2, 3].map(() => ethers.Wallet.createRandom()), b = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
  for (const [i, w] of ws.entries()) { const Sx = await sign(w), st = (await Wp.handle({ action: "world-defense-start", ...Sx })).body, waves = 4 - i; T += waves * 21000 + 5000; const Se = await sign(w);
    await Wp.handle({ action: "world-defense-end", ...Se, runId: st.runId, wave: waves, kills: D.spawnedThrough(st.seed, waves), ms: waves * 21000 }); }
  const before = ws.map(b);
  T += 7 * 864e5; const Wn = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId });
  let rr = await Wn.read(new URL("https://x/api/social?world=defense-top"));
  const gain = ws.map((w, i) => b(w) - before[i]);
  check(rr.status === 200 && JSON.stringify(gain) === "[10000,5000,2500,0]" && JSON.stringify(rr.body.prizes) === "[10000,5000,2500]", "the week's top three are paid once it's over: " + JSON.stringify(gain));
  const Wn2 = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId }); await Wn2.read(new URL("https://x/api/social?world=defense-top"));
  check(JSON.stringify(ws.map((w, i) => b(w) - before[i])) === "[10000,5000,2500,0]", "a second read (another server) pays nobody twice");
  const Sc = await sign(ws[0]); rr = await Wn.handle({ action: "world-arcl-claim", ...Sc, kind: "defweek" }); check(rr.status === 400, "the weekly prize can't be claimed by hand");
}
const phase = fs.readFileSync(new URL("../../api/_world-phase.mjs", import.meta.url), "utf8");
check(!/worldDef/.test(phase), "no defense collection is kept across epochs: a fresh start empties the board and the run slots");
console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
