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
// Everyone — /price /scan /coin /round /drops /launches /books (cards with a Refresh button), /me /link
//   /unlink, /alerts, /watch /unwatch, /gm /gmtop, /lucky, /report (reply), /lang (DM), /help; chat in a
//   DM, or in a group when @mentioned / replied to; photos too. Inline: "@ARCIAonArc_bot 0x…" anywhere.
// Group safety (when she's an admin there) — deletes private keys and seed phrases anywhere, scam links,
//   fake $ARCIRCLE contract addresses and people posing as the team; join check (/captcha); holder gate
//   (/gate); auto-scan of posted contract addresses; /warn /mute /unmute /ban for chat admins.
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
import {
  SITE, BOT_URL, CA, ARCIA_CA, OUR_CAS, env, h, lc, short, day, num, compact, sleep, ADDR_RE, tg, fileBase64, kb, keepTyping, EFFECT, sendWithEffect,
  getDoc, putDoc, DOC, loadCfg, saveCfg, chatCfg, setChatCfg, loadUser, saveUser, bump, usage, firstTime, tooMany, reportError,
  linkMessage, personalSigner, secretIn, scamReason,
} from "./_tg-lib.mjs";

const LIMIT = { dm: 40, group: 15, all: 800, photo: 5, lucky: 3, watch: 3 };
const json = (status, body, cache = "no-store") => new Response(JSON.stringify(body, null, 1), { status, headers: { "content-type": "application/json", "cache-control": cache, "access-control-allow-origin": "*" } });
const store = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d), getMany: (ks) => getDocs(ks) } : null);
const minute = () => Math.floor(Date.now() / 60000);
const isGroup = (chat) => chat.type === "group" || chat.type === "supergroup";

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
  ["launches", "Newest launches"], ["drops", "Airdrops a wallet got: /drops 0x…"], ["books", "ARCIA 402: what I earned and spent"], ["me", "Your linked wallet: holdings, rank, airdrops"], ["link", "Link your wallet (one signature)"],
  ["mine", "Builder Mine: mines open now"], ["minealerts", "Builder Mine: tell me when I can claim — on / off"], ["alerts", "Launch, round, airdrop and price alerts: on / off"], ["watch", "Tell me when a wallet gets an airdrop: /watch 0x…"], ["gm", "Say gm — daily streak"], ["gmtop", "gm leaderboard"], ["lucky", "Spin for fun"],
  ["report", "Reply to a message to report it to the team"], ["lang", "Language: en / ko / zh"], ["help", "What I can do"]];
