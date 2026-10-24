// world-pumpking.js — the Halloween Pumpkin Kings in town (the owner's design, 2026-10-22; the rules and the clock:
// world-pumpking-data.js, the server: api/_world-halloween.mjs).
//   by day     five Pumpkin Kings (models/world/halloween/pumpkin-king.glb) stroll round their homes and dance: walk a
//              few metres, then a dance (Boom, Bubble, two Funny ones, a spin jump, a backflip kick), each on a 15 s
//              beat worked out from the clock, so every player sees a king in the same place doing the same thing. They
//              don't fight and can't be hit. Their tags say when they wake and how strong they'll be.
//   at night   20:00–05:00 US Eastern: each throws off its pumpkin in a burst of fire and rampages as Inferno Jack
//              (inferno-jack.glb), Lv 15 / 35 / 55 / 75 / 95, a boss of the town's combat (world-combat.js spawnExt):
//              it fights round its home (22 m) and lets you go past that. Its HP is everyone's: your hits are summed
//              and sent every 5 s (world-pk-hit), and it falls only when the server says so. The top 3 hitters share
//              its reward (ARCL and a +piece of gear; claimed here and put in the bag). A fallen king is a pumpkin again,
//              dancing, until the next night.
// Loaded by world-play.js while the event is on (or ?pk=day / ?pk=night to try it).
import { PK, HOMES, nightOf, dayOn, KING_NAME, JACK_NAME } from "./world-pumpking-data.js";

