// api/_predict.mjs — ARCIRCLE Predict (contracts/ArcPredict.sol): scheduled UP / DOWN rounds on a token's Uniswap v4
// pool. Round e runs [start + e·d, start + (e+1)·d), and betting on it opens when round e−1 locks. One contract per chain:
//   Arc              bets in native USDC; markets on Arc tokens' USDC pools (the default exports below)
//   Robinhood Chain  bets in ETH; markets on graduated Pons V2 coins' ETH pools, listed by the team (export RH)
// Each instance has:
//   state()          every market: the live round, the round open for bets, the price, last results, badges
//   mine(user)       a wallet's recent bets + what it can claim, its referrer and referral earnings, its stats
//   chart(m)         the pool's price through the live round (its swaps), for the round card's chart
//   feed()           the latest bets on every market
//   leaderboard()    this week's and all-time PnL / volume leaders (kept up to date by the keeper)
//   tick()           the keeper (the contract's operator): at every round boundary it samples the pool three times in
//                    different blocks, then settles — the contract finalizes the boundary on the median. Prices only come
//                    from the pool. Once an hour it pushes the fees to feeTo, it keeps the leaderboard, and it posts big
//                    rounds to Telegram.
// Amounts (bets, pots, volume) are in the chain's bet unit (`unit`: USDC or ETH, `unitUsd` its dollar price); token prices
// are in dollars (on Robinhood Chain the pool's ETH price × ETH/USD, or in ETH when that price isn't known: `pxUnit`).
// Arc:  env PREDICT_ADDRESS ("none" turns it off), else PREDICT_DEFAULT; keeper PREDICT_KEEPER_KEY, else ORDERS_KEEPER_KEY.
// RH:   env PREDICT_RH_ADDRESS ("none" turns it off), else PREDICT_RH_DEFAULT; keeper PREDICT_RH_KEEPER_KEY, else
//       ORDERS_KEEPER_RH_KEY; Telegram PREDICT_RH_TG_CHAT, else PREDICT_TG_CHAT.
import { evmChain, addressOfKey } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { priceOf } from "./_liq-core.mjs";

export const PREDICT_DEFAULT = "0x41149F8ce23d9B4E737e51C97fFE14bBb4C09ce6"; // ArcPredict on Arc (deployed 2026-10-02)
export const PREDICT_DEFAULT_BLOCK = 23867674; // its deployment block (the leaderboard starts there)
export const PREDICT_RH_DEFAULT = "0x774730acdb1446512E763148B2cbb63B3c7FAFDB"; // ArcPredict on Robinhood Chain (deployed 2026-10-03)
export const PREDICT_RH_DEFAULT_BLOCK = 78758781; // its deployment block
const env = (k) => String(process.env[k] || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const USDC = "0x3600000000000000000000000000000000000000";
const RH_WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const ARCIRCLE = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7";
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951"; // Uniswap v4 PoolManager (the same address on Arc and Robinhood Chain)
const SITE = "https://www.arcircle.app";
export function memStore() { const m = new Map(); return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); } }; }

// ---------------------------------------------------------------- ABI bits
const te = new TextEncoder();
const hex = (b) => Buffer.from(b).toString("hex");
const sel = (sig) => hex(keccak_256(te.encode(sig))).slice(0, 8);
const topic = (sig) => "0x" + hex(keccak_256(te.encode(sig)));
const S = {
  marketCount: sel("marketCount()"), roundCount: sel("roundCount()"), market: sel("market(uint256)"), marketKey: sel("marketKey(uint256)"),
  round: sel("round(uint256)"), roundsOf: sel("roundsOf(uint256,uint256,uint256)"), priceOf: sel("priceOf(uint256)"), bets: sel("bets(uint256,address)"),
  claimable: sel("claimable(uint256,address)"), roundOf: sel("roundOf(uint256,uint256)"), priceAt: sel("priceAt(uint256,uint256)"),
  bettingEpoch: sel("bettingEpoch(uint256)"), currentEpoch: sel("currentEpoch(uint256)"),
  refStakeOf: sel("refStakeOf(uint256,address)"), refClaimable: sel("refClaimable(uint256,address)"), referrerOf: sel("referrerOf(address)"), refEarned: sel("refEarned(address)"),
  paused: sel("paused()"), feeBps: sel("feeBps()"), refShare: sel("refShare()"), minBet: sel("minBet()"), maxBet: sel("maxBet()"), maxSide: sel("maxSide()"),
  minSamples: sel("minSamples()"), sampleGap: sel("sampleGap()"), volume: sel("volume()"), feesOwed: sel("feesOwed()"), feesPaid: sel("feesPaid()"),
  owner: sel("owner()"), operator: sel("operator()"), feeTo: sel("feeTo()"), listOpen: sel("listOpen()"), listBurn: sel("listBurn()"), minQuote: sel("minQuote(address)"),
  sample: sel("sample(uint256[])"), settle: sel("settle(uint256[])"), payFees: sel("payFees()"),
  symbol: sel("symbol()"), name: sel("name()"), decimals: sel("decimals()"), logo: sel("logo()"),
};
const TOPIC = {
  bet: topic("BetPlaced(uint256,address,uint256,uint64,bool,uint256,address)"),
  settled: topic("RoundSettled(uint256,uint256,uint64,uint8,uint160,uint160,uint256,uint256,uint256,uint256)"),
  swap: topic("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"),
};
const strip = (h) => String(h || "").replace(/^0x/, "");
const w = (v) => BigInt(v).toString(16).padStart(64, "0");
const wa = (a) => strip(a).toLowerCase().padStart(64, "0");
const W = (h, i) => { const s = strip(h).slice(i * 64, i * 64 + 64); return s ? BigInt("0x" + s) : 0n; };
const A = (h, i) => "0x" + strip(h).slice(i * 64 + 24, i * 64 + 64);
const encIds = (ids) => w(32) + w(ids.length) + ids.map(w).join("");
function str(h) { // an ABI string (or a bytes32 one)
  try {
    const s = strip(h);
    if (!s) return "";
    if (s.length === 64) return Buffer.from(s, "hex").toString("utf8").replace(/\0+$/, "");
    const len = Number(W(h, 1));
    return Buffer.from(s.slice(128, 128 + len * 2), "hex").toString("utf8");
  } catch { return ""; }
}
const RESULT = ["open", "up", "down", "refund"];
const decRound = (id, h) => (h ? { id: Number(id), market: Number(W(h, 0)), epoch: Number(W(h, 1)), feeBps: Number(W(h, 2)), refShare: Number(W(h, 3)),
  result: RESULT[Number(W(h, 4))] || "open", openP: W(h, 5), closeP: W(h, 6), up: W(h, 7), down: W(h, 8), refStake: W(h, 9) } : null);
