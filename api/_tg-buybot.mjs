// api/_tg-buybot.mjs — ARCIA's buy alerts on Telegram, for our own coins only: $ARCIA always; other coins of ours
// (like $ARCIRCLE) only when a bot admin adds them. Every buy in the coin's Uniswap v4 pool on Arc is posted to the
// groups that turned it on: how much was spent, what it bought, who bought (new holder or not), the price and market cap, with buttons.
//
//   GET /api/arcia-tg?buys=1&key=<CRON_SECRET>   call it every minute (cron-job.org); it keeps checking for ~45 s,
//                                                every 8 s, so a buy shows up within about 10–20 seconds
// In Telegram:
//   /buybot                     this group's setting and the coins being followed
//   /buybot on [min]            group admins: post buys here (optionally only buys of at least $min)
//   /buybot min 10 · /buybot off
//   /buybot add 0xTOKEN [0xPOOL] ARCIRCLE bot admins: follow another of our coins (the pool id is looked up on
//                               Dexscreener when it isn't given) · /buybot remove 0xTOKEN
//   /buybot test                ARCIRCLE bot admins: post the latest buy here again, marked as a test
// Reads only: nothing here signs or sends a transaction.
import { getLogs, latestBlock, ethCalls, rpc, rpcCall, toQty, isAddr, PM_ADDRESS, TOPIC } from "./_arc.mjs";
import { kindOf } from "./_token.mjs";
import { getDocs } from "./_store.mjs";
import { ARCIRCLE_TOKEN, ARCIRCLE_POOL_ID, ARCIRCLE_QUOTE } from "./_arcircle.mjs";
import { SITE, h, lc, short, compact, sleep, tg, kb, getDoc, putDoc } from "./_tg-lib.mjs";
import * as RHB from "./_tg-buybot-rh.mjs";

const KEY = "tgArcia/buybot";
// the chain's addresses (tests point these at a local chain)
// main: the coin every buy alert follows — $ARCIA on Robinhood Chain since 4 Oct 2026 (api/_tg-buybot-rh.mjs reads it);
// retired: the old Arc $ARCIA and ♾️ Infinite (5 Oct 2026, not official any more) are never followed, even if added before
const CFG = {
  pm: PM_ADDRESS, usdc: lc(ARCIRCLE_QUOTE),
  main: RHB.ARCIA_RH, mainSym: "ARCIA", retired: ["0x9da6d5ce413e94264ea411372459413334a83be5", "0x2a15940316335bfb711db7cba98d637396e80c08"],
  arcircle: lc(ARCIRCLE_TOKEN || ""), arcirclePool: lc(ARCIRCLE_POOL_ID || ""),
};
const EMOJI = (tk) => (tk.t === CFG.main ? "💙💚" : "♾");
const RH_EXPLORER = "https://robinhoodchain.blockscout.com";
const explorerOf = (tk) => (tk && tk.chain === "rh" ? RH_EXPLORER : EXPLORER);
const EXPLORER = "https://arc.etherscan.io";
const MAX_RANGE = 9000; // Arc's RPC refuses wider eth_getLogs
const SEL = { decimals: "0x313ce567", symbol: "0x95d89b41", totalSupply: "0x18160ddd", balanceOf: "0x70a08231" };
const pad = (a) => String(a).toLowerCase().replace(/^0x/, "").padStart(64, "0");
const W = (hex, i) => BigInt("0x" + String(hex).slice(2 + i * 64, 2 + (i + 1) * 64));

