// Deploys ArcLaunchDrop — the Launch Drop vault: every ArcPad coin's 4% goes to veARCIRCLE holders, pro rata at the
// start of the week the coin launched, claimed by holders or pushed to them by anyone
// (contracts/ArcLaunchDrop.sol).
//
//   npx hardhat run scripts/deploy-arc-launch-drop.js --network arcMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any wallet with a little USDC on Arc for gas (not the old 0x80e1…8bc7). It owns nothing
//                          afterwards: the vault has no owner, no admin and no fee.
//   LAUNCHDROP_FACTORIES   optional: more ArcPad factory addresses, comma-separated (a future factory v2). The live
//                          HomepadFactoryArc is always included. The list can't be changed after deployment.
// After deploying:
//   1. tell Claude the address it prints (it goes into config-arc.js LAUNCHDROP_ADDRESS), or set Vercel
//      LAUNCHDROP_ADDRESS and Redeploy;
//   2. for each new coin, from the treasury wallet: arcircle.app/arc#staking → Launch Drop console → "Deposit 4%"
//      (approve + deposit, two transactions). That's the last manual step — holders claim, or anyone pushes;
//   3. delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;

const STAKING = "0x301E1e8dcB43cDddD3244889063aD4220536b38A"; // ArcircleStaking (veARCIRCLE)
const FACTORY = "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E"; // HomepadFactoryArc (ArcPad)
const START_WEEK = 1791417600; // Thu 8 Oct 2026 00:00 UTC — coins launched from this week on
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 5042) throw new Error(`This is chain ${net.chainId}, not Arc (5042) — use --network arcMainnet.`);

  const extra = (process.env.LAUNCHDROP_FACTORIES || "").split(",").map((s) => s.trim()).filter(Boolean);
  const factories = [FACTORY];
  for (const a of extra) {
    if (!ethers.isAddress(a)) throw new Error(`LAUNCHDROP_FACTORIES: ${a} is not an address.`);
    if (!factories.some((f) => f.toLowerCase() === a.toLowerCase())) factories.push(ethers.getAddress(a));
  }
  if (factories.length > 4) throw new Error("At most 4 factories.");
  for (const [n, a] of [["ArcircleStaking", STAKING], ...factories.map((f) => ["ArcPad factory", f])]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  // sanity: the staking contract answers the reads the vault relies on, and each factory has the launch getters
  const st = new ethers.Contract(STAKING, ["function totalSupplyAt(uint256) view returns (uint256)", "function WEEK() view returns (uint256)"], deployer);
  if (Number(await st.WEEK()) !== 604800) throw new Error("Staking WEEK isn't 7 days.");
  await st.totalSupplyAt(START_WEEK);
  for (const f of factories) {
    const fc = new ethers.Contract(f, ["function launchCount() view returns (uint256)", "function launchIndexOf(address) view returns (uint256)"], deployer);
    await fc.launchIndexOf(ethers.ZeroAddress);
    console.log("  factory", f, "·", String(await fc.launchCount().catch(() => "?")), "launches");
  }

  console.log("Deploying ArcLaunchDrop on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("ArcLaunchDrop");
  const v = await F.deploy(STAKING, factories, START_WEEK);
  const rc = await v.deploymentTransaction().wait();
  const addr = await v.getAddress();
  console.log("\nArcLaunchDrop:", addr);
  console.log("  block:      ", rc.blockNumber);
  console.log("  veARCIRCLE: ", await v.staking());
  console.log("  factories:  ", (await v.factories()).join(", "));
  console.log("  start week: ", new Date(Number(await v.startWeek()) * 1000).toISOString());
  console.log("\nNext: tell Claude LAUNCHDROP_ADDRESS =", addr, "(block", rc.blockNumber + ") · deposit each coin's 4% from the treasury console · delete contracts/.env");
  const argsFile = require("path").join(__dirname, "args-arc-launch-drop.js");
  require("fs").writeFileSync(argsFile, `module.exports = ${JSON.stringify([STAKING, factories, START_WEEK])};\n`);
  console.log(`Verify: npx hardhat verify --network arcMainnet --constructor-args scripts/args-arc-launch-drop.js ${addr}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
