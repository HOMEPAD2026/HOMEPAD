// world-combat.js — fighting in ARCIRCLE World.
//
//   scammers      every one has a level (shown over its head, coloured against yours); the stronger, the more XP and
//                 the better the drops. Weak ones (level 1–3) wander the streets now and then; the rest live in the
//                 five hunting grounds (world-zones.js), with elites (gold ring) and a boss every 30 minutes.
//   attack        J (or the Attack button): a three-hit combo, the third swing hits hardest
//   skills        one learned at levels 10, 20, 40 and 80 — Ice Ball (slows), Fire Ball (splash and burn), Shock (chains
//                 and stuns), Meteor (a crater of fire); one is set in the skill slot (Z casts it, Q or a long press
//                 changes it). They grow stronger every five levels and cost SP
//   potions       4 and 5 (or the small buttons): health and mana, from drops or the Forge
//   damage        your Attack against their Defense (world-rpg-data.js); critical hits from your Critical stat
//   HP and SP     from your level and gear (world-rpg.js). At 0 HP: the first time each day you get up for free;
//                 after that, revive on the spot for 10,000 $ARCIRCLE (the player's own transfer; half is burned) or
//                 rest 24 hours (no fighting until it ends)
//   street items  ARCL coins, speed boots, a spring, XP stars, mana crystals, health potions, a shield, a magnet
// ARCL goes through the server's claim: "street" (5), "hunt" (8–12 by tier, level-gated), "boss" (30), "pickup" (2),
// each limited per day, because the server can't watch a fight.
import { mobStats, hitDamage, ZONES, zoneAt, skillLevel, RARITY, BRANCH_AT, goldenRush, weekEvent } from "./world-rpg-data.js";
import { weaponKind, potion as potion3d, token as token3d } from "./world-gear3d.js";
const TAU = Math.PI * 2;
export const SKILLS = [
  { id: "ice", name: "Ice Ball", key: "Z", lv: 10, cd: 2.6, sp: 15, color: 0x8fe6ff, mult: 1.4 },
  { id: "fire", name: "Fire Ball", key: "Z", lv: 20, cd: 4.0, sp: 25, color: 0xff7a2a, mult: 1.9 },
  { id: "shock", name: "Shock", key: "Z", lv: 40, cd: 6.0, sp: 35, color: 0xb48cff, mult: 1.2 },
  { id: "meteor", name: "Meteor", key: "Z", lv: 80, cd: 12.0, sp: 60, color: 0xff4d2a, mult: 3.2 },
];
const MOBS = {
  spam: { id: "spam", name: "Spam Bot", model: "EyeDrone", scale: 0.7, y: 1.2, speed: 2.4, color: "#ff4d6d" },
  drop: { id: "drop", name: "Fake Airdrop", model: "QuadShell", scale: 0.85, y: 0.45, speed: 2.0, color: "#ffc861" },
  rug: { id: "rug", name: "Rug Gremlin", model: "Trilobite", scale: 0.95, y: 0.55, speed: 2.7, color: "#b48cff" },
};
// the creatures some hunting grounds dress their scammers as (Quaternius monsters, models/world/packs/q-monsters.glb):
// h is the height in metres, y lifts the fliers. Only the look changes; the scam (its name, stats, codex entry) stays.
const SKIN = {
  Bat: { h: 1.25, y: 0.9 }, Wasp: { h: 1.1, y: 0.9 }, Frog: { h: 0.75, y: 0 }, Snake: { h: 1.25, y: 0 }, Rat: { h: 0.7, y: 0 },
  Spider: { h: 0.8, y: 0 }, Slime: { h: 0.85, y: 0 }, Skeleton: { h: 1.85, y: 0 }, Dragon: { h: 3.4, y: 1.1 },
};
const ITEMS = [
  { id: "coin", name: "ARCL coin", w: 30, color: 0xffc861 },
  { id: "boots", name: "Speed boots", w: 14, color: 0x35d8d0, secs: 20 },
  { id: "spring", name: "Spring", w: 12, color: 0x39ff88, secs: 20 },
  { id: "star", name: "XP star", w: 18, color: 0xffe066 },
  { id: "mana", name: "Mana crystal", w: 10, color: 0xb48cff },
  { id: "potion", name: "Health potion", w: 12, color: 0xff5f73 },
  { id: "shield", name: "Shield", w: 8, color: 0x4fa8ff, secs: 30 },
  { id: "magnet", name: "Magnet", w: 8, color: 0xff4d6d, secs: 20 },
];
const BOSS_FIRST = 2 * 60e3, BKEY = "arc.world.boss";
const bossEvery = () => (weekEvent() === "boss" ? 15 : 30) * 60e3; // a boss rush week brings them back twice as fast

