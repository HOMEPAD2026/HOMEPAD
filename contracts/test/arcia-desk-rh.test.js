// ArciaDeskRH against the real Uniswap v3 factory/pool bytecode and a pons-like launch registry.
const { expect } = require("chai");
const { ethers } = require("hardhat");
// the canonical v3 factory bytecode (@uniswap/v3-core 1.0.1 artifacts; it deploys the pools itself)
const { factory: V3F, pool: V3P } = require("./lib/uniswap-v3.json");

const E = (n) => ethers.parseEther(String(n));
const sqrtOf = (raw) => BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n; // raw = token1 per token0

describe("ArciaDeskRH", function () {
  let owner, op, other, weth, meme, junk, v3, v3b, pons, helper, desk, pool, junkPool, T;
  async function makePool(factory, a, b, ethPerToken) {
    await factory.createPool(a, b, 10000);
    const addr = await factory.getPool(a, b, 10000);
    const p = new ethers.Contract(addr, V3P.abi, owner);
    const t0 = await p.token0();
    // price = token1 per token0; the token costs `ethPerToken` WETH
    const raw = t0.toLowerCase() === T.weth.toLowerCase() ? 1 / ethPerToken : ethPerToken;
    await p.initialize(sqrtOf(raw));
    await helper.mint(addr, -887200, 887200, E(50));
    return p;
  }
  const decodeErr = (e, name) => desk.interface.decodeErrorResult(name, e.data || (e.error && e.error.data));
  async function quote(addr, isBuy, amt) { try { await desk.quote.staticCall(addr, isBuy, amt); } catch (e) { return decodeErr(e, "QuoteResult")[0]; } throw new Error("no revert"); }
  async function roundTrip(addr, amt) { try { await desk.quoteRoundTrip.staticCall(addr, amt); } catch (e) { const r = decodeErr(e, "RoundTripResult"); return [r[0], r[1]]; } throw new Error("no revert"); }

  beforeEach(async function () {
    [owner, op, other] = await ethers.getSigners();
    weth = await (await ethers.getContractFactory("MockWETH")).deploy();
    const Tok = await ethers.getContractFactory("TestToken");
    meme = await Tok.deploy("Meme", "MEME", 18); junk = await Tok.deploy("Junk", "JUNK", 18);
    T = { weth: await weth.getAddress(), meme: await meme.getAddress(), junk: await junk.getAddress() };
    const F = new ethers.ContractFactory(V3F.abi, V3F.bytecode, owner);
    v3 = await F.deploy(); v3b = await F.deploy();
    helper = await (await ethers.getContractFactory("V3Helper")).deploy();
    await weth.deposit({ value: E(500) });
    for (const t of [meme, junk]) await t.mint(owner.address, E(1e12));
    for (const t of [weth, meme, junk]) await t.approve(await helper.getAddress(), ethers.MaxUint256);
    pool = await makePool(v3, T.meme, T.weth, 1e-7);
    junkPool = await makePool(v3b, T.meme, T.weth, 1e-7); // same pair, another factory
    pons = await (await ethers.getContractFactory("MockPonsFactory")).deploy();
    await pons.register(T.meme, T.weth, await v3.getAddress(), await pool.getAddress(), 0);
    desk = await (await ethers.getContractFactory("ArciaDeskRH")).deploy(await v3.getAddress(), T.weth, [await pons.getAddress()], owner.address, op.address, E(0.005), E(0.05));
    await owner.sendTransaction({ to: await desk.getAddress(), value: E(0.02) }); // ETH in → WETH
  });

  it("wraps ETH sent to it and lists its launch factory", async function () {
    expect(await weth.balanceOf(await desk.getAddress())).to.equal(E(0.02));
    expect(await desk.factories()).to.deep.equal([await pons.getAddress()]);
    expect(await desk.launched(T.meme)).to.equal(true);
    expect(await desk.launched(T.junk)).to.equal(false);
  });

  it("quotes a buy and a sell without holding anything, and a round trip from its WETH", async function () {
    const empty = await (await ethers.getContractFactory("ArciaDeskRH")).deploy(await v3.getAddress(), T.weth, [await pons.getAddress()], owner.address, op.address, E(0.005), E(0.05));
    const d = desk; desk = empty;
    const out = await quote(await pool.getAddress(), true, E(0.001));
    expect(out).to.be.gt(E(9000)); // ~10,000 tokens for 0.001 WETH minus the 1% fee
    expect(out).to.be.lt(E(10000));
    const back = await quote(await pool.getAddress(), false, out);
    expect(back).to.be.lt(E(0.001));
    desk = d;
    const [tok, wethBack] = await roundTrip(await pool.getAddress(), E(0.001));
    expect(tok).to.equal(out);
    const loss = 1 - Number(wethBack) / Number(E(0.001));
    expect(loss).to.be.gt(0.019); expect(loss).to.be.lt(0.025); // two 1% fees + a little impact
  });

  it("buys and sells for the operator, within the caps", async function () {
    const p = await pool.getAddress();
    const q = await quote(p, true, E(0.004));
    await expect(desk.connect(op).buy(p, E(0.004), (q * 99n) / 100n)).to.emit(desk, "Trade").withArgs(T.meme, true, E(0.004), q);
    const bal = await meme.balanceOf(await desk.getAddress());
    expect(bal).to.equal(q);
    await expect(desk.connect(op).buy(p, E(0.006), 0)).to.be.revertedWithCustomError(desk, "OverTradeCap");
    const s = await quote(p, false, bal);
    await expect(desk.connect(op).sell(p, bal, s + 1n)).to.be.revertedWithCustomError(desk, "Slippage");
    await desk.connect(op).sell(p, bal, s);
    expect(await meme.balanceOf(await desk.getAddress())).to.equal(0n);
    expect(await desk.spentToday()).to.equal(E(0.004));
  });

  it("stops at the daily cap and while paused (selling still works)", async function () {
    const p = await pool.getAddress();
    await desk.setCaps(E(0.01), E(0.012));
    await desk.connect(op).buy(p, E(0.01), 0);
    await expect(desk.connect(op).buy(p, E(0.005), 0)).to.be.revertedWithCustomError(desk, "OverDailyCap");
    await ethers.provider.send("evm_increaseTime", [86400]); await ethers.provider.send("evm_mine", []);
    await desk.setPaused(true);
    await expect(desk.connect(op).buy(p, E(0.001), 0)).to.be.revertedWithCustomError(desk, "IsPaused");
    const bal = await meme.balanceOf(await desk.getAddress());
    await desk.connect(op).sell(p, bal, 0);
    await desk.setPaused(false);
    await desk.connect(op).buy(p, E(0.005), 0);
  });

  it("only trades the v3 factory's own WETH pools of launched tokens", async function () {
    await expect(desk.connect(op).buy(await junkPool.getAddress(), E(0.001), 0)).to.be.revertedWithCustomError(desk, "NotFactoryPool");
    // a token that isn't a pons launch
    const jp = await makePool(v3, T.junk, T.weth, 1e-7);
    await expect(desk.connect(op).buy(await jp.getAddress(), E(0.001), 0)).to.be.revertedWithCustomError(desk, "NotLaunched");
    // a pool without WETH
    const np = await makePool(v3, T.junk, T.meme, 1);
    await expect(desk.connect(op).buy(await np.getAddress(), E(0.001), 0)).to.be.revertedWithCustomError(desk, "NotWethPool");
    // the owner switches the launch factory off
    await desk.setLaunchFactory(await pons.getAddress(), false);
    await expect(desk.connect(op).buy(await pool.getAddress(), E(0.001), 0)).to.be.revertedWithCustomError(desk, "NotLaunched");
  });

  it("keeps roles apart and rejects stray callbacks", async function () {
    const p = await pool.getAddress();
    await expect(desk.connect(other).buy(p, E(0.001), 0)).to.be.revertedWithCustomError(desk, "NotOperator");
    await expect(desk.connect(owner).sell(p, 1, 0)).to.be.revertedWithCustomError(desk, "NotOperator");
    await expect(desk.connect(op).withdraw(T.weth, 1)).to.be.revertedWithCustomError(desk, "NotOwner");
    await expect(desk.connect(op).setCaps(1, 1)).to.be.revertedWithCustomError(desk, "NotOwner");
    await expect(desk.connect(op).setLaunchFactory(other.address, true)).to.be.revertedWithCustomError(desk, "NotOwner");
    await expect(desk.connect(other).uniswapV3SwapCallback(E(1), 0, ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [0]))).to.be.revertedWithCustomError(desk, "BadCallback");
  });

  it("withdraws only to the owner, as WETH, tokens or ETH", async function () {
    const p = await pool.getAddress();
    await desk.connect(op).buy(p, E(0.002), 0);
    const tok = await meme.balanceOf(await desk.getAddress());
    await desk.withdraw(T.meme, tok);
    expect(await meme.balanceOf(owner.address)).to.be.gte(tok);
    const before = await ethers.provider.getBalance(owner.address);
    const tx = await desk.withdrawETH(E(0.01));
    const rc = await tx.wait();
    const after = await ethers.provider.getBalance(owner.address);
    expect(after - before + rc.gasUsed * rc.gasPrice).to.equal(E(0.01));
    expect(await weth.balanceOf(await desk.getAddress())).to.equal(E(0.008));
  });
});
