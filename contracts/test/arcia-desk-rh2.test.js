// ArciaDeskRH2: any new Robinhood Chain launch — the real Uniswap v3 factory/pools and the real v4 PoolManager
// (native ETH and WETH pools, no hook / an approved hook), no launchpad registry.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { factory: V3F, pool: V3P } = require("./lib/uniswap-v3.json");

const E = (n) => ethers.parseEther(String(n));
const ZERO = ethers.ZeroAddress;
const HOOK_ADDR = "0x0000000000000000000000000000000000012044"; // afterSwap + returns delta (a tax hook)
const sqrtOf = (raw) => BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n; // raw = token1 per token0

describe("ArciaDeskRH2", function () {
  let owner, op, other, weth, meme, meme2, tax, honey, v3, v3b, helper, pm, liq, desk, pool3, junk3, T;
  const decodeErr = (e, name) => desk.interface.decodeErrorResult(name, e.data || (e.error && e.error.data));
  const q3 = async (addr, isBuy, amt) => { try { await desk.quote.staticCall(addr, isBuy, amt); } catch (e) { return decodeErr(e, "QuoteResult")[0]; } throw new Error("no revert"); };
  const q4 = async (key, isBuy, amt) => { try { await desk.quote4.staticCall(key, isBuy, amt); } catch (e) { return decodeErr(e, "QuoteResult")[0]; } throw new Error("no revert"); };
  const rt4 = async (key, amt) => { try { await desk.quoteRoundTrip4.staticCall(key, amt); } catch (e) { const r = decodeErr(e, "RoundTripResult"); return [r[0], r[1]]; } throw new Error("no revert"); };
  async function v3pool(factory, a, ethPerToken) {
    await factory.createPool(a, T.weth, 10000);
    const addr = await factory.getPool(a, T.weth, 10000);
    const p = new ethers.Contract(addr, V3P.abi, owner);
    const raw = (await p.token0()).toLowerCase() === T.weth.toLowerCase() ? 1 / ethPerToken : ethPerToken;
    await p.initialize(sqrtOf(raw));
    await helper.mint(addr, -887200, 887200, E(50));
    return p;
  }
  // a v4 pool: `eth` = ZERO (native) or WETH; the token costs `ethPerToken`
  async function v4pool(token, eth, hooks, ethPerToken, fee = 2500, tickSpacing = 25) {
    const [c0, c1] = BigInt(token) < BigInt(eth) ? [token, eth] : [eth, token];
    const key = { currency0: c0, currency1: c1, fee, tickSpacing, hooks };
    const raw = c0 === token ? ethPerToken : 1 / ethPerToken;
    await pm.initialize(key, sqrtOf(raw));
    const lo = -Math.floor(887272 / tickSpacing) * tickSpacing;
    await liq.modifyLiquidity(key, { tickLower: lo, tickUpper: -lo, liquidityDelta: E(2000), salt: ethers.ZeroHash }, "0x", { value: eth === ZERO ? E(200) : 0 });
    return key;
  }

  beforeEach(async function () {
    [owner, op, other] = await ethers.getSigners();
    weth = await (await ethers.getContractFactory("MockWETH")).deploy();
    const Tok = await ethers.getContractFactory("TestToken");
    meme = await Tok.deploy("Meme", "MEME", 18); meme2 = await Tok.deploy("Meme Two", "MEME2", 18);
    tax = await (await ethers.getContractFactory("MockFeeToken")).deploy(500); // 5% per transfer (deployer exempt)
    honey = await (await ethers.getContractFactory("MockHoneyToken")).deploy();
    T = { weth: await weth.getAddress(), meme: await meme.getAddress(), meme2: await meme2.getAddress(), tax: await tax.getAddress(), honey: await honey.getAddress() };
    const F = new ethers.ContractFactory(V3F.abi, V3F.bytecode, owner);
    v3 = await F.deploy(); v3b = await F.deploy();
    helper = await (await ethers.getContractFactory("V3Helper")).deploy();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    await weth.deposit({ value: E(500) });
    for (const t of [meme, meme2]) await t.mint(owner.address, E(1e12));
    for (const t of [weth, meme, meme2, tax, honey]) { await t.approve(await helper.getAddress(), ethers.MaxUint256); await t.approve(await liq.getAddress(), ethers.MaxUint256); }
    await honey.setFree(await pm.getAddress(), true); await honey.setFree(await liq.getAddress(), true);
    const hook = await (await ethers.getContractFactory("TaxHook")).deploy(await pm.getAddress(), 300);
    await network.provider.send("hardhat_setCode", [HOOK_ADDR, await ethers.provider.getCode(await hook.getAddress())]);
    pool3 = await v3pool(v3, T.meme, 1e-7);
    junk3 = await v3pool(v3b, T.meme, 1e-7); // same pair, another factory
    desk = await (await ethers.getContractFactory("ArciaDeskRH2")).deploy(await v3.getAddress(), await pm.getAddress(), T.weth, [], owner.address, op.address, E(0.01), E(0.05));
    await owner.sendTransaction({ to: await desk.getAddress(), value: E(0.04) }); // ETH in → WETH
  });

  it("v3: trades any WETH pool of the v3 factory — no launchpad check — and nothing else", async function () {
    const p = await pool3.getAddress();
    const out = await q3(p, true, E(0.001));
    expect(out).to.be.gt(E(9000)).and.lt(E(10000));
    await desk.connect(op).buy(p, E(0.001), (out * 99n) / 100n);
    const held = await meme.balanceOf(await desk.getAddress());
    expect(held).to.equal(out);
    await desk.connect(op).sell(p, held, 0);
    expect(await meme.balanceOf(await desk.getAddress())).to.equal(0n);
    await expect(desk.connect(op).buy(await junk3.getAddress(), E(0.001), 0)).to.be.revertedWithCustomError(desk, "NotFactoryPool");
    await v3.createPool(T.meme, T.meme2, 10000);
    await expect(desk.connect(op).buy(await v3.getPool(T.meme, T.meme2, 10000), E(0.001), 0)).to.be.revertedWithCustomError(desk, "NotWethPool");
  });

  it("v4 native ETH pool: quotes and round-trips holding nothing; buys from its WETH and sells back to WETH", async function () {
    const key = await v4pool(T.meme, ZERO, ZERO, 1e-7);
    const empty = await (await ethers.getContractFactory("ArciaDeskRH2")).deploy(await v3.getAddress(), await pm.getAddress(), T.weth, [], owner.address, op.address, E(0.01), E(0.05));
    const d = desk; desk = empty;
    const out = await q4(key, true, E(0.001));
    expect(out).to.be.gt(E(9900)).and.lt(E(10000)); // 0.25% pool fee
    const [tok, back] = await rt4(key, E(0.001));
    expect(tok).to.equal(out);
    expect(back).to.be.lt(E(0.001)).and.gt(E(0.00099));
    desk = d;
    const D = await desk.getAddress();
    await expect(desk.connect(op).buy4(key, E(0.001), (out * 99n) / 100n)).to.emit(desk, "Trade").withArgs(T.meme, true, E(0.001), out);
    expect(await meme.balanceOf(D)).to.equal(out);
    expect(await weth.balanceOf(D)).to.equal(E(0.039));
    expect(await ethers.provider.getBalance(D)).to.equal(0n); // nothing left loose
    const qs = await q4(key, false, out);
    await desk.connect(op).sell4(key, out, (qs * 99n) / 100n);
    expect(await meme.balanceOf(D)).to.equal(0n);
    expect(await weth.balanceOf(D)).to.equal(E(0.039) + qs); // ETH back as WETH
    expect(await ethers.provider.getBalance(D)).to.equal(0n);
  });

  it("v4 WETH pool, WETH on either side", async function () {
    for (const t of [T.meme, T.meme2]) {
      const key = await v4pool(t, T.weth, ZERO, 1e-7, 3000, 60);
      const out = await q4(key, true, E(0.002));
      await desk.connect(op).buy4(key, E(0.002), (out * 99n) / 100n);
      const tok = t === T.meme ? meme : meme2;
      expect(await tok.balanceOf(await desk.getAddress())).to.equal(out);
      await desk.connect(op).sell4(key, out, 0);
      expect(await tok.balanceOf(await desk.getAddress())).to.equal(0n);
    }
  });

  it("v4 pools that aren't ETH/WETH, or carry an unapproved hook, are refused; an approved hook works", async function () {
    const plain = { currency0: T.meme < T.meme2 ? T.meme : T.meme2, currency1: T.meme < T.meme2 ? T.meme2 : T.meme, fee: 2500, tickSpacing: 25, hooks: ZERO };
    await expect(desk.quote4.staticCall(plain, true, E(1))).to.be.revertedWithCustomError(desk, "NotWethPool");
    const ethWeth = { currency0: ZERO, currency1: T.weth, fee: 2500, tickSpacing: 25, hooks: ZERO };
    await expect(desk.quote4.staticCall(ethWeth, true, E(1))).to.be.revertedWithCustomError(desk, "NotWethPool");
    const hooked = await v4pool(T.meme, ZERO, HOOK_ADDR, 1e-7, 3000, 60);
    await expect(desk.connect(op).buy4(hooked, E(0.001), 0)).to.be.revertedWithCustomError(desk, "HookNotAllowed");
    await expect(desk.connect(other).setHook(HOOK_ADDR, true)).to.be.revertedWithCustomError(desk, "NotOwner");
    await desk.setHook(HOOK_ADDR, true);
    const plainKey = await v4pool(T.meme, ZERO, ZERO, 1e-7, 3000, 60);
    const withTax = await q4(hooked, true, E(0.001)), without = await q4(plainKey, true, E(0.001));
    expect(withTax).to.be.lt(without); // the hook's 3% shows in the quote
    await desk.connect(op).buy4(hooked, E(0.001), (withTax * 99n) / 100n);
    expect(await meme.balanceOf(await desk.getAddress())).to.equal(withTax);
  });

  it("a transfer-tax token: the round trip shows the tax; buy and sell settle what actually moved", async function () {
    const key = await v4pool(T.tax, ZERO, ZERO, 1e-7);
    const out = await q4(key, true, E(0.001));
    const [held, back] = await rt4(key, E(0.001));
    expect(held).to.equal(out - (out * 500n) / 10000n); // 5% taken on the way in
    expect(back).to.be.lt(E(0.00091)); // and again on the way out
    await desk.connect(op).buy4(key, E(0.001), 0);
    const got = await tax.balanceOf(await desk.getAddress());
    expect(got).to.equal(held);
    await desk.connect(op).sell4(key, got, 0);
    expect(await tax.balanceOf(await desk.getAddress())).to.equal(0n);
  });

  it("a honeypot (can't be sent back) gives no round-trip result", async function () {
    const key = await v4pool(T.honey, ZERO, ZERO, 1e-7);
    expect(await q4(key, true, E(0.001))).to.be.gt(0n); // a plain quote can't tell
    let got = null;
    try { await desk.quoteRoundTrip4.staticCall(key, E(0.001)); } catch (e) { try { got = decodeErr(e, "RoundTripResult"); } catch { got = null; } }
    expect(got).to.equal(null);
  });

  it("caps, pause and roles hold across v3 and v4 (one daily budget)", async function () {
    const key = await v4pool(T.meme, ZERO, ZERO, 1e-7);
    const p = await pool3.getAddress();
    await expect(desk.connect(other).buy4(key, E(0.001), 0)).to.be.revertedWithCustomError(desk, "NotOperator");
    await expect(desk.connect(op).buy4(key, E(0.011), 0)).to.be.revertedWithCustomError(desk, "OverTradeCap");
    await desk.setCaps(E(0.01), E(0.015));
    await desk.connect(op).buy(p, E(0.01), 0);
    await expect(desk.connect(op).buy4(key, E(0.006), 0)).to.be.revertedWithCustomError(desk, "OverDailyCap");
    await desk.connect(op).buy4(key, E(0.005), 0);
    expect(await desk.spentToday()).to.equal(E(0.015));
    await desk.setPaused(true);
    await network.provider.send("evm_increaseTime", [86400]); await network.provider.send("evm_mine");
    await expect(desk.connect(op).buy4(key, E(0.001), 0)).to.be.revertedWithCustomError(desk, "IsPaused");
    const bal = await meme.balanceOf(await desk.getAddress());
    const q = await q4(key, false, bal / 2n);
    await desk.connect(op).sell4(key, bal / 2n, (q * 99n) / 100n); // selling still works
    await expect(desk.connect(op).sell4(key, bal / 4n, E(100))).to.be.revertedWithCustomError(desk, "Slippage");
  });

  it("only the owner withdraws, always to itself; ETH sent in becomes WETH", async function () {
    const D = await desk.getAddress();
    await expect(desk.connect(op).withdrawETH(E(0.01))).to.be.revertedWithCustomError(desk, "NotOwner");
    const b0 = await ethers.provider.getBalance(owner.address);
    const tx = await desk.withdrawETH(E(0.01)); const rc = await tx.wait();
    expect((await ethers.provider.getBalance(owner.address)) - b0 + rc.gasUsed * rc.gasPrice).to.equal(E(0.01));
    expect(await weth.balanceOf(D)).to.equal(E(0.03));
    const w0 = await weth.balanceOf(owner.address);
    await desk.withdraw(T.weth, E(0.03));
    expect((await weth.balanceOf(owner.address)) - w0).to.equal(E(0.03));
    await expect(other.sendTransaction({ to: D, value: E(1) })).to.not.be.reverted;
    expect(await weth.balanceOf(D)).to.equal(E(1));
  });

  it("only the PoolManager may call back", async function () {
    await expect(desk.unlockCallback("0x")).to.be.revertedWithCustomError(desk, "BadCallback");
    await expect(desk.uniswapV3SwapCallback(1, 1, "0x00")).to.be.revertedWithCustomError(desk, "BadCallback");
  });
});
