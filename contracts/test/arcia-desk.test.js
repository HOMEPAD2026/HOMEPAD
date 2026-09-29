// ArciaDesk against the real Uniswap v4 PoolManager, with an Argus-like tax hook (0x2044 permissions).
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const U = (n) => ethers.parseUnits(String(n), 6);
const E = (n) => ethers.parseEther(String(n));
const HOOK_ADDR = "0x0000000000000000000000000000000000012044"; // low 14 bits = 0x2044
const NOHOOK = ethers.ZeroAddress;

function sqrtFor(priceUsdPerToken, tokenIs0) {
  const raw = tokenIs0 ? (priceUsdPerToken * 1e6) / 1e18 : 1 / ((priceUsdPerToken * 1e6) / 1e18);
  const s = Math.sqrt(raw);
  // 2^96 * s, kept exact enough with BigInt
  return BigInt(Math.floor(s * 2 ** 48)) * 2n ** 48n;
}

describe("ArciaDesk", function () {
  let pm, liq, usdc, meme, arc, desk, owner, op, other, hookKey, arcKey, plainKey, meme2Key, T;
  const keyOf = (token, hooks) => {
    const [c0, c1] = BigInt(token) < BigInt(T.usdc) ? [token, T.usdc] : [T.usdc, token];
    return { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks };
  };
  async function pool(token, hooks, price) {
    const key = keyOf(token, hooks);
    await pm.initialize(key, sqrtFor(price, key.currency0 === token));
    await liq.modifyLiquidity(key, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(5), salt: ethers.ZeroHash }, "0x");
    return key;
  }
  const decodeErr = (e, name) => { const data = e.data || (e.error && e.error.data); return desk.interface.decodeErrorResult(name, data); };
  async function quoteBuy(key, amt) { try { await desk.quote.staticCall(key, true, amt); } catch (e) { return decodeErr(e, "QuoteResult")[0]; } throw new Error("no revert"); }
  async function quoteSell(key, amt) { try { await desk.quote.staticCall(key, false, amt); } catch (e) { return decodeErr(e, "QuoteResult")[0]; } throw new Error("no revert"); }
  async function roundTrip(key, amt) { try { await desk.quoteRoundTrip.staticCall(key, amt); } catch (e) { const r = decodeErr(e, "RoundTripResult"); return [r[0], r[1]]; } throw new Error("no revert"); }

  beforeEach(async function () {
    [owner, op, other] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    const Tok = await ethers.getContractFactory("TestToken");
    usdc = await Tok.deploy("USD Coin", "USDC", 6); meme = await Tok.deploy("Meme", "MEME", 18); arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 18);
    const meme2 = await Tok.deploy("Meme Two", "MEME2", 18);
    T = { usdc: await usdc.getAddress(), meme: await meme.getAddress(), arc: await arc.getAddress(), meme2: await meme2.getAddress() };
    for (const t of [usdc, meme, arc, meme2]) { await t.mint(owner.address, t === usdc ? U(10_000_000) : E(1e12)); await t.approve(await liq.getAddress(), ethers.MaxUint256); }
    // the 3% tax hook at an address with the Argus permission bits
    const hook = await (await ethers.getContractFactory("TaxHook")).deploy(await pm.getAddress(), 300);
    await network.provider.send("hardhat_setCode", [HOOK_ADDR, await ethers.provider.getCode(await hook.getAddress())]);
    hookKey = await pool(T.meme, HOOK_ADDR, 0.0001);
    arcKey = await pool(T.arc, HOOK_ADDR, 0.00005);
    plainKey = await pool(T.meme, NOHOOK, 0.0001);
    meme2Key = { currency0: T.meme < T.meme2 ? T.meme : T.meme2, currency1: T.meme < T.meme2 ? T.meme2 : T.meme, fee: 3000, tickSpacing: 60, hooks: HOOK_ADDR };
    desk = await (await ethers.getContractFactory("ArciaDesk")).deploy(await pm.getAddress(), T.usdc, T.arc, owner.address, op.address);
    await usdc.transfer(await desk.getAddress(), U(100));
  });

  it("quotes a buy, a sell and a round trip without holding anything", async function () {
    const empty = await (await ethers.getContractFactory("ArciaDesk")).deploy(await pm.getAddress(), T.usdc, T.arc, owner.address, op.address);
    const d2 = desk; desk = empty;
    const out = await quoteBuy(hookKey, U(5));
    expect(out).to.be.gt(0n);
    const [tok, back] = await roundTrip(hookKey, U(5));
    expect(tok).to.equal(out);
    expect(back).to.be.lt(U(5)); // pool fee twice + tax twice
    expect(back).to.be.gt(U(4.4));
    desk = d2;
  });

  it("buys and sells for the operator; the tax hook's cut shows in the amounts", async function () {
    const q = await quoteBuy(hookKey, U(5));
    await desk.connect(owner).setHookPattern(0, true);
    const qPlain = await quoteBuy(plainKey, U(5));
    await desk.connect(owner).setHookPattern(0, false);
    expect(q).to.be.lt(qPlain); // 3% tax on the output
    await expect(desk.connect(op).buy(hookKey, U(5), (q * 99n) / 100n)).to.emit(desk, "Trade");
    const held = await meme.balanceOf(await desk.getAddress());
    expect(held).to.equal(q);
    expect(await usdc.balanceOf(await desk.getAddress())).to.equal(U(95));
    const qs = await quoteSell(hookKey, held);
    await desk.connect(op).sell(hookKey, held, (qs * 99n) / 100n);
    expect(await meme.balanceOf(await desk.getAddress())).to.equal(0n);
    const bal = await usdc.balanceOf(await desk.getAddress());
    expect(bal).to.be.gt(U(99.4)).and.lt(U(100));
  });

  it("only the operator trades; only the owner changes settings and withdraws (to itself)", async function () {
    await expect(desk.connect(other).buy(hookKey, U(1), 0)).to.be.revertedWithCustomError(desk, "NotOperator");
    await expect(desk.connect(owner).buy(hookKey, U(1), 0)).to.be.revertedWithCustomError(desk, "NotOperator");
    await expect(desk.connect(op).withdraw(T.usdc, U(1))).to.be.revertedWithCustomError(desk, "NotOwner");
    await expect(desk.connect(op).setCaps(U(1000), U(1000), U(1000))).to.be.revertedWithCustomError(desk, "NotOwner");
    await expect(desk.connect(op).setOperator(other.address)).to.be.revertedWithCustomError(desk, "NotOwner");
    const before = await usdc.balanceOf(owner.address);
    await desk.connect(owner).withdraw(T.usdc, U(10));
    expect(await usdc.balanceOf(owner.address)).to.equal(before + U(10));
    await expect(desk.connect(op).unlockCallback("0x")).to.be.revertedWith("only pool manager");
  });

  it("caps each buy and each UTC day", async function () {
    await expect(desk.connect(op).buy(hookKey, U(12.000001), 0)).to.be.revertedWithCustomError(desk, "OverTradeCap");
    await desk.connect(owner).setCaps(U(12), U(20), U(5));
    await desk.connect(op).buy(hookKey, U(12), 0);
    await expect(desk.connect(op).buy(hookKey, U(9), 0)).to.be.revertedWithCustomError(desk, "OverDailyCap");
    await desk.connect(op).buy(hookKey, U(8), 0);
    // selling doesn't count toward the cap
    const held = await meme.balanceOf(await desk.getAddress());
    await desk.connect(op).sell(hookKey, held / 2n, 0);
    await network.provider.send("evm_increaseTime", [86400]); await network.provider.send("evm_mine", []);
    await desk.connect(op).buy(hookKey, U(12), 0); // a new day
  });

  it("pause stops buys, not sells", async function () {
    await desk.connect(op).buy(hookKey, U(5), 0);
    await desk.connect(owner).setPaused(true);
    await expect(desk.connect(op).buy(hookKey, U(1), 0)).to.be.revertedWithCustomError(desk, "IsPaused");
    const held = await meme.balanceOf(await desk.getAddress());
    await desk.connect(op).sell(hookKey, held, 0);
    expect(await meme.balanceOf(await desk.getAddress())).to.equal(0n);
  });

  it("only USDC pools with an approved hook pattern", async function () {
    await expect(desk.connect(op).buy(plainKey, U(1), 0)).to.be.revertedWithCustomError(desk, "HookNotAllowed");
    await expect(desk.connect(op).buy(meme2Key, U(1), 0)).to.be.revertedWithCustomError(desk, "NotUsdcPool");
    await desk.connect(owner).setHookPattern(0, true);
    await desk.connect(op).buy(plainKey, U(1), 0);
    await desk.connect(owner).setHookPattern(0x2044, false);
    await expect(desk.connect(op).buy(hookKey, U(1), 0)).to.be.revertedWithCustomError(desk, "HookNotAllowed");
  });

  it("refuses a fill below minOut", async function () {
    const q = await quoteBuy(hookKey, U(5));
    await expect(desk.connect(op).buy(hookKey, U(5), q + 1n)).to.be.revertedWithCustomError(desk, "Slippage");
    expect(await usdc.balanceOf(await desk.getAddress())).to.equal(U(100));
  });

  it("buyAndBurn sends $ARCIRCLE to 0x…dEaD, only through the $ARCIRCLE pool, within the burn cap", async function () {
    const q = await quoteBuy(arcKey, U(3));
    await expect(desk.connect(op).buyAndBurn(arcKey, U(3), (q * 99n) / 100n)).to.emit(desk, "Burned");
    expect(await arc.balanceOf("0x000000000000000000000000000000000000dEaD")).to.equal(q);
    expect(await arc.balanceOf(await desk.getAddress())).to.equal(0n);
    expect(await desk.arcircleBurned()).to.equal(q);
    await expect(desk.connect(op).buyAndBurn(hookKey, U(1), 0)).to.be.revertedWithCustomError(desk, "NotUsdcPool");
    await expect(desk.connect(op).buyAndBurn(arcKey, U(23), 0)).to.be.revertedWithCustomError(desk, "OverDailyCap");
    await expect(desk.connect(other).buyAndBurn(arcKey, U(1), 0)).to.be.revertedWithCustomError(desk, "NotOperator");
  });

  it("a new operator takes over; the old one can't trade", async function () {
    await desk.connect(owner).setOperator(other.address);
    await expect(desk.connect(op).buy(hookKey, U(1), 0)).to.be.revertedWithCustomError(desk, "NotOperator");
    await desk.connect(other).buy(hookKey, U(1), 0);
  });
});
