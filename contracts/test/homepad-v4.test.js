const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HOMEPAD — Uniswap V4 Mode", function () {
  async function deployAll() {
    const [deployer, homeTreasury, platformWallet, alice, bob] = await ethers.getSigners();

    // Deploy the REAL Uniswap v4 PoolManager, not a mock — v4-core is a
    // deployable, dependency-light contract, so there's no need to fake it.
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(deployer.address);

    const initialVirtualEth = ethers.parseEther("3");
    const graduationThreshold = ethers.parseEther("10");
    const baseFeeBps = 100;
    const creatorShareBps = 7000;
    const homeShareBps = 10000;
    const poolFee = 3000;   // 0.3%, Uniswap's standard tier
    const tickSpacing = 60; // standard spacing for the 0.3% tier

    const Factory = await ethers.getContractFactory("HomepadFactoryV4");
    const factory = await Factory.deploy(
      homeTreasury.address,
      platformWallet.address,
      await poolManager.getAddress(),
      poolFee,
      tickSpacing,
      initialVirtualEth,
      graduationThreshold,
      baseFeeBps,
      creatorShareBps,
      homeShareBps
    );

    return { deployer, homeTreasury, platformWallet, alice, bob, factory, poolManager };
  }

  const meta = { imageUrl: "", description: "", twitter: "", telegram: "", discord: "", website: "" };

  it("launches a token + curve with the full fixed supply in the curve", async function () {
    const { factory, alice } = await deployAll();

    const tx = await factory.connect(alice).launch("Test Coin", "TEST", 0, meta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");

    expect(event).to.not.be.undefined;
    const token = await ethers.getContractAt("LaunchToken", event.args.token);
    expect(await token.balanceOf(event.args.curve)).to.equal(ethers.parseEther("1000000000"));
  });

  it("splits the base fee 70/30 between creator and $HOME treasury", async function () {
    const { factory, alice, bob, homeTreasury } = await deployAll();

    const tx = await factory.connect(alice).launch("Test Coin", "TEST", 0, meta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const curve = await ethers.getContractAt("BondingCurveV4", event.args.curve);

    const creatorBefore = await ethers.provider.getBalance(alice.address);
    const homeBefore = await ethers.provider.getBalance(homeTreasury.address);
    await curve.connect(bob).buy(0, bob.address, { value: ethers.parseEther("1") });
    const creatorAfter = await ethers.provider.getBalance(alice.address);
    const homeAfter = await ethers.provider.getBalance(homeTreasury.address);

    expect(creatorAfter - creatorBefore).to.equal(ethers.parseEther("0.007"));
    expect(homeAfter - homeBefore).to.equal(ethers.parseEther("0.003"));
  });

  it("graduates into a real Uniswap v4 pool once the threshold is met", async function () {
    const { factory, alice, bob, poolManager } = await deployAll();

    const tx = await factory.connect(alice).launch("Test Coin", "TEST", 0, meta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const curve = await ethers.getContractAt("BondingCurveV4", event.args.curve);

    let graduatedEvent = null;
    for (let i = 0; i < 6; i++) {
      const buyTx = await curve.connect(bob).buy(0, bob.address, { value: ethers.parseEther("2") });
      const buyReceipt = await buyTx.wait();
      const g = buyReceipt.logs.map((l) => {
        try { return curve.interface.parseLog(l); } catch { return null; }
      }).find((e) => e && e.name === "Graduated");
      if (g) { graduatedEvent = g; break; }
    }

    expect(await curve.graduated()).to.equal(true);
    expect(graduatedEvent).to.not.be.undefined;
    expect(graduatedEvent.args.liquidity).to.be.gt(0n);

    // The real proof this worked: the PoolManager actually holds the ETH
    // that was in the curve. If unlockCallback's settle() math were wrong,
    // this transaction would have reverted rather than under/over-settled —
    // v4 enforces that every currency delta nets to exactly zero before
    // unlock() returns.
    expect(await ethers.provider.getBalance(await poolManager.getAddress())).to.be.gt(0n);

    // Post-graduation, trading on the curve itself is closed.
    await expect(curve.connect(bob).buy(0, bob.address, { value: ethers.parseEther("1") }))
      .to.be.revertedWith("graduated: trade on the DEX pool now");
  });

  it("launchAndBuy bundles a dev buy atomically, same as the V2 factory", async function () {
    const { factory, alice } = await deployAll();

    const tx = await factory.connect(alice).launchAndBuy("Dev Buy Coin", "DBC", 0, meta, 0, {
      value: ethers.parseEther("0.5"),
    });
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const token = await ethers.getContractAt("LaunchToken", event.args.token);

    expect(await token.balanceOf(alice.address)).to.be.gt(0n);
  });
});
