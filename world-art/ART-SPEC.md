# ARCIRCLE World — art direction

The official look of ARCIRCLE World, taken from the eleven reference sheets (October 2026). Every new asset, effect
and screen follows this page. The asset list and each one's state is `manifest.json`; how the sheets map to the game
today is `AUDIT.md`.

The sheets are art direction, not game files. Nothing from them is pasted into the world as a picture: each concept is
rebuilt as real 3D (geometry and materials in code, or a GLB file) or as real interface code.

## One world, one look

Bright, soft, clean sci-fi: a friendly future built from white ceramic shells, dark glass and lines of light. Shapes
are round and chunky, never sharp or gritty. The light is a sunny afternoon with soft shadows, and anything that does
something glows.

## Colour

| Role | Name | Hex | Use |
|---|---|---|---|
| Primary | Arc Blue | `#2F86FF` | the mark's first ring, primary glows, links, selected states |
| Secondary | Circle Mint | `#2EE07A` | the mark's second ring, success, "yours", healing |
| Light | Cyan | `#38E8FF` | robot eyes, energy lines, portals, the HUD's live values |
| Shell | White | `#F3F7FB` | robot shells, building walls, panels |
| Metal | Silver | `#C9D3DE` | trims, rails, pillars |
| Dark glass | Ink | `#070B12` | robot faces, screens, window glass |
| Reward | Gold | `#FFC861` | rewards, rare items, ARCL, titles |
| Magic | Violet | `#A67BFF` | skills, NFTs, special and event effects |
| Danger | Coral red | `#FF4D6D` | scammers, damage, warnings |

Rarity follows the game's existing ladder (world-rpg-data.js RARITY): grey, green, blue, violet, gold.

## Materials

- **Shell**: white, roughness 0.30–0.35, metalness ≈0.05. It reads as glossy plastic or ceramic with a soft highlight.
- **Trim**: dark slate or the character's colour, roughness 0.45, metalness 0.2. Used on joints, soles, bands and frames.
- **Dark glass**: near-black, roughness 0.12, metalness 0.4, with a faint inner glow. Used on faces, screens and windows.
- **Light**: emissive in the accent colour, intensity 1.5–2.6, so the bloom picks it up. Use it only on parts that mean
  something: eyes, rings, energy lines, portals.
- No noisy textures. Detail comes from shape, bevels and light lines.

## Proportions

- **Characters (ARC Bots)**: about 2.1 m in world units, chibi. The head is about 45% of the height: a big rounded helmet,
  a dark glass face covering the front, two tall rounded glowing eyes, and headphone ear pods with a light ring. The body
  is small and round with the ∞ mark on the chest, the arms and legs are short, and the feet are round.
- **Buildings**: about 2–3 storeys, chunky. A white body sits on a raised round plinth with a glowing rim, under a
  domed or stepped roof with a big readable sign or symbol.
- **Props and items**: oversized and toy-like, readable from the game camera (about 9 m behind and above).

## Light and air

- A warm sun from about 40° with soft shadows on characters, a sky-blue hemisphere fill, and a light fog that takes
  each zone's colour.
- Bloom only on emissive parts (selective). Use ACES tone mapping at exposure 0.9–1.05.
- The day and night follow Seoul time (world-play.js dayNight). At night the light lines, lamps and fireflies carry
  the scene.

## Effects

- Effects are made of rings on the ground, rising light pillars, soft additive sprites and small crystal shards.
  Colour carries meaning:
  - mint: heal and success
  - blue: travel and portals
  - gold: rewards
  - violet: skills and magic
  - coral: danger and burns
- Effects never cover the wallet's own confirmation or the game's dialogs.
- Every effect has a "less motion" version (the Settings switch or the device's own setting).

## Interface

- The interface uses dark navy glass panels with a thin light border, soft corner radius and a blur behind them.
- Rows are clear: the label is small and muted, and the value is bold.
- Numbers use the site's numeric face. Labels are in sentence case.
- Buttons are pills: mint or blue for the main action, outline for the rest.
- Icons are simple line or solid glyphs, never emoji in the interface.
- The interface must work on a phone first: thumb-reach buttons, nothing important under the joystick or the
  attack button.
- **Honesty rules carried over from the game**:
  - ARCL has no dollar price anywhere: it can't be bought, its exchange isn't open, and the rate and date are undecided.
  - No screen promises token rewards for playing.
  - A feature that doesn't exist yet (guilds, PvP arena, NFT gallery) is not drawn as if it works.

## Camera

The camera is third person, behind and above, with a 55° field of view that widens a little when running. Showcase
shots (cards, portraits) use about 30° from slightly above, with the subject turned about 20° from the camera.

## How assets are made here

1. Classify the concept (manifest.json: id, sheet, category).
2. Check what the game already has (AUDIT.md).
3. Build it as real 3D:
   - In code: three.js geometry and the materials above. This is how the ARC Bots, the companions, the arena and the
     island bricks are made. It costs no download and stays sharp at any size.
   - Or as a GLB for shapes code can't reasonably make (detailed buildings, vehicles). This needs a 3D artist or a
     model-generation tool. The tools aren't available in the build environment, so these assets are listed in the
     manifest as `needs-model` with a specification, never marked as done.
4. Optimise:
   - Share geometries and materials.
   - Instance anything repeated.
   - Keep characters under about 15k triangles and props under about 3k.
   - Store GLBs meshopt-compressed (the loader already decodes it).
5. Wire it in with the same joint names and APIs as what it replaces, so the game systems don't change.
6. Test in the browser test suite and look at it on a phone-sized screen before it counts as done.
