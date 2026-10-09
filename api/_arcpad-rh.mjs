// api/_arcpad-rh.mjs — ArcPad's own launches on Robinhood Chain (contracts/ArcPadFactoryRH.sol): ETH-paired coins
// with a real Uniswap v4 pool from the first block, the same 8% platform allocation and fee split as ArcPad on Arc.
//
//   list()        every launch: name, symbol, logo, socials, creator, price (the pool's slot0) and market cap in USD
//   coin(token)   one launch, live
// The factory and router addresses: env ARCPAD_RH_FACTORY / ARCPAD_RH_ROUTER, else CFG below (config-arc.js ARCPAD_RH —
// keep them in step). Read-only and keyless.
import { evmChain } from "./_evm.mjs";
import { keccakHex, pad, strip, wAddr, wBig, wString, decodeString } from "./_arc.mjs";

const env = (k) => (typeof process !== "undefined" && process.env ? String(process.env[k] || "").trim() : "");
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
export const CFG = {
  factory: () => { const e = env("ARCPAD_RH_FACTORY"); return isAddr(e) ? lc(e) : isAddr(FACTORY_DEFAULT) ? lc(FACTORY_DEFAULT) : ""; },
  router: () => { const e = env("ARCPAD_RH_ROUTER"); return isAddr(e) ? lc(e) : isAddr(ROUTER_DEFAULT) ? lc(ROUTER_DEFAULT) : ""; },
  pm: "0x8366a39cc670b4001a1121b8f6a443a643e40951", // Uniswap v4 PoolManager on Robinhood Chain
  rpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  ethUsd: null, // tests pin it
};
export const FACTORY_DEFAULT = "0x1446Af2D4b86cf31a96bDe8173c2bC39C8a2EEAf"; // contracts/scripts/deploy-arcpad-rh.js, 2026-10-10 (block 84421705)
export const ROUTER_DEFAULT = "0x0ab746332B5b85091b62cBC6F1Ce90F1557465B3";
export function configure(o) { Object.assign(CFG, o); ch = null; mem.list = null; }
let ch = null;
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: 4663 }));
const mem = { list: null, at: 0, recs: new Map() };
const sel = (sig) => keccakHex(Buffer.from(sig, "utf8").toString("hex")).slice(0, 10);
const SEL = {
  launchCount: sel("launchCount()"), launches: sel("launches(uint256)"), poolKeyOf: sel("poolKeyOf(address)"), launchIndexOf: sel("launchIndexOf(address)"),
  name: sel("name()"), symbol: sel("symbol()"), extsload: sel("extsload(bytes32)"), launchFee: sel("launchFee()"),
};

async function ethUsd() {
  if (CFG.ethUsd) return CFG.ethUsd;
  try { const P = await import("./_pons-arcpad.mjs"); return await P.ethUsd(); } catch { return null; }
}

/// a launch record (cached — it never changes) + its pool id
async function records(n) {
  const F = CFG.factory(), need = [];
  for (let i = 0; i < n; i++) if (!mem.recs.has(i)) need.push(i);
  for (let s = 0; s < need.length; s += 40) {
    const idx = need.slice(s, s + 40);
    const recs = await chain().ethCalls(idx.map((i) => ({ to: F, data: SEL.launches + pad(i.toString(16)) })));
    const toks = recs.map((r) => (r ? wAddr(r, 0) : null));
    const more = await chain().ethCalls(toks.flatMap((t) => [{ to: F, data: SEL.poolKeyOf + pad(t || "0x0") }, { to: t || F, data: SEL.name }, { to: t || F, data: SEL.symbol }]));
    idx.forEach((i, k) => {
      const r = recs[k], t = toks[k], key = more[k * 3];
      if (!r || !t || !key) return;
      const L = { token: lc(t), creator: lc(wAddr(r, 4)), launchedAt: Number(wBig(r, 5)), extraFeeBps: Number(wBig(r, 6)), initialVirtualQuoteRaw: wBig(r, 2).toString(),
        poolId: keccakHex(strip(key).slice(0, 5 * 64)), name: decodeString(more[k * 3 + 1]), symbol: decodeString(more[k * 3 + 2]) };
      for (const [f, j] of [["imageUrl", 7], ["description", 8], ["twitter", 9], ["telegram", 10], ["discord", 11], ["website", 12]]) { try { L[f] = wString(r, j).slice(0, 2000); } catch { L[f] = ""; } }
      mem.recs.set(i, L);
    });
  }
  return Array.from({ length: n }, (_, i) => mem.recs.get(i)).filter(Boolean);
}
/// price of one token in ETH from the pool's sqrtPriceX96 (ETH is currency0, both 18 decimals)
function priceEth(sqrt) {
  if (!sqrt) return null;
  const sp = Number(sqrt) / 2 ** 96, raw = sp * sp; // token per ETH
  const p = raw > 0 ? 1 / raw : null;
  return p && Number.isFinite(p) ? p : null;
}
export async function list() {
  const F = CFG.factory();
  if (!F) return { live: false, factory: null, router: null, coins: [] };
  if (mem.list && Date.now() - mem.at < 20000) return mem.list;
  const [cnt] = await chain().ethCalls([{ to: F, data: SEL.launchCount }, { to: F, data: SEL.launchFee }]);
  const n = cnt ? Math.min(Number(BigInt(cnt)), 2000) : 0;
  const recs = await records(n);
  const [slots, eth] = await Promise.all([
    chain().ethCalls(recs.map((L) => ({ to: CFG.pm, data: SEL.extsload + strip(keccakHex(strip(L.poolId) + pad("6"))) }))),
    ethUsd(),
  ]);
  const coins = recs.map((L, i) => {
    const sqrt = slots[i] ? BigInt(slots[i]) & ((1n << 160n) - 1n) : 0n;
    const pe = priceEth(sqrt);
    return { ...L, platform: "arcpadrh", chain: "rh", quoteToken: "0x0000000000000000000000000000000000000000", quoteSymbol: "ETH", priceEth: pe,
      priceUsd: pe != null && eth ? pe * eth : null, marketCapUsd: pe != null && eth ? pe * eth * 1e9 : null };
  });
  const out = { live: true, factory: F, router: CFG.router(), ethUsd: eth || null, coins };
  mem.list = out; mem.at = Date.now();
  return out;
}
export async function coin(token) {
  if (!isAddr(token)) return null;
  const l = await list();
  return l.coins.find((c) => c.token === lc(token)) || null;
}
export const _test = { priceEth, SEL };
