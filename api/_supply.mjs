// api/_supply.mjs — $ARCIRCLE's supply for CoinGecko / CoinMarketCap (GET /api/social?supply=arcircle[&q=…]).
// Read live from Arc, in whole tokens:
//   max          1,000,000,000 — minted once at launch (ArgusV5RewardedToken has no mint function)
//   burned       what sits at 0x…dEaD (burn-to-vote, Builder Mine, ARCIRCLE Orders fee burns, …) + any zero-address burn
//   total        max − burned (the coins that exist)
//   circulating  total − the ARCIRCLE PAD treasury and platform wallets − $ARCIRCLE locked in ARCIRCLE Staking
// $ARCIRCLE bridged to Robinhood Chain (ARCIRCLE OMNI) stays counted once: the Arc lockbox holds it while the same
// amount circulates on Robinhood Chain.
import { ethCalls, pad } from "./_arc.mjs";
import { ARCIRCLE_TOKEN } from "./_arcircle.mjs";
import { TREASURY } from "./_token.mjs";

export const MAX = 1e9;
const DEAD = "0x000000000000000000000000000000000000dead";
export const EXCLUDED = [
  { address: TREASURY, label: "ARCIRCLE PAD treasury" },
  { address: "0x1a35a754a4251e46971184046ac57e8ad621672e", label: "ARCIRCLE PAD platform wallet" },
  { address: "0x301e1e8dcb43cdddd3244889063ad4220536b38a", label: "ARCIRCLE Staking (locked by holders)" }, // api/_stake.mjs STAKING_DEFAULT
];
let mem = null;

export async function supply() {
  if (mem && Date.now() - mem.at < 60e3) return mem.v;
  const calls = [{ to: ARCIRCLE_TOKEN, data: "0x18160ddd" }, { to: ARCIRCLE_TOKEN, data: "0x70a08231" + pad(DEAD) },
    ...EXCLUDED.map((x) => ({ to: ARCIRCLE_TOKEN, data: "0x70a08231" + pad(x.address) }))];
  const r = await ethCalls(calls);
  if (!r[0]) throw new Error("Arc's RPC didn't answer");
  const tok = (h) => (h ? Number(BigInt(h) / 10n ** 12n) / 1e6 : 0); // 6 decimals are plenty
  const onChain = tok(r[0]), dead = tok(r[1]);
  const burned = dead + Math.max(0, MAX - onChain); // zero-address burns shrink totalSupply()
  const total = MAX - burned;
  const excluded = EXCLUDED.map((x, i) => ({ ...x, tokens: tok(r[2 + i]) }));
  const circulating = total - excluded.reduce((s, x) => s + x.tokens, 0);
  const round = (n) => Math.floor(n * 100) / 100;
  const v = { token: ARCIRCLE_TOKEN, chain: "Arc (Circle) mainnet, chain id 5042", decimals: 18, max: MAX, total: round(total), circulating: round(circulating), burned: round(burned),
    excluded: excluded.map((x) => ({ ...x, tokens: round(x.tokens) })), at: Math.floor(Date.now() / 1000) };
  mem = { at: Date.now(), v };
  return v;
}
