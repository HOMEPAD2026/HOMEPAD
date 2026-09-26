// Deploys ArcDrop — claimable airdrops for very long lists (the Multisender's claim mode).
// No constructor arguments, no owner, no admin: nothing to configure.
//
//   npx hardhat run scripts/deploy-arc-drop.js --network arcMainnet
//
// Needs DEPLOYER_PRIVATE_KEY (a wallet with a little USDC for gas on Arc)
// and, for source verification, ARC_ETHERSCAN_API_KEY in contracts/.env.
// When it prints the address, set DROP_ADDRESS in config-arc.js.
// The claim-drop mode stays hidden until then.
const hre = require("hardhat");
const { ethers } = hre;
const { verifyIfPossible } = require("./lib/verify");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  console.log("Deploying ArcDrop on", hre.network.name, "from", deployer.address, "...");
  const F = await ethers.getContractFactory("ArcDrop");
  const c = await F.deploy();
  await c.waitForDeployment();
  const address = await c.getAddress();
  console.log("ArcDrop deployed:", address);
  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "ArcDrop", address, contract: "contracts/ArcDrop.sol:ArcDrop", constructorArgs: [] });
  console.log(`\nDone. In config-arc.js set:\n  DROP_ADDRESS: "${address}",`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
