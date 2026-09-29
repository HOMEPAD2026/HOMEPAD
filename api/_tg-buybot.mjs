// api/_tg-buybot.mjs — ARCIA's buy alerts on Telegram, for our own coins only ($ARCIRCLE, and $ARCIA once it
// launches). Every buy in the coin's Uniswap v4 pool on Arc is posted to the groups that turned it on:
// how much was spent, what it bought, who bought (new holder or not), the price and market cap, with buttons.
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
import { getLogs, latestBlock, ethCalls, rpc, toQty, isAddr, PM_ADDRESS, TOPIC } from "./_arc.mjs";
import { ARCIRCLE_TOKEN, ARCIRCLE_POOL_ID, ARCIRCLE_QUOTE } from "./_arcircle.mjs";
import { SITE, h, lc, short, compact, sleep, tg, kb, getDoc, putDoc } from "./_tg-lib.mjs";

const KEY = "tgArcia/buybot";
// the chain's addresses (tests point these at a local chain)
const CFG = { pm: PM_ADDRESS, usdc: lc(ARCIRCLE_QUOTE), arcircle: lc(ARCIRCLE_TOKEN || ""), pool: lc(ARCIRCLE_POOL_ID || "") };
const EXPLORER = "https://arc.etherscan.io";
const MAX_RANGE = 9000; // Arc's RPC refuses wider eth_getLogs
const SEL = { decimals: "0x313ce567", symbol: "0x95d89b41", totalSupply: "0x18160ddd", balanceOf: "0x70a08231" };
const pad = (a) => String(a).toLowerCase().replace(/^0x/, "").padStart(64, "0");
const W = (hex, i) => BigInt("0x" + String(hex).slice(2 + i * 64, 2 + (i + 1) * 64));