const amt = (wei) => Number(wei) / 1e18; // bets are native value, 18 decimals (USDC on Arc, ETH on Robinhood Chain)
const call = (to, data) => ({ to, data: "0x" + data });
const durS = (d) => (d % 3600 === 0 ? d / 3600 + "h" : d / 60 + "m");
function weekKey(t) { const d = new Date(t * 1000); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); } // the week's Monday (UTC)

/// one chain's ARCIRCLE Predict
export function makePredict(over) {
  const CFG = {
    id: "arc", chainName: "Arc", chainId: 5042, unit: "USDC",
    rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
    address: () => null,
    fromBlock: () => 0,
    keeperKey: () => null,
    keeperHint: "the keeper key",
    usdc: USDC, // the contract's ERC-20 quote face
    qdec: (c) => 18, // a pool's quote decimals
    unitUsd: async () => 1, // the bet unit's dollar price (null: unknown)
    poolManager: PM,
    recent: 10, // settled rounds shown per market
    mineRounds: 40, // rounds per market looked at for a wallet
    cacheMs: 3000,
    logChunk: 9000,
    tgChat: () => "",
    tgMinUsd: 10, // a round's pot (in dollars) worth a Telegram post
    feeMin: 10n ** 18n, // fees owed before the keeper pushes them
    lbKey: "predict/lb", statusKey: "predict/status",
    link: (m) => `${SITE}/arc#predict?m=${m}`,
    dexChain: "arc",
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Math.floor(Date.now() / 1000),
    extras: true, // badges and logos (scanner, ARCIA, coin images) — off in tests
    badges: false,
    coinLogo: null, // async (token) → an image URL the chain's launchpad knows
    ...over,
  };
  let ch = null;
  const mem = new Map();
  function configure(o) { Object.assign(CFG, o || {}); ch = null; mem.clear(); lbMem = null; }
  const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: CFG.chainId }));
  const cached = async (k, ms, fn) => { const h = mem.get(k); if (h && Date.now() - h.t < ms) return h.v; const v = await fn(); mem.set(k, { t: Date.now(), v }); return v; };
  const unitUsd = () => cached("unitUsd", 60e3, async () => { try { const p = Number(await CFG.unitUsd()); return p > 0 ? p : null; } catch { return null; } });
  const usdOfPot = (x, u) => (u ? x * u : null);

  const metaCache = new Map();
  async function tokenMeta(tokens) {
    const need = [...new Set(tokens.map(lc))].filter((t) => !metaCache.has(t));
    if (need.length) {
      const r = await chain().ethCalls(need.flatMap((t) => [call(t, S.symbol), call(t, S.name), call(t, S.decimals)]));
      need.forEach((t, i) => metaCache.set(t, { sym: str(r[i * 3]) || "?", name: str(r[i * 3 + 1]) || "", dec: r[i * 3 + 2] ? Number(W(r[i * 3 + 2], 0)) : 18 }));
    }
    return Object.fromEntries(tokens.map((t) => [lc(t), metaCache.get(lc(t))]));
  }
  /// a token's picture: $ARCIRCLE's own, the launchpad's, else Dexscreener's (cached a day)
  const logoCache = new Map();
  async function logoOf(token) {
    token = lc(token);
    if (token === ARCIRCLE) return "/images/arcircle-mark-sm.png";
    const h = logoCache.get(token);
    if (h && Date.now() - h.t < 86400e3) return h.v;
    let v = null;
    if (CFG.coinLogo) { try { v = await CFG.coinLogo(token, chain()); } catch { /* next */ } }
    if (!v) {
      try {
        const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${CFG.dexChain}/${token}`, { signal: AbortSignal.timeout(4000) });
        const j = r.ok ? await r.json() : null;
        const p = Array.isArray(j) ? j.find((x) => x && x.info && x.info.imageUrl) : null;
        v = p ? p.info.imageUrl : null;
      } catch { /* none */ }
    }
    logoCache.set(token, { t: Date.now(), v });
    return v;
  }
  /// the scanner's score and ARCIA's call on a token, when they're known (never computed here)
  async function badgeOf(token, store) {
    const out = {};
    if (!CFG.badges) return out;
    try { const sc = await import("./_scan.mjs"); const s = await sc.scoreOf(token, { store, compute: false }); if (s && s.score != null) out.score = s.score; } catch { /* none */ }
    try { const ag = await import("./_agent.mjs"); const c = await ag.lastCall(store, token); if (c) out.call = c.call; } catch { /* none */ }
    return out;
  }

  // ---------------------------------------------------------------- reads
  async function reads(addr, names) {
    const r = await chain().ethCalls(names.map((n) => call(addr, S[n])));
    return Object.fromEntries(names.map((n, i) => [n, r[i]]));
  }
  /// a market's price function: the pool's √P → the token's price in the quote, × `scale` (dollars per quote unit)
  function pxFn(m, scale = 1) {
    const k = m.key || {};
    const d0 = m.tokenIs0 ? m.dec : CFG.qdec(k.currency0, CFG), d1 = m.tokenIs0 ? CFG.qdec(k.currency1, CFG) : m.dec;
    return (p) => { if (!p) return null; const v = priceOf(p, m.tokenIs0, d0, d1); return v == null ? null : v * scale; };
  }
  /// prices in dollars where the quote's dollar price is known: Arc's quote is USDC (1), Robinhood Chain's ETH
  async function pxScale() {
    if (CFG.unit === "USDC") return { scale: 1, pxUnit: "USD" };
    const u = await unitUsd();
    return u ? { scale: u, pxUnit: "USD" } : { scale: 1, pxUnit: CFG.unit };
  }

  async function marketsRaw(addr) {
    const g = await reads(addr, ["marketCount"]);
    if (g.marketCount == null) throw new Error(`${CFG.chainName}'s RPC didn't answer`);
    const n = Number(W(g.marketCount, 0));
    const ids = [...Array(n).keys()];
    const per = 6;
    const r = await chain().ethCalls(ids.flatMap((i) => [call(addr, S.market + w(i)), call(addr, S.marketKey + w(i)), call(addr, S.priceOf + w(i)),
      call(addr, S.roundsOf + w(i) + w(0) + w(CFG.recent + 2)), call(addr, S.bettingEpoch + w(i)), call(addr, S.currentEpoch + w(i))]));
    return ids.map((i) => {
      const h = r[i * per], k = r[i * per + 1], p = r[i * per + 2], rs = r[i * per + 3];
      if (!h) return null;
      const nr = rs ? Number(W(rs, 1)) : 0;
      return { id: i, token: lc(A(h, 0)), lister: lc(A(h, 1)), tokenIs0: W(h, 2) === 1n, duration: Number(W(h, 3)), lock: Number(W(h, 4)), start: Number(W(h, 5)),
        stopEpoch: W(h, 6), next: Number(W(h, 7)), samples: Number(W(h, 8)), poolId: "0x" + strip(h).slice(9 * 64, 10 * 64), rounds: Number(W(h, 10)),
        key: k ? { currency0: lc(A(k, 0)), currency1: lc(A(k, 1)), fee: Number(W(k, 2)), tickSpacing: Number(BigInt.asIntN(24, W(k, 3))), hooks: lc(A(k, 4)) } : null,
        priceP: p ? W(p, 0) : 0n, roundIds: [...Array(nr).keys()].map((j) => Number(W(rs, 2 + j))),
        betting: Number(W(r[i * per + 4], 0)), current: Number(W(r[i * per + 5], 0)) };
    }).filter(Boolean);
  }
  const head0 = () => ({ chain: CFG.id, chainId: CFG.chainId, unit: CFG.unit });

  /// everything the page shows
  async function state(opts = {}) {
    try { return await stateRun(opts); } catch (e) {
      ch = null; // another RPC on the retry
      try { return await stateRun({ ...opts, fresh: true }); } catch (e2) {
        const h = mem.get("good");
        if (h && Date.now() - h.t < 10 * 60e3) return { ...h.v, stale: true };
        throw e2;
      }
    }
  }
  async function stateRun({ fresh = false, store = null } = {}) {
    const addr = CFG.address();
    if (!addr) return { live: false, ...head0(), note: `ARCIRCLE Predict opens on ${CFG.chainName} once its contract is deployed.` };
    if (!fresh) { const h = mem.get("state"); if (h && Date.now() - h.t < CFG.cacheMs) return h.v; }
    const g = await reads(addr, ["roundCount", "paused", "feeBps", "refShare", "minBet", "maxBet", "maxSide", "volume", "feesOwed", "feesPaid", "owner", "operator", "feeTo", "listOpen", "listBurn"]);
    const mq = CFG.unit === "USDC" ? await chain().ethCalls([call(addr, S.minQuote + wa(CFG.usdc))]) : [null];
    const ms = await marketsRaw(addr);
    for (const m of ms) Object.assign(m, (await tokenMeta([m.token]))[m.token] || { sym: "?", name: "", dec: 18 });
    // the live round (current epoch) and the round open for bets (current or next): their round ids and boundary prices
    const q = ms.flatMap((m) => [call(addr, S.roundOf + w(m.id) + w(m.current)), call(addr, S.roundOf + w(m.id) + w(m.betting)), call(addr, S.priceAt + w(m.id) + w(m.current))]);
    const qr = q.length ? await chain().ethCalls(q) : [];
    ms.forEach((m, i) => { m.liveId = qr[i * 3] ? Number(W(qr[i * 3], 0)) : 0; m.betId = qr[i * 3 + 1] ? Number(W(qr[i * 3 + 1], 0)) : 0; m.openP = qr[i * 3 + 2] ? W(qr[i * 3 + 2], 0) : 0n; });
    const allRounds = [...new Set(ms.flatMap((m) => [...m.roundIds, m.liveId, m.betId]).filter(Boolean))];
    const rr = allRounds.length ? await chain().ethCalls(allRounds.map((id) => call(addr, S.round + w(id)))) : [];
    const R = new Map(allRounds.map((id, i) => [id, decRound(id, rr[i])]));
    const [lb, uu, sc] = await Promise.all([chain().latestBlock().catch(() => ({ ts: CFG.now() })), unitUsd(), pxScale()]);
    const extras = CFG.extras ? await Promise.all(ms.map(async (m) => ({ logo: await logoOf(m.token).catch(() => null), badge: await badgeOf(m.token, store).catch(() => ({})) }))) : ms.map(() => ({}));
    const out = {
      live: true, ...head0(), unitUsd: uu, pxUnit: sc.pxUnit, address: addr, now: lb.ts, paused: g.paused ? W(g.paused, 0) === 1n : false,
      feeBps: Number(W(g.feeBps, 0)), refShare: Number(W(g.refShare, 0)),
      limits: { minBet: amt(W(g.minBet, 0)), maxBet: amt(W(g.maxBet, 0)), maxSide: amt(W(g.maxSide, 0)) },
      volume: amt(W(g.volume, 0)), fees: amt(W(g.feesOwed, 0) + W(g.feesPaid, 0)), rounds: Number(W(g.roundCount, 0)),
      owner: g.owner ? lc(A(g.owner, 0)) : null, operator: g.operator ? lc(A(g.operator, 0)) : null, feeTo: g.feeTo ? lc(A(g.feeTo, 0)) : null,
      listing: { open: g.listOpen ? W(g.listOpen, 0) === 1n : false, burn: g.listBurn ? Number(W(g.listBurn, 0) / 10n ** 14n) / 1e4 : 0, minUsdc: mq[0] ? Number(W(mq[0], 0)) / 1e6 : null },
      markets: ms.map((m, i) => {
        const px = pxFn(m, sc.scale);
        const at = (e) => m.start + e * m.duration;
        const stopped = m.stopEpoch < 2n ** 63n;
        const rd = (id) => R.get(id) || null;
        const live = (() => {
          const r = rd(m.liveId), e = m.current;
          return { epoch: e, id: m.liveId || null, startAt: at(e), lockAt: at(e + 1) - m.lock, endAt: at(e + 1), open: m.next > e ? px(m.openP) : null, openPending: m.next <= e,
            up: r ? amt(r.up) : 0, down: r ? amt(r.down) : 0, betting: m.betting === e && (!stopped || BigInt(e) < m.stopEpoch) };
        })();
        const nx = m.betting > m.current && (!stopped || BigInt(m.betting) < m.stopEpoch) ? (() => {
          const r = rd(m.betId), e = m.betting;
          return { epoch: e, id: m.betId || null, startAt: at(e), lockAt: at(e + 1) - m.lock, endAt: at(e + 1), up: r ? amt(r.up) : 0, down: r ? amt(r.down) : 0 };
        })() : null;
        const past = m.roundIds.map((id) => rd(id)).filter((r) => r && r.result !== "open").slice(0, CFG.recent).map((r) => ({
          id: r.id, epoch: r.epoch, result: r.result, endAt: at(r.epoch + 1), open: px(r.openP), close: px(r.closeP), up: amt(r.up), down: amt(r.down), feeBps: r.feeBps }));
        return { id: m.id, token: m.token, sym: m.sym, name: m.name, dec: m.dec, logo: extras[i].logo || null, badge: extras[i].badge || {}, lister: m.lister,
          duration: m.duration, lock: m.lock, start: m.start, stopped, poolId: m.poolId, key: m.key, price: px(m.priceP), rounds: m.rounds,
          betting: stopped && BigInt(m.betting) >= m.stopEpoch ? null : m.betting, live, next: nx, past };
      }),
    };
    mem.set("state", { t: Date.now(), v: out });
    mem.set("good", { t: Date.now(), v: out });
    return out;
  }

  /// a wallet's recent bets, what it can claim, its referrals and its stats
  async function mine(user, { rounds = CFG.mineRounds, store = null } = {}) {
    const addr = CFG.address();
    if (!addr) return { live: false, ...head0(), items: [] };
    if (!isAddr(user)) return { error: "a wallet address (0x…)" };
    const g = await reads(addr, ["marketCount"]);
    const n = Number(W(g.marketCount, 0));
    const rs = n ? await chain().ethCalls([...Array(n).keys()].map((i) => call(addr, S.roundsOf + w(i) + w(0) + w(rounds)))) : [];
    const ids = rs.flatMap((h) => (h ? [...Array(Number(W(h, 1))).keys()].map((j) => Number(W(h, 2 + j))) : []));
    const head = await chain().ethCalls([call(addr, S.referrerOf + wa(user)), call(addr, S.refEarned + wa(user))]);
    const ref = { referrer: head[0] && W(head[0], 0) > 0n ? lc(A(head[0], 0)) : null, earned: head[1] ? amt(W(head[1], 0)) : 0, claimable: 0, claimIds: [], invited: 0 };
    let items = [];
    if (ids.length) {
      const r = await chain().ethCalls(ids.flatMap((id) => [call(addr, S.bets + w(id) + wa(user)), call(addr, S.claimable + w(id) + wa(user)), call(addr, S.refStakeOf + w(id) + wa(user)), call(addr, S.refClaimable + w(id) + wa(user))]));
      const mineIds = ids.filter((_, i) => r[i * 4] && (W(r[i * 4], 0) > 0n || W(r[i * 4], 1) > 0n));
      const rr = mineIds.length ? await chain().ethCalls(mineIds.map((id) => call(addr, S.round + w(id)))) : [];
      items = mineIds.map((id, j) => {
        const i = ids.indexOf(id), b = r[i * 4], rd = decRound(id, rr[j]);
        const up = W(b, 0), down = W(b, 1);
        return { round: id, market: rd ? rd.market : null, epoch: rd ? rd.epoch : null, side: up > 0n ? "up" : "down", stake: amt(up + down), result: rd ? rd.result : "open",
          claimable: r[i * 4 + 1] ? amt(W(r[i * 4 + 1], 0)) : 0, claimed: W(b, 2) === 1n,
          pot: rd ? amt(rd.up + rd.down) : 0, sidePot: rd ? amt(up > 0n ? rd.up : rd.down) : 0, feeBps: rd ? rd.feeBps : 0 };
      }).sort((a, b) => b.round - a.round);
      ids.forEach((id, i) => {
        const rc = r[i * 4 + 3] ? amt(W(r[i * 4 + 3], 0)) : 0;
        if (r[i * 4 + 2] && W(r[i * 4 + 2], 0) > 0n) ref.invited += 1;
        if (rc > 0) { ref.claimable += rc; ref.claimIds.push(id); }
      });
    }
    const lbd = await lbDoc(store).catch(() => null);
    const st = lbd && lbd.users ? lbd.users[lc(user)] || null : null;
    // wallets that came through this one's link (from the bets the keeper has read), not rounds
    if (lbd && lbd.refBy) ref.invited = Math.max(Object.values(lbd.refBy).filter((r) => r === lc(user)).length, ref.invited ? 1 : 0);
    return { live: true, ...head0(), unitUsd: await unitUsd(), items, claimable: items.reduce((s, x) => s + x.claimable, 0), claimIds: items.filter((x) => x.claimable > 0).map((x) => x.round), ref,
      stats: st ? { pnl: st.pnl, vol: st.vol, n: st.n, wins: st.w, losses: st.l, streak: st.s, best: st.b, week: (st.wk && st.wk[weekKey(CFG.now())]) || { pnl: 0, vol: 0 } } : null };
  }

  // ---------------------------------------------------------------- block ↔ time
  async function blockRate() {
    return cached("rate", 600e3, async () => {
      const lb = await chain().latestBlock();
      const back = Math.max(0, lb.number - 20000);
      const b = await chain().rpcCall("eth_getBlockByNumber", ["0x" + back.toString(16), false]).catch(() => null);
      const sec = b ? (lb.ts - parseInt(b.timestamp, 16)) / Math.max(1, lb.number - back) : 0.5;
      return sec > 0 ? sec : 0.5;
    });
  }
  async function headTime() { return cached("head", 1500, () => chain().latestBlock()); }
  const blockAt = (head, rate, t) => Math.max(0, Math.floor(head.number - (head.ts - t) / rate));
  const timeAt = (head, rate, n) => Math.round(head.ts - (head.number - n) * rate);
  async function logsRange(filter, from, to) {
    const out = [];
    for (let a = from; a <= to; a += CFG.logChunk) {
      const b = Math.min(to, a + CFG.logChunk - 1);
      out.push(...((await chain().getLogs({ ...filter, fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) })) || []));
    }
    return out;
  }

  /// the pool's price through the live round: its swaps ([t, price] pairs, in the state's price unit)
  async function chart(m) {
    const addr = CFG.address();
    if (!addr) return { live: false, points: [] };
    m = Number(m);
    return cached("chart" + m, CFG.cacheMs, async () => {
      const st = await state();
      const mk = st.markets.find((x) => x.id === m);
      if (!mk) return { error: "no such market" };
      const [head, rate, sc] = await Promise.all([headTime(), blockRate(), pxScale()]);
      const from = Math.max(mk.live.startAt - Math.round(mk.duration / 2), 0);
      const logs = await logsRange({ address: CFG.poolManager, topics: [TOPIC.swap, mk.poolId] }, blockAt(head, rate, from), head.number).catch(() => []);
      const px = pxFn({ ...mk, tokenIs0: mk.key ? lc(mk.key.currency0) === mk.token : false }, sc.scale);
      const points = logs.map((l) => [timeAt(head, rate, parseInt(l.blockNumber, 16)), px(W(l.data, 2))]).filter((p) => p[1] > 0);
      return { live: true, chain: CFG.id, market: m, from, now: head.ts, open: mk.live.open, price: mk.price, pxUnit: sc.pxUnit, startAt: mk.live.startAt, endAt: mk.live.endAt, points: points.slice(-400) };
    });
  }

  /// the latest bets on every market
  async function feed({ limit = 30 } = {}) {
    const addr = CFG.address();
    if (!addr) return { live: false, items: [] };
    return cached("feed", CFG.cacheMs, async () => {
      const [head, rate] = await Promise.all([headTime(), blockRate()]);
      const logs = await logsRange({ address: addr, topics: [TOPIC.bet] }, Math.max(0, head.number - Math.max(2000, Math.round(3600 / rate))), head.number).catch(() => []);
      const items = logs.slice(-limit).reverse().map((l) => ({ round: Number(BigInt(l.topics[1])), user: lc("0x" + l.topics[2].slice(26)), market: Number(BigInt(l.topics[3])),
        epoch: Number(W(l.data, 0)), up: W(l.data, 1) === 1n, amount: amt(W(l.data, 2)), t: timeAt(head, rate, parseInt(l.blockNumber, 16)), tx: lc(l.transactionHash) }));
      return { live: true, chain: CFG.id, unit: CFG.unit, items };
    });
  }

  // ---------------------------------------------------------------- leaderboard
  let lbMem = null;
  async function lbDoc(store) {
    if (store) { const d = await store.get(CFG.lbKey).catch(() => null); if (d) return typeof d.j === "string" ? JSON.parse(d.j) : d; }
    return lbMem;
  }
  async function lbSave(store, d) { lbMem = d; if (store) await store.set(CFG.lbKey, { j: JSON.stringify(d) }).catch(() => null); }
  /// read new BetPlaced / RoundSettled logs and fold settled rounds into each wallet's numbers (in the bet unit)
  async function lbScan(store, { budgetMs = 8000 } = {}) {
    const addr = CFG.address();
    if (!addr) return null;
    const t0 = Date.now();
    const head = await chain().latestBlock();
    let d = await lbDoc(store);
    if (!d || d.addr !== addr) d = { addr, cursor: Math.max(0, (CFG.fromBlock() || head.number - 50000) - 1), users: {}, pend: {}, rounds: 0 };
    const wk = weekKey(CFG.now());
    while (d.cursor < head.number && Date.now() - t0 < budgetMs) {
      const to = Math.min(head.number, d.cursor + CFG.logChunk);
      const logs = (await chain().getLogs({ address: addr, topics: [[TOPIC.bet, TOPIC.settled]], fromBlock: "0x" + (d.cursor + 1).toString(16), toBlock: "0x" + to.toString(16) })) || [];
      logs.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16));
      for (const l of logs) {
        const rid = String(BigInt(l.topics[1]));
        if (l.topics[0] === TOPIC.bet) {
          const u = lc("0x" + l.topics[2].slice(26));
          (d.pend[rid] = d.pend[rid] || []).push([u, W(l.data, 1) === 1n ? 1 : 0, amt(W(l.data, 2))]);
          // who came through whose link (a wallet's referrer is set once, on its first bet)
          if (W(l.data, 3) > 0n) { d.refBy = d.refBy || {}; if (!d.refBy[u]) d.refBy[u] = lc(A(l.data, 3)); }
        }
        else {
          const res = Number(W(l.data, 1)), up = amt(W(l.data, 4)), down = amt(W(l.data, 5)), fee = amt(W(l.data, 6));
          const bets = d.pend[rid] || [];
          delete d.pend[rid];
          d.rounds += 1;
          for (const [u, side, a] of bets) {
            const x = (d.users[u] = d.users[u] || { pnl: 0, vol: 0, n: 0, w: 0, l: 0, s: 0, b: 0, wk: {} });
            const k = (x.wk[wk] = x.wk[wk] || { pnl: 0, vol: 0 });
            x.vol += a; x.n += 1; k.vol += a;
            if (res === 1 || res === 2) {
              const won = (res === 1) === (side === 1);
              const winPot = res === 1 ? up : down;
              const pnl = won ? (a * (up + down - fee)) / winPot - a : -a;
              x.pnl += pnl; k.pnl += pnl;
              if (won) { x.w += 1; x.s += 1; x.b = Math.max(x.b, x.s); } else { x.l += 1; x.s = 0; }
            }
            for (const key of Object.keys(x.wk)) if (key < weekKey(CFG.now() - 14 * 86400)) delete x.wk[key];
          }
        }
      }
      d.cursor = to;
    }
    // keep the doc small: the 1,500 busiest wallets
    const us = Object.entries(d.users);
    if (us.length > 1500) d.users = Object.fromEntries(us.sort((a, b) => b[1].vol - a[1].vol).slice(0, 1500));
    d.at = CFG.now();
    await lbSave(store, d);
    return d;
  }
  async function leaderboard(store) {
    const d = await lbDoc(store);
    if (!d) return { live: !!CFG.address(), ...head0(), week: [], all: [], at: null };
    const wk = weekKey(CFG.now());
    const row = ([u, x], wkOnly) => ({ user: u, pnl: wkOnly ? (x.wk[wk] || {}).pnl || 0 : x.pnl, vol: wkOnly ? (x.wk[wk] || {}).vol || 0 : x.vol, n: x.n, wins: x.w, losses: x.l, best: x.b });
    const us = Object.entries(d.users || {});
    const week = us.map((e) => row(e, true)).filter((r) => r.vol > 0).sort((a, b) => b.pnl - a.pnl).slice(0, 25);
    const all = us.map((e) => row(e, false)).sort((a, b) => b.pnl - a.pnl).slice(0, 25);
    const streaks = us.map(([u, x]) => ({ user: u, best: x.b, streak: x.s })).sort((a, b) => b.best - a.best).slice(0, 10);
    return { live: true, ...head0(), unitUsd: await unitUsd(), weekOf: wk, week, all, streaks, players: us.length, rounds: d.rounds, at: d.at };
  }

  // ---------------------------------------------------------------- the keeper
  /// sample every market whose boundary is due (three times, in different blocks), then settle them
  /// the keeper, with its outcome written to the public status (?predict=status) even when it skips or fails,
  /// so a stalled market shows why (no key, the key isn't the operator, the RPC, a reverted sample…)
  async function tick(opts = {}) {
    const store = opts.store || null;
    const note = async (k, msg) => {
      if (!store) return;
      const st = (await store.get(CFG.statusKey).catch(() => null)) || {};
      st[k] = { at: CFG.now(), msg: String(msg).slice(0, 200) }; st.chain = CFG.id;
      await store.set(CFG.statusKey, st).catch(() => null);
    };
    try {
      const out = await tickRun(opts);
      if (out && out.skipped) await note("skipped", out.skipped);
      return out;
    } catch (e) { await note("error", (e && e.message) || e); throw e; }
  }
  async function tickRun({ budgetMs = 40000, store = null } = {}) {
    const t0 = Date.now();
    const addr = CFG.address(), key = CFG.keeperKey();
    if (!addr) return { skipped: "no contract" };
    if (!key) return { skipped: `no keeper key (${CFG.keeperHint})` };
    const g = await reads(addr, ["operator", "owner", "minSamples", "sampleGap", "feesOwed"]);
    if (g.operator == null) throw new Error(`${CFG.chainName}'s RPC didn't answer`);
    const me = lc(addressOfKey(key));
    if (me !== lc(A(g.operator, 0)) && me !== lc(A(g.owner, 0))) return { skipped: `the keeper key (${me.slice(0, 6)}…${me.slice(-4)}) isn't the contract's operator` };
    const need = Math.max(1, Number(W(g.minSamples, 0))), gap = Number(W(g.sampleGap, 0));
    const ms = await marketsRaw(addr);
    const lb = await chain().latestBlock();
    // a boundary is due from its time on; a market whose window passed is due too (the contract skips ahead)
    const due = ms.filter((m) => m.stopEpoch >= BigInt(m.next) && lb.ts >= m.start + m.next * m.duration).map((m) => m.id);
    const out = { chain: CFG.id, due: due.length, sampled: 0, settled: null, txs: [] };
    const send = async (data, kind) => {
      const r = await chain().sendTx({ to: addr, data: "0x" + data, key }).catch((e) => ({ ok: false, err: String((e && e.message) || e).slice(0, 160) }));
      out.txs.push({ kind, hash: r.hash || null, ok: r.ok, err: r.err });
      return r;
    };
    if (due.length) {
      for (let k = 0; k < need + 1; k++) { // one spare sample in case two land in one block
        if (Date.now() - t0 > budgetMs - 8000) break;
        const r = await send(S.sample + encIds(due), "sample");
        if (r.ok) out.sampled++;
        if (out.sampled >= need) break;
        await CFG.sleep((gap + 1) * 1000);
      }
      const r = await send(S.settle + encIds(due), "settle");
      out.settled = r.ok;
      if (r.ok && r.receipt) await announce(r.receipt, ms).catch(() => null);
    }
    // the fees, once an hour: to feeTo (Arc: ArcircleFeeBurn; Robinhood Chain: the ARCIRCLE PAD treasury)
    const st = (store && (await store.get(CFG.statusKey).catch(() => null))) || {};
    if (W(g.feesOwed, 0) >= CFG.feeMin && CFG.now() - (st.feesAt || 0) > 3600 && Date.now() - t0 < budgetMs - 4000) {
      st.feesAt = CFG.now();
      const r = await send(S.payFees, "fees");
      if (r.ok) st.fees = { at: CFG.now(), amount: amt(W(g.feesOwed, 0)), unit: CFG.unit, usdc: CFG.unit === "USDC" ? amt(W(g.feesOwed, 0)) : undefined, tx: r.hash };
    }
    if (Date.now() - t0 < budgetMs - 3000) { try { await lbScan(store, { budgetMs: Math.min(8000, budgetMs - (Date.now() - t0) - 2000) }); } catch (e) { out.lbError = String((e && e.message) || e).slice(0, 120); } }
    st.at = lb.ts; st.keeper = me; st.chain = CFG.id; st.last = { due: out.due, sampled: out.sampled, settled: out.settled };
    const bad = out.txs.filter((x) => !x.ok);
    st.error = bad.length ? { at: CFG.now(), msg: `${bad[0].kind}: ${bad[0].err || "failed"}`.slice(0, 200) } : null;
    st.skipped = null;
    try { const gas = await chain().balance(me); st.gas = Number(gas) / 1e18; } catch { /* keep */ }
    if (store) await store.set(CFG.statusKey, st).catch(() => null);
    out.status = st;
    mem.clear();
    return out;
  }
  async function status(store) { return (store && (await store.get(CFG.statusKey).catch(() => null))) || null; }

  const potText = (x, u) => (CFG.unit === "USDC" ? `$${x.toFixed(2)}` : `${x.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${CFG.unit}${u ? ` (~$${(x * u).toFixed(2)})` : ""}`);
  /// big rounds to the Telegram channel: "▲ UP won $PLAIN 5m · pot $42 · +3.2%"
  async function announce(receipt, ms) {
    const chat = CFG.tgChat();
    if (!chat) return;
    const addr = CFG.address();
    const evs = (receipt.logs || []).filter((l) => lc(l.address) === addr && l.topics && l.topics[0] === TOPIC.settled);
    const { tg, h } = await import("./_tg-lib.mjs");
    const u = await unitUsd();
    for (const l of evs.slice(0, 3)) {
      const res = Number(W(l.data, 1)), pot = amt(W(l.data, 4) + W(l.data, 5));
      if ((res !== 1 && res !== 2) || !(usdOfPot(pot, u) >= CFG.tgMinUsd)) continue;
      const m = ms.find((x) => x.id === Number(BigInt(l.topics[2])));
      if (!m) continue;
      const meta = (await tokenMeta([m.token]))[m.token] || {};
      const px = pxFn({ ...m, dec: meta.dec || 18 });
      const o = px(W(l.data, 2)), c = px(W(l.data, 3));
      const chg = o && c ? ((c / o - 1) * 100) : null;
      const where = CFG.id === "arc" ? "" : ` · ${CFG.chainName}`;
      const text = `${res === 1 ? "▲ <b>UP</b>" : "▼ <b>DOWN</b>"} won · <b>$${h(meta.sym || "?")}</b> ${durS(m.duration)} round${where}\nPot <b>${h(potText(pot, u))}</b>${chg != null ? ` · ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : ""}\n\nNext round is open → ${CFG.link(m.id)}`;
      await tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }).catch(() => null);
    }
  }

  /// one round for a share card: the round, its market and (with a wallet) that wallet's bet
  async function roundCard(id, user) {
    const addr = CFG.address();
    if (!addr || !/^\d{1,9}$/.test(String(id))) return null;
    const [rh] = await chain().ethCalls([call(addr, S.round + w(id))]);
    const r = decRound(id, rh);
    if (!r) return null;
    const ms = await marketsRaw(addr);
    const m = ms.find((x) => x.id === r.market);
    if (!m) return null;
    const meta = (await tokenMeta([m.token]))[m.token] || {};
    const sc = await pxScale();
    const px = pxFn({ ...m, dec: meta.dec || 18 }, sc.scale);
    let bet = null;
    if (isAddr(user)) {
      const [b, c] = await chain().ethCalls([call(addr, S.bets + w(id) + wa(user)), call(addr, S.claimable + w(id) + wa(user))]);
      if (b && (W(b, 0) > 0n || W(b, 1) > 0n)) {
        const stake = amt(W(b, 0) + W(b, 1)), side = W(b, 0) > 0n ? "up" : "down";
        const won = r.result === side;
        const payout = won ? (stake * amt(r.up + r.down) * (1 - r.feeBps / 10000)) / amt(side === "up" ? r.up : r.down) : 0;
        bet = { side, stake, won, payout, claimable: c ? amt(W(c, 0)) : 0 };
      }
    }
    return { ...head0(), unitUsd: await unitUsd(), id: r.id, market: m.id, sym: meta.sym || "?", duration: m.duration, result: r.result, open: px(r.openP), close: px(r.closeP),
      pot: amt(r.up + r.down), up: amt(r.up), down: amt(r.down), bet };
  }

  // ---------------- ARCIA's call (for fun) and round reactions ----------------
  // ARCIA calls every round open for bets — UP if the coin is above its live round's price to beat, DOWN if below,
  // else the side the last result didn't go — and the call is written down before the round locks, then scored
  // against the result, next to "the crowd" (the side with more money). Entertainment, not advice.
  const callsKey = () => CFG.lbKey.replace(/\/lb$/, "/calls");
  let callsMem = null; // { t, d }
  const callsRead = async (store) => {
    let d = null;
    if (store) { const x = await store.get(callsKey()).catch(() => null); if (x) d = typeof x.j === "string" ? JSON.parse(x.j) : x; }
    return d && d.picks ? d : { picks: {}, base: { arcia: { w: 0, l: 0 }, crowd: { w: 0, l: 0 } } };
  };
  async function callsLoad(store) {
    if (callsMem && Date.now() - callsMem.t < 15e3) return callsMem.d;
    const d = await callsRead(store);
    callsMem = { t: Date.now(), d };
    return d;
  }
  /// the record is counted from the picks themselves (never incremented), so two servers writing at once can't
  /// count a round twice; a pick, once written, is never replaced
  function tally(d) {
    const t = { arcia: { ...d.base.arcia }, crowd: { ...d.base.crowd } };
    const done = Object.values(d.picks).filter((x) => x.s).sort((x, y) => x.e - y.e || x.t - y.t);
    for (const x of done) { t.arcia[x.s]++; if (x.c) t.crowd[x.c]++; }
    let streak = 0;
    for (let i = done.length - 1; i >= 0; i--) { const v = done[i].s === "w" ? 1 : -1; if (streak && Math.sign(streak) !== v) break; streak += v; }
    return { ...t, streak };
  }
  /// the state's markets → ARCIA's call on each round open for bets, the last calls' hits and the running record
  async function calls(st, { store = null, now = CFG.now(), readOnly = false } = {}) {
    if (!st || !st.live || !st.markets) return null;
    const d = await callsLoad(store);
    if (readOnly) return callsView(st, d);
    const add = {}, score = {};
    const betOf = (m) => (m.next && m.next.epoch === m.betting ? m.next : m.live.epoch === m.betting ? m.live : null);
    for (const m of st.markets) {
      if (m.stopped) continue;
      const br = betOf(m);
      if (br && now < br.lockAt - 1) {
        const k = `${m.id}:${br.epoch}`;
        if (!d.picks[k]) {
          const ref = m.live && m.live.open ? m.live.open : null;
          const last = m.past && m.past[0] ? m.past[0].result : null;
          add[k] = { p: ref && m.price && m.price !== ref ? (m.price > ref ? "up" : "down") : last === "up" ? "down" : "up", t: now, e: m.live.endAt };
        }
      }
      for (const r of m.past || []) {
        const k = `${m.id}:${r.epoch}`, c = d.picks[k];
        if (!c || c.s || (r.result !== "up" && r.result !== "down")) continue;
        const crowd = r.up > r.down ? "up" : r.down > r.up ? "down" : null;
        score[k] = { s: c.p === r.result ? "w" : "l", c: crowd ? (crowd === r.result ? "w" : "l") : null, e: r.endAt };
      }
    }
    if (Object.keys(add).length || Object.keys(score).length) {
      // merge into what's stored now: new picks only where none exists, scores only where none is set
      const fresh = store ? await callsRead(store) : d;
      for (const [k, v] of Object.entries(add)) if (!fresh.picks[k]) fresh.picks[k] = v;
      for (const [k, v] of Object.entries(score)) if (fresh.picks[k] && !fresh.picks[k].s) Object.assign(fresh.picks[k], v);
      const cut = now - 2 * 86400;
      for (const [k, v] of Object.entries(fresh.picks)) if (v.t < cut) { if (v.s) { fresh.base.arcia[v.s]++; if (v.c) fresh.base.crowd[v.c]++; } delete fresh.picks[k]; }
      callsMem = { t: Date.now(), d: fresh };
      if (store) await store.set(callsKey(), { j: JSON.stringify(fresh) }).catch(() => null);
      return callsView(st, fresh);
    }
    return callsView(st, d);
  }
  function callsView(st, d) {
    const open = {};
    for (const m of st.markets) {
      const br = m.next && m.next.epoch === m.betting ? m.next : m.live.epoch === m.betting ? m.live : null;
      const c = br && d.picks[`${m.id}:${br.epoch}`];
      const recent = (m.past || []).map((r) => { const x = d.picks[`${m.id}:${r.epoch}`]; return x && x.s ? x.s : null; });
      if (c || recent.some(Boolean)) open[m.id] = { epoch: c ? br.epoch : null, pick: c ? c.p : null, recent };
    }
    return { open, ...tally(d) };
  }

  // reactions: four icons per round, counted per market (the last 12 rounds), at most 4 taps a round from one address
  const RX = ["fire", "rocket", "ice", "eyes"];
  const rxKey = (m) => CFG.lbKey.replace(/\/lb$/, "/rx") + Number(m);
  const rxMem = new Map(), rxIp = new Map();
  async function reacts(m, { store = null } = {}) {
    m = Number(m);
    if (!Number.isInteger(m) || m < 0) return { error: "market id" };
    const h = rxMem.get(m);
    if (h && Date.now() - h.t < 4000) return h.d;
    let d = null;
    if (store) { const x = await store.get(rxKey(m)).catch(() => null); if (x) d = typeof x.j === "string" ? JSON.parse(x.j) : x; }
    d = d && d.r ? d : { r: {} };
    rxMem.set(m, { t: Date.now(), d });
    return d;
  }
  async function react({ m, epoch, kind, ip = "anon" }, { store = null } = {}) {
    m = Number(m); epoch = Number(epoch);
    if (!RX.includes(kind) || !Number.isInteger(m) || !Number.isInteger(epoch) || m < 0 || epoch < 0) return { status: 400, body: { error: "bad reaction" } };
    const k = `${ip}|${m}|${epoch}`, n = rxIp.get(k) || 0;
    if (n >= 4) return { status: 429, body: { error: "that's enough for this round" } };
    rxIp.set(k, n + 1);
    if (rxIp.size > 5000) rxIp.clear();
    rxMem.delete(m);
    const d = await reacts(m, { store });
    const r = (d.r[epoch] = d.r[epoch] || {});
    r[kind] = (r[kind] || 0) + 1;
    const keep = Object.keys(d.r).map(Number).sort((a, b) => b - a).slice(0, 12);
    for (const e of Object.keys(d.r)) if (!keep.includes(Number(e))) delete d.r[e];
    rxMem.set(m, { t: Date.now(), d });
    if (store) await store.set(rxKey(m), { j: JSON.stringify(d) }).catch(() => null);
    return { status: 200, body: { ok: true, r } };
  }

  return { CFG, configure, state, mine, chart, feed, lbScan, leaderboard, tick, status, roundCard, calls, reacts, react, _chain: chain, _pxFn: pxFn };
}

