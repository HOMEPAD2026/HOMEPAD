// world-rpg-data.js — the numbers of ARCIRCLE World's fighting: stats by level, the gear, sets, scammer levels, the
// hunting grounds. Shared by the game (world-rpg.js, world-combat.js) and the server (api/_world-shop.mjs: the Forge).
export const SLOTS = ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"];
export const SLOT_NAME = { weapon: "Weapon", shield: "Shield", armor: "Armor", helm: "Helmet", ring: "Ring", boots: "Boots", necklace: "Necklace" };
export const RARITY = [
  { id: "common", name: "Common", color: "#b8c2cc", mult: 1 },
  { id: "uncommon", name: "Uncommon", color: "#5fe08a", mult: 1.25 },
  { id: "rare", name: "Rare", color: "#4fa8ff", mult: 1.55 },
  { id: "epic", name: "Epic", color: "#b48cff", mult: 1.9 },
  { id: "legendary", name: "Legendary", color: "#ffc861", mult: 2.4 },
];
// five tiers per slot; a tier's items need its level and belong to its set
export const TIERS = [{ lv: 1, set: "Starter" }, { lv: 5, set: "Cold Wallet" }, { lv: 10, set: "Multisig" }, { lv: 15, set: "Vault" }, { lv: 20, set: "Arc" }];
export const BASES = {
  weapon: ["Phishing Hook Blade", "FUD Cleaver", "Rugbreaker", "Audit Saber", "ARCIRCLE Edge"],
  shield: ["Firewall Shield", "Spam Filter", "Multisig Ward", "Cold Bulwark", "Aegis of Arc"],
  armor: ["Hoodie Armor", "Cold Wallet Armor", "Ledger Mail", "Vault Plate", "Genesis Plate"],
  helm: ["Seed Guard Helm", "2FA Visor", "Hardware Helm", "Oracle Crown", "Zenith Helm"],
  ring: ["Multisig Ring", "Gas Ring", "Staker Band", "Burn Signet", "Infinity Ring"],
  boots: ["Gas-Saver Boots", "Bridge Runners", "Sprint Boots", "Flashloan Boots", "Lightspeed Boots"],
  necklace: ["Audit Pendant", "Proof Chain", "Hash Amulet", "Merkle Torc", "Arc Heart"],
};
export const baseId = (slot, tier) => `${slot}-${tier}`;
export const parseBase = (b) => { const m = /^([a-z]+)-([0-4])$/.exec(String(b || "")); return m && SLOTS.includes(m[1]) ? { slot: m[1], tier: +m[2] } : null; };

/// what one piece gives: { atk, def, hp, sp, crit, spd } — from its slot, level, rarity and enhancement
export function itemStats(it) {
  const p = parseBase(it && it.b); if (!p) return {};
  const lv = Math.max(1, it.lv || TIERS[p.tier].lv), k = RARITY[it.r || 0].mult * (1 + (it.p || 0) * 0.08), r = (x) => Math.round(x * k);
  switch (p.slot) {
    case "weapon": return { atk: r(4 + lv * 1.5) };
    case "shield": return { def: r(2 + lv * 0.9), hp: r(4 + lv * 1.5) };
    case "armor": return { def: r(3 + lv * 1.1), hp: r(10 + lv * 4) };
    case "helm": return { def: r(1.5 + lv * 0.6), hp: r(6 + lv * 2.5) };
    case "ring": return { atk: r(1 + lv * 0.4), crit: Math.round((2 + lv * 0.15) * k * 10) / 10 };
    case "boots": return { def: r(1 + lv * 0.3), spd: Math.round((3 + lv * 0.25) * k) };
    case "necklace": return { sp: r(10 + lv * 3), crit: Math.round((1 + lv * 0.1) * k * 10) / 10 };
  }
  return {};
}
export const itemName = (it) => { const p = parseBase(it.b); return p ? BASES[p.slot][p.tier] + (it.p ? ` +${it.p}` : "") : "?"; };
export const STAT_NAME = { atk: "Attack", def: "Defense", hp: "Max HP", sp: "Max SP", crit: "Critical", spd: "Speed" };

// the sets: pieces of one tier together
export const SET_BONUS = [[2, { atkPct: 5 }], [4, { defPct: 10, hpPct: 10 }], [7, { allPct: 15 }]];

