// kartshop.test.mjs — ARCIRCLE KART's SHOP (world-kart-shop-data.js, api/_world-kart.mjs KS): six cars, ARC and CIRCLE the top
// grade; a car is the player's own $ARCIRCLE transfer to FeeBurn (half burned), read back from the receipt, each tx once; a race
// counts a car only if the wallet owns it; no car makes a kart faster than a boost, so minLap holds; the client's words.
// On an in-memory store. Run: node tests/world/kartshop.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { KSHOP, carOf, priceOf, statsOf, barOf } = await import("../../world-kart-shop-data.js");
const { FEE_BURN, ARCIRCLE } = await import("../../api/_world-shop.mjs");
const C = await import("../../world-kart.js");
const { WORDS } = await import("../../world-words.js");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

// ---- the cars ----
const ids = KSHOP.CARS.map((c) => c.id), leg = KSHOP.CARS.filter((c) => c.grade === "legendary").map((c) => c.id);
check(JSON.stringify(ids.slice().sort()) === JSON.stringify(["arc", "argus", "circle", "kairo", "roadster", "roblox", "usdc"]) && ids[0] === "roadster", "seven cars: the ROCKET ROADSTER first (the newest), USDC, Roblox, KAIRO, ARC, CIRCLE, Argus");
check(JSON.stringify(leg.slice().sort()) === JSON.stringify(["arc", "circle", "roadster"]) && KSHOP.CARS.every((c) => c.grade === "legendary" || c.grade === "epic"), "ROCKET ROADSTER, ARC and CIRCLE are LEGENDARY (the top grade), the rest EPIC");
check(KSHOP.BURN_PCT === 50 && KSHOP.PRICE.legendary > KSHOP.PRICE.epic && KSHOP.CARS.every((c) => priceOf(c) > 0), `prices: EPIC ${KSHOP.PRICE.epic.toLocaleString()} / LEGENDARY ${KSHOP.PRICE.legendary.toLocaleString()} $ARCIRCLE, half burned`);
check(KSHOP.DEPTS.length === 5 && KSHOP.DEPTS.filter((d) => d.open).map((d) => d.id).join() === "cars", "five departments, only Cars open");
check(KSHOP.CARS.every((c) => C.TOP * statsOf(c.id).top < C.BOOST_TOP), "no car's top speed reaches a boost's (TOP × top < BOOST_TOP): the server's minLap holds");
check(KSHOP.CARS.every((c) => Object.values(statsOf(c.id)).every((v) => v >= 0.7 && v <= 1.4)), "every number stays within ×0.7–1.4");
const score = (id) => { const s = statsOf(id); return (s.top - 1) * 3 + (s.acc - 1) + (s.turn - 1) + (s.drift - 1) * 0.6 + (s.boost - 1) * 0.6 + (s.nitro - 1) * 0.4 + (s.mass - 1) * 0.15 + (1 - s.spin) * 0.2; };
const ep = KSHOP.CARS.filter((c) => c.grade === "epic").map((c) => score(c.id)), lg = leg.map(score);
check(Math.min(...lg) > Math.max(...ep), `the LEGENDARY cars score above every EPIC one (${lg.map((x) => x.toFixed(3)).join(", ")} vs ≤ ${Math.max(...ep).toFixed(3)})`);
check(Math.max(...ep) - Math.min(...ep) < 0.06, `the EPIC cars are about even (${ep.map((x) => x.toFixed(3)).join(", ")})`);
check(KSHOP.CARS.every((c) => KSHOP.STAT_KEYS.some((k) => barOf(c.id, k) > 52) && KSHOP.STAT_KEYS.some((k) => barOf(c.id, k) < 50 || (k === "turn" && barOf(c.id, k) < 50)) || c.id === "circle"), "each car has a strength and a weakness on its card (CIRCLE: strong everywhere, no single best)");
check(KSHOP.CARS.every((c) => c.pro && c.con && c.line), "each car says its pro and con");

// ---- the server ----
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-11-01T12:00:00Z"); const RC = {};
const W = make({ ...store, recover: recoverSigner, issuedOk: () => true, json, now: () => T, rand: () => 0.5, receipt: async (h) => RC[h] || null });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), a = A.address.toLowerCase();
const pad = (x) => "0x" + String(x).replace(/^0x/, "").toLowerCase().padStart(64, "0"), TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const xfer = (from, to, n) => ({ address: ARCIRCLE, topics: [TR, pad(from), pad(to)], data: "0x" + (BigInt(n) * 10n ** 18n).toString(16) });
const E = KSHOP.PRICE.epic, L = KSHOP.PRICE.legendary;

