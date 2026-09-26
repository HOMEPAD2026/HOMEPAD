// api/tg-launch.mjs — posts a new ArcPad launch to a Telegram channel as a
// card: the coin's generated preview image (logo, ticker, price, market cap)
// with a formatted caption and buttons to trade, check it on ArcScan and share.
//
// Off unless both env vars are set in Vercel (Project → Settings → Environment
// Variables):  TG_BOT_TOKEN (from @BotFather) and TG_CHAT_ID (e.g. @yourchannel
// or a numeric chat id; the bot must be an admin there).
// Optional:     TG_TEST_KEY — lets the owner re-post any launch for testing:
//   curl -X POST https://www.arcircle.app/api/tg-launch \
//     -H 'content-type: application/json' -d '{"token":"0x…","key":"<TG_TEST_KEY>"}'
//
// /scan in Telegram (optional): with TG_WEBHOOK_SECRET also set, point the
// bot's webhook here and anyone can send "/scan 0x…" to the bot (or in a group
// it's in) and get the Token Scanner's score back. One-time setup, run by the
// owner in their own terminal (never paste the bot token anywhere else):
//   curl "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook" \
//     -d url=https://www.arcircle.app/api/tg-launch -d secret_token=<TG_WEBHOOK_SECRET> \
//     -d 'allowed_updates=["message"]'
// "/watch 0x…" alerts also need the repo secret TG_WEBHOOK_SECRET (same
// value) for the 15-minute check in tools/scan-watch.workflow.yml.
// Telegram then sends every message with that secret in a header; anything
// without it is treated as a launch announcement request, as before.
//
// The launch page calls POST /api/tg-launch {"token":"0x…"} after a launch
// confirms. The token is checked on-chain (must be an ArcPad launch from the
// last 15 minutes) and announced once per server instance, so the endpoint
// can't be used to post arbitrary text or old coins.
import { getCoin, isAddr, fmtUsd, SITE } from "./_arc.mjs";
import { scanToken } from "./_scan.mjs";

export const config = { runtime: "edge" };
const sent = new Set();
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const h = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const EXPLORER = "https://arc.etherscan.io";

export function buildPost(coin) {
  const sym = coin.symbol || "COIN";
  const link = `${SITE}/c/${coin.token}`;
  const fee = 1 + (coin.extraFeeBps || 0) / 100;
  const desc = String(coin.description || "").replace(/\s+/g, " ").trim();
  const title = `<b>$${h(sym)}</b>${coin.name && coin.name !== sym ? `  —  ${h(coin.name)}` : ""}`
    + (desc ? `\n<blockquote>${h(desc.length > 220 ? desc.slice(0, 219) + "…" : desc)}</blockquote>` : "");
  const stats = [
    `▸ Market cap   <b>${h(fmtUsd(coin.mcapUsd))}</b>`,
    `▸ Pair   <b>${h(coin.quoteSymbol || "—")}</b>`,
    `▸ Trade fee   <b>${fee}%</b>${coin.extraFeeBps ? `  (${coin.extraFeeBps / 100}% to the creator)` : ""}`,
    `▸ Creator   <a href="${EXPLORER}/address/${coin.creator}">${short(coin.creator)}</a>`,
  ].join("\n");
  const caption = [
    `<b>NEW LAUNCH</b>  ·  ArcPad 💚`,
    title,
    stats,
    `<b>CA</b>  <i>(tap to copy)</i>\n<code>${coin.token}</code>`,
    `<i>Real Uniswap v4 pool on Circle's Arc — tradeable from block one.</i>`,
  ].join("\n\n");
  const shareText = `$${sym} just launched on ArcPad — a real Uniswap v4 pool on Circle's Arc 💚`;
  const reply_markup = {
    inline_keyboard: [
      [{ text: `Trade $${sym} on ArcPad`, url: link }],
      [
        { text: "ArcScan", url: `${EXPLORER}/token/${coin.token}` },
        { text: "Share on X", url: `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}&via=ARCIRCLEonArc` },
      ],
      [
        { text: "Community chat", url: "https://t.me/ARCIRCLEonarc" },
        { text: "Follow on X", url: "https://x.com/ARCIRCLEonArc" },
      ],
    ],
  };
  return { caption, reply_markup, photo: `${SITE}/api/og?addr=${coin.token}&kind=launch&t=${coin.launchedAt}`, link };
}

