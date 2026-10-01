# ARCIA DESK · Robinhood Chain

ARCIA DESK의 두 번째 데스크입니다. 같은 브레인(플레이북, 학습, 리스크 규칙)으로 Robinhood Chain에서 새로 런칭되는 코인을 거래합니다.

- 2026-10-01부터 런치패드 제한이 없습니다. Dexscreener에 올라오는 새 페어와 같은 범위입니다.
  - Uniswap v4: ETH 또는 WETH 페어 (pools.trade, Bags 등). 훅이 없는 풀, 또는 owner가 허용한 훅의 풀만 거래합니다.
  - Uniswap v3: WETH 페어 (pons 등).
- 체인에서 새 풀이 열리는 것(v4 PoolManager `Initialize`, v3 팩토리 `PoolCreated`)을 직접 읽습니다. Dexscreener의 최신 프로필·부스트 목록도 함께 봅니다.
- 매수 전에 "샀다가 바로 되팔기" 모의 거래를 돌립니다. 세금이 붙거나 되팔 수 없는 토큰은 여기서 걸러집니다.
- 자금은 `ArciaDeskRH2` 컨트랙트에 WETH로 보관됩니다.
- 수익률과 하루 결과는 ETH 기준으로 계산하므로, ETH 자체 가격 변동은 손익으로 치지 않습니다.
- 이 데스크에는 $ARCIRCLE 소각이 없습니다.
- 첫 컨트랙트 `ArciaDeskRH`는 pons 토큰만 거래하도록 온체인에서 막혀 있습니다. 그래서 새 컨트랙트가 필요합니다. 엔진은 v2 컨트랙트에서만 실거래하고, 그 전에는 페이퍼로만 돌아갑니다.

## 컨트랙트 규칙 (ArciaDeskRH2)

- 매매는 operator(서버 키)만 할 수 있습니다. 출금은 owner만 하며, 항상 owner에게 갑니다.
- 1회 매수 한도와 하루 매수 한도(ETH)가 있습니다. v3와 v4 매수가 같은 하루 한도를 씁니다.
- v4 매수는 요청한 금액보다 ETH를 더 쓸 수 없습니다. 훅이 비용을 올려도 마찬가지입니다.
- `paused`는 새 매수만 멈추고, 매도는 계속 됩니다.
- ETH를 컨트랙트로 보내면 WETH로 바뀝니다. 이것이 입금 방법입니다.
- owner는 `setHook`으로 v4 훅을 허용하거나 막을 수 있습니다. 기본값은 Bags 훅입니다.

## 교체 순서 (Codespace, `contracts/`)

1. 지금 데스크 페이지의 오너 패널에서, 첫 데스크(ArciaDeskRH)에 남은 ETH를 Withdraw로 출금합니다.
2. `contracts/.env`에 아래 값이 있는지 확인합니다. 지난번과 같은 값을 쓰면 됩니다.
   - `DEPLOYER_PRIVATE_KEY`: Robinhood Chain 가스 ETH가 조금 있는 지갑
   - `DESK_OWNER`: 본인 메인 지갑 주소
   - `DESK_OPERATOR`: 트레이더 지갑 주소 (Vercel `ARCIA_DESK_RH_KEY`의 지갑)
   - 선택: `DESK_MAX_TRADE_ETH` (기본 0.004), `DESK_DAILY_CAP_ETH` (기본 0.04)
3. `npx hardhat run scripts/deploy-arcia-desk-rh2.js --network robinhoodMainnet` 을 실행합니다.
4. 트레이딩 ETH를 출력된 **새 데스크 주소**로 보냅니다.
5. Vercel의 `ARCIA_DESK_RH_ADDRESS`를 새 데스크 주소로 바꾸고 Redeploy 합니다. 키와 크론은 그대로 둡니다.
6. `contracts/.env`를 삭제합니다.

## 운영

- 페이지: arcircle.app/arc#desk?chain=rh 에서 상단 스위치로 Arc와 Robinhood를 전환합니다.
- 입금, 출금, 일시정지, 한도 변경: 페이지 오너 패널의 버튼으로 합니다(owner 지갑으로 로그인).
- 사이징 설정: 오너 패널에서 서명합니다. 가스는 들지 않습니다.
- 컨트랙트가 설정·입금되기 전에는 페이퍼로만 돌아갑니다.
