# raw/nx4 — Meshy batch (raw files, not packed)

Credits: 700 → 459 (241 used). Cost per call as measured: text-to-image 3, image-to-3D 30, remesh 5.

| part | calls | credits |
|---|---|---|
| A ground: 12 textures + 3 redos | 15 images | 45 |
| B bosses: 5 concepts + 5 image-to-3D + 5 remesh tries | | 15 + 150 + 25 |
| C ui: 2 cards | 2 images | 6 |

## A. ground/ — 12 seamless top-down textures, 1024×1024
Each one was tiled 2×2 and checked for seams.
spam, fields, swamp, canyon, depths, peaks, dunes, reef, wastes, ruins, abyss, void (`<id>.png`).
- **fields**: redone (the first had a dark vignette); a faint brightness seam is still visible when tiled.
- **wastes**: redone (the first had a grey frame). It is now plain toxic-green ground, with few visible circuit bits.
- **void**: redone so the edges glow; the hexagon grid breaks at the tile seams. That was its one redo, so it needs
  a hand fix (or one more try) before it is used as a repeating floor.
- The rest tile cleanly. Abyss's lava cracks join at the edges, so the repeat is visible from far away.

## B. bosses/ — image → 3D, facing +Z, one body, no base, no rig
`concept/<id>.png` is the drawn concept (1024², grey background); `<id>.glb` is the model.
| file | tris | what |
|---|---|---|
| spam.glb | 5196 | The Spam King: red/pink eyeball robot on stubby legs, gold crown (a normal crown with small heart/envelope marks, not envelope icons), two antenna orbs |
| fields.glb | 5146 | The Free Mint: teal gift box with a red bow, coin-filled grin, ribbon tentacles; thin (0.69 deep) |
| swamp.glb | 5215 | The Honeypot Queen: amber honey-jar bee with wings, a tiny crown and honey drips |
| canyon.glb | 5201 | The Rug Titan: grey stone golem with cyan cracks, wearing a red/orange patterned carpet cape (the body is grey, not orange) |
| depths.glb | 5089 | The Rug Dragon: chunky purple dragon sitting on a gold coin pile, with violet/cyan crystals |
**Triangle budget:** these are 1–4 % over 5,000. Meshy's remesh to 4,800 only reached 4,948–5,033 (two were still over).
It also re-baked the textures blurrier at 9–10 MB per file, so the remeshed files were not kept. Trim the last ~200
triangles in the packer's simplify step instead.

## C. ui/
| file | size | what |
|---|---|---|
| raid-card.png | 1344×768 (16:9) | Crimson Citadel on a floating marble island over sunset clouds, three crimson spires, red moon, cyan cracks in the rock |
| raid-card-tall.png | 864×1184 (3:4) | the same, portrait; the red moon sits behind the spires |
