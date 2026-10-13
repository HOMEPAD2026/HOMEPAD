# the HUD drawn with the sheet's own pieces (images/hud/*.webp): sizes and the places of the live text, from sheet.json
import json, sys
M = json.load(open(sys.argv[1])); V = sys.argv[2] if len(sys.argv) > 2 else "1"
K = 0.56          # sheet px -> HUD px (a phone's 980-px page zooms the HUD 1.42x: 0.8 css px per sheet px)
U = 0.4195        # sheet px -> u (the phone buttons' unit: 1.9 css px on a phone page)
k = lambda v: f"{v * K:.2f}px"
u = lambda v: f"calc({v * U:.2f} * var(--u))"
url = lambda n: f'url("/images/hud/{n}.webp?v={V}")'
def size(n): x, y, w, h = M[n]; return f"width:{k(w)};height:{k(h)}"
def rel(n, X, Y): x, y, w, h = M[n]; return (X - x), (Y - y)
out = []; o = out.append
o("/* ---- b398: the HUD made of the sheet's pieces (world-art/hud-sheet.png, sliced by tools: images/hud/*.webp); the numbers, names and bars on them are live. Generated: tools/hud-sprites.py ---- */")
o("body.wp{--hud-font:'Pretendard Variable',Pretendard,var(--f-ui)}")
spr = lambda sel, n, extra="": o(f"{sel}{{{size(n)};background:{url(n)} center/100% 100% no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;padding:0!important;{extra}}}")
H = "body.wp .wp-hud "
o(H + f".wp-hud-l{{gap:{k(5)}}}")
o(H + f".wp-hud-r{{gap:{k(M['purse'][1] - (M['shop'][1] + M['shop'][3]))}}}")
o(H + ".wc-vit{margin:0!important}")
# brand and World
spr(H + ".wp-brand-in", "brand", "display:block;flex:none")
o(H + ".wp-brand-in>*{display:none}")
o(H + f".wp-brand{{gap:{k(3)};height:auto;align-items:flex-start}}")
x, y = rel("world", 492, 93)
spr(H + ".wp-brand i", "world", f"position:relative;display:block;margin:{k(M['world'][1] - M['brand'][1])} 0 0!important;font:800 {k(28)}/1 var(--hud-font);color:#fff;letter-spacing:0")
o(H + f".wp-brand i{{text-indent:0}}")
o(H + ".wp-brand i svg{display:none}")
o(H + f".wp-brand i{{display:flex;align-items:center;padding-left:{k(x)}!important}}")
# the level plate
spr(H + ".wp-lv", "lv", "position:relative;display:block;flex:none")
fx, fy = rel("lv", 107.5 - 50, 216 - 50)
o(H + f".wp-lv .wp-lv-face{{position:absolute;left:{k(fx)};top:{k(fy)};width:{k(100)};height:{k(100)};border:0;border-radius:50%;box-shadow:none;background:radial-gradient(circle at 45% 35%,#3b8cff,#0d2a6e 75%)}}")
tx, ty = rel("lv", 183, 168)
o(H + f".wp-lv .wp-lv-t{{position:absolute;left:{k(tx)};top:{k(ty)};display:block;min-width:0;width:{k(210)}}}")
o(H + f".wp-lv b{{display:block;font:800 {k(38)}/1 var(--hud-font);color:#5ef0d4;letter-spacing:.01em}}")
o(H + ".wp-lv b::after{display:none}")
o(H + f".wp-lv .wp-xpbar{{display:block;width:{k(202)};height:{k(17)};margin:{k(8)} 0 0;border-radius:{k(9)};background:#071433;box-shadow:inset 0 1px 2px rgba(0,0,0,.6)}}")
o(H + f".wp-lv .wp-xpbar i{{border-radius:{k(9)};background:linear-gradient(180deg,#7ff6ff,#22c6f5 55%,#1593d6);box-shadow:0 0 {k(10)} rgba(64,220,255,.6)}}")
o(H + f".wp-lv small{{display:block;margin-top:{k(9)};font:800 {k(25)}/1 var(--hud-font);color:#38d8ff;white-space:nowrap}}")
# ARCL and the key cards
_, ay = rel("arcl", 0, 207)
spr(H + ".wa-chip", "arcl", f"position:relative;flex:none;margin-top:{k(M['arcl'][1] - M['lv'][1])};display:flex;align-items:center;gap:{k(8)};padding-left:{k(rel('arcl', 490, 0)[0])}!important;color:#fff")
o(H + ".wa-chip img{display:none}")
o(H + f".wa-chip b{{font:800 {k(32)}/1 var(--hud-font);color:#fff}}")
o(H + f".wa-chip small{{font:800 {k(21)}/1 var(--hud-font);color:#e6f0ff;margin-top:{k(4)}}}")
o(H + f".wa-chip .wa-chip-day{{left:{k(70)};right:{k(30)};bottom:{k(16)}}}")
spr(H + ".wp-cards", "cards", f"position:relative;flex:none;margin-top:{k(M['cards'][1] - M['lv'][1])};margin-left:{k(M['cards'][0] - (M['arcl'][0] + M['arcl'][2]))};display:flex;align-items:center;padding-left:{k(rel('cards', 714, 0)[0])}!important")
o(H + ".wp-cards svg{display:none}")
o(H + f".wp-cards b{{font:800 {k(32)}/1 var(--hud-font);color:#fff}}")
o(H + f".wp-chips{{gap:{k(M['arcl'][0] - (M['lv'][0] + M['lv'][2]))};align-items:flex-start;flex-wrap:nowrap}}")
# a pill that stretches (the village chip, the wallet): the key-card pill without its icon, its round ends kept
pill = lambda sel, extra="": o(f"{sel}{{border-style:solid!important;border-color:transparent!important;border-width:0 {k(44)}!important;border-image:{url('cardsblank')} 0 44 fill / 0 {k(44)} stretch!important;background:none!important;box-shadow:none!important;border-radius:0!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;height:{k(M['cardsblank'][3])};{extra}}}")
pill(H + ".wp-rrow .wp-vlv", f"padding:0 {k(6)}!important;margin-right:{k(-14)};color:#fff;font:800 {k(24)}/1 var(--hud-font)")
o(H + ".wp-rrow .wp-vlv span{color:#cfe2ff;font:700 " + k(21) + " var(--hud-font)}")
o(H + ".wp-rrow .wp-vlv b{font:800 " + k(24) + " var(--hud-font);color:#ffd56a}")
pill(H + "#wp-wallet", f"padding:0 {k(6)}!important;font:800 {k(24)}/1 var(--hud-font);color:#fff;height:{k(70)}")
# the HP card
spr(H + ".wc-vit", "vit", "position:relative;display:block")
fx, fy = rel("vit", 112 - 50, 378 - 50)
o(H + f".wc-vit .wc-face{{position:absolute;left:{k(fx)};top:{k(fy)};width:{k(100)};height:{k(100)};border:0;box-shadow:none;background:radial-gradient(circle at 45% 35%,#3b8cff,#0d2a6e 75%)}}")
o(H + ".wc-vit .wc-face b{display:none}")
for cls, cy in (("hp", 340), ("sp", 383), ("xp", 424)):
    rx, ry = rel("vit", 292, cy - 18)
    o(H + f".wc-vit .wc-v.{cls}{{position:absolute;left:{k(rx)};top:{k(ry)};width:{k(585 - 292)};height:{k(36)};display:flex;align-items:center;gap:0}}")
