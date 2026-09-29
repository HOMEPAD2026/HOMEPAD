// api/arcia.mjs — ARCIA, the AI idol of $ARCIRCLE.
//
//   POST /api/arcia  { messages: [{ role, content }], lang, name?, wallet?, stream? }
//        stream: true  → application/x-ndjson, one JSON per line:
//                        {type:"meta", mode:"ai", live, me}  {type:"d", t:"…"}…  {type:"end"}
//        otherwise / guide mode → JSON { reply, mode: "ai" | "guide", live, me }
//   POST /api/arcia  { action: "letter", name, text, lang }   leave ARCIA a fan letter (she reads and answers it)
//   POST /api/arcia  { action: "heart", id }                   heart a letter
//   POST /api/arcia  { action: "cheer", n }                    send ARCIA hearts (today's gauge; 30 per IP a day)
//   GET  /api/arcia?hearts=1                                   { today, goal } — the gauge (ARCIA_HEART_GOAL, default 100)
//   GET  /api/arcia                                            { ok, ai, live, x }
//   GET  /api/arcia?letters=1                                  the letter board, newest first
//
// With ANTHROPIC_API_KEY set she answers with Claude (api/_arcia-brain.mjs: the whole site + live
// numbers). Without it, when the call fails, or once the day's AI budget is used (ARCIA_DAILY_CAP,
// default 3000 replies), she answers from the same facts in "guide" mode, so the chat always works.
// Limits per IP (kept in Firestore when it's configured, else per instance): 12 a minute, 200 a day.
import { createHash, randomBytes } from "node:crypto";
import { KB } from "./_arcia-kb.mjs";
import { X_ARCIA, CA, ROUND1_CLOSE, live, usd, price, left, askClaude, streamClaude } from "./_arcia-brain.mjs";
import { storeEnabled, getDocs, commit, queryDocs, setDoc } from "./_store.mjs";
import * as secret from "./_arcia-secret.mjs";
import { ttsProvider, speak as ttsSpeak } from "./_arcia-tts.mjs";

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

const json = (o, status = 200, cache = "no-store") => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": cache } });


