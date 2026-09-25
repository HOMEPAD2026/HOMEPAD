// api/_round.mjs — reads of the CirclePad round escrow, safe for both the
// edge (/round share page) and Node functions (og image, /api/social).
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ethCalls, pad, wAddr } from "./_arc.mjs";

export const ESCROW = "0xc5998d7ce728fdd6f77217fde775aab90ec61703";
export const ARCIRCLE = "0x933a94b475fa9d8ef94fa564e38dda400a595aa1";
export const FACTORY = "0x0ebd6df354056ff469f17f8fd14dc0d2c87bd65e";
const te = new TextEncoder();
export const kec = (s) => "0x" + Array.from(keccak_256(te.encode(String(s))), (b) => b.toString(16).padStart(2, "0")).join("");
const sel = (sig) => kec(sig).slice(0, 10);
export const S = {
  started: sel("started()"), deadline: sel("deadline()"), totalRaised: sel("totalRaised()"), cap: sel("cap()"),
  recipient: sel("recipient()"), isOpen: sel("isOpen()"), contributions: sel("contributions(address)"), contribute: sel("contribute()"),
  launches: "0x7b443a76", launchCount: "0x27cca59f", balanceOf: "0x70a08231",
};
export const CONTRIBUTED = kec("Contributed(address,uint256,uint256)");
export const big = (h) => (h ? BigInt(h) : 0n);
const lc = (a) => String(a || "").toLowerCase();

let roundCache = null;
export async function roundState() {
  if (roundCache && Date.now() - roundCache.at < 15e3) return roundCache.v;
  const r = await ethCalls(["started", "deadline", "totalRaised", "cap", "recipient", "isOpen"].map((k) => ({ to: ESCROW, data: S[k] })));
  if (r[0] == null || r[4] == null) throw new Error("escrow unreadable");
  const v = { started: big(r[0]) > 0n, deadline: Number(big(r[1])), totalRaised: big(r[2]), cap: big(r[3]), recipient: lc(wAddr(r[4], 0)), isOpen: big(r[5]) > 0n };
  roundCache = { at: Date.now(), v };
  return v;
}
export async function contributionOf(wallet) {
  const [h] = await ethCalls([{ to: ESCROW, data: S.contributions + pad(wallet) }]);
  return big(h);
}
