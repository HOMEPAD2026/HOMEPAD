// Deploys HomepadFactory to whichever network you point Hardhat at.
//
// Required env vars (see .env.example):
//   HOME_TREASURY_ADDRESS   — wallet that receives the $HOME buyback funds
//   PLATFORM_WALLET_ADDRESS — wallet for the ops/gas share of fees
//   UNISWAP_V2_ROUTER       — the real Uniswap V2 Router02 address for the
//                             network you're deploying to. DO NOT GUESS —
//                             look it up at deploy time from Uniswap's own
//                             deployments page or Robinhood Chain's docs.
//
// Optional, with MVP defaults:
//   INITIAL_VIRTUAL_ETH  — default 3 ETH, shapes the opening price curve
//   GRADUATION_THRESHOLD — default 10 ETH, net ETH raised to graduate
//   BASE_FEE_BPS         — default 100 (1%), the protocol's fixed default fee
//   CREATOR_SHARE_BPS    — default 7000 (70%), creator's cut of the base fee
//                          (the rest goes to the platform side, further
//                          split by HOME_SHARE_BPS)
//   HOME_SHARE_BPS       — default 10000 (100% of the platform's share of
//                          the base fee goes to $HOME treasury)
//
// Each individual creator additionally picks their own extraFeeBps (0–2%)
// at launch time, in the frontend — that's not a deploy-time setting.

const { ethers } = require("hardhat");

async function main() {
  const homeTreasury = requireEnv("HOME_TREASURY_ADDRESS");
  const platformWallet = requireEnv("PLATFORM_WALLET_ADDRESS");
  const router = requireEnv("UNISWAP_V2_ROUTER");

  const initialVirtualEth = ethers.parseEther(process.env.INITIAL_VIRTUAL_ETH || "3");
  const graduationThreshold = ethers.parseEther(process.env.GRADUATION_THRESHOLD || "10");
  const baseFeeBps = Number(process.env.BASE_FEE_BPS || 100);
  const creatorShareBps = Number(process.env.CREATOR_SHARE_BPS || 7000);
  const homeShareBps = Number(process.env.HOME_SHARE_BPS || 10000);

  console.log("Deploying HomepadFactory with:");
  console.log({ homeTreasury, platformWallet, router, initialVirtualEth: initialVirtualEth.toString(), graduationThreshold: graduationThreshold.toString(), baseFeeBps, creatorShareBps, homeShareBps });

  const Factory = await ethers.getContractFactory("HomepadFactory");
  const factory = await Factory.deploy(
    homeTreasury,
    platformWallet,
    router,
    initialVirtualEth,
    graduationThreshold,
    baseFeeBps,
    creatorShareBps,
    homeShareBps
  );
  await factory.waitForDeployment();

  console.log("HomepadFactory deployed to:", await factory.getAddress());
  console.log("Verify it on the block explorer before telling anyone to use it.");
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
