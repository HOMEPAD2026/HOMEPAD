// world-mythic-data.js — the Crimson Celestial set (the owner's spec v1.0, 2026-10-25): the game's first MYTHIC gear, six
// pieces that drop from RAID QUEENS runs, held on the server (api/_world-mythic.mjs: worldMythic/<id>, never in the
// save the device sends), with set bonuses that stack at 2 / 3 / 4 / 5 / 6 different pieces worn. Shared by the game and
// the server; tests/world/mythic.test.mjs checks the numbers.
//   the owner's calls: SECRET drops are worn from Lv 100 · in-game trading before NFTs · NFTs later through GM-signed
//   vouchers (the server never holds a key) · an instance keeps its id, + and origin through every change of hands
import { itemStats } from "./world-rpg-data.js";

export const CC = {
  SET: "CRIMSON_CELESTIAL", NAME: "Crimson Celestial", RARITY: "MYTHIC", COLOR: "#ff3d6e", MAX_PLUS: 15,
  // the six pieces: their slot in the game's gear (world-rpg-data.js SLOTS), the owner's names, the model (models/world/mythic)
  PIECES: [
    { id: "CC_WEAPON", slot: "weapon", name: "Crimsonfall Reaper", glb: "cc-weapon", line: "Attack, critical damage" },
    { id: "CC_ARMOR", slot: "armor", name: "Celestial Aegis", glb: "cc-armor", line: "Defense, max HP" },
    { id: "CC_HELMET", slot: "helm", name: "Void Crown", glb: "cc-helmet", line: "Critical rate, skill damage" },
    { id: "CC_RING", slot: "ring", name: "Eclipse Ring", glb: "cc-ring", line: "Critical rate, attack" },
    { id: "CC_NECKLACE", slot: "necklace", name: "Crimson Heart", glb: "cc-necklace", line: "Max HP, skill damage" },
    { id: "CC_BOOTS", slot: "boots", name: "Skywalker Boots", glb: "cc-boots", line: "Speed, defense" },
  ],
  // a RAID QUEENS win's chance of one piece (one of the six at equal odds), its level to wear and its stats' multiplier
  DROP: {
    lysitha: { rate: 0.01, req: 100, mult: 1.0 },
    solvira: { rate: 0.02, req: 200, mult: 1.5 },
    nyxara: { rate: 1 / 30, req: 300, mult: 2.1 },
    throne: { rate: 0.1, req: 400, mult: 2.8 },
    secret: { rate: 0.2, req: 100, mult: 3.2 }, // (worn from Lv 100: the owner, 2026-10-25)
  },
  // the set's five bonuses, each kept once reached (different slots counted, a piece you can't wear yet doesn't count)
  BONUS: [
    [2, "Crimson Vitality", { atkPct: 5, hpPct: 5 }],
    [3, "Eclipse Instinct", { crit: 10, skillPct: 10 }],
    [4, "Celestial Dominion", { atkPct: 10, defPct: 10 }],
    [5, "Immortal Blood", { hpPct: 15, dr: 10 }],
    [6, "Crimson Ascension", { critDmg: 25, skillPct: 20, aura: 1 }],
  ],
  // what each piece adds on top of its slot's usual stats (the spec's "main traits")
  EXTRA: { weapon: { critDmg: 10 }, helm: { skillPct: 6 }, necklace: { skillPct: 6 }, armor: { dr: 3 } },
  MYTHIC_K: 1.3, // above the best Legendary there is (Lv 100, the save's cap) before the dungeon's multiplier
};
export const pieceOf = (id) => CC.PIECES.find((p) => p.id === id) || null;
export const pieceBySlot = (slot) => CC.PIECES.find((p) => p.slot === slot) || null;

/// one piece's stats: the slot's Legendary at Lv 100 with its +, × MYTHIC_K × the dungeon's multiplier (critical and
/// speed only partly, they have caps), plus the piece's own extra
export function mythicStats(inst) {
  const P = pieceOf(inst && inst.def); if (!P) return {};
  const plus = Math.max(0, Math.min(CC.MAX_PLUS, Math.floor(inst.plus || 0))), mult = Number(inst.mult) || 1;
  const base = itemStats({ b: `${P.slot}-4`, r: 4, lv: 100, p: plus }), out = {};
  for (const [k, v] of Object.entries(base)) out[k] = k === "crit" || k === "spd" ? Math.round(v * (1 + (mult - 1) * 0.1) * 10) / 10 : Math.round(v * CC.MYTHIC_K * mult);
  for (const [k, v] of Object.entries(CC.EXTRA[P.slot] || {})) out[k] = (out[k] || 0) + v;
  return out;
}

/// the set's bonuses for what's worn: { n, active: [[need, name]], stats } — worn is the list of instances you wear and can
export function setBonus(worn) {
  const slots = new Set((worn || []).map((w) => (pieceOf(w.def) || {}).slot).filter(Boolean)), n = slots.size, stats = {}, active = [];
  for (const [need, name, b] of CC.BONUS) if (n >= need) { active.push([need, name]); for (const [k, v] of Object.entries(b)) stats[k] = (stats[k] || 0) + v; }
  return { n, active, stats };
}
