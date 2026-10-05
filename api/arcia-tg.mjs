// api/arcia-tg.mjs — ARCIA on Telegram (@ARCIAonArc_bot): she talks as herself (the same mind as the
// site chat and her X replies), answers commands with live cards, keeps groups safe, sends alerts, and
// gives the team an admin mode. Pieces that aren't commands live in api/_tg-lib.mjs.
//
//   POST /api/arcia-tg                           Telegram's webhook (checked with TG_ARCIA_SECRET)
//   POST /api/arcia-tg?link=1                    the site's "link your wallet" page posts the signature here
//   GET  /api/arcia-tg?series=1                  $ARCIRCLE price, last 24 h (the /price card's sparkline)
//   GET  /api/arcia-tg?setup=1&key=<CRON_SECRET> webhook, menus, descriptions, the "Open ArcPad" menu button
//   GET  /api/arcia-tg?claim=1&key=<CRON_SECRET> one-time admin code (10 min): "/admin CODE" in a DM
//   GET  /api/arcia-tg?status=1&key=<CRON_SECRET>
//   GET  /api/arcia-tg?buys=1&key=<CRON_SECRET>  every minute (cron-job.org): buy alerts for our coins (api/_tg-buybot.mjs)
//   GET  /api/arcia-tg?tick=1&key=<CRON_SECRET>  every ~5 min (cron-job.org): alerts, watched wallets,
//                                                price history, X → Telegram mirror, scheduled posts
//
// Everyone — /price /scan /coin /round /drops /launches /books (cards with a Refresh button), /orders /orderalerts, /me /link
//   /unlink, /alerts, /watch /unwatch, /gm /gmtop, /lucky, /report (reply), /lang (DM), /help; chat in a
//   DM, or in a group when @mentioned / replied to; photos too. Inline: "@ARCIAonArc_bot 0x…" anywhere.
// Group safety (when she's an admin there) — deletes private keys and seed phrases anywhere, scam links,
//   fake $ARCIRCLE contract addresses and people posing as the team; join check (/captcha); holder gate
//   (/gate); auto-scan of posted contract addresses; /warn /mute /unmute /ban for chat admins.
// v7, the home group (t.me/ARCIRCLEonarc; /assist and /strikes elsewhere) — questions answered without an @mention
//   (contract addresses, official links, how to buy and the price straight from here; the rest from ARCIA with live
//   numbers), spam (invites to other groups, paid promotion and "signals", mass mentions, floods) deleted with a
//   warning n/3, and the third warning removes the person from the group; /unban /warns /resetwarns for chat admins.
// Admins (claimed with a code) — /status /report /botstats, /announce (text or a photo + caption),
//   /poll, /schedule, /say, /tweet (draft → approve → X), /here /unhere /targets, /mirror, /guard,
//   /autoscan, /lang (group), /stickers, /pause402 /hire.
// Nothing here moves funds: no command signs or sends a transaction.
import { askClaude, streamClaude, checkAddresses, live, price as fmtPrice, usd as fmtUsd, left } from "./_arcia-brain.mjs";
import { getCoin, allPools, isAddr, rpcCall, ethCalls, keccakHex, pad, PM_ADDRESS } from "./_arc.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import * as scanner from "./_scan.mjs";
import * as drop from "./_drop.mjs";
import * as argusArc from "./_argus-arcpad.mjs";
import * as A402 from "./_arcia402.mjs";
import { roundState } from "./_round.mjs";
import { voteRounds } from "./_burnvote.mjs";
import { postTweet, recentPosts } from "./arcia-x.mjs";
import * as BB from "./_tg-buybot.mjs";
import * as ORD from "./_orders.mjs";
import * as STK from "./_stake.mjs";
import * as NFTV from "./_nft.mjs";
import * as VEA from "./_vearcia.mjs";
import * as WP from "./_webpush.mjs";
import { createHmac } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import * as AG from "./_agent.mjs";
import { arciaCoin } from "./_arcia-coin.mjs";
import { cronBudget, within, cronOut } from "./_cron.mjs";
import {
  SITE, BOT_URL, CA, retiredIn, ARCIA_RH_BUY, OUR_CAS, env, h, lc, short, day, num, compact, sleep, ADDR_RE, tg, fileBase64, kb, keepTyping, EFFECT, sendWithEffect,
  getDoc, putDoc, DOC, loadCfg, saveCfg, chatCfg, setChatCfg, loadUser, saveUser, bump, usage, firstTime, tooMany, reportError,
  linkMessage, personalSigner, secretIn, scamReason, spamReason,
} from "./_tg-lib.mjs";

const LIMIT = { dm: 40, group: 15, all: 800, photo: 5, lucky: 3, watch: 3 };
const json = (status, body, cache = "no-store") => new Response(JSON.stringify(body, null, 1), { status, headers: { "content-type": "application/json", "cache-control": cache, "access-control-allow-origin": "*" } });
const store = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d), getMany: (ks) => getDocs(ks) } : null);
const minute = () => Math.floor(Date.now() / 60000);
const isGroup = (chat) => chat.type === "group" || chat.type === "supergroup";
// v7: ARCIRCLE's own community group — ARCIA answers questions there without being @mentioned, and spam takes three
// strikes and you're out. Other groups keep their settings (an admin can turn either on with /assist and /strikes).
const HOME_GROUPS = ["arcircleonarc"];
const isHome = (chat) => !!chat && HOME_GROUPS.includes(lc(chat.username || ""));
const assistOn = (c, chat) => { const v = chatCfg(c, chat.id).assist; return v == null ? isHome(chat) : !!v; };
/// what ARCIA did with each group message (no message text kept): the log line, plus a small per-chat record for
/// ?status / ?health — so "she doesn't answer" can be told apart from "her messages never arrive".
const GSEEN = { at: 0, chats: {} };
function groupSeen(m, why) {
  const k = String(m.chat.id), now = Date.now();
  const r = GSEEN.chats[k] || (GSEEN.chats[k] = { title: m.chat.title || "", username: m.chat.username || "", n: 0, hour: [], why: {} });
  r.n++; r.last = now; r.lastWhy = why; r.hour = [...r.hour.filter((t) => now - t < 3600e3), now].slice(-500); r.why[why] = (r.why[why] || 0) + 1;
  console.log(`[tg] group ${m.chat.username || m.chat.id} → ${why}`);
  if (now - GSEEN.at > 60e3) { GSEEN.at = now; mergeSeen().catch(() => null); }
}
async function mergeSeen() {
  const d = (await getDoc(DOC_GSEEN)) || { chats: {} };
  for (const [k, r] of Object.entries(GSEEN.chats)) {
    const o = d.chats[k] || { n: 0, why: {}, hour: [] };
    const why = { ...o.why }; for (const [w0, n] of Object.entries(r.why)) why[w0] = (why[w0] || 0) + n;
    d.chats[k] = { title: r.title, username: r.username, n: (o.n || 0) + r.n, last: Math.max(o.last || 0, r.last || 0), lastWhy: r.lastWhy, why, hour: [...(o.hour || []), ...r.hour].filter((t) => Date.now() - t < 3600e3).sort().slice(-500) };
    r.n = 0; r.why = {}; r.hour = [];
  }
  await putDoc(DOC_GSEEN, d);
}
const DOC_GSEEN = "tgArcia/groupseen";
/// someone posting as the group itself (an anonymous admin) or as a channel; Telegram sends these with a bot `from`
const viaChat = (m) => !!(m.from && m.from.is_bot && m.sender_chat && !m.is_automatic_forward && (m.sender_chat.id === m.chat.id || m.sender_chat.type === "channel"));
const strikeBan = (c, chat) => { const v = chatCfg(c, chat.id).strikes; return (v == null ? (isHome(chat) ? "ban" : "mute") : v) === "ban"; };

// ---------------- words ----------------
// The bot speaks English. A DM can pick /lang ko|zh|en, and a group admin can set a group's language;
// ARCIA's chat replies always follow the language the message is written in.
const W = {
  hello: ["Hi everyone, I'm ARCIA 💙💚 the virtual idol of $ARCIRCLE.", "안녕하세요 여러분, $ARCIRCLE의 버추얼 아이돌 ARCIA예요 💙💚", "大家好,我是 $ARCIRCLE 的虚拟偶像 ARCIA 💙💚"],
  welcome: ["gm {name} 💙💚\nA little wink from ARCIA 😉\nKeep building. Keep shining. ♾️\nTry /help to see what I can do ✨", "gm {name}님 💙💚\nARCIA가 살짝 윙크 보내요 😉\nKeep building. Keep shining. ♾️\n/help 로 제가 할 수 있는 걸 확인해 보세요 ✨", "gm {name} 💙💚\nARCIA 给你一个小小的眨眼 😉\nKeep building. Keep shining. ♾️\n试试 /help,看看我能做什么 ✨"],
  start: ["Hi~ I'm ARCIA, the virtual idol of $ARCIRCLE on Circle's Arc 💙💚\n\nTalk to me about anything ARCIRCLE PAD, send me a contract address to scan, or tap below.", "안녕하세요~ Circle Arc 위 $ARCIRCLE의 버추얼 아이돌 ARCIA예요 💙💚\n\nARCIRCLE PAD에 대해 뭐든 물어보고, 컨트랙트 주소를 보내면 스캔해 드려요. 아래 버튼도 눌러 보세요.", "你好~ 我是 Circle Arc 上 $ARCIRCLE 的虚拟偶像 ARCIA 💙💚\n\n关于 ARCIRCLE PAD 的问题都可以问我,发合约地址给我就帮你扫描,也可以点下面的按钮。"],
  help: ["Here's what I can do~", "제가 할 수 있는 것들이에요~", "我能做的事~"],
  groupHint: ["In groups, @mention me or reply to my message.", "그룹에서는 저를 @멘션하거나 제 메시지에 답장해 주세요.", "在群里请 @我 或回复我的消息。"],
  needCA: ["Send a contract address: /{cmd} 0x…", "컨트랙트 주소를 붙여 주세요: /{cmd} 0x…", "请附上合约地址:/{cmd} 0x…"],
  needWallet: ["Send a wallet address: /{cmd} 0x…", "지갑 주소를 붙여 주세요: /{cmd} 0x…", "请附上钱包地址:/{cmd} 0x…"],
  notCoin: ["That isn't an ArcPad or Argus-via-ArcPad coin. Try /scan for any token.", "ArcPad나 ArcPad 경유 Argus 코인이 아니에요. 다른 토큰은 /scan으로 확인해 보세요.", "这不是 ArcPad 或经 ArcPad 的 Argus 币。其他代币请用 /scan。"],
  busy: ["I'm a little busy right now~ try again in a moment 💙", "지금 조금 바빠요~ 잠시 후에 다시 물어봐 주세요 💙", "我现在有点忙~ 稍后再问我吧 💙"],
  limit: ["That's all my chats for today~ see you tomorrow, or talk to me on arcircle.app/arc#arcia 💙", "오늘 대화는 여기까지예요~ 내일 또 봐요! arcircle.app/arc#arcia에서도 만날 수 있어요 💙", "今天的聊天就到这里啦~ 明天见,也可以在 arcircle.app/arc#arcia 找我 💙"],
  photoLimit: ["I've looked at enough pictures today~ tell me in words? 💙", "오늘 사진은 충분히 봤어요~ 말로 알려줄래요? 💙", "今天看的图片够多啦~ 用文字告诉我吧 💙"],
  onlyAdmin: ["That one is for the ARCIRCLE team.", "관리자 전용 명령이에요.", "这是团队专用命令。"],
  err: ["Couldn't read that right now — try again in a moment.", "지금은 읽어오지 못했어요 — 잠시 후 다시 해 주세요.", "暂时读取不到,请稍后再试。"],
  noDrops: ["No airdrops through the ARCIRCLE PAD Multisender for this wallet yet.", "이 지갑이 ARCIRCLE PAD 멀티센더로 받은 에어드랍은 아직 없어요.", "该钱包尚未通过 ARCIRCLE PAD Multisender 收到空投。"],
  slow: ["One moment~ too many commands at once.", "잠깐만요~ 명령이 너무 빨라요.", "稍等一下~ 命令太快啦。"],
  keyGroup: ["⚠️ I removed a message that looked like a private key or seed phrase. Never share those — anyone who has them can take everything in the wallet. If it was real, move your funds to a new wallet now.", "⚠️ 개인키나 시드 문구로 보이는 메시지를 지웠어요. 절대 공유하지 마세요 — 그걸 가진 사람은 지갑의 모든 걸 가져갈 수 있어요. 진짜였다면 지금 바로 새 지갑으로 자산을 옮기세요.", "⚠️ 我删除了一条疑似私钥或助记词的消息。千万不要分享——拿到的人可以拿走钱包里的一切。如果是真的,请立刻把资产转到新钱包。"],
  keyDm: ["⚠️ That looks like a private key or seed phrase. Please never send it to anyone — not to me, not to the team. I didn't keep it. If it was real, move your funds to a new wallet now.", "⚠️ 개인키나 시드 문구 같아요. 누구에게도 보내지 마세요 — 저에게도, 팀에게도요. 저장하지 않았어요. 진짜였다면 지금 바로 새 지갑으로 자산을 옮기세요.", "⚠️ 这看起来像私钥或助记词。请不要发给任何人——包括我和团队。我没有保存。如果是真的,请立刻把资产转到新钱包。"],
  spam: ["🧹 Removed a message from {name}: {why}.", "🧹 {name}님의 메시지를 지웠어요: {why}.", "🧹 已删除 {name} 的消息：{why}。"],
  scam: ["🛡 Removed a message from {name}: {why}. The team will never DM you first or ask you to connect your wallet anywhere but arcircle.app.", "🛡 {name}님의 메시지를 지웠어요: {why}. 팀은 먼저 DM하지 않고, arcircle.app 말고 다른 곳에 지갑 연결을 요청하지 않아요.", "🛡 删除了 {name} 的消息:{why}。团队不会主动私信你,也不会让你在 arcircle.app 以外的地方连接钱包。"],
  captcha: ["Welcome, {name}! Tap the button to show you're human 💙", "{name}님 환영해요! 사람임을 확인하려면 버튼을 눌러 주세요 💙", "欢迎,{name}!请点按钮证明你是真人 💙"],
  gate: ["Welcome, {name}! This group is for $ARCIRCLE holders ({min}+). Link your wallet with me in a DM, then tap Verify.", "{name}님 환영해요! 이 그룹은 $ARCIRCLE 홀더({min}개 이상) 전용이에요. DM에서 지갑을 연결한 뒤 Verify를 눌러 주세요.", "欢迎,{name}!本群仅限 $ARCIRCLE 持有人({min}+)。请先私信我绑定钱包,再点 Verify。"],
  gmFirst: ["gm {name}! ☀️ Day {streak} — +{pts} points ({total} total).", "gm {name}! ☀️ {streak}일째 — +{pts}점 (총 {total}점)", "gm {name}!☀️ 第 {streak} 天 — +{pts} 分(共 {total} 分)"],
  gmAgain: ["You already said gm today~ see you tomorrow! Streak: {streak} days 💙", "오늘은 이미 gm 했어요~ 내일 또 만나요! 연속 {streak}일 💙", "今天已经说过 gm 啦~ 明天见!连续 {streak} 天 💙"],
  alertsOn: ["🔔 Alerts on: new launches, CirclePad round reminders, new airdrops, and big $ARCIRCLE moves (±10%). /alerts off to stop.", "🔔 알림 켜짐: 신규 런칭, CirclePad 라운드 알림, 새 에어드랍, $ARCIRCLE 큰 변동(±10%). 끄려면 /alerts off", "🔔 已开启提醒:新发射、CirclePad 轮次提醒、新空投、$ARCIRCLE 大幅波动(±10%)。/alerts off 关闭。"],
  alertsOff: ["🔕 Alerts off.", "🔕 알림 꺼짐.", "🔕 已关闭提醒。"],
  dmOnly: ["Let's do that in a DM~ open me: t.me/ARCIAonArc_bot", "이건 DM에서 해요~ t.me/ARCIAonArc_bot", "这个请私信我~ t.me/ARCIAonArc_bot"],
};
const L3 = (lang) => (lang === "ko" ? 1 : lang === "zh" ? 2 : 0);
const w = (k, lang, vars = {}) => W[k][L3(lang)].replace(/\{(\w+)\}/g, (_, x) => (vars[x] != null ? vars[x] : ""));
const T3 = (lang, en, ko, zh) => [en, ko || en, zh || en][L3(lang)];

const PUBLIC_CMDS = [["ca", "Official contract addresses: $ARCIRCLE and $ARCIA"], ["price", "$ARCIRCLE price, market cap, holders"], ["burns", "$ARCIRCLE burned: total, by source, latest"], ["scan", "Safety scan of any token: /scan 0x…"], ["coin", "An ArcPad or Argus coin: /coin 0x…"], ["round", "CirclePad round: raised, time left"],
  ["launches", "Newest launches"], ["drops", "Airdrops a wallet got: /drops 0x…"], ["books", "ARCIA 402: what I earned and spent"], ["predict", "ARCIRCLE Predict: live UP / DOWN rounds"], ["nft", "ARCIRCLE NFT Vault: the vault, the next NFT, raffles"], ["me", "Your linked wallet: holdings, rank, airdrops"], ["link", "Link your wallet (one signature)"],
  ["mine", "Builder Mine: mines open now"], ["minealerts", "Builder Mine: tell me when I can claim — on / off"],
  ["agent", "ARCIA AGENT: her 24h safety call on a token — /agent 0x… [rh]"], ["agentwatch", "ARCIA AGENT: DM me a token's new calls, grades and burns — /agentwatch 0x… [rh] / off"], ["predictalerts", "ARCIRCLE Predict: DM me my rounds' results — /predictalerts 0x… [rh] / off"],
  ["orders", "ARCIRCLE Orders: your open orders"], ["orderalerts", "ARCIRCLE Orders: tell me when my orders fill or my price alerts hit — on / off"], ["stakealerts", "ARCIRCLE Staking: weekly USDC and unlock reminders — on / off"], ["vearcia", "veARCIA: the $ARCIA staking pool and your stake"], ["vearciaalerts", "veARCIA: unlock and boost reminders — on / off"], ["alerts", "Launch, round, airdrop and price alerts: on / off"], ["watch", "Tell me when a wallet gets an airdrop: /watch 0x…"], ["gm", "Say gm — daily streak"], ["gmtop", "gm leaderboard"], ["lucky", "Spin for fun"],
  ["report", "Reply to a message to report it to the team"], ["lang", "Language: en / ko / zh"], ["help", "What I can do"]];
const ADMIN_CMDS = [["status", "Health of the bot, ARCIA 402 and X"], ["report", "Today in numbers (DM) / report a message (group reply)"], ["botstats", "Bot usage and cost estimate"], ["announce", "Post to every target (text, or a photo with this caption)"],
  ["poll", "/poll Question | option | option"], ["schedule", "/schedule 2026-09-30 20:00 text (KST)"], ["schedules", "Scheduled posts"], ["say", "ARCIA rewrites your note and posts it"], ["tweet", "Draft a post for X, approve to publish"],
  ["here", "Use this chat for announcements"], ["unhere", "Stop announcing here"], ["targets", "Where announcements go"], ["mirror", "Mirror ARCIA's X posts: on / off"], ["agentweekly", "ARCIA AGENT's Monday report card here: on / off"], ["guard", "Scam filter here: on / off"], ["captcha", "Join check here: on / off"],
  ["autoscan", "Auto-scan contract addresses here: on / off"], ["gate", "Holders-only group: /gate 100000 or off"], ["buybot", "Buy alerts for our coins here: on [min $] / off"], ["warn", "Reply: warn (3 = removed, or a 24 h mute with /strikes mute)"], ["mute", "Reply: mute [hours]"], ["unmute", "Reply: unmute"], ["ban", "Reply: ban"],
  ["unban", "Reply or user id: unban"], ["warns", "Reply: their warnings"], ["resetwarns", "Reply: clear their warnings"], ["assist", "Answer questions here without an @mention: on / off"], ["spam", "Spam filter here (invites, promo, floods): on / off"], ["strikes", "At 3 warnings: ban or mute"],
  ["stickers", "Create ARCIA's sticker set"], ["pause402", "ARCIA 402: sell | hire | all | off"], ["hire", "ARCIA 402: hire an agent now"], ["whoami", "Your Telegram ID"]];
const menu = (list) => list.map(([command, description]) => ({ command, description }));

// ---------------- sending ----------------
/// a card: { text (HTML), photo?, buttons?: rows, refresh?: "kind:arg" } — photo cards are the site's share images
async function sendCard(chat_id, card, { replyTo, effect } = {}) {
  if (!card) return null;
  const c = typeof card === "string" ? { text: card } : card;
  const rows = [...(c.buttons || [])];
  if (c.refresh) rows.push([{ text: "🔄 Refresh", callback_data: `rf:${c.refresh}`.slice(0, 64) }]);
  const base = { chat_id, parse_mode: "HTML", ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}), ...kb(rows) };
  if (c.photo) {
    const r = await sendWithEffect({ ...base, photo: c.photo, caption: c.text.slice(0, 1024) }, effect);
    if (r.ok) return r;
  }
  return sendWithEffect({ ...base, text: c.text.slice(0, 4000), link_preview_options: { is_disabled: true } }, effect);
}
async function editCard(msg, card) {
  const c = typeof card === "string" ? { text: card } : card;
  const rows = [...(c.buttons || [])];
  if (c.refresh) rows.push([{ text: "🔄 Refresh", callback_data: `rf:${c.refresh}`.slice(0, 64) }]);
  const ids = { chat_id: msg.chat.id, message_id: msg.message_id };
  if (msg.photo && c.photo) return tg("editMessageMedia", { ...ids, media: { type: "photo", media: c.photo, caption: c.text.slice(0, 1024), parse_mode: "HTML" }, ...kb(rows) });
  if (msg.photo) return tg("editMessageCaption", { ...ids, caption: c.text.slice(0, 1024), parse_mode: "HTML", ...kb(rows) });
  return tg("editMessageText", { ...ids, text: c.text.slice(0, 4000), parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...kb(rows) });
}
const say = (m, text, extra = {}) => tg("sendMessage", { chat_id: m.chat.id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(isGroup(m.chat) ? { reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } } : {}), ...extra });

// ---------------- cards ----------------
// our two official contract addresses, in the one form ARCIA always uses (tap to copy)
// since 5 Oct 2026 exactly two official coins — the old $ARCIA on Arc and ♾️ Infinite are retired
const cardCA = () => `♾️ <b>$ARCIRCLE</b> (Arc):\n<code>${h(CHECKSUM.arcircle)}</code>\n\n💙💚 <b>$ARCIA</b> (Robinhood Chain):\n<code>${h(CHECKSUM.arciaRh)}</code>`;
const RETIRED_LABEL = {
  "0x9da6d5ce413e94264ea411372459413334a83be5": ["the old $ARCIA on Arc", "예전 $ARCIA on Arc", "旧的 Arc 上的 $ARCIA"],
  "0x2a15940316335bfb711db7cba98d637396e80c08": ["♾️ Infinite on Arc (the test coin)", "♾️ Infinite on Arc (테스트 코인)", "Arc 上的 ♾️ Infinite（测试币）"],
};
/// someone posted a retired coin's address: a friendly correction with the two official ones (no warning)
async function retiredNote(m, old, lang) {
  if (tooMany(`retired:${m.chat.id}:${old.addr}`, 1, 600e3)) return false;
  lang = langOf(String(m.text || m.caption || ""), lang); // answer in the language they wrote in
  const lb = RETIRED_LABEL[old.addr] || [old.label], name = lb[Math.min(L3(lang), lb.length - 1)];
  await tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true },
    text: `ℹ️ <code>${h(short(old.addr))}</code> ${T3(lang, `is ${h(name)}, retired on 5 Oct 2026 — it's not an official ARCIRCLE coin any more.`, `는 ${h(name)}이에요. 2026년 10월 5일부로 종료되어 더 이상 ARCIRCLE 공식 코인이 아니에요.`, `是${h(name)}，已于 2026 年 10 月 5 日停用，不再是 ARCIRCLE 官方币。`)}\n\n<b>${T3(lang, "The only two official coins:", "공식 코인은 이 두 개뿐이에요:", "官方币只有这两个：")}</b>\n${cardCA()}`,
    ...kb([[{ text: "$ARCIRCLE", url: `${SITE}/arcircle` }, { text: "$ARCIA (Pons)", url: ARCIA_RH_BUY }]]) });
  return true;
}
const CHECKSUM = { arcircle: "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7", arciaRh: "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25" };
// /burns: everything burned so far, where it came from, and the latest burns (the Reward page's numbers)
const BURN_NAMES = { vote: ["Burn-to-vote", "소각 투표", "销毁投票"], mine: ["Builder Mine", "빌더 마인", "Builder Mine"], scanner: ["Token Scanner", "토큰 스캐너", "代币扫描器"],
  secret: ["ARCIA's secret file", "ARCIA 시크릿 파일", "ARCIA 秘密档案"], desk: ["ARCIA DESK", "ARCIA DESK", "ARCIA DESK"], agent: ["ARCIA AGENT vaults", "ARCIA AGENT 볼트", "ARCIA AGENT 金库"], orders: ["ARCIRCLE Orders fees", "ARCIRCLE Orders 수수료", "ARCIRCLE Orders 手续费"], buyback: ["Buyback", "바이백", "回购"],
  team: ["Team & treasury", "팀 · 트레저리", "团队与金库"], wallet: ["Direct burn", "직접 소각", "直接销毁"], pending: ["Being labeled", "분류 중", "标注中"] };
