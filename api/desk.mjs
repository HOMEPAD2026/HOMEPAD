// api/desk.mjs — ARCIA DESK (the engine is api/_desk.mjs, the brain api/_desk-brain.mjs).
// Public, read-only:
//   GET /api/desk                         everything the page shows: money, open trades, history, learning, journal, burns
//   GET /api/desk?day=YYYY-MM-DD[&paper=1] one day's closed trades
//   GET /api/desk?day=YYYY-MM-DD&trade=<id> one closed trade in full, with the coin's minute prices around it
// Scheduled (cron-job.org, every minute):
//   GET /api/desk?tick=1&key=<CRON_SECRET>   (or "Authorization: Bearer <CRON_SECRET>")
// Owner only (signed by the desk contract's owner wallet):
//   POST /api/desk {action:"settings", values:{tradePct,…}, issued, signature}   the sizing / scalp-gate settings
// ARCIA AGENT (api/_agent.mjs), public, read-only:
//   GET /api/desk?agent=0x…              ARCIA's report on an Arc token + her 24h safety call
//   GET /api/desk?agent=record           every safety call and how it was graded
//   GET /api/desk?agent=vaults[&t=0x…]   the burn vaults (all, or one token's) and ARCIA's actions
//   GET /api/desk?agent=take&t=0x…       ARCIA's words on a token (after its report; Claude, cached an hour)
//   GET /api/desk?agent=lasts&ts=0x…,0x…[&chain=rh]   v2: the latest call (if under a day old) of up to 40 tokens
//   GET /api/desk?agent=week             v2: the last 7 days — calls, how they were graded, what the vaults burned
//   …&chain=rh on the report, take and vaults: Robinhood Chain (ArciaAgentRH vaults) · ?agent=pools&t=0x…&chain=rh where a vault can buy
//   POST /api/desk {action:"agent-mode", vault, mode, issued, signature}   a vault owner's strategy (dip / steady / volume)
//   GET /api/desk?agenttick=1&key=<CRON_SECRET>   grade calls + work the vaults (also runs after every desk tick)
// ARCIA DESK on Robinhood Chain (every new launch there; the engine is api/_desk-rh.mjs): the same routes with &chain=rh —
//   GET /api/desk?chain=rh · ?chain=rh&day=… · ?chain=rh&tick=1&key=<CRON_SECRET> (its own cron-job.org entry, every minute)
//   POST {action:"settings", chain:"rh", …} (signed by the RH desk contract's owner)
// ARCIRCLE Orders' executor (api/_orders.mjs) — fills signed limit / stop orders at their makers' prices:
//   GET /api/desk?orderstick=1&key=<CRON_SECRET>   (its own cron-job.org entry, every minute; it also runs after
//                                                   a desk tick that leaves enough of the minute)
//   GET /api/desk?chain=rh&orderstick=1&key=…     the same on Robinhood Chain (ArcircleOrdersNative; also runs after
//                                                   the Robinhood desk's tick)
//   GET /api/desk?chain=sol&orderstick=1&key=…    the Solana keeper (api/_orders-sol.mjs; its own cron entry, every minute)
// ARCIRCLE Staking (api/_stake.mjs, contracts/ArcircleStaking.sol) — veARCIRCLE:
//   GET /api/desk?stake=state                totals, weekly rewards, pool votes, stakers, what the treasury owes stakers
//   GET /api/desk?stake=me&u=0x…             a wallet's lock, veARCIRCLE, claimable USDC, this and last week's vote, 8 weeks' earnings
//   GET /api/desk?stake=card&u=0x…           a wallet's lock for its share card (/stake/<wallet>)
//   GET /api/desk?stake=pool&token=0x…       v2: the pool to vote for a token (its ArcPad pool or its Orders market)
//   GET /api/desk?stake=drop[&u=0x…]          Launch Drop: this week's coins, finished weeks, a wallet's share (api/_launchdrop.mjs)
//   GET /api/desk?stake=dropconsole[&ws=…]    the treasury's to-do: with the vault, coins waiting for their 4% deposit;
//                                             without it, the unsent Launch Drop wallets in Multisender chunks
//   GET /api/desk?stake=dropholders&token=0x… the wallets a vault push of that coin would pay now (anyone can send it)
//   GET /api/desk?stake=droprh[&u=0x…]        Launch Drop on Robinhood Chain: drops, weekly veARCIRCLE roots, a wallet's claims
//   GET /api/desk?stake=droprhproof&ws=&u=0x…  a wallet's veARCIRCLE leaf + Merkle proof for one week
//   GET /api/desk?paper=state[&u=0x…]          Paper Trading: prices, this week's board, a wallet's account, past weeks
//   GET /api/desk?paper=prices                  Paper Trading's live prices (BTC, ETH, SOL)
//   GET /api/desk?predictx=state|mine&u=0x…     Predict × (multiplier bands): markets and rounds, a wallet's bets
//   POST {action:"paper-join", addr, msg, sig}  sign in for the week (a plain signed message) → session token
//   POST {action:"paper", addr, tok, op, …}     open / close / closeall / tpsl / sync
//   POST /api/desk { action: "launch-drop-sent", ws, tx }   a treasury Multisender send, checked against the plan
// ARCIRCLE NFT Vault (api/_nft.mjs, contracts/ArcircleNft.sol on Robinhood Chain) — fees buy NFTs, raffled to $ARCIRCLE holders:
//   GET /api/desk?nft=state · ?nft=me&u=0x… · ?nft=list&prize=N[&u=0x…] (a raffle's list + a wallet's proof) · ?nft=status
//   GET /api/desk?nft=col&c=0x…                the curator's check: ERC-721?, name, floor, the vault's listing (v2)
//   GET /api/desk?nft=addcoin&token=0x…        a Pons coin whose fee recipient is the NFT router joins the page's list (checked on-chain)
//   GET /api/desk?vearcia=state · ?vearcia=me&u=0x… · ?vearcia=card&u=0x…   veARCIA (api/_vearcia.mjs, Robinhood Chain)
//   GET /api/desk?veatick=1&key=<CRON_SECRET>   veARCIA's keeper (its own cron-job.org entry, every 10 minutes)
//   GET /api/desk?nfttick=1&key=<CRON_SECRET>   the keeper (its own cron-job.org entry, every 5 minutes)
// ARCIRCLE Predict (api/_predict.mjs, contracts/ArcPredict.sol) — UP / DOWN rounds on Arc tokens, in USDC:
//   GET /api/desk?predict=state              every market, its running round and its last results
//   GET /api/desk?predict=mine&u=0x…         a wallet's bets, what it can claim, its referrals and stats
//   GET /api/desk?predict=chart&m=<id>       the pool's price through the live round · ?predict=feed the latest bets
//   GET /api/desk?predict=lb                 leaderboard (this week, all time, streaks) · ?predict=status the keeper
//   state also carries calls: ARCIA's call on each round open for bets (for fun) and her record vs the crowd
//   GET /api/desk?predict=rx&m=<id>          reactions on a market's last rounds · POST {action:"predict-react", chain, m, epoch, kind}
//   GET /api/desk?predict=heat&m=<id>        a market's last 50 results (v3) · POST {action:"predict-expiry", chain, m, days, at, sig}
//                                            the lister picks when its market ends (0, 1, 3, 7, 14 or 30 days; signed)
//   GET /api/desk?predicttick=1&key=<CRON_SECRET>   the keeper: samples ended rounds' pools and settles them (its own
//                                                   cron-job.org entry, every minute)
//   …&chain=rh on any of these: the same on Robinhood Chain — bets in ETH, markets on graduated Pons V2 coins (its keeper
//   is its own cron-job.org entry: ?chain=rh&predicttick=1&key=<CRON_SECRET>)
//   GET /api/desk?chain=rh&predict=pons&token=0x…   a graduated Pons coin's pool key, for the team to list it
// There is no endpoint that makes a desk buy or sell: trades only come from the tick's rules.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { tick, view, dayTrades, tradeDetail, saveSettings } from "./_desk.mjs";
import * as RH from "./_desk-rh.mjs";
import * as agent from "./_agent.mjs";
import * as orders from "./_orders.mjs";
import * as predict from "./_predict.mjs";
import * as stake from "./_stake.mjs";
import * as launchdrop from "./_launchdrop.mjs";
import * as launchdropRH from "./_launchdrop-rh.mjs";
import * as paper from "./_paper.mjs";
import * as predictx from "./_predict-x.mjs";
import * as nft from "./_nft.mjs";
import * as vearcia from "./_vearcia.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import { cronBudget, within, cronOut } from "./_cron.mjs";

