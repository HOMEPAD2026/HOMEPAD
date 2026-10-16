// jump.test.mjs — Coin Jump's crown reward (api/_world-jump.mjs): start, end, once a day, the server's clock, on an
// in-memory store. Run: node tests/world/jump.test.mjs (needs ethers 6)
import fs from "node:fs";
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { JUMP } = await import("../../api/_world-jump.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
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
const bal = (w) => ((db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal) || 0;
check(JUMP.REWARD === 3000, "the crown pays 3,000 ARCL");
const w1 = ethers.Wallet.createRandom();
// a guest can't start a paid run
let r = await W.handle({ action: "world-jump-start" }); check(r.status >= 400, "no signature: no run");
// a crowned run after 30 s pays once
let s = await sign(w1), st = (await W.handle({ action: "world-jump-start", ...s })).body; check(st && st.runId, "a run starts");
T += 30000; s = await sign(w1);
r = await W.handle({ action: "world-jump-end", ...s, runId: st.runId, crowned: true, ms: 29000 });
check(r.status === 200 && r.body.credited === 3000 && bal(w1) === 3000, "the crown pays 3,000: " + JSON.stringify(r.body));
r = await W.handle({ action: "world-jump-end", ...s, runId: st.runId, crowned: true, ms: 29000 }); check(r.status === 409 && bal(w1) === 3000, "the same run can't end twice");
// a second crown the same day: no more
s = await sign(w1); st = (await W.handle({ action: "world-jump-start", ...s })).body; T += 40000; s = await sign(w1);
r = await W.handle({ action: "world-jump-end", ...s, runId: st.runId, crowned: true, ms: 39000 }); check(r.status === 200 && r.body.credited === 0 && r.body.already === true && bal(w1) === 3000, "once a day");
// too fast, or the game's time longer than the server's: refused, nothing paid (and the run is still unended, so no slot used)
const w2 = ethers.Wallet.createRandom();
s = await sign(w2); st = (await W.handle({ action: "world-jump-start", ...s })).body; T += 8000; s = await sign(w2);
r = await W.handle({ action: "world-jump-end", ...s, runId: st.runId, crowned: true, ms: 7000 }); check(r.status === 400 && bal(w2) === 0, "a crown in 8 s is refused");
r = await W.handle({ action: "world-jump-end", ...s, runId: st.runId, crowned: true, ms: 60000 }); check(r.status === 400 && bal(w2) === 0, "the game's clock can't run ahead of the server's");
// a run that ran out of time pays nothing and doesn't use the day's crown
T += 30000; s = await sign(w2); r = await W.handle({ action: "world-jump-end", ...s, runId: st.runId, crowned: false, ms: 37000 }); check(r.status === 200 && r.body.credited === 0 && bal(w2) === 0, "no crown: nothing");
s = await sign(w2); st = (await W.handle({ action: "world-jump-start", ...s })).body; T += 25000; s = await sign(w2);
r = await W.handle({ action: "world-jump-end", ...s, runId: st.runId, crowned: true, ms: 24000 }); check(r.body.credited === 3000 && bal(w2) === 3000, "then a crown still pays");
// a stale or someone else's run id
s = await sign(w2); r = await W.handle({ action: "world-jump-end", ...s, runId: "nope", crowned: true, ms: 1000 }); check(r.status === 409, "an unknown run is refused");
// the next day pays again
T += 24 * 3600e3; s = await sign(w1); st = (await W.handle({ action: "world-jump-start", ...s })).body; T += 30000; s = await sign(w1);
r = await W.handle({ action: "world-jump-end", ...s, runId: st.runId, crowned: true, ms: 29000 }); check(r.body.credited === 3000 && bal(w1) === 6000, "the next day pays again");
// it can't be claimed by hand
s = await sign(w1); r = await W.handle({ action: "world-arcl-claim", ...s, kind: "jump" }); check(r.status === 400 && bal(w1) === 6000, "the jump reward can't be claimed directly");
// the game's wiring
const jr = fs.readFileSync(new URL("../../world-jumprace.js", import.meta.url), "utf8");
check(/world-jump-start/.test(jr) && /world-jump-end/.test(jr), "the game calls start and end");
console.log(ok, "pass", bad, "fail");
process.exit(bad ? 1 : 0);
