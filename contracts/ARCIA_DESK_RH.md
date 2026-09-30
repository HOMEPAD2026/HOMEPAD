# ARCIA DESK · Robinhood Chain (pons)

ARCIA DESK의 두 번째 데스크입니다. 같은 브레인(플레이북, 학습, 리스크 규칙)으로 pons(ponsfamily.com)에서 런칭된 새 코인을 거래합니다.

- pons 런칭은 WETH 페어 Uniswap v3 풀(수수료 1%)로 바로 시작합니다. 본딩커브와 마이그레이션은 없습니다.
- 자금은 `ArciaDeskRH` 컨트랙트에 WETH로 보관됩니다.
- 수익률과 하루 결과는 ETH 기준으로 계산하므로, ETH 자체 가격 변동은 손익으로 치지 않습니다.
- 이 데스크에는 $ARCIRCLE 소각이 없습니다.

## 컨트랙트 규칙

- 매매는 operator(서버 키)만 할 수 있고, 출금은 owner만 하며 항상 owner에게 갑니다.
- 1회 매수 한도와 하루 매수 한도(ETH)가 있습니다.
- 거래 대상은 v3 팩토리의 정식 WETH 풀이면서 pons 팩토리(현재 + 레거시)가 런칭한 토큰뿐입니다.
- `paused`는 새 매수만 멈추고, 매도는 계속 됩니다.
- ETH를 컨트랙트로 보내면 WETH로 바뀝니다. 이것이 입금 방법입니다.

## 배포 (Codespace, `contracts/`)

1. `contracts/.env`에 아래 값을 넣습니다.
   - `DEPLOYER_PRIVATE_KEY`: Robinhood Chain에 배포 가스 ETH가 조금 있는 지갑. 역할은 없습니다.
   - `DESK_OWNER`: 본인 메인 지갑 주소
   - `DESK_OPERATOR`: Arc 데스크 트레이더 지갑 주소. Vercel의 `ARCIA_DESK_KEY`가 그대로 쓰입니다.
   - 선택: `DESK_MAX_TRADE_ETH` (기본 0.004), `DESK_DAILY_CAP_ETH` (기본 0.04)
2. `npx hardhat run scripts/deploy-arcia-desk-rh.js --network robinhoodMainnet` 을 실행합니다. Blockscout 검증까지 자동으로 합니다.
3. 트레이딩 ETH는 출력된 **데스크 주소**로 보냅니다.
4. 트레이더 지갑에는 Robinhood Chain 가스로 약 0.002 ETH를 보냅니다.
5. Vercel에 `ARCIA_DESK_RH_ADDRESS` = 데스크 주소를 넣고 Redeploy 합니다.
   - 트레이더 키를 따로 쓰려면 `ARCIA_DESK_RH_KEY`를 Sensitive로 넣습니다. 없으면 `ARCIA_DESK_KEY`가 쓰입니다.
6. cron-job.org에 1분마다 실행되는 항목을 추가합니다: `https://www.arcircle.app/api/desk?chain=rh&tick=1&key=<CRON_SECRET>`
7. `contracts/.env`를 삭제합니다.

## 운영

- 페이지: arcircle.app/arc#desk?chain=rh 에서 상단 스위치로 Arc와 Robinhood를 전환합니다.
- 출금, 일시정지, 한도 변경: Blockscout의 컨트랙트 Write 탭에서 owner 지갑으로 `withdrawETH`, `setPaused`, `setCaps`를 실행합니다. 한도 단위는 wei입니다.
- 사이징 설정: 페이지의 오너 패널에서 서명합니다. 가스는 들지 않습니다.
- 컨트랙트가 설정·입금되기 전에는 페이퍼로만 돌아갑니다.
