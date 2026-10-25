#!/usr/bin/env node
// tools/openai-image.mjs — make the game's pictures with OpenAI's image model (gpt-image-1) from the command line:
// key art, backgrounds, floors, icons, cut-outs with a transparent background, and edits that follow reference shots.
// The key comes from the environment only (OPENAI_API_KEY): never write it into the repo. api.openai.com must be in the
// environment's allowed domains (a new session picks both up).
//
//   node tools/openai-image.mjs gen  "<prompt>" [--size 1024x1024|1536x1024|1024x1536] [--quality low|medium|high]
//                                              [--transparent] [--n 1] [--out images/raid/x.png]
//   node tools/openai-image.mjs edit "<prompt>" <ref1.png> [ref2.png …] [--mask m.png] [same flags]   (follow reference images)
//
// Each picture is saved as PNG (--out, or tools/ai-out/<time>-<i>.png) and noted in tools/ai-out/log.jsonl with its prompt.
// For the game, convert to WebP and size it for a phone (sharp: ≤ 2048 px for backgrounds, ≤ 512 px for icons).
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.OPENAI_API_KEY, BASE = "https://api.openai.com/v1/images";
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "ai-out");
const [cmd, ...rest] = process.argv.slice(2);
const BOOL = new Set(["transparent"]), opts = {}, args = [];
for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (!a.startsWith("--")) { args.push(a); continue; } const n = a.slice(2); if (BOOL.has(n)) opts[n] = true; else opts[n] = rest[++i]; }
const flag = (n, d) => (n in opts ? opts[n] : d);
if (!cmd || !["gen", "edit"].includes(cmd)) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("\n").filter((l) => l.startsWith("//")).join("\n")); process.exit(0); }
if (!KEY) { console.error("OPENAI_API_KEY isn't set (add it in the environment's settings; never put it in a file in the repo)"); process.exit(2); }

const common = () => ({ model: "gpt-image-1", size: flag("size", "1024x1024"), quality: flag("quality", "high"), n: Number(flag("n", 1)), ...(flag("transparent", false) ? { background: "transparent", output_format: "png" } : {}) });
async function save(j, prompt) {
  fs.mkdirSync(OUT, { recursive: true }); const at = Date.now(), files = [];
  (j.data || []).forEach((d, i) => { const f = flag("out", null) && j.data.length === 1 ? flag("out") : path.join(OUT, `${at}-${i}.png`); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(d.b64_json, "base64")); files.push(f); console.log(f, fs.statSync(f).size, "bytes"); });
  fs.appendFileSync(path.join(OUT, "log.jsonl"), JSON.stringify({ at: new Date(at).toISOString(), cmd, prompt, opts, files, usage: j.usage || null }) + "\n");
}
(async () => {
  const prompt = args[0]; if (!prompt) throw new Error("a prompt is needed");
  let r;
  if (cmd === "gen") r = await fetch(BASE + "/generations", { method: "POST", headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify({ ...common(), prompt }) });
  else {
    const fd = new FormData(), c = common(); for (const [k, v] of Object.entries(c)) fd.append(k, String(v)); fd.append("prompt", prompt);
    for (const f of args.slice(1)) fd.append("image[]", new Blob([fs.readFileSync(f)], { type: f.endsWith(".webp") ? "image/webp" : f.endsWith(".jpg") || f.endsWith(".jpeg") ? "image/jpeg" : "image/png" }), path.basename(f));
    if (flag("mask", null)) fd.append("mask", new Blob([fs.readFileSync(flag("mask"))], { type: "image/png" }), "mask.png");
    r = await fetch(BASE + "/edits", { method: "POST", headers: { Authorization: "Bearer " + KEY }, body: fd });
  }
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 500)}`);
  await save(JSON.parse(t), prompt);
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
