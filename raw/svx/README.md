# raw/svx — Meshy assets for the SURVIVORS ARENA remaster (2026-11-05)

Raw Meshy outputs (nano-banana images, text-to-3D GLBs). Not packed yet — pack before use (Draco + KTX2, textures ≤ 1024 px; key the green #00FF00 backgrounds by hue; draw the black-background fx additively).

Notes:
- Meshy's text-to-image accepts only 1:1 16:9 9:16 4:3 3:4 3:2 2:3, so hud-panel (4:1), xp-bar / boss-bar (8:1) and the four buttons (3:1) were made at 16:9 with the frame centred on green — crop to the frame.
- PNGs over 1.5 MB were converted to WebP q85.
- Props: text-to-3D preview with remesh to the target polycount (should_remesh + target_polycount), then refine (texture). GLBs are raw (2–4 MB with textures).

| file | Meshy task id |
|---|---|
| raw/svx/art/key-tall.png | 01a1ab9e-7231-752a-94d3-74038d9d0322 |
| raw/svx/art/key-wide.webp | 01a1ab9e-6a92-7676-996a-b8007b592015 |
| raw/svx/floor/circle.png | 01a1ab9e-554e-7789-bc63-e7c1ece055cb |
| raw/svx/floor/desert.webp | 01a1ab9e-4b2d-7435-9f9e-02fed05a1f85 |
| raw/svx/floor/ice.png | 01a1ab9e-4d54-759c-bda2-ce49e61e16ac |
| raw/svx/floor/lava.webp | 01a1ab9e-4f99-73d3-8669-2ff8ccf9a317 |
| raw/svx/floor/neon.webp | 01a1ab9e-488a-74b3-a9d9-2e6010458929 |
| raw/svx/fx/boom.png | 01a1ab9e-6747-73a5-976b-e71f61008f85 |
| raw/svx/fx/boss-warn.png | 01a1ab9e-6a96-7411-ac59-68829a550352 |
| raw/svx/fx/chest-beam.png | 01a1ab9e-642e-744e-b211-171049c4f347 |
| raw/svx/fx/gem.png | 01a1ab9e-69e2-74ce-a92d-3377ee7c144d |
| raw/svx/fx/levelup.png | 01a1ab9e-62d0-716e-88c9-c0216aae7c12 |
| raw/svx/fx/slash.png | 01a1ab9e-646e-7228-870b-186e6db5d7c9 |
| raw/svx/icons/e-eclipse.png | 01a1ab9e-2472-74ee-bfc9-dfdee97303bb |
| raw/svx/icons/e-inferno.png | 01a1ab9e-12cd-707a-9744-95830b3bd412 |
| raw/svx/icons/e-legion.png | 01a1ab9e-1e05-7760-aad9-1622a3b8f740 |
| raw/svx/icons/e-star.png | 01a1ab9e-11d0-7614-858d-e0a3540c98c1 |
| raw/svx/icons/e-thunder.png | 01a1ab9e-1171-7065-bd99-48d3aaff10f4 |
| raw/svx/icons/e-zero.png | 01a1ab9e-16dc-71ca-a3a3-958d2e6ba5ce |
| raw/svx/icons/p-armor.png | 01a1ab9d-98b5-73bb-89df-e5b65bb47621 |
| raw/svx/icons/p-berserk.png | 01a1ab9e-0254-7065-ac08-29b993af4be0 |
| raw/svx/icons/p-boom.png | 01a1ab9d-ead4-72c2-aec8-4efa08242da7 |
| raw/svx/icons/p-cool.png | 01a1ab9d-d2df-757e-b9aa-0afc74d07c0f |
| raw/svx/icons/p-crit.png | 01a1ab9d-5f6b-716a-bee1-5501c002b9f4 |
| raw/svx/icons/p-critp.png | 01a1ab9d-716e-77d0-b690-fe822bd5e183 |
| raw/svx/icons/p-double.png | 01a1ab9d-f56f-7083-ae38-9aac9baa3ec8 |
| raw/svx/icons/p-frost.png | 01a1ab9d-e5d3-774f-a289-689c8c66ff91 |
| raw/svx/icons/p-gold.png | 01a1ab9d-fb44-76ea-a203-2a133e04ad9c |
| raw/svx/icons/p-heavy.png | 01a1ab9d-2062-7206-a228-47b4cdc08974 |
| raw/svx/icons/p-infinity.png | 01a1ab9e-0ce8-7518-8189-339ec289c690 |
| raw/svx/icons/p-lucky.png | 01a1ab9e-020c-75cf-848d-fa2188544d1c |
| raw/svx/icons/p-magnet.png | 01a1ab9d-d272-7482-80d9-4ccb1e68134b |
| raw/svx/icons/p-power.png | 01a1ab83-7e62-74bc-890c-708917256ace |
| raw/svx/icons/p-range.png | 01a1ab9d-458b-7440-ad5e-7146f957d459 |
| raw/svx/icons/p-rapid.png | 01a1ab84-6a87-7223-83a9-9908fd56f1c7 |
| raw/svx/icons/p-recov.png | 01a1ab9d-cf20-7255-ad31-b1d6caf311b4 |
| raw/svx/icons/p-revive.png | 01a1ab9d-f3ca-775b-a2ae-141bd0156be4 |
| raw/svx/icons/p-shield.png | 01a1ab9d-ff63-756f-abde-f7a5e0533891 |
| raw/svx/icons/p-slayer.png | 01a1ab9d-fb62-753f-a0c6-ce248a214402 |
| raw/svx/icons/p-speed.png | 01a1ab9d-87f0-7343-8b8c-edf247550cf8 |
| raw/svx/icons/p-streak.png | 01a1ab9d-d76a-7376-ae72-f236a7ad7f88 |
| raw/svx/icons/p-vamp.png | 01a1ab9d-d30e-731b-8834-5213a9c244b4 |
| raw/svx/icons/p-vital.png | 01a1ab9d-b104-77da-9bd5-335920af0e27 |
| raw/svx/icons/w-blade.png | 01a1ab84-6b4e-75f8-830b-f9bf705cdfb1 |
| raw/svx/icons/w-blaster.png | 01a1ab83-7e2e-707e-a422-786c4f97b789 |
| raw/svx/icons/w-chain.png | 01a1ab83-7d29-71bd-a49c-cc5143d4c165 |
| raw/svx/icons/w-drone.png | 01a1ab83-7d7b-7686-9eb3-56c535e8f642 |
| raw/svx/icons/w-hole.png | 01a1ab83-7d61-72ad-8312-8a9675d749ee |
| raw/svx/icons/w-ice.png | 01a1ab83-7d7c-762a-b2ba-7ae0d55519ad |
| raw/svx/icons/w-laser.png | 01a1ab84-6bdc-7245-9faa-d5876ceda777 |
| raw/svx/icons/w-meteor.png | 01a1ab83-7dca-7785-ac4e-a4a2068773ff |
| raw/svx/icons/w-nova.png | 01a1ab83-7e32-7287-8753-efd58c6c1e62 |
| raw/svx/icons/w-orb.png | 01a1ab83-7e70-74d1-a248-2f1db9c9b2b6 |
| raw/svx/icons/w-poison.png | 01a1ab84-6b7a-7008-80e2-ca13180dd36f |
| raw/svx/icons/w-sword.png | 01a1ab84-6ab3-7042-85cf-2a138e0a27d5 |
| raw/svx/mock/cards.webp | 01a1ab83-7e15-7232-9f86-9e5c79406110 |
| raw/svx/mock/lobby.png | 01a1ab75-c203-7729-a60b-31d5cc3830a8 |
| raw/svx/mock/run.webp | 01a1ab83-7df9-7580-8e04-9b051faa6a4e |
| raw/svx/props/brazier.glb | preview 01a1ab83-7d84-77c2-a22a-508d52a16391 · refine 01a1abbb-b40d-7675-a8d9-148888988f4a |
| raw/svx/props/pillar-ice.glb | preview 01a1ab83-7d7e-712a-8791-6a456012b880 · refine 01a1abb8-7bca-717c-a6aa-9cf36c03a300 |
| raw/svx/props/pillar-neon.glb | preview 01a1ab83-7d52-7579-b6fc-bfb1aff3b517 · refine 01a1abb9-4e3d-7695-b2ff-0cc39b935452 |
| raw/svx/ui/badge-new.png | 01a1ab9e-3ef5-733e-a198-fc8b10d0b077 |
| raw/svx/ui/boss-bar.png | 01a1aba7-94e0-74cf-aaaf-fcc7a5c18fb5 |
| raw/svx/ui/btn-blue.png | 01a1aba7-9505-7505-83ac-ed36198804bf |
| raw/svx/ui/btn-green.png | 01a1aba7-9512-750c-a03f-888e64c13c31 |
| raw/svx/ui/btn-purple.png | 01a1aba7-94d6-7683-8002-9c87797b1f42 |
| raw/svx/ui/btn-red.png | 01a1aba7-94b3-7553-865b-2df7f35810b7 |
| raw/svx/ui/card-common.png | 01a1ab9e-26b0-7563-9e63-6f58a34f8394 |
| raw/svx/ui/card-epic.png | 01a1ab9e-2a6d-71d5-8296-7b689536d6fc |
| raw/svx/ui/card-evo.png | 01a1ab9e-2cbf-72e3-971d-c064962f3692 |
| raw/svx/ui/card-legend.png | 01a1ab9e-2c59-7784-90b4-3b54d2536a01 |
| raw/svx/ui/card-rare.png | 01a1ab9e-2883-7377-8ec4-62e0edba15a0 |
| raw/svx/ui/hero-plate.png | 01a1ab9e-3f8c-71dc-a9e3-ef9c2fe916af |
| raw/svx/ui/hud-panel.png | 01a1aba7-950e-7543-8138-63bed0f18148 |
| raw/svx/ui/slot-gold.png | 01a1ab9e-3a20-72f2-b0d8-85bf2d700f3c |
| raw/svx/ui/slot.png | 01a1ab9e-356e-723f-95f6-0fe0ca8c6875 |
| raw/svx/ui/xp-bar.png | 01a1aba7-94f0-75fb-8373-e47a40824e52 |
