/* global ethers, CONFIG, HOMEPAD_FACTORY_ABI, PAIRED_FACTORY_ABI, PAIRED_SWAP_ROUTER_ABI, BONDING_CURVE_ABI, STOCK_BONDING_CURVE_ABI, ERC20_ABI */

const state = {
  account: null,
  signer: null,
  provider: null, // read-only, always available
  stockQuoteCache: null, // [{address, symbol}] — fetched once, reused across the Create form
};

function readProvider() {
  if (!state.provider) {
    state.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
  }
  return state.provider;
}

// ---- Bounding every eth_getLogs to "since HOMEPAD went live" ----
// Robinhood Chain has had tens of millions of blocks since July, and the
// PoolManager address in particular carries every Uniswap v4 swap on the
// chain. An unbounded queryFilter (block 0 -> latest) asks the public RPC
// to scan all of it and it times out — "could not coalesce error ... log
// query timed out (-32000)", seen live on Proof of Rent. Nothing HOMEPAD
// ever emitted predates CONFIG.CONTRACTS_LIVE_SINCE, so every log query in
// this file (and rent.js) starts there instead.
//
// The timestamp -> block lookup: two getBlock calls give the chain's real
// block rate, which puts the estimate within a few thousand blocks of the
// answer; a short binary search on that window finishes it (~6-8 calls
// total instead of ~25 for a blind search over the whole chain). Done once
// per page and remembered in localStorage — the answer never changes.

// The public RPC is free and rate-limited; a burst of page-load calls can
// get a 429, which the browser surfaces as a bare "Failed to fetch". These
// are transient — retry them, briefly, before giving up.
const TRANSIENT_RPC = /failed to fetch|timed out|timeout|429|rate limit|too many|coalesce|network error|ECONNRESET/i;
async function withRetry(fn, { tries = 3, delayMs = 900 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (!TRANSIENT_RPC.test(String(err && (err.shortMessage || err.message) || err))) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

let firstBlockPromise = null;
async function firstHomepadBlock() {
  if (firstBlockPromise) return firstBlockPromise;
  firstBlockPromise = (async () => {
    const target = Math.floor(Date.parse(CONFIG.CONTRACTS_LIVE_SINCE) / 1000);
    const cacheKey = `homepad.firstBlock.${CONFIG.CHAIN_ID_DECIMAL}.${target}`;
    try { const c = localStorage.getItem(cacheKey); if (c) return Number(c); } catch { /* storage blocked */ }
    const provider = readProvider();
    const blockAt = (n) => withRetry(() => provider.getBlock(n));

    const latest = await blockAt("latest");
    if (Number(latest.timestamp) < target) return latest.number; // config timestamp is in the future?? just use latest
    // Measure the real block rate over a recent window, then extrapolate.
    const probeN = Math.max(0, latest.number - 500_000);
    const probe = await blockAt(probeN);
    const secPerBlock = Math.max(0.01, (Number(latest.timestamp) - Number(probe.timestamp)) / Math.max(1, latest.number - probeN));
    let guess = Math.round(latest.number - (Number(latest.timestamp) - target) / secPerBlock);
    guess = Math.min(Math.max(0, guess), latest.number);
    // Widen a window around the guess until it brackets the target, then bisect.
    let span = 8_000, lo, hi;
    for (;;) {
      lo = Math.max(0, guess - span); hi = Math.min(latest.number, guess + span);
      const [bLo, bHi] = await Promise.all([blockAt(lo), blockAt(hi)]);
      const loBefore = Number(bLo.timestamp) < target, hiAfter = Number(bHi.timestamp) >= target;
      if ((loBefore || lo === 0) && (hiAfter || hi === latest.number)) break;
      span *= 4;
    }
    // `lo` is always a block from BEFORE the target — an exact boundary isn't
    // needed, only a safe starting point — so stop once the window is a
    // couple thousand blocks wide instead of bisecting all the way down.
    while (hi - lo > 2048) {
      const mid = Math.floor((lo + hi) / 2);
      const b = await blockAt(mid);
      if (Number(b.timestamp) < target) lo = mid; else hi = mid;
    }
    try { localStorage.setItem(cacheKey, String(lo)); } catch { /* fine */ }
    return lo;
  })().catch((err) => { firstBlockPromise = null; throw err; });
  return firstBlockPromise;
}

// Multicall3 is deployed at this exact same address on 250+ EVM chains
// (a well-known, permissionlessly-redeployable CREATE2 contract) — batches
// many read-only contract calls into a single RPC round trip instead of
// one request per call. Explore and the token detail pages both fetch a
// lot of small pieces of data per token; without this, that's N+ separate
// round trips that only get slower as more tokens get launched.
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
];
let multicallAvailable = null; // null = not checked yet, else true/false (cached for the session)

async function isMulticallAvailable() {
  if (multicallAvailable !== null) return multicallAvailable;
  try {
    const code = await readProvider().getCode(MULTICALL3_ADDRESS);
    multicallAvailable = code !== "0x";
  } catch {
    multicallAvailable = false;
  }
  if (!multicallAvailable) {
    console.warn("Multicall3 not found on this chain — falling back to one request per call.");
  }
  return multicallAvailable;
}

/// Batches many read-only calls into one RPC round trip via Multicall3,
/// falling back to a plain Promise.all (one request per call) if it isn't
/// deployed on this chain. `calls` is an array of
/// { contract: ethers.Contract, method: "name", args: [...] }.
/// A failed individual call resolves to null rather than rejecting the
/// whole batch — same "one bad entry shouldn't blank the page" principle
/// as fetchAllLaunches' Promise.allSettled.
async function multicallRead(calls) {
  if (calls.length === 0) return [];
  const available = await isMulticallAvailable();
  const plainFallback = () => Promise.all(calls.map((c) =>
    c.contract[c.method](...(c.args || [])).catch((err) => {
      console.warn(`multicallRead fallback: ${c.method} failed`, err);
      return null;
    })
  ));

  if (!available) return plainFallback();

  try {
    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider());
    const encoded = calls.map((c) => ({
      target: c.contract.target,
      allowFailure: true,
      callData: c.contract.interface.encodeFunctionData(c.method, c.args || []),
    }));
    // .staticCall forces a read-only eth_call regardless of aggregate3
    // being marked `payable` in its ABI (Multicall3 does this deliberately,
    // to save gas — it's meant to be read via a static call, never an
    // actual transaction. Calling it as .aggregate3(...) directly risks
    // ethers treating it as a state-changing call instead.)
    const results = await mc.aggregate3.staticCall(encoded);
    return results.map((r, i) => {
      if (!r.success) return null;
      try {
        const decoded = calls[i].contract.interface.decodeFunctionResult(calls[i].method, r.returnData);
        return decoded.length === 1 ? decoded[0] : decoded;
      } catch {
        return null;
      }
    });
  } catch (err) {
    // Multicall3's code exists but the call itself failed for some other
    // reason — fall back to individual calls rather than losing the
    // whole page over it.
    console.warn("Multicall3 call failed — falling back to one request per call.", err);
    return plainFallback();
  }
}

let ethUsdCache = { price: null, ts: 0 };
/// ETH/USD, cached for a minute so every market-cap stat card doesn't
/// each trigger its own fetch. Testnet ETH obviously has no real value —
/// this is purely for displaying market cap the way people expect to
/// read it (a $ figure), same as it'll work once this is real ETH.
async function getEthUsdPrice() {
  const ONE_MINUTE = 60_000;
  if (ethUsdCache.price != null && Date.now() - ethUsdCache.ts < ONE_MINUTE) {
    return ethUsdCache.price;
  }
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    const data = await res.json();
    const price = data?.ethereum?.usd;
    if (typeof price === "number") {
      ethUsdCache = { price, ts: Date.now() };
      return price;
    }
  } catch (err) {
    console.warn("Couldn't fetch ETH/USD price", err);
  }
  return ethUsdCache.price; // stale cache (or null) is still better than nothing
}

// ---- Dexscreener stats for HOMEPAD launches ----
// Same public, keyless API the $HOME hero uses (home-stats.js), applied to
// every launch: price, 24h change, 24h volume, liquidity, market cap. It's
// the indexed, aggregated view of the pool — the on-chain reconstruction
// (trade events, virtual reserves) stays as the fallback for pairs
// Dexscreener hasn't picked up yet (a brand-new launch typically takes a
// few minutes). One batched request per 30 tokens; results cached briefly
// so the carousel, Explore, and a token page don't each refetch.
const dexStatsCache = new Map(); // tokenAddrLower -> { stats|null, ts }
const DEX_STATS_TTL = 45_000;

