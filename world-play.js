// world-play.js — ARCIRCLE World (/play): walk the planet as a robot; every shop opens the real tool.
//
// How it moves: the robot stays at the top of the world and the planet turns under it (forward = a turn about X,
// steering = a turn about the robot's up axis), so shops, trees, scammers, the halo and the stars all ride on the
// planet. Shops open the real page inside the world (an iframe of the same site; the page hides its own chrome
// there — arc-nav.js "in-world"). Nothing is signed by the game itself: every transaction is the page's own,
// confirmed in the player's wallet.
//
// Progress (XP, visited shops, beaten scammers) lives in this browser for now (localStorage "arc.world").
// Game World is password-locked while it's being tested (world-lock.js); the Platform World stays open.
if (!window.arcWorldLock || !window.arcWorldLock.ok()) {
  document.getElementById("wp-loading").hidden = true;
  if (window.arcWorldLock) await window.arcWorldLock.ask({ cancelHref: "/?skip" });
  else { location.replace("/?skip"); await new Promise(() => {}); }
  document.getElementById("wp-loading").hidden = false;
}
const K = await import("./world-kit.js" + new URL(import.meta.url).search);
const { THREE, R } = K;
const $ = (id) => document.getElementById(id);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------- progress ----------------
const SAVE = "arc.world";
const P = (() => { const d = { xp: 0, visited: [], beaten: [], cards: [], intro: false }; try { return { ...d, ...JSON.parse(localStorage.getItem(SAVE) || "{}") }; } catch { return d; } })();
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private window */ } };
const level = () => 1 + Math.floor(P.xp / 100);
function gain(n, why) {
  const before = level(); P.xp += n; save(); paintHud();
  toast(`+${n} XP · ${why}` + (level() > before ? ` · Level ${level()}!` : ""));
}
function paintHud() {
  $("wp-lv").querySelector("b").textContent = "Lv " + level();
  $("wp-xpfill").style.width = (P.xp % 100) + "%";
  $("wp-lv").title = `${P.xp} XP`;
  $("wp-cards").querySelector("b").textContent = `${P.cards.length}/${K.CARDS.length}`;
  const next = K.SCAMMERS.find((s) => !P.beaten.includes(s.id));
  $("wp-stage").textContent = next ? `Stage ${next.stage} · ${next.name}` : `Stage ${K.SCAMMERS.length + 1} · coming soon`;
}
let toastT = 0;
function toast(msg) { const t = $("wp-toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }

// ---------------- the scene ----------------
const cv = $("wp-cv");
if (!K.webglOk()) {
  $("wp-loading").innerHTML = `<span>This browser can't draw the 3D world.</span><a class="wp-cta" href="/?skip">Go to the Platform World</a>`;
  throw new Error("no webgl");
}
try { await document.fonts.load("700 92px Sora"); } catch { /* system font */ }
const st = K.makeStage(cv, { fog: 0.009, bloom: 0.7, fov: 55, shadows: true });
st.scene.background = null;
const kitP = K.loadKit(new URL(import.meta.url).search).catch((e) => { console.warn("world models:", e); return null; });
const planet = K.makePlanet(); st.scene.add(planet);
planet.add(K.makeSky()); planet.add(K.makeHalo()); planet.add(K.makeStars()); planet.add(K.makePaths());
planet.children[0].receiveShadow = true;
const spins = [];
const shops = K.SHOPS.map((spec) => { const g = K.makeShop(spec); K.placeOn(g, K.dirOf(spec.theta, spec.phi)); planet.add(g); K.shadowy(g); spins.push(...g.userData.spin); return g; });
const portal = K.makePortal(); K.placeOn(portal, K.dirOf(K.PORTAL.theta, K.PORTAL.phi)); planet.add(portal); spins.push(...portal.userData.spin);
const scammers = K.SCAMMERS.filter((s) => !P.beaten.includes(s.id)).map((spec) => { const g = K.makeScammer(spec); planet.add(g); spins.push(...g.userData.spin); return g; });
const robot = K.shadowy(K.makeRobot(), true, false); robot.position.set(0, R, 0); robot.rotation.y = Math.PI; st.scene.add(robot); // it walks away from the camera
robot.userData.shadow.visible = !st.renderer.shadowMap.enabled;
const glowLight = new THREE.PointLight(0x35d8d0, 6, 7, 2); glowLight.position.set(0, R + 0.5, 0); st.scene.add(glowLight);
planet.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) { o.castShadow = false; } });

