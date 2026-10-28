# Menu window — raw Meshy images (2026-10-27)

Made with `tools/meshy.mjs` (model nano-banana). Raw PNGs as Meshy returned them; pack to WebP and size for a phone before use.

Notes:
- Meshy's text-to-image only takes 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3. The 16:5 headers and the 4:1 row were asked for but
  refused, so they were made at **16:9** (1344×768): crop the banner / the bar out of the middle.
- img2img outputs are 1024×1024 (Meshy's size), not the reference's aspect.
- The "pure green" backgrounds came back a muted green (~#5aaa60, slightly uneven), not #00ff00: key by hue with some tolerance.
- The mock-ups contain readable (Korean) UI text copied from the reference; they are targets for layout/look only.
- Nothing failed or was skipped.

| File | Kind | Prompt |
|---|---|---|
| mock-phone-1.png | img2img ← ref/phone-full.png | Remaster this same game menu layout at high quality, keep the composition: header, 3x3 grid of big 3D icon cards, list rows, pill buttons. Premium mobile game UI, glossy blue glass cards with soft cyan rim light, subtle inner glow, depth, clean spacing. Bright stylized 3D, cyan and mint glow, a cute white robot hero with a blue visor. No readable text, no brands. |
| mock-phone-2.png | img2img ← ref/phone-full.png | same + "Variation: slightly different lighting and card shapes." |
| mock-landscape.png | img2img ← ref/landscape.png | Remaster this same game menu over the game scene, phone held sideways, at high quality, keep the composition. Premium mobile game UI, glossy blue glass cards with soft cyan rim light, subtle inner glow, depth, clean spacing. Bright stylized 3D, cyan and mint glow. No readable text, no brands. |
| head-1.png | text-to-image 16:9 | A wide banner of a floating sky island town with a glowing infinity-shaped portal and a cute white robot hero with a blue visor and an infinity logo waving, sunny, bright blue sky, soft clouds, bright stylized 3D game art, cyan and mint glow, no text, no letters, no logos |
| head-2.png | text-to-image 16:9 | same + ", wider view of the town, different angle" |
| card-tile.png | text-to-image 1:1 | a rounded square game UI card, glossy deep-blue glass with a soft cyan rim light and a faint hexagon pattern, light from the top, empty centre, on a flat pure green #00ff00 background, no text |
| card-tile-on.png | text-to-image 1:1 | a rounded square game UI card, pressed highlighted state, glossy deep-blue glass with a bright mint glow and soft cyan rim light and a faint hexagon pattern, light from the top, empty centre, on a flat pure green #00ff00 background, no text |
| row.png | text-to-image 16:9 | a wide rounded game UI button bar, glossy blue glass, cyan rim, small chevron area on the right, empty, on flat pure green #00ff00, no text |
| panel-bg.png | text-to-image 9:16 | soft abstract deep blue background with faint glowing hexagons, light rays from the top and floating tiny light particles, no objects, no text |
| glow.png | text-to-image 1:1 | a soft round cyan and mint light burst on pure black background, no text |

Icons (text-to-image 1:1): "a single cute glossy 3D game icon of **X**, stylized, soft light, centered, on flat pure green #00ff00 background, no text"

| File | X |
|---|---|
| i-crew.png | three little white robots together |
| i-invite.png | a glowing envelope with a heart |
| i-start.png | an open glowing book with a star |
| i-island.png | a tiny floating palm island |
| i-ledger.png | a blue ledger book with a coin |
| i-market.png | a small market stall with a crown |
| i-village.png | a golden trophy with a ribbon |
| i-gamevillage.png | a game controller on a small glowing portal |
