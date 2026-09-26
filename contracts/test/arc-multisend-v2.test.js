const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArcMultiSendV2", function () {
  const U = (n) => BigInt(Math.round(n * 1e6));
  async function deploy() {
    const [deployer, sender, other] = await ethers.getSigners();
    const usd = await (await ethers.getContractFactory("MockPermitToken")).deploy();
    const coin = await (await ethers.getContractFactory("MockTaxToken")).deploy("Coin", "COIN", 0);
    const n721 = await (await ethers.getContractFactory("MockNFT721")).deploy();
    const n1155 = await (await ethers.getContractFactory("MockNFT1155")).deploy();
    const nor = await (await ethers.getContractFactory("NoReceiver")).deploy();
    await usd.mint(sender.address, U(1000));
    await coin.mint(sender.address, ethers.parseEther("1000"));
    const ms = await (await ethers.getContractFactory("ArcMultiSendV2")).deploy();
    const w = Array.from({ length: 4 }, () => ethers.Wallet.createRandom().address);
    return { deployer, sender, other, usd, coin, n721, n1155, nor, ms, w };
  }
  async function permitSig(token, owner, spender, value, deadline) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = { name: await token.name(), version: "1", chainId, verifyingContract: token.target };
    const types = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
    const sig = ethers.Signature.from(await owner.signTypedData(domain, types, { owner: owner.address, spender, value, nonce: await token.nonces(owner.address), deadline }));
    return [sig.v, sig.r, sig.s];
  }

  it("sendWithPermit: no approval transaction", async function () {
    const { sender, usd, ms, w } = await deploy();
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const [v, r, s] = await permitSig(usd, sender, ms.target, U(10), deadline);
    await expect(ms.connect(sender).sendWithPermit(usd.target, w.slice(0, 2), [U(4), U(6)], U(10), deadline, v, r, s)).to.emit(ms, "Sent").withArgs(usd.target, sender.address, 2, U(10));
    expect(await usd.balanceOf(w[1])).to.equal(U(6));
    expect(await usd.allowance(sender.address, ms.target)).to.equal(0n);
  });

  it("sendWithPermit still works if the permit was front-run", async function () {
    const { sender, other, usd, ms, w } = await deploy();
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const [v, r, s] = await permitSig(usd, sender, ms.target, U(10), deadline);
    await usd.connect(other).permit(sender.address, ms.target, U(10), deadline, v, r, s); // someone used it first
    await ms.connect(sender).sendWithPermit(usd.target, [w[0]], [U(10)], U(10), deadline, v, r, s);
    expect(await usd.balanceOf(w[0])).to.equal(U(10));
  });

  it("a bad permit falls back to the allowance, and fails without one", async function () {
    const { sender, usd, ms, w } = await deploy();
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    await expect(ms.connect(sender).sendWithPermit(usd.target, [w[0]], [U(1)], U(1), deadline, 27, ethers.ZeroHash, ethers.ZeroHash)).to.be.reverted;
    await usd.connect(sender).approve(ms.target, U(1));
    await ms.connect(sender).sendWithPermit(usd.target, [w[0]], [U(1)], U(1), deadline, 27, ethers.ZeroHash, ethers.ZeroHash);
    expect(await usd.balanceOf(w[0])).to.equal(U(1));
  });

  it("sendMulti: a different token per row", async function () {
    const { sender, usd, coin, ms, w } = await deploy();
    await usd.connect(sender).approve(ms.target, U(5));
    await coin.connect(sender).approve(ms.target, ethers.parseEther("7"));
    await expect(ms.connect(sender).sendMulti([usd.target, coin.target, usd.target], [w[0], w[1], w[2]], [U(2), ethers.parseEther("7"), U(3)])).to.emit(ms, "SentMulti").withArgs(sender.address, 3);
    expect(await usd.balanceOf(w[2])).to.equal(U(3));
    expect(await coin.balanceOf(w[1])).to.equal(ethers.parseEther("7"));
    await expect(ms.connect(sender).sendMulti([usd.target], [w[0], w[1]], [1, 1])).to.be.revertedWithCustomError(ms, "BadInput");
  });

  it("ERC-721 and ERC-1155 to many wallets", async function () {
    const { sender, n721, n1155, ms, w } = await deploy();
    for (const id of [1, 2, 3]) await n721.mint(sender.address, id);
    await n1155.mint(sender.address, 7, 100);
    await n721.connect(sender).setApprovalForAll(ms.target, true);
    await n1155.connect(sender).setApprovalForAll(ms.target, true);
    await expect(ms.connect(sender).sendERC721(n721.target, w.slice(0, 3), [1, 2, 3])).to.emit(ms, "SentNFT").withArgs(n721.target, sender.address, 3, 3);
    expect(await n721.ownerOf(3)).to.equal(w[2]);
    await expect(ms.connect(sender).sendERC1155(n1155.target, w.slice(0, 2), [7, 7], [10, 15])).to.emit(ms, "SentNFT").withArgs(n1155.target, sender.address, 2, 25);
    expect(await n1155.balanceOf(w[1], 7)).to.equal(15n);
    expect(await ms.transfers()).to.equal(5n);
  });

  it("an NFT to a contract that can't hold it reverts the whole batch", async function () {
    const { sender, n721, nor, ms, w } = await deploy();
    await n721.mint(sender.address, 1); await n721.mint(sender.address, 2);
    await n721.connect(sender).setApprovalForAll(ms.target, true);
    await expect(ms.connect(sender).sendERC721(n721.target, [w[0], nor.target], [1, 2])).to.be.reverted;
    expect(await n721.ownerOf(1)).to.equal(sender.address);
  });

  it("v1 calls still work; no admin functions", async function () {
    const { sender, coin, ms, w } = await deploy();
    await coin.connect(sender).approve(ms.target, ethers.parseEther("8"));
    await ms.connect(sender).sendSame(coin.target, w, ethers.parseEther("1"));
    await ms.connect(sender).send(coin.target, w, Array(4).fill(ethers.parseEther("1")));
    expect(await coin.balanceOf(w[3])).to.equal(ethers.parseEther("2"));
    const fns = ms.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
    expect(fns).to.deep.equal(["send", "sendERC1155", "sendERC721", "sendMulti", "sendSame", "sendWithPermit"]);
  });
});
