// api/_snap-rh.mjs — Holder Snapshot on Robinhood Chain: the chain context api/_snapshot.mjs runs the shared engine
// (api/_snap-core.mjs) with, and the balance sheet it walks back from.
//
// On Arc the scanner (api/_scan.mjs) keeps every token's balance sheet. Robinhood Chain has no such scanner, so
// holderSnapshot() builds one here: every Transfer of the token read forward from block 0 (empty stretches go by in
// windows of millions of blocks; the node caps a search at 10,000,000), balances summed, then kept up to date from where
// it stopped. A long history takes a few calls — progress is kept in the store (snaprh/base_<token>) between them.
// The same shape as scanner.holderSnapshot, so run() treats both chains alike.
import { evmChain } from "./_evm.mjs";
import { keccakHex } from "./_arc.mjs";

const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const lc = (a) => String(a || "").toLowerCase();
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000";
export const RH_CFG = { rpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean), chainId: 4663 };
let CH = null;
export function configure(o) { Object.assign(RH_CFG, o); CH = null; mem.clear(); }
const ch = () => (CH = CH || evmChain({ rpcs: RH_CFG.rpcs, chainId: RH_CFG.chainId, timeoutMs: 15000 }));
const MAX_HOLDERS = 10000, WIDE = 9_000_000;

export const io = {
  logs: (f) => ch().getLogs(f, 3),
  keccak: (h) => keccakHex(h),
  async calls(calls, tag = "latest") {
    const out = new Array(calls.length).fill(null);
    for (let i = 0; i < calls.length; i += 50) {
      const part = calls.slice(i, i + 50);
      const res = await ch().rpc(part.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, tag] })), { timeoutMs: 12000 });
      const byId = new Map((Array.isArray(res) ? res : [res]).map((x) => [x.id, x]));
      part.forEach((_, j) => { const x = byId.get(j); out[i + j] = x && x.result && x.result !== "0x" ? x.result : null; });
    }
    return out;
  },
};
export const rpc = (body, o) => ch().rpc(body, o);
export const latestBlock = () => ch().latestBlock();
export async function blockTs(n) { const b = await ch().rpcCall("eth_getBlockByNumber", ["0x" + Number(n).toString(16), false]); return parseInt(b.timestamp, 16); }

const mem = new Map();
// balances packed as address:base36 (a rebasing or odd token can drift below zero: the sign is kept)
const pack2 = (m) => [...m].filter(([, v]) => v !== 0n).map(([a, v]) => `${a.slice(2)}:${v < 0n ? "-" + (-v).toString(36) : v.toString(36)}`);
const unpack2 = (arr) => new Map((arr || []).map((s) => { const i = s.indexOf(":"); const raw = s.slice(i + 1), neg = raw.startsWith("-"); let v = 0n; for (const c of neg ? raw.slice(1) : raw) v = v * 36n + BigInt(parseInt(c, 36)); return ["0x" + s.slice(0, i), neg ? -v : v]; }));

async function readMeta(token) {
  const [dec, sup] = await io.calls([{ to: token, data: "0x313ce567" }, { to: token, data: "0x18160ddd" }]);
  return { decimals: dec ? Number(BigInt(dec)) : null, supply: sup ? BigInt(sup).toString() : null };
}

/// token → { token, decimals, supply, complete, more, lite, block, holderCount, holders: [[a, v]], firstMint, deployer, hist }
export async function holderSnapshot(token, { store = null, budgetMs = 7000 } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  token = lc(token);
  const key = `snaprh/base_${token}`;
  let doc = mem.get(key) || null;
  if (!doc && store) { try { doc = await store.get(key); } catch { doc = null; } }
  doc = doc && doc.v === 1 ? { ...doc } : null; // a copy: the cached one only moves on once it's saved
  if (!doc) doc = { v: 1, next: 0, hi: -1, wnd: WIDE, bal: [], first: null, logs: 0, lite: false };
  const meta = await readMeta(token);
  if (meta.decimals == null || meta.supply == null) throw Object.assign(new Error("that isn't an ERC-20 token on Robinhood Chain"), { status: 400 });
  const head = await latestBlock();
  const bal = unpack2(doc.bal);
  let moved = false, err = null;
  while (doc.next <= head.number && left() > 1500 && !doc.lite) {
    const to = Math.min(head.number, doc.next + doc.wnd - 1);
    let logs;
    try {
      logs = await io.logs({ address: token, topics: [T_TRANSFER], fromBlock: "0x" + doc.next.toString(16), toBlock: "0x" + to.toString(16) });
    } catch (e) {
      // too wide or too many results: a narrower window
      if (doc.wnd > 2000) { doc.wnd = Math.max(2000, Math.floor(doc.wnd / 4)); continue; }
      err = e; break;
    }
    for (const l of logs || []) {
      if (!l.topics || l.topics.length < 3) continue;
      const fr = "0x" + l.topics[1].slice(26).toLowerCase(), tt = "0x" + l.topics[2].slice(26).toLowerCase();
      const v = BigInt(l.data && l.data !== "0x" ? l.data.slice(0, 66) : "0x0");
      if (!doc.first) doc.first = { block: parseInt(l.blockNumber, 16) };
      if (fr === tt) continue;
      if (fr !== ZERO) bal.set(fr, (bal.get(fr) || 0n) - v);
      if (tt !== ZERO) bal.set(tt, (bal.get(tt) || 0n) + v);
    }
    doc.logs += (logs || []).length;
    doc.next = to + 1; doc.hi = to; moved = true;
    // busy stretches in smaller windows, quiet ones in wider
    const n = (logs || []).length;
    if (n > 4000) doc.wnd = Math.max(2000, Math.floor(doc.wnd / 2));
    else if (n < 300 && doc.wnd < WIDE) doc.wnd = Math.min(WIDE, doc.wnd * 4);
    let holders = 0; for (const v of bal.values()) if (v > 0n) holders++;
    if (holders > MAX_HOLDERS) doc.lite = true;
  }
  if (doc.first && !doc.first.ts) { try { doc.first.ts = await blockTs(doc.first.block); } catch { /* later */ } }
  if (moved) {
    doc.bal = pack2(bal);
    mem.set(key, doc); if (mem.size > 60) mem.delete(mem.keys().next().value);
    if (store) { try { await store.set(key, doc); } catch { /* too big for a document: this instance keeps it */ } }
  }
  if (err && !moved) throw err;
  const list = [...bal].filter(([, v]) => v > 0n).sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
  const complete = doc.next > head.number - 2 && !doc.lite;
  return {
    token, decimals: meta.decimals, supply: meta.supply, complete, more: !complete && !doc.lite, lite: doc.lite,
    block: complete ? doc.hi : null, ts: head.ts, deployer: null, hist: [], firstMint: doc.first && doc.first.ts ? doc.first : null,
    holderCount: list.length, checkedContracts: 0, progress: head.number ? Math.min(1, doc.next / head.number) : 0,
    holders: list.slice(0, MAX_HOLDERS).map(([a, v]) => [a, v.toString()]),
  };
}
