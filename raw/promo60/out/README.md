# raw/promo60/out — X post promo candidates (Meshy)

Prompt (the same for all; references for img2img: ref/tutorial-arrow, bridge, academy, contest):
"Bright stylized 3D promo key art. A cute white robot hero with a halo and a graduation cap stands in a white-and-cyan
futuristic plaza (Creator City). A glowing gold arrow on the ground leads to a tall glass tower. On the right floats a
blue glass UI panel with a 7-step checklist. Beside it, a glowing bridge of blue coins (plain coins, no logos) joins two
floating sky islands. Above, a progress bar of six green squares and four empty ones. Cyan/mint glow, soft daylight,
clean composition, plenty of calm space at the top for a title." Each run added "Wide 16:9 landscape composition"
and a strong "no text, no letters, no numbers, no logos" clause; the redos added "checklist only check boxes and blank bars".

Credits: 18 (3 img2img + 1 text-to-image, then 1 img2img + 1 text-to-image redo, 3 each). Balance 1892 → 1874.

| file | size | how | notes |
|---|---|---|---|
| promo-img2img-1.png | 1024² | img2img | Meshy drew a 16:9 picture and padded it with blurred, stretched bands at the top and bottom, so use the crop below |
| promo-img2img-1-16x9.png | 1024×576 | crop of the above (rows 240–815) | **best candidate**: robot with halo and cap on the gold arrow, glass tower, checklist panel with 6 ticks, coin bridge to a floating island, progress bar. The top margin for a title is modest; the bar shows 5 of 8 filled, not 6 of 10 |
| promo-img2img-2.png | 1024² | img2img (redo) | front view down a cyan path, gold arrow, robot, 7-row checklist (3 ticked), coin arch between two islands, progress 6 green of 10, Academy dome behind. The first try had "7 step" on the panel. In this redo the dome's plaque carried lettering copied from the academy screenshot, so I painted the plaque blank navy. The small signs on the side arches still have tiny blurred unreadable marks |
| promo-img2img-3.png | 1024² | img2img | robot walking toward the camera on a path with a big gold arrow, glass tower, checklist, coin arches, progress 5 of 10, lots of sky on top |
| promo-text-1.png | 1344×768 | text-to-image, no references (redo) | glass tower, robot with halo and cap, a checklist panel, a coin bridge between islands, a progress bar, a thin gold arrow on the floor. The first try had "Step City" on the panel; this redo had "STEP" at the top of the panel, which I painted out with the panel's blue |
The img2img candidates are square: `tools/meshy.mjs img2img` passes no aspect ratio, so Meshy returns 1024².
Only the text-to-image one is truly 16:9.
