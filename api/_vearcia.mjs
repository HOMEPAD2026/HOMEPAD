// api/_vearcia.mjs — veARCIA (contracts/ArciaStaking.sol on Robinhood Chain): the $ARCIRCLE holder boost.
//   holding(wallet)   $ARCIRCLE the wallet holds: on Arc (in the wallet + locked in ARCIRCLE Staking) and on
//                     Robinhood Chain (ArcircleOFT)
//   boostNote(wallet) the tier (0 none · 1 ≥1M → 1.2x · 2 ≥5M → 1.5x · 3 ≥10M → 2.0x) signed by ARCIA_BOOST_KEY, ready
//                     for ArciaStaking.applyBoost(wallet, tier, issued, until, signature). A note lasts 7 days.
// The key only signs these notes (it holds nothing and sends no transactions). Contract: env VEARCIA_ADDRESS ("none"
// turns it off), else VEARCIA_DEFAULT.
import { evmChain } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export const VEARCIA_DEFAULT = ""; // contracts/scripts/deploy-arcia-staking-rh.js — filled in once deployed
export const VEARCIA_DEFAULT_BLOCK = 0;
const env = (k) => String(process.env[k] || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const E18 = 10n ** 18n;
export const TIERS = [0n, 1_000_000n * E18, 5_000_000n * E18, 10_000_000n * E18]; // tier i from TIERS[i] $ARCIRCLE
export const BOOST_BPS = [10000, 12000, 15000, 20000];

export const CFG = {
  arcRpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  rhRpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  chainId: 4663,
  address: () => { const e = env("VEARCIA_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : isAddr(VEARCIA_DEFAULT) ? lc(VEARCIA_DEFAULT) : null; },
  fromBlock: () => Number(env("VEARCIA_BLOCK")) || VEARCIA_DEFAULT_BLOCK || 0,
  key: () => env("ARCIA_BOOST_KEY") || null,
  arcircle: "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7", // $ARCIRCLE on Arc
  staking: "0x301e1e8dcb43cdddd3244889063ad4220536b38a", // ARCIRCLE Staking (veARCIRCLE) on Arc: locked $ARCIRCLE counts
  arcircleRh: "0x6f9ebd0dfc6de9ed47eec18efeb69a9b97c71ee4", // $ARCIRCLE on Robinhood Chain (ArcircleOFT)
  ttl: 7 * 86400,
  now: () => Math.floor(Date.now() / 1000),
};
export function configure(o) { Object.assign(CFG, o); arc = rh = null; }
let arc = null, rh = null;
const arcChain = () => (arc = arc || evmChain({ rpcs: CFG.arcRpcs, chainId: 5042 }));
const rhChain = () => (rh = rh || evmChain({ rpcs: CFG.rhRpcs, chainId: CFG.chainId }));

const hexToBytes = (h) => { h = String(h).replace(/^0x/, ""); if (h.length % 2) h = "0" + h; const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a; };
const bytesToHex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const word = (v) => BigInt(v).toString(16).padStart(64, "0");
const addrWord = (a) => lc(a).replace(/^0x/, "").padStart(64, "0");
const sel = (sig) => bytesToHex(keccak_256(new TextEncoder().encode(sig)).subarray(0, 4)).slice(2);
const SEL_BAL = sel("balanceOf(address)"), SEL_LOCKED = sel("locked(address)");
const keyBytes = (k) => (/^(0x)?[0-9a-fA-F]{64}$/.test(String(k || "")) ? hexToBytes(k) : null);
export const signerOf = (k) => { const sk = keyBytes(k); return sk ? bytesToHex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1)).subarray(12)) : null; };

async function call(ch, to, data) {
  const r = await ch.rpcCall("eth_call", [{ to, data: "0x" + data }, "latest"]);
  return r && r !== "0x" ? r : "0x0";
}
const first = (hex) => BigInt("0x" + (String(hex).replace(/^0x/, "").slice(0, 64) || "0"));

/// $ARCIRCLE the wallet holds, in wei: Arc wallet + Arc veARCIRCLE lock + Robinhood Chain wallet. A chain that can't be
/// read counts as 0 (and is named in `missing`).
export async function holding(wallet) {
  const w = addrWord(wallet), missing = [];
  const safe = (p, what) => p.then(first).catch(() => { missing.push(what); return 0n; });
  const [arcBal, locked, rhBal] = await Promise.all([
    safe(call(arcChain(), CFG.arcircle, SEL_BAL + w), "arc"),
    safe(call(arcChain(), CFG.staking, SEL_LOCKED + w), "staking"), // locked(address) → (uint128 amount, uint64 end, bool permanent)
    safe(call(rhChain(), CFG.arcircleRh, SEL_BAL + w), "robinhood"),
  ]);
  return { arc: arcBal, staked: locked, rh: rhBal, total: arcBal + locked + rhBal, missing };
}
export const tierOf = (total) => { let t = 0; for (let i = 1; i < TIERS.length; i++) if (total >= TIERS[i]) t = i; return t; };

/// keccak256(abi.encode(keccak256("veARCIA boost"), chainid, contract, user, tier, issued, until)) — ArciaStaking.boostHash
export function boostHash(contract, user, tier, issued, until, chainId = CFG.chainId) {
  const type = bytesToHex(keccak_256(new TextEncoder().encode("veARCIA boost"))).slice(2);
  return keccak_256(hexToBytes(type + word(chainId) + addrWord(contract) + addrWord(user) + word(tier) + word(issued) + word(until)));
}
export function signNote(key, contract, user, tier, issued, until, chainId = CFG.chainId) {
  const sk = keyBytes(key); if (!sk) throw new Error("no signing key");
  const h = boostHash(contract, user, tier, issued, until, chainId);
  const prefix = new TextEncoder().encode("\x19Ethereum Signed Message:\n32");
  const msg = new Uint8Array(prefix.length + 32); msg.set(prefix); msg.set(h, prefix.length);
  const sig = secp256k1.sign(keccak_256(msg), sk, { prehash: false, format: "recovered" });
  return bytesToHex(sig.subarray(1, 33)) + bytesToHex(sig.subarray(33, 65)).slice(2) + (27 + sig[0]).toString(16);
}

/// The signed boost note for `wallet` (or why there isn't one).
export async function boostNote(wallet) {
  if (!isAddr(wallet)) return { ok: false, error: "wallet must be an address" };
  const contract = CFG.address();
  const h = await holding(wallet);
  const tier = tierOf(h.total);
  const out = { ok: true, wallet: lc(wallet), tier, bps: BOOST_BPS[tier], held: (h.total / E18).toString(), parts: { arc: (h.arc / E18).toString(), staked: (h.staked / E18).toString(), robinhood: (h.rh / E18).toString() }, missing: h.missing, next: tier < 3 ? (TIERS[tier + 1] / E18).toString() : null, contract, chainId: CFG.chainId };
  const key = CFG.key();
  if (!contract || !key) return { ...out, signed: false, reason: !contract ? "veARCIA isn't deployed yet" : "boost signing isn't switched on yet" };
  if (h.missing.length) return { ...out, signed: false, reason: "couldn't read every chain — try again in a moment" }; // never sign a tier read from a partial view
  const issued = CFG.now(), until = issued + CFG.ttl;
  return { ...out, signed: true, issued, until, signature: signNote(key, contract, wallet, tier, issued, until), signer: signerOf(key) };
}
