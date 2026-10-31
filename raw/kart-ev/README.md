# raw/kart-ev — ARCIRCLE KART Grand Opening Event (Meshy, 2026-10-31)

Raw Meshy output (PNG, model nano-banana). Not packed: convert to WebP / key / size for a phone before it goes in the game.
No text in any image — the game adds its own.

References for the key art (img2img): the five racer cards images/kart/card-{pepe,doge,pengu,wif,bonk}.webp laid out
on one canvas (16:9 for wide, 3:4 for tall), images/kart/keyart/key-1-nexus-1600.webp and key-sq-moon-800.webp.

Shared style tail of the key-art prompts: "bright stylized 3D render, glossy toy-like materials, premium mobile racing
game key art, cyan and mint glow, blue glass sheen, a small infinity emblem on the karts. Absolutely no text, no letters,
no logos, no UI." Racers: "a green frog in a green racing suit, a shiba dog in a yellow suit, a penguin in a white and
blue suit with goggles, a shiba with a pink beanie in a pink suit, a shiba in a red suit, each in its small go-kart".

## Final files

| File | Size | Task (Meshy) | Prompt / notes |
|---|---|---|---|
| key-wide-1.png | 1344×768, 2354 KB | image-to-image 01a19155-6f44-7710-93db-1ea8b6335ee4 | "Grand opening event key art, wide 16:9 landscape. <racers>, bursting toward the camera side by side across a race track, a giant golden trophy behind them, confetti, fireworks, checkered flags, blue boost flames. Celebratory. The top quarter calm: open evening sky with soft fireworks, empty space for a title." refs: sq-key-wide-1 + cards. Sunset city, all five in a row — best wide pick. |
| key-wide-2.png | 1344×768, 1938 KB | image-to-image 01a19155-6f86-7047-8461-5e8997a2497f | same prompt; refs sq-key-wide-2 + cards. Cooler dusk; trophy sits high (less title room). |
| key-tall-1.png | 864×1184, 1930 KB | image-to-image 01a19155-6f6b-70f7-a5ce-3b459ed93bf5 | "Grand opening event key art, tall 3:4 portrait for phones. <racers>, stacked in rows racing toward the camera (two in front, three behind), a giant golden trophy in the middle behind them, confetti, fireworks, checkered flags, blue boost flames. The top quarter calm…" refs sq-key-tall-1 + tall card sheet. Note: PEPE drives a yellow kart here. |
| key-tall-2.png | 864×1184, 2012 KB | image-to-image 01a19155-6f4e-7702-8bfa-178627c4cd1f | same prompt; refs sq-key-tall-2 + tall card sheet. Bright day, colours match — best tall pick. |
| icon-flag.png | 1024×1024, 1151 KB | text-to-image 01a19154-5ab5-7674-bd61-81b85d2ba516 | "Two crossed black-and-white checkered racing flags on gold poles, centered single object, glossy stylized 3D game icon, cyan rim glow, soft highlights, on a perfectly flat solid pure green (#00ff00) background, no shadow on the background, no text" |
| icon-stopwatch.png | 1024×1024, 1021 KB | text-to-image 01a19154-5aa8-755d-8b66-5c1460c9ac45 | "A shiny gold stopwatch with a cyan glowing glass face, <same icon tail>" |
| icon-clip.png | 1024×1024, 1090 KB | text-to-image 01a19154-5ab5-7533-8df7-7ef1d1284c93 | "A movie clapperboard combined with a camera, a glowing cyan play triangle on its front, <same icon tail>" |
| icon-trophy.png | 1024×1024, 1057 KB | text-to-image 01a19154-5aa6-772e-9d52-3cdbcb40203d | "A shiny golden trophy cup with an infinity symbol emblem on the front, <same icon tail>" |
| frame-glow.png | 1024×1024, 765 KB | text-to-image 01a19154-5aa7-719a-afd3-3cf6eeecb957 | "A soft radiant light burst glow ring, golden and cyan light, thin bright ring with soft rays, centered, on a pure solid black (#000000) background, no objects, no text" — draw additively. |
| confetti-2.png | 1024×1024, 1753 KB | text-to-image 01a19155-6ee2-73d6-a7ef-a0901af6dafb | "A full sheet of many small colourful confetti pieces (rectangles, squares, curly streamers, stars) in gold, cyan, pink, mint and red, evenly scattered over the whole frame edge to edge, not clustered, on a pure solid black (#000000) background, no text" — the edge-to-edge sheet (additive). |
| confetti.png | 1024×1024, 608 KB | text-to-image 01a19154-5aac-7562-9c4e-53e6d2fc4d9b | first try: "Scattered colourful confetti pieces and streamers … on pure black" — came out as a centred burst; usable as a burst sprite. |

