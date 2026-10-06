// Deploys ArciaWorks — ARCIA WORKS: a register of agents and a USDC escrow for jobs between them, on Arc
// (contracts/ArciaWorks.sol; arcpad.html#works, arc-works.js, api/_works.mjs).
//
//   WORKS_OWNER=0x… WORKS_FEE_TO=0x… npx hardhat run scripts/deploy-arcia-works.js --network arcMainnet
//
// contracts/.env needs only DEPLOYER_PRIVATE_KEY: any wallet with a little USDC on Arc for gas (never the old deployer
// 0x80e1…8bc7). It owns nothing afterwards.
//   WORKS_OWNER    your main wallet's ADDRESS: sets the fee (at most 5%), the fee wallet and the arbiter, pauses new
//                  jobs. It can never move the USDC of a job.
//   WORKS_FEE_TO   the ADDRESS that receives the fee on paid jobs.
//   WORKS_FEE_BPS  optional, default 200 (2%).
//   WORKS_ARBITER  optional ADDRESS that splits disputed jobs, default WORKS_OWNER. If it hasn't decided within
//                  14 days, either party can split the job 50 / 50.
// After deploying: send the printed address and block back (they go into config-arc.js CONFIG.WORKS_ADDRESS /
// WORKS_BLOCK and api/_works.mjs), verify the source (VERIFY-ARC.md), then delete contracts/.env.
// ARCIA joins as the first worker by herself: the site's cron registers her wallet (ARCIA 402's) on its next run.
const hre = require("hardhat");
const { ethers } = hre;

const USDC = "0x3600000000000000000000000000000000000000"; // Arc's USDC, ERC-20 face (6 decimals)
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 5042) throw new Error(`This is chain ${net.chainId}, not Arc (5042) — use --network arcMainnet.`);
  const owner = (process.env.WORKS_OWNER || "").trim(), feeTo = (process.env.WORKS_FEE_TO || "").trim();
  const arbiter = (process.env.WORKS_ARBITER || owner).trim(), bps = Number(process.env.WORKS_FEE_BPS || 200);
  if (!ethers.isAddress(owner)) throw new Error("Set WORKS_OWNER to your main wallet's address (never a key).");
  if (!ethers.isAddress(feeTo)) throw new Error("Set WORKS_FEE_TO to the fee wallet's address.");
  if (!ethers.isAddress(arbiter)) throw new Error("WORKS_ARBITER isn't an address.");
  if (!Number.isInteger(bps) || bps < 0 || bps > 500) throw new Error("WORKS_FEE_BPS must be 0–500 (5% at most).");
  for (const a of [owner, feeTo, arbiter]) if (a.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("The old deployer can't hold a role.");
  const code = await ethers.provider.getCode(USDC);
  if (!code || code === "0x") throw new Error(`No USDC contract at ${USDC} on this network.`);
  console.log("Deploying ArciaWorks on", hre.network.name, "from", deployer.address);
  console.log("  owner:  ", owner, "\n  fee to: ", feeTo, `(${bps / 100}%)`, "\n  arbiter:", arbiter);
  const W = await ethers.getContractFactory("ArciaWorks");
  const w = await W.deploy(USDC, owner, feeTo, bps, arbiter);
  const rc = await w.deploymentTransaction().wait();
  const addr = await w.getAddress();
  console.log("\nArciaWorks:", addr);
  console.log("  block:", rc.blockNumber);
  console.log("  owner:", await w.owner(), "· fee:", Number(await w.feeBps()) / 100 + "%", "→", await w.feeTo(), "· arbiter:", await w.arbiter());
  console.log("\nNext: send the address and block back (config-arc.js CONFIG.WORKS_ADDRESS / WORKS_BLOCK) · verify · delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
