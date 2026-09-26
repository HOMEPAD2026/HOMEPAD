// Deploys BigPadVote — a standalone identity vote (name/ticker/logo/
// roadmap/launch date) that reads contribution weight live from an
// already-deployed BigPadEscrow. Does NOT touch or redeploy the escrow.
// See contracts/BigPadVote.sol for the full mechanics.
//
// Required env vars:
//   BIGPAD_ESCROW_ADDRESS — the already-deployed, already-started escrow
//     this vote reads weights from. Must have start() already called —
//     the constructor reverts otherwise (deadline() would be 0).
//
// After deploy, the recipient wallet calls proposeOptions(category, [...])
// for each of the 5 categories (0=Name, 1=Ticker, 2=Logo, 3=Roadmap,
// 4=LaunchDate) — any time before voting closes, no need to wait for the
// raise to end first. Voting itself only opens once the escrow's own
// deadline passes, and stays open for 48 hours after that.
//
// CirclePad on Arc mainnet (the live Round #1 escrow):
//   BIGPAD_ESCROW_ADDRESS=0xC5998d7cE728FDd6f77217fdE775aAb90Ec61703 \
//     npx hardhat run scripts/deploy-bigpad-vote.js --network arcMainnet
// Deploy BEFORE the escrow's deadline so the recipient has time to publish
// candidates on /circle#governance — voting opens the moment the raise closes.

const { ethers } = require("hardhat");
const { verifyIfPossible } = require("./lib/verify");
const hre = require("hardhat");

async function main() {
  const escrowAddress = process.env.BIGPAD_ESCROW_ADDRESS || process.env.CIRCLEPAD_ESCROW_ADDRESS || requireEnv("BIGPAD_ESCROW_ADDRESS");

  console.log("Deploying BigPadVote on", hre.network.name, "...");
  console.log("  escrow:", escrowAddress);

  const escrow = await ethers.getContractAt("BigPadEscrow", escrowAddress);
  const deadline = await escrow.deadline();
  if (deadline === 0n) {
    throw new Error("This escrow hasn't been started yet (deadline() is 0) — call start() first, then deploy this.");
  }
  console.log("  escrow deadline:", deadline.toString(), "-", new Date(Number(deadline) * 1000).toISOString());
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  if (BigInt(now) >= deadline) console.warn("  NOTE: the raise has already closed — voting is open from the moment this deploys, for whatever is left of the 48 hours.");
  else console.log("  raise closes in", ((Number(deadline) - now) / 3600).toFixed(1), "hours");

  const Vote = await ethers.getContractFactory("BigPadVote");
  const vote = await Vote.deploy(escrowAddress);
  await vote.waitForDeployment();
  const address = await vote.getAddress();
  console.log("BigPadVote deployed:", address);

  const votingEnds = await vote.votingEnds();
  console.log("  voting opens:", new Date(Number(deadline) * 1000).toISOString());
  console.log("  voting closes:", new Date(Number(votingEnds) * 1000).toISOString());

  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, {
    name: "BigPadVote",
    address,
    contract: "contracts/BigPadVote.sol:BigPadVote",
    constructorArgs: [escrowAddress],
  });

  console.log("\nDone. Put this in config-arc.js (CirclePad on Arc) or config.js (Robinhood):");
  console.log(`  CIRCLEPAD_VOTE_ADDRESS: "${address}",`);
  console.log("\nNext: connect the recipient wallet on /circle#governance and publish the");
  console.log("candidates for each of the 5 categories (once each, can't be edited). Voting");
  console.log("opens automatically once the escrow's own deadline passes.");
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
