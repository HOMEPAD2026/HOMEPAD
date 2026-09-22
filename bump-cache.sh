#!/usr/bin/env sh
# Every <script src="x.js?v=N"> / <link href="x.css?v=N"> in the HTML pages
# shares one N. Browsers and the CDN key their cache on the full URL, so a
# changed .js/.css shipped under the same ?v= is invisible to anyone who
# already has the old one cached — which is exactly how a day's worth of
# fixes stayed unseen on 2026-09-10. Run this after ANY change to a .js or
# .css file, before committing:   sh bump-cache.sh
#
# Rewrites EVERY ?v=<digits> in every page to one fresh value, so pages that
# drifted onto different versions (or a page with no config.js, like the
# ARCIRCLE splash) all converge — the old version relied on index.html
# carrying config.js?v=, and silently corrupted every URL once it didn't.
set -e
cd "$(dirname "$0")"
NEW=$(date +%s)
for f in *.html; do sed -i -E "s/\?v=[0-9]+/?v=$NEW/g" "$f"; done
echo "cache version -> $NEW ($(grep -l "?v=$NEW" *.html | wc -l) pages, $(grep -oh '?v=[0-9]*' *.html | sort -u | wc -l) distinct value(s) remaining)"
