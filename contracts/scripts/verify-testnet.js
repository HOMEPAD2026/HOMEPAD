// Verifies every already-deployed HOMEPAD testnet contract's source code on
// the testnet Blockscout explorer, using the addresses this conversation
// has recorded and the same env-var-driven values the deploy scripts use
// (so the "correct" values are the SAME ones already in your .env, not a
// second copy that could drift). A wrong constructor arg just fails
// verification cleanly (Blockscout reports a bytecode mismatch) — it can't
// break anything already deployed, so it's safe to just run this and see
// what needs adjusting.
//
// Usage:
//   npx hardhat run scripts/verify-testnet.js --network robinhoodTestnet
//
// Needs the same env vars deploy-hybrid.js / deploy-instant.js /
// deploy-paired.js / deploy-v4.js already use: HOME_TREASURY_ADDRESS,
// PLATFORM_WALLET_ADDRESS, POOL_MANAGER_ADDRESS, DEPLOYER_PRIVATE_KEY
// (used here only to derive the hook admin address), and optionally
// TICK_SPACING / BASE_FEE_BPS / CREATOR_SHARE_BPS / HOME_SHARE_BPS if you
// overrode any of those away from the defaults below.
//
// The three curve-specific values (POOL_FEE, CURVE_INITIAL_VIRTUAL_ETH,
// GRADUATION_THRESHOLD) are the ones this script is LEAST sure about —
// deploy-v4.js's own script default is 3 ETH virtual / 10 ETH threshold,
// but the live site's own cards show a graduation bar out of 3.0 ETH for
// already-launched curve tokens, which only happens if GRADUATION_THRESHOLD
// was actually set to 3 at deploy time — so "3" is used as the guess below
// instead of the script's own default. If this one specifically fails,
// that's the value most likely to be off; check your own deploy record.

const { ethers } = require("hardhat");
const hre = require("hardhat");
const { verifyIfPossible } = require("./lib/verify");

const HOME_TREASURY = requireEnv("HOME_TREASURY_ADDRESS");
const PLATFORM_WALLET = requireEnv("PLATFORM_WALLET_ADDRESS");
const POOL_MANAGER = requireEnv("POOL_MANAGER_ADDRESS");
const TICK_SPACING = Number(process.env.TICK_SPACING || 60);
const BASE_FEE_BPS = Number(process.env.BASE_FEE_BPS || 100);
const CREATOR_SHARE_BPS = Number(process.env.CREATOR_SHARE_BPS || 7000);
const HOME_SHARE_BPS = Number(process.env.HOME_SHARE_BPS || 10000);
// Whoever ran the deploy — the hooks' constructor takes this as `_admin`.
const HOOK_ADMIN = new ethers.Wallet(requireEnv("DEPLOYER_PRIVATE_KEY")).address;

// --- Curve-specific values — least certain of the bunch, per the note above ---
const CURVE_POOL_FEE = Number(process.env.POOL_FEE || 3000);
const CURVE_INITIAL_VIRTUAL_ETH = ethers.parseEther(process.env.CURVE_INITIAL_VIRTUAL_ETH || "3");
const CURVE_GRADUATION_THRESHOLD = ethers.parseEther(process.env.GRADUATION_THRESHOLD || "3");
// Hybrid's own starting-price constant (fixed per factory, unlike Paired
// where each launch sets its own).
const HYBRID_INITIAL_VIRTUAL_ETH = ethers.parseEther(process.env.HYBRID_INITIAL_VIRTUAL_ETH || "3");

