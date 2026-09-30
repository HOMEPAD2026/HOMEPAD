// ARCIA AGENT vaults against the real Uniswap v4 PoolManager, with an Argus-like tax hook (0x2044 permissions).
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const U = (n) => ethers.parseUnits(String(n), 6);
const E = (n) => ethers.parseEther(String(n));
const HOOK_ADDR = "0x0000000000000000000000000000000000012044";
const ODD_HOOK = "0x0000000000000000000000000000000000014444";
const DEAD = "0x000000000000000000000000000000000000dEaD";
function sqrtFor(p, tokenIs0) { const raw = tokenIs0 ? (p * 1e6) / 1e18 : 1 / ((p * 1e6) / 1e18); return BigInt(Math.floor(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n; }
const inc = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };

describe("ArciaAgent", function () {
  let pm, liq, usdc, meme, arc, fac, owner, op, alice, bob, T, hookKey, plainKey, oddKey;
  const keyOf = (token, hooks) => { const [c0, c1] = BigInt(token) < BigInt(T.usdc) ? [token, T.usdc] : [T.usdc, token]; return { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks }; };
  async function pool(token, hooks, price, init = true) {
    const key = keyOf(token, hooks);
    if (!init) return key;
    await pm.initialize(key, sqrtFor(price, key.currency0 === token));
    await liq.modifyLiquidity(key, { tickLower: -887220, tickUpper: 887220, liquidityDelta: E(5), salt: ethers.ZeroHash }, "0x");
    return key;
  }
  async function open(who, key, maxBuy = U(5), day = U(20), cd = 300) {
    const tx = await fac.connect(who).createVault(key, maxBuy, day, cd);
    const r = await tx.wait();
    const ev = r.logs.map((l) => { try { return fac.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "VaultCreated");
    return ethers.getContractAt("ArciaAgentVault", ev.args.vault);
  }
  const err = (c, e, name) => c.interface.decodeErrorResult(name, e.data || (e.error && e.error.data));
  async function quote(v, amt) { try { await v.quote.staticCall(amt); } catch (e) { return err(v, e, "QuoteResult")[0]; } throw new Error("no revert"); }
  async function rt(v, amt) { try { await v.quoteRoundTrip.staticCall(amt); } catch (e) { const r = err(v, e, "RoundTripResult"); return [r[0], r[1]]; } throw new Error("no revert"); }

  beforeEach(async function () {
    [owner, op, alice, bob] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    liq = await (await ethers.getContractFactory("PoolModifyLiquidityTest")).deploy(await pm.getAddress());
    const Tok = await ethers.getContractFactory("TestToken");
    usdc = await Tok.deploy("USD Coin", "USDC", 6); meme = await Tok.deploy("Meme", "MEME", 18); arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 18);
    T = { usdc: await usdc.getAddress(), meme: await meme.getAddress(), arc: await arc.getAddress() };
    for (const t of [usdc, meme, arc]) { await t.mint(owner.address, t === usdc ? U(10_000_000) : E(1e12)); await t.approve(await liq.getAddress(), ethers.MaxUint256); }
    await usdc.mint(alice.address, U(1000)); await usdc.mint(bob.address, U(1000)); await arc.mint(alice.address, E(1_000_000));
    const hook = await (await ethers.getContractFactory("TaxHook")).deploy(await pm.getAddress(), 300);
    await network.provider.send("hardhat_setCode", [HOOK_ADDR, await ethers.provider.getCode(await hook.getAddress())]);
    hookKey = await pool(T.meme, HOOK_ADDR, 0.0001);
    plainKey = await pool(T.meme, ethers.ZeroAddress, 0.0001);
    oddKey = keyOf(T.meme, ODD_HOOK);
    fac = await (await ethers.getContractFactory("ArciaAgentFactory")).deploy(await pm.getAddress(), T.usdc, T.arc, owner.address, op.address);
  });

  it("opens a vault for a live USDC pool; rejects a non-USDC pool, an unknown hook and a pool that doesn't exist", async function () {
    const v = await open(alice, hookKey);
    expect(await v.owner()).to.equal(alice.address);
    expect(await v.token()).to.equal(T.meme);
    expect(await fac.vaultCount()).to.equal(1n);
    expect(await fac.vaultsOf(T.meme)).to.deep.equal([await v.getAddress()]);
    expect(await fac.vaultsBy(alice.address)).to.deep.equal([await v.getAddress()]);
    expect(await v.operator()).to.equal(op.address);
    const memeArc = { currency0: T.meme < T.arc ? T.meme : T.arc, currency1: T.meme < T.arc ? T.arc : T.meme, fee: 3000, tickSpacing: 60, hooks: ethers.ZeroAddress };
    await expect(fac.connect(alice).createVault(memeArc, U(5), U(20), 300)).to.be.revertedWithCustomError(fac, "NotUsdcPool");
    await expect(fac.connect(alice).createVault(oddKey, U(5), U(20), 300)).to.be.revertedWithCustomError(fac, "HookNotAllowed");
    await expect(fac.connect(alice).createVault(keyOf(T.meme, ethers.ZeroAddress) && { ...plainKey, fee: 500, tickSpacing: 10 }, U(5), U(20), 300)).to.be.revertedWithCustomError(fac, "PoolNotLive");
    await expect(fac.connect(alice).createVault(hookKey, 0, U(20), 300)).to.be.revertedWithCustomError(v, "BadLimits");
    await expect(fac.connect(alice).createVault(hookKey, U(5), U(4), 300)).to.be.revertedWithCustomError(v, "BadLimits");
    await expect(fac.connect(alice).createVault(hookKey, U(5), U(20), 30)).to.be.revertedWithCustomError(v, "BadLimits");
    // an exact hook address the team allows
    await fac.setHookAllowed(ODD_HOOK, true);
    await expect(fac.connect(alice).createVault(oddKey, U(5), U(20), 300)).to.be.revertedWithCustomError(fac, "PoolNotLive"); // allowed, just not initialized
  });

  it("burns $ARCIRCLE to open a vault when the team sets a fee", async function () {
    await fac.setCreateBurn(E(1000));
    await expect(fac.connect(bob).createVault(hookKey, U(5), U(20), 300)).to.be.reverted; // no $ARCIRCLE / no approval
    await arc.connect(alice).approve(await fac.getAddress(), E(1000));
    const dead0 = await arc.balanceOf(DEAD);
    await open(alice, hookKey);
    expect((await arc.balanceOf(DEAD)) - dead0).to.equal(E(1000));
  });

  it("ARCIA buys and burns: everything bought goes to 0x…dEaD, nothing stays in the vault", async function () {
    const v = await open(alice, hookKey);
    await usdc.connect(bob).approve(await v.getAddress(), U(50));
    await expect(v.connect(bob).fund(U(50))).to.emit(v, "Funded");
    const q = await quote(v, U(5));
    expect(q).to.be.gt(0n);
    const dead0 = await meme.balanceOf(DEAD);
    await expect(v.connect(op).buyAndBurn(U(5), (q * 99n) / 100n)).to.emit(v, "Burned");
    expect((await meme.balanceOf(DEAD)) - dead0).to.equal(q);
    expect(await meme.balanceOf(await v.getAddress())).to.equal(0n);
    expect(await usdc.balanceOf(await v.getAddress())).to.equal(U(45));
    expect(await v.totalBurned()).to.equal(q);
    expect(await v.totalSpent()).to.equal(U(5));
    expect(await v.buys()).to.equal(1n);
    // the round trip shows the tax (3% each way + pool fees)
    const [got, back] = await rt(v, U(5));
    expect(got).to.be.gt(0n); expect(back).to.be.lt(U(5)); expect(back).to.be.gt(U(4.3));
  });

  it("only ARCIA's key buys, never the owner or anyone else; the owner can turn her off", async function () {
    const v = await open(alice, hookKey);
    await usdc.connect(alice).transfer(await v.getAddress(), U(20));
    const q = await quote(v, U(2));
    await expect(v.connect(alice).buyAndBurn(U(2), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await expect(v.connect(bob).buyAndBurn(U(2), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await v.connect(alice).setAgentOn(false);
    expect(await v.operator()).to.equal(ethers.ZeroAddress);
    await expect(v.connect(op).buyAndBurn(U(2), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await v.connect(alice).setAgentOn(true);
    await expect(v.connect(op).buyAndBurn(U(2), q + 1n)).to.be.revertedWithCustomError(v, "Slippage");
    await expect(v.connect(op).buyAndBurn(U(2), 0)).to.be.revertedWithCustomError(v, "ZeroMinOut");
    await v.connect(op).buyAndBurn(U(2), 1);
  });

  it("per-buy cap, cooldown and daily cap", async function () {
    const v = await open(alice, hookKey, U(5), U(12), 300);
    await usdc.connect(alice).transfer(await v.getAddress(), U(100));
    await expect(v.connect(op).buyAndBurn(U(6), 1)).to.be.revertedWithCustomError(v, "OverMaxBuy");
    await v.connect(op).buyAndBurn(U(5), 1);
    await expect(v.connect(op).buyAndBurn(U(5), 1)).to.be.revertedWithCustomError(v, "Cooldown");
    await inc(301);
    await v.connect(op).buyAndBurn(U(5), 1);
    await inc(301);
    expect(await v.spendableToday()).to.equal(U(2));
    await expect(v.connect(op).buyAndBurn(U(5), 1)).to.be.revertedWithCustomError(v, "OverDailyCap");
    await v.connect(op).buyAndBurn(U(2), 1);
    await inc(86400);
    await v.connect(op).buyAndBurn(U(5), 1); // a new UTC day
  });

  it("limits: tighter now, looser only after an hour (anyone applies it)", async function () {
    const v = await open(alice, hookKey, U(5), U(20), 300);
    await expect(v.connect(bob).setLimits(U(1), U(2), 600)).to.be.revertedWithCustomError(v, "NotOwner");
    await v.connect(alice).setLimits(U(2), U(10), 600);
    expect(await v.maxBuy()).to.equal(U(2));
    expect(await v.cooldown()).to.equal(600n);
    await expect(v.connect(alice).setLimits(U(50), U(500), 60)).to.emit(v, "LimitsQueued");
    expect(await v.maxBuy()).to.equal(U(2));
    await expect(v.connect(bob).applyLimits()).to.be.revertedWithCustomError(v, "NotReady");
    await inc(3601);
    await v.connect(bob).applyLimits();
    expect(await v.maxBuy()).to.equal(U(50));
    expect(await v.dailyCap()).to.equal(U(500));
    expect(await v.cooldown()).to.equal(60n);
    await expect(v.connect(bob).applyLimits()).to.be.revertedWithCustomError(v, "NoPending");
    // a queued loosening is dropped by a later tightening
    await v.connect(alice).setLimits(U(100), U(500), 60);
    await v.connect(alice).setLimits(U(1), U(1), 60);
    await inc(3601);
    await expect(v.applyLimits()).to.be.revertedWithCustomError(v, "NoPending");
    expect(await v.maxBuy()).to.equal(U(1));
  });

  it("pause (the owner's, and the team's global stop) stops buys; withdraw always works, only to the owner", async function () {
    const v = await open(alice, hookKey);
    await usdc.connect(bob).transfer(await v.getAddress(), U(30));
    await v.connect(alice).setPaused(true);
    await expect(v.connect(op).buyAndBurn(U(2), 1)).to.be.revertedWithCustomError(v, "IsPaused");
    await v.connect(alice).setPaused(false);
    await fac.setPaused(true);
    await expect(v.connect(op).buyAndBurn(U(2), 1)).to.be.revertedWithCustomError(v, "IsPaused");
    await expect(v.connect(bob).withdraw(T.usdc, U(1))).to.be.revertedWithCustomError(v, "NotOwner");
    await expect(v.connect(owner).withdraw(T.usdc, U(1))).to.be.revertedWithCustomError(v, "NotOwner"); // the team can't either
    const a0 = await usdc.balanceOf(alice.address);
    await v.connect(alice).withdraw(T.usdc, U(30));
    expect((await usdc.balanceOf(alice.address)) - a0).to.equal(U(30));
    await expect(fac.connect(alice).setPaused(false)).to.be.revertedWithCustomError(fac, "NotOwner");
  });

  it("a new ARCIA key waits 24 hours; the old one keeps working until then", async function () {
    const v = await open(alice, hookKey);
    await usdc.connect(alice).transfer(await v.getAddress(), U(30));
    await expect(fac.connect(bob).queueOperator(bob.address)).to.be.revertedWithCustomError(fac, "NotOwner");
    await fac.queueOperator(bob.address);
    await expect(fac.applyOperator()).to.be.revertedWithCustomError(fac, "NotReady");
    await expect(v.connect(bob).buyAndBurn(U(1), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await v.connect(op).buyAndBurn(U(1), 1);
    await inc(86401);
    await fac.connect(alice).applyOperator(); // anyone, once it's due
    expect(await v.operator()).to.equal(bob.address);
    await expect(v.connect(op).buyAndBurn(U(1), 1)).to.be.revertedWithCustomError(v, "NotOperator");
    await v.connect(bob).buyAndBurn(U(1), 1);
  });

  it("has no way to sell or move the token except to 0x…dEaD", async function () {
    const v = await open(alice, hookKey);
    const names = v.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    expect(names.some((n) => /sell|swap|transfer|approve/i.test(n))).to.equal(false);
    // tokens someone sends in by mistake can only go back to the owner
    await meme.transfer(await v.getAddress(), E(10));
    await v.connect(alice).withdraw(T.meme, E(10));
    expect(await meme.balanceOf(alice.address)).to.equal(E(10));
  });

  it("works with a plain pool (no hook) and the owner can hand the vault over", async function () {
    const v = await open(alice, plainKey);
    await usdc.connect(alice).transfer(await v.getAddress(), U(10));
    await v.connect(op).buyAndBurn(U(3), 1);
    await v.connect(alice).setOwner(bob.address);
    await expect(v.connect(alice).withdraw(T.usdc, U(1))).to.be.revertedWithCustomError(v, "NotOwner");
    await v.connect(bob).withdraw(T.usdc, U(7));
    await fac.setAllowNoHook(false);
    await expect(fac.connect(alice).createVault(plainKey, U(5), U(20), 300)).to.be.revertedWithCustomError(fac, "HookNotAllowed");
  });
});