// ---------------------------------------------------------------- Arc (the default exports)
export const ARC = makePredict({
  id: "arc", chainName: "Arc", chainId: 5042, unit: "USDC",
  rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  address: () => { const e = env("PREDICT_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : PREDICT_DEFAULT ? lc(PREDICT_DEFAULT) : null; },
  fromBlock: () => Number(env("PREDICT_FROM_BLOCK")) || PREDICT_DEFAULT_BLOCK || 0,
  keeperKey: () => env("PREDICT_KEEPER_KEY") || env("ORDERS_KEEPER_KEY") || null,
  keeperHint: "PREDICT_KEEPER_KEY or ORDERS_KEEPER_KEY",
  usdc: USDC, // the ERC-20 face of USDC (6 decimals); a pool paired with native USDC (address 0) counts 18
  qdec: (c, C) => (lc(c) === lc(C.usdc) ? 6 : 18),
  unitUsd: async () => 1,
  tgChat: () => env("PREDICT_TG_CHAT"),
  tgMinUsd: 10, feeMin: 10n ** 18n,
  lbKey: "predict/lb", statusKey: "predict/status",
  link: (m) => `${SITE}/arc#predict?m=${m}`,
  dexChain: "arc", badges: true,
  coinLogo: async (token) => { const { getCoin } = await import("./_arc.mjs"); const c = await getCoin(token); return c && /^https?:\/\//.test(c.imageUrl || "") ? c.imageUrl : null; },
});
export const { CFG, configure, state, mine, chart, feed, lbScan, leaderboard, tick, status, roundCard } = ARC;

// ---------------------------------------------------------------- Robinhood Chain
/// a Pons V2 coin's own logo() (an https or ipfs URL)
async function ponsLogo(token, ch) {
  const [r] = await ch.ethCalls([call(token, S.logo)]);
  const u = str(r || "").trim();
  if (/^https:\/\//.test(u)) return u.slice(0, 512);
  if (/^ipfs:\/\//.test(u)) return "https://ipfs.io/ipfs/" + u.slice(7).replace(/^ipfs\//, "");
  return null;
}
export const RH = makePredict({
  id: "rh", chainName: "Robinhood Chain", chainId: 4663, unit: "ETH",
  rpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  address: () => { const e = env("PREDICT_RH_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : PREDICT_RH_DEFAULT ? lc(PREDICT_RH_DEFAULT) : null; },
  fromBlock: () => Number(env("PREDICT_RH_FROM_BLOCK")) || PREDICT_RH_DEFAULT_BLOCK || 0,
  keeperKey: () => env("PREDICT_RH_KEEPER_KEY") || env("ORDERS_KEEPER_RH_KEY") || null,
  keeperHint: "PREDICT_RH_KEEPER_KEY or ORDERS_KEEPER_RH_KEY",
  usdc: RH_WETH, // the contract's ERC-20 face is WETH; markets are on native-ETH pools (address 0)
  qdec: () => 18,
  unitUsd: async () => { const p = await import("./_pons-arcpad.mjs"); return p.ethUsd(); },
  tgChat: () => env("PREDICT_RH_TG_CHAT") || env("PREDICT_TG_CHAT"),
  tgMinUsd: 10, feeMin: 5n * 10n ** 15n, // 0.005 ETH
  lbKey: "predict-rh/lb", statusKey: "predict-rh/status",
  link: (m) => `${SITE}/arc#predict?c=rh&m=${m}`,
  dexChain: "robinhood", badges: false,
  coinLogo: ponsLogo,
});

/// the instance for a request: ?chain=rh → Robinhood Chain, else Arc
export const forChain = (c) => (String(c || "").toLowerCase() === "rh" ? RH : ARC);
export const _test = { sel, encIds, decRound, weekKey: (t) => weekKey(t == null ? CFG.now() : t), TOPIC };
