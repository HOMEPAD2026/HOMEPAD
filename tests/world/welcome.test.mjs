// welcome.test.mjs — the welcome week (api/_world-welcome.mjs): seven gifts, one a Seoul day, for players below Lv 20
// at their first claim, paid once each (potions and scrap back to the game, ARCL to the balance, an egg, the pickaxe trial).
// On an in-memory store. Run: node tests/world/welcome.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { WELCOME } = await import("../../api/_world-welcome.mjs");
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
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const bal = (w) => ((db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal) || 0;
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const view = async (w) => (await W.read(new URL("http://x/api/social?world=welcome&wallet=" + w.address.toLowerCase()))).body;
const DAY = 864e5;

check(WELCOME.GIFTS.length === 7 && WELCOME.GIFTS.filter((g) => g.kind === "arcl").reduce((a, g) => a + g.n, 0) === 3000, "seven gifts, 3,000 ARCL in all");
const w1 = ethers.Wallet.createRandom(), a1 = w1.address.toLowerCase();
let v = await view(w1); check(v.eligible && v.ready && v.n === 0, "a new wallet: eligible, day 1 ready");
let r = await W.handle({ action: "world-welcome-claim" }); check(r.status >= 400, "no signature: no gift");
r = await call(w1, "world-welcome-claim"); check(r.status === 200 && r.body.day === 1 && r.body.supply && r.body.supply.kind === "hp" && r.body.supply.n === 20, "day 1: 20 potions back to the game");
r = await call(w1, "world-welcome-claim"); check(r.status === 409, "twice the same day: refused");
v = await view(w1); check(v.eligible && !v.ready && v.n === 1, "after day 1: nothing more today");
T += DAY; r = await call(w1, "world-welcome-claim"); check(r.status === 200 && r.body.day === 2 && r.body.arcl === 500 && bal(w1) === 500, "day 2: 500 ARCL to the balance");
T += 3 * DAY; r = await call(w1, "world-welcome-claim"); check(r.status === 200 && r.body.day === 3 && r.body.egg === true, "days off don't break it; day 3: a pet egg");
const own = db.get(`worldOwn/${a1}`); check(!!own, "the egg is in worldOwn");
T += DAY; r = await call(w1, "world-welcome-claim"); check(r.body.arcl === 1000 && bal(w1) === 1500, "day 4: 1,000 ARCL");
T += DAY; r = await call(w1, "world-welcome-claim"); check(r.body.supply && r.body.supply.kind === "scrap" && r.body.supply.n === 50, "day 5: 50 scrap");
T += DAY; r = await call(w1, "world-welcome-claim"); check(r.body.arcl === 1500 && bal(w1) === 3000, "day 6: 1,500 ARCL");
T += DAY; r = await call(w1, "world-welcome-claim"); check(r.body.day === 7 && r.body.trialUntil > T + 6 * DAY, "day 7: the Advanced Pickaxe for 7 days");
const m = (await W.read(new URL("http://x/api/social?world=mine&wallet=" + a1))).body; check(m.tier >= 1, "the mine sees the trial pickaxe: tier " + m.tier);
T += DAY; r = await call(w1, "world-welcome-claim"); check(r.status === 403, "after seven: over");
v = await view(w1); check(!v.eligible, "after seven: not shown");
// the 14-day window
const w2 = ethers.Wallet.createRandom();
r = await call(w2, "world-welcome-claim"); check(r.status === 200, "w2 day 1");
T += 15 * DAY; r = await call(w2, "world-welcome-claim"); check(r.status === 403, "past 14 days from the first gift: over");
// an old hand
const w3 = ethers.Wallet.createRandom(); db.set(`worldSave/${w3.address.toLowerCase()}`, { xp: 5000 });
v = await view(w3); check(!v.eligible, "Lv 20+ at the first claim: not eligible");
r = await call(w3, "world-welcome-claim"); check(r.status === 403 && bal(w3) === 0, "and refused");
// the shop's own claim can't pay it
r = await call(w1, "world-arcl-claim", { kind: "welcome" }); check(r.status === 400, "the shop's claim refuses kind welcome");
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
