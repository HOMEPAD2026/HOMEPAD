// Deploys ArcMultiSend — the Multisender utility (send an ERC-20 to many wallets in one transaction).
// No constructor arguments, no owner, no admin: nothing to configure.
//
//   npx hardhat run scripts/deploy-arc-multisend.js --network arcMainnet
//
// Needs DEPLOYER_PRIVATE_KEY (a wallet with a little USDC for gas on Arc)
// and, for source verification, ARC_ETHERSCAN_API_KEY in contracts/.env.
// When it prints the address, set MULTISEND_ADDRESS in config-arc.js — the
// Multisender stays in preview (can't send) until then.
const hre = require("hardhat");
const { ethers } = hre;
const { verifyIfPossible } = require("./lib/verify");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  console.log("Deploying ArcMultiSend on", hre.network.name, "from", deployer.address, "...");
  const F = await ethers.getContractFactory("ArcMultiSend");
  const c = await F.deploy();
  await c.waitForDeployment();
  const address = await c.getAddress();
  console.log("ArcMultiSend deployed:", address);
  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "ArcMultiSend", address, contract: "contracts/ArcMultiSend.sol:ArcMultiSend", constructorArgs: [] });
  console.log(`\nDone. In config-arc.js set:\n  MULTISEND_ADDRESS: "${address}",`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
