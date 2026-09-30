# ARCIA AGENT — 설계와 배포

사이트: `/arc#agent` (유틸리티 4페이지 첫 칸, 사이드바 ARCIA DESK 아래)

## 무엇을 하나

1. **리포트** — Arc 토큰 CA를 붙여넣으면 Token Scanner v3로 끝까지 읽고, ARCIA가 쉬운 말로 요약합니다(Claude 키가 있으면 Claude, 없으면 규칙 문장).
2. **안전 콜(24시간)** — Safe / Caution / Risky. 결과가 나오기 전에 해시와 함께 기록하고, 24시간 뒤 시장으로 채점합니다.
   - "나빠짐" = 가격 −60% 이상 또는 유동성 −50% 이상
   - Safe는 안 나빠지면 적중, Risky는 나빠지면 적중, Caution은 채점 안 함
   - 토큰당 12시간에 한 번. 가격 방향 예측이 아니고 매수·매도 신호가 아님
3. **소각 금고(Burn vault)** — 토큰별 금고. 누구나 열고 누구나 USDC로 채웁니다. ARCIA는 **언제 살지만** 정하고, 할 수 있는 건 그 토큰을 사서 0x…dEaD로 보내는 것뿐입니다.

## 컨트랙트 (`contracts/contracts/ArciaAgent.sol`)

**ArciaAgentVault** (토큰마다 하나)
- `buyAndBurn(usdcIn, minOut)` — ARCIA 키만. 산 토큰은 전부 0x…dEaD로. 판매 함수 없음
- 한도: 매수당 `maxBuy`, UTC 하루 `dailyCap`, 매수 간격 `cooldown`(최소 60초)
- 주인: 엄격하게 바꾸면 즉시, 완화는 **1시간 뒤**(`applyLimits`는 누구나)
- 주인: 일시정지, ARCIA 끄기(`setAgentOn(false)`), 출금(항상 주인 지갑으로, 언제든), 소유권 이전
- `quote` / `quoteRoundTrip` — eth_call 전용 시세·세금 확인(항상 revert, 아무것도 남지 않음)

**ArciaAgentFactory** (하나)
- `createVault(poolKey, maxBuy, dailyCap, cooldown)` — USDC 페어, 허용된 훅(Argus 0x2044/0x20cc 패턴, ArcPad 훅 주소, 훅 없음), 초기화된 풀만
- 팀(owner): 전체 정지(`setPaused`), 금고 개설 시 $ARCIRCLE 소각량(`setCreateBurn`, 기본 0), 허용 훅 관리
- ARCIA 키 교체: `queueOperator` → **24시간 뒤** `applyOperator`(누구나). 급할 땐 전체 정지 먼저
- 팀은 금고의 돈에 접근할 수 없음

테스트: `contracts/test/arcia-agent.test.js` (10개 통과 — 로컬 Uniswap v4 PoolManager + 3% 세금 훅)

## ARCIA의 규칙 (`api/_agent.mjs`, ARCIA DESK 실행 직후 매분 돌아감)

- 첫 매수 전 가격을 3번 이상 확인
- 15분 +8% 또는 1시간 +20% 오른 뒤에는 매수 안 함(눌림 대기)
- 매수 한 번이 가격을 3% 넘게 움직이면 절반으로 줄임, $0.5 미만이면 건너뜀
- 사고 바로 팔 때 30% 넘게 잃으면(악성 세금) 중단
- minOut = 시세 −2%, 한 번 실행에 최대 3개 금고 매수
- 모든 행동은 tx와 이유와 함께 기록(Actions 탭)

## 배포 순서 (직접 실행)

1. ARCIA AGENT 전용 **새 지갑**을 만듭니다(데스크 키와 다른 지갑). 가스용 USDC를 조금 넣습니다.
2. `contracts/.env`에 넣습니다(화면 공유 금지):
   - `DEPLOYER_PRIVATE_KEY` — 가스 낼 아무 지갑(권한 없음). 노출된 0x80e1…8bc7은 금지
   - `AGENT_OWNER` — 본인 메인 지갑 **주소**
   - `AGENT_OPERATOR` — 1번 새 지갑의 **주소**
3. 실행:
   ```
   cd contracts
   npx hardhat run scripts/deploy-arcia-agent.js --network arcMainnet
   ```
4. Vercel 환경변수(Sensitive):
   - `ARCIA_AGENT_FACTORY` = 출력된 팩토리 주소
   - `ARCIA_AGENT_KEY` = 1번 새 지갑의 키
   - Redeploy
5. `contracts/.env` 삭제

배포 전에도 리포트와 안전 콜은 바로 작동하고, 금고 탭에는 "곧 열림"이 표시됩니다.

## 알려진 한계

- 컨트랙트는 외부 감사를 받지 않았습니다. 처음엔 작은 한도로 시작하세요.
- 운영 키 하나가 모든 금고를 움직입니다. 피해는 금고별 한도·간격·슬리피지로 제한되고, 팀 전체 정지와 주인의 ARCIA 끄기로 막을 수 있습니다.
- 채점은 Dexscreener(없으면 스캐너 시장 데이터) 기준입니다. 시장 데이터가 48시간 없으면 무효 처리합니다.