async function fetchDexscreenerStats(tokenAddresses) {
  const chain = CONFIG.DEXSCREENER_CHAIN_SLUG;
  const out = new Map();
  const need = [];
  const now = Date.now();
  for (const addr of tokenAddresses) {
    const key = addr.toLowerCase();
    const c = dexStatsCache.get(key);
    if (c && now - c.ts < DEX_STATS_TTL) { if (c.stats) out.set(key, c.stats); }
    else need.push(key);
  }
  for (let i = 0; i < need.length; i += 30) {
    const chunk = need.slice(i, i + 30);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`);
      if (!res.ok) throw new Error("dexscreener http " + res.status);
      const data = await res.json();
      const byToken = new Map();
      for (const p of data.pairs || []) {
        if (p.chainId !== chain || !p.baseToken?.address) continue;
        const key = p.baseToken.address.toLowerCase();
        if (!chunk.includes(key)) continue;
        // Several pairs can exist for one token — keep the deepest one.
        const prev = byToken.get(key);
        if (!prev || (p.liquidity?.usd || 0) > (prev.liquidity?.usd || 0)) byToken.set(key, p);
      }
      for (const key of chunk) {
        const p = byToken.get(key);
        const stats = p ? {
          priceUsd: p.priceUsd != null ? Number(p.priceUsd) : null,
          priceNative: p.priceNative != null ? Number(p.priceNative) : null, // in the pair's quote (ETH for our pools)
          change24h: p.priceChange?.h24 != null ? Number(p.priceChange.h24) : null,
          volume24hUsd: p.volume?.h24 != null ? Number(p.volume.h24) : null,
          liquidityUsd: p.liquidity?.usd != null ? Number(p.liquidity.usd) : null,
          marketCapUsd: p.marketCap != null ? Number(p.marketCap) : (p.fdv != null ? Number(p.fdv) : null),
          txns24h: p.txns?.h24 ? (Number(p.txns.h24.buys || 0) + Number(p.txns.h24.sells || 0)) : null,
          pairAddress: p.pairAddress || null,
          url: p.url || null,
        } : null;
        dexStatsCache.set(key, { stats, ts: now });
        if (stats) out.set(key, stats);
      }
    } catch (err) {
      console.warn("Dexscreener stats fetch failed", err);
      // Leave these uncached so the next render retries; callers fall back to on-chain values.
    }
  }
  return out;
}

/// Overlays Dexscreener numbers onto a launch entry (card data) when the
/// pair is indexed — a Paired launch's own pool gets indexed the same way
/// any other v4 pool does, so this now applies to every type.
function applyDexStats(entry, dex) {
  if (!dex) return;
  entry.dex = dex;
  if (dex.marketCapUsd != null) entry.marketCapUsd = dex.marketCapUsd;
  if (dex.change24h != null) entry.change24h = dex.change24h;
  entry.volume24hUsd = dex.volume24hUsd;
  entry.liquidityUsd = dex.liquidityUsd;
  entry.priceUsd = dex.priceUsd;
}

/// Fallback for a Paired launch Dexscreener hasn't indexed yet (typically
/// just-launched): value marketCapQuote in USD using the QUOTE token's own
/// live price — e.g. a brand-new token paired against $HOMEPAD shows a
/// real $ figure immediately, using $HOMEPAD's already-indexed price,
/// instead of waiting for its own brand-new pool to get indexed.
function applyQuoteUsdFallback(entry, quoteDex) {
  if (entry.marketCapUsd != null || !quoteDex || quoteDex.priceUsd == null) return;
  entry.marketCapUsd = entry.marketCapQuote * quoteDex.priceUsd;
  entry.marketCapUsdSource = "quote"; // via the quote token's price, not this pair's own
}

function fmtUsd(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1000) return "$" + n.toFixed(2);
  if (n < 1_000_000) return "$" + (n / 1000).toFixed(2) + "K";
  if (n < 1_000_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  return "$" + (n / 1_000_000_000).toFixed(2) + "B";
}

/// Same K/M/B compaction as fmtUsd, minus the $ — for amounts denominated
/// in an arbitrary quote token (stock pairs) rather than USD. Keeps card
/// values to a handful of characters so they never wrap onto two lines
/// the way "48.000" (fmtEth's fixed-3-decimal style) did.
function fmtCompact(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1000) return n.toFixed(n < 1 ? 4 : n < 10 ? 3 : 1).replace(/\.?0+$/, "");
  if (n < 1_000_000) return (n / 1000).toFixed(2) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + "M";
  return (n / 1_000_000_000).toFixed(2) + "B";
}

/// Builds transaction overrides (gas limit + fee data) using our own
/// direct RPC connection instead of whatever provider sits behind the
/// connected wallet. Some wallet-connect-style providers (WalletConnect
/// sessions especially) don't reliably answer the handful of parallel
/// read calls ethers normally makes before sending a tx (gas price, fee
/// history, etc.) — when even one of those fails, ethers throws a
/// generic "could not coalesce error" instead of a useful message.
/// Fetching fee data ourselves and passing it explicitly means ethers
/// doesn't need to ask the wallet's provider for any of it.
/// Doesn't cancel or race the underlying promise — just updates the status
/// message if it's taking unusually long, since a stuck "confirm in your
/// wallet" with no feedback looks identical whether the wallet is genuinely
/// still waiting or the response just never made it back to this tab (a
/// real failure mode seen with some WalletConnect-relayed sessions). The
/// original promise keeps running either way, so a late resolution still
/// completes normally.
function withTimeoutHint(promise, statusEl) {
  const timer = setTimeout(() => {
    if (statusEl.isConnected) {
      statusEl.innerHTML = `<div class="status pending">Still waiting on your wallet… If you already approved it, check your wallet app's activity tab or <a href="${CONFIG.BLOCK_EXPLORER}/address/${state.account}" target="_blank" style="color:inherit;text-decoration:underline">the explorer</a> directly — it may have gone through even if this page hasn't caught up.</div>`;
    }
  }, 20000);
  return promise.finally(() => clearTimeout(timer));
}

async function getTxOverrides(gasLimit) {  // chainId is already known statically — no need to ask the wallet's
  // provider for it (one less concurrent call through that connection).
  const overrides = { gasLimit, chainId: CONFIG.CHAIN_ID_DECIMAL };
  try {
    const feeData = await readProvider().getFeeData();
    if (feeData.maxFeePerGas != null) {
      overrides.maxFeePerGas = feeData.maxFeePerGas;
      overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    } else if (feeData.gasPrice != null) {
      overrides.gasPrice = feeData.gasPrice;
    }
  } catch (err) {
    console.warn("Couldn't fetch fee data ourselves — falling back to the wallet's own estimate.", err);
  }
  // The nonce is the other read ethers would otherwise fetch through the
  // connected wallet's own provider right before sending — and that's
  // exactly the kind of call that's been failing ("could not coalesce
  // error") on some wallet-connect-style connections. Getting it from our
  // own RPC instead means the wallet is only ever asked to sign, nothing else.
  try {
    if (state.account) {
      overrides.nonce = await readProvider().getTransactionCount(state.account, "pending");
    }
  } catch (err) {
    console.warn("Couldn't fetch nonce ourselves — falling back to the wallet's own count.", err);
  }
  return overrides;
}

function curveFactoryConfigured() {
  return !!(CONFIG.FACTORY_ADDRESS && CONFIG.FACTORY_ADDRESS.length === 42);
}
function factoryRead() {
  return new ethers.Contract(CONFIG.FACTORY_ADDRESS, HOMEPAD_FACTORY_ABI, readProvider());
}
function factoryWrite() {
  return new ethers.Contract(CONFIG.FACTORY_ADDRESS, HOMEPAD_FACTORY_ABI, state.signer);
}
function curveRead(addr) {
  return new ethers.Contract(addr, BONDING_CURVE_ABI, readProvider());
}
function curveWrite(addr) {
  return new ethers.Contract(addr, BONDING_CURVE_ABI, state.signer);
}
function tokenRead(addr) {
  return new ethers.Contract(addr, ERC20_ABI, readProvider());
}
function tokenWrite(addr) {
  return new ethers.Contract(addr, ERC20_ABI, state.signer);
}

function instantFactoryConfigured() {
  return !!(CONFIG.INSTANT_FACTORY_ADDRESS && CONFIG.INSTANT_FACTORY_ADDRESS.length === 42);
}
function instantFactoryRead() {
  return new ethers.Contract(CONFIG.INSTANT_FACTORY_ADDRESS, INSTANT_FACTORY_ABI, readProvider());
}
function instantFactoryWrite() {
  return new ethers.Contract(CONFIG.INSTANT_FACTORY_ADDRESS, INSTANT_FACTORY_ABI, state.signer);
}
function swapRouterRead() {
  return new ethers.Contract(CONFIG.SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, readProvider());
}
function swapRouterWrite() {
  return new ethers.Contract(CONFIG.SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, state.signer);
}
function hybridFactoryConfigured() {
  return !!(CONFIG.HYBRID_FACTORY_ADDRESS && CONFIG.HYBRID_FACTORY_ADDRESS.length === 42);
}
function hybridFactoryRead() {
  return new ethers.Contract(CONFIG.HYBRID_FACTORY_ADDRESS, HYBRID_FACTORY_ABI, readProvider());
}
function hybridFactoryWrite() {
  return new ethers.Contract(CONFIG.HYBRID_FACTORY_ADDRESS, HYBRID_FACTORY_ABI, state.signer);
}
function hybridSwapRouterRead() {
  return new ethers.Contract(CONFIG.HYBRID_SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, readProvider());
}
function hybridSwapRouterWrite() {
  return new ethers.Contract(CONFIG.HYBRID_SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, state.signer);
}

function pairedFactoryConfigured() {
  return !!(CONFIG.PAIRED_FACTORY_ADDRESS && CONFIG.PAIRED_FACTORY_ADDRESS.length === 42);
}
function pairedFactoryRead() {
  return new ethers.Contract(CONFIG.PAIRED_FACTORY_ADDRESS, PAIRED_FACTORY_ABI, readProvider());
}
function pairedFactoryWrite() {
  return new ethers.Contract(CONFIG.PAIRED_FACTORY_ADDRESS, PAIRED_FACTORY_ABI, state.signer);
}
/// Every configured paired factory (current + legacy), each with its own router.
function pairedFactorySources() {
  const sources = [];
  if (pairedFactoryConfigured()) {
    sources.push({ factory: pairedFactoryRead(), router: new ethers.Contract(CONFIG.PAIRED_SWAP_ROUTER_ADDRESS, PAIRED_SWAP_ROUTER_ABI, readProvider()) });
  }
  for (const l of CONFIG.LEGACY_PAIRED_FACTORIES || []) {
    sources.push({
      factory: new ethers.Contract(l.factory, PAIRED_FACTORY_ABI, readProvider()),
      router: new ethers.Contract(l.router, PAIRED_SWAP_ROUTER_ABI, readProvider()),
    });
  }
  return sources;
}
/// Quote tokens the launch form offers — config-curated (stocks now, $HOME later).
function quoteTokenOptions() {
  return (CONFIG.QUOTE_TOKENS || []).filter((q) => q.address && q.address.length === 42);
}
function quoteTokenInfo(address) {
  const a = (address || "").toLowerCase();
  // HOME_QUOTE/HOMEPAD_QUOTE are single fixed quotes, not part of the
  // QUOTE_TOKENS dropdown list — but every OTHER paired-mode code path
  // (submit, card/token-page display, launch-list rendering) looks up
  // quote info by address through this one function regardless of which
  // UI tab it came from, so it has to recognize both sources or those
  // paths 404 on a null lookup for anything launched against them.
  // quoteTokenOptions() deliberately stays QUOTE_TOKENS-only — this
  // doesn't add either to the Stock dropdown, just makes address lookups
  // find them.
  for (const fixed of [CONFIG.HOME_QUOTE, CONFIG.HOMEPAD_QUOTE]) {
    if (fixed && (fixed.address || "").toLowerCase() === a) return fixed;
  }
  return (CONFIG.QUOTE_TOKENS || []).find((q) => (q.address || "").toLowerCase() === a) || null;
}
/// Stock mode is "live" once the paired factory is deployed AND at least one quote token is configured.
function stockModeLive() {
  return pairedFactoryConfigured() && quoteTokenOptions().length > 0;
}

/// How many of a given fixed quote ($HOME, $HOMEPAD — any q with a live
/// USD price) should buy the full 1B supply, so a new launch paired
/// against it opens at the same USD starting market cap Hybrid launches
/// open at right now. Hybrid's own starting cap is defined as
/// initialVirtualEth (that many ETH buys the whole supply) — convert it
/// through both assets' current USD price: same idea, different quote.
async function computeQuoteEquivalentStartPrice(q) {
  const [virtualEthWei, ethUsd, dex] = await Promise.all([
    hybridFactoryRead().initialVirtualEth(),
    getEthUsdPrice(),
    fetchDexscreenerStats([q.address]),
  ]);
  const quoteUsd = dex.get(q.address.toLowerCase())?.priceUsd;
  if (ethUsd == null || !quoteUsd) throw new Error(`missing ETH or ${q.symbol} price`);
  const virtualEth = Number(ethers.formatEther(virtualEthWei));
  const startCapUsd = virtualEth * ethUsd;
  const quoteAmount = startCapUsd / quoteUsd;
  // Round to something a creator would actually type, not a 14-decimal float.
  return quoteAmount >= 1000 ? String(Math.round(quoteAmount)) : quoteAmount.toPrecision(4);
}

// Preview tickers shown in the Stock tab before the paired factory is deployed.
const STOCK_PREVIEW_TICKERS = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "AMD"];

async function connectWallet() {
  // Prefer the polished Reown AppKit modal (wallet list + WalletConnect QR)
  // when it's available — see wallet-appkit.js. Falls through to the basic
  // window.ethereum flow below if AppKit isn't configured or failed to load.
  if (typeof setUserDisconnected === "function") setUserDisconnected(false);
  if (typeof tryOpenAppKit === "function" && await tryOpenAppKit()) return;

  if (!window.ethereum) {
    alert("No wallet found. Install MetaMask, Rabby, or another EVM wallet.");
    return;
  }
  // Accounts first, network second: a rejected/failed network switch must
  // not leave the wallet looking disconnected. The wrong-chain state shows
  // in the header badge (tap to switch) and is enforced before any write.
  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await browserProvider.send("eth_requestAccounts", []);
  if (!accounts || !accounts.length) return;
  state.account = accounts[0];
  state.signer = await browserProvider.getSigner();
  renderHeader();
  attachBasicWalletListeners();
  try { await ensureNetwork(); } catch (err) { console.warn("network switch declined/failed — showing wrong-network badge instead", err && err.message); }
  if (typeof updateNetworkBadge === "function") updateNetworkBadge();
}

/// Silent restore for the plain injected flow (in-app wallet browsers and
/// any page where AppKit isn't used): eth_accounts never prompts, so if
/// the wallet already allows this site the header shows it on load —
/// unless the person pressed Disconnect, which is honoured until they
/// press Connect again.
async function restoreBasicWallet() {
  if (!window.ethereum) return;
  try {
    if (typeof userDisconnected === "function" && userDisconnected()) return;
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accounts || !accounts.length) return;
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    state.account = accounts[0];
    state.signer = await browserProvider.getSigner();
    renderHeader();
    attachBasicWalletListeners();
    if (typeof updateNetworkBadge === "function") updateNetworkBadge();
    if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
  } catch (err) {
    console.warn("basic wallet restore failed", err && err.message);
  }
}

// The basic (non-AppKit) connect flow never listened for the wallet
// switching accounts or networks on its own — so if you changed accounts
// inside MetaMask itself, this app kept showing the old one until you
// manually reconnected. Attached once per page load, not once per connect.
let basicListenersAttached = false;
function attachBasicWalletListeners() {
  if (basicListenersAttached || !window.ethereum) return;
  basicListenersAttached = true;

  window.ethereum.on("accountsChanged", async (accounts) => {
    const prevAccount = state.account;
    if (accounts.length === 0) {
      state.account = null;
      state.signer = null;
    } else {
      state.account = accounts[0];
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      state.signer = await browserProvider.getSigner();
    }
    renderHeader();
    if (state.account !== prevAccount) refreshAccountDependentViews();
  });

  window.ethereum.on("chainChanged", () => {
    // Simplest reliable fix for a chain switch mid-session — the whole
    // provider/signer chain context can otherwise get out of sync.
    location.reload();
  });
}

/// Disconnects whichever wallet is currently connected — works for both
/// the AppKit/wagmi path and the basic window.ethereum path. "Disconnect"
/// here means "forget this session on our end," the same as most dapps —
/// a website can't force a wallet extension to revoke its own permissions.
async function disconnectWallet() {
  if (typeof setUserDisconnected === "function") setUserDisconnected(true);
  if (typeof hardDisconnect === "function") { await hardDisconnect(); return; } // AppKit + wagmi + storage + header, in the right order
  try {
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      await WagmiCoreRef.disconnect(wagmiConfigRef);
    }
  } catch (err) {
    console.warn("Wallet disconnect (AppKit side) failed — clearing local state anyway.", err);
  }
  // Belt-and-suspenders: a session already in a broken state (expired
  // WalletConnect relay, etc.) can survive the call above and quietly
  // reappear as "already connected" the next time Connect wallet is
  // opened — the exact bug this button exists to prevent. Sweeping the
  // known wagmi/WalletConnect/Reown storage keys directly (see
  // wallet-appkit.js) makes sure Disconnect actually means disconnected.
  if (typeof clearStaleWalletStorage === "function") clearStaleWalletStorage();
  state.account = null;
  state.signer = null;
  renderHeader();
}

async function ensureNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CONFIG.CHAIN_ID_HEX }],
    });
  } catch (switchErr) {
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CONFIG.CHAIN_ID_HEX,
          chainName: CONFIG.CHAIN_NAME,
          rpcUrls: [CONFIG.RPC_URL],
          blockExplorerUrls: [CONFIG.BLOCK_EXPLORER],
          nativeCurrency: CONFIG.NATIVE_CURRENCY,
        }],
      });
    } else {
      throw switchErr;
    }
  }
}

function short(addr) {
  return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "";
}

/// Called after state.account changes for a reason OTHER than the user's
/// own trade on this page (switching accounts in the wallet itself, or a
/// session restoring to a different account than before) — re-renders
/// whichever account-dependent view is currently open so it reflects the
/// NEW account, not stale numbers fetched for whichever account was
/// connected when the page first loaded. A completed trade already
/// triggers its own refresh (see the trade button's `done()`); this
/// covers the case that didn't.
function refreshAccountDependentViews() {
  const hash = location.hash;
  if (hash.startsWith("#/token/")) renderTokenDetail(hash.split("/")[2]);
  else if (hash.startsWith("#/profile") && typeof renderProfile === "function") renderProfile();
}

// No indexer yet — same tradeoff as Explore's launch list (see README).
// Fine at low launch volume; loops every launch to find this token's metadata.
async function findLaunchMeta(factory, tokenAddr) {
  // Parallelized instead of one sequential RPC round trip per launch —
  // HomepadFactoryV4 (already deployed) has no direct token->index
  // lookup, so this still needs every launch's data, just fetched
  // concurrently instead of one at a time.
  const count = Number(await factory.launchCount());
  const all = await Promise.all(Array.from({ length: count }, (_, i) => factory.launches(i)));
  return all.find((l) => l.token.toLowerCase() === tokenAddr.toLowerCase()) || null;
}

async function findInstantLaunchMeta(tokenAddr) {
  for (const s of instantFactorySources()) {
    try {
      const idx = await s.factory.launchIndexOf(tokenAddr);
      if (idx !== 0n) return { meta: await s.factory.launches(idx - 1n), routerAddress: s.router.target, factory: s.factory };
    } catch { /* try the next source */ }
  }
  return null;
}

async function findPairedLaunchMeta(tokenAddr) {
  for (const s of pairedFactorySources()) {
    try {
      const idx = await s.factory.launchIndexOf(tokenAddr);
      if (idx !== 0n) return { meta: await s.factory.launches(idx - 1n), routerAddress: s.router.target, factory: s.factory };
    } catch { /* try the next source */ }
  }
  return null;
}

async function findHybridLaunchMeta(tokenAddr) {
  for (const s of hybridFactorySources()) {
    try {
      const idx = await s.factory.launchIndexOf(tokenAddr);
      if (idx !== 0n) return { meta: await s.factory.launches(idx - 1n), routerAddress: s.router.target, factory: s.factory };
    } catch { /* try the next source */ }
  }
  return null;
}

function renderHeader() {
  const el = document.getElementById("wallet-slot");
  if (state.account) {
    el.innerHTML = `
      <div class="wallet-info">
        <span class="network-badge" id="network-badge">…</span>
        <div class="wallet-dropdown-wrap" id="wallet-dropdown-wrap">
          <button class="wallet-pill" id="wallet-pill-btn">${short(state.account)} <svg class="wallet-pill-chevron" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg></button>
          <div class="wallet-dropdown" id="wallet-dropdown">
            <div class="wallet-dropdown-address">
              <code>${short(state.account)}</code>
              <span class="btn-mini" id="wallet-dropdown-copy" style="cursor:pointer">Copy</span>
            </div>
            <div class="wallet-dropdown-network" id="wallet-dropdown-network">…</div>
            <a class="wallet-dropdown-item" href="explore.html#/profile">My Profile</a>
            <a class="wallet-dropdown-item" href="${CONFIG.BLOCK_EXPLORER}/address/${state.account}" target="_blank">View on Explorer ↗</a>
            <div class="wallet-dropdown-item wallet-dropdown-disconnect" id="wallet-dropdown-disconnect">Disconnect</div>
          </div>
        </div>
      </div>
    `;
    const wrap = document.getElementById("wallet-dropdown-wrap");
    const dropdown = document.getElementById("wallet-dropdown");
    document.getElementById("wallet-pill-btn").onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    };
    document.getElementById("wallet-dropdown-copy").onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(state.account);
    };
    document.getElementById("wallet-dropdown-disconnect").onclick = () => {
      dropdown.classList.remove("open");
      disconnectWallet();
    };
    updateNetworkBadge();
  } else {
    el.innerHTML = `<button class="btn btn-primary" id="connect-btn">Connect wallet</button>`;
    document.getElementById("connect-btn").onclick = connectWallet;
  }
}

/// Shows which chain the connected wallet is actually on, right in the
/// header — so "which network am I on?" never requires digging through
/// wallet menus. Highlights in red if it's not Robinhood Chain.
async function updateNetworkBadge() {
  const badge = document.getElementById("network-badge");
  if (!badge || !state.signer) return;
  try {
    const network = await state.signer.provider.getNetwork();
    const chainId = Number(network.chainId);
    const isCorrect = chainId === CONFIG.CHAIN_ID_DECIMAL;
    const label = isCorrect ? "Mainnet" : `Wrong network (chain ${chainId}) — switch to Robinhood Chain`;
    badge.textContent = isCorrect ? "Mainnet" : `⚠ wrong network (${chainId}) · tap to switch`;
    badge.title = label;
    badge.classList.toggle("network-bad", !isCorrect);
    badge.style.cursor = isCorrect ? "" : "pointer";
    badge.onclick = isCorrect ? null : async () => {
      const prev = badge.textContent;
      badge.textContent = "check your wallet…"; // on mobile the approval appears inside the wallet app, not here
      try {
        if (typeof appKitReady !== "undefined" && appKitReady && typeof ensureAppKitChain === "function") await ensureAppKitChain();
        else if (window.ethereum) { await ensureNetwork(); location.reload(); }
      } catch (err) { badge.textContent = prev; alert(String(err && err.message || err)); }
    };
    // On phones the badge collapses to just its dot, so the readable
    // version of the same status lives inside the wallet dropdown too.
    const line = document.getElementById("wallet-dropdown-network");
    if (line) {
      line.textContent = label;
      line.classList.toggle("network-bad", !isCorrect);
    }
  } catch (err) {
    badge.textContent = "network unknown";
    const line = document.getElementById("wallet-dropdown-network");
    if (line) line.textContent = "Network unknown";
  }
}

// ---------- Router ----------

function route(fromUserNav) {
  if (!document.getElementById("app")) return; // this page (Docs, Mechanism, Flywheel...) has no launchpad panel to render into
  const rawHash = location.hash;
  const hash = rawHash || "#/explore";
  if (!hash.startsWith("#/")) {
    // Plain page anchors (#top, #story, #plan) aren't app routes — but if
    // the page LOADED with one (e.g. a reload after clicking "Plan"), the
    // launchpad panel still needs its default content, or it sits on the
    // static "Loading…" forever. Render the preview once, don't scroll.
    if (!route.rendered) { route.rendered = true; renderExplorePreview(); }
    return;
  }
  route.rendered = true;
  const [, view, param] = hash.split("/");
  // (No persistent "active" highlight on nav items — Explore being the
  // default route made it look permanently pressed, which read as broken.)

  if (view === "create") renderCreate();
  else if (view === "token" && param) renderTokenDetail(param);
  else if (view === "profile") renderProfile();
  // A bare page load (no hash yet) shows the compact homepage preview.
  // Explicitly navigating to #/explore — clicking the nav link, a
  // deep link, browser back/forward — shows the full page with
  // search/sort/filter instead.
  else if (!rawHash) renderExplorePreview();
  else renderExploreFull();

  // Clicking a nav item should feel like moving to a new screen, so scroll
  // the app panel into view — but ONLY when a user actually clicked
  // something. The very first route() call on page load must NOT do this,
  // or the site opens already scrolled down to the launchpad section
  // instead of the top of the page.
  if (fromUserNav) {
    const appEl = document.getElementById("app");
    if (appEl) appEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
window.addEventListener("hashchange", () => route(true));
// Closes the wallet dropdown on any click outside it — a single
// persistent listener (not re-added every renderHeader() call) so it
// never accumulates duplicates across wallet connect/disconnect/account
// changes.
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("wallet-dropdown");
  const wrap = document.getElementById("wallet-dropdown-wrap");
  if (dropdown && wrap && !wrap.contains(e.target)) dropdown.classList.remove("open");
});

// ---------- Explore ----------

/// Fetches every launch across both factories (bonding curve + instant),
/// enriched with the on-chain data each card/sort/filter mode needs. One
/// shared fetch used by both the compact homepage preview and the full
/// Explore page, so they never drift out of sync with each other.
/// Every currently-configured Instant factory: the live one plus any
/// legacy deployments kept around so old testnet launches don't vanish
/// from Explore just because the factory got redeployed. Each entry
/// pairs a factory with ITS OWN matching router (they're wired together
/// at deploy time and aren't interchangeable).
function instantFactorySources() {
  const sources = [];
  if (instantFactoryConfigured()) {
    sources.push({ factory: instantFactoryRead(), router: swapRouterRead() });
  }
  for (const l of CONFIG.LEGACY_INSTANT_FACTORIES || []) {
    sources.push({
      factory: new ethers.Contract(l.factory, INSTANT_FACTORY_ABI, readProvider()),
      router: new ethers.Contract(l.router, SWAP_ROUTER_ABI, readProvider()),
    });
  }
  return sources;
}
function hybridFactorySources() {
  const sources = [];
  if (hybridFactoryConfigured()) {
    sources.push({ factory: hybridFactoryRead(), router: hybridSwapRouterRead() });
  }
  for (const l of CONFIG.LEGACY_HYBRID_FACTORIES || []) {
    sources.push({
      factory: new ethers.Contract(l.factory, HYBRID_FACTORY_ABI, readProvider()),
      router: new ethers.Contract(l.router, SWAP_ROUTER_ABI, readProvider()),
    });
  }
  return sources;
}

async function fetchAllLaunches(opts) {
  const skipHistory = !!(opts && opts.skipHistory);
  // Bonding Curve is deferred (FACTORY_ADDRESS unset) — guard this the same
  // way instant/hybrid/paired already are below, instead of unconditionally
  // building a contract on an empty address, which threw synchronously and
  // took down every OTHER mode's launches with it (nothing showed on
  // Explore at all, not just curve ones).
  const curveIsLive = curveFactoryConfigured();
  const factory = curveIsLive ? factoryRead() : null;
  const curveCount = curveIsLive ? Number(await factory.launchCount()) : 0;
  const instantSources = instantFactorySources();
  const hybridSources = hybridFactorySources();
  const pairedSources = pairedFactorySources();
  const [instantCounts, hybridCounts, pairedCounts] = await Promise.all([
    Promise.all(instantSources.map((s) => s.factory.launchCount().then(Number))),
    Promise.all(hybridSources.map((s) => s.factory.launchCount().then(Number))),
    Promise.all(pairedSources.map((s) => s.factory.launchCount().then(Number).catch(() => 0))),
  ]);

  if (curveCount === 0 && instantCounts.every((c) => c === 0) && hybridCounts.every((c) => c === 0) && pairedCounts.every((c) => c === 0)) return [];

  // Round 1: fetch every launch's struct (token/curve addresses, meta) in
  // one batched call instead of one request per launch — spans every
  // source (curve, every instant factory, every hybrid factory) at once.
  const round1Calls = [
    ...Array.from({ length: curveCount }, (_, i) => ({ contract: factory, method: "launches", args: [i] })),
    ...instantSources.flatMap((s, si) => Array.from({ length: instantCounts[si] }, (_, i) => ({ contract: s.factory, method: "launches", args: [i] }))),
    ...hybridSources.flatMap((s, si) => Array.from({ length: hybridCounts[si] }, (_, i) => ({ contract: s.factory, method: "launches", args: [i] }))),
    ...pairedSources.flatMap((s, si) => Array.from({ length: pairedCounts[si] }, (_, i) => ({ contract: s.factory, method: "launches", args: [i] }))),
  ];
  const round1 = await multicallRead(round1Calls);
  let cur = 0;
  const curveLaunches = round1.slice(cur, cur += curveCount).filter(Boolean);
  const instantLaunches = []; // { launch, source }
  for (let si = 0; si < instantSources.length; si++) {
    for (const l of round1.slice(cur, cur += instantCounts[si]).filter(Boolean)) {
      instantLaunches.push({ launch: l, source: instantSources[si] });
    }
  }
  const hybridLaunches = [];
  for (let si = 0; si < hybridSources.length; si++) {
    for (const l of round1.slice(cur, cur += hybridCounts[si]).filter(Boolean)) {
      hybridLaunches.push({ launch: l, source: hybridSources[si] });
    }
  }
  const pairedLaunches = [];
  for (let si = 0; si < pairedSources.length; si++) {
    for (const l of round1.slice(cur, cur += pairedCounts[si]).filter(Boolean)) {
      pairedLaunches.push({ launch: l, source: pairedSources[si] });
    }
  }

  // Round 2: now that we know every token/curve address, batch every
  // per-token stat read (name, symbol, reserves, etc.) across ALL launches
  // into one more batched call.
  const round2Calls = [];
  for (const l of curveLaunches) {
    const token = tokenRead(l.token);
    const curve = curveRead(l.curve);
    round2Calls.push(
      { contract: token, method: "name" }, { contract: token, method: "symbol" },
      { contract: curve, method: "ethRaised" }, { contract: curve, method: "graduationThreshold" },
      { contract: curve, method: "graduated" }, { contract: curve, method: "virtualEthReserve" },
      { contract: curve, method: "virtualTokenReserve" },
    );
  }
  for (const { launch: l } of instantLaunches) {
    const token = tokenRead(l.token);
    round2Calls.push({ contract: token, method: "name" }, { contract: token, method: "symbol" });
  }
  for (const { launch: l } of hybridLaunches) {
    const token = tokenRead(l.token);
    round2Calls.push({ contract: token, method: "name" }, { contract: token, method: "symbol" });
  }
  for (const { launch: l } of pairedLaunches) {
    const token = tokenRead(l.token);
    const quote = tokenRead(l.quoteToken);
    round2Calls.push(
      { contract: token, method: "name" }, { contract: token, method: "symbol" },
      { contract: quote, method: "symbol" }, { contract: quote, method: "decimals" },
    );
  }
  const round2 = await multicallRead(round2Calls);

  const entries = [];
  let cursor = 0;
  for (const l of curveLaunches) {
    const [name, symbol, ethRaised, threshold, graduated, virtualEth, virtualToken] = round2.slice(cursor, cursor + 7);
    cursor += 7;
    if (name == null) continue; // this launch's reads failed — skip it rather than showing broken data
    const price = Number(virtualEth) / Number(virtualToken);
    entries.push({
      type: "curve",
      token: l.token,
      curve: l.curve,
      name, symbol,
      imageUrl: l.imageUrl,
      twitter: l.twitter,
      telegram: l.telegram,
      discord: l.discord,
      website: l.website,
      creator: l.creator,
      launchedAt: Number(l.launchedAt),
      ethRaised, threshold, graduated,
      marketCapEth: price * 1_000_000_000,
    });
  }
  for (const { launch: l, source } of instantLaunches) {
    const [name, symbol] = round2.slice(cursor, cursor + 2);
    cursor += 2;
    if (name == null) continue;
    entries.push({
      type: "instant",
      token: l.token,
      name, symbol,
      imageUrl: l.imageUrl,
      twitter: l.twitter,
      telegram: l.telegram,
      discord: l.discord,
      website: l.website,
      creator: l.creator,
      launchedAt: Number(l.launchedAt),
      marketCapEth: null, // filled in below once trade history is checked
      _router: source.router,
    });
  }
  for (const { launch: l, source } of hybridLaunches) {
    const [name, symbol] = round2.slice(cursor, cursor + 2);
    cursor += 2;
    if (name == null) continue;
    entries.push({
      type: "hybrid",
      token: l.token,
      name, symbol,
      imageUrl: l.imageUrl,
      twitter: l.twitter,
      telegram: l.telegram,
      discord: l.discord,
      website: l.website,
      creator: l.creator,
      launchedAt: Number(l.launchedAt),
      marketCapEth: null, // filled in below once trade history is checked
      _router: source.router,
      _factory: source.factory,
    });
  }

  for (const { launch: l, source } of pairedLaunches) {
    const [name, symbol, quoteSymbolRaw, quoteDecimalsRaw] = round2.slice(cursor, cursor + 4);
    cursor += 4;
    if (name == null) continue;
    const cfg = quoteTokenInfo(l.quoteToken);
    const quoteDecimals = quoteDecimalsRaw != null ? Number(quoteDecimalsRaw) : (cfg ? cfg.decimals : 18);
    entries.push({
      type: "paired",
      token: l.token,
      name, symbol,
      imageUrl: l.imageUrl,
      twitter: l.twitter,
      telegram: l.telegram,
      discord: l.discord,
      website: l.website,
      creator: l.creator,
      launchedAt: Number(l.launchedAt),
      quoteToken: l.quoteToken,
      quoteSymbol: quoteSymbolRaw || (cfg ? cfg.symbol : short(l.quoteToken)),
      quoteDecimals,
      // "initialVirtualQuote of the quote buys the full supply" = the market cap at launch, in quote units
      marketCapQuote: Number(ethers.formatUnits(l.initialVirtualQuote, quoteDecimals)),
      marketCapEth: null, // not ETH-denominated — see marketCapQuote
      _router: source.router,
      _factory: source.factory,
    });
  }

  // 24h price change needs each token's trade history — these are event
  // log queries (not eth_call), so Multicall3 can't batch them, but
  // running them concurrently across every token keeps this from adding
  // up linearly. Skipped for tokens with truly nothing to compare yet.
  // initialVirtualEth/DEFAULT_SUPPLY are factory-wide constants, not
  // per-launch — fetch them once, not once per curve entry.
  const [factoryInitialVirtualEth, factoryTotalSupply] = (curveLaunches.length && !skipHistory)
    ? await multicallRead([
        { contract: factory, method: "initialVirtualEth" },
        { contract: factory, method: "DEFAULT_SUPPLY" },
      ])
    : [null, null];
  // Same idea per hybrid source — every hybrid launch on that factory
  // starts at that factory's own implied market cap before any trade
  // happens (see the token detail page for the exact reasoning).
  const hybridInitialVirtualEthBySource = new Map();
  for (const s of hybridSources) {
    try {
      hybridInitialVirtualEthBySource.set(s.factory, (await multicallRead([{ contract: s.factory, method: "initialVirtualEth" }]))[0]);
    } catch { /* leave unset — falls back to null below */ }
  }

  await Promise.all(entries.map(async (entry) => {
    if (skipHistory) {
      // Fast path (used by the homepage carousel — doesn't need 24h
      // change, just something reasonable to sort and display by):
      // curve's marketCapEth is already correct from round 2 above, and
      // hybrid can use its cheap initialVirtualEth fallback without ever
      // touching the expensive per-token event-log queries below.
      // Instant has no equivalent cheap fallback, so it just shows "—"
      // in this mode — acceptable for a decorative carousel.
      if (entry.type === "hybrid") {
        const initEth = hybridInitialVirtualEthBySource.get(entry._factory);
        if (initEth != null) entry.marketCapEth = Number(ethers.formatEther(initEth));
      }
      return; // paired: marketCapQuote is already set from initialVirtualQuote
    }
    try {
      if (entry.type === "paired") {
        const launchPrice = entry.marketCapQuote / 1_000_000_000; // set from initialVirtualQuote above
        const history = await buildPairedTradeHistory(entry.token, entry._router, entry.quoteDecimals, entry._factory);
        if (history.prices.length) entry.marketCapQuote = history.prices.at(-1) * 1_000_000_000;
        applyPriceChange(entry, history.trades, launchPrice);
        return;
      }
      if (entry.type === "curve") {
        const history = await buildTradeHistory(entry.curve, factoryInitialVirtualEth, factoryTotalSupply);
        applyPriceChange(entry, history.trades, history.startPrice);
      } else {
        const history = await buildInstantTradeHistory(entry.token, entry._router);
        if (history.prices.length) {
          entry.marketCapEth = history.prices.at(-1) * 1_000_000_000;
        } else if (entry.type === "hybrid") {
          const initEth = hybridInitialVirtualEthBySource.get(entry._factory);
          if (initEth != null) entry.marketCapEth = Number(ethers.formatEther(initEth));
        }
        applyPriceChange(entry, history.trades, null);
      }
    } catch (err) {
      console.warn("Couldn't compute 24h change for", entry.symbol, err);
    }
  }));

  // $HOME itself — HOMEPAD's own token. Not launched through any factory
  // here (it predates the platform), so it's not a real "entry" from any
  // on-chain source above, but the whole platform exists to fund it, so
  // it gets a card the same way every launch does — sourced entirely from
  // its own Dexscreener pair, same as the homepage hero.
  if (!opts || !opts.skipHomeCard) {
    entries.push({
      type: "home", token: CONFIG.HOME_TOKEN_ADDRESS, name: "Home", symbol: "HOME",
      imageUrl: "images/home-token-logo.jpg",
      launchedAt: 0, // predates HOMEPAD — never flagged "NEW", always sorts as the oldest
      creator: null, twitter: "https://x.com/HOMEonRobinhood", telegram: "https://t.me/HOMEonRobin", discord: null, website: null,
    });
  }

  // One shared ETH/USD fetch for the whole batch — cards show $ mcap the
  // same way the token detail page does, not a raw ETH figure.
  const ethUsd = await getEthUsdPrice();
  // Dexscreener overlay: one batched call covering every launch's own
  // token, every distinct quote token Paired launches use (so a
  // brand-new pair can still show a real $ mcap via the quote's own
  // already-indexed price — see applyQuoteUsdFallback below), and $HOME.
  const quoteAddrs = [...new Set(entries.filter((e) => e.type === "paired" && e.quoteToken).map((e) => e.quoteToken.toLowerCase()))];
  const dexStats = await fetchDexscreenerStats([...entries.map((e) => e.token), ...quoteAddrs]);
  for (const entry of entries) {
    entry.marketCapUsd = entry.marketCapEth != null && ethUsd != null ? entry.marketCapEth * ethUsd : null;
    applyDexStats(entry, dexStats.get(entry.token.toLowerCase()));
    if (entry.type === "paired") applyQuoteUsdFallback(entry, dexStats.get((entry.quoteToken || "").toLowerCase()));
    // Keep WHICH router/factory each launch came from as plain address
    // strings (Proof of Rent matches hook events back to tokens by source),
    // but drop the live Contract objects — renderers never need those.
    entry.routerAddress = entry._router ? entry._router.target : null;
    entry.factoryAddress = entry._factory ? entry._factory.target : null;
    delete entry._router;
    delete entry._factory;
  }

  return entries;
}

/// Compares the current price to the price from the most recent trade
/// that's at least 24h old (using each trade's priceAfter) — a real
/// "price ~24h ago" reference, not just an all-time comparison. Falls
/// back to the pre-trade starting price (bonding curve tokens only) when
/// every trade so far is within the last 24h; returns null when there's
/// no valid reference point to compare against at all.
function applyPriceChange(entry, trades, startPrice) {
  if (trades.length === 0) { entry.change24h = null; return; }
  const nowSec = Math.floor(Date.now() / 1000);
  const latestPrice = trades[0].priceAfter; // trades is most-recent-first
  let referencePrice = startPrice;
  for (const t of trades) {
    if (nowSec - t.ts >= 86400) { referencePrice = t.priceAfter; break; }
  }
  entry.change24h = referencePrice != null && referencePrice > 0
    ? ((latestPrice - referencePrice) / referencePrice) * 100
    : null;
}

/// Computes a PoolId the same way Uniswap's PoolIdLibrary does — needed
/// to filter a hook's FeeRouted events down to just one specific pool,
/// since the event only carries the poolId, not the token address.
function computePoolId(currency0, currency1, fee, tickSpacing, hooks) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [currency0, currency1, fee, tickSpacing, hooks]
    )
  );
}

// ---- Valuing hook fees (FeeRouted) in ETH ----
// FeeRouted(poolId, toCreator, toHome, toPlatform) doesn't say WHICH
// currency the fee was in. Both hooks take their cut from the swap's
// OUTPUT side (`feeCurrency = zeroForOne ? currency1 : currency0`), so on
// a BUY (ETH -> token) the rent is in the launched token, and on a SELL
// it's in ETH. Reading every amount as ETH is how Proof of Rent once showed
// "1,350,035 ETH" — that was ~1.35M tokens from a handful of dev buys.
//
// So each FeeRouted is joined to the PoolManager's own Swap event in the
// same transaction and pool. The PoolManager emits that for EVERY swap
// whatever initiated it (our router, the factory's launchAndBuy dev buy, a
// third-party trade straight through Uniswap), and its amount0 sign gives
// the direction. A token-denominated fee is valued at that same swap's
// execution price (|amount0| / |amount1|) — still a figure from that exact
// transaction, not an oracle or an estimate.

// Where a launch's 8% $HOME allocation goes when it's burned. LaunchToken
// has no burn(), so "burn" means a transfer here — checking balanceOf(dead)
// against the allocation is how the site tells burned from still-held.
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const LAUNCH_ALLOCATION = (1_000_000_000n * 10n ** 18n) * 800n / 10000n; // HOME_ALLOCATION_BPS = 800

const POOL_MANAGER_SWAP_ABI = [
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
];
const absBig = (x) => (x < 0n ? -x : x);
const logOrder = (x, y) => (x.blockNumber - y.blockNumber) || (x.index - y.index);

/// Every PoolManager Swap in the given HOMEPAD pools (one query — the
/// indexed `id` topic accepts a list). Asks the hook for its PoolManager
/// rather than trusting a config value that could drift from what's deployed.
async function poolManagerSwapsFor(hook, poolIds) {
  if (!poolIds.length) return [];
  const [pmAddr, fromBlock] = await Promise.all([hook.poolManager(), firstHomepadBlock()]);
  const pm = new ethers.Contract(pmAddr, POOL_MANAGER_SWAP_ABI, readProvider());
  return withRetry(() => pm.queryFilter(pm.filters.Swap(poolIds), fromBlock, "latest"));
}

const HOOK_POOLMANAGER_ABI = ["function poolManager() view returns (address)"];

/// Same idea as poolManagerSwapsFor, but takes a bare hook address instead
/// of a live Contract — the trade-history builders below only know the
/// address (from a router's hook() getter, or a factory's poolKeyOf()),
/// not a Contract wired up with the right ABI for anything else.
async function poolManagerSwapsForToken(hookAddr, poolId) {
  if (!hookAddr) return [];
  const hook = new ethers.Contract(hookAddr, HOOK_POOLMANAGER_ABI, readProvider());
  return poolManagerSwapsFor(hook, [poolId]);
}

/// PoolManager's own Swap event is emitted for every swap in a pool
/// whatever initiated it, but its only address is `sender` — the
/// immediate caller of swap() (our router, or the factory itself for a
/// launchAndBuy dev buy), never the actual end-user wallet for a
/// router-mediated trade. This recovers the real trader for trades that
/// DID go through a HOMEPAD router, by matching each PoolManager swap to
/// the router's own Swap event in the same tx (zipped in log order, same
/// pattern as Proof of Rent's FeeRouted matching). Falls back to
/// PoolManager's `sender` — always a real, valid address — for anything
/// that didn't (dev buys, third-party trades straight through Uniswap).
function matchRouterTrader(pmSwaps, routerSwaps) {
  const byTx = new Map();
  for (const e of [...routerSwaps].sort(logOrder)) {
    if (!byTx.has(e.transactionHash)) byTx.set(e.transactionHash, []);
    byTx.get(e.transactionHash).push(e);
  }
  const seen = new Map();
  const out = new Map();
  for (const s of [...pmSwaps].sort(logOrder)) {
    const idx = seen.get(s.transactionHash) || 0;
    seen.set(s.transactionHash, idx + 1);
    const match = (byTx.get(s.transactionHash) || [])[idx];
    out.set(s, match ? match.args.trader : s.args.sender);
  }
  return out;
}

/// Pairs each FeeRouted with its swap (same tx, same pool, zipped in log
/// order — the hook emits FeeRouted from afterSwap, right after the swap)
/// and works out the fee's currency and ETH value. Returns one record per
/// FeeRouted, in log order.
function valueFeeRoutedEvents(feeEvents, pmSwaps) {
  const swapsByKey = new Map();
  for (const s of [...pmSwaps].sort(logOrder)) {
    const key = `${s.transactionHash}|${s.args.id}`;
    if (!swapsByKey.has(key)) swapsByKey.set(key, []);
    swapsByKey.get(key).push(s);
  }
  const seen = new Map();
  return [...feeEvents].sort(logOrder).map((e) => {
    const { poolId, toCreator, toHome, toPlatform } = e.args;
    const total = toCreator + toHome + toPlatform;
    const key = `${e.transactionHash}|${poolId}`;
    const idx = seen.get(key) || 0;
    seen.set(key, idx + 1);
    const swap = (swapsByKey.get(key) || [])[idx] || null;
    // BUY: amount0 < 0 (swapper paid ETH, received tokens) -> fee is in the
    // token. SELL or no matching swap (shouldn't happen) -> already ETH.
    const isTokenFee = !!swap && swap.args.amount0 < 0n;
    const ethIn = isTokenFee ? absBig(swap.args.amount0) : 0n;
    const tokensOut = isTokenFee ? absBig(swap.args.amount1) : 0n;
    const toEth = (x) => (!isTokenFee ? x : (tokensOut > 0n ? (x * ethIn) / tokensOut : 0n));
    return { event: e, poolId, total, toCreator, isTokenFee, ethValue: toEth(total), ethToCreator: toEth(toCreator) };
  });
}

/// Sums exactly what a creator was actually paid, reusing the real
/// on-chain events rather than re-deriving amounts from scratch wherever
/// a contract already tracks the exact split.
async function computeCreatorFeesEth(entry) {
  if (entry.type === "curve") {
    // BondingCurveV4 only emits the TOTAL fee per trade (feePaid), not
    // the creator's specific cut — replicate its own split math using
    // its own immutable fee parameters, so this always matches exactly
    // what the contract actually paid out, curve by curve.
    const curve = curveRead(entry.curve);
    const [baseFeeBps, extraFeeBps, creatorShareBps, buyEvents, sellEvents] = await Promise.all([
      curve.baseFeeBps(), curve.extraFeeBps(), curve.creatorShareBps(),
      curve.queryFilter(curve.filters.Buy(), await firstHomepadBlock(), "latest"),
      curve.queryFilter(curve.filters.Sell(), await firstHomepadBlock(), "latest"),
    ]);
    const total = Number(baseFeeBps) + Number(extraFeeBps);
    let sum = 0n;
    for (const e of [...buyEvents, ...sellEvents]) {
      const fee = e.args.feePaid;
      const baseFeePortion = total > 0 ? (fee * BigInt(baseFeeBps)) / BigInt(total) : 0n;
      const extraFeePortion = fee - baseFeePortion;
      const creatorFromBase = (baseFeePortion * creatorShareBps) / 10000n;
      sum += creatorFromBase + extraFeePortion;
    }
    return sum;
  }

  // Instant/hybrid: the hook already tracks the creator's exact cut via
  // FeeRouted(poolId, toCreator, toHome, toPlatform) — sum toCreator
  // directly instead of re-deriving anything.
  const hookAddress = entry.type === "hybrid" ? CONFIG.HYBRID_HOOK_ADDRESS
    : entry.type === "paired" ? CONFIG.PAIRED_HOOK_ADDRESS
    : CONFIG.HOOK_ADDRESS;
  if (!hookAddress) return 0n;
  const hookAbi = entry.type === "instant" ? HOMEPAD_HOOK_ABI : HYBRID_HOOK_ABI; // paired reuses the hybrid hook
  const hook = new ethers.Contract(hookAddress, hookAbi, readProvider());
  // v4 sorts currencies by address: ETH (0x0) is always currency0, but an
  // ERC-20 quote can land on either side of the token.
  let c0 = ethers.ZeroAddress, c1 = entry.token;
  if (entry.type === "paired") {
    const q = entry.quoteToken;
    [c0, c1] = BigInt(q) < BigInt(entry.token) ? [q, entry.token] : [entry.token, q];
  }
  const poolId = computePoolId(c0, c1, 0, 60, hookAddress);
  const fromBlock = await firstHomepadBlock();
  const [events, swaps] = await Promise.all([
    hook.queryFilter(hook.filters.FeeRouted(poolId), fromBlock, "latest"),
    poolManagerSwapsFor(hook, [poolId]),
  ]);
  // Buy-side rent is paid to the creator in the token, not ETH — value it at
  // each trade's own price so this stays an ETH figure (see the helpers above).
  return valueFeeRoutedEvents(events, swaps).reduce((sum, r) => sum + r.ethToCreator, 0n);
}

async function renderProfile() {
  const main = document.getElementById("app");
  // Each run gets a sequence number; any await that resumes after a newer
  // run has started must bail instead of writing stale data into the
  // newer run's DOM (tab showing "Created" with the Holdings message was
  // exactly this).
  const seq = (renderProfile._seq = (renderProfile._seq || 0) + 1);
  const stale = () => seq !== renderProfile._seq;
  if (!state.account) {
    main.innerHTML = `<div class="empty-state">Connect a wallet to view your profile.</div>`;
    return;
  }
  const address = state.account;
  main.innerHTML = `
    <div class="page-head">
      <div><h1>profile.</h1><p>Your HOMEPAD launches, holdings, and creator fees.</p></div>
    </div>
    <div class="profile-header">
      <div class="profile-avatar">${address.slice(2, 4).toUpperCase()}</div>
      <div class="profile-address-row">
        <code>${short(address)}</code>
        <span class="btn-mini" id="profile-copy-btn" style="cursor:pointer">Copy</span>
        <a class="btn-mini" href="${CONFIG.BLOCK_EXPLORER}/address/${address}" target="_blank">Explorer ↗</a>
      </div>
    </div>
    <div id="profile-stats" class="stat-grid profile-stat-grid" style="margin-top:20px">
      <div class="stat-card"><div class="stat-label">Launches</div><div class="stat-value" id="profile-stat-launches">…</div></div>
      <div class="stat-card"><div class="stat-label">Portfolio Value</div><div class="stat-value" id="profile-stat-value">…</div></div>
      <div class="stat-card"><div class="stat-label">Creator Fees</div><div class="stat-value" id="profile-stat-fees">…</div><div class="stat-sub">buys pay you in your token, sells in ETH — valued in ETH at each trade's price</div></div>
      <div class="stat-card"><div class="stat-label">Tokens Held</div><div class="stat-value" id="profile-stat-held">…</div></div>
    </div>

    <div class="profile-tabs" id="profile-tabs" style="margin-top:24px">
      <span class="filter-chip active" data-tab="holdings">Holdings</span>
      <span class="filter-chip" data-tab="created">Created Tokens</span>
      <span class="filter-chip" data-tab="fees">Fees</span>
    </div>
    <div id="profile-tab-content" class="grid-launches" style="margin-top:16px">${skeletonCardsHtml(4)}</div>
  `;

  document.getElementById("profile-copy-btn").onclick = () => {
    navigator.clipboard.writeText(address);
  };

  let allEntries = [];
  let created = [];
  let holdings = [];
  let feesByToken = {};
  let activeTab = "holdings";

  function renderTabContent() {
    if (stale()) return;
    const el = document.getElementById("profile-tab-content");
    if (!el) return;
    if (activeTab === "holdings") {
      el.innerHTML = holdings.length
        ? holdings.map(launchCardHtml).join("")
        : `<div class="empty-state">No HOMEPAD tokens held by this wallet yet.</div>`;
    } else if (activeTab === "created") {
      el.innerHTML = created.length
        ? created.map(launchCardHtml).join("")
        : `<div class="empty-state">This wallet hasn't launched anything on HOMEPAD yet. <a href="launch.html" style="color:var(--green)">Launch one →</a></div>`;
    } else {
      el.innerHTML = created.length
        ? `<div class="chart-card">
            <div class="chart-card-head"><h3>Creator Fees Earned</h3></div>
            ${created.map((e) => `
              <div class="trade-row" style="grid-template-columns:1fr 1fr">
                <a href="explore.html#/token/${e.token}" style="color:inherit;font-family:'Silkscreen';font-size:.8rem">$${e.symbol}</a>
                <span style="text-align:right">${fmtEth(Number(ethers.formatEther(feesByToken[e.token] || 0n)))} ETH</span>
              </div>
            `).join("")}
          </div>`
        : `<div class="empty-state">No creator fees yet — launch something to start earning.</div>`;
    }
  }

  document.getElementById("profile-tabs").addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    document.querySelectorAll("#profile-tabs .filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeTab = chip.dataset.tab;
    renderTabContent();
  });

  try {
    allEntries = await fetchAllLaunches({ skipHomeCard: true }); // profile page — $HOME has no creator to match against
    if (stale()) return;
    const norm = (a) => { try { return ethers.getAddress(String(a).trim()).toLowerCase(); } catch { return String(a || "").toLowerCase(); } };
    const me = norm(address);
    created = allEntries.filter((e) => e.creator && norm(e.creator) === me);
    setEl("profile-stat-launches", created.length.toLocaleString());

    // Holdings: one more multicall pass, checking this wallet's balance
    // against every token HOMEPAD has ever launched.
    const balances = await multicallRead(allEntries.map((e) => ({ contract: tokenRead(e.token), method: "balanceOf", args: [address] })));
    const ethUsd = await getEthUsdPrice();
    if (stale()) return;
    let portfolioValueUsd = 0;
    allEntries.forEach((e, i) => {
      const bal = balances[i];
      if (bal != null && bal > 0n) {
        holdings.push({ ...e, balance: bal });
        if (e.marketCapEth != null) {
          const priceEth = e.marketCapEth / 1_000_000_000;
          const valueEth = priceEth * Number(ethers.formatEther(bal));
          if (ethUsd != null) portfolioValueUsd += valueEth * ethUsd;
        }
      }
    });
    setEl("profile-stat-held", holdings.length.toLocaleString());
    setEl("profile-stat-value", fmtUsd(portfolioValueUsd));
    renderTabContent();

    // Creator fees run separately (needs event queries per created token)
    // so the rest of the profile doesn't wait on it.
    if (created.length > 0) {
      let totalFeesEth = 0n;
      await Promise.all(created.map(async (e) => {
        try {
          const fees = await computeCreatorFeesEth(e);
          feesByToken[e.token] = fees;
          totalFeesEth += fees;
        } catch (err) {
          console.warn("Couldn't compute creator fees for", e.symbol, err);
        }
      }));
      if (stale()) return;
      const feesEthNum = Number(ethers.formatEther(totalFeesEth));
      setEl("profile-stat-fees", ethUsd != null ? fmtUsd(feesEthNum * ethUsd) : fmtEth(feesEthNum) + " ETH");
      if (activeTab === "fees") renderTabContent();
    } else {
      setEl("profile-stat-fees", fmtUsd(0));
    }
  } catch (err) {
    console.error(err);
    if (stale()) return;
    document.getElementById("profile-tab-content").innerHTML = `<div class="empty-state">Couldn't load profile data.<div style="margin-top:10px;font-size:.68rem;color:var(--ink-dim);word-break:break-all">${String(err && err.message || err).slice(0, 300)}</div></div>`;
  }
}

