// Verifies veARCIA (ArciaStaking) on Robinhood Chain's Blockscout — and first checks which version is deployed.
//
//   VEARCIA=0x29C010620f6720582c310aFa8D8115026eC73a7e npx hardhat run scripts/verify-arcia-staking-rh.js --network robinhoodMainnet
//
// Needs no key: it only reads the chain and uploads the source.
//   1. version check: streamCount() exists only in the current contract (compound, auto-renew, votes, extra tokens).
//      If it's missing, the address runs an older build — redeploy from the current code instead of verifying.
//   2. verification through Blockscout's API, three tries (it sometimes answers with a web page instead of its API)
//   3. if that still fails: writes contracts/vearcia-standard-input.json and prints the constructor arguments, for
//      Blockscout's own form — Contract → Verify & publish → Solidity (Standard JSON input).
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const addr = (process.env.VEARCIA || "0x29C010620f6720582c310aFa8D8115026eC73a7e").trim();
  if (!ethers.isAddress(addr)) throw new Error("Set VEARCIA to the contract address.");
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 4663) throw new Error(`This is chain ${net.chainId}, not Robinhood Chain (4663) — use --network robinhoodMainnet.`);
  const code = await ethers.provider.getCode(addr);
  if (!code || code === "0x") throw new Error(`No contract at ${addr}.`);
  const c = await ethers.getContractAt("ArciaStaking", addr);

  // 1. which build is it?
  let n = null;
  try { n = await c.streamCount(); } catch { n = null; }
  if (n == null) {
    console.log("\n✗ This address runs an OLDER veARCIA build (no streamCount): the site expects the current one.");
    console.log("  Pull the latest bundle, redeploy with scripts/deploy-arcia-staking-rh.js and send the new address.");
    process.exitCode = 1;
    return;
  }
  console.log(`✓ Current build (reward streams: ${n}).`);

  // the constructor arguments: the token, the owner it was deployed with, the first boost signer
  const arcia = await c.arcia();
  const firstOwner = (await c.queryFilter(c.filters.OwnershipTransferred(ethers.ZeroAddress), 0).catch(() => []))[0];
  const firstSigner = (await c.queryFilter(c.filters.BoostSigner(), 0).catch(() => []))[0];
  const owner = firstOwner ? firstOwner.args[1] : await c.owner();
  const signer = firstSigner ? firstSigner.args[0] : await c.boostSigner();
  const args = [arcia, owner, signer];
  console.log("constructor:", args.join(" · "));

  // 2. Blockscout's API
  for (let i = 1; i <= 3; i++) {
    try {
      await hre.run("verify:verify", { address: addr, constructorArguments: args, contract: "contracts/ArciaStaking.sol:ArciaStaking" });
      console.log(`✓ verified — https://robinhoodchain.blockscout.com/address/${addr}?tab=contract`);
      return;
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/already verified/i.test(m)) { console.log(`✓ already verified — https://robinhoodchain.blockscout.com/address/${addr}?tab=contract`); return; }
      console.log(`  try ${i}: ${m.split("\n").find((x) => x.trim()) .slice(0, 160)}`);
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }

  // 3. the manual route: the exact compiler input, ready to upload
  const dir = path.join(hre.config.paths.artifacts, "build-info");
  const file = fs.readdirSync(dir).map((f) => path.join(dir, f)).find((f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")).input.sources["contracts/ArciaStaking.sol"]; } catch { return false; } });
  if (!file) throw new Error("No build-info for ArciaStaking — run npx hardhat compile first.");
  const bi = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = path.join(hre.config.paths.root, "vearcia-standard-input.json");
  fs.writeFileSync(out, JSON.stringify(bi.input));
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "address"], args).slice(2);
  console.log(`\nThe API didn't answer. Verify it on Blockscout's page instead:
  1. https://robinhoodchain.blockscout.com/address/${addr}?tab=contract → "Verify & publish"
  2. Method: Solidity (Standard JSON input) · Compiler: v${bi.solcLongVersion}
  3. Upload ${out}
  4. Contract name: ArciaStaking · Constructor arguments (ABI-encoded):
     ${encoded}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
