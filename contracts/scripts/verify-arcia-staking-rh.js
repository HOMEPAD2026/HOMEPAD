// Verifies veARCIA (ArciaStaking) on Robinhood Chain's Blockscout — and first checks which version is deployed.
//
//   VEARCIA=0x29C010620f6720582c310aFa8D8115026eC73a7e npx hardhat run scripts/verify-arcia-staking-rh.js --network robinhoodMainnet
//
// Needs no key: it only reads the chain and uploads the source.
//   1. version check: streamCount() exists only in the current contract (compound, auto-renew, votes, extra tokens).
//      If it's missing, the address runs an older build — redeploy from the current code instead of verifying.
//   2. verification through Blockscout's own v2 API (standard JSON input), then hardhat-verify's Etherscan-style API
//      (which sometimes answers with a web page instead of JSON)
//   3. if both fail: writes contracts/vearcia-standard-input.json and prints the constructor arguments, for
//      Blockscout's own form — Contract → Verify & publish → Solidity (Standard JSON input).
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const EXPLORER = "https://robinhoodchain.blockscout.com";

// Blockscout's v2 API: is the source already published?
async function isVerified(addr) {
  if (typeof fetch !== "function") return false;
  try {
    const r = await fetch(`${EXPLORER}/api/v2/smart-contracts/${addr.toLowerCase()}`, { headers: { accept: "application/json" } });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && (j.is_verified || j.is_fully_verified || j.source_code));
  } catch { return false; }
}

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

  const page = `${EXPLORER}/address/${addr}?tab=contract`;
  if (await isVerified(addr)) { console.log(`✓ already verified — ${page}`); return; }

  // the exact compiler input from this build
  const dir = path.join(hre.config.paths.artifacts, "build-info");
  const file = fs.readdirSync(dir).map((f) => path.join(dir, f)).find((f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")).input.sources["contracts/ArciaStaking.sol"]; } catch { return false; } });
  if (!file) throw new Error("No build-info for ArciaStaking — run npx hardhat compile first.");
  const bi = JSON.parse(fs.readFileSync(file, "utf8"));
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "address"], args).slice(2);

  // 2. Blockscout's own v2 API (its Etherscan-style /api sometimes answers with a web page)
  if (typeof fetch === "function" && typeof FormData === "function" && typeof Blob === "function") {
    for (const name of ["ArciaStaking", "contracts/ArciaStaking.sol:ArciaStaking"]) {
      try {
        const fd = new FormData();
        fd.append("compiler_version", "v" + bi.solcLongVersion);
        fd.append("contract_name", name);
        fd.append("license_type", "mit");
        fd.append("autodetect_constructor_args", "false");
        fd.append("constructor_args", encoded);
        fd.append("files[0]", new Blob([JSON.stringify(bi.input)], { type: "application/json" }), "ArciaStaking.json");
        const r = await fetch(`${EXPLORER}/api/v2/smart-contracts/${addr.toLowerCase()}/verification/via/standard-input`, { method: "POST", body: fd });
        const t = await r.text();
        console.log(`  v2 (${name}): HTTP ${r.status} ${t.replace(/\s+/g, " ").slice(0, 160)}`);
        if (!r.ok) continue;
        for (let i = 0; i < 24; i++) { // up to ~2 minutes
          await new Promise((res) => setTimeout(res, 5000));
          if (await isVerified(addr)) { console.log(`✓ verified — ${page}`); return; }
        }
        console.log("  submitted, not verified after 2 minutes — open the page in a few minutes; if it's still unverified, use the form below.");
        break;
      } catch (e) { console.log(`  v2 (${name}): ${String((e && e.message) || e).slice(0, 160)}`); }
    }
  }

  // 3. hardhat-verify through the Etherscan-style API
  for (let i = 1; i <= 2; i++) {
    try {
      await hre.run("verify:verify", { address: addr, constructorArguments: args, contract: "contracts/ArciaStaking.sol:ArciaStaking" });
      console.log(`✓ verified — ${page}`);
      return;
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/already verified/i.test(m)) { console.log(`✓ already verified — ${page}`); return; }
      console.log(`  try ${i}: ${m.split("\n").find((x) => x.trim()) .slice(0, 160)}`);
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }

  // 4. the manual route: the same input, ready to upload on Blockscout's form
  const out = path.join(hre.config.paths.root, "vearcia-standard-input.json");
  fs.writeFileSync(out, JSON.stringify(bi.input));
  console.log(`\nThe API didn't answer. Verify it on Blockscout's page instead:
  1. ${page} → "Verify & publish"
  2. Method: Solidity (Standard JSON input) · Compiler: v${bi.solcLongVersion}
  3. Upload ${out}
  4. Contract name: ArciaStaking · Constructor arguments (ABI-encoded):
     ${encoded}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
