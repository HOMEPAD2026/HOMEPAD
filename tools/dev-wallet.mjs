// tools/dev-wallet.mjs — what one wallet did with one token on Robinhood Chain: every buy, sell and transfer, the
// ETH it spent and got back, and what it still holds (plus what the wallets it sent tokens to still hold).
// Read-only: no key, no signature, nothing is sent. Needs Node 18+ (built-in fetch), no packages.
//   node tools/dev-wallet.mjs <wallet> [token]        token defaults to Aria (ARIA) 0xa74a…7b55
//   ROBINHOOD_RPC_URL overrides the public RPC; FROM_BLOCK overrides where the scan starts (default: 2026-09-01)
// ETH per trade comes from the Uniswap v4 Swap events in the wallet's own transactions (exact, gas not included);
// when a buy has no Swap event (a launchpad or other contract), the ETH sent with the transaction is used instead.
const RPC = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const WALLET = (process.argv[2] || "").toLowerCase();
const TOKEN = (process.argv[3] || "0xa74a94c15b95f8d5f3abdd2db00f6c7384037b55").toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(WALLET) || !/^0x[0-9a-f]{40}$/.test(TOKEN)) { console.error("usage: node tools/dev-wallet.mjs <wallet 0x…> [token 0x…]"); process.exit(1); }
const SINCE = Date.UTC(2026, 8, 1) / 1000;
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const T_SWAP4 = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"; // v4 PoolManager Swap
const T_INIT4 = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438"; // v4 PoolManager Initialize
const ZERO = "0x0000000000000000000000000000000000000000", DEAD = "0x000000000000000000000000000000000000dead";

let id = 0;
async function rpc(method, params) {
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) { if (k === 3) throw e; await new Promise((r) => setTimeout(r, 600 * (k + 1))); }
  }
}
const hex = (n) => "0x" + n.toString(16);
const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const addrOf = (topic) => "0x" + topic.slice(26).toLowerCase();
const words = (h) => { const s = String(h || "0x").slice(2); const o = []; for (let i = 0; i + 64 <= s.length; i += 64) o.push(BigInt("0x" + s.slice(i, i + 64))); return o; };
const signed = (w) => (w >= 1n << 255n ? w - (1n << 256n) : w);
const units = (w, d) => Number(w) / 10 ** d;
const fmt = (n, d = 2) => (n == null ? "-" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
const short = (a) => (a === ZERO ? "mint" : a.slice(0, 8) + "…" + a.slice(-4));
const when = (ts) => new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16);
const call = (to, data, tag = "latest") => rpc("eth_call", [{ to, data }, tag]);
const str = (h) => { try { const w = String(h).slice(2); const len = parseInt(w.slice(64, 128), 16); return Buffer.from(w.slice(128, 128 + len * 2), "hex").toString("utf8"); } catch { return "?"; } };

const meta = new Map();
async function tokenMeta(a) {
  if (a === ZERO) return { symbol: "ETH", decimals: 18 };
  if (!meta.has(a)) {
    const [s, d] = await Promise.all([call(a, "0x95d89b41").catch(() => null), call(a, "0x313ce567").catch(() => null)]);
    meta.set(a, { symbol: s ? str(s) : a.slice(0, 8), decimals: d ? Number(BigInt(d)) : 18 });
  }
  return meta.get(a);
}

// logs over a block range, in chunks that shrink when the RPC says the range is too big
async function logs(filter, from, to) {
  const out = [];
  let step = 2_000_000;
  while (from <= to) {
    const end = Math.min(to, from + step - 1);
    let got;
    try { got = await rpc("eth_getLogs", [{ ...filter, fromBlock: hex(from), toBlock: hex(end) }]); }
    catch (e) { if (step > 5_000) { step = Math.floor(step / 4); continue; } throw e; }
    out.push(...got);
    from = end + 1;
  }
  return out;
}

const head = parseInt(await rpc("eth_blockNumber", []), 16);
const blockTs = new Map();
async function ts(n) { if (!blockTs.has(n)) blockTs.set(n, parseInt((await rpc("eth_getBlockByNumber", [hex(n), false])).timestamp, 16)); return blockTs.get(n); }
let FROM = process.env.FROM_BLOCK ? Number(process.env.FROM_BLOCK) : null;
if (FROM == null) { let lo = 0, hi = head; while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if ((await ts(mid)) < SINCE) lo = mid + 1; else hi = mid; } FROM = lo; }

