# ARCIRCLE OMNI 1단계 — 로빈후드 체인 먼저

Arc의 $ARCIRCLE(`0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7`)을 로빈후드 체인으로 연결하고, 로빈후드 체인에 유동성 풀을 만들어
Dexscreener에 뜨게 하는 순서입니다. 솔라나는 2단계에서 `OMNI_SOLANA=1`로 추가합니다.

- Arc: 기존 $ARCIRCLE은 그대로 둡니다. **ArcircleOFTAdapter**(잠금 컨트랙트)가 브릿지한 만큼을 잠급니다.
- 로빈후드 체인: **ArcircleOFT**(새 주소)가 잠긴 만큼만 발행하고, 돌아갈 때 소각합니다.
- 세 체인을 합친 총공급은 항상 1,000,000,000개입니다. `npx hardhat omni:supply`로 언제든 확인할 수 있습니다.

> 로빈후드 체인의 $ARCIRCLE은 **Arc와 다른 새 주소**입니다. 같은 주소는 기술적으로 만들 수 없습니다(README 참고).
> 배포가 끝나면 공식 주소 두 개(Arc, 로빈후드)를 사이트·ARCIA·공지에 함께 올립니다.

---

## 0. 먼저 정할 것

| 항목 | 선택지 / 제안 | 상태 |
|---|---|---|
| 두 번째 DVN(메시지 검증자) | Nethermind · Horizen · Canary · P2P · Nansen 중 하나 (Arc와 로빈후드 양쪽에서 운영 중인 곳만) | 미정 |
| 소유 멀티시그 | Arc와 로빈후드 체인 각각의 Safe(또는 다른 멀티시그) 주소 | 미정 · Safe가 두 체인에 배포돼 있는지 확인 필요 |
| 일일 브릿지 한도 | 방향별 24시간 한도. 제안: 처음엔 작게(예: 10,000,000개), 안정되면 올리기 | 미정 |
| 잠금 컨트랙트의 Argus 보상 | ① Argus에 제외 요청 ② 모아서 바이백 등에 사용 (README "Argus rewards") | 미정 |
| 풀 조건 | Uniswap v3 · ARCIRCLE/WETH · 수수료 1% · 전체 범위 (아래 6단계) | 제안 |
| 초기 유동성 | ARCIRCLE 수량 + ETH 수량 (팀 물량이 없으므로 Arc에서 구매해 브릿지) | 미정 |
| 외부 보안 검토 | 잠금 컨트랙트에 실제 자산이 쌓이므로 메인넷 전에 권장 | 미정 |

## 1. 준비물

- **새 배포 지갑**(배포에만 쓰는 새 키). 노출된 `0x80e1…8bc7` 키는 절대 쓰지 않습니다.
  키는 본인만 `.env`에 입력하고, 채팅·이슈·커밋에 붙여 넣지 않습니다.
- 가스: Arc는 **USDC**, 로빈후드 체인은 **ETH**(두 컨트랙트 배포 + 설정 트랜잭션 몇 건).
- Node 20+, 이 폴더(`omni/`).

## 2. 설치와 테스트

```
cd /workspaces/HOMEPAD/omni
npm install --legacy-peer-deps
npx hardhat test
```

`10 passing`이 나와야 합니다. 잠금·발행 1:1, 총공급 불변, 일일 한도, 일시정지, 보상 수집이 잠긴 토큰을 못 건드리는 것까지 확인합니다.

## 3. `.env` 채우기 (직접)

```
cp .env.example .env
```

`PRIVATE_KEY`(새 배포 키), `OMNI_OWNER`(멀티시그), `OMNI_SECOND_DVN`(0단계에서 고른 이름), `OMNI_DAILY_LIMIT`,
필요하면 `OMNI_GUARDIAN`, `OMNI_REWARDS_RECEIVER`를 채웁니다. RPC 주소는 기본값이 들어 있습니다.

## 4. 배포 전 점검

```
npx hardhat omni:check
```

`layerzero.config.ts`에 고정한 LayerZero 주소(엔드포인트, 송수신 라이브러리, 실행자, DVN 2개)가 각 체인에 실제로 있는지 확인합니다.
전부 `ok`여야 다음으로 갑니다.

