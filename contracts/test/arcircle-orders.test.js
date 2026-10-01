// ARCIRCLE Orders against the real Uniswap v4 PoolManager (plain pools and an Argus-like tax hook).
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const U = (n) => ethers.parseUnits(String(n), 6);
const E = (n) => ethers.parseEther(String(n));
const HOOK_ADDR = "0x0000000000000000000000000000000000012044";
const NOHOOK = ethers.ZeroAddress;
const ZERO32 = ethers.ZeroHash;
const TYPES = { Order: [
  { name: "maker", type: "address" }, { name: "sell", type: "address" }, { name: "buy", type: "address" },
  { name: "sellAmount", type: "uint256" }, { name: "buyAmount", type: "uint256" }, { name: "triggerSqrtP", type: "uint160" },
  { name: "triggerBelow", type: "bool" }, { name: "poolId", type: "bytes32" }, { name: "expiry", type: "uint64" },
  { name: "start", type: "uint64" }, { name: "duration", type: "uint32" }, { name: "group", type: "uint256" },
  { name: "epoch", type: "uint32" }, { name: "salt", type: "uint256" },
] };

function sqrtFor(priceUsdPerToken, tokenIs0) {
  const raw = tokenIs0 ? (priceUsdPerToken * 1e6) / 1e18 : 1 / ((priceUsdPerToken * 1e6) / 1e18);
  return BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n;
}

