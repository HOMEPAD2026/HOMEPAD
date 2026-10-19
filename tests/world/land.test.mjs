// land.test.mjs — ARCIRCLE LAND (api/_world-land.mjs): the 20 villages and their prices; a 5-minute hold, one a wallet;
// a purchase only from a receipt that moves the price in $ARCIRCLE from the buyer to the treasury after the hold;
// one owner a village and one village a wallet (a payment that can't buy goes on the refund list); the GM marks a
// refund; a LAND owner's island may be 64×64 and hold more bricks. On an in-memory store with made-up receipts.
// Run: node tests/world/land.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const V = await import("../../api/_world-village.mjs");
const { LAND } = await import("../../api/_world-land.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => {
    for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; }
    for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.set) db.set(w.set, w.data); else if (w.del) db.delete(w.del); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; db.set(w.inc, d); } }
    return { ok: true };
  },
};
const TOKEN = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7", TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", TRE = LAND.treasury;
const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0"), wei = (n) => "0x" + (BigInt(n) * 10n ** 18n).toString(16);
const receipts = {}; let block = 100;
let T = Date.parse("2026-10-20T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const W = make({ ...store, recover: recoverSigner, issuedOk, json: (status, body) => ({ status, body }), now: () => T, phase: { phase: "live", epoch: 2 }, receipt: async (tx) => receipts[tx] || null, blockNumber: async () => "0x" + block.toString(16) });
const sig = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)), ep: 2 }; };
const call = async (w, action, extra) => W.handle({ action, ...(await sig(w)), ...extra });
const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), C = ethers.Wallet.createRandom(), gm = ethers.Wallet.createRandom();
V.GM_WALLETS.push(gm.address.toLowerCase());
const tx = (n) => "0x" + String(n).repeat(64).slice(0, 64);
const pay = (h, from, n, { to = TRE, token = TOKEN, blk = block + 1, status = "0x1" } = {}) => { receipts[h] = { status, blockNumber: "0x" + blk.toString(16), logs: [{ address: token, topics: [TRANSFER, pad(from.address), pad(to)], data: wei(n) }] }; };

