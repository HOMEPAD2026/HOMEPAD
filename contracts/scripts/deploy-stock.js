// Deploys StockHomepadFactory. Same pattern as scripts/deploy.js, but for
// the stock-paired mode.
//
// Required env vars:
//   HOME_TREASURY_ADDRESS
//   PLATFORM_WALLET_ADDRESS
//   UNISWAP_V2_ROUTER
//   STOCK_QUOTE_TOKENS — comma-separated list of allowed quote token
//                        addresses (Robinhood Stock Token contracts, and/or
//                        $HOME's own address if you want $HOME pairing too).
//                        Look these up fresh from
//                        https://docs.robinhood.com/chain/contracts —
//                        that page is generated live from the on-chain
//                        registry, so don't hardcode a value you saw once
//                        and reuse it blindly later.
//
// Optional:
//   GRADUATION_THRESHOLD — default 50 (in quote-token units, e.g. "50 AAPL")
//   BASE_FEE_BPS         — default 100 (1%)
//   CREATOR_SHARE_BPS    — default 7000 (70% of base fee -> creator)
//   HOME_SHARE_BPS       — default 10000 (100% of the platform's share -> $HOME)

const { ethers } = require("hardhat");

async function main() {
  const homeTreasury = requireEnv("HOME_TREASURY_ADDRESS");
  const platformWallet = requireEnv("PLATFORM_WALLET_ADDRESS");
  const router = requireEnv("UNISWAP_V2_ROUTER");
  const quoteTokensRaw = requireEnv("STOCK_QUOTE_TOKENS");
  const quoteTokens = quoteTokensRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (quoteTokens.length === 0) throw new Error("STOCK_QUOTE_TOKENS must list at least one address");

  const graduationThreshold = ethers.parseEther(process.env.GRADUATION_THRESHOLD || "50");
  const baseFeeBps = Number(process.env.BASE_FEE_BPS || 100);
  const creatorShareBps = Number(process.env.CREATOR_SHARE_BPS || 7000);
  const homeShareBps = Number(process.env.HOME_SHARE_BPS || 10000);

  console.log("Deploying StockHomepadFactory with:");
  console.log({ homeTreasury, platformWallet, router, quoteTokens, graduationThreshold: graduationThreshold.toString(), baseFeeBps, creatorShareBps, homeShareBps });

  const Factory = await ethers.getContractFactory("StockHomepadFactory");
  const factory = await Factory.deploy(
    homeTreasury,
    platformWallet,
    router,
    graduationThreshold,
    baseFeeBps,
    creatorShareBps,
    homeShareBps,
    quoteTokens
  );
  await factory.waitForDeployment();

  console.log("StockHomepadFactory deployed to:", await factory.getAddress());
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
