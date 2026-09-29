// Deploys ArciaDesk — ARCIA's trading desk (ARCIRCLE PAD · ARCIA DESK).
//
//   npx hardhat run scripts/deploy-arcia-desk.js --network arcMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   the NEW trader wallet (it becomes the desk's operator; keep ~2–3 USDC in it for gas).
//                          Never the old deployer 0x80e1…8bc7.
//   DESK_OWNER             your own main wallet address (not a key): the only one that can withdraw, pause,
//                          change the caps or replace the operator.
//   DESK_OPERATOR          (optional) a different operator address; defaults to the deployer.
// After deploying:
//   1. send the trading money (USDC on Arc) to the desk address it prints — not to the trader wallet;
//   2. in Vercel: ARCIA_DESK_ADDRESS = the desk, ARCIA_DESK_KEY = the trader wallet's key (Sensitive), then Redeploy;
//   3. delete contracts/.env.
// Caps start at 12 USDC a buy, 200 USDC of buys a UTC day, 25 USDC of $ARCIRCLE burns a day (owner can change them).
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Arc
const USDC = "0x3600000000000000000000000000000000000000"; // Arc's USDC, ERC-20 face (6 decimals)
const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY (the new trader wallet) in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use the new trader wallet.");
  const owner = process.env.DESK_OWNER || "", operator = process.env.DESK_OPERATOR || deployer.address;
  if (!ethers.isAddress(owner)) throw new Error("Set DESK_OWNER to your main wallet's address.");
  if (owner.toLowerCase() === operator.toLowerCase()) throw new Error("DESK_OWNER and the operator should be different wallets — the operator key lives on the server.");
  for (const [n, a] of [["PoolManager", POOL_MANAGER], ["USDC", USDC], ["$ARCIRCLE", ARCIRCLE]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  console.log("Deploying ArciaDesk on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("ArciaDesk");
  const desk = await F.deploy(POOL_MANAGER, USDC, ARCIRCLE, owner, operator);
  const rc = await desk.deploymentTransaction().wait();
  const addr = await desk.getAddress();
  console.log("\nArciaDesk:", addr);
  console.log("  block:   ", rc.blockNumber);
  console.log("  owner:   ", await desk.owner());
  console.log("  operator:", await desk.operator());
  console.log("  caps:    ", `${ethers.formatUnits(await desk.maxTrade(), 6)} USDC a buy · ${ethers.formatUnits(await desk.dailyCap(), 6)} a day · burns ${ethers.formatUnits(await desk.burnCap(), 6)} a day`);
  console.log("\nNext: send the trading USDC to", addr, "· Vercel: ARCIA_DESK_ADDRESS =", addr, "and ARCIA_DESK_KEY (Sensitive) · Redeploy · delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
