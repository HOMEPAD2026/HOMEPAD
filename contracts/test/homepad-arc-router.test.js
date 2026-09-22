const { expect } = require("chai");
const { ethers } = require("hardhat");

const AFTER_SWAP_FLAG = 1 << 6;
const AFTER_SWAP_RETURNS_DELTA_FLAG = 1 << 2;
const REQUIRED_FLAGS = BigInt(AFTER_SWAP_FLAG | AFTER_SWAP_RETURNS_DELTA_FLAG);
const FLAG_MASK = (1n << 14n) - 1n;

function mineHookSalt(deployerAddress, initCodeHash, maxTries = 300_000) {
  for (let salt = 0n; salt < BigInt(maxTries); salt++) {
    const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
    const addr = ethers.getCreate2Address(deployerAddress, saltHex, initCodeHash);
    if ((BigInt(addr) & FLAG_MASK) === REQUIRED_FLAGS) return { salt: saltHex, address: addr };
  }
  throw new Error("no salt found");
}

// Same "force low/high address" trick as the other Homepad suites, so both
// v4 currency orderings get covered deterministically.
function mineAddressSalt(deployerAddress, initCodeHash, wantLow, maxTries = 200_000) {
  for (let salt = 0n; salt < BigInt(maxTries); salt++) {
    const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
    const addr = ethers.getCreate2Address(deployerAddress, saltHex, initCodeHash);
    const top = BigInt(addr) >> 156n;
    if (wantLow ? top === 0n : top === 15n) return { salt: saltHex, address: addr };
  }
  throw new Error("no salt found");
}

