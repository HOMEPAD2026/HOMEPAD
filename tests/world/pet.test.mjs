// pet.test.mjs — pet eggs (api/_world-shop.mjs PET): 3,000 $ARCIRCLE, rolled on the server, pity, duplicates, the cap, free eggs.
// Run: node tests/world/pet.test.mjs (needs ethers 6)
import { ethers } from "ethers";
import fs from "node:fs";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { FEE_BURN, ARCIRCLE, PET, petRoll, FREE_EGG_SOURCES, CATALOG } = await import("../../api/_world-shop.mjs");
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
const sign = async () => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)), ep: 2 }; };
const pad = (a) => "0x" + a.replace(/^0x/, "").padStart(64, "0"), TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
db.set(`worldSave_e2/${me}`, { xp: 0, xpv: 2, name: "p", at: T - 60e3 });
const own = () => db.get(`worldOwn_e2/${me}`) || {};

// the table: 27 species, the odds, the client's copy
const all = PET.species.flat();
check(all.length === 27 && new Set(all).size === 27, "27 species, each once");
check(PET.odds.join() === "60,25,10,4,1" && PET.price === 3000 && PET.max === 30 && PET.pityAt === 10, "3000 $ARCIRCLE, 60/25/10/4/1, pity at 10, own up to 30");
const egg = CATALOG.find((x) => x.id === "petegg");
check(egg && egg.tokens === 3000 && egg.arcl == null && egg.usd == null, "the egg is $ARCIRCLE only (not ARCL), 3000");
{ const src = fs.readFileSync(new URL("../../world-rpg-data.js", import.meta.url), "utf8");
  const ids = [...src.matchAll(/\{ id: "([a-z]+)", r: (\d),/g)].map((m) => [m[1], +m[2]]);
  check(ids.length === 27 && ids.every(([id, r]) => PET.species[r].includes(id)), "the client's PET_SPECIES has the same ids and rarities"); }

// odds: 200,000 rolls with no pity in play: each rarity's share within 1 point of the odds (a Rare-or-better egg
// guaranteed every 10th lifts the share of Rare+ over a long run, checked below)
{ const n = 200000, c = [0, 0, 0, 0, 0], sp = new Set();
  for (let i = 0; i < n; i++) { const k = petRoll(0); c[k.r]++; sp.add(k.s); }
  const p = c.map((x) => x / n * 100);
  check(PET.odds.every((o, r) => Math.abs(p[r] - o) < 1), "odds hold: " + p.map((x) => x.toFixed(1)).join(" / ") + " %");
  check(sp.size === 27, "every species comes up"); }
{ let pity = 0; const n = 200000; let rare = 0, run = 0, worst = 0;
  for (let i = 0; i < n; i++) { const k = petRoll(pity); pity = k.pity; if (k.r >= 2) { rare++; run = 0; } else worst = Math.max(worst, ++run); }
  check(worst <= 9, "never more than 9 eggs in a row without a Rare or better (worst run " + worst + ")");
  check(rare / n > 0.15 && rare / n < 0.2, "with the pity count Rare or better is " + (rare / n * 100).toFixed(1) + " % of eggs"); }
// pity: nine bad eggs, the tenth is Rare+ whatever the dice say (dice that always say "Common")
{ let pity = 0, last = null; for (let i = 0; i < 10; i++) { last = petRoll(pity, () => 0.0); pity = last.pity; if (i < 9) check(last.r === 0, `egg ${i + 1} with the worst dice: Common`); }
  check(last.r >= 2 && pity === 0, "the 10th egg is Rare or better and the counter starts over"); }

// the paid egg: quote 3,000, the Transfer to FeeBurn, one roll stored in worldOwn.pets
const buy = async (i) => {
  const q = (await W.handle({ action: "world-pay-quote", ...(await sign()), item: "petegg" })).body;
  if (!q.ok) return { q };
  const H = "0x" + i.toString(16).padStart(64, "0");
  receipts[H] = { status: "0x1", logs: [{ address: ARCIRCLE, topics: [TR, pad(me), pad(FEE_BURN)], data: "0x" + BigInt(q.amount).toString(16) }] };
  return { q, r: await W.handle({ action: "world-pay-confirm", ...(await sign()), quote: q.quote, tx: H }) };
};
T += 10e3; const b = await buy(1);
check(b.q.ok && b.q.tokens === 3000 && BigInt(b.q.amount) === 3000n * 10n ** 18n, "the quote: 3,000 $ARCIRCLE");
check(b.r.status === 200 && b.r.body.own.pets.list.length === 1 && b.r.body.own.pets.n === 1, "paid: one pet kept");
const card = b.r.body.own.pets.fresh[0];
check(card && card.gid && card.s === b.r.body.own.pets.list[0].s && card.r === PET.species.findIndex((l) => l.includes(card.s)) && !card.dup, "the reveal card names the species and rarity");
check((await W.handle({ action: "world-arcl-spend", ...(await sign()), item: "petegg" })).status === 400, "not sold for ARCL");
{ const q = (await W.handle({ action: "world-pay-quote", ...(await sign()), item: "petegg" })).body; const r = await W.handle({ action: "world-pay-confirm", ...(await sign()), quote: q.quote, tx: "0x" + (1).toString(16).padStart(64, "0") });
  check(r.status !== 200, "a used transaction buys nothing"); }
// many eggs: duplicates become XP; never more than 27 different pets
{ for (let i = 2; i <= 60; i++) { T += 4e3; await buy(i); }
  const P = own().pets, owned = new Set(P.list.map((x) => x.s));
  check(P.n === 60 && P.list.length === owned.size && owned.size <= 27 && owned.size > 12, `60 eggs: ${owned.size} different pets`);
  const xp = P.list.reduce((a, x) => a + (x.x || 0), 0);
  check(xp >= (60 - owned.size) * PET.dupXp[0] && P.list.every((x) => x.x <= PET.xpCap), `the ${60 - owned.size} duplicates became pet XP (${xp})`);
  check(P.fresh.length <= 5 && P.pity >= 0 && P.pity < 10, "only the last 5 reveal cards are kept"); }
// the cap: 30 pets and the shop refuses another egg
{ const o = own(); const keep = o.pets.list; o.pets.list = Array.from({ length: 30 }, (_, i) => ({ s: "x" + i, x: 0 })); db.set(`worldOwn_e2/${me}`, o);
  const q = (await W.handle({ action: "world-pay-quote", ...(await sign()), item: "petegg" })).body;
  check(!q.ok && /30 pets/.test(q.error), "at 30 pets: no more eggs sold");
  const r = await W.handle({ action: "world-arcl-claim", ...(await sign()), kind: "petegg-free", source: "quest:cap" });
  check(r.status === 400, "at 30 pets: no free egg either");
  o.pets.list = keep; db.set(`worldOwn_e2/${me}`, o); }

// free eggs: once per source
{ const n0 = own().pets.n;
  check((await W.handle({ action: "world-arcl-claim", ...(await sign()), kind: "petegg-free", source: "quest:x" })).status === 400, "a source nobody vouches for: refused");
  FREE_EGG_SOURCES.push([/^quest:[a-z0-9-]+$/, async () => true]);
  const r1 = await W.handle({ action: "world-arcl-claim", ...(await sign()), kind: "petegg-free", source: "quest:first-hunt" });
  const r2 = await W.handle({ action: "world-arcl-claim", ...(await sign()), kind: "petegg-free", source: "quest:first-hunt" });
  check(r1.status === 200 && r1.body.card && own().pets.n === n0 + 1, "a free egg from a source");
  check(r2.status === 409 && own().pets.n === n0 + 1, "the same source again: nothing");
  const r3 = await W.handle({ action: "world-arcl-claim", ...(await sign()), kind: "petegg-free", source: "quest:other" });
  check(r3.status === 200 && own().pets.n === n0 + 2, "another source: another egg"); FREE_EGG_SOURCES.pop(); }
// day 7 of the check-in
{ const n0 = own().pets.n; let eggs = 0;
  for (let d = 1; d <= 8; d++) {
    T += 24 * 3600e3; const r = await W.handle({ action: "world-arcl-claim", ...(await sign()), kind: "daily" });
    if (r.body.petegg) eggs++;
    if (d === 6) check(r.status === 200 && !r.body.petegg && own().pets.n === n0, "day 6: no egg yet");
    if (d === 7) check(r.body.petegg && r.body.streak === 7 && own().pets.n === n0 + 1, "day 7: a free egg comes with the check-in");
  }
  check(eggs === 1 && own().pets.n === n0 + 1, "only that one day"); }
console.log(`${ok} pass ${bad} fail`);
if (bad) process.exit(1);
