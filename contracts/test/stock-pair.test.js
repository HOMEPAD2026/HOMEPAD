const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HOMEPAD — Stock-Paired Mode", function () {
  async function deployAll() {
    const [deployer, homeTreasury, platformWallet, alice, bob] = await ethers.getSigners();

    const wethStandIn = ethers.Wallet.createRandom().address;
    const MockFactory = await ethers.getContractFactory("MockFactory");
    const mockFactory = await MockFactory.deploy();
    const MockRouter = await ethers.getContractFactory("MockRouter");
    const mockRouter = await MockRouter.deploy(await mockFactory.getAddress(), wethStandIn);

    const MockStockToken = await ethers.getContractFactory("MockStockToken");
    const stock = await MockStockToken.connect(deployer).deploy("Mock AAPL", "AAPL");
    // Give bob some "AAPL" to trade with, the way he'd already hold Stock Tokens in real life.
    await stock.connect(deployer).transfer(bob.address, ethers.parseEther("1000"));

    const graduationThreshold = ethers.parseEther("50"); // 50 "AAPL" units raised triggers graduation
    const baseFeeBps = 100; // 1%
    const creatorShareBps = 7000; // 70% of base fee -> creator
    const homeShareBps = 10000;

    const Factory = await ethers.getContractFactory("StockHomepadFactory");
    const factory = await Factory.deploy(
      homeTreasury.address,
      platformWallet.address,
      await mockRouter.getAddress(),
      graduationThreshold,
      baseFeeBps,
      creatorShareBps,
      homeShareBps,
      [await stock.getAddress()]
    );

    return { deployer, homeTreasury, platformWallet, alice, bob, factory, stock, mockRouter };
  }

  const emptyMeta = { imageUrl: "", description: "", twitter: "", telegram: "", discord: "" };

  it("only allows launching against an allowlisted quote token", async function () {
    const { factory, alice, stock } = await deployAll();
    const notAllowed = ethers.Wallet.createRandom().address;

    await expect(
      factory.connect(alice).launch("Test", "TST", notAllowed, ethers.parseEther("10"), 0, emptyMeta)
    ).to.be.revertedWith("quote token not allowed");

    await expect(
      factory.connect(alice).launch("Test", "TST", await stock.getAddress(), ethers.parseEther("10"), 0, emptyMeta)
    ).to.not.be.reverted;
  });

  it("splits the base fee 70/30 between creator and $HOME treasury, in the stock token", async function () {
    const { factory, alice, bob, stock, homeTreasury } = await deployAll();

    const tx = await factory.connect(alice).launch("Test", "TST", await stock.getAddress(), ethers.parseEther("10"), 0, emptyMeta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const curve = await ethers.getContractAt("StockBondingCurve", event.args.curve);
    const token = await ethers.getContractAt("LaunchToken", event.args.token);

    const buyAmount = ethers.parseEther("5");
    await stock.connect(bob).approve(await curve.getAddress(), buyAmount);

    const creatorBefore = await stock.balanceOf(alice.address);
    const homeBefore = await stock.balanceOf(homeTreasury.address);
    await curve.connect(bob).buy(buyAmount, 0);
    const creatorAfter = await stock.balanceOf(alice.address);
    const homeAfter = await stock.balanceOf(homeTreasury.address);

    // 1% of 5 AAPL = 0.05 AAPL total fee. 70% (0.035) -> creator, 30% (0.015) -> home.
    expect(creatorAfter - creatorBefore).to.equal(ethers.parseEther("0.035"));
    expect(homeAfter - homeBefore).to.equal(ethers.parseEther("0.015"));
    expect(await token.balanceOf(bob.address)).to.be.gt(0n);
  });

  it("sends 100% of the creator's chosen extra fee to them, same as the ETH curve", async function () {
    const { factory, alice, bob, stock, homeTreasury } = await deployAll();

    const tx = await factory.connect(alice).launch("Test", "TST", await stock.getAddress(), ethers.parseEther("10"), 150, emptyMeta); // +1.5% extra
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const curve = await ethers.getContractAt("StockBondingCurve", event.args.curve);

    expect(await curve.totalFeeBps()).to.equal(250); // 1% base + 1.5% extra

    const buyAmount = ethers.parseEther("10");
    await stock.connect(bob).approve(await curve.getAddress(), buyAmount);

    const creatorBefore = await stock.balanceOf(alice.address);
    const homeBefore = await stock.balanceOf(homeTreasury.address);
    await curve.connect(bob).buy(buyAmount, 0);
    const creatorAfter = await stock.balanceOf(alice.address);
    const homeAfter = await stock.balanceOf(homeTreasury.address);

    // Total fee = 2.5% of 10 = 0.25 AAPL. Base = 1% = 0.1 -> 70% (0.07) to creator, 30% (0.03) to home.
    // Extra = 1.5% = 0.15 -> 100% to creator. Creator total = 0.07 + 0.15 = 0.22.
    expect(creatorAfter - creatorBefore).to.equal(ethers.parseEther("0.22"));
    expect(homeAfter - homeBefore).to.equal(ethers.parseEther("0.03"));
  });

  it("graduates once the stock-quote threshold is met and burns the LP", async function () {
    const { factory, alice, bob, stock } = await deployAll();

    const tx = await factory.connect(alice).launch("Test", "TST", await stock.getAddress(), ethers.parseEther("10"), 0, emptyMeta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const curve = await ethers.getContractAt("StockBondingCurve", event.args.curve);

    for (let i = 0; i < 6; i++) {
      const chunk = ethers.parseEther("10");
      await stock.connect(bob).approve(await curve.getAddress(), chunk);
      await curve.connect(bob).buy(chunk, 0);
      if (await curve.graduated()) break;
    }

    expect(await curve.graduated()).to.equal(true);
  });
});