// ---- the kit models (Quaternius, CC0): props, enemy robots, key cards — added as soon as they arrive ----
const cards = [];
const mixers = [];
let labels = null; // the sign sprites, gathered on first use (fadeLabels)
const kit = await Promise.race([kitP, new Promise((r) => setTimeout(() => r(null), 12000))]);
function dressWorld(kit) {
  if (!kit) return;
  shops.forEach((g) => K.decorate(g, kit));
  // the Phisher wears the Eye Drone
  scammers.forEach((g) => {
    const e = K.enemy(kit, "EyeDrone"); if (!e) return;
    const u = g.userData; u.rig.children.forEach((c) => { if (!c.isSprite && c !== u.rig.children.find((x) => x.isSprite)) c.visible = false; });
    e.obj.scale.setScalar(0.62); e.obj.position.y = 1.5; u.rig.add(e.obj); u.enemy = e; e.play("Idle"); mixers.push(e.mixer);
    const sign = u.rig.children.find((c) => c.isSprite); if (sign) sign.position.set(0, 3.0, 0);
  });
  // the stages still to come wait on the planet, switched off
  [["QuadShell", 2, "The Fake Airdrop", 54, 140], ["Trilobite", 3, "The Honeypot", 56, 250]].forEach(([name, stage, title, th, ph]) => {
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
  paintHud();
  if (labels) labels.dirty = true;
}
const lockedStages = [];
if (kit) dressWorld(kit); else kitP.then((k) => k && dressWorld(k));
const cam = st.camera;
const camBase = new THREE.Vector3(0, R + 5.4, 9.2), lookBase = new THREE.Vector3(0, R + 1.3, -2.5);

// ---------------- input ----------------
const keys = new Set();
let joy = null, look = null, camYaw = 0, camPitch = 0, frozen = false, flying = null;
const typing = (e) => /input|textarea|select/i.test(e.target.tagName);
addEventListener("keydown", (e) => {
  if (typing(e)) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { closeAll(); return; }
  if (frozen) return;
  if (k === "e" || k === "enter") { if (near) { e.preventDefault(); enter(near); } return; }
  if (k === "m") { openMap(); return; }
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) { keys.add(k); e.preventDefault(); }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const joyEl = $("wp-joy"), knob = joyEl.querySelector("i");
cv.addEventListener("pointerdown", (e) => {
  if (frozen) return;
  cv.setPointerCapture(e.pointerId);
  const touch = e.pointerType !== "mouse";
  if (touch && e.clientX < innerWidth * 0.55 && !joy) {
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
    camYaw = THREE.MathUtils.clamp(camYaw - (e.clientX - look.x) * 0.006, -2.6, 2.6);
    camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - look.y) * 0.004, -0.35, 0.6);
    look.x = e.clientX; look.y = e.clientY;
  }
});
const lift = (e) => {
  if (joy && e.pointerId === joy.id) { joy = null; joyEl.classList.remove("on"); }
  if (look && e.pointerId === look.id) look = null;
};
cv.addEventListener("pointerup", lift); cv.addEventListener("pointercancel", lift);
cv.addEventListener("wheel", (e) => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.004, 0.7, 1.8); }, { passive: true });
let camDist = matchMedia("(pointer: coarse)").matches ? 1.15 : 1;

