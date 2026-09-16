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

// Same "force low/high address" trick as the Paired suite, so both v4
// currency orderings get covered deterministically for the plain-token tests.
function mineAddressSalt(deployerAddress, initCodeHash, wantLow, maxTries = 200_000) {
  for (let salt = 0n; salt < BigInt(maxTries); salt++) {
    const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
    const addr = ethers.getCreate2Address(deployerAddress, saltHex, initCodeHash);
    const top = BigInt(addr) >> 156n;
    if (wantLow ? top === 0n : top === 15n) return { salt: saltHex, address: addr };
  }
  throw new Error("no salt found");
}

describe("HomepadFactoryArc — Uniswap v4 paired factory adapted for Arc", function () {
  const meta = { imageUrl: "", description: "", twitter: "", telegram: "", discord: "", website: "" };
  const VIRTUAL_QUOTE = ethers.parseEther("48");

  async function deployBase() {
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

    return { deployer, platformTreasury, platformWallet, alice, bob, factory, hook, poolManager, create2, create2Addr };
  }

  async function deployPlainQuote(wantLow, ctx) {
    const Mock = await ethers.getContractFactory("MockStockToken");
    const tx = await Mock.getDeployTransaction("Mock Quote", "MQT");
    const { salt, address } = mineAddressSalt(ctx.create2Addr, ethers.keccak256(tx.data), wantLow);
    await (await ctx.create2.deploy(salt, tx.data)).wait();
    const q = await ethers.getContractAt("MockStockToken", address);
    await (await q.mint(ctx.deployer.address, ethers.parseEther("1000000"))).wait();
    return q;
  }

  async function deployTaxedQuote(taxBps, wantLow, ctx) {
    const Mock = await ethers.getContractFactory("MockTaxToken");
    const tx = await Mock.getDeployTransaction("Taxed Quote", "TAXQ", taxBps);
    const { salt, address } = mineAddressSalt(ctx.create2Addr, ethers.keccak256(tx.data), wantLow);
    await (await ctx.create2.deploy(salt, tx.data)).wait();
    const q = await ethers.getContractAt("MockTaxToken", address);
    // CREATE2-deployed: the constructor's initial mint went to the create2
    // deployer contract, not ctx.deployer's EOA (same reason
    // deployPlainQuote below mints explicitly after deploying) — top up
    // the actual test deployer here.
    await (await q.mint(ctx.deployer.address, ethers.parseEther("1000000"))).wait();
    return q;
  }

  async function launchWith(factory, creator, quote, extraFee = 0) {
    const tx = await factory.connect(creator).launch("Arc Coin", "ARCC", await quote.getAddress(), VIRTUAL_QUOTE, extraFee, meta);
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
    return ev.args.token;
  }

  describe("core mechanics (plain quote token — same shape as HomepadFactoryPaired)", function () {
    it("launches with 8% to the platform treasury, none of the quote token from the creator, and a live pool", async function () {
      const ctx = await deployBase();
      const quote = await deployPlainQuote(true, ctx);
      const tokenAddr = await launchWith(ctx.factory, ctx.alice, quote);
      const token = await ethers.getContractAt("LaunchToken", tokenAddr);

      const treasuryBal = await token.balanceOf(ctx.platformTreasury.address);
      expect(treasuryBal).to.be.gte(ethers.parseEther("80000000"));
      expect(await quote.balanceOf(ctx.alice.address)).to.equal(0); // creator never had to hold any quote
      expect(await token.balanceOf(await ctx.factory.getAddress())).to.equal(0); // factory sweeps dust, holds nothing
    });

    it("works with the quote token sorting on either side (currency0 or currency1)", async function () {
      const ctx = await deployBase();
      const quoteLow = await deployPlainQuote(true, ctx);
      const quoteHigh = await deployPlainQuote(false, ctx);
      await expect(launchWith(ctx.factory, ctx.alice, quoteLow)).to.not.be.rejected;
      await expect(launchWith(ctx.factory, ctx.bob, quoteHigh)).to.not.be.rejected;
    });

    it("launchAndBuy pulls the quote from the caller and delivers tokens from the same transaction", async function () {
      const ctx = await deployBase();
      const quote = await deployPlainQuote(true, ctx);
      await (await quote.transfer(ctx.alice.address, ethers.parseEther("10"))).wait();
      await (await quote.connect(ctx.alice).approve(await ctx.factory.getAddress(), ethers.parseEther("10"))).wait();

      const tx = await ctx.factory.connect(ctx.alice).launchAndBuy("Arc Coin", "ARCC", await quote.getAddress(), VIRTUAL_QUOTE, 0, meta, ethers.parseEther("10"));
      const receipt = await tx.wait();
      const ev = receipt.logs.map((l) => { try { return ctx.factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
      const token = await ethers.getContractAt("LaunchToken", ev.args.token);

      expect(await quote.balanceOf(ctx.alice.address)).to.equal(0);
      expect(await token.balanceOf(ctx.alice.address)).to.be.gt(0);
    });
  });

  describe("fee-on-transfer-safe quote handling (the actual reason this file exists)", function () {
    it("launchAndBuy with a taxed quote token buys with the amount actually received, not the pre-tax amount", async function () {
      const ctx = await deployBase();
      const quote = await deployTaxedQuote(100, true, ctx); // 1% tax, quote sorts low (currency0)
      await (await quote.transfer(ctx.alice.address, ethers.parseEther("100"))).wait();
      await (await quote.connect(ctx.alice).approve(await ctx.factory.getAddress(), ethers.parseEther("10"))).wait();

      // Nominal 10, but the token takes 1% on transferFrom, so only 9.9
      // actually lands in the factory. The old (unfixed) contract would
      // have tried to forward the full nominal 10 downstream and reverted
      // on insufficient balance. This one should succeed, using 9.9.
      await expect(
        ctx.factory.connect(ctx.alice).launchAndBuy("Arc Coin", "ARCC", await quote.getAddress(), VIRTUAL_QUOTE, 0, meta, ethers.parseEther("10"))
      ).to.not.be.reverted;

      // Confirm nothing is stuck in the factory and the buyer actually got tokens.
      expect(await quote.balanceOf(await ctx.factory.getAddress())).to.equal(0);
    });

    it("reflects the actual received amount in how many tokens the dev buy is worth (less than an untaxed equivalent)", async function () {
      const ctxTaxed = await deployBase();
      const taxedQuote = await deployTaxedQuote(1000, true, ctxTaxed); // 10% tax — exaggerated to make the difference unmistakable
      // Funding is itself a taxed transfer, so send enough that alice's
      // actual (post-tax) balance safely covers the 100-nominal she'll
      // spend below (which itself needs 100 actual balance to move,
      // since spending N nominal costs the sender N total: net + burn).
      await (await taxedQuote.transfer(ctxTaxed.alice.address, ethers.parseEther("200"))).wait();
      await (await taxedQuote.connect(ctxTaxed.alice).approve(await ctxTaxed.factory.getAddress(), ethers.parseEther("100"))).wait();
      const taxedTx = await ctxTaxed.factory.connect(ctxTaxed.alice).launchAndBuy("Arc Coin", "ARCC", await taxedQuote.getAddress(), VIRTUAL_QUOTE, 0, meta, ethers.parseEther("100"));
      const taxedReceipt = await taxedTx.wait();
      const taxedEv = taxedReceipt.logs.map((l) => { try { return ctxTaxed.factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
      const taxedToken = await ethers.getContractAt("LaunchToken", taxedEv.args.token);
      const taxedBought = await taxedToken.balanceOf(ctxTaxed.alice.address);

      // 100 nominal crosses TWO taxed hops here: user -> factory (_pullQuote),
      // then factory -> pool manager (_devBuy's forward), 10% each time —
      // 100 * 0.9 * 0.9 = 81 actually reaches the pool. An untaxed token
      // moving exactly 81 nominal through the same two (now tax-free) hops
      // is the correct apples-to-apples equivalent, not 90 (which would
      // only account for a single hop of tax).
      const ctxPlain = await deployBase();
      const plainQuote = await deployTaxedQuote(0, true, ctxPlain); // 0% tax — same contract shape, apples-to-apples
      await (await plainQuote.transfer(ctxPlain.alice.address, ethers.parseEther("100"))).wait();
      await (await plainQuote.connect(ctxPlain.alice).approve(await ctxPlain.factory.getAddress(), ethers.parseEther("81"))).wait();
      const plainTx = await ctxPlain.factory.connect(ctxPlain.alice).launchAndBuy("Arc Coin", "ARCC", await plainQuote.getAddress(), VIRTUAL_QUOTE, 0, meta, ethers.parseEther("81"));
      const plainReceipt = await plainTx.wait();
      const plainEv = plainReceipt.logs.map((l) => { try { return ctxPlain.factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
      const plainToken = await ethers.getContractAt("LaunchToken", plainEv.args.token);
      const plainBought = await plainToken.balanceOf(ctxPlain.alice.address);

      // If either hop still used the pre-tax nominal amount instead of what
      // actually arrived, this would revert (insufficient balance heading
      // into the pool manager) rather than land on the correct, matching
      // amount the way it does here.
      expect(taxedBought).to.equal(plainBought);
    });

    it("plain launch() (no dev buy) is unaffected by a taxed quote token — nothing is pulled upfront", async function () {
      const ctx = await deployBase();
      const quote = await deployTaxedQuote(100, true, ctx);
      await expect(launchWith(ctx.factory, ctx.alice, quote)).to.not.be.rejected;
    });
  });
});