o(H + ".wc-vit .wc-v span{display:none}")
o(H + f".wc-vit .wc-v i{{flex:none;width:{k(148)};height:{k(19)};border-radius:{k(10)};background:#08143a;border:0;box-shadow:inset 0 {k(2)} {k(3)} rgba(0,0,0,.55)}}")
o(H + f".wc-vit .wc-v i b,.wc-vit .wc-v i u{{border-radius:{k(10)}}}")
o(H + ".wc-vit .wc-v.hp i b{background:linear-gradient(180deg,#ff8a9c,#ff3d5c 50%,#e01d45)!important}")
o(H + ".wc-vit .wc-v.sp i b{background:linear-gradient(180deg,#9ff0ff,#38b8ff 50%,#1d84e8)!important}")
o(H + ".wc-vit .wc-v.xp i b{background:linear-gradient(180deg,#8dffd2,#2fe0a0 50%,#17b97c)!important}")
o(H + f".wc-vit .wc-v em{{margin-left:auto;font:800 {k(27)}/1 var(--hud-font);white-space:nowrap;color:#fff;opacity:1!important;letter-spacing:0}}")
o(H + ".wc-vit.calm{padding:0!important}")
# the quest card: the title row and the quest you're on
spr(H + ".wp-quests", "quests", "position:relative;display:block;overflow:visible")
_, hy = rel("quests", 0, 507)
o(H + f".wp-quests-h{{position:absolute;left:0;top:{k(hy - 30)};width:100%;height:{k(60)};padding:0 {k(82)} 0 {k(rel('quests', 122, 0)[0])}!important;display:flex;align-items:center;justify-content:space-between;background:none;font:800 {k(32)}/1 var(--hud-font);color:#fff}}")
o(H + ".wp-quests-h::before,body.wp .wp-hud .wp-quests-h::after{display:none!important}")
o(H + f".wp-quests-h b{{font:800 {k(32)}/1 var(--hud-font);color:#ffc93a}}")
_, ry = rel("quests", 0, 569)
o(H + f".wp-quests ol{{position:absolute;left:0;top:{k(ry - 24)};width:100%;height:{k(48)};margin:0;padding:0!important;display:block}}")
o(H + ".wp-quests li{display:none!important}")
o(H + f".wp-quests li.cur,body.wp .wp-hud .wp-quests li.done-now{{display:flex!important;align-items:center;height:{k(48)};padding:0 {k(82)} 0 {k(rel('quests', 125, 0)[0])};background:none!important;border:0!important;border-radius:0;font:700 {k(27)}/1.1 var(--hud-font);color:#fff}}")
o(H + ".wp-quests li i,body.wp .wp-hud .wp-quests li.cur::after{display:none!important}")
o(H + ".wp-quests li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}")
o(H + f".wp-quests li small{{margin-left:{k(10)};font:800 {k(25)}/1 var(--hud-font);color:#fff}}")
# the right column: Shop, Map and Menu (on a PC too; the rest live in the menu); the purse; who's online; the minimap
o(H + "#wp-photo-btn," + H + "#wp-log-btn," + H + "#wp-vil-btn," + H + "#wp-inbox-btn," + H + "#wp-music-btn," + H + "#wp-help-btn," + H + "#wp-set-btn{display:none!important}")
o(H + "#wp-map-btn," + H + "#wp-more-btn{display:flex!important}")
o(H + f".wp-hud-btns{{gap:{k(2)};padding-top:{k(84)}}}")
o(H + ".wp-hud-btns>.wp-btn:not(.wp-wallet)::before{display:none!important}")
o(H + ".wp-hud-btns>.wp-btn:not(.wp-wallet)>*{position:static}")
for sel, n in (("#wp-shop-btn", "shop"), ("#wp-map-btn", "map"), ("#wp-more-btn", "menu")):
    spr(H + ".wp-hud-btns>" + sel + ".wp-btn", n, "position:relative;animation:none!important")
    o(H + f".wp-hud-btns>{sel} svg{{display:none!important}}")