// ---------------- movement on the sphere ----------------
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), qa = new THREE.Quaternion(), prevQ = new THREE.Quaternion();
const robotAt = new THREE.Vector3(0, R, 0), tmp = new THREE.Vector3();
let speedNow = 0, turnNow = 0, near = null;
function inputs() {
  let f = 0, t = 0;
  if (keys.has("w") || keys.has("arrowup")) f += 1;
  if (keys.has("s") || keys.has("arrowdown")) f -= 1;
  if (keys.has("a") || keys.has("arrowleft")) t -= 1;
  if (keys.has("d") || keys.has("arrowright")) t += 1;
  if (joy) { f += -joy.dy; t += joy.dx * 0.9; }
  const run = keys.has("shift") || (joy && Math.hypot(joy.dx, joy.dy) > 0.92);
  return { f: THREE.MathUtils.clamp(f, -1, 1), t: THREE.MathUtils.clamp(t, -1, 1), run };
}
function blocked() {
  for (const g of [...shops, portal, ...lockedStages]) { g.getWorldPosition(tmp); if (tmp.distanceTo(robotAt) < g.userData.radius + 0.6) return true; }
  return false;
}
function step(dt) {
  if (frozen) { speedNow = THREE.MathUtils.lerp(speedNow, 0, 0.2); return; }
  if (flying) {
    const k = Math.min(1, (performance.now() - flying.t0) / flying.ms), e = 1 - Math.pow(1 - k, 3);
    planet.quaternion.slerpQuaternions(flying.from, flying.to, e);
    speedNow = 0.8 * (1 - k);
    if (k >= 1) flying = null;
    return;
  }
  const { f, t, run } = inputs();
  const sp = (run ? 11 : 6.5) * f;
  turnNow = THREE.MathUtils.lerp(turnNow, t, 0.25);
  if (Math.abs(turnNow) > 0.001) { qa.setFromAxisAngle(Y, turnNow * 2.3 * dt); planet.quaternion.premultiply(qa); }
  if (Math.abs(sp) > 0.01) {
    prevQ.copy(planet.quaternion);
    qa.setFromAxisAngle(X, (sp * dt) / R); planet.quaternion.premultiply(qa);
    planet.updateMatrixWorld(true);
    if (blocked()) planet.quaternion.copy(prevQ);
    camYaw *= 0.94; camPitch *= 0.94;
  }
  speedNow = THREE.MathUtils.lerp(speedNow, Math.min(1, Math.abs(sp) / 8), 0.15);
}
// fly to a shop: the robot lands on the path in front of its door (shops face the spawn point), facing it
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
  flying = { from: planet.quaternion.clone(), to, t0: performance.now(), ms: reduce ? 1 : 1400 };
  camYaw = 0; camPitch = 0;
}

// ---------------- what's in reach ----------------
function nearest() {
  let best = null, bd = Infinity;
  for (const g of shops) { g.getWorldPosition(tmp); const d = tmp.distanceTo(robotAt) - g.userData.radius; if (d < 2.8 && d < bd) { bd = d; best = { kind: "shop", g, spec: g.userData.spec }; } }
  portal.getWorldPosition(tmp); { const d = tmp.distanceTo(robotAt) - portal.userData.radius; if (d < 2.4 && d < bd) best = { kind: "portal", g: portal }; }
  return best;
}
function paintPrompt() {
  const p = $("wp-prompt");
  if (!near || frozen) { p.hidden = true; return; }
  p.hidden = false;
  $("wp-enter-t").innerHTML = near.kind === "portal" ? "Go to <b>Platform World</b>" : `Enter <b>${esc(near.spec.name)}</b>`;
}
$("wp-enter").addEventListener("click", () => near && enter(near));

// ---------------- shops ----------------
const sheet = $("wp-sheet"), frame = $("wp-frame");
function enter(n) {
  if (n.kind === "portal") { location.href = "/?skip"; return; }
  const s = n.spec;
  $("wp-sheet-h").textContent = s.name; $("wp-sheet-p").textContent = s.line;
  $("wp-sheet-full").href = s.url;
  $("wp-frame-load").hidden = false;
  frame.onload = () => { $("wp-frame-load").hidden = true; };
  if (frame.getAttribute("src") !== s.url) frame.src = s.url;
  else $("wp-frame-load").hidden = true;
  sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add("on"));
  frozen = true; keys.clear(); paintPrompt();
  if (n.g.userData.chestOpen) n.g.userData.chestOpen();
  openShop = n.g;
  if (!P.visited.includes(s.id)) { P.visited.push(s.id); gain(10, `found the ${s.name}`); }
  $("wp-sheet-x").focus({ preventScroll: true });
}
let openShop = null;
function closeSheet() {
  if (sheet.hidden) return;
  if (openShop && openShop.userData.chestClose) openShop.userData.chestClose();
  openShop = null;
  sheet.classList.remove("on"); setTimeout(() => { sheet.hidden = true; }, reduce ? 0 : 260);
  frozen = false; refreshPurse(true);
}
$("wp-sheet-x").addEventListener("click", closeSheet);
addEventListener("message", (e) => { if (e.origin === location.origin && e.data && e.data.arcWorld === "close") closeSheet(); });

