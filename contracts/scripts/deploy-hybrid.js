// Deploys the "hybrid" launch system: HomepadHybridHook (at a CREATE2-mined
// address satisfying Uniswap V4's hook permission bits) + HomepadFactoryHybrid
// + a HomepadSwapRouter wired to that hook.
//
// Required env vars:
//   HOME_TREASURY_ADDRESS
//   PLATFORM_WALLET_ADDRESS
//   POOL_MANAGER_ADDRESS — Robinhood Chain's live Uniswap v4 PoolManager
//   INITIAL_VIRTUAL_ETH — sets the launch price; same convention as
//     scripts/deploy-v4.js's bonding curve (this many ETH would buy the
//     full 1B supply at the starting price)
//
// Optional:
//   TICK_SPACING (default 60), BASE_FEE_BPS (default 100),
//   CREATOR_SHARE_BPS (default 7000), HOME_SHARE_BPS (default 10000)

const { ethers } = require("hardhat");
const hre = require("hardhat");
const { verifyIfPossible } = require("./lib/verify");

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
  const homeTreasury = requireEnv("HOME_TREASURY_ADDRESS");
  const platformWallet = requireEnv("PLATFORM_WALLET_ADDRESS");
  const poolManagerAddr = requireEnv("POOL_MANAGER_ADDRESS");
  const initialVirtualEth = ethers.parseEther(requireEnv("INITIAL_VIRTUAL_ETH"));
  const tickSpacing = Number(process.env.TICK_SPACING || 60);
  const baseFeeBps = Number(process.env.BASE_FEE_BPS || 100);
  const creatorShareBps = Number(process.env.CREATOR_SHARE_BPS || 7000);
  const homeShareBps = Number(process.env.HOME_SHARE_BPS || 10000);
  const [deployerSigner] = await ethers.getSigners();

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

  console.log("4/5 — Deploying HomepadFactoryHybrid and wiring it to the hook...");
  const Factory = await ethers.getContractFactory("HomepadFactoryHybrid");
  const factory = await Factory.deploy(
    homeTreasury,
    platformWallet,
    poolManagerAddr,
    predictedHookAddr,
    tickSpacing,
    initialVirtualEth,
    baseFeeBps,
    creatorShareBps,
    homeShareBps
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();

  const setFactoryTx = await hook.setFactory(factoryAddr);
  await setFactoryTx.wait();

  console.log("5/5 — Deploying HomepadSwapRouter (wired to the hybrid hook)...");
  const Router = await ethers.getContractFactory("HomepadSwapRouter");
  const router = await Router.deploy(poolManagerAddr, predictedHookAddr, tickSpacing);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();

  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "Hybrid Hook", address: predictedHookAddr, contract: "contracts/HomepadHybridHook.sol:HomepadHybridHook", constructorArgs: [poolManagerAddr, deployerSigner.address] });
  await verifyIfPossible(hre, { name: "Hybrid Factory", address: factoryAddr, contract: "contracts/HomepadFactoryHybrid.sol:HomepadFactoryHybrid", constructorArgs: [homeTreasury, platformWallet, poolManagerAddr, predictedHookAddr, tickSpacing, initialVirtualEth, baseFeeBps, creatorShareBps, homeShareBps] });
  await verifyIfPossible(hre, { name: "Hybrid Swap Router", address: routerAddr, contract: "contracts/HomepadSwapRouter.sol:HomepadSwapRouter", constructorArgs: [poolManagerAddr, predictedHookAddr, tickSpacing] });

  console.log("\nDone.");
  console.log({ hook: predictedHookAddr, factory: factoryAddr, router: routerAddr });
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
