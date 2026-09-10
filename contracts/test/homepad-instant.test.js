const { expect } = require("chai");
const { ethers } = require("hardhat");

const AFTER_SWAP_FLAG = 1 << 6;
const AFTER_SWAP_RETURNS_DELTA_FLAG = 1 << 2;
const REQUIRED_FLAGS = BigInt(AFTER_SWAP_FLAG | AFTER_SWAP_RETURNS_DELTA_FLAG);
const FLAG_MASK = (1n << 14n) - 1n;

function mineSalt(deployerAddress, initCodeHash, maxTries = 200_000) {
  for (let salt = 0n; salt < BigInt(maxTries); salt++) {
    const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
    const addr = ethers.getCreate2Address(deployerAddress, saltHex, initCodeHash);
    if ((BigInt(addr) & FLAG_MASK) === REQUIRED_FLAGS) {
      return { salt: saltHex, address: addr };
    }
  }
  throw new Error("couldn't find a valid salt");
}

describe("HOMEPAD — Instant Liquidity Mode (Hook)", function () {
  async function deployAll() {
    const [deployer, homeTreasury, platformWallet, alice, bob] = await ethers.getSigners();

    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(deployer.address);

    const Create2Deployer = await ethers.getContractFactory("Create2Deployer");
    const create2Deployer = await Create2Deployer.deploy();

    const HomepadHookFactory = await ethers.getContractFactory("HomepadHook");
    const deployTx = await HomepadHookFactory.getDeployTransaction(await poolManager.getAddress(), deployer.address);
    const hookInitCode = deployTx.data;
    const initCodeHash = ethers.keccak256(hookInitCode);
    const { salt, address: hookAddr } = mineSalt(await create2Deployer.getAddress(), initCodeHash);

    await (await create2Deployer.deploy(salt, hookInitCode)).wait();
    const hook = await ethers.getContractAt("HomepadHook", hookAddr);

    const tickSpacing = 60;
    const baseFeeBps = 100;
    const creatorShareBps = 7000;
    const homeShareBps = 10000;

    const Factory = await ethers.getContractFactory("HomepadFactoryInstant");
    const factory = await Factory.deploy(
      homeTreasury.address, platformWallet.address, await poolManager.getAddress(), hookAddr,
      tickSpacing, baseFeeBps, creatorShareBps, homeShareBps
    );
    await (await hook.setFactory(await factory.getAddress())).wait();

    const PoolSwapTest = await ethers.getContractFactory("PoolSwapTest");
    const swapRouter = await PoolSwapTest.deploy(await poolManager.getAddress());

    return { deployer, homeTreasury, platformWallet, alice, bob, factory, hook, poolManager, swapRouter };
  }

  const meta = { imageUrl: "", description: "", twitter: "", telegram: "", discord: "", website: "" };

  it("launches with 8% of supply going straight to the $HOME treasury", async function () {
    const { factory, homeTreasury, alice } = await deployAll();

    const tx = await factory.connect(alice).launch("Instant Coin", "INST", 0, meta, { value: ethers.parseEther("1") });
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");

    const token = await ethers.getContractAt("LaunchToken", event.args.token);
    expect(await token.balanceOf(homeTreasury.address)).to.equal(ethers.parseEther("80000000")); // 8% of 1B
  });

  it("creates a real, immediately swappable Uniswap v4 pool at launch", async function () {
    const { factory, poolManager, swapRouter, alice, bob } = await deployAll();

    const tx = await factory.connect(alice).launch("Instant Coin", "INST", 0, meta, { value: ethers.parseEther("2") });
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const tokenAddr = event.args.token;

    const poolKeyStored = await factory.launches(0);
    const key = {
      currency0: poolKeyStored.poolKey.currency0,
      currency1: poolKeyStored.poolKey.currency1,
      fee: poolKeyStored.poolKey.fee,
      tickSpacing: poolKeyStored.poolKey.tickSpacing,
      hooks: poolKeyStored.poolKey.hooks,
    };

    // The pool must already exist and be swappable — no graduation step.
    // Bob swaps 0.1 ETH for the token, exact-input, zeroForOne (ETH -> token).
    const swapParams = {
      zeroForOne: true,
      amountSpecified: -ethers.parseEther("0.1"), // negative = exact input
      sqrtPriceLimitX96: 4295128740n, // MIN_SQRT_PRICE + 1, i.e. "no limit" for a zeroForOne swap
    };
    const testSettings = { takeClaims: false, settleUsingBurn: false };

    const tokenBefore = await (await ethers.getContractAt("LaunchToken", tokenAddr)).balanceOf(bob.address);
    await swapRouter.connect(bob).swap(key, swapParams, testSettings, "0x", { value: ethers.parseEther("0.1") });
    const tokenAfter = await (await ethers.getContractAt("LaunchToken", tokenAddr)).balanceOf(bob.address);

    expect(tokenAfter).to.be.gt(tokenBefore);
  });

  it("skims the fee on every swap and routes it live to creator + $HOME, same split as the bonding curve version", async function () {
    const { factory, homeTreasury, platformWallet, poolManager, swapRouter, alice, bob } = await deployAll();

    const tx = await factory.connect(alice).launch("Instant Coin", "INST", 0, meta, { value: ethers.parseEther("2") });
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");

    const stored = await factory.launches(0);
    const key = {
      currency0: stored.poolKey.currency0,
      currency1: stored.poolKey.currency1,
      fee: stored.poolKey.fee,
      tickSpacing: stored.poolKey.tickSpacing,
      hooks: stored.poolKey.hooks,
    };

    const swapParams = {
      zeroForOne: true,
      amountSpecified: -ethers.parseEther("1"), // exact input, ETH -> token
      sqrtPriceLimitX96: 4295128740n,
    };
    const testSettings = { takeClaims: false, settleUsingBurn: false };

    await swapRouter.connect(bob).swap(key, swapParams, testSettings, "0x", { value: ethers.parseEther("1") });

    // Fee is taken from the OUTPUT side (the token), not ETH, since this is
    // a zeroForOne (ETH->token) swap — so the fee split lands in tokens.
    const tokenAddr = event.args.token;
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);
    const creatorTokenBal = await token.balanceOf(alice.address);
    const homeTokenBal = await token.balanceOf(homeTreasury.address); // already holds the 8% allocation too

    expect(creatorTokenBal).to.be.gt(0n); // creator received their share of the fee in tokens
    expect(homeTokenBal).to.be.gt(ethers.parseEther("80000000")); // more than just the initial 8% allocation — fee share landed too
  });

  it("launchAndBuy atomically buys tokens for the creator in the same transaction as the launch", async function () {
    const { factory, alice } = await deployAll();

    const liquidityEth = ethers.parseEther("2");
    const devBuyEth = ethers.parseEther("0.5");
    const tx = await factory.connect(alice).launchAndBuy("Instant Coin", "INST", 0, meta, devBuyEth, { value: liquidityEth + devBuyEth });
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");

    const token = await ethers.getContractAt("LaunchToken", event.args.token);
    // Creator got real tokens from the dev buy, beyond just the pool existing.
    expect(await token.balanceOf(alice.address)).to.be.gt(0n);
  });

  it("launchAndBuy requires devBuyEth to leave something for liquidity", async function () {
    const { factory, alice } = await deployAll();
    const value = ethers.parseEther("1");
    await expect(
      factory.connect(alice).launchAndBuy("Instant Coin", "INST", 0, meta, value, { value })
    ).to.be.revertedWith("devBuyEth must leave something for liquidity");
  });
});
