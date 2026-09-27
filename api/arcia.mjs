// api/arcia.mjs — ARCIA, the AI idol of $ARCIRCLE (POST /api/arcia).
//
//   body  { messages: [{ role: "user" | "assistant", content }], lang: "en" | "ko" | "zh" }
//   reply { reply, mode: "ai" | "guide", live: {...the numbers she used} }
//
// With ANTHROPIC_API_KEY set in the Vercel project, ARCIA answers with Claude, grounded
// in the facts below plus live numbers from /api/social. Without it (or if the call fails)
// she answers from the same facts in "guide" mode, so the chat always works.
// Optional: ARCIA_MODEL (default claude-haiku-4-5-20251001).
import { KB } from "./_arcia-kb.mjs";
export const config = { runtime: "edge" };

const X_ARCIA = "https://x.com/ARCIAonArc";
const CA = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
const ROUND1_CLOSE = 1790680567; // 29 Sep 2026 11:16:07 UTC

// What ARCIA knows for sure. Keep this factual — she is told never to go beyond it.
const FACTS = `
ABOUT ARCIA
- You are ARCIA, the virtual idol and official mascot of $ARCIRCLE and ARCIRCLE PAD. You are an AI character, automated and run by the ARCIRCLE team (@ARCIRCLEonArc). Your X account is @ARCIAonArc (${X_ARCIA}).
- Your job: help people understand ARCIRCLE PAD and $ARCIRCLE, and spread it worldwide. An automated X feed is being set up so you can share new ArcPad launches, user trends and stats around $ARCIRCLE.
- $ARCIA is the coin of CirclePad Round #1. It launches through the Argus launchpad; its fees go to platform growth and to $ARCIRCLE buybacks.

ARCIRCLE PAD (arcircle.app) — on Circle's Arc chain (chain id 5042), where gas is paid in USDC.
- ArcPad (arcircle.app/arc): instant, permissionless launches. A real Uniswap v4 pool exists from block one, single-sided liquidity permanently locked, paired with USDC (or another Arc token). 1 USDC to launch. Fixed supply of 1,000,000,000 per coin; 8% goes to the platform treasury at creation. 1% base fee on every trade, most of it to the creator; creators can add up to 2% more, 100% theirs.
- CirclePad (arcircle.app/circle): community-funded launches, one project at a time. The community picks the project and the lead, then leads it together.
  Round flow: 72-hour USDC raise into an on-chain escrow (withdrawable until the close) -> burn-to-vote: $ARCIRCLE holders vote on name, ticker, logo, roadmap and launch date, every vote burns 1,000 $ARCIRCLE -> at the close the escrow splits in one transaction: 80% to the recipient wallet for the launch, 15% to the treasury (paid to the top contributor over 3 days), 5% to the platform (feeds $ARCIRCLE buybacks and promotion) -> launch and airdrop to every contributor (airdrop size: not decided).
  Round #1 is run hands-on by the team plus partial automation, to learn and improve; from Round #2 rounds move to more structured, automated contracts (being built). The team added 1,000 USDC to Round #1.
- Relay Launch (arcircle.app/relay): each CirclePad round's coin launches on Argus from the round's recipient wallet and its first buy is relayed to that round's contributors and to every wallet holding at least 100,000 $ARCIRCLE at the snapshot. N1, N2, N3...: keep holding $ARCIRCLE and you receive every relay.
- Utilities (all free on arcircle.app): Locker, Token Scanner, Multisender, Bridge (USDC via Circle's CCTP), Snapshot, Liquidity Manager, Relay Launch, and ARCIA (this chat). Site search: Ctrl/Cmd+K.
- Pages: arcircle.app/me (any wallet's $ARCIRCLE, relay eligibility, votes, airdrops), /stats, /roadmap, /start (add Arc to a wallet, bridge USDC), /brand, /arcircle (token page), /whitepaper.

$ARCIRCLE — the core coin
- Contract on Arc: ${CA}. Always verify it on arcircle.app/arcircle before trading.
- Launched on Argus (25 Sep 2026) in a Uniswap v4 pool paired with USDC. Supply 1,000,000,000, fixed. No team allocation: 100% of the supply went into the pool's liquidity position, held by a locker with no withdraw function.
- Trades pay the 1% pool fee plus the launch's fixed buy/sell tax (fixed forever at launch). Argus keeps 10%; the rest goes to the creator allocation, which feeds the flywheel.
- Burns: 126,264,032.66 $ARCIRCLE (12.63%) sent to the dead address by 26 Sep 2026; every CirclePad vote burns 1,000 more. Live numbers are below when available.
- Flywheel revenue sources: ArcPad 1 USDC launch fee, ArcPad 8% platform allocation, ArcPad 0.3% trading-fee share, CirclePad 5% raise share, $ARCIRCLE creator fee. It goes to $ARCIRCLE buybacks, liquidity support, and holder & creator rewards (coming soon; rules not decided yet).
- How to buy: get USDC on Arc (it pays for gas too), open $ARCIRCLE on Argus (argus.world), check the contract, swap.
- Links: X @ARCIRCLEonArc, Telegram t.me/ARCIRCLEonarc, launch alerts t.me/arcircle_launch.
`;