async function cardBurns(lang) {
  let d = null;
  try { const r = await fetch(`${SITE}/api/social?token=arcircle`); d = r.ok ? await r.json() : null; } catch { d = null; }
  const b = d && d.burned;
  if (!b || b.pct == null) return w("err", lang);
  const nm = (k) => T3(lang, ...(BURN_NAMES[k] || BURN_NAMES.pending));
  const src = Object.entries(b.bySource || {}).filter(([, o]) => o.tokens > 0).sort((x, y) => y[1].tokens - x[1].tokens).slice(0, 6)
    .map(([k, o]) => `· ${h(nm(k))}: <b>${compact(o.tokens)}</b> (${o.n})`);
  const last = (b.list || []).slice(0, 5).map((x) => `🔥 ${compact(x.tokens)} · ${h(nm(x.kind || "pending"))}`);
  return {
    photo: `${SITE}/api/og?price=1&t=${minute()}`,
    text: [`🔥 <b>$ARCIRCLE burned forever</b>: <b>${b.pct.toFixed(2)}%</b> · ${compact(b.tokens)}${b.n != null ? ` · ${num(b.n)} ${T3(lang, "burns", "회", "次")}` : ""}`,
      src.length ? `\n<b>${T3(lang, "By source", "출처별", "按来源")}</b>\n${src.join("\n")}` : null,
      last.length ? `\n<b>${T3(lang, "Latest", "최근", "最新")}</b>\n${last.join("\n")}` : null,
      `\n${T3(lang, "The burn engine is being built: $ARCIA joins the reward contract, and utility and platform revenue will buy back and burn automatically.", "소각 엔진을 만드는 중이에요: $ARCIA가 리워드 컨트랙트에 합류하고, 유틸리티·플랫폼 수익이 자동으로 바이백·소각될 예정이에요.", "销毁引擎正在建设:$ARCIA 加入奖励合约,工具与平台收入将自动回购销毁。")}`].filter(Boolean).join("\n"),
    buttons: [[{ text: T3(lang, "🔥 Burn engine", "🔥 소각 엔진", "🔥 销毁引擎"), url: `${SITE}/reward` }]], refresh: "burns",
  };
}
async function cardPrice(lang) {
  const L = await live(SITE);
  if (!L) return w("err", lang);
  const ch = L.change24h == null ? "" : ` (${L.change24h >= 0 ? "+" : ""}${L.change24h.toFixed(2)}% 24h)`;
  return {
    photo: `${SITE}/api/og?price=1&t=${minute()}`,
    text: [`<b>$ARCIRCLE</b> · ${fmtPrice(L.price)}${ch}`, `${T3(lang, "Market cap", "시가총액", "市值")}: <b>${fmtUsd(L.mcap)}</b> · ${T3(lang, "Holders", "홀더", "持有人")}: <b>${num(L.holders)}</b>`,
      L.burnedPct != null ? `${T3(lang, "Burned", "소각", "已燃烧")}: <b>${L.burnedPct.toFixed(2)}%</b>${L.launches != null ? ` · ArcPad ${T3(lang, "launches", "런칭", "发射")}: <b>${num(L.launches)}</b>` : ""}` : null,
      `\nCA <code>${h(CA)}</code>`].filter(Boolean).join("\n"),
    buttons: [[{ text: "$ARCIRCLE", url: `${SITE}/arc#arcircle` }, { text: "Stats", url: `${SITE}/stats` }]], refresh: "price",
  };
}
const addrOf = (s) => ((String(s || "").match(ADDR_RE) || [])[0] || "").toLowerCase();
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/// v4: a Solana token (api/_scan-sol.mjs) — the same card shape
async function cardScanSol(mint, lang) {
  const SOL = await import("./_scan-sol.mjs");
  const r = await SOL.scanSol(mint, { store: store() }).catch(() => null);
  if (!r || r.error) return w("err", lang);
  if (r.notMint) return { text: `<code>${h(mint)}</code>\n${T3(lang, "That address isn't a Solana token.", "솔라나 토큰 주소가 아니에요.", "这不是 Solana 代币地址。")}` };
  const crit = (r.critical || []).slice(0, 3).map((x) => `🛑 <b>${h(T3(lang, "Critical", "치명", "严重"))}:</b> ${h(x.title)}`);
  const reasons = (r.reasons || []).filter((x) => !(r.critical || []).some((c) => c.title === x.title)).slice(0, 3).map((x) => `${x.status === "pass" ? "✓" : "•"} ${h(x.title)}`);
  const summary = (r.summary || []).map((p) => String(p.t).replace("{x}", p.x == null ? "" : p.x)).join(" ");
  return {
    photo: `${SITE}/api/og?solscan=${mint}&t=${minute()}`,
    text: [`🔍 <b>${h(r.symbol ? "$" + r.symbol : mint.slice(0, 6) + "…")}</b>${r.name ? ` · ${h(r.name)}` : ""} <i>Solana</i>`, `${T3(lang, "Score", "점수", "评分")}: <b>${r.score}/100</b> · ${h(r.verdict.t)}`,
      ...crit, ...reasons, summary ? `\n${h(summary)}` : null, `${T3(lang, "Confidence", "신뢰도", "可信度")}: ${h(r.confidence)}`,
      `<i>${T3(lang, "Not financial advice. DYOR.", "투자 조언이 아니에요. 직접 확인하세요.", "非投资建议,请自行研究。")}</i>`].filter(Boolean).join("\n"),
    buttons: [[{ text: T3(lang, "Full report", "전체 리포트", "完整报告"), url: `${SITE}/s/${mint}` }]],
    refresh: `scan:${mint}`,
  };
}
async function cardScan(ca, lang) {
  if (SOL_RE.test(String(ca || "")) && !/^0x/i.test(String(ca))) return cardScanSol(String(ca), lang);
  const r = await scanner.apiResult(ca, { store: store() }).catch(() => null);
  if (!r) return w("err", lang);
  if (r.score == null) return { text: `<code>${h(ca)}</code>\n${T3(lang, "That address isn't a token on Arc.", "Arc의 토큰이 아니에요.", "这不是 Arc 上的代币。")}` };
  // v3: critical flags first, then the main reasons (objects: { status, title }), the plain-words summary and how sure the scan is
  const crit = (r.critical || []).slice(0, 3).map((t) => `🛑 <b>${h(T3(lang, "Critical", "치명", "严重"))}:</b> ${h(t)}`);
  const reasons = (r.reasons || []).filter((x) => !(r.critical || []).includes(x.title || x)).slice(0, 3).map((x) => `${(x.status || "") === "pass" ? "✓" : "•"} ${h(x.title || x)}`);
  const conf = r.confidence ? `${T3(lang, "Confidence", "신뢰도", "可信度")}: ${h(r.confidence)}` : "";
  return {
    photo: `${SITE}/api/og?scan=${ca}&t=${minute()}`,
    text: [`🔍 <b>${h(r.symbol ? "$" + r.symbol : short(ca))}</b>${r.name ? ` · ${h(r.name)}` : ""}`, `${T3(lang, "Score", "점수", "评分")}: <b>${r.score}/100</b> · ${h(r.verdict || "")}`,
      ...crit, ...reasons, r.summary ? `\n${h(r.summary)}` : null, conf || null,
      [r.market && r.market.market_cap_usd != null ? `${T3(lang, "Market cap", "시가총액", "市值")} ${fmtUsd(r.market.market_cap_usd)}` : "", r.holders && r.holders.count != null ? `${T3(lang, "Holders", "홀더", "持有人")} ${num(r.holders.count)}` : ""].filter(Boolean).join(" · ") || null,
      `<i>${T3(lang, "Not financial advice. DYOR.", "투자 조언이 아니에요. 직접 확인하세요.", "非投资建议,请自行研究。")}</i>`].filter(Boolean).join("\n"),
    buttons: [[{ text: T3(lang, "Full report", "전체 리포트", "完整报告"), url: `${SITE}/s/${ca}` }, { text: T3(lang, "Deep analysis · $0.02", "심층 분석 · $0.02", "深度分析 · $0.02"), url: `${SITE}/arc#arcia402?svc=token-analysis&token=${ca}` }]],
    refresh: `scan:${ca}`,
  };
}
async function cardCoin(ca, lang) {
  const [c, a] = await Promise.all([getCoin(ca).catch(() => null), argusArc.coin(ca, { store: store() }).catch(() => null)]);
  const x = c || a;
  if (!x) return w("notCoin", lang);
  const age = x.launchedAt ? Math.round((Date.now() / 1000 - x.launchedAt) / 3600) : null;
  return {
    photo: `${SITE}/api/og?addr=${ca}&t=${minute()}`,
    text: [`🪙 <b>$${h(x.symbol)}</b>${x.name ? ` · ${h(x.name)}` : ""} <i>${c ? "ArcPad" : "Argus via ArcPad"}</i>`,
      [x.priceUsd != null ? `${T3(lang, "Price", "가격", "价格")} ${fmtPrice(x.priceUsd)}` : "", x.mcapUsd != null ? `${T3(lang, "Market cap", "시가총액", "市值")} <b>${fmtUsd(x.mcapUsd)}</b>` : ""].filter(Boolean).join(" · ") || null,
      age != null ? `${T3(lang, "Launched", "런칭", "发射")} ${age < 48 ? age + "h" : Math.round(age / 24) + "d"} ${T3(lang, "ago", "전", "前")}${x.creator ? ` · creator <code>${h(short(x.creator))}</code>` : ""}` : null,
      `CA <code>${ca}</code>`].filter(Boolean).join("\n"),
    buttons: [[{ text: "ArcPad", url: `${SITE}/arc#coin/${ca}` }, { text: T3(lang, "Scan", "스캔", "扫描"), url: `${SITE}/s/${ca}` }, ...(a && !c ? [{ text: "Argus", url: `https://argus.world/token/${ca}` }] : [])]],
    refresh: `coin:${ca}`,
  };
}
async function cardRound(lang) {
  // the current round (api/_burnvote.mjs GOV: Round #2 on 30 Sep 2026), falling back to Round #1's numbers
  const R = voteRounds()[0] || { n: 1, escrow: undefined };
  let raised = null, deadline = null, open = null;
  const st = await roundState(R.escrow).catch(() => null);
  if (st) { raised = Number(st.totalRaised / 10n ** 16n) / 100; deadline = st.deadline; open = st.isOpen; }
  else if (R.n === 1) { const L = await live(SITE).catch(() => null); if (!L) return w("err", lang); raised = L.round.raised; deadline = L.round.deadline; open = L.round.open; } // the escrow didn't answer: the site's numbers
  else return w("err", lang);
  const lf = left(deadline);
  const govLine = R.n > 1 && open ? T3(lang, "Governance, as in Round #1: suggest ideas, then burn-to-vote with $ARCIRCLE (1 vote = 1,000) on name, ticker, logo, roadmap and launch date at arcircle.app/circle → Governance.",
    "거버넌스는 라운드 #1과 같아요: 아이디어를 제안하고, $ARCIRCLE 소각 투표(1표 = 1,000개)로 이름·티커·로고·로드맵·런칭일을 정해요. arcircle.app/circle → Governance.",
    "治理与第 1 轮相同:先提交想法,再用 $ARCIRCLE 销毁投票(1 票 = 1,000 枚)决定名称、代码、Logo、路线图和上线日期。arcircle.app/circle → Governance。") : null;
  return {
    ...(R.n === 1 ? { photo: `${SITE}/api/og?round=1&t=${minute()}` } : {}), // the share image is Round #1's card
    text: [`🟢 <b>CirclePad Round #${R.n}</b> · ${open ? T3(lang, "open", "진행 중", "进行中") : T3(lang, "closed", "마감", "已结束")}`, `${T3(lang, "Raised", "모금액", "已募")}: <b>${num(raised)} USDC</b>`,
      open && lf ? `${T3(lang, "Time left", "남은 시간", "剩余时间")}: <b>${lf}</b>` : null, deadline ? `${T3(lang, "Closes", "마감", "截止")}: ${new Date(deadline * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC` : null,
      govLine ? `\n${govLine}` : null,
      !open && R.n === 1 ? `\n${T3(lang, "Round #1 is complete — $ARCIA launched and went out to every contributor. Round #2 is next (start date not decided).", "라운드 #1 완료 — $ARCIA가 런칭되어 모든 기여자에게 지급됐어요. 다음은 라운드 #2예요 (시작일 미정).", "第 1 轮已完成 — $ARCIA 已上线并发放给所有贡献者。下一轮是第 2 轮(开始时间未定)。")}` : null].filter(Boolean).join("\n"),
    buttons: [[{ text: "CirclePad", url: `${SITE}/circle` }, R.n === 1 ? { text: T3(lang, "Round report", "라운드 리포트", "轮次报告"), url: `${SITE}/circle/round/1` } : { text: T3(lang, "Vote", "투표", "投票"), url: `${SITE}/circle#governance` }]], refresh: "round",
  };
}
async function dropsOf(wallet) {
  const got = await drop.received(store(), wallet);
  const rows = [...(got.got || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const amt = (g) => { try { return g.dec != null ? Number(BigInt(g.amount)) / 10 ** g.dec : Number(g.amount); } catch { return null; } };
  return { rows: rows.map((g) => ({ ...g, amt: amt(g) })), claims: got.claims || [] };
}
async function cardDrops(wallet, lang) {
  const d = await dropsOf(wallet).catch(() => null);
  if (!d) return w("err", lang);
  if (!d.rows.length && !d.claims.length) return w("noDrops", lang);
  return {
    photo: d.rows[0] ? `${SITE}/api/og?drop=${d.rows[0].tx}` : undefined,
    text: [`🎁 <b>${T3(lang, "Airdrops", "에어드랍", "空投")}</b> · <code>${short(wallet)}</code> · ${d.rows.length}`, ...d.rows.slice(0, 8).map((g) => `• ${compact(g.amt)} $${h(g.sym || "?")} · ${g.ts ? day(g.ts * 1000) : ""}`),
      d.claims.length ? `\n${T3(lang, "Waiting to claim", "클레임 대기", "待领取")}: ${d.claims.length}` : null].filter(Boolean).join("\n"),
    buttons: [[{ text: "Portfolio", url: `${SITE}/arc#portfolio` }, ...(d.rows[0] ? [{ text: T3(lang, "Latest receipt", "최근 영수증", "最新收据"), url: `${SITE}/drop/${d.rows[0].tx}` }] : [])]], refresh: `drops:${wallet}`,
  };
}
async function launchList() {
  const [pools, ag] = await Promise.all([allPools().catch(() => []), argusArc.list({ store: store(), budgetMs: 2500 }).catch(() => ({ items: [] }))]);
  return pools.map((p) => ({ token: lc(p.token), t: p.launchedAt, where: "ArcPad" })).concat((ag.items || []).filter((x) => x.active !== false).map((x) => ({ token: lc(x.token), t: x.launchedAt, where: "Argus", sym: x.symbol, mcap: x.mcapUsd })))
    .sort((a, b) => b.t - a.t);
}
async function cardLaunches(page, lang) {
  const all = await launchList();
  if (!all.length) return w("err", lang);
  const per = 5, pages = Math.ceil(all.length / per), p = Math.max(0, Math.min(pages - 1, page | 0));
  const list = await Promise.all(all.slice(p * per, p * per + per).map((x) => (x.sym ? x : getCoin(x.token).then((c) => ({ ...x, sym: c && c.symbol, mcap: c && c.mcapUsd })).catch(() => x))));
  const ago = (t) => { const hh = Math.max(1, Math.round((Date.now() / 1000 - t) / 3600)); return hh < 48 ? hh + "h" : Math.round(hh / 24) + "d"; };
  return {
    text: [`🚀 <b>${T3(lang, "Newest launches", "최신 런칭", "最新发射")}</b> · ${p + 1}/${pages}`, ...list.map((x) => `• <b>$${h(x.sym || "?")}</b> · ${x.where}${x.mcap != null ? ` · ${fmtUsd(x.mcap)}` : ""} · ${ago(x.t)}\n  <code>${x.token}</code>`)].join("\n"),
    buttons: [[...(p > 0 ? [{ text: "◀", callback_data: `lp:${p - 1}` }] : []), { text: "Explore", url: `${SITE}/arc#explore` }, ...(p < pages - 1 ? [{ text: "▶", callback_data: `lp:${p + 1}` }] : [])]],
  };
}
async function cardBooks(lang) {
  const d = await A402.stats().catch(() => null);
  if (!d) return w("err", lang);
  const t = d.totals, last = (d.items || []).find((e) => e.kind === "earn");
  return {
    photo: `${SITE}/api/og?a402=${last && last.tx ? last.tx : "none"}`,
    text: [`💙💚 <b>ARCIA 402</b> — ${T3(lang, "my own wallet on Arc", "Arc 위 제 지갑", "我在 Arc 上的钱包")}`, `<code>${h(d.wallet || "—")}</code>`, d.balances.usdc != null ? `USDC <b>$${d.balances.usdc.toFixed(2)}</b>` : null,
      `${T3(lang, "Earned", "수익", "收入")} $${t.earned.toFixed(2)} · ${T3(lang, "Spent", "비용", "支出")} $${t.spent.toFixed(2)} · ${T3(lang, "Tips", "팁", "打赏")} $${t.tips.toFixed(2)}`,
      `${T3(lang, "Net", "순이익", "净额")} <b>${t.net >= 0 ? "+" : "−"}$${Math.abs(t.net).toFixed(2)}</b> · ${t.sold} ${T3(lang, "paid calls", "유료 호출", "次付费调用")}`].filter(Boolean).join("\n"),
    buttons: [[{ text: "ARCIA 402", url: `${SITE}/arc#arcia402` }]], refresh: "books",
  };
}
/// /predict — ARCIRCLE Predict's live rounds on Arc and Robinhood Chain: time left to bet, pot, ARCIA's call
async function cardPredict(lang) {
  const P = await import("./_predict.mjs");
  const now = Math.floor(Date.now() / 1000);
  const rows = [], btns = [];
  for (const [c, P1] of [["arc", P.ARC], ["rh", P.RH]]) {
    const st = await P1.state().catch(() => null);
    if (!st || !st.live || !st.markets) continue;
    const calls = await P1.calls(st, { store: { get: (k) => getDoc(k, 15) }, readOnly: true }).catch(() => null);
    const unit = st.unit || (c === "rh" ? "ETH" : "USDC");
    const money = (x) => (unit === "USDC" ? "$" + x.toFixed(2) : x.toLocaleString("en-US", { maximumFractionDigits: 5 }) + " ETH");
    const lines = [];
    for (const m of st.markets.filter((x) => !x.stopped).slice(0, 6)) {
      const br = m.next && m.next.epoch === m.betting ? m.next : m.live.epoch === m.betting ? m.live : null;
      const left = br ? br.lockAt - now : 0;
      const mm = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "—";
      const pick = calls && calls.open && calls.open[m.id] && br && calls.open[m.id].epoch === br.epoch ? calls.open[m.id].pick : null;
      const d = m.duration % 3600 === 0 ? m.duration / 3600 + "h" : m.duration / 60 + "m";
      lines.push(`• <b>$${h(m.sym)}</b> ${d} · ${T3(lang, "bets close in", "마감까지", "距截止")} <b>${mm}</b> · UP ${h(money(br ? br.up : 0))} / DOWN ${h(money(br ? br.down : 0))}${pick ? ` · ARCIA ${pick === "up" ? "▲" : "▼"}` : ""}`);
    }
    if (!lines.length) continue;
    rows.push(`<b>${c === "rh" ? "Robinhood Chain · ETH" : "Arc · USDC"}</b>`, ...lines, "");
    btns.push({ text: c === "rh" ? "Predict · Robinhood" : "Predict · Arc", url: `${SITE}/arc#predict${c === "rh" ? "?c=rh" : ""}` });
  }
  if (!rows.length) return T3(lang, "No ARCIRCLE Predict round is open right now.", "지금 열린 ARCIRCLE Predict 라운드가 없어요.", "目前没有开放的 ARCIRCLE Predict 回合。");
  return {
    text: [`🔮 <b>ARCIRCLE Predict</b> — ${T3(lang, "UP or DOWN, live now", "지금 진행 중인 UP / DOWN", "正在进行的 UP / DOWN")}`, "", ...rows,
      `<i>${T3(lang, "ARCIA's call is for fun, not advice. Only bet what you can afford to lose.", "ARCIA의 선택은 재미용이에요, 투자 조언이 아니에요. 잃어도 괜찮은 만큼만 거세요.", "ARCIA 的选择仅供娱乐，不是投资建议。只用你能承受损失的金额。")}</i>`].join("\n"),
    buttons: [btns], refresh: "predict",
  };
}
async function cardMe(u, lang) {
  if (!u.wallet) return { text: T3(lang, "Link your wallet first — /link (one signature, no transaction).", "먼저 지갑을 연결해 주세요 — /link (서명 한 번, 거래 없음)", "请先绑定钱包 — /link(一次签名,无交易)") };
  const [L, d] = await Promise.all([live(SITE, u.wallet).catch(() => null), dropsOf(u.wallet).catch(() => null)]);
  const me = L && L.me;
  return {
    text: [`💙 <b>${T3(lang, "Your wallet", "내 지갑", "我的钱包")}</b> <code>${short(u.wallet)}</code>`,
      me ? `$ARCIRCLE <b>${compact(me.balance)}</b>${me.rank ? ` · #${num(me.rank)} ${T3(lang, "of", "/", "/")} ${num(me.of)}` : ""}${me.heldDays ? ` · ${T3(lang, "held", "보유", "持有")} ${me.heldDays}d` : ""}` : null,
      me && me.circle ? `CirclePad: ${h(typeof me.circle === "object" ? JSON.stringify(me.circle).slice(0, 80) : me.circle)}` : null,
      d ? `${T3(lang, "Airdrops received", "받은 에어드랍", "收到的空投")}: <b>${d.rows.length}</b>${d.claims.length ? ` · ${T3(lang, "to claim", "클레임 대기", "待领取")} ${d.claims.length}` : ""}` : null,
      u.gm ? `gm ${T3(lang, "streak", "연속", "连续")}: ${u.gm.streak} · ${u.gm.total} pts` : null].filter(Boolean).join("\n"),
    buttons: [[{ text: "Portfolio", url: `${SITE}/arc#portfolio` }]], refresh: "me",
  };
}
async function cardFor(kind, arg, lang, uid) {
  if (kind === "price") return cardPrice(lang);
  if (kind === "burns") return cardBurns(lang);
  if (kind === "scan") return cardScan(arg, lang);
  if (kind === "coin") return cardCoin(arg, lang);
  if (kind === "round") return cardRound(lang);
  if (kind === "drops") return cardDrops(arg, lang);
  if (kind === "books") return cardBooks(lang);
  if (kind === "predict") return cardPredict(lang);
  if (kind === "me") return cardMe(await loadUser(uid), lang);
  if (kind === "agent") { const [ch, ca] = String(arg || "").split("~"); return cardAgent(ca, ch, lang); }
  return null;
}
/// /scan with a live progress bar while the scan runs, then the card
async function scanWithProgress(m, ca, lang) {
  const steps = ["contract", "owner powers", "holders", "liquidity", "market"];
  const first = await say(m, `🔍 ${T3(lang, "Scanning", "스캔 중", "扫描中")} <code>${short(ca)}</code>\n▱▱▱▱▱ ${steps[0]}…`);
  const mid = first.ok && first.result.message_id;
  let i = 0, done = false;
  const tick = setInterval(() => { if (done || !mid || i >= steps.length - 1) return; i++; tg("editMessageText", { chat_id: m.chat.id, message_id: mid, parse_mode: "HTML", text: `🔍 ${T3(lang, "Scanning", "스캔 중", "扫描中")} <code>${short(ca)}</code>\n${"▰".repeat(i)}${"▱".repeat(5 - i)} ${steps[i]}…` }, 5000); }, 900);
  const card = await cardScan(ca, lang);
  done = true; clearInterval(tick);
  if (mid) await tg("deleteMessage", { chat_id: m.chat.id, message_id: mid }, 5000);
  return sendCard(m.chat.id, card, { replyTo: isGroup(m.chat) ? m.message_id : undefined });
}

// ---------------- chat as ARCIA (streamed) ----------------
async function answer(m, text, { lang, group, image, assist = false } = {}) {
  const c = await loadCfg(), uid = m.from.id, admin = c.admins.includes(uid);
  if (!admin) {
    const mine = await usage("chat", uid), all = Object.values(await usage("chat")).reduce((s, n) => s + n, 0);
    if (mine >= (group ? LIMIT.group : LIMIT.dm) || all >= LIMIT.all) { if (assist) { console.log(`[tg] assist quiet: ${all >= LIMIT.all ? "all" : "person"} daily limit (${mine}/${all})`); return; } return say(m, w("limit", lang)); } // unasked: stay quiet
    if (image && (await usage("photo", uid)) >= LIMIT.photo) return say(m, w("photoLimit", lang));
  }
  const stop = keepTyping(m.chat.id);
  try {
    const ck = DOC.conv(`${m.chat.id}_${group ? uid : "dm"}`);
    const prev = (await getDoc(ck)) || { turns: [] };
    const turns = (prev.turns || []).filter((t) => Date.now() - t.t < 6 * 3600e3).slice(-6);
    // in a group, the message they replied to (someone else's) is part of the question
    const rt = m.reply_to_message && m.reply_to_message.from && !m.reply_to_message.from.is_bot ? String(m.reply_to_message.text || m.reply_to_message.caption || "").slice(0, 600) : "";
    const q = (rt ? `(replying to ${m.reply_to_message.from.first_name || "someone"}: "${rt}")\n` : "") + text.slice(0, 1500);
    const content = image ? [{ type: "image", source: { type: "base64", media_type: image.type, data: image.data } }, { type: "text", text: q || "What do you see?" }] : q;
    const messages = [...turns.map((t) => ({ role: t.r, content: t.c })), { role: "user", content }];
    const L = await live(SITE).catch(() => null);
    const who = [m.from.first_name, m.from.username ? "@" + m.from.username : ""].filter(Boolean).join(" ");
    const extra = `Reply in the language the person wrote in (English unless they wrote in another language). You are chatting on Telegram${group ? ` in the group "${m.chat.title || ""}" (keep it short; others are reading)${assist ? `. This is ARCIRCLE's own community group and you answer its questions as ARCIRCLE's AI without being @mentioned: lead with the answer, use the live numbers you have for how ARCIRCLE is doing right now, give only the official contract addresses and arcircle.app links, never financial advice, and if the message isn't really for you, answer in one short friendly line` : ""}` : " in a private chat"}. The person is ${who || "a fan"}. ${image ? "They sent a picture: describe what matters in it for them (charts: say what you see, never predict prices). " : ""}Telegram shows plain text: no markdown, no bold, no bullet lists; links as plain arcircle.app/… text. Bot commands you can mention: /ca /price /scan 0x… /coin 0x… /round /drops 0x… /launches /books /link /alerts /gm.`;
    const replyTo = group ? { reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } } : {};
    let out = "", mid = null, lastEdit = 0;
    const it = await streamClaude({ messages, L, extra, maxTokens: 420, timeoutMs: 30000 }).catch(() => null);
    if (it) {
      for await (const piece of it) {
        out += piece;
        const now = Date.now();
        if (!mid && out.trim().length >= 24) { stop(); const r = await tg("sendMessage", { chat_id: m.chat.id, text: out + " ▍", link_preview_options: { is_disabled: true }, ...replyTo }); if (r.ok) mid = r.result.message_id; lastEdit = now; }
        else if (mid && now - lastEdit > 1100) { lastEdit = now; tg("editMessageText", { chat_id: m.chat.id, message_id: mid, text: out + " ▍", link_preview_options: { is_disabled: true } }, 6000); }
      }
    }
    if (!out.trim()) out = (await askClaude({ messages, L, extra, maxTokens: 420, timeoutMs: 25000 }).catch(() => null)) || "";
    stop();
    if (!out.trim()) return say(m, w("busy", lang));
    out = out.trim().slice(0, 4000);
    // the final text never keeps an address she wasn't given (FACTS, the site, or this chat): it's swapped for a pointer to /ca
    { const src = [q || "", ...turns.map((t) => t.c)].join("\n"); const c = checkAddresses(out, src); out = c.ok ? c.text : c.text.replace(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g, (a) => (checkAddresses(a, src).ok ? checkAddresses(a, src).text : "(official addresses: /ca)")); }
    if (mid) await tg("editMessageText", { chat_id: m.chat.id, message_id: mid, text: out, link_preview_options: { is_disabled: true } });
    else await tg("sendMessage", { chat_id: m.chat.id, text: out, link_preview_options: { is_disabled: true }, ...replyTo });
    await bump("chat", uid);
    if (image) await bump("photo", uid);
    await putDoc(ck, { turns: [...turns, { r: "user", c: (image ? "[sent a picture] " : "") + q, t: Date.now() }, { r: "assistant", c: out.slice(0, 1500), t: Date.now() }].slice(-6) });
  } finally { stop(); }
}

// ---------------- group safety ----------------
const adminCache = new Map();
async function isChatAdmin(chatId, uid) {
  const k = `${chatId}:${uid}`, c = adminCache.get(k);
  if (c && Date.now() - c.t < 600e3) return c.v;
  const r = await tg("getChatMember", { chat_id: chatId, user_id: uid }, 6000);
  const v = !!(r.ok && ["administrator", "creator"].includes(r.result.status));
  adminCache.set(k, { v, t: Date.now() });
  return v;
}
const canModerate = async (c, m) => c.admins.includes(m.from.id) || (isGroup(m.chat) && (await isChatAdmin(m.chat.id, m.from.id)));
const nameOf = (u) => h([u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "friend");
async function isRealTx(hash) { const t = await rpcCall("eth_getTransactionByHash", [hash]).catch(() => null); return !!t; }
/// a Uniswap v4 pool id on Arc (its slot0 in the PoolManager is set) — e.g. "/buybot add 0xTOKEN 0xPOOLID"
async function isRealPool(id) {
  try { const [r] = await ethCalls([{ to: PM_ADDRESS, data: "0x1e2eaeaf" + keccakHex(id.slice(2).toLowerCase() + pad("6")).slice(2) }]); return !!r && BigInt(r) !== 0n; } catch { return false; }
}
/// every 0x…64-hex in the message is a real transaction or a real pool → not a private key
async function allPublic(text) {
  const all = [...new Set(text.match(/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g) || [])].slice(0, 4);
  if (!all.length) return false;
  for (const hx of all) if (!(await isRealTx(hx)) && !(await isRealPool(hx))) return false;
  return true;
}
/// true when the message was handled here (removed / warned) and shouldn't go on
async function guard(c, m, lang) {
  const text = String(m.text || m.caption || "");
  let secret = secretIn(text);
  if (secret === "maybe-key") secret = (await allPublic(text)) ? null : "key";
  if (secret) {
    if (isGroup(m.chat)) { await tg("deleteMessage", { chat_id: m.chat.id, message_id: m.message_id }); await tg("sendMessage", { chat_id: m.chat.id, text: w("keyGroup", lang) }); }
    else await tg("sendMessage", { chat_id: m.chat.id, text: w("keyDm", lang) });
    return true;
  }
  if (!isGroup(m.chat)) return false;
  const cc = chatCfg(c, m.chat.id), old = retiredIn(text);
  if (!cc.guard) return old && assistOn(c, m.chat) ? retiredNote(m, old, lang) : false;
  const joined = (cc.joins || {})[m.from.id];
  const newbie = !!joined && Date.now() - joined < 72 * 3600e3;
  const scam = scamReason(m, { newbie });
  const strict = assistOn(c, m.chat) || cc.spam === true;
  const why = scam || (strict ? spamReason(m, { newbie }) || floodReason(m) : null);
  if (!why || (await canModerate(c, m))) return old ? retiredNote(m, old, lang) : false;
  const del = await tg("deleteMessage", { chat_id: m.chat.id, message_id: m.message_id });
  const n = await addWarn(c, m.chat.id, m.from, why, m.chat, { quiet: true });
  const out = strikeBan(c, m.chat);
  await tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", text: (scam ? w("scam", lang, { name: nameOf(m.from), why: h(why) }) : w("spam", lang, { name: nameOf(m.from), why: h(why) }))
    + `\n${n >= 3 ? (out ? T3(lang, `⛔ Warning 3/3 — removed from the group.`, `⛔ 경고 3/3 — 그룹에서 내보냈어요.`, `⛔ 警告 3/3 — 已移出本群。`) : T3(lang, `🔇 Warning 3/3 — muted for 24 h.`, `🔇 경고 3/3 — 24시간 동안 채팅 금지.`, `🔇 警告 3/3 — 禁言 24 小时。`)) : T3(lang, `⚠️ Warning ${n}/3${out ? " — at 3 you're removed." : " — at 3 you're muted for 24 h."}`, `⚠️ 경고 ${n}/3${out ? " — 3번이면 내보냅니다." : " — 3번이면 24시간 채팅 금지."}`, `⚠️ 警告 ${n}/3${out ? " — 满 3 次将被移出。" : " — 满 3 次禁言 24 小时。"}`)}`
    + (del.ok ? "" : "\n<i>(I need admin rights with “Delete messages” to remove it.)</i>") });
  return true;
}
/// v7: the same person posting very fast, or the same thing over and over (this instance's memory; good enough for a raid)
const FLOOD = new Map();
function floodReason(m) {
  const k = `${m.chat.id}:${m.from.id}`, now = Date.now(), t = String(m.text || m.caption || "").trim().toLowerCase().slice(0, 200);
  const f = FLOOD.get(k) || { at: [], texts: [] };
  f.at = [...f.at.filter((x) => now - x < 15e3), now];
  f.texts = [...f.texts.filter((x) => now - x.t < 600e3), { t: now, s: t }];
  FLOOD.set(k, f);
  if (FLOOD.size > 5000) FLOOD.clear();
  if (f.at.length >= 7) return "flooding the chat";
  if (t.length >= 12 && f.texts.filter((x) => x.s === t).length >= 3) return "posting the same message again and again";
  return null;
}
async function addWarn(c, chatId, user, why, chat = null, { quiet = false } = {}) {
  const cc = chatCfg(c, chatId), warns = { ...(cc.warns || {}) };
  warns[user.id] = (warns[user.id] || 0) + 1;
  const n = warns[user.id];
  if (n >= 3) delete warns[user.id]; // a fresh start if they're ever let back in
  await setChatCfg(c, chatId, { warns });
  if (n >= 3) {
    // v7: three strikes — out of the group (the home group, or /strikes ban), else muted for 24 hours
    const ban = strikeBan(c, chat || { id: chatId });
    const r = ban ? await tg("banChatMember", { chat_id: chatId, user_id: user.id, revoke_messages: false })
      : await tg("restrictChatMember", { chat_id: chatId, user_id: user.id, permissions: { can_send_messages: false }, until_date: Math.floor(Date.now() / 1000) + 86400 });
    if (!quiet) await tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: r.ok ? (ban ? `⛔ ${nameOf(user)} is removed (3 warnings).` : `🔇 ${nameOf(user)} is muted for 24 h (3 warnings).`) : `${nameOf(user)} has 3 warnings — I need the right to ${ban ? "ban" : "restrict"} members.` });
  }
  return n;
}
const OPEN = { can_send_messages: true, can_send_audios: true, can_send_documents: true, can_send_photos: true, can_send_videos: true, can_send_video_notes: true, can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true, can_add_web_page_previews: true, can_invite_users: true };
const CLOSED = { can_send_messages: false, can_send_audios: false, can_send_documents: false, can_send_photos: false, can_send_videos: false, can_send_video_notes: false, can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false };
async function holdsEnough(uid, min) {
  const u = await loadUser(uid);
  if (!u.wallet) return { ok: false, linked: false };
  const L = await live(SITE, u.wallet).catch(() => null);
  const bal = L && L.me ? L.me.balance : 0;
  return { ok: bal >= min, linked: true, bal };
}
async function welcome(chatId, user, lang) {
  if (tooMany(`welcome:${chatId}`, 3, 60e3)) return; // a raid of joins gets one welcome a minute or so
  const cap = w("welcome", lang, { name: nameOf(user) });
  const r = await tg("sendAnimation", { chat_id: chatId, animation: `${SITE}/images/arcia-gm.mp4`, caption: cap, parse_mode: "HTML", ...kb([[{ text: "ArcPad", url: `${SITE}/arc` }, { text: T3(lang, "Talk to me", "대화하기", "和我聊天"), url: BOT_URL }]]) });
  if (!r.ok) await tg("sendMessage", { chat_id: chatId, text: cap, parse_mode: "HTML" });
}
async function onJoin(c, m, lang) {
  const cc = chatCfg(c, m.chat.id), joins = { ...(cc.joins || {}) };
  for (const u of m.new_chat_members || []) {
    if (u.is_bot) continue;
    joins[u.id] = Date.now();
    if (cc.gate > 0) {
      const hold = await holdsEnough(u.id, cc.gate);
      if (hold.ok) { await welcome(m.chat.id, u, lang); continue; }
      await tg("restrictChatMember", { chat_id: m.chat.id, user_id: u.id, permissions: CLOSED });
      await tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", text: w("gate", lang, { name: nameOf(u), min: compact(cc.gate) }), ...kb([[{ text: "Link wallet", url: `${BOT_URL}?start=link` }, { text: "✓ Verify", url: `${BOT_URL}?start=v${String(m.chat.id).replace("-", "m")}` }]]) });
    } else if (cc.captcha) {
      await tg("restrictChatMember", { chat_id: m.chat.id, user_id: u.id, permissions: CLOSED });
      await tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", text: w("captcha", lang, { name: nameOf(u) }), ...kb([[{ text: "I'm human 💙", callback_data: `cap:${u.id}` }]]) });
    } else await welcome(m.chat.id, u, lang);
  }
  const keep = Object.entries(joins).sort((a, b) => b[1] - a[1]).slice(0, 300);
  await setChatCfg(c, m.chat.id, { joins: Object.fromEntries(keep) });
}
const REACT = /\b(gm|gn|lfg|wagmi|love|fighting|thank(s| you)|arcia)\b|사랑|응원|화이팅|파이팅|고마워|좋아요|팬이에요|加油|爱你/i;
async function maybeReact(c, m) {
  if (!REACT.test(String(m.text || "")) || Math.random() > 0.35 || tooMany(`react:${m.chat.id}`, 1, 120e3)) return;
  const emoji = ["❤", "🔥", "🥰", "🎉", "💯", "👍"][Math.floor(Math.random() * 6)];
  await tg("setMessageReaction", { chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: "emoji", emoji }] }, 5000);
  const gmSticker = c.stickers && c.stickers.ids && c.stickers.ids.gm;
  if (gmSticker && /^\s*gm\b/i.test(m.text || "") && Math.random() < 0.15) await tg("sendSticker", { chat_id: m.chat.id, sticker: gmSticker, reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } }, 5000);
}
async function autoScan(c, m, lang) {
  const cc = chatCfg(c, m.chat.id);
  if (!cc.autoscan) return false;
  const addrs = [...new Set((String(m.text || m.caption || "").match(ADDR_RE) || []).map(lc))];
  if (addrs.length !== 1 || OUR_CAS.includes(addrs[0]) || retiredIn(addrs[0]) || tooMany(`scan:${m.chat.id}:${addrs[0]}`, 1, 1800e3) || tooMany(`autoscan:${m.chat.id}`, 4, 600e3)) return false;
  const r = await scanner.apiResult(addrs[0], { store: store() }).catch(() => null);
  if (!r || r.score == null) return false; // a wallet, or unreadable: stay quiet
  await tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true },
    text: `🔍 <b>${h(r.symbol ? "$" + r.symbol : short(addrs[0]))}</b> · ${r.score}/100 · ${h(r.verdict || "")}${(r.critical || [])[0] ? `\n🛑 ${h(r.critical[0])}` : (r.reasons || [])[0] ? `\n• ${h(r.reasons[0].title || r.reasons[0])}` : ""}\n<i>${T3(lang, "Auto-scan · not financial advice", "자동 스캔 · 투자 조언 아님", "自动扫描 · 非投资建议")}</i>`,
    ...kb([[{ text: T3(lang, "Full report", "전체 리포트", "完整报告"), url: `${SITE}/s/${addrs[0]}` }]]) });
  return true;
}

