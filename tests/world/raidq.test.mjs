// raidq.test.mjs — RAID QUEENS runs (api/_world-raidq.mjs): GM-only while closed, the level to enter, three runs a Seoul
// day, a run ended once and no sooner than its minimum, a win's XP granted past the save's pace (worldXpGrant), its gear and
// ARCL; the SECRET dungeon's ticket from a $ARCIRCLE transfer to FeeBurn (each tx once), free for a GM; the game's copy of the rules.
// On an in-memory store. Run: node tests/world/raidq.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { xpAt, XP_VERSION } = await import("../../api/_world-social.mjs");
const { RQ, itemsOf, xpOf, seoulDay, modeOf } = await import("../../api/_world-raidq.mjs");
const { ARCIRCLE, FEE_BURN } = await import("../../api/_world-shop.mjs");
const { GM_WALLETS } = await import("../../api/_world-village.mjs");
const D = await import("../../world-raidq-data.js");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
const ET = (iso) => Date.parse(iso); // ISO with its own offset
let T = ET("2026-10-22T21:00:00-04:00");
const RC = new Map(); // fake receipts for the SECRET tickets
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, receipt: async (tx) => RC.get(tx) || null });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const lvSet = (w, lv, name) => db.set(`worldSave/${w.address.toLowerCase()}`, { xp: xpAt(lv), xpv: XP_VERSION, name });
const bal = (w) => (db.get(`worldArclBal/${w.address.toLowerCase()}`) || {}).bal || 0;
const view = async (w) => (await W.read(new URL("https://x/api/social?world=rq" + (w ? "&wallet=" + w.address : "")))).body;
const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const D_ = D; check(JSON.stringify(RQ) === JSON.stringify(D_.RQ), "the game's rules are the server's (world-raidq-data.js)");
check(RQ.SECRET.xp === xpAt(140) - xpAt(120), `the SECRET's XP is Lv 120 → 140 (${RQ.SECRET.xp})`);
check(D_.phaseOf(100, 100) === 1 && D_.phaseOf(59, 100) === 2 && D_.phaseOf(24, 100) === 3, "phases at 60 % / 25 %");
{ const a = itemsOf("secret", "rabc", 120), b = itemsOf("nyxara", "rabc", 320); check(a.length === 3 && a[0].r === 4 && a[0].p === 5 && a[0].lv === 100 && b.length === 1 && b[0].r === 4, "gear: the SECRET three (Legendary +5 …), a queen one");
  check(JSON.stringify(itemsOf("secret", "rx", 120)) === JSON.stringify(itemsOf("secret", "rx", 120)) && /^[a-z0-9]{4,10}$/.test(a[0].id), "the same gear for the same run, save-safe ids"); }
T = Date.parse("2026-10-24T03:00:00Z");
const A = ethers.Wallet.createRandom(), low = ethers.Wallet.createRandom(), G = ethers.Wallet.createRandom();
lvSet(A, 160, "Ace"); lvSet(low, 60, "Low"); lvSet(G, 120, "Gm"); GM_WALLETS.push(G.address.toLowerCase());
check(RQ.OPEN === true, "open to everyone (the owner, 2026-10-25)"); RQ.OPEN = false;
let r = await call(A, "world-rq-start", { mode: "lysitha" }); check(r.status === 403 && !RQ.OPEN, "closed: a player can't start");
r = await call(G, "world-rq-start", { mode: "lysitha" }); check(r.status === 200 && r.body.run, "a GM can (closed)");
RQ.OPEN = true;
r = await call(low, "world-rq-start", { mode: "lysitha" }); check(r.status === 403 && r.body.need === 100, "Lv 60 can't start Lysitha (100+)");
r = await call(A, "world-rq-start", { mode: "solvira" }); check(r.status === 403 && r.body.need === 200, "Lv 160 can't start Solvira (200+)");
r = await call(A, "world-rq-start", { mode: "nope" }); check(r.status === 400, "an unknown run");
r = await call(A, "world-rq-start", { mode: "lysitha" }); const run1 = r.body.run; check(r.status === 200 && /^r/.test(run1), "Ace starts a run");
T += 60e3; r = await call(A, "world-rq-end", { run: run1, won: true }); check(r.status === 400 && r.body.min === 150, "a win in 60 s is too quick");
r = await call(A, "world-rq-end", { run: run1, won: false }); check(r.status === 200, "a too-quick win leaves the run open (it can still end)");
r = await call(A, "world-rq-end", { run: run1, won: false }); check(r.status === 409, "a run ends once");
r = await call(A, "world-rq-start", { mode: "lysitha" }); const run2 = r.body.run;
T += 200e3; const b0 = (db.get(`worldArclBal/${A.address.toLowerCase()}`) || {}).bal || 0;
r = await call(A, "world-rq-end", { run: run2, won: true });
check(r.status === 200 && r.body.xp === xpOf("lysitha", 160) && r.body.items.length === 2 && r.body.arcl === 3000 && r.body.first && r.body.best, `the day's first win: XP ${r.body.xp}, a piece + the bonus piece, 2,000 × 1.5 ARCL, a best time`);
check(((db.get(`worldArclBal/${A.address.toLowerCase()}`) || {}).bal || 0) - b0 === 3000, "the ARCL is credited (outside the daily cap)");
check(r.body.rank === 1, "the week's board: first place");
{ const tb = (await W.read(new URL("https://x/api/social?world=rq-top&mode=lysitha"))).body; check(tb.top.length === 1 && tb.top[0].name === "Ace" && tb.top[0].t === r.body.t && !("id" in tb.top[0]), "rq-top: the week's fastest, the name, no full wallet"); }
check((db.get(`worldXpGrant/${A.address.toLowerCase()}`) || {}).n === r.body.xp, "the XP is granted for the next save");
r = await call(A, "world-rq-start", { mode: "lysitha" }); check(r.status === 200, "the third run of the day"); { const r3 = r.body.run; T += 160e3; r = await call(A, "world-rq-end", { run: r3, won: true }); check(r.status === 200 && r.body.items.length === 1 && r.body.arcl === 2000 && !r.body.first, "a second win the same day: no bonus"); }
r = await call(A, "world-rq-start", { mode: "lysitha" }); check(r.status === 429, "a fourth is refused (three a day)");
let v = await view(A); check(v.day.used === 3 && v.day.max === 3 && v.clears.lysitha === 2 && v.best.lysitha >= 150 && v.firstDone.includes("lysitha"), "the view: 3/3 used, the clears, the best time, today's first done");
T += 864e5; r = await call(A, "world-rq-start", { mode: "lysitha" }); check(r.status === 200, "the next Seoul day: runs again");
// the XP grant: a save past the pace takes it, once
{ const w = A.address.toLowerCase(), sv = db.get(`worldSave/${w}`); sv.at = T - 60e3; sv.xb = 0; db.set(`worldSave/${w}`, sv); T += 9000;
  const grant = db.get(`worldXpGrant/${w}`).n, want = sv.xp + grant, S = await sign(A);
  const rs = await W.handle({ action: "world-save", ...S, data: { xp: want, xpv: XP_VERSION, name: "Ace", char: "kk-knight", rpg: { eq: {}, bag: [], store: [] } } });
  check(rs.status === 200 && db.get(`worldSave/${w}`).xp >= want - 5 && (db.get(`worldXpGrant/${w}`).n || 0) === 0, `the save took the granted XP past the pace (${rs.status})`); }
