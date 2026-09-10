// ---------- Proof of Rent dashboard ----------
// Every number on this page comes from an on-chain event — Buy/Sell.feePaid
// on bonding-curve instances, FeeRouted(poolId, toCreator, toHome,
// toPlatform) on the v4 hooks (shared across every Hybrid/Instant/Paired
// pool, filtered locally by a poolId this file computes itself — the event
// only carries the poolId, not the token address). Nothing here is
// estimated or extrapolated.
//
// One thing FeeRouted does NOT carry is WHICH currency the fee was taken
// in. The hooks take their cut from the swap's OUTPUT side
// (`feeCurrency = zeroForOne ? currency1 : currency0`), so on a BUY
// (ETH -> token) the rent is collected in the launched token, and on a
// SELL (token -> ETH) it's collected in ETH. Reading every FeeRouted amount
// as ETH is how this page once showed "1,350,035 ETH" of rent — that was
// ~1.35M launched tokens from a few dev buys. So this file joins each
// FeeRouted to the PoolManager's own Swap event in the same transaction
// (same poolId), which is emitted for EVERY swap in the pool regardless of
// who initiated it — our router, the factory's launchAndBuy dev buy, or a
// third-party trade straight through Uniswap — and whose amount0 sign
// gives the direction. Token-denominated rent is then valued in ETH at
// that same swap's own execution price (|amount0| / |amount1|), which is
// still a number from that exact transaction, not an oracle or an
// estimate. Each event row shows both the native amount and the ETH value.
// The same PoolManager Swap events also give total volume, which the old
// router-only Swap query missed for dev buys and external trades.
//
// $HOME buyback / POL are NOT computed here on purpose: the rent-to-$HOME
// leg (contracts/scripts/distribute-rent.js) is a manual script, not yet
// wired to run automatically, so there is no on-chain buyback/POL event to
// point at yet. Showing a number for those would be showing something
// that hasn't actually happened — the page says so plainly instead.

/// Same poolId formula as computePoolId in app.js, duplicated only because
/// rent.html doesn't load the parts of app.js that need a live provider —
/// this file is deliberately self-contained.
function rentPoolId(currency0, currency1, fee, tickSpacing, hooks) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [currency0, currency1, fee, tickSpacing, hooks]
    )
  );
}

const sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Bumped whenever this file's data path changes, and printed with every
// rent log line — after a day of cache-busting mishaps, a screenshot of a
// stale build needs to be recognisable as stale.
const RENT_JS_VERSION = "r9";

/// A non-event row for Recent Rent Events that explains a load failure in
/// plain words instead of the page silently showing 0 for everything.
function statusRow(typeLabel, text, ts) {
  return { symbol: "⚠", token: null, typeLabel, amount: 0n, decimals: 18, unit: text, ethValue: null, txHash: null, ts };
}
function shortErr(err) {
  const m = String((err && (err.shortMessage || err.message)) || err);
  // ethers wraps RPC failures as "could not coalesce error (error={ ...message... })" — pull the RPC's own words out
  const inner = /"message":\s*"([^"]+)"/.exec(m);
  return (inner ? inner[1] : m).slice(0, 80) + ` · ${RENT_JS_VERSION}`;
}
// Fee-currency handling (poolManagerSwapsFor / valueFeeRoutedEvents /
// absBig) lives in app.js so Profile's creator-fee total uses the exact
// same logic as this page.

/// Fetches block timestamps for a batch of events, one RPC call per
/// *unique* block rather than per event — the same optimization every
/// trade-history builder elsewhere on the site already uses.
async function blockTimestamps(events) {
  const uniqueBlocks = [...new Set(events.map((e) => e.blockNumber))];
  const blocks = await Promise.all(uniqueBlocks.map((bn) => readProvider().getBlock(bn)));
  return new Map(uniqueBlocks.map((bn, i) => [bn, Number(blocks[i].timestamp)]));
}

