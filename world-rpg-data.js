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

// tempering a weapon at the workbench with what you gathered (world-life.js): five stages, each 4% more and a
// brighter glow. Materials are game-only (never ARCL); the server keeps tm 0–5 (api/_world.mjs cleanItem).
export const TEMPER_MAX = 5, TEMPER_STEP = 0.04;
export const temperOf = (it) => Math.max(0, Math.min(TEMPER_MAX, Math.floor(Number(it && it.tm) || 0)));
/// what stage n (1–5) costs
export const temperCost = (n) => ({ ore: 4 * n, crystal: 3 * n, wood: 2 * n, scrap: 20 * n });

// durability (Epic and Legendary only, r >= 3): `du` on the item is what is left; absent = full, so older saves need no
// migration. A weapon loses 1 per knock-out, the shield, armor, helmet and boots 1 per 3 s of taking damage
// (world-rpg.js wear). At 0 the piece is BROKEN: it comes off, gives no stats and can't be worn until it is repaired
// at the Magic Forge (the Forge panel's tab), for $ARCIRCLE only; at your own island 3 repairs a day are free.
// api/_world-shop.mjs mirrors DUR_MAX, REPAIR_PRICE and REPAIR_FREE_DAY (the server keeps them).
export const DUR_MAX = { 3: 300, 4: 500 };
/// $ARCIRCLE per repair, by rarity (the one place to change it; the server's REPAIR_PRICE must agree)
export const REPAIR_PRICE = { 3: 500, 4: 1500 };
export const REPAIR_FREE_DAY = 3, WEAR_WARN = 0.2, WEAR_HURT_MS = 3000;
export const WEAR_KILL = ["weapon"], WEAR_HURT = ["shield", "armor", "helm", "boots"];
export const durMax = (it) => DUR_MAX[it && it.r] || 0;
/// what is left of a piece, or null when it doesn't wear (Common to Rare)
export const durOf = (it) => { const m = durMax(it); return m ? (it.du == null ? m : Math.max(0, Math.min(m, Math.floor(Number(it.du)) || 0))) : null; };
export const isBroken = (it) => durOf(it) === 0;

