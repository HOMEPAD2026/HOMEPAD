const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("BigPadVote", function () {
  const NAME = 0, TICKER = 1, LOGO = 2, ROADMAP = 3, LAUNCH_DATE = 4;

  async function deployEscrowAndStart() {
    const [, recipient, platform, treasury, alice, bob, carol, stranger] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("BigPadEscrow");
    const escrow = await Escrow.deploy(recipient.address, platform.address, treasury.address, 0); // uncapped
    await escrow.connect(recipient).start();
    const deadline = Number(await escrow.deadline());
    return { recipient, platform, treasury, alice, bob, carol, stranger, escrow, deadline };
  }

  async function deployVote() {
    const ctx = await deployEscrowAndStart();
    const Vote = await ethers.getContractFactory("BigPadVote");
    const vote = await Vote.deploy(await ctx.escrow.getAddress());
    return { ...ctx, vote };
  }

  // Contributes, then fast-forwards past the escrow deadline (closing the
  // raise, which is also when voting opens) — the setup nearly every test
  // below needs.
  async function deployVoteWithContributions() {
    const ctx = await deployVote();
    await ctx.escrow.connect(ctx.alice).contribute({ value: ethers.parseEther("3") });
    await ctx.escrow.connect(ctx.bob).contribute({ value: ethers.parseEther("1") });
    await time.increaseTo(ctx.deadline + 1);
    return ctx;
  }

  describe("construction", function () {
    it("rejects a zero escrow address", async function () {
      const Vote = await ethers.getContractFactory("BigPadVote");
      await expect(Vote.deploy(ethers.ZeroAddress)).to.be.revertedWith("escrow is zero address");
    });

    it("rejects an escrow that hasn't been started yet", async function () {
      const [, recipient, platform, treasury] = await ethers.getSigners();
      const Escrow = await ethers.getContractFactory("BigPadEscrow");
      const escrow = await Escrow.deploy(recipient.address, platform.address, treasury.address, 0);
      const Vote = await ethers.getContractFactory("BigPadVote");
      await expect(Vote.deploy(await escrow.getAddress())).to.be.revertedWith("escrow has not started");
    });

    it("reads recipient and sets votingEnds = escrow deadline + 48h", async function () {
      const { vote, recipient, deadline } = await deployVote();
      expect(await vote.recipient()).to.equal(recipient.address);
      expect(await vote.votingEnds()).to.equal(BigInt(deadline) + 48n * 3600n);
    });
  });

  describe("proposeOptions()", function () {
    it("only the recipient can propose", async function () {
      const { vote, stranger } = await deployVote();
      await expect(vote.connect(stranger).proposeOptions(NAME, ["Foo", "Bar"])).to.be.revertedWithCustomError(vote, "NotRecipient");
    });

    it("rejects an invalid category", async function () {
      const { vote, recipient } = await deployVote();
      await expect(vote.connect(recipient).proposeOptions(5, ["Foo", "Bar"])).to.be.revertedWithCustomError(vote, "InvalidCategory");
    });

    it("rejects fewer than 2 options", async function () {
      const { vote, recipient } = await deployVote();
      await expect(vote.connect(recipient).proposeOptions(NAME, ["OnlyOne"])).to.be.revertedWithCustomError(vote, "TooFewOptions");
    });

    it("can be called before the raise closes — doesn't block on that", async function () {
      const { vote, recipient } = await deployVote(); // no time.increaseTo here
      await expect(vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar"])).to.not.be.reverted;
      expect(await vote.options(NAME)).to.deep.equal(["Foo", "Bar"]);
    });

    it("rejects setting the same category twice", async function () {
      const { vote, recipient } = await deployVote();
      await vote.connect(recipient).proposeOptions(TICKER, ["AAA", "BBB"]);
      await expect(vote.connect(recipient).proposeOptions(TICKER, ["CCC", "DDD"])).to.be.revertedWithCustomError(vote, "OptionsAlreadySet");
    });

    it("rejects proposing after voting has closed", async function () {
      const { vote, recipient, deadline } = await deployVote();
      await time.increaseTo(deadline + 48 * 3600 + 1);
      await expect(vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar"])).to.be.revertedWithCustomError(vote, "VotingClosed");
    });
  });

  describe("vote()", function () {
    it("rejects voting before options are set", async function () {
      const { vote, alice } = await deployVoteWithContributions();
      await expect(vote.connect(alice).vote(NAME, 0)).to.be.revertedWithCustomError(vote, "OptionsNotSet");
    });

    it("rejects voting before the escrow raise has closed", async function () {
      const { vote, recipient, alice } = await deployVote();
      await vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar"]);
      await escrowContribute(vote, alice, "1"); // helper below
      await expect(vote.connect(alice).vote(NAME, 0)).to.be.revertedWithCustomError(vote, "VotingNotOpenYet");
    });

    it("rejects a non-contributor (zero weight)", async function () {
      const { vote, recipient, stranger } = await deployVoteWithContributions();
      await vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar"]);
      await expect(vote.connect(stranger).vote(NAME, 0)).to.be.revertedWithCustomError(vote, "NoWeight");
    });

    it("rejects an out-of-range option index", async function () {
      const { vote, recipient, alice } = await deployVoteWithContributions();
      await vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar"]);
      await expect(vote.connect(alice).vote(NAME, 5)).to.be.revertedWithCustomError(vote, "InvalidOption");
    });

    it("rejects voting after the voting window has closed", async function () {
      const { vote, recipient, alice, deadline } = await deployVoteWithContributions();
      await vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar"]);
      await time.increaseTo(deadline + 48 * 3600 + 1);
      await expect(vote.connect(alice).vote(NAME, 0)).to.be.revertedWithCustomError(vote, "VotingClosed");
    });

    it("weights a vote by the voter's actual escrow contribution", async function () {
      const { vote, recipient, alice, bob } = await deployVoteWithContributions(); // alice: 3 ETH, bob: 1 ETH
      await vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar"]);
      await expect(vote.connect(alice).vote(NAME, 0)).to.emit(vote, "Voted").withArgs(NAME, alice.address, 0, ethers.parseEther("3"));
      await vote.connect(bob).vote(NAME, 1);
      expect(await vote.optionWeight(NAME, 0)).to.equal(ethers.parseEther("3"));
      expect(await vote.optionWeight(NAME, 1)).to.equal(ethers.parseEther("1"));
      const [idx, w] = await vote.leading(NAME);
      expect(idx).to.equal(0);
      expect(w).to.equal(ethers.parseEther("3"));
    });

    it("lets a voter change their mind, moving their full weight to the new option", async function () {
      const { vote, recipient, alice } = await deployVoteWithContributions();
      await vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar", "Baz"]);
      await vote.connect(alice).vote(NAME, 0);
      await vote.connect(alice).vote(NAME, 2);
      expect(await vote.optionWeight(NAME, 0)).to.equal(0n);
      expect(await vote.optionWeight(NAME, 2)).to.equal(ethers.parseEther("3"));
      const [hasVoted, optionIndex] = await vote.myVote(NAME, alice.address);
      expect(hasVoted).to.equal(true);
      expect(optionIndex).to.equal(2n);
    });

    it("keeps categories independent — a vote in one doesn't affect another", async function () {
      const { vote, recipient, alice } = await deployVoteWithContributions();
      await vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar"]);
      await vote.connect(recipient).proposeOptions(TICKER, ["AAA", "BBB"]);
      await vote.connect(alice).vote(NAME, 0);
      await vote.connect(alice).vote(TICKER, 1);
      expect(await vote.optionWeight(NAME, 0)).to.equal(ethers.parseEther("3"));
      expect(await vote.optionWeight(TICKER, 1)).to.equal(ethers.parseEther("3"));
      expect(await vote.optionWeight(NAME, 1)).to.equal(0n);
    });

    it("reflects a contribution made before the deadline even though refund() would now revert", async function () {
      // Sanity check on the "escrow's own state IS the snapshot" premise:
      // once frozen, the weight vote() sees matches what refund() would
      // have paid out, had it been called one second earlier.
      const { vote, recipient, escrow, alice } = await deployVoteWithContributions();
      await vote.connect(recipient).proposeOptions(NAME, ["Foo", "Bar"]);
      const onChainWeight = await escrow.contributions(alice.address);
      await vote.connect(alice).vote(NAME, 0);
      expect(await vote.optionWeight(NAME, 0)).to.equal(onChainWeight);
    });
  });

  describe("votingOpen()", function () {
    it("is false before the deadline, true during the window, false after", async function () {
      const { vote, deadline } = await deployVote();
      expect(await vote.votingOpen()).to.equal(false);
      await time.increaseTo(deadline + 1);
      expect(await vote.votingOpen()).to.equal(true);
      await time.increaseTo(deadline + 48 * 3600 + 1);
      expect(await vote.votingOpen()).to.equal(false);
    });
  });

  // Small helper for the one test that needs a contribution made BEFORE
  // the raise closes, without going through the full deployVoteWithContributions
  // flow (which already fast-forwards past the deadline).
  async function escrowContribute(vote, signer, amountEth) {
    const escrow = await ethers.getContractAt("BigPadEscrow", await vote.escrow());
    await escrow.connect(signer).contribute({ value: ethers.parseEther(amountEth) });
  }
});
