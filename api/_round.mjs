// api/_round.mjs — reads of the CirclePad round escrow, safe for both the
// edge (/round share page) and Node functions (og image, /api/social).
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ethCalls, pad, wAddr } from "./_arc.mjs";

export const ESCROW = "0xc5998d7ce728fdd6f77217fde775aab90ec61703";
import { ARCIRCLE_TOKEN, ARCIRCLE_LIVE } from "./_arcircle.mjs";
// "" while $ARCIRCLE is not live (see _arcircle.mjs)
export const ARCIRCLE = ARCIRCLE_TOKEN.toLowerCase();
export { ARCIRCLE_LIVE };
export const FACTORY = "0x0ebd6df354056ff469f17f8fd14dc0d2c87bd65e";
// BigPadVote for Round #1 (config-arc.js CIRCLEPAD_VOTE_ADDRESS) — "" before it's deployed
export const VOTE = "0x23c376615a58f059fc4bc83a38eb4acdf8d39ff2";
const te = new TextEncoder();
export const kec = (s) => "0x" + Array.from(keccak_256(te.encode(String(s))), (b) => b.toString(16).padStart(2, "0")).join("");
const sel = (sig) => kec(sig).slice(0, 10);
export const S = {
  started: sel("started()"), deadline: sel("deadline()"), totalRaised: sel("totalRaised()"), cap: sel("cap()"),
  recipient: sel("recipient()"), isOpen: sel("isOpen()"), distributed: sel("distributed()"), contributions: sel("contributions(address)"), contribute: sel("contribute()"),
  launches: "0x7b443a76", launchCount: "0x27cca59f", balanceOf: "0x70a08231",
  optionsSet: sel("optionsSet(uint8)"), votingEnds: sel("votingEnds()"),
  platformWallet: sel("platformWallet()"), treasuryWallet: sel("treasuryWallet()"), start: sel("start()"), withdraw: sel("withdraw()"),
};
export const CONTRIBUTED = kec("Contributed(address,uint256,uint256)");
export const big = (h) => (h ? BigInt(h) : 0n);
const lc = (a) => String(a || "").toLowerCase();

// Round #1's escrow is ESCROW; later rounds pass their own (api/_rounds.mjs keeps the list).
const roundCache = new Map();
export async function roundState(escrow = ESCROW) {
  escrow = lc(escrow);
  const c = roundCache.get(escrow);
  if (c && Date.now() - c.at < 15e3) return c.v;
  const r = await ethCalls(["started", "deadline", "totalRaised", "cap", "recipient", "isOpen", "distributed"].map((k) => ({ to: escrow, data: S[k] })));
  if (r[0] == null || r[4] == null) throw new Error("escrow unreadable");
  // distributed: the recipient has sent the 80/15/5 split out of the escrow (null if unreadable this time)
  const v = { started: big(r[0]) > 0n, deadline: Number(big(r[1])), totalRaised: big(r[2]), cap: big(r[3]), recipient: lc(wAddr(r[4], 0)), isOpen: big(r[5]) > 0n, distributed: r[6] == null ? null : big(r[6]) > 0n };
  roundCache.set(escrow, { at: Date.now(), v });
  return v;
}
export const forgetRound = (escrow) => roundCache.delete(lc(escrow));
export async function contributionOf(wallet, escrow = ESCROW) {
  const [h] = await ethCalls([{ to: lc(escrow), data: S.contributions + pad(wallet) }]);
  return big(h);
}
