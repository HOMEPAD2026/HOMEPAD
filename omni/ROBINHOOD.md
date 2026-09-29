# ARCIRCLE OMNI 1단계 — 로빈후드 체인 먼저

Arc의 $ARCIRCLE(`0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7`)을 로빈후드 체인으로 연결하고, 로빈후드 체인에 유동성 풀을 만들어
Dexscreener에 뜨게 하는 순서입니다. 솔라나는 2단계에서 `OMNI_SOLANA=1`로 추가합니다.

- Arc: 기존 $ARCIRCLE은 그대로 둡니다. **ArcircleOFTAdapter**(잠금 컨트랙트)가 브릿지한 만큼을 잠급니다.
- 로빈후드 체인: **ArcircleOFT**(새 주소)가 잠긴 만큼만 발행하고, 돌아갈 때 소각합니다.
- 세 체인을 합친 총공급은 항상 1,000,000,000개입니다. `npx hardhat omni:supply`로 언제든 확인할 수 있습니다.

> 로빈후드 체인의 $ARCIRCLE은 **Arc와 다른 새 주소**입니다. 같은 주소는 기술적으로 만들 수 없습니다(README 참고).
> 배포가 끝나면 공식 주소 두 개(Arc, 로빈후드)를 사이트·ARCIA·공지에 함께 올립니다.

## 배포 결과 (2026-09-30)

| | 주소 |
|---|---|
| ArcircleOFTAdapter (Arc, 잠금 컨트랙트) | `0x075e5DC585efFe0bfdC1a0d452499Ce7AFe2faB6` |
| ArcircleOFT (로빈후드 체인의 $ARCIRCLE) | `0x6F9EBd0DFc6De9ed47EEc18EfeB69A9b97C71ee4` |
| 소유 Safe 2-of-3 (두 체인 같은 주소) | `0xA4101562b2C6fd5e422A0F78B2fE166dF84A48Fd` |

`omni:check` All checks passed · `omni:audit` Audit clean (handover 후). 다음: 7단계 소액 왕복 테스트 → 8단계 풀.

---

## 0. 결정 사항

| 항목 | 결정 | 상태 |
|---|---|---|
| 두 번째 DVN(메시지 검증자) | **Nethermind** — LayerZero Labs와 Nethermind가 모든 메시지를 둘 다 검증해야 통과 | 확정 |
| 소유 멀티시그 | **Safe 2-of-3**, Arc와 로빈후드 체인에 **같은 주소**로 생성 (아래 1단계) | 확정 · 생성 필요 |
| 일일 브릿지 한도 | 방향별 24시간 **10,000,000개**(총공급 1%). 안정되면 Safe로 올림 | 확정 |
| 잠금 컨트랙트의 Argus 보상 | **모아서 번 엔진으로**: Safe가 USDC 보상을 수집 → $ARCIRCLE 구매 → 소각 | 확정 |
| 풀 조건 | Uniswap v3 · ARCIRCLE/ETH · 수수료 1% · 전체 범위 (아래 8단계) | 제안 |
| 초기 유동성 | ARCIRCLE 수량 + ETH 수량 (팀 물량이 없으므로 Arc에서 구매해 브릿지) | 미정 |
| 외부 보안 검토 | 잠금 컨트랙트에 실제 자산이 쌓이므로 메인넷 전에 권장 | 미정 |

## 1. 준비물과 Safe 만들기

- **새 배포 지갑**(배포에만 쓰는 새 키). 노출된 `0x80e1…8bc7` 키는 절대 쓰지 않습니다.
  키는 본인만 `.env`에 입력하고, 채팅·이슈·커밋에 붙여 넣지 않습니다.
- 가스: Arc는 **USDC**, 로빈후드 체인은 **ETH**(두 컨트랙트 배포 + 설정 트랜잭션 몇 건).
- Node 20+, 이 폴더(`omni/`).

**Safe 2-of-3 만들기** (Safe{Wallet}은 Arc와 Robinhood Chain을 둘 다 지원합니다)

