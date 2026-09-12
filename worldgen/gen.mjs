// Generates: world-data.js (country/capital list) and world/logos/{ISO2}.svg
// (country outline in HOMEPAD green, the exact logo a claim must use).
import fs from "node:fs";
import * as topojson from "topojson-client";
import { geoPath, geoMercator } from "d3-geo";

const countries = JSON.parse(fs.readFileSync("countries.json", "utf8"));
const capitals = JSON.parse(fs.readFileSync("capitals.geojson", "utf8")).features;
const load = (res) => { const t = JSON.parse(fs.readFileSync(`node_modules/world-atlas/countries-${res}.json`, "utf8")); return topojson.feature(t, t.objects.countries).features; };
const byNum50 = new Map(load("50m").map((f) => [String(f.id).padStart(3, "0"), f]));
const byNum110 = new Map(load("110m").map((f) => [String(f.id).padStart(3, "0"), f]));
import { geoArea, geoCentroid, geoDistance } from "d3-geo";
// Fit the frame to the country's largest landmass (mainland), not to every
// far-flung island — otherwise the US is a speck beside Alaska and Hawaii.
// Returns the polygons that make up the "home" landmass group: the largest
// polygon plus every polygon whose centroid is within ~30° of it. Keeps an
// archipelago (Indonesia, Philippines, Japan) together, drops overseas
// territories and antimeridian slivers (French Guiana, Alaska/Hawaii, Chukotka).
const homeGroup = (feat) => {
  if (feat.geometry.type !== "MultiPolygon") return feat;
  const polys = feat.geometry.coordinates.map((coords) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: coords } }));
  let main = polys[0], bestA = -1;
  for (const p of polys) { const a = geoArea(p); if (a > bestA) { bestA = a; main = p; } }
  const c0 = geoCentroid(main);
  const keep = polys.filter((p) => geoDistance(c0, geoCentroid(p)) * 180 / Math.PI <= 30);
  return { type: "FeatureCollection", features: keep };
};

const capByIso2 = new Map(capitals.map((f) => [f.properties.iso2, f]));
const EXTRA = new Set(["VA", "PS", "XK", "TW"]); // non-UN members NEIGHBOURHOODS-style maps also count
const tickerFor = (capital, iso3) => {
  const t = capital.toUpperCase().replace(/[^A-Z]/g, "");
  return t.length >= 3 && t.length <= 11 ? t : iso3;
};

const out = [];
fs.mkdirSync("out/world/logos", { recursive: true });
for (const c of countries) {
  if (!(c.unMember || EXTRA.has(c.cca2))) continue;
  const cap = capByIso2.get(c.cca2);
  const capitalName = (c.capital && c.capital[0]) || (cap && cap.properties.city);
  if (!capitalName) { console.warn("no capital", c.cca2); continue; }
  let lnglat = cap ? cap.geometry.coordinates : (c.latlng ? [c.latlng[1], c.latlng[0]] : null);
  if (!lnglat) { console.warn("no coords", c.cca2); continue; }
  let feat = byNum50.get(c.ccn3);
  // --- logo: outline fitted into 400x400, capital dot ---
  let svg;
  if (feat) {
    const W = 400, PAD = 44;
    const group = homeGroup(feat);
    const [lon0] = geoCentroid(group);
    // Rotate the projection onto the country first so nothing straddles the
    // antimeridian at fit time (Russia, Fiji, NZ) — then fit to the home group.
    const proj = geoMercator().rotate([-lon0, 0]).fitExtent([[PAD, PAD], [W - PAD, W - PAD]], group);
    let path = geoPath(proj);
    let d = path(feat);
    if (d.length > 40000) { const f110 = byNum110.get(c.ccn3) || feat; d = path(f110); }
    const [cx, cy] = proj(lnglat);
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">` +
      `<rect width="400" height="400" rx="56" fill="#0b1510"/>` +
      `<path d="${d}" fill="#39ff88" fill-opacity="0.18" stroke="#39ff88" stroke-width="3" stroke-linejoin="round"/>` +
      (Number.isFinite(cx) && Number.isFinite(cy) ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="#ffb648" stroke="#0b1510" stroke-width="3"/>` : "") +
      `<text x="200" y="372" text-anchor="middle" font-family="monospace" font-size="22" fill="#39ff88" letter-spacing="2">${escapeXml(capitalName.toUpperCase())}</text>` +
      `</svg>`;
  } else {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><rect width="400" height="400" rx="56" fill="#0b1510"/><circle cx="200" cy="190" r="70" fill="#39ff88" fill-opacity="0.18" stroke="#39ff88" stroke-width="3"/><circle cx="200" cy="190" r="9" fill="#ffb648"/><text x="200" y="372" text-anchor="middle" font-family="monospace" font-size="22" fill="#39ff88" letter-spacing="2">${escapeXml(capitalName.toUpperCase())}</text></svg>`;
    console.warn("no geometry, generic logo", c.cca2, c.name.common);
  }
  fs.writeFileSync(`out/world/logos/${c.cca2}.svg`, svg);
  out.push({
    iso2: c.cca2, iso3: c.cca3, ccn3: c.ccn3,
    name: c.name.common,                        // on-chain token name
    nameKo: c.translations?.kor?.common || "",
    capital: capitalName,                       // display
    ticker: tickerFor(capitalName, c.cca3),     // on-chain symbol
    lnglat: [Number(lnglat[0].toFixed(3)), Number(lnglat[1].toFixed(3))],
    flag: c.flag || "", region: c.region || "",
  });
}
function escapeXml(s) { return s.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[ch])); }
out.sort((a, b) => a.name.localeCompare(b.name));
const dup = out.map((x) => x.ticker).filter((t, i, a) => a.indexOf(t) !== i);
if (dup.length) console.warn("duplicate tickers:", dup);
fs.writeFileSync("out/world-data.js",
  `// Generated by worldgen/gen.mjs — one entry per territory on the World map.\n` +
  `// name = on-chain token name, ticker = on-chain symbol; a launch claims a\n` +
  `// capital only if both match exactly AND its logo is world/logos/<iso2>.svg.\n` +
  `const WORLD_COUNTRIES = ${JSON.stringify(out)};\n`);
console.log("countries:", out.length);
