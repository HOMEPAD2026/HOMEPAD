// api/_world-lots.mjs — b-lpv: the LAUNCHPAD VILLAGE's lots (world-lands.js draws them). Every ArcPad coin has a lot
// there, its size by the coin's market cap: Starter (under $1k) 16×16 bricks · S ($1k+) 24×24 · M ($10k+) 36×36 ·
// L ($100k+) 48×48, each with its own brick limit. A lot never shrinks: the biggest tier a coin has reached is kept
// (worldLotTier/<coin> { t, at }), so a build isn't cut when the price dips. Only the wallet that launched the coin
// builds it (api/_world.mjs lotSave checks the creator). The old Coin City sizes (9×9, the premium 13×13) still load.
// Also the lands' places (the same numbers as world-lands.js LANDS): presence is accepted there (api/_world-social.mjs).
export const LOT_TIERS = [
  { id: "starter", min: 0, N: 16, max: 2000 },
  { id: "s", min: 1e3, N: 24, max: 5000 },
  { id: "m", min: 1e4, N: 36, max: 10000 },
  { id: "l", min: 1e5, N: 48, max: 20000 },
];
export const LANDS = { lp: { x: 2400, z: 0, r: 260 }, ut: { x: -2400, z: 0, r: 60 }, ad: { x: 0, z: 2400, r: 96 }, rq: { x: 0, z: -2400, r: 104 }, cc: { x: -2400, z: 2400, r: 100 }, hw: { x: 2400, z: 2400, r: 190 } }; // (ad: Nexus City, world-adcity.js; rq: RAID QUEENS, world-raidq.js)
export const tierOfCap = (mc) => { let t = 0; LOT_TIERS.forEach((x, i) => { if ((Number(mc) || 0) >= x.min) t = i; }); return t; };
/// is (x, z) somewhere a player can stand: the town, or inside a land
export const inWorld = (x, z) => Math.hypot(x, z) <= 150 || Object.values(LANDS).some((L) => Math.hypot(x - L.x, z - L.z) <= L.r);

/// deps: { getDocs, setDoc, now, coinMcap?(coin) → USD | null }
export function makeLots(deps) {
  const one = async (p) => (await deps.getDocs([p]))[p];
  /// the coin's lot tier: its market cap now, or the biggest it reached before (kept), whichever is bigger
  async function tierOf(coin) {
    const key = `worldLotTier/${coin}`, old = (await one(key)) || null, had = old ? old.t | 0 : 0;
    let mc = null; try { mc = deps.coinMcap ? await deps.coinMcap(coin) : null; } catch { mc = null; }
    const now = mc == null ? 0 : tierOfCap(mc), t = Math.max(had, now);
    if (!old || t > had) await deps.setDoc(key, { t, at: deps.now(), mc: mc == null ? null : Math.round(mc) });
    return t;
  }
  return { tierOf };
}
