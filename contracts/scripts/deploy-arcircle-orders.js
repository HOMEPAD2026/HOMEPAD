// Deploys ArcircleOrders — ARCIRCLE Orders: limit, stop and market orders on Arc's Uniswap v4 pools
// (arcpad.html#orders, arc-orders.js, api/_orders.mjs).
//
//   npx hardhat run scripts/deploy-arcircle-orders.js --network arcMainnet
//
// contracts/.env needs only DEPLOYER_PRIVATE_KEY: any wallet with a little USDC for gas on Arc. It gets no role —
// the contract has no owner and nothing to configure. Never the old deployer 0x80e1…8bc7.
// After deploying, send the printed address back: it goes into config-arc.js (ORDERS_ADDRESS) and api/_orders.mjs.
// The executor that fills orders is a separate wallet whose key goes in Vercel as ORDERS_KEEPER_KEY (Sensitive);
// it only pays gas (USDC on Arc) and earns nothing — the 0.1% fee goes to the treasury.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Arc
const TREASURY = "0xa066e6C5D1ac561A4065B9D6B00feF89C0bD02F8"; // the ARCIRCLE PAD treasury
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const code = await ethers.provider.getCode(POOL_MANAGER);
  if (!code || code === "0x") throw new Error(`No PoolManager at ${POOL_MANAGER} on this network.`);
  console.log("Deploying ArcircleOrders on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("ArcircleOrders");
  const c = await F.deploy(POOL_MANAGER, TREASURY);
  const rc = await c.deploymentTransaction().wait();
  const addr = await c.getAddress();
  console.log("\nArcircleOrders:", addr);
  console.log("  block:    ", rc.blockNumber);
  console.log("  pools:    ", await c.poolManager());
  console.log("  treasury: ", await c.treasury(), `(fee ${Number(await c.FEE_BPS()) / 100}%)`);
  try {
    await new Promise((r) => setTimeout(r, 15000));
    await hre.run("verify:verify", { address: addr, constructorArguments: [POOL_MANAGER, TREASURY] });
    console.log("  verified");
  } catch (e) {
    console.log("  verification didn't finish:", String((e && e.message) || e).split("\n")[0]);
  }
  console.log("\nNext: send this address back (ArcircleOrders:", addr + ") · delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