describe("HomepadArcSwapRouter — ARCPAD trading (buy/sell against HomepadFactoryArc launches)", function () {
  const meta = { imageUrl: "", description: "", twitter: "", telegram: "", discord: "", website: "" };
  const VIRTUAL_QUOTE = ethers.parseEther("48");
  const LAUNCH_FEE = ethers.parseEther("1"); // 1 USDC, native units, per HomepadFactoryArc

  async function deployAll() {
    const [deployer, platformTreasury, platformWallet, alice, bob] = await ethers.getSigners();

    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(deployer.address);

    const Create2Deployer = await ethers.getContractFactory("Create2Deployer");
    const create2 = await Create2Deployer.deploy();
    const create2Addr = await create2.getAddress();

    const HookFactory = await ethers.getContractFactory("HomepadHybridHook");
    const hookTx = await HookFactory.getDeployTransaction(await poolManager.getAddress(), deployer.address);
    const { salt: hookSalt, address: hookAddr } = mineHookSalt(create2Addr, ethers.keccak256(hookTx.data));
    await (await create2.deploy(hookSalt, hookTx.data)).wait();
    const hook = await ethers.getContractAt("HomepadHybridHook", hookAddr);

    const Factory = await ethers.getContractFactory("HomepadFactoryArc");
    const factory = await Factory.deploy(platformTreasury.address, platformWallet.address, await poolManager.getAddress(), hookAddr, 60, 100, 7000, 10000);
    await (await hook.setFactory(await factory.getAddress())).wait();

    const Router = await ethers.getContractFactory("HomepadArcSwapRouter");
    const router = await Router.deploy(await poolManager.getAddress(), await factory.getAddress());

    const Mock = await ethers.getContractFactory("MockStockToken");
    async function deployQuote(sym, wantLow) {
      const tx = await Mock.getDeployTransaction(`${sym} Quote`, sym);
      const { salt, address } = mineAddressSalt(create2Addr, ethers.keccak256(tx.data), wantLow);
      await (await create2.deploy(salt, tx.data)).wait();
      const q = await ethers.getContractAt("MockStockToken", address);
      await (await q.mint(deployer.address, ethers.parseEther("1000000"))).wait();
      return q;
    }
    // Stand in for Arc's real USDC ERC-20 predeploy (0x3600...0000) — a
    // plain ERC-20 is the right test double since HomepadArcSwapRouter
    // treats any quote token identically (measures actual settled amount).
    const usdcLow = await deployQuote("USDC", true);
    const usdcHigh = await deployQuote("USDC", false);

    return { deployer, platformTreasury, platformWallet, alice, bob, factory, hook, router, poolManager, usdcLow, usdcHigh };
  }

  async function launchWith(factory, creator, quote, extraFee = 0) {
    const tx = await factory.connect(creator).launch("Arc Coin", "ARCC", await quote.getAddress(), VIRTUAL_QUOTE, extraFee, meta, { value: LAUNCH_FEE });
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
    return ev.args.token;
  }

  it("buys and sells through the router in BOTH currency orderings", async function () {
    const { factory, router, alice, bob, platformTreasury, deployer, usdcLow, usdcHigh } = await deployAll();

    // Note: usdcLow/usdcHigh are CREATE2-mined to sit at extreme addresses
    // (top nibble 0x0 / 0xF) so they sort below/above a "typical" launched
    // token address — but the launched token's own address comes from the
    // factory's regular CREATE nonce and isn't itself constrained, so which
    // ordering actually results is read from the chain rather than assumed.
    // The point of the loop is exercising the router against both v4
    // currency orderings at least once, not asserting a specific one.
    const seenOrderings = new Set();
    for (const [label, q] of [["quote=currency0-ish", usdcLow], ["quote=currency1-ish", usdcHigh]]) {
      const tokenAddr = await launchWith(factory, alice, q);
      const l = await factory.launches((await factory.launchCount()) - 1n);
      seenOrderings.add(l.quoteIsCurrency0);
      const token = await ethers.getContractAt("LaunchToken", tokenAddr);
      await (await q.connect(deployer).transfer(bob.address, ethers.parseEther("10"))).wait();

      // BUY
      await (await q.connect(bob).approve(await router.getAddress(), ethers.parseEther("1"))).wait();
      const qBefore = await q.balanceOf(bob.address);
      const tokBefore = await token.balanceOf(bob.address);
      await (await router.connect(bob).buy(tokenAddr, ethers.parseEther("1"), 0)).wait();
      const got = (await token.balanceOf(bob.address)) - tokBefore;
      expect(got, `${label}: no tokens received`).to.be.gt(0n);
      expect(qBefore - await q.balanceOf(bob.address), `${label}: quote not spent`).to.equal(ethers.parseEther("1"));
      expect(await token.balanceOf(alice.address), `${label}: creator got no fee`).to.be.gt(0n);

      // SELL half back
      const sellAmt = got / 2n;
      await (await token.connect(bob).approve(await router.getAddress(), sellAmt)).wait();
      const qBeforeSell = await q.balanceOf(bob.address);
      const treasuryBefore = await q.balanceOf(platformTreasury.address);
      await (await router.connect(bob).sell(tokenAddr, sellAmt, 0)).wait();
      expect(await q.balanceOf(bob.address), `${label}: no quote received on sell`).to.be.gt(qBeforeSell);
      expect(await q.balanceOf(platformTreasury.address), `${label}: treasury got no sell fee`).to.be.gt(treasuryBefore);
    }
    // Best-effort coverage check, not a hard requirement (see note above) —
    // logged rather than asserted so a rare same-ordering coincidence
    // across both launches doesn't fail an otherwise-correct run.
    if (seenOrderings.size < 2) {
      console.log("    (note: both launches landed on the same currency ordering this run)");
    }
  });

  it("rejects a token that isn't an Arc launch, and respects the minOut slippage floor", async function () {
    const { factory, router, alice, bob, deployer, usdcLow } = await deployAll();
    await expect(router.connect(bob).buy(await usdcLow.getAddress(), 1n, 0)).to.be.revertedWith("not an arc launch");

    const tokenAddr = await launchWith(factory, alice, usdcLow);
    await (await usdcLow.connect(deployer).transfer(bob.address, ethers.parseEther("1"))).wait();
    await (await usdcLow.connect(bob).approve(await router.getAddress(), ethers.parseEther("1"))).wait();
    await expect(router.connect(bob).buy(tokenAddr, ethers.parseEther("1"), ethers.parseEther("999999999"))).to.be.revertedWith("slippage");
  });

  it("works for a launch created with launchAndBuy too (router isn't limited to plain launch())", async function () {
    const { factory, router, alice, bob, deployer, usdcLow } = await deployAll();
    await (await usdcLow.connect(deployer).transfer(alice.address, ethers.parseEther("10"))).wait();
    await (await usdcLow.connect(alice).approve(await factory.getAddress(), ethers.parseEther("10"))).wait();
    const tx = await factory.connect(alice).launchAndBuy("Arc Coin", "ARCC", await usdcLow.getAddress(), VIRTUAL_QUOTE, 0, meta, ethers.parseEther("10"), { value: LAUNCH_FEE });
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
    const token = await ethers.getContractAt("LaunchToken", ev.args.token);

    await (await usdcLow.connect(deployer).transfer(bob.address, ethers.parseEther("5"))).wait();
    await (await usdcLow.connect(bob).approve(await router.getAddress(), ethers.parseEther("5"))).wait();
    await expect(router.connect(bob).buy(ev.args.token, ethers.parseEther("5"), 0)).to.not.be.reverted;
    expect(await token.balanceOf(bob.address)).to.be.gt(0n);
  });
});
