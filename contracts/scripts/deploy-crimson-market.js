// Deploys CrimsonMarket — Crimson Celestial NFTs bought and sold for USDC on Arc, wallet to wallet (ARCIRCLE WORLD, 2026-10-26).
//
//   ONLY=CrimsonMarket node scripts/compile.js
//   npx hardhat run scripts/deploy-crimson-market.js --network arcMainnet --no-compile
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any funded wallet for gas (not the old 0x80e1…8bc7). It gets no rights.
//   CC_MKT_OWNER           your main wallet address (not a key): it can change the fee (at most 10 %) and where it goes.
//                          It can NOT take anyone's NFT or USDC — the market holds nothing.
//   CC_MKT_FEE_TO          where the 2 % platform fee goes (the treasury).
// After deploying:
//   1. world-mythic-data.js CC.NFTMKT.ADDR = the contract's address (the api reads the same file); bump-cache + build; deploy;
//   2. delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";
const NFT = "0x709E1B65c529567Fbe1C79dE278c2ABbA0086ff5"; // CrimsonCelestialNFT on Arc (2026-10-25)
const USDC = "0x3600000000000000000000000000000000000000"; // Arc's USDC
const FEE_BPS = 200;

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const owner = process.env.CC_MKT_OWNER || "", feeTo = process.env.CC_MKT_FEE_TO || "";
  if (!ethers.isAddress(owner)) throw new Error("Set CC_MKT_OWNER to your main wallet's address.");
  if (!ethers.isAddress(feeTo)) throw new Error("Set CC_MKT_FEE_TO to the treasury's address.");
  console.log("deployer", deployer.address, "owner", owner, "feeTo", feeTo, "fee", FEE_BPS / 100 + "%");
  const m = await (await ethers.getContractFactory("CrimsonMarket")).deploy(owner, NFT, USDC, feeTo, FEE_BPS);
  await m.waitForDeployment();
  console.log("CrimsonMarket", await m.getAddress());
  console.log("Next: put that address in world-mythic-data.js CC.NFTMKT.ADDR, run bump-cache.sh, deploy.");
}
main().catch((e) => { console.error(e); process.exit(1); });
