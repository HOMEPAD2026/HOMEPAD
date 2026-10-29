# ARCIRCLE KART — raw Meshy art

Raw, unpacked assets for `world-kart.js` (Nexus Circuit). They still need the town packer (Draco + KTX2) before they go in the game.
Made with `node tools/meshy.mjs`. Every GLB has one material with one 1024×1024 JPEG base-colour texture (Meshy's 2048 px output, downsized locally). Models come out of Meshy normalised to about 1.9 units on their longest axis, so scale them in the game (for example, arch → 16 m road).

## Models (`models/`)

| file | Meshy task (final) | source task | tris | size |
|---|---|---|---|---|
| kart.glb | text-to-3d refine `01a18988-184d-77fa-bd98-ae19d1873b05` | preview `01a18987-46ab-7611-8c95-9523e17a61ff` | 4,898 | 579 KB |
| kart-cyan.glb | retexture `01a1898a-59c1-7272-9e5f-086a740eeee2` | kart refine | 4,898 | 583 KB |
| kart-pink.glb | retexture `01a1898a-59c3-75d7-8be7-cf8a8b6b87d7` | kart refine | 4,898 | 574 KB |
| kart-violet.glb | retexture `01a1898a-59c2-7769-9924-58089059e4d3` | kart refine | 4,898 | 584 KB |
| arch.glb | text-to-3d refine `01a18987-dbcb-76c6-8603-8a9443aa05f9` | preview `01a18987-464e-7437-87be-64fc5754fe3e` | 2,691 | 356 KB |
| gantry.glb | retexture `01a1898a-59c2-74e5-914d-ee71e4fbdc8a` | refine `01a18987-dab0-720c-a8b7-d06daba7b3e5` | 5,175 | 519 KB |
| barrier.glb | text-to-3d refine `01a18987-c8b9-77fd-9270-365495b45093` | preview `01a18987-464e-76d4-99d0-fe271b6852e7` | 1,052 | 125 KB |
| tower.glb | text-to-3d refine `01a18987-c94b-73af-872a-4b92570d93ca` | preview `01a18987-464e-7273-ac95-f5c38b4356f3` | 2,499 | 392 KB |
| boostpad.glb | retexture `01a1898a-59c2-71f4-aed5-e4937e3d4648` | refine `01a18987-db59-73e5-a1c4-abd0111f2109` | 667 | 179 KB |

Notes
- Triangle counts were set by text-to-3d's own remesh (`target_polycount` with `should_remesh`), so no separate remesh task was needed. Arch, tower, barrier and boostpad came out below their targets but within budget.
- kart: an open seat sits in the middle for the hero, with 4 chunky wheels and a rear nozzle. The colour variants reuse the same mesh and UVs (`enable_original_uv`).
- gantry: Meshy modelled a "START" sign into the beam. I removed it by hand: the letter relief is flattened into the sign face, and the sign's UVs and normals point at one plain cyan texel, so the sign is now a blank cyan light panel. I tried one regeneration without the sign (`01a1898c-3a7f-71af-bcd4-f5f7d65b4518`), but it no longer spanned the road, so I dropped it.
- boostpad: the top shows a cyan X / diamond pattern, not real chevrons. A regeneration aimed at chevrons (`01a1898c-64e4-7222-b1f6-797c4679add1`) came out as an upright panel, so I dropped it. Lay `img/boost.webp` (additive) on the pad if chevrons are needed.

## Images (`img/`)

| file | Meshy task | size |
|---|---|---|
| road.webp | text-to-image `01a18988-81ca-747a-a34c-15a6455cec51` | 1024×1024, 152 KB |
| boost.webp | text-to-image `01a18987-7b2b-7519-ac81-3abc2804db20` | 512×512, 4 KB |
| sky.webp | text-to-image `01a18987-e764-73ed-9e06-50ecdd377600` | 2048×1024, 145 KB |
| key.webp | text-to-image `01a18987-7b2c-75e0-ad0e-ae276cec3ea2` | 1344×768, 50 KB |

Notes
- road: Meshy put a light border around the image. I trimmed it and made the texture seamless locally (half-offset cross-blend). The first attempt (`01a18987-7b15-…`) had a grey frame, and a second (`01a18987-e7d1-…`) was refused by Meshy's safety filter for no clear reason.
- sky: Meshy returns 16:9 (1344×768), so I centre-cropped it to 2:1 and upscaled it to 2048×1024. The first version (`01a18987-7b39-…`) had a dome over the city and was replaced.
- boost: pure black background with cyan chevrons pointing up (+V), ready for additive blending.
