// gwlists.test.mjs — /game's Featured news and Updates & notices (gw.js) stay in step: in every language the news,
// their bodies (nbody) and NEWS (dates and pictures) have the same count, the notices as many as NOTE_D (their dates,
// by place), and both lists run newest first. (A notice once went in without its date and every date shifted.)
// Run: node tests/world/gwlists.test.mjs
import fs from "node:fs";
const src = fs.readFileSync(new URL("../../gw.js", import.meta.url), "utf8");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const dates = (name) => [...src.split(`var ${name} = [`)[1].split("];")[0].matchAll(/"(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
const NEWS = dates("NEWS"), NOTE_D = dates("NOTE_D");
const sorted = (a) => a.every((d, i) => i === 0 || a[i - 1] >= d);
check(sorted(NEWS), `news dates newest first (${NEWS.length})`);
check(sorted(NOTE_D), `notice dates newest first (${NOTE_D.length})`);
const arrays = (key) => src.split(`    ${key}: [`).slice(1).map((part) => { let depth = 1, i = 0; for (; i < part.length && depth; i++) { const ch = part[i]; if (ch === '"') { i++; while (part[i] !== '"') { if (part[i] === "\\") i++; i++; } } else if (ch === "[") depth++; else if (ch === "]") depth--; } return JSON.parse("[" + part.slice(0, i)); });
const news = arrays("news"), notices = arrays("notices"), nbody = src.split('    "nbody": [').slice(1).map((p) => JSON.parse("[" + p.split('"],\n')[0] + '"]'));
const langs = ["en", "ko", "zh", "tr"];
check(news.length === 4 && notices.length === 4 && nbody.length === 4, "four languages");
langs.forEach((l, k) => {
  check(news[k].length === NEWS.length, `${l}: ${news[k].length} news = ${NEWS.length} in NEWS`);
  check(nbody[k].length === news[k].length, `${l}: ${nbody[k].length} news bodies = ${news[k].length} news (one each, "" for none: nbody[i] is news[i]'s long body — three news once showed the wrong body)`);
  check(notices[k].length === NOTE_D.length, `${l}: ${notices[k].length} notices = ${NOTE_D.length} dates`);
});
console.log(`\n${ok} pass ${bad} fail`); process.exit(bad ? 1 : 0);