// ---- /scan: the Token Scanner in Telegram ----
const lastScan = new Map(); // chat → time, a little breathing room between scans
const VERDICT_MARK = { ok: "▲", care: "■", risk: "▼" };
async function onUpdate(req, bot) {
  let u = {};
  try { u = (await req.json()) || {}; } catch { return json(200, { ok: true }); }
  const msg = u.message || u.edited_message;
  const text = String((msg && msg.text) || "").trim();
  const m = /^\/scan(?:@\w+)?(?:\s+(\S+))?/i.exec(text);
  const w = /^\/(watch|unwatch|watching)(?:@\w+)?(?:\s+(\S+))?/i.exec(text);
  const sn = /^\/snapshot(?:@\w+)?(?:\s+(\S+))?/i.exec(text);
  if (!msg || (!m && !w && !sn)) return json(200, { ok: true });
  const chat = msg.chat && msg.chat.id;
  if (w) return onWatch(msg, chat, w[1].toLowerCase(), String(w[2] || ""), bot);
  if (sn) return onSnapshot(msg, chat, String(sn[1] || ""), bot);
  const say = (payload) => fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, parse_mode: "HTML", reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true }, ...payload }),
  }).catch(() => null);
  const addr = String(m[1] || "");
  if (!isAddr(addr)) { await say({ text: "Send <code>/scan</code> followed by a token's contract address on Arc, e.g.\n<code>/scan 0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7</code>" }); return json(200, { ok: true }); }
  const last = lastScan.get(chat) || 0;
  if (Date.now() - last < 8000) return json(200, { ok: true });
  lastScan.set(chat, Date.now());
  let out = null;
  try { out = await scanToken(addr, { budgetMs: 7000 }); } catch { out = null; }
  const res = out && out.res, c = out && out.c;
  if (!res) { await say({ text: "Couldn't read that address from Arc right now — try again in a minute." }); return json(200, { ok: true }); }
  if (res.notToken) { await say({ text: `<b>${h(res.rows[0].title)}</b>\n${h(res.rows[0].detail)}` }); return json(200, { ok: true }); }
  const link = `${SITE}/s/${addr.toLowerCase()}`;
  const lines = res.reasons.map((r) => `${r.status === "risk" ? "✕" : r.status === "warn" ? "!" : "✓"}  ${h(r.title)}`).join("\n");
  const counts = ["risk", "warn"].map((k) => res.rows.filter((r) => r.status === k).length);
  const textOut = [
    `<b>$${h(c.symbol || "?")}</b>  ·  Token Scanner`,
    `${VERDICT_MARK[res.verdict.k]} <b>${res.score}/100 — ${h(res.verdict.t)}</b>\n${counts[0]} risk${counts[0] === 1 ? "" : "s"} · ${counts[1]} warning${counts[1] === 1 ? "" : "s"}`,
    lines,
    `<code>${h(addr)}</code>`,
    `<i>An automated read of the chain, not advice.</i>`,
  ].join("\n\n");
  await say({
    text: textOut,
    link_preview_options: { url: link, prefer_large_media: true, show_above_text: false },
    reply_markup: { inline_keyboard: [[{ text: "Full scan", url: link }, { text: "ArcScan", url: `${EXPLORER}/token/${addr}` }]] },
  });
  return json(200, { ok: true });
}

// "/snapshot 0x…": the Holder Snapshot's summary of a token right now.
async function onSnapshot(msg, chat, addr, bot) {
  const say = (payload) => fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, parse_mode: "HTML", reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true }, ...payload }),
  }).catch(() => null);
  if (!isAddr(addr)) { await say({ text: "Send <code>/snapshot</code> followed by a token's contract address on Arc." }); return json(200, { ok: true }); }
  const last = lastScan.get("s" + chat) || 0;
  if (Date.now() - last < 8000) return json(200, { ok: true });
  lastScan.set("s" + chat, Date.now());
  let r = null;
  for (let i = 0; i < 3 && (!r || r.pending); i++) {
    try { r = await (await fetch(`${SITE}/api/social?snapapi=${addr}`)).json(); } catch { r = null; }
  }
  if (!r || r.pending || !Array.isArray(r.holders)) { await say({ text: r && r.error ? h(r.error) : "Couldn't build the snapshot right now — open it on the site instead.", reply_markup: { inline_keyboard: [[{ text: "Open Snapshot", url: `${SITE}/arc#snapshot?t=${addr}` }]] } }); return json(200, { ok: true }); }
  const fmt = (v) => { const n = Number(v); return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };
  const top = r.holders.slice(0, 5).map((x) => `${x.rank}. <code>${x.address.slice(0, 6)}…${x.address.slice(-4)}</code>  ${fmt(x.balance)}  (${x.percent.toFixed(2)}%)`).join("\n");
  const top10 = r.holders.slice(0, 10).reduce((s, x) => s + x.percent, 0);
  await say({
    text: [`<b>Holder Snapshot</b>  ·  block #${r.block}`, `<b>${r.count.toLocaleString("en-US")}</b> holders (pools, contracts and burns left out) · top 10 hold <b>${top10.toFixed(1)}%</b>`, top, `Fingerprint <code>${r.fingerprint.slice(0, 18)}…</code>`].join("\n\n"),
    reply_markup: { inline_keyboard: [[{ text: "Full list + CSV", url: `${SITE}/arc#snapshot?t=${addr}&b=${r.block}` }]] },
  });
  return json(200, { ok: true });
}

