/* global ethers, CONFIG, readProvider, withRetry, ERC20_ABI, ARC_FACTORY_ABI */
// arc-quote.js — the token an ArcPad coin is paired with ("quote" token).
//
// HomepadFactoryArc accepts ANY ERC-20 as the quote side of a launch's
// Uniswap v4 pool; the site defaults to USDC and offers $ARCIRCLE or any
// token contract address. Everything that depends on the pair lives here:
//   • arcQuoteMeta(addr)     — validates the contract and reads symbol / name / decimals
//   • arcQuotePriceUsd(addr) — its USD price, from the best on-chain source available
//   • arcStartReserveRaw()   — the virtual quote reserve that makes every launch open
//                              at the same ≈ $4,350 market cap whatever it's paired with
//   • arcPriceInQuote()      — a pool's sqrtPriceX96 → quote tokens per launched token

const ARC_QUOTE_PRESETS = [
  { key: "usdc", address: CONFIG.USDC_ADDRESS, label: "USDC" },
  { key: "arcircle", address: CONFIG.ARCIRCLE_TOKEN || "", label: "$ARCIRCLE" }, // "" while $ARCIRCLE is not live
];
// 4,000 USD of virtual quote against the 920M sellable tokens → ≈ $0.0000043 a token,
// ≈ $4,350 fully-diluted on the 1B supply. Same opening point for every pair.
const ARC_START_RESERVE_USD = 4000;
const ARCIRCLE_CURVE_ADDR = CONFIG.ARCIRCLE_CURVE || "";

const _arcQuoteMetaCache = new Map();
const _arcQuotePriceCache = new Map();

const arcIsUsdc = (addr) => !!addr && addr.toLowerCase() === CONFIG.USDC_ADDRESS.toLowerCase();

// Pair tokens whose basics never change — no chain read needed, so a busy or
// rate-limited RPC can never turn them into "?" with the wrong decimals.
const ARC_KNOWN_QUOTES = {
  [CONFIG.USDC_ADDRESS.toLowerCase()]: { symbol: "USDC", name: "USD Coin", decimals: 6 },
};
if (CONFIG.ARCIRCLE_TOKEN) ARC_KNOWN_QUOTES[CONFIG.ARCIRCLE_TOKEN.toLowerCase()] = { symbol: "ARCIRCLE", name: "arcircle", decimals: 18 };

/// Pair-token basics for a coin that is ALREADY launched. The factory accepted
/// this token when the coin launched, so a failure here can only be the RPC
/// (busy, rate-limited, dropped) — retry with backoff instead of giving up
/// and pricing the coin with wrong decimals.
async function arcQuoteMetaFor(addr, { tries = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await arcQuoteMeta(addr); } catch (err) {
      lastErr = err;
      if (/valid contract address|zero address/.test(String(err && err.message))) throw err;
      await new Promise((r) => setTimeout(r, 700 * 2 ** i));
    }
  }
  throw lastErr;
}

