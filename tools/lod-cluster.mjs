// tools/lod-cluster.mjs — a far LOD of a packed prop: about <ratio> of its triangles by vertex clustering (a grid over the
// model; meshoptimizer couldn't cross the Meshy meshes' UV seams), no textures (the game reuses the near model's material)
//   node tools/lod-cluster.mjs <in.glb> <out-lod1.glb> [ratio=0.12]   (NODE_PATH with @gltf-transform/* and meshoptimizer)
import { NodeIO } from "@gltf-transform/core"; import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, quantize, meshopt, dedup, compactPrimitive } from "@gltf-transform/functions"; import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer"; import fs from "node:fs";
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const [, , inp, out, ratioArg = "0.12"] = process.argv; const ratio = Number(ratioArg);
const doc = await io.read(inp), root = doc.getRoot();
let before = 0, after = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const pos = p.getAttribute("POSITION"), idx = p.getIndices(); if (!idx) continue;
  const P = new Float32Array(pos.getCount() * 3), e = [0, 0, 0]; for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, e); P.set(e, i * 3); }
  const I = new Uint32Array(idx.getArray()); before += I.length / 3;
  const target = Math.max(36, Math.floor(I.length * ratio / 3) * 3);
  // vertex clustering: a grid over the model, every vertex moved to its cell's first vertex, flat triangles dropped;
  // the grid is refined until the count is under the target
  let lo = 4, hi = 96, best = null;
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let v = 0; v < pos.getCount(); v++) for (let a = 0; a < 3; a++) { bb[a] = Math.min(bb[a], P[v * 3 + a]); bb[a + 3] = Math.max(bb[a + 3], P[v * 3 + a]); }
  const cluster = (g) => { const cell = new Map(), rep = new Uint32Array(pos.getCount());
    for (let v = 0; v < pos.getCount(); v++) { const k = [0, 1, 2].map((a) => Math.min(g - 1, Math.floor((P[v * 3 + a] - bb[a]) / ((bb[a + 3] - bb[a]) || 1) * g))).join(","); if (!cell.has(k)) cell.set(k, v); rep[v] = cell.get(k); }
    const out = []; const seen = new Set();
    for (let t = 0; t < I.length; t += 3) { const a = rep[I[t]], b = rep[I[t + 1]], c = rep[I[t + 2]]; if (a === b || b === c || a === c) continue; const key = [a, b, c].sort((x, y) => x - y).join(","); if (seen.has(key)) continue; seen.add(key); out.push(a, b, c); }
    return new Uint32Array(out); };
  for (let it = 0; it < 10; it++) { const g = Math.round((lo + hi) / 2), r = cluster(g); if (r.length <= target) { best = r; lo = g + 1; } else hi = g - 1; if (lo > hi) break; }
  const J = best || cluster(4);
  after += J.length / 3; idx.setArray(new Uint32Array(J));
  compactPrimitive(p);
  p.setMaterial(null);
}
for (const t of root.listTextures()) t.dispose(); for (const mt of root.listMaterials()) mt.dispose();
await doc.transform(dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(out, doc); console.log(out, "triangles", before, "→", after, (fs.statSync(out).size / 1e3).toFixed(0) + "KB");
