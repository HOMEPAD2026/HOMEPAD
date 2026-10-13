# ARCIRCLE World — art style guide

The game mixes models from different sources (Kenney, Quaternius, our own ARC Bots and procedural props). This guide
keeps anything new in the same look. When in doubt, match the plaza.

## The look in one line
Clean, bright, toy-like shapes; white "shell" architecture with glowing ARCIRCLE colour lines; soft light; dark ink
outlines on characters; colour comes from light and accents, not from busy textures.

## Palette
| Role | Hex | Use |
|---|---|---|
| Arc Blue | `#2f86ff` | the first ring, glass, UI accents |
| Circle Mint | `#2ee07a` | the second ring, positive states, the meadow's highlights |
| Cyan | `#35d8d0` / `#38e8ff` | light lines, tech, water glow |
| Gold | `#ffc861` | rewards, elites, legendary, lamp light |
| Violet | `#b48cff` | magic, epic, the Dark Market |
| Coral | `#ff4d6d` | danger, scammers, bosses |
| Shell white | `#dfe6ee` | hall walls (each district tints it slightly, see below) |
| Trim | `#2a3446` | dark metal parts, posts, frames |
| Ink | `#0b1220` (characters), `#1a0a14` (scammers) | outlines; never pure black |

District shells (world-arcstyle.js `DISTRICT_STYLE`): Launch `#e2ede7`, Finance `#eee6d8`, Research `#dde8f4`,
ARCL `#f0e7cc`, ARCIA `#eee1ee`. Hunting grounds take their own `zn.color`, `zn.ground` and `zn.fog`
(world-rpg-data.js `ZONES`).

## Shapes
- Rounded boxes (RoundedBoxGeometry, radius 0.06–0.3) over sharp boxes for anything built; low-poly cones and
  dodecahedrons for nature and rock.
- Proportions are chunky: a hall is 4.4 × 3.4 × 2.3 m; doors and windows are big and rounded.
- One clear silhouette per thing; details go on the roof line (vents, masts, domes, signs), not on the walls.

## Materials
- Use the shared helpers in world-arcstyle.js: `shell()`, `stone()`, `trim()`, `glass()`, `light(colour)`,
  `tint(colour)`. They bake into one painted material per building (fewer draw calls) and pick up the panel seams.
- Glow (`emissive`) only for things that are lights or magic, intensity 1.2–2.4. Bright HDR (above 6) is clipped
  before the bloom, so don't rely on it.
- Roughness 0.3–0.6 for most things; metalness at most 0.3 except trim.
- No photo textures. A texture is fine when it is drawn (canvas) or a soft gradient: signs, faces, decals.

## Characters
- The toon light (world-kit.js `toonLook`) and the ink outline (`outlineAll`) go on every character and scammer.
- Faces read from the camera's usual distance (about 6 m): big eyes, simple shapes.
- New wearables go in world-arcbots.js `ACC` + `WARDROBE` and sit on the head, face, neck, back or aura slot.

## Light and colour
- The grade (world-look.js `GD` and `ZONE_GRADE`) sets the mood per time of day and per ground; tune it there, not
  in materials.
- Fog is height fog: it settles low and thins with height. Keep tall landmarks tall so they read through it.
- Night: windows light pane by pane, lamps pool light on the grass, the moon rises. New props should look right
  at 21:00 as well as 15:00 (`?hour=21`).

## Effects
- Particles are round and soft (world-particles.js). Never draw a point without a round texture or a circle mask:
  a bare point is a square, and the bloom makes it a glowing box.
- Rarity colours are fixed: Common `#b8c2cc`, Uncommon `#5fe08a`, Rare `#4fa8ff`, Epic `#b48cff`,
  Legendary `#ffc861`.

## UI
- Glass panels (`--glass-bg`, `--glass-edge`), rounded 14–24 px, the game's icon set (world-icons.js) with 2 px
  strokes, Sora for Latin text and Pretendard for Korean.
- Phones (the page is 980 wide there, `html.wp-pcphone`): every control at least 52 px, text at least 18 px.

## Performance budget (keep these when adding things)
- A new prop type: instanced or merged (`mergeStatic`) if there are more than five of it.
- Shadows: only things taller than about 0.5 m cast them.
- Phones (`st.quality.coarse`) skip outlines, reflections and extra particles; check new effects with
  `lite`/`coarse` and turn them down there.
