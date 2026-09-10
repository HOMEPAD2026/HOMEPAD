// ---------- Proof of Rent dashboard ----------
// Every number on this page comes from an on-chain event — Buy/Sell.feePaid
// on bonding-curve instances, FeeRouted(poolId, toCreator, toHome,
// toPlatform) on the v4 hooks (shared across every Hybrid/Instant/Paired
// pool, filtered locally by a poolId this file computes itself — the event
// only carries the poolId, not the token address). Nothing here is
// estimated or extrapolated.
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

  // ---------------- Hybrid + Instant: one hook + router per SOURCE, shared by every token from it ----------------
  for (const [sourcesFn, type, hookAbi] of [
    [hybridFactorySources, "hybrid", HYBRID_HOOK_ABI],
    [instantFactorySources, "instant", HOMEPAD_HOOK_ABI],
  ]) {
    for (const source of sourcesFn()) {
      try {
        const hookAddr = await source.router.hook();
        const hook = new ethers.Contract(hookAddr, hookAbi, readProvider());
        const [feeEvents, swapEvents] = await Promise.all([
          hook.queryFilter(hook.filters.FeeRouted()),
          source.router.queryFilter(source.router.filters.Swap()),
        ]);

        const sourceEntries = launches.filter((e) => e.type === type && e._router && sameAddr(e._router.target, source.router.target));
        const poolIdToEntry = new Map();
        for (const entry of sourceEntries) {
          poolIdToEntry.set(rentPoolId(ethers.ZeroAddress, entry.token, 0, 60, hookAddr), entry);
        }

        if (feeEvents.length) {
          const blockTime = await blockTimestamps(feeEvents);
          for (const e of feeEvents) {
            const { poolId, toCreator, toHome, toPlatform } = e.args;
            const total = toCreator + toHome + toPlatform;
            const ts = blockTime.get(e.blockNumber);
            totalRentEth += total;
            creatorPaidEth += toCreator;
            if (nowSec - ts <= 86400) rent24hEth += total;
            if (total > 0n) {
              const entry = poolIdToEntry.get(poolId);
              rentEvents.push({ symbol: entry ? entry.symbol : "?", token: entry ? entry.token : null, typeLabel: type, amount: total, unit: "ETH", decimals: 18, txHash: e.transactionHash, ts });
            }
          }
        }
        for (const e of swapEvents) {
          const { zeroForOne, amountIn, amountOut } = e.args;
          totalVolumeEth += zeroForOne ? amountIn : amountOut;
        }
      } catch (err) { console.error(`rent: ${type} source failed`, source.router.target, err); }
    }
  }

  // ---------------- Paired: rent stays in its own quote token, never mixed into the ETH totals ----------------
  for (const source of pairedFactorySources()) {
    try {
      const hookAddr = await source.factory.hook();
      const hook = new ethers.Contract(hookAddr, HYBRID_HOOK_ABI, readProvider());
      const feeEvents = await hook.queryFilter(hook.filters.FeeRouted());
      if (!feeEvents.length) continue;

      const sourceEntries = launches.filter((e) => e.type === "paired" && e._factory && sameAddr(e._factory.target, source.factory.target));
      const poolIdToEntry = new Map();
      for (const entry of sourceEntries) {
        const quoteIs0 = BigInt(entry.quoteToken) < BigInt(entry.token);
        const [c0, c1] = quoteIs0 ? [entry.quoteToken, entry.token] : [entry.token, entry.quoteToken];
        poolIdToEntry.set(rentPoolId(c0, c1, 0, 60, hookAddr), entry);
      }

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
