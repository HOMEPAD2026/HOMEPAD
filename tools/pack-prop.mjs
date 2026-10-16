// tools/pack-prop.mjs — turns a Meshy export of a still model (a rock, a building) into a game file: fewer triangles
// (meshopt simplify to about <tris>), textures resized for a phone (colour and normal <tex>, metal/roughness half that,
// webp), welded, quantized and meshopt-compressed. Then tools/ktx-hero.mjs makes the textures KTX2.
//   node tools/pack-prop.mjs <in.glb> <out.glb> <tris> <tex>
// Needs @gltf-transform/{core,extensions,functions}, meshoptimizer and sharp (npm i them anywhere and set NODE_PATH).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, weld, simplify, quantize, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";
const [, , inp, out, trisArg = "6000", texArg = "1024"] = process.argv;
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(inp), root = doc.getRoot();
const tris = () => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute("POSITION").getCount()) / 3, 0), 0);
const before = tris(), want = Number(trisArg), tex = Number(texArg);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, want / before), error: Number(process.env.ERR || 0.03), lockBorder: false }));
console.log("triangles", Math.round(before), "→", Math.round(tris()));
for (const t of root.listTextures()) {
  const slots = doc.getGraph().listParentEdges(t).map((e) => e.getName()).join(",");
  const s = /metallicRoughness/.test(slots) ? tex / 2 : tex;
  const buf = await sharp(Buffer.from(t.getImage())).resize(s, s, { fit: "fill" }).webp({ quality: 88 }).toBuffer();
  t.setImage(new Uint8Array(buf)).setMimeType("image/webp");
}
await doc.transform(dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(out, doc); console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), "MB");