const json = (o, status = 200, cache = "no-store") => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": cache, "access-control-allow-origin": "*" } });
// a keeper's answer to cron-job.org: short, timed, inside its timeout (api/_cron.mjs)
const cron = (q, out, t0, status = 200) => json(cronOut(q, out, t0), status);
// a keeper's failure also lands in the runtime logs (the job's name and chain, never the key)
const cronErr = (q, e, t0) => {
  const msg = String((e && e.message) || e).slice(0, 300);
  console.error(`[cron] ${Object.keys(q).filter((k) => k !== "key").map((k) => (k === "chain" ? `chain=${String(q.chain).slice(0, 8)}` : k)).join(" ")}: ${msg}`);
  return cron(q, { error: msg }, t0, 500);
};
const store = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], getMany: (ks) => getDocs(ks), set: (k, d) => setDoc(k, d) } : null);

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  const st = store();
  if (q.chain === "rh" && !q.agent && !q.predict && !q.predicttick) return rhGET(q, req, st); // ARCIA AGENT takes chain=rh itself (below)
  // ARCIRCLE Paper Trading (api/_paper.mjs): the weekly play-money event
  if (q.paper === "state" || q.paper === "prices") {
    try {
      if (q.paper === "prices") return json(await paper.prices(), 200, "public, max-age=2, s-maxage=2");
      return json(await paper.state({ store: st, user: String(q.u || "") }), 200, q.u ? "no-store" : "public, max-age=3, s-maxage=4");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 502); }
  }
  // ARCIRCLE Staking (api/_stake.mjs): ?stake=state · ?stake=me&u=0x…
  if (q.stake) {
    try {
      // Launch Drop (api/_launchdrop.mjs): half of every new ArcPad coin's 8% platform allocation → veARCIRCLE stakers
      if (q.stake === "drop") return json(await launchdrop.state({ store: st, user: String(q.u || "") }), 200, q.u ? "no-store" : "public, max-age=15, s-maxage=30");
      if (q.stake === "dropconsole") return json(await launchdrop.consoleOf({ store: st, ws: q.ws ? Number(q.ws) : 0 }), 200);
      // the Robinhood Chain side (api/_launchdrop-rh.mjs): drops, roots to post, a wallet's proofs
      if (q.stake === "droprh") return json(await launchdropRH.state({ store: st, me: String(q.u || "") }), 200, q.u ? "no-store" : "public, max-age=15, s-maxage=30");
      if (q.stake === "droprhproof") return json(await launchdropRH.proof({ store: st, ws: Number(q.ws || 0), me: String(q.u || "") }), 200, "public, max-age=60");
      if (q.stake === "dropholders") return json(await launchdrop.holders({ store: st, token: String(q.token || "") }), 200, "no-store");
      if (q.stake === "me") { const r = await stake.me(String(q.u || "")); return json(r, r.error ? 400 : 200); }
      if (q.stake === "pool") { const r = await stake.poolFor(String(q.token || ""), { store: st }); return json(r || { error: "no pool found for that token" }, r ? 200 : 404, "public, max-age=60, s-maxage=300"); }
      if (q.stake === "card") { const r = await stake.card(String(q.u || "")); return json(r || { error: "no lock" }, r ? 200 : 404, "public, max-age=30, s-maxage=60"); }
      return json(await stake.state({ store: st }), 200, "public, max-age=5, s-maxage=10");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  // veARCIA (api/_vearcia.mjs, Robinhood Chain)
  if (q.veatick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    const t0 = Date.now();
    try { return cron(q, await vearcia.tick(), t0); } catch (e) { return cronErr(q, e, t0); }
  }
  if (q.vearcia) {
    try {
      if (q.vearcia === "me") { const r = await vearcia.me(String(q.u || "")); return json(r, r.ok ? 200 : 400, "public, max-age=5, s-maxage=10"); }
      if (q.vearcia === "card") { const r = await vearcia.card(String(q.u || "")); return json(r, 200, "public, max-age=30, s-maxage=60"); }
      const s = await vearcia.state();
      // v2: no wallet list in public — the stakers as a whole (dist, series)
      // v4 (ARCIA page): the top stakers without their wallets (veARCIA, lock multiplier, auto-renew, boost) and the
      // week's change in stakers and $ARCIA staked, from the community series
      const now = Number(s.now) || Math.floor(Date.now() / 1000);
      const top = (s.stakers || []).slice(0, 8).map((x) => ({ ve: x.ve, x: Math.round((Number(x.lockBps) || 10000) / 100) / 100, auto: !!x.auto, boost: x.tier > 0 && x.boostUntil > now ? x.tier : 0 }));
      const ser = s.series || [], last = ser[ser.length - 1];
      let week = null;
      if (last) { const base = [...ser].reverse().find((p) => p.t && p.t <= now - 7 * 86400) || { stakers: 0, staked: 0 }; week = { stakers: last.stakers - base.stakers, staked: last.staked - base.staked }; }
      return json({ ...s, stakers: undefined, count: s.stakers ? s.stakers.length : 0, top: s.live ? top : undefined, week }, 200, "public, max-age=10, s-maxage=20");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  // ARCIRCLE NFT Vault (api/_nft.mjs, Robinhood Chain): ?nft=state · ?nft=me&u=0x… · ?nft=list&prize=N[&u=0x…] · ?nft=status
  if (q.nfttick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    const t0 = Date.now(), B = cronBudget(q);
    try { return cron(q, await nft.tick({ budgetMs: within(B - 2000, 50000), store: st }), t0); } catch (e) { return cronErr(q, e, t0); }
  }
  if (q.nft) {
    try {
      if (q.nft === "me") { const r = await nft.me(String(q.u || ""), { store: st }); return json(r, r.error ? 400 : 200); }
      if (q.nft === "list") { const r = await nft.list(Number(q.prize), { store: st, user: String(q.u || "") }); return json(r || { error: "no such list" }, r ? 200 : 404, r ? "public, max-age=60, s-maxage=600" : "no-store"); }
      if (q.nft === "status") return json((await nft.status(st)) || {}, 200, "public, max-age=10, s-maxage=20");
      if (q.nft === "col") { const r = await nft.col(String(q.c || "")); return json(r, r.error ? 400 : 200, "public, max-age=30, s-maxage=60"); }
      if (q.nft === "addcoin") { const r = await nft.addCoin(String(q.token || ""), { store: st }); return json(r.body, r.status); }
      return json(await nft.state({ store: st }), 200, "public, max-age=10, s-maxage=20");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  // ARCIRCLE Predict (api/_predict.mjs)
  if (q.predicttick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    const t0 = Date.now(), B = cronBudget(q);
    try {
      const out = await predict.forChain(q.chain).tick({ budgetMs: within(B - 2000, 45000), store: st });
      // Predict × (multiplier bands) on Arc shares the keeper and this cron job, with the time that's left
      const left = within(B - 2000, 45000) - (Date.now() - t0);
      if (q.chain !== "rh" && predictx.CFG.address() && left > 12000) { try { out.x = await predictx.tick({ budgetMs: left - 1000, store: st }); } catch (e) { out.x = { error: String((e && e.message) || e).slice(0, 160) }; } }
      return cron(q, out, t0);
    } catch (e) { return cronErr(q, e, t0); }
  }
  // ARCIRCLE Predict × (api/_predict-x.mjs): multiplier bands
  if (q.predictx) {
    try {
      if (q.predictx === "mine") { const r = await predictx.mine(String(q.u || "")); return json(r, r.error ? 400 : 200); }
      return json(await predictx.state(), 200, "public, max-age=2, s-maxage=3");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 502); }
  }
  if (q.predict) {
    const P = predict.forChain(q.chain);
    try {
      if (q.predict === "pons") {
        if (q.chain !== "rh") return json({ error: "Pons coins are on Robinhood Chain (chain=rh)" }, 400);
        const { graduatedPool } = await import("./_pons-arcpad.mjs");
        const r = await graduatedPool(String(q.token || ""));
        return json(r, r.error ? 409 : 200, "public, max-age=10, s-maxage=30");
      }
      if (q.predict === "mine") { const r = await P.mine(String(q.u || ""), { store: st }); return json(r, r.error ? 400 : 200); }
      if (q.predict === "chart") return json(await P.chart(q.m), 200, "public, max-age=2, s-maxage=3");
      if (q.predict === "feed") return json(await P.feed({ store: st }), 200, "public, max-age=2, s-maxage=3");
      if (q.predict === "heat") { const r = await P.heat(q.m); return json(r, r.error ? 400 : 200, "public, max-age=10, s-maxage=15"); }
      if (q.predict === "lb") return json(await P.leaderboard(st), 200, "public, max-age=30, s-maxage=60");
      if (q.predict === "card") { const r = await P.roundCard(String(q.id || ""), String(q.u || "")); return json(r || { error: "no such round" }, r ? 200 : 404, r && r.result !== "open" ? "public, max-age=60, s-maxage=86400" : "public, max-age=10, s-maxage=30"); }
      if (q.predict === "status") return json((await P.status(st)) || {}, 200, "public, max-age=10, s-maxage=20");
      if (q.predict === "rx") return json(await P.reacts(q.m, { store: st }), 200, "public, max-age=3, s-maxage=4");
      const S0 = await P.state({ store: st });
      // ARCIA's call on each round open for bets, written down before it locks (for fun, not advice)
      const calls = S0 && S0.live ? await P.calls(S0, { store: st }).catch(() => null) : null;
      return json(calls ? { ...S0, calls } : S0, 200, "public, max-age=2, s-maxage=3");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  // ARCIRCLE Orders on Solana's keeper (api/_orders-sol.mjs)
  if (q.chain === "sol" && q.orderstick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    const t0 = Date.now(), B = cronBudget(q);
    try { const SOL = await import("./_orders-sol.mjs"); return cron(q, await SOL.tick(st, { budgetMs: within(B - 2000, 45000) }), t0); } catch (e) { return cronErr(q, e, t0); }
  }
  if (q.orderstick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    const t0 = Date.now(), B = cronBudget(q);
    try { return cron(q, await orders.tick(st, { budgetMs: within(B - 2000, 45000) }), t0); } catch (e) { return cronErr(q, e, t0); }
  }
  if (q.tick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    const t0 = Date.now(), B = cronBudget(q), left = () => B - (Date.now() - t0);
    let out;
    // the desk first (a bit over half the call), then ARCIA AGENT, then ARCIRCLE Orders in what's left
    try { out = await tick(st, { budgetMs: within(Math.round(B * 0.55), 52000) }); } catch (e) { return cronErr(q, e, t0); }
    if (!out || typeof out !== "object") out = { result: out };
    // ARCIA AGENT's failures never touch the desk's answer
    if (left() > 6000) { try { out.agent = await agent.tick(st, { budgetMs: within(left() - 4000, 15000) }); } catch (e) { out.agent = { error: String((e && e.message) || e).slice(0, 200) }; } }
    if (left() > 5000) { try { out.orders = await orders.tick(st, { budgetMs: left() - 2000 }); } catch (e) { out.orders = { error: String((e && e.message) || e).slice(0, 200) }; } }
    return cron(q, out, t0);
  }
  if (q.agenttick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    const t0 = Date.now(), B = cronBudget(q);
    try { return cron(q, await agent.tick(st, { budgetMs: within(B - 2000, 40000) }), t0); } catch (e) { return cronErr(q, e, t0); }
  }
  if (q.agent) {
    try {
      const chain = q.chain === "rh" ? "rh" : "arc";
      if (q.agent === "record") return json(await agent.record(st, { day: q.day != null && /^\d{1,6}$/.test(q.day) ? Number(q.day) : null }), 200, "public, max-age=30, s-maxage=60");
      if (q.agent === "vaults") return json(await agent.vaults(st, { token: q.t || "", vault: q.v || "", chain }), 200, "public, max-age=10, s-maxage=20");
      if (q.agent === "take") { const r = await agent.take(st, String(q.t || ""), { chain }); return json(r, r.error ? 400 : 200, r.error ? "no-store" : "public, max-age=60, s-maxage=300"); }
      // v2: the latest calls of several tokens (Orders, Explore, coin pages) and the week in numbers
      if (q.agent === "lasts") return json({ calls: await agent.lastCalls(st, String(q.ts || "").split(",").slice(0, 40), chain) }, 200, "public, max-age=30, s-maxage=60");
      if (q.agent === "week") return json(await agent.week(st), 200, "public, max-age=300, s-maxage=600");
      if (q.agent === "pools") { const r = await agent.poolsRh(String(q.t || ""), { store: st }); return json(r, r.error ? 400 : 200, r.error ? "no-store" : "public, max-age=30, s-maxage=60"); }
      const ip = req.headers.get("x-forwarded-for") || "?";
      if (agentLimited(ip)) return json({ error: "slow down — ARCIA reads one token at a time" }, 429);
      const r = await agent.report(st, q.agent, { chain });
      // a report still reading the holders is asked again soon: keep it out of the CDN's cache for long
      return json(r, r.error ? 400 : 200, r.error ? "no-store" : r.holdersPending ? "public, max-age=5, s-maxage=10" : "public, max-age=60, s-maxage=120");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  try {
    if (q.day && q.trade) return json(await tradeDetail(st, q.day, String(q.trade).slice(0, 20)), 200, "public, max-age=60, s-maxage=300");
    if (q.day) return json(await dayTrades(st, q.day, q.paper === "1"), 200, "public, max-age=30, s-maxage=60");
    // v6: ?watching=1 — only the new coins ARCIA DESK is watching (ARCIRCLE Orders' Explore), not the whole view
    if (q.watching) { const v0 = await view(st); return json({ chain: "arc", watching: (v0 && v0.watching) || [] }, 200, "public, max-age=30, s-maxage=60, stale-while-revalidate=120"); }
    return json(await view(st), 200, "public, max-age=10, s-maxage=20, stale-while-revalidate=60");
  } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}

/// ARCIA DESK on Robinhood Chain: its tick (no ARCIA AGENT after it — that lives on Arc) and its read-only views
async function rhGET(q, req, st) {
  if (q.orderstick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    const t0 = Date.now(), B = cronBudget(q);
    try { return cron(q, await orders.RH.tick(st, { budgetMs: within(B - 2000, 45000) }), t0); } catch (e) { return cronErr(q, e, t0); }
  }
  if (q.tick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    const t0 = Date.now(), B = cronBudget(q), left = () => B - (Date.now() - t0);
    let out;
    try { out = await RH.tick(st, { budgetMs: within(Math.round(B * 0.65), 52000) }); } catch (e) { return cronErr(q, e, t0); }
    // ARCIRCLE Orders on Robinhood Chain in what's left of the call
    if (left() > 5000 && out && typeof out === "object") { try { out.orders = await orders.RH.tick(st, { budgetMs: left() - 2000 }); } catch (e) { out.orders = { error: String((e && e.message) || e).slice(0, 200) }; } }
    return cron(q, out, t0);
  }
  try {
    if (q.day && q.trade) return json(await RH.tradeDetail(st, q.day, String(q.trade).slice(0, 20)), 200, "public, max-age=60, s-maxage=300");
    if (q.day) return json(await RH.dayTrades(st, q.day, q.paper === "1"), 200, "public, max-age=30, s-maxage=60");
    if (q.watching) { const v0 = await RH.view(st); return json({ chain: "rh", watching: (v0 && v0.watching) || [] }, 200, "public, max-age=30, s-maxage=60, stale-while-revalidate=120"); }
    return json(await RH.view(st), 200, "public, max-age=10, s-maxage=20, stale-while-revalidate=60");
  } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}

const te = new TextEncoder();
const hits = new Map();
/// 12 fresh reports a minute per IP (cached ones are served by the CDN)
function agentLimited(ip) { const t = Date.now(), l = (hits.get(ip) || []).filter((x) => t - x < 60e3); l.push(t); hits.set(ip, l); if (hits.size > 5000) hits.clear(); return l.length > 12; }
/// EIP-191 personal_sign → signer address (lowercase); the same as api/social.mjs
export function recoverSigner(message, signature) {
  const m = te.encode(message);
  const digest = keccak_256(Buffer.concat([te.encode(`\x19Ethereum Signed Message:\n${m.length}`), m]));
  const h = String(signature || "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{130}$/.test(h)) throw new Error("signature must be 65 bytes");
  const b = Uint8Array.from(Buffer.from(h, "hex"));
  let v = b[64]; if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("bad recovery id");
  const rec = new Uint8Array(65); rec[0] = v; rec.set(b.subarray(0, 64), 1);
  const pub = secp256k1.recoverPublicKey(rec, digest, { prehash: false });
  const full = secp256k1.Point.fromBytes(pub).toBytes(false);
  return "0x" + Buffer.from(keccak_256(full.subarray(1))).subarray(12).toString("hex");
}
export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  // ARCIRCLE Predict: a reaction on a round ({ action: "predict-react", chain, m, epoch, kind: fire|rocket|ice|eyes })
  if (b && b.action === "predict-react") {
    try {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      const r = await predict.forChain(b.chain).react({ m: b.m, epoch: b.epoch, kind: b.kind, ip }, { store: store() });
      return json(r.body, r.status);
    } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  if (b && b.action === "predict-expiry") {
    try { const r = await predict.forChain(b.chain).setExpiry(b, { store: store(), recover: recoverSigner }); return json(r.body, r.status); }
    catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  // Launch Drop: a treasury send, checked against the week's plan from its own receipt
  if (b && b.action === "launch-drop-sent") { try { const r = await launchdrop.record({ ws: b.ws, tx: b.tx }, store()); return json(r.body, r.status); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); } }
  // ARCIRCLE Paper Trading: sign in for the week, then trade with the session token
  if (b && b.action === "paper-join") { try { const r = await paper.join(b, { store: store(), recover: recoverSigner }); return json(r.body, r.status); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); } }
  if (b && b.action === "paper") { try { const r = await paper.act(b, { store: store() }); return json(r.body, r.status); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); } }
  if (b && b.action === "agent-mode") { try { const r = await agent.saveMode(store(), b, recoverSigner); return json(r.body, r.status); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); } }
  if (!b || b.action !== "settings") return json({ error: "unknown action" }, 400);
  try { const r = await (b.chain === "rh" ? RH.saveSettings : saveSettings)(store(), b, recoverSigner); return json(r.body, r.status); }
  catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" } });
}
