// Deploys BuilderMine — ARCIRCLE PAD's mining utility — and lists its items.
//
//   npx hardhat run scripts/deploy-builder-mine.js --network arcMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   a fresh wallet with a little USDC for gas (never the old deployer 0x80e1…8bc7)
//   MINE_OPERATOR          the address whose key is MINE_OPERATOR_KEY in Vercel (it posts the hourly roots)
//   MINE_OWNER (optional)  hand the settings (items, fee, pause, operator) to this address after deploying
// Opening a mine and joining one cost 1 USDC worth of $ARCIRCLE (priced from the $ARCIRCLE / USDC pool's
// slot0 in the PoolManager), burned on the spot. Nothing is paid to anyone.
//   ARC_ETHERSCAN_API_KEY  (optional) to verify the source
// The owner can change item prices, the fee (max 10 USDC worth), pause new mines/joins and the operator —
// never a mine's tokens. Delete .env afterwards. Send back the address and block it prints.
const hre = require("hardhat");
const { ethers } = hre;
const { verifyIfPossible } = require("./lib/verify");

const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Arc (api/_arc.mjs PM_ADDRESS)
const ARCIRCLE_POOL_SLOT = "0xad85d721d91ab50f533ac7d86b01e50798b891ac2a1502187e974fabc0cf854b"; // config-arc.js
const ARC_IS_TOKEN1 = BigInt(ARCIRCLE) > BigInt("0x3600000000000000000000000000000000000000"); // USDC is currency0
const E = (n) => ethers.parseEther(String(n));
// [price in $ARCIRCLE, pickaxe tier, boost kind, seconds] — keep in step with api/_mine.mjs GAME.items
const ITEMS = [
  [20_000, 1, 0, 0],        // Stone pickaxe     ×1.15
  [60_000, 2, 0, 0],        // Iron pickaxe      ×1.3
  [150_000, 3, 0, 0],       // Steel pickaxe     ×1.5
  [300_000, 4, 0, 0],       // Gold pickaxe      ×1.7
  [700_000, 5, 0, 0],       // Diamond pickaxe   ×2.0
  [1_600_000, 6, 0, 0],     // Amethyst pickaxe  ×2.3
  [4_000_000, 7, 0, 0],     // Arcane pickaxe    ×2.7
  [30_000, 0, 1, 86400],    // Lantern           +15% for 24h
  [20_000, 0, 2, 3600],     // Dynamite          +50% for 1h
  [40_000, 0, 3, 86400],    // Lucky gem         rare ores twice as often for 24h
  [30_000, 0, 4, 86400],    // Overtime barrel   +50% hourly cap for 24h
];

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  const operator = process.env.MINE_OPERATOR || "", owner = process.env.MINE_OWNER || "";
  if (!ethers.isAddress(operator)) throw new Error("Set MINE_OPERATOR (the operator's address, not its key).");
  const code = await ethers.provider.getCode(ARCIRCLE);
  if (!code || code === "0x") throw new Error(`No $ARCIRCLE contract at ${ARCIRCLE} on this network.`);
  const pm = new ethers.Contract(POOL_MANAGER, ["function extsload(bytes32) view returns (bytes32)"], ethers.provider);
  const slot0 = BigInt(await pm.extsload(ARCIRCLE_POOL_SLOT));
  if ((slot0 & ((1n << 160n) - 1n)) === 0n) throw new Error("The $ARCIRCLE pool's price reads as zero — check POOL_MANAGER / ARCIRCLE_POOL_SLOT.");
  console.log("Deploying BuilderMine on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("BuilderMine");
  const args = [ARCIRCLE, POOL_MANAGER, ARCIRCLE_POOL_SLOT, ARC_IS_TOKEN1, operator];
  const mine = await F.deploy(...args);
  await mine.waitForDeployment();
  const address = await mine.getAddress();
  const rc = await mine.deploymentTransaction().wait();
  console.log("BuilderMine deployed:", address, "at block", rc.blockNumber);
  console.log("  fee now:", ethers.formatEther(await mine.feeArc()), "$ARCIRCLE (1 USDC worth, burned)");
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
  await verifyIfPossible(hre, { name: "BuilderMine", address, contract: "contracts/BuilderMine.sol:BuilderMine", constructorArgs: args });
  console.log(`\nDone. Send this back so the site can use it:\n  BUILDER_MINE_ADDRESS: "${address}", block ${rc.blockNumber}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
