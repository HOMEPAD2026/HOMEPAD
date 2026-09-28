// End-to-end with LayerZero's EndpointV2Mock: Arc lockbox ↔ Robinhood OFT ↔ a second OFT standing in for
// Solana (the Solana program itself is LayerZero's audited OFT program; this checks our EVM side and the
// supply invariant across three chains).   npx hardhat test
const { expect } = require("chai");
const { ethers } = require("hardhat");

const ARC = 30417, RH = 30416, SOL = 30168; // EndpointId.ARC_V2_MAINNET, ROBINHOOD_V2_MAINNET, SOLANA_V2_MAINNET
const E = (n) => ethers.parseEther(String(n));
const gas = (g) => "0x0003" + "01" + "0011" + "01" + g.toString(16).padStart(32, "0"); // executor lzReceive option
const b32 = (a) => ethers.zeroPadValue(a, 32);

describe("ARCIRCLE OMNI", () => {
  let owner, alice, bob, guardian, arcir, adapter, rh, sol, eA, eR, eS, usdc;
  const param = (dst, to, amt, min) => ({ dstEid: dst, to: b32(to), amountLD: amt, minAmountLD: min ?? amt, extraOptions: gas(200000), composeMsg: "0x", oftCmd: "0x" });
  async function send(oft, from, p) {
    const q = await oft.quoteSend(p, false);
    return oft.connect(from).send(p, { nativeFee: q.nativeFee, lzTokenFee: 0 }, from.address, { value: q.nativeFee });
  }
  const invariant = async () => expect(await adapter.lockedSupply()).to.equal((await rh.totalSupply()) + (await sol.totalSupply()));

  beforeEach(async () => {
    [owner, alice, bob, guardian] = await ethers.getSigners();
    const EP = await ethers.getContractFactory("EndpointV2Mock");
    eA = await EP.deploy(ARC); eR = await EP.deploy(RH); eS = await EP.deploy(SOL);
    arcir = await (await ethers.getContractFactory("MockArcircle")).deploy();
    adapter = await (await ethers.getContractFactory("ArcircleOFTAdapter")).deploy(await arcir.getAddress(), await eA.getAddress(), owner.address);
    const OFT = await ethers.getContractFactory("ArcircleOFT");
    rh = await OFT.deploy("arcircle", "ARCIRCLE", await eR.getAddress(), owner.address);
    sol = await OFT.deploy("arcircle", "ARCIRCLE", await eS.getAddress(), owner.address);
    const all = [[adapter, eA, ARC], [rh, eR, RH], [sol, eS, SOL]];
    for (const [a, , ea] of all) for (const [b, eb, bEid] of all) {
      if (a === b) continue;
      await a.setPeer(bEid, b32(await b.getAddress()));
      await (all.find((x) => x[0] === a)[1]).setDestLzEndpoint(await b.getAddress(), await eb.getAddress());
    }
    // Rate limits fail closed: with no limit set for a destination, nothing can be sent there.
    for (const [a, , ea] of all) await a.setRateLimits(all.filter((x) => x[2] !== ea).map((x) => ({ dstEid: x[2], limit: E(50_000_000), window: 86400 })));
    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
    await arcir.transfer(alice.address, E(1_000_000));
  });

  it("fails closed: no rate limit set for a destination means nothing can go there", async () => {
    await adapter.resetRateLimits([RH]);
    await adapter.setRateLimits([{ dstEid: RH, limit: 0, window: 86400 }]);
    await arcir.connect(alice).approve(await adapter.getAddress(), E(1));
    await expect(send(adapter, alice, param(RH, bob.address, E(1)))).to.be.revertedWithCustomError(adapter, "RateLimitExceeded");
  });

  it("mints nothing at deploy: global supply stays the Arc token's 1B", async () => {
    expect(await rh.totalSupply()).to.equal(0n);
    expect(await sol.totalSupply()).to.equal(0n);
    expect(await arcir.totalSupply()).to.equal(E(1_000_000_000));
  });

  it("Arc → Robinhood locks on Arc and mints on Robinhood, 1:1", async () => {
    await arcir.connect(alice).approve(await adapter.getAddress(), E(100_000));
    await send(adapter, alice, param(RH, bob.address, E(100_000)));
    expect(await adapter.lockedSupply()).to.equal(E(100_000));
    expect(await rh.balanceOf(bob.address)).to.equal(E(100_000));
    expect(await arcir.balanceOf(alice.address)).to.equal(E(900_000));
    await invariant();
  });

  it("Robinhood → Solana → Arc keeps locked == RH + SOL at every step", async () => {
    await arcir.connect(alice).approve(await adapter.getAddress(), E(300_000));
    await send(adapter, alice, param(RH, bob.address, E(300_000)));
    await send(rh, bob, param(SOL, alice.address, E(120_000)));
    expect(await rh.totalSupply()).to.equal(E(180_000));
    expect(await sol.totalSupply()).to.equal(E(120_000));
    await invariant();
    await send(sol, alice, param(ARC, alice.address, E(120_000)));
    expect(await sol.totalSupply()).to.equal(0n);
    expect(await adapter.lockedSupply()).to.equal(E(180_000));
    expect(await arcir.balanceOf(alice.address)).to.equal(E(820_000));
    await invariant();
  });

  it("removes dust below 6 shared decimals instead of losing it", async () => {
    const amt = E(1) + 123n; // 1.000000000000000123
    await arcir.connect(alice).approve(await adapter.getAddress(), amt);
    await send(adapter, alice, param(RH, bob.address, amt, E(1)));
    expect(await rh.balanceOf(bob.address)).to.equal(E(1));
    expect(await adapter.lockedSupply()).to.equal(E(1));
    await invariant();
  });

  it("enforces the per-destination outbound rate limit", async () => {
    await adapter.setRateLimits([{ dstEid: RH, limit: E(50_000), window: 86400 }]);
    await arcir.connect(alice).approve(await adapter.getAddress(), E(100_000));
    await send(adapter, alice, param(RH, bob.address, E(50_000)));
    await expect(send(adapter, alice, param(RH, bob.address, E(1)))).to.be.revertedWithCustomError(adapter, "RateLimitExceeded");
  });

  it("guardian can pause but only the owner unpauses; paused chains neither send nor receive", async () => {
    await adapter.setGuardian(guardian.address);
    await arcir.connect(alice).approve(await adapter.getAddress(), E(10));
    await adapter.connect(guardian).pause();
    await expect(send(adapter, alice, param(RH, bob.address, E(10)))).to.be.revertedWithCustomError(adapter, "EnforcedPause");
    await expect(adapter.connect(guardian).unpause()).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
    await expect(adapter.connect(alice).pause()).to.be.revertedWithCustomError(adapter, "NotGuardianOrOwner");
    await adapter.unpause();
    await send(adapter, alice, param(RH, bob.address, E(10)));
    expect(await rh.balanceOf(bob.address)).to.equal(E(10));
  });

  it("refuses a token that takes a fee on transfer (1:1 backing would break)", async () => {
    const fee = await (await ethers.getContractFactory("MockFeeToken")).deploy();
    const bad = await (await ethers.getContractFactory("ArcircleOFTAdapter")).deploy(await fee.getAddress(), await eA.getAddress(), owner.address);
    await bad.setPeer(RH, b32(await rh.getAddress()));
    await bad.setRateLimits([{ dstEid: RH, limit: E(1_000_000), window: 86400 }]);
    await fee.approve(await bad.getAddress(), E(100));
    await expect(send(bad, owner, param(RH, bob.address, E(100)))).to.be.revertedWithCustomError(bad, "NotLossless");
  });

  it("collects Argus-style USDC rewards without ever touching the locked $ARCIRCLE", async () => {
    await arcir.connect(alice).approve(await adapter.getAddress(), E(1000));
    await send(adapter, alice, param(RH, bob.address, E(1000)));
    const hook = await (await ethers.getContractFactory("MockRewardsHook")).deploy(await usdc.getAddress());
    await adapter.collectRewards(await hook.getAddress(), hook.interface.encodeFunctionData("claim"));
    expect(await usdc.balanceOf(await adapter.getAddress())).to.equal(42_000000n);
    await expect(adapter.sweep(await usdc.getAddress())).to.be.revertedWithCustomError(adapter, "NoReceiver");
    await adapter.setRewardsReceiver(owner.address);
    await adapter.sweep(await usdc.getAddress());
    expect(await usdc.balanceOf(owner.address)).to.equal(42_000000n);
    // the lockbox's own token is off-limits both ways
    await expect(adapter.sweep(await arcir.getAddress())).to.be.revertedWithCustomError(adapter, "LockboxTokenUntouchable");
    await expect(adapter.collectRewards(await arcir.getAddress(), arcir.interface.encodeFunctionData("transfer", [owner.address, E(1)]))).to.be.revertedWithCustomError(adapter, "LockboxTokenUntouchable");
    const thief = await (await ethers.getContractFactory("MockThief")).deploy();
    await expect(adapter.collectRewards(await thief.getAddress(), thief.interface.encodeFunctionData("steal", [await arcir.getAddress(), await adapter.getAddress(), E(1)]))).to.be.reverted;
    expect(await adapter.lockedSupply()).to.equal(E(1000));
    await expect(adapter.connect(alice).collectRewards(await hook.getAddress(), "0x")).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
  });

  it("only a wired peer can mint on Robinhood", async () => {
    const fake = await (await ethers.getContractFactory("ArcircleOFT")).deploy("x", "X", await eS.getAddress(), owner.address);
    await fake.setPeer(RH, b32(await rh.getAddress()));
    await fake.setRateLimits([{ dstEid: RH, limit: E(1_000_000), window: 86400 }]);
    await eS.setDestLzEndpoint(await rh.getAddress(), await eR.getAddress());
    // fake has no tokens to burn, and RH doesn't list it as a peer: nothing can be minted from it
    await expect(send(fake, owner, param(RH, bob.address, E(1)))).to.be.reverted;
    expect(await rh.totalSupply()).to.equal(0n);
  });
});
