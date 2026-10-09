// ARCIRCLE Swap against the real Uniswap v4 PoolManager and the real ArcircleFeeBurn: multi-hop routes, the fee taken
// in $ARCIRCLE / USDC / the output, $ARCIRCLE fees burned in the same transaction, refunds, a hook's tax.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const U = (n) => ethers.parseUnits(String(n), 6);
const E = (n) => ethers.parseEther(String(n));
const HOOK_ADDR = "0x0000000000000000000000000000000000012044";
const GREEDY_ADDR = "0x0000000000000000000000000000000000022044"; // takes twice the output: the swapper ends up owing
const NOHOOK = ethers.ZeroAddress;
const ZERO32 = ethers.ZeroHash;
const DEAD = "0x000000000000000000000000000000000000dEaD";

function sqrtFor(priceUsdPerToken, tokenIs0) {
  const raw = tokenIs0 ? (priceUsdPerToken * 1e6) / 1e18 : 1 / ((priceUsdPerToken * 1e6) / 1e18);
  return BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n;
}

describe("ArcircleSwap", function () {
  let pm, liq, usdc, arc, meme, meme2, fb, sw, owner, alice, bob, keeper, treasury, T, kArc, kMeme, kMeme2, kTax;
  const keyOf = (a, b, hooks = NOHOOK) => {
    const [c0, c1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
    return { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks };
  };
  async function pool(token, price, hooks = NOHOOK, lo = -887220, hi = 887220, L = E(20)) {
    const k = keyOf(token, T.usdc, hooks);
    await pm.initialize(k, sqrtFor(price, k.currency0 === token));
    await liq.modifyLiquidity(k, { tickLower: lo, tickUpper: hi, liquidityDelta: L, salt: ZERO32 }, "0x");
    return k;
  }
  async function quote(path, tokenIn, amt, payer = alice.address) {
    try { await sw.quote.staticCall(path, tokenIn, amt, payer); } catch (e) {
      const r = sw.interface.decodeErrorResult("QuoteResult", e.data);
      return { out: r[0], fee: r[1], feeAt: Number(r[2]) };
    }
    throw new Error("no revert");
  }
  const bal = (t, a) => t.balanceOf(a);

  beforeEach(async function () {
    [owner, alice, bob, keeper, treasury] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    const Tok = await ethers.getContractFactory("TestToken");
    usdc = await Tok.deploy("USD Coin", "USDC", 6); arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 18);
    meme = await Tok.deploy("Meme", "MEME", 18); meme2 = await Tok.deploy("Meme Two", "MEME2", 18);
    T = { usdc: await usdc.getAddress(), arc: await arc.getAddress(), meme: await meme.getAddress(), meme2: await meme2.getAddress() };
    for (const t of [usdc, arc, meme, meme2]) {
      await t.mint(owner.address, t === usdc ? U(100_000_000) : E(1e13));
      await t.approve(await liq.getAddress(), ethers.MaxUint256);
    }
    const hook = await (await ethers.getContractFactory("TaxHook")).deploy(await pm.getAddress(), 300);
    await network.provider.send("hardhat_setCode", [HOOK_ADDR, await ethers.provider.getCode(await hook.getAddress())]);
    const greedy = await (await ethers.getContractFactory("TaxHook")).deploy(await pm.getAddress(), 20000);
    await network.provider.send("hardhat_setCode", [GREEDY_ADDR, await ethers.provider.getCode(await greedy.getAddress())]);
    kArc = await pool(T.arc, 0.001); // $ARCIRCLE at $0.001
    kMeme = await pool(T.meme, 0.0001);
    kMeme2 = await pool(T.meme2, 0.0002);
    kTax = await pool(T.meme, 0.0001, HOOK_ADDR);
    // the real fee burn: 50% burned, the rest to the treasury; fee-free from 100,000 $ARCIRCLE
    fb = await (await ethers.getContractFactory("ArcircleFeeBurn")).deploy(await pm.getAddress(), T.usdc, T.arc, treasury.address, 5000, kArc, keeper.address, E(100_000));
    sw = await (await ethers.getContractFactory("ArcircleSwap")).deploy(await pm.getAddress(), T.usdc, T.arc, await fb.getAddress(), await fb.getAddress(), 10);
    for (const s of [alice, bob]) {
      await usdc.mint(s.address, U(10_000)); await arc.mint(s.address, E(50_000)); await meme.mint(s.address, E(10_000_000));
      for (const t of [usdc, arc, meme, meme2]) await t.connect(s).approve(await sw.getAddress(), ethers.MaxUint256);
    }
  });

  it("refuses a fee above 0.3% and zero addresses", async function () {
    const F = await ethers.getContractFactory("ArcircleSwap");
    await expect(F.deploy(await pm.getAddress(), T.usdc, T.arc, treasury.address, ethers.ZeroAddress, 31)).to.be.revertedWithCustomError(F, "BadFee");
    await expect(F.deploy(await pm.getAddress(), T.usdc, ethers.ZeroAddress, treasury.address, ethers.ZeroAddress, 10)).to.be.revertedWithCustomError(F, "ZeroAddress");
  });

  it("names a route's tokens and where its fee is taken", async function () {
    let r = await sw.routeOf([kArc, kMeme], T.arc);
    expect(r[0]).to.deep.equal([T.arc, T.usdc, T.meme]); expect(r[1]).to.equal(0n); // $ARCIRCLE first
    r = await sw.routeOf([kMeme, kArc], T.meme);
    expect(r[0]).to.deep.equal([T.meme, T.usdc, T.arc]); expect(r[1]).to.equal(2n);
    r = await sw.routeOf([kMeme, kMeme2], T.meme);
    expect(r[0]).to.deep.equal([T.meme, T.usdc, T.meme2]); expect(r[1]).to.equal(1n); // USDC in the middle
    await expect(sw.routeOf([kMeme], T.arc)).to.be.revertedWithCustomError(sw, "BadPath");
    await expect(sw.routeOf([kMeme, kTax], T.meme)).to.be.revertedWithCustomError(sw, "BadPath"); // MEME twice
    await expect(sw.routeOf([], T.meme)).to.be.revertedWithCustomError(sw, "BadPath");
    await expect(sw.routeOf([kMeme, kArc, kMeme2, kMeme], T.meme)).to.be.revertedWithCustomError(sw, "BadPath");
    const nat = { currency0: ethers.ZeroAddress, currency1: T.meme, fee: 3000, tickSpacing: 60, hooks: NOHOOK };
    await expect(sw.routeOf([nat], T.meme)).to.be.revertedWithCustomError(sw, "NativeNotSupported");
  });

  it("pays with $ARCIRCLE: $ARCIRCLE → USDC → MEME; the fee is $ARCIRCLE and half of it burns in the same transaction", async function () {
    const path = [kArc, kMeme];
    const q = await quote(path, T.arc, E(10_000));
    expect(q.feeAt).to.equal(0); expect(q.fee).to.equal(E(10)); // 0.1% of 10,000
    expect(q.out).to.be.gt(E(80_000)).and.lt(E(100_000)); // ~$10 of MEME at $0.0001
    const a0 = await bal(arc, alice.address), m0 = await bal(meme, alice.address), d0 = await bal(arc, DEAD), t0 = await bal(arc, treasury.address);
    await expect(sw.connect(alice).swap(path, T.arc, E(10_000), q.out, ethers.ZeroAddress, 0)).to.emit(sw, "Swapped")
      .withArgs(alice.address, T.arc, T.meme, E(10_000), q.out, T.arc, E(10), 2, alice.address);
    expect(a0 - (await bal(arc, alice.address))).to.equal(E(10_000));
    expect((await bal(meme, alice.address)) - m0).to.equal(q.out);
    expect((await bal(arc, DEAD)) - d0).to.equal(E(5)); // burned at once
    expect((await bal(arc, treasury.address)) - t0).to.equal(E(5));
    expect(await sw.flushes()).to.equal(1n); expect(await sw.swaps()).to.equal(1n); expect(await sw.feesIn(T.arc)).to.equal(E(10));
    for (const t of [arc, usdc, meme]) expect(await bal(t, await sw.getAddress())).to.equal(0n);
  });

  it("sells a coin for $ARCIRCLE: MEME → USDC → $ARCIRCLE, the fee taken from the $ARCIRCLE received", async function () {
    const path = [kMeme, kArc];
    const q = await quote(path, T.meme, E(1_000_000));
    expect(q.feeAt).to.equal(2);
    const a0 = await bal(arc, bob.address), d0 = await bal(arc, DEAD);
    await sw.connect(bob).swap(path, T.meme, E(1_000_000), q.out, ethers.ZeroAddress, 0);
    expect((await bal(arc, bob.address)) - a0).to.equal(q.out);
    expect(q.fee).to.equal(((q.out + q.fee) * 10n) / 10000n);
    expect((await bal(arc, DEAD)) - d0).to.equal(q.fee / 2n);
  });

  it("buys with USDC in one pool; the USDC fee waits in the fee burn for its hourly burn", async function () {
    const q = await quote([kMeme], T.usdc, U(100));
    expect(q.feeAt).to.equal(0); expect(q.fee).to.equal(U(0.1));
    const f0 = await bal(usdc, await fb.getAddress());
    await sw.connect(alice).swap([kMeme], T.usdc, U(100), q.out, bob.address, 0); // to someone else
    expect(await bal(meme, bob.address)).to.equal(E(10_000_000) + q.out);
    expect((await bal(usdc, await fb.getAddress())) - f0).to.equal(U(0.1));
    const d0 = await bal(arc, DEAD);
    await fb.connect(keeper).burn(0); // the keeper's hourly burn: half buys $ARCIRCLE and burns it
    expect(await bal(arc, DEAD)).to.be.gt(d0);
  });

  it("coin to coin through USDC: the fee is taken in the middle, in USDC", async function () {
    const path = [kMeme, kMeme2];
    const q = await quote(path, T.meme, E(500_000));
    expect(q.feeAt).to.equal(1);
    expect(q.fee).to.be.gt(U(0.04)).and.lt(U(0.06)); // 0.1% of ~$50
    const f0 = await bal(usdc, await fb.getAddress()), m0 = await bal(meme2, alice.address);
    await sw.connect(alice).swap(path, T.meme, E(500_000), q.out, ethers.ZeroAddress, 0);
    expect((await bal(usdc, await fb.getAddress())) - f0).to.equal(q.fee);
    expect((await bal(meme2, alice.address)) - m0).to.equal(q.out);
    for (const t of [usdc, meme, meme2]) expect(await bal(t, await sw.getAddress())).to.equal(0n);
  });

  it("holders of enough $ARCIRCLE swap fee-free", async function () {
    await arc.mint(bob.address, E(100_000));
    const q = await quote([kMeme], T.usdc, U(100), bob.address);
    expect(q.fee).to.equal(0n);
    const f0 = await bal(usdc, await fb.getAddress());
    await sw.connect(bob).swap([kMeme], T.usdc, U(100), q.out, ethers.ZeroAddress, 0);
    expect(await bal(usdc, await fb.getAddress())).to.equal(f0);
  });

  it("guards the price and the deadline", async function () {
    const q = await quote([kArc, kMeme], T.arc, E(1_000));
    await expect(sw.connect(alice).swap([kArc, kMeme], T.arc, E(1_000), q.out + 1n, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(sw, "Slippage");
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    await expect(sw.connect(alice).swap([kArc, kMeme], T.arc, E(1_000), 0, ethers.ZeroAddress, now - 1)).to.be.revertedWithCustomError(sw, "Expired");
    await expect(sw.connect(alice).swap([kArc, kMeme], T.arc, 0, 0, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(sw, "BadPath");
    // someone moved the price between the quote and the swap
    await sw.connect(bob).swap([kArc, kMeme], T.arc, E(40_000), 0, ethers.ZeroAddress, 0);
    await expect(sw.connect(alice).swap([kArc, kMeme], T.arc, E(1_000), q.out, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(sw, "Slippage");
  });

  it("works through a pool whose hook takes a tax", async function () {
    const q = await quote([kTax, kArc], T.meme, E(100_000));
    const plain = await quote([kMeme, kArc], T.meme, E(100_000));
    expect(q.out).to.be.lt(plain.out); // the hook's 3% is in the quote
    const a0 = await bal(arc, alice.address);
    await sw.connect(alice).swap([kTax, kArc], T.meme, E(100_000), q.out, ethers.ZeroAddress, 0);
    expect((await bal(arc, alice.address)) - a0).to.equal(q.out);
  });

  it("returns what a thin pool couldn't use", async function () {
    // a pool with its liquidity only between two ticks near the price: a big sell runs through all of it
    const thin = await (await ethers.getContractFactory("TestToken")).deploy("Thin", "THIN", 18);
    const tt = await thin.getAddress();
    await thin.mint(owner.address, E(1e13)); await thin.approve(await liq.getAddress(), ethers.MaxUint256);
    await thin.mint(alice.address, E(1e12)); await thin.connect(alice).approve(await sw.getAddress(), ethers.MaxUint256);
    const k = keyOf(tt, T.usdc);
    const sp = sqrtFor(0.0001, k.currency0 === tt);
    await pm.initialize(k, sp);
    const tick = Math.floor(Math.log(Number(sp) ** 2 / 2 ** 192) / Math.log(1.0001) / 60) * 60;
    await liq.modifyLiquidity(k, { tickLower: tick - 600, tickUpper: tick + 600, liquidityDelta: E(1), salt: ZERO32 }, "0x");
    const t0 = await bal(thin, alice.address);
    await sw.connect(alice).swap([k], tt, E(1e11), 0, ethers.ZeroAddress, 0);
    const spent = t0 - (await bal(thin, alice.address));
    expect(spent).to.be.gt(0n).and.lt(E(1e11)); // the rest came back
    expect(await bal(thin, await sw.getAddress())).to.equal(0n);
  });

  it("three pools: MEME → USDC → $ARCIRCLE → a coin paired with $ARCIRCLE, the fee in $ARCIRCLE in the middle", async function () {
    const k = keyOf(T.meme2, T.arc);
    await pm.initialize(k, 79228162514264337593543950336n); // 1 MEME2 = 1 $ARCIRCLE
    await liq.modifyLiquidity(k, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(1_000_000), salt: ZERO32 }, "0x");
    const path = [kMeme, kArc, k];
    const q = await quote(path, T.meme, E(1_000_000));
    expect(q.feeAt).to.equal(2);
    const m0 = await bal(meme2, alice.address), d0 = await bal(arc, DEAD);
    await expect(sw.connect(alice).swap(path, T.meme, E(1_000_000), q.out, ethers.ZeroAddress, 0)).to.emit(sw, "Swapped").withArgs(alice.address, T.meme, T.meme2, E(1_000_000), q.out, T.arc, q.fee, 3, alice.address);
    expect((await bal(meme2, alice.address)) - m0).to.equal(q.out);
    expect((await bal(arc, DEAD)) - d0).to.equal(q.fee / 2n);
    for (const t of [arc, usdc, meme, meme2]) expect(await bal(t, await sw.getAddress())).to.equal(0n);
  });

  it("decides fee-free before taking the input: paying with $ARCIRCLE at exactly the threshold stays free", async function () {
    await arc.mint(bob.address, E(100_000) - (await bal(arc, bob.address)));
    expect(await bal(arc, bob.address)).to.equal(E(100_000));
    const q = await quote([kArc, kMeme], T.arc, E(1_000), bob.address);
    expect(q.fee).to.equal(0n);
    const d0 = await bal(arc, DEAD);
    await sw.connect(bob).swap([kArc, kMeme], T.arc, E(1_000), q.out, ethers.ZeroAddress, 0);
    expect(await bal(arc, DEAD)).to.equal(d0);
  });

  it("a hook that leaves the swapper owing can't make the router pay it from stray tokens", async function () {
    const k = await pool(T.meme, 0.0001, GREEDY_ADDR);
    await usdc.mint(await sw.getAddress(), U(500)); // someone sent USDC here by mistake
    await expect(sw.connect(alice).swap([k], T.meme, E(100_000), 0, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(sw, "NoOutput");
    expect(await bal(usdc, await sw.getAddress())).to.equal(U(500));
    // stray tokens go to the fee burn, never to a swapper
    await sw.connect(bob).swap([kMeme], T.usdc, U(10), 0, ethers.ZeroAddress, 0);
    expect(await bal(usdc, await sw.getAddress())).to.equal(U(500));
    const f0 = await bal(usdc, await fb.getAddress());
    await sw.sweep(T.usdc);
    expect((await bal(usdc, await fb.getAddress())) - f0).to.equal(U(500));
    expect(await bal(usdc, await sw.getAddress())).to.equal(0n);
  });

  it("can't be called back into, and only the PoolManager runs the route", async function () {
    await expect(sw.unlockCallback("0x")).to.be.revertedWith("only pool manager");
  });
});