export async function load() {
  const d = (await getDoc(KEY)) || {};
  const tokens = Array.isArray(d.tokens) ? d.tokens : [];
  // $ARCIRCLE used to be followed by default: keep it only if a bot admin added it with /buybot add
  for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i] && tokens[i].t === CFG.arcircle && !tokens[i].added) tokens.splice(i, 1);
  // the retired coins (the old Arc $ARCIA, ♾️ Infinite) are dropped, even if a bot admin added them
  for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i] && CFG.retired.includes(tokens[i].t)) tokens.splice(i, 1);
  // $ARCIA on Robinhood Chain is always followed, first
  const at = tokens.findIndex((t) => t && t.t === CFG.main);
  const main = at >= 0 ? tokens.splice(at, 1)[0] : { t: CFG.main, sym: CFG.mainSym, symFixed: true };
  main.chain = "rh"; delete main.pool;
  tokens.unshift(main);
  // $ARCIRCLE's burns are always posted, even when its buys aren't followed
  if (CFG.arcircle && !tokens.some((t) => t && t.t === CFG.arcircle)) tokens.push({ t: CFG.arcircle, pool: CFG.arcirclePool, sym: "ARCIRCLE", burnsOnly: true });
  return { tokens, chats: d.chats || {}, hi: d.hi || 0, anim: d.anim || "", seen: Array.isArray(d.seen) ? d.seen : [], err: d.err || "", last: d.last || null, lastPost: d.lastPost || null, lastPostErr: d.lastPostErr || null,
    burnPend: d.burnPend || {}, burnAt: d.burnAt || 0, burnMs: d.burnMs || {}, burnSeen: Array.isArray(d.burnSeen) ? d.burnSeen : [], rh: d.rh || null };
}
export const save = (s) => putDoc(KEY, s);

// ---- a coin's facts (read once, kept) ----
function strOf(hex) {
  try {
    const s = String(hex).slice(2);
    if (s.length >= 128) { const len = Number(BigInt("0x" + s.slice(64, 128))); return Buffer.from(s.slice(128, 128 + len * 2), "hex").toString("utf8").replace(/\0/g, ""); }
    return Buffer.from(s.slice(0, 64), "hex").toString("utf8").replace(/\0/g, "");
  } catch { return ""; }
}
async function fill(tk) {
  if (tk.dec != null && tk.supply && tk.sym && tk.usdcIs0 != null && Date.now() - (tk.at || 0) < 3600e3) return tk; // supply refreshed hourly (burns)
  tk.at = Date.now();
  const [d, s, ts] = await ethCalls([{ to: tk.t, data: SEL.decimals }, { to: tk.t, data: SEL.symbol }, { to: tk.t, data: SEL.totalSupply }]);
  if (d) tk.dec = Number(BigInt(d));
  if (s && !tk.symFixed) tk.sym = strOf(s) || tk.sym || "TOKEN";
  if (ts) tk.supply = BigInt(ts).toString();
  tk.usdcIs0 = BigInt(CFG.usdc) < BigInt(tk.t);
  return tk;
}
/// the coin's Uniswap v4 pool id against USDC, from Dexscreener (Arc pairs are listed by pool id)
export async function findPool(token, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(`https://api.dexscreener.com/tokens/v1/arc/${token}`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const pairs = (Array.isArray(j) ? j : j.pairs || []).filter((p) => p && /^0x[0-9a-fA-F]{64}$/.test(p.pairAddress || "") && [lc(p.quoteToken && p.quoteToken.address), lc(p.baseToken && p.baseToken.address)].includes(CFG.usdc));
    pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
    return pairs[0] ? lc(pairs[0].pairAddress) : null;
  } catch { return null; }
}

// ---- reading buys ----
/// logs → buys: [{ tk, tx, block, usd, tokens, buyer, px }]
async function toBuys(S, logs) {
  const byPool = new Map(S.tokens.map((t) => [t.pool, t]));
  const raw = [];
  for (const l of logs) {
    const tk = byPool.get(lc(l.topics[1]));
    if (!tk || tk.dec == null) continue;
    const a0 = BigInt.asIntN(128, W(l.data, 0)), a1 = BigInt.asIntN(128, W(l.data, 1));
    const ud = tk.usdcIs0 ? a0 : a1, td = tk.usdcIs0 ? a1 : a0; // the swapper's side: negative = paid in
    if (ud >= 0n || td <= 0n) continue; // a sell (or nothing)
    const usd = Number(-ud) / 1e6, tokens = Number(td) / 10 ** tk.dec;
    raw.push({ tk, tx: lc(l.transactionHash), idx: parseInt(l.logIndex, 16), block: parseInt(l.blockNumber, 16), usd, tokens, px: usd / tokens });
  }
  if (!raw.length) return [];
  // who bought: the transaction's sender (the swap itself comes from a router)
  const txs = [...new Set(raw.map((b) => b.tx))];
  const out = await rpc(txs.map((t, i) => ({ jsonrpc: "2.0", id: i, method: "eth_getTransactionByHash", params: [t] })));
  const from = new Map((Array.isArray(out) ? out : [out]).map((x) => [txs[x.id], x && x.result ? lc(x.result.from) : ""]));
  raw.forEach((b) => { b.buyer = from.get(b.tx) || ""; });
  // new holder: what the wallet holds now is (about) what it just bought
  const bal = await ethCalls(raw.map((b) => ({ to: b.tk.t, data: SEL.balanceOf + pad(b.buyer) })));
  raw.forEach((b, i) => { const held = bal[i] ? Number(BigInt(bal[i])) / 10 ** b.tk.dec : null; b.held = held; b.fresh = held != null && held <= b.tokens * 1.02; });
  return raw;
}