const contracts = [
  {
    name: "Bonding Curve Factory",
    address: "0x154f77D9CEE487E97553330028ED1425a238085d",
    contract: "contracts/HomepadFactoryV4.sol:HomepadFactoryV4",
    constructorArgs: [HOME_TREASURY, PLATFORM_WALLET, POOL_MANAGER, CURVE_POOL_FEE, TICK_SPACING, CURVE_INITIAL_VIRTUAL_ETH, CURVE_GRADUATION_THRESHOLD, BASE_FEE_BPS, CREATOR_SHARE_BPS, HOME_SHARE_BPS],
  },
  {
    name: "Hybrid Hook",
    address: "0x002dDC296285D92CdB3c4c40a1b510ce67774044",
    contract: "contracts/HomepadHybridHook.sol:HomepadHybridHook",
    constructorArgs: [POOL_MANAGER, HOOK_ADMIN],
  },
  {
    name: "Hybrid Factory",
    address: "0x403DE4697e1d3A7E837e5778532E1247B9C87b99",
    contract: "contracts/HomepadFactoryHybrid.sol:HomepadFactoryHybrid",
    constructorArgs: [HOME_TREASURY, PLATFORM_WALLET, POOL_MANAGER, "0x002dDC296285D92CdB3c4c40a1b510ce67774044", TICK_SPACING, HYBRID_INITIAL_VIRTUAL_ETH, BASE_FEE_BPS, CREATOR_SHARE_BPS, HOME_SHARE_BPS],
  },
  {
    name: "Hybrid Swap Router",
    address: "0xF40F33D6E3240d29a6E04339b07b927053d74cF1",
    // NOTE: deploy-hybrid.js actually deploys the generic HomepadSwapRouter
    // here, not HomepadHybridSwapRouter.sol — that file appears to be
    // unused (both Hybrid and Instant share this same router contract,
    // pointed at their own hook). Verify against what's REALLY deployed.
    contract: "contracts/HomepadSwapRouter.sol:HomepadSwapRouter",
    constructorArgs: [POOL_MANAGER, "0x002dDC296285D92CdB3c4c40a1b510ce67774044", TICK_SPACING],
  },
  {
    name: "Instant Hook",
    address: "0xf9f5105d59AF2B2538D0AcD961D10b61C4CcC044",
    contract: "contracts/HomepadHook.sol:HomepadHook",
    constructorArgs: [POOL_MANAGER, HOOK_ADMIN],
  },
  {
    name: "Instant Liquidity Factory",
    address: "0xcfF2c7FFbd867CcaE3c253Baaf10d58d5eC1ba17",
    contract: "contracts/HomepadFactoryInstant.sol:HomepadFactoryInstant",
    constructorArgs: [HOME_TREASURY, PLATFORM_WALLET, POOL_MANAGER, "0xf9f5105d59AF2B2538D0AcD961D10b61C4CcC044", TICK_SPACING, BASE_FEE_BPS, CREATOR_SHARE_BPS, HOME_SHARE_BPS],
  },
  {
    name: "Instant Swap Router",
    address: "0x917F2f7A7E4607937c3562E96b2E02325264B813",
    contract: "contracts/HomepadSwapRouter.sol:HomepadSwapRouter",
    constructorArgs: [POOL_MANAGER, "0xf9f5105d59AF2B2538D0AcD961D10b61C4CcC044", TICK_SPACING],
  },
  {
    name: "Paired Hook",
    address: "0xA4BA24582a4718Ef67aCEB6fe0112B23a79A0044",
    contract: "contracts/HomepadHybridHook.sol:HomepadHybridHook", // reused instance
    constructorArgs: [POOL_MANAGER, HOOK_ADMIN],
  },
  {
    name: "Paired Factory",
    address: "0x7750339Eb5b5E11d934c6FA3e0f6e9f23df0Aa4f",
    contract: "contracts/HomepadFactoryPaired.sol:HomepadFactoryPaired",
    constructorArgs: [HOME_TREASURY, PLATFORM_WALLET, POOL_MANAGER, "0xA4BA24582a4718Ef67aCEB6fe0112B23a79A0044", TICK_SPACING, BASE_FEE_BPS, CREATOR_SHARE_BPS, HOME_SHARE_BPS],
  },
  {
    name: "Paired Swap Router",
    address: "0x7e8cBDA25f077cEc163765223e53a5C554Af2328",
    contract: "contracts/HomepadPairedSwapRouter.sol:HomepadPairedSwapRouter",
    constructorArgs: [POOL_MANAGER, "0x7750339Eb5b5E11d934c6FA3e0f6e9f23df0Aa4f"],
  },
];

async function main() {
  console.log(`Verifying ${contracts.length} contracts on ${hre.network.name} via Blockscout...\n`);
  const results = [];
  for (const c of contracts) {
    const ok = await verifyIfPossible(hre, { name: c.name, address: c.address, contract: c.contract, constructorArgs: c.constructorArgs });
    results.push({ name: c.name, ok });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verified.`);
  if (failed.length) {
    console.log("Failed:", failed.map((f) => f.name).join(", "));
    console.log("A FAILED line usually means one constructor arg differs from what was actually deployed — check the value this script guessed for that contract (see the comments at the top) against your own deploy record and retry.");
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
