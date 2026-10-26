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