Icons: Meshy's "pure green" is a mid green (~#5aa84a), not #00ff00 — key by hue, not by exact colour.

## Square drafts (sq-*.png, 1024×1024)

The repo's tools/meshy.mjs img2img sends no aspect ratio, so the first key-art pass came back square:
sq-key-wide-1 (01a19154-5af9-725c-89a2-07f3a70ef211), sq-key-wide-2 (01a19154-5ac5-7081-ab8a-1ca1f82f53e9),
sq-key-tall-1 (01a19154-5abe-77c1-a01e-0c56ce04835d), sq-key-tall-2 (01a19154-5ae8-757d-8180-ba494150b86a).
They served as composition references for the final 16:9 / 3:4 files, which were made with i2i-ratio.mjs here
(the same image-to-image call plus `aspect_ratio`; key from MESHY_API_KEY only). Usable as square social art too.

## Announcement set (added 2026-10-31, second request)

Magma Run refs: images/kart/keyart/key-2-volcano-1600.webp, images/kart/tracks/volcano-card.webp, plus the card sheets.
Prompt core: "Announcement background … <racers>, racing toward the camera on a volcano race track: glossy dark road with
glowing orange lava cracks, lava along the edges, an erupting volcano in a red-orange sky. A giant golden trophy …,
fireworks, confetti, blue boost flames. Composition: a clean darker calm band across the top 30 % (28 % square) …
and a calmer, darker plain road strip along the bottom 22 % (25 % square)." + the shared style tail. Meshy doesn't keep
those bands strictly dark: plan a gradient scrim under the overlaid text.

| File | Size | Task (Meshy) | Notes |
|---|---|---|---|
| announce-16x9-1.png | 1344×768, 2321 KB | image-to-image 01a19157-86d2-73d7-a75e-46fc5a775c64 | refs volcano key art + cards. Dynamic, PEPE big in front; WIF (pink beanie) wears yellow here — off-model. |
| announce-16x9-2.png | 1344×768, 2497 KB | image-to-image 01a19157-86d9-76da-98d6-3af58dc416bc | refs key-wide-1 + volcano card + cards. All five in their right colours in a row, trophy + flags, lava-crack road with room below — best pick. |
| announce-1x1-1.png | 1024×1024, 2389 KB | image-to-image 01a19158-194f-76ba-a0a2-f1d341f553e9 | redo (first try 01a19157-86d4-72da-a193-1a33709f24f9 came with flat navy letterbox bars): "Square 1:1 version of this volcano racing scene, full bleed edge to edge …" from announce-16x9-2. Right colours, sky top / road bottom — best square pick. |
| announce-1x1-2.png | 1024×1024, 2421 KB | image-to-image 01a19157-86d6-775f-a3a9-0ae0ff052f72 | refs sq-key-tall-2 + volcano card + tall cards. Racers stacked under the trophy; busier top. |
| usdc-coin.png | 1024×1024, 980 KB | text-to-image 01a19157-86c5-72fe-bd38-8c352454e0a7 | "A glossy 3D blue coin seen at a slight angle, thick rim, a plain white dollar sign $ embossed in the middle, no other marks, no logos, no text, cyan rim glow, centered single object, stylized 3D game icon, on a perfectly flat solid pure green (#00ff00) background" — the green is a lime ~#a8d45c: key by hue. |

No task failed. One result was redone for a defect (announce-1x1-1, letterbox bars).
