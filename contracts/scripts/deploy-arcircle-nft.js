// Deploys the ARCIRCLE NFT Vault and its Pons fee router on Robinhood Chain (contracts/ArcircleNft.sol):
//   ArcircleNftVault   holds ETH, buys NFTs of listed collections through Seaport only, raffles them to $ARCIRCLE holders
//   ArcircleNftRouter  a Pons V2 coin's creatorFeeRecipient: its creator fees, 50% to the vault / 50% to the treasury
//
//   npx hardhat run scripts/deploy-arcircle-nft.js --network robinhoodMainnet
//
// contracts/.env needs DEPLOYER_PRIVATE_KEY: any wallet with a little ETH on Robinhood Chain (it gets no role).
// Optional: NFT_KEEPER=0x… (the server keeper's address; otherwise the curator is the keeper until it names one on the
// NFT page). Never the old deployer 0x80e1…8bc7.
// After deploying, send the two printed addresses back. The router address is what the coin's Pons launch must name as
// its creator fee recipient — Pons fixes that at launch, so deploy this BEFORE the launch.
const hre = require("hardhat");
const { ethers } = hre;

const PONS_V2_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"; // pons-labs README, verified on Blockscout
const PONS_V2_FEE_ESCROW = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e"; // docs.ponsfamily.com/docs/v2
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"; // Robinhood Chain WETH
const SEAPORT_16 = "0x0000000000000068F116a894984e2DB1123eB395"; // Seaport 1.6 (same address on every chain it's on)
const ARBSYS = "0x0000000000000000000000000000000000000064";
const TREASURY = "0x9C36023A5E11F7C5013403051cD94a7e4e6887e7"; // 50% of the fees
const CURATOR = "0x809E486817ADcBdF244060f4C8C24B4c694AF749"; // lists collections, names the keeper; the router's manager
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  if (hre.network.config.chainId !== 4663) throw new Error("Run this with --network robinhoodMainnet (chain 4663).");
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const P = ethers.provider;
  for (const [n, a] of [["Pons V2 factory", PONS_V2_FACTORY], ["Pons V2 fee escrow", PONS_V2_FEE_ESCROW], ["WETH", WETH], ["Seaport 1.6", SEAPORT_16]]) {
    const code = await P.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network — stop and check.`);
  }
  const f = new ethers.Contract(PONS_V2_FACTORY, ["function feeEscrow() view returns (address)"], P);
  if ((await f.feeEscrow()).toLowerCase() !== PONS_V2_FEE_ESCROW.toLowerCase()) throw new Error("The Pons factory's fee escrow isn't the one this script names — stop and check.");
  // Arbitrum's ArbSys gives real L2 block numbers / hashes for the raffle draws
  let arbSys = ethers.ZeroAddress;
  try {
    const a = new ethers.Contract(ARBSYS, ["function arbBlockNumber() view returns (uint256)", "function arbBlockHash(uint256) view returns (bytes32)"], P);
    const n = await a.arbBlockNumber();
    const h = await a.arbBlockHash(n - 1n);
    if (n > 0n && h !== ethers.ZeroHash) arbSys = ARBSYS;
  } catch { /* not an Arbitrum chain */ }
  console.log("Block source for draws:", arbSys === ethers.ZeroAddress ? "block.number / blockhash" : "ArbSys (L2 blocks)");
  const keeper = process.env.NFT_KEEPER && ethers.isAddress(process.env.NFT_KEEPER) ? process.env.NFT_KEEPER : CURATOR;

  console.log("Deploying the ARCIRCLE NFT Vault on", hre.network.name, "from", deployer.address);
  const V = await ethers.getContractFactory("ArcircleNftVault");
  const vault = await V.deploy(SEAPORT_16, arbSys, CURATOR, keeper);
  const vrc = await vault.deploymentTransaction().wait();
  const vaultAddr = await vault.getAddress();
  const R = await ethers.getContractFactory("ArcircleNftRouter");
  const router = await R.deploy(PONS_V2_FEE_ESCROW, PONS_V2_FACTORY, WETH, vaultAddr, TREASURY, CURATOR);
  const rrc = await router.deploymentTransaction().wait();
  const routerAddr = await router.getAddress();

  console.log("\nArcircleNftVault: ", vaultAddr, " block", vrc.blockNumber);
  console.log("  seaport:  ", await vault.seaport());
  console.log("  curator:  ", await vault.curator());
  console.log("  keeper:   ", await vault.keeper());
  console.log("ArcircleNftRouter:", routerAddr, " block", rrc.blockNumber);
  console.log("  vault:    ", await router.vault(), "(50%)");
  console.log("  treasury: ", await router.treasury(), "(50%)");
  console.log("  manager:  ", await router.manager());
  const vArgs = [SEAPORT_16, arbSys, CURATOR, keeper], rArgs = [PONS_V2_FEE_ESCROW, PONS_V2_FACTORY, WETH, vaultAddr, TREASURY, CURATOR];
  const fs = require("fs"), path = require("path");
  fs.writeFileSync(path.join(__dirname, "..", "nft-vault-args.js"), `module.exports = ${JSON.stringify(vArgs)};\n`);
  fs.writeFileSync(path.join(__dirname, "..", "nft-router-args.js"), `module.exports = ${JSON.stringify(rArgs)};\n`);
  for (const [addr, args, file] of [[vaultAddr, vArgs, "nft-vault-args.js"], [routerAddr, rArgs, "nft-router-args.js"]]) {
    try {
      await new Promise((r) => setTimeout(r, 15000));
      await hre.run("verify:verify", { address: addr, constructorArguments: args });
      console.log("  verified", addr);
    } catch (e) {
      console.log("  verification didn't finish for", addr, "—", String((e && e.message) || e).split("\n")[0]);
      console.log(`  later: npx hardhat verify --network robinhoodMainnet --constructor-args ${file} ${addr}`);
    }
  }
  console.log(`\nNext: send back  NFT vault ${vaultAddr} (block ${vrc.blockNumber})  ·  NFT router ${routerAddr}  ·  delete contracts/.env`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
