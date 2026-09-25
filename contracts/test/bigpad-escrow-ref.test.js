const { expect } = require("chai");
const { ethers } = require("hardhat");

// CirclePad referral links append the referrer's address to the
// contribute() calldata (selector ++ 20 bytes). The escrow must accept that
// exactly like a plain contribute(), so the site can read the referrer back
// from the transaction itself — no extra signature, nothing to forge.
describe("BigPadEscrow — contribute() with a referrer appended to calldata", function () {
  it("accepts the call and records the contribution as usual", async function () {
    const [, recipient, platform, treasury, alice, ref] = await ethers.getSigners();
    const escrow = await (await ethers.getContractFactory("BigPadEscrow")).deploy(recipient.address, platform.address, treasury.address, 0);
    await escrow.connect(recipient).start();
    const data = escrow.interface.encodeFunctionData("contribute") + ref.address.slice(2).toLowerCase();
    const tx = await alice.sendTransaction({ to: await escrow.getAddress(), data, value: ethers.parseEther("2") });
    const rc = await tx.wait();
    expect(await escrow.contributions(alice.address)).to.equal(ethers.parseEther("2"));
    const ev = rc.logs.map((l) => { try { return escrow.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Contributed");
    expect(ev.args.contributor).to.equal(alice.address);
    const sent = (await ethers.provider.getTransaction(tx.hash)).data;
    expect("0x" + sent.slice(10)).to.equal(ref.address.toLowerCase());
  });
});
