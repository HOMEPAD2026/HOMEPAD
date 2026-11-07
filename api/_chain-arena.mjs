// api/_chain-arena.mjs — CHAIN ARENA (arcircle.app/galaxy/arena, GXA): Arc, Robinhood Chain and Solana side by side, live.
// GET /api/social?arc=arena → { at, chains: { arc, rh, sol } } — each chain's numbers in one shape (null = not measured):
//   tps        user transactions a second (Solana: non-vote only — its validators' votes are transactions too)
//   blockTime  seconds a block (Solana: a slot)
//   feeUsd     the average fee a transaction, in dollars
//   usdMin     dollars moved a minute (Arc: USDC, its native coin; Robinhood Chain: ETH at its live price + USDC;
//              Solana: USDC by its token balances, estimated from the sampled blocks) — Robinhood Chain's dollar is USDG
// Measured by a worker 2026-11-07: Solana's getBlock needs maxSupportedTransactionVersion 1 (v1 transactions), its samples
// no longer count votes (numTransactions = numNonVoteTransactions), the public RPC refuses browsers (403 with an Origin) and
// answers ~10 getBlock calls in 10 s — so this runs on the server, one block a refresh.
//   failRate   the share of transactions that failed
//   wallets    distinct senders over the window (EVM only: every transaction is read)
//   basis      how it was measured (shown on the page)
// Arc and Robinhood Chain come from their galaxy feeds (api/_arc-galaxy.mjs: every block of the last ten minutes);
// Solana reads getRecentPerformanceSamples (the cluster's own counters) for the rate and samples one block in full
// (transactionDetails "accounts") every refresh for fees, failures and USDC. Read-only and keyless.
export const SOL_RPCS = () => [process.env.SOLANA_RPC_URL, "https://api.mainnet-beta.solana.com"].filter(Boolean);
export const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const VOTE = "Vote111111111111111111111111111111111111111";
export const SOL_KEEP = 40;          // sampled blocks kept (≈ 13 min at one a 20 s refresh)
export const SOL_EVERY_MS = 20e3;    // a refresh at most this often
let sIdx = 0;
async function solRpc(method, params, ms = 9000) {
  const urls = SOL_RPCS(); let err;
  for (let k = 0; k < urls.length; k++) {
    const u = urls[(sIdx + k) % urls.length];
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(ms) });
      if (r.status === 429 || r.status >= 500) throw new Error("rpc " + r.status);
      const j = await r.json(); sIdx = (sIdx + k) % urls.length; return j;
    } catch (e) { err = e; }
  }
  throw err || new Error("no solana rpc");
}
async function solUsd() {
  try { const j = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)); const p = j && j.data ? Number(j.data.amount) : null; return p > 0 ? p : null; } catch { return null; }
}

/// one Solana block (transactionDetails "accounts") → its non-vote summary
export function solBlock(b) {
  const out = { n: 0, votes: 0, fail: 0, fee: 0, usdc: 0, payers: new Set(), t: (b && b.blockTime ? b.blockTime * 1000 : 0) };
  for (const x of (b && b.transactions) || []) {
    const keys = ((x.transaction && x.transaction.accountKeys) || []).map((k) => (typeof k === "string" ? k : k && k.pubkey));
    if (keys.includes(VOTE)) { out.votes++; continue; }
    const m = x.meta || {};
    out.n++; if (m.err) out.fail++; out.fee += Number(m.fee) || 0;
    if (keys[0]) out.payers.add(keys[0]);
    // USDC moved: the sum of the owners' increases of the USDC mint's balance (a send counts once, not twice)
    const pre = new Map(), up = [];
    for (const t of m.preTokenBalances || []) if (t.mint === SOL_USDC) pre.set(t.accountIndex, Number(t.uiTokenAmount && t.uiTokenAmount.uiAmountString) || 0);
    for (const t of m.postTokenBalances || []) if (t.mint === SOL_USDC) { const d = (Number(t.uiTokenAmount && t.uiTokenAmount.uiAmountString) || 0) - (pre.get(t.accountIndex) || 0); if (d > 0) up.push(d); }
    out.usdc += up.reduce((s, v) => s + v, 0);
  }
  return out;
}

