// ArcPerp: two-step orders at keeper prices bounded by Chainlink, a capped pool, liquidations, the queue, the skim
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const U = (n) => BigInt(Math.round(n * 1e6));     // USDC, 6 dec
const P = (n) => BigInt(Math.round(n * 1e8));     // price, 1e8
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const inc = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };

describe("ArcPerp", function () {
  let usdc, feed, perp, stk, owner, keeper, burn, lp, alice, bob, stranger;
  beforeEach(async () => {
    [owner, keeper, burn, lp, alice, bob, stranger] = await ethers.getSigners();
    usdc = await (await ethers.getContractFactory("TestToken")).deploy("USD Coin", "USDC", 6);
    feed = await (await ethers.getContractFactory("MockAggregator")).deploy();
    await feed.set(P(60000));
    stk = await (await ethers.getContractFactory("MockStakingFund")).deploy(await usdc.getAddress());
    perp = await (await ethers.getContractFactory("ArcPerp")).deploy(await usdc.getAddress(), owner.address, keeper.address, burn.address, await stk.getAddress());
    await perp.addMarket("BTC", await feed.getAddress(), 20, U(50000), U(200000), U(200000));
    for (const w of [owner, lp, alice, bob]) { await usdc.mint(w.address, U(1_000_000)); await usdc.connect(w).approve(await perp.getAddress(), ethers.MaxUint256); }
    await perp.deposit(U(100000)); // the treasury seeds the pool
  });
  const exec = async (ids, prices) => { await inc(1); return perp.connect(keeper).execute(ids, prices.map(P), await now() + 1); };
  async function open(who, isLong, coll, lev, price = 60000, acc) {
    const id = await perp.orderCount() + 1n;
    await perp.connect(who).requestOpen(0, isLong, U(coll), lev, P(acc != null ? acc : isLong ? price * 1.01 : price * 0.99));
    await exec([id], [price]);
    return await perp.positionCount();
  }
  it("seeds the pool at 1 share = 1 USDC; only the owner adds while LP is closed", async () => {
    expect(await perp.poolAmount()).to.equal(U(100000));
    expect(await perp.sharePrice()).to.equal(10n ** 18n);
    await expect(perp.connect(lp).deposit(U(10))).to.be.revertedWithCustomError(perp, "NotOwner");
    await perp.setLpOpen(true);
    await perp.connect(lp).deposit(U(1000));
    expect(await perp.shares(lp.address)).to.equal(U(1000) * 10n ** 12n);
  });
  it("open long → profit paid from the pool; fees go to the pool; the keeper gets the exec fee", async () => {
    const k0 = await usdc.balanceOf(keeper.address);
    const pid = await open(alice, true, 1000, 10);
    expect(await usdc.balanceOf(keeper.address) - k0).to.equal(U(0.2));
    const p = await perp.position(pid);
    expect(p.size).to.equal(U(10000));
    expect(p.collateral).to.equal(U(1000) - U(6)); // 0.06% of 10,000 = 6
    await feed.set(P(63000));
    const a0 = await usdc.balanceOf(alice.address);
    await perp.connect(alice).requestClose(pid, P(62000));
    await exec([await perp.orderCount()], [63000]);
    const got = (await usdc.balanceOf(alice.address)) - a0;
    // +5% on 10,000 = +500; close fee 6; borrow fee ~ a few seconds
    expect(got > U(994 + 500 - 6 - 0.1) && got <= U(994 + 500 - 6)).to.equal(true);
    expect(await perp.reserved()).to.equal(0n);
  });
  it("prices: must be after the request, fresh, within 1% of Chainlink; a stale feed stops fills", async () => {
    await perp.connect(alice).requestOpen(0, true, U(100), 5, P(61000));
    await expect(perp.connect(keeper).execute([1], [P(60900)], await now() + 1)).to.be.revertedWithCustomError(perp, "PriceOff");
    await expect(perp.connect(stranger).execute([1], [P(60000)], await now())).to.be.revertedWithCustomError(perp, "NotKeeper");
    await inc(30);
    await expect(perp.connect(keeper).execute([1], [P(60000)], (await now()) - 20)).to.be.revertedWithCustomError(perp, "StalePrice");
    await feed.setAt(P(60000), (await now()) - 27 * 3600);
    await expect(perp.connect(keeper).execute([1], [P(60000)], await now() + 1)).to.be.revertedWithCustomError(perp, "StalePrice");
  });
  it("a fill worse than acceptable cancels and refunds the collateral; the keeper keeps the exec fee", async () => {
    const a0 = await usdc.balanceOf(alice.address);
    await perp.connect(alice).requestOpen(0, true, U(100), 5, P(59900)); // won't pay more than 59,900
    await exec([1], [60000]);
    expect(await perp.positionCount()).to.equal(0n);
    expect(a0 - (await usdc.balanceOf(alice.address))).to.equal(U(0.2));
  });
  it("an order nobody executes can be cancelled after 3 minutes for a full refund", async () => {
    const a0 = await usdc.balanceOf(alice.address);
    await perp.connect(alice).requestOpen(0, false, U(100), 5, P(59000));
    await expect(perp.connect(alice).cancel(1)).to.be.revertedWithCustomError(perp, "TooEarly");
    await inc(181);
    await perp.connect(alice).cancel(1);
    expect(await usdc.balanceOf(alice.address)).to.equal(a0);
    expect(await perp.escrow()).to.equal(0n);
  });
  it("caps: leverage, size, open interest, and the pool's worst case", async () => {
    await expect(perp.connect(alice).requestOpen(0, true, U(100), 21, P(61000))).to.be.revertedWithCustomError(perp, "Bad");
    await expect(perp.connect(alice).requestOpen(0, true, U(3000), 20, P(61000))).to.be.revertedWithCustomError(perp, "TooBig");
    await expect(perp.addMarket("X", await feed.getAddress(), 51, 1, 1, 1)).to.be.revertedWithCustomError(perp, "Bad");
    // 9× profit cap: 10,000 collateral → 90,000 reserved; 80% of 100,000 = 80,000 → the second can't open
    await open(alice, true, 8000, 2);
    expect(await perp.reserved()).to.be.greaterThan(U(70000));
    await perp.connect(bob).requestOpen(0, false, U(2000), 2, P(59000));
    await exec([await perp.orderCount()], [60000]);
    expect(await perp.positionCount()).to.equal(1n); // cancelled: "pool full"
  });
  it("liquidation: under the maintenance margin at the keeper's price; the pool takes it, the keeper a fee", async () => {
    const pid = await open(alice, true, 100, 20); // size 2,000
    expect(await perp.liquidatable(pid, P(59000))).to.equal(false);
    const lq = await perp.liqPrice(pid);
    expect(lq > P(57500) && lq < P(57800)).to.equal(true);
    await feed.set(P(57000));
    const pool0 = await perp.poolAmount(), k0 = await usdc.balanceOf(keeper.address);
    await perp.connect(keeper).liquidate([pid], [P(57000)], await now() + 1);
    expect((await perp.position(pid)).size).to.equal(0n);
    const kf = (await usdc.balanceOf(keeper.address)) - k0;
    expect(kf <= U(2)).to.equal(true);
    expect((await perp.poolAmount()) - pool0 + kf).to.equal((await perp.position(pid)).collateral);
  });
  it("profit is capped at 9× the collateral", async () => {
    const pid = await open(alice, true, 100, 20);
    // +60% on size 2,000 = 1,200 > 9 × ~99.88
    expect(await perp.pnlAt(pid, P(96000))).to.equal((await perp.position(pid)).cap);
  });
  it("LP withdrawals: cooldown, and the open positions stay covered", async () => {
    await perp.setLpOpen(true);
    await perp.connect(lp).deposit(U(50000));
    await expect(perp.connect(lp).withdraw(await perp.shares(lp.address))).to.be.revertedWithCustomError(perp, "Cooldown");
    await inc(3 * 86400 + 1);
    await feed.set(P(60000));
    await open(alice, true, 9000, 2); // reserves 81,000 → the pool must keep 101,250
    await expect(perp.withdraw(await perp.shares(owner.address))).to.be.revertedWithCustomError(perp, "OverUtil");
    await perp.connect(lp).withdraw((await perp.shares(lp.address)) / 2n);
  });
  it("skim: half of the gains over the high-water mark → fee burn and veARCIRCLE (or all to the burn)", async () => {
    // a losing trader makes the pool gain
    const pid = await open(alice, false, 1000, 10);
    await feed.set(P(62000));
    await perp.connect(alice).requestClose(pid, P(63000));
    await exec([await perp.orderCount()], [62000]);
    const gain = (await perp.poolAmount()) - U(100000);
    expect(gain > U(300)).to.equal(true);
    const b0 = await usdc.balanceOf(burn.address);
    await perp.skim();
    const toBurn = (await usdc.balanceOf(burn.address)) - b0, toStk = await stk.funded();
    expect(toBurn + toStk).to.equal(gain / 2n);
    expect(await perp.sharePrice()).to.equal(await perp.hwm());
    expect(await perp.skim.staticCall()).to.equal(0n); // nothing new above the mark
    // stakers refuse (a week with none): everything to the burn
    await stk.setRefuse(true);
    const pid2 = await open(bob, true, 1000, 10, 62000);
    await feed.set(P(61000));
    await perp.connect(bob).requestClose(pid2, P(60000));
    await exec([await perp.orderCount()], [61000]);
    const b1 = await usdc.balanceOf(burn.address);
    await perp.skim();
    expect((await usdc.balanceOf(burn.address)) > b1).to.equal(true);
  });
  it("pause stops new positions, never closes; the owner can't touch the pool or collateral", async () => {
    const pid = await open(alice, true, 100, 5);
    await perp.setPaused(true);
    await expect(perp.connect(bob).requestOpen(0, true, U(100), 5, P(61000))).to.be.revertedWithCustomError(perp, "IsPaused");
    await perp.connect(alice).requestClose(pid, P(59000));
    await exec([await perp.orderCount()], [60000]);
    expect((await perp.position(pid)).size).to.equal(0n);
    await expect(perp.connect(stranger).setPaused(false)).to.be.revertedWithCustomError(perp, "NotOwner");
    await expect(perp.setRisk(10, 100, 3600, 15, 90000, 8000, 1)).to.be.revertedWithCustomError(perp, "Bad");
    await expect(perp.setFees(51, 6, 1, 0, 0)).to.be.revertedWithCustomError(perp, "Bad");
  });
  it("the pool always covers: at 100% use, every capped profit is paid in full and the queue stays empty", async () => {
    await perp.setRisk(100, 300, 26 * 3600, 15, 90000, 10_000, U(5));
    const pa = await open(alice, true, 10000, 1);
    const pb = await open(bob, true, 1100, 1);
    await usdc.mint(stranger.address, U(1000)); await usdc.connect(stranger).approve(await perp.getAddress(), ethers.MaxUint256);
    await expect(perp.connect(stranger).requestOpen(0, true, U(100), 1, P(61000))).to.not.be.reverted; // asks fine…
    await exec([await perp.orderCount()], [60000]);                                                 // …but the pool is full
    expect(await perp.positionCount()).to.equal(2n);
    // the price runs far past both caps (the 3% keeper band follows the feed up)
    const px = 600000; await feed.set(P(px)); // ×10
    const a0 = await usdc.balanceOf(alice.address), b0 = await usdc.balanceOf(bob.address);
    await perp.connect(alice).requestClose(pa, P(1)); await perp.connect(bob).requestClose(pb, P(1));
    const n = await perp.orderCount();
    await exec([n - 1n, n], [px, px]);
    const pA = await perp.position(pa), pB = await perp.position(pb);
    expect((await usdc.balanceOf(alice.address)) - a0 > pA.collateral + pA.cap - U(100)).to.equal(true);
    expect((await usdc.balanceOf(bob.address)) - b0 > pB.collateral + pB.cap - U(20)).to.equal(true);
    expect(await perp.owedTotal()).to.equal(0n);
    expect(await perp.queueLength()).to.equal(0n);
    expect(await perp.reserved()).to.equal(0n);
  });
});
