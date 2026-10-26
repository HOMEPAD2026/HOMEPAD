// Crimson Market: Crimson Celestial NFTs bought and sold for USDC on Arc, nothing held by the market.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CrimsonMarket", function () {
  async function deploy() {
    const [owner, gm, alice, bob, eve, treasury] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CrimsonCelestialNFT")).deploy(owner.address, gm.address, "https://x/");
    const usdc = await (await ethers.getContractFactory("ArcUsdcMock")).deploy();
    const mkt = await (await ethers.getContractFactory("CrimsonMarket")).deploy(owner.address, await nft.getAddress(), await usdc.getAddress(), treasury.address, 200);
    const net = await ethers.provider.getNetwork();
    const domain = { name: "CrimsonCelestialNFT", version: "1", chainId: net.chainId, verifyingContract: await nft.getAddress() };
    const types = { Voucher: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "kind", type: "uint16" }, { name: "src", type: "uint8" }, { name: "plus", type: "uint8" }, { name: "stars", type: "uint8" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
    const v = { to: alice.address, tokenId: 7n, kind: 3, src: 2, plus: 10, stars: 1, nonce: 1n, deadline: BigInt(await time.latest()) + 3600n };
    await nft.mint(v, await gm.signTypedData(domain, types, v));
    await usdc.mint(bob.address, 1000n * 10n ** 6n); await usdc.mint(eve.address, 1000n * 10n ** 6n);
    return { nft, usdc, mkt, owner, alice, bob, eve, treasury };
  }
  const U = (n) => BigInt(n) * 10n ** 6n;

  it("lists only a held, approved piece at a sane price", async function () {
    const { nft, mkt, alice, eve } = await deploy();
    await expect(mkt.connect(alice).list(7n, U(50))).to.be.revertedWithCustomError(mkt, "NotApproved");
    await nft.connect(alice).approve(await mkt.getAddress(), 7n);
    await expect(mkt.connect(eve).list(7n, U(50))).to.be.revertedWithCustomError(mkt, "NotHolder");
    await expect(mkt.connect(alice).list(7n, 10n)).to.be.revertedWithCustomError(mkt, "BadPrice");
    await expect(mkt.connect(alice).list(7n, U(50))).to.emit(mkt, "Listed").withArgs(7n, alice.address, U(50));
    expect(await nft.ownerOf(7n)).to.equal(alice.address); // (nothing held by the market)
  });
  it("a sale: USDC to the seller less 2 % to the treasury, the piece to the buyer", async function () {
    const { nft, usdc, mkt, alice, bob, treasury } = await deploy();
    await nft.connect(alice).setApprovalForAll(await mkt.getAddress(), true); await mkt.connect(alice).list(7n, U(50));
    await usdc.connect(bob).approve(await mkt.getAddress(), U(50));
    await expect(mkt.connect(bob).buy(7n, U(50))).to.emit(mkt, "Sold").withArgs(7n, alice.address, bob.address, U(50), U(1));
    expect(await nft.ownerOf(7n)).to.equal(bob.address);
    expect(await usdc.balanceOf(alice.address)).to.equal(U(49)); expect(await usdc.balanceOf(treasury.address)).to.equal(U(1));
    await expect(mkt.connect(bob).buy(7n, U(50))).to.be.revertedWithCustomError(mkt, "NotListed");
  });
  it("refuses a raised price, your own piece, and a piece the seller no longer holds", async function () {
    const { nft, usdc, mkt, alice, bob, eve } = await deploy();
    await nft.connect(alice).setApprovalForAll(await mkt.getAddress(), true); await mkt.connect(alice).list(7n, U(50));
    await usdc.connect(bob).approve(await mkt.getAddress(), U(100));
    await mkt.connect(alice).list(7n, U(80));
    await expect(mkt.connect(bob).buy(7n, U(50))).to.be.revertedWithCustomError(mkt, "PriceChanged");
    await expect(mkt.connect(alice).buy(7n, U(80))).to.be.revertedWithCustomError(mkt, "OwnPiece");
    await nft.connect(alice).transferFrom(alice.address, eve.address, 7n);
    await expect(mkt.connect(bob).buy(7n, U(80))).to.be.revertedWithCustomError(mkt, "NotHolder");
    await expect(mkt.connect(bob).cancel(7n)).to.emit(mkt, "Cancelled"); // (anyone clears a stale listing)
  });
  it("only the seller cancels a live listing; only the owner sets the fee, at most 10 %", async function () {
    const { nft, mkt, owner, alice, eve } = await deploy();
    await nft.connect(alice).setApprovalForAll(await mkt.getAddress(), true); await mkt.connect(alice).list(7n, U(50));
    await expect(mkt.connect(eve).cancel(7n)).to.be.revertedWithCustomError(mkt, "NotHolder");
    await mkt.connect(alice).cancel(7n);
    await expect(mkt.connect(eve).setFee(eve.address, 100)).to.be.revertedWithCustomError(mkt, "OwnableUnauthorizedAccount");
    await expect(mkt.connect(owner).setFee(owner.address, 1001)).to.be.revertedWithCustomError(mkt, "BadFee");
    await mkt.connect(owner).setFee(owner.address, 500); expect(await mkt.feeBps()).to.equal(500);
  });
});
