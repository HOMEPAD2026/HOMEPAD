// world-play.js — ARCIRCLE World (/play): an open little planet you walk as your own character. Every shop opens
// the real tool, Coin City is built from the real ArcPad coins, and a rocket leaves the Launchpad when one launches.
//
// How it moves: the player stays at the top of the world and the planet turns under them, so everything on the
// planet (shops, coins, trees, scammers, the halo, the stars) rides on it. Movement is camera-relative in any
// direction (axis = direction × up); the camera orbits freely and drifts back behind the player while they move.
// Shops open the real page inside the world (an iframe of the same site; arc-nav.js "in-world" hides its chrome).
// The game itself never signs anything: every transaction is the page's own, confirmed in the player's wallet.
//
// Progress (character, XP, quests, key cards, beaten scammers) and settings live in this browser for now
// (localStorage "arc.world" / "arc.world.set").
// Game World is password-locked while it's being tested (world-lock.js); the Platform World stays open.
if (!window.arcWorldLock || !window.arcWorldLock.ok()) {
  document.getElementById("wp-loading").hidden = true;
  if (window.arcWorldLock) await window.arcWorldLock.ask({ cancelHref: "/?skip" });
  else { location.replace("/?skip"); await new Promise(() => {}); }
  document.getElementById("wp-loading").hidden = false;
}
const VER = new URL(import.meta.url).search;
const K = await import("./world-kit.js" + VER);
const { THREE, R } = K;
const $ = (id) => document.getElementById(id);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lc = (a) => String(a || "").toLowerCase();
const hex = (c) => "#" + c.toString(16).padStart(6, "0");
const loadbar = (k) => { const b = $("wp-loadbar"); if (b) b.style.width = Math.round(k * 100) + "%"; };

// ---------------- progress and settings ----------------
const SAVE = "arc.world", SETS = "arc.world.set";
const P = (() => { const d = { xp: 0, visited: [], beaten: [], cards: [], quests: [], char: "", name: "" }; try { return { ...d, ...JSON.parse(localStorage.getItem(SAVE) || "{}") }; } catch { return d; } })();
const S = (() => { const d = { quality: "auto", sound: true, sens: 1 }; try { return { ...d, ...JSON.parse(localStorage.getItem(SETS) || "{}") }; } catch { return d; } })();
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private window */ } };
const saveSet = () => { try { localStorage.setItem(SETS, JSON.stringify(S)); } catch { /* private window */ } };
const level = () => 1 + Math.floor(P.xp / 100);
function gain(n, why) {
  const before = level(); P.xp += n; save(); paintHud();
  toast(`+${n} XP · ${why}` + (level() > before ? ` · Level ${level()}!` : ""));
  if (level() > before) { Snd.level(); burst(0x39ff88); } else Snd.pick();
}
let toastT = 0;
function toast(msg) { const t = $("wp-toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }

// ---------------- sound: small synthesized effects (WebAudio), started by the first touch or key ----------------
const Snd = (() => {
  let ctx = null, out = null, amb = null;
  function init() {
    if (ctx || !S.sound) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    out = ctx.createGain(); out.gain.value = 0.42; out.connect(ctx.destination);
    // a quiet pad underneath everything
    amb = ctx.createGain(); amb.gain.value = 0.035; const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; amb.connect(lp); lp.connect(out);
    [110, 164.8, 220.4].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = i * 4; o.connect(amb); o.start(); });
  }
  function tone(f, dur, { type = "sine", v = 0.18, to = 0, at = 0 } = {}) {
    if (!ctx || !S.sound) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, v = 0.12, f = 900) {
    if (!ctx || !S.sound) return;
    const n = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const fl = ctx.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = f; const g = ctx.createGain(); g.gain.value = v;
    n.buffer = b; n.connect(fl); fl.connect(g); g.connect(out); n.start();
  }
  return {
    init, set(on) { S.sound = on; saveSet(); if (on) init(); if (out) out.gain.value = on ? 0.42 : 0; },
    step: () => noise(0.05, 0.05, 1400), jump: () => tone(300, 0.22, { type: "triangle", to: 620, v: 0.12 }), land: () => noise(0.09, 0.09, 500),
    pick: () => { tone(880, 0.12, { v: 0.12 }); tone(1320, 0.18, { v: 0.1, at: 0.08 }); },
    enter: () => { tone(520, 0.1, { type: "triangle", v: 0.12 }); tone(780, 0.14, { type: "triangle", v: 0.1, at: 0.07 }); },
    level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: "triangle", v: 0.12, at: i * 0.09 })),
    rocket: () => { noise(1.6, 0.16, 180); tone(90, 1.4, { type: "sawtooth", to: 40, v: 0.05 }); },
    bad: () => tone(220, 0.3, { type: "square", to: 140, v: 0.06 }), win: () => [659, 880, 1175].forEach((f, i) => tone(f, 0.2, { v: 0.12, at: i * 0.1 })),
  };
})();
addEventListener("pointerdown", () => Snd.init(), { once: true });
addEventListener("keydown", () => Snd.init(), { once: true });

// ---------------- the scene ----------------
const cv = $("wp-cv");
if (!K.webglOk()) {
  $("wp-loading").innerHTML = `<span>This browser can't draw the 3D world.</span><a class="wp-cta" href="/?skip">Go to the Platform World</a>`;
  throw new Error("no webgl");
}
try { await document.fonts.load("700 92px Sora"); } catch { /* system font */ }
loadbar(0.15);
const st = K.makeStage(cv, { fog: 0.0075, bloom: 0.7, fov: 55, shadows: true, quality: S.quality });
st.scene.background = null;
const kitP = K.loadKit(VER).catch((e) => { console.warn("world models:", e); return null; });
const planet = K.makePlanet({ map: "/models/world/planet-surface.jpg" + VER }); st.scene.add(planet);
planet.add(K.makeSky()); planet.add(K.makeSkyPlanets(VER)); planet.add(K.makeHalo()); planet.add(K.makeStars()); planet.add(K.makePaths()); planet.add(K.makeDistrictSigns());
const spins = [];
const shops = K.SHOPS.map((spec) => { const g = K.makeShop(spec); K.placeOn(g, K.dirOf(spec.theta, spec.phi)); planet.add(g); K.shadowy(g); spins.push(...g.userData.spin); return g; });
const portal = K.makePortal(); K.placeOn(portal, K.dirOf(K.PORTAL.theta, K.PORTAL.phi)); planet.add(portal); spins.push(...portal.userData.spin);
const scammers = K.SCAMMERS.filter((s) => !P.beaten.includes(s.id)).map((spec) => { const g = K.makeScammer(spec); planet.add(g); spins.push(...g.userData.spin); return g; });
planet.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
const glowLight = new THREE.PointLight(0x35d8d0, 5, 7, 2); glowLight.position.set(0, R + 0.5, 0); st.scene.add(glowLight);
loadbar(0.35);

