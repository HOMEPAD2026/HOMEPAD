// ARCIRCLE Predict ×: multiplier bands on the real PoolManager
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const U = (n) => ethers.parseEther(String(n));
const E = U;
const MIN_SQRT = 4295128739n + 1n, MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;
function sqrtFor(p, tokenIs0) { const raw = tokenIs0 ? (p * 1e6) / 1e18 : 1 / ((p * 1e6) / 1e18); return BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n; }
const inc = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const Z = ethers.ZeroAddress;

describe("ArcPredictBands", function () {
  let pm, liq, sw, usdc, meme, arc, pr, owner, op, alice, bob, carol, dave, fee, T, key;
  const keyOf = (token, quote) => { const [c0, c1] = BigInt(token) < BigInt(quote) ? [token, quote] : [quote, token]; return { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: Z }; };
  async function trade(k, token, buy, amt) {
    const tokenIs0 = k.currency0 === token, zeroForOne = buy ? !tokenIs0 : tokenIs0;
    await sw.swap(k, { zeroForOne, amountSpecified: -amt, sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT }, { takeClaims: false, settleUsingBurn: false }, "0x");
  }
  async function boundary(ids = [0]) { for (let i = 0; i < 3; i++) { await pr.connect(op).sample(ids); await inc(3); } await pr.settle(ids); }
  async function toBoundary(m, b) { const t = Number(await pr.startAt(m, b)); const n = await now(); if (t > n) await inc(t - n); }
  const ep = (m = 0) => pr.bettingEpoch(m);
  beforeEach(async function () {
    [owner, op, alice, bob, carol, dave, fee] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    sw = await (await ethers.getContractFactory("PoolSwapTest")).deploy(await pm.getAddress());
    const Tok = await ethers.getContractFactory("TestToken");
    usdc = await Tok.deploy("USD Coin", "USDC", 6); meme = await Tok.deploy("Meme", "MEME", 18); arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 18);
    T = { usdc: await usdc.getAddress(), meme: await meme.getAddress(), arc: await arc.getAddress() };
    for (const t of [usdc, meme]) { await t.mint(owner.address, t === usdc ? 10_000_000n * 10n ** 6n : E(1e12)); await t.approve(await liq.getAddress(), ethers.MaxUint256); await t.approve(await sw.getAddress(), ethers.MaxUint256); }
    key = keyOf(T.meme, T.usdc);
    await pm.initialize(key, sqrtFor(0.0001, key.currency0 === T.meme));
    await liq.modifyLiquidity(key, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(5), salt: ethers.ZeroHash }, "0x");
    pr = await (await ethers.getContractFactory("ArcPredictBands")).deploy(await pm.getAddress(), T.usdc, T.arc, owner.address, op.address, fee.address);
    await pr.connect(op).addMarket(key, 300, 0, 0, [0, 0, 0]);
  });
  it("default bands for the length; custom bands must ascend", async () => {
    const b = await pr.bandsOf(0);
    expect(b.bands).to.equal(4n);
    expect(b.edges.map(Number)).to.deep.equal([-100, 0, 100]);
    expect((await pr.defaultEdges(3600)).map(Number)).to.deep.equal([-500, 0, 500]);
    await expect(pr.connect(op).addMarket(key, 900, 0, 3, [100, 50, 0])).to.be.revertedWithCustomError(pr, "BadBand");
    await pr.connect(op).addMarket(key, 900, 0, 2, [0, 0, 0]);
    expect((await pr.bandsOf(1)).bands).to.equal(2n);
  });
  it("moveBps reads the token's price either way round", async () => {
    const o = 2n ** 96n, up = (o * 1005n) / 1000n; // √ +0.5% → price ≈ +1.0025%
    expect(Number(await pr.moveBps(o, up, true))).to.equal(100);
    expect(Number(await pr.moveBps(o, up, false))).to.be.closeTo(-100, 1);
    expect(Number(await pr.moveBps(o, o, true))).to.equal(0);
  });
  it("a big pump pays the far band a multiple; others lose; fee and referral as in ArcPredict", async () => {
    await toBoundary(0, 1); await boundary(); // price to beat for round 1
    const e = await ep();
    await pr.connect(alice).bet(0, e, 4, Z, { value: U(1) });          // up more than 1%
    await pr.connect(bob).bet(0, e, 3, Z, { value: U(5) });            // up
    await pr.connect(carol).bet(0, e, 2, Z, { value: U(3) });          // down
    await pr.connect(dave).bet(0, e, 1, Z, { value: U(1) });           // down more than 1%
    await expect(pr.connect(alice).bet(0, e, 3, Z, { value: U(1) })).to.be.revertedWithCustomError(pr, "OtherSide");
    await expect(pr.connect(alice).bet(0, e, 5, Z, { value: U(1) })).to.be.revertedWithCustomError(pr, "BadBand");
    await toBoundary(0, Number(e)); await boundary();
    await trade(key, T.meme, true, 50_000n * 10n ** 6n); // a big buy: the price goes up a lot
    await toBoundary(0, Number(e) + 1); await boundary();
    const id = await pr.roundOf(0, e);
    const r = await pr.round(id);
    expect(Number(r.result)).to.equal(4);
    expect(Number(r.moveBps)).to.be.greaterThan(100);
    const pot = U(10), net = pot - (pot * 200n) / 10000n;
    expect(await pr.claimable(id, alice.address)).to.equal(net); // 1 USDC → 9.8 USDC: 9.8×
    expect(await pr.claimable(id, bob.address)).to.equal(0n);
    const b0 = await ethers.provider.getBalance(alice.address);
    const rc = await (await pr.connect(alice).claim([id])).wait();
    expect((await ethers.provider.getBalance(alice.address)) + rc.gasUsed * rc.gasPrice - b0).to.equal(net);
    expect(await pr.feesOwed()).to.equal((pot * 200n) / 10000n);
  });
  it("refunds: nobody on the winning band, everybody on it, or no move", async () => {
    await toBoundary(0, 1); await boundary();
    let e = await ep();
    await pr.connect(alice).bet(0, e, 1, Z, { value: U(1) });
    await pr.connect(bob).bet(0, e, 2, Z, { value: U(1) });
    await toBoundary(0, Number(e)); await boundary();
    await trade(key, T.meme, true, 50_000n * 10n ** 6n);
    await toBoundary(0, Number(e) + 1); await boundary();
    let id = await pr.roundOf(0, e);
    expect(Number((await pr.round(id)).result)).to.equal(255);
    expect(await pr.claimable(id, alice.address)).to.equal(U(1));
    // everybody on the winner: refund too
    e = await ep();
    await pr.connect(alice).bet(0, e, 3, Z, { value: U(1) });
    await pr.connect(bob).bet(0, e, 3, Z, { value: U(2) });
    await toBoundary(0, Number(e)); await boundary();
    await trade(key, T.meme, true, 20n * 10n ** 6n); // a small rise
    await toBoundary(0, Number(e) + 1); await boundary();
    id = await pr.roundOf(0, e);
    const r = await pr.round(id);
    expect(Number(r.moveBps)).to.be.within(1, 99); // it did land on band 3, everyone's band
    expect(Number(r.result)).to.equal(255);
    expect(await pr.claimable(id, bob.address)).to.equal(U(2));
  });
  it("a small rise lands in 'up'; the near band pays the losers' pot", async () => {
    await toBoundary(0, 1); await boundary();
    const e = await ep();
    await pr.connect(alice).bet(0, e, 3, Z, { value: U(2) });
    await pr.connect(bob).bet(0, e, 2, Z, { value: U(2) });
    await pr.connect(carol).bet(0, e, 4, Z, { value: U(1) });
    await toBoundary(0, Number(e)); await boundary();
    await trade(key, T.meme, true, 20n * 10n ** 6n);
    await toBoundary(0, Number(e) + 1); await boundary();
    const id = await pr.roundOf(0, e), r = await pr.round(id);
    expect(Number(r.result)).to.equal(3);
    expect(Number(r.moveBps)).to.be.within(1, 99);
    expect(await pr.claimable(id, alice.address)).to.equal(U(5) - (U(5) * 200n) / 10000n);
  });
});