/// what one piece gives: { atk, def, hp, sp, crit, spd } — from its slot, level, rarity and enhancement
export function itemStats(it) {
  const p = parseBase(it && it.b); if (!p) return {};
  const lv = Math.max(1, it.lv || TIERS[p.tier].lv), k = RARITY[it.r || 0].mult * (1 + (it.p || 0) * 0.08) * (1 + temperOf(it) * TEMPER_STEP), r = (x) => Math.round(x * k);
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
// one-of-a-kind pieces (it.u): their own name in place of the base's (the Halloween Pumpkin King's blade, api/_world-halloween.mjs)
export const UNIQUE = { jack: "Jack's Inferno Blade" };
export const itemName = (it) => { const p = parseBase(it.b); return p ? (UNIQUE[it.u] || BASES[p.slot][p.tier]) + (it.p ? ` +${it.p}` : "") : "?"; };
export const STAT_NAME = { atk: "Attack", def: "Defense", hp: "Max HP", sp: "Max SP", crit: "Critical", spd: "Speed" };

// the sets: pieces of one tier together
export const SET_BONUS = [[2, { atkPct: 5 }], [4, { defPct: 10, hpPct: 10 }], [7, { allPct: 15 }]];

/// a character's stats: the level, then the gear, then the set bonuses
export function statsOf(level, eq, extra) {
  const s = { atk: 6 + level * 2, def: 2 + level, hp: 100 + (level - 1) * 12, sp: 100 + (level - 1) * 8, crit: 5, spd: 0 };
  const sets = {};
  for (const slot of SLOTS) {
    const it = eq && eq[slot]; if (!it || isBroken(it)) continue; // a broken piece gives nothing
    if (extra && extra.skip && extra.skip[slot]) continue; // a MYTHIC piece worn in this slot takes its place (world-mythic-data.js: its stats come in extra)
    const g = itemStats(it); for (const k in g) s[k] = (s[k] || 0) + g[k];
    const p = parseBase(it.b); if (p) sets[p.tier] = (sets[p.tier] || 0) + 1;
  }
  let atkPct = 0, defPct = 0, hpPct = 0, allPct = 0; const active = [];
  for (const [tier, n] of Object.entries(sets)) for (const [need, b] of SET_BONUS) if (n >= need) { atkPct += b.atkPct || 0; defPct += b.defPct || 0; hpPct += b.hpPct || 0; allPct += b.allPct || 0; active.push({ set: TIERS[tier].set, need }); }
  s.atk = Math.round(s.atk * (1 + (atkPct + allPct) / 100)); s.def = Math.round(s.def * (1 + (defPct + allPct) / 100));
  s.hp = Math.round(s.hp * (1 + (hpPct + allPct) / 100)); s.sp = Math.round(s.sp * (1 + allPct / 100));
  // the title you wear adds a little (TITLE_BONUS)
  if (extra) for (const k of ["atk", "def", "hp", "sp", "crit", "spd"]) if (extra[k]) s[k] += extra[k];
  // the village blessing: a share more max HP
  if (extra && extra.hpPct) s.hp = Math.round(s.hp * (1 + extra.hpPct / 100));
  // the item codex's full columns (api/_world-codex.mjs CODEX.SET): a share more attack / defense
  if (extra && extra.atkPct) s.atk = Math.round(s.atk * (1 + extra.atkPct / 100));
  if (extra && extra.defPct) s.def = Math.round(s.def * (1 + extra.defPct / 100));
  // small passives on the way to the first skill: level 3 tougher, 5 quicker, 7 sharper
  if (level >= 3) s.hp = Math.round(s.hp * 1.05);
  if (level >= 5) s.spd += 5;
  if (level >= 7) s.crit += 3;
  s.crit = Math.min(60, Math.round(s.crit * 10) / 10); s.spd = Math.min(40, s.spd);
  // the Crimson Celestial set's own stats: critical damage %, skill damage %, damage reduction % (world-combat.js reads them)
  s.critDmg = (extra && extra.critDmg) || 0; s.skillPct = (extra && extra.skillPct) || 0; s.dr = Math.min(50, (extra && extra.dr) || 0);
  s.sets = active;
  return s;
}
export const PASSIVES = [{ lv: 3, name: "Tough skin", line: "Max HP +5%" }, { lv: 5, name: "Quick feet", line: "Speed +5%" }, { lv: 7, name: "Sharp eye", line: "Critical +3%" }];
export const skillLevel = (level, unlock) => (level < unlock ? 0 : Math.min(5, 1 + Math.floor((level - unlock) / 5)));

// scammers by level
// levels: the XP from one level to the next grows with the level — 100 at level 1, about 450 at 10, 1,000 at 20,
// 2,800 at 40 and 8,700 at 80 (so about 10 knock-outs of your own level early on, about 35 at level 80).
// Saves from before (100 XP every level, xpv missing) are converted once so nobody's level changes (xpFromOld).
// api/_world-social.mjs keeps the same numbers for the server.
export const XP_VERSION = 2;
// Levels 1–200 keep the curve they always had; past 200 each level costs 150 XP more than the one before (about 46,000
// at 200, 91,000 at 500), a long, steady climb to the cap. Nobody's level changes: below 200 the numbers are the same.
export const LV_MAX = 500, LV_BEND = 200;
const need0 = (lv) => 100 + 30 * (lv - 1) + (lv - 1) * (lv - 1);
const at0 = (lv) => { const n = Math.max(0, Math.floor(lv) - 1); return 100 * n + 15 * n * (n - 1) + ((n - 1) * n * (2 * n - 1)) / 6; };
export const xpNeed = (lv) => (lv < LV_BEND ? need0(lv) : need0(LV_BEND) + 150 * (lv - LV_BEND));
export const xpAt = (lv) => { const L = Math.floor(lv); if (L <= LV_BEND) return at0(L); const m = L - LV_BEND; return at0(LV_BEND) + m * need0(LV_BEND) + 75 * m * (m - 1); };
export const XP_MAX = xpAt(LV_MAX);
export const levelOfXp = (xp) => { const v = Math.max(0, Number(xp) || 0); let lo = 1, hi = LV_MAX; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (xpAt(mid) <= v) lo = mid; else hi = mid - 1; } return lo; };
export const xpFromOld = (xp) => { const v = Math.max(0, Math.floor(Number(xp) || 0)), lv = 1 + Math.floor(v / 100); return xpAt(lv) + Math.floor(((v % 100) / 100) * xpNeed(lv)); };
/// where you are inside your level: { lv, into, need }
export const xpProgress = (xp) => { const lv = levelOfXp(xp); return { lv, into: Math.floor(xp - xpAt(lv)), need: xpNeed(lv) }; };
// tougher since b401: every scammer has about a third more health and a tenth more bite, elites more again, and a
// boss is a real fight (24x a scammer's health, 1.9x its attack, a thicker hide). XP per knock-out is unchanged.
export const MOB_K = { hp: { "": 1, elite: 3.4, boss: 24 }, atk: { "": 1, elite: 1.4, boss: 1.9 }, def: { "": 1, elite: 1.2, boss: 1.5 } };
export const mobStats = (lv, rank = "") => {
  const r = rank === "boss" || rank === "elite" ? rank : "";
  return { hp: Math.round((27 + lv * 19) * MOB_K.hp[r]), atk: Math.round((9 + lv * 5) * MOB_K.atk[r]), def: Math.round(lv * 1.5 * MOB_K.def[r]), xp: Math.round((6 + lv * 3) * (rank === "boss" ? 15 : rank === "elite" ? 3 : 1)) };
};
export const hitDamage = (atk, def) => Math.max(1, Math.round(atk - def * 0.5));