function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/// Grey placeholder cards shown while real launch data is still loading —
/// same footprint as a real card so the grid doesn't jump when data
/// lands, and a slow shimmer so it reads as "loading", not "empty".
function skeletonCardsHtml(n) {
  return Array.from({ length: n }, () => `
    <div class="launch-card skeleton-card" aria-hidden="true">
      <div class="sk sk-thumb"></div>
      <div class="sk sk-line w60"></div>
      <div class="sk sk-line w40"></div>
      <div class="sk sk-line w80"></div>
      <div class="sk sk-line w50"></div>
    </div>`).join("");
}

function launchCardHtml(entry) {
  const thumb = entry.imageUrl
    ? `<img class="launch-thumb" src="${entry.imageUrl}" onerror="this.style.display='none'">`
    : `<div class="launch-thumb placeholder">🏡</div>`;

  const isNew = Date.now() / 1000 - entry.launchedAt < 86400;
  const badges = `
    ${isNew ? '<span class="card-badge new">NEW</span>' : ""}
    ${entry.change24h != null ? `<span class="card-badge ${entry.change24h >= 0 ? "up" : "down"}">${entry.change24h >= 0 ? "▲" : "▼"} ${Math.abs(entry.change24h).toFixed(1)}%</span>` : ""}
  `;
  // Using <span onclick> instead of nested <a> tags here on purpose — the
  // whole card is already an <a>, and an <a> inside an <a> is invalid
  // HTML that makes the browser silently close the outer one early,
  // which is exactly what broke the card layout before this fix.
  const ICON_X = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
  const ICON_TELEGRAM = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.05 2.5 2.6 10.13c-1.33.53-1.32 1.27-.24 1.6l4.98 1.55 11.5-7.25c.54-.33 1.04-.15.63.22L10.7 14.3l-.36 5.16c.52 0 .75-.24 1.03-.52l2.48-2.4 5.15 3.8c.95.52 1.63.25 1.87-.88l3.38-15.9c.36-1.39-.53-2.02-1.9-1.06z"/></svg>';
  const ICON_DISCORD = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 5.37a17.9 17.9 0 0 0-4.43-1.37 13.4 13.4 0 0 0-.6 1.23 16.6 16.6 0 0 0-4.98 0 13.4 13.4 0 0 0-.6-1.23 17.9 17.9 0 0 0-4.44 1.37C1.9 9.14 1.13 12.8 1.5 16.4a18 18 0 0 0 5.48 2.77c.44-.6.84-1.24 1.18-1.92-.65-.24-1.27-.55-1.86-.9.16-.11.31-.23.46-.35a12.9 12.9 0 0 0 10.48 0c.15.12.3.24.46.35-.59.35-1.21.66-1.86.9.34.68.74 1.32 1.18 1.92a18 18 0 0 0 5.48-2.77c.44-4.16-.66-7.79-2.5-11.03zM8.68 14.1c-.83 0-1.5-.77-1.5-1.72 0-.94.66-1.71 1.5-1.71.85 0 1.53.78 1.5 1.71 0 .95-.66 1.72-1.5 1.72zm6.64 0c-.83 0-1.5-.77-1.5-1.72 0-.94.66-1.71 1.5-1.71.85 0 1.53.78 1.5 1.71 0 .95-.65 1.72-1.5 1.72z"/></svg>';

  const socials = (entry.twitter || entry.telegram || entry.discord)
    ? `<div class="card-socials">
        ${entry.twitter ? `<span onclick="event.stopPropagation();event.preventDefault();window.open('${entry.twitter}','_blank')" title="X">${ICON_X}</span>` : ""}
        ${entry.telegram ? `<span onclick="event.stopPropagation();event.preventDefault();window.open('${entry.telegram}','_blank')" title="Telegram">${ICON_TELEGRAM}</span>` : ""}
        ${entry.discord ? `<span onclick="event.stopPropagation();event.preventDefault();window.open('${entry.discord}','_blank')" title="Discord">${ICON_DISCORD}</span>` : ""}
      </div>`
    : "";

  // Paired launches are priced in their quote token, not ETH/USD — no
  // reliable keyless, CORS-friendly stock-price API exists to convert
  // this to a real USD figure from a static site (Yahoo/most providers
  // block direct browser calls; a real feed would need a small backend).
  // fmtCompact keeps it to a handful of characters so it never wraps the
  // way fmtEth's fixed-3-decimal style did ("48.000" + " TSLA").
  const mcapText = entry.type === "paired"
    ? (entry.marketCapUsd != null ? fmtUsd(entry.marketCapUsd) : (entry.marketCapQuote != null ? `${fmtCompact(entry.marketCapQuote)} ${entry.quoteSymbol}` : "—"))
    : (entry.marketCapUsd != null ? fmtUsd(entry.marketCapUsd) : "—");
  const mcapLine = `<div class="card-mcap"><span class="card-mcap-label">Market Cap</span><span class="card-mcap-value">${mcapText}</span></div>`;
  // Volume / liquidity only exist once Dexscreener has the pair; before
  // that the row stays as an invisible placeholder so card heights match.
  const dexRow = entry.dex && (entry.volume24hUsd != null || entry.liquidityUsd != null)
    ? `<div class="meta card-dex"><span>Vol 24h <b>${entry.volume24hUsd != null ? fmtUsd(entry.volume24hUsd) : "—"}</b></span><span>Liq <b>${entry.liquidityUsd != null ? fmtUsd(entry.liquidityUsd) : "—"}</b></span></div>`
    : `<div class="meta" style="visibility:hidden"><span>—</span><span>—</span></div>`;
  const typeTag = entry.type === "instant" ? '<span class="instant-tag">instant liquidity</span>'
    : entry.type === "hybrid" ? '<span class="hybrid-tag">hybrid</span>'
    : entry.type === "paired" ? `<span class="paired-tag-group"><span class="paired-tag">paired</span><span class="paired-symbol">${entry.quoteSymbol}</span></span>`
    : '<span class="curve-tag">bonding curve</span>';

  if (entry.type === "home") {
    // $HOME isn't a HOMEPAD launch and has no token page here (no factory,
    // no fee split, nothing this site's trade UI applies to) — the card
    // links straight to its own Dexscreener pair instead of
    // explore.html#/token/, and opens in a new tab like every other
    // external link on the site.
    return `
      <a class="launch-card card-type-home" href="https://dexscreener.com/${CONFIG.DEXSCREENER_CHAIN_SLUG}/${CONFIG.DEXSCREENER_PAIR_ADDRESS}" target="_blank" rel="noopener">
        <div class="card-badges">${badges}<span class="card-badge home-pin">🏡 $HOME</span></div>
        ${thumb}
        <div class="sym">$${entry.symbol}</div>
        <div class="name">HOMEPAD's own coin</div>
        ${mcapLine}
        <div class="bar" style="visibility:hidden"><div class="bar-fill" style="width:0%"></div></div>
        ${dexRow}
        <div class="meta"><span class="home-tag">native</span><span class="card-age">Dexscreener ↗</span></div>
        ${socials}
      </a>
    `;
  }

  if (entry.type === "instant" || entry.type === "hybrid" || entry.type === "paired") {
    return `
      <a class="launch-card card-type-${entry.type}" href="explore.html#/token/${entry.token}">
        <div class="card-badges">${badges}</div>
        ${thumb}
        <div class="sym">$${entry.symbol}</div>
        <div class="name">${entry.name}</div>
        ${mcapLine}
        <div class="bar" style="visibility:hidden"><div class="bar-fill" style="width:0%"></div></div>
        ${dexRow}
        <div class="meta">${typeTag}<span class="card-age">${timeAgo(entry.launchedAt)}</span></div>
        ${socials}
      </a>
    `;
  }

  const pct = entry.threshold > 0n ? Math.min(100, Number((entry.ethRaised * 100n) / entry.threshold)) : 0;
  return `
    <a class="launch-card card-type-curve" href="explore.html#/token/${entry.token}">
      <div class="card-badges">${badges}</div>
      ${thumb}
      <div class="sym">$${entry.symbol}</div>
      <div class="name">${entry.name}</div>
      ${mcapLine}
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="meta"><span>${ethers.formatEther(entry.ethRaised)} / ${ethers.formatEther(entry.threshold)} ETH</span><span>${pct}%</span></div>
      <div class="meta">${typeTag}<span class="card-age">${timeAgo(entry.launchedAt)}</span></div>
      ${entry.graduated ? '<span class="grad-tag" style="margin:0">graduated</span>' : ""}
      ${socials}
    </a>
  `;
}