o(H + ".wp-hud-btns>.wp-btn:not(.wp-wallet):not(#wp-shop-btn):not(#wp-map-btn):not(#wp-more-btn){" + f"{size('tile')};background:{url('tile')} center/100% 100% no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:0!important" + "}")
o(H + f".wp-hud-btns>.wp-btn:not(.wp-wallet) svg.hi{{position:absolute!important;left:50%;top:{k(28)};width:{k(54)};height:{k(54)};transform:translateX(-50%)}}")
lab = f"position:absolute!important;left:0;right:0;top:{k(92 - 17)};text-align:center;font:800 {k(28)}/1 var(--hud-font)!important;color:#fff!important"
o(H + f".wp-hud-btns>.wp-btn:not(.wp-wallet) .wp-bl,body.wp .wp-hud .wp-hud-btns>.wp-btn:not(.wp-wallet)>span:not(.wp-sr),body.wp .wp-hud .wp-hud-btns>.wp-btn:not(.wp-wallet) .wp-sr{{{lab}}}")
o(H + f".wp-hud-btns>.wp-btn[data-dot]:not([data-dot=\"\"])::after{{top:{k(2)}!important;right:{k(2)}!important;width:{k(30)}!important;height:{k(30)}!important;min-width:0!important;border:{k(4)} solid #0b1430!important;background:#ff3d5e!important}}")
spr(H + ".wp-purse", "purse", "position:relative;display:block")
for i, (lx) in enumerate((918, 1096)):
    px, py = rel("purse", lx, 286)
    o(H + f".wp-purse span:nth-child({i + 1}){{position:absolute;left:{k(px)};top:{k(py)};display:block;padding:0;border:0;background:none}}")