describe("ArcircleOrders", function () {
  let pm, liq, swp, usdc, meme, ob, owner, alice, bob, keeper, treasury, T, key, taxKey, domain;
  const keyOf = (token, hooks) => {
    const [c0, c1] = BigInt(token) < BigInt(T.usdc) ? [token, T.usdc] : [T.usdc, token];
    return { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks };
  };
  const poolIdOf = (k) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
  async function pool(token, hooks, price) {
    const k = keyOf(token, hooks);
    await pm.initialize(k, sqrtFor(price, k.currency0 === token));
    await liq.modifyLiquidity(k, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(20), salt: ZERO32 }, "0x");
    return k;
  }
  let salt = 1n;
  async function sign(maker, o) {
    const order = { maker: maker.address, triggerSqrtP: 0n, triggerBelow: false, poolId: ZERO32, expiry: 0n, start: 0n, duration: 0, group: 0n, epoch: 0, salt: salt++, ...o };
    const sig = await maker.signTypedData(domain, TYPES, order);
    return { order, sig };
  }
  async function quote(k, sell, amt) {
    try { await ob.quote.staticCall(k, sell, amt); } catch (e) { return ob.interface.decodeErrorResult("QuoteResult", e.data)[0]; }
    throw new Error("no revert");
  }
  const sellToken = async (signer, amount) => swp.connect(signer).swap(key, { zeroForOne: key.currency0 === T.meme, amountSpecified: -amount, sqrtPriceLimitX96: key.currency0 === T.meme ? 4295128740n : 1461446703485210103287273052203988822378723970341n }, { takeClaims: false, settleUsingBurn: false }, "0x");
  const buyToken = async (signer, usd) => swp.connect(signer).swap(key, { zeroForOne: key.currency0 === T.usdc, amountSpecified: -usd, sqrtPriceLimitX96: key.currency0 === T.usdc ? 4295128740n : 1461446703485210103287273052203988822378723970341n }, { takeClaims: false, settleUsingBurn: false }, "0x");

  beforeEach(async function () {
    [owner, alice, bob, keeper, treasury] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    swp = await (await ethers.getContractFactory("PoolSwapTest")).deploy(await pm.getAddress());
    const Tok = await ethers.getContractFactory("TestToken");
    usdc = await Tok.deploy("USD Coin", "USDC", 6); meme = await Tok.deploy("Meme", "MEME", 18);
    T = { usdc: await usdc.getAddress(), meme: await meme.getAddress() };
    for (const t of [usdc, meme]) {
      await t.mint(owner.address, t === usdc ? U(100_000_000) : E(1e13));
      await t.approve(await liq.getAddress(), ethers.MaxUint256);
      await t.approve(await swp.getAddress(), ethers.MaxUint256);
    }
    const hook = await (await ethers.getContractFactory("TaxHook")).deploy(await pm.getAddress(), 300);
    await network.provider.send("hardhat_setCode", [HOOK_ADDR, await ethers.provider.getCode(await hook.getAddress())]);
    key = await pool(T.meme, NOHOOK, 0.0001);
    taxKey = await pool(T.meme, HOOK_ADDR, 0.0001);
    ob = await (await ethers.getContractFactory("ArcircleOrders")).deploy(await pm.getAddress(), treasury.address);
    domain = { name: "ARCIRCLE Orders", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await ob.getAddress() };
    await meme.mint(alice.address, E(10_000_000)); await usdc.mint(alice.address, U(10_000));
    await meme.mint(bob.address, E(10_000_000)); await usdc.mint(bob.address, U(10_000));
    for (const s of [alice, bob]) { await meme.connect(s).approve(await ob.getAddress(), ethers.MaxUint256); await usdc.connect(s).approve(await ob.getAddress(), ethers.MaxUint256); }
  });

  it("hashes like ethers' EIP-712 and quotes without moving anything", async function () {
    const { order } = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1000), buyAmount: U(0.2) });
    expect(await ob.hashOrder(order)).to.equal(ethers.TypedDataEncoder.hash(domain, TYPES, order));
    const q = await quote(key, T.meme, E(1000));
    expect(q).to.be.gt(U(0.098)).and.lt(U(0.1));
  });

  it("a limit sell waits for its price, then fills against the pool; 0.1% goes to the treasury", async function () {
    // 1,000,000 MEME at ≥ 0.00012 USDC each (pool is at 0.0001)
    const { order, sig } = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1_000_000), buyAmount: U(120) });
    await expect(ob.connect(keeper).fillPool(order, sig, E(1_000_000), key)).to.be.revertedWithCustomError(ob, "PriceNotMet");
    await buyToken(owner, U(150_000)); // the price rises
    const q = await quote(key, T.meme, E(1_000_000));
    const u0 = await usdc.balanceOf(alice.address), t0 = await usdc.balanceOf(treasury.address);
    await expect(ob.connect(keeper).fillPool(order, sig, E(1_000_000), key)).to.emit(ob, "Filled");
    const got = (await usdc.balanceOf(alice.address)) - u0, fee = (await usdc.balanceOf(treasury.address)) - t0;
    expect(got + fee).to.equal(q);
    expect(fee).to.equal((q * 10n) / 10000n);
    expect(got).to.be.gte(U(120));
    expect(await ob.remaining(order)).to.equal(0n);
    await expect(ob.connect(keeper).fillPool(order, sig, 1n, key)).to.be.revertedWithCustomError(ob, "OverFill");
    expect(await meme.balanceOf(await ob.getAddress())).to.equal(0n);
    expect(await usdc.balanceOf(await ob.getAddress())).to.equal(0n);
  });

  it("a limit buy fills in parts", async function () {
    // spend 100 USDC for ≥ 1,200,000 MEME (≤ 0.0000833 USDC each)
    const { order, sig } = await sign(bob, { sell: T.usdc, buy: T.meme, sellAmount: U(100), buyAmount: E(1_200_000) });
    await expect(ob.fillPool(order, sig, U(100), key)).to.be.revertedWithCustomError(ob, "PriceNotMet");
    await sellToken(owner, E(500_000_000)); // the price falls
    const m0 = await meme.balanceOf(bob.address);
    await ob.connect(keeper).fillPool(order, sig, U(40), key);
    expect(await ob.remaining(order)).to.equal(U(60));
    await ob.connect(keeper).fillPool(order, sig, U(60), key);
    expect((await meme.balanceOf(bob.address)) - m0).to.be.gte(E(1_200_000));
  });

  it("works through a pool whose hook takes a tax", async function () {
    const { order, sig } = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(100_000), buyAmount: U(9.4) });
    const u0 = await usdc.balanceOf(alice.address);
    await ob.fillPool(order, sig, E(100_000), taxKey);
    expect((await usdc.balanceOf(alice.address)) - u0).to.be.gte(U(9.4)).and.lt(U(9.8));
  });

  it("a stop order fills only after its pool crosses the trigger", async function () {
    const id = poolIdOf(key);
    const tokenIs0 = key.currency0 === T.meme;
    // stop-loss: sell when MEME falls to 0.00008 or lower, accepting ≥ 0.00007
    const trig = sqrtFor(0.00008, tokenIs0);
    const { order, sig } = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(100_000), buyAmount: U(7), triggerSqrtP: trig, triggerBelow: tokenIs0, poolId: id });
    await expect(ob.fillPool(order, sig, E(100_000), key)).to.be.revertedWithCustomError(ob, "NotTriggered");
    await expect(ob.fillPool(order, sig, E(100_000), taxKey)).to.be.revertedWithCustomError(ob, "WrongPool");
    // sell into the pool until MEME is just under 0.00008
    for (let i = 0; i < 40; i++) { if ((await quote(key, T.meme, E(10_000))) <= U(0.79)) break; await sellToken(owner, E(20_000_000)); }
    await expect(ob.fillPool(order, sig, E(100_000), key)).to.emit(ob, "Filled");
  });

  it("matches two orders wallet to wallet, each at its price or better, both paying 0.1%", async function () {
    // alice sells 1,000,000 MEME for ≥ 99.9 USDC net; bob pays 100 USDC for ≥ 990,000 MEME net
    const a = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1_000_000), buyAmount: U(99.9) });
    const b = await sign(bob, { sell: T.usdc, buy: T.meme, sellAmount: U(100), buyAmount: E(990_000) });
    const [am0, au0, bm0, bu0, tu0, tm0] = await Promise.all([meme.balanceOf(alice.address), usdc.balanceOf(alice.address), meme.balanceOf(bob.address), usdc.balanceOf(bob.address), usdc.balanceOf(treasury.address), meme.balanceOf(treasury.address)]);
    await ob.connect(keeper).matchOrders(a.order, a.sig, b.order, b.sig, E(1_000_000), U(100));
    expect(am0 - (await meme.balanceOf(alice.address))).to.equal(E(1_000_000));
    expect((await usdc.balanceOf(alice.address)) - au0).to.equal(U(99.9));
    expect(bu0 - (await usdc.balanceOf(bob.address))).to.equal(U(100));
    expect((await meme.balanceOf(bob.address)) - bm0).to.equal(E(999_000));
    expect((await usdc.balanceOf(treasury.address)) - tu0).to.equal(U(0.1));
    expect((await meme.balanceOf(treasury.address)) - tm0).to.equal(E(1_000));
  });

  it("refuses a match that misses either side's price, the wrong pair, or a stop order", async function () {
    const a = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1_000_000), buyAmount: U(120) });
    const b = await sign(bob, { sell: T.usdc, buy: T.meme, sellAmount: U(100), buyAmount: E(990_000) });
    await expect(ob.matchOrders(a.order, a.sig, b.order, b.sig, E(1_000_000), U(100))).to.be.revertedWithCustomError(ob, "PriceNotMet");
    const cheap = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1_000_000), buyAmount: U(50) });
    const c = await sign(bob, { sell: T.usdc, buy: T.meme, sellAmount: U(100), buyAmount: E(2_000_000) });
    await expect(ob.matchOrders(cheap.order, cheap.sig, c.order, c.sig, E(1_000_000), U(100))).to.be.revertedWithCustomError(ob, "PriceNotMet"); // bob would get too little per USDC
    const d = await sign(bob, { sell: T.meme, buy: T.usdc, sellAmount: E(1), buyAmount: 1n });
    await expect(ob.matchOrders(a.order, a.sig, d.order, d.sig, E(1), E(1))).to.be.revertedWithCustomError(ob, "WrongPair");
    const s = await sign(bob, { sell: T.usdc, buy: T.meme, sellAmount: U(100), buyAmount: E(1), triggerSqrtP: 1n, poolId: poolIdOf(key) });
    await expect(ob.matchOrders(a.order, a.sig, s.order, s.sig, E(1), U(1))).to.be.revertedWithCustomError(ob, "StopNotMatchable");
  });

  it("only the maker's own signature counts; cancel, cancelAll and expiry stop an order", async function () {
    const { order } = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1000), buyAmount: 1n });
    const forged = await bob.signTypedData(domain, TYPES, order);
    await expect(ob.fillPool(order, forged, E(1000), key)).to.be.revertedWithCustomError(ob, "BadSignature");
    const x = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1000), buyAmount: 1n });
    await expect(ob.connect(bob).cancel(x.order)).to.be.revertedWithCustomError(ob, "NotMaker");
    await ob.connect(alice).cancel(x.order);
    await expect(ob.fillPool(x.order, x.sig, E(1000), key)).to.be.revertedWithCustomError(ob, "OrderCancelled");
    expect(await ob.remaining(x.order)).to.equal(0n);
    const y = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1000), buyAmount: 1n });
    await ob.connect(alice).cancelAll();
    await expect(ob.fillPool(y.order, y.sig, E(1000), key)).to.be.revertedWithCustomError(ob, "StaleEpoch");
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const z = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1000), buyAmount: 1n, epoch: 1, expiry: BigInt(now + 60) });
    await network.provider.send("evm_increaseTime", [120]); await network.provider.send("evm_mine");
    await expect(ob.fillPool(z.order, z.sig, E(1000), key)).to.be.revertedWithCustomError(ob, "OrderExpired");
    const w = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1000), buyAmount: 1n, epoch: 1 });
    const other = { ...key, currency0: key.currency0, currency1: key.currency1 };
    await expect(ob.fillPool(w.order, w.sig, E(1000), { ...other, currency1: key.currency0, currency0: key.currency1 })).to.be.reverted;
    await expect(ob.fillPool(w.order, w.sig, E(1000), key)).to.emit(ob, "Filled");
  });

  it("swapMarket: the caller's own market order with a floor", async function () {
    const q = await quote(key, T.usdc, U(10));
    const net = q - (q * 10n) / 10000n;
    await expect(ob.connect(bob).swapMarket(key, T.usdc, T.meme, U(10), net + 1n)).to.be.revertedWithCustomError(ob, "PriceNotMet");
    const m0 = await meme.balanceOf(bob.address);
    await ob.connect(bob).swapMarket(key, T.usdc, T.meme, U(10), net);
    expect((await meme.balanceOf(bob.address)) - m0).to.equal(net);
  });

  it("one-cancels-other: the first order of a group to fill takes it", async function () {
    await buyToken(owner, U(150_000)); // MEME up: a take-profit at 0.00011 can fill
    const tp = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(100_000), buyAmount: U(10.9), group: 7n });
    const sl = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(100_000), buyAmount: U(1), group: 7n });
    await ob.fillPool(tp.order, tp.sig, E(40_000), key); // part of the take-profit
    expect(await ob.groupTakenBy(alice.address, 7n)).to.equal(await ob.hashOrder(tp.order));
    await expect(ob.fillPool(sl.order, sl.sig, E(1000), key)).to.be.revertedWithCustomError(ob, "GroupTaken");
    expect(await ob.remaining(sl.order)).to.equal(0n);
    await ob.fillPool(tp.order, tp.sig, E(60_000), key); // the rest of it still fills
    // another group, or no group, is untouched
    const other = await sign(alice, { sell: T.meme, buy: T.usdc, sellAmount: E(1000), buyAmount: 1n, group: 8n });
    await expect(ob.fillPool(other.order, other.sig, E(1000), key)).to.emit(ob, "Filled");
  });

  it("a timed order (TWAP / DCA) only fills what has been released", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    // 100 USDC into MEME over 1000 s, any price above 0.00005 per MEME… (≥ 2,000,000 MEME for all of it)
    const { order, sig } = await sign(bob, { sell: T.usdc, buy: T.meme, sellAmount: U(100), buyAmount: E(500_000), start: BigInt(now + 100), duration: 1000 });
    await expect(ob.fillPool(order, sig, U(1), key)).to.be.revertedWithCustomError(ob, "NotReleased");
    expect(await ob.remaining(order)).to.equal(0n);
    await network.provider.send("evm_setNextBlockTimestamp", [now + 100 + 250]); await network.provider.send("evm_mine");
    expect(await ob.released(order)).to.equal(U(25));
    await expect(ob.fillPool(order, sig, U(26), key)).to.be.revertedWithCustomError(ob, "NotReleased");
    await network.provider.send("evm_setNextBlockTimestamp", [now + 100 + 300]);
    await ob.fillPool(order, sig, U(30), key); // at t = 300: 30 released
    await network.provider.send("evm_setNextBlockTimestamp", [now + 100 + 2000]); await network.provider.send("evm_mine");
    expect(await ob.remaining(order)).to.equal(U(70));
    await ob.fillPool(order, sig, U(70), key);
    expect(await ob.remaining(order)).to.equal(0n);
  });

  it("has no owner or admin functions", async function () {
    const fns = ob.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
    expect(fns).to.deep.equal(["cancel", "cancelAll", "fillPool", "matchOrders", "quote", "swapMarket", "unlockCallback"]);
  });
});

