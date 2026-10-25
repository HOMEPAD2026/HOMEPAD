// Deploys CrimsonCelestialNFT — the Crimson Celestial set's MYTHIC pieces as NFTs on Arc (ARCIRCLE WORLD, step C).
//
//   ONLY=CrimsonCelestialNFT node scripts/compile.js
//   npx hardhat run scripts/deploy-crimson-celestial-nft.js --network arcMainnet --no-compile
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any funded wallet for gas (not the old 0x80e1…8bc7). It gets no rights.
//   CC_NFT_OWNER           your main wallet address (not a key): it can change the voucher signer (after a day) and the
//                          metadata link. It can NOT take anyone's NFT.
//   CC_NFT_SIGNER          the GM wallet that signs vouchers in its own wallet (in the game: Crimson Celestial → GM · NFT).
//                          The server never holds this key.
// After deploying:
//   1. world-mythic-data.js CC.NFT.ADDR = the contract's address (and the same in api — it reads world-mythic-data.js);
//      bump-cache + build; deploy;
//   2. delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";
const BASE = "https://www.arcircle.app/api/social?world=mythic-nft&id=";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const owner = process.env.CC_NFT_OWNER || "", signer = process.env.CC_NFT_SIGNER || "";
  if (!ethers.isAddress(owner)) throw new Error("Set CC_NFT_OWNER to your main wallet's address.");
  if (!ethers.isAddress(signer)) throw new Error("Set CC_NFT_SIGNER to the GM wallet that will sign vouchers.");
  console.log("deployer", deployer.address, "owner", owner, "signer", signer);
  const nft = await (await ethers.getContractFactory("CrimsonCelestialNFT")).deploy(owner, signer, BASE);
  await nft.waitForDeployment();
  console.log("CrimsonCelestialNFT", await nft.getAddress());
  console.log("Next: put that address in world-mythic-data.js CC.NFT.ADDR, run bump-cache.sh, deploy.");
}
main().catch((e) => { console.error(e); process.exit(1); });
