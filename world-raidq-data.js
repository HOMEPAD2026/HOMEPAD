// world-raidq-data.js — RAID QUEENS' rules the game and the server share (a copy of api/_world-raidq.mjs RQ; tests/world/raidq.test.mjs
// checks the two agree). The land's regions, the queens (level, everyone's HP, rewards) and the phases.
export const RQ = {
  REGIONS: [
    { id: "silver", name: "Silver Sanctum", lv: [100, 200], queen: "lysitha", skin: "blue", css: "#9fd4ff" },
    { id: "golden", name: "Golden Dominion", lv: [200, 300], queen: "solvira", skin: "green", css: "#ffd36a" },
    { id: "crimson", name: "Crimson Abyss", lv: [300, 400], queen: "nyxara", skin: "red", css: "#ff4d6d" },
    { id: "throne", name: "Throne of Three", lv: [400, 500], queen: "", skin: "", css: "#ffb4e6", soon: true },
  ],
  QUEENS: [ // hp: everyone's; arcl: the top hitter's (RANK for 1st–3rd, SHARE for the rest), item: rarity r, +p
    { id: "lysitha", name: "CELESTIAL LYSITHA", title: "The Arbiter of Stars and Divinity", lv: 100, hp: 600000, arcl: 8000, item: { r: 3, p: 5 } },
    { id: "solvira", name: "RADIANT SOLVIRA", title: "The Sovereign of Light and Sun", lv: 200, hp: 1200000, arcl: 15000, item: { r: 4, p: 3 } },
    { id: "nyxara", name: "CRIMSON NYXARA", title: "The Queen of Blood and Destruction", lv: 300, hp: 1800000, arcl: 25000, item: { r: 4, p: 5 } },
  ],
  OPEN: false, // false: GM wallets only (the owner, 2026-10-25); true opens it to everyone
  RANK: [1, 0.6, 0.4], SHARE: 0.25, PLUS_DOWN: [0, 1, 2, 3], // the 4th and on: SHARE of the ARCL, 3 fewer +
  PHASES: [0.6, 0.25], // phase 2 below 60 % HP, phase 3 below 25 %
  GAP: 5, CAP_K: 60, MIN_SHARE: 0.03, RESPAWN: 20, DAY_CLAIMS: 1, TOP: 20, // one report per 5 s, ≤ 60 × level each; ≥ 3 % of her HP to share; back 20 min after she falls; one reward a queen a Seoul day
};
export const phaseOf = (hp, max) => (hp > max * RQ.PHASES[0] ? 1 : hp > max * RQ.PHASES[1] ? 2 : 3);
export const queenOf = (id) => RQ.QUEENS.find((q) => q.id === id) || null;
export const regionOf = (id) => RQ.REGIONS.find((r) => r.id === id) || null;