// the hunting grounds: where they are on the flat ground (x, z), how big, which levels, which scammers
export const ZONES = [
  { id: "spam", name: "Spam Alley", lv: [1, 5], x: 0, z: 100, r: 24, color: 0x8fd6ff, ground: 0x2c4a3a, fog: 0x9fc8d8, mobs: ["spam", "drop"], boss: { name: "The Spam King", line: "Ten thousand messages, one bad link", model: "EyeDrone", scale: 1.6, y: 2.2, tint: 0xff4d6d } },
  { id: "fields", name: "Airdrop Fields", lv: [5, 10], x: 86, z: 50, r: 26, color: 0xffc861, ground: 0x4a5a2c, fog: 0xe8d8a8, mobs: ["drop", "spam"], skins: { spam: "Wasp" }, boss: { name: "The Free Mint", line: "Nothing is free if it asks for your keys", model: "QuadShell", scale: 1.7, y: 0.9, tint: 0xffc861 } },
  { id: "swamp", name: "Honeypot Swamp", lv: [10, 15], x: 86, z: -50, r: 26, color: 0x7fe05a, ground: 0x24382a, fog: 0x5a7a52, mobs: ["rug", "drop"], skins: { rug: "Frog", drop: "Snake" }, boss: { name: "The Honeypot Queen", line: "Easy to buy, impossible to sell", model: "Trilobite", scale: 1.7, y: 1.0, tint: 0xffa63a, skin: "Wasp", skinH: 3.0 } },
  { id: "canyon", name: "Rug Canyon", lv: [15, 20], x: -48, z: -90, r: 26, color: 0xff7a3c, ground: 0x5a3426, fog: 0xc88a68, mobs: ["rug", "spam"], skins: { rug: "Rat", spam: "Spider" }, boss: { name: "The Rug Titan", line: "Pulls the liquidity and runs", model: "QuadShell", scale: 2.0, y: 1.0, tint: 0xff4d2a, skin: "Skeleton", skinH: 4.6 } },
  { id: "depths", name: "Dark Market Depths", lv: [20, 30], x: -96, z: 62, r: 26, color: 0xb48cff, ground: 0x1a1428, fog: 0x2a1e40, mobs: ["rug", "drop", "spam"], skins: { rug: "Bat", drop: "Slime", spam: "Skeleton" }, boss: { name: "The Rug Dragon", line: "Hoards what it never earned", model: "Trilobite", scale: 2.1, y: 1.2, tint: 0xb48cff, skin: "Dragon", skinH: 4.2 } },
  // the far ring, Lv 30–100: each ten levels its own ground, harder scammers (pow multiplies their HP and attack),
  // elites more often, and its own boss
  { id: "peaks", name: "Ponzi Peaks", lv: [30, 40], x: 46, z: 172, r: 28, color: 0x8fe6ff, ground: 0x7f9cb2, fog: 0xbcd8ea, mobs: ["spam", "drop"], skins: { spam: "Bat", drop: "Slime" }, boss: { name: "The Ponzi Patriarch", line: "Pays the old with the new", model: "QuadShell", scale: 2.0, y: 1.0, tint: 0x8fe6ff, skin: "Skeleton", skinH: 4.8 }, deco: "ice", pow: 1.15, elite: 0.16 },
  { id: "dunes", name: "Exit-Scam Desert", lv: [40, 50], x: 161, z: 75, r: 28, color: 0xffc861, ground: 0x8a6a3a, fog: 0xe8c890, mobs: ["rug", "spam"], skins: { rug: "Snake", spam: "Spider" }, boss: { name: "The Sand Wyrm", line: "Vanishes with the treasury", model: "Trilobite", scale: 2.2, y: 1.2, tint: 0xffc861, skin: "Dragon", skinH: 4.6 }, deco: "dunes", pow: 1.25, elite: 0.18 },
  { id: "reef", name: "Phishing Reef", lv: [50, 60], x: 161, z: -75, r: 28, color: 0x35d8d0, ground: 0x0e3a40, fog: 0x2a7a80, mobs: ["spam", "drop"], skins: { spam: "Wasp", drop: "Frog" }, boss: { name: "The Kraken Phisher", line: "Every arm holds a fake login", model: "Trilobite", scale: 2.3, y: 1.0, tint: 0x35d8d0, skin: "Spider", skinH: 4.4 }, deco: "reef", pow: 1.35, elite: 0.2 },
  { id: "wastes", name: "Bot Farm Wastes", lv: [60, 70], x: 46, z: -172, r: 28, color: 0x9aff3c, ground: 0x2a3a14, fog: 0x6a8a2a, mobs: ["drop", "rug", "spam"], skins: { drop: "Rat", rug: "Spider", spam: "Wasp" }, boss: { name: "The Swarm Mother", line: "A million bots, one fake crowd", model: "EyeDrone", scale: 2.0, y: 2.0, tint: 0x9aff3c, skin: "Wasp", skinH: 3.8 }, deco: "toxic", pow: 1.45, elite: 0.22 },
  { id: "ruins", name: "Fake Exchange Ruins", lv: [70, 80], x: -102, z: -146, r: 28, color: 0xb48cff, ground: 0x2a1e3a, fog: 0x4a3a6a, mobs: ["rug", "drop", "spam"], skins: { rug: "Skeleton", drop: "Slime", spam: "Bat" }, boss: { name: "The Insolvent King", line: "Withdrawals paused, forever", model: "QuadShell", scale: 2.2, y: 1.0, tint: 0xb48cff, skin: "Skeleton", skinH: 5.4 }, deco: "ruins", pow: 1.55, elite: 0.25 },
  { id: "abyss", name: "Bridge Hack Abyss", lv: [80, 90], x: -177, z: -16, r: 28, color: 0xff4d2a, ground: 0x2a0e0a, fog: 0x5a1a10, mobs: ["spam", "rug", "drop"], skins: { spam: "Bat", rug: "Snake", drop: "Skeleton" }, boss: { name: "The Bridge Breaker", line: "Took the bridge and all it carried", model: "Trilobite", scale: 2.4, y: 1.3, tint: 0xff4d2a, skin: "Dragon", skinH: 5.2 }, deco: "lava", pow: 1.7, elite: 0.28 },
  { id: "void", name: "The Last Rug", lv: [90, 100], x: -126, z: 126, r: 28, color: 0xff4dd2, ground: 0x14081e, fog: 0x2a1040, mobs: ["rug", "spam", "drop"], skins: { rug: "Skeleton", spam: "Wasp", drop: "Spider" }, boss: { name: "The Final Rug", line: "The last pull of all", model: "Trilobite", scale: 2.6, y: 1.4, tint: 0xff4dd2, skin: "Dragon", skinH: 6.2 }, deco: "void", pow: 1.9, elite: 0.32 },
];
export const zoneAt = (x, z) => ZONES.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r) || null;
/// a far ground's fishing pond (world-life.js draws it, world-zones-far.js keeps props off it): to the side of the
/// ground, away from its gate
export const pondOf = (zn) => { if (!zn || zn.lv[0] < 30) return null; const a = Math.atan2(zn.z, zn.x) + 1.9, d = zn.r * 0.52; return { x: zn.x + Math.cos(a) * d, z: zn.z + Math.sin(a) * d, r: 2.6 }; };

