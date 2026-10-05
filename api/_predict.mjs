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
//   heat(m)          a market's last 50 results (the heat map) · claimableOne(round, user) one round's winnings
//   events(store)    news for alerts (a wallet's round won / lost / refunded, its side taking or losing the lead)
//   setExpiry()      a market's lister picks when it ends (signed); the keeper stops it then
//   tick()           the keeper (the contract's operator): at every round boundary it samples the pool three times in
//                    different blocks, then settles — the contract finalizes the boundary on the median. Prices only come
//                    from the pool. Once an hour it pushes the fees to feeTo, it keeps the leaderboard, and it posts big
//                    rounds to Telegram.
// Amounts (bets, pots, volume) are in the chain's bet unit (`unit`: USDC or ETH, `unitUsd` its dollar price); token prices
// are in dollars (on Robinhood Chain the pool's ETH price × ETH/USD, or in ETH when that price isn't known: `pxUnit`).
// Arc:  env PREDICT_ADDRESS ("none" turns it off), else PREDICT_DEFAULT; keeper PREDICT_KEEPER_KEY, else ORDERS_KEEPER_KEY.
// Markets the keeper opens itself (v3): PREDICT_AUTO / PREDICT_RH_AUTO (comma-separated tokens, "none" for none),
//       else the official coin on each chain — $ARCIRCLE on Arc, $ARCIA on Robinhood Chain — 5m, 15m and 1h, as soon as
//       its pool is live (on Robinhood Chain: once it graduates). Markets on a retired coin (RETIRED) are stopped by the
//       keeper: the round open for bets still runs and settles, no new bets after it.
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
// retired on 5 Oct 2026, not official any more: the old $ARCIA on Arc and ♾️ Infinite (the test coin)
export const RETIRED = ["0x9da6d5ce413e94264ea411372459413334a83be5", "0x2a15940316335bfb711db7cba98d637396e80c08"];
export const ARCIA_RH = "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25"; // $ARCIA on Robinhood Chain (Pons)
const AUTO_DURS = [300, 900, 3600];
const U64 = 2n ** 63n; // a market's stopEpoch at or above this: running
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
  arcircle: sel("arcircle()"), addMarket: sel("addMarket((address,address,uint24,int24,address),uint32,uint32)"), stop: sel("stop(uint256)"),
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
const encKey = (k) => wa(k.currency0) + wa(k.currency1) + w(k.fee) + w(BigInt.asUintN(256, BigInt(k.tickSpacing))) + wa(k.hooks);
const dayKey = (t) => new Date(t * 1000).toISOString().slice(0, 10);
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
    autoMarkets: () => [], // tokens the keeper opens 5m / 15m / 1h markets on by itself
    poolKeyOf: async () => null, // async (token) → the pool key a market on it uses (null: not ready)
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
    // Token Scanner reads Arc; ARCIA AGENT calls on both chains
    if (CFG.id === "arc") { try { const sc = await import("./_scan.mjs"); const s = await sc.scoreOf(token, { store, compute: false }); if (s && s.score != null) out.score = s.score; } catch { /* none */ } }
    try { const ag = await import("./_agent.mjs"); const c = await ag.lastCall(store, token, CFG.id === "rh" ? "rh" : "arc"); if (c) out.call = c.call; } catch { /* none */ }
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
    const g = await reads(addr, ["roundCount", "paused", "feeBps", "refShare", "minBet", "maxBet", "maxSide", "volume", "feesOwed", "feesPaid", "owner", "operator", "feeTo", "listOpen", "listBurn", "arcircle"]);
    const ex = await expiryDoc(store).catch(() => ({}));
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
      listing: { open: g.listOpen ? W(g.listOpen, 0) === 1n : false, burn: g.listBurn ? Number(W(g.listBurn, 0) / 10n ** 14n) / 1e4 : 0, minUsdc: mq[0] ? Number(W(mq[0], 0)) / 1e6 : null, token: g.arcircle ? lc(A(g.arcircle, 0)) : null },
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
          endsAt: !stopped && ex[m.id] && ex[m.id].at ? ex[m.id].at : null,
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
      stats: st ? { pnl: st.pnl, vol: st.vol, n: st.n, wins: st.w, losses: st.l, streak: st.s, best: st.b, week: (st.wk && st.wk[weekKey(CFG.now())]) || { pnl: 0, vol: 0 },
        days: Object.entries(st.d || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)), podiums: podiumsOf(lbd, lc(user)) } : null };
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
      // v3: how the UP / DOWN split moved as bets came in (the live round and the one open for bets)
      const rids = [mk.live.id, mk.next && mk.next.id].filter(Boolean);
      const flow = {};
      if (rids.length) {
        const bl = await logsRange({ address: addr, topics: [TOPIC.bet, rids.map((id) => "0x" + w(id))] }, blockAt(head, rate, from - mk.duration), head.number).catch(() => []);
        for (const l of bl) {
          const rid = Number(BigInt(l.topics[1])), f = (flow[rid] = flow[rid] || []), last = f[f.length - 1] || [0, 0, 0];
          const up = W(l.data, 1) === 1n, a = amt(W(l.data, 2));
          f.push([timeAt(head, rate, parseInt(l.blockNumber, 16)), last[1] + (up ? a : 0), last[2] + (up ? 0 : a)]);
        }
      }
      return { live: true, chain: CFG.id, market: m, from, now: head.ts, open: mk.live.open, price: mk.price, pxUnit: sc.pxUnit, startAt: mk.live.startAt, endAt: mk.live.endAt, points: points.slice(-400), flow };
    });
  }

  /// the latest bets on every market
  async function feed({ limit = 30, store = null } = {}) {
    const addr = CFG.address();
    if (!addr) return { live: false, items: [] };
    return cached("feed", CFG.cacheMs, async () => {
      const [head, rate] = await Promise.all([headTime(), blockRate()]);
      const logs = await logsRange({ address: addr, topics: [TOPIC.bet] }, Math.max(0, head.number - Math.max(2000, Math.round(3600 / rate))), head.number).catch(() => []);
      let items = logs.slice(-limit).reverse().map((l) => betRow(l, timeAt(head, rate, parseInt(l.blockNumber, 16))));
      if (items.length < limit) {
        const d = await lbDoc(store).catch(() => null), seen = new Set(items.map((x) => `${x.tx}|${x.user}|${x.round}`));
        for (const x of (d && d.recent) || []) if (!seen.has(`${x.tx}|${x.user}|${x.round}`)) items.push(x);
        items = items.sort((a, b) => b.t - a.t).slice(0, limit);
      }
      return { live: true, chain: CFG.id, unit: CFG.unit, items };
    });
  }
  const betRow = (l, t) => ({ round: Number(BigInt(l.topics[1])), user: lc("0x" + l.topics[2].slice(26)), market: Number(BigInt(l.topics[3])),
    epoch: Number(W(l.data, 0)), up: W(l.data, 1) === 1n, amount: amt(W(l.data, 2)), t, tx: lc(l.transactionHash) });

  /// a market's last results (up to 50 rounds with bets), newest first: the heat map
  async function heat(m, { n = 50 } = {}) {
    const addr = CFG.address();
    if (!addr) return { live: false, items: [] };
    m = Number(m);
    if (!Number.isInteger(m) || m < 0) return { error: "market id" };
    return cached("heat" + m, 15e3, async () => {
      const [h] = await chain().ethCalls([call(addr, S.roundsOf + w(m) + w(0) + w(n + 2))]);
      if (!h) return { error: "no such market" };
      const ids = [...Array(Number(W(h, 1))).keys()].map((j) => Number(W(h, 2 + j)));
      const rr = ids.length ? await chain().ethCalls(ids.map((id) => call(addr, S.round + w(id)))) : [];
      const items = ids.map((id, i) => decRound(id, rr[i])).filter((r) => r && r.result !== "open").slice(0, n)
        .map((r) => ({ id: r.id, e: r.epoch, r: r.result === "up" ? "u" : r.result === "down" ? "d" : "x", pot: amt(r.up + r.down) }));
      return { live: true, chain: CFG.id, market: m, items };
    });
  }
  /// what one wallet can still claim from one round
  async function claimableOne(id, user) {
    const addr = CFG.address();
    if (!addr || !isAddr(user)) return 0;
    const [c] = await chain().ethCalls([call(addr, S.claimable + w(id) + wa(user))]);
    return c ? amt(W(c, 0)) : 0;
  }

  // ---------------------------------------------------------------- leaderboard
  let lbMem = null;
  async function lbDoc(store) {
    if (store) { const d = await store.get(CFG.lbKey).catch(() => null); if (d) return typeof d.j === "string" ? JSON.parse(d.j) : d; }
    return lbMem;
  }
  async function lbSave(store, d) { lbMem = d; if (store) await store.set(CFG.lbKey, { j: JSON.stringify(d) }).catch(() => null); }
  /// read new BetPlaced / RoundSettled logs and fold settled rounds into each wallet's numbers (in the bet unit).
  /// v3: weeks and days come from each log's own time; the last 30 bets are kept for the live feed; finished weeks
  /// leave a season record (the top 3); every settled bet becomes an alert event for its wallet.
  async function lbScan(store, { budgetMs = 8000 } = {}) {
    const addr = CFG.address();
    if (!addr) return null;
    const t0 = Date.now();
    const [head, rate] = await Promise.all([chain().latestBlock(), blockRate()]);
    let d = await lbDoc(store);
    if (!d || d.addr !== addr) d = { addr, cursor: Math.max(0, (CFG.fromBlock() || head.number - 50000) - 1), users: {}, pend: {}, rounds: 0 };
    d.recent = d.recent || [];
    const evs = [];
    while (d.cursor < head.number && Date.now() - t0 < budgetMs) {
      const to = Math.min(head.number, d.cursor + CFG.logChunk);
      const logs = (await chain().getLogs({ address: addr, topics: [[TOPIC.bet, TOPIC.settled]], fromBlock: "0x" + (d.cursor + 1).toString(16), toBlock: "0x" + to.toString(16) })) || [];
      logs.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16));
      for (const l of logs) {
        const rid = String(BigInt(l.topics[1])), t = timeAt(head, rate, parseInt(l.blockNumber, 16)), wk = weekKey(t), dk = dayKey(t);
        if (l.topics[0] === TOPIC.bet) {
          const u = lc("0x" + l.topics[2].slice(26));
          (d.pend[rid] = d.pend[rid] || []).push([u, W(l.data, 1) === 1n ? 1 : 0, amt(W(l.data, 2))]);
          // who came through whose link (a wallet's referrer is set once, on its first bet)
          if (W(l.data, 3) > 0n) { d.refBy = d.refBy || {}; if (!d.refBy[u]) d.refBy[u] = lc(A(l.data, 3)); }
          d.recent.unshift(betRow(l, t));
        }
        else {
          const market = Number(BigInt(l.topics[2])), epoch = Number(W(l.data, 0));
          const res = Number(W(l.data, 1)), up = amt(W(l.data, 4)), down = amt(W(l.data, 5)), fee = amt(W(l.data, 6));
          const bets = d.pend[rid] || [];
          delete d.pend[rid];
          d.rounds += 1;
          for (const [u, side, a] of bets) {
            const x = (d.users[u] = d.users[u] || { pnl: 0, vol: 0, n: 0, w: 0, l: 0, s: 0, b: 0, wk: {} });
            const k = (x.wk[wk] = x.wk[wk] || { pnl: 0, vol: 0 });
            x.d = x.d || {};
            x.vol += a; x.n += 1; k.vol += a;
            let pnl = 0, kind = "refund";
            if (res === 1 || res === 2) {
              const won = (res === 1) === (side === 1);
              const winPot = res === 1 ? up : down;
              pnl = won ? (a * (up + down - fee)) / winPot - a : -a;
              x.pnl += pnl; k.pnl += pnl;
              x.d[dk] = (x.d[dk] || 0) + pnl;
              if (won) { x.w += 1; x.s += 1; x.b = Math.max(x.b, x.s); } else { x.l += 1; x.s = 0; }
              kind = won ? "won" : "lost";
            }
            evs.push({ k: kind, u, r: Number(rid), m: market, e: epoch, side: side ? "up" : "down", amt: a, pay: kind === "won" ? a + pnl : kind === "refund" ? a : 0, t });
            for (const key of Object.keys(x.wk)) if (key < weekKey(CFG.now() - 14 * 86400)) delete x.wk[key];
            for (const key of Object.keys(x.d)) if (key < dayKey(CFG.now() - 30 * 86400)) delete x.d[key];
          }
        }
      }
      d.cursor = to;
    }
    d.recent = d.recent.slice(0, 30);
    // a finished week (the scan is past its end) leaves its top 3 for good
    d.seasons = d.seasons || {};
    const cur = weekKey(CFG.now()), scanned = timeAt(head, rate, d.cursor);
    const done = new Set(Object.values(d.users).flatMap((x) => Object.keys(x.wk || {})).filter((k) => k < cur && !d.seasons[k] && Date.parse(k + "T00:00:00Z") / 1000 + 7 * 86400 <= scanned));
    for (const k of done) {
      d.seasons[k] = Object.entries(d.users).map(([u, x]) => ({ u, pnl: (x.wk[k] || {}).pnl || 0, vol: (x.wk[k] || {}).vol || 0 })).filter((r) => r.vol > 0)
        .sort((a, b) => b.pnl - a.pnl).slice(0, 3).map((r) => ({ u: r.u, pnl: Math.round(r.pnl * 1e8) / 1e8 }));
    }
    for (const k of Object.keys(d.seasons).sort().slice(0, -26)) delete d.seasons[k];
    // keep the doc small: the 1,500 busiest wallets
    const us = Object.entries(d.users);
    if (us.length > 1500) d.users = Object.fromEntries(us.sort((a, b) => b[1].vol - a[1].vol).slice(0, 1500));
    d.at = CFG.now();
    await lbSave(store, d);
    if (evs.length) await addEvents(store, evs).catch(() => null);
    return d;
  }
  /// a wallet's podiums: [1st, 2nd, 3rd] counts over the kept seasons
  const podiumsOf = (d, u) => { const p = [0, 0, 0]; for (const top of Object.values((d && d.seasons) || {})) top.forEach((r, i) => { if (r.u === u) p[i]++; }); return p; };
  let lbFallAt = 0;
  async function leaderboard(store) {
    let d = await lbDoc(store);
    // the keeper is behind (or never ran): catch up here, at most once a minute per server
    if ((!d || CFG.now() - (d.at || 0) > 600) && CFG.address() && Date.now() - lbFallAt > 60e3) {
      lbFallAt = Date.now();
      try { d = (await lbScan(store, { budgetMs: 4000 })) || d; } catch { /* the stored one */ }
    }
    if (!d) return { live: !!CFG.address(), ...head0(), week: [], all: [], at: null };
    const wk = weekKey(CFG.now());
    const row = ([u, x], wkOnly) => ({ user: u, pnl: wkOnly ? (x.wk[wk] || {}).pnl || 0 : x.pnl, vol: wkOnly ? (x.wk[wk] || {}).vol || 0 : x.vol, n: x.n, wins: x.w, losses: x.l, best: x.b });
    const us = Object.entries(d.users || {});
    const week = us.map((e) => row(e, true)).filter((r) => r.vol > 0).sort((a, b) => b.pnl - a.pnl).slice(0, 25);
    const all = us.map((e) => row(e, false)).sort((a, b) => b.pnl - a.pnl).slice(0, 25);
    const streaks = us.map(([u, x]) => ({ user: u, best: x.b, streak: x.s })).sort((a, b) => b.best - a.best).slice(0, 10);
    const seasons = Object.entries(d.seasons || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8).map(([k, top]) => ({ week: k, top: top.map((r) => ({ user: r.u, pnl: r.pnl })) }));
    const podiums = {};
    for (const r of [...week, ...all]) if (!podiums[r.user]) { const p = podiumsOf(d, r.user); if (p.some(Boolean)) podiums[r.user] = p; }
    const fan = await fanTiers([...new Set([...week, ...all].map((r) => r.user))]).catch(() => ({}));
    return { live: true, ...head0(), unitUsd: await unitUsd(), weekOf: wk, week, all, streaks, seasons, podiums, fan, players: us.length, rounds: d.rounds, at: d.at };
  }

  // ---------------------------------------------------------------- alert events (v3)
  // won / lost / refund for every settled bet, and "cross" when a live round's leader flips under a wallet's bet.
  // api/arcia-tg.mjs reads them every minute and sends them to Telegram (/predictalerts) and Web Push (predict-<chain>-0x…).
  const evKey = () => CFG.lbKey.replace(/\/lb$/, "/events");
  async function addEvents(store, evs) {
    if (!store || !evs.length) return;
    const x = (await store.get(evKey()).catch(() => null)) || {};
    const d = typeof x.j === "string" ? JSON.parse(x.j) : { n: 0, items: [] };
    const seen = new Set(d.items.map((e) => `${e.k}:${e.r}:${e.u}:${e.lead || ""}:${e.t}`));
    for (const e of evs) { const k = `${e.k}:${e.r}:${e.u}:${e.lead || ""}:${e.t}`; if (seen.has(k)) continue; seen.add(k); d.n += 1; d.items.push({ ...e, n: d.n, ch: CFG.id }); }
    d.items = d.items.slice(-300);
    await store.set(evKey(), { j: JSON.stringify(d) });
  }
  /// events after `since` (an event number); { n: the latest number, items }
  async function events(store, since = 0) {
    const x = store ? await store.get(evKey()).catch(() => null) : null;
    const d = x && typeof x.j === "string" ? JSON.parse(x.j) : { n: 0, items: [] };
    return { n: d.n, items: d.items.filter((e) => e.n > since) };
  }

  // ---------------------------------------------------------------- end dates (v3)
  // The wallet that listed a market (or the team) picks when it ends — signed, so nobody else can — and the keeper stops it
  // then; the round open for bets at that moment still runs and settles.
  const exKey = () => CFG.lbKey.replace(/\/lb$/, "/expiry");
  async function expiryDoc(store) { const x = store ? await store.get(exKey()).catch(() => null) : null; return (x && x.m) || {}; }
  const EX_DAYS = [0, 1, 3, 7, 14, 30];
  const expiryMsg = (m, days, at) => `ARCIRCLE Predict · ${CFG.chainName}\nEnd market #${m} ${days ? `in ${days} day${days > 1 ? "s" : ""}` : "never (no end date)"}\n${at}`;
  /// { m, days, at, sig } signed by the market's lister (or the owner / operator); `recover(message, sig)` → the signer
  async function setExpiry({ m, days, at, sig }, { store = null, recover } = {}) {
    const addr = CFG.address();
    m = Number(m); days = Number(days); at = Number(at);
    if (!addr || !store) return { status: 503, body: { error: "not available" } };
    if (!Number.isInteger(m) || m < 0 || !EX_DAYS.includes(days)) return { status: 400, body: { error: "days must be one of " + EX_DAYS.join(", ") } };
    if (!(Math.abs(CFG.now() - at) < 600)) return { status: 400, body: { error: "the signature is too old — sign again" } };
    let signer = null;
    try { signer = lc(recover(expiryMsg(m, days, at), String(sig || ""))); } catch { signer = null; }
    if (!isAddr(signer)) return { status: 400, body: { error: "bad signature" } };
    const [h, o, op] = await chain().ethCalls([call(addr, S.market + w(m)), call(addr, S.owner), call(addr, S.operator)]);
    if (!h) return { status: 404, body: { error: "no such market" } };
    const lister = lc(A(h, 1));
    if (signer !== lister && signer !== lc(A(o, 0)) && signer !== lc(A(op, 0))) return { status: 403, body: { error: "only the wallet that listed this market can set its end" } };
    const x = (await store.get(exKey()).catch(() => null)) || {}, ex = x.m || {};
    if (days) ex[m] = { at: CFG.now() + days * 86400, by: signer, set: CFG.now() }; else delete ex[m];
    await store.set(exKey(), { m: ex });
    mem.delete("state");
    return { status: 200, body: { ok: true, market: m, endsAt: days ? ex[m].at : null } };
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
    const left = () => budgetMs - (Date.now() - t0);
    // v3: markets whose lister set an end date that has passed
    if (store && left() > 4000) {
      const ex = await expiryDoc(store).catch(() => ({}));
      for (const m of ms) {
        const e = ex[m.id];
        if (e && e.at && lb.ts >= e.at && m.stopEpoch >= U64 && left() > 4000) { const r = await send(S.stop + w(m.id), "stop"); if (r.ok) out.stopped = (out.stopped || 0) + 1; }
      }
    }
    // retired coins (5 Oct 2026): their running markets are stopped — the round open now still settles
    for (const m of ms) {
      if (RETIRED.includes(lc(m.token)) && m.stopEpoch >= U64 && left() > 4000) { const r = await send(S.stop + w(m.id), "stop"); if (r.ok) out.stopped = (out.stopped || 0) + 1; }
    }
    // v3: the markets the keeper keeps open itself (the chain's official coin by default), checked every 10 minutes
    if (CFG.now() - (st.autoAt || 0) > 600 && left() > 8000) {
      st.autoAt = CFG.now();
      try { const a = await autoMarkets(ms, send, left); if (a) { out.auto = a; st.auto = { at: CFG.now(), ...a }; } } catch (e) { st.auto = { at: CFG.now(), error: String((e && e.message) || e).slice(0, 160) }; }
    }
    // v3: a live round's leader flipped under someone's bet — an alert for them (at most 3 flips a round)
    if (store && left() > 5000) { try { await crossings(store, st); } catch (e) { out.crossError = String((e && e.message) || e).slice(0, 120); } }
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
  /// open 5m / 15m / 1h on each auto token that lacks one; its pool comes from CFG.poolKeyOf (null: not live yet)
  async function autoMarkets(ms, send, left) {
    const toks = (CFG.autoMarkets() || []).map(lc).filter(isAddr);
    if (!toks.length) return null;
    const out = { opened: [], waiting: [] };
    for (const t of toks) {
      const have = new Set(ms.filter((m) => m.token === t && m.stopEpoch >= U64).map((m) => m.duration));
      const miss = AUTO_DURS.filter((d) => !have.has(d));
      if (!miss.length) continue;
      if (left() < 8000) break;
      const key = await CFG.poolKeyOf(t).catch(() => null);
      if (!key) { out.waiting.push(t); continue; }
      for (const d of miss) {
        if (left() < 5000) break;
        const r = await send(S.addMarket + encKey(key) + w(d) + w(0), "addmarket");
        if (r.ok) out.opened.push(`${t.slice(0, 8)}:${d}`);
      }
    }
    return out.opened.length || out.waiting.length ? out : null;
  }
  /// the live rounds with bets: who's ahead now vs the last look; a flip is an alert for every wallet in the round
  async function crossings(store, st) {
    const sv = await stateRun({ fresh: true, store });
    const d = await lbDoc(store);
    const cross = st.cross || {}, evs = [], live = new Set();
    for (const m of sv.markets || []) {
      const r = m.live;
      if (!r || !r.id || !r.open || !m.price) continue;
      live.add(String(r.id));
      const bets = (d && d.pend && d.pend[String(r.id)]) || [];
      if (!bets.length) continue;
      const sg = m.price > r.open ? 1 : m.price < r.open ? -1 : 0;
      if (!sg) continue;
      const c = cross[r.id] || { s: 0, n: 0 };
      if (c.s && c.s !== sg && c.n < 3) {
        c.n += 1;
        const seen = new Set();
        for (const [u, side, a] of bets) { if (seen.has(u)) continue; seen.add(u); evs.push({ k: "cross", u, r: r.id, m: m.id, e: r.epoch, side: side ? "up" : "down", amt: a, lead: sg > 0 ? "up" : "down", sym: m.sym, d: m.duration, pc: Math.round((m.price / r.open - 1) * 1e4) / 100, t: CFG.now() }); }
      }
      c.s = sg; cross[r.id] = c;
    }
    for (const k of Object.keys(cross)) if (!live.has(k)) delete cross[k];
    st.cross = cross;
    if (evs.length) await addEvents(store, evs);
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

  return { CFG, configure, state, mine, chart, feed, heat, claimableOne, lbScan, leaderboard, tick, status, roundCard, calls, reacts, react, events, setExpiry, expiryMsg, _chain: chain, _pxFn: pxFn };
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
  autoMarkets: () => autoList("PREDICT_AUTO", ARCIRCLE),
  // its deepest Uniswap v4 pool against USDC (Argus, ArcPad or plain v4)
  poolKeyOf: async (token) => {
    const L = await import("./_liquidity.mjs");
    const r = await L.run(token, { lite: true, budgetMs: 6000 });
    const p = ((r && r.pools) || []).find((x) => x.key && [x.key.currency0, x.key.currency1].map(lc).some((c) => c === USDC || c === "0x0000000000000000000000000000000000000000"));
    return p ? p.key : null;
  },
});
export const { CFG, configure, state, mine, chart, feed, lbScan, leaderboard, tick, status, roundCard } = ARC;
/// v3: fan tiers from the $ARCIA a wallet holds on Robinhood Chain (the same tiers as ARCIA's page): Bronze (any),
/// Silver 100K+, Gold 1M+, Diamond 10M+ — read for the leaderboard's wallets, kept 10 minutes
const fanMem = new Map();
async function fanTiers(users) {
  const need = users.filter((u) => isAddr(u) && !(fanMem.has(u) && Date.now() - fanMem.get(u).t < 600e3)).slice(0, 60);
  if (need.length) {
    const bal = sel("balanceOf(address)");
    const r = await RH._chain().ethCalls(need.map((u) => call(ARCIA_RH, bal + wa(u))));
    need.forEach((u, i) => { const b = r[i] ? Number(W(r[i], 0) / 10n ** 18n) : 0; fanMem.set(u, { t: Date.now(), v: b >= 1e7 ? "diamond" : b >= 1e6 ? "gold" : b >= 1e5 ? "silver" : b > 0 ? "bronze" : null }); });
  }
  const out = {};
  for (const u of users) { const x = fanMem.get(u); if (x && x.v) out[u] = x.v; }
  return out;
}
/// the keeper's own markets: env list (comma-separated, "none" = none), else the chain's $ARCIA
function autoList(k, dflt) { const e = env(k); if (e === "none") return []; return e ? e.split(",").map((x) => x.trim()).filter(isAddr) : [dflt]; }

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
  dexChain: "robinhood", badges: true,
  coinLogo: ponsLogo,
  autoMarkets: () => autoList("PREDICT_RH_AUTO", ARCIA_RH),
  // a graduated Pons coin's native-ETH pool (null while it's still on its bonding curve)
  poolKeyOf: async (token) => { const p = await import("./_pons-arcpad.mjs"); const g = await p.graduatedPool(token); return g && g.ok ? g.key : null; },
});

/// the instance for a request: ?chain=rh → Robinhood Chain, else Arc
export const forChain = (c) => (String(c || "").toLowerCase() === "rh" ? RH : ARC);
export const _test = { sel, encIds, decRound, weekKey: (t) => weekKey(t == null ? CFG.now() : t), TOPIC };
