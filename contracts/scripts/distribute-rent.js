// Splits $HOME treasury's ETH balance according to the RENT model
// (50% buyback / 30% liquidity / 10% creator incentives / 10% operations)
// and lets you choose, each run, what actually executes:
//
//   - Creator incentives + Operations are plain ETH transfers this script
//     CAN send directly (you still confirm each one before it fires).
//   - Buyback + Liquidity involve an actual DEX trade. Rather than this
//     script guessing which Uniswap version (v2/v3/v4) $HOME's pool
//     actually uses and risking sending funds into a broken/wrong swap,
//     it prints the exact ETH amount for each and a ready-to-open Uniswap
//     link with that amount pre-filled — Uniswap's own frontend handles
//     routing across whichever pool version has the liquidity, and you
//     pick the timing and slippage yourself.
//
// Nothing here runs on a schedule — you run it by hand whenever you want
// to distribute what's accumulated. Run as many times as you like; it
// only ever acts on the CURRENT treasury balance at run time.
//
// Required env vars:
//   TREASURY_PRIVATE_KEY   — the $HOME treasury wallet's own key (only
//                            needed for the two direct-transfer steps;
//                            you can skip those and this isn't required)
//   HOME_TREASURY_ADDRESS  — same treasury address used elsewhere
//   CREATOR_INCENTIVE_WALLET
//   OPERATIONS_WALLET
//
// Optional:
//   RENT_BUYBACK_BPS (default 5000), RENT_LIQUIDITY_BPS (default 3000),
//   RENT_CREATOR_BPS (default 1000), RENT_OPS_BPS (default 1000)
//   — must sum to 10000. Change these if you ever want a different split
//   without touching this file.

const { ethers } = require("hardhat");
const readline = require("readline");

const BUYBACK_BPS = Number(process.env.RENT_BUYBACK_BPS || 5000);
const LIQUIDITY_BPS = Number(process.env.RENT_LIQUIDITY_BPS || 3000);
const CREATOR_BPS = Number(process.env.RENT_CREATOR_BPS || 1000);
const OPS_BPS = Number(process.env.RENT_OPS_BPS || 1000);

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim().toLowerCase()); }));
}

async function main() {
  if (BUYBACK_BPS + LIQUIDITY_BPS + CREATOR_BPS + OPS_BPS !== 10000) {
    throw new Error("RENT_*_BPS must sum to 10000");
  }
  const homeTreasury = requireEnv("HOME_TREASURY_ADDRESS");
  const homeTokenAddress = process.env.HOME_TOKEN_ADDRESS || "0xE9aB3214a9b77BAEbFdE2B6D17dEc4823599ff6f";
  const creatorWallet = requireEnv("CREATOR_INCENTIVE_WALLET");
  const opsWallet = requireEnv("OPERATIONS_WALLET");

  const provider = ethers.provider;
  const balance = await provider.getBalance(homeTreasury);

  console.log("\n$HOME Treasury:", homeTreasury);
  console.log("Current ETH balance:", ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.log("Nothing to distribute right now.");
    return;
  }

  const buybackAmount = (balance * BigInt(BUYBACK_BPS)) / 10000n;
  const liquidityAmount = (balance * BigInt(LIQUIDITY_BPS)) / 10000n;
  const creatorAmount = (balance * BigInt(CREATOR_BPS)) / 10000n;
  const opsAmount = (balance * BigInt(OPS_BPS)) / 10000n;

  console.log("Calculated split:");
  console.log(`  Buyback     (${BUYBACK_BPS / 100}%): ${ethers.formatEther(buybackAmount)} ETH`);
  console.log(`  Liquidity   (${LIQUIDITY_BPS / 100}%): ${ethers.formatEther(liquidityAmount)} ETH`);
  console.log(`  Creator     (${CREATOR_BPS / 100}%): ${ethers.formatEther(creatorAmount)} ETH -> ${creatorWallet}`);
  console.log(`  Operations  (${OPS_BPS / 100}%): ${ethers.formatEther(opsAmount)} ETH -> ${opsWallet}\n`);

  // --- Buyback: your choice, your timing ---
  const buybackUrl = `https://app.uniswap.org/swap?chain=robinhood&inputCurrency=ETH&outputCurrency=${homeTokenAddress}&exactAmount=${ethers.formatEther(buybackAmount)}&exactField=input`;
  console.log("Buyback — open this to swap ETH -> $HOME yourself (pick slippage, confirm the price):");
  console.log(" ", buybackUrl, "\n");

  // --- Liquidity: your choice, your timing ---
  const liquidityUrl = `https://app.uniswap.org/add/ETH/${homeTokenAddress}?chain=robinhood`;
  console.log("Liquidity — open this to add ETH + $HOME liquidity yourself:");
  console.log(" ", liquidityUrl);
  console.log(`  (this run's liquidity-bucket amount: ${ethers.formatEther(liquidityAmount)} ETH — split it however you like against however much $HOME you're pairing it with)\n`);

  // --- Creator incentives: this script can send it directly, if you want ---
  const doCreator = await ask(`Send ${ethers.formatEther(creatorAmount)} ETH to creator incentive wallet now? (y/N) `);
  if (doCreator === "y" || doCreator === "yes") {
    await sendEth(creatorWallet, creatorAmount);
  } else {
    console.log("  Skipped.");
  }

  // --- Operations: same deal ---
  const doOps = await ask(`Send ${ethers.formatEther(opsAmount)} ETH to operations wallet now? (y/N) `);
  if (doOps === "y" || doOps === "yes") {
    await sendEth(opsWallet, opsAmount);
  } else {
    console.log("  Skipped.");
  }

  console.log("\nDone. Re-run this any time — it only ever acts on whatever's in the treasury at that moment.");
}

async function sendEth(to, amount) {
  const signerKey = process.env.TREASURY_PRIVATE_KEY;
  if (!signerKey) {
    console.log("  TREASURY_PRIVATE_KEY isn't set — can't send. Add it to .env if you want this script to send transfers directly.");
    return;
  }
  const signer = new ethers.Wallet(signerKey, ethers.provider);
  const tx = await signer.sendTransaction({ to, value: amount });
  console.log("  Sent. Tx:", tx.hash);
  await tx.wait();
  console.log("  Confirmed.");
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
