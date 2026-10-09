// Checks ArcPad on Robinhood Chain (the four contracts deploy-arcpad-rh.js deployed) and publishes their source on
// Robinhood Chain's Blockscout.
//
//   npx hardhat run scripts/verify-arcpad-rh.js --network robinhoodMainnet
//
// Needs no key: it only reads the chain and uploads the source. It reads the constructor arguments from
// scripts/args-arcpad-rh.json (written by the deploy script) and the addresses from config-arc.js ARCPAD_RH.
//   1. wiring: the hook's factory, the router's factory, the vault's factory / poster / treasury, the launch fee
//   2. verification through Blockscout's v2 API (standard JSON input), then hardhat-verify
//   3. if both fail: writes contracts/<name>-standard-input.json and prints the arguments for Blockscout's form
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const EXPLORER = "https://robinhoodchain.blockscout.com";
const A = {
  factory: "0x1446Af2D4b86cf31a96bDe8173c2bC39C8a2EEAf",
  router: "0x0ab746332B5b85091b62cBC6F1Ce90F1557465B3",
  hook: "0xD49D2D593FCf79651E2db7f554D4E13f434e8044",
  drop: "0x8e67b75b4B91c5c95c4562F99980371e4f466daA",
};

async function isVerified(addr) {
  try {
    const r = await fetch(`${EXPLORER}/api/v2/smart-contracts/${addr.toLowerCase()}`, { headers: { accept: "application/json" } });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && (j.is_verified || j.is_fully_verified || j.source_code));
  } catch { return false; }
}

function buildInfo(file) {
  const dir = path.join(hre.config.paths.artifacts, "build-info");
  const f = fs.readdirSync(dir).map((x) => path.join(dir, x)).find((x) => { try { return JSON.parse(fs.readFileSync(x, "utf8")).input.sources[file]; } catch { return false; } });
  if (!f) throw new Error(`No build-info for ${file} — run npx hardhat compile first.`);
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

async function verifyOne(name, file, addr, types, args) {
  const page = `${EXPLORER}/address/${addr}?tab=contract`;
  if (await isVerified(addr)) { console.log(`✓ ${name} already verified — ${page}`); return true; }
  const bi = buildInfo(file);
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(types, args).slice(2);
  for (const cn of [name, `${file}:${name}`]) {
    try {
      const fd = new FormData();
      fd.append("compiler_version", "v" + bi.solcLongVersion);
      fd.append("contract_name", cn);
      fd.append("license_type", "mit");
      fd.append("autodetect_constructor_args", "false");
      fd.append("constructor_args", encoded);
      fd.append("files[0]", new Blob([JSON.stringify(bi.input)], { type: "application/json" }), `${name}.json`);
      const r = await fetch(`${EXPLORER}/api/v2/smart-contracts/${addr.toLowerCase()}/verification/via/standard-input`, { method: "POST", body: fd });
      const t = await r.text();
      console.log(`  ${name} v2 (${cn}): HTTP ${r.status} ${t.replace(/\s+/g, " ").slice(0, 140)}`);
      if (!r.ok) continue;
      for (let i = 0; i < 24; i++) {
        await new Promise((res) => setTimeout(res, 5000));
        if (await isVerified(addr)) { console.log(`✓ ${name} verified — ${page}`); return true; }
      }
      break;
    } catch (e) { console.log(`  ${name} v2: ${String((e && e.message) || e).slice(0, 140)}`); }
  }
  try {
    await hre.run("verify:verify", { address: addr, constructorArguments: args, contract: `${file}:${name}` });
    console.log(`✓ ${name} verified — ${page}`);
    return true;
  } catch (e) {
    const m = String((e && e.message) || e);
    if (/already verified/i.test(m)) { console.log(`✓ ${name} already verified — ${page}`); return true; }
    console.log(`  ${name} hardhat-verify: ${m.split("\n").find((x) => x.trim()).slice(0, 140)}`);
  }
  const out = path.join(hre.config.paths.root, `${name}-standard-input.json`);
  fs.writeFileSync(out, JSON.stringify(bi.input));
  console.log(`\n${name}: verify it on Blockscout's page instead:
  1. ${page} → "Verify & publish"
  2. Solidity (Standard JSON input) · Compiler v${bi.solcLongVersion}
  3. Upload ${out}
  4. Contract name: ${name} · Constructor arguments (ABI-encoded):
     ${encoded}\n`);
  return false;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 4663) throw new Error(`This is chain ${net.chainId}, not Robinhood Chain (4663) — use --network robinhoodMainnet.`);
  for (const [k, a] of Object.entries(A)) { const c = await ethers.provider.getCode(a); if (!c || c === "0x") throw new Error(`No contract at ${k} ${a}.`); }
  const argsFile = path.join(__dirname, "args-arcpad-rh.json");
  if (!fs.existsSync(argsFile)) throw new Error("scripts/args-arcpad-rh.json is missing — it's written by deploy-arcpad-rh.js in the same folder.");
  const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));

  // 1. the wiring
  const f = await ethers.getContractAt("ArcPadFactoryRH", A.factory);
  const hook = await ethers.getContractAt("HomepadHybridHook", A.hook);
  const r = await ethers.getContractAt("ArcPadRouterRH", A.router);
  const d = await ethers.getContractAt("ArcLaunchDropRH", A.drop);
  const eq = (x, y) => String(x).toLowerCase() === String(y).toLowerCase();
  const checks = [
    ["factory → hook", eq(await f.hook(), A.hook)],
    ["hook → factory", eq(await hook.factory(), A.factory)],
    ["router → factory", eq(await r.factory(), A.factory)],
    ["vault → factory", eq(await d.factory(), A.factory)],
    ["vault poster = treasury", eq(await d.poster(), await f.platformTreasury())],
    ["vault treasury = treasury", eq(await d.treasury(), await f.platformTreasury())],
    ["args file = these contracts", eq(args.router[1], A.factory) && eq(args.drop[0], A.factory) && eq(args.factory[3], A.hook)],
  ];
  for (const [k, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${k}`);
  console.log(`  launch fee ${ethers.formatEther(await f.launchFee())} ETH · launches so far ${await f.launchCount()} · treasury ${await f.platformTreasury()}`);
  if (checks.some(([, ok]) => !ok)) { process.exitCode = 1; console.log("\nSomething isn't wired as expected — send this output to Claude before launching."); return; }

  // 2. the source
  await verifyOne("HomepadHybridHook", "contracts/HomepadHybridHook.sol", A.hook, ["address", "address"], args.hook);
  await verifyOne("ArcPadFactoryRH", "contracts/ArcPadFactoryRH.sol", A.factory, ["address", "address", "address", "address", "int24", "uint16", "uint16", "uint16", "uint256"], args.factory);
  await verifyOne("ArcPadRouterRH", "contracts/ArcPadRouterRH.sol", A.router, ["address", "address"], args.router);
  await verifyOne("ArcLaunchDropRH", "contracts/ArcLaunchDropRH.sol", A.drop, ["address", "uint256", "address", "address"], args.drop);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
