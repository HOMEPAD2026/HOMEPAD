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
await doc.transform(
  dedup(), prune(), resample({ tolerance: 1e-4 }), weld(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], slots: /^(baseColor|normal|emissive)/, quality: 88 }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], slots: /metallicRoughness|occlusion/, quality: 85 }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(out, doc);
const fs = await import("node:fs"); console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), "MB");
