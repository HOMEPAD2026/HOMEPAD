// Verifies ARCIRCLE PAD's Arc mainnet contracts on ArcScan (arc.etherscan.io)
// through Etherscan's v2 API — the factory, hook, router, CirclePad escrow and vote, the creator lock and
// every coin launched on ArcPad (each LaunchToken).
//
// No private key needed. Every constructor argument is read back from the
// deployed contracts themselves, so nothing has to be copied from a deploy log.
//
//   cd contracts
//   npm ci                       # once
//   npx hardhat compile          # builds artifacts/build-info (same settings as the deploy)
//   ARC_ETHERSCAN_API_KEY=<key> node scripts/verify-arc.js            # everything
//   ARC_ETHERSCAN_API_KEY=<key> node scripts/verify-arc.js --dry-run  # checks only, sends nothing
//   ARC_ETHERSCAN_API_KEY=<key> node scripts/verify-arc.js --only=factory,hook,router,escrow,rounds,vote,burnvote,lplock,lock,tokens,agent,orders
//   ARC_ETHERSCAN_API_KEY=<key> node scripts/verify-arc.js --only=rounds   # CirclePad Round #2, #3, … escrows (list from arcircle.app)
//   (agent = ARCIA AGENT's factory and every vault it opened; their constructor arguments are read from the
//   events of the transactions that created them)
//
// Get a free key at https://etherscan.io/myapikey (one key covers every chain
// on Etherscan's v2 API, Arc included). Optional: ARC_MAINNET_RPC to read the
// chain through a different endpoint.
//
// Before sending anything, the script compares the metadata hash at the end
// of each deployed contract's code with the one your local compile produced.
// If they differ, the local source/settings aren't what was deployed and
// ArcScan would reject it — it says so and skips that contract.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const CHAIN_ID = 5042;
const API = `https://api.etherscan.io/v2/api?chainid=${CHAIN_ID}`;
const EXPLORER = "https://arc.etherscan.io";
const RPC = process.env.ARC_MAINNET_RPC || "https://rpc.mainnet.arc.io";
const KEY = process.env.ARC_ETHERSCAN_API_KEY || "";
const DRY = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);

const ADDR = {
  factory: "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E",
  hook: "0x484D416E73Eb44d276DDeF04cDBAdf2f4907c044",
  router: "0xFCA8fD788d44Bb335B1451257366e06D67114785",
  escrow: "0xC5998d7cE728FDd6f77217fdE775aAb90Ec61703",
  vote: "0x23c376615a58F059FC4bc83A38eB4aCdF8d39ff2",
  lplock: "0x674E7010Dab5cCb519e06df72b1D4c063952f45B",
  burnvote: "0x54121a7894d90a02eA973Ab45EEF424C2716EeB2", // ArcircleBurnVote (CirclePad burn-to-vote)
  lock: "0x64F893947Fe2c4fe7058CFba899eA269CBa9F006",
  agent: "0x5eb92464AEB3bCB9fA6e6065EE05131cdBbfB4b9", // ArciaAgentFactory (ARCIA AGENT burn vaults)
  agentBlock: 23531741, // its deploy block
  orders: "0x1A31C2539d6e3fBdF276E8D74bA67aEc4De9008e", // ArcircleOrders (ARCIRCLE Orders)
  feeBurn: "0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034", // ArcircleFeeBurn (its fees, the $ARCIRCLE burn, the fee-free policy)
  feeBurnBlock: 23739974,
};
const ART = path.join(__dirname, "..", "artifacts");

