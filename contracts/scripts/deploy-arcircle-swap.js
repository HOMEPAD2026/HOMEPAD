// Deploys ARCIRCLE Swap on Arc (contracts/ArcircleSwap.sol — arcpad.html#swap, arc-swap.js): buy and sell any Arc token
// with a Uniswap v4 pool, paying with $ARCIRCLE, USDC or any token, routed through up to three pools in one transaction.
//
//   npx hardhat run scripts/deploy-arcircle-swap.js --network arcMainnet
//
// contracts/.env needs only DEPLOYER_PRIVATE_KEY: any wallet with a little USDC for gas on Arc. Never the old deployer
// 0x80e1…8bc7. ArcircleSwap has no owner and nothing to configure after this:
//   · its fee (SWAP_FEE_BPS, default 10 = 0.1%; the contract refuses more than 30 = 0.3%) goes to ArcircleFeeBurn, the
//     same fee burn ARCIRCLE Orders uses: $ARCIRCLE fees are burned 50% in the same transaction, USDC fees wait for
//     the burn's hourly run (which buys and burns $ARCIRCLE with half), anything else goes to the treasury;
//   · ArcircleFeeBurn is also its fee policy: wallets holding 100,000+ $ARCIRCLE swap fee-free.
// The script checks the fee burn is the one for $ARCIRCLE / USDC, deploys, quotes 1 USDC → $ARCIRCLE through the new
// contract as a smoke test, writes scripts/args-arcircle-swap.js and tries to verify on ArcScan.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Arc
const USDC = "0x3600000000000000000000000000000000000000";
const ARCIRCLE = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const FEE_BURN = "0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034"; // ArcircleFeeBurn (block 23739974)
const FEE_BPS = Number(process.env.SWAP_FEE_BPS || 10);
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";
const KEY_T = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (![5042, 5042002, 31337].includes(Number(net.chainId))) throw new Error(`Chain ${net.chainId}: use arcMainnet.`);
  if (!(FEE_BPS >= 0 && FEE_BPS <= 30)) throw new Error("SWAP_FEE_BPS must be 0–30 (0.3% at most).");
  for (const [n, a] of [["PoolManager", POOL_MANAGER], ["USDC", USDC], ["$ARCIRCLE", ARCIRCLE], ["ArcircleFeeBurn", FEE_BURN]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  const fb = new ethers.Contract(FEE_BURN, ["function usdc() view returns (address)", "function arcircle() view returns (address)", "function burnBps() view returns (uint256)", "function discountMin() view returns (uint256)", `function poolKey() view returns (${KEY_T})`], deployer);
  const [fu, fa, bb, dm, key] = await Promise.all([fb.usdc(), fb.arcircle(), fb.burnBps(), fb.discountMin(), fb.poolKey()]);
  if (fu.toLowerCase() !== USDC.toLowerCase() || fa.toLowerCase() !== ARCIRCLE.toLowerCase()) throw new Error("That fee burn isn't the $ARCIRCLE / USDC one.");
  console.log("fee burn:", FEE_BURN, `· burns ${Number(bb) / 100}% · fee-free from ${ethers.formatEther(dm)} $ARCIRCLE`);

  const args = [POOL_MANAGER, USDC, ARCIRCLE, FEE_BURN, FEE_BURN, FEE_BPS];
  const sw = await (await ethers.getContractFactory("ArcircleSwap")).deploy(...args);
  const rc = await sw.deploymentTransaction().wait();
  const addr = await sw.getAddress();
  require("fs").writeFileSync(require("path").join(__dirname, "args-arcircle-swap.js"), "module.exports = " + JSON.stringify(args) + ";\n");
  console.log("\nArcircleSwap:", addr, " block", rc.blockNumber);
  console.log("  fee:      ", Number(await sw.feeBps()) / 100 + "% →", await sw.feeTo(), "(policy", await sw.feePolicy() + ")");

  // smoke test: 1 USDC → $ARCIRCLE through the new contract (eth_call — nothing moves)
  try {
    await sw.quote.staticCall([[key[0], key[1], key[2], key[3], key[4]]], USDC, 1_000_000n, deployer.address);
    console.log("  quote:     no revert?");
  } catch (e) {
    // the revert data sits in different places depending on the provider; the node's message names it too
    const hex = [e && e.data, e && e.error && e.error.data, e && e.info && e.info.error && e.info.error.data].find((x) => typeof x === "string" && x.startsWith("0x"));
    let r = null;
    try { if (hex) r = sw.interface.decodeErrorResult("QuoteResult", hex); } catch { r = null; }
    const m = !r && /QuoteResult\((\d+), (\d+), (\d+)\)/.exec(String((e && e.message) || ""));
    if (m) r = [BigInt(m[1]), BigInt(m[2]), BigInt(m[3])];
    if (r) console.log("  quote:     1 USDC →", ethers.formatEther(r[0]), "$ARCIRCLE after a fee of", r[1] === 0n ? "0 (this wallet is fee-free)" : ethers.formatUnits(r[1], 6) + " USDC");
    else console.log("  quote:     couldn't read it:", String((e && e.shortMessage) || e).split("\n")[0]);
  }
  try {
    await new Promise((r) => setTimeout(r, 15000));
    await hre.run("verify:verify", { address: addr, constructorArguments: args });
    console.log("  verified");
  } catch (e) {
    console.log("  verification didn't finish:", String((e && e.message) || e).split("\n")[0]);
    console.log("  later: npx hardhat verify --network arcMainnet --constructor-args scripts/args-arcircle-swap.js", addr);
  }
  console.log(`\nNext: send back the ArcircleSwap address ${addr} (it goes into config-arc.js SWAP_ADDRESS) · delete contracts/.env`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
