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
// The states the spec names (GAME_OWNED, GAME_LISTED, NFT_*) — only GAME_OWNED is made for now; trading and NFTs come next.
import { CC, pieceOf, enhCost, essOf } from "../world-mythic-data.js";
import { levelOfSave } from "./_world-social.mjs";
import { randomBytes } from "node:crypto";
const SLOTS = CC.PIECES.map((p) => p.slot);
const WEARABLE = new Set(["GAME_OWNED", "NFT_ACTIVE"]);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), save(wallet) → the save, rand?() → [0, 1) }
export function makeMythic(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now(), rand = deps.rand || (() => randomBytes(6).readUIntBE(0, 6) / 2 ** 48);
  const one = async (p) => (await getDocs([p]))[p];
  const ownOf = async (w) => (await one(`worldMythicOwn/${w}`)) || { ids: [], eq: {} };
  /// a won run's roll: maybe one piece (the dungeon's rate), one of the six at equal odds; returns the piece or null
  async function roll(w, mode, run) {
    const D = CC.DROP[mode]; if (!D || rand() >= D.rate) return null;
    const P = CC.PIECES[Math.min(CC.PIECES.length - 1, Math.floor(rand() * CC.PIECES.length))], t = now();
    const id = ("m" + t.toString(36) + randomBytes(4).toString("hex")).slice(0, 20);
    const inst = { id, def: P.id, set: CC.SET, owner: w, src: mode, req: D.req, mult: D.mult, plus: 0, state: "GAME_OWNED", at: t, run };
    await setDoc(`worldMythic/${id}`, inst);
    const own = await ownOf(w); await setDoc(`worldMythicOwn/${w}`, { ...own, ids: [...(own.ids || []), id] });
    await commit([{ inc: "worldStats/mythic", fields: { [P.id]: 1, [mode]: 1 } }]).catch(() => {});
    return inst;
  }
  async function list(w) {
    const own = await ownOf(w), ids = (own.ids || []).slice(-200), d = ids.length ? await getDocs(ids.map((i) => `worldMythic/${i}`)) : {};
    const pieces = ids.map((i) => d[`worldMythic/${i}`]).filter((x) => x && x.owner === w);
    const eq = {}; for (const [s, i] of Object.entries(own.eq || {})) if (pieces.some((p) => p.id === i)) eq[s] = i; // (what was traded away isn't worn)
    return { pieces, eq, ess: own.ess || 0 };
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
    const c = enhCost(plus), ess = own.ess || 0; if (ess < c.ess) return json(400, { error: `${c.ess} Crimson Essence needed (you have ${ess})`, need: c });
    if (!deps.debit) return json(503, { error: "try again later" });
    const d = await deps.debit(w, "mythic-enh", c.arcl); if (d.err) return json(400, { error: d.err === "not enough ARCL" ? `${c.arcl.toLocaleString("en-US")} ARCL needed` : d.err, need: c });
    const hit = rand() < c.rate, np = hit ? plus + 1 : plus;
    await setDoc(`worldMythicOwn/${w}`, { ...own, ess: ess - c.ess });
    if (hit) await setDoc(`worldMythic/${id}`, { ...p, plus: np });
    await commit([{ inc: "worldStats/mythic", fields: { [hit ? "enhOk" : "enhMiss"]: 1 } }]).catch(() => {});
    return json(200, { ok: true, hit, plus: np, ess: ess - c.ess, bal: d.bal });
  }
  async function salvage(b) {
    const m = await mine(b); if (m.err) return m.err; const { w, id, p, own } = m, gain = essOf(p);
    const eq = { ...(own.eq || {}) }; for (const [k, v] of Object.entries(eq)) if (v === id) delete eq[k];
    await setDoc(`worldMythic/${id}`, { ...p, state: "SALVAGED", owner: "", at2: now() });
    await setDoc(`worldMythicOwn/${w}`, { ...own, ids: (own.ids || []).filter((x) => x !== id), eq, ess: (own.ess || 0) + gain });
    return json(200, { ok: true, ess: (own.ess || 0) + gain, gain });
  }
  const MK = "worldMythicMkt/all", short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  async function listIt(b) {
    const m = await mine(b); if (m.err) return m.err; const { w, id, p, own } = m, price = Math.floor(Number(b.price) || 0), M = CC.MARKET;
    if (!(price >= M.MIN && price <= M.MAX)) return json(400, { error: `a price from ${M.MIN.toLocaleString("en-US")} to ${M.MAX.toLocaleString("en-US")} ARCL` });
    const mk = (await one(MK)) || { items: {} }; if (Object.keys(mk.items || {}).length >= M.MAX_LISTED) return json(429, { error: "the market is full — try later" });
    const at = now(), eq = { ...(own.eq || {}) }; for (const [k, v] of Object.entries(eq)) if (v === id) delete eq[k];
    await setDoc(`worldMythic/${id}`, { ...p, state: "GAME_LISTED", price, listedAt: at });
    await setDoc(`worldMythicOwn/${w}`, { ...own, eq });
    await setDoc(MK, { items: { ...(mk.items || {}), [id]: { id, def: p.def, src: p.src, mult: p.mult, plus: p.plus || 0, req: p.req, price, at, seller: w } } });
    return json(200, { ok: true, price });
  }
  async function unlist(b) {
    const m = await mine(b, false); if (m.err) return m.err; const { id, p } = m; if (p.state !== "GAME_LISTED") return json(409, { error: "it isn't listed" });
    const mk = (await one(MK)) || { items: {} }, items = { ...(mk.items || {}) }; delete items[id];
    await setDoc(MK, { items }); await setDoc(`worldMythic/${id}`, { ...p, state: "GAME_OWNED", price: 0 });
    return json(200, { ok: true });
  }
  async function buy(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, id = String(b.id || "");
    if (!/^m[a-z0-9]{6,24}$/.test(id)) return json(400, { error: "which piece?" });
    const p = await one(`worldMythic/${id}`); if (!p || p.state !== "GAME_LISTED" || !p.price) return json(404, { error: "it's not for sale any more" });
    if (p.owner === w) return json(400, { error: "that's your own piece" });
    if (!(await commit([{ create: `worldMythicSold/${id}_${p.listedAt}`, data: { at: now(), buyer: w } }])).ok) return json(409, { error: "someone else just bought it" });
    if (!deps.debit || !deps.award) return json(503, { error: "try again later" });
    const d = await deps.debit(w, "mythic-buy", p.price); if (d.err) { await commit([{ del: `worldMythicSold/${id}_${p.listedAt}` }]).catch(() => {}); return json(400, { error: d.err === "not enough ARCL" ? `${p.price.toLocaleString("en-US")} ARCL needed` : d.err }); }
    const fee = Math.ceil(p.price * CC.MARKET.FEE), toSeller = p.price - fee, seller = p.owner;
    await deps.award(seller, "mythic-sale", toSeller);
    const so = await ownOf(seller), bo = await ownOf(w), eqS = { ...(so.eq || {}) }; for (const [k, v] of Object.entries(eqS)) if (v === id) delete eqS[k];
    await setDoc(`worldMythicOwn/${seller}`, { ...so, ids: (so.ids || []).filter((x) => x !== id), eq: eqS });
    await setDoc(`worldMythicOwn/${w}`, { ...bo, ids: [...(bo.ids || []), id] });
    await setDoc(`worldMythic/${id}`, { ...p, owner: w, state: "GAME_OWNED", price: 0, hist: [...(p.hist || []), { from: seller, to: w, price: p.price, at: now() }].slice(-20) });
    const mk = (await one(MK)) || { items: {} }, items = { ...(mk.items || {}) }; delete items[id]; await setDoc(MK, { items });
    await commit([{ inc: "worldStats/mythicFee", fields: { arcl: fee, sales: 1 } }]).catch(() => {});
    return json(200, { ok: true, id, price: p.price, fee, bal: d.bal });
  }
  async function market() { const mk = (await one(MK)) || { items: {} }; return json(200, { items: Object.values(mk.items || {}).sort((a, b) => b.at - a.at).map((x) => ({ ...x, seller: short(x.seller) })) }, "no-store"); }
  return {
    roll, list,
    async read(url) { const w = String(url.searchParams.get("wallet") || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(w)) return json(400, { error: "wallet?" }); return json(200, await list(w), "no-store"); },
    async handle(b) { const a = b.action; if (a === "world-mythic-equip") return equip(b); if (a === "world-mythic-enhance") return enhance(b); if (a === "world-mythic-salvage") return salvage(b);
      if (a === "world-mythic-list") return listIt(b); if (a === "world-mythic-unlist") return unlist(b); if (a === "world-mythic-buy") return buy(b); return null; },
    market,
  };
}
