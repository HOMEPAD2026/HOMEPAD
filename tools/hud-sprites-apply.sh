#!/bin/sh
# regenerate the sprite HUD's CSS from world-art/hud-sheet.json and put it at the end of arc-v10.css (replacing the old block)
set -e
cd "$(dirname "$0")/.."
python3 -I tools/hud-sprites.py world-art/hud-sheet.json "${1:-1}" > /tmp/hud-sprites.css
python3 -I - <<'PY'
s = open("arc-v10.css").read(); a = s.find("/* ---- b398: the HUD made of the sheet"); b = s.find("/* ---- b398 end ---- */")
if a >= 0: s = s[:a].rstrip("\n") + "\n" + s[b + len("/* ---- b398 end ---- */"):].lstrip("\n")
open("arc-v10.css", "w").write(s.rstrip("\n") + "\n" + open("/tmp/hud-sprites.css").read())
PY
