// api/_x402.mjs — x402 (HTTP 402 Payment Required) on Arc, both ways, for ARCIA 402.
//
// Selling (ARCIA's paid endpoints): an unpaid request gets 402 with the payment terms —
// scheme "exact", network eip155:5042, asset = Arc's USDC predeploy, payTo = ARCIA's wallet.
// A paid request carries an X-PAYMENT header (base64 JSON), in one of two forms:
//   · the standard x402 "exact" payload: an EIP-3009 transferWithAuthorization signed by the
//     buyer. We check the signature, the amount, the payee, the time window and the nonce, then
//     settle it ourselves (ARCIA's wallet sends the transaction; on Arc gas is USDC too).
//   · { scheme: "arc-tx", payload: { txHash } }: the buyer already sent USDC to ARCIA (a wallet
//     in a browser does this) — we read the receipt and check it paid this price, once.
// Buying (ARCIA hiring other agents): read a service's 402 terms, sign an EIP-3009
// authorization with ARCIA's key for the exact amount, and call again with X-PAYMENT.
//
// ARCIA's key lives only in Vercel (ARCIA_WALLET_KEY). Without it, selling still works in the
// arc-tx form (payTo = ARCIA_WALLET_ADDRESS, else ARCIA_HOME below), and settling / hiring are off.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { rpcCall, ethCalls, isAddr, pad, strip } from "./_arc.mjs";

export const CHAIN_ID = 5042;
export const NETWORK = "eip155:5042";
export const USDC = "0x3600000000000000000000000000000000000000"; // Arc's USDC (ERC-20 face, 6 decimals)
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const lc = (a) => String(a || "").toLowerCase();

// ---------------- bytes ----------------
const hexToBytes = (h) => { h = strip(h); if (h.length % 2) h = "0" + h; const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a; };
const bytesToHex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const concat = (...arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0), out = new Uint8Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
const keccak = (b) => keccak_256(b);
const utf8 = (s) => new TextEncoder().encode(s);
const word = (v) => hexToBytes(BigInt(v).toString(16).padStart(64, "0"));
const addrWord = (a) => hexToBytes(pad(lc(a)));
const bigOf = (b) => (b.length ? BigInt(bytesToHex(b)) : 0n);

// ---------------- RLP (for ARCIA's own transactions) ----------------
function rlp(x) {
  if (Array.isArray(x)) { const body = concat(...x.map(rlp)); return concat(rlpLen(body.length, 0xc0), body); }
  const b = x instanceof Uint8Array ? x : rlpBytes(x);
  if (b.length === 1 && b[0] < 0x80) return b;
  return concat(rlpLen(b.length, 0x80), b);
}
function rlpLen(n, off) {
  if (n < 56) return Uint8Array.of(off + n);
  const l = hexToBytes(n.toString(16));
  return concat(Uint8Array.of(off + 55 + l.length), l);
}
function rlpBytes(v) {
  if (typeof v === "string" && v.startsWith("0x")) return hexToBytes(v);
  const n = BigInt(v);
  return n === 0n ? new Uint8Array(0) : hexToBytes(n.toString(16));
}

// ---------------- ARCIA's wallet ----------------
function secret() {
  const k = String(process.env.ARCIA_WALLET_KEY || "").trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(k)) return null;
  return hexToBytes(k);
}
function addressOf(sk) {
  const pub = secp256k1.getPublicKey(sk, false);
  return bytesToHex(keccak(pub.subarray(1)).subarray(12));
}
// ARCIA's public wallet on Arc (the team published it, 28 Sep 2026). The key in Vercel must
// belong to this address; if it doesn't, walletCheck() says so on the public books.
export const ARCIA_HOME = "0xdbc9bb465c52688c0af75e002caaa43d731b8562";
let meMemo = null;
/// ARCIA's wallet address: from the key; else ARCIA_WALLET_ADDRESS; else ARCIA_HOME.
export function wallet() {
  if (meMemo !== null) return meMemo;
  const sk = secret();
  meMemo = sk ? addressOf(sk) : (isAddr(process.env.ARCIA_WALLET_ADDRESS) ? lc(process.env.ARCIA_WALLET_ADDRESS) : ARCIA_HOME);
  return meMemo;
}
export const canSign = () => !!secret();
/// is the key the one for ARCIA's published wallet? (never exposes the key)
export function walletCheck() {
  const sk = secret();
  return { key: !!sk, matches: sk ? addressOf(sk) === ARCIA_HOME : null, home: ARCIA_HOME };
}

