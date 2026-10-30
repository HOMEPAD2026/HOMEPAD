# DIFF — our KART vs the Meshy mock-ups (to-do for the game session)

Compared: `ref/k5-desk-<track>-race.png` against `mock/<track>-race-1-w.png` / `-2-w.png` (and `nexus-race-3-w`), plus
`ref/k5-phone-pick.png` against `mock/pick-1-w.png` / `pick-2-w.png`. The order is by how much each item changes the look.
The parts named are in this folder (see README.md).

## Every track

1. **Boost flames on every kart, always visible when boosting (the biggest single difference).** The mock-ups all show two
   long blue-white jets out of the rear nozzles, a white-hot core and a cyan fringe, about 1.5 kart lengths long and
   stretched with speed. Ours shows nothing behind the kart. → `img/boost-flame.png` (additive, points +X) as two
   stretched sprites per kart, scaled with speed and brighter on a turbo / pump; `img/exhaust-puff.png` for puffs at
   idle and on a stall.
2. **Speed streaks.** The mock-ups draw white or cyan streaks on the road and the screen edges, growing with speed. →
   `img/speed-lines.png` as a screen overlay (additive, opacity ∝ speed above ~70 % of top speed; stronger on a boost),
   plus thin streak quads along the road edges.
3. **The kart's material.** Ours is flat and matte (a toy without light). The mock-ups' karts are glossy, with a clear-coat
   highlight and chrome. → `karts/kart-<id>-gloss.glb` (same mesh / UVs, full PBR set), roughness ~0.25 on the paint,
   an env map (PMREM of the track's sky) so it picks up the sky colour. Lose the flat green / yellow disc under each kart,
   or turn it into a soft contact shadow: the mock-ups have none, it reads as a debug circle.
4. **Lighting.** Ours is evenly lit with no clear sun. The mock-ups have one strong warm key light from the sun's side of
   the sky, soft shadows under the karts and props, bloom on the emissive bits (arches, lane lines, lava, crystals), and
   a slight haze toward the horizon. → a directional "sun" matched to each sky, bloom on emissive (or fake it with
   additive halos on low graphics), fog in the sky's horizon colour.
5. **Trackside density.** Ours has a bare kerb, then flat ground, then the sky. Every mock-up fills the band between road
   and horizon: props every ~10–20 m on both sides, a few big landmarks, the grandstands stretched along the straight.
   → the props below, instanced, 2–3 kinds a track, with far ones on lower graphics. Keep the road's sight lines clear.
6. **Road surface.** Ours is a flat tile with hexagon marks that shows its repeat at a distance. The mock-ups' roads are
   darker and wet-glossy, with reflections of the arches and lights, and the kerbs are crisper. → the new
   `img/road-<track>.png` (tile them first), roughness ~0.35, a little env reflection; keep the red/white kerbs but give
   them a slight bevel or a normal map.
7. **HUD (keep ours).** The mock-ups only polish the existing HUD: glass panels, a brighter rim, the same places. No change
   needed beyond maybe a brighter rim on the speed dial. Don't copy `nexus-race-2-w`'s invented item / place cards.

## Nexus Circuit (`nexus-race-1/2/3-w`)

- Sky: golden-hour sunset (orange → pink → violet) with the sun low over the road's end, instead of our dusk blue. →
  `img/sky-nexus.png`.
- Two long **grandstands full of a colourful crowd** both sides of the straight, with roofs and light strips. →
  `props/shared/grandstand.glb` in a row of 4–6, instanced.
- **Neon palm-like trees** between the stands and the kerb → `props/nexus/neon-tree.glb`.
- **Checkered flags / banner poles** along the stands → `props/nexus/banner-pole.glb`.
- The cyan / pink arches are the same but glow (bloom) and are reflected in the road.
- Glass skyscrapers with neon lines nearer the track (ours are flat blue blocks): a better sky covers most of this; the
  blocks could take a window texture.
- Extras: `props/nexus/billboard.glb` (blank face: our own ad art or the week's #1 on it), `props/nexus/tyre-stack.glb`
  at the corners' outside, `props/shared/blimp.glb` slowly crossing the sky.

## Lunar Loop (`moon-race-1/2-w`)

- Sky: brighter violet nebula, the planet bigger and lit, a soft sun flare. → `img/sky-moon.png`.
- **Crystal clusters** (purple / cyan, glowing) in groups beside the kerb → `props/moon/crystal.glb`.
- **Satellite dishes** on the outside → `props/moon/dish.glb`.
- **Floating rocks** drifting in the sky above the track → `props/moon/float-rock.glb` (slow bob + spin).
- Road: the mock-ups' road is a pale silver glass with the cyan dashes glowing and reflected; ours is mid grey and dull.
  → `img/road-moon.png`, keep the cyan dashes, more emissive.
- Dust kicked up behind the wheels (pale particles) in low gravity.

## Frost Drift (`ice-race-1/2-w`)

- Sky: the aurora is fine; the mock-ups add a bright sun on the horizon and a bluer, lighter sky.
- **The road is dark navy frosted asphalt** that stands clear of the white snow (ours is pale ice-white, the same as the
  ground, so the road disappears). → `img/road-ice.png`.
- **Snowy pines** packed along both sides → `props/ice/pine.glb` (2.5 k tris, the cheapest prop: use many).
- **Ice arches** over the road instead of thin white rings → `props/ice/ice-arch.glb`.
- Snow banks along the kerb (white mounds), sparkle particles.
- A crowd of **ice-robot spectators** by the stands → `props/ice/ice-robot.glb` (cheering pose; instance with small
  random scale / yaw).
- Cyan speed streaks on the road read strongly here (the drift track).

## Magma Run (`volcano-race-1/2-w`)

- Sky: ours is already close; the mock-ups make it brighter and warmer with the sun beside the volcano. → `img/sky-volcano.png`.
- **Lava pools / rivers right beside the road**, glowing and flowing, much brighter than ours. Ours has the lava strip but
  it is thin and dim. → more emissive, a scrolling UV, bloom.
- Road: dark basalt with glowing orange cracks (ours is similar, keep it; `img/road-volcano.png` is a sharper version).
- **Lantern poles** with a lava-glow lamp along both sides → `props/volcano/lava-lantern.glb`.
- **Scorched banners** on iron poles → `props/volcano/scorched-banner.glb`.
- **Obsidian spires** in the lava → `props/volcano/obsidian.glb`.
- Ember particles rising, heat shimmer near the lava (optional, not on low).

## Pick screen (`pick-1/2-w`)

Meshy kept the layout almost exactly, so the differences are small:

- A glowing **cyan ring** round the turntable instead of the flat green disc (pick-1).
- The racer and track cards sit together in one **framed glass panel** with a small "RACE" tab on top (pick-1).
- Behind the kart: a garage / showroom window onto the neon city (pick-1), so the kart stands on a lit floor, not the bare
  road.
- The kart in both mock-ups still looks matte: the gloss karts (`karts/`) and a spotlight over the turntable would do
  more here than anything else.

## Shared, all tracks

- `props/shared/arch-gate.glb`: a blank-banner arch for the start / finish or sector gates (put our own art on the banner).
- `props/shared/fence.glb`: an 823-tri fence segment to line the outside of fast corners (instanced).
- `props/shared/blimp.glb`: a ∞ blimp for the sky (one a track, slow path).
- Key art in `keyart/` for the promo / store / loading card (no text on the images).
