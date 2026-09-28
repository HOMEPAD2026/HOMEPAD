// Deploys BuilderMine — ARCIRCLE PAD's mining utility — and lists its items.
//
//   npx hardhat run scripts/deploy-builder-mine.js --network arcMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   a fresh wallet with a little USDC for gas (never the old deployer 0x80e1…8bc7)
//   MINE_OPERATOR          the address whose key is MINE_OPERATOR_KEY in Vercel (it posts the hourly roots)
//   MINE_FEE_TO            where the 1 USDC entry fees go
//   MINE_OWNER (optional)  hand the settings (items, fee, operator) to this address after deploying
//   ARC_ETHERSCAN_API_KEY  (optional) to verify the source
// The owner can change item prices, the entry fee (max 10 USDC), the fee address and the operator —
// never a mine's tokens. Delete .env afterwards. Send back the address and block it prints.
const hre = require("hardhat");
const { ethers } = hre;
const { verifyIfPossible } = require("./lib/verify");

const USDC = "0x3600000000000000000000000000000000000000";
const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const E = (n) => ethers.parseEther(String(n));
// [price in $ARCIRCLE, pickaxe tier, boost kind, seconds] — keep in step with api/_mine.mjs GAME.items
const ITEMS = [
  [50_000, 1, 0, 0],        // Stone pickaxe     ×1.25
  [200_000, 2, 0, 0],       // Iron pickaxe      ×1.6
  [800_000, 3, 0, 0],       // Diamond pickaxe   ×2.1
  [2_500_000, 4, 0, 0],     // Arcane pickaxe    ×2.6
  [30_000, 0, 1, 86400],    // Lantern           +15% for 24h
  [20_000, 0, 2, 3600],     // Dynamite          +50% for 1h
  [40_000, 0, 3, 86400],    // Lucky charm       rare ores twice as often for 24h
  [30_000, 0, 4, 86400],    // Overtime          +50% hourly cap for 24h
];

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  const operator = process.env.MINE_OPERATOR || "", feeTo = process.env.MINE_FEE_TO || "", owner = process.env.MINE_OWNER || "";
  if (!ethers.isAddress(operator)) throw new Error("Set MINE_OPERATOR (the operator's address, not its key).");
  if (!ethers.isAddress(feeTo)) throw new Error("Set MINE_FEE_TO (where entry fees go).");
  for (const [n, a] of [["USDC", USDC], ["$ARCIRCLE", ARCIRCLE]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  console.log("Deploying BuilderMine on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("BuilderMine");
  const mine = await F.deploy(USDC, ARCIRCLE, operator, feeTo);
  await mine.waitForDeployment();
  const address = await mine.getAddress();
  const rc = await mine.deploymentTransaction().wait();
  console.log("BuilderMine deployed:", address, "at block", rc.blockNumber);
  for (let i = 0; i < ITEMS.length; i++) {
    const [p, tier, boost, dur] = ITEMS[i];
    await (await mine.setItem(i, E(p), tier, boost, dur, true)).wait();
    console.log(`  item ${i}: ${p.toLocaleString("en-US")} $ARCIRCLE`);
  }
  if (ethers.isAddress(owner) && owner.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await mine.transferOwnership(owner)).wait();
    console.log("  settings handed to", owner);
  }
  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "BuilderMine", address, contract: "contracts/BuilderMine.sol:BuilderMine", constructorArgs: [USDC, ARCIRCLE, operator, feeTo] });
  console.log(`\nDone. Send this back so the site can use it:\n  BUILDER_MINE_ADDRESS: "${address}", block ${rc.blockNumber}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
