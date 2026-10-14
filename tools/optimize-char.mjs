#!/usr/bin/env node
// tools/optimize-char.mjs — a rigged character from Tripo3D (or any skinned GLB with clips), made light enough for
// ARCIRCLE World: the game loads it as /models/world/chars/character-<id>.glb (world-kit.js CUSTOM_CHARS).
//
// An AI-made character comes out at 100k+ faces with 2K–4K PNG textures: tens of MB a phone has to fetch, decode and
// skin every frame. The game's own characters are ~5k faces, a 512 px WebP and ~150 KB. This gets a Tripo export
// close to that:
//   dedup, prune         drop repeated / unused accessors, materials, textures
//   weld                 merge split vertices (needed before the simplifier can collapse anything)
//   simplify             meshopt simplifier down to --faces triangles (skipped when already under); skin weights kept
//   resample             drop redundant animation keys (Tripo / Mixamo bake every frame)
//   textures             at most --tex px on a side, WebP (EXT_texture_webp)
//   quantize, meshopt    KHR_mesh_quantization + EXT_meshopt_compression (world-kit.js gltfLoader() has the decoder)
//
//   node tools/optimize-char.mjs in.glb models/world/chars/character-<id>.glb [--faces 20000] [--tex 1024]
//
// Needs (not part of the site; dev only):
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer
// sharp is already in package.json. The picker's thumbnail (models/world/chars/<id>.webp, 256x256) is not made here:
// see models/world/chars/CUSTOM.md.
import fs from "node:fs";
import path from "node:path";
import { NodeIO, Logger } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, simplify, resample, textureCompress, quantize, meshopt, getSceneVertexCount, VertexCountMethod } from "@gltf-transform/functions";
import { ImageUtils } from "@gltf-transform/core";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args.splice(i, 2)[1]) : d; };
const FACES = flag("--faces", 20000), TEX = flag("--tex", 1024);
const [IN, OUT] = args;
if (!IN || !OUT || !(FACES > 0) || !(TEX > 0)) { console.error("usage: node tools/optimize-char.mjs in.glb models/world/chars/character-<id>.glb [--faces 20000] [--tex 1024]"); process.exit(2); }
if (!/^character-[a-z0-9-]+\.glb$/.test(path.basename(OUT))) console.warn(`! the game loads character-<id>.glb (lower case, a-z 0-9 -); "${path.basename(OUT)}" won't be found`);

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

// what's in it: triangles, textures (px), clips, skins
function stats(doc) {
  const root = doc.getRoot(); let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { if (p.getMode() !== 4) continue; const ix = p.getIndices(), pos = p.getAttribute("POSITION"); tris += Math.floor((ix ? ix.getCount() : pos ? pos.getCount() : 0) / 3); }
  const tex = root.listTextures().map((t) => { const s = ImageUtils.getSize(t.getImage(), t.getMimeType()); return `${s ? s.join("x") : "?"} ${t.getMimeType().replace("image/", "")}`; });
  const skins = root.listSkins().map((s) => s.listJoints().length);
  return { tris, tex, skins, clips: root.listAnimations().map((a) => a.getName() || "(unnamed)"), verts: root.listScenes().reduce((n, s) => n + getSceneVertexCount(s, VertexCountMethod.UPLOAD), 0) };
}
const kb = (n) => (n / 1024 > 1024 ? (n / 1048576).toFixed(2) + " MB" : (n / 1024).toFixed(1) + " KB");
const show = (h, s, bytes) => console.log(`${h}  ${kb(bytes)} · ${s.tris.toLocaleString()} triangles · ${s.verts.toLocaleString()} vertices · textures [${s.tex.join(", ") || "none"}] · skins [${s.skins.map((n) => n + " joints").join(", ") || "none"}]`);

const inBytes = fs.statSync(IN).size, doc = await io.read(IN), before = stats(doc);
show("before", before, inBytes);
console.log(`clips  ${before.clips.length ? before.clips.join(", ") : "none (the character will stand still)"}`);
if (!before.skins.length) console.warn("! no skin: the game will show it, but it can't walk (export from Tripo with the rig on)");

await doc.transform(dedup(), prune(), weld());
const mid = stats(doc).tris;
if (mid > FACES) { const ratio = FACES / mid; await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 })); if (stats(doc).tris > FACES * 1.25) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: FACES / stats(doc).tris, error: 0.1 })); } // a second, looser pass when the first stopped at its error bound
else console.log(`simplify skipped (${mid.toLocaleString()} ≤ ${FACES.toLocaleString()} faces)`);
await doc.transform(
  resample(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [TEX, TEX], quality: 85 }),
  prune(), dedup(),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
await io.write(OUT, doc);
const outBytes = fs.statSync(OUT).size, after = stats(await io.read(OUT));
show("after ", after, outBytes);
console.log(`saved  ${(100 - (outBytes / inBytes) * 100).toFixed(1)}% · clips kept ${after.clips.length}/${before.clips.length}`);
if (after.tris > FACES * 1.5) console.warn(`! still ${after.tris.toLocaleString()} faces: the simplifier kept the silhouette; ask Tripo for fewer faces`);
if (outBytes > 2 * 1048576) console.warn("! over 2 MB: try --tex 512 or fewer --faces");
