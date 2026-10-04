// Deploys ArciaStaking — veARCIA on Robinhood Chain: stake $ARCIA for 1–20 days (1.0x–2.0x), rewards in $ARCIA that
// stream out of a reward pool over 20 days, an early-exit penalty (time left ÷ lock, max 50%) that's burned, and a
// $ARCIRCLE holder boost (1.2x / 1.5x / 2.0x from 1M / 5M / 10M) signed by the site (contracts/ArciaStaking.sol;
// arcpad.html#vearcia, arc-vearcia.js, api/_vearcia.mjs).
//
//   BOOST_SIGNER=0x<the boost signer's ADDRESS> npx hardhat run scripts/deploy-arcia-staking-rh.js --network robinhoodMainnet
//
// contracts/.env needs only DEPLOYER_PRIVATE_KEY: any wallet with a little ETH on Robinhood Chain for gas (never the old
// deployer 0x80e1…8bc7). It owns nothing afterwards.
//   · The owner (the only wallet that can add $ARCIA to the reward pool or take back what hasn't streamed yet, and name
//     the boost signer) is the funder wallet below — not the deployer.
//   · BOOST_SIGNER is only the public address of a fresh wallet whose key goes into Vercel as ARCIA_BOOST_KEY (Sensitive).
//     It signs "this wallet holds N $ARCIRCLE" notes; it needs no ETH. Leave it out and set it later from the owner wallet
//     (setBoostSigner) — until then nobody gets a boost.
// After deploying: send the printed address and block back (they go into config-arc.js and api/_vearcia.mjs), then
// from the funder wallet approve $ARCIA and call fund(amount) — the page's owner panel does both. Then add the keeper's
// cron (every 10 minutes): https://www.arcircle.app/api/desk?veatick=1&key=<CRON_SECRET> — it pokes ended locks and lapsed
// boosts and lowers boosts whose $ARCIRCLE dropped (gas from VEARCIA_KEEPER_KEY, else the Robinhood Orders executor).
const hre = require("hardhat");
const { ethers } = hre;

const ARCIA = "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25"; // $ARCIA on Robinhood Chain (Pons)
const FUNDER = "0x82F55F91D68B248021c64FBe5ccD931F999BBd51"; // owner: funds and defunds the reward pool
const OLD_DEPLOYER = "0x80e18846cB2Ed34bdF1E3A8a8689FD5D4C9E8bc7";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env first.");
  if (deployer.address.toLowerCase() === OLD_DEPLOYER.toLowerCase()) throw new Error("That's the old deployer, whose key was exposed. Use another wallet.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 4663) throw new Error(`This is chain ${net.chainId}, not Robinhood Chain (4663) — use --network robinhoodMainnet.`);
  const code = await ethers.provider.getCode(ARCIA);
  if (!code || code === "0x") throw new Error(`No $ARCIA contract at ${ARCIA} on this network.`);
  const signerIn = (process.env.BOOST_SIGNER || "").trim();
  if (signerIn && !ethers.isAddress(signerIn)) throw new Error("BOOST_SIGNER isn't an address (it's the signer's public address, never its key).");
  const signer = signerIn ? ethers.getAddress(signerIn) : ethers.ZeroAddress;
  const tok = new ethers.Contract(ARCIA, ["function symbol() view returns (string)", "function decimals() view returns (uint8)"], ethers.provider);
  console.log("Deploying ArciaStaking (veARCIA) on", hre.network.name, "from", deployer.address);
  console.log("  token:  ", ARCIA, `(${await tok.symbol()}, ${await tok.decimals()} decimals)`);
  console.log("  owner:  ", FUNDER);
  console.log("  signer: ", signer === ethers.ZeroAddress ? "(none yet — set it later with setBoostSigner)" : signer);
  const F = await ethers.getContractFactory("ArciaStaking");
  const s = await F.deploy(ARCIA, FUNDER, signer);
  const rc = await s.deploymentTransaction().wait();
  const addr = await s.getAddress();
  console.log("\nArciaStaking (veARCIA):", addr);
  console.log("  block:  ", rc.blockNumber);
  console.log("  owner:  ", await s.owner());
  console.log("  lock:    1–20 days (1.0x–2.0x) · stream: 20 days · early exit: time left ÷ lock, max 50%, burned");
  console.log(`\nVerify: npx hardhat verify --network robinhoodMainnet ${addr} ${ARCIA} ${FUNDER} ${signer}`);
  console.log("Next: send the address and block back · Vercel ARCIA_BOOST_KEY (the signer's key, Sensitive) · fund the pool from", FUNDER, "· delete contracts/.env");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
