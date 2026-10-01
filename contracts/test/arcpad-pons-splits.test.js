// ArcPad × Pons creator fee splits: counterfactual address, 70 / 30 in ETH and ERC-20, permissionless claims,
// the creator's own controls, no way to move the fees away.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const E = (n) => ethers.parseEther(String(n));

describe("ArcPadPonsSplits", () => {
  let escrow, pons, splits, owner, creator, other, treasury, tok;
  beforeEach(async () => {
    [owner, creator, other, treasury] = await ethers.getSigners();
    escrow = await (await ethers.getContractFactory("MockPonsEscrow")).deploy();
    pons = await (await ethers.getContractFactory("MockPonsFactoryV2")).deploy();
    splits = await (await ethers.getContractFactory("ArcPadPonsSplits")).deploy(await escrow.getAddress(), await pons.getAddress(), treasury.address, 3000);
    tok = await (await ethers.getContractFactory("TestToken")).deploy("Q", "Q", 18);
  });

  it("fees credited before the splitter exists are claimed and split 70 / 30 (anyone can trigger it)", async () => {
    const s = await splits.splitterOf(creator.address);
    expect(await ethers.provider.getCode(s)).to.equal("0x");
    await escrow.credit(s, { value: E(1) });
    const c0 = await ethers.provider.getBalance(creator.address), t0 = await ethers.provider.getBalance(treasury.address);
    await expect(splits.connect(other).claimFor(creator.address)).to.emit(splits, "SplitterDeployed").withArgs(creator.address, s);
    expect((await ethers.provider.getBalance(creator.address)) - c0).to.equal(E(0.7));
    expect((await ethers.provider.getBalance(treasury.address)) - t0).to.equal(E(0.3));
    expect(await ethers.provider.getBalance(s)).to.equal(0n);
    // deploy is idempotent and the address never changes
    expect(await splits.deploy.staticCall(creator.address)).to.equal(s);
    const sp = await ethers.getContractAt("ArcPadPonsSplitter", s);
    expect(await sp.creator()).to.equal(creator.address);
    expect(await sp.treasury()).to.equal(treasury.address);
    expect(await sp.platformBps()).to.equal(3000n);
  });

  it("each creator has their own splitter", async () => {
    const a = await splits.splitterOf(creator.address), b = await splits.splitterOf(other.address);
    expect(a).to.not.equal(b);
    await splits.deploy(other.address);
    expect(await splits.splitterOf(other.address)).to.equal(b);
  });

  it("ETH sent straight to the splitter is split too; odd wei go to the creator", async () => {
    const s = await splits.splitterOf(creator.address);
    await splits.deploy(creator.address);
    const sp = await ethers.getContractAt("ArcPadPonsSplitter", s);
    await owner.sendTransaction({ to: s, value: 7n });
    await escrow.credit(s, { value: 3n });
    expect(await sp.pending()).to.equal(10n);
    const t0 = await ethers.provider.getBalance(treasury.address);
    await sp.connect(other).claim();
    expect((await ethers.provider.getBalance(treasury.address)) - t0).to.equal(3n);
    // nothing left: a second claim is a no-op
    await expect(sp.claim()).to.not.emit(sp, "Paid");
  });

  it("ERC-20 fees (a launch paired with a token) split the same way", async () => {
    const s = await splits.splitterOf(creator.address);
    await tok.mint(owner.address, E(100)); await tok.approve(await escrow.getAddress(), E(100));
    await escrow.creditToken(s, await tok.getAddress(), E(10));
    await splits.deploy(creator.address);
    const sp = await ethers.getContractAt("ArcPadPonsSplitter", s);
    await sp.connect(other).claimToken(await tok.getAddress());
    expect(await tok.balanceOf(creator.address)).to.equal(E(7));
    expect(await tok.balanceOf(treasury.address)).to.equal(E(3));
  });

  it("the creator can move their 70% and switch buyback-and-lock; nobody else can; the 30% can't be moved", async () => {
    const s = await splits.splitterOf(creator.address);
    await splits.deploy(creator.address);
    const sp = await ethers.getContractAt("ArcPadPonsSplitter", s);
    await expect(sp.connect(other).setCreator(other.address)).to.be.revertedWithCustomError(sp, "NotCreator");
    await sp.connect(creator).setCreator(other.address);
    expect(await sp.creator()).to.equal(other.address);
    await escrow.credit(s, { value: E(1) });
    const o0 = await ethers.provider.getBalance(other.address);
    await sp.connect(owner).claim();
    expect((await ethers.provider.getBalance(other.address)) - o0).to.equal(E(0.7));
    // buyback switch, forwarded to Pons as the fee recipient
    const coin = ethers.Wallet.createRandom().address;
    await pons.setRecipient(coin, s);
    await expect(sp.connect(creator).setBuybackEnabled(coin, true)).to.be.revertedWithCustomError(sp, "NotCreator"); // creator moved to `other`
    await sp.connect(other).setBuybackEnabled(coin, true);
    expect(await pons.buyback(coin)).to.equal(true);
    // there is no function that hands the coin's fees to another recipient
    expect(sp.interface.fragments.some((f) => /transferCreatorFeeRecipient/i.test(f.name || ""))).to.equal(false);
  });

  it("a creator wallet that refuses ETH makes the claim fail rather than send it elsewhere", async () => {
    const bad = await (await ethers.getContractFactory("RefusesEth")).deploy();
    const s = await splits.splitterOf(await bad.getAddress());
    await escrow.credit(s, { value: E(1) });
    const sp = await ethers.getContractAt("ArcPadPonsSplitter", await splits.deploy.staticCall(await bad.getAddress()));
    await splits.deploy(await bad.getAddress());
    await expect(sp.claim()).to.be.revertedWithCustomError(sp, "PayFailed");
    expect(await escrow.balanceOf(s)).to.equal(E(1)); // still in the escrow
  });

  it("refuses a share of 0% or 100%", async () => {
    const F = await ethers.getContractFactory("ArcPadPonsSplits");
    await expect(F.deploy(await escrow.getAddress(), await pons.getAddress(), treasury.address, 0)).to.be.revertedWithCustomError(F, "BadBps");
    await expect(F.deploy(await escrow.getAddress(), await pons.getAddress(), treasury.address, 10000)).to.be.revertedWithCustomError(F, "BadBps");
  });
});
