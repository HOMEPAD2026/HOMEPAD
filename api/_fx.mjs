// api/_fx.mjs — ETH and SOL in dollars, for showing USDC amounts as "≈ ETH" / "≈ SOL" (CirclePad raises in USDC;
// Round #2 launches on Robinhood Chain, later rounds may launch on Solana). Coinbase spot first, CoinGecko if that
// fails; kept a minute per instance. USDC is counted as $1. Tests pin the prices with configure({ eth, sol }).
const CFG = { eth: null, sol: null };
export function configure(o) { Object.assign(CFG, o || {}); mem = null; }
let mem = null; // { eth, sol, at, src }
async function getJson(url, ms = 5000) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } }); return r.ok ? await r.json() : null; }
  catch { return null; }
}
const pos = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
async function coinbase(sym) { const j = await getJson(`https://api.coinbase.com/v2/prices/${sym}-USD/spot`); return pos(j && j.data && j.data.amount); }

/// → { eth, sol, at (unix seconds), src } — either price can be null when no source answered
export async function prices() {
  if (CFG.eth || CFG.sol) return { eth: pos(CFG.eth), sol: pos(CFG.sol), at: Math.floor(Date.now() / 1000), src: "pinned" };
  if (mem && Date.now() / 1000 - mem.at < 60 && mem.eth && mem.sol) return mem;
  let [eth, sol] = await Promise.all([coinbase("ETH"), coinbase("SOL")]);
  let src = "coinbase";
  if (!eth || !sol) {
    const cg = await getJson("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd");
    if (cg) { eth = eth || pos(cg.ethereum && cg.ethereum.usd); sol = sol || pos(cg.solana && cg.solana.usd); src = "coingecko"; }
  }
  // a source that's down keeps the last good price for up to 30 minutes
  if (mem && Date.now() / 1000 - mem.at < 1800) { eth = eth || mem.eth; sol = sol || mem.sol; }
  const out = { eth: eth || null, sol: sol || null, at: Math.floor(Date.now() / 1000), src };
  if (out.eth || out.sol) mem = out;
  return out;
}