/// The homepage's default bottom section — same simple grid this has
/// always shown, capped to the most recent launches, with a link through
/// to the full page for search/sort/filter.
async function renderExplorePreview() {
  const main = document.getElementById("app");
  const PREVIEW_LIMIT = 9;
  main.innerHTML = `
    <div class="page-head">
      <div><h1>explore.</h1><p>Every fixed-supply token launched through HOMEPAD. Trade rent funds creators and $HOME.</p></div>
      <a class="btn-launch-cta" href="launch.html" onclick="if (typeof openLaunchModal === 'function') { openLaunchModal(); return false; } return true;">
        <span class="btn-launch-icon">🏡</span><span class="btn-launch-label">Launch a token</span>
      </a>
    </div>
    <div id="launch-list" class="grid-launches">${skeletonCardsHtml(8)}</div>
  `;

  try {
    const entries = await fetchAllLaunches();
    const listEl = document.getElementById("launch-list");
    if (entries.length === 0) {
      listEl.innerHTML = `<div class="empty-state">No launches yet. <a href="launch.html" onclick="if (typeof openLaunchModal === 'function') { openLaunchModal(); return false; } return true;" style="color:var(--green)">Be the first.</a></div>`;
      return;
    }
    entries.sort((a, b) => b.launchedAt - a.launchedAt);
    const shown = entries.slice(0, PREVIEW_LIMIT);
    listEl.innerHTML = shown.map(launchCardHtml).join("");
    if (entries.length > PREVIEW_LIMIT) {
      // $HOME's card belongs in the grid (that's the whole point of adding
      // it) but wasn't itself "launched through HOMEPAD", so it's left out
      // of this specific count for accuracy.
      const launchCount = entries.filter((e) => e.type !== "home").length;
      listEl.insertAdjacentHTML("afterend", `<div style="text-align:center;margin-top:16px"><a href="explore.html" class="btn-mini">View all ${launchCount} launches →</a></div>`);
    }
  } catch (err) {
    console.error(err);
    document.getElementById("launch-list").innerHTML = `<div class="empty-state">Couldn't load launches — there may be a network or RPC issue. Try refreshing.</div>`;
  }
}