// ---- the message ----
const money = (n) => (n >= 1000 ? "$" + compact(n) : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pxFmt = (p) => (p >= 1 ? "$" + p.toFixed(4) : p >= 0.0001 ? "$" + p.toPrecision(4) : "$" + p.toExponential(3));
// ARCIA's little word under each buy — a new holder gets a welcome
const CHEER_NEW = ["Welcome to the ARCIRCLE family~ 💙💚", "A new fan joined the circle! So happy~ ✨", "Hi new holder~ I'll remember you 😉"];
const CHEER = ["Thank you for the love~ 💙💚", "Keep building. Keep shining. ♾", "The circle keeps growing~ ✨", "You made my day~ 😉"];
const pick = (list, seed) => list[Math.abs(parseInt(String(seed).slice(-6), 16) || 0) % list.length];
export function message(b, { test = false } = {}) {
  const rh = b.tk.chain === "rh", EX = explorerOf(b.tk);
  const n = Math.max(2, Math.min(16, Math.round((b.usd || 0) / 5))); // 💙💚 per $10, up to a phone-width line
  const bar = Array.from({ length: n }, (_, i) => (i % 2 ? "💚" : "💙")).join("");
  const mc = b.tk.supply && b.px != null ? (Number(BigInt(b.tk.supply)) / 10 ** b.tk.dec) * b.px : null;
  const tier = (b.usd || 0) >= 500 ? "🐳 WHALE BUY" : (b.usd || 0) >= 100 ? "🔥 BIG BUY" : "🚀 NEW BUY";
  const ethS = (x) => x.toLocaleString("en-US", { maximumFractionDigits: x < 0.01 ? 6 : 4 });
  const prev = b.held != null ? b.held - b.tokens : null;
  const pos = b.fresh ? "✨ <b>New holder!</b>" : prev > 0 ? `📊 Position <b>+${Math.min(9999, (b.tokens / prev) * 100).toFixed(prev < b.tokens ? 0 : 1)}%</b>` : "";
  const text = [
    `${EMOJI(b.tk)} <b>$${h(b.tk.sym)}</b>  ${tier}!${rh ? "  <i>Robinhood Chain</i>" : ""}${test ? "  <i>(test)</i>" : ""}`,
    bar,
    "",
    rh ? `💵 <b>Spent</b>   ${ethS(b.eth)} ETH${b.usd != null ? ` (${money(b.usd)})` : ""}` : `💵 <b>Spent</b>   ${money(b.usd)} USDC`,
    `🪙 <b>Got</b>   ${compact(b.tokens)} $${h(b.tk.sym)}`,
    `👤 <b>Buyer</b>   <a href="${EX}/address/${b.buyer}">${short(b.buyer)}</a>`,
    pos,
    b.px != null ? `💲 <b>Price</b>   ${pxFmt(b.px)}` : "",
    mc ? `💎 <b>Market cap</b>   ${money(mc)}` : "",
    "",
    `<i>💬 ARCIA: ${h(pick(b.fresh ? CHEER_NEW : CHEER, b.tx))}</i>`,
  ].filter((x, i, a) => x !== "" || (a[i - 1] !== "" && i > 0)).join("\n");
  const buttons = rh
    ? [[{ text: `🛒 Buy $${b.tk.sym} on Pons`, url: RHB.CFG.buyUrl }, { text: "📈 Chart", url: RHB.CFG.chartUrl }], [{ text: "🔍 Transaction", url: `${EX}/tx/${b.tx}` }, { text: "♾ ARCIRCLE PAD", url: `${SITE}/arc` }]]
    : [[{ text: `🛒 Buy $${b.tk.sym}`, url: `https://argus.world/token/${b.tk.t}` }, { text: "📈 Chart", url: `https://dexscreener.com/arc/${b.tk.pool}` }],
      [{ text: "🔍 Transaction", url: `${EX}/tx/${b.tx}` }, { text: "♾ ARCIRCLE PAD", url: `${SITE}/arc` }]];
  return { text, buttons };
}
async function post(S, chatId, b, opts) {
  const { text, buttons } = message(b, opts);
  const base = { chat_id: chatId, caption: text, parse_mode: "HTML", ...kb(buttons) };
  // every alert carries the welcome clip (arcia-gm.mp4): Telegram's own copy once it has one, the file itself otherwise
  let r = await tg("sendAnimation", { ...base, animation: S.anim || `${SITE}/images/arcia-gm.mp4` });
  if (!r.ok && S.anim && !/chat not found|kicked|not a member|blocked|too many/i.test(r.description || "")) { S.anim = ""; S.dirty = true; r = await tg("sendAnimation", { ...base, animation: `${SITE}/images/arcia-gm.mp4` }); }
  if (r.ok && !S.anim && r.result && r.result.animation) { S.anim = r.result.animation.file_id; S.dirty = true; } // Telegram's copy, reused from now on
  if (!r.ok && /too many/i.test(r.description || "")) { await sleep(1500); r = await tg("sendAnimation", { ...base, animation: S.anim || `${SITE}/images/arcia-gm.mp4` }); }
  if (!r.ok) r = await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...kb(buttons) });
  if (!r.ok && /chat not found|kicked|not a member|blocked/i.test(r.description || "")) { delete S.chats[String(chatId)]; S.dirty = true; }
  return r;
}

