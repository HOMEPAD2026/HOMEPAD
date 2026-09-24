// Deploys ArcLock — creator time locks shown as a "Locked" badge on ArcPad.
// No constructor arguments, no owner, no admin: nothing to configure.
//
//   npx hardhat run scripts/deploy-arc-lock.js --network arcMainnet
//
// Needs DEPLOYER_PRIVATE_KEY (a wallet with a little USDC for gas on Arc)
// and, for source verification, ARC_ETHERSCAN_API_KEY in contracts/.env.
// When it prints the address, set LOCK_ADDRESS in config-arc.js.
const hre = require("hardhat");
const { ethers } = hre;
const { verifyIfPossible } = require("./lib/verify");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  console.log("Deploying ArcLock on", hre.network.name, "from", deployer.address, "...");
  const Lock = await ethers.getContractFactory("ArcLock");
  const lock = await Lock.deploy();
  await lock.waitForDeployment();
  const address = await lock.getAddress();
  console.log("ArcLock deployed:", address);
  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "ArcLock", address, contract: "contracts/ArcLock.sol:ArcLock", constructorArgs: [] });
  console.log(`\nDone. In config-arc.js set:\n  LOCK_ADDRESS: "${address}",`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
