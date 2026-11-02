# raw/kart-rs — Meshy art for the ROCKET ROADSTER and the Galaxy Gauntlet (2026-11-02)

All of this is raw Meshy output, plus our own matting and black-crushing. Nothing is packed yet. Before it goes in
`models/world/kart/` or `images/kart/`, the game session packs the models (meshopt/Draco + KTX2, textures ≤ 1024 px;
every `.glb` here carries 2048 px PBR textures, so it is 8–14 MB) and converts the pictures to WebP.

**Meshy balance: 1,482 before → 1,165 after (317 credits for everything here).** All four groups (A–D) are done.

Renders (`*-render.webp`) come from our own three.js check (`vendor/three`, headless Chromium, RoomEnvironment). Each
shows three views; for the car they are rear three-quarter, top, and front three-quarter. Triangle counts are read
from the loaded GLB.

## A. ROCKET ROADSTER (`roadster`)

| file | Meshy task | notes |
|---|---|---|
| roadster-concept.png (= concept-4) | img2img 01a19b37-dbcf-767d-8fae-fd2dfde53941 | **the one used**: unbranded, open top, two empty black seats + steering wheel, 3 rear nozzles with cyan glow, cyan side-sill ports, white background |
| roadster-concept-1/2/3.png | 01a19b36-75ca-…, 01a19b36-75be-…, 01a19b36-75d2-… | rejected: very Tesla-like, but **all three have the Tesla "T" badge on the nose** (another brand's logo) |
| roadster-concept-5.png | 01a19b37-dbd7-7052-a7c4-c2ef34cabda5 | rejected: a round badge on the nose, grey background |
| roadster-raw.glb | image-to-3D 01a19b38-5285-7324-93f1-d254c93979b7 (`--pbr --polys 20000`) | **19,682 tris**, 8.6 MB, bounding box 1.90 × 0.49 × 0.89 (longest side 1.9, like the shop cars) |
| roadster.glb | remesh 01a19b39-d184-7256-989c-ea868c3a0360 (target 7,600) | **7,920 tris** (under 8 k), texture kept, 9.9 MB, same box |
| roadster-render.webp | — | checked: the cockpit is open with both seats **empty**, 4 wheels, the 3 rear nozzles, the side-sill lights. The windscreen is an opaque grey surface, not see-through glass: make it transparent in the game if it matters. |
| roadster-card.png | green edit 01a19b39-a291-7775-b15d-5b8bcc6d1a05 + our matting | 1024², the concept's car on pure #00FF00 by **difference matting**, the trick from raw/kart-cars: the white concept vs Meshy's green edit (it came back pale green ~rgb 127,203,106, as before), α = 1 − ‖white − green‖ / ‖W − G‖, then the concept's own colours composited on #00FF00. A faint soft shadow under the car stays in. |
| roadster-fly.png | img2img 01a19b38-52d5-73ac-910b-f9152f61ee32 | side view, the car flying with blue-white flames under and behind it. Unbranded and open-top, matching the concept. The background is **not** pure black (noise up to ~19/255). |
| roadster-fly-black.png | — | the same picture with the black crushed: (v − 20) × 255/235, so the background is 0 and it can be drawn additively. **Use this one.** |

## B. Galaxy Gauntlet (`galaxy`)

| file | Meshy task | notes |
|---|---|---|
| galaxy-sky-1.png | text-to-image 01a19b36-edc9-73c9-ad9c-ecfa6cc9b13d | 1344×768. **21:9 isn't allowed** (Meshy takes 1:1 16:9 9:16 4:3 3:4 3:2 2:3), so this is 16:9. Ringed planet on the left, nebula, spiral galaxy on the right, all in a band across the middle. There is black above and below the band, a "letterbox" look. |
| galaxy-sky-2.png | 01a19b36-edc7-727c-a82f-901ade9e3c7f | 1344×768, **the better one**: a bigger planet, a fuller nebula across the top half, and the bottom half dark space. Its left and right edges don't match, so mirror it to wrap (as the KQ skies do). |
| galaxy-road.png | 01a19b36-edd9-774c-9632-d9a1045b4baf | 1024², top-down, no perspective: dark graphite/navy hex panels with cyan + magenta light seams running **vertically** (so the texture's V is along the road). It tiles cleanly along the length; across the width there is a faint brightness step at the edges. No lane markings. |
| galaxy-card.png | img2img 01a19b38-5332-7579-8fdd-285793167eb7 | **1024² (img2img ignores aspect ratio)**: chase camera behind a kart on a neon space highway, asteroids, ringed planet |
| galaxy-card-169.png | text-to-image 01a19b39-808a-770a-b7a2-d736d93ea4e8 | 1344×768 16:9 version of the same idea: the road with cyan + magenta lines running to a ringed planet, crystal asteroids. The kart is a generic one, not our racer, so a real screenshot is still better for the track card. |

## C. Space props (`props/`)

Each prop: a text-to-image concept on white → image-to-3D `--pbr --polys 20000` (`<name>-raw.glb`) → remesh to the
budget (`<name>.glb`). Every model is ~1.9 Meshy units on its longest side.

| prop | concept (text-to-image) | image-to-3D | remesh | tris raw → game | budget | size raw / game |
|---|---|---|---|---|---|---|
| asteroid | 01a19b38-52ef-72e4-9a35-6afe78fbff95 | 01a19b39-8026-7118-bb4e-1e19fcbcca23 | 01a19b3b-66fd-7369-ae8e-e535bd444b33 | 20,660 → **3,033** | ~3,000 | 9.5 / 11.2 MB |
| satellite | 01a19b38-52bb-7127-aac9-f5caefbb21d2 | 01a19b39-80a0-77be-b1e0-a1a528b6f7d2 | 01a19b3b-6741-76dc-9059-90b093427572 | 18,088 → **4,915** | ~5,000 | 8.5 / 9.8 MB |
| beacon | 01a19b38-52df-7789-bf23-45d19000d329 | 01a19b39-80a7-7756-858a-d176a16a0083 | 01a19b3b-6664-7084-8228-5bf4639860c1 | 18,224 → **3,556** | ~4,000 | 9.9 / 10.5 MB |
| ring-gate | 01a19b38-523f-74dc-b35d-8cca588f0ede | 01a19b39-80ec-7568-89e6-85aac67b84f6 | 01a19b3b-66d3-7233-8142-21a18751fe9e | 18,631 → **4,931** | ~5,000 | 10.8 / 12.4 MB |
| station | 01a19b38-51db-7483-a03e-824219d4bc52 | 01a19b39-80e5-708e-8fbf-fb7050509883 | 01a19b3b-6771-7560-8732-b42976681695 | 20,147 → **7,934** | ~8,000 | 13.3 / 14.1 MB |
| jump-pad | 01a19b38-52d4-708e-9ef5-14b5c70ff970 | 01a19b39-80bf-73c7-aa7f-0bdee1ebe0b2 | 01a19b3b-66cf-755b-a0e4-15255f9abc43 | 13,152 → **1,826** | ~2,000 | 7.9 / 8.3 MB |

Notes:
- **asteroid**: a round rock with big glowing cyan crystal patches. The cyan is in the colour map; there's no emissive map, so set emissive yourself for a glow.
- **satellite**: a cute white/cyan box with blue panel wings and a dish.
- **beacon**: a slim tapered pylon with cyan + pink light panels and a cyan crystal tip.
- **ring-gate**: an upright dark ring with thin cyan/pink light slats inside, on a flat foot. The remesh roughened the foot's left edge a little, and the glow is thin, so the game probably wants an emissive ring added.
- **station**: a hub with a ring, modules and gold solar panels.
- **jump-pad**: a flat square plate with cyan **diagonal stripes** (not true chevrons). It's 0.18 tall per 1.9 wide.

## D. FX / UI

| file | Meshy task | notes |
|---|---|---|
| fx/thrust-flame.png (+ `-black`) | text-to-image 01a19b3b-81c8-70de-bc78-a995b26fc178 (2nd try) | **the one to use**: a plume alone, narrow and bright blue-white at the top, widening to cyan smoke downward; pointing down |
| fx/thrust-flame-1.png (+ `-black`) | 01a19b36-edc7-778d-aa9d-fcdb7026a2e5 (1st try) | rejected: a small rocket-engine silhouette sits at the top of the plume |
| fx/thrust-ring.png (+ `-black`) | 01a19b36-edc9-76d3-b38b-08bb2426467f | a thin cyan ring with wispy energy, seen from above |
| ui/btn-jump.png | 01a19b36-ed59-767e-9b6e-0e369da1fafc | a round blue-glass button with a cyan rim and a white upward rocket over flames. The green is **not pure** (~rgb 78,165,99): key by hue (green ≈ 80–150°; the button is blue ≈ 210°) |
| keyart.png | img2img 01a19b38-53c9-749a-a60e-2a94d241d4f2 (refs: key-1-nexus-800 + roadster concept + galaxy-sky-2) | **1024² (img2img ignores aspect ratio)**. The red open-top roadster (matching our concept) flies on a rocket flame above a neon highway, with a frog, a shiba and a penguin in karts below and a ringed planet behind. No text. **Use this one**, cropped as needed. |
| keyart-169.png | text-to-image 01a19b39-8098-706b-bda9-0e8811332168 | 1344×768, 16:9, but the car is a **closed-roof** red coupe, not our roadster. Fine as a mood piece; don't use it to show the ROCKET ROADSTER. |

All `-black.png` copies: (v − 20) × 255/235 clamped, so the background is exactly 0 (Meshy's black had noise up to
19/255). Draw them additively.
