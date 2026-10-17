// surv.test.mjs — SURVIVORS ARENA (api/_world-survivors.mjs): a run checked on the server's clock, the reward computed
// there (never the client's), boss and 12-minute bonuses only for a run that reached 12:00, three paid runs a day, the
// game's own daily ARCL cap, an end counted once; and the server's copy of the rules matches world-survivors-data.js.
// On an in-memory store. Run: node tests/world/surv.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { SURV, survReward } = await import("../../api/_world-survivors.mjs");
const D = await import("../../world-survivors-data.js");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-10-14T03:00:00Z"), n = 0; // a Wednesday (no weekend 2×)
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, randomId: () => "run" + (++n) + "x" });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const p1 = ethers.Wallet.createRandom(), p2 = ethers.Wallet.createRandom();

// the rules agree
check(JSON.stringify([SURV.RUN_S, SURV.BOSS_AT, SURV.DAY_RUNS, SURV.DAY_ARCL, SURV.MAX_KPS]) === JSON.stringify([D.RULES.RUN_S, D.RULES.BOSS_AT, D.RULES.DAY_RUNS, D.RULES.DAY_ARCL, D.RULES.MAX_KPS]), "the server's rules match the game's");
check(Object.keys(SURV.DIFF).every((k) => SURV.DIFF[k].k === D.RULES.DIFF[k].k && SURV.DIFF[k].cap === D.RULES.DIFF[k].cap), "the difficulties match");
let same = true; for (const secs of [0, 59, 61, 300, 719, 720, 800]) for (const kills of [0, 9, 95, 400, 4000]) for (const bosses of [0, 2, 4]) for (const diff of ["easy", "normal", "hard"]) for (const clear of [false, true]) if (survReward({ secs, kills, bosses, diff, clear }) !== D.reward({ secs, kills, bosses, diff, clear })) same = false;
check(same, "the server's reward is the game's reward");
check(D.reward({ secs: 720, kills: 3000, bosses: 4, diff: "normal", clear: true }) === 3000 && D.reward({ secs: 720, kills: 3000, bosses: 4, diff: "hard", clear: true }) === 5000 && D.reward({ secs: 720, kills: 3000, bosses: 4, diff: "easy", clear: true }) === 2100, "a full run: 3,000 · 5,000 · 2,100 (the caps)");
check(D.reward({ secs: 300, kills: 200, bosses: 1, diff: "normal", clear: false }) === 500 + 400, "a fall at 5:00: minutes and knock-outs, no boss bonus");

// a run
let r = await call(p1, "world-surv-start", { diff: "normal" }); const run1 = r.body; check(r.status === 200 && run1.runId && run1.diff === "normal", "a run starts");
T += 30e3; r = await call(p1, "world-surv-end", { runId: run1.runId, secs: 300, kills: 100, bosses: 0, ms: 300e3 }); check(r.status === 400, "longer than it has been going: refused");
T += 300e3; r = await call(p1, "world-surv-end", { runId: run1.runId, secs: 320, kills: 5000, bosses: 1, ms: 320e3 }); check(r.status === 400, "more knock-outs than could come: refused");
r = await call(p1, "world-surv-end", { runId: run1.runId, secs: 320, kills: 300, bosses: 2, ms: 320e3 }); check(r.status === 400, "a boss before its time: refused");
r = await call(p1, "world-surv-end", { runId: run1.runId, secs: 320, kills: 300, bosses: 1, clear: true, ms: 320e3 });
check(r.status === 200 && r.body.credited === 500 + 600 && r.body.runsLeft === 2 && bal(p1) === 1100, "5:20 with 300 knock-outs: 1,100 ARCL (the 'clear' claim ignored before 12:00), 2 paid runs left");
r = await call(p1, "world-surv-end", { runId: run1.runId, secs: 320, kills: 300, bosses: 1, ms: 320e3 }); check(r.status === 409, "an end counts once");
// a full hard run
r = await call(p1, "world-surv-start", { diff: "hard" }); const run2 = r.body; T += 760e3;
r = await call(p1, "world-surv-end", { runId: run2.runId, secs: 750, kills: 2600, bosses: 4, clear: true, ms: 750e3 });
check(r.status === 200 && r.body.credited === 5000 && bal(p1) === 6100, "a hard run to the Titan: 5,000 ARCL");
// the third pays up to the day's 10,000
r = await call(p1, "world-surv-start", { diff: "hard" }); const run3 = r.body; T += 760e3;
r = await call(p1, "world-surv-end", { runId: run3.runId, secs: 750, kills: 2600, bosses: 4, clear: true, ms: 750e3 });
check(r.status === 200 && r.body.credited === 3900 && bal(p1) === 10000 && r.body.runsLeft === 0, "the third: only up to the day's 10,000");
r = await call(p1, "world-surv-start", { diff: "normal" }); const run4 = r.body; T += 400e3;
r = await call(p1, "world-surv-end", { runId: run4.runId, secs: 390, kills: 300, bosses: 2, ms: 390e3 });
check(r.status === 200 && r.body.credited === 0 && r.body.why === "runs", "a fourth run: no ARCL (three paid runs a day)");
// a replaced run can't end
r = await call(p2, "world-surv-start", {}); const a = r.body; r = await call(p2, "world-surv-start", {}); T += 200e3;
r = await call(p2, "world-surv-end", { runId: a.runId, secs: 190, kills: 50, bosses: 1, ms: 190e3 }); check(r.status === 409, "a replaced run can't end");
r = await call(p2, "world-surv-end", { runId: r.body && r.body.runId || "run" + n + "x", secs: 190, kills: 50, bosses: 1, ms: 190e3 }); check(r.status === 200 && r.body.credited === 300 + 100, "the newer one pays (3 minutes, 50 knock-outs)");
// the next Seoul day: three paid runs again
T += 24 * 3600e3; r = await call(p1, "world-surv-start", { diff: "easy" }); const run5 = r.body; T += 130e3;
r = await call(p1, "world-surv-end", { runId: run5.runId, secs: 125, kills: 40, bosses: 0, ms: 125e3 }); check(r.status === 200 && r.body.credited === Math.floor((200 + 80) * 0.7), "a new day pays again (easy ×0.7)");
const v = await W.read(new URL("http://x/api/social?world=surv&wallet=" + p1.address.toLowerCase()));
check(v && v.status === 200 && v.body.runsLeft === 2 && v.body.today === 196, "the day's view: 2 paid runs left, 196 ARCL today");
const top = await W.read(new URL("http://x/api/social?world=surv-top"));
check(top && top.status === 200 && top.body.top.length === 2 && top.body.top[0].secs === 750 && !("id" in top.body.top[0]), "the week's board: the longest run first, wallets shortened");
// the claim route refuses this kind
r = await call(p1, "world-arcl-claim", { kind: "surv" }); check(r.status === 400, "Survivors ARCL can't be claimed");
console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