const tk = await tokenMeta(TOKEN);
const [supplyH, balH, ethH, nonceH] = await Promise.all([
  call(TOKEN, "0x18160ddd"), call(TOKEN, "0x70a08231" + pad(WALLET).slice(2)),
  rpc("eth_getBalance", [WALLET, "latest"]), rpc("eth_getTransactionCount", [WALLET, "latest"]),
]);
const supply = units(BigInt(supplyH), tk.decimals), holding = units(BigInt(balH), tk.decimals);

// every transfer of the token to or from the wallet
const tl = [
  ...(await logs({ address: TOKEN, topics: [T_TRANSFER, pad(WALLET)] }, FROM, head)),
  ...(await logs({ address: TOKEN, topics: [T_TRANSFER, null, pad(WALLET)] }, FROM, head)),
];
const hashes = [...new Set(tl.map((l) => l.transactionHash))];

const pools = new Map(); // v4 pool id → { c0, c1 }
async function pool(manager, pid) {
  if (!pools.has(pid)) {
    const l = await logs({ address: manager, topics: [T_INIT4, pid] }, FROM, head).catch(() => []);
    pools.set(pid, l.length ? { c0: addrOf(l[0].topics[2]), c1: addrOf(l[0].topics[3]) } : null);
  }
  return pools.get(pid);
}

const rows = [];
for (const h of hashes) {
  const [tx, rc] = await Promise.all([rpc("eth_getTransactionByHash", [h]), rpc("eth_getTransactionReceipt", [h])]);
  const bn = parseInt(rc.blockNumber, 16), mine = tx.from.toLowerCase() === WALLET;
  let tokenDelta = 0n; const peers = new Map(); const other = new Map();
  for (const l of rc.logs) {
    if (l.topics[0] !== T_TRANSFER || l.topics.length !== 3) continue;
    const from = addrOf(l.topics[1]), to = addrOf(l.topics[2]), v = BigInt(l.data), a = l.address.toLowerCase();
    if (from !== WALLET && to !== WALLET) continue;
    const sgn = to === WALLET ? 1n : -1n;
    if (a === TOKEN) { tokenDelta += sgn * v; const p = to === WALLET ? from : to; peers.set(p, (peers.get(p) || 0n) + sgn * v); }
    else other.set(a, (other.get(a) || 0n) + sgn * v);
  }
  // what the wallet paid / got through v4 pools that hold the token (only its own transactions)
  const paid = new Map(); let swaps = 0;
  if (mine) for (const l of rc.logs) {
    if (l.topics[0] !== T_SWAP4) continue;
    const p = await pool(l.address.toLowerCase(), l.topics[1]);
    if (!p || (p.c0 !== TOKEN && p.c1 !== TOKEN)) continue;
    const [a0, a1] = words(l.data).map(signed);
    const [cur, amt] = p.c0 === TOKEN ? [p.c1, a1] : [p.c0, a0];
    paid.set(cur, (paid.get(cur) || 0n) + amt); swaps++;
  }
  let ethDelta = paid.has(ZERO) ? units(paid.get(ZERO), 18) : null;
  const viaValue = ethDelta == null && mine && tokenDelta > 0n && BigInt(tx.value) > 0n;
  if (viaValue) ethDelta = -units(BigInt(tx.value), 18);
  const kind = tokenDelta > 0n ? (mine && (swaps || viaValue) ? "BUY" : [...peers.keys()].includes(ZERO) ? "MINT" : "IN")
    : tokenDelta < 0n ? (swaps ? "SELL" : [...peers.keys()].every((p) => p === DEAD || p === ZERO) ? "BURN" : "OUT") : "-";
  const quote = [];
  for (const [cur, amt] of paid) if (cur !== ZERO) { const m = await tokenMeta(cur); quote.push(`${fmt(units(amt, m.decimals))} ${m.symbol}`); }
  rows.push({ bn, ts: await ts(bn), h, kind, mine, token: units(tokenDelta, tk.decimals), eth: ethDelta, viaValue, quote: quote.join(" "),
    peers: [...peers].filter(([p]) => kind === "OUT" || kind === "IN" || kind === "MINT").map(([p, v]) => [p, units(v, tk.decimals)]) });
}
rows.sort((a, b) => a.bn - b.bn);

