// codex.test.mjs — the item codex (api/_world-codex.mjs): kinds marked from saves (only tiers the level allows), kept when
// a later save drops them, the best +N kept, milestones paid once (ARCL in the ledger + a supply or a title), set bonus.
// Run: node tests/world/codex.test.mjs (needs ethers 6)
import { ethers } from "ethers";
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { CODEX, CODEX_ALL, kindsOf, setsOf } = await import("../../api/_world-codex.mjs");
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; db.set(w.inc, d); } } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Date.parse("2026-10-11T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const w = ethers.Wallet.createRandom(), me = w.address.toLowerCase();
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, launchRecord: async () => null, tokenBalance: async () => 0n, arcPrice: async () => 0.002, receipt: async () => null });
const sign = async () => { const iso = new Date(T).toISOString(); return { wallet: w.address, issued: iso, signature: await w.signMessage(loginMessage(w.address, iso)) }; };
let n = 0; const item = (b, r, p = 0, extra = {}) => ({ id: "it" + String(++n).padStart(4, "0"), b, r, lv: 20, p, ...extra });
const save = async (xp, items) => { T += 9000; return W.handle({ action: "world-save", ...(await sign()), data: { xp, xpv: 2, name: "Aria", char: "kk-knight", rpg: { eq: {}, bag: items.slice(0, 24), store: items.slice(24) } } }); }; // (the bag keeps 24, storage the rest)
const read = async () => (await W.read(new URL("https://x/api/social?world=codex&wallet=" + me))).body;
const claim = async (n) => { T += 2000; return W.handle({ action: "world-codex-claim", ...(await sign()), n }); };

check(CODEX_ALL === 175 && CODEX.STEPS.map((s) => s.n).join() === "10,25,50,100,175", "175 kinds, milestones 10/25/50/100/175");
{ const k = kindsOf({ bag: [item("weapon-0", 0, 3), item("weapon-0", 0, 5), item("weapon-4", 4)] }, 10); check(k.out.size === 1 && k.out.get("weapon-0:0") === 5, "a tier beyond the level isn't counted; the best +N kept"); }
// a level-1 save (xp 0) holding tier 0 kinds
let r = await save(0, [item("weapon-0", 0), item("weapon-0", 1, 2), item("armor-0", 3), item("ring-2", 4)]);
let c = await read(); check(r.status === 200 && c.n === 3 && c.marks["weapon-0:1"].p === 2 && !c.marks["ring-2:4"], "marked from a save: 3 kinds (a tier-2 ring needs level 10)");
r = await save(0, []); c = await read(); check(c.n === 3, "a later save without them keeps the marks");
r = await claim(10); check(r.status === 400, "10 kinds not reached yet: no claim");
// 7 slots × tier 0 × 5 grades = 35 kinds (a full column per slot → set bonus for each)
const all0 = []; for (const s of CODEX.SLOTS) for (let g = 0; g < 5; g++) all0.push(item(`${s}-0`, g));
r = await save(0, all0); c = await read(); check(c.n === 35 && c.sets.length === 7 && c.bonus.atkPct === 2 && c.bonus.crit === 0.5 && c.bonus.spd === 1, "35 kinds, every tier-0 column full: the set bonus " + JSON.stringify(c.bonus));
r = await claim(10); const bal1 = (db.get("worldArclBal/" + me) || {}).bal;
check(r.status === 200 && r.body.arcl === 300 && r.body.supply.kind === "hp" && bal1 === 300, "10 kinds: 300 ARCL + potions");
r = await claim(10); check(r.status === 400 && (db.get("worldArclBal/" + me) || {}).bal === 300, "paid once");
r = await claim(25); check(r.status === 200 && r.body.arcl === 800, "25 kinds: 800 ARCL");
r = await claim(50); check(r.status === 400, "50 not reached");
const tx = [...db.entries()].filter(([k, x]) => k.startsWith("worldArclTx/") && x && x.k === "codex"); check(tx.length === 2, "both payouts in the ledger as 'codex'");
// a unique piece
r = await save(0, [item("weapon-0", 2, 0, { u: "jack" })]); c = await read(); check(!!c.uniq.jack, "a one-of-a-kind piece marked apart");
c = (await W.read(new URL("https://x/api/social?world=codex"))).body; check(c.ok && c.n === 0 && c.steps.length === 5, "a guest reads the milestones and an empty codex");
check(setsOf({}).done.length === 0, "no marks, no bonus");
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
