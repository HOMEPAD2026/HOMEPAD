# ARCIRCLE World concept sheets

The official AI-generated concept sheets (owned by the project, free to use), downscaled to 2000 px wide (webp, q75)
for reference. The originals are ~4320×2850 jpgs: each sheet is a 5×5 grid of numbered cards (overview.jpg has
sections 01–09). The art direction drawn from them is `world-art/ART-SPEC.md`.

| Sheet | What it is |
|---|---|
| overview.webp | the whole collection: characters, outfits, items, buildings, environments, bricks, plants, effects, UI |
| characters.webp | 25 robot characters (ARC, NEO, LUNA, …) |
| outfits.webp | outfits and accessories |
| items.webp | weapons, tools, gadgets, consumables, vehicles, decoration |
| environments.webp | 25 environments and backgrounds |
| blocks.webp | building blocks |
| plants.webp | plants and decorations |
| effects.webp | portals and special effects |
| ui-hud.webp | the HUD and icon style |

## Used in the game

All cut by `tools/concept-art.py` (run it on the original jpgs to rebuild them).

- **Loading screen key art** (`images/load/key-NN.webp` + `key-NN-bg.webp`, play.html): environments.jpg cards
  01 Arc Circle Plains, 08 Floating Islands, 12 Sky Temple, 17 Meadow Village, 22 Rainbow Field: the big picture only
  (the label painted out, the thumbnails left off), 632×468, with a tiny blurred copy as the full-screen backdrop.
- **Item icons** (`images/items/items.webp`, one 4×4 sheet of 128 px cells, background removed; `world-itemart.js`):
  - items.jpg: 19 Potion (health = red, mana = blue), 10 Portal device (recall scroll), 18 Container box,
    21 Currency token (gold A coin, blue crystal coin), 16 Pickaxe, 17 Axe, 08 Fishing rod (the fish)
  - overview.jpg 03 Items: the blue gem (data crystal), the gold chest, the violet A token, the hammer
  - blocks.jpg: 22 Terrain block (lava: ore), 23 Decoration set (plank block: wood), 24 Connector (scrap)
  - shown in: the Forge's Supplies cards, the bag's scrap/potion line, the Workbench (materials, recipes, mastery),
    the quest book's daily chest.

Not used: the character mascots (the hero art touches its card's edges and the white shells sit on a light card, so
they don't cut out cleanly).