// "/watch 0x…" · "/unwatch 0x…" · "/watching": the list lives in the store,
// which only the Node function (/api/social) can reach, so it's forwarded
// there with the webhook secret. A GitHub Actions job (tools/scan-watch.workflow.yml) checks the
// list every 15 minutes and the alerts come back through this bot.
async function onWatch(msg, chat, cmd, addr, bot) {
  const say = (text) => fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, parse_mode: "HTML", text, reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } }),
  }).catch(() => null);
  if (cmd !== "watching" && !isAddr(addr)) { await say(`Send <code>/${cmd}</code> followed by a token address on Arc.`); return json(200, { ok: true }); }
  let r = null;
  try {
    r = await (await fetch(`${SITE}/api/social`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "tgwatch", key: process.env.TG_WEBHOOK_SECRET, chat: String(chat), token: cmd === "watching" ? "0x0000000000000000000000000000000000000000" : addr, op: cmd === "watching" ? "list" : cmd }) })).json();
  } catch { r = null; }
  if (!r || !r.ok) { await say(r && r.error ? h(r.error) : "Couldn't update the watch list right now — try again in a minute."); return json(200, { ok: true }); }
  const list = (r.mine || []).map((t) => `<code>${t}</code>`).join("\n");
  await say(cmd === "watch" ? `Watching <code>${h(addr)}</code>. You'll hear here if its owner, supply or liquidity changes (checked every 15 minutes).`
    : cmd === "unwatch" ? `Stopped watching <code>${h(addr)}</code>.` : list ? `Watching:\n${list}` : "Nothing watched yet — send <code>/watch 0x…</code>.");
  return json(200, { ok: true });
}

export default async function handler(req) {
  const bot = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID, testKey = process.env.TG_TEST_KEY;
  const hook = process.env.TG_WEBHOOK_SECRET;
  const sig = req.headers.get("x-telegram-bot-api-secret-token");
  if (sig != null) {
    // only Telegram knows the secret; a wrong or missing one is ignored quietly
    if (!bot || !hook || sig !== hook) return json(200, { ok: false });
    return onUpdate(req, bot);
  }
  if (!bot || !chat) return json(200, { ok: false, enabled: false });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });
  let body = {};
  try { body = (await req.json()) || {}; } catch { /* bad body */ }
  const token = String(body.token || "");
  const test = !!(testKey && body.key && String(body.key) === testKey);
  if (!isAddr(token)) return json(400, { ok: false, error: "token must be an address" });
  const key = token.toLowerCase();
  if (sent.has(key) && !test) return json(200, { ok: true, duplicate: true });
  const coin = await getCoin(token).catch(() => null);
  if (!coin) return json(404, { ok: false, error: "not an ArcPad launch" });
  const age = Date.now() / 1000 - coin.launchedAt;
  if (!test && !(age >= -60 && age <= 15 * 60)) return json(200, { ok: false, error: "only launches from the last 15 minutes are announced" });
  sent.add(key);
  const post = buildPost(coin);
  const tg = (method, payload) => fetch(`https://api.telegram.org/bot${bot}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, parse_mode: "HTML", ...payload }),
  }).then((r) => r.json().catch(() => ({ ok: false }))).catch(() => ({ ok: false }));
  // Card with the generated image; if Telegram can't fetch the image, the same
  // text as a message with a large link preview of the coin's share page.
  let res = await tg("sendPhoto", { photo: post.photo, caption: post.caption, reply_markup: post.reply_markup });
  if (!res.ok) {
    res = await tg("sendMessage", {
      text: post.caption, reply_markup: post.reply_markup,
      link_preview_options: { url: post.link, prefer_large_media: true, show_above_text: true },
    });
  }
  if (!res.ok) { sent.delete(key); return json(502, { ok: false, error: "telegram rejected the message", detail: res.description || null }); }
  return json(200, { ok: true, test });
}
