// starter.test.mjs — the season's Starter Package (api/_world-shop.mjs STARTER), bought with $ARCIRCLE.
// Run: node tests/world/starter.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { FEE_BURN, ARCIRCLE, STARTER } = await import("../../api/_world-shop.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.set) db.set(w.set, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; db.set(w.inc, d); } } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Date.parse("2026-10-14T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const w = ethers.Wallet.createRandom(), me = w.address.toLowerCase();
const receipts = {};
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, arcPrice: async () => 0.002, receipt: async (h) => receipts[h] || null, phase: { phase: "obt", epoch: 2 } });
const issued = new Date(T).toISOString(), S = { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)), ep: 2 };
const pad = (a) => "0x" + a.replace(/^0x/, "").padStart(64, "0"), TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const view = async () => (await W.read(new URL("http://x/?world=starter&wallet=" + me))).body;
let v = await view();
check(v.season === STARTER.season && v.bought === 0 && v.next === 30000 && v.max === 3, "before buying: Season " + v.season + ", next price 30,000");
db.set(`worldSave_e2/${me}`, { xp: 0, xpv: 2, name: "p", at: T - 60e3 });
const buy = async (i) => {
  const q = (await W.handle({ action: "world-pay-quote", ...S, item: "starter" })).body;
  if (!q.ok) return { q };
  const H = "0x" + String(i).repeat(64).slice(0, 64);
  receipts[H] = { status: "0x1", logs: [{ address: ARCIRCLE, topics: [TR, pad(me), pad(FEE_BURN)], data: "0x" + BigInt(q.amount).toString(16) }] };
  return { q, r: await W.handle({ action: "world-pay-confirm", ...S, quote: q.quote, tx: H }) };
};
const prices = [];
for (let i = 1; i <= 3; i++) { T += 10e3; const { q, r } = await buy(i); prices.push(q.tokens); check(r && r.status === 200, `buy ${i}: confirmed`); }
check(prices.join() === "30000,40000,50000", "prices rise: " + prices.join(" / "));
const o = db.get(`worldOwn_e2/${me}`) || {};
check(o.starter && o.starter.n === 3 && o.starter.season === STARTER.season && o.starter.gifts.length === 3, "three gifts kept for the game");
check(o.starter.gifts.every((g) => g.hp === 100 && g.item.r === 4 && /^(weapon|shield|armor|helm|ring|boots|necklace)-[1-4]$/.test(g.item.b) && g.item.lv >= 15 && /^[a-z0-9]{4,10}$/.test(g.item.id) && g.gid), "each: a Legendary piece (tier you can wear, Lv 15+) and 100 potions");
check(Math.abs(o.xpBoostUntil - (T + 72 * 3600e3)) < 60e3, "2× EXP: 24 hours a buy, added up (72 h)");
const { q } = await buy(4);
check(!q.ok && /3 times/.test(q.error), "a 4th buy this season: refused");
check((await W.handle({ action: "world-arcl-spend", ...S, item: "starter" })).status === 400, "not sold for ARCL");
v = await view(); check(v.bought === 3 && v.next === null && v.boostUntil === o.xpBoostUntil, "the view: 3 bought, nothing next, the boost's end");
// the boost on the server: the XP allowance doubles while it runs
{ const SRV = await import("../../api/_world-social.mjs");
  T += 9e3; await W.handle({ action: "world-save", ...S, data: { xp: 0, xpv: 2, ep: 2 } });
  T += 30 * 60e3; const base = db.get(`worldSave_e2/${me}`).xp;
  await W.handle({ action: "world-save", ...S, data: { xp: base + 1e7, xpv: 2, ep: 2 } });
  const got = db.get(`worldSave_e2/${me}`).xp - base, cap1 = SRV.xpBankCap(SRV.levelOfXp(base));
  check(got > cap1 && got <= cap1 * 2, `2× EXP: the save may add twice the usual allowance (${got} vs ${cap1})`); }
console.log(`${ok} pass ${bad} fail`);
if (bad) process.exit(1);
