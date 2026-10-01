// ARCIRCLE Orders on an ETH chain (Robinhood Chain): ArcircleOrdersNative and ArcircleFeeBurnNative against the real
// Uniswap v4 PoolManager, with pools paired with native ETH (currency 0x0) and with WETH.
const { expect } = require("chai");
const { ethers } = require("hardhat");

const E = (n) => ethers.parseEther(String(n));
const ZERO32 = ethers.ZeroHash;
const ETH = ethers.ZeroAddress;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const MIN_P = 4295128740n;
const MAX_P = 1461446703485210103287273052203988822378723970341n;
const TYPES = { Order: [
  { name: "maker", type: "address" }, { name: "sell", type: "address" }, { name: "buy", type: "address" },
  { name: "sellAmount", type: "uint256" }, { name: "buyAmount", type: "uint256" }, { name: "triggerSqrtP", type: "uint160" },
  { name: "triggerBelow", type: "bool" }, { name: "poolId", type: "bytes32" }, { name: "expiry", type: "uint64" },
  { name: "start", type: "uint64" }, { name: "duration", type: "uint32" }, { name: "group", type: "uint256" },
  { name: "epoch", type: "uint32" }, { name: "salt", type: "uint256" },
] };
const poolIdOf = (k) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
// 1 token = 0.0001 ETH, both 18 decimals
const sqrtFor = (tokenIs0) => (tokenIs0 ? 2n ** 96n / 100n : 100n * 2n ** 96n);

