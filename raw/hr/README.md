# raw/hr — Halloween Realm raw Meshy output

Raw files from Meshy (2026-10-28), not packed: pack them (Draco + KTX2, ≤ 1024 px textures, triangle budgets) before they go in the game.
Look asked for every asset: bright cute stylized 3D, orange / purple / black Halloween palette with cyan / mint glow, `--pbr`.
Tris are counted from the GLB; "rig" = the file has a skin. Animation names are the clip names inside each GLB.
Each animated GLB holds the full skinned mesh + one clip; the same skeleton is used across one monster's files (`*-rigged.glb` holds only a bind clip `clip0`).

| File | Tris | Size | Rig | Clips | Meshy task ids |
|---|---|---|---|---|---|
| hw-gate.glb | 20784 | 6.8 MB | no | — | preview 01a18216-1205-73b3-ae0b-2cfc6540c2f7 · refine 01a18216-fcb1-75e2-8bdd-91af874c2437 |
| hw-house.glb | 8129 | 6.3 MB | no | — | preview 01a18217-c3c0-73e7-bc68-14a9f456ac32 · refine 01a18218-faf8-775b-b32b-8a80a0282f29 |
| hw-shop.glb | 8003 | 6.9 MB | no | — | preview 01a18217-c41f-703d-8cc2-4e74261bf171 · refine 01a18218-d4fd-7013-9609-6e4d2ac8858b |
| hw-forge.glb | 8337 | 5.5 MB | no | — | preview 01a18217-c446-7561-9aba-cb0ba528d0c7 · refine 01a18218-967b-7061-9f18-34d3960e9bf4 |
| hw-tree.glb | 5173 | 7.5 MB | no | — | preview 01a18217-c42d-73ba-a981-e6c021bb50b4 · refine 01a18218-6e4d-7695-a207-61f5b57d2d36 |
| hw-tomb.glb | 2942 | 7.3 MB | no | — | preview 01a18217-c421-74b3-be6c-51e0288c0f66 · refine 01a1821a-26e8-734e-937d-0e9511b32fcd |
| hw-lantern.glb | 3104 | 6.0 MB | no | — | preview 01a1821b-2f4f-72cc-9853-77a77169b470 · refine 01a1821b-d86d-728f-bf06-5e3bc94a092d |
| hw-factory.glb | 20568 | 7.5 MB | no | — | preview 01a1821b-2f7b-7446-9e15-e94a80482ba5 · refine 01a1821b-fff3-77d9-9296-e56b1b50a4be |
| hw-clock.glb | 19756 | 8.4 MB | no | — | preview 01a1821b-2f2a-70a8-aae8-5e9a9f0718aa · refine 01a1821c-2d8e-70bb-b7f0-5fc2143b65f9 |
| hw-throne.glb | 20666 | 7.6 MB | no | — | preview 01a1821b-2f78-7632-8da8-41e909397238 · refine 01a1821c-3de8-7516-ad93-3356b233df8c |
| hw-chest.glb | 3061 | 5.5 MB | no | — | preview 01a1821b-2f10-772a-96cd-a8827e66625e · refine 01a1821c-2928-77a7-9f72-fc13e8c88621 |
| hw-slime.glb | 5236 | 4.5 MB | no | — | preview 01a18218-5e62-775b-8bf9-b06a29fffba9 · refine 01a18219-2f84-7060-a4ef-4aac2e1db175 |
| hw-ghost.glb | 5132 | 4.7 MB | no | — | preview 01a18218-5dfa-7719-a4bb-c83dcade7289 · refine 01a18219-4266-722d-a12d-a8a76c835526 |
| hw-scarecrow.glb | 5093 | 8.1 MB | no | — | preview 01a18218-5e4e-76fc-9cf6-311ffe867579 · refine 01a18219-9224-740f-b3da-ef93a1b4fe92 |
| hw-treant.glb | 5205 | 5.8 MB | no | — | preview 01a18218-5df4-72e5-9cb9-814f75ee64c1 · refine 01a18219-2de9-744b-a3d6-a2ae4b193154 |
| hw-skeleton.glb | 5175 | 7.6 MB | no | — | preview 01a18218-5dfb-7552-802c-fd3e01475884 · refine 01a18219-42e0-777f-9a63-7ad6462b830f |
| hw-witch.glb | 5173 | 6.5 MB | no | — | preview 01a18218-5e6c-7649-8ddf-779fee27aa55 · refine 01a18219-314e-7172-b464-9314c4ef0b91 |
| hw-blade.glb | 5891 | 7.1 MB | no | — | preview 01a1821d-99c1-75e2-b625-05a0a371e3b5 · refine 01a1821e-3290-73b1-821a-150e518f39b8 |
| hw-armor.glb | 6212 | 6.1 MB | no | — | preview 01a1821d-99e6-7055-90af-b0e2e0a265a1 · refine 01a1821e-93c0-7032-8282-1c46dc3304f8 |
| hw-crown.glb | 6253 | 4.9 MB | no | — | preview 01a1821d-998c-713a-b299-8fbd3126c17b · refine 01a1821e-7e6d-7322-9e68-f6c693bcfac3 |
| hw-ring.glb | 6067 | 5.0 MB | no | — | preview 01a1821d-99fb-7403-b1b8-e7908bf0b7b8 · refine 01a1821e-5931-703c-b4ec-5f8ac29448cd |
| hw-pendant.glb | 6207 | 6.1 MB | no | — | preview 01a1821d-99f4-76c3-aa47-f6d34327c0ee · refine 01a1821e-8038-74e3-90df-bd59e09c63cd |
| hw-boots.glb | 6174 | 6.5 MB | no | — | preview 01a1821d-998d-77dd-ac25-530b40f428da · refine 01a1821e-a71f-71fb-aa60-f04157d4d24c |
| hw-scarecrow-rigged.glb | 5093 | 8.6 MB | yes | `Armature\|clip0\|baselayer` | rigging 01a1821a-4986-77ca-acda-c67cd5951e23 |
| hw-scarecrow-walk.glb | 5093 | 8.5 MB | yes | `Armature\|walking_man\|baselayer` | rigging 01a1821a-4986-77ca-acda-c67cd5951e23 (its basic walk/run) |
| hw-scarecrow-run.glb | 5093 | 8.5 MB | yes | `Armature\|running\|baselayer` | rigging 01a1821a-4986-77ca-acda-c67cd5951e23 (its basic walk/run) |
| hw-scarecrow-attack.glb | 5093 | 8.6 MB | yes | `Armature\|Attack\|baselayer` | animations 01a1821a-be50-74ee-bc2d-7c3f431d1912 (action 4, rig 01a1821a-4986-77ca-acda-c67cd5951e23) |
| hw-scarecrow-hit.glb | 5093 | 8.6 MB | yes | `Armature\|Hit_Reaction\|baselayer` | animations 01a1821a-ff38-7011-ab15-93e8c7cd0205 (action 178, rig 01a1821a-4986-77ca-acda-c67cd5951e23) |
| hw-scarecrow-death.glb | 5093 | 8.6 MB | yes | `Armature\|Dead\|baselayer` | animations 01a1821b-4010-70d2-8e2e-03ae8bd230f9 (action 8, rig 01a1821a-4986-77ca-acda-c67cd5951e23) |
| hw-treant-rigged.glb | 5205 | 6.2 MB | yes | `Armature\|clip0\|baselayer` | rigging 01a18219-d095-72c9-979c-2833cfdb0f4d |
| hw-treant-walk.glb | 5205 | 6.2 MB | yes | `Armature\|walking_man\|baselayer` | rigging 01a18219-d095-72c9-979c-2833cfdb0f4d (its basic walk/run) |
| hw-treant-run.glb | 5205 | 6.2 MB | yes | `Armature\|running\|baselayer` | rigging 01a18219-d095-72c9-979c-2833cfdb0f4d (its basic walk/run) |
| hw-skeleton-rigged.glb | 5175 | 8.1 MB | yes | `Armature\|clip0\|baselayer` | rigging 01a1821a-2321-76d4-8a72-efbf9440e8ed |
| hw-skeleton-walk.glb | 5175 | 8.0 MB | yes | `Armature\|walking_man\|baselayer` | rigging 01a1821a-2321-76d4-8a72-efbf9440e8ed (its basic walk/run) |
| hw-skeleton-run.glb | 5175 | 8.0 MB | yes | `Armature\|running\|baselayer` | rigging 01a1821a-2321-76d4-8a72-efbf9440e8ed (its basic walk/run) |
| hw-skeleton-attack.glb | 5175 | 8.0 MB | yes | `Armature\|Right_Hand_Sword_Slash\|baselayer` | animations 01a1821a-9867-7566-a9dd-ac3eccb538e2 (action 219, rig 01a1821a-2321-76d4-8a72-efbf9440e8ed) |
| hw-skeleton-hit.glb | 5175 | 8.1 MB | yes | `Armature\|Hit_Reaction\|baselayer` | animations 01a1821a-d8f6-7545-adf9-da23b2d74222 (action 178, rig 01a1821a-2321-76d4-8a72-efbf9440e8ed) |
| hw-skeleton-death.glb | 5175 | 8.1 MB | yes | `Armature\|Dead\|baselayer` | animations 01a1821b-18e6-74cc-b68e-93a7eb491b70 (action 8, rig 01a1821a-2321-76d4-8a72-efbf9440e8ed) |
| hw-witch-rigged.glb | 5173 | 7.0 MB | yes | `Armature\|clip0\|baselayer` | rigging 01a18219-fc09-71b4-88bf-0f3528405c7e |
| hw-witch-walk.glb | 5173 | 6.9 MB | yes | `Armature\|walking_man\|baselayer` | rigging 01a18219-fc09-71b4-88bf-0f3528405c7e (its basic walk/run) |
| hw-witch-run.glb | 5173 | 6.9 MB | yes | `Armature\|running\|baselayer` | rigging 01a18219-fc09-71b4-88bf-0f3528405c7e (its basic walk/run) |
| hw-witch-cast.glb | 5173 | 7.0 MB | yes | `Armature\|Charged_Spell_Cast\|baselayer` | animations 01a1821a-5aef-74cb-b348-b44a7e214ed5 (action 125, rig 01a18219-fc09-71b4-88bf-0f3528405c7e) |
| hw-witch-attack.glb | 5173 | 7.0 MB | yes | `Armature\|Attack\|baselayer` | animations 01a1821a-9b2d-7464-b14c-074607fe4b86 (action 4, rig 01a18219-fc09-71b4-88bf-0f3528405c7e) |
| hw-witch-hit.glb | 5173 | 6.9 MB | yes | `Armature\|Hit_Reaction\|baselayer` | animations 01a1821a-dba9-76ce-a925-93981d41a1f6 (action 178, rig 01a18219-fc09-71b4-88bf-0f3528405c7e) |
| hw-witch-death.glb | 5173 | 7.0 MB | yes | `Armature\|Dead\|baselayer` | animations 01a1821b-1b9b-700d-bc12-d17391cb00c4 (action 8, rig 01a18219-fc09-71b4-88bf-0f3528405c7e) |