// ---- burns: $ARCIRCLE and $ARCIA sent to 0x…dEaD, gathered and posted at most every 2 minutes per coin
// (burn-to-vote alone can be many small burns), with where they came from and the total burned so far.
// A group turns them off with /buybot burns off (they're on wherever buy alerts are on).
const DEAD = "0x000000000000000000000000000000000000dead";
const DEAD_TOPIC = "0x" + DEAD.slice(2).padStart(64, "0");
const BURN_EVERY = 120e3;
export const BURN_MS = [15, 20, 25, 30, 40, 50, 60, 75, 90];
const KIND_NAME = { vote: "Burn-to-vote", mine: "Builder Mine", scanner: "Token Scanner", secret: "ARCIA's secret file", desk: "ARCIA DESK", buyback: "Buyback", team: "Team & treasury", wallet: "Direct burn" };
function burnTokens(S) { return S.tokens.filter((t) => t.dec != null && t.chain !== "rh"); } // Arc coins (Robinhood Chain's: api/_tg-buybot-rh.mjs)
async function gatherBurns(S, logs) {
  for (const l of logs) {
    const key = `${l.transactionHash}:${parseInt(l.logIndex, 16)}`;
    if (S.burnSeen.includes(key)) continue;
    S.burnSeen = [...S.burnSeen, key].slice(-300);
    const t = lc(l.address), tk = S.tokens.find((x) => x.t === t);
    if (!tk) continue;
    const p = S.burnPend[t] || (S.burnPend[t] = { tok: 0, n: 0, txs: [], froms: [] });
    p.tok += Number(BigInt(l.data || "0x0")) / 10 ** (tk.dec || 18); p.n++;
    p.txs = [...p.txs, l.transactionHash].slice(-12);
    p.froms = [...p.froms, lc("0x" + String(l.topics[1]).slice(26))].slice(-12);
  }
}
async function burnKinds(p) {
  const txs = [...new Set(p.txs)].slice(-10);
  const tos = await Promise.all(txs.map((h) => rpcCall("eth_getTransactionByHash", [h]).then((x) => lc(x && x.to)).catch(() => "")));
  let docs = {};
  try { docs = (await getDocs(txs.flatMap((h) => [`scanBurn/${lc(h)}`, `arciaSecretTx/${lc(h)}`]))) || {}; } catch { docs = {}; }
  const count = {};
  txs.forEach((h, i) => {
    const k = kindOf({ fr: p.froms[p.txs.lastIndexOf(h)] || "" }, tos[i], { scanner: !!docs[`scanBurn/${lc(h)}`], secret: !!docs[`arciaSecretTx/${lc(h)}`] });
    count[k] = (count[k] || 0) + 1;
  });
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, n]) => (KIND_NAME[k] || k) + (n > 1 ? " ×" + n : "")).join(" · ");
}
export function burnMessage(tk, p, from, totalPct, milestone) {
  const n = Math.max(1, Math.min(12, Math.round(Math.log10(Math.max(10, p.tok)) * 2)));
  const text = [
    milestone ? `🏆 <b>MILESTONE: ${milestone}% of $${h(tk.sym)} burned forever</b>` : null,
    `🔥 <b>$${h(tk.sym)} BURNED</b>${tk.chain === "rh" ? "  <i>Robinhood Chain</i>" : ""}`,
    "🔥".repeat(n),
    "",
    `🪙 <b>Burned</b>   ${compact(p.tok)} $${h(tk.sym)}${p.n > 1 ? ` (${p.n} burns)` : ""}`,
    from ? `🏷 <b>From</b>   ${h(from)}` : null,
    totalPct != null ? `📊 <b>Total burned</b>   ${totalPct.toFixed(2)}% of the supply` : null,
    "",
    `<i>💬 ARCIA: ${milestone ? "A new milestone~ thank you for burning with me 💙💚" : "Gone forever~ the burn engine keeps going 💙💚"}</i>`,
  ].filter((x) => x !== null).join("\n");
  const last = p.txs[p.txs.length - 1];
  const buttons = [[{ text: "🔥 Burn engine", url: `${SITE}/reward` }, ...(last ? [{ text: "🔍 Transaction", url: `${explorerOf(tk)}/tx/${last}` }] : [])]];
  return { text, buttons };
}
async function flushBurns(S, out, force = false) {
  if (!force && Date.now() - (S.burnAt || 0) < BURN_EVERY) return;
  const coins = Object.keys(S.burnPend).filter((t) => S.burnPend[t] && S.burnPend[t].n > 0);
  if (!coins.length) return;
  S.burnAt = Date.now();
  for (const t of coins) {
    const tk = S.tokens.find((x) => x.t === t), p = S.burnPend[t];
    delete S.burnPend[t];
    if (!tk) continue;
    let pct = null;
    try {
      if (tk.chain === "rh") pct = await RHB.burnedPct(tk);
      else { const [b] = await ethCalls([{ to: t, data: SEL.balanceOf + pad(DEAD) }]); if (b && tk.supply) pct = (Number(BigInt(b)) / Number(BigInt(tk.supply))) * 100; }
    } catch { /* no total this time */ }
    let ms = null;
    if (pct != null) {
      const hit = BURN_MS.filter((m) => pct >= m && !(S.burnMs[t] || []).includes(m));
      if (hit.length) { S.burnMs[t] = [...(S.burnMs[t] || []), ...hit]; ms = S.burnMs[t].length === hit.length && hit.length > 1 ? null : hit[hit.length - 1]; } // first run: remember, don't announce old milestones
    }
    const from = tk.chain === "rh" ? "" : await burnKinds(p).catch(() => "");
    const { text, buttons } = burnMessage(tk, p, from, pct, ms);
    for (const [id, cc] of Object.entries(S.chats)) {
      if (cc.burns === false) continue;
      const r = await tg("sendMessage", { chat_id: id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...kb(buttons) });
      if (r.ok) out.burnsPosted = (out.burnsPosted || 0) + 1;
      else if (/chat not found|kicked|not a member|blocked/i.test(r.description || "")) delete S.chats[String(id)];
    }
  }
}

