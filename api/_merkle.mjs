// api/_merkle.mjs — the ARCIRCLE NFT raffle's list as a Merkle tree (contracts/ArcircleNft.sol settle()):
//   leaf  = keccak256(keccak256(abi.encode(address wallet, uint256 start, uint256 end)))   (OpenZeppelin "standard")
//   nodes = keccak256 of the two children, smaller first (OpenZeppelin MerkleProof)
// Each wallet's ticket range [start, end) is as wide as its weight, in list order; the drawn ticket is seed % total.
import { keccak_256 } from "@noble/hashes/sha3.js";

const strip = (h) => String(h || "").replace(/^0x/, "");
const hexToBytes = (h) => { h = strip(h); const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a; };
const hex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const word = (x) => (typeof x === "bigint" ? x.toString(16) : strip(x).toLowerCase()).padStart(64, "0");
export const keccakHex = (h) => hex(keccak_256(hexToBytes(h)));

export function leafOf(a, s, e) {
  return keccakHex(keccakHex("0x" + word(a) + word(BigInt(s)) + word(BigInt(e))));
}
const pairOf = (x, y) => (BigInt(x) < BigInt(y) ? keccakHex(x + strip(y)) : keccakHex(y + strip(x)));

/// rows: [{ a, w (BigInt weight), ... }] in list order → { root, total, ranges: [{ ...row, s, e }], layers }
export function build(rows) {
  let at = 0n;
  const ranges = rows.map((r) => { const s = at; at += BigInt(r.w); return { ...r, s, e: at }; });
  const layers = [ranges.map((r) => leafOf(r.a, r.s, r.e))];
  while (layers[layers.length - 1].length > 1) {
    const l = layers[layers.length - 1], n = [];
    for (let i = 0; i < l.length; i += 2) n.push(i + 1 < l.length ? pairOf(l[i], l[i + 1]) : l[i]);
    layers.push(n);
  }
  return { root: layers[layers.length - 1][0] || null, total: at, ranges, layers };
}

export function proofOf(t, i) {
  const p = [];
  for (let k = 0; k < t.layers.length - 1; k++) { const l = t.layers[k], j = i ^ 1; if (j < l.length) p.push(l[j]); i >>= 1; }
  return p;
}

/// the range holding `ticket` (binary search over the ranges)
export function indexOfTicket(ranges, ticket) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1, r = ranges[m];
    if (ticket < r.s) hi = m - 1; else if (ticket >= r.e) lo = m + 1; else return m;
  }
  return -1;
}

export function verify(proof, root, a, s, e) {
  let h = leafOf(a, s, e);
  for (const p of proof) h = pairOf(h, p);
  return BigInt(h) === BigInt(root);
}