/// Send one transaction from ARCIA's wallet (EIP-1559, chain 5042) and wait for its receipt.
export async function sendTx({ to, data = "0x", value = 0n }) {
  const sk = secret();
  if (!sk) throw new Error("ARCIA's wallet key isn't set");
  const from = addressOf(sk);
  const [nonce, gasPrice, gas] = await Promise.all([
    rpcCall("eth_getTransactionCount", [from, "pending"]),
    rpcCall("eth_gasPrice", []),
    rpcCall("eth_estimateGas", [{ from, to, data, value: "0x" + BigInt(value).toString(16) }]),
  ]);
  const maxFee = (BigInt(gasPrice) * 3n) / 2n, tip = BigInt(gasPrice) / 10n || 1n;
  const fields = [CHAIN_ID, BigInt(nonce), tip, maxFee, (BigInt(gas) * 13n) / 10n, to, BigInt(value), data, []];
  const unsigned = concat(Uint8Array.of(2), rlp(fields));
  const sig = secp256k1.sign(keccak(unsigned), sk, { prehash: false, format: "recovered" });
  const raw = concat(Uint8Array.of(2), rlp([...fields, BigInt(sig[0]), bigOf(sig.subarray(1, 33)), bigOf(sig.subarray(33, 65))]));
  const hash = await rpcCall("eth_sendRawTransaction", [bytesToHex(raw)]);
  for (let i = 0; i < 30; i++) {
    const rc = await rpcCall("eth_getTransactionReceipt", [hash]).catch(() => null);
    if (rc) return { hash, ok: rc.status === "0x1", receipt: rc };
    await new Promise((r) => setTimeout(r, 700));
  }
  return { hash, ok: null };
}

// ---------------- EIP-3009 on Arc's USDC ----------------
const AUTH_TYPEHASH = keccak(utf8("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"));
let domainMemo = null;
/// USDC's EIP-712 domain separator, read from the token itself (no guessing its name/version)
async function domainSeparator() {
  if (domainMemo) return domainMemo;
  const [d] = await ethCalls([{ to: USDC, data: "0x3644e515" }]);
  if (!d) throw new Error("couldn't read USDC's domain separator");
  domainMemo = hexToBytes(d);
  return domainMemo;
}
async function authDigest(a) {
  const structHash = keccak(concat(AUTH_TYPEHASH, addrWord(a.from), addrWord(a.to), word(a.value), word(a.validAfter), word(a.validBefore), hexToBytes(pad(strip(a.nonce)))));
  return keccak(concat(Uint8Array.of(0x19, 0x01), await domainSeparator(), structHash));
}
function splitSig(sigHex) {
  const b = hexToBytes(sigHex);
  if (b.length !== 65) throw new Error("signature must be 65 bytes");
  let v = b[64]; if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("bad signature");
  return { v, r: b.subarray(0, 32), s: b.subarray(32, 64) };
}
function recover(digest, sigHex) {
  const { v, r, s } = splitSig(sigHex);
  const rec = concat(Uint8Array.of(v), r, s);
  const pub = secp256k1.recoverPublicKey(rec, digest, { prehash: false });
  return bytesToHex(keccak(secp256k1.Point.fromBytes(pub).toBytes(false).subarray(1)).subarray(12));
}

