// world-studio-look.js — STU-B (2026-10-26): each Studio theme's own look, painted by Meshy (images/studio/th, models/world/studio):
// the track's floor, the obstacle blocks' face, the far scenery behind the run, and one roadside piece (≤ 3 k tris) instanced
// down both sides. Fetched only when a run of that theme starts (512 px and the small sky on phones / low graphics), kept for
// the page's life; a run that starts before they're in simply gets them a moment later — the drawn colours stay until then.
//   look(THREE, theme, { ver, low, loader }) → Promise<{ track?, wall?, sky?, prop? }>  (each part null when it couldn't load)
//   trackUV(geo, w, len, tile)  — a top plane's UVs in metres, so the floor repeats instead of stretching
const THEMES = ["neon", "jungle", "ice", "lava", "candy"];
const cache = new Map();
const texOf = (THREE, url, srgb = true) => new Promise((ok) => { try { new THREE.TextureLoader().load(url, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; ok(t); }, undefined, () => ok(null)); } catch { ok(null); } });
export function look(THREE, theme, { ver = "", low = false, loader = null } = {}) {
  const th = THEMES.includes(theme) ? theme : "neon", S = low ? 512 : 1024, key = th + ":" + S;
  if (cache.has(key)) return cache.get(key);
  const p = Promise.all([
    texOf(THREE, `/images/studio/th/${th}-track-${S}.webp${ver}`),
    texOf(THREE, `/images/studio/th/${th}-wall-512.webp${ver}`),
    texOf(THREE, `/images/studio/th/${th}-sky-${low ? 768 : 1344}.webp${ver}`),
    loader ? new Promise((ok) => { try { loader().load(`/models/world/studio/prop-${th}.glb${ver}`, (g) => ok(g.scene), undefined, () => ok(null)); } catch { ok(null); } }) : Promise.resolve(null),
  ]).then(([track, wall, sky, prop]) => {
    for (const t of [track, wall]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
    if (wall && th === "candy") wall.repeat.set(0.6, 0.6); // (its stripes are fine: a larger tile reads calmer)
    let pr = null;
    if (prop) { prop.updateMatrixWorld(true); let mesh = null; prop.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      if (mesh) { const g = mesh.geometry.clone(); g.applyMatrix4(mesh.matrixWorld); g.computeBoundingBox(); const b = g.boundingBox, h = b.max.y - b.min.y || 1, c = new THREE.Vector3(); b.getCenter(c);
        g.translate(-c.x, -b.min.y, -c.z); g.scale(1 / h, 1 / h, 1 / h); g.computeBoundingSphere(); pr = { geo: g, mat: mesh.material }; } }
    return { track, wall, sky, prop: pr };
  });
  cache.set(key, p); return p;
}
/// a top plane's UVs in metres (tile m a repeat)
export function trackUV(geo, w, len, tile = 4) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (len / tile)); uv.needsUpdate = true; return geo; }
