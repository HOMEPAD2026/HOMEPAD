#!/usr/bin/env node
// tools/meshy.mjs — make images and models with Meshy (https://docs.meshy.ai/en/api) from the command line.
// The key comes from the environment only (MESHY_API_KEY): never write it into the repo.
//
//   node tools/meshy.mjs balance
//   node tools/meshy.mjs text3d  "<prompt>" [--polys 20000] [--style realistic|sculpture] [--quad] [--pbr] [--texture "<prompt>"] [--out file.glb]
//   node tools/meshy.mjs image3d <image path or url> [--polys 20000] [--pbr] [--out file.glb]
//   node tools/meshy.mjs multi3d <img1> <img2> [<img3> <img4>] [--polys 20000] [--out file.glb]
//   node tools/meshy.mjs remesh  <task id | glb url> [--polys 8000] [--quad] [--out file.glb]
//   node tools/meshy.mjs retex   <task id | glb url> "<style prompt>" [--out file.glb]
//   node tools/meshy.mjs rig     <task id | glb url> [--height 1.8] [--out file.glb]      (humanoids: walk + run come with it)
//   node tools/meshy.mjs anim    <rig task id> <action id> [--out file.glb]
//   node tools/meshy.mjs image   "<prompt>" [--ratio 16:9] [--model nano-banana] [--out file.png]
//   node tools/meshy.mjs img2img "<prompt>" <ref1.png> [ref2 …] [--model nano-banana] [--out file.png]   (a picture that follows
//        reference images: our own screenshot remastered as a target mock-up, or one part cut from it — see CLAUDE.md)
//   node tools/meshy.mjs get     <kind> <task id>        (kind: text-to-3d | image-to-3d | multi-image-to-3d | remesh | retexture | rigging | animations | text-to-image | image-to-image)
//
// Every task is created, polled every 5 s until it ends, and its result downloaded (--out, or tools/meshy-out/<id>.glb).
// Each task's id, kind and prompt go into tools/meshy-out/log.jsonl, so a run can be picked up again with `get`.
// What comes back is a raw model: pack it before it goes in the game (the town's packer: Draco + KTX2 textures,
// a triangle budget; see the commit notes of models/world/raid).
import fs from "node:fs";
import path from "node:path";

const BASE = "https://api.meshy.ai/openapi";
const KEY = process.env.MESHY_API_KEY;
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "meshy-out");
const [cmd, ...rest] = process.argv.slice(2);
const BOOL = new Set(["quad", "pbr"]), opts = {}, args = [];
for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (!a.startsWith("--")) { args.push(a); continue; } const n = a.slice(2); if (BOOL.has(n)) opts[n] = true; else opts[n] = rest[++i]; }
const flag = (n, d) => (n in opts ? opts[n] : d);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
if (!KEY && cmd !== undefined) { console.error("MESHY_API_KEY isn't set (export it in the shell; never put it in a file in the repo)"); process.exit(2); }

