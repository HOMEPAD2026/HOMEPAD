#!/usr/bin/env sh
# Every <script src="x.js?v=N"> / <link href="x.css?v=N"> in the HTML pages
# shares one N. Browsers and the CDN key their cache on the full URL, so a
# changed .js/.css shipped under the same ?v= is invisible to anyone who
# already has the old one cached — which is exactly how a day's worth of
# fixes stayed unseen on 2026-09-10. Run this after ANY change to a .js or
# .css file, before committing:   sh bump-cache.sh
set -e
cd "$(dirname "$0")"
OLD=$(grep -oh 'config\.js?v=[0-9]*' index.html | head -1 | sed 's/.*?v=//')
NEW=$(date +%s)
for f in *.html; do sed -i "s/?v=$OLD/?v=$NEW/g" "$f"; done
echo "cache version: $OLD -> $NEW ($(grep -l "?v=$NEW" *.html | wc -l) pages)"