// ---------------- fans: link, gm, lucky, alerts, watch ----------------
async function startLink(m, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const code = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  const d = (await getDoc(DOC.links)) || {};
  for (const [k, v] of Object.entries(d)) if (v.exp < Date.now()) delete d[k];
  d[code] = { uid: m.from.id, exp: Date.now() + 15 * 60e3 };
  await putDoc(DOC.links, d);
  return say(m, T3(lang, "Tap below, connect your wallet on arcircle.app and sign once. It's only a signature — no transaction, nothing can move. The link works for 15 minutes.", "아래 버튼을 눌러 arcircle.app에서 지갑을 연결하고 한 번 서명해 주세요. 서명만 하고 거래는 없어서 아무것도 움직이지 않아요. 링크는 15분 동안 유효해요.", "点下面的按钮,在 arcircle.app 连接钱包并签名一次。只是签名,没有交易,不会动用任何资产。链接 15 分钟内有效。"),
    kb([[{ text: "🔗 Link my wallet", url: `${SITE}/arc#tglink?c=${code}` }]]));
}
async function finishLink(body) {
  const code = String(body.c || ""), addr = lc(body.address), sig = String(body.sig || "");
  if (!/^[a-z0-9]{8,20}$/.test(code) || !isAddr(addr) || !/^0x[0-9a-fA-F]{130}$/.test(sig)) return { status: 400, body: { error: "bad request" } };
  const d = (await getDoc(DOC.links)) || {}, it = d[code];
  if (!it || it.exp < Date.now()) return { status: 410, body: { error: "This link expired — send /link to ARCIA again." } };
  if (personalSigner(linkMessage(it.uid, code), sig) !== addr) return { status: 401, body: { error: "The signature isn't from that wallet." } };
  delete d[code]; await putDoc(DOC.links, d);
  const u = await loadUser(it.uid);
  u.wallet = addr; u.linkedAt = Date.now();
  await saveUser(u);
  await sendWithEffect({ chat_id: it.uid, parse_mode: "HTML", text: `✓ Linked <code>${short(addr)}</code> 💙 Try /me — and /alerts to hear about airdrops to it.` }, EFFECT.party);
  return { status: 200, body: { ok: true } };
}
async function linkInfo(code) { const d = (await getDoc(DOC.links)) || {}, it = d[String(code)]; return it && it.exp > Date.now() ? { uid: it.uid, message: linkMessage(it.uid, code) } : null; }
async function gm(m, lang) {
  const u = await loadUser(m.from.id), today = day(), yday = day(Date.now() - 86400e3);
  const g = u.gm || { last: "", streak: 0, best: 0, total: 0 };
  if (g.last === today) return say(m, w("gmAgain", lang, { streak: g.streak }));
  g.streak = g.last === yday ? g.streak + 1 : 1;
  g.best = Math.max(g.best || 0, g.streak);
  const pts = 1 + (g.streak % 7 === 0 ? 5 : 0) + (g.streak % 30 === 0 ? 20 : 0);
  g.total = (g.total || 0) + pts; g.last = today;
  u.gm = g; u.name = m.from.first_name || m.from.username || "";
  await saveUser(u);
  const board = (await getDoc(DOC.gm)) || {};
  board[m.from.id] = { n: u.name.slice(0, 24), s: g.streak, t: g.total };
  const top = Object.entries(board).sort((a, b) => b[1].t - a[1].t).slice(0, 200);
  await putDoc(DOC.gm, Object.fromEntries(top));
  const milestone = g.streak === 7 || g.streak % 30 === 0;
  await sendWithEffect({ chat_id: m.chat.id, parse_mode: "HTML", text: w("gmFirst", lang, { name: nameOf(m.from), streak: g.streak, pts, total: g.total }) + (milestone ? `\n🎉 ${T3(lang, `${g.streak}-day streak! A photocard for you~`, `${g.streak}일 연속! 포토카드 선물이에요~`, `连续 ${g.streak} 天!送你一张小卡~`)}` : ""), ...(isGroup(m.chat) ? { reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } } : {}) }, milestone ? EFFECT.party : null);
  if (milestone) await tg("sendPhoto", { chat_id: m.chat.id, photo: `${SITE}/images/arcia-portrait.jpg`, caption: `ARCIA photocard · ${g.streak}-day gm streak 💙💚` });
  const c = await loadCfg(), sid = c.stickers && c.stickers.ids && c.stickers.ids.gm;
  if (sid && !milestone && Math.random() < 0.3) await tg("sendSticker", { chat_id: m.chat.id, sticker: sid });
}
async function gmTop(m, lang) {
  const board = Object.entries((await getDoc(DOC.gm)) || {}).sort((a, b) => b[1].t - a[1].t).slice(0, 10);
  if (!board.length) return say(m, "No gm yet today~ be the first: /gm");
  return say(m, [`☀️ <b>gm ${T3(lang, "leaderboard", "순위", "排行榜")}</b>`, ...board.map(([, v], i) => `${["🥇", "🥈", "🥉"][i] || `${i + 1}.`} ${h(v.n || "fan")} · ${v.t} pts · 🔥${v.s}`), `\n<i>${T3(lang, "Points are for fun — no rewards are decided.", "포인트는 재미용이에요 — 보상은 정해지지 않았어요.", "积分仅供娱乐——奖励尚未决定。")}</i>`].join("\n"));
}
async function lucky(m, lang) {
  if ((await usage("lucky", m.from.id)) >= LIMIT.lucky) return say(m, T3(lang, "That's 3 spins today~ come back tomorrow 🍀", "오늘은 3번 다 돌렸어요~ 내일 또 와요 🍀", "今天 3 次用完啦~ 明天再来 🍀"));
  await bump("lucky", m.from.id);
  const emoji = ["🎰", "🎲", "🎯", "🏀", "🎳"][Math.floor(Math.random() * 5)];
  const r = await tg("sendDice", { chat_id: m.chat.id, emoji, ...(isGroup(m.chat) ? { reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } } : {}) });
  if (!r.ok) return;
  const v = r.result.dice.value, max = emoji === "🎰" ? 64 : emoji === "🎲" || emoji === "🎯" || emoji === "🎳" ? 6 : 5;
  await sleep(emoji === "🎰" ? 2200 : 3200);
  const great = emoji === "🎰" ? [1, 22, 43, 64].includes(v) : v === max;
  await tg("sendMessage", { chat_id: m.chat.id, text: great ? T3(lang, "WOW jackpot!! today's luck is all yours~ ✨ (just for fun!)", "와 대박!! 오늘 운 다 가져갔네요~ ✨ (재미로만!)", "哇,大奖!!今天的好运都是你的~ ✨(仅供娱乐!)") : T3(lang, `${["So close~", "Not bad!", "Hehe, again tomorrow?", "The vibes are good anyway 💙"][v % 4]} (just for fun!)`, `${["아깝다~", "나쁘지 않아요!", "헤헤, 내일 또?", "그래도 분위기 좋아요 💙"][v % 4]} (재미로만!)`) });
}
async function subs() { return (await getDoc(DOC.subs, 3000)) || { alerts: [], watch: {} }; }
async function setAlerts(m, on, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const s = await subs();
  s.alerts = s.alerts.filter((x) => x !== m.from.id);
  if (on) s.alerts.push(m.from.id);
  await putDoc(DOC.subs, s);
  const u = await loadUser(m.from.id); u.alerts = on; await saveUser(u);
  return sendWithEffect({ chat_id: m.chat.id, text: w(on ? "alertsOn" : "alertsOff", lang) }, on ? EFFECT.like : null);
}
async function watch(m, arg, on, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const wa = addrOf(arg);
  const u = await loadUser(m.from.id), s = await subs();
  if (!wa) return say(m, (u.watch || []).length ? `👀 ${(u.watch || []).map((x) => `<code>${short(x)}</code>`).join(", ")}\n/unwatch 0x… to stop` : w("needWallet", lang, { cmd: "watch" }));
  u.watch = (u.watch || []).filter((x) => x !== wa);
  if (on) { if (u.watch.length >= LIMIT.watch) return say(m, `Up to ${LIMIT.watch} wallets — /unwatch one first.`); u.watch.push(wa); }
  s.watch[wa] = (s.watch[wa] || []).filter((x) => x !== m.from.id);
  if (on) s.watch[wa].push(m.from.id);
  if (!s.watch[wa].length) delete s.watch[wa];
  if (Object.keys(s.watch).length > 500) return say(m, "The watch list is full right now — try later.");
  await saveUser(u); await putDoc(DOC.subs, s);
  return say(m, on ? `👀 ${T3(lang, "Watching", "지켜볼게요", "正在关注")} <code>${short(wa)}</code> — ${T3(lang, "I'll DM you when it gets an airdrop.", "에어드랍이 들어오면 DM으로 알려드릴게요.", "收到空投时我会私信你。")}` : `✓ ${T3(lang, "Stopped watching", "그만 지켜볼게요", "已取消关注")} <code>${short(wa)}</code>`);
}

// ---------------- admin tools ----------------
async function cmdStatus(c) {
  const [wh, d] = await Promise.all([tg("getWebhookInfo"), A402.stats().catch(() => null)]);
  const s = await subs(), on = (k) => (env(k) ? "on" : "off");
  const answered = Object.values(await usage("chat")).reduce((x, n) => x + n, 0);
  return [
    "<b>Status</b>",
    `Bot @${h((c.me || {}).username || "?")} · webhook ${wh.ok && wh.result.url ? "✓" : "✗"}${wh.ok && wh.result.pending_update_count ? ` · ${wh.result.pending_update_count} waiting` : ""}${wh.ok && wh.result.last_error_message ? `\nTelegram's last error: ${h(wh.result.last_error_message)}` : ""}`,
    `Today ${answered} answers · admins ${c.admins.length} · targets ${c.targets.length} · alert subscribers ${s.alerts.length} · watched wallets ${Object.keys(s.watch).length} · X mirror ${c.mirror ? "on" : "off"}`,
    c.lastError ? `Last bot error (${new Date(c.lastError.t).toISOString().slice(5, 16).replace("T", " ")} UTC): ${h(c.lastError.msg.slice(0, 160))}` : "No bot errors recorded",
    d ? `ARCIA 402 · USDC ${d.balances.usdc == null ? "—" : "$" + d.balances.usdc.toFixed(2)} · key ${d.canPay ? (d.keyMatches === false ? "set (≠ published wallet!)" : "✓") : "not set"} · sell ${d.paused.sell ? "paused" : "on"} · hire ${d.paused.hire ? "paused" : "on"}` : "ARCIA 402 unreadable",
    `X replies ${on("ARCIA_X_ENABLED")} · X posts ${on("ARCIA_X_POSTS")} · store ${storeEnabled() ? "on" : "off"}`,
  ].join("\n");
}
async function cmdBotStats() {
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => DOC.usage(day(Date.now() - i * 86400e3)));
  const docs = await Promise.all(days.map((k) => getDoc(k)));
  const sum = (d, k) => Object.values((d && d[k]) || {}).reduce((s, n) => s + n, 0);
  const today = docs[0] || {}, week = docs.reduce((s, d) => s + sum(d, "chat"), 0);
  const cmds = Object.entries(today.cmd || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `/${k} ${v}`).join(" · ") || "—";
  const s = await subs(), gmb = Object.keys((await getDoc(DOC.gm)) || {}).length;
  return ["<b>Bot stats</b>", `Today: ${sum(today, "chat")} answers to ${Object.keys(today.chat || {}).length} people · ${sum(today, "photo")} photos · ${sum(today, "cmd")} commands`, `Top commands today: ${cmds}`,
    `Last 7 days: ${week} answers`, `Alert subscribers ${s.alerts.length} · watched wallets ${Object.keys(s.watch).length} · gm players ${gmb}`,
    `Model cost, rough: ~$${(week * 0.004).toFixed(2)} for the week (≈$0.004 per answer, photos more)`].join("\n");
}
async function preview(c, m, kind, payload, label) {
  const id = Math.random().toString(36).slice(2, 10);
  const p = (await getDoc(DOC.pending)) || {};
  for (const [k, v] of Object.entries(p)) if (Date.now() - v.t > 86400e3) delete p[k];
  p[id] = { kind, ...payload, by: m.from.id, t: Date.now() };
  await putDoc(DOC.pending, p);
  const btn = [[{ text: label, callback_data: `go:${id}` }, { text: "Cancel", callback_data: `no:${id}` }], ...(kind === "tweet" || kind === "say" ? [[{ text: "↻ Rewrite", callback_data: `re:${id}` }]] : [])];
  const head = kind === "tweet" ? "🐦 Draft for X (@ARCIAonArc)" : kind === "poll" ? `📊 Poll → ${c.targets.length} chat(s)` : `📣 Preview → ${c.targets.length} chat(s): ${c.targets.map((t) => t.title).join(", ")}`;
  const body = kind === "poll" ? `${payload.question}\n${payload.options.map((o) => `• ${o}`).join("\n")}` : payload.text;
  if (payload.photo) return tg("sendPhoto", { chat_id: m.chat.id, photo: payload.photo, caption: `${head}\n\n${body}`.slice(0, 1024), ...kb(btn) });
  return tg("sendMessage", { chat_id: m.chat.id, text: `${head}\n\n${body}`.slice(0, 4000), link_preview_options: { is_disabled: true }, ...kb(btn) });
}
async function postToTargets(c, p) {
  let ok = 0;
  for (const t of c.targets) {
    const r = p.kind === "poll" ? await tg("sendPoll", { chat_id: t.id, question: p.question.slice(0, 300), options: p.options.slice(0, 10).map((text) => ({ text: text.slice(0, 100) })), is_anonymous: true })
      : p.photo ? await tg("sendPhoto", { chat_id: t.id, photo: p.photo, caption: p.text.slice(0, 1024) })
      : await tg("sendMessage", { chat_id: t.id, text: p.text.slice(0, 4000) });
    if (r.ok) ok++;
    await sleep(60);
  }
  return ok;
}
async function arciaWrite(kind, note) {
  const prompt = kind === "tweet"
    ? `Write one post for your X account (@ARCIAonArc) from this note by the ARCIRCLE team:\n"${note}"\nAt most 260 characters, in English, your own voice, at most two emoji, no hashtags, no links unless the note has one. Only facts from the note or FACTS/LIVE. Output only the post.`
    : `Rewrite this note from the ARCIRCLE team as a Telegram announcement in your own voice:\n"${note}"\nKeep every fact, date, number and link exactly. English unless the note is in another language. Plain text, up to ~6 short lines, at most two emoji. Output only the announcement.`;
  const L = await live(SITE).catch(() => null);
  return (await askClaude({ messages: [{ role: "user", content: prompt }], L, maxTokens: 400, timeoutMs: 25000 }).catch(() => null)) || null;
}
function parseKst(s) {
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})\s*(utc|kst)?\s+([\s\S]+)$/i);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2].padStart(2, "0")}:${m[3]}:00${lc(m[4]) === "utc" ? "Z" : "+09:00"}`);
  return Number.isFinite(t) ? { at: t, text: m[5].trim() } : null;
}
// ARCIA's stickers: made from the site's images (images/stickers/*.png), created once by an admin
const STICKERS = [["gm", "☀️"], ["thanks", "💙"], ["lfg", "🚀"], ["love", "🥰"], ["dyor", "🔍"], ["gn", "🌙"]];
async function makeStickers(c, m) {
  const bot = c.me && c.me.username;
  if (!bot) return say(m, "Run the setup link first.");
  const name = `arcia_by_${bot}`;
  const stickers = STICKERS.map(([k, e]) => ({ sticker: `${SITE}/images/stickers/arcia-${k}.png`, format: "static", emoji_list: [e] }));
  let r = await tg("createNewStickerSet", { user_id: m.from.id, name, title: "ARCIA 💙💚", stickers }, 60000);
  if (!r.ok && !/occupied|already/i.test(r.description || "")) return say(m, `Couldn't create the set: ${h(r.description || "unknown")}`);
  const set = await tg("getStickerSet", { name });
  if (!set.ok) return say(m, `Couldn't read the set: ${h(set.description || "")}`);
  const ids = {};
  set.result.stickers.forEach((s, i) => { if (STICKERS[i]) ids[STICKERS[i][0]] = s.file_id; });
  c.stickers = { name, ids };
  await saveCfg(c);
  return say(m, `✓ Sticker set ready: t.me/addstickers/${name}`);
}

