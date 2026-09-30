// api/_omni.mjs — ARCIRCLE OMNI status for /api/c?view=omni: where $ARCIRCLE lives on each chain, the supply
// invariant (locked on Arc == Robinhood + Solana) and each chain's price and the spread between them.
// Addresses are empty until the OMNI contracts are deployed (omni/README.md); keep them in step with
// config-arc.js CONFIG.OMNI. Empty → that chain reports "not deployed", nothing is guessed.
import { ethCalls, pad } from "./_arc.mjs";

export const OMNI = {
  ARCIRCLE: "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7",
  ADAPTER: "0x075e5DC585efFe0bfdC1a0d452499Ce7AFe2faB6", // Arc · ArcircleOFTAdapter
  ROBINHOOD_OFT: "0x6F9EBd0DFc6De9ed47EEc18EfeB69A9b97C71ee4", // Robinhood Chain · ArcircleOFT
  ROBINHOOD_POOL: "0x1bbed8ae8485bd75d46c3bdb830d47aca49b6ccb4fad57e6263903d0c1f10a50", // the official $ARCIRCLE/ETH Uniswap v4 pool there (config-arc.js)
  SOLANA_MINT: "", // Solana · SPL mint created by the OFT program
  SAFE: "0xA4101562b2C6fd5e422A0F78B2fE166dF84A48Fd", // the owner Safe 2-of-3 on Arc — its burns of lockbox rewards show as "OMNI rewards"
  ROBINHOOD_RPC: "https://rpc.mainnet.chain.robinhood.com",
  SOLANA_RPC: "https://api.mainnet-beta.solana.com",
};
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
const isSol = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || "");
const SEL = { totalSupply: "0x18160ddd", balanceOf: "0x70a08231" };
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const toNum = (v, d = 18) => Number(v / 10n ** BigInt(d - 6)) / 1e6;

async function jsonRpc(url, method, params, ms = 5000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || "rpc error");
    return j.result;
  } finally { clearTimeout(t); }
}
// DexScreener's public token endpoint: the most liquid pair's USD price on a chain, or null
async function dexPrice(chainId, token) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${chainId}/${token}`, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const arr = await r.json();
    const best = (Array.isArray(arr) ? arr : []).filter((p) => p && p.priceUsd).sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
    return best ? { price: Number(best.priceUsd), liquidity: (best.liquidity && best.liquidity.usd) || null, pair: best.url || null, dex: best.dexId || null } : null;
  } catch { return null; }
}

export async function omniStatus(origin) {
  const out = { v: 1, at: Math.floor(Date.now() / 1000), deployed: { arc: isAddr(OMNI.ADAPTER), robinhood: isAddr(OMNI.ROBINHOOD_OFT), solana: isSol(OMNI.SOLANA_MINT) }, chains: {}, supply: {}, spread: null };
  // Arc: global supply and what the lockbox holds
  const calls = [{ to: OMNI.ARCIRCLE, data: SEL.totalSupply }];
  if (out.deployed.arc) calls.push({ to: OMNI.ARCIRCLE, data: SEL.balanceOf + pad(OMNI.ADAPTER) });
  const [arcRes, rhRes, solRes, arcTok] = await Promise.all([
    ethCalls(calls).catch(() => []),
    out.deployed.robinhood ? jsonRpc(OMNI.ROBINHOOD_RPC, "eth_call", [{ to: OMNI.ROBINHOOD_OFT, data: SEL.totalSupply }, "latest"]).catch(() => null) : null,
    out.deployed.solana ? jsonRpc(OMNI.SOLANA_RPC, "getTokenSupply", [OMNI.SOLANA_MINT]).catch(() => null) : null,
    fetch(origin + "/api/social?token=arcircle").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const global = arcRes[0] ? big(arcRes[0]) : null;
  const locked = out.deployed.arc && arcRes[1] ? big(arcRes[1]) : out.deployed.arc ? null : 0n;
  const rh = out.deployed.robinhood ? (rhRes ? big(rhRes) : null) : 0n;
  const sol = out.deployed.solana ? (solRes && solRes.value ? BigInt(solRes.value.amount) * 10n ** BigInt(18 - (solRes.value.decimals ?? 6)) : null) : 0n;
  out.supply = {
    global: global != null ? toNum(global) : 1e9,
    locked: locked != null ? toNum(locked) : null,
    robinhood: rh != null ? toNum(rh) : null,
    solana: sol != null ? toNum(sol) : null,
  };
  out.supply.arcFree = out.supply.locked != null ? out.supply.global - out.supply.locked : null;
  if (!out.deployed.arc) out.supply.check = "not-deployed";
  else if (locked == null || rh == null || sol == null) out.supply.check = "unknown";
  else out.supply.check = locked === rh + sol ? "ok" : locked > rh + sol ? "in-flight" : "alert";
  if (locked != null && rh != null && sol != null) out.supply.gap = toNum(locked > rh + sol ? locked - rh - sol : rh + sol - locked);
  // prices
  const [rhP, solP] = await Promise.all([
    out.deployed.robinhood ? dexPrice("robinhood", OMNI.ROBINHOOD_OFT) : null,
    out.deployed.solana ? dexPrice("solana", OMNI.SOLANA_MINT) : null,
  ]);
  out.chains = {
    arc: { live: true, price: arcTok && arcTok.price != null ? arcTok.price : null, venue: "Argus · Uniswap v4" },
    robinhood: { live: out.deployed.robinhood, price: rhP ? rhP.price : null, liquidity: rhP ? rhP.liquidity : null, venue: rhP ? rhP.dex : null, pair: rhP ? rhP.pair : null },
    solana: { live: out.deployed.solana, price: solP ? solP.price : null, liquidity: solP ? solP.liquidity : null, venue: solP ? solP.dex : null, pair: solP ? solP.pair : null },
  };
  const ps = Object.values(out.chains).map((c) => c.price).filter((p) => p > 0);
  if (ps.length >= 2) out.spread = (Math.max(...ps) - Math.min(...ps)) / Math.min(...ps);
  return out;
}
