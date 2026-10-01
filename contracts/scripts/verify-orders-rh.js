// Verifies ARCIRCLE Orders on Robinhood Chain on Blockscout, with the constructor arguments read back from the chain
// (the deploy's own verification can fail when Blockscout answers with a web page instead of its API).
//
//   ORDERS_RH=0x… FEEBURN_RH=0x… npx hardhat run scripts/verify-orders-rh.js --network robinhoodMainnet
//
// Needs no key: nothing is sent, only read and uploaded to the explorer.
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const orders = (process.env.ORDERS_RH || "").trim(), feeBurn = (process.env.FEEBURN_RH || "").trim();
  if (!ethers.isAddress(orders) || !ethers.isAddress(feeBurn)) throw new Error("Set ORDERS_RH and FEEBURN_RH to the two addresses.");
  const fb = await ethers.getContractAt("ArcircleFeeBurnNative", feeBurn);
  const ob = await ethers.getContractAt("ArcircleOrdersNative", orders);
  const k = await fb.poolKey();
  // the operator and threshold as set at deploy time: the first OperatorSet / DiscountSet events
  const from = Math.max(0, (await ethers.provider.getBlockNumber()) - 2_000_000);
  const opLogs = await fb.queryFilter(fb.filters.OperatorSet(), from).catch(() => []);
  const dmLogs = await fb.queryFilter(fb.filters.DiscountSet(), from).catch(() => []);
  const operator = opLogs.length ? opLogs[0].args[0] : await fb.operator();
  const discountMin = dmLogs.length ? dmLogs[0].args[0] : await fb.discountMin();
  const fbArgs = [await fb.poolManager(), await fb.weth(), await fb.arcircle(), await fb.treasury(), await fb.burnBps(),
    { currency0: k.currency0, currency1: k.currency1, fee: k.fee, tickSpacing: k.tickSpacing, hooks: k.hooks }, operator, discountMin];
  const oArgs = [await ob.poolManager(), await ob.treasury(), await ob.permit2(), await ob.feePolicy(), await ob.weth()];
  console.log("ArcircleFeeBurnNative args:", fbArgs.map(String).join(" · "));
  console.log("ArcircleOrdersNative args: ", oArgs.join(" · "));
  for (const [name, address, constructorArguments, contract] of [
    ["ArcircleFeeBurnNative", feeBurn, fbArgs, "contracts/ArcircleFeeBurnNative.sol:ArcircleFeeBurnNative"],
    ["ArcircleOrdersNative", orders, oArgs, "contracts/ArcircleOrdersNative.sol:ArcircleOrdersNative"],
  ]) {
    try {
      await hre.run("verify:verify", { address, constructorArguments, contract });
      console.log(`  ${name}: verified`);
    } catch (e) {
      const m = String((e && e.message) || e);
      console.log(`  ${name}: ${/already verified/i.test(m) ? "already verified" : "didn't finish — " + m.split("\n")[0].slice(0, 200)}`);
    }
  }
  console.log(`\nhttps://robinhoodchain.blockscout.com/address/${orders}?tab=contract\nhttps://robinhoodchain.blockscout.com/address/${feeBurn}?tab=contract`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
