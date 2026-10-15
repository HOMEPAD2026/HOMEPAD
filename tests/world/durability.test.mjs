// durability.test.mjs — Epic and Legendary gear wears out; broken pieces; the Magic Forge's server rules.
// Run: node tests/world/durability.test.mjs (needs ethers 6)
import { ethers } from "ethers";
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

// ---- a minimal browser, enough for world-rpg.js to build its (hidden) sheet ----
const mkEl = () => { const el = { style: { setProperty() {} }, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, children: [], hidden: false,
  appendChild(c) { return c; }, addEventListener() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], remove() {}, closest: () => null, getBoundingClientRect: () => ({}), set innerHTML(v) {}, get innerHTML() { return ""; } }; return el; };
globalThis.document = { createElement: mkEl, body: mkEl(), documentElement: mkEl(), querySelector: () => null, addEventListener() {} };
globalThis.matchMedia = () => ({ matches: false }); globalThis.localStorage = { getItem: () => null, setItem() {} }; globalThis.innerWidth = 800; globalThis.innerHeight = 600;
const RD = await import("../../world-rpg-data.js");
const { DUR_MAX, REPAIR_PRICE, REPAIR_FREE_DAY, durOf, isBroken, durMax, statsOf, itemStats } = RD;

// ---- the data: absent = full, only r >= 3 ----
{ const e = { id: "e1", b: "weapon-3", r: 3, lv: 15, p: 0 }, l = { id: "l1", b: "weapon-4", r: 4, lv: 20, p: 0 }, c = { id: "c1", b: "weapon-0", r: 2, lv: 1, p: 0 };
  check(DUR_MAX[3] === 300 && DUR_MAX[4] === 500, "Epic 300, Legendary 500");
  check(durOf(e) === 300 && durOf(l) === 500 && durOf(c) === null, "no du = full; Rare and below don't wear");
  check(durOf({ ...e, du: 12 }) === 12 && isBroken({ ...e, du: 0 }) && !isBroken(e) && !isBroken(c) && !isBroken({ ...c, du: 0 }), "du 0 = broken (never for r < 3)");
  check(REPAIR_PRICE[3] === 500 && REPAIR_PRICE[4] === 1500 && REPAIR_FREE_DAY === 3, "repair prices 500 / 1500 $ARCIRCLE, 3 free a day");
  const s1 = statsOf(10, { weapon: e }), s2 = statsOf(10, { weapon: { ...e, du: 0 } }), s0 = statsOf(10, {});
  check(s1.atk > s0.atk && s2.atk === s0.atk && s2.sets.length === 0, "a broken piece gives no stats and no set count"); }

// ---- the game: wear, break, unequip, Equip best ----
const { createRpg } = await import("../../world-rpg.js");
const P = {}, toasts = []; let saves = 0, stat = 0;
const rpg = createRpg({ T: (s, v) => s, lang: "en", esc: (s) => String(s), toast: (m) => toasts.push(m), P, save: () => { saves++; }, level: () => 30, post: async () => ({}), sess: () => null, Snd: {}, freeze() {}, avatar: () => null, onStats: () => { stat++; }, arclRefresh: async () => {}, arclBal: () => 0, own: () => ({}) });
const D = rpg.data();
const piece = (id, b, r, du) => ({ id, b, r, lv: 15, p: 0, ...(du == null ? {} : { du }) });
D.eq.weapon = piece("wpn1", "weapon-3", 3); D.eq.armor = piece("arm1", "armor-3", 4); D.eq.helm = piece("hlm1", "helm-3", 3); D.eq.ring = piece("rng1", "ring-3", 4);
rpg.wear("kill"); rpg.wear("kill");
check(D.eq.weapon.du === 298, "a weapon loses 1 per knock-out");
check(D.eq.armor.du == null && D.eq.ring.du == null, "armor doesn't wear from a kill; rings don't wear at all");
const t0 = 1e6; rpg.wear("hurt", t0); rpg.wear("hurt", t0 + 1000); rpg.wear("hurt", t0 + 2999);
check(D.eq.armor.du === 499 && D.eq.helm.du === 299, "armor and helmet lose 1 for hits within 3 s");
rpg.wear("hurt", t0 + 3000); check(D.eq.armor.du === 498 && D.eq.helm.du === 298, "and again after 3 s");
check(D.eq.ring.du == null, "a ring never wears (not hit gear)");
const sv0 = saves; rpg.wear("kill"); check(saves === sv0 + 1 && stat === 0, "a wear step saves lazily (debounced save, no stats rebuild)");
// down to 0: the weapon breaks, goes to the bag, toasts, gives no stats
D.eq.weapon.du = 1; const atkBefore = rpg.stats().atk; rpg.wear("kill");
check(!D.eq.weapon && D.bag.length === 1 && D.bag[0].id === "wpn1" && D.bag[0].du === 0 && isBroken(D.bag[0]), "at 0 the weapon breaks and moves to the bag");
check(toasts.some((t) => /broke/.test(t)) && rpg.stats().atk < atkBefore, "toast on breaking, and its attack is gone");
// a broken piece can't be equipped, and Equip best skips it
rpg.data().bag.push(piece("wpn2", "weapon-0", 0));
const pl = rpg.planBest(); check(pl.eq.weapon && pl.eq.weapon.id === "wpn2" && !pl.swaps.some((sl) => pl.eq[sl].id === "wpn1"), "Equip best skips the broken weapon (wears the common one)");
D.bag = D.bag.filter((x) => x.id !== "wpn2");
check(rpg.planBest().swaps.length === 0, "with only a broken piece in the bag, nothing to equip");
// a full bag: the piece stays worn, broken, and gives nothing
{ const Pf = {}, rf = createRpg({ T: (s) => s, lang: "en", esc: (s) => String(s), toast: () => {}, P: Pf, save() {}, level: () => 30, post: async () => ({}), sess: () => null, Snd: {}, freeze() {}, avatar: () => null, onStats() {}, arclRefresh: async () => {}, arclBal: () => 0, own: () => ({}) });
  const d = rf.data(); d.eq.weapon = piece("w9", "weapon-3", 3, 1); const bagN = rf.bagSize(); d.bag = Array.from({ length: bagN }, (_, i) => piece("b" + String(i).padStart(3, "0"), "ring-0", 0));
  const a0 = rf.stats().atk; rf.wear("kill");
  check(d.eq.weapon && d.eq.weapon.du === 0 && d.bag.length === bagN && rf.stats().atk < a0, "bag full: the broken piece stays worn but gives no stats"); }

