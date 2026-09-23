# ArcScan 소스 검증 가이드 (Arc mainnet)

이 스크립트는 ARCIRCLE PAD 컨트랙트(팩토리, 훅, 라우터, CirclePad 에스크로)와 ArcPad에서 런치된 **모든 코인(LaunchToken)** 의 소스를
ArcScan(arc.etherscan.io)에 검증합니다. 검증이 끝나면 ArcScan의 Contract 탭에 소스 코드와 "Read/Write Contract"가 표시됩니다.
그러면 누구나 "민트 함수 없음"과 "유동성 회수 함수 없음"을 직접 확인할 수 있습니다.

- 개인키는 **필요 없습니다.** 생성자 인자는 모두 체인에 배포된 컨트랙트에서 읽어옵니다.
- 필요한 것은 무료 Etherscan API 키 1개뿐입니다. https://etherscan.io/myapikey 에서 로그인한 뒤 *Add*를 누르면 됩니다.
  Etherscan v2 API는 키 하나로 Arc를 포함한 모든 체인에서 쓸 수 있습니다.

## GitHub Codespace에서 실행

```bash
cd contracts
npm ci                     # 처음 한 번
npx hardhat compile        # artifacts/build-info 생성 (배포 때와 같은 설정)

# 1) 먼저 확인만 (아무것도 제출하지 않음)
ARC_ETHERSCAN_API_KEY=여기에키 node scripts/verify-arc.js --dry-run

# 2) 실제 검증
ARC_ETHERSCAN_API_KEY=여기에키 node scripts/verify-arc.js
```

일부만 검증하려면 `--only=` 뒤에 `factory,hook,router,escrow,tokens` 중 원하는 항목만 쉼표로 적으세요.

## 결과 읽는 법

| 표시 | 뜻 |
|---|---|
| `✓ Pass - Verified` | 검증 완료. 출력된 링크의 `#code` 탭에서 확인할 수 있습니다 |
| `✓ already verified` | 이미 검증돼 있어서 건너뛰었습니다 |
| `✗ metadata hash differs…` | 이 저장소의 소스나 컴파일 설정이 배포된 것과 다릅니다. 제출하지 않고 건너뛰었습니다 |
| `✗ submit failed: …` | API 키 오류나 요청 한도 초과 등입니다. 출력된 메시지를 그대로 확인하세요 |
| `… still pending` | ArcScan 대기열에 있습니다. 몇 분 뒤 링크에서 확인하거나 다시 실행하세요 |

- 새 코인이 런치될 때마다 다시 실행하면 새 코인만 추가로 검증됩니다. 이미 검증된 것은 건너뜁니다.
- API 키는 명령어 앞에 붙여 그 한 번만 쓰세요. `.env`에 넣으려면 깃에 올라가지 않는 `contracts/.env`에만 넣으세요.
- 다른 RPC로 읽으려면 `ARC_MAINNET_RPC=https://rpc.blockdaemon.mainnet.arc.io`처럼 지정하세요.
