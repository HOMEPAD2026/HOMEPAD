const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Same tree as api/_mine.mjs: leaf = keccak(keccak(abi.encode(mineId, account, cumulative))), sorted pairs.
const coder = ethers.AbiCoder.defaultAbiCoder();
const leaf = (id, a, v) => ethers.keccak256(ethers.keccak256(coder.encode(["uint256", "address", "uint256"], [id, a, v])));
const pair = (a, b) => (a.toLowerCase() < b.toLowerCase() ? ethers.keccak256(ethers.concat([a, b])) : ethers.keccak256(ethers.concat([b, a])));
function tree(id, rows) {
  const layers = [rows.map(([a, v]) => leaf(id, a, v))];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1], next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? pair(cur[i], cur[i + 1]) : cur[i]);
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], proof: (k) => { const p = []; for (let l = 0; l < layers.length - 1; l++) { const s = k ^ 1; if (s < layers[l].length) p.push(layers[l][s]); k >>= 1; } return p; } };
}

describe("BuilderMine", function () {
  const DAY = 86400n, E = (n) => ethers.parseEther(String(n)), U = (n) => BigInt(Math.round(n * 1e6));
  const DEAD = "0x000000000000000000000000000000000000dEaD";
  async function deploy() {
    const [owner, creator, a, b, c, op, treasury] = await ethers.getSigners();
    const Tok = await ethers.getContractFactory("MockTaxToken");
    const usdc = await Tok.deploy("USDC", "USDC", 0);
    const arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 0);
    const coin = await Tok.deploy("Coin", "COIN", 0);
    const M = await ethers.getContractFactory("BuilderMine");
    const mine = await M.deploy(usdc.target, arc.target, op.address, treasury.address);
    await coin.mint(creator.address, E(1_000_000));
    for (const s of [a, b, c]) { await usdc.mint(s.address, U(100)); await usdc.connect(s).approve(mine.target, U(100)); await arc.mint(s.address, E(10_000_000)); await arc.connect(s).approve(mine.target, E(10_000_000)); }
    // pickaxes: stone 50K, iron 150K, gold 400K, diamond 1M, infinite 2.5M; boosts: lantern, dynamite, charm, overtime
    const P = [[50_000, 1], [150_000, 2], [400_000, 3], [1_000_000, 4], [2_500_000, 5]];
    for (let i = 0; i < P.length; i++) await mine.setItem(i, E(P[i][0]), P[i][1], 0, 0, true);
    await mine.setItem(5, E(30_000), 0, 1, 86400, true);
    await mine.setItem(6, E(20_000), 0, 2, 3600, true);
    await mine.setItem(7, E(40_000), 0, 3, 86400, true);
    await mine.setItem(8, E(30_000), 0, 4, 86400, true);
    return { owner, creator, a, b, c, op, treasury, usdc, arc, coin, mine };
  }
  async function opened(days = 6) {
    const d = await deploy();
    await d.coin.connect(d.creator).approve(d.mine.target, E(100_000));
    await d.mine.connect(d.creator).openMine(d.coin.target, E(100_000), days, 0);
    return d;
  }

  it("opens a mine and keeps the deposit", async function () {
    const { mine, coin, creator } = await opened();
    const m = await mine.getMine(0);
    expect(m.token).to.equal(coin.target);
    expect(m.creator).to.equal(creator.address);
    expect(m.deposited).to.equal(E(100_000));
    expect(m.end - m.start).to.equal(6n * DAY);
    expect(await coin.balanceOf(mine.target)).to.equal(E(100_000));
    expect(await mine.minesOfToken(coin.target)).to.deep.equal([0n]);
  });

  it("refuses bad mines", async function () {
    const { mine, coin, creator, usdc } = await deploy();
    await coin.connect(creator).approve(mine.target, E(10));
    await expect(mine.connect(creator).openMine(coin.target, 0, 7, 0)).to.be.revertedWithCustomError(mine, "ZeroAmount");
    await expect(mine.connect(creator).openMine(coin.target, E(1), 2, 0)).to.be.revertedWithCustomError(mine, "BadDuration");
    await expect(mine.connect(creator).openMine(coin.target, E(1), 61, 0)).to.be.revertedWithCustomError(mine, "BadDuration");
    await expect(mine.connect(creator).openMine(coin.target, E(1), 7, 8 * 86400)).to.be.revertedWithCustomError(mine, "BadDelay");
    await expect(mine.connect(creator).openMine(usdc.target, E(1), 7, 0)).to.be.revertedWithCustomError(mine, "BadToken");
  });

  it("measures fee-on-transfer deposits", async function () {
    const { mine, creator } = await deploy();
    const Tok = await ethers.getContractFactory("MockTaxToken");
    const taxed = await Tok.deploy("Tax", "TAX", 100);
    await taxed.mint(creator.address, E(1000));
    await taxed.connect(creator).approve(mine.target, E(1000));
    await mine.connect(creator).openMine(taxed.target, E(1000), 7, 0);
    expect((await mine.getMine(0)).deposited).to.equal(E(990));
  });

  it("charges 1 USDC to join, once, and records a referrer who joined first", async function () {
    const { mine, a, b, c, usdc, treasury } = await opened();
    await expect(mine.connect(a).join(0, b.address)).to.emit(mine, "Joined").withArgs(0, a.address, ethers.ZeroAddress, U(1));
    expect(await usdc.balanceOf(treasury.address)).to.equal(U(1));
    await expect(mine.connect(a).join(0, ethers.ZeroAddress)).to.be.revertedWithCustomError(mine, "AlreadyJoined");
    await mine.connect(b).join(0, a.address);
    expect(await mine.referrerOf(0, b.address)).to.equal(a.address);
    await mine.connect(c).join(0, c.address); // self-referral ignored
    expect(await mine.referrerOf(0, c.address)).to.equal(ethers.ZeroAddress);
    expect((await mine.getMine(0)).builders).to.equal(3);
  });

  it("releases 32/16/8/4/2/1 parts of 63 per layer", async function () {
    const { mine } = await opened(6); // 6 days → one layer a day
    const m = await mine.getMine(0), dep = m.deposited;
    const at = (days) => mine.emittedAt(0, m.start + BigInt(Math.round(days * 86400)));
    expect(await at(0)).to.equal(0n);
    expect(await at(1)).to.equal((dep * 32n) / 63n);
    expect(await at(0.5)).to.equal((dep * 16n) / 63n);
    expect(await at(2)).to.equal((dep * 48n) / 63n);
    expect(await at(5)).to.equal((dep * 62n) / 63n);
    expect(await at(6)).to.equal(dep);
    expect(await at(9)).to.equal(dep);
  });

  it("only the operator posts roots; they grow, stay under the schedule and stop after the final window", async function () {
    const { mine, op, a } = await opened(6);
    const m = await mine.getMine(0);
    const r = ethers.id("root");
    await expect(mine.connect(a).postRoot(0, r, 1)).to.be.revertedWithCustomError(mine, "NotOperator");
    await time.increaseTo(m.start + 3600n);
    const cap = await mine.emittedAt(0, m.start + 3601n);
    await expect(mine.connect(op).postRoot(0, r, cap + E(1))).to.be.revertedWithCustomError(mine, "OverSchedule");
    await mine.connect(op).postRoot(0, r, E(100));
    await expect(mine.connect(op).postRoot(0, r, E(99))).to.be.revertedWithCustomError(mine, "RootShrinks");
    await time.increaseTo(m.end + 3n * DAY + 1n);
    await expect(mine.connect(op).postRoot(0, r, E(200))).to.be.revertedWithCustomError(mine, "TooLate");
  });

  it("pays builders the difference between roots, to the listed wallet only", async function () {
    const { mine, op, a, b, coin } = await opened(6);
    const m = await mine.getMine(0);
    await time.increaseTo(m.start + DAY);
    let t = tree(0, [[a.address, E(300)], [b.address, E(200)]]);
    await mine.connect(op).postRoot(0, t.root, E(500));
    await mine.connect(b).claim(0, a.address, E(300), t.proof(0)); // anyone submits, a is paid
    expect(await coin.balanceOf(a.address)).to.equal(E(300));
    await expect(mine.claim(0, a.address, E(300), t.proof(0))).to.be.revertedWithCustomError(mine, "NothingOwed");
    await expect(mine.claim(0, b.address, E(999), t.proof(1))).to.be.revertedWithCustomError(mine, "BadProof");
    t = tree(0, [[a.address, E(450)], [b.address, E(200)]]);
    await mine.connect(op).postRoot(0, t.root, E(650));
    await mine.claim(0, a.address, E(450), t.proof(0));
    expect(await coin.balanceOf(a.address)).to.equal(E(450));
    expect(await mine.claimedBy(0, a.address)).to.equal(E(450));
    expect((await mine.getMine(0)).claimed).to.equal(E(450));
  });

  it("burns what was never handed out, then what was never claimed", async function () {
    const { mine, op, a, b, coin } = await opened(6);
    const m = await mine.getMine(0);
    await time.increaseTo(m.end);
    const t = tree(0, [[a.address, E(600)], [b.address, E(400)]]);
    await mine.connect(op).postRoot(0, t.root, E(1000));
    await expect(mine.burnUnmined(0)).to.be.revertedWithCustomError(mine, "NotEnded");
    await time.increaseTo(m.end + 3n * DAY + 1n);
    await mine.burnUnmined(0);
    expect(await coin.balanceOf(DEAD)).to.equal(E(99_000));
    await expect(mine.burnUnmined(0)).to.be.revertedWithCustomError(mine, "AlreadyBurned");
    await mine.claim(0, a.address, E(600), t.proof(0));
    await expect(mine.burnUnclaimed(0)).to.be.revertedWithCustomError(mine, "NotEnded");
    await time.increaseTo(m.end + 33n * DAY + 1n);
    await mine.burnUnclaimed(0);
    expect(await coin.balanceOf(DEAD)).to.equal(E(99_400));
    expect(await coin.balanceOf(mine.target)).to.equal(0n);
    await expect(mine.claim(0, b.address, E(400), t.proof(1))).to.be.revertedWithCustomError(mine, "Closed");
    const after = await mine.getMine(0);
    expect(after.burned).to.equal(E(99_400));
    expect(after.closed).to.equal(true);
  });

  it("burnUnclaimed alone also burns the unmined part", async function () {
    const { mine, coin } = await opened(3);
    const m = await mine.getMine(0);
    await time.increaseTo(m.end + 34n * DAY);
    await mine.burnUnclaimed(0);
    expect(await coin.balanceOf(DEAD)).to.equal(E(100_000));
  });

  it("the owner can't touch a mine's tokens", async function () {
    const { mine, owner } = await opened();
    const fns = mine.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
    expect(fns).to.deep.equal(["burnUnclaimed", "burnUnmined", "buyItem", "claim", "join", "openMine", "postRoot", "renounceOwnership", "setFeeTo", "setItem", "setJoinFee", "setOperator", "transferOwnership"]);
    await expect(mine.connect(owner).setJoinFee(U(11))).to.be.revertedWithCustomError(mine, "FeeTooHigh");
  });

  it("sells pickaxes for the tier difference and burns the $ARCIRCLE", async function () {
    const { mine, a, arc } = await opened();
    await mine.connect(a).buyItem(1, 0); // iron, 150K
    expect(await mine.pickaxeOf(a.address)).to.equal(2);
    await expect(mine.connect(a).buyItem(0, 0)).to.be.revertedWithCustomError(mine, "NotAnUpgrade");
    await expect(mine.connect(a).buyItem(3, 0)).to.emit(mine, "ItemBought").withArgs(0, a.address, 3, E(850_000), 4, 0, 0);
    expect(await arc.balanceOf(DEAD)).to.equal(E(1_000_000));
    expect(await mine.arcircleBurned()).to.equal(E(1_000_000));
  });

  it("boosts need a joined builder, stack up to seven days, and show in rigOf", async function () {
    const { mine, a } = await opened();
    await expect(mine.connect(a).buyItem(5, 0)).to.be.revertedWithCustomError(mine, "NotJoined");
    await mine.connect(a).join(0, ethers.ZeroAddress);
    await mine.connect(a).buyItem(5, 0);
    await mine.connect(a).buyItem(6, 0);
    const now = BigInt(await time.latest());
    const rig = await mine.rigOf(0, a.address);
    expect(rig.isIn).to.equal(true);
    expect(rig.boosts[0]).to.be.closeTo(now + DAY, 3n);
    expect(rig.boosts[1]).to.be.closeTo(now + 3600n, 3n);
    for (let i = 0; i < 6; i++) await mine.connect(a).buyItem(5, 0);
    await expect(mine.connect(a).buyItem(5, 0)).to.be.revertedWithCustomError(mine, "StackTooLong");
    await expect(mine.connect(a).buyItem(99, 0)).to.be.revertedWithCustomError(mine, "UnknownItem");
  });

  it("items keep their kind and can be switched off", async function () {
    const { mine, a } = await opened();
    await expect(mine.setItem(0, E(1), 0, 1, 60, true)).to.be.revertedWithCustomError(mine, "BadItem");
    await mine.setItem(0, E(1), 1, 0, 0, false);
    await expect(mine.connect(a).buyItem(0, 0)).to.be.revertedWithCustomError(mine, "ItemOff");
    await expect(mine.connect(a).setItem(0, 1, 1, 0, 0, true)).to.be.revertedWithCustomError(mine, "OwnableUnauthorizedAccount");
  });

  it("no joining after the end", async function () {
    const { mine, a } = await opened(3);
    const m = await mine.getMine(0);
    await time.increaseTo(m.end);
    await expect(mine.connect(a).join(0, ethers.ZeroAddress)).to.be.revertedWithCustomError(mine, "Ended");
  });
});