/// The dedicated Explore page (nav link, #/explore) — search, sort, and
/// type filter, Dexscreener-style. All client-side over the same fetched
/// list; nothing here needs its own contract calls.
async function renderExploreFull() {
  const main = document.getElementById("app");
  main.innerHTML = `
    <div class="page-head">
      <div><h1>explore.</h1><p>Every fixed-supply token launched through HOMEPAD. Trade rent funds creators and $HOME.</p></div>
      <a class="btn-launch-cta" href="launch.html" onclick="if (typeof openLaunchModal === 'function') { openLaunchModal(); return false; } return true;">
        <span class="btn-launch-icon">🏡</span><span class="btn-launch-label">Launch a token</span>
      </a>
    </div>

    <div class="explore-toolbar">
      <input id="explore-search" type="text" placeholder="Search by name, $symbol, or 0x address…" class="explore-search-input">
      <select id="explore-sort" class="quote-select">
        <option value="date-desc">Newest first</option>
        <option value="date-asc">Oldest first</option>
        <option value="mcap-desc">Market cap: high to low</option>
        <option value="mcap-asc">Market cap: low to high</option>
        <option value="name-asc">Name: A → Z</option>
        <option value="change-desc">24H Change: high to low</option>
      </select>
      <div class="explore-filter-chips" id="explore-filter-chips">
        <span class="filter-chip active" data-filter="all">All</span>
        <span class="filter-chip" data-filter="hybrid">Hybrid</span>
        <span class="filter-chip" data-filter="curve">Bonding Curve</span>
        <span class="filter-chip" data-filter="instant">Instant</span>
        <span class="filter-chip" data-filter="paired">Paired</span>
        <span class="filter-chip" data-filter="graduated">Graduated</span>
      </div>
    </div>

    <div id="launch-list" class="grid-launches">${skeletonCardsHtml(8)}</div>
  `;

  let allEntries = [];
  let activeFilter = "all";

  function applyAndRender() {
    const listEl = document.getElementById("launch-list");
    const term = document.getElementById("explore-search").value.trim().toLowerCase();
    const sortMode = document.getElementById("explore-sort").value;

    let filtered = allEntries.filter((e) => {
      if (activeFilter === "curve" && e.type !== "curve") return false;
      if (activeFilter === "instant" && e.type !== "instant") return false;
      if (activeFilter === "hybrid" && e.type !== "hybrid") return false;
      if (activeFilter === "paired" && e.type !== "paired") return false;
      if (activeFilter === "graduated" && !(e.type === "curve" && e.graduated)) return false;
      if (term && !(e.name.toLowerCase().includes(term) || e.symbol.toLowerCase().includes(term) || e.token.toLowerCase().includes(term))) return false;
      return true;
    });

    filtered.sort((a, b) => {
      switch (sortMode) {
        case "date-asc": return a.launchedAt - b.launchedAt;
        case "mcap-desc": return (b.marketCapEth ?? -1) - (a.marketCapEth ?? -1);
        case "mcap-asc": return (a.marketCapEth ?? Infinity) - (b.marketCapEth ?? Infinity);
        case "name-asc": return a.name.localeCompare(b.name);
        case "change-desc": return (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity);
        case "date-desc":
        default: return b.launchedAt - a.launchedAt;
      }
    });

    listEl.innerHTML = filtered.length
      ? filtered.map(launchCardHtml).join("")
      : `<div class="empty-state">No launches match that search/filter.</div>`;
  }

  try {
    allEntries = await fetchAllLaunches();
    if (allEntries.length === 0) {
      document.getElementById("launch-list").innerHTML = `<div class="empty-state">No launches yet. <a href="launch.html" onclick="if (typeof openLaunchModal === 'function') { openLaunchModal(); return false; } return true;" style="color:var(--green)">Be the first.</a></div>`;
      return;
    }

    document.getElementById("explore-search").addEventListener("input", applyAndRender);
    document.getElementById("explore-sort").addEventListener("change", applyAndRender);
    document.getElementById("explore-filter-chips").addEventListener("click", (e) => {
      const chip = e.target.closest(".filter-chip");
      if (!chip) return;
      document.querySelectorAll("#explore-filter-chips .filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      applyAndRender();
    });

    applyAndRender();
  } catch (err) {
    console.error(err);
    document.getElementById("launch-list").innerHTML = `<div class="empty-state">Couldn't load launches — there may be a network or RPC issue. Try refreshing.</div>`;
  }
}

// ---------- Launch modal (in-page, not a real popup window) ----------

function openLaunchModal() {
  const overlay = document.getElementById("launch-modal-overlay");
  if (!overlay) return; // launch.html has no modal — it IS the launch page
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderCreate("launch-modal-content");
}

function closeLaunchModal() {
  const overlay = document.getElementById("launch-modal-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLaunchModal();
});

// ---------- Create ----------

async function renderCreate(targetId) {
  const main = document.getElementById(targetId || "app");
  main.innerHTML = `
    <h1>launch a token.</h1>
    <p style="max-width:52ch">Fixed supply, no admin key, no allowlist. Once it's live you can't change the name, symbol, or supply — get it right the first time.</p>
    <div class="form-card">

      <div class="field">
        <label>Pair against</label>
        <div class="pair-tabs pair-tabs-3col" id="pair-tabs">
          <div class="pair-tab pt-eth active" data-quote="eth">ETH</div>
          <div class="pair-tab pt-home" data-quote="home" id="home-pair-tab">$HOME<span class="tab-soon">soon</span></div>
          <div class="pair-tab pt-homepad" data-quote="homepad" id="homepad-pair-tab">$HOMEPAD<span class="tab-soon">soon</span></div>
          <div class="pair-tab pt-stock" data-quote="stock" id="stock-pair-tab">Token<span class="tab-soon">soon</span></div>
        </div>
        <div id="stock-quote-select" style="display:none;margin-top:10px"></div>
        <div class="hint" id="pair-hint">New token trades against ETH — the standard setup. Or pair it with $HOME, $HOMEPAD, or any token by contract address.</div>
      </div>

      <div class="field" id="launch-type-field" style="display:none">
        <label>Launch type</label>
        <div class="pair-tabs" id="launch-type-tabs">
          <div class="pair-tab active" data-type="hybrid">Hybrid</div>
          <div class="pair-tab" data-type="curve" id="curve-tab">Bonding Curve<span class="tab-soon">soon</span></div>
          <div class="pair-tab" data-type="instant">Instant Liquidity</div>
        </div>
        <div class="hint" id="launch-type-hint">Real Uniswap pool from the start, visible on Dexscreener immediately — no ETH needed from you. Single-sided liquidity gives it curve-like pricing (large buyers move the price) without a separate bonding-curve contract.</div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Name</label>
          <input id="f-name" placeholder="e.g. Doorbell" maxlength="40">
        </div>
        <div class="field">
          <label>Symbol</label>
          <input id="f-symbol" placeholder="e.g. BELL" maxlength="10" style="text-transform:uppercase">
        </div>
      </div>
      <div class="hint" style="margin:-8px 0 16px">Supply is fixed at ${Number(CONFIG.DEFAULT_SUPPLY).toLocaleString()} tokens for every launch.</div>

      <div class="field">
        <label>Logo <span class="optional">optional</span></label>
        <div class="logo-row">
          <div class="logo-preview" id="f-image-preview">🏡</div>
          <div style="flex:1">
            <input id="f-image" placeholder="paste an image URL, or upload a file below" maxlength="60000">
            <label class="file-btn">
              📎 Upload a file
              <input type="file" id="f-image-file" accept="image/*" style="display:none">
            </label>
            <div class="hint" id="image-hint">A hosted URL is best. Uploading a file embeds the image directly as data — fine for a small icon, but it's stored on-chain as text, so bigger files cost noticeably more gas to launch.</div>
          </div>
        </div>
      </div>

      <div class="field">
        <label>Description <span class="optional">optional</span></label>
        <input id="f-description" placeholder="What's this coin about?" maxlength="280">
      </div>

      <div class="field">
        <label>Website <span class="optional">optional</span></label>
        <input id="f-website" placeholder="https://yourproject.com" maxlength="200">
      </div>

      <div class="field">
        <label>Socials <span class="optional">optional</span></label>
        <div class="field-row three">
          <input id="f-twitter" placeholder="X / Twitter URL" maxlength="200">
          <input id="f-telegram" placeholder="Telegram URL" maxlength="200">
          <input id="f-discord" placeholder="Discord URL" maxlength="200">
        </div>
      </div>

      <div class="field">
        <label>Your fee (rent) <span class="optional">optional add-on, 0–2%</span></label>
        <input id="f-extrafee" type="range" min="0" max="200" step="10" value="0" class="fee-slider">
        <div class="fee-preview" id="fee-preview"></div>
      </div>

      <div class="field" id="devbuy-field">
        <label id="devbuy-label">Dev buy <span class="optional">optional</span></label>
        <input id="f-devbuy" type="number" min="0" step="any" placeholder="0.0 ETH">
        <div class="hint" id="devbuy-hint">Buy your own tokens in the same transaction as the launch. Leave at 0 to skip.</div>
      </div>

      <div class="field" id="instant-liquidity-field" style="display:none">
        <label>Initial liquidity ETH</label>
        <input id="f-instant-liquidity" type="number" min="0" step="any" placeholder="0.0 ETH">
        <div class="hint">Separate from Dev buy above — this seeds the pool itself. Any amount above 0 works, but the pool starts thinner (more slippage) with less.</div>
      </div>

      <div class="field" id="stock-openprice-field" style="display:none">
        <label id="stock-openprice-label">Starting price</label>
        <input id="f-openprice" type="number" min="0" step="any" placeholder="48">
        <div class="hint" id="stock-openprice-hint">How much of the quote token would buy the entire 1B supply at launch — the same convention as the ETH modes (3 ETH). Lower = cheaper start.</div>
      </div>

      <div style="text-align:center;margin-top:8px"><button class="btn-launch-cta" id="launch-btn"><span class="btn-launch-icon">🏡</span><span class="btn-launch-label">Launch</span></button></div>
      <div id="create-status"></div>
    </div>
  `;

  // ----- Image: URL field + file upload, kept in sync -----
  const imgInput = document.getElementById("f-image");
  const imgPreview = document.getElementById("f-image-preview");
  const updateImagePreview = (url) => {
    imgPreview.innerHTML = url ? `<img src="${url}" onerror="this.parentElement.innerHTML='🏡'">` : "🏡";
  };
  imgInput.addEventListener("input", (e) => updateImagePreview(e.target.value.trim()));
  document.getElementById("f-image-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const hintEl = document.getElementById("image-hint");
    const originalKb = Math.round(file.size / 1024);
    hintEl.innerHTML = `Resizing…`;

    // Automatically shrink whatever's uploaded to a size that's actually
    // safe to embed, instead of just rejecting big files. A logo doesn't
    // need to be more than a couple hundred pixels — a huge original
    // photo and a resized 256px icon look identical in the tiny circle
    // this ends up displayed in everywhere on the site, but the resized
    // one is 10-50x smaller and won't risk breaking the transaction the
    // way a multi-MB original could (WalletConnect's relay and some RPC
    // nodes reject oversized payloads outright).
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 256;
        let { width, height } = img;
        if (width > height && width > MAX_DIM) {
          height = Math.round(height * (MAX_DIM / width));
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round(width * (MAX_DIM / height));
          height = MAX_DIM;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        // JPEG compresses far better than PNG for this — quality 0.85 is
        // a solid balance of size vs looking good at icon size.
        const resized = canvas.toDataURL("image/jpeg", 0.85);
        const resizedKb = Math.round((resized.length * 0.75) / 1024); // base64 ~4:3 overhead

        imgInput.value = resized;
        updateImagePreview(resized);
        hintEl.innerHTML = `Resized from ${originalKb}KB to ~${resizedKb}KB (${width}×${height}) — safe to launch with.`;
      };
      img.onerror = () => {
        hintEl.innerHTML = `<strong style="color:var(--red)">Couldn't read that file as an image.</strong>`;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // ----- Pair selection: ETH / $HOME / Stock -----
  // One listener on the container, delegated by which .pair-tab was
  // actually clicked — more robust than binding a separate listener per
  // tab, and easier to extend (adding $HOME didn't need new wiring).
  let selectedQuote = { mode: "eth" };
  let launchType = "hybrid"; // "hybrid" | "curve" | "instant" — instant/hybrid are ETH-pair only
  const devbuyField = document.getElementById("devbuy-field");
  const instantLiquidityField = document.getElementById("instant-liquidity-field");
  const stockField = document.getElementById("stock-openprice-field");
  const pairHint = document.getElementById("pair-hint");
  // "Token" tab: any ERC-20 by contract address — needs only the paired
  // factory. (stockModeLive(), which also wants a curated QUOTE_TOKENS
  // list, is now just for the optional quick-pick chips inside the tab.)
  const stockIsLive = pairedFactoryConfigured();
  const instantIsLive = instantFactoryConfigured();
  const hybridIsLive = hybridFactoryConfigured();
  const curveIsLive = curveFactoryConfigured();
  const launchTypeField = document.getElementById("launch-type-field");
  const devbuyLabel = document.getElementById("devbuy-label");
  const devbuyHint = document.getElementById("devbuy-hint");
  if (hybridIsLive || instantIsLive) launchTypeField.style.display = "block"; // default pair tab is ETH
  // Hybrid needs the tab to exist and be selectable even if it's the only
  // live type — default to whichever's actually configured. Never default
  // into Bonding Curve while it's deferred, even as a last resort.
  if (!hybridIsLive && instantIsLive) launchType = "instant";
  else if (!hybridIsLive && !instantIsLive && curveIsLive) launchType = "curve";
  const curveTabEl = document.getElementById("curve-tab");
  if (curveTabEl && !curveIsLive) curveTabEl.classList.add("pair-tab-disabled");
  // $HOME and $HOMEPAD both ride on the paired-hybrid factory, same as
  // Stock — each live once that's deployed and its own quote token address
  // is configured. Shared helper since the two tabs are otherwise identical.
  function setFixedQuoteTabLive(tabId, quoteCfg) {
    const isLive = pairedFactoryConfigured() && !!(quoteCfg && quoteCfg.address);
    const tabEl = document.getElementById(tabId);
    if (!tabEl) return isLive;
    if (!isLive) tabEl.classList.add("pair-tab-disabled");
    // Static "soon" ribbon in the markup, same as curve/stock — remove it
    // once this one's actually live instead of leaving a stale label on a
    // working tab.
    else tabEl.querySelector(".tab-soon")?.remove();
    return isLive;
  }
  const homeIsLive = setFixedQuoteTabLive("home-pair-tab", CONFIG.HOME_QUOTE);
  const homepadIsLive = setFixedQuoteTabLive("homepad-pair-tab", CONFIG.HOMEPAD_QUOTE);
  const stockTabEl = document.getElementById("stock-pair-tab");
  if (stockTabEl && !stockIsLive) stockTabEl.classList.add("pair-tab-disabled");

  function applyLaunchTypeUI() {
    // Dev buy now applies the same way to all three types — always
    // visible (except stock mode, hidden separately below). Only the
    // Instant-specific liquidity field toggles per type.
    devbuyField.style.display = "block";
    devbuyLabel.innerHTML = 'Dev buy <span class="optional">optional</span>';
    devbuyHint.textContent = "Buy your own tokens in the same transaction as the launch. Leave at 0 to skip.";
    instantLiquidityField.style.display = launchType === "instant" ? "block" : "none";
  }

  if (hybridIsLive || instantIsLive) {
    document.getElementById("launch-type-tabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".pair-tab");
      if (!tab) return;
      if (tab.dataset.type === "curve" && !curveIsLive) return; // deferred — see config.js
      document.querySelectorAll("#launch-type-tabs .pair-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      launchType = tab.dataset.type;
      const hints = {
        hybrid: "Real Uniswap pool from the start, visible on Dexscreener immediately — no ETH needed from you. 8% of supply goes to the $HOME treasury at launch (burned by hand until the lock contract ships); the other 92% is the pool's single-sided liquidity, which gives it curve-like pricing (large buyers move the price) without a separate bonding-curve contract.",
        instant: "Creates a real, immediately tradeable Uniswap pool — visible on Dexscreener right away. 8% of supply goes to the $HOME treasury (burned by hand until the lock contract ships); the rest is locked as liquidity with whatever ETH you seed it with.",
        curve: "Coming soon — trades on a bonding curve until a threshold is met, then graduates to a real DEX pool.",
      };
      document.getElementById("launch-type-hint").textContent = hints[launchType] || hints.curve;
      applyLaunchTypeUI();
    });
  }
  applyLaunchTypeUI();

  document.getElementById("pair-tabs").addEventListener("click", async (e) => {
    const tab = e.target.closest(".pair-tab");
    if (!tab) return;
    if (tab.classList.contains("pair-tab-disabled")) return; // deferred pair — see config.js

    document.querySelectorAll("#pair-tabs .pair-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const quote = tab.dataset.quote;
    const selectEl = document.getElementById("stock-quote-select");

    if (quote === "eth") {
      selectEl.style.display = "none";
      devbuyField.style.display = "block";
      document.getElementById("f-devbuy").placeholder = "0.0 ETH";
      stockField.style.display = "none";
      pairHint.textContent = "New token trades against ETH — the standard setup. Or pair it with $HOME, $HOMEPAD, or any token by contract address.";
      selectedQuote = { mode: "eth" };
      if (hybridIsLive || instantIsLive) launchTypeField.style.display = "block";
      applyLaunchTypeUI();
      return;
    }

    // $HOME, $HOMEPAD, and Stock all go through the paired-hybrid factory
    // (an ERC-20 quote instead of ETH). Launch type is fixed to hybrid
    // there, so the type tabs hide; the dev buy is in quote units and
    // needs an approval.
    instantLiquidityField.style.display = "none";
    stockField.style.display = "block";
    launchTypeField.style.display = "none";
    launchType = "paired";

    if (quote === "home" || quote === "homepad") {
      // Single fixed quote token — no dropdown needed, unlike Stock's list.
      // $HOME and $HOMEPAD are otherwise identical here, just a different q.
      selectEl.style.display = "none";
      const q = quote === "home" ? CONFIG.HOME_QUOTE : CONFIG.HOMEPAD_QUOTE;
      const priceField = document.getElementById("f-openprice");
      const priceHint = document.getElementById("stock-openprice-hint");
      pairHint.textContent = `New token is priced in $${q.symbol} instead of ETH — same single-sided Uniswap v4 pool as Hybrid, no $${q.symbol} needed from you to launch.`;
      selectedQuote = { mode: "stock", address: q.address, symbol: q.symbol, decimals: q.decimals };
      document.getElementById("stock-openprice-label").textContent = `Starting price (${q.symbol})`;
      priceField.placeholder = "…";
      priceField.value = "";
      priceHint.textContent = `Matching Hybrid's current starting valuation in $${q.symbol} — figuring that out now…`;
      devbuyField.style.display = "block";
      devbuyLabel.innerHTML = `Dev buy (${q.symbol}) <span class="optional">optional</span>`;
      document.getElementById("f-devbuy").placeholder = `0.0 ${q.symbol}`;
      devbuyHint.textContent = `Buy your own tokens with ${q.symbol} in the launch transaction (one approval first). Leave at 0 to skip.`;

      // Auto-fill so a creator never has to guess a number here: same
      // starting market cap Hybrid launches open at right now, just
      // converted into whichever quote this tab is. Runs once per tab
      // click — if it fails (rare: RPC hiccup, no price yet for this
      // quote), the field stays editable and the hint says so instead of
      // silently guessing.
      computeQuoteEquivalentStartPrice(q).then((suggested) => {
        if (launchType !== "paired" || selectedQuote.address !== q.address) return; // tab changed while this was in flight
        q.defaultVirtualQuote = suggested;
        priceField.placeholder = suggested;
        priceHint.textContent = `Auto-filled to match Hybrid's current starting valuation: ${fmtCompact(Number(suggested))} $${q.symbol} buys the full 1B supply. Change it if you want a different start — lower = cheaper.`;
      }).catch((err) => {
        console.warn(`couldn't compute ${q.symbol}-equivalent start price`, err);
        priceField.placeholder = q.defaultVirtualQuote;
        priceHint.textContent = `Couldn't fetch a live suggestion — enter how many $${q.symbol} should buy the entire 1B supply at launch. Lower = cheaper start.`;
      });
      return;
    }

    // quote === "stock" — the "Token" tab: paste any ERC-20's contract
    // address. HomepadFactoryPaired accepts any non-zero ERC-20 as the
    // quote, so this is purely a frontend affordance — resolve the token
    // on-chain (code exists, symbol(), decimals()), then hand it to the
    // same paired launch path $HOME/$HOMEPAD use.
    selectEl.style.display = "block";
    {
      const priceField = document.getElementById("f-openprice");
      const priceHint = document.getElementById("stock-openprice-hint");
      pairHint.textContent = "New token is priced in another token instead of ETH — same single-sided Uniswap v4 pool as Hybrid, none of that token needed from you to launch.";
      const picks = quoteTokenOptions();
      selectEl.innerHTML = `
        <input id="f-quote-address" class="quote-address" placeholder="0x… contract address of the token to pair with" autocomplete="off" spellcheck="false">
        ${picks.length ? `<div class="quote-picks">${picks.map((o) => `<button type="button" class="btn-mini quote-pick" data-addr="${o.address}">${o.symbol}</button>`).join("")}</div>` : ""}
        <div class="quote-resolved" id="quote-resolved"></div>
        <div class="hint quote-warn">Standard ERC-20 only. Fee-on-transfer, rebasing, or Robinhood Stock Tokens (their <code>uiMultiplier</code> changes on splits/dividends) will misprice the pool — the contract can't tell them apart, so this is on you.</div>
      `;
      selectedQuote = { mode: "stock", address: "", symbol: "", decimals: 18, defaultVirtualQuote: "1000000" };
      document.getElementById("stock-openprice-label").textContent = "Starting price";
      priceField.placeholder = "…";
      priceField.value = "";
      priceHint.textContent = "Paste a token address above first.";
      devbuyField.style.display = "none";

      const resolvedEl = document.getElementById("quote-resolved");
      const addrInput = document.getElementById("f-quote-address");
      let resolveSeq = 0;
      const resolve = async (raw) => {
        const seq = ++resolveSeq;
        const addr = raw.trim();
        selectedQuote = { mode: "stock", address: "", symbol: "", decimals: 18, defaultVirtualQuote: "1000000" };
        devbuyField.style.display = "none";
        if (!addr) { resolvedEl.innerHTML = ""; priceHint.textContent = "Paste a token address above first."; return; }
        if (!ethers.isAddress(addr)) { resolvedEl.innerHTML = `<span class="quote-bad">That isn't a valid address.</span>`; return; }
        if (addr.toLowerCase() === CONFIG.HOME_TOKEN_ADDRESS.toLowerCase() || (CONFIG.HOMEPAD_QUOTE && addr.toLowerCase() === CONFIG.HOMEPAD_QUOTE.address.toLowerCase())) {
          resolvedEl.innerHTML = `<span class="quote-bad">That one has its own tab above.</span>`; return;
        }
        resolvedEl.innerHTML = `<span class="muted">Looking up token…</span>`;
        try {
          const provider = readProvider();
          const code = await provider.getCode(addr);
          if (seq !== resolveSeq) return;
          if (!code || code === "0x") { resolvedEl.innerHTML = `<span class="quote-bad">No contract at that address on Robinhood Chain.</span>`; return; }
          const t = tokenRead(addr);
          const [symbol, decimals, name] = await Promise.all([t.symbol(), t.decimals().then(Number), t.name().catch(() => "")]);
          if (seq !== resolveSeq) return;
          const q = { symbol, decimals, name, address: ethers.getAddress(addr), defaultVirtualQuote: "1000000" };
          selectedQuote = { mode: "stock", address: q.address, symbol, decimals, defaultVirtualQuote: q.defaultVirtualQuote };
          resolvedEl.innerHTML = `<span class="quote-ok">✓ $${symbol}</span> <span class="muted">${name ? name + " · " : ""}${decimals} decimals</span>`;
          document.getElementById("stock-openprice-label").textContent = `Starting price (${symbol})`;
          devbuyField.style.display = "block";
          devbuyLabel.innerHTML = `Dev buy (${symbol}) <span class="optional">optional</span>`;
          document.getElementById("f-devbuy").placeholder = `0.0 ${symbol}`;
          devbuyHint.textContent = `Buy your own tokens with ${symbol} in the launch transaction (one approval first). Leave at 0 to skip.`;
          priceHint.textContent = `Matching Hybrid's current starting valuation in $${symbol} — figuring that out now…`;
          // Same auto-fill as the $HOME/$HOMEPAD tabs; needs a Dexscreener
          // price for this token, which an obscure one may not have.
          computeQuoteEquivalentStartPrice(q).then((suggested) => {
            if (seq !== resolveSeq || selectedQuote.address !== q.address) return;
            selectedQuote.defaultVirtualQuote = suggested;
            priceField.placeholder = suggested;
            priceHint.textContent = `Auto-filled to match Hybrid's current starting valuation: ${fmtCompact(Number(suggested))} $${symbol} buys the full 1B supply. Change it if you want a different start — lower = cheaper.`;
          }).catch(() => {
            if (seq !== resolveSeq) return;
            priceField.placeholder = q.defaultVirtualQuote;
            priceHint.textContent = `No live price found for $${symbol}, so no auto-suggestion — enter how many $${symbol} should buy the entire 1B supply at launch. Lower = cheaper start.`;
          });
        } catch (err) {
          if (seq !== resolveSeq) return;
          console.warn("quote token lookup failed", err);
          resolvedEl.innerHTML = `<span class="quote-bad">Couldn't read that as an ERC-20 (no symbol()/decimals()).</span>`;
        }
      };
      let debounce;
      addrInput.addEventListener("input", (ev) => { clearTimeout(debounce); debounce = setTimeout(() => resolve(ev.target.value), 350); });
      selectEl.querySelectorAll(".quote-pick").forEach((b) => b.addEventListener("click", () => { addrInput.value = b.dataset.addr; resolve(b.dataset.addr); }));
    }
  });

  // ----- Fee: live preview as the creator drags the extra-fee slider -----
  const BASE_FEE_BPS = 100;        // 1%, matches HomepadFactory's default
  const CREATOR_SHARE_BPS = 7000;  // 70%, matches HomepadFactory's default
  const feeSlider = document.getElementById("f-extrafee");
  const feePreview = document.getElementById("fee-preview");
  const renderFeePreview = () => {
    const extraBps = Number(feeSlider.value);
    const totalBps = BASE_FEE_BPS + extraBps;
    const baseCreatorBps = (BASE_FEE_BPS * CREATOR_SHARE_BPS) / 10000;
    const basePlatformBps = BASE_FEE_BPS - baseCreatorBps;
    const creatorTotalBps = baseCreatorBps + extraBps;
    const pct = (bps) => (bps / 100).toFixed(2) + "%";

    feePreview.innerHTML = `
      <div class="fee-preview-total">Total fee (rent): <strong>${pct(totalBps)}</strong></div>
      <div class="fee-preview-row"><span>Base fee (rent)</span><span>${pct(BASE_FEE_BPS)}</span></div>
      <div class="fee-preview-row sub"><span>→ you (70%)</span><span>${pct(baseCreatorBps)}</span></div>
      <div class="fee-preview-row sub"><span>→ $HOME / platform (30%)</span><span>${pct(basePlatformBps)}</span></div>
      ${extraBps > 0 ? `
        <div class="fee-preview-row"><span>Your extra fee (rent)</span><span>${pct(extraBps)}</span></div>
        <div class="fee-preview-row sub"><span>→ you (100%)</span><span>${pct(extraBps)}</span></div>
      ` : ""}
      <div class="fee-preview-row highlight"><span>You earn per trade</span><span>${pct(creatorTotalBps)}</span></div>
      <div class="hint" style="margin-top:8px">Paid to your wallet on every trade, in whatever the trade pays out: on a buy you receive it as your token, on a sell as ETH. Same for the $HOME share.</div>
    `;
  };
  feeSlider.addEventListener("input", renderFeePreview);
  renderFeePreview();

  // ----- Submit -----
  document.getElementById("launch-btn").onclick = async () => {
    const name = document.getElementById("f-name").value.trim();
    const symbol = document.getElementById("f-symbol").value.trim().toUpperCase();
    const imageUrl = document.getElementById("f-image").value.trim();
    const description = document.getElementById("f-description").value.trim();
    const twitter = document.getElementById("f-twitter").value.trim();
    const telegram = document.getElementById("f-telegram").value.trim();
    const discord = document.getElementById("f-discord").value.trim();
    const website = document.getElementById("f-website").value.trim();
    const statusEl = document.getElementById("create-status");

    if (!name || !symbol) {
      statusEl.innerHTML = `<div class="status error">Name and symbol are both required.</div>`;
      return;
    }
    if (!state.signer) {
      statusEl.innerHTML = `<div class="status error">Connect a wallet first.</div>`;
      return;
    }
    if (selectedQuote.mode === "stock-preview") {
      statusEl.innerHTML = `<div class="status error">Token pairing isn't live yet — switch to ETH to launch right now.</div>`;
      return;
    }
    if (launchType === "curve" && !curveFactoryConfigured()) {
      statusEl.innerHTML = `<div class="status error">Bonding Curve isn't live yet — pick Hybrid or Instant Liquidity to launch right now.</div>`;
      return;
    }
    // Belt-and-suspenders: catches a huge base64 string pasted directly
    // into the URL field too, not just ones that came through file upload
    // (which is capped above, but this field's own maxlength is far
    // higher — 60000 chars — since it also needs to fit a normal hosted URL).
    if (imageUrl.startsWith("data:") && imageUrl.length > 280_000) {
      statusEl.innerHTML = `<div class="status error">That embedded image is too large and will likely make the transaction fail — please use a hosted image URL instead, or a smaller file.</div>`;
      return;
    }

    const meta = { imageUrl, description, twitter, telegram, discord, website };
    const extraFeeBps = Number(document.getElementById("f-extrafee").value);

    // Detects success by watching the factory's own launchCount() instead
    // of only trusting the wallet path's tx-confirmation promise — added
    // after wagmi's writeContract() was observed to hang indefinitely on
    // the confirming side even though the transaction had already gone
    // through on-chain. Whichever signal arrives first (a normal
    // tx.wait(), or launchCount() ticking up) wins; the other is just
    // abandoned, which is harmless since it's read-only polling.
    async function waitForLaunchSuccess(factoryContract, countBefore, getTxPromise) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finishOk = () => { if (!settled) { settled = true; resolve(); } };
        const finishErr = (e) => { if (!settled) { settled = true; reject(e); } };

        (async () => {
          try {
            const tx = await getTxPromise();
            if (tx?.hash) {
              statusEl.innerHTML = `<div class="status pending">Deploying… <a href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank" style="color:inherit">view tx</a></div>`;
            }
            await tx.wait();
            finishOk();
          } catch (e) {
            finishErr(e);
          }
        })();

        (async () => {
          while (!settled) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
              const count = Number(await factoryContract.launchCount());
              if (count > countBefore) { finishOk(); return; }
            } catch { /* transient read error — keep polling */ }
          }
        })();
      });
    }

    try {
      if (selectedQuote.mode === "stock") {
        if (!selectedQuote.address) {
          statusEl.innerHTML = `<div class="status error">Paste the contract address of the token to pair with (or pick $HOME / $HOMEPAD above).</div>`;
          return;
        }
        // Config entry if it's a known quote ($HOME/$HOMEPAD, or a curated
        // pick); otherwise the token we just resolved on-chain in the tab.
        const q = quoteTokenInfo(selectedQuote.address) || selectedQuote;
        const virtualStr = document.getElementById("f-openprice").value.trim() || q.defaultVirtualQuote;
        const initialVirtualQuote = ethers.parseUnits(virtualStr, q.decimals);
        const devBuyStr = document.getElementById("f-devbuy").value.trim();
        const devBuyQuote = devBuyStr && Number(devBuyStr) > 0 ? ethers.parseUnits(devBuyStr, q.decimals) : 0n;
        const pFactory = pairedFactoryRead();
        const countBefore = Number(await pFactory.launchCount());

        if (devBuyQuote > 0n) {
          // Dev buy is pulled with transferFrom — approve the factory first.
          const allowance = await tokenRead(q.address).allowance(state.account, CONFIG.PAIRED_FACTORY_ADDRESS);
          if (allowance < devBuyQuote) {
            statusEl.innerHTML = `<div class="status pending">Approve ${q.symbol} for the dev buy in your wallet…</div>`;
            const a = await tokenWrite(q.address).approve(CONFIG.PAIRED_FACTORY_ADDRESS, devBuyQuote);
            await a.wait();
          }
        }

        statusEl.innerHTML = `<div class="status pending">Confirm the transaction in your wallet…</div>`;
        const functionName = devBuyQuote > 0n ? "launchAndBuy" : "launch";
        const args = devBuyQuote > 0n
          ? [name, symbol, q.address, initialVirtualQuote, extraFeeBps, meta, devBuyQuote]
          : [name, symbol, q.address, initialVirtualQuote, extraFeeBps, meta];
        await waitForLaunchSuccess(pFactory, countBefore, async () => {
          let t = typeof tryWagmiWrite === "function"
            ? await withTimeoutHint(tryWagmiWrite({ address: CONFIG.PAIRED_FACTORY_ADDRESS, abi: PAIRED_FACTORY_ABI, functionName, args, value: 0n }), statusEl)
            : null;
          if (!t) {
            const o = await getTxOverrides(6_000_000n);
            t = await pairedFactoryWrite()[functionName](...args, o);
          }
          return t;
        });
      } else if (launchType === "hybrid") {
        const devBuyStr = document.getElementById("f-devbuy").value.trim();
        const devBuyEth = devBuyStr ? ethers.parseEther(devBuyStr) : 0n;
        const hFactory = hybridFactoryRead();
        const countBefore = Number(await hFactory.launchCount());

        statusEl.innerHTML = `<div class="status pending">Confirm the transaction in your wallet…</div>`;
        const functionName = devBuyEth > 0n ? "launchAndBuy" : "launch";
        const args = [name, symbol, extraFeeBps, meta];

        await waitForLaunchSuccess(hFactory, countBefore, async () => {
          let t = typeof tryWagmiWrite === "function"
            ? await withTimeoutHint(tryWagmiWrite({ address: CONFIG.HYBRID_FACTORY_ADDRESS, abi: HYBRID_FACTORY_ABI, functionName, args, value: devBuyEth }), statusEl)
            : null;
          if (!t) {
            const hOverrides = await getTxOverrides(6_000_000n);
            t = devBuyEth > 0n
              ? await hybridFactoryWrite().launchAndBuy(name, symbol, extraFeeBps, meta, { ...hOverrides, value: devBuyEth })
              : await hybridFactoryWrite().launch(name, symbol, extraFeeBps, meta, hOverrides);
          }
          return t;
        });
      } else if (launchType === "instant") {
        const liquidityStr = document.getElementById("f-instant-liquidity").value.trim();
        const liquidityEth = liquidityStr ? ethers.parseEther(liquidityStr) : 0n;
        if (liquidityEth <= 0n) {
          statusEl.innerHTML = `<div class="status error">Instant liquidity needs some ETH above 0 to seed the pool.</div>`;
          return;
        }
        const devBuyStr = document.getElementById("f-devbuy").value.trim();
        const devBuyEth = devBuyStr ? ethers.parseEther(devBuyStr) : 0n;
        const totalValue = liquidityEth + devBuyEth;

        const iFactory = instantFactoryRead();
        const countBefore = Number(await iFactory.launchCount());

        statusEl.innerHTML = `<div class="status pending">Confirm the transaction in your wallet…</div>`;
        const functionName = devBuyEth > 0n ? "launchAndBuy" : "launch";
        const args = devBuyEth > 0n ? [name, symbol, extraFeeBps, meta, devBuyEth] : [name, symbol, extraFeeBps, meta];

        await waitForLaunchSuccess(iFactory, countBefore, async () => {
          let t = typeof tryWagmiWrite === "function"
            ? await withTimeoutHint(tryWagmiWrite({ address: CONFIG.INSTANT_FACTORY_ADDRESS, abi: INSTANT_FACTORY_ABI, functionName, args, value: totalValue }), statusEl)
            : null;
          if (!t) {
            const ethOverrides = await getTxOverrides(6_000_000n);
            t = devBuyEth > 0n
              ? await instantFactoryWrite().launchAndBuy(name, symbol, extraFeeBps, meta, devBuyEth, { ...ethOverrides, value: totalValue })
              : await instantFactoryWrite().launch(name, symbol, extraFeeBps, meta, { ...ethOverrides, value: totalValue });
          }
          return t;
        });
      } else {
        const devBuyStr = document.getElementById("f-devbuy").value.trim();
        const devBuyEth = devBuyStr ? ethers.parseEther(devBuyStr) : 0n;
        const eFactory = factoryRead();
        const countBefore = Number(await eFactory.launchCount());

        statusEl.innerHTML = `<div class="status pending">Confirm the transaction in your wallet…</div>`;
        const functionName = devBuyEth > 0n ? "launchAndBuy" : "launch";
        const args = devBuyEth > 0n ? [name, symbol, extraFeeBps, meta, 0] : [name, symbol, extraFeeBps, meta];

        await waitForLaunchSuccess(eFactory, countBefore, async () => {
          let t = typeof tryWagmiWrite === "function"
            ? await withTimeoutHint(tryWagmiWrite({ address: CONFIG.FACTORY_ADDRESS, abi: HOMEPAD_FACTORY_ABI, functionName, args, value: devBuyEth }), statusEl)
            : null;
          if (!t) {
            const ethOverrides = await getTxOverrides(6_000_000n);
            t = devBuyEth > 0n
              ? await factoryWrite().launchAndBuy(name, symbol, extraFeeBps, meta, 0, { ...ethOverrides, value: devBuyEth })
              : await factoryWrite().launch(name, symbol, extraFeeBps, meta, ethOverrides);
          }
          return t;
        });
      }

      statusEl.innerHTML = `<div class="status info">Launched! Taking you to Explore…</div>`;
      setTimeout(() => {
        if (window.IS_LAUNCH_ONLY_PAGE) {
          location.href = "explore.html";
        } else {
          if (typeof closeLaunchModal === "function") closeLaunchModal();
          location.href = "explore.html";
        }
      }, 900);
    } catch (err) {
      console.error(err);
      const msg = err.shortMessage || err.message || "Transaction failed.";
      const hint = /missing revert data/i.test(msg)
        ? `<br><span style="font-size:.8rem;opacity:.85">This usually means your wallet isn't actually on Robinhood Chain (mainnet, chain ID 4663) — double-check the network shown in your wallet.</span>`
        : /could not coalesce/i.test(msg)
        ? `<br><span style="font-size:.8rem;opacity:.85">Your wallet's connection didn't respond properly. Try disconnecting and reconnecting, or switch to a different wallet app.</span>`
        : "";
      // Surface whatever nested detail ethers attached — "could not
      // coalesce" errors usually bundle the actual underlying failures in
      // .errors, which is otherwise invisible without opening devtools.
      const nested = Array.isArray(err.errors) && err.errors.length
        ? `<br><span style="font-size:.72rem;opacity:.7;word-break:break-all">${err.errors.map((e) => e.shortMessage || e.message || String(e)).join(" · ")}</span>`
        : "";
      statusEl.innerHTML = `<div class="status error">${msg}${hint}${nested}</div>`;
    }
  };
}

