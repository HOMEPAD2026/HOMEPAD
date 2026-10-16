# 영웅 캐릭터 (ARON · LUMI · NEX) · Hero characters

ARCIRCLE World의 대표 캐릭터. 모든 플레이어(나와 다른 플레이어)는 영웅으로 그려지고, 캐릭터 만들기에는 영웅만 나옵니다.
저장 데이터는 고른 캐릭터를 그대로 보관하고, 화면에서만 영웅으로 바뀝니다(`world-kit.js` `heroOf`).

## 새 영웅 추가 (예: LUMI)

1. **Meshy에서 내보내기**: 리깅 + 애니메이션(Idle, Walking, Running, Jump_Run …)을 **한 GLB**에 담아 내보냅니다.
   Meshy는 애니메이션마다 모델·텍스처를 통째로 다시 넣으므로, 모든 동작이 들어 있는 파일 하나만 쓰면 됩니다.
2. **압축** (최초 1회 `npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp`):
   ```
   node tools/pack-hero.mjs lumi_all.glb models/world/chars/character-custom-lumi.glb Idle_03,Walking,Running,Jump_Run
   ```
   마지막 인자는 남길 클립 이름입니다(Meshy가 붙인 이름). 텍스처는 webp(색·노멀 1024, 금속/거칠기 512), 메시는 meshopt +
   양자화. ARON: 23.4 MB → 1.2 MB. 목표는 2 MB 이하.
3. **등록**: `world-kit.js` `HEROES`에 한 줄: `"custom-lumi": { name: "LUMI", glow: 1.4 }`.
   id는 `custom-` + 영소문자/숫자 최대 9자 (서버 `api/_world.mjs` `CUSTOM_CHAR`가 이 형식만 저장).
   `glow`: 얼굴의 밝은 시안 부분(눈·화면)이 빛나는 세기. 0이면 발광 없음.
4. **썸네일**: `models/world/chars/custom-lumi.webp` (256×256). 3D 초상화를 그리기 전까지 캐릭터 만들기에 보입니다.
5. `sh bump-cache.sh`, `node tools/build-bundles.mjs --force`, `node tools/build-world.mjs` 후 커밋.

애니메이션 연결(자동, `world-kit.js` `CU_AS`): idle → 대기, walk → 걷기, run/sprint → 달리기, jump → 점프(낙하 클립이 없으면
점프가 이어짐). attack/hit/die/wave/dance 클립이 있으면 공격·피격·쓰러짐·인사·축하에도 쓰입니다(없으면 생략).

## 롤백

`world-kit.js` `HERO_ONLY`를 `false`로 하면 예전 캐릭터(ARC Bot, 모험가, 클래식)가 저장된 그대로 돌아옵니다.
배포 전에 `?roster=classic`로 미리 볼 수 있습니다. 예전 모델 파일은 지우지 않았습니다.
