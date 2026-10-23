// lands.test.mjs — b-lpv: the Launchpad Village and the Utility Village (world-lands.js, api/_world-lots.mjs).
// The game and the server agree on the lot tiers and where the lands are; the tiers by market cap ($1k, $10k, $100k);
// the village's layout (no two lots on top of each other, none on the plaza or the avenue from the portal, the biggest
// tier nearest the plaza, a lot keeping its place when newer coins join); the server: a lot is built only by its
// creator, at its tier's size and brick limit, never shrinks once grown, the old 9×9 still saves; presence is accepted
// in the lands. On an in-memory store. Run: node tests/world/lands.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const C = await import("../../world-lands.js");
const S = await import("../../api/_world-lots.mjs");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

check(JSON.stringify(C.LOT_TIERS.map(({ min, N, max }) => [min, N, max])) === JSON.stringify(S.LOT_TIERS.map(({ min, N, max }) => [min, N, max])), "the game and the server: the same lot tiers");
check(Object.keys(C.LANDS).every((k) => S.LANDS[k] && S.LANDS[k].x === C.LANDS[k].x && S.LANDS[k].z === C.LANDS[k].z && S.LANDS[k].r >= C.LANDS[k].r), "… and the same lands (the server's edge at least as wide)");
check([[0, 0], [999, 0], [1000, 1], [9999, 1], [10000, 2], [99999, 2], [100000, 3], [5e6, 3], [null, 0]].every(([m, t]) => C.tierOfCap(m) === t && S.tierOfCap(m) === t), "tiers: under $1k Starter, $1k+ S, $10k+ M, $100k+ L");
check(C.LOT_TIERS.map((t) => t.N).join() === "16,24,36,48", "lot sizes 16 / 24 / 36 / 48 bricks");

// the layout
const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ token: "0x" + String(i).padStart(40, "0"), launchedAt: 1000 + i, marketCapUsd: f(i) }));
for (const [n, f, name] of [[22, (i) => (i < 3 ? 500 : 2000 + i * 100), "today's 22"], [300, (i) => [300, 3000, 30000, 300000][i % 4], "300 of every tier"]]) {
  const coins = mk(n, f), { lots, r } = C.layoutLots(coins, (c) => C.tierOfCap(c.marketCapUsd));
  let overlap = 0; for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) { const a = lots[i], b = lots[j]; if (Math.hypot(a.x - b.x, a.z - b.z) < (a.size + b.size) / 2) overlap++; }
  const plaza = lots.filter((l) => Math.hypot(l.x, l.z) - l.size / 2 < 22).length;
  const avenue = lots.filter((l) => l.z > 0 && Math.abs(l.x) < 4.5 + l.size * 0.5 * Math.abs(Math.cos(l.ry))).length;
  const inside = lots.every((l) => Math.hypot(l.x, l.z) + l.size * 0.71 <= r);
  const order = lots.every((l, i) => i === 0 || lots[i - 1].tier >= l.tier) && lots.every((l, i) => i === 0 || lots[i - 1].tier !== l.tier || Math.hypot(lots[i - 1].x, lots[i - 1].z) <= Math.hypot(l.x, l.z) + 1e-6);
  check(lots.length === n && !overlap && !plaza && !avenue && inside, `${name}: every coin a lot, none overlapping, off the plaza and the avenue, inside the edge (r ${Math.round(r)} m)`);
  check(order, `${name}: the biggest tier nearest the plaza`);
}
{ const coins = mk(30, () => 2000), a = C.layoutLots(coins.slice(0, 20), () => 1).lots, b = C.layoutLots(coins, () => 1).lots;
  check(a.every((l, i) => Math.abs(l.x - b[i].x) < 1e-6 && Math.abs(l.z - b[i].z) < 1e-6), "a lot keeps its place when newer coins of its tier join"); }
check(C.landAt(2400, 10) && C.landAt(2400, 10).id === "lp" && C.landAt(-2400, 5).id === "ut" && !C.landAt(0, 0) && !C.landAt(200, 0), "landAt: the lands, and the town (null)");
check(S.inWorld(0, 120) && S.inWorld(2420, 30) && S.inWorld(-2400, 10) && !S.inWorld(600, 0) && !S.inWorld(0, 400), "presence: the town and the lands, not the empty ground between");

// the server: building a lot
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
let TT = Date.parse("2026-10-23T03:00:00Z");
const creator = ethers.Wallet.createRandom(), other = ethers.Wallet.createRandom(), coin = "0x" + "ab".repeat(20);
let mcap = 2500;
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json: (status, body) => ({ status, body }), now: () => TT, launchRecord: async (c) => (c === coin ? { token: coin, creator: creator.address, launchedAt: 1 } : null), coinMcap: async () => mcap });
const sign = async (w) => { const issued = new Date(TT).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const build = (N, n) => { const u = new Uint8Array(2 + 5 * n); u[0] = 1; u[1] = N; for (let i = 0; i < n; i++) { u[2 + i * 5] = i % N; u[3 + i * 5] = Math.floor(i / (N * N)) % 24; u[4 + i * 5] = Math.floor(i / N) % N; u[5 + i * 5] = 1; u[6 + i * 5] = 0; } return Buffer.from(u).toString("base64"); };
let r = await call(creator, "world-lot-tier", { coin }); check(r.status === 200 && r.body.tier === 1 && r.body.N === 24 && r.body.max === 5000, "a $2.5k coin: an S lot, 24×24, 5,000 bricks");
r = await call(creator, "world-lot-save", { coin, data: build(24, 300) }); check(r.status === 200, "its creator builds it at 24×24");
TT += 9000; r = await call(creator, "world-lot-save", { coin, data: build(36, 300) }); check(r.status === 403, "not bigger than its tier (36×36 is M)");
TT += 9000; r = await call(other, "world-lot-save", { coin, data: build(24, 10) }); check(r.status === 403, "someone else can't build it");
TT += 9000; r = await call(creator, "world-lot-save", { coin, data: build(9, 50) }); check(r.status === 200, "the old 9×9 still saves");
TT += 9000; r = await call(creator, "world-lot-save", { coin, data: build(16, 1900) }); check(r.status === 200, "a smaller size is fine too (16×16, up to its own 2,000 bricks)");
mcap = 42000; TT += 9000; r = await call(creator, "world-lot-save", { coin, data: build(36, 9000) }); check(r.status === 200, "the coin reaches $42k: an M lot, 36×36");
mcap = 800; TT += 9000; r = await call(creator, "world-lot-tier", { coin }); check(r.body.tier === 2, "the price falls back: the lot stays M (it never shrinks)");
r = await W.read(new URL("http://x/api/social?world=lots&coins=" + coin)); check(r.status === 200 && r.body.lots[coin] && r.body.lots[coin].N === 36 && r.body.tiers[coin] === 2, "the lots list: the build and its kept tier");
TT += 9000; r = await call(creator, "world-lot-save", { coin, data: build(36, 10001) }); check(r.status === 400, "over the M lot's 10,000 bricks: refused");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
