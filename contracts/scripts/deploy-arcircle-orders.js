// Deploys ARCIRCLE Orders on Arc: ArcircleFeeBurn (where the 0.1% fees go) and ArcircleOrders (limit, stop, timed and
// market orders on Arc's Uniswap v4 pools — arcpad.html#orders, arc-orders.js, api/_orders.mjs).
//
//   ORDERS_KEEPER=0x<the executor wallet's ADDRESS> npx hardhat run scripts/deploy-arcircle-orders.js --network arcMainnet
//
// contracts/.env needs only DEPLOYER_PRIVATE_KEY: any wallet with a little USDC for gas on Arc. Never the old deployer
// 0x80e1…8bc7. ORDERS_KEEPER is only the executor's public address (its key goes in Vercel as ORDERS_KEEPER_KEY);
// without it the deployer is the fee burn's operator until setOperator is called.
//   · ArcircleOrders has no owner and nothing to configure.
//   · ArcircleFeeBurn: half of every USDC fee buys $ARCIRCLE and burns it, the other half (and every other token) goes
//     to the treasury. It's also the fee policy: wallets holding 100,000 $ARCIRCLE or more trade fee-free. Its owner
//     (the deployer) can change the operator and that threshold (fees can only be waived, never raised), or step down.
//   · Makers can allow ArcircleOrders with a plain approval or a Permit2 signature (Uniswap's Permit2 on Arc).
// After deploying, send both printed addresses back: they go into config-arc.js and api/_orders.mjs.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Arc
const TREASURY = "0xa066e6C5D1ac561A4065B9D6B00feF89C0bD02F8"; // the ARCIRCLE PAD treasury
const USDC = "0x3600000000000000000000000000000000000000";
const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
// the $ARCIRCLE / USDC pool (Argus): pool id 0xfd282cf8…ebba
const ARCIRCLE_POOL = { currency0: USDC, currency1: ARCIRCLE, fee: 0x800000, tickSpacing: 200, hooks: "0x3335d21dcd2c8066ea6c8556effb90f97cf060cc" };
const ARCIRCLE_POOL_ID = "0xfd282cf8bbc57813724e7c6cb1bda6bdf5d2caf02b3bce60cc6aac38ed26ebba";
const BURN_BPS = 5000; // 50% of the fees burned as $ARCIRCLE
const DISCOUNT_MIN = ethers.parseEther("100000"); // hold 100,000 $ARCIRCLE: no fee
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Uniswap's Permit2 (same address on every chain)
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const keeper = (process.env.ORDERS_KEEPER || "").trim();
  if (keeper && !ethers.isAddress(keeper)) throw new Error("ORDERS_KEEPER must be the executor wallet's address (0x…), not a key.");
  if (keeper.length > 42) throw new Error("ORDERS_KEEPER looks like a private key — pass the address only.");
  const code = await ethers.provider.getCode(POOL_MANAGER);
  if (!code || code === "0x") throw new Error(`No PoolManager at ${POOL_MANAGER} on this network.`);
  const p2code = await ethers.provider.getCode(PERMIT2);
  if (!p2code || p2code === "0x") throw new Error(`No Permit2 at ${PERMIT2} on this network.`);
  const id = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [ARCIRCLE_POOL.currency0, ARCIRCLE_POOL.currency1, ARCIRCLE_POOL.fee, ARCIRCLE_POOL.tickSpacing, ARCIRCLE_POOL.hooks]));
  if (id.toLowerCase() !== ARCIRCLE_POOL_ID) throw new Error("The $ARCIRCLE pool key doesn't match its pool id.");
  console.log("Deploying ARCIRCLE Orders on", hre.network.name, "from", deployer.address);

  const FB = await ethers.getContractFactory("ArcircleFeeBurn");
  const fbArgs = [POOL_MANAGER, USDC, ARCIRCLE, TREASURY, BURN_BPS, ARCIRCLE_POOL, keeper || deployer.address, DISCOUNT_MIN];
  const fb = await FB.deploy(...fbArgs);
  const rc1 = await fb.deploymentTransaction().wait();
  const fbAddr = await fb.getAddress();
  console.log("\nArcircleFeeBurn:", fbAddr, " block", rc1.blockNumber);
  console.log("  burns:    ", Number(await fb.burnBps()) / 100 + "% of the fees as $ARCIRCLE; the rest to", await fb.treasury());
  console.log("  operator: ", await fb.operator(), keeper ? "(the executor)" : "(you — set the executor later with setOperator)");
  console.log("  fee-free: ", ethers.formatEther(await fb.discountMin()), "$ARCIRCLE or more");

  const F = await ethers.getContractFactory("ArcircleOrders");
  const oArgs = [POOL_MANAGER, fbAddr, PERMIT2, fbAddr];
  const c = await F.deploy(...oArgs);
  const rc = await c.deploymentTransaction().wait();
  const addr = await c.getAddress();
  console.log("\nArcircleOrders:", addr, " block", rc.blockNumber);
  console.log("  pools:    ", await c.poolManager());
  console.log("  fees to:  ", await c.treasury(), `(${Number(await c.FEE_BPS()) / 100}%; policy ${await c.feePolicy()})`);
  console.log("  permit2:  ", await c.permit2());
  try {
    await new Promise((r) => setTimeout(r, 15000));
    await hre.run("verify:verify", { address: fbAddr, constructorArguments: fbArgs });
    await hre.run("verify:verify", { address: addr, constructorArguments: oArgs });
    console.log("  verified");
  } catch (e) {
    console.log("  verification didn't finish:", String((e && e.message) || e).split("\n")[0]);
  }
  console.log(`\nNext: send back ArcircleOrders ${addr} and ArcircleFeeBurn ${fbAddr} · delete contracts/.env`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
