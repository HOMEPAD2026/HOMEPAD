// ArciaStaking (veARCIA): lock multipliers, the 20-day reward stream, fund / defund, early-exit penalty (burned),
// signed $ARCIRCLE boosts, lapses, owner limits.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const DAY = 86400;
const E = (n) => ethers.parseEther(String(n));
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const to = async (t) => { await network.provider.send("evm_setNextBlockTimestamp", [t]); await network.provider.send("evm_mine"); };
const next = async (t) => network.provider.send("evm_setNextBlockTimestamp", [t]);
const near = (x, y, tol = E("0.001")) => { const d = x > y ? x - y : y - x; expect(d <= tol, `${ethers.formatEther(x)} vs ${ethers.formatEther(y)}`).to.equal(true); };
const DEAD = "0x000000000000000000000000000000000000dEaD";

describe("ArciaStaking (veARCIA)", function () {
  let st, arcia, owner, signer, a, b, c, other;
  async function boost(user, tier, issued, until, by = signer) {
    const h = await st.boostHash(user, tier, issued, until);
    return by.signMessage(ethers.getBytes(h));
  }
  beforeEach(async () => {
    [, owner, signer, a, b, c, other] = await ethers.getSigners();
    const T = await ethers.getContractFactory("TestToken");
    arcia = await T.deploy("ARCIA", "ARCIA", 18);
    st = await (await ethers.getContractFactory("ArciaStaking")).deploy(await arcia.getAddress(), owner.address, signer.address);
    for (const w of [owner, a, b, c]) { await arcia.mint(w.address, E(10_000_000)); await arcia.connect(w).approve(await st.getAddress(), ethers.MaxUint256); }
  });

  it("lock multipliers and boost tiers", async () => {
    expect(await st.lockBpsFor(1)).to.equal(10000n);
    expect(await st.lockBpsFor(20)).to.equal(20000n);
    expect(await st.lockBpsFor(10)).to.equal(10000n + (9n * 10000n) / 19n);
    await expect(st.lockBpsFor(0)).to.be.revertedWithCustomError(st, "BadDays");
    await expect(st.lockBpsFor(21)).to.be.revertedWithCustomError(st, "BadDays");
    expect(await st.boostBps(0)).to.equal(10000n);
    expect(await st.boostBps(1)).to.equal(12000n);
    expect(await st.boostBps(2)).to.equal(15000n);
    expect(await st.boostBps(3)).to.equal(20000n);
    expect(await st.name()).to.equal("veARCIA");
  });

  it("stake → veARCIA, non-transferable, one position, can't shorten", async () => {
    await expect(st.connect(a).stake(E(1000), 20)).to.emit(st, "Transfer").withArgs(ethers.ZeroAddress, a.address, E(2000));
    expect(await st.balanceOf(a.address)).to.equal(E(2000));
    expect(await st.totalSupply()).to.equal(E(2000));
    expect(await st.totalStaked()).to.equal(E(1000));
    await expect(st.connect(a).stake(E(1), 5)).to.be.revertedWithCustomError(st, "ShorterLock");
    await st.connect(a).stake(0, 20); // renew only
    await expect(st.connect(b).stake(0, 5)).to.be.revertedWithCustomError(st, "ZeroAmount");
    expect(st.transfer).to.equal(undefined);
  });

  it("only the owner funds; the pool streams over 20 days pro rata to weight", async () => {
    await expect(st.connect(a).fund(E(1))).to.be.revertedWithCustomError(st, "NotOwner");
    await st.connect(a).stake(E(1000), 20); // weight 2000
    await st.connect(b).stake(E(2000), 1); // weight 2000
    const t0 = (await now()) + 10;
    await next(t0);
    await st.connect(owner).fund(E(200_000));
    near(await st.perDay(), E(10_000));
    expect(await st.finish()).to.equal(BigInt(t0 + 20 * DAY));
    await to(t0 + DAY);
    near(await st.earned(a.address), E(5000));
    near(await st.earned(b.address), E(5000));
    // b's 1-day lock ends: a poke drops it to 1.0x → a now gets 2/3
    await next(t0 + DAY + 1);
    await st.poke([b.address]);
    expect(await st.balanceOf(b.address)).to.equal(E(2000));
    const bw = (await st.positions(b.address)).weight;
    expect(bw).to.equal(E(2000));
    await to(t0 + 2 * DAY + 1);
    near(await st.earned(a.address), E(5000 + 5000), E("0.5"));
    near(await st.earned(b.address), E(5000 + 5000), E("0.5"));
    // claim anytime
    const before = await arcia.balanceOf(a.address);
    await st.connect(a).claim();
    near((await arcia.balanceOf(a.address)) - before, E(10_000), E("0.5"));
    // run to the end: everything streamed
    await to(t0 + 25 * DAY);
    const [pool, , , , , , streamed] = await st.stats();
    expect(pool).to.equal(0n);
    expect(streamed).to.equal(E(200_000));
  });

  it("two stakers share the whole pool by the end", async () => {
    await st.connect(a).stake(E(1000), 20); // 2000
    await st.connect(b).stake(E(1000), 20); // 2000
    const t0 = (await now()) + 10; await next(t0);
    await st.connect(owner).fund(E(20_000)); // 1000/day
    await to(t0 + 21 * DAY); // b's lock ended too, but both ended together
    near((await st.earned(a.address)) + (await st.earned(b.address)), E(20_000), E("0.01"));
  });

  it("deposit raises the rate, a withdrawal lowers it, and the owner can only take what hasn't streamed", async () => {
    await st.connect(a).stake(E(1000), 10);
    const t0 = (await now()) + 10; await next(t0);
    await st.connect(owner).fund(E(100_000)); // 5,000 / day
    await to(t0 + 4 * DAY);
    await next(t0 + 4 * DAY + 1);
    await st.connect(owner).fund(E(20_000)); // pool 80,000 + 20,000 → 100,000 over a fresh 20 days
    near(await st.perDay(), E(5000), E("0.1"));
    near(await st.pool(), E(100_000), E("0.5"));
    await next(t0 + 4 * DAY + 2);
    await expect(st.connect(owner).defund(E(200_000))).to.be.revertedWithCustomError(st, "TooMuch");
    await expect(st.connect(a).defund(E(1))).to.be.revertedWithCustomError(st, "NotOwner");
    const ob = await arcia.balanceOf(owner.address);
    await st.connect(owner).defund(E(50_000));
    expect((await arcia.balanceOf(owner.address)) - ob).to.equal(E(50_000));
    near(await st.perDay(), E(2500), E("0.1"));
    // a's earned rewards are untouched
    near(await st.earned(a.address), E(20_000), E("1"));
    // the contract always holds stake + pool + earned
    const bal = await arcia.balanceOf(await st.getAddress());
    expect(bal >= (await st.totalStaked()) + (await st.pool()) + (await st.earned(a.address))).to.equal(true);
  });

  it("nobody staked: the stream waits", async () => {
    const t0 = (await now()) + 10; await next(t0);
    await st.connect(owner).fund(E(20_000));
    await to(t0 + 5 * DAY);
    await next(t0 + 5 * DAY + 1);
    await st.connect(a).stake(E(100), 1);
    expect(await st.pool()).to.equal(E(20_000)); // nothing streamed to nobody
    await to(t0 + 30 * DAY);
    near(await st.earned(a.address), E(20_000), E("0.01"));
  });

  it("early withdrawal: time left ÷ full lock, capped at 50%, burned; free after the end", async () => {
    await st.connect(a).stake(E(1000), 10);
    const s = Number((await st.positions(a.address)).start);
    // 8 of 10 days left → 80% → capped 50%
    await next(s + 2 * DAY);
    const d0 = await arcia.balanceOf(DEAD);
    await expect(st.connect(a).withdraw(E(100))).to.emit(st, "Withdrawn").withArgs(a.address, E(100), E(50), E(50));
    expect((await arcia.balanceOf(DEAD)) - d0).to.equal(E(50));
    // 3 of 10 days left → 30%
    await to(s + 7 * DAY);
    const [pen, bps] = await st.penaltyOf(a.address, E(100));
    expect(bps).to.equal(3000n);
    expect(pen).to.equal(E(30));
    const ab = await arcia.balanceOf(a.address);
    await st.connect(a).withdraw(E(100)); // one second later: a hair under 30%
    near((await arcia.balanceOf(a.address)) - ab, E(70), E("0.01"));
    // after the end: free
    await next(s + 10 * DAY);
    const ab2 = await arcia.balanceOf(a.address);
    await st.connect(a).withdraw(E(800));
    expect((await arcia.balanceOf(a.address)) - ab2).to.equal(E(800));
    near(await st.totalBurned(), E(80), E("0.01"));
    expect(await st.balanceOf(a.address)).to.equal(0n);
    expect(await st.totalSupply()).to.equal(0n);
    await expect(st.connect(a).withdraw(1)).to.be.revertedWithCustomError(st, "TooMuch");
  });

  it("signed $ARCIRCLE boost: tiers, replay, wrong signer, expiry, lapse", async () => {
    await st.connect(a).stake(E(1000), 1); // ve 1000
    await st.connect(b).stake(E(1000), 1);
    const t = await now();
    const sig = await boost(a.address, 3, t, t + 7 * DAY);
    await st.connect(other).applyBoost(a.address, 3, t, t + 7 * DAY, sig); // anyone can submit it
    expect((await st.positions(a.address)).weight).to.equal(E(2000));
    expect(await st.balanceOf(a.address)).to.equal(E(1000)); // veARCIA itself isn't boosted
    await expect(st.applyBoost(a.address, 3, t, t + 7 * DAY, sig)).to.be.revertedWithCustomError(st, "StaleBoost");
    const bad = await boost(b.address, 3, t, t + 7 * DAY, other);
    await expect(st.applyBoost(b.address, 3, t, t + 7 * DAY, bad)).to.be.revertedWithCustomError(st, "BadBoost");
    const forA = await boost(a.address, 3, t + 1, t + 7 * DAY);
    await expect(st.applyBoost(b.address, 3, t + 1, t + 7 * DAY, forA)).to.be.revertedWithCustomError(st, "BadBoost");
    await expect(st.applyBoost(b.address, 3, t, t + 30 * DAY, await boost(b.address, 3, t, t + 30 * DAY))).to.be.revertedWithCustomError(st, "BadBoost"); // too long
    // a newer, lower note replaces it (sold their $ARCIRCLE)
    const t2 = t + 100;
    await st.applyBoost(a.address, 1, t2, t2 + DAY, await boost(a.address, 1, t2, t2 + DAY));
    expect((await st.positions(a.address)).weight).to.equal(E(1200));
    // rewards follow weight: a 1.2 : b 1.0
    const t0 = (await now()) + 10; await next(t0);
    await st.connect(owner).fund(E(22_000)); // 1,100/day
    await to(t0 + DAY / 2);
    near(await st.earned(a.address), E(300), E("0.05"));
    near(await st.earned(b.address), E(250), E("0.05"));
    // the boost lapses → poke → 1.0x
    await to(t2 + DAY + 10);
    await st.poke([a.address]);
    expect((await st.positions(a.address)).weight).to.equal(E(1000));
    expect((await st.positions(a.address)).tier).to.equal(0);
  });

  it("owner handover and boost signer", async () => {
    await expect(st.connect(a).setBoostSigner(a.address)).to.be.revertedWithCustomError(st, "NotOwner");
    await st.connect(owner).setBoostSigner(other.address);
    expect(await st.boostSigner()).to.equal(other.address);
    await st.connect(owner).transferOwnership(c.address);
    await expect(st.connect(a).acceptOwnership()).to.be.revertedWithCustomError(st, "NotOwner");
    await st.connect(c).acceptOwnership();
    expect(await st.owner()).to.equal(c.address);
  });

  it("many wallets, random actions: the books always balance", async () => {
    const ws = [a, b, c];
    await st.connect(owner).fund(E(1_000_000));
    let t = await now();
    for (let i = 0; i < 40; i++) {
      t += 3600 * (1 + (i % 7));
      await next(t);
      const w = ws[i % 3], p = await st.positions(w.address);
      const k = (i * 7) % 5;
      if (k === 0 || p.amount === 0n) await st.connect(w).stake(E(100 + i), p.amount > 0n ? 20 : 1 + (i % 20));
      else if (k === 1) await st.connect(w).claim();
      else if (k === 2) await st.connect(w).withdraw(p.amount / 3n);
      else if (k === 3) await st.connect(owner).defund((await st.pool()) / 10n);
      else await st.poke(ws.map((x) => x.address));
    }
    const bal = await arcia.balanceOf(await st.getAddress());
    let owedAll = 0n;
    for (const w of ws) owedAll += await st.earned(w.address);
    expect(bal >= (await st.totalStaked()) + (await st.pool()) + owedAll).to.equal(true);
    expect(bal - ((await st.totalStaked()) + (await st.pool()) + owedAll) < E("0.001")).to.equal(true); // dust only
    let sw = 0n, sv = 0n;
    for (const w of ws) { const p = await st.positions(w.address); sw += p.weight; sv += p.ve; }
    expect(sw).to.equal(await st.totalWeight());
    expect(sv).to.equal(await st.totalSupply());
  });
});
