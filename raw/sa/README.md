# ARCIRCLE Studio asset store — Meshy models (raw)

15 models for the Studio's 3D Builder, 5 categories × 3 (the first of each is free, the other two premium).
Made with `tools/meshy.mjs` (text-to-3D preview → refine, Meshy's remesh to the triangle budget; characters rigged as
humanoids with Meshy and given Meshy animations). Style: bright stylized toy-like game asset, soft colours, cyan / mint
accents, no text or logos.

- `models/<id>.glb` — one GLB each. Textures downsized from Meshy's 2048 px to 1024 px JPEG. Each model sits on y = 0,
  centred in x / z (characters keep Meshy's rig origin, feet at 0).
- Premium models were refined with PBR (base colour + metal/rough + normal maps) and get a little glow: an emissive map
  cut from the bright, saturated parts of the base colour (emissiveFactor 1).
- Characters carry the clips **Idle, Walk, Run, Wave** (Meshy actions: Idle = 0, Walk / Run = the rig's basic walking /
  running, Wave = 290 `Wave_One_Hand`); the rig's one-frame bind clip was dropped.
- `thumb/<id>.png` — Meshy's preview thumbnail of the refine task, 512 × 512 on white.
- Not packed yet (no Draco / KTX2): the game's packer does that before it ships.

| id | category | tier | Meshy task ids | triangles | size | clips |
|---|---|---|---|---:|---:|---|
| `char-robot` | character | free | preview 01a189ba-8734-724e-8d53-4a982b283098, refine 01a189bb-44d0-707f-9b03-4511114ce185, rig 01a189bc-490b-7351-a87b-e40d3abf52a4, idle 01a189bc-8292-7039-8993-0d4c13659b8c, wave 01a189bc-99bd-745d-98ac-28a14da09f14 | 7,269 | 1.01 MB | Idle, Walk, Run, Wave |
| `char-samurai` | character | premium | preview 01a189ba-8f0a-7057-ac67-38671fe6f412, refine 01a189bb-383d-7436-a7da-67af24bdb717, rig 01a189bd-69d4-7515-b63f-e13fc734511e, idle 01a189bd-de6b-719b-903e-f333734595df, wave 01a189be-3281-7618-889c-56adae4c0034 | 7,763 | 1.65 MB | Idle, Walk, Run, Wave |
| `char-astronaut` | character | premium | preview 01a189ba-96c8-7318-bb65-49306f30ae9e, refine 01a189bb-4231-71fe-a73a-b6eb08e1ab4c, rig 01a189bd-69d1-768d-adfa-7a5b3ed27130, idle 01a189bd-ccdd-73ec-ae8a-7763310aa1f0, wave 01a189be-21d0-777e-977e-a18a0a2bad63 | 7,645 | 1.66 MB | Idle, Walk, Run, Wave |
| `bld-cottage` | building | free | preview 01a189ba-9ea6-74cc-acec-ef9a2e27fc8b, refine 01a189bc-146d-74c3-8595-8b8be9941001 | 8,293 | 0.76 MB | — |
| `bld-arcade` | building | premium | preview 01a189ba-a6b2-7422-b845-add67eaf4094, refine 01a189bb-51b6-76d5-bd44-64509fe926d7 | 8,028 | 1.01 MB | — |
| `bld-castle` | building | premium | preview 01a189ba-ae74-70f1-9d94-fa1d255321d6, refine 01a189bb-9823-7335-95b9-50c7c6d5ffbd | 11,079 | 1.04 MB | — |
| `nat-oak` | nature | free | preview 01a189ba-b636-719f-bded-82465b60fd2e, refine 01a189bc-90ac-727d-bdf0-49359faa7fe5 | 5,996 | 0.59 MB | — |
| `nat-sakura` | nature | premium | preview 01a189bf-4756-723b-981a-669a76398550, refine 01a189c1-a890-70a6-bf35-4e50e95442f5 | 6,171 | 1.04 MB | — |
| `nat-mushrooms` | nature | premium | preview 01a189bf-46e7-728d-8e26-d79f423dc0f3, refine 01a189c0-3bda-72d3-954d-c70741f559fd | 7,807 | 0.83 MB | — |
| `bg-island` | background | free | preview 01a189bf-474c-777e-b489-396308ff1d97, refine 01a189c1-a9c7-7793-8f2a-0321c37d9f99 | 10,106 | 0.94 MB | — |
| `bg-skyline` | background | premium | preview 01a189ba-d599-75fe-aea6-7bf91df69ab2, refine 01a189bc-0b48-7318-8f1a-f6fc73ec4b4e | 8,290 | 1.05 MB | — |
| `bg-volcano` | background | premium | preview 01a189bf-4759-75ed-8847-f016001f0f0b, refine 01a189bf-ed60-748c-9eda-5ba1daec9ee5 | 11,503 | 1.00 MB | — |
| `st-bridge` | structure | free | preview 01a189ba-e53e-744d-a6fe-651cae1c1ee5, refine 01a189bb-a3cc-768c-b6b5-a5908b9496f9 | 4,825 | 0.57 MB | — |
| `st-portal` | structure | premium | preview 01a189ba-ed09-71fe-a725-6474c4828831, refine 01a189bb-aced-7793-b353-8fd21469d6a0 | 7,659 | 0.93 MB | — |
| `st-lighthouse` | structure | premium | preview 01a189ba-f4de-70cb-b21c-5f162e0ac2bf, refine 01a189bb-9d8f-73c0-be7d-9f5f1866007c | 7,680 | 0.94 MB | — |

Notes: `nat-sakura`, `bg-volcano`, `nat-mushrooms` and `bg-island` were made twice: the first texture prompt pushed them
all to cyan (a cyan sakura, cyan lava), so they were redone with colour-specific texture prompts; the ids above are the
kept versions. No Meshy call failed.
