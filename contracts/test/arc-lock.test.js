const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ArcLock", function () {
  const DAY = 86400;
  async function deploy() {
    const [deployer, creator, other] = await ethers.getSigners();
    const Tok = await ethers.getContractFactory("MockTaxToken");
    const token = await Tok.deploy("Coin", "COIN", 0);
    const taxed = await Tok.deploy("Taxed", "TAX", 100); // 1% burned per transfer
    await token.mint(creator.address, ethers.parseEther("1000"));
    await taxed.mint(creator.address, ethers.parseEther("1000"));
    const Lock = await ethers.getContractFactory("ArcLock");
    const lock = await Lock.deploy();
    return { deployer, creator, other, token, taxed, lock };
  }
  const after = async (days) => (await time.latest()) + days * DAY;

  it("locks, reports, and refuses early withdrawal", async function () {
    const { creator, other, token, lock } = await deploy();
    await token.connect(creator).approve(lock.target, ethers.parseEther("100"));
    const until = await after(30);
    await expect(lock.connect(creator).lock(token.target, ethers.parseEther("100"), until))
      .to.emit(lock, "Locked").withArgs(0, token.target, creator.address, ethers.parseEther("100"), until);
    const [ids, recs] = await lock.locksOfToken(token.target);
    expect(ids.map(Number)).to.deep.equal([0]);
    expect(recs[0].owner).to.equal(creator.address);
    const [total, first] = await lock.activeLockedBy(token.target, creator.address);
    expect(total).to.equal(ethers.parseEther("100"));
    expect(first).to.equal(until);
    await expect(lock.connect(creator).withdraw(0)).to.be.revertedWithCustomError(lock, "StillLocked");
    await expect(lock.connect(other).withdraw(0)).to.be.revertedWithCustomError(lock, "NotOwner");
  });

  it("releases only to the owner after the unlock time, once", async function () {
    const { creator, other, token, lock } = await deploy();
    await token.connect(creator).approve(lock.target, ethers.parseEther("10"));
    const until = await after(7);
    await lock.connect(creator).lock(token.target, ethers.parseEther("10"), until);
    await time.increaseTo(until);
    await expect(lock.connect(other).withdraw(0)).to.be.revertedWithCustomError(lock, "NotOwner");
    const before = await token.balanceOf(creator.address);
    await expect(lock.connect(creator).withdraw(0)).to.emit(lock, "Withdrawn").withArgs(0, creator.address, ethers.parseEther("10"));
    expect(await token.balanceOf(creator.address)).to.equal(before + ethers.parseEther("10"));
    await expect(lock.connect(creator).withdraw(0)).to.be.revertedWithCustomError(lock, "AlreadyWithdrawn");
    const [total] = await lock.activeLockedBy(token.target, creator.address);
    expect(total).to.equal(0n);
  });

  it("can extend but never shorten", async function () {
    const { creator, other, token, lock } = await deploy();
    await token.connect(creator).approve(lock.target, 1000n);
    const until = await after(10);
    await lock.connect(creator).lock(token.target, 1000n, until);
    await expect(lock.connect(creator).extend(0, until - 1)).to.be.revertedWithCustomError(lock, "BadUnlockTime");
    await expect(lock.connect(other).extend(0, until + DAY)).to.be.revertedWithCustomError(lock, "NotOwner");
    await expect(lock.connect(creator).extend(0, until + DAY)).to.emit(lock, "Extended").withArgs(0, until + DAY);
    expect((await lock.getLock(0)).unlockAt).to.equal(until + DAY);
  });

  it("rejects zero amounts and unlock times outside 1 day … 10 years", async function () {
    const { creator, token, lock } = await deploy();
    await token.connect(creator).approve(lock.target, 1000n);
    await expect(lock.connect(creator).lock(token.target, 0, await after(30))).to.be.revertedWithCustomError(lock, "ZeroAmount");
    await expect(lock.connect(creator).lock(token.target, 1000n, (await time.latest()) + 3600)).to.be.revertedWithCustomError(lock, "BadUnlockTime");
    await expect(lock.connect(creator).lock(token.target, 1000n, await after(3651))).to.be.revertedWithCustomError(lock, "BadUnlockTime");
  });

  it("records what actually arrived for taxed tokens", async function () {
    const { creator, taxed, lock } = await deploy();
    await taxed.connect(creator).approve(lock.target, ethers.parseEther("100"));
    await lock.connect(creator).lock(taxed.target, ethers.parseEther("100"), await after(30));
    const rec = await lock.getLock(0);
    expect(rec.amount).to.equal(ethers.parseEther("99"));
    expect(await taxed.balanceOf(lock.target)).to.equal(ethers.parseEther("99"));
  });

  it("keeps separate owners and tokens apart", async function () {
    const { creator, other, token, lock } = await deploy();
    await token.mint(other.address, 500n);
    await token.connect(creator).approve(lock.target, 300n);
    await token.connect(other).approve(lock.target, 500n);
    await lock.connect(creator).lock(token.target, 300n, await after(30));
    await lock.connect(other).lock(token.target, 500n, await after(60));
    expect((await lock.activeLockedBy(token.target, creator.address))[0]).to.equal(300n);
    expect((await lock.activeLockedBy(token.target, other.address))[0]).to.equal(500n);
    expect((await lock.lockIdsOfOwner(other.address)).map(Number)).to.deep.equal([1]);
    await expect(lock.getLock(9)).to.be.revertedWithCustomError(lock, "UnknownLock");
  });
});
