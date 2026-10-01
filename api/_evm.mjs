// api/_evm.mjs — a small JSON-RPC client + transaction signer for any EVM chain (Robinhood Chain for
// ARCIA DESK RH; api/_arc.mjs and api/_x402.mjs stay Arc's own). evmChain({ rpcs, chainId }) returns
// rpc / rpcCall / getLogs / latestBlock / ethCalls / sendTx / balance, failing over between the endpoints.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const strip = (h) => String(h).replace(/^0x/, "");
const hexToBytes = (h) => { h = strip(h); if (h.length % 2) h = "0" + h; const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a; };
const bytesToHex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const concat = (...arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0), out = new Uint8Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
const bigOf = (b) => (b.length ? BigInt(bytesToHex(b)) : 0n);
function rlp(x) {
  if (Array.isArray(x)) { const body = concat(...x.map(rlp)); return concat(rlpLen(body.length, 0xc0), body); }
  const b = x instanceof Uint8Array ? x : rlpBytes(x);
  if (b.length === 1 && b[0] < 0x80) return b;
  return concat(rlpLen(b.length, 0x80), b);
}
function rlpLen(n, off) { if (n < 56) return Uint8Array.of(off + n); const l = hexToBytes(n.toString(16)); return concat(Uint8Array.of(off + 55 + l.length), l); }
function rlpBytes(v) { if (typeof v === "string" && v.startsWith("0x")) return hexToBytes(v); const n = BigInt(v); return n === 0n ? new Uint8Array(0) : hexToBytes(n.toString(16)); }
const keyBytes = (k) => (/^(0x)?[0-9a-fA-F]{64}$/.test(String(k || "").trim()) ? hexToBytes(String(k).trim()) : null);
const addrOf = (sk) => bytesToHex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1)).subarray(12));
export const addressOfKey = (k) => { const sk = keyBytes(k); return sk ? addrOf(sk) : null; };
export const toQty = (n) => "0x" + BigInt(n).toString(16);
const LIMIT = /rate|limit|too many|timeout|capacity|not supported|batch/i;

