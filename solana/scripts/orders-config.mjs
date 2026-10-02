// ARCIRCLE Orders on Solana — set up or change the program's config, from a terminal (no npm install: it uses the
// server's bundled Solana kit, api/_solkit.mjs).
//
//   node solana/scripts/orders-config.mjs init --program <ID> --admin <keypair.json> --keeper <PUBKEY> --treasury <PUBKEY> [--fee 10] [--cap 5] [--rpc URL]
//   node solana/scripts/orders-config.mjs set  --program <ID> --admin <keypair.json> [--keeper P] [--fee N] [--cap SOL] [--pause | --resume]
//   node solana/scripts/orders-config.mjs show --program <ID> [--rpc URL]
//
// init must be signed by the program's upgrade authority (the wallet that deployed it). --keeper is the keeper's public
// key (its secret goes in Vercel as ORDERS_KEEPER_SOL_KEY); "open" lets anyone fill. --cap is the most SOL one order may
// move (0 = no cap). The keypair file stays on your machine: this script only signs with it.
import fs from "node:fs";
import { web3, spl, ordersSol } from "../../api/_solkit.mjs";

const args = process.argv.slice(2), cmd = args[0];
const opt = (k, d = null) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true; };
const RPC = opt("rpc", process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com");
const die = (m) => { console.error(m); process.exit(1); };
if (!["init", "set", "show"].includes(cmd)) die("usage: init | set | show  (see the top of this file)");
const program = opt("program") || die("--program <ID> is needed");
const O = ordersSol({ web3, spl, programId: program });
async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message + (j.error.data && j.error.data.logs ? "\n" + j.error.data.logs.join("\n") : ""));
  return j.result;
}
async function readConfig() {
  const a = await rpc("getAccountInfo", [O.configPda.toBase58(), { encoding: "base64", commitment: "confirmed" }]);
  return a && a.value ? O.decodeConfig(Buffer.from(a.value.data[0], "base64")) : null;
}
async function send(ixs, signer) {
  const bh = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const tx = new web3.Transaction({ feePayer: signer.publicKey, recentBlockhash: bh.value.blockhash }).add(...ixs);
  tx.sign(signer);
  const sig = await rpc("sendTransaction", [tx.serialize().toString("base64"), { encoding: "base64", preflightCommitment: "confirmed" }]);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = (await rpc("getSignatureStatuses", [[sig]])).value[0];
    if (st && st.err) throw new Error("failed: " + JSON.stringify(st.err) + " " + sig);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
  }
  throw new Error("not confirmed yet: " + sig);
}
const keyOf = (v, name) => { if (v === "open") return web3.PublicKey.default; try { return new web3.PublicKey(v); } catch { die(`--${name} must be a public key`); } };
const show = (c) => console.log(c ? { admin: c.admin, keeper: c.keeper === web3.PublicKey.default.toBase58() ? "open (anyone may fill)" : c.keeper, treasury: c.treasury, treasuryWsol: c.treasuryWsol, feeBps: c.feeBps, capSol: Number(c.maxIn) / 1e9, paused: c.paused } : "no config yet");

if (cmd === "show") { show(await readConfig()); process.exit(0); }
const adminPath = opt("admin") || die("--admin <keypair.json> is needed");
const admin = web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(adminPath, "utf8"))));
const lam = (sol) => BigInt(Math.round(Number(sol) * 1e9));
if (cmd === "init") {
  if (await readConfig()) die("the config already exists — use `set`");
  const keeper = keyOf(opt("keeper") || die("--keeper <PUBKEY|open> is needed"), "keeper");
  const treasury = keyOf(opt("treasury") || die("--treasury <PUBKEY> is needed"), "treasury");
  const tW = spl.getAssociatedTokenAddressSync(spl.NATIVE_MINT, treasury, true);
  const sig = await send([
    spl.createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, tW, treasury, spl.NATIVE_MINT),
    O.initConfig({ admin: admin.publicKey, treasuryWsol: tW, keeper, feeBps: Number(opt("fee", 10)), maxIn: lam(opt("cap", 5)) }),
  ], admin);
  console.log("config set:", sig);
  show(await readConfig());
} else {
  const c = await readConfig() || die("no config yet — run `init` first");
  const keeper = opt("keeper") ? keyOf(opt("keeper"), "keeper") : new web3.PublicKey(c.keeper);
  const paused = opt("pause") ? true : opt("resume") ? false : c.paused;
  const sig = await send([O.setConfig({ admin: admin.publicKey, keeper, feeBps: Number(opt("fee", c.feeBps)), maxIn: opt("cap") != null ? lam(opt("cap")) : c.maxIn, paused, newAdmin: opt("new-admin") ? keyOf(opt("new-admin"), "new-admin") : admin.publicKey })], admin);
  console.log("config changed:", sig);
  show(await readConfig());
}
