// Deploys ArcircleBurnVote — burn-to-vote for the CirclePad round: every
// vote burns exactly 1,000 $ARCIRCLE (sent to 0x…dEaD inside the vote
// transaction). No owner, no admin, holds nothing. Candidates come from the
// round's BigPadVote (the recipient publishes them there).
//
// Voting window: opens the moment this is deployed and closes when the raise
// closes (the escrow's deadline). Override with BURNVOTE_OPENS_AT /
// BURNVOTE_ENDS_AT (unix seconds) if ever needed.
//
//   npx hardhat run scripts/deploy-arcircle-burn-vote.js --network arcMainnet
//
// Needs DEPLOYER_PRIVATE_KEY (any wallet with a little USDC for gas on Arc —
// it gets no rights over the contract) and, for source verification,
// ARC_ETHERSCAN_API_KEY in contracts/.env. Delete .env afterwards. When it
// prints the address and block, send them back so the site switches over.
const hre = require("hardhat");
const { ethers } = hre;
const { verifyIfPossible } = require("./lib/verify");

// CirclePad round #1 ballot (BigPadVote) and $ARCIRCLE on Arc mainnet
const BALLOT = process.env.CIRCLEPAD_VOTE_ADDRESS || "0x23c376615a58F059FC4bc83A38eB4aCdF8d39ff2";
const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  for (const [n, a] of [["BigPadVote", BALLOT], ["$ARCIRCLE", ARCIRCLE]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  const ballot = await ethers.getContractAt("BigPadVote", BALLOT);
  const escrow = await ethers.getContractAt("BigPadEscrow", await ballot.escrow());
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const opensAt = Number(process.env.BURNVOTE_OPENS_AT || 0);
  const endsAt = Number(process.env.BURNVOTE_ENDS_AT || 0);
  const closes = endsAt || Number(await escrow.deadline());
  if (closes <= now) throw new Error("The raise has already closed — there's no voting window left.");
  const set = await Promise.all([0, 1, 2, 3, 4].map((c) => ballot.optionsSet(c)));
  const names = ["name", "ticker", "logo", "roadmap", "launch date"];
  console.log("Candidates published:", set.map((x, i) => `${names[i]} ${x ? "yes" : "NO"}`).join(" · "));
  if (!set.every(Boolean)) console.log("  (categories without candidates can't be voted on until the recipient publishes them)");
  console.log("Deploying ArcircleBurnVote on", hre.network.name, "from", deployer.address, "...");
  console.log("  ballot (candidates):", BALLOT);
  console.log("  token burned per vote: 1,000 $ARCIRCLE", ARCIRCLE);
  const F = await ethers.getContractFactory("ArcircleBurnVote");
  const bv = await F.deploy(BALLOT, ARCIRCLE, opensAt, endsAt);
  await bv.waitForDeployment();
  const address = await bv.getAddress();
  const rc = await bv.deploymentTransaction().wait();
  console.log("ArcircleBurnVote deployed:", address, "at block", rc.blockNumber);
  console.log("  voting opens: ", new Date(Number(await bv.opensAt()) * 1000).toISOString());
  console.log("  voting closes:", new Date(Number(await bv.votingEnds()) * 1000).toISOString());
  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "ArcircleBurnVote", address, contract: "contracts/ArcircleBurnVote.sol:ArcircleBurnVote", constructorArgs: [BALLOT, ARCIRCLE, opensAt, endsAt] });
  console.log(`\nDone. Send this back so the site can use it:\n  CIRCLEPAD_BURNVOTE_ADDRESS: "${address}", block ${rc.blockNumber}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
