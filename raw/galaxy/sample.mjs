#!/usr/bin/env node
// raw/galaxy/sample.mjs — samples the Arc chain (chain id 5042) over JSON-RPC for ARC GALAXY.
// Plain Node (≥ 18) fetch, no deps. Writes arc-sample.md, blocks-sample.json and top-contracts.json next to itself.
//   node raw/galaxy/sample.mjs [blocksForStats=300]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const RPCS = ["https://rpc.mainnet.arc.io", "https://rpc.drpc.mainnet.arc.io", "https://rpc.quicknode.mainnet.arc.io", "https://rpc.blockdaemon.mainnet.arc.io"];
const SPAN = +(process.argv[2] || 300);
const out = [];
const say = (s = "") => { out.push(s); console.log(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => "0x" + n.toString(16);
const num = (h) => (h == null ? null : parseInt(h, 16));

let id = 1;
async function post(url, body, ms = 20000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { /* not json */ }
    return { status: r.status, json: j, text: txt.slice(0, 300) };
  } finally { clearTimeout(t); }
}
async function call(url, method, params = []) {
  const r = await post(url, { jsonrpc: "2.0", id: id++, method, params });
  if (!r.json) throw new Error(`${method}: HTTP ${r.status} ${r.text}`);
  if (r.json.error) throw new Error(`${method}: ${JSON.stringify(r.json.error).slice(0, 200)}`);
  return r.json.result;
}
// pick the first RPC that answers
let RPC = null; const alive = [];
for (const u of RPCS) {
  try { const t0 = Date.now(); const b = await call(u, "eth_blockNumber"); const c = await call(u, "eth_chainId"); alive.push(u); say(`- ${u}: block ${num(b)}, chain ${num(c)}, ${Date.now() - t0} ms`); if (!RPC) RPC = u; }
  catch (e) { say(`- ${u}: DOWN (${String(e.message).slice(0, 120)})`); }
}
if (!RPC) { say("no RPC answered"); process.exit(1); }
const rpc = (m, p) => call(RPC, m, p);
// a batch call with fallbacks to single calls when the batch is refused
async function batch(reqs, url = RPC) {
  const body = reqs.map(([m, p]) => ({ jsonrpc: "2.0", id: id++, method: m, params: p }));
  const r = await post(url, body, 60000);
  let res = Array.isArray(r.json) ? (() => { const by = new Map(r.json.map((x) => [x.id, x])); return body.map((b) => by.get(b.id)?.result ?? null); })() : reqs.map(() => null);
  // anything the batch lost (rate limit) is asked again one by one, with a short pause and a few tries
  for (let i = 0; i < reqs.length; i++) for (let tr = 0; res[i] == null && tr < 4; tr++) { await sleep(250 * (tr + 1)); res[i] = await call(url, reqs[i][0], reqs[i][1]).catch(() => null); }
  return res;
}
async function blocks(from, to, full = true) {
  const res = [];
  for (let n = from; n <= to; n += 10) {
    const ns = []; for (let k = n; k <= Math.min(to, n + 9); k++) ns.push(k);
    res.push(...(await batch(ns.map((k) => ["eth_getBlockByNumber", [hex(k), full]]))));
  }
  return res.filter(Boolean);
}

out.unshift(`# Arc chain sample — ${new Date().toISOString()}`, "", "## RPCs"); say(`Using **${RPC}**`); say();

// a) block rate
say("## a) Block rate");
const b0 = num(await rpc("eth_blockNumber")); const t0 = Date.now();
await sleep(10000);
const b1 = num(await rpc("eth_blockNumber")); const dt = (Date.now() - t0) / 1000;
say(`- eth_blockNumber ${b0} → ${b1} in ${dt.toFixed(1)} s = **${((b1 - b0) / dt).toFixed(2)} blocks/s**`);
const last60 = await blocks(b1 - 59, b1, true);
const ts = last60.map((b) => num(b.timestamp)), txc = last60.map((b) => b.transactions.length);
const gaps = ts.slice(1).map((t, i) => t - ts[i]);
const spanS = ts[ts.length - 1] - ts[0];
const tx60 = txc.reduce((a, b) => a + b, 0);
say(`- last ${last60.length} blocks (${b1 - 59}…${b1}): timestamps span ${spanS} s → mean block time ${(spanS / (last60.length - 1)).toFixed(3)} s; gaps (s) min ${Math.min(...gaps)} / max ${Math.max(...gaps)}; distinct gap values: ${JSON.stringify([...new Set(gaps)].sort((a, b) => a - b))}`);
say(`- txs: ${tx60} total, per block min ${Math.min(...txc)} / median ${[...txc].sort((a, b) => a - b)[txc.length >> 1]} / max ${Math.max(...txc)} → **${(tx60 / Math.max(1, spanS)).toFixed(2)} TPS** over the span`);
const tsMs = last60.map((b) => b.timestampMs || b.timestamp_ms || null).filter(Boolean);
if (tsMs.length) say(`- blocks carry a ms timestamp field: ${JSON.stringify(tsMs.slice(0, 3))}`);
say(`- block fields: ${Object.keys(last60[0]).join(", ")}`);
say(`- gasLimit ${num(last60[0].gasLimit)}, baseFeePerGas ${num(last60[last60.length - 1].baseFeePerGas)} wei`);
say();

// b) receipts
say("## b) Receipts");
const recSupport = {};
for (const u of alive) {
  try { const r = await call(u, "eth_getBlockReceipts", [hex(b1 - 2)]); recSupport[u] = Array.isArray(r) ? `yes (${r.length} receipts)` : `odd: ${typeof r}`; }
  catch (e) { recSupport[u] = "no — " + String(e.message).slice(0, 100); }
  say(`- eth_getBlockReceipts on ${u}: ${recSupport[u]}`);
}
const recRpc = alive.find((u) => recSupport[u].startsWith("yes"));
const sample3 = [];
const pick = last60.slice().reverse().filter((b) => b.transactions.length).slice(0, 3);
for (const b of (pick.length ? pick : last60.slice(-3))) {
  let receipts = null;
  if (recRpc) receipts = await call(recRpc, "eth_getBlockReceipts", [b.number]).catch(() => null);
  say(`- block ${num(b.number)}: ${b.transactions.length} txs, receipts ${receipts ? receipts.length : "n/a"}`);
}
if (!recRpc) {
  const tx = last60.flatMap((b) => b.transactions)[0];
  if (tx) { try { const r = await rpc("eth_getTransactionReceipt", [tx.hash]); say(`- eth_getTransactionReceipt(${tx.hash.slice(0, 12)}…): ${r ? "ok, status " + r.status : "null"}`); } catch (e) { say(`- eth_getTransactionReceipt: ${e.message}`); } }
}
// 3 consecutive full blocks with receipts (the busiest stretch in the last 60)
let best = 0, bi = 0; for (let i = 0; i + 2 < last60.length; i++) { const s = txc[i] + txc[i + 1] + txc[i + 2]; if (s > best) { best = s; bi = i; } }
for (const b of last60.slice(bi, bi + 3)) {
  const receipts = recRpc ? await call(recRpc, "eth_getBlockReceipts", [b.number]).catch(() => null) : null;
  sample3.push({ block: b, receipts });
}
say();

// c) websocket
say("## c) WebSocket newHeads");
let WS = globalThis.WebSocket;
if (!WS) { try { WS = createRequire(import.meta.url)("ws"); } catch { /* none */ } }
if (!WS) say("- not tested (no WebSocket in this Node and no `ws` package)");
else {
  for (const u of RPCS.map((x) => x.replace("https://", "wss://"))) {
    const res = await new Promise((done) => {
      let ws; const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } done("timeout (no head in 8 s)"); }, 8000);
      try { ws = new WS(u); } catch (e) { clearTimeout(timer); return done("error " + e.message); }
      let heads = 0, sub = null;
      ws.onopen = () => ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newHeads"] }));
      ws.onerror = (e) => { clearTimeout(timer); done("error " + (e.message || e.type || "ws error")); };
      ws.onmessage = (m) => {
        const j = JSON.parse(typeof m.data === "string" ? m.data : m.data.toString());
        if (j.id === 1) { if (j.error) { clearTimeout(timer); ws.close(); done("subscribe refused: " + JSON.stringify(j.error)); } else sub = j.result; return; }
        if (j.params && j.params.subscription === sub) { heads++; if (heads >= 3) { clearTimeout(timer); ws.close(); done(`works — 3 heads, last ${num(j.params.result.number)}`); } }
      };
    });
    say(`- ${u}: ${res}`);
  }
}
say();

