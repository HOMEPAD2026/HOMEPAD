// world-dinotown.js — DINO SOULMATE in town: your companion walking at your side in ARCIRCLE World (the one you raise in
// Jurassic World, world-dino.js), and the other players' with them. Only the look travels: species, colours, rarity and
// growth stage (the server checks it against the companion it keeps: api/_world-social.mjs). Loaded only when there's a
// companion to draw. Town scale: a hatchling comes to your knee, an awakened one stands taller than you.
//
// ctx: { THREE, K, planet, here(v), facing(), ver, inHub(), shadow(r, k), low, reduce }
import { DINO } from "./world-dino-engine.js";

const HGT = [0.62, 0.85, 1.05, 1.35, 1.6]; // its height (m) at each stage
const RAR = { common: 0, advanced: 0.05, rare: 0.1, epic: 0.18, legend: 0.28 };
const RARC = { common: 0xbfd6cf, advanced: 0x5ff0a0, rare: 0x4da6ff, epic: 0xb46cff, legend: 0xffc23c };
/// a look code, "raptor.jade.rare.2" → { species, pal, rarity, stage }
export function lookOf(code) { const m = /^(raptor|trike)\.([a-z]{2,8})\.(common|advanced|rare|epic|legend)\.([0-4])$/.exec(String(code || "")); return m ? { species: m[1], pal: m[2], rarity: m[3], stage: +m[4] } : null; }
export const codeOf = (g, stage) => `${g.species === "trike" ? "trike" : "raptor"}.${g.pal}.${g.rarity}.${Math.max(0, Math.min(4, stage | 0))}`;

