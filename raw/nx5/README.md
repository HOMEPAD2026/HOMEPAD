# raw/nx5 — ARCIRCLE Studio theme sets + editor icons (Meshy, raw files)

Credits: 459 → 162 (297 used). Cost per call: text-to-image 3, image-to-3D 30.
| part | calls | credits |
|---|---|---|
| A 1–3 track/wall/sky ×5 + 5 prop concepts | 20 images | 60 |
| A redos: 9 framed textures + 2 skies, 2 concepts | 13 images | 39 |
| A 4 props | 5 image-to-3D | 150 |
| B 14 icons + 2 laser redos | 16 images | 48 |
Six of the first 20 image calls hit Meshy's polling rate limit (429) after the task had been created and charged.
Those six results were fetched afterwards with `get`; no image was paid for twice.

## A. themes/<t>/ (t = neon, jungle, ice, lava, candy)
| file | size | note |
|---|---|---|
| track.png | 1024² | seamless top-down floor, no lane lines; each one was tiled 2×2 and checked |
| wall.png | 1024² | seamless obstacle-block face |
| sky.png | 1344×768 (16:9, Meshy's widest) | distant scenery, haze at the bottom |
| prop-concept.png | 1024² | the drawn concept for the prop |
| prop.glb | 2.9–3.1k tris | roadside piece made from the concept, facing +Z, no base |

**Textures:** the first try gave most tracks and walls as one framed tile with a border. Only the neon track was
seamless, and the ice and candy tracks also had stripes. All nine were redone with material-only prompts and now tile.
The candy and jungle tracks still showed a faint seam after their redo, so they were made seamless locally (a half-offset copy blended
into the edges); there is slight ghosting in the blend zone. The lava track's bright crack nodes repeat visibly from far
away. The candy wall is a busy, fine stripe pattern.

**Skies:** the lava sky was redone (the first had a lava river through the middle like a road, and ground in the bottom
third), and so was the jungle sky (ground in the bottom third). The jungle sky now has misty treetops at the bottom and
the lava sky a smoke sea. Neon, ice and candy are first tries.

**Props:**
| theme | tris | what |
|---|---|---|
| neon | 3036 | tapered dark-blue tower with cyan/violet neon spiral rings and a glowing orb top (concept redone: the first had a base) |
| jungle | 3129 | round leafy tree with hanging vines |
| ice | 2942 | pale-blue crystal spire |
| lava | 3130 | tall dark rock pillar with glowing orange cracks (concept redone: the first was a squat rock) |
| candy | 3052 | pink/white swirl lollipop; flat (0.2 deep), best seen from the front |
Four are 1–4 % over 3,000; trim them in the packer.

## B. icons/<name>.png — 14, 1024², on green
wall, moving-wall, gap, laser, blinking-laser, coin, heart, spring, platform, spike, drone, big-drone, pillar, tower.
Same blue-glass and cyan-glow style throughout, each a single object at about 70 % of the frame.
- **Background:** Meshy gives a soft lime/sage green (some with a slight vignette), not pure #00ff00, so key by hue with a tolerance.
- **laser / blinking-laser:** redone. Laser is now two glass posts with a red-and-cyan beam; blinking-laser has a broken
  beam of dashes and sparkles.
- **coin:** a glass disc with a cyan swirl, not a gold coin.
- **moving-wall:** the block has small side arrows.
