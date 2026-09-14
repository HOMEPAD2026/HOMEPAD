// Deploys BigPadEscrow — the escrow contract for BigPad's first round.
// See contracts/BigPadEscrow.sol for the full lifecycle. Short version:
// deploying does NOT start the clock. After this script finishes, the
// recipient wallet has to separately call start() (from the site, or via
// the explorer's Write Contract tab) to begin the 72-hour funding window.
//
// Required env vars:
//   BIGPAD_RECIPIENT_ADDRESS — deploy/lead wallet. Only this wallet can
//     call start() or withdraw(). Gets 80% of the final balance.
//   BIGPAD_PLATFORM_ADDRESS  — gets 5% of the final balance.
//   BIGPAD_TREASURY_ADDRESS  — gets 15% of the final balance.
// Optional:
//   BIGPAD_CAP_ETH — hard cap on the raise, in ETH. Leave unset or "0"
//     for an uncapped raise (the 72h window is the only close condition).
//
// Run on testnet FIRST — deploy, call start(), contribute from a couple
// of test accounts, try refund(), let the window close, call withdraw()
// and confirm the 80/5/15 split lands correctly — and only then run
// again with --network robinhoodMainnet:
//   npx hardhat run scripts/deploy-bigpad-escrow.js --network robinhoodTestnet
//   npx hardhat run scripts/deploy-bigpad-escrow.js --network robinhoodMainnet

const { ethers } = require("hardhat");
const { verifyIfPossible } = require("./lib/verify");
const hre = require("hardhat");

async function main() {
  const recipient = requireEnv("BIGPAD_RECIPIENT_ADDRESS");
  const platformWallet = requireEnv("BIGPAD_PLATFORM_ADDRESS");
  const treasuryWallet = requireEnv("BIGPAD_TREASURY_ADDRESS");
  const capEth = process.env.BIGPAD_CAP_ETH || "0";
  const uncapped = Number(capEth) === 0;
  const cap = ethers.parseEther(capEth);

  console.log("Deploying BigPadEscrow on", hre.network.name, "...");
  console.log("  recipient (80%, starts/withdraws):", recipient);
  console.log("  platform wallet (5%):", platformWallet);
  console.log("  treasury wallet (15%):", treasuryWallet);
  console.log("  cap:", uncapped ? "UNCAPPED (72h window is the only close condition)" : capEth + " ETH");
  console.log("  NOTE: the 72h window does NOT start yet — recipient must call start() separately.");

  const Escrow = await ethers.getContractFactory("BigPadEscrow");
  const escrow = await Escrow.deploy(recipient, platformWallet, treasuryWallet, cap);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();
  console.log("BigPadEscrow deployed:", address);

  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, {
    name: "BigPadEscrow",
    address,
    contract: "contracts/BigPadEscrow.sol:BigPadEscrow",
    constructorArgs: [recipient, platformWallet, treasuryWallet, cap],
  });

  console.log("\nDone. Paste into frontend config.js:");
  console.log(
    JSON.stringify(
      {
        BIGPAD_ESCROW_ADDRESS: address,
        BIGPAD_CAP_WEI: cap.toString(),
        BIGPAD_PLATFORM_ADDRESS: platformWallet,
        BIGPAD_TREASURY_ADDRESS: treasuryWallet,
      },
      null,
      2
    )
  );
  console.log("\nNext: recipient calls start() — from the site (a Start button shows up for that");
  console.log("wallet once this address is wired in) or via the explorer's Write Contract tab.");
  console.log("On testnet, run through a full round yourself (start, contribute from a couple of");
  console.log("test accounts, try refund(), let it close, call withdraw(), confirm the 80/5/15");
  console.log("split lands on the right three wallets) before touching mainnet.");
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
