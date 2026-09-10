const { expect } = require("chai");
const { ethers } = require("hardhat");

const AFTER_SWAP_FLAG = 1 << 6;
const AFTER_SWAP_RETURNS_DELTA_FLAG = 1 << 2;
const REQUIRED_FLAGS = BigInt(AFTER_SWAP_FLAG | AFTER_SWAP_RETURNS_DELTA_FLAG);
const FLAG_MASK = (1n << 14n) - 1n;

function mineSalt(deployerAddress, initCodeHash, maxTries = 200_000) {
  for (let salt = 0n; salt < BigInt(maxTries); salt++) {
    const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
    const addr = ethers.getCreate2Address(deployerAddress, saltHex, initCodeHash);
    if ((BigInt(addr) & FLAG_MASK) === REQUIRED_FLAGS) {
      return { salt: saltHex, address: addr };
    }
  }
  throw new Error("couldn't find a valid salt");
}

describe("HOMEPAD — Instant Liquidity Swap Router", function () {
  async function deployAll() {
    const [deployer, homeTreasury, platformWallet, alice, bob] = await ethers.getSigners();
    const tickSpacing = 60;

    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(deployer.address);

    const Create2Deployer = await ethers.getContractFactory("Create2Deployer");
    const create2Deployer = await Create2Deployer.deploy();

    const HomepadHookFactory = await ethers.getContractFactory("HomepadHook");
    const deployTx = await HomepadHookFactory.getDeployTransaction(await poolManager.getAddress(), deployer.address);
    const hookInitCode = deployTx.data;
    const initCodeHash = ethers.keccak256(hookInitCode);
    const { salt, address: hookAddr } = mineSalt(await create2Deployer.getAddress(), initCodeHash);
    await (await create2Deployer.deploy(salt, hookInitCode)).wait();
    const hook = await ethers.getContractAt("HomepadHook", hookAddr);

    const Factory = await ethers.getContractFactory("HomepadFactoryInstant");
    const factory = await Factory.deploy(
      homeTreasury.address, platformWallet.address, await poolManager.getAddress(), hookAddr,
      tickSpacing, 100, 7000, 10000
    );
    await (await hook.setFactory(await factory.getAddress())).wait();

    const Router = await ethers.getContractFactory("HomepadSwapRouter");
    const router = await Router.deploy(await poolManager.getAddress(), hookAddr, tickSpacing);

    return { deployer, homeTreasury, platformWallet, alice, bob, factory, hook, poolManager, router };
  }

  const meta = { imageUrl: "", description: "", twitter: "", telegram: "", discord: "", website: "" };

  async function launchToken(factory, creator, ethValue) {
    const tx = await factory.connect(creator).launch("Router Coin", "RTC", 0, meta, { value: ethValue });
    const receipt = await tx.wait();
    const event = receipt.logs.map((l) => {
      try { return factory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "Launched");
    return event.args.token;
  }

  it("buys tokens with ETH and refunds nothing extra when amounts match exactly", async function () {
    const { factory, router, alice, bob } = await deployAll();
    const tokenAddr = await launchToken(factory, alice, ethers.parseEther("2"));
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);

    const bobEthBefore = await ethers.provider.getBalance(bob.address);
    const tx = await router.connect(bob).buy(tokenAddr, 0, { value: ethers.parseEther("0.1") });
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const bobEthAfter = await ethers.provider.getBalance(bob.address);

    expect(await token.balanceOf(bob.address)).to.be.gt(0n);
    // Spent exactly 0.1 ETH + gas — nothing stuck in the router as a bogus "refund" loss.
    expect(bobEthBefore - bobEthAfter - gasCost).to.equal(ethers.parseEther("0.1"));
    expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0n);
  });

  it("sells tokens back for ETH after approving the router", async function () {
    const { factory, router, alice, bob } = await deployAll();
    const tokenAddr = await launchToken(factory, alice, ethers.parseEther("2"));
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);

    await (await router.connect(bob).buy(tokenAddr, 0, { value: ethers.parseEther("0.5") })).wait();
    const tokenBal = await token.balanceOf(bob.address);
    expect(tokenBal).to.be.gt(0n);

    await (await token.connect(bob).approve(await router.getAddress(), tokenBal)).wait();
    const ethBefore = await ethers.provider.getBalance(bob.address);
    const tx = await router.connect(bob).sell(tokenAddr, tokenBal, 0);
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const ethAfter = await ethers.provider.getBalance(bob.address);

    expect(await token.balanceOf(bob.address)).to.equal(0n);
    expect(ethAfter + gasCost).to.be.gt(ethBefore); // got real ETH back, net of gas
  });

  it("reverts a buy if the slippage floor isn't met", async function () {
    const { factory, router, alice, bob } = await deployAll();
    const tokenAddr = await launchToken(factory, alice, ethers.parseEther("2"));

    // Ask for an absurdly high minimum — no real swap could ever satisfy this.
    const unreasonableMin = ethers.parseEther("999999999");
    await expect(
      router.connect(bob).buy(tokenAddr, unreasonableMin, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("slippage");
  });

  it("still routes the hook fee to creator + $HOME on a router-mediated swap", async function () {
    const { factory, router, homeTreasury, alice, bob } = await deployAll();
    const tokenAddr = await launchToken(factory, alice, ethers.parseEther("2"));
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);

    const homeBefore = await token.balanceOf(homeTreasury.address); // already holds the 8% allocation
    await (await router.connect(bob).buy(tokenAddr, 0, { value: ethers.parseEther("1") })).wait();
    const homeAfter = await token.balanceOf(homeTreasury.address);
    const creatorBal = await token.balanceOf(alice.address);

    expect(homeAfter).to.be.gt(homeBefore);
    expect(creatorBal).to.be.gt(0n);
  });
});
