// tools/ktx-hero.mjs — step 2 after tools/pack-hero.mjs: the hero's textures to KTX2 (GPU-compressed: about a sixth of the
// memory of webp and no decoding on the main thread). npm i --no-save ktx2-encoder@0.6 (with the pack-hero deps), then
//   node tools/ktx-hero.mjs models/world/chars/character-custom-aron.glb models/world/chars/character-custom-aron.glb
// the packed hero (webp) → KTX2 textures: colour and metal/roughness ETC1S (sRGB for colour), normal UASTC; mipmaps
import { NodeIO } from "@gltf-transform/core"; import { ALL_EXTENSIONS } from "@gltf-transform/extensions"; import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { ktx2 } from "ktx2-encoder/gltf-transform"; import sharp from "sharp"; import fs from "node:fs";
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const [, , inp, out] = process.argv; const d = await io.read(inp);
const dec512 = async (buf) => { const { data, info } = await sharp(Buffer.from(buf)).resize(512, 512).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
const dec = async (buf) => { const { data, info } = await sharp(Buffer.from(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
await d.transform(
  ktx2({ slots: /^baseColor/, isUASTC: false, qualityLevel: 230, compressionLevel: 2, generateMipmap: true, isSetKTX2SRGBTransferFunc: true, imageDecoder: dec }),
  ktx2({ slots: /metallicRoughness/, isUASTC: false, qualityLevel: 200, compressionLevel: 2, generateMipmap: true, isSetKTX2SRGBTransferFunc: false, imageDecoder: dec }),
  ktx2({ slots: /^normal/, isUASTC: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 2, isNormalMap: true, generateMipmap: true, isSetKTX2SRGBTransferFunc: false, imageDecoder: dec512 }),
);
await io.write(out, d); console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), "MB");
for (const t of d.getRoot().listTextures()) console.log(t.getName(), t.getMimeType(), (t.getImage().byteLength / 1e3).toFixed(0) + " KB");
