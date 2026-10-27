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
    "i18n-boot.js", "arc-solwallet.js", ...COMMON_HEAD, "arc-fmt.js", "arc-lazy.js", "wallet-appkit.js", "arc-quote.js", "arcpad.js", "arcpad-coin.js", "arc-fx.js", "arc-activity.js",
    "arc-extras.js", "arcircle-coin.js", "arc-token.js", "arcircle-tab.js", "arc-motion.js", "arc-growth.js", "arc-polish.js", "arc-search.js", "arc-footer.js",
    "arcircle-hub.js", "arc-community.js", "arc-lock.js", "arc-coinhead.js", "arc-filters.js", "arc-argus.js", "arc-pons.js", "arc-arcpad-rh.js", "arc-quantum.js", "arc-pump.js", "arc-chartev.js", "arcpad-v6.js", "arcpad-v7.js", "arcpad-v7-coin.js", "arc-tour.js",
    "arc-social.js", "arc-burnvote-chip.js", "arc-uxfx.js", "arc-cmdk.js", "arc-nav.js", "arc-connect.js", "arc-v9.js", "arc-v10.js", "arc-v12.js", "arc-feel.js", "arc-chrome.js", "arc-a11y.js", "arc-txring.js", "arc-glyph.js", "arc-arcia-fab.js", "arc-tglink.js", "i18n.js",
  ],
  // The utilities (Locker, Bridge, Scanner, Multisender, Snapshot, Relay, ARCIA, Liquidity, OMNI) are ~half of
  // ArcPad's code but most visits never open one: arc-lazy.js loads this the first time a utility tab opens.
  // It runs after arcpad.bundle.js and shares its globals (ethers, CONFIG, state, the ABIs).
  "arcpad-tools.bundle.js": [
    "arc-locker.js", "arc-bridge.js", "scan-core.js", "arc-scanner.js", "arc-scanner-x.js", "arc-multisend.js", "snap-core.js", "arc-snapshot.js", "arc-relay.js", "arc-arcia.js", "arc-arcia402.js", "arc-works.js", "arc-mine.js", "arc-desk.js", "arc-agent.js", "liq-core.js", "arc-orders-sol.js", "arc-orders.js", "arc-orders-x.js", "arc-order-line.js", "arc-orders-v4.js", "arc-orders-v5.js", "arc-predict.js", "arc-predict-x.js", "arc-swap.js", "arc-swap-x.js", "arc-paper.js", "arc-perp.js", "arc-staking.js", "arc-launchdrop.js", "arc-nft.js", "arc-vearcia.js", "arc-liquidity.js", "arc-omni.js", "arc-uhub.js",
  ],
  "circlepad.bundle.js": [
    "i18n-boot.js", ...COMMON_HEAD, "arc-fmt.js", "wallet-appkit.js", "circlepad-boot.js", "circlepad-plan.js", "circlepad.js", "circlepad-conv.js", "arc-fx.js", "arcircle-live.js", "arc-motion.js", "arc-footer.js",
    "arcircle-hub.js", "arc-social.js", "circlepad-fx.js", "circlepad-community.js", "circlepad-plus.js", "circlepad-ideas.js", "circlepad-round.js", "circlepad-rounds.js", "circlepad-live.js", "circlepad-look.js", "circlepad-v5.js", "circlepad-v9.js", "arc-uxfx.js", "arc-cmdk.js", "arc-nav.js", "arc-connect.js", "arc-v9.js", "arc-v10.js", "arc-v12.js", "arc-feel.js", "arc-chrome.js", "arc-a11y.js", "arc-txring.js", "arc-glyph.js", "arc-arcia-fab.js", "i18n.js",
  ],
  "reward.bundle.js": [
    "i18n-boot.js", ...COMMON_HEAD, "arc-fmt.js", "arc-fx.js", "arcircle-live.js", "arc-token.js", "reward.js", "reward-engine.js", "arc-motion.js", "arc-footer.js", "arcircle-hub.js",
    "arc-social.js", "arc-cmdk.js", "arc-nav.js", "arc-connect.js", "arc-v9.js", "arc-v10.js", "arc-v12.js", "arc-feel.js", "arc-chrome.js", "arc-a11y.js", "arc-txring.js", "arc-glyph.js", "arc-arcia-fab.js", "i18n.js",
  ],
  // The $ARCIRCLE page needs no wallet and no ethers (config-arc.js only for
  // the $ARCIRCLE contract / "not live" switch): its numbers come from
  // /api/social?token=arcircle (arc-token.js reads the curve directly if that fails).
  "arcircle.bundle.js": [
    "i18n-boot.js", "config-arc.js", "arc-fmt.js", "arc-fx.js", "arc-token.js", "arcircle-page.js", "arcircle-plus.js", "arc-motion.js", "arc-footer.js", "arcircle-hub.js",
    "arc-social.js", "arc-burnvote-chip.js", "arc-cmdk.js", "arc-nav.js", "arc-connect.js", "arc-v9.js", "arc-v10.js", "arc-v12.js", "arc-feel.js", "arc-chrome.js", "arc-a11y.js", "arc-glyph.js", "arc-arcia-fab.js", "i18n.js",
  ],
  // The home page (index.html). arc-log.js and i18n-boot.js stay in its <head> and world-lock.js / arc-gate.js at the
  // top of <body> (the front door has to be up before the page paints); everything else is this one file, loaded
  // where the separate tags were (end of <body>, not deferred: the scripts start themselves on DOMContentLoaded while
  // the document is still "loading", in this order, exactly as the old tags did).
  "home.bundle.js": [
    "arc-hubpulse.js", "config-arc.js", "arc-home-live.js", "arcircle-hub.js", "arc-burnvote-chip.js", "arc-social.js", "arc-footer.js", "arc-fmt.js", "arc-fx.js", "arc-home.js",
    "arc-cmdk.js", "arc-nav.js", "arc-connect.js", "arc-v9.js", "arc-v10.js", "arc-v12.js", "arc-feel.js", "arc-chrome.js", "i18n.js", "arc-glyph.js", "arc-arcia-fab.js",
  ],
  // ARCIA on pages other than ArcPad: arc-arcia-fab.js loads this on the first tap of "Ask ARCIA"
  // (ArcPad itself gets her from arcpad-tools.bundle.js).
  "arcia.bundle.js": ["arc-order-line.js", "arc-arcia.js"],
  // /me, /stats, /roadmap, /brand, /start — small standalone pages (ethers from vendor/).
  "pages.bundle.js": [
    "i18n-boot.js", ...COMMON_HEAD, "arc-fmt.js", "arc-fx.js", "arc-motion.js", "arc-footer.js", "arcircle-hub.js", "arc-social.js", "arc-pages.js", "arc-cmdk.js", "arc-nav.js", "arc-connect.js", "arc-v9.js", "arc-v10.js", "arc-v12.js", "arc-feel.js", "arc-chrome.js", "arc-a11y.js", "arc-txring.js", "arc-glyph.js", "arc-arcia-fab.js", "i18n.js",
  ],
};

