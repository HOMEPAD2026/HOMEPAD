const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HOMEPAD", function () {
  async function deployAll() {
    const [deployer, homeTreasury, platformWallet, alice, bob] = await ethers.getSigners();

    // Dummy WETH stand-in — the mock router never actually wraps/unwraps it,
    // it just needs a stable address to key the pair mapping on.
    const wethStandIn = ethers.Wallet.createRandom().address;

    const MockFactory = await ethers.getContractFactory("MockFactory");
    const mockFactory = await MockFactory.deploy();

    const MockRouter = await ethers.getContractFactory("MockRouter");
    const mockRouter = await MockRouter.deploy(await mockFactory.getAddress(), wethStandIn);

    const initialVirtualEth = ethers.parseEther("3");     // shapes the opening price
    const graduationThreshold = ethers.parseEther("10");  // net ETH raised to trigger graduation
    const baseFeeBps = 100;        // 1% base fee
    const creatorShareBps = 7000;  // 70% of the base fee -> creator
    const homeShareBps = 10000;    // of the base fee's platform share, 100% -> $HOME treasury

    const Factory = await ethers.getContractFactory("HomepadFactory");
    const factory = await Factory.deploy(
      homeTreasury.address,
      platformWallet.address,
      await mockRouter.getAddress(),
      initialVirtualEth,
      graduationThreshold,
      baseFeeBps,
      creatorShareBps,
      homeShareBps
    );

    return { deployer, homeTreasury, platformWallet, alice, bob, factory, mockRouter };
  }

  const meta = { imageUrl: "https://example.com/img.png", description: "A test coin", twitter: "https://x.com/test", telegram: "https://t.me/test", discord: "https://discord.gg/test" };
  const emptyMeta = { imageUrl: "", description: "", twitter: "", telegram: "", discord: "" };

  it("launches a token + curve with the full fixed supply in the curve", async function () {
    const { factory, alice } = await deployAll();

    const tx = await factory.connect(alice).launch("Test Coin", "TEST", 0, meta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");

    expect(event).to.not.be.undefined;
    const tokenAddr = event.args.token;
    const curveAddr = event.args.curve;

    const token = await ethers.getContractAt("LaunchToken", tokenAddr);
    expect(await token.balanceOf(curveAddr)).to.equal(ethers.parseEther("1000000000"));
    expect(await factory.launchCount()).to.equal(1n);
  });

  it("splits the 1% base fee 70/30 between the creator and $HOME treasury", async function () {
    const { factory, alice, bob, homeTreasury } = await deployAll();

    const tx = await factory.connect(alice).launch("Test Coin", "TEST", 0, meta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const curve = await ethers.getContractAt("BondingCurve", event.args.curve);
    const token = await ethers.getContractAt("LaunchToken", event.args.token);

    const creatorBefore = await ethers.provider.getBalance(alice.address);
    const homeBefore = await ethers.provider.getBalance(homeTreasury.address);
    await curve.connect(bob).buy(0, bob.address, { value: ethers.parseEther("1") });
    const creatorAfter = await ethers.provider.getBalance(alice.address);
    const homeAfter = await ethers.provider.getBalance(homeTreasury.address);

    // 1% of 1 ETH = 0.01 ETH total fee. 70% (0.007) -> creator, 30% (0.003) -> home.
    expect(creatorAfter - creatorBefore).to.equal(ethers.parseEther("0.007"));
    expect(homeAfter - homeBefore).to.equal(ethers.parseEther("0.003"));
    expect(await token.balanceOf(bob.address)).to.be.gt(0n);
  });

  it("sends 100% of a creator's chosen extra fee to the creator, on top of their base-fee share", async function () {
    const { factory, alice, bob, homeTreasury } = await deployAll();

    // 2% extra on top of the 1% base = 3% total.
    const tx = await factory.connect(alice).launch("Test Coin", "TEST", 200, meta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const curve = await ethers.getContractAt("BondingCurve", event.args.curve);

    expect(await curve.totalFeeBps()).to.equal(300);

    const creatorBefore = await ethers.provider.getBalance(alice.address);
    const homeBefore = await ethers.provider.getBalance(homeTreasury.address);
    await curve.connect(bob).buy(0, bob.address, { value: ethers.parseEther("1") });
    const creatorAfter = await ethers.provider.getBalance(alice.address);
    const homeAfter = await ethers.provider.getBalance(homeTreasury.address);

    // Total fee = 3% of 1 ETH = 0.03 ETH.
    // Base portion = 1% = 0.01 ETH -> 70% (0.007) to creator, 30% (0.003) to home.
    // Extra portion = 2% = 0.02 ETH -> 100% to creator.
    // Creator total = 0.007 + 0.02 = 0.027 ETH. Home stays at 0.003 ETH.
    expect(creatorAfter - creatorBefore).to.equal(ethers.parseEther("0.027"));
    expect(homeAfter - homeBefore).to.equal(ethers.parseEther("0.003"));
  });

  it("rejects an extra fee above the 2% cap", async function () {
    const { factory, alice } = await deployAll();
    await expect(factory.connect(alice).launch("Test Coin", "TEST", 201, meta))
      .to.be.revertedWith("extra fee capped at 2%");
  });

  it("lets a seller exit and receive ETH net of fee", async function () {
    const { factory, alice, bob } = await deployAll();

    const tx = await factory.connect(alice).launch("Test Coin", "TEST", 0, meta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const curve = await ethers.getContractAt("BondingCurve", event.args.curve);
    const token = await ethers.getContractAt("LaunchToken", event.args.token);

    await curve.connect(bob).buy(0, bob.address, { value: ethers.parseEther("1") });
    const tokenBal = await token.balanceOf(bob.address);

    await token.connect(bob).approve(await curve.getAddress(), tokenBal);
    const before = await ethers.provider.getBalance(bob.address);
    const sellTx = await curve.connect(bob).sell(tokenBal, 0);
    const sellReceipt = await sellTx.wait();
    const gasCost = sellReceipt.gasUsed * sellReceipt.gasPrice;
    const after = await ethers.provider.getBalance(bob.address);

    expect(after + gasCost).to.be.gt(before); // got ETH back, net of fee + gas
    expect(await token.balanceOf(bob.address)).to.equal(0n);
  });

  it("graduates once the threshold is met and burns the LP", async function () {
    const { factory, alice, bob } = await deployAll();

    const tx = await factory.connect(alice).launch("Test Coin", "TEST", 0, meta);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const curve = await ethers.getContractAt("BondingCurve", event.args.curve);

    // Threshold is 10 ETH net-of-fee; buying in chunks pushes it over.
    for (let i = 0; i < 6; i++) {
      await curve.connect(bob).buy(0, bob.address, { value: ethers.parseEther("2") });
      if (await curve.graduated()) break;
    }

    expect(await curve.graduated()).to.equal(true);

    await expect(curve.connect(bob).buy(0, bob.address, { value: ethers.parseEther("1") }))
      .to.be.revertedWith("graduated: trade on the DEX pool now");
  });

  it("launchAndBuy: bundles a dev buy atomically with the launch, tokens land on the creator", async function () {
    const { factory, alice } = await deployAll();

    const tx = await factory.connect(alice).launchAndBuy("Dev Buy Coin", "DBC", 0, emptyMeta, 0, {
      value: ethers.parseEther("0.5"),
    });
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const token = await ethers.getContractAt("LaunchToken", event.args.token);

    expect(await token.balanceOf(alice.address)).to.be.gt(0n);
  });

  it("launchAndBuy: sending 0 ETH behaves exactly like a plain launch (no tokens bought)", async function () {
    const { factory, alice } = await deployAll();

    const tx = await factory.connect(alice).launchAndBuy("No Buy Coin", "NBC", 0, emptyMeta, 0, { value: 0 });
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    const token = await ethers.getContractAt("LaunchToken", event.args.token);

    expect(await token.balanceOf(alice.address)).to.equal(0n);
  });
});