/// What the $HOME treasury actually holds from rent — read straight from
/// the wallet, no event logs involved, so it can't be knocked out by the
/// RPC's log-query limits the way the event-based totals below can be.
///
/// The hook pays the treasury its cut of every swap in the swap's OUTPUT
/// currency: a sell pays ETH, a buy pays the launched token. So the
/// treasury's rent is its ETH balance plus, per launch, its token balance
/// minus the fixed 8% supply allocation every launch sends it at creation
/// (HOME_ALLOCATION_BPS — that part isn't rent). Tokens are valued in ETH
/// at the pair's current Dexscreener price; a token with no price yet is
/// listed by amount only.
async function computeTreasuryRent(launches) {
  const treasury = CONFIG.HOME_TREASURY_ADDRESS;
  const provider = readProvider();
  const entries = launches.filter((e) => (e.type === "hybrid" || e.type === "instant") && e.token);

  const [ethBalance, balances, burned, dex] = await Promise.all([
    withRetry(() => provider.getBalance(treasury)),
    Promise.all(entries.map((e) => withRetry(() => tokenRead(e.token).balanceOf(treasury)).catch(() => null))),
    Promise.all(entries.map((e) => withRetry(() => tokenRead(e.token).balanceOf(BURN_ADDRESS)).catch(() => 0n))),
    entries.length ? fetchDexscreenerStats(entries.map((e) => e.token)).catch(() => new Map()) : new Map(),
  ]);

  // Launch-time allocation per factory (a public constant) — read once per
  // factory, falling back to the value config.js mirrors for display.
  const allocByFactory = new Map();
  for (const e of entries) {
    if (!e.factoryAddress || allocByFactory.has(e.factoryAddress.toLowerCase())) continue;
    let bps = CONFIG.INSTANT_HOME_ALLOCATION_BPS || 800;
    try {
      const f = new ethers.Contract(e.factoryAddress, ["function HOME_ALLOCATION_BPS() view returns (uint16)"], provider);
      bps = Number(await withRetry(() => f.HOME_ALLOCATION_BPS()));
    } catch { /* keep the config mirror */ }
    allocByFactory.set(e.factoryAddress.toLowerCase(), BigInt(bps));
  }
  const DEFAULT_SUPPLY = 1_000_000_000n * 10n ** 18n;

  const tokens = [];
  let tokensEthValue = 0n;
  let unvalued = 0;
  entries.forEach((e, i) => {
    const bal = balances[i];
    if (bal == null) return;
    const bps = allocByFactory.get((e.factoryAddress || "").toLowerCase()) ?? 800n;
    const allocation = (DEFAULT_SUPPLY * bps) / 10000n;
    // Once the allocation has been burned (dead address holds >= it), the
    // treasury's whole balance is rent; until then, subtract the allocation.
    const allocationStillHeld = (burned[i] || 0n) >= allocation ? 0n : allocation;
    const feeTokens = bal > allocationStillHeld ? bal - allocationStillHeld : 0n;
    if (feeTokens === 0n) return;
    const stats = dex.get(e.token.toLowerCase());
    let ethValue = null;
    if (stats && stats.priceNative != null && stats.priceNative > 0) {
      // priceNative is ETH per token (float); keep it in wei-scale bigint
      ethValue = (feeTokens * BigInt(Math.round(stats.priceNative * 1e18))) / 10n ** 18n;
      tokensEthValue += ethValue;
    } else {
      unvalued++;
    }
    tokens.push({ symbol: e.symbol, token: e.token, feeTokens, ethValue });
  });

  return { ethBalance, tokens, tokensEthValue, totalEth: ethBalance + tokensEthValue, unvalued };
}

/// The 8% launch allocation, and what's been done with it — read from the
/// burn address (balanceOf(0x…dEaD) per launched token) and from each
/// token's own Transfer events into it. Both are tiny, bounded reads; no
/// PoolManager or hook logs involved.
/// Total ETH that has ever moved through a HOMEPAD pool — every Hybrid and
/// Instant launch, any route (our router, a dev buy, a third-party swap).
/// Pure activity, no fee split and no per-trade detail — the volume side of
/// what this page shows, next to the burn side.
async function computePlatformVolume(launches) {
  let totalVolumeEth = 0n;
  for (const [sourcesFn, type] of [[hybridFactorySources, "hybrid"], [instantFactorySources, "instant"]]) {
    for (const source of sourcesFn()) {
      try {
        const hookAddr = await source.router.hook();
        const hook = new ethers.Contract(hookAddr, HYBRID_HOOK_ABI, readProvider());
        const entries = launches.filter((e) => e.type === type && sameAddr(e.routerAddress, source.router.target));
        const poolIds = entries.map((e) => rentPoolId(ethers.ZeroAddress, e.token, 0, 60, hookAddr));
        const swaps = await poolManagerSwapsFor(hook, poolIds);
        for (const s of swaps) totalVolumeEth += absBig(s.args.amount0);
      } catch (err) {
        console.warn(`platform volume: ${type} source failed`, source.router.target, err);
      }
    }
  }
  return totalVolumeEth;
}

