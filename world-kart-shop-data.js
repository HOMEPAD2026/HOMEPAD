// world-kart-shop-data.js — ARCIRCLE KART's SHOP (2026-11-01, the owner): five departments — CARS open first, the other four
// "coming soon" — and the six cars, each themed on a partner's / an ecosystem's logo and made with Meshy (raw/kart-cars on
// claude/meshy-kart-cars → models/world/kart/cars/<id>.glb). Shared by the game (world-kart.js, world-kart-shop.js) and the
// server (api/_world-kart.mjs: the purchase, ownership, a race's car). Every number lives here, in one place.
//
// Paying: $ARCIRCLE from the player's own wallet, sent to FeeBurn (api/_world-shop.mjs FEE_BURN) — the contract burns BURN_PCT
// and sends the rest to the treasury (the owner's rule for a new game's shop: 50 % burned / 50 % treasury). The server only
// reads the receipt back (the Transfer from that wallet to FeeBurn, each transaction used once: worldPayTx).
//
// Performance: each car changes a few of the kart's numbers by a little — a strength and a weakness each; ROCKET ROADSTER, ARC and
// CIRCLE are the top grade (LEGENDARY), the other four EPIC and about even. A car never makes a kart faster than a boost does (top ×
// TOP ≤ BOOST_TOP, and a boost's speed isn't changed — only how long it lasts), so the server's minLap check holds for every
// car (tests/world/kartshop.test.mjs). A guest, or a car you don't own, races the racer's own kart (all 1.0).
//   top    top speed (the kart's TOP)            acc    acceleration          turn   steering
//   drift  how fast a drift charges its turbo    boost  how long a turbo lasts nitro  how fast nitro refills
//   mass   bumps: >1 shoves others more and is shoved less                    spin   how long a hit spins you (<1 = shorter)
export const KSHOP = {
  BURN_PCT: 50,
  PRICE: { epic: 100000, legendary: 300000 },
  DEPTS: [
    { id: "cars", name: "Cars", open: true, icon: "cars" },
    { id: "paint", name: "Paint & Wraps", open: false, icon: "paint" },
    { id: "trails", name: "Boost Trails", open: false, icon: "trails" },
    { id: "outfits", name: "Racer Outfits", open: false, icon: "outfits" },
    { id: "items", name: "Item Skins", open: false, icon: "itemskins" },
  ],
  STAT_KEYS: ["top", "acc", "turn", "drift", "boost", "mass"],
  // RR (2026-11-02, the owner: "a new Roadster at the highest grade, with a jump button that flies on rocket thrusters like the
  // Roadster's video"): a car with `jet` gets the ROCKET JUMP — Q on a computer, the Jump button on a phone. It lifts the car
  // off the road (lift m/s up), the thrusters hold it up for hover s at g × the track's gravity (a slow arc, ~2 s in the air),
  // then it falls; landing gives a short turbo (land s). Once every cd s. It never adds speed (the speed is held, the turbo is
  // a boost's — BOOST_TOP at most), and the walls still hold it on the road, so the server's minLap holds. In the air it flies
  // over rug pulls, bombs and item boxes (they only touch karts on the road).
  JET: { lift: 8.5, hover: 1.5, g: 0.35, cd: 7, land: 0.6, turn: 0.6 },
  CARS: [
    { id: "roadster", name: "ROCKET ROADSTER", brand: "Roadster", grade: "legendary", color: "#ff3b4e", jet: true, isNew: true,
      line: "Rocket thrusters. It flies.", pro: "ROCKET JUMP — fly over hazards · quickest off the line", con: "Wide turns at top speed",
      s: { top: 1.035, acc: 1.07, turn: 0.97, drift: 1.02, boost: 1.04, nitro: 1.05, mass: 1.05, spin: 0.9 } },
    { id: "arc", name: "ARC LIGHTSPEED", brand: "Arc", grade: "legendary", color: "#7fb8ff",
      line: "The fastest thing on Arc.", pro: "Highest top speed · longer turbos", con: "Heavy steering",
      s: { top: 1.04, acc: 1.0, turn: 0.95, drift: 1.0, boost: 1.1, nitro: 1.0, mass: 1.1, spin: 1.0 } },
    { id: "circle", name: "CIRCLE ORBIT", brand: "Circle", grade: "legendary", color: "#7ce8c8",
      line: "Balanced in every orbit.", pro: "Strong everywhere · nitro refills faster", con: "No single best stat",
      s: { top: 1.02, acc: 1.03, turn: 1.02, drift: 1.05, boost: 1.03, nitro: 1.15, mass: 1.0, spin: 0.95 } },
    { id: "usdc", name: "PEGMASTER", brand: "USDC", grade: "epic", color: "#2775ca",
      line: "Always holds its peg.", pro: "Steady steering · shakes off hits fast", con: "Lower top speed",
      s: { top: 0.985, acc: 1.0, turn: 1.05, drift: 1.0, boost: 1.0, nitro: 1.0, mass: 1.0, spin: 0.75 } },
    { id: "roblox", name: "BLOXBUSTER", brand: "Roblox", grade: "epic", color: "#e8e8e8",
      line: "Built block by block, built to bump.", pro: "Shoves rivals aside · hard to push", con: "Slow off the line · wide turns",
      s: { top: 1.01, acc: 0.95, turn: 0.97, drift: 1.0, boost: 1.0, nitro: 1.0, mass: 1.4, spin: 0.8 } },
    { id: "kairo", name: "KAIRO KLIK", brand: "KAIRO", grade: "epic", color: "#d8d8d8",
      line: "One klik and it's gone.", pro: "Best acceleration · nimble", con: "Light — gets bumped around",
      s: { top: 0.99, acc: 1.08, turn: 1.03, drift: 1.0, boost: 1.0, nitro: 1.0, mass: 0.78, spin: 1.0 } },
    { id: "argus", name: "ARGUS WATCHER", brand: "Argus", grade: "epic", color: "#8a5cff",
      line: "A hundred eyes on the racing line.", pro: "Drift turbos charge fastest", con: "Slower acceleration",
      s: { top: 0.995, acc: 0.96, turn: 1.02, drift: 1.13, boost: 1.02, nitro: 1.0, mass: 1.0, spin: 1.0 } },
  ],
};
export const BASE_STATS = { top: 1, acc: 1, turn: 1, drift: 1, boost: 1, nitro: 1, mass: 1, spin: 1 };
/// does this car have the ROCKET JUMP?
export const jetOf = (id) => !!((KSHOP.CARS.find((c) => c.id === id) || {}).jet);
export const carOf = (id) => KSHOP.CARS.find((c) => c.id === id) || null;
export const priceOf = (c) => (c ? KSHOP.PRICE[c.grade] || 0 : 0);
/// a car's numbers (the racer's own kart: all 1)
export const statsOf = (id) => ({ ...BASE_STATS, ...((carOf(id) || {}).s || {}) });
/// a 0–100 bar for the shop's card: 1.0 → 50, each 1 % → 5 points (mass and spin shown as "Toughness")
export const barOf = (c, key) => {
  const s = statsOf(c), v = key === "mass" ? (s.mass - 1) * 0.5 + (1 - s.spin) * 0.5 + 1 : s[key];
  return Math.max(5, Math.min(100, Math.round(50 + (v - 1) * 500)));
};