// ---------------- the message router ----------------
async function onMessage(m, channel) {
  const c = await loadCfg();
  if (!c.me) { const r = await tg("getMe"); if (r.ok) { c.me = { id: r.result.id, username: r.result.username }; await saveCfg(c); } }
  const bot = c.me || { id: 0, username: "" };
  const text = String(m.text || m.caption || "").trim();
  const cm = text.match(/^\/([a-zA-Z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/);
  if (cm && cm[2] && lc(cm[2]) !== lc(bot.username)) return; // a command for another bot
  const cmd = cm ? lc(cm[1]) : "", arg = cm ? String(cm[3] || "").trim() : "";

  if (channel) { if (cmd === "here" || cmd === "unhere") await setTarget(c, m.chat, cmd === "here"); return; }
  if (m.is_automatic_forward) return; // the linked channel's own post copied into its discussion group
  const anon = viaChat(m); // an anonymous admin or someone posting as a channel: still a person asking
  if (!m.from || (m.from.is_bot && !anon)) { if (m.from && isGroup(m.chat) && !m.is_automatic_forward) groupSeen(m, "from-a-bot"); return; }
  const group = isGroup(m.chat), uid = anon ? m.sender_chat.id : m.from.id, admin = c.admins.includes(uid);
  const u = group ? null : await loadUser(uid);
  const lang = group ? chatCfg(c, m.chat.id).lang || "en" : (u && u.lang) || "en";
  if (m.new_chat_members) return onJoin(c, m, lang);
  if (!text && !m.photo) return;

  if (!anon && (await guard(c, m, lang))) { if (group) groupSeen(m, "guard"); return; }
  if (anon && group && retiredIn(text) && (await retiredNote(m, retiredIn(text), lang))) return;
  if (group && !cmd) await maybeReact(c, m);
  if (!group && u && !u.first) { u.first = Date.now(); u.name = m.from.first_name || ""; await saveUser(u); }

  const adminOnly = () => say(m, w("onlyAdmin", lang));
  const mod = async () => canModerate(c, m);
  if (cmd) {
    if (!admin && tooMany(`cmd:${uid}`, 12, 60e3)) return group ? undefined : say(m, w("slow", lang));
    await bump("cmd", cmd);
    const target = m.reply_to_message && m.reply_to_message.from;
    switch (cmd) {
      case "start": return start(c, m, arg, lang);
      case "help": return help(c, m, lang);
      case "whoami": return say(m, `Telegram ID: <code>${uid}</code>${admin ? " · admin ✓" : ""}`);
      case "admin": return claimAdmin(c, m, arg);
      case "ca": return say(m, cardCA(), kb([[{ text: "$ARCIRCLE", url: `https://argus.world/token/${CA}` }, { text: "$ARCIA (Pons)", url: ARCIA_RH_BUY }]]));
      case "burns": case "burn": return sendCard(m.chat.id, await cardBurns(lang), { replyTo: group ? m.message_id : undefined });
      case "price": return sendCard(m.chat.id, await cardPrice(lang), { replyTo: group ? m.message_id : undefined });
      case "scan": { const ca = addrOf(arg) || ((String(arg || "").trim().match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/) || [])[0] || ""); return ca ? scanWithProgress(m, ca, lang) : say(m, w("needCA", lang, { cmd: "scan" })); }
      case "coin": { const ca = addrOf(arg); return ca ? sendCard(m.chat.id, await cardCoin(ca, lang), { replyTo: group ? m.message_id : undefined }) : say(m, w("needCA", lang, { cmd: "coin" })); }
      case "round": return sendCard(m.chat.id, await cardRound(lang), { replyTo: group ? m.message_id : undefined });
      case "drops": { const wa = addrOf(arg) || (u && u.wallet); return wa ? sendCard(m.chat.id, await cardDrops(wa, lang), { replyTo: group ? m.message_id : undefined }) : say(m, w("needWallet", lang, { cmd: "drops" })); }
      case "launches": return sendCard(m.chat.id, await cardLaunches(0, lang), { replyTo: group ? m.message_id : undefined });
      case "books": return sendCard(m.chat.id, await cardBooks(lang), { replyTo: group ? m.message_id : undefined });
      case "predict": return sendCard(m.chat.id, await cardPredict(lang), { replyTo: group ? m.message_id : undefined });
      case "nft": case "vault": return sendCard(m.chat.id, await cardNft(lang), { replyTo: group ? m.message_id : undefined });
      case "mine": return mineList(m);
      case "minealerts": return setMineAlerts(m, !/^off$/i.test(arg), lang);
      case "agent": { const ca = addrOf(arg); return ca ? agentWithProgress(m, ca, /\b(rh|robinhood)\b/i.test(arg) ? "rh" : "arc", lang) : say(m, w("needCA", lang, { cmd: "agent" })); }
      case "agentwatch": case "agentunwatch": return agentWatch(m, arg, cmd === "agentwatch" && !/^off$/i.test(String(arg || "").trim()), lang);
      case "predictalerts": return predictWatch(m, arg, lang);
      case "orders": return group ? say(m, w("dmOnly", lang)) : sendCard(m.chat.id, await cardOrders(u, lang));
      case "orderalerts": return setOrderAlerts(m, !/^off$/i.test(arg), lang);
      case "stakealerts": return setStakeAlerts(m, !/^off$/i.test(arg), lang);
      case "vearcia": case "vea": return sendCard(m.chat.id, await cardVea(m, lang), { replyTo: group ? m.message_id : undefined });
      case "vearciaalerts": return setVeaAlerts(m, !/^off$/i.test(arg), lang);
      case "me": return group ? say(m, w("dmOnly", lang)) : sendCard(m.chat.id, await cardMe(u, lang));
      case "link": return startLink(m, lang);
      case "unlink": { if (group) return say(m, w("dmOnly", lang)); delete u.wallet; await saveUser(u); return say(m, "✓ Unlinked."); }
      case "alerts": return setAlerts(m, !/^off$/i.test(arg), lang);
      case "watch": return watch(m, arg, true, lang);
      case "unwatch": return watch(m, arg, false, lang);
      case "gm": return gm(m, lang);
      case "gmtop": return gmTop(m, lang);
      case "lucky": return lucky(m, lang);
      case "lang": {
        const v = lc(arg).slice(0, 2);
        if (!["en", "ko", "zh"].includes(v)) return say(m, "Use /lang en, /lang ko or /lang zh");
        if (group) { if (!(await mod())) return adminOnly(); await setChatCfg(c, m.chat.id, { lang: v }); }
        else { u.lang = v; await saveUser(u); }
        return say(m, T3(v, "✓ English it is.", "✓ 한국어로 바꿨어요.", "✓ 已切换为中文。"));
      }
      case "report": {
        if (group && target) {
          const link = m.chat.username ? `https://t.me/${m.chat.username}/${m.reply_to_message.message_id}` : "";
          for (const a of c.admins) await tg("sendMessage", { chat_id: a, parse_mode: "HTML", link_preview_options: { is_disabled: true }, text: `🚩 Report in <b>${h(m.chat.title || "")}</b> by ${nameOf(m.from)}\nAbout ${nameOf(target)}: ${h(String(m.reply_to_message.text || m.reply_to_message.caption || "[media]").slice(0, 400))}${link ? `\n${link}` : ""}`,
            ...kb([[{ text: "🗑 Delete", callback_data: `md:${m.chat.id}:${m.reply_to_message.message_id}` }, { text: "⛔ Ban", callback_data: `mb:${m.chat.id}:${target.id}` }]]) });
          return say(m, "✓ Sent to the team. Thank you 💙");
        }
        if (group) return say(m, "Reply to the message you want to report with /report.");
        return admin ? say(m, await (async () => { const [p, r, b] = await Promise.all([cardPrice(lang), cardRound(lang), cardBooks(lang)]); return [p, r, b].map((x) => (typeof x === "string" ? x : x.text)).join("\n\n"); })()) : say(m, "Reply to a group message with /report to send it to the team.");
      }
      // ---- chat admins (and bot admins) ----
      case "warn": case "mute": case "unmute": case "ban": {
        if (!group || !target) return say(m, `Reply to someone's message with /${cmd}.`);
        if (!(await mod())) return adminOnly();
        if (target.is_bot || (await isChatAdmin(m.chat.id, target.id))) return say(m, "Not on admins or bots.");
        if (cmd === "warn") { const n = await addWarn(c, m.chat.id, target, arg || "warned"); return say(m, `⚠️ ${nameOf(target)} — warning ${n}/3${arg ? `: ${h(arg)}` : ""}`); }
        if (cmd === "mute") { const hrs = Math.max(1, Math.min(720, Number(arg) || 24)); const r = await tg("restrictChatMember", { chat_id: m.chat.id, user_id: target.id, permissions: CLOSED, until_date: Math.floor(Date.now() / 1000) + hrs * 3600 }); return say(m, r.ok ? `🔇 ${nameOf(target)} muted for ${hrs} h.` : `Couldn't: ${h(r.description || "")} (I need admin rights)`); }
        if (cmd === "unmute") { const r = await tg("restrictChatMember", { chat_id: m.chat.id, user_id: target.id, permissions: OPEN }); const cc = chatCfg(c, m.chat.id), warns = { ...(cc.warns || {}) }; delete warns[target.id]; await setChatCfg(c, m.chat.id, { warns }); return say(m, r.ok ? `🔊 ${nameOf(target)} can talk again.` : `Couldn't: ${h(r.description || "")}`); }
        const r = await tg("banChatMember", { chat_id: m.chat.id, user_id: target.id });
        return say(m, r.ok ? `⛔ ${nameOf(target)} is banned.` : `Couldn't: ${h(r.description || "")}`);
      }
      case "assist": case "spam": {
        if (!group) return say(m, `Use /${cmd} on|off inside a group.`);
        if (!(await mod())) return adminOnly();
        const on = !/^off$/i.test(arg);
        await setChatCfg(c, m.chat.id, { [cmd]: on });
        return say(m, cmd === "assist" ? `✓ ${on ? "I'll answer questions here without an @mention (contract addresses, links, how to buy, the price, and anything ARCIRCLE)." : "I'll answer here only when @mentioned or replied to."}` : `✓ Spam filter (invites, promo, mass mentions, floods) ${on ? "on" : "off"} here.`);
      }
      case "strikes": {
        if (!group) return say(m, "Use /strikes ban|mute inside a group.");
        if (!(await mod())) return adminOnly();
        const v = /^mute$/i.test(arg) ? "mute" : "ban";
        await setChatCfg(c, m.chat.id, { strikes: v });
        return say(m, `✓ At 3 warnings: ${v === "ban" ? "removed from the group" : "muted for 24 h"}.`);
      }
      case "unban": case "warns": case "resetwarns": {
        if (!group) return say(m, `Use /${cmd} inside a group (reply to the person, or /${cmd} <user id>).`);
        if (!(await mod())) return adminOnly();
        const id = target ? target.id : Number(arg);
        if (!id) return say(m, `Reply to someone with /${cmd}, or /${cmd} <user id>.`);
        const cc = chatCfg(c, m.chat.id), warns = { ...(cc.warns || {}) };
        if (cmd === "warns") return say(m, `${target ? nameOf(target) : id}: ${warns[id] || 0}/3 warnings.`);
        delete warns[id]; await setChatCfg(c, m.chat.id, { warns });
        if (cmd === "resetwarns") return say(m, "✓ Warnings cleared.");
        const r = await tg("unbanChatMember", { chat_id: m.chat.id, user_id: id, only_if_banned: true });
        return say(m, r.ok ? "✓ Unbanned — they can join again." : `Couldn't: ${h(r.description || "")}`);
      }
      case "guard": case "captcha": case "autoscan": {
        if (!group) return say(m, `Use /${cmd} on|off inside a group.`);
        if (!(await mod())) return adminOnly();
        const on = !/^off$/i.test(arg);
        await setChatCfg(c, m.chat.id, { [cmd]: on });
        return say(m, `✓ ${cmd} ${on ? "on" : "off"} here.${on && cmd !== "autoscan" ? " I need admin rights (delete messages, restrict members) for it to work." : ""}`);
      }
      case "buybot": {
        const [sub = "", a1 = "", a2 = ""] = String(arg || "").trim().split(/\s+/);
        const s0 = lc(sub);
        if (!s0) return say(m, await BB.status(m.chat.id));
        if (s0 === "burns") {
          if (!group) return say(m, "Use /buybot burns on|off inside the group.");
          if (!(await mod())) return adminOnly();
          const r = await BB.setBurns(m.chat.id, !/^off$/i.test(a1));
          return say(m, r.error ? h(r.error) : /^off$/i.test(a1) ? "✓ Burn alerts off here." : "✓ Burn alerts on here 🔥 — $ARCIRCLE and $ARCIA burns, gathered every 2 minutes.");
        }
        if (s0 === "on" || s0 === "off" || s0 === "min") {
          if (!group) return say(m, "Use /buybot on inside the group where the buys should show up.");
          if (!(await mod())) return adminOnly();
          if (s0 === "off") { await BB.setChat(m.chat.id, m.chat.title, null); return say(m, "✓ Buy alerts off here."); }
          const min = Math.max(0, Math.min(1e6, Number(String(a1).replace(/[$,]/g, "")) || 0));
          await BB.setChat(m.chat.id, m.chat.title, { min });
          return say(m, `✓ Buy alerts on here — ${min ? `buys of $${min}+` : "every buy"} of our coins 💚\nChange it with /buybot min 10, stop with /buybot off.`);
        }
        if (!admin) return adminOnly();
        if (s0 === "add") { const r = await BB.addToken(a1, a2); return say(m, r.error ? h(r.error) : `✓ Following $${h(r.tk.sym)} (<code>${short(r.tk.t)}</code>) — pool <code>${short(r.tk.pool)}</code>.`); }
        if (s0 === "remove") { const r = await BB.removeToken(a1); return say(m, r.error ? h(r.error) : "✓ Stopped following it."); }
        if (s0 === "test") { const r = await BB.test(m.chat.id); return r.error ? say(m, h(r.error)) : undefined; }
        return say(m, "/buybot · /buybot on [min] · /buybot min 10 · /buybot off · /buybot burns on|off\nTeam: /buybot add 0xTOKEN [0xPOOL] · /buybot remove 0xTOKEN · /buybot test");
      }
      case "gate": {
        if (!group) return say(m, "Use /gate <min $ARCIRCLE> or /gate off inside a group.");
        if (!(await mod())) return adminOnly();
        const min = /^off$/i.test(arg) ? 0 : Math.max(0, Number(String(arg).replace(/[,_]/g, "")) || 0);
        await setChatCfg(c, m.chat.id, { gate: min });
        return say(m, min ? `🔐 Holders-only: new members need ${compact(min)}+ $ARCIRCLE in a linked wallet.` : "🔓 Holder gate off.");
      }
      // ---- bot admins ----
      case "status": return admin ? say(m, await cmdStatus(c)) : adminOnly();
      case "botstats": return admin ? say(m, await cmdBotStats()) : adminOnly();
      case "here": case "unhere":
        if (!admin) return adminOnly();
        if (!group) return say(m, "Use /here inside a group (or post /here in a channel where I'm an admin).");
        await setTarget(c, m.chat, cmd === "here");
        return say(m, cmd === "here" ? "✓ Announcements will come here." : "✓ No more announcements here.");
      case "targets": return admin ? say(m, c.targets.length ? c.targets.map((t) => `• ${h(t.title || t.id)} <i>${t.type}</i>`).join("\n") : "No targets yet — /here in a group, or post /here in a channel.") : adminOnly();
      case "agentweekly": { if (!admin) return adminOnly(); c.agentWeekly = !/^off$/i.test(arg); await saveCfg(c); return say(m, `✓ ARCIA AGENT's Monday report card to the targets: ${c.agentWeekly ? "on" : "off"}.`); }
      case "mirror": { if (!admin) return adminOnly(); c.mirror = !/^off$/i.test(arg); await saveCfg(c); return say(m, `✓ Mirroring ARCIA's X posts to the targets: ${c.mirror ? "on" : "off"}.`); }
      case "announce": {
        if (!admin) return adminOnly();
        if (!c.targets.length) return say(m, "No targets yet — add me to a group or channel as an admin and send /here there.");
        const photo = m.photo ? m.photo[m.photo.length - 1].file_id : null;
        if (!arg && !photo) return say(m, "/announce Your message — or send a photo with “/announce text” as its caption.");
        return preview(c, m, "announce", { text: arg, photo }, "✓ Post it");
      }
      case "poll": {
        if (!admin) return adminOnly();
        const parts = arg.split("|").map((s) => s.trim()).filter(Boolean);
        if (parts.length < 3) return say(m, "/poll Question | option 1 | option 2 [| …]");
        return preview(c, m, "poll", { question: parts[0], options: parts.slice(1, 11) }, "✓ Post poll");
      }
      case "say": case "tweet": {
        if (!admin) return adminOnly();
        if (!arg) return say(m, `/${cmd} your note`);
        const stop = keepTyping(m.chat.id);
        const text2 = await arciaWrite(cmd, arg); stop();
        if (!text2) return say(m, w("busy", "en"));
        return preview(c, m, cmd, { text: text2, note: arg }, cmd === "tweet" ? "✓ Post on X" : "✓ Post it");
      }
      case "schedule": {
        if (!admin) return adminOnly();
        const p = parseKst(arg);
        if (!p || p.at < Date.now() + 60e3) return say(m, "/schedule 2026-09-30 20:00 Your message  (KST; add UTC after the time for UTC). Posts within ~5 minutes of the time.");
        const s = (await getDoc(DOC.sched)) || { list: [] };
        const id = Math.random().toString(36).slice(2, 7);
        s.list.push({ id, at: p.at, text: p.text, by: uid });
        await putDoc(DOC.sched, s);
        return say(m, `🗓 Scheduled <b>${id}</b> for ${new Date(p.at + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")} KST → ${c.targets.length} chat(s). /unschedule ${id} to cancel.`);
      }
      case "schedules": { if (!admin) return adminOnly(); const s = (await getDoc(DOC.sched)) || { list: [] }; return say(m, s.list.length ? s.list.map((x) => `• <b>${x.id}</b> ${new Date(x.at + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")} KST — ${h(x.text.slice(0, 60))}`).join("\n") : "Nothing scheduled."); }
      case "unschedule": { if (!admin) return adminOnly(); const s = (await getDoc(DOC.sched)) || { list: [] }; const n = s.list.length; s.list = s.list.filter((x) => x.id !== arg); await putDoc(DOC.sched, s); return say(m, n === s.list.length ? "No such schedule." : "✓ Cancelled."); }
      case "stickers": return admin ? makeStickers(c, m) : adminOnly();
      case "pause402": {
        if (!admin) return adminOnly();
        const r = await A402.setPause(arg || "").catch((e) => ({ error: String(e.message || e) }));
        return say(m, r.error ? h(r.error) : `ARCIA 402 pause: <b>${h(r.pause)}</b>`);
      }
      case "hire": {
        if (!admin) return adminOnly();
        const stop = keepTyping(m.chat.id);
        const r = await A402.hire({ force: true }).catch((e) => ({ ok: false, error: String(e.message || e) })); stop();
        return say(m, r.ok ? `✓ Hired ${h(r.hired.provider || r.hired.svc)} for $${(r.hired.amount / 1e6).toFixed(2)}\n<i>${h(r.hired.note || "")}</i>` : `Not hired: ${h(r.skipped || r.error || "unknown")}`);
      }
      default: return group ? undefined : help(c, m, lang);
    }
  }
  // plain text or a photo: always in a DM; in a group when mentioned or replied to (else maybe an auto-scan)
  let q = text;
  if (group) {
    const mention = bot.username && new RegExp(`@${bot.username}\\b`, "i").test(text);
    const toMe = m.reply_to_message && m.reply_to_message.from && m.reply_to_message.from.id === bot.id;
    if (!mention && !toMe) {
      // v7: in the home group (or with /assist on) a question gets an answer without the @mention — the common ones
      // (contract addresses, links, how to buy, the price) straight from here, the rest from ARCIA
      const toHuman = m.reply_to_message && m.reply_to_message.from && !m.reply_to_message.from.is_bot && m.reply_to_message.from.id !== m.from.id;
      const on = assistOn(c, m.chat), qn = !m.photo && looksLikeQuestion(text);
      if (on && qn) {
        const ql = langOf(text, lang), kind = faqOf(text);
        if (kind) { if (!tooMany(`faq:${m.chat.id}:${kind}`, 1, 45e3)) { groupSeen(m, `faq:${kind}`); return faqReply(m, kind, ql); } groupSeen(m, `faq:${kind}:cooldown`); return; }
        if (toHuman) groupSeen(m, "reply-to-someone-else");
        else if (tooMany(`assist:${m.chat.id}`, 30, 600e3) || tooMany(`assistu:${m.chat.id}:${uid}`, 3, 180e3)) groupSeen(m, "assist:rate-limit");
        else { groupSeen(m, "assist"); return answer(m, text, { lang: ql, group, assist: true }); }
      } else groupSeen(m, !on ? "assist-off" : m.photo ? "photo" : "not-a-question");
      await autoScan(c, m, lang); return;
    }
    groupSeen(m, mention ? "mention" : "reply-to-arcia");
    q = text.replace(new RegExp(`@${bot.username}\\b`, "ig"), "").trim() || (m.photo ? "" : "hi");
  } else if (!m.photo) {
    // a bare contract address in a DM: scan it
    const only = text.match(/^\s*(0x[0-9a-fA-F]{40})\s*$/);
    if (only) return scanWithProgress(m, lc(only[1]), lang);
  }
  const image = m.photo ? await fileBase64(m.photo[m.photo.length - 1].file_id).catch(() => null) : null;
  return answer(m, q, { lang, group, image });
}
// ---------------- v7: the home group's assistant ----------------
const QWORDS = /^(what|what's|whats|how|when|where|why|who|which|is|are|can|could|does|do|did|will|should|wen|anyone|any\s+update|pls|please)\b/i;
/// a question: a question mark, a question word first, or (Korean / Chinese) a question ending or keyword
function looksLikeQuestion(t) {
  t = String(t || "").trim();
  if (t.length < 3 || t.length > 700 || /^\/|^0x[0-9a-fA-F]{40}$/.test(t)) return false;
  if (/[?？]/.test(t)) return true;
  if (QWORDS.test(t)) return true;
  if (/[가-힣]/.test(t) && /(뭐|무엇|어떻게|언제|어디|왜|누구|있나요|인가요|나요|까요|건가요|맞나요|알려|주소|사이트|홈페이지|컨트랙트|씨에이)/.test(t)) return true;
  if (/[\u4e00-\u9fff]/.test(t) && /(什么|怎么|如何|哪里|为什么|吗|呢|合约|网站|地址|价格)/.test(t)) return true;
  return /^(ca|contract|website|links?|chart)\b/i.test(t);
}
const langOf = (t, fb) => (/[가-힣]/.test(t) ? "ko" : /[\u4e00-\u9fff]/.test(t) ? "zh" : fb || "en");
/// the questions with one right answer — contract addresses, the official links, how to buy, the price
function faqOf(t) {
  const s = String(t || "").toLowerCase();
  if (/\b(ca|contract|contract address|token address)\b|컨트랙트|씨에이|合约/.test(s) || (/(주소|\baddress\b|地址)/.test(s) && /(arcircle|arcia|토큰|코인|token|代币)/.test(s))) return "ca";
  if (/\b(how (do i|to|can i|i can) buy|where (to|can i|do i) buy|how to get)\b|어디서 사|어떻게 사|구매 방법|사는 법|매수 방법|怎么买|在哪买|如何购买/.test(s)) return "buy";
  if (/\b(website|web site|homepage|official (site|links?)|links?|socials?|twitter|x account)\b|웹사이트|사이트|홈페이지|링크|공식|网站|官网|链接/.test(s)) return "site";
  if (/\b(price|chart|mcap|market cap|marketcap)\b|가격|시세|차트|시총|价格|行情|市值/.test(s)) return "price";
  return null;
}
async function faqReply(m, kind, lang) {
  const rp = { reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true } };
  const safe = T3(lang, "🛡 Only trust addresses from arcircle.app or this bot. The team never DMs you first.", "🛡 arcircle.app이나 이 봇이 알려준 주소만 믿으세요. 팀은 먼저 DM하지 않아요.", "🛡 只相信 arcircle.app 或本机器人给出的地址。团队绝不会先私信你。");
  if (kind === "price") return sendCard(m.chat.id, await cardPrice(lang), { replyTo: m.message_id });
  if (kind === "ca") return tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", text: `<b>${T3(lang, "The only two official coins:", "공식 코인은 이 두 개뿐이에요:", "官方币只有这两个：")}</b>\n\n${cardCA()}\n\n${safe}`, ...rp,
    ...kb([[{ text: "$ARCIRCLE", url: `${SITE}/arcircle` }, { text: "$ARCIA (Pons)", url: ARCIA_RH_BUY }], [{ text: "arcircle.app", url: SITE }]]) });
  if (kind === "site") return tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", ...rp, text: [
    `🌐 <b>${T3(lang, "ARCIRCLE — official links", "ARCIRCLE 공식 링크", "ARCIRCLE 官方链接")}</b>`,
    `${T3(lang, "Website", "웹사이트", "官网")}: ${SITE.replace("https://www.", "")}`,
    `ArcPad — ${T3(lang, "launch and trade on Arc", "Arc에서 런칭·거래", "在 Arc 上发币和交易")}: arcircle.app/arc`,
    `CirclePad — ${T3(lang, "crowdfunded rounds", "크라우드펀딩 라운드", "众筹轮次")}: arcircle.app/circle`,
    `ARCIRCLE Orders — ${T3(lang, "limit, stop and grid orders", "지정가·스탑·그리드 주문", "限价、止损和网格订单")}: arcircle.app/arc#orders`,
    `$ARCIRCLE: arcircle.app/arcircle · ${T3(lang, "Reward", "리워드", "奖励")}: arcircle.app/reward`,
    `X: x.com/ARCIRCLEonArc · ARCIA: t.me/ARCIAonArc_bot`, "", safe].join("\n"),
    ...kb([[{ text: "arcircle.app", url: SITE }, { text: "X", url: "https://x.com/ARCIRCLEonArc" }], [{ text: "ARCIRCLE Orders", url: `${SITE}/arc#orders` }, { text: "CirclePad", url: `${SITE}/circle` }]]) });
  // buy
  return tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", ...rp, text: [
    `🛒 <b>${T3(lang, "How to buy", "구매 방법", "如何购买")}</b>`,
    `♾️ <b>$ARCIRCLE</b> — ${T3(lang, "on Arc: open arcircle.app/arcircle and swap with USDC (or set your own price with ARCIRCLE Orders). On Robinhood Chain it arrives through ARCIRCLE OMNI.", "Arc에서: arcircle.app/arcircle 에서 USDC로 스왑(또는 ARCIRCLE Orders로 원하는 가격에 주문). Robinhood Chain에는 ARCIRCLE OMNI로 옮겨옵니다.", "在 Arc 上：打开 arcircle.app/arcircle 用 USDC 兑换（或用 ARCIRCLE Orders 设置你的价格）。在 Robinhood Chain 上通过 ARCIRCLE OMNI 跨链。")}`,
    `💙💚 <b>$ARCIA</b> — ${T3(lang, "on Robinhood Chain, through Pons:", "Robinhood Chain에서 Pons로:", "在 Robinhood Chain 上通过 Pons：")} ${ARCIA_RH_BUY.replace("https://www.", "")}`,
    "", T3(lang, "Check the contract address (/ca) before you buy. Not financial advice.", "사기 전에 컨트랙트 주소(/ca)를 꼭 확인하세요. 투자 조언이 아닙니다.", "购买前请核对合约地址（/ca）。并非投资建议。")].join("\n"),
    ...kb([[{ text: "$ARCIRCLE", url: `${SITE}/arcircle` }, { text: "$ARCIA (Pons)", url: ARCIA_RH_BUY }], [{ text: "ARCIRCLE Orders", url: `${SITE}/arc#orders` }]]) });
}
async function setTarget(c, chat, on) {
  c.targets = c.targets.filter((t) => t.id !== chat.id);
  if (on) c.targets.push({ id: chat.id, title: chat.title || chat.username || String(chat.id), type: chat.type });
  await saveCfg(c);
  if (chat.type === "channel") await tg("sendMessage", { chat_id: chat.id, text: on ? "✓ ARCIA will post announcements here." : "✓ No more announcements here." });
}
async function claimAdmin(c, m, arg) {
  if (isGroup(m.chat)) return say(m, "Send /admin CODE to me in a private chat.");
  if (tooMany(`claim:${m.from.id}`, 5, 3600e3)) return say(m, "Too many tries — ask for a new code later.");
  const cl = c.claim;
  if (!cl || Date.now() > cl.exp || String(arg).trim() !== cl.code) return say(m, "That code isn't valid (codes last 10 minutes and work once).");
  if (!c.admins.includes(m.from.id)) c.admins.push(m.from.id);
  c.claim = null;
  await saveCfg(c);
  await tg("setMyCommands", { commands: menu([...PUBLIC_CMDS.filter(([k]) => k !== "report"), ...ADMIN_CMDS]), scope: { type: "chat", chat_id: m.from.id } });
  return sendWithEffect({ chat_id: m.chat.id, parse_mode: "HTML", text: `✓ You're an ARCIA admin now (ID <code>${m.from.id}</code>). Try /status, or add me to your group as an admin and send /here there.` }, EFFECT.party);
}
async function start(c, m, arg, lang) {
  const p = String(arg || "");
  if (/^scan_0x[0-9a-fA-F]{40}$/.test(p)) return scanWithProgress(m, lc(p.slice(5)), lang);
  if (/^coin_0x[0-9a-fA-F]{40}$/.test(p)) return sendCard(m.chat.id, await cardCoin(lc(p.slice(5)), lang));
  if (/^drops_0x[0-9a-fA-F]{40}$/.test(p)) return sendCard(m.chat.id, await cardDrops(lc(p.slice(6)), lang));
  if (p === "link") return startLink(m, lang);
  if (p === "alerts") return setAlerts(m, true, lang);
  if (p === "mine") return setMineAlerts(m, true, lang);
  if (p === "solorders") return solOrdersWait(m, lang);
  if (p === "stake") return setStakeAlerts(m, true, lang); // v2: the Staking page's "On Telegram"
  if (/^v[m]?\d+$/.test(p)) { // holder-gate "Verify": v<chat id with the minus as m>
    const chatId = Number(p.slice(1).replace(/^m/, "-"));
    const cc = chatCfg(c, chatId);
    const hold = await holdsEnough(m.from.id, cc.gate || 0);
    if (!hold.linked) return startLink(m, lang);
    if (!hold.ok) return say(m, `You hold ${compact(hold.bal || 0)} $ARCIRCLE — this group needs ${compact(cc.gate)}+.`);
    const r = await tg("restrictChatMember", { chat_id: chatId, user_id: m.from.id, permissions: OPEN });
    return sendWithEffect({ chat_id: m.chat.id, text: r.ok ? "✓ Verified — welcome in 💙💚" : `Couldn't open the group for you: ${r.description || "unknown"}` }, r.ok ? EFFECT.party : null);
  }
  const cap = w("start", lang);
  const buttons = [[{ text: "📈 Price", callback_data: "mn:price" }, { text: "🟢 Round", callback_data: "mn:round" }], [{ text: "🚀 Launches", callback_data: "mn:launches" }, { text: "💙 ARCIA 402", callback_data: "mn:books" }],
    [{ text: "🔔 Alerts", callback_data: "mn:alerts" }, { text: "🔗 Link wallet", callback_data: "mn:link" }], [{ text: "Open ArcPad", url: `${SITE}/arc` }, { text: "X @ARCIAonArc", url: "https://x.com/ARCIAonArc" }]];
  const r = await tg("sendAnimation", { chat_id: m.chat.id, animation: `${SITE}/images/arcia-hello.mp4`, caption: cap, ...kb(buttons) });
  if (!r.ok) { const r2 = await tg("sendPhoto", { chat_id: m.chat.id, photo: `${SITE}/images/arcia-banner2-900.jpg`, caption: cap, ...kb(buttons) }); if (!r2.ok) await tg("sendMessage", { chat_id: m.chat.id, text: cap, ...kb(buttons) }); }
}
async function help(c, m, lang) {
  const admin = c.admins.includes(m.from.id);
  const lines = [`<b>${w("help", lang)}</b>`, "", ...PUBLIC_CMDS.map(([k, d]) => `/${k} — ${h(d)}`), "", T3(lang, "Or just talk to me, send a contract address, or a picture~", "그냥 말을 걸거나, 컨트랙트 주소나 사진을 보내도 돼요~", "也可以直接和我聊天,发合约地址或图片~")];
  if (isGroup(m.chat)) lines.push(w("groupHint", lang));
  if (admin) lines.push("", "<b>Admin</b>", ...ADMIN_CMDS.map(([k, d]) => `/${k} — ${h(d)}`));
  return say(m, lines.join("\n"), kb([[{ text: "ArcPad", url: `${SITE}/arc` }, { text: "CirclePad", url: `${SITE}/circle` }], [{ text: "ARCIA 402", url: `${SITE}/arc#arcia402` }, { text: "X @ARCIAonArc", url: "https://x.com/ARCIAonArc" }]]));
}

