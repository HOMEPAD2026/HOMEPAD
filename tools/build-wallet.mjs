// tools/build-wallet.mjs — builds the ARCIRCLE Wallet core (tools/wallet/privy-entry.mjs: Privy) into wallet-core/ with
// esbuild: wallet-core/privy-entry.js plus its chunks (code-split ES modules, so a visit only downloads what Privy needs
// for that visit; nothing loads until someone opens the wallet or signs in). The site itself has no build step; this
// folder is prebuilt and committed. Needs @privy-io/react-auth, react, react-dom and viem on NODE_PATH:
//   NODE_PATH=<dir>/node_modules node tools/build-wallet.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const NP = (process.env.NODE_PATH || "").split(":").filter(Boolean);
const require = createRequire(path.join(NP[0] || ".", "x.js"));
const esbuild = require("esbuild");
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "wallet-core");
fs.rmSync(out, { recursive: true, force: true });
const r = await esbuild.build({
  entryPoints: [path.join(root, "tools/wallet/privy-entry.mjs")],
  outdir: out, entryNames: "[name]", chunkNames: "c/[name]-[hash]",
  bundle: true, splitting: true, minify: true, format: "esm", target: ["es2020"], platform: "browser", legalComments: "none",
  nodePaths: NP, define: { "process.env.NODE_ENV": '"production"', global: "globalThis" }, logLevel: "warning", metafile: true,
});
const O = r.metafile.outputs, entry = Object.keys(O).find((k) => /privy-entry\.js$/.test(k)), seen = new Set(), st = [entry];
while (st.length) { const k = st.pop(); if (seen.has(k)) continue; seen.add(k); for (const i of O[k].imports || []) if (i.kind === "import-statement") st.push(i.path); }
const kb = (ks) => Math.round([...ks].reduce((a, k) => a + O[k].bytes, 0) / 1024);
console.log(`wallet-core: ${Object.keys(O).length} files, ${kb(Object.keys(O))} KB in all, ${kb(seen)} KB on first use`);
