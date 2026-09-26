const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { build } = require("./lib/merkle");

describe("ArcDrop", function () {
  const DAY = 86400;
  const E = (n) => ethers.parseEther(String(n));
  async function deploy(n = 25) {
    const [deployer, creator, other] = await ethers.getSigners();
    const Tok = await ethers.getContractFactory("MockTaxToken");
    const token = await Tok.deploy("Coin", "COIN", 0);
    const taxed = await Tok.deploy("Taxed", "TAX", 100);
    await token.mint(creator.address, E(100000)); await taxed.mint(creator.address, E(1000));
    const drop = await (await ethers.getContractFactory("ArcDrop")).deploy();
    const rows = Array.from({ length: n }, (_, i) => [ethers.Wallet.createRandom().address, E(i + 1)]);
    const total = rows.reduce((s, [, v]) => s + v, 0n);
    return { deployer, creator, other, token, taxed, drop, rows, total, tree: build(rows) };
  }

  it("deposit once, each wallet claims its own row (anyone can submit it)", async function () {
    const { creator, other, token, drop, rows, total, tree } = await deploy();
    await token.connect(creator).approve(drop.target, total);
    await expect(drop.connect(creator).create(token.target, tree.root, total, rows.length, 0)).to.emit(drop, "DropCreated");
    for (const i of [0, 7, 24]) {
      await expect(drop.connect(other).claim(0, i, rows[i][0], rows[i][1], tree.proof(i))).to.emit(drop, "Claimed").withArgs(0, i, rows[i][0], rows[i][1]);
      expect(await token.balanceOf(rows[i][0])).to.equal(rows[i][1]);
    }
    expect(await drop.isClaimed(0, 7)).to.equal(true);
    expect((await drop.claimedMany(0, [0, 1, 7])).map(Boolean)).to.deep.equal([true, false, true]);
    await expect(drop.claim(0, 7, rows[7][0], rows[7][1], tree.proof(7))).to.be.revertedWithCustomError(drop, "AlreadyClaimed");
    const d = await drop.getDrop(0);
    expect(d.claims).to.equal(3n);
    expect(d.claimed).to.equal(E(1 + 8 + 25));
  });

  it("wrong amount, wrong wallet or wrong proof is refused", async function () {
    const { creator, token, drop, rows, total, tree } = await deploy();
    await token.connect(creator).approve(drop.target, total);
    await drop.connect(creator).create(token.target, tree.root, total, rows.length, 0);
    await expect(drop.claim(0, 3, rows[3][0], rows[3][1] + 1n, tree.proof(3))).to.be.revertedWithCustomError(drop, "BadProof");
    await expect(drop.claim(0, 3, rows[4][0], rows[3][1], tree.proof(3))).to.be.revertedWithCustomError(drop, "BadProof");
    await expect(drop.claim(0, 3, rows[3][0], rows[3][1], tree.proof(4))).to.be.revertedWithCustomError(drop, "BadProof");
  });

  it("every row of an odd-sized list is claimable and the drop empties exactly", async function () {
    const { creator, token, drop, rows, total, tree } = await deploy(13);
    await token.connect(creator).approve(drop.target, total);
    await drop.connect(creator).create(token.target, tree.root, total, rows.length, 0);
    for (let i = 0; i < rows.length; i++) await drop.claim(0, i, rows[i][0], rows[i][1], tree.proof(i));
    expect(await token.balanceOf(drop.target)).to.equal(0n);
  });

  it("end date: claims stop, the creator takes back the rest (only then, only once)", async function () {
    const { creator, other, token, drop, rows, total, tree } = await deploy();
    await token.connect(creator).approve(drop.target, total);
    const ends = (await time.latest()) + 10 * DAY;
    await drop.connect(creator).create(token.target, tree.root, total, rows.length, ends);
    await drop.claim(0, 0, rows[0][0], rows[0][1], tree.proof(0));
    await expect(drop.connect(creator).reclaim(0)).to.be.revertedWithCustomError(drop, "NotEnded");
    await time.increaseTo(ends);
    await expect(drop.claim(0, 1, rows[1][0], rows[1][1], tree.proof(1))).to.be.revertedWithCustomError(drop, "DropEnded");
    await expect(drop.connect(other).reclaim(0)).to.be.revertedWithCustomError(drop, "NotCreator");
    const before = await token.balanceOf(creator.address);
    await expect(drop.connect(creator).reclaim(0)).to.emit(drop, "Reclaimed").withArgs(0, creator.address, total - rows[0][1]);
    expect(await token.balanceOf(creator.address)).to.equal(before + total - rows[0][1]);
    await expect(drop.connect(creator).reclaim(0)).to.be.revertedWithCustomError(drop, "NothingLeft");
  });

  it("no end date = never reclaimable; bad windows and taxed tokens are refused", async function () {
    const { creator, token, taxed, drop, rows, total, tree } = await deploy();
    await token.connect(creator).approve(drop.target, total * 2n);
    await drop.connect(creator).create(token.target, tree.root, total, rows.length, 0);
    await time.increase(4000 * DAY);
    await expect(drop.connect(creator).reclaim(0)).to.be.revertedWithCustomError(drop, "NotEnded");
    await expect(drop.connect(creator).create(token.target, tree.root, total, rows.length, (await time.latest()) + DAY)).to.be.revertedWithCustomError(drop, "BadWindow");
    await expect(drop.connect(creator).create(token.target, ethers.ZeroHash, total, rows.length, 0)).to.be.revertedWithCustomError(drop, "BadRoot");
    await taxed.connect(creator).approve(drop.target, E(100));
    await expect(drop.connect(creator).create(taxed.target, tree.root, E(100), 3, 0)).to.be.revertedWithCustomError(drop, "ExactAmountRequired");
  });

  it("a 2,000-row list: claims cost the same at any position", async function () {
    const { creator, token, drop } = await deploy(0);
    const rows = Array.from({ length: 2000 }, (_, i) => [ethers.getAddress("0x" + (i + 1).toString(16).padStart(40, "0")), E(1)]);
    const tree = build(rows);
    await token.connect(creator).approve(drop.target, E(2000));
    await drop.connect(creator).create(token.target, tree.root, E(2000), 2000, 0);
    const g = [];
    for (const i of [0, 999, 1999]) { const r = await (await drop.claim(0, i, rows[i][0], rows[i][1], tree.proof(i))).wait(); g.push(Number(r.gasUsed)); }
    console.log("      claim gas:", g.join(", "));
    expect(Math.max(...g)).to.be.lessThan(120000);
  });

  it("no admin functions", async function () {
    const { drop } = await deploy(1);
    const fns = drop.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
    expect(fns).to.deep.equal(["claim", "create", "reclaim"]);
  });
});
