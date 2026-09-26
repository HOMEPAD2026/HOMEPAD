const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArcMultiSend", function () {
  const E = (n) => ethers.parseEther(String(n));
  async function deploy() {
    const signers = await ethers.getSigners();
    const [deployer, sender, other] = signers;
    const Tok = await ethers.getContractFactory("MockTaxToken");
    const token = await Tok.deploy("Coin", "COIN", 0);
    const taxed = await Tok.deploy("Taxed", "TAX", 100); // 1% burned per transfer
    await token.mint(sender.address, E(100000));
    await taxed.mint(sender.address, E(1000));
    const M = await ethers.getContractFactory("ArcMultiSend");
    const ms = await M.deploy();
    const wallets = Array.from({ length: 5 }, () => ethers.Wallet.createRandom().address);
    return { deployer, sender, other, token, taxed, ms, wallets };
  }

  it("sends different amounts straight from the sender, holds nothing, counts", async function () {
    const { sender, token, ms, wallets } = await deploy();
    const amounts = [E(1), E(2), E(3), E(4), E(5)];
    await token.connect(sender).approve(ms.target, E(15));
    await expect(ms.connect(sender).send(token.target, wallets, amounts)).to.emit(ms, "Sent").withArgs(token.target, sender.address, 5, E(15));
    for (let i = 0; i < 5; i++) expect(await token.balanceOf(wallets[i])).to.equal(amounts[i]);
    expect(await token.balanceOf(ms.target)).to.equal(0n);
    expect(await token.allowance(sender.address, ms.target)).to.equal(0n);
    expect(await ms.batches()).to.equal(1n);
    expect(await ms.transfers()).to.equal(5n);
  });

  it("sendSame: one amount to everyone", async function () {
    const { sender, token, ms, wallets } = await deploy();
    await token.connect(sender).approve(ms.target, E(50));
    await expect(ms.connect(sender).sendSame(token.target, wallets, E(10))).to.emit(ms, "Sent").withArgs(token.target, sender.address, 5, E(50));
    for (const w of wallets) expect(await token.balanceOf(w)).to.equal(E(10));
    expect(await ms.transfers()).to.equal(5n);
  });

  it("all or nothing: one bad entry reverts the whole batch", async function () {
    const { sender, token, ms, wallets } = await deploy();
    await token.connect(sender).approve(ms.target, E(1000));
    await expect(ms.connect(sender).send(token.target, [wallets[0], ethers.ZeroAddress], [E(1), E(1)])).to.be.revertedWithCustomError(ms, "ZeroAddress");
    await expect(ms.connect(sender).send(token.target, [wallets[0], wallets[1]], [E(1), 0])).to.be.revertedWithCustomError(ms, "ZeroAmount");
    await expect(ms.connect(sender).send(token.target, [wallets[0]], [E(1), E(2)])).to.be.revertedWithCustomError(ms, "BadInput");
    await expect(ms.connect(sender).send(token.target, [], [])).to.be.revertedWithCustomError(ms, "BadInput");
    await expect(ms.connect(sender).sendSame(token.target, wallets, 0)).to.be.revertedWithCustomError(ms, "ZeroAmount");
    // not enough allowance for the last one → nothing moves
    await token.connect(sender).approve(ms.target, E(5));
    await expect(ms.connect(sender).send(token.target, wallets.slice(0, 3), [E(2), E(2), E(2)])).to.be.reverted;
    expect(await token.balanceOf(wallets[0])).to.equal(0n);
    expect(await ms.batches()).to.equal(0n);
  });

  it("an approval can only be used by the wallet that gave it", async function () {
    const { sender, other, token, ms, wallets } = await deploy();
    await token.connect(sender).approve(ms.target, E(100));
    await expect(ms.connect(other).send(token.target, [wallets[0]], [E(1)])).to.be.reverted; // pulls from `other`, who has nothing
    expect(await token.balanceOf(sender.address)).to.equal(E(100000));
  });

  it("caps a batch at 500", async function () {
    const { sender, token, ms } = await deploy();
    const many = Array.from({ length: 501 }, (_, i) => ethers.getAddress("0x" + (i + 1).toString(16).padStart(40, "0")));
    await expect(ms.connect(sender).sendSame(token.target, many, 1n)).to.be.revertedWithCustomError(ms, "TooMany");
  });

  it("taxed tokens: recipients get what the token lets through", async function () {
    const { sender, taxed, ms, wallets } = await deploy();
    await taxed.connect(sender).approve(ms.target, E(200));
    await ms.connect(sender).sendSame(taxed.target, wallets.slice(0, 2), E(100));
    expect(await taxed.balanceOf(wallets[0])).to.equal(E(99));
  });

  it("200 recipients fit in one transaction", async function () {
    const { sender, token, ms } = await deploy();
    const many = Array.from({ length: 200 }, () => ethers.Wallet.createRandom().address);
    await token.connect(sender).approve(ms.target, E(200));
    const tx = await ms.connect(sender).sendSame(token.target, many, E(1));
    const r = await tx.wait();
    console.log("      gas for 200 new holders:", r.gasUsed.toString());
    expect(r.gasUsed).to.be.lessThan(8_000_000n);
  });

  it("no admin functions", async function () {
    const { ms } = await deploy();
    const fns = ms.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
    expect(fns).to.deep.equal(["send", "sendSame"]);
  });
});
