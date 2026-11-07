# raw/hub — Meshy art for the arcircle.app home hub + ARC GALAXY (2026-11-07)

Raw outputs straight from Meshy (`tools/meshy.mjs`, nano-banana, 3 credits each). Nothing is packed or keyed yet:
convert to WebP / size for phones before use. Nothing contains text, letters or other brands (checked by eye).

## A) Home hub

Heroes: `img2img` with `_ref-mark-on-navy.png` (images/brand/mark-v2.png on navy) as the reference. Prompt core:
"Premium bright stylized 3D game key art, deep-space navy background. A giant glowing glass infinity loop exactly like
the reference emblem (left ring blue, right ring green, crystal glass, cyan rim light) floats as a cosmic gateway.
Around it float small worlds linked by thin light bridges: a cute game town planet with portals, a creator workshop
island with floating toy blocks, a light-streak spiral galaxy, a glowing empty concert stage, a launch tower with a
rocket. Cyan / mint / blue glow, glass, bloom, stars. No text / logos / people." + a composition line.

| file | size | notes |
|---|---|---|
| hero-wide-1.png | 1344×768 | emblem centre-right, worlds round it, left ~40 % empty. **Best wide** (cleanest headline space, every world present) |
| hero-wide-2.png | 1344×768 | emblem a bit right, bigger worlds (rocket tower, stage with spotlights), left third empty. Close second |
| hero-wide-3.png | 1344×768 | emblem centred-right in a mint nebula with an orbit ring of worlds; left third empty but the emblem sits more central |
| hero-tall-1.png | 768×1344 | emblem top, worlds round it, emblem small; bottom ~55 % empty |
| hero-tall-2.png | 768×1344 | emblem very small at the top — weakest |
| hero-tall-3.png | 768×1344 | retry: emblem large across the width in the top third, worlds round it, calm bottom. **Best tall** |

Icons: `image` 1:1, 1024². "A single 3D glass emblem icon of <subject>, premium bright stylized 3D, blue glass, cyan rim
light, soft glow, cute, simple … on a flat pure green (#00FF00) background". **Meshy never gives a true #00FF00**: the
backgrounds are a muted, slightly graded green (~rgb 50–125, 145–185, 60–85) — key by hue + saturation, not by exact colour.

| file | subject | notes |
|---|---|---|
| ic-game.png / **ic-game-2.png** | controller | -2 is crisper with a brighter green; either works |
| ic-launchpad.png | rocket on a launch pad | good |
| ic-studio.png | toolbox cube + pencil + blocks | good |
| ic-idol.png | microphone + heart | good |
| ic-galaxy.png | spiral galaxy disc | good (reads as a glass disc with a swirl) |
| ic-arcl.png / **ic-arcl-2.png** | ARCL coin | first try came out blue glass with a gold/lime ring; -2 is a real gold coin with a lime neon rim — **use -2**. Its background is a yellow-lime green, so key tightly (gold edge) |
| ic-agent.png | robot head | good |
| ic-coins.png / ic-coins-2.png | blue + green stacked coins | -2 has clearer blue / green, but the green coin sits on a green background: hard to key. Recolour or redo on magenta if it's used |

FX: `fx-ring-glow.png` — cyan / mint corona ring with fine rays on pure black (additive).

## B) ARC GALAXY (all `image` 1:1, 1024², pure black backgrounds, additive)

"Abstract glowing star-system sigil, a neon light emblem of <subject>, glowing lines and soft particles, centred, on a
pure black background …"

| file | subject | colour |
|---|---|---|
| gx-emblem-payments.png | ring of coins round a core | cyan / blue |
| gx-emblem-swap.png | two arrows circling | magenta |
| gx-emblem-launchpad.png | flame rising from an orb | gold |
| gx-emblem-accounts.png | shield with a key (small eye glyphs round it) | cyan |
| gx-emblem-tokens.png | faceted crystal star | magenta / violet |
| gx-emblem-infra.png | hexagon lattice with nodes | gold + cyan |
| gx-gate-1.png | stargate ring, 3/4 view, cyan + magenta swirl | **best gate** |
| gx-gate-2.png | white-cyan portal ring with light segments, dim grey inner haze (subtract or crop if needed) | |
| gx-supernova.png | white-gold core, magenta / cyan / orange shells | good |
| gx-wormhole.png | cyan / violet / magenta spiral into a dark centre | good |

`_ref-mark-on-navy.png` = the reference handed to img2img (not for use).
