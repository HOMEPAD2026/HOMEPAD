// tools/pack-hero.mjs — turns a Meshy export (one rigged GLB with its clips) into the game's hero file:
// keeps the clips the game uses, webp textures at a size a phone can hold, meshopt-compressed and quantized geometry.
//   node tools/pack-hero.mjs <in.glb> <out.glb> [keep clips, comma-separated]
// Needs @gltf-transform/{core,extensions,functions}, meshoptimizer and sharp (npm i them anywhere and set NODE_PATH).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, resample, quantize, meshopt, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
const [, , inp, out, keepArg = "Idle_03,Walking,Running,Jump_Run"] = process.argv;
const keep = new Set(keepArg.split(","));
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(inp);
const root = doc.getRoot();
for (const a of root.listAnimations()) if (!keep.has(a.getName())) a.dispose();
console.log("clips:", root.listAnimations().map((a) => a.getName()).join(", "));
// texture sizes: colour and normal 1024, the metal/roughness map 512 (it was 4096)
for (const t of root.listTextures()) {
  const slots = doc.getGraph().listParentEdges(t).map((e) => e.getName()).join(",");
  const size = /metallicRoughness/.test(slots) ? 512 : 1024;
  t.setExtras({ ...(t.getExtras() || {}), _size: size });
}
// three.js skins with four bones a vertex: a rig that gives some vertices eight (JOINTS_1 / WEIGHTS_1, Meshy's finger rigs)
// lost the second four and the rest no longer summed to one, so those vertices flew off (LUMI's ribbons). Keep the four
// strongest and make them sum to one.
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const j0 = prim.getAttribute("JOINTS_0"), w0 = prim.getAttribute("WEIGHTS_0"), j1 = prim.getAttribute("JOINTS_1"), w1 = prim.getAttribute("WEIGHTS_1");
  if (!j0 || !w0) continue; let fixed = 0;
  const a = [0, 0, 0, 0], b = [0, 0, 0, 0], c = [0, 0, 0, 0], d = [0, 0, 0, 0];
  for (let i = 0; i < j0.getCount(); i++) {
    j0.getElement(i, a); w0.getElement(i, b); if (j1 && w1) { j1.getElement(i, c); w1.getElement(i, d); } else { c.fill(0); d.fill(0); }
    const all = [0, 1, 2, 3].map((k) => [a[k], b[k]]).concat([0, 1, 2, 3].map((k) => [c[k], d[k]])).filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, 4);
    const sum = all.reduce((t, x) => t + x[1], 0) || 1; while (all.length < 4) all.push([0, 0]);
    if (j1 && w1 && d.some((v) => v > 0)) fixed++;
    j0.setElement(i, all.map((x) => x[0])); w0.setElement(i, all.map((x) => x[1] / sum));
  }
  if (j1) { prim.setAttribute("JOINTS_1", null); j1.dispose(); } if (w1) { prim.setAttribute("WEIGHTS_1", null); w1.dispose(); }
  console.log("skin weights: top 4 kept,", fixed, "vertices had more");
}
await doc.transform(
  dedup(), prune(), resample({ tolerance: 1e-4 }), weld(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], slots: /^(baseColor|normal|emissive)/, quality: 88 }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], slots: /metallicRoughness|occlusion/, quality: 85 }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(out, doc);
const fs = await import("node:fs"); console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), "MB");