// ---------------- selling ----------------
/// The 402 body for one priced resource (x402 v1 body; the same terms go in PAYMENT-REQUIRED for v2 clients).
export function requirements({ resource, amount, description, payTo = wallet() }) {
  return {
    scheme: "exact", network: NETWORK, maxAmountRequired: String(amount), amount: String(amount), resource, description,
    mimeType: "application/json", payTo, maxTimeoutSeconds: 300, asset: USDC,
    extra: { name: "USDC", version: "2", decimals: 6, alsoAccepts: "arc-tx: send the USDC yourself, then X-PAYMENT = base64({x402Version:1,scheme:'arc-tx',network:'eip155:5042',payload:{txHash}})" },
  };
}
export function paymentRequired(req, error = "X-PAYMENT header is required") {
  const body = { x402Version: 1, error, accepts: [req] };
  return { body, headers: { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify({ x402Version: 2, error, accepts: [req] })).toString("base64") } };
}
export function readPayment(headers) {
  const h = headers.get("x-payment") || headers.get("payment-signature") || "";
  if (!h) return null;
  try { return JSON.parse(Buffer.from(h, "base64").toString("utf8")); } catch { try { return JSON.parse(h); } catch { return { bad: true }; } }
}

/// Check (and settle) a payment for `req`. used: async (key) → true if the key was seen before
/// (and records it). Returns { ok, from, tx, amount, error }.
export async function verifyAndSettle(p, req, { used }) {
  if (!p || p.bad) return { ok: false, error: "X-PAYMENT isn't valid base64 JSON" };
  const need = BigInt(req.maxAmountRequired), payTo = lc(req.payTo);
  if (!payTo) return { ok: false, error: "ARCIA's wallet isn't set up yet" };
  const scheme = p.scheme || (p.payload && p.payload.authorization ? "exact" : p.payload && p.payload.txHash ? "arc-tx" : "");
  if (p.network && p.network !== NETWORK && p.network !== "arc" && p.network !== "arc-mainnet") return { ok: false, error: `pay on ${NETWORK}` };

  if (scheme === "arc-tx") {
    const tx = lc(p.payload && p.payload.txHash);
    const got = await readTransfer(tx, payTo);
    if (!got.ok) return got;
    if (got.paid < need) return { ok: false, error: `that transaction paid ${got.paid} (6-decimal units), ${need} needed, to ${payTo}` };
    if (await used(`tx:${tx}`)) return { ok: false, error: "that payment was already used" };
    return { ok: true, from: got.from, tx, amount: got.paid, scheme };
  }

  if (scheme === "exact") {
    const a = p.payload && p.payload.authorization, sig = p.payload && p.payload.signature;
    if (!a || !sig) return { ok: false, error: "payload.authorization and payload.signature are needed" };
    if (lc(a.to) !== payTo) return { ok: false, error: "the authorization pays someone else" };
    if (BigInt(a.value) < need) return { ok: false, error: `the authorization is for ${a.value}, ${need} needed` };
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (BigInt(a.validBefore) <= now + 5n || BigInt(a.validAfter) > now) return { ok: false, error: "the authorization is outside its time window" };
    let signer;
    try { signer = recover(await authDigest(a), sig); } catch (e) { return { ok: false, error: "bad signature: " + String(e.message || e) }; }
    if (signer !== lc(a.from)) return { ok: false, error: "the signature isn't from the payer" };
    if (!canSign()) return { ok: false, error: "this server can't settle authorizations yet — use scheme arc-tx" };
    if (await used(`auth:${lc(a.from)}:${lc(a.nonce)}`)) return { ok: false, error: "that authorization was already used" };
    const { v, r, s } = splitSig(sig);
    // transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
    const data = "0xe3ee160e" + [pad(lc(a.from)), pad(lc(a.to)), pad(BigInt(a.value).toString(16)), pad(BigInt(a.validAfter).toString(16)), pad(BigInt(a.validBefore).toString(16)), pad(strip(a.nonce)), pad((v + 27).toString(16)), strip(bytesToHex(r)), strip(bytesToHex(s))].join("");
    let res;
    try { res = await sendTx({ to: USDC, data }); } catch (e) { return { ok: false, error: "settlement failed: " + String(e.message || e).slice(0, 160) }; }
    if (!res.ok) return { ok: false, error: "settlement transaction failed", tx: res.hash };
    return { ok: true, from: lc(a.from), tx: res.hash, amount: BigInt(a.value), scheme };
  }
  return { ok: false, error: "unknown payment scheme (use exact or arc-tx)" };
}

