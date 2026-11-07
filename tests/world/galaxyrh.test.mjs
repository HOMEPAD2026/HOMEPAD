// ARC GALAXY on Robinhood Chain (GXR): the money rules (ETH priced live, USDG), the ArbOS system tx, the feed instance, the page
import { classify, classifyWith, evmMoney, KINDS, makeGalaxy, RH_MONEY, ROBINHOOD } from "../../api/_arc-galaxy.mjs";
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const K = Object.fromEntries(KINDS.map((k, i) => [k, i]));
const hx = (n) => "0x" + BigInt(n).toString(16);
const pad = (h) => h.replace(/^0x/, "").padStart(64, "0");
(async () => {
  // ---- Robinhood Chain money: ETH priced live, the ArbOS system tx skipped, Arc unchanged
  const M = evmMoney({ usdc: "0x" + "u".padStart(40, "0").replace("u", "a"), px: () => 3500, skip: (tx) => tx.type === "0x6a" });
  ok(classifyWith(M, { type: "0x6a", to: "0x00000000000000000000000000000000000a4b05", input: "0x" }, null) === null, "the ArbOS start-of-block tx is no one's transaction");
  const eth = classifyWith(M, { to: "0x" + "b".repeat(40), input: "0x", value: hx(10n ** 18n) }, { status: "0x1", logs: [], gasUsed: hx(21000), effectiveGasPrice: hx(10n ** 7n) });
  ok(eth.k === K.usdc && eth.usd === 350000, "1 ETH sent = $3,500.00 (value transfer)");
  ok(eth.fee === Math.round(21000 * 1e7 / 1e18 * 3500 * 1e6), "the fee: 21,000 gas × 0.01 gwei at $3,500 = " + eth.fee + " µ$");
  const noPx = evmMoney({ px: () => null });
  ok(classifyWith(noPx, { to: "0x" + "b".repeat(40), input: "0x", value: hx(10n ** 18n) }, null).usd === 0, "no ETH price yet → no dollar value (not a guess)");
  ok(classifyWith(noPx, { to: null, input: "0x6080" }, null).k === K.deploy, "an empty USDC address never matches a deployment's empty 'to'");
  const arcNative = classify({ to: "0x" + "b".repeat(40), input: "0x", value: hx(5n * 10n ** 18n) }, null);
  ok(arcNative.usd === 500, "Arc's own rule unchanged: native 18-decimal USDC");
  // the Robinhood Chain feed: its own instance, the skip + bridge rules, the page dressed for it
  const ag = fs.readFileSync(new URL("../../api/_arc-galaxy.mjs", import.meta.url), "utf8"), gj = fs.readFileSync(new URL("../../galaxy.js", import.meta.url), "utf8");
  ok(/net === "robinhood" \? \(rh \|\| \(rh = makeGalaxy\(\{ rpc: rhRpc/.test(ag) && /key: "rhGalaxy"/.test(ag), "?net=robinhood → its own galaxy (own store keys)");
  { const { RH_MONEY, ROBINHOOD } = await import("../../api/_arc-galaxy.mjs");
    ok(classifyWith(RH_MONEY, { type: "0x6a", to: "0x00000000000000000000000000000000000a4b05", input: "0x" }, null) === null, "RH: the ArbOS system tx skipped");
    const dep = classifyWith(RH_MONEY, { type: "0x64", to: "0x" + "b".repeat(40), input: "0x", value: "0x0" }, null);
    ok(dep.k === K.bridge && dep.br === "i" + ROBINHOOD.parentDomain, "RH: an Arbitrum deposit = bridge in");
    const wd = classifyWith(RH_MONEY, { type: "0x2", to: ROBINHOOD.arbsys, input: "0x25e16063", value: "0x0" }, null);
    ok(wd.k === K.bridge && wd.br[0] === "o", "RH: ArbSys = bridge out"); }
  ok(/const RH = NET === "robinhood"/.test(gj) && /RHW = \{/.test(gj) && /href="\/galaxy" class=/.test(gj) && /href="\/galaxy\/arena"/.test(gj), "the page: Robinhood words, the net switch, the Arena link");
  for (const L of ["ko", "zh", "tr"]) { const en = gj.slice(gj.indexOf("  en: { tag: \"Every transaction on Robinhood"), gj.indexOf("},", gj.indexOf("  en: { tag: \"Every transaction on Robinhood"))); const bl = gj.slice(gj.indexOf(`  ${L}: { tag:`), gj.indexOf("},", gj.indexOf(`  ${L}: { tag:`))); const miss = [...en.matchAll(/(\w+): "/g)].map((x) => x[1]).filter((k) => !new RegExp("[{ ]" + k + ": \"").test(bl)); ok(!miss.length, "RH words " + L + ": " + miss.join(",")); }

  // a feed read end to end on a fake Robinhood Chain: 3 blocks, each with the ArbOS tx + an ETH send + a USDG transfer
  const USDG = ROBINHOOD.usdc, A = "0x" + "a".repeat(40), B = "0x" + "b".repeat(40);
  const blk = (n) => ({ number: hx(n), timestamp: hx(1794050000 + Math.floor(n / 10)), gasUsed: "0x0", transactions: [
    { hash: "0x" + pad("a" + n), type: "0x6a", from: "0x00000000000000000000000000000000000a4b05", to: "0x00000000000000000000000000000000000a4b05", input: "0x6bf6a42d", value: "0x0" },
    { hash: "0x" + pad("b" + n), type: "0x2", from: A, to: B, input: "0x", value: hx(10n ** 17n) },
    { hash: "0x" + pad("c" + n), type: "0x2", from: B, to: USDG, input: "0xa9059cbb" + pad(A) + pad((25n * 10n ** 6n).toString(16)), value: "0x0" },
  ] });
  const rcs = (n) => blk(n).transactions.map((t, i) => ({ transactionHash: t.hash, status: "0x1", gasUsed: hx(i ? 50000 : 0), effectiveGasPrice: hx(2n * 10n ** 7n),
    logs: i === 2 ? [{ address: USDG, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "0x" + pad(B), "0x" + pad(A)], data: "0x" + pad((25n * 10n ** 6n).toString(16)) }] : [] }));
  const rpc = async (body) => { const one = (q) => q.method === "eth_blockNumber" ? { id: q.id, result: hx(102) } : q.method === "eth_getBlockByNumber" ? { id: q.id, result: blk(Number(q.params[0])) } : q.method === "eth_getBlockReceipts" ? { id: q.id, result: rcs(Number(q.params[0])) } : { id: q.id, result: "0x" }; return Array.isArray(body) ? body.map(one) : one(body); };
  let px = 3000;
  const M2 = evmMoney({ usdc: USDG, px: () => px, skip: (tx) => tx.type === "0x6a" });
  const G = makeGalaxy({ rpc, cls: (tx, rc) => classifyWith(M2, tx, rc), chain: 4663, key: "rhTest", backfill: 3, maxBlocks: 10, batch: 20, store: { get: async () => ({}), set: async () => {} }, now: () => 1794050020000 });
  const o = await G.live();
  ok(o.chain === 4663 && o.stats.txs === 6, "6 user txs from 3 blocks (the ArbOS tx left out): " + o.stats.txs);
  ok(o.rows.every((r) => r[2] !== "0x00000000000000000000000000000000000a4b05"), "no row from ArbOS");
  ok(o.stats.usd10m === 3 * (30000 + 2500), "value: 0.1 ETH at $3,000 + $25 USDG, three times = $975.00");
  ok(o.stats.fee10m === 6 * Math.round(50000 * 2e7 / 1e18 * 3000 * 1e6), "fees in µ$ at the ETH price");
  ok(o.rows.filter((r) => r[4] === K.usdc).length === 6, "both kinds of send are 'ETH / USDG transfer'");
  // rates only over back-to-back blocks: a gap between reads isn't idle chain time
  { const G2 = makeGalaxy({ rpc: async (body) => { const one = (q) => q.method === "eth_blockNumber" ? { id: q.id, result: hx(head2) } : q.method === "eth_getBlockByNumber" ? { id: q.id, result: blk(Number(q.params[0])) } : q.method === "eth_getBlockReceipts" ? { id: q.id, result: rcs(Number(q.params[0])) } : { id: q.id, result: "0x" }; return Array.isArray(body) ? body.map(one) : one(body); }, cls: (tx, rc) => classifyWith(M2, tx, rc), chain: 4663, key: "rhGap", backfill: 20, maxBlocks: 20, batch: 20, store: { get: async () => ({}), set: async () => {} }, now: () => clk });
    var head2 = 200, clk = 1794050020000; await G2.live(); head2 = 900; clk += 2000; const o2 = await G2.live(); // blocks 181–200, then a jump to 881–900
    ok(o2.stats.blockTime > 0.05 && o2.stats.blockTime < 0.2, "block time over back-to-back blocks ≈ 0.1 s, not the gap: " + o2.stats.blockTime);
    ok(o2.stats.tps > 15 && o2.stats.tps < 30, "tx/s ≈ 20 (2 a block, 10 blocks a second) despite the gap: " + o2.stats.tps); }
  console.log(`galaxyrh: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
