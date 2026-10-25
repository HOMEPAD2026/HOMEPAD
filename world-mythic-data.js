// world-mythic-data.js — the Crimson Celestial set (the owner's spec v1.0, 2026-10-25): the game's first MYTHIC gear, seven
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
    { id: "CC_SHIELD", slot: "shield", name: "Crimson Eclipse Shield", glb: "cc-shield", line: "Defense, damage taken" }, // (the seventh, 2026-10-25: the set fills every gear slot)
  ],
  // a RAID QUEENS win's chance of one piece (which one: rollSlot — missing slots and the week's blessed slot first), its level to wear and its stats' multiplier
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
  EXTRA: { weapon: { critDmg: 10 }, helm: { skillPct: 6 }, necklace: { skillPct: 6 }, armor: { dr: 3 }, shield: { dr: 2 } },
  // Crimson Resonance: all seven worn, each at +10 or more — a bonus beyond the five
  RESONANCE: { need: 7, plus: 10, name: "Crimson Resonance", stats: { atkPct: 8, critDmg: 15, dr: 5 } },
  // Crimson Shards (the set's pity): every won run adds its dungeon's shards; that many of one dungeon's shards make a piece
  // of the slot you pick, from that dungeon (its level to wear and multiplier) — the end of the luck is in sight
  SHARD: { lysitha: 60, solvira: 40, nyxara: 30, throne: 12, secret: 5 },
  // which slot a drop is: a slot you don't hold weighs MISS, the week's blessed slot (blessedSlot, Monday Seoul) BLESS more
  WEIGHT: { MISS: 3, BLESS: 2 },
  // reforging a piece into another slot (same dungeon, same multiplier; its + and stars go back to 0): Crimson Essence by origin
  REFORGE: { lysitha: 30, solvira: 50, nyxara: 80, throne: 120, secret: 160 },
  // awakening: the same piece given up raises a piece's stars (≤ 3); each star opens the slot's own option
  AWAKEN: {
    weapon: [{ critDmg: 6 }, { atkPct: 4 }, { skillPct: 8 }], shield: [{ defPct: 4 }, { hpPct: 4 }, { dr: 3 }], armor: [{ hpPct: 4 }, { defPct: 4 }, { dr: 3 }],
    helm: [{ crit: 3 }, { skillPct: 6 }, { critDmg: 6 }], ring: [{ crit: 3 }, { atkPct: 4 }, { critDmg: 8 }], boots: [{ spd: 3 }, { defPct: 4 }, { dr: 2 }],
    necklace: [{ hpPct: 4 }, { skillPct: 6 }, { atkPct: 4 }],
  },
  MAX_STARS: 3,
  // the Reaper's own skill: every ten seconds the next hit is a crimson scythe spin round you (×REAPER.mult of the hit)
  REAPER: { every: 10, mult: 3, r: 4.5 },
  MYTHIC_K: 1.3, // above the best Legendary there is (Lv 100, the save's cap) before the dungeon's multiplier
  // enhancing (+1 … +15, the spec): each step costs Crimson Essence and ARCL; the chance falls after +5 and +10; a miss
  // keeps the piece and its + (only the cost is gone)
  ENH: { ess: (n) => 4 + n * 3, arcl: (n) => 1000 * (n + 1), rate: (n) => (n < 5 ? 1 : n < 10 ? 0.75 - (n - 5) * 0.05 : 0.4 - (n - 10) * 0.05), FAIL_UP: 0.05, FAIL_MAX: 0.25 }, // (each miss in a row at the same + adds FAIL_UP, up to FAIL_MAX)
  // salvaging a piece: Crimson Essence by where it came from, plus 2 for each + it carried
  ESS: { lysitha: 10, solvira: 20, nyxara: 35, throne: 60, secret: 80 },
  // trading among players for ARCL (step B, the owner's call): 2 % to the platform, the price within these bounds
  // step D (the owner, 2026-10-25): a piece listed for USDC on Arc — the buyer sends it to the team's desk (api/_world-swap.mjs
  // SWAP.DESK, the ERC-20 USDC at USDC_TOKEN, 6 decimals), the server checks the transfer and hands the piece over, and a
  // GM pays the seller (less FEE) from their own wallet; the server never holds a key. Prices in cents.
  // step C (the owner, 2026-10-25): a piece taken onto Arc as an NFT (contracts/contracts/CrimsonCelestialNFT.sol) with a
  // voucher a GM signs in their own wallet (EIP-712); it comes back into the game by returning it there (it burns). ADDR
  // stays empty until the owner deploys it (contracts/scripts/deploy-crimson-celestial-nft.js): until then "coming soon".
  NFT: { ADDR: "", CHAIN: 5042, NAME: "CrimsonCelestialNFT", VERSION: "1", DEADLINE_S: 3 * 86400,
    SEL: { mint: "0xc9c8231d", toGame: "0x453601d8", ownerOf: "0x6352211e" },
    TOPIC: { minted: "0x68d937d9e57e7cf33f4aecfde473c947bc9836a4d40567eb223fc42179043d30", returned: "0x67ffb28c0e498947b5c148a385ed64809190a87d2a053c40be021f28c69181ec" },
    SRC: ["lysitha", "solvira", "nyxara", "throne", "secret"] },
  USD: { MIN: 100, MAX: 1000000, FEE: 0.02, HOLD_MS: 15 * 60e3, TOKEN: "0x3600000000000000000000000000000000000000", DEC: 6 },
  MARKET: { FEE: 0.02, MIN: 1000, MAX: 10000000, MAX_LISTED: 300, MAX_BIDS: 300, MY_BIDS: 5, SALES: 200 }, // (bids: buy requests with the ARCL held until filled or taken back)
};
export const enhCost = (plus, fails = 0) => { const base = Math.max(0.15, CC.ENH.rate(plus)), up = Math.min(CC.ENH.FAIL_MAX, Math.max(0, Math.floor(fails || 0)) * CC.ENH.FAIL_UP); return { ess: CC.ENH.ess(plus), arcl: CC.ENH.arcl(plus), rate: Math.min(1, Math.round((base + up) * 100) / 100), base, up }; };
/// the week's blessed slot (Monday 00:00 Seoul): one of the seven in turn, the same for everyone
export const weekNo = (t) => Math.floor(((t + 9 * 3600e3) / 864e5 + 3) / 7);
export const blessedSlot = (t) => CC.PIECES[((weekNo(t) * 5) % CC.PIECES.length + CC.PIECES.length) % CC.PIECES.length].slot;
/// a drop's slot: weights by what you hold (a missing slot ×MISS) and the week's blessing (×BLESS); r in [0, 1)
export function rollSlot(held, t, r) {
  const have = new Set(held || []), bless = blessedSlot(t), w = CC.PIECES.map((P) => (have.has(P.slot) ? 1 : CC.WEIGHT.MISS) * (P.slot === bless ? CC.WEIGHT.BLESS : 1)), sum = w.reduce((a, b) => a + b, 0);
  let x = r * sum; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return CC.PIECES[i]; } return CC.PIECES[CC.PIECES.length - 1];
}
/// a slot's chance of being the next drop's (for the window)
export function slotOdds(held, t) { const have = new Set(held || []), bless = blessedSlot(t), w = CC.PIECES.map((P) => (have.has(P.slot) ? 1 : CC.WEIGHT.MISS) * (P.slot === bless ? CC.WEIGHT.BLESS : 1)), sum = w.reduce((a, b) => a + b, 0); return Object.fromEntries(CC.PIECES.map((P, i) => [P.slot, w[i] / sum])); }
export const reforgeCost = (inst) => CC.REFORGE[inst && inst.src] || 30;
export const essOf = (inst) => (CC.ESS[inst && inst.src] || 10) + 2 * Math.max(0, Math.floor((inst && inst.plus) || 0));
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
  const stars = Math.max(0, Math.min(CC.MAX_STARS, Math.floor(inst.stars || 0)));
  for (let i = 0; i < stars; i++) for (const [k, v] of Object.entries((CC.AWAKEN[P.slot] || [])[i] || {})) out[k] = (out[k] || 0) + v;
  return out;
}

