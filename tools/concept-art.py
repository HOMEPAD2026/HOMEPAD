# tools/concept-art.py — the pictures the game takes from the official concept sheets (design/concept/README.md):
#   images/load/key-NN.webp    the loading screen's key art (and key-NN-bg.webp, its blurred backdrop): the big
#                              picture of an environments.jpg card (its label painted out, the thumbnails left off)
#   images/items/items.webp    one sprite sheet of item icons (CELL px cells, background removed), cut from items.jpg
#                              and overview.jpg section 03; the order is ITEMS below = world-itemart.js's list
#   design/concept/*.webp      the sheets themselves, 2000 px wide, for reference
#
#   python3 -I tools/concept-art.py <folder with the sheets' .jpg> [keys] [items] [refs]
import sys, os, numpy as np
from PIL import Image, ImageFilter, ImageDraw

SRC = sys.argv[1]; WHAT = set(sys.argv[2:]) or {"keys", "items", "refs"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sheet = lambda n: Image.open(os.path.join(SRC, n + ".jpg")).convert("RGB")

# ---------------- key art ----------------
# environments.jpg: a 5x5 grid of cards; each card's picture fills it, a label sits top-left and thumbnails down the right
ECOL, EROW = [15, 900, 1750, 2600, 3457], [195, 707, 1215, 1723, 2236]
KEYS = {1: 570, 8: 560, 12: 430, 17: 545, 22: 500}  # card -> where its label's text ends (px from the picture's left)

def diffuse(x, m, it):
    for _ in range(it):
        p = np.pad(x, ((1, 1), (1, 1), (0, 0)), mode="edge")
        x[m] = ((p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4)[m]
    return x

def inpaint(a, m):
    # fill the masked box from what's around it: coarse first (1/8 size), then refined at full size
    a = a.astype(np.float32); h, w = m.shape; s = 8
    sm = np.array(Image.fromarray(m.astype(np.uint8) * 255).resize((w // s, h // s))) > 0
    sa = np.array(Image.fromarray(a.astype(np.uint8)).resize((w // s, h // s), Image.BILINEAR)).astype(np.float32)
    sa[sm] = sa[~sm].mean(0); co = diffuse(sa, sm, 800)
    up = np.array(Image.fromarray(co.clip(0, 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)).astype(np.float32)
    x = a.copy(); x[m] = up[m]
    return diffuse(x, m, 300)

def keys():
    im = sheet("environments"); out = os.path.join(ROOT, "images/load"); os.makedirs(out, exist_ok=True)
    for n, tr in KEYS.items():
        r, c = divmod(n - 1, 5); ox, oy = ECOL[c] - 20, EROW[r] - 20
        crop = np.array(im.crop((ox + 30, oy + 32, ox + 662, oy + 500)))
        m = np.zeros(crop.shape[:2], bool); m[:110, :tr - 18] = True
        o = Image.fromarray(inpaint(crop, m).clip(0, 255).astype(np.uint8))
        # the painted box, a little softer, blended in at its edge
        mk = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(12))
        o = Image.composite(o.filter(ImageFilter.GaussianBlur(5)), o, mk)
        # the sharp picture (the card's own size is all there is: shown at most ~1.3x, centred), a light unsharp mask;
        # and its backdrop, a tiny blurred dark copy the page stretches over the whole screen (blurred here, not in CSS)
        o.filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2)).save(os.path.join(out, f"key-{n:02d}.webp"), quality=80, method=6)
        bgk = o.resize((96, round(96 * o.height / o.width)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
        Image.eval(bgk, lambda v: int(v * 0.62)).save(os.path.join(out, f"key-{n:02d}-bg.webp"), quality=70, method=6)
        print("key", n, o.size)

# ---------------- item icons ----------------
CELL = 128
# id, sheet, box (x0, y0, x1, y1) in the sheet's own pixels around one object on the light background[, margin
# (smaller where the card's frame is close: the frame must stay out of the box)]
ITEMS = [
    ("hp", "items", (2845, 1910, 2985, 2120)),       # 19 Potion: red
    ("sp", "items", (2650, 1910, 2800, 2120)),       # 19 Potion: blue
    ("recall", "items", (3874, 874, 3999, 1029)),    # 10 Portal device: the small blue one
    ("scrap", "blocks", (3030, 2577, 3205, 2737)),   # 24 Connector: the cross
    ("ore", "blocks", (1552, 2562, 1702, 2752)),     # 22 Terrain block: lava
    ("crystal", "overview", (3300, 913, 3405, 1063)),  # 03 Items: the blue gem
    ("wood", "blocks", (1815, 2645, 1962, 2757), 6),    # 23 Decoration set: the plank block
    ("chest", "overview", (3050, 723, 3225, 883)),   # 03 Items: the gold chest
    ("box", "items", (1776, 1935, 2131, 2262), 6),      # 18 Container box
    ("coin", "items", (58, 2446, 243, 2651)),        # 21 Currency token: gold A
    ("gem", "items", (263, 2446, 438, 2651)),        # 21 Currency token: blue crystal
    ("pickaxe", "items", (73, 1920, 413, 2262), 6),     # 16 Pickaxe
    ("axe", "items", (950, 1895, 1240, 2262), 6),       # 17 Axe
    ("token", "overview", (3880, 913, 4035, 1063)),  # 03 Items: the violet A token
    ("fish", "items", (2121, 1079, 2246, 1209)),     # 08 Fishing rod: the fish
    ("hammer", "overview", (3450, 523, 3605, 688)),  # 03 Items: the hammer
]

def bgmodel(a):
    # the card behind an object is a smooth gradient (dark blue at a card's top, light grey lower down): fit a
    # quadratic surface to the box's border, twice, the second time without the border pixels that are the object
    h, w, _ = a.shape; Y, X = np.mgrid[0:h, 0:w]; Y = Y / h; X = X / w
    B = np.zeros((h, w), bool); B[:3] = B[-3:] = True; B[:, :3] = B[:, -3:] = True
    F = lambda X, Y: np.stack([np.ones_like(X), X, Y, X * X, X * Y, Y * Y], -1)
    A = F(X[B], Y[B]); v = a[B].astype(np.float64); use = np.ones(len(v), bool)
    for _ in range(3):
        c, *_ = np.linalg.lstsq(A[use], v[use], rcond=None)
        e = np.sqrt(((A @ c - v) ** 2).sum(-1)); use = e < max(12, np.percentile(e, 70))
    return F(X, Y) @ c

def cutout(img, box, pad=14, T=30, step=20):
    # the card -> transparent: flood from the box's edge through pixels close to the fitted background (or a soft
    # shadow on it: the background darkened evenly), each step small; what the flood can't reach is the object
    x0, y0, x1, y1 = box; a = np.array(img.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))).astype(np.float64); h, w, _ = a.shape
    bg = bgmodel(a); d = np.sqrt(((a - bg) ** 2).sum(-1))
    r = a / np.maximum(bg, 1); k = r.mean(-1); shadow = (r.std(-1) < 0.08) & (k > 0.72) & (k < 1.05)  # a shadow
    ok = (d < T) | shadow
    seen = np.zeros((h, w), bool); st = [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]
    while st:
        y, x = st.pop()
        if seen[y, x] or not ok[y, x]: continue
        seen[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and not seen[yy, xx] and abs(a[yy, xx] - a[y, x]).sum() < step:
                st.append((yy, xx))
    # the card seen through a hole (inside a fishing rod's arc): a big patch of plain background the flood can't reach
    hole = ok & ~seen & (d < 24); lab = np.zeros((h, w), np.int32); n = 0
    for yy0, xx0 in zip(*np.nonzero(hole)):
        if lab[yy0, xx0]: continue
        n += 1; st2 = [(yy0, xx0)]; lab[yy0, xx0] = n; got = []
        while st2:
            y, x = st2.pop(); got.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and hole[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; st2.append((yy, xx))
        if len(got) > h * w * 0.01:
            for y, x in got: seen[y, x] = True
    fg = ~seen
    # keep the object: the biggest connected piece, and pieces at least 15% its size (sparkles, a neighbour's edge go)
    lab = np.zeros((h, w), np.int32); sizes = [0]
    for yy0 in range(h):
        for xx0 in range(w):
            if fg[yy0, xx0] and not lab[yy0, xx0]:
                n = len(sizes); sizes.append(0); st2 = [(yy0, xx0)]; lab[yy0, xx0] = n
                while st2:
                    y, x = st2.pop(); sizes[n] += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < h and 0 <= xx < w and fg[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; st2.append((yy, xx))
    big = max(sizes); keep = np.array([z >= big * 0.15 for z in sizes]); keep[0] = False; fg = keep[lab]
    m = Image.fromarray((fg * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))  # open: thin fringes go
    m = m.filter(ImageFilter.MinFilter(3))                                    # pull the edge in a pixel (no grey rim)
    m = m.filter(ImageFilter.GaussianBlur(1.1))
    rgba = Image.fromarray(a.clip(0, 255).astype(np.uint8)).convert("RGBA"); rgba.putalpha(m)
    bb = rgba.getbbox(); return rgba.crop(bb) if bb else rgba

def items():
    cache = {}; cells = []
    for id_, sh, box, *pad in ITEMS:
        img = cache.setdefault(sh, sheet(sh)); o = cutout(img, box, *pad)
        k = (CELL - 8) / max(o.size); o = o.resize((max(1, round(o.width * k)), max(1, round(o.height * k))), Image.LANCZOS)
        c = Image.new("RGBA", (CELL, CELL)); c.alpha_composite(o, ((CELL - o.width) // 2, (CELL - o.height) // 2)); cells.append(c)
    cols = 4; rows = (len(cells) + cols - 1) // cols
    out = Image.new("RGBA", (cols * CELL, rows * CELL))
    for i, c in enumerate(cells): out.alpha_composite(c, ((i % cols) * CELL, (i // cols) * CELL))
    d = os.path.join(ROOT, "images/items"); os.makedirs(d, exist_ok=True)
    out.save(os.path.join(d, "items.webp"), quality=82, method=6, alpha_quality=90)
    print("items", out.size, [x[0] for x in ITEMS])
    return out

# ---------------- reference copies ----------------
SHEETS = ("overview", "characters", "outfits", "items", "environments", "blocks", "plants", "effects", "ui-hud")
def refs():
    d = os.path.join(ROOT, "design/concept"); os.makedirs(d, exist_ok=True)
    for f in sorted(os.listdir(SRC)):
        n, e = os.path.splitext(f)
        if n not in SHEETS: continue
        im = sheet(n); im = im.resize((2000, round(im.height * 2000 / im.width)), Image.LANCZOS)
        im.save(os.path.join(d, n + ".webp"), quality=75, method=6); print("ref", n)

if "keys" in WHAT: keys()
if "items" in WHAT: items()
if "refs" in WHAT: refs()
