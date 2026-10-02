// Deploys ArciaAgentFactoryRH — ARCIA AGENT's burn vaults on Robinhood Chain (contracts/ArciaAgentRH.sol).
//
//   npx hardhat run scripts/deploy-arcia-agent-rh.js --network robinhoodMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any wallet with a little ETH on Robinhood Chain for gas (not the old 0x80e1…8bc7). It gets no rights.
//   AGENT_OWNER            your main wallet address (not a key): the global stop, ARCIA's key rotation (24h delay), the
//                          $ARCIRCLE fee to open a vault, and which v4 hooks are accepted. It can NOT touch vault money.
//   AGENT_OPERATOR         the address of ARCIA AGENT's trading key — the same wallet as on Arc is fine (its key is
//                          ARCIA_AGENT_KEY on the server); keep a little ETH in it on Robinhood Chain for gas.
// Vaults buy where Robinhood Chain coins trade: the Uniswap v3 factory's WETH pools (pons) and v4 pools paired with
// native ETH or WETH — no hook, or the Bags hook (allowed here, like ARCIA DESK RH).
// After deploying:
//   1. Vercel: ARCIA_AGENT_RH_FACTORY = the address it prints (and ARCIA_AGENT_RH_KEY only if the operator isn't
//      ARCIA_AGENT_KEY's wallet), Redeploy — the site reads the factory from the server, nothing to change in the code;
//   2. delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Robinhood Chain
const V3_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa"; // Uniswap v3 factory (pons pools)
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const ARCIRCLE_RH = "0x6f9ebd0dfc6de9ed47eec18efeb69a9b97c71ee4"; // $ARCIRCLE on Robinhood Chain (OFT)
const BAGS_HOOK = "0x2380abf72c17aabab76480244759ac7e2932eecc";
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 4663) throw new Error(`This is chain ${net.chainId}, not Robinhood Chain (4663) — use --network robinhoodMainnet.`);
  const owner = process.env.AGENT_OWNER || "", operator = process.env.AGENT_OPERATOR || "";
  if (!ethers.isAddress(owner)) throw new Error("Set AGENT_OWNER to your main wallet's address.");
  if (!ethers.isAddress(operator)) throw new Error("Set AGENT_OPERATOR to ARCIA AGENT's trading wallet address.");
  if (owner.toLowerCase() === operator.toLowerCase()) throw new Error("AGENT_OWNER and AGENT_OPERATOR must be different wallets — the operator key lives on the server.");
  for (const [n, a] of [["PoolManager", POOL_MANAGER], ["Uniswap v3 factory", V3_FACTORY], ["WETH", WETH]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  const arcCode = await ethers.provider.getCode(ARCIRCLE_RH);
  const arcircle = arcCode && arcCode !== "0x" ? ARCIRCLE_RH : ethers.ZeroAddress; // no $ARCIRCLE there yet: opening a vault stays free
  console.log("Deploying ArciaAgentFactoryRH on", hre.network.name, "from", deployer.address);
  // the deployer owns it for one transaction (to allow the Bags hook), then hands it to AGENT_OWNER
  const F = await ethers.getContractFactory("ArciaAgentFactoryRH");
  const fac = await F.deploy(POOL_MANAGER, V3_FACTORY, WETH, arcircle, deployer.address, operator);
  const rc = await fac.deploymentTransaction().wait();
  const addr = await fac.getAddress();
  await (await fac.setHookAllowed(BAGS_HOOK, true)).wait();
  await (await fac.setOwner(owner)).wait();
  console.log("\nArciaAgentFactoryRH:", addr);
  console.log("  block:    ", rc.blockNumber);
  console.log("  owner:    ", await fac.owner());
  console.log("  operator: ", await fac.operator());
  console.log("  $ARCIRCLE:", await fac.arcircle(), "· Bags hook allowed:", await fac.hookAllowed(BAGS_HOOK), "· no-hook pools:", await fac.allowNoHook());
  console.log("\nNext: Vercel ARCIA_AGENT_RH_FACTORY =", addr, "· Redeploy · delete contracts/.env");
  console.log(`Verify: npx hardhat verify --network robinhoodMainnet ${addr} ${POOL_MANAGER} ${V3_FACTORY} ${WETH} ${arcircle} ${deployer.address} ${operator}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
