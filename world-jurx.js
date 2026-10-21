// world-jurx.js — Jurassic World's second half (b-jx2/3/4), handed the land by world-jurassic.js:
//   · the Ember Basin: lava pools, smoke and ash at its floor, the heat that hurts without a heat cloak (its ground, its
//     obsidian rocks and sulfur vents are made in world-jurassic.js build(), before the survival takes its nodes)
//   · the boss hour (api/_world-jur.mjs BOSS): twice a day the Alpha Raptor or the Thornback Titan is enraged with one HP
//     for everyone; your swings are posted in batches; when it falls a hunter's share is taken (no ARCL: it's a win)
//   · night raids: at night in your own camp with a campfire, raptors come in three waves (each hunted the usual way)
//   · the minimap, and the effects: big dinosaurs' steps, roars, a raptor's lunge warning, campfire sparks, fireflies,
//     rain on the ground, the made-it and first-hunt cut-ins
export function createJurX(X) {
  const { THREE, T, esc, toast, ctx, scene, height, J } = X;
  const Snd = ctx.Snd || {}, reduce = !!ctx.reduce, low = !!ctx.low, coarse = !!ctx.coarse;
  const B = J.BASIN, me = () => X.me();
  const tickers = [];
  const glowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

  // ---------------- the Ember Basin: lava, smoke, ash, the heat ----------------
  const inBasin = (x, z) => Math.hypot(x - B.x, z - B.z) < B.r;
  const lavaU = { uT: { value: 0 } }, pools = [];
  {
    const mat = new THREE.ShaderMaterial({ uniforms: lavaU, transparent: false, toneMapped: false,
      vertexShader: "varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: `uniform float uT; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){ vec2 p = vP * 0.35; float a = n(p + vec2(uT * 0.12, uT * 0.07)) * 0.6 + n(p * 2.3 - vec2(uT * 0.2, -uT * 0.1)) * 0.4;
          float crust = smoothstep(0.52, 0.66, a); vec3 hot = mix(vec3(1.0, 0.32, 0.02), vec3(1.0, 0.85, 0.3), smoothstep(0.2, 0.5, a));
          gl_FragColor = vec4(mix(hot * 1.6, vec3(0.12, 0.05, 0.04), crust), 1.0); }` });
    for (const [dx, dz, r] of [[0, 0, 7], [-9, 6, 3.6], [8, 7, 4], [5, -9, 3.2]]) { const x = B.x + dx, z = B.z + dz, m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, height(x, z) + 0.12, z); scene.add(m); pools.push({ x, z, r }); }
    // the light it throws up into the smoke
    for (const p of pools.slice(0, 2)) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff6a20, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 })); s.scale.set(p.r * 4, p.r * 2.4, 1); s.position.set(p.x, height(p.x, p.z) + 2.2, p.z); scene.add(s); }
    // smoke columns and falling ash
    const smoke = []; const sm = new THREE.SpriteMaterial({ map: glowTex, color: 0x3a3236, transparent: true, depthWrite: false, opacity: 0.4 });
    for (let i = 0; i < (low ? 6 : 12); i++) { const s = new THREE.Sprite(sm.clone()); scene.add(s); smoke.push({ s, p: pools[i % pools.length], ph: i / 12 }); }
    const AN = low ? 120 : 260, ag = new THREE.BufferGeometry(), ap = new Float32Array(AN * 3);
    for (let i = 0; i < AN; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * B.r; ap.set([B.x + Math.cos(a) * r, Math.random() * 18, B.z + Math.sin(a) * r], i * 3); }
    ag.setAttribute("position", new THREE.BufferAttribute(ap, 3));
    const ash = new THREE.Points(ag, new THREE.PointsMaterial({ color: 0xffa060, size: 0.16, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); ash.frustumCulled = false; scene.add(ash);
    tickers.push((dt, t) => {
      lavaU.uT.value = t;
      for (const m of smoke) { const k = (t * 0.06 + m.ph) % 1; m.s.position.set(m.p.x + Math.sin(m.ph * 30 + t * 0.2) * 2, height(m.p.x, m.p.z) + 1 + k * 22, m.p.z + Math.cos(m.ph * 20) * 2); const w = 4 + k * 12; m.s.scale.set(w, w, 1); m.s.material.opacity = 0.42 * Math.sin(Math.PI * k); }
      const { px, pz } = me(); if (Math.hypot(px - B.x, pz - B.z) > 120) return;
      const a = ag.attributes.position; for (let i = 0; i < AN; i++) { let y = a.getY(i) + dt * 0.9; if (y > 18) y = 0; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t + i) * dt * 0.3); } a.needsUpdate = true;
    });
  }
  // the basin's sign at its rim (toward the plain)
  if (ctx.K && ctx.K.label) { const tag = ctx.K.label(T("Ember Basin"), { accent: "#ff6a20", color: "#ffd9b8", size: 0.9, sub: T("Hot ground · a heat cloak keeps you in") }); const ax = B.x - B.r * 0.9, az = B.z + B.r * 0.45; tag.position.set(ax, height(ax, az) + 4, az); scene.add(tag); }
  // the heat: inside without a cloak your HP drains; the lava burns anyone
  let heatT = 0, heatSaid = 0, wasIn = false;
  function tickHeat(dt) {
    const { px, pz, down } = me(); if (down) return; const inside = inBasin(px, pz);
    if (inside !== wasIn) { wasIn = inside; if (inside) toast(X.tools().cloak ? `🔥 <b>${esc(T("Ember Basin"))}</b> ${esc(T("Your heat cloak keeps the heat off."))}` : `🔥 <b>${esc(T("Too hot!"))}</b> ${esc(T("Without a heat cloak the basin burns you. Make one at the workbench."))}`); }
    if (!inside || (heatT += dt) < 1) return; heatT = 0;
    const lava = pools.some((p) => Math.hypot(px - p.x, pz - p.z) < p.r * 0.92), v = ctx.vitals ? ctx.vitals() : null, max = (v && v.max) || 120;
    if (lava) { if (ctx.hurt) ctx.hurt(Math.max(1, Math.round(max * 0.18))); if (X.shake) X.shake(0.25); if (performance.now() - heatSaid > 4000) { heatSaid = performance.now(); toast(`🌋 ${esc(T("Lava! Get out of it"))}`); } }
    else if (!X.tools().cloak && ctx.hurt) ctx.hurt(Math.max(1, Math.round(max * 0.03)));
  }

  // ---------------- the boss hour ----------------
  let wallT = 0, boss = null, bossT = 0, sent = 0, queued = 0, postT = 0, claimed = {}, lastOn = false, bossBusy = false;
  const bossObj = () => (boss && boss.on ? X.boss(boss.kind) : null);
  async function readBoss() {
    const s = ctx.sess && ctx.sess();
    try { const r = await fetch("/api/social?world=jur-boss" + (s ? "&wallet=" + s.wallet : ""), { cache: "no-store" }); if (!r.ok) return; boss = await r.json(); boss.at = Date.now(); } catch { return; }
    const o = bossObj();
    if (boss.on && !lastOn) { toast(`🔥 <b>${esc(T("Boss hour!"))}</b> ${esc(T(boss.kind === "alpha" ? "The Alpha Raptor is enraged — hunt it together in the southern ruins." : "The Thornback Titan is enraged — hunt it together in the north-west meadow."))}`); (Snd.growl || (() => {}))(1); }
    if (!boss.on && lastOn) { for (const k of ["alpha", "titan"]) { const b = X.boss(k); if (b) { b.shared = null; b.hpNow = null; if (!b.alive) b.revive(); } } }
    lastOn = boss.on;
    if (o && !o.alive && !boss.down) o.revive(); // (hunted alone earlier today: the boss hour brings it back for everyone)
    if (o) { o.shared = boss; o.hpNow = Math.max(boss.down ? 0 : 1, Math.round(X.FOE[boss.kind].hp * boss.hp / boss.max)); o.hpAt = performance.now(); if (boss.down && o.alive) o.die(); }
    if (boss.on && boss.down && boss.mine && boss.mine.n >= boss.mine.need && !boss.mine.paid && !claimed[boss.id]) claim(boss.id);
    paintChip();
  }
  async function claim(id) {
    claimed[id] = true; const r = await X.post("world-jur-boss-claim", { id });
    if (!r.ok) { claimed[id] = false; return; }
    const parts = Object.entries(r.j.loot || {}).map(([m, n]) => `${X.ic(m)}+${n}`).join(" ");
    toast(`🏆 <b>${esc(T("The boss fell! Your hunter's share:"))}</b> ${parts}`); cutin("🏆", T("BOSS DOWN"), T(boss && boss.kind === "titan" ? "Thornback Titan" : "Alpha Raptor"));
    if (X.setInv) X.setInv(r.j.inv);
  }
  /// a swing at the enraged boss: counted here, posted every 2 s (the server allows no more than real swings)
  function hit(o) { queued++; o.hpNow = Math.max(1, (o.hpNow ?? X.FOE[o.kind].hp) - Math.round(X.FOE[o.kind].hp / (boss.max || 600))); o.hpAt = performance.now(); }
  async function flush() {
    if (!queued || bossBusy || !boss || !boss.on) return; bossBusy = true; const n = Math.min(queued, 20); queued -= n; sent += n;
    const r = await X.post("world-jur-boss-hit", { n }); bossBusy = false;
    if (r.ok) { boss = { ...boss, ...r.j, at: Date.now() }; const o = bossObj(); if (o) { o.hpNow = Math.max(boss.down ? 0 : 1, Math.round(X.FOE[boss.kind].hp * boss.hp / boss.max)); if (boss.down && o.alive) { o.die(); (Snd.kill || (() => {}))(); } } if (boss.down && boss.mine && boss.mine.n >= boss.mine.need && !claimed[boss.id]) claim(boss.id); paintChip(); }
  }
  const owns = (o) => !!(o && boss && boss.on && !boss.down && o.shared === boss && o.alive && ctx.sess && ctx.sess());
  // the chip by the clock: the next hour's time, or LIVE with the HP and the hunters
  let chip = null;
  function paintChip() {
    if (!X.root) return; if (!chip) { chip = document.createElement("button"); chip.type = "button"; chip.className = "wz-boss"; const top = X.root.querySelector(".wz-top"); (top || X.root).appendChild(chip); chip.addEventListener("click", () => { if (boss) toast(boss.on ? `🔥 ${esc(T(boss.kind === "alpha" ? "The Alpha Raptor: the ruins in the south" : "The Thornback Titan: the north-west meadow"))}` : `⏰ ${esc(T("Boss hours: 12:00 and 20:00 (Korea time), 30 minutes"))}`); }); }
    if (!boss) { chip.hidden = true; return; } chip.hidden = false;
    const left = Math.max(0, (boss.on ? boss.end : boss.start) - (boss.now + (Date.now() - boss.at))), mm = Math.floor(left / 60000), hh = Math.floor(mm / 60);
    chip.classList.toggle("on", !!boss.on && !boss.down);
    paintBar(left);
    chip.innerHTML = boss.on ? (boss.down ? `<b>🏆</b><span>${esc(T("Boss down"))}</span>` : `<b>🔥 ${esc(T("LIVE"))}</b><span>${Math.round(100 * boss.hp / boss.max)}% · ${boss.hunters} ${esc(T("hunters"))}</span>`) : `<b>⏰</b><span>${esc(T("Boss"))} ${hh ? hh + "h " : ""}${mm % 60}m</span>`;
  }

  // b-jx5: the boss hour's shared HP as a big bar at the top (players asked how to see the fight's progress: the chip
  // alone was too small) — name, HP left, hunters, time left; "BOSS DOWN" once it falls, gone outside the hour
  let bar = null;
  function paintBar(left) {
    if (!bar) { bar = document.createElement("div"); bar.className = "wz-bossbar"; bar.setAttribute("role", "status"); bar.hidden = true; (X.root || document.body).appendChild(bar); }
    if (!boss || !boss.on) { bar.hidden = true; return; }
    const k = boss.down ? 0 : Math.max(0, Math.min(1, boss.hp / (boss.max || 1))), name = T(boss.kind === "titan" ? "Thornback Titan" : "Alpha Raptor"), mm = Math.floor(left / 60000), mine = boss.mine || {};
    bar.classList.toggle("down", !!boss.down); bar.hidden = false;
    bar.innerHTML = `<div class="wz-bb-t"><b>${boss.down ? "🏆 " + esc(T("BOSS DOWN")) : "🔥 " + esc(name)}</b><span>${esc(T("{n} hunters", { n: boss.hunters || 0 }))} · ${mm}m</span></div><i><u style="width:${(100 * k).toFixed(1)}%"></u></i>` +
      `<div class="wz-bb-s"><span>${Math.round(100 * k)}%</span><span>${esc(T("Your hits: {n} / {m} for a share", { n: mine.n || 0, m: mine.need || 10 }))}</span></div>`;
  }

  // ---------------- night raids at your camp ----------------
  let raid = null, raidDone = "", campT = 0;
  const nightKey = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 10).replace(/-/g, "") + (d.getUTCHours() < 6 ? "a" : "b"); };
  function tickRaid(dt, rdt = dt) {
    const s = ctx.sess && ctx.sess(); if (!s) return; const home = X.homeSpot(), { px, pz, down } = me();
    if (raid) {
      const alive = raid.list.filter((o) => o.alive);
      if (!alive.length && raid.spawned >= raid.waves[raid.w]) { raid.w++; raid.spawned = 0; if (raid.w >= raid.waves.length) { endRaid(true); return; } toast(`🦖 ${esc(T("Wave {n} of {m}!", { n: raid.w + 1, m: raid.waves.length }))}`); raid.next = 3; }
      const H0 = raid.home;
      if ((raid.next -= dt) <= 0 && raid.spawned < raid.waves[raid.w]) { raid.next = 1.4; const a = Math.random() * 6.283, d = X.CAMP_R + 22, x = H0.x + Math.cos(a) * d, z = H0.z + Math.sin(a) * d; const o = X.spawnRaider(x, z, `raid:${raid.key}:${raid.n++}`, H0); if (o) raid.list.push(o); raid.spawned++; }
      if (down || !X.isNight() || Math.hypot(px - H0.x, pz - H0.z) > X.CAMP_R + 40) endRaid(false);
      return;
    }
    if (!home || !X.isNight() || raidDone === nightKey() || !X.campFire()) { campT = 0; return; }
    if (Math.hypot(px - home.x, pz - home.z) < X.CAMP_R) { if ((campT += rdt) > 20) startRaid(home); } else campT = 0;
  }
  function startRaid(home) {
    raid = { key: nightKey(), waves: [2, 3, 3], w: 0, spawned: 0, n: 0, list: [], next: 2, home }; raidDone = raid.key; X.setRaid(true);
    toast(`🌙 <b>${esc(T("Raiders at your camp!"))}</b> ${esc(T("Raptors are coming in three waves — defend your fire."))}`); (Snd.growl || (() => {}))(0); cutin("🌙", T("NIGHT RAID"), T("Defend your camp"));
  }
  function endRaid(won) { if (!raid) return; for (const o of raid.list) X.removeRaider(o); X.setRaid(false); raid = null; if (won) { toast(`🔥 <b>${esc(T("Camp defended!"))}</b> ${esc(T("The raptors are gone for tonight."))}`); cutin("🛡️", T("CAMP DEFENDED"), T("Three waves held off")); } }

  // ---------------- the minimap ----------------
  const mm = document.createElement("canvas"); mm.className = "wz-map"; const MS = coarse ? 104 : 132, dpr = Math.min(2, devicePixelRatio || 1); mm.width = mm.height = MS * dpr; mm.style.width = mm.style.height = MS + "px"; (X.root || document.body).appendChild(mm);
  let big = false; mm.addEventListener("click", () => { big = !big; mm.classList.toggle("big", big); const s = big ? MS * 2.3 : MS; mm.width = mm.height = s * dpr; mm.style.width = mm.style.height = s + "px"; drawMap(true); });
  let mapT = 0;
  function drawMap(force) {
    if (!force && (mapT += 1) % 6) return; const g = mm.getContext("2d"), W = mm.width, R = big ? 230 : 120, { px, pz, face } = me(), k = W / (R * 2);
    const to = (x, z) => [W / 2 + (x - (big ? 0 : px)) * k, W / 2 + (z - (big ? 0 : pz)) * k];
    g.clearRect(0, 0, W, W); g.save(); g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 1, 0, 6.283); g.clip();
    g.fillStyle = "rgba(34,58,30,.92)"; g.fillRect(0, 0, W, W);
    const ring = (x, z, r, c, fill = true) => { const [a, b] = to(x, z); g.beginPath(); g.arc(a, b, Math.max(1.5, r * k), 0, 6.283); if (fill) { g.fillStyle = c; g.fill(); } else { g.strokeStyle = c; g.lineWidth = 2 * dpr; g.stroke(); } };
    ring(0, 0, J.EDGE, "rgba(120,110,90,.5)", false); ring(J.LAKE.x, J.LAKE.z, J.LAKE.r + 10, "rgba(40,120,150,.95)"); ring(B.x, B.z, B.r, "rgba(150,50,20,.95)"); for (const p of pools) ring(p.x, p.z, p.r, "#ffb040");
    for (const c of X.camps()) ring(c.x, c.z, X.CAMP_R, c.mine ? "rgba(57,255,136,.7)" : "rgba(200,220,255,.35)");
    ring(J.GATE.x, J.GATE.z, 4, "#ffffff");
    for (const o of X.dinos()) { if (!o.alive) continue; const isBoss = o.kind === "alpha" || o.kind === "titan"; if (!isBoss && Math.hypot(o.x - px, o.z - pz) > 70) continue; ring(o.x, o.z, isBoss ? 5 : 2.4, isBoss ? (o.shared ? "#ff3b5c" : "#ffb648") : "rgba(255,90,90,.8)"); }
    const [mx, my] = to(px, pz); g.save(); g.translate(mx, my); g.rotate(-face + Math.PI); g.fillStyle = "#39d8ff"; g.beginPath(); g.moveTo(0, -7 * dpr); g.lineTo(5 * dpr, 6 * dpr); g.lineTo(0, 3 * dpr); g.lineTo(-5 * dpr, 6 * dpr); g.closePath(); g.fill(); g.restore();
    g.restore(); g.strokeStyle = "rgba(160,220,255,.6)"; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 1.5 * dpr, 0, 6.283); g.stroke();
  }

  // ---------------- effects ----------------
  const fx = [];
  const sprite = (c, x, y, z, s, life, o = {}) => { if (reduce) return; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, depthWrite: false, blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: o.a ?? 0.9 })); sp.position.set(x, y, z); sp.scale.setScalar(s); scene.add(sp); fx.push({ sp, life, t: 0, grow: o.grow ?? 1.5, vy: o.vy || 0, a: o.a ?? 0.9 }); };
  const ringFx = (x, z, r, c, life = 0.6) => { if (reduce) return; const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, height(x, z) + 0.1, z); m.scale.setScalar(r * 0.3); scene.add(m); fx.push({ ring: m, life, t: 0, r }); };
  /// a big dinosaur's foot comes down: dust, and the ground shakes a little when you're close
  function step(o) { const { px, pz } = me(), d = Math.hypot(o.x - px, o.z - pz); if (d > 40) return; const L = (o.R && o.R.L) || 6; for (let i = 0; i < 2; i++) sprite(0xb8a888, o.x + (Math.random() - 0.5) * L * 0.4, height(o.x, o.z) + 0.4, o.z + (Math.random() - 0.5) * L * 0.4, L * 0.22, 0.9, { add: false, a: 0.45, vy: 0.6, grow: 2.2 }); if (X.shake && d < 30) X.shake(0.05 + 0.12 * (1 - d / 30) * Math.min(1, L / 10)); }
  function roar(o) { const { px, pz } = me(), d = Math.hypot(o.x - px, o.z - pz); if (d > 45) return; ringFx(o.x, o.z, (o.R && o.R.L) || 6, 0xffd27a, 0.8); ringFx(o.x, o.z, ((o.R && o.R.L) || 6) * 0.6, 0xffffff, 0.5); if (X.shake) X.shake(0.2 * (1 - d / 45) + 0.05); if (X.hitstop && d < 25) X.hitstop(90); }
  function tele(o) { ringFx(o.x, o.z, (o.hr || 1.5) * 2.2, 0xff3b5c, 0.45); if (X.pop) X.pop(o, "!", "warn", 0.5); }
  /// a tree comes down: dust where it lands
  function felled(o) { for (let i = 0; i < 6; i++) sprite(0xc8b898, o.x + (Math.random() - 0.5) * 3, height(o.x, o.z) + 0.5, o.z + (Math.random() - 0.5) * 3, 1.6, 1.2, { add: false, a: 0.4, vy: 0.4, grow: 2.4 }); }
  function shatter(o) { ringFx(o.x, o.z, 2.6, 0xd8d0c0, 0.5); for (let i = 0; i < 4; i++) sprite(0xd8d0c0, o.x + (Math.random() - 0.5) * 1.5, height(o.x, o.z) + 0.6, o.z + (Math.random() - 0.5) * 1.5, 1.2, 0.7, { add: false, a: 0.5, vy: 1.2, grow: 2 }); }
  // campfire sparks; fireflies at night; rain landing round you
  let sparkT = 0, flyT = 0, dropT = 0;
  function ambient(dt, t) {
    if (reduce) return; const { px, pz } = me();
    if ((sparkT += dt) > 0.18) { sparkT = 0; for (const f of X.fires()) { const p = new THREE.Vector3(); f.getWorldPosition(p); if (Math.hypot(p.x - px, p.z - pz) > 40) continue; sprite(0xffa040, p.x + (Math.random() - 0.5) * 0.4, p.y + 0.3, p.z + (Math.random() - 0.5) * 0.4, 0.18, 1.3, { vy: 1.6 + Math.random(), grow: 0.2 }); if (Math.random() < 0.3) sprite(0x50464a, p.x, p.y + 1, p.z, 0.8, 2.4, { add: false, a: 0.25, vy: 1.1, grow: 3 }); } }
    if (X.isNight() && !low && (flyT += dt) > 0.35) { flyT = 0; const a = Math.random() * 6.283, r = 4 + Math.random() * 16, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r; if (!inBasin(x, z)) sprite(0xc8ff6a, x, height(x, z) + 0.6 + Math.random() * 2, z, 0.22, 2.6, { vy: 0.15, grow: 0.3, a: 0.95 }); }
    if (X.rainK() > 0.3 && (dropT += dt) > 0.06) { dropT = 0; const a = Math.random() * 6.283, r = Math.random() * 12, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r; ringFx(x, z, 0.5, 0xcfe6ff, 0.35); }
  }
  function tickFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const k = f.t / f.life;
      if (f.sp) { f.sp.position.y += f.vy * dt; f.sp.scale.multiplyScalar(1 + (f.grow - 1) * dt / f.life); f.sp.material.opacity = f.a * (1 - k); }
      if (f.ring) { const s = f.r * (0.3 + k * 0.9); f.ring.scale.setScalar(s); f.ring.material.opacity = 0.85 * (1 - k); }
      if (k >= 1) { const o = f.sp || f.ring; scene.remove(o); o.material.dispose(); if (f.ring) o.geometry.dispose(); fx.splice(i, 1); } }
  }
  // the cut-in: a word across the screen for a moment (a made tool, a first hunt, a boss down, a raid)
  function cutin(icon, big, small) {
    if (!X.root) return; const c = document.createElement("div"); c.className = "wz-cut"; c.innerHTML = `<i>${icon}</i><b>${esc(big)}</b><small>${esc(small || "")}</small>`; X.root.appendChild(c);
    setTimeout(() => c.classList.add("out"), 1500); setTimeout(() => c.remove(), 2100);
  }
  const made = (id, R) => cutin("🔨", T("MADE"), T((R && R.name) || id));
  const firstHunt = (kind, name) => { cutin("🦖", T("FIRST HUNT"), name); (Snd.kill || (() => {}))(); };

  let pollT = 0;
  return {
    inBasin, pools, owns, hit, step, roar, tele, felled, shatter, made, firstHunt, cutin,
    raidOn: () => !!raid,
    start() { readBoss(); },
    tick(dt, t) {
      // the server's timers by the wall clock: the frame's dt is capped (and slowed by hit-stop), so on a slow phone
      // the swings were never posted and the camp's 20 s never came
      const nowT = performance.now(), rdt = Math.min(5, Math.max(0, (nowT - (wallT || nowT)) / 1000)); wallT = nowT;
      for (const f of tickers) f(dt, t);
      tickHeat(dt); tickRaid(dt, rdt); ambient(dt, t); tickFx(dt); drawMap(false);
      if ((pollT += rdt) > (boss && boss.on ? 5 : 30)) { pollT = 0; readBoss(); }
      if ((postT += rdt) > 2) { postT = 0; flush(); }
      if ((bossT += rdt) > 1) { bossT = 0; paintChip(); }
    },
    stop() { endRaid(false); },
    debug: () => { const o = bossObj(); return { boss, raid: raid && { w: raid.w, alive: raid.list.filter((o) => o.alive).length }, queued, sent, own: o ? { shared: o.shared === boss, alive: !!o.alive, owns: owns(o) } : null, signed: !!(ctx.sess && ctx.sess()), campT: +campT.toFixed(1), raidDone }; },
  };
}
