# raw/stb — Meshy art for the Studio (game-maker window)

Raw Meshy output (text-to-image / image-to-image, model nano-banana), made 2026-10-27. Not packed: cut out, convert to WebP and size for a phone before anything goes in the game.

Icons were all made with this prompt, `<X>` being the subject in the table:

> a single cute glossy 3D game UI icon of <X>, stylized, soft studio light, centered, generous margin, on a flat pure green #00ff00 background, no text

**Keying note:** Meshy's "pure green" comes back as a shaded, softly lit green (about #5fb050–#9be070, darker at the edges), not #00ff00. Key by hue, not by an exact colour.

| File | Size | Subject / prompt |
|---|---|---|
| `icons/tab-blocks.png` | 1024x1024 | a stack of three colourful toy blocks |
| `icons/tab-motion.png` | 1024x1024 | a floating blue platform with motion arrows |
| `icons/tab-devices.png` | 1024x1024 | a spring and a red switch button |
| `icons/tab-items.png` | 1024x1024 | a gold coin and a red heart |
| `icons/tab-foes.png` | 1024x1024 | a cute purple slime monster with horns |
| `icons/tab-goal.png` | 1024x1024 | a checkered finish flag on a pole |
| `icons/tab-prefabs.png` | 1024x1024 | a small open box with blocks popping out |
| `icons/tool-place.png` | 1024x1024 | a pencil with a sparkle |
| `icons/tool-move.png` | 1024x1024 | a white glove hand grabbing |
| `icons/tool-flip.png` | 1024x1024 | two curved arrows in a loop |
| `icons/tool-erase.png` | 1024x1024 | a pink eraser |
| `icons/cat-run.png` | 1024x1024 | a running sneaker with speed lines |
| `icons/cat-jump.png` | 1024x1024 | a red mushroom on a block |
| `icons/cat-survive.png` | 1024x1024 | a shield with a sword |
| `icons/cat-puzzle.png` | 1024x1024 | two linked glowing rings |
| `icons/cat-rhythm.png` | 1024x1024 | a music note with a drum |
| `icons/cat-race.png` | 1024x1024 | a hover board with a flame |
| `icons/cat-all.png` | 1024x1024 | a 2x2 grid of tiny colourful tiles |
| `icons/quick-make.png` | 1024x1024 | a magic wand making a tiny game screen appear |
| `icons/sample.png` | 1024x1024 | a treasure map scroll |
| `icons/contest.png` | 1024x1024 | a golden trophy with a star |
| `art/result-bg.png` | 1344x768 | celebration backdrop for a game result card, deep blue to cyan gradient, glowing confetti, light rays from the center, soft bokeh, empty center, no text |
| `art/burst.png` | 1024x1024 | a radial burst of cyan and gold sparkles and stars on pure black background, no text |
| `art/dust.png` | 1024x1024 | a soft puff of white cartoon dust cloud on pure black background, no text |
| `art/sidebar-card.png` | 1184x864 | a small glossy blue glass game UI card background with a soft cyan rim and faint hexagons, empty, on flat pure green #00ff00 |
| `icons/tool-test.png` | 1024x1024 | 2nd try: "…icon of a round blue glass play button with a white play triangle, stylized, soft studio light, centered, generous margin, the whole background is one flat pure green #00ff00 colour edge to edge, no frame, no tile, no text". (The 1st try, *a blue play triangle button*, came back as a rounded tile on white.) |
| `icons/tool-done.png` | 1024x1024 | 2nd try: "…icon of a big chunky check mark in glossy cyan-blue and white (no green in it), …" (same background wording as tool-test). Made cyan-teal instead of mint: the 1st try's mint-green check could not be keyed off a green background. |
| `art/publish-bg.png` | 1344x768 | 2nd try: "a wide bright blue daytime sky filling the whole picture with soft white clouds, a floating creator city on an island in the middle distance, a rocket launching from it leaving a rainbow trail across the sky, stylized 3D game art, cheerful, no text" (16:9). The 1st try (the brief's prompt) put the city on a plain white background. |
| `art/mock-pick.png` | 1024x1024 | img2img from `ref/1-pick.png`: "remaster this same game-maker screen at high quality, keep the layout: left sidebar, 3D preview, template cards on the right, category tabs above the cards, a glowing progress bar for the 3 steps, premium mobile game UI, glossy blue glass, cyan rim light". A target mock-up only. It copies the reference's Korean labels and the ARCIRCLE Studio name as garbled text, so use it to compare against, never as an asset. |

## Notes

- `art/sidebar-card.png`: asked for 4:3 and got 4:3. The card is small in the middle of the frame, so crop it before keying.
- `art/burst.png` and `art/dust.png` are on black: draw them additively.
- Failures: the first run started all 29 tasks at once and Meshy refused 14 of them (429 "Rate limit exceeded" / "NoMorePendingTasks"). All 14 went through when run 3 at a time. Nothing is missing.
