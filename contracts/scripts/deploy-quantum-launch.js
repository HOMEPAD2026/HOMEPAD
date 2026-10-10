// Deploys Quantum Launch on Arc (contracts/QuantumLaunch.sol — arcpad.html#quantum, arc-quantum.js): QuantumPad, which
// opens one QuantumBatch per launch. A coin is announced, USDC is committed for a window (1 min – 1 h), then one
// transaction launches it on ArcPad (HomepadFactoryArc) and buys with everything committed: everyone at one price.
//
//   npx hardhat run scripts/deploy-quantum-launch.js --network arcMainnet
//
// contracts/.env needs only DEPLOYER_PRIVATE_KEY: any wallet with a little USDC for gas on Arc. Never the old deployer
// 0x80e1…8bc7. QuantumPad has no owner and nothing to configure: it only needs ArcPad's factory and USDC.
// The script checks the factory (launch fee, fee cap), deploys, dry-runs an open() with eth_call (nothing is sent),
// writes scripts/args-quantum-launch.js and tries to verify on ArcScan.
const hre = require("hardhat");
const { ethers } = hre;

const FACTORY = "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E"; // HomepadFactoryArc (ArcPad)
const USDC = "0x3600000000000000000000000000000000000000";
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (![5042, 5042002, 31337].includes(Number(net.chainId))) throw new Error(`Chain ${net.chainId}: use arcMainnet.`);
  for (const [n, a] of [["ArcPad factory", FACTORY], ["USDC", USDC]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  const f = new ethers.Contract(FACTORY, ["function LAUNCH_FEE() view returns (uint256)", "function MAX_EXTRA_FEE_BPS() view returns (uint16)", "function launchCount() view returns (uint256)"], deployer);
  const [fee, cap, n] = await Promise.all([f.LAUNCH_FEE(), f.MAX_EXTRA_FEE_BPS(), f.launchCount()]);
  console.log("ArcPad factory:", FACTORY, `· launch fee ${ethers.formatEther(fee)} USDC · add-on fee up to ${Number(cap) / 100}% · ${n} launches`);
  console.log("deployer:", deployer.address, "· balance", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "USDC");

  const args = [FACTORY, USDC];
  const pad = await (await ethers.getContractFactory("QuantumPad")).deploy(...args);
  const rc = await pad.deploymentTransaction().wait();
  const addr = await pad.getAddress();
  require("fs").writeFileSync(require("path").join(__dirname, "args-quantum-launch.js"), "module.exports = " + JSON.stringify(args) + ";\n");
  console.log("\nQuantumPad:", addr, " block", rc.blockNumber);

  // dry run: open a 1-minute Quantum Launch with eth_call (nothing is sent, no fee is paid)
  try {
    const b = await pad.open.staticCall("Dry Run", "DRY", 4_000_000_000n, 0, { imageUrl: "", description: "", twitter: "", telegram: "", discord: "", website: "" }, 60, 0, { value: fee });
    console.log("  open():    would create a batch at", b);
  } catch (e) { console.log("  open():    the dry run failed:", String((e && (e.reason || e.shortMessage)) || e).split("\n")[0]); }
  try {
    await new Promise((r) => setTimeout(r, 15000));
    await hre.run("verify:verify", { address: addr, constructorArguments: args });
    console.log("  verified");
  } catch (e) {
    console.log("  verification didn't finish:", String((e && e.message) || e).split("\n")[0]);
    console.log("  later: npx hardhat verify --network arcMainnet --constructor-args scripts/args-quantum-launch.js", addr);
  }
  console.log(`\nNext: send back the QuantumPad address ${addr} and block ${rc.blockNumber} (they go into config-arc.js QUANTUM_PAD_ADDRESS / QUANTUM_FROM_BLOCK) · delete contracts/.env`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
