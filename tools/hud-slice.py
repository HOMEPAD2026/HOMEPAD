# slice the HUD sheet into sprites: crop, clean the halo, take the changing text/bars/badges out (filled from around),
# and write lossless WebP. Boxes are in sheet pixels.
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage
SRC, OUT = sys.argv[1], sys.argv[2]
im = np.array(Image.open(SRC).convert("RGBA")).astype(np.float32)
H, W = im.shape[:2]
solid = im[:, :, 3] > 230
lab, n = ndimage.label(solid)

def fill(a, mask, sig=(5, 10, 20, 40, 80)):
    """normalized-convolution fill of the masked pixels (RGBA, premultiplied), on a window round the mask"""
    ys, xs = np.where(mask)
    if not len(xs): return a
    m = 3 * max(sig); y0, y1, x0, x1 = max(0, ys.min() - m), min(a.shape[0], ys.max() + m + 1), max(0, xs.min() - m), min(a.shape[1], xs.max() + m + 1)
    out = a.copy(); out[y0:y1, x0:x1] = fill_win(a[y0:y1, x0:x1], mask[y0:y1, x0:x1], sig); return out
def fill_win(a, mask, sig):
    a = a.copy(); known = (~mask).astype(np.float32)
    pm = a.copy(); pm[:, :, :3] *= a[:, :, 3:4] / 255
    out = pm.copy(); got = np.zeros(mask.shape, bool)
    for s in sig:
        wsum = ndimage.gaussian_filter(known, s)
        for c in range(4):
            v = ndimage.gaussian_filter(pm[:, :, c] * known, s) / np.maximum(wsum, 1e-6)
            sel = mask & ~got & (wsum > 0.02)
            out[:, :, c][sel] = v[sel]
        got |= mask & (wsum > 0.02)
    al = np.clip(out[:, :, 3:4], 1e-3, 255)
    res = out.copy(); res[:, :, :3] = np.where(mask[:, :, None], out[:, :, :3] * 255 / al, a[:, :, :3])
    res[:, :, 3] = np.where(mask, out[:, :, 3], a[:, :, 3])
    return res

def bright(a, x0, y0, x1, y1, t=118, grow=2):
    m = np.zeros(a.shape[:2], bool); sub = a[y0:y1, x0:x1]
    m[y0:y1, x0:x1] = sub[:, :, :3].max(axis=2) > t
    return ndimage.binary_dilation(m, iterations=grow)

def rect(a, x0, y0, x1, y1):
    m = np.zeros(a.shape[:2], bool); m[y0:y1, x0:x1] = True; return m

def comp_mask(box, grow=3, extra=()):
    """the element's own solid pixels (and any extra boxes), grown a little for the soft edge"""
    x, y, w, h = box; m = np.zeros((H, W), bool)
    ids = set(np.unique(lab[y:y + h, x:x + w])) - {0}
    objs = ndimage.find_objects(lab)
    for i in ids:
        sl = objs[i - 1]
        if sl[1].start >= x - 2 and sl[1].stop <= x + w + 2 and sl[0].start >= y - 2 and sl[0].stop <= y + h + 2: m[sl] |= lab[sl] == i
    for (ex, ey, ew, eh) in extra: m[ey:ey + eh, ex:ex + ew] |= solid[ey:ey + eh, ex:ex + ew]
    m = ndimage.binary_fill_holes(m)
    return ndimage.binary_dilation(m, iterations=grow)

def save(name, box, a, keep, pad=4):
    x, y, w, h = box; x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
    t = a.copy(); t[:, :, 3] = np.where(keep, t[:, :, 3], 0)
    crop = np.clip(t[y0:y1, x0:x1], 0, 255).astype(np.uint8)
    Image.fromarray(crop, "RGBA").save(f"{OUT}/{name}.webp", lossless=True, quality=100, method=6)
    return [x0, y0, x1 - x0, y1 - y0]

def mirror_corner(a, box, cw, chh, dx=0):
    """the top-right corner (a red dot sat on it) rebuilt from the top-left one, mirrored"""
    x, y, w, h = box; L = a[y - 6:y - 6 + chh, x + dx:x + dx + cw].copy()
    a[y - 6:y - 6 + chh, x + w - cw - dx:x + w - dx] = L[:, ::-1]
    return a

meta = {}
A = im.copy()
def job(name, box, masks=(), extra=(), pre=None, keepbox=None):
    global A
    a = A.copy()
    if pre: a = pre(a)
    m = np.zeros((H, W), bool)
    for mm in masks: m |= mm(a)
    if m.any(): a = fill(a, m)
    keep = comp_mask(box, extra=extra) if keepbox is None else keepbox
    meta[name] = save(name, box, a, keep)

B = lambda *r, **k: (lambda a: bright(a, *r, **k))
R = lambda *r: (lambda a: rect(a, *r))
# the top left
job("brand", (46, 48, 367, 90))
job("world", (424, 62, 174, 61), [B(482, 72, 585, 114)])
job("lv", (43, 150, 359, 134), [B(176, 165, 300, 212), R(180, 210, 392, 236), B(176, 234, 362, 272)])
job("arcl", (418, 165, 221, 85), [B(486, 184, 630, 232)])
job("cards", (645, 165, 170, 83), [B(710, 184, 806, 232)])
job("cardsblank", (645, 165, 170, 83), [B(660, 182, 806, 234, t=95, grow=3)])
def vitlane(a):
    a = a.copy(); colx = 591
    for y in range(312, 446): a[y, 286:590] = a[y, colx]
    return a
