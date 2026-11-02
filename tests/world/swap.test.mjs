// swap.test.mjs — the Exchange relaunch (EX, 2026-11-02; api/_world-swap.mjs): the treasury wallet sets the rate (shown to
// everyone) and settles each request from its own wallet — the server reads the transfer back from Arc, once; requests
// lock the rate in; the public record and totals; the requests waiting from before the relaunch are closed once (held
// ARCL back, an old $ARCIRCLE transfer marked to be returned). On an in-memory store. Run: node tests/world/swap.test.mjs
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { SWAP, arcFor, arclFor } = await import("../../api/_world-swap.mjs");
const { ARCIRCLE } = await import("../../api/_world-shop.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); else if (x.merge) db.set(x.merge, { ...(db.get(x.merge) || {}), ...x.data }); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-11-02T12:00:00Z"); const RC = {};
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, rand: () => 0.5, receipt: async (h) => RC[h] || null });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => { T += 4000; return W.handle({ action, ...(await sign(w)), ...extra }); };
const read = async (q) => (await W.read(new URL("https://x/api/social?" + q))).body;
const pad = (x) => "0x" + String(x).replace(/^0x/, "").toLowerCase().padStart(64, "0"), TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const xfer = (from, to, n) => ({ address: ARCIRCLE, topics: [TR, pad(from), pad(to)], data: "0x" + (BigInt(n) * 10n ** 18n).toString(16) });
const h = (k) => "0x" + k.repeat(64 / k.length);
// the treasury signs in with its own key here: a test wallet stands in for it (SWAP.TREASURY is read at call time)
const TRE = ethers.Wallet.createRandom(); SWAP.TREASURY = TRE.address.toLowerCase();
const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), a = A.address.toLowerCase(), b = B.address.toLowerCase();
const bal = (w) => (db.get(`worldArclBal/${w}`) || {});

// ---- before the relaunch: two old requests still waiting (A held 5,000 ARCL; B sent 2,000 $ARCIRCLE to the old desk)
db.set(`worldArclBal/${a}`, { bal: 100000, held: 5000 }); db.set(`worldArclBal/${b}`, { bal: 0 });
const old1 = { id: "old1", w: a, dir: "arcl2arc", amount: 5000, status: "pending", at: Date.parse("2026-10-20T00:00:00Z") };
const old2 = { id: "old2", w: b, dir: "arc2arcl", amount: 2000, status: "pending", at: Date.parse("2026-10-21T00:00:00Z"), tx: h("0a") };
db.set("worldSwap/old1", old1); db.set("worldSwap/old2", old2); db.set("worldSwapQ/2026-10", { ids: ["old2", "old1"] }); db.set(`worldSwapMine/${a}`, { ids: ["old1"] }); db.set(`worldSwapMine/${b}`, { ids: ["old2"] });

let v = await read("world=swap");
check(v.ok && v.rate === 0 && v.open === false && v.treasury === SWAP.TREASURY && Array.isArray(v.log), "the exchange reads without a wallet: no rate yet, closed, the treasury's address, the public record");
check(bal(a).bal === 105000 && bal(a).held === 0 && db.get("worldSwap/old1").status === "refunded", "the relaunch: A's held 5,000 ARCL is back and the old request says refunded");
check(db.get("worldSwap/old2").status === "returning", "the relaunch: B's old $ARCIRCLE transfer is marked to be returned by the treasury");
check(db.get("worldSwapMig/relaunch").done && db.get("worldSwapMig/relaunch").refunded === 1 && db.get("worldSwapMig/relaunch").returning === 1, "the relaunch ran once and counted what it closed");
await read("world=swap"); check(bal(a).bal === 105000, "reading again doesn't refund twice");

// ---- the rate: only the treasury sets it
let r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 10000 }); check(r.status === 409, "no request before the treasury posts a rate");
r = await call(A, "world-swap-admin", { op: "rate", rate: 10 }); check(r.status === 403, "a player can't set the rate");
r = await call(TRE, "world-swap-admin", { op: "rate", rate: 0 }); check(r.status === 400, "a rate of 0 is refused");
r = await call(TRE, "world-swap-admin", { op: "rate", rate: 12.5 }); check(r.status === 200 && r.body.cfg.rate === 12.5 && r.body.cfg.open, "the treasury sets 1 $ARCIRCLE = 12.5 $ARCL and the exchange opens");
v = await read("world=swap&wallet=" + A.address); check(v.rate === 12.5 && v.open && v.mine.some((x) => x.id === "old1" && x.status === "refunded") && !v.isTreasury, "everyone sees the rate; A sees the refunded old request");
check((await read("world=swap&wallet=" + TRE.address)).isTreasury === true, "the treasury's wallet is told it's the treasury");

