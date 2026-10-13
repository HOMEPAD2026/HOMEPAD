# the HP card for two bars (b400): the sheet's HP card emptied (no portrait, no rows) and the HP and SP icons with their
# labels on their own. Run: python3 -I tools/hud-slice-vit.py world-art/hud-sheet.png images/hud world-art/hud-sheet.json
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage
SRC, OUT, META = sys.argv[1], sys.argv[2], sys.argv[3]
a = np.array(Image.open(SRC).convert("RGBA")).astype(np.float32)
x0, y0, w, h = 35, 295, 581, 166            # the HP card's crop (as in sheet.json "vit")
c = a[y0:y0 + h, x0:x0 + w].copy()
# the inside from one clean column near the right edge (right of the numbers), then the left edge from the right
# edge, mirrored (the portrait sat on the left)
col = 591 - x0
for y in range(312 - y0, 446 - y0): c[y, 10:col] = c[y, col]
strip = 46
c[:, :strip] = c[:, w - strip:][:, ::-1]
solid = ndimage.binary_fill_holes(c[:, :, 3] > 200)
c[:, :, 3] = np.where(ndimage.binary_dilation(solid, iterations=3), c[:, :, 3], 0)
Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), "RGBA").save(f"{OUT}/vitpanel.webp", lossless=True, quality=100, method=6)
meta = json.load(open(META)); meta["vitpanel"] = [x0, y0, w, h]
# the icon and its label, each row, cut out of the panel's dark
for name, box in (("vithp", (182, 318, 284, 362)), ("vitsp", (182, 361, 284, 405))):
    bx0, by0, bx1, by1 = box; s = a[by0:by1, bx0:bx1].copy()
    keep = ndimage.binary_dilation(s[:, :, :3].max(axis=2) > 110, iterations=2)
    s[:, :, 3] = ndimage.gaussian_filter(np.where(keep, 255.0, 0.0), 0.9)
    Image.fromarray(np.clip(s, 0, 255).astype(np.uint8), "RGBA").save(f"{OUT}/{name}.webp", lossless=True, quality=100, method=6)
    meta[name] = [bx0, by0, bx1 - bx0, by1 - by0]
json.dump(meta, open(META, "w"), indent=0)
print("ok")