// where tokens went: what each receiving address holds now and whether it is a contract
const sentTo = new Map();
for (const r of rows) if (r.kind === "OUT") for (const [p, v] of r.peers) sentTo.set(p, (sentTo.get(p) || 0) - v);
const recipients = [];
for (const [p, v] of sentTo) {
  const [b, code] = await Promise.all([call(TOKEN, "0x70a08231" + pad(p).slice(2)), rpc("eth_getCode", [p, "latest"])]);
  recipients.push({ address: p, sent: v, holdsNow: units(BigInt(b), tk.decimals), type: code && code !== "0x" ? "contract" : "wallet" });
}

let px = null;
try {
  const j = await (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN}`)).json();
  const best = (j.pairs || []).filter((p) => p.chainId === "robinhood" && p.baseToken.address.toLowerCase() === TOKEN).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  if (best) px = { usd: Number(best.priceUsd), eth: best.quoteToken.symbol === "ETH" || best.quoteToken.symbol === "WETH" ? Number(best.priceNative) : null };
} catch { /* prices are a bonus */ }

const sum = (k, f) => rows.filter(f).reduce((s, r) => s + (r[k] || 0), 0);
const buys = rows.filter((r) => r.kind === "BUY"), sells = rows.filter((r) => r.kind === "SELL");
const ethIn = -sum("eth", (r) => r.kind === "BUY" && r.eth != null), ethOut = sum("eth", (r) => r.kind === "SELL" && r.eth != null);
const bought = sum("token", (r) => r.kind === "BUY"), sold = -sum("token", (r) => r.kind === "SELL");
const received = sum("token", (r) => r.kind === "IN" || r.kind === "MINT"), sent = -sum("token", (r) => r.kind === "OUT"), burned = -sum("token", (r) => r.kind === "BURN");

console.log(`${tk.symbol} ${TOKEN} · wallet ${WALLET}`);
console.log(`Robinhood Chain block ${head} · scanned from block ${FROM} · ${rows.length} transactions touching ${tk.symbol}`);
console.log(`wallet's ETH now: ${fmt(units(BigInt(ethH), 18), 6)} · transactions sent by it (nonce): ${parseInt(nonceH, 16)}\n`);
console.table(rows.map((r) => ({
  time: when(r.ts), type: r.kind, [tk.symbol]: (r.token > 0 ? "+" : "") + fmt(r.token, 0),
  ETH: r.eth == null ? "" : (r.eth > 0 ? "+" : "") + fmt(r.eth, 6) + (r.viaValue ? " (tx value)" : ""),
  other: r.quote, "from / to": r.peers.map(([p]) => short(p)).join(" "), tx: r.h.slice(0, 12) + "…",
})));
console.log(`\nBUYS   ${buys.length} · ${fmt(bought, 0)} ${tk.symbol} for ${fmt(ethIn, 6)} ETH${bought ? ` (avg ${(ethIn / bought).toExponential(4)} ETH each)` : ""}`);
console.log(`SELLS  ${sells.length} · ${fmt(sold, 0)} ${tk.symbol} for ${fmt(ethOut, 6)} ETH`);
console.log(`IN     ${fmt(received, 0)} ${tk.symbol} received without buying (mint / transfers in)`);
console.log(`OUT    ${fmt(sent, 0)} ${tk.symbol} sent to other addresses · BURNED ${fmt(burned, 0)}`);
console.log(`NET ETH (sold − bought, gas not included): ${fmt(ethOut - ethIn, 6)} ETH`);
console.log(`HOLDS NOW ${fmt(holding, 0)} ${tk.symbol} = ${fmt((holding / supply) * 100, 3)}% of the ${fmt(supply, 0)} supply` +
  (px ? ` ≈ $${fmt(holding * px.usd, 0)}${px.eth ? ` / ${fmt(holding * px.eth, 4)} ETH` : ""} at $${px.usd}` : ""));
if (recipients.length) {
  console.log(`\nWhere the ${fmt(sent, 0)} sent ${tk.symbol} went (what each address holds now):`);
  console.table(recipients.sort((a, b) => b.sent - a.sent).map((r) => ({ address: r.address, type: r.type, sent: fmt(r.sent, 0), "holds now": fmt(r.holdsNow, 0), "% supply": fmt((r.holdsNow / supply) * 100, 3) })));
  const group = holding + recipients.filter((r) => r.type === "wallet").reduce((s, r) => s + r.holdsNow, 0);
  console.log(`wallet + the wallets it sent to hold ${fmt(group, 0)} ${tk.symbol} = ${fmt((group / supply) * 100, 3)}% of supply`);
}