// ---- ARCL → $ARCIRCLE
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 500 }); check(r.status === 400, "under the least (1,000 ARCL) is refused");
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 999999999 }); check(r.status === 400, "more than the most at once is refused");
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 10000 });
const q1 = r.body.request; check(r.status === 200 && q1.rate === 12.5 && q1.quote === 800 && q1.quote === arcFor(10000, 12.5), "10,000 ARCL at 12.5 → a quote of 800 $ARCIRCLE, the rate locked in");
check(bal(a).bal === 95000 && bal(a).held === 10000, "the 10,000 ARCL is held");
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 2000 }); check(r.status === 409, "one waiting request at a time");
r = await call(TRE, "world-swap-admin", { op: "rate", rate: 20 }); check(r.body.cfg.rate === 20, "the treasury changes the rate to 20");
check(db.get(`worldSwap/${q1.id}`).quote === 800, "a request keeps the rate it was made at");
r = await call(A, "world-swap-admin", { op: "done", id: q1.id, gmTx: h("b1") }); check(r.status === 403, "a player can't settle");
r = await call(TRE, "world-swap-admin", { op: "done", id: q1.id }); check(r.status === 400, "settling needs the treasury's transaction");
r = await call(TRE, "world-swap-admin", { op: "done", id: q1.id, gmTx: h("b1") }); check(r.status === 202, "a transaction not confirmed yet: wait");
RC[h("b2")] = { status: "0x1", logs: [xfer(b, a, 800)] }; r = await call(TRE, "world-swap-admin", { op: "done", id: q1.id, gmTx: h("b2") }); check(r.status === 400, "a transfer from anyone but the treasury is refused");
RC[h("b3")] = { status: "0x1", logs: [xfer(SWAP.TREASURY, b, 800)] }; r = await call(TRE, "world-swap-admin", { op: "done", id: q1.id, gmTx: h("b3") }); check(r.status === 400, "a transfer to someone else is refused");
RC[h("b4")] = { status: "0x0", logs: [xfer(SWAP.TREASURY, a, 800)] }; r = await call(TRE, "world-swap-admin", { op: "done", id: q1.id, gmTx: h("b4") }); check(r.status === 400, "a failed transaction is refused");
RC[h("b5")] = { status: "0x1", logs: [xfer(SWAP.TREASURY, a, 800)] }; r = await call(TRE, "world-swap-admin", { op: "done", id: q1.id, gmTx: h("b5") });
check(r.status === 200 && r.body.request.status === "done" && r.body.request.give === 800 && r.body.request.gmTx === h("b5"), "the treasury's 800 $ARCIRCLE to A settles it");
check(bal(a).held === 0 && bal(a).bal === 95000, "the held ARCL is spent");
r = await call(TRE, "world-swap-admin", { op: "done", id: q1.id, gmTx: h("b5") }); check(r.status === 409, "a settled request can't be settled again");
v = await read("world=swap-log"); check(v.totals.n === 1 && v.totals.arcl === 10000 && v.totals.arc === 800 && v.log[0].tx === h("b5") && v.log[0].who.startsWith(a.slice(0, 6)) && !JSON.stringify(v.log).includes(a), "the public record: the exchange, its tx and totals — the wallet only shortened");

// the same transaction can't settle a second request
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 4000 }); const q2 = r.body.request; check(q2.quote === 200, "a new request at the new rate (4,000 ARCL at 20 → 200)");
RC[h("b6")] = { status: "0x1", logs: [xfer(SWAP.TREASURY, a, 800)] };
r = await call(TRE, "world-swap-admin", { op: "done", id: q2.id, gmTx: h("b5") }); check(r.status === 409, "a transaction already used for another request is refused");
r = await call(TRE, "world-swap-admin", { op: "reject", id: q2.id, note: "test" }); check(r.status === 200 && r.body.request.status === "rejected" && bal(a).bal === 95000 && bal(a).held === 0, "turned down: the 4,000 ARCL is back");
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 3000 }); const q3 = r.body.request; r = await call(A, "world-swap-cancel", { id: q3.id }); check(r.status === 200 && r.body.request.status === "cancelled" && bal(a).bal === 95000, "the player cancels a waiting request: the ARCL is back");