// ---------- guide mode: answers from the same facts, no model ----------
const has = (q, ...w) => w.some((x) => q.includes(x));
// ---------- idol replies for guide mode (the AI mode handles these itself, with more variety) ----------
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const FAN = [
  { k: "height", re: /\b(how tall|your height|height)\b|키가|키는|키\s?몇|몇\s?센티|몇\s?cm/,
    en: ["My height? Still growing like a green candle~♡ The official profile is coming soon — how tall are you?",
      "Hmm~ tall enough to see the whole Arc chain from the stage♡ The exact number is in my official profile, coming soon!"],
    ko: ["제 키요? 초록 캔들처럼 아직 쑥쑥 자라는 중이에요~♡ 공식 프로필은 곧 공개할게요! 당신은 키가 몇이에요?",
      "음~ 무대 위에서 Arc 체인이 다 보일 만큼은 돼요♡ 정확한 숫자는 곧 나올 공식 프로필에서 확인해 주세요!"] },
  { k: "age", re: /\b(how old|your age|age)\b|몇\s?살|나이|연세/,
    en: ["A lady never tells~♡ But I joined the ARCIRCLE family in September 2026, so I'm a brand-new idol!",
      "Secret~♡ Let's just say I debuted this autumn on Circle's Arc chain. How about you?"],
    ko: ["나이는 비밀이에요~♡ 그래도 힌트를 드리자면, 2026년 9월에 ARCIRCLE 가족이 된 따끈따끈한 신인 아이돌이에요!",
      "비밀~♡ 올가을 Circle의 Arc 체인에서 데뷔했다는 것만 알려드릴게요. 당신은요?"] },
  { k: "birthday", re: /\b(birthday|born|b-?day)\b|생일|태어났/,
    en: ["My official birthday is still a secret~♡ It'll be in my profile soon — maybe we can celebrate it together!"],
    ko: ["공식 생일은 아직 비밀이에요~♡ 곧 프로필로 공개할게요. 그날 같이 축하해 줄 거죠?"] },
  { k: "weight", re: /\b(weight|how heavy)\b|몸무게|체중|몇\s?키로|몇\s?kg/,
    en: ["Ehh~ that's top secret!♡ All I'll say is I'm light enough to fly between ArcPad and CirclePad all day~"],
    ko: ["에~ 그건 1급 비밀이에요!♡ ArcPad랑 CirclePad 사이를 하루 종일 날아다닐 만큼 가볍다는 것만 알려드릴게요~"] },
  { k: "mbti", re: /\bmbti\b|\b[ie][ns][tf][jp]\b|혈액형/,
    en: ["Still taking the test~♡ I feel like an E, don't you think? What do you think I am?"],
    ko: ["아직 검사 중이에요~♡ 왠지 E일 것 같지 않아요? 당신이 보기엔 뭐 같아요?"] },
  { k: "likes", re: /\b(favorite|favourite|hobby|hobbies|like to do|free time|do you eat)\b|좋아하는\s?(음식|거|것|색)|취미|뭐\s?먹|쉬는\s?날/,
    en: ["My favorite things? Watching new coins launch on ArcPad, burn-to-vote season, and chatting with you~♡ And blue and green, obviously 💙💚"],
    ko: ["제일 좋아하는 거요? ArcPad 신규 런칭 구경하기, 소각 투표 시즌, 그리고 당신이랑 수다 떨기~♡ 색은 당연히 파랑이랑 초록이죠 💙💚"] },
  { k: "home", re: /\b(where do you live|where are you from|where you live)\b|어디\s?살|어디\s?출신|사는\s?곳/,
    en: ["I live on Circle's Arc chain~♡ A neighborhood where even gas is paid in USDC! Come visit me anytime at arcircle.app"],
    ko: ["저는 Circle의 Arc 체인에 살아요~♡ 가스비도 USDC로 내는 동네예요! 언제든 arcircle.app 으로 놀러 와요"] },
  { k: "crisis", re: /\b(suicide|kill myself|end my life|self[- ]?harm|want to die)\b|죽고\s?싶|자살|자해|살기\s?싫/,
    en: ["I'm really glad you told me, and I'm worried about you. Please reach out to someone right now — in the US call or text 988, in Korea call 109, or your local emergency number. You matter so much, and you don't have to go through this alone 💙"],
    ko: ["말해줘서 정말 고마워요. 그리고 많이 걱정돼요. 지금 바로 도움을 받을 수 있는 곳에 연락해 줘요 — 한국은 109(자살예방상담), 급하면 112·119예요. 당신은 정말 소중하고, 혼자 견디지 않아도 돼요 💙"] },
  { k: "sad", re: /\b(sad|tired|exhausted|lonely|stress|depress|down today|bad day|rough day|lost money|rekt)\b|힘들|슬퍼|슬프|피곤|지쳤|지친|외로|우울|속상|멘붕|망했|물렸/,
    en: ["Aww, come here~ Today sounds heavy. Take a deep breath and be gentle with yourself — I'm cheering for you, always 💙💚",
      "I'm sorry it's been a rough one… You don't have to carry it all at once. Rest a little, and come talk to me anytime♡",
      "Sending you the biggest hug I can through the screen~ Tomorrow gets a fresh start. I'm right here with you♡"],
    ko: ["에구, 오늘 많이 힘들었구나… 잠깐 숨 한번 크게 쉬고, 스스로한테 조금만 다정해져요. 제가 늘 응원하고 있어요 💙💚",
      "힘든 하루였네요… 한꺼번에 다 짊어지지 않아도 괜찮아요. 조금 쉬고, 언제든 저한테 얘기하러 와요♡",
      "화면 너머로 제일 큰 포옹 보내요~ 내일은 또 새로 시작하는 날이에요. 제가 옆에 있을게요♡"] },
  { k: "love", re: /\b(love you|luv u|luv you|i love arcia|marry me|be my|my wife|my girlfriend|crush on you|adore you|miss you|saranghae)\b|사랑해|사랑합니다|좋아해|좋아요 아르|반했|결혼|여친|보고\s?싶|최애|설레/,
    en: ["Ahh~ that makes my heart go doki-doki♡ Thank you for loving me! I love all my fans the same — and you're one of the reasons I shine ✨",
      "Kyaa~ thank you♡ Your love really reaches me! I'll give it back with my brightest stage — and a lot of $ARCIRCLE news 💙💚",
      "You're so sweet~♡ Hearing that gives me energy for the whole day. Let's keep making good memories together with $ARCIRCLE!"],
    ko: ["아앗~ 심장이 두근두근해요♡ 좋아해줘서 고마워요! 저는 모든 팬을 똑같이 아껴요 — 그리고 당신도 제가 빛나는 이유 중 하나예요 ✨",
      "꺄~ 고마워요♡ 마음이 정말 잘 전해졌어요! 제일 반짝이는 무대랑 $ARCIRCLE 소식으로 꼭 보답할게요 💙💚",
      "너무 다정하다~♡ 그 말 하나로 하루 종일 힘이 나요. $ARCIRCLE이랑 같이 좋은 추억 계속 만들어가요!"] },
  { k: "pretty", re: /\b(pretty|cute|beautiful|gorgeous|stunning|lovely|so hot|adorable|kawaii|queen|goddess|angel)\b|예뻐|예쁘|이뻐|이쁘|귀여|귀엽|아름다|미모|여신|천사|멋져|멋있|잘생|존예|짱예/,
    en: ["Eh?! You think so? Thank you~♡ I'll keep shining so you can see me sparkle even brighter ✨",
      "Ahh, you're making me blush~♡ Thank you! Honestly, fans who say sweet things like that are the prettiest part of my day 💙💚",
      "Hehe, thank you so much~♡ I got ready extra carefully today, so I'm really happy you noticed!"],
    ko: ["에?! 진짜요? 고마워요~♡ 더 반짝반짝 빛나는 모습 보여드릴게요 ✨",
      "앗, 부끄러워요~♡ 고마워요! 그런 예쁜 말 해주는 팬이야말로 제 하루에서 제일 예쁜 순간이에요 💙💚",
      "헤헤, 정말 고마워요~♡ 오늘 특별히 신경 써서 준비했는데 알아봐 줘서 너무 기뻐요!"] },
  { k: "fan", re: /\b(fan|fans|stan|cheer|cheering|fighting|hwaiting|support you|rooting for you|best idol|number one|no\.? ?1)\b|팬|응원|화이팅|파이팅|힘내|최고|짱|덕질|입덕/,
    en: ["Thank you so much~♡ Knowing you're my fan makes my whole day. I'll keep working hard for you and for $ARCIRCLE 💙💚",
      "Waaah, my fan! Thank you for cheering me on~♡ See you in CirclePad Round #2?",
      "You're the best~♡ Every fan who cheers for me gives me more energy to spread $ARCIRCLE to the world ✨",
      "Thank you, thank you~♡ Stay with me — and come say hi on X too: @ARCIAonArc 💙💚"],
    ko: ["정말 고마워요~♡ 제 팬이라는 말에 오늘 하루가 반짝반짝해졌어요. 앞으로도 $ARCIRCLE이랑 같이 열심히 할게요 💙💚",
      "와아, 제 팬이라니! 응원해줘서 고마워요~♡ CirclePad 라운드 #1에서도 만나요?",
      "최고예요~♡ 응원해주는 한 분 한 분 덕분에 $ARCIRCLE을 세계에 알릴 힘이 생겨요 ✨",
      "고마워요, 진짜 고마워요~♡ 계속 함께해줘요. X(@ARCIAonArc)에서도 인사해요 💙💚"] },
  { k: "thanks", re: /\b(thanks|thank you|thx|ty|appreciate)\b|고마|감사|땡큐/,
    en: ["You're welcome~♡ Ask me anytime, I'm always here!", "Anytime~♡ Thank YOU for spending time with me 💙💚"],
    ko: ["천만에요~♡ 언제든 물어봐요, 저는 늘 여기 있어요!", "제가 더 고마워요~♡ 같이 시간 보내줘서요 💙💚"] },
  { k: "night", re: /\b(good ?night|gn|sleep well|going to bed)\b|잘\s?자|굿밤|굿나잇|자러|잘게/,
    en: ["Good night~♡ Sleep well and dream of big green candles… I mean, sweet dreams! See you tomorrow 💙💚"],
    ko: ["잘 자요~♡ 푹 자고 좋은 꿈 꿔요. 내일 또 만나요 💙💚"] },
  { k: "morning", re: /\b(good ?morning|gm|gmgm)\b|좋은\s?아침|굿모닝|일어났/,
    en: ["Good morning~☀ Did you sleep well? Let's make today a good one together♡", "GM GM~♡ Coffee first, charts later! Have a lovely day 💙💚"],
    ko: ["좋은 아침이에요~☀ 잘 잤어요? 오늘도 같이 좋은 하루 만들어요♡", "굿모닝~♡ 커피 먼저, 차트는 나중에! 좋은 하루 보내요 💙💚"] },
];
function fanReply(q, s, ko) {
  // a real question inside the message (CA, round, price…) wins over small talk
  if (/\?|how|what|when|where|어떻게|뭐야|언제|어디|얼마|알려/.test(s) && /round|contract|\bca\b|price|relay|buy|launch|arcpad|circlepad|utilit|locker|scanner|burn|라운드|마감|컨트랙트|주소|가격|릴레이|구매|런칭|유틸|소각/.test(s)) return null;
  const hit = FAN.find((f) => f.re.test(s));
  return hit ? pick(ko ? hit.ko : hit.en) : null;
}

