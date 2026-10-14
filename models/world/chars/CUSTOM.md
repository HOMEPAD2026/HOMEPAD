# 커스텀 캐릭터 추가하기 (Tripo3D) · Adding a custom character

## 한국어

1. **Tripo3D에서 내보내기**: 캐릭터 생성 → Auto Rig(휴머노이드/biped) → 애니메이션 추가(Idle, Walk, Run, Jump, Attack, Hit, Death, Wave, Dance 등) → **GLB**로 내보내기.
   - 리깅 + 애니메이션 포함으로 내보낼 것 (리그가 없으면 걷지 못하고 서 있기만 함)
   - 면 수: 저폴리 / Face Limit **약 10k–20k**
   - 텍스처: **1K–2K**
2. **최적화**: (최초 1회) `npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer`
   ```
   node tools/optimize-char.mjs tripo.glb models/world/chars/character-custom-robot.glb --faces 20000 --tex 1024
   ```
   전/후 용량, 삼각형 수, 텍스처 크기, 클립 이름이 출력됩니다. 결과는 2 MB 이하가 목표입니다(넘으면 `--tex 512`나 더 적은 `--faces`).
3. **등록**: `world-kit.js`의 `CUSTOM_CHARS`에 id 추가: `export const CUSTOM_CHARS = ["custom-robot"];`
   - id는 `custom-` + 영소문자/숫자/`-` **최대 9자** (저장 데이터가 16자까지만 보관, 서버 `api/_world.mjs`도 이 형식만 허용)
4. **썸네일**: `models/world/chars/custom-robot.webp` (256×256, 정면 상반신 캡처). 캐릭터 선택 화면이 3D 초상화를 그리기 전까지 이 이미지를 보여 줍니다(없으면 그동안 깨진 이미지).
5. **배포**: `sh bump-cache.sh` (`/w/` 번들 재빌드 + 캐시 버전 갱신) 후 커밋.

애니메이션 이름은 자동으로 연결됩니다(대소문자 무시, 키워드): idle/stand → 대기, walk → 걷기, run/sprint → 달리기, jump, fall, die/death, hit/damage, attack/slash/punch → 공격, cast/spell → 마법, wave/greet → 인사, dance/cheer/victory → 축하. 없는 반복 동작은 대기로, 없는 1회 동작은 생략됩니다. 루트 모션(엉덩이 이동)은 제거됩니다. "mixamo.com" 같은 의미 없는 이름은 인식되지 않으니 Tripo에서 이름을 지정해 내보내세요.

## English

1. **Export from Tripo3D**: generate → Auto Rig (humanoid / biped) → add animations (Idle, Walk, Run, Jump, Attack, Hit, Death, Wave, Dance …) → export **GLB** with the rig and the animations. Low-poly / face limit **~10k–20k**, texture **1K–2K**.
2. **Optimize** (deps once: `npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer`):
   `node tools/optimize-char.mjs tripo.glb models/world/chars/character-custom-robot.glb [--faces 20000] [--tex 1024]`
   It prints size, triangles, textures and clip names before and after. Aim for under 2 MB.
3. **Register** the id in `CUSTOM_CHARS` in `world-kit.js`. Ids are `custom-` plus at most 9 of `a-z 0-9 -` (the save keeps 16 characters; `api/_world.mjs` and `api/_world-social.mjs` accept exactly this shape).
4. **Thumbnail**: `models/world/chars/<id>.webp`, 256×256 (the picker shows it until its 3D portrait is drawn; without it, a broken image until then).
5. **Ship**: `sh bump-cache.sh` (rebuilds `/w/`, bumps the asset version), then commit.

Clips are matched to the game's names by keyword, case-insensitive (`Armature|` prefixes ignored). A looping move with no clip runs the idle, a one-shot with no clip is skipped, and a file with no clips stands still. Root motion on the hips / armature is removed (the bob is kept). Weapons and shields go on the hand bones found by name (`RightHand`, `hand_r`, `mixamorigRightHand`, …); helmets and armour are not drawn on custom characters, like the KayKit heroes.