/// ctx: { THREE, K, kit(), planet, st, here(v), facing(), moveDir(v) → bool, avatar(), level(), T, lang, esc, toast, Snd,
///        reduce, coarse, inHub(), active(), gain(xp, why), claim(kind, extra, from), knock(dir, power), dash(dir, dist),
///        hurt(), down(on, where), pay(id, onStatus), screenOf(v), float(text, v, color, big), shake(n), hopY(),
///        blocked(v) → bool, rpg (world-rpg.js) }
export function createCombat(ctx) {
  const { THREE, K, planet, Snd, rpg } = ctx;
  const VX = ctx.vfx || null; // world-vfx.js: the layered light effects on top of the puffs below
  const LW = { ko: { "Halloween · everyone's HP": "할로윈 · 모두의 HP", Spring: "스프링", Shield: "보호막", Magnet: "자석", Shock: "전기충격", Meteor: "메테오", Attack: "공격", Dodge: "회피", Dodged: "회피!", free: "무료", Elite: "엘리트", Boss: "보스" }, zh: { "Halloween · everyone's HP": "万圣节 · 全员共享血量", Spring: "弹簧", Shield: "护盾", Magnet: "磁铁", Shock: "电击", Meteor: "陨石", Attack: "攻击", Dodge: "闪避", Dodged: "闪避！", free: "免费", Elite: "精英", Boss: "首领" }, tr: { "Halloween · everyone's HP": "Cadılar Bayramı · herkesin canı", Spring: "Yay", Shield: "Kalkan", Magnet: "Mıknatıs", Shock: "Şok", Meteor: "Meteor", Attack: "Saldır", Dodge: "Kaçın", Dodged: "Kaçındın!", free: "ücretsiz", Elite: "Elit", Boss: "Boss" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const V3 = THREE.Vector3, UP = new THREE.Vector3(0, 1, 0);
  const root = new THREE.Group(); root.name = "combat"; planet.add(root);
  const mobs = [], items = [], shots = [], fx = [], drops = [];
  const cd = { attack: 0, ice: 0, fire: 0, shock: 0, meteor: 0, dodge: 0 };
  const stats = () => rpg.stats();
  const maxHp = () => stats().hp, maxSp = () => stats().sp;
  let fightOn = false, quietT = 0, hp = maxHp(), sp = maxSp(), calmT = 0, down = false, guardT = 0, stopT = 0, combo = 0, comboT = 0, heartT = 0;
  const buffs = {}; let shieldShown = false;
  let spawnT = 14, itemT = 2, hurtT = 0, zone = null, zoneShown = null, alertT = 0, wuHint = false; // alertT: one "!" at a time; wuHint: the dodge tip once a visit
  const me = new V3(), tmp = new V3(), tmp2 = new V3(), fwd = new V3(), ONE = new V3(1, 1, 1);
  const add = (m) => { root.add(m); return m; };
  // the swing's crescent: bright at the outer edge, a white core, a head that sweeps along the arc and a tail that
  // fades behind it (one shader on the swing's ring; additive, so it glows without a box round it)
  const slashMat = (c) => new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(c) }, uK: { value: 0 }, uO: { value: 1 }, uR: { value: new THREE.Vector2(1, 1.5) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 uC; uniform float uK, uO; uniform vec2 uR; varying vec2 vP;
      void main(){ float r = length(vP), a = atan(vP.y, vP.x); float t = clamp((a - 0.2) / 2.6, 0.0, 1.0);
        float head = mix(0.2, 1.15, uK); float along = smoothstep(head - 0.8, head, t) * (1.0 - smoothstep(head, head + 0.05, t));
        float rr = clamp((r - uR.x) / (uR.y - uR.x), 0.0, 1.0); float body = pow(rr, 2.0) * (1.0 - smoothstep(0.9, 1.0, rr)); float core = smoothstep(0.72, 0.95, rr) * (1.0 - smoothstep(0.95, 1.0, rr));
        float al = (body * 0.75 + core) * along * uO; gl_FragColor = vec4(mix(uC, vec3(1.0), core * 0.85) * al, al); }` });
  // danger areas: amber (and a little stronger) in colour-blind mode, so they don't hang on red alone
  const warnCB = () => document.documentElement.classList.contains("wp-cb"), warnCol = () => (warnCB() ? 0xffc23a : 0xff2d4d), warnOp = () => (warnCB() ? 0.4 : 0.3);
  const additive = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const dotTex = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const spriteMat = (c, o = 1) => new THREE.SpriteMaterial({ map: dotTex, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const unlocked = (s) => ctx.level() >= s.lv;
  const fwdOf = (out) => { const f = ctx.facing(); return out.set(Math.sin(f), 0, Math.cos(f)); };
  const lvColor = (lv) => { const d = lv - ctx.level(); return d <= -5 ? "#9aa4b0" : d <= 2 ? "#ffffff" : d <= 5 ? "#ffb04a" : "#ff4d6d"; };
  // shared geometry for effects (b413): a swing, a telegraph or a spell used to build its rings, discs and beams afresh
  // every time and throw them away (a GPU upload and garbage on every blow); one copy each now, and their dispose() does
  // nothing, so the code that cleans an effect up stays as it was
  const SG = new Map();
  const sgeo = (key, make) => { let g = SG.get(key); if (!g) { g = make(); g.dispose = () => {}; SG.set(key, g); } return g; };

  // ---------------- particles (sprites come from a pool, so a fight doesn't allocate every frame) ----------------
  const pool = [];
  const sprite = (c, o = 1) => { const s = pool.pop() || new THREE.Sprite(spriteMat(c, o)); s.material.color.set(c); s.material.opacity = o; s.material.rotation = 0; s.visible = true; s.userData.pooled = true; return s; };
  function puff(pos, color, { n = 10, speed = 4, size = 0.35, life = 0.6, up = 1, grav = 4 } = {}) {
    if (ctx.reduce || (ctx.lite && ctx.lite())) n = Math.ceil(n / 3);
    // the GPU particles (world-particles.js): one draw call for all of them; big slow rising puffs are smoke
    if (ctx.parts) { const smoke = grav < 0 && size >= 1; ctx.parts.emit({ at: pos, color, n, speed, size: smoke ? size : size * 1.1, life, up, grav, drag: smoke ? 1.6 : 0.9, kind: smoke ? "smoke" : "glow", jitter: smoke ? 0.8 : 0.15 }); return; }
    for (let i = 0; i < n; i++) {
      const s = sprite(color); s.position.copy(pos); s.scale.setScalar(size * (0.6 + Math.random() * 0.8)); add(s);
      const a = Math.random() * TAU;
      fx.push({ o: s, v: new V3(Math.cos(a) * speed * Math.random(), (0.5 + Math.random()) * speed * 0.6 * up, Math.sin(a) * speed * Math.random()), life, t: 0, grav, s0: s.scale.x });
    }
  }
  function shards(pos, color, n = 10, speed = 6) {
    const geo = sgeo(`Tetrahedron|${[0.12, 0]}`, () => new THREE.TetrahedronGeometry(0.12, 0));
    for (let i = 0; i < (ctx.reduce || (ctx.lite && ctx.lite()) ? 4 : n); i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.2, transparent: true })); m.position.copy(pos); add(m);
      const a = Math.random() * TAU; fx.push({ o: m, v: new V3(Math.cos(a) * speed * Math.random(), 2 + Math.random() * speed * 0.7, Math.sin(a) * speed * Math.random()), life: 0.7 + Math.random() * 0.3, t: 0, grav: 14, spin: new V3(Math.random() * 12, Math.random() * 12, 0) });
    }
  }
  // a mark on the ground where something big landed: cracks and a scorch that fade after a few seconds (a pool of 8)
  let crackTex = null; const marks = [];
  function crackTexture() {
    if (crackTex) return crackTex; const S = 256, cv = document.createElement("canvas"); cv.width = cv.height = S; const g = cv.getContext("2d"), c = S / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, "rgba(0,0,0,.75)"); gr.addColorStop(0.45, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(0,0,0,.9)"; g.lineCap = "round";
    for (let i = 0; i < 11; i++) { let a = (i / 11) * TAU + Math.random() * 0.4, r = 10, x = c, y = c; g.lineWidth = 5; g.beginPath(); g.moveTo(x, y);
      while (r < c * 0.95) { r += 10 + Math.random() * 14; a += (Math.random() - 0.5) * 0.5; x = c + Math.cos(a) * r; y = c + Math.sin(a) * r; g.lineTo(x, y); g.lineWidth = Math.max(1, g.lineWidth - 0.5); } g.stroke(); }
    crackTex = new THREE.CanvasTexture(cv); crackTex.colorSpace = THREE.SRGBColorSpace; return crackTex;
  }
  function scorch(pos, r = 3, color = 0x2a1a10) {
    if (ctx.lite && ctx.lite()) return;
    let mk = marks.find((x) => x.t >= x.life);
    if (!mk) { if (marks.length >= 8) mk = marks.reduce((a, b) => (a.t > b.t ? a : b)); else { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.userData.noBake = true; mk = { m, t: 0, life: 5 }; marks.push(mk); add(m); } }
    if (!mk.m.parent) add(mk.m);
    mk.t = 0; mk.m.position.set(pos.x, 0.05, pos.z); mk.m.scale.set(r * 2, r * 2, 1); mk.m.rotation.z = Math.random() * TAU; mk.m.material.color.set(color); mk.m.material.opacity = 1; mk.m.visible = true;
  }
  function tickMarks(dt) { for (const mk of marks) { if (mk.t >= mk.life) continue; mk.t += dt; mk.m.material.opacity = Math.min(1, (mk.life - mk.t) / 1.5); if (mk.t >= mk.life) mk.m.visible = false; } }
  // rings are kept for reuse (b420): a fight throws several a second, each with its own material
  const ringPool = [], ringBack = (o) => { if (ringPool.length < 24) ringPool.push(o); else o.material.dispose(); };
  function ring(pos, color, { r0 = 0.3, r1 = 2.6, life = 0.35, y = 0.08 } = {}) {
    const m = ringPool.pop() || new THREE.Mesh(sgeo(`Ring|${[0.85, 1, 48]}`, () => new THREE.RingGeometry(0.85, 1, 48)), additive(color, 0.9)); m.material.color.set(color); m.material.opacity = 0.9; m.visible = true;
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y = y; m.scale.setScalar(r0); add(m);
    fx.push({ o: m, life, t: 0, grow: [r0, r1], back: ringBack });
  }
  function flash(pos, color, size = 3, life = 0.25) { const s = sprite(color); s.position.copy(pos); s.scale.setScalar(size); add(s); fx.push({ o: s, life, t: 0, grow: [size, size * 1.6] }); }
  // a column of light that fades upward (a gradient, so it glows instead of washing the screen white)
  let fadeTex = null;
  const fadeUp = () => { if (fadeTex) return fadeTex; const c = document.createElement("canvas"); c.width = 4; c.height = 128; const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.55, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,1)"); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); fadeTex = new THREE.CanvasTexture(c); return fadeTex; };
  function pillar(pos, color, h = 14, life = 1.4, r = 1.2) {
    const m = new THREE.Mesh(sgeo(`Cylinder|${[r, r * 1.3, h, 24, 1, true]}`, () => new THREE.CylinderGeometry(r, r * 1.3, h, 24, 1, true)), additive(color, 0.5)); m.material.side = THREE.FrontSide; m.material.map = fadeUp(); m.material.depthWrite = false; m.position.copy(pos).setY(h / 2); add(m);
    fx.push({ o: m, life, t: 0, op0: 0.5, onTick: (k) => { m.scale.x = m.scale.z = 1 - k * 0.6; } });
  }
  function tickFx(dt) {
    tickMarks(dt);
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i]; p.t += dt; const k = p.t / p.life;
      if (k >= 1) {
        root.remove(p.o);
        if (p.back) { p.o.visible = false; p.back(p.o); }
        else if (p.o.userData.pooled) { p.o.visible = false; if (pool.length < 400) pool.push(p.o); else p.o.material.dispose(); }
        else { p.o.traverse((o) => { if (o.material) o.material.dispose && o.material.dispose(); if (o.geometry) o.geometry.dispose(); }); }
        fx.splice(i, 1); continue;
      }
      if (p.v) { p.v.y -= (p.grav || 0) * dt; p.o.position.addScaledVector(p.v, dt); if (p.o.position.y < 0.05) { p.o.position.y = 0.05; p.v.multiplyScalar(0.5); } }
      if (p.spin) { p.o.rotation.x += p.spin.x * dt; p.o.rotation.y += p.spin.y * dt; }
      if (p.grow) p.o.scale.setScalar(p.grow[0] + (p.grow[1] - p.grow[0]) * (1 - Math.pow(1 - k, 2)));
      else if (p.s0) p.o.scale.setScalar(p.s0 * (1 - k * 0.6));
      if (p.o.material && !Array.isArray(p.o.material)) p.o.material.opacity = (p.op0 ?? 1) * (1 - k);
      if (p.onTick) p.onTick(k);
    }
  }

  // ---------------- scammers ----------------
  // HP bars are kept for reuse (b413): a new canvas, texture and material on every spawn, freed on every knock-out
  const barPool = [];
  function hpBar(w = 1.7) {
    const old = barPool.pop(); if (old) { old.scale.set(w, w * 44 / 160, 1); old.visible = true; old.position.set(0, 0, 0); return old; }
    const cv = document.createElement("canvas"); cv.width = 160; cv.height = 44; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })); sp.scale.set(w, w * 44 / 160, 1); sp.renderOrder = 11;
    sp.userData.draw = (lv, name, k, color, rank, trail = k) => {
      const g = cv.getContext("2d"); g.clearRect(0, 0, 160, 44); g.font = "800 15px Sora, sans-serif"; g.textAlign = "center";
      g.fillStyle = "rgba(6,10,16,.8)"; g.beginPath(); g.roundRect(2, 2, 156, 21, 10); g.fill();
      if (rank) { g.strokeStyle = rank === "boss" ? "#ff4d6d" : "#ffc861"; g.lineWidth = 2; g.stroke(); }
      const t = `Lv ${lv} ${name}`; let fs = 15; while (fs > 9 && g.measureText(t).width > 148) { fs -= 1; g.font = `800 ${fs}px Sora, sans-serif`; } // a long boss name shrinks to fit
      g.fillStyle = color; g.fillText(t, 80, 17 + (15 - fs) * 0.2);
      g.fillStyle = "rgba(6,10,16,.85)"; g.beginPath(); g.roundRect(16, 28, 128, 12, 6); g.fill();
      // the damage just taken shows as a pale tail that catches up a moment later; ticks mark each tenth (each quarter on a boss)
      if (trail > k) { g.fillStyle = "rgba(255,240,230,.85)"; g.beginPath(); g.roundRect(18, 30, 124 * Math.min(1, trail), 8, 4); g.fill(); }
      g.fillStyle = document.documentElement.classList.contains("wp-cb") ? (k > 0.5 ? "#4fa8ff" : k > 0.25 ? "#ffc861" : "#ff8a1e") : k > 0.5 ? "#39ff88" : k > 0.25 ? "#ffc861" : "#ff4d6d"; // colour-blind friendly: blue → amber → orange g.beginPath(); g.roundRect(18, 30, 124 * Math.max(0, k), 8, 4); g.fill();
      g.fillStyle = "rgba(6,10,16,.55)"; const seg = rank === "boss" ? 4 : 10; for (let i = 1; i < seg; i++) g.fillRect(18 + (124 * i) / seg - 0.75, 30, 1.5, 8);
      if (rank === "elite") { g.fillStyle = "#ffc861"; g.beginPath(); g.moveTo(8, 34); g.lineTo(12, 30); g.lineTo(16, 34); g.lineTo(12, 38); g.closePath(); g.fill(); } // an elite's mark
      tex.needsUpdate = true;
    };
    return sp;
  }
  const AFFIX = [{ id: "frost", name: "Frost {x}", color: "#7fe0ff", p: 0xbff2ff }, { id: "blaze", name: "Blazing {x}", color: "#ff8a3c", p: 0xffa040 }, { id: "venom", name: "Toxic {x}", color: "#9aff5a", p: 0x9aff5a }];
  const tmpA = new V3(); let lblBudget = 4;
  const label = (m) => { const k = Math.max(0, m.hp / m.max); if (m.trail == null || m.trail < k) m.trail = k; m.bar.userData.draw(m.lv, (m.rank === "boss" ? m.bossName : m.rare ? T("Golden {x}", { x: T(m.spec.name) }) : m.affix ? T(m.affix.name, { x: T(m.spec.name) }) : T(m.spec.name)), k, m.rank === "boss" ? "#ff8fa0" : m.rank === "elite" || m.rare ? "#ffd27a" : lvColor(m.lv), m.rank, m.trail); };
  // the pale tail: holds for a moment after a hit, then slides down to the HP (redrawn at most 20 times a second)
  function tickTrail(m, dt) {
    const k = Math.max(0, m.hp / m.max); if (m.trail == null || m.trail <= k + 0.002) return;
    if ((m.trailHold = (m.trailHold || 0) - dt) > 0) return;
    // b441: each redraw re-uploads the bar's canvas to the GPU; a few per frame at most (two on a slow phone), 10 a second there
    const nt = Math.max(k, m.trail - dt * 0.8); m.trailT = (m.trailT || 0) - dt;
    if (m.trailT > 0 && nt > k) { m.trail = nt; return; }
    if (lblBudget <= 0) return; // tried again next frame
    lblBudget--; m.trail = nt; m.trailT = lowQ() ? 0.1 : 0.05; label(m);
  }
  /// a scammer: { type, lv, rank ("" | "elite" | "boss"), at (V3), zone, boss: zone.boss spec }
  // scammers are kept for reuse (a few per model) instead of copied afresh each time: a copy of a skinned model and
  // its materials every few seconds was a hitch on phones
  const mobPool = new Map();
  const takeEnemy = (kit, key) => { const a = mobPool.get(key); if (a && a.length) return a.pop(); const e = K.enemy(kit, key); if (e) e.key = key; return e; };
  // gone: its HP bar's canvas texture is freed (one per scammer: these piled up over a long hunt, slowing the game and,
  // on phones, running the GPU out of memory, which showed as black squares); a scammer that doesn't go back to the
  // pool frees its own materials too
  function retire(m, i) {
    root.remove(m.g); mobs.splice(i, 1);
    if (m.bar) { m.g.remove(m.bar); if (barPool.length < 16) barPool.push(m.bar); else { if (m.bar.material.map) m.bar.material.map.dispose(); m.bar.material.dispose(); } }
    if (m.crown) m.crown.traverse((x) => { if (x.isMesh) { x.geometry.dispose(); x.material.dispose(); } });
    if (m.aura) { m.aura.geometry.dispose(); m.aura.material.dispose(); }
    if (m.e && m.e.keep) { m.g.remove(m.e.obj); return; } // a body lent by another module (world-pumpking.js) goes back to it whole
    if (m.e && m.e.key) { m.g.remove(m.e.obj); m.e.obj.position.x = 0; m.e.obj.rotation.x = m.e.obj.rotation.z = 0; const a = mobPool.get(m.e.key) || []; if (a.length < 6) { a.push(m.e); mobPool.set(m.e.key, a); return; } }
    if (m.e && m.e.obj) { const seen = new Set(); m.e.obj.traverse((x) => { if (x.isMesh && x.material && !seen.has(x.material) && !x.userData.outline) { seen.add(x.material); x.material.dispose(); } }); if (m.e.mixer) m.e.mixer.stopAllAction(); }
  }
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }), ringBoss = new THREE.MeshBasicMaterial({ color: 0xff4d6d }), ringElite = new THREE.MeshBasicMaterial({ color: 0xffc861 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffc861, metalness: 0.85, roughness: 0.25, emissive: 0x6a4a10, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const crownBossMat = new THREE.MeshStandardMaterial({ color: 0xff5f73, metalness: 0.7, roughness: 0.3, emissive: 0x7a1020, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  const bossHazeMat = new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false });
  // the frozen shell: one material for all (b413; it was a new physical material, a heavy shader, for every scammer)
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.1, flatShading: true });
  const shellStatueMat = shellMat.clone(); shellStatueMat.opacity = 0.85;
  const geoCache = new Map(), geoOf = (k, make) => { let g = geoCache.get(k); if (!g) { g = make(); geoCache.set(k, g); } return g; };
  // its toon rim colour is a uniform owned by each copy's material: grabbed when it compiles, so a spawn can recolour it
  // (AC Defense wave tint, a boss's colour) and the next normal spawn sets it back (rimC: the wanted colour)
  const RIM0 = 0xff9a8a;
  function rimHook(mt) { const pb = mt.onBeforeCompile; mt.onBeforeCompile = function (sh, r) { pb.call(this, sh, r); const u = sh.uniforms.uRim; if (u && u.value && u.value.setHex) { mt.userData.rimU = u; if (mt.userData.rimC != null) u.value.setHex(mt.userData.rimC); } }; }
  function setRim(e, c) { e.obj.traverse((x) => { if (!x.isMesh || x.userData.outline || !x.material || Array.isArray(x.material)) return; const u = x.material.userData; u.rimC = c; if (u.rimU) u.rimU.value.setHex(c); }); }
  // AC Defense look (world-defense.js): a wave tint (mint → cyan → violet → red as the waves climb), set once a wave and
  // put on each walker at spawn only; a boss's outline takes its own colour (one material per colour, shared)
  let dTint = 0x4dffb0, dGlow = 0.25, bossCb = null;
  const TINTS = [[1, 0x4dffb0], [5, 0x38d8ff], [10, 0xb48cff], [15, 0xff4d6d]], tcA = new THREE.Color(), tcB = new THREE.Color();
  function setTint(w) {
    w = Math.max(1, +w || 1); let i = 0; while (i < TINTS.length - 2 && w >= TINTS[i + 1][0]) i++;
    const [w0, c0] = TINTS[i], [w1, c1] = TINTS[i + 1], k = Math.max(0, Math.min(1, (w - w0) / (w1 - w0)));
    dTint = tcA.setHex(c0).lerp(tcB.setHex(c1), k).getHex(); dGlow = 0.22 + 0.28 * Math.min(1, (w - 1) / 14); return dTint;
  }
  const olMats = new Map();
  const olMat = (src, c) => { let m = olMats.get(c); if (!m) { m = src.clone(); m.color.setHex(c).multiplyScalar(1.6); m.onBeforeCompile = src.onBeforeCompile; m.customProgramCacheKey = src.customProgramCacheKey; olMats.set(c, m); } return m; }; // same shader as the dark rim: only its colour differs
  const lowQ = () => !!ctx.low || !!(ctx.lite && ctx.lite());
  // a scammer's own materials (the toon look, the dissolve), made once per copy; the copy then goes round the pool
  function prepEnemy(e) {
    e.obj.traverse((x) => { if (x.isMesh && x.material) { x.material = x.material.clone(); if (K.toonLook) K.toonLook(x.material, { rim: 0xff9a8a }); if (K.dissolveLook) K.dissolveLook(x.material, e.dis || (e.dis = { value: 0 })); rimHook(x.material); } });
    if (K.outlineAll && !ctx.coarse && !(ctx.lite && ctx.lite())) e.outlines = K.outlineAll(e.obj, { color: 0x1a0a14, t: 0.03 });
    e.own = true;
  }
  // its size at scale 1, measured once per copy (b413): measuring a skinned model walks every vertex through its bones
  function unitBox(e) {
    if (e.ub) return e.ub;
    const s0 = e.obj.scale.x, y0 = e.obj.position.y, par = e.obj.parent; if (par) par.remove(e.obj);
    e.obj.scale.setScalar(1); e.obj.position.set(0, 0, 0); e.obj.updateMatrixWorld(true);
    e.ub = new THREE.Box3().setFromObject(e.obj);
    e.obj.scale.setScalar(s0); e.obj.position.y = y0; if (par) par.add(e.obj);
    return e.ub;
  }
  function spawnMob(o = {}) {
    const kit = ctx.kit(); if (!kit) return null;
    const spec = MOBS[o.type] || MOBS[["spam", "drop", "rug"][Math.floor(Math.random() * 3)]];
    const bs = o.rank === "boss" ? o.boss : null;
    // a creature's look in this ground, once its pack is in (the robot until then)
    const skinId = o.ent ? null : bs ? bs.skin : o.zone && o.zone.skins ? o.zone.skins[spec.id] : null, skin = skinId && kit.enemies[skinId] ? SKIN[skinId] : null;
    const e = o.ent || takeEnemy(kit, skin ? skinId : bs ? bs.model : spec.model); if (!e) return null; // o.ent: a body another module made and keeps (world-pumpking.js)
    ctx.here(me);
    let p = o.at || null;
    for (let tries = 0; tries < 10 && !p; tries++) {
      const a = Math.random() * TAU, d = 9 + Math.random() * 8, c = new V3(me.x + Math.cos(a) * d, 0, me.z + Math.sin(a) * d);
      if (Math.hypot(c.x, c.z) < 16 || ctx.blocked(c)) continue;
      if (o.zone && Math.hypot(c.x - o.zone.x, c.z - o.zone.z) > o.zone.r - 2) continue;
      p = c;
    }
    if (!p) return null;
    const lv = Math.max(1, o.lv || 1), rank = o.rank || "", st = mobStats(lv, rank);
    // the far grounds hit harder (their pow): more HP, attack and defence, and a little more XP for it
    const pow = (o.zone && o.zone.pow) || 1; if (pow !== 1 && !o.raid) { st.hp = Math.round(st.hp * pow); st.atk = Math.round(st.atk * pow); st.def = Math.round(st.def * (1 + (pow - 1) * 0.6)); st.xp = Math.round(st.xp * (1 + (pow - 1) * 0.5)); }
    if (o.def != null) st.def = o.def; // AC Defense: its Defense is the wave's own
    if (o.raid) { st.hp = o.max; st.atk = Math.round(st.atk * 0.85); } // the shared weekly raid keeps a little gentler bite
    if (o.ext) { st.hp = o.max; if (o.atkK) st.atk = Math.round(st.atk * o.atkK); } // a shared boss from another module: its HP is the server's
    if (o.hp) st.hp = Math.max(1, Math.round(o.hp)); // AC Defense: its HP is the wave's own
    const g = new THREE.Group(); g.position.copy(p);
    const grow = (rank === "elite" ? 1.3 : 1) * (1 + Math.min(0.4, lv * 0.012));
    const sc = (o.scale != null ? o.scale * (rank === "elite" ? 1.15 : 1) : skin ? (bs ? bs.skinH || skin.h * 1.8 : skin.h * grow) : bs ? bs.scale : spec.scale * grow) * (bs && o.tgt ? 1.18 : 1); // an AC Defense boss stands a size up
    const baseY = o.y != null ? o.y : skin ? skin.y * (bs ? 1.6 : 1) : bs ? bs.y : spec.y * (rank === "elite" ? 1.2 : 1);
    e.obj.scale.setScalar(sc); e.obj.position.y = baseY; g.add(e.obj);
    const tint = new THREE.Color(bs ? bs.tint : spec.color);
    if (!e.own) prepEnemy(e);
    e.obj.traverse((x) => { if (x.isMesh && x.material && x.material.emissive && !x.material.userData.glow) { x.material.emissive.copy(tint); x.material.emissiveIntensity = skin ? 0.05 : 0.18; } }); if (e.dis) e.dis.value = 0;
    // Halloween (world-halloween.js): about one plain scammer in five comes as a ghost, see-through with a pale glow
    const ghost = !!(ctx.halloween && !rank && !o.raid && !o.rare && Math.random() < 0.22);
    e.obj.traverse((x) => { if (!x.isMesh || !x.material || Array.isArray(x.material) || x.userData.outline) return; const mt = x.material; if (!mt.userData.g0) mt.userData.g0 = { t: mt.transparent, o: mt.opacity, e: mt.emissive ? mt.emissive.getHex() : 0, ei: mt.emissiveIntensity };
      const want = ghost ? [true, 0.6] : [mt.userData.g0.t, mt.userData.g0.o]; if (mt.transparent !== want[0]) { mt.transparent = want[0]; mt.needsUpdate = true; } mt.opacity = want[1]; mt.depthWrite = !ghost;
      if (mt.emissive && !mt.userData.glow) { if (ghost) { mt.emissive.set(0x9ec8ff); mt.emissiveIntensity = 0.45; } else { mt.emissive.setHex(mt.userData.g0.e); mt.emissiveIntensity = mt.userData.g0.ei; } } });
    (e.outlines || []).forEach((ol) => { ol.visible = !ghost; if (!ol.userData.m0) ol.userData.m0 = ol.material; ol.material = bs && o.tgt ? olMat(ol.userData.m0, bs.tint) : ol.userData.m0; });
    const dT = o.tgt ? (o.tint != null ? o.tint : dTint) : 0; if (e.own) setRim(e, o.tgt ? (bs ? bs.tint : dT) : RIM0);
    const ub = unitBox(e), bb = new THREE.Box3(new V3(0, ub.min.y * sc + baseY, 0), new V3(0, ub.max.y * sc + baseY, 0)); const bar = hpBar(bs ? 3.2 : rank === "elite" ? 2.1 : 1.7); bar.position.y = bb.max.y + (bs ? 0.9 : 0.5); g.add(bar); if (o.tgt) bar.visible = false; // a defence walker's bar shows once it's hurt
    const sh = new THREE.Mesh(geoOf("sh" + !!bs, () => new THREE.CircleGeometry(bs ? 2.6 : 0.7, 24)), shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.04; g.add(sh);
    if (rank) { const rr = new THREE.Mesh(geoOf("ring" + !!bs, () => new THREE.TorusGeometry(bs ? 3 : 1.1, 0.07, 8, 48)), rank === "boss" ? ringBoss : ringElite); rr.rotation.x = Math.PI / 2; rr.position.y = 0.08; g.add(rr); g.userData.ring = rr; }
    add(g); e.play("Run");
    if (VX && rank && !o.raid) VX.summon(p, rank === "boss");
    const m = { tgt: o.tgt || null, spd: o.spd || 1, g, e, spec, lv, rank, max: st.hp, hp: st.hp, atk: st.atk, def: st.def, xp: st.xp, slow: 0, stun: 0, burn: 0, burnD: 0, hitT: 0, bar, dead: 0, wander: Math.random() * TAU, zone: o.zone || null, bossName: bs ? bs.name : "", reach: o.reach || (bs ? 3.2 : 1.35 + (rank === "elite" ? 0.3 : 0)), y: baseY, glow: skin ? 0.05 : 0.18 };
    // a golden scammer: rare, runs from you, gone in 25 seconds; five times the XP and a better chest
    // an elite comes with an element: frost, blazing or toxic — its own colour, motes round it and a name to match
    if (rank === "elite" && !o.raid) { const A = AFFIX[Math.floor(Math.random() * AFFIX.length)]; m.affix = A; m.glow = 0.45; m.spec = { ...m.spec, color: A.color }; }
    if (o.rare && !rank) { m.rare = 25; m.xp *= 5; m.glow = 0.7; m.spec = { ...spec, color: "#ffc861", speed: spec.speed * 1.5 }; e.obj.traverse((x) => { if (x.isMesh && x.material && x.material.emissive && !x.material.userData.glow) { x.material.emissive.set(0xffc861); x.material.emissiveIntensity = 0.7; } }); }
    if (o.name) m.spec = { ...m.spec, name: o.name, ...(o.color ? { color: o.color } : {}) }; // (world-raidq.js: an Imp, a Puglin)
    if (o.ext) { m.ext = o.ext; m.extLabel = o.extLabel || ""; m.home = o.home || null; m.hp = Math.max(1, o.hp != null ? o.hp : o.max); if (o.pats) m.pats = o.pats; label(m); }
    if (o.raid) {
      m.raid = true; m.hp = Math.max(1, o.hp); bar.visible = false; // the raid's HP is the bar at the top and the gauge on the floor
      const crown = new THREE.Group(); crown.position.y = bb.max.y + 1.2; g.add(crown);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0xffc861, metalness: 0.85, roughness: 0.25, emissive: 0x6a4a10, emissiveIntensity: 0.5 })); c.position.set(Math.cos(a) * 2.6, Math.sin(a * 3) * 0.25, Math.sin(a) * 2.6); c.rotation.z = Math.PI / 2; c.rotation.y = -a; crown.add(c); }
      const aura = new THREE.Mesh(new THREE.SphereGeometry(Math.max(3, (bb.max.y - bb.min.y) * 0.7), 24, 16), additive(0x39ff88, 0.08)); aura.position.y = (bb.max.y + bb.min.y) / 2; g.add(aura);
      m.crown = crown; m.aura = aura;
    }
    m.em = []; e.obj.traverse((x) => { if (x.isMesh && x.material && x.material.emissive && !x.material.userData.glow) m.em.push(x.material); });
    if (o.tgt) { m.dT = dT; m.bT = bs ? bs.tint : 0; m.glow = bs ? 0.55 : dGlow; for (const mt of m.em) { mt.emissive.setHex(bs ? m.bT : dT); mt.emissiveIntensity = m.glow; } } // AC Defense: the wave's tint (tickMobs keeps it)
    m.sc = sc; m.ph = Math.random() * TAU; m.ghost = ghost;
    // ranks read at a glance: a small gold crown over an elite, a red one and a faint red haze round a boss
    if ((rank === "elite" || (rank === "boss" && !o.raid && !o.ext)) && !ctx.lite?.()) { // (a lent body keeps its own look: no crown, no haze)
      const boss = rank === "boss", cg = new THREE.Group(), s0 = boss ? 0.55 : 0.28, mat = boss ? crownBossMat : crownMat;
      const band = new THREE.Mesh(geoOf("crownBand", () => new THREE.CylinderGeometry(1, 1, 0.45, 10, 1, true)), mat); cg.add(band);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU, sp = new THREE.Mesh(geoOf("crownSpike", () => new THREE.ConeGeometry(0.28, 0.6, 4)), mat); sp.position.set(Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9); cg.add(sp); }
      cg.scale.setScalar(s0); m.crownY = bar.position.y + (boss ? 0.95 : 0.5); cg.position.y = m.crownY; g.add(cg); m.crownG = cg;
      if (boss) { const haze = new THREE.Mesh(geoOf("bossHaze", () => new THREE.SphereGeometry(1, 20, 14)), bossHazeMat); const hh = Math.max(2, (bb.max.y - bb.min.y) * 0.75); haze.scale.setScalar(hh); haze.position.y = (bb.max.y + bb.min.y) / 2; g.add(haze); }
    }
    if (bs) m.born = performance.now(); // for the week's fastest boss knock-outs
    label(m); mobs.push(m);
    if (m.slow === 0) { const shR = Math.round(Math.max(0.8, (bb.max.y - bb.min.y) * 0.6) * 10) / 10; const shell = new THREE.Mesh(geoOf("shell" + shR, () => new THREE.IcosahedronGeometry(shR, 0)), shellMat); shell.position.y = (bb.max.y + bb.min.y) / 2; shell.visible = false; g.add(shell); m.shell = shell; }
    puff(new V3(p.x, 0.6, p.z), rank === "boss" ? 0xff4d6d : 0xff7a9a, { n: rank === "boss" ? 40 : 14, speed: rank === "boss" ? 6 : 3, size: rank === "boss" ? 1.4 : 0.6, life: 0.8, grav: -1 });
    if (o.ext) { ctx.shake(0.5); Snd.siren && Snd.siren(); }
    else if (bs && o.raid) { bossBar(m); ctx.shake(0.5); Snd.siren && Snd.siren(); if (ctx.bossIntro) ctx.bossIntro(m.g.position, bs.name, o.zone.name, m.lv, bs.line); }
    else if (bs && o.tgt) { bossBar(m); ctx.shake(0.4); Snd.siren && Snd.siren(); if (bossCb) try { bossCb(m); } catch { /* the arena's intro is extra */ } }
    else if (bs) { bossBar(m); ctx.shake(0.5); Snd.siren && Snd.siren(); if (ctx.bossIntro) ctx.bossIntro(m.g.position, bs.name, o.zone.name, m.lv, bs.line); else ctx.toast(T("{x} appeared in {z}!", { x: bs.name, z: o.zone.name })); }
    return m;
  }
  function hit(m, raw, from, kind, crit) {
    if (m.dead) return;
    const dmg = Math.max(1, Math.round(hitDamage(raw, m.def) * (m.raid && m.shieldT > 0 ? 0.4 : 1)));
    if (m.trail == null || m.trailHold <= 0) m.trail = Math.max(0, m.hp / m.max); m.trailHold = 0.4; m.hp -= dmg; m.hitT = 0.18; if (m.tgt) m.lbl = 1; else label(m); if (m.rank === "boss") bossBar(m);
    tmp.copy(m.g.position).sub(from).setY(0); if (tmp.lengthSq() > 1e-4) tmp.normalize();
    if (kind !== "pet") { if (ctx.hitstop) ctx.hitstop(kind === "heavy" ? 85 : kind === "meteor" ? 70 : crit ? 70 : 38); if (ctx.kickCam) ctx.kickCam(tmp, kind === "heavy" ? 0.16 : crit ? 0.12 : 0.06); }
    if (ctx.parts) ctx.parts.sparks(tmp2.copy(m.g.position).setY(m.y + 0.6), kind === "ice" ? 0x8fe6ff : kind === "fire" || kind === "meteor" ? 0xff7a2a : kind === "shock" ? 0xb48cff : 0xffd27a, crit ? 18 : 9, tmp);
    m.leanT = kind === "heavy" ? 0.42 : 0.3; m.leanL = m.leanT; m.leanX = tmp.x; m.leanZ = tmp.z; // it rocks back away from the blow
    const kb = (m.rank === "boss" ? 0.15 : m.rank === "elite" ? 0.5 : 1) * (kind === "fire" || kind === "meteor" ? 1.4 : kind === "shock" ? 0.3 : kind === "heavy" ? 2.0 : 0.9);
    if (!m.raid && !m.tgt && !m.ext) tryStep(m, tmp, kb); // (a defence scammer holds its line)
    if (kind === "ice") { const deep = brOf("ice") === "a"; m.slow = deep ? 5 : 3; if (deep) { m.stun = Math.max(m.stun, m.rank === "boss" ? 0.2 : 0.6); m.statue = true; } }
    if (kind === "shock") m.stun = (m.rank === "boss" ? 0.4 : 1.2) * (brOf("shock") === "b" ? 2 : 1);
    if (kind === "shock" && VX) VX.impact(m.g.position.clone().setY(m.y + 0.6), "shock");
    if (kind === "fire" || kind === "meteor") { const inf = kind === "fire" && brOf("fire") === "b"; m.burn = inf ? 5 : 3; m.burnD = Math.max(1, Math.round(raw * (inf ? 0.24 : 0.12))); }
    m.e.play("Hit", { once: true, fade: 0.05 });
    ctx.float((crit ? "!" : "") + dmg, tmp2.copy(m.g.position).setY(m.bar.position.y + 0.4), crit ? "#ffe066" : kind === "ice" ? "#8fe6ff" : kind === "fire" || kind === "meteor" ? "#ffb070" : kind === "shock" ? "#d8c4ff" : "#ffffff", crit, dmg / m.max);
    if (crit || kind === "heavy") stopT = Math.max(stopT, crit ? 0.07 : 0.05);
    else if (kind === "melee") stopT = Math.max(stopT, 0.03); // even a plain cut bites for a moment
    m.punch = 1; // the body squashes and springs back (tickMobs)
    if (kind === "melee" || kind === "heavy" || kind === "shot") Snd.impact && Snd.impact(wKind());
    Snd.hitFx && Snd.hitFx(kind, crit); if (crit && kind !== "pet") ctx.buzz && ctx.buzz(15); // the element's sound, a crit's ding (world-sfx.js)
    if (m.rank === "boss" && !m.raid && !m.rage && m.hp > 0 && m.hp < m.max * 0.5) enrage(m);
    if ((kind === "melee" || kind === "heavy") && !ctx.reduce) { // a bright slash mark across the body, at the angle of the swing
      const big = kind === "heavy" ? 1.5 : 1, ang = combo === 2 ? 0.6 : combo === 3 ? -0.2 : -0.7;
      for (const [w, c, o] of [[2.6, 0xffffff, 0.95], [3.4, crit ? 0xffd27a : 0x8fe6ff, 0.55]]) { const sl = sprite(c, o); sl.material.rotation = ang; sl.scale.set(w * big, 0.16 * big * (c === 0xffffff ? 1 : 2.2), 1); sl.position.copy(m.g.position).setY(m.y + 0.7); add(sl); fx.push({ o: sl, life: 0.16, t: 0, op0: o }); }
    }
    // the blow's star (world-vfx.js) where it landed, in the element's colour (a skill's, or the weapon's: cyan
    // swords, a gold hammer, a pink blaster, a green bow, a violet staff); a crit or a heavy blow pops bigger, gold, and
    // sends a ring across the ground
    if (VX && VX.star) { const big = crit || kind === "heavy";
      VX.star(fxV.copy(m.g.position).addScaledVector(tmp, -0.35).setY(m.y + 0.65), crit ? 0xffb347 : HIT_TINT[kind] ?? WPN_TINT[wKind()] ?? 0xffffff, { big, size: m.rank === "boss" ? 1.5 : kind === "pet" ? 0.6 : 1, rot: kind === "melee" || kind === "heavy" ? -(combo === 2 ? 0.6 : combo === 3 ? -0.2 : -0.7) : undefined });
      if (big) VX.quake(fxV.copy(m.g.position).setY(0), crit ? 0xffc861 : 0xffe8b0, m.rank === "boss" ? 4.5 : 2.6); }
    if (crit && ctx.slowmo) ctx.slowmo(160);
    if (crit && kind !== "pet" && ctx.critFlash) ctx.critFlash();
    // a heavy blow drives it back: dust kicks up behind its feet, along the push
    if (kind === "heavy" && !ctx.reduce && m.rank !== "boss") puff(tmp2.copy(m.g.position).addScaledVector(tmp, 0.6).setY(0.2), 0xd8c8a8, { n: 8, speed: 2.2, size: 0.45, life: 0.45, grav: 1.5 });
    if (kind === "heavy" && ctx.punch) ctx.punch();
    // the raid boss's HP is everyone's: the hit is reported (world-raid.js) and it only falls when the server says so
    if (m.raid && raidMod === "rally" && Math.random() < 0.15) { const h = Math.max(1, Math.round(maxHp() * 0.012)); if (!down && hp < maxHp()) { hp = Math.min(maxHp(), hp + h); paintVit(); ctx.here(me); ctx.float("+" + h, me.clone().setY(2.5), "#9fffd0"); } } // Rally week: hits on the boss mend you a little
    if (m.raid) { ctx.raidHit && ctx.raidHit(dmg); if (m.hp < 1) { m.hp = 1; label(m); bossBar(m); } return; }
    if (m.ext) { try { m.ext.hit(m, dmg, crit); } catch { /* the fight goes on */ } if (m.hp < 1) { m.hp = 1; label(m); bossBar(m); } return; } // it falls when its server says so
    if (m.hp <= 0) kill(m);
  }
  const stepV = new V3(); // its own: callers pass tmp / tmp2 as the direction
  const fxV = new V3(); // where a pooled effect plays (copied by world-vfx.js, so one scratch does)
  const HIT_TINT = { ice: 0x8fe6ff, fire: 0xff8a3c, meteor: 0xff7a2a, shock: 0xc8a8ff, pet: 0x9fffd0, heavy: 0xffc861 }, WPN_TINT = [0x5fd8ff, 0xffb347, 0xff6ad5, 0x7dff8a, 0xb48cff];
  function tryStep(m, dir, dist) {
    stepV.copy(m.g.position).addScaledVector(dir, dist);
    if (ctx.blocked(stepV)) { m.wander += Math.PI * 0.6; return false; }
    m.g.position.copy(stepV); return true;
  }
  function kill(m) {
    m.dead = 0.001; Snd.kill ? Snd.kill(m.rank) : Snd.coin && Snd.coin();
    if (rpg.wear) rpg.wear("kill"); // Epic and Legendary weapons wear out: 1 a knock-out (world-rpg.js)
    const p = m.g.position.clone().setY(m.y + 0.4);
    if (m.tgt) { // AC Defense: a wave drops many at once, so a lighter knock-out: its cubes and a little scrap pop (no shards, no shake but a boss's)
      const boss = m.rank === "boss", q = lowQ() ? 0.25 : ctx.coarse ? 0.5 : 1, c = boss ? m.bT || 0xff4d6d : m.dT || 0xff7a9a;
      if (VX) VX.shatter(p, c, { big: boss ? 2 : 1, coins: boss ? 8 : q < 1 ? 1 : 2 });
      if (ctx.parts) ctx.parts.emit({ at: p, kind: "glow", n: Math.max(2, Math.round((boss ? 30 : 10) * q)), speed: 3, up: 3.6, spread: 0.5, size: 0.24, life: 0.75, grav: 8, drag: 0.5, color: 0xffe08a, color2: 0xffc861, jitter: 0.3 }); // scrap: gold bits hop up and drop
      if (boss) { if (!ctx.reduce) flash(p, 0xffffff, 8, 0.25); ctx.shake(0.6); if (VX && VX.burst) VX.burst(fxV.copy(p).setY(0), c, 2.2); if (ctx.slowmo && !ctx.reduce) ctx.slowmo(700); hideBossBar(); }
      if (m.tgt.dead) m.tgt.dead(m); return; // no XP, drops or ARCL claims; the arena pays in scrap
    }
    if (VX) VX.shatter(p, new THREE.Color(m.rank === "boss" ? 0xff4d6d : m.spec.color).getHex(), { big: m.rank === "boss" ? 2 : m.rank === "elite" ? 1.4 : 1, coins: m.rank === "boss" ? 8 : 3, where: (v) => ctx.here(v) });
    shards(p, new THREE.Color(m.rank === "boss" ? 0xff4d6d : m.spec.color).getHex(), m.rank === "boss" ? 40 : 16, m.rank === "boss" ? 10 : 7); flash(p, 0xffffff, m.rank === "boss" ? 8 : 2.6, 0.25); puff(p, 0xffc861, { n: m.rank === "boss" ? 40 : 12, speed: 5, size: 0.3, life: 0.8, grav: 6 });
    ctx.shake(m.rank === "boss" ? 0.6 : 0.18);
    // the knock-out's column of light and its ring (world-vfx.js), motes of light floating up out of it
    if (VX && VX.burst) VX.burst(fxV.copy(p).setY(0), m.rank === "boss" ? 0xff4d6d : m.rank === "elite" || m.rare ? 0xffc861 : 0xffe08a, m.rank === "boss" ? 2.2 : m.rank === "elite" ? 1.4 : 1);
    if (ctx.parts) ctx.parts.emit({ at: p, kind: "glow", n: m.rank === "boss" ? 36 : 14, speed: 2.4, up: 2.4, spread: 0.8, size: 0.32, life: 1.1, grav: -3.5, drag: 1.4, color: 0xfff2c8, color2: 0xffc861, jitter: 0.6 });
    if (m.rank === "boss" && ctx.slowmo) { ctx.slowmo(700); ctx.punch && ctx.punch(); } // the boss goes down in slow motion
    if (m.tgt) { if (m.rank === "boss") hideBossBar(); if (m.tgt.dead) m.tgt.dead(m); return; } // AC Defense: no XP, drops or ARCL claims; the arena pays in scrap
    if (m.ext) { hideBossBar(); try { if (m.ext.down) m.ext.down(m); } catch { /* gone anyway */ } return; } // no XP, drops or claims here: its own reward
    if (m.raid) { ctx.toast(T("The raid boss fell: {x}", { x: m.bossName })); ctx.onRaidDown && ctx.onRaidDown(m.g.position.clone()); hideBossBar(); return; } // its XP comes with the claim
    ctx.gain(Math.round(m.xp * (ctx.xpBoost ? ctx.xpBoost(m.zone && m.zone.id) : 1)), T("Knocked out a {x}", { x: m.rank === "boss" ? m.bossName : T(m.spec.name) }));
    const zi = m.zone ? ZONES.indexOf(m.zone) : -1, tier = m.lv >= 15 ? 4 : m.lv >= 10 ? 3 : m.lv >= 5 ? 2 : 1;
    if (m.rank === "boss") { ctx.claim("boss", { zone: zi }, ctx.screenOf(p)); setBoss(m.zone.id, Date.now() + bossEvery()); hideBossBar(); ctx.onBoss && ctx.onBoss(m.zone); if (m.born && ctx.onBossRun) ctx.onBossRun(m.zone.id, Math.round(performance.now() - m.born)); }
    else if (m.zone && m.zone.claimTier) ctx.claim("hunt", { tier: m.zone.claimTier }, ctx.screenOf(p)); // (RAID QUEENS' grounds: a hunt of the top tier)
    else if (zi >= 0 && tier >= 2) ctx.claim("hunt", { tier }, ctx.screenOf(p));
    else ctx.claim("street", {}, ctx.screenOf(p));
    ctx.onKill && ctx.onKill({ type: m.spec.id, lv: m.lv, rank: m.rank, zone: m.zone && m.zone.id });
    // the drop: a chest with a beam in its rarity's colour
    const d = rpg.rollDrop(m.lv, m.rank); if (d) dropChest(m.g.position.clone(), d);
    if (m.rare) { const d3 = rpg.rollDrop(m.lv, "elite"); if (d3) dropChest(m.g.position.clone().add(new V3(-1.4, 0, 0.6)), d3); ctx.float(T("Golden!"), p.clone().setY(3), "#ffd27a", true); }
    if (Math.random() < 0.18) { const x = m.g.position.clone(); x.y = 1; const it = ITEMS[Math.random() < 0.5 ? 5 : 4]; const g = itemMesh(it); g.position.copy(x).add(new V3(-1, 0, 0.5)); add(g); items.push({ g, it, k: 0 }); }
  }
  const beamGeo = new THREE.CylinderGeometry(0.28, 0.5, 7, 20, 1, true);
  const beamMat = (c) => new THREE.ShaderMaterial({ uniforms: { uC: { value: c.clone() }, uO: { value: 0.5 }, uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: "varying vec2 vUv; varying float vE; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vE = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 uC; uniform float uO, uT; varying vec2 vUv; varying float vE; void main(){ float up = pow(1.0 - vUv.y, 1.7); float core = pow(vE, 2.5); float rip = 0.85 + 0.15 * sin(vUv.y * 18.0 - uT * 5.0); gl_FragColor = vec4(uC * (0.6 + core * 0.8), up * (0.25 + core * 0.75) * rip * uO); }" });
  const chestWood = new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.7 });
  function dropChest(at, item) {
    const c = new THREE.Color(RARITY[item.r].color), g = new THREE.Group(); g.position.copy(at).setY(0);
    // the box's shape and wood are shared by every chest; the lid's colour and the beam are its own, freed when it goes
    const box = new THREE.Mesh(geoOf("chestBox", () => new THREE.BoxGeometry(0.8, 0.55, 0.55)), chestWood); box.position.y = 0.3;
    const lid = new THREE.Mesh(geoOf("chestLid", () => new THREE.BoxGeometry(0.84, 0.18, 0.59)), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 })); lid.position.y = 0.65;
    const beam = new THREE.Mesh(beamGeo, beamMat(c)); beam.position.y = 3.5; /* a soft column of the rarity's colour, fading upward (a solid cylinder read as a slab) */
    g.add(box, lid, beam); add(g);
    puff(at.clone().setY(1), c.getHex(), { n: 16, speed: 4, size: 0.4, life: 0.8, grav: -1 });
    if (item.r >= 4) { ctx.shake(0.3); ctx.legend && ctx.legend(); }
    Snd.drop && Snd.drop(item.r);
    drops.push({ g, item, t: 0, beam, lid });
  }
  function tickDrops(dt, t) {
    ctx.here(me); const reach = Math.max(1.5, ctx.petPull ? ctx.petPull() : 0); // a collector pet picks chests up from farther
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.t += dt; const bu = d.beam.material.uniforms; bu.uO.value = (d.item.r >= 3 ? 0.75 : d.item.r >= 2 ? 0.55 : 0.32) + Math.sin(t * 4) * 0.08; bu.uT.value = t; d.lid.rotation.y = Math.sin(t * 2) * 0.1;
      const dist = Math.hypot(d.g.position.x - me.x, d.g.position.z - me.z);
      if (dist < reach || d.t > 120 || dist > 60) {
        root.remove(d.g); drops.splice(i, 1); d.lid.material.dispose(); d.beam.material.dispose();
        if (dist < reach) { const ok = rpg.addItem(d.item); Snd.chest && Snd.chest(d.item.r); ring(d.g.position, new THREE.Color(RARITY[d.item.r].color).getHex(), { r0: 0.3, r1: 2.4, life: 0.4 }); if (ok) ctx.float(rpg.itemName(d.item), d.g.position.clone().setY(2.4), RARITY[d.item.r].color, d.item.r >= 3); ctx.onLoot && ctx.onLoot(d.item); }
      }
    }
  }
  function tickMobs(dt, t) {
    ctx.here(me); tickLock(dt); lblBudget = lowQ() ? 2 : 4;
    const st = stats();
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      // far away (30 m+): the animation steps every third frame and the HP bar is hidden
      const far = m.rank !== "boss" && !m.dead && Math.hypot(me.x - m.g.position.x, me.z - m.g.position.z) > 30;
      if (far) { m.acc = (m.acc || 0) + dt; const ev = Math.hypot(me.x - m.g.position.x, me.z - m.g.position.z) > 40 ? 6 : 3; if ((m.fc = (m.fc || 0) + 1) % ev === 0) { m.e.mixer.update(Math.min(m.acc, 0.5)); m.acc = 0; } } /* b441: past 40 m every 6th frame */ else { m.e.mixer.update(dt + (m.acc || 0)); m.acc = 0; }
      if (!m.raid) m.bar.visible = !far && !(m.tgt && m.hp >= m.max);
      if (m.dead) { m.dead += dt; if (m.e && m.e.dis && !ctx.reduce) { m.e.dis.value = Math.min(1, m.dead / 0.45); if (m.e.outlines) m.e.outlines.forEach((o) => { o.visible = false; }); m.g.position.y += dt * 0.8; if (m.dead > 0.5) { m.e.dis.value = 0; retire(m, i); } } else { m.g.scale.setScalar(Math.max(0.01, 1 - m.dead * 4)); m.g.position.y += dt * 2; if (m.dead > 0.3) retire(m, i); } continue; } // breaks up into data cubes
      tmp.copy(me).sub(m.g.position).setY(0); const d = tmp.length();
      if (!m.tgt && !m.ext && d > (m.raid ? 40 : m.rank === "boss" ? 90 : 48)) { retire(m, i); if (m.rank === "boss") hideBossBar(); continue; }
      m.slow = Math.max(0, m.slow - dt); m.stun = Math.max(0, m.stun - dt); m.hitT = Math.max(0, m.hitT - dt);
      if (m.tgt) { m.lblT = (m.lblT || 0) - dt; if (m.lbl && m.lblT <= 0) { const lo = lowQ(); m.lbl = 0; m.lblT = lo ? 0.25 : 0.1; if (lo) m.trail = Math.max(0, m.hp / m.max); label(m); } } // a defence walker's bar redraws at most 10 (low: 4) times a second
      if (!(m.tgt && lowQ())) tickTrail(m, dt);
      if (m.burn > 0) { m.burn -= dt; m.burnT = (m.burnT || 0) - dt; if (m.burnT <= 0) { m.burnT = 0.5; m.hp -= m.burnD; label(m); puff(m.g.position.clone().setY(m.y + 0.3), 0xff7a2a, { n: 3, speed: 1, size: 0.5, life: 0.4, grav: -3 }); if (m.raid) { ctx.raidHit && ctx.raidHit(m.burnD); m.hp = Math.max(1, m.hp); } if (m.rank === "boss") bossBar(m); if (m.hp <= 0) { kill(m); continue; } } }
      if (m.shell) { m.shell.visible = m.slow > 0; m.shell.material = m.statue && m.stun > 0 ? shellStatueMat : shellMat; }
      if (m.statue && m.stun <= 0) { m.statue = false; shards(m.g.position.clone().setY(m.y + 0.5), 0xcff6ff, 16, 6); Snd.pop && Snd.pop(); } // the ice statue shatters
      const body = m.e.obj;
      body.position.x = m.hitT > 0 ? Math.sin(t * 90) * 0.06 : 0;
      // a breath: a slight squash and stretch, each one out of step with the rest (a hit squashes it harder)
      if (m.sc && !ctx.reduce) { const b = Math.sin(t * (m.rank === "boss" ? 1.6 : 3.2) + (m.ph || 0)) * (m.rank === "boss" ? 0.02 : 0.035) - (m.hitT > 0 ? 0.08 : 0); body.scale.set(m.sc * (1 - b * 0.5), m.sc * (1 + b), m.sc * (1 - b * 0.5)); }
      if (m.ghost) body.position.y = (m.y || 0) + 0.35 + Math.sin(t * 2.2 + (m.ph || 0)) * 0.18; // a ghost floats
      if (m.crownG) { m.crownG.rotation.y += dt * 1.2; m.crownG.position.y = m.crownY + Math.sin(t * 2.4 + (m.ph || 0)) * 0.06; }
      if (m.leanT > 0) { m.leanT = Math.max(0, m.leanT - dt); const e = Math.sin((m.leanT / m.leanL) * Math.PI) * (m.rank === "boss" ? 0.1 : m.rank === "elite" ? 0.22 : 0.36) * (ctx.reduce ? 0.4 : 1), ry = m.g.rotation.y, c = Math.cos(ry), s = Math.sin(ry); body.rotation.x = (m.leanX * s + m.leanZ * c) * e; body.rotation.z = -(m.leanX * c - m.leanZ * s) * e; } else if (body.rotation.x || body.rotation.z) { body.rotation.x = 0; body.rotation.z = 0; }
      if (m.punch > 0) { if (!m.bs) m.bs = body.scale.clone(); m.punch = Math.max(0, m.punch - dt * 7); const q = ctx.reduce ? 0 : Math.sin(m.punch * Math.PI) * 0.16; body.scale.set(m.bs.x * (1 + q), m.bs.y * (1 - q), m.bs.z * (1 + q)); }
      if (m.affix && !far && !ctx.reduce && ctx.parts && (m.afT = (m.afT || 0) - dt) <= 0) { // its element's motes
        m.afT = 0.28; const a = m.affix.id; tmpA.copy(m.g.position).setY((m.y || 0.6) + 0.5);
        ctx.parts.emit(a === "venom" ? { at: tmpA, kind: "smoke", n: 1, speed: 0.6, up: 1, size: 0.5, life: 1.1, grav: -0.6, color: m.affix.p, jitter: 0.6 } : { at: tmpA, kind: "glow", n: 2, speed: 0.8, up: a === "blaze" ? 1.4 : 0.3, size: 0.22, life: 0.9, grav: a === "blaze" ? -2.5 : 0.8, color: m.affix.p, jitter: 0.7 });
      }
      if (!far || m.hitT > 0 || m.burn > 0) for (const mt of m.em || []) { mt.emissiveIntensity = m.hitT > 0.1 ? (m.tgt && ctx.reduce ? 1.1 : 2.2) : m.hitT > 0 ? 1.2 : m.burn > 0 ? 0.7 + Math.sin(t * 20) * 0.2 : m.slow > 0 ? 0.5 : m.stun > 0 ? 0.9 + Math.sin(t * 40) * 0.5 : m.rage ? 0.5 + Math.sin(t * 6) * 0.25 : m.glow; mt.emissive.set(m.hitT > 0.1 ? 0xffffff : m.burn > 0 ? 0xff6a1a : m.slow > 0 ? 0x5fd8ff : m.stun > 0 ? 0xb48cff : m.rank === "boss" ? (m.rage ? 0xff2d4d : m.zone ? m.zone.boss.tint : m.bT || 0xff4d6d) : m.dT || m.spec.color); } // the materials that light up, listed once at spawn
      if (m.g.userData.ring) m.g.userData.ring.rotation.z += dt * 2;
      if (m.stun > 0) { if (m.cast) endCast(m); m.wu = 0; continue; }
      if (m.tgt) { tgtAI(m, dt, t, i); continue; } // AC Defense: it walks to its target and ignores you
      // it notices you: a "!" pops over its head (the pooled floating text), once until you've got well away again
      if (!m.seen && d < 15 && m.rank !== "boss" && !far) { m.seen = true; if (alertT <= 0) { alertT = 0.2; ctx.float("!", tmpA.copy(m.g.position).setY((m.y || 0) + 2.3), "#ffd23a", true); } }
      else if (m.seen && d > 20) m.seen = false;
      if (m.home && !m.cast && !m.dash) { const hx = m.home.x - m.g.position.x, hz = m.home.z - m.g.position.z, hd = Math.hypot(hx, hz); // its ground: past it, it walks back home and lets you go
        if (Math.hypot(me.x - m.home.x, me.z - m.home.z) > m.home.r + 4 || hd > m.home.r) { if (hd > 1) { tmp.set(hx / hd, 0, hz / hd); tryStep(m, tmp, m.spec.speed * dt); m.g.rotation.y = Math.atan2(tmp.x, tmp.z); } m.wu = 0; continue; } }
      if (m.rank === "boss" && !m.raid && bossAI(m, dt, t, d)) { m.wu = 0; continue; } // a boss winding up a move stands its ground
      if (behave(m, dt, t, d, i)) { m.wu = 0; continue; } // a ranged, charging or fleeing scammer doing its own thing
      const sp = m.spec.speed * (m.rank === "boss" ? 0.8 : 1) * (m.slow > 0 ? 0.35 : 1) * (m.rage ? 1.3 : 1);
      if (d < 15 && d > m.reach * 0.9) { tmp.divideScalar(d); if (!tryStep(m, tmp, sp * dt)) { tmp2.set(-tmp.z, 0, tmp.x); tryStep(m, tmp2, sp * dt); } m.g.rotation.y = Math.atan2(tmp.x, tmp.z); }
      else if (d >= 15) { m.wander += (Math.random() - 0.5) * dt; tmp.set(Math.cos(m.wander), 0, Math.sin(m.wander)); tryStep(m, tmp, sp * 0.4 * dt); m.g.rotation.y = Math.atan2(tmp.x, tmp.z); }
      const r = Math.hypot(m.g.position.x, m.g.position.z); if (r < 14) m.g.position.multiplyScalar(14 / r);
      if (m.zone && Math.hypot(m.g.position.x - m.zone.x, m.g.position.z - m.zone.z) > m.zone.r) { tmp.set(m.zone.x - m.g.position.x, 0, m.zone.z - m.g.position.z).normalize(); m.g.position.addScaledVector(tmp, sp * dt * 2); }
      m.g.position.y = m.rank === "boss" ? Math.abs(Math.sin(t * 2)) * 0.3 : Math.abs(Math.sin(t * 6 + i)) * 0.12;
      // their hit: a short wind-up first (it rocks back, a red ring opens to its reach) so there's time to dodge or
      // step out; the cycle is the old one plus the wind-up. The boss also slams the ground now and then
      if (d <= m.reach && hurtT <= 0 && !down && !m.wu) {
        const w = m.rank === "boss" ? 0.3 : m.rank === "elite" ? 0.28 : 0.34; m.wu = w;
        hurtT = (m.rank === "boss" ? (m.rage ? 1.05 : 1.35) : m.rank === "elite" ? 1.15 : 1.3) + w; m.e.play("Attack", { once: true, fade: 0.05 });
        tmp2.copy(m.g.position).sub(me).setY(0).normalize(); m.leanT = m.leanL = w; m.leanX = tmp2.x; m.leanZ = tmp2.z;
        ring(m.g.position, 0xff2d4d, { r0: 0.4, r1: m.reach + 0.3, life: w, y: 0.07 });
        if (!wuHint && ctx.hint) { wuHint = true; ctx.hint("dodge"); }
      }
      if (m.wu > 0 && (m.wu -= dt) <= 0) {
        m.wu = 0;
        if (down || d > m.reach * 1.25) { /* stepped out in time: a miss */ }
        else if (buffs.shield > 0 || guardT > 0) { flash(me.clone().setY(1.2), 0x4fa8ff, 3.2, 0.3); Snd.pop && Snd.pop(); if (guardT > 0) ctx.float(T("Dodged"), me.clone().setY(2.6), "#9fe6ff"); }
        else { tmp.copy(me).sub(m.g.position).setY(0).normalize(); ctx.knock(tmp, m.rank === "boss" ? 11 : 7); ctx.hurt(); damage(hitDamage(m.atk, st.def)); }
      }
      if (m.raid) { raidTick(m, dt, t, d); m.crown.rotation.y += dt * 0.8; m.crown.children.forEach((c, k) => { c.rotation.x += dt * 3; }); m.aura.material.opacity = 0.06 + Math.sin(t * 2) * 0.03 + (raidPhase >= 4 ? 0.05 : 0); }
      if (m.rank === "boss" && m.raid) {
        m.slam = (m.slam || 6) - dt;
        // a red circle grows on the ground a second before the slam: step out of it
        if (m.slam <= 1.1 && !m.warned && d < 14) { m.warned = true; const disc = new THREE.Mesh(sgeo(`Circle|${[7, 48]}`, () => new THREE.CircleGeometry(7, 48)), additive(warnCol(), warnOp())); disc.rotation.x = -Math.PI / 2; disc.position.copy(m.g.position).setY(0.07); add(disc); fx.push({ o: disc, life: 1.1, t: 0, onTick: (k) => { disc.material.opacity = 0.12 + 0.28 * k + (ctx.reduce ? 0 : Math.sin(k * 30) * 0.06); disc.scale.setScalar(0.3 + 0.7 * Math.min(1, k * 1.6)); } }); }
        if (m.warned && m.slam > 0 && !ctx.reduce) { const k = Math.min(1, 1 - m.slam / 1.1), q = Math.sin(k * Math.PI * 0.5); m.g.scale.set(1 + q * 0.1, 1 - q * 0.2, 1 + q * 0.1); } else if (m.g.scale.y !== 1) m.g.scale.lerp(ONE, 0.35);
        if (m.slam <= 0 && d < 12) { m.slam = m.raid && raidMod === "slam" ? 4 + Math.random() * 1.5 : 7 + Math.random() * 3; m.warned = false; slam(m); }
        else if (m.slam <= 0) { m.slam = 2; m.warned = false; }
      }
    }
    hurtT = Math.max(0, hurtT - dt); alertT -= dt;
  }
  // AC Defense (world-defense.js): a scammer that walks to a target point (the Core) instead of the player, stops to hit
  // whatever stands in its way (tgt.wall: a Barrier), and hits the target when it arrives. tgt: { x, z, r, hit(m, goal), wall(pos), dead(m) }
  function tgtAI(m, dt, t, i) {
    const T0 = m.tgt, p = m.g.position, w = T0.wall && T0.wall(p), goal = w || T0, dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz) || 1;
    const reach = goal.r + (m.rank === "boss" ? 1.4 : 0.35); m.g.rotation.y = Math.atan2(dx, dz);
    if (d > reach) {
      const sp = m.spec.speed * m.spd * (m.rank === "boss" ? 0.8 : 1) * (m.slow > 0 ? 0.35 : 1), k = sp * dt / d; stepV.set(dx * k, 0, dz * k);
      tmp2.copy(p).add(stepV); if (!ctx.blocked(tmp2)) p.copy(tmp2); else { tmp2.copy(p).add(stepV.set(-dz * k, 0, dx * k)); if (!ctx.blocked(tmp2)) p.copy(tmp2); } // round the fountain's stone
      p.y = m.rank === "boss" ? Math.abs(Math.sin(t * 2)) * 0.3 : Math.abs(Math.sin(t * 6 + i)) * 0.12; m.wu = 0; return;
    }
    if ((m.atkT = (m.atkT || 0) - dt) <= 0) { m.atkT = m.rank === "boss" ? 1.3 : 1.0; m.e.play("Attack", { once: true, fade: 0.05 }); ring(p, 0xff2d4d, { r0: 0.3, r1: 1.2, life: 0.25, y: 0.07 }); goal.hit(m, goal); }
  }
  // the raid's phases (world-social.js): 2 calls a swarm now and then, 3 adds a shield that soaks most of a hit,
  // 4 drops red circles around you — step out before they burst
  let raidPhase = 1, raidMod = ""; // raidMod: this week's twist (world-social.js RAID_MODS)
  function raidTick(m, dt, t, d) {
    const now = performance.now(); // wall-clock: a slow frame rate mustn't stretch the phases
    const sw = raidMod === "swarm";
    if (raidPhase >= 2 && now >= (m.swarmAt ??= now + 4000)) {
      m.swarmAt = now + (sw ? 10000 : 14000);
      if (mobs.filter((x) => !x.dead && x.zone === m.zone && !x.raid).length < (sw ? 6 : 4)) for (let i = 0; i < (sw ? 3 : 2); i++) { const a = Math.random() * TAU; spawnMob({ type: "rug", lv: Math.max(1, m.lv - 3), zone: m.zone, at: m.g.position.clone().add(new V3(Math.cos(a) * 4, 0, Math.sin(a) * 4)) }); }
      ring(m.g.position, 0xb48cff, { r0: 1, r1: 6, life: 0.6, y: 0.1 });
    }
    if (raidPhase >= (raidMod === "shield" ? 2 : 3)) {
      m.shieldT = Math.max(0, ((m.shieldUntil || 0) - now) / 1000);
      if (now >= (m.shieldAt ??= now + 3000)) { m.shieldAt = now + (raidMod === "shield" ? 8000 : 11000); m.shieldUntil = now + 3500; m.shieldT = 3.5; if (!m.bubble) { const bb = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0x9fffd0, transparent: true, opacity: 0.22, depthWrite: false })); bb.position.y = 2.2; m.g.add(bb); m.bubble = bb; } ctx.float(T("Shield up"), m.g.position.clone().setY(5), "#9fffd0"); }
      if (m.bubble) { m.bubble.visible = m.shieldT > 0; m.bubble.material.opacity = 0.16 + Math.sin(t * 6) * 0.06; }
    }
    if (raidPhase >= 4 && d < 22 && now >= (m.dropAt ??= now + 2000)) {
      m.dropAt = now + (raidMod === "rain" ? 1300 : 2400);
      ctx.here(me); const at = me.clone().add(new V3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)).setY(0.08);
      const disc = new THREE.Mesh(sgeo(`Circle|${[2.2, 32]}`, () => new THREE.CircleGeometry(2.2, 32)), additive(warnCol(), warnOp())); disc.rotation.x = -Math.PI / 2; disc.position.copy(at); add(disc);
      fx.push({ o: disc, life: 1.1, t: 0, onTick: (k) => { disc.material.opacity = 0.15 + 0.35 * k; disc.scale.setScalar(0.4 + 0.6 * Math.min(1, k * 1.5)); } });
      setTimeout(() => { puff(at.clone().setY(0.4), 0xff6a4a, { n: 18, speed: 6, size: 0.5, life: 0.5, grav: 2 }); ring(at, 0xff4d6d, { r0: 0.3, r1: 2.6, life: 0.35, y: 0.1 }); ctx.here(me); if (!down && guardT <= 0 && Math.hypot(me.x - at.x, me.z - at.z) < 2.2 && ctx.hopY() < 0.8) { ctx.hurt(); damage(hitDamage(Math.round(m.atk * 0.8), stats().def)); } }, 1100);
    }
  }
  function slam(m) {
    const p = m.g.position.clone(); ring(p, 0xff4d6d, { r0: 0.5, r1: 7, life: 0.7, y: 0.1 }); puff(p.clone().setY(0.5), 0xff8a6a, { n: 30, speed: 7, size: 0.6, life: 0.7, grav: 3 }); ctx.shake(0.45); if (ctx.wave) ctx.wave(p, 1.1); if (ctx.parts) ctx.parts.smoke(p.clone().setY(0.4), 0x9a8a7a, 14, 1.8); scorch(p, 4.2);
    ctx.here(me); if (me.distanceTo(tmp.copy(p).setY(me.y)) < 7 && guardT <= 0 && !down && ctx.hopY() < 0.8) { tmp.copy(me).sub(p).setY(0).normalize(); ctx.knock(tmp, 13); ctx.hurt(); damage(hitDamage(Math.round(m.atk * 1.4), stats().def)); }
  }

  // ---------------- bosses: a move list per ground, a red warning before each move, a second phase at half HP ----------------
  // slam: a circle round the boss · cone: a fan in front of it · line: a charge straight at you · rain: circles under your feet
  const PATTERNS = ["slam", "cone", "line", "rain"];
  const patsOf = (m) => { const zi = m.zone ? ZONES.indexOf(m.zone) : 0; return PATTERNS.slice(0, zi >= 5 ? 4 : zi >= 3 ? 3 : zi >= 1 ? 2 : 1); };
  const WIND = { slam: 1.1, cone: 0.95, line: 0.85, rain: 1.15 };
  function warnDisc(at, r, life) { const disc = new THREE.Mesh(sgeo(`Circle|${[r, 40]}`, () => new THREE.CircleGeometry(r, 40)), additive(warnCol(), warnOp())); disc.rotation.x = -Math.PI / 2; disc.position.copy(at).setY(0.08); add(disc); fx.push({ o: disc, life, t: 0, onTick: (k) => { disc.material.opacity = 0.12 + 0.3 * k + (ctx.reduce ? 0 : Math.sin(k * 30) * 0.05); disc.scale.setScalar(0.3 + 0.7 * Math.min(1, k * 1.6)); } }); return disc; }
  function bossAI(m, dt, t, d) {
    if (m.cast) { // winding up: stand still, then strike
      const c = m.cast; c.t += dt;
      if (!ctx.reduce && c.kind === "slam") { const k = Math.min(1, c.t / c.wind), q = Math.sin(k * Math.PI * 0.5); m.g.scale.set(1 + q * 0.1, 1 - q * 0.2, 1 + q * 0.1); }
      if (c.t >= c.wind) { m.g.scale.copy(ONE); strike(m, c); m.cast = null; }
      return true;
    }
    if (m.dash) { // the charge in flight
      const s = m.dash; s.t += dt; const k = Math.min(1, s.t / 0.32); m.g.position.lerpVectors(s.a, s.b, k);
      ctx.here(me); if (!s.hit && !down && guardT <= 0 && ctx.hopY() < 0.8 && Math.hypot(me.x - m.g.position.x, me.z - m.g.position.z) < 2.2) { s.hit = true; tmp.set(s.b.x - s.a.x, 0, s.b.z - s.a.z).normalize(); ctx.knock(tmp, 14); ctx.hurt(); damage(hitDamage(Math.round(m.atk * 1.3), stats().def)); ctx.buzz && ctx.buzz(70); }
      if (Math.random() < 0.6) puff(m.g.position.clone().setY(0.4), 0xd8c8a8, { n: 2, speed: 2, size: 0.7, life: 0.4, grav: 1 });
      if (k >= 1) { m.dash = null; ring(m.g.position, 0xff4d6d, { r0: 0.5, r1: 3.4, life: 0.4, y: 0.1 }); ctx.shake(0.25); }
      return true;
    }
    m.next = (m.next ?? 4.5) - dt * (m.rage ? 1.45 : 1);
    if (m.next > 0 || d > 16) return false;
    const pats = m.pats || (m.pats = patsOf(m)), kind = d > 7 && pats.includes("line") && Math.random() < 0.6 ? "line" : pats[Math.floor(Math.random() * pats.length)];
    m.next = (m.rage ? 3.4 : 5) + Math.random() * 2.2; // b401: bosses use their big moves more often
    ctx.here(me); const dir = tmp.copy(me).sub(m.g.position).setY(0).normalize().clone(); m.g.rotation.y = Math.atan2(dir.x, dir.z);
    const c = { kind, t: 0, wind: WIND[kind] * (m.rage ? 0.85 : 1), dir, marks: [] };
    if (kind === "slam") c.marks.push(warnDisc(m.g.position, 7, c.wind));
    else if (kind === "cone") { const fan = new THREE.Mesh(sgeo(`Circle|${[9.5, 32, -0.62, 1.24]}`, () => new THREE.CircleGeometry(9.5, 32, -0.62, 1.24)), additive(warnCol(), warnOp())); fan.rotation.x = -Math.PI / 2; fan.rotation.z = Math.atan2(dir.z, dir.x) * -1; fan.position.copy(m.g.position).setY(0.08); add(fan); fx.push({ o: fan, life: c.wind, t: 0, onTick: (k) => { fan.material.opacity = 0.1 + 0.32 * k + (ctx.reduce ? 0 : Math.sin(k * 30) * 0.05); } }); }
    else if (kind === "line") { const L = Math.min(16, Math.round(d + 4)), ln = new THREE.Mesh(sgeo(`Plane|${[2.6, L]}`, () => new THREE.PlaneGeometry(2.6, L)), additive(warnCol(), warnOp())); ln.rotation.x = -Math.PI / 2; ln.rotation.z = Math.atan2(dir.x, dir.z); const mid = m.g.position.clone().addScaledVector(dir, L / 2); ln.position.copy(mid).setY(0.08); add(ln); c.L = L; fx.push({ o: ln, life: c.wind, t: 0, onTick: (k) => { ln.material.opacity = 0.1 + 0.32 * k + (ctx.reduce ? 0 : Math.sin(k * 30) * 0.05); } }); }
    else if (kind === "rain") { c.spots = []; for (let i = 0; i < (m.rage ? 6 : 4); i++) { const at = i === 0 ? me.clone() : me.clone().add(new V3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9)); at.y = 0; c.spots.push(at); warnDisc(at, 2.3, c.wind); } }
    m.cast = c; m.e.play("Attack", { once: true, fade: 0.1 }); Snd.warn && Snd.warn(); if (ctx.hint) ctx.hint("dodge");
    return true;
  }
  function endCast(m) { m.cast = null; m.g.scale.copy(ONE); }
  function strike(m, c) {
    ctx.here(me);
    const can = () => !down && guardT <= 0 && ctx.hopY() < 0.8;
    if (c.kind === "slam") { slam(m); return; } // slam() buzzes only when it hits you
    if (c.kind === "cone") {
      for (let i = 0; i < 18; i++) { const a = Math.atan2(c.dir.z, c.dir.x) + (Math.random() - 0.5) * 1.2, r = 2 + Math.random() * 7; puff(m.g.position.clone().add(new V3(Math.cos(a) * r, 0.6, Math.sin(a) * r)), m.zone ? m.zone.color : 0xff6a4a, { n: 2, speed: 3, size: 0.8, life: 0.5, grav: -1 }); }
      ctx.shake(0.3); tmp.copy(me).sub(m.g.position).setY(0); const dd = tmp.length();
      if (dd < 9.5 && tmp.normalize().dot(c.dir) > Math.cos(0.62) && can()) { ctx.knock(tmp, 10); ctx.hurt(); damage(hitDamage(Math.round(m.atk * 1.25), stats().def)); ctx.buzz && ctx.buzz(60); }
      return;
    }
    if (c.kind === "line") { const a = m.g.position.clone(), b = a.clone().addScaledVector(c.dir, c.L - 1); if (ctx.blocked(b)) b.copy(a).addScaledVector(c.dir, (c.L - 1) * 0.5); m.dash = { a, b, t: 0, hit: false }; Snd.dash && Snd.dash(); return; }
    if (c.kind === "rain") for (const at of c.spots) { puff(at.clone().setY(0.5), 0xff6a4a, { n: 14, speed: 6, size: 0.5, life: 0.5, grav: 2 }); ring(at, 0xff4d6d, { r0: 0.3, r1: 2.6, life: 0.35, y: 0.1 }); if (can() && Math.hypot(me.x - at.x, me.z - at.z) < 2.3) { ctx.hurt(); damage(hitDamage(Math.round(m.atk * 0.9), stats().def)); ctx.buzz && ctx.buzz(50); } }
  }
  // half its HP gone: the boss roars, glows red, moves and strikes faster, and calls two helpers
  function enrage(m) {
    m.rage = true; m.atk = Math.round(m.atk * 1.2); ctx.toast(T("{x} is enraged!", { x: m.bossName })); Snd.roar && Snd.roar(); ctx.shake(0.5);
    ring(m.g.position, 0xff2d4d, { r0: 1, r1: 12, life: 0.9, y: 0.15 }); flash(m.g.position.clone().setY(2), 0xff4d6d, 8, 0.4);
    const aura = new THREE.Sprite(spriteMat(0xff2d4d, 0.5)); aura.scale.setScalar(9); aura.position.y = 2.4; m.g.add(aura); m.rageAura = aura;
    m.glow = 0.6; m.zone && (m.spec = { ...m.spec, color: "#ff2d4d" });
    if (m.zone) for (let i = 0; i < 3; i++) { const a = Math.random() * TAU; spawnMob({ type: m.zone.mobs[i % m.zone.mobs.length], lv: Math.max(1, m.lv - 4), zone: m.zone, at: m.g.position.clone().add(new V3(Math.cos(a) * 5, 0, Math.sin(a) * 5)) }); }
    bossEl.classList.add("rage");
  }

  // ---------------- the scammers' own ways (from level 8): spam bots shoot spam from a distance, rug gremlins charge,
  // a golden scammer runs ----------------
  const mshots = [];
  // spam mail: a real-looking envelope (paper, the flap's lines, a red SPAM stamp), lit like everything else; it used
  // to be a plain white box with a pink glow, which the bloom turned into a bright square flying round you
  const envTex = (() => { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 84; const g = cv.getContext("2d");
    g.fillStyle = "#f1e9ee"; g.fillRect(0, 0, 128, 84); g.strokeStyle = "#b79aa8"; g.lineWidth = 3; g.beginPath(); g.moveTo(4, 6); g.lineTo(64, 46); g.lineTo(124, 6); g.stroke();
    g.strokeStyle = "#d8c6cf"; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 80); g.lineTo(50, 44); g.moveTo(124, 80); g.lineTo(78, 44); g.stroke();
    g.translate(96, 60); g.rotate(-0.25); g.strokeStyle = "#e0284a"; g.lineWidth = 3; g.strokeRect(-24, -10, 48, 20); g.fillStyle = "#e0284a"; g.font = "800 15px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("SPAM", 0, 1);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const envGeo = new THREE.BoxGeometry(0.55, 0.36, 0.05), envMat = new THREE.MeshStandardMaterial({ map: envTex, color: 0xd8d0d6, emissive: 0xff4d6d, emissiveIntensity: 0.06, roughness: 0.7 });
  function behave(m, dt, t, d, i) {
    if (m.rank === "boss" || m.raid) return false;
    const face = () => { m.g.rotation.y = Math.atan2(tmp.x, tmp.z); };
    if (m.rare) {
      if ((m.rare -= dt) <= 0) { puff(m.g.position.clone().setY(0.8), 0xffc861, { n: 20, speed: 4, size: 0.4, life: 0.7, grav: -2 }); ctx.float(T("It got away"), m.g.position.clone().setY(2.6), "#ffd27a"); retire(m, i); return true; }
      if (d < 14) { tmp.copy(m.g.position).sub(me).setY(0).normalize(); if (!tryStep(m, tmp, m.spec.speed * (m.slow > 0 ? 0.35 : 1) * dt)) { tmp2.set(-tmp.z, 0, tmp.x); tryStep(m, tmp2, m.spec.speed * dt); } face(); m.g.position.y = Math.abs(Math.sin(t * 9 + i)) * 0.2; if (m.zone && Math.hypot(m.g.position.x - m.zone.x, m.g.position.z - m.zone.z) > m.zone.r) { tmp.set(m.zone.x - m.g.position.x, 0, m.zone.z - m.g.position.z).normalize(); m.g.position.addScaledVector(tmp, m.spec.speed * dt * 2); } return true; }
      return false;
    }
    if (m.lv < 8) return false;
    if (m.spec.id === "spam") { // keeps its distance and throws spam mail
      m.shotT = (m.shotT ?? 1.5 + Math.random() * 2) - dt;
      if (d > 11) return false;
      tmp.copy(me).sub(m.g.position).setY(0).divideScalar(d || 1);
      if (d < 5.5) { tmp2.copy(tmp).negate(); tryStep(m, tmp2, m.spec.speed * 0.8 * (m.slow > 0 ? 0.35 : 1) * dt); }
      else { tmp2.set(-tmp.z, 0, tmp.x).multiplyScalar(Math.sin(t * 0.7 + i) > 0 ? 1 : -1); tryStep(m, tmp2, m.spec.speed * 0.35 * dt); }
      face(); m.g.position.y = Math.abs(Math.sin(t * 6 + i)) * 0.12;
      if (m.shotT <= 0.35 && !m.aimed) { m.aimed = true; m.hitT = 0.12; }
      if (m.shotT <= 0) { m.shotT = 2.6 + Math.random() * 1.2; m.aimed = false; const env = new THREE.Mesh(envGeo, envMat); env.position.copy(m.g.position).setY(1.1); add(env); mshots.push({ o: env, v: tmp.clone().multiplyScalar(9), life: 1.7, dmg: hitDamage(Math.round(m.atk * 0.8), stats().def) }); m.e.play("Attack", { once: true, fade: 0.05 }); }
      return true;
    }
    if (m.spec.id === "rug" && m.lv >= 12) { // winds up, then charges in a straight line
      m.dashCd = (m.dashCd ?? 2 + Math.random() * 3) - dt;
      if (m.wind) { m.wind.t += dt; m.g.position.x += Math.sin(t * 60) * 0.02; if (m.wind.t >= 0.55) { m.rush = { a: m.g.position.clone(), b: m.g.position.clone().addScaledVector(m.wind.dir, 8), t: 0, hit: false }; m.wind = null; } return true; }
      if (m.rush) { const r = m.rush; r.t += dt; const k = Math.min(1, r.t / 0.3); tmp2.lerpVectors(r.a, r.b, k); if (!ctx.blocked(tmp2)) m.g.position.copy(tmp2); else k < 1 && (r.t = 1);
        if (!r.hit && !down && guardT <= 0 && ctx.hopY() < 0.8 && Math.hypot(me.x - m.g.position.x, me.z - m.g.position.z) < 1.4) { r.hit = true; tmp.copy(me).sub(m.g.position).setY(0).normalize(); ctx.knock(tmp, 9); ctx.hurt(); damage(hitDamage(Math.round(m.atk * 1.2), stats().def)); ctx.buzz && ctx.buzz(40); }
        if (r.t >= 0.3) { m.rush = null; m.dashCd = 4.5 + Math.random() * 2.5; } return true; }
      if (m.dashCd <= 0 && d > 4 && d < 9) { tmp.copy(me).sub(m.g.position).setY(0).normalize(); face(); m.wind = { t: 0, dir: tmp.clone() };
        const ln = new THREE.Mesh(sgeo(`Plane|${[1.4, 8]}`, () => new THREE.PlaneGeometry(1.4, 8)), additive(0xff2d4d, 0.25)); ln.rotation.x = -Math.PI / 2; ln.rotation.z = Math.atan2(tmp.x, tmp.z); ln.position.copy(m.g.position).addScaledVector(tmp, 4).setY(0.08); add(ln); fx.push({ o: ln, life: 0.55, t: 0, onTick: (k) => { ln.material.opacity = 0.1 + 0.25 * k; } }); return true; }
    }
    return false;
  }
  function tickMShots(dt) {
    ctx.here(me);
    for (let i = mshots.length - 1; i >= 0; i--) {
      const s = mshots[i]; s.life -= dt; s.o.position.addScaledVector(s.v, dt); s.o.rotation.y += dt * 8; s.o.rotation.x = Math.sin(s.life * 10) * 0.3;
      const hitMe = !down && Math.hypot(me.x - s.o.position.x, me.z - s.o.position.z) < 0.9 && ctx.hopY() < 1.2;
      if (hitMe || s.life <= 0) {
        root.remove(s.o); mshots.splice(i, 1);
        if (hitMe) { if (buffs.shield > 0 || guardT > 0) { flash(me.clone().setY(1.2), 0x4fa8ff, 2.4, 0.25); if (guardT > 0) ctx.float(T("Dodged"), me.clone().setY(2.6), "#9fe6ff"); } else { ctx.hurt(); damage(s.dmg); ctx.buzz && ctx.buzz(30); } puff(s.o.position.clone(), 0xff8fa0, { n: 8, speed: 3, size: 0.3, life: 0.4 }); }
      }
    }
  }

  // ---------------- the charged attack: hold the attack, let go when the ring is full ----------------
  // swords spin all round, the hammer quakes and stuns, the blaster fires a beam, the bow a piercing arrow, the staff a field
  const CHARGE = [{ name: "Whirlwind" }, { name: "Quake" }, { name: "Beam" }, { name: "Piercing arrow" }, { name: "Arcane field" }];
  const chg = { on: false, t: 0, ring: null, full: false, tick: 0 };
  const CHG_START = 0.3, CHG_FULL = 0.8, CHG_SP = 12;
  function chargeStart() { if (!ctx.active() || resting()) return; chg.on = true; chg.t = 0; chg.full = false; chg.tick = 0; }
  function chargeTick(dt) {
    if (!chg.on) return;
    chg.t += dt; const k = Math.max(0, Math.min(1, (chg.t - CHG_START) / CHG_FULL));
    if (chg.t >= CHG_START && !chg.ring) { const r = new THREE.Group(), a = new THREE.Mesh(sgeo(`Torus|${[1.4, 0.06, 8, 48]}`, () => new THREE.TorusGeometry(1.4, 0.06, 8, 48)), new THREE.MeshBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false })); a.rotation.x = Math.PI / 2; r.add(a); const f = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.4, 48, 1, Math.PI / 2, TAU), new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); f.rotation.x = -Math.PI / 2; f.geometry.setDrawRange(0, 0); r.add(f); r.userData = { a, f }; add(r); chg.ring = r; }
    if (!chg.ring) return;
    ctx.here(me); chg.ring.position.copy(me).setY(0.12);
    const { a, f } = chg.ring.userData; f.geometry.setDrawRange(0, Math.floor(k * 48) * 6); // the fill grows round the ring (one geometry, drawn in part)
    a.material.color.set(k >= 1 ? 0xffc861 : 0x8fe6ff); a.scale.setScalar(1 + (k >= 1 ? Math.sin(chg.t * 18) * 0.05 : 0));
    if ((chg.tick -= dt) <= 0 && k < 1) { chg.tick = 0.12; Snd.charge && Snd.charge(k); if (!ctx.reduce) puff(me.clone().add(new V3((Math.random() - 0.5) * 3, 0.4, (Math.random() - 0.5) * 3)), 0x8fe6ff, { n: 1, speed: 0.5, size: 0.25, life: 0.3, grav: -2 }); }
    if (k >= 1 && !chg.full) { chg.full = true; ring(me, 0xffc861, { r0: 0.5, r1: 2, life: 0.3, y: 0.1 }); Snd.pop && Snd.pop(); }
  }
  function chargeEnd(fire = true) {
    if (!chg.on) return false; chg.on = false;
    const k = Math.max(0, Math.min(1, (chg.t - CHG_START) / CHG_FULL));
    if (chg.ring) { root.remove(chg.ring); chg.ring.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }); chg.ring = null; }
    if (!fire || k < 0.5 || !ctx.active()) return false;
    if (sp < CHG_SP) { ctx.toast(T("Not enough SP")); return false; }
    sp -= CHG_SP; paintVit(); charged(0.75 + k * 0.5); return true;
  }
  function charged(power) {
    const kind = wKind(), base = stats().atk * power, col = wColor().getHex();
    ctx.here(me); fwdOf(fwd); cd.attack = 0.6; Snd.charged && Snd.charged(); ctx.buzz && ctx.buzz(25); ctx.shake(0.3); ctx.punch && ctx.punch();
    if (rpg.swing) rpg.swing(true);
    const av = ctx.avatar(); if (av) av.play("pick-up", { once: true, fade: 0.04, speed: 2.2 });
    ctx.float(T(CHARGE[kind].name), me.clone().setY(3), "#ffd27a", true);
    let n = 0; const hitAll = (test, mult, k2) => { for (const m of mobs) { if (m.dead) continue; if (test(m)) { const c = critRoll(); hit(m, base * mult * (c ? critX() : 1), me, k2 || "heavy", c); n++; } } };
    if (kind === 0) { // whirlwind
      for (let i = 0; i < 2; i++) { const blade = new THREE.Mesh(sgeo(`Ring|${[1.6, 3.6, 48, 1, 0, TAU * 0.8]}`, () => new THREE.RingGeometry(1.6, 3.6, 48, 1, 0, TAU * 0.8)), additive(i ? col : 0xffffff, i ? 0.5 : 0.8)); blade.material.side = THREE.DoubleSide; blade.rotation.x = -Math.PI / 2; blade.position.copy(me).setY(0.9 + i * 0.25); add(blade); fx.push({ o: blade, life: 0.4, t: 0, op0: i ? 0.5 : 0.8, onTick: (k) => { blade.rotation.z = k * 9 * (i ? -1 : 1); blade.scale.setScalar(0.8 + k * 0.4); } }); }
      hitAll((m) => m.g.position.distanceTo(tmp.copy(me).setY(m.g.position.y)) < 3.8 + (m.rank === "boss" ? 2 : 0), 2.0);
    } else if (kind === 1) { // quake
      ring(me, 0xffc861, { r0: 0.5, r1: 7, life: 0.6, y: 0.12 }); ring(me, 0xffffff, { r0: 0.3, r1: 5, life: 0.45, y: 0.14 }); if (VX) VX.impact(me.clone().setY(0.3), "meteor", { big: 1.2 }); shards(me.clone().setY(0.3), 0x8a6a4a, 24, 9); ctx.shake(0.55); if (ctx.wave) ctx.wave(me, 0.9); if (ctx.parts) ctx.parts.smoke(me.clone().setY(0.3), 0x9a8a7a, 10, 1.5); scorch(me, 3.4);
      hitAll((m) => m.g.position.distanceTo(tmp.copy(me).setY(m.g.position.y)) < 6.5 + (m.rank === "boss" ? 2 : 0), 2.4);
      for (const m of mobs) if (!m.dead && m.g.position.distanceTo(tmp.copy(me).setY(m.g.position.y)) < 6.5) m.stun = Math.max(m.stun, m.rank === "boss" ? 0.3 : 1.0);
    } else if (kind === 2 || kind === 3) { // beam / piercing arrow: everything on the line
      aim(fwd); const L = kind === 2 ? 16 : 22, w = kind === 2 ? 1.4 : 1.0;
      const beam = new THREE.Mesh(sgeo(`Cylinder|${[kind === 2 ? 0.35 : 0.12, kind === 2 ? 0.35 : 0.12, L, 12, 1, true]}`, () => new THREE.CylinderGeometry(kind === 2 ? 0.35 : 0.12, kind === 2 ? 0.35 : 0.12, L, 12, 1, true)), additive(kind === 2 ? 0x8fe6ff : col, 0.85)); beam.rotation.x = Math.PI / 2; const bg = new THREE.Group(); bg.add(beam); beam.position.z = L / 2; bg.position.copy(me).setY(1.1); bg.rotation.y = Math.atan2(fwd.x, fwd.z); add(bg);
      fx.push({ o: bg, life: kind === 2 ? 0.35 : 0.25, t: 0, onTick: (k) => { beam.material.opacity = 0.85 * (1 - k); beam.scale.x = beam.scale.z = 1 + k * (kind === 2 ? 1.5 : 0.5); } });
      hitAll((m) => { tmp.copy(m.g.position).sub(me).setY(0); const pr = tmp.dot(fwd); if (pr < 0 || pr > L) return false; return tmp.addScaledVector(fwd, -pr).length() < w + (m.rank === "boss" ? 1.6 : 0); }, kind === 2 ? 2.2 : 2.5, "melee");
    } else { // arcane field
      const tg = aim(fwd), at = tg ? tg.g.position.clone().setY(0) : me.clone().addScaledVector(fwd, 6).setY(0);
      const disc = new THREE.Mesh(sgeo(`Circle|${[4.2, 48]}`, () => new THREE.CircleGeometry(4.2, 48)), additive(0xb48cff, 0.4)); disc.rotation.x = -Math.PI / 2; disc.position.copy(at).setY(0.09); add(disc); fx.push({ o: disc, life: 0.9, t: 0, op0: 0.4, onTick: (k) => { disc.scale.setScalar(0.4 + Math.min(1, k * 3) * 0.6); } });
      ring(at, 0xd8c4ff, { r0: 0.5, r1: 4.4, life: 0.5, y: 0.12 }); if (VX) VX.impact(at.clone().setY(0.4), "shock", { big: 1.6 });
      hitAll((m) => m.g.position.distanceTo(tmp.copy(at).setY(m.g.position.y)) < 4.2 + (m.rank === "boss" ? 1.6 : 0), 2.1, "melee");
      for (const m of mobs) if (!m.dead && m.g.position.distanceTo(tmp.copy(at).setY(m.g.position.y)) < 4.2) m.slow = Math.max(m.slow, 3);
    }
    if (n) stopT = Math.max(stopT, 0.08);
    return true;
  }

  // ---------------- the boss bar and the zone banner ----------------
  const bossEl = document.createElement("div"); bossEl.className = "wc-boss"; bossEl.id = "wc-boss"; bossEl.hidden = true; bossEl.setAttribute("data-no-i18n", ""); document.body.appendChild(bossEl);
  // the boss's bar: built once per boss, then only its widths change, so the pale "just lost" tail can slide down after
  // the red, and a notch marks half HP (where a hunting-ground boss rages)
  let bossIdSeq = 0;
  function bossBar(m) {
    if (!m.barId) m.barId = ++bossIdSeq;
    const k = Math.max(0, m.hp / m.max);
    if (bossEl.hidden || bossEl.dataset.bid !== String(m.barId)) {
      bossEl.hidden = false; bossEl.dataset.bid = String(m.barId);
      bossEl.innerHTML = `<b>${ctx.esc(m.bossName)}</b><small>${m.raid ? `<span class="wc-long">${T("Weekly raid · everyone's HP")} · </span>` : m.ext ? `<span class="wc-long">${m.extLabel || T("Halloween · everyone's HP")} · </span>` : T("Boss") + " · "}Lv ${m.lv}</small><i><q class="wc-bt" style="width:${100 * k}%"></q><u style="width:${100 * k}%"></u>${m.raid ? "" : '<s class="wc-ph" style="left:50%" aria-hidden="true"></s>'}</i><em></em>`;
    }
    bossEl.classList.toggle("raid", !!m.raid); bossEl.classList.toggle("rage", !!m.rage);
    const u = bossEl.querySelector("u"), q = bossEl.querySelector(".wc-bt"), em = bossEl.querySelector("em");
    if (u) u.style.width = 100 * k + "%"; if (q) q.style.width = 100 * k + "%";
    if (em) em.textContent = `${Math.max(0, Math.ceil(m.hp)).toLocaleString("en-US")} / ${m.max.toLocaleString("en-US")}`;
  }
  function hideBossBar() { bossEl.hidden = true; bossEl.dataset.bid = ""; }
  const zoneEl = document.createElement("div"); zoneEl.className = "wc-zone"; zoneEl.id = "wc-zone"; zoneEl.hidden = true; zoneEl.setAttribute("data-no-i18n", ""); (document.querySelector(".wp-hud-r") || document.body).appendChild(zoneEl); // under the minimap
  const bannerEl = document.createElement("div"); bannerEl.className = "wc-banner"; bannerEl.hidden = true; bannerEl.setAttribute("data-no-i18n", ""); document.body.appendChild(bannerEl);
  const bossAt = () => { try { return JSON.parse(localStorage.getItem(BKEY) || "{}"); } catch { return {}; } };
  const setBoss = (id, t) => { const b = bossAt(); b[id] = t; try { localStorage.setItem(BKEY, JSON.stringify(b)); } catch { /* private */ } };
  function paintZone() {
    if (!zone) { zoneEl.hidden = true; return; }
    const next = bossAt()[zone.id] || 0, alive = mobs.some((m) => m.rank === "boss" && !m.dead);
    const left = Math.max(0, next - Date.now());
    zoneEl.hidden = false; zoneEl.style.setProperty("--zc", "#" + new THREE.Color(zone.color).getHexString());
    const zh = `<b>${ctx.esc(zone.name)}</b><small style="color:${lvColor(zone.lv[0])}">${T("Level {a}–{b}", { a: zone.lv[0], b: zone.lv[1] })} · ${T("you're Lv {n}", { n: ctx.level() })}</small><em>${alive ? T("Boss is here!") : left ? T("Boss in {t}", { t: `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}` }) : T("Boss soon")}</em>`;
    if (zh !== zoneEl._h) { zoneEl._h = zh; zoneEl.innerHTML = zh; } // only when it changed (it's painted twice a second)
  }
  // a ground you're under-levelled for: the screen's edge glows red as long as you stay in it
  const edgeEl = document.createElement("div"); edgeEl.className = "wc-edge"; edgeEl.hidden = true; edgeEl.setAttribute("aria-hidden", "true"); document.body.appendChild(edgeEl);
  const ZSEEN = "arc.world.zseen";
  const seen = () => { try { return JSON.parse(localStorage.getItem(ZSEEN) || "[]"); } catch { return []; } };
  function enterZone(z) {
    bannerEl.hidden = false; bannerEl.style.setProperty("--zc", "#" + new THREE.Color(z.color).getHexString());
    const boost = ctx.xpBoost ? ctx.xpBoost(z.id) : 1, lv = ctx.level(), under = lv < z.lv[0], deadly = lv < z.lv[0] - 10;
    const s0 = seen(), first = !s0.includes(z.id); if (first) { s0.push(z.id); try { localStorage.setItem(ZSEEN, JSON.stringify(s0)); } catch { /* private */ } }
    // the name comes in letter by letter (one span a letter, a little later each)
    const letters = [...z.name].map((ch, i) => `<i style="--d:${i * 32}ms">${ch === " " ? "&nbsp;" : ctx.esc(ch)}</i>`).join("");
    const tags = [first ? `<span class="wc-new">${T("New ground")}</span>` : "", boost > 1 ? `<span class="wc-xpev">${T("XP ×{k} today", { k: boost })}</span>` : "", under ? `<span class="wc-warn">${T("Recommended from level {n}", { n: z.lv[0] })}</span>` : ""].join("");
    bannerEl.innerHTML = `<small>${T("Hunting ground {n} of {m}", { n: ZONES.indexOf(z) + 1, m: ZONES.length })}</small><b>${letters}</b><hr><em>${T("Level {a}–{b}", { a: z.lv[0], b: z.lv[1] })} · ${T("Boss")}: ${ctx.esc(z.boss.name)}</em>${tags ? `<p>${tags}</p>` : ""}`;
    bannerEl.classList.toggle("danger", deadly); // every ground is open to every level; far above yours, the banner just says so in red
    bannerEl.classList.remove("on"); void bannerEl.offsetWidth; bannerEl.classList.add("on"); clearTimeout(bannerEl._t); bannerEl._t = setTimeout(() => { bannerEl.hidden = true; }, 3600);
    const b = bossAt(); if (!b[z.id]) setBoss(z.id, Date.now() + BOSS_FIRST);
    if (under) ctx.toast(T("{x} is recommended from level {n}: the scammers here hit hard", { x: z.name, n: z.lv[0] }));
    if (first && ctx.onNewZone) ctx.onNewZone(z); if (z.lv[0] >= 30 && ctx.hint) setTimeout(() => ctx.hint("pond"), 4000);
  }

  // ---------------- attacking: a three-hit combo ----------------
  const critRoll = () => Math.random() * 100 < stats().crit;
  const critX = () => 1.8 + (stats().critDmg || 0) / 100; // a critical hit's multiplier: ×1.8, more with critical damage (the Crimson Celestial set)
  // the weapon in hand decides how you attack (world-gear3d.js WEAPON_KINDS): 0 dual swords (this combo), 1 plasma hammer
  // (slower, harder, the third swing slams all round), 2 blaster, 3 bow and 4 staff (shots, below)
  const wKind = () => { const d = rpg.data && rpg.data(), w = d && d.eq && d.eq.weapon; return w ? weaponKind(w) : 0; };
  const wColor = () => { const d = rpg.data && rpg.data(), w = d && d.eq && d.eq.weapon; return new THREE.Color(w ? RARITY[w.r || 0].color : "#38e8ff"); };
  const arcPool = [], arcBack = (o) => { if (arcPool.length < 6) arcPool.push(o); else o.userData.sm.dispose(); };
  const slashArc = () => { const arc = new THREE.Group(), sm = slashMat(0xffffff), blade = new THREE.Mesh(undefined, sm); arc.add(blade); arc.userData.sm = sm; arc.userData.blade = blade; return arc; };
  // a press a beat early is kept (150 ms) and fires when the cooldown ends, so rhythm taps don't drop combo hits
  let atkBuf = 0, dodgeBuf = 0;
  function attack() {
    if (!ctx.active()) return false;
    if (cd.attack > 0) { if (!resting()) atkBuf = performance.now(); return false; }
    if (resting()) { if (cd.attack <= 0) { cd.attack = 1.2; restNote(); } return false; }
    atkBuf = 0; combo = comboT > 0 ? (combo % 3) + 1 : 1; comboT = 0.75;
    faceAssist();
    const heavy = combo === 3, kind = wKind(), ham = kind === 1;
    if (rpg.swing) rpg.swing(heavy);
    ctx.here(me); fwdOf(fwd); if (ctx.onSwing) ctx.onSwing(me.clone(), fwd.clone(), heavy, kind === 1); // a rock, a crystal or a log in front gets the hit too
    if (kind >= 2) { const ok = shoot(kind, heavy); comboT = cd.attack + 0.6; return ok; } // the next shot has time to follow up
    if (ham) comboT = 1.2;
    cd.attack = ham ? (heavy ? 0.85 : 0.55) : heavy ? 0.5 : 0.3;
    const av = ctx.avatar(); if (av) av.play(heavy ? "pick-up" : "interact-right", { once: true, fade: 0.04, speed: heavy ? 2.2 : 2.0 });
    Snd.swing && Snd.swing(heavy, kind);
    ctx.here(me); fwdOf(fwd);
    // the crescent takes the weapon's colour (its rarity), gold on the third blow or with a hammer
    const wpn = rpg.data && rpg.data() && rpg.data().eq && rpg.data().eq.weapon, wc = heavy || ham ? 0xffc861 : wpn && (wpn.r || 0) >= 1 ? new THREE.Color(RARITY[wpn.r].color).getHex() : 0x7fe6ff;
    // (kept for reuse, b420: a new shader material on every swing was garbage three times a second)
    const r0 = heavy ? 0.85 : 0.9, r1 = heavy ? 2.1 : 1.7, arc = arcPool.pop() || slashArc(), sm = arc.userData.sm, blade = arc.userData.blade;
    sm.uniforms.uC.value.set(wc); sm.uniforms.uR.value.set(r0, r1); sm.uniforms.uK.value = 0; sm.uniforms.uO.value = 1; arc.visible = true;
    blade.geometry = sgeo(`Ring|${[r0, r1, 48, 1, 0.2, 2.6]}`, () => new THREE.RingGeometry(r0, r1, 48, 1, 0.2, 2.6));
    const tilt = combo === 1 ? -0.6 : combo === 2 ? 0.7 : -1.5, sz = ham ? 1.25 : 1; blade.rotation.z = tilt;
    arc.rotation.set(0, ctx.facing(), 0); arc.position.copy(me).setY(heavy ? 0.9 : 1.15).addScaledVector(fwd, 1.0); add(arc);
    const turn = combo === 2 ? 1 : -1;
    if (ctx.parts && !ctx.reduce) ctx.parts.sparks(fxV.copy(me).setY(heavy ? 0.9 : 1.15).addScaledVector(fwd, 1.6), wc, heavy ? 12 : 6, fwd); // sparks thrown off the crescent's edge
    fx.push({ o: arc, life: 0.26, t: 0, grow: [0.8 * sz, (heavy ? 1.45 : 1.2) * sz], back: arcBack, onTick: (k) => { sm.uniforms.uK.value = Math.min(1, k * 1.6); sm.uniforms.uO.value = 1 - k * k; arc.rotation.z = turn * k * 1.2; } });
    if (heavy) { ring(me.clone().addScaledVector(fwd, 1.4), 0xffc861, { r0: 0.4, r1: 2.6, life: 0.3, y: 0.1 }); puff(me.clone().addScaledVector(fwd, 1.4).setY(0.3), 0xd8c8a8, { n: 10, speed: 3, size: 0.5, life: 0.5, grav: 2 }); }
    const reach = ham ? (heavy ? 3.9 : 3.0) : heavy ? 3.1 : 2.6, base = stats().atk * (heavy ? 1.7 : combo === 2 ? 1.15 : 1) * (ham ? 1.45 : 1);
    if (ham && heavy) { ring(me, 0xffc861, { r0: 0.5, r1: 4.2, life: 0.4, y: 0.1 }); if (VX) { VX.impact(me.clone().setY(0.4), "hit", { big: 1.6 }); if (VX.boom) VX.boom(fxV.copy(me).addScaledVector(fwd, 1.2).setY(0.9), "hit", { size: 3.4, life: 0.5 }); } ctx.shake(0.25); }
    let any = false;
    for (const m of mobs) { if (m.dead) continue; tmp.copy(m.g.position).sub(me).setY(0); const d = tmp.length() - (m.rank === "boss" ? 2 : 0); if (d < reach && ((ham && heavy) || d < 0.8 || tmp.normalize().dot(fwd) > 0.2)) { const c = critRoll(); hit(m, base * (c ? critX() : 1), me, heavy ? "heavy" : "melee", c); any = true; puff(m.g.position.clone().setY(m.y + 0.5), 0xffffff, { n: 6, speed: 4, size: 0.25, life: 0.3 }); } }
    if (any) ctx.shake(heavy ? 0.16 : 0.07);
    return true;
  }
  // dodge: a quick dash where you're looking or moving; you can't be hit during it
  function dodge() {
    if (!ctx.active()) return false;
    if (cd.dodge > 0) { dodgeBuf = performance.now(); atkBuf = 0; return false; }
    dodgeBuf = 0; atkBuf = 0; cd.dodge = 1.1; guardT = Math.max(guardT, 0.45);
    if (!ctx.moveDir(tmp)) fwdOf(tmp);
    ctx.dash(tmp, 6.5); Snd.dash ? Snd.dash() : Snd.jump && Snd.jump();
    ctx.here(me);
    // afterimages: frozen see-through copies of you along the dash (world-play.js), or soft streaks on a phone
    if (!(ctx.afterimage && ctx.afterimage())) for (let i = 0; i < 6; i++) setTimeout(() => { ctx.here(me); const s = sprite(0x9fe6ff, 0.5); s.position.copy(me).setY(1.1); s.scale.set(1.2, 2.2, 1); add(s); fx.push({ o: s, life: 0.35, t: 0, op0: 0.5 }); }, i * 35);
    return true;
  }
  // ---- lock-on: Tab (or the target button) picks the nearest scammer within 16 m, again for the next one; your blows
  // and skills turn to it, and a ring turns under it. Gone when it falls, runs out of reach, or the last one is passed.
  // b447 (players asked): the lock stays on until you turn it off. While it's on, a target that falls or gets away hands
  // over to the nearest scammer in reach, and with none near it waits (the button stays lit) for the next one.
  let lockT = null, lockMark = null, lockMode = false, lockScan = 0;
  const lockAlive = () => !!(lockT && !lockT.dead && mobs.includes(lockT) && lockT.g.position.distanceTo(tmp3.copy(me).setY(lockT.g.position.y)) < 22);
  const tmp3 = new V3();
  // the cycle keeps one order (nearest first when it starts) so Tab walks the pack instead of hopping as you move
  let lockList = [];
  const lockOk = (m) => !m.dead && mobs.includes(m) && m.g.position.distanceTo(tmp3.copy(me).setY(m.g.position.y)) < 16;
  function lockOn() {
    ctx.here(me);
    if (!(lockAlive() && lockList.includes(lockT))) lockList = mobs.filter(lockOk).sort((a, b) => a.g.position.distanceToSquared(me) - b.g.position.distanceToSquared(me));
    else lockList = lockList.filter((m) => m === lockT || lockOk(m));
    if (!lockList.length) { if (lockMode) { lockMode = false; lockT = null; paintLock(); ctx.toast(T("Lock-on off")); return; } lockT = null; paintLock(); ctx.toast(T("No scammer close enough to lock on")); return; }
    const i = lockAlive() ? lockList.indexOf(lockT) : -1;
    lockT = i < 0 ? lockList[0] : i + 1 < lockList.length ? lockList[i + 1] : null; // past the last one: the lock lets go
    const was = lockMode; lockMode = !!lockT; if (!lockT) ctx.toast(T("Lock-on off")); else if (!was) ctx.toast(T("Lock-on on: tap again for the next target"));
    paintLock(); Snd.pop && Snd.pop();
  }
  function faceLock() { if (!lockAlive() || !ctx.faceTo) return; ctx.here(me); ctx.faceTo(Math.atan2(lockT.g.position.x - me.x, lockT.g.position.z - me.z)); }
  // no lock: a melee swing turns a little toward a scammer in reach ahead (a ~70 deg cone round the stick or facing)
  const assistV = new V3();
  function faceAssist() {
    if (lockAlive()) return faceLock(); if (!ctx.faceTo || wKind() >= 2) return;
    ctx.here(me); if (!ctx.moveDir(assistV)) fwdOf(assistV);
    let best = null, bd = 4.6;
    for (const m of mobs) { if (m.dead) continue; tmp.copy(m.g.position).sub(me).setY(0); const d = tmp.length() - (m.rank === "boss" ? 2 : 0); if (d < bd && d > 0.05 && tmp.normalize().dot(assistV) > 0.82) { bd = d; best = m; } }
    if (best) ctx.faceTo(Math.atan2(best.g.position.x - me.x, best.g.position.z - me.z));
  }
  function paintLock() {
    const on = lockAlive(); if (lockBtn) lockBtn.classList.toggle("on", on || lockMode);
    if (!on) { if (lockMark) lockMark.visible = false; return; }
    if (!lockMark) {
      lockMark = new THREE.Group(); const mat = additive(0xff6a4d, 0.85); mat.side = THREE.DoubleSide;
      const ringM = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.02, 48), mat); ringM.rotation.x = -Math.PI / 2; lockMark.add(ringM);
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 3), mat); c.rotation.z = Math.PI / 2; const a = (i / 3) * TAU; c.position.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25); c.rotation.y = -a; c.rotation.x = -Math.PI / 2; lockMark.add(c); }
      lockMark.renderOrder = 4; add(lockMark);
    }
    lockMark.visible = true;
  }
  function tickLock(dt) {
    if (!lockT && !lockMode) return;
    if (!lockAlive()) { // the lock on: the nearest scammer in reach takes over (checked a few times a second while none is near)
      if (lockMode && (lockScan -= dt) > 0 && !lockT) return; lockScan = 0.3;
      let nx = null; ctx.here(me); let bd = 1e9; for (const m of mobs) if (m !== lockT && lockOk(m)) { const d = m.g.position.distanceToSquared(me); if (d < bd) { bd = d; nx = m; } }
      if (!lockMode && !(lockT && lockT.dead)) nx = null; // (off: only a kill hands it on, as before)
      lockT = nx; if (nx && !lockList.includes(nx)) lockList.push(nx); paintLock(); if (!nx) return;
    }
    const big = lockT.rank === "boss" ? 2.6 : lockT.rank === "elite" ? 1.4 : 1;
    lockMark.position.copy(lockT.g.position).setY(0.09); lockMark.scale.setScalar(big * (1 + Math.sin(performance.now() / 160) * 0.04)); lockMark.rotation.y += dt * 1.6;
  }
  function aim(out) {
    ctx.here(me); fwdOf(out);
    if (lockAlive()) { out.copy(lockT.g.position).sub(me).setY(0).normalize(); return lockT; }
    let best = null, bd = 24;
    for (const m of mobs) { if (m.dead) continue; tmp.copy(m.g.position).sub(me).setY(0); const d = tmp.length(); if (d < bd && tmp.normalize().dot(out) > 0.5) { bd = d; best = m; } }
    if (best) out.copy(best.g.position).sub(me).setY(0).normalize();
    return best;
  }
  const power = (s) => stats().atk * s.mult * (1 + 0.12 * (skillLevel(ctx.level(), s.lv) - 1)) * (1 + (stats().skillPct || 0) / 100); // (skill damage: the Crimson Celestial set)
  // the way a skill grew (world-rpg-data.js BRANCHES): "a", "b" or "" before skill level 2 / before choosing
  const brOf = (id) => { const s = SKILLS.find((x) => x.id === id); if (!s || skillLevel(ctx.level(), s.lv) < BRANCH_AT) return ""; const b = ((rpg.data() || {}).x || {}).br || {}; return b[id] === "a" || b[id] === "b" ? b[id] : ""; };
  function cast(id) {
    const s = SKILLS.find((x) => x.id === id); if (!s || !ctx.active()) return false;
    if (resting()) { restNote(); return false; }
    if (!unlocked(s)) { ctx.toast(T("{x} unlocks at level {n}", { x: T(s.name), n: s.lv })); return false; }
    if (cd[id] > 0) return false;
    if (sp < s.sp) { ctx.toast(T("Not enough SP")); vit.classList.remove("low"); requestAnimationFrame(() => vit.classList.add("low")); return false; }
    sp -= s.sp; cd[id] = s.cd * (1 - 0.05 * (skillLevel(ctx.level(), s.lv) - 1)); paintVit(); ctx.onCast && ctx.onCast(id);
    const av = ctx.avatar(); if (av) av.play("interact-right", { once: true, fade: 0.05, speed: 1.4 });
    ctx.here(me);
    const hand = me.clone().setY(1.25);
    if (id === "shock") return shock(hand, s);
    if (id === "meteor") return meteor(s);
    aim(fwd);
    const start = hand.addScaledVector(fwd, 0.7);
    const core = new THREE.Mesh(id === "ice" ? new THREE.IcosahedronGeometry(0.42, 0) : new THREE.SphereGeometry(0.44, 18, 14), id === "ice" ? new THREE.MeshStandardMaterial({ color: 0xcff6ff, emissive: 0x5fd8ff, emissiveIntensity: 1.4, roughness: 0.1, flatShading: true }) : new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.3) }));
    core.position.copy(start); add(core);
    const halo = new THREE.Sprite(spriteMat(s.color, 0.95)); halo.scale.setScalar(id === "fire" ? 3.0 : 2.3); core.add(halo);
    const shade = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: id === "fire" ? 0xff5a1a : 0x2f9be8, transparent: true, opacity: 0.55, depthWrite: false })); shade.scale.setScalar(id === "fire" ? 1.9 : 1.6); core.add(shade);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: id === "fire" ? 0xffd27a : 0xe6fbff })); core.add(orbit);
    shots.push({ o: core, kind: id, v: fwd.clone().multiplyScalar(id === "ice" ? 14 : 12), life: 1.9, t: 0, trail: 0, dmg: power(s) * (id === "ice" && brOf("ice") === "b" ? 1.3 : 1), wide: id === "fire" && brOf("fire") === "a" });
    flash(start, s.color, 2.4, 0.22); ring(me, s.color, { r0: 0.3, r1: 1.8, life: 0.3, y: 0.1 });
    Snd.cast && Snd.cast(id);
    return true;
  }
  // Meteor: a burning rock falls on the nearest scammer ahead (or a few steps ahead) and blows a crater
  function meteor(s, second) {
    const tgt = aim(fwd), at = tgt ? tgt.g.position.clone().setY(0) : me.clone().addScaledVector(fwd, 6).setY(0);
    if (second) at.add(new V3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
    const big = brOf("meteor") === "b" ? 1.5 : 1;
    if (!second && brOf("meteor") === "a") setTimeout(() => { ctx.here(me); fwdOf(fwd); meteor(s, true); }, 380);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(second ? 0.7 : 0.9, 1), new THREE.MeshStandardMaterial({ color: second ? 0x2a1a4a : 0x5a2a18, emissive: second ? 0xb48cff : 0xff4d1a, emissiveIntensity: 1.6, roughness: 0.6, flatShading: true }));
    const halo = new THREE.Sprite(spriteMat(s.color, 0.95)); halo.scale.setScalar(4.2); core.add(halo);
    core.position.copy(at).add(new V3(-3, 16, -3)); add(core);
    const v = at.clone().sub(core.position).multiplyScalar(1 / 0.7);
    ring(at, 0xff4d2a, { r0: 4.4 * big, r1: 4.6 * big, life: 0.7, y: 0.08 }); if (!second) flash(me.clone().setY(1.4), s.color, 2.4, 0.25);
    shots.push({ o: core, kind: "meteor", v, life: 0.72, t: 0, trail: 0, dmg: power(s) * (second ? 0.7 : 1), at, big });
    Snd.cast && Snd.cast("fire"); ctx.shake(0.1);
    return true;
  }
  function shock(hand, s) {
    const chain = [], pool2 = mobs.filter((m) => !m.dead), lvl = skillLevel(ctx.level(), s.lv), hops = 2 + (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0) + (brOf("shock") === "a" ? 2 : 0);
    for (let k = 0; k <= hops; k++) {
      let best = null, bd = k ? 5.5 : 10;
      for (const m of pool2) { if (chain.includes(m)) continue; const d = m.g.position.distanceTo(k ? chain[k - 1].g.position : me); if (d < bd) { bd = d; best = m; } }
      if (!best) break; chain.push(best);
    }
    const pts = [hand.clone(), ...chain.map((m) => m.g.position.clone().setY(m.y + 0.4))];
    if (!chain.length) {
      ring(me, 0xb48cff, { r0: 0.4, r1: 3.2, life: 0.4, y: 0.6 }); flash(hand, 0xd8c4ff, 2.6, 0.3);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; bolt(hand, hand.clone().add(new V3(Math.cos(a) * 2.6, -0.6 + Math.random(), Math.sin(a) * 2.6))); }
    } else {
      for (let i = 0; i < pts.length - 1; i++) { bolt(pts[i], pts[i + 1]); bolt(pts[i], pts[i + 1]); }
      const dmg = power(s) * (brOf("shock") === "b" ? 1.2 : 1);
      chain.forEach((m, i) => { setTimeout(() => { const c = critRoll(); hit(m, dmg * (c ? critX() : 1), me, "shock", c); flash(m.g.position.clone().setY(m.y + 0.4), 0xd8c4ff, 2.2, 0.25); puff(m.g.position.clone().setY(m.y + 0.4), 0xb48cff, { n: 8, speed: 5, size: 0.22, life: 0.35 }); }, i * 70); });
      ctx.shake(0.12);
    }
    flash(hand, 0xb48cff, 1.8, 0.2); Snd.cast && Snd.cast("shock");
    return true;
  }
  // a patch of burning ground (Wildfire): flickers for two seconds and singes whatever stands in it
  function groundFire(at) {
    const p = at.clone().setY(0.07), disc = new THREE.Mesh(sgeo(`Circle|${[3.2, 32]}`, () => new THREE.CircleGeometry(3.2, 32)), additive(0xff7a2a, 0.35)); disc.rotation.x = -Math.PI / 2; disc.position.copy(p); add(disc);
    let tick = 0;
    fx.push({ o: disc, life: 2, t: 0, onTick: (k) => { disc.material.opacity = 0.35 * (1 - k) + Math.sin(k * 40) * 0.05; if ((tick += 1) % 6 === 0) { puff(p.clone().add(new V3((Math.random() - 0.5) * 4, 0.2, (Math.random() - 0.5) * 4)), 0xff7a2a, { n: 2, speed: 1, size: 0.6, life: 0.5, grav: -3 }); for (const m of mobs) if (!m.dead && m.g.position.distanceTo(tmp.copy(p).setY(m.g.position.y)) < 3.2) { m.burn = Math.max(m.burn, 1); m.burnD = Math.max(m.burnD || 0, 2); } } } });
  }
  function bolt(a, b) {
    if (VX && VX.zap && VX.zap(a, b, { color: 0xb48cff })) return;
    const n = 9, pts = [];
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); if (i && i < n) p.add(new V3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6)); pts.push(p); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.3, 3.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); add(line);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.07, 5), new THREE.MeshBasicMaterial({ color: 0xf2ecff, transparent: true })); add(tube); fx.push({ o: tube, life: 0.24, t: 0, op0: 1 }); // (it used to stay behind: every zap left a white line in the scene)
    const aura = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.22, 6), additive(0x9a6cff, 0.55)); add(aura); fx.push({ o: aura, life: 0.26, t: 0, op0: 0.55 });
    fx.push({ o: line, life: 0.28, t: 0, onTick: () => { const p = geo.attributes.position; for (let i = 1; i < n; i++) p.setXYZ(i, pts[i].x + (Math.random() - 0.5) * 0.25, pts[i].y + (Math.random() - 0.5) * 0.25, pts[i].z + (Math.random() - 0.5) * 0.25); p.needsUpdate = true; } });
    fx.push({ o: tube, life: 0.22, t: 0 });
  }
  const bolts = [];
  function shoot(kind, heavy) {
    cd.attack = kind === 2 ? (heavy ? 0.45 : 0.26) : kind === 3 ? (heavy ? 0.8 : 0.6) : heavy ? 0.7 : 0.45;
    const av = ctx.avatar(); if (av) av.play("interact-right", { once: true, fade: 0.04, speed: 2.2 });
    Snd.swing && Snd.swing(heavy, kind);
    const dir = new V3(), target = aim(dir), col = wColor();
    const dmg = stats().atk * (kind === 2 ? 0.8 : kind === 3 ? 1.25 : 1.0) * (heavy && kind === 4 ? 1.4 : 1);
    const fire = (turn, delay) => (delay ? (f) => setTimeout(f, delay) : (f) => f())(() => {
      if (!ctx.active()) return;
      ctx.here(me); const d = dir.clone().applyAxisAngle(UP, turn);
      const g = new THREE.Group();
      if (kind === 2) { const core = new THREE.Mesh(sgeo(`Capsule|${[0.08, 0.5, 4, 8]}`, () => new THREE.CapsuleGeometry(0.08, 0.5, 4, 8)), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4) })); core.rotation.x = Math.PI / 2; g.add(core); const halo = new THREE.Sprite(spriteMat(col.getHex(), 0.7)); halo.scale.setScalar(0.9); g.add(halo); }
      else if (kind === 3) { const shaft = new THREE.Mesh(sgeo(`Cylinder|${[0.02, 0.02, 0.9, 5]}`, () => new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5)), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2) })); shaft.rotation.x = Math.PI / 2; const head = new THREE.Mesh(sgeo(`Cone|${[0.07, 0.2, 4]}`, () => new THREE.ConeGeometry(0.07, 0.2, 4)), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4) })); head.rotation.x = Math.PI / 2; head.position.z = 0.5; g.add(shaft, head); const tr = new THREE.Sprite(spriteMat(col.getHex(), 0.5)); tr.scale.set(0.5, 0.5, 1); tr.position.z = -0.3; g.add(tr); }
      else { const orb = new THREE.Mesh(sgeo(`Sphere|${[heavy ? 0.3 : 0.2, 14, 10]}`, () => new THREE.SphereGeometry(heavy ? 0.3 : 0.2, 14, 10)), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2) })); const halo = new THREE.Sprite(spriteMat(col.getHex(), 0.75)); halo.scale.setScalar(heavy ? 1.8 : 1.2); g.add(orb, halo); }
      g.position.copy(me).setY(1.15).addScaledVector(d, 0.9); add(g); g.lookAt(root.localToWorld(g.position.clone().add(d))); // lookAt wants world space
      bolts.push({ g, v: d.multiplyScalar(kind === 2 ? 24 : kind === 3 ? 30 : 13), life: kind === 3 ? 0.7 : kind === 2 ? 0.6 : 1.3, t: 0, kind, dmg, col, pierce: kind === 3 ? 3 : 1, hit: new Set(), splash: kind === 4 ? (heavy ? 3.2 : 2.2) : 0, target: kind === 4 ? target : null });
      if (kind === 2) flash(me.clone().setY(1.15).addScaledVector(d, 1.0), col.getHex(), 1.2, 0.12);
    });
    if (kind === 2 && heavy) [0, 90, 180].forEach((ms) => fire(0, ms));
    else if (kind === 3 && heavy) [-0.2, 0, 0.2].forEach((a) => fire(a, 0));
    else fire(0, 0);
    return true;
  }
  function tickBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.t += dt;
      if (b.kind === 4) { // the orb turns toward its scammer (or the nearest one)
        if (!b.target || b.target.dead) { let bd = 16; b.target = null; for (const m of mobs) { if (m.dead) continue; const d = m.g.position.distanceTo(b.g.position); if (d < bd) { bd = d; b.target = m; } } }
        if (b.target) { const want = tmp.copy(b.target.g.position).setY(b.target.y + 0.5).sub(b.g.position).normalize().multiplyScalar(b.v.length()); b.v.lerp(want, Math.min(1, dt * 5)); }
      }
      const p0 = tmp2.copy(b.g.position); const ax = p0.x, az = p0.z; // where it was: hits are checked along the whole step, so a fast shot can't skip a scammer
      b.g.position.addScaledVector(b.v, dt); b.g.lookAt(root.localToWorld(tmp2.copy(b.g.position).add(b.v)));
      const bx = b.g.position.x - ax, bz = b.g.position.z - az, bl = bx * bx + bz * bz || 1;
      let end = b.t > b.life;
      for (const m of mobs) {
        if (m.dead || b.hit.has(m)) continue;
        const rad = m.rank === "boss" ? 2.6 : 1.0;
        const u = Math.max(0, Math.min(1, ((m.g.position.x - ax) * bx + (m.g.position.z - az) * bz) / bl));
        if (Math.hypot(m.g.position.x - ax - bx * u, m.g.position.z - az - bz * u) < rad && Math.abs(b.g.position.y - (m.y + 0.5)) < (m.rank === "boss" ? 4 : 1.8)) {
          const c = critRoll(); hit(m, b.dmg * (c ? critX() : 1), me, "melee", c); b.hit.add(m);
          puff(b.g.position, b.col.getHex(), { n: 6, speed: 3, size: 0.35, life: 0.35, grav: 1 });
          if (b.hit.size >= b.pierce) { end = true; break; }
        }
      }
      if (end) {
        if (b.splash) { for (const m of mobs) if (!m.dead && !b.hit.has(m) && m.g.position.distanceTo(tmp.copy(b.g.position).setY(m.g.position.y)) < b.splash) hit(m, b.dmg * 0.5, b.g.position, "melee"); ring(b.g.position.clone().setY(0), b.col.getHex(), { r0: 0.3, r1: b.splash, life: 0.35, y: 0.1 }); if (VX) VX.impact(b.g.position.clone(), "shock", { big: b.splash / 2.6 }); }
        else flash(b.g.position, b.col.getHex(), 1.4, 0.15);
        root.remove(b.g); b.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); bolts.splice(i, 1);
      }
    }
  }
  function tickShots(dt) {
    tickBolts(dt);
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.t += dt; s.o.position.addScaledVector(s.v, dt); s.o.rotation.x += dt * 8; s.o.rotation.y += dt * 6;
      s.trail -= dt;
      if (s.trail <= 0 && !ctx.reduce) { s.trail = 0.025; puff(s.o.position, s.kind === "ice" ? 0x8fe6ff : 0xff7a2a, { n: s.kind === "fire" ? 3 : 2, speed: 0.8, size: s.kind === "fire" ? 0.95 : 0.5, life: s.kind === "fire" ? 0.5 : 0.45, grav: s.kind === "fire" ? -2 : 1, up: 0.3 }); if (s.kind === "fire") puff(s.o.position, 0xffe08a, { n: 1, speed: 0.4, size: 0.5, life: 0.25, grav: 0 }); }
      if (s.kind === "meteor") {
        if (s.trail <= 0.02) puff(s.o.position, 0xff7a2a, { n: 4, speed: 1, size: 1.4, life: 0.6, grav: -1 });
        if (s.t < s.life) continue;
        const p = s.at.clone();
        for (const m of mobs) if (!m.dead && m.g.position.distanceTo(tmp.copy(p).setY(m.g.position.y)) < (m.rank === "boss" ? 6.5 : 4.5) * (s.big || 1)) { const c = critRoll(); hit(m, s.dmg * (c ? critX() : 1), p, "meteor", c); }
        if (VX) { VX.impact(p.clone().setY(0.8), "meteor", { big: s.big || 1 }); if (VX.boom) VX.boom(fxV.copy(p).setY(1.6), "meteor", { size: 6.5 * (s.big || 1), life: 0.85 }); }
        flash(p.clone().setY(1), 0xffb060, 8, 0.45); ring(p, 0xff7a2a, { r0: 0.6, r1: 6.5 * (s.big || 1), life: 0.6, y: 0.15 }); ring(p, 0xffd27a, { r0: 0.3, r1: 4, life: 0.45, y: 0.3 });
        puff(p.clone().setY(0.8), 0xff7a2a, { n: 34, speed: 9, size: 0.9, life: 0.8, grav: -1 }); puff(p.clone().setY(0.6), 0x55504a, { n: 16, speed: 2.5, size: 1.6, life: 1.4, grav: -1.2 });
        shards(p.clone().setY(0.5), 0x8a4a32, 18, 9); ctx.shake(0.45); if (ctx.wave) ctx.wave(p, 1.3 * (s.big || 1)); if (ctx.parts) ctx.parts.sparks(p.clone().setY(0.6), 0xff7a2a, 30); scorch(p, 3.6 * (s.big || 1), 0x1a0c06);
        root.remove(s.o); s.o.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); shots.splice(i, 1);
        continue;
      }
      let target = null;
      for (const m of mobs) { const rad = m.rank === "boss" ? 2.6 : 1.0; if (!m.dead && m.g.position.distanceTo(tmp.copy(s.o.position).setY(m.g.position.y)) < rad && Math.abs(s.o.position.y - (m.y + 0.4)) < (m.rank === "boss" ? 4 : 1.6)) { target = m; break; } }
      if (target || s.t > s.life || s.o.position.y < 0.1) {
        const p = s.o.position.clone(), c = critRoll();
        if (s.kind === "ice") {
          if (target) hit(target, s.dmg * (c ? critX() : 1), me, "ice", c);
          shards(p, 0xbff0ff, 14, 6); ring(p, 0x8fe6ff, { r0: 0.3, r1: 2.2, life: 0.4 }); flash(p, 0xcff6ff, 2.2, 0.2); if (VX) { VX.impact(p, "ice"); if (VX.boom) VX.boom(p, "ice", { size: 2.4, life: 0.45 }); }
        } else {
          if (target) hit(target, s.dmg * (c ? critX() : 1), me, "fire", c);
          for (const m of mobs) if (m !== target && !m.dead && m.g.position.distanceTo(p) < (s.wide ? 4.5 : 3)) hit(m, s.dmg * (s.wide ? 0.8 : 0.6), p, "fire");
          if (s.wide) { ring(p, 0xffd27a, { r0: 0.6, r1: 4.8, life: 0.5 }); groundFire(p); }
          if (VX) { VX.impact(p, "fire", { big: s.wide ? 1.5 : 1 }); if (VX.boom) VX.boom(p, "fire", { size: s.wide ? 4.6 : 3.4, life: 0.65 }); }
          flash(p, 0xffb060, 4.2, 0.3); puff(p, 0xff7a2a, { n: 18, speed: 6, size: 0.6, life: 0.6, grav: -1 }); puff(p, 0x55504a, { n: 8, speed: 1.5, size: 1.1, life: 1.1, grav: -1.5 }); ring(p, 0xff9a4a, { r0: 0.4, r1: 3.2, life: 0.45 });
          ctx.shake(0.14);
        }
        root.remove(s.o); s.o.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); shots.splice(i, 1);
      }
    }
  }

  // ---------------- street items ----------------
  const pickW = ITEMS.reduce((a, b) => a + b.w, 0);
  const coinTex = new THREE.TextureLoader().load("/images/arcl2-128.png"); coinTex.colorSpace = THREE.SRGBColorSpace;
  // a street item that's picked up or left behind frees its shapes and materials (they used to pile up over a long hunt)
  const freeItem = (g) => g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  function itemMesh(it) {
    const g = new THREE.Group(), c = it.color;
    const glowM = (k = 1.2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.3, metalness: 0.3 });
    if (it.id === "coin") g.add(token3d(0xffb83d, coinTex)); // world-gear3d.js
    else if (it.id === "boots") { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.5), glowM(0.6)); b.position.set(-0.2, 0, 0); const b2 = b.clone(); b2.position.x = 0.2; const w = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 3), glowM(1.4)); w.rotation.z = Math.PI / 2; w.position.set(-0.45, 0.12, -0.1); const w2 = w.clone(); w2.position.x = 0.45; w2.rotation.z = -Math.PI / 2; g.add(b, b2, w, w2); }
    else if (it.id === "spring") { const s = new THREE.Mesh(new THREE.TorusKnotGeometry(0.22, 0.05, 64, 8, 1, 6), glowM(1)); s.scale.set(1, 1.8, 1); g.add(s); }
    else if (it.id === "star") g.add(token3d(0x38c8ff, null, true));
    else if (it.id === "potion") g.add(potion3d(0xff4d6d, "heart")); // world-gear3d.js
    else if (it.id === "mana") g.add(potion3d(0x6f8cff, "bolt"));
    else if (it.id === "shield") { const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.05 })); const r = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 8, 32), glowM(1.5)); g.add(m, r); }
    else { const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 10, 24, Math.PI), glowM(0.9)); m.rotation.z = Math.PI; const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.8, roughness: 0.2 })); t1.position.set(-0.3, 0.1, 0); const t2 = t1.clone(); t2.position.x = 0.3; g.add(m, t1, t2); }
    const halo = new THREE.Sprite(spriteMat(c, 0.55)); halo.scale.setScalar(1.6); g.add(halo);
    const base = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 32), additive(c, 0.6)); base.rotation.x = -Math.PI / 2; base.position.y = -0.95; g.add(base);
    return g;
  }
  function spawnItem() {
    ctx.here(me);
    let r = Math.random() * pickW, it = ITEMS[0]; for (const x of ITEMS) { if ((r -= x.w) < 0) { it = x; break; } }
    const a = Math.random() * TAU, d = 7 + Math.random() * 20, p = new V3(me.x + Math.cos(a) * d, 1.0, me.z + Math.sin(a) * d);
    if (Math.hypot(p.x, p.z) < 6 || ctx.blocked(p)) return;
    const g = itemMesh(it); g.position.copy(p); add(g); items.push({ g, it, k: Math.random() * 6 });
  }
  function pick(x) {
    const p = x.g.position.clone(); root.remove(x.g); freeItem(x.g); items.splice(items.indexOf(x), 1);
    if (x.pulled && ctx.onFetch) ctx.onFetch();
    puff(p, x.it.color, { n: 12, speed: 4, size: 0.35, life: 0.6, grav: 2 }); ring(p, x.it.color, { r0: 0.2, r1: 1.8, life: 0.35, y: 0.1 });
    if (VX) { VX.collect(p, x.it.color); if (x.it.secs && x.it.id !== "shield") VX.buff(x.it.color); }
    Snd.coin && Snd.coin();
    const name = T(x.it.name);
    switch (x.it.id) {
      case "coin": ctx.claim("pickup", {}, ctx.screenOf(p)); break;
      case "star": ctx.gain(15, name); break;
      case "mana": Object.keys(cd).forEach((k) => (cd[k] = 0)); sp = maxSp(); paintVit(); ctx.float(T("SP full · skills ready"), p, "#d8c4ff"); break;
      case "potion": { const h = Math.round(maxHp() * 0.3); hp = Math.min(maxHp(), hp + h); paintVit(); ctx.float("+" + h + " HP", p, "#ff8fa0"); break; }
      default: buffs[x.it.id] = x.it.secs; ctx.float(T("{x}: {n}s", { x: name, n: x.it.secs }), p, "#" + new THREE.Color(x.it.color).getHexString());
    }
    paintBuffs();
  }
  function tickItems(dt, t) {
    ctx.here(me); const petPull = ctx.petPull ? ctx.petPull() : 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const x = items[i]; x.g.rotation.y += dt * 1.8; x.g.position.y = 1.0 + Math.sin(t * 2.4 + x.k) * 0.15;
      const d = Math.hypot(x.g.position.x - me.x, x.g.position.z - me.z);
      if (d > 50) { root.remove(x.g); freeItem(x.g); items.splice(i, 1); continue; }
      if ((buffs.magnet > 0 && d < 9) || (petPull && d < petPull)) { if (!(buffs.magnet > 0 && d < 9)) x.pulled = true; tmp.set(me.x - x.g.position.x, 0, me.z - x.g.position.z).normalize(); x.g.position.addScaledVector(tmp, dt * 9); }
      if (d < 2.6 && !(buffs.magnet > 0) && ctx.hopY() < 2.6) { x.fly = (x.fly || 0) + dt * 3; tmp.set(me.x - x.g.position.x, 0, me.z - x.g.position.z).normalize(); x.g.position.addScaledVector(tmp, dt * (4 + x.fly * 12)); x.g.position.y += Math.sin(Math.min(1, x.fly) * Math.PI) * 0.9; x.g.scale.setScalar(1 + Math.min(1, x.fly) * 0.25); }
      if (d < 1.3 && ctx.hopY() < 2.6) pick(x);
    }
  }
  function drink(kind) {
    if (!ctx.active() && !(ctx.inHub() && !down)) return false;
    if (kind === "hp" ? hp >= maxHp() : sp >= maxSp()) { ctx.toast(kind === "hp" ? T("HP is already full") : T("SP is already full")); return false; }
    if (!rpg.usePotion(kind)) return false;
    ctx.here(me);
    if (kind === "hp") { const h = Math.round(maxHp() * 0.4); hp = Math.min(maxHp(), hp + h); ctx.float("+" + h + " HP", me.clone().setY(2.6), "#ff8fa0"); puff(me.clone().setY(1), 0xff5f73, { n: 14, speed: 2, size: 0.4, life: 0.8, grav: -2 }); }
    else { const h = Math.round(maxSp() * 0.4); sp = Math.min(maxSp(), sp + h); ctx.float("+" + h + " SP", me.clone().setY(2.6), "#8fd8ff"); puff(me.clone().setY(1), 0x4fa8ff, { n: 14, speed: 2, size: 0.4, life: 0.8, grav: -2 }); }
    Snd.pop && Snd.pop(); paintVit(); paintPots(); return true;
  }

  // ---------------- HUD: attack, dodge, skills, potions, cooldowns, buffs ----------------
  const bar = document.createElement("div"); bar.className = "wc-bar" + (ctx.coarse ? " coarse" : ""); bar.id = "wc-bar"; bar.setAttribute("data-no-i18n", "");
  const ICON = {
    attack: '<svg viewBox="0 0 24 24"><path d="M14.5 3.5 20.5 3.5 20.5 9.5 9 21 3 15z"/><path d="M5 13l6 6M3 21l3-3"/></svg>',
    ice: '<svg viewBox="0 0 24 24"><path d="M12 2v20M4 6.5l16 11M20 6.5 4 17.5"/><path d="M9 3.5 12 6l3-2.5M9 20.5 12 18l3 2.5"/></svg>',
    fire: '<svg viewBox="0 0 24 24"><path d="M12 22c4.4 0 7-2.9 7-6.8 0-3.8-2.8-6.3-4.2-9.7-.4 2.4-1.6 3.6-2.8 4.3.2-3.5-1.6-6.4-4.4-7.8.4 3.3-2.6 6-2.6 10.8C5 19.1 7.6 22 12 22z"/></svg>',
    shock: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    meteor: '<svg viewBox="0 0 24 24"><circle cx="15" cy="15" r="5"/><path d="M11 11 4 4M13 9 9 3M9 13 3 9"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    hp: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v4L6 13a6 6 0 0 0 12 0l-4-6V3"/></svg>',
    dodge: '<svg viewBox="0 0 24 24"><path d="M3 8h8M2 12h9M3 16h8"/><path d="M14 5l6 7-6 7"/></svg>',
  };
  bar.innerHTML = `<div class="wc-buffs" id="wc-buffs"></div>
    <div class="wc-pots"><button type="button" class="wc-pot hp" data-skill="pot-hp" aria-label="${T("Health potion")}">${ICON.hp}<b class="wc-key">4</b><em id="wc-pot-hp">0</em></button><button type="button" class="wc-forgechip" data-skill="forge" hidden>${T("Forge")}</button><button type="button" class="wc-pot sp" data-skill="pot-sp" aria-label="${T("Mana potion")}">${ICON.hp}<b class="wc-key">5</b><em id="wc-pot-sp">0</em></button></div>
    <button type="button" class="wc-skill wc-slot" data-skill="slot"><i></i><em class="wc-cd"></em><b class="wc-key">Z</b><small class="wc-lock"></small><small class="wc-slv"></small><span class="wc-swap" data-swap hidden aria-label="${T("Change skill")}"><svg viewBox="0 0 24 24"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg></span></button>
    <button type="button" class="wc-lockon" data-skill="lockon" aria-label="${T("Lock on")}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg><b class="wc-key">Tab</b></button>
    <button type="button" class="wc-attack" data-skill="attack" aria-label="${T("Attack")}"><i>${ICON.attack}</i><em class="wc-cd"></em><b class="wc-key">J</b><span class="wc-combo" id="wc-combo"></span></button>
    <button type="button" class="wc-dodge" data-skill="dodge" aria-label="${T("Dodge")}"><svg class="wc-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" pathLength="100"/></svg><i>${ICON.dodge}</i><b class="wc-key">K</b></button>
    <div class="wc-pick" id="wc-pick" hidden role="menu"></div>`;
  document.body.appendChild(bar);
  const lockBtn = bar.querySelector(".wc-lockon");
  // the one skill slot: the skill set there (or the newest learned), locked until level 10
  const learned = () => SKILLS.filter((x) => unlocked(x));
  const slotSkill = () => { const l = learned(); if (!l.length) return null; const want = (rpg.data() || {}).sk; return l.find((x) => x.id === want) || l[l.length - 1]; };
  const slotBtn = bar.querySelector('[data-skill="slot"]'), picker = bar.querySelector("#wc-pick");
  function setSlot(id) { const s = SKILLS.find((x) => x.id === id); if (!s || !unlocked(s)) return; rpg.setSkill(id); paintSkills(); paintCd(); ctx.toast(T("Skill slot: {x}", { x: T(s.name) })); }
  function nextSkill() { const l = learned(); if (l.length < 2) return false; const cur = slotSkill(); setSlot(l[(l.indexOf(cur) + 1) % l.length].id); return true; }
  function openPick() {
    const cur = slotSkill();
    picker.innerHTML = `<p>${T("Skill slot")}</p>` + SKILLS.map((x) => { const ok = unlocked(x); return `<button type="button" role="menuitemradio" class="wc-pi wc-${x.id}${ok ? "" : " off"}" data-pick="${x.id}" aria-checked="${cur && cur.id === x.id}" ${ok ? "" : "disabled"}><i>${ICON[x.id]}</i><span><b>${ctx.esc(T(x.name))}</b><small>${ok ? T("{n} SP", { n: x.sp }) : T("Level {n}", { n: x.lv })}</small></span></button>`; }).join("");
    picker.hidden = false;
  }
  const closePick = () => { picker.hidden = true; };
  let holdT = 0, held = false;
  bar.addEventListener("pointerdown", (e) => {
    const pk = e.target.closest("[data-pick]"); if (pk) { e.preventDefault(); e.stopPropagation(); setSlot(pk.dataset.pick); closePick(); return; }
    const b = e.target.closest("[data-skill]"); if (!b) return; e.preventDefault(); e.stopPropagation();
    const id = b.dataset.skill;
    if (id === "slot") {
      if (e.target.closest("[data-swap]") || !slotSkill()) { if (!slotSkill()) ctx.toast(T("Your first skill opens at level 10")); else (picker.hidden ? openPick() : closePick()); return; }
      held = false; clearTimeout(holdT); holdT = setTimeout(() => { held = true; if (learned().length > 1) openPick(); }, 450);
      return;
    }
    closePick();
    if (id === "lockon") { lockOn(); return; }
    if (id === "forge") { rpg.forgeTab("supplies"); rpg.show("forge"); return; } // out of health potions at low HP: straight to the Forge's supplies
    if (id === "dodge") dodge();
    else if (id === "attack" && ctx.alt && ctx.alt("attack")) { /* another world's action (world-play: Jurassic World) */ }
    else if (id === "attack") { attack(); chargeStart(); try { b.setPointerCapture(e.pointerId); } catch { /* not capturable */ } } else if (id === "pot-hp") drink("hp"); else if (id === "pot-sp") drink("sp");
    b.classList.remove("press"); requestAnimationFrame(() => b.classList.add("press")); // b413: no forced layout on every tap
  });
  slotBtn.addEventListener("pointerup", (e) => {
    clearTimeout(holdT); if (held || !slotSkill() || e.target.closest("[data-swap]")) return;
    closePick(); const s = slotSkill(); cast(s.id); slotBtn.classList.remove("press"); requestAnimationFrame(() => slotBtn.classList.add("press"));
  });
  slotBtn.addEventListener("pointercancel", () => clearTimeout(holdT));
  const atkBtn = bar.querySelector('[data-skill="attack"]'); // holding the attack button charges it; letting go fires
  atkBtn.addEventListener("pointerup", () => chargeEnd()); atkBtn.addEventListener("pointercancel", () => chargeEnd(false)); atkBtn.addEventListener("lostpointercapture", () => chargeEnd());
  atkBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  slotBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  function paintSkills() {
    const s = slotSkill(), n = learned().length;
    slotBtn.className = "wc-skill wc-slot" + (s ? " wc-" + s.id : " locked");
    slotBtn.querySelector("i").innerHTML = s ? ICON[s.id] : ICON.lock;
    slotBtn.querySelector(".wc-lock").textContent = s ? "" : "🔒 " + T("Lv {n}", { n: SKILLS[0].lv }); // (b-st1: a lock, so it doesn't read as your level)
    slotBtn.querySelector(".wc-slv").textContent = s ? "★".repeat(skillLevel(ctx.level(), s.lv)) : "";
    slotBtn.querySelector("[data-swap]").hidden = n < 2;
    slotBtn.setAttribute("aria-label", s ? `${T(s.name)} (Z)` : T("Your first skill opens at level 10"));
    slotBtn.title = s ? `${T(s.name)} (Z) · ${T("Skill level {n}", { n: skillLevel(ctx.level(), s.lv) })}${n > 1 ? " · " + T("Q or a long press changes it") : ""}` : T("Your first skill opens at level 10");
  }
  // potions can come from anywhere (the Forge, a daily hunt, the season road, a drop): the buttons follow, and pop when they go up
  let potsSeen = null;
  function potsCheck() { const p = rpg.potions(); if (potsSeen && (p.hp !== potsSeen.hp || p.sp !== potsSeen.sp)) { paintPots(); [["hp", "pot-hp"], ["sp", "pot-sp"]].forEach(([k, id]) => { if (p[k] > potsSeen[k]) { const b = bar.querySelector(`[data-skill="${id}"]`); b.classList.remove("got"); void b.offsetWidth; b.classList.add("got"); } }); } potsSeen = { hp: p.hp, sp: p.sp }; }
  function paintPots() { const p = rpg.potions(); bar.querySelector("#wc-pot-hp").textContent = p.hp; bar.querySelector("#wc-pot-sp").textContent = p.sp; bar.querySelector('[data-skill="pot-hp"]').classList.toggle("empty", !p.hp); bar.querySelector('[data-skill="pot-sp"]').classList.toggle("empty", !p.sp); nudge(); }
  // low HP (under 30%): the health potion pulses, or, with none left, a small "Forge" chip offers more. Touched only
  // when the state flips (paintVit runs on every HP change)
  const potHp = bar.querySelector('[data-skill="pot-hp"]'), forgeChip = bar.querySelector(".wc-forgechip"); let nudgeOn = "";
  function nudge() {
    const low = !down && hp / maxHp() < 0.3, n = low ? (rpg.potions().hp > 0 ? "pot" : "forge") : "";
    if (n === nudgeOn) return; nudgeOn = n; potHp.classList.toggle("nudge", n === "pot"); forgeChip.hidden = n !== "forge";
  }
  const CDT = { attack: 0.5, dodge: 1.1 };
  function paintCd() {
    const sl = slotSkill();
    for (const [id, left] of Object.entries(cd)) {
      const b = id === "attack" ? bar.querySelector('[data-skill="attack"]') : sl && sl.id === id ? slotBtn : null; if (!b) continue;
      const total = CDT[id] || SKILLS.find((s) => s.id === id).cd;
      b.style.setProperty("--cd", String(Math.max(0, Math.min(1, left / total))));
      b.classList.toggle("cooling", left > 0);
    }
    const c = bar.querySelector("#wc-combo"); if (c) { c.textContent = comboT > 0 && combo > 1 ? `x${combo}` : ""; }
    // the dodge's ring refills as its cooldown runs out (in 24 steps, so the style isn't written every frame)
    const q = Math.ceil((cd.dodge / CDT.dodge) * 24);
    if (q !== dodgeQ) { dodgeQ = q; dodgeRing.style.strokeDashoffset = String((q / 24) * 100); dodgeBtn.classList.toggle("cooling", q > 0); }
  }
  const dodgeBtn = bar.querySelector(".wc-dodge"), dodgeRing = dodgeBtn.querySelector("circle"); let dodgeQ = -1;
  function paintBuffs() {
    const el = bar.querySelector("#wc-buffs");
    el.innerHTML = Object.entries(buffs).filter(([, s]) => s > 0).map(([id, s]) => { const it = ITEMS.find((x) => x.id === id); return `<span style="--c:#${new THREE.Color(it.color).getHexString()}">${T(it.name)} <b>${Math.ceil(s)}</b></span>`; }).join("");
  }
  paintSkills(); paintPots();

  // ---------------- HP, SP and XP: always on screen in the streets ----------------
  const vit = document.createElement("div"); vit.className = "wc-vit"; vit.id = "wc-vit"; vit.setAttribute("data-no-i18n", "");
  vit.innerHTML = `<div class="wc-face" aria-hidden="true"><img id="wc-face-img" alt=""><b id="wc-face-lv"></b></div><div class="wc-v hp"><span>HP</span><i><b id="wc-hp-b"></b><u id="wc-hp-g"></u></i><em id="wc-hp-n"></em></div><div class="wc-v sp"><span>SP</span><i><b id="wc-sp-b"></b></i><em id="wc-sp-n"></em></div><div class="wc-v xp"><span>XP</span><i><b id="wc-xp-b"></b></i><em id="wc-xp-n"></em></div>`;
  (document.querySelector(".wp-hud-l") || document.body).insertBefore(vit, document.getElementById("wp-quests"));
  let ghostHp = hp;
  // the bar nodes, found once (paintVit runs on every hit and regen step); text is only written when it changes
  const vq = (id) => vit.querySelector("#" + id), VB = { hpB: vq("wc-hp-b"), spB: vq("wc-sp-b"), hpG: vq("wc-hp-g"), hpN: vq("wc-hp-n"), spN: vq("wc-sp-n"), xpB: vq("wc-xp-b"), xpN: vq("wc-xp-n") };
  const setTx = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  function paintVit() {
    const mh = maxHp(), ms = maxSp(); hp = Math.min(hp, mh); sp = Math.min(sp, ms);
    VB.hpB.style.width = (100 * hp / mh) + "%"; VB.spB.style.width = (100 * sp / ms) + "%";
    VB.hpG.style.width = (100 * Math.max(hp, ghostHp) / mh) + "%";
    setTx(VB.hpN, `${Math.ceil(hp)} / ${mh}`); setTx(VB.spN, `${Math.floor(sp)} / ${ms}`);
    const q = ctx.xpProg ? ctx.xpProg() : { into: (ctx.xp ? ctx.xp() : 0) % 100, need: 100 }; VB.xpB.style.width = Math.min(100, (100 * q.into) / q.need).toFixed(1) + "%"; setTx(VB.xpN, `${q.into.toLocaleString("en-US")} / ${q.need.toLocaleString("en-US")}`);
    vit.classList.toggle("danger", hp / mh < 0.3); nudge(); document.body.classList.toggle("wc-low", hp / mh < 0.3 && !down && ctx.inHub());
  }
  function damage(n) {
    if (resting() || down) return;
    if (stats().dr) n = Math.max(1, Math.round(n * (1 - Math.min(50, stats().dr) / 100))); // damage reduction (the Crimson Celestial set), at most half
    ghostHp = Math.max(ghostHp, hp); hp = Math.max(0, hp - n); calmT = 4; paintVit();
    if (rpg.wear) rpg.wear("hurt"); // worn armor, helmet, shield and boots wear out, 1 per 3 s of taking damage
    vit.classList.remove("hit"); requestAnimationFrame(() => vit.classList.add("hit"));
    ctx.float("-" + n, tmp2.copy(me).setY(2.6), "#ff5f73", n > maxHp() * 0.2);
    ctx.buzz && ctx.buzz(n > maxHp() * 0.2 ? 60 : 25);
    if (hp <= 0) goDown();
  }
  const dead = document.createElement("div"); dead.className = "wc-dead"; dead.id = "wc-dead"; dead.hidden = true; dead.setAttribute("role", "alertdialog"); dead.setAttribute("aria-modal", "true"); dead.setAttribute("data-no-i18n", "");
  document.body.appendChild(dead);
  let paying = false, restPaint = 0;
  // what to try next time, from what just happened
  function tipAfterKO() {
    ctx.here(me); const pots = rpg.potions(), z = zoneAt(me.x, me.z) || zone, lv = ctx.level(), st = stats(), eqN = Object.values(rpg.data().eq || {}).filter(Boolean).length;
    const tip = z && lv < z.lv[0] ? T("Tip: {x} is for level {n}+. Hunt in an easier ground first.", { x: z.name, n: z.lv[0] })
      : !pots.hp ? T("Tip: carry health potions (4). The Forge sells five for 30 ARCL.")
      : eqN < 4 ? T("Tip: you wear {n} of 7 gear pieces. Fill the empty slots (I) or buy some at the Forge.", { n: eqN })
      : st.def < lv * 2 ? T("Tip: your Defense is low for your level. Enhance your armor and helmet with scrap.")
      : T("Tip: watch the red ring before a boss slams, and step out of it.");
    return ctx.esc(tip);
  }
  // Knocked out: the first time each day (Seoul time) you get up for free, here or on the plaza. After that there are two
  // choices, side by side and with no clock on them: revive here for 10,000 $ARCIRCLE (your own transfer; half is
  // burned), or rest for 24 hours (back on the plaza; no fighting and no hunting rewards until it ends). Signed in, the
  // server keeps the count (api/_world-shop.mjs knockout); a guest's count stays in this browser.
  const KO_LOCAL = "arc.world.ko", seoulDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const koLocal = () => { try { const k = JSON.parse(localStorage.getItem(KO_LOCAL) || "{}"); return { used: k.day === seoulDay() ? k.used || 0 : 0, until: Number(k.until) || 0, down: !!k.down }; } catch { return { used: 0, until: 0, down: false }; } };
  const koLocalSet = (k) => { try { localStorage.setItem(KO_LOCAL, JSON.stringify({ day: seoulDay(), ...k })); } catch { /* private mode */ } };
  let restUntil = 0, koFree = false, restEl = null;
  const resting = () => restUntil > Date.now();
  const left = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? T("{h} h {m} min", { h, m }) : T("{m} min", { m: Math.max(1, m) }); };
  // who knocked you out (ctx.koWhy: Jurassic World says a dinosaur, and you respawn at its gate, not the plaza)
  const koHead = () => (ctx.koWhy && ctx.koWhy() === "dino" ? T("Knocked out!") : T("You got scammed!"));
  const koLine = () => { if (!(ctx.koWhy && ctx.koWhy() === "dino")) return T("The street scammers knocked you out."); const by = ctx.koBy ? ctx.koBy() : ""; return by ? T("A {d} knocked you out.", { d: by }) : T("A dinosaur knocked you out."); }; // (which one, when Jurassic World knows: b-jx6)
  const koBack = () => (ctx.koWhy && ctx.koWhy() === "dino" ? T("Respawn at the gate") : T("Respawn on the plaza"));
  function koCard(k) {
    koFree = !!k.free;
    if (k.free) {
      dead.innerHTML = `<div class="wc-dead-card"><h2>${koHead()}</h2><p>${koLine()}</p>
        <button type="button" class="wc-revive free" id="wc-revive"><img src="/images/brand/mark-sm-v2.png" alt="" width="28" height="19"><span><b>${T("Revive here")}</b><small>${T("Free: today's one free revive")}</small></span></button>
        <button type="button" class="wc-respawn" id="wc-respawn"><b>${koBack()}</b><small>${T("free")}</small></button>
        <p class="wc-dead-tip">${tipAfterKO()}</p>
        <p class="wc-dead-note" id="wc-dead-note">${T("After this one, a knockout today means a revive for 10,000 $ARCIRCLE or a 24-hour rest.")}</p></div>`;
    } else {
      dead.innerHTML = `<div class="wc-dead-card"><h2>${koHead()}</h2><p>${T("Today's free revive is used. Pick either one:")}</p>
        <button type="button" class="wc-revive paid" id="wc-revive"${ctx.signedIn && !ctx.signedIn() ? " disabled" : ""}><img src="/images/brand/mark-sm-v2.png" alt="" width="28" height="19"><span><b>${T("Revive here")}</b><small>${T("10,000 $ARCIRCLE · half is burned, half goes to the treasury")}</small></span></button>
        <button type="button" class="wc-respawn" id="wc-rest"><b>${T("Rest for 24 hours")}</b><small>${T("Back on the plaza. You can walk, build and shop, but not fight, until it ends")}</small></button>
        <p class="wc-dead-tip">${tipAfterKO()}</p>
        <p class="wc-dead-note" id="wc-dead-note">${ctx.signedIn && !ctx.signedIn() ? T("Sign in with your wallet to revive with $ARCIRCLE.") : T("Reviving sends $ARCIRCLE from your own wallet; you confirm it there.")}</p></div>`;
    }
  }
  async function goDown() {
    if (down) return; down = true; ctx.down(true); document.body.classList.remove("wc-low"); nudge();
    if (ctx.softKO && ctx.softKO()) { dead.hidden = true; return; } // a run of its own (RAID QUEENS): its own result card, no town KO card and no revive used; softUp() gets you up
    for (const m of mobs) if (!m.dead && m.rank !== "boss") { m.dead = 0.001; puff(m.g.position.clone().setY(0.6), 0xff4d6d, { n: 8, speed: 3, size: 0.5, life: 0.6, grav: -1 }); }
    dead.innerHTML = `<div class="wc-dead-card"><h2>${koHead()}</h2><p>${koLine()}</p></div>`;
    const shown = new Promise((r) => setTimeout(() => { dead.hidden = false; r(); }, 900));
    let k = ctx.ko ? await ctx.ko("down") : null;
    if (!k) { const l = koLocal(); k = l.used < 1 ? { free: true } : { free: false }; koLocalSet(k.free ? { used: l.used + 1, until: 0, down: false } : { used: l.used, until: 0, down: true }); }
    await shown; if (down) koCard(k);
  }
  function getUp(where) {
    down = false; paying = false; dead.hidden = true; hp = maxHp(); sp = maxSp(); ghostHp = hp; guardT = 3; paintVit(); ctx.down(false, where);
    if (where === "plaza") { hideBossBar(); for (const m of mobs) if (m.rank === "boss") { root.remove(m.g); } for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].rank === "boss") mobs.splice(i, 1); }
    ctx.here(me); ring(me, 0x39ff88, { r0: 0.4, r1: 3.4, life: 0.6, y: 0.15 }); puff(me.clone().setY(1.2), 0x39ff88, { n: 18, speed: 4, size: 0.35, life: 0.8, grav: -1 });
    if (!ctx.reduce) pillar(me, where === "here" ? 0x39ff88 : 0x8fe6ff, 12, 1.2, 0.9); // back on your feet: a column of light
  }
  // resting: a small chip by the HP bars with the time left; tapping it offers the revive again (never on its own)
  function setRest(until) {
    restUntil = until || 0; const l = koLocal(); if (!ctx.signedIn || !ctx.signedIn()) koLocalSet({ used: l.used, until: restUntil, down: false });
    if (resting() && !restEl) {
      restEl = document.createElement("button"); restEl.type = "button"; restEl.className = "wc-rest"; restEl.id = "wc-rest-chip"; restEl.setAttribute("data-no-i18n", "");
      restEl.addEventListener("click", () => { if (!resting() || down) return; koFree = false; dead.innerHTML = `<div class="wc-dead-card"><h2>${T("Resting")}</h2><p>${T("You can fight again in {t}.", { t: left(restUntil - Date.now()) })}</p>
        <button type="button" class="wc-revive paid" id="wc-revive"${ctx.signedIn && !ctx.signedIn() ? " disabled" : ""}><img src="/images/brand/mark-sm-v2.png" alt="" width="28" height="19"><span><b>${T("Revive now")}</b><small>${T("10,000 $ARCIRCLE · half is burned, half goes to the treasury")}</small></span></button>
        <button type="button" class="wc-respawn" id="wc-keep"><b>${T("Keep resting")}</b></button>
        <p class="wc-dead-note" id="wc-dead-note">${T("Reviving sends $ARCIRCLE from your own wallet; you confirm it there.")}</p></div>`; dead.hidden = false; });
      vit.after(restEl);
    }
    if (restEl) { restEl.hidden = !resting(); paintRest(); }
    document.body.classList.toggle("wc-resting", resting());
  }
  function paintRest() { if (restEl && resting()) restEl.innerHTML = `<b>${esc0(T("Resting"))}</b> ${esc0(left(restUntil - Date.now()))}`; else if (restEl && !restEl.hidden) setRest(0); }
  const esc0 = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const restNote = () => { ctx.toast(T("You're resting after a knockout: you can fight again in {t}.", { t: left(restUntil - Date.now()) })); };
  dead.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.id === "wc-respawn") { getUp("plaza"); return; }
    if (b.id === "wc-keep") { dead.hidden = true; return; }
    if (b.id === "wc-rest") {
      b.disabled = true; const k = ctx.ko ? await ctx.ko("rest") : null;
      setRest(k && k.until ? k.until : Date.now() + 24 * 3600e3); getUp("plaza"); return;
    }
    if (b.id === "wc-revive" && koFree && down) { getUp("here"); return; }
    if (b.id === "wc-revive" && !paying) {
      paying = true; b.disabled = true;
      const note = dead.querySelector("#wc-dead-note");
      const ok = await ctx.pay("revive", (t) => { note.textContent = t; }).catch(() => false);
      if (ok) { setRest(0); if (down) getUp("here"); else dead.hidden = true; } else { paying = false; b.disabled = false; }
    }
  });
  // on the way in: a rest that's still running, or a knockout left without a choice (a reload brings the choice back)
  setTimeout(async () => {
    let k = ctx.ko ? await ctx.ko("view") : null;
    if (!k) { const l = koLocal(); k = { until: l.until > Date.now() ? l.until : 0, pending: l.down }; }
    if (k.until) setRest(k.until);
    else if (k.pending && !down) { down = true; ctx.down(true); if (k.freeLeft > 0) { const r = ctx.ko ? await ctx.ko("down") : { free: true }; koCard(r || { free: true }); } else koCard({ free: false }); dead.hidden = false; }
  }, 2500);
  paintVit();

  // ---------------- the loop ----------------
  let buffPaint = 0, placeT = 0, zoneT = 0, defOn = false;
  function place() { bar.style.bottom = ""; } // the buttons share one corner layout with the move buttons (arc-v10.css v25)
  function spawnTick(dt) {
    const kit = ctx.kit(); if (!kit || !kit.enemies || !kit.enemies.EyeDrone) return; // the robots are still loading
    ctx.here(me);
    const z = zone;
    if (resting() || defOn) return; // resting after a knockout, or in the AC Defense arena: no scammers come for you
    if (z) {
      const alive = mobs.filter((m) => !m.dead && m.zone === z && m.rank !== "boss").length;
      if ((spawnT -= dt) <= 0) { spawnT = 3 + Math.random() * 3; if (alive < 5) {
        const lv = z.lv[0] + Math.floor(Math.random() * (z.lv[1] - z.lv[0] + 1)), type = z.mobs[Math.floor(Math.random() * z.mobs.length)], rank = Math.random() < (z.elite || 0.12) * (weekEvent() === "elite" ? 2 : 1) ? "elite" : "", rare = !rank && Math.random() < 0.03 * goldenRush();
        const m0 = spawnMob({ type, lv, rank, zone: z, rare });
        // in the far ring the fake airdrops come in threes
        if (m0 && type === "drop" && z.lv[0] >= 30 && !rare && alive <= 2) for (let k = 0; k < 2; k++) { const a = Math.random() * TAU; spawnMob({ type, lv, zone: z, at: m0.g.position.clone().add(new V3(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2)) }); }
      } }
      const next = bossAt()[z.id] || 0;
      if (next && Date.now() >= next && !mobs.some((m) => m.rank === "boss" && !m.dead)) { setBoss(z.id, Date.now() + bossEvery()); spawnMob({ rank: "boss", lv: z.lv[1] + 2, zone: z, boss: z.boss, at: new V3(z.x, 0, z.z) }); }
    } else if (Math.hypot(me.x, me.z) > 16 && !(ctx.inRaid && ctx.inRaid()) && !(ctx.noStreet && ctx.noStreet())) { // (RAID QUEENS' land brings its own)
      if ((spawnT -= dt) <= 0) { spawnT = 22 + Math.random() * 30; if (mobs.filter((m) => !m.dead && !m.zone).length < 3) spawnMob({ lv: 1 + Math.floor(Math.random() * 3) }); }
    }
  }
  function tick(dt, t) {
    const on = ctx.active();
    bar.hidden = !ctx.inHub(); vit.hidden = !ctx.inHub();
    if ((placeT -= dt) <= 0) { placeT = 1; place(); }
    for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);
    if (dodgeBuf && cd.dodge <= 0) { const ok = performance.now() - dodgeBuf < 150; dodgeBuf = 0; if (ok) dodge(); }
    if (atkBuf && cd.attack <= 0) { const ok = performance.now() - atkBuf < 150; atkBuf = 0; if (ok) attack(); }
    comboT = Math.max(0, comboT - dt);
    paintCd();
    let changed = false; for (const k in buffs) { if (buffs[k] > 0) { buffs[k] = Math.max(0, buffs[k] - dt); if (!buffs[k]) changed = true; } }
    if (VX && (buffs.shield > 0) !== shieldShown) { shieldShown = buffs.shield > 0; VX.shield(shieldShown); }
    if ((buffPaint -= dt) <= 0 || changed) { buffPaint = 0.5; paintBuffs(); potsCheck(); }
    if (ghostHp > hp) { ghostHp = Math.max(hp, ghostHp - dt * maxHp() * 0.5); paintVit(); }
    if ((restPaint -= dt) <= 0) { restPaint = 20; if (restEl) paintRest(); }
    else {
      guardT = Math.max(0, guardT - dt); calmT = Math.max(0, calmT - dt);
      // out of a fight with full bars: the vitals panel shrinks to slim bars (phones get their screen back)
      const quiet = calmT <= 0 && hp >= maxHp() - 0.5 && sp >= maxSp() - 0.5 && !mobs.some((m) => !m.dead && m.g.position.distanceTo(me) < 12);
      if (!quiet) quietT = 0; else if (!quietT) quietT = performance.now();
      vit.classList.toggle("calm", !!quietT && performance.now() - quietT > 3000);
      // a fight close by: the side panels step back (the quest list folds to its title) so the fight has the screen
      const fight = mobs.some((m) => !m.dead && m.g.position.distanceTo(me) < 14);
      if (fight !== fightOn) { fightOn = fight; document.body.classList.toggle("wc-fight", fight); if (fight && ctx.hint) setTimeout(() => ctx.hint("charge"), 1500); }
      const mh = maxHp(), ms = maxSp(), h0 = hp, s0 = sp; if (calmT <= 0) hp = Math.min(mh, hp + mh * 0.025 * dt); sp = Math.min(ms, sp + ms * 0.06 * dt);
      if (Math.floor(h0) !== Math.floor(hp) || Math.floor(s0) !== Math.floor(sp)) paintVit();
      if (hp / mh < 0.3 && ctx.inHub()) { heartT -= dt; if (heartT <= 0) { heartT = 0.85; Snd.heart && Snd.heart(); } }
    }
    tickFx(dt); chargeTick(dt);
    if (stopT > 0) { stopT -= dt; return; } // hit-stop: everything in the fight holds still for a beat
    tickShots(dt);
    if (!ctx.inHub()) { root.visible = false; zoneEl.hidden = true; bossEl.hidden = true; edgeEl.hidden = true; return; } // an island or a sheet: the boss bar steps away too
    root.visible = true;
    if ((zoneT -= dt) <= 0) {
      zoneT = 0.5; ctx.here(me); const z = zoneAt(me.x, me.z);
      if (z !== zone) { zone = z; if (z && z !== zoneShown) enterZone(z); zoneShown = z; ctx.onZone && ctx.onZone(z); spawnT = Math.min(spawnT, 2); }
      paintZone(); edgeEl.hidden = true; // no red frame: any ground, any level
      const bm = mobs.find((m) => m.rank === "boss" && !m.dead && Math.hypot(m.g.position.x - me.x, m.g.position.z - me.z) < 120); // (the nearest few hundred metres: Inferno Jack in town isn't shown in a land 2.4 km off)
      if (bm && bossEl.hidden) bossBar(bm); else if (!bm && !bossEl.hidden) hideBossBar();
    }
    tickMobs(dt, t); tickMShots(dt); tickItems(dt, t); tickDrops(dt, t);
    if (!on) return;
    spawnTick(dt);
    if ((itemT -= dt) <= 0) { itemT = 5 + Math.random() * 6; if (items.length < 7) spawnItem(); }
  }
  function keyDown(k, repeat) {
    if (k === "j") { if (repeat) return true; attack(); chargeStart(); return true; } // held: the charge (keyUp lets it go)
    if (k === "k") return dodge() || true;
    if (k === "q") return nextSkill() || true;
    if (k === "tab") { lockOn(); return true; }
    if (k === "4") return drink("hp") || true;
    if (k === "5") return drink("sp") || true;
    if (k === "z") { const s = slotSkill(); if (s) cast(s.id); else ctx.toast(T("Your first skill opens at level 10")); return true; }
    return false;
  }
  function keyUp(k, cancel) { if (k === "j") chargeEnd(!cancel); }
  let lastLv = ctx.level();
  function onLevel(n, before) {
    paintSkills(); hp = maxHp(); sp = maxSp(); ghostHp = hp; paintVit(); paintPots(); ctx.buzz && ctx.buzz([20, 30, 60]);
    ctx.here(me); pillar(me, 0xffb347, 16, 1.6, 1.1); ring(me, 0xffc861, { r0: 0.4, r1: 5, life: 0.9, y: 0.15 }); puff(me.clone().setY(1.2), 0xffe08a, { n: 30, speed: 6, size: 0.4, life: 1.2, grav: -2 });
    if (before) { const now = stats(); [["atk", "Attack"], ["def", "Defense"], ["hp", "Max HP"], ["sp", "Max SP"]].forEach(([k, n], i) => { const d = now[k] - before[k]; if (d > 0) setTimeout(() => ctx.float(`${T(n)} +${d}`, me.clone().setY(2.8 + i * 0.1), "#ffe08a"), 500 + i * 260); }); }
    const s = SKILLS.filter((x) => x.lv > lastLv && x.lv <= n).pop(); lastLv = n;
    if (s) { rpg.setSkill(s.id); paintSkills(); setTimeout(() => { ctx.skillCard ? ctx.skillCard(s) : ctx.toast(T("New skill: {x}! It's in your skill slot (Z).", { x: T(s.name) })); slotBtn.classList.add("learned"); setTimeout(() => slotBtn.classList.remove("learned"), 2600); ring(me, s.color, { r0: 0.4, r1: 4, life: 0.8, y: 0.2 }); }, 1400); }
  }
  // ---- warming up (b413): before a fight, a copy of each scammer is made and readied (its materials, its outline) and
  // drawn once out of sight, with one of each effect, so the first spawn and the first blow don't stop the game to
  // copy a model, compile a shader or send a texture to the GPU. The copies wait in the pool for their first spawn.
  const warmedKeys = new Set(), warmKeep = []; let warming = false, fxWarmed = false;
  function fxSamples() {
    const g = sgeo("Box|warm", () => new THREE.BoxGeometry(0.2, 0.2, 0.2)), out = [];
    const mesh = (mt) => { const m = new THREE.Mesh(g, mt); warmKeep.push(mt); out.push(m); return m; };
    mesh(additive(0xffffff, 0.5)); const dbl = additive(0xffffff, 0.5); dbl.side = THREE.DoubleSide; mesh(dbl);
    const fu = additive(0xffffff, 0.5); fu.map = fadeUp(); mesh(fu);
    mesh(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.2, transparent: true }));
    mesh(new THREE.MeshBasicMaterial({ color: 0xffffff })); mesh(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    mesh(slashMat(0xffffff)); mesh(new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    [shellMat, shellStatueMat, crownMat, crownBossMat, bossHazeMat, ringBoss, ringElite, shadowMat].forEach((mt) => out.push(new THREE.Mesh(g, mt)));
    const sp = new THREE.Sprite(spriteMat(0xffffff, 1)); warmKeep.push(sp.material); out.push(sp);
    const bar = hpBar(1.7); bar.userData.draw(1, "", 1, "#fff", ""); out.push(bar);
    return out;
  }
  async function warm(stage, max = 2) {
    const kit = ctx.kit(); if (warming || !kit || !kit.enemies || !stage || !stage.renderer) return false;
    const keys = Object.keys(kit.enemies).filter((k) => !warmedKeys.has(k)).slice(0, max);
    if (!keys.length && fxWarmed) return false;
    warming = true;
    try { return await warmBatch(stage, keys, kit); } catch (e) { console.warn("warm:", e); return false; } finally { warming = false; }
  }
  async function warmBatch(stage, keys, kit) {
    const grp = new THREE.Group(); grp.name = "warm"; const list = [];
    for (const k of keys) { warmedKeys.add(k); const e = takeEnemy(kit, k); if (!e) continue; if (!e.own) prepEnemy(e); unitBox(e); e.obj.position.set(list.length * 3, 0, 0); grp.add(e.obj); list.push(e); }
    let samples = []; if (!fxWarmed) { fxWarmed = true; samples = fxSamples(); samples.forEach((m, i) => { m.position.set(i * 0.5, 2, 4); grp.add(m); }); }
    const culled = []; grp.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    ctx.here(me); grp.position.set(me.x, -40, me.z); root.add(grp); // under the ground: drawn, never seen
    // the first time, the light effects too (world-vfx.js: a summon, a boss summon, a chest, a pick-up), played under the
    // ground, and the whole scene compiled: they're out of the camera's view, so only compiling reaches them
    if (samples.length && VX) { const at = new V3(me.x, -40, me.z); try { VX.summon(at, false); VX.summon(at.clone(), true); if (VX.chest) VX.chest(at.clone()); if (VX.collect) VX.collect(at.clone(), 0xffc861); if (VX.warm) VX.warm(at.clone()); } catch { /* a missing effect is fine */ } }
    try { if (stage.renderer.compileAsync) await Promise.race([stage.renderer.compileAsync(samples.length ? stage.scene : grp, stage.camera, stage.scene), new Promise((r) => setTimeout(r, 3000))]); } catch { /* drawn below anyway */ } // (capped: a lost graphics context never finishes a compile — the loading screen waited forever on a Mac)
    await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 400); }); // (a hidden tab gets no frames)
    root.remove(grp); culled.forEach((o) => { o.frustumCulled = true; });
    for (const e of list) { grp.remove(e.obj); e.obj.position.set(0, 0, 0); const a = mobPool.get(e.key) || []; a.push(e); mobPool.set(e.key, a); }
    for (const m of samples) if (m.isSprite && m.userData.draw) { grp.remove(m); barPool.push(m); }
    return true;
  }

  return {
    warm, // b413: scammers and effects readied ahead of the first fight
    bosses: () => mobs.filter((m) => m.rank === "boss" && !m.dead && m.zone).map((m) => m.zone.id),
    potsCheck, tick, keyDown, keyUp, chargeStart, chargeEnd, charged, attack, dodge, cast, drink, onLevel, slot: () => (slotSkill() || {}).id || null, setSlot, nextSkill, paintSkills, paintPots, onGear: () => { paintVit(); },
    softUp: () => { if (down) getUp("here"); },
    vitals: () => ({ hp, sp, max: maxHp(), maxSp: maxSp(), down }), hurtMe: (n) => damage(n), zone: () => zone,
    speedMul: () => (buffs.boots > 0 ? 1.4 : 1) * (1 + stats().spd / 100), jumpMul: () => (buffs.spring > 0 ? 1.35 : 1),
    spawnMob, spawnItem, mobsRaw: () => mobs,
    /// a fight close by: a boss within r, or any scammer within 14 m (the jetpack comes down for it)
    locked: () => lockAlive(), lockAt: (out) => (lockAlive() ? out.copy(lockT.g.position) : null),
    bossNear: (r = 40) => { ctx.here(me); return mobs.some((m) => !m.dead && m.rank === "boss" && Math.hypot(m.g.position.x - me.x, m.g.position.z - me.z) < r); },
    dangerNear: (r = 24) => { ctx.here(me); return mobs.some((m) => !m.dead && Math.hypot(m.g.position.x - me.x, m.g.position.z - me.z) < (m.rank === "boss" ? r : 14)); }, state: () => ({ mobs: mobs.filter((m) => !m.dead).map((m) => ({ id: m.spec.id, lv: m.lv, rank: m.rank, hp: m.hp, max: m.max, x: m.g.position.x, z: m.g.position.z, cast: m.cast ? m.cast.kind : m.dash ? "dash" : m.rush ? "rush" : m.wind ? "wind" : "", rage: !!m.rage, rare: !!m.rare })), mshots: mshots.length, charging: chg.on, items: items.map((x) => x.it.id), drops: drops.length, dropAt: drops.map((d) => [d.g.position.x, d.g.position.z]), cd: { ...cd }, buffs: { ...buffs }, combo, zone: zone && zone.id }),
    spawnNear(dist = 3, o = {}) { const kit = ctx.kit(); if (!kit) return false; spawnT = 999; ctx.here(me); fwdOf(fwd);
      // in front of you; with free, turned aside when that spot is inside something (the fountain, a hall)
      let at = null; for (const turn of o.free ? [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, Math.PI] : []) { const d = fwd.clone().applyAxisAngle(UP, turn), c = me.clone().addScaledVector(d, dist).setY(0); if (!ctx.blocked(c)) { at = c; break; } }
      if (!at) at = me.clone().addScaledVector(fwd, dist).setY(0);
      return !!spawnMob({ ...o, at, zone: o.zone ? ZONES.find((z) => z.id === o.zone) : zone, boss: o.rank === "boss" ? (ZONES.find((z) => z.id === o.zone) || ZONES[0]).boss : undefined }); },
    itemNear(id, dist = 0.5) { const it = ITEMS.find((x) => x.id === id); if (!it) return; ctx.here(me); const g = itemMesh(it); g.position.set(me.x + dist, 1, me.z); add(g); items.push({ g, it, k: 0 }); },
    // the companion drone: a small zap at the nearest scammer within reach (about a tenth of your attack, through armour)
    petZap(from, k = 1) {
      if (down || !ctx.inHub()) return false;
      let best = null, bd = 8; for (const m of mobs) { if (m.dead) continue; const d = m.g.position.distanceTo(tmp.copy(from).setY(m.g.position.y)); if (d < bd) { bd = d; best = m; } }
      if (!best) return false;
      const to = best.g.position.clone().setY(best.y + 0.4); bolt(from.clone(), to); flash(to, 0x9fffd0, 1.4, 0.2);
      hit(best, Math.max(2, rpg.stats().atk * 0.12 * k) + best.def * 0.5, from, "pet", false); return true;
    },
    // the wisp: mends a share of your HP (only when you're hurt and up)
    heal(pct, from) {
      if (down || !ctx.inHub() || hp >= maxHp() - 0.5) return false;
      const h = Math.max(1, Math.round(maxHp() * pct)); hp = Math.min(maxHp(), hp + h); paintVit();
      ctx.here(me); ctx.float("+" + h, me.clone().setY(2.5), "#9fffd0"); if (from) { puff(from, 0x9fffd0, { n: 6, speed: 1.5, size: 0.3, life: 0.5, grav: -1 }); const a = from.clone(), b = me.clone().setY(1.2), line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new V3(0, 0.8, 0)), b), 16, 0.04, 5), additive(0x9fffd0, 0.8)); add(line); fx.push({ o: line, life: 0.6, t: 0, op0: 0.8 }); } return true;
    },
    // the raid boss (world-raid.js): spawned from the server's HP, kept in step with it, brought down by it
    raidMob: () => mobs.find((m) => m.raid && !m.dead) || null,
    raidPhase: (p) => { raidPhase = p; }, raidMod: (id) => { raidMod = id || ""; },
    spawnRaid(o) { return spawnMob({ ...o, rank: "boss", raid: true }); },
    // a shared boss another module owns (world-pumpking.js): o.ent its body, o.ext { hit(m, dmg, crit), down(m) }, o.home { x, z, r }
    spawnExt(o) { return spawnMob({ ...o, rank: "boss" }); },
    // a monster another module owns the body of (world-raidq.js): o.ent, o.at, o.lv, o.rank ("" or "elite"), o.zone { id, name, pow, claimTier }, o.scale (its height), o.y
    spawnOwn(o) { return spawnMob({ ...o, rank: o.rank === "elite" ? "elite" : "" }); },
    extSet(m, hpNow) { if (!m || m.dead) return; m.hp = Math.max(1, Math.min(m.max, hpNow)); label(m); if (!bossEl.hidden && bossEl.dataset.bid === String(m.barId)) bossBar(m); if (m.rank === "boss" && !m.rage && m.hp < m.max * 0.5) enrage(m); },
    extDown(m) { if (!m || m.dead) return; m.hp = 0; label(m); kill(m); },
    extGone(m) { const i = mobs.indexOf(m); if (i >= 0) { if (bossEl.dataset.bid === String(m.barId)) hideBossBar(); retire(m, i); } },
    raidSet(hpNow) { const m = mobs.find((x) => x.raid && !x.dead); if (!m) return; m.hp = Math.max(1, Math.min(m.max, hpNow)); label(m); bossBar(m); },
    raidDown() {
      const m = mobs.find((x) => x.raid && !x.dead); if (!m) return;
      // its swarm scatters with it
      for (const x of mobs) if (!x.dead && !x.raid && x.zone === m.zone) { x.dead = 0.001; puff(x.g.position.clone().setY(0.6), 0x9fffd0, { n: 10, speed: 3, size: 0.5, life: 0.6, grav: -1 }); }
      m.hp = 0; label(m); kill(m);
    },
    dropNear(item) { ctx.here(me); dropChest(me.clone().add(new V3(2, 0, 0)), item); },
    // AC Defense (world-defense.js): the arena clears the street scammers, spawns walkers to the Core, and hits them with its towers
    defense: {
      on(v) { defOn = !!v; for (let i = mobs.length - 1; i >= 0; i--) if (v ? !mobs[i].tgt : mobs[i].tgt) { if (mobs[i].rank === "boss") hideBossBar(); retire(mobs[i], i); } },
      spawn: (o) => spawnMob(o), list: () => mobs.filter((m) => m.tgt && !m.dead), hit: (m, raw, from) => hit(m, raw, from, "pet", false),
      setTint, // setTint(wave) → the tint hex the next walkers spawn with (mint → cyan → violet → red); spawn({ tint }) overrides one
      onBoss(cb) { bossCb = typeof cb === "function" ? cb : null; }, // cb(m) when a boss walker spawns (spawn returns it too)
    },
  };
}
