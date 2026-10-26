# raw/nx3 — Meshy batch for ARCIRCLE WORLD (raw files, not packed)

Everything here is straight from Meshy (`tools/meshy.mjs`) plus plain crops/resizes. Nothing is packed:
GLBs are raw (uncompressed textures, ~2–4 MB each) and PNGs are full size. Pack before use.
Task ids for every call are in `tools/meshy-out/log.jsonl` (local, git-ignored) of the worker session.

**Credits ran out (915 → 0).** Done: groups 1–7, 9, 10, 11 in full; group 8 (landmarks) only partly —
2 of 12 models, but all 12 have a concept picture ready for `image3d` when credits come back.

Background notes for all "on green" pictures: Meshy does not give a pure `#00ff00`. Backgrounds are a
flat-ish lime/sage green (e.g. `rgb(191,253,123)`, some with a soft vignette or a slightly different tint
per quarter of a sheet). Key by hue with a tolerance, not by exact colour.

## 1. ground/ — seamless 1024×1024 textures
| file | what |
|---|---|
| grass-flowers.png | lush grass with tiny white/yellow flowers |
| grass-clover.png | grass with clover + small pebbles (has a visible 4×4 internal repeat) |
| stone-cobbles.png | light warm-grey rounded cobbles (fairly regular grid) |
| plaza-paving.png | pale cream paving with thin cyan lines — the slabs came out small, reads a bit like graph paper; scale the UVs up |
| dirt-sand.png | soft sandy dirt with pebbles |

## 2. plaza-remaster/ — img2img target mock-ups (1024×1024)
| file | what |
|---|---|
| plaza-desk-remaster.png | remaster of refs/nx3/plaza-desk.png |
| plaza-phone-remaster.png | remaster of refs/nx3/plaza-phone.png |

img2img can't set an aspect ratio, so both are square (the source composition is squeezed/re-framed into it).

## 3. props/ — text-to-3D
| file | tris | note |
|---|---|---|
| street-lamp.glb | 4038 | white post, cyan glowing globe head (made with `--style sculpture`: slightly pale) |
| park-bench.glb | 3414 | white slats, light-blue legs |
| flower-planter.glb | 4508 | round stone bowl with pink/yellow flowers |
| banner-pole.glb | 3319 | white pole, plain blue flag (a flag, not a long hanging banner) |
| hedge-block.glb | 1757 | retry — first try was broken (loose leaf shards); this one is a solid rounded block |
| goods-crate.glb | 5167 | wooden crate with apples, bottles, bread |
| signpost.glb | 2782 | wooden post, three blank arrow boards |

## 4. trees/ — models + 512px far pictures (on green)
| file | tris | note |
|---|---|---|
| tree-round.glb | 3658 | made by `image3d` from tree-round-far.png (text-to-3D failed once server-side, then gave a poor shard canopy) — best of the set |
| tree-pine.glb | 2879 | thin and sparse, darker than wanted; would be better redone with `image3d tree-pine-far.png` (no credits left) |
| tree-blossom.glb | 3986 | pink faceted canopy |
| bush-cluster.glb | 1489 | three round bushes |
| *-far.png | 512² | four stand-in pictures, cut from one 2×2 sheet; the pictures are softer/rounder than the models |

## 5. portals/ — text-to-3D, ~8k
| file | tris | note |
|---|---|---|
| portal-partnership.glb | 8084 | ring on round stepped base; reads silver + teal with a little gold; handshake emblem is not clearly visible |
| portal-arcade.glb | 8157 | purple frame on base, but the swirl inside came out **pink**, not cyan; no clear controller emblem |
Neither is as rich as refs/nx3/portal-launchpad.glb (12k, more spires and banners).

## 6. maker/
| file | size | note |
|---|---|---|
| hologram-podium.glb | 4247 tris | white tiered disc with a cyan light strip at the base (glow is modest; add emissive in-game) |
| bg-aron-cyan.png | 1920×1080 | cyan glass studio, empty round floor in centre |
| bg-lumi-pink.png | 1920×1080 | pink/pastel version |
| bg-nex-violet.png | 1920×1080 | violet faceted-glass version |
Backgrounds were generated at 1344×768 and upscaled (Lanczos) to 1920×1080 — fine for soft-focus, not pixel-sharp.

