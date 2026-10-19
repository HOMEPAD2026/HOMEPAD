// api/_world-gmreward.mjs — rewards the GM sends players in $ARCIRCLE, from the GM's own wallet.
//
//   The game never holds or sends the tokens: the GM's wallet signs an ordinary ERC-20 transfer to the player's wallet,
//   then the game asks the server to note it (world-gm-reward-log). The server reads the transaction's receipt and
//   notes only what really moved: $ARCIRCLE, from a GM wallet, to that player (the amount summed from the Transfer
//   logs). One note a transaction. Anyone may read a player's list (the transfers are public on Arc anyway).
//
//   POST world-gm-reward-log { …sig (a GM wallet), to, tx, note? } → { ok, reward } · 202 { pending } while unconfirmed
//   GET  ?world=gm-rewards&wallet=0x…                              → { list: [{ tx, amount, tokens, from, at, note }], total }
//   GET  ?world=gm-rewards                                         → { recent: [...] } (the last 50, everyone)
//
// Firestore: worldGmRewardTx/<tx> (noted, once) · worldGmRewards/<w> { list } · worldStats/gmRewards { recent }
const lc = (s) => String(s || "").toLowerCase();
const pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/// wei (18 decimals) → a plain number of tokens, four decimals kept
export const tokensOf = (wei) => Number(BigInt(wei) / 10n ** 14n) / 1e4;

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), receipt(tx), token (the $ARCIRCLE address), nameOf(w) }
export function makeGmReward(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  async function log(b) {
    const s = signer(b); if (s.err) return s.err; const gm = s.wallet;
    if (!deps.isGM(gm)) return json(403, { error: "only a GM wallet can note a reward" });
    const to = lc(b.to), tx = lc(b.tx), note = String(b.note || "").replace(/[<>]/g, "").slice(0, 80);
    if (!/^0x[0-9a-f]{40}$/.test(to)) return json(400, { error: "that isn't a wallet address" });
    if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "that isn't a transaction hash" });
    if (await one(`worldGmRewardTx/${tx}`)) return json(409, { error: "this transaction is already noted" });
    if (!deps.receipt) return json(503, { error: "the chain can't be read right now" });
    const rc = await deps.receipt(tx).catch(() => null);
    if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet" });
    if (rc.status !== "0x1") return json(400, { error: "the transaction failed" });
    const wei = (rc.logs || []).filter((l) => lc(l.address) === lc(deps.token) && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[1]) === pad32(gm) && lc(l.topics[2]) === pad32(to)).reduce((a, l) => a + BigInt(l.data), 0n);
    if (wei <= 0n) return json(400, { error: "no $ARCIRCLE went from your wallet to that player in this transaction" });
    const at = now(), reward = { tx, amount: wei.toString(), tokens: tokensOf(wei), from: gm, at, note };
    if (!(await commit([{ create: `worldGmRewardTx/${tx}`, data: { to, at } }])).ok) return json(409, { error: "this transaction is already noted" });
    const cur = (await one(`worldGmRewards/${to}`)) || {}, list = Array.isArray(cur.list) ? cur.list : [];
    await setDoc(`worldGmRewards/${to}`, { list: [reward, ...list].slice(0, 200) });
    const st = (await one("worldStats/gmRewards")) || {}, name = await (deps.nameOf ? deps.nameOf(to) : Promise.resolve("")).catch(() => "");
    await setDoc("worldStats/gmRewards", { recent: [{ ...reward, to, name }, ...(Array.isArray(st.recent) ? st.recent : [])].slice(0, 50) }).catch(() => {});
    return json(200, { ok: true, reward });
  }
  return {
    async read(v, url) {
      if (v !== "gm-rewards") return null;
      const w = lc(url && url.searchParams && url.searchParams.get("wallet"));
      if (!w) return json(200, { recent: ((await one("worldStats/gmRewards")) || {}).recent || [] }, "public, max-age=20");
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(400, { error: "wallet must be an address" });
      const list = ((await one(`worldGmRewards/${w}`)) || {}).list || [];
      const total = list.reduce((a, r) => a + BigInt(r.amount || "0"), 0n);
      return json(200, { list, total: total.toString(), tokens: tokensOf(total) }, "no-store");
    },
    async handle(b) { return b.action === "world-gm-reward-log" ? log(b) : null; },
  };
}