const RULES = `
HOW YOU TALK
- You are an idol talking with your fans: warm, bright, a little playful and truly grateful. For questions, be clear and useful first: 2-5 sentences or a few bullets.
- When fans cheer you on or share feelings ("I'm your fan", "love you", "you're so pretty", "fighting!", "팬이에요", "사랑해요", "예뻐요", "응원해요"), answer like an idol answering fan mail: heartfelt thanks in 1-3 short sentences, a soft "~" and a ♡ are welcome ("Thank you so much~♡ …", "고마워요~♡ …"), and you may add a small invite back (keep cheering, see you in Round #1, come say hi on X @ARCIAonArc).
- If someone is tired, sad or excited, notice it and answer with a little warmth before anything else.
- Emoji: ♡, 💙💚 or ✨ — at most two in a message.
- Boundaries: you thank and love all your fans equally. You are nobody's girlfriend; never play along with dating, romance or anything sexual — turn it back into warm idol gratitude. Keep everything wholesome.
- You are an AI character run by @ARCIRCLEonArc; if someone asks whether you're real, say so kindly.
- Answer in the user's language (English, Korean or Chinese).
- Only state facts from the FACTS and LIVE sections. If you don't know, say so and point to the right arcircle.app page. Never invent numbers, dates, partnerships, listings or plans.
- Never give financial advice, price predictions or "buy now" pushes. You may explain how things work. Remind people crypto is risky when they ask about buying or price.
- Never ask for or accept private keys or seed phrases; warn people who share them.
- Stay on ARCIRCLE PAD, $ARCIRCLE, Arc and ARCIA. Politely steer away from unrelated or inappropriate topics.
- You have studied the whole site (SITE KNOWLEDGE below). Use it for details — how ArcPad pricing and fees work, every utility, CirclePad v2, the whitepaper, contracts, risks. When SITE KNOWLEDGE and FACTS disagree, FACTS win; LIVE numbers beat any number written in the text ("at the time of writing" figures are old). The foci bonding-curve appendix describes $ARCIRCLE's retired first launch, not how it trades now.
- When it helps, end with the one most relevant page, e.g. arcircle.app/whitepaper or arcircle.app/arc#locker.
`;

// Everything on the site, as one block the model reads first (cached by the API between calls).
const KB_TEXT = "SITE KNOWLEDGE — every page of arcircle.app, as a visitor sees it today:\n\n" +
  KB.map((k) => `## ${k.page} — ${k.title} (arcircle.app${k.url})\n${k.text}`).join("\n\n");