export async function load() {
  const d = (await getDoc(KEY)) || {};
  const tokens = Array.isArray(d.tokens) ? d.tokens : [];
  // $ARCIRCLE is always followed
  if (CFG.arcircle && !tokens.some((t) => t.t === CFG.arcircle)) tokens.unshift({ t: CFG.arcircle, pool: CFG.pool, sym: "ARCIRCLE" });
  return { tokens, chats: d.chats || {}, hi: d.hi || 0, anim: d.anim || "", seen: Array.isArray(d.seen) ? d.seen : [], err: d.err || "" };
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
  const n = Math.max(2, Math.min(16, Math.round(b.usd / 5))); // 💙💚 per $10, up to a phone-width line
  const bar = Array.from({ length: n }, (_, i) => (i % 2 ? "💚" : "💙")).join("");
  const mc = b.tk.supply ? (Number(BigInt(b.tk.supply)) / 10 ** b.tk.dec) * b.px : null;
  const tier = b.usd >= 500 ? "🐳 WHALE BUY" : b.usd >= 100 ? "🔥 BIG BUY" : "🚀 NEW BUY";
  const prev = b.held != null ? b.held - b.tokens : null;
  const pos = b.fresh ? "✨ <b>New holder!</b>" : prev > 0 ? `📊 Position <b>+${Math.min(9999, (b.tokens / prev) * 100).toFixed(prev < b.tokens ? 0 : 1)}%</b>` : "";
  const text = [
    `♾ <b>$${h(b.tk.sym)}</b>  ${tier}!${test ? "  <i>(test)</i>" : ""}`,
    bar,
    "",
    `💵 <b>Spent</b>   ${money(b.usd)} USDC`,
    `🪙 <b>Got</b>   ${compact(b.tokens)} $${h(b.tk.sym)}`,
    `👤 <b>Buyer</b>   <a href="${EXPLORER}/address/${b.buyer}">${short(b.buyer)}</a>`,
    pos,
    `💲 <b>Price</b>   ${pxFmt(b.px)}`,
    mc ? `💎 <b>Market cap</b>   ${money(mc)}` : "",
    "",
    `<i>💬 ARCIA: ${h(pick(b.fresh ? CHEER_NEW : CHEER, b.tx))}</i>`,
  ].filter((x, i, a) => x !== "" || (a[i - 1] !== "" && i > 0)).join("\n");
  const buttons = [[{ text: `🛒 Buy $${b.tk.sym}`, url: `https://argus.world/token/${b.tk.t}` }, { text: "📈 Chart", url: `https://dexscreener.com/arc/${b.tk.pool}` }],
    [{ text: "🔍 Transaction", url: `${EXPLORER}/tx/${b.tx}` }, { text: "♾ ARCIRCLE PAD", url: `${SITE}/arc` }]];
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

/// one run: from the last block seen to the head, every few seconds until the time is up
export async function run({ budgetMs = 45000, everyMs = 8000 } = {}) {
  const t0 = Date.now();
  const S = await load();
  const out = { posted: 0, buys: 0, chats: Object.keys(S.chats).length, polls: 0 };
  if (!out.chats) return { ...out, note: "no group has /buybot on" };
  for (const tk of S.tokens) { try { await fill(tk); } catch { /* next run */ } }
  const pools = S.tokens.filter((t) => t.pool && t.dec != null).map((t) => t.pool);
  if (!pools.length) return out;
  do {
    out.polls++;
    let head;
    try { head = (await latestBlock()).number; } catch (e) { S.err = String(e.message || e).slice(0, 160); break; }
    let from = S.hi ? S.hi + 1 : head - 20;
    if (head - from > MAX_RANGE) from = head - 600; // far behind (downtime): old buys aren't news
    if (from <= head) {
      let logs = [];
      try { logs = await getLogs({ address: CFG.pm, topics: [TOPIC.swap, pools], fromBlock: toQty(from), toBlock: toQty(head) }, 2); }
      catch (e) { S.err = String(e.message || e).slice(0, 160); break; }
      const buys = (await toBuys(S, logs)).filter((b) => !S.seen.includes(`${b.tx}:${b.idx}`));
      out.buys += buys.length;
      for (const b of buys) {
        S.seen = [...S.seen, `${b.tx}:${b.idx}`].slice(-200);
        for (const [id, cc] of Object.entries(S.chats)) {
          if (b.usd < (cc.min || 0)) continue;
          if (cc.n && cc.n >= 20 && cc.nMin === Math.floor(Date.now() / 60000)) continue; // Telegram: 20 messages a minute per group
          const r = await post(S, id, b);
          if (r.ok) { out.posted++; const m = Math.floor(Date.now() / 60000); cc.n = cc.nMin === m ? (cc.n || 0) + 1 : 1; cc.nMin = m; }
        }
      }
      S.hi = head; S.err = "";
    }
    if (Date.now() - t0 + everyMs > budgetMs) break;
    await sleep(everyMs);
  } while (true);
  delete S.dirty;
  await save(S);
  return out;
}

// ---- commands ----
export async function status(chatId) {
  const S = await load();
  const cc = S.chats[String(chatId)];
  const coins = S.tokens.map((t) => `$${h(t.sym || "?")} <code>${short(t.t)}</code>`).join(", ");
  return `<b>Buy alerts</b> — ${cc ? `on here${cc.min ? `, buys of $${cc.min}+` : ", every buy"}` : "off here"}\nFollowing: ${coins}\n\n/buybot on [min] · /buybot min 10 · /buybot off`;
}
export async function setChat(chatId, title, patch) {
  const S = await load();
  if (patch === null) delete S.chats[String(chatId)];
  else S.chats[String(chatId)] = { ...(S.chats[String(chatId)] || {}), title: String(title || "").slice(0, 60), ...patch };
  if (!S.hi) { try { S.hi = (await latestBlock()).number; } catch { /* the first run sets it */ } }
  await save(S);
  return S.chats[String(chatId)] || null;
}
export async function addToken(token, pool) {
  if (!isAddr(token)) return { error: "Send the token's contract address: /buybot add 0x…" };
  token = lc(token);
  const S = await load();
  if (S.tokens.some((t) => t.t === token)) return { error: "Already following that coin." };
  if (!pool) pool = await findPool(token);
  if (!/^0x[0-9a-f]{64}$/.test(lc(pool || ""))) return { error: "Couldn't find its USDC pool yet (Dexscreener lists it a few minutes after launch). Add it with the pool id: /buybot add 0xTOKEN 0xPOOLID" };
  const tk = await fill({ t: token, pool: lc(pool) });
  if (tk.dec == null) return { error: "That address doesn't answer like a token." };
  S.tokens.push(tk);
  await save(S);
  return { ok: true, tk };
}
export async function removeToken(token) {
  const S = await load();
  if (lc(token) === CFG.arcircle) return { error: "$ARCIRCLE is always followed." };
  const n = S.tokens.length;
  S.tokens = S.tokens.filter((t) => t.t !== lc(token));
  if (S.tokens.length === n) return { error: "Not following that coin." };
  await save(S);
  return { ok: true };
}
/// the latest buy of the first coin that had one in the last ~20k blocks, posted to chatId as a test
export async function test(chatId) {
  const S = await load();
  for (const tk of S.tokens) { try { await fill(tk); } catch { /* skip */ } }
  const head = (await latestBlock()).number;
  for (let to = head, k = 0; k < 3; k++, to -= MAX_RANGE) {
    const logs = await getLogs({ address: CFG.pm, topics: [TOPIC.swap, S.tokens.map((t) => t.pool)], fromBlock: toQty(Math.max(0, to - MAX_RANGE + 1)), toBlock: toQty(to) }, 2);
    const buys = await toBuys(S, logs.slice(-40));
    if (buys.length) { const r = await post(S, chatId, buys[buys.length - 1], { test: true }); if (S.dirty) { delete S.dirty; await save(S); } return r.ok ? { ok: true } : { error: r.description || "couldn't post" }; }
  }
  return { error: "No buy in the last few hours to show." };
}
export const _test = { toBuys, fill, configure: (x) => Object.assign(CFG, x) };