// ---------- Token detail ----------


// ---------- Token detail — ONE page for every launch type ----------
// Bonding curve, Hybrid, and Instant Liquidity (including tokens launched on
// legacy factories) all render through the same template below. The only
// things that differ per type are the data source (curve contract vs. swap
// router), the status strip, and how a trade is quoted/sent — everything
// else, from the header down to the Details table, is identical.

let tradeMode = "buy";

const TYPE_INFO = {
  curve:   { label: "bonding curve",     cls: "tt-curve",   how: (s, extra) => `$${s} trades on a bonding curve until ${extra.threshold} ETH is raised, then graduates into a Uniswap v4 pool with the liquidity burned — nobody can withdraw it, ever.` },
  hybrid:  { label: "hybrid",            cls: "tt-hybrid",  how: (s) => `$${s} launched straight into a real Uniswap v4 pool with single-sided liquidity — the whole supply, priced against a virtual ETH reserve, no ETH from the creator. Price moves against large buyers the way a bonding curve does, but it's a real pool from block one and liquidity is permanently locked.` },
  instant: { label: "instant liquidity", cls: "tt-instant", how: (s) => `$${s} has a real two-sided Uniswap v4 pool from the moment it launched — the creator seeded actual ETH liquidity, so there's no curve and no graduation step. Liquidity is permanently locked (no withdraw function exists).` },
  paired:  { label: "paired",             cls: "tt-paired",  how: (s, x) => `$${s} is priced in ${x.quoteSymbol} instead of ETH — a real Uniswap v4 pool from block one, single-sided (the whole supply, no ${x.quoteSymbol} from the creator), so it behaves like a bonding curve against ${x.quoteSymbol}. Buying spends ${x.quoteSymbol} (approve once); selling returns ${x.quoteSymbol}. Liquidity is permanently locked.` },
};

/// Works out what kind of launch an address is and where its data lives —
/// current and legacy factories alike — so the page never has to care.
async function resolveTokenContext(tokenAddr) {
  // Same guard as fetchAllLaunches — Bonding Curve is deferred
  // (FACTORY_ADDRESS unset), so skip it entirely rather than letting an
  // empty-address contract call throw and take every OTHER mode's token
  // page down with it.
  if (curveFactoryConfigured()) {
    const factory = factoryRead();
    const curveAddr = await factory.curveOf(tokenAddr);
    if (curveAddr !== ethers.ZeroAddress) {
      const meta = await findLaunchMeta(factory, tokenAddr);
      return { type: "curve", tokenAddr, curveAddr, meta: meta || {}, factory };
    }
  }
  // Hook address is only known for the CURRENT deployments (legacy entries
  // in config only record factory + router), so it's shown only when the
  // token's router is the current one.
  const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const instant = await findInstantLaunchMeta(tokenAddr);
  if (instant) return { type: "instant", tokenAddr, meta: instant.meta, routerAddress: instant.routerAddress, factory: instant.factory,
    hookAddress: same(instant.routerAddress, CONFIG.SWAP_ROUTER_ADDRESS) ? CONFIG.HOOK_ADDRESS : null };
  const hybrid = await findHybridLaunchMeta(tokenAddr);
  if (hybrid) return { type: "hybrid", tokenAddr, meta: hybrid.meta, routerAddress: hybrid.routerAddress, factory: hybrid.factory,
    hookAddress: same(hybrid.routerAddress, CONFIG.HYBRID_SWAP_ROUTER_ADDRESS) ? CONFIG.HYBRID_HOOK_ADDRESS : null };
  const paired = await findPairedLaunchMeta(tokenAddr);
  if (paired) {
    const cfg = quoteTokenInfo(paired.meta.quoteToken);
    let quoteSymbol = cfg ? cfg.symbol : short(paired.meta.quoteToken);
    let quoteDecimals = cfg ? cfg.decimals : 18;
    try { [quoteSymbol, quoteDecimals] = await Promise.all([tokenRead(paired.meta.quoteToken).symbol(), tokenRead(paired.meta.quoteToken).decimals().then(Number)]); } catch { /* keep config values */ }
    return { type: "paired", tokenAddr, meta: paired.meta, routerAddress: paired.routerAddress, factory: paired.factory,
      hookAddress: same(paired.routerAddress, CONFIG.PAIRED_SWAP_ROUTER_ADDRESS) ? CONFIG.PAIRED_HOOK_ADDRESS : null,
      quoteToken: paired.meta.quoteToken, quoteSymbol, quoteDecimals, quoteIsCurrency0: paired.meta.quoteIsCurrency0 };
  }
  return null;
}

/// Everything the template needs, in one shape regardless of type.
async function loadTokenData(ctx) {
  const token = tokenRead(ctx.tokenAddr);
  const treasury = CONFIG.HOME_TREASURY_ADDRESS || ethers.ZeroAddress;
  const me = state.account;
  const basePromise = Promise.all([
    token.name(), token.symbol(), token.totalSupply(), token.balanceOf(treasury),
    me ? token.balanceOf(me) : null,
    me ? readProvider().getBalance(me) : null,
    // The 8% launch allocation is burned to the dead address by hand until
    // the lock contract ships — this is how the page knows whether it has been.
    token.balanceOf(BURN_ADDRESS).catch(() => 0n),
  ]);

  const d = { curve: null, price: null, priceSource: null, marketCapEth: null, quote: null };

  if (ctx.type === "paired") {
    // Everything here is denominated in the quote token, not ETH.
    const quote = tokenRead(ctx.quoteToken);
    const router = new ethers.Contract(ctx.routerAddress, PAIRED_SWAP_ROUTER_ABI, readProvider());
    const EMPTY_HISTORY = { prices: [], trades: [], volumeEth: 0n, count: 0, volume24hEth: 0n, count24h: 0 };
    const [base, history, userQuote, feeCfg] = await Promise.all([
      basePromise,
      buildPairedTradeHistory(ctx.tokenAddr, router, ctx.quoteDecimals, ctx.factory).catch((err) => { console.warn("paired trade history unavailable", err); return EMPTY_HISTORY; }),
      me ? quote.balanceOf(me) : null,
      ctx.factory ? Promise.all([ctx.factory.baseFeeBps(), ctx.factory.creatorShareBps()]).catch(() => null) : null,
    ]);
    Object.assign(d, { base, history, ethUsd: null, router, userQuote });
    d.quote = { symbol: ctx.quoteSymbol, decimals: ctx.quoteDecimals, address: ctx.quoteToken };
    const launchPrice = Number(ethers.formatUnits(ctx.meta.initialVirtualQuote, ctx.quoteDecimals)) / 1_000_000_000;
    if (history.prices.length) { d.price = history.prices.at(-1); d.priceSource = "last trade"; }
    else { d.price = launchPrice; d.priceSource = "starting price"; }
    const baseBps = feeCfg ? Number(feeCfg[0]) : 100;
    const creatorShare = feeCfg ? Number(feeCfg[1]) : 7000;
    const extra = Number(ctx.meta.extraFeeBps || 0);
    d.feeBps = baseBps + extra;
    d.feeCreatorBps = Math.round(baseBps * creatorShare / 10000) + extra;
    d.feeHomeBps = d.feeBps - d.feeCreatorBps;
    d.startPrice = launchPrice;
  } else if (ctx.type === "curve") {
    const curve = curveRead(ctx.curveAddr);
    const [base, cv, ethUsd] = await Promise.all([
      basePromise,
      Promise.all([
        curve.ethRaised(), curve.graduationThreshold(), curve.graduated(), curve.totalFeeBps(),
        curve.virtualEthReserve(), curve.virtualTokenReserve(), curve.creatorShareBps(),
        ctx.factory.initialVirtualEth(), ctx.factory.DEFAULT_SUPPLY(), readProvider().getBalance(ctx.curveAddr),
      ]),
      getEthUsdPrice(),
    ]);
    const [ethRaised, threshold, graduated, totalFeeBps, vE, vT, creatorShareBps, initialVirtualEth, defaultSupply, curveEth] = cv;
    Object.assign(d, { base, ethUsd });
    d.history = await buildTradeHistory(ctx.curveAddr, initialVirtualEth, defaultSupply);
    d.curve = { ethRaised, threshold, graduated, vE, vT, curveEth, pct: threshold > 0n ? Math.min(100, Number((ethRaised * 100n) / threshold)) : 0 };
    d.price = Number(vE) / Number(vT);
    d.priceSource = "curve";
    d.feeBps = Number(totalFeeBps);
    const extra = Number(ctx.meta.extraFeeBps || 0);
    const baseBps = d.feeBps - extra;
    d.feeCreatorBps = Math.round(baseBps * Number(creatorShareBps) / 10000) + extra;
    d.feeHomeBps = d.feeBps - d.feeCreatorBps;
    d.startPrice = d.history.startPrice;
  } else {
    const router = new ethers.Contract(ctx.routerAddress, SWAP_ROUTER_ABI, readProvider());
    const EMPTY_HISTORY = { prices: [], trades: [], volumeEth: 0n, count: 0, volume24hEth: 0n, count24h: 0 };
    const [base, history, ethUsd, hookFee] = await Promise.all([
      basePromise,
      buildInstantTradeHistory(ctx.tokenAddr, router).catch((err) => { console.warn("trade history unavailable", err); return EMPTY_HISTORY; }),
      getEthUsdPrice(),
      // fee split lives on the factory that launched it (legacy or current)
      ctx.factory ? Promise.all([ctx.factory.baseFeeBps(), ctx.factory.creatorShareBps()]).catch(() => null) : null,
    ]);
    Object.assign(d, { base, history, ethUsd, router });
    if (history.prices.length) { d.price = history.prices.at(-1); d.priceSource = "last trade"; }
    else if (ctx.type === "hybrid" && ctx.factory) {
      // Single-sided pool: the starting price already implies a market cap
      // (initialVirtualEth is exactly what the full supply is worth at launch).
      try {
        const init = await ctx.factory.initialVirtualEth();
        d.price = Number(ethers.formatEther(init)) / 1_000_000_000;
        d.priceSource = "starting price";
      } catch { /* leave null */ }
    }
    const baseBps = hookFee ? Number(hookFee[0]) : 100;
    const creatorShare = hookFee ? Number(hookFee[1]) : 7000;
    const extra = Number(ctx.meta.extraFeeBps || 0);
    d.feeBps = baseBps + extra;
    d.feeCreatorBps = Math.round(baseBps * creatorShare / 10000) + extra;
    d.feeHomeBps = d.feeBps - d.feeCreatorBps;
    d.startPrice = null;
  }

  const [name, symbol, totalSupply, homeBalance, userBalance, userEth, burnedBalance] = d.base;
  Object.assign(d, { name, symbol, totalSupply, homeBalance, userBalance, userEth, burnedBalance });
  const supplyTokens = Number(ethers.formatEther(totalSupply));
  if (ctx.type === "paired") {
    d.marketCapQuote = d.price != null ? d.price * supplyTokens : null;
    d.marketCapEth = null; d.marketCapUsd = null;
  } else {
    d.marketCapEth = d.price != null ? d.price * supplyTokens : null;
    d.marketCapUsd = d.marketCapEth != null && d.ethUsd != null ? d.marketCapEth * d.ethUsd : null;
  }
  const tmp = {}; applyPriceChange(tmp, d.history.trades, d.startPrice); d.change24h = tmp.change24h;

  // Dexscreener overlay (same source as the $HOME hero). Kept alongside the
  // on-chain figures rather than replacing them, so the page can say which
  // is which and still show something for a pair Dexscreener hasn't indexed.
  // Paired launches get their own pool's stats the same as every other
  // type, plus the quote token's own address in the same batched call —
  // a brand-new pair (own pool not indexed yet) can still show a real $
  // market cap via the quote's already-indexed price (see the fallback
  // below), instead of a raw "534.14M HOMEPAD" figure.
  const dexAddrs = ctx.type === "paired" ? [ctx.tokenAddr, ctx.quoteToken] : [ctx.tokenAddr];
  const dexMap = await fetchDexscreenerStats(dexAddrs);
  d.dex = dexMap.get(ctx.tokenAddr.toLowerCase()) || null;
  if (d.dex) {
    if (d.dex.marketCapUsd != null) d.marketCapUsd = d.dex.marketCapUsd;
    if (d.dex.change24h != null) d.change24h = d.dex.change24h;
    if (d.dex.priceNative != null) { d.price = d.dex.priceNative; d.priceSource = "via Dexscreener"; }
  }
  if (ctx.type === "paired" && d.marketCapUsd == null) {
    const quoteDex = dexMap.get((ctx.quoteToken || "").toLowerCase());
    if (quoteDex && quoteDex.priceUsd != null && d.marketCapQuote != null) {
      d.marketCapUsd = d.marketCapQuote * quoteDex.priceUsd;
      d.marketCapUsdSource = "quote"; // via the quote token's price, not this pair's own — see the sub-line above
    }
  }
  return d;
}