> 왜 주소를 고정했나: Arc에는 "LayerZero Labs" DVN이 두 개 등록돼 있고, 옛 주소(`0x282b…46b4`)는 **폐기(deprecated)** 상태입니다.
> 이름으로 찾으면 옛 주소가 잡힐 수 있어서, 살아 있는 주소를 체인별로 적어 두었습니다.
> 배선 전에 [LayerZero 문서의 Arc](https://docs.layerzero.network/v2/deployments/chains/arc) /
> [Robinhood](https://docs.layerzero.network/v2/deployments/chains/robinhood) 페이지 DVN 목록과 한 번 더 눈으로 대조해 주세요.

## 5. 배포 → 연결 → 소유권 이전

```
npm run deploy:arc
npm run deploy:robinhood
npx hardhat lz:oapp:wire --oapp-config layerzero.config.ts
npx hardhat omni:check
```

두 번째 `omni:check`는 양쪽 peer, DVN 2개, 확인 블록 수(Arc 5 · 로빈후드 20), 실행자가 설정대로 들어갔는지 읽어서 확인합니다. `MISMATCH`가 하나라도 있으면 멈춥니다.

```
npx hardhat run scripts/handover.ts --network arc
npx hardhat run scripts/handover.ts --network robinhood
```

일일 한도, 가디언, 보상 수령 주소를 설정하고 **소유권과 LayerZero 권한(delegate)을 멀티시그로** 넘깁니다.
한도가 없는 방향으로는 아무것도 보낼 수 없습니다. 솔라나는 2단계 전까지 한도를 주지 않아 막혀 있습니다.

## 6. 사이트 연결 (저에게 주소 전달)

배포 결과로 나온 **ArcircleOFTAdapter(Arc)** 와 **ArcircleOFT(로빈후드)** 주소를 알려주시면,
`config-arc.js`의 `CONFIG.OMNI`와 `api/_omni.mjs`에 넣어 OMNI 페이지(arcircle.app/arc#omni)의 로빈후드 부분을 **Live**로 바꿉니다.
그러면 페이지에서 바로 브릿지(견적 → 승인 → 전송)를 할 수 있고, 총공급 검증과 체인별 가격이 표시됩니다.

## 7. 소액 왕복 테스트

1. OMNI 페이지에서 **1 ARCIRCLE**을 Arc → 로빈후드로 보냅니다. [LayerZero Scan](https://layerzeroscan.com)에서 Delivered를 확인합니다.
2. `npx hardhat omni:supply` → `OK — every remote token is backed 1:1`.
3. 로빈후드 → Arc로 되돌려 보내고 다시 `omni:supply`.

## 8. 로빈후드 체인 풀 만들기 → Dexscreener

1. Arc에서 풀에 넣을 $ARCIRCLE을 준비해 OMNI 페이지로 로빈후드에 브릿지합니다(일일 한도 안에서).
2. 로빈후드 체인 지갑에 짝이 될 **ETH**를 준비합니다.
3. [Uniswap 앱](https://app.uniswap.org) → 네트워크 **Robinhood Chain** → Pool → New position
   - 토큰: **ARCIRCLE**(로빈후드 OFT 주소 붙여넣기) + **ETH**
   - 버전·수수료: **v3, 1%** (밈코인 표준. v4도 가능)
   - 범위: **Full range**
   - **시작 가격 = Arc 가격 기준**: `1 ARCIRCLE = (Arc의 $ARCIRCLE USD 가격) ÷ (ETH USD 가격)` ETH.
     가격이 어긋나면 첫 거래자가 차익을 가져갑니다.
4. 유동성을 넣고 확인합니다.
5. **Dexscreener**: 풀에 첫 거래가 생기면 자동으로 올라옵니다(`dexscreener.com/robinhood/<풀 주소>`).
   로고·링크·설명은 Dexscreener의 토큰 정보 업데이트(유료)로 넣습니다. Arc 페어와 같은 로고와 링크를 쓰세요.

Uniswap이 로빈후드 체인(4663)에 올린 주소 (`@uniswap/sdk-core` 7.19.4 기준, 앱에서 대조용):

| 컨트랙트 | 주소 |
|---|---|
| v3 Factory | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` |
| v3 NonfungiblePositionManager | `0x73991a25c818bf1f1128deaab1492d45638de0d3` |
| SwapRouter02 | `0xcaf681a66d020601342297493863e78c959e5cb2` |
| v4 PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` |
| v4 PositionManager | `0x58daec3116aae6d93017baaea7749052e8a04fa7` |
| WETH9 | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

## 9. 공지 전 마지막 확인

- `omni:check` 전부 ok, `omni:supply` OK
- 두 컨트랙트 소유자 = 멀티시그 (`omni:check` 마지막 줄)
- 보상 정책 공개, 일일 한도 공개
- 공식 주소: Arc `0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7` · Robinhood `<ArcircleOFT 주소>`

## 문제가 생기면

- `omni:supply`가 `ALERT`(원격 공급 > 잠긴 양): 가디언이나 소유자가 **양쪽 모두 pause**. 멀티시그만 해제할 수 있습니다.
- 전송이 LayerZero Scan에서 멈춤: DVN 설정이 한쪽만 바뀐 경우가 대부분입니다. `omni:check`의 MISMATCH를 보고 멀티시그로 설정을 맞춥니다.