describe("ArcircleOrdersNative", function () {
  let pm, liq, swp, weth, meme, ob, owner, alice, bob, keeper, treasury, T, nkey, wkey, domain;
  let salt = 1n;
  async function sign(maker, o) {
    const order = { maker: maker.address, triggerSqrtP: 0n, triggerBelow: false, poolId: ZERO32, expiry: 0n, start: 0n, duration: 0, group: 0n, epoch: 0, salt: salt++, ...o };
    return { order, sig: await maker.signTypedData(domain, TYPES, order) };
  }
  async function quote(k, sell, amt) {
    try { await ob.quote.staticCall(k, sell, amt); } catch (e) { return ob.interface.decodeErrorResult("QuoteResult", e.data)[0]; }
    throw new Error("no revert");
  }
  // the pool's own price moves: someone buys the token with native ETH, or sells it for ETH
  const buyToken = (eth) => swp.swap(nkey, { zeroForOne: true, amountSpecified: -eth, sqrtPriceLimitX96: MIN_P }, { takeClaims: false, settleUsingBurn: false }, "0x", { value: eth });
  const sellToken = (amt) => swp.swap(nkey, { zeroForOne: false, amountSpecified: -amt, sqrtPriceLimitX96: MAX_P }, { takeClaims: false, settleUsingBurn: false }, "0x");

  beforeEach(async function () {
    [owner, alice, bob, keeper, treasury] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    swp = await (await ethers.getContractFactory("PoolSwapTest")).deploy(await pm.getAddress());
    weth = await (await ethers.getContractFactory("MockWETH")).deploy();
    meme = await (await ethers.getContractFactory("TestToken")).deploy("Meme", "MEME", 18);
    T = { weth: await weth.getAddress(), meme: await meme.getAddress() };
    await meme.mint(owner.address, E(1e12));
    await weth.deposit({ value: E(1000) });
    for (const t of [meme, weth]) { await t.approve(await liq.getAddress(), ethers.MaxUint256); await t.approve(await swp.getAddress(), ethers.MaxUint256); }
    // the native ETH pool, like the $ARCIRCLE / ETH pool on Robinhood Chain
    nkey = { currency0: ETH, currency1: T.meme, fee: 3000, tickSpacing: 60, hooks: ETH };
    await pm.initialize(nkey, sqrtFor(false));
    await liq.modifyLiquidity(nkey, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(1000), salt: ZERO32 }, "0x", { value: E(20) });
    // and a WETH pool of the same token
    const wIs0 = BigInt(T.weth) < BigInt(T.meme);
    wkey = { currency0: wIs0 ? T.weth : T.meme, currency1: wIs0 ? T.meme : T.weth, fee: 3000, tickSpacing: 60, hooks: ETH };
    await pm.initialize(wkey, sqrtFor(!wIs0));
    await liq.modifyLiquidity(wkey, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(1000), salt: ZERO32 }, "0x");
    ob = await (await ethers.getContractFactory("ArcircleOrdersNative")).deploy(await pm.getAddress(), treasury.address, ETH, ETH, T.weth);
    domain = { name: "ARCIRCLE Orders", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await ob.getAddress() };
    for (const s of [alice, bob]) {
      await meme.mint(s.address, E(1_000_000));
      await weth.connect(s).deposit({ value: E(50) });
      await meme.connect(s).approve(await ob.getAddress(), ethers.MaxUint256);
      await weth.connect(s).approve(await ob.getAddress(), ethers.MaxUint256);
    }
  });

  it("hashes like Arc's orders and quotes both ways on a native ETH pool", async function () {
    const { order } = await sign(alice, { sell: T.meme, buy: T.weth, sellAmount: E(1000), buyAmount: E(0.09) });
    expect(await ob.hashOrder(order)).to.equal(ethers.TypedDataEncoder.hash(domain, TYPES, order));
    const out = await quote(nkey, T.meme, E(1000));
    expect(out).to.be.gt(E(0.098)).and.lt(E(0.1));
    const tok = await quote(nkey, T.weth, E(0.1));
    expect(tok).to.be.gt(E(980)).and.lt(E(1000));
  });

  it("a limit sell into a native ETH pool pays the maker WETH, 0.1% to the treasury", async function () {
    const { order, sig } = await sign(alice, { sell: T.meme, buy: T.weth, sellAmount: E(10_000), buyAmount: E(1.1) });
    await expect(ob.connect(keeper).fillPool(order, sig, E(10_000), nkey)).to.be.revertedWithCustomError(ob, "PriceNotMet");
    await buyToken(E(2)); // the token's price rises ~20%
    const w0 = await weth.balanceOf(alice.address);
    await expect(ob.connect(keeper).fillPool(order, sig, E(10_000), nkey)).to.emit(ob, "Filled");
    const got = (await weth.balanceOf(alice.address)) - w0;
    const fee = await weth.balanceOf(treasury.address);
    expect(got).to.be.gte(E(1.1));
    expect(fee).to.equal(((got + fee) * 10n) / 10000n);
    expect(await ethers.provider.getBalance(await ob.getAddress())).to.equal(0n);
    expect(await weth.balanceOf(await ob.getAddress())).to.equal(0n);
  });

  it("a limit buy with WETH unwraps it to pay a native ETH pool", async function () {
    const { order, sig } = await sign(bob, { sell: T.weth, buy: T.meme, sellAmount: E(1), buyAmount: E(10_500) });
    await expect(ob.connect(keeper).fillPool(order, sig, E(1), nkey)).to.be.revertedWithCustomError(ob, "PriceNotMet");
    await sellToken(E(30_000)); // the token's price falls
    const m0 = await meme.balanceOf(bob.address);
    const w0 = await weth.balanceOf(bob.address);
    await ob.connect(keeper).fillPool(order, sig, E(1), nkey);
    expect((await meme.balanceOf(bob.address)) - m0).to.be.gte(E(10_500));
    expect(w0 - (await weth.balanceOf(bob.address))).to.equal(E(1));
    expect(await meme.balanceOf(treasury.address)).to.be.gt(0n);
  });

  it("a stop on a native ETH pool fills only once triggered, and a WETH pool works the same", async function () {
    const slot0 = await pm["extsload(bytes32)"](ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [poolIdOf(nkey), 6n])));
    const sqrtP = BigInt(slot0) & ((1n << 160n) - 1n);
    expect(sqrtP).to.equal(100n * 2n ** 96n);
    // stop-loss: sell when the token's price falls 5% — in ETH per token, sqrtP (token per ETH) rises
    const trig = (sqrtP * 1026n) / 1000n;
    const { order, sig } = await sign(alice, { sell: T.meme, buy: T.weth, sellAmount: E(1000), buyAmount: E(0.08), triggerSqrtP: trig, triggerBelow: false, poolId: poolIdOf(nkey) });
    await expect(ob.connect(keeper).fillPool(order, sig, E(1000), nkey)).to.be.revertedWithCustomError(ob, "NotTriggered");
    await expect(ob.connect(keeper).fillPool(order, sig, E(1000), wkey)).to.be.revertedWithCustomError(ob, "WrongPool");
    await sellToken(E(8000));
    await expect(ob.connect(keeper).fillPool(order, sig, E(1000), nkey)).to.emit(ob, "Filled");
    // a plain limit order in the WETH pool
    const b = await sign(bob, { sell: T.meme, buy: T.weth, sellAmount: E(1000), buyAmount: E(0.09) });
    await expect(ob.connect(keeper).fillPool(b.order, b.sig, E(1000), wkey)).to.emit(ob, "Filled");
  });

  it("market orders: ETH in, ETH out, WETH in and out", async function () {
    const q = await quote(nkey, T.weth, E(0.5));
    const m0 = await meme.balanceOf(alice.address);
    await expect(ob.connect(alice).swapMarketNative(nkey, T.weth, T.meme, E(0.5), (q * 999n) / 1000n, false, { value: E(0.5) })).to.emit(ob, "Filled");
    expect((await meme.balanceOf(alice.address)) - m0).to.equal(q - (q * 10n) / 10000n);
    // token → ETH, paid in ETH; the fee stays WETH
    const qo = await quote(nkey, T.meme, E(5000));
    const e0 = await ethers.provider.getBalance(alice.address);
    const tx = await ob.connect(alice).swapMarketNative(nkey, T.meme, T.weth, E(5000), (qo * 99n) / 100n, true);
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    expect((await ethers.provider.getBalance(alice.address)) - e0 + gas).to.equal(qo - (qo * 10n) / 10000n);
    expect(await weth.balanceOf(treasury.address)).to.equal((qo * 10n) / 10000n);
    // WETH in and out like Arc
    await expect(ob.connect(bob).swapMarket(nkey, T.weth, T.meme, E(0.1), 1n)).to.emit(ob, "Filled");
    await expect(ob.connect(bob).swapMarketNative(nkey, T.meme, T.weth, E(1000), 1n, false)).to.emit(ob, "Filled");
    expect(await ethers.provider.getBalance(await ob.getAddress())).to.equal(0n);
    expect(await weth.balanceOf(await ob.getAddress())).to.equal(0n);
    expect(await meme.balanceOf(await ob.getAddress())).to.equal(0n);
  });

  it("rejects mismatched ETH and stray ETH", async function () {
    await expect(ob.connect(alice).swapMarketNative(nkey, T.weth, T.meme, E(1), 1n, false, { value: E(0.5) })).to.be.revertedWithCustomError(ob, "WrongValue");
    await expect(ob.connect(alice).swapMarketNative(nkey, T.meme, T.weth, E(1), 1n, false, { value: E(1) })).to.be.revertedWithCustomError(ob, "WrongValue");
    await expect(ob.connect(alice).swapMarketNative(nkey, T.weth, T.meme, E(1), 1n, true, { value: E(1) })).to.be.revertedWithCustomError(ob, "WrongValue");
    await expect(alice.sendTransaction({ to: await ob.getAddress(), value: 1n })).to.be.revertedWithCustomError(ob, "WrongValue");
    // a WETH / ETH "pair" is no pair
    const bad = { ...nkey, currency1: T.weth };
    await expect(ob.connect(alice).swapMarket(bad, T.weth, T.weth, E(1), 1n)).to.be.revertedWithCustomError(ob, "NativeNotSupported");
  });

  it("matches WETH and token orders wallet to wallet", async function () {
    const a = await sign(alice, { sell: T.meme, buy: T.weth, sellAmount: E(10_000), buyAmount: E(0.99) });
    const b = await sign(bob, { sell: T.weth, buy: T.meme, sellAmount: E(1), buyAmount: E(9_900) });
    await expect(ob.connect(keeper).matchOrders(a.order, a.sig, b.order, b.sig, E(10_000), E(1))).to.emit(ob, "Filled");
    expect(await weth.balanceOf(treasury.address)).to.equal(E(0.001));
    expect(await meme.balanceOf(treasury.address)).to.equal(E(10));
  });

  describe("with ArcircleFeeBurnNative", function () {
    let fb, op;
    beforeEach(async function () {
      op = keeper;
      fb = await (await ethers.getContractFactory("ArcircleFeeBurnNative")).deploy(await pm.getAddress(), T.weth, T.meme, treasury.address, 5000, nkey, op.address, E(100_000));
      ob = await (await ethers.getContractFactory("ArcircleOrdersNative")).deploy(await pm.getAddress(), await fb.getAddress(), ETH, await fb.getAddress(), T.weth);
      domain.verifyingContract = await ob.getAddress();
      for (const s of [alice, bob]) { await meme.connect(s).approve(await ob.getAddress(), ethers.MaxUint256); await weth.connect(s).approve(await ob.getAddress(), ethers.MaxUint256); }
    });

    it("holders of 100,000 trade fee-free; the WETH fees buy the token through the native ETH pool and burn it", async function () {
      expect(await fb.feeFree(alice.address)).to.equal(true); // alice holds 1,000,000
      await meme.connect(bob).transfer(owner.address, E(950_000)); // bob keeps 50,000
      expect(await fb.feeFree(bob.address)).to.equal(false);
      await ob.connect(alice).swapMarketNative(nkey, T.meme, T.weth, E(5000), 1n, true);
      expect(await weth.balanceOf(await fb.getAddress())).to.equal(0n);
      await ob.connect(bob).swapMarketNative(nkey, T.meme, T.weth, E(40_000), 1n, false);
      const fees = await weth.balanceOf(await fb.getAddress());
      expect(fees).to.be.gt(0n);
      await expect(fb.connect(bob).flush(T.weth)).to.be.revertedWithCustomError(fb, "UseBurn");
      let q; try { await fb.quote.staticCall(fees / 2n); } catch (e) { q = fb.interface.decodeErrorResult("QuoteResult", e.data)[0]; }
      await expect(fb.connect(bob).burn(0)).to.be.revertedWithCustomError(fb, "NotOperator");
      const d0 = await meme.balanceOf(DEAD);
      await expect(fb.connect(op).burn((q * 99n) / 100n)).to.emit(fb, "Burned");
      expect((await meme.balanceOf(DEAD)) - d0).to.equal(q);
      expect(await weth.balanceOf(treasury.address)).to.equal(fees - fees / 2n);
      expect(await weth.balanceOf(await fb.getAddress())).to.equal(0n);
      expect(await ethers.provider.getBalance(await fb.getAddress())).to.equal(0n);
      expect(await fb.totalEthSpent()).to.equal(fees / 2n);
      await expect(alice.sendTransaction({ to: await fb.getAddress(), value: 1n })).to.be.reverted;
    });

    it("works with a WETH-paired $ARCIRCLE pool too, and refuses other pools", async function () {
      const fb2 = await (await ethers.getContractFactory("ArcircleFeeBurnNative")).deploy(await pm.getAddress(), T.weth, T.meme, treasury.address, 5000, wkey, op.address, 0n);
      expect(await fb2.feeFree(alice.address)).to.equal(false);
      await weth.connect(alice).transfer(await fb2.getAddress(), E(1));
      await expect(fb2.connect(op).burn(1n)).to.emit(fb2, "Burned");
      // the owner (deployer) can pass WETH fees to the treasury unburned, if the pool ever can't be traded
      await weth.connect(alice).transfer(await fb2.getAddress(), E(1));
      await expect(fb2.connect(op).flush(T.weth)).to.be.revertedWithCustomError(fb2, "UseBurn");
      const t0 = await weth.balanceOf(treasury.address);
      await fb2.connect(owner).flush(T.weth);
      expect((await weth.balanceOf(treasury.address)) - t0).to.equal(E(1));
      const bad = { ...nkey, currency1: T.weth };
      await expect((await ethers.getContractFactory("ArcircleFeeBurnNative")).deploy(await pm.getAddress(), T.weth, T.meme, treasury.address, 5000, bad, op.address, 0n)).to.be.reverted;
    });
  });
});