// ---- the day's allowance: 300,000 $ARCIRCLE a wallet a Seoul day (rate 20: 20 ARCL a token)
db.get(`worldArclBal/${a}`).bal += 20_000_000;
v = await read("world=swap&wallet=" + A.address); const used0 = v.daily.used, left0 = SWAP.DAY_ARC - used0;
check(v.daily.cap === 300000 && used0 === 800, `the window shows today's use (the settled 800 counts; cancelled and turned-down ones don't): ${used0}`);
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 20 * (left0 + 1) }); check(r.status === 400 && /300,000/.test(r.body.error) && r.body.daily.cap === SWAP.DAY_ARC, "one $ARCIRCLE over the day's 300,000 is refused");
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 20 * left0 }); const qd = r.body.request; check(r.status === 200 && qd.quote === left0, `the rest of the day exactly (${left0.toLocaleString()}) is allowed`);
check((await read("world=swap&wallet=" + A.address)).daily.used === 300000, "the day is full");
r = await call(A, "world-swap-cancel", { id: qd.id }); check(r.status === 200 && (await read("world=swap&wallet=" + A.address)).daily.used === used0, "a cancelled request gives its allowance back");
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 20 * left0 }); check(r.status === 200, "so the same request can be made again");
r = await call(TRE, "world-swap-admin", { op: "reject", id: r.body.request.id }); check(r.status === 200 && (await read("world=swap&wallet=" + A.address)).daily.used === used0, "turned down: its allowance comes back too");
T += 864e5; check((await read("world=swap&wallet=" + A.address)).daily.used === 0, "a new Seoul day starts at 0");

// ---- $ARCIRCLE → ARCL: sent to the treasury first
r = await call(B, "world-swap-ask", { dir: "arc2arcl", amount: 500 }); check(r.status === 400 && r.body.pay && r.body.pay.to === SWAP.TREASURY, "no tx: told to send to the treasury first (with the payment's details)");
RC[h("c1")] = { status: "0x1", logs: [xfer(b, SWAP.DESK, 500)] }; r = await call(B, "world-swap-ask", { dir: "arc2arcl", amount: 500, tx: h("c1") }); check(r.status === 400, "a transfer to the old desk isn't a transfer to the treasury");
RC[h("c2")] = { status: "0x1", logs: [xfer(b, SWAP.TREASURY, 500)] }; r = await call(B, "world-swap-ask", { dir: "arc2arcl", amount: 500, tx: h("c2") });
const q4 = r.body.request; check(r.status === 200 && q4.quote === arclFor(500, 20) && q4.quote === 10000, "500 $ARCIRCLE sent to the treasury → a request for 10,000 ARCL at 20");
r = await call(A, "world-swap-ask", { dir: "arc2arcl", amount: 500, tx: h("c2") }); check(r.status === 400 || r.status === 409, "someone else can't reuse B's transfer");
r = await call(TRE, "world-swap-admin", { op: "done", id: q4.id }); check(r.status === 200 && r.body.request.give === 10000 && bal(b).bal === 10000, "the treasury credits B's 10,000 ARCL");

// ---- the old $ARCIRCLE transfer goes back
r = await call(TRE, "world-swap-admin", { op: "return", id: "old2", tx: h("d1") }); check(r.status === 202, "a return not confirmed yet: wait");
RC[h("d2")] = { status: "0x1", logs: [xfer(SWAP.TREASURY, b, 1000)] }; r = await call(TRE, "world-swap-admin", { op: "return", id: "old2", tx: h("d2") }); check(r.status === 400, "less than they sent is refused");
RC[h("d3")] = { status: "0x1", logs: [xfer(SWAP.DESK, b, 2000)] }; r = await call(TRE, "world-swap-admin", { op: "return", id: "old2", tx: h("d3") }); check(r.status === 200 && r.body.request.status === "returned" && r.body.request.retTx === h("d3"), "sent back from the old desk: marked returned with its tx");

// ---- the queue, pause
r = await call(TRE, "world-swap-admin", { op: "list" }); check(r.status === 200 && r.body.list.length >= 5 && r.body.cfg.rate === 20, "the treasury's queue lists the requests and the rate");
r = await call(TRE, "world-swap-admin", { op: "open", open: false }); check(r.body.cfg.open === false, "the treasury pauses the exchange");
r = await call(A, "world-swap-ask", { dir: "arcl2arc", amount: 2000 }); check(r.status === 409, "paused: no new requests");
r = await call(TRE, "world-swap-ask", { dir: "arcl2arc", amount: 2000 }); check(r.status === 400 || r.status === 409, "the treasury can't ask for an exchange itself");

// ---- the client's words
const src = (await import("node:fs")).readFileSync(new URL("../../world-swap.js", import.meta.url), "utf8");
const { WORDS } = await import("../../world-words.js");
const lits = [...new Set([...src.matchAll(/\bT\("((?:[^"\\]|\\.)+)"/g)].map((m) => m[1]))];
for (const L of ["ko", "zh", "tr"]) { const miss = lits.filter((s) => !(s in WORDS[L])); check(!miss.length, `every Exchange string has ${L} (${miss.slice(0, 4).join(" | ") || "all"})`); }

console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
