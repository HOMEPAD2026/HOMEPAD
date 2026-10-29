# ARCIRCLE KART — raw Meshy art

Raw, unpacked assets for `world-kart.js` (Nexus Circuit). They still need the town packer (Draco + KTX2) before they go in the game.
Made with `node tools/meshy.mjs`. Every GLB has one material with one 1024×1024 JPEG base-colour texture (Meshy's 2048 px output, downsized locally). Models come out of Meshy normalised to about 1.9 units on their longest axis, so scale them in the game (for example, arch → 16 m road).

## Models (`models/`)

| file | Meshy task (final) | source task | tris | size |
|---|---|---|---|---|
| kart.glb | text-to-3d refine `01a18988-184d-77fa-bd98-ae19d1873b05` | preview `01a18987-46ab-7611-8c95-9523e17a61ff` | 4,898 | 579 KB |
| arch.glb | text-to-3d refine `01a18987-dbcb-76c6-8603-8a9443aa05f9` | preview `01a18987-464e-7437-87be-64fc5754fe3e` | 2,691 | 356 KB |
| gantry.glb | retexture `01a1898a-59c2-74e5-914d-ee71e4fbdc8a` | refine `01a18987-dab0-720c-a8b7-d06daba7b3e5` | 5,175 | 519 KB |
| barrier.glb | text-to-3d refine `01a18987-c8b9-77fd-9270-365495b45093` | preview `01a18987-464e-76d4-99d0-fe271b6852e7` | 1,052 | 125 KB |
| tower.glb | text-to-3d refine `01a18987-c94b-73af-872a-4b92570d93ca` | preview `01a18987-464e-7273-ac95-f5c38b4356f3` | 2,499 | 392 KB |
| boostpad.glb | retexture `01a1898a-59c2-71f4-aed5-e4937e3d4648` | refine `01a18987-db59-73e5-a1c4-abd0111f2109` | 667 | 179 KB |

Notes
- Triangle counts were set by text-to-3d's own remesh (`target_polycount` with `should_remesh`), so no separate remesh task was needed. Arch, tower, barrier and boostpad came out below their targets but within budget.
- kart: an open seat sits in the middle for the hero, with 4 chunky wheels and a rear nozzle. The nose is at −X and the seat back at +X. `kart.glb` is the plain white base; each racer's kart (below) is a retexture of it, so they all share the same mesh and UVs. The earlier cyan / pink / violet variants were dropped, because the racers' karts replace them.
- gantry: Meshy modelled a "START" sign into the beam. I removed it by hand: the letter relief is flattened into the sign face, and the sign's UVs and normals point at one plain cyan texel, so the sign is now a blank cyan light panel. I tried one regeneration without the sign (`01a1898c-3a7f-71af-bcd4-f5f7d65b4518`), but it no longer spanned the road, so I dropped it.
- boostpad: the top shows a cyan X / diamond pattern, not real chevrons. A regeneration aimed at chevrons (`01a1898c-64e4-7222-b1f6-797c4679add1`) came out as an upright panel, so I dropped it. Lay `img/boost.webp` (additive) on the pad if chevrons are needed.

## The five racers (CRYPTO LEGENDS)

References are on `claude/meshy-kart-ref` (`raw/kart/ref/`: kart-cast.jpg plus one crop per racer). They aren't committed on this branch.
Pipeline per racer: `img2img` (the racer's crop + kart-cast.jpg) → an A-pose sheet on light grey (2 tries each; the best kept as `img/char-<id>.png`) → image-to-3D → remesh to ~7 k triangles → Meshy rigging (humanoid, height 1.0) → one animations task with every clip (`action_ids`) → textures downsized to 1024 px JPEG.

| racer | sheet `img/char-<id>.png` (img2img) | image-to-3D | remesh → `char-<id>.glb` | rigging | animations → `char-<id>-rig.glb` | tris | static / rig size |
|---|---|---|---|---|---|---|---|
| PEPE | `01a18990-838c-75f0-999f-5d54c0131a6a` (try 1 of 2) | `01a18991-0ae9-71ab-adea-e8a220dd2bd6` | `01a18993-5a9b-7744-a9fd-ec9d50c34a09` | `01a18994-1276-73dc-a0c2-48fe0f66e5dc` | `01a18996-bc80-730f-8a23-ce900d149d03` | 7,337 | 629 KB / 1.42 MB |
| DOGE | `01a18990-8383-7072-b83c-d3700f0bbc38` (try 1) | `01a18991-0afc-7370-9b01-2d9e777d0caa` | `01a18993-5a89-77b4-9d16-c6be13621d7d` | `01a18994-1300-7651-8f9b-687dc0414360` | `01a18996-bc7a-76b3-857e-c2f017caea22` | 7,269 | 690 KB / 1.43 MB |
| PENGU | `01a18990-8383-7375-a382-f11bebc60eb3` (try 1) | `01a18991-0abb-73f6-9972-9504e738fb62` | `01a18993-5a9d-7260-91cd-813b2bb0a5e8` | `01a18994-1333-75d7-9433-7ddeef8f9434` | `01a18996-bc7e-72cf-bdf6-3385c8b50bce` | 7,017 | 662 KB / 1.43 MB |
| WIF | `01a18990-8388-74dc-b4e0-eb0fc86fbc8a` (try 2) | `01a18991-0b05-7259-822b-e9807aa92568` | `01a18993-5aa2-7660-b0da-35c940787abc` | `01a18994-2670-7143-b656-9a1775e37e56` | `01a18996-bc90-73ef-9351-168f16e04037` | 7,344 | 709 KB / 1.46 MB |
| BONK | `01a18990-8391-7729-8e8b-1b3fa17f1bdb` (try 1) | `01a18991-0aef-762a-a6ce-c2c201d1f83c` | `01a18992-52cf-714e-9159-87eb83828a34` | `01a18993-1080-766d-8768-2842c15a3388` | `01a18996-bc8f-70b6-815b-a052e48939c6` | 7,341 | 596 KB / 1.32 MB |

Each `char-<id>-rig.glb` is one skinned mesh (24 joints, Meshy's humanoid armature) with these clips. Clip name = Meshy library action:

| clip name in the file | action id | use |
|---|---|---|
| `Idle` | 0 | idle |
| `Chair_Sit_Idle_M` | 33 | sit / drive (seated; the library has no hands-on-wheel clip, so the hands rest) |
| `Seated_Fist_Pump` | 304 | a seated win (fist pump while driving / on crossing the line) |
| `Victory_Cheer` | 59 | cheer / victory |
| `Big_Wave_Hello` | 28 | wave |
| `Half_Squat_with_Thumb_Up` | 387 | thumbs up (PEPE only) |
| `Head_Hold_in_Pain` | 391 | sad / lose (the library has no "sad" clip; this one reads as dismay) |
| `Shrug` | 317 | a lighter lose / "oh well" |
| `Casual_Walk` | 30 | walk |
| `penguin_walk` | 62 | PENGU only, a waddle |

Rigging also returned walking / running clips as separate files (tools/meshy-out, not committed); the walk is in the rig file as `Casual_Walk`. Every racer rigged without trouble, PENGU and PEPE's frog shape included. I checked the clips in a render: the seated, cheer, wave and head-hold poses deform cleanly. The static `char-<id>.glb` files are the same remeshed bodies without the rig. Meshy scales the rig to about 1 unit tall.

### The racers' karts (`kart-<id>.glb`, retextures of the kart refine `01a18988-184d-77fa-bd98-ae19d1873b05`)

| file | retexture task | look | tris | size |
|---|---|---|---|---|
| kart-pepe.glb | `01a18991-5528-71c1-9ae1-2022cf82aa97` | lime green / black | 4,900 | 591 KB |
| kart-doge.glb | `01a18993-10e6-76f0-9326-cdcf1ecace98` (2nd try; the 1st, `01a18991-55c4-…`, was orange) | yellow / black | 4,900 | 605 KB |
| kart-pengu.glb | `01a18993-10ea-7637-83c2-5a828c79d518` (2nd try; the 1st, `01a18991-553a-…`, had the word "infinity" painted on) | white / blue, blue glass | 4,900 | 689 KB |
| kart-wif.glb | `01a18993-10fb-77bf-bbc8-9e9ee0661065` (2nd try) | pink / white, paw print on the nose | 4,900 | 655 KB |
| kart-bonk.glb | `01a18991-5570-75b1-9fe7-0fd4a777ad7c` (1st try; it has more flames than the 2nd, `01a18993-10e3-…`) | orange with flames | 4,900 | 575 KB |

Meshy wouldn't paint a clean ∞ on the nose reliably, so every racer's kart has the same added decal: a node `nose-infinity` (2 triangles, material `infinity-glow`: a 512×256 PNG ∞ as base colour + emissive, alpha blend) on the nose wedge. On WIF it sits higher and smaller (centre x −0.47, ×0.75) so the paw print shows below it. PEPE's kart also has Meshy's own small painted ∞ under the decal.

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
- logo.png (841×344): img2img `01a18990-8390-729a-9c17-62267e1fdc71` from kart-cast.jpg. The same ∞ / ARCIRCLE / KART / CRYPTO LEGENDS RACING lettering on flat green (≈ #76C050, not pure #00FF00, but even, so it keys by hue), trimmed to the logo with a 24 px green border.
- char-<id>.png (1024×1024, PNG): the racers' A-pose sheets on light grey; see the racers table.
- boost: pure black background with cyan chevrons pointing up (+V), ready for additive blending.
