// ARC GALAXY's feed (api/_arc-galaxy.mjs): classification of Arc transactions, the rolling window, the shared read
import { classify, makeGalaxy, KINDS, USDC, LABELS, WINDOW_MS, MAX_BLOCKS } from "../../api/_arc-galaxy.mjs";
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const K = Object.fromEntries(KINDS.map((k, i) => [k, i]));
const pad = (h, n = 64) => h.replace(/^0x/, "").padStart(n, "0");
const A = "0x" + "a".repeat(40), B = "0x" + "b".repeat(40), C = "0x" + "c".repeat(40);
const T = { transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", v4: "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f" };
const usdcLog = (cents) => ({ address: USDC, topics: [T.transfer, "0x" + pad(A), "0x" + pad(B)], data: "0x" + pad((BigInt(cents) * 10000n).toString(16)) });
const rc = (logs, ok = true) => ({ status: ok ? "0x1" : "0x0", logs });

// classification
ok(classify({ to: null, input: "0x6080" }, rc([])).k === K.deploy, "a deployment");
let c = classify({ to: USDC, input: "0xa9059cbb" + pad(B) + pad((1234500000n).toString(16)), value: "0x0" }, rc([usdcLog(123450)]));
ok(c.k === K.usdc && c.usd === 123450 && c.ok === 1, "a USDC transfer: $1,234.50 from its log");
c = classify({ to: USDC, input: "0xa9059cbb" + pad(B) + pad((2500000n).toString(16)), value: "0x0" }, null);
ok(c.k === K.usdc && c.usd === 250 && c.ok === -1, "without a receipt: the amount read from the call, status not known");
c = classify({ to: B, input: "0x", value: "0x" + (5n * 10n ** 18n).toString(16) }, rc([]));
ok(c.k === K.usdc && c.usd === 500, "native USDC (18 decimals) between wallets");
c = classify({ to: B, input: "0x", value: "0x" + (5n * 10n ** 18n).toString(16) }, rc([usdcLog(500)]));
ok(c.usd === 500, "native value + its own Transfer log isn't counted twice");
ok(classify({ to: "0x8366a39cc670b4001a1121b8f6a443a643e40951", input: "0x12345678" }, rc([{ address: C, topics: [T.v4] }, usdcLog(100)])).k === K.swap, "a swap through the v4 PoolManager");
ok(classify({ to: C, input: "0x12345678" }, rc([{ address: C, topics: [T.v4] }])).k === K.swap, "a swap seen in the logs, any router");
ok(classify({ to: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d", input: "0x8e0250ee" }, rc([usdcLog(1000)])).k === K.bridge, "a CCTP burn = bridge");
ok(classify({ to: C, input: "0x57ecfd28" }, rc([{ address: "0x81d40f21f12a8f0e3252bccb954d722d4c464b64", topics: ["0x01"] }])).k === K.bridge, "a CCTP mint (MessageTransmitter log) = bridge");
ok(classify({ to: C, input: "0x23b872dd" + pad(A) + pad(B) + pad("1") }, rc([{ address: C, topics: [T.transfer, "0x" + pad(A), "0x" + pad(B), "0x" + pad("1")] }])).k === K.nft, "an ERC-721 transfer");
ok(classify({ to: C, input: "0xa9059cbb" + pad(B) + pad("ff") }, rc([{ address: C, topics: [T.transfer, "0x" + pad(A), "0x" + pad(B)], data: "0xff" }])).k === K.token, "another token's transfer");
ok(classify({ to: C, input: "0x095ea7b3" + pad(B) + pad("ff") }, rc([])).k === K.approve, "an approval");
ok(classify({ to: C, input: "0xdeadbeef" }, rc([], false)).ok === 0, "a failed call");
ok(classify({ to: C, input: "0xdeadbeef" }, rc([])).k === K.call, "anything else: a contract call");
ok(LABELS[USDC][0] === "USDC" && LABELS["0x28b5a0e9c621a5badaa536219b3a228c8168cf5d"][1] === "circle", "labels");

// the feed over a fake chain: 0.5 s blocks, 3 txs a block, receipts supported
const t0 = 1_800_000_000_000;
let clock = t0, head = 1000, calls = 0, receiptsOk = true;
const blk = (n) => ({ number: "0x" + n.toString(16), timestamp: "0x" + Math.floor((t0 + (n - 1000) * 500) / 1000).toString(16), gasUsed: "0x5208",
  transactions: [0, 1, 2].map((i) => ({ hash: "0x" + pad(n.toString(16) + i, 64), from: A, to: i === 0 ? USDC : i === 1 ? C : null, input: i === 0 ? "0xa9059cbb" + pad(B) + pad((1000000n).toString(16)) : "0xdeadbeef", value: "0x0" })) });
const rcs = (n) => blk(n).transactions.map((tx, i) => ({ transactionHash: tx.hash, status: i === 1 ? "0x0" : "0x1", logs: i === 0 ? [usdcLog(100)] : [] }));
const rpc = async (body) => {
  calls++;
  const one = (q) => {
    if (q.method === "eth_blockNumber") return { id: q.id, result: "0x" + head.toString(16) };
    const n = Number(q.params[0]);
    if (q.method === "eth_getBlockByNumber") return { id: q.id, result: n <= head ? blk(n) : null };
    if (q.method === "eth_call") { const sel = q.params[0].data, to = q.params[0].to; if (to !== C) return { id: q.id, result: "0x" }; const str = (x) => "0x" + pad("20") + pad(x.length.toString(16)) + Buffer.from(x).toString("hex").padEnd(64, "0"); return { id: q.id, result: sel === "0x95d89b41" ? str("PEPE") : sel === "0x06fdde03" ? str("Pepe Token") : "0x" + pad("12") }; }
    if (q.method === "eth_getBlockReceipts") return receiptsOk ? { id: q.id, result: rcs(n) } : { id: q.id, error: { message: "the method eth_getBlockReceipts does not exist" } };
  };
  return Array.isArray(body) ? body.map(one) : one(body);
};
const mem = new Map(), memStore = { async get(ps) { return Object.fromEntries(ps.map((x) => [x, mem.get(x) || null])); }, async set(x, d) { mem.set(x, d); } };
const noEx = async () => null;
const g = makeGalaxy({ rpc, now: () => clock, store: memStore, explorer: noEx });
let out = await g.live();
ok(out.head === 1000 && out.blocks.length === 100 && out.rows.length === 300, "a cold start reads the last BACKFILL blocks");
ok(out.stats.kinds[K.usdc] === 100 && out.stats.kinds[K.deploy] === 100 && out.stats.kinds[K.call] === 100, "kinds counted");
ok(Math.abs(out.stats.failRate - 1 / 3) < 1e-9, "a third failed");
ok(out.stats.usd10m === 10000, "USDC moved: 100 × $1");
ok(out.labels[USDC] && out.top[0][0] === C && out.top[0][1] === 100, "the busiest contract and the labels of what appears");
ok(out.stats.tps > 5.9 && out.stats.tps < 6.2, "≈ 6 tx/s from the block times");
const before = calls; await g.live(); ok(calls === before, "a call within the gap shares the read");
clock += 1000; head += 4; out = await g.live();
ok(out.head === 1004 && out.blocks.length === 104 && out.rows.length === 312, "the next call reads only the 4 new blocks");
// rows outside the window aren't sent, blocks older than ten minutes are let go
clock += 2000; head += Math.ceil(WINDOW_MS / 500) + 10; out = await g.live();
ok(out.rows.every((r) => r[8] >= out.at - WINDOW_MS - 60e3), "rows only from the window");
ok(out.blocks.length <= MAX_BLOCKS + 104, "asleep too long → starts over with the last MAX_BLOCKS");
// an RPC without eth_getBlockReceipts: status not known, nothing breaks
receiptsOk = false;
const g2 = makeGalaxy({ rpc, now: () => clock, store: { async get() { return {}; }, async set() {} }, explorer: noEx });
out = await g2.live(); clock += 1000; head += 2; out = await g2.live();
ok(out.receipts === false && out.rows.slice(-3).every((r) => r[6] === -1), "no receipts → ok -1");
ok(out.rows.slice(-3)[0][5] === 100, "the USDC amount still read from the call");
// a failing RPC after a good read keeps the last answer, marked stale
const g3 = makeGalaxy({ rpc: async (b) => { if (bad) throw new Error("rpc 503"); return rpc(b); }, now: () => clock, store: { async get() { return {}; }, async set() {} }, explorer: noEx });
let bad = false; receiptsOk = true; await g3.live(); clock += 1500; bad = true; out = await g3.live();
ok(out.stale && /503/.test(out.err) && out.rows.length > 0, "a failed read keeps the last answer (stale)");

// wired: the route, the page and its rewrite
const soc = fs.readFileSync(new URL("../../api/social.mjs", import.meta.url), "utf8"), vj = JSON.parse(fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
ok(/searchParams\.get\("arc"\) === "galaxy"/.test(soc) && /_arc-galaxy\.mjs/.test(soc), "the route in api/social.mjs");
ok((vj.rewrites || []).some((r) => r.source === "/galaxy" && r.destination === "/galaxy.html"), "/galaxy rewrite");
ok(fs.existsSync(new URL("../../galaxy.html", import.meta.url)) && fs.existsSync(new URL("../../galaxy.js", import.meta.url)), "the page's files");
{ const h = fs.readFileSync(new URL("../../galaxy.html", import.meta.url), "utf8");
  ok(/og:image" content="https:\/\/www\.arcircle\.app\/images\/galaxy\/og-card\.jpg"/.test(h) && /twitter:image" content="https:\/\/www\.arcircle\.app\/images\/galaxy\/og-card\.jpg"/.test(h) && /summary_large_image/.test(h), "the X card: og + twitter image tags");
  ok(fs.statSync(new URL("../../images/galaxy/og-card.jpg", import.meta.url)).size < 300000, "the card's picture < 300 KB"); }
// GX1: names, the snapshot, the day
{
  ok(out.labels && true, "labels present");
  const t1 = makeGalaxy({ rpc, now: () => clock, store: memStore, explorer: noEx });
  head = 5000; clock = t0 + 4000 * 500; receiptsOk = true;
  let o = await t1.live();
  ok(o.labels[C] && o.labels[C][0] === "PEPE · Pepe Token" && o.labels[C][1] === "token", "an unlabelled ERC-20 gets its symbol · name");
  ok(mem.get("arcGalaxyName/" + C) && mem.get("arcGalaxyName/" + C).n === "PEPE · Pepe Token", "the name is kept in the store");
  ok(mem.get("arcGalaxy/snap") && JSON.parse(mem.get("arcGalaxy/snap").j).rows.length > 0, "a snapshot is saved");
  // a cold start with a slow chain answers from the snapshot (warming)
  const slow = async (b) => { await new Promise((r) => setTimeout(r, 3200)); return rpc(b); };
  const t2 = makeGalaxy({ rpc: slow, now: () => clock, store: memStore, explorer: noEx });
  const s0 = Date.now(); o = await t2.live();
  ok(o.warming && o.rows.length > 0 && Date.now() - s0 < 3100, "a cold start serves the snapshot while the first read runs");
  ok(o.labels[C] && o.labels[C][0].startsWith("PEPE"), "names come back with the snapshot");
  const d = await t1.day();
  ok(Array.isArray(d.minutes) && d.minutes.length > 0 && d.minutes.every((m) => m.length === 4), "the day's minutes");
}
console.log(`galaxy: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
