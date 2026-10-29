#!/usr/bin/env node
// Before a deploy (2026-10-29, after a merge shipped conflict marks inside two built chunks and /studio couldn't open):
//   node tools/predeploy.mjs
// 1. no merge marks in any tracked text file (sources, w/ chunks, pages, CSS, data)
// 2. w/ matches the sources (tools/build-world.mjs --check)
// 3. every tests/world/*.test.mjs passes
// Exits 1 on the first problem, with what to fix.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error("PREDEPLOY FAIL: " + m); process.exit(1); };
const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).split("\n").filter((f) => /\.(m?js|css|html|json|md)$/.test(f) && !/node_modules\//.test(f));
const bad = [];
for (const f of files) { let s = ""; try { s = fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { continue; } if (/^(<{7}|>{7}) |^={7}$/m.test(s)) bad.push(f); }
if (bad.length) fail("merge marks in " + bad.slice(0, 12).join(", ") + (bad.length > 12 ? ` … (+${bad.length - 12})` : "") + " — resolve them, rebuild, commit");
console.log(`ok  no merge marks (${files.length} files)`);
const b = spawnSync(process.execPath, [path.join(ROOT, "tools/build-world.mjs"), "--check"], { cwd: ROOT, encoding: "utf8" });
if (b.status !== 0) fail((b.stderr || b.stdout).trim());
console.log("ok  w/ matches the sources");
const tests = fs.readdirSync(path.join(ROOT, "tests/world")).filter((f) => f.endsWith(".test.mjs")).sort();
for (const t of tests) { const r = spawnSync(process.execPath, ["--test", path.join("tests/world", t)], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }); if (r.status !== 0) fail(`tests/world/${t}\n` + ((r.stdout || "") + (r.stderr || "")).split("\n").filter((l) => /not ok|fail|Error|expected|actual|assert/i.test(l)).slice(0, 30).join("\n")); }
console.log(`ok  ${tests.length} test files`);
console.log("PREDEPLOY OK");
