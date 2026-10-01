// Deploys ARCIRCLE Orders on Robinhood Chain: ArcircleFeeBurnNative (where the 0.1% fees go) and ArcircleOrdersNative
// (limit, stop, timed and market orders on Robinhood Chain's Uniswap v4 pools, including native ETH pools —
// arcpad.html#orders with the Robinhood switch, arc-orders.js, api/_orders.mjs).
//
//   ORDERS_KEEPER=0x<the executor wallet's ADDRESS> npx hardhat run scripts/deploy-arcircle-orders-rh.js --network robinhoodMainnet
//
// contracts/.env needs only DEPLOYER_PRIVATE_KEY: any wallet with a little ETH for gas on Robinhood Chain. Never the old
// deployer 0x80e1…8bc7. ORDERS_KEEPER is only the executor's public address (its key is ORDERS_KEEPER_KEY in Vercel —
// or ORDERS_KEEPER_RH_KEY for a separate Robinhood executor); it needs a little ETH on Robinhood Chain for gas.
//   · ArcircleOrdersNative has no owner and nothing to configure. Orders name WETH for ETH; native ETH pools are
//     wrapped and unwrapped inside the contract.
//   · ArcircleFeeBurnNative: half of every WETH fee buys $ARCIRCLE from the official $ARCIRCLE / ETH pool and burns
//     it, the other half (and every other token) goes to the treasury. Wallets holding 100,000 $ARCIRCLE (on Robinhood
//     Chain) or more trade fee-free. Its owner (the deployer) can change the operator and that threshold, or step down.
//   · Permit2 is used if it's on the chain; otherwise makers approve ArcircleOrdersNative directly.
// The $ARCIRCLE / ETH pool key is read from the PoolManager's Initialize log (pool id below). If the RPC won't search
// that far back, the script asks Blockscout; or pass it yourself: ARCIRCLE_RH_POOL_KEY=currency0,currency1,fee,tickSpacing,hooks
// After deploying, send both printed addresses back: they go into config-arc.js and api/_orders.mjs.
const hre = require("hardhat");
const { ethers } = hre;

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Robinhood Chain
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const TREASURY = "0xa066e6C5D1ac561A4065B9D6B00feF89C0bD02F8"; // the ARCIRCLE PAD treasury
const ARCIRCLE_RH = "0x6F9EBd0DFc6De9ed47EEc18EfeB69A9b97C71ee4"; // $ARCIRCLE on Robinhood Chain (ArcircleOFT)
const ARCIRCLE_POOL_ID = "0x1bbed8ae8485bd75d46c3bdb830d47aca49b6ccb4fad57e6263903d0c1f10a50"; // $ARCIRCLE / ETH, Uniswap v4
const BURN_BPS = 5000; // 50% of the fees burned as $ARCIRCLE
const DISCOUNT_MIN = ethers.parseEther("100000"); // hold 100,000 $ARCIRCLE: no fee
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Uniswap's Permit2 (same address on every chain, if it's there)
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";
const BLOCKSCOUT = "https://robinhoodchain.blockscout.com/api";
const INIT_TOPIC = ethers.id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");