// ---- the server: revert unpaid du increases; a paid credit allows one repair; free repairs 3 a day ----
const { make, loginMessage, cleanSave } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
{ const r = cleanSave({ xpv: 2, rpg: { eq: { weapon: { id: "wpn001", b: "weapon-3", r: 3, lv: 15, p: 0, du: 120 }, armor: { id: "arm001", b: "armor-0", r: 1, lv: 1, p: 0, du: 5 } }, bag: [{ id: "bag001", b: "ring-3", r: 4, lv: 20, p: 0, du: 9999 }, { id: "bag002", b: "ring-3", r: 4, lv: 20, p: 0, du: -3 }], store: [] } }).rpg;
  check(r.eq.weapon.du === 120 && r.eq.armor.du === undefined && r.bag[0].du === undefined && r.bag[1].du === undefined, "cleanItem keeps du 0..max-1 on r >= 3 only"); }
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
const COIN = "0x" + "c".repeat(40); let receipts = {};
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, launchRecord: async () => null, tokenBalance: async () => 0n, arcPrice: async () => 0.002, receipt: async (h) => receipts[h] || null });
const sign = async () => { const iso = new Date(T).toISOString(); return { wallet: w.address, issued: iso, signature: await w.signMessage(loginMessage(w.address, iso)) }; };
const item = (id, b, r, du) => ({ id, b, r, lv: 15, p: 0, ...(du == null ? {} : { du }) });
const save = async (items) => { T += 9000; const S = await sign(); const r = await W.handle({ action: "world-save", ...S, data: { xp: 50, xpv: 2, name: "Aria", char: "kk-knight", rpg: { eq: { weapon: items[0] }, bag: items.slice(1), store: [] } } }); return r; };
const stored = () => db.get("worldSave/" + me).rpg, find = (id) => [...Object.values(stored().eq), ...stored().bag].find((x) => x.id === id);
let r = await save([item("wpn001", "weapon-3", 3, 100), item("arm001", "armor-4", 4, 0), item("rng001", "ring-1", 1)]);
check(r.status === 200 && find("wpn001").du === 100 && find("arm001").du === 0, "wear (a lower du) saves as is");
r = await save([item("wpn001", "weapon-3", 3, 40), item("arm001", "armor-4", 4, 0)]); check(find("wpn001").du === 40, "going down further is fine");
// a client that raises du with no credit: put back
r = await save([item("wpn001", "weapon-3", 3, 300), item("arm001", "armor-4", 4)]);
check(find("wpn001").du === 40 && find("arm001").du === 0, "unpaid repairs (a raised du, or du removed) are undone");
check(!db.get("worldOwn/" + me), "...and no credit was consumed");
// paid credit for ONE piece
db.set("worldOwn/" + me, { items: [], repairIds: ["wpn001"] });
r = await save([item("wpn001", "weapon-3", 3), item("arm001", "armor-4", 4)]);
check(find("wpn001").du === undefined && find("arm001").du === 0, "a paid credit repairs that piece (full again) and not another");
check((db.get("worldOwn/" + me).repairIds || []).length === 0, "the credit is used up");
r = await save([item("wpn001", "weapon-3", 3, 7), item("arm001", "armor-4", 4)]); r = await save([item("wpn001", "weapon-3", 3), item("arm001", "armor-4", 4)]);
check(find("wpn001").du === 7, "one credit, one repair: the next unpaid one is undone");
// credit for the wrong piece doesn't help
db.set("worldOwn/" + me, { items: [], repairIds: ["arm001"] });
r = await save([item("wpn001", "weapon-3", 3), item("arm001", "armor-4", 4, 0)]); check(find("wpn001").du === 7, "a credit is for one item id");
// pieces that don't wear never get du
r = await save([item("wpn001", "weapon-3", 3, 7), item("arm001", "armor-4", 4, 0), item("rng002", "ring-1", 2, 4)]); check(find("rng002").du === undefined, "a Rare piece has no durability");

