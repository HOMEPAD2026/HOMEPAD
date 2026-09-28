// api/_tg.mjs — the Telegram launch channel for coins launched on Argus through ArcPad.
// Same bot and channel as ArcPad's own launches (api/tg-launch.mjs): TG_BOT_TOKEN and
// TG_CHAT_ID in Vercel. Off (quietly) when either is missing.
import { fmtUsd, SITE } from "./_arc.mjs";

const EXPLORER = "https://arc.etherscan.io";
const h = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/// the card for an Argus launch listed through ArcPad (an item from api/_argus-arcpad.mjs)
export function argusPost(c) {
  const sym = c.symbol || "COIN";
  const page = `${SITE}/arc#explore?plat=argus&coin=${c.token}`;
  const trade = `https://argus.world/token/${c.token}`;
  const desc = String(c.description || "").replace(/\s+/g, " ").trim();
  const title = `<b>$${h(sym)}</b>${c.name && c.name !== sym ? `  —  ${h(c.name)}` : ""}`
    + (desc ? `\n<blockquote>${h(desc.length > 220 ? desc.slice(0, 219) + "…" : desc)}</blockquote>` : "");
  const stats = [
    `▸ Market cap   <b>${h(fmtUsd(c.mcapUsd))}</b>`,
    `▸ Pair   <b>USDC</b>`,
    `▸ Creator fees   <b>70% creator · 30% ARCIRCLE PAD</b>`,
    `▸ Creator   <a href="${EXPLORER}/address/${c.creator}">${short(c.creator)}</a>`,
  ].join("\n");
  const caption = [
    `<b>NEW LAUNCH</b>  ·  Argus via ArcPad 💚`,
    title,
    stats,
    `<b>CA</b>  <i>(tap to copy)</i>\n<code>${c.token}</code>`,
    `<i>Launched on Argus through ArcPad: a Uniswap v4 pool on Circle's Arc. Dexscreener info support from a $20K market cap, marketing support from $100K.</i>`,
  ].join("\n\n");
  const shareText = `$${sym} just launched on Argus through ArcPad, on Circle's Arc 💚`;
  const reply_markup = {
    inline_keyboard: [
      [{ text: `Trade $${sym} on Argus`, url: trade }],
      [
        { text: "See it on ArcPad", url: page },
        { text: "ArcScan", url: `${EXPLORER}/token/${c.token}` },
      ],
      [
        { text: "Share on X", url: `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(page)}&via=ARCIRCLEonArc` },
        { text: "Community chat", url: "https://t.me/ARCIRCLEonarc" },
      ],
    ],
  };
  return { caption, reply_markup, photo: `${SITE}/api/og?addr=${c.token}&kind=launch&t=${c.launchedAt || 0}`, link: page };
}

/// post it: the generated card image, or the same text with a link preview if Telegram can't fetch the image
export async function announceArgus(c) {
  const bot = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID;
  if (!bot || !chat) return { ok: false, error: "telegram is off (TG_BOT_TOKEN / TG_CHAT_ID)" };
  const post = argusPost(c);
  const tg = (method, payload) => fetch(`https://api.telegram.org/bot${bot}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, parse_mode: "HTML", ...payload }),
    signal: AbortSignal.timeout(12000),
  }).then((r) => r.json().catch(() => ({ ok: false }))).catch(() => ({ ok: false }));
  let res = await tg("sendPhoto", { photo: post.photo, caption: post.caption, reply_markup: post.reply_markup });
  if (!res.ok) res = await tg("sendMessage", { text: post.caption, reply_markup: post.reply_markup, link_preview_options: { url: post.link, prefer_large_media: true, show_above_text: true } });
  return res.ok ? { ok: true } : { ok: false, error: "telegram rejected the message" + (res.description ? ": " + res.description : "") };
}
