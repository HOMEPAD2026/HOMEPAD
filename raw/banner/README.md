# raw/banner — isolated "worlds" for the 1500×500 hub banner (Meshy, 2026-11-07)

Every output is 1024×1024 PNG on pure black (#000000, corners 0–2) — draw them additively or key the black.
References: `reference-<world>.png` = crops of `raw/hub/hero-wide-1.png` (town) / `hero-wide-2.png` (the rest, boxes
in the brief), upscaled onto a 1024² black canvas.

Shared island prompt (P) for town / bricks / stage (img2img):
> the same floating island world as the reference, isolated and centred, whole object visible with generous margin,
> pure solid black background (#000000), no ground, no beams or light trails leaving the object, bright stylized 3D
> game art, glossy, cyan and mint glow accents, high detail, no text, no letters, no logos

| World | Pick | Files | Notes |
|---|---|---|---|
| town (GAME WORLD) | **town-1.png** | town-1, town-2 (P + reference-town); town-3 (rejected) | 1 and 2 nearly identical; the island is only ~470 px wide in the frame and a little soft (the source crop was 184 px). town-3 ("re-render large, 70 % of the frame") kept the reference's navy rectangle — non-black background, rejected. |
| bricks (CREATOR HUB) | **bricks-1.png** | bricks-1, bricks-2 (P + reference-bricks) | both clean; blueprint sheets carry glyph-like scribbles, no readable text. 1 has a little more margin on the right sheet. |
| stage (ARCIA) | **stage-2.png** | stage-1, stage-2 (P + reference-stage) | stage-1 keeps light beams pouring off the stage (against the brief). stage-2 is larger and clean. |
| rocket (PLATFORM) | **rocket-1.png** | rocket-1 | img2img + reference-rocket: "a small glossy cyan glass rocket on a tiny round floating launch pad, flame below, isolated and centred with margin on pure solid black background (#000000), bright stylized 3D game art, cyan and mint glow, no text, no letters" |
| galaxy (ARC GALAXY) | **galaxy-1.png** | galaxy-1 | img2img + reference-galaxy: "a single cyan and blue spiral galaxy, seen at an angle, isolated and centred with margin on pure solid black background (#000000), glowing, high detail, no text, no letters" |
| agents (new) | **agents-1.png** | agents-1 | img2img with reference-town as the style ref: "a small floating platform with a cute round glass robot AI agent head with glowing cyan eyes, holographic panels around it, in the same style as the reference, isolated and centred with margin on pure solid black background (#000000), stylized 3D, glossy, cyan and mint glow, no text, no letters". Small in frame (~300 px). |
| arcl (new) | **arcl-3.png** | arcl-1, arcl-2 (rejected), arcl-3 | arcl-1 (img2img, "abstract swoosh A-like shape") reads as a clear letter A — rejected. arcl-2 (img2img, infinity swoosh) copied the town reference behind the coin — rejected. arcl-3 = text-to-image, 1:1: "a single glossy 3D coin of translucent blue glass with a glowing cyan rim, on its face an embossed abstract infinity loop swoosh, no letters, no characters, slight tilt, centred with wide margin, isolated on a pure solid black background (#000000), bright stylized 3D game art, mint and cyan glow, no text, no logos" — clean ∞ coin. |

Credits: 106 before → 67 after (39 spent, 13 images × 3).
