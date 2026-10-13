// crew.test.mjs — crews (api/_world-crew.mjs) against an in-memory store. Run: node tests/world/crew.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; db.set(w.inc, d); } else if (w.set) db.set(w.set, w.data); } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Date.parse("2026-10-13T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T });
const who = async () => { const w = ethers.Wallet.createRandom(), issued = new Date(T).toISOString(); return { w: w.address.toLowerCase(), S: { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) } }; };
const a = await who(), b = await who(), c = await who();
let r = await W.handle({ action: "world-crew-create", ...a.S, name: "Arc Rangers", tag: "arc" }); const code = r.body.crew && r.body.crew.code;
check(r.status === 200 && r.body.crew.tag === "ARC" && code && code.length === 6, "a crew founded: tag ARC, a 6-letter code");
r = await W.handle({ action: "world-crew-create", ...b.S, name: "Copy", tag: "ARC" }); check(r.status === 409, "the tag is taken");
r = await W.handle({ action: "world-crew-create", ...b.S, name: "x", tag: "BB" }); check(r.status === 400, "a name too short");
r = await W.handle({ action: "world-crew-join", ...b.S, code: "ZZZZZZ" }); check(r.status === 404, "a wrong code");
r = await W.handle({ action: "world-crew-join", ...b.S, code: code.toLowerCase() }); check(r.status === 200 && r.body.crew.members.length === 2, "joined with the code");
r = await W.read(new URL("http://x/?world=crew&wallet=" + b.w)); check(r.body.crew && r.body.crew.name === "Arc Rangers" && !r.body.crew.code, "anyone can see the crew, but not its code");
r = await W.handle({ action: "world-crew-me", ...b.S }); check(r.body.crew.code === code, "a member sees the code (signed)");
r = await W.handle({ action: "world-crew-kick", ...b.S, wallet: a.w }); check(r.status === 403, "only the captain kicks");
r = await W.handle({ action: "world-crew-code", ...a.S }); check(r.status === 200 && r.body.crew.code !== code, "a new code");
r = await W.handle({ action: "world-crew-join", ...c.S, code }); check(r.status === 404, "the old code stops working");
r = await W.handle({ action: "world-crew-leave", ...a.S }); check(r.status === 200, "the captain leaves");
r = await W.read(new URL("http://x/?world=crew&wallet=" + b.w)); check(r.body.crew.owner === b.w, "the crew passes to the next member");
r = await W.handle({ action: "world-crew-leave", ...b.S }); r = await W.read(new URL("http://x/?world=crew&wallet=" + b.w)); check(r.body.crew === null, "the last one out closes it");
console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
