// ARC GALAXY's feed (api/_arc-galaxy.mjs): classification of Arc transactions, the rolling window, the shared read
import { classify, makeGalaxy, makeViews, KINDS, USDC, LABELS, WINDOW_MS, MAX_BLOCKS } from "../../api/_arc-galaxy.mjs";
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
{ const wd = (n) => pad(n.toString(16));
  const inb = classify({ to: C, input: "0x57ecfd28" }, rc([{ address: "0x81d40f21f12a8f0e3252bccb954d722d4c464b64", topics: ["0xff48c13eda96b1cceacc6b9edeedc9e9db9d6226afbc30146b720c19d3addb1c", "0x" + pad("1")], data: "0x" + wd(6) + wd(0) + wd(0) }, usdcLog(5200000)]));
  ok(inb.k === K.bridge && inb.br === "i6" && inb.usd === 5200000, "CCTP in: from domain 6 (Base), $52,000");
  const outb = classify({ to: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d", input: "0x8e0250ee" }, rc([{ address: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d", topics: ["0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5"], data: "0x" + wd(1000000) + wd(0) + wd(0) + wd(0) }, usdcLog(100)]));
  ok(outb.k === K.bridge && outb.br === "o0", "CCTP out: to domain 0 (Ethereum)"); }
ok(classify({ to: C, input: "0x23b872dd" + pad(A) + pad(B) + pad("1") }, rc([{ address: C, topics: [T.transfer, "0x" + pad(A), "0x" + pad(B), "0x" + pad("1")] }])).k === K.nft, "an ERC-721 transfer");
ok(classify({ to: C, input: "0xa9059cbb" + pad(B) + pad("ff") }, rc([{ address: C, topics: [T.transfer, "0x" + pad(A), "0x" + pad(B)], data: "0xff" }])).k === K.token, "another token's transfer");
ok(classify({ to: C, input: "0x095ea7b3" + pad(B) + pad("ff") }, rc([])).k === K.approve, "an approval");
ok(classify({ to: C, input: "0xdeadbeef" }, rc([], false)).ok === 0, "a failed call");
{ const P1 = "0x" + "1".repeat(40), P2 = "0x" + "2".repeat(40);
  const sw = classify({ to: "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1", input: "0x24856bc3" }, rc([{ address: P1, topics: [T.v4] }, { address: P2, topics: [T.transfer, "0x" + pad(A), "0x" + pad(B)], data: "0x01" }, usdcLog(5)]));
  ok(Array.isArray(sw.route) && sw.route[0] === P1 && sw.route[1] === P2 && sw.route.length === 2, "a swap's route: the pool and the token it touched");
  const dp = classify({ to: null, input: "0x6080" }, { status: "0x1", logs: [], contractAddress: P1 });
  ok(dp.route === "c" + P1, "a deployment carries its new address"); }
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
ok(out.records && out.records.ever.block && out.records.ever.block[0] === 3 && out.records.today.usd && out.records.today.usd[0] === 100, "GX9: records — the busiest block (3 tx) and the biggest USDC move ($1) today and ever");
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
// GX6: a contract's kind from its code
{
  const G = await import("../../api/_arc-galaxy.mjs");
  const impl = "ab".repeat(20);
  const clone = "0x363d3d373d3d3d363d73" + impl + "5af43d82803e903d91602b57fd5bf3";
  ok(JSON.stringify(G.codeKind(clone, "0x" + "0".repeat(64))) === JSON.stringify({ kind: "clone", impl: "0x" + impl }), "an EIP-1167 clone and its implementation");
  ok(G.codeKind("0x6080604052" + "00".repeat(300), "0x" + "0".repeat(24) + "cd".repeat(20)).kind === "proxy", "an EIP-1967 proxy from its slot");
  ok(G.codeKind("0x608060405273ffff" + "a619486e" + "00".repeat(100), "0x" + "0".repeat(64)).kind === "safe", "a Safe proxy");
  ok(G.codeKind("0x6080604052" + "11".repeat(500), "0x" + "0".repeat(64)) === null, "plain code: no guess");
  ok(G.codeKind("0x", null) === null, "no code: nothing");
  ok(G.kindLabel({ kind: "clone", impl: "0x" + impl }, null).n === "Clone · 0xabab…abab", "clone label with a short implementation");
  ok(G.kindLabel({ kind: "proxy", impl: "0x" + impl }, ["Uniswap v4 PoolManager", "uniswap"]).g === "uniswap", "a proxy of a known contract joins its family");
  ok(G.kindLabel({ kind: "safe" }).n === "Safe wallet" && G.kindLabel({ kind: "safe" }).g === "infra", "Safe wallets join smart accounts");
}
// GX7: signed (EIP-3009) USDC payments and the fee in USDC
{
  const G = await import("../../api/_arc-galaxy.mjs");
  const p32 = (h) => String(h).replace(/^0x/, "").padStart(64, "0");
  const from = "0x" + "11".repeat(20), to = "0x" + "22".repeat(20);
  const input = "0xe3ee160e" + p32(from) + p32(to) + p32((2500000).toString(16)) + p32("0") + p32("ffffffff") + p32("ab".repeat(32)) + p32("1b") + p32("cd".repeat(32)) + p32("ef".repeat(32));
  const c1 = G.classify({ to: G.USDC, input, from: "0x" + "33".repeat(20), value: "0x0", hash: "0x" + "44".repeat(32) }, null);
  ok(c1.auth === 1 && c1.k === G.KINDS.indexOf("usdc") && c1.usd === 250, "transferWithAuthorization: a signed USDC payment, $2.50 read from the call");
  const rc = { status: "0x1", gasUsed: "0x5208", effectiveGasPrice: "0x" + (160e9).toString(16), logs: [{ address: G.USDC, topics: [G.T_AUTH_USED, "0x" + p32(from), "0x" + "99".repeat(32)], data: "0x" }, { address: G.USDC, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "0x" + p32(from), "0x" + p32(to)], data: "0x" + p32((1000000).toString(16)) }] };
  const c2 = G.classify({ to: "0x" + "55".repeat(20), input: "0x12345678", from: "0x" + "33".repeat(20), value: "0x0", hash: "0x" + "66".repeat(32) }, rc);
  ok(c2.auth === 1, "a relayer's call caught by USDC's AuthorizationUsed log");
  ok(c2.fee === 3360, "fee = gasUsed × effectiveGasPrice in millionths of a dollar (21000 × 160 gwei = $0.00336)");
  const c3 = G.classify({ to: G.USDC, input: "0xa9059cbb" + p32(to) + p32("64"), from: "0x" + "33".repeat(20), value: "0x0", hash: "0x" + "77".repeat(32) }, null);
  ok(c3.auth === 0 && c3.fee === 0, "a plain transfer is not a signed payment; no receipt, no fee");
}
// GX8: a contract's owner names its star; the contract's own page
{
  const { ethers } = await import("ethers");
  const { recoverSigner } = await import("../../api/social.mjs");
  const G = await import("../../api/_arc-galaxy.mjs");
  const owner = ethers.Wallet.createRandom(), other = ethers.Wallet.createRandom();
  const CT = "0x" + "ab".repeat(20), NOOWN = "0x" + "cd".repeat(20);
  const word = (a) => "0x" + "0".repeat(24) + a.slice(2).toLowerCase();
  const mem = new Map(), store = { get: async (ps) => Object.fromEntries(ps.filter((x) => mem.has(x)).map((x) => [x, mem.get(x)])), set: async (k, v) => { mem.set(k, JSON.parse(JSON.stringify(v))); } };
  const T0 = Date.parse("2026-11-07T04:00:00Z");
  const rpc = async (b) => { const one = (q) => q.method === "eth_call" ? { id: q.id, result: q.params[0].to === CT && q.params[0].data === "0x8da5cb5b" ? word(owner.address) : "0x" } : q.method === "eth_blockNumber" ? { id: q.id, result: "0x10" } : { id: q.id, result: null }; return Array.isArray(b) ? b.map(one) : one(b); };
  const gx = G.makeGalaxy({ rpc, now: () => T0, store, explorer: null, key: "gxt" });
  const issued = new Date(T0).toISOString();
  const sig = async (w, addr, name, iss = issued) => w.signMessage(G.claimMessage(addr, name, iss));
  let r = await gx.claim({ addr: CT, name: "Moon Arcade", issued, sig: await sig(owner, CT, "Moon Arcade") }, recoverSigner, T0);
  ok(r.ok && r.by === owner.address.toLowerCase(), "the wallet owner() returns names its star");
  ok(gx.nameOf(CT) && gx.nameOf(CT)[0] === "Moon Arcade", "the claimed name is the star's name");
  ok(mem.get("gxt/claims") && mem.get("gxt/claims").list[0].n === "Moon Arcade", "claims are kept in the store");
  r = await gx.claim({ addr: CT, name: "Not Yours", issued, sig: await sig(other, CT, "Not Yours") }, recoverSigner, T0);
  ok(r.status === 403, "another wallet can't name it");
  r = await gx.claim({ addr: NOOWN, name: "Orphan", issued, sig: await sig(owner, NOOWN, "Orphan") }, recoverSigner, T0);
  ok(r.status === 409, "no owner() → no claim");
  r = await gx.claim({ addr: CT, name: "Official USDC", issued, sig: await sig(owner, CT, "Official USDC") }, recoverSigner, T0);
  ok(r.status === 400, "brand names are reserved");
  const old = new Date(T0 - 11 * 60e3).toISOString();
  r = await gx.claim({ addr: CT, name: "Moon Arcade", issued: old, sig: await sig(owner, CT, "Moon Arcade", old) }, recoverSigner, T0);
  ok(r.status === 400, "an old signature is refused");
  r = await gx.claim({ addr: G.USDC, name: "Mine", issued, sig: await sig(owner, G.USDC, "Mine") }, recoverSigner, T0);
  ok(r.status === 409, "a labelled contract can't be renamed");
  ok(G.cleanClaimName("  Pixel   Pals ") === "Pixel Pals" && G.cleanClaimName("x") === null && G.cleanClaimName("<script>") === null, "names are cleaned");
  // a fresh instance reads the claim back from the store
  const gx2 = G.makeGalaxy({ rpc, now: () => T0, store, explorer: null, key: "gxt" }); await gx2.ready();
  ok(gx2.nameOf(CT) && gx2.nameOf(CT)[0] === "Moon Arcade", "claims survive a cold start");
  const m = gx2.pageMeta(CT);
  ok(m && m.title === "Moon Arcade on ARC GALAXY" && m.claimed, "the page's title is the star's name");
  ok(gx2.pageMeta("nope") === null, "a bad address has no page");
  const html = fs.readFileSync(new URL("../../galaxy.html", import.meta.url), "utf8");
  const pg = await G.galaxyPage(CT, "https://www.arcircle.app", "mainnet", async () => html);
  ok(pg.status === 200 && pg.html.includes('window.__GX = { focus: "' + CT + '" }') && pg.html.includes("/galaxy/c/" + CT), "the page opens on the star with its own link");
  const vj = JSON.parse(fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  ok(vj.rewrites.some((x) => x.source === "/galaxy/c/:addr"), "rewrite /galaxy/c/:addr");
}
// GX12: every page open counts, all told (a reload / the same browser again too)
{
  const docs = new Map();
  const commit = async (ws) => { for (const w of ws) if (w.inc) { const d = docs.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; docs.set(w.inc, d); } return { ok: true }; };
  const get = async (ps) => Object.fromEntries(ps.map((p) => [p, docs.get(p) || null]));
  const V = makeViews({ commit, get, on: () => true, doc: "gxT/views" });
  ok((await V.count()) === 0, "views: none yet");
  ok((await V.hit()).views === 1, "views: the first open counts 1");
  ok((await V.hit()).views === 2, "views: the same browser again counts again");
  await V.hit(); ok((await V.count()) === 3, "views: the total adds up");
  const M = makeViews({ on: () => false }); await M.hit(); await M.hit();
  ok((await M.count()) === 2, "views: no store → this function's own count");
  const js = fs.readFileSync(new URL("../../galaxy.js", import.meta.url), "utf8"), html = fs.readFileSync(new URL("../../galaxy.html", import.meta.url), "utf8");
  ok(/arc-galaxy-view/.test(js) && /id="gx-views"/.test(html) && !/gx-watch/.test(html + js), "views: the page counts its open and shows the total; no live count left");
  ok(/navigator\.webdriver/.test(js), "views: automated browsers don't count");
  for (const l of ["ko", "zh", "tr"]) ok(new RegExp(`  ${l}: \\{[^\\n]*views: "`).test(js), "views: label in " + l);
}
console.log(`galaxy: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