let r = (await W.read(new URL("https://x/api/social?world=kart-shop&wallet=" + A.address))).body;
check(r.cars.length === 7 && r.pay.to === FEE_BURN && r.pay.token === ARCIRCLE && r.burnPct === 50 && !r.owned.length, "the shop: six cars, paid to FeeBurn in $ARCIRCLE, nothing owned yet");
r = await call(A, "world-kart-car-buy", { id: "usdc" }); check(r.status === 400 && BigInt(r.body.pay.amount) === BigInt(E) * 10n ** 18n, "no tx: the payment's details come back");
r = await call(A, "world-kart-car-buy", { id: "lambo", tx: "0x" + "1".repeat(64) }); check(r.status === 404, "no such car");
const t0 = "0x" + "a1".repeat(32); r = await call(A, "world-kart-car-buy", { id: "usdc", tx: t0 }); check(r.status === 202, "a tx not confirmed yet: wait");
RC[t0] = { status: "0x1", logs: [xfer(a, FEE_BURN, E - 1)] }; r = await call(A, "world-kart-car-buy", { id: "usdc", tx: t0 }); check(r.status === 400, "less than the price: refused");
const t1 = "0x" + "b2".repeat(32); RC[t1] = { status: "0x1", logs: [xfer(B.address, FEE_BURN, E)] }; r = await call(A, "world-kart-car-buy", { id: "usdc", tx: t1 }); check(r.status === 400, "someone else's transfer: refused");
const t2 = "0x" + "c3".repeat(32); RC[t2] = { status: "0x1", logs: [xfer(a, B.address, E)] }; r = await call(A, "world-kart-car-buy", { id: "usdc", tx: t2 }); check(r.status === 400, "a transfer to anyone but FeeBurn: refused");
const t3 = "0x" + "d4".repeat(32); RC[t3] = { status: "0x0", logs: [xfer(a, FEE_BURN, E)] }; r = await call(A, "world-kart-car-buy", { id: "usdc", tx: t3 }); check(r.status === 400, "a failed transaction: refused");
const t4 = "0x" + "e5".repeat(32); RC[t4] = { status: "0x1", logs: [xfer(a, FEE_BURN, E)] }; r = await call(A, "world-kart-car-buy", { id: "arc", tx: t4 }); check(r.status === 400, "an EPIC price doesn't buy a LEGENDARY car");
r = await call(A, "world-kart-car-buy", { id: "usdc", tx: t4 }); check(r.status === 200 && r.body.owned.includes("usdc"), "the right transfer buys PEGMASTER");
r = await call(A, "world-kart-car-buy", { id: "kairo", tx: t4 }); check(r.status === 409, "the same tx can't buy a second car");
r = await call(B, "world-kart-car-buy", { id: "usdc", tx: t4 }); check(r.status === 409, "nor anyone else's");
const t5 = "0x" + "f6".repeat(32); RC[t5] = { status: "0x1", logs: [xfer(a, FEE_BURN, L)] }; r = await call(A, "world-kart-car-buy", { id: "arc", tx: t5 }); check(r.status === 200 && r.body.owned.includes("arc") && r.body.owned.includes("usdc"), "ARC LIGHTSPEED bought too; both owned");
{ const tr = "0x" + "e7".repeat(32); RC[tr] = { status: "0x1", logs: [xfer(a, FEE_BURN, L)] }; const rr0 = await call(A, "world-kart-car-buy", { id: "roadster", tx: tr }); const rr1 = await call(A, "world-kart-car-buy", { id: "roadster" }); check(rr0.status === 400 && rr1.status === 400 && BigInt(rr1.body.pay.amount) === 1000000n * 10n ** 18n, "the ROCKET ROADSTER asks 1,000,000 $ARCIRCLE; a LEGENDARY 300,000 transfer doesn't buy it"); }
r = await call(A, "world-kart-car-buy", { id: "arc", tx: "0x" + "77".repeat(32) }); check(r.status === 200 && r.body.already, "an owned car isn't charged again");
check(db.get("worldStats/kartShop").sold === 2 && Math.round(db.get("worldStats/kartShop").burned) === (E + L) / 2, "the shop's tally: 2 sold, half of it burned");
r = (await W.read(new URL("https://x/api/social?world=kart-shop&wallet=" + A.address))).body; check(r.owned.length === 2, "the shop lists what you own");

