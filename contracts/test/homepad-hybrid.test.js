const { expect } = require("chai");
const { ethers } = require("hardhat");

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
  throw new Error("no salt found");
}

describe("HOMEPAD — Hybrid Launch Mode (single-sided liquidity in a real pool)", function () {
  async function deployAll() {
    const [deployer, homeTreasury, platformWallet, alice, bob, carol] = await ethers.getSigners();

    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(deployer.address);

    const Create2Deployer = await ethers.getContractFactory("Create2Deployer");
    const create2Deployer = await Create2Deployer.deploy();

    const HookFactory = await ethers.getContractFactory("HomepadHybridHook");
    const deployTx = await HookFactory.getDeployTransaction(await poolManager.getAddress(), deployer.address);
    const initCodeHash = ethers.keccak256(deployTx.data);
    const { salt, address: hookAddr } = mineSalt(await create2Deployer.getAddress(), initCodeHash);
    await (await create2Deployer.deploy(salt, deployTx.data)).wait();
    const hook = await ethers.getContractAt("HomepadHybridHook", hookAddr);

    const tickSpacing = 60;
    const initialVirtualEth = ethers.parseEther("3");
    const baseFeeBps = 100;
    const creatorShareBps = 7000;
    const homeShareBps = 10000;

    const Factory = await ethers.getContractFactory("HomepadFactoryHybrid");
    const factory = await Factory.deploy(
      homeTreasury.address, platformWallet.address, await poolManager.getAddress(), hookAddr,
      tickSpacing, initialVirtualEth, baseFeeBps, creatorShareBps, homeShareBps
    );
    await (await hook.setFactory(await factory.getAddress())).wait();

    const PoolSwapTest = await ethers.getContractFactory("PoolSwapTest");
    const swapRouter = await PoolSwapTest.deploy(await poolManager.getAddress());

    return { deployer, homeTreasury, platformWallet, alice, bob, carol, factory, hook, poolManager, swapRouter, tickSpacing };
  }

  const meta = { imageUrl: "", description: "", twitter: "", telegram: "", discord: "", website: "" };

  async function launchToken(factory, creator) {
    const tx = await factory.connect(creator).launch("Hybrid Coin", "HYB", 0, meta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    return event.args.token;
  }

  function buildKey(tokenAddr, hookAddr, tickSpacing) {
    return { currency0: ethers.ZeroAddress, currency1: tokenAddr, fee: 0, tickSpacing, hooks: hookAddr };
  }

  it("launches with 8% to $HOME treasury and the rest as real single-sided liquidity, no ETH from the creator", async function () {
    const { factory, hook, homeTreasury, alice } = await deployAll();
    const aliceEthBefore = await ethers.provider.getBalance(alice.address);

    const tx = await factory.connect(alice).launch("Hybrid Coin", "HYB", 0, meta);
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;

    const event = receipt.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
    const token = await ethers.getContractAt("LaunchToken", event.args.token);

    expect(await token.balanceOf(homeTreasury.address)).to.equal(ethers.parseEther("80000000"));
    // Creator paid nothing but gas — no ETH value sent, none deducted beyond gas.
    expect(aliceEthBefore - await ethers.provider.getBalance(alice.address)).to.equal(gasCost);
  });

  it("is a real pool from launch — visible/swappable immediately", async function () {
    const { factory, hook, swapRouter, alice, bob, tickSpacing } = await deployAll();
    const tokenAddr = await launchToken(factory, alice);
    const key = buildKey(tokenAddr, await hook.getAddress(), tickSpacing);
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);

    const swapParams = { zeroForOne: true, amountSpecified: -ethers.parseEther("0.1"), sqrtPriceLimitX96: 4295128740n };
    await swapRouter.connect(bob).swap(key, swapParams, { takeClaims: false, settleUsingBurn: false }, "0x", { value: ethers.parseEther("0.1") });

    expect(await token.balanceOf(bob.address)).to.be.gt(0n);
  });

  it("charges the live fee (creator/home split) on every buy", async function () {
    const { factory, hook, homeTreasury, swapRouter, alice, bob, tickSpacing } = await deployAll();
    const tokenAddr = await launchToken(factory, alice);
    const key = buildKey(tokenAddr, await hook.getAddress(), tickSpacing);

    const creatorEthBefore = await ethers.provider.getBalance(alice.address);
    const homeEthBefore = await ethers.provider.getBalance(homeTreasury.address);

    const swapParams = { zeroForOne: true, amountSpecified: -ethers.parseEther("1"), sqrtPriceLimitX96: 4295128740n };
    await swapRouter.connect(bob).swap(key, swapParams, { takeClaims: false, settleUsingBurn: false }, "0x", { value: ethers.parseEther("1") });

    // 1% base fee on the OUTPUT (token) side per HomepadHook's afterSwap
    // logic — creator gets 70%, home gets 30% of that, paid in tokens.
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);
    expect(await token.balanceOf(alice.address)).to.be.gt(0n);
    expect(await token.balanceOf(homeTreasury.address)).to.be.gt(ethers.parseEther("80000000")); // more than the initial 8% allocation
  });

  it("price moves against a large buyer instead of staying flat (curve-like impact)", async function () {
    const { factory, hook, swapRouter, alice, bob, tickSpacing } = await deployAll();
    const tokenAddr = await launchToken(factory, alice);
    const key = buildKey(tokenAddr, await hook.getAddress(), tickSpacing);
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);

    const smallBuy = ethers.parseEther("0.01");
    await swapRouter.connect(bob).swap(
      key, { zeroForOne: true, amountSpecified: -smallBuy, sqrtPriceLimitX96: 4295128740n },
      { takeClaims: false, settleUsingBurn: false }, "0x", { value: smallBuy }
    );
    const gotForSmallBuy = await token.balanceOf(bob.address);
    const impliedRateSmall = Number(gotForSmallBuy) / Number(smallBuy);

    const bigBuy = ethers.parseEther("1");
    const beforeBig = await token.balanceOf(bob.address);
    await swapRouter.connect(bob).swap(
      key, { zeroForOne: true, amountSpecified: -bigBuy, sqrtPriceLimitX96: 4295128740n },
      { takeClaims: false, settleUsingBurn: false }, "0x", { value: bigBuy }
    );
    const gotForBigBuy = (await token.balanceOf(bob.address)) - beforeBig;
    const impliedRateBig = Number(gotForBigBuy) / Number(bigBuy);

    // A flat-price sale would give the same tokens-per-ETH regardless of
    // size; single-sided concentrated liquidity should give noticeably
    // less per ETH on the larger buy as price moves up through the range.
    expect(impliedRateBig).to.be.lessThan(impliedRateSmall);
  });

  it("lets a buyer sell back into the pool", async function () {
    const { factory, hook, swapRouter, alice, bob, tickSpacing } = await deployAll();
    const tokenAddr = await launchToken(factory, alice);
    const key = buildKey(tokenAddr, await hook.getAddress(), tickSpacing);
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);

    await swapRouter.connect(bob).swap(
      key, { zeroForOne: true, amountSpecified: -ethers.parseEther("1"), sqrtPriceLimitX96: 4295128740n },
      { takeClaims: false, settleUsingBurn: false }, "0x", { value: ethers.parseEther("1") }
    );
    const tokenBal = await token.balanceOf(bob.address);
    expect(tokenBal).to.be.gt(0n);

    await (await token.connect(bob).approve(await swapRouter.getAddress(), tokenBal)).wait();
    const ethBefore = await ethers.provider.getBalance(bob.address);

    const MIN_SQRT_PRICE_LIMIT = 4295128739n;
    const tx = await swapRouter.connect(bob).swap(
      key, { zeroForOne: false, amountSpecified: -tokenBal, sqrtPriceLimitX96: 1461446703485210103287273052203988822378723970341n - 1n },
      { takeClaims: false, settleUsingBurn: false }, "0x"
    );
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const ethAfter = await ethers.provider.getBalance(bob.address);

    expect(await token.balanceOf(bob.address)).to.equal(0n);
    expect(ethAfter + gasCost).to.be.gt(ethBefore);
  });

  it("launchAndBuy atomically buys tokens for the creator, no ETH needed for the pool itself", async function () {
    const { factory, alice } = await deployAll();

    const devBuyEth = ethers.parseEther("0.3");
    const tx = await factory.connect(alice).launchAndBuy("Hybrid Coin", "HYB", 0, meta, { value: devBuyEth });
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");

    const token = await ethers.getContractAt("LaunchToken", event.args.token);
    expect(await token.balanceOf(alice.address)).to.be.gt(0n);
  });

  it("launchAndBuy requires ETH — use launch() for a plain no-buy launch", async function () {
    const { factory, alice } = await deployAll();
    await expect(
      factory.connect(alice).launchAndBuy("Hybrid Coin", "HYB", 0, meta, { value: 0n })
    ).to.be.revertedWith("send ETH to buy with, or use launch() instead");
  });
});
