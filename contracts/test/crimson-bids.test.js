// Crimson Bids: USDC offers for Crimson Celestial NFTs on Arc, held in escrow until cancelled or accepted.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CrimsonBids", function () {
  const U = (n) => BigInt(Math.round(n * 1e6));
  const types = { Voucher: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "kind", type: "uint16" }, { name: "src", type: "uint8" }, { name: "plus", type: "uint8" }, { name: "stars", type: "uint8" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };

  async function deploy() {
    const [owner, gm, alice, bob, eve, treasury] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CrimsonCelestialNFT")).deploy(owner.address, gm.address, "https://x/");
    const usdc = await (await ethers.getContractFactory("ArcUsdcMock")).deploy();
    const bids = await (await ethers.getContractFactory("CrimsonBids")).deploy(await nft.getAddress(), await usdc.getAddress(), treasury.address, owner.address);
    const net = await ethers.provider.getNetwork();
    const domain = { name: "CrimsonCelestialNFT", version: "1", chainId: net.chainId, verifyingContract: await nft.getAddress() };
    let nonce = 0n;
    const mint = async (to, tokenId, plus = 10) => {
      const v = { to: to.address, tokenId, kind: 3, src: 2, plus, stars: 1, nonce: ++nonce, deadline: BigInt(await time.latest()) + 3600n };
      await nft.mint(v, await gm.signTypedData(domain, types, v));
    };
    await mint(alice, 7n);
    const B = await bids.getAddress();
    for (const w of [bob, eve]) { await usdc.mint(w.address, U(1000)); await usdc.connect(w).approve(B, ethers.MaxUint256); }
    const later = async (s = 86400) => BigInt(await time.latest()) + BigInt(s);
    return { nft, usdc, bids, B, owner, alice, bob, eve, treasury, mint, later };
  }

  it("a bid escrows the USDC; raising it tops it up; one live bid a bidder a piece", async function () {
    const { usdc, bids, B, alice, bob, later } = await deploy();
    const exp = await later();
    await expect(bids.connect(bob).bid(7n, U(50), exp)).to.emit(bids, "Bid").withArgs(7n, bob.address, U(50), exp);
    expect(await usdc.balanceOf(B)).to.equal(U(50));
    expect(await usdc.balanceOf(bob.address)).to.equal(U(950));
    await bids.connect(bob).bid(7n, U(80), exp + 10n);
    expect(await usdc.balanceOf(bob.address)).to.equal(U(920)); // only the 30 difference
    const o = await bids.bidOf(7n, bob.address);
    expect(o.amount).to.equal(U(80)); expect(o.expiry).to.equal(exp + 10n);
    expect(await bids.totalEscrow()).to.equal(U(80));
    expect(await bids.biddersOf(7n)).to.deep.equal([bob.address]);
    await expect(bids.connect(bob).bid(7n, U(80), exp)).to.be.revertedWithCustomError(bids, "BadAmount"); // not a raise
    await expect(bids.connect(bob).bid(7n, U(0.5), exp)).to.be.revertedWithCustomError(bids, "BadAmount");
    await expect(bids.connect(bob).bid(7n, U(90), BigInt(await time.latest()))).to.be.revertedWithCustomError(bids, "BadExpiry");
    await expect(bids.connect(bob).bid(7n, U(90), await later(91 * 86400))).to.be.revertedWithCustomError(bids, "BadExpiry");
    await expect(bids.connect(alice).bid(7n, U(90), exp)).to.be.revertedWithCustomError(bids, "OwnPiece");
  });

  it("cancelBid refunds everything at any time", async function () {
    const { usdc, bids, B, bob, eve, later } = await deploy();
    await bids.connect(bob).bid(7n, U(40), await later());
    await bids.connect(eve).bid(7n, U(60), await later());
    await expect(bids.connect(bob).cancelBid(7n)).to.emit(bids, "BidCancelled").withArgs(7n, bob.address, U(40));
    expect(await usdc.balanceOf(bob.address)).to.equal(U(1000));
    expect(await usdc.balanceOf(B)).to.equal(U(60));
    expect(await bids.biddersOf(7n)).to.deep.equal([eve.address]);
    await expect(bids.connect(bob).cancelBid(7n)).to.be.revertedWithCustomError(bids, "NoBid");
  });

  it("accept: the piece to the bidder, the amount less 2 % to the holder, the fee kept apart for feeTo", async function () {
    const { nft, usdc, bids, B, alice, bob, eve, treasury, later } = await deploy();
    await bids.connect(bob).bid(7n, U(100), await later());
    await bids.connect(eve).bid(7n, U(70), await later());
    await expect(bids.connect(alice).accept(7n, bob.address, U(98))).to.be.revertedWithCustomError(bids, "NotApproved");
    await nft.connect(alice).approve(B, 7n);
    await expect(bids.connect(eve).accept(7n, bob.address, 0)).to.be.revertedWithCustomError(bids, "NotHolder");
    await expect(bids.connect(alice).accept(7n, bob.address, U(98.01))).to.be.revertedWithCustomError(bids, "TooLittle");
    await expect(bids.connect(alice).accept(7n, bob.address, U(98))).to.emit(bids, "BidAccepted").withArgs(7n, alice.address, bob.address, U(100), U(2));
    expect(await nft.ownerOf(7n)).to.equal(bob.address);
    expect(await usdc.balanceOf(alice.address)).to.equal(U(98));
    // escrow (eve's 70) and the fee (2) are counted apart; the contract holds exactly both
    expect(await bids.totalEscrow()).to.equal(U(70));
    expect(await bids.feesAccrued()).to.equal(U(2));
    expect(await usdc.balanceOf(B)).to.equal(U(72));
    await expect(bids.connect(eve).claimFees()).to.emit(bids, "FeesClaimed").withArgs(treasury.address, U(2));
    expect(await usdc.balanceOf(treasury.address)).to.equal(U(2));
    expect(await usdc.balanceOf(B)).to.equal(U(70));
    await expect(bids.connect(alice).accept(7n, bob.address, 0)).to.be.revertedWithCustomError(bids, "NotHolder");
    // eve's offer still stands for the new holder, bob
    await nft.connect(bob).setApprovalForAll(B, true);
    await bids.connect(bob).accept(7n, eve.address, U(68.6));
    expect(await nft.ownerOf(7n)).to.equal(eve.address);
    expect(await bids.totalEscrow()).to.equal(0n);
  });

  it("an expired bid can't be accepted; its bidder (or anyone, for them) takes it back", async function () {
    const { nft, usdc, bids, B, alice, bob, eve, later } = await deploy();
    const exp = await later(3600);
    await bids.connect(bob).bid(7n, U(30), exp);
    await nft.connect(alice).approve(B, 7n);
    await expect(bids.connect(eve).clearExpired(7n, bob.address)).to.be.revertedWithCustomError(bids, "BadExpiry");
    await time.increaseTo(exp + 1n);
    await expect(bids.connect(alice).accept(7n, bob.address, 0)).to.be.revertedWithCustomError(bids, "Expired");
    const [live] = await bids.liveBids(7n);
    expect(live).to.deep.equal([]);
    await bids.connect(eve).clearExpired(7n, bob.address); // eve clears it; the USDC goes to bob
    expect(await usdc.balanceOf(bob.address)).to.equal(U(1000));
    expect(await usdc.balanceOf(eve.address)).to.equal(U(1000));
    await bids.connect(bob).bid(7n, U(30), await later(3600));
    await time.increase(7200);
    await bids.connect(bob).cancelBid(7n); // and the bidder can always cancel it themselves
    expect(await usdc.balanceOf(bob.address)).to.equal(U(1000));
  });

  it("a piece that went back to the game and came out different can't be sold on an old bid", async function () {
    const { nft, bids, B, alice, bob, mint, later } = await deploy();
    await bids.connect(bob).bid(7n, U(50), await later());
    await nft.connect(alice).toGame(7n);
    await mint(alice, 7n, 1); // the same tokenId, a lower +
    await nft.connect(alice).approve(B, 7n);
    await expect(bids.connect(alice).accept(7n, bob.address, 0)).to.be.revertedWithCustomError(bids, "PieceChanged");
    await bids.connect(bob).bid(7n, U(51), await later()); // a new offer for the piece as it is now
    await bids.connect(alice).accept(7n, bob.address, 0);
    expect(await nft.ownerOf(7n)).to.equal(bob.address);
  });

  it("the live-bids view lists only unexpired offers", async function () {
    const { bids, bob, eve, later } = await deploy();
    await bids.connect(bob).bid(7n, U(10), await later(100));
    await bids.connect(eve).bid(7n, U(20), await later(10_000));
    let [who, amt] = await bids.liveBids(7n);
    expect(who).to.deep.equal([bob.address, eve.address]); expect(amt).to.deep.equal([U(10), U(20)]);
    await time.increase(200);
    [who, amt] = await bids.liveBids(7n);
    expect(who).to.deep.equal([eve.address]); expect(amt).to.deep.equal([U(20)]);
  });

  it("the owner only sets the fee (≤ 10 %), can't renounce, and has no way to take escrowed USDC", async function () {
    const { nft, usdc, bids, B, owner, alice, bob, eve, treasury, later } = await deploy();
    expect(await bids.feeBps()).to.equal(200);
    await expect(bids.connect(eve).setFee(eve.address, 100)).to.be.revertedWithCustomError(bids, "OwnableUnauthorizedAccount");
    await expect(bids.setFee(owner.address, 1001)).to.be.revertedWithCustomError(bids, "BadFee");
    await expect(bids.setFee(ethers.ZeroAddress, 100)).to.be.revertedWithCustomError(bids, "ZeroAddress");
    await expect(bids.renounceOwnership()).to.be.revertedWithCustomError(bids, "NoRenounce");
    await bids.connect(bob).bid(7n, U(100), await later());
    await bids.setFee(treasury.address, 1000);
    await nft.connect(alice).approve(B, 7n);
    // the holder agreed to 98 net: a fee raise under them makes the accept fail instead of paying less
    await expect(bids.connect(alice).accept(7n, bob.address, U(98))).to.be.revertedWithCustomError(bids, "TooLittle");
    await bids.connect(alice).accept(7n, bob.address, U(90));
    expect(await bids.feesAccrued()).to.equal(U(10));
    // no function moves escrow anywhere but back to its bidder or to a seller: the ABI has no withdraw / sweep / rescue
    const names = bids.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    for (const bad of ["withdraw", "sweep", "rescue", "emergencyWithdraw", "skim"]) expect(names).to.not.include(bad);
    // two-step ownership
    await bids.transferOwnership(eve.address);
    expect(await bids.owner()).to.equal(owner.address);
    await bids.connect(eve).acceptOwnership();
    expect(await bids.owner()).to.equal(eve.address);
    expect(await usdc.balanceOf(B)).to.equal(U(10)); // only the fee is left
  });

  it("re-entering from the bidder's onERC721Received is blocked", async function () {
    const { nft, usdc, bids, B, alice, later } = await deploy();
    const R = await (await ethers.getContractFactory("BidsReenter")).deploy(B, await usdc.getAddress());
    await usdc.mint(await R.getAddress(), U(100));
    await R.place(7n, U(50), await later());
    await nft.connect(alice).approve(B, 7n);
    await expect(bids.connect(alice).accept(7n, await R.getAddress(), 0)).to.be.revertedWithCustomError(bids, "ReentrancyGuardReentrantCall"); // its cancelBid inside the transfer hits nonReentrant
    expect(await nft.ownerOf(7n)).to.equal(alice.address);
    expect(await bids.totalEscrow()).to.equal(U(50));
  });
});