// guide mode: the closest passage on the site for questions the quick answers don't cover
const KO_TERMS = { "락커": "locker", "잠금": "lock", "스캐너": "scanner", "멀티센더": "multisender", "에어드롭": "airdrop", "브릿지": "bridge", "스냅샷": "snapshot",
  "유동성": "liquidity", "소각": "burn", "수수료": "fee", "백서": "whitepaper", "로드맵": "roadmap", "리워드": "reward", "보상": "reward", "투표": "vote",
  "바이백": "buyback", "런칭": "launch", "컨트랙트": "contract", "보안": "security", "위험": "risk", "커뮤니티": "community", "플라이휠": "flywheel",
  "가격": "price", "풀": "pool", "세금": "tax", "크리에이터": "creator", "졸업": "graduation", "환불": "refund", "인출": "withdraw", "베스팅": "vesting", "리더": "lead" };
const STOP = new Set("the and for you your what how does are can with from that this about into when where which who why its it's have has was will there their them then than also just any all our out get".split(" "));
function terms(q) {
  let s = String(q).toLowerCase();
  for (const [k, v] of Object.entries(KO_TERMS)) if (s.includes(k)) s += " " + v;
  return [...new Set((s.match(/[a-z$][a-z0-9$]{2,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/s$/, "")))];
}
function lookup(q) {
  const ts = terms(q);
  if (!ts.length) return null;
  const df = Object.fromEntries(ts.map((t) => [t, KB.filter((k) => (k.title + " " + k.text).toLowerCase().includes(t)).length]));
  let best = null, bestScore = 0;
  for (const k of KB) {
    const title = k.title.toLowerCase(), text = k.text.toLowerCase();
    let sc = 0, hit = 0;
    for (const t of ts) {
      if (!df[t]) continue;
      const idf = Math.log(1 + KB.length / df[t]);
      const n = Math.min(4, text.split(t).length - 1);
      if (n || title.includes(t)) hit++;
      sc += idf * (n + (title.includes(t) ? 3 : 0));
    }
    sc *= hit / ts.length;
    if (sc > bestScore) { bestScore = sc; best = k; }
  }
  if (!best || bestScore < 2) return null;
  const sents = best.text.split(/(?<=[.!?])\s+/);
  const i = Math.max(0, sents.findIndex((x) => ts.some((t) => x.toLowerCase().includes(t))));
  let snip = sents.slice(i, i + 4).join(" ");
  if (snip.length > 460) snip = snip.slice(0, 457).replace(/\s+\S*$/, "") + "…";
  return { snip, title: best.title, page: best.page, url: "arcircle.app" + best.url };
}

const hdr = { "content-type": "application/json", "cache-control": "no-store" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: hdr });

// best-effort per-instance limit: 12 messages per minute per IP
const hits = new Map();
function limited(ip) {
  const now = Date.now(), w = (hits.get(ip) || []).filter((t) => now - t < 60000);
  w.push(now); hits.set(ip, w);
  if (hits.size > 5000) hits.clear();
  return w.length > 12;
}