function typePill(type) {
  const t = TYPE_INFO[type];
  return `<span class="type-pill ${t.cls}">${t.label}</span>`;
}

/// Same slot for every type: curve shows graduation progress, the two
/// pool types show their live-pool status.
function tokenStatusStrip(ctx, d) {
  if (ctx.type === "curve") {
    const c = d.curve;
    const raised = Number(ethers.formatEther(c.ethRaised)).toFixed(3);
    const goal = ethers.formatEther(c.threshold);
    if (c.graduated) {
      return `<div class="token-status tt-curve"><div class="token-status-row"><strong>Graduated</strong><span>${goal} ETH raised — now trading on a Uniswap v4 pool, liquidity burned.</span></div><div class="bar"><div class="bar-fill" style="width:100%"></div></div></div>`;
    }
    return `<div class="token-status tt-curve"><div class="token-status-row"><strong>Graduation progress</strong><span>${raised} / ${goal} ETH · ${c.pct}%</span></div><div class="bar"><div class="bar-fill" style="width:${c.pct}%"></div></div><p>Graduates into a locked Uniswap v4 pool at ${goal} ETH. ${(Number(ethers.formatEther(c.curveEth))).toFixed(4)} ETH currently held in the curve.</p></div>`;
  }
  if (ctx.type === "paired") {
    return `<div class="token-status tt-paired"><div class="token-status-row"><strong>Live on Uniswap v4 · paired with ${ctx.quoteSymbol}</strong><span>single-sided pool · liquidity permanently locked · no admin key</span></div><div class="bar"><div class="bar-fill" style="width:100%"></div></div><p>Priced in ${ctx.quoteSymbol}, not ETH — you spend ${ctx.quoteSymbol} to buy and receive ${ctx.quoteSymbol} when you sell.</p></div>`;
  }
  const sided = ctx.type === "hybrid" ? "single-sided" : "two-sided";
  return `<div class="token-status ${TYPE_INFO[ctx.type].cls}"><div class="token-status-row"><strong>Live on Uniswap v4</strong><span>${sided} pool · liquidity permanently locked · no admin key</span></div><div class="bar"><div class="bar-fill" style="width:100%"></div></div><p>Real pool from block one — tradable here and on any aggregator that indexes Robinhood Chain.</p></div>`;
}

async function renderTokenDetail(tokenAddr) {
  const main = document.getElementById("app");
  main.innerHTML = `
    <div class="token-head skeleton-card" aria-hidden="true">
      <div class="sk" style="width:88px;height:88px;border-radius:14px;flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div class="sk sk-line w40" style="height:22px"></div>
        <div class="sk sk-line w70"></div>
        <div class="sk sk-line w30"></div>
      </div>
    </div>
    <div class="grid-launches">${skeletonCardsHtml(4)}</div>`;

  try {
    const ctx = await resolveTokenContext(tokenAddr);
    if (!ctx) { main.innerHTML = `<div class="empty-state">This address isn't a HOMEPAD launch.</div>`; return; }
    const d = await loadTokenData(ctx);
    const { meta } = ctx;
    const t = TYPE_INFO[ctx.type];
    const sym = d.symbol;
    const launchedAt = Number(meta.launchedAt || 0);
    const launchedDate = launchedAt ? new Date(launchedAt * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
    const explorerAddr = (a) => `${CONFIG.BLOCK_EXPLORER}/address/${a}`;
    // ERC-20s get the explorer's dedicated token page (holders, transfers)
    // rather than the generic address page — same split homeExplorerUrl()
    // in config.js makes for $HOME.
    const explorerToken = (a) => `${CONFIG.BLOCK_EXPLORER}/token/${a}`;
    // Prefer the exact pair once Dexscreener has indexed it (that's what the
    // $HOME chart uses); the token-address URL resolves to the same pair but
    // is a redirect, which is less reliable inside an embed.
    const dexUrl = `https://dexscreener.com/${CONFIG.DEXSCREENER_CHAIN_SLUG}/${d.dex && d.dex.pairAddress ? d.dex.pairAddress : tokenAddr}`;
    const dexEmbedUrl = `${dexUrl}?embed=1&theme=dark&trades=0&info=0`;
    const shareText = `$${sym} on HOMEPAD 🏡 — launch pays rent, rent goes home to $HOME`;
    const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(location.href)}`;
    const up = d.change24h != null && d.change24h >= 0;
    const fmtTokens = (bn) => Number(ethers.formatEther(bn)).toLocaleString("en-US", { maximumFractionDigits: 0 });
    const feePct = (bps) => (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2);
    // Unit of account for this token: ETH for the three ETH modes, the quote token for paired launches.
    const unit = d.quote ? d.quote.symbol : "ETH";
    const unitDec = d.quote ? d.quote.decimals : 18;
    const fmtUnit = (bn) => fmtEth(Number(ethers.formatUnits(bn, unitDec)));

    main.innerHTML = `
      <a class="back-link" href="explore.html#/explore">← Explore</a>

      <div class="token-head">
        ${meta.imageUrl ? `<img class="token-detail-thumb" src="${meta.imageUrl}" onerror="this.outerHTML='<div class=&quot;token-detail-thumb placeholder&quot;>${sym.slice(0, 2)}</div>'">` : `<div class="token-detail-thumb placeholder">${sym.slice(0, 2)}</div>`}
        <div class="token-head-main">
          <div class="token-title-row"><h1>$${sym}</h1>${typePill(ctx.type)}</div>
          <p class="token-name">${d.name}</p>
          <div class="token-ca-row">
            <code title="${tokenAddr}">${short(tokenAddr)}</code>
            <button class="btn-mini" id="td-copy-ca" type="button">Copy CA</button>
            <a class="btn-mini" href="${explorerToken(tokenAddr)}" target="_blank">Explorer ↗</a>
          </div>
          <div class="token-social-row">
            ${meta.website ? `<a href="${meta.website}" target="_blank" class="btn-mini">Website ↗</a>` : ""}
            ${meta.twitter ? `<a href="${meta.twitter}" target="_blank" class="btn-mini">X ↗</a>` : ""}
            ${meta.telegram ? `<a href="${meta.telegram}" target="_blank" class="btn-mini">Telegram ↗</a>` : ""}
            ${meta.discord ? `<a href="${meta.discord}" target="_blank" class="btn-mini">Discord ↗</a>` : ""}
          </div>
        </div>
        <div class="token-head-side">
          <a class="btn btn-cute" href="${shareUrl}" target="_blank" rel="noopener">Share on X</a>
          <span class="token-launched">launched ${launchedAt ? timeAgo(launchedAt) : "—"}</span>
        </div>
      </div>

      ${tokenStatusStrip(ctx, d)}

      <div class="stat-grid token-stat-grid">
        <div class="stat-card">
          <div class="stat-label">Market Cap</div>
          <div class="stat-value">${d.quote
            ? (d.marketCapUsd != null ? fmtUsd(d.marketCapUsd) : (d.marketCapQuote != null ? fmtCompact(d.marketCapQuote) + " " + unit : "—"))
            : (d.marketCapUsd != null ? fmtUsd(d.marketCapUsd) : "—")}</div>
          <div class="stat-sub">${d.quote
            ? (d.marketCapUsd != null
                ? (d.marketCapUsdSource === "quote"
                    ? `via ${unit}'s price` + (d.marketCapQuote != null ? ` · ${fmtCompact(d.marketCapQuote)} ${unit}` : "")
                    : "via Dexscreener" + (d.marketCapQuote != null ? ` · ${fmtCompact(d.marketCapQuote)} ${unit}` : ""))
                : (d.priceSource || "no trades yet"))
            : (d.dex ? "via Dexscreener" : (d.marketCapEth != null ? fmtEth(d.marketCapEth) + " ETH · " + d.priceSource : "no trades yet"))}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Price</div>
          <div class="stat-value">${d.dex && d.dex.priceUsd != null ? "$" + d.dex.priceUsd.toPrecision(4) : (d.price != null ? d.price.toExponential(3) + " " + unit : "—")}</div>
          <div class="stat-sub ${d.change24h != null ? (up ? "pos" : "neg") : ""}">${d.change24h != null ? (up ? "+" : "") + d.change24h.toFixed(2) + "% · 24h" : "no 24h data"}${d.dex && d.dex.priceUsd != null && d.price != null ? ` · ${d.price.toExponential(3)} ${unit}` : ""}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">24H Volume</div>
          <div class="stat-value">${d.dex && d.dex.volume24hUsd != null ? fmtUsd(d.dex.volume24hUsd) : fmtUnit(d.history.volume24hEth) + " " + unit}</div>
          <div class="stat-sub">${d.dex && d.dex.txns24h != null ? `${d.dex.txns24h} trade${d.dex.txns24h === 1 ? "" : "s"} · via Dexscreener` : `${d.history.count24h} trade${d.history.count24h === 1 ? "" : "s"}`}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Liquidity</div>
          <div class="stat-value">${d.dex && d.dex.liquidityUsd != null ? fmtUsd(d.dex.liquidityUsd) : "—"}</div>
          <div class="stat-sub">${d.dex && d.dex.liquidityUsd != null ? "via Dexscreener" : (ctx.type === "curve" ? "on the curve" : "pool not indexed yet")}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">All-Time Trades</div>
          <div class="stat-value">${d.history.count}</div>
          <div class="stat-sub">${fmtUnit(d.history.volumeEth)} ${unit} total volume</div>
        </div>
      </div>

      <div class="chart-card token-dex-chart">
        <div class="chart-card-head">
          <h3>$${sym} / live chart</h3>
          <a href="${dexUrl}" target="_blank" class="chart-link">Open on Dexscreener ↗</a>
        </div>
        <div class="chart-embed chart-embed-lg">
          <iframe src="${dexEmbedUrl}" style="width:100%;height:100%;border:0;" title="$${sym} price chart" loading="lazy"></iframe>
        </div>
        <p class="chart-note">Brand-new pairs can take a few minutes to show up on Dexscreener. Not loading? <a href="${dexUrl}" target="_blank">Open it directly ↗</a> — the on-chain price chart below always works.</p>
      </div>

      <div class="token-layout">
        <div class="token-chart">
          <div class="chart-card">
            <div class="chart-card-head">
              <h3>Price <span class="muted">(${unit} per token)</span></h3>
              ${d.price != null ? `<span class="chart-price ${d.change24h == null ? "" : (up ? "pos" : "neg")}">${d.price.toExponential(3)} ${unit}</span>` : ""}
            </div>
            ${d.history.prices.length > 1 ? buildPriceChartSvg(d.history.prices) : `<div class="empty-state" style="padding:32px 0">No trades yet — be the first to buy $${sym}.</div>`}
          </div>
        </div>

        <div class="token-trade">
          <div class="trade-card" id="trade-card">${renderTradeCard(ctx, d)}</div>
        </div>

        <div class="token-rest">
          <div class="about-card">
            <h3>About</h3>
            <p>${meta.description ? meta.description : "No description provided."}</p>
            <p class="stat-sub how-it-trades">${t.how(sym, d.curve ? { threshold: ethers.formatEther(d.curve.threshold) } : { quoteSymbol: unit })}</p>
          </div>

          <div class="details-card">
            <h3>Details</h3>
            <div class="details-grid">
              <div class="dt">Contract</div><div class="dd"><a class="mono-link" href="${explorerToken(tokenAddr)}" target="_blank">${tokenAddr}</a></div>
              <div class="dt">Creator</div><div class="dd">${meta.creator ? `<a class="mono-link" href="${explorerAddr(meta.creator)}" target="_blank">${meta.creator}</a>` : "—"}</div>
              <div class="dt">Launched</div><div class="dd">${launchedDate}${launchedAt ? ` · ${timeAgo(launchedAt)}` : ""}</div>
              <div class="dt">Launch type</div><div class="dd">${typePill(ctx.type)}</div>
              <div class="dt">Trade fee (rent)</div><div class="dd">${feePct(d.feeBps)}% per trade → ${feePct(d.feeCreatorBps)}% creator · ${feePct(d.feeHomeBps)}% $HOME</div>
              <div class="dt">Total supply</div><div class="dd">${fmtTokens(d.totalSupply)} $${sym} · fixed, no mint</div>
              ${d.quote ? `<div class="dt">Priced in</div><div class="dd">${d.quote.symbol} · <a class="mono-link" href="${explorerToken(d.quote.address)}" target="_blank">${d.quote.address}</a></div>` : ""}
              <div class="dt">${ctx.type === "curve" ? "Curve" : "Pool"}</div><div class="dd">${ctx.type === "curve" ? `<a class="mono-link" href="${explorerAddr(ctx.curveAddr)}" target="_blank">${ctx.curveAddr}</a>` : `Uniswap v4${ctx.hookAddress ? ` · <a class="mono-link" href="${explorerAddr(ctx.hookAddress)}" target="_blank">hook ${short(ctx.hookAddress)}</a>` : ""} · <a class="mono-link" href="${explorerAddr(ctx.routerAddress)}" target="_blank">router ${short(ctx.routerAddress)}</a>`}</div>
              <div class="dt">Liquidity</div><div class="dd">${ctx.type === "curve" ? (d.curve.graduated ? "burned in the v4 pool" : `${Number(ethers.formatEther(d.curve.curveEth)).toFixed(4)} ETH in the curve`) : "permanently locked — no withdraw function"}</div>
              <div class="dt">$HOME treasury holds</div><div class="dd">${fmtTokens(d.homeBalance)} $${sym}${ctx.type === "hybrid" || ctx.type === "instant" ? ` <span class="muted">· from buy-side rent</span>` : ""}</div>
              ${ctx.type === "hybrid" || ctx.type === "instant" ? `<div class="dt">8% launch allocation</div><div class="dd">${(d.burnedBalance || 0n) >= LAUNCH_ALLOCATION ? `burned ✓ <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/address/${BURN_ADDRESS}" target="_blank">${fmtTokens(d.burnedBalance)} $${sym} at 0x…dEaD</a>` : `held by the treasury, to be burned by hand until the lock contract ships`}</div>` : ""}
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-card-head"><h3>Recent Trades</h3></div>
            ${buildTradesTable(d.history.trades, sym, d.quote)}
          </div>
        </div>
      </div>
    `;

    document.getElementById("td-copy-ca").onclick = (e) => {
      navigator.clipboard.writeText(tokenAddr);
      const b = e.currentTarget; b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy CA"), 1200);
    };
    wireTradeCard(ctx, d);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="empty-state">Couldn't load this token.<div class="err-detail">${String(err && (err.shortMessage || err.message) || err).slice(0, 240)}</div></div>`;
  }
}

// ---- Trade card (one form; the quote + the send differ by type) ----

/// Exact replay of BondingCurveV4.buy()/sell() math, so the estimate is
/// what the contract will actually do (before the block moves).
/// Applies a slippage-tolerance percentage to an exact amount, for minOut.
/// slippageBps is basis points of ROOM given up (e.g. 300 = 3% tolerance),
/// so minOut = exact * (1 - slippage).
function applySlippage(exactAmount, slippageBps) {
  return (exactAmount * (10000n - slippageBps)) / 10000n;
}

function curveQuote(d, mode, amountWei) {
  const { vE, vT, curveEth } = d.curve;
  const fee = BigInt(d.feeBps);
  const k = vE * vT;
  if (mode === "buy") {
    const feeAmt = (amountWei * fee) / 10000n;
    const ethIn = amountWei - feeAmt;
    const newVE = vE + ethIn;
    const newVT = k / newVE;
    return vT - newVT;
  }
  const newVT = vT + amountWei;
  const newVE = k / newVT;
  let gross = vE - newVE;
  if (gross > curveEth) gross = curveEth;
  const feeAmt = (gross * fee) / 10000n;
  return gross - feeAmt;
}

function renderTradeCard(ctx, d) {
  const sym = d.symbol;
  if (ctx.type === "curve" && d.curve.graduated) {
    return `<div class="trade-tabs"><div class="trade-tab active-buy">Graduated</div></div>
      <p class="stat-sub">This curve has graduated. $${sym} now trades on its Uniswap v4 pool.</p>
      <a class="btn btn-primary" style="width:100%;justify-content:center;margin-top:12px" href="${CONFIG.BLOCK_EXPLORER}/token/${ctx.tokenAddr}" target="_blank">View on explorer</a>`;
  }
  const buy = tradeMode === "buy";
  const unit = d.quote ? d.quote.symbol : "ETH";
  const unitDec = d.quote ? d.quote.decimals : 18;
  const spendBal = d.quote ? d.userQuote : d.userEth;
  const bal = state.account
    ? (buy
        ? (spendBal != null ? `${Number(ethers.formatUnits(spendBal, unitDec)).toFixed(4)} ${unit}` : "—")
        : (d.userBalance != null ? `${Number(ethers.formatEther(d.userBalance)).toLocaleString("en-US", { maximumFractionDigits: 0 })} $${sym}` : "—"))
    : "connect wallet";
  const buyPresets = d.quote ? ["0.1", "0.5", "1", "5"] : ["0.01", "0.05", "0.1", "0.5"];
  const chips = buy
    ? buyPresets.map((v) => `<button type="button" class="chip" data-eth="${v}">${v} ${unit}</button>`).join("")
    : ["25", "50", "100"].map((v) => `<button type="button" class="chip" data-pct="${v}">${v}%</button>`).join("");
  return `
    <div class="trade-tabs">
      <div class="trade-tab ${buy ? "active-buy" : ""}" id="tab-buy">Buy</div>
      <div class="trade-tab ${!buy ? "active-sell" : ""}" id="tab-sell">Sell</div>
    </div>
    <div class="field">
      <div class="field-head"><label id="amount-label">${buy ? `${unit} to spend` : `$${sym} to sell`}</label><span class="field-bal">Balance: ${bal}</span></div>
      <input id="amount-input" type="number" min="0" step="any" placeholder="0.0" inputmode="decimal">
      <div class="chip-row">${chips}</div>
    </div>
    <div class="quote-row"><span>You receive</span><strong id="quote-out">—</strong></div>
    <div class="quote-note" id="quote-note">${ctx.type === "curve" ? "Exact quote from the curve formula, before the block moves." : "Estimate at " + (d.priceSource || "current price") + " — real fill depends on pool depth."}${d.quote && buy ? ` First buy needs a one-time ${unit} approval.` : ""}</div>
    <div class="field">
      <label>Slippage tolerance</label>
      <select id="slippage" class="quote-select">
        <option value="1">1%</option>
        <option value="3" selected>3%</option>
        <option value="5">5%</option>
        <option value="10">10%</option>
      </select>
    </div>
    <button class="btn ${buy ? "btn-primary" : "btn-sell"}" id="trade-btn" style="width:100%;justify-content:center">${buy ? `Buy $${sym}` : `Sell $${sym}`}</button>
    <p class="trade-fee-note">${(d.feeBps / 100).toFixed(d.feeBps % 100 === 0 ? 0 : 2)}% fee on this trade — ${(d.feeCreatorBps / 100).toFixed(2)}% to the creator, ${(d.feeHomeBps / 100).toFixed(2)}% to $HOME. ${buy ? `Taken from the $${sym} you receive.` : `Taken from the ${unit} you receive.`}</p>
    <div id="trade-status"></div>
  `;
}

function wireTradeCard(ctx, d) {
  const card = document.getElementById("trade-card");
  if (!card) return;
  const tokenAddr = ctx.tokenAddr;
  const sym = d.symbol;
  const tabBuy = document.getElementById("tab-buy");
  const tabSell = document.getElementById("tab-sell");
  if (!tabBuy || !tabSell) return; // graduated card — nothing to wire

  const rerender = (mode) => { tradeMode = mode; card.innerHTML = renderTradeCard(ctx, d); wireTradeCard(ctx, d); };
  tabBuy.onclick = () => rerender("buy");
  tabSell.onclick = () => rerender("sell");

  const input = document.getElementById("amount-input");
  const quoteOut = document.getElementById("quote-out");
  const statusEl = document.getElementById("trade-status");

  // quick-amount chips
  card.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      if (chip.dataset.eth) input.value = chip.dataset.eth;
      else if (chip.dataset.pct && d.userBalance != null) {
        const pct = BigInt(chip.dataset.pct);
        input.value = ethers.formatEther((d.userBalance * pct) / 100n);
      }
      updateQuote();
    };
  });

  function updateQuote() {
    const v = input.value;
    if (!v || Number(v) <= 0) { quoteOut.textContent = "—"; return; }
    try {
      const unit = d.quote ? d.quote.symbol : "ETH";
      if (tradeMode === "buy") {
        let out;
        if (ctx.type === "curve") out = Number(ethers.formatEther(curveQuote(d, "buy", ethers.parseEther(v))));
        else if (d.price) out = (Number(v) * (1 - d.feeBps / 10000)) / d.price;
        quoteOut.textContent = out != null ? `≈ ${out.toLocaleString("en-US", { maximumFractionDigits: 0 })} $${sym}` : "—";
      } else {
        const tokens = ethers.parseUnits(v, 18);
        let out;
        if (ctx.type === "curve") out = Number(ethers.formatEther(curveQuote(d, "sell", tokens)));
        else if (d.price) out = Number(v) * d.price * (1 - d.feeBps / 10000);
        quoteOut.textContent = out != null ? `≈ ${out.toFixed(6)} ${unit}` : "—";
      }
    } catch { quoteOut.textContent = "—"; }
  }
  input.oninput = updateQuote;

  document.getElementById("trade-btn").onclick = async () => {
    const amountStr = input.value;
    const slippageBps = BigInt(Math.round(Number(document.getElementById("slippage").value) * 100));
    if (!amountStr || Number(amountStr) <= 0) { statusEl.innerHTML = `<div class="status error">Enter an amount.</div>`; return; }
    if (!state.signer) { statusEl.innerHTML = `<div class="status error">Connect a wallet first.</div>`; return; }

    const txLink = (hash) => `<a href="${CONFIG.BLOCK_EXPLORER}/tx/${hash}" target="_blank" style="color:inherit">view tx</a>`;
    const done = (msg) => { statusEl.innerHTML = `<div class="status info">${msg} Refreshing…</div>`; setTimeout(() => renderTokenDetail(tokenAddr), 1200); };

    try {
      if (ctx.type === "curve") {
        // ---- bonding curve: exact min-out from the quote, and success is
        // detected by polling the curve's own state (the wallet path's
        // confirmation promise has been seen to hang after success). ----
        const curveContract = curveRead(ctx.curveAddr);
        const curveAddr = ctx.curveAddr;
        const waitForChange = (readFn, isChanged, getTxPromise) => new Promise((resolve, reject) => {
          let settled = false;
          const ok = () => { if (!settled) { settled = true; resolve(); } };
          const bad = (e) => { if (!settled) { settled = true; reject(e); } };
          (async () => {
            try {
              const tx = await getTxPromise();
              if (tx?.hash) statusEl.innerHTML = `<div class="status pending">Confirming… ${txLink(tx.hash)}</div>`;
              await tx.wait(); ok();
            } catch (e) { bad(e); }
          })();
          (async () => {
            while (!settled) {
              await new Promise((r) => setTimeout(r, 3000));
              try { if (isChanged(await readFn())) { ok(); return; } } catch { /* keep polling */ }
            }
          })();
        });

        if (tradeMode === "buy") {
          const ethIn = ethers.parseEther(amountStr);
          const minOut = applySlippage(curveQuote(d, "buy", ethIn), slippageBps);
          const before = await curveContract.ethRaised();
          statusEl.innerHTML = `<div class="status pending">Confirm in your wallet…</div>`;
          await waitForChange(() => curveContract.ethRaised(), (v) => v !== before, async () => {
            let t = typeof tryWagmiWrite === "function"
              ? await withTimeoutHint(tryWagmiWrite({ address: curveAddr, abi: BONDING_CURVE_ABI, functionName: "buy", args: [minOut, state.account], value: ethIn }), statusEl)
              : null;
            if (!t) { const o = await getTxOverrides(300_000n); t = await curveWrite(curveAddr).buy(minOut, state.account, { ...o, value: ethIn }); }
            return t;
          });
          done("Bought.");
        } else {
          const tokenAmount = ethers.parseUnits(amountStr, 18);
          const minOut = applySlippage(curveQuote(d, "sell", tokenAmount), slippageBps);
          const tokenContract = tokenWrite(tokenAddr);
          const tokenReadContract = tokenRead(tokenAddr);
          const allowance = await tokenReadContract.allowance(state.account, curveAddr);
          if (allowance < tokenAmount) {
            statusEl.innerHTML = `<div class="status pending">Approving…</div>`;
            await waitForChange(() => tokenReadContract.allowance(state.account, curveAddr), (v) => v >= tokenAmount, async () => {
              let t = typeof tryWagmiWrite === "function"
                ? await withTimeoutHint(tryWagmiWrite({ address: tokenAddr, abi: ERC20_ABI, functionName: "approve", args: [curveAddr, tokenAmount], value: 0n }), statusEl)
                : null;
              if (!t) { const o = await getTxOverrides(100_000n); t = await tokenContract.approve(curveAddr, tokenAmount, o); }
              return t;
            });
          }
          const before = await curveContract.ethRaised();
          statusEl.innerHTML = `<div class="status pending">Confirm the sell in your wallet…</div>`;
          await waitForChange(() => curveContract.ethRaised(), (v) => v !== before, async () => {
            let t = typeof tryWagmiWrite === "function"
              ? await withTimeoutHint(tryWagmiWrite({ address: curveAddr, abi: BONDING_CURVE_ABI, functionName: "sell", args: [tokenAmount, minOut], value: 0n }), statusEl)
              : null;
            if (!t) { const o = await getTxOverrides(300_000n); t = await curveWrite(curveAddr).sell(tokenAmount, minOut, o); }
            return t;
          });
          done("Sold.");
        }
      } else if (ctx.type === "paired") {
        // ---- Stock pair: quote token in/out through the paired router.
        // Buys need a one-time approval of the quote token; sells need the
        // usual approval of the launched token. Same static-call-quote
        // pattern as Hybrid/Instant below — exact amountOut from a
        // simulated call, slippage tolerance applied to that for minOut. ----
        const routerW = new ethers.Contract(ctx.routerAddress, PAIRED_SWAP_ROUTER_ABI, state.signer);
        const unitDec = d.quote.decimals;
        if (tradeMode === "buy") {
          const quoteIn = ethers.parseUnits(amountStr, unitDec);
          const quoteRead = tokenRead(ctx.quoteToken);
          const allowance = await quoteRead.allowance(state.account, ctx.routerAddress);
          if (allowance < quoteIn) {
            statusEl.innerHTML = `<div class="status pending">Approve ${d.quote.symbol} in your wallet…</div>`;
            const a = await tokenWrite(ctx.quoteToken).approve(ctx.routerAddress, quoteIn);
            await a.wait();
          }
          const exactOut = await routerW.buy.staticCall(tokenAddr, quoteIn, 0);
          const minOut = applySlippage(exactOut, slippageBps);
          statusEl.innerHTML = `<div class="status pending">Confirm the buy in your wallet…</div>`;
          const tx = await routerW.buy(tokenAddr, quoteIn, minOut, { gasLimit: 450_000n });
          statusEl.innerHTML = `<div class="status pending">Buying… ${txLink(tx.hash)}</div>`;
          await tx.wait();
          done("Bought.");
        } else {
          const tokenAmount = ethers.parseUnits(amountStr, 18);
          const allowance = await tokenRead(tokenAddr).allowance(state.account, ctx.routerAddress);
          if (allowance < tokenAmount) {
            statusEl.innerHTML = `<div class="status pending">Approving…</div>`;
            const a = await tokenWrite(tokenAddr).approve(ctx.routerAddress, tokenAmount);
            await a.wait();
          }
          const exactOut = await routerW.sell.staticCall(tokenAddr, tokenAmount, 0);
          const minOut = applySlippage(exactOut, slippageBps);
          statusEl.innerHTML = `<div class="status pending">Confirm the sell in your wallet…</div>`;
          const tx = await routerW.sell(tokenAddr, tokenAmount, minOut, { gasLimit: 450_000n });
          statusEl.innerHTML = `<div class="status pending">Selling… ${txLink(tx.hash)}</div>`;
          await tx.wait();
          done("Sold.");
        }
      } else {
        // ---- Hybrid / Instant: through the mode's own swap router. No
        // on-chain view/quoter exists for a v4 swap, so the exact output
        // is found the same way Uniswap's own frontend does it for pools
        // without a dedicated quoter — a static call (eth_call) of the
        // real swap, which runs the exact same code path and returns the
        // exact amountOut without sending a transaction. Slippage
        // tolerance is applied to THAT exact number for minOut, so this
        // trade is now protected against sandwiching the same way the
        // curve path always was. ----
        const routerW = new ethers.Contract(ctx.routerAddress, SWAP_ROUTER_ABI, state.signer);
        if (tradeMode === "buy") {
          const ethIn = ethers.parseEther(amountStr);
          const exactOut = await routerW.buy.staticCall(tokenAddr, 0, { value: ethIn });
          const minOut = applySlippage(exactOut, slippageBps);
          statusEl.innerHTML = `<div class="status pending">Confirm in your wallet…</div>`;
          const tx = await routerW.buy(tokenAddr, minOut, { value: ethIn, gasLimit: 400_000n });
          statusEl.innerHTML = `<div class="status pending">Buying… ${txLink(tx.hash)}</div>`;
          await tx.wait();
          done("Bought.");
        } else {
          const tokenAmount = ethers.parseUnits(amountStr, 18);
          const allowance = await tokenRead(tokenAddr).allowance(state.account, ctx.routerAddress);
          if (allowance < tokenAmount) {
            statusEl.innerHTML = `<div class="status pending">Approving…</div>`;
            const a = await tokenWrite(tokenAddr).approve(ctx.routerAddress, tokenAmount);
            await a.wait();
          }
          const exactOut = await routerW.sell.staticCall(tokenAddr, tokenAmount, 0);
          const minOut = applySlippage(exactOut, slippageBps);
          statusEl.innerHTML = `<div class="status pending">Confirm the sell in your wallet…</div>`;
          const tx = await routerW.sell(tokenAddr, tokenAmount, minOut, { gasLimit: 400_000n });
          statusEl.innerHTML = `<div class="status pending">Selling… ${txLink(tx.hash)}</div>`;
          await tx.wait();
          done("Sold.");
        }
      }
    } catch (err) {
      console.error(err);
      statusEl.innerHTML = `<div class="status error">${err.shortMessage || err.message || "Transaction failed."}</div>`;
    }
  };
}