// the Forge: what it sells for ARCL (the server keeps these prices: api/_world-shop.mjs). Tiers 0–3, and the Arc set
// (tier 4, Legendary) from level 20 for 6,000.
export const FORGE_PRICE = [40, 120, 300, 700, 6000];
// the Masterwork bench: Arc-set Epic or Legendary pieces made at your level band (each ten levels, 20–100), plain or
// already enhanced to +5 or +10. The dearest, a +10 Legendary at level 100, is 105,000 ARCL.
export const mwBand = (level) => Math.max(20, Math.min(100, Math.floor(Number(level) / 10) * 10));
export const mwPrice = (lv, r, p) => Math.round(((r === 4 ? 2000 + 280 * lv : 400 + 60 * lv) * (p === 10 ? 3.5 : p === 5 ? 1.8 : 1)) / 10) * 10;
export const mwId = (slot, r, p) => `mw:${slot}:${r}:${p}`;
export const FORGE_SUPPLY = { "hp5": { name: "5 health potions", arcl: 30, kind: "hp", n: 5 }, "sp5": { name: "5 mana potions", arcl: 30, kind: "sp", n: 5 }, "recall3": { name: "3 recall scrolls", arcl: 20, kind: "recall", n: 3 },
  "hp20": { name: "20 health potions", arcl: 100, kind: "hp", n: 20 }, "sp20": { name: "20 mana potions", arcl: 100, kind: "sp", n: 20 }, "recall10": { name: "10 recall scrolls", arcl: 60, kind: "recall", n: 10 },
  "scrap100": { name: "100 scrap", arcl: 150, kind: "scrap", n: 100 }, "scrap500": { name: "500 scrap", arcl: 650, kind: "scrap", n: 500 } };
