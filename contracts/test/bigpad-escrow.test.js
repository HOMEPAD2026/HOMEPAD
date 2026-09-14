const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("BigPadEscrow", function () {
  async function deploy({ capEth = "10", durationSec = 3 * 24 * 60 * 60 } = {}) {
    const [deployer, recipient, alice, bob, stranger] = await ethers.getSigners();
    const deadline = (await time.latest()) + durationSec;

    const Escrow = await ethers.getContractFactory("BigPadEscrow");
    const escrow = await Escrow.deploy(recipient.address, ethers.parseEther(capEth), deadline);

    return { deployer, recipient, alice, bob, stranger, escrow, deadline };
  }

  it("accepts a contribution and tracks totals + per-address amounts", async function () {
    const { escrow, alice } = await deploy();

    await expect(escrow.connect(alice).contribute({ value: ethers.parseEther("1") }))
      .to.emit(escrow, "Contributed")
      .withArgs(alice.address, ethers.parseEther("1"), ethers.parseEther("1"));

    expect(await escrow.totalRaised()).to.equal(ethers.parseEther("1"));
    expect(await escrow.contributions(alice.address)).to.equal(ethers.parseEther("1"));
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(ethers.parseEther("1"));
  });

  it("accumulates multiple contributions from the same address", async function () {
    const { escrow, alice } = await deploy();
    await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
    await escrow.connect(alice).contribute({ value: ethers.parseEther("2") });
    expect(await escrow.contributions(alice.address)).to.equal(ethers.parseEther("3"));
  });

  it("rejects a zero-value contribution", async function () {
    const { escrow, alice } = await deploy();
    await expect(escrow.connect(alice).contribute({ value: 0 })).to.be.revertedWithCustomError(escrow, "ZeroContribution");
  });

  it("rejects a contribution that would exceed the cap", async function () {
    const { escrow, alice, bob } = await deploy({ capEth: "5" });
    await escrow.connect(alice).contribute({ value: ethers.parseEther("4") });
    await expect(escrow.connect(bob).contribute({ value: ethers.parseEther("2") })).to.be.revertedWithCustomError(escrow, "CapExceeded");
    // exactly filling the remaining room still works
    await expect(escrow.connect(bob).contribute({ value: ethers.parseEther("1") })).to.not.be.reverted;
    expect(await escrow.totalRaised()).to.equal(ethers.parseEther("5"));
    expect(await escrow.remainingCap()).to.equal(0n);
  });

  it("rejects contributions after the deadline", async function () {
    const { escrow, alice, deadline } = await deploy();
    await time.increaseTo(deadline + 1);
    await expect(escrow.connect(alice).contribute({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(escrow, "RaiseEnded");
  });

  it("reports isOpen() correctly across the raise lifecycle", async function () {
    const { escrow, alice, deadline } = await deploy({ capEth: "5" });
    expect(await escrow.isOpen()).to.equal(true);

    await escrow.connect(alice).contribute({ value: ethers.parseEther("5") }); // hits cap
    expect(await escrow.isOpen()).to.equal(false);

    await time.increaseTo(deadline + 1);
    expect(await escrow.isOpen()).to.equal(false);
  });

  it("blocks withdraw() before the deadline and before the cap is hit", async function () {
    const { escrow, recipient, alice } = await deploy({ capEth: "10" });
    await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
    await expect(escrow.connect(recipient).withdraw()).to.be.revertedWithCustomError(escrow, "RaiseStillOpen");
  });

  it("blocks anyone other than recipient from calling withdraw()", async function () {
    const { escrow, alice, stranger, deadline } = await deploy();
    await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
    await time.increaseTo(deadline + 1);
    await expect(escrow.connect(stranger).withdraw()).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
  });

  it("lets recipient withdraw the full balance once the deadline passes", async function () {
    const { escrow, recipient, alice, bob, deadline } = await deploy({ capEth: "10" });
    await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
    await escrow.connect(bob).contribute({ value: ethers.parseEther("2") });
    await time.increaseTo(deadline + 1);

    const before = await ethers.provider.getBalance(recipient.address);
    const tx = await escrow.connect(recipient).withdraw();
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(recipient.address);

    expect(after - before + gasCost).to.equal(ethers.parseEther("3"));
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
    expect(await escrow.withdrawn()).to.equal(true);
  });

  it("lets recipient withdraw early once the cap is reached, without waiting for the deadline", async function () {
    const { escrow, recipient, alice } = await deploy({ capEth: "1" });
    await escrow.connect(alice).contribute({ value: ethers.parseEther("1") }); // fills the cap exactly
    await expect(escrow.connect(recipient).withdraw()).to.not.be.reverted;
  });

  it("reverts a second withdraw() call", async function () {
    const { escrow, recipient, alice, deadline } = await deploy();
    await escrow.connect(alice).contribute({ value: ethers.parseEther("1") });
    await time.increaseTo(deadline + 1);
    await escrow.connect(recipient).withdraw();
    await expect(escrow.connect(recipient).withdraw()).to.be.revertedWithCustomError(escrow, "AlreadyWithdrawn");
  });

  it("reverts withdraw() if nothing was ever raised", async function () {
    const { escrow, recipient, deadline } = await deploy();
    await time.increaseTo(deadline + 1);
    await expect(escrow.connect(recipient).withdraw()).to.be.revertedWithCustomError(escrow, "NothingToWithdraw");
  });

  it("rejects a zero recipient, zero cap, or past deadline at construction", async function () {
    const [, recipient] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("BigPadEscrow");
    const future = (await time.latest()) + 1000;

    // Ownable's own base constructor runs before BigPadEscrow's require()s and
    // already refuses a zero-address owner, via its own custom error.
    await expect(Escrow.deploy(ethers.ZeroAddress, ethers.parseEther("1"), future)).to.be.revertedWithCustomError(Escrow, "OwnableInvalidOwner");
    await expect(Escrow.deploy(recipient.address, 0, future)).to.be.revertedWith("cap must be > 0");
    await expect(Escrow.deploy(recipient.address, ethers.parseEther("1"), (await time.latest()) - 1)).to.be.revertedWith("deadline must be in the future");
  });
});