// the player: a group at the top of the world; the character inside it turns to face where it walks
const player = new THREE.Group(); player.position.set(0, R, 0); st.scene.add(player);
let avatar = null, nameTag = null;
async function setAvatar(id) {
  const a = await K.makeCharacter(id, VER).catch(() => K.makeCharacter("bot"));
  if (avatar) player.remove(avatar.obj);
  avatar = a; player.add(a.obj); a.obj.rotation.y = facing;
  setNameTag();
}
function setNameTag() {
  if (nameTag) { player.remove(nameTag); nameTag.material.map.dispose(); }
  nameTag = K.label(P.name || "Player", { accent: "#35d8d0", size: 0.42 }); nameTag.position.y = 3.15; player.add(nameTag);
}

// ---- the kit models (Kenney + Quaternius, CC0) ----
const cards = [], mixers = [], town = [], lockedStages = [], coinBuildings = [];
let coinData = null, lastSeen = 0, myCoins = []; // ArcPad coins (refreshCoins)
let labels = null; // sign sprites, gathered on first use (fadeLabels)
const kit = await Promise.race([kitP, new Promise((r) => setTimeout(() => r(null), 12000))]);
loadbar(0.75);
function dressWorld(kit) {
  if (!kit) return;
  shops.forEach((g) => K.decorate(g, kit));
  K.makeTown(kit).forEach((g) => { planet.add(g); town.push(g); spins.push(...g.userData.spin); });
  scammers.forEach((g) => {
    const e = K.enemy(kit, "EyeDrone"); if (!e) return;
    const u = g.userData; u.rig.children.forEach((c) => { if (!c.isSprite) c.visible = false; });
    e.obj.scale.setScalar(0.62); e.obj.position.y = 1.5; u.rig.add(e.obj); u.enemy = e; e.play("Idle"); mixers.push(e.mixer);
    const sign = u.rig.children.find((c) => c.isSprite); if (sign) sign.position.set(0, 3.0, 0);
  });
  [["QuadShell", 2, "The Fake Airdrop", 68, 175], ["Trilobite", 3, "The Honeypot", 72, 235]].forEach(([name, stage, title, th, ph]) => {
    const e = K.enemy(kit, name); if (!e) return;
    const g = new THREE.Group(); e.obj.scale.setScalar(name === "Trilobite" ? 1.3 : 1.1); e.obj.position.y = name === "Trilobite" ? 1.1 : 0.9; g.add(e.obj);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.2, 6, 1, true), new THREE.MeshBasicMaterial({ color: K.C.scam, wireframe: true, transparent: true, opacity: 0.35 }));
    cage.position.y = 1.6; g.add(cage);
    const tag = K.label(`Stage ${stage} · locked`, { accent: "#ff4d6d", color: "#ffd7de", size: 0.75 }); tag.position.y = 4.4; g.add(tag);
    K.placeOn(g, K.dirOf(th, ph)); planet.add(g); mixers.push(e.mixer);
    const a = e.play("TurnOff", { once: true }); if (a) a.time = a.getClip().duration;
    g.userData = { radius: 2.3, locked: { stage, title } };
    lockedStages.push(g);
  });
  K.CARDS.forEach(([th, ph], i) => {
    const id = "c" + i; if (P.cards.includes(id)) return;
    const g = K.makeCard(kit); K.placeOn(g, K.dirOf(th, ph)); planet.add(g); spins.push(...g.userData.spin); g.userData.id = id; cards.push(g);
  });
  if (coinData) buildCoinCity(coinData);
  paintHud();
  if (labels) labels.dirty = true;
}
if (kit) dressWorld(kit); else kitP.then((k) => k && dressWorld(k));

