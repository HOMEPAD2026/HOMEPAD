// Deploys ArcPad on Robinhood Chain: HomepadHybridHook (CREATE2-mined address, a fresh instance for this factory) +
// ArcPadFactoryRH (ETH-paired launches, launch fee in ETH) + ArcPadRouterRH (buy with ETH, sell for ETH), wired
// together, + ArcLaunchDropRH (the veARCIRCLE Launch Drop for these coins: weekly Merkle roots, posted by the
// treasury wallet from the Staking page's console). Nothing on Arc and none of the old HOMEPAD contracts on Robinhood
// Chain are touched.
//
//   npx hardhat run scripts/deploy-arcpad-rh.js --network robinhoodMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any wallet with a little ETH on Robinhood Chain for gas (not the old 0x80e1…8bc7).
//                          It owns nothing afterwards except the hook's one-time setFactory, which this script uses.
// Optional:
//   LAUNCH_FEE_ETH         the launch fee in ETH. Default: $1 of ETH at today's price (Coinbase's ETH-USD spot, read
//                          when you run this), rounded to 2 significant digits. It's fixed in the contract once deployed.
//   PLATFORM_TREASURY_ADDRESS / PLATFORM_WALLET_ADDRESS   default: the same two as ArcPad on Arc (read from the Arc
//                          factory), so the 8% platform allocation of every coin lands in the same treasury
//   TICK_SPACING (200), BASE_FEE_BPS (100), CREATOR_SHARE_BPS (7000), PLATFORM_SHARE_BPS (10000) — same as Arc
//   LAUNCHDROP_POSTER      the wallet that posts the weekly veARCIRCLE root (default: the treasury)
// After deploying: tell Claude the four addresses it prints (they go into config-arc.js ARCPAD_RH), delete contracts/.env.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Robinhood Chain
const ARC_FACTORY = "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E";  // ArcPad on Arc (for its treasury + wallet)
const ARC_RPC = "https://rpc.mainnet.arc.io";
const START_WEEK = 1791417600; // Thu 8 Oct 2026 00:00 UTC — the same first Launch Drop week as on Arc
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";
const FLAGS = BigInt((1 << 6) | (1 << 2)), MASK = (1n << 14n) - 1n; // afterSwap + afterSwapReturnDelta

function mineSalt(dep, hash) {
  for (let s = 0n; s < 400000n; s++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(s), 32);
    const a = ethers.getCreate2Address(dep, salt, hash);
    if ((BigInt(a) & MASK) === FLAGS) return { salt, address: a };
  }
  throw new Error("no salt found");
}

// $1 of ETH at today's spot price, 2 significant digits (0.00025 if the price can't be read)
async function oneDollarOfEth() {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot");
    const px = Number((await r.json()).data.amount);
    if (!(px > 300 && px < 100000)) throw new Error("odd price " + px);
    const v = Number((1 / px).toPrecision(2));
    console.log(`ETH is $${px.toFixed(2)} → launch fee ${v} ETH (≈ $1)`);
    return v.toFixed(18).replace(/0+$/, "");
  } catch (e) { console.log("Couldn't read the ETH price (" + (e.message || e) + ") — using 0.00025 ETH. Set LAUNCH_FEE_ETH to override."); return "0.00025"; }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 4663) throw new Error(`This is chain ${net.chainId}, not Robinhood Chain (4663) — use --network robinhoodMainnet.`);
  if ((await ethers.provider.getCode(POOL_MANAGER)) === "0x") throw new Error("No PoolManager at " + POOL_MANAGER);

  let treasury = process.env.PLATFORM_TREASURY_ADDRESS, wallet = process.env.PLATFORM_WALLET_ADDRESS;
  if (!treasury || !wallet) {
    const arc = new ethers.Contract(ARC_FACTORY, ["function platformTreasury() view returns (address)", "function platformWallet() view returns (address)"], new ethers.JsonRpcProvider(ARC_RPC));
    treasury = treasury || (await arc.platformTreasury());
    wallet = wallet || (await arc.platformWallet());
    console.log("Same treasury + wallet as ArcPad on Arc:", treasury, wallet);
  }
  if (!ethers.isAddress(treasury) || !ethers.isAddress(wallet)) throw new Error("bad treasury / wallet address");
  const fee = ethers.parseEther(process.env.LAUNCH_FEE_ETH || (await oneDollarOfEth()));
  const ts = Number(process.env.TICK_SPACING || 200), base = Number(process.env.BASE_FEE_BPS || 100);
  const cs = Number(process.env.CREATOR_SHARE_BPS || 7000), ps = Number(process.env.PLATFORM_SHARE_BPS || 10000);
  console.log("Deploying ArcPad on Robinhood Chain from", deployer.address, "· launch fee", ethers.formatEther(fee), "ETH");

  const c2 = await (await ethers.getContractFactory("Create2Deployer")).deploy();
  await c2.waitForDeployment();
  const HF = await ethers.getContractFactory("HomepadHybridHook");
  const init = (await HF.getDeployTransaction(POOL_MANAGER, deployer.address)).data;
  const { salt, address: hookAddr } = mineSalt(await c2.getAddress(), ethers.keccak256(init));
  await (await c2.deploy(salt, init)).wait();
  if ((await ethers.provider.getCode(hookAddr)) === "0x") throw new Error("hook deploy failed");
  console.log("1/4 hook:   ", hookAddr);

  const factory = await (await ethers.getContractFactory("ArcPadFactoryRH")).deploy(treasury, wallet, POOL_MANAGER, hookAddr, ts, base, cs, ps, fee);
  const frc = await factory.deploymentTransaction().wait();
  const F = await factory.getAddress();
  await (await (await ethers.getContractAt("HomepadHybridHook", hookAddr)).setFactory(F)).wait();
  console.log("2/4 factory:", F, "(block", frc.blockNumber + ")");

  const router = await (await ethers.getContractFactory("ArcPadRouterRH")).deploy(POOL_MANAGER, F);
  await router.waitForDeployment();
  console.log("3/4 router: ", await router.getAddress());

  const poster = process.env.LAUNCHDROP_POSTER || treasury;
  if (!ethers.isAddress(poster)) throw new Error("bad LAUNCHDROP_POSTER");
  const drop = await (await ethers.getContractFactory("ArcLaunchDropRH")).deploy(F, START_WEEK, poster, treasury);
  await drop.waitForDeployment();
  console.log("4/4 Launch Drop vault:", await drop.getAddress(), "(root poster", poster + ")");

  const args = { hook: [POOL_MANAGER, deployer.address], factory: [treasury, wallet, POOL_MANAGER, hookAddr, ts, base, cs, ps, fee.toString()], router: [POOL_MANAGER, F], drop: [F, START_WEEK, poster, treasury] };
  require("fs").writeFileSync(require("path").join(__dirname, "args-arcpad-rh.json"), JSON.stringify(args, null, 1));
  console.log("\nNext: tell Claude ARCPAD_RH = { factory:", F, ", router:", await router.getAddress(), ", hook:", hookAddr, ", drop:", await drop.getAddress(), ", block:", frc.blockNumber, "} · delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