1. [app.safe.global](https://app.safe.global) → Create account.
2. 네트워크에서 **Arc**와 **Robinhood Chain**을 **둘 다** 선택합니다. 그래야 두 체인에 같은 주소로 만들어집니다.
3. 서명자 3명(서로 다른 지갑 3개. 가능하면 하드웨어 지갑 포함, 배포 지갑과는 다른 지갑), 기준 **2 of 3**.
4. 생성 후 두 체인 모두에 Safe가 활성화됐는지 확인하고, 그 주소를 `.env`의 `OMNI_OWNER`에 넣습니다.
   앱에서 두 체인을 함께 고를 수 없어 주소가 달라졌다면 `OMNI_OWNER_ARC`, `OMNI_OWNER_ROBINHOOD`에 각각 넣으면 됩니다.
5. 서명자 지갑 중 하나를 잃어도 나머지 둘로 운영할 수 있게, 서명자 3개는 서로 다른 곳에 보관합니다.

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

직접 채울 것은 두 개입니다: `PRIVATE_KEY`(새 배포 키), `OMNI_OWNER`(1단계의 Safe 주소).
`OMNI_SECOND_DVN=Nethermind`, `OMNI_DAILY_LIMIT=10000000`은 결정값으로 이미 들어 있습니다.
`OMNI_REWARDS_RECEIVER`는 비워 두면 Safe가 보상을 받습니다(번 엔진 정책). `OMNI_GUARDIAN`(일시정지만 가능한 지갑)은 선택입니다.
RPC 주소는 기본값이 들어 있습니다.

## 4. 배포 전 점검

```
npx hardhat omni:check
```

`layerzero.config.ts`에 고정한 LayerZero 주소(엔드포인트, 송수신 라이브러리, 실행자, DVN 2개: LayerZero Labs + Nethermind)가
각 체인에 실제로 있는지, `OMNI_OWNER` Safe가 두 체인에 있고 서명 기준이 2 이상인지 확인합니다. 전부 `ok`여야 다음으로 갑니다.

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

일일 한도(10,000,000개), 가디언, 보상 수령 주소(기본값 Safe)를 설정하고 **소유권과 LayerZero 권한(delegate)을 Safe로** 넘깁니다.
그다음 `npx hardhat omni:check`와 `npx hardhat omni:audit`을 돌려 둘 다 깨끗한지 봅니다(감사: 모든 LayerZero 체인에 대해 peer·권한·훅 확인).
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
- 두 컨트랙트 소유자 = Safe 2-of-3 (`omni:check`)
- 공개할 정책: DVN 2개(LayerZero Labs + Nethermind), 일일 한도 10,000,000개, 잠금 보상 → $ARCIRCLE 소각
- 공식 주소: Arc `0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7` · Robinhood `<ArcircleOFT 주소>`

## 잠금 보상 → 소각 (정기 운영)

잠금 컨트랙트에 쌓인 Arc 홀더 보상(USDC)을 Safe가 모아 $ARCIRCLE을 사서 소각합니다.

1. **클레임 함수 확인(처음 한 번)**: 본인 지갑으로 Argus에서 보상을 한 번 받은 뒤, ArcScan에서 그 트랜잭션의
   Input data(함수 이름과 인자)를 확인해 저에게 알려주세요. 그걸로 Safe에 넣을 `collectRewards` 데이터를 만들어 드립니다.
2. Safe → 잠금 컨트랙트 `collectRewards(Argus hook, 클레임 데이터)` → `sweep(USDC)` (보상이 Safe로 들어옴).
3. Safe로 Argus에서 $ARCIRCLE 구매 → `0x000000000000000000000000000000000000dEaD`로 전송.
4. Safe 주소를 알려주시면 사이트 번 엔진에 이 소각들을 **OMNI**로 따로 표시합니다.
   자동 소각 컨트랙트가 나오면 `setRewardsReceiver`로 받는 곳만 바꾸면 됩니다(재배포 없음).

## 문제가 생기면

- **노출된 키로 배포한 경우**(owner가 `0x80e1…8bc7`): 둘 중 하나를 고릅니다.
  - **그대로 쓰기(선택함)**: 가능한 한 빨리 소유권을 Safe로 넘기고, 넘긴 뒤 감사로 깨끗한지 확인합니다.
    1. `.env`에 `OMNI_ALLOW_EXPOSED_KEY=1`을 **잠시** 추가합니다(노출 키는 이 줄이 없으면 거부됩니다).
    2. `npx hardhat run scripts/handover.ts --network arc` → `--network robinhood`.
       handover는 먼저 소유자가 아직 배포 지갑인지 확인하고(아니면 STOP), 모든 LayerZero 체인에서 예상 밖 peer,
       message inspector, pre-crime, 모르는 guardian을 지운 뒤 한도·보상 주소를 걸고 Safe로 넘깁니다.
    3. `.env`에서 `OMNI_ALLOW_EXPOSED_KEY=1` 줄을 지웁니다. 노출 키는 다시 쓰지 않습니다.
    4. `npx hardhat omni:check`와 `npx hardhat omni:audit`. 감사는 192개 LayerZero 체인 전부의 peer, 소유자·delegate,
       수신 라이브러리 유예, 훅, guardian, 한도, 보상 주소를 확인합니다. **ALERT가 하나라도 있으면 브릿지하지 않습니다.**
  - **새로 배포하기**: 새 지갑으로 `PRIVATE_KEY`를 바꾸고 `mv deployments deployments-exposed` 후 5단계를 처음부터.
- `omni:supply`가 `ALERT`(원격 공급 > 잠긴 양): 가디언이나 소유자가 **양쪽 모두 pause**. 멀티시그만 해제할 수 있습니다.
- 전송이 LayerZero Scan에서 멈춤: DVN 설정이 한쪽만 바뀐 경우가 대부분입니다. `omni:check`의 MISMATCH를 보고 멀티시그로 설정을 맞춥니다.
