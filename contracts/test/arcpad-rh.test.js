// ArcPadFactoryRH + ArcPadRouterRH: ETH-paired ArcPad launches (Robinhood Chain) on the real v4 PoolManager.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const E = (n) => ethers.parseEther(String(n));
const FLAGS = BigInt((1 << 6) | (1 << 2)), MASK = (1n << 14n) - 1n;
function mine(dep, hash) { for (let s = 0n; s < 400000n; s++) { const salt = ethers.zeroPadValue(ethers.toBeHex(s), 32); const a = ethers.getCreate2Address(dep, salt, hash); if ((BigInt(a) & MASK) === FLAGS) return { salt, a }; } throw new Error("no salt"); }
const META = { imageUrl: "", description: "eth pair", twitter: "", telegram: "", discord: "", website: "" };
describe("ArcPadFactoryRH (ETH pairs)", function () {
  let owner, treasury, platform, creator, buyer, pm, hook, factory, router;
  const FEE = E("0.0003");
  beforeEach(async () => {
    [owner, treasury, platform, creator, buyer] = await ethers.getSigners();
    pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    const c2 = await (await ethers.getContractFactory("Create2Deployer")).deploy();
    const HF = await ethers.getContractFactory("HomepadHybridHook");
    const tx = await HF.getDeployTransaction(await pm.getAddress(), owner.address);
    const { salt, a } = mine(await c2.getAddress(), ethers.keccak256(tx.data));
    await (await c2.deploy(salt, tx.data)).wait();
    hook = await ethers.getContractAt("HomepadHybridHook", a);
    factory = await (await ethers.getContractFactory("ArcPadFactoryRH")).deploy(treasury.address, platform.address, await pm.getAddress(), a, 200, 100, 7000, 10000, FEE);
    await (await hook.setFactory(await factory.getAddress())).wait();
    router = await (await ethers.getContractFactory("ArcPadRouterRH")).deploy(await pm.getAddress(), await factory.getAddress());
  });
  const launch = async (opts = {}) => {
    const fn = opts.dev ? factory.connect(creator).launchAndBuy("Ether Frog", "EFROG", ethers.ZeroAddress, E(1), 0, META, opts.dev, { value: FEE + opts.dev }) : factory.connect(creator).launch("Ether Frog", "EFROG", ethers.ZeroAddress, E(1), 0, META, { value: opts.value || FEE });
    const rc = await (await fn).wait();
    const l = await factory.launches(0);
    return { token: await ethers.getContractAt("LaunchToken", l[0]), l, rc };
  };
  it("launch: fee to the treasury, excess refunded, 8% to the treasury, ETH pair", async () => {
    const t0 = await ethers.provider.getBalance(treasury.address);
    const { token, l } = await launch({ value: FEE + E("0.5") });
    expect((await ethers.provider.getBalance(treasury.address)) - t0).to.equal(FEE);
    expect(l[1]).to.equal(ethers.ZeroAddress);          // quoteToken
    expect(l[3]).to.equal(true);                        // quoteIsCurrency0
    const tb = await token.balanceOf(treasury.address); expect(tb >= E(80_000_000) && tb - E(80_000_000) < 10n ** 6n).to.equal(true); // + a few wei of rounding dust
    expect(await ethers.provider.getBalance(await factory.getAddress())).to.equal(0n);
    await expect(factory.connect(creator).launch("x", "X", ethers.ZeroAddress, E(1), 0, META, { value: FEE - 1n })).to.be.revertedWith("launch fee: send at least launchFee in ETH");
    await expect(factory.connect(creator).launch("x", "X", owner.address, E(1), 0, META, { value: FEE })).to.be.revertedWith("ETH pairs only: quoteToken must be address(0)");
  });
  it("launchAndBuy: the dev buy in the same ETH", async () => {
    const { token } = await launch({ dev: E("0.05") });
    const got = await token.balanceOf(creator.address);
    expect(got > 0n).to.equal(true);
    await expect(factory.connect(creator).launchAndBuy("y", "Y", ethers.ZeroAddress, E(1), 0, META, E("0.05"), { value: E("0.05") })).to.be.revertedWith("send launchFee + devBuyQuote in ETH");
  });
  it("router: buy with ETH, sell back for ETH, fees split by the hook", async () => {
    const { token } = await launch();
    const T = await token.getAddress();
    const c0 = await ethers.provider.getBalance(creator.address);
    await (await router.connect(buyer).buy(T, 1n, { value: E("0.2") })).wait();
    const bal = await token.balanceOf(buyer.address);
    expect(bal > 0n).to.equal(true);
    await expect(router.connect(buyer).buy(T, bal * 10n, { value: E("0.01") })).to.be.revertedWith("slippage: less than minAmountOut");
    await (await token.connect(buyer).approve(await router.getAddress(), bal)).wait();
    const e0 = await ethers.provider.getBalance(buyer.address);
    const rc = await (await router.connect(buyer).sell(T, bal / 2n, 1n)).wait();
    const e1 = await ethers.provider.getBalance(buyer.address);
    expect(e1 + rc.gasUsed * rc.gasPrice - e0 > 0n).to.equal(true);
    // the sell's fee is paid in ETH to the creator (70% of the 1% base)
    expect((await ethers.provider.getBalance(creator.address)) > c0).to.equal(true);
    expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0n);
    await expect(router.connect(buyer).buy(owner.address, 0n, { value: 1n })).to.be.revertedWith("not an ArcPad coin");
    await expect(owner.sendTransaction({ to: await router.getAddress(), value: 1n })).to.be.revertedWith("no direct ETH");
  });
});
