// refer.test.mjs — invite a friend (api/_world-refer.mjs): a code, a new friend tied to it once, both paid (1,000 ARCL
// and a dinosaur egg each) by the save that gets the friend to level 5, once; the guards (own code, old accounts, an
// inviter under level 5, inviting back, the inviter's daily limit). On an in-memory store.
// Run: node tests/world/refer.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { REFER, codeFor } = await import("../../api/_world-refer.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { xpAt } = await import("../../api/_world-social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.set) db.set(w.set, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, v] of Object.entries(w.fields)) d[k] = (d[k] || 0) + v; db.set(w.inc, d); } else if (w.del) db.delete(w.del); } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Date.parse("2026-10-20T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, phase: { phase: "live", epoch: 2 } });
const sig = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)), ep: 2 }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sig(w)), ...extra });
const A = (w) => w.address.toLowerCase(), view = async (w) => (await W.read(new URL("http://x/?world=refer&wallet=" + A(w)))).body;
const bal = (w) => (db.get(`worldArclBal_e2/${A(w)}`) || {}).bal || 0, eggs = (w) => ((db.get(`worldDino_e2/${A(w)}`) || {}).eggs || []);
const setLv = (w, lv, name) => db.set(`worldSave_e2/${A(w)}`, { xp: xpAt(lv), xpv: 2, name, at: T - 600e3, xb: 1e9 });
const host = ethers.Wallet.createRandom(), low = ethers.Wallet.createRandom(), f1 = ethers.Wallet.createRandom(), old = ethers.Wallet.createRandom();
check(codeFor("0xabc") === codeFor("0xabc") && /^[0-9a-z]{8}$/.test(codeFor("0xabc")) && codeFor("0xabc") !== codeFor("0xabd"), "a code: 8 letters, the same for a wallet, different between wallets");
setLv(host, 12, "host"); setLv(low, 2, "low");
let r = await call(host, "world-refer-code"); check(r.status === 200 && /^[0-9a-z]{8}$/.test(r.body.code), "the inviter's code"); const code = r.body.code;
r = await call(host, "world-refer-code"); check(r.body.code === code, "asking again: the same code");
r = await call(host, "world-refer-bind", { code }); check(r.status === 400, "your own code: refused");
r = await call(f1, "world-refer-bind", { code: "zzzzzzzz" }); check(r.status === 404, "an unknown code: refused");
// an inviter under level 5 can't bring friends
const lowCode = (await call(low, "world-refer-code")).body.code;
r = await call(f1, "world-refer-bind", { code: lowCode }); check(r.status === 403, "an inviter under level 5: refused");
// an old account can't join an invite
setLv(old, 20, "old"); r = await call(old, "world-refer-bind", { code }); check(r.status === 403, "an account past level 3: refused");
// a new friend joins
r = await call(f1, "world-refer-bind", { code }); check(r.status === 200 && r.body.name === "host", "a new player joins the invite");
r = await call(f1, "world-refer-bind", { code: lowCode }); check(r.status === 409, "an invite once only");
const f1Code = (await call(f1, "world-refer-code")).body.code; setLv(host, 12, "host");
// inviting back the one who invited you: host joining f1's invite (host is past level 3 anyway; check the guard with a new pair below)
let v = await view(host); check(v.kids.length === 1 && !v.kids[0].paid && v.code === code, "the inviter sees the friend, not yet paid");
// the friend plays to level 5: that save pays both
db.set(`worldSave_e2/${A(f1)}`, { xp: xpAt(4), xpv: 2, name: "f1", at: T - 3600e3 * 5, xb: 1e9 });
const b0 = bal(host);
r = await W.handle({ action: "world-save", ...(await sig(f1)), data: { xp: xpAt(5) + 10, xpv: 2, name: "f1" } });
check(r.status === 200 && r.body.refer && r.body.refer.arcl === REFER.arcl && r.body.refer.inviter, "the save reaching level 5: the invite's reward");
check(bal(f1) === REFER.arcl && bal(host) - b0 === REFER.arcl, "both got 1,000 ARCL");
check(eggs(f1).length === 1 && eggs(host).length === 1 && eggs(f1)[0].id !== eggs(host)[0].id, "both got an egg (different eggs)");
T += 10e3; r = await W.handle({ action: "world-save", ...(await sig(f1)), data: { xp: xpAt(5) + 40, xpv: 2, name: "f1" } });
check(!r.body.refer && bal(f1) === REFER.arcl, "once only");
r = await call(host, "world-refer-claim"); check(r.status === 200 && r.body.paid.length === 0 && bal(host) - b0 === REFER.arcl, "a claim after: nothing more");
v = await view(host); check(v.paid === 1 && v.kids[0].paid, "the inviter's list: paid");
v = await view(f1); check(v.by && v.by.name === "host" && v.paidMe, "the friend's view: who invited them, paid");
// inviting back: a new pair where the friend invites back
const a = ethers.Wallet.createRandom(), b = ethers.Wallet.createRandom(); setLv(a, 6, "a"); setLv(b, 1, "b");
const aCode = (await call(a, "world-refer-code")).body.code; await call(b, "world-refer-bind", { code: aCode });
setLv(b, 6, "b"); db.set(`worldSave_e2/${A(a)}`, { xp: xpAt(2), xpv: 2, name: "a", at: T, xb: 1e9 });
const bCode = (await call(b, "world-refer-code")).body.code; r = await call(a, "world-refer-bind", { code: bCode }); check(r.status === 400, "inviting back the one who invited you: refused");
// the inviter's daily limit: past it, the friend still gets theirs
const many = []; for (let i = 0; i < REFER.day + 1; i++) { const f = ethers.Wallet.createRandom(); setLv(f, 1, "m" + i); await call(f, "world-refer-bind", { code }); many.push(f); }
const b1 = bal(host);
for (const f of many) { db.set(`worldSave_e2/${A(f)}`, { xp: xpAt(4), xpv: 2, name: "m", at: T - 3600e3 * 5, xb: 1e9 }); T += 9e3; await W.handle({ action: "world-save", ...(await sig(f)), data: { xp: xpAt(5) + 10, xpv: 2, name: "m" } }); }
check(bal(host) - b1 === REFER.arcl * (REFER.day - 1), `the inviter: paid for ${REFER.day} friends a day at most (f1 earlier today +  (${(bal(host) - b1) / REFER.arcl})`);
check(many.every((f) => bal(f) === REFER.arcl), "every friend got theirs");
// the retry: a friend at level 5 whose save didn't pay (bound after reaching it can't happen; simulate a lost payment)
const c = ethers.Wallet.createRandom(); setLv(c, 1, "c"); await call(c, "world-refer-bind", { code }); setLv(c, 5, "c");
T += 864e5; r = await call(host, "world-refer-claim"); check(r.status === 200 && r.body.paid.some((p) => p.w === A(c)) && bal(c) === REFER.arcl, "the inviter's claim pays a friend whose save didn't (the next day: within the limit)");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