// ---------------- map ----------------
const mapEl = $("wp-mapsheet");
function openMap() {
  $("wp-maplist").innerHTML = shops.map((g, i) => { const s = g.userData.spec; return `<li><button type="button" data-i="${i}"><i style="--c:#${s.color.toString(16).padStart(6, "0")}"></i><span><b>${esc(s.name)}</b><small>${esc(s.line)}</small></span>${P.visited.includes(s.id) ? '<em>visited</em>' : ""}</button></li>`; }).join("") +
    `<li><button type="button" data-i="portal"><i style="--c:#35d8d0"></i><span><b>Platform World</b><small>Back to the site as it is.</small></span></button></li>`;
  mapEl.hidden = false; frozen = true; keys.clear(); paintPrompt();
  const first = mapEl.querySelector("button[data-i]"); if (first) first.focus({ preventScroll: true });
}
function closeMap() { if (mapEl.hidden) return; mapEl.hidden = true; frozen = false; }
$("wp-map-btn").addEventListener("click", openMap);
$("wp-map-x").addEventListener("click", closeMap);
mapEl.addEventListener("click", (e) => {
  if (e.target === mapEl) { closeMap(); return; }
  const b = e.target.closest("button[data-i]"); if (!b) return;
  closeMap(); flyTo(b.dataset.i === "portal" ? portal : shops[+b.dataset.i]);
});

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
  fighting = g; frozen = true; keys.clear(); paintPrompt();
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
  const b = e.target.closest("button[data-i]"); if (!b || !fighting) return;
  const s = fighting.userData.spec, o = FIGHTS[s.id].opts[+b.dataset.i], out = $("wp-fight-out");
  out.hidden = false; out.className = "wp-fight-out " + (o.win ? "win" : "lose"); out.textContent = o.out;
  if (o.win) {
    $("wp-fight-opts").innerHTML = `<button type="button" class="wp-cta" data-done="1">Back to the planet</button>`;
    P.beaten.push(s.id); save();
    const g = fighting; if (g.userData.enemy) g.userData.enemy.play("Hit", { once: true });
    setTimeout(() => poof(g), 500); gain(50, `beat ${s.name}`);
    paintHud();
  } else { b.disabled = true; if (fighting.userData.enemy) fighting.userData.enemy.play(o.t.startsWith("Approve") ? "BackFlip" : "Look", { once: true }); }
});
fight.addEventListener("click", (e) => { if (e.target.closest("[data-done]")) endFight(); });
function endFight() { if (fight.hidden) return; fight.hidden = true; frozen = false; scamCool = 4; fighting = null; }
function poof(g) {
  const t0 = performance.now();
  const off = st.on(() => { const k = (performance.now() - t0) / 700; g.scale.setScalar(Math.max(0.001, 1 - k)); g.rotation.y += 0.3; if (k >= 1) { off(); planet.remove(g); scammers.splice(scammers.indexOf(g), 1); } });
}
function moveScammers(t) {
  scammers.forEach((g, i) => {
    const s = g.userData.spec;
    K.placeOn(g, K.dirOf(s.theta + Math.sin(t * 0.21 + i) * 4, s.phi + Math.sin(t * 0.13 + i * 2) * 14));
  });
}
function scamCheck(dt) {
  if (scamCool > 0) { scamCool -= dt; return; }
  if (frozen || flying) return;
  for (const g of scammers) { g.getWorldPosition(tmp); if (tmp.distanceTo(robotAt) < 2.6) { startFight(g); return; } }
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
    if (tmp.distanceTo(robotAt) < 1.9) {
      cards.splice(i, 1); P.cards.push(g.userData.id); save();
      const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 450; g.scale.setScalar(Math.max(0.001, 1 + k * 0.6 - k * k * 1.6)); g.position.multiplyScalar(1 + 0.004); if (k >= 1) { off(); planet.remove(g); } });
      gain(5, `key card ${P.cards.length}/${K.CARDS.length}`);
    }
  }
}
let lockCool = 0;
function lockedCheck(dt) {
  if (lockCool > 0) { lockCool -= dt; return; }
  for (const g of lockedStages) {
    g.getWorldPosition(tmp);
    if (tmp.distanceTo(robotAt) < g.userData.radius + 2.2) {
      const L = g.userData.locked, prev = K.SCAMMERS.find((x) => x.stage === L.stage - 1);
      toast(prev && !P.beaten.includes(prev.id) ? `Stage ${L.stage}, ${L.title}: beat ${prev.name} first` : `Stage ${L.stage}, ${L.title}: coming soon`);
      lockCool = 5; return;
    }
  }
}