/// Validates that `addr` is an ERC-20 we can pair with and reads its basics.
/// Throws an Error with a plain-language message otherwise.
function arcQuoteMeta(addr) {
  if (!addr || !ethers.isAddress(String(addr).trim())) return Promise.reject(new Error("That isn't a valid contract address."));
  const a = ethers.getAddress(String(addr).trim());
  const k = a.toLowerCase();
  if (_arcQuoteMetaCache.has(k)) return _arcQuoteMetaCache.get(k);
  if (ARC_KNOWN_QUOTES[k]) {
    const known = Promise.resolve({ address: a, ...ARC_KNOWN_QUOTES[k], isUsdc: arcIsUsdc(a) });
    _arcQuoteMetaCache.set(k, known);
    return known;
  }
  const p = (async () => {
    if (a === ethers.ZeroAddress) throw new Error("That's the zero address.");
    const code = await withRetry(() => readProvider().getCode(a));
    if (!code || code === "0x") throw new Error("There's no contract at that address on Arc.");
    const t = new ethers.Contract(a, [
      "function decimals() view returns (uint8)", "function symbol() view returns (string)",
      "function name() view returns (string)", "function totalSupply() view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
    ], readProvider());
    const netErr = (err) => /failed to fetch|internal error|upstream|unavailable|-32603|timeout|timed out|rate|limit|429|coalesce|network|missing response|bad response|server|503|502|ECONN|NETWORK_ERROR|SERVER_ERROR|TIMEOUT/i
      .test(String(err && (err.code || "")) + " " + String(err && (err.shortMessage || err.message) || err));
    // Busy RPCs sometimes answer a perfectly good call with an error that
    // looks like a revert ("missing revert data", -32603). Reads are free and
    // idempotent, so ask up to 3 times before calling a contract "not an
    // ERC-20" — a real non-token fails every time.
    const read = async (fn, notErc20) => {
      let last;
      for (let i = 0; i < 3; i++) {
        try { return await withRetry(fn, { tries: 3 }); } catch (err) { last = err; await new Promise((r) => setTimeout(r, 400 * 2 ** i)); }
      }
      if (netErr(last)) throw new Error("Couldn't reach Arc to read that token — try again in a moment.");
      throw new Error(notErc20);
    };
    const decimals = Number(await read(() => t.decimals(), "That contract doesn't look like an ERC-20 token (no decimals())."));
    if (!(decimals >= 0 && decimals <= 36)) throw new Error("That token reports unusual decimals — not supported.");
    const supply = await read(() => t.totalSupply(), "That contract doesn't look like an ERC-20 token.");
    await read(() => t.balanceOf(ethers.ZeroAddress), "That contract doesn't look like an ERC-20 token.");
    if (supply === 0n) throw new Error("That token has zero supply.");
    const symbol = await withRetry(() => t.symbol(), { tries: 3 }).catch(() => "TOKEN");
    const name = await withRetry(() => t.name(), { tries: 3 }).catch(() => symbol);
    // Symbol / name come from an arbitrary contract: keep them to plain
    // characters so they're safe wherever they're shown.
    const cleanSym = String(symbol).replace(/[^A-Za-z0-9$._-]/g, "").slice(0, 16) || "TOKEN";
    const cleanName = String(name).replace(/[<>"'`&]/g, "").slice(0, 48) || cleanSym;
    return { address: a, symbol: cleanSym, name: cleanName, decimals, isUsdc: arcIsUsdc(a) };
  })();
  p.catch(() => _arcQuoteMetaCache.delete(k));
  _arcQuoteMetaCache.set(k, p);
  return p;
}

/// Quote tokens per launched token (18-decimal) from a pool's sqrtPriceX96.
function arcPriceInQuote(sqrtPriceX96, quoteIsCurrency0, quoteDecimals) {
  if (!sqrtPriceX96) return null;
  const sp = Number(sqrtPriceX96) / 2 ** 96;
  const raw = sp * sp; // currency1 raw per currency0 raw
  const scale = Math.pow(10, 18 - quoteDecimals);
  const p = quoteIsCurrency0 ? scale / raw : raw * scale;
  return Number.isFinite(p) && p > 0 ? p : null;
}

async function _arcPoolSqrt(token) {
  const f = new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, readProvider());
  const key = await f.poolKeyOf(token);
  const poolId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"], [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
  const slot = ethers.keccak256(ethers.concat([poolId, ethers.toBeHex(6, 32)]));
  const pm = new ethers.Contract(CONFIG.POOL_MANAGER_ADDRESS, ["function extsload(bytes32) view returns (bytes32)"], readProvider());
  return BigInt(await pm.extsload(slot)) & ((1n << 160n) - 1n);
}

/// USD price of one whole `addr` token, or { price: null } if no source knows it.
/// Sources, in order: USDC itself · the $ARCIRCLE foci curve · an ArcPad pool
/// (for coins launched here, priced through their own pair) · Dexscreener.
async function arcQuotePriceUsd(addr, depth = 0) {
  const a = ethers.getAddress(addr);
  const k = a.toLowerCase();
  const hit = _arcQuotePriceCache.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  let out = { price: null, source: null };
  try {
    if (arcIsUsdc(a)) out = { price: 1, source: "USDC" };
    else if (ARC_QUOTE_PRESETS[1].address && ARCIRCLE_CURVE_ADDR && k === ARC_QUOTE_PRESETS[1].address.toLowerCase()) {
      const c = new ethers.Contract(ARCIRCLE_CURVE_ADDR, ["function getReserves() view returns (uint256,uint256)", "function graduated() view returns (bool)"], readProvider());
      const [grad, res] = await Promise.all([c.graduated().catch(() => false), withRetry(() => c.getReserves())]);
      if (!grad && res[1] > 0n) out = { price: Number(ethers.formatUnits(res[0], 6)) / Number(ethers.formatUnits(res[1], 18)), source: "foci curve" };
    }
    if (out.price == null && depth < 2) {
      const f = new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, readProvider());
      const idx = Number(await f.launchIndexOf(a).catch(() => 0n));
      if (idx > 0) {
        const l = await f.launches(idx - 1);
        const [qm, qp, sqrt] = await Promise.all([arcQuoteMetaFor(l.quoteToken), arcQuotePriceUsd(l.quoteToken, depth + 1), _arcPoolSqrt(a)]);
        const inQuote = arcPriceInQuote(sqrt, l.quoteIsCurrency0, qm.decimals);
        if (inQuote != null && qp.price != null) out = { price: inQuote * qp.price, source: "ArcPad pool" };
      }
    }
    if (out.price == null) {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/arc/${a}`);
      if (r.ok) {
        const pairs = (await r.json()) || [];
        const mine = (Array.isArray(pairs) ? pairs : []).filter((p) => p && p.chainId === "arc" && p.baseToken
          && String(p.baseToken.address).toLowerCase() === k && Number(p.priceUsd) > 0);
        mine.sort((x, y) => ((y.liquidity && y.liquidity.usd) || 0) - ((x.liquidity && x.liquidity.usd) || 0));
        if (mine.length) out = { price: Number(mine[0].priceUsd), source: "Dexscreener" };
      }
    }
  } catch (err) {
    console.warn("arcQuotePriceUsd failed for", a, err && err.message);
  }
  out.at = Date.now();
  if (out.price != null) _arcQuotePriceCache.set(k, out);
  return out;
}

/// Virtual quote reserve (raw units) worth ARC_START_RESERVE_USD at `priceUsd`.
function arcStartReserveRaw(priceUsd, decimals) {
  if (!(priceUsd > 0)) return null;
  const amount = ARC_START_RESERVE_USD / priceUsd;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const s = amount.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: Math.min(decimals, 18) });
  try { const raw = ethers.parseUnits(s, decimals); return raw > 0n ? raw : null; } catch { return null; }
}