o(H + ".wp-purse span::before{display:none!important}")
o(H + f".wp-purse small{{display:block;font:700 {k(16)}/1 var(--hud-font);color:#c9d8f2;letter-spacing:-.01em;white-space:nowrap}}")
o(H + f".wp-purse b{{display:block;margin-top:{k(8)};font:800 {k(29)}/1 var(--hud-font);color:#fff;white-space:nowrap}}")
o(H + f".wp-rrow{{gap:{k(10)};margin-top:{k(M['online'][1] - (M['purse'][1] + M['purse'][3]))}}}")
spr(H + ".wp-online", "online", f"position:relative;display:flex;align-items:center;gap:{k(8)};padding-left:{k(rel('online', 1088, 0)[0])}!important;color:#fff;font:800 {k(25)}/1 var(--hud-font)")
o(H + ".wp-online i{display:none}")
o(H + f".wp-online b,body.wp .wp-hud .wp-online span{{font:800 {k(25)}/1 var(--hud-font);color:#fff}}")
o(H + ".wp-online[hidden]{display:none!important}")
rx0, ry0, rw, rh = M["ring"]; cx, cy, r = M["ringc"]
o(H + f".wp-mini{{position:relative;width:{k(rw)};height:{k(rh)};margin-top:{k(4)};border:0!important;border-radius:0!important;box-shadow:none!important;background:none!important;overflow:visible}}")
cr = r - 9
o(H + f".wp-mini canvas{{position:absolute;left:{k(cx - rx0 - cr)};top:{k(cy - ry0 - cr)};width:{k(2 * cr)}!important;height:{k(2 * cr)}!important;border-radius:50%}}")
o(H + f".wp-mini::after{{content:\"\";position:absolute;inset:0;background:{url('ring')} center/100% 100% no-repeat;pointer-events:none}}")
for sel, n in ((".wp-mini-zoom", "zoom"), (".wp-mini-full", "full")):
    bx, by = M[n][0] - rx0, M[n][1] - ry0
    o(H + f"{sel}{{position:absolute;left:{k(bx)};top:{k(by)};right:auto!important;bottom:auto!important;{size(n)};background:{url(n)} center/100% 100% no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;z-index:2}}")
    o(H + f"{sel} svg{{display:none}}")
o(H + ".wp-mini-zoom[aria-pressed=\"true\"]{filter:brightness(1.35) drop-shadow(0 0 6px #3ee6ff)}")
o(H + ".wp-mini-n{left:40%;bottom:-6px;z-index:3}")
# the dock
D = ".wp-dock"
o(f"body.wp {D}{{gap:0;padding:0!important;background:none!important;border:0!important;border-radius:0}}")
o(f"body.wp .wp-dk{{{size('dk')};background:{url('dk')} center/100% 100% no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;justify-content:flex-start}}")
o("body.wp .wp-dk::before{display:none!important}")
o("body.wp .wp-dk svg{display:none}")
tile = M["dk"]
for n, (sx, sy) in {"char": (46, 1061), "bag": (179, 1060), "craft": (302, 1059), "build": (427, 1057)}.items():
    ix, iy, iw, ih = M["dk-" + n]
    o(f"body.wp #wp-dk-{n}::after{{content:\"\";position:absolute;left:50%;top:{k(iy - sy + 4)};width:{k(iw)};height:{k(ih)};transform:translateX(-50%);background:{url('dk-' + n)} center/100% 100% no-repeat;pointer-events:none}}")
