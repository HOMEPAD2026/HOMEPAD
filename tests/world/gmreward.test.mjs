// gmreward.test.mjs — the GM's $ARCIRCLE rewards (api/_world-gmreward.mjs): noted only from a GM wallet, only once the
// receipt shows $ARCIRCLE moving from that GM to that player, once a transaction; a player's list and total; the recent
// list. On an in-memory store with made-up receipts.
// Run: node tests/world/gmreward.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const V = await import("../../api/_world-village.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.set) db.set(w.set, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, v] of Object.entries(w.fields)) d[k] = (d[k] || 0) + v; db.set(w.inc, d); } else if (w.del) db.delete(w.del); } return { ok: true }; },
};
const TOKEN = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7", TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0"), wei = (n) => "0x" + (BigInt(n) * 10n ** 18n).toString(16);
const receipts = {};
let T = Date.parse("2026-10-20T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const W = make({ ...store, recover: recoverSigner, issuedOk, json: (status, body) => ({ status, body }), now: () => T, phase: { phase: "live", epoch: 2 }, receipt: async (tx) => receipts[tx] || null });
const sig = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)), ep: 2 }; };
const call = async (w, extra) => W.handle({ action: "world-gm-reward-log", ...(await sig(w)), ...extra });
const gm = ethers.Wallet.createRandom(), other = ethers.Wallet.createRandom(), player = ethers.Wallet.createRandom(); V.GM_WALLETS.push(gm.address.toLowerCase());
const P = player.address.toLowerCase(), G = gm.address.toLowerCase(), tx = (n) => "0x" + String(n).repeat(64).slice(0, 64);
const log = (from, to, n, token = TOKEN) => ({ address: token, topics: [TRANSFER, pad(from), pad(to)], data: wei(n) });
let r = await call(other, { to: P, tx: tx(1) }); check(r.status === 403, "a wallet that isn't a GM: refused");
r = await call(gm, { to: P, tx: tx(1) }); check(r.status === 202 && r.body.pending, "not confirmed yet: pending (202)");
receipts[tx(2)] = { status: "0x0", logs: [log(G, P, 100)] }; r = await call(gm, { to: P, tx: tx(2) }); check(r.status === 400 && /failed/.test(r.body.error), "a failed transaction: refused");
receipts[tx(3)] = { status: "0x1", logs: [log(G, P, 100, "0x" + "9".repeat(40))] }; r = await call(gm, { to: P, tx: tx(3) }); check(r.status === 400, "another token: not a reward");
receipts[tx(4)] = { status: "0x1", logs: [log(G, other.address, 100)] }; r = await call(gm, { to: P, tx: tx(4) }); check(r.status === 400, "to someone else: not this player's reward");
receipts[tx(5)] = { status: "0x1", logs: [log(other.address, P, 100)] }; r = await call(gm, { to: P, tx: tx(5) }); check(r.status === 400, "from another wallet: not the GM's reward");
receipts[tx(6)] = { status: "0x1", logs: [log(G, P, 1000), log(G, P, 234)] }; r = await call(gm, { to: P, tx: tx(6), note: "Weekly <b>winner</b>" });
check(r.status === 200 && r.body.reward.tokens === 1234 && r.body.reward.note === "Weekly bwinner/b", "a real transfer: noted, the amount summed from its logs (1,234), the note cleaned");
r = await call(gm, { to: P, tx: tx(6) }); check(r.status === 409, "the same transaction: once only");
T += 60e3; receipts[tx(7)] = { status: "0x1", logs: [log(G, P, 500)] }; await call(gm, { to: P, tx: tx(7) });
let v = (await W.read(new URL("http://x/?world=gm-rewards&wallet=" + P))).body; check(v.list.length === 2 && v.list[0].tx === tx(7) && v.tokens === 1734, "the player's list (newest first) and total (1,734)");
v = (await W.read(new URL("http://x/?world=gm-rewards"))).body; check(v.recent.length === 2 && v.recent[0].to === P, "the recent list, everyone's");
r = await call(gm, { to: "nope", tx: tx(8) }); check(r.status === 400, "a bad address: refused");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
