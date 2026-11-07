#!/usr/bin/env node
// tools/banner/render.mjs — render the ARCIRCLE banner (tools/banner/arcircle-banner.html) to a still and to videos.
//   node tools/banner/render.mjs <out dir> [--base http://localhost:9031] [--fps 30]
// Needs a local static server on the repo root (the page loads /images, /fonts), playwright and ffmpeg.
// Writes: arcircle-banner-1500x500.jpg / .png, arcircle-banner-3000x1000.png, arcircle-motion-1500x500.mp4 (4 s intro + 10 s),
//         arcircle-loop-1500x500.mp4 (an 8 s seamless loop), arcircle-motion-1920x640.mp4 (the same, scaled for posts).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const req = createRequire(process.env.PW ? path.join(process.env.PW, "x.js") : "/opt/node22/lib/node_modules/x.js");
const { chromium } = req("playwright");
const argv = process.argv.slice(2), out = argv[0] || "banner-out";
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i > 0 ? argv[i + 1] : d; };
const BASE = opt("base", "http://localhost:9031"), FPS = +opt("fps", 30), STILL_T = +opt("still", 2);
fs.mkdirSync(out, { recursive: true });

const b = await chromium.launch();
async function page(scale) {
  const p = await (await b.newContext({ viewport: { width: 1500, height: 500 }, deviceScaleFactor: scale })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${BASE}/tools/banner/arcircle-banner.html?scale=${scale}&t=${STILL_T}`);
  await p.evaluate(() => window.ready); await p.waitForTimeout(200);
  if (errs.length) throw new Error(errs.join("\n"));
  return p;
}
// stills
for (const s of [1, 2]) {
  const p = await page(s);
  await p.evaluate((t) => window.draw(t, null), STILL_T);
  const f = path.join(out, `arcircle-banner-${1500 * s}x${500 * s}.png`); await p.screenshot({ path: f });
  if (s === 1) await p.screenshot({ path: path.join(out, "arcircle-banner-1500x500.jpg"), type: "jpeg", quality: 92 });
  console.log("still", f);
}
// videos: frames from draw(t) piped to ffmpeg
async function video(name, secs, intro, scale = 1, vf = null) {
  const p = await page(scale);
  const args = ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", ...(vf ? ["-vf", vf] : []), "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(out, name)];
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] }); let log = ""; ff.stderr.on("data", (d) => (log = (log + d).slice(-2000)));
  const n = Math.round(secs * FPS);
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    await p.evaluate(([t, intro]) => window.draw(t, intro ? t : null), [t, intro]);
    const buf = await p.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once("drain", ok));
    if (i % (FPS * 2) === 0) process.stdout.write(`${name} ${Math.round((i / n) * 100)}%\r`);
  }
  ff.stdin.end(); const code = await new Promise((ok) => ff.on("close", ok));
  if (code) throw new Error("ffmpeg: " + log);
  await p.context().close(); console.log("video", name, "     ");
}
await video("arcircle-motion-1500x500.mp4", 14, true);
await video("arcircle-loop-1500x500.mp4", 8, false);
await video("arcircle-motion-1920x640.mp4", 14, true, 2, "scale=1920:640:flags=lanczos");
await b.close();
