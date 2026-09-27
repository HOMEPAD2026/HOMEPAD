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
import { X_ARCIA, CA, ROUND1_CLOSE, live, usd, price, left, askClaude } from "./_arcia-brain.mjs";
export const config = { runtime: "edge" };





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
      "Waaah, my fan! Thank you for cheering me on~♡ See you in CirclePad Round #1?",
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
  // fans talking to her as an idol: thanks, compliments, feelings, greetings — by kind, several variants each
  const idol = fanReply(q, s, ko);
  if (idol) return idol;
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

  const text = await askClaude({ messages: msgs, L, extra: `The site language the user picked: ${lang}. You are chatting in the ARCIA utility on arcircle.app.` });
  if (text) return json({ reply: text, mode: "ai", live: L });
  return json({ reply: guide(q, lang, L), mode: "guide", live: L });
}
