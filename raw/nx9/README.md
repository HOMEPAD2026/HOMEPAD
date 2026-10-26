# raw/nx9 — ARCIRCLE STUDIO BETA phases 1–3 (Meshy raw files)

Cost per call: text-to-image 3, image-to-3D 30, rigging 5, animation 3 (measured on this account).

## A. gate/ — landscape gate (5 images, 15 credits)
| file | size | what |
|---|---|---|
| gate-tall.png | 768×1344 | ARON (halo) turning a glowing phone from upright to sideways, with a cyan arc; dusk Creator City behind (lightbulb building, ring portal, wrench/brush tower); calm sky in the top third and soft haze in the bottom third |
| gate-wide.png | 1344×768 | ARON holding the phone sideways like a controller, sparkles, the same landmarks |
| rotate-icon.png | 512² | glass phone with a cyan quarter-turn arrow, on lime green (key by hue; Meshy doesn't give pure #00ff00) |
Both gate pictures were redone once: the first tall one had "SCHOOL" written on a building, and in the first wide one
the phone was still upright.

## C. jump/ — JUMP WORLD
### Textures (512², seamless, each tiled 2×2 and checked) and the sky
| file | what |
|---|---|
| jw-grass.png | flat bright cartoon grass with tiny flowers. Redone: twice a framed tile; the second was cropped inside its frame and the edges blended, so it is fairly plain |
| jw-dirt.png | wavy layered brown dirt with pebbles and roots (redone: first was a framed tile; edges blended) |
| jw-stone.png | grey castle bricks, running bond |
| jw-lava.png | bright molten orange with dark crust (edges blended for a faint seam) |
| jw-ice.png | pale blue ice tiles |
| jw-wood.png | horizontal planks with nails (redone: first was a framed tile) |
| jw-metal.png | grey riveted plates with cyan stripes (redone: first was a framed tile) |
| jw-candy.png | pastel pink, mint and lemon candy tiles with sprinkles |
| jw-sky.png | 1344×768: blue sky, floating grassy islands with waterfalls, a cloud bank at the bottom |
Generated at 1024 and downscaled to 512 (Lanczos).

### Models (image-to-3D from `concept/<name>.png`, facing +Z, maps downscaled to 512)
| file | tris | KB | what |
|---|---|---|---|
| spring.glb | 1,536 | 512 | red/white pad on a coiled spring |
| spike-trap.glb | 1,555 | | stone block with metal spikes |
| checkpoint.glb | 2,061 | | white pole, blank cyan flag, glowing base |
| key.glb | 1,038 | | gold key |
| door.glb | 2,471 | | wooden door with iron bands and a padlock in a stone arch |
| switch.glb | 1,038 | | big red push button in a metal ring |
| chest.glb | 1,557 | | wooden chest with gold trim and a cyan gem |
| potion.glb | 1,040 | | round red potion with a heart and a cork |
| finish-portal.glb | 3,099 | 526 | gold and white ring with a cyan swirl |
| enemy-walker.glb | 2,590 | | angry red mushroom on two legs |
| enemy-flyer.glb | 2,082 | | bat-winged drone with a red eye |
| boss-dragon.glb | 5,198 | 597 | chunky green dragon standing on two legs |
| coin.glb | 832 | | gold coin with an embossed infinity mark |
| cannon.glb | 2,047 | | black cannon with cyan bands on a wooden block |
All of them are under 600 KB. Sizes are Meshy's normalised ~1.9 m on the longest side; scale them in the game.
**Rigs (Meshy rigging worked for both):**
| file | tris | KB | clip |
|---|---|---|---|
| enemy-walker-rigged.glb | 2,590 | 562 | bind pose (0.8 m tall) |
| enemy-walker-walk.glb | 288 (proxy) | 88 | walking_man 1.1 s (animation-only armature file) |
| boss-dragon-rigged.glb | 5,198 | 925 | bind pose (3 m tall) |
| boss-dragon-walk.glb | 288 (proxy) | 88 | walking_man 1.1 s |
| boss-dragon-idle.glb | 5,198 | 983 | Idle 4.0 s (full skinned model) |
| boss-dragon-attack.glb | 5,198 | 952 | Attack 2.8 s (full skinned model) |
Credits for C so far: 23 images + 4 redos (81), 14 image-to-3D (420), 2 rigs (10), 2 animations (6) = 517.

## D. templates/ — Studio template card art, 1024×576 (made at 1344×768 and resized)
ARON with a halo in each scene; no text.
| file | what |
|---|---|
| tpl-jump.png | leaping between floating grass-block islands, coins, a small green dragon on a far island |
| tpl-survival.png | in a ring of cute monsters with cyan blades and orbs orbiting, rune floor |
| tpl-racing.png | on a hoverboard along a neon track through cyan boost rings, city behind |
| tpl-mining.png | swinging a pickaxe at glowing blue crystals in a cave, sparks |
| tpl-rhythm.png | stomping on glowing beat tiles with music notes and light beams |
| tpl-dungeon.png | torch-lit stone corridor with chests of gold and cute skeletons |
| tpl-escape.png | puzzle room with padlocked doors, glowing floor switches and a golden key. Redone (letterbox bars); the redo had side bars, so it was cropped to the picture and resized |
| tpl-boss.png | facing a giant dark horned boss on a glowing rune arena |
Credits for D: 10 images = 30.

## C 30. jump/icons/ — 24 editor icons, 256², on lime green (key by hue)
icon-grass, -stone, -lava, -ice, -bridge, -moving-platform, -spinning-platform, -falling-platform, -blinking-platform,
-spring, -spikes, -checkpoint, -coin, -key, -door, -switch, -walker, -flyer, -chest, -potion, -finish, -dragon,
-cannon, -eraser. All use the same glossy toy look with cyan glow and top-left light, made at 1024 and resized to 256.
The brief listed 20 names but described 24, so all 24 are made.
icon-stone (first came out as a castle tower) and icon-dragon (had a dark tile behind it) were redone.
The moving-platform arrows are small.
Credits: 26 images = 78.

## B. npc/ — Creator City characters (image → 3D, PBR, maps 1024, then Meshy rigging; all three rigs worked)
Concepts are in `npc/concept/`; the builder's was redone so it holds its wrench.
| character | static model | rigged (1.4 m) | clips (each a full skinned model, except walk) |
|---|---|---|---|
| npc-mentor: round mint/white teacher bot, grad-cap antenna, tablet | npc-mentor.glb 5,176 tris, 3.3 MB | npc-mentor-rigged.glb | -idle (4.0 s), -walk (walking_man 1.1 s, animation-only 288-tri proxy), -wave (Big_Wave_Hello 5.4 s), -talk (Talk_with_Hands_Open 4.0 s) |
| npc-builder: orange/grey bot, yellow hard hat, glowing cyan wrench | npc-builder.glb 5,181 tris, 3.5 MB | npc-builder-rigged.glb | -idle, -walk, -hammer (Heavy_Hammer_Swing 1.9 s) |
| npc-gamer: pink/white bot, headphones, smiley face screen, controller | npc-gamer.glb 5,144 tris, 3.6 MB | npc-gamer-rigged.glb | -idle, -walk, -cheer (Victory_Cheer 9.4 s), -dance (FunnyDancing_01 7.8 s) |
Notes:
- Each model is 3–4 % over 5k triangles; trim in the packer.
- PBR maps (base colour, metallic-roughness, normal) are kept in the rigged and animated files too, downscaled to 1024.
  Each file is 3.3–4.1 MB before packing.
- Meshy's library has no hammering or working loop. The builder's "work" clip is Heavy_Hammer_Swing, a single swing:
  loop it, or play it on a timer.
- The mentor's tablet screen has a small "A"-like glyph on it.
- The cheer clip is long (9.4 s); trim it if needed.
Credits for B: 4 concepts (12) + 3 image-to-3D (90) + 3 rigs (15) + 8 animations (24) = 141.

## Totals
This batch used 778 credits (1751 → 973): A 15, C 517 + icons 78, D 30, B 141. The account was then topped up again (1973).