export const forgeId = (slot, tier) => `${slot}:${tier}`;
// selling back to the Forge (the server keeps the same numbers: api/_world-shop.mjs SELL_PRICE, 1,500 a day), and the
// day's ARCL limit everything shares (DAILY_CAP there)
export const SELL_PRICE = [6, 18, 45, 110, 260], SELL_DAY_CAP = 1500, ARCL_DAY_CAP = 30000;
export const sellPrice = (it) => Math.round(SELL_PRICE[Math.max(0, Math.min(4, Math.floor(Number(it && it.r) || 0)))] * (1 + 0.05 * Math.max(0, Math.min(10, Math.floor(Number(it && it.p) || 0)))));

// titles: each achievement's title adds a small bonus while you wear it (world-quests.js; "season" from the season log)
export const TITLE_BONUS = {
  k10: { atk: 2 }, k100: { atk: 5 }, k1000: { atk: 10 }, e25: { crit: 2 }, b1: { hp: 30 }, b10: { hp: 80 }, leg: { crit: 3 },
  zones: { spd: 4 }, plus10: { def: 6 }, lv20: { atk: 4, def: 4 }, raid1: { def: 8 }, quiz: { sp: 30 }, season: { atk: 3, def: 3 },
  gpeaks: { hp: 60 }, gdunes: { spd: 5 }, greef: { sp: 50 }, gwastes: { atk: 6 }, gruins: { def: 10 }, gabyss: { crit: 4 }, gvoid: { atk: 8, def: 8 },
};
export const bonusLine = (b) => Object.entries(b || {}).map(([k, v]) => `${STAT_NAME[k]} +${v}${k === "crit" || k === "spd" ? "%" : ""}`).join(", ");

// the four skills (world-combat.js SKILLS has their numbers): when each is learned
export const SKILL_INFO = [{ id: "ice", name: "Ice Ball", lv: 10 }, { id: "fire", name: "Fire Ball", lv: 20 }, { id: "shock", name: "Shock", lv: 40 }, { id: "meteor", name: "Meteor", lv: 80 }];
// skill branches: at skill level 2 each skill picks one of two ways to grow (saved in P.rpg.x.br)
export const BRANCH_AT = 2;
export const BRANCHES = {
  ice: [{ id: "a", name: "Deep Freeze", line: "Slows for 5 seconds and freezes for a moment" }, { id: "b", name: "Shatter", line: "30% more damage" }],
  fire: [{ id: "a", name: "Wildfire", line: "A wider blast that hits the crowd harder" }, { id: "b", name: "Inferno", line: "Burns twice as hard, for longer" }],
  shock: [{ id: "a", name: "Long Chain", line: "Jumps to two more scammers" }, { id: "b", name: "Overload", line: "Stuns twice as long, 20% more damage" }],
  meteor: [{ id: "a", name: "Twin Star", line: "A second meteor follows the first" }, { id: "b", name: "Crater", line: "A crater half again as wide" }],
};

