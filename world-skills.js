// world-skills.js — the high skills (2026-10-25, the owner: "스킬 관련 다 진행하고 영웅별 개성 해주고, 렉도 안걸리게"):
//
//   Lv 150 Blade Storm   4 s of blades round you (×0.55 every 0.25 s, r 3.5), then a burst ×1.5
//                        Cyclone: pulls them in, 40% wider · Blood Edge: 1% HP a hit (3% a beat at most)
//   Lv 200 Chrono Field  a clock on the ground for 6 s (r 5): −60% speed, +25% damage taken
//                        Time Stop: frozen 1.5 s (a boss 0.5) · Rewind: the HP you lost in it comes back when it ends
//   Lv 250 Void Ray      a 2.5 s channel, an 18 m beam (×0.35 every 0.1 s, up to +60%), pierces, you move at half speed
//                        Prism: three beams at 60% · Event Horizon: a black hole at its end (2 s pull, then ×3)
//   Lv 300 Celestial Judgment (ultimate, C, a full gauge): 7 swords ×4.0, then a great sword ×8 and a 2 s stun
//                        Day of Judgment: 10 swords, a tighter circle · Sanctuary: 8 s of holy ground (−30% damage, HP back)
//   Lv 350 Infinity Burst (ultimate): 12 slashes ×1.6 along the ∞, then a blast ×10; you can't be hit while it runs
//                        Eternity: each knock-out gives back 5% of the gauge · Singularity: the blast ×2, +30% against bosses
//
// Area skills hit a boss for 70%. Every effect here is made once and kept (a mesh, a material, a texture each), shown
// and hidden; their hits are "light" (no hit-stop, no camera kick, a star only on a crit), so a long skill over a crowd
// doesn't stall a phone. Each hero draws the same damage their own way: ARON cyan lasers, LUMI pink petals and hearts,
// NEX violet shadows and blades. The hero's clips are only CU_AS ones (attack / cast / shoot / dodge / emote-yes).
//
/// A (from world-combat.js): { THREE, ctx, root, mobs, here(v), aim(out), fwdOf(out), hit(m, raw, from, kind, crit, light) → dmg,
///   critRoll(), critX(), power(s), brOf(id), ring, flash, puff, scorch, pillar, heal(n), guard(sec), shake(n), lowQ(), stats(), VX }
const TAU = Math.PI * 2;
export const HIGH = [
  { id: "blade", name: "Blade Storm", lv: 150, cd: 14, sp: 70, color: 0x9fe8ff, mult: 0.55 },
  { id: "chrono", name: "Chrono Field", lv: 200, cd: 18, sp: 60, color: 0xffd27a, mult: 0 },
  { id: "void", name: "Void Ray", lv: 250, cd: 16, sp: 80, color: 0xb48cff, mult: 0.35 },
  { id: "judge", name: "Celestial Judgment", lv: 300, cd: 3, sp: 0, color: 0xffe6a0, mult: 4.0, ult: true },
  { id: "infinity", name: "Infinity Burst", lv: 350, cd: 3, sp: 0, color: 0x7fe9ff, mult: 1.6, ult: true },
];
// each hero's look: a (main), b (second), c (deep), and how its motes fly
export const LOOK = {
  aron: { a: 0x5fe8ff, b: 0xd8fbff, c: 0x1f8fd8, css: "#5fe8ff", kind: "laser" },
  lumi: { a: 0xff7ad0, b: 0xffe0f2, c: 0xd83a9a, css: "#ff7ad0", kind: "petal" },
  nex: { a: 0xa86bff, b: 0xe2ccff, c: 0x3a1466, css: "#a86bff", kind: "shadow" },
};
const BOSS_AREA = 0.7;