// the price and the payment (quote → confirm → credit)
{ db.delete("worldOwn/" + me); const S = await sign(); const rq = await W.handle({ action: "world-pay-quote", ...S, item: "repair", target: "arm001" });
  check(rq.status === 200 && rq.body.tokens === 1500, "Legendary repair quote: 1,500 $ARCIRCLE: " + JSON.stringify(rq.body).slice(0, 80));
  const re = await W.handle({ action: "world-pay-quote", ...S, item: "repair", target: "wpn001" }); check(re.status === 200 && re.body.tokens === 500, "Epic repair quote: 500 $ARCIRCLE");
  const rn = await W.handle({ action: "world-pay-quote", ...S, item: "repair", target: "rng001" }); check(rn.status === 400, "no repair quote for a piece that doesn't wear / isn't saved");
  const { FEE_BURN, ARCIRCLE } = await import("../../api/_world-shop.mjs"), pad = (x) => "0x" + x.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", H = "0x" + "ab".repeat(32);
  receipts[H] = { status: "0x1", logs: [{ address: ARCIRCLE, topics: [TR, pad(me), pad(FEE_BURN)], data: "0x" + BigInt(rq.body.amount).toString(16) }] };
  const rc = await W.handle({ action: "world-pay-confirm", ...S, quote: rq.body.quote, tx: H });
  check(rc.status === 200 && rc.body.own.repairIds.includes("arm001"), "paying grants a repair credit for that piece");
  r = await save([item("wpn001", "weapon-3", 3, 7), item("arm001", "armor-4", 4)]); check(find("arm001").du === undefined, "...which the next save turns into a full piece"); }

// free repairs: 3 a day at your island, then no more until the next Seoul day
{ db.delete("worldOwn/" + me); await save([item("wpn001", "weapon-3", 3, 7), item("aaa1", "armor-3", 3, 5), item("aaa2", "helm-3", 3, 5), item("aaa3", "boots-3", 3, 5), item("aaa4", "shield-3", 3, 5)]);
  let S = await sign(); const free = async (id, base = true) => { S = await sign(); return W.handle({ action: "world-repair-free", ...S, id, ...(base ? { base: true } : {}) }); };
  r = await free("wpn001", false); check(r.status === 400, "free repairs only when the request says you're at your island");
  r = await free("rng001"); check(r.status === 400, "not for a piece that can't wear");
  r = await free("wpn001"); check(r.status === 200 && r.body.left === 2 && r.body.own.repairIds.includes("wpn001"), "free repair 1: 2 left, credit given");
  r = await free("wpn001"); check(r.status === 200 && r.body.left === 2 && r.body.already, "asking again for the same piece costs nothing");
  r = await free("aaa1"); check(r.body.left === 1, "free repair 2");
  r = await free("aaa2"); check(r.body.left === 0, "free repair 3");
  r = await free("aaa3"); check(r.status === 429 && r.body.left === 0, "the 4th is refused");
  const v = (await W.read(new URL("http://x/?world=repair&wallet=" + me))).body; check(v.left === 0, "the day's count is readable");
  await save([item("wpn001", "weapon-3", 3), item("aaa1", "armor-3", 3), item("aaa2", "helm-3", 3), item("aaa3", "boots-3", 3, 5), item("aaa4", "shield-3", 3, 5)]);
  check(find("wpn001").du === undefined && find("aaa2").du === undefined && find("aaa3").du === 5, "free credits repair the pieces they were given for");
  T += 864e5; r = await free("aaa3"); check(r.status === 200 && r.body.left === 2, "the next Seoul day: 3 free again");
  r = await free("aaa2"); check(r.status === 400 && /isn't worn/.test(r.body.error), "a whole piece can't bank a free repair for later"); }

console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
