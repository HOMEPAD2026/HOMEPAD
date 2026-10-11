// world-combat.js — fighting and finding things in the streets of ARCIRCLE World.
//
//   street scammers  small scam bots show up now and then around the player (never on the plaza), chase you and
//                    try to shove you around. Knock them out for XP and a little ARCL.
//   attack           a quick strike in front of you (J, or the Attack button)
//   skills           learned by levelling up: Ice Ball (level 2, Z — slows), Fire Ball (level 3, X — splashes) and
//                    Shock (level 4, C — chains between nearby scammers and stuns). Each has a cooldown.
//   street items     ARCL coins, speed boots, a spring, XP stars, mana crystals (SP full, skills ready), health potions,
//                    a shield and a magnet, scattered around you; each does something for a while.
//   HP and SP        scammers take HP, skills cost SP; both refill over time. At 0 HP you go down: respawn on the plaza
//                    for free, or revive on the spot for 10,000 $ARCIRCLE (the player's own transfer; half is burned).
// ARCL from fighting and items goes through the server's claim (kinds "street" and "pickup"): small amounts, a daily
// limit and a minimum gap between claims, because the server can't watch a fight.
const TAU = Math.PI * 2;
export const SKILLS = [
  { id: "ice", name: "Ice Ball", key: "Z", lv: 2, cd: 2.6, sp: 15, color: 0x8fe6ff },
  { id: "fire", name: "Fire Ball", key: "X", lv: 3, cd: 4.0, sp: 25, color: 0xff7a2a },
  { id: "shock", name: "Shock", key: "C", lv: 4, cd: 6.0, sp: 35, color: 0xb48cff },
];
const MOBS = [
  { id: "spam", name: "Spam Bot", model: "EyeDrone", scale: 0.7, y: 1.2, hp: 3, speed: 2.4, xp: 8, dmg: 12, color: "#ff4d6d" },
  { id: "drop", name: "Fake Airdrop", model: "QuadShell", scale: 0.85, y: 0.45, hp: 4, speed: 2.0, xp: 10, dmg: 15, color: "#ffc861" },
  { id: "rug", name: "Rug Gremlin", model: "Trilobite", scale: 0.95, y: 0.55, hp: 6, speed: 2.7, xp: 14, dmg: 20, color: "#b48cff" },
];
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

