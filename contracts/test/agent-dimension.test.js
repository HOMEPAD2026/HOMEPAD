// AGENT DIMENSION trading vaults against the real Uniswap v4 PoolManager (a plain pool and an Argus-like tax hook).
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const U = (n) => ethers.parseUnits(String(n), 6);
const E = (n) => ethers.parseEther(String(n));
const HOOK_ADDR = "0x0000000000000000000000000000000000012044";
function sqrtFor(p, tokenIs0) { const raw = tokenIs0 ? (p * 1e6) / 1e18 : 1 / ((p * 1e6) / 1e18); return BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n; }
const inc = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };

describe("AgentDimension", function () {
  let pm, liq, usdc, meme, pepe, arc, fac, owner, op, alice, bob, feeTo, T, memeKey, pepeKey;
  const FEE = E(10);
  const keyOf = (token, hooks) => { const [c0, c1] = BigInt(token) < BigInt(T.usdc) ? [token, T.usdc] : [T.usdc, token]; return { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks }; };
  async function pool(token, hooks, price) {
    const key = keyOf(token, hooks);
    await pm.initialize(key, sqrtFor(price, key.currency0 === token));
    await liq.modifyLiquidity(key, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(200), salt: ethers.ZeroHash }, "0x");
    return key;
  }
  async function open(who, max = U(100), day = U(300), cd = 300) {
    await fac.connect(who).createVault(max, day, cd);
    return ethers.getContractAt("AgentDimensionVault", await fac.vaultOf(who.address));
  }
  // a vault with USDC and $ARCIRCLE for fees, allowed to trade MEME
  async function ready(who = alice, ...lim) {
    const v = await open(who, ...lim), a = await v.getAddress();
    await usdc.connect(who).transfer(a, U(500)); await arc.connect(who).transfer(a, E(1000));
    await v.connect(who).allowToken(T.meme);
    return v;
  }
  async function quote(v, token, buy, amt) { try { await v.quote.staticCall(token, buy, amt); } catch (e) { return v.interface.decodeErrorResult("QuoteResult", e.data || (e.error && e.error.data))[0]; } throw new Error("no revert"); }

  beforeEach(async function () {
    [owner, op, alice, bob, feeTo] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    const Tok = await ethers.getContractFactory("TestToken");
    usdc = await Tok.deploy("USD Coin", "USDC", 6); meme = await Tok.deploy("Meme", "MEME", 18); pepe = await Tok.deploy("Pepe", "PEPE", 18); arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 18);
    T = { usdc: await usdc.getAddress(), meme: await meme.getAddress(), pepe: await pepe.getAddress(), arc: await arc.getAddress() };
    for (const t of [usdc, meme, pepe, arc]) { await t.mint(owner.address, t === usdc ? U(100_000_000) : E(1e13)); await t.approve(await liq.getAddress(), ethers.MaxUint256); }
    for (const w of [alice, bob]) { await usdc.mint(w.address, U(5000)); await arc.mint(w.address, E(1_000_000)); await meme.mint(w.address, E(10_000_000)); }
    const hook = await (await ethers.getContractFactory("TaxHook")).deploy(await pm.getAddress(), 300);
    await network.provider.send("hardhat_setCode", [HOOK_ADDR, await ethers.provider.getCode(await hook.getAddress())]);
    memeKey = await pool(T.meme, ethers.ZeroAddress, 0.0001);
    pepeKey = await pool(T.pepe, HOOK_ADDR, 0.0001);
    fac = await (await ethers.getContractFactory("AgentDimensionFactory")).deploy(await pm.getAddress(), T.usdc, T.arc, owner.address, op.address, feeTo.address, FEE);
    await fac.listPool(memeKey); await fac.listPool(pepeKey);
  });

  it("one vault per player; limits can't go over 100 USDC a trade", async function () {
    const v = await open(alice);
    expect(await v.owner()).to.equal(alice.address);
    expect(await v.MAX_PER_TX()).to.equal(U(100));
    expect(await v.operator()).to.equal(op.address);
    await expect(fac.connect(alice).createVault(U(10), U(20), 300)).to.be.revertedWithCustomError(fac, "HasVault");
    await expect(fac.connect(bob).createVault(U(100.000001), U(300), 300)).to.be.revertedWithCustomError(v, "BadLimits");
    await expect(fac.connect(bob).createVault(0, U(300), 300)).to.be.revertedWithCustomError(v, "BadLimits");
    await expect(fac.connect(bob).createVault(U(50), U(40), 300)).to.be.revertedWithCustomError(v, "BadLimits");
    await expect(fac.connect(bob).createVault(U(50), U(100), 30)).to.be.revertedWithCustomError(v, "BadLimits");
    await expect(v.connect(alice).setLimits(U(101), U(500), 300)).to.be.revertedWithCustomError(v, "BadLimits");
    expect(await fac.vaultCount()).to.equal(1n);
  });

  it("the team lists only live USDC pools with an accepted hook; the owner picks the tokens", async function () {
    const memeArc = { currency0: T.meme < T.arc ? T.meme : T.arc, currency1: T.meme < T.arc ? T.arc : T.meme, fee: 3000, tickSpacing: 60, hooks: ethers.ZeroAddress };
    await expect(fac.listPool(memeArc)).to.be.revertedWithCustomError(fac, "NotUsdcPool");
    await expect(fac.listPool({ ...memeKey, hooks: "0x0000000000000000000000000000000000014444" })).to.be.revertedWithCustomError(fac, "HookNotAllowed");
    await expect(fac.listPool({ ...memeKey, fee: 500, tickSpacing: 10 })).to.be.revertedWithCustomError(fac, "PoolNotLive");
    await expect(fac.connect(alice).listPool(memeKey)).to.be.revertedWithCustomError(fac, "NotOwner");
    const v = await open(alice);
    await expect(v.connect(bob).allowToken(T.meme)).to.be.revertedWithCustomError(v, "NotOwner");
    await expect(v.connect(alice).allowToken(T.arc)).to.be.revertedWithCustomError(fac, "NotListed");
    await v.connect(alice).allowToken(T.meme);
    expect(await v.tokens()).to.deep.equal([T.meme]);
    await expect(v.connect(op).trade(T.pepe, true, U(1), 1)).to.be.revertedWithCustomError(v, "NotAllowed");
  });

  it("a buy: USDC in (≤ 100), the token stays in the vault, the fee goes to feeTo in $ARCIRCLE", async function () {
    const v = await ready(), a = await v.getAddress();
    const q = await quote(v, T.meme, true, U(100));
    expect(q).to.be.gt(0n);
    const f0 = await arc.balanceOf(feeTo.address);
    await expect(v.connect(op).trade(T.meme, true, U(100), (q * 99n) / 100n)).to.emit(v, "Traded");
    expect(await meme.balanceOf(a)).to.equal(q);
    expect(await usdc.balanceOf(a)).to.equal(U(400));
    expect((await arc.balanceOf(feeTo.address)) - f0).to.equal(FEE);
    expect(await arc.balanceOf(a)).to.equal(E(990));
    expect(await v.totalVolume()).to.equal(U(100));
    expect(await v.totalFees()).to.equal(FEE);
    expect(await v.trades()).to.equal(1n);
    await inc(301);
    await expect(v.connect(op).trade(T.meme, true, U(100.000001), 1)).to.be.revertedWithCustomError(v, "OverMaxPerTx");
  });

  it("a sell: the token in, USDC back to the vault; a sell worth more than the cap is refused", async function () {
    const v = await ready(), a = await v.getAddress();
    await meme.connect(alice).transfer(a, E(3_000_000)); // ~300 USDC of MEME
    await expect(v.connect(op).trade(T.meme, false, E(3_000_000), 1)).to.be.revertedWithCustomError(v, "OverMaxPerTx");
    const q = await quote(v, T.meme, false, E(500_000));
    const u0 = await usdc.balanceOf(a);
    await v.connect(op).trade(T.meme, false, E(500_000), q);
    expect((await usdc.balanceOf(a)) - u0).to.equal(q);
    expect(await v.totalVolume()).to.equal(q);
  });

  it("trades through a tax-hook pool too", async function () {
    const v = await ready(); await v.connect(alice).allowToken(T.pepe);
    const q = await quote(v, T.pepe, true, U(20));
    await v.connect(op).trade(T.pepe, true, U(20), q);
    expect(await pepe.balanceOf(await v.getAddress())).to.equal(q);
  });

  it("no $ARCIRCLE for the fee: no trade; a fee of 0 needs none", async function () {
    const v = await open(alice), a = await v.getAddress();
    await usdc.connect(alice).transfer(a, U(50)); await v.connect(alice).allowToken(T.meme);
    await expect(v.connect(op).trade(T.meme, true, U(5), 1)).to.be.revertedWithCustomError(v, "NoFeeBalance");
    await fac.setTradeFee(0);
    await v.connect(op).trade(T.meme, true, U(5), 1);
  });

  it("only the agent's key trades; slippage, the owner turning it off, pauses", async function () {
    const v = await ready();
    await expect(v.connect(alice).trade(T.meme, true, U(1), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await expect(v.connect(bob).trade(T.meme, true, U(1), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    const q = await quote(v, T.meme, true, U(1));
    await expect(v.connect(op).trade(T.meme, true, U(1), q + 1n)).to.be.revertedWithCustomError(v, "Slippage");
    await expect(v.connect(op).trade(T.meme, true, U(1), 0)).to.be.revertedWithCustomError(v, "ZeroMinOut");
    await v.connect(alice).setAgentOn(false);
    await expect(v.connect(op).trade(T.meme, true, U(1), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await v.connect(alice).setAgentOn(true);
    await v.connect(alice).setPaused(true);
    await expect(v.connect(op).trade(T.meme, true, U(1), 1)).to.be.revertedWithCustomError(v, "IsPaused");
    await v.connect(alice).setPaused(false);
    await fac.setPaused(true);
    await expect(v.connect(op).trade(T.meme, true, U(1), 1)).to.be.revertedWithCustomError(v, "IsPaused");
    await fac.setPaused(false);
    await v.connect(alice).disallowToken(T.meme);
    await expect(v.connect(op).trade(T.meme, true, U(1), 1)).to.be.revertedWithCustomError(v, "NotAllowed");
    await v.connect(alice).allowToken(T.meme);
    await v.connect(op).trade(T.meme, true, U(1), 1);
    expect(await v.tokens()).to.deep.equal([T.meme]); // allowed again: listed once
  });

  it("cooldown and the daily cap (buys and sells together)", async function () {
    const v = await ready(alice, U(50), U(120), 300);
    await v.connect(op).trade(T.meme, true, U(50), 1);
    await expect(v.connect(op).trade(T.meme, true, U(10), 1)).to.be.revertedWithCustomError(v, "Cooldown");
    await inc(301); await v.connect(op).trade(T.meme, true, U(50), 1);
    await inc(301);
    expect(await v.spendableToday()).to.equal(U(20));
    await expect(v.connect(op).trade(T.meme, true, U(30), 1)).to.be.revertedWithCustomError(v, "OverDailyCap");
    await v.connect(op).trade(T.meme, true, U(20), 1);
    await inc(86400);
    await v.connect(op).trade(T.meme, true, U(50), 1); // a new UTC day
  });

  it("limits: tighter now, looser after an hour", async function () {
    const v = await open(alice, U(50), U(200), 300);
    await v.connect(alice).setLimits(U(20), U(100), 600);
    expect(await v.maxPerTx()).to.equal(U(20));
    await expect(v.connect(alice).setLimits(U(100), U(1000), 60)).to.emit(v, "LimitsQueued");
    expect(await v.maxPerTx()).to.equal(U(20));
    await expect(v.connect(bob).applyLimits()).to.be.revertedWithCustomError(v, "NotReady");
    await inc(3601); await v.connect(bob).applyLimits();
    expect(await v.maxPerTx()).to.equal(U(100));
    expect(await v.dailyCap()).to.equal(U(1000));
  });

  it("money out only to the owner — never to the agent, the team or anyone else", async function () {
    const v = await ready(), a = await v.getAddress();
    await v.connect(op).trade(T.meme, true, U(10), 1);
    await expect(v.connect(op).withdraw(T.usdc, 1)).to.be.revertedWithCustomError(v, "NotOwner");
    await expect(v.connect(owner).withdraw(T.usdc, 1)).to.be.revertedWithCustomError(v, "NotOwner");
    await fac.setPaused(true);
    const m = await meme.balanceOf(a), u0 = await usdc.balanceOf(alice.address);
    await v.connect(alice).withdraw(T.meme, m); await v.connect(alice).withdraw(T.usdc, U(490));
    expect((await usdc.balanceOf(alice.address)) - u0).to.equal(U(490));
    expect(await meme.balanceOf(a)).to.equal(0n);
  });

  it("the team: a new agent key and a higher fee wait 24 hours; a lower fee is at once", async function () {
    await expect(fac.connect(alice).queueOperator(bob.address)).to.be.revertedWithCustomError(fac, "NotOwner");
    await fac.queueOperator(bob.address);
    await expect(fac.applyOperator()).to.be.revertedWithCustomError(fac, "NotReady");
    await inc(86401); await fac.connect(alice).applyOperator();
    expect(await fac.operator()).to.equal(bob.address);
    await fac.setTradeFee(E(50));
    expect(await fac.tradeFee()).to.equal(FEE);
    await expect(fac.applyFee()).to.be.revertedWithCustomError(fac, "NotReady");
    await inc(86401); await fac.applyFee();
    expect(await fac.tradeFee()).to.equal(E(50));
    await fac.setTradeFee(E(5));
    expect(await fac.tradeFee()).to.equal(E(5));
    await expect(fac.connect(alice).setFeeTo(alice.address)).to.be.revertedWithCustomError(fac, "NotOwner");
  });
});