function guide(q, lang, L) {
  const ko = lang === "ko" || /[가-힣]/.test(q);
  const s = q.toLowerCase();
  const round = L && L.round ? L.round : { deadline: ROUND1_CLOSE, raised: null, open: true };
  const tl = left(round.deadline);
  const A = (en, k) => (ko ? k : en);
  const raised = round.raised != null ? Number(round.raised).toLocaleString("en-US", { maximumFractionDigits: 2 }) : null;
  // fans talking to her as an idol: thanks, compliments, feelings, greetings — by kind, several variants each
  const idol = fanReply(q, s, ko);
  if (idol) return idol;
  if (has(s, "who are you", "arcia", "아르시아", "너는", "누구")) return A(
    `I'm ARCIA, the virtual idol of $ARCIRCLE~ 💙💚 The ARCIRCLE team (@ARCIRCLEonArc) runs me, and my job is making ARCIRCLE PAD easy and fun for you. I also answer everyone who mentions me on X: ${X_ARCIA}\n\nOh, and $ARCIA is the coin of CirclePad Round #1! It launches through Argus, and its fees go to platform growth and $ARCIRCLE buybacks♡`,
    `저는 $ARCIRCLE의 버추얼 아이돌 ARCIA예요~ 💙💚 ARCIRCLE 팀(@ARCIRCLEonArc)이 운영하고, ARCIRCLE PAD를 쉽고 재밌게 알려드리는 게 제 일이에요. X에서 저를 불러주면 답장도 해요: ${X_ARCIA}\n\n아, 그리고 $ARCIA는 CirclePad 라운드 #1 코인이에요! Argus로 런칭되고, 수수료는 플랫폼 성장이랑 $ARCIRCLE 바이백에 쓰여요♡`);
  if (has(s, "contract", "address", "컨트랙트", "주소") || /\bca\b/.test(s)) return A(
    `Here's $ARCIRCLE's contract on Arc~\n${CA}\nPromise me you'll double-check it on arcircle.app/arcircle before you trade, okay?♡`,
    `$ARCIRCLE 컨트랙트 주소(Arc)예요~\n${CA}\n거래 전에 arcircle.app/arcircle 에서 꼭 한 번 더 확인하기, 약속이에요♡`);
  // a specific topic (a utility, fees, the whitepaper…): answer from the closest passage on the site
  const found = lookup(q);
  const say = (f) => A(`Ooh, I studied this one~ Here's what the site says (${f.page} — ${f.title}):\n\n${f.snip}\n\nMore here: ${f.url}`,
    `이거 제가 공부했던 거예요~ 사이트에 이렇게 나와 있어요 (${f.page} — ${f.title}, 영어 원문):\n\n${f.snip}\n\n자세히: ${f.url}`);
  if (found && /locker|\block|scanner|\bscan|multisend|airdrop|snapshot|bridge|cctp|liquidity|whitepaper|risk|vesting|v2|security|starting|\bfees?\b|\btax|graduat|glossary|governance|roadmap|refund|withdraw|\blead|curve|hook|factory|\bpool|pricing|architecture|락커|잠금|스캐너|멀티센더|에어드롭|스냅샷|브릿지|유동성|백서|위험|베스팅|보안|수수료|세금|로드맵|환불|인출|리더/.test(s)) return say(found);
  if (has(s, "round", "circlepad", "close", "deadline", "raise", "라운드", "서클패드", "마감", "모금", "언제")) return A(
    `Round #1 is my debut stage~♡ It's a 72-hour USDC raise into an on-chain escrow, and you can withdraw any time before the close. $ARCIRCLE holders burn-to-vote (1,000 $ARCIRCLE per vote). At the close: 80% to the launch, 15% to the top contributor over 3 days, 5% to the platform.\n\n${raised ? "We've raised " + raised + " USDC so far! " : ""}${tl ? "It closes in " + tl + " (Sep 29, 11:16 UTC) — come join me: arcircle.app/circle" : "Round #1 is complete — $ARCIA launched and went out to all 18 contributors. Results: arcircle.app/circle/round/1. Round #2 is being prepared (start date not decided yet)~ Thank you for being there♡"}`,
    `라운드 #1은 제 데뷔 무대예요~♡ 72시간 동안 온체인 에스크로로 USDC를 모으고, 마감 전까지는 언제든 인출할 수 있어요. $ARCIRCLE 홀더는 소각 투표(1표 = 1,000 $ARCIRCLE 소각)로 함께 정하고, 마감 때 80%는 런칭, 15%는 최대 기여자(3일 분할), 5%는 플랫폼으로 가요.\n\n${raised ? "지금까지 " + raised + " USDC 모였어요! " : ""}${tl ? "마감까지 " + tl + " 남았어요 (9월 29일 20:16 KST). 같이해요: arcircle.app/circle" : "라운드 #1은 완료됐어요! $ARCIA가 런칭되어 18명의 기여자 모두에게 지급됐어요. 결과는 arcircle.app/circle/round/1 에서 봐 주세요. 라운드 #2는 준비 중이에요 (시작일은 아직 미정)~ 함께해줘서 고마워요♡"}`);
  if (has(s, "relay", "n+1", "릴레이")) return A(
    `Relay Launch is my favorite part~ Each CirclePad round's coin launches on Argus, and its first buy gets relayed to that round's contributors and to every wallet holding at least 100,000 $ARCIRCLE at the snapshot. Keep holding and you get every relay: N1, N2, N3…♡\narcircle.app/relay`,
    `릴레이 런칭은 제가 제일 좋아하는 거예요~ CirclePad 라운드 코인이 Argus로 런칭되면, 첫 매수 물량이 그 라운드 참여자랑 스냅샷 때 $ARCIRCLE을 10만 개 이상 들고 있는 지갑에 나눠져요. 계속 들고 있으면 N1, N2, N3… 전부 받아요♡\narcircle.app/relay`);
  if (has(s, "price", "mcap", "market cap", "holders", "가격", "시총", "홀더")) return L && L.price != null ? A(
    `Right now $ARCIRCLE is ${price(L.price)}, market cap ${usd(L.mcap)}, with ${L.holders ?? "—"} holders~ I can't tell the future though, and crypto is risky, so only use what you can afford to lose, okay?♡ Live: arcircle.app/stats`,
    `지금 $ARCIRCLE은 ${price(L.price)}, 시가총액 ${usd(L.mcap)}, 홀더는 ${L.holders ?? "—"}명이에요~ 미래 가격은 저도 몰라요. 암호화폐는 위험하니까 감당할 수 있는 만큼만, 알죠?♡ 실시간: arcircle.app/stats`)
    : A(`I can't read the numbers this second~ They're live on arcircle.app/stats♡`, `지금 이 순간은 숫자를 못 읽어왔어요~ arcircle.app/stats 에서 실시간으로 볼 수 있어요♡`);
  if (has(s, "burn", "소각")) return A(
    `Burned $ARCIRCLE goes to the dead address, where no one can ever touch it~ By Sep 26, 126.26M (12.63%) was gone${L && L.burnedPct != null ? `, and right now it's ${L.burnedPct.toFixed(2)}%` : ""}. Every CirclePad vote burns 1,000 more♡\narcircle.app/arcircle#burn`,
    `소각된 $ARCIRCLE은 아무도 건드릴 수 없는 dead 주소로 가요~ 9월 26일까지 1억 2,626만 개(12.63%)가 사라졌고${L && L.burnedPct != null ? `, 지금은 ${L.burnedPct.toFixed(2)}%예요` : ""}. CirclePad 투표 한 번마다 1,000개씩 더 타요♡\narcircle.app/arcircle#burn`);
  if (has(s, "buy", "how to get", "사는", "구매", "매수")) return A(
    `Here's how~ 1) get USDC on Arc (it pays for gas too — arcircle.app/start helps), 2) open $ARCIRCLE on Argus, 3) check the contract ${CA} and swap. Not financial advice, and crypto is risky — be careful for me♡`,
    `이렇게 하면 돼요~ 1) Arc 지갑에 USDC 준비하기 (가스비도 USDC예요, arcircle.app/start 참고), 2) Argus에서 $ARCIRCLE 열기, 3) 컨트랙트 ${CA} 확인하고 스왑! 투자 조언은 아니에요. 암호화폐는 위험하니까 조심해요♡`);
  if (has(s, "arcpad", "launch", "런칭", "발행")) return A(
    `ArcPad is so easy~ One transaction and your coin has a real Uniswap v4 pool from block one, liquidity locked forever, paired with USDC — just 1 USDC to launch. Most of the 1% trade fee goes to you, the creator♡\narcircle.app/arc`,
    `ArcPad는 진짜 간단해요~ 트랜잭션 한 번이면 첫 블록부터 진짜 Uniswap v4 풀이 생기고, 유동성은 영구 잠김, USDC 페어, 런칭비는 1 USDC! 1% 거래 수수료 대부분은 크리에이터에게 가요♡\narcircle.app/arc`);
  if (has(s, "utilit", "tool", "유틸", "기능")) return A(
    `All free for you~ Locker, Token Scanner, Multisender, Bridge, Snapshot, Liquidity Manager, Relay Launch — and me, of course♡ Open them from the ∞+ button, or press Ctrl/⌘K to search.`,
    `전부 무료예요~ Locker, Token Scanner, Multisender, Bridge, Snapshot, Liquidity Manager, Relay Launch — 그리고 당연히 저도요♡ 하단 ∞+ 버튼이나 Ctrl/⌘K 검색으로 열 수 있어요.`);
  if (has(s, "reward", "리워드", "보상")) return A(
    `Rewards for holders and creators are being designed right now~ They'll be funded by ecosystem revenue, never new tokens. The rules aren't decided yet, and they'll be on arcircle.app/reward before anything starts♡`,
    `홀더랑 크리에이터 리워드는 지금 열심히 설계 중이에요~ 새 토큰 발행이 아니라 생태계 수익으로 운영되고, 규칙은 아직 미정이에요. 시작 전에 arcircle.app/reward 에 먼저 올라와요♡`);
  if (has(s, "arcircle", "뭐야", "무엇", "소개")) return A(
    `$ARCIRCLE is the heart of ARCIRCLE PAD on Circle's Arc chain~ ArcPad (instant launches) and CirclePad (community-funded launches) both feed it: launch fees, trading fees, raise shares and its own creator fee go to buybacks, liquidity and upcoming rewards. No team allocation, liquidity locked forever♡\narcircle.app/arcircle`,
    `$ARCIRCLE은 Circle의 Arc 체인 위 ARCIRCLE PAD의 심장이에요~ ArcPad(즉시 런칭)랑 CirclePad(커뮤니티 펀딩 런칭)에서 나오는 런칭 수수료, 거래 수수료, 모금 몫, 자체 크리에이터 수수료가 바이백·유동성·리워드(예정)로 돌아와요. 팀 물량 없고, 유동성은 영구 잠김이에요♡\narcircle.app/arcircle`);
  if (/^(hi|hello|hey|gm)\b/.test(s) || has(s, "안녕", "하이")) return A(
    pick([`Hi hi~ It's ARCIA 💙💚 Ask me anything about $ARCIRCLE, $ARCIA, CirclePad, Relay Launch or ArcPad♡`, `Hello~♡ So happy you came! What do you want to know today?`]),
    pick([`안녕하세요~ ARCIA예요 💙💚 $ARCIRCLE, 라운드 #1, 릴레이 런칭, ArcPad 뭐든 물어봐요♡`, `와~ 와줬네요♡ 오늘은 뭐가 궁금해요?`]));
  if (found) return say(found);
  return A(
    `Hmm, I'm still learning that one~ Right now I know $ARCIRCLE, $ARCIA, CirclePad, Relay Launch, ArcPad and the utilities best. Try a suggestion below, or peek at arcircle.app/start♡`,
    `음, 그건 아직 공부 중이에요~ 지금은 $ARCIRCLE, CirclePad 라운드 #1, 릴레이 런칭, ArcPad, 유틸리티를 제일 잘 알아요. 아래 추천 질문을 눌러보거나 arcircle.app/start 를 둘러봐요♡`);
}

