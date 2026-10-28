// tests/world/i18n.test.mjs — every literal T("…") / TW("…") in the game's main file has Korean, Chinese and Turkish.
// Where a word can live (the rule, also in CLAUDE.md):
//   WORDS in world-play.js      short words and game-only lines (TW looks here first, then the site dictionaries)
//   i18n-ko/zh/tr.js            sentences shared with the site, and anything T() alone translates
// T() only reads the site dictionaries; TW() reads WORDS, then the dictionaries. Strings with no translation yet are
// listed in tests/world/i18n-known-missing.json (the backlog when this test was added); a NEW untranslated string fails.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

const src = fs.readFileSync(path.join(ROOT, "world-play.js"), "utf8");
// the modules that take TW from world-play.js (their T is TW): their T("…") literals and the names/lines in their tables
const MODS = ["world-adcity.js", "world-studio.js", "world-studio-web.js", "world-studio-hub.js", "world-studio-gen.js", "world-agarena.js", "world-studio-prev.js", "world-raidq.js", "world-raidq-data.js", "world-mythic.js", "world-mythic-data.js", "world-skills.js", "world-bridge.js"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"));
const wsrc = fs.readFileSync(path.join(ROOT, "world-words.js"), "utf8"); // (WORDS moved out of world-play.js for the Studio's web page)
const words = vm.runInNewContext("(" + wsrc.slice(wsrc.indexOf("const WORDS = {") + "const WORDS = ".length, wsrc.indexOf("\n};", wsrc.indexOf("const WORDS = {")) + 2) + ")");
// later additions: Object.assign(WORDS.ko, { … });
for (const m of wsrc.matchAll(/Object\.assign\(WORDS\.(ko|zh|tr), (\{[\s\S]*?\})\);/g)) Object.assign(words[m[1]], vm.runInNewContext("(" + m[2] + ")"));
const dict = {};
for (const l of ["ko", "zh", "tr"]) {
  const win = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, `i18n-${l}.js`), "utf8"), { window: win });
  dict[l] = win.__arcDict[l];
}
const norm = (s) => s.replace(/\s+/g, " ").trim();
const inDict = (l, s) => { const d = dict[l]; const t = norm(s); return Object.prototype.hasOwnProperty.call(d.d, t) || d.p.some(([re]) => re.test(t)); };
const has = (fn, l, s) => (fn === "TW" && words[l] && words[l][s] != null) || inDict(l, s);

// the literals: T("…") and TW("…") with a plain double-quoted string
const seen = new Map();
for (const m of src.matchAll(/\b(TW?)\("((?:[^"\\]|\\.)*)"/g)) { const s = JSON.parse('"' + m[2] + '"'); if (!/[A-Za-z]{2}/.test(s)) continue; const k = m[1] + "|" + s; seen.set(k, { fn: m[1], s }); }
for (const m of MODS) { for (const x of m.matchAll(/\bT\("((?:[^"\\]|\\.)*)"/g)) { const s = JSON.parse('"' + x[1] + '"'); if (/[A-Za-z]{2}/.test(s)) seen.set("TW|" + s, { fn: "TW", s }); }
  for (const x of m.matchAll(/\b(?:name|sub|title|desc|hint|region|line): "((?:[^"\\]|\\.)*)"/g)) { const s = JSON.parse('"' + x[1] + '"'); if (/[A-Za-z]{2}/.test(s)) seen.set("TW|" + s, { fn: "TW", s }); }
  for (const x of m.matchAll(/lines: \[((?:"(?:[^"\\]|\\.)*",?\s*)+)\]/g)) for (const y of x[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) seen.set("TW|" + JSON.parse('"' + y[1] + '"'), { fn: "TW", s: JSON.parse('"' + y[1] + '"') }); }
const missing = [];
for (const { fn, s } of seen.values()) for (const l of ["ko", "zh", "tr"]) if (!has(fn, l, s)) missing.push(`${l}|${fn}|${s}`);
const KNOWN = path.join(ROOT, "tests/world/i18n-known-missing.json");
if (process.argv.includes("--write-known")) { fs.writeFileSync(KNOWN, JSON.stringify([...new Set(missing)].sort(), null, 0) + "\n"); console.log("wrote", missing.length); process.exit(0); }
const known = new Set(JSON.parse(fs.readFileSync(KNOWN, "utf8")));
const fresh = missing.filter((x) => !known.has(x));
check(seen.size > 300, `found the game's strings (${seen.size})`);
check(fresh.length === 0, `no new untranslated strings${fresh.length ? ":\n  " + fresh.slice(0, process.env.ALL ? 9999 : 20).join("\n  ") : ""}`);
check(true, `backlog: ${missing.length} string-language pairs still untranslated (was ${known.size})`);
console.log(ok, "pass", bad, "fail");
process.exit(bad ? 1 : 0);