/// Same idea as buildTradeHistory for the bonding curve, but sourced from
/// HomepadSwapRouter's own Swap event (trader, token, zeroForOne, amountIn,
/// amountOut) — the router is the only path trades go through, so its
/// events are a complete and accurate record without needing to touch
/// PoolManager's own (trader-less, since it'd show the router's address)
/// Swap event at all.
/// Paired-router version of buildInstantTradeHistory. The Swap event here is
/// (trader, token, zeroForOne, isBuy, amountIn, amountOut) — `isBuy` is the
/// direction (quote in / token out) since zeroForOne alone depends on which
/// side the quote sorted to. Amounts are in the quote token's own units;
/// `ethAmount` is kept as the field name so buildTradesTable can render
/// these unchanged, but it means "quote amount" here.
async function buildPairedTradeHistory(tokenAddr, router, quoteDecimals, factory) {
  // poolKeyOf gives the exact currency0/currency1/fee/tickSpacing/hooks the
  // pool was created with — no need to re-derive the quote/token ordering
  // by comparing addresses ourselves.
  const key = await factory.poolKeyOf(tokenAddr);
  const quoteIsCurrency0 = key.currency0.toLowerCase() !== tokenAddr.toLowerCase();
  const poolId = computePoolId(key.currency0, key.currency1, Number(key.fee), Number(key.tickSpacing), key.hooks);

  const [pmSwaps, routerSwaps] = await Promise.all([
    poolManagerSwapsForToken(key.hooks, poolId),
    router.queryFilter(router.filters.Swap(null, tokenAddr), await firstHomepadBlock(), "latest"),
  ]);
  if (pmSwaps.length === 0) {
    return { prices: [], trades: [], volumeEth: 0n, count: 0, volume24hEth: 0n, count24h: 0 };
  }

  const traderFor = matchRouterTrader(pmSwaps, routerSwaps);
  const sorted = [...pmSwaps].sort(logOrder);
  const uniqueBlocks = [...new Set(sorted.map((e) => e.blockNumber))];
  const blocks = await Promise.all(uniqueBlocks.map((bn) => readProvider().getBlock(bn)));
  const blockTime = new Map(uniqueBlocks.map((bn, i) => [bn, Number(blocks[i].timestamp)]));

  const scale = 10 ** (18 - Number(quoteDecimals ?? 18)); // price = quote-per-token in human units
  const prices = [], trades = [];
  let volumeEth = 0n, volume24hEth = 0n, count24h = 0;
  const nowSec = Math.floor(Date.now() / 1000);
  for (const e of sorted) {
    const { amount0, amount1 } = e.args;
    const quoteDelta = quoteIsCurrency0 ? amount0 : amount1;
    const tokenDelta = quoteIsCurrency0 ? amount1 : amount0;
    const isBuy = quoteDelta < 0n; // swapper paid the quote token, received the launched token
    const quoteAmount = absBig(quoteDelta);
    const tokenAmount = absBig(tokenDelta);
    const ts = blockTime.get(e.blockNumber);
    const price = tokenAmount > 0n ? (Number(quoteAmount) / Number(tokenAmount)) * scale : 0;
    prices.push(price);
    trades.push({ kind: isBuy ? "buy" : "sell", address: traderFor.get(e), ethAmount: quoteAmount, tokenAmount, ts, txHash: e.transactionHash, priceAfter: price });
    volumeEth += quoteAmount;
    if (nowSec - ts <= 86400) { volume24hEth += quoteAmount; count24h++; }
  }
  trades.reverse();
  return { prices, trades, volumeEth, count: sorted.length, volume24hEth, count24h };
}

async function buildInstantTradeHistory(tokenAddr, router) {
  router = router || swapRouterRead();
  const hookAddr = await router.hook();
  // Every HOMEPAD deployment (current and legacy) uses tickSpacing 60 — same
  // constant every other poolId computation in this file/rent.js hardcodes,
  // not fetched fresh each time.
  const poolId = computePoolId(ethers.ZeroAddress, tokenAddr, 0, 60, hookAddr);

  const [pmSwaps, routerSwaps] = await Promise.all([
    poolManagerSwapsForToken(hookAddr, poolId),
    router.queryFilter(router.filters.Swap(null, tokenAddr), await firstHomepadBlock(), "latest"),
  ]);

  if (pmSwaps.length === 0) {
    return { prices: [], trades: [], volumeEth: 0n, count: 0, volume24hEth: 0n, count24h: 0 };
  }

  const traderFor = matchRouterTrader(pmSwaps, routerSwaps);
  const sorted = [...pmSwaps].sort(logOrder);
  const uniqueBlocks = [...new Set(sorted.map((e) => e.blockNumber))];
  const blocks = await Promise.all(uniqueBlocks.map((bn) => readProvider().getBlock(bn)));
  const blockTime = new Map(uniqueBlocks.map((bn, i) => [bn, Number(blocks[i].timestamp)]));

  const prices = [];
  const trades = [];
  let volumeEth = 0n;
  let volume24hEth = 0n;
  let count24h = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  for (const e of sorted) {
    const { amount0, amount1 } = e.args; // currency0 is always ETH (address zero sorts first)
    const isBuy = amount0 < 0n; // swapper paid ETH, received the token
    const ethAmount = absBig(amount0);
    const tokenAmount = absBig(amount1);
    const ts = blockTime.get(e.blockNumber);
    const isRecent = nowSec - ts <= 86400;
    const price = tokenAmount > 0n ? Number(ethAmount) / Number(tokenAmount) : 0; // ETH per token

    prices.push(price);
    trades.push({ kind: isBuy ? "buy" : "sell", address: traderFor.get(e), ethAmount, tokenAmount, ts, txHash: e.transactionHash, priceAfter: price });
    volumeEth += ethAmount;
    if (isRecent) { volume24hEth += ethAmount; count24h++; }
  }
  trades.reverse(); // most recent first, for display

  return { prices, trades, volumeEth, count: sorted.length, volume24hEth, count24h };
}

/// Each Buy/Sell event carries exactly the numbers the contract itself
/// used to update its reserves, so replaying them from the known starting
/// reserves reconstructs the real price after every trade — not an
/// approximation. Also returns basic volume/trade-count stats.
async function buildTradeHistory(curveAddr, initialVirtualEth, totalSupply) {
  const curve = curveRead(curveAddr);
  const [buyEvents, sellEvents] = await Promise.all([
    curve.queryFilter(curve.filters.Buy(), await firstHomepadBlock(), "latest"),
    curve.queryFilter(curve.filters.Sell(), await firstHomepadBlock(), "latest"),
  ]);
  const all = [...buyEvents.map((e) => ({ e, kind: "buy" })), ...sellEvents.map((e) => ({ e, kind: "sell" }))]
    .sort((a, b) => a.e.blockNumber - b.e.blockNumber || a.e.index - b.e.index);

  const startPrice = Number(initialVirtualEth) / Number(totalSupply);
  if (all.length === 0) {
    return { prices: [startPrice], volumeEth: 0n, count: 0, volume24hEth: 0n, count24h: 0, trades: [], startPrice };
  }

  const uniqueBlocks = [...new Set(all.map((x) => x.e.blockNumber))];
  const blocks = await Promise.all(uniqueBlocks.map((bn) => readProvider().getBlock(bn)));
  const blockTime = new Map(uniqueBlocks.map((bn, i) => [bn, Number(blocks[i].timestamp)]));

  let ve = initialVirtualEth;
  let vt = totalSupply;
  const prices = [startPrice];
  const trades = [];
  let volumeEth = 0n;
  let volume24hEth = 0n;
  let count24h = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  for (const { e, kind } of all) {
    const ts = blockTime.get(e.blockNumber);
    const isRecent = nowSec - ts <= 86400;
    let address, ethAmount, tokenAmount;
    if (kind === "buy") {
      const { buyer, ethIn, feePaid, tokensOut } = e.args;
      ve = ve + (ethIn - feePaid);
      vt = vt - tokensOut;
      volumeEth += ethIn;
      if (isRecent) { volume24hEth += ethIn; count24h++; }
      address = buyer; ethAmount = ethIn; tokenAmount = tokensOut;
    } else {
      const { seller, tokensIn, feePaid, ethOut } = e.args;
      const ethOutGross = ethOut + feePaid;
      ve = ve - ethOutGross;
      vt = vt + tokensIn;
      volumeEth += ethOutGross;
      if (isRecent) { volume24hEth += ethOutGross; count24h++; }
      address = seller; ethAmount = ethOutGross; tokenAmount = tokensIn;
    }
    prices.push(Number(ve) / Number(vt));
    trades.push({ kind, address, ethAmount, tokenAmount, ts, txHash: e.transactionHash, priceAfter: prices.at(-1) });
  }
  trades.reverse(); // most recent first, for display

  return { prices, volumeEth, count: all.length, volume24hEth, count24h, trades, startPrice };
}

/// Small inline SVG line chart with a soft fill underneath — no charting
/// library, consistent with the rest of this build-tool-free site.
function buildPriceChartSvg(prices) {
  const w = 600, h = 170, pad = 10;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = (max - min) || max * 0.1 || 1e-18;
  const stepX = prices.length > 1 ? (w - pad * 2) / (prices.length - 1) : 0;
  const pts = prices.map((p, i) => [
    pad + i * stepX,
    pad + (h - pad * 2) * (1 - (p - min) / range),
  ]);
  const up = prices.at(-1) >= prices[0];
  const color = up ? "#39ff88" : "#ff6b6b";
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts.at(-1)[0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
  const gradId = "chartFade" + Math.random().toString(36).slice(2, 8);
  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:150px;display:block">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${gradId})" stroke="none"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  `;
}

function fmtEth(n) {
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(4);
  if (n < 1000) return n.toFixed(3);
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/// Who bought/sold, when, and how much — reconstructed from the same
/// event logs the price chart uses, so there's no separate indexer or
/// data source to keep in sync.
function buildTradesTable(trades, symbol, quote) {
  // `quote` = { symbol, decimals } for paired tokens; defaults to ETH
  const qSym = quote?.symbol || "ETH";
  const qDec = quote?.decimals ?? 18;
  if (trades.length === 0) {
    return `<div class="empty-state" style="padding:24px 0">No trades yet.</div>`;
  }
  const rows = trades.slice(0, 25).map((t) => `
    <div class="trade-row">
      <span class="trade-kind ${t.kind}">${t.kind === "buy" ? "Buy" : "Sell"}</span>
      <a href="${CONFIG.BLOCK_EXPLORER}/address/${t.address}" target="_blank" class="mono-link trade-addr">${short(t.address)}</a>
      <span class="trade-amt">${fmtEth(Number(ethers.formatUnits(t.ethAmount, qDec)))} ${qSym}</span>
      <span class="trade-tokens">${fmtEth(Number(ethers.formatUnits(t.tokenAmount, 18)))} $${symbol}</span>
      <a href="${CONFIG.BLOCK_EXPLORER}/tx/${t.txHash}" target="_blank" class="trade-time">${timeAgo(t.ts)}</a>
    </div>
  `).join("");
  return `
    <div class="trade-table-head">
      <span>Type</span><span>Wallet</span><span>Amount</span><span>Tokens</span><span>Time</span>
    </div>
    ${rows}
    ${trades.length > 25 ? `<p class="stat-sub" style="text-align:center;margin-top:10px">Showing 25 most recent of ${trades.length} trades.</p>` : ""}
  `;
}

// ---------- Boot ----------

renderHeader();
route();
