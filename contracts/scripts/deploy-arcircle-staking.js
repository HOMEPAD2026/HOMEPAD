// Deploys ArcircleStaking — veARCIRCLE: lock $ARCIRCLE up to a year, weekly USDC rewards, weekly pool votes
// (contracts/ArcircleStaking.sol).
//
//   npx hardhat run scripts/deploy-arcircle-staking.js --network arcMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any wallet with a little USDC on Arc for gas (not the old 0x80e1…8bc7). It owns nothing
//                          afterwards: the contract has no owner, no admin and no fee.
// After deploying:
//   1. Vercel: STAKING_ADDRESS = the address it prints, STAKING_BLOCK = its block (or tell Claude to make it the default),
//      Redeploy;
//   2. lock some $ARCIRCLE yourself at arcircle.app/arc#staking — rewards can be funded from the week after the
//      first lock (a week is paid to whoever held veARCIRCLE when it began);
//   3. every week, from the treasury wallet: "Fund this week" on the same page (half of the treasury's share of the
//      ARCIRCLE Orders and Predict fees — the page shows the amount);
//   4. delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;

const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const USDC = "0x3600000000000000000000000000000000000000"; // Arc's USDC, ERC-20 face (6 decimals)
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 5042) throw new Error(`This is chain ${net.chainId}, not Arc (5042) — use --network arcMainnet.`);
  for (const [n, a] of [["$ARCIRCLE", ARCIRCLE], ["USDC", USDC]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  console.log("Deploying ArcircleStaking on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("ArcircleStaking");
  const s = await F.deploy(ARCIRCLE, USDC);
  const rc = await s.deploymentTransaction().wait();
  const addr = await s.getAddress();
  console.log("\nArcircleStaking (veARCIRCLE):", addr);
  console.log("  block:     ", rc.blockNumber);
  console.log("  token:     ", await s.token());
  console.log("  rewards in:", await s.reward());
  console.log("  max lock:  ", Number(await s.MAXTIME()) / 86400, "days");
  console.log("\nNext: Vercel STAKING_ADDRESS =", addr, "STAKING_BLOCK =", rc.blockNumber, "· Redeploy · lock some $ARCIRCLE at arcircle.app/arc#staking · delete contracts/.env");
  console.log(`Verify: npx hardhat verify --network arcMainnet ${addr} ${ARCIRCLE} ${USDC}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
