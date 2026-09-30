// Deploys ArciaAgentFactory — ARCIA AGENT's per-token burn vaults (ARCIRCLE PAD · ARCIA AGENT).
//
//   npx hardhat run scripts/deploy-arcia-agent.js --network arcMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any funded wallet for gas (not the old 0x80e1…8bc7). It gets no rights.
//   AGENT_OWNER            your main wallet address (not a key): the global stop, ARCIA's key rotation (24h delay),
//                          the $ARCIRCLE fee to open a vault, and which pool hooks are accepted. It can NOT touch
//                          anyone's vault money.
//   AGENT_OPERATOR         the address of ARCIA AGENT's own trading key (a NEW wallet, not the desk's key):
//                          the only key that can call buyAndBurn on the vaults. Keep a little USDC in it for gas.
// After deploying:
//   1. config-arc.js → CONFIG.ARCIA_AGENT.FACTORY = the address it prints;
//   2. Vercel: ARCIA_AGENT_FACTORY = the factory, ARCIA_AGENT_KEY = the operator wallet's key (Sensitive), Redeploy;
//   3. delete contracts/.env.
// ArcPad's own hook (0x484d…c044) is allowed here too, so ArcPad coins can have vaults; Argus hooks (0x2044, 0x20cc)
// are allowed by pattern, like ArciaDesk.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Arc
const USDC = "0x3600000000000000000000000000000000000000"; // Arc's USDC, ERC-20 face (6 decimals)
const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const ARCPAD_HOOK = "0x484d416e73eb44d276ddef04cdbadf2f4907c044";
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const owner = process.env.AGENT_OWNER || "", operator = process.env.AGENT_OPERATOR || "";
  if (!ethers.isAddress(owner)) throw new Error("Set AGENT_OWNER to your main wallet's address.");
  if (!ethers.isAddress(operator)) throw new Error("Set AGENT_OPERATOR to ARCIA AGENT's new trading wallet address.");
  if (owner.toLowerCase() === operator.toLowerCase()) throw new Error("AGENT_OWNER and AGENT_OPERATOR must be different wallets — the operator key lives on the server.");
  for (const [n, a] of [["PoolManager", POOL_MANAGER], ["USDC", USDC], ["$ARCIRCLE", ARCIRCLE]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  console.log("Deploying ArciaAgentFactory on", hre.network.name, "from", deployer.address);
  // the deployer owns it for one transaction (to allow ArcPad's hook), then hands it to AGENT_OWNER
  const F = await ethers.getContractFactory("ArciaAgentFactory");
  const fac = await F.deploy(POOL_MANAGER, USDC, ARCIRCLE, deployer.address, operator);
  const rc = await fac.deploymentTransaction().wait();
  const addr = await fac.getAddress();
  await (await fac.setHookAllowed(ARCPAD_HOOK, true)).wait();
  await (await fac.setOwner(owner)).wait();
  console.log("\nArciaAgentFactory:", addr);
  console.log("  block:    ", rc.blockNumber);
  console.log("  owner:    ", await fac.owner());
  console.log("  operator: ", await fac.operator());
  console.log("  ArcPad hook allowed:", await fac.hookAllowed(ARCPAD_HOOK), "· Argus 0x2044:", await fac.hookPattern(0x2044), "· 0x20cc:", await fac.hookPattern(0x20cc));
  console.log("  fee to open a vault:", ethers.formatEther(await fac.createBurn()), "$ARCIRCLE (the owner can set one with setCreateBurn)");
  console.log("\nNext: config-arc.js CONFIG.ARCIA_AGENT.FACTORY =", addr, "· Vercel: ARCIA_AGENT_FACTORY =", addr, "and ARCIA_AGENT_KEY (Sensitive) · Redeploy · delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
