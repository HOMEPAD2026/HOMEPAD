// ArciaAgentRH: burn vaults on Robinhood Chain — the real Uniswap v3 factory/pools and the real v4 PoolManager
// (native ETH and WETH pools, no hook / an approved hook), funded with ETH.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { factory: V3F, pool: V3P } = require("./lib/uniswap-v3.json");

const E = (n) => ethers.parseEther(String(n));
const ZERO = ethers.ZeroAddress, DEAD = "0x000000000000000000000000000000000000dEaD";
const HOOK_ADDR = "0x0000000000000000000000000000000000012044";
const sqrtOf = (raw) => BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n;

describe("ArciaAgentRH", function () {
  let owner, op, alice, bob, weth, meme, meme2, tax, honey, arc, v3, v3b, helper, pm, liq, F, T;
  const VA = (a) => ethers.getContractAt("ArciaAgentVaultRH", a);
  const err = (c, e, name) => c.interface.decodeErrorResult(name, e.data || (e.error && e.error.data));
  const q = async (v, amt) => { try { await v.quote.staticCall(amt); } catch (e) { return err(v, e, "QuoteResult")[0]; } throw new Error("no revert"); };
  const rt = async (v, amt) => { try { await v.quoteRoundTrip.staticCall(amt); } catch (e) { const r = err(v, e, "RoundTripResult"); return [r[0], r[1]]; } throw new Error("no revert"); };
  async function v3pool(factory, a, ethPerToken) {
    await factory.createPool(a, T.weth, 10000);
    const addr = await factory.getPool(a, T.weth, 10000);
    const p = new ethers.Contract(addr, V3P.abi, owner);
    const raw = (await p.token0()).toLowerCase() === T.weth.toLowerCase() ? 1 / ethPerToken : ethPerToken;
    await p.initialize(sqrtOf(raw));
    await helper.mint(addr, -887200, 887200, E(50));
    return p;
  }
  async function v4pool(token, eth, hooks, ethPerToken, fee = 2500, tickSpacing = 25) {
    const [c0, c1] = BigInt(token) < BigInt(eth) ? [token, eth] : [eth, token];
    const key = { currency0: c0, currency1: c1, fee, tickSpacing, hooks };
    await pm.initialize(key, sqrtOf(c0 === token ? ethPerToken : 1 / ethPerToken));
    const lo = -Math.floor(887272 / tickSpacing) * tickSpacing;
    await liq.modifyLiquidity(key, { tickLower: lo, tickUpper: -lo, liquidityDelta: E(2000), salt: ethers.ZeroHash }, "0x", { value: eth === ZERO ? E(200) : 0 });
    return key;
  }
  const open3 = async (p, who = alice, lim = [E(0.01), E(0.05), 60]) => { const tx = await F.connect(who).createVault3(await p.getAddress(), ...lim); const r = await tx.wait(); return VA(F.interface.parseLog(r.logs.find((l) => l.address === T.F)).args.vault); };
  const open4 = async (key, who = alice, lim = [E(0.01), E(0.05), 60]) => { const tx = await F.connect(who).createVault4(key, ...lim); const r = await tx.wait(); return VA(F.interface.parseLog(r.logs.find((l) => l.address === T.F)).args.vault); };

  beforeEach(async function () {
    [owner, op, alice, bob] = await ethers.getSigners();
    weth = await (await ethers.getContractFactory("MockWETH")).deploy();
    const Tok = await ethers.getContractFactory("TestToken");
    meme = await Tok.deploy("Meme", "MEME", 18); meme2 = await Tok.deploy("Meme Two", "MEME2", 18); arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 18);
    tax = await (await ethers.getContractFactory("MockFeeToken")).deploy(500);
    honey = await (await ethers.getContractFactory("MockHoneyToken")).deploy();
    T = { weth: await weth.getAddress(), meme: await meme.getAddress(), meme2: await meme2.getAddress(), tax: await tax.getAddress(), honey: await honey.getAddress() };
    const VF = new ethers.ContractFactory(V3F.abi, V3F.bytecode, owner);
    v3 = await VF.deploy(); v3b = await VF.deploy();
    helper = await (await ethers.getContractFactory("V3Helper")).deploy();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    await weth.deposit({ value: E(500) });
    for (const t of [meme, meme2]) await t.mint(owner.address, E(1e12));
    await arc.mint(alice.address, E(1e6));
    for (const t of [weth, meme, meme2, tax, honey]) { await t.approve(await helper.getAddress(), ethers.MaxUint256); await t.approve(await liq.getAddress(), ethers.MaxUint256); }
    await honey.setFree(await pm.getAddress(), true); await honey.setFree(await liq.getAddress(), true);
    const hook = await (await ethers.getContractFactory("TaxHook")).deploy(await pm.getAddress(), 300);
    await network.provider.send("hardhat_setCode", [HOOK_ADDR, await ethers.provider.getCode(await hook.getAddress())]);
    F = await (await ethers.getContractFactory("ArciaAgentFactoryRH")).deploy(await pm.getAddress(), await v3.getAddress(), T.weth, await arc.getAddress(), owner.address, op.address);
    T.F = await F.getAddress();
  });

  it("opens v3 vaults only for the v3 factory's live WETH pools, and v4 vaults only for ETH/WETH pools with no hook or an approved one", async function () {
    const p = await v3pool(v3, T.meme, 1e-7);
    const v = await open3(p);
    expect(await v.token()).to.equal(T.meme); expect(await v.kind()).to.equal(3n); expect(await v.pool()).to.equal(await p.getAddress());
    expect(await v.poolId()).to.equal(ethers.zeroPadValue(await p.getAddress(), 32));
    expect(await F.vaultsOf(T.meme)).to.deep.equal([await v.getAddress()]);
    const junk = await v3pool(v3b, T.meme, 1e-7);
    await expect(F.connect(alice).createVault3(await junk.getAddress(), E(0.01), E(0.05), 60)).to.be.revertedWithCustomError(F, "NotFactoryPool");
    await v3.createPool(T.meme, T.meme2, 10000);
    await expect(F.connect(alice).createVault3(await v3.getPool(T.meme, T.meme2, 10000), E(0.01), E(0.05), 60)).to.be.revertedWithCustomError(F, "NotEthPool");
    await v3.createPool(T.meme2, T.weth, 10000); // created, never initialized
    await expect(F.connect(alice).createVault3(await v3.getPool(T.meme2, T.weth, 10000), E(0.01), E(0.05), 60)).to.be.revertedWithCustomError(F, "PoolNotLive");
    const k = await v4pool(T.meme, ZERO, ZERO, 1e-7);
    const v4 = await open4(k);
    expect(await v4.kind()).to.equal(4n); expect(await v4.pool()).to.equal(ZERO);
    const plain = { currency0: T.meme < T.meme2 ? T.meme : T.meme2, currency1: T.meme < T.meme2 ? T.meme2 : T.meme, fee: 2500, tickSpacing: 25, hooks: ZERO };
    await expect(F.connect(alice).createVault4(plain, E(0.01), E(0.05), 60)).to.be.revertedWithCustomError(F, "NotEthPool");
    const hooked = await v4pool(T.meme, ZERO, HOOK_ADDR, 1e-7, 3000, 60);
    await expect(F.connect(alice).createVault4(hooked, E(0.01), E(0.05), 60)).to.be.revertedWithCustomError(F, "HookNotAllowed");
    await F.setHookAllowed(HOOK_ADDR, true);
    await open4(hooked);
    const notLive = { currency0: ZERO, currency1: T.meme2, fee: 2500, tickSpacing: 25, hooks: ZERO };
    await expect(F.connect(alice).createVault4(notLive, E(0.01), E(0.05), 60)).to.be.revertedWithCustomError(F, "PoolNotLive");
    await expect(F.connect(alice).createVault3(await p.getAddress(), 0, E(0.05), 60)).to.be.revertedWithCustomError(v, "BadLimits");
  });

  it("burns $ARCIRCLE to open a vault when the team sets a fee", async function () {
    const p = await v3pool(v3, T.meme, 1e-7);
    await F.setCreateBurn(E(1000));
    await expect(F.connect(alice).createVault3(await p.getAddress(), E(0.01), E(0.05), 60)).to.be.reverted; // no approval
    await arc.connect(alice).approve(T.F, E(1000));
    await open3(p);
    expect(await arc.balanceOf(DEAD)).to.equal(E(1000));
  });

  it("v3: ETH in becomes WETH; ARCIA buys and everything bought lands at 0x…dEaD", async function () {
    const p = await v3pool(v3, T.meme, 1e-7);
    const v = await open3(p), V = await v.getAddress();
    await bob.sendTransaction({ to: V, value: E(0.02) });
    await expect(v.connect(bob).fund({ value: E(0.01) })).to.emit(v, "Funded").withArgs(bob.address, E(0.01));
    expect(await v.balance()).to.equal(E(0.03));
    const out = await q(v, E(0.005));
    expect(out).to.be.gt(E(35000)).and.lt(E(50000));
    const [got, back] = await rt(v, E(0.001)); // round trip needs the vault's WETH on v3
    expect(got).to.be.gt(0n); expect(back).to.be.lt(E(0.001)).and.gt(E(0.00097));
    await expect(v.connect(op).buyAndBurn(E(0.005), (out * 99n) / 100n)).to.emit(v, "Burned").withArgs(E(0.005), out);
    expect(await meme.balanceOf(DEAD)).to.equal(out);
    expect(await meme.balanceOf(V)).to.equal(0n);
    expect(await v.balance()).to.equal(E(0.025));
    expect(await v.totalBurned()).to.equal(out); expect(await v.buys()).to.equal(1n);
  });

  it("v4 native ETH pool: quotes and round-trips holding nothing; buys from the vault's WETH; nothing left loose", async function () {
    const key = await v4pool(T.meme, ZERO, ZERO, 1e-7);
    const v = await open4(key), V = await v.getAddress();
    const out = await q(v, E(0.001));
    expect(out).to.be.gt(E(9900)).and.lt(E(10000));
    const [tok, back] = await rt(v, E(0.001));
    expect(tok).to.equal(out); expect(back).to.be.lt(E(0.001)).and.gt(E(0.00099));
    await v.connect(bob).fund({ value: E(0.01) });
    await v.connect(op).buyAndBurn(E(0.001), (out * 99n) / 100n);
    expect(await meme.balanceOf(DEAD)).to.equal(out);
    expect(await v.balance()).to.equal(E(0.009));
    expect(await ethers.provider.getBalance(V)).to.equal(0n);
  });

  it("v4 WETH pool, WETH on either side; an approved hook's tax shows in the quote", async function () {
    for (const t of [T.meme, T.meme2]) {
      const key = await v4pool(t, T.weth, ZERO, 1e-7, 3000, 60);
      const v = await open4(key);
      await v.connect(bob).fund({ value: E(0.01) });
      const out = await q(v, E(0.002));
      await v.connect(op).buyAndBurn(E(0.002), (out * 99n) / 100n);
      expect(await (t === T.meme ? meme : meme2).balanceOf(DEAD)).to.equal(out);
    }
    await F.setHookAllowed(HOOK_ADDR, true);
    const hooked = await open4(await v4pool(T.meme, ZERO, HOOK_ADDR, 1e-7, 3000, 60));
    const plain = await open4(await v4pool(T.meme, ZERO, ZERO, 1e-7, 3000, 60));
    expect(await q(hooked, E(0.001))).to.be.lt(await q(plain, E(0.001)));
  });

  it("a transfer-tax token shows in the round trip; minOut is checked against what reached 0x…dEaD", async function () {
    const key = await v4pool(T.tax, ZERO, ZERO, 1e-7);
    const v = await open4(key);
    const out = await q(v, E(0.001));
    const [held, back] = await rt(v, E(0.001));
    expect(held).to.equal(out - (out * 500n) / 10000n);
    expect(back).to.be.lt(E(0.00091));
    await v.connect(bob).fund({ value: E(0.01) });
    const d0 = await tax.balanceOf(DEAD);
    await v.connect(op).buyAndBurn(E(0.001), held);
    expect((await tax.balanceOf(DEAD)) - d0).to.be.gte(held); // this mock burns its cut to 0x…dEaD too
  });

  it("a honeypot gives no round-trip result", async function () {
    const key = await v4pool(T.honey, ZERO, ZERO, 1e-7);
    const v = await open4(key);
    await expect(v.quoteRoundTrip.staticCall(E(0.001))).to.be.reverted;
    try { await v.quoteRoundTrip.staticCall(E(0.001)); } catch (e) { expect(() => err(v, e, "RoundTripResult")).to.throw(); }
  });

  it("only ARCIA's key buys; the owner can turn her off; caps, cooldown and the daily limit hold", async function () {
    const v = await open4(await v4pool(T.meme, ZERO, ZERO, 1e-7));
    await v.connect(bob).fund({ value: E(0.1) });
    await expect(v.connect(alice).buyAndBurn(E(0.001), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await expect(v.connect(bob).buyAndBurn(E(0.001), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await expect(v.connect(op).buyAndBurn(E(0.001), 0)).to.be.revertedWithCustomError(v, "ZeroMinOut");
    await expect(v.connect(op).buyAndBurn(E(0.02), 1)).to.be.revertedWithCustomError(v, "OverMaxBuy");
    await v.connect(op).buyAndBurn(E(0.01), 1);
    await expect(v.connect(op).buyAndBurn(E(0.01), 1)).to.be.revertedWithCustomError(v, "Cooldown");
    for (let i = 0; i < 4; i++) { await time.increase(61); await v.connect(op).buyAndBurn(E(0.01), 1); }
    await time.increase(61);
    await expect(v.connect(op).buyAndBurn(E(0.01), 1)).to.be.revertedWithCustomError(v, "OverDailyCap");
    expect(await v.spendableToday()).to.equal(0n);
    await v.connect(alice).setAgentOn(false);
    expect(await v.operator()).to.equal(ZERO);
    await time.increase(86400);
    await expect(v.connect(op).buyAndBurn(E(0.01), 1)).to.be.revertedWithCustomError(v, "NotOperator");
  });

  it("limits: tighter now, looser only after an hour (anyone applies them)", async function () {
    const v = await open4(await v4pool(T.meme, ZERO, ZERO, 1e-7));
    await expect(v.connect(bob).setLimits(E(0.001), E(0.01), 120)).to.be.revertedWithCustomError(v, "NotOwner");
    await expect(v.connect(alice).setLimits(E(0.001), E(0.01), 120)).to.emit(v, "Limits");
    await expect(v.connect(alice).setLimits(E(0.05), E(0.5), 60)).to.emit(v, "LimitsQueued");
    expect(await v.maxBuy()).to.equal(E(0.001));
    await expect(v.connect(bob).applyLimits()).to.be.revertedWithCustomError(v, "NotReady");
    await time.increase(3601);
    await v.connect(bob).applyLimits();
    expect(await v.maxBuy()).to.equal(E(0.05));
  });

  it("pause (the owner's, and the team's) stops buys; withdraw always works, only to the owner, as WETH or ETH", async function () {
    const v = await open3(await v3pool(v3, T.meme, 1e-7));
    await v.connect(bob).fund({ value: E(0.05) });
    await v.connect(alice).setPaused(true);
    await expect(v.connect(op).buyAndBurn(E(0.001), 1)).to.be.revertedWithCustomError(v, "IsPaused");
    await v.connect(alice).setPaused(false);
    await F.setPaused(true);
    await expect(v.connect(op).buyAndBurn(E(0.001), 1)).to.be.revertedWithCustomError(v, "IsPaused");
    await expect(v.connect(bob).withdraw(T.weth, E(0.01))).to.be.revertedWithCustomError(v, "NotOwner");
    await expect(v.connect(op).withdrawETH(E(0.01))).to.be.revertedWithCustomError(v, "NotOwner");
    await v.connect(alice).withdraw(T.weth, E(0.01));
    expect(await weth.balanceOf(alice.address)).to.equal(E(0.01));
    const b0 = await ethers.provider.getBalance(alice.address);
    const r = await (await v.connect(alice).withdrawETH(E(0.04))).wait();
    expect((await ethers.provider.getBalance(alice.address)) - b0 + r.gasUsed * r.gasPrice).to.equal(E(0.04));
    expect(await v.balance()).to.equal(0n);
  });

  it("a new ARCIA key waits 24 hours; the old one keeps working until then", async function () {
    const v = await open4(await v4pool(T.meme, ZERO, ZERO, 1e-7));
    await v.connect(bob).fund({ value: E(0.05) });
    await F.queueOperator(bob.address);
    await expect(F.applyOperator()).to.be.revertedWithCustomError(F, "NotReady");
    await v.connect(op).buyAndBurn(E(0.001), 1);
    await time.increase(86401);
    await F.connect(alice).applyOperator();
    await expect(v.connect(op).buyAndBurn(E(0.001), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await v.connect(bob).buyAndBurn(E(0.001), 1);
  });

  it("a v3 callback from anything but its own pool, mid-swap, is refused", async function () {
    const v = await open3(await v3pool(v3, T.meme, 1e-7));
    await expect(v.connect(bob).uniswapV3SwapCallback(1, 1, ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [0]))).to.be.revertedWithCustomError(v, "BadCallback");
    await expect(v.connect(bob).unlockCallback("0x")).to.be.revertedWithCustomError(v, "BadCallback");
  });
});
