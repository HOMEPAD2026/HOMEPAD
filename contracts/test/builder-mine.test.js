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
const isqrt = (n) => { if (n < 2n) return n; let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; };
// JS mirror of the curve (api/_mine.mjs does the same)
const ONE = 10n ** 18n;
function F(start, end, t) {
  if (t <= start) return 0n; if (t >= end) return ONE;
  const L = (end - start) / 6n, e = t - start, k = e / L; if (k >= 6n) return ONE;
  return ((64n - (1n << (6n - k))) * L + (1n << (5n - k)) * (e - k * L)) * ONE / (63n * L);
}

describe("BuilderMine v2", function () {
  const DAY = 86400n, E = (n) => ethers.parseEther(String(n));
  const DEAD = "0x000000000000000000000000000000000000dEaD";
  const SLOT = ethers.id("arcircle-pool");
  // $ARCIRCLE at $0.0000719 → 13,908 per USDC → raw ratio 1.3908e16 (ARCIRCLE is currency1)
  const RATIO = 13908n * 10n ** 12n;
  const FEE = 13908n * 10n ** 18n;
  async function deploy() {
    const [owner, creator, a, b, c, op] = await ethers.getSigners();
    const Tok = await ethers.getContractFactory("MockTaxToken");
    const arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 0);
    const coin = await Tok.deploy("Coin", "COIN", 0);
    const pm = await (await ethers.getContractFactory("MockExtsload")).deploy();
    await pm.set(SLOT, ethers.toBeHex(isqrt(RATIO << 192n), 32));
    const M = await ethers.getContractFactory("BuilderMine");
    const mine = await M.deploy(arc.target, pm.target, SLOT, true, op.address);
    await coin.mint(creator.address, E(1_000_000));
    for (const s of [creator, a, b, c]) { await arc.mint(s.address, E(20_000_000)); await arc.connect(s).approve(mine.target, E(20_000_000)); }
    const P = [[30_000, 1], [100_000, 2], [250_000, 3], [600_000, 4], [1_500_000, 5], [3_500_000, 6]];
    for (let i = 0; i < P.length; i++) await mine.setItem(i, E(P[i][0]), P[i][1], 0, 0, true);
    await mine.setItem(6, E(30_000), 0, 1, 86400, true);
    await mine.setItem(7, E(20_000), 0, 2, 3600, true);
    return { owner, creator, a, b, c, op, arc, coin, pm, mine };
  }
  async function opened(days = 6, amount = 100_000) {
    const d = await deploy();
    await d.coin.connect(d.creator).approve(d.mine.target, E(1_000_000));
    await d.mine.connect(d.creator).openMine(d.coin.target, E(amount), days, 0, "Builder Coin mine", "Dig $COIN with us", "https://x.com/coin");
    return d;
  }
  const near = (x, y, tol = 10n ** 12n) => (x > y ? x - y : y - x) <= tol;

  it("prices the fee at 1 USDC of $ARCIRCLE and burns it on open", async function () {
    const { mine, arc, creator } = await opened();
    expect(near(await mine.feeArc(), FEE, 10n ** 16n)).to.equal(true);
    expect(near(await arc.balanceOf(DEAD), FEE, 10n ** 16n)).to.equal(true);
    const m = await mine.getMine(0);
    expect(m.creator).to.equal(creator.address);
    expect(m.deposited).to.equal(E(100_000));
    const info = await mine.infoOf(0);
    expect(info.name).to.equal("Builder Coin mine");
    expect(info.link).to.equal("https://x.com/coin");
  });

  it("the fee follows the price, has a floor, is capped at 10 USDC, and can be zero", async function () {
    const { mine, pm, owner } = await deploy();
    await pm.set(SLOT, ethers.toBeHex(isqrt((RATIO * 2n) << 192n), 32)); // $ARCIRCLE halves → twice as many
    expect(near(await mine.feeArc(), FEE * 2n, 10n ** 16n)).to.equal(true);
    await mine.connect(owner).setFee(1e6, E(50_000));
    expect(await mine.feeArc()).to.equal(E(50_000));
    await expect(mine.setFee(11e6, 0)).to.be.revertedWithCustomError(mine, "FeeTooHigh");
    await mine.setFee(0, 0);
    expect(await mine.feeArc()).to.equal(0n);
    await pm.set(SLOT, ethers.ZeroHash); await mine.setFee(1e6, 0);
    await expect(mine.feeArc()).to.be.revertedWithCustomError(mine, "NoPrice");
  });

  it("joins burn the fee; referrers count only if they joined first", async function () {
    const { mine, a, b, c, arc } = await opened();
    const before = await arc.balanceOf(DEAD);
    await mine.connect(a).join(0, b.address);
    expect(near((await arc.balanceOf(DEAD)) - before, FEE, 10n ** 16n)).to.equal(true);
    await expect(mine.connect(a).join(0, ethers.ZeroAddress)).to.be.revertedWithCustomError(mine, "AlreadyJoined");
    await mine.connect(b).join(0, a.address);
    expect(await mine.referrerOf(0, b.address)).to.equal(a.address);
    await mine.connect(c).join(0, c.address);
    expect(await mine.referrerOf(0, c.address)).to.equal(ethers.ZeroAddress);
    expect((await mine.getMine(0)).builders).to.equal(3);
  });

  it("the owner can pause new mines and joins; the creator can pause joins to their mine", async function () {
    const { mine, a, b, creator, coin, owner } = await opened();
    await mine.connect(creator).setMinePaused(0, true);
    await expect(mine.connect(a).join(0, ethers.ZeroAddress)).to.be.revertedWithCustomError(mine, "Paused");
    await expect(mine.connect(a).setMinePaused(0, false)).to.be.revertedWithCustomError(mine, "NotCreator");
    await mine.connect(creator).setMinePaused(0, false);
    await mine.connect(a).join(0, ethers.ZeroAddress);
    await mine.connect(owner).setJoinsPaused(true);
    await expect(mine.connect(b).join(0, ethers.ZeroAddress)).to.be.revertedWithCustomError(mine, "Paused");
    await expect(mine.connect(creator).openMine(coin.target, E(1), 7, 0, "", "", "")).to.be.revertedWithCustomError(mine, "Paused");
    await expect(mine.connect(a).setJoinsPaused(false)).to.be.revertedWithCustomError(mine, "OwnableUnauthorizedAccount");
  });

  it("only the creator edits the info, within the length limits", async function () {
    const { mine, a, creator } = await opened();
    await expect(mine.connect(a).setInfo(0, "x", "", "")).to.be.revertedWithCustomError(mine, "NotCreator");
    await expect(mine.connect(creator).setInfo(0, "x".repeat(33), "", "")).to.be.revertedWithCustomError(mine, "BadInfo");
    await mine.connect(creator).setInfo(0, "New name", "About", "https://t.me/coin");
    expect((await mine.infoOf(0)).about).to.equal("About");
  });

  it("refuses bad mines", async function () {
    const { mine, coin, creator } = await deploy();
    await coin.connect(creator).approve(mine.target, E(10));
    await expect(mine.connect(creator).openMine(coin.target, 0, 7, 0, "", "", "")).to.be.revertedWithCustomError(mine, "ZeroAmount");
    await expect(mine.connect(creator).openMine(coin.target, E(1), 2, 0, "", "", "")).to.be.revertedWithCustomError(mine, "BadDuration");
    await expect(mine.connect(creator).openMine(coin.target, E(1), 61, 0, "", "", "")).to.be.revertedWithCustomError(mine, "BadDuration");
    await expect(mine.connect(creator).openMine(coin.target, E(1), 7, 8 * 86400, "", "", "")).to.be.revertedWithCustomError(mine, "BadDelay");
  });

  it("measures fee-on-transfer deposits", async function () {
    const { mine, creator } = await deploy();
    const Tok = await ethers.getContractFactory("MockTaxToken");
    const taxed = await Tok.deploy("Tax", "TAX", 100);
    await taxed.mint(creator.address, E(1000));
    await taxed.connect(creator).approve(mine.target, E(1000));
    await mine.connect(creator).openMine(taxed.target, E(1000), 7, 0, "", "", "");
    expect((await mine.getMine(0)).deposited).to.equal(E(990));
  });

  it("releases 32/16/8/4/2/1 parts of 63 per layer", async function () {
    const { mine } = await opened(6, 63_000);
    const m = await mine.getMine(0);
    const at = (days) => mine.emittedAt(0, m.start + BigInt(Math.round(days * 86400)));
    // F is kept to 1e18, so a layer boundary may be off by dust
    expect(await at(0)).to.equal(0n);
    for (const [d, want] of [[1, 32_000], [0.5, 16_000], [2, 48_000], [5, 62_000]]) expect(near(await at(d), E(want), 10n ** 6n)).to.equal(true);
    expect(await at(6)).to.equal(E(63_000));
  });

  it("a top-up is released over the rest of the curve — none of it counts as already mined", async function () {
    const { mine, coin, creator, a } = await opened(6, 63_000);
    const m = await mine.getMine(0);
    await time.increaseTo(m.start + DAY + DAY / 2n); // halfway through layer 2
    const before = await mine.emittedAt(0, m.start + DAY + DAY / 2n + 1n);
    await coin.mint(a.address, E(50_000)); await coin.connect(a).approve(mine.target, E(50_000));
    await expect(mine.connect(a).topUp(0, E(50_000))).to.emit(mine, "ToppedUp");
    const t0 = BigInt(await time.latest());
    // right after the top-up, emitted is (almost) unchanged
    expect(near(await mine.emittedAt(0, t0), await mine.emittedAt(0, t0), 0n)).to.equal(true);
    const segs = await mine.segmentsOf(0);
    expect(segs.length).to.equal(2);
    expect(segs[1].f0).to.equal(F(m.start, m.end, t0));
    expect((await mine.emittedAt(0, t0)) - before < E(20)).to.equal(true);
    // and by the end all of it is out: deposit + top-up
    expect(await mine.emittedAt(0, m.end)).to.equal(E(113_000));
    // mid-way, the top-up follows the remaining curve: (F(t) − F0) / (1 − F0)
    const t = m.start + 4n * DAY;
    const want = E(63_000) * F(m.start, m.end, t) / ONE + E(50_000) * (F(m.start, m.end, t) - segs[1].f0) / (ONE - segs[1].f0);
    expect(await mine.emittedAt(0, t)).to.equal(want);
    await time.increaseTo(m.end - 3000n);
    await expect(mine.connect(creator).topUp(0, E(1))).to.be.revertedWithCustomError(mine, "Ended");
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

  it("pays builders the difference between roots, and claimMany covers several mines", async function () {
    const { mine, op, a, b, coin, creator } = await opened(6);
    await mine.connect(creator).openMine(coin.target, E(100_000), 6, 0, "Second", "", "");
    const m = await mine.getMine(0);
    await time.increaseTo(m.start + DAY);
    const t0 = tree(0, [[a.address, E(300)], [b.address, E(200)]]), t1 = tree(1, [[a.address, E(70)]]);
    await mine.connect(op).postRoot(0, t0.root, E(500));
    await mine.connect(op).postRoot(1, t1.root, E(70));
    await mine.connect(b).claimMany([0, 1], a.address, [E(300), E(70)], [t0.proof(0), t1.proof(0)]);
    expect(await coin.balanceOf(a.address)).to.equal(E(370));
    await expect(mine.claim(0, a.address, E(300), t0.proof(0))).to.be.revertedWithCustomError(mine, "NothingOwed");
    await expect(mine.claimMany([0], a.address, [], [])).to.be.revertedWithCustomError(mine, "LengthMismatch");
    const t2 = tree(0, [[a.address, E(450)], [b.address, E(200)]]);
    await mine.connect(op).postRoot(0, t2.root, E(650));
    await mine.claim(0, a.address, E(450), t2.proof(0));
    expect(await coin.balanceOf(a.address)).to.equal(E(520));
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
    await mine.claim(0, a.address, E(600), t.proof(0));
    await time.increaseTo(m.end + 33n * DAY + 1n);
    await mine.burnUnclaimed(0);
    expect(await coin.balanceOf(DEAD)).to.equal(E(99_400));
    expect(await coin.balanceOf(mine.target)).to.equal(0n);
    await expect(mine.claim(0, b.address, E(400), t.proof(1))).to.be.revertedWithCustomError(mine, "Closed");
  });

  it("the owner can't touch a mine's tokens", async function () {
    const { mine } = await opened();
    const fns = mine.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();
    expect(fns).to.deep.equal(["burnUnclaimed", "burnUnmined", "buyItem", "claim", "claimMany", "join", "openMine", "postRoot", "renounceOwnership", "setFee", "setInfo", "setItem", "setJoinsPaused", "setMinePaused", "setOperator", "topUp", "transferOwnership"]);
  });

  it("sells pickaxes (up to tier 7) for the tier difference and burns the $ARCIRCLE", async function () {
    const { mine, a, arc } = await opened();
    const dead0 = await arc.balanceOf(DEAD);
    await mine.connect(a).buyItem(1, 0); // iron, 100K
    expect(await mine.pickaxeOf(a.address)).to.equal(2);
    await expect(mine.connect(a).buyItem(0, 0)).to.be.revertedWithCustomError(mine, "NotAnUpgrade");
    await expect(mine.connect(a).buyItem(5, 0)).to.emit(mine, "ItemBought").withArgs(0, a.address, 5, E(3_400_000), 6, 0, 0);
    expect((await arc.balanceOf(DEAD)) - dead0).to.equal(E(3_500_000));
    await mine.setItem(8, E(9_000_000), 7, 0, 0, true);
    await expect(mine.setItem(9, E(1), 8, 0, 0, true)).to.be.revertedWithCustomError(mine, "BadItem");
  });

  it("boosts need a joined builder, stack up to seven days, and show in rigOf", async function () {
    const { mine, a } = await opened();
    await expect(mine.connect(a).buyItem(6, 0)).to.be.revertedWithCustomError(mine, "NotJoined");
    await mine.connect(a).join(0, ethers.ZeroAddress);
    await mine.connect(a).buyItem(6, 0);
    await mine.connect(a).buyItem(7, 0);
    const now = BigInt(await time.latest());
    const rig = await mine.rigOf(0, a.address);
    expect(rig.isIn).to.equal(true);
    expect(rig.boosts[0]).to.be.closeTo(now + DAY, 3n);
    expect(rig.boosts[1]).to.be.closeTo(now + 3600n, 3n);
    for (let i = 0; i < 6; i++) await mine.connect(a).buyItem(6, 0);
    await expect(mine.connect(a).buyItem(6, 0)).to.be.revertedWithCustomError(mine, "StackTooLong");
  });

  it("top-ups under 1% of the first deposit are refused, so dust can't fill the 16 slots", async function () {
    const { mine, coin, a } = await opened(6, 100_000);
    await coin.mint(a.address, E(10_000)); await coin.connect(a).approve(mine.target, E(10_000));
    await expect(mine.connect(a).topUp(0, E(999))).to.be.revertedWithCustomError(mine, "TopUpTooSmall");
    await expect(mine.connect(a).topUp(0, E(1_000))).to.emit(mine, "ToppedUp");
  });

  it("the operator can never be the zero address", async function () {
    const { mine, arc, pm } = await deploy();
    await expect(mine.setOperator(ethers.ZeroAddress)).to.be.revertedWithCustomError(mine, "ZeroOperator");
    const M = await ethers.getContractFactory("BuilderMine");
    await expect(M.deploy(arc.target, pm.target, SLOT, true, ethers.ZeroAddress)).to.be.revertedWithCustomError(mine, "ZeroOperator");
  });

  it("a boost bought before the mine opens starts when it opens", async function () {
    const d = await deploy();
    await d.coin.connect(d.creator).approve(d.mine.target, E(100_000));
    await d.mine.connect(d.creator).openMine(d.coin.target, E(100_000), 6, 2n * DAY, "Later", "", "");
    const m = await d.mine.getMine(0);
    await d.mine.connect(d.a).join(0, ethers.ZeroAddress);
    await d.mine.connect(d.a).buyItem(7, 0); // dynamite, 1h
    expect((await d.mine.rigOf(0, d.a.address)).boosts[1]).to.equal(m.start + 3600n);
    for (let i = 0; i < 7; i++) await d.mine.connect(d.a).buyItem(6, 0); // lanterns stack from the start, up to seven days
    await expect(d.mine.connect(d.a).buyItem(6, 0)).to.be.revertedWithCustomError(d.mine, "StackTooLong");
  });

  it("no joining after the end", async function () {
    const { mine, a } = await opened(3);
    const m = await mine.getMine(0);
    await time.increaseTo(m.end);
    await expect(mine.connect(a).join(0, ethers.ZeroAddress)).to.be.revertedWithCustomError(mine, "Ended");
  });
});
