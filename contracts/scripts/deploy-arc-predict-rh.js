// Deploys ArcPredict on Robinhood Chain — ARCIRCLE Predict, UP / DOWN rounds on graduated Pons V2 coins, paid in ETH
// (contracts/ArcPredict.sol, the same contract as on Arc; here the bet unit is native ETH and the ERC-20 face is WETH).
//
//   npx hardhat run scripts/deploy-arc-predict-rh.js --network robinhoodMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any wallet with a little ETH on Robinhood Chain for gas (not the old 0x80e1…8bc7). It owns the
//                          contract for a few transactions (limits, fee), then hands it to PREDICT_OWNER.
//   PREDICT_OWNER          your main wallet address (not a key): fee (≤ 3%), referral share, caps, pause, listing markets.
//                          It can NOT touch money already in a round.
//   PREDICT_OPERATOR       the Robinhood keeper's wallet address — ORDERS_KEEPER_RH_KEY's wallet is fine. It samples the
//                          pools at each round boundary (the price always comes from the pool) and can list / stop
//                          markets. Keep a little ETH in it for gas.
//   optional PREDICT_MIN_USD / PREDICT_MAX_USD / PREDICT_SIDE_USD   bet limits in dollars (default $0.5 / $5 / $500),
//                          turned into ETH at today's ETH price (Coinbase); or PREDICT_MIN_ETH / PREDICT_MAX_ETH /
//                          PREDICT_SIDE_ETH to set them in ETH directly. The owner can change them later (setLimits).
// Fees: 2% of a pot with a winner; 25% of that goes to referrers, the rest to the ARCIRCLE PAD treasury (in ETH), pushed
// there once an hour by the keeper. Markets: the team lists graduated Pons coins from /arc#predict (Robinhood Chain tab);
// community listing stays closed (it burns $ARCIRCLE, which lives on Arc).
// After deploying:
//   1. Vercel: PREDICT_RH_ADDRESS = the address it prints (PREDICT_RH_KEEPER_KEY only if the operator isn't
//      ORDERS_KEEPER_RH_KEY's wallet), Redeploy;
//   2. cron-job.org: a new job every minute → https://www.arcircle.app/api/desk?chain=rh&predicttick=1&key=<CRON_SECRET>;
//   3. open /arc#predict → Robinhood Chain with the owner (or operator) wallet and list the first coins;
//   4. delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Robinhood Chain (Pons pools)
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"; // Robinhood Chain WETH (the contract's ERC-20 face; bets are native ETH)
const PONS_V2_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const TREASURY = "0xa066e6C5D1ac561A4065B9D6B00feF89C0bD02F8"; // ARCIRCLE PAD treasury: the protocol's share of the fees
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function ethUsd() {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json() : null;
    const p = j && j.data ? Number(j.data.amount) : 0;
    return p > 0 ? p : null;
  } catch { return null; }
}
/// dollars → wei at `px`, rounded to 2 significant figures (0.000137 → 0.00014 ETH)
function usdToWei(usd, px) {
  const eth = usd / px;
  const mag = 10 ** (Math.floor(Math.log10(eth)) - 1);
  return ethers.parseEther((Math.round(eth / mag) * mag).toFixed(18));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 4663) throw new Error(`This is chain ${net.chainId}, not Robinhood Chain (4663) — use --network robinhoodMainnet.`);
  const owner = process.env.PREDICT_OWNER || "", operator = process.env.PREDICT_OPERATOR || "";
  if (!ethers.isAddress(owner)) throw new Error("Set PREDICT_OWNER to your main wallet's address.");
  if (!ethers.isAddress(operator)) throw new Error("Set PREDICT_OPERATOR to the Robinhood keeper wallet's address.");
  if (owner.toLowerCase() === operator.toLowerCase()) throw new Error("PREDICT_OWNER and PREDICT_OPERATOR must be different wallets — the operator key lives on the server.");
  for (const [n, a] of [["PoolManager", POOL_MANAGER], ["WETH", WETH], ["Pons V2 factory", PONS_V2_FACTORY]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network — stop and check.`);
  }
  // the PoolManager must be the one Pons graduates into
  const pf = new ethers.Contract(PONS_V2_FACTORY, ["function poolManager() view returns (address)"], ethers.provider);
  const ppm = await pf.poolManager().catch(() => null);
  if (ppm && ppm.toLowerCase() !== POOL_MANAGER.toLowerCase()) throw new Error(`Pons graduates into ${ppm}, not ${POOL_MANAGER} — stop and check.`);

  // bet limits in ETH
  const envEth = (k) => (process.env[k] ? ethers.parseEther(String(process.env[k]).trim()) : null);
  let minBet = envEth("PREDICT_MIN_ETH"), maxBet = envEth("PREDICT_MAX_ETH"), maxSide = envEth("PREDICT_SIDE_ETH");
  let px = null;
  if (!minBet || !maxBet || !maxSide) {
    px = await ethUsd();
    if (!px) throw new Error("Couldn't read the ETH price — set PREDICT_MIN_ETH, PREDICT_MAX_ETH and PREDICT_SIDE_ETH instead.");
    const usd = (k, d) => Number(process.env[k] || d);
    minBet = minBet || usdToWei(usd("PREDICT_MIN_USD", 0.5), px);
    maxBet = maxBet || usdToWei(usd("PREDICT_MAX_USD", 5), px);
    maxSide = maxSide || usdToWei(usd("PREDICT_SIDE_USD", 500), px);
  }
  if (!(minBet > 0n && maxBet >= minBet && maxSide >= maxBet)) throw new Error("The bet limits must be min ≤ max ≤ per-side cap.");
  const show = (wei) => `${ethers.formatEther(wei)} ETH${px ? ` (~$${(Number(ethers.formatEther(wei)) * px).toFixed(2)})` : ""}`;
  console.log("Bet limits:", show(minBet), "to", show(maxBet), "· per side", show(maxSide), px ? `· ETH $${px}` : "");

  console.log("Deploying ArcPredict on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("ArcPredict");
  const pr = await F.deploy(POOL_MANAGER, WETH, ethers.ZeroAddress, deployer.address, operator, TREASURY);
  const rc = await pr.deploymentTransaction().wait();
  const addr = await pr.getAddress();
  await (await pr.setLimits(minBet, maxBet, maxSide, 3, 2)).wait();
  await (await pr.setFee(200, 2500, TREASURY, 1)).wait(); // 2%, referrers 25% of it, the rest to the treasury in native ETH
  await (await pr.setQuote(WETH, false, 0)).wait(); // markets are native-ETH pools (Pons) only
  await (await pr.setOwner(owner)).wait();
  console.log("\nArcPredict (Robinhood Chain):", addr);
  console.log("  block:    ", rc.blockNumber);
  console.log("  owner:    ", await pr.owner());
  console.log("  operator: ", await pr.operator());
  console.log("  fee:      ", Number(await pr.feeBps()) / 100 + "% (referrers " + Number(await pr.refShare()) / 100 + "% of it) →", await pr.feeTo(), "in ETH (mode", Number(await pr.feeMode()) + ")");
  console.log("  bets:     ", show(await pr.minBet()), "–", show(await pr.maxBet()), "· per side", show(await pr.maxSide()));
  console.log("  listing:  ", "team only (graduated Pons coins, from /arc#predict)");
  console.log(`\nNext: send back  Predict RH ${addr} (block ${rc.blockNumber})  ·  Vercel PREDICT_RH_ADDRESS = ${addr} · Redeploy · cron-job.org every minute: /api/desk?chain=rh&predicttick=1&key=<CRON_SECRET> · delete contracts/.env`);
  console.log(`Verify: npx hardhat verify --network robinhoodMainnet ${addr} ${POOL_MANAGER} ${WETH} ${ethers.ZeroAddress} ${deployer.address} ${operator} ${TREASURY}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
