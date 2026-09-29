# CirclePad Round #2 — 거버넌스 켜기

Round #2 에스크로: `0xb87c5aa6c6ced8afb4ab6785ab419718f296c8c3` (2026-09-30 시작, 2026-10-02 12:13 UTC = 21:13 KST 마감)

규칙은 Round #1과 같습니다.
- 커뮤니티 아이디어 → 라운드 지갑이 후보 확정 → $ARCIRCLE 소각 투표(1표 = 1,000 $ARCIRCLE), 모금 마감까지
- 마감 시 80% 수령인 / 15% 트레저리 / 5% 플랫폼, 최다 기여자에게 15%를 3일에 걸쳐 지급
- 기여자 에어드랍: 미정

## 1. 배포 (Codespace)

`contracts/.env`에 **새 배포용 지갑**의 `DEPLOYER_PRIVATE_KEY`를 직접 넣습니다(가스용 Arc USDC 조금).
노출된 `0x80e1…8bc7` 키는 설정 단계에서 거부됩니다. 배포 지갑은 컨트랙트에 아무 권한도 갖지 않습니다.

```
cd /workspaces/HOMEPAD/contracts
BIGPAD_ESCROW_ADDRESS=0xb87c5aa6c6ced8afb4ab6785ab419718f296c8c3 npx hardhat run scripts/deploy-bigpad-vote.js --network arcMainnet
```
→ 출력된 **BigPadVote 주소**를 적어 둡니다.

```
CIRCLEPAD_VOTE_ADDRESS=<위 BigPadVote 주소> npx hardhat run scripts/deploy-arcircle-burn-vote.js --network arcMainnet
```
→ 출력된 **ArcircleBurnVote 주소와 블록 번호**를 적어 둡니다. 투표는 이 순간부터 모금 마감까지 열립니다.

끝나면 `contracts/.env`에서 키를 지웁니다.

## 2. 사이트 연결

두 주소와 블록 번호를 Claude에게 보내면 `api/_burnvote.mjs`의 `GOV[2]`와 `config-arc.js`의 `CIRCLEPAD_GOV[2]`에 넣어
Round #2 아이디어 보드와 소각 투표가 열립니다.

## 3. 후보 올리기 (라운드 지갑 0x1A35…672E)

/circle → Governance에서 아이디어를 모은 뒤 "Fill every category from the ideas" → 카테고리마다 서명해 게시합니다.
후보가 게시된 카테고리부터 투표할 수 있습니다. 마감(10/2 21:13 KST) 전에 모두 게시하세요.