/// ctx: { THREE, K, kit(), planet, st, here(v), facing(), avatar(), level(), T, toast, Snd, reduce, coarse,
///        active() (hub, not frozen, not flying), gain(xp, why), claim(kind, extra, from), knock(dirVec3, power),
///        screenOf(vec3) → {x, y}, float(text, worldPos, color), shake(n) }
export function createCombat(ctx) {
  const { THREE, K, planet, Snd } = ctx;
  // single words stay out of the site-wide dictionary
  const LW = { ko: { Spring: "스프링", Shield: "보호막", Magnet: "자석", Shock: "전기충격", Attack: "공격", free: "무료" }, zh: { Spring: "弹簧", Shield: "护盾", Magnet: "磁铁", Shock: "电击", Attack: "攻击", free: "免费" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const V3 = THREE.Vector3;
  const root = new THREE.Group(); root.name = "combat"; planet.add(root);
  const mobs = [], items = [], shots = [], fx = [];
  const cd = { attack: 0, ice: 0, fire: 0, shock: 0 };
  const maxOf = () => 100 + (ctx.level() - 1) * 10;
  let hp = maxOf(), sp = maxOf(), calmT = 0, down = false, guardT = 0;
  const buffs = {}; // id → seconds left
  let spawnT = 12, itemT = 2, hurtT = 0;
  const me = new V3(), tmp = new V3(), tmp2 = new V3(), fwd = new V3();
  const add = (m) => { root.add(m); return m; };
  const additive = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const dotTex = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const spriteMat = (c, o = 1) => new THREE.SpriteMaterial({ map: dotTex, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const unlocked = (s) => ctx.level() >= s.lv;
  const fwdOf = (out) => { const f = ctx.facing(); return out.set(Math.sin(f), 0, Math.cos(f)); };

  // ---------------- particles: short-lived sprites and meshes ----------------
  function puff(pos, color, { n = 10, speed = 4, size = 0.35, life = 0.6, up = 1, grav = 4, spread = 1 } = {}) {
    if (ctx.reduce) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(spriteMat(color)); s.position.copy(pos); s.scale.setScalar(size * (0.6 + Math.random() * 0.8)); add(s);
      const a = Math.random() * TAU, e = (Math.random() - 0.3) * spread;
      fx.push({ o: s, v: new V3(Math.cos(a) * speed * Math.random(), (0.5 + Math.random()) * speed * 0.6 * up, Math.sin(a) * speed * Math.random()).addScaledVector(new V3(0, e, 0), 1), life, t: 0, grav, s0: s.scale.x });
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
  function flash(pos, color, size = 3, life = 0.25) { const s = new THREE.Sprite(spriteMat(color)); s.position.copy(pos); s.scale.setScalar(size); add(s); fx.push({ o: s, life, t: 0, grow: [size, size * 1.6], fade: true }); }
  function tickFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i]; p.t += dt; const k = p.t / p.life;
      if (k >= 1) { root.remove(p.o); if (p.o.material) p.o.material.dispose(); if (p.o.geometry && !p.keepGeo) p.o.geometry.dispose(); fx.splice(i, 1); continue; }
      if (p.v) { p.v.y -= (p.grav || 0) * dt; p.o.position.addScaledVector(p.v, dt); if (p.o.position.y < 0.05) { p.o.position.y = 0.05; p.v.multiplyScalar(0.5); } }
      if (p.spin) { p.o.rotation.x += p.spin.x * dt; p.o.rotation.y += p.spin.y * dt; }
      if (p.grow) p.o.scale.setScalar(p.grow[0] + (p.grow[1] - p.grow[0]) * (1 - Math.pow(1 - k, 2)));
      else if (p.s0) p.o.scale.setScalar(p.s0 * (1 - k * 0.6));
      if (p.o.material) p.o.material.opacity = (p.op0 ?? 1) * (1 - k);
      if (p.onTick) p.onTick(k);
    }
  }

  // ---------------- street scammers ----------------
  function hpBar() {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 40; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })); sp.scale.set(1.5, 0.47, 1); sp.renderOrder = 11;
    sp.userData.draw = (name, k, color) => { const g = cv.getContext("2d"); g.clearRect(0, 0, 128, 40); g.font = "700 15px Sora, sans-serif"; g.textAlign = "center"; g.fillStyle = "rgba(6,10,16,.75)"; g.beginPath(); g.roundRect(4, 2, 120, 20, 10); g.fill(); g.fillStyle = color; g.fillText(name, 64, 17); g.fillStyle = "rgba(6,10,16,.8)"; g.beginPath(); g.roundRect(14, 26, 100, 10, 5); g.fill(); g.fillStyle = k > 0.5 ? "#39ff88" : k > 0.25 ? "#ffc861" : "#ff4d6d"; g.beginPath(); g.roundRect(16, 28, 96 * Math.max(0, k), 6, 3); g.fill(); tex.needsUpdate = true; };
    return sp;
  }
  function spawnMob() {
    const kit = ctx.kit(); if (!kit) return;
    const spec = MOBS[Math.floor(Math.random() * MOBS.length)];
    const e = K.enemy(kit, spec.model); if (!e) return;
    ctx.here(me);
    let p = null;
    for (let tries = 0; tries < 8 && !p; tries++) { const a = Math.random() * TAU, d = 11 + Math.random() * 8; const c = new V3(me.x + Math.cos(a) * d, 0, me.z + Math.sin(a) * d); if (Math.hypot(c.x, c.z) > 16) p = c; }
    if (!p) return;
    const g = new THREE.Group(); g.position.copy(p);
    e.obj.scale.setScalar(spec.scale); e.obj.position.y = spec.y; g.add(e.obj);
    const tint = new THREE.Color(spec.color); e.obj.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); if (o.material.emissive) { o.material.emissive.copy(tint); o.material.emissiveIntensity = 0.18; } } });
    const bb = new THREE.Box3().setFromObject(e.obj); const bar = hpBar(); bar.position.y = Math.max(spec.y + 0.8, bb.max.y + 0.45); g.add(bar);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; g.add(sh);
    add(g); e.play("Run");
    const m = { g, e, spec, hp: spec.hp, slow: 0, stun: 0, hitT: 0, bar, born: 0, dead: 0, wander: Math.random() * TAU };
    bar.userData.draw(T(spec.name), 1, spec.color); mobs.push(m);
    // they arrive in a puff of red smoke
    puff(new V3(p.x, 0.6, p.z), 0xff4d6d, { n: 14, speed: 3, size: 0.6, life: 0.7, grav: -1 });
  }
  function hit(m, dmg, from, kind) {
    if (m.dead) return;
    m.hp -= dmg; m.hitT = 0.18; m.bar.userData.draw(T(m.spec.name), m.hp / m.spec.hp, m.spec.color);
    tmp.copy(m.g.position).sub(from).setY(0); if (tmp.lengthSq() > 1e-4) tmp.normalize();
    m.g.position.addScaledVector(tmp, kind === "fire" ? 1.4 : kind === "shock" ? 0.3 : 0.9);
    if (kind === "ice") m.slow = 3; if (kind === "shock") m.stun = 1.2;
    m.e.play("Hit", { once: true, fade: 0.05 });
    ctx.float("-" + dmg, tmp2.copy(m.g.position).setY(m.spec.y + 1.8), kind === "ice" ? "#8fe6ff" : kind === "fire" ? "#ffb070" : kind === "shock" ? "#d8c4ff" : "#ffffff");
    if (m.hp <= 0) kill(m);
  }
  function kill(m) {
    m.dead = 0.001; Snd.win && Snd.coin();
    const p = m.g.position.clone().setY(m.spec.y + 0.4);
    // they break into pixels
    shards(p, new THREE.Color(m.spec.color).getHex(), 16, 7); flash(p, 0xffffff, 2.6, 0.2); puff(p, 0xffc861, { n: 12, speed: 5, size: 0.3, life: 0.8, grav: 6 });
    ctx.shake(0.18);
    ctx.gain(m.spec.xp, T("Knocked out a {x}", { x: T(m.spec.name) }));
    ctx.claim("street", {}, ctx.screenOf(p));
  }
  function tickMobs(dt, t) {
    ctx.here(me);
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      m.e.mixer.update(dt);
      if (m.dead) { m.dead += dt; m.g.scale.setScalar(Math.max(0.01, 1 - m.dead * 4)); m.g.position.y += dt * 2; if (m.dead > 0.3) { root.remove(m.g); mobs.splice(i, 1); } continue; }
      tmp.copy(me).sub(m.g.position).setY(0); const d = tmp.length();
      if (d > 45) { root.remove(m.g); mobs.splice(i, 1); continue; }
      m.slow = Math.max(0, m.slow - dt); m.stun = Math.max(0, m.stun - dt); m.hitT = Math.max(0, m.hitT - dt);
      const body = m.e.obj;
      body.position.x = m.hitT > 0 ? Math.sin(t * 90) * 0.06 : 0;
      body.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) o.material.emissiveIntensity = m.hitT > 0 ? 1.2 : m.slow > 0 ? 0.5 : m.stun > 0 ? 0.9 + Math.sin(t * 40) * 0.5 : 0.18; if (o.isMesh && o.material && o.material.emissive) o.material.emissive.set(m.slow > 0 ? 0x5fd8ff : m.stun > 0 ? 0xb48cff : m.spec.color); });
      if (m.stun > 0) continue;
      const sp = m.spec.speed * (m.slow > 0 ? 0.35 : 1);
      if (d < 13 && d > 1.2) { tmp.divideScalar(d); m.g.position.addScaledVector(tmp, sp * dt); m.g.rotation.y = Math.atan2(tmp.x, tmp.z); }
      else if (d >= 13) { m.wander += (Math.random() - 0.5) * dt; m.g.position.x += Math.cos(m.wander) * sp * 0.4 * dt; m.g.position.z += Math.sin(m.wander) * sp * 0.4 * dt; m.g.rotation.y = Math.atan2(Math.cos(m.wander), Math.sin(m.wander)); }
      // keep off the plaza
      const r = Math.hypot(m.g.position.x, m.g.position.z); if (r < 14) m.g.position.multiplyScalar(14 / r);
      m.g.position.y = Math.abs(Math.sin(t * 6 + i)) * 0.12;
      // a shove when they reach you
      if (d <= 1.3 && hurtT <= 0 && !down) {
        hurtT = 1.4; m.e.play("Attack", { once: true, fade: 0.05 });
        if (buffs.shield > 0) { flash(me.clone().setY(1.2), 0x4fa8ff, 3.2, 0.3); Snd.pop && Snd.pop(); }
        else if (guardT <= 0 && !down) { tmp.copy(me).sub(m.g.position).setY(0).normalize(); ctx.knock(tmp, 7); ctx.hurt(); damage(m.spec.dmg); }
      }
    }
    hurtT = Math.max(0, hurtT - dt);
  }

  // ---------------- attacking ----------------
  function attack() {
    if (!ctx.active() || cd.attack > 0) return false;
    cd.attack = 0.42; const av = ctx.avatar(); if (av) av.play("interact-right", { once: true, fade: 0.05, speed: 1.8 });
    Snd.swing ? Snd.swing() : Snd.pop && Snd.pop();
    ctx.here(me); fwdOf(fwd);
    // the slash: a bright crescent in front
    const arc = new THREE.Group(), blade = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.45, 40, 1, 0.2, 2.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    const glowB = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.7, 40, 1, 0.2, 2.6), additive(0x7fe6ff, 0.6)); glowB.material.side = THREE.DoubleSide;
    blade.rotation.z = -0.6; glowB.rotation.z = -0.6; arc.add(glowB, blade);
    arc.rotation.y = ctx.facing(); arc.position.copy(me).setY(1.15).addScaledVector(fwd, 1.0); add(arc);
    fx.push({ o: arc, life: 0.24, t: 0, grow: [0.75, 1.2], onTick: (k) => { blade.material.opacity = 0.95 * (1 - k); glowB.material.opacity = 0.6 * (1 - k); arc.rotation.z = -k * 1.2; } });
    let any = false;
    for (const m of mobs) { if (m.dead) continue; tmp.copy(m.g.position).sub(me).setY(0); const d = tmp.length(); if (d < 2.6 && (d < 0.8 || tmp.normalize().dot(fwd) > 0.25)) { hit(m, ctx.level() >= 5 ? 2 : 1, me, "melee"); any = true; puff(m.g.position.clone().setY(m.spec.y + 0.5), 0xffffff, { n: 6, speed: 4, size: 0.25, life: 0.3 }); } }
    if (any) ctx.shake(0.08);
    return true;
  }
  // aim: straight ahead, bent toward the closest scammer in front of you
  function aim(out) {
    ctx.here(me); fwdOf(out); let best = null, bd = 22;
    for (const m of mobs) { if (m.dead) continue; tmp.copy(m.g.position).sub(me).setY(0); const d = tmp.length(); if (d < bd && tmp.normalize().dot(out) > 0.55) { bd = d; best = m; } }
    if (best) out.copy(best.g.position).sub(me).setY(0).normalize();
    return best;
  }
  function cast(id) {
    const s = SKILLS.find((x) => x.id === id); if (!s || !ctx.active()) return false;
    if (!unlocked(s)) { ctx.toast(T("{x} unlocks at level {n}", { x: T(s.name), n: s.lv })); return false; }
    if (cd[id] > 0) return false;
    if (sp < s.sp) { ctx.toast(T("Not enough SP")); vit.classList.remove("low"); void vit.offsetWidth; vit.classList.add("low"); return false; }
    sp -= s.sp; cd[id] = s.cd; paintVit(); const av = ctx.avatar(); if (av) av.play("interact-right", { once: true, fade: 0.05, speed: 1.4 });
    ctx.here(me);
    const hand = me.clone().setY(1.25);
    if (id === "shock") return shock(hand);
    aim(fwd);
    const start = hand.addScaledVector(fwd, 0.7);
    const core = new THREE.Mesh(id === "ice" ? new THREE.IcosahedronGeometry(0.42, 0) : new THREE.SphereGeometry(0.44, 18, 14), id === "ice" ? new THREE.MeshStandardMaterial({ color: 0xcff6ff, emissive: 0x5fd8ff, emissiveIntensity: 1.4, roughness: 0.1, flatShading: true }) : new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.3) }));
    core.position.copy(start); add(core);
    const halo = new THREE.Sprite(spriteMat(s.color, 0.95)); halo.scale.setScalar(id === "fire" ? 3.0 : 2.3); core.add(halo);
    const hm = new THREE.SpriteMaterial({ map: dotTex, color: id === "fire" ? 0xff5a1a : 0x2f9be8, transparent: true, opacity: 0.55, depthWrite: false }); const shade = new THREE.Sprite(hm); shade.scale.setScalar(id === "fire" ? 1.9 : 1.6); core.add(shade);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: id === "fire" ? 0xffd27a : 0xe6fbff })); core.add(orbit);
    shots.push({ o: core, kind: id, v: fwd.clone().multiplyScalar(id === "ice" ? 14 : 12), life: 1.9, t: 0, trail: 0 });
    flash(start, s.color, 2.4, 0.22); ring(me, s.color, { r0: 0.3, r1: 1.8, life: 0.3, y: 0.1 });
    Snd.cast ? Snd.cast(id) : Snd.pop && Snd.pop();
    return true;
  }
  function shock(hand) {
    // chain lightning: the nearest scammer within 9, then up to two more within 5 of the last one
    const chain = []; let from = hand.clone(), pool = mobs.filter((m) => !m.dead);
    for (let k = 0; k < 3; k++) {
      let best = null, bd = k ? 5 : 9;
      for (const m of pool) { if (chain.includes(m)) continue; const d = m.g.position.distanceTo(k ? chain[k - 1].g.position : me); if (d < bd) { bd = d; best = m; } }
      if (!best) break; chain.push(best);
    }
    const pts = [hand.clone(), ...chain.map((m) => m.g.position.clone().setY(m.spec.y + 0.4))];
    if (!chain.length) { // nothing near: a burst around you
      ring(me, 0xb48cff, { r0: 0.4, r1: 3.2, life: 0.4, y: 0.6 }); flash(hand, 0xd8c4ff, 2.6, 0.3);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; bolt(hand, hand.clone().add(new V3(Math.cos(a) * 2.6, -0.6 + Math.random(), Math.sin(a) * 2.6))); }
    } else {
      for (let i = 0; i < pts.length - 1; i++) { bolt(pts[i], pts[i + 1]); bolt(pts[i], pts[i + 1]); }
      chain.forEach((m, i) => { setTimeout(() => { hit(m, 2, me, "shock"); flash(m.g.position.clone().setY(m.spec.y + 0.4), 0xd8c4ff, 2.2, 0.25); puff(m.g.position.clone().setY(m.spec.y + 0.4), 0xb48cff, { n: 8, speed: 5, size: 0.22, life: 0.35 }); }, i * 70); });
      ctx.shake(0.12);
    }
    flash(hand, 0xb48cff, 1.8, 0.2); Snd.cast ? Snd.cast("shock") : Snd.pop && Snd.pop();
    return true;
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
      let target = null;
      for (const m of mobs) { if (!m.dead && m.g.position.distanceTo(tmp.copy(s.o.position).setY(m.g.position.y)) < 1.0 && Math.abs(s.o.position.y - (m.spec.y + 0.4)) < 1.6) { target = m; break; } }
      if (target || s.t > s.life || s.o.position.y < 0.1) {
        const p = s.o.position.clone();
        if (s.kind === "ice") {
          if (target) hit(target, 2, me, "ice");
          shards(p, 0xbff0ff, 14, 6); ring(p, 0x8fe6ff, { r0: 0.3, r1: 2.2, life: 0.4 }); flash(p, 0xcff6ff, 2.2, 0.2);
        } else {
          if (target) hit(target, 3, me, "fire");
          for (const m of mobs) if (m !== target && !m.dead && m.g.position.distanceTo(p) < 2.8) hit(m, 1, p, "fire");
          flash(p, 0xffb060, 4.2, 0.3); puff(p, 0xff7a2a, { n: 18, speed: 6, size: 0.6, life: 0.6, grav: -1 }); puff(p, 0x55504a, { n: 8, speed: 1.5, size: 1.1, life: 1.1, grav: -1.5 }); ring(p, 0xff9a4a, { r0: 0.4, r1: 3.2, life: 0.45 });
          ctx.shake(0.14);
        }
        root.remove(s.o); s.o.geometry.dispose(); shots.splice(i, 1);
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
    if (Math.hypot(p.x, p.z) < 6) return;
    const g = itemMesh(it); g.position.copy(p); add(g); items.push({ g, it, k: Math.random() * 6 });
  }
  function pick(x) {
    const p = x.g.position.clone(); root.remove(x.g); items.splice(items.indexOf(x), 1);
    puff(p, x.it.color, { n: 12, speed: 4, size: 0.35, life: 0.6, grav: 2 }); ring(p, x.it.color, { r0: 0.2, r1: 1.8, life: 0.35, y: 0.1 });
    Snd.coin && Snd.coin();
    const name = T(x.it.name);
    switch (x.it.id) {
      case "coin": ctx.claim("pickup", {}, ctx.screenOf(p)); break;
      case "star": ctx.gain(15, name); break;
      case "mana": Object.keys(cd).forEach((k) => (cd[k] = 0)); sp = maxOf(); paintVit(); ctx.float(T("SP full · skills ready"), p, "#d8c4ff"); break;
      case "potion": hp = Math.min(maxOf(), hp + 40); paintVit(); ctx.float("+40 HP", p, "#ff8fa0"); break;
      default: buffs[x.it.id] = x.it.secs; ctx.float(T("{x}: {n}s", { x: name, n: x.it.secs }), p, "#" + new THREE.Color(x.it.color).getHexString());
    }
    paintBuffs();
  }
  function tickItems(dt, t) {
    ctx.here(me);
    for (let i = items.length - 1; i >= 0; i--) {
      const x = items[i]; x.g.rotation.y += dt * 1.8; x.g.position.y = 1.0 + Math.sin(t * 2.4 + x.k) * 0.15;
      const d = Math.hypot(x.g.position.x - me.x, x.g.position.z - me.z);
      if (d > 50) { root.remove(x.g); items.splice(i, 1); continue; }
      if (buffs.magnet > 0 && d < 9) { tmp.set(me.x - x.g.position.x, 0, me.z - x.g.position.z).normalize(); x.g.position.addScaledVector(tmp, dt * 9); }
      if (d < 1.3 && ctx.hopY() < 2.6) pick(x);
    }
  }

  // ---------------- HUD: the attack and skill buttons, cooldowns, buffs ----------------
  const bar = document.createElement("div"); bar.className = "wc-bar" + (ctx.coarse ? " coarse" : ""); bar.id = "wc-bar"; bar.setAttribute("data-no-i18n", "");
  const ICON = {
    attack: '<svg viewBox="0 0 24 24"><path d="M14.5 3.5 20.5 3.5 20.5 9.5 9 21 3 15z"/><path d="M5 13l6 6M3 21l3-3"/></svg>',
    ice: '<svg viewBox="0 0 24 24"><path d="M12 2v20M4 6.5l16 11M20 6.5 4 17.5"/><path d="M9 3.5 12 6l3-2.5M9 20.5 12 18l3 2.5"/></svg>',
    fire: '<svg viewBox="0 0 24 24"><path d="M12 22c4.4 0 7-2.9 7-6.8 0-3.8-2.8-6.3-4.2-9.7-.4 2.4-1.6 3.6-2.8 4.3.2-3.5-1.6-6.4-4.4-7.8.4 3.3-2.6 6-2.6 10.8C5 19.1 7.6 22 12 22z"/></svg>',
    shock: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  };
  bar.innerHTML = `<div class="wc-buffs" id="wc-buffs"></div>` + SKILLS.map((s) => `<button type="button" class="wc-skill wc-${s.id}" data-skill="${s.id}" aria-label="${ctx.esc ? ctx.esc(T(s.name)) : s.name}"><i>${ICON[s.id]}</i><em class="wc-cd"></em><b class="wc-key">${s.key}</b><small class="wc-lock"></small></button>`).join("") + `<button type="button" class="wc-attack" data-skill="attack" aria-label="${T("Attack")}"><i>${ICON.attack}</i><em class="wc-cd"></em><b class="wc-key">J</b></button>`;
  document.body.appendChild(bar);
  bar.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-skill]"); if (!b) return; e.preventDefault(); e.stopPropagation(); const id = b.dataset.skill; (id === "attack" ? attack() : cast(id)); b.classList.remove("press"); void b.offsetWidth; b.classList.add("press"); });
  function paintSkills() {
    for (const s of SKILLS) { const b = bar.querySelector(`[data-skill="${s.id}"]`); const ok = unlocked(s); b.classList.toggle("locked", !ok); b.querySelector(".wc-lock").textContent = ok ? "" : T("Lv {n}", { n: s.lv }); b.title = ok ? `${T(s.name)} (${s.key})` : T("{x} unlocks at level {n}", { x: T(s.name), n: s.lv }); }
  }
  function paintCd() {
    for (const [id, left] of Object.entries(cd)) {
      const b = bar.querySelector(`[data-skill="${id}"]`); if (!b) continue;
      const total = id === "attack" ? 0.42 : SKILLS.find((s) => s.id === id).cd;
      b.style.setProperty("--cd", String(Math.max(0, left / total)));
      b.classList.toggle("cooling", left > 0);
    }
  }
  function paintBuffs() {
    const el = bar.querySelector("#wc-buffs");
    el.innerHTML = Object.entries(buffs).filter(([, s]) => s > 0).map(([id, s]) => { const it = ITEMS.find((x) => x.id === id); return `<span style="--c:#${new THREE.Color(it.color).getHexString()}">${T(it.name)} <b>${Math.ceil(s)}</b></span>`; }).join("");
  }
  paintSkills();

  // ---------------- HP and SP: always on screen in the streets ----------------
  const vit = document.createElement("div"); vit.className = "wc-vit"; vit.id = "wc-vit"; vit.setAttribute("data-no-i18n", "");
  vit.innerHTML = `<div class="wc-v hp"><span>HP</span><i><b id="wc-hp-b"></b><u id="wc-hp-g"></u></i><em id="wc-hp-n"></em></div><div class="wc-v sp"><span>SP</span><i><b id="wc-sp-b"></b></i><em id="wc-sp-n"></em></div>`;
  (document.querySelector(".wp-hud-l") || document.body).insertBefore(vit, document.getElementById("wp-quests"));
  let ghost = hp;
  function paintVit() {
    const mx = maxOf(); hp = Math.min(hp, mx); sp = Math.min(sp, mx);
    vit.querySelector("#wc-hp-b").style.width = (100 * hp / mx) + "%"; vit.querySelector("#wc-sp-b").style.width = (100 * sp / mx) + "%";
    vit.querySelector("#wc-hp-n").textContent = `${Math.ceil(hp)} / ${mx}`; vit.querySelector("#wc-sp-n").textContent = `${Math.floor(sp)} / ${mx}`;
    vit.classList.toggle("danger", hp / mx < 0.3);
  }
  function damage(n) {
    hp = Math.max(0, hp - n); calmT = 4; paintVit();
    vit.classList.remove("hit"); void vit.offsetWidth; vit.classList.add("hit");
    ctx.float("-" + n + " HP", tmp2.copy(me).setY(2.6), "#ff5f73");
    if (hp <= 0) goDown();
  }
  // going down: a free respawn on the plaza, or a paid revive on the spot
  const dead = document.createElement("div"); dead.className = "wc-dead"; dead.id = "wc-dead"; dead.hidden = true; dead.setAttribute("role", "alertdialog"); dead.setAttribute("aria-modal", "true"); dead.setAttribute("data-no-i18n", "");
  document.body.appendChild(dead);
  let waitT = 0, paying = false;
  function goDown() {
    if (down) return; down = true; ctx.down(true);
    for (const m of mobs) if (!m.dead) { m.dead = 0.001; puff(m.g.position.clone().setY(0.6), 0xff4d6d, { n: 8, speed: 3, size: 0.5, life: 0.6, grav: -1 }); }
    waitT = performance.now() + 8000; // wall-clock, so a slow frame rate doesn't stretch the wait
    dead.innerHTML = `<div class="wc-dead-card"><h2>${T("You got scammed!")}</h2><p>${T("The street scammers knocked you out.")}</p>
      <button type="button" class="wc-revive" id="wc-revive"><img src="/images/arcircle-mark-sm.png" alt="" width="28" height="19"><span><b>${T("Revive here")}</b><small>${T("10,000 $ARCIRCLE · half is burned, half goes to the treasury")}</small></span></button>
      <button type="button" class="wc-respawn" id="wc-respawn" disabled><b>${T("Respawn on the plaza")}</b><small id="wc-wait"></small></button>
      <p class="wc-dead-note" id="wc-dead-note">${T("Reviving sends $ARCIRCLE from your own wallet; you confirm it there.")}</p></div>`;
    setTimeout(() => { dead.hidden = false; }, 900);
  }
  function getUp(where) {
    down = false; paying = false; dead.hidden = true; hp = maxOf(); sp = maxOf(); guardT = 3; paintVit(); ctx.down(false, where);
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
  let buffPaint = 0;
  let placeT = 0;
  function place() { const a = document.getElementById("wp-acts"); if (!ctx.coarse || !a || a.hidden) { bar.style.bottom = ""; return; } const r = a.getBoundingClientRect(); if (r.height) bar.style.bottom = Math.round(innerHeight - r.top + 8) + "px"; }
  function tick(dt, t) {
    const on = ctx.active();
    bar.hidden = !ctx.inHub();
    if ((placeT -= dt) <= 0) { placeT = 1; place(); }
    for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);
    paintCd();
    let changed = false; for (const k in buffs) { if (buffs[k] > 0) { buffs[k] = Math.max(0, buffs[k] - dt); if (!buffs[k]) changed = true; } }
    if ((buffPaint -= dt) <= 0 || changed) { buffPaint = 0.5; paintBuffs(); }
    vit.hidden = !ctx.inHub();
    if (down) { const left = Math.max(0, (waitT - performance.now()) / 1000), b = dead.querySelector("#wc-respawn"), w = dead.querySelector("#wc-wait"); if (b && w) { b.disabled = left > 0; w.textContent = left > 0 ? T("free, in {n} s", { n: Math.ceil(left) }) : T("free"); } }
    else { guardT = Math.max(0, guardT - dt); calmT = Math.max(0, calmT - dt); const mx = maxOf(); const h0 = hp, s0 = sp; if (calmT <= 0) hp = Math.min(mx, hp + 3 * dt); sp = Math.min(mx, sp + 7 * dt); if (Math.floor(h0) !== Math.floor(hp) || Math.floor(s0) !== Math.floor(sp)) paintVit(); }
    tickFx(dt); tickShots(dt);
    if (!ctx.inHub()) { root.visible = false; return; }
    root.visible = true;
    tickMobs(dt, t); tickItems(dt, t);
    if (!on) return;
    if ((spawnT -= dt) <= 0) { spawnT = 22 + Math.random() * 30; if (mobs.filter((m) => !m.dead).length < 3) spawnMob(); }
    if ((itemT -= dt) <= 0) { itemT = 5 + Math.random() * 6; if (items.length < 7) spawnItem(); }
  }
  function keyDown(k) {
    if (k === "j") return attack();
    const s = SKILLS.find((x) => x.key.toLowerCase() === k); if (s) { cast(s.id); return true; }
    return false;
  }
  function onLevel(n) {
    paintSkills(); hp = maxOf(); sp = maxOf(); paintVit();
    const s = SKILLS.find((x) => x.lv === n);
    if (s) {
      setTimeout(() => { ctx.toast(T("New skill: {x}! Press {k} or tap its button.", { x: T(s.name), k: s.key })); const b = bar.querySelector(`[data-skill="${s.id}"]`); b.classList.add("learned"); setTimeout(() => b.classList.remove("learned"), 2600); ctx.here(me); ring(me, s.color, { r0: 0.4, r1: 4, life: 0.8, y: 0.2 }); puff(me.clone().setY(1.2), s.color, { n: 24, speed: 5, size: 0.4, life: 1, grav: -1 }); }, 1400);
    }
  }
  return {
    tick, keyDown, attack, cast, onLevel, paintSkills,
    vitals: () => ({ hp, sp, max: maxOf(), down }), hurtMe: (n) => damage(n),
    speedMul: () => (buffs.boots > 0 ? 1.4 : 1), jumpMul: () => (buffs.spring > 0 ? 1.35 : 1),
    spawnMob, spawnItem, state: () => ({ mobs: mobs.filter((m) => !m.dead).map((m) => ({ id: m.spec.id, hp: m.hp, x: m.g.position.x, z: m.g.position.z })), items: items.map((x) => x.it.id), cd: { ...cd }, buffs: { ...buffs } }),
    // tests and the tutorial: put a scammer right in front of you
    spawnNear(dist = 3) { const kit = ctx.kit(); if (!kit) return false; spawnT = 999; const before = mobs.length; spawnMob(); if (mobs.length === before) return false; const m = mobs[mobs.length - 1]; ctx.here(me); fwdOf(fwd); m.g.position.copy(me).addScaledVector(fwd, dist).setY(0); return true; },
    itemNear(id, dist = 0.5) { const it = ITEMS.find((x) => x.id === id); if (!it) return; ctx.here(me); const g = itemMesh(it); g.position.set(me.x + dist, 1, me.z); add(g); items.push({ g, it, k: 0 }); },
  };
}
