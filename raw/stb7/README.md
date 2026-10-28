# raw/stb7 — Meshy art for the Studio (blocks, pieces, race, tower defence, tools, UI kit, textures, models)

Raw Meshy output, made 2026-10-27: images with text-to-image (model nano-banana), models with text-to-3D (`ai_model: latest`, preview + refine, realistic style) then remesh. **Not packed:** cut out, convert to WebP and size for a phone before an image goes in the game. Run models through the town's packer (Draco + KTX2, textures ≤ 1024 px) first.

## Icons — `icons/<name>.png`, all 1024x1024

Prompt (`<X>` = the subject in the table):

> a single cute glossy 3D game UI icon of <X>, stylized, soft studio light, centered, generous margin, the whole background is one flat pure green #00ff00 colour edge to edge, no frame, no tile, no text

The 2nd tries used a longer ending: "…colour edge to edge with no white border, no frame, no tile, no card, no text".

**Keying note:** as in raw/stb, the "pure green" comes back as a shaded green (about #55a056–#93cf8a, darker at the edges), not #00ff00. Key by hue.

| File | Subject | Retries / notes |
|---|---|---|
| `blk-red.png` | a glossy red toy building block cube floating | 2nd try. The 1st (*a glossy red toy building block cube*) came back as a green tile inside a white frame. |
| `blk-blue.png` | a glossy blue toy building block cube | Came back cyan-blue rather than deep blue. Tint it if it must match a brick colour. |
| `start.png` | a small blue start flag on a pole standing on a round glowing pad | |
| `ore-copper.png` | a chunk of dark rock with shiny orange copper crystals | |
| `ore-silver.png` | a chunk of dark rock with shiny silver crystals | |
| `ore-gold.png` | a chunk of dark rock with shiny gold nuggets | |
| `pc-stairs.png` | a small flight of stone block stairs going up to the right | |
| `pc-lava.png` | a pool of glowing orange lava between two stone blocks | It drew a lava pool framed by stone. |
| `pc-keydoor.png` | a golden key in front of a small wooden door | |
| `pc-gate.png` | a round red push button next to a metal gate | Small in the frame, so crop tighter. |
| `pc-arena.png` | a cute small purple dragon (not green) | Purple, as asked, so it keys cleanly. |
| `pc-arch.png` | a little rainbow arch over toy blocks | |
| `pc-patrol.png` | a cute red mushroom monster walking | 2nd try. The 1st came back as a green tile on white. |
| `pc-tower.png` | a tall thin tower made of stacked colourful toy building blocks, with a glowing blue spiral ribbon winding around it | 2nd try. The 1st (*a tall tower of toy blocks with a blue spiral around it*) was a short blob. The tower has a few green bricks, so watch them when keying. |
| `pc-lifts.png` | a floating blue platform with an up and a down arrow | |
| `pc-ores.png` | a pickaxe leaning on a small pile of shiny ore | 2nd try. The 1st came back as a rounded tile on white. |
| `race-ring.png` | a glowing cyan hoop ring standing upright | Seen face-on (a ring). |
| `race-pad.png` | a flat boost pad with a glowing orange chevron arrow | |
| `race-orb.png` | a glowing violet energy orb | |
| `td-path.png` | a winding brown dirt path on a square tile (no grass) | |
| `td-pad.png` | a round blue stone tower base pad | |
| `tool-select.png` | a dashed white selection square with a mouse cursor | |
| `tool-events.png` | a yellow lightning bolt over a small blue card | The bolt has a cute face. |
| `tool-mine.png` | a small open gift box with a star popping out | |
| `tool-undo.png` | a curved blue arrow pointing left | |
| `tool-redo.png` | a curved blue arrow pointing right | |
| `tool-copy.png` | two overlapping blue cards | |
| `tool-play.png` | a blue and white game controller with a big white play triangle on a small badge beside it (no green in it) | 2nd try. The 1st (*a joystick controller with a small play triangle*) was a green controller with no play triangle, which can't be keyed off green. |

## UI kit — `kit/`

| File | Size | Exact prompt | Retries / notes |
|---|---|---|---|
| `card-common.png` | 864x1184 (3:4) | an empty ornate game item card frame, brushed silver-grey rim, glossy 3D stylized, the inside of the frame is empty dark navy, centered with margin, the whole background is one flat pure magenta #ff00ff colour edge to edge, no text | Magenta comes back as a shaded pink-magenta, so key by hue. |
| `card-rare.png` | 864x1184 (3:4) | an empty ornate rectangular portrait game item card frame, glowing blue sapphire rim, glossy 3D stylized, the inside of the frame is empty dark navy, centered with margin, the whole background is one flat pure magenta #ff00ff colour edge to edge, no text | 2nd try. The 1st (the brief's wording) was a round frame. The 2nd has a **gold** rim set with blue sapphires, so it reads close to legendary. Tint the gold toward blue/silver if the two must differ more. |
| `card-epic.png` | 864x1184 | …same as common, with "glowing purple amethyst rim" | |
| `card-legendary.png` | 864x1184 | …same, with "shining gold rim with small gems" | |
| `card-mythic.png` | 864x1184 | …same, with "crimson and black rim with red glow" | A smoother, less ornate rim than the others (rounded crimson bevel). |
| `tab.png` | 1344x768 (16:9) | an empty glossy blue glass game UI tab pill button with a soft cyan rim, on a flat pure green #00ff00 background edge to edge, no text | Asked for 4:1, but Meshy only takes 1:1, 16:9, 9:16, 4:3, 3:4, 3:2 and 2:3 (400 error), so it's 16:9. The pill is small in the middle: crop it. It's teal-cyan glass, close to the green, so key carefully (by hue, tight). |
| `tab-on.png` | 1344x768 (16:9) | an empty bright cyan-white glowing active tab pill button, glossy glass game UI, on a flat pure green #00ff00 background edge to edge, no text | Same ratio note. A mostly see-through pill with a bright white-cyan rim: the middle shows the green, so key the inside too, or redraw the fill in CSS. |
| `win-head.png` | 1344x768 (16:9) | an empty premium game UI window header bar, blue glass with a thin gold trim and a soft glow, wide and thin, centered, on a flat pure green #00ff00 background edge to edge, no text | A small bar in the middle, so crop it. |
| `toolbar.png` | 1344x768 (16:9) | an empty slim floating game toolbar strip, dark blue glass with cyan rim light, rounded ends, wide and thin, on a flat pure green #00ff00 background edge to edge, no text | Same as win-head: small, so crop it. |

## Textures — `tex/`, all 1024x1024

| File | Exact prompt | Retries / notes |
|---|---|---|
| `ore-copper.png` | seamless tileable stylized game texture of a dark stone block face with copper orange crystals embedded, the texture fills the whole square edge to edge with no border and no margin, top-down, flat even light, no text | 2nd try. Both tries came back with a flat grey border: about **56 px** on each side here. Crop to the inner 912x912 (x/y 56–968) before tiling, then check the seams. |
| `ore-silver.png` | …the same with "silver crystals" | 2nd try, border about **56 px**: crop the same way. |
| `ore-gold.png` | …the same with "gold nuggets" | 2nd try, border about **26 px**: crop to x/y 26–998. Big chunky nuggets on cobbles, so it's less "noisy" than copper and silver. |
| `jw-brick-neon.png` | seamless tileable stylized game texture of a dark navy sci-fi metal panel with glowing cyan seams, flat even light, no text | Full-bleed, no border. |
| `jw-brick-candy.png` | seamless tileable stylized game texture of pink and white candy bricks with sugar sprinkles, flat even light, no text | Full-bleed, no border. |

The 1st tries of the ore textures (the brief's exact wording, without "fills the whole square…") had the same kind of border. They aren't committed.

## Models — `models/`

Prompt: "cute stylized 3D game asset, bright, clean shapes, hand-painted look: <subject>". Text-to-3D preview + refine (realistic style, no PBR), then `remesh` of the refine task to the target (triangles, GLB). Textures are kept: each GLB carries three PNG textures (two of 2.7–5.7 MB, one small). They are what makes the files big, so KTX2 at ≤ 1024 px in the packer will cut most of the size.

| File | Subject | Target | Triangles | Size | Notes |
|---|---|---|---|---|---|
| `race-start.glb` | a hover race start gate, an arch with a checkered banner and two glowing cyan pylons | 6k | 5,582 | 10.1 MB (10,627,284 B) | An orange arch with a red **START** sign and a red ribbon across. No cyan pylons and no checkered banner. The ground has a flat checkered decal piece: drop it or keep it. Raw refine: 467,720 tris. |
| `race-finish.glb` | a finish arch with a checkered flag top and gold trim | 6k | 5,659 | 6.5 MB (6,766,860 B) | An orange arch with a checkered top and a **FINISH** sign. The "gold trim" reads as orange. Raw refine: 352,614 tris. |
| `trophy.glb` | a golden trophy cup with a star on top on a dark base | 4k | 4,130 | 7.7 MB (8,024,676 B) | Gold cup with a cute face, a star on top and a black base with a blank gold plate. Raw refine: 233,452 tris. |
| `rocket.glb` | a cute white and blue toy rocket with a cyan flame window | 4k | 4,165 | 7.8 MB (8,141,596 B) | White rocket with a blue porthole and orange flames. It lies **on its side**, nose to +X, so stand it up (rotate −90° about Z) when placing. Raw refine: 248,822 tris. |

`models/preview.png` shows the four rendered side by side (three.js, hemisphere + sun light), for a quick look.

## Failures

- The 4:1 tab requests failed with Meshy's 400 (ratio not allowed) and were redone at 16:9.
- No 429 / NoMorePendingTasks this time: every run was kept to at most 3 Meshy tasks at a time.
- The redos are listed above: blk-red, pc-patrol, pc-ores, tool-play, pc-tower, card-rare and the 3 ore textures. The first tries were set aside and are not committed.
