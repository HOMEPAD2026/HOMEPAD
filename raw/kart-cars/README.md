# raw/kart-cars — Meshy art for ARCIRCLE KART's car shop (2026-11-01)

Everything here is raw Meshy output (plus our own keying). Nothing is packed yet: the game session packs the
models (Draco/meshopt + KTX2, textures ≤ 1024 px) before they go in `models/world/kart/`.

## The six karts

Every kart has an open cockpit with an **empty seat** and a steering wheel, 4 wheels, no driver, and its brand's
emblem on the nose and both side pods (checked in a three.js render: `<id>-render.webp`).

| id | name | concept (img2img) | image-to-3D (`<id>-raw.glb`) | remesh (`<id>.glb`) | tris raw → game |
|---|---|---|---|---|---|
| usdc | PEGMASTER | 01a1969d-2fb2-75a1-bdfd-a7cd99508de0 | 01a1969d-c9b9-728f-993f-d4498ad786e4 | 01a196a2-4377-7333-9be2-8b2fe3b582bc | 20,171 → 7,867 |
| roblox | BLOXBUSTER | 01a1969d-2f8c-7292-a293-ca1533b09fb1 | 01a1969d-ca16-7708-81cd-789cff69b4f9 | 01a196a2-439f-72a3-852e-47b4970ffe4c | 19,627 → 7,909 |
| kairo | KAIRO KLIK | 01a1969d-2fd0-732e-8765-75a81b01803f | 01a1969d-ca64-77df-b49a-771f87ff9629 | 01a196a2-4384-7207-8e3f-df7d56b14db7 | 19,857 → 7,898 |
| arc | ARC LIGHTSPEED | 01a1969d-2fbb-7565-b119-e8d0a0bcb49c | 01a1969d-c9bd-76fe-a52f-9dde7791d618 | 01a196a2-437c-76b9-a13f-eb18ec2d4a47 | 19,863 → 7,883 |
| circle | CIRCLE ORBIT | 01a1969d-ca06-73a1-8599-d6bcad216d2b (2nd try) | 01a1969e-30d3-70cc-bd0e-7c64c55ca95a | 01a196a2-4364-7484-885d-e2910ed0674f | 20,050 → 7,878 |
| argus | ARGUS WATCHER | 01a1969d-2fcb-7633-9d31-9a404238e576 | 01a1969d-c9a1-746d-9f96-833350396b1c | 01a196a2-43a8-7115-9634-023ad4b47351 | 19,995 → 7,879 |

Files per kart:
- `<id>-concept.png` — 1024², three-quarter front, white background (img2img: the logo + our KART key art
  `images/kart/keyart/key-1-nexus-800.webp` as the style reference; `card-pepe.webp` is a racer, not a kart, so the
  key art was used instead).
- `<id>-raw.glb` — image-to-3D, `--pbr --polys 20000` (one PBR material, 3 textures: base colour, metal-rough, normal), ~8–10 MB.
- `<id>.glb` — Meshy remesh of that task to 7,600 (lands at ~7.9 k triangles, under the 8 k budget; texture kept),
  ~9–12 MB because the textures are 2048 px — pack before use. Bounding box ≈ 1.90 × 0.5–0.64 × 1.0–1.26 (Meshy
  units, longest side 1.9; scale to the existing karts when placing). A first remesh at 8,000 came out ~8.3 k
  (tasks 01a1969e-fc89…, 01a1969e-fcd9…, 01a1969f-2634…, 01a1969f-2661…, 01a1969f-2699…, 01a1969f-63c8…) and was replaced.
- `<id>-card.png` — 1024², the shop card on flat pure `#00FF00` (see below).
- `<id>-render.webp` — our three.js check render of `<id>.glb` (three-quarter, top, rear).

Notes per kart:
- **circle**: the first concept (01a1969d-2f6f…) drew the "glowing ring" as a disc on the floor, which would have
  become geometry; the second try is used (gradient body, glowing cyan wheel hubs and edge lights, no floor ring).
- **arc**: navy/chrome with light-blue edge lights; the gradient to silver-blue is subtle in the model's texture.
- **kairo / roblox**: black-and-white as asked; very close in colour to each other — the shapes (angular vs blocky) tell them apart.

## Cards (`<id>-card.png`) — what went wrong and how they were made

Meshy's img2img never gave a pure green: three tries (side-front view on green; with a #00FF00 swatch as a second
reference — tasks 01a196a0-…; "edit: replace the background" — tasks 01a196a1-…) all came back pale green
(~rgb 140,210,140) with green spill on the karts, and it never turned the kart to a side view. So the cards are
**the concept's kart on pure #00FF00 by difference matting**: the white-background concept vs Meshy's green-background
edit of the same picture (same pixels) → the background mask, then the concept's own (unspilled) colours composited
on #00FF00. The view is therefore the concept's three-quarter front, not side-front. A faint grey contact shadow under
each kart is left in (it keys to a soft shadow).

## Shop icons (`icons/`, text-to-image, 1024²)

| file | task |
|---|---|
| icons/cars.png | 01a196a4-b621-7496-b0c5-48a189b47d49 |
| icons/paint.png | 01a196a4-b61e-70aa-841d-f2c0bb19ea1a |
| icons/trails.png | 01a196a4-b623-73fa-8de1-c0c88a83b128 |
| icons/outfits.png | 01a196a4-b623-73fc-b762-7711e1d25f6e |
| icons/itemskins.png | 01a196a4-b61d-76d6-b3ab-dd3686f82072 |

Blue glass with cyan/mint glow. The backgrounds are a flat but **not pure** green (~rgb 75–125, 165–210, 45–105, a
slight vignette): key by hue (green ≈ 80–140°) — the icons themselves are cyan/blue (≈ 180–210°), so they separate.
`paint` and `trails` came as a glass app-tile with the motif inside; the others are free-standing.

## Banner (`shop-banner.png`, text-to-image 16:9, 1344×768)

Task 01a196a4-b623-7561-bc22-f85727ecf1b8: a neon garage with glowing turntables and polished floor — but it shows
**five** karts, not six, and it is on the dark side. A retry with our five concepts as references
(01a196a5-4f94-7376-9043-22aa09db1ebb) came back square with four karts and was dropped.

## Credits

Meshy balance 1,920 → 1,584 for the whole set.
