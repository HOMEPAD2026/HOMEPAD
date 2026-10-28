# raw/ccr/out — CREATOR CITY remaster (Meshy raw files)

Credits: 303 (1874 → 1571). Cost per call: image or img2img 3, image-to-3D 30.
No readable text or other brands in the pictures. The green backgrounds are lime, not pure #00ff00: key by hue.
Props were made as concept picture → image-to-3D with a triangle target (`--polys`). This was used instead of
text-to-3D + remesh because it gave better results earlier. Each prop has one baked material; its maps were downscaled
locally to 512 (trophy-statue to 1024).

## A. mock/ — img2img remaster mock-ups (1024², square: tools/meshy.mjs img2img sends no aspect ratio)
| file | from | task id | notes |
|---|---|---|---|
| mock-plaza.png | ref/v-plaza-n.jpg | 01a17a7d-1a84-7137-ab81-40f9ffe00423 | plaza alive: statue in the Hall of Fame, lamps, holo screen, floating toy cubes, pastel banners; same building positions |
| mock-arrive.png | ref/v-arrive.jpg | 01a17a7d-263c-71b0-b8c4-fd99125fe96b | the way in: planters with mint trees, holo panels, floating cubes, stars and controllers |
| mock-arcade.png | ref/w-arcade.jpg | 01a17a7e-9a85-760f-b812-a298526739a4 | redone (the first lost almost all content): rail, search, chips, framed cards with play/like buttons; carries the ref's Korean labels |
| mock-academy.png | ref/w-academy.jpg | 01a17a7d-3ddf-7575-83bc-7eaaf848b27d | step list with a progress rail on the left, hero banner with the robot; carries the ref's Korean labels |
Prompt: "Remaster this same scene/window at high quality, keep the composition, camera and building positions / layout: …
bright stylized 3D, pastel white and cream city with cyan and mint glow, a playful makers' theme park …"

## B. img/, icons/, glow/ — text-to-image
| file | size | task id | notes |
|---|---|---|---|
| img/floor-tile.png | 1024² | 01a17a7d-4956-76b5-94f0-c364436a0627 | soft rounded cream tiles with cyan joints and tiny gold dots; tiles 2×2 (a faint seam) |
| img/plaza-medallion.png | 1024² | 01a17a7e-b262-76ee-8a6f-6031e3ecf537 | round cream/cyan/gold mosaic with controller + pencil + star in the middle, on lime green |
| img/sign-plate.png | 1024×320 | 01a17a7d-5505-77c8-8d97-f50a13c2385d | empty blue-glass nameplate with gold + cyan trim on lime green, cropped from sign-plate-raw.png (1344×768). The plate itself is about 2.4:1, so 9-slice it |
| img/hdr-hall.png | 1344×768 | 01a17a7d-60d0-77e4-a0d4-c19806274813 | pillared hall, gold trophies, pencils, robot |
| img/hdr-factory.png | 1344×768 | 01a17a7d-6c8b-7125-88e6-987f203ceabb | toy workshop with gears and cubes, robot with a wrench |
| img/hdr-contest.png | 1344×768 | 01a17a7d-7836-72e4-8665-0e9f1d57e0d1 | stage with trophy under spotlights, confetti, robot |
| img/hdr-launch.png | 1344×768 | 01a17a7d-83f6-703a-a390-7161d02722a1 | rocket on clouds by a toy tower, robot |
| img/hdr-market.png | 1344×768 | 01a17a7d-8fb2-76f1-88f4-2af77060381c | big pastel stall building full of game parts, small robot |
| img/hdr-arcade.png | 1344×768 | 01a17a7d-9b72-702b-bebb-3433c6df4a41 | a long row of round glowing portals with a shelf of toys above (the most abstract of the six) |
| icons/trophy.png | 1024² | 01a17a7e-be0e-7285-9048-27f40234e841 | blue-glass trophy with gold trim |
| icons/wrench-gear.png | 1024² | 01a17a7e-c9cb-7199-b62c-4bc7ea22f759 | |
| icons/rocket.png | 1024² | 01a17a7e-d519-71f6-a4ad-15becd603c1a | |
| icons/shopping-bag.png | 1024² | 01a17a7e-e134-762f-8462-30a08dacf832 | |
| icons/graduation-cap.png | 1024² | 01a17a7e-ecee-7593-9c10-cb1ab49f9647 | a black cap next to a small glass tile |
| icons/factory.png | 1024² | 01a17a7e-f8a8-77a6-867d-47fd3021ee97 | |
| icons/medal.png | 1024² | 01a17a7f-0470-76d5-acba-69e47be4b3b5 | glass medal on a ribbon |
| glow/sparkle.png | 1024² | 01a17a7f-0fb4-779e-afaa-4495d5fe064d | four-point white/cyan sparkle on black |
| glow/halo-ring.png | 1024² | 01a17a7f-1bd9-71b4-8989-b35d9cddb62e | thin cyan ring on black |
The icons are all-blue-glass with gold trim, so the trophy and medal are glass rather than solid gold.

## C. props/ — concept (props/concept/<name>.png) → image-to-3D, facing +Z, ~1.9 m bounding box (scale in placement)
| file | tris | KB | image-to-3D task id | what |
|---|---|---|---|---|
| holo-board.glb | 2,440 | 482 | 01a17a7f-2766-76cc-8171-811a7d6c4088 | white frame on two legs with cyan trim around a flat dark screen face (put game art on that face) |
| lamp.glb | 1,429 | 359 | 01a17a7f-32f9-734c-86f3-670f6eced618 | slim white post with a mint ring head and a gold foot |
| bench.glb | 2,557 | 520 | 01a17a7f-3f1d-72fc-8336-a91775e57e07 | split round white bench with gold trim around a pot with a green bush |
| tree-pot.glb | 2,595 | 547 | 01a17a7f-4b52-702d-b5dc-b3ab19644de5 | round mint-and-pink faceted tree in a white pot |
| toy-cubes.glb | 1,511 | 486 | 01a17a7f-56fa-7155-bf90-c0bc70a5b3fe | five pastel toy cubes with gold triangles (one joined mesh; animate the float in code) |
| trophy-statue.glb | 9,911 | 1,495 | 01a17a81-12d2-7760-8ae9-4fe92eec9eaa | gold robot holding a star up, on a white/cyan striped plinth (concept redone: the first robot was white) |
| landmark.glb | 7,838 | 813 | 01a17a7f-627e-7547-9c7b-ecfdaffcecdd | giant yellow pencil crossed with a white controller on an octagonal cream base |
Concept task ids: holo-board 01a17a7d-a6b5…, lamp 01a17a7d-b2ef…, bench 01a17a7d-be32…, tree-pot 01a17a7d-c9e4…,
toy-cubes 01a17a7d-d60e…, landmark 01a17a7d-edaf…, trophy-statue 01a17a7e-a691… (full ids in tools/meshy-out/log.jsonl).