// gear fusion at the Forge: three pieces of one rarity (Common or Uncommon) make one of the next rarity
export const FUSE_MAX_R = 1;
/// the piece three make: one of their slots, the highest tier and level among them, one rarity up
export const FUSE_PICK_SCRAP = 30;
export function fuseResult(items, pickSlot = Math.random(), want = "") {
  if (!Array.isArray(items) || items.length !== 3) return null;
  const r = items[0].r || 0; if (r > FUSE_MAX_R || items.some((x) => (x.r || 0) !== r)) return null;
  const ps = items.map((x) => parseBase(x.b)); if (ps.some((p) => !p)) return null;
  const slot = want && ps.some((p) => p.slot === want) ? want : ps[Math.min(2, Math.floor(pickSlot * 3))].slot, tier = Math.max(...ps.map((p) => p.tier)), lv = Math.max(...items.map((x) => x.lv || 1));
  return { b: baseId(slot, tier), r: r + 1, lv, p: 0 };
}

// this week's XP events (Seoul time): one hunting ground a weekday, everywhere at the weekend — XP only
export const WEEKDAY_ZONE = [null, "spam", "fields", "swamp", "canyon", "depths", null];
// …and one of the far ring each weekday too (the last two only at the weekend, when every ground has it)
export const WEEKDAY_FAR = [null, "peaks", "dunes", "reef", "wastes", "ruins", null];
export const XP_EVENT = 1.5;
export function xpEvent(t = Date.now()) {
  const d = new Date(t + 9 * 3600e3).getUTCDay();
  return d === 0 || d === 6 ? { all: true, k: XP_EVENT, zone: null, far: null } : { all: false, k: XP_EVENT, zone: WEEKDAY_ZONE[d], far: WEEKDAY_FAR[d] };
}
export const xpBoost = (zoneId, t = Date.now()) => { const e = xpEvent(t); return e.all || (zoneId && (zoneId === e.zone || zoneId === e.far)) ? e.k : 1; };
/// the weekend's golden rush: golden scammers turn up three times as often (only the chance: they still run)
/// this week's event, turning every week (Seoul time, weeks from Monday): "boss" — bosses come back every 15 minutes
/// instead of 30; "elite" — twice the elites; "gold" — golden scammers twice as often all week
export const WEEK_EVENTS = { boss: { name: "Boss rush", line: "Bosses come back every 15 minutes" }, elite: { name: "Elite week", line: "Twice as many elite scammers" }, gold: { name: "Golden week", line: "Golden scammers twice as often" } };
export const weekEvent = (t = Date.now()) => ["boss", "elite", "gold"][Math.floor((t + 9 * 3600e3 - Date.UTC(1970, 0, 5)) / 6048e5) % 3];
export const goldenRush = (t = Date.now()) => (xpEvent(t).all ? 3 : 1) * (weekEvent(t) === "gold" ? 2 : 1);

