# raw/nx8 — CREATOR CITY (ARCIRCLE STUDIO BETA's land), Meshy raw files

Credits: 321 used (1072 → 751; the account was then topped up to 1751).
| what | calls | credits |
|---|---|---|
| concepts: 9, plus 2 redone (factory had "ASSET FACTORY" lettering; the portal was a stone arch on grass) | 11 images | 33 |
| models: 9 image-to-3D, PBR, remeshed in the same task | 9 | 270 |
| floor, path, sky, loading art, plus 2 redos (floor, loading art) | 6 images | 18 |

## A + B. Models (image-to-3D from `<name>-concept.png`, PBR, facing +Z)
Each one stands on its own. Meshy normalises the size to about 1.9 m on the longest side, so scale it in placement
(buildings 12–18 m wide, the tower about 30 m tall, the portal about 6 m).
PBR maps: baseColor, metallicRoughness and normal. Meshy gave them at 2048; I downscaled every map to **1024** locally
by re-encoding the GLB's embedded PNGs; the mesh is unchanged.
| file | tris | size | what |
|---|---|---|---|
| academy.glb | 7,933 | 3.4 MB | arched-window school on a round green lawn with a big lightbulb on the roof |
| tower.glb | 7,613 | 3.9 MB | slim stacked tower with floating wrench and brush; proportions 0.9 × 1.9 (scale to 30 m tall, about 14 m wide) |
| arcade.glb | 6,579 | 3.7 MB | wide hall with a blank curved neon marquee and three arched doorways across the front |
| market.glb | 7,939 | 4.9 MB | glass stalls full of toy blocks and models under one wavy white canopy; low and wide |
| hall.glb | 7,571 | 3.9 MB | white-and-gold domed rotunda with a ring of columns and an empty glowing pedestal |
| contest.glb | 7,688 | 4.0 MB | round stadium with a gold trophy on top |
| factory.glb | 7,347 | 4.4 MB | domed glass factory with a gear, a conveyor of colourful blocks and a chimney |
| launch.glb | 8,056 | 4.2 MB | round launch pad with a big blue ring gate and a small rocket |
| game-portal.glb | 3,529 | 3.2 MB | rounded white arch with a cyan swirl, no base, 0.22 deep; tint it per game |
Notes:
- The academy, arcade, contest and launch models each sit on a round green or grey disc, as in their concepts.
- Gold parts are metallic: they look dark in a preview without an environment map, so give them an env map in the game.
- The arcade's three front arches are plain doorways, not separate portal shapes.

## C. Ground — 1024², seamless (each tiled 2×2 and checked)
| file | what |
|---|---|
| cc-floor.png | large pale cream slabs with soft bevels and thin glowing cyan joints (redone: the first looked like graph paper) |
| cc-path.png | glossy pale mint and white small tiles with a soft glow and a few brighter sparkle tiles |

## D. cc-sky.png — 1344×768
Pastel pink, lilac and blue sky with a soft rainbow, fluffy clouds, small floating grassy islands and floating toy cubes.
The bottom edge is a bank of cloud with no ground.

## E. cc-load.png — 1344×768
The white robot hero holding a glowing cyan cube on a glowing pad, in front of the city's landmarks: the lightbulb
school, a big ring portal, the tower with wrench and brush, and the trophy hall. Confetti and light rays.
Redone because the first had "SCHOOL" written on a building.

## F. `<name>-concept.png` — 1024², one next to each GLB