/// one run: from the last block seen to the head, every few seconds until the time is up
export async function run({ budgetMs = 45000, everyMs = 8000 } = {}) {
  const t0 = Date.now();
  const S = await load();
  const out = { posted: 0, buys: 0, chats: Object.keys(S.chats).length, polls: 0 };
  if (!out.chats) { S.last = { at: Date.now(), note: "no group has /buybot on" }; await save(S); return { ...out, note: "no group has /buybot on" }; }
  for (const tk of S.tokens) { try { if (tk.chain === "rh") await RHB.fill(tk); else await fill(tk); } catch { /* next run */ } }
  const pools = S.tokens.filter((t) => t.pool && t.dec != null && !t.burnsOnly && t.chain !== "rh").map((t) => t.pool);
  const send = async (b) => {
    for (const [id, cc] of Object.entries(S.chats)) {
      if ((b.usd || 0) < (cc.min || 0)) continue;
      if (cc.n && cc.n >= 20 && cc.nMin === Math.floor(Date.now() / 60000)) continue; // Telegram: 20 messages a minute per group
      const r = await post(S, id, b);
      if (!r.ok) S.lastPostErr = { at: Date.now(), error: String(r.description || "").slice(0, 160) };
      if (r.ok) { out.posted++; S.lastPost = { at: Date.now(), sym: b.tk.sym, usd: Math.round((b.usd || 0) * 100) / 100 }; const m = Math.floor(Date.now() / 60000); cc.n = cc.nMin === m ? (cc.n || 0) + 1 : 1; cc.nMin = m; }
    }
  };
  do {
    out.polls++;
    let head;
    try { head = (await latestBlock()).number; } catch (e) { S.err = String(e.message || e).slice(0, 160); break; }
    let from = S.hi ? S.hi + 1 : head - 20;
    if (head - from > MAX_RANGE) from = head - 600; // far behind (downtime): old buys aren't news
    // $ARCIA on Robinhood Chain: its buys and burns
    try { const rb = await RHB.pass(S); out.buys += rb.length; for (const b of rb) await send(b); }
    catch (e) { S.err = "robinhood: " + String(e.message || e).slice(0, 140); }
    if (from <= head) {
      let logs = [];
      if (pools.length) {
        try { logs = await getLogs({ address: CFG.pm, topics: [TOPIC.swap, pools], fromBlock: toQty(from), toBlock: toQty(head) }, 2); }
        catch (e) { S.err = String(e.message || e).slice(0, 160); break; }
      }
      // burns of our coins in the same range
      const bt = burnTokens(S).map((t) => t.t);
      if (bt.length) {
        try { await gatherBurns(S, await getLogs({ address: bt, topics: [TOPIC.transfer, null, DEAD_TOPIC], fromBlock: toQty(from), toBlock: toQty(head) }, 2)); }
        catch { /* next poll */ }
      }
      const buys = (await toBuys(S, logs)).filter((b) => !S.seen.includes(`${b.tx}:${b.idx}`));
      out.buys += buys.length;
      for (const b of buys) {
        S.seen = [...S.seen, `${b.tx}:${b.idx}`].slice(-200);
        await send(b);
      }
      S.hi = head; if (!/^robinhood/.test(S.err)) S.err = "";
      await flushBurns(S, out).catch((e) => { S.err = "burns: " + String(e.message || e).slice(0, 120); });
    }
    if (Date.now() - t0 + everyMs > budgetMs) break;
    await sleep(everyMs);
  } while (true);
  delete S.dirty;
  S.last = { at: Date.now(), polls: out.polls, buys: out.buys, posted: out.posted, head: S.hi, error: S.err || "" };
  await save(S);
  return out;
}