function artifact(source, name) {
  const dir = path.join(ART, "contracts", source);
  const a = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
  const dbg = JSON.parse(fs.readFileSync(path.join(dir, `${name}.dbg.json`), "utf8"));
  const bi = JSON.parse(fs.readFileSync(path.resolve(dir, dbg.buildInfo), "utf8"));
  return { abi: a.abi, deployed: a.deployedBytecode, input: bi.input, compiler: "v" + bi.solcLongVersion, fq: `contracts/${source}:${name}` };
}
/// The CBOR metadata blob solc appends to runtime code (its length is the last 2 bytes).
function metaTail(code) {
  const h = String(code).replace(/^0x/, "");
  if (h.length < 4) return "";
  const len = parseInt(h.slice(-4), 16);
  return h.slice(-(len * 2 + 4));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, method = "GET") {
  const body = new URLSearchParams({ ...params, apikey: KEY });
  const url = method === "GET" ? `${API}&${body}` : API;
  const r = await fetch(url, method === "GET" ? {} : { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({ status: "0", result: `HTTP ${r.status}` }));
  return j;
}
async function alreadyVerified(address) {
  const j = await api({ module: "contract", action: "getsourcecode", address });
  const row = Array.isArray(j.result) ? j.result[0] : null;
  return !!(row && row.SourceCode);
}

async function verify(provider, { label, address, art, args }) {
  process.stdout.write(`\n${label}  ${address}\n`);
  const code = await provider.getCode(address);
  if (!code || code === "0x") { console.log("  ✗ no contract at this address"); return "missing"; }
  if (metaTail(code) !== metaTail(art.deployed)) {
    console.log("  ✗ metadata hash differs from your local compile — the source or compiler settings");
    console.log("    in this repo are not exactly what was deployed. Skipped (ArcScan would reject it).");
    return "mismatch";
  }
  const ctor = art.abi.find((x) => x.type === "constructor");
  const encoded = ctor && ctor.inputs.length ? ethers.AbiCoder.defaultAbiCoder().encode(ctor.inputs.map((i) => ethers.ParamType.from(i)), args).slice(2) : "";
  console.log(`  source matches · ${art.fq} · ${art.compiler}`);
  if (ctor && ctor.inputs.length) console.log(`  constructor: ${ctor.inputs.map((i, k) => `${i.name}=${args[k]}`).join(", ")}`);
  if (!KEY) { console.log("  (no ARC_ETHERSCAN_API_KEY — stopping before the API)"); return "nokey"; }
  if (await alreadyVerified(address)) { console.log("  ✓ already verified"); return "done"; }
  if (DRY) { console.log("  (dry run — not submitted)"); return "dry"; }
  const sub = await api({
    module: "contract", action: "verifysourcecode", codeformat: "solidity-standard-json-input",
    sourceCode: JSON.stringify(art.input), contractaddress: address, contractname: art.fq,
    compilerversion: art.compiler, constructorArguements: encoded,
  }, "POST");
  if (String(sub.status) !== "1") {
    if (/already verified/i.test(String(sub.result))) { console.log("  ✓ already verified"); return "done"; }
    console.log("  ✗ submit failed:", sub.result); return "fail";
  }
  for (let k = 0; k < 30; k++) {
    await sleep(4000);
    const st = await api({ module: "contract", action: "checkverifystatus", guid: sub.result });
    const msg = String(st.result);
    if (/pending/i.test(msg)) continue;
    if (/pass|verified/i.test(msg)) { console.log(`  ✓ ${msg} — ${EXPLORER}/address/${address}#code`); return "done"; }
    console.log("  ✗", msg); return "fail";
  }
  console.log("  … still pending — check later on", `${EXPLORER}/address/${address}#code`);
  return "pending";
}

async function main() {
  if (!fs.existsSync(path.join(ART, "build-info"))) throw new Error("No artifacts yet — run `npx hardhat compile` in contracts/ first.");
  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const want = (k) => !ONLY.length || ONLY.includes(k);
  const results = [];

  const fArt = artifact("HomepadFactoryArc.sol", "HomepadFactoryArc");
  const factory = new ethers.Contract(ADDR.factory, fArt.abi, provider);
  if (want("factory")) {
    const args = await Promise.all(["platformTreasury", "platformWallet", "poolManager", "hook", "tickSpacing", "baseFeeBps", "creatorShareBps", "platformShareBps"].map((m) => factory[m]()));
    results.push(await verify(provider, { label: "HomepadFactoryArc", address: ADDR.factory, art: fArt, args }));
  }
  if (want("hook")) {
    const hArt = artifact("HomepadHybridHook.sol", "HomepadHybridHook");
    const hook = new ethers.Contract(ADDR.hook, hArt.abi, provider);
    const args = [await hook.poolManager(), await hook.deployer()];
    results.push(await verify(provider, { label: "HomepadHybridHook", address: ADDR.hook, art: hArt, args }));
  }
  if (want("router")) {
    const rArt = artifact("HomepadArcSwapRouter.sol", "HomepadArcSwapRouter");
    const router = new ethers.Contract(ADDR.router, rArt.abi, provider);
    const args = [await router.poolManager(), await router.factory()];
    results.push(await verify(provider, { label: "HomepadArcSwapRouter", address: ADDR.router, art: rArt, args }));
  }
  if (want("escrow")) {
    const eArt = artifact("BigPadEscrow.sol", "BigPadEscrow");
    const esc = new ethers.Contract(ADDR.escrow, eArt.abi, provider);
    const args = [await esc.recipient(), await esc.platformWallet(), await esc.treasuryWallet(), await esc.cap()];
    results.push(await verify(provider, { label: "BigPadEscrow (CirclePad round #1)", address: ADDR.escrow, art: eArt, args }));
  }
  // every later round's escrow (Round #2, #3, …): the same BigPadEscrow code, deployed by the round wallet from /circle.
  // The list comes from the site (the rounds registry); ROUND_ESCROWS=0x…,0x… overrides it.
  if (want("rounds")) {
    const eArt = artifact("BigPadEscrow.sol", "BigPadEscrow");
    let list = String(process.env.ROUND_ESCROWS || "").split(",").map((x) => x.trim()).filter(Boolean).map((e, i) => ({ n: "?", escrow: e }));
    if (!list.length) {
      try {
        const js = await (await fetch("https://www.arcircle.app/api/social?circle=boot")).text();
        const v = JSON.parse(js.replace(/^\s*window\.CP_ROUNDS\s*=\s*/, "").replace(/;\s*$/, ""));
        list = ((v && v.list) || []).filter((r) => r.n > 1);
      } catch (e) { console.log("  couldn't read the rounds list from arcircle.app — set ROUND_ESCROWS=0x…,0x…"); }
    }
    for (const r of list) {
      if (!ethers.isAddress(r.escrow)) continue;
      const esc = new ethers.Contract(r.escrow, eArt.abi, provider);
      const args = [await esc.recipient(), await esc.platformWallet(), await esc.treasuryWallet(), await esc.cap()];
      results.push(await verify(provider, { label: `BigPadEscrow (CirclePad round #${r.n})`, address: ethers.getAddress(r.escrow), art: eArt, args }));
    }
  }
  if (want("vote")) {
    const vArt = artifact("BigPadVote.sol", "BigPadVote");
    const v = new ethers.Contract(ADDR.vote, vArt.abi, provider);
    results.push(await verify(provider, { label: "BigPadVote (CirclePad round #1 governance)", address: ADDR.vote, art: vArt, args: [await v.escrow()] }));
  }
  if (want("lplock")) {
    const pArt = artifact("ArcLPLock.sol", "ArcLPLock");
    const lp = new ethers.Contract(ADDR.lplock, pArt.abi, provider);
    results.push(await verify(provider, { label: "ArcLPLock (LP position locks)", address: ADDR.lplock, art: pArt, args: [await lp.positionManager()] }));
  }
  if (want("burnvote") && ADDR.burnvote) {
    const bArt = artifact("ArcircleBurnVote.sol", "ArcircleBurnVote");
    const bv = new ethers.Contract(ADDR.burnvote, bArt.abi, provider);
    results.push(await verify(provider, { label: "ArcircleBurnVote (1,000 $ARCIRCLE burned per vote)", address: ADDR.burnvote, art: bArt, args: [await bv.ballot(), await bv.token(), 0, 0] }));
  }
  if (want("lock")) {
    const lArt = artifact("ArcLock.sol", "ArcLock");
    results.push(await verify(provider, { label: "ArcLock (creator locks)", address: ADDR.lock, art: lArt, args: [] }));
  }
  if (want("tokens")) {
    const tArt = artifact("LaunchToken.sol", "LaunchToken");
    const supply = await factory.DEFAULT_SUPPLY();
    const n = Number(await factory.launchCount());
    for (let i = 0; i < n; i++) {
      const l = await factory.launches(i);
      const tok = new ethers.Contract(l.token, tArt.abi, provider);
      const [name, symbol] = await Promise.all([tok.name(), tok.symbol()]);
      results.push(await verify(provider, { label: `LaunchToken #${i + 1} $${symbol}`, address: l.token, art: tArt, args: [name, symbol, supply, ADDR.factory] }));
      await sleep(600); // stay under the free API tier's rate limit
    }
  }
  if (want("agent") && ADDR.agent) {
    const aArt = artifact("ArciaAgent.sol", "ArciaAgentFactory"), vArt = artifact("ArciaAgent.sol", "ArciaAgentVault");
    const fac = new ethers.Contract(ADDR.agent, aArt.abi, provider);
    // the owner and operator it was deployed with: the first OwnerSet / OperatorSet, emitted by the constructor
    const first = async (c, ev, from, to) => { const l = await c.queryFilter(c.filters[ev](), from, to); return l.length ? l[0].args[0] : null; };
    const fOwner = await first(fac, "OwnerSet", ADDR.agentBlock, ADDR.agentBlock);
    const fOp = await first(fac, "OperatorSet", ADDR.agentBlock, ADDR.agentBlock);
    results.push(await verify(provider, { label: "ArciaAgentFactory (ARCIA AGENT)", address: ADDR.agent, art: aArt, args: [await fac.poolManager(), await fac.usdc(), await fac.arcircle(), fOwner, fOp] }));
    const made = await fac.queryFilter(fac.filters.VaultCreated(), ADDR.agentBlock, "latest");
    for (const ev of made) {
      const v = new ethers.Contract(ev.args.vault, vArt.abi, provider);
      const b = ev.blockNumber;
      const [lim] = await v.queryFilter(v.filters.Limits(), b, b);
      const key = await v.poolKey();
      const args = [await v.poolManager(), await v.usdc(), ev.args.owner, [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks], lim.args[0], lim.args[1], lim.args[2]];
      results.push(await verify(provider, { label: `ArciaAgentVault for ${ev.args.token}`, address: ev.args.vault, art: vArt, args }));
      await sleep(600);
    }
  }
  if (want("orders") && ADDR.orders) {
    const fArt = artifact("ArcircleFeeBurn.sol", "ArcircleFeeBurn"), oArt = artifact("ArcircleOrders.sol", "ArcircleOrders");
    const fb = new ethers.Contract(ADDR.feeBurn, fArt.abi, provider);
    // the operator and threshold it was deployed with: the constructor's OperatorSet / DiscountSet
    const firstArg = async (ev) => { const l = await fb.queryFilter(fb.filters[ev](), ADDR.feeBurnBlock, ADDR.feeBurnBlock); return l.length ? l[0].args[0] : null; };
    const key = await fb.poolKey();
    results.push(await verify(provider, { label: "ArcircleFeeBurn (ARCIRCLE Orders fees)", address: ADDR.feeBurn, art: fArt,
      args: [await fb.poolManager(), await fb.usdc(), await fb.arcircle(), await fb.treasury(), await fb.burnBps(), [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks], await firstArg("OperatorSet"), await firstArg("DiscountSet")] }));
    const ob = new ethers.Contract(ADDR.orders, oArt.abi, provider);
    results.push(await verify(provider, { label: "ArcircleOrders", address: ADDR.orders, art: oArt, args: [await ob.poolManager(), await ob.treasury(), await ob.permit2(), await ob.feePolicy()] }));
  }
  const tally = results.reduce((m, r) => ((m[r] = (m[r] || 0) + 1), m), {});
  console.log("\nSummary:", JSON.stringify(tally));
}

main().catch((err) => { console.error("\n✗", err.message || err); process.exit(1); });