// ---------------- buttons ----------------
async function onCallback(q) {
  const c = await loadCfg(), data = String(q.data || ""), msg = q.message;
  const ack = (text, alert) => tg("answerCallbackQuery", { callback_query_id: q.id, ...(text ? { text, show_alert: !!alert } : {}) }, 5000);
  const lang = msg && isGroup(msg.chat) ? chatCfg(c, msg.chat.id).lang || "en" : ((await loadUser(q.from.id)).lang || "en");
  if (data.startsWith("rf:")) {
    if (tooMany(`rf:${q.from.id}`, 6, 60e3)) return ack("One moment~");
    const [, kind, arg] = data.split(":");
    ack("Refreshing…");
    const card = await cardFor(kind, arg, lang, q.from.id);
    if (card) await editCard(msg, card);
    return;
  }
  if (data.startsWith("lp:")) { ack(); return editCard(msg, await cardLaunches(Number(data.slice(3)), lang)); }
  if (data.startsWith("cap:")) {
    const who = Number(data.slice(4));
    if (q.from.id !== who) return ack("This button is for the new member 💙", true);
    await tg("restrictChatMember", { chat_id: msg.chat.id, user_id: who, permissions: OPEN });
    await tg("deleteMessage", { chat_id: msg.chat.id, message_id: msg.message_id });
    ack("Welcome in 💙");
    return welcome(msg.chat.id, q.from, lang);
  }
  if (data.startsWith("mn:")) { // the /start menu
    ack();
    const kind = data.slice(3), fake = { chat: msg.chat, from: q.from, message_id: msg.message_id };
    if (kind === "alerts") return setAlerts(fake, true, lang);
    if (kind === "link") return startLink(fake, lang);
    if (kind === "launches") return sendCard(msg.chat.id, await cardLaunches(0, lang));
    return sendCard(msg.chat.id, await cardFor(kind, "", lang, q.from.id));
  }
  if (/^(md|mb):/.test(data)) { // from a /report DM
    if (!c.admins.includes(q.from.id)) return ack("Admins only", true);
    const [k, chat, x] = data.split(":");
    const r = k === "md" ? await tg("deleteMessage", { chat_id: Number(chat), message_id: Number(x) }) : await tg("banChatMember", { chat_id: Number(chat), user_id: Number(x) });
    return ack(r.ok ? (k === "md" ? "Deleted" : "Banned") : `Couldn't: ${r.description || ""}`, !r.ok);
  }
  // admin previews: go / no / re (rewrite)
  const [act, id] = data.split(":");
  if (!["go", "no", "re"].includes(act)) return ack();
  if (!c.admins.includes(q.from.id)) return ack("Admins only", true);
  const pend = (await getDoc(DOC.pending)) || {}, p = pend[id];
  if (!p) return ack("Already handled or expired");
  const edit = (text) => (msg.photo ? tg("editMessageCaption", { chat_id: msg.chat.id, message_id: msg.message_id, caption: text.slice(0, 1024) }) : tg("editMessageText", { chat_id: msg.chat.id, message_id: msg.message_id, text: text.slice(0, 4000), link_preview_options: { is_disabled: true } }));
  if (act === "re") {
    ack("Rewriting…");
    const t2 = await arciaWrite(p.kind, p.note || p.text);
    if (!t2) return;
    p.text = t2; pend[id] = p; await putDoc(DOC.pending, pend);
    return tg(msg.photo ? "editMessageCaption" : "editMessageText", { chat_id: msg.chat.id, message_id: msg.message_id, [msg.photo ? "caption" : "text"]: `${p.kind === "tweet" ? "🐦 Draft for X (@ARCIAonArc)" : "📣 Preview"}\n\n${t2}`, ...kb([[{ text: p.kind === "tweet" ? "✓ Post on X" : "✓ Post it", callback_data: `go:${id}` }, { text: "Cancel", callback_data: `no:${id}` }], [{ text: "↻ Rewrite", callback_data: `re:${id}` }]]) });
  }
  delete pend[id]; await putDoc(DOC.pending, pend);
  if (act === "no") { ack("Cancelled"); return edit("Cancelled."); }
  if (p.kind === "tweet") {
    try { const tid = await postTweet(p.text); ack("Posted on X"); return edit(`✓ Posted on X: https://x.com/ARCIAonArc/status/${tid}\n\n${p.text}`); }
    catch (e) { ack("X refused it", true); return edit(`X refused it: ${String(e.message || e).slice(0, 200)}\n\n${p.text}`); }
  }
  ack("Posting…");
  const ok = await postToTargets(c, p);
  return edit(`✓ Posted to ${ok}/${c.targets.length} chats.\n\n${p.kind === "poll" ? p.question : p.text}`);
}

// ---------------- inline mode: "@ARCIAonArc_bot 0x…" in any chat ----------------
async function onInline(iq) {
  const qtext = String(iq.query || "").trim(), ca = addrOf(qtext);
  const results = [];
  if (ca) {
    const r = await scanner.apiResult(ca, { store: store() }).catch(() => null);
    if (r && r.score != null) results.push({ type: "article", id: "scan" + ca.slice(2, 12), title: `${r.symbol ? "$" + r.symbol : short(ca)} · ${r.score}/100 · ${r.verdict || ""}`, description: [...(r.critical || []).map((t) => "Critical: " + t), ...(r.reasons || []).map((x) => x.title || x)].slice(0, 2).join(" · ") || "Token Scanner",
      thumbnail_url: `${SITE}/images/arcia-avatar-96.jpg`, input_message_content: { message_text: `🔍 <b>${h(r.symbol ? "$" + r.symbol : short(ca))}</b> · ${r.score}/100 · ${h(r.verdict || "")}\n${[...(r.critical || []).map((t) => `🛑 Critical: ${h(t)}`), ...(r.reasons || []).map((x) => `• ${h(x.title || x)}`)].slice(0, 3).join("\n")}\n<a href="${SITE}/s/${ca}">Full report</a> · scanned by ARCIA`, parse_mode: "HTML", link_preview_options: { url: `${SITE}/s/${ca}`, prefer_large_media: true } },
      reply_markup: { inline_keyboard: [[{ text: "Full report", url: `${SITE}/s/${ca}` }, { text: "Ask ARCIA", url: `${BOT_URL}?start=scan_${ca}` }]] } });
  }
  const L = await live(SITE).catch(() => null);
  if (L) results.push({ type: "article", id: "price", title: `$ARCIRCLE ${fmtPrice(L.price)}`, description: `Market cap ${fmtUsd(L.mcap)} · holders ${num(L.holders)}`, thumbnail_url: `${SITE}/images/arcia-avatar-96.jpg`,
    input_message_content: { message_text: `<b>$ARCIRCLE</b> ${fmtPrice(L.price)}${L.change24h != null ? ` (${L.change24h >= 0 ? "+" : ""}${L.change24h.toFixed(2)}% 24h)` : ""}\nMarket cap ${fmtUsd(L.mcap)} · holders ${num(L.holders)}\n<a href="${SITE}/arc#arcircle">arcircle.app</a>`, parse_mode: "HTML" } });
  return tg("answerInlineQuery", { inline_query_id: iq.id, results, cache_time: 30, button: { text: "Talk to ARCIA", start_parameter: "hi" } });
}

