// shop.test.mjs — the World API (shop) against an in-memory store. Run: node tests/world/shop.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { FEE_BURN, ARCIRCLE, DAILY_CAP } = await import("../../api/_world-shop.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; db.set(w.inc, d); } } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Date.parse("2026-10-11T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const w = ethers.Wallet.createRandom(), me = w.address.toLowerCase();
const COIN = "0x" + "c".repeat(40);
let bal = 0n, receipts = {};
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T,
  launchRecord: async (c) => (c === COIN ? { creator: me, symbol: "CCC" } : null),
  tokenBalance: async () => bal, arcPrice: async () => 0.002, receipt: async (h) => receipts[h] || null });
const issued = new Date(T).toISOString(), sig = await w.signMessage(loginMessage(w.address, issued)), S = { wallet: w.address, issued, signature: sig };
const arcl = async () => (await W.read(new URL("http://x/?world=arcl&wallet=" + me))).body;
let r = await W.handle({ action: "world-arcl-claim", ...S, kind: "daily" });
check(r.status === 200 && r.body.credited === 20 && r.body.streak === 1, "daily check-in: 20 ARCL, streak 1");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "daily" }); check(r.status === 409, "twice the same day: refused");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "stage:phisher", answer: 0 }); check(r.status === 400, "wrong answer: no ARCL");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "stage:phisher", answer: 1 }); check(r.status === 200 && r.body.credited === 30, "beat the Phisher: 30");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "stage:phisher", answer: 1 }); check(r.status === 409, "only once");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "hold" }); check(r.status === 400, "no $ARCIRCLE: no hold reward");
bal = 5n; r = await W.handle({ action: "world-arcl-claim", ...S, kind: "hold" }); check(r.status === 200 && r.body.credited === 50, "holding: 50");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "launch", coin: "0x" + "d".repeat(40) }); check(r.status === 400, "someone else's coin: refused");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "launch", coin: COIN }); check(r.status === 200 && r.body.credited === 100, "launched a coin: 100");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "isle20" }); check(r.status === 400, "no island yet: refused");
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "free-money" }); check(r.status === 400, "unknown kind: refused");
let a = await arcl(); check(a.bal === 200 && a.today === 200 && a.got.includes("hold"), "balance 200, today 200: " + JSON.stringify({ bal: a.bal, today: a.today }));
for (const id of ["airdrop", "honeypot", "doppel", "golem"]) await W.handle({ action: "world-arcl-claim", ...S, kind: "stage:" + id, answer: 1 });
a = await arcl(); check(a.bal === DAILY_CAP && a.today === DAILY_CAP, "the daily cap holds: " + a.bal);
r = await W.handle({ action: "world-arcl-claim", ...S, kind: "stage:dragon", answer: 1 }); check(r.status === 200 && r.body.credited === 0 && r.body.capped, "over the cap: nothing more today");
T += 864e5; const iss2 = new Date(T).toISOString(), S2 = { wallet: w.address, issued: iss2, signature: await w.signMessage(loginMessage(w.address, iss2)) };
r = await W.handle({ action: "world-arcl-claim", ...S2, kind: "daily" }); check(r.body.streak === 2 && r.body.credited === 25, "next day: streak 2, 25 ARCL");
// spending
r = await W.handle({ action: "world-arcl-spend", ...S2, item: "isle48" }); check(r.status === 400 && /not enough/.test(r.body.error), "not enough ARCL for the expansion");
r = await W.handle({ action: "world-arcl-spend", ...S2, item: "brick-wood" }); check(r.status === 200 && r.body.bal === 25 && r.body.own.items.includes("brick-wood"), "wood brick for 300 ARCL");
T += 4000; r = await W.handle({ action: "world-arcl-spend", ...S2, item: "brick-wood" }); check(r.status === 400 && /already/.test(r.body.error), "can't buy it twice");
r = await W.handle({ action: "world-arcl-spend", ...S2, item: "billboard", target: COIN }); check(r.status === 400, "billboard is $ARCIRCLE only");
// paying in $ARCIRCLE
r = await W.handle({ action: "world-pay-quote", ...S2, item: "isle64" }); check(r.status === 400 && /48/.test(r.body.error), "64 needs 48 first");
r = await W.handle({ action: "world-pay-quote", ...S2, item: "isle48" });
check(r.status === 200 && r.body.to === FEE_BURN && r.body.tokens === 1500, "quote: $3 at $0.002 = 1,500 $ARCIRCLE to FeeBurn");
const q = r.body, amt = BigInt(q.amount), pad = (x) => "0x" + x.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", H = "0x" + "ab".repeat(32), H2 = "0x" + "cd".repeat(32);
receipts[H2] = { status: "0x1", logs: [{ address: ARCIRCLE, topics: [TR, pad(me), pad(FEE_BURN)], data: "0x" + (amt / 2n).toString(16) }] };
r = await W.handle({ action: "world-pay-confirm", ...S2, quote: q.quote, tx: H2 }); check(r.status === 400 && /less/.test(r.body.error), "paid too little: refused");
r = await W.handle({ action: "world-pay-confirm", ...S2, quote: q.quote, tx: H }); check(r.status === 202, "not mined yet: pending");
receipts[H] = { status: "0x1", logs: [{ address: ARCIRCLE, topics: [TR, pad(me), pad(FEE_BURN)], data: "0x" + amt.toString(16) }] };
r = await W.handle({ action: "world-pay-confirm", ...S2, quote: q.quote, tx: H }); check(r.status === 200 && r.body.own.items.includes("isle48") && BigInt(r.body.burned) === amt / 2n, "paid: island 48, half burned");
r = await W.handle({ action: "world-pay-confirm", ...S2, quote: q.quote, tx: H }); check(r.status === 409, "the same payment can't be used twice");
r = await W.handle({ action: "world-pay-quote", ...S2, item: "billboard", target: COIN }); const q2 = r.body;
const H3 = "0x" + "ef".repeat(32); receipts[H3] = { status: "0x1", logs: [{ address: ARCIRCLE, topics: [TR, pad(me), pad(FEE_BURN)], data: "0x" + BigInt(q2.amount).toString(16) }] };
r = await W.handle({ action: "world-pay-confirm", ...S2, quote: q2.quote, tx: H3 }); check(r.status === 200, "billboard bought");
const pz = (await W.read(new URL("http://x/?world=plaza"))).body; check(pz.coin && pz.coin.token === COIN && pz.coin.symbol === "CCC", "the plaza billboard shows the coin");
// the island size now allows 48
const isle48 = Buffer.from([1, 48, 40, 0, 40, 0, 0]).toString("base64");
r = await W.handle({ action: "world-island-save", ...S2, data: isle48, name: "kmp", theme: "style-grass" }); check(r.status === 200, "a 48×48 island saves now");
r = await W.read(new URL("http://x/?world=island&wallet=" + me)); check(r.body.theme === "", "a style you don't own isn't kept");
r = await W.handle({ action: "world-pay-quote", ...S2, item: "style-volcano" }); const q3 = r.body; check(r.status === 200 && q3.tokens === 40000, "volcano style: $80 = 40,000 $ARCIRCLE");
const H4 = "0x" + "12".repeat(32); receipts[H4] = { status: "0x1", logs: [{ address: ARCIRCLE, topics: [TR, pad(me), pad(FEE_BURN)], data: "0x" + BigInt(q3.amount).toString(16) }] };
r = await W.handle({ action: "world-pay-confirm", ...S2, quote: q3.quote, tx: H4 }); check(r.status === 200 && r.body.own.items.includes("style-volcano"), "volcano style bought");
T += 30000; r = await W.handle({ action: "world-island-save", ...S2, data: isle48, name: "kmp", theme: "style-volcano" }); check(r.status === 200, "saved with the style " + JSON.stringify(r.body));
r = await W.read(new URL("http://x/?world=island&wallet=" + me)); check(r.body.theme === "style-volcano", "the island keeps its style");
const top = (await W.read(new URL("http://x/?world=arcl-top"))).body; check(top.top[0].n >= 25 && !top.top[0].id, "weekly top (short address only)");
r = await W.handle({ action: "world-arcl-notify", ...S2, on: true }); a = await arcl(); check(a.notify === true && a.exchange.open === false, "notify on; the exchange stays closed");
// the streets: small, spaced out, 10 a day
T += 864e5 * 2; const iss3 = new Date(T).toISOString(), S3 = { wallet: w.address, issued: iss3, signature: await w.signMessage(loginMessage(w.address, iss3)) };
r = await W.handle({ action: "world-arcl-claim", ...S3, kind: "street" }); check(r.status === 200 && r.body.credited === 5, "a street scammer: 5 ARCL");
r = await W.handle({ action: "world-arcl-claim", ...S3, kind: "street" }); check(r.status === 429, "right after: too fast");
let st = 1; for (let i = 0; i < 12; i++) { T += 13000; r = await W.handle({ action: "world-arcl-claim", ...S3, kind: "street" }); if (r.body.credited) st++; }
check(st === 10, "10 street scammers a day: " + st);
T += 7000; r = await W.handle({ action: "world-arcl-claim", ...S3, kind: "pickup" }); check(r.status === 200 && r.body.credited === 2, "a street coin: 2 ARCL");
a = await arcl(); check(!a.got.includes("street") && a.earn.some((e) => e.kind === "street"), "street claims repeat (not one-time), and they're listed");
// revive: a fixed 10,000 $ARCIRCLE, any price
r = await W.handle({ action: "world-pay-quote", ...S3, item: "revive" }); check(r.status === 200 && r.body.tokens === 10000 && r.body.to === FEE_BURN, "revive: 10,000 $ARCIRCLE to FeeBurn");
const qr = r.body, H5 = "0x" + "34".repeat(32); receipts[H5] = { status: "0x1", logs: [{ address: ARCIRCLE, topics: [TR, pad(me), pad(FEE_BURN)], data: "0x" + BigInt(qr.amount).toString(16) }] };
r = await W.handle({ action: "world-pay-confirm", ...S3, quote: qr.quote, tx: H5 }); check(r.status === 200 && r.body.own.revives === 1 && !r.body.own.items.includes("revive") && BigInt(r.body.burned) === 5000n * 10n ** 18n, "revived: 5,000 burned, 5,000 to the treasury");
r = await W.handle({ action: "world-pay-quote", ...S3, item: "revive" }); check(r.status === 200, "revive can be bought again");
// the Forge and the hunting grounds
T += 864e5; const iss4 = new Date(T).toISOString(), S4 = { wallet: w.address, issued: iss4, signature: await w.signMessage(loginMessage(w.address, iss4)) };
r = await W.handle({ action: "world-forge-buy", ...S4, item: "weapon:2" }); check(r.status === 400 && /level 10/.test(r.body.error), "Forge: rare gear needs level 10");
db.set(`worldSave/${me}`, { xp: 1250, name: "kmp" });
r = await W.handle({ action: "world-forge-buy", ...S4, item: "nope:9" }); check(r.status === 400, "Forge: unknown item");
await store.commit([{ inc: `worldArclBal/${me}`, fields: { bal: 1000 } }]); let b0 = (await arcl()).bal;
r = await W.handle({ action: "world-forge-buy", ...S4, item: "weapon:2" }); check(r.status === 200 && r.body.item.b === "weapon-2" && r.body.item.r === 2 && r.body.bal === b0 - 300, "Forge: a rare weapon for 300 ARCL " + JSON.stringify(r.body).slice(0, 200) + " b0=" + b0);
T += 4000; r = await W.handle({ action: "world-forge-buy", ...S4, item: "hp5" }); check(r.status === 200 && r.body.supply.kind === "hp" && r.body.supply.n === 5, "Forge: 5 health potions");
T += 4000; r = await W.handle({ action: "world-forge-buy", ...S4, item: "weapon:3" }); check(r.status === 400 && /level 15/.test(r.body.error), "Forge: epic needs level 15 (saved level 13)");
r = await W.handle({ action: "world-arcl-claim", ...S4, kind: "hunt", tier: 4 }); check(r.status === 400, "hunt tier 4 needs level 15");
r = await W.handle({ action: "world-arcl-claim", ...S4, kind: "hunt", tier: 3 }); check(r.status === 200 && r.body.credited === 10, "hunt tier 3: 10 ARCL");
r = await W.handle({ action: "world-arcl-claim", ...S4, kind: "boss", zone: 2 }); check(r.status === 200 && r.body.credited === 30, "a boss in Honeypot Swamp: 30 ARCL");
r = await W.handle({ action: "world-arcl-claim", ...S4, kind: "boss", zone: 3 }); check(r.status === 400, "Rug Canyon's boss needs level 15");
// the character's gear is saved and checked
T += 60000; r = await W.handle({ action: "world-save", ...S4, data: { xp: 1260, name: "kmp", rpg: { eq: { weapon: { id: "abc123", b: "weapon-2", r: 2, lv: 10, p: 3 }, shield: { id: "x", b: "bad" } }, bag: [{ id: "def456", b: "ring-1", r: 9, lv: 999, p: 50 }], scrap: 120, hp: 4, sp: 2 } } });
const sv = db.get(`worldSave/${me}`); check(r.status === 200 && sv.rpg.eq.weapon.p === 3 && !sv.rpg.eq.shield && sv.rpg.bag[0].r === 4 && sv.rpg.bag[0].lv === 60 && sv.rpg.bag[0].p === 10 && sv.rpg.scrap === 120, "gear saved; bad pieces dropped, numbers clamped");
// this week's hunters and the drop feed
{ const u = new URL("http://x/api/social?world=hunt-top"); const h = await W.read(u); const top = h.body.top; check(top.length >= 1 && top[0].n >= 13 && top[0].name === "kmp", "hunt-top: hunt tier 3 (3) + boss (10) = 13 points " + JSON.stringify(top)); }
T += 61000; r = await W.handle({ action: "world-feed-drop", ...S4, b: "ring-4", r: 4 }); check(r.status === 200 && r.body.ok, "a Legendary goes in the feed");
r = await W.handle({ action: "world-feed-drop", ...S4, b: "ring-4", r: 4 }); check(r.status === 429, "the feed: one a minute");
T += 61000; r = await W.handle({ action: "world-feed-drop", ...S4, b: "ring-1", r: 1 }); check(r.status === 400, "the feed: Uncommon doesn't go in");
{ const h = await W.read(new URL("http://x/?world=drops")); check(h.body.drops.length === 1 && h.body.drops[0].b === "ring-4" && h.body.drops[0].name === "kmp", "drops view " + JSON.stringify(h.body)); }
// selling gear to the Forge
{
  const a0 = (await arcl()).bal;
  r = await W.handle({ action: "world-sell", ...S4, item: { id: "sel001", b: "weapon-2", r: 2, lv: 10, p: 2 } });
  check(r.status === 200 && r.body.credited === 50 && r.body.bal === a0 + 50, "sell a Rare +2: 45 × 1.10 = 50 ARCL " + JSON.stringify(r.body).slice(0, 160));
  r = await W.handle({ action: "world-sell", ...S4, item: { id: "sel001", b: "weapon-2", r: 2, lv: 10, p: 2 } });
  check(r.status === 409, "the same piece can't be sold twice");
  r = await W.handle({ action: "world-sell", ...S4, item: { id: "sel002", b: "ring-4", r: 4, lv: 22, p: 0 } });
  check(r.status === 200 && r.body.credited === 100 && r.body.capped, "a Legendary (260) is cut to the 150-a-day cap: +100");
  r = await W.handle({ action: "world-sell", ...S4, item: { id: "sel003", b: "helm-0", r: 0, lv: 1, p: 0 } });
  check(r.status === 200 && r.body.credited === 0 && r.body.capped, "after the cap: nothing more today");
  r = await W.handle({ action: "world-sell", ...S4, item: { id: "x", b: "sword-9", r: 4 } });
  check(r.status === 400, "not gear: refused");
  r = await W.handle({ action: "world-arcl-claim", ...S4, kind: "sell" });
  check(r.status === 400, "sell isn't a claim");
}
console.log(ok, "pass", bad, "fail");
if (bad) process.exit(1); process.exit(bad ? 1 : 0);
