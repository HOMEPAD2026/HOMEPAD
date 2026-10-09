// Deploys ArcPerp — ARCIRCLE Perps, a small perpetual-futures market on Arc paid in USDC (contracts/ArcPerp.sol).
//
// ⚠ NOT AUDITED. This script refuses to run on Arc mainnet until an external audit of contracts/ArcPerp.sol is done:
//   PERP_AUDIT_REPORT   a link to the audit report of the exact commit being deployed
//   PERP_I_UNDERSTAND   "real-money-perps" — traders can lose everything they deposit, and the pool can lose too
//
//   npx hardhat run scripts/deploy-arc-perp.js --network arcMainnet
//
// contracts/.env needs DEPLOYER_PRIVATE_KEY (any wallet with a little USDC on Arc for gas). Optional:
//   PERP_OWNER    the owner (parameters inside the hard caps, markets, keepers, pause) — default: ARCIRCLE Predict's owner
//   PERP_KEEPER   the keeper wallet (executes orders, liquidates) — default: ARCIRCLE Predict's operator
// Markets: BTC, ETH and SOL against Chainlink's Data Feeds on Arc (proxies from Chainlink's reference data directory,
// 8 decimals, 0.5% deviation / 24 h heartbeat). Starting caps are small on purpose: 20–25x, $5,000 a position,
// $25,000 open interest a side. Fees 0.06% open and close, 0.01% an hour borrow. The pool starts empty — the treasury
// seeds it with deposit() from the owner wallet (it can raise caps as the pool grows).
const hre = require("hardhat");
const { ethers } = hre;

const USDC = "0x3600000000000000000000000000000000000000";
const FEE_BURN = "0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034"; // ArcircleFeeBurn
const STAKING = "0x301E1e8dcB43cDddD3244889063aD4220536b38A"; // ArcircleStaking (veARCIRCLE): fund() → weekly USDC
const PREDICT = "0x41149F8ce23d9B4E737e51C97fFE14bBb4C09ce6"; // its owner / operator are the defaults
const FEEDS = [ // Chainlink Data Feeds on Arc mainnet (proxy addresses)
  ["BTC", "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De", 25],
  ["ETH", "0x50FCDD99D6762D1C170DC6A9111db944AEE6D364", 25],
  ["SOL", "0x2d04D354f5fDaE3De723df475745B0a9B4edf90C", 20],
];
const U = (n) => BigInt(n) * 10n ** 6n;
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) === 5042) {
    if (!/^https:\/\//.test(process.env.PERP_AUDIT_REPORT || "") || process.env.PERP_I_UNDERSTAND !== "real-money-perps") {
      throw new Error("ArcPerp isn't audited. It doesn't go on Arc mainnet before an external audit — set PERP_AUDIT_REPORT (the report's link) and PERP_I_UNDERSTAND=real-money-perps once it is.");
    }
  } else if (Number(net.chainId) !== 5042002 && Number(net.chainId) !== 31337) throw new Error(`Chain ${net.chainId}: use arcMainnet (after an audit) or a test network.`);
  const live = new ethers.Contract(PREDICT, ["function owner() view returns (address)", "function operator() view returns (address)"], deployer);
  const owner = process.env.PERP_OWNER || (await live.owner());
  const keeper = process.env.PERP_KEEPER || (await live.operator());
  for (const [n, a] of [["USDC", USDC], ["ArcircleFeeBurn", FEE_BURN], ["ArcircleStaking", STAKING], ...FEEDS.map(([s, f]) => [`${s}/USD feed`, f])]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  for (const [s, f] of FEEDS) {
    const c = new ethers.Contract(f, ["function decimals() view returns (uint8)", "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], deployer);
    const [d, r] = await Promise.all([c.decimals(), c.latestRoundData()]);
    if (Number(d) !== 8 || r[1] <= 0n) throw new Error(`${s}/USD feed looks wrong (decimals ${d}, answer ${r[1]})`);
    console.log(`${s}/USD`, Number(r[1]) / 1e8, "· updated", new Date(Number(r[3]) * 1000).toISOString());
  }
  const perp = await (await ethers.getContractFactory("ArcPerp")).deploy(USDC, deployer.address, keeper, FEE_BURN, STAKING);
  const rc = await perp.deploymentTransaction().wait();
  const addr = await perp.getAddress();
  for (const [s, f, lev] of FEEDS) await (await perp.addMarket(s, f, lev, U(5000), U(25000), U(25000))).wait();
  await (await perp.setOwner(owner)).wait();
  require("fs").writeFileSync(require("path").join(__dirname, "args-arc-perp.js"), "module.exports = " + JSON.stringify([USDC, deployer.address, keeper, FEE_BURN, STAKING]) + ";\n");
  console.log("\nArcPerp:", addr, "(block", rc.blockNumber + ") · owner", owner, "· keeper", keeper);
  console.log("Next: the owner wallet seeds the pool (deposit), tell Claude the address, verify with --constructor-args scripts/args-arc-perp.js, delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