// the SECRET dungeon
r = await call(A, "world-rq-start", { mode: "secret" }); check(r.status === 402 && r.body.pay && r.body.pay.price === 1000000 && r.body.pay.to === FEE_BURN, "the SECRET asks 1,000,000 $ARCIRCLE");
const tx = "0x" + "ab".repeat(32), amt = (1000000n * 10n ** 18n).toString(16).padStart(64, "0");
RC.set(tx, { status: "0x1", logs: [{ address: ARCIRCLE, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(A.address), pad(FEE_BURN)], data: "0x" + amt }] });
r = await call(A, "world-rq-buy", { tx }); check(r.status === 200 && r.body.tickets === 1, "a transfer of 1,000,000 to FeeBurn: one ticket");
r = await call(A, "world-rq-buy", { tx }); check(r.status === 409, "the same transaction can't buy twice");
const tx2 = "0x" + "cd".repeat(32); RC.set(tx2, { status: "0x1", logs: [{ address: ARCIRCLE, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(A.address), pad(FEE_BURN)], data: "0x" + (5000n * 10n ** 18n).toString(16).padStart(64, "0") }] });
r = await call(A, "world-rq-buy", { tx: tx2 }); check(r.status === 400, "5,000 isn't enough");
r = await call(A, "world-rq-buy", { tx: "0x" + "ef".repeat(32) }); check(r.status === 202, "an unconfirmed transaction: wait");
r = await call(A, "world-rq-start", { mode: "secret" }); const sr = r.body.run; check(r.status === 200, "the ticket starts the SECRET (outside the three a day)");
v = await view(A); check(v.tickets === 0, "the ticket is used");
T += 90e3; r = await call(A, "world-rq-end", { run: sr, won: true });
check(r.status === 200 && r.body.xp === 410010 && r.body.items.length === 4 && r.body.arcl === 0, "the SECRET's win: 410,010 XP and three pieces (+1 the day's first)");
r = await call(G, "world-rq-start", { mode: "secret" }); check(r.status === 200, "a GM enters the SECRET free");
r = await call(low, "world-rq-start", { mode: "secret" }); check(r.status === 403 && r.body.need === 70, "the SECRET needs Lv 70");
r = await call(A, "world-rq-start", { mode: "lysitha" }); const lost = r.body.run; T += 30e3; r = await call(A, "world-rq-end", { run: lost, won: false }); check(r.status === 200 && !r.body.won, "a lost run ends with nothing");
// the Throne of Three (Lv 400): the three queens at once, two pieces, counted in the three a day
{ const H = ethers.Wallet.createRandom(); lvSet(H, 399, "Hana");
  r = await call(H, "world-rq-start", { mode: "throne" }); check(r.status === 403 && r.body.need === 400, "the Throne needs Lv 400");
  lvSet(H, 410, "Hana"); r = await call(H, "world-rq-start", { mode: "throne" }); const tr = r.body.run; check(r.status === 200 && r.body.mode === "throne", "Lv 410 starts the Throne of Three");
  T += 120e3; r = await call(H, "world-rq-end", { run: tr, won: true, kills: 60 }); check(r.status === 400, "a Throne win needs its 3 minutes");
  T += 70e3; r = await call(H, "world-rq-end", { run: tr, won: true, kills: 60 }); check(r.status === 200 && r.body.items.length === 3 && r.body.arcl === 12000 && r.body.xp === xpOf("throne", 410), `the Throne's first win today: ${r.body.xp} XP, two pieces + one, 8,000 × 1.5 ARCL`);
  check((await view(H)).day.used === 1, "the Throne counts in the three a day"); }
check(seoulDay(Date.parse("2026-10-24T14:59:00Z")) === "2026-10-24" && seoulDay(Date.parse("2026-10-24T15:00:00Z")) === "2026-10-25", "the Seoul day turns at 15:00 UTC");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