/// public, read-only: is the buybot running? (no chat ids, nothing secret)
export async function health() {
  const S = await load();
  const ago = (t) => (t ? Math.round((Date.now() - t) / 1000) + " s ago" : null);
  return {
    groups: Object.keys(S.chats).length, coins: S.tokens.map((t) => ({ sym: t.sym || "?", token: t.t, pool: t.pool || null })),
    lastRun: S.last ? { ...S.last, at: ago(S.last.at) } : null, lastPost: S.lastPost ? { ...S.lastPost, at: ago(S.lastPost.at) } : null,
    lastPostError: S.lastPostErr ? { ...S.lastPostErr, at: ago(S.lastPostErr.at) } : null,
    running: !!(S.last && Date.now() - S.last.at < 3 * 60e3),
    hint: !S.last ? "the every-minute call (GET /api/arcia-tg?buys=1&key=…) hasn't run yet" : !Object.keys(S.chats).length ? "no group has /buybot on" : null,
  };
}

// ---- commands ----
export async function status(chatId) {
  const S = await load();
  const cc = S.chats[String(chatId)];
  const coins = S.tokens.filter((t) => !t.burnsOnly).map((t) => `$${h(t.sym || "?")} <code>${short(t.t)}</code>`).join(", ");
  const burns = S.tokens.map((t) => `$${h(t.sym || "?")}`).join(", ");
  return `<b>Buy alerts</b> — ${cc ? `on here${cc.min ? `, buys of $${cc.min}+` : ", every buy"}` : "off here"}\nFollowing: ${coins}\n<b>Burn alerts</b> — ${cc && cc.burns !== false ? "on" : "off"} here (${burns})\n\n/buybot on [min] · /buybot min 10 · /buybot off · /buybot burns on|off`;
}
export async function setChat(chatId, title, patch) {
  const S = await load();
  if (patch === null) delete S.chats[String(chatId)];
  else S.chats[String(chatId)] = { ...(S.chats[String(chatId)] || {}), title: String(title || "").slice(0, 60), ...patch };
  if (!S.hi) { try { S.hi = (await latestBlock()).number; } catch { /* the first run sets it */ } }
  await save(S);
  return S.chats[String(chatId)] || null;
}
export async function setBurns(chatId, on) {
  const S = await load();
  const cc = S.chats[String(chatId)];
  if (!cc) return { error: "Turn buy alerts on here first: /buybot on" };
  cc.burns = !!on;
  await save(S);
  return { ok: true };
}
export async function addToken(token, pool) {
  if (!isAddr(token)) return { error: "Send the token's contract address: /buybot add 0x…" };
  token = lc(token);
  if (CFG.retired.includes(token)) return { error: "That coin was retired on 5 Oct 2026 and isn't official any more. The official coins: /ca" };
  const S = await load();
  if (S.tokens.some((t) => t.t === token)) return { error: "Already following that coin." };
  if (!pool) pool = await findPool(token);
  if (!/^0x[0-9a-f]{64}$/.test(lc(pool || ""))) return { error: "Couldn't find its USDC pool yet (Dexscreener lists it a few minutes after launch). Add it with the pool id: /buybot add 0xTOKEN 0xPOOLID" };
  const tk = await fill({ t: token, pool: lc(pool), added: true });
  if (tk.dec == null) return { error: "That address doesn't answer like a token." };
  S.tokens.push(tk);
  await save(S);
  return { ok: true, tk };
}
export async function removeToken(token) {
  const S = await load();
  if (lc(token) === CFG.main) return { error: "$ARCIA on Robinhood Chain is always followed." };
  const n = S.tokens.length;
  S.tokens = S.tokens.filter((t) => t.t !== lc(token));
  if (S.tokens.length === n) return { error: "Not following that coin." };
  await save(S);
  return { ok: true };
}
/// the latest buy of the first coin that had one in the last ~20k blocks, posted to chatId as a test
export async function test(chatId) {
  const S = await load();
  try { const b = await RHB.latestBuy(S); if (b) { const r = await post(S, chatId, b, { test: true }); if (S.dirty) { delete S.dirty; await save(S); } return r.ok ? { ok: true } : { error: r.description || "couldn't post" }; } } catch { /* try Arc */ }
  for (const tk of S.tokens) { try { if (tk.chain !== "rh") await fill(tk); } catch { /* skip */ } }
  const head = (await latestBlock()).number;
  for (let to = head, k = 0; k < 3; k++, to -= MAX_RANGE) {
    const arcPools = S.tokens.filter((t) => !t.burnsOnly && t.pool && t.chain !== "rh").map((t) => t.pool);
    if (!arcPools.length) break;
    const logs = await getLogs({ address: CFG.pm, topics: [TOPIC.swap, arcPools], fromBlock: toQty(Math.max(0, to - MAX_RANGE + 1)), toBlock: toQty(to) }, 2);
    const buys = await toBuys(S, logs.slice(-40));
    if (buys.length) { const r = await post(S, chatId, buys[buys.length - 1], { test: true }); if (S.dirty) { delete S.dirty; await save(S); } return r.ok ? { ok: true } : { error: r.description || "couldn't post" }; }
  }
  return { error: "No buy in the last few hours to show." };
}
export const _test = { toBuys, fill, gatherBurns, flushBurns, configure: (x) => Object.assign(CFG, x) };
