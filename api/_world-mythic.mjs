// api/_world-mythic.mjs — MYTHIC gear held on the server: the Crimson Celestial set (world-mythic-data.js, the owner's
// spec v1.0). A piece is made here when a RAID QUEENS win rolls one (api/_world-raidq.mjs calls roll() once, after the
// run's done-lock), kept in worldMythic/<id> with its owner, origin, level to wear, multiplier and +, and listed for its
// owner in worldMythicOwn/<wallet> { ids, eq }. The save the device sends never holds one, so a piece can't be copied or
// made up there. What you wear is checked here: yours, your level ≥ its level, one a slot.
//   GET  ?world=mythic&wallet=0x…                                 { pieces: [...], eq: { slot: id } }
//   POST { action: "world-mythic-equip", …signature, slot, id }   wear (id) or take off (id null) — 403 not yours / too low
// Firestore: worldMythic/<id> { id, def, set, owner, src, req, mult, plus, state, at, run } · worldMythicOwn/<wallet> { ids, eq }
//            worldStats/mythic { <def>: n, <src>: n }
// The states the spec names (GAME_OWNED, GAME_LISTED, NFT_*) — only GAME_OWNED is made for now; trading and NFTs come next.
import { CC, pieceOf } from "../world-mythic-data.js";
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
    return { pieces, eq };
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
  return {
    roll, list,
    async read(url) { const w = String(url.searchParams.get("wallet") || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(w)) return json(400, { error: "wallet?" }); return json(200, await list(w), "no-store"); },
    async handle(b) { if (b.action === "world-mythic-equip") return equip(b); return null; },
  };
}