async function api(method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not JSON */ }
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${t.slice(0, 400)}`);
  return j;
}
/// a local image becomes a data URI (Meshy takes either a public URL or base64)
function imageRef(s) {
  if (/^https?:\/\//.test(s) || s.startsWith("data:")) return s;
  const ext = path.extname(s).slice(1).toLowerCase().replace("jpg", "jpeg");
  return `data:image/${ext};base64,${fs.readFileSync(s).toString("base64")}`;
}
/// a task id or a model URL as Meshy's input
const inputOf = (s) => (/^https?:\/\//.test(s) ? { model_url: s } : { input_task_id: s });
function log(o) { fs.mkdirSync(OUT, { recursive: true }); fs.appendFileSync(path.join(OUT, "log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n"); }

async function wait(kind, ver, id) {
  for (let n = 0; ; n++) {
    const t = await api("GET", `/${ver}/${kind}/${id}`);
    if (n % 6 === 0 || t.status !== "IN_PROGRESS") console.error(`${kind} ${id}: ${t.status} ${t.progress ?? ""}%`);
    if (t.status === "SUCCEEDED") return t;
    if (t.status === "FAILED" || t.status === "CANCELED" || t.status === "EXPIRED") throw new Error(`${kind} ${id} ${t.status}: ${JSON.stringify(t.task_error || {})}`);
    await sleep(5000);
  }
}
async function save(url, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = await fetch(url); if (!r.ok) throw new Error("download " + r.status);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); console.log(out, fs.statSync(out).size, "bytes");
}
const glbOf = (t) => (t.model_urls && t.model_urls.glb) || (t.result && t.result.rigged_character_glb_url) || (t.result && t.result.animation_glb_url);
async function run(kind, ver, body, extra = {}) {
  const r = await api("POST", `/${ver}/${kind}`, body), id = r.result || r.id;
  log({ kind, ver, id, ...extra }); console.error(`${kind} started: ${id}`);
  const t = await wait(kind, ver, id);
  return { id, t };
}
const polys = () => Number(flag("polys", 0)) || undefined;
const topo = () => (flag("quad", false) ? "quad" : "triangle");

(async () => {
  switch (cmd) {
    case "balance": console.log(await api("GET", "/v1/balance")); break;
    case "text3d": {
      const prompt = args[0]; if (!prompt) throw new Error("text3d needs a prompt");
      const pre = await run("text-to-3d", "v2", { mode: "preview", prompt, art_style: flag("style", "realistic"), ai_model: "latest", topology: topo(), target_polycount: polys(), should_remesh: !!polys() }, { prompt });
      const ref = await run("text-to-3d", "v2", { mode: "refine", preview_task_id: pre.id, enable_pbr: !!flag("pbr", false), texture_prompt: flag("texture", undefined) }, { prompt, preview: pre.id });
      await save(glbOf(ref.t), flag("out", path.join(OUT, ref.id + ".glb"))); break;
    }
    case "image3d": {
      const { id, t } = await run("image-to-3d", "v1", { image_url: imageRef(args[0]), ai_model: "latest", topology: topo(), target_polycount: polys(), should_remesh: !!polys(), should_texture: true, enable_pbr: !!flag("pbr", false) }, { image: args[0] });
      await save(glbOf(t), flag("out", path.join(OUT, id + ".glb"))); break;
    }
    case "multi3d": {
      const { id, t } = await run("multi-image-to-3d", "v1", { image_urls: args.slice(0, 4).map(imageRef), ai_model: "latest", topology: topo(), target_polycount: polys(), should_remesh: !!polys(), should_texture: true }, { images: args.slice(0, 4) });
      await save(glbOf(t), flag("out", path.join(OUT, id + ".glb"))); break;
    }
    case "remesh": {
      const { id, t } = await run("remesh", "v1", { ...inputOf(args[0]), target_formats: ["glb"], topology: topo(), target_polycount: polys() || 8000 }, { input: args[0] });
      await save(glbOf(t), flag("out", path.join(OUT, id + ".glb"))); break;
    }
    case "retex": {
      const { id, t } = await run("retexture", "v1", { ...inputOf(args[0]), text_style_prompt: args[1], enable_original_uv: true }, { input: args[0], prompt: args[1] });
      await save(glbOf(t), flag("out", path.join(OUT, id + ".glb"))); break;
    }
    case "rig": {
      const { id, t } = await run("rigging", "v1", { ...inputOf(args[0]), height_meters: Number(flag("height", 1.8)) }, { input: args[0] });
      await save(glbOf(t), flag("out", path.join(OUT, id + "-rigged.glb")));
      const b = t.result && t.result.basic_animations; if (b) for (const [k, u] of Object.entries(b)) if (typeof u === "string" && u.endsWith(".glb") || /glb/.test(k)) await save(u, path.join(OUT, `${id}-${k}.glb`));
      break;
    }
    case "anim": {
      const { id, t } = await run("animations", "v1", { rig_task_id: args[0], action_id: Number(args[1]) }, { rig: args[0], action: args[1] });
      await save(glbOf(t), flag("out", path.join(OUT, id + "-anim.glb"))); break;
    }
    case "image": {
      const { id, t } = await run("text-to-image", "v1", { ai_model: flag("model", "nano-banana"), prompt: args[0], aspect_ratio: flag("ratio", "1:1") }, { prompt: args[0] });
      const u = (t.image_urls && t.image_urls[0]) || t.image_url; await save(u, flag("out", path.join(OUT, id + ".png"))); break;
    }
    case "img2img": {
      const refs = args.slice(1, 6); if (!args[0] || !refs.length) throw new Error("img2img needs a prompt and at least one reference image");
      const { id, t } = await run("image-to-image", "v1", { ai_model: flag("model", "nano-banana"), prompt: args[0], reference_image_urls: refs.map(imageRef) }, { prompt: args[0], refs });
      const u = (t.image_urls && t.image_urls[0]) || t.image_url; await save(u, flag("out", path.join(OUT, id + ".png"))); break;
    }
    case "get": { const ver = args[0] === "text-to-3d" ? "v2" : "v1"; console.log(JSON.stringify(await api("GET", `/${ver}/${args[0]}/${args[1]}`), null, 1)); break; }
    default: console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("\n").filter((l) => l.startsWith("//")).join("\n"));
  }
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
