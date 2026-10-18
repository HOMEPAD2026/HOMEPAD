// launch.test.mjs — the official launch (api/_world-launch.mjs): the gift (an Advanced dinosaur egg, five 3× EXP potions,
// 5,000 ARCL) once an account in the launch week, for an account that played before the launch or has reached level 5;
// a potion: 3× EXP for an hour, the hours adding up, the server's XP allowance rising with it. On an in-memory store.
// Run: node tests/world/launch.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { LAUNCH, launchEnd } = await import("../../api/_world-launch.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.set) db.set(w.set, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, v] of Object.entries(w.fields)) d[k] = (d[k] || 0) + v; db.set(w.inc, d); } else if (w.del) db.delete(w.del); } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = LAUNCH.start - 2 * 3600e3;
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, phase: { phase: "live", epoch: 2 } });
const sig = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)), ep: 2 }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sig(w)), ...extra });
const A = (w) => w.address.toLowerCase(), view = async (w) => (await W.read(new URL("http://x/?world=launch&wallet=" + A(w)))).body;
const old = ethers.Wallet.createRandom(), fresh = ethers.Wallet.createRandom(), grown = ethers.Wallet.createRandom();
// before the launch: a player saves (level 2); the gift isn't open yet
db.set(`worldSave_e2/${A(old)}`, { xp: 120, xpv: 2, name: "old", at: T - 3600e3 });
let r = await call(old, "world-launch-claim"); check(r.status === 409 && r.body.start === LAUNCH.start, "before the launch: the gift isn't open yet");
// the launch: the old player's first save marks them as playing before it
T = LAUNCH.start + 3600e3;
r = await W.handle({ action: "world-save", ...(await sig(old)), data: { xp: 130, xpv: 2, name: "old" } });
check(!!db.get(`worldLaunchPre_e2/${A(old)}`), "a save after the launch whose last one was before it: marked as playing before the launch");
let v = await view(old); check(v.open && v.eligible && v.pre && !v.claimed && v.gift.arcl === 5000 && v.gift.potions === 5, "the old player may take the gift, whatever their level");
r = await call(old, "world-launch-claim"); check(r.status === 200 && r.body.arcl === 5000 && r.body.potions === 5 && r.body.egg === "advanced", "the gift: 5,000 ARCL, five potions, an Advanced egg");
check((db.get(`worldArclBal_e2/${A(old)}`) || {}).bal === 5000, "the ARCL is in the balance (outside the day's cap)");
const D = db.get(`worldDino_e2/${A(old)}`); check(D && D.eggs.some((e) => e.id === "launch_" + A(old) && e.rar === "advanced"), "the egg is in the Hatchery, Advanced");
r = await call(old, "world-launch-claim"); check(r.status === 409, "the gift once only");
// a new player: level 1 can't, level 5 can
db.set(`worldSave_e2/${A(fresh)}`, { xp: 0, xpv: 2, name: "new", at: T });
r = await call(fresh, "world-launch-claim"); check(r.status === 403 && r.body.need === 5, "a brand-new account at level 1: reach level 5 first");
const { xpAt } = await import("../../api/_world-social.mjs");
db.set(`worldSave_e2/${A(grown)}`, { xp: xpAt(5), xpv: 2, name: "grown", at: T });
r = await call(grown, "world-launch-claim"); check(r.status === 200, "a new account at level 5: the gift");
// a potion: 3× for an hour, the hours adding up
r = await call(old, "world-xp-potion"); check(r.status === 200 && r.body.n === 4 && Math.abs(r.body.until - (T + 3600e3)) < 1000, "a potion: 3× EXP for an hour, four left");
r = await call(old, "world-xp-potion"); check(r.status === 200 && r.body.n === 3 && Math.abs(r.body.until - (T + 7200e3)) < 1000, "a second one adds an hour");
// the XP allowance: with a potion running, a save may add about three times as much
{ const x0 = xpAt(10); db.set(`worldSave_e2/${A(old)}`, { xp: x0, xpv: 2, name: "old", at: T - 600e3, xb: 0 });
  r = await W.handle({ action: "world-save", ...(await sig(old)), data: { xp: x0 + 1e7, xpv: 2, name: "old" } }); const boosted = db.get(`worldSave_e2/${A(old)}`).xp - x0;
  db.set(`worldSave_e2/${A(grown)}`, { xp: x0, xpv: 2, name: "grown", at: T - 600e3, xb: 0 });
  r = await W.handle({ action: "world-save", ...(await sig(grown)), data: { xp: x0 + 1e7, xpv: 2, name: "grown" } }); const plain = db.get(`worldSave_e2/${A(grown)}`).xp - x0;
  check(plain > 0 && Math.abs(boosted / plain - 3) < 0.05, `the server's XP allowance: 3× with a potion running (${boosted} vs ${plain})`); }
for (let i = 0; i < 3; i++) await call(old, "world-xp-potion"); r = await call(old, "world-xp-potion"); check(r.status === 400, "no potions left: refused");
// after the launch week
T = launchEnd() + 1000; r = await call(fresh, "world-launch-claim"); check(r.status === 409 && /over/.test(r.body.error), "after the launch week: over");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
