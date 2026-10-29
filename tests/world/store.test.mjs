// store.test.mjs — the Studio's asset store (world-store-data.js, api/_world-store.mjs): 15 models, one free and two premium in
// each of five kinds; a premium buy is the player's own $ARCIRCLE transfer to FeeBurn, read back from the receipt (each tx
// once); downloads only for free or owned ones; a course can't be saved with a premium asset its maker hasn't bought.
// On an in-memory store. Run: node tests/world/store.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { STORE } = await import("../../world-store-data.js");
const { FEE_BURN, ARCIRCLE } = await import("../../api/_world-shop.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-10-29T12:00:00Z"); const RC = {};
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, rand: () => 0.5, receipt: async (h) => RC[h] || null });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), a = A.address.toLowerCase();
const pad = (x) => "0x" + String(x).replace(/^0x/, "").toLowerCase().padStart(64, "0"), TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const xfer = (from, to, n) => ({ address: ARCIRCLE, topics: [TR, pad(from), pad(to)], data: "0x" + (BigInt(n) * 10n ** 18n).toString(16) });

check(STORE.ITEMS.length === 15 && STORE.CATS.length === 5, "15 models in five kinds");
check(STORE.CATS.every(([c]) => STORE.ITEMS.filter((i) => i.cat === c).length === 3 && STORE.ITEMS.filter((i) => i.cat === c && i.free).length === 1), "each kind: one free, two premium");
check(STORE.PRICE === 30000 && STORE.BURN_PCT === 50, "premium 30,000 $ARCIRCLE, half burned");
check(STORE.ITEMS.every((i) => /^[a-z0-9]{6,40}$/.test(i.id)), "every id fits a course's asset list");
let r = (await W.read(new URL("https://x/api/social?world=studio-store&wallet=" + A.address))).body;
check(r.items.length === 15 && r.pay.to === FEE_BURN && BigInt(r.pay.amount) === 30000n * 10n ** 18n && !r.owned.length, "the store: items, the payment to FeeBurn, nothing owned yet");
const free = STORE.ITEMS.find((i) => i.free), prem = STORE.ITEMS.find((i) => !i.free), prem2 = STORE.ITEMS.filter((i) => !i.free)[1];
r = await call(A, "world-studio-store-dl", { id: free.id }); check(r.status === 200 && /models\/studio\/store\//.test(r.body.url), "a free model downloads");
r = await call(A, "world-studio-store-dl", { id: prem.id }); check(r.status === 403, "a premium one doesn't before it's bought");
r = await call(A, "world-studio-store-buy", { id: free.id, tx: "0x" + "1".repeat(64) }); check(r.status === 400, "a free one isn't sold");
const t0 = "0x" + "a1".repeat(32); r = await call(A, "world-studio-store-buy", { id: prem.id, tx: t0 }); check(r.status === 202, "a tx not confirmed yet: wait");
RC[t0] = { status: "0x1", logs: [xfer(a, FEE_BURN, 29999)] }; r = await call(A, "world-studio-store-buy", { id: prem.id, tx: t0 }); check(r.status === 400, "less than the price: refused");
const t1 = "0x" + "b2".repeat(32); RC[t1] = { status: "0x1", logs: [xfer(B.address, FEE_BURN, 30000)] }; r = await call(A, "world-studio-store-buy", { id: prem.id, tx: t1 }); check(r.status === 400, "someone else's transfer: refused");
const t2 = "0x" + "c3".repeat(32); RC[t2] = { status: "0x1", logs: [xfer(a, FEE_BURN, 30000)] }; r = await call(A, "world-studio-store-buy", { id: prem.id, tx: t2 });
check(r.status === 200 && r.body.owned.includes(prem.id) && db.get(`worldStats/store`).sold === 1 && db.get(`worldStats/store`).burned === 15000, "30,000 to FeeBurn: it's yours, half counted as burned");
r = await call(A, "world-studio-store-buy", { id: prem2.id, tx: t2 }); check(r.status === 409, "one transaction buys one asset");
r = await call(A, "world-studio-store-dl", { id: prem.id }); check(r.status === 200, "owned: it downloads");
r = await call(B, "world-studio-store-dl", { id: prem.id }); check(r.status === 403, "…for its buyer only");
// a course that uses a premium asset: only its buyer can save it
const { genObbyBuild } = await import("../../world-studio-gen.js"); const base = { tpl: "obby", theme: "neon", title: "Shop test", speed: 3, len: 60, coins: 3, walls: 2, gaps: 1, lasers: 1, seed: 7 }, bld = genObbyBuild(base, { md: "obby" });
const spec = { ...base, build: { ...bld, as: [prem.id] } };
r = await call(B, "world-studio-save", { spec }); check(r.status === 403 && r.body.miss && r.body.miss[0] === prem.id, "a course with a premium asset you haven't bought can't be saved");
r = await call(A, "world-studio-save", { spec }); check(r.status === 200, "its buyer saves it");
r = await call(B, "world-studio-save", { spec: { ...spec, build: { ...bld, as: [free.id] } } }); check(r.status === 200, "a free asset: anyone");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