// ---------------- input ----------------
const keys = new Set();
let joy = null, look = null, camYaw = 0, camPitch = 0.05, frozen = false, flying = null, lastLook = 0, runToggle = false;
let camDist = coarse ? 1.12 : 1;
const typing = (e) => /input|textarea|select/i.test(e.target.tagName);
const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", " "];
addEventListener("keydown", (e) => {
  if (typing(e)) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { closeAll(); return; }
  if (frozen) return;
  if (k === "e" || k === "enter") { if (near) { e.preventDefault(); enter(near); } return; }
  if (k === "m") { openMap(); return; }
  if (k === "1") { emote("emote-yes"); return; }
  if (k === "2") { emote("emote-no"); return; }
  if (k === " ") { e.preventDefault(); jump(); return; }
  if (MOVE_KEYS.includes(k)) { keys.add(k); e.preventDefault(); }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const joyEl = $("wp-joy"), knob = joyEl.querySelector("i");
cv.addEventListener("pointerdown", (e) => {
  if (frozen) return;
  cv.setPointerCapture(e.pointerId);
  if (e.pointerType !== "mouse" && e.clientX < innerWidth * 0.5 && !joy) {
    joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    joyEl.style.left = e.clientX + "px"; joyEl.style.top = e.clientY + "px"; joyEl.classList.add("on"); knob.style.transform = "";
  } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
cv.addEventListener("pointermove", (e) => {
  if (joy && e.pointerId === joy.id) {
    let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const m = Math.hypot(dx, dy), max = 56;
    if (m > max) { dx *= max / m; dy *= max / m; }
    joy.dx = dx / max; joy.dy = dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`;
  } else if (look && e.pointerId === look.id) {
    camYaw -= (e.clientX - look.x) * 0.006 * S.sens;
    camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - look.y) * 0.004 * S.sens, -0.3, 0.75);
    look.x = e.clientX; look.y = e.clientY; lastLook = performance.now();
  }
});
const lift = (e) => {
  if (joy && e.pointerId === joy.id) { joy = null; joyEl.classList.remove("on"); }
  if (look && e.pointerId === look.id) look = null;
};
cv.addEventListener("pointerup", lift); cv.addEventListener("pointercancel", lift);
cv.addEventListener("wheel", (e) => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.0012, 0.6, 1.9); }, { passive: true });
$("wp-act-jump").addEventListener("click", () => jump());
$("wp-act-run").addEventListener("click", (e) => { runToggle = !runToggle; e.currentTarget.setAttribute("aria-pressed", String(runToggle)); });
$("wp-act-emote").addEventListener("click", () => emote("emote-yes"));

// ---------------- movement on the sphere ----------------
const Y = new THREE.Vector3(0, 1, 0), qa = new THREE.Quaternion(), prevQ = new THREE.Quaternion();
const at = new THREE.Vector3(0, R, 0), tmp = new THREE.Vector3(), dir = new THREE.Vector3(), axis = new THREE.Vector3();
let speedNow = 0, facing = Math.PI, hop = 0, vy = 0, grounded = true, near = null, stepT = 0;
function inputs() {
  let x = 0, y = 0;
  if (keys.has("w") || keys.has("arrowup")) y += 1;
  if (keys.has("s") || keys.has("arrowdown")) y -= 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  if (joy) { x += joy.dx; y += -joy.dy; }
  const m = Math.min(1, Math.hypot(x, y));
  const run = keys.has("shift") || runToggle || (joy && Math.hypot(joy.dx, joy.dy) > 0.95);
  return { x, y, m, run };
}
function blocked() {
  for (const list of [shops, [portal], lockedStages, town, coinBuildings]) for (const g of list) { g.getWorldPosition(tmp); if (tmp.distanceTo(at) < g.userData.radius + 0.55) return true; }
  return false;
}
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
function jump() { if (!grounded || frozen) return; vy = 9; grounded = false; Snd.jump(); if (avatar) avatar.play("jump", { once: true, fade: 0.08 }); }
function emote(name) { if (!avatar || frozen || !grounded) return; avatar.play(name, { once: true }); }
function step(dt) {
  // jump and fall
  if (!grounded) { vy -= 24 * dt; hop += vy * dt; if (hop <= 0) { hop = 0; vy = 0; grounded = true; Snd.land(); } }
  player.position.y = R + hop;
  if (frozen) { speedNow = THREE.MathUtils.lerp(speedNow, 0, 0.2); return; }
  if (flying) {
    const k = Math.min(1, (performance.now() - flying.t0) / flying.ms), e = 1 - Math.pow(1 - k, 3);
    planet.quaternion.slerpQuaternions(flying.from, flying.to, e);
    camYaw = angLerp(camYaw, 0, 0.08); facing = angLerp(facing, Math.PI, 0.1);
    speedNow = 0.6 * (1 - k);
    if (k >= 1) flying = null;
    return;
  }
  const { x, y, m, run } = inputs();
  let sp = 0;
  if (m > 0.05) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    dir.set(rx * x + fx * y, 0, rz * x + fz * y).normalize();
    sp = (run ? 12.5 : 6.5) * m;
    prevQ.copy(planet.quaternion);
    axis.crossVectors(dir, Y).normalize();
    qa.setFromAxisAngle(axis, (sp * dt) / R); planet.quaternion.premultiply(qa);
    planet.updateMatrixWorld(true);
    if (blocked()) { planet.quaternion.copy(prevQ); sp *= 0.2; }
    facing = angLerp(facing, Math.atan2(dir.x, dir.z), 1 - Math.exp(-12 * dt));
    // the camera drifts back behind the player while they move and nobody is dragging it
    if (!look && performance.now() - lastLook > 1400 && y > 0.3) camYaw = angLerp(camYaw, facing - Math.PI, dt * 0.9);
    stepT -= dt * sp; if (grounded && stepT < 0) { Snd.step(); stepT = 2.6; }
  }
  speedNow = THREE.MathUtils.lerp(speedNow, sp, 0.2);
}
// fly to a place: the player lands in front of it (shops face the spawn point) and turns to it
function flyTo(g) {
  const V = THREE.Vector3, d = g.position.clone().normalize(), pole = new V(0, 1, 0);
  const tp = pole.clone().sub(d.clone().multiplyScalar(pole.dot(d)));
  if (tp.lengthSq() < 1e-6) tp.set(0, 0, 1);
  tp.normalize();
  const a = (g.userData.radius + 1.7) / R;
  const up = d.clone().multiplyScalar(Math.cos(a)).add(tp.multiplyScalar(Math.sin(a))).normalize();
  const fwd = d.clone().sub(up.clone().multiplyScalar(d.dot(up))).normalize(), back = fwd.negate();
  const right = new V().crossVectors(up, back);
  const to = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back).transpose());
  flying = { from: planet.quaternion.clone(), to, t0: performance.now(), ms: reduce ? 1 : 1500 };
  camPitch = 0.05;
}

// ---------------- what's in reach ----------------
function nearest() {
  let best = null, bd = Infinity;
  for (const g of shops) { g.getWorldPosition(tmp); const d = tmp.distanceTo(at) - g.userData.radius; if (d < 2.8 && d < bd) { bd = d; best = { kind: "shop", g, spec: g.userData.spec }; } }
  for (const g of coinBuildings) { g.getWorldPosition(tmp); const d = tmp.distanceTo(at) - g.userData.radius; if (d < 2.4 && d < bd) { bd = d; best = { kind: "coin", g, coin: g.userData.coin }; } }
  portal.getWorldPosition(tmp); { const d = tmp.distanceTo(at) - portal.userData.radius; if (d < 2.4 && d < bd) best = { kind: "portal", g: portal }; }
  return best;
}
function paintPrompt() {
  const p = $("wp-prompt");
  if (!near || frozen) { p.hidden = true; return; }
  p.hidden = false;
  $("wp-enter-t").innerHTML = near.kind === "portal" ? "Go to <b>Platform World</b>" : near.kind === "coin" ? `Visit <b>$${esc(near.coin.symbol)}</b>` : `Enter <b>${esc(near.spec.name)}</b>`;
}
$("wp-enter").addEventListener("click", () => near && enter(near));

// ---------------- shops and coin buildings ----------------
const sheet = $("wp-sheet"), frame = $("wp-frame");
let openShop = null;
function openSheet(title, line, url) {
  $("wp-sheet-h").textContent = title; $("wp-sheet-p").textContent = line;
  $("wp-sheet-full").href = url;
  $("wp-frame-load").hidden = false;
  frame.onload = () => { $("wp-frame-load").hidden = true; };
  if (frame.getAttribute("src") !== url) frame.src = url; else $("wp-frame-load").hidden = true;
  sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add("on"));
  frozen = true; keys.clear(); paintPrompt(); Snd.enter();
  if (avatar) avatar.play("interact-right", { once: true });
  $("wp-sheet-x").focus({ preventScroll: true });
}
function enter(n) {
  if (n.kind === "portal") { location.href = "/?skip"; return; }
  if (n.kind === "coin") {
    const c = n.coin, mc = Number(c.marketCapUsd) || 0;
    openSheet("$" + c.symbol, `${c.name || c.symbol} · market cap ${mc >= 1e6 ? "$" + (mc / 1e6).toFixed(2) + "M" : "$" + Math.round(mc).toLocaleString("en-US")}${n.g.userData.mine ? " · your coin" : ""}`, "/arc#coin/" + c.token);
    openShop = n.g;
    if (!P.visited.includes("coin")) { P.visited.push("coin"); save(); }
    checkQuests();
    return;
  }
  const s = n.spec;
  openSheet(s.name, s.line, s.url);
  if (n.g.userData.chestOpen) n.g.userData.chestOpen();
  openShop = n.g;
  if (!P.visited.includes(s.id)) { P.visited.push(s.id); gain(10, `found the ${s.name}`); }
  checkQuests();
}
function closeSheet() {
  if (sheet.hidden) return;
  if (openShop && openShop.userData.chestClose) openShop.userData.chestClose();
  openShop = null;
  sheet.classList.remove("on"); setTimeout(() => { sheet.hidden = true; }, reduce ? 0 : 260);
  frozen = false; refreshPurse(true); refreshCoins();
}
$("wp-sheet-x").addEventListener("click", closeSheet);
addEventListener("message", (e) => { if (e.origin === location.origin && e.data && e.data.arcWorld === "close") closeSheet(); });

// ---------------- Coin City and the live feed: real ArcPad data (/api/c?view=launches) ----------------
const feedEl = $("wp-feed");
function feed(html, color = "#39ff88") {
  const li = document.createElement("li"); li.innerHTML = `<i style="--c:${color}"></i><span>${html}</span>`;
  feedEl.prepend(li); requestAnimationFrame(() => li.classList.add("on"));
  while (feedEl.children.length > 4) feedEl.lastChild.remove();
  setTimeout(() => { li.classList.remove("on"); setTimeout(() => li.remove(), 400); }, 14000);
}
function buildCoinCity(list) {
  if (!kit) return;
  coinBuildings.splice(0).forEach((g) => planet.remove(g));
  const me = lc(addr());
  const mine = me ? list.filter((c) => lc(c.creator) === me) : [];
  const rest = list.filter((c) => !mine.includes(c)).sort((a, b) => (Number(b.marketCapUsd) || 0) - (Number(a.marketCapUsd) || 0));
  const pick = [...mine.slice(0, 4), ...rest].slice(0, K.COIN_LOTS.length);
  pick.forEach((c, i) => {
    const g = K.makeCoinBuilding(kit, c, mine.includes(c)); const [th, ph] = K.COIN_LOTS[i];
    K.placeOn(g, K.dirOf(th, ph)); planet.add(g); spins.push(...g.userData.spin); coinBuildings.push(g);
  });
  if (labels) labels.dirty = true;
}
async function refreshCoins(first) {
  let j = null;
  try { const r = await fetch("/api/c?view=launches", { cache: "no-store" }); if (r.ok) j = await r.json(); } catch { /* offline: keep what we have */ }
  const list = (j && Array.isArray(j.launches) ? j.launches : []).filter((c) => c && c.token && c.symbol);
  if (!list.length) return;
  const newest = Math.max(...list.map((c) => c.launchedAt || 0));
  const me = lc(addr());
  myCoins = me ? list.filter((c) => lc(c.creator) === me) : [];
  if (first || !coinData) {
    const recent = list.slice().sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 3);
    recent.reverse().forEach((c) => feed(`<b>$${esc(c.symbol)}</b> launched on ArcPad ${ago(c.launchedAt)}`, "#4f9dff"));
  } else if (newest > lastSeen) {
    list.filter((c) => c.launchedAt > lastSeen).slice(0, 3).forEach((c) => { feed(`New on ArcPad: <b>$${esc(c.symbol)}</b> just launched`); launchRocket(); });
  }
  lastSeen = newest;
  const changed = !coinData || coinData.length !== list.length || myCoins.length !== (coinData.mine || 0);
  coinData = list; coinData.mine = myCoins.length;
  if (changed) buildCoinCity(list);
  checkQuests();
}
const ago = (t) => { const s = Math.max(1, Date.now() / 1000 - t); return s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; };
const rockets = [];
function launchRocket() {
  const pad = shops.find((g) => g.userData.spec.id === "launch"); if (!pad) return;
  rockets.push(K.rocketLaunch(planet, pad.position.clone().multiplyScalar(1.0)));
  pad.getWorldPosition(tmp); if (tmp.distanceTo(at) < 40) { Snd.rocket(); shake = 0.6; }
}
let shake = 0;
setInterval(() => refreshCoins(false), 45000);

// ---------------- quests: checked against the game and the chain ----------------
const shopG = (id) => shops.find((g) => g.userData.spec.id === id);
const QUESTS = [
  { id: "launchpad", t: "Visit the Launchpad", xp: 15, done: () => P.visited.includes("launch"), target: () => shopG("launch") },
  { id: "wallet", t: "Connect your wallet", xp: 20, done: () => !!addr(), target: () => null },
  { id: "cards3", t: "Pick up 3 key cards", xp: 20, done: () => P.cards.length >= 3, target: () => nearestOf(cards) },
  { id: "scanner", t: "Open the Scanner Tower", xp: 15, done: () => P.visited.includes("scanner"), target: () => shopG("scanner") },
  { id: "phisher", t: "Beat The Phisher in the Dark Market", xp: 0, done: () => P.beaten.includes("phisher"), target: () => scammers[0] || null },
  { id: "coincity", t: "Visit a coin in Coin City", xp: 15, done: () => P.visited.includes("coin"), target: () => coinBuildings[0] || null },
  { id: "hold", t: "Hold some $ARCIRCLE", xp: 25, done: () => (bal.arc || 0) > 0, target: () => shopG("swap") },
  { id: "launch", t: "Launch your own coin on ArcPad", xp: 100, done: () => myCoins.length > 0, target: () => shopG("launch") },
];
function nearestOf(list) { let b = null, bd = Infinity; list.forEach((g) => { g.getWorldPosition(tmp); const d = tmp.distanceTo(at); if (d < bd) { bd = d; b = g; } }); return b; }
const beacon = K.makeBeacon(K.C.gold, 22); spins.push(beacon.userData.spin);
let questTarget = null;
function checkQuests() {
  let changed = false;
  QUESTS.forEach((q) => { if (!P.quests.includes(q.id) && q.done()) { P.quests.push(q.id); save(); changed = true; feed(`Quest done: <b>${esc(q.t)}</b>`, "#ffc861"); if (q.xp) gain(q.xp, q.t); else Snd.win(); } });
  paintQuests(); return changed;
}
function paintQuests() {
  const open = QUESTS.filter((q) => !P.quests.includes(q.id));
  $("wp-quests-n").textContent = `${QUESTS.length - open.length}/${QUESTS.length}`;
  $("wp-quests-l").innerHTML = open.slice(0, 3).map((q, i) => `<li${i === 0 ? ' class="cur"' : ""}><i></i><span>${esc(q.t)}</span>${q.xp ? `<small>+${q.xp} XP</small>` : ""}</li>`).join("") || `<li class="done"><span>All quests done. More soon.</span></li>`;
  const cur = open[0], tg = cur && cur.target();
  if (tg !== questTarget) { if (beacon.parent) beacon.parent.remove(beacon); questTarget = tg; if (tg) tg.add(beacon); }
}
$("wp-quests-h").addEventListener("click", (e) => { const q = $("wp-quests"); const o = q.classList.toggle("closed"); e.currentTarget.setAttribute("aria-expanded", String(!o)); });

// ---------------- map ----------------
const mapEl = $("wp-mapsheet");
function openMap() {
  const groups = K.DISTRICTS.filter((d) => d.id !== "coins" && d.id !== "dark").map((d) => {
    const list = shops.filter((g) => g.userData.spec.district + " District" === d.name || (d.id === "arcia" && g.userData.spec.district === "ARCIA"));
    return list.length ? `<h3 style="--c:${hex(d.color)}">${esc(d.name)}</h3><ul class="wp-maplist">` + list.map((g) => { const s = g.userData.spec; return `<li><button type="button" data-i="${shops.indexOf(g)}"><i style="--c:${hex(s.color)}"></i><span><b>${esc(s.name)}</b><small>${esc(s.line)}</small></span>${P.visited.includes(s.id) ? "<em>visited</em>" : ""}</button></li>`; }).join("") + "</ul>" : "";
  }).join("");
  const coinsHtml = coinBuildings.length ? `<h3 style="--c:#eef3f7">Coin City</h3><ul class="wp-maplist">` + coinBuildings.slice(0, 6).map((g, i) => `<li><button type="button" data-c="${i}"><i style="--c:${g.userData.mine ? "#39ff88" : "#4f9dff"}"></i><span><b>$${esc(g.userData.coin.symbol)}</b><small>${esc(g.userData.coin.name || "")}${g.userData.mine ? " · yours" : ""}</small></span></button></li>`).join("") + "</ul>" : "";
  $("wp-maplist").innerHTML = groups + coinsHtml + `<h3 style="--c:#35d8d0">Ways out</h3><ul class="wp-maplist"><li><button type="button" data-i="portal"><i style="--c:#35d8d0"></i><span><b>Platform World</b><small>Back to the site as it is.</small></span></button></li></ul>`;
  mapEl.hidden = false; frozen = true; keys.clear(); paintPrompt();
  const first = mapEl.querySelector("button[data-i]"); if (first) first.focus({ preventScroll: true });
}
function closeMap() { if (mapEl.hidden) return; mapEl.hidden = true; frozen = false; }
$("wp-map-btn").addEventListener("click", openMap);
$("wp-map-x").addEventListener("click", closeMap);
mapEl.addEventListener("click", (e) => {
  if (e.target === mapEl) { closeMap(); return; }
  const b = e.target.closest("button[data-i],button[data-c]"); if (!b) return;
  closeMap();
  if (b.dataset.c != null) flyTo(coinBuildings[+b.dataset.c]);
  else flyTo(b.dataset.i === "portal" ? portal : shops[+b.dataset.i]);
});

// ---------------- minimap: what's around, forward is up ----------------
const mini = $("wp-mini"), mg = mini.getContext("2d");
let miniT = 0;
function drawMini() {
  const W = mini.width, c = W / 2, range = 34, sc = (c - 10) / range;
  mg.clearRect(0, 0, W, W);
  mg.save(); mg.beginPath(); mg.arc(c, c, c - 2, 0, 6.283); mg.clip();
  mg.fillStyle = "rgba(8,14,22,.82)"; mg.fillRect(0, 0, W, W);
  mg.strokeStyle = "rgba(53,216,208,.14)"; mg.lineWidth = 2; [0.33, 0.66].forEach((k) => { mg.beginPath(); mg.arc(c, c, (c - 2) * k, 0, 6.283); mg.stroke(); });
  const cs = Math.cos(camYaw), sn = Math.sin(camYaw);
  const put = (g, color, r, glyph) => {
    g.getWorldPosition(tmp); if (tmp.y < R * 0.3) return null;
    const x = tmp.x, z = tmp.z, rx = x * cs - z * sn, rz = x * sn + z * cs; // rotate so the camera's forward is up
    let px = c + rx * sc, py = c + rz * sc; const dd = Math.hypot(px - c, py - c), edge = c - 12;
    const out = dd > edge; if (out) { px = c + (px - c) / dd * edge; py = c + (py - c) / dd * edge; }
    mg.fillStyle = color; mg.beginPath(); mg.arc(px, py, out ? r * 0.7 : r, 0, 6.283); mg.fill();
    if (glyph && !out) { mg.fillStyle = "#04121a"; mg.font = "700 13px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.fillText(glyph, px, py + 0.5); }
    return { px, py };
  };
  coinBuildings.forEach((g) => put(g, g.userData.mine ? "#39ff88" : "rgba(238,243,247,.55)", 4));
  cards.forEach((g) => put(g, "#ffc861", 3.5));
  put(portal, "#35d8d0", 6);
  shops.forEach((g) => put(g, hex(g.userData.spec.color), 9, g.userData.spec.name[0]));
  scammers.forEach((g) => put(g, "#ff4d6d", 6));
  lockedStages.forEach((g) => put(g, "rgba(255,77,109,.5)", 5));
  if (questTarget) { const p = put(questTarget, "#ffc861", 0); if (p) { mg.strokeStyle = "#ffc861"; mg.lineWidth = 3; mg.beginPath(); mg.arc(p.px, p.py, 12, 0, 6.283); mg.stroke(); } }
  mg.restore();
  // the player: an arrow pointing where they face
  const fa = facing - Math.PI - camYaw;
  mg.save(); mg.translate(c, c); mg.rotate(-fa); mg.fillStyle = "#eef3f7"; mg.beginPath(); mg.moveTo(0, -11); mg.lineTo(8, 9); mg.lineTo(0, 4); mg.lineTo(-8, 9); mg.closePath(); mg.fill(); mg.restore();
  mg.strokeStyle = "rgba(255,255,255,.18)"; mg.lineWidth = 2; mg.beginPath(); mg.arc(c, c, c - 2, 0, 6.283); mg.stroke();
  // which district we're in
  let dn = "", bd = Infinity; K.DISTRICTS.forEach((d) => { const v = K.dirOf(d.theta, d.phi).multiplyScalar(R).applyQuaternion(planet.quaternion); const dd = v.distanceTo(at); if (dd < bd) { bd = dd; dn = d.name; } });
  $("wp-mini-n").textContent = bd < 18 ? dn : "";
}

// ---------------- scammers ----------------
const FIGHTS = {
  phisher: {
    q: "Congratulations! Your wallet won 500 USDC. Approve my contract and I'll send it right over.",
    opts: [
      { t: "Approve to claim the 500 USDC", win: false, out: "That approval would let him spend every token you hold, now or later. A real airdrop never needs you to approve a stranger's contract." },
      { t: "Check his contract in the Scanner first", win: true, out: "The Scanner flags it: an unverified contract asking for unlimited spending. The Phisher's trick is exposed and he runs off the planet." },
      { t: "Ignore him and walk away", win: false, out: "Safe, but he'll keep fishing for the next player. Expose the trick to beat him." },
    ],
  },
};
const fight = $("wp-fight");
let fighting = null, scamCool = 0;
function startFight(g) {
  const s = g.userData.spec, f = FIGHTS[s.id]; if (!f) return;
  fighting = g; frozen = true; keys.clear(); paintPrompt(); Snd.bad();
  if (g.userData.enemy) g.userData.enemy.play("Attack");
  $("wp-fight-stage").textContent = `Stage ${s.stage} · scammer`;
  $("wp-fight-h").textContent = s.name;
  $("wp-fight-q").textContent = f.q;
  $("wp-fight-opts").innerHTML = f.opts.map((o, i) => `<button type="button" data-i="${i}">${esc(o.t)}</button>`).join("");
  $("wp-fight-out").hidden = true;
  fight.hidden = false;
  fight.querySelector("button[data-i]").focus({ preventScroll: true });
}
fight.addEventListener("click", (e) => {
  if (e.target.closest("[data-done]")) { endFight(); return; }
  const b = e.target.closest("button[data-i]"); if (!b || !fighting) return;
  const s = fighting.userData.spec, o = FIGHTS[s.id].opts[+b.dataset.i], out = $("wp-fight-out");
  out.hidden = false; out.className = "wp-fight-out " + (o.win ? "win" : "lose"); out.textContent = o.out;
  if (o.win) {
    $("wp-fight-opts").innerHTML = `<button type="button" class="wp-cta" data-done="1">Back to the planet</button>`;
    P.beaten.push(s.id); save();
    const g = fighting; if (g.userData.enemy) g.userData.enemy.play("Hit", { once: true });
    setTimeout(() => poof(g), 500); gain(50, `beat ${s.name}`); Snd.win();
    if (avatar) avatar.play("emote-yes", { once: true });
    paintHud(); checkQuests();
  } else { b.disabled = true; Snd.bad(); if (fighting.userData.enemy) fighting.userData.enemy.play(o.t.startsWith("Approve") ? "BackFlip" : "Look", { once: true }); }
});
function endFight() { if (fight.hidden) return; fight.hidden = true; frozen = false; scamCool = 4; fighting = null; }
function poof(g) {
  const t0 = performance.now();
  const off = st.on(() => { const k = (performance.now() - t0) / 700; g.scale.setScalar(Math.max(0.001, 1 - k)); g.rotation.y += 0.3; if (k >= 1) { off(); planet.remove(g); scammers.splice(scammers.indexOf(g), 1); paintQuests(); } });
}
function moveScammers(t) {
  scammers.forEach((g, i) => { const s = g.userData.spec; K.placeOn(g, K.dirOf(s.theta + Math.sin(t * 0.21 + i) * 4, s.phi + Math.sin(t * 0.13 + i * 2) * 12)); });
}
function scamCheck(dt) {
  if (scamCool > 0) { scamCool -= dt; return; }
  if (frozen || flying) return;
  for (const g of scammers) { g.getWorldPosition(tmp); if (tmp.distanceTo(at) < 2.6) { startFight(g); return; } }
}

// labels fade out as the camera comes close, so a sign never fills the screen
function fadeLabels() {
  if (!labels || labels.dirty) { labels = []; planet.traverse((o) => { if (o.isSprite) labels.push(o); }); }
  for (const l of labels) { l.getWorldPosition(tmp); const d = tmp.distanceTo(cam.position); l.material.opacity = THREE.MathUtils.clamp((d - 6) / 6, 0, 1); l.visible = l.material.opacity > 0.02; }
}

// ---------------- key cards and the stages still locked ----------------
function pickCards() {
  for (let i = cards.length - 1; i >= 0; i--) {
    const g = cards[i]; g.getWorldPosition(tmp);
    if (tmp.distanceTo(at) < 2.0 + hop) {
      cards.splice(i, 1); P.cards.push(g.userData.id); save();
      const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 450; g.scale.setScalar(Math.max(0.001, 1 + k * 0.6 - k * k * 1.6)); if (k >= 1) { off(); planet.remove(g); } });
      if (avatar && grounded) avatar.play("pick-up", { once: true });
      gain(5, `key card ${P.cards.length}/${K.CARDS.length}`); checkQuests();
    }
  }
}
let lockCool = 0;
function lockedCheck(dt) {
  if (lockCool > 0) { lockCool -= dt; return; }
  for (const g of lockedStages) {
    g.getWorldPosition(tmp);
    if (tmp.distanceTo(at) < g.userData.radius + 2.2) {
      const L = g.userData.locked, prev = K.SCAMMERS.find((x) => x.stage === L.stage - 1);
      toast(prev && !P.beaten.includes(prev.id) ? `Stage ${L.stage}, ${L.title}: beat ${prev.name} first` : `Stage ${L.stage}, ${L.title}: coming soon`);
      lockCool = 5; return;
    }
  }
}
// a ring of light from the player (level up)
function burst(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, R + 0.1, 0); st.scene.add(m);
  const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 900; m.scale.setScalar(1 + k * 7); m.material.opacity = 0.9 * (1 - k); if (k >= 1) { off(); st.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
}

// ---------------- wallet purse ----------------
const AC = window.arcConnect, CFG = window.CONFIG || {};
const addr = () => (AC && AC.address && AC.address()) || "";
const bal = { usdc: null, arc: null };
let purseAt = 0;
async function refreshPurse(force) {
  const a = addr();
  $("wp-wallet-t").textContent = a ? a.slice(0, 6) + "…" + a.slice(-4) : "Connect wallet";
  $("wp-wallet").classList.toggle("on", !!a);
  $("wp-purse").hidden = !a;
  if (!a || (!force && Date.now() - purseAt < 30000)) { checkQuests(); return; }
  purseAt = Date.now();
  try {
    const body = [
      { jsonrpc: "2.0", id: 0, method: "eth_getBalance", params: [a, "latest"] },
      { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: CFG.ARCIRCLE_TOKEN, data: "0x70a08231" + a.slice(2).toLowerCase().padStart(64, "0") }, "latest"] },
    ];
    const j = await (await fetch(CFG.RPC_URL || "https://rpc.mainnet.arc.io", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
    const m = {}; (Array.isArray(j) ? j : [j]).forEach((x) => (m[x.id] = x.result));
    const n = (h) => Number(BigInt(h || "0x0") / 10n ** 14n) / 1e4;
    const f = (v) => v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e4 ? (v / 1e3).toFixed(1) + "K" : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    bal.usdc = n(m[0]); bal.arc = n(m[1]);
    $("wp-usdc").textContent = f(bal.usdc); $("wp-arc").textContent = f(bal.arc);
  } catch { /* keep the last numbers */ }
  checkQuests();
}
$("wp-wallet").addEventListener("click", () => { if (AC && !addr()) AC.connect().then(() => { refreshPurse(true); refreshCoins(); }).catch(() => {}); else if (AC) refreshPurse(true); });
if (AC && AC.on) AC.on(() => { refreshPurse(true); refreshCoins(); });
setInterval(() => refreshPurse(false), 30000);

// ---------------- HUD ----------------
function paintHud() {
  $("wp-lv").querySelector("b").textContent = "Lv " + level();
  $("wp-xpfill").style.width = (P.xp % 100) + "%";
  $("wp-lv").title = `${P.xp} XP`;
  $("wp-cards").querySelector("b").textContent = `${P.cards.length}/${K.CARDS.length}`;
  const next = K.SCAMMERS.find((s) => !P.beaten.includes(s.id));
  $("wp-stage").textContent = next ? `Stage ${next.stage} · ${next.name}` : `Stage ${K.SCAMMERS.length + 1} · coming soon`;
}

// ---------------- character maker ----------------
const make = $("wp-make");
let pickChar = P.char || "male-a";
function openMake() {
  $("wp-make-grid").innerHTML = K.CHARACTERS.map((id) => `<button type="button" role="radio" aria-checked="${id === pickChar}" data-c="${id}" title="${id === "bot" ? "ARC Bot" : id.replace("-", " ")}">${id === "bot" ? '<img src="/images/arcircle-mark-sm.png" alt="ARC Bot">' : `<img src="/models/world/chars/${id}.webp${VER}" alt="${id.replace("-", " ")}">`}</button>`).join("");
  $("wp-make-name").value = P.name || "";
  make.hidden = false; frozen = true; keys.clear(); paintPrompt();
  camYaw = facing; // look at the player from the front
  setTimeout(() => $("wp-make-name").focus({ preventScroll: true }), 60);
}
$("wp-make-grid").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-c]"); if (!b) return;
  pickChar = b.dataset.c; $("wp-make-grid").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  setAvatar(pickChar).then(() => avatar && avatar.play("emote-yes", { once: true }));
});
$("wp-make-go").addEventListener("click", () => {
  P.char = pickChar; P.name = ($("wp-make-name").value || "").trim().slice(0, 16) || "Player"; save();
  setNameTag(); make.hidden = true; frozen = false; camYaw = facing - Math.PI; paintQuests();
});

// ---------------- settings ----------------
const setEl = $("wp-setsheet");
function openSet() {
  setEl.querySelectorAll("#wp-set-q button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === S.quality)));
  $("wp-set-q-note").textContent = "";
  $("wp-set-snd").checked = !!S.sound; $("wp-set-sens").value = S.sens;
  setEl.hidden = false; frozen = true; keys.clear(); paintPrompt();
}
function closeSet() { if (setEl.hidden) return; setEl.hidden = true; frozen = false; }
$("wp-set-btn").addEventListener("click", openSet);
$("wp-set-x").addEventListener("click", closeSet);
setEl.addEventListener("click", (e) => { if (e.target === setEl) closeSet(); });
$("wp-set-q").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-q]"); if (!b) return;
  S.quality = b.dataset.q; saveSet();
  setEl.querySelectorAll("#wp-set-q button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("wp-set-q-note").innerHTML = 'Applies after a reload. <button type="button" class="wp-link" id="wp-set-reload">Reload now</button>';
});
setEl.addEventListener("click", (e) => { if (e.target.id === "wp-set-reload") location.reload(); });
$("wp-set-snd").addEventListener("change", (e) => Snd.set(e.target.checked));
$("wp-set-sens").addEventListener("input", (e) => { S.sens = +e.target.value; saveSet(); });
$("wp-set-char").addEventListener("click", () => { closeSet(); openMake(); });
let resetArm = 0;
$("wp-set-reset").addEventListener("click", (e) => {
  if (Date.now() - resetArm > 3000) { resetArm = Date.now(); e.currentTarget.textContent = "Tap again to reset"; return; }
  try { localStorage.removeItem(SAVE); } catch { /* private */ } location.reload();
});

// ---------------- closing things ----------------
function closeAll() { closeSheet(); closeMap(); endFight(); closeSet(); }
if (coarse) $("wp-keys").hidden = true; else $("wp-acts").hidden = true;

// ---------------- the loop ----------------
const cam = st.camera;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), base = new THREE.Vector3();
let animState = "";
st.on((dt, t) => {
  step(dt);
  spins.forEach((f) => f(dt, t));
  moveScammers(t);
  planet.updateMatrixWorld(true);
  if (avatar) {
    avatar.obj.rotation.y = facing;
    if (avatar.bot) avatar.update(dt, t, Math.min(1, speedNow / 8), 0);
    else {
      avatar.update(dt, t);
      const want = !grounded ? (vy > 0 ? "jump" : "fall") : speedNow > 9 ? "sprint" : speedNow > 0.6 ? "walk" : "idle";
      // a one-shot (jump, emote, pick-up) plays out unless the player starts moving
      if (!avatar.busy() || (grounded && want !== "idle")) { if (want !== "jump") avatar.play(want, { speed: want === "walk" ? Math.max(0.8, speedNow / 6.5) : 1 }); animState = want; }
    }
  }
  for (let i = rockets.length - 1; i >= 0; i--) if (!rockets[i](dt)) rockets.splice(i, 1);
  const n = nearest();
  if ((n && n.g) !== (near && near.g)) { near = n; paintPrompt(); }
  scamCheck(dt);
  mixers.forEach((m) => m.update(dt));
  fadeLabels();
  pickCards();
  lockedCheck(dt);
  if ((miniT += dt) > 0.08) { miniT = 0; drawMini(); }
  // camera: behind and above the player, orbiting with camYaw / camPitch, a little wider when running
  base.set(0, 5.2 + camPitch * 6, 9.6).multiplyScalar(camDist).applyAxisAngle(Y, camYaw);
  camPos.copy(base).add(at); camPos.y += hop * 0.6;
  if (shake > 0) { shake = Math.max(0, shake - dt); camPos.x += (Math.random() - 0.5) * shake; camPos.y += (Math.random() - 0.5) * shake; }
  camLook.set(-Math.sin(camYaw) * 2.6, 1.4 + hop * 0.5, -Math.cos(camYaw) * 2.6).add(at);
  cam.position.lerp(camPos, 0.16); cam.lookAt(camLook);
  const fov = 55 + Math.min(1, speedNow / 12.5) * 7; if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = THREE.MathUtils.lerp(cam.fov, fov, 0.08); cam.updateProjectionMatrix(); }
});

// ---------------- start ----------------
await setAvatar(P.char || "male-a");
loadbar(1);
paintHud(); paintQuests(); refreshPurse(true); refreshCoins(true);
$("wp-loading").classList.add("done");
setTimeout(() => $("wp-loading").remove(), 600);
if (!P.char) openMake();
window.arcWorld = {
  P, planet, flyTo: (id) => { const g = shops.find((s) => s.userData.spec.id === id); if (g) flyTo(g); },
  near: () => near && (near.spec ? near.spec.id : near.coin ? "coin:" + near.coin.symbol : near.kind),
  coins: () => coinBuildings.length, rocket: launchRocket, state: () => ({ facing, camYaw, hop, grounded, anim: animState }),
};
