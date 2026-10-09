// Deploys ArcPredictBands — ARCIRCLE Predict ×, multiplier rounds on Arc tokens paid in native USDC
// (contracts/ArcPredictBands.sol): the same rounds as ArcPredict, with four bands ("down more than x%", "down", "up",
// "up more than x%") instead of UP / DOWN, each band with its own pool.
//
//   npx hardhat run scripts/deploy-arc-predict-bands.js --network arcMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any wallet with a little USDC on Arc for gas (not the old 0x80e1…8bc7). It owns the contract for
//                          a few set-up transactions, then hands it to the owner.
// Optional (default: the same wallets as ARCIRCLE Predict on Arc, read from it):
//   PREDICT_OWNER          the owner (fee ≤ 3%, referral share, caps, listing price, pause — never money in a round)
//   PREDICT_OPERATOR       the keeper's wallet: the Predict keeper samples these rounds too, in the same cron job
//   PREDICT_LIST_BURN      $ARCIRCLE anyone burns to open a market (default 50000; 0 = free; "off" = team only)
// After deploying: tell Claude the address it prints (it goes into api/_predict-x.mjs PREDICTX_DEFAULT) — the keeper then
// opens $ARCIRCLE 5m / 15m / 1h markets by itself; delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDC = "0x3600000000000000000000000000000000000000";
const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const FEE_BURN = "0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034"; // ArcircleFeeBurn: 50% buys $ARCIRCLE and burns it, 50% treasury
const PREDICT = "0x41149F8ce23d9B4E737e51C97fFE14bBb4C09ce6"; // ARCIRCLE Predict (UP / DOWN) — its owner and operator are the defaults
const ARCPAD_HOOK = "0x484D416E73Eb44d276DDeF04cDBAdf2f4907c044";
const ARGUS_PATTERNS = [0x2044, 0x20cc];
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 5042) throw new Error(`This is chain ${net.chainId}, not Arc (5042) — use --network arcMainnet.`);
  const live = new ethers.Contract(PREDICT, ["function owner() view returns (address)", "function operator() view returns (address)"], deployer);
  const owner = process.env.PREDICT_OWNER || (await live.owner());
  const operator = process.env.PREDICT_OPERATOR || (await live.operator());
  if (!ethers.isAddress(owner) || !ethers.isAddress(operator)) throw new Error("bad owner / operator address");
  if (owner.toLowerCase() === operator.toLowerCase()) throw new Error("The owner and the operator must be different wallets — the operator key lives on the server.");
  const lb = String(process.env.PREDICT_LIST_BURN || "50000").trim();
  const listOpen = lb !== "off", listBurn = listOpen ? ethers.parseEther(lb) : 0n;
  for (const [n, a] of [["PoolManager", POOL_MANAGER], ["USDC", USDC], ["$ARCIRCLE", ARCIRCLE], ["ArcircleFeeBurn", FEE_BURN]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  console.log("Deploying ArcPredictBands from", deployer.address, "· owner", owner, "· operator", operator);
  const pr = await (await ethers.getContractFactory("ArcPredictBands")).deploy(POOL_MANAGER, USDC, ARCIRCLE, deployer.address, operator, FEE_BURN);
  const rc = await pr.deploymentTransaction().wait();
  const addr = await pr.getAddress();
  for (const b of ARGUS_PATTERNS) await (await pr.setHookPattern(b, true)).wait();
  await (await pr.setHookAllowed(ARCPAD_HOOK, true)).wait();
  await (await pr.setListing(listOpen, listBurn)).wait();
  await (await pr.setOwner(owner)).wait();
  const args = [POOL_MANAGER, USDC, ARCIRCLE, deployer.address, operator, FEE_BURN];
  require("fs").writeFileSync(require("path").join(__dirname, "args-arc-predict-bands.js"), "module.exports = " + JSON.stringify(args) + ";\n");
  console.log("\nArcPredictBands:", addr, "(block", rc.blockNumber + ")");
  console.log("  owner", await pr.owner(), "· operator", await pr.operator(), "· fee", Number(await pr.feeBps()) / 100 + "% → ArcircleFeeBurn · listing", listOpen ? `${lb} $ARCIRCLE` : "team only");
  console.log("\nNext: tell Claude the address · verify: npx hardhat verify --network arcMainnet --constructor-args scripts/args-arc-predict-bands.js", addr, "· delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
