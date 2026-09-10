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

// Mines a CREATE2 salt so the quote token lands at a LOW or HIGH address —
// that forces it to sort before / after any token the factory creates,
// which is how both v4 currency orderings get covered deterministically.
function mineAddressSalt(deployerAddress, initCodeHash, wantLow, maxTries = 200_000) {
  for (let salt = 0n; salt < BigInt(maxTries); salt++) {
    const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
    const addr = ethers.getCreate2Address(deployerAddress, saltHex, initCodeHash);
    const top = BigInt(addr) >> 156n; // top nibble
    if (wantLow ? top === 0n : top === 15n) return { salt: saltHex, address: addr };
  }
  throw new Error("no salt found");
}

describe("HOMEPAD — Paired Hybrid (ERC-20 quote: stock tokens / $HOME)", function () {
  const meta = { imageUrl: "", description: "", twitter: "", telegram: "", discord: "", website: "" };
  const VIRTUAL_QUOTE = ethers.parseEther("48"); // e.g. "48 TSLA buys the whole supply"

  async function deployAll() {
    const [deployer, homeTreasury, platformWallet, alice, bob] = await ethers.getSigners();

    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(deployer.address);

    const Create2Deployer = await ethers.getContractFactory("Create2Deployer");
    const create2 = await Create2Deployer.deploy();
    const create2Addr = await create2.getAddress();

    // Hook: same HomepadHybridHook, its own instance (setFactory is one-shot).
    const HookFactory = await ethers.getContractFactory("HomepadHybridHook");
    const hookTx = await HookFactory.getDeployTransaction(await poolManager.getAddress(), deployer.address);
    const { salt: hookSalt, address: hookAddr } = mineHookSalt(create2Addr, ethers.keccak256(hookTx.data));
    await (await create2.deploy(hookSalt, hookTx.data)).wait();
    const hook = await ethers.getContractAt("HomepadHybridHook", hookAddr);

    const Factory = await ethers.getContractFactory("HomepadFactoryPaired");
    const factory = await Factory.deploy(homeTreasury.address, platformWallet.address, await poolManager.getAddress(), hookAddr, 60, 100, 7000, 10000);
    await (await hook.setFactory(await factory.getAddress())).wait();

    const Router = await ethers.getContractFactory("HomepadPairedSwapRouter");
    const router = await Router.deploy(await poolManager.getAddress(), await factory.getAddress());

    // Two quote tokens at forced-LOW and forced-HIGH addresses: a low one
    // always sorts before any token the factory creates (quote = currency0),
    // a high one always sorts after it (quote = currency1).
    const Mock = await ethers.getContractFactory("MockStockToken");
    async function deployQuote(sym, wantLow) {
      const tx = await Mock.getDeployTransaction(`${sym} Stock`, sym);
      const { salt, address } = mineAddressSalt(create2Addr, ethers.keccak256(tx.data), wantLow);
      await (await create2.deploy(salt, tx.data)).wait();
      const q = await ethers.getContractAt("MockStockToken", address);
      await (await q.mint(deployer.address, ethers.parseEther("1000000"))).wait();
      return q;
    }
    const quoteLow = await deployQuote("TSLA", true);
    const quoteHigh = await deployQuote("NVDA", false);

    return { deployer, homeTreasury, platformWallet, alice, bob, factory, hook, router, poolManager, quoteLow, quoteHigh };
  }

  async function fundedQuotes(count) {
    const Mock = await ethers.getContractFactory("MockStockToken");
    const out = [];
    for (let i = 0; i < count; i++) out.push(await Mock.deploy(`Stock ${i}`, `STK${i}`));
    return out;
  }

  async function launchWith(factory, creator, quote, extraFee = 0) {
    const tx = await factory.connect(creator).launch("Paired Coin", "PRD", await quote.getAddress(), VIRTUAL_QUOTE, extraFee, meta);
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
    return ev.args.token;
  }

  it("launches with 8% to $HOME treasury, none of the quote token from the creator, and a live pool", async function () {
    const { factory, homeTreasury, alice } = await deployAll();
    const [quote] = await fundedQuotes(1);
    const tokenAddr = await launchWith(factory, alice, quote);
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);

    // 8% allocation, plus the few wei of single-sided-liquidity rounding dust
    // the factory sweeps to the treasury so it never holds anything itself.
    const treasuryBal = await token.balanceOf(homeTreasury.address);
    expect(treasuryBal).to.be.gte(ethers.parseEther("80000000"));
    expect(treasuryBal - ethers.parseEther("80000000")).to.be.lt(1_000_000n);
    expect(await token.balanceOf(await factory.getAddress())).to.equal(0n);
    expect(await factory.quoteOf(tokenAddr)).to.equal(await quote.getAddress());
    const l = await factory.launches(0);
    expect(l.initialVirtualQuote).to.equal(VIRTUAL_QUOTE);
    // ordering flag matches raw address order
    expect(l.quoteIsCurrency0).to.equal(BigInt(await quote.getAddress()) < BigInt(tokenAddr));
    const key = await factory.poolKeyOf(tokenAddr);
    expect(BigInt(key.currency0) < BigInt(key.currency1)).to.equal(true);
  });

  it("buys and sells through the router in BOTH currency orderings", async function () {
    const { factory, router, alice, bob, homeTreasury, deployer, quoteLow, quoteHigh } = await deployAll();

    for (const [label, q, expectQuoteIs0] of [["quote=currency0", quoteLow, true], ["quote=currency1", quoteHigh, false]]) {
      const tokenAddr = await launchWith(factory, alice, q);
      const l = await factory.launches((await factory.launchCount()) - 1n);
      expect(l.quoteIsCurrency0, label).to.equal(expectQuoteIs0);
      const token = await ethers.getContractAt("LaunchToken", tokenAddr);
      await (await q.connect(deployer).transfer(bob.address, ethers.parseEther("10"))).wait();

      // BUY: 1 quote → tokens
      await (await q.connect(bob).approve(await router.getAddress(), ethers.parseEther("1"))).wait();
      const qBefore = await q.balanceOf(bob.address);
      const tokBefore = await token.balanceOf(bob.address);
      await (await router.connect(bob).buy(tokenAddr, ethers.parseEther("1"), 0)).wait();
      const got = (await token.balanceOf(bob.address)) - tokBefore;
      expect(got, `${label}: no tokens received`).to.be.gt(0n);
      expect(qBefore - await q.balanceOf(bob.address), `${label}: quote not spent`).to.equal(ethers.parseEther("1"));
      // fee on a buy is taken from the OUTPUT (token) side → creator + home get tokens
      expect(await token.balanceOf(alice.address), `${label}: creator got no fee`).to.be.gt(0n);

      // SELL: half back → quote
      const sellAmt = got / 2n;
      await (await token.connect(bob).approve(await router.getAddress(), sellAmt)).wait();
      const qBeforeSell = await q.balanceOf(bob.address);
      const homeBefore = await q.balanceOf(homeTreasury.address);
      await (await router.connect(bob).sell(tokenAddr, sellAmt, 0)).wait();
      expect(await q.balanceOf(bob.address), `${label}: no quote received on sell`).to.be.gt(qBeforeSell);
      // fee on a sell is taken from the OUTPUT (quote) side → treasury's quote balance grows
      expect(await q.balanceOf(homeTreasury.address), `${label}: treasury got no sell fee`).to.be.gt(homeBefore);
    }
  });

  it("starts at the intended price: the first small buy is priced off initialVirtualQuote", async function () {
    const { factory, router, alice, bob, deployer } = await deployAll();
    const [q] = await fundedQuotes(1);
    const tokenAddr = await launchWith(factory, alice, q);
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);
    await (await q.connect(deployer).transfer(bob.address, ethers.parseEther("1"))).wait();
    await (await q.connect(bob).approve(await router.getAddress(), ethers.parseEther("0.001"))).wait();
    await (await router.connect(bob).buy(tokenAddr, ethers.parseEther("0.001"), 0)).wait();
    const got = Number(ethers.formatEther(await token.balanceOf(bob.address)));
    // 48 quote buys 1B tokens → 0.001 quote ≈ 20,833 tokens before fee + tiny impact.
    // Accept ±3% (1% fee, tick-spacing alignment, rounding).
    const ideal = 1e9 * 0.001 / 48;
    expect(got).to.be.within(ideal * 0.95, ideal * 1.0);
  });

  it("launchAndBuy: atomic dev buy pulled via transferFrom, nothing left in the factory", async function () {
    const { factory, alice } = await deployAll();
    const [deployer] = await ethers.getSigners();
    const [q] = await fundedQuotes(1);
    await (await q.connect(deployer).transfer(alice.address, ethers.parseEther("5"))).wait();
    await (await q.connect(alice).approve(await factory.getAddress(), ethers.parseEther("2"))).wait();

    const tx = await factory.connect(alice).launchAndBuy("Paired Coin", "PRD", await q.getAddress(), VIRTUAL_QUOTE, 0, meta, ethers.parseEther("2"));
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
    const token = await ethers.getContractAt("LaunchToken", ev.args.token);

    expect(await token.balanceOf(alice.address)).to.be.gt(0n);
    expect(await q.balanceOf(alice.address)).to.equal(ethers.parseEther("3"));
    expect(await q.balanceOf(await factory.getAddress())).to.equal(0n);
    expect(await token.balanceOf(await factory.getAddress())).to.equal(0n);
  });

  it("router rejects tokens that are not paired launches and respects minOut", async function () {
    const { factory, router, alice, bob } = await deployAll();
    const [deployer] = await ethers.getSigners();
    const [q] = await fundedQuotes(1);
    await expect(router.connect(bob).buy(await q.getAddress(), 1n, 0)).to.be.revertedWith("not a paired launch");

    const tokenAddr = await launchWith(factory, alice, q);
    await (await q.connect(deployer).transfer(bob.address, ethers.parseEther("1"))).wait();
    await (await q.connect(bob).approve(await router.getAddress(), ethers.parseEther("1"))).wait();
    await expect(router.connect(bob).buy(tokenAddr, ethers.parseEther("1"), ethers.parseEther("999999999"))).to.be.revertedWith("slippage");
  });
});
