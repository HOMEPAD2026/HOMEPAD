# ARCIRCLE World — graphics audit and baseline (12 October 2026)

This is where the game stands before the art upgrade (ART-SPEC.md). The asset-by-asset state is in `manifest.json`.

## How it's built

- **Engine**: three.js r169, plain ES modules with no framework and no build step (`world-*.js`, loaded side by side
  by `world-play.js`).
- **Renderer** (world-kit.js `makeStage`):
  - WebGL with ACES tone mapping, a RoomEnvironment for reflections, a shadow map on the sun, and an EffectComposer
    with UnrealBloom.
  - The auto quality setting steps down when frames drop: fewer pixels, then no bloom or shadows, then fewer
    particles.
- **The world**:
  - The player stands at the origin and the planet (a flat disc of districts) slides under them.
  - The sky is a shader dome that follows Seoul's day and night.
  - Hunting grounds and the raid arena are zones on the same ground; islands are a separate mode (world-island.js).
- **Models** (`models/world/`):
  - `kenney-city.glb` and `scifi-props.glb` (CC0) for buildings and props.
  - `scifi-enemies.glb` for the scammers, loaded after the world.
  - `chars/character-*.glb` for twelve Kenney Mini Characters.
  - Everything else is made in code: shops' accents, the plaza, the arena, the companions, island bricks, effects and,
    from now on, the ARC Bots.
- **Interface**: HTML and CSS over the canvas (`play.html`, `arc-v10.css` bundled into `world.min.css`). Nothing in the
  interface is drawn into the 3D scene except name plates and signs.
- **Blockchain**: the game never signs anything itself. Shops open the real ArcPad / Swap / Orders pages, every
  transaction is confirmed in the player's wallet, and ARCL is a server-side game balance. None of this changes with the
  art upgrade, and the rendering code doesn't touch it.

## Baseline (desktop 1440×900, default character, plaza at noon)

Measured headless, so these are counts rather than speeds. Frame rate has to be measured on real phones and PCs.

| | Kenney character | ARC Bot |
|---|---|---|
| Ready to play (local) | 29.6 s* | 18.7 s* |
| Downloads | JS 1.6 MB, models 2.1 MB, CSS 353 KB, fonts 80 KB, images 270 KB | same, minus the 100 KB character model |
| Visible meshes | 1,157 (12 instanced) | 1,181 |
| Draw calls (last pass) | ≈380 | ≈400 |
| Triangles in view | ≈78k | ≈85k |
| Materials | 721 | 725 |
| Textures | 32 | 29 |
| Character | 2.1k triangles | 13k triangles (no texture) |

\* Headless software rendering on a shared test machine; the two runs aren't comparable to each other, only to later
runs on the same machine.

## What the numbers say

- **Draw calls and materials are the cost, not triangles.** About 720 materials for about 1,150 meshes means most
  props carry their own material. Sharing materials by colour, and instancing repeated props (trees, lamps, rocks,
  fences), is the biggest win before any new art goes in.
- **The models are light** (2.1 MB); the JavaScript is the larger download. The modules already load in parallel and
  the enemies load after the world.
- **Room for the new look**: an ARC Bot costs 13k triangles and no texture, about the same as eight street lamps.

## Order of work

1. Phase 01: the art direction (ART-SPEC.md) and the asset list (manifest.json). Done.
2. Phase 02: the 25 ARC Bots, built in code with the game's joint names and all animations. Done, and the default for
   new players.
3. Phase 03: outfits as wearable parts on the ARC Bot joints (hat, top, bottom, shoes, back, accessory), from the
   inventory.
4. Draw-call pass:
   - shared materials
   - instanced trees, lamps and rocks
   - the graphics presets renamed Low / Medium / Ultra over the existing auto-quality steps
5. Phase 05, 07 and 08: restyle the shops' bodies, the island bricks and the plants to the white-shell / light-line
   look. Assets code can't reasonably make are listed in manifest.json as `needs-model`.
6. Phase 06: new zones, loaded only when entered, like the hunting grounds.
7. Phase 09 and 10: restyle the effects and the interface against the spec.

## Can't be done here

There is no 3D model-generation or image-to-3D tool in this environment, so concepts marked `needs-model`
(detailed buildings such as the Factory, Hangar and Observatory; vehicles; detailed weapons) need a 3D artist or such a
tool. Each has its entry in manifest.json to hand over. The game loads GLB with meshopt compression, so a delivered
model drops in where the code-built stand-in is.

Concepts marked `needs-feature` aren't art. They need game systems that don't exist yet: guilds, PvP arena, NFT
gallery, mining, fishing and food. They stay off the screens until the system exists.
