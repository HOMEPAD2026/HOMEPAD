// api/arcia-tg.mjs — ARCIA on Telegram: a bot that talks as ARCIA (same mind as the site chat and
// her X replies), answers commands with live numbers, and gives the team an admin mode.
//
//   POST /api/arcia-tg                      Telegram's webhook (checked with TG_ARCIA_SECRET)
//   GET  /api/arcia-tg?setup=1&key=<CRON_SECRET>    connect: webhook, command menus, descriptions
//   GET  /api/arcia-tg?claim=1&key=<CRON_SECRET>    a one-time code (10 min): send "/admin CODE" to the bot in a DM
//   GET  /api/arcia-tg?status=1&key=<CRON_SECRET>   webhook health, bot name, admins, announcement targets
//
// Everyone: /price /scan <CA> /coin <CA> /round /drops <wallet> /launches /books /whoami /help, and chat —
//   in a DM freely, in a group when @mentioned or replied to. Answers are capped per person per day.
// Admins (claimed with a code, stored — never an env list to maintain):
//   /status /report  /announce <text> (preview → confirm → every registered chat)
//   /here /unhere /targets  (register a group or channel for announcements)
//   /pause402 sell|hire|all|off  /hire  (ARCIA 402)
// Nothing here can move funds: no command signs or sends a transaction.
//
// Vercel env (entered by the team, marked Sensitive): TG_ARCIA_BOT_TOKEN, TG_ARCIA_SECRET.
// Uses the existing ANTHROPIC_API_KEY, CRON_SECRET and the Firestore store.
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import { askClaude, live, price as fmtPrice, usd as fmtUsd, left, CA } from "./_arcia-brain.mjs";
import { getCoin, allPools, isAddr } from "./_arc.mjs";
import * as scanner from "./_scan.mjs";
import * as drop from "./_drop.mjs";
import * as argusArc from "./_argus-arcpad.mjs";
import * as A402 from "./_arcia402.mjs";
import { roundState } from "./_round.mjs";

const SITE = "https://www.arcircle.app";
const STATE = "tgArcia/v1";
const LIMIT = { dm: 40, group: 15, all: 800 };
const env = (k) => String(process.env[k] || "").trim();
const json = (status, body) => new Response(JSON.stringify(body, null, 1), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const h = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const lc = (a) => String(a || "").toLowerCase();
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const day = () => new Date().toISOString().slice(0, 10);
const num = (n) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
const store = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null);
const mem = { state: null, conv: new Map(), seen: new Set(), tries: new Map() };

