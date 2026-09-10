// Deploys the "paired hybrid" launch system — hybrid mode with an ERC-20
// quote token (Robinhood Stock Tokens, later $HOME) instead of ETH:
//   HomepadHybridHook (its own instance, CREATE2-mined for v4's hook flag
//   bits) + HomepadFactoryPaired + HomepadPairedSwapRouter.
//
// Required env vars:
//   HOME_TREASURY_ADDRESS, PLATFORM_WALLET_ADDRESS
//   POOL_MANAGER_ADDRESS — Robinhood Chain's live Uniswap v4 PoolManager
// Optional:
//   TICK_SPACING (60), BASE_FEE_BPS (100), CREATOR_SHARE_BPS (7000), HOME_SHARE_BPS (10000)
//   DEPLOY_MOCK_STOCKS=1 — also deploy a few mintable mock stock tokens for
//     testnet (TSLA / NVDA / AAPL) and mint 1,000,000 of each to the
//     deployer. Leave unset on mainnet.

const { ethers } = require("hardhat");
const { verifyIfPossible } = require("./lib/verify");
const hre = require("hardhat");

const AFTER_SWAP_FLAG = 1 << 6;
const AFTER_SWAP_RETURNS_DELTA_FLAG = 1 << 2;
const REQUIRED_FLAGS = BigInt(AFTER_SWAP_FLAG | AFTER_SWAP_RETURNS_DELTA_FLAG);
const FLAG_MASK = (1n << 14n) - 1n;

function mineSalt(deployerAddress, initCodeHash, maxTries = 300_000) {
  for (let salt = 0n; salt < BigInt(maxTries); salt++) {
    const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
    const addr = ethers.getCreate2Address(deployerAddress, saltHex, initCodeHash);
    if ((BigInt(addr) & FLAG_MASK) === REQUIRED_FLAGS) return { salt: saltHex, address: addr };
  }
  throw new Error(`Couldn't find a valid salt in ${maxTries} tries`);
}

async function main() {
  const homeTreasury = requireEnv("HOME_TREASURY_ADDRESS");
  const platformWallet = requireEnv("PLATFORM_WALLET_ADDRESS");
  const poolManagerAddr = requireEnv("POOL_MANAGER_ADDRESS");
  const tickSpacing = Number(process.env.TICK_SPACING || 60);
  const baseFeeBps = Number(process.env.BASE_FEE_BPS || 100);
  const creatorShareBps = Number(process.env.CREATOR_SHARE_BPS || 7000);
  const homeShareBps = Number(process.env.HOME_SHARE_BPS || 10000);
  const [deployer] = await ethers.getSigners();

  console.log("1/5 — Deploying Create2Deployer...");
  const Create2Deployer = await ethers.getContractFactory("Create2Deployer");
  const create2 = await Create2Deployer.deploy();
  await create2.waitForDeployment();
  const create2Addr = await create2.getAddress();
  console.log("     Create2Deployer:", create2Addr);

  console.log("2/5 — Mining a salt for the hook's address...");
  const HookFactory = await ethers.getContractFactory("HomepadHybridHook");
  const hookTx = await HookFactory.getDeployTransaction(poolManagerAddr, deployer.address);
  const { salt, address: hookAddr } = mineSalt(create2Addr, ethers.keccak256(hookTx.data));
  console.log("     Hook will deploy to:", hookAddr);

  console.log("3/5 — Deploying HomepadHybridHook (paired instance) via CREATE2...");
  await (await create2.deploy(salt, hookTx.data)).wait();
  if ((await ethers.provider.getCode(hookAddr)) === "0x") throw new Error("Hook deployment failed — no code at predicted address");
  const hook = await ethers.getContractAt("HomepadHybridHook", hookAddr);
  console.log("     Hook:", hookAddr);

  console.log("4/5 — Deploying HomepadFactoryPaired and wiring the hook...");
  const Factory = await ethers.getContractFactory("HomepadFactoryPaired");
  const factory = await Factory.deploy(homeTreasury, platformWallet, poolManagerAddr, hookAddr, tickSpacing, baseFeeBps, creatorShareBps, homeShareBps);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  await (await hook.setFactory(factoryAddr)).wait();
  console.log("     Factory:", factoryAddr);

  console.log("5/5 — Deploying HomepadPairedSwapRouter...");
  const Router = await ethers.getContractFactory("HomepadPairedSwapRouter");
  const router = await Router.deploy(poolManagerAddr, factoryAddr);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log("     Router:", routerAddr);

  const out = { PAIRED_HOOK_ADDRESS: hookAddr, PAIRED_FACTORY_ADDRESS: factoryAddr, PAIRED_SWAP_ROUTER_ADDRESS: routerAddr };

  console.log("\nVerifying source on the explorer...");
  await verifyIfPossible(hre, { name: "Paired Hook", address: hookAddr, contract: "contracts/HomepadHybridHook.sol:HomepadHybridHook", constructorArgs: [poolManagerAddr, deployer.address] });
  await verifyIfPossible(hre, { name: "Paired Factory", address: factoryAddr, contract: "contracts/HomepadFactoryPaired.sol:HomepadFactoryPaired", constructorArgs: [homeTreasury, platformWallet, poolManagerAddr, hookAddr, tickSpacing, baseFeeBps, creatorShareBps, homeShareBps] });
  await verifyIfPossible(hre, { name: "Paired Swap Router", address: routerAddr, contract: "contracts/HomepadPairedSwapRouter.sol:HomepadPairedSwapRouter", constructorArgs: [poolManagerAddr, factoryAddr] });

  if (process.env.DEPLOY_MOCK_STOCKS === "1") {
    console.log("\nDeploying mock stock tokens (testnet only)...");
    const Mock = await ethers.getContractFactory("MockStockToken");
    out.MOCK_STOCKS = {};
    for (const [name, sym] of [["Tesla (mock)", "TSLA"], ["NVIDIA (mock)", "NVDA"], ["Apple (mock)", "AAPL"]]) {
      const m = await Mock.deploy(name, sym);
      await m.waitForDeployment();
      out.MOCK_STOCKS[sym] = await m.getAddress();
      console.log(`     ${sym}:`, out.MOCK_STOCKS[sym], "(1,000,000 minted to deployer)");
    }
  }

  console.log("\nDone. Paste into frontend config.js:");
  console.log(JSON.stringify(out, null, 2));
  console.log("\nVerify on the explorer before announcing.");
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
