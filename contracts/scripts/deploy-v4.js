// Deploys HomepadFactoryV4. Same pattern as scripts/deploy.js, but for the
// Uniswap V4 graduation path.
//
// Required env vars:
//   HOME_TREASURY_ADDRESS
//   PLATFORM_WALLET_ADDRESS
//   POOL_MANAGER_ADDRESS — Robinhood Chain's live Uniswap v4 PoolManager
//                          address. Look this up fresh at deploy time —
//                          don't hardcode one you saw in an old tutorial.
//
// Optional:
//   POOL_FEE          — default 3000 (0.3%, Uniswap's standard tier)
//   TICK_SPACING       — default 60 (matches the 0.3% tier convention)
//   INITIAL_VIRTUAL_ETH, GRADUATION_THRESHOLD, BASE_FEE_BPS,
//   CREATOR_SHARE_BPS, HOME_SHARE_BPS — same meaning and defaults as
//   scripts/deploy.js

const { ethers } = require("hardhat");
const hre = require("hardhat");
const { verifyIfPossible } = require("./lib/verify");

async function main() {
  const homeTreasury = requireEnv("HOME_TREASURY_ADDRESS");
  const platformWallet = requireEnv("PLATFORM_WALLET_ADDRESS");
  const poolManager = requireEnv("POOL_MANAGER_ADDRESS");

  const poolFee = Number(process.env.POOL_FEE || 3000);
  const tickSpacing = Number(process.env.TICK_SPACING || 60);
  const initialVirtualEth = ethers.parseEther(process.env.INITIAL_VIRTUAL_ETH || "3");
  const graduationThreshold = ethers.parseEther(process.env.GRADUATION_THRESHOLD || "10");
  const baseFeeBps = Number(process.env.BASE_FEE_BPS || 100);
  const creatorShareBps = Number(process.env.CREATOR_SHARE_BPS || 7000);
  const homeShareBps = Number(process.env.HOME_SHARE_BPS || 10000);

  console.log("Deploying HomepadFactoryV4 with:");
  console.log({ homeTreasury, platformWallet, poolManager, poolFee, tickSpacing, initialVirtualEth: initialVirtualEth.toString(), graduationThreshold: graduationThreshold.toString(), baseFeeBps, creatorShareBps, homeShareBps });

  const Factory = await ethers.getContractFactory("HomepadFactoryV4");
  const factory = await Factory.deploy(
    homeTreasury,
    platformWallet,
    poolManager,
    poolFee,
    tickSpacing,
    initialVirtualEth,
    graduationThreshold,
    baseFeeBps,
    creatorShareBps,
    homeShareBps
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("HomepadFactoryV4 deployed to:", factoryAddr);

  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "Bonding Curve Factory", address: factoryAddr, contract: "contracts/HomepadFactoryV4.sol:HomepadFactoryV4", constructorArgs: [homeTreasury, platformWallet, poolManager, poolFee, tickSpacing, initialVirtualEth, graduationThreshold, baseFeeBps, creatorShareBps, homeShareBps] });
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
