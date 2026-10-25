// Crimson Celestial NFTs (step C): a GM-signed voucher mints a game piece onto Arc, the holder returns it to the game.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CrimsonCelestialNFT", function () {
  async function deploy() {
    const [owner, gm, alice, bob, eve] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CrimsonCelestialNFT")).deploy(owner.address, gm.address, "https://www.arcircle.app/api/social?world=mythic-nft&id=");
    const net = await ethers.provider.getNetwork();
    const domain = { name: "CrimsonCelestialNFT", version: "1", chainId: net.chainId, verifyingContract: await nft.getAddress() };
    const types = { Voucher: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "kind", type: "uint16" }, { name: "src", type: "uint8" }, { name: "plus", type: "uint8" }, { name: "stars", type: "uint8" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
    const voucher = async (o = {}) => ({ to: alice.address, tokenId: 1001n, kind: 3, src: 2, plus: 10, stars: 1, nonce: 1n, deadline: BigInt(await time.latest()) + 3600n, ...o });
    const sign = (who, v) => who.signTypedData(domain, types, v);
    return { nft, owner, gm, alice, bob, eve, voucher, sign };
  }

  it("mints a piece with the GM's voucher, its kind, origin, + and stars on chain", async function () {
    const { nft, gm, alice, eve, voucher, sign } = await deploy();
    const v = await voucher(), sig = await sign(gm, v);
    await expect(nft.connect(eve).mint(v, sig)).to.emit(nft, "Minted").withArgs(1001n, alice.address, 3, 2, 10, 1, 1n);
    expect(await nft.ownerOf(1001n)).to.equal(alice.address);
    const p = await nft.pieceOf(1001n); expect(p.kind).to.equal(3); expect(p.plus).to.equal(10); expect(p.stars).to.equal(1);
    expect(await nft.tokenURI(1001n)).to.equal("https://www.arcircle.app/api/social?world=mythic-nft&id=1001");
  });
  it("refuses a voucher signed by anyone else, used twice, expired or changed", async function () {
    const { nft, gm, eve, voucher, sign } = await deploy();
    const v = await voucher();
    await expect(nft.mint(v, await sign(eve, v))).to.be.revertedWithCustomError(nft, "BadSignature");
    const sig = await sign(gm, v); await nft.mint(v, sig);
    await expect(nft.mint(v, sig)).to.be.revertedWithCustomError(nft, "NonceUsed");
    const v2 = await voucher({ nonce: 2n, tokenId: 1002n }), s2 = await sign(gm, v2);
    await expect(nft.mint({ ...v2, plus: 15 }, s2)).to.be.revertedWithCustomError(nft, "BadSignature");
    const v3 = await voucher({ nonce: 3n, tokenId: 1003n, deadline: BigInt(await time.latest()) - 1n });
    await expect(nft.mint(v3, await sign(gm, v3))).to.be.revertedWithCustomError(nft, "Expired");
  });
  it("travels like any NFT, and only its holder returns it to the game (it burns)", async function () {
    const { nft, gm, alice, bob, voucher, sign } = await deploy();
    const v = await voucher(); await nft.mint(v, await sign(gm, v));
    await nft.connect(alice).transferFrom(alice.address, bob.address, 1001n);
    await expect(nft.connect(alice).toGame(1001n)).to.be.revertedWithCustomError(nft, "NotHolder");
    await expect(nft.connect(bob).toGame(1001n)).to.emit(nft, "Returned").withArgs(1001n, bob.address);
    await expect(nft.ownerOf(1001n)).to.be.reverted;
    // out again later with a new voucher (its new +)
    const v4 = await voucher({ to: bob.address, nonce: 4n, plus: 12 }); await nft.mint(v4, await sign(gm, v4));
    expect((await nft.pieceOf(1001n)).plus).to.equal(12);
  });
  it("changes the signer only after a day, and only the owner", async function () {
    const { nft, owner, gm, eve, voucher, sign } = await deploy();
    await expect(nft.connect(eve).proposeSigner(eve.address)).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    await nft.connect(owner).proposeSigner(eve.address);
    await expect(nft.connect(owner).acceptSigner()).to.be.revertedWithCustomError(nft, "TooEarly");
    await time.increase(86401); await nft.connect(owner).acceptSigner();
    expect(await nft.signer()).to.equal(eve.address);
    const v = await voucher({ nonce: 9n }); await expect(nft.mint(v, await sign(gm, v))).to.be.revertedWithCustomError(nft, "BadSignature");
  });
});
