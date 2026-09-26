// Deploys ArcMultiSendV2 — the Multisender's v2 contract (permit, a token per row, NFTs).
// No constructor arguments, no owner, no admin: nothing to configure.
//
//   npx hardhat run scripts/deploy-arc-multisend-v2.js --network arcMainnet
//
// Needs DEPLOYER_PRIVATE_KEY (a wallet with a little USDC for gas on Arc)
// and, for source verification, ARC_ETHERSCAN_API_KEY in contracts/.env.
// When it prints the address, set MULTISEND_V2_ADDRESS in config-arc.js.
// The permit / mixed-token / NFT modes stay hidden until then.
const hre = require("hardhat");
const { ethers } = hre;
const { verifyIfPossible } = require("./lib/verify");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  console.log("Deploying ArcMultiSendV2 on", hre.network.name, "from", deployer.address, "...");
  const F = await ethers.getContractFactory("ArcMultiSendV2");
  const c = await F.deploy();
  await c.waitForDeployment();
  const address = await c.getAddress();
  console.log("ArcMultiSendV2 deployed:", address);
  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "ArcMultiSendV2", address, contract: "contracts/ArcMultiSendV2.sol:ArcMultiSendV2", constructorArgs: [] });
  console.log(`\nDone. In config-arc.js set:\n  MULTISEND_V2_ADDRESS: "${address}",`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
