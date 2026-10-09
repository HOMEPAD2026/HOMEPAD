// ArcLaunchDropRH: RH ArcPad coins' 4% → veARCIRCLE holders by a weekly Merkle root (the server's tree builder)
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const WEEK = 7 * 86400, DELAY = 12 * 3600;
const E = (n) => ethers.parseEther(String(n));
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const to = async (t) => { await network.provider.send("evm_setNextBlockTimestamp", [t]); await network.provider.send("evm_mine"); };
const wk = (t) => Math.floor(t / WEEK) * WEEK;
const API = require("path").join(__dirname, "../../api/_launchdrop-rh.mjs"); // the server's own tree builder

describe("ArcLaunchDropRH", function () {
  let R, f, drop, treas, poster, a, b, c, d, bot, W0, T;
  const rows = () => [[a.address, E(300)], [b.address, E(100)], [c.address, 7n]]; // c: a dust lock still counts
  async function coin(name, at) {
    const t = await (await ethers.getContractFactory("DropCoin")).connect(treas).deploy(name);
    await f.add(await t.getAddress(), at);
    await t.connect(treas).approve(await drop.getAddress(), ethers.MaxUint256);
    return t;
  }
  before(async () => { R = await import(API); });
  beforeEach(async () => {
    [, treas, poster, a, b, c, d, bot] = await ethers.getSigners();
    await to(wk(await now()) + WEEK + 100);
    W0 = wk(await now());
    f = await (await ethers.getContractFactory("MockLaunchFactory")).deploy();
    drop = await (await ethers.getContractFactory("ArcLaunchDropRH")).deploy(await f.getAddress(), W0, poster.address, treas.address);
    T = R._test.build(rows());
  });
  const claimOf = (tok, who) => { const i = T.leaves.findIndex((l) => l.a === who.address.toLowerCase()); return { token: tok, ve: T.leaves[i].ve, proof: T.proof(i) }; };
  const supply = () => rows().reduce((s, [, v]) => s + BigInt(v), 0n);

  it("server tree = contract leaf + OZ proof", async () => {
    for (const w of [a, b, c]) { const cl = claimOf(ethers.ZeroAddress, w); expect(R._test.verify(cl.proof, T.root, await drop.leaf(w.address, cl.ve))).to.equal(true); }
    const one = R._test.build([[a.address, 5n]]);
    expect(one.root).to.equal(await drop.leaf(a.address, 5n));
  });
  it("deposit before the root, claims open 12h after the post, pro rata over the leaves", async () => {
    const t = await coin("ONE", W0 + 3600);
    const A = await t.getAddress();
    await drop.connect(treas).deposit(A, E(40_000_000));
    expect(await drop.claimable(A, a.address, claimOf(A, a).ve, claimOf(A, a).proof)).to.equal(0n);
    await expect(drop.connect(a).postRoot(W0, T.root, supply())).to.be.revertedWith("poster only");
    await drop.connect(poster).postRoot(W0, T.root, supply());
    await expect(drop.connect(a).claim([claimOf(A, a)])).to.not.be.reverted; // nothing yet: no transfer
    expect(await t.balanceOf(a.address)).to.equal(0n);
    await to((await now()) + DELAY + 1);
    await expect(drop.connect(poster).postRoot(W0, T.root, supply())).to.be.revertedWith("root is final");
    await drop.connect(a).claim([claimOf(A, a)]);
    expect(await t.balanceOf(a.address)).to.equal((E(40_000_000) * E(300)) / supply());
    await drop.connect(bot).claimFor(b.address, [claimOf(A, b)]);
    expect(await t.balanceOf(b.address)).to.equal((E(40_000_000) * E(100)) / supply());
    // twice pays nothing more; a wrong ve fails the proof
    await drop.connect(a).claim([claimOf(A, a)]);
    expect(await t.balanceOf(a.address)).to.equal((E(40_000_000) * E(300)) / supply());
    const bad = { ...claimOf(A, a) };
    expect(await drop.claimable(A, d.address, bad.ve, bad.proof)).to.equal(0n);
    const lie = { ...claimOf(A, b), ve: E(300) };
    expect(await drop.claimable(A, b.address, lie.ve, lie.proof)).to.equal(0n);
  });
  it("the poster can correct within 12h; the week must have started and be on/after startWeek", async () => {
    await drop.connect(poster).postRoot(W0, ethers.id("wrong"), 1n);
    await to((await now()) + 3600);
    await drop.connect(poster).postRoot(W0, T.root, supply());
    const r = await drop.roots(W0);
    expect(r.root).to.equal(T.root);
    await expect(drop.connect(poster).postRoot(W0 + WEEK, T.root, supply())).to.be.revertedWith("week hasn't started");
    await expect(drop.connect(poster).postRoot(W0 - WEEK, T.root, supply())).to.be.revertedWith("week");
    await expect(drop.connect(poster).postRoot(W0 + 5, T.root, supply())).to.be.revertedWith("week");
    expect(await drop.postedCount()).to.equal(1n);
  });
  it("a coin's week is its launch week; earlier coins and strangers are refused", async () => {
    const old = await coin("OLD", W0 - 10);
    await expect(drop.connect(treas).deposit(await old.getAddress(), 1n)).to.be.revertedWith("launched before Launch Drop");
    const s = await (await ethers.getContractFactory("DropCoin")).connect(treas).deploy("X");
    await s.connect(treas).approve(await drop.getAddress(), 1n);
    await expect(drop.connect(treas).deposit(await s.getAddress(), 1n)).to.be.revertedWith("not an ArcPad coin");
    await to(W0 + WEEK + 10);
    const t2 = await coin("TWO", W0 + WEEK + 5);
    await drop.connect(treas).deposit(await t2.getAddress(), E(1));
    expect((await drop.drops(await t2.getAddress())).week).to.equal(BigInt(W0 + WEEK));
  });
  it("a week without a root goes back to the treasury after 120 days; with one, never", async () => {
    const t = await coin("ONE", W0 + 10), A = await t.getAddress();
    await drop.connect(treas).deposit(A, E(40_000_000));
    await expect(drop.reclaim(A)).to.be.revertedWith("too early");
    await to(W0 + 121 * 86400);
    const b0 = await t.balanceOf(treas.address);
    await drop.connect(bot).reclaim(A);
    expect((await t.balanceOf(treas.address)) - b0).to.equal(E(40_000_000));
    await expect(drop.reclaim(A)).to.be.revertedWith("nothing left");
  });
  it("the claimable is capped by what's left; sync counts direct transfers", async () => {
    const t = await coin("ONE", W0 + 10), A = await t.getAddress();
    await t.connect(treas).transfer(await drop.getAddress(), E(1000));
    await drop.sync(A);
    expect((await drop.drops(A)).amount).to.equal(E(1000));
    await drop.connect(poster).postRoot(W0, T.root, supply() / 2n); // a bad supply can't overdraw the coin
    await to((await now()) + DELAY + 1);
    await drop.connect(a).claim([claimOf(A, a)]);
    expect(await t.balanceOf(a.address)).to.equal(E(1000));
    expect(await drop.claimable(A, b.address, claimOf(A, b).ve, claimOf(A, b).proof)).to.equal(0n);
  });
  it("setPoster: only the poster", async () => {
    await expect(drop.connect(a).setPoster(a.address)).to.be.revertedWith("poster only");
    await drop.connect(poster).setPoster(a.address);
    expect(await drop.poster()).to.equal(a.address);
  });
});
