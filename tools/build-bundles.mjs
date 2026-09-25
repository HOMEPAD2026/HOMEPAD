#!/usr/bin/env node
// tools/build-bundles.mjs — joins each app page's scripts into one file.
//
// ArcPad used to load 27 separate <script> files; the browser had to fetch
// (and, on a cold cache, round-trip for) every one before the page could run.
// Each page below now loads one bundle instead. The bundle is the same files,
// in the same order, joined together — they stay ordinary classic scripts
// that share globals, exactly like before — then minified.
//
// Edit the source files, never the bundles. bump-cache.sh runs this script, so
// the usual "sh bump-cache.sh" after a change rebuilds everything.
//
//   node tools/build-bundles.mjs          build (minified when esbuild exists)
//   node tools/build-bundles.mjs --check  fail if a bundle is out of date
//   node tools/build-bundles.mjs --force  rebuild even if the sources match
//
// esbuild is optional: without it the bundle is a plain concatenation
// (bigger, same behaviour). To get the minified build:
//   npm i --no-save esbuild@0.24   (or have it on NODE_PATH)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMON_HEAD = ["config-arc.js", "abis.js", "arc-shared.js"];
export const BUNDLES = {
  "arcpad.bundle.js": [
    ...COMMON_HEAD, "wallet-appkit.js", "arc-quote.js", "arcpad.js", "arcpad-coin.js", "arc-fx.js", "arc-activity.js",
    "arc-extras.js", "arcircle-coin.js", "arc-motion.js", "arc-growth.js", "arc-polish.js", "arc-search.js", "arc-footer.js",
    "arcircle-hub.js", "arc-community.js", "arc-lock.js", "arc-coinhead.js", "arc-filters.js", "arc-chartev.js",
    "arc-social.js", "arc-uxfx.js", "arc-a11y.js", "i18n.js",
  ],
  "circlepad.bundle.js": [
    ...COMMON_HEAD, "wallet-appkit.js", "circlepad.js", "arc-fx.js", "arcircle-live.js", "arc-motion.js", "arc-footer.js",
    "arcircle-hub.js", "arc-social.js", "arc-uxfx.js", "arc-a11y.js", "i18n.js",
  ],
  "reward.bundle.js": [
    ...COMMON_HEAD, "arc-fx.js", "arcircle-live.js", "reward.js", "arc-motion.js", "arc-footer.js", "arcircle-hub.js",
    "arc-social.js", "arc-a11y.js", "i18n.js",
  ],
};

async function loadEsbuild() {
  try { return await import("esbuild"); } catch (e) { /* not installed */ }
  for (const dir of (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)) {
    try { return await import(path.join(dir, "esbuild", "lib", "main.js")); } catch (e) { /* keep looking */ }
  }
  return null;
}

// Top-level function declarations are hoisted to the top of whatever script
// they are in. Joined into one file, a second declaration of the same name
// would silently replace the first for code that ran before it — so refuse.
function checkDuplicates(files) {
  const seen = new Map(), dupes = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1] || m[2];
      if (seen.has(name) && seen.get(name) !== f) dupes.push(`${name} (${seen.get(name)} and ${f})`);
      else seen.set(name, f);
    }
  }
  if (dupes.length) throw new Error("top-level name declared in two files:\n  " + dupes.join("\n  "));
}

function join(files) {
  // Each file ends with a newline and a ";" so a file that ends without one
  // can't run into the next (ASI across file boundaries).
  return files.map((f) => `/* ---- ${f} ---- */\n${fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\s*$/, "")}\n;\n`).join("");
}

export async function build({ check = false, force = false } = {}) {
  const esbuild = await loadEsbuild();
  let stale = [];
  for (const [out, files] of Object.entries(BUNDLES)) {
    checkDuplicates(files);
    const src = join(files);
    const hash = crypto.createHash("sha256").update(src).digest("hex").slice(0, 16);
    const banner = `/* ${out} — built by tools/build-bundles.mjs from: ${files.join(", ")}. Do not edit; edit the sources. src:${hash} */\n`;
    let code;
    if (esbuild) {
      // No "format": the input stays a classic script, so esbuild keeps every
      // top-level name (they are globals other files and inline handlers use)
      // and only shortens local ones.
      const r = await esbuild.transform(src, { minify: true, target: "es2020", legalComments: "none", charset: "utf8" });
      code = banner + r.code;
    } else {
      code = banner + src;
    }
    const dest = path.join(ROOT, out);
    const cur = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
    const curHash = (/src:([0-9a-f]{16})/.exec(cur.slice(0, 2000)) || [])[1];
    if (check) { if (curHash !== hash) stale.push(out); continue; }
    if (!force && curHash === hash && cur.length) { console.log(`${out}: up to date`); continue; }
    fs.writeFileSync(dest, code);
    console.log(`${out}: ${files.length} files, ${(src.length / 1024).toFixed(0)} KB -> ${(code.length / 1024).toFixed(0)} KB${esbuild ? " (minified)" : " (not minified: esbuild not found)"}`);
  }
  if (check && stale.length) { console.error("out of date: " + stale.join(", ") + " — run: node tools/build-bundles.mjs"); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build({ check: process.argv.includes("--check"), force: process.argv.includes("--force") }).catch((e) => { console.error(e.message || e); process.exit(1); });
}
