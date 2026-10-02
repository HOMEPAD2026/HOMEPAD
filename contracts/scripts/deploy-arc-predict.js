// Deploys ArcPredict — ARCIRCLE Predict, UP / DOWN rounds on Arc tokens paid in native USDC (contracts/ArcPredict.sol).
//
//   npx hardhat run scripts/deploy-arc-predict.js --network arcMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any wallet with a little USDC on Arc for gas (not the old 0x80e1…8bc7). It owns the contract for
//                          a few transactions (to set up community listing), then hands it to PREDICT_OWNER.
//   PREDICT_OWNER          your main wallet address (not a key): fee (≤ 3%), referral share, caps, listing price, pause.
//                          It can NOT touch money already in a round.
//   PREDICT_OPERATOR       the keeper's wallet address — ORDERS_KEEPER_KEY's wallet is fine. It samples the pools at each
//                          round boundary (the price always comes from the pool). Keep a little USDC in it for gas.
//   PREDICT_LIST_BURN      optional: $ARCIRCLE anyone burns to open a market (default 50000; 0 = free; "off" = team only)
// Fees: 2% of a pot with a winner; 25% of that goes to referrers, the rest to ArcircleFeeBurn (the one ARCIRCLE Orders
// uses) — half of it buys $ARCIRCLE and burns it, half goes to the treasury, once an hour by the Orders keeper.
// Live: 0x41149F8ce23d9B4E737e51C97fFE14bBb4C09ce6 (block 23867674, 2026-10-02) — the default in api/_predict.mjs.
// After deploying:
//   1. Vercel: PREDICT_ADDRESS = the address it prints (PREDICT_KEEPER_KEY only if the operator isn't ORDERS_KEEPER_KEY's
//      wallet), Redeploy;
//   2. cron-job.org: a new job every minute → https://www.arcircle.app/api/desk?predicttick=1&key=<CRON_SECRET>;
//   3. open /arc#predict with the owner wallet and list the first market(s);
//   4. delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Arc
const USDC = "0x3600000000000000000000000000000000000000"; // Arc's USDC, ERC-20 face
const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const FEE_BURN = "0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034"; // ArcircleFeeBurn (ARCIRCLE Orders): 50% burn, 50% treasury
const ARCPAD_HOOK = "0x484D416E73Eb44d276DDeF04cDBAdf2f4907c044";
const ARGUS_PATTERNS = [0x2044, 0x20cc]; // Argus portals up to #7, Portal #8
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 5042) throw new Error(`This is chain ${net.chainId}, not Arc (5042) — use --network arcMainnet.`);
  const owner = process.env.PREDICT_OWNER || "", operator = process.env.PREDICT_OPERATOR || "";
  if (!ethers.isAddress(owner)) throw new Error("Set PREDICT_OWNER to your main wallet's address.");
  if (!ethers.isAddress(operator)) throw new Error("Set PREDICT_OPERATOR to the keeper wallet's address.");
  if (owner.toLowerCase() === operator.toLowerCase()) throw new Error("PREDICT_OWNER and PREDICT_OPERATOR must be different wallets — the operator key lives on the server.");
  const lb = String(process.env.PREDICT_LIST_BURN || "50000").trim();
  const listOpen = lb !== "off", listBurn = listOpen ? ethers.parseEther(lb) : 0n;
  for (const [n, a] of [["PoolManager", POOL_MANAGER], ["USDC", USDC], ["$ARCIRCLE", ARCIRCLE], ["ArcircleFeeBurn", FEE_BURN]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  console.log("Deploying ArcPredict on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("ArcPredict");
  const pr = await F.deploy(POOL_MANAGER, USDC, ARCIRCLE, deployer.address, operator, FEE_BURN);
  const rc = await pr.deploymentTransaction().wait();
  const addr = await pr.getAddress();
  // community listing: Argus and ArcPad pools (and pools without a hook), $5,000 of USDC in range at least
  for (const b of ARGUS_PATTERNS) await (await pr.setHookPattern(b, true)).wait();
  await (await pr.setHookAllowed(ARCPAD_HOOK, true)).wait();
  await (await pr.setListing(listOpen, listBurn)).wait();
  await (await pr.setOwner(owner)).wait();
  console.log("\nArcPredict:", addr);
  console.log("  block:    ", rc.blockNumber);
  console.log("  owner:    ", await pr.owner());
  console.log("  operator: ", await pr.operator());
  console.log("  fee:      ", Number(await pr.feeBps()) / 100 + "% (referrers " + Number(await pr.refShare()) / 100 + "% of it) →", await pr.feeTo());
  console.log("  listing:  ", listOpen ? `open, ${lb} $ARCIRCLE burned per market` : "team only");
  console.log("\nNext: Vercel PREDICT_ADDRESS =", addr, "· Redeploy · cron-job.org every minute: /api/desk?predicttick=1&key=<CRON_SECRET> · list markets at /arc#predict · delete contracts/.env");
  console.log(`Verify: npx hardhat verify --network arcMainnet ${addr} ${POOL_MANAGER} ${USDC} ${ARCIRCLE} ${deployer.address} ${operator} ${FEE_BURN}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
