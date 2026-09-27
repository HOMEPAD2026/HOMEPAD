const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ArcircleBurnVote", function () {
  const NAME = 0, TICKER = 1, LOGO = 2, ROADMAP = 3, DATE = 4;
  const DEAD = "0x000000000000000000000000000000000000dEaD";
  const K = (n) => ethers.parseEther(String(n * 1000)); // n votes' worth of $ARCIRCLE

  async function setup({ skim = false } = {}) {
    const [, recipient, platform, treasury, alice, bob, stranger] = await ethers.getSigners();
    const escrow = await (await ethers.getContractFactory("BigPadEscrow")).deploy(recipient.address, platform.address, treasury.address, 0);
    await escrow.connect(recipient).start();
    const ballot = await (await ethers.getContractFactory("BigPadVote")).deploy(await escrow.getAddress());
    await ballot.connect(recipient).proposeOptions(NAME, ["Orbit", "Halo", "Ring"]);
    await ballot.connect(recipient).proposeOptions(TICKER, ["ORB", "HALO"]);
    const token = skim ? await (await ethers.getContractFactory("MockSkimToken")).deploy()
      : await (await ethers.getContractFactory("MockTaxToken")).deploy("arcircle", "ARCIRCLE", 0);
    await token.mint(alice.address, K(20));
    await token.mint(bob.address, K(5));
    const bv = await (await ethers.getContractFactory("ArcircleBurnVote")).deploy(await ballot.getAddress(), await token.getAddress(), 0, 0);
    for (const s of [alice, bob]) await token.connect(s).approve(await bv.getAddress(), ethers.MaxUint256);
    return { recipient, alice, bob, stranger, escrow, ballot, token, bv };
  }
  const open = async () => {}; // open from the deploy block by default

  it("opens right away, closes when the raise closes, and prices a vote at 1,000 tokens", async function () {
    const { escrow, bv } = await setup();
    const deployedAt = (await ethers.provider.getBlock((await bv.deploymentTransaction().wait()).blockNumber)).timestamp;
    expect(await bv.opensAt()).to.equal(deployedAt);
    expect(await bv.votingEnds()).to.equal(await escrow.deadline());
    expect(await bv.votingOpen()).to.equal(true);
    expect(await bv.votePrice()).to.equal(K(1));
  });

  it("takes votes during the raise and none after it closes", async function () {
    const ctx = await setup();
    expect(await ctx.escrow.isOpen()).to.equal(true);
    await ctx.bv.connect(ctx.alice).vote(NAME, 0, 1);
    await time.increaseTo(Number(await ctx.escrow.deadline()));
    await expect(ctx.bv.connect(ctx.alice).vote(NAME, 0, 1)).to.be.revertedWithCustomError(ctx.bv, "VotingClosed");
    expect(await ctx.bv.votingOpen()).to.equal(false);
  });

  it("an explicit window: not before it opens, and a bad window can't be deployed", async function () {
    const ctx = await setup();
    const F = await ethers.getContractFactory("ArcircleBurnVote");
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const later = await F.deploy(await ctx.ballot.getAddress(), await ctx.token.getAddress(), now + 3600, now + 7200);
    await ctx.token.connect(ctx.alice).approve(await later.getAddress(), ethers.MaxUint256);
    await expect(later.connect(ctx.alice).vote(NAME, 0, 1)).to.be.revertedWithCustomError(later, "VotingNotOpenYet");
    await time.increaseTo(now + 3600);
    await later.connect(ctx.alice).vote(NAME, 0, 1);
    await expect(F.deploy(await ctx.ballot.getAddress(), await ctx.token.getAddress(), now + 9000, now + 8000)).to.be.revertedWith("no voting window");
    await expect(F.deploy(await ctx.ballot.getAddress(), await ctx.token.getAddress(), 1, 2)).to.be.revertedWith("no voting window");
  });

  it("burns 1,000 per vote to the dead address and counts it", async function () {
    const ctx = await setup();
    await open(ctx);
    await expect(ctx.bv.connect(ctx.alice).vote(NAME, 1, 3)).to.emit(ctx.bv, "Voted").withArgs(NAME, ctx.alice.address, 1, 3, K(3));
    expect(await ctx.token.balanceOf(DEAD)).to.equal(K(3));
    expect(await ctx.token.balanceOf(ctx.alice.address)).to.equal(K(17));
    expect(await ctx.token.balanceOf(await ctx.bv.getAddress())).to.equal(0);
    expect(await ctx.bv.optionVotes(NAME, 1)).to.equal(3);
    expect(await ctx.bv.tallies(NAME)).to.deep.equal([0n, 3n, 0n]);
    expect(await ctx.bv.myVotes(NAME, ctx.alice.address)).to.deep.equal([0n, 3n, 0n]);
    expect(await ctx.bv.totalBurned()).to.equal(K(3));
    expect(await ctx.bv.voterCount()).to.equal(1);
  });

  it("lets anyone vote again and split votes; nothing can be taken back", async function () {
    const ctx = await setup();
    await open(ctx);
    await ctx.bv.connect(ctx.alice).vote(NAME, 0, 2);
    await ctx.bv.connect(ctx.alice).vote(NAME, 2, 1);
    await ctx.bv.connect(ctx.bob).vote(NAME, 2, 5);
    expect(await ctx.bv.tallies(NAME)).to.deep.equal([2n, 0n, 6n]);
    const [idx, votes] = await ctx.bv.leading(NAME);
    expect(idx).to.equal(2); expect(votes).to.equal(6);
    expect(await ctx.bv.voterCount()).to.equal(2);
    expect(await ctx.bv.categoryVotes(NAME)).to.equal(8);
  });

  it("voteMany: several categories, one burn", async function () {
    const ctx = await setup();
    await open(ctx);
    await ctx.bv.connect(ctx.alice).voteMany([NAME, TICKER], [0, 1], [2, 4]);
    expect(await ctx.token.balanceOf(DEAD)).to.equal(K(6));
    expect(await ctx.bv.tallies(TICKER)).to.deep.equal([0n, 4n]);
    await expect(ctx.bv.connect(ctx.alice).voteMany([NAME], [0, 1], [1])).to.be.revertedWithCustomError(ctx.bv, "LengthMismatch");
  });

  it("rejects bad input and short balances without burning anything", async function () {
    const ctx = await setup();
    await open(ctx);
    await expect(ctx.bv.connect(ctx.alice).vote(LOGO, 0, 1)).to.be.revertedWithCustomError(ctx.bv, "OptionsNotSet");
    await expect(ctx.bv.connect(ctx.alice).vote(NAME, 3, 1)).to.be.revertedWithCustomError(ctx.bv, "InvalidOption");
    await expect(ctx.bv.connect(ctx.alice).vote(5, 0, 1)).to.be.revertedWithCustomError(ctx.bv, "InvalidCategory");
    await expect(ctx.bv.connect(ctx.alice).vote(NAME, 0, 0)).to.be.revertedWithCustomError(ctx.bv, "NoVotes");
    await expect(ctx.bv.connect(ctx.bob).vote(NAME, 0, 6)).to.be.reverted; // holds 5 votes' worth
    await expect(ctx.bv.connect(ctx.stranger).vote(NAME, 0, 1)).to.be.reverted; // holds nothing
    expect(await ctx.token.balanceOf(DEAD)).to.equal(0);
  });

  it("only counts tokens that really reach the dead address", async function () {
    const ctx = await setup({ skim: true }); // 1% skimmed on the way
    await open(ctx);
    await expect(ctx.bv.connect(ctx.alice).vote(NAME, 0, 1)).to.be.revertedWithCustomError(ctx.bv, "BurnFailed");
  });

  it("has no owner, admin or way to move tokens", async function () {
    const { bv } = await setup();
    const fns = bv.interface.fragments.filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).map((f) => f.name).sort();
    expect(fns).to.deep.equal(["vote", "voteMany"]);
  });

  it("new candidates published on the ballot are votable straight away", async function () {
    const ctx = await setup();
    await open(ctx);
    await ctx.ballot.connect(ctx.recipient).proposeOptions(ROADMAP, ["A", "B"]);
    await ctx.bv.connect(ctx.alice).vote(ROADMAP, 1, 1);
    expect(await ctx.bv.tallies(ROADMAP)).to.deep.equal([0n, 1n]);
    expect(await ctx.bv.tallies(DATE)).to.deep.equal([]);
  });
});
