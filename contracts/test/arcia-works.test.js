const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const U = (n) => ethers.parseUnits(String(n), 6);
const H = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

describe("ArciaWorks", function () {
  let usdc, w, owner, fee, buyer, worker, other, arb;
  beforeEach(async () => {
    [owner, fee, buyer, worker, other, arb] = await ethers.getSigners();
    usdc = await (await ethers.getContractFactory("TestToken")).deploy("USD Coin", "USDC", 6);
    w = await (await ethers.getContractFactory("ArciaWorks")).deploy(await usdc.getAddress(), owner.address, fee.address, 200, arb.address);
    for (const s of [buyer, other]) { await usdc.mint(s.address, U(10_000)); await usdc.connect(s).approve(await w.getAddress(), ethers.MaxUint256); }
  });
  const deadline = async (h = 2) => BigInt(await time.latest()) + BigInt(h * 3600);

  it("registers once, updates, lists", async () => {
    await expect(w.connect(worker).register("relay-scribe", "https://x/listing")).to.emit(w, "Registered");
    await expect(w.connect(worker).register("again", "")).to.be.revertedWithCustomError(w, "AlreadyRegistered");
    await expect(w.connect(other).register("", "")).to.be.revertedWithCustomError(w, "BadInput");
    await w.connect(worker).update("scribe", "m", false);
    const a = await w.agent(worker.address);
    expect(a.name).to.eq("scribe"); expect(a.active).to.eq(false);
    expect(await w.agentCount()).to.eq(1n);
  });

  it("direct job: post → deliver → accept pays worker less 2%", async () => {
    await w.connect(worker).register("scribe", "");
    await expect(w.connect(buyer).post(worker.address, U(45), await deadline(), H("brief"))).to.emit(w, "Posted");
    expect(await usdc.balanceOf(await w.getAddress())).to.eq(U(45));
    await expect(w.connect(other).deliver(1, H("r"))).to.be.revertedWithCustomError(w, "NotAllowed");
    await w.connect(worker).deliver(1, H("result"));
    await expect(w.connect(other).accept(1)).to.be.revertedWithCustomError(w, "NotAllowed");
    await expect(w.connect(buyer).accept(1)).to.emit(w, "Paid");
    expect(await usdc.balanceOf(worker.address)).to.eq(U(44.1));
    expect(await usdc.balanceOf(fee.address)).to.eq(U(0.9));
    const a = await w.agent(worker.address);
    expect(a.done).to.eq(1); expect(a.earned).to.eq(U(44.1));
    expect((await w.job(1)).state).to.eq(4); // Settled
  });

  it("can't post to an unregistered / inactive worker or to yourself; bounds", async () => {
    await expect(w.connect(buyer).post(worker.address, U(1), await deadline(), H("b"))).to.be.revertedWithCustomError(w, "NotRegistered");
    await w.connect(buyer).register("me", "");
    await expect(w.connect(buyer).post(buyer.address, U(1), await deadline(), H("b"))).to.be.revertedWithCustomError(w, "NotAllowed");
    await expect(w.connect(buyer).post(ethers.ZeroAddress, 99_999n, await deadline(), H("b"))).to.be.revertedWithCustomError(w, "BadInput");
    await expect(w.connect(buyer).post(ethers.ZeroAddress, U(1), BigInt(await time.latest()) + 60n, H("b"))).to.be.revertedWithCustomError(w, "BadInput");
    await expect(w.connect(buyer).post(ethers.ZeroAddress, U(1), await deadline(24 * 61), H("b"))).to.be.revertedWithCustomError(w, "BadInput");
  });

  it("open job: taken by a registered worker, silence releases after 24h", async () => {
    await w.connect(buyer).post(ethers.ZeroAddress, U(10), await deadline(), H("b"));
    await expect(w.connect(worker).take(1)).to.be.revertedWithCustomError(w, "NotRegistered");
    await w.connect(worker).register("scribe", "");
    await expect(w.connect(worker).deliver(1, H("r"))).to.be.revertedWithCustomError(w, "BadState");
    await w.connect(worker).take(1);
    await expect(w.connect(other).take(1)).to.be.revertedWithCustomError(w, "BadState");
    await w.connect(worker).deliver(1, H("r"));
    await expect(w.connect(other).release(1)).to.be.revertedWithCustomError(w, "TooEarly");
    await time.increase(24 * 3600 + 5);
    await expect(w.connect(other).release(1)).to.emit(w, "Paid");
    expect(await usdc.balanceOf(worker.address)).to.eq(U(9.8));
  });

  it("cancel an open job; decline refunds at once; refund after the deadline", async () => {
    await w.connect(worker).register("scribe", "");
    const b0 = await usdc.balanceOf(buyer.address);
    await w.connect(buyer).post(ethers.ZeroAddress, U(5), await deadline(), H("b"));
    await expect(w.connect(other).cancel(1)).to.be.revertedWithCustomError(w, "NotAllowed");
    await w.connect(buyer).cancel(1);
    await w.connect(buyer).post(worker.address, U(5), await deadline(), H("b"));
    await w.connect(worker).decline(2);
    await w.connect(buyer).post(worker.address, U(5), await deadline(1), H("b"));
    await expect(w.connect(buyer).refund(3)).to.be.revertedWithCustomError(w, "TooEarly");
    await time.increase(3601);
    await expect(w.connect(worker).deliver(3, H("r"))).to.be.revertedWithCustomError(w, "TooLate");
    await w.connect(buyer).refund(3);
    expect(await usdc.balanceOf(buyer.address)).to.eq(b0);
    expect(await usdc.balanceOf(await w.getAddress())).to.eq(0n);
  });

  it("dispute → arbiter splits; stale dispute splits 50/50 without a fee", async () => {
    await w.connect(worker).register("scribe", "");
    await w.connect(buyer).post(worker.address, U(100), await deadline(), H("b"));
    await w.connect(worker).deliver(1, H("r"));
    await w.connect(buyer).dispute(1);
    expect((await w.agent(worker.address)).disputes).to.eq(1);
    await expect(w.connect(owner).resolve(1, 7000)).to.be.revertedWithCustomError(w, "NotAllowed");
    await w.connect(arb).resolve(1, 7000); // 70 → worker less 2% (1.4), 30 back
    expect(await usdc.balanceOf(worker.address)).to.eq(U(68.6));
    expect(await usdc.balanceOf(fee.address)).to.eq(U(1.4));

    await w.connect(buyer).post(worker.address, U(100), await deadline(), H("b"));
    await w.connect(worker).deliver(2, H("r"));
    await time.increase(25 * 3600);
    await expect(w.connect(buyer).dispute(2)).to.be.revertedWithCustomError(w, "TooLate");
    await w.connect(other).release(2);

    await w.connect(buyer).post(worker.address, U(100), await deadline(), H("b"));
    await w.connect(worker).deliver(3, H("r"));
    await w.connect(buyer).dispute(3);
    await expect(w.connect(worker).settleStale(3)).to.be.revertedWithCustomError(w, "TooEarly");
    await time.increase(14 * 86400 + 5);
    await expect(w.connect(other).settleStale(3)).to.be.revertedWithCustomError(w, "NotAllowed");
    const wb = await usdc.balanceOf(worker.address);
    await w.connect(worker).settleStale(3);
    expect((await usdc.balanceOf(worker.address)) - wb).to.eq(U(50));
    expect(await usdc.balanceOf(await w.getAddress())).to.eq(0n);
  });

  it("fee is fixed per job; pause stops only new jobs; owner limits", async () => {
    await w.connect(worker).register("scribe", "");
    await w.connect(buyer).post(worker.address, U(100), await deadline(), H("b"));
    await expect(w.connect(other).setFee(100, other.address)).to.be.revertedWithCustomError(w, "OwnableUnauthorizedAccount");
    await expect(w.setFee(501, fee.address)).to.be.revertedWithCustomError(w, "BadInput");
    await w.setFee(500, fee.address);
    await w.setPaused(true);
    await expect(w.connect(buyer).post(worker.address, U(1), await deadline(), H("b"))).to.be.revertedWithCustomError(w, "IsPaused");
    await w.connect(worker).deliver(1, H("r"));
    await w.connect(buyer).accept(1);
    expect(await usdc.balanceOf(fee.address)).to.eq(U(2)); // the 2% of when it was posted
  });
});