// d) batch limits
say("## d) JSON-RPC batches");
for (const u of alive) {
  const parts = [];
  for (const n of [10, 50, 100, 200, 500, 1000]) {
    const body = Array.from({ length: n }, (_, k) => ({ jsonrpc: "2.0", id: k + 1, method: "eth_getBlockByNumber", params: [hex(b1 - k), false] }));
    try {
      const r = await post(u, body, 30000);
      const okN = Array.isArray(r.json) ? r.json.filter((x) => x.result).length : 0;
      const err = Array.isArray(r.json) ? r.json.find((x) => x.error)?.error : r.json?.error;
      parts.push(`${n}: ${Array.isArray(r.json) ? `${okN}/${n} ok` : `refused (HTTP ${r.status}${err ? " " + JSON.stringify(err).slice(0, 80) : ""})`}${err && okN < n ? " err " + JSON.stringify(err).slice(0, 80) : ""}`);
      if (okN < n) break;
    } catch (e) { parts.push(`${n}: ${e.name === "AbortError" ? "timeout" : e.message}`); break; }
  }
  say(`- ${u}: ${parts.join(" · ")}`);
}
say();

// e) the last SPAN blocks
say(`## e) Last ${SPAN} blocks`);
const head = num(await rpc("eth_blockNumber"));
const span = await blocks(head - SPAN + 1, head, true);
const txs = span.flatMap((b) => b.transactions);
const tS = num(span[span.length - 1].timestamp) - num(span[0].timestamp);
say(`- blocks ${head - SPAN + 1}…${head}: ${span.length} read, ${txs.length} txs over ${tS} s → ${(txs.length / Math.max(1, tS)).toFixed(2)} TPS; empty blocks ${span.filter((b) => !b.transactions.length).length}`);
const byTo = new Map(), bySel = new Map();
let deploys = 0, valueTx = 0, plain = 0;
const types = {};
for (const t of txs) {
  types[t.type] = (types[t.type] || 0) + 1;
  if (!t.to) { deploys++; continue; }
  const to = t.to.toLowerCase(); const sel = t.input && t.input.length >= 10 ? t.input.slice(0, 10) : "0x(none)";
  if (sel === "0x(none)") plain++;
  if (BigInt(t.value || "0x0") > 0n) valueTx++;
  const e = byTo.get(to) || { address: to, count: 0, selectors: {} }; e.count++; e.selectors[sel] = (e.selectors[sel] || 0) + 1; byTo.set(to, e);
  bySel.set(sel, (bySel.get(sel) || 0) + 1);
}
let failed = null, logs = null, rcN = 0;
if (recRpc) {
  failed = 0; logs = 0;
  for (let i = 0; i < span.length; i += 10) {
    const rs = await batch(span.slice(i, i + 10).map((b) => ["eth_getBlockReceipts", [b.number]]), recRpc);
    for (const r of rs) for (const x of r || []) { rcN++; if (num(x.status) === 0) failed++; logs += (x.logs || []).length; }
  }
}
say(`- contract deployments (to == null): ${deploys}`);
say(`- native-value transfers (value > 0): ${valueTx}; calls with no input: ${plain}`);
say(`- tx types: ${JSON.stringify(types)}`);
say(failed == null ? "- failed txs: receipts not readable in bulk" : `- receipts read ${rcN}: failed (status 0) **${failed}** (${(100 * failed / Math.max(1, rcN)).toFixed(2)} %), logs ${logs} (${(logs / Math.max(1, rcN)).toFixed(2)} a tx)`);
const top = [...byTo.values()].sort((a, b) => b.count - a.count).slice(0, 40).map((e) => ({ ...e, selectors: Object.fromEntries(Object.entries(e.selectors).sort((a, b) => b[1] - a[1])) }));
say(); say("### Top 40 `to` addresses"); say("| # | address | txs | top selectors |"); say("|---|---|---|---|");
top.forEach((e, i) => say(`| ${i + 1} | ${e.address} | ${e.count} | ${Object.entries(e.selectors).slice(0, 3).map(([s, c]) => `${s}×${c}`).join(" ")} |`));
say(); say("### Top 30 selectors"); say("| selector | txs |"); say("|---|---|");
[...bySel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([s, c]) => say(`| ${s} | ${c} |`));

fs.writeFileSync(path.join(DIR, "arc-sample.md"), out.join("\n") + "\n");
fs.writeFileSync(path.join(DIR, "blocks-sample.json"), JSON.stringify(sample3));
fs.writeFileSync(path.join(DIR, "top-contracts.json"), JSON.stringify(top, null, 1));
console.error("written: arc-sample.md, blocks-sample.json, top-contracts.json");
