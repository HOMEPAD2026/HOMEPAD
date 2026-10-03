// ARCIRCLE NFT Vault + fee router: Pons fees split 50 / 50, the vault spends ETH only on NFTs that arrive, raffles
// drawn from a committed secret and a later block hash, settled to the wallet whose ticket range holds the draw.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const E = (n) => ethers.parseEther(String(n));
const DAY = 86400;
const jump = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine", []); };
const mine = async (n) => { for (let i = 0; i < n; i++) await network.provider.send("evm_mine", []); };

// sorted-pair Merkle tree over OpenZeppelin "standard" leaves: keccak(keccak(abi.encode(address,uint256,uint256)))
const coder = ethers.AbiCoder.defaultAbiCoder();
const leafOf = (a, s, e) => ethers.keccak256(ethers.keccak256(coder.encode(["address", "uint256", "uint256"], [a, s, e])));
const pair = (x, y) => (BigInt(x) < BigInt(y) ? ethers.keccak256(ethers.concat([x, y])) : ethers.keccak256(ethers.concat([y, x])));
function tree(rows) { // rows: [[addr, weight]] → { root, total, ranges, proof(i) }
  let at = 0n;
  const ranges = rows.map(([a, w]) => { const r = { a, s: at, e: at + BigInt(w) }; at += BigInt(w); return r; });
  const layers = [ranges.map((r) => leafOf(r.a, r.s, r.e))];
  while (layers[layers.length - 1].length > 1) {
    const l = layers[layers.length - 1], n = [];
    for (let i = 0; i < l.length; i += 2) n.push(i + 1 < l.length ? pair(l[i], l[i + 1]) : l[i]);
    layers.push(n);
  }
  const proof = (i) => { const p = []; for (let k = 0; k < layers.length - 1; k++) { const l = layers[k], j = i ^ 1; if (j < l.length) p.push(l[j]); i >>= 1; } return p; };
  return { root: layers[layers.length - 1][0], total: at, ranges, proof };
}
const winnerOf = (t, ticket) => t.ranges.findIndex((r) => ticket >= r.s && ticket < r.e);