o(f"body.wp .wp-dk span{{position:absolute;left:0;right:0;top:{k(1172 - 1055 - 14)};text-align:center;font:800 {k(23)}/1 var(--hud-font);color:#fff;letter-spacing:-.01em;white-space:nowrap}}")
o(f"body.wp .wp-dk[data-dot]:not([data-dot=\"\"])::before{{content:\"+\"!important;display:block!important;position:absolute;top:{k(-4)};right:{k(-4)};left:auto;width:{k(34)};height:{k(34)};border-radius:50%;background:radial-gradient(circle at 40% 35%,#ff7a90,#e8163e)!important;border:{k(4)} solid #0b1430;font:900 {k(26)}/{k(26)} var(--hud-font);color:#fff;text-align:center;z-index:2}}")
o("body.wp .wp-dk[data-dot]:not([data-dot=\"\"])::after{z-index:1}")
# the stick: the sheet's ring and knob, at rest and in use
jw, jh = M["joy"][2], M["joy"][3]; kx, ky, kw, kh = M["knob"]; kx -= M["joy"][0]; ky -= M["joy"][1]
for sel, s in (("html.wp-pcphone .wp-joyrest", 0.797), ("html.wp-pcphone .wp-joy", 0.797), ("html:not(.wp-pcphone) .wp-joyrest", 0.4), ("html:not(.wp-pcphone) .wp-joy", 0.4)):
    q = lambda v: f"{v * s:.1f}px"
    extra = f"margin:-{q(jh / 2)} 0 0 -{q(jw / 2)};" if "wp-joy\"" in sel or sel.endswith(".wp-joy") else ""
    o(f"{sel}{{width:{q(jw)};height:{q(jh)};{extra}border:0!important;border-radius:0;box-shadow:none!important;background:{url('joy')} center/100% 100% no-repeat!important}}")
    o(f"{sel} i{{left:{q(kx)};top:{q(ky)};width:{q(kw)};height:{q(kh)};margin:0;border-radius:0;box-shadow:none;background:{url('knob')} center/100% 100% no-repeat!important}}")
o(".wp-joyrest b,.wp-joyrest::before{display:none!important}")
o("@media (pointer:coarse){html.wp-pcphone .wp-joyrest{bottom:calc(max(12px,env(safe-area-inset-bottom)) + 62px + 113px + 46px)}html.wp-pcphone.wp-land .wp-joyrest{width:" + f"{jw * 0.68:.1f}px;height:{jh * 0.68:.1f}px" + "}html.wp-pcphone.wp-land .wp-joyrest i{" + f"left:{kx * 0.68:.1f}px;top:{ky * 0.68:.1f}px;width:{kw * 0.68:.1f}px;height:{kh * 0.68:.1f}px;margin:0" + "}}")
# the thumb buttons (phones)
jx, jy, jw2, jh2 = M["jump"]; AR, AB = jx + jw2, jy + jh2
NUDGE = {"emote": (-10, -32), "board": (-3, -32), "run": (4, -32)}
def place(n):
    x, y, w, h = M[n]; dx, dy = NUDGE.get(n, (0, 0)); x += dx; y += dy
    return f"right:{u(AR - (x + w))};bottom:{u(AB - (y + h))};width:{u(w)};height:{u(h)}"
btn = "background-color:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;outline:0"
o("@media (pointer:coarse){")
o("  html.wp-pcphone body.wp .wp-acts,html.wp-pcphone body.wp .wc-bar.coarse{right:max(34px,env(safe-area-inset-right))}")
for sel, n in ((".wp-acts .wp-act-jump", "jump"), (".wp-acts .wp-act-emote", "emote"), (".wp-acts .wp-act-board", "board"), (".wp-acts .wp-act-run", "run")):
    o(f"  body.wp {sel}{{--s:{u(M[n][2])};position:absolute;{place(n)};margin:0;{btn};background:{url(n)} center/100% 100% no-repeat!important}}")