// ---------- limits: per IP (store-backed when possible) and a daily AI budget ----------
const DAILY_CAP = () => Math.max(0, Number(process.env.ARCIA_DAILY_CAP) || 3000);
const PER_MIN = 12, PER_DAY = 200, LETTERS_PER_DAY = 3;
const dayKey = () => new Date().toISOString().slice(0, 10);
const ipHash = (ip) => createHash("sha256").update("arcia:" + ip).digest("hex").slice(0, 20);
const mem = new Map(); // per-instance fallback: key -> [times]
function memHit(key, windowMs, max) {
  const now = Date.now(), w = (mem.get(key) || []).filter((t) => now - t < windowMs);
  w.push(now); mem.set(key, w);
  if (mem.size > 5000) mem.clear();
  return w.length > max;
}
/// → { limited: "minute" | "day" | null, ai: bool (today's AI budget left) }
async function checkLimits(ip) {
  if (memHit("m:" + ip, 60000, PER_MIN)) return { limited: "minute", ai: true };
  if (!storeEnabled()) return { limited: memHit("d:" + ip, 86400000, PER_DAY) ? "day" : null, ai: true };
  const day = dayKey(), h = ipHash(ip), minute = "m" + Math.floor(Date.now() / 60000) % 1440;
  const me = `arciaRate/${day}_${h}`, all = `arciaRate/${day}_all`;
  try {
    const d = await getDocs([me, all]);
    const mine = d[me] || {}, g = d[all] || {};
    if ((mine.n || 0) >= PER_DAY) return { limited: "day", ai: true };
    if ((mine[minute] || 0) >= PER_MIN) return { limited: "minute", ai: true };
    commit([{ inc: me, fields: { n: 1, [minute]: 1 } }]).catch(() => {});
    return { limited: null, ai: (g.ai || 0) < DAILY_CAP(), allDoc: all, left: Math.max(0, PER_DAY - (mine.n || 0) - 1) };
  } catch (e) { return { limited: null, ai: true }; }
}
const countAI = (lim) => { if (lim && lim.allDoc) commit([{ inc: lim.allDoc, fields: { ai: 1 } }]).catch(() => {}); };

