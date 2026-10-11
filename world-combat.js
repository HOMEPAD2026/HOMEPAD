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
//   HP and SP     from your level and gear (world-rpg.js). At 0 HP: respawn on the plaza for free, or revive on the
//                 spot for 10,000 $ARCIRCLE (the player's own transfer; half is burned)
//   street items  ARCL coins, speed boots, a spring, XP stars, mana crystals, health potions, a shield, a magnet
// ARCL goes through the server's claim: "street" (5), "hunt" (8–12 by tier, level-gated), "boss" (30), "pickup" (2),
// each limited per day, because the server can't watch a fight.
import { mobStats, hitDamage, ZONES, zoneAt, skillLevel, RARITY, BRANCH_AT } from "./world-rpg-data.js";
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
const BOSS_EVERY = 30 * 60e3, BOSS_FIRST = 2 * 60e3, BKEY = "arc.world.boss";

/// ctx: { THREE, K, kit(), planet, st, here(v), facing(), moveDir(v) → bool, avatar(), level(), T, lang, esc, toast, Snd,
///        reduce, coarse, inHub(), active(), gain(xp, why), claim(kind, extra, from), knock(dir, power), dash(dir, dist),
///        hurt(), down(on, where), pay(id, onStatus), screenOf(v), float(text, v, color, big), shake(n), hopY(),
///        blocked(v) → bool, rpg (world-rpg.js) }
export function createCombat(ctx) {
  const { THREE, K, planet, Snd, rpg } = ctx;
  const LW = { ko: { Spring: "스프링", Shield: "보호막", Magnet: "자석", Shock: "전기충격", Meteor: "메테오", Attack: "공격", Dodge: "회피", Dodged: "회피!", free: "무료", Elite: "엘리트", Boss: "보스" }, zh: { Spring: "弹簧", Shield: "护盾", Magnet: "磁铁", Shock: "电击", Meteor: "陨石", Attack: "攻击", Dodge: "闪避", Dodged: "闪避！", free: "免费", Elite: "精英", Boss: "首领" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const V3 = THREE.Vector3;
  const root = new THREE.Group(); root.name = "combat"; planet.add(root);
  const mobs = [], items = [], shots = [], fx = [], drops = [];
  const cd = { attack: 0, ice: 0, fire: 0, shock: 0, meteor: 0, dodge: 0 };
  const stats = () => rpg.stats();
  const maxHp = () => stats().hp, maxSp = () => stats().sp;
  let quietT = 0, hp = maxHp(), sp = maxSp(), calmT = 0, down = false, guardT = 0, stopT = 0, combo = 0, comboT = 0, heartT = 0;
  const buffs = {};
  let spawnT = 14, itemT = 2, hurtT = 0, zone = null, zoneShown = null;
  const me = new V3(), tmp = new V3(), tmp2 = new V3(), fwd = new V3();
  const add = (m) => { root.add(m); return m; };
  const additive = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const dotTex = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const spriteMat = (c, o = 1) => new THREE.SpriteMaterial({ map: dotTex, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const unlocked = (s) => ctx.level() >= s.lv;
  const fwdOf = (out) => { const f = ctx.facing(); return out.set(Math.sin(f), 0, Math.cos(f)); };
  const lvColor = (lv) => { const d = lv - ctx.level(); return d <= -5 ? "#9aa4b0" : d <= 2 ? "#ffffff" : d <= 5 ? "#ffb04a" : "#ff4d6d"; };

  // ---------------- particles (sprites come from a pool, so a fight doesn't allocate every frame) ----------------
  const pool = [];
  const sprite = (c, o = 1) => { const s = pool.pop() || new THREE.Sprite(spriteMat(c, o)); s.material.color.set(c); s.material.opacity = o; s.visible = true; s.userData.pooled = true; return s; };
  function puff(pos, color, { n = 10, speed = 4, size = 0.35, life = 0.6, up = 1, grav = 4 } = {}) {
    if (ctx.reduce) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const s = sprite(color); s.position.copy(pos); s.scale.setScalar(size * (0.6 + Math.random() * 0.8)); add(s);
      const a = Math.random() * TAU;
      fx.push({ o: s, v: new V3(Math.cos(a) * speed * Math.random(), (0.5 + Math.random()) * speed * 0.6 * up, Math.sin(a) * speed * Math.random()), life, t: 0, grav, s0: s.scale.x });
    }
  }
  function shards(pos, color, n = 10, speed = 6) {
    const geo = new THREE.TetrahedronGeometry(0.12, 0);
    for (let i = 0; i < (ctx.reduce ? 4 : n); i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.2, transparent: true })); m.position.copy(pos); add(m);
      const a = Math.random() * TAU; fx.push({ o: m, v: new V3(Math.cos(a) * speed * Math.random(), 2 + Math.random() * speed * 0.7, Math.sin(a) * speed * Math.random()), life: 0.7 + Math.random() * 0.3, t: 0, grav: 14, spin: new V3(Math.random() * 12, Math.random() * 12, 0) });
    }
  }
  function ring(pos, color, { r0 = 0.3, r1 = 2.6, life = 0.35, y = 0.08 } = {}) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), additive(color, 0.9)); m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y = y; m.scale.setScalar(r0); add(m);
    fx.push({ o: m, life, t: 0, grow: [r0, r1] });
  }
  function flash(pos, color, size = 3, life = 0.25) { const s = sprite(color); s.position.copy(pos); s.scale.setScalar(size); add(s); fx.push({ o: s, life, t: 0, grow: [size, size * 1.6] }); }
  // a column of light that fades upward (a gradient, so it glows instead of washing the screen white)
  let fadeTex = null;
  const fadeUp = () => { if (fadeTex) return fadeTex; const c = document.createElement("canvas"); c.width = 4; c.height = 128; const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.55, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,1)"); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); fadeTex = new THREE.CanvasTexture(c); return fadeTex; };
  function pillar(pos, color, h = 14, life = 1.4, r = 1.2) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.3, h, 24, 1, true), additive(color, 0.5)); m.material.side = THREE.FrontSide; m.material.map = fadeUp(); m.material.depthWrite = false; m.position.copy(pos).setY(h / 2); add(m);
    fx.push({ o: m, life, t: 0, op0: 0.5, onTick: (k) => { m.scale.x = m.scale.z = 1 - k * 0.6; } });
  }
  function tickFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i]; p.t += dt; const k = p.t / p.life;
      if (k >= 1) {
        root.remove(p.o);
        if (p.o.userData.pooled) { p.o.visible = false; if (pool.length < 400) pool.push(p.o); else p.o.material.dispose(); }
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
  function hpBar(w = 1.7) {
    const cv = document.createElement("canvas"); cv.width = 160; cv.height = 44; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })); sp.scale.set(w, w * 44 / 160, 1); sp.renderOrder = 11;
    sp.userData.draw = (lv, name, k, color, rank) => {
      const g = cv.getContext("2d"); g.clearRect(0, 0, 160, 44); g.font = "800 15px Sora, sans-serif"; g.textAlign = "center";
      g.fillStyle = "rgba(6,10,16,.8)"; g.beginPath(); g.roundRect(2, 2, 156, 21, 10); g.fill();
      if (rank) { g.strokeStyle = rank === "boss" ? "#ff4d6d" : "#ffc861"; g.lineWidth = 2; g.stroke(); }
      const t = `Lv ${lv} ${name}`; let fs = 15; while (fs > 9 && g.measureText(t).width > 148) { fs -= 1; g.font = `800 ${fs}px Sora, sans-serif`; } // a long boss name shrinks to fit
      g.fillStyle = color; g.fillText(t, 80, 17 + (15 - fs) * 0.2);
      g.fillStyle = "rgba(6,10,16,.85)"; g.beginPath(); g.roundRect(16, 28, 128, 12, 6); g.fill();
      g.fillStyle = k > 0.5 ? "#39ff88" : k > 0.25 ? "#ffc861" : "#ff4d6d"; g.beginPath(); g.roundRect(18, 30, 124 * Math.max(0, k), 8, 4); g.fill(); tex.needsUpdate = true;
    };
    return sp;
  }
  const label = (m) => m.bar.userData.draw(m.lv, (m.rank === "boss" ? m.bossName : T(m.spec.name)), m.hp / m.max, m.rank === "boss" ? "#ff8fa0" : m.rank === "elite" ? "#ffd27a" : lvColor(m.lv), m.rank);
  /// a scammer: { type, lv, rank ("" | "elite" | "boss"), at (V3), zone, boss: zone.boss spec }
  function spawnMob(o = {}) {
    const kit = ctx.kit(); if (!kit) return null;
    const spec = MOBS[o.type] || MOBS[["spam", "drop", "rug"][Math.floor(Math.random() * 3)]];
    const bs = o.rank === "boss" ? o.boss : null;
    const e = K.enemy(kit, bs ? bs.model : spec.model); if (!e) return null;
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
    if (o.raid) st.hp = o.max;
    const g = new THREE.Group(); g.position.copy(p);
    const sc = bs ? bs.scale : spec.scale * (rank === "elite" ? 1.3 : 1) * (1 + Math.min(0.4, lv * 0.012));
    e.obj.scale.setScalar(sc); e.obj.position.y = bs ? bs.y : spec.y * (rank === "elite" ? 1.2 : 1); g.add(e.obj);
    const tint = new THREE.Color(bs ? bs.tint : spec.color);
    e.obj.traverse((x) => { if (x.isMesh && x.material) { x.material = x.material.clone(); if (x.material.emissive) { x.material.emissive.copy(tint); x.material.emissiveIntensity = 0.18; } } });
    const bb = new THREE.Box3().setFromObject(e.obj); const bar = hpBar(bs ? 3.2 : rank === "elite" ? 2.1 : 1.7); bar.position.y = bb.max.y + (bs ? 0.9 : 0.5); g.add(bar);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(bs ? 2.6 : 0.7, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.04; g.add(sh);
    if (rank) { const rr = new THREE.Mesh(new THREE.TorusGeometry(bs ? 3 : 1.1, 0.07, 8, 48), new THREE.MeshBasicMaterial({ color: rank === "boss" ? 0xff4d6d : 0xffc861 })); rr.rotation.x = Math.PI / 2; rr.position.y = 0.08; g.add(rr); g.userData.ring = rr; }
    add(g); e.play("Run");
    const m = { g, e, spec, lv, rank, max: st.hp, hp: st.hp, atk: st.atk, def: st.def, xp: st.xp, slow: 0, stun: 0, burn: 0, burnD: 0, hitT: 0, bar, dead: 0, wander: Math.random() * TAU, zone: o.zone || null, bossName: bs ? bs.name : "", reach: bs ? 3.2 : 1.35 + (rank === "elite" ? 0.3 : 0), y: bs ? bs.y : spec.y };
    if (o.raid) {
      m.raid = true; m.hp = Math.max(1, o.hp); bar.visible = false; // the raid's HP is the bar at the top and the gauge on the floor
      const crown = new THREE.Group(); crown.position.y = bb.max.y + 1.2; g.add(crown);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0xffc861, metalness: 0.85, roughness: 0.25, emissive: 0x6a4a10, emissiveIntensity: 0.5 })); c.position.set(Math.cos(a) * 2.6, Math.sin(a * 3) * 0.25, Math.sin(a) * 2.6); c.rotation.z = Math.PI / 2; c.rotation.y = -a; crown.add(c); }
      const aura = new THREE.Mesh(new THREE.SphereGeometry(Math.max(3, (bb.max.y - bb.min.y) * 0.7), 24, 16), additive(0x39ff88, 0.08)); aura.position.y = (bb.max.y + bb.min.y) / 2; g.add(aura);
      m.crown = crown; m.aura = aura;
    }
    label(m); mobs.push(m);
    if (m.slow === 0) { const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(0.8, (bb.max.y - bb.min.y) * 0.6), 0), new THREE.MeshPhysicalMaterial({ color: 0xbfefff, transparent: true, opacity: 0.45, roughness: 0.05, flatShading: true })); shell.position.y = (bb.max.y + bb.min.y) / 2; shell.visible = false; g.add(shell); m.shell = shell; }
    puff(new V3(p.x, 0.6, p.z), rank === "boss" ? 0xff4d6d : 0xff7a9a, { n: rank === "boss" ? 40 : 14, speed: rank === "boss" ? 6 : 3, size: rank === "boss" ? 1.4 : 0.6, life: 0.8, grav: -1 });
    if (bs && o.raid) { bossBar(m); ctx.shake(0.5); Snd.siren && Snd.siren(); if (ctx.bossIntro) ctx.bossIntro(m.g.position, bs.name, o.zone.name, m.lv); }
    else if (bs) { bossBar(m); ctx.shake(0.5); Snd.siren && Snd.siren(); if (ctx.bossIntro) ctx.bossIntro(m.g.position, bs.name, o.zone.name, m.lv); else ctx.toast(T("{x} appeared in {z}!", { x: bs.name, z: o.zone.name })); }
    return m;
  }
  function hit(m, raw, from, kind, crit) {
    if (m.dead) return;
    const dmg = Math.max(1, Math.round(hitDamage(raw, m.def) * (m.raid && m.shieldT > 0 ? 0.4 : 1)));
    m.hp -= dmg; m.hitT = 0.18; label(m); if (m.rank === "boss") bossBar(m);
    tmp.copy(m.g.position).sub(from).setY(0); if (tmp.lengthSq() > 1e-4) tmp.normalize();
    const kb = (m.rank === "boss" ? 0.15 : m.rank === "elite" ? 0.5 : 1) * (kind === "fire" || kind === "meteor" ? 1.4 : kind === "shock" ? 0.3 : kind === "heavy" ? 2.0 : 0.9);
    if (!m.raid) tryStep(m, tmp, kb);
    if (kind === "ice") { const deep = brOf("ice") === "a"; m.slow = deep ? 5 : 3; if (deep) { m.stun = Math.max(m.stun, m.rank === "boss" ? 0.2 : 0.6); m.statue = true; } }
    if (kind === "shock") m.stun = (m.rank === "boss" ? 0.4 : 1.2) * (brOf("shock") === "b" ? 2 : 1);
    if (kind === "fire" || kind === "meteor") { const inf = kind === "fire" && brOf("fire") === "b"; m.burn = inf ? 5 : 3; m.burnD = Math.max(1, Math.round(raw * (inf ? 0.24 : 0.12))); }
    m.e.play("Hit", { once: true, fade: 0.05 });
    ctx.float((crit ? "!" : "") + dmg, tmp2.copy(m.g.position).setY(m.bar.position.y + 0.4), crit ? "#ffe066" : kind === "ice" ? "#8fe6ff" : kind === "fire" || kind === "meteor" ? "#ffb070" : kind === "shock" ? "#d8c4ff" : "#ffffff", crit, dmg / m.max);
    if (crit || kind === "heavy") stopT = Math.max(stopT, crit ? 0.07 : 0.05);
    if (crit && ctx.slowmo) ctx.slowmo(160);
    if (kind === "heavy" && ctx.punch) ctx.punch();
    // the raid boss's HP is everyone's: the hit is reported (world-raid.js) and it only falls when the server says so
    if (m.raid) { ctx.raidHit && ctx.raidHit(dmg); if (m.hp < 1) { m.hp = 1; label(m); bossBar(m); } return; }
    if (m.hp <= 0) kill(m);
  }
  function tryStep(m, dir, dist) {
    tmp2.copy(m.g.position).addScaledVector(dir, dist);
    if (ctx.blocked(tmp2)) { m.wander += Math.PI * 0.6; return false; }
    m.g.position.copy(tmp2); return true;
  }
  function kill(m) {
    m.dead = 0.001; Snd.coin && Snd.coin();
    const p = m.g.position.clone().setY(m.y + 0.4);
    shards(p, new THREE.Color(m.rank === "boss" ? 0xff4d6d : m.spec.color).getHex(), m.rank === "boss" ? 40 : 16, m.rank === "boss" ? 10 : 7); flash(p, 0xffffff, m.rank === "boss" ? 8 : 2.6, 0.25); puff(p, 0xffc861, { n: m.rank === "boss" ? 40 : 12, speed: 5, size: 0.3, life: 0.8, grav: 6 });
    ctx.shake(m.rank === "boss" ? 0.6 : 0.18);
    if (m.rank === "boss" && ctx.slowmo) { ctx.slowmo(700); ctx.punch && ctx.punch(); } // the boss goes down in slow motion
    if (m.raid) { ctx.toast(T("The raid boss fell: {x}", { x: m.bossName })); ctx.onRaidDown && ctx.onRaidDown(m.g.position.clone()); hideBossBar(); return; } // its XP comes with the claim
    ctx.gain(Math.round(m.xp * (ctx.xpBoost ? ctx.xpBoost(m.zone && m.zone.id) : 1)), T("Knocked out a {x}", { x: m.rank === "boss" ? m.bossName : T(m.spec.name) }));
    const zi = m.zone ? ZONES.indexOf(m.zone) : -1, tier = m.lv >= 15 ? 4 : m.lv >= 10 ? 3 : m.lv >= 5 ? 2 : 1;
    if (m.rank === "boss") { ctx.claim("boss", { zone: zi }, ctx.screenOf(p)); setBoss(m.zone.id, Date.now() + BOSS_EVERY); hideBossBar(); ctx.onBoss && ctx.onBoss(m.zone); }
    else if (zi >= 0 && tier >= 2) ctx.claim("hunt", { tier }, ctx.screenOf(p));
    else ctx.claim("street", {}, ctx.screenOf(p));
    ctx.onKill && ctx.onKill({ type: m.spec.id, lv: m.lv, rank: m.rank, zone: m.zone && m.zone.id });
    // the drop: a chest with a beam in its rarity's colour
    const d = rpg.rollDrop(m.lv, m.rank); if (d) dropChest(m.g.position.clone(), d);
    if (m.rank === "boss") { const d2 = rpg.rollDrop(m.lv, "boss"); if (d2) dropChest(m.g.position.clone().add(new V3(1.6, 0, 0.8)), d2); }
    if (Math.random() < 0.18) { const x = m.g.position.clone(); x.y = 1; const it = ITEMS[Math.random() < 0.5 ? 5 : 4]; const g = itemMesh(it); g.position.copy(x).add(new V3(-1, 0, 0.5)); add(g); items.push({ g, it, k: 0 }); }
  }
  function dropChest(at, item) {
    const c = new THREE.Color(RARITY[item.r].color), g = new THREE.Group(); g.position.copy(at).setY(0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.55), new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.7 })); box.position.y = 0.3;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.18, 0.59), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 })); lid.position.y = 0.65;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 9, 16, 1, true), additive(c, item.r >= 2 ? 0.55 : 0.3)); beam.material.side = THREE.DoubleSide; beam.position.y = 4.5;
    g.add(box, lid, beam); add(g);
    puff(at.clone().setY(1), c.getHex(), { n: 16, speed: 4, size: 0.4, life: 0.8, grav: -1 });
    if (item.r >= 4) { ctx.shake(0.3); ctx.legend && ctx.legend(); }
    drops.push({ g, item, t: 0, beam, lid });
  }
  function tickDrops(dt, t) {
    ctx.here(me);
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.t += dt; d.beam.material.opacity = (d.item.r >= 2 ? 0.45 : 0.25) + Math.sin(t * 4) * 0.1; d.lid.rotation.y = Math.sin(t * 2) * 0.1;
      const dist = Math.hypot(d.g.position.x - me.x, d.g.position.z - me.z);
      if (dist < 1.5 || d.t > 120 || dist > 60) {
        root.remove(d.g); drops.splice(i, 1);
        if (dist < 1.5) { const ok = rpg.addItem(d.item); Snd.chest && Snd.chest(); ring(d.g.position, new THREE.Color(RARITY[d.item.r].color).getHex(), { r0: 0.3, r1: 2.4, life: 0.4 }); if (ok) ctx.float(rpg.itemName(d.item), d.g.position.clone().setY(2.4), RARITY[d.item.r].color, d.item.r >= 3); ctx.onLoot && ctx.onLoot(d.item); }
      }
    }
  }
  function tickMobs(dt, t) {
    ctx.here(me);
    const st = stats();
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      m.e.mixer.update(dt);
      if (m.dead) { m.dead += dt; m.g.scale.setScalar(Math.max(0.01, 1 - m.dead * 4)); m.g.position.y += dt * 2; if (m.dead > 0.3) { root.remove(m.g); mobs.splice(i, 1); } continue; }
      tmp.copy(me).sub(m.g.position).setY(0); const d = tmp.length();
      if (d > (m.raid ? 40 : m.rank === "boss" ? 90 : 48)) { root.remove(m.g); mobs.splice(i, 1); if (m.rank === "boss") hideBossBar(); continue; }
      m.slow = Math.max(0, m.slow - dt); m.stun = Math.max(0, m.stun - dt); m.hitT = Math.max(0, m.hitT - dt);
      if (m.burn > 0) { m.burn -= dt; m.burnT = (m.burnT || 0) - dt; if (m.burnT <= 0) { m.burnT = 0.5; m.hp -= m.burnD; label(m); puff(m.g.position.clone().setY(m.y + 0.3), 0xff7a2a, { n: 3, speed: 1, size: 0.5, life: 0.4, grav: -3 }); if (m.raid) { ctx.raidHit && ctx.raidHit(m.burnD); m.hp = Math.max(1, m.hp); } if (m.rank === "boss") bossBar(m); if (m.hp <= 0) { kill(m); continue; } } }
      if (m.shell) { m.shell.visible = m.slow > 0; m.shell.material.opacity = m.statue && m.stun > 0 ? 0.85 : 0.45; }
      if (m.statue && m.stun <= 0) { m.statue = false; shards(m.g.position.clone().setY(m.y + 0.5), 0xcff6ff, 16, 6); Snd.pop && Snd.pop(); } // the ice statue shatters
      const body = m.e.obj;
      body.position.x = m.hitT > 0 ? Math.sin(t * 90) * 0.06 : 0;
      body.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) { o.material.emissiveIntensity = m.hitT > 0.1 ? 2.2 : m.hitT > 0 ? 1.2 : m.burn > 0 ? 0.7 + Math.sin(t * 20) * 0.2 : m.slow > 0 ? 0.5 : m.stun > 0 ? 0.9 + Math.sin(t * 40) * 0.5 : 0.18; o.material.emissive.set(m.hitT > 0.1 ? 0xffffff : m.burn > 0 ? 0xff6a1a : m.slow > 0 ? 0x5fd8ff : m.stun > 0 ? 0xb48cff : m.rank === "boss" ? m.zone.boss.tint : m.spec.color); } });
      if (m.g.userData.ring) m.g.userData.ring.rotation.z += dt * 2;
      if (m.stun > 0) continue;
      const sp = m.spec.speed * (m.rank === "boss" ? 0.8 : 1) * (m.slow > 0 ? 0.35 : 1);
      if (d < 15 && d > m.reach * 0.9) { tmp.divideScalar(d); if (!tryStep(m, tmp, sp * dt)) { tmp2.set(-tmp.z, 0, tmp.x); tryStep(m, tmp2, sp * dt); } m.g.rotation.y = Math.atan2(tmp.x, tmp.z); }
      else if (d >= 15) { m.wander += (Math.random() - 0.5) * dt; tmp.set(Math.cos(m.wander), 0, Math.sin(m.wander)); tryStep(m, tmp, sp * 0.4 * dt); m.g.rotation.y = Math.atan2(tmp.x, tmp.z); }
      const r = Math.hypot(m.g.position.x, m.g.position.z); if (r < 14) m.g.position.multiplyScalar(14 / r);
      if (m.zone && Math.hypot(m.g.position.x - m.zone.x, m.g.position.z - m.zone.z) > m.zone.r) { tmp.set(m.zone.x - m.g.position.x, 0, m.zone.z - m.g.position.z).normalize(); m.g.position.addScaledVector(tmp, sp * dt * 2); }
      m.g.position.y = m.rank === "boss" ? Math.abs(Math.sin(t * 2)) * 0.3 : Math.abs(Math.sin(t * 6 + i)) * 0.12;
      // their hit: the boss also slams the ground now and then
      if (d <= m.reach && hurtT <= 0 && !down) {
        hurtT = m.rank === "boss" ? 1.6 : 1.3; m.e.play("Attack", { once: true, fade: 0.05 });
        if (buffs.shield > 0 || guardT > 0) { flash(me.clone().setY(1.2), 0x4fa8ff, 3.2, 0.3); Snd.pop && Snd.pop(); if (guardT > 0) ctx.float(T("Dodged"), me.clone().setY(2.6), "#9fe6ff"); }
        else { tmp.copy(me).sub(m.g.position).setY(0).normalize(); ctx.knock(tmp, m.rank === "boss" ? 11 : 7); ctx.hurt(); damage(hitDamage(m.atk, st.def)); }
      }
      if (m.raid) { raidTick(m, dt, t, d); m.crown.rotation.y += dt * 0.8; m.crown.children.forEach((c, k) => { c.rotation.x += dt * 3; }); m.aura.material.opacity = 0.06 + Math.sin(t * 2) * 0.03 + (raidPhase >= 4 ? 0.05 : 0); }
      if (m.rank === "boss") {
        m.slam = (m.slam || 6) - dt;
        // a red circle grows on the ground a second before the slam: step out of it
        if (m.slam <= 1.1 && !m.warned && d < 14) { m.warned = true; const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 48), additive(0xff2d4d, 0.3)); disc.rotation.x = -Math.PI / 2; disc.position.copy(m.g.position).setY(0.07); add(disc); fx.push({ o: disc, life: 1.1, t: 0, onTick: (k) => { disc.material.opacity = 0.12 + 0.28 * k + Math.sin(k * 30) * 0.06; disc.scale.setScalar(0.3 + 0.7 * Math.min(1, k * 1.6)); } }); }
        if (m.slam <= 0 && d < 12) { m.slam = 7 + Math.random() * 3; m.warned = false; slam(m); }
        else if (m.slam <= 0) { m.slam = 2; m.warned = false; }
      }
    }
    hurtT = Math.max(0, hurtT - dt);
  }
  // the raid's phases (world-social.js): 2 calls a swarm now and then, 3 adds a shield that soaks most of a hit,
  // 4 drops red circles around you — step out before they burst
  let raidPhase = 1;
  function raidTick(m, dt, t, d) {
    const now = performance.now(); // wall-clock: a slow frame rate mustn't stretch the phases
    if (raidPhase >= 2 && now >= (m.swarmAt ??= now + 4000)) {
      m.swarmAt = now + 14000;
      if (mobs.filter((x) => !x.dead && x.zone === m.zone && !x.raid).length < 4) for (let i = 0; i < 2; i++) { const a = Math.random() * TAU; spawnMob({ type: "rug", lv: Math.max(1, m.lv - 3), zone: m.zone, at: m.g.position.clone().add(new V3(Math.cos(a) * 4, 0, Math.sin(a) * 4)) }); }
      ring(m.g.position, 0xb48cff, { r0: 1, r1: 6, life: 0.6, y: 0.1 });
    }
    if (raidPhase >= 3) {
      m.shieldT = Math.max(0, ((m.shieldUntil || 0) - now) / 1000);
      if (now >= (m.shieldAt ??= now + 3000)) { m.shieldAt = now + 11000; m.shieldUntil = now + 3500; m.shieldT = 3.5; if (!m.bubble) { const bb = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0x9fffd0, transparent: true, opacity: 0.22, depthWrite: false })); bb.position.y = 2.2; m.g.add(bb); m.bubble = bb; } ctx.float(T("Shield up"), m.g.position.clone().setY(5), "#9fffd0"); }
      if (m.bubble) { m.bubble.visible = m.shieldT > 0; m.bubble.material.opacity = 0.16 + Math.sin(t * 6) * 0.06; }
    }
    if (raidPhase >= 4 && d < 22 && now >= (m.dropAt ??= now + 2000)) {
      m.dropAt = now + 2400;
      ctx.here(me); const at = me.clone().add(new V3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)).setY(0.08);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), additive(0xff2d4d, 0.3)); disc.rotation.x = -Math.PI / 2; disc.position.copy(at); add(disc);
      fx.push({ o: disc, life: 1.1, t: 0, onTick: (k) => { disc.material.opacity = 0.15 + 0.35 * k; disc.scale.setScalar(0.4 + 0.6 * Math.min(1, k * 1.5)); } });
      setTimeout(() => { puff(at.clone().setY(0.4), 0xff6a4a, { n: 18, speed: 6, size: 0.5, life: 0.5, grav: 2 }); ring(at, 0xff4d6d, { r0: 0.3, r1: 2.6, life: 0.35, y: 0.1 }); ctx.here(me); if (!down && guardT <= 0 && Math.hypot(me.x - at.x, me.z - at.z) < 2.2 && ctx.hopY() < 0.8) { ctx.hurt(); damage(hitDamage(Math.round(m.atk * 0.8), stats().def)); } }, 1100);
    }
  }
  function slam(m) {
    const p = m.g.position.clone(); ring(p, 0xff4d6d, { r0: 0.5, r1: 7, life: 0.7, y: 0.1 }); puff(p.clone().setY(0.5), 0xff8a6a, { n: 30, speed: 7, size: 0.6, life: 0.7, grav: 3 }); ctx.shake(0.45);
    ctx.here(me); if (me.distanceTo(tmp.copy(p).setY(me.y)) < 7 && guardT <= 0 && !down && ctx.hopY() < 0.8) { tmp.copy(me).sub(p).setY(0).normalize(); ctx.knock(tmp, 13); ctx.hurt(); damage(hitDamage(Math.round(m.atk * 1.4), stats().def)); }
  }

  // ---------------- the boss bar and the zone banner ----------------
  const bossEl = document.createElement("div"); bossEl.className = "wc-boss"; bossEl.id = "wc-boss"; bossEl.hidden = true; bossEl.setAttribute("data-no-i18n", ""); document.body.appendChild(bossEl);
  function bossBar(m) { bossEl.hidden = false; bossEl.classList.toggle("raid", !!m.raid); bossEl.innerHTML = `<b>${ctx.esc(m.bossName)}</b><small>${m.raid ? `<span class="wc-long">${T("Weekly raid · everyone's HP")} · </span>` : T("Boss") + " · "}Lv ${m.lv}</small><i><u style="width:${Math.max(0, 100 * m.hp / m.max)}%"></u></i><em>${Math.max(0, Math.ceil(m.hp)).toLocaleString("en-US")} / ${m.max.toLocaleString("en-US")}</em>`; }
  function hideBossBar() { bossEl.hidden = true; }
  const zoneEl = document.createElement("div"); zoneEl.className = "wc-zone"; zoneEl.id = "wc-zone"; zoneEl.hidden = true; zoneEl.setAttribute("data-no-i18n", ""); (document.querySelector(".wp-hud-r") || document.body).appendChild(zoneEl); // under the minimap
  const bannerEl = document.createElement("div"); bannerEl.className = "wc-banner"; bannerEl.hidden = true; bannerEl.setAttribute("data-no-i18n", ""); document.body.appendChild(bannerEl);
  const bossAt = () => { try { return JSON.parse(localStorage.getItem(BKEY) || "{}"); } catch { return {}; } };
  const setBoss = (id, t) => { const b = bossAt(); b[id] = t; try { localStorage.setItem(BKEY, JSON.stringify(b)); } catch { /* private */ } };
  function paintZone() {
    if (!zone) { zoneEl.hidden = true; return; }
    const next = bossAt()[zone.id] || 0, alive = mobs.some((m) => m.rank === "boss" && !m.dead);
    const left = Math.max(0, next - Date.now());
    zoneEl.hidden = false; zoneEl.style.setProperty("--zc", "#" + new THREE.Color(zone.color).getHexString());
    zoneEl.innerHTML = `<b>${ctx.esc(zone.name)}</b><small style="color:${lvColor(zone.lv[0])}">${T("Level {a}–{b}", { a: zone.lv[0], b: zone.lv[1] })} · ${T("you're Lv {n}", { n: ctx.level() })}</small><em>${alive ? T("Boss is here!") : left ? T("Boss in {t}", { t: `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}` }) : T("Boss soon")}</em>`;
  }
  function enterZone(z) {
    bannerEl.hidden = false; bannerEl.style.setProperty("--zc", "#" + new THREE.Color(z.color).getHexString());
    const boost = ctx.xpBoost ? ctx.xpBoost(z.id) : 1;
    bannerEl.innerHTML = `<small>${T("Hunting ground")}</small><b>${ctx.esc(z.name)}</b><em>${T("Level {a}–{b}", { a: z.lv[0], b: z.lv[1] })}${ctx.level() < z.lv[0] ? " · " + T("Too strong for you yet") : ""}</em>${boost > 1 ? `<span class="wc-xpev">${T("XP ×{k} today", { k: boost })}</span>` : ""}`;
    bannerEl.classList.toggle("danger", ctx.level() < z.lv[0]);
    bannerEl.classList.remove("on"); void bannerEl.offsetWidth; bannerEl.classList.add("on"); setTimeout(() => { bannerEl.hidden = true; }, 3200);
    const b = bossAt(); if (!b[z.id]) setBoss(z.id, Date.now() + BOSS_FIRST);
    if (ctx.level() < z.lv[0]) ctx.toast(T("{x} is for level {n} and up. Careful!", { x: z.name, n: z.lv[0] }));
  }

  // ---------------- attacking: a three-hit combo ----------------
  const critRoll = () => Math.random() * 100 < stats().crit;
  function attack() {
    if (!ctx.active() || cd.attack > 0) return false;
    combo = comboT > 0 ? (combo % 3) + 1 : 1; comboT = 0.75;
    const heavy = combo === 3;
    cd.attack = heavy ? 0.5 : 0.3;
    const av = ctx.avatar(); if (av) av.play(heavy ? "pick-up" : "interact-right", { once: true, fade: 0.04, speed: heavy ? 2.2 : 2.0 });
    Snd.swing && Snd.swing(heavy);
    ctx.here(me); fwdOf(fwd);
    const arc = new THREE.Group(), blade = new THREE.Mesh(new THREE.RingGeometry(1.0, heavy ? 1.7 : 1.45, 40, 1, 0.2, 2.6), new THREE.MeshBasicMaterial({ color: heavy ? 0xfff2c8 : 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    const glowB = new THREE.Mesh(new THREE.RingGeometry(0.85, heavy ? 2.1 : 1.7, 40, 1, 0.2, 2.6), additive(heavy ? 0xffc861 : 0x7fe6ff, 0.6)); glowB.material.side = THREE.DoubleSide;
    const tilt = combo === 1 ? -0.6 : combo === 2 ? 0.7 : -1.5; blade.rotation.z = tilt; glowB.rotation.z = tilt; arc.add(glowB, blade);
    arc.rotation.y = ctx.facing(); arc.position.copy(me).setY(heavy ? 0.9 : 1.15).addScaledVector(fwd, 1.0); add(arc);
    fx.push({ o: arc, life: 0.24, t: 0, grow: [0.75, heavy ? 1.45 : 1.2], onTick: (k) => { blade.material.opacity = 0.95 * (1 - k); glowB.material.opacity = 0.6 * (1 - k); arc.rotation.z = (combo === 2 ? 1 : -1) * k * 1.2; } });
    if (heavy) { ring(me.clone().addScaledVector(fwd, 1.4), 0xffc861, { r0: 0.4, r1: 2.6, life: 0.3, y: 0.1 }); puff(me.clone().addScaledVector(fwd, 1.4).setY(0.3), 0xd8c8a8, { n: 10, speed: 3, size: 0.5, life: 0.5, grav: 2 }); }
    const reach = heavy ? 3.1 : 2.6, base = stats().atk * (heavy ? 1.7 : combo === 2 ? 1.15 : 1);
    let any = false;
    for (const m of mobs) { if (m.dead) continue; tmp.copy(m.g.position).sub(me).setY(0); const d = tmp.length() - (m.rank === "boss" ? 2 : 0); if (d < reach && (d < 0.8 || tmp.normalize().dot(fwd) > 0.2)) { const c = critRoll(); hit(m, base * (c ? 1.8 : 1), me, heavy ? "heavy" : "melee", c); any = true; puff(m.g.position.clone().setY(m.y + 0.5), 0xffffff, { n: 6, speed: 4, size: 0.25, life: 0.3 }); } }
    if (any) ctx.shake(heavy ? 0.16 : 0.07);
    return true;
  }
  // dodge: a quick dash where you're looking or moving; you can't be hit during it
  function dodge() {
    if (!ctx.active() || cd.dodge > 0) return false;
    cd.dodge = 1.1; guardT = Math.max(guardT, 0.45);
    if (!ctx.moveDir(tmp)) fwdOf(tmp);
    ctx.dash(tmp, 6.5); Snd.dash ? Snd.dash() : Snd.jump && Snd.jump();
    ctx.here(me);
    for (let i = 0; i < 6; i++) setTimeout(() => { ctx.here(me); const s = sprite(0x9fe6ff, 0.5); s.position.copy(me).setY(1.1); s.scale.set(1.2, 2.2, 1); add(s); fx.push({ o: s, life: 0.35, t: 0, op0: 0.5 }); }, i * 35);
    return true;
  }
  function aim(out) {
    ctx.here(me); fwdOf(out); let best = null, bd = 24;
    for (const m of mobs) { if (m.dead) continue; tmp.copy(m.g.position).sub(me).setY(0); const d = tmp.length(); if (d < bd && tmp.normalize().dot(out) > 0.5) { bd = d; best = m; } }
    if (best) out.copy(best.g.position).sub(me).setY(0).normalize();
    return best;
  }
  const power = (s) => stats().atk * s.mult * (1 + 0.12 * (skillLevel(ctx.level(), s.lv) - 1));
  // the way a skill grew (world-rpg-data.js BRANCHES): "a", "b" or "" before skill level 2 / before choosing
  const brOf = (id) => { const s = SKILLS.find((x) => x.id === id); if (!s || skillLevel(ctx.level(), s.lv) < BRANCH_AT) return ""; const b = ((rpg.data() || {}).x || {}).br || {}; return b[id] === "a" || b[id] === "b" ? b[id] : ""; };
  function cast(id) {
    const s = SKILLS.find((x) => x.id === id); if (!s || !ctx.active()) return false;
    if (!unlocked(s)) { ctx.toast(T("{x} unlocks at level {n}", { x: T(s.name), n: s.lv })); return false; }
    if (cd[id] > 0) return false;
    if (sp < s.sp) { ctx.toast(T("Not enough SP")); vit.classList.remove("low"); void vit.offsetWidth; vit.classList.add("low"); return false; }
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
      chain.forEach((m, i) => { setTimeout(() => { const c = critRoll(); hit(m, dmg * (c ? 1.8 : 1), me, "shock", c); flash(m.g.position.clone().setY(m.y + 0.4), 0xd8c4ff, 2.2, 0.25); puff(m.g.position.clone().setY(m.y + 0.4), 0xb48cff, { n: 8, speed: 5, size: 0.22, life: 0.35 }); }, i * 70); });
      ctx.shake(0.12);
    }
    flash(hand, 0xb48cff, 1.8, 0.2); Snd.cast && Snd.cast("shock");
    return true;
  }
  // a patch of burning ground (Wildfire): flickers for two seconds and singes whatever stands in it
  function groundFire(at) {
    const p = at.clone().setY(0.07), disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), additive(0xff7a2a, 0.35)); disc.rotation.x = -Math.PI / 2; disc.position.copy(p); add(disc);
    let tick = 0;
    fx.push({ o: disc, life: 2, t: 0, onTick: (k) => { disc.material.opacity = 0.35 * (1 - k) + Math.sin(k * 40) * 0.05; if ((tick += 1) % 6 === 0) { puff(p.clone().add(new V3((Math.random() - 0.5) * 4, 0.2, (Math.random() - 0.5) * 4)), 0xff7a2a, { n: 2, speed: 1, size: 0.6, life: 0.5, grav: -3 }); for (const m of mobs) if (!m.dead && m.g.position.distanceTo(tmp.copy(p).setY(m.g.position.y)) < 3.2) { m.burn = Math.max(m.burn, 1); m.burnD = Math.max(m.burnD || 0, 2); } } } });
  }
  function bolt(a, b) {
    const n = 9, pts = [];
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); if (i && i < n) p.add(new V3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6)); pts.push(p); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.3, 3.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); add(line);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.07, 5), new THREE.MeshBasicMaterial({ color: 0xf2ecff, transparent: true })); add(tube);
    const aura = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.22, 6), additive(0x9a6cff, 0.55)); add(aura); fx.push({ o: aura, life: 0.26, t: 0, op0: 0.55 });
    fx.push({ o: line, life: 0.28, t: 0, onTick: () => { const p = geo.attributes.position; for (let i = 1; i < n; i++) p.setXYZ(i, pts[i].x + (Math.random() - 0.5) * 0.25, pts[i].y + (Math.random() - 0.5) * 0.25, pts[i].z + (Math.random() - 0.5) * 0.25); p.needsUpdate = true; } });
    fx.push({ o: tube, life: 0.22, t: 0 });
  }
  function tickShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.t += dt; s.o.position.addScaledVector(s.v, dt); s.o.rotation.x += dt * 8; s.o.rotation.y += dt * 6;
      s.trail -= dt;
      if (s.trail <= 0 && !ctx.reduce) { s.trail = 0.025; puff(s.o.position, s.kind === "ice" ? 0x8fe6ff : 0xff7a2a, { n: s.kind === "fire" ? 3 : 2, speed: 0.8, size: s.kind === "fire" ? 0.95 : 0.5, life: s.kind === "fire" ? 0.5 : 0.45, grav: s.kind === "fire" ? -2 : 1, up: 0.3 }); if (s.kind === "fire") puff(s.o.position, 0xffe08a, { n: 1, speed: 0.4, size: 0.5, life: 0.25, grav: 0 }); }
      if (s.kind === "meteor") {
        if (s.trail <= 0.02) puff(s.o.position, 0xff7a2a, { n: 4, speed: 1, size: 1.4, life: 0.6, grav: -1 });
        if (s.t < s.life) continue;
        const p = s.at.clone();
        for (const m of mobs) if (!m.dead && m.g.position.distanceTo(tmp.copy(p).setY(m.g.position.y)) < (m.rank === "boss" ? 6.5 : 4.5) * (s.big || 1)) { const c = critRoll(); hit(m, s.dmg * (c ? 1.8 : 1), p, "meteor", c); }
        flash(p.clone().setY(1), 0xffb060, 8, 0.45); ring(p, 0xff7a2a, { r0: 0.6, r1: 6.5 * (s.big || 1), life: 0.6, y: 0.15 }); ring(p, 0xffd27a, { r0: 0.3, r1: 4, life: 0.45, y: 0.3 });
        puff(p.clone().setY(0.8), 0xff7a2a, { n: 34, speed: 9, size: 0.9, life: 0.8, grav: -1 }); puff(p.clone().setY(0.6), 0x55504a, { n: 16, speed: 2.5, size: 1.6, life: 1.4, grav: -1.2 });
        shards(p.clone().setY(0.5), 0x8a4a32, 18, 9); ctx.shake(0.45);
        root.remove(s.o); s.o.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); shots.splice(i, 1);
        continue;
      }
      let target = null;
      for (const m of mobs) { const rad = m.rank === "boss" ? 2.6 : 1.0; if (!m.dead && m.g.position.distanceTo(tmp.copy(s.o.position).setY(m.g.position.y)) < rad && Math.abs(s.o.position.y - (m.y + 0.4)) < (m.rank === "boss" ? 4 : 1.6)) { target = m; break; } }
      if (target || s.t > s.life || s.o.position.y < 0.1) {
        const p = s.o.position.clone(), c = critRoll();
        if (s.kind === "ice") {
          if (target) hit(target, s.dmg * (c ? 1.8 : 1), me, "ice", c);
          shards(p, 0xbff0ff, 14, 6); ring(p, 0x8fe6ff, { r0: 0.3, r1: 2.2, life: 0.4 }); flash(p, 0xcff6ff, 2.2, 0.2);
        } else {
          if (target) hit(target, s.dmg * (c ? 1.8 : 1), me, "fire", c);
          for (const m of mobs) if (m !== target && !m.dead && m.g.position.distanceTo(p) < (s.wide ? 4.5 : 3)) hit(m, s.dmg * (s.wide ? 0.8 : 0.6), p, "fire");
          if (s.wide) { ring(p, 0xffd27a, { r0: 0.6, r1: 4.8, life: 0.5 }); groundFire(p); }
          flash(p, 0xffb060, 4.2, 0.3); puff(p, 0xff7a2a, { n: 18, speed: 6, size: 0.6, life: 0.6, grav: -1 }); puff(p, 0x55504a, { n: 8, speed: 1.5, size: 1.1, life: 1.1, grav: -1.5 }); ring(p, 0xff9a4a, { r0: 0.4, r1: 3.2, life: 0.45 });
          ctx.shake(0.14);
        }
        root.remove(s.o); s.o.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); shots.splice(i, 1);
      }
    }
  }

  // ---------------- street items ----------------
  const pickW = ITEMS.reduce((a, b) => a + b.w, 0);
  const coinTex = new THREE.TextureLoader().load("/images/arcl-128.png"); coinTex.colorSpace = THREE.SRGBColorSpace;
  function itemMesh(it) {
    const g = new THREE.Group(), c = it.color;
    const glowM = (k = 1.2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.3, metalness: 0.3 });
    if (it.id === "coin") { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 28), [new THREE.MeshStandardMaterial({ color: 0xffc861, metalness: 0.8, roughness: 0.25 }), new THREE.MeshStandardMaterial({ map: coinTex, emissive: 0x224466, emissiveIntensity: 0.4 }), new THREE.MeshStandardMaterial({ map: coinTex, emissive: 0x224466, emissiveIntensity: 0.4 })]); m.rotation.x = Math.PI / 2; g.add(m); }
    else if (it.id === "boots") { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.5), glowM(0.6)); b.position.set(-0.2, 0, 0); const b2 = b.clone(); b2.position.x = 0.2; const w = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 3), glowM(1.4)); w.rotation.z = Math.PI / 2; w.position.set(-0.45, 0.12, -0.1); const w2 = w.clone(); w2.position.x = 0.45; w2.rotation.z = -Math.PI / 2; g.add(b, b2, w, w2); }
    else if (it.id === "spring") { const s = new THREE.Mesh(new THREE.TorusKnotGeometry(0.22, 0.05, 64, 8, 1, 6), glowM(1)); s.scale.set(1, 1.8, 1); g.add(s); }
    else if (it.id === "star") { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.2 : 0.46, a = (i / 10) * TAU + Math.PI / 2; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }), glowM(1.3)); m.geometry.center(); g.add(m); }
    else if (it.id === "potion") { const glass = new THREE.MeshPhysicalMaterial({ color: 0xffd6dc, roughness: 0.05, transparent: true, opacity: 0.45 }); const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), glass); const liq = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14, 0, TAU, Math.PI * 0.35, Math.PI * 0.65), glowM(1.1)); const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 12), glass); neck.position.y = 0.34; const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a36 })); cork.position.y = 0.5; g.add(body, liq, neck, cork); }
    else if (it.id === "mana") { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 1, roughness: 0.05, flatShading: true, transparent: true, opacity: 0.85 })); m.scale.y = 1.6; g.add(m); }
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
    const p = x.g.position.clone(); root.remove(x.g); items.splice(items.indexOf(x), 1);
    if (x.pulled && ctx.onFetch) ctx.onFetch();
    puff(p, x.it.color, { n: 12, speed: 4, size: 0.35, life: 0.6, grav: 2 }); ring(p, x.it.color, { r0: 0.2, r1: 1.8, life: 0.35, y: 0.1 });
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
      if (d > 50) { root.remove(x.g); items.splice(i, 1); continue; }
      if ((buffs.magnet > 0 && d < 9) || (petPull && d < petPull)) { if (!(buffs.magnet > 0 && d < 9)) x.pulled = true; tmp.set(me.x - x.g.position.x, 0, me.z - x.g.position.z).normalize(); x.g.position.addScaledVector(tmp, dt * 9); }
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
  };
  bar.innerHTML = `<div class="wc-buffs" id="wc-buffs"></div>
    <div class="wc-pots"><button type="button" class="wc-pot hp" data-skill="pot-hp" aria-label="${T("Health potion")}">${ICON.hp}<b class="wc-key">4</b><em id="wc-pot-hp">0</em></button><button type="button" class="wc-pot sp" data-skill="pot-sp" aria-label="${T("Mana potion")}">${ICON.hp}<b class="wc-key">5</b><em id="wc-pot-sp">0</em></button></div>
    <button type="button" class="wc-skill wc-slot" data-skill="slot"><i></i><em class="wc-cd"></em><b class="wc-key">Z</b><small class="wc-lock"></small><small class="wc-slv"></small><span class="wc-swap" data-swap hidden aria-label="${T("Change skill")}"><svg viewBox="0 0 24 24"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg></span></button>
    <button type="button" class="wc-attack" data-skill="attack" aria-label="${T("Attack")}"><i>${ICON.attack}</i><em class="wc-cd"></em><b class="wc-key">J</b><span class="wc-combo" id="wc-combo"></span></button>
    <div class="wc-pick" id="wc-pick" hidden role="menu"></div>`;
  document.body.appendChild(bar);
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
    if (id === "attack") attack(); else if (id === "pot-hp") drink("hp"); else if (id === "pot-sp") drink("sp");
    b.classList.remove("press"); void b.offsetWidth; b.classList.add("press");
  });
  slotBtn.addEventListener("pointerup", (e) => {
    clearTimeout(holdT); if (held || !slotSkill() || e.target.closest("[data-swap]")) return;
    closePick(); const s = slotSkill(); cast(s.id); slotBtn.classList.remove("press"); void slotBtn.offsetWidth; slotBtn.classList.add("press");
  });
  slotBtn.addEventListener("pointercancel", () => clearTimeout(holdT));
  slotBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  function paintSkills() {
    const s = slotSkill(), n = learned().length;
    slotBtn.className = "wc-skill wc-slot" + (s ? " wc-" + s.id : " locked");
    slotBtn.querySelector("i").innerHTML = s ? ICON[s.id] : ICON.lock;
    slotBtn.querySelector(".wc-lock").textContent = s ? "" : T("Lv {n}", { n: SKILLS[0].lv });
    slotBtn.querySelector(".wc-slv").textContent = s ? "★".repeat(skillLevel(ctx.level(), s.lv)) : "";
    slotBtn.querySelector("[data-swap]").hidden = n < 2;
    slotBtn.setAttribute("aria-label", s ? `${T(s.name)} (Z)` : T("Your first skill opens at level 10"));
    slotBtn.title = s ? `${T(s.name)} (Z) · ${T("Skill level {n}", { n: skillLevel(ctx.level(), s.lv) })}${n > 1 ? " · " + T("Q or a long press changes it") : ""}` : T("Your first skill opens at level 10");
  }
  function paintPots() { const p = rpg.potions(); bar.querySelector("#wc-pot-hp").textContent = p.hp; bar.querySelector("#wc-pot-sp").textContent = p.sp; bar.querySelector('[data-skill="pot-hp"]').classList.toggle("empty", !p.hp); bar.querySelector('[data-skill="pot-sp"]').classList.toggle("empty", !p.sp); }
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
  }
  function paintBuffs() {
    const el = bar.querySelector("#wc-buffs");
    el.innerHTML = Object.entries(buffs).filter(([, s]) => s > 0).map(([id, s]) => { const it = ITEMS.find((x) => x.id === id); return `<span style="--c:#${new THREE.Color(it.color).getHexString()}">${T(it.name)} <b>${Math.ceil(s)}</b></span>`; }).join("");
  }
  paintSkills(); paintPots();

  // ---------------- HP, SP and XP: always on screen in the streets ----------------
  const vit = document.createElement("div"); vit.className = "wc-vit"; vit.id = "wc-vit"; vit.setAttribute("data-no-i18n", "");
  vit.innerHTML = `<div class="wc-v hp"><span>HP</span><i><b id="wc-hp-b"></b><u id="wc-hp-g"></u></i><em id="wc-hp-n"></em></div><div class="wc-v sp"><span>SP</span><i><b id="wc-sp-b"></b></i><em id="wc-sp-n"></em></div><div class="wc-v xp"><span>XP</span><i><b id="wc-xp-b"></b></i><em id="wc-xp-n"></em></div>`;
  (document.querySelector(".wp-hud-l") || document.body).insertBefore(vit, document.getElementById("wp-quests"));
  let ghostHp = hp;
  function paintVit() {
    const mh = maxHp(), ms = maxSp(); hp = Math.min(hp, mh); sp = Math.min(sp, ms);
    vit.querySelector("#wc-hp-b").style.width = (100 * hp / mh) + "%"; vit.querySelector("#wc-sp-b").style.width = (100 * sp / ms) + "%";
    vit.querySelector("#wc-hp-g").style.width = (100 * Math.max(hp, ghostHp) / mh) + "%";
    vit.querySelector("#wc-hp-n").textContent = `${Math.ceil(hp)} / ${mh}`; vit.querySelector("#wc-sp-n").textContent = `${Math.floor(sp)} / ${ms}`;
    const xp = ctx.xp ? ctx.xp() : 0, into = xp % 100; vit.querySelector("#wc-xp-b").style.width = into + "%"; vit.querySelector("#wc-xp-n").textContent = `${into} / 100`;
    vit.classList.toggle("danger", hp / mh < 0.3); document.body.classList.toggle("wc-low", hp / mh < 0.3 && !down && ctx.inHub());
  }
  function damage(n) {
    ghostHp = Math.max(ghostHp, hp); hp = Math.max(0, hp - n); calmT = 4; paintVit();
    vit.classList.remove("hit"); void vit.offsetWidth; vit.classList.add("hit");
    ctx.float("-" + n, tmp2.copy(me).setY(2.6), "#ff5f73", n > maxHp() * 0.2);
    if (hp <= 0) goDown();
  }
  const dead = document.createElement("div"); dead.className = "wc-dead"; dead.id = "wc-dead"; dead.hidden = true; dead.setAttribute("role", "alertdialog"); dead.setAttribute("aria-modal", "true"); dead.setAttribute("data-no-i18n", "");
  document.body.appendChild(dead);
  let waitT = 0, paying = false;
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
  function goDown() {
    if (down) return; down = true; ctx.down(true); document.body.classList.remove("wc-low");
    for (const m of mobs) if (!m.dead && m.rank !== "boss") { m.dead = 0.001; puff(m.g.position.clone().setY(0.6), 0xff4d6d, { n: 8, speed: 3, size: 0.5, life: 0.6, grav: -1 }); }
    waitT = performance.now() + 8000;
    dead.innerHTML = `<div class="wc-dead-card"><h2>${T("You got scammed!")}</h2><p>${T("The street scammers knocked you out.")}</p>
      <button type="button" class="wc-revive" id="wc-revive"><img src="/images/arcircle-mark-sm.png" alt="" width="28" height="19"><span><b>${T("Revive here")}</b><small>${T("10,000 $ARCIRCLE · half is burned, half goes to the treasury")}</small></span></button>
      <button type="button" class="wc-respawn" id="wc-respawn" disabled><b>${T("Respawn on the plaza")}</b><small id="wc-wait"></small></button>
      <p class="wc-dead-tip">${tipAfterKO()}</p>
      <p class="wc-dead-note" id="wc-dead-note">${T("Reviving sends $ARCIRCLE from your own wallet; you confirm it there.")}</p></div>`;
    setTimeout(() => { dead.hidden = false; }, 900);
  }
  function getUp(where) {
    down = false; paying = false; dead.hidden = true; hp = maxHp(); sp = maxSp(); ghostHp = hp; guardT = 3; paintVit(); ctx.down(false, where);
    if (where === "plaza") { hideBossBar(); for (const m of mobs) if (m.rank === "boss") { root.remove(m.g); } for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].rank === "boss") mobs.splice(i, 1); }
    ctx.here(me); ring(me, 0x39ff88, { r0: 0.4, r1: 3.4, life: 0.6, y: 0.15 }); puff(me.clone().setY(1.2), 0x39ff88, { n: 18, speed: 4, size: 0.35, life: 0.8, grav: -1 });
  }
  dead.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.id === "wc-respawn") { getUp("plaza"); return; }
    if (b.id === "wc-revive" && !paying) {
      paying = true; b.disabled = true;
      const note = dead.querySelector("#wc-dead-note");
      const ok = await ctx.pay("revive", (t) => { note.textContent = t; }).catch(() => false);
      if (ok && down) getUp("here"); else { paying = false; b.disabled = false; }
    }
  });
  paintVit();

  // ---------------- the loop ----------------
  let buffPaint = 0, placeT = 0, zoneT = 0;
  function place() { bar.style.bottom = ""; } // the buttons share one corner layout with the move buttons (arc-v10.css v25)
  function spawnTick(dt) {
    const kit = ctx.kit(); if (!kit || !kit.enemies || !kit.enemies.EyeDrone) return; // the robots are still loading
    ctx.here(me);
    const z = zone;
    if (z) {
      const alive = mobs.filter((m) => !m.dead && m.zone === z && m.rank !== "boss").length;
      if ((spawnT -= dt) <= 0) { spawnT = 3 + Math.random() * 3; if (alive < 5) { const lv = z.lv[0] + Math.floor(Math.random() * (z.lv[1] - z.lv[0] + 1)); spawnMob({ type: z.mobs[Math.floor(Math.random() * z.mobs.length)], lv, rank: Math.random() < 0.12 ? "elite" : "", zone: z }); } }
      const next = bossAt()[z.id] || 0;
      if (next && Date.now() >= next && !mobs.some((m) => m.rank === "boss" && !m.dead)) { setBoss(z.id, Date.now() + BOSS_EVERY); spawnMob({ rank: "boss", lv: z.lv[1] + 2, zone: z, boss: z.boss, at: new V3(z.x, 0, z.z) }); }
    } else if (Math.hypot(me.x, me.z) > 16 && !(ctx.inRaid && ctx.inRaid())) {
      if ((spawnT -= dt) <= 0) { spawnT = 22 + Math.random() * 30; if (mobs.filter((m) => !m.dead && !m.zone).length < 3) spawnMob({ lv: 1 + Math.floor(Math.random() * 3) }); }
    }
  }
  function tick(dt, t) {
    const on = ctx.active();
    bar.hidden = !ctx.inHub(); vit.hidden = !ctx.inHub();
    if ((placeT -= dt) <= 0) { placeT = 1; place(); }
    for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);
    comboT = Math.max(0, comboT - dt);
    paintCd();
    let changed = false; for (const k in buffs) { if (buffs[k] > 0) { buffs[k] = Math.max(0, buffs[k] - dt); if (!buffs[k]) changed = true; } }
    if ((buffPaint -= dt) <= 0 || changed) { buffPaint = 0.5; paintBuffs(); }
    if (ghostHp > hp) { ghostHp = Math.max(hp, ghostHp - dt * maxHp() * 0.5); paintVit(); }
    if (down) { const left = Math.max(0, (waitT - performance.now()) / 1000), b = dead.querySelector("#wc-respawn"), w = dead.querySelector("#wc-wait"); if (b && w) { b.disabled = left > 0; w.textContent = left > 0 ? T("free, in {n} s", { n: Math.ceil(left) }) : T("free"); } }
    else {
      guardT = Math.max(0, guardT - dt); calmT = Math.max(0, calmT - dt);
      // out of a fight with full bars: the vitals panel shrinks to slim bars (phones get their screen back)
      const quiet = calmT <= 0 && hp >= maxHp() - 0.5 && sp >= maxSp() - 0.5 && !mobs.some((m) => !m.dead && m.g.position.distanceTo(me) < 12);
      if (!quiet) quietT = 0; else if (!quietT) quietT = performance.now();
      vit.classList.toggle("calm", !!quietT && performance.now() - quietT > 3000);
      const mh = maxHp(), ms = maxSp(), h0 = hp, s0 = sp; if (calmT <= 0) hp = Math.min(mh, hp + mh * 0.025 * dt); sp = Math.min(ms, sp + ms * 0.06 * dt);
      if (Math.floor(h0) !== Math.floor(hp) || Math.floor(s0) !== Math.floor(sp)) paintVit();
      if (hp / mh < 0.3 && ctx.inHub()) { heartT -= dt; if (heartT <= 0) { heartT = 0.85; Snd.heart && Snd.heart(); } }
    }
    tickFx(dt);
    if (stopT > 0) { stopT -= dt; return; } // hit-stop: everything in the fight holds still for a beat
    tickShots(dt);
    if (!ctx.inHub()) { root.visible = false; zoneEl.hidden = true; bossEl.hidden = true; return; } // an island or a sheet: the boss bar steps away too
    root.visible = true;
    if ((zoneT -= dt) <= 0) {
      zoneT = 0.5; ctx.here(me); const z = zoneAt(me.x, me.z);
      if (z !== zone) { zone = z; if (z && z !== zoneShown) enterZone(z); zoneShown = z; ctx.onZone && ctx.onZone(z); spawnT = Math.min(spawnT, 2); }
      paintZone();
      const bm = mobs.find((m) => m.rank === "boss" && !m.dead); if (bm && bossEl.hidden) bossBar(bm); else if (!bm && !bossEl.hidden) hideBossBar();
    }
    tickMobs(dt, t); tickItems(dt, t); tickDrops(dt, t);
    if (!on) return;
    spawnTick(dt);
    if ((itemT -= dt) <= 0) { itemT = 5 + Math.random() * 6; if (items.length < 7) spawnItem(); }
  }
  function keyDown(k) {
    if (k === "j") return attack();
    if (k === "q") return nextSkill() || true;
    if (k === "4") return drink("hp") || true;
    if (k === "5") return drink("sp") || true;
    if (k === "z") { const s = slotSkill(); if (s) cast(s.id); else ctx.toast(T("Your first skill opens at level 10")); return true; }
    return false;
  }
  let lastLv = ctx.level();
  function onLevel(n, before) {
    paintSkills(); hp = maxHp(); sp = maxSp(); ghostHp = hp; paintVit(); paintPots();
    ctx.here(me); pillar(me, 0xffb347, 16, 1.6, 1.1); ring(me, 0xffc861, { r0: 0.4, r1: 5, life: 0.9, y: 0.15 }); puff(me.clone().setY(1.2), 0xffe08a, { n: 30, speed: 6, size: 0.4, life: 1.2, grav: -2 });
    if (before) { const now = stats(); [["atk", "Attack"], ["def", "Defense"], ["hp", "Max HP"], ["sp", "Max SP"]].forEach(([k, n], i) => { const d = now[k] - before[k]; if (d > 0) setTimeout(() => ctx.float(`${T(n)} +${d}`, me.clone().setY(2.8 + i * 0.1), "#ffe08a"), 500 + i * 260); }); }
    const s = SKILLS.filter((x) => x.lv > lastLv && x.lv <= n).pop(); lastLv = n;
    if (s) { rpg.setSkill(s.id); paintSkills(); setTimeout(() => { ctx.skillCard ? ctx.skillCard(s) : ctx.toast(T("New skill: {x}! It's in your skill slot (Z).", { x: T(s.name) })); slotBtn.classList.add("learned"); setTimeout(() => slotBtn.classList.remove("learned"), 2600); ring(me, s.color, { r0: 0.4, r1: 4, life: 0.8, y: 0.2 }); }, 1400); }
  }
  return {
    bosses: () => mobs.filter((m) => m.rank === "boss" && !m.dead && m.zone).map((m) => m.zone.id),
    tick, keyDown, attack, dodge, cast, drink, onLevel, slot: () => (slotSkill() || {}).id || null, setSlot, nextSkill, paintSkills, paintPots, onGear: () => { paintVit(); },
    vitals: () => ({ hp, sp, max: maxHp(), maxSp: maxSp(), down }), hurtMe: (n) => damage(n), zone: () => zone,
    speedMul: () => (buffs.boots > 0 ? 1.4 : 1) * (1 + stats().spd / 100), jumpMul: () => (buffs.spring > 0 ? 1.35 : 1),
    spawnMob, spawnItem, state: () => ({ mobs: mobs.filter((m) => !m.dead).map((m) => ({ id: m.spec.id, lv: m.lv, rank: m.rank, hp: m.hp, max: m.max, x: m.g.position.x, z: m.g.position.z })), items: items.map((x) => x.it.id), drops: drops.length, dropAt: drops.map((d) => [d.g.position.x, d.g.position.z]), cd: { ...cd }, buffs: { ...buffs }, combo, zone: zone && zone.id }),
    spawnNear(dist = 3, o = {}) { const kit = ctx.kit(); if (!kit) return false; spawnT = 999; ctx.here(me); fwdOf(fwd); const at = me.clone().addScaledVector(fwd, dist).setY(0); return !!spawnMob({ ...o, at, zone: o.zone ? ZONES.find((z) => z.id === o.zone) : zone, boss: o.rank === "boss" ? (ZONES.find((z) => z.id === o.zone) || ZONES[0]).boss : undefined }); },
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
    raidPhase: (p) => { raidPhase = p; },
    spawnRaid(o) { return spawnMob({ ...o, rank: "boss", raid: true }); },
    raidSet(hpNow) { const m = mobs.find((x) => x.raid && !x.dead); if (!m) return; m.hp = Math.max(1, Math.min(m.max, hpNow)); label(m); bossBar(m); },
    raidDown() {
      const m = mobs.find((x) => x.raid && !x.dead); if (!m) return;
      // its swarm scatters with it
      for (const x of mobs) if (!x.dead && !x.raid && x.zone === m.zone) { x.dead = 0.001; puff(x.g.position.clone().setY(0.6), 0x9fffd0, { n: 10, speed: 3, size: 0.5, life: 0.6, grav: -1 }); }
      m.hp = 0; label(m); kill(m);
    },
    dropNear(item) { ctx.here(me); dropChest(me.clone().add(new V3(2, 0, 0)), item); },
  };
}
