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

async function computeRentDashboard() {
  const launches = await fetchAllLaunches();
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
        curve.queryFilter(curve.filters.Buy()),
        curve.queryFilter(curve.filters.Sell()),
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

        // FeeRouted's poolId is indexed — filtering by our known poolIds
        // (same narrowing poolManagerSwapsFor already uses for the
        // PoolManager's Swap event) turns this into a fast indexed lookup.
        // The unfiltered form (every FeeRouted this hook has ever emitted,
        // across every pool, no topic to narrow by) timed out against the
        // public RPC ("log query timed out", -32000) — confirmed live via
        // the on-page DEBUG rows this file adds below.
        const [feeEvents, pmSwaps] = await Promise.all([
          poolIds.length ? hook.queryFilter(hook.filters.FeeRouted(poolIds)) : Promise.resolve([]),
          poolManagerSwapsFor(hook, poolIds), // every swap in these pools, any route
        ]);

        // Volume: |amount0| is the ETH side of every swap in these pools,
        // whoever made it — router trades, launch-time dev buys, and
        // third-party swaps alike.
        for (const s of pmSwaps) totalVolumeEth += absBig(s.args.amount0);

        console.log(`rent: ${type} @ ${source.router.target} — hook ${hookAddr}, poolIds ${poolIds.length}, pmSwaps ${pmSwaps.length}, feeEvents ${feeEvents.length}`);

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
            // already accumulated by the time anything here could throw, so
            // an error in fee-valuation alone shouldn't look identical to a
            // total query failure. Surfaced on-page (not just console) since
            // that's the only way to see it on mobile.
            console.error(`rent: ${type} fee-valuation failed`, source.router.target, innerErr);
            rentEvents.push({ symbol: "⚠", token: null, typeLabel: type, amount: 0n, decimals: 18, unit: "DEBUG: " + String(innerErr && innerErr.message || innerErr).slice(0, 120), ethValue: null, txHash: null, ts: nowSec });
          }
        } else {
          rentEvents.push({ symbol: "ℹ", token: null, typeLabel: type, amount: 0n, decimals: 18, unit: `DEBUG: 0 FeeRouted found (hook ${hookAddr.slice(0,10)}…, ${pmSwaps.length} real swaps seen)`, ethValue: null, txHash: null, ts: nowSec });
        }
      } catch (err) {
        console.error(`rent: ${type} source failed`, source.router.target, err);
        rentEvents.push({ symbol: "⚠", token: null, typeLabel: type, amount: 0n, decimals: 18, unit: "DEBUG: " + String(err && err.message || err).slice(0, 120), ethValue: null, txHash: null, ts: nowSec });
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
      const feeEvents = poolIds.length ? await hook.queryFilter(hook.filters.FeeRouted(poolIds)) : [];
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
