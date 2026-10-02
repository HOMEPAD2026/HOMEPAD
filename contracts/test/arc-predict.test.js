// ARCIRCLE Predict: scheduled UP / DOWN rounds on a token's Uniswap v4 USDC pool, against the real PoolManager.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const U = (n) => ethers.parseEther(String(n)); // native USDC: 18 decimals
const E = (n) => ethers.parseEther(String(n));
const DEAD = "0x000000000000000000000000000000000000dEaD";
const HOOK_ADDR = "0x0000000000000000000000000000000000012044";
const ODD_HOOK = "0x0000000000000000000000000000000000014444";
const MIN_SQRT = 4295128739n + 1n, MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;
function sqrtFor(p, tokenIs0) { const raw = tokenIs0 ? (p * 1e6) / 1e18 : 1 / ((p * 1e6) / 1e18); return BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n; }
const inc = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const Z = ethers.ZeroAddress;

describe("ArcPredict", function () {
  let pm, liq, sw, usdc, meme, other, arc, pr, owner, op, alice, bob, carol, dave, erin, fee, T, key;
  const keyOf = (token, quote, hooks = Z) => { const [c0, c1] = BigInt(token) < BigInt(quote) ? [token, quote] : [quote, token]; return { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks }; };
  async function pool(token, quote, price, hooks = Z, liqE = 5) {
    const k = keyOf(token, quote, hooks);
    await pm.initialize(k, sqrtFor(price, k.currency0 === token));
    const native = k.currency0 === Z;
    if (liqE) await liq.modifyLiquidity(k, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(liqE), salt: ethers.ZeroHash }, "0x", native ? { value: E(1000) } : {});
    return k;
  }
  async function trade(k, token, buy, amt) {
    const tokenIs0 = k.currency0 === token;
    const zeroForOne = buy ? !tokenIs0 : tokenIs0;
    const native = k.currency0 === Z && zeroForOne;
    await sw.swap(k, { zeroForOne, amountSpecified: -amt, sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT }, { takeClaims: false, settleUsingBurn: false }, "0x", native ? { value: amt } : {});
  }
  // the keeper at a boundary: 3 samples in different blocks, then settle
  async function boundary(ids = [0]) { for (let i = 0; i < 3; i++) { await pr.connect(op).sample(ids); await inc(3); } await pr.settle(ids); }
  async function toBoundary(m, b) { const t = Number(await pr.startAt(m, b)); const n = await now(); if (t > n) await inc(t - n); }
  const ep = (m = 0) => pr.bettingEpoch(m);

  beforeEach(async function () {
    [owner, op, alice, bob, carol, dave, erin, fee] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    sw = await (await ethers.getContractFactory("PoolSwapTest")).deploy(await pm.getAddress());
    const Tok = await ethers.getContractFactory("TestToken");
    usdc = await Tok.deploy("USD Coin", "USDC", 6); meme = await Tok.deploy("Meme", "MEME", 18); other = await Tok.deploy("Other", "OTH", 18); arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 18);
    T = { usdc: await usdc.getAddress(), meme: await meme.getAddress(), other: await other.getAddress(), arc: await arc.getAddress() };
    for (const t of [usdc, meme, other, arc]) { await t.mint(owner.address, t === usdc ? 10_000_000n * 10n ** 6n : E(1e12)); await t.approve(await liq.getAddress(), ethers.MaxUint256); await t.approve(await sw.getAddress(), ethers.MaxUint256); }
    await arc.mint(alice.address, E(1_000_000));
    const hook = await (await ethers.getContractFactory("TaxHook")).deploy(await pm.getAddress(), 300);
    await network.provider.send("hardhat_setCode", [HOOK_ADDR, await ethers.provider.getCode(await hook.getAddress())]);
    key = await pool(T.meme, T.usdc, 0.0001);
    pr = await (await ethers.getContractFactory("ArcPredict")).deploy(await pm.getAddress(), T.usdc, T.arc, owner.address, op.address, fee.address);
    await pr.connect(op).addMarket(key, 300, 0);
  });

  it("the team lists live USDC pools; locks follow the round length", async function () {
    const m = await pr.market(0);
    expect(m.token).to.equal(T.meme);
    expect(m.duration).to.equal(300n);
    expect(m.lock).to.equal(30n);
    expect(await pr.defaultLock(900)).to.equal(120n);
    expect(await pr.defaultLock(3600)).to.equal(600n);
    const nu = keyOf(T.meme, T.other);
    await pm.initialize(nu, 2n ** 96n);
    await expect(pr.connect(op).addMarket(nu, 300, 0)).to.be.revertedWithCustomError(pr, "NotQuotePool");
    await expect(pr.connect(op).addMarket({ ...key, fee: 500, tickSpacing: 10 }, 300, 0)).to.be.revertedWithCustomError(pr, "PoolNotLive");
    await expect(pr.connect(op).addMarket(key, 120, 0)).to.be.revertedWithCustomError(pr, "BadLimits");
    await expect(pr.connect(op).addMarket(key, 900, 500)).to.be.revertedWithCustomError(pr, "BadLimits"); // lock > half
    await expect(pr.connect(op).addMarket(key, 300, 0)).to.be.revertedWithCustomError(pr, "AlreadyListed");
    await expect(pr.connect(alice).addMarket(key, 900, 0)).to.be.revertedWithCustomError(pr, "NotAllowed");
    await pr.connect(op).addMarket(key, 3600, 0);
    expect((await pr.market(1)).lock).to.equal(600n);
    // a pool paired with native USDC counts too
    const nk = await pool(T.other, Z, 0.0002);
    await pr.addMarket(nk, 900, 90);
    expect((await pr.market(2)).tokenIs0).to.equal(false);
    expect((await pr.market(2)).lock).to.equal(90n);
  });

  it("anyone lists by burning $ARCIRCLE — enough liquidity, an accepted hook, 5m / 15m / 1h", async function () {
    const thin = await pool(T.other, T.usdc, 0.0001, Z, 0.001);
    const hooked = await pool(T.other, T.usdc, 0.0001, HOOK_ADDR);
    const odd = keyOf(T.other, T.usdc, ODD_HOOK);
    await expect(pr.connect(alice).listMarket(key, 900)).to.be.revertedWithCustomError(pr, "ListingClosed");
    await pr.setListing(true, E(1000));
    await expect(pr.connect(alice).listMarket(key, 600)).to.be.revertedWithCustomError(pr, "BadLimits");
    await expect(pr.connect(alice).listMarket(thin, 900)).to.be.revertedWithCustomError(pr, "TooThin");
    await expect(pr.connect(alice).listMarket(hooked, 900)).to.be.revertedWithCustomError(pr, "HookNotAllowed");
    await expect(pr.connect(alice).listMarket(odd, 900)).to.be.revertedWithCustomError(pr, "HookNotAllowed");
    await pr.setHookPattern(0x2044, true);
    await expect(pr.connect(alice).listMarket(hooked, 900)).to.be.reverted; // no $ARCIRCLE approval yet
    await arc.connect(alice).approve(await pr.getAddress(), E(1000));
    const d0 = await arc.balanceOf(DEAD);
    await expect(pr.connect(alice).listMarket(hooked, 900)).to.emit(pr, "MarketAdded");
    expect((await arc.balanceOf(DEAD)) - d0).to.equal(E(1000));
    expect((await pr.market(1)).lister).to.equal(alice.address);
    expect((await pr.market(1)).lock).to.equal(120n);
    await pr.setQuote(T.usdc, true, 10n ** 15n); // a much higher bar
    await arc.connect(alice).approve(await pr.getAddress(), E(1000));
    await expect(pr.connect(alice).listMarket(key, 3600)).to.be.revertedWithCustomError(pr, "TooThin");
  });

  it("the next round opens for bets when the running one locks; the boundary median is its price to beat", async function () {
    expect(await ep()).to.equal(0n);
    await expect(pr.connect(alice).bet(0, 1, true, Z, { value: U(1) })).to.be.revertedWithCustomError(pr, "NotOpen");
    await boundary(); // boundary 0: the first round's price to beat
    expect(await pr.priceAt(0, 0)).to.equal(await pr.priceOf(0));
    await pr.connect(alice).bet(0, 0, true, Z, { value: U(2) });
    const lockAt = Number(await pr.startAt(0, 1)) - 30;
    await inc(lockAt - (await now()));
    expect(await ep()).to.equal(1n); // round 0 locked → round 1 open, before it starts
    await expect(pr.connect(bob).bet(0, 0, false, Z, { value: U(1) })).to.be.revertedWithCustomError(pr, "NotOpen");
    await pr.connect(bob).bet(0, 1, false, Z, { value: U(1) });
    const r1 = await pr.round(await pr.roundOf(0, 1));
    expect(r1.epoch).to.equal(1n);
    expect(r1.openPrice).to.equal(0n); // not known yet
    await expect(pr.connect(bob).bet(0, 1, false, Z, { value: U(0.1) })).to.be.revertedWithCustomError(pr, "TooSmall");
    await expect(pr.connect(bob).bet(0, 1, false, Z, { value: U(5) })).to.be.revertedWithCustomError(pr, "OverMaxBet");
    await expect(pr.connect(bob).bet(0, 1, true, Z, { value: U(1) })).to.be.revertedWithCustomError(pr, "OtherSide");
    await pr.setPaused(true);
    await expect(pr.connect(carol).bet(0, 1, true, Z, { value: U(1) })).to.be.revertedWithCustomError(pr, "IsPaused");
    await pr.setPaused(false);
    await pr.setLimits(U(0.5), U(5), U(5), 3, 2);
    await pr.connect(carol).bet(0, 1, false, Z, { value: U(4) });
    await expect(pr.connect(dave).bet(0, 1, false, Z, { value: U(1) })).to.be.revertedWithCustomError(pr, "OverMaxSide");
    // a running round isn't sampled before its end
    await pr.connect(op).sample([0]);
    expect((await pr.samplesOf(0)).length).to.equal(0);
  });

  it("UP wins on a rise: winners split the pot after 2%; the closing median is the next round's price to beat", async function () {
    await boundary();
    await pr.connect(alice).bet(0, 0, true, Z, { value: U(4) });
    await pr.connect(carol).bet(0, 0, true, Z, { value: U(1) });
    await pr.connect(bob).bet(0, 0, false, Z, { value: U(5) });
    await trade(key, T.meme, true, 20_000n * 10n ** 6n);
    await toBoundary(0, 1);
    await boundary();
    const id = await pr.roundOf(0, 0);
    const r = await pr.round(id);
    expect(r.result).to.equal(1n);
    expect(await pr.priceAt(0, 1)).to.equal(r.closePrice);
    expect(await pr.claimable(id, alice.address)).to.equal(U(7.84));
    expect(await pr.claimable(id, carol.address)).to.equal(U(1.96));
    expect(await pr.claimable(id, bob.address)).to.equal(0n);
    const b0 = await ethers.provider.getBalance(alice.address);
    const rc = await (await pr.connect(alice).claim([id, 99n])).wait();
    expect((await ethers.provider.getBalance(alice.address)) - b0 + rc.gasUsed * rc.gasPrice).to.equal(U(7.84));
    await expect(pr.connect(alice).claim([id])).to.be.revertedWithCustomError(pr, "NothingToClaim");
    expect(await pr.feesOwed()).to.equal(U(0.2));
    expect(await pr.volume()).to.equal(U(10));
  });

  it("referrals: the first referrer sticks and earns 25% of the fee its wallets paid", async function () {
    await boundary();
    await pr.connect(erin).bet(0, 0, true, dave.address, { value: U(4) });
    await pr.connect(bob).bet(0, 0, false, erin.address, { value: U(4) }); // bob is referred by erin
    await pr.connect(alice).bet(0, 0, false, alice.address, { value: U(2) }); // self-referral is ignored
    expect(await pr.referrerOf(erin.address)).to.equal(dave.address);
    expect(await pr.referrerOf(alice.address)).to.equal(Z);
    await trade(key, T.meme, false, E(5_000_000));
    await toBoundary(0, 1); await boundary();
    const id = await pr.roundOf(0, 0);
    expect((await pr.round(id)).result).to.equal(2n); // DOWN
    // pot 10, fee 0.2; referred stake: erin 4 (→ dave), bob 4 (→ erin) → each referrer 4·2%·25% = 0.02
    expect(await pr.refClaimable(id, dave.address)).to.equal(U(0.02));
    expect(await pr.refClaimable(id, erin.address)).to.equal(U(0.02));
    expect(await pr.feesOwed()).to.equal(U(0.16));
    await pr.connect(dave).claimRef([id]);
    expect(await pr.refEarned(dave.address)).to.equal(U(0.02));
    await expect(pr.connect(dave).claimRef([id])).to.be.revertedWithCustomError(pr, "NothingToClaim");
    // winners still get pot − full fee
    expect(await pr.claimable(id, bob.address)).to.equal((U(9.8) * 4n) / 6n);
    // a later referrer doesn't replace the first
    await pr.connect(erin).bet(0, await ep(), true, carol.address, { value: U(1) });
    expect(await pr.referrerOf(erin.address)).to.equal(dave.address);
  });

  it("a missed boundary: no price to beat → bets stop after its window, its rounds refund, sampling jumps ahead", async function () {
    await boundary();
    await pr.connect(alice).bet(0, 0, true, Z, { value: U(2) });
    await pr.connect(bob).bet(0, 0, false, Z, { value: U(2) });
    await toBoundary(0, 1);
    await pr.connect(carol).bet(0, 1, true, Z, { value: U(1) }); // within the window: fine
    await inc(130); // the keeper never came
    await expect(pr.connect(dave).bet(0, 1, true, Z, { value: U(1) })).to.be.revertedWithCustomError(pr, "NoPriceToBeat");
    await inc(20 * 60);
    expect(await pr.claimable(await pr.roundOf(0, 0), alice.address)).to.equal(U(2)); // refundable after GRACE
    expect(await pr.claimable(await pr.roundOf(0, 1), carol.address)).to.equal(U(1));
    await pr.connect(alice).claim([await pr.roundOf(0, 0)]);
    // the keeper comes back: it samples the current boundary, not the old ones
    const cur = Number(await pr.currentEpoch(0));
    await toBoundary(0, cur + 1);
    await boundary();
    expect((await pr.market(0)).next).to.equal(BigInt(cur + 2));
    expect(await pr.priceAt(0, cur + 1)).to.be.gt(0n);
    expect((await pr.round(await pr.roundOf(0, 0))).result).to.equal(0n); // never settled — stays refundable
    expect(await pr.claimable(await pr.roundOf(0, 0), bob.address)).to.equal(U(2));
  });

  it("one block's push doesn't decide it: the round closes on the median", async function () {
    await boundary();
    await pr.connect(alice).bet(0, 0, true, Z, { value: U(5) });
    await pr.connect(bob).bet(0, 0, false, Z, { value: U(5) });
    await toBoundary(0, 1);
    await pr.connect(op).sample([0]); await inc(3);
    const m0 = await meme.balanceOf(owner.address);
    await trade(key, T.meme, true, 50_000n * 10n ** 6n);
    const got = (await meme.balanceOf(owner.address)) - m0;
    await pr.connect(op).sample([0]); await inc(3);
    await trade(key, T.meme, false, got);
    await pr.connect(op).sample([0]);
    const s = await pr.samplesOf(0);
    await pr.settle([0]);
    const sorted = [...s].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(await pr.priceAt(0, 1)).to.equal(sorted[1]);
    expect(s[1] === sorted[0] || s[1] === sorted[2]).to.equal(true);
  });

  it("refunds without a fee: one side empty, no move, or settled after GRACE", async function () {
    await boundary();
    await pr.connect(alice).bet(0, 0, true, Z, { value: U(5) });
    await trade(key, T.meme, true, 20_000n * 10n ** 6n);
    await toBoundary(0, 1); await boundary();
    expect((await pr.round(await pr.roundOf(0, 0))).result).to.equal(3n);
    const e1 = await ep();
    await pr.connect(alice).bet(0, e1, true, Z, { value: U(2) });
    await pr.connect(bob).bet(0, e1, false, Z, { value: U(3) });
    await toBoundary(0, Number(e1) + 1); await boundary(); // no trades: same price
    expect((await pr.round(await pr.roundOf(0, e1))).result).to.equal(3n);
    expect(await pr.feesOwed()).to.equal(0n);
    // samples in time, settled 16 minutes late → refund
    const lockAt = Number(await pr.startAt(0, Number(e1) + 1)) + 270;
    await inc(lockAt - (await now()));
    const e2 = await ep();
    await pr.connect(alice).bet(0, e2, true, Z, { value: U(2) });
    await pr.connect(bob).bet(0, e2, false, Z, { value: U(3) });
    await trade(key, T.meme, true, 20_000n * 10n ** 6n);
    await toBoundary(0, Number(e2));
    await boundary(); // its start
    await toBoundary(0, Number(e2) + 1);
    for (let i = 0; i < 3; i++) { await pr.connect(op).sample([0]); await inc(3); }
    await inc(16 * 60);
    await pr.settle([0]);
    expect((await pr.round(await pr.roundOf(0, e2))).result).to.equal(3n);
  });

  it("stopping a market: its open round finishes, no bets after it, and the pool can be listed again", async function () {
    await boundary();
    await pr.connect(alice).bet(0, 0, true, Z, { value: U(2) });
    await pr.connect(op).stop(0);
    expect((await pr.market(0)).stopEpoch).to.equal(1n);
    const lockAt = Number(await pr.startAt(0, 1)) - 30;
    await inc(lockAt - (await now()));
    await expect(pr.connect(bob).bet(0, 1, true, Z, { value: U(1) })).to.be.revertedWithCustomError(pr, "NotOpen");
    await toBoundary(0, 1); await boundary();
    expect((await pr.round(await pr.roundOf(0, 0))).result).to.equal(3n); // one-sided
    expect((await pr.market(0)).next).to.equal(2n);
    await toBoundary(0, 2); await pr.connect(op).sample([0]);
    expect((await pr.samplesOf(0)).length).to.equal(0); // done
    await pr.connect(op).addMarket(key, 300, 0); // listed again
    expect(await pr.marketCount()).to.equal(2n);
  });

  it("fees reach the fee burn as ERC-20 USDC (dust stays owed), or as native USDC", async function () {
    await boundary();
    await pr.connect(alice).bet(0, 0, true, Z, { value: U(3.3) });
    await pr.connect(bob).bet(0, 0, false, Z, { value: U(1.7) });
    await trade(key, T.meme, true, 20_000n * 10n ** 6n);
    await toBoundary(0, 1); await boundary();
    expect(await pr.feesOwed()).to.equal(U(0.1));
    // on Arc the ERC-20 face holds the same USDC; here the test gives the contract the matching mock balance
    await usdc.transfer(await pr.getAddress(), 100_000n);
    await pr.payFees();
    expect(await usdc.balanceOf(fee.address)).to.equal(100_000n);
    expect(await pr.feesOwed()).to.equal(0n);
    await expect(pr.connect(alice).setFee(100, 0, alice.address, 1)).to.be.revertedWithCustomError(pr, "NotOwner");
    await expect(pr.setFee(400, 0, fee.address, 0)).to.be.revertedWithCustomError(pr, "BadLimits");
    await expect(pr.setFee(200, 6000, fee.address, 0)).to.be.revertedWithCustomError(pr, "BadLimits");
    await pr.setFee(200, 2500, carol.address, 1);
    const e1 = await ep();
    await pr.connect(alice).bet(0, e1, true, Z, { value: U(5) });
    await pr.connect(bob).bet(0, e1, false, Z, { value: U(5) });
    await trade(key, T.meme, true, 20_000n * 10n ** 6n);
    await toBoundary(0, Number(e1) + 1); await boundary();
    const c0 = await ethers.provider.getBalance(carol.address);
    await pr.connect(bob).payFees();
    expect((await ethers.provider.getBalance(carol.address)) - c0).to.equal(U(0.2));
  });
});
