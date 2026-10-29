// world-kart.js — ARCIRCLE KART, stage 1 (2026-10-29, the owner's KART plan: "1단계부터"): an arcade kart race in a scene of
// its own (like SURVIVORS ARENA: st.view + st.solo, the town waits). One track — the ARCIRCLE Nexus Circuit, a closed
// spline with a wide road, neon arches, boost pads and a start gantry — 3 laps, you + 3 computer racers driven by the
// three heroes (each sits in its kart: the 'sit' clip of world-kit.js CU_AS). Arcade handling: grip that eases off in a
// drift (Shift / the drift button + a direction), the drift charges a mini-turbo (blue → orange) and the nitro bar
// (2 stocks, Space / the boost button), a start boost for pressing the throttle right on GO, off-road slows you, the road's
// walls push you back, a slipstream behind a kart. The computer racers follow the racing line with their own lane,
// skill and small mistakes. No ARCL yet (stage 1): a personal best per device (arc.kart.best).
//
// ctx: { THREE, K, st, T, lang, esc, toast, Snd, reduce, low, coarse, heroId, makeHero(id) → Promise<hero>, onLeave() }
const LAPS = 3, ROAD = 16, WALL = ROAD / 2 + 3.2, STEP = 1 / 60, BEST = "arc.kart.best";
const TOP = 34, ACC = 19, BRAKE = 34, DRAG = 0.35, BOOST_TOP = 47;
const LW = {
  ko: { "Lap": "랩", "Best": "최고 기록", "GO!": "출발!", "Start boost!": "스타트 부스터!", "Mini turbo": "미니 터보", "Super turbo!": "슈퍼 터보!", "Nitro!": "니트로!", "Final lap!": "마지막 랩!", "Finish!": "골인!", "Race again": "다시 달리기", "Leave": "나가기", "New best!": "최고 기록 경신!", "Place": "순위", "Time": "기록", "Steer ◀ ▶ · W go · S brake · Shift drift · Space nitro": "조향 ◀ ▶ · W 가속 · S 브레이크 · Shift 드리프트 · Space 니트로", "Drift": "드리프트", "Nitro": "니트로", "Brake": "브레이크", "ARCIRCLE Nexus Circuit": "ARCIRCLE 넥서스 서킷", "Hold drift in a corner, let go for a turbo.": "코너에서 드리프트를 누르고 있다가 놓으면 터보가 나가요.", "1st": "1위", "2nd": "2위", "3rd": "3위", "4th": "4위", "Off road": "도로 밖" },
  zh: { "Lap": "圈", "Best": "最佳", "GO!": "出发！", "Start boost!": "起步加速！", "Mini turbo": "小涡轮", "Super turbo!": "超级涡轮！", "Nitro!": "氮气！", "Final lap!": "最后一圈！", "Finish!": "冲线！", "Race again": "再来一局", "Leave": "离开", "New best!": "新纪录！", "Place": "名次", "Time": "用时", "Steer ◀ ▶ · W go · S brake · Shift drift · Space nitro": "转向 ◀ ▶ · W 加速 · S 刹车 · Shift 漂移 · Space 氮气", "Drift": "漂移", "Nitro": "氮气", "Brake": "刹车", "ARCIRCLE Nexus Circuit": "ARCIRCLE 枢纽赛道", "Hold drift in a corner, let go for a turbo.": "在弯道按住漂移，松开就能涡轮加速。", "1st": "第1名", "2nd": "第2名", "3rd": "第3名", "4th": "第4名", "Off road": "出赛道" },
  tr: { "Lap": "Tur", "Best": "En iyi", "GO!": "BAŞLA!", "Start boost!": "Kalkış turbosu!", "Mini turbo": "Mini turbo", "Super turbo!": "Süper turbo!", "Nitro!": "Nitro!", "Final lap!": "Son tur!", "Finish!": "Bitiş!", "Race again": "Tekrar yarış", "Leave": "Çık", "New best!": "Yeni rekor!", "Place": "Sıra", "Time": "Süre", "Steer ◀ ▶ · W go · S brake · Shift drift · Space nitro": "Dön ◀ ▶ · W gaz · S fren · Shift drift · Space nitro", "Drift": "Drift", "Nitro": "Nitro", "Brake": "Fren", "ARCIRCLE Nexus Circuit": "ARCIRCLE Nexus Pisti", "Hold drift in a corner, let go for a turbo.": "Virajda drifti basılı tut, bırakınca turbo çıkar.", "1st": "1.", "2nd": "2.", "3rd": "3.", "4th": "4.", "Off road": "Yol dışı" },
};
const COLORS = [0x38d8ff, 0xff6fc8, 0x9b6bff, 0xffc23c];

