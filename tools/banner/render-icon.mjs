#!/usr/bin/env node
// tools/banner/render-icon.mjs — render the ARCIRCLE square icon (tools/banner/arcircle-icon.html): a still PNG and an
// 8 s seamless loop as MP4 (then made into animated WebP / GIF with ffmpeg).
//   node tools/banner/render-icon.mjs <out dir> [--base http://localhost:9031] [--fps 15]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const { chromium } = createRequire(process.env.PW ? path.join(process.env.PW, "x.js") : "/opt/node22/lib/node_modules/x.js")("playwright");
const argv = process.argv.slice(2), out = argv[0] || "icon-out";
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i > 0 ? argv[i + 1] : d; };
const BASE = opt("base", "http://localhost:9031"), FPS = +opt("fps", 15), LOOP = 8;
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 500, height: 500 } })).newPage();
await p.goto(`${BASE}/tools/banner/arcircle-icon.html`); await p.evaluate(() => window.ready);
await p.screenshot({ path: path.join(out, "arcircle-icon-500.png") });
const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", path.join(out, "arcircle-icon-loop.mp4")], { stdio: ["pipe", "ignore", "ignore"] });
for (let i = 0; i < LOOP * FPS; i++) {
  await p.evaluate((t) => window.draw(t), i / FPS);
  const buf = await p.screenshot({ type: "png" });
  if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once("drain", ok));
}
ff.stdin.end(); await new Promise((ok) => ff.on("close", ok));
await b.close(); console.log("done");