async function computeBurns(launches) {
  const treasury = CONFIG.HOME_TREASURY_ADDRESS;
  const featured = new Set((CONFIG.RENT_FEATURED_TOKENS || []).map((a) => a.toLowerCase()));
  const candidates = launches.filter((e) => (e.type === "hybrid" || e.type === "instant") && e.token);

  const [burnedAll, treasuryAll] = await Promise.all([
    Promise.all(candidates.map((e) => withRetry(() => tokenRead(e.token).balanceOf(BURN_ADDRESS)).catch(() => 0n))),
    Promise.all(candidates.map((e) => withRetry(() => tokenRead(e.token).balanceOf(treasury)).catch(() => 0n))),
  ]);

  // Show a launch if it's featured in config, or if its allocation has
  // actually been burned. Test launches that never will be stay out, and a
  // future real burn appears without a config edit. Featured first.
  const keep = candidates.map((e, i) => ({ e, burned: burnedAll[i], held: treasuryAll[i] }))
    .filter((x) => featured.has(x.e.token.toLowerCase()) || x.burned > 0n)
    .sort((a, b) => Number(featured.has(b.e.token.toLowerCase())) - Number(featured.has(a.e.token.toLowerCase())) || (b.burned > a.burned ? 1 : -1));
  const entries = keep.map((x) => x.e);
  const burnedBals = keep.map((x) => x.burned);
  const treasuryBals = keep.map((x) => x.held);
  const SUPPLY = 1_000_000_000n * 10n ** 18n;

  const tokens = [];
  let totalBurned = 0n, rentBurned = 0n, pending = 0n, shareSum = 0;
  entries.forEach((e, i) => {
    const burned = burnedBals[i], held = treasuryBals[i];
    const allocationBurned = burned >= LAUNCH_ALLOCATION;
    const tokenRentBurned = burned > LAUNCH_ALLOCATION ? burned - LAUNCH_ALLOCATION : 0n;
    // What's still sitting in the treasury from the allocation (as opposed to
    // fee tokens that arrived since): only meaningful until it's burned.
    const tokenPending = allocationBurned ? 0n : (held < LAUNCH_ALLOCATION ? held : LAUNCH_ALLOCATION);
    const sharePct = Number((burned * 10000n) / SUPPLY) / 100;
    tokens.push({ symbol: e.symbol, token: e.token, burned, allocationBurned, rentBurned: tokenRentBurned, pending: tokenPending, sharePct });
    totalBurned += burned; rentBurned += tokenRentBurned; pending += tokenPending; shareSum += sharePct;
  });

  // Ledger: every Transfer into the burn address, per token, bounded to
  // since-HOMEPAD-went-live. A token contract's own logs are a handful of
  // entries — nothing like the PoolManager scan that used to time out.
  let ledger = [], ledgerError = null;
  try {
    const fromBlock = await firstHomepadBlock();
    const lists = await Promise.all(entries.map((e) => {
      const t = tokenRead(e.token);
      return withRetry(() => t.queryFilter(t.filters.Transfer(null, BURN_ADDRESS), fromBlock, "latest"))
        .then((evs) => evs.map((ev) => ({ symbol: e.symbol, token: e.token, amount: ev.args.value, txHash: ev.transactionHash, blockNumber: ev.blockNumber })));
    }));
    ledger = lists.flat();
    if (ledger.length) {
      const blockTime = await blockTimestamps(ledger);
      for (const l of ledger) l.ts = blockTime.get(l.blockNumber);
      ledger.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    }
  } catch (err) {
    console.warn("burn ledger unavailable", err);
    ledgerError = shortErr(err);
  }

  return { tokens, totalBurned, rentBurned, pending, avgSharePct: tokens.length ? shareSum / tokens.length : 0, ledger, ledgerError };
}