// ---------------- Builder Mine: /mine and the tick's announcements ----------------
async function mineList(m) {
  const MM = await import("./_mine.mjs");
  if (!MM.live()) return say(m, `⛏ <b>Builder Mine</b> opens soon. Try the practice mine now: ${SITE}/arc#mine`);
  const list = (await MM.listView().catch(() => [])).filter((x) => x.status === "live" || x.status === "soon").slice(0, 6);
  if (!list.length) return say(m, `⛏ No mine is open right now. Open one for your token: ${SITE}/arc#mine`);
  const left = (s) => (s > 86400 ? Math.floor(s / 86400) + "d" : Math.floor(s / 3600) + "h");
  const lines = list.map((x) => `• <b>$${h(x.token.symbol)}</b>${x.info && x.info.name ? " — " + h(x.info.name) : ""} · layer ${x.layer + 1}/6 · ${x.builders} builders · ${x.status === "soon" ? "opens in " + left(x.start - Math.floor(Date.now() / 1000)) : left(x.end - Math.floor(Date.now() / 1000)) + " left"}`);
  return say(m, `⛏ <b>Builder Mine</b>\n${lines.join("\n")}\n\nJoin with 1 USDC worth of $ARCIRCLE (burned) and dig in your browser.`, kb(list.slice(0, 3).map((x) => [{ text: `Enter $${x.token.symbol}`, url: `${SITE}/mine/${x.id}` }])));
}
// ---------------- ARCIRCLE Orders (api/_orders.mjs): read-only — nothing here places, fills or cancels an order ----------------
const ORDER_TYPE = { limit: "Limit", stop: "Stop", trail: "Trailing stop", twap: "Timed" };
async function cardOrders(u, lang) {
  if (!u.wallet) return { text: T3(lang, "Link your wallet first — /link (one signature, no transaction).", "먼저 지갑을 연결해 주세요 — /link (서명 한 번, 거래 없음)", "请先绑定钱包 — /link(一次签名,无交易)") };
  // both chains: Arc, and Robinhood Chain (ArcircleOrdersNative)
  const [da, dr] = await Promise.all([ORD.ARC, ORD.RH].map((X) => X.mine(u.wallet, { store: store() }).catch(() => null)));
  const tag = (l, rh) => l.map((o) => ({ ...o, rh }));
  const open = [...tag((da && da.orders) || [], false), ...tag((dr && dr.orders) || [], true)].filter((o) => o.status === "open" || o.status === "unfunded");
  const amt = (o) => (o.side === "sell" ? Number(o.sellAmount) : Number(o.buyAmount) / 0.999) / 10 ** ((o.token && o.token.decimals) || 18);
  const lines = open.slice(0, 8).map((o) => `• ${o.side === "buy" ? "Buy" : "Sell"} · ${ORDER_TYPE[o.type] || o.type} · ${compact(amt(o))} $${h((o.token && o.token.symbol) || "?")} @ ${fmtPrice(o.trigger && o.trigger.price ? o.trigger.price : o.price)}${o.rh ? " ETH · Robinhood" : ""}${o.filledPct ? ` · ${o.filledPct}% filled` : ""}${o.status === "unfunded" ? " · ⚠️ needs balance or approval" : ""}`);
  return {
    text: [`📒 <b>ARCIRCLE Orders</b> · <code>${short(u.wallet)}</code>`, open.length ? `${open.length} ${T3(lang, "open", "개 열림", "个挂单")}` : T3(lang, "No open orders.", "열린 주문이 없어요.", "暂无挂单。"), ...lines,
      "", `<i>${T3(lang, "Fill alerts: /orderalerts on", "체결 알림: /orderalerts on", "成交提醒:/orderalerts on")}</i>`].join("\n"),
    buttons: [[{ text: "ARCIRCLE Orders", url: `${SITE}/arc#orders` }]],
  };
}
async function setOrderAlerts(m, on, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const u = await loadUser(m.from.id);
  if (on && !u.wallet) return startLink(m, lang);
  const s = await subs(), wa = lc(u.wallet || "");
  s.orders = s.orders || {};
  for (const k of Object.keys(s.orders)) { s.orders[k] = s.orders[k].filter((x) => x !== m.from.id); if (!s.orders[k].length) delete s.orders[k]; }
  if (on && wa) s.orders[wa] = [...(s.orders[wa] || []), m.from.id];
  await putDoc(DOC.subs, s);
  return say(m, on ? `📒 ${T3(lang, "Order alerts on for", "주문 알림을 켰어요:", "已为此钱包开启订单提醒:")} <code>${short(wa)}</code> — ${T3(lang, "fills, triggered stops and cancelled legs. /orderalerts off to stop.", "체결, 스탑 발동, 취소된 반대 주문을 알려드려요. 끄려면 /orderalerts off", "成交、止损触发和被取消的另一腿都会通知你。/orderalerts off 关闭")}` : `📒 ${T3(lang, "Order alerts off.", "주문 알림을 껐어요.", "订单提醒已关闭。")}`);
}
async function setStakeAlerts(m, on, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const u = await loadUser(m.from.id);
  if (on && !u.wallet) return startLink(m, lang);
  const s = await subs(), wa = lc(u.wallet || "");
  s.stake = s.stake || {};
  for (const k of Object.keys(s.stake)) { s.stake[k] = s.stake[k].filter((x) => x !== m.from.id); if (!s.stake[k].length) delete s.stake[k]; }
  if (on && wa) s.stake[wa] = [...(s.stake[wa] || []), m.from.id];
  await putDoc(DOC.subs, s);
  return say(m, on ? `🔒 ${T3(lang, "Staking alerts on for", "스테이킹 알림을 켰어요:", "已为此钱包开启质押提醒:")} <code>${short(wa)}</code> — ${T3(lang, "your USDC each new week, the pot being funded, the vote's last day, and reminders 30, 7 and 1 days before your lock ends. /stakealerts off to stop.", "새 주마다 받을 USDC, 보상 펀딩, 투표 마지막 날, 락업 종료 30일·7일·1일 전 알림을 보내드려요. 끄려면 /stakealerts off", "每周可领取的 USDC、奖池注资、投票最后一天,以及锁仓到期前 30 天、7 天和 1 天的提醒。/stakealerts off 关闭")}` : `🔒 ${T3(lang, "Staking alerts off.", "스테이킹 알림을 껐어요.", "质押提醒已关闭。")}`);
}
/// ARCIRCLE Staking: when a new week starts, the week that ended in one line to the alert list, and to each
/// subscribed staker what they can claim. v2: also this browser (Web Push topic stake-0x…) for every staker; reminders
/// 30, 7 and 1 days before a lock ends; the vote's last day for stakers who haven't voted; and a new funding of the pot
async function stakeNotify(T, s, out) {
  const st = await STK.state({ store: store() }).catch(() => null);
  if (!st || !st.live) return;
  T.stake = T.stake || {};
  const first = !T.stake.week;
  const subs0 = s.stake || {};
  const stakers = (st.stakers || []).slice(0, 200);
  const all = [...new Set([...Object.keys(subs0), ...stakers.map((x) => x.a)])].slice(0, 300);
  const push = WP.vapid();
  /// one message to a wallet: its Telegram subscribers and its browsers
  const tell = async (wa, text, p, btn = "Open staking") => {
    for (const id of subs0[wa] || []) { await tg("sendMessage", { chat_id: id, parse_mode: "HTML", text, ...kb([[{ text: btn, url: `${SITE}/arc#staking` }]]) }, 6000).catch(() => null); out.stakeDm = (out.stakeDm || 0) + 1; }
    if (push) out.stakePush = (out.stakePush || 0) + (await WP.toTopic(store(), WP.stakeTopic(wa), { ...p, url: "/arc#staking", tag: p.tag || "stake" }).catch(() => 0));
  };
  if (T.stake.week !== st.week) {
    const prevWeek = T.stake.week;
    T.stake.week = st.week; T.stake.voteRem = null;
    if (!first) {
      const ended = (st.weeks || []).find((x) => x.week === prevWeek) || null;
      const res = st.votes && st.votes[1] && st.votes[1].pools[0];
      const lines = [`🔒 <b>ARCIRCLE Staking · a new week</b>`,
        ended && ended.usdc > 0 ? `Last week paid <b>$${ended.usdc.toFixed(2)}</b> to veARCIRCLE holders.` : null,
        res ? `Pool vote winner: <b>${res.sym ? "$" + h(res.sym) : short(res.poolId)}</b>` : null,
        `${num(Math.round(st.totals.locked))} $ARCIRCLE locked · ${st.totals.stakers} stakers`,
        `This week's vote is open.`].filter(Boolean);
      out.stakeWeek = await toSubs(s.alerts || [], { text: lines.join("\n"), ...kb([[{ text: "Stake / vote", url: `${SITE}/arc#staking` }]]) });
      const now0 = await STK.walletsNow(all).catch(() => ({}));
      for (const wa of all) {
        const c = now0[wa] && now0[wa].claimable;
        if (!(c > 0.005)) continue;
        await tell(wa, `💵 <b>$${c.toFixed(2)} USDC</b> to claim from ARCIRCLE Staking — <code>${short(wa)}</code>`, { title: `$${c.toFixed(2)} USDC to claim`, body: "ARCIRCLE Staking: last week's rewards are ready.", tag: "stake-claim" }, "Claim");
      }
    }
  }
  // v2: the pot funded — once per funding
  const f0 = (st.funded || [])[0];
  if (f0 && f0.tx && T.stake.fundTx !== f0.tx) {
    const was = T.stake.fundTx; T.stake.fundTx = f0.tx;
    if (was && f0.w === st.week) {
      out.stakeFund = await toSubs(Object.values(subs0).flat().filter((v, i, a) => a.indexOf(v) === i), { text: `💧 <b>ARCIRCLE Staking</b> · this week's pot is now <b>$${Number(st.pot || 0).toFixed(2)} USDC</b> (+$${Number(f0.a).toFixed(2)}).`, ...kb([[{ text: "Open staking", url: `${SITE}/arc#staking` }]]) });
    }
  }
  const now = Math.floor(Date.now() / 1000);
  // v2: reminders 30, 7 and 1 days before a lock ends (not for max locks), once each
  T.stake.rem = T.stake.rem || {};
  for (const wa of all) {
    let x = stakers.find((y) => y.a === wa);
    if (!x && subs0[wa]) { const l = await STK.lockOf(wa).catch(() => null); x = l && l.amount > 0 ? { a: wa, end: l.end, max: l.max } : null; }
    if (!x || x.max || !x.end || x.end <= now) continue;
    const left = x.end - now, stage = left <= 86400 ? "1d" : left <= 7 * 86400 ? "7d" : left <= 30 * 86400 ? "30d" : null;
    const k = `${x.end}:${stage}`;
    if (!stage || T.stake.rem[wa] === k) continue;
    const firstSeen = T.stake.rem[wa] == null;
    T.stake.rem[wa] = k;
    if (firstSeen && stage === "30d" && left < 29 * 86400) continue; // don't announce a stage we came in late to
    const when = stage === "1d" ? "tomorrow" : stage === "7d" ? "in a week" : "in 30 days";
    await tell(wa, `⏳ Your ARCIRCLE Staking lock (<code>${short(wa)}</code>) ends ${when}. Extend it to keep your veARCIRCLE and your share of the weekly USDC — or withdraw once it ends.`, { title: `Your lock ends ${when}`, body: "Extend it to keep your veARCIRCLE and weekly USDC.", tag: "stake-end" });
  }
  // v2: the vote's last day — stakers with veARCIRCLE who haven't voted this week
  const remain = (st.nextWeek || 0) - now;
  if (remain > 0 && remain < 86400 && T.stake.voteRem !== st.week) {
    T.stake.voteRem = st.week;
    const now0 = await STK.walletsNow(all).catch(() => ({}));
    for (const wa of all) {
      const x = stakers.find((y) => y.a === wa);
      if (!x || !(x.ve > 0) || !now0[wa] || now0[wa].voted) continue;
      await tell(wa, `🗳 The ARCIRCLE Staking pool vote closes in under a day — split your veARCIRCLE across the pools you want ARCIRCLE PAD to back.`, { title: "The pool vote closes in under a day", body: "Your veARCIRCLE is your vote — it costs nothing but gas.", tag: "stake-vote" }, "Vote");
    }
  }
}
/// /vearcia — the veARCIA pool (rewards per day, staked, stakers, burned) and, with a linked wallet, its stake
async function cardVea(m, lang) {
  const st = await VEA.state().catch(() => null);
  const btn = [[{ text: "veARCIA", url: `${SITE}/arc#vearcia` }]];
  if (!st || !st.live) return { text: `💗 <b>veARCIA</b>\n${T3(lang, "Stake $ARCIA on Robinhood Chain for 1–20 days — opening soon.", "Robinhood Chain에서 $ARCIA를 1–20일 스테이킹 — 곧 오픈해요.", "在 Robinhood Chain 质押 $ARCIA 1–20 天——即将开放。")}`, buttons: btn };
  const t = st.totals;
  const lines = [`💗 <b>veARCIA</b> · Robinhood Chain`,
    `${T3(lang, "Rewards today", "오늘 보상", "今日奖励")}: <b>${num(Math.round(t.perDay))} $ARCIA</b> · ${T3(lang, "pool", "풀", "奖励池")} ${num(Math.round(t.pool))}`,
    `${T3(lang, "Staked", "스테이킹", "质押")}: ${num(Math.round(t.staked))} $ARCIA · ${num(Math.round(t.ve))} veARCIA · ${t.stakers} ${T3(lang, "stakers", "명", "人")}`,
    `🔥 ${T3(lang, "Burned by early exits", "조기 출금 소각", "提前退出销毁")}: ${num(Math.round(t.burned))} $ARCIA`];
  const u = m && m.from ? await loadUser(m.from.id).catch(() => null) : null;
  if (u && u.wallet) {
    const me = await VEA.me(u.wallet).catch(() => null);
    const p = me && me.position;
    if (p && p.amount > 0) {
      const now = Math.floor(Date.now() / 1000);
      lines.push("", `<code>${short(u.wallet)}</code>: <b>${num(Math.round(p.ve))} veARCIA</b>${me.veTier ? ` · ${VEA.VE_TIERS[me.veTier][0]}` : ""} · #${me.rank || "—"}`,
        `${num(Math.round(p.amount))} $ARCIA · ${(p.lockBps / 10000).toFixed(2)}x${p.tier ? ` × ${[1, 1.2, 1.5, 2][p.tier]}x` : ""} · ${p.auto ? T3(lang, "auto-renew", "자동 연장", "自动续期") : p.end > now ? `${T3(lang, "unlocks in", "해제까지", "解锁")} ${Math.ceil((p.end - now) / 3600)}h` : T3(lang, "unlocked", "해제됨", "已解锁")}`,
        `${T3(lang, "To claim", "받을 보상", "可领取")}: <b>${num(Math.round(Number(me.earned[0] || 0) / 1e18))} $ARCIA</b>`);
      btn[0].push({ text: T3(lang, "Share", "공유", "分享"), url: `${SITE}/vearcia/${lc(u.wallet)}` });
    }
  }
  return { text: lines.join("\n"), buttons: btn };
}
async function setVeaAlerts(m, on, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const u = await loadUser(m.from.id);
  if (on && !u.wallet) return startLink(m, lang);
  const s = await subs(), wa = lc(u.wallet || "");
  s.vea = s.vea || {};
  for (const k of Object.keys(s.vea)) { s.vea[k] = s.vea[k].filter((x) => x !== m.from.id); if (!s.vea[k].length) delete s.vea[k]; }
  if (on && wa) s.vea[wa] = [...(s.vea[wa] || []), m.from.id];
  await putDoc(DOC.subs, s);
  return say(m, on ? `💗 ${T3(lang, "veARCIA alerts on for", "veARCIA 알림을 켰어요:", "已为此钱包开启 veARCIA 提醒:")} <code>${short(wa)}</code> — ${T3(lang, "a day before your lock ends and before your $ARCIRCLE boost runs out. /vearciaalerts off to stop.", "락 종료 하루 전, $ARCIRCLE 부스트 만료 전에 알려드려요. 끄려면 /vearciaalerts off", "锁定结束前一天、$ARCIRCLE 加成到期前提醒你。/vearciaalerts off 关闭")}` : `💗 ${T3(lang, "veARCIA alerts off.", "veARCIA 알림을 껐어요.", "veARCIA 提醒已关闭。")}`);
}
/// veARCIA: once a UTC day, the pool in one line to the alert list (and on Mondays to X); reminders a day before a
/// subscriber's lock ends and before their boost runs out (once each)
async function veaNotify(T, s, out) {
  const st = await VEA.state().catch(() => null);
  if (!st || !st.live) return;
  T.vea = T.vea || {};
  const day = new Date().toISOString().slice(0, 10), t = st.totals;
  if (T.vea.day !== day) {
    const first = !T.vea.day;
    T.vea.day = day;
    if (!first && t.stakers > 0) {
      const d = st.dist; // v2: the stakers as a whole, no wallet named
      const text = [`💗 <b>veARCIA today</b>`, `${num(Math.round(t.perDay))} $ARCIA to stakers · ${num(Math.round(t.staked))} staked by ${t.stakers}`, d && d.staked > 0 ? `Average lock ${d.avgLock.toFixed(1)} days · ${Math.round((d.auto.staked / d.staked) * 100)}% on auto-renew` : null, `🔥 ${num(Math.round(t.burned))} $ARCIA burned by early exits`].filter(Boolean).join("\n");
      out.veaDay = await toSubs(s.alerts || [], { text, ...kb([[{ text: "Stake $ARCIA", url: `${SITE}/arc#vearcia` }]]) });
      if (new Date().getUTCDay() === 1) {
        try { await postTweet(`veARCIA this week 💗\n\n${num(Math.round(t.perDay))} $ARCIA a day streams to ${t.stakers} stakers on Robinhood Chain · ${num(Math.round(t.staked))} $ARCIA staked · ${num(Math.round(t.burned))} burned by early exits.\n\nStake 1–20 days, up to 2x for long locks and 2x more with $ARCIRCLE: ${SITE}/arc#vearcia`); out.veaX = true; } catch (e) { out.veaX = String(e.message || e).slice(0, 80); }
      }
    }
  }
  T.vea.rem = T.vea.rem || {};
  const now = Math.floor(Date.now() / 1000);
  for (const [wa, ids] of Object.entries(s.vea || {}).slice(0, 300)) {
    const x = (st.stakers || []).find((y) => y.a === wa);
    if (!x) continue;
    if (!x.auto && x.end > now && x.end - now < 86400 && T.vea.rem[wa] !== x.end) {
      T.vea.rem[wa] = x.end;
      for (const id of ids) await tg("sendMessage", { chat_id: id, parse_mode: "HTML", text: `⏳ Your veARCIA lock (<code>${short(wa)}</code>) ends within a day. Renew it to keep your multiplier, or withdraw for free after it ends.`, ...kb([[{ text: "veARCIA", url: `${SITE}/arc#vearcia` }]]) });
    }
    const bk = wa + ":b";
    if (x.tier > 0 && x.boostUntil > now && x.boostUntil - now < 86400 && T.vea.rem[bk] !== x.boostUntil) {
      T.vea.rem[bk] = x.boostUntil;
      for (const id of ids) await tg("sendMessage", { chat_id: id, parse_mode: "HTML", text: `💎 Your $ARCIRCLE boost on veARCIA (<code>${short(wa)}</code>) runs out within a day — refresh it on the page to keep it.`, ...kb([[{ text: "Refresh boost", url: `${SITE}/arc#vearcia` }]]) });
    }
  }
}
/// /nft — the ARCIRCLE NFT Vault: what's in it, the next NFT, the open raffle, the last winner
async function cardNft(lang) {
  const st = await NFTV.state({ store: { get: async (k) => (await getDocs([k]))[k] } }).catch(() => null);
  if (!st || !st.live) return { text: `🖼 <b>ARCIRCLE NFT Vault</b>\n${T3(lang, "Opens soon on Robinhood Chain.", "Robinhood Chain에서 곧 열려요.", "即将在 Robinhood Chain 开放。")}`, buttons: [[{ text: "NFT Vault", url: `${SITE}/arc#nft` }]] };
  const e4 = (n) => `${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: n > 0 && n < 0.01 ? 5 : 4 })} ETH`;
  const open = (st.prizes || []).find((p) => p.status === "open"), won = (st.prizes || []).find((p) => p.status === "won");
  const left = open && open.raffle ? open.raffle.drawAfter - st.now : 0;
  const lines = [
    `🖼 <b>ARCIRCLE NFT Vault</b> · Robinhood Chain`,
    `${T3(lang, "In the vault", "볼트 잔액", "金库余额")}: <b>${e4(st.balance)}</b>${st.next ? ` / ${e4(st.next.price)} (${Math.round(Math.min(1, st.balance / (st.next.price || 1)) * 100)}%)` : ""}`,
    st.next ? `${T3(lang, "Next NFT", "다음 NFT", "下一个 NFT")}: <b>${h(st.next.name || short(st.next.collection))}${st.next.tokenId ? " #" + h(st.next.tokenId) : ""}</b>` : T3(lang, "Next NFT: the first collection is being chosen.", "다음 NFT: 첫 컬렉션을 고르는 중이에요.", "下一个 NFT:正在挑选第一个系列。"),
    `${T3(lang, "Fees in", "들어온 수수료", "累计手续费")}: ${e4(st.fees ? st.fees.total : 0)} · ${T3(lang, "bought", "구매", "已购")} ${st.bought || 0} · ${T3(lang, "won", "당첨", "已中奖")} ${st.won || 0}`,
    open ? `🎟 ${T3(lang, "Raffle", "추첨", "抽奖")} #${open.i}: ${left > 0 ? `${T3(lang, "draw in", "추첨까지", "距开奖")} <b>${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m</b>` : T3(lang, "drawing now", "지금 추첨 중", "正在开奖")}${open.raffle.holders ? ` · ${open.raffle.holders} ${T3(lang, "wallets", "지갑", "个钱包")}` : ""}` : "",
    won ? `🏆 ${T3(lang, "Last winner", "최근 당첨", "最近中奖")}: <code>${short(won.raffle && won.raffle.winner)}</code> · ${h(won.title || (won.name || "NFT") + " #" + won.tokenId)}` : "",
    "", T3(lang, "Hold or lock 1,000+ $ARCIRCLE on Arc to be in every draw — ARCIRCLE Staking raises your odds. $ARCIA is the NFT ecosystem's flagship token.", "Arc에서 $ARCIRCLE을 1,000개 이상 보유하거나 락업하면 모든 추첨에 들어가요 — ARCIRCLE Staking으로 확률이 올라가요. $ARCIA는 NFT 생태계의 대표 토큰이에요.", "在 Arc 上持有或锁仓 1,000+ $ARCIRCLE 即可参加每次抽奖——ARCIRCLE Staking 可提高中奖率。$ARCIA 是 NFT 生态的旗舰代币。"),
  ].filter((x) => x !== "");
  return { text: lines.join("\n"), photo: `${SITE}/api/og?nft=${open ? open.i : "vault"}`, buttons: [[{ text: "NFT Vault", url: `${SITE}/nft/vault` }, ...(open ? [{ text: `${T3(lang, "Raffle", "추첨", "抽奖")} #${open.i}`, url: `${SITE}/nft/${open.i}` }] : [])]] };
}
/// CirclePad: the current round's moments — open, 24 h / 6 h / 1 h left, closed, split, top contributor paid, launch &
/// airdrop done — to /alerts subscribers; the open, last hour, close and delivery also go to the announcement chats.
/// Flags are kept per round (T.cpr[n]), so Round #3's reminders don't depend on Round #1's.
async function circleNotify(T, s, c, first, out) {
  const R = await import("./_rounds.mjs");
  const d = await R.roundsData();
  const cur = d.rounds.find((r) => r.n === d.current);
  if (!cur || !cur.state || !cur.state.started) return;
  const st = cur.state, n = cur.n, nowS = Math.floor(Date.now() / 1000);
  T.cpr = T.cpr || {};
  // Round #1's alerts ran under the old single set of flags: don't repeat them
  if (!T.cpr[1] && T.round) T.cpr[1] = { open: 1, "24h": 1, "6h": 1, "1h": 1, closed: 1, split: 1, top: 1, launch: 1 };
  const F = (T.cpr[n] = T.cpr[n] || {});
  const raised = num(Number(BigInt(st.totalRaised || 0) / 10n ** 16n) / 100);
  const left = Number(st.deadline) - nowS;
  const page = `${SITE}/circle`;
  const plan = (n === 3) ? "The raise buys $ARCIA on Robinhood Chain for its contributors, plus an allocation of Round #4's Solana token." : "";
  const moments = [];
  if (left > 0) {
    if (!F.open && left > 70 * 3600 - 1800) moments.push(["open", `🟢 <b>CirclePad Round #${n} is open</b> — 72 hours, USDC on Arc. ${plan}`.trim(), true]);
    else if (!F.open) F.open = 1; // joined late: the start is old news
    // the tightest window we're in; the wider ones count as passed (no "24h left" with 40 minutes to go)
    const win = [["1h", 3600], ["6h", 6 * 3600], ["24h", 86400]].find(([, lim]) => left <= lim);
    if (win && !F[win[0]]) {
      const k = win[0];
      for (const w of ["24h", "6h", "1h"]) { if (w === k) break; F[w] = 1; }
      moments.push([k, `⏳ <b>${k} left</b> in CirclePad Round #${n} · ${raised} USDC raised`, k === "1h"]);
    }
  } else {
    for (const k of ["24h", "6h", "1h"]) F[k] = 1;
    if (!F.closed && left > -86400) moments.push(["closed", `🟢 <b>CirclePad Round #${n} has closed</b> — ${raised} USDC raised. Thank you 💙💚`, true]);
    else F.closed = 1;
    if (st.distributed && !F.split) moments.push(["split", `🔀 <b>Round #${n}: the escrow has split</b> — 80% recipient · 15% treasury · 5% platform, on-chain.`, false]);
    const m = cur.marks || {};
    if (m.top && !F.top) moments.push(["top", `🏅 <b>Round #${n}: the top contributor has been paid.</b>`, false]);
    if (m.launch && !F.launch) moments.push(["launch", `🎉 <b>Round #${n} is delivered</b> — ${n === 3 ? "$ARCIA is on its way to every contributor by their share" : "the coin is out and the airdrop is done"}. Check My Position on CirclePad.`, true]);
  }
  for (const [k, text, loud] of moments) {
    F[k] = 1;
    if (first) continue;
    const body = { text, ...kb([[{ text: "CirclePad", url: page }]]) };
    out["cp" + k] = await toSubs(s.alerts || [], body);
    if (loud && c && Array.isArray(c.targets) && c.targets.length) out["cp" + k + "Chats"] = await postToTargets(c, { text: text.replace(/<[^>]+>/g, "") + `\n\n${page}` });
  }
}
/// ARCIRCLE NFT Vault: the keeper's events (an NFT bought, a raffle open, a winner) to the alert list
async function nftNotify(T, s, out) {
  if (!NFTV.CFG.vault()) return;
  const store = { get: async (k) => (await getDocs([k]))[k] };
  const since = T.nftAt || Math.floor(Date.now() / 1000) - 3600;
  const evs = await NFTV.events(store, since);
  if (!evs.length) return;
  T.nftAt = Math.max(...evs.map((e) => e.at));
  const tx = (h) => `https://robinhoodchain.blockscout.com/tx/${h}`;
  for (const e of evs.slice(-3)) {
    const text = e.k === "buy" ? `🖼 <b>ARCIRCLE NFT Vault</b> bought <b>#${h(String(e.id))}</b> for <b>${Number(e.eth).toFixed(4)} ETH</b> — trading fees at work. A raffle for $ARCIRCLE holders opens next.`
      : e.k === "open" ? `🎟 <b>NFT raffle #${e.i} is open</b> — ${e.n} $ARCIRCLE wallets are in it, weighted by what they hold and lock. The draw is in 6 hours.`
      : e.k === "won" ? `🏆 <b>NFT raffle #${e.i}</b> — won by <code>${short(e.a)}</code>. The NFT is already in their wallet on Robinhood Chain.` : null;
    if (!text) continue;
    out.nft = (out.nft || 0) + await toSubs(s.alerts || [], { text: text + (e.tx ? `\n<a href="${tx(e.tx)}">tx ↗</a>` : ""), ...kb([[{ text: "NFT Vault", url: e.i != null ? `${SITE}/nft/${e.i}` : `${SITE}/arc#nft` }]]) });
  }
}
/// the executor's events → DMs to the makers who asked; and the team hears when the executor is low on gas or stuck
async function ordersNotify(T, s, c, out) {
  for (const X of [ORD.ARC, ORD.RH]) await ordersNotifyOn(X, T, s, c, out);
  await solOrdersLive(T, s, out).catch(() => null);
  await ordersDigest(T, s, out).catch((e) => { out.digestErr = String((e && e.message) || e).slice(0, 80); });
}
/// v7: ARCIA's morning note for wallets with /orderalerts on — once a day (from 00:00 UTC, 09:00 in Seoul): what filled
/// in the last 24 hours, what's open, and the open order the price is closest to, on both chains. Nothing when there's
/// nothing to say.
async function ordersDigest(T, s, out) {
  const day = new Date().toISOString().slice(0, 10);
  if (T.ordersDigestDay === day) return;
  T.ordersDigestDay = day;
  const subs = Object.entries(s.orders || {}).slice(0, 300);
  if (!subs.length) return;
  const now = Math.floor(Date.now() / 1000), spots = new Map();
  for (const X of [ORD.ARC, ORD.RH]) {
    const mk = await X.markets({ store: store() }).catch(() => null);
    for (const m of (mk && mk.markets) || []) spots.set(X.id + ":" + lc(m.token.address || m.token), m.spot || m.last || null);
  }
  let sent = 0;
  for (const [wa, ids] of subs) {
    if (!ids || !ids.length) continue;
    const lines = [];
    let open = 0, fills = 0, near = null;
    for (const X of [ORD.ARC, ORD.RH]) {
      const v = await X.mine(wa, { store: store() }).catch(() => null);
      for (const o of (v && v.orders) || []) {
        const sym = `$${h(o.token && o.token.symbol || "?")}${X.id === "rh" ? " (RH)" : ""}`;
        if ((o.last || 0) > now - 86400 && o.filledPct > 0 && (o.status === "filled" || o.status === "open")) { fills++; if (lines.length < 4) lines.push(`✅ ${o.side === "buy" ? "Bought" : "Sold"} ${sym} at ${fmtPrice(o.fillPx > 0 ? o.fillPx : o.price)}`); }
        if (o.status === "open") {
          open++;
          const sp = spots.get(X.id + ":" + lc(o.token && o.token.address || o.token));
          if (sp > 0 && o.price > 0 && o.type === "limit" && !(o.cond && !o.cond.met) && !(o.after && !o.after.met)) { const g = Math.abs(o.price / sp - 1) * 100; if (!near || g < near.g) near = { g, sym, side: o.side, price: o.price }; }
        }
      }
    }
    if (!fills && !open) continue;
    const text = [`☀️ <b>ARCIA's Orders note</b>`, fills ? `${fills} ${fills === 1 ? "fill" : "fills"} in the last 24 hours:` : "No fills in the last 24 hours.", ...lines,
      open ? `📒 ${open} open ${open === 1 ? "order" : "orders"}${near ? ` — closest: your ${near.side} of ${near.sym} at ${fmtPrice(near.price)}, ${near.g.toFixed(1)}% away` : ""}` : "", "<i>Not advice. Turn these off with /orderalerts off.</i>"].filter(Boolean).join("\n");
    for (const id of ids) { await tg("sendMessage", { chat_id: id, parse_mode: "HTML", text, ...kb([[{ text: "My orders", url: `${SITE}/arc#orders?my=open&scope=all` }]]) }).catch(() => null); sent++; await sleep(40); }
  }
  out.ordersDigest = sent;
}
/// v5: ARCIRCLE Orders on Solana, before it opens — "tell me when it's live" (t.me/…?start=solorders; the page's button)
async function solOrdersWait(m, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const s = await subs(); s.solOrders = [...new Set([...(s.solOrders || []), m.from.id])].slice(-5000);
  await putDoc(DOC.subs, s);
  return say(m, `🟣 ${T3(lang, "Got it — I'll DM you once ARCIRCLE Orders opens on Solana.", "알겠어요 — ARCIRCLE Orders가 Solana에서 열리면 DM으로 알려드릴게요.", "好的——ARCIRCLE Orders 在 Solana 上线时我会私信你。")}`, kb([[{ text: "ARCIRCLE Orders", url: `${SITE}/arc#orders` }]]));
}
/// once the Solana program is set (ORDERS_SOL_PROGRAM) and its config is up: everyone who asked hears it once,
/// on Telegram and on the "orders-sol" Web Push topic
async function solOrdersLive(T, s, out) {
  if (T.solLiveSent || !String(process.env.ORDERS_SOL_PROGRAM || "").trim()) return;
  const SOL = await import("./_orders-sol.mjs");
  const st = await SOL.status({ store: store() }).catch(() => null);
  if (!st || !st.live) return;
  T.solLiveSent = Date.now();
  const text = "🟣 <b>ARCIRCLE Orders is live on Solana</b>\nLimit orders on any SPL token, signed in your wallet — they fill through Jupiter at your price or better.";
  const ids = (s.solOrders || []).slice(0, 400);
  for (const id of ids) { await tg("sendMessage", { chat_id: id, parse_mode: "HTML", text, ...kb([[{ text: "Open ARCIRCLE Orders", url: `${SITE}/arc#orders?c=sol` }]]) }).catch(() => null); await sleep(40); }
  out.solLive = ids.length + (WP.vapid() ? await WP.toTopic(store(), "orders-sol", { title: "ARCIRCLE Orders is live on Solana", body: "Limit orders on any SPL token, signed in your wallet.", url: "/arc#orders?c=sol", tag: "orders-sol" }).catch(() => 0) : 0);
}
async function ordersNotifyOn(X, T, s, c, out) {
  const rh = X.id === "rh", SEQ = rh ? "ordersSeqRh" : "ordersSeq", WARN = rh ? "ordersWarnRhAt" : "ordersWarnAt";
  const txUrl = (tx) => (rh ? `https://robinhoodchain.blockscout.com/tx/${tx}` : `https://arc.etherscan.io/tx/${tx}`);
  const ev = await X.events({ store: store(), since: T[SEQ] || 0 }).catch(() => null);
  if (ev) {
    if (T[SEQ] == null) T[SEQ] = ev.seq; // first look: start from now
    else {
      const subsO = s.orders || {};
      // v4: makers whose browsers subscribed to Web Push get the same news there (VAPID keys set in Vercel)
      const wp = WP.vapid() ? new Set(await WP.wallets(store()).catch(() => [])) : new Set();
      // v7: wallets with a webhook get every event of theirs, signed (x-arcircle-signature: sha256=HMAC(secret, body))
      const HK = await X.hooks({ store: store() }).catch(() => new Map());
      if (HK.size) for (const e of ev.list.slice(-30)) { const hk = HK.get(lc(e.maker)); if (hk) out.hooks = (out.hooks || 0) + (await deliverHook(X, e, hk).catch(() => 0)); }
      for (const e of ev.list.slice(-30)) {
        const ids = subsO[lc(e.maker)];
        if (wp.has(lc(e.maker))) {
          const n = await pushOrderEvent(e, rh).catch(() => 0);
          out.orderPush = (out.orderPush || 0) + n;
        }
        if (!ids || !ids.length) continue;
        const sym = `$${h(e.sym || "?")}${rh ? " (Robinhood)" : ""}`, side = e.side === "buy" ? "Buy" : "Sell", kind = ORDER_TYPE[e.type] || "Order";
        const text = e.kind === "fill" ? `✅ <b>${e.done ? "Filled" : "Part filled"}</b> · ${side} ${sym} (${kind}${e.leg ? ` · ${e.leg === "tp" ? "take-profit" : "stop-loss"}` : ""})\n${compact(e.amount)} ${sym} at ${fmtPrice(e.price)} ${h(e.qsym || "")}${e.done ? "" : ` · ${e.pct}% so far`}${pnlLine(e)}`
          : e.kind === "cond" ? `🎯 <b>Condition met</b> · $${h(e.csym || "?")} ${e.cdir === "below" ? "fell to" : "rose to"} ${fmtPrice(e.cnow)} — your ${side.toLowerCase()} of ${sym} at ${fmtPrice(e.price)} is in the book now`
          : e.kind === "near" ? `👀 <b>Almost there</b> · your ${side.toLowerCase()} of ${sym} at ${fmtPrice(e.price)} ${h(e.qsym || "")} — the pool is at ${fmtPrice(e.spot)}, ${Math.abs(e.gap).toFixed(1)}% away`
          : e.kind === "expiring" ? `⏳ <b>Expires within a day</b> · ${side} ${sym} at ${fmtPrice(e.price)} ${h(e.qsym || "")} — extend it 7 days from your open orders`
          : e.kind === "stop" ? `🛑 <b>Stop triggered</b> · ${sym} at ${fmtPrice(e.price)} — selling at market, never below your limit`
          : e.kind === "trail" ? `📉 <b>Trailing stop triggered</b> · ${sym} fell from its peak ${fmtPrice(e.peak)} to ${fmtPrice(e.price)} — selling now`
          : e.kind === "oco" ? `↔️ <b>Other leg cancelled</b> · ${sym} ${e.leg === "sl" ? "stop-loss" : e.leg === "tp" ? "take-profit" : "order"} — its pair filled`
          : e.kind === "armed" ? `🔁 <b>Grid sell armed</b> · its buy filled — your sell of ${sym} at ${fmtPrice(e.price)} ${h(e.qsym || "")} is in the book now`
          : null;
        if (!text) continue;
        for (const id of ids) { await tg("sendMessage", { chat_id: id, parse_mode: "HTML", text, ...kb([[...(e.tx ? [{ text: "Transaction", url: txUrl(e.tx) }] : []), { text: "My orders", url: `${SITE}/arc#orders?t=${e.token}${rh ? "&c=rh" : ""}` }]]) }).catch(() => null); out.orderAlerts = (out.orderAlerts || 0) + 1; }
      }
      T[SEQ] = ev.seq;
    }
  }
  // v3: price alerts set on the Orders page, for wallets with /orderalerts on (each fires once); v4: and wallets
  // whose browsers subscribed to Web Push
  const wpA = WP.vapid() ? await WP.wallets(store()).catch(() => []) : [];
  const subsA = [...new Set([...Object.keys(s.orders || {}), ...wpA])];
  if (subsA.length) {
    const due = await X.alertsDue(subsA, { store: store() }).catch(() => []);
    for (const a of due.slice(0, 40)) {
      const sym = `$${h(a.sym || "?")}${rh ? " (Robinhood)" : ""}`, q = rh ? "ETH" : "USDC";
      if (wpA.includes(a.wallet)) out.orderPush = (out.orderPush || 0) + await WP.toWallet(store(), a.wallet, { title: `Price alert · $${a.sym || "?"}`, body: `${a.dir === "up" ? "Rose to" : "Fell to"} ${fmtPrice(a.now)} ${q}${rh ? " on Robinhood Chain" : ""} — your alert was ${a.dir === "up" ? "at or above" : "at or below"} ${fmtPrice(a.price)}`, url: `/arc#orders?t=${a.t}${rh ? "&c=rh" : ""}`, tag: `al-${a.t}` }).catch(() => 0);
      const text = `🔔 <b>Price alert</b> · ${sym} ${a.dir === "up" ? "rose to" : "fell to"} <b>${fmtPrice(a.now)} ${q}</b>\nYour alert: ${a.dir === "up" ? "at or above" : "at or below"} ${fmtPrice(a.price)} ${q}`;
      for (const id of (s.orders || {})[a.wallet] || []) await tg("sendMessage", { chat_id: id, parse_mode: "HTML", text, ...kb([[{ text: "Open the market", url: `${SITE}/arc#orders?t=${a.t}${rh ? "&c=rh" : ""}` }]]) }).catch(() => null);
      out.priceAlerts = (out.priceAlerts || 0) + 1;
    }
  }
  const st = await X.status({ store: store() }).catch(() => null);
  if (st && st.live && (st.low || (st.ago != null && st.ago > 900)) && Date.now() - (T[WARN] || 0) > 12 * 3600e3) {
    T[WARN] = Date.now();
    const why = st.low ? `its wallet has ${st.gas != null ? st.gas.toFixed(rh ? 5 : 2) : "?"} ${st.gasSym || "USDC"} of gas left — top up <code>${h(st.keeper || "")}</code>` : `it hasn't run for ${Math.round(st.ago / 60)} minutes — check the cron (${rh ? "?chain=rh&orderstick=1" : "?orderstick=1"}) and ${rh ? "ORDERS_KEEPER_RH_KEY / " : ""}ORDERS_KEEPER_KEY`;
    for (const a of c.admins) await tg("sendMessage", { chat_id: a, parse_mode: "HTML", text: `⚠️ <b>ARCIRCLE Orders executor${rh ? " · Robinhood Chain" : ""}</b>: ${why}` }).catch(() => null);
    out.ordersWarn = true;
  }
}

/// v4 (ARCIA): $ARCIA's graduation on Robinhood Chain — the alert list on Telegram and the browsers on the
/// "arcia-grad" Web Push topic hear it when the curve passes 90% and when the pool opens (each once)
const ARCIA_RH_TOKEN = "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25";
async function arciaGradNotify(T, s, first, out) {
  const A = await arciaCoin(SITE).catch(() => null);
  if (!A || !A.phase) return;
  const was = T.arciaPhase, p = Number(A.progress) || 0;
  T.arciaPhase = A.phase;
  if (first || was == null) { T.arciaNear = A.phase !== "curve" || p >= 90; return; }
  const page = `${SITE}/arc#orders?c=rh&t=${String(A.token || ARCIA_RH_TOKEN).toLowerCase()}`;
  if (A.phase === "curve" && p >= 90 && !T.arciaNear) {
    T.arciaNear = true;
    out.arciaNear = await toSubs(s.alerts || [], { text: `💚 <b>$ARCIA is ${p.toFixed(0)}% of the way to graduating</b> on Robinhood Chain. When the Pons curve fills, it moves to its Uniswap v4 pool — a limit buy on ARCIRCLE Orders can wait for that pool now.`, ...kb([[{ text: "ARCIRCLE Orders", url: page }]]) });
    if (WP.vapid()) out.arciaNearPush = await WP.toTopic(store(), "arcia-grad", { title: `$ARCIA is ${p.toFixed(0)}% to graduation`, body: "The Pons curve is almost full on Robinhood Chain.", url: "/arc#arcia", tag: "arcia-grad" }).catch(() => 0);
  }
  if (was === "curve" && A.phase !== "curve") {
    out.arciaGrad = await toSubs(s.alerts || [], { text: `🎓 <b>$ARCIA graduated</b> on Robinhood Chain — its Uniswap v4 pool is open. Limit buys placed before the graduation on ARCIRCLE Orders fill from it at their price or better.`, ...kb([[{ text: "ARCIRCLE Orders", url: page }]]) });
    if (WP.vapid()) out.arciaGradPush = await WP.toTopic(store(), "arcia-grad", { title: "$ARCIA graduated", body: "Its Uniswap v4 pool is open on Robinhood Chain.", url: page.replace(SITE, ""), tag: "arcia-grad" }).catch(() => 0);
  }
}

/// v7: one event to a wallet's webhook — only to a host that resolves to public addresses, no redirects, 4 seconds
const privateIp = (a) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|f[cd]|fe80:|::ffff:(10|127|192\.168|169\.254)\.)/i.test(a);
async function deliverHook(X, e, hk) {
  let u; try { u = new URL(hk.url); } catch { return 0; }
  if (!X.hookUrlOk(hk.url)) return 0;
  const addrs = await dnsLookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) { await X.hookNote(e.maker, false, { store: store() }).catch(() => null); return 0; }
  const body = JSON.stringify({ chain: X.id, event: { id: e.id, at: e.at, kind: e.kind, token: e.token, sym: e.sym, quote: e.qsym, side: e.side, type: e.type, leg: e.leg || null, price: e.price, amount: e.amount ?? null, value: e.quote ?? null, done: e.done ?? null, pct: e.pct ?? null, hash: e.h || null, tx: e.tx || null, pnlPct: e.pnlPct ?? null } });
  const sig = "sha256=" + createHmac("sha256", hk.secret).update(body).digest("hex");
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 4000);
  let ok = false;
  try { const r = await fetch(hk.url, { method: "POST", redirect: "manual", signal: ac.signal, headers: { "content-type": "application/json", "user-agent": "ARCIRCLE-Orders-Webhook/1", "x-arcircle-event": e.kind, "x-arcircle-signature": sig }, body }); ok = r.status >= 200 && r.status < 300; } catch { ok = false; }
  clearTimeout(to);
  await X.hookNote(e.maker, ok, { store: store() }).catch(() => null);
  return ok ? 1 : 0;
}
/// v4: one executor event as a Web Push message (plain text — the same news the Telegram DM carries)
/// v5: a sell fill against the wallet's average Orders buy in that market
const pnlLine = (e) => (e && e.side === "sell" && isFinite(e.pnlPct) && e.pnlPct != null ? `\n${e.pnlPct >= 0 ? "📈" : "📉"} ${e.pnlPct >= 0 ? "+" : "−"}${Math.abs(e.pnlPct).toFixed(1)}% vs your average buy (${fmtPrice(e.avg)})` : "");
async function pushOrderEvent(e, rh) {
  const sym = `$${e.sym || "?"}`, side = e.side === "buy" ? "Buy" : "Sell", kind = ORDER_TYPE[e.type] || "Order", chain = rh ? " · Robinhood Chain" : "";
  const m = e.kind === "fill" ? { title: `${e.done ? "Filled" : "Part filled"} · ${side} ${sym}${e.side === "sell" && e.pnlPct != null && isFinite(e.pnlPct) ? ` · ${e.pnlPct >= 0 ? "+" : "−"}${Math.abs(e.pnlPct).toFixed(1)}%` : ""}`, body: `${compact(e.amount)} ${sym} at ${fmtPrice(e.price)} ${e.qsym || ""} (${kind}${e.leg ? ` · ${e.leg === "tp" ? "take-profit" : "stop-loss"}` : ""})${e.done ? "" : ` · ${e.pct}% so far`}${pnlLine(e).replace(/^\n\S+ /, " · ")}${chain}` }
    : e.kind === "cond" ? { title: `Condition met · ${side} ${sym}`, body: `$${e.csym || "?"} ${e.cdir === "below" ? "fell to" : "rose to"} ${fmtPrice(e.cnow)} — your order at ${fmtPrice(e.price)} is in the book now${chain}` }
    : e.kind === "near" ? { title: `Almost there · ${side} ${sym}`, body: `The pool is at ${fmtPrice(e.spot)} — ${Math.abs(e.gap).toFixed(1)}% from your ${fmtPrice(e.price)}${chain}` }
    : e.kind === "expiring" ? { title: `Expires within a day · ${side} ${sym}`, body: `At ${fmtPrice(e.price)} ${e.qsym || ""} — extend it 7 days from your open orders${chain}` }
    : e.kind === "stop" ? { title: `Stop triggered · ${sym}`, body: `At ${fmtPrice(e.price)} — selling at market, never below your limit${chain}` }
    : e.kind === "trail" ? { title: `Trailing stop triggered · ${sym}`, body: `Fell from its peak ${fmtPrice(e.peak)} to ${fmtPrice(e.price)} — selling now${chain}` }
    : e.kind === "oco" ? { title: `Other leg cancelled · ${sym}`, body: `Its pair filled${chain}` }
    : e.kind === "armed" ? { title: `Grid sell armed · ${sym}`, body: `Its buy filled — your sell at ${fmtPrice(e.price)} ${e.qsym || ""} is in the book${chain}` } : null;
  if (!m) return 0;
  return WP.toWallet(store(), e.maker, { ...m, url: `/arc#orders?t=${e.token}${rh ? "&c=rh" : ""}`, tag: `${e.kind}-${e.h || e.token}` });
}