describe("ArcircleFeeBurn", function () {
  let pm, liq, swp, usdc, arc, other, fb, owner, op, treasury, key;
  beforeEach(async function () {
    [owner, op, treasury] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    swp = await (await ethers.getContractFactory("PoolSwapTest")).deploy(await pm.getAddress());
    const Tok = await ethers.getContractFactory("TestToken");
    usdc = await Tok.deploy("USD Coin", "USDC", 6); arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 18); other = await Tok.deploy("Other", "OTH", 18);
    for (const t of [usdc, arc]) { await t.mint(owner.address, t === usdc ? U(1e8) : E(1e13)); await t.approve(await liq.getAddress(), ethers.MaxUint256); }
    const [u, a] = [await usdc.getAddress(), await arc.getAddress()];
    const [c0, c1] = BigInt(u) < BigInt(a) ? [u, a] : [a, u];
    key = { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: NOHOOK };
    await pm.initialize(key, sqrtFor(0.00004, c0 === a));
    await liq.modifyLiquidity(key, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(20), salt: ZERO32 }, "0x");
    fb = await (await ethers.getContractFactory("ArcircleFeeBurn")).deploy(await pm.getAddress(), u, a, treasury.address, 5000, key, op.address);
  });
  it("burns half of the USDC fees as $ARCIRCLE, sends the rest to the treasury", async function () {
    await usdc.mint(await fb.getAddress(), U(10));
    let q; try { await fb.quote.staticCall(U(5)); } catch (e) { q = fb.interface.decodeErrorResult("QuoteResult", e.data)[0]; }
    expect(q).to.be.gt(E(100_000));
    await expect(fb.connect(treasury).burn(0)).to.be.revertedWithCustomError(fb, "NotOperator");
    await expect(fb.connect(op).burn(q + 1n)).to.be.revertedWithCustomError(fb, "Slippage");
    const d0 = await arc.balanceOf("0x000000000000000000000000000000000000dEaD");
    await expect(fb.connect(op).burn((q * 99n) / 100n)).to.emit(fb, "Burned");
    expect((await arc.balanceOf("0x000000000000000000000000000000000000dEaD")) - d0).to.equal(q);
    expect(await usdc.balanceOf(treasury.address)).to.equal(U(5));
    expect(await usdc.balanceOf(await fb.getAddress())).to.equal(0n);
    expect(await fb.totalBurned()).to.equal(q);
    await expect(fb.connect(op).burn(0)).to.be.revertedWithCustomError(fb, "Nothing");
  });
  it("flush: $ARCIRCLE half burned, other tokens all to the treasury, USDC only through burn", async function () {
    await arc.mint(await fb.getAddress(), E(1000)); await other.mint(await fb.getAddress(), E(7));
    await fb.flush(await arc.getAddress());
    expect(await arc.balanceOf("0x000000000000000000000000000000000000dEaD")).to.equal(E(500));
    expect(await arc.balanceOf(treasury.address)).to.equal(E(500));
    await fb.flush(await other.getAddress());
    expect(await other.balanceOf(treasury.address)).to.equal(E(7));
    await expect(fb.flush(await usdc.getAddress())).to.be.revertedWithCustomError(fb, "UseBurn");
  });
  it("the owner can only change the operator or step down", async function () {
    await expect(fb.connect(op).setOperator(op.address)).to.be.revertedWithCustomError(fb, "NotOwner");
    await fb.setOperator(treasury.address);
    expect(await fb.operator()).to.equal(treasury.address);
    await fb.setOwner(ethers.ZeroAddress);
    await expect(fb.setOperator(owner.address)).to.be.revertedWithCustomError(fb, "NotOwner");
    const fns = fb.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
    expect(fns).to.deep.equal(["burn", "flush", "quote", "setOperator", "setOwner", "unlockCallback"]);
  });
});
