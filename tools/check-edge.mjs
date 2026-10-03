// tools/check-edge.mjs — every api/*.mjs that runs on Vercel's edge runtime must not reach a
// Node-only module (Vercel bundles all edge functions together, so one bad import fails the
// whole deploy, often reported under another function's name). Walks static and dynamic
// relative imports from each edge function and fails on node:* / Node built-ins / known Node-only files.
import fs from "node:fs";
import path from "node:path";
const API = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "api");
const NODE = new Set(["module", "url", "path", "crypto", "fs", "os", "http", "https", "net", "tls", "zlib", "stream", "buffer", "child_process", "util", "events", "worker_threads"]);
const rel = /(?:from\s*|import\s*\(\s*)["'](\.\/[^"']+)["']/g;
const bare = /(?:from\s*|import\s*\(\s*)["']((?:node:)?[a-z_]+)["']/g;
let bad = 0;
for (const f of fs.readdirSync(API).filter((x) => x.endsWith(".mjs"))) {
  const src = fs.readFileSync(path.join(API, f), "utf8");
  if (!/runtime:\s*["']edge["']/.test(src)) continue;
  const seen = new Map([[f, null]]); const stack = [f];
  while (stack.length) {
    const cur = stack.pop(); const file = path.join(API, cur);
    if (!fs.existsSync(file)) continue;
    const s = fs.readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const [, m] of s.matchAll(bare)) if (m.startsWith("node:") || NODE.has(m)) {
      const chain = [cur]; while (seen.get(chain.at(-1))) chain.push(seen.get(chain.at(-1)));
      console.log(`FAIL ${f}: "${m}" via ${chain.reverse().join(" -> ")}`); bad++;
    }
    for (const [, m] of s.matchAll(rel)) { const n = path.normalize(m); if (!seen.has(n)) { seen.set(n, cur); stack.push(n); } }
  }
}
console.log(bad ? `${bad} edge import problem(s)` : "edge functions: no Node-only imports");
process.exit(bad ? 1 : 0);