export function createTownDinos(ctx) {
  const { THREE, K, planet, here } = ctx;
  const root = new THREE.Group(); root.name = "pet"; planet.add(root); // named "pet": the far-cull leaves moving things alone
  const files = {}, me = new THREE.Vector3(), tmp = new THREE.Vector3();
  let mine = null; const others = new Map(); // key → { d (a drawn dinosaur), code, at }
  function load(sp) {
    if (files[sp]) return files[sp];
    const L = K.gltfLoader ? K.gltfLoader() : null;
    return (files[sp] = L ? L.loadAsync("models/world/jurassic/" + (sp === "trike" ? "dino-triceratops-8" : "dino-raptor-8") + ".glb" + (ctx.ver || "")).catch((e) => { console.warn("town dino", e); return null; }) : Promise.resolve(null));
  }
  /// the model turned to face +z (the files face along x or z: from the hips to the head)
  function faceZ(o) {
    o.updateMatrixWorld(true); let hip = null, head = null; o.traverse((b) => { if (!b.isBone) return; const n = b.name.toLowerCase(); if (!hip && /hips|pelvis|root/.test(n)) hip = b; if (!head && /^head$|head(?!end)/.test(n)) head = b; });
    if (!hip || !head) return o; const a = new THREE.Vector3(), c = new THREE.Vector3(); hip.getWorldPosition(a); head.getWorldPosition(c);
    const w = new THREE.Group(); w.add(o); w.rotation.y = -Math.atan2(c.x - a.x, c.z - a.z); w.updateMatrixWorld(true); return w;
  }
  /// one dinosaur drawn: its clips by name (lowercased, startsWith: walk, run, idle)
  async function make(look) {
    const gl = await load(look.species); if (!gl || !K.skelClone) return null;
    const o = faceZ(K.skelClone(gl.scene)); o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = HGT[look.stage] / (sz.y || 1);
    o.scale.multiplyScalar(k); o.position.set(-(b.min.x + sz.x / 2) * k, -b.min.y * k, -(b.min.z + sz.z / 2) * k);
    const pal = new THREE.Color((DINO.PALS.find((x) => x.id === look.pal) || DINO.PALS[0]).c), glow = RAR[look.rarity] + (look.stage === 4 ? 0.2 : 0);
    o.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; if (m.material) { m.material = m.material.clone(); if (m.material.color) m.material.color.multiply(pal); if (glow > 0) { m.material.emissive = new THREE.Color(RARC[look.rarity]); m.material.emissiveIntensity = glow; } } } });
    const g = new THREE.Group(); g.add(o);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 36), new THREE.MeshBasicMaterial({ color: RARC[look.rarity], transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.scale.setScalar(Math.max(0.5, sz.z * k * 0.38)); g.add(ring);
    if (ctx.shadow) { const cs = ctx.shadow(Math.max(0.35, sz.z * k * 0.3), 0.4); if (cs) g.add(cs); }
    const mixer = new THREE.AnimationMixer(o), by = {};
    for (const c of gl.animations) by[c.name.replace(/^.*\|/, "").toLowerCase()] = c;
    const clip = (n) => by[n] || Object.entries(by).find(([k2]) => k2.startsWith(n))?.[1] || null;
    const d = { g, mixer, cur: null, n: "", face: 0, len: sz.z * k, play(n, speed = 1) { const c = clip(n); if (!c) return; const a = mixer.clipAction(c); a.timeScale = speed; if (d.n === n) return; a.reset().play(); if (d.cur) d.cur.crossFadeTo(a, 0.25, false); d.cur = a; d.n = n; } };
    d.play("idle"); return d;
  }
  function drop(d) { if (d && d.g) root.remove(d.g); }
  const shortest = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  /// a step toward where it should be, the clip from how fast it went (walk by its pace; a run when it hurries)
  function follow(d, x, z, dt, near) {
    const px = d.g.position.x, pz = d.g.position.z, dist = Math.hypot(x - px, z - pz);
    if (dist > 25) d.g.position.set(x, 0, z); else if (dist > 0.25) { const k = 1 - Math.exp(-dt * (dist > 4 ? 5 : 2.6)); d.g.position.x += (x - px) * k; d.g.position.z += (z - pz) * k; }
    const sp = Math.hypot(d.g.position.x - px, d.g.position.z - pz) / Math.max(1e-3, dt);
    if (sp > 0.35) d.face = Math.atan2(d.g.position.x - px, d.g.position.z - pz);
    d.g.rotation.y += shortest(d.face - d.g.rotation.y) * Math.min(1, dt * 7);
    if (sp > 3.6) d.play("run", Math.max(0.8, sp / 6)); else if (sp > 0.35) d.play("walk", Math.max(0.6, sp / 1.8)); else d.play("idle");
    if (near) d.mixer.update(dt); else { d.acc = (d.acc || 0) + dt; if ((d.fc = (d.fc || 0) + 1) % 3 === 0) { d.mixer.update(d.acc); d.acc = 0; } }
  }
  let busy = false;
  return {
    /// your companion's look (a code, or "" for none / resting)
    async set(code) {
      if ((mine ? mine.code : "") === code || busy) return; const look = lookOf(code);
      if (mine) { drop(mine.d); mine = null; } if (!look) return;
      busy = true; try { const d = await make(look); if (d) { here(me); d.g.position.set(me.x + 1.4, 0, me.z + 1.4); root.add(d.g); mine = { d, code }; } } finally { busy = false; }
    },
    /// the others around (from the presence list): [{ key, x, z, code }] — new ones drawn, gone ones dropped
    async others(list) {
      const seen = new Set();
      for (const o of list) { const look = lookOf(o.code); if (!look) continue; seen.add(o.key); const cur = others.get(o.key);
        if (cur && cur.code === o.code) { cur.x = o.x; cur.z = o.z; continue; } if (cur) { drop(cur.d); others.delete(o.key); }
        if (others.size >= 10) continue; const slot = { code: o.code, x: o.x, z: o.z, d: null }; others.set(o.key, slot); make(look).then((d) => { if (others.get(o.key) !== slot || !d) return drop(d); slot.d = d; d.g.position.set(o.x + 1.2, 0, o.z + 1.2); root.add(d.g); }); }
      for (const [k, o] of others) if (!seen.has(k)) { drop(o.d); others.delete(k); }
    },
    tick(dt) {
      const on = ctx.inHub(); root.visible = on; if (!on) return; here(me); const f = ctx.facing();
      if (mine) follow(mine.d, me.x - Math.sin(f) * 1.6 - Math.cos(f) * 1.2, me.z - Math.cos(f) * 1.6 + Math.sin(f) * 1.2, dt, true);
      for (const o of others.values()) if (o.d) { const dd = Math.hypot(o.x - me.x, o.z - me.z); follow(o.d, o.x + 1.2, o.z + 1.2, dt, dd < 26); }
    },
    debug: () => ({ mine: mine ? { code: mine.code, x: +mine.d.g.position.x.toFixed(1), z: +mine.d.g.position.z.toFixed(1), clips: mine.d.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name) } : null, others: others.size }),
  };
}
