// Deploys ArcLPLock — time locks for Uniswap v4 liquidity positions (NFTs)
// on Arc, used by the Liquidity Manager (/liquidity). No owner, no admin, no
// fee: the only constructor argument is Uniswap's v4 PositionManager on Arc.
//
//   npx hardhat run scripts/deploy-arc-lplock.js --network arcMainnet
//
// Needs DEPLOYER_PRIVATE_KEY (a wallet with a little USDC for gas on Arc)
// and, for source verification, ARC_ETHERSCAN_API_KEY in contracts/.env.
// When it prints the address, set LPLOCK_ADDRESS in config-arc.js (and
// LIQ_ADDR.lplock in api/_liq-core.mjs).
const hre = require("hardhat");
const { ethers } = hre;
const { verifyIfPossible } = require("./lib/verify");

// Uniswap v4 PositionManager on Arc mainnet (verified on arc.etherscan.io)
const POSITION_MANAGER = "0x6049c9a0e26405c0985f9e3685c87d0ae917f82b";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  const code = await ethers.provider.getCode(POSITION_MANAGER);
  if (!code || code === "0x") throw new Error("No PositionManager at " + POSITION_MANAGER + " on this network.");
  console.log("Deploying ArcLPLock on", hre.network.name, "from", deployer.address, "...");
  const F = await ethers.getContractFactory("ArcLPLock");
  const lock = await F.deploy(POSITION_MANAGER);
  await lock.waitForDeployment();
  const address = await lock.getAddress();
  console.log("ArcLPLock deployed:", address);
  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "ArcLPLock", address, contract: "contracts/ArcLPLock.sol:ArcLPLock", constructorArgs: [POSITION_MANAGER] });
  console.log(`\nDone. Send this address back so the site can use it:\n  LPLOCK_ADDRESS: "${address}",`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
