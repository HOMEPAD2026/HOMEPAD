// Deploys BigPadEscrow — the minimal cap + deadline + escrow contract for
// BigPad's first round. See contracts/BigPadEscrow.sol for what this is
// and is NOT: no voting/leader/vesting logic — that mechanism is a
// separate, larger contract still in design and review (Docs > Safety
// design on the BigPad page).
//
// Required env vars:
//   BIGPAD_RECIPIENT_ADDRESS — wallet that can withdraw once the raise closes
// Optional:
//   BIGPAD_CAP_ETH           — hard cap on the raise, in ETH (e.g. "10").
//                              Leave unset or "0" for an UNCAPPED raise —
//                              contribute() then never reverts on amount,
//                              only on the deadline. withdraw() still
//                              waits for the deadline either way.
//   BIGPAD_DURATION_HOURS (72 — matches BigPad's documented 3-day raise)
//
// Run on testnet FIRST, confirm contribute()/withdraw() behave as expected
// there, and only then run again with --network robinhoodMainnet:
//   npx hardhat run scripts/deploy-bigpad-escrow.js --network robinhoodTestnet
//   npx hardhat run scripts/deploy-bigpad-escrow.js --network robinhoodMainnet

const { ethers } = require("hardhat");
const { verifyIfPossible } = require("./lib/verify");
const hre = require("hardhat");

async function main() {
  const recipient = requireEnv("BIGPAD_RECIPIENT_ADDRESS");
  const capEth = process.env.BIGPAD_CAP_ETH || "0";
  const durationHours = Number(process.env.BIGPAD_DURATION_HOURS || 72);
  const uncapped = Number(capEth) === 0;

  const cap = ethers.parseEther(capEth);
  const latestBlock = await ethers.provider.getBlock("latest");
  const deadline = latestBlock.timestamp + durationHours * 60 * 60;

  console.log("Deploying BigPadEscrow on", hre.network.name, "...");
  console.log("  recipient:", recipient);
  console.log("  cap:", uncapped ? "UNCAPPED (no limit — deadline is the only close condition)" : capEth + " ETH");
  console.log("  duration:", durationHours, "hours");
  console.log("  deadline (unix):", deadline, "-", new Date(deadline * 1000).toISOString());

  const Escrow = await ethers.getContractFactory("BigPadEscrow");
  const escrow = await Escrow.deploy(recipient, cap, deadline);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();
  console.log("BigPadEscrow deployed:", address);

  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, {
    name: "BigPadEscrow",
    address,
    contract: "contracts/BigPadEscrow.sol:BigPadEscrow",
    constructorArgs: [recipient, cap, deadline],
  });

  console.log("\nDone. Paste into frontend config.js:");
  console.log(
    JSON.stringify(
      { BIGPAD_ESCROW_ADDRESS: address, BIGPAD_CAP_WEI: cap.toString(), BIGPAD_DEADLINE_UNIX: deadline },
      null,
      2
    )
  );
  console.log("\nOn testnet: run through a full round yourself (contribute from a couple of");
  console.log("test accounts, confirm the deadline revert fires" + (uncapped ? "" : ", confirm the cap revert fires") + ", call withdraw()) before");
  console.log("touching mainnet. Verify the contract on the explorer before announcing either way.");
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
