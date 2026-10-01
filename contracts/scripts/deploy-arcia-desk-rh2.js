// Deploys ArciaDeskRH2 — ARCIA DESK on Robinhood Chain v2, trading ANY new launch there (no launchpad check):
// Uniswap v4 pools paired with ETH / WETH (pools.trade, Bags, …) and Uniswap v3 pools paired with WETH (pons, …).
// It replaces ArciaDeskRH (pons-only). Withdraw what's left in the old desk with its owner panel first.
//
//   npx hardhat run scripts/deploy-arcia-desk-rh2.js --network robinhoodMainnet
//
// contracts/.env needs:
//   DEPLOYER_PRIVATE_KEY   any wallet with a little ETH on Robinhood Chain to pay for the deploy (it gets no role).
//                          Never the old deployer 0x80e1…8bc7.
//   DESK_OWNER             your own main wallet address (not a key): the only one that can withdraw, pause,
//                          change the caps, the allowed v4 hooks or the operator.
//   DESK_OPERATOR          the trader wallet's address — the wallet whose key the server trades with. Use the Arc
//                          desk's trader wallet (the key already in Vercel as ARCIA_DESK_KEY) so no new key is needed.
//   DESK_MAX_TRADE_ETH     (optional) most one buy may spend, default 0.004
//   DESK_DAILY_CAP_ETH     (optional) most all buys may spend in a UTC day, default 0.04
// After deploying:
//   1. send the trading ETH to the desk address it prints (ETH sent there becomes WETH) — not to the trader wallet;
//   2. send ~0.002 ETH of gas to the trader wallet on Robinhood Chain;
//   3. in Vercel: ARCIA_DESK_RH_ADDRESS = the desk (optional ARCIA_DESK_RH_KEY, else ARCIA_DESK_KEY is used), Redeploy;
//   4. add a cron-job.org entry, every minute: https://www.arcircle.app/api/desk?chain=rh&tick=1&key=<CRON_SECRET>;
//   5. delete contracts/.env.
// The script also verifies the contract on Blockscout. Withdraw, pause and caps are also buttons in the page's owner panel.
const hre = require("hardhat");
const { ethers } = hre;

const V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA"; // Uniswap v3 on Robinhood Chain (pons launches into it)
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager (pools.trade, Bags)
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
// v4 hooks allowed besides "no hook": Bags' singleton hook (it takes Bags' 2% fee; a buy can still never cost more than asked)
const HOOKS = ["0x2380aBf72C17aABAb76480244759AC7E2932EEcC"];
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  if (hre.network.config.chainId !== 4663) throw new Error("Run this with --network robinhoodMainnet (chain 4663).");
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const owner = process.env.DESK_OWNER || "", operator = process.env.DESK_OPERATOR || "";
  if (!ethers.isAddress(owner)) throw new Error("Set DESK_OWNER to your main wallet's address.");
  if (!ethers.isAddress(operator)) throw new Error("Set DESK_OPERATOR to the trader wallet's address (the Arc desk's trader wallet).");
  if (owner.toLowerCase() === operator.toLowerCase()) throw new Error("DESK_OWNER and DESK_OPERATOR should be different wallets — the operator key lives on the server.");
  const maxTrade = ethers.parseEther(process.env.DESK_MAX_TRADE_ETH || "0.004");
  const dailyCap = ethers.parseEther(process.env.DESK_DAILY_CAP_ETH || "0.04");
  if (maxTrade > dailyCap) throw new Error("DESK_MAX_TRADE_ETH can't be more than DESK_DAILY_CAP_ETH.");
  for (const [n, a] of [["Uniswap v3 factory", V3_FACTORY], ["Uniswap v4 PoolManager", POOL_MANAGER], ["WETH", WETH]]) {
    const code = await ethers.provider.getCode(a);
    if (!code || code === "0x") throw new Error(`No ${n} contract at ${a} on this network.`);
  }
  // a hook that isn't there is just left off the list (the owner can add hooks later with setHook)
  for (const h of HOOKS.slice()) { const code = await ethers.provider.getCode(h); if (!code || code === "0x") { console.log("  (no contract at hook", h, "— left off)"); HOOKS.splice(HOOKS.indexOf(h), 1); } }
  console.log("Deploying ArciaDeskRH2 on", hre.network.name, "from", deployer.address);
  const F = await ethers.getContractFactory("ArciaDeskRH2");
  const desk = await F.deploy(V3_FACTORY, POOL_MANAGER, WETH, HOOKS, owner, operator, maxTrade, dailyCap);
  const rc = await desk.deploymentTransaction().wait();
  const addr = await desk.getAddress();
  console.log("\nArciaDeskRH2:", addr);
  console.log("  block:    ", rc.blockNumber);
  console.log("  owner:    ", await desk.owner());
  console.log("  operator: ", await desk.operator());
  console.log("  caps:     ", `${ethers.formatEther(await desk.maxTrade())} ETH a buy · ${ethers.formatEther(await desk.dailyCap())} ETH a day`);
  console.log("  v4 hooks: ", HOOKS.length ? HOOKS.join(", ") : "none", "(pools with no hook are always fine)");
  // verify on Robinhood's Blockscout
  const args = [V3_FACTORY, POOL_MANAGER, WETH, HOOKS, owner, operator, maxTrade.toString(), dailyCap.toString()];
  require("fs").writeFileSync(require("path").join(__dirname, "..", "desk-rh2-args.js"), `module.exports = ${JSON.stringify(args)};\n`);
  try {
    await new Promise((r) => setTimeout(r, 15000));
    await hre.run("verify:verify", { address: addr, constructorArguments: args });
    console.log("  verified on robinhoodchain.blockscout.com");
  } catch (e) {
    console.log("  verification didn't finish:", String((e && e.message) || e).split("\n")[0]);
    console.log(`  try again later: npx hardhat verify --network robinhoodMainnet --constructor-args desk-rh2-args.js ${addr}`);
  }
  console.log("\nNext: send the trading ETH to", addr, "· ~0.002 ETH of gas to", operator, "· Vercel: ARCIA_DESK_RH_ADDRESS =", addr, "· Redeploy · delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