export function evmChain({ rpcs, chainId, timeoutMs = 8000 }) {
  const urls = () => (typeof rpcs === "function" ? rpcs() : rpcs).filter(Boolean);
  let idx = 0;
  async function rpc(body, { timeoutMs: t = timeoutMs } = {}) {
    const list = urls();
    let last;
    for (let k = 0; k < list.length; k++) {
      const url = list[(idx + k) % list.length];
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(t) });
        if (r.status === 429 || r.status >= 500) throw new Error(`rpc ${r.status}`);
        const out = await r.json();
        if (Array.isArray(body) && !Array.isArray(out)) throw new Error((out && out.error && out.error.message) || "batch refused");
        const bad = (Array.isArray(out) ? out : [out]).find((x) => x && x.error && LIMIT.test(String(x.error.message)));
        if (bad) throw new Error(bad.error.message);
        idx = (idx + k) % list.length;
        return out;
      } catch (e) { last = e; }
    }
    throw last || new Error("no rpc");
  }
  async function rpcCall(method, params) {
    const out = await rpc({ jsonrpc: "2.0", id: 1, method, params });
    if (out.error) { const e = new Error(out.error.message || "rpc error"); e.data = out.error.data; throw e; }
    return out.result;
  }
  async function getLogs(filter, tries = 3) {
    for (let i = 0; ; i++) {
      try { return await rpcCall("eth_getLogs", [filter]); } catch (e) { if (i >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 300 * 2 ** i)); }
    }
  }
  async function latestBlock() { const b = await rpcCall("eth_getBlockByNumber", ["latest", false]); return { number: parseInt(b.number, 16), ts: parseInt(b.timestamp, 16) }; }
  /// eth_calls in batches of 40 → hex results (null on error or empty). A node that refuses a batch that big (or is
  /// busy) gets it again in tens; only when every batch fails does the whole read fail.
  async function ethCalls(calls, { timeoutMs: t = 6000 } = {}) {
    const out = [];
    let okAny = false, lastErr = null;
    const one = async (part) => {
      const res = await rpc(part.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] })), { timeoutMs: t });
      const by = new Map((Array.isArray(res) ? res : [res]).map((x) => [x && x.id, x]));
      return part.map((_, k) => { const x = by.get(k); return x && x.result && x.result !== "0x" ? x.result : null; });
    };
    for (let i = 0; i < calls.length; i += 40) {
      const part = calls.slice(i, i + 40);
      try { out.push(...(await one(part))); okAny = true; continue; } catch (e) { lastErr = e; }
      for (let j = 0; j < part.length; j += 10) {
        const sub = part.slice(j, j + 10);
        try { out.push(...(await one(sub))); okAny = true; } catch (e) { lastErr = e; out.push(...sub.map(() => null)); }
      }
    }
    if (calls.length && !okAny) throw lastErr || new Error("eth_call failed");
    return out;
  }
  /// eth_calls expected to revert (quotes) → [{ ok, data }] with the revert data
  async function callsRaw(calls) {
    const out = [];
    for (let i = 0; i < calls.length; i += 40) {
      const part = calls.slice(i, i + 40);
      let res;
      try { res = await rpc(part.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] })), { timeoutMs: 9000 }); } catch { res = []; }
      const by = new Map((Array.isArray(res) ? res : [res]).map((x) => [x && x.id, x]));
      part.forEach((_, k) => { const x = by.get(k); out.push(!x ? { ok: false, data: null } : x.error ? { ok: false, data: revertData(x.error) } : { ok: true, data: x.result }); });
    }
    return out;
  }
  const balance = async (a) => BigInt(await rpcCall("eth_getBalance", [a, "latest"]));
  /// one EIP-1559 transaction from `key`, waiting ~20 s for its receipt: { hash, ok, receipt } (ok null = no receipt yet)
  async function sendTx({ to, data = "0x", value = 0n, key }) {
    const sk = keyBytes(key);
    if (!sk) throw new Error("that key isn't a 32-byte hex key");
    const from = addrOf(sk);
    const [nonce, gasPrice, gas] = await Promise.all([
      rpcCall("eth_getTransactionCount", [from, "pending"]), rpcCall("eth_gasPrice", []),
      rpcCall("eth_estimateGas", [{ from, to, data, value: toQty(value) }]),
    ]);
    const maxFee = (BigInt(gasPrice) * 3n) / 2n + 1n, tip = BigInt(gasPrice) / 10n || 1n;
    const fields = [BigInt(chainId), BigInt(nonce), tip, maxFee, (BigInt(gas) * 13n) / 10n, to, BigInt(value), data, []];
    const unsigned = concat(Uint8Array.of(2), rlp(fields));
    const sig = secp256k1.sign(keccak_256(unsigned), sk, { prehash: false, format: "recovered" });
    const raw = concat(Uint8Array.of(2), rlp([...fields, BigInt(sig[0]), bigOf(sig.subarray(1, 33)), bigOf(sig.subarray(33, 65))]));
    const hash = await rpcCall("eth_sendRawTransaction", [bytesToHex(raw)]);
    for (let i = 0; i < 30; i++) {
      const rc = await rpcCall("eth_getTransactionReceipt", [hash]).catch(() => null);
      if (rc) return { hash, ok: rc.status === "0x1", receipt: rc };
      await new Promise((r) => setTimeout(r, 700));
    }
    return { hash, ok: null };
  }
  return { rpc, rpcCall, getLogs, latestBlock, ethCalls, callsRaw, sendTx, balance, chainId };
}
export function revertData(e) {
  if (!e) return null;
  const d = typeof e.data === "string" ? e.data : e.data && (e.data.data || e.data.result);
  if (typeof d === "string" && /^0x[0-9a-fA-F]*$/.test(d)) return d;
  const m = String(e.message || "").match(/0x[0-9a-fA-F]{8,}/);
  return m ? m[0] : null;
}
