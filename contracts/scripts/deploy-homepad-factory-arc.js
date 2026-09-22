// Deploys the Arc launch system ("ARCPAD"): HomepadHybridHook (CREATE2-mined
// address, fresh instance — completely separate from the one already live
// on Robinhood Chain) + HomepadFactoryArc + HomepadArcSwapRouter, wired
// together.
//
// Does NOT touch Robinhood Chain, $HOME, or any existing HOMEPAD contract —
// this is a new chain, a new hook instance, a new factory.
//
// Chain facts this script relies on (see hardhat.config.js's arcMainnet
// entry for the full paper trail): chain ID 5042 is Arc MAINNET (5042002 is
// testnet, a different network). The Uniswap v4 PoolManager address below
// was cross-checked directly against Circle's own Arc docs
// (docs.arc.io/arc/references/contract-addresses) and Uniswap's own
// UniswapX playbook (github.com/Uniswap/UniswapX/blob/main/playbook/chains/arc.md)
// in addition to the long.supply/Bitquery cross-check already on file —
// both independently agree on 0x8366a39CC670B4001A1121B8F6A443A643e40951.
// Arc's native-USDC ERC-20 predeploy (6 decimals) is
// 0x3600000000000000000000000000000000000000, per the same two sources —
// pass that as `quoteToken_` on launch()/launchAndBuy() for a USDC-quoted
// ARCPAD launch. Native currency (msg.value, 18 decimals) IS USDC on Arc,
// which is what LAUNCH_FEE in HomepadFactoryArc is denominated in.
//
// Required env vars:
//   PLATFORM_TREASURY_ADDRESS
//   PLATFORM_WALLET_ADDRESS
//   POOL_MANAGER_ADDRESS — defaults to Arc mainnet's live PoolManager
//     (0x8366a39CC670B4001A1121B8F6A443A643e40951) if not set; override
//     only if that address turns out to be wrong for some reason.
//
// Optional:
//   TICK_SPACING (default 200 — matches long.supply's own v4 pools on Arc),
//   BASE_FEE_BPS (default 100), CREATOR_SHARE_BPS (default 7000),
//   PLATFORM_SHARE_BPS (default 10000)
//
// Also deploys HomepadArcSwapRouter (step 5/5) — HomepadPairedSwapRouter's
// exact mechanics retargeted at HomepadFactoryArc, since HomepadSwapRouter
// (Robinhood Chain, native-ETH quote) doesn't fit a generic-ERC20-quote
// factory. This closes the gap this file used to flag ("no swap router —
// trading needs the v4 Quoter directly").

const { ethers } = require("hardhat");
const hre = require("hardhat");
const { verifyIfPossible } = require("./lib/verify");

const ARC_POOL_MANAGER_DEFAULT = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

// Must match HomepadHybridHook.getHookPermissions(): afterSwap + afterSwapReturnDelta.
const AFTER_SWAP_FLAG = 1 << 6;
const AFTER_SWAP_RETURNS_DELTA_FLAG = 1 << 2;
const REQUIRED_FLAGS = BigInt(AFTER_SWAP_FLAG | AFTER_SWAP_RETURNS_DELTA_FLAG);
const FLAG_MASK = (1n << 14n) - 1n; // Hooks.ALL_HOOK_MASK

function mineSalt(deployerAddress, initCodeHash, maxTries = 200_000) {
  for (let salt = 0n; salt < BigInt(maxTries); salt++) {
    const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
    const addr = ethers.getCreate2Address(deployerAddress, saltHex, initCodeHash);
    if ((BigInt(addr) & FLAG_MASK) === REQUIRED_FLAGS) {
      return { salt: saltHex, address: addr };
    }
  }
  throw new Error(`Couldn't find a valid salt in ${maxTries} tries`);
}