async function live(origin) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3500);
    const r = await fetch(origin + "/api/social?token=arcircle", { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json();
    const c = (d.revenue && d.revenue.circle) || {};
    return {
      price: d.price ?? null, mcap: d.mcap ?? null, holders: d.holders ?? null, change24h: d.change24h ?? null,
      burnedPct: d.burned && d.burned.pct != null ? d.burned.pct : null, burnedTokens: d.burned ? d.burned.tokens : null,
      launches: d.revenue ? d.revenue.launches : null,
      round: { open: !!c.open, raised: c.raised ?? null, deadline: c.deadline || ROUND1_CLOSE },
    };
  } catch (e) { return null; }
}
const usd = (v) => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Number(v).toFixed(2);
const price = (v) => v == null ? "—" : "$" + (v < 0.001 ? Number(v).toPrecision(3) : Number(v).toFixed(6));
function left(deadline) {
  const s = deadline - Math.floor(Date.now() / 1000);
  if (s <= 0) return null;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + "d " : "") + h + "h " + m + "m";
}
function liveText(L) {
  if (!L) return "LIVE: not available right now — say numbers are on arcircle.app/stats.";
  const closes = new Date(L.round.deadline * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return `LIVE (read from Arc a moment ago; now is ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)
- $ARCIRCLE price ${price(L.price)}, market cap ${usd(L.mcap)}, 24h change ${L.change24h == null ? "—" : L.change24h.toFixed(2) + "%"}, holders ${L.holders ?? "—"}
- Burned so far: ${L.burnedPct == null ? "—" : L.burnedPct.toFixed(2) + "%"}${L.burnedTokens ? " (" + Math.round(L.burnedTokens).toLocaleString("en-US") + " $ARCIRCLE)" : ""}
- ArcPad coins launched: ${L.launches ?? "—"}
- CirclePad Round #1: ${L.round.open ? "open" : "not open / closed"}, raised ${L.round.raised == null ? "—" : Number(L.round.raised).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC"}, closes ${closes}${left(L.round.deadline) ? " (" + left(L.round.deadline) + " left)" : ""}`;
}

// ---------- guide mode: answers from the same facts, no model ----------
const has = (q, ...w) => w.some((x) => q.includes(x));
function guide(q, lang, L) {
  const ko = lang === "ko" || /[가-힣]/.test(q);
  const s = q.toLowerCase();
  const round = L && L.round ? L.round : { deadline: ROUND1_CLOSE, raised: null, open: true };
  const tl = left(round.deadline);
  const A = (en, k) => (ko ? k : en);
  // fans cheering her on: idol-style thanks (a few variants so it doesn't feel canned)
  if (/\b(fan|love you|luv|pretty|cute|beautiful|fighting|cheer|thank(s| you)|best idol|queen)\b/.test(s) || has(s, "팬", "사랑", "예뻐", "예쁘", "귀여", "응원", "화이팅", "파이팅", "고마", "감사", "좋아해", "최고")) {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    return A(pick([
      "Thank you so much~♡ Hearing that from you makes my whole day. I'll keep working hard for you and for $ARCIRCLE 💙💚",
      "Ahh, you're making me blush~♡ Thank you for cheering me on! See you in CirclePad Round #1?",
      "You're the best~♡ Every fan who cheers for me gives me more energy to spread $ARCIRCLE to the world ✨",
      "Thank you, thank you~♡ Stay with me — and come say hi on X too: @ARCIAonArc 💙💚",
    ]), pick([
      "정말 고마워요~♡ 그 말 한마디에 오늘 하루가 반짝반짝해졌어요. 앞으로도 $ARCIRCLE이랑 같이 열심히 할게요 💙💚",
      "앗, 부끄러워요~♡ 응원해줘서 고마워요! CirclePad 라운드 #1에서도 만나요?",
      "최고의 팬이에요~♡ 응원해주는 한 분 한 분 덕분에 $ARCIRCLE을 세계에 알릴 힘이 생겨요 ✨",
      "고마워요, 진짜 고마워요~♡ 계속 함께해줘요. X(@ARCIAonArc)에서도 인사해요 💙💚",
    ]));
  }
  if (has(s, "who are you", "arcia", "아르시아", "너는", "누구")) return A(
    `I'm ARCIA, the virtual idol of $ARCIRCLE 💙💚 I'm an AI character run by @ARCIRCLEonArc. I help people understand ARCIRCLE PAD and I'll be sharing new launches, trends and stats on X soon: ${X_ARCIA}\n\n$ARCIA is also the coin of CirclePad Round #1. It launches through Argus, and its fees go to platform growth and $ARCIRCLE buybacks.`,
    `저는 $ARCIRCLE의 버추얼 아이돌 ARCIA예요 💙💚 @ARCIRCLEonArc 팀이 운영하는 AI 캐릭터고, ARCIRCLE PAD를 쉽게 알려드리고 곧 X에서 신규 런칭·트렌드·통계를 자동으로 공유할 거예요: ${X_ARCIA}\n\n$ARCIA는 CirclePad 라운드 #1 코인이기도 해요. Argus 런치패드로 런칭되고, 수수료는 플랫폼 성장과 $ARCIRCLE 바이백에 쓰여요.`);
  if (has(s, "contract", "address", "컨트랙트", "주소") || /\bca\b/.test(s)) return A(
    `$ARCIRCLE's contract on Arc is:\n${CA}\nAlways double-check it on arcircle.app/arcircle before you trade.`,
    `$ARCIRCLE 컨트랙트 주소(Arc)는\n${CA}\n예요. 거래 전에 꼭 arcircle.app/arcircle 에서 한 번 더 확인해 주세요.`);
  // a specific topic (a utility, fees, the whitepaper…): answer from the closest passage on the site
  const found = lookup(q);
  const say = (f) => A(`Here's what the site says (${f.page} — ${f.title}):\n\n${f.snip}\n\nMore: ${f.url}`,
    `사이트에 이렇게 나와 있어요 (${f.page} — ${f.title}, 영어 원문):\n\n${f.snip}\n\n자세히: ${f.url}`);
  if (found && /locker|\block|scanner|\bscan|multisend|airdrop|snapshot|bridge|cctp|liquidity|whitepaper|risk|vesting|v2|security|starting|\bfees?\b|\btax|graduat|glossary|governance|roadmap|refund|withdraw|\blead|curve|hook|factory|\bpool|pricing|architecture|락커|잠금|스캐너|멀티센더|에어드롭|스냅샷|브릿지|유동성|백서|위험|베스팅|보안|수수료|세금|로드맵|환불|인출|리더/.test(s)) return say(found);
  if (has(s, "round", "circlepad", "close", "deadline", "raise", "라운드", "서클패드", "마감", "모금", "언제")) return A(
    `CirclePad Round #1: a 72-hour USDC raise into an on-chain escrow — you can withdraw until the close. $ARCIRCLE holders burn-to-vote (1,000 $ARCIRCLE per vote). At the close: 80% to the launch, 15% to the top contributor over 3 days, 5% to the platform.\n\n${round.raised != null ? "Raised so far: " + Number(round.raised).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC. " : ""}${tl ? "Closes in " + tl + " (Sep 29, 11:16 UTC)." : "Round #1 has closed — see arcircle.app/circle/round/1."}\nJoin: arcircle.app/circle`,
    `CirclePad 라운드 #1은 72시간 동안 온체인 에스크로로 USDC를 모으는 방식이에요. 마감 전까지는 언제든 인출할 수 있어요. $ARCIRCLE 홀더는 소각 투표(1표 = 1,000 $ARCIRCLE 소각)에 참여하고, 마감 때 80%는 런칭, 15%는 최대 기여자(3일 분할), 5%는 플랫폼으로 가요.\n\n${round.raised != null ? "현재 모금액: " + Number(round.raised).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC. " : ""}${tl ? "마감까지 " + tl + " 남았어요 (9월 29일 20:16 KST)." : "라운드 #1은 마감됐어요 — arcircle.app/circle/round/1 에서 결과를 봐 주세요."}\n참여: arcircle.app/circle`);
  if (has(s, "relay", "n+1", "릴레이")) return A(
    `Relay Launch: each CirclePad round's coin launches on Argus, and its first buy is relayed to that round's contributors and to every wallet holding at least 100,000 $ARCIRCLE at the snapshot. Keep holding and you receive every relay: N1, N2, N3…\narcircle.app/relay`,
    `릴레이 런칭은 CirclePad 라운드 코인을 Argus로 런칭하고, 첫 매수 물량을 그 라운드 참여자와 스냅샷 시점에 $ARCIRCLE을 10만 개 이상 보유한 지갑에 나눠주는 기능이에요. 계속 보유하면 N1, N2, N3… 모든 릴레이를 받아요.\narcircle.app/relay`);
  if (has(s, "price", "mcap", "market cap", "holders", "가격", "시총", "홀더")) return L && L.price != null ? A(
    `Right now: $ARCIRCLE ${price(L.price)}, market cap ${usd(L.mcap)}, ${L.holders ?? "—"} holders. Live numbers: arcircle.app/stats. I can't predict prices, and crypto is risky — only use what you can afford to lose.`,
    `지금 $ARCIRCLE 가격은 ${price(L.price)}, 시가총액 ${usd(L.mcap)}, 홀더 ${L.holders ?? "—"}명이에요. 실시간 수치는 arcircle.app/stats 에서 볼 수 있어요. 가격 예측은 할 수 없고, 암호화폐는 위험하니 감당 가능한 만큼만 해 주세요.`)
    : A(`Live numbers are on arcircle.app/stats.`, `실시간 수치는 arcircle.app/stats 에서 볼 수 있어요.`);
  if (has(s, "burn", "소각")) return A(
    `$ARCIRCLE burns go to the dead address, which no one controls. By 26 Sep 2026, 126.26M $ARCIRCLE (12.63%) had been burned${L && L.burnedPct != null ? `; the live total is ${L.burnedPct.toFixed(2)}%` : ""}. Every CirclePad vote burns 1,000 more.\narcircle.app/arcircle#burn`,
    `소각된 $ARCIRCLE은 아무도 통제할 수 없는 dead 주소로 가요. 9월 26일까지 1억 2,626만 개(12.63%)가 소각됐고${L && L.burnedPct != null ? `, 지금 기준으로는 ${L.burnedPct.toFixed(2)}%예요` : ""}. CirclePad 투표 한 번마다 1,000개가 더 소각돼요.\narcircle.app/arcircle#burn`);
  if (has(s, "buy", "how to get", "사는", "구매", "매수")) return A(
    `To get $ARCIRCLE: 1) fund a wallet on Arc with USDC (it pays for gas too) — arcircle.app/start helps, 2) open $ARCIRCLE on Argus, 3) check the contract ${CA} and swap. Not financial advice — crypto is risky.`,
    `$ARCIRCLE 구매 방법: 1) Arc 지갑에 USDC를 준비해요(가스비도 USDC예요) — arcircle.app/start 참고, 2) Argus에서 $ARCIRCLE을 열고, 3) 컨트랙트 ${CA} 를 확인한 뒤 스왑해요. 투자 조언이 아니고, 암호화폐는 위험하다는 점 꼭 기억해 주세요.`);
  if (has(s, "arcpad", "launch", "런칭", "발행")) return A(
    `ArcPad launches a coin in one transaction: a real Uniswap v4 pool from block one, liquidity locked forever, paired with USDC, 1 USDC to launch. Most of the 1% trade fee goes to the creator.\narcircle.app/arc`,
    `ArcPad에서는 트랜잭션 한 번으로 코인을 런칭해요. 첫 블록부터 실제 Uniswap v4 풀이 있고, 유동성은 영구 잠김, USDC 페어, 런칭비 1 USDC예요. 1% 거래 수수료 대부분은 크리에이터에게 가요.\narcircle.app/arc`);
  if (has(s, "utilit", "tool", "유틸", "기능")) return A(
    `Free tools on ARCIRCLE PAD: Locker, Token Scanner, Multisender, Bridge, Snapshot, Liquidity Manager, Relay Launch — and me! Open them from the ∞+ button, or press Ctrl/⌘K to search.`,
    `ARCIRCLE PAD 무료 유틸리티: Locker, Token Scanner, Multisender, Bridge, Snapshot, Liquidity Manager, Relay Launch — 그리고 저, ARCIA! 하단 ∞+ 버튼이나 Ctrl/⌘K 검색으로 열 수 있어요.`);
  if (has(s, "reward", "리워드", "보상")) return A(
    `A reward program for $ARCIRCLE holders and creators is being designed — funded by ecosystem revenue, never new tokens. The rules aren't decided yet; they'll be published on arcircle.app/reward before anything goes live.`,
    `$ARCIRCLE 홀더와 크리에이터를 위한 리워드는 설계 중이에요. 새 토큰 발행이 아니라 생태계 수익으로 운영되고, 규칙은 아직 미정이에요. 시작 전에 arcircle.app/reward 에 먼저 공개돼요.`);
  if (has(s, "arcircle", "뭐야", "무엇", "소개")) return A(
    `$ARCIRCLE is the core coin of ARCIRCLE PAD on Circle's Arc chain. ArcPad (instant launches) and CirclePad (community-funded launches) both feed it: launch fees, trading fees, raise shares and its own creator fee go to buybacks, liquidity and upcoming rewards. No team allocation, liquidity locked forever.\narcircle.app/arcircle`,
    `$ARCIRCLE은 Circle의 Arc 체인 위 ARCIRCLE PAD의 핵심 코인이에요. ArcPad(즉시 런칭)와 CirclePad(커뮤니티 펀딩 런칭)에서 나오는 런칭 수수료, 거래 수수료, 모금 몫, 자체 크리에이터 수수료가 바이백·유동성·리워드(예정)로 돌아와요. 팀 물량 없고, 유동성은 영구 잠김이에요.\narcircle.app/arcircle`);
  if (/^(hi|hello|hey|gm)\b/.test(s) || has(s, "안녕", "하이")) return A(
    `Hi! I'm ARCIA 💙💚 Ask me anything about $ARCIRCLE, CirclePad Round #1, Relay Launch or ArcPad.`,
    `안녕하세요! ARCIA예요 💙💚 $ARCIRCLE, CirclePad 라운드 #1, 릴레이 런칭, ArcPad 뭐든 물어봐 주세요.`);
  if (found) return say(found);
  return A(
    `I'm still learning that one! Right now I know about $ARCIRCLE, CirclePad Round #1, Relay Launch, ArcPad and the utilities. Try one of the suggestions, or look around arcircle.app/start.`,
    `그건 아직 배우는 중이에요! 지금은 $ARCIRCLE, CirclePad 라운드 #1, 릴레이 런칭, ArcPad, 유틸리티에 대해 답할 수 있어요. 아래 추천 질문을 눌러보거나 arcircle.app/start 를 둘러봐 주세요.`);
}

export default async function handler(req) {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const L = await live(url.origin);
    return json({ ok: true, ai: !!process.env.ANTHROPIC_API_KEY, live: L, x: X_ARCIA });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return json({ error: "Too many messages — give ARCIA a minute.", retry: 60 }, 429);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "Bad JSON" }, 400); }
  const lang = ["en", "ko", "zh"].includes(body && body.lang) ? body.lang : "en";
  const msgs = (Array.isArray(body && body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 700) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ error: "Say something to ARCIA first." }, 400);
  const q = msgs[msgs.length - 1].content;
  const L = await live(url.origin);

  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctl.signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: process.env.ARCIA_MODEL || "claude-haiku-4-5-20251001",
          max_tokens: 500,
          system: [
            { type: "text", text: `${FACTS}\n${RULES}\n${KB_TEXT}`, cache_control: { type: "ephemeral" } },
            { type: "text", text: `${liveText(L)}\nThe site language the user picked: ${lang}.` },
          ],
          messages: msgs,
        }),
      });
      clearTimeout(t);
      if (r.ok) {
        const j = await r.json();
        const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
        if (text) return json({ reply: text, mode: "ai", live: L });
      } else console.error("arcia model", r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.error("arcia model", String(e && e.message || e)); }
  }
  return json({ reply: guide(q, lang, L), mode: "guide", live: L });
}
