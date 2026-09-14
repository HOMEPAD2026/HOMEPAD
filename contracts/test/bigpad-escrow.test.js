const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("BigPadEscrow", function () {
  async function deploy({ capEth = "0" } = {}) {
    const [deployer, recipient, platform, treasury, alice, bob, stranger] = await ethers.getSigners();

    const Escrow = await ethers.getContractFactory("BigPadEscrow");
    const escrow = await Escrow.deploy(recipient.address, platform.address, treasury.address, ethers.parseEther(capEth));

    return { deployer, recipient, platform, treasury, alice, bob, stranger, escrow };
  }

  async function deployAndStart(opts) {
    const ctx = await deploy(opts);
    await ctx.escrow.connect(ctx.recipient).start();
    const deadline = Number(await ctx.escrow.deadline());
    return { ...ctx, deadline };
  }

  describe("construction", function () {
    it("rejects a zero recipient, platform wallet, or treasury wallet", async function () {
      const [, recipient, platform, treasury] = await ethers.getSigners();
      const Escrow = await ethers.getContractFactory("BigPadEscrow");
      await expect(Escrow.deploy(ethers.ZeroAddress, platform.address, treasury.address, 0)).to.be.revertedWithCustomError(Escrow, "OwnableInvalidOwner");
      await expect(Escrow.deploy(recipient.address, ethers.ZeroAddress, treasury.address, 0)).to.be.revertedWith("platform wallet is zero address");
      await expect(Escrow.deploy(recipient.address, platform.address, ethers.ZeroAddress, 0)).to.be.revertedWith("treasury wallet is zero address");
    });

    it("does not start automatically — isOpen() is false and contribute() reverts before start()", async function () {
      const { escrow, alice } = await deploy();
      expect(await escrow.started()).to.equal(false);
      expect(await escrow.isOpen()).to.equal(false);
      await expect(escrow.connect(alice).contribute({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(escrow, "NotStarted");
    });
  });

  describe("start()", function () {
    it("only the recipient wallet can start it", async function () {
      const { escrow, stranger } = await deploy();
      await expect(escrow.connect(stranger).start()).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });

    it("sets a deadline exactly 72 hours out and flips isOpen() to true", async function () {
      const { escrow, recipient } = await deploy();
      const before = await time.latest();
      await escrow.connect(recipient).start();
      const deadline = await escrow.deadline();
      expect(Number(deadline) - before).to.be.closeTo(72 * 60 * 60, 5);
      expect(await escrow.isOpen()).to.equal(true);
    });

    it("cannot be started twice", async function () {
      const { escrow, recipient } = await deploy();
      await escrow.connect(recipient).start();
      await expect(escrow.connect(recipient).start()).to.be.revertedWithCustomError(escrow, "AlreadyStarted");
    });
  });

  describe("contribute()", function () {
    it("accepts ETH once started and tracks totals + per-address amounts", async function () {
      const { escrow, alice } = await deployAndStart();
      await expect(escrow.connect(alice).contribute({ value: ethers.parseEther("1") }))
        .to.emit(escrow, "Contributed").withArgs(alice.address, ethers.parseEther("1"), ethers.parseEther("1"));
      expect(await escrow.contributions(alice.address)).to.equal(ethers.parseEther("1"));
    });

    it("rejects a zero-value contribution", async function () {
      const { escrow, alice } = await deployAndStart();
      await expect(escrow.connect(alice).contribute({ value: 0 })).to.be.revertedWithCustomError(escrow, "ZeroContribution");
    });

    it("rejects a contribution that would exceed a set cap", async function () {
      const { escrow, alice, bob } = await deployAndStart({ capEth: "5" });
      await escrow.connect(alice).contribute({ value: ethers.parseEther("4") });
      await expect(escrow.connect(bob).contribute({ value: ethers.parseEther("2") })).to.be.revertedWithCustomError(escrow, "CapExceeded");
    });

    it("rejects contributions after the deadline", async function () {
      const { escrow, alice, deadline } = await deployAndStart();
      await time.increaseTo(deadline + 1);
      await expect(escrow.connect(alice).contribute({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(escrow, "RaiseEnded");
    });
  });

  describe("refund()", function () {
    it("lets a contributor pull back their full contribution any time while open", async function () {
      const { escrow, alice } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("2") });

      const before = await ethers.provider.getBalance(alice.address);
      const tx = await escrow.connect(alice).refund(ethers.parseEther("2"));
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(alice.address);

      expect(after - before + gasCost).to.equal(ethers.parseEther("2"));
      expect(await escrow.contributions(alice.address)).to.equal(0n);
      expect(await escrow.totalRaised()).to.equal(0n);
    });

    it("supports a partial refund, leaving the rest in place", async function () {
      const { escrow, alice } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("3") });
      await escrow.connect(alice).refund(ethers.parseEther("1"));
      expect(await escrow.contributions(alice.address)).to.equal(ethers.parseEther("2"));
      expect(await escrow.totalRaised()).to.equal(ethers.parseEther("2"));
    });

    it("reverts on a zero-amount refund request", async function () {
      const { escrow, alice } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
      await expect(escrow.connect(alice).refund(0)).to.be.revertedWithCustomError(escrow, "ZeroRefundAmount");
    });

    it("reverts if requesting more than the caller actually contributed", async function () {
      const { escrow, alice } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
      await expect(escrow.connect(alice).refund(ethers.parseEther("2"))).to.be.revertedWithCustomError(escrow, "InsufficientContribution");
    });

    it("cannot be used to drain someone else's contribution", async function () {
      const { escrow, alice, bob } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
      await expect(escrow.connect(bob).refund(ethers.parseEther("1"))).to.be.revertedWithCustomError(escrow, "InsufficientContribution");
    });

    it("reverts once the deadline has passed", async function () {
      const { escrow, alice, deadline } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
      await time.increaseTo(deadline + 1);
      await expect(escrow.connect(alice).refund(ethers.parseEther("1"))).to.be.revertedWithCustomError(escrow, "RaiseEnded");
    });
  });

  describe("withdraw() — recipient's 80/5/15 split", function () {
    it("blocks the recipient from withdrawing before start()", async function () {
      const { escrow, recipient } = await deploy();
      await expect(escrow.connect(recipient).withdraw()).to.be.revertedWithCustomError(escrow, "RaiseStillOpen");
    });

    it("blocks the recipient from withdrawing while the window is still open, no matter the amount raised", async function () {
      const { escrow, recipient, alice } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("50") });
      await expect(escrow.connect(recipient).withdraw()).to.be.revertedWithCustomError(escrow, "RaiseStillOpen");
    });

    it("blocks anyone other than recipient from calling withdraw()", async function () {
      const { escrow, stranger, deadline } = await deployAndStart();
      await time.increaseTo(deadline + 1);
      await expect(escrow.connect(stranger).withdraw()).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });

    it("splits the final balance 80/5/15 between recipient/platform/treasury once the deadline passes", async function () {
      const { escrow, recipient, platform, treasury, alice, bob, deadline } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("6") });
      await escrow.connect(bob).contribute({ value: ethers.parseEther("4") });
      // total 10 ETH -> 8 / 0.5 / 1.5
      await time.increaseTo(deadline + 1);

      const balBefore = {
        recipient: await ethers.provider.getBalance(recipient.address),
        platform: await ethers.provider.getBalance(platform.address),
        treasury: await ethers.provider.getBalance(treasury.address),
      };
      const tx = await escrow.connect(recipient).withdraw();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balAfter = {
        recipient: await ethers.provider.getBalance(recipient.address),
        platform: await ethers.provider.getBalance(platform.address),
        treasury: await ethers.provider.getBalance(treasury.address),
      };

      expect(balAfter.recipient - balBefore.recipient + gasCost).to.equal(ethers.parseEther("8"));
      expect(balAfter.platform - balBefore.platform).to.equal(ethers.parseEther("0.5"));
      expect(balAfter.treasury - balBefore.treasury).to.equal(ethers.parseEther("1.5"));
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
    });

    it("reverts a second withdraw() call", async function () {
      const { escrow, recipient, alice, deadline } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
      await time.increaseTo(deadline + 1);
      await escrow.connect(recipient).withdraw();
      await expect(escrow.connect(recipient).withdraw()).to.be.revertedWithCustomError(escrow, "AlreadyDistributed");
    });

    it("reverts withdraw() if nothing was ever raised (or everyone refunded)", async function () {
      const { escrow, recipient, deadline } = await deployAndStart();
      await time.increaseTo(deadline + 1);
      await expect(escrow.connect(recipient).withdraw()).to.be.revertedWithCustomError(escrow, "NothingToDistribute");
    });

    it("distributes correctly even after some contributors refunded first", async function () {
      const { escrow, recipient, platform, treasury, alice, bob, deadline } = await deployAndStart();
      await escrow.connect(alice).contribute({ value: ethers.parseEther("6") });
      await escrow.connect(bob).contribute({ value: ethers.parseEther("4") });
      await escrow.connect(alice).refund(ethers.parseEther("6")); // alice backs out entirely
      // only bob's 4 ETH remains -> 3.2 / 0.2 / 0.6
      await time.increaseTo(deadline + 1);

      const balBefore = await ethers.provider.getBalance(platform.address);
      await escrow.connect(recipient).withdraw();
      const balAfter = await ethers.provider.getBalance(platform.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("0.2"));
    });
  });

  describe("uncapped vs capped raises", function () {
    it("reports remainingCap() as max uint when uncapped", async function () {
      const { escrow, alice } = await deployAndStart({ capEth: "0" });
      await escrow.connect(alice).contribute({ value: ethers.parseEther("100") });
      expect(await escrow.remainingCap()).to.equal(ethers.MaxUint256);
    });

    it("isOpen() goes false once a set cap is reached, even before the deadline", async function () {
      const { escrow, alice } = await deployAndStart({ capEth: "1" });
      await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
      expect(await escrow.isOpen()).to.equal(false);
    });
  });
});
