// Quantum Launch against the real ArcPad stack (PoolManager, HomepadHybridHook at a mined address, HomepadFactoryArc,
// the swap router, a USDC stand-in at 0x3600…): commits, one collapse = launch + one buy, everyone's same price,
// claims, the creator's fees, cancel, refunds after the grace period, the edges.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const USDC = "0x3600000000000000000000000000000000000000";
const U = (n) => ethers.parseUnits(String(n), 6), E = (n) => ethers.parseEther(String(n));
const FLAGS = BigInt((1 << 6) | (1 << 2)), MASK = (1n << 14n) - 1n;
const META = { imageUrl: "", description: "A coin with no snipers.", twitter: "", telegram: "", discord: "", website: "" };
const DAY = 86400;
const inc = async (sec) => { await network.provider.send("evm_increaseTime", [sec]); await network.provider.send("evm_mine"); };

describe("Quantum Launch", function () {
  let s, owner, treasury, platform, creator, alice, bob, carol, keeper, sniper, usdc, factory, router, pad, F, R;
  async function deployStack() {
    s = await ethers.getSigners();
    [owner, treasury, platform, creator, alice, bob, carol, keeper, sniper] = s;
    const mock = await (await ethers.getContractFactory("ArcUsdcMock")).deploy();
    await network.provider.send("hardhat_setCode", [USDC, await ethers.provider.getCode(await mock.getAddress())]);
    usdc = await ethers.getContractAt("ArcUsdcMock", USDC);
    const pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    const c2 = await (await ethers.getContractFactory("Create2Deployer")).deploy();
    const htx = await (await ethers.getContractFactory("HomepadHybridHook")).getDeployTransaction(await pm.getAddress(), owner.address);
    let salt, hookAddr;
    for (let i = 0n; ; i++) { salt = ethers.zeroPadValue(ethers.toBeHex(i), 32); hookAddr = ethers.getCreate2Address(await c2.getAddress(), salt, ethers.keccak256(htx.data)); if ((BigInt(hookAddr) & MASK) === FLAGS) break; }
    await (await c2.deploy(salt, htx.data)).wait();
    const hook = await ethers.getContractAt("HomepadHybridHook", hookAddr);
    factory = await (await ethers.getContractFactory("HomepadFactoryArc")).deploy(treasury.address, platform.address, await pm.getAddress(), hookAddr, 60, 100, 7000, 10000);
    await hook.setFactory(await factory.getAddress());
    router = await (await ethers.getContractFactory("HomepadArcSwapRouter")).deploy(await pm.getAddress(), await factory.getAddress());
    F = await factory.getAddress(); R = await router.getAddress();
    pad = await (await ethers.getContractFactory("QuantumPad")).deploy(F, USDC);
    for (const w of s.slice(0, 12)) { await usdc.mint(w.address, U(100000)); await usdc.connect(w).approve(R, ethers.MaxUint256); }
  }
  async function open(opts = {}) {
    const tx = await pad.connect(creator).open(opts.name || "Superposition", opts.sym || "QBIT", U(4000), opts.fee ?? 50, META, opts.window ?? 60, opts.cap ?? 0, { value: opts.value ?? E(1) });
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return pad.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "Opened");
    const b = await ethers.getContractAt("QuantumBatch", ev.args.batch);
    return b;
  }
  async function commit(b, w, n) { await usdc.connect(w).approve(await b.getAddress(), ethers.MaxUint256); return (await b.connect(w).commit(U(n))).wait(); }

  beforeEach(deployStack);

  it("opens: the fee is held, the coin doesn't exist yet", async function () {
    const before = await factory.launchCount();
    const b = await open();
    expect(await ethers.provider.getBalance(await b.getAddress())).to.equal(E(1));
    expect(await factory.launchCount()).to.equal(before);
    expect(await b.creator()).to.equal(creator.address);
    expect(await pad.count()).to.equal(1n);
    expect((await pad.latest(5))[0]).to.equal(await b.getAddress());
    expect((await pad.ofCreator(creator.address)).length).to.equal(1);
    // validation
    await expect(pad.connect(creator).open("X", "X", U(4000), 0, META, 10, 0, { value: E(1) })).to.be.revertedWith("window: 30 s to 1 h");
    await expect(pad.connect(creator).open("X", "X", U(4000), 0, META, 7200, 0, { value: E(1) })).to.be.revertedWith("window: 30 s to 1 h");
    await expect(pad.connect(creator).open("X", "X", U(4000), 300, META, 60, 0, { value: E(1) })).to.be.revertedWith("extra fee too high");
    await expect(pad.connect(creator).open("X", "X", U(4000), 0, META, 60, 0, { value: E(0.5) })).to.be.revertedWith("send the 1 USDC launch fee");
    await expect(pad.connect(creator).open("X", "X", U(4000), 0, META, 60, 1000, { value: E(1) })).to.be.revertedWith("cap below the minimum commit");
    await expect(pad.connect(creator).open("", "X", U(4000), 0, META, 60, 0, { value: E(1) })).to.be.revertedWith("name");
    // overpaying refunds the rest
    const bal0 = await ethers.provider.getBalance(creator.address);
    const tx = await pad.connect(creator).open("Y", "Y", U(4000), 0, META, 60, 0, { value: E(3) });
    const rc = await tx.wait();
    const spent = bal0 - (await ethers.provider.getBalance(creator.address));
    expect(spent).to.equal(E(1) + rc.gasUsed * rc.gasPrice);
  });

  it("collapses into one buy: everyone gets the same price, and nobody could buy ahead", async function () {
    const b = await open();
    await commit(b, alice, 100); await commit(b, bob, 300); await commit(b, carol, 600);
    expect(await b.totalCommitted()).to.equal(U(1000));
    expect(await b.committers()).to.equal(3n);
    await expect(b.connect(keeper).collapse()).to.be.revertedWith("still in superposition");
    // there is no pool to snipe: the coin isn't launched
    expect(await factory.launchCount()).to.equal(0n);
    await inc(61);
    await expect(b.connect(alice).commit(U(5))).to.be.revertedWith("window closed");
    const tx = await b.connect(keeper).collapse();
    await tx.wait();
    const token = await b.token();
    expect(token).to.not.equal(ethers.ZeroAddress);
    expect(await factory.launchCount()).to.equal(1n);
    const rec = await factory.launches(0);
    expect(rec.creator).to.equal(await b.getAddress()); // creator of record: the batch
    expect(await pad.batchOfToken(token)).to.equal(await b.getAddress());
    const bought = await b.tokensBought();
    expect(bought).to.be.gt(0n);
    expect(await usdc.balanceOf(await b.getAddress())).to.equal(await b.usdcLeft());
    // claims: exactly proportional
    const tk = await ethers.getContractAt("LaunchToken", token);
    await b.connect(alice).claim();
    await b.connect(keeper).claimFor([bob.address, carol.address, keeper.address]);
    const [a, bb, c] = [await tk.balanceOf(alice.address), await tk.balanceOf(bob.address), await tk.balanceOf(carol.address)];
    expect(a).to.equal((bought * U(100)) / U(1000));
    expect(bb).to.equal((bought * U(300)) / U(1000));
    expect(c).to.equal((bought * U(600)) / U(1000));
    // same price: tokens per USDC equal (to rounding)
    expect((a * 6n) / c).to.be.within(0n, 1n); // a/c = 1/6
    expect(bb * 2n - c).to.be.lte(2n);
    await expect(b.connect(alice).claim()).to.be.revertedWith("nothing to claim");
    // a buyer after the collapse pays more than the batch's average price
    const avg = (U(1000) * E(1)) / bought; // USDC (6d) per 1e18 token
    const before = await tk.balanceOf(sniper.address);
    await router.connect(sniper).buy(token, U(100), 0);
    const got = (await tk.balanceOf(sniper.address)) - before;
    expect((U(100) * E(1)) / got).to.be.gt(avg);
  });

  it("the creator's trading fees go to the creator; what committers are owed stays", async function () {
    const b = await open({ fee: 100 });
    await commit(b, alice, 500); await commit(b, bob, 500);
    await inc(61); await b.collapse();
    const token = await b.token(), tk = await ethers.getContractAt("LaunchToken", token), B = await b.getAddress();
    const owed = await b.tokensBought();
    // trading after the launch: buys pay the fee in the coin, sells in USDC — the creator's share lands on the batch
    await router.connect(sniper).buy(token, U(2000), 0);
    const sb = await tk.balanceOf(sniper.address);
    await tk.connect(sniper).approve(R, sb);
    await router.connect(sniper).sell(token, sb / 2n, 0);
    const extraTk = (await tk.balanceOf(B)) - owed;
    const extraUs = await usdc.balanceOf(B) - (await b.usdcLeft());
    expect(extraTk).to.be.gt(0n); expect(extraUs).to.be.gt(0n);
    const c0 = await tk.balanceOf(creator.address), u0 = await usdc.balanceOf(creator.address);
    await b.connect(keeper).sweep(token); await b.connect(keeper).sweep(USDC);
    expect((await tk.balanceOf(creator.address)) - c0).to.equal(extraTk);
    expect((await usdc.balanceOf(creator.address)) - u0).to.equal(extraUs);
    expect(await tk.balanceOf(B)).to.equal(owed); // committers' tokens untouched
    await b.connect(alice).claim(); await b.connect(bob).claim();
    expect((await tk.balanceOf(alice.address)) + (await tk.balanceOf(bob.address))).to.be.lte(owed);
    // once everyone has claimed, rounding dust can go too
    await b.sweep(token);
    expect(await tk.balanceOf(B)).to.equal(0n);
  });

  it("caps, minimums and taking a commit back", async function () {
    const b = await open({ cap: U(250) });
    await expect(commit(b, alice, 0.05)).to.be.revertedWith("min 0.10 USDC");
    await commit(b, alice, 200);
    await expect(commit(b, alice, 100)).to.be.revertedWith("over the per-wallet cap");
    await commit(b, bob, 100);
    await expect(b.connect(alice).uncommit(U(199.95))).to.be.revertedWith("leave at least 0.10 USDC or take it all");
    const a0 = await usdc.balanceOf(alice.address);
    await b.connect(alice).uncommit(U(200));
    expect((await usdc.balanceOf(alice.address)) - a0).to.equal(U(200));
    expect(await b.committers()).to.equal(1n);
    expect(await b.totalCommitted()).to.equal(U(100));
    const info = await b.info(bob.address);
    expect(info.mine).to.equal(U(100)); expect(info.state_).to.equal(0n);
  });

  it("the creator can call it off before the end: everyone and the fee go back", async function () {
    const b = await open();
    await commit(b, alice, 50);
    await expect(b.connect(alice).cancel()).to.be.revertedWith("only the creator");
    const c0 = await ethers.provider.getBalance(creator.address);
    const rc = await (await b.connect(creator).cancel()).wait();
    expect((await ethers.provider.getBalance(creator.address)) - c0 + rc.gasUsed * rc.gasPrice).to.equal(E(1));
    await expect(commit(b, bob, 5)).to.be.revertedWith("window closed");
    const a0 = await usdc.balanceOf(alice.address);
    await b.connect(keeper).refundFor([alice.address, bob.address]);
    expect((await usdc.balanceOf(alice.address)) - a0).to.equal(U(50));
    await expect(b.refundFee()).to.be.revertedWith("already refunded");
    await inc(61);
    await expect(b.collapse()).to.be.revertedWith("not open");
  });

  it("if nobody collapses within a day, refunds open and collapse is closed", async function () {
    const b = await open();
    await commit(b, alice, 80); await commit(b, bob, 20);
    await inc(60 + DAY + 5);
    expect((await b.info(alice.address)).state_).to.equal(2n);
    await expect(b.collapse()).to.be.revertedWith("too late: refunds are open");
    const a0 = await usdc.balanceOf(alice.address);
    await b.connect(alice).refund();
    expect((await usdc.balanceOf(alice.address)) - a0).to.equal(U(80));
    await expect(b.connect(alice).refund()).to.be.revertedWith("nothing to refund");
    await b.connect(keeper).refundFee();
    await b.refundFor([bob.address]);
    expect(await usdc.balanceOf(await b.getAddress())).to.equal(0n);
  });

  it("no commits: collapse still launches the coin, with no buy", async function () {
    const b = await open();
    await inc(61);
    await b.collapse();
    expect(await b.token()).to.not.equal(ethers.ZeroAddress);
    expect(await b.tokensBought()).to.equal(0n);
    expect(await factory.launchCount()).to.equal(1n);
    await expect(b.collapse()).to.be.revertedWith("not open");
    await expect(b.refund()).to.be.revertedWith("no refunds");
  });

  it("sweep and claim are closed before the collapse", async function () {
    const b = await open();
    await commit(b, alice, 10);
    await expect(b.sweep(USDC)).to.be.revertedWith("not collapsed");
    await expect(b.connect(alice).claim()).to.be.revertedWith("not collapsed");
    await expect(b.refund()).to.be.revertedWith("no refunds");
  });
});