job("vit", (39, 299, 573, 158), [], pre=vitlane)
job("quests", (37, 470, 510, 136), [B(116, 486, 225, 530), B(372, 486, 486, 530), B(118, 548, 486, 592)])
# the top right
job("shop", (844, 134, 115, 117), [B(866, 204, 940, 240, t=150)])
job("map", (966, 132, 107, 117), [B(984, 204, 1056, 240)])
def blanktile(a):
    a = a.copy()
    for y in range(146, 239): a[y, 982:1056] = a[y, 979]
    return a
job("tile", (966, 132, 107, 117), [], pre=blanktile)
def nodot_menu(a): return mirror_corner(a, (1083, 138, 108, 111), 44, 44)
job("menu", (1083, 132, 108, 117), [B(1100, 204, 1176, 240)], pre=nodot_menu)
job("purse", (828, 271, 372, 87), [B(908, 282, 995, 350), B(1094, 282, 1182, 350)])
job("online", (1033, 366, 159, 51), [B(1082, 372, 1186, 412)])
# the minimap: the ring with a clear middle; the zoom and full-map buttons
yy, xx = np.mgrid[0:H, 0:W]
# find the ring's circle from its solid pixels left of the buttons
# the ring's left and top edges, and its height, give the circle (the buttons sit over its right side)
col = solid[427:700, 885:1000]; ys, xs = np.where(col); left = 885 + xs.min(); top = 427 + np.where(solid[400:520, 960:1090])[0].min() + 0 - 27
ys2 = np.where(solid[:, 1000:1050].any(axis=1) & (np.arange(H) > 420) & (np.arange(H) < 720))[0]; top, bot = ys2.min(), ys2.max()
r = (bot - top) / 2; cy = (top + bot) / 2; cx = left + r
print("ring", cx, cy, r)
ring_keep = ((xx - cx) ** 2 + (yy - cy) ** 2 <= (r + 4) ** 2) & ((xx - cx) ** 2 + (yy - cy) ** 2 >= (r - 13) ** 2)
meta["ring"] = save("ring", (int(cx - r), int(cy - r), int(2 * r), int(2 * r)), A, ring_keep & (A[:, :, 3] > 0))
meta["ringc"] = [float(cx), float(cy), float(r)]
zb = (1116, 594, 78, 74); zk = np.zeros((H, W), bool); zk[594:668, 1116:1194] = True
zk &= ((xx - cx) ** 2 + (yy - cy) ** 2 > (r + 2) ** 2) | (xx > 1118)
meta["zoom"] = save("zoom", zb, A, zk & solid | ndimage.binary_dilation(zk & solid, iterations=2) & zk)
job("full", (1116, 669, 76, 69))
# the stick: the ring without its knob, and the knob
kb = (146, 813, 99, 109)
kmask = comp_mask(kb, grow=2)
def noknob(a): return fill(a, kmask)
a2 = noknob(A.copy()); meta["joy"] = save("joy", (50, 716, 296, 297), a2, ndimage.binary_dilation(ndimage.binary_fill_holes(comp_mask((50, 716, 296, 297), grow=0) | kmask), iterations=3))
meta["knob"] = save("knob", kb, A, kmask)
# the buttons
job("emote", (886, 819, 101, 102))
bk = comp_mask((991, 818, 207, 103)); left = bk & (xx < 1094); right = bk & (xx >= 1094)
meta["board"] = save("board", (991, 818, 103, 103), A, left)
meta["run"] = save("run", (1094, 818, 104, 103), A, right)
def pot_digits(x0, y0): return B(x0, y0, x0 + 30, y0 + 30, t=150, grow=1)
job("pot-hp", (963, 915, 115, 112), [pot_digits(980, 928)])
job("pot-sp", (1082, 915, 113, 112), [pot_digits(1097, 928)])
job("atk", (814, 1034, 168, 173))
job("jump", (993, 1033, 182, 185))
# the dock: four tiles without their red dots and labels
# one blank tile (Craft's, which has no red dot) for all four, and each tile's own icon pasted on it
cx0, cy0 = 302, 1059
blank_masks = [R(316, 1068, 408, 1196)]
a = A.copy(); m = np.zeros((H, W), bool)
for mm in blank_masks: m |= mm(a)
# keep the inner edge: only the bright icon/label pixels and their surroundings go
inner = rect(a, 316, 1068, 408, 1196); m = inner & ndimage.binary_dilation(a[:, :, :3].max(axis=2) > 95, iterations=3)
blank = a.copy()
for y in range(1073, 1191): blank[y, 318:406] = blank[y, 316]
tb = (302, 1059, 118, 144)
meta["dk"] = save("dk", tb, blank, comp_mask(tb))
for name, box, icon in [("dk-char", (46, 1061, 126, 142), (78, 1072, 140, 1150)), ("dk-bag", (179, 1060, 116, 142), (203, 1078, 272, 1150)),
                        ("dk-craft", (302, 1059, 118, 144), (325, 1070, 398, 1150)), ("dk-build", (427, 1057, 121, 146), (452, 1068, 520, 1150))]:
    x0, y0, x1, y1 = icon
    src = A[y0:y1, x0:x1].copy(); red = (src[:, :, 0] > 170) & (src[:, :, 1] < 110)
    keepi = ndimage.binary_dilation(src[:, :, :3].max(axis=2) > 120, iterations=4) & ~ndimage.binary_dilation(red, iterations=6)
    out = np.zeros_like(src); out[:, :, :3] = src[:, :, :3]; out[:, :, 3] = np.where(keepi, 255, 0)
    out[:, :, 3] = ndimage.gaussian_filter(out[:, :, 3], 1.2)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA").save(f"{OUT}/{name}.webp", lossless=True, quality=100, method=6)
    meta[name] = [x0, y0, x1 - x0, y1 - y0]
json.dump(meta, open(f"{OUT}/sheet.json", "w"), indent=0)
print(json.dumps(meta))
