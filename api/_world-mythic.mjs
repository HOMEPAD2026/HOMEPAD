// api/_world-mythic.mjs — MYTHIC gear held on the server: the Crimson Celestial set (world-mythic-data.js, the owner's
// spec v1.0). A piece is made here when a RAID QUEENS win rolls one (api/_world-raidq.mjs calls roll() once, after the
// run's done-lock), kept in worldMythic/<id> with its owner, origin, level to wear, multiplier and +, and listed for its
// owner in worldMythicOwn/<wallet> { ids, eq }. The save the device sends never holds one, so a piece can't be copied or
// made up there. What you wear is checked here: yours, your level ≥ its level, one a slot.
//   GET  ?world=mythic&wallet=0x…                                 { pieces: [...], eq: { slot: id } }
//   POST { action: "world-mythic-equip", …signature, slot, id }   wear (id) or take off (id null) — 403 not yours / too low
// Firestore: worldMythic/<id> { id, def, set, owner, src, req, mult, plus, state, at, run } · worldMythicOwn/<wallet> { ids, eq }
//            worldStats/mythic { <def>: n, <src>: n }
//   POST world-mythic-enhance { id }          + one (Crimson Essence + ARCL; a miss keeps the +)   → { ok, hit, plus, ess }
//   POST world-mythic-salvage { id }          the piece into Crimson Essence (gone for good)       → { ok, ess }
//   POST world-mythic-list { id, price }      for sale to other players for ARCL (off you, unworn)
//   POST world-mythic-unlist { id }           back to you
//   POST world-mythic-buy { id }              ARCL from you, the price less 2 % to the seller, the piece is yours (its id, +, origin kept)
//   GET  ?world=mythic-market                 { items: [{ id, def, src, mult, plus, req, price, at, seller (short) }] }
// worldMythicOwn/<wallet> { ids, eq, ess } · worldMythicMkt/all { items: { <id>: listing } } · worldMythicSold/<id>_<listed at> (the buy lock)
// worldStats/mythicFee { arcl } · an instance's own hist: [{ from, to, price, at }]
// b6 (2026-10-25, the owner's list): the seventh piece (the shield), Crimson Shards (every won run's pity: SHARD of one dungeon
// → a piece of the slot you pick), drops weighed toward slots you don't hold and the week's blessed slot (rollSlot),
// reforging into another slot (Essence), awakening with the same piece (stars ≤ 3), a miss's bonus on the next enhance
// (inst.fails), each piece's own log (made / + / stars / reforged / sold), the first owner kept, buy requests (bids: the
// ARCL held here until filled or taken back), recent sales for the price line, the boards (collection, best +), what a
// player wears for others to see.
//   POST world-mythic-claim { src, slot }     a piece from that dungeon's shards                    → { ok, piece, shards }
//   POST world-mythic-reforge { id, slot }    the piece into another slot (Essence)                 → { ok, piece }
//   POST world-mythic-awaken { id, fodder }   the same piece given up: one more star                → { ok, piece }
//   POST world-mythic-bid { def, minPlus, price }  a buy request, the ARCL held                      → { ok, bid }
//   POST world-mythic-unbid { bid }           taken back, the ARCL returned
//   POST world-mythic-fill { bid, id }        your piece to the request: the price less 2 % to you
//   GET  ?world=mythic-top                    { collect: [...], plus: [...] }
//   GET  ?world=mythic-worn&wallet=0x…        { n, worn: [{ def, plus, stars, src }] }
// worldMythicBids/all { items: { <bid>: { bid, w, def, minPlus, price, at } } } · worldMythicSales/all { list } · worldMythicBoard/all { users }
// step D — the USDC market: a piece listed with cur "usdc" (price in cents); the buyer holds it (15 min), sends USDC to the
// desk on Arc and gives the tx; the server reads the receipt (a USDC Transfer from them to the desk ≥ the price, the tx
// used once: worldPayTx) and the piece is theirs; the seller's share (less 2 %) waits for a GM, who pays it from their own
// wallet and gives that tx (checked the same way, GM → seller). A tx that comes in after someone else took the piece is
// recorded for a refund the same way. worldMythicUsd/<id> · worldMythicUsdQ/all { ids } · worldMythicUsdMine/<wallet> { ids }
//   POST world-mythic-list { id, price, cur: "usdc" }  ·  POST world-mythic-usd-hold { id } → { desk, token, amount, until }
//   POST world-mythic-usd-buy { id, tx } → { ok, piece } (202 while the tx isn't confirmed)
//   POST world-mythic-usd-admin { op: "list" | "paid" | "refunded", id, gmTx } (a GM)
// The states the spec names (GAME_OWNED, GAME_LISTED, NFT_*) — only GAME_OWNED is made for now; trading and NFTs come next.
import { CC, pieceOf, enhCost, essOf, rollSlot, reforgeCost } from "../world-mythic-data.js";
import { levelOfSave } from "./_world-social.mjs";
import { randomBytes } from "node:crypto";
import { SWAP } from "./_world-swap.mjs";
const lc = (a) => String(a || "").toLowerCase(), pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/// the USDC (ERC-20 interface) a receipt moved from → to, in token units
const usdcMoved = (rc, from, to) => ((rc && rc.logs) || []).filter((l) => lc(l.address) === lc(CC.USD.TOKEN) && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[1]) === pad32(from) && lc(l.topics[2]) === pad32(to)).reduce((x, l) => x + BigInt(l.data), 0n);
const centsToUnits = (c) => BigInt(Math.round(c)) * 10n ** BigInt(CC.USD.DEC - 2);
const SLOTS = CC.PIECES.map((p) => p.slot);
const WEARABLE = new Set(["GAME_OWNED", "NFT_ACTIVE"]);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), save(wallet) → the save, rand?() → [0, 1) }
export function makeMythic(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now(), rand = deps.rand || (() => randomBytes(6).readUIntBE(0, 6) / 2 ** 48);
  const one = async (p) => (await getDocs([p]))[p];
  const ownOf = async (w) => (await one(`worldMythicOwn/${w}`)) || { ids: [], eq: {} };
  const logOf = (p, k, v) => [...(p.log || []), { k, at: now(), ...(v != null ? { v } : {}) }].slice(-30);
  /// a new piece in a slot, from a dungeon, kept here and put on its owner's list
  async function make(w, mode, P, run, how) {
    const D = CC.DROP[mode], t = now(), id = ("m" + t.toString(36) + randomBytes(4).toString("hex")).slice(0, 20);
    const inst = { id, def: P.id, set: CC.SET, owner: w, first: w, src: mode, req: D.req, mult: D.mult, plus: 0, stars: 0, state: "GAME_OWNED", at: t, run: run || "", log: [{ k: how || "drop", at: t, v: mode }] };
    await setDoc(`worldMythic/${id}`, inst);
    const own = await ownOf(w); await setDoc(`worldMythicOwn/${w}`, { ...own, ids: [...(own.ids || []), id] });
    await commit([{ inc: "worldStats/mythic", fields: { [P.id]: 1, [mode]: 1, ...(how === "claim" ? { claims: 1 } : {}) } }]).catch(() => {});
    touch(w).catch(() => {});
    return inst;
  }
  /// a won run: its dungeon's shard first (always), then maybe one piece (the dungeon's rate) — the slot weighed toward the
  /// ones you don't hold and the week's blessed slot (rollSlot); returns the piece or null
  async function roll(w, mode, run) {
    const D = CC.DROP[mode]; if (!D) return null;
    const own = await ownOf(w), sh = { ...(own.shards || {}) }; sh[mode] = (sh[mode] || 0) + 1; await setDoc(`worldMythicOwn/${w}`, { ...own, shards: sh });
    if (rand() >= D.rate) return null;
    const held = await heldSlots(w), P = rollSlot(held, now(), rand());
    return make(w, mode, P, run, "drop");
  }
  async function heldSlots(w) { const { pieces } = await list(w); return [...new Set(pieces.map((p) => (pieceOf(p.def) || {}).slot).filter(Boolean))]; }
  /// the boards' row for a wallet (what it holds now): distinct slots, the best +, the sum of +
  async function touch(w) {
    const { pieces } = await list(w), sv = await deps.save(w).catch(() => null), name = String((sv && sv.name) || "").slice(0, 20);
    const n = new Set(pieces.map((p) => (pieceOf(p.def) || {}).slot).filter(Boolean)).size, best = pieces.reduce((m, p) => Math.max(m, Math.floor(p.plus || 0)), 0), sum = pieces.reduce((m, p) => m + Math.floor(p.plus || 0), 0), stars = pieces.reduce((m, p) => m + Math.floor(p.stars || 0), 0);
    const B = (await one("worldMythicBoard/all")) || { users: {} }, users = { ...(B.users || {}) };
    if (!pieces.length) delete users[w]; else users[w] = { name, n, best, sum, stars, at: now() };
    const keep = Object.entries(users).sort((a, b) => b[1].n - a[1].n || b[1].sum - a[1].sum).slice(0, 400); await setDoc("worldMythicBoard/all", { users: Object.fromEntries(keep) });
  }
  async function claim(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, src = String(b.src || ""), slot = String(b.slot || "");
    const need = CC.SHARD[src], P = CC.PIECES.find((x) => x.slot === slot); if (!need || !P) return json(400, { error: "which dungeon and slot?" });
    const own = await ownOf(w), have = (own.shards || {})[src] || 0; if (have < need) return json(400, { error: `${need} shards needed (you have ${have})`, need });
    if (!(await commit([{ create: `worldMythicClaim/${w}_${src}_${have}_${Math.floor(now() / 3000)}`, data: { at: now() } }])).ok) return json(409, { error: "already made — refresh" });
    await setDoc(`worldMythicOwn/${w}`, { ...own, shards: { ...(own.shards || {}), [src]: have - need } });
    const inst = await make(w, src, P, "", "claim");
    return json(200, { ok: true, piece: inst, shards: have - need });
  }
  async function reforge(b) {
    const m = await mine(b); if (m.err) return m.err; const { w, id, p, own } = m, slot = String(b.slot || ""), P = CC.PIECES.find((x) => x.slot === slot);
    if (!P) return json(400, { error: "which slot?" }); if (P.id === p.def) return json(400, { error: "it's that piece already" });
    const cost = reforgeCost(p), ess = own.ess || 0; if (ess < cost) return json(400, { error: `${cost} Crimson Essence needed (you have ${ess})`, need: cost });
    const eq = { ...(own.eq || {}) }; for (const [k, v] of Object.entries(eq)) if (v === id) delete eq[k];
    const np = { ...p, def: P.id, plus: 0, stars: 0, fails: 0, log: logOf(p, "reforge", P.id) };
    await setDoc(`worldMythic/${id}`, np); await setDoc(`worldMythicOwn/${w}`, { ...own, eq, ess: ess - cost });
    touch(w).catch(() => {}); return json(200, { ok: true, piece: np, ess: ess - cost });
  }
  async function awaken(b) {
    const m = await mine(b); if (m.err) return m.err; const { w, id, p, own } = m, fid = String(b.fodder || "");
    if (fid === id || !/^m[a-z0-9]{6,24}$/.test(fid)) return json(400, { error: "give up another copy of the same piece" });
    if ((p.stars || 0) >= CC.MAX_STARS) return json(409, { error: `it has ${CC.MAX_STARS} stars already` });
    const f = await one(`worldMythic/${fid}`); if (!f || f.owner !== w || !(own.ids || []).includes(fid)) return json(403, { error: "that piece isn't yours" });
    if (f.def !== p.def) return json(400, { error: "only the same piece can awaken it" }); if (!WEARABLE.has(f.state)) return json(409, { error: "that piece is listed — take it off the market first" });
    const eq = { ...(own.eq || {}) }; for (const [k, v] of Object.entries(eq)) if (v === fid) delete eq[k];
    const np = { ...p, stars: (p.stars || 0) + 1, log: logOf(p, "star", (p.stars || 0) + 1) };
    await setDoc(`worldMythic/${fid}`, { ...f, state: "AWAKENED_INTO", owner: "", into: id, at2: now() });
    await setDoc(`worldMythic/${id}`, np); await setDoc(`worldMythicOwn/${w}`, { ...own, ids: (own.ids || []).filter((x) => x !== fid), eq });
    touch(w).catch(() => {}); return json(200, { ok: true, piece: np });
  }
  async function list(w) {
    const own = await ownOf(w), ids = (own.ids || []).slice(-200), d = ids.length ? await getDocs(ids.map((i) => `worldMythic/${i}`)) : {};
    const pieces = ids.map((i) => d[`worldMythic/${i}`]).filter((x) => x && x.owner === w);
    const eq = {}; for (const [s, i] of Object.entries(own.eq || {})) if (pieces.some((p) => p.id === i)) eq[s] = i; // (what was traded away isn't worn)
    return { pieces, eq, ess: own.ess || 0, shards: own.shards || {} };
  }
  async function equip(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    const slot = String(b.slot || ""); if (!SLOTS.includes(slot)) return json(400, { error: "which slot?" });
    const own = await ownOf(w), eq = { ...(own.eq || {}) };
    if (b.id == null || b.id === "") { delete eq[slot]; await setDoc(`worldMythicOwn/${w}`, { ...own, eq }); return json(200, { ok: true, eq }); }
    const id = String(b.id); if (!/^m[a-z0-9]{6,24}$/.test(id)) return json(400, { error: "which piece?" });
    const p = await one(`worldMythic/${id}`), P = p && pieceOf(p.def);
    if (!p || p.owner !== w || !(own.ids || []).includes(id)) return json(403, { error: "that piece isn't yours" });
    if (!WEARABLE.has(p.state)) return json(409, { error: "that piece is listed — take it off the market first" });
    if (!P || P.slot !== slot) return json(400, { error: "that piece goes in another slot" });
    const lv = levelOfSave(await deps.save(w)); if (lv < p.req) return json(403, { error: `this piece is worn from level ${p.req} (you're ${lv})`, need: p.req });
    eq[slot] = id; await setDoc(`worldMythicOwn/${w}`, { ...own, eq });
    return json(200, { ok: true, eq });
  }
  const mine = async (b, needWearable = true) => {
    const s = signer(b); if (s.err) return { err: s.err }; const w = s.wallet, id = String(b.id || "");
    if (!/^m[a-z0-9]{6,24}$/.test(id)) return { err: json(400, { error: "which piece?" }) };
    const [p, own] = await Promise.all([one(`worldMythic/${id}`), ownOf(w)]);
    if (!p || p.owner !== w || !(own.ids || []).includes(id)) return { err: json(403, { error: "that piece isn't yours" }) };
    if (needWearable && !WEARABLE.has(p.state)) return { err: json(409, { error: "that piece is listed — take it off the market first" }) };
    return { w, id, p, own };
  };
  async function enhance(b) {
    const m = await mine(b); if (m.err) return m.err; const { w, id, p, own } = m, plus = Math.floor(p.plus || 0);
    if (plus >= CC.MAX_PLUS) return json(409, { error: `it's at +${CC.MAX_PLUS} already` });
    const c = enhCost(plus, p.fails || 0), ess = own.ess || 0; if (ess < c.ess) return json(400, { error: `${c.ess} Crimson Essence needed (you have ${ess})`, need: c });
    if (!deps.debit) return json(503, { error: "try again later" });
    const d = await deps.debit(w, "mythic-enh", c.arcl); if (d.err) return json(400, { error: d.err === "not enough ARCL" ? `${c.arcl.toLocaleString("en-US")} ARCL needed` : d.err, need: c });
    const hit = rand() < c.rate, np = hit ? plus + 1 : plus;
    await setDoc(`worldMythicOwn/${w}`, { ...own, ess: ess - c.ess });
    const fails = hit ? 0 : (p.fails || 0) + 1;
    await setDoc(`worldMythic/${id}`, { ...p, plus: np, fails, ...(hit && np >= 5 ? { log: logOf(p, "plus", np) } : {}) });
    await commit([{ inc: "worldStats/mythic", fields: { [hit ? "enhOk" : "enhMiss"]: 1 } }]).catch(() => {});
    if (hit) touch(w).catch(() => {});
    return json(200, { ok: true, hit, plus: np, fails, rate: c.rate, next: np < CC.MAX_PLUS ? enhCost(np, fails).rate : 0, ess: ess - c.ess, bal: d.bal });
  }
  async function salvage(b) {
    const m = await mine(b); if (m.err) return m.err; const { w, id, p, own } = m, gain = essOf(p);
    const eq = { ...(own.eq || {}) }; for (const [k, v] of Object.entries(eq)) if (v === id) delete eq[k];
    await setDoc(`worldMythic/${id}`, { ...p, state: "SALVAGED", owner: "", at2: now() });
    await setDoc(`worldMythicOwn/${w}`, { ...own, ids: (own.ids || []).filter((x) => x !== id), eq, ess: (own.ess || 0) + gain });
    touch(w).catch(() => {});
    return json(200, { ok: true, ess: (own.ess || 0) + gain, gain });
  }
  const MK = "worldMythicMkt/all", short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  async function listIt(b) {
    const m = await mine(b); if (m.err) return m.err; const { w, id, p, own } = m, M = CC.MARKET, usd = b.cur === "usdc";
    const price = usd ? Math.round((Number(b.price) || 0) * 100) : Math.floor(Number(b.price) || 0); // (USDC: dollars in, cents kept)
    if (usd && !(price >= CC.USD.MIN && price <= CC.USD.MAX)) return json(400, { error: `a price from ${CC.USD.MIN / 100} to ${(CC.USD.MAX / 100).toLocaleString("en-US")} USDC` });
    if (!usd && !(price >= M.MIN && price <= M.MAX)) return json(400, { error: `a price from ${M.MIN.toLocaleString("en-US")} to ${M.MAX.toLocaleString("en-US")} ARCL` });
    const mk = (await one(MK)) || { items: {} }; if (Object.keys(mk.items || {}).length >= M.MAX_LISTED) return json(429, { error: "the market is full — try later" });
    const at = now(), eq = { ...(own.eq || {}) }; for (const [k, v] of Object.entries(eq)) if (v === id) delete eq[k];
    await setDoc(`worldMythic/${id}`, { ...p, state: "GAME_LISTED", price, cur: usd ? "usdc" : "arcl", listedAt: at });
    await setDoc(`worldMythicOwn/${w}`, { ...own, eq });
    await setDoc(MK, { items: { ...(mk.items || {}), [id]: { id, def: p.def, src: p.src, mult: p.mult, plus: p.plus || 0, stars: p.stars || 0, req: p.req, price, cur: usd ? "usdc" : "arcl", at, seller: w, first: p.first || w } } });
    return json(200, { ok: true, price });
  }
  async function unlist(b) {
    const m = await mine(b, false); if (m.err) return m.err; const { id, p } = m; if (p.state !== "GAME_LISTED") return json(409, { error: "it isn't listed" });
    const mk = (await one(MK)) || { items: {} }, items = { ...(mk.items || {}) }; delete items[id];
    await setDoc(MK, { items }); await setDoc(`worldMythic/${id}`, { ...p, state: "GAME_OWNED", price: 0, cur: "" });
    return json(200, { ok: true });
  }
  async function buy(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, id = String(b.id || "");
    if (!/^m[a-z0-9]{6,24}$/.test(id)) return json(400, { error: "which piece?" });
    const p = await one(`worldMythic/${id}`); if (!p || p.state !== "GAME_LISTED" || !p.price) return json(404, { error: "it's not for sale any more" });
    if (p.cur === "usdc") return json(400, { error: "this one is sold for USDC" });
    if (p.owner === w) return json(400, { error: "that's your own piece" });
    if (!(await commit([{ create: `worldMythicSold/${id}_${p.listedAt}`, data: { at: now(), buyer: w } }])).ok) return json(409, { error: "someone else just bought it" });
    if (!deps.debit || !deps.award) return json(503, { error: "try again later" });
    const d = await deps.debit(w, "mythic-buy", p.price); if (d.err) { await commit([{ del: `worldMythicSold/${id}_${p.listedAt}` }]).catch(() => {}); return json(400, { error: d.err === "not enough ARCL" ? `${p.price.toLocaleString("en-US")} ARCL needed` : d.err }); }
    const fee = Math.ceil(p.price * CC.MARKET.FEE), toSeller = p.price - fee, seller = p.owner;
    await deps.award(seller, "mythic-sale", toSeller);
    const so = await ownOf(seller), bo = await ownOf(w), eqS = { ...(so.eq || {}) }; for (const [k, v] of Object.entries(eqS)) if (v === id) delete eqS[k];
    await setDoc(`worldMythicOwn/${seller}`, { ...so, ids: (so.ids || []).filter((x) => x !== id), eq: eqS });
    await setDoc(`worldMythicOwn/${w}`, { ...bo, ids: [...(bo.ids || []), id] });
    await setDoc(`worldMythic/${id}`, { ...p, owner: w, first: p.first || seller, state: "GAME_OWNED", price: 0, hist: [...(p.hist || []), { from: seller, to: w, price: p.price, at: now() }].slice(-20), log: logOf(p, "sold", p.price) });
    const mk = (await one(MK)) || { items: {} }, items = { ...(mk.items || {}) }; delete items[id]; await setDoc(MK, { items });
    await commit([{ inc: "worldStats/mythicFee", fields: { arcl: fee, sales: 1 } }]).catch(() => {});
    await sold(p, p.price); touch(w).catch(() => {}); touch(seller).catch(() => {});
    return json(200, { ok: true, id, price: p.price, fee, bal: d.bal });
  }
  // recent sales (the price line) and buy requests
  const SL = "worldMythicSales/all", BD = "worldMythicBids/all";
  async function sold(p, price) { const S = (await one(SL)) || { list: [] }; await setDoc(SL, { list: [...(S.list || []), { def: p.def, src: p.src, plus: p.plus || 0, stars: p.stars || 0, price, cur: p.usd ? "usdc" : "arcl", at: now() }].slice(-CC.MARKET.SALES) }); }
  async function bid(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, P = pieceOf(String(b.def || "")), M = CC.MARKET;
    const price = Math.floor(Number(b.price) || 0), minPlus = Math.max(0, Math.min(CC.MAX_PLUS, Math.floor(Number(b.minPlus) || 0)));
    if (!P) return json(400, { error: "which piece?" }); if (!(price >= M.MIN && price <= M.MAX)) return json(400, { error: `a price from ${M.MIN.toLocaleString("en-US")} to ${M.MAX.toLocaleString("en-US")} ARCL` });
    const B = (await one(BD)) || { items: {} }, all = Object.values(B.items || {});
    if (all.length >= M.MAX_BIDS) return json(429, { error: "too many requests — try later" }); if (all.filter((x) => x.w === w).length >= M.MY_BIDS) return json(429, { error: `at most ${M.MY_BIDS} requests at a time` });
    if (!deps.debit || !deps.award) return json(503, { error: "try again later" });
    const d = await deps.debit(w, "mythic-bid", price); if (d.err) return json(400, { error: d.err === "not enough ARCL" ? `${price.toLocaleString("en-US")} ARCL needed` : d.err });
    const id = "b" + now().toString(36) + randomBytes(3).toString("hex"), row = { bid: id, w, def: P.id, minPlus, price, at: now() };
    await setDoc(BD, { items: { ...(B.items || {}), [id]: row } });
    return json(200, { ok: true, bid: { ...row, w: short(w) }, bal: d.bal });
  }
  async function unbid(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, id = String(b.bid || "");
    const B = (await one(BD)) || { items: {} }, row = (B.items || {})[id]; if (!row) return json(404, { error: "that request is gone" }); if (row.w !== w) return json(403, { error: "not your request" });
    if (!(await commit([{ create: `worldMythicBidDone/${id}`, data: { at: now(), k: "back" } }])).ok) return json(409, { error: "it was just filled" });
    const items = { ...(B.items || {}) }; delete items[id]; await setDoc(BD, { items });
    await deps.award(w, "mythic-bid-back", row.price); return json(200, { ok: true });
  }
  async function fill(b) {
    const m = await mine(b); if (m.err) return m.err; const { w, id, p, own } = m, bidId = String(b.bid || "");
    const B = (await one(BD)) || { items: {} }, row = (B.items || {})[bidId]; if (!row) return json(404, { error: "that request is gone" });
    if (row.w === w) return json(400, { error: "that's your own request" }); if (row.def !== p.def || Math.floor(p.plus || 0) < row.minPlus) return json(400, { error: "that piece doesn't match the request" });
    if (!(await commit([{ create: `worldMythicBidDone/${bidId}`, data: { at: now(), k: "fill", id } }])).ok) return json(409, { error: "someone else just filled it" });
    const items = { ...(B.items || {}) }; delete items[bidId]; await setDoc(BD, { items });
    const fee = Math.ceil(row.price * CC.MARKET.FEE); await deps.award(w, "mythic-sale", row.price - fee);
    const eqS = { ...(own.eq || {}) }; for (const [k, v] of Object.entries(eqS)) if (v === id) delete eqS[k];
    await setDoc(`worldMythicOwn/${w}`, { ...own, ids: (own.ids || []).filter((x) => x !== id), eq: eqS });
    const bo = await ownOf(row.w); await setDoc(`worldMythicOwn/${row.w}`, { ...bo, ids: [...(bo.ids || []), id] });
    await setDoc(`worldMythic/${id}`, { ...p, owner: row.w, first: p.first || w, hist: [...(p.hist || []), { from: w, to: row.w, price: row.price, at: now() }].slice(-20), log: logOf(p, "sold", row.price) });
    await commit([{ inc: "worldStats/mythicFee", fields: { arcl: fee, sales: 1 } }]).catch(() => {});
    await sold(p, row.price); touch(w).catch(() => {}); touch(row.w).catch(() => {});
    return json(200, { ok: true, price: row.price, fee });
  }
  // ---------------- step D: USDC ----------------
  const UQ = "worldMythicUsdQ/all";
  async function usdHold(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, id = String(b.id || ""); if (!/^m[a-z0-9]{6,24}$/.test(id)) return json(400, { error: "which piece?" });
    const p = await one(`worldMythic/${id}`); if (!p || p.state !== "GAME_LISTED" || p.cur !== "usdc") return json(404, { error: "it's not for sale for USDC any more" });
    if (p.owner === w) return json(400, { error: "that's your own piece" });
    const h = await one(`worldMythicHold/${id}`), t = now();
    if (h && h.until > t && h.w !== w) return json(409, { error: "someone is paying for it right now — try again in a few minutes", until: h.until });
    const until = h && h.w === w && h.until > t ? h.until : t + CC.USD.HOLD_MS; await setDoc(`worldMythicHold/${id}`, { w, until, listedAt: p.listedAt });
    return json(200, { ok: true, desk: SWAP.DESK, token: CC.USD.TOKEN, amount: centsToUnits(p.price).toString(), usd: p.price / 100, until });
  }
  async function usdRec(rec) {
    await setDoc(`worldMythicUsd/${rec.id}`, rec);
    const Q = (await one(UQ)) || { ids: [] }; await setDoc(UQ, { ids: [rec.id, ...(Q.ids || [])].slice(0, 500) });
    for (const who of [rec.seller, rec.buyer].filter(Boolean)) { const M0 = (await one(`worldMythicUsdMine/${who}`)) || { ids: [] }; await setDoc(`worldMythicUsdMine/${who}`, { ids: [rec.id, ...(M0.ids || [])].slice(0, 60) }); }
  }
  async function usdBuy(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, id = String(b.id || ""), tx = lc(b.tx);
    if (!/^m[a-z0-9]{6,24}$/.test(id)) return json(400, { error: "which piece?" }); if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "the transaction hash of your USDC transfer, please" });
    const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null;
    if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet — try again in a moment" });
    if (rc.status !== "0x1") return json(400, { error: "that transaction failed" });
    const p = await one(`worldMythic/${id}`), paid = usdcMoved(rc, w, SWAP.DESK);
    if (paid <= 0n) return json(400, { error: "no USDC from your wallet to the desk in that transaction" });
    if (!(await commit([{ create: `worldPayTx/${tx}`, data: { w, k: "mythic-usd", id, at: now() } }])).ok) return json(409, { error: "this transaction was already used" });
    const h = await one(`worldMythicHold/${id}`), ok = p && p.state === "GAME_LISTED" && p.cur === "usdc" && p.owner !== w && paid >= centsToUnits(p.price) && (!h || h.w === w || h.until < now());
    const rid0 = "u" + now().toString(36) + randomBytes(3).toString("hex");
    if (!ok || !(await commit([{ create: `worldMythicSold/${id}_${p.listedAt}`, data: { at: now(), buyer: w, usd: true } }])).ok) { // paid, but not this piece (gone, someone else's hold, too little): a refund for a GM
      await usdRec({ id: rid0, kind: "refund", buyer: w, piece: id, def: p && p.def, cents: Number(paid / 10n ** BigInt(CC.USD.DEC - 2)), tx, at: now(), status: "due" });
      return json(409, { error: "the piece wasn't available for this payment — the team will send your USDC back", refund: rid0 });
    }
    const fee = Math.ceil(p.price * CC.USD.FEE), seller = p.owner;
    const so = await ownOf(seller), bo = await ownOf(w), eqS = { ...(so.eq || {}) }; for (const [k, v] of Object.entries(eqS)) if (v === id) delete eqS[k];
    await setDoc(`worldMythicOwn/${seller}`, { ...so, ids: (so.ids || []).filter((x) => x !== id), eq: eqS }); await setDoc(`worldMythicOwn/${w}`, { ...bo, ids: [...(bo.ids || []), id] });
    const np = { ...p, owner: w, first: p.first || seller, state: "GAME_OWNED", price: 0, cur: "", hist: [...(p.hist || []), { from: seller, to: w, usd: p.price, at: now() }].slice(-20), log: logOf(p, "soldUsd", (p.price / 100).toFixed(2)) };
    await setDoc(`worldMythic/${id}`, np);
    const mk = (await one(MK)) || { items: {} }, items = { ...(mk.items || {}) }; delete items[id]; await setDoc(MK, { items });
    await commit([{ del: `worldMythicHold/${id}` }, { inc: "worldStats/mythicUsd", fields: { cents: p.price, fee, sales: 1 } }]).catch(() => {});
    await usdRec({ id: rid0, kind: "payout", seller, buyer: w, piece: id, def: p.def, cents: p.price, fee, net: p.price - fee, tx, at: now(), status: "due" });
    await sold({ ...p, usd: true }, p.price); touch(w).catch(() => {}); touch(seller).catch(() => {});
    return json(200, { ok: true, piece: np, payout: rid0 });
  }
  async function usdAdmin(b) {
    const s = signer(b); if (s.err) return s.err; if (!(deps.isGM && deps.isGM(s.wallet))) return json(403, { error: "for the team" });
    const op = String(b.op || "");
    if (op === "list") { const Q = (await one(UQ)) || { ids: [] }, ids = (Q.ids || []).slice(0, 200), d = ids.length ? await getDocs(ids.map((i) => `worldMythicUsd/${i}`)) : {}; return json(200, { ok: true, list: ids.map((i) => d[`worldMythicUsd/${i}`]).filter(Boolean) }); }
    if (op !== "paid" && op !== "refunded") return json(400, { error: "list, paid or refunded" });
    const id = String(b.id || "").replace(/[^0-9a-z]/gi, ""), r = await one(`worldMythicUsd/${id}`); if (!r) return json(404, { error: "no such record" }); if (r.status !== "due") return json(409, { error: "it's settled already" });
    if ((op === "paid") !== (r.kind === "payout")) return json(400, { error: r.kind === "payout" ? "this is a seller's payout: mark it paid" : "this is a refund: mark it refunded" });
    const gmTx = lc(b.gmTx); if (!/^0x[0-9a-f]{64}$/.test(gmTx)) return json(400, { error: "the transaction hash of your USDC transfer" });
    const rc = deps.receipt ? await deps.receipt(gmTx).catch(() => null) : null; if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet" }); if (rc.status !== "0x1") return json(400, { error: "that transaction failed" });
    const to = r.kind === "payout" ? r.seller : r.buyer, need = centsToUnits(r.kind === "payout" ? r.net : r.cents);
    if (usdcMoved(rc, s.wallet, to) < need) return json(400, { error: "that transfer from your wallet doesn't cover it" });
    if (!(await commit([{ create: `worldPayTx/${gmTx}`, data: { w: s.wallet, k: "mythic-usd-" + r.kind, id, at: now() } }])).ok) return json(409, { error: "this transaction was already used" });
    const nr = { ...r, status: op, gm: s.wallet, gmTx, doneAt: now() }; await setDoc(`worldMythicUsd/${id}`, nr);
    if (deps.audit) deps.audit(s.wallet, "mythic-usd-" + op, { id, to, cents: r.kind === "payout" ? r.net : r.cents, gmTx }).catch(() => {});
    return json(200, { ok: true, record: nr });
  }
  async function usdMine(w) { const M0 = (await one(`worldMythicUsdMine/${w}`)) || { ids: [] }, ids = (M0.ids || []).slice(0, 30), d = ids.length ? await getDocs(ids.map((i) => `worldMythicUsd/${i}`)) : {}; return ids.map((i) => d[`worldMythicUsd/${i}`]).filter(Boolean).map((r) => ({ id: r.id, kind: r.kind, def: r.def, cents: r.cents, net: r.net, status: r.status, at: r.at, me: r.seller === w ? "seller" : "buyer", gmTx: r.gmTx || "" })); }
  async function market() {
    const [mk, S, B] = await Promise.all([one(MK), one(SL), one(BD)]);
    return json(200, { items: Object.values((mk && mk.items) || {}).sort((a, b) => b.at - a.at).map((x) => ({ ...x, seller: short(x.seller) })), sales: ((S && S.list) || []).slice(-80),
      bids: Object.values((B && B.items) || {}).sort((a, b) => b.price - a.price).map((x) => ({ ...x, w: short(x.w) })) }, "no-store");
  }
  async function top() {
    const B = (await one("worldMythicBoard/all")) || { users: {} }, rows = Object.entries(B.users || {}).map(([w, u]) => ({ ...u, w: short(w) }));
    return json(200, { collect: [...rows].sort((a, b) => b.n - a.n || b.sum - a.sum || a.at - b.at).slice(0, 20), plus: [...rows].sort((a, b) => b.best - a.best || b.sum - a.sum || a.at - b.at).slice(0, 20) }, "no-store");
  }
  async function wornOf(w) { const { pieces, eq } = await list(w); const worn = Object.values(eq).map((i) => pieces.find((p) => p.id === i)).filter(Boolean).map((p) => ({ def: p.def, plus: p.plus || 0, stars: p.stars || 0, src: p.src })); return json(200, { n: worn.length, worn }, "no-store"); }
  return {
    roll, list,
    async read(url) { const w = String(url.searchParams.get("wallet") || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(w)) return json(400, { error: "wallet?" }); return json(200, { ...(await list(w)), usd: await usdMine(w).catch(() => []), now: now() }, "no-store"); },
    async worn(url) { const w = String(url.searchParams.get("wallet") || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(w)) return json(400, { error: "wallet?" }); return wornOf(w); },
    top,
    async handle(b) { const a = b.action; if (a === "world-mythic-equip") return equip(b); if (a === "world-mythic-enhance") return enhance(b); if (a === "world-mythic-salvage") return salvage(b);
      if (a === "world-mythic-list") return listIt(b); if (a === "world-mythic-unlist") return unlist(b); if (a === "world-mythic-buy") return buy(b);
      if (a === "world-mythic-claim") return claim(b); if (a === "world-mythic-reforge") return reforge(b); if (a === "world-mythic-awaken") return awaken(b);
      if (a === "world-mythic-usd-hold") return usdHold(b); if (a === "world-mythic-usd-buy") return usdBuy(b); if (a === "world-mythic-usd-admin") return usdAdmin(b);
      if (a === "world-mythic-bid") return bid(b); if (a === "world-mythic-unbid") return unbid(b); if (a === "world-mythic-fill") return fill(b); return null; },
    market,
  };
}
