// CHAIN ARENA (api/_chain-arena.mjs) + the Robinhood Chain money rules (api/_arc-galaxy.mjs evmMoney / classifyWith)
import { solBlock, makeSolana, fromGalaxy, arena, SOL_USDC, VOTE } from "../../api/_chain-arena.mjs";
import { classify, classifyWith, evmMoney, KINDS } from "../../api/_arc-galaxy.mjs";
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const K = Object.fromEntries(KINDS.map((k, i) => [k, i]));
const hx = (n) => "0x" + BigInt(n).toString(16);

// ---- Solana: a block's non-vote summary
const tb = (mint, idx, amt) => ({ accountIndex: idx, mint, uiTokenAmount: { uiAmountString: String(amt) } });
const blk = { blockTime: 1794040000, transactions: [
  { transaction: { accountKeys: [{ pubkey: "V1" }, { pubkey: VOTE }] }, meta: { fee: 5000, err: null } },
  { transaction: { accountKeys: [{ pubkey: "W1", signer: true }, { pubkey: "X" }] }, meta: { fee: 10000, err: null, preTokenBalances: [tb(SOL_USDC, 1, 100), tb(SOL_USDC, 2, 0)], postTokenBalances: [tb(SOL_USDC, 1, 40), tb(SOL_USDC, 2, 60)] } },
  { transaction: { accountKeys: ["W2", "Y"] }, meta: { fee: 20000, err: { InstructionError: [0, "x"] } } },
  { transaction: { accountKeys: [{ pubkey: "W1" }] }, meta: { fee: 6000, err: null, preTokenBalances: [tb("OTHER", 1, 5)], postTokenBalances: [tb("OTHER", 1, 9)] } },
] };
const sb = solBlock(blk);
ok(sb.votes === 1 && sb.n === 3, "votes left out: 3 user txs");
ok(sb.fail === 1 && sb.fee === 36000, "failures + fees of the user txs");
ok(Math.abs(sb.usdc - 60) < 1e-9, "a USDC send counts once (the receiver's increase): $60");
ok(sb.payers.size === 2, "fee payers (string or object keys)");

// ---- Solana: the live numbers from the samples + sampled blocks
(async () => {
  let clock = 1e12, calls = 0;
  const rpc = async (m, p) => { calls++;
    if (m === "getRecentPerformanceSamples") return { result: [{ numTransactions: 6000, numNonVoteTransactions: 1500, samplePeriodSecs: 60, numSlots: 150 }, { numTransactions: 6000, numNonVoteTransactions: 1500, samplePeriodSecs: 60, numSlots: 150 }] };
    if (m === "getSlot") return { result: 1000 };
    if (m === "getBlock") { ok(p[1].maxSupportedTransactionVersion === 1, "getBlock asks for v1 transactions"); return p[0] === 997 ? { error: { code: -32007, message: "skipped" } } : { result: blk }; }
    return { error: { message: "?" } };
  };
  const S = makeSolana({ rpc, price: async () => 200, now: () => clock });
  const a = await S.live();
  ok(Math.abs(a.tps - 25) < 1e-9 && Math.abs(a.tpsAll - 100) < 1e-9, "tx/s without votes 25, with votes 100");
  ok(Math.abs(a.blockTime - 0.4) < 1e-9, "slot time 0.4 s");
  ok(a.slot === 996 && a.sampled === 1, "a skipped slot steps back");
  ok(Math.abs(a.feeUsd - (12000 / 1e9) * 200) < 1e-12, "average fee in dollars at the SOL price");
  ok(Math.abs(a.failRate - 1 / 3) < 1e-9 && a.wallets === null, "fail rate; wallets not measured");
  ok(Math.abs(a.usdMin - 60 / 0.4 * 60) < 1e-6, "USDC a minute from the sampled block");
  const c0 = calls; await S.live(); ok(calls === c0, "a second call inside 20 s is the same answer");
  clock += 21e3; await S.live(); ok(calls > c0 && S.state.blocks.length === 2, "after 20 s another block is sampled");

  // ---- the EVM feeds in the arena's shape
  const g = { at: 1, head: 9, stats: { tps: 3, tps1m: 4, blockTime: 0.5, fee10m: 6e6, feeTxs: 1000, usd10m: 60000, span: 600, failRate: 0.01, wallets: 50, txs: 1800 } };
  const f = fromGalaxy(g, "arc");
  ok(f.tps === 4 && f.feeUsd === 0.006 && f.usdMin === 60 && f.wallets === 50, "the galaxy's stats → tx/s, fee $, $/min, wallets");
  ok(fromGalaxy(null, "x") === null, "no feed → null");
  const A = await arena({ galaxy: async (n) => { if (n === "robinhood") throw new Error("down"); return g; }, solana: S });
  ok(A.chains.arc.tps === 4 && A.chains.rh.error === "down" && A.chains.sol.tps === 25, "one chain down doesn't take the arena down");

  // wiring
  const so = fs.readFileSync(new URL("../../api/social.mjs", import.meta.url), "utf8"), vj = fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8");
  ok(/arc"\) === "arena"/.test(so) && /"\/galaxy\/arena"/.test(vj), "?arc=arena + /galaxy/arena");
  const page = fs.readFileSync(new URL("../../galaxy-arena.js", import.meta.url), "utf8");
  for (const L of ["ko", "zh", "tr"]) { const blkL = page.slice(page.indexOf(`  ${L}: {`), page.indexOf("},", page.indexOf(`  ${L}: {`))); const en = page.slice(page.indexOf("const EN = {"), page.indexOf("};", page.indexOf("const EN = {"))); const miss = [...en.matchAll(/(\w+): "/g)].map((x) => x[1]).filter((k) => !new RegExp("[{ ]" + k + ": \"").test(blkL)); ok(!miss.length, "arena " + L + " has every word: " + miss.join(",")); }
  console.log(`arena: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