o("  body.wp .wp-acts .wp-act::before,body.wp .wp-acts .wp-act::after{display:none!important}")
o("  body.wp .wp-acts .wp-act svg{display:none}")
o("  body.wp .wp-acts .wp-act:active,body.wp .wp-acts .wp-act.down{transform:translateY(calc(3 * var(--u))) scale(.97);box-shadow:none!important}")
o("  body.wp .wp-acts .wp-act[aria-pressed=\"true\"]{filter:brightness(1.15) drop-shadow(0 0 calc(6 * var(--u)) #7dffb0)}")
ax, ay, aw, ah = M["atk"]; AS = 1.035  # attack a touch bigger than on the sheet: the biggest thumb button with jump
o(f"  body.wp .wc-bar.coarse .wc-attack{{right:{u(AR - (ax + aw))};bottom:{u(AB - (ay + ah))};width:{u(aw * AS)};height:{u(ah * AS)};margin-bottom:{u(-7)};{btn};background:{url('atk')} center/100% 100% no-repeat!important}}")
o("  body.wp .wc-bar.coarse .wc-attack svg,body.wp .wc-bar.coarse .wc-attack::before,body.wp .wc-bar.coarse .wc-attack::after{display:none!important}")
hx, hy, hw, hh = M["pot-hp"]; sx2, sy2, sw, sh = M["pot-sp"]
o(f"  body.wp .wc-bar.coarse .wc-pots{{display:flex;right:{u(AR - (sx2 + sw))};bottom:{u(AB - (hy + hh) + 7)};gap:{u(sx2 - (hx + hw))}}}")
o(f"  body.wp .wc-bar.coarse .wc-pot{{position:relative;width:{u(hw)};height:{u(hh)};{btn};background:{url('pot-hp')} center/100% 100% no-repeat!important}}")
o(f"  body.wp .wc-bar.coarse .wc-pot.sp{{background-image:{url('pot-sp')}!important}}")
o("  body.wp .wc-bar.coarse .wc-pot svg,body.wp .wc-bar.coarse .wc-pot::before,body.wp .wc-bar.coarse .wc-pot::after{display:none!important}")
o(f"  body.wp .wc-bar.coarse .wc-pot em{{left:{u(993 - 23 - hx)};top:{u(943 - 23 - hy)};width:{u(46)};height:{u(46)};min-width:0;padding:0;border-radius:50%;background:radial-gradient(circle at 40% 35%,#1a2348,#03081a);border:{u(3)} solid rgba(150,180,255,.25);display:grid;place-items:center;font:800 {u(26)}/1 var(--hud-font);color:#fff;box-shadow:none}}")
# the skill ball: drawn here (its colour follows the skill), sized and placed like the sheet's
o(f"  body.wp .wc-bar.coarse .wc-slot:not(.locked){{right:{u(AR - 790)};bottom:{u(AB - 1197)};width:{u(136)};height:{u(136)};border:{u(7)} solid #1a0f55!important;border-radius:50%!important;background:radial-gradient(circle at 40% 30%,#e5c4ff 0%,var(--sk1,#a15cff) 38%,var(--sk2,#6f22e0) 72%,var(--sk3,#4a12a8) 100%)!important;box-shadow:inset 0 {u(-8)} 0 rgba(0,0,0,.22),inset 0 {u(6)} 0 rgba(255,255,255,.25),0 0 0 {u(3)} rgba(140,110,255,.55),0 {u(6)} {u(12)} rgba(0,0,0,.4)!important}}")
o(f"  body.wp .wc-bar.coarse .wc-slot:not(.locked)>i svg{{width:{u(58)};height:{u(58)};stroke:#fff;filter:drop-shadow(0 {u(2)} 0 rgba(30,10,80,.6))}}")
o(f"  body.wp .wc-bar.coarse .wc-swap{{left:{u(9 - 7)};top:{u(-20 - 7)};width:{u(52)};height:{u(52)};border-radius:50%;background:radial-gradient(circle at 40% 35%,#24305e,#070d26)!important;border:{u(4)} solid #2a3c8c!important}}")
o(f"  body.wp .wc-bar.coarse .wc-swap svg{{width:{u(28)};height:{u(28)}}}")
o(f"  body.wp .wc-bar.coarse .wc-lockon{{right:{u(404)};bottom:{u(196)};width:{u(100)};height:{u(100)};border-radius:50%;background:radial-gradient(circle at 45% 35%,#1d2a58,#060c26)!important;border:{u(5)} solid #2a3c8c!important;box-shadow:0 {u(5)} 0 #0a1230,0 0 {u(10)} rgba(62,140,255,.35)!important}}")
o("}")
o("/* the skill ball takes the skill's colour */")
for el, c in (("fire", ("#ff9a4a", "#e2541c", "#a8300a")), ("ice", ("#6fd6ff", "#2f8cff", "#1a4fc0")), ("shock", ("#a15cff", "#6f22e0", "#4a12a8")), ("meteor", ("#ff6a5a", "#d6262e", "#8a1018"))):
    o(f"body.wp .wc-slot.wc-{el}{{--sk1:{c[0]};--sk2:{c[1]};--sk3:{c[2]}}}")
o("/* ---- b398 end ---- */")
print("\n".join(out))