// ---------------- Telegram ----------------
async function tg(method, payload = {}) {
  const token = env("TG_ARCIA_BOT_TOKEN");
  if (!token) return { ok: false, description: "TG_ARCIA_BOT_TOKEN isn't set" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
    return await r.json().catch(() => ({ ok: false }));
  } catch (e) { return { ok: false, description: String(e && e.message || e).replace(token, "…") }; }
}
const send = (chat_id, text, extra = {}) => tg("sendMessage", { chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
const buttons = (rows) => ({ reply_markup: { inline_keyboard: rows } });

// ---------------- state ----------------
async function loadState() {
  if (mem.state && Date.now() - mem.state.__at < 5000) return mem.state;
  const st = store();
  const d = (st && (await st.get(STATE).catch(() => null))) || mem.state || {};
  mem.state = { admins: d.admins || [], targets: d.targets || [], claim: d.claim || null, me: d.me || null, pending: d.pending || {}, usage: d.usage || {}, seen: d.seen || [], __at: Date.now() };
  return mem.state;
}
async function saveState(S) {
  const { __at, ...doc } = S;
  const today = day();
  doc.usage = Object.fromEntries(Object.entries(doc.usage || {}).filter(([k]) => k >= new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 10) || k === today));
  doc.pending = Object.fromEntries(Object.entries(doc.pending || {}).filter(([, p]) => Date.now() - p.t < 86400e3));
  doc.seen = (doc.seen || []).slice(-80);
  mem.state = { ...doc, __at: Date.now() };
  const st = store();
  if (st) await st.set(STATE, doc).catch(() => null);
}
async function me(S) {
  if (S.me && S.me.username) return S.me;
  const r = await tg("getMe");
  if (r.ok) { S.me = { id: r.result.id, username: r.result.username }; await saveState(S); }
  return S.me || { id: 0, username: "" };
}
const isAdmin = (S, uid) => S.admins.includes(Number(uid));

// ---------------- words (English / 한국어 / 中文) ----------------
const W = {
  hello: ["Hi everyone, I'm ARCIA 💙💚 the virtual idol of $ARCIRCLE.", "안녕하세요 여러분, $ARCIRCLE의 버추얼 아이돌 ARCIA예요 💙💚", "大家好,我是 $ARCIRCLE 的虚拟偶像 ARCIA 💙💚"],
  help: ["I'm ARCIA, the virtual idol of $ARCIRCLE 💙💚 Ask me anything about ARCIRCLE PAD, or try:", "안녕하세요, $ARCIRCLE의 버추얼 아이돌 ARCIA예요 💙💚 ARCIRCLE PAD에 대해 뭐든 물어보거나 이 명령어를 써 보세요:", "我是 $ARCIRCLE 的虚拟偶像 ARCIA 💙💚 关于 ARCIRCLE PAD 的问题都可以问我,或者试试:"],
  groupHint: ["In groups, @mention me or reply to my message.", "그룹에서는 저를 @멘션하거나 제 메시지에 답장해 주세요.", "在群里请 @我 或回复我的消息。"],
  adminCmds: ["Admin", "관리자", "管理员"],
  needCA: ["Send a contract address: /scan 0x…", "컨트랙트 주소를 붙여 주세요: /scan 0x…", "请附上合约地址:/scan 0x…"],
  needWallet: ["Send a wallet address: /drops 0x…", "지갑 주소를 붙여 주세요: /drops 0x…", "请附上钱包地址:/drops 0x…"],
  notCoin: ["That isn't an ArcPad or Argus-via-ArcPad coin. Try /scan for any token.", "ArcPad나 ArcPad 경유 Argus 코인이 아니에요. 다른 토큰은 /scan으로 확인해 보세요.", "这不是 ArcPad 或经 ArcPad 的 Argus 币。其他代币请用 /scan。"],
  busy: ["I'm a little busy right now~ try again in a moment 💙", "지금 조금 바빠요~ 잠시 후에 다시 물어봐 주세요 💙", "我现在有点忙~ 稍后再问我吧 💙"],
  limit: ["That's all my chats for today~ see you tomorrow, or talk to me on arcircle.app/arc#arcia 💙", "오늘 대화는 여기까지예요~ 내일 또 봐요! arcircle.app/arc#arcia에서도 만날 수 있어요 💙", "今天的聊天就到这里啦~ 明天见,也可以在 arcircle.app/arc#arcia 找我 💙"],
  onlyAdmin: ["That one is for the ARCIRCLE team.", "관리자 전용 명령이에요.", "这是团队专用命令。"],
  err: ["Couldn't read that right now — try again in a moment.", "지금은 읽어오지 못했어요 — 잠시 후 다시 해 주세요.", "暂时读取不到,请稍后再试。"],
  noDrops: ["No airdrops through the ARCIRCLE PAD Multisender for this wallet yet.", "이 지갑이 ARCIRCLE PAD 멀티센더로 받은 에어드랍은 아직 없어요.", "该钱包尚未通过 ARCIRCLE PAD Multisender 收到空投。"],
};
const L3 = (lang) => (lang === "ko" ? 1 : lang === "zh" ? 2 : 0);
const w = (k, lang) => W[k][L3(lang)];
// The bot speaks English: menus, descriptions and command answers. TG_ARCIA_LANG=auto switches the fixed
// text to the person's Telegram language (ko / zh). ARCIA's chat replies follow the language of the message.
const langOf = (u) => { if (lc(env("TG_ARCIA_LANG")) !== "auto") return "en"; const c = lc(u && u.language_code); return c.startsWith("ko") ? "ko" : c.startsWith("zh") ? "zh" : "en"; };

const PUBLIC_CMDS = [["price", "$ARCIRCLE price, market cap, holders", "$ARCIRCLE 가격, 시총, 홀더", "$ARCIRCLE 价格、市值、持有人"], ["scan", "Safety scan: /scan 0x…", "안전 스캔: /scan 0x…", "安全扫描:/scan 0x…"], ["coin", "Coin info: /coin 0x…", "코인 정보: /coin 0x…", "币信息:/coin 0x…"],
  ["round", "CirclePad round: raised, time left", "CirclePad 라운드: 모금액, 남은 시간", "CirclePad 轮次:已募、剩余时间"], ["drops", "Airdrops a wallet got: /drops 0x…", "받은 에어드랍: /drops 0x…", "钱包收到的空投:/drops 0x…"],
  ["launches", "Newest launches", "최신 런칭", "最新发射"], ["books", "ARCIA 402: what I earned and spent", "ARCIA 402: 번 돈과 쓴 돈", "ARCIA 402:收入与支出"], ["help", "What I can do", "할 수 있는 것", "我能做什么"]];
const ADMIN_CMDS = [["status", "Health of the bot, ARCIA 402 and X"], ["report", "Today in numbers"], ["announce", "Post to every registered chat: /announce text"], ["here", "Use this chat for announcements"], ["unhere", "Stop announcing here"], ["targets", "Where announcements go"], ["pause402", "ARCIA 402: sell | hire | all | off"], ["hire", "ARCIA 402: hire an agent now"], ["whoami", "Your Telegram ID"]];

// ---------------- commands ----------------
async function cmdPrice(lang) {
  const L = await live(SITE);
  if (!L) return w("err", lang);
  const ch = L.change24h == null ? "" : ` (${L.change24h >= 0 ? "+" : ""}${L.change24h.toFixed(2)}% 24h)`;
  const lines = [
    `<b>$ARCIRCLE</b> · ${fmtPrice(L.price)}${ch}`,
    `${["Market cap", "시가총액", "市值"][L3(lang)]}: <b>${fmtUsd(L.mcap)}</b>`,
    `${["Holders", "홀더", "持有人"][L3(lang)]}: <b>${num(L.holders)}</b>`,
    L.burnedPct != null ? `${["Burned", "소각", "已燃烧"][L3(lang)]}: <b>${L.burnedPct.toFixed(2)}%</b>` : null,
    L.launches != null ? `${["ArcPad launches", "ArcPad 런칭", "ArcPad 发射"][L3(lang)]}: <b>${num(L.launches)}</b>` : null,
    `\nCA <code>${CA}</code>`,
  ].filter(Boolean);
  return { text: lines.join("\n"), extra: buttons([[{ text: "$ARCIRCLE", url: `${SITE}/arc#arcircle` }, { text: "Stats", url: `${SITE}/stats` }]]) };
}
async function cmdScan(arg, lang) {
  const ca = (arg.match(/0x[0-9a-fA-F]{40}/) || [])[0];
  if (!ca) return w("needCA", lang);
  const r = await scanner.apiResult(lc(ca), { store: store() }).catch(() => null);
  if (!r) return w("err", lang);
  if (r.token_standard === null && r.score == null) return { text: `<code>${h(ca)}</code>\n${["Not a token on Arc.", "Arc의 토큰이 아니에요.", "不是 Arc 上的代币。"][L3(lang)]}` };
  const warn = (r.checks || []).filter((c) => c.status === "fail" || c.status === "warn").slice(0, 3).map((c) => `• ${h(c.title)}`);
  return {
    text: [`🔍 <b>${h(r.symbol ? "$" + r.symbol : short(ca))}</b>${r.name ? ` · ${h(r.name)}` : ""}`, `${["Score", "점수", "评分"][L3(lang)]}: <b>${r.score}/100</b> · ${h(r.verdict || "")}`,
      ...(r.reasons || []).slice(0, 3).map((x) => `• ${h(x)}`), ...warn, r.market && r.market.market_cap_usd != null ? `${["Market cap", "시가총액", "市值"][L3(lang)]}: ${fmtUsd(r.market.market_cap_usd)}` : null,
      r.holders && r.holders.count != null ? `${["Holders", "홀더", "持有人"][L3(lang)]}: ${num(r.holders.count)}` : null, `\n<i>${["Not financial advice. DYOR.", "투자 조언이 아니에요. 직접 확인하세요.", "非投资建议,请自行研究。"][L3(lang)]}</i>`].filter(Boolean).join("\n"),
    extra: buttons([[{ text: ["Full report", "전체 리포트", "完整报告"][L3(lang)], url: `${SITE}/s/${lc(ca)}` }, { text: ["Deep analysis · $0.02", "심층 분석 · $0.02", "深度分析 · $0.02"][L3(lang)], url: `${SITE}/arc#arcia402?svc=token-analysis&token=${lc(ca)}` }]]),
  };
}
async function cmdCoin(arg, lang) {
  const ca = (arg.match(/0x[0-9a-fA-F]{40}/) || [])[0];
  if (!ca) return w("needCA", lang).replace("/scan", "/coin");
  const [c, a] = await Promise.all([getCoin(ca).catch(() => null), argusArc.coin(lc(ca), { store: store() }).catch(() => null)]);
  const x = c || a;
  if (!x) return w("notCoin", lang);
  const age = x.launchedAt ? Math.round((Date.now() / 1000 - x.launchedAt) / 3600) : null;
  return {
    text: [`🪙 <b>$${h(x.symbol)}</b>${x.name ? ` · ${h(x.name)}` : ""} <i>${c ? "ArcPad" : "Argus via ArcPad"}</i>`, x.priceUsd != null ? `${["Price", "가격", "价格"][L3(lang)]}: ${fmtPrice(x.priceUsd)}` : null,
      x.mcapUsd != null ? `${["Market cap", "시가총액", "市值"][L3(lang)]}: <b>${fmtUsd(x.mcapUsd)}</b>` : null, age != null ? `${["Launched", "런칭", "发射"][L3(lang)]}: ${age < 48 ? age + "h" : Math.round(age / 24) + "d"} ${["ago", "전", "前"][L3(lang)]}` : null,
      x.creator ? `Creator: <code>${h(short(x.creator))}</code>` : null, `\nCA <code>${h(lc(ca))}</code>`].filter(Boolean).join("\n"),
    extra: buttons([[{ text: "ArcPad", url: `${SITE}/arc#coin/${lc(ca)}` }, { text: ["Scan", "스캔", "扫描"][L3(lang)], url: `${SITE}/s/${lc(ca)}` }, ...(a && !c ? [{ text: "Argus", url: `https://argus.world/token/${lc(ca)}` }] : [])]]),
  };
}
async function cmdRound(lang) {
  const st = await roundState().catch(() => null);
  if (!st) return w("err", lang);
  const raised = Number(st.totalRaised / 10n ** 16n) / 100, lf = left(st.deadline);
  return {
    text: [`🟢 <b>CirclePad Round #1</b> · ${st.isOpen ? ["open", "진행 중", "进行中"][L3(lang)] : ["closed", "마감", "已结束"][L3(lang)]}`, `${["Raised", "모금액", "已募"][L3(lang)]}: <b>${num(raised)} USDC</b>`,
      st.isOpen && lf ? `${["Time left", "남은 시간", "剩余时间"][L3(lang)]}: <b>${lf}</b>` : null, `${["Closes", "마감", "截止"][L3(lang)]}: ${new Date(st.deadline * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`].filter(Boolean).join("\n"),
    extra: buttons([[{ text: "CirclePad", url: `${SITE}/circle` }, { text: ["Round report", "라운드 리포트", "轮次报告"][L3(lang)], url: `${SITE}/circle/round/1` }]]),
  };
}
async function cmdDrops(arg, lang) {
  const wa = (arg.match(/0x[0-9a-fA-F]{40}/) || [])[0];
  if (!wa) return w("needWallet", lang);
  const got = await drop.received(store(), lc(wa)).catch(() => null);
  if (!got) return w("err", lang);
  const rows = (got.got || []);
  if (!rows.length && !(got.claims || []).length) return w("noDrops", lang);
  const fmt = (g) => { let a = g.amount; try { a = g.dec != null ? Number(BigInt(g.amount)) / 10 ** g.dec : g.amount; } catch { /* raw */ } return `• ${num(a)} $${h(g.sym || "?")} · ${g.ts ? new Date(g.ts * 1000).toISOString().slice(0, 10) : ""}`; };
  return {
    text: [`🎁 <b>${["Airdrops", "에어드랍", "空投"][L3(lang)]}</b> · <code>${h(short(lc(wa)))}</code> · ${rows.length}`, ...rows.slice(0, 8).map(fmt), (got.claims || []).length ? `\n${["Waiting to claim", "클레임 대기", "待领取"][L3(lang)]}: ${(got.claims || []).length}` : null].filter(Boolean).join("\n"),
    extra: buttons([[{ text: "Portfolio", url: `${SITE}/arc#portfolio` }]]),
  };
}
async function cmdLaunches(lang) {
  const [pools, ag] = await Promise.all([allPools().catch(() => []), argusArc.list({ store: store(), budgetMs: 2500 }).catch(() => ({ items: [] }))]);
  const list = pools.map((p) => ({ token: p.token, t: p.launchedAt, where: "ArcPad" })).concat((ag.items || []).filter((x) => x.active !== false).map((x) => ({ token: x.token, t: x.launchedAt, where: "Argus", sym: x.symbol, mcap: x.mcapUsd })))
    .sort((a, b) => b.t - a.t).slice(0, 6);
  if (!list.length) return w("err", lang);
  const coins = await Promise.all(list.map((x) => (x.sym ? x : getCoin(x.token).then((c) => ({ ...x, sym: c && c.symbol, mcap: c && c.mcapUsd })).catch(() => x))));
  return {
    text: [`🚀 <b>${["Newest launches", "최신 런칭", "最新发射"][L3(lang)]}</b>`, ...coins.map((x) => `• <b>$${h(x.sym || "?")}</b> · ${x.where}${x.mcap != null ? ` · ${fmtUsd(x.mcap)}` : ""} · ${Math.max(1, Math.round((Date.now() / 1000 - x.t) / 3600))}h\n  <code>${h(x.token)}</code>`)].join("\n"),
    extra: buttons([[{ text: "Explore", url: `${SITE}/arc#explore` }]]),
  };
}
async function cmdBooks(lang) {
  const d = await A402.stats().catch(() => null);
  if (!d) return w("err", lang);
  const t = d.totals, last = (d.items || []).find((e) => e.kind === "earn");
  return {
    text: [`💙💚 <b>ARCIA 402</b>`, `${["Wallet", "지갑", "钱包"][L3(lang)]}: <code>${h(d.wallet || "—")}</code>`, d.balances.usdc != null ? `USDC: <b>$${d.balances.usdc.toFixed(2)}</b>` : null,
      `${["Earned", "수익", "收入"][L3(lang)]}: $${t.earned.toFixed(2)} · ${["Spent", "비용", "支出"][L3(lang)]}: $${t.spent.toFixed(2)} · ${["Tips", "팁", "打赏"][L3(lang)]}: $${t.tips.toFixed(2)}`,
      `${["Net", "순이익", "净额"][L3(lang)]}: <b>${t.net >= 0 ? "+" : "−"}$${Math.abs(t.net).toFixed(2)}</b> · ${t.sold} ${["paid calls", "유료 호출", "次付费调用"][L3(lang)]}`,
      last ? `${["Last sale", "마지막 판매", "最近一笔"][L3(lang)]}: ${h(last.svc)} +$${last.amount.toFixed(2)}` : null].filter(Boolean).join("\n"),
    extra: buttons([[{ text: "ARCIA 402", url: `${SITE}/arc#arcia402` }]]),
  };
}
function helpText(S, uid, lang, group) {
  const i = L3(lang);
  const lines = [w("help", lang), "", ...PUBLIC_CMDS.map((c) => `/${c[0]} — ${h(c[1 + i])}`)];
  if (group) lines.push("", w("groupHint", lang));
  if (isAdmin(S, uid)) lines.push("", `<b>${w("adminCmds", lang)}</b>`, ...ADMIN_CMDS.map(([c, d]) => `/${c} — ${h(d)}`));
  return { text: lines.join("\n"), extra: buttons([[{ text: "ArcPad", url: `${SITE}/arc` }, { text: "CirclePad", url: `${SITE}/circle` }], [{ text: "ARCIA 402", url: `${SITE}/arc#arcia402` }, { text: "X @ARCIAonArc", url: "https://x.com/ARCIAonArc" }]]) };
}
async function cmdStatus(S) {
  const [wh, d] = await Promise.all([tg("getWebhookInfo"), A402.stats().catch(() => null)]);
  const u = S.usage[day()] || {};
  const answered = Object.values(u).reduce((s, n) => s + n, 0);
  const on = (k) => (env(k) ? "on" : "off");
  return [
    "<b>Status</b>",
    `Bot: @${h((S.me || {}).username || "?")} · webhook ${wh.ok && wh.result.url ? "✓" : "✗"}${wh.ok && wh.result.pending_update_count ? ` · ${wh.result.pending_update_count} waiting` : ""}${wh.ok && wh.result.last_error_message ? `\nLast error: ${h(wh.result.last_error_message)}` : ""}`,
    `Chats today: ${answered} answers · admins ${S.admins.length} · announce targets ${S.targets.length}`,
    d ? `ARCIA 402: wallet ${h(short(d.wallet || ""))} · USDC ${d.balances.usdc == null ? "—" : "$" + d.balances.usdc.toFixed(2)} · key ${d.canPay ? (d.keyMatches === false ? "set (≠ published wallet!)" : "✓") : "not set"} · sell ${d.paused.sell ? "paused" : "on"} · hire ${d.paused.hire ? "paused" : "on"}` : "ARCIA 402: unreadable",
    `X: replies ${on("ARCIA_X_ENABLED")} · posts ${on("ARCIA_X_POSTS")} · model key ${on("ANTHROPIC_API_KEY")} · store ${storeEnabled() ? "on" : "off"}`,
  ].join("\n");
}
async function cmdReport(S, lang) {
  const [p, r, b] = await Promise.all([cmdPrice(lang), cmdRound(lang), cmdBooks(lang)]);
  const u = S.usage[day()] || {};
  return [typeof p === "string" ? p : p.text, "", typeof r === "string" ? r : r.text, "", typeof b === "string" ? b : b.text, "", `Telegram today: ${Object.values(u).reduce((s, n) => s + n, 0)} answers to ${Object.keys(u).length} people`].join("\n");
}

// ---------------- chat as ARCIA ----------------
async function chat(S, m, text, lang, group) {
  const uid = m.from.id, today = day();
  const u = (S.usage[today] = S.usage[today] || {});
  const total = Object.values(u).reduce((s, n) => s + n, 0);
  if (!isAdmin(S, uid) && ((u[uid] || 0) >= (group ? LIMIT.group : LIMIT.dm) || total >= LIMIT.all)) return { text: w("limit", lang), plain: true };
  tg("sendChatAction", { chat_id: m.chat.id, action: "typing" });
  const ck = `tgArciaConv/${m.chat.id}_${group ? uid : "dm"}`;
  const st = store();
  const prev = mem.conv.get(ck) || (st && (await st.get(ck).catch(() => null))) || { turns: [] };
  const turns = (prev.turns || []).filter((t) => Date.now() - t.t < 6 * 3600e3).slice(-6);
  const messages = [...turns.map((t) => ({ role: t.r, content: t.c })), { role: "user", content: text.slice(0, 1500) }];
  const L = await live(SITE).catch(() => null);
  const who = [m.from.first_name, m.from.username ? "@" + m.from.username : ""].filter(Boolean).join(" ");
  const reply = await askClaude({
    messages, L, maxTokens: 400, timeoutMs: 25000,
    extra: `Reply in the language the person wrote in (English unless they wrote in another language). You are chatting on Telegram${group ? ` in the group "${m.chat.title || ""}" (keep it short; others are reading)` : " in a private chat"}. The person is ${who || "a fan"}. Telegram shows plain text: no markdown, no bold, no bullet lists; links as plain arcircle.app/… text. Useful bot commands you can mention: /price /scan 0x… /coin 0x… /round /drops 0x… /launches /books.`,
  }).catch(() => null);
  if (!reply) return { text: w("busy", lang), plain: true };
  u[uid] = (u[uid] || 0) + 1;
  const next = { turns: [...turns, { r: "user", c: text.slice(0, 1500), t: Date.now() }, { r: "assistant", c: reply.slice(0, 1500), t: Date.now() }].slice(-6) };
  mem.conv.set(ck, next);
  if (st) await st.set(ck, next).catch(() => null);
  return { text: reply, plain: true };
}

// ---------------- the webhook ----------------
async function reply(m, out, group) {
  if (!out) return;
  const o = typeof out === "string" ? { text: out } : out;
  const base = { chat_id: m.chat.id, ...(group ? { reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } } : {}) };
  if (o.plain) return tg("sendMessage", { ...base, text: o.text.slice(0, 4000), link_preview_options: { is_disabled: true } });
  return tg("sendMessage", { ...base, text: o.text.slice(0, 4000), parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(o.extra || {}) });
}
async function onMessage(S, m, channel) {
  const text = String(m.text || m.caption || "").trim();
  if (!text) return;
  const bot = await me(S);
  const cm = text.match(/^\/([a-zA-Z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/);
  if (cm && cm[2] && lc(cm[2]) !== lc(bot.username)) return; // a command for another bot
  const cmd = cm ? lc(cm[1]) : "", arg = cm ? String(cm[3] || "").trim() : "";

  // a channel: only "/here" and "/unhere" (only channel admins can post in a channel)
  if (channel) {
    if (cmd === "here" || cmd === "unhere") await setTarget(S, m.chat, cmd === "here");
    return;
  }
  if (!m.from || m.from.is_bot) return;
  const lang = langOf(m.from), uid = m.from.id, group = m.chat.type === "group" || m.chat.type === "supergroup";
  const admin = isAdmin(S, uid);
  const adminOnly = () => reply(m, w("onlyAdmin", lang), group);

  if (cmd) {
    switch (cmd) {
      case "start": case "help": return reply(m, helpText(S, uid, lang, group), group);
      case "whoami": return reply(m, `Telegram ID: <code>${uid}</code>${admin ? " · admin ✓" : ""}`, group);
      case "admin": return claimAdmin(S, m, arg, lang);
      case "price": return reply(m, await cmdPrice(lang), group);
      case "scan": return reply(m, await cmdScan(arg, lang), group);
      case "coin": return reply(m, await cmdCoin(arg, lang), group);
      case "round": return reply(m, await cmdRound(lang), group);
      case "drops": return reply(m, await cmdDrops(arg, lang), group);
      case "launches": return reply(m, await cmdLaunches(lang), group);
      case "books": return reply(m, await cmdBooks(lang), group);
      case "status": return admin ? reply(m, await cmdStatus(S), group) : adminOnly();
      case "report": return admin ? reply(m, await cmdReport(S, lang), group) : adminOnly();
      case "here": case "unhere":
        if (!admin) return adminOnly();
        if (!group) return reply(m, "Use /here inside a group (or post /here in a channel where I'm an admin).", false);
        await setTarget(S, m.chat, cmd === "here");
        return reply(m, cmd === "here" ? "✓ Announcements will come here." : "✓ No more announcements here.", group);
      case "targets": return admin ? reply(m, S.targets.length ? S.targets.map((t) => `• ${h(t.title || t.id)} <i>${t.type}</i>`).join("\n") : "No announcement targets yet — use /here in a group.", group) : adminOnly();
      case "announce": return admin ? announcePreview(S, m, arg) : adminOnly();
      case "pause402": {
        if (!admin) return adminOnly();
        const r = await A402.setPause(arg || "").catch((e) => ({ error: String(e.message || e) }));
        return reply(m, r.error ? h(r.error) : `ARCIA 402 pause: <b>${h(r.pause)}</b>`, group);
      }
      case "hire": {
        if (!admin) return adminOnly();
        tg("sendChatAction", { chat_id: m.chat.id, action: "typing" });
        const r = await A402.hire({ force: true }).catch((e) => ({ ok: false, error: String(e.message || e) }));
        return reply(m, r.ok ? `✓ Hired ${h(r.hired.provider || r.hired.svc)} for $${(r.hired.amount / 1e6).toFixed(2)}\n<i>${h(r.hired.note || "")}</i>` : `Not hired: ${h(r.skipped || r.error || "unknown")}`, group);
      }
      default: return group ? undefined : reply(m, helpText(S, uid, lang, group), group);
    }
  }
  // plain text: always in a DM; in a group only when mentioned or replied to
  let q = text;
  if (group) {
    const mention = bot.username && new RegExp(`@${bot.username}\\b`, "i").test(text);
    const toMe = m.reply_to_message && m.reply_to_message.from && m.reply_to_message.from.id === bot.id;
    if (!mention && !toMe) return;
    q = text.replace(new RegExp(`@${bot.username}\\b`, "ig"), "").trim() || "hi";
  }
  const out = await chat(S, m, q, lang, group);
  await saveState(S);
  return reply(m, out, group);
}
async function setTarget(S, chat, on) {
  S.targets = S.targets.filter((t) => t.id !== chat.id);
  if (on) S.targets.push({ id: chat.id, title: chat.title || chat.username || String(chat.id), type: chat.type });
  await saveState(S);
  if (chat.type === "channel") await send(chat.id, on ? "✓ ARCIA will post announcements here." : "✓ No more announcements here.");
}
async function claimAdmin(S, m, arg, lang) {
  if (m.chat.type !== "private") return reply(m, "Send /admin CODE to me in a private chat.", true);
  const uid = m.from.id, n = mem.tries.get(uid) || 0;
  if (n >= 5) return reply(m, "Too many tries — ask for a new code later.", false);
  const c = S.claim;
  if (!c || Date.now() > c.exp || String(arg).trim() !== c.code) { mem.tries.set(uid, n + 1); return reply(m, "That code isn't valid (codes last 10 minutes and work once).", false); }
  if (!S.admins.includes(uid)) S.admins.push(uid);
  S.claim = null;
  await saveState(S);
  await tg("setMyCommands", { commands: [...PUBLIC_CMDS.map((x) => ({ command: x[0], description: x[1] })), ...ADMIN_CMDS.map(([command, description]) => ({ command, description }))], scope: { type: "chat", chat_id: uid } });
  return reply(m, `✓ You're an ARCIA admin now (ID <code>${uid}</code>). Try /status, or add me to your group and send /here there.`, false);
}
async function announcePreview(S, m, text) {
  if (!text) return reply(m, "Write it after the command: /announce Your message", false);
  if (!S.targets.length) return reply(m, "No announcement targets yet — add me to a group or channel, make me an admin, and send /here there.", false);
  const id = Math.random().toString(36).slice(2, 10);
  S.pending[id] = { text: text.slice(0, 3500), by: m.from.id, t: Date.now() };
  await saveState(S);
  return tg("sendMessage", {
    chat_id: m.chat.id, text: `📣 Preview — goes to ${S.targets.length} chat${S.targets.length === 1 ? "" : "s"} (${S.targets.map((t) => t.title).join(", ")}):\n\n${text.slice(0, 3500)}`,
    link_preview_options: { is_disabled: true }, ...buttons([[{ text: "✓ Post it", callback_data: `ann:ok:${id}` }, { text: "Cancel", callback_data: `ann:no:${id}` }]]),
  });
}
async function onCallback(S, q) {
  const [kind, act, id] = String(q.data || "").split(":");
  if (kind !== "ann") return tg("answerCallbackQuery", { callback_query_id: q.id });
  if (!isAdmin(S, q.from.id)) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Admins only", show_alert: true });
  const p = S.pending[id];
  if (!p) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Already handled or expired" });
  delete S.pending[id];
  await saveState(S);
  if (act !== "ok") {
    await tg("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: "Cancelled." });
    return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Cancelled" });
  }
  let ok = 0;
  for (const t of S.targets) { const r = await tg("sendMessage", { chat_id: t.id, text: p.text, link_preview_options: { is_disabled: false } }); if (r.ok) ok++; }
  await tg("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: `✓ Posted to ${ok}/${S.targets.length} chats.\n\n${p.text}`.slice(0, 4000) });
  return tg("answerCallbackQuery", { callback_query_id: q.id, text: `Posted to ${ok}` });
}
async function onMember(S, u) {
  const n = u.new_chat_member || {};
  if (!["member", "administrator"].includes(n.status) || ["member", "administrator"].includes((u.old_chat_member || {}).status)) return;
  if (u.chat.type === "channel") return;
  const lang = langOf(u.from);
  return send(u.chat.id, `${w("hello", lang)}\n${w("groupHint", lang)} /help`);
}

// ---------------- setup ----------------
async function setup() {
  const secret = env("TG_ARCIA_SECRET");
  if (!env("TG_ARCIA_BOT_TOKEN")) return { ok: false, error: "TG_ARCIA_BOT_TOKEN isn't set in Vercel (and the site needs a redeploy after adding it)" };
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) return { ok: false, error: "TG_ARCIA_SECRET is missing or not 16+ letters/digits/_/-" };
  const S = await loadState();
  const got = await tg("getMe");
  if (!got.ok) return { ok: false, error: "Telegram didn't accept the token: " + (got.description || "unknown") };
  S.me = { id: got.result.id, username: got.result.username };
  await saveState(S);
  const hook = await tg("setWebhook", { url: `${SITE}/api/arcia-tg`, secret_token: secret, allowed_updates: ["message", "callback_query", "channel_post", "my_chat_member"], max_connections: 10, drop_pending_updates: true });
  const cmds = await Promise.all([
    tg("setMyCommands", { commands: PUBLIC_CMDS.map((x) => ({ command: x[0], description: x[1] })) }),
    // English everywhere: clear the Korean / Chinese menus and descriptions an earlier setup added
    tg("deleteMyCommands", { language_code: "ko" }),
    tg("deleteMyCommands", { language_code: "zh" }),
    tg("setMyDescription", { description: "", language_code: "ko" }),
    tg("setMyShortDescription", { short_description: "", language_code: "ko" }),
    tg("setMyDescription", { description: "Hi, I'm ARCIA — the virtual idol of $ARCIRCLE on Circle's Arc 💙💚 Ask me about ARCIRCLE PAD, ArcPad, CirclePad and $ARCIRCLE, or use /price /scan /round. I'm an AI character run by @ARCIRCLEonArc. Not financial advice." }),
    tg("setMyShortDescription", { short_description: "ARCIA — the virtual idol of $ARCIRCLE on Arc. Live numbers, scans and chat. arcircle.app" }),
  ]);
  for (const a of S.admins) await tg("setMyCommands", { commands: [...PUBLIC_CMDS.map((x) => ({ command: x[0], description: x[1] })), ...ADMIN_CMDS.map(([command, description]) => ({ command, description }))], scope: { type: "chat", chat_id: a } });
  return { ok: !!hook.ok, bot: "@" + S.me.username, webhook: hook.ok ? "connected" : hook.description, menus: cmds.every((c) => c.ok) ? "set" : cmds.filter((c) => !c.ok).map((c) => c.description), admins: S.admins.length, next: S.admins.length ? "add me to your group, make me an admin, send /here there" : "open ?claim=1&key=… for an admin code" };
}

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  const secret = env("CRON_SECRET");
  if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json(401, { error: "unauthorized" });
  try {
    if (q.setup) return json(200, await setup());
    if (q.claim) {
      const S = await loadState();
      const code = String(Math.floor(10000000 + Math.random() * 89999999));
      S.claim = { code, exp: Date.now() + 10 * 60e3 };
      await saveState(S);
      const bot = await me(S);
      return json(200, { code, expires_in: "10 minutes, one use", how: `Open @${bot.username || "your bot"} in a private chat and send: /admin ${code}` });
    }
    if (q.status) {
      const S = await loadState();
      const [wh, bot] = await Promise.all([tg("getWebhookInfo"), me(S)]);
      return json(200, { bot: bot.username ? "@" + bot.username : null, webhook: wh.ok ? { connected: wh.result.url === `${SITE}/api/arcia-tg`, pending: wh.result.pending_update_count, last_error: wh.result.last_error_message || null } : wh.description, admins: S.admins.length, targets: S.targets.map((t) => ({ title: t.title, type: t.type })) });
    }
    return json(400, { error: "use ?setup=1, ?claim=1 or ?status=1" });
  } catch (e) { return json(500, { error: String(e && e.message || e).slice(0, 200) }); }
}

export async function POST(req) {
  const secret = env("TG_ARCIA_SECRET");
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return json(401, { error: "unauthorized" });
  let u;
  try { u = await req.json(); } catch { return json(200, { ok: true }); }
  try {
    const S = await loadState();
    // Telegram re-sends an update it thinks failed; answer each one once
    if (mem.seen.has(u.update_id) || S.seen.includes(u.update_id)) return json(200, { ok: true });
    mem.seen.add(u.update_id); S.seen.push(u.update_id);
    if (mem.seen.size > 500) mem.seen.clear();
    await saveState(S);
    if (u.callback_query) await onCallback(S, u.callback_query);
    else if (u.message) await onMessage(S, u.message, false);
    else if (u.channel_post) await onMessage(S, u.channel_post, true);
    else if (u.my_chat_member) await onMember(S, u.my_chat_member);
  } catch (e) { console.error("arcia-tg", String(e && e.message || e).slice(0, 300)); }
  return json(200, { ok: true });
}
