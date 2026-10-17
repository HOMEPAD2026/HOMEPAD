// tools/join-props.mjs — joins every mesh of a vertex-coloured prop into one primitive (one draw call per instanced kind),
// welded and meshopt-compressed:  node tools/join-props.mjs in.glb=out.glb …
import { NodeIO } from "@gltf-transform/core"; import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { flatten, join, weld, dedup, prune, quantize, meshopt } from "@gltf-transform/functions"; import { MeshoptEncoder } from "meshoptimizer"; import fs from "node:fs";
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
for (const [inp, out] of process.argv.slice(2).map((a) => a.split("="))) {
  const doc = await io.read(inp), root = doc.getRoot();
  // one shared material so join() can merge everything
  const mat = doc.createMaterial("prop").setRoughnessFactor(0.92).setMetallicFactor(0);
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setMaterial(mat);
  await doc.transform(flatten(), join({ keepNamed: false }), weld(), dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  await io.write(out, doc);
  const meshes = root.listMeshes().length, prims = root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
  console.log(out, "meshes", meshes, "prims", prims, (fs.statSync(out).size / 1e3).toFixed(0) + "KB");
}
