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
    "arc-extras.js", "arcircle-coin.js", "arc-token.js", "arcircle-tab.js", "arc-motion.js", "arc-growth.js", "arc-polish.js", "arc-search.js", "arc-footer.js",
    "arcircle-hub.js", "arc-community.js", "arc-lock.js", "arc-locker.js", "arc-bridge.js", "arc-coinhead.js", "arc-filters.js", "arc-chartev.js",
    "arc-social.js", "arc-uxfx.js", "arc-a11y.js", "i18n.js",
  ],
  "circlepad.bundle.js": [
    ...COMMON_HEAD, "wallet-appkit.js", "circlepad.js", "arc-fx.js", "arcircle-live.js", "arc-motion.js", "arc-footer.js",
    "arcircle-hub.js", "arc-social.js", "circlepad-fx.js", "circlepad-community.js", "arc-uxfx.js", "arc-a11y.js", "i18n.js",
  ],
  "reward.bundle.js": [
    ...COMMON_HEAD, "arc-fx.js", "arcircle-live.js", "arc-token.js", "reward.js", "arc-motion.js", "arc-footer.js", "arcircle-hub.js",
    "arc-social.js", "arc-a11y.js", "i18n.js",
  ],
  // The $ARCIRCLE page needs no wallet and no ethers (config-arc.js only for
  // the $ARCIRCLE contract / "not live" switch): its numbers come from
  // /api/social?token=arcircle (arc-token.js reads the curve directly if that fails).
  "arcircle.bundle.js": [
    "config-arc.js", "arc-fx.js", "arc-token.js", "arcircle-page.js", "arc-motion.js", "arc-footer.js", "arcircle-hub.js",
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

// abis.js holds every ABI the site has ever used (~100 KB). A bundle only
// keeps the ABI constants that another file in the same bundle names.
// Constants that other kept constants refer to (CIRCLEPAD_ESCROW_ABI =
// BIGPAD_ESCROW_ABI) are kept too.
function shakeAbis(src, files) {
  const others = files.filter((f) => f !== "abis.js").map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  const lines = src.split("\n");
  const decl = lines.map((l) => (/^const ([A-Z0-9_]+) =/.exec(l) || [])[1] || null);
  const uses = (text, name) => new RegExp(`\\b${name}\\b`).test(text);
  const keep = new Set(decl.filter((n) => n && uses(others, n)));
  for (let grew = true; grew;) {
    grew = false;
    const kept = lines.filter((_, i) => decl[i] && keep.has(decl[i])).join("\n");
    for (const n of decl) if (n && !keep.has(n) && uses(kept.replace(new RegExp(`^const ${n} =`, "m"), ""), n)) { keep.add(n); grew = true; }
  }
  return lines.filter((_, i) => !decl[i] || keep.has(decl[i])).join("\n");
}
function join(files) {
  // Each file ends with a newline and a ";" so a file that ends without one
  // can't run into the next (ASI across file boundaries).
  return files.map((f) => {
    let src = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (f === "abis.js") src = shakeAbis(src, files);
    return `/* ---- ${f} ---- */\n${src.replace(/\s*$/, "")}\n;\n`;
  }).join("");
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
