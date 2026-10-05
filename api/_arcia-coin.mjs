// api/_arcia-coin.mjs — $ARCIA right now. Since 3 Oct 2026 the live price follows $ARCIA on Robinhood Chain (ARCIA's
// own launch through Pons): price, market cap and graduation progress read on-chain from Pons (its bonding curve, or
// its Uniswap v4 pool once it graduates), 24h change / volume from Dexscreener when it lists it, holders from the
// Token Scanner on Robinhood Chain. Since 4 Oct 2026 every $ARCIA default is Robinhood Chain's, its burns
// (arciaBurned) too: what sits at 0x…dEaD there. The old Arc $ARCIA (CirclePad Round #1's coin) was retired on 5 Oct
// 2026 — not official any more — so it isn't read here.
// Used by ARCIA (api/_arcia-brain.mjs) and /api/social?coin=arcia.
import { pad } from "./_arc.mjs";
import { evmChain } from "./_evm.mjs";

export const ARCIA_RH = "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25";
export const ARCIA_RH_BUY = "https://www.ponsfamily.com/launchpad/0xf0c0fc281314a48ae4e52a9db08731cb6a38ca25";
let coinMem = null;
const getJson = async (u, ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); } };
const num = (v) => (v == null || v === "" || !isFinite(Number(v)) ? null : Number(v));
const pairsOf = (dx, token) => (Array.isArray(dx) ? dx : (dx && dx.pairs) || []).filter((p) => p && p.baseToken && String(p.baseToken.address).toLowerCase() === token.toLowerCase())
  .sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
const market = (p) => ({
  price: p ? num(p.priceUsd) : null, change24h: p && p.priceChange ? num(p.priceChange.h24) : null,
  mcap: p ? num(p.marketCap != null ? p.marketCap : p.fdv) : null,
  volume24h: p && p.volume ? num(p.volume.h24) : null, liquidity: p && p.liquidity ? num(p.liquidity.usd) : null,
  buys24h: p && p.txns && p.txns.h24 ? num(p.txns.h24.buys) : null, sells24h: p && p.txns && p.txns.h24 ? num(p.txns.h24.sells) : null,
});
/// → the Robinhood Chain $ARCIA's numbers (chain "rh"). Kept 20 s.
export async function arciaCoin(origin) {
  if (coinMem && Date.now() - coinMem.at < 20e3) return coinMem.v;
  const pons = import("./_pons-arcpad.mjs").then((m) => m.livePons(ARCIA_RH)).catch(() => null);
  const [pl, dxRh, scRh] = await Promise.all([
    pons,
    getJson(`https://api.dexscreener.com/tokens/v1/robinhood/${ARCIA_RH}`, 3000),
    origin ? getJson(`${origin}/api/social?scan=${ARCIA_RH.toLowerCase()}&chain=rh&sym=ARCIA`, 3500) : null,
  ]);
  const mr = market(pairsOf(dxRh, ARCIA_RH)[0] || null);
  const onCurve = pl && pl.phase === "curve";
  const v = {
    chain: "rh", token: ARCIA_RH, buyUrl: ARCIA_RH_BUY, venue: "Pons",
    phase: pl ? pl.phase : null, progress: pl ? pl.progress : null, priceEth: pl ? pl.priceEth : null,
    // the price read on-chain first (fresh every read); Dexscreener's when Pons couldn't be read
    price: pl && pl.priceUsd != null ? pl.priceUsd : mr.price, change24h: mr.change24h,
    mcap: pl && pl.mcapUsd != null ? pl.mcapUsd : mr.mcap,
    volume24h: mr.volume24h, liquidity: onCurve && pl.curveUsd != null ? pl.curveUsd : mr.liquidity, liquidityKind: onCurve ? "curve" : "pool",
    buys24h: mr.buys24h, sells24h: mr.sells24h,
    holders: scRh && scRh.holderCount != null ? num(scRh.holderCount) : null,
  };
  if (v.price != null || v.holders != null) coinMem = { at: Date.now(), v };
  return v;
}

const DEAD = "0x000000000000000000000000000000000000dead";
let burnMem = null;
const rhEnv = () => String((typeof process !== "undefined" && process.env && process.env.ROBINHOOD_RPC_URL) || "").trim();
let rhChain = null;
export const RH = { rpcs: () => [rhEnv(), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean) };
export function configureRh(o) { Object.assign(RH, o || {}); rhChain = null; burnMem = null; }
/// $ARCIA's supply on Robinhood Chain and what sits at 0x…dEaD there (cached 60 s).
export async function arciaBurned() {
  if (burnMem && Date.now() - burnMem.at < 60e3) return burnMem.v;
  rhChain = rhChain || evmChain({ rpcs: RH.rpcs, chainId: 4663 });
  const [sup, dead, dec] = await rhChain.ethCalls([
    { to: ARCIA_RH, data: "0x18160ddd" }, { to: ARCIA_RH, data: "0x70a08231" + pad(DEAD) }, { to: ARCIA_RH, data: "0x313ce567" },
  ]);
  const d = dec ? Number(BigInt(dec)) : 18, n = (h) => (h ? Number(BigInt(h)) / 10 ** d : null);
  const supply = n(sup), burned = n(dead);
  const v = { chain: "rh", token: ARCIA_RH, supply, burned, pct: supply && burned != null ? Number(((burned / supply) * 100).toFixed(3)) : null };
  if (supply) burnMem = { at: Date.now(), v };
  return v;
}
