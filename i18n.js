// i18n.js — English / Korean toggle for every ARCIRCLE PAD page.
//
// The pages are written in English; this file swaps visible text for Korean
// in place, and swaps it back. It works on text nodes and a few attributes
// (placeholder / title / aria-label), matching the exact English string or a
// pattern for strings with live numbers in them. A MutationObserver catches
// everything the page scripts render later (statuses, cards, tickers), so no
// page script needs to know about translation. Contract addresses, code and
// anything inside [data-no-i18n] are never touched.
//
// Choice is remembered per visitor (localStorage "arcircle.lang"); the first
// visit follows the browser language.
(function () {
  "use strict";

  var KO = {
    // ---- navigation / chrome ----
    "Home": "홈", "Explore": "탐색", "Launch": "런치", "Docs": "문서", "Reward": "리워드", "Projects": "프로젝트",
    "Governance": "거버넌스", "My Position": "내 포지션", "Leaderboard": "리더보드", "Airdrop": "에어드랍", "Treasury": "트레저리",
    "Main": "메인", "Quick actions": "빠른 메뉴", "Coming soon": "준비 중", "The core coin": "코어 코인", "Connect wallet": "지갑 연결",
    "ARCIRCLE PAD home": "ARCIRCLE PAD 홈", "Whitepaper": "백서", "Whitepaper §8": "백서 8장", "Contracts": "컨트랙트", "FAQ": "자주 묻는 질문",
    "← Explore": "← 탐색", "View all →": "전체 보기 →", "Learn more →": "자세히 →", "Show more": "더 보기", "Loading…": "불러오는 중…",
    "Copy": "복사", "Copied": "복사됨", "Copy failed": "복사 실패", "Copy address": "주소 복사", "Share": "공유", "Live": "LIVE",
    "Live trades": "실시간 거래", "Search launches…": "런치 검색…", "Search launches by name or symbol…": "이름이나 티커로 런치 검색…",
    "Search projects — coming soon": "프로젝트 검색 — 준비 중", "Wallet address": "지갑 주소", "Dismiss": "닫기",
    "Instant launches. Real pool from block one. Paired in USDC — or any Arc token.": "즉시 런치. 첫 블록부터 진짜 풀. USDC 페어 — 또는 Arc의 어떤 토큰이든.",
    "One project. Everyone's USDC. Nobody's rug.": "하나의 프로젝트. 모두의 USDC. 러그는 없다.",
    "Network unknown": "네트워크 확인 불가", "Network?": "네트워크?", "Checking…": "확인 중…", "Resizing…": "크기 조정 중…",

    // ---- ArcPad home ----
    "On Arc — gas paid in USDC": "Arc 위에서 — 가스는 USDC로", "Launch instantly.": "즉시 런치.", "Trade instantly.": "즉시 거래.",
    "No curve, no wait.": "커브도, 대기도 없이.",
    "A real Uniswap v4 pool exists the second you launch — single-sided liquidity, permanently locked, paired against USDC. No bonding curve, no \"graduation,\" tradeable from block one.":
      "런치하는 순간 진짜 Uniswap v4 풀이 생깁니다 — 단방향 유동성, 영구 잠금, USDC 페어. 본딩 커브도 \"졸업\"도 없이 첫 블록부터 거래됩니다.",
    "Launch a coin": "코인 런치하기", "Explore launches": "런치 둘러보기", "Launches so far": "지금까지 런치", "Flat launch fee": "고정 런치 수수료",
    "Trade fee (yours: up to 90%)": "거래 수수료 (최대 90%가 내 몫)", "Newest launches": "최신 런치",
    "foci bonding curve · Arc": "foci 본딩 커브 · Arc", "foci bonding curve": "foci 본딩 커브", "Trade →": "거래 →", "Price": "가격", "Market cap": "시가총액",
    "Graduation progress": "졸업 진행률", "The pool": "풀", "Fees": "수수료", "Pricing": "가격 책정",
    "A real Uniswap v4 pool is created the instant you launch — the coin's full sellable supply goes straight in, priced against a virtual reserve of the pair token (USDC by default, or $ARCIRCLE / any Arc token you pick). Tradeable on Dexscreener from block one, once indexed.":
      "런치하는 순간 진짜 Uniswap v4 풀이 생성됩니다 — 판매 가능한 공급량 전체가 바로 들어가고, 페어 토큰(기본 USDC, 또는 $ARCIRCLE / 원하는 Arc 토큰)의 가상 준비금 기준으로 가격이 정해집니다. 인덱싱되면 첫 블록부터 Dexscreener에서 거래됩니다.",
    "1% base fee on every trade — most of it back to you as the creator, the rest to the platform. Add up to 2% more at launch, 100% yours. See Docs → Economics for the exact split.":
      "모든 거래에 기본 1% 수수료 — 대부분은 크리에이터인 나에게, 나머지는 플랫폼으로. 런치할 때 최대 2%를 더 붙일 수 있고 100% 내 몫입니다. 정확한 분배는 문서 → 경제 구조를 보세요.",
    "Every ArcPad coin opens at the same price — the pool starts with a 4,000 USDC virtual reserve against the 920M sellable tokens, so there's nothing to set here.":
      "모든 ArcPad 코인은 같은 가격에서 시작합니다 — 풀은 판매 가능한 9.2억 토큰에 대해 4,000 USDC 가상 준비금으로 시작하므로 따로 설정할 것이 없습니다.",
    "No launches yet — be the first.": "아직 런치가 없어요 — 첫 번째가 되어 보세요.", "Launch a coin →": "코인 런치하기 →",
    "Couldn't reach Arc to load launches — check your connection and refresh.": "Arc에 연결하지 못해 런치를 불러오지 못했어요 — 연결을 확인하고 새로고침하세요.",
    "Couldn't reach Arc RPC": "Arc RPC 연결 실패", "Loading launches…": "런치 불러오는 중…",

    // ---- Explore ----
    "Every coin launched through ArcPad, read live from the factory contract.": "ArcPad로 런치된 모든 코인 — 팩토리 컨트랙트에서 실시간으로 읽어옵니다.",
    "Volume 24h": "24h 거래량", "Gainers": "상승률", "Last trade": "최근 거래", "Newest": "최신순", "Name (A–Z)": "이름순",
    "No coins have launched on ArcPad yet — the Launch tab is where the first one starts.": "아직 ArcPad에서 런치된 코인이 없어요 — 런치 탭에서 첫 코인을 시작하세요.",
    "Change since launch": "런치 대비 변동", "buy": "매수", "sell": "매도",

    // ---- Launch form ----
    "Launch on ArcPad": "ArcPad에서 런치", "Coin name": "코인 이름", "Symbol": "티커", "Ticker": "티커", "Logo": "로고", "Description": "설명",
    "Socials": "소셜", "Website": "웹사이트", "X / Twitter URL": "X / 트위터 URL", "Telegram URL": "텔레그램 URL", "Discord URL": "디스코드 URL",
    "e.g. Example Token": "예: Example Token", "e.g. EXMPL": "예: EXMPL", "https://yourproject.com": "https://yourproject.com",
    "paste an image URL, or upload a file below": "이미지 URL을 붙여넣거나 아래에서 파일을 올리세요", "📎 Upload a file": "파일 올리기", "Upload a file": "파일 올리기",
    "A hosted URL is best. An uploaded file is shrunk to a small icon (~128px) and stored on-chain — the bigger it is, the more gas the launch costs.":
      "호스팅된 URL이 가장 좋습니다. 업로드한 파일은 작은 아이콘(~128px)으로 줄여 온체인에 저장되며, 클수록 런치 가스비가 늘어납니다.",
    "Pair with": "페어 토큰", "Pair token": "페어 토큰", "Other token (CA)": "다른 토큰 (CA)",
    "the token people buy your coin with — USDC unless you pick another": "사람들이 내 코인을 살 때 쓰는 토큰 — 따로 고르지 않으면 USDC",
    "Paste the token's contract address on Arc (0x…)": "Arc의 토큰 컨트랙트 주소를 붙여넣으세요 (0x…)",
    "Starting price": "시작 가격", "Starting point": "시작점", "Same for every launch": "모든 런치 동일",
    "Trade fee": "거래 수수료", "Base fee": "기본 수수료", "Your fee": "내 수수료", "optional add-on, 0–2%, 100% yours": "선택 추가 수수료, 0–2%, 100% 내 몫",
    "Total trade fee:": "총 거래 수수료:", "You earn per trade": "거래마다 받는 몫", "→ you (70%)": "→ 나 (70%)", "→ platform (30%)": "→ 플랫폼 (30%)",
    "Dev buy": "개발자 매수", "optional": "선택", "USDC amount": "USDC 금액", "(USDC)": "(USDC)",
    "Buy your own tokens in the same transaction as the launch, before anyone else can. Requires a one-time USDC approval first. Leave blank to skip.":
      "런치와 같은 트랜잭션에서 누구보다 먼저 내 토큰을 삽니다. 처음 한 번 USDC 승인이 필요합니다. 건너뛰려면 비워 두세요.",
    "Launching costs a flat": "런치 비용은 고정", "1 USDC fee": "1 USDC 수수료",
    "platform fee, paid automatically as network value (no separate approval step). Any amount you send above that is refunded.":
      "플랫폼 수수료이며 네트워크 값으로 자동 지불됩니다(별도 승인 없음). 초과해서 보낸 금액은 환불됩니다.",
    "Launch coin": "코인 런치", "Launching…": "런치 중…", "Launched!": "런치 완료!", "Opening your coin's page…": "내 코인 페이지를 여는 중…",
    "Your coin goes live in a real Uniswap v4 pool the moment this confirms.": "확인되는 순간 내 코인이 진짜 Uniswap v4 풀에서 거래를 시작합니다.",
    "Confirm the launch in your wallet…": "지갑에서 런치를 승인하세요…", "Connect a wallet to launch.": "런치하려면 지갑을 연결하세요.",
    "Name and symbol are required.": "이름과 티커는 필수입니다.", "Still checking the pair token — try again in a moment.": "페어 토큰을 확인하는 중이에요 — 잠시 후 다시 시도하세요.",
    "Choose a pair token with a known price to set the opening reserve.": "시작 준비금을 정하려면 가격이 확인되는 페어 토큰을 고르세요.",
    "Working out the opening reserve for this pair…": "이 페어의 시작 준비금을 계산하는 중…", "Waiting for your wallet…": "지갑 응답을 기다리는 중…",
    "Confirm in wallet…": "지갑에서 승인하세요…", "Confirming…": "확인 중…", "Approving…": "승인 중…",

    // ---- Coin page / trading ----
    "Live on Uniswap v4": "Uniswap v4에서 거래 중", "Paired with USDC": "USDC 페어", "CA": "CA", "ArcScan ↗": "ArcScan ↗",
    "Liquidity": "유동성", "24h volume": "24h 거래량", "24h trades": "24h 거래 수", "Holders": "홀더", "Launched": "런치", "Sold from the pool": "풀에서 판매된 양",
    "Price chart": "가격 차트", "Pool chart": "풀 차트", "Dexscreener": "Dexscreener", "All": "전체", "Mine": "내 거래",
    "Trades": "거래", "Token & holders": "토큰 & 홀더", "About": "정보", "Links": "링크", "Time": "시간", "Type": "종류", "Trader": "트레이더",
    "Tokens": "토큰", "Tx": "Tx", "Buy": "매수", "Sell": "매도", "Buys": "매수", "Sells": "매도", "Amount": "수량", "Max": "최대",
    "You pay": "지불", "You receive": "수령", "Minimum received": "최소 수령", "Price impact": "가격 영향", "Slippage": "슬리피지", "Fee": "수수료", "Route": "경로",
    "Balance —": "잔액 —", "Balance: —": "잔액: —", "Balance:": "잔액:", "Loading trades…": "거래 불러오는 중…", "Loading holders…": "홀더 불러오는 중…",
    "Pool": "풀", "Creator": "크리에이터", "Token": "토큰", "Pool supply": "풀 공급량", "Quote asset": "기준 자산", "Paired with": "페어",
    "What's this coin about?": "이 코인은 어떤 코인인가요?",
    "Balances rebuilt from every transfer since launch. \"Pool\" is the unsold supply still in the Uniswap v4 pool.":
      "런치 이후 모든 전송 기록으로 잔액을 다시 계산했습니다. \"풀\"은 아직 Uniswap v4 풀에 남아 있는 미판매 공급량입니다.",
    "Drawn from every swap in this coin's Uniswap v4 pool on Arc. If Dexscreener lists the pool, you can switch to its chart here.":
      "Arc에 있는 이 코인의 Uniswap v4 풀의 모든 스왑으로 그린 차트입니다. Dexscreener에 등록되면 여기서 그 차트로 바꿀 수 있습니다.",
    "Trades go straight to ArcPad's router and the coin's own Uniswap v4 pool on Arc — nothing is held by the site. Gas is paid in USDC.":
      "거래는 ArcPad 라우터와 Arc 위 이 코인의 Uniswap v4 풀로 바로 갑니다 — 사이트는 아무것도 보관하지 않습니다. 가스는 USDC로 냅니다.",
    "ArcPad router · Uniswap v4": "ArcPad 라우터 · Uniswap v4", "Buy / sell against the pool from this page": "이 페이지에서 풀과 바로 매수 / 매도",
    "Confirm the buy in your wallet…": "지갑에서 매수를 승인하세요…", "Confirm the sell in your wallet…": "지갑에서 매도를 승인하세요…",
    "Buying…": "매수 중…", "Selling…": "매도 중…", "Bought!": "매수 완료!", "Sold!": "매도 완료!", "Enter an amount.": "금액을 입력하세요.",
    "Approve USDC for the router…": "라우터에 USDC를 승인하세요…", "Connect a wallet first…": "먼저 지갑을 연결하세요…",
    "Connect a wallet to see your balance": "잔액을 보려면 지갑을 연결하세요", "Couldn't load this coin": "이 코인을 불러오지 못했어요",
    "Couldn't reach Arc to load trades — retrying shortly.": "Arc에 연결하지 못해 거래를 불러오지 못했어요 — 곧 다시 시도합니다.",
    "View transaction": "트랜잭션 보기", "View token on Explorer ↗": "익스플로러에서 토큰 보기 ↗", "Your coin is live.": "내 코인이 라이브입니다.",
    "The pool is open and trading on Uniswap v4. Tell people where to find it.": "풀이 열렸고 Uniswap v4에서 거래 중입니다. 어디서 찾을 수 있는지 알려 주세요.",
    "Share on X": "X에 공유", "Copy link": "링크 복사",

    // ---- $ARCIRCLE page in ArcPad ----
    "arcircle": "arcircle", "Bonding curve": "본딩 커브", "Graduates at": "졸업 기준", "Creator tax": "크리에이터 세금", "Trades on": "거래처",
    "Total supply": "총 공급량", "Chain": "체인", "DEX pair": "DEX 페어",
    "$ARCIRCLE is the core coin of ARCIRCLE PAD. It launched on foci and trades on foci's bonding curve until it graduates — everything ArcPad and CirclePad earn is meant to flow back into it.":
      "$ARCIRCLE은 ARCIRCLE PAD의 코어 코인입니다. foci에서 런치되어 졸업 전까지 foci 본딩 커브에서 거래되며, ArcPad와 CirclePad가 버는 모든 것이 여기로 돌아오도록 설계되어 있습니다.",
    "Drawn straight from the curve's own trades on Arc. Dexscreener doesn't index foci bonding curves — it picks $ARCIRCLE up once it graduates to a DEX pool, and this chart switches over automatically.":
      "Arc 위 커브의 실제 거래로 그린 차트입니다. Dexscreener는 foci 본딩 커브를 인덱싱하지 않으며, $ARCIRCLE이 DEX 풀로 졸업하면 등록되고 이 차트도 자동으로 바뀝니다.",
    "Drawn straight from the curve's own trades on Arc.": "Arc 위 커브의 실제 거래로 그린 차트입니다.",
    "When the curve's USDC reaches the graduation threshold, $ARCIRCLE moves to a DEX pool — that's when it shows up on Dexscreener.":
      "커브의 USDC가 졸업 기준에 도달하면 $ARCIRCLE은 DEX 풀로 이동합니다 — 그때 Dexscreener에 나타납니다.",
    "$ARCIRCLE has graduated from its bonding curve — trading continues on its DEX pool.": "$ARCIRCLE이 본딩 커브를 졸업했습니다 — 이제 DEX 풀에서 거래됩니다.",
    "Your trade goes straight to foci's verified bonding-curve contract on Arc — ARCIRCLE PAD never holds your funds. Gas is paid in USDC.":
      "거래는 Arc 위 foci의 검증된 본딩 커브 컨트랙트로 바로 갑니다 — ARCIRCLE PAD는 자금을 보관하지 않습니다. 가스는 USDC로 냅니다.",
    "Live chart from Dexscreener for $ARCIRCLE's DEX pair.": "$ARCIRCLE DEX 페어의 Dexscreener 실시간 차트.",
    "(est.)": "(추정)", "verified": "검증됨", "· on-chain": "· 온체인", "· Dexscreener": "· Dexscreener", "· Explorer": "· 익스플로러",

    // ---- Docs (ArcPad) ----
    "How it all works": "작동 방식", "Economics": "경제 구조", "Supply & allocation": "공급 & 배분", "Launch process": "런치 과정", "Trading": "거래",
    "Is there a bonding curve?": "본딩 커브가 있나요?", "Can I choose the starting price?": "시작 가격을 정할 수 있나요?", "What do I need to launch?": "런치하려면 무엇이 필요한가요?",
    "Why USDC?": "왜 USDC인가요?", "Supply": "공급량",
    "No. Unlike HOMEPAD's original curve mode, ArcPad seeds a real Uniswap v4 pool immediately — there's no separate curve contract and nothing to \"graduate.\"":
      "아니요. HOMEPAD의 기존 커브 방식과 달리 ArcPad는 즉시 진짜 Uniswap v4 풀을 만듭니다 — 별도 커브 컨트랙트도 \"졸업\"도 없습니다.",
    "No — every ArcPad launch opens at the same point: a 4,000 USDC virtual reserve, ≈ $0.0000043 per token, ≈ $4,350 market cap. The market decides the price from there.":
      "아니요 — 모든 ArcPad 런치는 같은 지점에서 시작합니다: 4,000 USDC 가상 준비금, 토큰당 ≈ $0.0000043, 시가총액 ≈ $4,350. 그다음 가격은 시장이 정합니다.",
    "A connected wallet on Arc, at least 1 USDC (native) for the launch fee, and — if you want a dev buy — USDC approved for the factory.":
      "Arc에 연결된 지갑, 런치 수수료용 최소 1 USDC(네이티브), 그리고 개발자 매수를 원하면 팩토리에 승인된 USDC가 필요합니다.",
    "USDC is Arc's own native gas token — no bridging, no extra approval step for the launch fee itself (only for dev buys and trades, which pull ERC-20 USDC via transferFrom).":
      "USDC는 Arc의 네이티브 가스 토큰입니다 — 브릿지도, 런치 수수료용 추가 승인도 필요 없습니다(개발자 매수와 거래만 transferFrom으로 ERC-20 USDC를 사용합니다).",
    "A real Uniswap v4 pool is created the instant you launch — not a bonding-curve contract that \"graduates\" into a pool later.":
      "런치하는 순간 진짜 Uniswap v4 풀이 생성됩니다 — 나중에 풀로 \"졸업\"하는 본딩 커브 컨트랙트가 아닙니다.",
    "It's single-sided: the coin's full sellable supply (92% of 1B — see Supply below) goes straight into the pool at creation, priced against a virtual reserve of the pair token — USDC by default, or $ARCIRCLE or any Arc token you pick, sized so every launch opens at ≈ $4,350. Tradeable on Dexscreener from block one, once indexed.":
      "단방향 유동성입니다: 판매 가능한 공급량 전체(10억 중 92% — 아래 공급량 참고)가 생성 시 바로 풀에 들어가고, 페어 토큰(기본 USDC, 또는 $ARCIRCLE이나 원하는 Arc 토큰)의 가상 준비금 기준으로 가격이 정해져 모든 런치가 ≈ $4,350에서 시작합니다. 인덱싱되면 첫 블록부터 Dexscreener에서 거래됩니다.",
    "Constant-product curve math against that virtual reserve — the more USDC buyers put in, the higher the price climbs. It's a real, immediately swappable v4 pool the whole time, not a separate holding contract.":
      "그 가상 준비금에 대한 상수곱 공식입니다 — 매수자가 USDC를 많이 넣을수록 가격이 오릅니다. 처음부터 끝까지 바로 스왑되는 진짜 v4 풀이며, 별도의 보관 컨트랙트가 아닙니다.",
    "Fixed at 1,000,000,000 tokens, every launch, no exceptions. 8% goes to the platform treasury at creation; the remaining 92% is placed in the pool against a 4,000 USDC virtual reserve — every launch opens at ≈ $0.0000043 per token (≈ $4,350 market cap).":
      "모든 런치는 예외 없이 10억 개로 고정입니다. 생성 시 8%는 플랫폼 트레저리로, 나머지 92%는 4,000 USDC 가상 준비금과 함께 풀에 들어갑니다 — 모든 런치는 토큰당 ≈ $0.0000043(시가총액 ≈ $4,350)에서 시작합니다.",
    "Fixed at 1,000,000,000 tokens every launch. 8% goes to the platform treasury at creation; the remaining 92% is what's actually in the pool, opening at a ≈ $4,350 market cap.":
      "모든 런치는 10억 개로 고정입니다. 생성 시 8%는 플랫폼 트레저리로, 나머지 92%가 실제로 풀에 들어가며 시가총액 ≈ $4,350에서 시작합니다.",
    "Trade fee: 1% base, protocol-wide — most of it back to you as the creator, the rest to the platform. You can add up to 2% more at launch, 100% of which is yours. Total per trade: 1–3%, taken from whichever side of the trade is the output.":
      "거래 수수료: 프로토콜 전체 기본 1% — 대부분은 크리에이터인 나에게, 나머지는 플랫폼으로. 런치할 때 최대 2%를 더 붙일 수 있고 100% 내 몫입니다. 거래당 합계 1–3%이며 거래의 출력 쪽에서 떼어 갑니다.",
    "Launch fee: a flat 1 USDC per launch, paid to the platform treasury — separate from the pool allocation above and from any dev buy.":
      "런치 수수료: 런치당 고정 1 USDC, 플랫폼 트레저리로 — 위의 풀 배분이나 개발자 매수와는 별도입니다.",
    "Optional. If set, your purchase executes atomically inside the same launch transaction (": "선택 사항. 설정하면 매수가 같은 런치 트랜잭션 안에서 원자적으로 실행됩니다 (",
    ") — paid in USDC, landing in the same block as creation, before anyone else can buy in ahead of you. Requires approving USDC for the factory first.":
      ") — USDC로 지불되며 생성과 같은 블록에서 체결되어 누구도 먼저 살 수 없습니다. 먼저 팩토리에 USDC 승인이 필요합니다.",
    "Buy and sell directly from the Explore grid — trades route through ArcPad's own swap router against the same v4 pool. Buying needs USDC approved for the router; selling needs the coin itself approved for the router. Both are one-time approvals per token.":
      "탐색 화면에서 바로 사고팔 수 있습니다 — 거래는 ArcPad의 스왑 라우터를 거쳐 같은 v4 풀에서 체결됩니다. 매수는 라우터에 USDC 승인, 매도는 라우터에 코인 승인이 필요하며 토큰당 한 번만 하면 됩니다.",
    "Every ArcPad contract on Arc mainnet, read straight from this site's config so this list can't drift from what's deployed. Verify anything here on the explorer before you trade.":
      "Arc 메인넷의 모든 ArcPad 컨트랙트입니다. 사이트 설정에서 바로 읽어 와 실제 배포와 어긋날 수 없습니다. 거래 전에 익스플로러에서 확인하세요.",
    "Launches, seeds the pool, collects the 1 USDC fee": "런치, 풀 생성, 1 USDC 수수료 수령",
    "Uniswap v4 hook — routes trade fees to creator / platform": "Uniswap v4 훅 — 거래 수수료를 크리에이터 / 플랫폼으로 분배",
    "Uniswap's own core on Arc — every pool lives here": "Arc 위 Uniswap 코어 — 모든 풀이 여기 있습니다",
    "Arc's native USDC predeploy — the quote token": "Arc 네이티브 USDC — 기준 토큰", "USDC (ERC-20, 6 decimals)": "USDC (ERC-20, 소수점 6자리)",
    "Platform treasury": "플랫폼 트레저리", "Uniswap v4 PoolManager": "Uniswap v4 PoolManager", "not deployed yet": "아직 배포 전",
    "Chain: Arc (id 5042) · RPC": "체인: Arc (id 5042) · RPC", "arc.etherscan.io ↗": "arc.etherscan.io ↗",
    "ArcPad's factory isn't configured yet.": "ArcPad 팩토리가 아직 설정되지 않았습니다.",

    // ---- CirclePad ----
    "Fund together.": "함께 모으고.", "Decide together.": "함께 정하고.", "Launch bigger.": "더 크게 런치.",
    "One project at a time. A 3-day USDC raise decides who leads it — and everyone who contributed gets a vote on what it becomes.":
      "한 번에 한 프로젝트. 3일간의 USDC 모금이 리더를 정하고, 기여한 모두가 프로젝트의 모습에 투표합니다.",
    "See the round": "라운드 보기", "How it works": "작동 방식", "First CirclePad round": "첫 CirclePad 라운드", "Community-led": "커뮤니티 주도", "USDC raise": "USDC 모금",
    "Identity voted on after the raise": "모금 후 투표로 정체성 결정", "$TBD": "$미정",
    "Name, ticker, logo and roadmap are all decided by contributors' votes once a raise closes. This card shows the shape of a round — it isn't a real one yet.":
      "이름, 티커, 로고, 로드맵은 모금이 끝나면 기여자 투표로 정해집니다. 이 카드는 라운드의 형태를 보여줄 뿐 아직 실제 라운드는 아닙니다.",
    "CirclePad's share of every raise feeds it": "모든 모금의 CirclePad 몫이 여기로", "Loading live $ARCIRCLE data…": "$ARCIRCLE 실시간 데이터 불러오는 중…",
    "Loading round…": "라운드 불러오는 중…", "Start the 72h raise": "72시간 모금 시작", "raised so far — uncapped": "지금까지 모금 — 상한 없음",
    "Contribute USDC": "USDC 기여하기", "Contribute USDC — not open": "USDC 기여 — 아직 열리지 않음", "Withdraw my contribution": "내 기여금 출금",
    "Not started": "시작 전", "Not started yet": "아직 시작 전", "Not started — waiting on CirclePad": "시작 전 — CirclePad 대기 중", "Ends": "마감",
    "Raise ended": "모금 종료", "Raise closed — funds pending distribution.": "모금 마감 — 분배 대기 중.", "Live — the raise is open for contributions.": "진행 중 — 기여할 수 있습니다.",
    "Escrow is deployed — waiting for CirclePad to start the raise.": "에스크로 배포 완료 — CirclePad의 모금 시작을 기다리는 중입니다.",
    "Not live yet — the fund-pooling contract is in design and review.": "아직 라이브 전 — 모금 컨트랙트는 설계·검토 중입니다.",
    "PREVIEW": "미리보기", "READY": "준비됨", "LIVE": "LIVE", "Top contributor": "최대 기여자", "Contributors": "기여자", "Your contribution": "내 기여금", "Your share": "내 지분",
    "Payout wallet": "지급 지갑", "72h funding": "72시간 모금", "Lead preparation": "리더 준비", "Grow together": "함께 성장", "Getting paid": "지급",
    "Day 1–3": "1–3일차", "Day 3": "3일차", "Day 3, +12h": "3일차 +12시간", "Day 3–8": "3–8일차",
    "Contributors send USDC for 3 days.": "기여자들이 3일 동안 USDC를 보냅니다.", "Confirmed lead has 12h to publish the essentials.": "확정된 리더는 12시간 안에 필수 정보를 공개해야 합니다.",
    "80% of USDC becomes LP liquidity immediately.": "USDC의 80%가 즉시 LP 유동성이 됩니다.", "Lead's 15% vests 3%/day; CirclePad's 5% funds buyback.": "리더의 15%는 하루 3%씩 베스팅, CirclePad의 5%는 바이백에 쓰입니다.",
    "Everyone votes on name, ticker, logo, roadmap, date.": "모두가 이름, 티커, 로고, 로드맵, 날짜에 투표합니다.",
    "No project has launched through CirclePad yet.": "아직 CirclePad로 런치된 프로젝트가 없습니다.",
    "CirclePad runs one project at a time, so there's a single round to watch rather than a list to sift through. When a round is announced, it'll show up here and on Home.":
      "CirclePad는 한 번에 한 프로젝트만 진행하므로 목록을 뒤질 필요 없이 라운드 하나만 보면 됩니다. 라운드가 발표되면 여기와 홈에 표시됩니다.",
    "No contributors yet. The leaderboard fills in once a raise opens.": "아직 기여자가 없습니다. 모금이 열리면 리더보드가 채워집니다.",
    "Ranks every contributor in the current raise by USDC committed, with each one's share of the total.": "현재 모금의 모든 기여자를 기여한 USDC 순으로, 전체 대비 지분과 함께 보여줍니다.",
    "Connect your wallet to see your position.": "내 포지션을 보려면 지갑을 연결하세요.", "No contribution yet from this wallet.": "이 지갑은 아직 기여하지 않았습니다.",
    "Once a round is live, connecting your wallet here will show what you've contributed and your share of the raise so far.":
      "라운드가 열리면 여기서 지갑을 연결해 내 기여금과 지금까지의 지분을 볼 수 있습니다.",
    "No round has run yet, so the treasury currently holds nothing.": "아직 라운드가 진행되지 않아 트레저리는 비어 있습니다.",
    "Current proposal:": "현재 제안:", "Voting has closed.": "투표가 마감되었습니다.", "Voting is live — cast yours →": "투표 진행 중 — 투표하기 →",
    "Voting opens once the raise closes.": "투표는 모금이 끝나면 열립니다.", "Voting runs alongside the 3-day funding window and closes when the raise does.": "투표는 3일 모금 기간과 함께 진행되고 모금과 함께 마감됩니다.",
    "Couldn't load governance data — retrying shortly. Check the browser console for details.": "거버넌스 데이터를 불러오지 못했어요 — 곧 다시 시도합니다.",
    "Not enforced on-chain in this round — see Docs > Safety design for why.": "이번 라운드에서는 온체인으로 강제되지 않습니다 — 이유는 문서 > 안전 설계를 보세요.",
    "Two holder benefits are planned, both still being worked out in detail:": "홀더 혜택 두 가지가 계획되어 있으며, 세부 사항은 아직 정리 중입니다:",
    "ArcPad synergy": "ArcPad 시너지", "CirclePad airdrop": "CirclePad 에어드랍",
    "— existing ArcPad launch participants are planned to get an advantage when a CirclePad round opens.": "— 기존 ArcPad 런치 참여자는 CirclePad 라운드가 열릴 때 혜택을 받을 예정입니다.",
    "— a separate airdrop for CirclePad participants is also planned.": "— CirclePad 참여자를 위한 별도 에어드랍도 계획되어 있습니다.",
    "Neither benefit is live. Specifics — eligibility, size, timing — will land here once decided.": "두 혜택 모두 아직 라이브가 아닙니다. 자격, 규모, 시기는 정해지는 대로 여기에 올라옵니다.",
    "Holder benefits: participation in a project with real liquidity from block one (not a race against bots on an empty curve), plus a planned ArcPad synergy — details to come.":
      "홀더 혜택: 첫 블록부터 진짜 유동성이 있는 프로젝트에 참여(빈 커브에서 봇과 경쟁하지 않음), 그리고 계획된 ArcPad 시너지 — 자세한 내용은 곧 공개됩니다.",
    "The raise": "모금", "Leadership": "리더십", "The 12-hour checkpoint": "12시간 체크포인트", "Safety design": "안전 설계", "What's still not built": "아직 만들어지지 않은 것",
    "How this round actually closes": "이번 라운드가 실제로 마감되는 방식", "First round, actually built:": "실제로 구현된 첫 라운드:",
    "When the raise ends, the pooled USDC splits three ways:": "모금이 끝나면 모인 USDC는 세 갈래로 나뉩니다:", "LP liquidity": "LP 유동성",
    "Lead's payout (vested)": "리더 지급분 (베스팅)", "CirclePad platform": "CirclePad 플랫폼", "Is this live yet?": "지금 라이브인가요?",
    "Can the lead just take the money and never build anything?": "리더가 돈만 받고 아무것도 안 하면요?", "What if I'm not the top bidder — do I get anything back?": "최대 입찰자가 아니면 돌려받는 게 있나요?",
    "Why USDC and not $HOME or an ArcPad token?": "왜 $HOME이나 ArcPad 토큰이 아니라 USDC인가요?",
    "Problem: instant lump-sum payout": "문제: 한 번에 지급되는 일시금", "Problem: what happens if the lead vests some, then disappears?": "문제: 리더가 일부만 받고 사라지면?",
    "Fix:": "해결:", "Withdraw & split 80/5/15": "출금 & 80/5/15 분배", "recipient wallet": "수령 지갑", "platform wallet": "플랫폼 지갑", "treasury wallet": "트레저리 지갑",
    "Read the full design →": "전체 설계 보기 →", "How the flywheel works →": "플라이휠 작동 방식 →",
    "A single project raises USDC for 3 days on Arc. Every bid is recorded with the bidder's address and amount — this is what determines both voting weight and the final payout split.":
      "한 프로젝트가 Arc에서 3일 동안 USDC를 모읍니다. 모든 입찰은 주소와 금액으로 기록되며, 이것이 투표 가중치와 최종 분배를 모두 결정합니다.",
    "Whoever bid the most becomes the project lead. Every bidder — not just the lead — gets a vote, weighted by their share of the total raise, on the project's actual identity: coin name, ticker, logo, roadmap, and launch date.":
      "가장 많이 입찰한 사람이 프로젝트 리더가 됩니다. 리더뿐 아니라 모든 입찰자가 전체 모금 대비 지분만큼의 가중치로 프로젝트의 실제 정체성 — 코인 이름, 티커, 로고, 로드맵, 런치 날짜 — 에 투표합니다.",
    "The lead has 12 hours after the raise ends to publish the project's confirmed details plus an official X account and at least one more community channel (X Community, Telegram, or Discord — a website is optional but encouraged). Miss it, and leadership passes to the second-highest bidder, who gets the same 12 hours.":
      "리더는 모금 종료 후 12시간 안에 프로젝트 확정 정보와 공식 X 계정, 그리고 커뮤니티 채널 하나 이상(X 커뮤니티, 텔레그램, 디스코드 — 웹사이트는 선택이지만 권장)을 공개해야 합니다. 놓치면 리더십은 두 번째로 많이 입찰한 사람에게 넘어가고, 같은 12시간이 주어집니다.",
    "Every round splits its raised USDC three ways: 80% becomes LP liquidity immediately, 15% goes to the confirmed lead (vested), and 5% goes to CirclePad's own treasury.":
      "모든 라운드는 모금한 USDC를 세 갈래로 나눕니다: 80%는 즉시 LP 유동성, 15%는 확정된 리더(베스팅), 5%는 CirclePad 트레저리로.",
    "Every bidder in a raise — not just the top bidder — gets a vote on the project's identity, weighted by their share of the total raise. Five things get decided this way:":
      "최대 입찰자만이 아니라 모금의 모든 입찰자가 전체 대비 지분만큼 프로젝트 정체성에 투표합니다. 이렇게 다섯 가지가 정해집니다:",
    "Name": "이름", "Launch date": "런치 날짜", "Roadmap": "로드맵",
    "That 5%, together with CirclePad's own trading fees once projects are live, is meant to fund CirclePad's own buyback-and-burn and promotion — the same loop repeating project after project rather than a one-off.":
      "그 5%는 프로젝트가 라이브된 뒤의 CirclePad 거래 수수료와 함께 CirclePad의 바이백·소각과 홍보에 쓰입니다 — 일회성이 아니라 프로젝트마다 반복되는 순환입니다.",
    "The platform's 5%, plus CirclePad's own trading fees once projects are live, fund CirclePad's own buyback-and-burn and promotion — the same loop, project after project, rather than a one-off.":
      "플랫폼의 5%와 프로젝트 라이브 후 CirclePad 거래 수수료가 CirclePad의 바이백·소각과 홍보에 쓰입니다 — 일회성이 아니라 프로젝트마다 반복되는 순환입니다.",
    "This page is honest about what's still being worked out. Two things had to change before this was safe to build at all.":
      "이 페이지는 아직 정리 중인 부분을 솔직하게 적습니다. 안전하게 만들기 위해 두 가지를 바꿔야 했습니다.",
    "The original version paid 15% of the entire raise to the lead's wallet the moment the 12-hour checklist was met — an X account and one social channel. That's a low bar for a large, immediate payout: someone could self-fund a majority bid, clear the checklist in minutes, and walk away with most of their own contribution back plus a share of everyone else's.":
      "처음 버전은 12시간 체크리스트(X 계정과 소셜 채널 하나)만 채우면 전체 모금의 15%를 리더 지갑으로 바로 지급했습니다. 큰 금액을 즉시 주기에는 기준이 너무 낮았습니다: 누군가 스스로 과반을 입찰하고 몇 분 만에 체크리스트를 채운 뒤, 자기 돈 대부분과 다른 사람 몫 일부를 들고 떠날 수 있었습니다.",
    "The confirmed lead's 15% doesn't land all at once. It vests": "확정된 리더의 15%는 한 번에 지급되지 않습니다. 베스팅되며", "3% per day over 5 days": "5일 동안 하루 3%씩",
    ". If the lead stops running the project, whatever hasn't vested yet returns to the original bidders, split proportionally to what they put in.":
      ". 리더가 프로젝트를 멈추면 아직 베스팅되지 않은 금액은 원래 입찰자들에게 기여 비율대로 돌아갑니다.",
    "the 15% vests 3% per day over 5 days instead of paying out immediately.": "15%는 즉시 지급 대신 5일 동안 하루 3%씩 베스팅됩니다.",
    "Vesting alone doesn't fully close the gap — someone could still collect a few days' worth of tranches and stop. The remaining, unvested amount needs a defined, automatic path back to bidders rather than sitting stuck or depending on a human deciding \"this looks abandoned.\"":
      "베스팅만으로는 틈이 완전히 막히지 않습니다 — 며칠치만 받고 멈출 수도 있으니까요. 남은 미베스팅 금액은 묶여 있거나 누군가 \"버려진 것 같다\"고 판단하는 데 의존하지 않고, 정해진 자동 경로로 입찰자에게 돌아가야 합니다.",
    "the lead must check in on-chain periodically (roughly every 48 hours). Miss a check-in, and the project is automatically marked abandoned — no admin, no vote, no judgment call — and everything left unvested returns to the original bidders, split proportionally to what they put in.":
      "리더는 주기적으로(약 48시간마다) 온체인 체크인을 해야 합니다. 체크인을 놓치면 관리자, 투표, 판단 없이 프로젝트가 자동으로 포기 처리되고 남은 미베스팅 금액은 원래 입찰자들에게 기여 비율대로 돌아갑니다.",
    "That's exactly the failure mode this is designed against — see Safety design. The payout is small and slow at first (3%/day), and stops automatically without a check-in.":
      "바로 그 실패를 막도록 설계했습니다 — 안전 설계를 보세요. 지급은 처음에 작고 느리며(하루 3%), 체크인이 없으면 자동으로 멈춥니다.",
    "Yes — every bidder gets a vote on the project's identity, and if the lead is ever marked abandoned, unvested funds return to all original bidders proportionally, not just the lead.":
      "네 — 모든 입찰자가 프로젝트 정체성에 투표하고, 리더가 포기 처리되면 미베스팅 자금은 리더가 아니라 모든 원래 입찰자에게 비율대로 돌아갑니다.",
    "USDC is Arc's own native gas token, so it's the natural first quote asset — no bridging, no extra approval step. Other quote assets may follow once the core mechanism is live and tested.":
      "USDC는 Arc의 네이티브 가스 토큰이라 첫 기준 자산으로 자연스럽습니다 — 브릿지도 추가 승인도 없습니다. 핵심 구조가 라이브되고 검증되면 다른 기준 자산도 추가될 수 있습니다.",
    "The fund-pooling, auction, voting, vesting, and clawback logic described on this page is a brand-new smart contract — not a reuse of ArcPad's existing, already-deployed factory the way most of that side of the site works. Code that pools money from multiple people carries real risk if it has a bug. It is not going live with real funds without a real security review first.":
      "이 페이지에서 설명하는 모금, 경매, 투표, 베스팅, 회수 로직은 완전히 새로운 스마트 컨트랙트입니다 — ArcPad처럼 이미 배포된 팩토리를 재사용하는 것이 아닙니다. 여러 사람의 돈을 모으는 코드는 버그가 있으면 실제 위험이 있습니다. 제대로 된 보안 검토 없이는 실제 자금으로 라이브하지 않습니다.",
    "Partly. The first-round escrow contract is deployed on Arc mainnet (see Contracts below) — once the recipient starts the clock, the 72-hour USDC raise is real and the Home panel switches from preview to live numbers. The bigger lead/vote/vesting mechanism described here is a separate contract that is still in design and review.":
      "부분적으로요. 첫 라운드 에스크로 컨트랙트는 Arc 메인넷에 배포되어 있습니다(아래 컨트랙트 참고) — 수령인이 시계를 시작하면 72시간 USDC 모금은 실제이고 홈 패널도 미리보기에서 실시간 숫자로 바뀝니다. 여기서 설명하는 리더/투표/베스팅 구조는 아직 설계·검토 중인 별도 컨트랙트입니다.",
    "This round is contribution-only on-chain: USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72-hour window closes. Voting on name, ticker, logo, and roadmap is not enforced by this contract — see Docs > Safety design.":
      "이번 라운드는 온체인에서 기여만 처리합니다: USDC는 에스크로 컨트랙트에 보관되고 72시간이 끝나기 전 언제든 내 기여금을 출금할 수 있습니다. 이름, 티커, 로고, 로드맵 투표는 이 컨트랙트가 강제하지 않습니다 — 문서 > 안전 설계를 보세요.",
    "This round's contract only handles contributions. Voting on name, ticker, logo, roadmap, and launch date is not enforced by smart contract here — how that gets decided will be announced separately.":
      "이번 라운드의 컨트랙트는 기여만 처리합니다. 이름, 티커, 로고, 로드맵, 런치 날짜 투표는 여기서 스마트 컨트랙트로 강제되지 않으며, 결정 방식은 따로 발표됩니다.",
    "Once the recipient starts the clock, the raise runs for 72 hours. Contributors can withdraw their own USDC any time before it closes, no lock-in. When it closes, the balance splits automatically: 80% to the":
      "수령인이 시계를 시작하면 모금은 72시간 동안 진행됩니다. 기여자는 마감 전 언제든 자기 USDC를 출금할 수 있고 잠금이 없습니다. 마감되면 잔액이 자동으로 나뉩니다: 80%는",
    ", 5% to the": ", 5%는", ", and 15% to the": ", 그리고 15%는",
    ". The bigger vote/lead/vesting mechanism described above this card is a separate contract, still in design and review.": ". 이 카드 위에서 설명한 투표/리더/베스팅 구조는 아직 설계·검토 중인 별도 컨트랙트입니다.",
    "the recipient wallet starts a 72-hour timer. Anyone can contribute USDC while it's open, and withdraw their own contribution back any time before it closes — no lock-in. When it closes, the balance splits 80% recipient / 5% platform / 15% treasury automatically. None of the bidding, leadership, or voting described below is on-chain yet in this round — see Safety design.":
      "수령 지갑이 72시간 타이머를 시작합니다. 열려 있는 동안 누구나 USDC를 기여하고 마감 전 언제든 자기 기여금을 돌려받을 수 있습니다 — 잠금 없음. 마감되면 잔액이 수령인 80% / 플랫폼 5% / 트레저리 15%로 자동 분배됩니다. 아래의 입찰, 리더십, 투표는 이번 라운드에서 아직 온체인이 아닙니다 — 안전 설계를 보세요.",
    "80% recipient wallet / 5% platform wallet / 15% treasury wallet, paid directly — no LP liquidity or vesting yet. The split below is the longer-term vision this round doesn't implement.":
      "수령 지갑 80% / 플랫폼 지갑 5% / 트레저리 지갑 15%로 바로 지급 — 아직 LP 유동성이나 베스팅은 없습니다. 아래 분배는 이번 라운드가 구현하지 않는 장기 비전입니다.",
    "becomes real LP liquidity immediately (not a bonding curve that snipers can race from zero),": "즉시 진짜 LP 유동성이 되고(스나이퍼가 0부터 경쟁하는 본딩 커브가 아님),",
    "goes to the CirclePad platform, and": "는 CirclePad 플랫폼으로, 그리고",
    "is reserved for the confirmed lead. Dexscreener listing and a 100x boost are paid for by the platform, not the lead.": "는 확정된 리더 몫입니다. Dexscreener 등록과 100x 부스트 비용은 리더가 아니라 플랫폼이 냅니다.",
    "Holds the 72h USDC raise; withdraw any time before close; 80/5/15 split at close": "72시간 USDC 모금 보관, 마감 전 언제든 출금, 마감 시 80/5/15 분배",
    "Name / ticker / logo / roadmap / launch-date votes, weighted by contribution — deploys once the raise has started": "이름 / 티커 / 로고 / 로드맵 / 런치 날짜 투표, 기여 가중 — 모금이 시작되면 배포",
    "Every CirclePad contract on Arc mainnet, read straight from this site's config so this list can't drift from what's deployed. Verify anything here on the explorer before you contribute.":
      "Arc 메인넷의 모든 CirclePad 컨트랙트입니다. 사이트 설정에서 바로 읽어 와 실제 배포와 어긋날 수 없습니다. 기여 전에 익스플로러에서 확인하세요.",

    // ---- Hub pages (/, /arcircle) ----
    "One community. Two ways to launch.": "하나의 커뮤니티. 두 가지 런치 방식.", "On Circle's Arc · gas paid in USDC": "Circle의 Arc 위 · 가스는 USDC로",
    "One coin at the center of it all.": "모든 것의 중심에 있는 하나의 코인.", "Buy $ARCIRCLE": "$ARCIRCLE 사기", "The core coin of ARCIRCLE PAD": "ARCIRCLE PAD의 코어 코인",
    "ArcPad and CirclePad are two different ways to launch on Arc. $ARCIRCLE is the one coin that sits between them — and what both launchpads earn, together with $ARCIRCLE's own trading fees, is put to work for it.":
      "ArcPad와 CirclePad는 Arc에서 런치하는 서로 다른 두 방식입니다. $ARCIRCLE은 그 사이에 있는 하나의 코인이며, 두 런치패드가 버는 수익과 $ARCIRCLE 자체 거래 수수료가 모두 이 코인을 위해 쓰입니다.",
    "Contract · Arc": "컨트랙트 · Arc", "Buy on foci ↗": "foci에서 사기 ↗", "Trade on ArcPad →": "ArcPad에서 거래 →", "Trades on": "거래처",
    "What $ARCIRCLE is": "$ARCIRCLE이란", "One coin at the center of two launchpads.": "두 런치패드의 중심에 있는 하나의 코인.",
    "Every coin launched on ArcPad and every raise on CirclePad happens inside one ecosystem. $ARCIRCLE is how that ecosystem's growth comes back to one place.":
      "ArcPad의 모든 런치와 CirclePad의 모든 모금은 하나의 생태계 안에서 일어납니다. $ARCIRCLE은 그 성장이 한곳으로 돌아오는 통로입니다.",
    "Two launchpads, one coin": "두 런치패드, 하나의 코인", "ArcPad for instant, permissionless launches. CirclePad for community-funded ones. Both point back to $ARCIRCLE.":
      "ArcPad는 즉시·무허가 런치, CirclePad는 커뮤니티 펀딩 런치. 둘 다 $ARCIRCLE로 이어집니다.",
    "Fed by real activity": "실제 활동이 원동력", "Launch fees, trading fees, raise shares and $ARCIRCLE's own creator tax all flow into the same flywheel.":
      "런치 수수료, 거래 수수료, 모금 몫, $ARCIRCLE 크리에이터 세금이 모두 같은 플라이휠로 들어갑니다.",
    "Rewards on the way": "리워드 준비 중", "A reward system for $ARCIRCLE holders and for creators is being built.": "$ARCIRCLE 홀더와 크리에이터를 위한 리워드 시스템을 만들고 있습니다.",
    "See what's coming →": "무엇이 오는지 보기 →", "The flywheel": "플라이휠", "Every launch turns the wheel. The wheel turns for $ARCIRCLE.": "모든 런치가 바퀴를 돌리고, 그 바퀴는 $ARCIRCLE을 위해 돕니다.",
    "More launches mean more revenue. More revenue means more going back into $ARCIRCLE. A stronger $ARCIRCLE brings in more creators — and the loop starts again.":
      "런치가 많을수록 수익이 늘고, 수익이 늘수록 $ARCIRCLE로 더 많이 돌아갑니다. 더 강한 $ARCIRCLE은 더 많은 크리에이터를 부르고 — 순환이 다시 시작됩니다.",
    "$ARCIRCLE flywheel": "$ARCIRCLE 플라이휠", "A loop of four steps around $ARCIRCLE: 1 Launch, 2 Earn, 3 Buy back, 4 Grow, then back to Launch.": "$ARCIRCLE을 도는 4단계: 1 런치, 2 수익, 3 바이백, 4 성장, 다시 런치로.",
    "Earn": "수익", "Buy back": "바이백", "Grow": "성장",
    "Creators launch coins on ArcPad and raise together on CirclePad. Every launch brings new people and new volume to Arc.": "크리에이터는 ArcPad에서 코인을 런치하고 CirclePad에서 함께 모금합니다. 모든 런치가 Arc에 새로운 사람과 거래량을 가져옵니다.",
    "Launch fees, ArcPad's platform allocation and trading fees, CirclePad's raise share, and $ARCIRCLE's own 2% creator tax flow in.": "런치 수수료, ArcPad 플랫폼 배분과 거래 수수료, CirclePad 모금 몫, $ARCIRCLE 자체 2% 크리에이터 세금이 들어옵니다.",
    "That revenue goes back into $ARCIRCLE — buybacks and liquidity support that work for its value.": "그 수익은 $ARCIRCLE로 돌아갑니다 — 가치를 위한 바이백과 유동성 지원.",
    "A stronger $ARCIRCLE funds holder and creator rewards (coming soon) and draws in more creators — so the next round of launches is bigger.": "더 강한 $ARCIRCLE이 홀더·크리에이터 리워드(준비 중)의 재원이 되고 더 많은 크리에이터를 부릅니다 — 그래서 다음 런치는 더 커집니다.",
    "What feeds it": "원동력", "Where the revenue comes from.": "수익은 어디서 오나.", "Five sources, all coming from actual use of the ecosystem — not from new token emissions.": "다섯 가지 원천, 모두 생태계의 실제 사용에서 나옵니다 — 신규 토큰 발행이 아닙니다.",
    "Direct fee on every $ARCIRCLE trade on foci": "foci의 모든 $ARCIRCLE 거래에 붙는 직접 수수료", "Launch fee": "런치 수수료", "Paid for every coin launched on ArcPad": "ArcPad에서 런치되는 모든 코인이 지불",
    "Platform allocation": "플랫폼 배분", "Of every ArcPad coin's supply, set aside at launch": "모든 ArcPad 코인 공급량 중 런치 때 떼어 둠", "Trading fees": "거래 수수료",
    "The platform's share of fees on ArcPad trades": "ArcPad 거래 수수료 중 플랫폼 몫", "Raise share": "모금 몫", "The platform's cut of every CirclePad raise when it closes": "모든 CirclePad 모금 마감 시 플랫폼 몫",
    "Share": "공유", "Where it goes": "어디로 가나", "$ARCIRCLE buybacks": "$ARCIRCLE 바이백", "Liquidity support": "유동성 지원", "Holder & creator rewards": "홀더 & 크리에이터 리워드", "Soon": "곧",
    "The exact split between these will be published here before it goes live.": "이들 사이의 정확한 분배는 시작 전에 여기에 공개됩니다.",
    "Get $ARCIRCLE": "$ARCIRCLE 얻기", "How to buy.": "사는 방법.", "$ARCIRCLE trades on foci, on Arc. Arc uses USDC for gas, so USDC is all you need.": "$ARCIRCLE은 Arc의 foci에서 거래됩니다. Arc는 가스로 USDC를 쓰니 USDC만 있으면 됩니다.",
    "Get USDC on Arc": "Arc에서 USDC 준비", "Fund a wallet on Arc with USDC. It covers both the purchase and the gas.": "Arc 지갑에 USDC를 넣으세요. 구매와 가스를 모두 해결합니다.",
    "Open $ARCIRCLE on foci": "foci에서 $ARCIRCLE 열기", "Go to": "이동:", "and check the contract matches the one above.": "후 컨트랙트가 위 주소와 같은지 확인하세요.",
    "Connect and buy": "연결하고 사기", "Connect your wallet on foci, enter an amount in USDC and confirm the swap.": "foci에서 지갑을 연결하고 USDC 금액을 입력한 뒤 스왑을 승인하세요.",
    "$ARCIRCLE is a community memecoin on Circle's Arc chain. Nothing on this page is financial advice or a promise of returns. The flywheel describes how ARCIRCLE PAD intends to use its revenue; details are published here as each part goes live. Crypto is volatile — only use what you can afford to lose.":
      "$ARCIRCLE은 Circle의 Arc 체인 위 커뮤니티 밈코인입니다. 이 페이지의 어떤 내용도 투자 조언이나 수익 약속이 아닙니다. 플라이휠은 ARCIRCLE PAD가 수익을 어떻게 쓰려는지를 설명하며, 각 부분이 시작될 때 세부 내용이 여기에 공개됩니다. 암호화폐는 변동성이 크니 잃어도 괜찮은 만큼만 사용하세요.",
    "Total supply": "총 공급량", "2% per trade": "거래당 2%",

    // ---- Reward page ----
    "Coming soon · In design": "준비 중 · 설계 단계", "Rewards for the people who": "ARCIRCLE PAD를 키우는", "grow ARCIRCLE PAD.": "사람들을 위한 리워드.",
    "The reward system is how the flywheel gives back — to the ones who hold $ARCIRCLE and the ones who launch. It is funded by what ArcPad and CirclePad earn, never by new tokens, and it goes live only once its rules are published here.":
      "리워드 시스템은 플라이휠이 되돌려주는 방식입니다 — $ARCIRCLE을 보유한 사람과 런치하는 사람에게. 재원은 ArcPad와 CirclePad의 수익이며 신규 토큰이 아니고, 규칙이 여기에 공개된 뒤에만 시작됩니다.",
    "See the programs": "프로그램 보기", "How it's funded": "재원", "Check a wallet": "지갑 조회", "Status": "상태", "In design": "설계 중", "Funded by": "재원",
    "Ecosystem revenue": "생태계 수익", "New $ARCIRCLE minted": "신규 발행 $ARCIRCLE", "0 — ever": "0 — 영원히", "Target": "목표 시기", "Q4 2026 – Q1 2027": "2026년 4분기 – 2027년 1분기",
    "Two programs": "두 가지 프로그램", "One for holders. One for creators.": "하나는 홀더를, 하나는 크리에이터를.",
    "Both are paid from the same place — the revenue the ecosystem actually earns — and both are designed to reward staying and building, not showing up for one snapshot.":
      "둘 다 같은 곳 — 생태계가 실제로 버는 수익 — 에서 지급되며, 한 번의 스냅샷이 아니라 꾸준히 머물고 만드는 것을 보상하도록 설계됩니다.",
    "Holder rewards": "홀더 리워드", "Creator rewards": "크리에이터 리워드", "Planned": "계획됨",
    "For $ARCIRCLE holders, funded by what ArcPad and CirclePad earn. The aim is to reward holding": "$ARCIRCLE 홀더를 위한 리워드로, ArcPad와 CirclePad의 수익이 재원입니다. 목표는 보유를", "through time": "시간에 걸쳐",
    ", not just a balance on one day.": " 보상하는 것이지, 하루의 잔액이 아닙니다.",
    "For creators who launch on ArcPad or raise on CirclePad and bring": "ArcPad에서 런치하거나 CirclePad에서 모금해 Arc에", "real activity": "진짜 활동을",
    "to Arc — measured by genuine trading and holders, not by how many coins someone launches.": " 가져오는 크리에이터를 위한 리워드 — 런치한 코인 수가 아니라 실제 거래와 홀더로 측정합니다.",
    "Measured by": "측정 기준", "Snapshots": "스냅샷", "Guard": "방지 장치", "Boost": "부스트", "Average $ARCIRCLE held over an epoch": "한 기간 동안의 평균 $ARCIRCLE 보유량",
    "Taken at unannounced times": "예고 없이 촬영", "Minimum holding period": "최소 보유 기간", "Organic volume, unique buyers, holder retention": "자연 거래량, 고유 매수자, 홀더 유지율",
    "Launches paired with $ARCIRCLE": "$ARCIRCLE 페어 런치", "Activity windows, wash-trading filters": "활동 기간, 자전거래 필터",
    "Paid from revenue — never from emissions.": "수익에서 지급 — 발행이 아닙니다.",
    "$ARCIRCLE's supply is fixed at one billion. Rewards come out of real ecosystem income: the same five sources that turn the $ARCIRCLE flywheel.": "$ARCIRCLE 공급량은 10억 개로 고정입니다. 리워드는 실제 생태계 수익에서 나옵니다: $ARCIRCLE 플라이휠을 돌리는 바로 그 다섯 가지 원천입니다.",
    "Flat fee on every coin launched": "런치되는 모든 코인에 고정 수수료", "Of every ArcPad coin's supply, paid in that coin": "모든 ArcPad 코인 공급량 중, 해당 코인으로 지급",
    "Trading-fee share": "거래 수수료 몫", "30% of the 1% base fee on every ArcPad trade": "모든 ArcPad 거래의 기본 1% 수수료 중 30%", "Of each CirclePad raise when it closes": "각 CirclePad 모금 마감 시",
    "On every $ARCIRCLE trade on its curve": "커브 위 모든 $ARCIRCLE 거래에",
    "The split between these is published on the $ARCIRCLE page before any of it goes live. Treasury wallet:": "이들 사이의 분배는 시작 전에 $ARCIRCLE 페이지에 공개됩니다. 트레저리 지갑:",
    "$ARCIRCLE price": "$ARCIRCLE 가격", "$ARCIRCLE market cap": "$ARCIRCLE 시가총액", "Coins launched on ArcPad": "ArcPad에서 런치된 코인", "$ARCIRCLE graduation": "$ARCIRCLE 졸업",
    "Design principles": "설계 원칙", "Four rules the program is built on.": "프로그램의 네 가지 원칙.", "Funded by revenue": "수익이 재원",
    "Rewards come out of real ecosystem income. No new $ARCIRCLE is ever created to pay them.": "리워드는 실제 생태계 수익에서 나옵니다. 지급을 위해 $ARCIRCLE을 새로 만들지 않습니다.",
    "Hard to farm": "파밍하기 어렵게", "Unannounced snapshots, minimum holding periods and activity measured over windows make short-term balances and wash trading expensive.":
      "예고 없는 스냅샷, 최소 보유 기간, 기간 단위 활동 측정으로 단기 잔액과 자전거래의 비용을 높입니다.",
    "Verifiable": "검증 가능", "Eligibility rules are published, and anyone can recompute the results from public chain data.": "자격 규칙은 공개되며, 누구나 공개 체인 데이터로 결과를 다시 계산할 수 있습니다.",
    "Simple to claim": "쉬운 청구", "One place to see eligibility and claim — this page, once the program is live.": "자격 확인과 청구를 한곳에서 — 프로그램이 시작되면 바로 이 페이지에서.",
    "Under study": "검토 중", "Candidate mechanics.": "후보 방식.", "These are the designs being evaluated now. The final program may use some, all or none of them.": "지금 평가 중인 설계들입니다. 최종 프로그램은 일부, 전부를 쓰거나 하나도 쓰지 않을 수 있습니다.",
    "Holders": "홀더", "Creators": "크리에이터", "Everyone": "모두", "Time-weighted snapshots": "시간 가중 스냅샷",
    "Your average balance over an epoch counts — not the balance in a single block. Buying just before a snapshot doesn't help.": "한 블록의 잔액이 아니라 기간 동안의 평균 잔액이 반영됩니다. 스냅샷 직전에 사는 건 도움이 되지 않습니다.",
    "Creator score": "크리에이터 점수", "Combines a coin's organic volume, unique buyers and holder retention, with a boost for launches paired with $ARCIRCLE.": "코인의 자연 거래량, 고유 매수자, 홀더 유지율을 합치고 $ARCIRCLE 페어 런치에는 부스트를 줍니다.",
    "Referral share": "추천 수수료", "A slice of fees for wallets and communities that bring in launches, once referral support is added to the routers.": "라우터에 추천 기능이 추가되면, 런치를 데려오는 지갑과 커뮤니티에 수수료 일부를 나눕니다.",
    "Before launch": "시작 전", "What the next update will define.": "다음 업데이트에서 정할 것.", "Nothing goes live until each of these is published on this page.": "이 항목들이 모두 이 페이지에 공개되기 전에는 아무것도 시작되지 않습니다.",
    "Who qualifies": "자격", "Holder thresholds and holding periods; creator activity criteria": "홀더 기준 보유량과 보유 기간, 크리에이터 활동 기준",
    "The share of revenue set aside for each program, visible on-chain": "각 프로그램에 배정되는 수익 비율, 온체인에서 확인 가능", "How it's paid": "지급 방식",
    "Asset (USDC, $ARCIRCLE or both), cadence and claim window": "지급 자산(USDC, $ARCIRCLE 또는 둘 다), 주기, 청구 기간", "Where to claim": "청구 장소", "Right here, on the Reward page": "바로 여기, 리워드 페이지",
    "To be published": "공개 예정", "Your wallet": "내 지갑", "Check a wallet.": "지갑 조회.",
    "See the on-chain activity the programs are designed around — read live from Arc. This is a preview, not an eligibility check: no rewards are live yet and nothing here promises any.":
      "프로그램이 기준으로 삼는 온체인 활동을 Arc에서 실시간으로 확인합니다. 자격 확인이 아닌 미리보기이며, 아직 리워드는 시작되지 않았고 여기의 어떤 것도 보상을 약속하지 않습니다.",
    "Paste a wallet address (0x…)": "지갑 주소를 붙여넣으세요 (0x…)", "Check": "조회", "$ARCIRCLE held": "보유 $ARCIRCLE", "Not holding $ARCIRCLE right now": "현재 $ARCIRCLE 미보유",
    "Creator activity is what creator rewards are designed to measure": "크리에이터 리워드가 측정하려는 것이 바로 크리에이터 활동입니다", "No ArcPad launches from this address yet": "이 주소의 ArcPad 런치가 아직 없습니다",
    "That doesn't look like a wallet address — it should start with 0x and be 42 characters long.": "지갑 주소 형식이 아닙니다 — 0x로 시작하는 42자여야 합니다.",
    "Couldn't reach Arc to read this wallet — check your connection and try again.": "Arc에 연결하지 못해 이 지갑을 읽지 못했어요 — 연결을 확인하고 다시 시도하세요.",
    "Where rewards sit on the roadmap.": "로드맵에서 리워드의 위치.", "Phase 0 — Foundation": "0단계 — 기반", "Phase 1 — First rounds": "1단계 — 첫 라운드", "Phase 2 — Rewards": "2단계 — 리워드", "Phase 3 — CirclePad v2": "3단계 — CirclePad v2",
    "Q3 2026 · Done": "2026년 3분기 · 완료", "Q4 2026 · In progress": "2026년 4분기 · 진행 중", "Q4 2026 – Q1 2027 · Planned": "2026년 4분기 – 2027년 1분기 · 계획", "Q1 – Q2 2027 · Planned": "2027년 1–2분기 · 계획",
    "$ARCIRCLE launched with 100% of supply in its public curve. ArcPad live on Arc mainnet. CirclePad escrow deployed.": "$ARCIRCLE이 공급량 100%를 공개 커브에 넣고 런치. ArcPad가 Arc 메인넷에서 라이브. CirclePad 에스크로 배포.",
    "Publish the flywheel revenue split. First treasury buybacks of $ARCIRCLE, posted with transaction links. First CirclePad round.": "플라이휠 수익 분배 공개. 트랜잭션 링크와 함께 첫 $ARCIRCLE 트레저리 바이백. 첫 CirclePad 라운드.",
    "Holder rewards v1 — time-weighted snapshots, funded by revenue": "홀더 리워드 v1 — 시간 가중 스냅샷, 수익이 재원", "Creator rewards v1 — based on organic volume, buyers and retention": "크리에이터 리워드 v1 — 자연 거래량, 매수자, 유지율 기반",
    "Rewards dashboard and claim on this page": "이 페이지의 리워드 대시보드와 청구", "Referral support in the routers, with a fee share for referrers": "라우터 추천 기능과 추천인 수수료 분배",
    "Lead vesting with automatic clawback, and the CirclePad participant airdrop — eligibility published before anything goes live.": "자동 회수가 포함된 리더 베스팅, CirclePad 참여자 에어드랍 — 자격은 시작 전에 공개합니다.",
    "Commitments": "약속", "What you can hold us to.": "우리가 지킬 약속.", "Publish before acting": "실행 전에 공개", "Revenue splits and reward rules are published here before they start.": "수익 분배와 리워드 규칙은 시작 전에 여기에 공개합니다.",
    "Known wallets": "공개된 지갑", "Treasury and platform wallets are public — follow every inflow and outflow on ArcScan.": "트레저리와 플랫폼 지갑은 공개되어 있습니다 — ArcScan에서 모든 입출금을 확인하세요.",
    "Report the results": "결과 보고", "Buybacks and reward payouts are posted with their transaction links.": "바이백과 리워드 지급은 트랜잭션 링크와 함께 게시합니다.",
    "No surprise supply": "예상 밖 발행 없음", "$ARCIRCLE stays at 1,000,000,000. Nothing in the program mints more.": "$ARCIRCLE은 10억 개로 유지됩니다. 프로그램의 어떤 것도 추가 발행하지 않습니다.",
    "Everything on this page is design intent. The reward program is not live, and its final form may differ from what is described here; it will only go live once its rules are published on this page. $ARCIRCLE is a community memecoin — holding it is not a share, a claim on revenue or a right to any payment. Nothing here is financial advice or a promise of returns. Full details:":
      "이 페이지의 모든 내용은 설계 의도입니다. 리워드 프로그램은 아직 라이브가 아니며 최종 형태는 여기 설명과 다를 수 있고, 규칙이 이 페이지에 공개된 뒤에만 시작됩니다. $ARCIRCLE은 커뮤니티 밈코인이며, 보유가 지분, 수익 청구권, 지급받을 권리를 뜻하지 않습니다. 이곳의 어떤 내용도 투자 조언이나 수익 약속이 아닙니다. 자세한 내용:",
    "whitepaper, Section 8": "백서 8장",
    "Balances rebuilt from every $ARCIRCLE transfer since launch. Tokens still in the bonding curve are the unsold supply.":
      "런치 이후 모든 $ARCIRCLE 전송 기록으로 잔액을 다시 계산했습니다. 본딩 커브에 남은 토큰이 미판매 공급량입니다.",
    "Every launch gets a real Uniswap v4 pool in the same transaction — paired with USDC, Arc's own native currency, or with $ARCIRCLE or any Arc token you choose.":
      "모든 런치는 같은 트랜잭션에서 진짜 Uniswap v4 풀을 받습니다 — Arc의 네이티브 화폐인 USDC, 또는 $ARCIRCLE이나 원하는 Arc 토큰과 페어로.",
    "Into the pool": "풀로", "Launch page": "런치 페이지", "On-chain": "온체인",
    "One project. A 3-day USDC raise decides who leads it and how it's split. Every contributor votes on what it becomes.":
      "하나의 프로젝트. 3일간의 USDC 모금이 리더와 분배를 정하고, 모든 기여자가 프로젝트의 모습에 투표합니다.",
    "No trades here yet.": "아직 거래가 없습니다.", "Not enough trades in this range yet.": "이 구간에는 아직 거래가 충분하지 않습니다.",
    "Flywheel & rewards": "플라이휠 & 리워드",

    // ---- watchlist / HOT / top coin ----
    "Portfolio": "포트폴리오", "Watchlist": "관심 목록", "Watch": "관심", "Watching": "관심 중",
    "Added to watchlist": "관심 목록에 추가했습니다", "Removed from watchlist": "관심 목록에서 뺐습니다",
    "Your watchlist is empty. Tap the star on any coin to keep it here.": "관심 목록이 비어 있습니다. 코인의 별을 누르면 여기에 모입니다.",
    "Among the most-traded coins in the last hour": "지난 1시간 동안 가장 많이 거래된 코인 중 하나",
    "Most traded · 24h": "24시간 최다 거래", "Volume": "거래량", "Since launch": "런치 대비",
    // ---- safety check ----
    "Safety check": "안전 점검", "Read live from Arc": "Arc에서 실시간으로 읽음",
    "Liquidity locked": "유동성 잠김", "The pool position is held by the factory, which has no function to remove it.": "풀 포지션은 팩토리가 보유하며, 팩토리에는 이를 빼는 함수가 없습니다.",
    "Fixed supply": "고정 공급량", "Unusual supply": "비정상 공급량",
    "1,000,000,000 minted once at launch. The token has no mint function and no owner.": "런치 때 10억 개를 한 번만 발행. 토큰에 추가 발행 함수도, 소유자도 없습니다.",
    "Small or no creator bag.": "크리에이터 보유량이 적거나 없습니다.", "A sizeable creator bag — watch for sells.": "크리에이터 보유량이 꽤 큽니다 — 매도에 주의하세요.",
    "The creator holds a large share of supply.": "크리에이터가 공급량의 큰 몫을 보유하고 있습니다.",
    "Creator holdings": "크리에이터 보유량", "Top 10 holders": "상위 10 홀더", "Indexing transfers…": "전송 기록 인덱싱 중…",
    "Excludes the pool, the fee hook and the 8% platform allocation.": "풀, 수수료 훅, 8% 플랫폼 할당분은 제외.",
    "1% base — 70% of it goes to the creator.": "기본 1% — 그중 70%가 크리에이터에게.",
    "This is the first one launched.": "이 코인이 가장 먼저 런치되었습니다.",
    "This is not the first — check the contract address before you buy.": "가장 먼저 나온 코인이 아닙니다 — 매수 전에 컨트랙트 주소를 확인하세요.",
    "Others:": "다른 코인:", "$ARCIRCLE (core coin)": "$ARCIRCLE (코어 코인)",
    // ---- portfolio ----
    "Every ArcPad coin and $ARCIRCLE in your wallet, and the coins you launched — read live from Arc.": "지갑에 있는 모든 ArcPad 코인과 $ARCIRCLE, 그리고 내가 런치한 코인 — Arc에서 실시간으로 읽습니다.",
    "Connect a wallet to see your portfolio": "지갑을 연결하면 포트폴리오를 볼 수 있습니다",
    "Your ArcPad coins, $ARCIRCLE and the coins you launched, read straight from Arc.": "내 ArcPad 코인, $ARCIRCLE, 내가 런치한 코인을 Arc에서 바로 읽어옵니다.",
    "Holdings value": "보유 자산 가치", "USDC (gas)": "USDC (가스)", "Coins held": "보유 코인", "Coins launched": "런치한 코인",
    "Creator fees 24h": "24h 크리에이터 수수료", "Holdings": "보유 자산", "Coin": "코인", "Value": "가치",
    "Your launches": "내 런치", "Trades 24h": "24h 거래", "Your fees 24h": "24h 내 수수료",
    "Fees are an estimate from the last 24h of trades: 70% of the 1% base fee plus your add-on. They are paid out by the fee hook as trades happen.": "수수료는 최근 24시간 거래 기준 추정치입니다: 기본 1% 수수료의 70%와 추가 수수료. 거래가 일어날 때마다 수수료 훅이 지급합니다.",
    "No ArcPad coins in this wallet yet.": "이 지갑에는 아직 ArcPad 코인이 없습니다.", "Explore coins →": "코인 둘러보기 →",
    "You haven't launched a coin from this wallet.": "이 지갑으로 런치한 코인이 없습니다.",
    "Couldn't read your balances from Arc — try again in a moment.": "Arc에서 잔액을 읽지 못했습니다 — 잠시 후 다시 시도하세요.",
    // ---- trade sheet / toasts ----
    "Trade": "거래", "Close": "닫기", "Your coin is live": "코인이 라이브되었습니다", "Trade confirmed": "거래 완료",
    // ---- launch form ----
    "$ARCIRCLE is the platform's core coin — pick another ticker so buyers aren't misled.": "$ARCIRCLE은 플랫폼의 코어 코인입니다 — 구매자가 헷갈리지 않도록 다른 티커를 고르세요.",
    "None": "없음", "Preview": "미리보기", "Your coin name": "코인 이름", "now": "방금", "new": "신규",
    // ---- creators leaderboard ----
    "A preview leaderboard of ArcPad creators, from the last 24 hours of on-chain trading in their coins.": "ArcPad 크리에이터 리더보드 미리보기 — 각 크리에이터 코인의 최근 24시간 온체인 거래 기준.",
    "Preview score": "미리보기 점수",
    "= 24h volume (USD) + 5 × 24h trades, summed over a creator's coins · ×1.25 for coins paired with $ARCIRCLE": "= 24h 거래량(USD) + 5 × 24h 거래 수, 크리에이터의 모든 코인 합산 · $ARCIRCLE 페어 코인은 ×1.25",
    "Coins": "코인", "Score": "점수",
    "The whitepaper's creator score is planned to combine organic volume, unique buyers and holder retention, with a boost for $ARCIRCLE-paired launches. This preview uses what can be read live today. No rewards are paid from it.": "백서의 크리에이터 점수는 자연 거래량, 고유 매수자, 홀더 유지율을 합치고 $ARCIRCLE 페어 런치에 가산점을 주는 방식으로 계획되어 있습니다. 이 미리보기는 지금 실시간으로 읽을 수 있는 값만 씁니다. 이 점수로 지급되는 리워드는 없습니다.",
    "$ARCIRCLE-paired boost": "$ARCIRCLE 페어 가산점",
    // ---- treasury buybacks ----
    "Treasury buybacks": "트레저리 바이백", "Indexing the curve's history…": "커브 기록 인덱싱 중…",
    "Every $ARCIRCLE buy by the platform's wallets, read from the curve": "플랫폼 지갑의 모든 $ARCIRCLE 매수 — 커브에서 직접 읽음",
    "Buybacks": "바이백", "USDC spent": "사용한 USDC", "$ARCIRCLE bought": "매수한 $ARCIRCLE", "Treasury holds": "트레저리 보유량",
    "Checking every trade since launch…": "런치 이후 모든 거래 확인 중…",
    "No buybacks yet. The whitepaper roadmap puts the first treasury buybacks in Phase 1 (Q4 2026) — each one will appear here automatically.": "아직 바이백이 없습니다. 백서 로드맵상 첫 트레저리 바이백은 1단계(2026년 4분기)이며, 실행되면 여기에 자동으로 표시됩니다.",
    "Tracked: Treasury": "추적 지갑: 트레저리", "· Platform wallet": "· 플랫폼 지갑",
    // ---- reward: invite + treasury ----
    "Invite link": "초대 링크", "Treasury $ARCIRCLE": "트레저리 $ARCIRCLE", "Buyback history →": "바이백 기록 →",
    "Anyone who opens ARCIRCLE PAD through this link is remembered as your invite in their browser for 30 days. Referral share is a candidate mechanic in the whitepaper — nothing is paid for invites yet.": "이 링크로 ARCIRCLE PAD에 들어온 사람은 30일 동안 그 브라우저에 내 초대로 기록됩니다. 추천 보상은 백서의 후보 메커니즘이며, 아직 초대에 대해 지급되는 것은 없습니다.",
    // ---- CirclePad alerts ----
    "Alert me when the raise opens": "모금이 열리면 알려주기",
    "Alert set — keep a CirclePad tab open and this browser will ping you the moment the raise opens.": "알림 설정됨 — CirclePad 탭을 열어 두면 모금이 열리는 순간 이 브라우저가 알려줍니다.",
    "Cancel alert": "알림 취소", "Add the close to my calendar": "마감 시각을 캘린더에 추가",
  };

  // Strings with live numbers — [pattern, replacement]
  var PATTERNS = [
    [/^Vol 24h (.+) · (\d+) trades?$/, "24h 거래량 $1 · $2건"],
    [/^Vol 24h …$/, "24h 거래량 …"],
    [/^(.+) mcap$/, "시총 $1"],
    [/^(\d+)([smhd]) ago$/, function (_, n, u) { return n + { s: "초", m: "분", h: "시간", d: "일" }[u] + " 전"; }],
    [/^(.+) \/ (.+) USDC to graduate · (.+)$/, "졸업까지 $1 / $2 USDC · $3"],
    [/^([▲▼]) ?(.+) since launch$/, "$1 $2 (런치 대비)"],
    [/^(\d+) launch(?:es)? live$/, "런치 $1개 진행 중"],
    [/^(.+) of 920M · (.+)$/, "9.2억 중 $1 · $2"],
    [/^(.+) USDC in the curve$/, "커브에 $1 USDC"],
    [/^(\d+(?:\.\d+)?)% per trade \(foci\)$/, "거래당 $1% (foci)"],
    [/^(\d+(?:\.\d+)?)% per trade$/, "거래당 $1%"],
    [/^\((\d+(?:\.\d+)?)% \+ (\d+(?:\.\d+)?)% creator tax\)$/, "($1% + 크리에이터 세금 $2%)"],
    [/^Balance: (.+)$/, "잔액: $1"],
    [/^Buy \$(.+)$/, "$$$1 매수"],
    [/^Sell \$(.+)$/, "$$$1 매도"],
    [/^Approve (.+) in wallet…$/, "지갑에서 $1 승인…"],
    [/^Approve (.+) for the router…$/, "라우터에 $1 승인…"],
    [/^Switch to (.+)$/, "$1(으)로 전환"],
    [/^Withdraw my (.+) USDC$/, "내 기여금 $1 USDC 출금"],
    [/^Withdraw (.+) USDC — split 80\/5\/15$/, "$1 USDC 출금 — 80/5/15 분배"],
    [/^Voting is open — closes in about (\d+)h\.$/, "투표 진행 중 — 약 $1시간 후 마감."],
    [/^Paired with (.+)$/, "$1 페어"],
    [/^(.+)% of total supply$/, "총 공급량의 $1%"],
    [/^Graduation progress (.+)$/, "졸업 진행률 $1"],
    [/^Indexing history… (\d+)%$/, "기록 인덱싱 중… $1%"],
    [/^Not enough USDC on Arc\. This launch needs about (.+)$/, "Arc에 USDC가 부족합니다. 이 런치에는 약 $1"],
    [/^Same ticker ×(\d+)$/, "같은 티커 ×$1"],
    [/^(\d+) coins use \$(.+) — check the contract address$/, "코인 $1개가 $$$2 사용 중 — 컨트랙트 주소를 확인하세요"],
    [/^(\d+) coins use \$(.+)\.$/, "코인 $1개가 $$$2 티커를 사용합니다."],
    [/^Creator holds (.+)%$/, "크리에이터 보유 $1%"],
    [/^Top 10 hold (.+)%$/, "상위 10명 보유 $1%"],
    [/^Trade fee (.+)%$/, "거래 수수료 $1%"],
    [/^1% base \+ (.+)% creator add-on\.$/, "기본 1% + 크리에이터 추가 $1%."],
    [/^Total supply reads (.+)\.$/, "총 공급량 $1."],
    [/^Fee (.+)% · (.+)% to you$/, "수수료 $1% · 나에게 $2%"],
    [/^Fee (.+)%$/, "수수료 $1%"],
    [/^\$(.+) is already used by (\d+) coins? on ArcPad\. You can still launch, but buyers may mix them up\.$/, "$$$1 티커는 ArcPad에서 이미 코인 $2개가 사용 중입니다. 런치는 가능하지만 구매자가 헷갈릴 수 있습니다."],
  ];

  var ATTRS = ["placeholder", "title", "aria-label"];
  var SKIP = "script,style,noscript,code,textarea,[data-no-i18n],.ac2-ca-full,.ac2-ca-short";
  var KEY = "arcircle.lang";
  var lang = "en";
  try { lang = localStorage.getItem(KEY) || ((navigator.language || "").toLowerCase().indexOf("ko") === 0 ? "ko" : "en"); } catch (e) { /* default en */ }

  function translate(en) {
    var t = en.replace(/\s+/g, " ").trim();
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(KO, t)) return KO[t];
    for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i][0].test(t)) return t.replace(PATTERNS[i][0], PATTERNS[i][1]);
    return null;
  }
  function skip(el) { return !el || (el.closest && el.closest(SKIP)); }

  function doText(n) {
    if (skip(n.parentElement)) return;
    var cur = n.nodeValue;
    if (n.__ko != null && cur === n.__ko) { if (lang === "en") { n.nodeValue = n.__en; } return; }
    // new text from the page (English)
    n.__en = cur; n.__ko = null;
    if (lang !== "ko") return;
    var ko = translate(cur);
    if (ko == null) return;
    var lead = cur.match(/^\s*/)[0], trail = cur.match(/\s*$/)[0];
    n.__ko = lead + ko + trail;
    n.nodeValue = n.__ko;
  }
  function doAttrs(el) {
    if (skip(el)) return;
    var store = el.__i18nAttr || (el.__i18nAttr = {});
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      var v = el.getAttribute(a), s = store[a];
      if (s && v === s.ko) { if (lang === "en") el.setAttribute(a, s.en); return; }
      if (s && lang === "en" && v === s.en) return;
      store[a] = { en: v, ko: null };
      if (lang !== "ko") return;
      var ko = translate(v);
      if (ko != null) { store[a].ko = ko; el.setAttribute(a, ko); }
    });
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || skip(root)) return;
    if (root.hasAttribute && ATTRS.some(function (a) { return root.hasAttribute(a); })) doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else if (ATTRS.some(function (a) { return n.hasAttribute(a); })) doAttrs(n);
    }
  }
  function restoreAll() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (n.__ko != null && n.nodeValue === n.__ko) n.nodeValue = n.__en; n.__ko = null; }
      else if (n.__i18nAttr) {
        var st = n.__i18nAttr;
        Object.keys(st).forEach(function (a) { if (st[a].ko != null && n.getAttribute(a) === st[a].ko) n.setAttribute(a, st[a].en); st[a].ko = null; });
      }
    }
  }

  var paused = false;
  var observer = new MutationObserver(function (muts) {
    if (paused || lang !== "ko") return;
    paused = true;
    try {
      muts.forEach(function (m) {
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      });
    } finally { paused = false; }
  });

  function setLang(next, save) {
    lang = next === "ko" ? "ko" : "en";
    if (save) { try { localStorage.setItem(KEY, lang); } catch (e) { /* fine */ } }
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle("lang-ko", lang === "ko");
    paused = true;
    if (lang === "ko") walk(document.body); else restoreAll();
    paused = false;
    document.querySelectorAll(".lang-toggle").forEach(function (b) {
      b.setAttribute("aria-label", lang === "ko" ? "Switch to English" : "한국어로 보기");
      b.querySelectorAll("span").forEach(function (s) { s.classList.toggle("on", s.dataset.l === lang); });
    });
  }

  function mountToggle() {
    var host = document.querySelector(".bp-topbar-right") || document.querySelector("header.ax-top");
    if (!host || host.querySelector(".lang-toggle")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "lang-toggle";
    b.setAttribute("data-no-i18n", "");
    b.innerHTML = '<span data-l="en">EN</span><span data-l="ko">한</span>';
    b.addEventListener("click", function () { setLang(lang === "ko" ? "en" : "ko", true); });
    if (host.matches(".bp-topbar-right")) host.insertBefore(b, host.firstChild);
    else {
      var cta = host.querySelector(".ax-top-cta");
      var wrap = document.createElement("div");
      wrap.className = "ax-top-right";
      host.insertBefore(wrap, cta || null);
      wrap.appendChild(b);
      if (cta) wrap.appendChild(cta);
    }
  }

  function start() {
    mountToggle();
    setLang(lang, false);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  window.arcI18n = { set: function (l) { setLang(l, true); }, get: function () { return lang; }, translate: translate };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