const coder = ethers.AbiCoder.defaultAbiCoder();
const idOf = (k) => ethers.keccak256(coder.encode(["address", "address", "uint24", "int24", "address"], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
function keyOfLog(l) {
  const [fee, tickSpacing, hooks] = coder.decode(["uint24", "int24", "address", "uint160", "int24"], l.data);
  return { currency0: ethers.getAddress("0x" + l.topics[2].slice(26)), currency1: ethers.getAddress("0x" + l.topics[3].slice(26)), fee: Number(fee), tickSpacing: Number(tickSpacing), hooks };
}

async function poolKey() {
  const env = (process.env.ARCIRCLE_RH_POOL_KEY || "").trim();
  if (env) {
    const [c0, c1, fee, ts, hooks] = env.split(",").map((x) => x.trim());
    return { currency0: ethers.getAddress(c0), currency1: ethers.getAddress(c1), fee: Number(fee), tickSpacing: Number(ts), hooks: ethers.getAddress(hooks) };
  }
  // 1. the RPC, newest blocks first, in windows it accepts (Robinhood Chain's caps a search at 10,000,000 blocks)
  const head = await ethers.provider.getBlockNumber();
  let step = 9_000_000;
  console.log(`  looking for the $ARCIRCLE / ETH pool's Initialize log (chain head ${head})…`);
  for (let to = head; to >= 0;) {
    const from = Math.max(0, to - step + 1);
    try {
      const logs = await ethers.provider.getLogs({ address: POOL_MANAGER, topics: [INIT_TOPIC, ARCIRCLE_POOL_ID], fromBlock: from, toBlock: to });
      if (logs.length) { console.log(`  found it in block ${logs[0].blockNumber}`); return keyOfLog(logs[0]); }
      to = from - 1;
    } catch (e) {
      const m = String((e && e.message) || e);
      if (step > 100_000 && /range|allowed|narrow|limit|too many|exceed/i.test(m)) { step = Math.floor(step / 4); continue; } // a smaller window
      console.log("  the RPC search stopped:", m.split("\n")[0].slice(0, 140));
      break;
    }
  }
  // 2. Blockscout's logs API
  try {
    const u = `${BLOCKSCOUT}?module=logs&action=getLogs&fromBlock=0&toBlock=${head}&address=${POOL_MANAGER}&topic0=${INIT_TOPIC}&topic1=${ARCIRCLE_POOL_ID}&topic0_1_opr=and`;
    const r = await fetch(u, { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => null);
    const l = j && Array.isArray(j.result) && j.result[0];
    if (l) return keyOfLog({ topics: l.topics.filter(Boolean), data: l.data });
    console.log("  Blockscout had no answer either:", r.status, j && (j.message || j.status));
  } catch (e) { console.log("  Blockscout didn't answer:", String((e && e.message) || e).slice(0, 120)); }
  throw new Error("Couldn't read the $ARCIRCLE / ETH pool key. Pass it as ARCIRCLE_RH_POOL_KEY=currency0,currency1,fee,tickSpacing,hooks");
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 4663n && hre.network.name !== "hardhat" && hre.network.name !== "local") throw new Error(`This is for Robinhood Chain (4663), not chain ${net.chainId}.`);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const keeper = (process.env.ORDERS_KEEPER || "").trim();
  if (keeper.length > 42) throw new Error("ORDERS_KEEPER looks like a private key — pass the address only.");
  if (keeper && !ethers.isAddress(keeper)) throw new Error("ORDERS_KEEPER must be the executor wallet's address (0x…), not a key.");
  for (const [n, a] of [["Uniswap v4 PoolManager", POOL_MANAGER], ["WETH", WETH], ["$ARCIRCLE", ARCIRCLE_RH]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} at ${a} on this network.`);
  }
  const p2code = await ethers.provider.getCode(PERMIT2);
  const permit2 = p2code && p2code !== "0x" ? PERMIT2 : ethers.ZeroAddress;
  const key = await poolKey();
  if (idOf(key).toLowerCase() !== ARCIRCLE_POOL_ID) throw new Error("That pool key doesn't match the $ARCIRCLE / ETH pool id.");
  const sides = [key.currency0.toLowerCase(), key.currency1.toLowerCase()];
  if (!sides.includes(ARCIRCLE_RH.toLowerCase())) throw new Error("That pool isn't a $ARCIRCLE pool.");
  console.log("Deploying ARCIRCLE Orders on", hre.network.name, "from", deployer.address, "· ETH", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("  $ARCIRCLE pool:", key.currency0, key.currency1, "fee", key.fee, "spacing", key.tickSpacing, "hooks", key.hooks);
  console.log("  Permit2:       ", permit2 === ethers.ZeroAddress ? "not on this chain — plain approvals only" : permit2);

  const FB = await ethers.getContractFactory("ArcircleFeeBurnNative");
  const fbArgs = [POOL_MANAGER, WETH, ARCIRCLE_RH, TREASURY, BURN_BPS, key, keeper || deployer.address, DISCOUNT_MIN];
  const fb = await FB.deploy(...fbArgs);
  const rc1 = await fb.deploymentTransaction().wait();
  const fbAddr = await fb.getAddress();
  console.log("\nArcircleFeeBurnNative:", fbAddr, " block", rc1.blockNumber);
  console.log("  burns:    ", Number(await fb.burnBps()) / 100 + "% of the fees as $ARCIRCLE; the rest to", await fb.treasury());
  console.log("  operator: ", await fb.operator(), keeper ? "(the executor)" : "(you — set the executor later with setOperator)");
  console.log("  fee-free: ", ethers.formatEther(await fb.discountMin()), "$ARCIRCLE or more");
  try {
    await fb.quote.staticCall(ethers.parseEther("0.0001"));
  } catch (e) {
    try { console.log("  0.0001 WETH buys", ethers.formatEther(fb.interface.decodeErrorResult("QuoteResult", e.data)[0]), "$ARCIRCLE now"); }
    catch { console.log("  ⚠ the burn's test quote failed — check the pool before the first burn"); }
  }

  const F = await ethers.getContractFactory("ArcircleOrdersNative");
  const oArgs = [POOL_MANAGER, fbAddr, permit2, fbAddr, WETH];
  const c = await F.deploy(...oArgs);
  const rc = await c.deploymentTransaction().wait();
  const addr = await c.getAddress();
  console.log("\nArcircleOrdersNative:", addr, " block", rc.blockNumber);
  console.log("  pools:    ", await c.poolManager(), "· ETH as", await c.weth());
  console.log("  fees to:  ", await c.treasury(), `(${Number(await c.FEE_BPS()) / 100}%; policy ${await c.feePolicy()})`);
  console.log("  permit2:  ", await c.permit2());
  try {
    await new Promise((r) => setTimeout(r, 15000));
    await hre.run("verify:verify", { address: fbAddr, constructorArguments: fbArgs });
    await hre.run("verify:verify", { address: addr, constructorArguments: oArgs });
    console.log("  verified on robinhoodchain.blockscout.com");
  } catch (e) {
    console.log("  verification didn't finish:", String((e && e.message) || e).split("\n")[0]);
  }
  console.log(`\nNext: send back ArcircleOrdersNative ${addr} and ArcircleFeeBurnNative ${fbAddr} (and Permit2: ${permit2 === ethers.ZeroAddress ? "none" : "yes"}) · delete contracts/.env`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