let v = (await W.read(new URL("http://x/?world=land"))).body;
check(v.villages.length === 20 && v.villages[0].price === 100000 && v.villages[19].price === 10000000 && v.villages.every((x, i) => !i || x.price > v.villages[i - 1].price), "20 villages, 100,000 → 10,000,000 $ARCIRCLE, each dearer than the last");
check(v.villages.reduce((a, x) => a + x.price, 0) === 50350000 && v.treasury === TRE && v.villages.every((x) => x.status === "open"), "the plan's total (50,350,000), paid to the treasury, all open");
let r = await call(A, "world-land-reserve", { n: 21 }); check(r.status === 400, "no village 21");
r = await call(A, "world-land-reserve", { n: 3 }); check(r.status === 200 && r.body.to === TRE && r.body.amount === (200000n * 10n ** 18n).toString(), "a hold on V03: the price in wei and where to send it");
r = await call(B, "world-land-reserve", { n: 3 }); check(r.status === 409, "someone else's hold: another wallet waits");
v = (await W.read(new URL("http://x/?world=land&wallet=" + A.address.toLowerCase()))).body; check(v.villages[2].status === "held" && v.villages[2].heldBy === "you", "the list shows the hold (yours)");
r = await call(A, "world-land-confirm", { n: 3, tx: tx(1) }); check(r.status === 202 && r.body.pending, "not confirmed yet: pending");
pay(tx(2), A, 200000, { to: B.address }); r = await call(A, "world-land-confirm", { n: 3, tx: tx(2) }); check(r.status === 400, "paid to someone else, not the treasury: refused");
pay(tx(3), A, 200000, { token: "0x" + "9".repeat(40) }); r = await call(A, "world-land-confirm", { n: 3, tx: tx(3) }); check(r.status === 400, "another token: refused");
pay(tx(4), A, 200000, { blk: 90 }); r = await call(A, "world-land-confirm", { n: 3, tx: tx(4) }); check(r.status === 400 && /older/.test(r.body.error), "a transfer from before the hold: refused");
pay(tx(5), A, 200000, { status: "0x0" }); r = await call(A, "world-land-confirm", { n: 3, tx: tx(5) }); check(r.status === 400 && /failed/.test(r.body.error), "a failed transaction: refused");
pay(tx(6), A, 150000); r = await call(A, "world-land-confirm", { n: 3, tx: tx(6) }); check(r.status === 400 && r.body.refund, "less than the price: not bought, on the refund list");
pay(tx(7), A, 200000); r = await call(A, "world-land-confirm", { n: 3, tx: tx(7) }); check(r.status === 200 && r.body.village.owner === A.address.toLowerCase(), "the full price to the treasury: V03 is A's");
r = await call(A, "world-land-confirm", { n: 3, tx: tx(7) }); check(r.status === 409, "the same transaction: once only");
r = await call(A, "world-land-reserve", { n: 5 }); check(r.status === 409 && r.body.mine === 3, "one village a wallet");
r = await call(B, "world-land-reserve", { n: 3 }); check(r.status === 409 && /sold/.test(r.body.error), "a sold village can't be held");
// two paying for the same village: the second goes on the refund list
r = await call(B, "world-land-reserve", { n: 8 }); check(r.status === 200, "B holds V08");
T += LAND.holdMs + 1000; r = await call(C, "world-land-reserve", { n: 8 }); check(r.status === 200, "after 5 minutes the hold lapses: C holds V08");
block += 5; pay(tx(8), C, 800000); r = await call(C, "world-land-confirm", { n: 8, tx: tx(8) }); check(r.status === 200, "C pays: V08 is C's");
pay(tx(9), B, 800000, { blk: 101 }); r = await call(B, "world-land-confirm", { n: 8, tx: tx(9) }); check(r.status === 409 && r.body.refund, "B paid late for V08: on the refund list, not an owner");
v = (await W.read(new URL("http://x/?world=land-refunds"))).body;
check(v.list.length === 2 && v.list.some((x) => x.tx === tx(9) && x.tokens === 800000 && /someone else/.test(x.why)) && v.list.some((x) => x.tx === tx(6) && x.tokens === 150000), "the refund list: who, how much and why");
v = (await W.read(new URL("http://x/?world=land&wallet=" + B.address.toLowerCase()))).body; check(v.refunds.length === 1 && v.mine === 0, "B sees their own refund and owns no village");
r = await call(A, "world-land-refunded", { tx: tx(9), back: tx(10) }); check(r.status === 403, "only a GM marks a refund");
r = await call(gm, "world-land-refunded", { tx: tx(9), back: tx(10) }); v = (await W.read(new URL("http://x/?world=land-refunds"))).body;
check(r.status === 200 && v.list.find((x) => x.tx === tx(9)).back === tx(10), "the GM marks it sent back, with the return transaction");
v = (await W.read(new URL("http://x/?world=land"))).body; check(v.sold === 2 && v.villages[2].status === "sold" && v.villages[7].owner === C.address.toLowerCase(), "the public list: two sold, with their owners");
r = await call(A, "world-land-confirm", { n: 9, tx: tx(11) }); check(r.status === 400 && /reserve/.test(r.body.error), "paying without a hold: refused (nothing to tie the payment to)");
// the owner's island: 64×64 and more bricks
const isle = (N, n) => { const u = new Uint8Array(2 + 5 * n); u[0] = 1; u[1] = N; for (let i = 0; i < n; i++) { u[2 + i * 5] = i % N; u[3 + i * 5] = Math.floor(i / (N * N)) % 30; u[4 + i * 5] = Math.floor(i / N) % N; } return Buffer.from(u).toString("base64"); };
T += 60e3; r = await call(A, "world-island-save", { data: isle(64, 15000), name: "A" }); check(r.status === 200, "a LAND owner saves a 64×64 island of 15,000 bricks");
T += 60e3; r = await call(B, "world-island-save", { data: isle(64, 100), name: "B" }); check(r.status === 400, "without LAND (and no 64×64 expansion): refused");
T += 60e3; r = await call(B, "world-island-save", { data: isle(36, 9000), name: "B" }); check(r.status === 200, "an ordinary island of 9,000 bricks saves (the old 7,200-brick text limit is gone)");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
