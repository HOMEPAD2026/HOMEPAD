// swap.test.mjs — the Exchange (api/_world-swap.mjs): ARCL held when you ask and given back if you cancel or the team
// turns it down; a $ARCIRCLE transfer checked on Arc and never used twice; only the team settles; one open request.
// On an in-memory store. Run: node tests/world/swap.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { SWAP } = await import("../../api/_world-swap.mjs");
const { GM_WALLETS } = await import("../../api/_world-village.mjs");
const { ARCIRCLE } = await import("../../api/_world-shop.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.del) db.delete(x.del); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, n] of Object.entries(x.fields)) d[k] = (d[k] || 0) + n; db.set(x.inc, d); } } return { ok: true }; },
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-10-17T03:00:00Z"), n = 0;
const RC = new Map(); // tx → receipt
const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, randomId: () => "id" + (++n) + "x", random: Math.random,
  tokenBalance: async () => (5000n * 10n ** 18n).toString(), receipt: async (tx) => RC.get(tx) || null });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const bal = (w) => db.get(`worldArclBal/${w.address.toLowerCase()}`) || {};
const p1 = ethers.Wallet.createRandom(), gm = ethers.Wallet.createRandom(); GM_WALLETS.push(gm.address.toLowerCase());
db.set(`worldArclBal/${p1.address.toLowerCase()}`, { bal: 20000 });

let r = await call(p1, "world-swap-ask", { dir: "arcl2arc", amount: 10 }); check(r.status === 400, "under the least: refused");
r = await call(p1, "world-swap-ask", { dir: "arcl2arc", amount: 50000 }); check(r.status === 400, "more than the balance: refused");
r = await call(p1, "world-swap-ask", { dir: "arcl2arc", amount: 8000 }); const a1 = r.body.request;
check(r.status === 200 && a1.status === "pending" && bal(p1).bal === 12000 && bal(p1).held === 8000, "ARCL → $ARCIRCLE asked: 8,000 ARCL held");
r = await call(p1, "world-swap-ask", { dir: "arcl2arc", amount: 1000 }); check(r.status === 409, "one open request at a time");
r = await call(p1, "world-swap-cancel", { id: a1.id }); check(r.status === 200 && bal(p1).bal === 20000 && bal(p1).held === 0, "cancelled: the ARCL is back");
T += 4000; r = await call(p1, "world-swap-ask", { dir: "arcl2arc", amount: 5000 }); const a2 = r.body.request; check(r.status === 200, "asked again");
r = await call(p1, "world-swap-admin", { op: "list" }); check(r.status === 403, "only the team sees the queue");
r = await call(gm, "world-swap-admin", { op: "list" }); check(r.status === 200 && r.body.list.some((x) => x.id === a2.id && x.w === p1.address.toLowerCase()), "the team sees the request and who asked");
r = await call(gm, "world-swap-admin", { op: "done", id: a2.id, give: 250, gmTx: "0x" + "ab".repeat(32) }); check(r.status === 200 && r.body.request.status === "done" && bal(p1).held === 0 && bal(p1).bal === 15000, "settled: the held ARCL is spent, the $ARCIRCLE sent on Arc is recorded");
r = await call(gm, "world-swap-admin", { op: "done", id: a2.id, give: 250 }); check(r.status === 409, "not settled twice");
// $ARCIRCLE → ARCL: the transfer to the desk is checked
const tx = "0x" + "cd".repeat(32), tx2 = "0x" + "ef".repeat(32);
const log = (from, to, amt) => ({ address: ARCIRCLE, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(from), pad(to)], data: "0x" + (BigInt(amt) * 10n ** 18n).toString(16) });
RC.set(tx, { status: "0x1", logs: [log(p1.address, SWAP.DESK, 3000)] }); RC.set(tx2, { status: "0x1", logs: [log(p1.address, "0x000000000000000000000000000000000000dEaD", 3000)] });
T += 4000; r = await call(p1, "world-swap-ask", { dir: "arc2arcl", amount: 3000, tx: tx2 }); check(r.status === 400, "a transfer that didn't go to the desk: refused");
r = await call(p1, "world-swap-ask", { dir: "arc2arcl", amount: 5000, tx }); check(r.status === 400, "less sent than asked: refused");
r = await call(p1, "world-swap-ask", { dir: "arc2arcl", amount: 3000, tx }); const b1 = r.body.request; check(r.status === 200 && b1.tx === tx, "$ARCIRCLE → ARCL asked with a checked transfer");
r = await call(gm, "world-swap-admin", { op: "done", id: b1.id, give: 90000 }); check(r.status === 200 && bal(p1).bal === 105000, "the team credits the ARCL");
T += 4000; r = await call(p1, "world-swap-ask", { dir: "arc2arcl", amount: 3000, tx }); check(r.status === 409, "the same transfer can't be used twice");
// turned down: the ARCL goes back
T += 4000; r = await call(p1, "world-swap-ask", { dir: "arcl2arc", amount: 2000 }); const c1 = r.body.request;
r = await call(gm, "world-swap-admin", { op: "reject", id: c1.id, note: "the market moved" }); check(r.status === 200 && r.body.request.status === "rejected" && bal(p1).bal === 105000 && bal(p1).held === 0, "turned down: the ARCL is back");
const v = (await W.read(new URL("https://x/api/social?world=swap&wallet=" + p1.address.toLowerCase()))).body;
check(v.ok && v.mine.length === 4 && v.desk === SWAP.DESK && v.arcl.bal === 105000 && v.arcircle === 5000, "the view: balances, the desk, my requests");
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
