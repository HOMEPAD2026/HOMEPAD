# worldgen

Generates `world-data.js` (197 territories: name, capital, ticker, coordinates) and
`world/logos/<ISO2>.svg` (each country's outline in HOMEPAD green — the exact logo a
claim on the World map must use). Run from this folder:

```
npm init -y && npm i world-atlas@2 topojson-client d3-geo
curl -sL -o countries.json https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json
curl -sL -o capitals.geojson https://raw.githubusercontent.com/Stefie/geojson-world/master/capitals.geojson
node gen.mjs && cp -r out/world ../ && cp out/world-data.js ../
```

Regenerating changes the logos byte-for-byte only if the geometry or styling changes —
and a claim is verified by exact `imageUrl` match, so treat a regeneration as a breaking
change for already-claimed capitals.
