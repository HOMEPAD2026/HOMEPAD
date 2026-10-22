// Deploys AgentDimensionFactory — AGENT DIMENSION's per-player trading vaults (ARCIRCLE WORLD · AD3).
//
//   ONLY=AgentDimension node scripts/compile.js          (offline compile, just this contract + the mocks)
//   npx hardhat run scripts/deploy-agent-dimension.js --network arcMainnet --no-compile
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any funded wallet for gas (not the old 0x80e1…8bc7). It gets no rights.
//   AGENT_DIM_OWNER        your main wallet address (not a key): the global stop, the agent key's rotation (24h delay),
//                          the fee (a higher fee waits 24h), the fee wallet, and which tokens' pools are listed.
//                          It can NOT touch anyone's vault money.
//   AGENT_DIM_OPERATOR     the address of the agents' own trading key (a NEW wallet, not ARCIA's or the desk's):
//                          the only key that can call trade() on the vaults. Keep a little USDC in it for gas.
//   AGENT_DIM_FEE_TO       where the $ARCIRCLE trade fees go (e.g. the treasury)
//   AGENT_DIM_FEE          the fee per trade in whole $ARCIRCLE (default 10)
//   AGENT_DIM_POOLS        optional: a JSON list of pool keys to list now
//                          ([{ "currency0", "currency1", "fee", "tickSpacing", "hooks" }, …], each a USDC pool)
// After deploying:
//   1. Vercel: AGENT_DIM_FACTORY = the factory, AGENT_DIM_KEY = the operator wallet's key (Sensitive), Redeploy;
//   2. a cron for the agents' runs: /api/social?world=agent-vault-tick&key=<CRON_SECRET> (every 10–15 minutes);
//   3. delete contracts/.env.
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
  const owner = process.env.AGENT_DIM_OWNER || "", operator = process.env.AGENT_DIM_OPERATOR || "", feeTo = process.env.AGENT_DIM_FEE_TO || "";
  const fee = ethers.parseEther(String(process.env.AGENT_DIM_FEE || "10"));
  if (!ethers.isAddress(owner)) throw new Error("Set AGENT_DIM_OWNER to your main wallet's address.");
  if (!ethers.isAddress(operator)) throw new Error("Set AGENT_DIM_OPERATOR to the agents' new trading wallet address.");
  if (!ethers.isAddress(feeTo)) throw new Error("Set AGENT_DIM_FEE_TO to the wallet that receives the $ARCIRCLE fees.");
  if (owner.toLowerCase() === operator.toLowerCase()) throw new Error("AGENT_DIM_OWNER and AGENT_DIM_OPERATOR must be different wallets — the operator key lives on the server.");
  for (const [n, a] of [["PoolManager", POOL_MANAGER], ["USDC", USDC], ["$ARCIRCLE", ARCIRCLE]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  console.log("Deploying AgentDimensionFactory on", hre.network.name, "from", deployer.address);
  // the deployer owns it for a few transactions (ArcPad's hook, the first pools), then hands it to AGENT_DIM_OWNER
  const F = await ethers.getContractFactory("AgentDimensionFactory");
  const fac = await F.deploy(POOL_MANAGER, USDC, ARCIRCLE, deployer.address, operator, feeTo, fee);
  const rc = await fac.deploymentTransaction().wait();
  const addr = await fac.getAddress();
  await (await fac.setHookAllowed(ARCPAD_HOOK, true)).wait();
  const pools = process.env.AGENT_DIM_POOLS ? JSON.parse(process.env.AGENT_DIM_POOLS) : [];
  for (const k of pools) { await (await fac.listPool(k)).wait(); console.log("  listed:", k.currency0, "/", k.currency1); }
  await (await fac.setOwner(owner)).wait();
  console.log("\nAgentDimensionFactory:", addr);
  console.log("  block:    ", rc.blockNumber);
  console.log("  owner:    ", await fac.owner());
  console.log("  operator: ", await fac.operator());
  console.log("  fee:      ", ethers.formatEther(await fac.tradeFee()), "$ARCIRCLE a trade →", await fac.feeTo());
  console.log("  listed tokens:", (await fac.listedTokens()).join(", ") || "(none yet — the owner lists pools with listPool)");
  console.log("\nNext: Vercel AGENT_DIM_FACTORY =", addr, "and AGENT_DIM_KEY (Sensitive) · a cron for /api/social?world=agent-vault-tick&key=… · Redeploy · delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
