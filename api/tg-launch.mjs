// api/tg-launch.mjs — posts a new ArcPad launch to a Telegram channel.
// Off unless both env vars are set in Vercel (Project → Settings → Environment
// Variables):  TG_BOT_TOKEN (from @BotFather) and TG_CHAT_ID (e.g. @yourchannel
// or a numeric chat id; the bot must be an admin there).
// The launch page calls POST /api/tg-launch {"token":"0x…"} after a launch
// confirms. The token is checked on-chain (must be an ArcPad launch from the
// last 15 minutes) and announced once per server instance, so the endpoint
// can't be used to post arbitrary text or old coins.
import { getCoin, isAddr, fmtUsd, SITE } from "./_arc.mjs";

export const config = { runtime: "edge" };
const sent = new Set();
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async function handler(req) {
  const bot = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID;
  if (!bot || !chat) return json(200, { ok: false, enabled: false });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });
  let token = "";
  try { token = String((await req.json()).token || ""); } catch { /* bad body */ }
  if (!isAddr(token)) return json(400, { ok: false, error: "token must be an address" });
  const key = token.toLowerCase();
  if (sent.has(key)) return json(200, { ok: true, duplicate: true });
  const coin = await getCoin(token).catch(() => null);
  if (!coin) return json(404, { ok: false, error: "not an ArcPad launch" });
  const age = Date.now() / 1000 - coin.launchedAt;
  if (!(age >= -60 && age <= 15 * 60)) return json(200, { ok: false, error: "only launches from the last 15 minutes are announced" });
  sent.add(key);
  const link = `${SITE}/c/${coin.token}`;
  const text = [
    `New on ArcPad: $${coin.symbol}${coin.name ? ` — ${coin.name}` : ""}`,
    `Live in a Uniswap v4 pool on Circle's Arc${coin.quoteSymbol ? `, paired with ${coin.quoteSymbol}` : ""}.`,
    coin.mcapUsd != null ? `Market cap ${fmtUsd(coin.mcapUsd)}` : "",
    `CA: ${coin.token}`,
    link,
  ].filter(Boolean).join("\n");
  const r = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: false }),
  }).catch(() => null);
  if (!r || !r.ok) { sent.delete(key); return json(502, { ok: false, error: "telegram rejected the message" }); }
  return json(200, { ok: true });
}
