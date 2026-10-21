// market.test.mjs — the hybrid economy (b-ec1/2/3): the ledger writes every ARCL movement down and splits the balance by
// where it came from; the Creator Market sells blueprints 80/20 with 14 days on hold; only the share a buyer paid with
// PURCHASED ARCL becomes the creator's settleable cavail; a settlement is held at once, quoted by a GM, paid from the GM's
// own wallet and closed when the chain shows the transfer. On an in-memory store. Run: node tests/world/market.test.mjs
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { MARKET } = await import("../../api/_world-market.mjs");
const { ARCIRCLE } = await import("../../api/_world-shop.mjs");
const { GM_WALLETS } = await import("../../api/_world-village.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; if (x.del && !db.has(x.del)) return { ok: false, conflict: true }; }
    for (const x of ws) { if (x.create) db.set(x.create, structuredClone(x.data)); else if (x.set) db.set(x.set, structuredClone(x.data)); else if (x.del) db.delete(x.del); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, n] of Object.entries(x.fields)) d[k] = (d[k] || 0) + n; db.set(x.inc, d); } } return { ok: true }; },
  queryDocs: async (col, field, value, limit = 500) => [...db.entries()].filter(([k, d]) => k.startsWith(col + "/") && d && d[field] === value).slice(0, limit).map(([k, d]) => ({ id: k.slice(col.length + 1), ...structuredClone(d) })),
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-10-21T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
let n = 0; const randomId = () => (0x1000000 + ++n * 7919).toString(16) + "beef" + n.toString(16);
const receipts = new Map();
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId, tokenBalance: async () => "0", receipt: async (h) => receipts.get(h) || null });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const read = async (q) => (await W.read(new URL("https://x/api/social?world=" + q))).body;
const lw = (w) => w.address.toLowerCase();
const bal = (w) => (db.get(`worldArclBal/${lw(w)}`) || {}).bal || 0;
const bkt = (w) => db.get(`worldArclBkt/${lw(w)}`) || {};
const CODE = "ARCBP1." + Buffer.from(new Uint8Array(5 * 40).map((_, i) => i % 251)).toString("base64");

const creator = ethers.Wallet.createRandom(), buyer = ethers.Wallet.createRandom(), buyer2 = ethers.Wallet.createRandom(), gm = ethers.Wallet.createRandom();
GM_WALLETS.push(lw(gm));
// the buyers' ARCL: buyer has 100,000 PLAY (as earned in games); buyer2 bought 120,000 through the Exchange ($ARCIRCLE → ARCL)
db.set(`worldArclBal/${lw(buyer)}`, { bal: 100000, earned: 100000 });
{ const tx = "0x" + "a".repeat(64); const D = (await import("../../api/_world-swap.mjs")).SWAP.DESK, pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  receipts.set(tx, { status: "0x1", logs: [{ address: ARCIRCLE, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(buyer2.address), pad(D)], data: "0x" + (120000n * 10n ** 18n).toString(16) }] });
  let r = await call(buyer2, "world-swap-ask", { dir: "arc2arcl", amount: 120000, tx }); check(r.status === 200, "an Exchange request: $ARCIRCLE → ARCL");
  r = await call(gm, "world-swap-admin", { op: "done", id: r.body.request.id, give: 120000 }); check(r.status === 200 && bal(buyer2) === 120000 && bkt(buyer2).purchased === 120000, "settled: 120,000 ARCL in the PURCHASED bucket"); }
let L = await read("arcl-tx&wallet=" + lw(buyer2)); check(L.list.some((x) => x.k === "swap-buy" && x.n === 120000 && x.b && x.b.purchased === 120000), "the ledger has the purchase");