/// USDC that one Arc transaction paid to `payTo` (ERC-20 Transfer logs, or a native transfer —
/// native USDC has 18 decimals), in 6-decimal units. Refuses failed or old (>20000 blocks) ones.
export async function readTransfer(txHash, payTo) {
  const tx = lc(txHash);
  payTo = lc(payTo);
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return { ok: false, error: "payload.txHash is needed" };
  const rc = await rpcCall("eth_getTransactionReceipt", [tx]).catch(() => null);
  if (!rc) return { ok: false, error: "that transaction isn't on Arc yet — try again in a few seconds", retry: true };
  if (rc.status !== "0x1") return { ok: false, error: "that transaction failed" };
  let paid = 0n, from = lc(rc.from);
  for (const l of rc.logs || []) {
    if (lc(l.address) === USDC && l.topics && l.topics[0] === TRANSFER_TOPIC && ("0x" + strip(l.topics[2]).slice(24)) === payTo) { paid += BigInt(l.data); from = "0x" + strip(l.topics[1]).slice(24); }
  }
  if (paid === 0n) {
    const t = await rpcCall("eth_getTransactionByHash", [tx]).catch(() => null);
    if (t && lc(t.to) === payTo) paid += BigInt(t.value || "0x0") / 10n ** 12n;
  }
  const head = BigInt(await rpcCall("eth_blockNumber", []));
  if (head - BigInt(rc.blockNumber) > 20000n) return { ok: false, error: "that payment is too old — send a new one" };
  return { ok: true, tx, from, paid };
}

/// the key a payment is remembered by (so one payment is used once): tx:<hash> or auth:<from>:<nonce>
export function paymentKey(p) {
  if (!p || p.bad) return "";
  const pl = p.payload || {};
  if (pl.txHash && /^0x[0-9a-fA-F]{64}$/.test(pl.txHash)) return `tx:${lc(pl.txHash)}`;
  if (pl.authorization && pl.authorization.from && pl.authorization.nonce) return `auth:${lc(pl.authorization.from)}:${lc(pl.authorization.nonce)}`;
  return "";
}
/// for an "exact" payload: who signed it (null if the signature doesn't check out)
export async function authSigner(p) {
  try {
    const a = p && p.payload && p.payload.authorization, sig = p && p.payload && p.payload.signature;
    if (!a || !sig) return null;
    const who = recover(await authDigest(a), sig);
    return who === lc(a.from) ? who : null;
  } catch { return null; }
}

// ---------------- buying ----------------
/// Sign an EIP-3009 authorization from ARCIA's wallet for `amount` to `payTo` (x402 "exact" on Arc).
export async function signPayment({ payTo, amount, timeout = 300 }) {
  const sk = secret();
  if (!sk) throw new Error("ARCIA's wallet key isn't set");
  const from = addressOf(sk), now = Math.floor(Date.now() / 1000);
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const authorization = { from, to: lc(payTo), value: String(amount), validAfter: String(now - 60), validBefore: String(now + timeout), nonce };
  const sig = secp256k1.sign(await authDigest(authorization), sk, { prehash: false, format: "recovered" });
  const signature = bytesToHex(concat(sig.subarray(1, 65), Uint8Array.of(sig[0] + 27)));
  return { x402Version: 1, scheme: "exact", network: NETWORK, payload: { signature, authorization } };
}
export const encodePayment = (p) => Buffer.from(JSON.stringify(p)).toString("base64");

/// Arc terms out of a 402 answer (v1 body or v2 PAYMENT-REQUIRED header), or null.
export function arcTerms(body, headers) {
  let list = body && Array.isArray(body.accepts) ? body.accepts : null;
  if (!list && headers) { try { const h = headers.get("payment-required"); if (h) list = JSON.parse(Buffer.from(h, "base64").toString("utf8")).accepts; } catch { list = null; } }
  return (list || []).find((a) => a && a.scheme === "exact" && (a.network === NETWORK || a.network === "arc") && lc(a.asset) === USDC && isAddr(a.payTo)) || null;
}

/// USDC balance of an address on Arc (6 decimals)
export async function usdcOf(addr) {
  const [b] = await ethCalls([{ to: USDC, data: "0x70a08231" + pad(lc(addr)) }]);
  return b ? BigInt(b) : 0n;
}
