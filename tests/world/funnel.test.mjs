// funnel.test.mjs — b-st3: the first minutes counted in diag (world-diag.js funnel → api/_world.mjs diag "funnel"): each
// step a count by device, new browsers apart; an unknown step is refused; ?world=diag shows them by day.
// Run: node tests/world/funnel.test.mjs
const { make } = await import("../../api/_world.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, v] of Object.entries(w.fields)) d[k] = (d[k] || 0) + v; db.set(w.inc, d); } else if (w.set) db.set(w.set, w.data); } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
const T = Date.parse("2026-10-23T03:00:00Z");
const W = make({ ...store, recover: async () => null, issuedOk: () => true, json, now: () => T });
const send = (ev, dev, nw) => W.handle({ action: "world-diag", kind: "funnel", ev, dev, nw });
for (const [ev, dev, nw] of [["open", "phone", 1], ["open", "phone", 0], ["ready", "phone", 1], ["maker", "pc", 1], ["named", "pc", 1], ["back", "phone", 0]]) await send(ev, dev, nw);
const bad1 = await send("hack", "phone", 1);
check(bad1.status === 400, "an unknown step: refused");
const v = (await W.read(new URL("http://x/?world=diag"))).body, f = v.funnel && v.funnel[0];
check(!!f, "?world=diag has the funnel by day");
check(f && f.open.ph === 2 && f.open.phNew === 1, "open: 2 on phones, 1 of them new");
check(f && f.ready.ph === 1 && f.maker.pc === 1 && f.named.pcNew === 1, "ready, maker, named counted by device");
check(f && f.back.ph === 1 && f.back.phNew === 0, "back on another day: counted, not new");
check(f && f.game.ph === 0 && f.game.pc === 0, "steps nobody reached read 0");
console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