const BEAT = 15000, WALK = 0.32; // a beat: the first third walks to the next spot, the rest dances there
const DANCES = ["Boom_Dance", "Bubble_Dance", "FunnyDancing_01", "FunnyDancing_02", "_360_Power_Spin_Jump", "Backflip_Sweep_Kick"];
const KING_H = 3.0, JACK_H = 3.2, LEASH = 22, NEAR = 70, FAR = 120;
const PATS = { k15: ["slam"], k35: ["slam", "cone"], k55: ["slam", "cone", "line"], k75: ["slam", "cone", "line", "rain"], k95: ["slam", "cone", "line", "rain"] };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/// ctx: { THREE, K, planet, T, esc, toast, Snd?, ver, low, coarse, reduce, combat(), here(v), level(), sess(), post(b),
///        blocked(v), addItem(it), refresh(), parts?, shake?(n), inHub(), name?(it) }
export function createPumpKings(ctx) {
  const { THREE, K, planet, T, esc } = ctx, V3 = THREE.Vector3;
  const q = (() => { try { return new URLSearchParams(location.search).get("pk") || ""; } catch { return ""; } })();
  const isNight = (t = Date.now()) => (q === "night" ? true : q === "day" ? false : nightOf(t).on);
  const inTown = (t = Date.now()) => (q === "night" || q === "day" ? true : q === "0" ? false : dayOn(t));
  const root = new THREE.Group(); root.name = "pumpkings"; planet.add(root);
  const load = (u) => new Promise((res, rej) => K.gltfLoader().load(u + (ctx.ver || ""), res, undefined, rej));
  let srcK = null, srcJ = null, jP = null, view = null, viewAt = 0, polling = false, sentAt = 0, guestSaid = false, said = {};
  const pend = {}; // damage not yet sent, per king
  const me = new V3(), tmp = new V3(), tmp2 = new V3();

  // ---- homes: each king's spot, moved off anything solid (the same for every player: the town is the same) ----
  function freeNear(x, z) { for (let r = 0; r <= 14; r += 1.5) for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2, p = new V3(x + Math.cos(ang) * r, 0, z + Math.sin(ang) * r); if (Math.hypot(p.x, p.z) > 17 && !ctx.blocked(p)) return p; if (r === 0) break; } return new V3(x, 0, z); }
  const kings = PK.KINGS.map((k) => ({ id: k.id, lv: k.lv, max: k.hp, hp: k.hp, down: false, home: null, wp: new Map(), obj: null, mix: null, acts: {}, cur: "", tag: null, tagKey: "", m: null, jack: null, corpse: null, face: 0, pos: new V3() }));
  function spot(k, s) { // the beat's spot: within 2–9 m of home, or home when that's inside something
    let p = k.wp.get(s); if (p) return p;
    const h = hash(k.id + ":" + s), a = (h % 360) * Math.PI / 180, d = 2 + ((h >>> 9) % 70) / 10;
    p = new V3(k.home.x + Math.cos(a) * d, 0, k.home.z + Math.sin(a) * d); if (ctx.blocked(p) || Math.hypot(p.x, p.z) < 17) p = k.home.clone();
    k.wp.set(s, p); if (k.wp.size > 6) k.wp.delete(k.wp.keys().next().value); return p;
  }

  // ---- the bodies ----
  function rig(src, h, glow) {
    const o = K.skelClone(src.scene), box = new THREE.Box3().setFromObject(o), sz = box.max.y - box.min.y || 1, inner = new THREE.Group(); inner.add(o);
    o.scale.setScalar(h / sz); o.position.y = -box.min.y * (h / sz);
    o.traverse((x) => { if (!x.isMesh) return; x.castShadow = !ctx.low && !ctx.coarse; /* (no boss shadows on phones: the shadow pass drew five skinned bodies) */ x.receiveShadow = false; x.frustumCulled = false; x.material = x.material.clone(); if (glow && x.material.emissive) { x.material.emissive.setHex(glow); x.material.emissiveIntensity = 0.12; } });
    const mix = new THREE.AnimationMixer(o), acts = {}; for (const c of src.animations) acts[c.name] = mix.clipAction(c);
    return { obj: inner, mix, acts };
  }
  function playOn(b, name, { once = false, fade = 0.25, speed = 1 } = {}) {
    const a = b.acts[name]; if (!a) return;
    if (b.cur === name && !once) { a.timeScale = speed; return; }
    const prev = b.acts[b.cur]; a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed; a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false); b.cur = name; b.onceT = once ? a.getClip().duration / Math.max(0.1, speed) : 0;
  }
  function makeKing(k) {
    const b = rig(srcK, KING_H, 0); k.obj = b.obj; k.mix = b.mix; k.acts = b.acts; k.cur = ""; root.add(k.obj); paintTag(k);
  }
  function tagOf(k) {
    const night = isNight(), ni = nightOf(Date.now()), at = ni.next ? new Date(ni.next).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    if (k.down && night) return { t: "🎃 " + T(KING_NAME), sub: T("Defeated tonight · back tomorrow night") };
    return { t: "🎃 " + T(KING_NAME), sub: at ? T("Wakes at {t} · Lv {n}", { t: at, n: k.lv }) : T("Lv {n} at night", { n: k.lv }) };
  }
  function paintTag(k) {
    const g = tagOf(k), key = g.t + g.sub; if (k.tagKey === key && k.tag) return; k.tagKey = key;
    if (k.tag) { k.obj.remove(k.tag); k.tag.traverse((x) => { if (x.material) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } }); }
    k.tag = K.label(g.t, { accent: "#ff9a2a", color: "#fff2dc", size: 0.62, sub: g.sub }); k.tag.position.y = KING_H + 0.75; k.obj.add(k.tag);
  }

  // ---- by day (and a fallen king at night): the beat ----
  function dayTick(k, dt, now, near) {
    const s = Math.floor(now / BEAT + k.lv * 0.137), u = now / BEAT + k.lv * 0.137 - s, A = spot(k, s - 1), B = spot(k, s);
    const walking = u < WALK && A.distanceTo(B) > 0.4, p = k.pos;
    if (walking) { p.lerpVectors(A, B, u / WALK); const sp = A.distanceTo(B) / (WALK * BEAT / 1000); playOn(k, sp > 3 ? "Running" : "Walking", { speed: Math.max(0.8, sp / 1.3) }); k.face = Math.atan2(B.x - A.x, B.z - A.z); }
    else { p.copy(B); playOn(k, DANCES[hash(k.id + "|" + s) % DANCES.length], { fade: 0.4 }); // dancing: to you when you're close, else to the plaza
      const d = Math.hypot(me.x - p.x, me.z - p.z); k.face = d < 14 ? Math.atan2(me.x - p.x, me.z - p.z) : Math.atan2(-p.x, -p.z); }
    k.obj.position.copy(p); let dr = k.face - k.obj.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); k.obj.rotation.y += dr * Math.min(1, dt * 6);
    if (near) k.mix.update(dt); else if ((k.fc = (k.fc || 0) + 1) % 6 === 0) k.mix.update(dt * 6);
  }

  // ---- at night: Inferno Jack ----
  function jackEnt(k) {
    const b = rig(srcJ, 1, 0x8a2a06); // the combat scales it (its boss spec)
    const e = { obj: b.obj, mixer: b.mix, acts: b.acts, cur: "", keep: true, own: true, onceT: 0,
      play(name) { if (name === "Attack" && !(e.onceT > 0)) playOn(e, Math.random() < 0.22 ? "Wall_Push_Jump_and_Flip" : "Attack", { once: true, fade: 0.08 }); } }; // its walk and rest are set from how it moves (rampTick)
    playOn(e, "Idle_02", { fade: 0 }); return e;
  }
  function wake(k, fx) {
    if (k.m || k.down || !srcJ) return; const c = ctx.combat(); if (!c || !c.spawnExt) return;
    const e = jackEnt(k), at = k.pos.clone();
    const m = c.spawnExt({ ent: e, at, lv: k.lv, max: k.max, hp: k.hp, home: { x: k.home.x, z: k.home.z, r: LEASH }, pats: PATS[k.id], atkK: 1,
      boss: { name: T(JACK_NAME), scale: JACK_H, y: 0, tint: 0x8a2a06 }, // (its body is 1 m tall: the scale is its height)
      ext: { hit: (mm, dmg) => onHit(k, dmg), down: (mm) => fell(k, mm) } });
    if (!m) return; k.m = m; k.jack = e; k.lastP = at.clone(); k.obj.visible = false;
    if (fx) burst(at, true);
  }
  function sleep(k, fx) { // dawn, or the event's end: Jack goes, the pumpkin is back
    const c = ctx.combat(); if (k.m && c && c.extGone) c.extGone(k.m); if (k.m) { k.pos.copy(k.m.g.position).setY(0); k.m = null; }
    dropCorpse(k); k.jack = null; if (k.obj) k.obj.visible = true; if (fx) burst(k.pos, false);
  }
  function rampTick(k, dt) {
    const m = k.m, e = k.jack; if (!m || !e) return;
    k.pos.copy(m.g.position).setY(0);
    const sp = k.lastP ? Math.hypot(m.g.position.x - k.lastP.x, m.g.position.z - k.lastP.z) / Math.max(1e-3, dt) : 0; (k.lastP || (k.lastP = new V3())).copy(m.g.position);
    k.spS = (k.spS || 0) + (sp - (k.spS || 0)) * Math.min(1, dt * 8);
    if (e.onceT > 0) e.onceT -= dt;
    else if (k.spS > 3.2) playOn(e, "Running", { speed: Math.max(0.8, k.spS / 4.2) });
    else if (k.spS > 0.35) playOn(e, "Walking", { speed: Math.max(0.8, k.spS / 1.5) });
    else playOn(e, (Math.floor(performance.now() / 9000) + k.lv) % 3 === 0 ? "Idle_03" : "Idle_02", { fade: 0.35 });
    { const d = Math.hypot(me.x - k.pos.x, me.z - k.pos.z), every = d < 45 ? 1 : d < 90 ? 3 : 6; k.jf = (k.jf || 0) + 1; k.jdt = (k.jdt || 0) + dt; if (k.jf % every === 0 || e.onceT > 0) { e.mixer.update(k.jdt); k.jdt = 0; } } // (a far Jack's pose every few frames)
    if (ctx.parts && !ctx.low && !ctx.reduce && (k.emT = (k.emT || 0) - dt) <= 0 && Math.hypot(me.x - k.pos.x, me.z - k.pos.z) < 40) { k.emT = 0.18; ctx.parts.emit({ at: tmp.copy(k.pos).setY(JACK_H * 0.82), kind: "glow", n: 2, speed: 0.8, up: 2.2, spread: 0.4, size: 0.4, life: 0.8, grav: -3, color: 0xff7a1a, color2: 0xffd23a, jitter: 0.3 }); }
  }
  // its fall: the body is ours again, it plays its death where it stood, then the pumpkin dances there
  function fell(k, m) {
    const e = k.jack; k.down = true; k.hp = 0; k.m = null; if (!e) return;
    const wp = m.g.position.clone(); m.g.remove(e.obj); e.obj.position.copy(wp).setY(0); e.obj.rotation.y = m.g.rotation.y; e.obj.scale.setScalar(JACK_H); root.add(e.obj);
    playOn(e, "Fall_Dead_from_Abdominal_Injury", { once: true, fade: 0.1 }); k.corpse = { e, t0: performance.now() }; // (wall-clock: a slow frame rate mustn't keep the body lying there) k.pos.copy(wp).setY(0);
    ctx.toast(esc(T("{x} fell! The top 3 hitters share its reward.", { x: `${T(JACK_NAME)} Lv ${k.lv}` })));
    setTimeout(() => poll(true), 1500);
  }
  function dropCorpse(k) { if (!k.corpse) return; const o = k.corpse.e.obj; root.remove(o); o.traverse((x) => { if (x.isMesh && x.material) x.material.dispose(); }); k.corpse = null; }
  function corpseTick(k, dt) {
    const c = k.corpse; if (!c) return; c.e.mixer.update(dt);
    if (performance.now() - c.t0 > 3600) { dropCorpse(k); k.obj.visible = true; k.obj.position.copy(k.pos); burst(k.pos, false); paintTag(k); }
  }
  function burst(at, wakeUp) { // fire bursting out of the pumpkin (or a puff of orange smoke as it comes back)
    if (Math.hypot(me.x - at.x, me.z - at.z) > 60) return;
    if (ctx.parts) { ctx.parts.emit({ at: tmp2.copy(at).setY(2), kind: "glow", n: wakeUp ? 46 : 18, speed: wakeUp ? 7 : 3, up: 3, spread: 1, size: 0.6, life: 1, grav: -2, color: 0xff6a1a, color2: 0xffd23a, jitter: 0.5 });
      ctx.parts.emit({ at: tmp2.copy(at).setY(1), kind: "smoke", n: wakeUp ? 14 : 8, speed: 2, up: 1.4, size: 1.2, life: 1.2, grav: -1, color: 0x3a1a0a, jitter: 0.6 }); }
    if (wakeUp) { if (ctx.shake) ctx.shake(0.45); if (ctx.Snd && ctx.Snd.roar) ctx.Snd.roar(); }
  }

  // ---- the server: everyone's HP, your damage every 5 s, the top 3's rewards ----
  function onHit(k, dmg) {
    if (!ctx.sess()) { if (!guestSaid) { guestSaid = true; ctx.toast(esc(T("Sign in with a wallet so your hits on the Pumpkin Kings count"))); } return; }
    if (ctx.level() < k.lv - PK.LV_BELOW) { if (!said["lv" + k.id]) { said["lv" + k.id] = 1; ctx.toast(esc(T("This Pumpkin King is for level {n}+ — your hits won't count", { n: k.lv - PK.LV_BELOW }))); } return; }
    pend[k.id] = Math.min(PK.CAP_K * ctx.level() * 3, (pend[k.id] || 0) + dmg); // (the combat shows the hit at once; the server's HP comes back in a moment)
  }
  async function flush() {
    const s = ctx.sess(); if (!s || !isNight() || Date.now() - sentAt < PK.GAP * 1000 + 150) return;
    const id = Object.keys(pend).filter((x) => pend[x] > 0).sort((a, b) => pend[b] - pend[a])[0]; if (!id) return;
    const n = Math.round(pend[id]); pend[id] = 0; sentAt = Date.now();
    try { const r = await ctx.post({ action: "world-pk-hit", ...s, king: id, dmg: n }); if (r && r.ok && r.j && r.j.kings) apply(r.j); else if (r && r.status === 429) pend[id] = (pend[id] || 0) + n; else if (r && r.status === 403) said["lv" + id] = 1; }
    catch { pend[id] = (pend[id] || 0) + n; }
  }
  async function poll(force) {
    if (polling) return; const near = kings.some((k) => k.home && Math.hypot(me.x - k.pos.x, me.z - k.pos.z) < NEAR), gap = isNight() && near ? 5000 : 30000;
    if (!force && Date.now() - viewAt < gap) return; polling = true; viewAt = Date.now();
    try { const s = ctx.sess(); const r = await fetch("/api/social?world=pk" + (s ? "&wallet=" + s.wallet : ""), { cache: "no-store" }); if (r.ok) apply(await r.json()); } catch { /* the next time */ } finally { polling = false; }
  }
  function apply(j) {
    view = j;
    for (const s of j.kings || []) { const k = kings.find((x) => x.id === s.id); if (!k) continue;
      k.max = s.max; k.hp = s.hp; k.top = s.top || [];
      const c = ctx.combat(); if (k.m && c) { if (s.down) c.extDown(k.m); else c.extSet(k.m, Math.max(1, s.hp - (pend[k.id] || 0))); } // (less what you hit but haven't sent yet)
      if (s.down && !k.down && !k.m) { k.down = true; if (k.obj) paintTag(k); }
      if (!s.down && k.down && !k.corpse && !k.testDown) { k.down = false; if (k.obj) paintTag(k); } }
    for (const w of j.wins || []) if (!w.claimed && !said["win" + w.king + w.night]) { said["win" + w.king + w.night] = 1; claim(w); }
  }
  const GOT = "arc.pk.got", got = () => { try { return JSON.parse(localStorage.getItem(GOT) || "[]"); } catch { return []; } };
  async function claim(w) {
    const s = ctx.sess(); if (!s) return;
    try { const r = await ctx.post({ action: "world-pk-claim", ...s, king: w.king, night: w.night }); const j = r && r.j;
      if (!r || !r.ok || !j || !j.item) { if (r && r.j && r.j.error) ctx.toast(esc(r.j.error)); said["win" + w.king + w.night] = 0; return; }
      const ids = got(); if (!ids.includes(j.item.id)) { try { ctx.addItem(j.item); } catch { /* the card still shows */ } ids.push(j.item.id); try { localStorage.setItem(GOT, JSON.stringify(ids.slice(-40))); } catch { /* this visit */ } }
      if (j.credited > 0 && ctx.refresh) ctx.refresh(); winCard(w.king, j);
    } catch { said["win" + w.king + w.night] = 0; }
  }
  // the reward card: your place, the ARCL and the piece (its rarity's colour)
  const RC = ["#b8c2cc", "#5fe08a", "#4fa8ff", "#b48cff", "#ffc861"], RN = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  function winCard(kid, j) {
    const k = kings.find((x) => x.id === kid), el = document.createElement("div"); el.className = "wpk-win"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", "");
    const nm = ctx.name ? ctx.name(j.item) : "", place = ["🥇", "🥈", "🥉"][j.rank - 1] || "🎃";
    el.innerHTML = `<div class="wpk-card" style="--rc:${RC[j.item.r] || "#ffc861"}"><small>🎃 ${esc(T("HALLOWEEN · PUMPKIN KING"))}</small><h3>${place} ${esc(T("Place {n} against {x}", { n: j.rank, x: `${T(JACK_NAME)} Lv ${k ? k.lv : ""}` }))}</h3>
      <div class="wpk-gain"><b>+${Number(j.arcl || 0).toLocaleString("en-US")}</b><span>ARCL</span></div>
      <div class="wpk-item"><i></i><span><b>${esc(nm)}</b><small>${esc(T(RN[j.item.r] || ""))} · +${j.item.p} · Lv ${j.item.lv}</small></span></div>
      <p>${esc(T("It's in your bag."))}</p><button type="button" data-x>${esc(T("Great!"))}</button></div>`;
    document.body.appendChild(el); el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-x]")) el.remove(); });
    if (ctx.Snd && ctx.Snd.coin) ctx.Snd.coin();
  }

  // ---- each frame ----
  let started = false, wasNight = null, warned = "";
  async function start() {
    if (started) return; started = true;
    try { srcK = await load("/models/world/halloween/pumpkin-king.glb"); } catch (e) { console.warn("pumpkin king", e); started = false; return; }
    for (const k of kings) { const h = HOMES[k.id]; k.home = freeNear(h[0], h[1]); k.pos.copy(k.home); makeKing(k); }
    warm(kings.map((k) => k.obj)); poll(true);
  }
  // compile their shaders while nobody sees them (the first night's wake-up froze phones for half a second)
  function warm(list) { try { if (ctx.compile) ctx.compile(list.filter(Boolean)); } catch { /* compiled on the first draw */ } }
  const jackSoon = () => { if (srcJ || jP) return; jP = load("/models/world/halloween/inferno-jack.glb").then((g) => { srcJ = g; warm([rig(srcJ, 1, 0x8a2a06).obj]); }).catch((e) => { console.warn("inferno jack", e); jP = null; }); };
  function tick(dt, t) {
    if (!inTown()) { if (started) for (const k of kings) { if (k.m) sleep(k, false); if (k.obj) k.obj.visible = false; } return; }
    if (!started) { start(); return; } if (!srcK || !kings[0].obj) return;
    ctx.here(me); const now = Date.now(), night = isNight(now), ni = nightOf(now);
    if (night || (ni.next && ni.next - now < 20 * 60e3)) jackSoon();
    if (!night && ni.next && ni.next - now < 5 * 60e3 && warned !== String(ni.next)) { warned = String(ni.next); ctx.toast(esc(T("🎃 The Pumpkin Kings wake in 5 minutes — and rampage!"))); }
    if (wasNight !== null && night !== wasNight) { for (const k of kings) paintTag(k); if (night && kings.some((k) => Math.hypot(me.x - k.pos.x, me.z - k.pos.z) < 140)) ctx.toast(esc(T("🔥 The Pumpkin Kings awaken! Inferno Jack rampages until 05:00 US Eastern."))); }
    wasNight = night;
    const hub = ctx.inHub(), ready = q === "night" || !!(view && view.night && view.night.on && view.night.id === ni.id); // tonight's HP read first (a king already down tonight doesn't wake)
    for (const k of kings) {
      const d = Math.hypot(me.x - k.pos.x, me.z - k.pos.z), near = d < NEAR;
      if (k.corpse) { corpseTick(k, dt); continue; }
      if (night && !k.down && hub && srcJ && ready) { if (!k.m || (ctx.combat() && !ctx.combat().mobsRaw().includes(k.m))) { k.m = null; wake(k, d < 60); } rampTick(k, dt); continue; }
      if (k.m && (!night || !hub)) sleep(k, night && d < 60);
      k.obj.visible = d < (ctx.low ? 80 : FAR); if (!k.obj.visible) continue;
      dayTick(k, dt, now, near);
    }
    if (night) { flush(); poll(false); } else if (now - viewAt > 120000) poll(true);
  }
  return {
    tick, root,
    /// keep their homes clear: hide the scattered trees and rocks (instanced) within 12 m of each (the same for everyone)
    clear(group) {
      const m = new THREE.Matrix4(), v = new V3(), zero = new THREE.Matrix4().makeScale(0, 0, 0), H = Object.values(HOMES); planet.updateMatrixWorld(true);
      group.traverse((o) => { if (!o.isInstancedMesh) return; let n = 0;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld).sub(planet.position); if (H.some(([x, z]) => Math.hypot(v.x - x, v.z - z) < 12)) { o.setMatrixAt(i, zero); n++; } }
        if (n) o.instanceMatrix.needsUpdate = true; });
    },
    /// for the minimap and the world map: where each king (or Jack) is now
    marks: () => (started ? kings.filter((k) => k.home).map((k) => ({ g: k.m ? k.m.g : k.obj, lv: k.lv, rage: !!k.m, down: k.down })) : []),
    on: () => inTown(), night: () => isNight(),
    /// tests: the state of each king, its running clip
    debug: () => kings.map((k) => ({ id: k.id, lv: k.lv, x: +k.pos.x.toFixed(1), z: +k.pos.z.toFixed(1), jack: !!k.m, down: k.down, hp: k.hp, clip: k.m && k.jack ? k.jack.cur : k.cur, vis: !!(k.obj && k.obj.visible), corpse: !!k.corpse, d: Math.round(Math.hypot(me.x - k.pos.x, me.z - k.pos.z)), par: !!(k.obj && k.obj.parent) })),
    view: () => view,
    /// tests: king i falls now (as when the server says so) · the reward card
    testFell: (i) => { const k = kings[i], c = ctx.combat(); if (k && k.m && c) { k.testDown = true; c.extDown(k.m); } },
    testWin: () => winCard("k95", { rank: 1, arcl: 30000, item: { id: "pktest", b: "weapon-4", r: 4, lv: 95, p: 5, u: "jack" } }),
  };
}
