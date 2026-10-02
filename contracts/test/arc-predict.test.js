// ARCIRCLE Predict: UP / DOWN rounds on a token's Uniswap v4 USDC pool, against the real PoolManager.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const U = (n) => ethers.parseEther(String(n)); // native USDC: 18 decimals
const E = (n) => ethers.parseEther(String(n));
const MIN_SQRT = 4295128739n + 1n, MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;
function sqrtFor(p, tokenIs0) { const raw = tokenIs0 ? (p * 1e6) / 1e18 : 1 / ((p * 1e6) / 1e18); return BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n; }
const inc = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;

describe("ArcPredict", function () {
  let pm, liq, sw, usdc, meme, other, pr, owner, op, alice, bob, carol, fee, T, key;
  const keyOf = (token, quote) => { const [c0, c1] = BigInt(token) < BigInt(quote) ? [token, quote] : [quote, token]; return { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: ethers.ZeroAddress }; };
  async function pool(token, quote, price) {
    const k = keyOf(token, quote);
    const t0 = k.currency0 === token;
    await pm.initialize(k, sqrtFor(price, t0));
    const native = k.currency0 === ethers.ZeroAddress;
    await liq.modifyLiquidity(k, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(5), salt: ethers.ZeroHash }, "0x", native ? { value: E(1000) } : {});
    return k;
  }
  // buy (true) or sell (false) the token with an exact input
  async function trade(k, buy, amt) {
    const tokenIs0 = k.currency0 === T.meme || k.currency0 === T.other;
    const zeroForOne = buy ? !tokenIs0 : tokenIs0; // buying the token pays in USDC
    const native = k.currency0 === ethers.ZeroAddress && zeroForOne;
    await sw.swap(k, { zeroForOne, amountSpecified: -amt, sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT }, { takeClaims: false, settleUsingBurn: false }, "0x", native ? { value: amt } : {});
  }
  async function cycle(ids = [0]) { // the keeper: 3 samples in different blocks, then settle
    for (let i = 0; i < 3; i++) { await pr.connect(op).sample(ids); await inc(3); }
    await pr.settle(ids);
  }
  const cur = async (m = 0) => (await pr.market(m)).cur;

  beforeEach(async function () {
    [owner, op, alice, bob, carol, fee] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    sw = await (await ethers.getContractFactory("PoolSwapTest")).deploy(await pm.getAddress());
    const Tok = await ethers.getContractFactory("TestToken");
    usdc = await Tok.deploy("USD Coin", "USDC", 6); meme = await Tok.deploy("Meme", "MEME", 18); other = await Tok.deploy("Other", "OTH", 18);
    T = { usdc: await usdc.getAddress(), meme: await meme.getAddress(), other: await other.getAddress() };
    for (const t of [usdc, meme, other]) { await t.mint(owner.address, t === usdc ? 10_000_000n * 10n ** 6n : E(1e12)); await t.approve(await liq.getAddress(), ethers.MaxUint256); await t.approve(await sw.getAddress(), ethers.MaxUint256); }
    key = await pool(T.meme, T.usdc, 0.0001);
    pr = await (await ethers.getContractFactory("ArcPredict")).deploy(await pm.getAddress(), T.usdc, owner.address, op.address, fee.address);
    await pr.connect(op).addMarket(key, 300);
  });

  it("lists only live USDC pools, by the owner or the operator", async function () {
    const m = await pr.market(0);
    expect(m.token).to.equal(T.meme);
    expect(m.duration).to.equal(300n);
    expect(m.active).to.equal(true);
    const notUsdc = keyOf(T.meme, T.other);
    await pm.initialize(notUsdc, 2n ** 96n);
    await expect(pr.connect(op).addMarket(notUsdc, 300)).to.be.revertedWithCustomError(pr, "NotUsdcPool");
    await expect(pr.connect(op).addMarket({ ...key, fee: 500, tickSpacing: 10 }, 300)).to.be.revertedWithCustomError(pr, "PoolNotLive");
    await expect(pr.connect(op).addMarket(key, 30)).to.be.revertedWithCustomError(pr, "BadLimits");
    await expect(pr.connect(alice).addMarket(key, 300)).to.be.revertedWithCustomError(pr, "NotAllowed");
    await expect(pr.connect(alice).sample([0])).to.be.revertedWithCustomError(pr, "NotAllowed");
    // a pool paired with native USDC (currency 0) counts too
    const nk = await pool(T.other, ethers.ZeroAddress, 0.0002);
    await pr.addMarket(nk, 900);
    expect((await pr.market(1)).tokenIs0).to.equal(false);
    expect(await pr.marketCount()).to.equal(2n);
  });

  it("opens the first round on the median of three samples; bets follow the caps and the lock", async function () {
    await pr.connect(op).sample([0]);
    await pr.settle([0]); // one sample isn't enough: nothing happens, and the sample isn't lost
    expect(await cur()).to.equal(0n);
    expect((await pr.samplesOf(0)).length).to.equal(1);
    await pr.setLimits(U(0.5), U(5), U(500), 30, 3, 30);
    await pr.connect(op).sample([0]); // too soon after the last one → skipped (sampleGap)
    expect((await pr.samplesOf(0)).length).to.equal(1);
    await pr.setLimits(U(0.5), U(5), U(500), 30, 3, 2);
    await inc(3); await pr.connect(op).sample([0]); await inc(3); await pr.connect(op).sample([0]);
    await expect(pr.settle([0])).to.emit(pr, "RoundStarted");
    const id = await cur();
    expect(id).to.equal(1n);
    const r = await pr.round(id);
    expect(r.openPrice).to.equal(await pr.priceOf(0));
    expect(r.endAt - r.startAt).to.equal(300n);
    expect(r.endAt - r.lockAt).to.equal(30n);
    await expect(pr.connect(alice).bet(id, true, { value: U(0.1) })).to.be.revertedWithCustomError(pr, "TooSmall");
    await expect(pr.connect(alice).bet(id, true, { value: U(6) })).to.be.revertedWithCustomError(pr, "OverMaxBet");
    await pr.connect(alice).bet(id, true, { value: U(3) });
    await pr.connect(alice).bet(id, true, { value: U(2) });
    await expect(pr.connect(alice).bet(id, true, { value: U(1) })).to.be.revertedWithCustomError(pr, "OverMaxBet");
    await expect(pr.connect(alice).bet(id, false, { value: U(1) })).to.be.revertedWithCustomError(pr, "OtherSide");
    await pr.setLimits(U(0.5), U(5), U(6), 30, 3, 2);
    await expect(pr.connect(bob).bet(id, true, { value: U(2) })).to.be.revertedWithCustomError(pr, "OverMaxSide");
    await pr.setPaused(true);
    await expect(pr.connect(bob).bet(id, false, { value: U(1) })).to.be.revertedWithCustomError(pr, "IsPaused");
    await pr.setPaused(false);
    await inc(275);
    await expect(pr.connect(bob).bet(id, false, { value: U(1) })).to.be.revertedWithCustomError(pr, "NotOpen");
    // the running round isn't sampled before its end
    await pr.connect(op).sample([0]);
    expect((await pr.samplesOf(0)).length).to.equal(0);
  });

  it("UP wins when the price rises: winners split the pot after 2%, the next round opens on the same median", async function () {
    await cycle();
    const id = await cur();
    await pr.connect(alice).bet(id, true, { value: U(4) });
    await pr.connect(carol).bet(id, true, { value: U(1) });
    await pr.connect(bob).bet(id, false, { value: U(5) });
    await trade(key, true, 20_000n * 10n ** 6n); // someone buys the token
    await inc(300);
    await cycle();
    const r = await pr.round(id);
    expect(r.result).to.equal(1n); // Up
    const next = await pr.round(await cur());
    expect(next.openPrice).to.equal(r.closePrice);
    expect(await cur()).to.equal(2n);
    // pot 10, fee 0.2: alice 4/5 of 9.8, carol 1/5
    expect(await pr.claimable(id, alice.address)).to.equal(U(7.84));
    expect(await pr.claimable(id, carol.address)).to.equal(U(1.96));
    expect(await pr.claimable(id, bob.address)).to.equal(0n);
    const b0 = await ethers.provider.getBalance(alice.address);
    const tx = await pr.connect(alice).claim([id, 2n]);
    const rc = await tx.wait();
    expect((await ethers.provider.getBalance(alice.address)) - b0 + rc.gasUsed * rc.gasPrice).to.equal(U(7.84));
    await expect(pr.connect(alice).claim([id])).to.be.revertedWithCustomError(pr, "NothingToClaim");
    await expect(pr.connect(bob).claim([id])).to.be.revertedWithCustomError(pr, "NothingToClaim");
    expect(await pr.feesOwed()).to.equal(U(0.2));
    const f0 = await ethers.provider.getBalance(fee.address);
    await pr.connect(bob).payFees();
    expect((await ethers.provider.getBalance(fee.address)) - f0).to.equal(U(0.2));
    expect(await pr.volume()).to.equal(U(10));
  });

  it("DOWN wins on a fall; direction is right whichever side of the pool the token is", async function () {
    const nk = await pool(T.other, ethers.ZeroAddress, 0.0002); // token = currency1, native USDC = currency0
    await pr.addMarket(nk, 300);
    await cycle([0, 1]);
    const a = await cur(0), b = await cur(1);
    for (const id of [a, b]) { await pr.connect(alice).bet(id, true, { value: U(1) }); await pr.connect(bob).bet(id, false, { value: U(1) }); }
    await trade(key, false, E(1_000_000)); // meme sold
    await trade(nk, false, E(1_000_000)); // other sold
    await inc(300);
    await cycle([0, 1]);
    expect((await pr.round(a)).result).to.equal(2n);
    expect((await pr.round(b)).result).to.equal(2n);
    expect(await pr.claimable(b, bob.address)).to.equal(U(1.96));
  });

  it("one block's push doesn't decide a round: it closes on the median", async function () {
    await cycle();
    const id = await cur();
    await pr.connect(alice).bet(id, true, { value: U(5) });
    await pr.connect(bob).bet(id, false, { value: U(5) });
    await inc(300);
    await pr.connect(op).sample([0]); await inc(3);
    const m0 = await meme.balanceOf(owner.address);
    await trade(key, true, 50_000n * 10n ** 6n); // pumped for one sample…
    const got = (await meme.balanceOf(owner.address)) - m0;
    await pr.connect(op).sample([0]); await inc(3);
    await trade(key, false, got); // …then sold straight back
    await pr.connect(op).sample([0]);
    const s = await pr.samplesOf(0);
    expect(s.length).to.equal(3);
    await pr.settle([0]);
    const r = await pr.round(id);
    const sorted = [...s].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(r.closePrice).to.equal(sorted[1]);
    expect(r.closePrice).to.not.equal(s[1]); // never the pumped sample
    expect(s[1] === sorted[0] || s[1] === sorted[2]).to.equal(true); // the pushed sample is an extreme
  });

  it("refunds without a fee: one side empty, or no move", async function () {
    await cycle();
    let id = await cur();
    await pr.connect(alice).bet(id, true, { value: U(5) });
    await trade(key, true, 20_000n * 10n ** 6n);
    await inc(300); await cycle();
    expect((await pr.round(id)).result).to.equal(3n); // Refund: nobody on DOWN
    expect(await pr.claimable(id, alice.address)).to.equal(U(5));
    id = await cur();
    await pr.connect(alice).bet(id, true, { value: U(2) });
    await pr.connect(bob).bet(id, false, { value: U(3) });
    await inc(300); await cycle(); // nobody traded: same price
    expect((await pr.round(id)).result).to.equal(3n);
    expect(await pr.claimable(id, bob.address)).to.equal(U(3));
    expect(await pr.feesOwed()).to.equal(0n);
  });

  it("a round nobody settles in time refunds — claimable even before anyone settles it", async function () {
    await cycle();
    const id = await cur();
    await pr.connect(alice).bet(id, true, { value: U(2) });
    await pr.connect(bob).bet(id, false, { value: U(3) });
    await trade(key, true, 20_000n * 10n ** 6n);
    await inc(300 + 15 * 60 + 5);
    expect(await pr.claimable(id, alice.address)).to.equal(U(2));
    await pr.connect(alice).claim([id]);
    // the keeper comes back: samples after the end, settle → refund, no new round on stale samples
    await pr.connect(op).sample([0]); await inc(3); await pr.connect(op).sample([0]); await inc(3); await pr.connect(op).sample([0]);
    await expect(pr.settle([0])).to.emit(pr, "RoundSettled");
    expect((await pr.round(id)).result).to.equal(3n);
    expect(await cur()).to.equal(0n);
    expect(await pr.claimable(id, bob.address)).to.equal(U(3));
    expect(await pr.claimable(id, alice.address)).to.equal(0n); // already claimed
    await cycle(); // fresh samples start the next round
    expect(await cur()).to.equal(2n);
  });

  it("stale samples are dropped; a market switched off finishes its round and stops; fee changes apply to later rounds", async function () {
    await pr.connect(op).sample([0]); await inc(3); await pr.connect(op).sample([0]);
    await inc(400);
    await pr.connect(op).sample([0]); // the two old ones were dropped
    expect((await pr.samplesOf(0)).length).to.equal(1);
    await inc(3); await pr.connect(op).sample([0]); await inc(3); await pr.connect(op).sample([0]);
    await pr.settle([0]);
    const id = await cur();
    await pr.setFee(100, carol.address);
    await expect(pr.setFee(400, carol.address)).to.be.revertedWithCustomError(pr, "BadLimits");
    await pr.connect(alice).bet(id, true, { value: U(5) });
    await pr.connect(bob).bet(id, false, { value: U(5) });
    await trade(key, true, 20_000n * 10n ** 6n);
    await pr.connect(op).setActive(0, false);
    await inc(300); await cycle();
    expect((await pr.round(id)).result).to.equal(1n);
    expect(await pr.claimable(id, alice.address)).to.equal(U(9.8)); // the round started at 2%
    expect(await cur()).to.equal(0n); // no new round while off
    await pr.connect(op).setActive(0, true);
    await cycle();
    expect((await pr.round(await cur())).feeBps).to.equal(100n);
    await expect(pr.connect(alice).setFee(0, alice.address)).to.be.revertedWithCustomError(pr, "NotOwner");
    await expect(pr.connect(op).setLimits(1, 2, 3, 30, 3, 2)).to.be.revertedWithCustomError(pr, "NotOwner");
  });
});