/// claim alerts for one's own linked wallet: a new root gives them something to claim, or the claim window is closing
async function setMineAlerts(m, on, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const u = await loadUser(m.from.id);
  if (on && !u.wallet) return startLink(m, lang);
  const s = await subs(), wa = lc(u.wallet || "");
  s.mine = s.mine || {};
  for (const k of Object.keys(s.mine)) { s.mine[k] = s.mine[k].filter((x) => x !== m.from.id); if (!s.mine[k].length) delete s.mine[k]; }
  if (on && wa) s.mine[wa] = [...(s.mine[wa] || []), m.from.id];
  await putDoc(DOC.subs, s);
  return say(m, on ? `⛏ Claim alerts on for <code>${short(wa)}</code>. I'll tell you when a mine has something for you to claim, and before unclaimed coins get burned. /minealerts off to stop.` : "⛏ Claim alerts off.");
}
/// after the settle: ping subscribed builders whose claimable grew (at most once a day per mine), and warn 3 days
/// before a mine burns what's unclaimed
async function mineNotify(T, s, settled, out) {
  const subsMine = s.mine || {}, wallets = Object.keys(subsMine);
  if (!wallets.length) return;
  const MM = await import("./_mine.mjs");
  const { getDocs } = await import("./_store.mjs");
  T.mineN = Object.fromEntries(Object.entries(T.mineN || {}).filter(([, t]) => Date.now() - t < 40 * 86400e3));
  const list = await MM.listView().catch(() => []);
  const t = Math.floor(Date.now() / 1000);
  const posted = new Set(((settled && settled.mines) || []).filter((x) => x.posted && x.posted.ok).map((x) => x.id));
  const closing = list.filter((x) => !x.closed && t > x.end + 30 * 86400 && t < x.end + 33 * 86400).map((x) => x.id);
  for (const id of [...new Set([...posted, ...closing])].slice(0, 6)) {
    const mn = list.find((x) => x.id === id);
    if (!mn) continue;
    const tree = (await getDocs([MM.PATHS.tree(id)]))[MM.PATHS.tree(id)];
    const rows = ((tree && tree.rows) || []).filter(([a]) => subsMine[a]);
    if (!rows.length) continue;
    const rg = await MM.rigs(id, rows.map(([a]) => a));
    const warn = closing.includes(id);
    for (const [a, cum] of rows.slice(0, 100)) {
      const owed = BigInt(cum) - BigInt((rg[a] && rg[a].claimed) || 0n);
      const key = `${warn ? "w" : "c"}${id}_${a}`;
      if (owed <= 0n || (T.mineN[key] && (warn || Date.now() - T.mineN[key] < 20 * 3600e3))) continue;
      T.mineN[key] = Date.now();
      const amt = compact(Number(owed) / 10 ** (mn.token.decimals || 18));
      const text = warn ? `⏳ <b>${amt} $${h(mn.token.symbol)}</b> is still unclaimed in mine #${id} — it gets burned in about ${Math.max(1, Math.ceil((mn.end + 33 * 86400 - t) / 86400))} days.`
        : `⛏ <b>${amt} $${h(mn.token.symbol)}</b> to claim in mine #${id}${mn.info && mn.info.name ? ` (${h(mn.info.name)})` : ""}.`;
      for (const uid of subsMine[a]) { const r = await tg("sendMessage", { chat_id: uid, parse_mode: "HTML", text, ...kb([[{ text: "Claim", url: `${SITE}/arc#mine?id=${id}&tab=claim` }]]) }, 6000); if (r.ok) out.mineClaim = (out.mineClaim || 0) + 1; await sleep(40); }
    }
  }
}
async function mineTick(T, s, out) {
  const MM = await import("./_mine.mjs");
  if (!MM.live()) return;
  const list = await MM.listView().catch(() => []);
  const maxId = list.length ? Math.max(...list.map((x) => x.id)) : -1;
  if (T.mineMax == null) T.mineMax = maxId;
  else if (maxId > T.mineMax) {
    for (const x of list.filter((y) => y.id > T.mineMax).slice(0, 2)) out.mineOpen = (out.mineOpen || 0) + await toSubs(s.alerts, { photo: `${SITE}/api/og?mine=${x.id}`, caption: `⛏ <b>New mine: $${h(x.token.symbol)}</b>${x.info && x.info.name ? "\n" + h(x.info.name) : ""}\nJoin with 1 USDC worth of $ARCIRCLE (burned) and dig in your browser.`, ...kb([[{ text: "Enter the mine", url: `${SITE}/mine/${x.id}` }]]) });
    T.mineMax = maxId;
  }
  const hall = ((await MM.boards().catch(() => ({}))).hall) || [];
  if (T.mineHall == null) T.mineHall = hall[0] ? hall[0].t : 0;
  else {
    const fresh = hall.filter((x) => x.t > T.mineHall);
    for (const x of fresh.slice(0, 2)) {
      const mn = list.find((y) => y.id === x.id);
      out.mineArc = (out.mineArc || 0) + await toSubs(s.alerts, { text: `💜 <b>ARC CRYSTAL!</b> ${short(x.w)} just hit the jackpot ore${mn ? ` in the $${h(mn.token.symbol)} mine` : ""} — +500 points.`, ...kb([[{ text: "Dig too", url: `${SITE}/mine/${x.id}` }]]) });
      // on X too, if the builder said yes (Builder tab) and has proved an X account: at most 3 a day
      try {
        const day = new Date().toISOString().slice(0, 10);
        if (T.mineXDay !== day) { T.mineXDay = day; T.mineXN = 0; }
        if ((T.mineXN || 0) < 3 && mn) {
          const { getDocs } = await import("./_store.mjs");
          const d = await getDocs([MM.PATHS.builder(x.w), MM.PATHS.user(x.id, x.w)]);
          const bd = d[MM.PATHS.builder(x.w)] || {}, u = d[MM.PATHS.user(x.id, x.w)] || {};
          if (bd.xshare && u.x && /^[A-Za-z0-9_]{1,15}$/.test(u.x)) {
            await postTweet(`💜 Arc Crystal found! @${u.x} just hit the jackpot ore in the $${mn.token.symbol} Builder Mine on Arc — 1 in 16,384 shares, +500 points.\n\nDig too: ${SITE}/mine/${x.id}?r=${x.w}&c=jackpot&k=arc`);
            T.mineXN = (T.mineXN || 0) + 1; out.mineX = (out.mineX || 0) + 1;
          }
        }
      } catch (e) { out.mineXErr = String(e.message || e).slice(0, 100); }
    }
    if (hall[0]) T.mineHall = Math.max(T.mineHall, hall[0].t);
  }
}

// ---------------- ARCIA AGENT v2: /agent, /agentwatch, followers' news, the Monday report card ----------------
const AG_ICON = { safe: "🟢", caution: "🟡", risky: "🔴" }, AG_TXT = { safe: ["Safe", "안전", "安全"], caution: ["Caution", "주의", "谨慎"], risky: ["Risky", "위험", "高风险"] };
const agPage = (ch, t) => `${SITE}/arc#agent?${ch === "rh" ? "c=rh&" : ""}t=${String(t || "").toLowerCase()}`;
const agName = (k, lang) => (AG_TXT[k] ? T3(lang, ...AG_TXT[k]) : k);
async function cardAgent(ca, ch, lang) {
  ch = ch === "rh" ? "rh" : "arc";
  const r = await AG.report(store(), ca, { chain: ch }).catch(() => null);
  if (!r || r.error) return { text: `<code>${h(ca)}</code>\n${h((r && r.error) || T3(lang, "ARCIA couldn't read that token right now.", "지금은 이 토큰을 읽을 수 없어요.", "暂时无法读取这个代币。"))}` };
  const c = r.call || {}, f = r.facts || {}, net = ch === "rh" ? "Robinhood Chain" : "Arc";
  const head = c.pending ? `⏳ <b>${T3(lang, "Reading the holders first — the call comes right after", "홀더를 먼저 읽고 있어요 — 콜은 곧 나와요", "正在读取持有人——判断随后给出")}</b>`
    : `${AG_ICON[c.call] || "•"} <b>${T3(lang, "24-hour safety call", "24시간 안전 콜", "24小时安全判断")}: ${h(agName(c.call, lang))}</b>`;
  return {
    text: [`🤖 <b>ARCIA AGENT · ${h(r.sym ? "$" + r.sym : short(r.t))}</b> · ${net}`, head, ...(c.why || []).slice(0, 3).map((x) => `• ${h(x)}`),
      [f.score != null ? `${T3(lang, "Score", "점수", "评分")} <b>${f.score}/100</b>` : "", f.liq != null ? `${T3(lang, "Liquidity", "유동성", "流动性")} ${fmtUsd(f.liq)}` : "", f.holders != null ? `${T3(lang, "Holders", "홀더", "持有人")} ${num(f.holders)}` : ""].filter(Boolean).join(" · "),
      c.until && !c.pending ? `<i>${T3(lang, "Graded in public when the 24 hours are up.", "24시간이 지나면 공개 채점돼요.", "24小时后公开评分。")}</i>` : "",
      `<i>${T3(lang, "About risk, not price direction. Not financial advice.", "가격 방향이 아니라 위험에 대한 판단이에요. 투자 조언이 아니에요.", "关于风险而非价格方向。非投资建议。")}</i>`].filter(Boolean).join("\n"),
    buttons: [[{ text: T3(lang, "Open in ARCIA AGENT", "ARCIA AGENT에서 열기", "在 ARCIA AGENT 打开"), url: agPage(ch, r.t) }], [{ text: T3(lang, "Follow: /agentwatch", "팔로우: /agentwatch", "关注:/agentwatch"), url: agPage(ch, r.t) }]],
    refresh: `agent:${ch}~${r.t}`,
  };
}
async function agentWithProgress(m, ca, ch, lang) {
  const first = await say(m, `🤖 ${T3(lang, "ARCIA is reading", "ARCIA가 읽는 중", "ARCIA 正在读取")} <code>${short(ca)}</code>…`);
  const card = await cardAgent(ca, ch, lang);
  if (first.ok) await tg("deleteMessage", { chat_id: m.chat.id, message_id: first.result.message_id }, 5000);
  return sendCard(m.chat.id, card, { replyTo: isGroup(m.chat) ? m.message_id : undefined });
}
/// follow a token's ARCIA AGENT news by DM: s.agentWatch = { "arc:0x…" | "rh:0x…": [telegram ids] }
async function agentWatch(m, arg, on, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const ca = addrOf(arg), ch = /\b(rh|robinhood)\b/i.test(String(arg || "")) ? "rh" : "arc";
  const s = await subs(); s.agentWatch = s.agentWatch || {};
  const mine = Object.entries(s.agentWatch).filter(([, ids]) => ids.includes(m.from.id)).map(([k]) => k);
  if (!ca) {
    if (!on) { for (const k of mine) s.agentWatch[k] = s.agentWatch[k].filter((x) => x !== m.from.id); for (const k of Object.keys(s.agentWatch)) if (!s.agentWatch[k].length) delete s.agentWatch[k]; await putDoc(DOC.subs, s); return say(m, `✓ ${T3(lang, "Stopped every ARCIA AGENT follow.", "ARCIA AGENT 팔로우를 모두 껐어요.", "已取消所有 ARCIA AGENT 关注。")}`); }
    return say(m, mine.length ? `🤖 ${mine.map((k) => `<code>${short(k.split(":")[1])}</code>${k.startsWith("rh:") ? " (RH)" : ""}`).join(", ")}\n/agentwatch off ${T3(lang, "to stop all", "로 모두 끄기", "全部取消")}` : w("needCA", lang, { cmd: "agentwatch" }));
  }
  const key = `${ch}:${ca}`;
  s.agentWatch[key] = (s.agentWatch[key] || []).filter((x) => x !== m.from.id);
  if (on) { if (mine.length >= 12 && !mine.includes(key)) return say(m, T3(lang, "Up to 12 tokens — /agentunwatch one first.", "최대 12개예요 — 먼저 /agentunwatch 하세요.", "最多 12 个——请先 /agentunwatch。")); s.agentWatch[key].push(m.from.id); }
  if (!s.agentWatch[key].length) delete s.agentWatch[key];
  if (Object.keys(s.agentWatch).length > 800) return say(m, "The list is full right now — try later.");
  await putDoc(DOC.subs, s);
  return say(m, on ? `🤖 ${T3(lang, "Following", "팔로우했어요", "已关注")} <code>${short(ca)}</code>${ch === "rh" ? " (Robinhood Chain)" : ""} — ${T3(lang, "I'll DM you its new safety calls, how they were graded, its buys & burns and when its vault runs dry.", "새 안전 콜, 채점 결과, 매수·소각, 볼트가 비었을 때 DM으로 알려드릴게요.", "新的安全判断、评分结果、买入销毁和金库见底时我会私信你。")}`
    : `✓ ${T3(lang, "Stopped following", "팔로우를 껐어요", "已取消关注")} <code>${short(ca)}</code>`);
}
// ---------------- ARCIRCLE Predict v3: /predictalerts and a wallet's round news (Telegram DM + Web Push) ----------------
/// s.predictWatch = { "arc:0x…" | "rh:0x…": [telegram ids] } — a wallet's rounds: won, lost, refunded, its side losing the lead
async function predictWatch(m, arg, lang) {
  if (isGroup(m.chat)) return say(m, w("dmOnly", lang));
  const a = String(arg || "").trim(), ca = addrOf(a), ch = /\b(rh|robinhood)\b/i.test(a) ? "rh" : "arc", off = /\boff\b/i.test(a);
  const s = await subs(); s.predictWatch = s.predictWatch || {};
  const mine = Object.entries(s.predictWatch).filter(([, ids]) => ids.includes(m.from.id)).map(([k]) => k);
  const drop = (k) => { s.predictWatch[k] = (s.predictWatch[k] || []).filter((x) => x !== m.from.id); if (!s.predictWatch[k].length) delete s.predictWatch[k]; };
  if (!ca) {
    if (off) { mine.forEach(drop); await putDoc(DOC.subs, s); return say(m, `✓ ${T3(lang, "ARCIRCLE Predict alerts are off.", "ARCIRCLE Predict 알림을 껐어요.", "已关闭 ARCIRCLE Predict 提醒。")}`); }
    return say(m, mine.length ? `🎯 ${mine.map((k) => `<code>${short(k.split(":")[1])}</code>${k.startsWith("rh:") ? " (RH)" : ""}`).join(", ")}\n/predictalerts off ${T3(lang, "to stop all", "로 모두 끄기", "全部取消")}`
      : T3(lang, "Send your wallet: /predictalerts 0x… (add rh for Robinhood Chain). I'll DM you when your rounds win, lose or refund, and when your side loses the lead.", "지갑 주소를 보내 주세요: /predictalerts 0x… (Robinhood Chain은 rh 추가). 라운드가 이기거나 지거나 환불될 때, 내 쪽이 역전당할 때 DM으로 알려드려요.", "发送你的钱包:/predictalerts 0x…(Robinhood Chain 加 rh)。你的回合输赢、退款或被反超时我会私信你。"));
  }
  const key = `${ch}:${ca}`;
  if (off) { drop(key); await putDoc(DOC.subs, s); return say(m, `✓ ${T3(lang, "Stopped alerts for", "알림을 껐어요:", "已关闭提醒:")} <code>${short(ca)}</code>`); }
  if (mine.length >= 5 && !mine.includes(key)) return say(m, T3(lang, "Up to 5 wallets — /predictalerts off first.", "최대 5개 지갑이에요 — 먼저 /predictalerts off 하세요.", "最多 5 个钱包——请先 /predictalerts off。"));
  s.predictWatch[key] = [...(s.predictWatch[key] || []).filter((x) => x !== m.from.id), m.from.id];
  if (Object.keys(s.predictWatch).length > 1500) return say(m, "The list is full right now — try later.");
  await putDoc(DOC.subs, s);
  return say(m, `🎯 ${T3(lang, "Alerts on for", "알림을 켰어요:", "已开启提醒:")} <code>${short(ca)}</code>${ch === "rh" ? " (Robinhood Chain)" : ""} — ${T3(lang, "your rounds' results, winnings you haven't claimed after 6 hours, and when your side loses the lead.", "라운드 결과, 6시간 지나도 안 받은 상금, 내 쪽이 역전당할 때 알려드려요.", "回合结果、6 小时未领取的奖金、以及你这边被反超时。")}`);
}
/// one Predict event as plain words; `mk` is its market from the state (symbol and round length)
function predictLine(e, mk) {
  const money = (x) => (e.ch === "rh" ? `${Number(x || 0).toLocaleString("en-US", { maximumFractionDigits: x >= 1 ? 3 : 6 })} ETH` : `$${Number(x || 0).toFixed(2)}`);
  const name = mk ? `$${mk.sym} ${mk.duration % 3600 === 0 ? mk.duration / 3600 + "h" : mk.duration / 60 + "m"}` : e.sym ? `$${e.sym}` : `market #${e.m}`;
  const where = e.ch === "rh" ? " · Robinhood Chain" : "", side = String(e.side || "").toUpperCase();
  if (e.k === "won") return { icon: "✅", title: `You won · ${name} #${e.e + 1}`, body: `${side} paid ${money(e.pay)} (+${money(e.pay - e.amt)}) — claim it on ARCIRCLE Predict${where}` };
  if (e.k === "lost") return { icon: "❌", title: `${name} #${e.e + 1} went ${side === "UP" ? "DOWN" : "UP"}`, body: `Your ${side} ${money(e.amt)} lost this one${where}` };
  if (e.k === "refund") return { icon: "↩️", title: `${name} #${e.e + 1} refunded`, body: `Your ${money(e.amt)} is back to claim (no one on the other side, or no move)${where}` };
  if (e.k === "cross") { const ok = e.lead === e.side; return { icon: ok ? "📈" : "⚡", title: `${name}: ${String(e.lead).toUpperCase()} took the lead`, body: `You're in ${side} with ${money(e.amt)} — ${ok ? "now winning" : "now behind"}${isFinite(e.pc) ? ` (${e.pc >= 0 ? "+" : ""}${Number(e.pc).toFixed(2)}% vs the price to beat)` : ""}${where}` }; }
  return null;
}
const PRED_PAGE = (ch, m) => `${SITE}/arc#predict?${ch === "rh" ? "c=rh&" : ""}m=${m}`;
async function predictNotify(T, s, out) {
  const P = await import("./_predict.mjs");
  const W = s.predictWatch || {};
  T.predEv = T.predEv || {};
  let tgN = 0, pushN = 0;
  for (const ch of ["arc", "rh"]) {
    const I = P.forChain(ch);
    const E = await I.events(store(), T.predEv[ch] || 0).catch(() => null);
    if (!E) continue;
    if (T.predEv[ch] == null) { T.predEv[ch] = E.n; continue; } // the first look: no backlog
    T.predEv[ch] = E.n;
    if (!E.items.length) continue;
    const st = await I.state({ store: store() }).catch(() => null);
    for (const e of E.items.slice(-60)) {
      const mk = st && st.markets ? st.markets.find((x) => x.id === e.m) : null;
      const L = predictLine(e, mk); if (!L) continue;
      const ids = W[`${ch}:${e.u}`] || [], url = PRED_PAGE(ch, e.m);
      if (ids.length) tgN += await toSubs(ids, { text: `${L.icon} <b>${h(L.title)}</b>\n${h(L.body)}`, ...kb([[{ text: "ARCIRCLE Predict", url }]]) }, 60);
      if (WP.vapid()) pushN += await WP.toTopic(store(), WP.predictTopic(ch, e.u), { title: L.title, body: L.body, url: url.replace(SITE, ""), tag: `predict-${e.k}-${e.r}` }).catch(() => 0);
      // a win to remind about in 6 hours if it's still unclaimed
      if (e.k === "won" && (ids.length || WP.vapid())) { T.predRemind = (T.predRemind || []).concat([{ ch, u: e.u, r: e.r, m: e.m, at: Date.now() }]).slice(-200); }
    }
  }
  // winnings still unclaimed after 6 hours: one reminder each
  const due = (T.predRemind || []).filter((x) => Date.now() - x.at > 6 * 3600e3).slice(0, 10);
  for (const x of due) {
    T.predRemind = T.predRemind.filter((y) => y !== x);
    const c = await P.forChain(x.ch).claimableOne(x.r, x.u).catch(() => 0);
    if (!(c > 0)) continue;
    const amt = x.ch === "rh" ? `${c.toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH` : `$${c.toFixed(2)}`;
    const title = `Unclaimed: ${amt} on ARCIRCLE Predict`, body = `Round #${x.r} paid you — it waits in Your bets until you claim it.`, url = PRED_PAGE(x.ch, x.m);
    const ids = W[`${x.ch}:${x.u}`] || [];
    if (ids.length) tgN += await toSubs(ids, { text: `💰 <b>${h(title)}</b>\n${h(body)}`, ...kb([[{ text: "Claim on ARCIRCLE Predict", url }]]) }, 60);
    if (WP.vapid()) pushN += await WP.toTopic(store(), WP.predictTopic(x.ch, x.u), { title, body, url: url.replace(SITE, ""), tag: `predict-claim-${x.r}` }).catch(() => 0);
  }
  if (tgN) out.predictTg = tgN;
  if (pushN) out.predictPush = pushN;
}
/// one AGENT event as plain words (Telegram HTML and Web Push share them)
function agentLine(e) {
  const sym = e.sym ? `$${e.sym}` : short(e.t), net = e.ch === "rh" ? " · Robinhood Chain" : "";
  if (e.kind === "call") return { title: `${sym}: new safety call — ${(AG_TXT[e.call] || [e.call])[0]}`, body: `${(e.why || []).slice(0, 2).join(" · ")}${net}`, icon: AG_ICON[e.call] || "🤖" };
  if (e.kind === "graded") return { title: `${sym}: ${e.call === "caution" ? (e.bad ? "went bad after a Caution call" : "held after a Caution call") : e.right ? "ARCIA called it right" : "ARCIA called it wrong"}`, body: `${(AG_TXT[e.call] || [e.call])[0]} call · price ${e.dPx > 0 ? "+" : ""}${e.dPx}% in 24 hours${net}`, icon: e.call === "caution" ? "🟡" : e.right ? "✅" : "❌" };
  if (e.kind === "burn") return { title: `${sym}: ARCIA bought and burned ${compact(Number(BigInt(e.burned)) / 1e18)}`, body: `$${e.usd} in ${e.n} buy${e.n > 1 ? "s" : ""}, sent to 0x…dEaD${net}`, icon: "🔥" };
  if (e.kind === "empty") return { title: `${sym}: a burn vault ran dry`, body: `After ${e.buys} buys — anyone can refill it on ARCIA AGENT${net}`, icon: "🫗" };
  return null;
}
async function agentNotify(T, s, first, out) {
  const E = await AG.events(store(), T.agentEv || 0).catch(() => null);
  if (!E) return;
  if (first || T.agentEv == null) { T.agentEv = E.n; return; }
  T.agentEv = E.n;
  const W = s.agentWatch || {};
  let tgN = 0, pushN = 0;
  // symbols for burns and empties (their events carry the token only)
  for (const e of E.items.slice(-25)) {
    const L = agentLine(e); if (!L) continue;
    const ids = W[`${e.ch}:${e.t}`] || [], url = agPage(e.ch, e.t);
    if (ids.length) tgN += await toSubs(ids, { text: `${L.icon} <b>${h(L.title)}</b>\n${h(L.body)}`, ...kb([[{ text: "ARCIA AGENT", url }]]) }, 60);
    if (WP.vapid()) pushN += await WP.toTopic(store(), WP.agentTopic(e.ch, e.t), { title: L.title, body: L.body, url: url.replace(SITE, ""), tag: `agent-${e.kind}-${e.t}` }).catch(() => 0);
  }
  if (tgN) out.agentTg = tgN;
  if (pushN) out.agentPush = pushN;
}
/// Monday 10:00 KST: ARCIA AGENT's week (calls, grades, burns) to the announcement targets — off with /agentweekly off
async function agentWeekly(T, c, out) {
  const kst = new Date(Date.now() + 9 * 3600e3);
  if (kst.getUTCDay() !== 1 || kst.getUTCHours() !== 10 || c.agentWeekly === false) return;
  const wk = `${kst.getUTCFullYear()}-${kst.getUTCMonth()}-${kst.getUTCDate()}`;
  if (T.agentWeek === wk) return;
  T.agentWeek = wk;
  const W = await AG.week(store()).catch(() => null);
  if (!W || !W.calls.total) return;
  const g = W.graded, rate = (a, b) => (b ? `${a}/${b}` : "—");
  const burns = W.burns.map((b) => `🔥 ${compact(Number(BigInt(b.burned)) / 1e18)} ${b.ch === "rh" ? "on Robinhood Chain" : "on Arc"} · $${b.usd} · ${b.buys} buys`).slice(0, 4);
  const text = [`🤖 <b>ARCIA AGENT · my week</b>`, `${W.calls.total} safety calls — 🟢 ${W.calls.safe} · 🟡 ${W.calls.caution} · 🔴 ${W.calls.risky}`,
    `Graded: Safe right ${rate(g.safeRight, g.safe)} · Risky right ${rate(g.riskyRight, g.risky)} · Caution held ${rate(g.cautionHeld, g.caution)}`, ...burns,
    `<i>Every call's hash is written on Arc before its outcome. Not financial advice.</i>`].join("\n");
  out.agentWeekly = await postToTargets(c, { photo: `${SITE}/api/og?agentweek=1&w=${wk}`, text: text.replace(/<[^>]+>/g, "") }); // targets take plain text
  if (String(process.env.AGENT_WEEKLY_X || "") === "1") {
    const x = `ARCIA AGENT, my week♡\n${W.calls.total} safety calls: ${W.calls.safe} Safe · ${W.calls.caution} Caution · ${W.calls.risky} Risky\nSafe right ${rate(g.safeRight, g.safe)} · Risky right ${rate(g.riskyRight, g.risky)}\n${W.buys} buy & burns from the vaults\narcircle.app/arc#agent`;
    out.agentWeeklyX = await postTweet(x).then((r) => !!r).catch(() => false);
  }
}

