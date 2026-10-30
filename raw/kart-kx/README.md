# raw/kart-kx — Meshy art for ARCIRCLE KART (track hazards, trophy, HUD bits)

Raw outputs from Meshy (`tools/meshy.mjs`), 2026-10-30. Repack before they go in the game (meshopt/Draco + KTX2,
textures ≤ 1024 px). Models are text-to-3D (preview → refine; `--polys` = Meshy's remesh to the budget; art style
"realistic" with a toy-like prompt). Each GLB's one texture was re-encoded to a 1024 px JPEG (nothing else changed).
`models/preview.png` shows all seven side by side (a three.js render).

Every model prompt ends with: "bright stylized 3D game asset, toy-like, clean simple shapes, vivid colors, cartoon kart
racing game prop".

## Models

| file | prompt (before the common tail) | Meshy tasks (preview / refine) | triangles | bytes |
|---|---|---|---|---|
| models/lava-geyser.glb | A volcanic vent rock mouth on flat ground, a ring of dark basalt rocks with a glowing orange lava crack opening in the middle, low and wide, no eruption | 01a18e6d-ea0d-73a0-b976-851568870c7d / 01a18e6e-930b-7701-9977-c944dfc5568f | 4150 | 393888 |
| models/icicle.glb | A frozen ice overhang arch piece with a large cluster of blue icicles hanging down from its underside | 01a18e6d-ea32-7137-8d70-be6ed879fc0c / 01a18e6e-7e71-712e-80ed-ffdf565ab3f8 | 3100 | 403900 |
| models/icicle-single.glb | One single large pointed falling icicle, clear light blue ice, sharp tip | 01a18e6d-eabc-77d4-9e61-d6d4b0765a80 / 01a18e6e-5742-74ad-b376-7cb0be641c7d | 975 | 157916 |
| models/meteor.glb | A glowing space meteor rock, purple-grey stone with bright cyan crystal shards sticking out, glowing cracks | 01a18e6d-ea84-747f-970b-716f0f798bdf / 01a18e6e-92be-72b2-8120-105fb29003f8 | 2085 | 322120 |
| models/crater.glb | A shallow round impact crater on flat grey moon ground, low raised rim, flat disc shape | 01a18e6d-eb0e-75f8-a77d-612770c821d2 / 01a18e6e-6e32-7606-a2cb-1667188ad611 | 791 | 101496 |
| models/trophy-statue.glb | A podium statue: a big shiny gold trophy cup on a tall square stone pedestal, a black and white checkered flag band around the pedestal, an infinity symbol emblem on the trophy front, a blank name plate on the pedestal | 01a18e6d-eb1c-71ed-a892-d80e138264ba / 01a18e6e-7fdd-7796-9e2a-dc9203098221 | 8062 | 693328 |
| models/leaderboard-screen.glb | A big standing neon scoreboard screen frame on two metal legs, glowing cyan and magenta neon edges, empty dark flat screen face | 01a18e6d-eb09-77ad-9b77-53f4d1e9ac39 / 01a18e6e-8320-7119-a3f5-3c75464a5999 | 1833 | 388544 |

Notes:
- trophy-statue: Meshy put the checkered pattern on the cup (with checkered ribbons on the handles) rather than as a
  band round the pedestal; the ∞ is on the cup's front; the pedestal has a blank gold-framed name plate on its front
  for the game to draw the #1's name over.
- crater: plain light grey, nearly untextured — tint it per track in the game.
- icicle-single: tall and slightly curved, the tip pointing down (−Y).
- leaderboard-screen: the dark screen face is one flat area — put a CanvasTexture plane just in front of it.
- meteor / lava-geyser: the cyan cracks / red lava are in the base texture only (no emissive map) — add the glow in the game.

## Images — text-to-image (nano-banana)

Meshy's "pure green" comes back as a soft muted green (about #7CC368 / #9CA897), not #00FF00 — key by distance from
the border colour, as raw/kart-k2 did. The black backgrounds are true #000000. Meshy has no 4:1, so the HUD frame is
a 16:9 picture with a ~3.5:1 panel in the middle (crop it).

| file | ratio | prompt | Meshy task | bytes |
|---|---|---|---|---|
| images/item-empty.png | 1:1 | A glossy transparent glass cube item box icon with a big white question mark inside, bright cyan rim light, cute 3D game icon, centered, on a flat pure solid bright green #00FF00 background, no shadow, nothing else | 01a18e6d-eae2-7541-b5e0-fef06ef2a3ed | 957684 |
| images/hud-frame.png | 16:9 | A sleek wide horizontal blue glass game HUD panel frame, very wide 4 to 1 rounded rectangle, thin glowing cyan edge, dark translucent navy middle, empty, centered, on a flat pure solid bright green #00FF00 background, nothing else, no text | 01a18e6d-eb06-7373-bf70-cf8aa32d269c | 920717 |
| images/rugged.png | 16:9 | The word RUGGED! in bold chunky cartoon game lettering, orange-red letters with thick white outline, a small flying magic carpet rug beside the text, centered, on a flat pure solid bright green #00FF00 background, nothing else | 01a18e6d-eb30-7249-8a41-e3725b674f0c | 978423 |
| images/perfect.png | 16:9 | The word PERFECT! in bold chunky cartoon game lettering, cyan letters with gold outline and sparkle, centered, on a flat pure solid bright green #00FF00 background, nothing else | 01a18e6d-ea4b-771c-ae7b-944808100693 | 1001163 |
| images/snowflake.png | 1:1 | A single soft glowing white snowflake particle sprite, soft blurry glow, centered, small in the middle, on a pure solid black #000000 background, nothing else | 01a18e6d-eaff-7534-a763-2c28d745b1a1 | 270600 |
| images/ash.png | 1:1 | A single soft glowing orange-grey ember ash particle sprite, soft blurred speck with warm glow, centered, on a pure solid black #000000 background, nothing else | 01a18e6d-eaeb-75a3-848e-951b96e2f88e | 352415 |
| images/stardust.png | 1:1 | A single soft glowing stardust sparkle particle sprite, a small four-point star with soft cyan-white glow, centered, on a pure solid black #000000 background, nothing else | 01a18e6d-eab0-70ce-8828-d5a2ed77c91a | 134074 |

Notes: rugged.png's little flying rug sits under the "!", with a soft shadow on the green below it. The particle
sprites are small in the middle of a 1024² frame (crop to ~128 px round the centre).

Nothing failed; no retries were needed.