export function makeSkills(A) {
  const { THREE, ctx } = A, V3 = THREE.Vector3, me = new V3(), tmp = new V3(), tmp2 = new V3(), dir = new V3();
  const look = () => LOOK[(ctx.hero && ctx.hero()) || "aron"] || LOOK.aron;
  const low = () => A.lowQ() || ctx.reduce;
  const add = (o) => { A.root.add(o); return o; };
  const blendAdd = (c, o = 1, extra = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, ...extra });
  // textures: drawn on a canvas at once, replaced by Meshy's picture (images/skills/fx-*.webp) when it has loaded
  const TX = {};
  function tex(name, draw) {
    if (TX[name]) return TX[name];
    const cv = document.createElement("canvas"); cv.width = cv.height = 256; const g = cv.getContext("2d"); draw(g, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; TX[name] = t;
    if (name.startsWith("fx-")) new THREE.TextureLoader().load(`/images/skills/${name}.webp${ctx.ver || ""}`, (w) => { w.colorSpace = THREE.SRGBColorSpace; t.image = w.image; t.needsUpdate = true; }, undefined, () => {});
    return t;
  }
  const glowDot = () => tex("dot", (g, S) => { const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.3, "rgba(255,255,255,.6)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, S, S); });
  const clockTex = () => tex("fx-clock", (g, S) => { const c = S / 2; g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = 5; for (const r of [120, 104, 60]) { g.globalAlpha = r === 104 ? 0.5 : 1; g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke(); } g.globalAlpha = 1;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.lineWidth = i % 3 ? 3 : 7; g.beginPath(); g.moveTo(c + Math.cos(a) * 92, c + Math.sin(a) * 92); g.lineTo(c + Math.cos(a) * 116, c + Math.sin(a) * 116); g.stroke(); }
    for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU; g.globalAlpha = 0.6; g.fillRect(c + Math.cos(a) * 110 - 1, c + Math.sin(a) * 110 - 1, 2, 2); } g.globalAlpha = 1; });
  const handTex = () => tex("hand", (g, S) => { g.fillStyle = "#fff"; g.beginPath(); g.moveTo(S / 2 - 6, S / 2); g.lineTo(S / 2, 18); g.lineTo(S / 2 + 6, S / 2); g.closePath(); g.fill(); g.beginPath(); g.arc(S / 2, S / 2, 10, 0, TAU); g.fill(); });
  const swordTex = () => tex("fx-sword", (g, S) => { const c = S / 2, gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.25, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,.9)");
    g.fillStyle = gr; g.beginPath(); g.moveTo(c - 9, 60); g.lineTo(c + 9, 60); g.lineTo(c + 5, S - 30); g.lineTo(c, S - 4); g.lineTo(c - 5, S - 30); g.closePath(); g.fill(); g.fillStyle = "#fff"; g.fillRect(c - 34, 52, 68, 9); g.fillRect(c - 5, 6, 10, 46); });
  const infTex = () => tex("fx-infinity", (g, S) => { g.strokeStyle = "#fff"; g.lineWidth = 9; g.shadowColor = "#fff"; g.shadowBlur = 14; g.beginPath(); for (let i = 0; i <= 96; i++) { const t = (i / 96) * TAU, d = 1 + Math.sin(t) ** 2, x = S / 2 + (104 * Math.cos(t)) / d, y = S / 2 + (104 * Math.sin(t) * Math.cos(t)) / d; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); });
  const voidTex = () => tex("fx-void", (g, S) => { const c = S / 2; g.strokeStyle = "#fff"; g.lineCap = "round"; let sd = 5; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 12; i++) { let a = (i / 12) * TAU + rnd() * 0.3, r = 14, x = c, y = c; g.lineWidth = 7; g.beginPath(); g.moveTo(x, y); while (r < c * 0.95) { r += 12 + rnd() * 14; a += (rnd() - 0.5) * 0.6; x = c + Math.cos(a) * r; y = c + Math.sin(a) * r; g.lineTo(x, y); g.lineWidth = Math.max(1.5, g.lineWidth - 0.7); } g.stroke(); }
    const r0 = g.createRadialGradient(c, c, 0, c, c, 40); r0.addColorStop(0, "rgba(255,255,255,1)"); r0.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r0; g.fillRect(0, 0, S, S); });
  const beamTex = () => tex("beam", (g, S) => { const gr = g.createLinearGradient(0, 0, S, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.35, "rgba(255,255,255,.55)"); gr.addColorStop(0.5, "rgba(255,255,255,1)"); gr.addColorStop(0.65, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = "destination-in"; for (let y = 0; y < S; y += 4) { g.globalAlpha = 0.6 + 0.4 * Math.sin(y * 0.15) ** 2; g.fillRect(0, y, S, 4); } });
  const petalTex = () => tex("petal", (g, S) => { const c = S / 2; g.fillStyle = "#fff"; g.beginPath(); g.ellipse(c, c, 60, 104, 0, 0, TAU); g.fill(); g.globalCompositeOperation = "destination-out"; g.beginPath(); g.arc(c, 20, 26, 0, TAU); g.fill(); });
  const heartTex = () => tex("heart", (g, S) => { g.fillStyle = "#fff"; g.beginPath(); const c = S / 2; g.moveTo(c, 210); g.bezierCurveTo(10, 130, 40, 30, c, 80); g.bezierCurveTo(216, 30, 246, 130, c, 210); g.fill(); });
  const smokeTex = () => tex("smoke", (g, S) => { const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); r.addColorStop(0, "rgba(255,255,255,.9)"); r.addColorStop(0.6, "rgba(255,255,255,.35)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, S, S); });
  const slashTex = () => tex("slash", (g, S) => { const c = S / 2; const gr = g.createLinearGradient(0, c, S, c); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.7, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.beginPath(); g.moveTo(0, c); g.quadraticCurveTo(c, c - 60, S, c - 8); g.quadraticCurveTo(c, c - 20, 0, c); g.fill(); });

  // ---------------- the hero's motes (a pool of sprites, one material each, kept) ----------------
  const motes = [], live = [];
  function mote(kind, at, color, o = {}) {
    if (live.length >= (low() ? 24 : 90)) return null;
    let s = motes.pop();
    const map = kind === "petal" ? petalTex() : kind === "heart" ? heartTex() : kind === "smoke" ? smokeTex() : kind === "slash" ? slashTex() : glowDot();
    if (!s) s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }));
    const mt = s.material; if (mt.map !== map) mt.map = map;
    const normal = kind === "smoke" && o.dark; mt.blending = normal ? THREE.NormalBlending : THREE.AdditiveBlending; mt.color.setHex(color); mt.opacity = o.op ?? 1; mt.rotation = o.rot ?? Math.random() * TAU; mt.needsUpdate = mt.userData.nb !== normal; mt.userData.nb = normal;
    s.position.copy(at); const sz = o.size ?? 0.4; s.scale.set(sz * (o.sx || 1), sz, 1); s.visible = true; add(s);
    live.push({ s, t: 0, life: o.life ?? 0.8, v: o.v ? o.v.clone() : new V3(), grav: o.grav ?? 0, spin: o.spin ?? 0, sz, sx: o.sx || 1, op: o.op ?? 1, grow: o.grow ?? 0 });
    return s;
  }
  function tickMotes(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i]; p.t += dt; const k = p.t / p.life;
      if (k >= 1) { A.root.remove(p.s); p.s.visible = false; motes.push(p.s); live.splice(i, 1); continue; }
      p.v.y -= p.grav * dt; p.s.position.addScaledVector(p.v, dt); p.s.material.rotation += p.spin * dt;
      const sz = p.sz * (1 + p.grow * k); p.s.scale.set(sz * p.sx, sz, 1); p.s.material.opacity = p.op * (1 - k) * Math.min(1, k * 6);
    }
  }
  const rv = (s) => tmp2.set((Math.random() - 0.5) * s, Math.random() * s * 0.6, (Math.random() - 0.5) * s);
  /// the hero's flavour of a burst at `at`: lasers and sparks (ARON), petals and hearts (LUMI), shadow smoke and blades (NEX)
  function flavour(at, n = 6, spread = 3) {
    const L = look(); if (low()) n = Math.ceil(n / 3);
    if (L.kind === "laser") { for (let i = 0; i < n; i++) { const a = Math.random() * TAU; mote("slash", tmp.copy(at).add(rv(spread * 0.4)), i % 2 ? L.a : L.b, { size: 0.5, sx: 4.5, rot: a, life: 0.28, op: 0.9 }); } if (A.ctx.parts) A.ctx.parts.sparks(at, L.a, n * 2); }
    else if (L.kind === "petal") { for (let i = 0; i < n; i++) mote(i % 3 ? "petal" : "heart", tmp.copy(at).add(rv(spread * 0.5)), i % 2 ? L.a : L.b, { size: 0.32 + Math.random() * 0.2, life: 1.1, v: rv(spread * 1.2), grav: 1.6, spin: (Math.random() - 0.5) * 6 }); }
    else { for (let i = 0; i < n; i++) mote(i % 3 ? "smoke" : "slash", tmp.copy(at).add(rv(spread * 0.4)), i % 3 ? L.c : L.a, { dark: true, size: i % 3 ? 1.1 : 0.45, sx: i % 3 ? 1 : 4, life: 0.7, op: i % 3 ? 0.7 : 0.95, v: rv(spread * 0.6), grav: -1.2, grow: 0.8 }); }
  }

  // ---------------- hits ----------------
  let total = 0, totalT = 0, totalAt = new V3(), totalId = "";
  function area(m, raw, from, kind, light = true) {
    if (!m || m.dead) return 0;
    const c = A.critRoll(), boss = m.rank === "boss";
    const d = A.hit(m, raw * (boss ? BOSS_AREA : 1) * (c ? A.critX() : 1), from, kind, c, light) || 0;
    total += d; totalT = 1.4; return d;
  }
  const near = (p, r, fn) => { for (const m of A.mobs) { if (m.dead) continue; const rr = r + (m.rank === "boss" ? 1.6 : 0); if ((m.g.position.x - p.x) ** 2 + (m.g.position.z - p.z) ** 2 < rr * rr) fn(m); } };
  function showTotal() { if (total > 0 && A.ctx.float) A.ctx.float(T("Total {n}", { n: Math.round(total).toLocaleString("en-US") }), tmp.copy(totalAt).setY(3.6), look().css, true, 1); total = 0; }
  const T = (s, v) => ctx.T(s, v);
  const clip = (n, o = {}) => { const av = ctx.avatar(); if (av && !(av.busy && av.busy() && !o.force)) av.play(n, { once: true, fade: 0.06, ...o }); };

  // ---------------- the cut-in (HTML: no scene work) and the NEW SKILL card ----------------
  let cutEl = null;
  function cutIn(s, big) {
    if (ctx.reduce) return; const L = look(), hero = (ctx.hero && ctx.hero()) || "aron";
    if (!cutEl) { cutEl = document.createElement("div"); cutEl.className = "wsk-cut"; cutEl.setAttribute("aria-hidden", "true"); document.body.appendChild(cutEl); }
    cutEl.innerHTML = big ? `<i style="--c:${L.css}"></i><img src="/images/ui/menu2/stand-${hero}.webp${ctx.ver || ""}" alt=""><b>${ctx.esc(T(s.name))}</b><small>${ctx.esc(T("ULTIMATE"))}</small>` : `<b>${ctx.esc(T(s.name))}</b>`;
    cutEl.className = "wsk-cut " + (big ? "big" : "small"); cutEl.style.setProperty("--c", L.css); void cutEl.offsetWidth; cutEl.classList.add("go");
  }
  function newCard(s, key, line) {
    const el = document.createElement("div"); el.className = "wsk-new"; el.setAttribute("role", "status"); el.style.setProperty("--c", look().css);
    el.innerHTML = `<small>${ctx.esc(T("NEW SKILL"))}</small><img src="/images/skills/ic-${s.id}.webp${ctx.ver || ""}" alt="" onerror="this.style.visibility='hidden'"><b>${ctx.esc(T(s.name))}</b><p>${ctx.esc(T(line))}</p><em>${ctx.esc(T("Key {k}", { k: key }))}</em>`;
    document.body.appendChild(el); setTimeout(() => el.classList.add("out"), 3600); setTimeout(() => el.remove(), 4200);
  }

  // ---------------- Blade Storm ----------------
  let blade = null, bladeG = null;
  function bladeKit() {
    if (bladeG) return bladeG; bladeG = new THREE.Group(); bladeG.name = "sk-blade";
    const geo = new THREE.PlaneGeometry(1.7, 0.42), mat = blendAdd(0xffffff, 0.95, { map: slashTex() }), N = 8;
    for (let i = 0; i < N; i++) { const p = new THREE.Mesh(geo, mat); const a = (i / N) * TAU; p.position.set(Math.cos(a), 1.0 + (i % 2) * 0.35, Math.sin(a)); p.rotation.set(-Math.PI / 2, 0, -a + Math.PI / 2); bladeG.add(p); }
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), blendAdd(0xffffff, 0.6)); ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.08; bladeG.add(ringM); bladeG.userData.ring = ringM;
    bladeG.userData.mat = mat; bladeG.visible = false; add(bladeG); return bladeG;
  }
  function castBlade(s) {
    const g = bladeKit(), L = look(), wide = A.brOf("blade") === "a" ? 1.4 : 1, r = 3.5 * wide;
    g.userData.mat.color.setHex(L.a); g.userData.ring.material.color.setHex(L.b); g.scale.setScalar(r); g.children.forEach((c, i) => { if (c.geometry.type === "PlaneGeometry") c.scale.set(1 / r * 2.2, 1 / r * 2.2, 1); }); g.visible = true; add(g);
    blade = { s, t: 0, beat: 0, r, dmg: A.power(s), blood: A.brOf("blade") === "b", pull: A.brOf("blade") === "a", clipT: 0 };
    clip("attack", { speed: 1.6, force: true }); cutIn(s, false); A.ring(me, L.a, { r0: 0.4, r1: r, life: 0.35, y: 0.1 }); ctx.Snd.cast && ctx.Snd.cast("shock"); return true;
  }
  function tickBlade(dt) {
    if (!blade) return; const b = blade; b.t += dt; A.here(me); totalAt.copy(me);
    bladeG.position.set(me.x, 0, me.z); bladeG.rotation.y -= dt * 11;
    if ((b.clipT -= dt) <= 0) { b.clipT = 0.55; clip(Math.random() < 0.5 ? "attack" : "dodge", { speed: 1.8 }); }
    if ((b.beat -= dt) <= 0 && b.t < 4) {
      b.beat = 0.25; let n = 0, mended = 0;
      near(me, b.r, (m) => { area(m, b.dmg, me, "blade"); n++;
        if (b.pull && m.rank !== "boss" && !m.tgt && !m.raid && !m.ext) { tmp.copy(me).sub(m.g.position).setY(0); const d = tmp.length(); if (d > 1.2) m.g.position.addScaledVector(tmp.normalize(), Math.min(0.5, d - 1.2)); } });
      if (b.blood && n) mended = A.heal(Math.max(1, Math.round(A.stats().hp * Math.min(0.03, 0.01 * n))));
      if (n && !low()) flavour(tmp.copy(me).setY(1.1), 2, b.r);
      if (mended && Math.random() < 0.3) A.ring(me, 0xff4d6d, { r0: 0.4, r1: 1.4, life: 0.25, y: 1.0 });
    }
    if (b.t >= 4) { // the final burst
      const L = look(); near(me, b.r * 1.1, (m) => area(m, (b.dmg / 0.55) * 1.5, me, "blade", false));
      A.ring(me, L.a, { r0: 0.5, r1: b.r * 1.3, life: 0.45, y: 0.12 }); A.flash(tmp.copy(me).setY(1.2), L.b, 5, 0.3); flavour(tmp.copy(me).setY(1.2), 14, b.r); A.shake(0.25);
      bladeG.visible = false; blade = null; clip("attack", { speed: 1.3, force: true }); showTotal();
    }
  }

  // ---------------- Chrono Field ----------------
  let chrono = null, chronoG = null;
  function chronoKit() {
    if (chronoG) return chronoG; chronoG = new THREE.Group(); chronoG.name = "sk-chrono";
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), blendAdd(0xffffff, 0.85, { map: clockTex() })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.09; chronoG.add(disc);
    const hm = blendAdd(0xffffff, 0.9, { map: handTex() }), h1 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), hm), h2 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), hm);
    for (const h of [h1, h2]) { h.rotation.x = -Math.PI / 2; h.position.y = 0.11; chronoG.add(h); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, TAU, 0, Math.PI / 2), blendAdd(0xffffff, 0.08, { side: THREE.BackSide })); chronoG.add(dome);
    chronoG.userData = { disc, h1, h2, dome }; chronoG.visible = false; add(chronoG); return chronoG;
  }
  function castChrono(s) {
    const g = chronoKit(), L = look(), tgt = A.aim(dir); A.here(me);
    const at = tgt ? tmp.copy(tgt.g.position).setY(0) : tmp.copy(me).addScaledVector(dir, 3).setY(0);
    const R = 5; g.position.copy(at); g.scale.setScalar(R); g.visible = true; add(g);
    const u = g.userData; u.disc.material.color.setHex(0xffd27a).lerp(new THREE.Color(L.a), 0.35); u.h1.material.color.setHex(L.b); u.dome.material.color.setHex(L.a);
    chrono = { s, t: 0, at: at.clone(), R, stop: A.brOf("chrono") === "a", rewind: A.brOf("chrono") === "b", lost: 0, beat: 0 };
    if (chrono.stop) near(at, R, (m) => { m.stun = Math.max(m.stun, m.rank === "boss" ? 0.5 : 1.5); });
    clip("cast", { speed: 1.2, force: true }); cutIn(s, false); A.ring(at, L.a, { r0: 0.5, r1: R, life: 0.5, y: 0.12 }); A.pillar(at, L.a, 8, 0.7, 0.8); flavour(tmp2.copy(at).setY(1), 10, R); ctx.Snd.cast && ctx.Snd.cast("ice"); return true;
  }
  function tickChrono(dt, t) {
    if (!chrono) return; const c = chrono; c.t += dt; const u = chronoG.userData;
    u.h1.rotation.z -= dt * 1.4; u.h2.rotation.z -= dt * 0.2; u.disc.rotation.z += dt * 0.15; u.disc.material.opacity = (0.7 + Math.sin(t * 3) * 0.12) * Math.min(1, (6 - c.t) * 2);
    if ((c.beat -= dt) <= 0) { c.beat = 0.2; const until = performance.now() + 300; near(c.at, c.R, (m) => { m.slow = Math.max(m.slow, 0.3); m.vulnUntil = until; }); if (!low() && Math.random() < 0.5) flavour(tmp.copy(c.at).add(tmp2.set((Math.random() - 0.5) * c.R * 1.4, 0.4, (Math.random() - 0.5) * c.R * 1.4)), 1, 1); }
    if (c.t >= 6) { if (c.rewind && c.lost > 0) { const h = A.heal(Math.round(c.lost)); if (h) { A.here(me); A.ring(me, look().a, { r0: 2.4, r1: 0.4, life: 0.5, y: 1 }); ctx.float && ctx.float(T("Rewind +{n}", { n: h }), tmp.copy(me).setY(2.8), "#9fffd0", true); } }
      chronoG.visible = false; chrono = null; }
  }
  /// damage you take: Rewind remembers it while you stand in the field; Sanctuary takes 30% off
  function onHurt(n) { A.here(me); if (chrono && chrono.rewind && (me.x - chrono.at.x) ** 2 + (me.z - chrono.at.z) ** 2 < chrono.R ** 2) chrono.lost += n; }
  const hurtK = () => { if (!sanct) return 1; A.here(me); return (me.x - sanct.at.x) ** 2 + (me.z - sanct.at.z) ** 2 < 25 ? 0.7 : 1; };

  // ---------------- Void Ray ----------------
  let ray = null; const beams = [];
  function beamKit(i) {
    if (beams[i]) return beams[i];
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2); // along +z from the hand
    const mat = blendAdd(0xffffff, 1, { map: beamTex() }); mat.map.wrapT = THREE.RepeatWrapping;
    const g = new THREE.Group(); const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat); b.rotation.z = Math.PI / 2; g.add(a, b);
    const core = new THREE.Mesh(geo, blendAdd(0xffffff, 0.9)); core.scale.set(0.12, 1, 1); g.add(core);
    g.userData = { mat, core }; g.visible = false; add(g); beams[i] = g; return g;
  }
  let holeG = null;
  function holeKit() { if (holeG) return holeG; holeG = new THREE.Group(); const crack = new THREE.Mesh(new THREE.CircleGeometry(1, 48), blendAdd(0xffffff, 0.9, { map: voidTex() })); crack.rotation.x = -Math.PI / 2; crack.position.y = 0.1; const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0x050008 })); ball.position.y = 1.2; const rim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.09, 8, 40), blendAdd(0xffffff, 0.9)); rim.position.y = 1.2; holeG.add(crack, ball, rim); holeG.userData = { crack, rim }; holeG.visible = false; add(holeG); return holeG; }
  function castVoid(s) {
    const prism = A.brOf("void") === "a"; A.aim(dir); const L = look();
    ray = { s, t: 0, beat: 0, dmg: A.power(s), prism, hole: A.brOf("void") === "b", n: prism ? 3 : 1, clipT: 0, end: new V3() };
    for (let i = 0; i < ray.n; i++) { const g = beamKit(i); g.userData.mat.color.setHex(i ? L.b : L.a); g.userData.core.material.color.setHex(L.b); g.visible = true; add(g); }
    clip("shoot", { speed: 1.2, force: true }); cutIn(s, false); ctx.Snd.cast && ctx.Snd.cast("shock"); return true;
  }
  function tickVoid(dt) {
    if (!ray) return; const r = ray; r.t += dt; A.here(me); totalAt.copy(me); A.aim(dir);
    const ramp = 1 + 0.6 * Math.min(1, r.t / 2.5), w = (0.5 + 0.25 * Math.sin(r.t * 30)) * (r.t < 0.15 ? r.t / 0.15 : 1), L = look();
    if ((r.clipT -= dt) <= 0) { r.clipT = 0.6; clip("shoot", { speed: 1.4 }); }
    const hit = (r.beat -= dt) <= 0; if (hit) r.beat = 0.1;
    for (let i = 0; i < r.n; i++) {
      const g = beams[i], turn = r.n === 3 ? (i - 1) * 0.35 : 0, d = tmp2.copy(dir).applyAxisAngle(A.UP, turn);
      g.position.set(me.x, 1.2, me.z).addScaledVector(d, 0.6); g.rotation.y = Math.atan2(d.x, d.z); g.scale.set(w * (i ? 0.7 : 1), w, 18); g.userData.mat.map.offset.y -= dt * 3;
      if (hit) { const k = r.prism ? 0.6 : 1; for (const m of A.mobs) { if (m.dead) continue; tmp.copy(m.g.position).sub(me).setY(0); const along = tmp.dot(d); if (along < 0 || along > 18) continue; const side = tmp.addScaledVector(d, -along).length(); if (side < (m.rank === "boss" ? 2.4 : 1.1)) area(m, r.dmg * ramp * k, me, "void"); } }
      if (i === 0) r.end.copy(me).addScaledVector(d, 18).setY(0);
    }
    if (hit && !low() && Math.random() < 0.5) flavour(tmp.copy(me).addScaledVector(dir, 3 + Math.random() * 12).setY(1.2), 1, 1);
    if (r.t >= 2.5) {
      for (let i = 0; i < r.n; i++) beams[i].visible = false;
      if (r.hole) { const h = holeKit(); h.position.copy(r.end); h.userData.rim.material.color.setHex(L.a); h.userData.crack.material.color.setHex(L.a); h.visible = true; add(h); hole = { t: 0, at: r.end.clone(), dmg: A.power(r.s) / r.s.mult * 3 }; }
      ray = null; showTotal();
    }
  }
  let hole = null;
  function tickHole(dt) {
    if (!hole) return; const h = hole; h.t += dt; holeG.userData.rim.rotation.x += dt * 4; holeG.userData.rim.rotation.y += dt * 3; holeG.userData.crack.rotation.z -= dt * 2; holeG.scale.setScalar(Math.min(1, h.t * 3) * (4 - h.t));
    near(h.at, 6, (m) => { if (m.rank === "boss" || m.tgt || m.raid || m.ext) return; tmp.copy(h.at).sub(m.g.position).setY(0); const d = tmp.length(); if (d > 0.8) m.g.position.addScaledVector(tmp.normalize(), Math.min(d - 0.8, dt * 5)); });
    if (h.t >= 2) { const L = look(); near(h.at, 4.5, (m) => area(m, h.dmg, h.at, "void", false)); A.ring(h.at, L.a, { r0: 0.4, r1: 6, life: 0.5, y: 0.12 }); A.flash(tmp.copy(h.at).setY(1.2), L.b, 7, 0.35); flavour(tmp.copy(h.at).setY(1), 16, 4); if (A.VX && A.VX.boom) A.VX.boom(tmp.copy(h.at).setY(1.4), "shock", { size: 5, life: 0.6 }); A.shake(0.4); A.scorch(h.at, 3.4, 0x1a0a2a); holeG.visible = false; hole = null; showTotal(); }
  }

  // ---------------- Celestial Judgment (ultimate) ----------------
  const swords = []; let judge = null, sanct = null, sanctG = null;
  function swordKit(i) {
    if (swords[i]) return swords[i];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 3.2), blendAdd(0xffffff, 1, { map: swordTex() })); m.geometry.translate(0, 1.6, 0); m.rotation.z = Math.PI; // the point down
    const g = new THREE.Group(); g.add(m); const m2 = m.clone(); m2.rotation.y = Math.PI / 2; g.add(m2); g.userData.mat = m.material; g.visible = false; add(g); swords[i] = g; return g;
  }
  function castJudge(s) {
    const tgt = A.aim(dir), L = look(); A.here(me);
    const at = tgt ? tmp.copy(tgt.g.position).setY(0).clone() : me.clone().addScaledVector(dir, 5).setY(0);
    const day = A.brOf("judge") === "a", N = day ? 10 : 7, R = day ? 2.2 : 3;
    judge = { s, t: 0, at, N, R, fell: 0, big: false, dmg: A.power(s), sanct: A.brOf("judge") === "b", spots: [] };
    for (let i = 0; i < N; i++) { const a = (i / N) * TAU, p = at.clone().add(new V3(Math.cos(a) * R, 0, Math.sin(a) * R)); judge.spots.push(p); const g = swordKit(i); g.userData.mat.color.setHex(i % 2 ? 0xffe6a0 : L.a); g.position.copy(p).setY(14 + i * 0.6); g.scale.setScalar(1); g.visible = true; add(g); }
    const big = swordKit(10); big.userData.mat.color.setHex(0xfff2c8); big.position.copy(at).setY(30); big.scale.setScalar(3.2); big.visible = true; add(big);
    A.ring(at, 0xffe6a0, { r0: R + 2, r1: R + 2.2, life: 1.4, y: 0.1 }); clip("cast", { speed: 1, force: true }); cutIn(s, true); A.guard(0.6); ctx.Snd.cast && ctx.Snd.cast("fire"); return true;
  }
  function tickJudge(dt) {
    if (!judge) return; const j = judge; j.t += dt; totalAt.copy(j.at);
    for (let i = 0; i < j.N; i++) { const g = swords[i], due = 0.35 + i * 0.09; if (!g.visible) continue;
      if (j.t < due) { g.position.y = Math.max(0, 14 + i * 0.6 - (j.t / due) * (14 + i * 0.6)); continue; }
      if (g.userData.hit) { if (j.t > due + 0.9) { g.visible = false; g.userData.hit = false; } continue; }
      g.userData.hit = true; g.position.y = 0; const p = j.spots[i]; near(p, 2, (m) => area(m, j.dmg, p, "judge", false)); A.ring(p, look().a, { r0: 0.3, r1: 2.2, life: 0.3, y: 0.1 }); flavour(tmp.copy(p).setY(0.6), 3, 1.5); A.shake(0.08); }
    const big = swords[10], bd = 0.35 + j.N * 0.09 + 0.45;
    if (!j.big) { big.position.y = Math.max(0, 30 - Math.max(0, (j.t - (bd - 0.4)) / 0.4) * 30); if (j.t >= bd) { j.big = true; big.position.y = 0; const r = j.R + 2.4;
      near(j.at, r, (m) => { area(m, j.dmg * 2, j.at, "judge", false); m.stun = Math.max(m.stun, m.rank === "boss" ? 0.8 : 2); });
      A.ring(j.at, 0xffe6a0, { r0: 0.6, r1: r * 1.6, life: 0.6, y: 0.14 }); A.pillar(j.at, 0xfff2c8, 18, 1.2, 1.6); A.flash(tmp.copy(j.at).setY(2), 0xffffff, 10, 0.4); flavour(tmp.copy(j.at).setY(1.2), 20, r); A.shake(0.6); A.scorch(j.at, 4, 0x2a1e08); if (ctx.slowmo) ctx.slowmo(260); clip("emote-yes", { force: true });
      if (j.sanct) { sanct = { t: 0, at: j.at.clone(), beat: 0 }; const g = sanctKit(); g.position.copy(j.at); g.visible = true; add(g); } } }
    if (j.big && j.t > bd + 1.2) { big.visible = false; judge = null; showTotal(); }
  }
  function sanctKit() { if (sanctG) return sanctG; sanctG = new THREE.Group(); const d = new THREE.Mesh(new THREE.CircleGeometry(5, 64), blendAdd(0xfff2c8, 0.3, { map: clockTex() })); d.rotation.x = -Math.PI / 2; d.position.y = 0.08; const w = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 3, 48, 1, true), blendAdd(0xfff2c8, 0.12)); w.position.y = 1.5; sanctG.add(d, w); sanctG.userData.d = d; add(sanctG); return sanctG; }
  function tickSanct(dt) {
    if (!sanct) return; sanct.t += dt; sanctG.userData.d.rotation.z += dt * 0.3; sanctG.userData.d.material.opacity = 0.3 * Math.min(1, (8 - sanct.t) * 2);
    if ((sanct.beat -= dt) <= 0) { sanct.beat = 1; A.here(me); if ((me.x - sanct.at.x) ** 2 + (me.z - sanct.at.z) ** 2 < 25) A.heal(Math.round(A.stats().hp * 0.03)); }
    if (sanct.t >= 8) { sanctG.visible = false; sanct = null; }
  }

  // ---------------- Infinity Burst (ultimate) ----------------
  let inf = null, infG = null; const ghosts = [];
  function infKit() {
    if (infG) return infG; infG = new THREE.Group(); const sig = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), blendAdd(0xffffff, 0.9, { map: infTex() })); sig.rotation.x = -Math.PI / 2; sig.position.y = 0.1; infG.add(sig); infG.userData.sig = sig; infG.visible = false; add(infG);
    for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowDot(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false })); s.scale.set(1.4, 2.6, 1); s.visible = false; add(s); ghosts.push(s); }
    return infG;
  }
  const lem = (t, R, out) => { const d = 1 + Math.sin(t) ** 2; return out.set((R * Math.cos(t)) / d, 0, (R * Math.sin(t) * Math.cos(t)) / d); };
  function castInf(s) {
    const tgt = A.aim(dir), L = look(); A.here(me); const at = tgt ? tgt.g.position.clone().setY(0) : me.clone().addScaledVector(dir, 4).setY(0);
    const g = infKit(); g.position.copy(at); g.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2; g.userData.sig.material.color.setHex(L.a); g.visible = true; add(g);
    ghosts.forEach((x) => { x.material.color.setHex(L.b); });
    inf = { s, t: 0, at, n: 0, dmg: A.power(s), sing: A.brOf("infinity") === "b", eternal: A.brOf("infinity") === "a", rot: g.rotation.y, done: false };
    A.guard(3.6); clip("dodge", { speed: 1.6, force: true }); cutIn(s, true); ctx.Snd.cast && ctx.Snd.cast("shock"); return true;
  }
  function tickInf(dt) {
    if (!inf) return; const f = inf; f.t += dt; totalAt.copy(f.at); A.guard(0.3); const L = look();
    infG.userData.sig.material.opacity = 0.5 + 0.4 * Math.sin(f.t * 12) ** 2;
    const want = Math.min(12, Math.floor(f.t / 0.17)); // a slash every 0.17 s
    while (f.n < want) { const k = f.n / 12, p = lem(k * TAU, 6, tmp).applyAxisAngle(A.UP, f.rot).add(f.at), q = lem((k + 1 / 12) * TAU, 6, tmp2).applyAxisAngle(A.UP, f.rot).add(f.at);
      near(p, 3, (m) => area(m, f.dmg, p, "infinity")); mote("slash", p.clone().setY(1.1), f.n % 2 ? L.a : L.b, { size: 0.9, sx: 5, rot: Math.atan2(q.z - p.z, q.x - p.x), life: 0.35 }); if (!low()) flavour(p.clone().setY(1), 2, 1.5);
      const gs = ghosts[f.n % ghosts.length]; gs.position.copy(p).setY(1.1); gs.visible = true; gs.material.opacity = 0.9; gs.userData.t = 0.4;
      if (f.n % 3 === 0) clip(f.n % 2 ? "attack" : "dodge", { speed: 2, force: true }); f.n++; }
    for (const g of ghosts) if (g.visible) { g.userData.t -= dt; g.material.opacity = Math.max(0, g.userData.t / 0.4) * 0.9; if (g.userData.t <= 0) g.visible = false; }
    if (!f.done && f.t >= 12 * 0.17 + 0.35) { f.done = true; const k = f.sing ? 2 : 1;
      near(f.at, 6.5, (m) => area(m, f.dmg * (10 / 1.6) * k * (f.sing && m.rank === "boss" ? 1.3 : 1), f.at, "infinity", false));
      A.ring(f.at, L.a, { r0: 0.6, r1: 9, life: 0.7, y: 0.14 }); A.ring(f.at, L.b, { r0: 0.3, r1: 6, life: 0.5, y: 0.4 }); A.pillar(f.at, L.a, 20, 1.3, 2); A.flash(tmp.copy(f.at).setY(2), 0xffffff, 12, 0.45);
      flavour(tmp.copy(f.at).setY(1.2), 24, 6); if (A.VX && A.VX.boom) A.VX.boom(tmp.copy(f.at).setY(1.6), "meteor", { size: 8, life: 0.8 }); A.shake(0.7); A.scorch(f.at, 5, 0x0a1a2a); if (ctx.slowmo) ctx.slowmo(320); clip("emote-yes", { force: true }); }
    if (f.done && f.t >= 12 * 0.17 + 1.4) { infG.visible = false; inf = null; showTotal(); }
  }

  const CAST = { blade: castBlade, chrono: castChrono, void: castVoid, judge: castJudge, infinity: castInf };
  return {
    cast(id, s) { A.here(me); totalAt.copy(me); total = 0; return CAST[id] ? CAST[id](s) : false; },
    tick(dt, t) { tickMotes(dt); tickBlade(dt); tickChrono(dt, t); tickVoid(dt); tickHole(dt); tickJudge(dt); tickSanct(dt); tickInf(dt); if (totalT > 0) totalT -= dt; },
    busy: () => !!(blade || ray || judge || inf), moveK: () => (ray ? 0.5 : 1), hurtK, onHurt, flavour, newCard, look,
    /// a knock-out while Infinity Burst runs with Eternity: 5% of the gauge back
    onKill: () => (inf && inf.eternal ? 5 : 0),
    stop() { if (bladeG) bladeG.visible = false; if (chronoG) chronoG.visible = false; beams.forEach((b) => { b.visible = false; }); if (holeG) holeG.visible = false; swords.forEach((s) => { s.visible = false; }); if (sanctG) sanctG.visible = false; if (infG) infG.visible = false; blade = chrono = ray = hole = judge = sanct = inf = null; },
  };
}
