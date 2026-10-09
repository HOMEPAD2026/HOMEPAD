#!/usr/bin/env python3
"""tools/build-updates.py — writes updates.html (/updates): every utility's "New in vN" notes on one page.

The notes live in arcpad.html, in each utility's guide. The guides now show only the newest note
(arc-v9.js folds the rest), so this page is where the whole history is read. Run it after editing a guide:
    python3 tools/build-updates.py
"""
import html, os, re
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "arcpad.html"), encoding="utf-8").read()
soup = BeautifulSoup(src, "html.parser")
ver = re.search(r'\.(?:css|js)\?v=(\d+)', src).group(1)

blocks = []
for panel in soup.select("section.bp-panel"):
    notes = []
    for det in panel.select("details"):
        h = det.select_one("summary > h3")
        if not h:
            continue
        m = re.match(r"\s*New in v(\d+)", h.get_text())
        if not m:
            continue
        body = "".join(str(c) for c in det.contents if getattr(c, "name", None) != "summary").strip()
        notes.append((int(m.group(1)), body))
    if not notes:
        continue
    head = panel.select_one("h1, h2")
    name = re.sub(r"\s+", " ", head.get_text(" ") if head else panel["id"]).strip()
    name = re.sub(r"\s*\b(v\d+|New|Updated regularly|Learning every day|Reads · calls · burns)\b.*$", "", name).strip() or panel["id"]
    tab = panel["id"].replace("bp-panel-", "")
    notes.sort(key=lambda n: -n[0])
    blocks.append((name, tab, notes))

items = "\n".join(
    f'''    <section class="up-u" id="{tab}">
      <div class="up-h"><h2>{html.escape(name)}</h2><a href="/arc#{tab}">Open {html.escape(name)}</a></div>
''' + "\n".join(f'''      <article class="up-n"><span class="up-v">v{v}</span><div class="up-b">{b}</div></article>''' for v, b in notes) + "\n    </section>"
    for name, tab, notes in blocks)
toc = "".join(f'<a href="#{tab}">{html.escape(name)}</a>' for name, tab, _ in blocks)

page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>What's new — ARCIRCLE PAD</title>
<meta name="description" content="Every update to ARCIRCLE PAD's utilities, newest first.">
<link rel="canonical" href="https://www.arcircle.app/updates">
<meta name="theme-color" content="#04060a">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png?v={ver}">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/arc.min.css?v={ver}">
<style>
.up{{position:relative;z-index:1;max-width:860px;margin:0 auto;padding:36px 20px 80px;color:#dfe6f4;font-family:Sora,Inter,system-ui,sans-serif}}
.up h1{{font-size:clamp(2rem,4vw,2.8rem);margin:0 0 8px;color:#fff}}
.up .lede{{color:#97a3c0;margin:0 0 22px}}
.up-toc{{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 30px}}
.up-toc a{{padding:7px 13px;border-radius:999px;border:1px solid rgba(150,175,255,.18);color:#c6d2ec;text-decoration:none;font-size:13px}}
.up-toc a:hover{{background:rgba(120,150,255,.1)}}
.up-u{{margin:0 0 34px;padding-top:8px}}
.up-h{{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(150,175,255,.14);padding-bottom:10px;margin-bottom:14px}}
.up-h h2{{margin:0;font-size:1.3rem;color:#fff}}
.up-h a{{color:#7fb0ff;font-size:13px;text-decoration:none;white-space:nowrap}}
.up-n{{display:grid;grid-template-columns:52px 1fr;gap:12px;padding:12px 0;border-bottom:1px dashed rgba(150,175,255,.1)}}
.up-v{{align-self:start;justify-self:start;padding:3px 9px;border-radius:8px;background:rgba(77,141,255,.14);color:#a9c8ff;font-weight:700;font-size:12px}}
.up-b{{font-size:14px;line-height:1.6;color:#c9d3e8}}
.up-b ul{{margin:0;padding-left:18px}} .up-b li{{margin:0 0 6px}} .up-b p{{margin:0 0 8px}} .up-b a{{color:#7fb0ff}}
@media (max-width:560px){{.up-n{{grid-template-columns:1fr;gap:6px}}}}
</style>
</head>
<body class="ax-page pg-updates">
<div class="ax-bg" aria-hidden="true"><div class="ax-bg-art"></div><div class="ax-bg-glow"></div></div>
<main class="up">
  <h1>What's new</h1>
  <p class="lede">Every update to ARCIRCLE PAD's utilities, newest first.</p>
  <nav class="up-toc" aria-label="Utilities">{toc}</nav>
{items}
</main>
<script src="/arc-nav.js?v={ver}"></script>
<script src="/arc-connect.js?v={ver}"></script>
<script src="/arc-chrome.js?v={ver}"></script>
<script src="/arc-v9.js?v={ver}"></script>
<script src="/arc-v10.js?v={ver}"></script>
</body>
</html>
'''
open(os.path.join(ROOT, "updates.html"), "w", encoding="utf-8").write(page)
print(f"updates.html: {len(blocks)} utilities, {sum(len(n) for _, _, n in blocks)} notes")