// ---------------- wallet purse ----------------
const AC = window.arcConnect, CFG = window.CONFIG || {};
let purseAt = 0;
async function refreshPurse(force) {
  const a = AC && AC.address && AC.address();
  $("wp-wallet-t").textContent = a ? a.slice(0, 6) + "…" + a.slice(-4) : "Connect wallet";
  $("wp-wallet").classList.toggle("on", !!a);
  $("wp-purse").hidden = !a;
  if (!a || (!force && Date.now() - purseAt < 30000)) return;
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
    $("wp-usdc").textContent = f(n(m[0])); $("wp-arc").textContent = f(n(m[1]));
  } catch { /* keep the last numbers */ }
}
$("wp-wallet").addEventListener("click", () => { if (AC && !AC.address()) AC.connect().then(() => refreshPurse(true)).catch(() => {}); else if (AC) refreshPurse(true); });
if (AC && AC.on) AC.on(() => refreshPurse(true));
setInterval(() => refreshPurse(false), 30000);
refreshPurse(true);

// ---------------- closing things ----------------
function closeAll() { closeSheet(); closeMap(); endFight(); closeIntro(); }
function closeIntro() { const i = $("wp-intro"); if (i.hidden) return; i.hidden = true; frozen = false; P.intro = true; save(); }
$("wp-intro-go").addEventListener("click", closeIntro);
if (!P.intro) { $("wp-intro").hidden = false; frozen = true; setTimeout(() => $("wp-intro-go").focus({ preventScroll: true }), 50); }
if (matchMedia("(pointer: coarse)").matches) $("wp-keys").hidden = true;

// ---------------- the loop ----------------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
st.on((dt, t) => {
  step(dt);
  spins.forEach((f) => f(dt, t));
  moveScammers(t);
  planet.updateMatrixWorld(true);
  K.animateRobot(robot, dt, t, speedNow, turnNow);
  const n = nearest();
  if ((n && n.g) !== (near && near.g)) { near = n; paintPrompt(); }
  scamCheck(dt);
  mixers.forEach((m) => m.update(dt));
  fadeLabels();
  pickCards();
  lockedCheck(dt);
  // camera behind the robot, a little drag-to-look on top
  camPos.copy(camBase).sub(robotAt).multiplyScalar(camDist).applyAxisAngle(X, camPitch).applyAxisAngle(Y, camYaw).add(robotAt);
  camLook.copy(lookBase).sub(robotAt).applyAxisAngle(Y, camYaw).add(robotAt);
  cam.position.lerp(camPos, 0.18); cam.lookAt(camLook);
});
paintHud();
$("wp-loading").classList.add("done");
setTimeout(() => $("wp-loading").remove(), 600);
window.arcWorld = { P, flyTo: (id) => { const g = shops.find((s) => s.userData.spec.id === id); if (g) flyTo(g); }, near: () => near && (near.spec ? near.spec.id : near.kind), planet };