describe("ArcircleNft", () => {
  let curator, keeper, treasury, seller, a, b, c, other;
  let escrow, pons, weth, vault, router, sea, nft, arb;
  beforeEach(async () => {
    [curator, keeper, treasury, seller, a, b, c, other] = await ethers.getSigners();
    escrow = await (await ethers.getContractFactory("MockPonsEscrow")).deploy();
    pons = await (await ethers.getContractFactory("MockPonsFactoryV2")).deploy();
    weth = await (await ethers.getContractFactory("MockWETH")).deploy();
    sea = await (await ethers.getContractFactory("MockSeaport")).deploy();
    arb = await (await ethers.getContractFactory("MockArbSys")).deploy();
    nft = await (await ethers.getContractFactory("MockNFT721")).deploy();
    vault = await (await ethers.getContractFactory("ArcircleNftVault")).deploy(await sea.getAddress(), await arb.getAddress(), curator.address, keeper.address);
    router = await (await ethers.getContractFactory("ArcircleNftRouter")).deploy(await escrow.getAddress(), await pons.getAddress(), await weth.getAddress(), await vault.getAddress(), treasury.address, curator.address);
    for (let i = 1; i <= 5; i++) await nft.mint(seller.address, i);
    await nft.connect(seller).setApprovalForAll(await sea.getAddress(), true);
  });
  const fund = async (eth) => { const R = await router.getAddress(); await escrow.credit(R, { value: E(eth) }); return router.connect(other).claim(); };
  const list = async (cap = 1) => { await vault.connect(curator).proposeCollection(await nft.getAddress(), E(cap)); await jump(DAY + 1); };
  const buyData = async (id, price) => sea.interface.encodeFunctionData("fulfill", [await nft.getAddress(), id, seller.address, E(price)]);
  const buy = async (id, price, as = keeper) => vault.connect(as).buy(await nft.getAddress(), id, E(price), await buyData(id, price));

  it("router: Pons ETH and WETH fees split 50 / 50 by anyone; other tokens go to the treasury; nothing else moves them", async () => {
    const R = await router.getAddress(), V = await vault.getAddress();
    await escrow.credit(R, { value: E(1) });
    await weth.deposit({ value: E(0.5) }); await weth.approve(await escrow.getAddress(), E(0.5)); await escrow.creditToken(R, await weth.getAddress(), E(0.5));
    expect(await router.pending()).to.equal(E(1.5));
    const t0 = await ethers.provider.getBalance(treasury.address);
    await router.connect(other).claim();
    expect(await ethers.provider.getBalance(V)).to.equal(E(0.75));
    expect((await ethers.provider.getBalance(treasury.address)) - t0).to.equal(E(0.75));
    expect(await vault.totalIn()).to.equal(E(0.75));
    expect(await router.toVaultTotal()).to.equal(E(0.75));
    await expect(router.claimToken(await weth.getAddress())).to.be.revertedWithCustomError(router, "UseClaim");
    const tok = await (await ethers.getContractFactory("TestToken")).deploy("Q", "Q", 18);
    await tok.mint(curator.address, E(10)); await tok.approve(await escrow.getAddress(), E(10)); await escrow.creditToken(R, await tok.getAddress(), E(10));
    await router.connect(other).claimToken(await tok.getAddress());
    expect(await tok.balanceOf(treasury.address)).to.equal(E(10));
    // only the manager toggles the Pons buyback; nobody can redirect fees
    const coin = other.address;
    await pons.setRecipient(coin, R);
    await expect(router.connect(other).setBuybackEnabled(coin, true)).to.be.revertedWithCustomError(router, "NotManager");
    await router.connect(curator).setBuybackEnabled(coin, true);
    expect(await pons.buyback(coin)).to.equal(true);
    expect(router.interface.fragments.filter((f) => f.type === "function").map((f) => f.name).sort())
      .to.deep.equal(["BPS", "VAULT_BPS", "claim", "claimToken", "escrow", "manager", "pending", "ponsFactory", "setBuybackEnabled", "setManager", "toTreasuryTotal", "toVaultTotal", "treasury", "vault", "weth"]);
  });

  it("vault: buys only listed collections after the delay, under the cap, only when the NFT arrives; no withdraw", async () => {
    await fund(4); // 2 ETH in the vault
    await vault.connect(curator).proposeCollection(await nft.getAddress(), E(1));
    await expect(buy(1, 0.5)).to.be.revertedWithCustomError(vault, "NotAllowed"); // still in its 24h delay
    await jump(DAY + 1);
    await expect(buy(1, 0.5, other)).to.be.revertedWithCustomError(vault, "NotOps");
    await expect(buy(1, 1.5)).to.be.revertedWithCustomError(vault, "TooExpensive");
    const s0 = await ethers.provider.getBalance(seller.address);
    // over-sending the call's value: Seaport's change comes back and isn't counted as income
    await vault.connect(keeper).buy(await nft.getAddress(), 1, E(0.6), await buyData(1, 0.5));
    expect(await nft.ownerOf(1)).to.equal(await vault.getAddress());
    expect((await ethers.provider.getBalance(seller.address)) - s0).to.equal(E(0.5));
    expect(await vault.totalSpent()).to.equal(E(0.5));
    expect(await vault.totalIn()).to.equal(E(2));
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(E(1.5));
    const p = await vault.prizes(0);
    expect(p.collection).to.equal(await nft.getAddress()); expect(p.tokenId).to.equal(1n); expect(p.paid).to.equal(E(0.5)); expect(p.status).to.equal(1n);
    // a "marketplace" that takes the ETH and sends nothing, or sends the NFT elsewhere: reverted, ETH stays
    await expect(vault.connect(keeper).buy(await nft.getAddress(), 2, E(0.5), sea.interface.encodeFunctionData("scam"))).to.be.revertedWithCustomError(vault, "NotReceived");
    await expect(vault.connect(keeper).buy(await nft.getAddress(), 2, E(0.5), sea.interface.encodeFunctionData("misdirect", [await nft.getAddress(), 2, seller.address, other.address]))).to.be.reverted;
    await expect(buy(3, 1.6)).to.be.revertedWithCustomError(vault, "TooExpensive");
    await vault.connect(curator).lowerCap(await nft.getAddress(), E(0.2));
    await expect(buy(3, 0.5)).to.be.revertedWithCustomError(vault, "TooExpensive");
    await vault.connect(curator).proposeCollection(await nft.getAddress(), E(2)); // raising takes the delay again
    await expect(buy(3, 0.5)).to.be.revertedWithCustomError(vault, "NotAllowed");
    await jump(DAY + 1);
    await expect(buy(3, 1.6)).to.be.revertedWithCustomError(vault, "NotEnough");
    await vault.connect(curator).removeCollection(await nft.getAddress());
    await expect(buy(3, 0.5)).to.be.revertedWithCustomError(vault, "NotAllowed");
    const names = vault.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    expect(names.filter((n) => /withdraw|sweep|rescue|transfer/i.test(n))).to.deep.equal([]);
  });

  it("donations of listed NFTs become prizes; others are only accepted", async () => {
    await list();
    await nft.connect(seller)["safeTransferFrom(address,address,uint256)"](seller.address, await vault.getAddress(), 4);
    expect(await vault.prizeCount()).to.equal(1n);
    expect((await vault.prizes(0)).donated).to.equal(true);
    await nft.connect(seller).transferFrom(seller.address, await vault.getAddress(), 5); // not safe: register it
    expect(await vault.prizeCount()).to.equal(1n);
    await expect(vault.connect(other).register(await nft.getAddress(), 5)).to.be.revertedWithCustomError(vault, "NotOps");
    await vault.connect(keeper).register(await nft.getAddress(), 5);
    await expect(vault.connect(keeper).register(await nft.getAddress(), 5)).to.be.revertedWithCustomError(vault, "AlreadyHeld");
    await expect(vault.connect(keeper).register(await nft.getAddress(), 3)).to.be.revertedWithCustomError(vault, "NotHeld");
    const other721 = await (await ethers.getContractFactory("MockNFT721")).deploy();
    await other721.mint(seller.address, 1);
    await other721.connect(seller)["safeTransferFrom(address,address,uint256)"](seller.address, await vault.getAddress(), 1);
    expect(await vault.prizeCount()).to.equal(2n);
  });

  it("raffle: challenge window, commit / reveal on the next block, expired commits retried and counted, settle to the ticket's wallet", async () => {
    await fund(2); await list();
    await buy(1, 0.5);
    const t = tree([[a.address, E(1000)], [b.address, E(3000)], [c.address, E(6000)]]);
    await expect(vault.connect(other).open(0, t.root, t.total, 123, "x")).to.be.revertedWithCustomError(vault, "NotOps");
    await vault.connect(keeper).open(0, t.root, t.total, 123, "https://www.arcircle.app/api/desk?nft=list&prize=0");
    const r0 = await vault.raffles(0);
    expect(r0.total).to.equal(t.total); expect(r0.snapshotBlock).to.equal(123n);
    const secret = ethers.hexlify(ethers.randomBytes(32)), h = ethers.keccak256(coder.encode(["bytes32"], [secret]));
    await expect(vault.connect(keeper).commit(0, h)).to.be.revertedWithCustomError(vault, "TooEarly");
    await jump(6 * 3600);
    await vault.connect(keeper).commit(0, h);
    await expect(vault.reveal(0, secret)).to.be.revertedWithCustomError(vault, "RevealWindow"); // the next block is this one
    await expect(vault.connect(keeper).commit(0, h)).to.be.revertedWithCustomError(vault, "CommitLive");
    // let it expire: a new commit is allowed and counted, the raffle can no longer be cancelled
    await mine(205);
    await expect(vault.reveal(0, secret)).to.be.revertedWithCustomError(vault, "RevealWindow");
    await expect(vault.connect(keeper).cancel(0)).to.be.revertedWithCustomError(vault, "BadStatus");
    const secret2 = ethers.hexlify(ethers.randomBytes(32)), h2 = ethers.keccak256(coder.encode(["bytes32"], [secret2]));
    await vault.connect(keeper).commit(0, h2);
    expect((await vault.raffles(0)).attempts).to.equal(2n);
    await mine(1);
    await expect(vault.reveal(0, secret)).to.be.revertedWithCustomError(vault, "BadSecret");
    await vault.connect(other).reveal(0, secret2); // anyone holding the secret
    const ticket = await vault.ticketOf(0);
    const r = await vault.raffles(0);
    const commitBlock = Number(r.commitBlock);
    const bh = (await ethers.provider.getBlock(commitBlock + 1)).hash;
    const seed = ethers.keccak256(coder.encode(["bytes32", "bytes32", "bytes32", "uint256"], [secret2, bh, t.root, 0]));
    expect(r.seed).to.equal(seed);
    expect(ticket).to.equal(BigInt(seed) % t.total);
    const w = winnerOf(t, ticket), loser = (w + 1) % 3;
    const signers = { [a.address]: a, [b.address]: b, [c.address]: c };
    await expect(vault.settle(0, t.ranges[loser].a, t.ranges[loser].s, t.ranges[loser].e, t.proof(loser))).to.be.revertedWithCustomError(vault, "NotTheTicket");
    await expect(vault.settle(0, other.address, t.ranges[w].s, t.ranges[w].e, t.proof(w))).to.be.revertedWithCustomError(vault, "BadProof");
    await vault.connect(other).settle(0, t.ranges[w].a, t.ranges[w].s, t.ranges[w].e, t.proof(w));
    expect(await nft.ownerOf(1)).to.equal(t.ranges[w].a);
    expect((await vault.raffles(0)).winner).to.equal(signers[t.ranges[w].a].address);
    expect((await vault.prizes(0)).status).to.equal(4n);
    expect(await vault.prizeOf(await nft.getAddress(), 1)).to.equal(0n);
    await expect(vault.settle(0, t.ranges[w].a, t.ranges[w].s, t.ranges[w].e, t.proof(w))).to.be.revertedWithCustomError(vault, "BadStatus");
  });

  it("a wrong list can be cancelled before any draw; a stuck raffle can be force-drawn after a week", async () => {
    await fund(2); await list();
    await buy(1, 0.5);
    const t = tree([[a.address, 5n], [b.address, 5n]]);
    await vault.connect(keeper).open(0, t.root, t.total, 1, "");
    await vault.connect(curator).cancel(0);
    expect((await vault.prizes(0)).status).to.equal(1n);
    await vault.connect(keeper).open(0, t.root, t.total, 2, "");
    await expect(vault.forceDraw(0)).to.be.revertedWithCustomError(vault, "TooEarly");
    await jump(6 * 3600 + 7 * DAY);
    await vault.connect(other).forceDraw(0);
    const w = winnerOf(t, await vault.ticketOf(0));
    await vault.settle(0, t.ranges[w].a, t.ranges[w].s, t.ranges[w].e, t.proof(w));
    expect(await nft.ownerOf(1)).to.equal(t.ranges[w].a);
  });

  it("draws follow the weights (many raffles over the same list)", async () => {
    // 1 : 3 : 6 over 120 seeds — the expected 12 / 36 / 72 within a loose band
    const t = tree([[a.address, 1n], [b.address, 3n], [c.address, 6n]]);
    const hits = [0, 0, 0];
    for (let i = 0; i < 120; i++) hits[winnerOf(t, BigInt(ethers.keccak256(coder.encode(["uint256"], [i]))) % t.total)]++;
    expect(hits[0]).to.be.within(4, 24); expect(hits[1]).to.be.within(22, 52); expect(hits[2]).to.be.within(56, 88);
    // and a big list proves for every wallet
    const big = tree(Array.from({ length: 37 }, (_, i) => [ethers.getAddress("0x" + (i + 1).toString(16).padStart(40, "0")), BigInt(i + 1)]));
    for (const i of [0, 1, 17, 35, 36]) {
      const r = big.ranges[i];
      expect(await (await ethers.getContractFactory("MerkleCheck")).deploy().then((m) => m.check(big.proof(i), big.root, r.a, r.s, r.e))).to.equal(true);
    }
  });

  it("roles: only the curator lists and names the keeper; both may run raffles", async () => {
    await expect(vault.connect(keeper).proposeCollection(await nft.getAddress(), 1)).to.be.revertedWithCustomError(vault, "NotCurator");
    await expect(vault.connect(other).setKeeper(other.address)).to.be.revertedWithCustomError(vault, "NotCurator");
    await vault.connect(curator).setKeeper(other.address);
    expect(await vault.keeper()).to.equal(other.address);
    await vault.connect(curator).setCurator(a.address);
    await expect(vault.connect(curator).setKeeper(b.address)).to.be.revertedWithCustomError(vault, "NotCurator");
    expect(await vault.currentBlock()).to.equal(BigInt(await ethers.provider.getBlockNumber()));
  });
});