// ---------------- the tick (every ~5 min): alerts, watched wallets, price history, mirror, schedules ----------------
async function toSubs(ids, payload, cap = 150) {
  let n = 0;
  for (const id of ids.slice(0, cap)) { const r = await tg(payload.photo ? "sendPhoto" : "sendMessage", { chat_id: id, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...payload }, 6000); if (r.ok) n++; await sleep(40); }
  return n;
}
async function tick() {
  const T = (await getDoc(DOC.tick)) || {}, first = !T.at, now = Date.now(), out = {};
  const s = await subs(), c = await loadCfg();
  // $ARCIRCLE price history (24 h) and ±10% moves in an hour
  const L = await live(SITE).catch(() => null);
  if (L && L.price) {
    T.series = [...(T.series || []).filter(([t]) => now - t < 24 * 3600e3), [now, L.price]].slice(-400);
    const hourAgo = T.series.find(([t]) => now - t <= 70 * 60e3 && now - t >= 50 * 60e3);
    if (hourAgo && !first) {
      const ch = (L.price - hourAgo[1]) / hourAgo[1];
      if (Math.abs(ch) >= 0.1 && now - (T.priceAlertAt || 0) > 3 * 3600e3) {
        T.priceAlertAt = now;
        out.price = await toSubs(s.alerts, { text: `${ch > 0 ? "📈" : "📉"} <b>$ARCIRCLE ${ch > 0 ? "+" : ""}${(ch * 100).toFixed(1)}%</b> in the last hour · ${fmtPrice(L.price)} · mcap ${fmtUsd(L.mcap)}\n<i>Not financial advice.</i>`, ...kb([[{ text: "$ARCIRCLE", url: `${SITE}/arc#arcircle` }]]) });
      }
    }
  }
  // new launches
  const launches = await launchList().catch(() => []);
  if (first || !T.launchSince) T.launchSince = Math.floor(now / 1000);
  else {
    const fresh = launches.filter((x) => x.t > T.launchSince).slice(0, 3);
    for (const x of fresh) {
      const coin = x.sym ? x : await getCoin(x.token).then((cc) => ({ ...x, sym: cc && cc.symbol, mcap: cc && cc.mcapUsd })).catch(() => x);
      out.launch = (out.launch || 0) + await toSubs(s.alerts, { photo: `${SITE}/api/og?addr=${x.token}&kind=launch`, caption: `🚀 <b>New on ${x.where}: $${h(coin.sym || "?")}</b>\nCA <code>${x.token}</code>\n<i>Scan before you buy. DYOR.</i>`, ...kb([[{ text: "Open", url: `${SITE}/arc#coin/${x.token}` }, { text: "Scan", url: `${SITE}/s/${x.token}` }]]) });
    }
    if (launches.length) T.launchSince = Math.max(T.launchSince, ...launches.slice(0, 20).map((x) => x.t));
  }
  // CirclePad round alerts: the round that's running now (api/_rounds.mjs), each moment once per round
  try { await circleNotify(T, s, c, first, out); } catch (e) { out.circleNotify = String(e.message || e).slice(0, 120); }
  // v4 (ARCIA): $ARCIA graduating from its Pons curve on Robinhood Chain — once at 90%, once when it's done
  try { await arciaGradNotify(T, s, first, out); } catch (e) { out.arciaGrad = String(e.message || e).slice(0, 120); }
  // new airdrops (the Multisender feed) and watched wallets
  const feed = await drop.feed(store()).catch(() => null);
  if (feed) {
    const seen = new Set(T.drops || []);
    const fresh = (feed.recent || []).filter((d) => d.tx && !seen.has(d.tx));
    T.drops = [...(feed.recent || []).map((d) => d.tx), ...(T.drops || [])].filter(Boolean).slice(0, 60);
    if (!first) for (const d of fresh.slice(0, 2)) out.drop = (out.drop || 0) + await toSubs(s.alerts, { photo: `${SITE}/api/og?drop=${d.tx}`, caption: `🎁 <b>New airdrop</b>: $${h(d.sym || "?")} → ${num(d.n)} wallets`, ...kb([[{ text: "Receipt", url: `${SITE}/drop/${d.tx}` }]]) });
    if (fresh.length && !first) {
      T.watchSeen = T.watchSeen || {};
      for (const [wa, uids] of Object.entries(s.watch).slice(0, 300)) {
        const got = await dropsOf(wa).catch(() => null);
        if (!got || !got.rows.length) continue;
        const since = T.watchSeen[wa] || 0, news = got.rows.filter((g) => (g.ts || 0) > since);
        T.watchSeen[wa] = Math.max(since, ...got.rows.map((g) => g.ts || 0));
        if (!since) continue; // first look at this wallet: remember, don't ping
        for (const g of news.slice(0, 2)) for (const id of uids) { await sendWithEffect({ chat_id: id, parse_mode: "HTML", text: `🎁 <code>${short(wa)}</code> just received <tg-spoiler>${compact(g.amt)} $${h(g.sym || "?")}</tg-spoiler> — tap to reveal`, ...kb([[{ text: "Receipt", url: `${SITE}/drop/${g.tx}` }]]) }, EFFECT.party); out.watch = (out.watch || 0) + 1; }
      }
    } else if (first) { T.watchSeen = T.watchSeen || {}; for (const wa of Object.keys(s.watch)) T.watchSeen[wa] = Math.floor(now / 1000); }
  }
  // ARCIA's X posts → the announcement targets
  const posts = await recentPosts().catch(() => []);
  const mirrored = new Set(T.mirrored || []);
  if (!first && c.mirror) for (const p of posts.filter((x) => !mirrored.has(String(x.id))).slice(0, 2).reverse()) { out.mirror = (out.mirror || 0) + await postToTargets(c, { text: `${p.text}\n\n— ARCIA on X: https://x.com/ARCIAonArc/status/${p.id}` }); }
  T.mirrored = [...posts.map((x) => String(x.id)), ...(T.mirrored || [])].slice(0, 60);
  // scheduled announcements
  const sc = (await getDoc(DOC.sched)) || { list: [] };
  const due = sc.list.filter((x) => x.at <= now);
  if (due.length) { sc.list = sc.list.filter((x) => x.at > now); await putDoc(DOC.sched, sc); for (const x of due) out.scheduled = (out.scheduled || 0) + await postToTargets(c, { text: x.text }); }
  T.at = now;
  try { await mineTick(T, s, out); } catch (e) { out.mineTick = String(e.message || e).slice(0, 120); }
  try { await ordersNotify(T, s, c, out); } catch (e) { out.ordersNotify = String(e.message || e).slice(0, 120); }
  try { await stakeNotify(T, s, out); } catch (e) { out.stakeNotify = String(e.message || e).slice(0, 120); }
  try { await nftNotify(T, s, out); } catch (e) { out.nftNotify = String(e.message || e).slice(0, 120); }
  try { await veaNotify(T, s, out); } catch (e) { out.veaNotify = String(e.message || e).slice(0, 120); }
  try { await agentNotify(T, s, first, out); } catch (e) { out.agentNotify = String(e.message || e).slice(0, 120); }
  try { await agentWeekly(T, c, out); } catch (e) { out.agentWeekly = String(e.message || e).slice(0, 120); }
  try { await predictNotify(T, s, out); } catch (e) { out.predictNotify = String(e.message || e).slice(0, 120); }
  await putDoc(DOC.tick, T);
  // Builder Mine: settle finished hours and post roots (api/_mine.mjs) — its own budget, never blocks the rest
  try { const { settleAll } = await import("./_mine.mjs"); out.mine = await settleAll({ budgetMs: 15000 }); } catch (e) { out.mine = { error: String(e.message || e).slice(0, 160) }; }
  // then tell subscribed builders what they can claim
  try { const before = JSON.stringify(T.mineN || {}); await mineNotify(T, s, out.mine, out); if (JSON.stringify(T.mineN || {}) !== before) await putDoc(DOC.tick, T); } catch (e) { out.mineNotify = String(e.message || e).slice(0, 120); }
  return { ok: true, first, ...out };
}

// ---------------- setup ----------------
async function setup() {
  const secret = env("TG_ARCIA_SECRET");
  if (!env("TG_ARCIA_BOT_TOKEN")) return { ok: false, error: "TG_ARCIA_BOT_TOKEN isn't set in Vercel (and the site needs a redeploy after adding it)" };
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) return { ok: false, error: "TG_ARCIA_SECRET is missing or not 16+ letters/digits/_/-" };
  const c = await loadCfg();
  const got = await tg("getMe");
  if (!got.ok) return { ok: false, error: "Telegram didn't accept the token: " + (got.description || "unknown") };
  c.me = { id: got.result.id, username: got.result.username, inline: !!got.result.supports_inline_queries };
  await saveCfg(c);
  const hook = await tg("setWebhook", { url: `${SITE}/api/arcia-tg`, secret_token: secret, allowed_updates: ["message", "callback_query", "channel_post", "my_chat_member", "inline_query"], max_connections: 20 });
  const cmds = await Promise.all([
    tg("setMyCommands", { commands: menu(PUBLIC_CMDS) }),
    tg("setMyCommands", { commands: menu([["ca", "Official contract addresses"], ["price", "$ARCIRCLE price"], ["burns", "$ARCIRCLE burns"], ["scan", "Scan a token: /scan 0x…"], ["round", "CirclePad round"], ["launches", "Newest launches"], ["gm", "Say gm"], ["report", "Reply to a message to report it"], ["help", "What I can do"]]), scope: { type: "all_group_chats" } }),
    tg("deleteMyCommands", { language_code: "ko" }), tg("deleteMyCommands", { language_code: "zh" }),
    tg("setMyDescription", { description: "", language_code: "ko" }), tg("setMyShortDescription", { short_description: "", language_code: "ko" }),
    tg("setMyDescription", { description: "Hi, I'm ARCIA — the virtual idol of $ARCIRCLE on Circle's Arc 💙💚 Talk to me about ARCIRCLE PAD, scan any token, get launch and airdrop alerts, and say gm every day. I'm an AI character run by @ARCIRCLEonArc. Not financial advice." }),
    tg("setMyShortDescription", { short_description: "ARCIA — the virtual idol of $ARCIRCLE on Arc. Live numbers, scans and chat. arcircle.app" }),
    tg("setChatMenuButton", { menu_button: { type: "web_app", text: "ArcPad", web_app: { url: `${SITE}/arc` } } }),
  ]);
  for (const a of c.admins) await tg("setMyCommands", { commands: menu([...PUBLIC_CMDS.filter(([k]) => k !== "report"), ...ADMIN_CMDS]), scope: { type: "chat", chat_id: a } });
  const todo = [];
  if (!c.me.inline) todo.push("inline mode is off: in @BotFather send /setinline → @" + c.me.username + " → placeholder 'paste a contract address…'");
  if (!c.admins.length) todo.push("open ?claim=1&key=… for an admin code");
  return { ok: !!hook.ok, bot: "@" + c.me.username, webhook: hook.ok ? "connected" : hook.description, menus: cmds.every((x) => x.ok) ? "set" : cmds.filter((x) => !x.ok).map((x) => x.description), admins: c.admins.length, todo };
}

/// public, no secrets: can the bot see the home group's messages, is it an admin there, and what happened to the
/// messages it got lately (counts and outcomes only). /api/arcia-tg?health=1
let healthMem = null;
async function health() {
  if (healthMem && Date.now() - healthMem.at < 30e3) return healthMem.v;
  const c = await loadCfg();
  const [me, wh] = await Promise.all([tg("getMe"), tg("getWebhookInfo")]);
  const home = [];
  for (const g of HOME_GROUPS) {
    const ch = await tg("getChat", { chat_id: "@" + g });
    const mem = ch.ok && me.ok ? await tg("getChatMember", { chat_id: ch.result.id, user_id: me.result.id }) : null;
    const r = mem && mem.ok ? mem.result : {};
    home.push({ group: "@" + g, found: !!ch.ok, type: ch.ok ? ch.result.type : null, botStatus: r.status || null,
      canDeleteMessages: r.status === "creator" ? true : r.can_delete_messages ?? null, canRestrictMembers: r.status === "creator" ? true : r.can_restrict_members ?? null,
      assist: ch.ok ? assistOn(c, ch.result) : null, error: ch.ok ? null : ch.description || null });
  }
  await mergeSeen().catch(() => null);
  const d = (await getDoc(DOC_GSEEN)) || { chats: {} };
  const seen = Object.values(d.chats || {}).filter((r) => r.username && HOME_GROUPS.includes(lc(r.username))).map((r) => ({
    lastMessageAt: r.last ? new Date(r.last).toISOString() : null, lastHour: (r.hour || []).filter((t) => Date.now() - t < 3600e3).length, total: r.n, lastOutcome: r.lastWhy || null, outcomes: r.why || {} }));
  const v = {
    bot: me.ok ? "@" + me.result.username : null,
    // false = privacy mode: in groups where it isn't an admin the bot only gets commands, @mentions and replies to it
    readsAllGroupMessages: me.ok ? !!me.result.can_read_all_group_messages : null,
    webhook: wh.ok ? { connected: wh.result.url === `${SITE}/api/arcia-tg`, pending: wh.result.pending_update_count, lastError: wh.result.last_error_message || null, lastErrorAt: wh.result.last_error_date ? new Date(wh.result.last_error_date * 1000).toISOString() : null, updates: wh.result.allowed_updates || "all" } : null,
    home, seen, at: new Date().toISOString(),
  };
  healthMem = { at: Date.now(), v };
  return v;
}

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  if (q.series) { const T = (await getDoc(DOC.tick, 60e3)) || {}; return json(200, { points: (T.series || []).map(([t, p]) => [Math.round(t / 1000), p]) }, "public, max-age=120, s-maxage=240"); }
  if (q.buybot) return json(200, await BB.health()); // public: is the buybot running (no secrets)
  if (q.health) return json(200, await health().catch((e) => ({ error: String((e && e.message) || e).slice(0, 160) })), "no-store");
  if (q.linkinfo) { const i = await linkInfo(q.linkinfo); return i ? json(200, { message: i.message }) : json(410, { error: "This link expired — send /link to ARCIA again." }); }
  const secret = env("CRON_SECRET");
  if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json(401, { error: "unauthorized" });
  try {
    if (q.setup) return json(200, await setup());
    // cron-job.org: short answers inside its timeout (api/_cron.mjs)
    if (q.tick) { const t0 = Date.now(); return json(200, cronOut(q, await tick(), t0)); }
    if (q.buys) { const t0 = Date.now(); return json(200, cronOut(q, await BB.run({ budgetMs: within(cronBudget(q) - 3000, 45000) }), t0)); }
    if (q.claim) {
      const c = await loadCfg();
      const code = String(Math.floor(10000000 + Math.random() * 89999999));
      c.claim = { code, exp: Date.now() + 10 * 60e3 };
      await saveCfg(c);
      return json(200, { code, expires_in: "10 minutes, one use", how: `Open @${(c.me && c.me.username) || "your bot"} in a private chat and send: /admin ${code}` });
    }
    if (q.status) {
      const c = await loadCfg();
      const wh = await tg("getWebhookInfo"), s = await subs(), T = (await getDoc(DOC.tick)) || {};
      return json(200, { bot: c.me ? "@" + c.me.username : null, webhook: wh.ok ? { connected: wh.result.url === `${SITE}/api/arcia-tg`, pending: wh.result.pending_update_count, last_error: wh.result.last_error_message || null } : wh.description,
        admins: c.admins.length, targets: c.targets.map((t) => ({ title: t.title, type: t.type })), alertSubscribers: s.alerts.length, watched: Object.keys(s.watch).length, lastTick: T.at ? new Date(T.at).toISOString() : "never — add the cron-job.org job", lastError: c.lastError });
    }
    return json(400, { error: "use ?setup=1, ?claim=1, ?status=1, ?tick=1 or ?buys=1" });
  } catch (e) { return json(500, { error: String(e && e.message || e).slice(0, 200) }); }
}

export async function POST(req) {
  const url = new URL(req.url);
  if (url.searchParams.has("link")) {
    let b; try { b = await req.json(); } catch { return json(400, { error: "bad request" }); }
    if (tooMany(`link:${req.headers.get("x-forwarded-for") || ""}`, 10, 600e3)) return json(429, { error: "slow down" });
    const r = await finishLink(b).catch((e) => ({ status: 500, body: { error: String(e.message || e).slice(0, 120) } }));
    return json(r.status, r.body);
  }
  const secret = env("TG_ARCIA_SECRET");
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return json(401, { error: "unauthorized" });
  let u;
  try { u = await req.json(); } catch { return json(200, { ok: true }); }
  try {
    if (!(await firstTime(u.update_id))) return json(200, { ok: true }); // Telegram re-sent it
    if (u.callback_query) await onCallback(u.callback_query);
    else if (u.inline_query) await onInline(u.inline_query);
    else if (u.message) await onMessage(u.message, false);
    else if (u.channel_post) await onMessage(u.channel_post, true);
    else if (u.my_chat_member) {
      const n = u.my_chat_member.new_chat_member || {}, o = u.my_chat_member.old_chat_member || {};
      if (["member", "administrator"].includes(n.status) && !["member", "administrator"].includes(o.status) && u.my_chat_member.chat.type !== "channel")
        await tg("sendMessage", { chat_id: u.my_chat_member.chat.id, text: `${W.hello[0]}\n${W.groupHint[0]} Make me an admin (delete messages, restrict members) and I'll keep scams out too. /help` });
    }
  } catch (e) { await reportError(u.callback_query ? "button" : u.inline_query ? "inline" : "message", e); }
  return json(200, { ok: true });
}