// a race counts a car only if the wallet owns it
r = await call(A, "world-kart-start", { track: "nexus", mode: "race", racer: "pepe", car: "arc" }); check(r.status === 200 && r.body.car === "arc" && db.get("worldKartRace/" + a).car === "arc", "a race with your own car carries it");
r = await call(A, "world-kart-start", { track: "nexus", mode: "race", racer: "pepe", car: "circle" }); check(r.status === 200 && r.body.car === "" && !db.get("worldKartRace/" + a).car, "a car you don't own isn't counted (the racer's own kart)");
r = await call(B, "world-kart-start", { track: "nexus", mode: "race", racer: "doge", car: "usdc" }); check(r.status === 200 && r.body.car === "", "nor someone else's car");
r = await W.handle({ action: "world-kart-start", guest: "0123456789abcdef", track: "nexus", mode: "race", racer: "pepe", car: "arc" }); check(r.status === 200 && !r.body.car, "a guest races the racer's own kart");

// ---- RR: the ROCKET ROADSTER's ROCKET JUMP — only that car, a short flight that lands, never faster than a boost ----
{ const J = KSHOP.JET, rs = carOf("roadster"), { jetOf } = await import("../../world-kart-shop-data.js");
  check(rs && rs.jet && jetOf("roadster") && KSHOP.CARS.filter((c) => c.jet).length === 1 && !jetOf("arc") && !jetOf(""), "only the ROCKET ROADSTER has the ROCKET JUMP");
  check(priceOf(rs) === 1000000 && rs.grade === "legendary" && score("roadster") >= Math.max(...lg) - 1e-9, `the ROCKET ROADSTER is LEGENDARY (${priceOf(rs).toLocaleString()} $ARCIRCLE) and scores at the top (${score("roadster").toFixed(3)})`);
  const air = (g) => { let t = 0; while (C.jetY(t + 0.01, g) > 0 && t < 10) t += 0.01; let mx = 0; for (let u = 0; u < t; u += 0.01) mx = Math.max(mx, C.jetY(u, g)); return [t, mx]; };
  const [t21, y21] = air(21), [t16] = air(16), [t11, y11] = air(11);
  check(t21 > 1.6 && t21 < 2.6 && y21 > 3 && y21 < 6 && t16 > t21 && t11 > t16 && y11 < 10, `a rocket jump flies ${t21.toFixed(2)} s (peak ${y21.toFixed(1)} m) on a normal track, longer in lower gravity (${t16.toFixed(2)} s at 16, ${t11.toFixed(2)} s / ${y11.toFixed(1)} m on the moon)`);
  check(J.cd > t11 + 1 && J.land <= 1 && J.lift > 0 && J.g > 0 && J.g < 1, `once every ${J.cd} s (longer than the longest flight), a ${J.land} s landing turbo (a boost's: BOOST_TOP at most)`);
  check(C.TOP * statsOf("roadster").top < C.BOOST_TOP, "flying never makes it faster than a boost — the server's minLap holds"); }

// ---- the words: every T("…") of the shop window in WORDS ko / zh / tr; the shop data's words too ----
{ const fs = await import("node:fs"), src = fs.readFileSync(new URL("../../world-kart-shop.js", import.meta.url), "utf8"), want = new Set();
  for (const m of src.matchAll(/\bT\("((?:[^"\\]|\\.)*)"/g)) want.add(JSON.parse('"' + m[1] + '"'));
  for (const c of KSHOP.CARS) { want.add(c.line); want.add(c.pro); want.add(c.con); } for (const d of KSHOP.DEPTS) want.add(d.name);
  const miss = []; for (const s of want) for (const l of ["ko", "zh", "tr"]) if (WORDS[l][s] == null) miss.push(l + "|" + s);
  check(want.size > 40 && !miss.length, `the shop's ${want.size} strings are in ko/zh/tr${miss.length ? ": " + miss.slice(0, 10).join(", ") : ""}`); }
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
