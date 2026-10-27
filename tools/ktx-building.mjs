// tools/ktx-building.mjs — a packed still building (tools/pack-prop.mjs, webp) → KTX2 for a phone: colour and metal/roughness
// ETC1S (sRGB for colour), mipmaps, and no normal map (a building is seen from metres away and Meshy bakes its detail into
// the colour; the normal map was a third of the file). WebP decodes to full RGBA in GPU memory (~12 MB a building with
// mips at 1024²); KTX2 stays compressed (~2 MB). Same deps as tools/ktx-hero.mjs (run it from where they're installed).
//   node tools/ktx-building.mjs <in.glb> <out.glb> [colour px, default 1024]
import { NodeIO } from "@gltf-transform/core"; import { ALL_EXTENSIONS } from "@gltf-transform/extensions"; import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { prune } from "@gltf-transform/functions"; import { ktx2 } from "ktx2-encoder/gltf-transform"; import sharp from "sharp"; import fs from "node:fs";
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const [, , inp, out, px = "1024"] = process.argv; const d = await io.read(inp), S = Number(px);
for (const m of d.getRoot().listMaterials()) { m.setNormalTexture(null); m.setEmissiveTexture(m.getEmissiveTexture()); }
await d.transform(prune());
const dec = (s) => async (buf) => { const im = sharp(Buffer.from(buf)), md = await im.metadata(), w = Math.min(s, md.width || s); const { data, info } = await im.resize(w, w).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
await d.transform(
  ktx2({ slots: /^baseColor/, isUASTC: false, qualityLevel: 200, compressionLevel: 2, generateMipmap: true, isSetKTX2SRGBTransferFunc: true, imageDecoder: dec(S) }),
  ktx2({ slots: /metallicRoughness/, isUASTC: false, qualityLevel: 160, compressionLevel: 2, generateMipmap: true, isSetKTX2SRGBTransferFunc: false, imageDecoder: dec(S / 2) }),
);
await io.write(out, d); console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), "MB");