async function computeRentDashboard(launches) {
  // skipHistory: this page only needs the launch list (type, token, symbol,
  // which router/factory). The full path also rebuilds every token's 24h
  // price history — dozens of extra log/getBlock calls that the rate-limited
  // public RPC was answering with 429 ("Failed to fetch") before this page's
  // own queries even started.
  if (!launches) launches = await fetchAllLaunches({ skipHistory: true });
  const nowSec = Math.floor(Date.now() / 1000);

  let totalRentEth = 0n, rent24hEth = 0n, creatorPaidEth = 0n, totalVolumeEth = 0n;
  const rentEvents = []; // { symbol, token, typeLabel, amount, unit, decimals, txHash, ts }
  const pairedRentByQuote = new Map(); // quoteSymbol -> { amount: bigint, decimals }

  // ---------------- Curve: one contract per launch, so this queries per-instance ----------------
  const curveEntries = launches.filter((e) => e.type === "curve");
  await Promise.all(curveEntries.map(async (entry) => {
    try {
      const curve = curveRead(entry.curve);
      const [baseFeeBps, extraFeeBps, creatorShareBps, buys, sells] = await Promise.all([
        curve.baseFeeBps(), curve.extraFeeBps(), curve.creatorShareBps(),
        curve.queryFilter(curve.filters.Buy(), await firstHomepadBlock(), "latest"),
        curve.queryFilter(curve.filters.Sell(), await firstHomepadBlock(), "latest"),
      ]);
      const totalBps = Number(baseFeeBps) + Number(extraFeeBps);
      const all = [...buys.map((e) => ({ e, isBuy: true })), ...sells.map((e) => ({ e, isBuy: false }))];
      if (all.length === 0) return;
      const blockTime = await blockTimestamps(all.map((x) => x.e));
      for (const { e, isBuy } of all) {
        const fee = e.args.feePaid;
        const vol = isBuy ? e.args.ethIn : e.args.ethOut;
        const ts = blockTime.get(e.blockNumber);
        totalRentEth += fee;
        totalVolumeEth += vol;
        if (nowSec - ts <= 86400) rent24hEth += fee;
        const baseFeePortion = totalBps > 0 ? (fee * BigInt(baseFeeBps)) / BigInt(totalBps) : 0n;
        const extraFeePortion = fee - baseFeePortion;
        creatorPaidEth += (baseFeePortion * creatorShareBps) / 10000n + extraFeePortion;
        if (fee > 0n) {
          rentEvents.push({ symbol: entry.symbol, token: entry.token, typeLabel: "curve", amount: fee, unit: "ETH", decimals: 18, txHash: e.transactionHash, ts });
        }
      }
    } catch (err) { console.error("rent: curve entry failed", entry.token, err); }
  }));

  // ---------------- Hybrid + Instant: one hook per SOURCE, shared by every token from it ----------------
  for (const [sourcesFn, type, hookAbi] of [
    [hybridFactorySources, "hybrid", HYBRID_HOOK_ABI],
    [instantFactorySources, "instant", HOMEPAD_HOOK_ABI],
  ]) {
    for (const source of sourcesFn()) {
      try {
        const hookAddr = await source.router.hook();
        const hook = new ethers.Contract(hookAddr, hookAbi, readProvider());

        const sourceEntries = launches.filter((e) => e.type === type && sameAddr(e.routerAddress, source.router.target));
        const poolIdToEntry = new Map();
        for (const entry of sourceEntries) {
          poolIdToEntry.set(rentPoolId(ethers.ZeroAddress, entry.token, 0, 60, hookAddr), entry);
        }
        const poolIds = [...poolIdToEntry.keys()];

        // Swaps first. poolManagerSwapsFor is bounded to firstHomepadBlock()
        // (see app.js) — the unbounded version scanned the whole chain and
        // the public RPC timed out on it. Volume is counted before touching
        // fees so a fee-side failure can never zero it out again.
        const pmSwaps = await poolManagerSwapsFor(hook, poolIds); // every swap in these pools, any route (retries inside)
        for (const s of pmSwaps) totalVolumeEth += absBig(s.args.amount0);

        // FeeRouted is emitted by the hook inside the same transaction as
        // its swap, so every fee event for these pools lives in a block
        // between the first swap seen and now. That plus the indexed poolId
        // filter makes this a tiny, cheap query instead of a chain-wide scan.
        let feeEvents = [];
        if (pmSwaps.length) {
          const fromBlock = pmSwaps.reduce((m, s) => Math.min(m, s.blockNumber), Infinity);
          feeEvents = await withRetry(() => hook.queryFilter(hook.filters.FeeRouted(poolIds), fromBlock, "latest"));
        }

        console.log(`rent ${RENT_JS_VERSION}: ${type} @ ${source.router.target} — hook ${hookAddr}, poolIds ${poolIds.length}, pmSwaps ${pmSwaps.length}, feeEvents ${feeEvents.length}`);

        if (feeEvents.length) {
          try {
            const valued = valueFeeRoutedEvents(feeEvents, pmSwaps);
            const blockTime = await blockTimestamps(valued.map((v) => v.event));
            for (const v of valued) {
              const ts = blockTime.get(v.event.blockNumber);
              const entry = poolIdToEntry.get(v.poolId);
              totalRentEth += v.ethValue;
              creatorPaidEth += v.ethToCreator;
              if (nowSec - ts <= 86400) rent24hEth += v.ethValue;
              if (v.total > 0n) {
                rentEvents.push({
                  symbol: entry ? entry.symbol : "?", token: entry ? entry.token : null, typeLabel: type,
                  amount: v.total, decimals: 18,
                  unit: v.isTokenFee ? (entry ? `$${entry.symbol}` : "tokens") : "ETH",
                  ethValue: v.isTokenFee ? v.ethValue : null, // rendered as "≈ X ETH" beside a token-denominated amount
                  txHash: v.event.transactionHash, ts,
                });
              }
            }
          } catch (innerErr) {
            // Separated from the outer catch on purpose: volume (above) is
            // already counted by the time anything here could throw, so a
            // fee-valuation error shouldn't look identical to a query failure.
            // Surfaced on-page (not only console) — on mobile that's the only
            // way anyone sees it.
            console.error(`rent ${RENT_JS_VERSION}: ${type} fee-valuation failed`, source.router.target, innerErr);
            rentEvents.push(statusRow(type, `Couldn't value ${type} rent events (${shortErr(innerErr)})`, nowSec));
          }
        }
      } catch (err) {
        console.error(`rent ${RENT_JS_VERSION}: ${type} source failed`, source.router.target, err);
        rentEvents.push(statusRow(type, `Couldn't load ${type} rent events (${shortErr(err)})`, nowSec));
      }
    }
  }

  // ---------------- Paired: rent stays in its own quote token, never mixed into the ETH totals ----------------
  // NOTE (before Stock Pair goes live): the same output-side rule applies
  // here — a BUY's fee is in the launched token, a SELL's in the quote
  // token. This block still reads every FeeRouted as quote-denominated.
  // Wire it through valueFeeRoutedEvents() (direction from the
  // PoolManager Swap; watch the currency ordering, since an ERC-20 quote
  // can be currency0 OR currency1) when the paired factory ships.
  for (const source of pairedFactorySources()) {
    try {
      const hookAddr = await source.factory.hook();
      const hook = new ethers.Contract(hookAddr, HYBRID_HOOK_ABI, readProvider());

      const sourceEntries = launches.filter((e) => e.type === "paired" && sameAddr(e.factoryAddress, source.factory.target));
      const poolIdToEntry = new Map();
      for (const entry of sourceEntries) {
        const quoteIs0 = BigInt(entry.quoteToken) < BigInt(entry.token);
        const [c0, c1] = quoteIs0 ? [entry.quoteToken, entry.token] : [entry.token, entry.quoteToken];
        poolIdToEntry.set(rentPoolId(c0, c1, 0, 60, hookAddr), entry);
      }
      const poolIds = [...poolIdToEntry.keys()];

      // Same fix as the Hybrid/Instant loop above: filter by poolId (indexed
      // on FeeRouted) instead of scanning every FeeRouted this hook has ever
      // emitted — the unfiltered form timed out against the public RPC.
      const feeEvents = poolIds.length ? await hook.queryFilter(hook.filters.FeeRouted(poolIds), await firstHomepadBlock(), "latest") : [];
      if (!feeEvents.length) continue;

      const blockTime = await blockTimestamps(feeEvents);
      for (const e of feeEvents) {
        const { poolId, toCreator, toHome, toPlatform } = e.args;
        const total = toCreator + toHome + toPlatform;
        if (total === 0n) continue;
        const entry = poolIdToEntry.get(poolId);
        const qSym = entry ? entry.quoteSymbol : "?";
        const qDec = entry ? entry.quoteDecimals : 18;
        const cur = pairedRentByQuote.get(qSym) || { amount: 0n, decimals: qDec };
        cur.amount += total;
        pairedRentByQuote.set(qSym, cur);
        rentEvents.push({ symbol: entry ? entry.symbol : "?", token: entry ? entry.token : null, typeLabel: "paired", amount: total, unit: qSym, decimals: qDec, txHash: e.transactionHash, ts: blockTime.get(e.blockNumber) });
      }
    } catch (err) { console.error("rent: paired source failed", err); }
  }

  rentEvents.sort((a, b) => b.ts - a.ts);

  return {
    totalRentEth, rent24hEth, creatorPaidEth, totalVolumeEth,
    pairedRentByQuote,
    launchCount: launches.length,
    recentEvents: rentEvents.slice(0, 30),
  };
}
