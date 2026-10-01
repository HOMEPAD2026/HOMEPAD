// Deploys ArcPadPonsSplits on Robinhood Chain — ArcPad × Pons: one creator fee splitter per creator wallet,
// 70% the creator / 30% the ARCIRCLE PAD treasury, for Pons V2 coins launched through ArcPad.
//
//   npx hardhat run scripts/deploy-arcpad-pons-splits.js --network robinhoodMainnet
//
// contracts/.env needs only DEPLOYER_PRIVATE_KEY: any wallet with a little ETH on Robinhood Chain (it gets no role —
// the contract has no owner and nothing to configure later). Never the old deployer 0x80e1…8bc7.
// After deploying, send the printed address back: it goes into config-arc.js (PONS.SPLITS) and api/_pons-arcpad.mjs.
const hre = require("hardhat");
const { ethers } = hre;

const PONS_V2_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"; // pons-labs README, verified on Blockscout
const PONS_V2_FEE_ESCROW = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e"; // docs.ponsfamily.com/docs/v2
const TREASURY = "0xa066e6c5d1ac561a4065b9d6b00fef89c0bd02f8"; // the ARCIRCLE PAD treasury (Argus's 30% goes here too)
const PLATFORM_BPS = 3000;
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  if (hre.network.config.chainId !== 4663) throw new Error("Run this with --network robinhoodMainnet (chain 4663).");
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  for (const [n, a] of [["Pons V2 factory", PONS_V2_FACTORY], ["Pons V2 fee escrow", PONS_V2_FEE_ESCROW]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  // the factory must point at the same escrow (so the fees really land where the splitter claims them)
  const f = new ethers.Contract(PONS_V2_FACTORY, ["function feeEscrow() view returns (address)"], ethers.provider);
  const esc = (await f.feeEscrow()).toLowerCase();
  if (esc !== PONS_V2_FEE_ESCROW.toLowerCase()) throw new Error(`The Pons factory's fee escrow is ${esc}, not ${PONS_V2_FEE_ESCROW} — stop and check.`);
  // the treasury receives ETH here: it must be a wallet (no code), not a contract that might refuse it
  if ((await ethers.provider.getCode(TREASURY)) !== "0x") console.log("  note: the treasury address has contract code on Robinhood Chain — make sure it accepts ETH.");

  console.log("Deploying ArcPadPonsSplits on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("ArcPadPonsSplits");
  const s = await F.deploy(PONS_V2_FEE_ESCROW, PONS_V2_FACTORY, TREASURY, PLATFORM_BPS);
  const rc = await s.deploymentTransaction().wait();
  const addr = await s.getAddress();
  console.log("\nArcPadPonsSplits:", addr);
  console.log("  block:    ", rc.blockNumber);
  console.log("  escrow:   ", await s.escrow());
  console.log("  pons:     ", await s.ponsFactory());
  console.log("  treasury: ", await s.treasury(), `(${Number(await s.platformBps()) / 100}%)`);
  console.log("  example:  splitter for the deployer would be", await s.splitterOf(deployer.address));
  const args = [PONS_V2_FEE_ESCROW, PONS_V2_FACTORY, TREASURY, PLATFORM_BPS];
  require("fs").writeFileSync(require("path").join(__dirname, "..", "pons-splits-args.js"), `module.exports = ${JSON.stringify(args)};\n`);
  try {
    await new Promise((r) => setTimeout(r, 15000));
    await hre.run("verify:verify", { address: addr, constructorArguments: args });
    console.log("  verified on robinhoodchain.blockscout.com");
  } catch (e) {
    console.log("  verification didn't finish:", String((e && e.message) || e).split("\n")[0]);
    console.log(`  try again later: npx hardhat verify --network robinhoodMainnet --constructor-args pons-splits-args.js ${addr}`);
  }
  console.log("\nNext: send this address back (ArcPadPonsSplits:", addr + ") · delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
