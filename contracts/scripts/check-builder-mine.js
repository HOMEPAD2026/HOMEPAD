// Reads a deployed BuilderMine and checks every setting against what deploy-builder-mine.js set.
// Read-only: needs no private key (run it with contracts/.env deleted).
//
//   npx hardhat run scripts/check-builder-mine.js --network arcMainnet
//
// Optional env: MINE (the contract, defaults to the live one below), MINE_OWNER, MINE_OPERATOR (addresses to expect).
const hre = require("hardhat");
const { ethers } = hre;

const MINE = process.env.MINE || "0x1538c76917dE5911D71c5C397ff18cA09d52B019";
const EXPECT_OWNER = process.env.MINE_OWNER || "0x90Ce4F16e71644A753f076Cc905a6E8f022c4900";
const EXPECT_OPERATOR = process.env.MINE_OPERATOR || "0x5546492e95079bbFe862e15967dd8Aed378f887F";
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7"; // its key has been exposed — it must hold no role
const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const E = (n) => ethers.parseEther(String(n));
// [price, tier, boost, seconds] — the same list as deploy-builder-mine.js
const ITEMS = [[20_000, 1, 0, 0], [60_000, 2, 0, 0], [150_000, 3, 0, 0], [300_000, 4, 0, 0], [700_000, 5, 0, 0], [1_600_000, 6, 0, 0], [4_000_000, 7, 0, 0],
  [30_000, 0, 1, 86400], [20_000, 0, 2, 3600], [40_000, 0, 3, 86400], [30_000, 0, 4, 86400]];
const ABI = [
  "function owner() view returns (address)", "function operator() view returns (address)", "function arcircle() view returns (address)",
  "function feeUsd6() view returns (uint256)", "function feeFloorArc() view returns (uint256)", "function feeArc() view returns (uint256)",
  "function joinsPaused() view returns (bool)", "function mineCount() view returns (uint256)", "function arcircleBurned() view returns (uint256)",
  "function getItems() view returns ((uint128 price, uint8 tier, uint8 boost, uint32 duration, bool active)[])",
  "function pickaxeItem(uint8) view returns (uint256)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event OperatorSet(address indexed operator)", "event FeeSet(uint256 feeUsd6, uint256 floorArc)", "event JoinsPaused(bool paused)",
  "event ItemSet(uint256 indexed itemId, uint128 price, uint8 tier, uint8 boost, uint32 duration, bool active)",
];

async function main() {
  const m = new ethers.Contract(MINE, ABI, ethers.provider);
  let bad = 0;
  const ok = (cond, msg, extra = "") => { console.log(`${cond ? "OK  " : "FAIL"} ${msg}${extra ? "  " + extra : ""}`); if (!cond) bad++; };
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const code = await ethers.provider.getCode(MINE);
  ok(code && code !== "0x", `contract at ${MINE}`);
  const [owner, operator, arc, usd6, floor, fee, paused, count, burned, items] = await Promise.all([
    m.owner(), m.operator(), m.arcircle(), m.feeUsd6(), m.feeFloorArc(), m.feeArc(), m.joinsPaused(), m.mineCount(), m.arcircleBurned(), m.getItems(),
  ]);
  ok(same(owner, EXPECT_OWNER), "owner is your owner wallet", owner);
  ok(!same(owner, OLD_DEPLOYER), "the old deployer (exposed key) is not the owner");
  ok(same(operator, EXPECT_OPERATOR), "operator is your operator wallet", operator);
  ok(same(arc, ARCIRCLE), "$ARCIRCLE is the fee token", arc);
  ok(usd6 === 1000000n, "fee is 1 USDC", `feeUsd6=${usd6}`);
  ok(floor === 0n, "no fee floor set", `floor=${ethers.formatEther(floor)}`);
  console.log(`     fee right now: ${Number(ethers.formatEther(fee)).toLocaleString("en-US")} $ARCIRCLE`);
  ok(paused === false, "new mines and joins are open");
  ok(items.length === ITEMS.length, `${ITEMS.length} items`, `found ${items.length}`);
  ITEMS.forEach(([p, tier, boost, dur], i) => {
    const it = items[i];
    if (!it) return;
    ok(it.price === E(p) && Number(it.tier) === tier && Number(it.boost) === boost && Number(it.duration) === dur && it.active,
      `item ${i}: ${p.toLocaleString("en-US")} $ARCIRCLE`, `on-chain ${Number(ethers.formatEther(it.price)).toLocaleString("en-US")}, tier ${it.tier}, boost ${it.boost}, ${it.duration}s, active ${it.active}`);
  });
  for (let t = 1; t <= 7; t++) ok((await m.pickaxeItem(t)) === BigInt(t), `pickaxe tier ${t} → item ${t - 1}`);
  console.log(`     mines opened so far: ${count}, $ARCIRCLE burned so far: ${ethers.formatEther(burned)}`);
  // every settings change since the deploy, and who made it
  const latest = await ethers.provider.getBlockNumber();
  const from = Number(process.env.FROM_BLOCK || 23279278);
  const logs = [];
  for (let b = from; b <= latest; b += 9000) {
    const part = await ethers.provider.getLogs({ address: MINE, fromBlock: b, toBlock: Math.min(latest, b + 8999) }).catch(() => []);
    logs.push(...part);
  }
  console.log(`\nSettings events since block ${from} (${logs.length} logs):`);
  for (const l of logs) {
    let ev; try { ev = m.interface.parseLog(l); } catch (e) { ev = null; }
    if (!ev || !["OwnershipTransferred", "OperatorSet", "FeeSet", "JoinsPaused", "ItemSet"].includes(ev.name)) continue;
    const tx = await ethers.provider.getTransaction(l.transactionHash);
    console.log(`  block ${l.blockNumber}  ${ev.name}(${ev.args.map((a) => String(a)).join(", ")})  sent by ${tx ? tx.from : "?"}`);
    if (ev.name !== "ItemSet" && ev.name !== "OwnershipTransferred" && tx && same(tx.from, OLD_DEPLOYER)) { ok(false, "a setting was changed by the old deployer after the deploy"); }
  }
  console.log(bad ? `\n${bad} check(s) FAILED — send this output back before going live.` : "\nAll good — the contract is set up as intended.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