/// a character's stats: the level, then the gear, then the set bonuses
export function statsOf(level, eq) {
  const s = { atk: 6 + level * 2, def: 2 + level, hp: 100 + (level - 1) * 12, sp: 100 + (level - 1) * 8, crit: 5, spd: 0 };
  const sets = {};
  for (const slot of SLOTS) {
    const it = eq && eq[slot]; if (!it) continue;
    const g = itemStats(it); for (const k in g) s[k] = (s[k] || 0) + g[k];
    const p = parseBase(it.b); if (p) sets[p.tier] = (sets[p.tier] || 0) + 1;
  }
  let atkPct = 0, defPct = 0, hpPct = 0, allPct = 0; const active = [];
  for (const [tier, n] of Object.entries(sets)) for (const [need, b] of SET_BONUS) if (n >= need) { atkPct += b.atkPct || 0; defPct += b.defPct || 0; hpPct += b.hpPct || 0; allPct += b.allPct || 0; active.push({ set: TIERS[tier].set, need }); }
  s.atk = Math.round(s.atk * (1 + (atkPct + allPct) / 100)); s.def = Math.round(s.def * (1 + (defPct + allPct) / 100));
  s.hp = Math.round(s.hp * (1 + (hpPct + allPct) / 100)); s.sp = Math.round(s.sp * (1 + allPct / 100));
  s.crit = Math.min(60, Math.round(s.crit * 10) / 10); s.spd = Math.min(40, s.spd);
  s.sets = active;
  return s;
}
export const skillLevel = (level, unlock) => (level < unlock ? 0 : Math.min(5, 1 + Math.floor((level - unlock) / 3)));

// scammers by level
export const mobStats = (lv, rank = "") => {
  const k = rank === "boss" ? 14 : rank === "elite" ? 2.6 : 1;
  return { hp: Math.round((20 + lv * 14) * k), atk: Math.round((8 + lv * 4.5) * (rank === "boss" ? 1.6 : rank === "elite" ? 1.3 : 1)), def: Math.round(lv * 1.2), xp: Math.round((6 + lv * 3) * (rank === "boss" ? 15 : rank === "elite" ? 3 : 1)) };
};
export const hitDamage = (atk, def) => Math.max(1, Math.round(atk - def * 0.5));

// the hunting grounds: where they are on the flat ground (x, z), how big, which levels, which scammers
export const ZONES = [
  { id: "spam", name: "Spam Alley", lv: [1, 5], x: 0, z: 100, r: 24, color: 0x8fd6ff, ground: 0x2c4a3a, fog: 0x9fc8d8, mobs: ["spam", "drop"], boss: { name: "The Spam King", model: "EyeDrone", scale: 1.6, y: 2.2, tint: 0xff4d6d } },
  { id: "fields", name: "Airdrop Fields", lv: [5, 10], x: 86, z: 50, r: 26, color: 0xffc861, ground: 0x4a5a2c, fog: 0xe8d8a8, mobs: ["drop", "spam"], boss: { name: "The Free Mint", model: "QuadShell", scale: 1.7, y: 0.9, tint: 0xffc861 } },
  { id: "swamp", name: "Honeypot Swamp", lv: [10, 15], x: 86, z: -50, r: 26, color: 0x7fe05a, ground: 0x24382a, fog: 0x5a7a52, mobs: ["rug", "drop"], boss: { name: "The Honeypot Queen", model: "Trilobite", scale: 1.7, y: 1.0, tint: 0xffa63a } },
  { id: "canyon", name: "Rug Canyon", lv: [15, 20], x: -48, z: -90, r: 26, color: 0xff7a3c, ground: 0x5a3426, fog: 0xc88a68, mobs: ["rug", "spam"], boss: { name: "The Rug Titan", model: "QuadShell", scale: 2.0, y: 1.0, tint: 0xff4d2a } },
  { id: "depths", name: "Dark Market Depths", lv: [20, 30], x: -96, z: 62, r: 26, color: 0xb48cff, ground: 0x1a1428, fog: 0x2a1e40, mobs: ["rug", "drop", "spam"], boss: { name: "The Rug Dragon", model: "Trilobite", scale: 2.1, y: 1.2, tint: 0xb48cff } },
];
export const zoneAt = (x, z) => ZONES.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r) || null;

// the Forge: what it sells for ARCL (the server keeps these prices; tiers 0–3, Legendary only from bosses)
export const FORGE_PRICE = [40, 120, 300, 700];
export const FORGE_SUPPLY = { "hp5": { name: "5 health potions", arcl: 30, kind: "hp", n: 5 }, "sp5": { name: "5 mana potions", arcl: 30, kind: "sp", n: 5 }, "recall3": { name: "3 recall scrolls", arcl: 20, kind: "recall", n: 3 } };
export const forgeId = (slot, tier) => `${slot}:${tier}`;