async function main() {
  if (hre.network.config.chainId !== 5042) {
    throw new Error(`Refusing to run: this network's chainId is ${hre.network.config.chainId}, expected 5042 (Arc mainnet). ` +
      `5042002 is Arc TESTNET, a different network — check --network.`);
  }

  const platformTreasury = requireEnv("PLATFORM_TREASURY_ADDRESS");
  const platformWallet = requireEnv("PLATFORM_WALLET_ADDRESS");
  const poolManagerAddr = process.env.POOL_MANAGER_ADDRESS || ARC_POOL_MANAGER_DEFAULT;
  const tickSpacing = Number(process.env.TICK_SPACING || 200);
  const baseFeeBps = Number(process.env.BASE_FEE_BPS || 100);
  const creatorShareBps = Number(process.env.CREATOR_SHARE_BPS || 7000);
  const platformShareBps = Number(process.env.PLATFORM_SHARE_BPS || 10000);
  const [deployerSigner] = await ethers.getSigners();

  console.log("Deploying on Arc mainnet (chain 5042). PoolManager:", poolManagerAddr);
  const pmCode = await ethers.provider.getCode(poolManagerAddr);
  if (pmCode === "0x") throw new Error(`No contract code at PoolManager address ${poolManagerAddr} — double check POOL_MANAGER_ADDRESS.`);

  console.log("1/5 — Deploying Create2Deployer...");
  const Create2Deployer = await ethers.getContractFactory("Create2Deployer");
  const create2Deployer = await Create2Deployer.deploy();
  await create2Deployer.waitForDeployment();
  const create2Addr = await create2Deployer.getAddress();
  console.log("     Create2Deployer:", create2Addr);

  console.log("2/5 — Mining a salt for HomepadHybridHook's address...");
  const HookFactory = await ethers.getContractFactory("HomepadHybridHook");
  const deployTx = await HookFactory.getDeployTransaction(poolManagerAddr, deployerSigner.address);
  const hookInitCode = deployTx.data;
  const initCodeHash = ethers.keccak256(hookInitCode);
  const { salt, address: predictedHookAddr } = mineSalt(create2Addr, initCodeHash);
  console.log("     Found salt. Hook will deploy to:", predictedHookAddr);

  console.log("3/5 — Deploying HomepadHybridHook via CREATE2...");
  const deployHookTx = await create2Deployer.deploy(salt, hookInitCode);
  await deployHookTx.wait();
  const hook = await ethers.getContractAt("HomepadHybridHook", predictedHookAddr);
  const deployedCode = await ethers.provider.getCode(predictedHookAddr);
  if (deployedCode === "0x") throw new Error("Hook deployment silently failed — no code at predicted address");
  console.log("     HomepadHybridHook deployed to:", predictedHookAddr);

  console.log("4/5 — Deploying HomepadFactoryArc and wiring it to the hook...");
  const Factory = await ethers.getContractFactory("HomepadFactoryArc");
  const factory = await Factory.deploy(
    platformTreasury,
    platformWallet,
    poolManagerAddr,
    predictedHookAddr,
    tickSpacing,
    baseFeeBps,
    creatorShareBps,
    platformShareBps
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();

  const setFactoryTx = await hook.setFactory(factoryAddr);
  await setFactoryTx.wait();

  console.log("5/5 — Deploying HomepadArcSwapRouter (buy/sell against these launches)...");
  const Router = await ethers.getContractFactory("HomepadArcSwapRouter");
  const router = await Router.deploy(poolManagerAddr, factoryAddr);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log("     HomepadArcSwapRouter deployed to:", routerAddr);

  console.log("\nVerifying source on arc.etherscan.io...");
  await verifyIfPossible(hre, { name: "Arc Hybrid Hook", address: predictedHookAddr, contract: "contracts/HomepadHybridHook.sol:HomepadHybridHook", constructorArgs: [poolManagerAddr, deployerSigner.address] });
  await verifyIfPossible(hre, {
    name: "HomepadFactoryArc",
    address: factoryAddr,
    contract: "contracts/HomepadFactoryArc.sol:HomepadFactoryArc",
    constructorArgs: [platformTreasury, platformWallet, poolManagerAddr, predictedHookAddr, tickSpacing, baseFeeBps, creatorShareBps, platformShareBps],
  });
  await verifyIfPossible(hre, {
    name: "HomepadArcSwapRouter",
    address: routerAddr,
    contract: "contracts/HomepadArcSwapRouter.sol:HomepadArcSwapRouter",
    constructorArgs: [poolManagerAddr, factoryAddr],
  });

  console.log("\nDone.");
  console.log({ hook: predictedHookAddr, factory: factoryAddr, router: routerAddr, poolManager: poolManagerAddr });
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