/// the set's bonuses for what's worn: { n, active: [[need, name]], stats } — worn is the list of instances you wear and can
export function setBonus(worn) {
  const slots = new Set((worn || []).map((w) => (pieceOf(w.def) || {}).slot).filter(Boolean)), n = slots.size, stats = {}, active = [];
  for (const [need, name, b] of CC.BONUS) if (n >= need) { active.push([need, name]); for (const [k, v] of Object.entries(b)) stats[k] = (stats[k] || 0) + v; }
  const R = CC.RESONANCE, lowPlus = (worn || []).length ? Math.min(...[...slots].map((sl) => Math.max(...(worn || []).filter((w) => (pieceOf(w.def) || {}).slot === sl).map((w) => Math.floor(w.plus || 0))))) : 0;
  const resonance = n >= R.need && lowPlus >= R.plus; if (resonance) for (const [k, v] of Object.entries(R.stats)) stats[k] = (stats[k] || 0) + v;
  return { n, active, stats, resonance, lowPlus };
}

/// the voucher a GM signs for a piece (EIP-712 typed data: the contract's Voucher) and the call data that mints it
const field = ([n, t]) => ({ name: n, type: t }); // (the voucher's fields, the contract's order)
export const nftTypes = { Voucher: [["to", "address"], ["tokenId", "uint256"], ["kind", "uint16"], ["src", "uint8"], ["plus", "uint8"], ["stars", "uint8"], ["nonce", "uint256"], ["deadline", "uint256"]].map(field) };
export const nftDomain = (addr) => ({ name: CC.NFT.NAME, version: CC.NFT.VERSION, chainId: CC.NFT.CHAIN, verifyingContract: addr || CC.NFT.ADDR });
export function nftVoucher(inst, to, nonce, deadline) {
  const kind = CC.PIECES.findIndex((P) => P.id === inst.def), src = Math.max(0, CC.NFT.SRC.indexOf(inst.src));
  return { to, tokenId: String(inst.nft && inst.nft.tokenId), kind, src, plus: Math.floor(inst.plus || 0), stars: Math.floor(inst.stars || 0), nonce: String(nonce), deadline: Number(deadline) };
}
const w32 = (v) => BigInt(v).toString(16).padStart(64, "0");
/// mint((address,uint256,uint16,uint8,uint8,uint8,uint256,uint256),bytes): the tuple inline, then the signature's offset, length and bytes
export function nftMintData(v, sig) {
  const s = String(sig).replace(/^0x/, ""), n = s.length / 2, padded = s.padEnd(Math.ceil(n / 32) * 64, "0");
  return CC.NFT.SEL.mint + w32(v.to) + w32(v.tokenId) + w32(v.kind) + w32(v.src) + w32(v.plus) + w32(v.stars) + w32(v.nonce) + w32(v.deadline) + w32(9 * 32) + w32(n) + padded;
}
export const nftToGameData = (tokenId) => CC.NFT.SEL.toGame + w32(tokenId);