// the market: list, browse, the rules of buying
let r = await call(creator, "world-market-list", { title: "Sky Castle", code: CODE, price: 50000 }); check(r.status === 200 && r.body.item.price === 50000, "a creator lists a blueprint");
const id = r.body.item.id;
r = await call(creator, "world-market-list", { title: "Bad", code: "nope", price: 500 }); check(r.status === 400, "only a blueprint code can be listed");
r = await call(creator, "world-market-list", { title: "Cheap", code: CODE, price: 5 }); check(r.status === 400, "the price has a floor");
let M = await read("market"); check(M.items.length === 1 && !("code" in M.items[0]), "the market lists it (without its code)");
r = await call(creator, "world-market-buy", { id, expectedPrice: 50000 }); check(r.status === 400, "not your own");
r = await call(buyer, "world-market-buy", { id, expectedPrice: 40000 }); check(r.status === 409, "the price it was shown at must match");
// buyer pays with PLAY ARCL: the creator's 80 % is all cplay (spendable, not settleable)
r = await call(buyer, "world-market-buy", { id, expectedPrice: 50000 }); check(r.status === 200 && r.body.code === CODE && bal(buyer) === 50000, "bought: the code, 50,000 ARCL paid");
r = await call(buyer, "world-market-buy", { id, expectedPrice: 50000 }); check(r.status === 409, "once");
let s1 = db.get(`worldMktSale/${id}_${lw(buyer)}`); check(s1.elig === 0 && s1.play === 40000 && s1.platform === 10000, "paid with PLAY: 0 settleable, 40,000 creator play, 10,000 platform");
// buyer2 pays with PURCHASED ARCL: the creator's 80 % is settleable
r = await call(buyer2, "world-market-buy", { id, expectedPrice: 50000 }); check(r.status === 200 && bkt(buyer2).purchased === 70000, "buyer2 pays from PURCHASED first");
let s2 = db.get(`worldMktSale/${id}_${lw(buyer2)}`); check(s2.elig === 40000 && s2.play === 0 && s2.platform === 10000, "paid with PURCHASED: 40,000 settleable for the creator");
check(((db.get("worldArclBal/platform") || {}).bal || 0) === 20000, "the platform's 20 % of both");
// on hold for 14 days
let me = await read("market-me&wallet=" + lw(creator)); check(me.earnings.pendingElig === 40000 && me.earnings.pendingPlay === 40000 && bal(creator) === 0, "the creator's 80,000 waits 14 days");
me = await read("market-me&wallet=" + lw(buyer)); check(me.owned.length === 1 && me.owned[0].code === CODE, "the buyer owns it (with the code to build)");
T += MARKET.HOLD + 60e3;
me = await read("market-me&wallet=" + lw(creator)); check(bal(creator) === 80000 && me.buckets.cavail === 40000 && me.buckets.cplay === 40000, "after 14 days: 80,000 in the balance, 40,000 settleable");
me = await read("market-me&wallet=" + lw(creator)); check(bal(creator) === 80000, "paid once");
// the Creator Exchange
r = await call(creator, "world-settle-ask", { amount: 50000 }); check(r.status === 400, "no more than the settleable 40,000");
r = await call(creator, "world-settle-ask", { amount: 10000 }); check(r.status === 400, "at least " + MARKET.MIN);
r = await call(creator, "world-settle-ask", { amount: 40000 }); check(r.status === 200 && bal(creator) === 40000 && (db.get(`worldArclBal/${lw(creator)}`).held === 40000) && bkt(creator).cavail === 0, "a settlement of 40,000: held at once");
const sid = r.body.request.id;
r = await call(creator, "world-econ-admin", { op: "overview" }); check(r.status === 403, "the admin is for the team");
r = await call(gm, "world-econ-admin", { op: "paid", id: sid, tx: "0x" + "b".repeat(64) }); check(r.status === 409, "quote it first");
r = await call(gm, "world-econ-admin", { op: "quote", id: sid, arc: 4000, src: "test rate" }); check(r.status === 200 && r.body.request.status === "approved", "the GM quotes 4,000 $ARCIRCLE");
const ptx = "0x" + "c".repeat(64), pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
receipts.set(ptx, { status: "0x1", from: lw(gm), logs: [{ address: ARCIRCLE, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(gm.address), pad(creator.address)], data: "0x" + (3000n * 10n ** 18n).toString(16) }] });
r = await call(gm, "world-econ-admin", { op: "paid", id: sid, tx: ptx }); check(r.status === 400, "a transfer short of the quote doesn't close it");
const ptx2 = "0x" + "d".repeat(64); receipts.set(ptx2, { status: "0x1", from: lw(gm), logs: [{ address: ARCIRCLE, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(gm.address), pad(creator.address)], data: "0x" + (4000n * 10n ** 18n).toString(16) }] });
r = await call(gm, "world-econ-admin", { op: "paid", id: sid, tx: ptx2 }); check(r.status === 200 && r.body.request.status === "completed" && db.get(`worldArclBal/${lw(creator)}`).held === 0, "the GM's own transfer on Arc closes it");
r = await call(gm, "world-econ-admin", { op: "paid", id: sid, tx: ptx2 }); check(r.status === 409, "not twice");
// a second sale, refunded while on hold
db.set(`worldArclBal/${lw(buyer)}`, { ...db.get(`worldArclBal/${lw(buyer)}`), bal: 60000 });
r = await call(creator, "world-market-list", { title: "Tower", code: CODE, price: 20000 }); const id2 = r.body.item.id;
r = await call(buyer, "world-market-buy", { id: id2, expectedPrice: 20000 }); check(r.status === 200 && bal(buyer) === 40000, "another sale");
r = await call(gm, "world-econ-admin", { op: "refund", sale: `${id2}_${lw(buyer)}` }); check(r.status === 200 && bal(buyer) === 60000, "refunded on hold: the ARCL back");
me = await read("market-me&wallet=" + lw(buyer)); check(!me.owned.some((x) => x.id === id2), "and the blueprint taken back");
// the admin views and the ledger
r = await call(gm, "world-econ-admin", { op: "overview" }); check(r.status === 200 && r.body.all.sales >= 120000 && r.body.settle.completed === 40000, "the overview counts sales and settlements");
r = await call(gm, "world-econ-admin", { op: "wallet", who: lw(creator) }); check(r.body.list.some((x) => x.k === "market-sale") && r.body.list.some((x) => x.t === "settle"), "a wallet's full ledger: the sale, the settlement");
r = await call(gm, "world-econ-admin", { op: "audit" }); check(r.body.list.some((x) => x.action === "paid") && r.body.list.some((x) => x.action === "refund"), "every admin action is in the audit log");
// a reject puts it back
db.set(`worldArclBkt/${lw(creator)}`, { ...bkt(creator), cavail: 35000 }); db.set(`worldArclBal/${lw(creator)}`, { ...db.get(`worldArclBal/${lw(creator)}`), bal: 75000 });
T += 5000; r = await call(creator, "world-settle-ask", { amount: 30000 }); const sid2 = r.body.request.id;
r = await call(gm, "world-econ-admin", { op: "reject", id: sid2, note: "check" }); check(r.status === 200 && bkt(creator).cavail === 35000 && bal(creator) === 75000, "turned down: the ARCL back to settleable");
// any spend is in the ledger with its buckets
L = await read("arcl-tx&wallet=" + lw(buyer2)); check(L.list.some((x) => x.t === "spend" && x.k === "market:" + id && x.b && x.b.purchased === 50000), "a market purchase is in the ledger, from PURCHASED");
// the coins page's public totals (api/_world-coins.mjs)
{ db.set("worldLand/3", { owner: lw(buyer), price: 200000 }); db.set("worldStats/shop", { paid: 2, arcPaid: 900, arcBurned: 450 });
  const C = await read("coins");
  check(C.swap.bought.n === 1 && C.swap.bought.arc === 120000 && C.swap.bought.arcl === 120000, "coins: the Exchange's $ARCIRCLE → ARCL total");
  check(C.arcl.all.sales >= 120000 && C.arcl.all.platform > 0 && C.arcl.all.spent > 0 && C.arcl.all.settled >= 40000, "coins: ARCL earned / spent / market sales / settled from the ledger");
  check(C.arcl.days.length === 30 && C.arcl.since && Object.keys(C.arcl.spend).some((k) => k === "market"), "coins: 30 days, the ledger's first day, spends by kind");
  check(C.shop.burned === 450 && C.land.sold === 1 && C.land.arc === 200000 && C.market.listings >= 1, "coins: $ARCIRCLE paid in the game (half burned), LAND sold");
  check(!JSON.stringify(C).includes(lw(buyer)), "coins: no wallet in the public numbers");
  check(!Object.keys(C.arcl.earn).some((k) => /market_cut/.test(k)), "coins: the platform's 20% is a fee, not ARCL earned"); }
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
