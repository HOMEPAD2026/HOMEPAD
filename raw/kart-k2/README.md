# raw/kart-k2 — Meshy art for ARCIRCLE KART (stage 2)

Raw outputs from Meshy (`tools/meshy.mjs`), 2026-10-30. Repack before they go in the game (Draco/meshopt + KTX2,
textures ≤ 1024 px, the town's packer). Every GLB is Meshy's model with its one texture re-encoded to a 1024 px JPEG
(nothing else changed); triangle counts as shipped here (text-to-3d with target 5,000, remeshed by Meshy).

## A. Item icons — text-to-image (nano-banana, 1:1)

Meshy's "green" came back as a soft muted green, not #00FF00, so the WebP is keyed by distance from the border colour
(connected to the edge only) with a despilled fringe, cropped and padded square, 256 px with alpha.
The shield's glass bubble keeps a faint green tint from the background showing through it.

| file | Meshy task | size (png / webp) |
|---|---|---|
| icons/rocket.png · .webp | 01a18bfe-0bc9-72ae-aca0-b9160ce761bc | 996379 / 13524 |
| icons/magnet.png · .webp | 01a18bfe-0bac-710c-85b6-975a34710c66 | 994434 / 14076 |
| icons/shield.png · .webp | 01a18bfe-0bda-739b-987d-e71237f0ca06 | 1069687 / 13530 |
| icons/rug.png · .webp | 01a18bfe-0b5b-759a-83a9-574bdae54ea6 | 1069070 / 12964 |
| icons/pump.png · .webp | 01a18bfe-0bbf-7691-b977-9c3fded392ae | 1057126 / 11146 |
| icons/bomb.png · .webp | 01a18bfe-0b66-7625-bf8b-8043ca7beffb | 1177521 / 14512 |

## B. Track models — GLB

| file | Meshy task (refine / image-to-3d) | triangles | bytes |
|---|---|---|---|
| models/item-box.glb | 01a18c01-efd2-70a4-83e2-487036c8bf51 | 3839 | 494476 |
| models/lights.glb | image-to-3d 01a18c0a-32b4-73ec-b864-aa7f658dcfec (from models/lights-ref.png, text-to-image 01a18c09-dfda-74e0-acb4-6c0c4058364d) | 4309 | 535584 |
| models/podium.glb | 01a18c01-a0a9-72a2-975f-1a0b8a1a1d02 | 3807 | 369292 |
| models/ramp.glb | 01a18c06-855a-77e0-b826-ad8fc6e67bf5 | 4486 | 542712 |
| models/stand.glb | 01a18c02-2db7-7212-8a0c-1012ae2a5be3 | 4528 | 662784 |

Notes: the podium has small 1/2/3 marks moulded on its steps; the item box's "?" faces are raised, not cut out.

## C. Track themes — sky (text-to-image 16:9; Meshy offers no 21:9) + props

| file | Meshy task | triangles | bytes |
|---|---|---|---|
| moon/sky.png | 01a18c00-425c-7411-a8f9-c9257d14e96d | — | 1416397 |
| moon/moon-rock.glb | 01a18c02-03f3-7221-9c5d-35ce13024932 | 5137 | 476248 |
| moon/crystal-pylon.glb | 01a18c06-70ab-70ef-9c6c-5cfb06b54b8c | 5043 | 443652 |
| ice/sky.png | 01a18c00-97fc-76b2-aed5-be139af90b50 | — | 1318048 |
| ice/ice-crystal.glb | 01a18c03-4f11-720b-b979-f2e8c5ec1db6 | 5134 | 485464 |
| ice/chain-pylon.glb | 01a18c03-520e-715e-8f7c-3065e96651b5 | 5028 | 644880 |
| volcano/sky.png | 01a18c00-97fc-77ad-8ad1-ce602d63758f | — | 1753885 |
| volcano/lava-rock.glb | 01a18c06-c19c-73cb-9c06-81244815f85c | 5216 | 599876 |
| volcano/candle-pillar.glb | 01a18c06-72f7-704d-9b9c-a5a0656706d3 | 4102 | 391212 |

The skies aren't seamless at the left/right edges (mirror or fade them when wrapping a dome). The volcano candle came
out as a red wax candle with a flame on a small base, not a chart bar with wicks.

## D. Road textures — text-to-image 1:1, top-down (lane lines run top → bottom)

| file | Meshy task | bytes |
|---|---|---|
| moon/road.png | 01a18bff-e094-70fd-90b9-3de34011de13 | 1812122 |
| ice/road.png | 01a18c00-97fb-702b-a7c9-1dcac0c5e7c2 | 1538490 |
| volcano/road.png | 01a18bff-e026-7565-a624-9866f389a676 | 1930266 |

Not checked for seamless tiling; the moon road has two double cyan dashed lines, no edge lines.

## Retries (not kept)

First tries that were replaced: lights (text-to-3d gave rings, then a car), ramp (a flat pad), crystal pylon / lava rock /
candle (lost their colours to the shared cyan texture prompt), ice sky (a giant chain in front), volcano sky (a fake
checkerboard strip), ice road (a grid).
