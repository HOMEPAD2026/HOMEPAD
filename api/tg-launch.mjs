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
// The launch page calls POST /api/tg-launch {"token":"0x…"} after a launch
// confirms. The token is checked on-chain (must be an ArcPad launch from the
// last 15 minutes) and announced once per server instance, so the endpoint
// can't be used to post arbitrary text or old coins.
import { getCoin, isAddr, fmtUsd, SITE } from "./_arc.mjs";

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

export default async function handler(req) {
  const bot = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID, testKey = process.env.TG_TEST_KEY;
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
