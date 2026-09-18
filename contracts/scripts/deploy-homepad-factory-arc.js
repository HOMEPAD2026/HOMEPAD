// Deploys the Arc launch system: HomepadHybridHook (CREATE2-mined address,
// fresh instance — completely separate from the one already live on
// Robinhood Chain) + HomepadFactoryArc, wired together.
//
// Does NOT touch Robinhood Chain, $HOME, or any existing HOMEPAD contract —
// this is a new chain, a new hook instance, a new factory.
//
// Chain facts this script relies on (see hardhat.config.js's arcMainnet
// entry for the full paper trail): chain ID 5042 is Arc MAINNET (5042002 is
// testnet, a different network), and the Uniswap v4 PoolManager address
// below comes from long.supply's own published integration docs, confirmed
// independently against Bitquery's indexed Arc data.
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
// NOT deployed here: a swap router. HomepadSwapRouter (used on Robinhood
// Chain) is hardcoded for native-ETH quote tokens (payable/msg.value) and
// does not fit HomepadFactoryArc, where the quote token is an arbitrary
// ERC-20 chosen per launch. Trading against these pools needs either a new
// generic-ERC20-quote router (not yet built) or direct use of Uniswap's v4
// Quoter — public routers don't route through hooked pools at all, same as
// long.supply's own docs note for their pools.

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

  console.log("1/4 — Deploying Create2Deployer...");
  const Create2Deployer = await ethers.getContractFactory("Create2Deployer");
  const create2Deployer = await Create2Deployer.deploy();
  await create2Deployer.waitForDeployment();
  const create2Addr = await create2Deployer.getAddress();
  console.log("     Create2Deployer:", create2Addr);

  console.log("2/4 — Mining a salt for HomepadHybridHook's address...");
  const HookFactory = await ethers.getContractFactory("HomepadHybridHook");
  const deployTx = await HookFactory.getDeployTransaction(poolManagerAddr, deployerSigner.address);
  const hookInitCode = deployTx.data;
  const initCodeHash = ethers.keccak256(hookInitCode);
  const { salt, address: predictedHookAddr } = mineSalt(create2Addr, initCodeHash);
  console.log("     Found salt. Hook will deploy to:", predictedHookAddr);

  console.log("3/4 — Deploying HomepadHybridHook via CREATE2...");
  const deployHookTx = await create2Deployer.deploy(salt, hookInitCode);
  await deployHookTx.wait();
  const hook = await ethers.getContractAt("HomepadHybridHook", predictedHookAddr);
  const deployedCode = await ethers.provider.getCode(predictedHookAddr);
  if (deployedCode === "0x") throw new Error("Hook deployment silently failed — no code at predicted address");
  console.log("     HomepadHybridHook deployed to:", predictedHookAddr);

  console.log("4/4 — Deploying HomepadFactoryArc and wiring it to the hook...");
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

  console.log("\nVerifying source on arc.etherscan.io...");
  await verifyIfPossible(hre, { name: "Arc Hybrid Hook", address: predictedHookAddr, contract: "contracts/HomepadHybridHook.sol:HomepadHybridHook", constructorArgs: [poolManagerAddr, deployerSigner.address] });
  await verifyIfPossible(hre, {
    name: "HomepadFactoryArc",
    address: factoryAddr,
    contract: "contracts/HomepadFactoryArc.sol:HomepadFactoryArc",
    constructorArgs: [platformTreasury, platformWallet, poolManagerAddr, predictedHookAddr, tickSpacing, baseFeeBps, creatorShareBps, platformShareBps],
  });

  console.log("\nDone.");
  console.log({ hook: predictedHookAddr, factory: factoryAddr, poolManager: poolManagerAddr });
  console.log("\nReminder: no swap router was deployed. Trading against these pools needs a");
  console.log("generic-ERC20-quote router (not yet built) or direct use of Uniswap's v4 Quoter —");
  console.log("public routers don't route through hooked pools.");
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