// companions: one comes with each of three achievements; they grow with the scammers knocked out beside them
export const PETS = [
  { id: "drone", name: "Drone", need: "k10", line: "Zaps the nearest scammer every few seconds" },
  { id: "cat", name: "Cat", need: "b1", line: "Pulls street items to you from farther away" },
  { id: "wisp", name: "Arc Wisp", need: "zones", line: "Mends a little of your HP every few seconds" },
];
// ---- pets from eggs (b422; the server rolls them: api/_world-shop.mjs PET, which has the same ids and rarities) ----
// 27 species, each with a fixed rarity (0 Common … 4 Legendary) and one ability. The three companions above are
// species too (their achievement still opens them). m: the model in kenney-pets.glb, animals only.
//   speed: +% move · collector: auto-pick radius (m) for street items and chests · luck: better gear drops ·
//   vigour: +% max HP and a little regen · scholar: +% XP · guard: zaps scammers (mode "zap") or mends you ("heal")
export const PET_SPECIES = [
  { id: "bunny", r: 0, ab: "speed", name: "Bunny", m: "animal-bunny" }, { id: "chick", r: 0, ab: "scholar", name: "Chick", m: "animal-chick" },
  { id: "pig", r: 0, ab: "collector", name: "Piglet", m: "animal-pig" }, { id: "cow", r: 0, ab: "vigour", name: "Cow", m: "animal-cow" },
  { id: "hog", r: 0, ab: "luck", name: "Hog", m: "animal-hog" }, { id: "beaver", r: 0, ab: "collector", name: "Beaver", m: "animal-beaver" },
  { id: "caterpillar", r: 0, ab: "scholar", name: "Caterpillar", m: "animal-caterpillar" }, { id: "crab", r: 0, ab: "guard", mode: "zap", name: "Crab", m: "animal-crab" },
  { id: "deer", r: 1, ab: "speed", name: "Deer", m: "animal-deer" }, { id: "dog", r: 1, ab: "guard", mode: "zap", name: "Dog", m: "animal-dog" },
  { id: "kitten", r: 1, ab: "luck", name: "Kitten", m: "animal-cat" }, { id: "bee", r: 1, ab: "collector", name: "Bee", m: "animal-bee" },
  { id: "fish", r: 1, ab: "scholar", name: "Fish", m: "animal-fish" }, { id: "penguin", r: 1, ab: "vigour", name: "Penguin", m: "animal-penguin" },
  { id: "koala", r: 1, ab: "vigour", name: "Koala", m: "animal-koala" },
  { id: "fox", r: 2, ab: "speed", name: "Fox", m: "animal-fox" }, { id: "monkey", r: 2, ab: "collector", name: "Monkey", m: "animal-monkey" },
  { id: "parrot", r: 2, ab: "scholar", name: "Parrot", m: "animal-parrot" }, { id: "panda", r: 2, ab: "vigour", name: "Panda", m: "animal-panda" },
  { id: "drone", r: 2, ab: "guard", mode: "zap", name: "Drone", need: "k10" }, { id: "cat", r: 2, ab: "collector", name: "Cat", need: "b1" },
  { id: "tiger", r: 3, ab: "guard", mode: "zap", name: "Tiger", m: "animal-tiger" }, { id: "lion", r: 3, ab: "speed", name: "Lion", m: "animal-lion" },
  { id: "polar", r: 3, ab: "luck", name: "Polar Bear", m: "animal-polar" }, { id: "wisp", r: 3, ab: "guard", mode: "heal", name: "Arc Wisp", need: "zones" },
  { id: "elephant", r: 4, ab: "vigour", name: "Elephant", m: "animal-elephant" }, { id: "giraffe", r: 4, ab: "collector", name: "Giraffe", m: "animal-giraffe" },
];
export const PET_BY = Object.fromEntries(PET_SPECIES.map((p) => [p.id, p]));
export const PET_RARITY = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
export const PET_AB = {
  speed: { name: "Swift", line: "Move {v}% faster" }, collector: { name: "Collector", line: "Picks up items and chests within {v} m" },
  luck: { name: "Lucky", line: "Better gear drops (+{v}% luck)" }, vigour: { name: "Sturdy", line: "+{v}% max HP and a little regen" },
  scholar: { name: "Scholar", line: "+{v}% XP from everything" },
};
export const PET_VAL = { speed: [3, 5, 8, 12, 15], collector: [4, 6, 8, 10, 12], luck: [5, 8, 12, 18, 25], vigour: [3, 5, 8, 12, 15], scholar: [3, 5, 8, 12, 15], guard: [1, 1.15, 1.35, 1.6, 2] };
/// what the pet's ability is worth at pet level lv (1–10): the rarity's number at level 10, 60% of it at level 1
/// (the collector's radius starts at 75%); guard is a multiplier on the zap or the mend
export const petPower = (sp, lv) => {
  const t = (Math.max(1, Math.min(10, lv)) - 1) / 9, base = PET_VAL[sp.ab][sp.r], v = sp.ab === "guard" ? base * (0.85 + 0.15 * t) : base * ((sp.ab === "collector" ? 0.75 : 0.6) + (sp.ab === "collector" ? 0.25 : 0.4) * t);
  return Math.round(v * 10) / 10;
};
export const petLevel = (xp) => Math.min(10, 1 + Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 15)));
export const petNext = (lv) => (lv >= 10 ? null : lv * lv * 15);
