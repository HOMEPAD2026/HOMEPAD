// ArcircleStaking (veARCIRCLE): locks, decaying power, weekly USDC rewards, pool votes.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const WEEK = 7 * 86400, YEAR = 365 * 86400;
const E = (n) => ethers.parseEther(String(n)), U = (n) => ethers.parseUnits(String(n), 6);
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const jump = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };
const to = async (t) => { await network.provider.send("evm_setNextBlockTimestamp", [t]); await network.provider.send("evm_mine"); };
const wk = (t) => Math.floor(t / WEEK) * WEEK;

describe("ArcircleStaking", function () {
  let st, arc, usdc, a, b, c, fund;
  beforeEach(async () => {
    [, a, b, c, fund] = await ethers.getSigners();
    const T = await ethers.getContractFactory("TestToken");
    arc = await T.deploy("ARCIRCLE", "ARCIRCLE", 18);
    usdc = await T.deploy("USD Coin", "USDC", 6);
    // start just after a week boundary so the math below is easy to follow
    await to(wk(await now()) + WEEK + 10);
    st = await (await ethers.getContractFactory("ArcircleStaking")).deploy(await arc.getAddress(), await usdc.getAddress());
    for (const w of [a, b, c]) { await arc.mint(w.address, E(1_000_000)); await arc.connect(w).approve(await st.getAddress(), ethers.MaxUint256); }
    await usdc.mint(fund.address, U(100_000)); await usdc.connect(fund).approve(await st.getAddress(), ethers.MaxUint256);
  });

  it("locks: bounds, one per wallet, decaying power, no early exit", async () => {
    const t = await now();
    await expect(st.connect(a).createLock(E(100), t + YEAR + WEEK * 2)).to.be.revertedWithCustomError(st, "BadUnlock");
    await expect(st.connect(a).createLock(E(100), t + 60)).to.be.revertedWithCustomError(st, "BadUnlock"); // rounds into the past
    await expect(st.connect(a).createLock(0, t + 10 * WEEK)).to.be.revertedWithCustomError(st, "ZeroAmount");
    await st.connect(a).createLock(E(1000), t + 52 * WEEK);
    await expect(st.connect(a).createLock(E(1), t + 10 * WEEK)).to.be.revertedWithCustomError(st, "LockExists");
    const l = await st.locked(a.address);
    expect(Number(l.end) % WEEK).to.equal(0);
    const p0 = await st.balanceOf(a.address);
    const expected = (E(1000) / BigInt(YEAR)) * BigInt(Number(l.end) - (await now()));
    expect(p0).to.equal(expected);
    await jump(10 * WEEK);
    const p1 = await st.balanceOf(a.address);
    expect(p1 < p0).to.equal(true);
    await expect(st.connect(a).withdraw()).to.be.revertedWithCustomError(st, "LockNotOver");
    await to(Number(l.end) + 1);
    expect(await st.balanceOf(a.address)).to.equal(0n);
    const before = await arc.balanceOf(a.address);
    await st.connect(a).withdraw();
    expect((await arc.balanceOf(a.address)) - before).to.equal(E(1000));
    expect(await st.totalLocked()).to.equal(0n);
  });

  it("total supply always equals the sum of balances", async () => {
    const t = await now();
    await st.connect(a).createLock(E(1000), t + 52 * WEEK);
    await jump(3 * WEEK + 1234);
    await st.connect(b).createLock(E(500), t + 20 * WEEK);
    await jump(WEEK);
    await st.connect(a).increaseAmount(E(250));
    await st.connect(c).createLock(E(2000), t + 8 * WEEK);
    await jump(2 * WEEK + 99);
    await st.connect(b).increaseUnlockTime((await now()) + 40 * WEEK);
    for (let k = 0; k < 12; k++) {
      const sum = (await st.balanceOf(a.address)) + (await st.balanceOf(b.address)) + (await st.balanceOf(c.address));
      const tot = await st.totalSupply();
      const diff = sum > tot ? sum - tot : tot - sum;
      expect(diff <= 10n ** 6n).to.equal(true, `week ${k}: ${sum} vs ${tot}`);
      // the past too: a week boundary
      const w = wk(await now());
      const s2 = (await st.balanceOfAt(a.address, w)) + (await st.balanceOfAt(b.address, w)) + (await st.balanceOfAt(c.address, w));
      const t2 = await st.totalSupplyAt(w);
      expect((s2 > t2 ? s2 - t2 : t2 - s2) <= 10n ** 6n).to.equal(true);
      await jump(5 * WEEK);
    }
  });

  it("extending: only later, at most a year out", async () => {
    const t = await now();
    await st.connect(a).createLock(E(100), t + 10 * WEEK);
    await expect(st.connect(a).increaseUnlockTime(t + 5 * WEEK)).to.be.revertedWithCustomError(st, "NotLonger");
    await expect(st.connect(a).increaseUnlockTime(t + 60 * WEEK)).to.be.revertedWithCustomError(st, "BadUnlock");
    const p0 = await st.balanceOf(a.address);
    await st.connect(a).increaseUnlockTime(t + 50 * WEEK);
    expect((await st.balanceOf(a.address)) > p0 * 4n).to.equal(true);
    await expect(st.connect(b).increaseAmount(E(1))).to.be.revertedWithCustomError(st, "NoLock");
  });

  it("rewards: funded weeks paid pro rata to veARCIRCLE at the week's start", async () => {
    await expect(st.connect(fund).fund(U(100))).to.be.revertedWithCustomError(st, "NoStakers");
    const t = await now();
    await st.connect(a).createLock(E(3000), t + 52 * WEEK);
    await st.connect(b).createLock(E(1000), t + 52 * WEEK);
    await expect(st.connect(fund).fund(U(100))).to.be.revertedWithCustomError(st, "NoStakers"); // nobody held at this week's start
    await to(wk(await now()) + WEEK + 5); // week 1
    await st.connect(c).createLock(E(5000), (await now()) + 52 * WEEK); // mid-week: not in this week
    await st.connect(fund).fund(U(1000));
    let [ca] = await st.claimable(a.address);
    expect(ca).to.equal(0n); // the week isn't over
    await to(wk(await now()) + WEEK + 5); // week 2
    [ca] = await st.claimable(a.address);
    const [cb] = await st.claimable(b.address), [cc] = await st.claimable(c.address);
    expect(cc).to.equal(0n);
    expect(ca + cb <= U(1000) && ca + cb >= U(1000) - 10n).to.equal(true);
    expect(Number(ca) / Number(cb)).to.be.closeTo(3, 0.001);
    const before = await usdc.balanceOf(a.address);
    await st.connect(a).claim();
    expect((await usdc.balanceOf(a.address)) - before).to.equal(ca);
    expect((await st.claimable(a.address))[0]).to.equal(0n);
    // week 2 funded: c is in now
    await st.connect(fund).fund(U(900));
    await st.connect(fund).fund(U(100));
    await to(wk(await now()) + WEEK + 5);
    const [c2] = await st.claimable(c.address);
    const s = await st.weekSupply(wk(await now()) - WEEK);
    const share = (U(1000) * (await st.balanceOfAt(c.address, wk(await now()) - WEEK))) / s;
    expect(c2).to.equal(share);
    await st.connect(b).claim(); await st.connect(c).claim(); await st.connect(a).claim();
    expect((await st.totalClaimed()) <= (await st.totalFunded())).to.equal(true);
    expect((await usdc.balanceOf(await st.getAddress())) < 100n).to.equal(true); // dust only
  });

  it("claims keep working after the lock is withdrawn", async () => {
    const t = await now();
    await st.connect(a).createLock(E(100), t + 3 * WEEK);
    await to(wk(await now()) + WEEK + 5);
    await st.connect(fund).fund(U(50));
    await to(wk(await now()) + 3 * WEEK);
    await st.connect(a).withdraw();
    const [ca] = await st.claimable(a.address);
    expect(ca >= U(50) - 2n).to.equal(true);
    await st.connect(a).claim();
  });

  it("pool votes: split, revote replaces, limits", async () => {
    const P1 = ethers.id("pool-1"), P2 = ethers.id("pool-2");
    await expect(st.connect(a).vote([P1], [10000])).to.be.revertedWithCustomError(st, "NoLock");
    await st.connect(a).createLock(E(1000), (await now()) + 52 * WEEK);
    await st.connect(b).createLock(E(1000), (await now()) + 26 * WEEK);
    const w = await st.currentWeek();
    await st.connect(a).vote([P1, P2], [6000, 4000]);
    const pa = await st.balanceOf(a.address);
    expect(await st.poolVotes(w, P1)).to.be.closeTo((pa * 6000n) / 10000n, 10n ** 14n);
    await st.connect(a).vote([P2], [10000]);
    expect(await st.poolVotes(w, P1)).to.equal(0n);
    expect(await st.poolVotes(w, P2)).to.be.closeTo(await st.balanceOf(a.address), 10n ** 14n);
    await st.connect(b).vote([P1], [5000]);
    expect(await st.weekVotes(w)).to.equal((await st.poolVotes(w, P1)) + (await st.poolVotes(w, P2)));
    await expect(st.connect(b).vote([P1, P1], [100, 100])).to.be.revertedWithCustomError(st, "BadVote");
    await expect(st.connect(b).vote([P1, P2], [6000, 6000])).to.be.revertedWithCustomError(st, "BadVote");
    expect((await st.votedPools(w, a.address)).length).to.equal(1);
    await to(Number(w) + WEEK + 1);
    expect(await st.poolVotes(await st.currentWeek(), P2)).to.equal(0n); // a fresh week
  });
});
