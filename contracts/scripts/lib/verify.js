// Shared verification helper for the deploy-*.js scripts — verifies a
// freshly-deployed contract on the network's Blockscout explorer right
// after deploying it, so verification is never a separate step someone
// has to remember. Never throws: a deploy script's job is to get
// contracts on-chain, and a slow/flaky verification call (Blockscout
// sometimes needs a few seconds to index a brand-new contract before it
// can verify it) shouldn't fail that after the fact. Failures are logged
// clearly with the exact retry command instead.
//
// Uses the hre.run("verify:verify", ...) task rather than importing
// @nomicfoundation/hardhat-verify/verify directly — that subpath export
// only exists on newer plugin versions, while the task itself has been
// stable across every 2.x release, so this works regardless of exactly
// which 2.x version ends up resolved.

async function verifyIfPossible(hre, { name, address, contract, constructorArgs }) {
  // Only the two networks that actually have a Blockscout instance
  // configured (see the etherscan.customChains block in hardhat.config.js)
  // support this — skip quietly on a local/hardhat network instead of
  // erroring.
  const known = ["robinhoodTestnet", "robinhoodMainnet"];
  if (!known.includes(hre.network.name)) return true;

  process.stdout.write(`  Verifying ${name}... `);
  // Blockscout needs a moment to index a contract that was just deployed
  // in this same script run before it can verify it.
  await new Promise((r) => setTimeout(r, 5000));
  try {
    await hre.run("verify:verify", { address, contract, constructorArguments: constructorArgs });
    console.log("done.");
    return true;
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (msg.toLowerCase().includes("already verified")) {
      console.log("already verified.");
      return true;
    }
    console.log("FAILED —", msg.slice(0, 150));
    console.log(`    Retry later with: npx hardhat run scripts/verify-testnet.js --network ${hre.network.name}`);
    console.log(`    (or manually: npx hardhat verify --network ${hre.network.name} ${address} ${constructorArgs.map(String).join(" ")})`);
    return false;
  }
}

module.exports = { verifyIfPossible };