const ADMIN_CMDS = [["status", "Health of the bot, ARCIA 402 and X"], ["report", "Today in numbers (DM) / report a message (group reply)"], ["botstats", "Bot usage and cost estimate"], ["announce", "Post to every target (text, or a photo with this caption)"],
  ["poll", "/poll Question | option | option"], ["schedule", "/schedule 2026-09-30 20:00 text (KST)"], ["schedules", "Scheduled posts"], ["say", "ARCIA rewrites your note and posts it"], ["tweet", "Draft a post for X, approve to publish"],
  ["here", "Use this chat for announcements"], ["unhere", "Stop announcing here"], ["targets", "Where announcements go"], ["mirror", "Mirror ARCIA's X posts: on / off"], ["guard", "Scam filter here: on / off"], ["captcha", "Join check here: on / off"],
  ["autoscan", "Auto-scan contract addresses here: on / off"], ["gate", "Holders-only group: /gate 100000 or off"], ["buybot", "Buy alerts for our coins here: on [min $] / off"], ["warn", "Reply: warn (3 = 24 h mute)"], ["mute", "Reply: mute [hours]"], ["unmute", "Reply: unmute"], ["ban", "Reply: ban"],
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
const cardCA = () => `♾️ <b>$ARCIRCLE</b>:\n<code>${h(CHECKSUM.arcircle)}</code>\n\n💙💚 <b>$ARCIA</b>:\n<code>${h(CHECKSUM.arcia)}</code>`;
const CHECKSUM = { arcircle: "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7", arcia: "0x9da6d5ce413e94264Ea411372459413334a83bE5" };
// /burns: everything burned so far, where it came from, and the latest burns (the Reward page's numbers)
const BURN_NAMES = { vote: ["Burn-to-vote", "소각 투표", "销毁投票"], mine: ["Builder Mine", "빌더 마인", "Builder Mine"], scanner: ["Token Scanner", "토큰 스캐너", "代币扫描器"],
  secret: ["ARCIA's secret file", "ARCIA 시크릿 파일", "ARCIA 秘密档案"], desk: ["ARCIA DESK", "ARCIA DESK", "ARCIA DESK"], buyback: ["Buyback", "바이백", "回购"],
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
async function cardScan(ca, lang) {
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
  if (kind === "me") return cardMe(await loadUser(uid), lang);
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
async function answer(m, text, { lang, group, image } = {}) {
  const c = await loadCfg(), uid = m.from.id, admin = c.admins.includes(uid);
  if (!admin) {
    const mine = await usage("chat", uid), all = Object.values(await usage("chat")).reduce((s, n) => s + n, 0);
    if (mine >= (group ? LIMIT.group : LIMIT.dm) || all >= LIMIT.all) return say(m, w("limit", lang));
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
    const extra = `Reply in the language the person wrote in (English unless they wrote in another language). You are chatting on Telegram${group ? ` in the group "${m.chat.title || ""}" (keep it short; others are reading)` : " in a private chat"}. The person is ${who || "a fan"}. ${image ? "They sent a picture: describe what matters in it for them (charts: say what you see, never predict prices). " : ""}Telegram shows plain text: no markdown, no bold, no bullet lists; links as plain arcircle.app/… text. Bot commands you can mention: /ca /price /scan 0x… /coin 0x… /round /drops 0x… /launches /books /link /alerts /gm.`;
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
  const cc = chatCfg(c, m.chat.id);
  if (!cc.guard) return false;
  const joined = (cc.joins || {})[m.from.id];
  const why = scamReason(m, { newbie: !!joined && Date.now() - joined < 72 * 3600e3 });
  if (!why || (await canModerate(c, m))) return false;
  const del = await tg("deleteMessage", { chat_id: m.chat.id, message_id: m.message_id });
  await tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", text: w("scam", lang, { name: nameOf(m.from), why: h(why) }) + (del.ok ? "" : "\n<i>(I need admin rights with “Delete messages” to remove it.)</i>") });
  await addWarn(c, m.chat.id, m.from, why);
  return true;
}
async function addWarn(c, chatId, user, why) {
  const cc = chatCfg(c, chatId), warns = { ...(cc.warns || {}) };
  warns[user.id] = (warns[user.id] || 0) + 1;
  await setChatCfg(c, chatId, { warns });
  if (warns[user.id] >= 3) {
    const r = await tg("restrictChatMember", { chat_id: chatId, user_id: user.id, permissions: { can_send_messages: false }, until_date: Math.floor(Date.now() / 1000) + 86400 });
    await tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: r.ok ? `🔇 ${nameOf(user)} is muted for 24 h (3 warnings).` : `${nameOf(user)} has 3 warnings.` });
  }
  return warns[user.id];
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
  if (addrs.length !== 1 || OUR_CAS.includes(addrs[0]) || tooMany(`scan:${m.chat.id}:${addrs[0]}`, 1, 1800e3) || tooMany(`autoscan:${m.chat.id}`, 4, 600e3)) return false;
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
  if (!m.from || m.from.is_bot) return;
  const group = isGroup(m.chat), uid = m.from.id, admin = c.admins.includes(uid);
  const u = group ? null : await loadUser(uid);
  const lang = group ? chatCfg(c, m.chat.id).lang || "en" : (u && u.lang) || "en";
  if (m.new_chat_members) return onJoin(c, m, lang);
  if (!text && !m.photo) return;

  if (await guard(c, m, lang)) return;
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
      case "ca": return say(m, cardCA(), kb([[{ text: "$ARCIRCLE", url: `https://argus.world/token/${CA}` }, { text: "$ARCIA", url: `https://argus.world/token/${ARCIA_CA}` }]]));
      case "burns": case "burn": return sendCard(m.chat.id, await cardBurns(lang), { replyTo: group ? m.message_id : undefined });
      case "price": return sendCard(m.chat.id, await cardPrice(lang), { replyTo: group ? m.message_id : undefined });
      case "scan": { const ca = addrOf(arg); return ca ? scanWithProgress(m, ca, lang) : say(m, w("needCA", lang, { cmd: "scan" })); }
      case "coin": { const ca = addrOf(arg); return ca ? sendCard(m.chat.id, await cardCoin(ca, lang), { replyTo: group ? m.message_id : undefined }) : say(m, w("needCA", lang, { cmd: "coin" })); }
      case "round": return sendCard(m.chat.id, await cardRound(lang), { replyTo: group ? m.message_id : undefined });
      case "drops": { const wa = addrOf(arg) || (u && u.wallet); return wa ? sendCard(m.chat.id, await cardDrops(wa, lang), { replyTo: group ? m.message_id : undefined }) : say(m, w("needWallet", lang, { cmd: "drops" })); }
      case "launches": return sendCard(m.chat.id, await cardLaunches(0, lang), { replyTo: group ? m.message_id : undefined });
      case "books": return sendCard(m.chat.id, await cardBooks(lang), { replyTo: group ? m.message_id : undefined });
      case "mine": return mineList(m);
      case "minealerts": return setMineAlerts(m, !/^off$/i.test(arg), lang);
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
    if (!mention && !toMe) { await autoScan(c, m, lang); return; }
    q = text.replace(new RegExp(`@${bot.username}\\b`, "ig"), "").trim() || (m.photo ? "" : "hi");
  } else if (!m.photo) {
    // a bare contract address in a DM: scan it
    const only = text.match(/^\s*(0x[0-9a-fA-F]{40})\s*$/);
    if (only) return scanWithProgress(m, lc(only[1]), lang);
  }
  const image = m.photo ? await fileBase64(m.photo[m.photo.length - 1].file_id).catch(() => null) : null;
  return answer(m, q, { lang, group, image });
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
  // CirclePad round reminders
  const st = await roundState().catch(() => null);
  if (st && st.deadline) {
    T.round = T.round || {};
    const leftS = st.deadline - Math.floor(now / 1000);
    const step = leftS <= 0 && leftS > -86400 ? "closed" : leftS > 0 && leftS <= 3600 ? "1h" : leftS > 0 && leftS <= 6 * 3600 ? "6h" : leftS > 0 && leftS <= 24 * 3600 ? "24h" : null;
    if (step && !T.round[step]) {
      for (const k of ["24h", "6h", "1h", "closed"]) { T.round[k] = true; if (k === step) break; }
      if (!first) out.round = await toSubs(s.alerts, { photo: `${SITE}/api/og?round=1&t=${minute()}`, caption: step === "closed" ? `🟢 <b>CirclePad Round #1 has closed</b> — ${num(Number(st.totalRaised / 10n ** 16n) / 100)} USDC raised. Thank you 💙💚` : `🟢 <b>${step} left</b> in CirclePad Round #1 · ${num(Number(st.totalRaised / 10n ** 16n) / 100)} USDC raised`, ...kb([[{ text: "CirclePad", url: `${SITE}/circle` }]]) });
    }
  }
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

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  if (q.series) { const T = (await getDoc(DOC.tick, 60e3)) || {}; return json(200, { points: (T.series || []).map(([t, p]) => [Math.round(t / 1000), p]) }, "public, max-age=120, s-maxage=240"); }
  if (q.buybot) return json(200, await BB.health()); // public: is the buybot running (no secrets)
  if (q.linkinfo) { const i = await linkInfo(q.linkinfo); return i ? json(200, { message: i.message }) : json(410, { error: "This link expired — send /link to ARCIA again." }); }
  const secret = env("CRON_SECRET");
  if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json(401, { error: "unauthorized" });
  try {
    if (q.setup) return json(200, await setup());
    if (q.tick) return json(200, await tick());
    if (q.buys) return json(200, await BB.run());
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