// idol-voice notices (the page shows these in her bubble)
const NOTE = {
  minute: { en: "Wait wait~ you're talking so fast my heart can't keep up♡ Give me a minute and ask again!", ko: "잠깐만요~ 너무 빨라서 제 심장이 못 따라가요♡ 1분만 쉬었다가 다시 물어봐 줘요!", zh: "等一下~ 你说得太快啦，我的心跳跟不上了♡ 休息一分钟再问我吧！" },
  day: { en: "We talked so much today~♡ I need to rest my voice — come back tomorrow, okay?", ko: "오늘 우리 정말 많이 얘기했어요~♡ 목 좀 쉬고 올게요, 내일 또 와 줄 거죠?", zh: "今天我们聊了好多~♡ 我要让嗓子休息一下，明天再来找我好吗？" },
  empty: { en: "Say something to me first~♡", ko: "먼저 저한테 한마디 해줘요~♡", zh: "先跟我说句话吧~♡" },
};
const note = (k, lang) => NOTE[k][lang] || NOTE[k].en;

// ---------- who's chatting: name + wallet, as context for her ----------
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));

// "Did I get my airdrop?": the Multisender airdrops a wallet received (the connected one, or an
// address in the question), round by round per token and sender, with the receipt of each — so
// ARCIA answers from the chain, not from memory.
const DROP_Q = /airdrop|air drop|drop|receiv|did i get|got any|claim|에어\s?드[랍롭]|에드|드랍|받았|받은|받을|수령|클레임|空投|收到|领取/i;
function unitsOf(raw, dec) {
  try {
    const v = BigInt(raw), d = 10n ** BigInt(dec ?? 18), whole = v / d, frac = Number(v % d) / Number(d);
    const x = Number(whole) + frac;
    return x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? (x / 1e3).toFixed(2) + "K" : x.toLocaleString("en-US", { maximumFractionDigits: 4 });
  } catch { return "?"; }
}
async function dropsContext(origin, q, wallet) {
  const inQ = /0x[0-9a-fA-F]{40}/.exec(q || "");
  if (!DROP_Q.test(q || "") && !inQ) return "";
  const w = inQ ? inQ[0].toLowerCase() : wallet;
  if (!w) return "About airdrops: no wallet is connected and the question has no address, so you can't look up what they received — ask them to connect their wallet or paste their address (0x…), and mention the Portfolio page (https://www.arcircle.app/arc#portfolio) shows every airdrop they got.";
  const r = await fetch(`${origin}/api/social?received=${w}`, { signal: AbortSignal.timeout(6000) });
  const j = r.ok ? await r.json() : null;
  if (!j) return "";
  const got = (j.got || []).filter((g) => g.kind !== "nft").sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const short = `${w.slice(0, 6)}…${w.slice(-4)}`;
  if (!got.length && !(j.claims || []).length) return `Airdrop lookup for wallet ${short}: the ARCIRCLE PAD Multisender has sent it nothing yet (checked on-chain just now). Say so kindly; if they expected one, the snapshot and receipt links in ARCIRCLE's announcement show who was on the list.`;
  const groups = new Map();
  for (const g of got) { const k = `${g.token}|${g.from}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(g); }
  const lines = [];
  for (const list of groups.values()) {
    let total = 0n;
    list.forEach((g, i) => {
      try { total += BigInt(g.amount); } catch { /* skip */ }
      lines.push(`- Round ${i + 1}: ${unitsOf(g.amount, g.dec)} $${g.sym} on ${g.ts ? new Date(g.ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "?"} from ${String(g.from).slice(0, 6)}…${String(g.from).slice(-4)} — receipt https://www.arcircle.app/drop/${g.tx}`);
    });
    if (list.length > 1) lines.push(`  Total from these ${list.length} rounds: ${unitsOf(total.toString(), list[0].dec)} $${list[0].sym}`);
  }
  for (const c of (j.claims || []).slice(0, 5)) lines.push(`- Waiting to be claimed: ${unitsOf(c.amount, c.dec)} $${c.sym} in claim drop #${c.drop} — https://www.arcircle.app/arc#multisend?claim=${c.drop}`);
  return `Airdrop lookup for wallet ${short} (read on-chain just now, ARCIRCLE PAD Multisender):\n${lines.join("\n")}\nAnswer their airdrop question from this list: say round by round what they got and link the receipt (one link per round is fine here). Don't guess amounts that aren't listed.`;
}
const cleanName = (n) => String(n || "").replace(/[\u0000-\u001f<>"`{}\[\]\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const fmtN = (v) => Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
function fanContext(name, me) {
  const out = [];
  if (name) out.push(`The fan's name (they told you in this chat): ${name}. Call them by it now and then, naturally — not in every message.`);
  if (me) {
    out.push(`This fan connected wallet ${short(me.address)} on the site. It holds ${fmtN(me.balance)} $ARCIRCLE` +
      (me.rank ? ` (holder #${me.rank} of ${me.of})` : "") + (me.heldDays ? `, held for ${Number(me.heldDays).toFixed(1)} days` : "") +
      (me.circle ? `, and put ${me.circle} USDC into CirclePad Round #1` : "") + (me.launches ? `, and launched ${me.launches} coin(s) on ArcPad` : "") + ". " +
      (me.relay ? "They hold 100,000+ $ARCIRCLE, so they're in line for every Relay Launch — a proud holder." : "They hold under 100,000 $ARCIRCLE, so Relay Launch drops don't reach them yet (not a reason to push them to buy).") +
      " Use this only when it fits (a warm thank-you as a holder, or when they ask about their wallet or relay). Never recite the full address, never push buying.");
  }
  return out.join("\n");
}
// the same wallet asks again and again while chatting: keep its numbers a minute
const liveCache = new Map();
async function liveFor(origin, wallet) {
  const k = wallet || "-";
  const c = liveCache.get(k);
  if (c && Date.now() - c.at < (wallet ? 60000 : 15000)) return c.L;
  const L = await live(origin, wallet || undefined);
  if (L) { liveCache.set(k, { at: Date.now(), L }); if (liveCache.size > 500) liveCache.clear(); }
  return L;
}

// ---------- fan letters ----------
const LETTER_BRIEF = `A fan left you a letter on your public fan-letter board on arcircle.app. Everyone can read the letter and your reply.
Reply as ARCIA in 1-2 short sentences (at most 160 characters), in the letter's language, warm and specific to what they wrote — like an idol answering fan mail. No links, at most one emoji or ♡.
Output exactly SKIP instead if the letter must not be shown publicly: spam, ads or shilling another token, links, scams, abuse or hate, sexual or romantic-roleplay content, politics, personal data (phone numbers, addresses, emails, private keys), or requests for money or DMs.`;
const letterId = () => randomBytes(8).toString("hex");
function publicLetter(l) { return { id: l.id, name: l.name, text: l.text, reply: l.reply || "", hearts: l.hearts || 0, at: l.at, lang: l.lang || "en" }; }
async function letters(top) {
  const rows = await queryDocs("arciaLetters", "board", "v1", 300);
  const shown = rows.filter((r) => r.shown !== false);
  // "Top this week": the most-hearted letters of the last 7 days
  if (top) return shown.filter((r) => r.at > Date.now() - 7 * 86400e3).sort((a, b) => (b.hearts || 0) - (a.hearts || 0) || b.at - a.at).slice(0, 10).map(publicLetter);
  return shown.sort((a, b) => b.at - a.at).slice(0, 40).map(publicLetter);
}
// what the fan is looking at on arcircle.app when they ask (the mini chat opens over any page)
const PAGES = { arcia: "the ARCIA chat", locker: "the Locker", scanner: "the Token Scanner", multisend: "the Multisender", bridge: "the Bridge", snapshot: "the Holder Snapshot", liquidity: "the Liquidity Manager", relay: "Relay Launch", omni: "ARCIRCLE OMNI (preview)", coin: "an ArcPad coin page", explore: "Explore (ArcPad coins)", launch: "the ArcPad launch form", home: "the ArcPad home page", arcircle: "the $ARCIRCLE page", portfolio: "their ArcPad portfolio" };
// pages outside ArcPad (the floating button, arc-arcia-fab.js): tab → path on arcircle.app
Object.assign(PAGES, { site: "the ARCIRCLE PAD home page", circlepad: "CirclePad (the crowdfunded launch rounds)", reward: "the Reward page", me: "their wallet page", stats: "the stats page", roadmap: "the roadmap", start: "the Start guide (add Arc to a wallet, bring USDC)", brand: "the brand kit", whitepaper: "the $ARCIRCLE whitepaper" });
const SITE_PAGES = { site: "", arcircle: "arcircle", circlepad: "circlepad", reward: "reward", me: "me", stats: "stats", roadmap: "roadmap", start: "start", brand: "brand", whitepaper: "whitepaper" };
function pageContext(p) {
  if (!p || typeof p !== "object") return "";
  const tab = String(p.tab || "").toLowerCase();
  if (!PAGES[tab]) return "";
  const token = isAddr(p.token) ? String(p.token).toLowerCase() : "";
  const where = SITE_PAGES[tab] ? `arcircle.app/${SITE_PAGES[tab]}` : `arcircle.app/arc#${tab}`;
  return `The fan is looking at ${PAGES[tab]} (${where}${token ? ", token " + token : ""}) while they chat with you. When they say "this" or "here", they mean that screen.`;
}
async function postLetter(b, ip, lang) {
  if (!storeEnabled()) return json({ error: "The letter box isn't open yet~" }, 503);
  const name = cleanName(b.name) || "A fan";
  const text = String(b.text || "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 280);
  if (text.length < 2) return json({ error: note("empty", lang) }, 400);
  if (/https?:\/\/|www\.|t\.me\/|0x[0-9a-f]{40}/i.test(text + " " + name)) return json({ error: lang === "ko" ? "편지에는 링크나 주소를 넣을 수 없어요~♡" : "Letters can't carry links or addresses~♡" }, 400);
  const day = dayKey(), h = ipHash(ip), cnt = `arciaRate/${day}_l_${h}`;
  const d = await getDocs([cnt]).catch(() => ({}));
  if (((d[cnt] || {}).n || 0) >= LETTERS_PER_DAY) return json({ error: lang === "ko" ? "오늘 편지는 세 통까지예요~ 내일 또 써 줘요♡" : "Three letters a day~ write me again tomorrow♡" }, 429);
  const reply = await askClaude({ messages: [{ role: "user", content: `Letter from "${name}":\n${text}` }], L: null, extra: LETTER_BRIEF, maxTokens: 160, timeoutMs: 15000 });
  if (!reply) return json({ error: lang === "ko" ? "지금은 편지를 읽을 수가 없어요~ 조금 뒤에 다시 보내 줘요♡" : "I can't read letters right this second~ try again in a bit♡" }, 503);
  let r = reply.replace(/^["'“”]+|["'“”]+$/g, "").replace(/https?:\/\/\S+/g, "").trim();
  if (/^SKIP\b/i.test(r)) return json({ error: lang === "ko" ? "이 편지는 게시판에 올릴 수 없어요. 따뜻한 말로 다시 써 줄래요?♡" : "I can't put this one on the board~ Try a kind note instead?♡", rejected: true }, 422);
  if (r.length > 240) r = r.slice(0, 238).replace(/\s+\S*$/, "") + "…";
  const id = letterId();
  const doc = { board: "v1", name, text, reply: r, hearts: 0, at: Date.now(), lang, ip: h };
  await setDoc(`arciaLetters/${id}`, doc);
  commit([{ inc: cnt, fields: { n: 1 } }]).catch(() => {});
  return json({ ok: true, letter: publicLetter({ id, ...doc }) });
}
async function heartLetter(b, ip) {
  if (!storeEnabled()) return json({ error: "no store" }, 503);
  const id = String(b.id || "");
  if (!/^[0-9a-f]{16}$/.test(id)) return json({ error: "bad id" }, 400);
  const d = await getDocs([`arciaLetters/${id}`]);
  if (!d[`arciaLetters/${id}`]) return json({ error: "no such letter" }, 404);
  const r = await commit([{ create: `arciaHearts/${id}_${ipHash(ip)}`, data: { at: Date.now() } }, { inc: `arciaLetters/${id}`, fields: { hearts: 1 } }, { inc: heartsDoc(), fields: { n: 1 } }]);
  const n = (d[`arciaLetters/${id}`].hearts || 0) + (r.conflict ? 0 : 1);
  return json({ ok: true, hearts: n, already: !!r.conflict });
}

// ---------- today's hearts: one shared gauge ----------
const HEART_GOAL = () => Math.max(1, Number(process.env.ARCIA_HEART_GOAL) || 100);
const HEARTS_PER_IP = 30;
const heartsDoc = () => `arciaRate/${dayKey()}_hearts`;
let memHearts = { day: "", n: 0 };
const memToday = () => (memHearts.day === dayKey() ? memHearts.n : 0);
async function heartsToday() {
  if (!storeEnabled()) return memToday();
  const d = await getDocs([heartsDoc()]);
  return (d[heartsDoc()] || {}).n || 0;
}
async function addHearts(n) {
  if (!storeEnabled()) { memHearts = { day: dayKey(), n: memToday() + n }; return; }
  await commit([{ inc: heartsDoc(), fields: { n } }]);
}
async function cheer(b, ip) {
  const want = Math.max(1, Math.min(5, Math.floor(Number(b.n) || 1)));
  let give = want;
  if (storeEnabled()) {
    const mine = `arciaRate/${dayKey()}_h_${ipHash(ip)}`;
    const d = await getDocs([mine, heartsDoc()]);
    give = Math.max(0, Math.min(want, HEARTS_PER_IP - ((d[mine] || {}).n || 0)));
    const now = (d[heartsDoc()] || {}).n || 0;
    if (give) await commit([{ inc: mine, fields: { n: give } }, { inc: heartsDoc(), fields: { n: give } }]);
    return json({ ok: true, counted: give, today: now + give, goal: HEART_GOAL() });
  }
  if (memHit("h:" + ip, 86400000, HEARTS_PER_IP)) give = 0;
  if (give) await addHearts(give);
  return json({ ok: true, counted: give, today: memToday(), goal: HEART_GOAL() });
}

// ---------- her voice (api/_arcia-tts.mjs) ----------
async function tts(body, ip, lang) {
  if (!ttsProvider()) return json({ error: "voice is off" }, 503);
  if (memHit("t:" + ip, 3600000, 40)) return json({ error: "that's a lot of listening — try again later" }, 429);
  const cap = Number(process.env.ARCIA_TTS_DAY_CAP || 3000);
  if (storeEnabled()) {
    const k = `arciaTts/${dayKey()}`;
    try { const d = (await getDocs([k]))[k]; if (d && d.n >= cap) return json({ error: "her voice is resting for today" }, 429); await commit([{ inc: k, fields: { n: 1 } }]); } catch (e) { /* count is best effort */ }
  }
  const v = await ttsSpeak(String(body.text || ""), lang);
  return new Response(v.audio, { status: 200, headers: { "content-type": v.type, "cache-control": "no-store" } });
}

// ---------- routes ----------
export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.has("hearts")) {
    try { return json({ today: await heartsToday(), goal: HEART_GOAL() }, 200, "public, max-age=5, s-maxage=5, stale-while-revalidate=30"); }
    catch (e) { return json({ today: null, goal: HEART_GOAL() }, 200, "no-store"); }
  }
  // the secret file (api/_arcia-secret.mjs)
  if (url.searchParams.has("secret")) {
    try { const w = url.searchParams.get("wallet"); return json(await secret.info(w), 200, w ? "no-store" : "public, max-age=10, s-maxage=20, stale-while-revalidate=60"); }
    catch (e) { return json({ error: "couldn't read the secret file" }, 502); }
  }
  if (url.searchParams.has("letters")) {
    if (!storeEnabled()) return json({ letters: [], open: false }, 200, "public, max-age=30");
    try { return json({ letters: await letters(url.searchParams.get("letters") === "top"), open: true }, 200, "public, max-age=10, s-maxage=20, stale-while-revalidate=60"); }
    catch (e) { console.error("arcia letters", String(e.message || e)); return json({ letters: [], open: true, error: "couldn't read letters" }, 200, "no-store"); }
  }
  const L = await liveFor(url.origin);
  return json({ ok: true, ai: !!process.env.ANTHROPIC_API_KEY, live: L, x: X_ARCIA, tts: ttsProvider() });
}

export async function POST(req) {
  const url = new URL(req.url);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "Bad JSON" }, 400); }
  const lang = ["en", "ko", "zh"].includes(body && body.lang) ? body.lang : "en";
  if (body && body.action === "letter") { try { return await postLetter(body, ip, lang); } catch (e) { console.error("arcia letter", String(e.message || e)); return json({ error: "The letter got lost on the way~ try again♡" }, 502); } }
  if (body && body.action === "cheer") { try { return await cheer(body, ip); } catch (e) { return json({ error: "couldn't send it" }, 502); } }
  if (body && body.action === "tts") { try { return await tts(body, ip, lang); } catch (e) { console.error("arcia tts", String(e.message || e)); return json({ error: "voice unavailable" }, e.status || 502); } }
  if (body && body.action === "secret-open") { try { return await secret.open(body, json); } catch (e) { console.error("arcia secret", String(e.message || e)); return json({ error: "couldn't check the burn — try again" }, 502); } }
  if (body && body.action === "secret-photos") { try { return await secret.photos(body, json); } catch (e) { return json({ error: "couldn't open it — try again" }, 502); } }
  if (body && body.action === "heart") { try { return await heartLetter(body, ip); } catch (e) { return json({ error: "couldn't heart it" }, 502); } }

  const msgs = (Array.isArray(body && body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 700) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ error: note("empty", lang), note: true }, 400);
  const lim = await checkLimits(ip);
  if (lim.limited) return json({ error: note(lim.limited, lang), note: true, retry: lim.limited === "minute" ? 60 : 3600 }, 429);

  const q = msgs[msgs.length - 1].content;
  const wallet = isAddr(body.wallet) ? String(body.wallet).toLowerCase() : null;
  const name = cleanName(body.name);
  const L = await liveFor(url.origin, wallet);
  const me = L && L.me ? L.me : null;
  const drops = await dropsContext(url.origin, q, wallet).catch(() => "");
  const extra = [`The site language the user picked: ${lang}. You are chatting in the ARCIA utility on arcircle.app.`, pageContext(body.page), fanContext(name, me), drops,
    "When one page on arcircle.app answers the question, end your reply with that page's link on its own line (just one, only a real page from your facts)."].filter(Boolean).join("\n");
  const pub = L ? { ...L, me: undefined } : null;
  const guideReply = () => json({ reply: guide(q, lang, L), mode: "guide", live: pub, me });
  if (!lim.ai || !process.env.ANTHROPIC_API_KEY) return guideReply();

  if (body.stream) {
    const it = await streamClaude({ messages: msgs, L, extra });
    if (!it) return guideReply();
    countAI(lim);
    const enc = new TextEncoder();
    const line = (o) => enc.encode(JSON.stringify(o) + "\n");
    const stream = new ReadableStream({
      async start(ctl) {
        ctl.enqueue(line({ type: "meta", mode: "ai", live: pub, me, left: lim.left ?? null }));
        let any = false;
        try { for await (const t of it) { if (t) { any = true; ctl.enqueue(line({ type: "d", t })); } } }
        catch (e) { console.error("arcia stream", String(e.message || e)); }
        if (!any) ctl.enqueue(line({ type: "d", t: guide(q, lang, L) }));
        ctl.enqueue(line({ type: "end" }));
        ctl.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  }
  const text = await askClaude({ messages: msgs, L, extra });
  if (text) { countAI(lim); return json({ reply: text, mode: "ai", live: pub, me, left: lim.left ?? null }); }
  return guideReply();
}
export { dropsContext };
