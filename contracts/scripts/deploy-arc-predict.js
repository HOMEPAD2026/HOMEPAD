// Deploys ArcPredict — ARCIRCLE Predict, UP / DOWN rounds on Arc tokens paid in USDC (contracts/ArcPredict.sol).
//
//   npx hardhat run scripts/deploy-arc-predict.js --network arcMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any wallet with a little USDC on Arc for gas (not the old 0x80e1…8bc7). It gets no rights.
//   PREDICT_OWNER          your main wallet address (not a key): lists markets (from the Predict page), sets the fee
//                          (≤ 3%) and the caps, pauses new bets. It can NOT touch money already in a round.
//   PREDICT_OPERATOR       the keeper's wallet address — the same wallet as ORDERS_KEEPER_KEY is fine. It samples the
//                          pools after each round and settles (the price always comes from the pool). Keep a little
//                          USDC in it for gas.
//   PREDICT_FEE_TO         optional: where the protocol fee goes (default: PREDICT_OWNER)
// After deploying:
//   1. Vercel: PREDICT_ADDRESS = the address it prints (PREDICT_KEEPER_KEY only if the operator isn't ORDERS_KEEPER_KEY's
//      wallet), Redeploy;
//   2. cron-job.org: a new job every minute → https://www.arcircle.app/api/desk?predicttick=1&key=<CRON_SECRET>;
//   3. open /arc#predict with the owner wallet and list the first markets ("List a market");
//   4. delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Arc
const USDC = "0x3600000000000000000000000000000000000000"; // Arc's USDC, ERC-20 face
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 5042) throw new Error(`This is chain ${net.chainId}, not Arc (5042) — use --network arcMainnet.`);
  const owner = process.env.PREDICT_OWNER || "", operator = process.env.PREDICT_OPERATOR || "", feeTo = process.env.PREDICT_FEE_TO || owner;
  if (!ethers.isAddress(owner)) throw new Error("Set PREDICT_OWNER to your main wallet's address.");
  if (!ethers.isAddress(operator)) throw new Error("Set PREDICT_OPERATOR to the keeper wallet's address.");
  if (!ethers.isAddress(feeTo)) throw new Error("PREDICT_FEE_TO isn't an address.");
  if (owner.toLowerCase() === operator.toLowerCase()) throw new Error("PREDICT_OWNER and PREDICT_OPERATOR must be different wallets — the operator key lives on the server.");
  for (const [n, a] of [["PoolManager", POOL_MANAGER], ["USDC", USDC]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  console.log("Deploying ArcPredict on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("ArcPredict");
  const pr = await F.deploy(POOL_MANAGER, USDC, owner, operator, feeTo);
  const rc = await pr.deploymentTransaction().wait();
  const addr = await pr.getAddress();
  console.log("\nArcPredict:", addr);
  console.log("  block:    ", rc.blockNumber);
  console.log("  owner:    ", await pr.owner());
  console.log("  operator: ", await pr.operator());
  console.log("  fee:      ", Number(await pr.feeBps()) / 100 + "% →", await pr.feeTo());
  console.log("\nNext: Vercel PREDICT_ADDRESS =", addr, "· Redeploy · cron-job.org every minute: /api/desk?predicttick=1&key=<CRON_SECRET> · list markets at /arc#predict · delete contracts/.env");
  console.log(`Verify: npx hardhat verify --network arcMainnet ${addr} ${POOL_MANAGER} ${USDC} ${owner} ${operator} ${feeTo}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
