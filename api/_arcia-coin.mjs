// api/_arcia-coin.mjs — $ARCIA (CirclePad Round #1's coin) right now: market from Dexscreener, holders from
// the Token Scanner, and how much of it sits at 0x…dEaD. Used by ARCIA (api/_arcia-brain.mjs) and the Reward
// page (/api/social?coin=arcia).
import { ethCalls, pad } from "./_arc.mjs";

export const ARCIA_CA = "0x9da6d5ce413e94264Ea411372459413334a83bE5";
/// $ARCIA's market right now: price, 24h change, market cap, volume and liquidity from Dexscreener (its
/// Uniswap v4 pool on Arc), holders from the Token Scanner (/api/social?scan=, cached there). Kept 20 s.
export const ARCIA_POOL = "0x40272a6ee71cb10882e5a3102d10a91874aa66922bfc98801a6293fef7b5332b";
let coinMem = null;
const getJson = async (u, ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); } };
export async function arciaCoin(origin) {
  if (coinMem && Date.now() - coinMem.at < 20e3) return coinMem.v;
  const [dx, sc] = await Promise.all([
    getJson(`https://api.dexscreener.com/tokens/v1/arc/${ARCIA_CA}`, 3000),
    origin ? getJson(`${origin}/api/social?scan=${ARCIA_CA.toLowerCase()}&sym=ARCIA`, 3000) : null,
  ]);
  const pairs = (Array.isArray(dx) ? dx : (dx && dx.pairs) || []).filter((p) => p && p.baseToken && String(p.baseToken.address).toLowerCase() === ARCIA_CA.toLowerCase());
  const p = pairs.find((x) => String(x.pairAddress || "").toLowerCase() === ARCIA_POOL) || pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0] || null;
  const num = (v) => (v == null || v === "" || !isFinite(Number(v)) ? null : Number(v));
  const v = {
    token: ARCIA_CA, pool: (p && p.pairAddress) || ARCIA_POOL,
    price: p ? num(p.priceUsd) : null, change24h: p && p.priceChange ? num(p.priceChange.h24) : null,
    mcap: p ? num(p.marketCap != null ? p.marketCap : p.fdv) : null,
    volume24h: p && p.volume ? num(p.volume.h24) : null, liquidity: p && p.liquidity ? num(p.liquidity.usd) : null,
    buys24h: p && p.txns && p.txns.h24 ? num(p.txns.h24.buys) : null, sells24h: p && p.txns && p.txns.h24 ? num(p.txns.h24.sells) : null,
    holders: sc && sc.holderCount != null ? num(sc.holderCount) : null,
  };
  if (v.price != null || v.holders != null) coinMem = { at: Date.now(), v };
  return v;
}


const DEAD = "0x000000000000000000000000000000000000dead";
let burnMem = null;
/// $ARCIA's supply and what sits at 0x…dEaD (cached 60 s).
export async function arciaBurned() {
  if (burnMem && Date.now() - burnMem.at < 60e3) return burnMem.v;
  const [sup, dead, dec] = await ethCalls([
    { to: ARCIA_CA, data: "0x18160ddd" }, { to: ARCIA_CA, data: "0x70a08231" + pad(DEAD) }, { to: ARCIA_CA, data: "0x313ce567" },
  ]);
  const d = dec ? Number(BigInt(dec)) : 18, n = (h) => (h ? Number(BigInt(h)) / 10 ** d : null);
  const supply = n(sup), burned = n(dead);
  const v = { supply, burned, pct: supply && burned != null ? Number(((burned / supply) * 100).toFixed(3)) : null };
  if (supply) burnMem = { at: Date.now(), v };
  return v;
}