export function createKart(ctx) {
  const { THREE, esc } = ctx, L = LW[ctx.lang] || {}, T = (s, v) => (L[s] != null ? L[s] : ctx.T(s, v));
  let autoMe = false, on = false, scene = null, cam = null, ui = null, track = null, karts = [], me = null, phase = "idle", clock = 0, cd = 0, acc = 0, finished = [], keys = new Set(), touch = { l: 0, r: 0, gas: 0, brake: 0, drift: 0, boost: 0 }, fxPool = [], shake = 0;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), tmp = V(0, 0, 0), tmp2 = V(0, 0, 0);
  const sit = (id) => { try { return ctx.makeHero(id); } catch { return Promise.resolve(null); } };

  // ---------- the track: a closed Catmull-Rom spline sampled into a table (position, right, distance) ----------
  function buildTrack() {
    const P = [[0, 0], [120, -10], [190, 40], [200, 130], [140, 190], [60, 170], [20, 230], [-70, 240], [-150, 180], [-160, 90], [-100, 40], [-60, -40]].map(([x, z]) => V(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(P, true, "centripetal"), N = 900, pts = curve.getSpacedPoints(N);
    const S = [], len = curve.getLength(); for (let i = 0; i < N; i++) { const p = pts[i], q = pts[(i + 1) % N], t = q.clone().sub(p).normalize(); S.push({ p, t, r: V(-t.z, 0, t.x), s: (i / N) * len }); }
    return { S, N, len, curve };
  }
  // the nearest table index around a guess (karts move a few samples a step)
  function nearest(pos, guess) { let best = guess, bd = Infinity; for (let k = -24; k <= 24; k++) { const i = (guess + k + track.N) % track.N, d = track.S[i].p.distanceToSquared(pos); if (d < bd) { bd = d; best = i; } } return best; }
  function lateral(pos, i) { const s = track.S[i]; return tmp.copy(pos).sub(s.p).dot(s.r); }

  function ribbon(w0, w1, y, mat) { // a strip along the track between lateral offsets w0..w1
    const N = track.N, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
    for (let i = 0; i <= N; i++) { const s = track.S[i % N], a = s.p.clone().addScaledVector(s.r, w0), b = s.p.clone().addScaledVector(s.r, w1); pos.set([a.x, y, a.z, b.x, y, b.z], i * 6); const v = (i / N) * track.len / 8; uv.set([0, v, 1, v], i * 4); if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return new THREE.Mesh(g, mat);
  }
  function roadTex() { const c = document.createElement("canvas"); c.width = 64; c.height = 256; const g = c.getContext("2d"); g.fillStyle = "#2a2f3d"; g.fillRect(0, 0, 64, 256); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 64, Math.random() * 256, 1, 1); } g.fillStyle = "#e8f6ff"; g.fillRect(30, 0, 4, 120); g.fillStyle = "#38d8ff"; g.fillRect(0, 0, 3, 256); g.fillRect(61, 0, 3, 256); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function curbTex() { const c = document.createElement("canvas"); c.width = 8; c.height = 32; const g = c.getContext("2d"); g.fillStyle = "#ff3d6e"; g.fillRect(0, 0, 8, 16); g.fillStyle = "#f4f7ff"; g.fillRect(0, 16, 8, 16); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; }

  function buildScene() {
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1638); scene.fog = new THREE.Fog(0x0b1638, 120, ctx.low ? 320 : 520);
    cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 900);
    scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x1a2244, 1.25)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(80, 140, 40); scene.add(sun);
    track = buildTrack();
    const ground = new THREE.Mesh(new THREE.CircleGeometry(520, 48), new THREE.MeshLambertMaterial({ color: 0x173a3a })); ground.rotation.x = -Math.PI / 2; ground.position.set(20, -0.05, 110); scene.add(ground);
    const grid = new THREE.GridHelper(1000, 100, 0x2ee0b0, 0x1f5a5a); grid.position.set(20, 0, 110); grid.material.transparent = true; grid.material.opacity = 0.18; scene.add(grid);
    const rt = roadTex(); rt.repeat.set(1, 1); scene.add(ribbon(-ROAD / 2, ROAD / 2, 0.02, new THREE.MeshLambertMaterial({ map: rt })));
    const ct = curbTex(); for (const [a, b] of [[-ROAD / 2 - 1.2, -ROAD / 2], [ROAD / 2, ROAD / 2 + 1.2]]) scene.add(ribbon(a, b, 0.04, new THREE.MeshLambertMaterial({ map: ct })));
    // the walls: low glowing rails
    const railM = new THREE.MeshBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    for (const w of [-WALL, WALL]) { const m = ribbon(w, w + 0.01, 0, railM); const g = m.geometry, p = g.attributes.position; for (let i = 0; i < p.count; i++) if (i % 2) p.setY(i, 1.1); p.needsUpdate = true; scene.add(m); }
    // neon arches every ~60 m (one InstancedMesh), the start gantry, boost pads
    const archN = Math.floor(track.len / 60), arch = new THREE.InstancedMesh(new THREE.TorusGeometry(ROAD / 2 + 2, 0.35, 6, 32, Math.PI), new THREE.MeshBasicMaterial({ color: 0x2ee0b0 }), archN), o = new THREE.Object3D();
    for (let k = 0; k < archN; k++) { const s = track.S[Math.floor((k / archN) * track.N)]; o.position.copy(s.p); o.lookAt(tmp.copy(s.p).add(s.t)); o.updateMatrix(); arch.setMatrixAt(k, o.matrix); arch.setColorAt(k, new THREE.Color(k % 2 ? 0x2ee0b0 : 0xff6fc8)); }
    scene.add(arch);
    const s0 = track.S[0], gantry = new THREE.Group(); for (const w of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), new THREE.MeshLambertMaterial({ color: 0x1b2440 })); post.position.set(w * (ROAD / 2 + 1.5), 3.5, 0); gantry.add(post); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD + 4, 1.4, 0.6), new THREE.MeshBasicMaterial({ color: 0xffc23c })); bar.position.y = 7; gantry.add(bar);
    const chk = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 2), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement("canvas"); c.width = 128; c.height = 16; const g = c.getContext("2d"); for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? "#fff" : "#111"; g.fillRect(x * 8, y * 8, 8, 8); } const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })() }));
    chk.rotation.x = -Math.PI / 2; chk.position.y = 0.05; gantry.add(chk); gantry.position.copy(s0.p); gantry.lookAt(tmp.copy(s0.p).add(s0.t)); scene.add(gantry);
    track.pads = [180, 420, 650].map((i) => { const s = track.S[i], m = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), new THREE.MeshBasicMaterial({ color: 0xffc23c, transparent: true, opacity: 0.85 })); m.rotation.x = -Math.PI / 2; m.position.copy(s.p).addScaledVector(s.r, (i % 2 ? 3 : -3)).setY(0.06); m.rotation.z = Math.atan2(s.t.x, s.t.z) + Math.PI; scene.add(m); return { i, lat: i % 2 ? 3 : -3, m }; });
    // a skyline of glowing towers round the circuit (instanced, cheap)
    const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x24305a, emissive: 0x1a2a6a }), ctx.low ? 40 : 90);
    for (let k = 0; k < towers.count; k++) { const a = (k / towers.count) * Math.PI * 2, r = 320 + (k * 37) % 120, h = 20 + (k * 53) % 70; o.position.set(20 + Math.cos(a) * r, h / 2, 110 + Math.sin(a) * r); o.rotation.set(0, a, 0); o.scale.set(10 + (k % 5) * 3, h, 10 + (k % 3) * 4); o.updateMatrix(); towers.setMatrixAt(k, o.matrix); }
    scene.add(towers);
  }

  // ---------- a kart: body, wheels, exhaust glow; the hero sits on it ----------
  function kartMesh(color) {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 2.9), new THREE.MeshLambertMaterial({ color })); body.position.y = 0.55; g.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.9), new THREE.MeshLambertMaterial({ color: 0x1b2440 })); nose.position.set(0, 0.5, 1.7); g.add(nose);
    const wingM = new THREE.MeshLambertMaterial({ color: 0x1b2440 }), wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.5), wingM); wing.position.set(0, 1.1, -1.4); g.add(wing);
    const wM = new THREE.MeshLambertMaterial({ color: 0x111622 }), wheels = [];
    for (const [x, z] of [[-1.05, 1.0], [1.05, 1.0], [-1.05, -1.0], [1.05, -1.0]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.4, 12), wM); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w); wheels.push(w); }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); flame.rotation.x = -Math.PI / 2; flame.position.set(0, 0.6, -1.9); g.add(flame);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04; g.add(glow);
    return { g, wheels, flame, glow };
  }
  async function makeRacer(i, heroId, isMe) {
    const m = kartMesh(COLORS[i % COLORS.length]), s = track.S[track.N - 6 - Math.floor(i / 2) * 7], lat = (i % 2 ? 3.6 : -3.6);
    const pos = s.p.clone().addScaledVector(s.r, lat), yaw = Math.atan2(s.t.x, s.t.z);
    const k = { i, me: isMe, m, pos, yaw, vh: yaw, speed: 0, idx: track.N - 6 - Math.floor(i / 2) * 7, lap: 0, prog: 0, best: 0, drift: 0, driftDir: 0, charge: 0, boostT: 0, boostK: 0, nitro: 0, stall: 0, slip: 0, finish: 0, hero: null, lane: (i % 3 - 1) * 2.6, skill: 0.9 + ((i * 37) % 10) / 100, wob: 0, startSpeed: 0 };
    m.g.position.copy(pos); m.g.rotation.y = yaw; scene.add(m.g);
    const h = await sit(heroId); if (h && h.obj) { h.obj.scale.multiplyScalar(0.78); h.obj.position.set(0, 0.62, -0.25); m.g.add(h.obj); try { h.play("sit"); } catch { /* standing is fine */ } k.hero = h; }
    return k;
  }

  // ---------- input ----------
  const kd = (e) => { if (!on) return; const c = e.code; keys.add(c); if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault(); if (c === "Escape") leave(); };
  const ku = (e) => keys.delete(e.code);
  function input() {
    const L0 = keys.has("KeyA") || keys.has("ArrowLeft") || touch.l, R0 = keys.has("KeyD") || keys.has("ArrowRight") || touch.r;
    return { steer: (R0 ? 1 : 0) - (L0 ? 1 : 0), gas: keys.has("KeyW") || keys.has("ArrowUp") || (ctx.coarse && !touch.brake) || touch.gas ? 1 : 0, brake: keys.has("KeyS") || keys.has("ArrowDown") || touch.brake ? 1 : 0, drift: keys.has("ShiftLeft") || keys.has("ShiftRight") || touch.drift, boost: keys.has("Space") || touch.boost };
  }

  // ---------- the physics step (fixed 1/60 s) ----------
  function stepKart(k, inp, dt) {
    const offRoad = Math.abs(lateral(k.pos, k.idx)) > ROAD / 2 + 1.2;
    let top = (k.boostT > 0 ? BOOST_TOP : TOP) * (offRoad && k.boostT <= 0 ? 0.55 : 1) * (k.me ? 1 : k.skill) * (k.slip > 1 ? 1.06 : 1);
    if (k.stall > 0) { k.stall -= dt; top = 4; }
    if (inp.gas) k.speed += ACC * dt * (k.speed > top ? -0.6 : 1); else k.speed -= DRAG * 8 * dt;
    if (inp.brake) k.speed -= BRAKE * dt;
    if (k.boostT > 0) { k.boostT -= dt; k.speed = Math.max(k.speed, top * (0.86 + 0.14 * k.boostK)); }
    k.speed = Math.max(0, Math.min(k.speed, top + 6)); if (k.speed > top) k.speed -= (k.speed - top) * 2 * dt;
    const sp = k.speed / TOP;
    // drift: starts with a direction held at speed, ends when let go → the turbo it charged
    if (inp.drift && !k.drift && Math.abs(inp.steer) > 0 && k.speed > 14) { k.drift = 1; k.driftDir = Math.sign(inp.steer); k.charge = 0; if (k.me) hop(k); }
    if (k.drift && (!inp.drift || k.speed < 8)) { if (k.charge > 1.9) boost(k, 1.15, 1, "Super turbo!"); else if (k.charge > 0.8) boost(k, 0.6, 0.6, "Mini turbo"); k.drift = 0; k.charge = 0; }
    let turn;
    if (k.drift) { turn = k.driftDir * (1.05 + 0.55 * inp.steer * k.driftDir) * 1.45; k.charge += dt * (0.6 + 0.8 * Math.abs(inp.steer)) * (sp > 0.5 ? 1 : 0.4); k.nitro = Math.min(2, k.nitro + dt * 0.12); }
    else turn = inp.steer * (2.2 - 0.9 * Math.min(1, sp));
    k.yaw -= turn * dt * Math.min(1, sp * 1.6 + 0.15);
    // the velocity's heading follows the kart's facing: tight on grip, loose in a drift
    const grip = k.drift ? 3.2 : offRoad ? 6 : 11; let dv = k.yaw - k.vh; dv = Math.atan2(Math.sin(dv), Math.cos(dv)); k.vh += dv * Math.min(1, grip * dt);
    if (inp.boost && k.nitro >= 1 && k.boostT <= 0.1) { k.nitro -= 1; boost(k, 1.6, 1, "Nitro!"); }
    k.pos.x += Math.sin(k.vh) * k.speed * dt; k.pos.z += Math.cos(k.vh) * k.speed * dt;
    k.idx = nearest(k.pos, k.idx); const s = track.S[k.idx], lat = lateral(k.pos, k.idx);
    if (Math.abs(lat) > WALL) { k.pos.addScaledVector(s.r, (Math.abs(lat) - WALL) * -Math.sign(lat)); k.speed *= 0.86; const into = Math.sin(k.vh - Math.atan2(s.t.x, s.t.z)); if (Math.abs(into) > 0.15) { k.vh = Math.atan2(s.t.x, s.t.z); k.yaw = k.vh; } if (k.me) { shake = 0.35; if (ctx.Snd && ctx.Snd.hit) ctx.Snd.hit(); } }
    for (const p of track.pads) if (Math.abs(k.idx - p.i) < 4 && Math.abs(lat - p.lat) < 2.6 && k.boostT < 0.3) boost(k, 0.9, 0.8, k.me ? "" : "");
  }
  function boost(k, secs, kk, say) { k.boostT = Math.max(k.boostT, secs); k.boostK = kk; if (k.me) { shake = 0.25; if (say) flash(T(say)); if (ctx.Snd && ctx.Snd.dash) ctx.Snd.dash(); } }
  function hop(k) { k.m.g.position.y = 0.4; }

  function aiInput(k) {
    const look = track.S[(k.idx + 14 + Math.floor(k.speed / 4)) % track.N], tgt = tmp2.copy(look.p).addScaledVector(look.r, k.lane + Math.sin(clock * 0.7 + k.i) * 1.2);
    let a = Math.atan2(tgt.x - k.pos.x, tgt.z - k.pos.z) - k.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
    const bend = Math.abs(Math.atan2(Math.sin(Math.atan2(look.t.x, look.t.z) - Math.atan2(track.S[k.idx].t.x, track.S[k.idx].t.z)), 1));
    k.wob = Math.max(0, k.wob - STEP); if (Math.random() < 0.0015) k.wob = 0.5; // a small mistake now and then
    const gap = me ? (me.prog - k.prog) : 0, rb = Math.max(-0.12, Math.min(0.1, gap / 400)); // a light rubber band
    k.skill = Math.max(0.82, Math.min(1.04, (0.9 + ((k.i * 37) % 10) / 100) + rb));
    return { steer: Math.max(-1, Math.min(1, -a * 2.4 + (k.wob ? Math.sin(clock * 9) * 0.6 : 0))), gas: 1, brake: bend > 0.9 && k.speed > 26 ? 1 : 0, drift: bend > 0.6 && k.speed > 22 && !k.wob, boost: k.nitro >= 1 && bend < 0.2 };
  }

  // ---------- laps: progress = laps × length + the distance along; a lap counts when you cross the line going forward ----------
  function laps(k, prevIdx) {
    const N = track.N; if (prevIdx > N * 0.8 && k.idx < N * 0.2) { k.lap++; if (k.me && k.lap === LAPS) flash(T("Final lap!")); }
    else if (prevIdx < N * 0.2 && k.idx > N * 0.8) k.lap--;
    k.prog = k.lap * track.len + track.S[k.idx].s;
    if (k.lap > LAPS && !k.finish) { k.finish = clock; finished.push(k); if (k.me) done(); }
  }

  function tick(dt, t) {
    if (!on) return; dt = Math.min(dt, 0.1);
    if (phase === "count") { cd -= dt; paintCount(); if (cd <= 0) { phase = "race"; clock = 0; flash(T("GO!")); for (const k of karts) if (!k.me) k.speed = 6; const inp = input(); if (inp.gas && me.startSpeed > 0.9 && me.startSpeed < 1.6) boost(me, 1.0, 0.9, "Start boost!"); else if (me.startSpeed >= 1.6) me.stall = 0.7; } else { const inp = input(); me.startSpeed = inp.gas ? me.startSpeed + dt : 0; } }
    if (phase === "race" || phase === "done") {
      acc += dt; while (acc >= STEP) { acc -= STEP; clock += STEP;
        for (const k of karts) { if (k.finish && !k.me) { k.speed *= 0.99; } const prev = k.idx, inp = k.me ? (phase === "done" ? { steer: 0, gas: 0, brake: 1, drift: 0, boost: 0 } : autoMe ? aiInput(k) : input()) : aiInput(k); /* (autoMe: the tests drive you with the computer's line) */ stepKart(k, inp, STEP); laps(k, prev); }
        // kart ↔ kart: circles push apart; a slipstream right behind another
        for (let a = 0; a < karts.length; a++) for (let b = a + 1; b < karts.length; b++) { const A = karts[a], B = karts[b], dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d = Math.hypot(dx, dz); if (d < 2.4 && d > 0.01) { const push = (2.4 - d) / 2; A.pos.x -= (dx / d) * push; A.pos.z -= (dz / d) * push; B.pos.x += (dx / d) * push; B.pos.z += (dz / d) * push; } }
        for (const A of karts) { let behind = false; for (const B of karts) if (A !== B) { const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d = Math.hypot(dx, dz), f = (dx * Math.sin(A.vh) + dz * Math.cos(A.vh)) / (d || 1); if (d < 14 && d > 3 && f > 0.95) behind = true; } A.slip = behind ? A.slip + STEP : 0; }
      }
    }
    for (const k of karts) { // draw
      const g = k.m.g; g.position.x = k.pos.x; g.position.z = k.pos.z; g.position.y = Math.max(0, g.position.y - dt * 3); g.rotation.y = k.yaw; g.rotation.z = k.drift ? -k.driftDir * 0.08 : 0;
      for (const w of k.m.wheels) w.rotation.x += k.speed * dt / 0.42; k.m.wheels[0].rotation.y = k.m.wheels[1].rotation.y = (k.me ? input().steer : 0) * -0.35;
      const fl = k.m.flame.material; fl.opacity = k.boostT > 0 ? 0.9 : k.drift ? Math.min(0.7, k.charge * 0.35) : 0; fl.color.setHex(k.boostT > 0 ? 0xffa63a : k.charge > 1.9 ? 0xff8a3a : 0x38d8ff); k.m.flame.scale.setScalar(k.boostT > 0 ? 1.6 : 1);
      if (k.hero && k.hero.update) k.hero.update(dt, t);
    }
    // the camera behind and above you, wider at speed, a shake on hits and boosts
    if (me) { const back = 7.2 + me.speed * 0.04, h = 3.1; tmp.set(me.pos.x - Math.sin(me.yaw) * back, h, me.pos.z - Math.cos(me.yaw) * back); cam.position.lerp(tmp, Math.min(1, dt * 8)); if (shake > 0 && !ctx.reduce) { cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt); } cam.lookAt(me.pos.x + Math.sin(me.yaw) * 6, 1.2, me.pos.z + Math.cos(me.yaw) * 6); const f = 62 + Math.min(14, me.speed * 0.25) + (me.boostT > 0 ? 6 : 0); if (Math.abs(cam.fov - f) > 0.3) { cam.fov += (f - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); } }
    paintHud();
  }

  // ---------- HUD ----------
  const fmt = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? "0" : ""}${r.toFixed(2)}`; };
  const ord = (n) => T(["1st", "2nd", "3rd", "4th"][n - 1] || n + "th");
  function place() { return [...karts].sort((a, b) => (b.finish ? 1e9 - b.finish : b.prog) - (a.finish ? 1e9 - a.finish : a.prog)).indexOf(me) + 1; }
  function makeUi() {
    ui = document.createElement("div"); ui.className = "wk"; ui.setAttribute("data-no-i18n", "");
    ui.innerHTML = `<div class="wk-top" data-game-hud><b class="wk-pos">1/4</b><span class="wk-lap"></span><span class="wk-time">0:00.00</span><button type="button" class="wk-x" data-leave aria-label="${esc(T("Leave"))}">✕</button></div>
      <div class="wk-spd"><b>0</b><small>km/h</small><i class="wk-ni"><s></s><s></s></i></div><div class="wk-msg" aria-live="polite"></div><div class="wk-cd"></div>
      <p class="wk-help">${esc(T(ctx.coarse ? "Hold drift in a corner, let go for a turbo." : "Steer ◀ ▶ · W go · S brake · Shift drift · Space nitro"))}</p>
      ${ctx.coarse ? `<div class="wk-pad"><div class="wk-steer"><button type="button" data-k="l">◀</button><button type="button" data-k="r">▶</button></div><div class="wk-act"><button type="button" data-k="brake">${esc(T("Brake"))}</button><button type="button" data-k="drift" class="wk-dr">${esc(T("Drift"))}</button><button type="button" data-k="boost" class="wk-bo">${esc(T("Nitro"))}</button></div></div>` : ""}`;
    document.body.appendChild(ui);
    ui.addEventListener("click", (e) => { if (e.target.closest("[data-leave]")) leave(); });
    const set = (e, v) => { const b = e.target.closest("[data-k]"); if (!b) return; e.preventDefault(); touch[b.dataset.k] = v; b.classList.toggle("on", !!v); };
    ui.addEventListener("pointerdown", (e) => set(e, 1)); ui.addEventListener("pointerup", (e) => set(e, 0)); ui.addEventListener("pointercancel", (e) => set(e, 0)); ui.addEventListener("pointerleave", (e) => set(e, 0), true);
  }
  let msgT = 0;
  function flash(s) { if (!ui || !s) return; const m = ui.querySelector(".wk-msg"); m.textContent = s; m.classList.remove("on"); void m.offsetWidth; m.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => m.classList.remove("on"), 1300); }
  let hudAt = 0;
  function paintHud() { if (!ui || !me) return; const now = performance.now(); if (now - hudAt < 100) return; hudAt = now; // (10 times a second: no DOM writes every frame)
    ui.querySelector(".wk-pos").textContent = `${place()}/${karts.length}`; ui.querySelector(".wk-lap").textContent = `${T("Lap")} ${Math.max(1, Math.min(LAPS, me.lap))}/${LAPS}`; ui.querySelector(".wk-time").textContent = fmt(phase === "count" ? 0 : me.finish || clock);
    ui.querySelector(".wk-spd b").textContent = Math.round(me.speed * 3.6); const s = ui.querySelectorAll(".wk-ni s"); s[0].style.setProperty("--f", Math.min(1, me.nitro)); s[1].style.setProperty("--f", Math.max(0, Math.min(1, me.nitro - 1))); }
  let lastCd = -1;
  function paintCount() { const n = Math.ceil(cd); if (n === lastCd || !ui) return; lastCd = n; const el = ui.querySelector(".wk-cd"); el.textContent = n > 0 ? String(n) : ""; el.classList.remove("on"); void el.offsetWidth; if (n > 0) el.classList.add("on"); if (ctx.Snd && ctx.Snd.tick) ctx.Snd.tick(); }

  function done() {
    phase = "done"; flash(T("Finish!")); const pl = place(), time = me.finish; let best = 0; try { best = +localStorage.getItem(BEST) || 0; } catch { best = 0; } const nb = !best || time < best; if (nb) try { localStorage.setItem(BEST, String(time)); } catch { /* private */ }
    setTimeout(() => { if (!on || !ui) return; const c = document.createElement("div"); c.className = "wk-res";
      c.innerHTML = `<div class="wk-res-in"><small>${esc(T("ARCIRCLE Nexus Circuit"))}</small><h2>${esc(ord(pl))}</h2><p><span>${esc(T("Time"))}</span><b>${fmt(time)}</b></p><p><span>${esc(T("Best"))}</span><b>${fmt(nb ? time : best)}</b>${nb ? `<em>${esc(T("New best!"))}</em>` : ""}</p><div><button type="button" class="wk-go" data-again>${esc(T("Race again"))}</button><button type="button" class="wk-out" data-leave>${esc(T("Leave"))}</button></div></div>`;
      ui.appendChild(c); c.querySelector("[data-again]").onclick = () => { c.remove(); reset(); }; if (ctx.Snd && ctx.Snd.win) ctx.Snd.win(); }, 1600);
  }

  async function reset() {
    finished = []; clock = 0; acc = 0; for (const k of karts) { const i = track.N - 6 - Math.floor(k.i / 2) * 7, s = track.S[i]; k.idx = i; k.pos.copy(s.p).addScaledVector(s.r, k.i % 2 ? 3.6 : -3.6); k.yaw = k.vh = Math.atan2(s.t.x, s.t.z); Object.assign(k, { speed: 0, lap: 0, prog: 0, drift: 0, charge: 0, boostT: 0, nitro: 0, stall: 0, slip: 0, finish: 0, startSpeed: 0 }); }
    phase = "count"; cd = 3.2; lastCd = -1;
  }

  async function enter() {
    if (on) return true;
    buildScene(); makeUi();
    const ids = ["custom-aron", "custom-lumi", "custom-nex"], mine = ctx.heroId || ids[0], others = ids.filter((x) => x !== mine);
    karts = []; me = await makeRacer(0, mine, true); karts.push(me);
    for (let i = 1; i < 4; i++) karts.push(await makeRacer(i, others[(i - 1) % others.length] || ids[i % 3], false));
    addEventListener("keydown", kd); addEventListener("keyup", ku); addEventListener("resize", onResize);
    on = true; document.body.classList.add("wp-kart"); onResize(); ctx.st.view(scene, cam); ctx.st.solo(tick); reset();
    return true;
  }
  const onResize = () => { if (!cam) return; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  function leave() {
    if (!on) return; on = false; phase = "idle";
    try { ctx.st.solo(null); ctx.st.view(null); } catch { /* the world draws again */ }
    removeEventListener("keydown", kd); removeEventListener("keyup", ku); removeEventListener("resize", onResize); keys.clear();
    if (ui) { ui.remove(); ui = null; } document.body.classList.remove("wp-kart");
    if (scene) scene.traverse((o) => { if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose(); const m = o.material; if (m && !o.isSkinnedMesh) for (const x of [].concat(m)) { if (x.map) x.map.dispose(); x.dispose(); } });
    scene = null; karts = []; me = null;
    if (ctx.onLeave) ctx.onLeave();
  }
  return { enter, leave, on: () => on, debug: () => ({ phase, clock: +clock.toFixed(2), me: me ? { lap: me.lap, idx: me.idx, speed: +me.speed.toFixed(1), drift: me.drift, nitro: +me.nitro.toFixed(2), place: place(), clip: me.hero && me.hero.mixer ? me.hero.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name) : [] } : null, karts: karts.map((k) => ({ lap: k.lap, idx: k.idx, speed: +k.speed.toFixed(1), finish: +k.finish.toFixed(2) })) }), _keys: keys, _touch: touch, auto: (v) => { autoMe = !!v; }, skip: (laps0) => { for (const k of karts) if (!k.me) k.lap = laps0; } };
}