## 7. scammers/ — image → 3D, ≤5k
Each was drawn first (`concept/<name>.png`, 1024², grey background) and turned into 3D with `image3d`.
| file | tris | rig / animations |
|---|---|---|
| spam-bot.glb | 5060 | static (floating, non-humanoid) |
| fake-airdrop.glb | 4938 | static (crate) |
| rug-gremlin.glb | 5063 | **rigged**: rug-gremlin-rigged.glb (0.9 m), -walk, -run (animation-only armature files, 288-tri proxy), -attack (Kung_Fu_Punch, 7.3 s — long, trim it), -death (Dead, 3.0 s) |
| phishing-angler.glb | 5201 | static (fish) |
| pump-balloon.glb | 5104 | static (balloon) |
| bot-farm-drone.glb | 5182 | **rigged**: bot-farm-drone-rigged.glb (1.0 m), -walk, -run, -attack (Attack, 2.8 s), -death (Dead, 3.0 s) |
Rigging was only tried on the two bipeds; the four floating/blob ones are not humanoid and were left static
(bob/spin them in code). The attack/death files are full skinned models with one clip each.

## 8. landmarks/ — partial (credits ran out)
| file | tris | note |
|---|---|---|
| spam-alley.glb | 8091 | `image3d` from concept — tower of pink/white envelopes |
| airdrop-fields.glb | 7735 | `image3d` from concept — crate monument under a red/white parachute |
| concept/*.png | 1024² | all 12 landmarks drawn on light grey: spam-alley, airdrop-fields, honeypot-swamp, rug-canyon, dark-market-depths, ponzi-peaks, exit-scam-desert, phishing-reef, bot-farm-wastes (came out as a broken robot with a dome, not a silo), fake-exchange-ruins, bridge-hack-abyss, the-last-rug |
**Missing models (10):** honeypot-swamp … the-last-rug. To finish: `node tools/meshy.mjs image3d raw/nx3/landmarks/concept/<name>.png --polys 8000 --out raw/nx3/landmarks/<name>.glb` (~30 credits each).

## 9. codex/ — 30 item pictures, 512×512, on green
`<slot>-<tier>.png`, slot ∈ shield, armor, helm, ring, boots, necklace; tier 0 Starter, 1 Cold Wallet, 2 Multisig,
3 Vault, 4 Arc. Made as 2×2 sheets (in `codex/sheets/`) and cut into quarters — each tier's shield/armor/helm/ring share one
sheet so the tier look is consistent. boots-4 / necklace-4 came from a 16:9 pair sheet (cropped + resized to 512).
Notes: the first Multisig/Vault boots+necklace sheet had text labels on it and was redone (bn23b); Cold Wallet was
redone because its background was too blue to key against the icy items. A few items carry tiny decorative glyphs
(armor-2 has a small "E"-like mark, helm-4 a small emblem). Items are not perfectly centred in every cell.

## 10. icons/ — 512×512, on green
| file | what |
|---|---|
| attack.png | sword crossing a cyan slash, on a glossy rounded-square blue button |
| jump.png | upward arrow with small white wings, nothing written on it |
| dodge.png | arrow with speed streaks |
| spare-star.png | extra glossy star button (filled the 4th cell of the sheet) |
| sheet.png | the source 2×2 sheet |
All four come with a rounded-square button backing (blue/teal glossy), not bare symbols. Lock-on skipped as asked.

## 11. arena/ — seamless 1024×1024 floor textures
| file | what |
|---|---|
| cyber-city.png | dark navy tiles with cyan circuit lines |
| volcano.png | cracked dark rock with glowing orange lava seams |
| ice.png | frosted pale-blue ice, white cracks, snow patches (redone: first try had a grey frame and wasn't tileable) |
