// Deploys ArcircleBurnVote — burn-to-vote for the CirclePad round: every
// vote burns exactly 1,000 $ARCIRCLE (sent to 0x…dEaD inside the vote
// transaction). No owner, no admin, holds nothing. Candidates and the voting
// window come from the round's existing BigPadVote, which stays as it is —
// the recipient keeps publishing candidates there.
//
//   npx hardhat run scripts/deploy-arcircle-burn-vote.js --network arcMainnet
//
// Needs DEPLOYER_PRIVATE_KEY (a wallet with a little USDC for gas on Arc)
// and, for source verification, ARC_ETHERSCAN_API_KEY in contracts/.env.
// Deploy BEFORE voting opens (the raise's close). When it prints the
// address, send it back so the site can switch to burn voting.
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
  const ends = Number(await ballot.votingEnds());
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  if (now >= ends) throw new Error("This round's voting has already ended.");
  console.log("Deploying ArcircleBurnVote on", hre.network.name, "from", deployer.address, "...");
  console.log("  ballot (candidates):", BALLOT);
  console.log("  token burned per vote: 1,000 $ARCIRCLE", ARCIRCLE);
  const F = await ethers.getContractFactory("ArcircleBurnVote");
  const bv = await F.deploy(BALLOT, ARCIRCLE);
  await bv.waitForDeployment();
  const address = await bv.getAddress();
  console.log("ArcircleBurnVote deployed:", address);
  console.log("  voting opens: ", new Date(Number(await bv.opensAt()) * 1000).toISOString());
  console.log("  voting closes:", new Date(Number(await bv.votingEnds()) * 1000).toISOString());
  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "ArcircleBurnVote", address, contract: "contracts/ArcircleBurnVote.sol:ArcircleBurnVote", constructorArgs: [BALLOT, ARCIRCLE] });
  console.log(`\nDone. Send this address back so the site can use it:\n  CIRCLEPAD_BURNVOTE_ADDRESS: "${address}",`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
