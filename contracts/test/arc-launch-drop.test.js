// ArcLaunchDrop: ArcPad coins' 4% → veARCIRCLE holders, pro rata at the start of the launch week.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const WEEK = 7 * 86400, YEAR = 365 * 86400;
const E = (n) => ethers.parseEther(String(n));
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const to = async (t) => { await network.provider.send("evm_setNextBlockTimestamp", [t]); await network.provider.send("evm_mine"); };
const wk = (t) => Math.floor(t / WEEK) * WEEK;

describe("ArcLaunchDrop", function () {
  let st, arc, usdc, f, f2, drop, treas, a, b, c, d, bot, W0;

  async function coin(name, at, fac = f) {
    const t = await (await ethers.getContractFactory("DropCoin")).connect(treas).deploy(name);
    await fac.add(await t.getAddress(), at);
    await t.connect(treas).approve(await drop.getAddress(), ethers.MaxUint256);
    return t;
  }

  beforeEach(async () => {
    [, treas, a, b, c, d, bot] = await ethers.getSigners();
    const T = await ethers.getContractFactory("TestToken");
    arc = await T.deploy("ARCIRCLE", "ARCIRCLE", 18);
    usdc = await T.deploy("USD Coin", "USDC", 6);
    await to(wk(await now()) + WEEK + 10);
    st = await (await ethers.getContractFactory("ArcircleStaking")).deploy(await arc.getAddress(), await usdc.getAddress());
    for (const w of [a, b, c, d]) { await arc.mint(w.address, E(1_000_000)); await arc.connect(w).approve(await st.getAddress(), ethers.MaxUint256); }
    const MF = await ethers.getContractFactory("MockLaunchFactory");
    f = await MF.deploy(); f2 = await MF.deploy();
    W0 = wk(await now()) + WEEK; // Launch Drop starts next week
    drop = await (await ethers.getContractFactory("ArcLaunchDrop")).deploy(await st.getAddress(), [await f.getAddress(), await f2.getAddress()], W0);
  });

  it("constructor checks", async () => {
    const D = await ethers.getContractFactory("ArcLaunchDrop");
    await expect(D.deploy(ethers.ZeroAddress, [await f.getAddress()], W0)).to.be.revertedWith("staking");
    await expect(D.deploy(await st.getAddress(), [], W0)).to.be.revertedWith("factories");
    await expect(D.deploy(await st.getAddress(), [await f.getAddress()], W0 + 1)).to.be.revertedWith("week");
    await expect(D.deploy(await st.getAddress(), [ethers.ZeroAddress], W0)).to.be.revertedWith("factory");
    expect(await drop.factories()).to.deep.equal([await f.getAddress(), await f2.getAddress()]);
  });

  it("pro rata at the start of the launch week; later locks get nothing; max locks count in full", async () => {
    const t = await now();
    await st.connect(a).createLock(E(1000), t + 52 * WEEK);
    await st.connect(b).createMaxLock(E(500));
    await to(W0 + 3 * 86400);             // mid-week: the snapshot is W0, not now
    await st.connect(c).createMaxLock(E(100_000)); // after the week began → not in this coin's drop
    const x = await coin("X", await now());
    await drop.connect(treas).deposit(await x.getAddress(), E(40_000_000));

    const sA = await st.balanceOfAt(a.address, W0), sB = await st.balanceOfAt(b.address, W0);
    expect(sB).to.equal(E(500));
    const sup = await st.totalSupplyAt(W0);
    expect(sup).to.equal(sA + sB);
    const dr = await drop.drops(await x.getAddress());
    expect(dr.week).to.equal(BigInt(W0));
    expect(dr.supply).to.equal(sup);

    const ca = await drop.claimable(await x.getAddress(), a.address);
    const cb = await drop.claimable(await x.getAddress(), b.address);
    expect(ca).to.equal((E(40_000_000) * sA) / sup);
    expect(cb).to.equal((E(40_000_000) * sB) / sup);
    expect(await drop.claimable(await x.getAddress(), c.address)).to.equal(0n);

    await expect(drop.connect(a).claim([await x.getAddress()]))
      .to.emit(drop, "Claimed").withArgs(await x.getAddress(), a.address, ca, a.address);
    expect(await x.balanceOf(a.address)).to.equal(ca);
    expect(await drop.claimable(await x.getAddress(), a.address)).to.equal(0n);
    await drop.connect(a).claim([await x.getAddress()]); // second claim: nothing more
    expect(await x.balanceOf(a.address)).to.equal(ca);
    await drop.connect(c).claim([await x.getAddress()]);
    expect(await x.balanceOf(c.address)).to.equal(0n);
  });

  it("the snapshot never moves: decay, new locks, withdrawals after it change nothing", async () => {
    const t = await now();
    await st.connect(a).createLock(E(1000), t + 3 * WEEK);
    await st.connect(b).createLock(E(1000), t + 50 * WEEK);
    await to(W0 + 100);
    const x = await coin("X", await now());
    await drop.connect(treas).deposit(await x.getAddress(), E(1_000_000));
    const ca = await drop.claimable(await x.getAddress(), a.address);
    const cb = await drop.claimable(await x.getAddress(), b.address);
    expect(ca > 0n && cb > ca).to.equal(true); // b's lock is longer → more veARCIRCLE
    // a's lock ends and is withdrawn; c locks big — a's share for X stays the same
    await to(t + 4 * WEEK);
    await st.connect(a).withdraw();
    await st.connect(c).createMaxLock(E(900_000));
    expect(await drop.claimable(await x.getAddress(), a.address)).to.equal(ca);
    expect(await drop.claimable(await x.getAddress(), b.address)).to.equal(cb);
    expect(await drop.claimable(await x.getAddress(), c.address)).to.equal(0n);
  });

  it("each coin snapshots its own launch week", async () => {
    await st.connect(a).createMaxLock(E(100));
    await to(W0 + 10);
    const x = await coin("X", await now());
    await st.connect(b).createMaxLock(E(300)); // mid week 1
    await to(W0 + WEEK + 10);
    const y = await coin("Y", await now());
    await drop.connect(treas).deposit(await x.getAddress(), E(1000));
    await drop.connect(treas).deposit(await y.getAddress(), E(1000));
    expect(await drop.claimable(await x.getAddress(), a.address)).to.equal(E(1000));
    expect(await drop.claimable(await x.getAddress(), b.address)).to.equal(0n);
    expect(await drop.claimable(await y.getAddress(), a.address)).to.equal(E(250));
    expect(await drop.claimable(await y.getAddress(), b.address)).to.equal(E(750));
    // one call claims both
    await drop.connect(a).claim([await x.getAddress(), await y.getAddress()]);
    expect(await x.balanceOf(a.address)).to.equal(E(1000));
    expect(await y.balanceOf(a.address)).to.equal(E(250));
    expect(await drop.dropCount()).to.equal(2n);
    const [list, info, cl] = await drop.page(b.address, 0, 10);
    expect(list).to.deep.equal([await x.getAddress(), await y.getAddress()]);
    expect(info[1].amount).to.equal(E(1000));
    expect(cl.map(String)).to.deep.equal(["0", E(750).toString()]);
    const [l2] = await drop.page(ethers.ZeroAddress, 1, 10);
    expect(l2).to.deep.equal([await y.getAddress()]);
    const [l3] = await drop.page(ethers.ZeroAddress, 5, 10);
    expect(l3.length).to.equal(0);
  });

  it("top-ups after claims pay the difference; totals never exceed the deposit", async () => {
    await st.connect(a).createMaxLock(E(1));
    await st.connect(b).createMaxLock(E(2));
    await to(W0 + 10);
    const x = await coin("X", await now());
    const X = await x.getAddress();
    await drop.connect(treas).deposit(X, E(30));
    await drop.connect(a).claim([X]);
    expect(await x.balanceOf(a.address)).to.equal(E(10));
    await drop.connect(treas).deposit(X, E(60));
    expect(await drop.claimable(X, a.address)).to.equal(E(20));
    expect(await drop.claimable(X, b.address)).to.equal(E(60));
    await drop.claimFor(a.address, [X]);
    await drop.claimFor(b.address, [X]);
    expect(await x.balanceOf(a.address)).to.equal(E(30));
    expect(await x.balanceOf(b.address)).to.equal(E(60));
    const dr = await drop.drops(X);
    expect(dr.claimed).to.equal(dr.amount);
    expect(await x.balanceOf(await drop.getAddress())).to.equal(0n);
  });

  it("rounding dust stays in the vault; three-way split never overpays", async () => {
    for (const w of [a, b, c]) await st.connect(w).createMaxLock(E(1));
    await to(W0 + 10);
    const x = await coin("X", await now());
    const X = await x.getAddress();
    await drop.connect(treas).deposit(X, 100n);
    await drop.pushTo(X, [a.address, b.address, c.address]);
    for (const w of [a, b, c]) expect(await x.balanceOf(w.address)).to.equal(33n);
    expect(await x.balanceOf(await drop.getAddress())).to.equal(1n);
  });

  it("anyone can push; tokens only go to the holder; zero and repeat holders are skipped", async () => {
    await st.connect(a).createMaxLock(E(1));
    await st.connect(b).createMaxLock(E(1));
    await to(W0 + 10);
    const x = await coin("X", await now());
    const X = await x.getAddress();
    await drop.connect(treas).deposit(X, E(10));
    await expect(drop.connect(bot).pushTo(X, [a.address, ethers.ZeroAddress, a.address, b.address, d.address]))
      .to.emit(drop, "Claimed").withArgs(X, a.address, E(5), bot.address);
    expect(await x.balanceOf(a.address)).to.equal(E(5));
    expect(await x.balanceOf(b.address)).to.equal(E(5));
    expect(await x.balanceOf(bot.address)).to.equal(0n);
    expect(await x.balanceOf(d.address)).to.equal(0n);
    await drop.connect(bot).claimFor(a.address, [X]);
    expect(await x.balanceOf(a.address)).to.equal(E(5));
  });

  it("only ArcPad coins launched from startWeek on; no stakers → no drop", async () => {
    await to(W0 - 100);
    const early = await coin("EARLY", await now());
    await to(W0 + 10);
    // nobody staked yet at W0
    const empty = await coin("EMPTY", await now());
    await expect(drop.connect(treas).deposit(await empty.getAddress(), E(1))).to.be.revertedWith("no veARCIRCLE at snapshot");
    await expect(drop.connect(treas).deposit(await early.getAddress(), E(1))).to.be.revertedWith("launched before Launch Drop");
    const stray = await (await ethers.getContractFactory("DropCoin")).connect(treas).deploy("STRAY");
    await stray.connect(treas).approve(await drop.getAddress(), ethers.MaxUint256);
    await expect(drop.connect(treas).deposit(await stray.getAddress(), E(1))).to.be.revertedWith("not an ArcPad coin");
    await expect(drop.connect(treas).deposit(await stray.getAddress(), 0)).to.be.revertedWith("amount");
    expect(await drop.launchedAt(await stray.getAddress())).to.equal(0n);
    // coins from the second factory work too
    await st.connect(a).createMaxLock(E(1));
    await to(W0 + WEEK + 10);
    const z = await coin("Z", await now(), f2);
    await drop.connect(treas).deposit(await z.getAddress(), E(7));
    expect(await drop.claimable(await z.getAddress(), a.address)).to.equal(E(7));
  });

  it("sync counts tokens sent straight to the vault", async () => {
    await st.connect(a).createMaxLock(E(1));
    await st.connect(b).createMaxLock(E(3));
    await to(W0 + 10);
    const x = await coin("X", await now());
    const X = await x.getAddress();
    await x.connect(treas).transfer(await drop.getAddress(), E(40));
    await expect(drop.connect(bot).sync(X)).to.emit(drop, "Deposited").withArgs(X, ethers.ZeroAddress, E(40));
    await expect(drop.sync(X)).to.be.revertedWith("nothing new");
    await drop.connect(a).claim([X]);
    await x.connect(treas).transfer(await drop.getAddress(), E(40));
    await drop.sync(X); // held 70, owed 30 → +40
    expect((await drop.drops(X)).amount).to.equal(E(80));
    expect(await drop.claimable(X, a.address)).to.equal(E(10));
    expect(await drop.claimable(X, b.address)).to.equal(E(60));
  });

  it("decaying locks: the sum of all claims fits the deposit", async () => {
    const t = await now();
    const ws = [a, b, c, d];
    for (let i = 0; i < ws.length; i++) await st.connect(ws[i]).createLock(E(1000 + 137 * i), t + (5 + 11 * i) * WEEK);
    await to(W0 + 5000);
    const x = await coin("X", await now());
    const X = await x.getAddress();
    const amt = E(40_000_000) + 12345n;
    await drop.connect(treas).deposit(X, amt);
    await drop.pushTo(X, ws.map((w) => w.address));
    let sum = 0n;
    for (const w of ws) sum += await x.balanceOf(w.address);
    expect(sum <= amt).to.equal(true);
    expect(amt - sum < 10n).to.equal(true);
  });
});
