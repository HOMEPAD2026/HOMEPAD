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

## Notes

Animation library ids used: 4 Attack, 219 Right_Hand_Sword_Slash, 125 Charged_Spell_Cast, 178 Hit_Reaction, 8 Dead. Walk (`walking_man`) and run (`running`) come with each rig. The treant got no extra clips (none were asked for it).
