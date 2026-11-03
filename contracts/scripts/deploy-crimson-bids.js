// Deploys CrimsonBids — USDC offers (bids) for Crimson Celestial NFTs on Arc, held in escrow (ARCIRCLE WORLD, 2026-11-03).
//
// NOT RUN YET. Its Arc Studio audit is pending (contracts/audits/arc-studio-2026-11-03.md): audit first, then deploy.
//
//   ONLY=CrimsonBids node scripts/compile.js
//   npx hardhat run scripts/deploy-crimson-bids.js --network arcMainnet --no-compile
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any funded wallet for gas (not the old 0x80e1…8bc7). It gets no rights.
//   CC_BIDS_OWNER          your main wallet address (not a key): it can only change the fee (at most 10 %) and where it
//                          goes (two-step ownership; it can't renounce). It can NOT take anyone's escrowed USDC or NFT.
//   CC_BIDS_FEE_TO         where the 2 % platform fee goes (the treasury).
// After deploying: put the address in the game's config, then delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";
const NFT = "0x709E1B65c529567Fbe1C79dE278c2ABbA0086ff5"; // CrimsonCelestialNFT on Arc (2026-10-25)
const USDC = "0x3600000000000000000000000000000000000000"; // Arc's USDC, ERC-20 face (6 decimals)

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const owner = process.env.CC_BIDS_OWNER || "", feeTo = process.env.CC_BIDS_FEE_TO || "";
  if (!ethers.isAddress(owner)) throw new Error("Set CC_BIDS_OWNER to your main wallet's address.");
  if (!ethers.isAddress(feeTo)) throw new Error("Set CC_BIDS_FEE_TO to the treasury's address.");
  for (const [n, a] of [["CrimsonCelestialNFT", NFT], ["USDC", USDC]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  const usdc = new ethers.Contract(USDC, ["function decimals() view returns (uint8)"], deployer);
  if (Number(await usdc.decimals()) !== 6) throw new Error("USDC at that address doesn't report 6 decimals.");
  console.log("deployer", deployer.address, "owner", owner, "feeTo", feeTo);
  const b = await (await ethers.getContractFactory("CrimsonBids")).deploy(NFT, USDC, feeTo, owner);
  await b.waitForDeployment();
  console.log("CrimsonBids", await b.getAddress(), "fee", Number(await b.feeBps()) / 100 + "%");
}
main().catch((e) => { console.error(e); process.exit(1); });