## Images

| File | Size | Prompt | Meshy task id |
|---|---|---|---|
| hw-ic-blade.png | 0.2 MB | Inferno Blade game icon: a flaming pumpkin-orange sword, cute stylized 3D render, bright soft lighting, orange purple black Halloween palette with cyan glow accents, centered, on a pure flat solid #00ff00 green background, no text, no shadow on background | 01a1821f-52bc-7679-87ba-a04543a9104d |
| hw-ic-armor.png | 0.3 MB | Cursed Armor chest piece, orange and black, cute stylized 3D render game icon, bright soft lighting, orange purple black Halloween palette with cyan glow accents, single centered object, on a pure flat solid #00ff00 green background, no text, no shadow on background | 01a1821f-b33e-7203-8276-b4081f12b62c |
| hw-ic-crown.png | 0.3 MB | Jack's Crown, a pumpkin crown, cute stylized 3D render game icon, bright soft lighting, orange purple black Halloween palette with cyan glow accents, single centered object, on a pure flat solid #00ff00 green background, no text, no shadow on background | 01a1821f-b31e-7080-8c71-adbac87083aa |
| hw-ic-ring.png | 0.2 MB | Phantom Ring, a ghostly ring with a glowing cyan gem, cute stylized 3D render game icon, bright soft lighting, orange purple black Halloween palette with cyan glow accents, single centered object, on a pure flat solid #00ff00 green background, no text, no shadow on background | 01a1821f-b398-740e-ab43-2a364ea1e146 |
| hw-ic-pendant.png | 0.2 MB | Soul Pendant with a glowing pumpkin gem, cute stylized 3D render game icon, bright soft lighting, orange purple black Halloween palette with cyan glow accents, single centered object, on a pure flat solid #00ff00 green background, no text, no shadow on background | 01a1821f-b38e-7130-8c0b-41894fc1d82c |
| hw-ic-boots.png | 0.2 MB | Shadow Boots, dark purple and black boots with orange trim, cute stylized 3D render game icon, bright soft lighting, orange purple black Halloween palette with cyan glow accents, single centered object, on a pure flat solid #00ff00 green background, no text, no shadow on background | 01a1821f-b34a-7354-ad2a-974f8d08f967 |
| hw-key-wide.png | 1.8 MB | Wide game key art landscape: a cute Halloween pumpkin village with glowing jack-o'-lanterns and crooked little houses under a huge red moon, a cute round white-and-cyan robot hero in the foreground, bright cute stylized 3D, orange purple black palette with cyan and mint glow, full-bleed image filling the entire frame edge to edge, no circle, no frame, no border, no vignette, no transparency checkerboard, no text | 01a18220-68bd-776d-9f70-c2d2717ab209 |
| hw-key-tall.png | 1.6 MB | Halloween Realm, a pumpkin village under a red moon, cute stylized 3D, ARCIRCLE robot hero: a cute round white-and-cyan robot standing in front, bright stylized game key art, orange purple black palette with cyan and mint glow, no text, no logos, vertical composition | 01a1821f-b3a9-772b-85dd-b239c387b2b9 |
| hw-sky-night.png | 1.0 MB | Flat wide sky backdrop painting seen from the ground looking at the horizon: deep purple night sky, a big red moon, soft layered clouds, stars, no ground, no buildings, stylized, full-bleed image filling the entire frame edge to edge, no circle, no frame, no border, no vignette, no transparency checkerboard, no text | 01a18220-6898-7514-972a-86323dd43f02 |
| hw-sky-day.png | 1.2 MB | Flat wide sky backdrop painting seen from the ground looking at the horizon: warm orange Halloween dusk sky, a low sun glow, soft layered clouds, no ground, no buildings, stylized, full-bleed image filling the entire frame edge to edge, no circle, no frame, no border, no vignette, no transparency checkerboard, no text | 01a18220-6892-75d7-a147-bf61087654fa |
| hw-ground.png | 2.3 MB | seamless tileable autumn grass with fallen orange leaves, top-down, flat even lighting, stylized game texture, no perspective | 01a1821f-df7a-77a2-99ff-cc643509cf43 |
| hw-ground-grave.png | 1.6 MB | seamless tileable graveyard dirt with small stones, top-down, flat even lighting, stylized game texture, no perspective | 01a1821f-df42-748b-abf5-614dda01ed8e |
| hw-ground-candy.png | 1.4 MB | Seamless tileable texture, top-down orthographic: a floor of square purple candy tiles in a regular grid covering the whole square, glossy, flat even lighting, stylized game texture, full-bleed image filling the entire frame edge to edge, no circle, no frame, no border, no vignette, no transparency checkerboard, no text | 01a18220-68b5-70cb-89b2-886816cd8bf7 |

## Notes

Animation library ids used: 4 Attack, 219 Right_Hand_Sword_Slash, 125 Charged_Spell_Cast, 178 Hit_Reaction, 8 Dead. Walk (`walking_man`) and run (`running`) come with each rig. The treant got no extra clips (none were asked for it).

Images: the six gear icons are on flat #00ff00 green (key by hue), resized from 1024 to 512 px. Key art 1344×768 / 768×1344, skies 1344×768, grounds 1024×1024.

Retries: the first hw-key-wide came out inside a glowing circle, both skies came out as round 'planets' (the day one on a fake transparency checkerboard), and hw-ground-candy as a cluster of hex tiles on grey — all four were made again once with a 'full-bleed, no circle / frame' prompt (the second versions are the ones here). hw-ground was retried too, but the retry also had a grey border and looked less like ground, so the **first** version is kept: **it has a thin grey border (~2 %) — crop it before use; seamless tiling is not verified** for any of the three grounds. The skies are flat backdrops, not equirectangular panoramas.

Credits: 855 at the start; each text-to-3D (preview + PBR refine) cost 30, a rig 5 (walk + run included), an animation 3, an image 3; 61 left after this batch.