// One stylesheet for the ARCIRCLE PAD pages that use style.css: the site styles, the shared menu and the v9
// layer, joined and minified (one request instead of three). arcia / arcat / wallet keep their own stage.css and link
// arc-nav.css + arc-v9.css directly; older pages keep style.css.
export const CSS_BUNDLES = { "arc.min.css": ["style.css", "arc-nav.css", "arc-v9.css", "arc-v10.css", "arc-polish.css"] };

// ARCIRCLE World (/play) needs a sliver of style.css (1.6 MB, the whole site): world.min.css keeps the rules of
// "purge" whose classes and ids appear in "scan" (the game's page and scripts), plus "keep" in full. Rules with no
// class or id (:root, html, body, inputs) and every @keyframes / @font-face stay.
export const CSS_PURGED = {
  // (2026-10-27, the owner: "/studio — the Studio on its own web page, fast"): the Studio's web pages (studio-app.html at
  // /studio, studio-web.html at /game/@…) need only the Studio's rules, not the whole World's
  "studio.min.css": {
    purge: ["style.css", "arc-nav.css", "arc-v9.css", "arc-v10.css", "world-skin.css"],
    keep: [],
    scan: ["studio-app.html", "studio-web.html", ...withImports(["world-studio-web.js", "world-studio.js", "world-studio-build.js", "world-studio-arena.js", "world-studio-tdbuild.js", "world-studio-jbuild.js", "world-studio-race.js", "world-studio-rhythm.js", "world-studio-jump.js", "world-studio-climb.js", "world-studio-defense.js", "world-studio-pad.js", "world-studio-prev.js", "world-ask.js"])],
  },
  "world.min.css": {
    purge: ["style.css"],
    keep: ["arc-nav.css", "arc-v9.css", "arc-v10.css", "world-skin.css"],
    scan: ["play.html", "world-play.js", "world-pet.js", "world-chat.js", "world-party.js", "world-kit.js", "world-island.js", "world-shop.js", "world-style.js", "world-support.js", "world-combat.js", "world-rpg.js", "world-rpg-data.js", "world-zones.js", "world-quests.js", "world-social.js", "world-inbox.js", "world-race.js", "world-wardrobe.js", "world-season.js", "world-lock.js", "arc-connect.js", "i18n.js", "i18n-boot.js", "arc-log.js"],
  },
};
// Per-page stylesheets. arc.min.css is the whole site's styles (~1.9 MB, ~360 KB gzipped), render-blocking, and most
// pages use a fifth of it or less. Each page below links its own cut of the same sources instead: the rules
// whose classes and ids can appear on that page — its HTML plus every script it runs, including the ones it loads
// later (arcpad-tools.bundle.js, ARCIA, the escrow code). The cut is deliberately loose (see pageUsage): a rule kept
// for nothing costs a few bytes, a rule dropped by mistake breaks the page. arc.min.css is still built (updates.html,
// which tools/build-updates.py writes, and anything new links it).
const ARCIA_LAZY = BUNDLES["arcia.bundle.js"];
export const CSS_PAGES = {
  "index.min.css": ["index.html", "arc-log.js", "i18n-boot.js", "world-lock.js", "arc-gate.js", "world-gate.js", "world-kit.js", ...BUNDLES["home.bundle.js"], ...ARCIA_LAZY],
  "arcpad.min.css": ["arcpad.html", "arc-log.js", "wallet-arc.js", ...BUNDLES["arcpad.bundle.js"], ...BUNDLES["arcpad-tools.bundle.js"]],
  "circlepad.min.css": ["circlepad.html", "arc-log.js", ...BUNDLES["circlepad.bundle.js"], "circlepad-escrow-code.js", ...ARCIA_LAZY],
  "arcircle.min.css": ["arcircle.html", "arc-log.js", ...BUNDLES["arcircle.bundle.js"], ...ARCIA_LAZY],
  "reward.min.css": ["reward.html", "arc-log.js", ...BUNDLES["reward.bundle.js"], ...ARCIA_LAZY],
  // the small pages share one: /me /stats /roadmap /brand /start /support /arcl /airdrops
  "pages.min.css": ["me.html", "stats.html", "roadmap.html", "brand.html", "start.html", "support.html", "arcl.html", "airdrops.html", "arcl-page.js", "support-page.js", "arc-drops.js", "arc-log.js", ...BUNDLES["pages.bundle.js"], ...ARCIA_LAZY],
};
// The listed files plus every same-site ES module they import, statically or with import() (arcl-page.js renders
// world-shop.js's markup, arc-gate.js loads world-gate.js, ...), followed all the way down. vendor/ is left out.
export function withImports(files) {
  const out = [...files];
  for (let i = 0; i < out.length; i++) {
    if (!/\.m?js$/.test(out[i])) continue;
    const src = fs.readFileSync(path.join(ROOT, out[i]), "utf8");
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'`](?:\.\/|\/)?([\w.-]+\.m?js)/g))
      if (!out.includes(m[1]) && fs.existsSync(path.join(ROOT, m[1]))) out.push(m[1]);
  }
  return out;
}
// What a page's sources can put in class / id attributes:
//   used      every identifier-like word in them (so "ax-card" in a string, a template or the HTML counts)
//   prefixes  words that something is glued onto — "ax-tab-" + name, `cp-st-${s}`, "lvl" + n — every class starting
//             with one is kept
//   suffixes  "-on" / `${k}-active` — every class ending with one is kept
//   numbered  one- or two-letter words glued the same way ("t" + n, `vt${i}`): only those followed by digits (t3, vt1)
export function pageUsage(text) {
  const used = new Set(text.match(/[_a-zA-Z][\w-]*/g));
  const prefixes = new Set(), suffixes = new Set(), numbered = new Set();
  for (const w of used) if (/[-_]$/.test(w) && w.length >= 2) prefixes.add(w);
  for (const m of text.matchAll(/([_a-zA-Z][\w-]*)(?:["'`]\s*\+|\$\{)/g)) (m[1].length >= 3 ? prefixes : numbered).add(m[1]);
  for (const m of text.matchAll(/(?:\}|\+\s*["'`])(-[\w-]*[_a-zA-Z0-9])/g)) suffixes.add(m[1]);
  const num = numbered.size ? new RegExp(`^(?:${[...numbered].join("|")})\\d`) : null;
  return { used, prefixes: [...prefixes], suffixes: [...suffixes], numbered: num };
}

// @keyframes that nothing kept names (a rule's animation, or a script / inline style setting one) go too.
export function dropUnusedKeyframes(css, used) {
  const pieces = cssPieces(css);
  const rest = pieces.filter((p) => !(p.pre && /^@(-webkit-)?keyframes\b/.test(p.pre))).map((p) => p.stmt || `${p.pre}{${p.body}}`).join("\n");
  const named = new Set(rest.match(/[_a-zA-Z][\w-]*/g));
  return pieces.map((p) => {
    if (p.stmt) return p.stmt;
    const k = /^@(?:-webkit-)?keyframes\s+["']?([\w-]+)/.exec(p.pre);
    return k && !named.has(k[1]) && !used.has(k[1]) ? "" : `${p.pre}{${p.body}}`;
  }).filter(Boolean).join("\n");
}

/// the top-level pieces of a stylesheet: { pre, body } for blocks, { stmt } for "@import …;"
function cssPieces(css) {
  const out = []; let i = 0, n = css.length;
  while (i < n) {
    // skip spaces and comments
    while (i < n) { if (/\s/.test(css[i])) i++; else if (css.startsWith("/*", i)) { const e = css.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; } else break; }
    if (i >= n) break;
    let j = i, q = null, depth = 0, pre = null;
    for (; j < n; j++) {
      const c = css[j];
      if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (css.startsWith("/*", j)) { const e = css.indexOf("*/", j + 2); j = (e < 0 ? n : e + 2) - 1; continue; }
      if (c === "{") { if (depth === 0) pre = css.slice(i, j).trim(), i = j + 1; depth++; }
      else if (c === "}") { depth--; if (depth === 0) { out.push({ pre, body: css.slice(i, j) }); j++; break; } }
      else if (c === ";" && depth === 0) { out.push({ stmt: css.slice(i, j + 1).trim() }); j++; break; }
    }
    i = j;
  }
  return out;
}
const splitSel = (s) => { const out = []; let d = 0, cur = ""; for (const c of s) { if (c === "(" || c === "[") d++; else if (c === ")" || c === "]") d--; if (c === "," && d === 0) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out.map((x) => x.trim()).filter(Boolean); };
// "usage" is a Set of words (world.min.css), or pageUsage()'s { used, prefixes, suffixes } — then a name passes if a
// prefix or suffix covers it, and whatever sits inside :not() / :is() / :where() / :has() / :nth-*() is not required
// at all (".btn:not(.ghost)" styles every .btn even when no .ghost exists anywhere).
export function purgeCss(css, usage) {
  const loose = !(usage instanceof Set), used = loose ? usage.used : usage;
  const has = !loose ? (n) => used.has(n) : (n) => used.has(n) || usage.prefixes.some((p) => n.startsWith(p)) || usage.suffixes.some((x) => n.endsWith(x)) || !!(usage.numbered && usage.numbered.test(n));
  const unwrap = (sel) => { let out = "", d = 0; for (const c of sel) { if (c === "(") d++; else if (c === ")") d--; else if (!d) out += c; } return out; };
  const keepSel = (sel) => {
    let t = sel.replace(/\[[^\]]*\]/g, "");
    t = loose ? unwrap(t) : t.replace(/:(?:not|is|where|has)\(/g, "(");
    const names = t.match(/[.#](-?[_a-zA-Z][\w-]*)/g) || [];
    return names.every((x) => has(x.slice(1)));
  };
  return cssPieces(css).map((p) => {
    if (p.stmt) return p.stmt;
    if (/^@(media|supports|container|layer)\b/.test(p.pre)) { const inner = purgeCss(p.body, usage); return inner.trim() ? `${p.pre}{${inner}}` : ""; }
    if (p.pre.startsWith("@")) return `${p.pre}{${p.body}}`;
    const sels = splitSel(p.pre).filter(keepSel);
    return sels.length ? `${sels.join(",")}{${p.body}}` : "";
  }).filter(Boolean).join("\n");
}

// A lazy bundle runs on top of its parent: ABI shaking keeps what either needs, and a
// top-level name may not be declared in both.
const PARTNERS = { "arcpad.bundle.js": ["arcpad-tools.bundle.js"], "arcpad-tools.bundle.js": ["arcpad.bundle.js"] };
const partnerFiles = (out) => (PARTNERS[out] || []).flatMap((b) => BUNDLES[b]);

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
function shakeAbis(src, files, extra = []) {
  const others = [...files, ...extra].filter((f) => f !== "abis.js").map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
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
function join(files, extra = []) {
  // Each file ends with a newline and a ";" so a file that ends without one
  // can't run into the next (ASI across file boundaries).
  return files.map((f) => {
    let src = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (f === "abis.js") src = shakeAbis(src, files, extra);
    return `/* ---- ${f} ---- */\n${src.replace(/\s*$/, "")}\n;\n`;
  }).join("");
}

// The Token Scanner engine is written once, as an ES module the server
// imports (api/_scan-core.mjs). The browser gets the same code as a classic
// script: scan-core.js, generated here — exports dropped, everything wrapped in
// one function and handed out as window.ArcScanCore.
// The Holder Snapshot engine is shared the same way: api/_snap-core.mjs →
// snap-core.js (window.ArcSnapCore).
const CORES = [["api/_scan-core.mjs", "scan-core.js", "ArcScanCore"], ["api/_snap-core.mjs", "snap-core.js", "ArcSnapCore"], ["api/_liq-core.mjs", "liq-core.js", "ArcLiqCore"]];
function coreScript(CORE_SRC, CORE_OUT, NAME) {
  const src = fs.readFileSync(path.join(ROOT, CORE_SRC), "utf8");
  const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:const|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const body = src.replace(/^export\s+/gm, "").split("\n").map((l) => (l ? "  " + l : l)).join("\n");
  return `/* ${CORE_OUT} — generated by tools/build-bundles.mjs from ${CORE_SRC}. Do not edit; edit ${CORE_SRC}. */\n` +
    `(function () {\n  "use strict";\n${body}\n  window.${NAME} = { ${names.join(", ")} };\n})();\n`;
}

export async function build({ check = false, force = false } = {}) {
  const esbuild = await loadEsbuild();
  let stale = [];
  for (const [CORE_SRC, CORE_OUT, NAME] of CORES) {
    const want = coreScript(CORE_SRC, CORE_OUT, NAME), dest = path.join(ROOT, CORE_OUT);
    const cur = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
    if (cur !== want) { if (check) stale.push(CORE_OUT); else { fs.writeFileSync(dest, want); console.log(`${CORE_OUT}: regenerated from ${CORE_SRC}`); } }
  }
  for (const [out, files] of Object.entries(BUNDLES)) {
    checkDuplicates([...files, ...partnerFiles(out)]);
    const src = join(files, partnerFiles(out));
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
  for (const [out, files] of Object.entries(CSS_BUNDLES)) {
    const src = files.map((f) => `/* ${f} */\n` + fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
    const hash = crypto.createHash("sha256").update(src).digest("hex").slice(0, 16);
    const banner = `/* ${out} — built by tools/build-bundles.mjs from: ${files.join(", ")}. Do not edit; edit the sources. src:${hash} */\n`;
    const dest = path.join(ROOT, out);
    const cur = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
    const curHash = (/src:([0-9a-f]{16})/.exec(cur.slice(0, 600)) || [])[1];
    if (check) { if (curHash !== hash) stale.push(out); continue; }
    if (!force && curHash === hash && cur.length) { console.log(`${out}: up to date`); continue; }
    let code = src;
    if (esbuild) { const r = await esbuild.transform(src, { loader: "css", minify: true, legalComments: "none", charset: "utf8" }); code = r.code; }
    fs.writeFileSync(dest, banner + code);
    console.log(`${out}: ${files.length} files, ${(src.length / 1024).toFixed(0)} KB -> ${((banner + code).length / 1024).toFixed(0)} KB${esbuild ? " (minified)" : " (joined, not minified: esbuild not found)"}`);
  }
  for (const [out, cfg] of Object.entries(CSS_PURGED)) {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const scanned = cfg.scan.map(read).join("\n").replace(/\?v=\d+/g, ""); // the cache version changes on every bump; the classes don't
    const srcAll = [...cfg.purge, ...cfg.keep].map((f) => `/* ${f} */\n` + read(f)).join("\n") + "\n/* scan */\n" + scanned;
    const hash = crypto.createHash("sha256").update(srcAll).digest("hex").slice(0, 16);
    const banner = `/* ${out} — built by tools/build-bundles.mjs: ${cfg.purge.join(", ")} cut to what the game uses, then ${cfg.keep.join(", ")}. Do not edit; edit the sources. src:${hash} */\n`;
    const dest = path.join(ROOT, out);
    const cur = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
    const curHash = (/src:([0-9a-f]{16})/.exec(cur.slice(0, 800)) || [])[1];
    if (check) { if (curHash !== hash) stale.push(out); continue; }
    if (!force && curHash === hash && cur.length) { console.log(`${out}: up to date`); continue; }
    const used = new Set(scanned.match(/[_a-zA-Z][\w-]*/g));
    const src = cfg.purge.map((f) => purgeCss(read(f), used)).join("\n") + "\n" + cfg.keep.map(read).join("\n");
    let code = src;
    if (esbuild) { const r = await esbuild.transform(src, { loader: "css", minify: true, legalComments: "none", charset: "utf8" }); code = r.code; }
    fs.writeFileSync(dest, banner + code);
    console.log(`${out}: ${(srcAll.length / 1024).toFixed(0)} KB of sources -> ${((banner + code).length / 1024).toFixed(0)} KB`);
  }
  // per-page cuts of arc.min.css (CSS_PAGES)
  const arcSrc = CSS_BUNDLES["arc.min.css"];
  for (const [out, listed] of Object.entries(CSS_PAGES)) {
    const scan = withImports(listed);
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const scanned = scan.map(read).join("\n").replace(/\?v=\d+/g, "");
    const srcAll = "purge-v3\n" + arcSrc.map((f) => `/* ${f} */\n` + read(f)).join("\n") + "\n/* scan */\n" + scanned;
    const hash = crypto.createHash("sha256").update(srcAll).digest("hex").slice(0, 16);
    const banner = `/* ${out} — built by tools/build-bundles.mjs: ${arcSrc.join(", ")} cut to what ${scan[0]} and its scripts use. Do not edit; edit the sources. src:${hash} */\n`;
    const dest = path.join(ROOT, out);
    const cur = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
    const curHash = (/src:([0-9a-f]{16})/.exec(cur.slice(0, 800)) || [])[1];
    if (check) { if (curHash !== hash) stale.push(out); continue; }
    if (!force && curHash === hash && cur.length) { console.log(`${out}: up to date`); continue; }
    // comments name classes of other pages ("see .xl-card in style.css"); read the code without them
    const bare = esbuild
      ? (await Promise.all(scan.map(async (f) => /\.js$/.test(f) ? (await esbuild.transform(read(f), { minifyWhitespace: true, target: "esnext", legalComments: "none" }).catch(() => ({ code: read(f) }))).code : read(f).replace(/<!--[\s\S]*?-->/g, " ")))).join("\n")
      : scanned;
    const usage = pageUsage(bare);
    const src = dropUnusedKeyframes(arcSrc.map((f) => purgeCss(read(f), usage)).join("\n"), usage.used);
    let code = src;
    if (esbuild) { const r = await esbuild.transform(src, { loader: "css", minify: true, legalComments: "none", charset: "utf8" }); code = r.code; }
    fs.writeFileSync(dest, banner + code);
    console.log(`${out}: ${(srcAll.length / 1024).toFixed(0)} KB of sources -> ${((banner + code).length / 1024).toFixed(0)} KB`);
  }
  if (check && stale.length) { console.error("out of date: " + stale.join(", ") + " — run: node tools/build-bundles.mjs"); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build({ check: process.argv.includes("--check"), force: process.argv.includes("--force") }).catch((e) => { console.error(e.message || e); process.exit(1); });
}