export function makeSolana({ rpc = solRpc, price = solUsd, now = () => Date.now(), every = SOL_EVERY_MS } = {}) {
  const st = { samples: null, blocks: [], px: null, at: 0, busy: null, err: null, out: null, slot: 0 };
  async function refresh() {
    const t = now();
    const [ps, px, sl] = await Promise.all([rpc("getRecentPerformanceSamples", [10]), price().catch(() => null), rpc("getSlot", [{ commitment: "confirmed" }])]);
    if (ps && Array.isArray(ps.result)) st.samples = ps.result;
    if (px) st.px = px;
    const slot = sl && sl.result;
    if (slot) {
      for (let k = 3; k < 5; k++) { // a recent slot may be skipped (no block): step back once (getBlock allows ~10 calls / 10 s)
        const b = await rpc("getBlock", [slot - k, { maxSupportedTransactionVersion: 1, transactionDetails: "accounts", rewards: false, commitment: "confirmed" }]).catch(() => null);
        if (b && b.result) { st.blocks.push(solBlock(b.result)); st.slot = slot - k; break; }
      }
      while (st.blocks.length > SOL_KEEP) st.blocks.shift();
    }
    st.err = null; st.at = t; st.out = shape(t); return st.out;
  }
  function shape(t) {
    const S = st.samples || [], secs = S.reduce((s, x) => s + (x.samplePeriodSecs || 0), 0), slots = S.reduce((s, x) => s + (x.numSlots || 0), 0);
    const all = S.reduce((s, x) => s + (x.numTransactions || 0), 0), nv = S.reduce((s, x) => s + (x.numNonVoteTransactions || 0), 0);
    const B = st.blocks, n = B.reduce((s, b) => s + b.n, 0), fee = B.reduce((s, b) => s + b.fee, 0), fail = B.reduce((s, b) => s + b.fail, 0), usdc = B.reduce((s, b) => s + b.usdc, 0);
    const blockTime = slots ? secs / slots : null;
    return {
      chain: "solana", at: t, slot: st.slot, sampled: B.length,
      tps: secs && S.some((x) => x.numNonVoteTransactions != null) ? nv / secs : null, tpsAll: secs ? all / secs : null,
      blockTime, feeUsd: n && st.px ? (fee / n) / 1e9 * st.px : null, feeSol: n ? fee / n / 1e9 : null, solUsd: st.px,
      failRate: n ? fail / n : null,
      usdMin: B.length && blockTime ? (usdc / B.length) / blockTime * 60 : null, // per sampled block → per minute
      wallets: null,
    };
  }
  async function live() {
    const t = now();
    if (st.out && t - st.at < every) return st.out;
    if (st.busy) return st.busy;
    st.busy = refresh().catch((e) => { st.err = String((e && e.message) || e).slice(0, 120); if (st.out) return { ...st.out, stale: true, err: st.err }; throw e; }).finally(() => { st.busy = null; });
    return st.busy;
  }
  return { live, state: st, shape };
}

/// a galaxy feed's numbers in the arena's shape
export function fromGalaxy(g, chain) {
  if (!g || !g.stats) return null;
  const s = g.stats;
  return {
    chain, at: g.at, head: g.head, stale: !!g.stale,
    tps: s.tps1m != null ? s.tps1m : s.tps, blockTime: s.blockTime,
    feeUsd: s.feeTxs ? s.fee10m / s.feeTxs / 1e6 : null,
    usdMin: s.span > 0 ? (s.usd10m / 100) / s.span * 60 : null,
    failRate: s.failRate, wallets: s.wallets, txs: s.txs, span: s.span,
  };
}

let sol = null;
export const solanaOf = () => sol || (sol = makeSolana());
/// the three side by side; a chain that can't be read right now is null with its error
export async function arena({ galaxy, solana = solanaOf() } = {}) {
  const [a, r, s] = await Promise.allSettled([galaxy("mainnet"), galaxy("robinhood"), solana.live()]);
  const err = (x) => String((x.reason && x.reason.message) || x.reason || "").slice(0, 100);
  return {
    at: Date.now(),
    chains: {
      arc: a.status === "fulfilled" ? fromGalaxy(a.value, "arc") : { error: err(a) },
      rh: r.status === "fulfilled" ? fromGalaxy(r.value, "robinhood") : { error: err(r) },
      sol: s.status === "fulfilled" ? s.value : { error: err(s) },
    },
  };
}
