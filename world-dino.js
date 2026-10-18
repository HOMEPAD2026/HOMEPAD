// world-dino.js — DINO SOULMATE in Jurassic World (world-jurassic.js hands it the land, the raptor's rig and the hunt):
// the wild eggs at the nests (a light over each one that's out), picking one up, the 72-hour care in the Hatchery, the
// hatch, and the one companion an account raises — following you, guarding you, hunting with you, growing up.
// What decides is the server's (api/_world-dino.mjs, the rules in world-dino-engine.js): the eggs, who got one, each
// day's care window, the death of a neglected egg, the hatch, the companion's level and bond, its share of a hunt.
// Here: the drawing, the companion's moves and bites (its share of a hunt's swings is the server's; its bites here
// take HP off the bar you see), the panel, the reminders.
//
// H: { THREE, K, T, esc, toast, ctx, scene, cam, height, rig(gl, LEN), model(), me() → { x, z, face, down }, camYaw(),
//      foes() (the dinosaurs), sel(), working() (what you're hitting), hurtFoe(o, dmg), pop(o, html, cls), root, camps(),
//      homeCamp() → { x, z } | null, setView(v), clock() }
import { DINO, eggState, eggVitals, statsOf, stageOf, xpNeed, daysWith, genesOf, nextEggs } from "./world-dino-engine.js";

const STAGE_N = ["Hatchling", "Juvenile", "Young", "Adult", "Awakened"];
const RAR = { common: { c: 0x5ff0d0, css: "#5ff0d0", n: "Common" }, rare: { c: 0x4da6ff, css: "#4da6ff", n: "Rare" }, epic: { c: 0xb46cff, css: "#b46cff", n: "Epic" }, legend: { c: 0xffc23c, css: "#ffc23c", n: "Legendary" } };
// each species' clips (its file's names, lowercased: raptor Roar_Original · Attack_Bite · Attack_Claw; trike Charge · Attack_Horn)
const CLIP = { raptor: { a: "attack_bite", b: "attack_claw", roar: "roar", n: "Velociraptor" }, trike: { a: "attack_horn", b: "attack_horn", roar: "charge", n: "Triceratops" } };
const SKILL_CD = { bite: 2, dash: 8, roar: 20, fang: 45 };
const SK_N = { bite: "Bite", dash: "Dash", roar: "Roar", fang: "Infinity Fang" };
const SK_IC = { bite: "🦷", dash: "💨", roar: "🔊", fang: "♾️" };
const CMDS = [["follow", "🐾", "Follow"], ["guard", "🛡️", "Guard"], ["attack", "⚔️", "Attack"], ["stay", "✋", "Stay"]];
const SAVE = "arc.dino";
const SIDE = 1.15; // where it walks: at your right, a little ahead (behind you the camera would only see your back)
const SKILLS = [["🦷", "Bite", 0], ["💨", "Dash", 2], ["🔊", "Roar", 3], ["♾️", "Infinity Fang", 4]];
const LW = { ko: {}, zh: {}, tr: {} }; // (filled at the end of the file)

export function createDino(H) {
  const { THREE, esc, toast, ctx } = H, L0 = LW[ctx.lang] || {};
  const T = (s, v) => { const x = L0[s]; return x != null ? x.replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "")) : H.T(s, v); };
  const Snd = ctx.Snd || {}; const snd = (k, ...a) => { try { if (Snd[k]) Snd[k](...a); } catch { /* silent */ } };
  const fmt = (n) => Math.round(n || 0).toLocaleString("en-US");
  const dur = (ms) => { ms = Math.max(0, ms); const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4); return h ? T("{h}h {m}m", { h, m }) : T("{m}m", { m: Math.max(1, m) }); };
  const signed = () => !!(ctx.sess && ctx.sess());
  let pref = { mode: "follow", out: true }; try { pref = { ...pref, ...JSON.parse(localStorage.getItem(SAVE) || "{}") }; } catch { /* defaults */ }
  const savePref = () => { try { localStorage.setItem(SAVE, JSON.stringify(pref)); } catch { /* this visit */ } };
  let riding = false, D = null, off = 0, nests = [], ui = null, B = null, tab = "egg", warned = {}, nextNests = 0, nextState = 0, busy = false;
  const now = () => Date.now() + off; // (the server's clock, as last heard)

  // ---------------- the server ----------------
  async function api(action, extra = {}) {
    const s = ctx.sess && ctx.sess(); if (!s) return { ok: false, j: { error: T("Sign in with a wallet to raise a dinosaur") } };
    try { return await ctx.post({ action, ...s, ...extra }); } catch { return { ok: false, j: { error: "network" } }; }
  }
  function took(j) { if (!j) return; if (j.now) off = j.now - Date.now(); if (j.egg !== undefined || j.buddy !== undefined) { const prev = D; D = { ...(D || {}), ...j }; afterState(prev); } if (j.inv && H.setInv) H.setInv(j.inv); }
  async function loadNests() { try { const r = await fetch("/api/social?world=dino-nests", { cache: "no-store" }); if (r.ok) { const j = await r.json(); nests = j.eggs || []; if (j.now) off = j.now - Date.now(); syncEggs(); } } catch { /* the next look */ } }
  async function loadState() {
    const s = ctx.sess && ctx.sess(); if (!s) { D = null; afterState(null); return; }
    try { const r = await fetch("/api/social?world=dino&wallet=" + encodeURIComponent(String(s.wallet).toLowerCase()), { cache: "no-store" }); if (r.ok) { const prev = D; D = await r.json(); if (D.now) off = D.now - Date.now(); afterState(prev); } } catch { /* the next look */ }
  }
  async function load() { await Promise.all([loadNests(), loadState()]); }
  function afterState(prev) {
    try { localStorage.setItem("arc.dino.egg", D && D.egg ? "1" : ""); } catch { /* fine */ }
    if (prev && prev.egg && D && !D.egg && !D.buddy && D.lost) toast(`🥀 <b>${esc(T("Your egg didn't make it."))}</b> ${esc(T("A day's care was missed. You can look for a new egg."))}`);
    ensureBuddy(); syncEggs(); paint();
    if (D && D.first && !D.egg && !D.buddy && !warned.first) { warned.first = 1; toast(`🥚 <b>${esc(T("Your first egg is waiting by the gate!"))}</b> ${esc(T("Follow the golden light — only you can see it."))}`); }
  }
  const errOf = (r) => esc(T(String((r && r.j && r.j.error) || "network").replace(/^network$/, "Network trouble — try again")));

  // ---------------- the eggs out in the nests (and your first one, by the gate) ----------------
  // An egg's rarity shows before anyone picks it up (its colour, its light, its tag): the rest of its genes when it hatches.
  const eggObjs = new Map(); let EG = null;
  const rarOf = (e) => (e.first ? "common" : genesOf(e.nest + "_" + e.slot).rarity);
  /// the eggs to draw: the nests' (unclaimed, still out) and your first egg if it's waiting for you
  const allEggs = () => [...nests.filter((e) => e.to > now()), ...(D && D.first && !D.egg && !D.buddy ? [{ nest: "first", x: D.first.x, z: D.first.z, to: 9e15, first: true }] : [])];
  function eggParts() {
    if (EG) return EG; const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#dfe9e4"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 70; i++) { g.fillStyle = ["#2a6a7a", "#3b8b9a", "#7a5a3a"][i % 3]; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 5, 1.5 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    EG = { tex, egg: new THREE.SphereGeometry(0.42, 22, 16), nest: new THREE.TorusGeometry(0.85, 0.24, 8, 22), nestM: new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 1 }),
      beam: new THREE.CylinderGeometry(0.55, 0.55, 34, 16, 1, true), shell: new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats: {} };
    return EG;
  }
  /// an egg's and its light's materials by rarity
  function eggMats(rar) {
    const P = eggParts(); if (P.mats[rar]) return P.mats[rar]; const R = RAR[rar] || RAR.common, col = new THREE.Color(R.c);
    return (P.mats[rar] = { egg: new THREE.MeshStandardMaterial({ map: P.tex, color: new THREE.Color(0xffffff).lerp(col, 0.45), roughness: 0.5, emissive: col, emissiveIntensity: rar === "legend" ? 0.8 : 0.5 }),
      beam: new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }) });
  }
  function eggMesh(rar) { const P = eggParts(), M = eggMats(rar), m = new THREE.Mesh(P.egg, M.egg); m.scale.set(1.5, 1.95, 1.5); m.castShadow = true; return m; }
  function syncEggs() {
    if (!H.scene) return; const P = eggParts(), list = allEggs(), live = new Set(list.map((e) => e.nest));
    for (const [id, o] of eggObjs) if (!live.has(id)) { H.scene.remove(o.g); eggObjs.delete(id); }
    for (const e of list) { if (eggObjs.has(e.nest)) continue;
      const rar = rarOf(e), M = eggMats(rar), g = new THREE.Group(), nest = new THREE.Mesh(P.nest, P.nestM), egg = eggMesh(rar), beam = new THREE.Mesh(P.beam, M.beam);
      nest.rotation.x = -Math.PI / 2; nest.position.y = 0.14; egg.position.y = 0.85; nest.scale.setScalar(1.4); beam.position.y = 17;
      g.add(nest, egg, beam); if (H.K && H.K.label) { const tag = H.K.label(e.first ? T("Your first egg") : T("{r} egg", { r: T(RAR[rar].n) }), { accent: e.first ? "#ffe066" : RAR[rar].css, size: 0.6, sub: e.first ? T("Only you can see it") : "" }); tag.position.y = 2.8; g.add(tag); }
      g.position.set(e.x, H.height(e.x, e.z), e.z); H.scene.add(g); eggObjs.set(e.nest, { g, egg, beam, e }); }
  }
  async function pickUp(e) {
    if (busy) return; if (!signed()) { toast(esc(T("Sign in with a wallet to raise a dinosaur"))); return; }
    busy = true; const r = await api("world-dino-claim", { nest: e.nest }); busy = false;
    if (!r.ok) { toast(errOf(r)); snd("bad"); if (r.status === 409 || r.status === 404) load(); return; }
    nests = nests.filter((x) => x.nest !== e.nest); took(r.j); syncEggs(); snd("level");
    const rar = D && D.egg && D.egg.rarity;
    toast(`🥚 <b>${esc(rar && rar !== "common" ? T("You found a {r} egg!", { r: T(RAR[rar].n) }) : T("You found a rare egg!"))}</b> ${esc(T("Care for it today, then every day for three days."))}`); openPanel("egg");
  }

  // ---------------- the companion in the world ----------------
  const stageNow = () => (D && D.buddy ? stageOf(D.buddy, now()) : 0);
  const owner = () => { const s = ctx.stats ? ctx.stats() : null, v = ctx.vitals ? ctx.vitals() : null; return { atk: (s && s.atk) || 0, def: (s && s.def) || 0, hp: (v && v.max) || (s && s.hp) || 120 }; };
  const statsNow = () => (D && D.buddy ? statsOf(D.buddy, owner()) : { atk: 0, def: 0, hp: 1 });
  const genesNow = () => (D && D.buddy && D.buddy.genes) || genesOf("b_" + ((D && D.buddy && (D.buddy.found || D.buddy.hatched)) || 0));
  const spNow = () => (genesNow().species === "trike" ? "trike" : "raptor");
  const clip = (k) => CLIP[spNow()][k];
  /// its roar (a long clip in the file: played quicker, and it stands still for 2 s at most)
  const roar = () => { if (B && B.R.once(clip("roar"), 1.4)) B.R.oneLeft = Math.min(B.R.oneLeft, 2.2); };
  /// its colours: the egg's palette, a glow for the rarer ones (and the awakened)
  function dress(R, G, k) {
    const pal = (DINO.PALS.find((x) => x.id === G.pal) || DINO.PALS[0]).c, rc = RAR[G.rarity] || RAR.common, glow = { common: 0, rare: 0.08, epic: 0.16, legend: 0.26 }[G.rarity] + (k === 4 ? 0.2 : 0);
    R.g.traverse((m) => { if (m.isMesh && m.material) { m.material = m.material.clone(); if (m.material.color) m.material.color.multiply(new THREE.Color(pal)); if (glow > 0) { m.material.emissive = new THREE.Color(rc.c); m.material.emissiveIntensity = glow; } m.castShadow = true; } });
  }
  /// a picture of it (the real model, drawn once into an image for the panel); null until it can be drawn
  const thumbs = {};
  function thumb(G = genesNow(), k = stageNow(), sp = G.species === "trike" ? "trike" : "raptor") {
    const key = sp + G.pal + G.rarity + k; if (key in thumbs) return thumbs[key]; thumbs[key] = null;
    try {
      const r = H.renderer && H.renderer(), gl = H.model && H.model(sp); if (!r || !gl) return null;
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x3a4a5a, 2.4)); const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(4, 6, 5); sc.add(dl);
      const R = H.rig(gl, 4); dress(R, G, k); R.loop("idle"); R.mixer.update(0.6); sc.add(R.g); R.g.rotation.y = -0.75;
      const h = R.h || 2, cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(4.6, h * 0.95, 6.2); cam.lookAt(0, h * 0.45, 0);
      const S = 256, rt = new THREE.WebGLRenderTarget(S, S); rt.texture.colorSpace = THREE.SRGBColorSpace;
      const prev = r.getRenderTarget(), cc = new THREE.Color(), ca = r.getClearAlpha(); r.getClearColor(cc);
      r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam); const buf = new Uint8Array(S * S * 4); r.readRenderTargetPixels(rt, 0, 0, S, S, buf);
      r.setRenderTarget(prev); r.setClearColor(cc, ca); rt.dispose();
      const c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d"), img = g.createImageData(S, S);
      for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
      g.putImageData(img, 0, 0); return (thumbs[key] = c.toDataURL("image/png"));
    } catch (e) { console.warn("dino thumb", e); return null; }
  }
  const pic = (cls = "") => { const u = thumb(); return u ? `<img class="wz-dpic ${cls}" src="${u}" alt="">` : `<span class="wz-dpic ${cls}">${spNow() === "trike" ? "🦕" : "🦖"}</span>`; };
  function ensureBuddy() {
    const want = !!(D && D.buddy && pref.out && H.model && H.model(spNow()));
    if (!want) { if (B) { H.scene.remove(B.g); B = null; } return; }
    const k = stageNow(), G = genesNow(), sig = k + G.species + G.pal; if (B && B.sig === sig) { B.tag && setTag(); return; } if (B) H.scene.remove(B.g);
    const rc = RAR[G.rarity] || RAR.common, R = H.rig(H.model(spNow()), 4.6 * DINO.STAGES[k].size * (G.size || 1)); dress(R, G, k);
    // a soft ring at its feet, so it can be found among the ferns and at night
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: rc.c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.scale.setScalar(Math.max(0.9, (R.L || 2.5) * 0.42)); R.g.add(ring);
    const me = H.me(), st = statsNow();
    B = { R, g: R.g, ring, stage: k, sig, x: me.x + Math.sin(me.face + SIDE) * 2.8, z: me.z + Math.cos(me.face + SIDE) * 2.8, face: me.face, sp: 0, hp: st.hp, max: st.hp, cool: { bite: 0, dash: 0, roar: 0, ult: 0 }, alt: false, downUntil: 0, tg: null, hits: [], dashT: 0, force: null };
    H.scene.add(B.g); R.loop("idle"); setTag();
  }
  function setTag() { if (!B || !H.K || !H.K.label) return; if (B.tag) B.g.remove(B.tag); const b = D.buddy; B.tag = H.K.label(b.name, { accent: "#5ff0d0", size: 0.55, sub: `Lv ${b.lv} · ${T(STAGE_N[stageNow()])}` }); B.tag.position.y = (B.R.h || 1.5) + 0.8; B.g.add(B.tag); }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const isFoe = (o) => o && o.alive !== undefined && o.kind && ["raptor", "trike", "alpha", "spino", "titan", "claw"].includes(o.kind);
  function steer(tx, tz, dt, turn = 7) { const a = Math.atan2(tx - B.x, tz - B.z); let da = a - B.face; da = Math.atan2(Math.sin(da), Math.cos(da)); B.face += da * Math.min(1, dt * turn); }
  function hurtFoe(o, k, label) { const st = statsNow(), dmg = Math.max(1, Math.round(st.atk * k * (0.85 + Math.random() * 0.3))); H.hurtFoe(o, dmg, label ? "dmg buddy big" : "dmg buddy"); if (Math.random() < 0.35) o.vsBuddyUntil = H.clock() + 4; snd("bite"); }
  function pickTarget(me, clock) {
    if (pref.mode === "stay") { const f = H.foes().find((o) => o.alive && dist(o, B) < (o.hr || 1.5) + 2.5); return f || null; }
    const sel = H.sel(), work = H.working();
    if (pref.mode === "attack" && sel && sel.alive && dist(sel, me) < 45) return sel;
    if (isFoe(work) && work.alive) return work;
    if (sel && sel.alive && dist(sel, me) < 16 && (sel.angry > clock || sel.state === "chase")) return sel;
    const r = pref.mode === "guard" ? 14 : 9; return H.foes().find((o) => o.alive && o.state === "chase" && dist(o, me) < r) || null;
  }
  function tickBuddy(dt, t) {
    if (!B) return; const me = H.me(), clock = H.clock(), st = statsNow(), R = B.R; B.max = st.hp;
    if (B.downUntil) {
      const home = H.homeCamp(); if (Date.now() > B.downUntil || (home && Math.hypot(me.x - home.x, me.z - home.z) < 10)) { B.downUntil = 0; B.hp = B.max; R.revive(); B.x = me.x + Math.sin(me.face + SIDE) * 2.8; B.z = me.z + Math.cos(me.face + SIDE) * 2.8; toast(esc(T("{name} is back on its feet!", { name: D.buddy.name }))); snd("pick"); }
      else { R.step(dt); R.mixer.update(dt); return; }
    }
    // ridden (an adult or older): it goes where you go, at your pace; it doesn't fight while you ride
    if (riding) {
      if (B.stage < DINO.RIDE_STAGE) riding = false;
      else { const sp = me.speed || 0; B.x = me.x; B.z = me.z; B.face = me.face; B.tg = null; B.hp = Math.min(B.max, B.hp + B.max * 0.02 * dt);
        if (!R.one) R.loop(sp > 9 ? "run" : sp > 0.6 ? "walk" : "idle", sp > 9 ? Math.max(0.8, sp / 14) : sp > 0.6 ? Math.max(0.6, sp / 6) : 1);
        R.step(dt); R.mixer.update(dt); B.g.position.set(B.x, H.height(B.x, B.z), B.z); B.g.rotation.y = B.face; return; }
    }
    // a step back to you if it strays (15 m in a fight unless told to attack; 45 m: it runs to your side)
    if (dist(B, me) > 45) { const a = me.face + SIDE; B.x = me.x + Math.sin(a) * 2.8; B.z = me.z + Math.cos(a) * 2.8; B.tg = null; }
    let tg = pickTarget(me, clock); if (tg && pref.mode !== "attack" && dist(B, me) > 15 && dist(tg, me) > 12) tg = null;
    // a skill you called (the card's button): its target first, and it goes off as soon as it can
    const F = B.force && B.force.o && B.force.o.alive && t < B.force.until ? B.force : (B.force = null); if (F) tg = F.o; B.tg = tg;
    let want = 0;
    if (tg) {
      const reach = (tg.hr || 1.5) + 1.0, d = dist(B, tg);
      if (d > reach) { steer(tg.x, tg.z, dt, 8); want = d > 5 ? 11 : 6;
        if (B.stage >= 2 && t > B.cool.dash && ((d > 4 && d < 12) || (F && F.k === "dash" && d > 2))) { if (F && F.k === "dash") B.force = null; B.cool.dash = t + 8; B.dashT = 0.35; H.pop(B, T("DASH!"), "buddy-sk"); } }
      else { steer(tg.x, tg.z, dt, 10);
        if ((t > B.cool.bite || (F && F.k === "bite")) && !R.one) { if (F && F.k === "bite") B.force = null; B.cool.bite = t + 2; B.alt = !B.alt; R.once(B.alt ? clip("b") : clip("a"), 1.2); B.hits.push({ at: t + 0.32, o: tg, k: B.dashHit ? 1.6 : 1 }); B.dashHit = false; } }
      // the roar (adults): what's near turns on it instead of you
      if (B.stage >= 3 && t > B.cool.roar && ((F && F.k === "roar") || (owner().hp && ctx.vitals && ctx.vitals() && ctx.vitals().hp < ctx.vitals().max * 0.5) || H.foes().filter((o) => o.alive && o.state === "chase" && dist(o, me) < 14).length >= 2)) {
        if (F && F.k === "roar") B.force = null; B.cool.roar = t + 20; roar(); snd("growl", 0); H.pop(B, T("ROAR!"), "buddy-sk"); for (const o of H.foes()) if (o.alive && dist(o, B) < 12) o.vsBuddyUntil = clock + 6; }
      // the awakened's combo: three quick strikes
      if (B.stage >= 4 && t > B.cool.ult && d < reach + 0.5 && (F ? F.k === "fang" : true)) { if (F && F.k === "fang") B.force = null; B.cool.ult = t + 45; H.pop(B, T("INFINITY FANG!"), "buddy-sk"); for (let i = 0; i < 3; i++) B.hits.push({ at: t + 0.3 + i * 0.25, o: tg, k: 1.4, big: true }); }
    } else if (pref.mode !== "stay") {
      const a = me.face + SIDE, gx = me.x + Math.sin(a) * 2.8, gz = me.z + Math.cos(a) * 2.8, d = Math.hypot(gx - B.x, gz - B.z);
      if (d > 1.2) { steer(gx, gz, dt, 6); want = d > 8 ? 11 : d > 3 ? 6.5 : 2.6; } else { let da = me.face - B.face; da = Math.atan2(Math.sin(da), Math.cos(da)); B.face += da * Math.min(1, dt * 3); }
      B.hp = Math.min(B.max, B.hp + B.max * 0.04 * dt); // (out of a fight it heals)
    }
    if (B.dashT > 0) { B.dashT -= dt; want = 18; if (B.dashT <= 0) B.dashHit = true; }
    for (let i = B.hits.length - 1; i >= 0; i--) { const h = B.hits[i]; if (t < h.at) continue; B.hits.splice(i, 1); if (h.o && h.o.alive && dist(B, h.o) < (h.o.hr || 1.5) + 2.6) hurtFoe(h.o, h.k, h.big); }
    if (R.one && /roar|hit|charge/i.test(R.one.getClip().name)) { want = 0; B.sp = 0; } // (it stands still to roar or flinch)
    B.sp += (want - B.sp) * Math.min(1, dt * 5);
    if (B.sp > 0.05) { B.x += Math.sin(B.face) * B.sp * dt; B.z += Math.cos(B.face) * B.sp * dt; }
    if (!R.one) R.loop(B.sp > 7 ? "run" : B.sp > 0.4 ? "walk" : "idle", B.sp > 7 ? Math.max(0.8, B.sp / 10) : B.sp > 0.4 ? Math.max(0.6, B.sp / 4) : 1);
    R.step(dt); R.mixer.update(dt); B.g.position.set(B.x, H.height(B.x, B.z), B.z); B.g.rotation.y = B.face;
  }
  /// riding (an adult or older): on its back, faster across the plains
  const canRide = () => !!(B && !B.downUntil && B.stage >= DINO.RIDE_STAGE);
  function ride(on = !riding) {
    if (on && !canRide()) { toast(esc(T(B ? "You can ride it once it's an Adult (Lv {l}, {d} days)" : "Call your companion out first", { l: DINO.STAGES[DINO.RIDE_STAGE].lv, d: DINO.STAGES[DINO.RIDE_STAGE].days }))); snd("bad"); return false; }
    riding = !!on; snd(riding ? "growl" : "tap", 0); if (riding && B) { const me = H.me(); B.x = me.x; B.z = me.z; B.face = me.face; H.pop(B, T("Let's go!"), "buddy-sk"); } paintCard(); return riding;
  }
  /// the best skill it has now, and how long until it's ready: { k, left, max }
  function skillNow() { const k = B ? B.stage : stageNow(), id = k >= 4 ? "fang" : k >= 3 ? "roar" : k >= 2 ? "dash" : "bite", c = B ? B.cool[id === "fang" ? "ult" : id] || 0 : 0, t = H.clock(); return { k: id, left: Math.max(0, c - t), max: SKILL_CD[id] }; }
  /// the card's skill button: on what you're fighting (or the nearest one hunting you), as soon as it can
  function useSkill() {
    if (!B || B.downUntil) { toast(esc(T(B ? "It's down — give it a moment" : "Call your companion out first"))); return; }
    const me = H.me(), sel = H.sel(), sk = skillNow(); if (sk.left > 0.2) { toast(esc(T("{s} is ready in {n} s", { s: T(SK_N[sk.k]), n: Math.ceil(sk.left) }))); snd("bad"); return; }
    const o = (sel && sel.alive && dist(sel, me) < 25 && sel) || B.tg || H.foes().filter((f) => f.alive && dist(f, me) < 20).sort((a, b) => dist(a, me) - dist(b, me))[0];
    if (!o) { toast(esc(T("Nothing to fight nearby"))); return; }
    B.force = { k: sk.k, o, until: H.clock() + 5 }; snd("tap"); H.pop(B, T(SK_N[sk.k]) + "!", "buddy-sk");
  }
  /// a dinosaur's bite that lands on the companion (world-jurassic.js asks: near(o) first)
  function near(o) { return !!(B && !B.downUntil && Math.hypot(B.x - o.x, B.z - o.z) < (o.biteR || 3) + 1.5); }
  function hurt(share) {
    if (!B || B.downUntil) return; const n = Math.max(1, Math.round(B.max * share * (1 - Math.min(0.6, statsNow().def / 2000)))); B.hp -= n; H.pop(B, "-" + fmt(n), "dmg hurt"); B.R.once("hit", 1.3);
    if (B.hp <= 0) { B.hp = 0; riding = false; B.downUntil = Date.now() + DINO.DOWN_MS; B.R.die(); B.tg = null; snd("ko"); toast(`🦖 ${esc(T("{name} is down — back in 60 s, or at once at your camp.", { name: D.buddy.name }))}`); }
    paintCard();
  }
  const out = () => !!(B && !B.downUntil && D && D.buddy && dist(B, H.me()) < 25);

  // ---------------- the panel: the Hatchery, your companion, the codex ----------------
  function build() {
    const root = H.root, top = root.querySelector(".wz-top"), pk = root.querySelector(".wz-packbtn");
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "wz-dinobtn"; btn.innerHTML = `<span aria-hidden="true">🥚</span><b>${esc(T("Hatchery"))}</b>`; top.insertBefore(btn, pk);
    const el = document.createElement("div"); el.innerHTML = `<div class="wz-dino wz-pack" hidden role="dialog"><div class="wz-pack-in"></div></div>
      <div class="wz-buddy" hidden><div class="wz-bud-h"><b class="nm"></b><small class="lv"></small></div><i class="wz-bud-hp"><u></u></i><button type="button" class="wz-bud-ride" data-ride hidden>🐎 <b>${esc(T("Ride"))}</b></button><button type="button" class="wz-bud-sk" data-skill><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" class="bg"/><circle cx="20" cy="20" r="18" class="fg" stroke-dasharray="113.1" stroke-dashoffset="0"/></svg><span></span><small></small></button><div class="wz-bud-c">${CMDS.map(([k, ic, n]) => `<button type="button" data-cmd="${k}" title="${esc(T(n))}"><span>${ic}</span><small>${esc(T(n))}</small></button>`).join("")}</div></div>
      <button type="button" class="wz-eggpick" hidden><kbd>E</kbd>🥚 <b>${esc(T("Pick up the egg"))}</b></button>
      <div class="wz-hatched" hidden role="status"></div>
      <div class="wz-eggchip" hidden><i>➤</i><span></span></div>
      <div class="wz-budres" hidden aria-live="polite"></div>`;
    while (el.firstChild) root.appendChild(el.firstChild);
    const q = (s) => root.querySelector(s);
    ui = { btn, panel: q(".wz-dino"), body: q(".wz-dino .wz-pack-in"), card: q(".wz-buddy"), pick: q(".wz-eggpick"), chip: q(".wz-eggchip"), born: q(".wz-hatched"), res: q(".wz-budres"), sk: q(".wz-bud-sk") };
    ui.born.addEventListener("click", () => { ui.born.hidden = true; });
    btn.addEventListener("click", () => (ui.panel.hidden ? openPanel() : closePanel()));
    ui.panel.addEventListener("click", onPanel); ui.card.addEventListener("click", (e) => { const b = e.target.closest("[data-cmd]"); if (b) command(b.dataset.cmd); else if (e.target.closest("[data-skill]")) useSkill(); else if (e.target.closest("[data-ride]")) ride(); });
    ui.pick.addEventListener("click", () => { if (ui.pickE) pickUp(ui.pickE); });
    ui.panel.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-name]")) hatch(); });
  }
  function openPanel(t) { if (!ui) return; if (t) tab = t; else tab = D && D.buddy ? "buddy" : "egg"; ui.panel.hidden = false; paintPanel(); snd("open"); load().then(paintPanel); }
  function closePanel() { if (ui) ui.panel.hidden = true; snd("close"); }
  function paint() {
    if (!ui) return; const b = D && D.buddy;
    ui.btn.innerHTML = b ? `<span aria-hidden="true">🦖</span><b>${esc(b.name)}</b>` : `<span aria-hidden="true">🥚</span><b>${esc(T("Hatchery"))}</b>`;
    const st = D && D.egg && D.egg.state; ui.btn.classList.toggle("due", !!(st && st.open)); ui.btn.classList.toggle("ready", !!(st && st.stage === "READY"));
    paintCard(); if (!ui.panel.hidden) paintPanel();
  }
  function paintCard() {
    if (!ui) return; const b = D && D.buddy; ui.card.hidden = !b; if (!b) return;
    ui.card.querySelector(".nm").textContent = b.name; ui.card.querySelector(".lv").textContent = `Lv ${b.lv} · ${T(STAGE_N[stageNow()])}${!pref.out ? " · " + T("resting") : B && B.downUntil ? " · " + T("down") : ""}`;
    const k = B ? Math.max(0, B.hp / Math.max(1, B.max)) : 1; ui.card.querySelector(".wz-bud-hp u").style.width = (k * 100).toFixed(1) + "%"; ui.card.classList.toggle("downed", !!(B && B.downUntil));
    ui.card.querySelectorAll("[data-cmd]").forEach((x) => x.classList.toggle("on", x.dataset.cmd === pref.mode));
    const rb = ui.card.querySelector("[data-ride]"); rb.hidden = !(B && B.stage >= DINO.RIDE_STAGE); rb.classList.toggle("on", riding); rb.querySelector("b").textContent = T(riding ? "Get off" : "Ride");
    paintSkill();
  }
  function paintSkill() {
    if (!ui || ui.card.hidden) return; const sk = skillNow(), k = sk.left / sk.max;
    ui.sk.querySelector("span").textContent = SK_IC[sk.k]; ui.sk.querySelector("small").textContent = sk.left > 0.2 ? Math.ceil(sk.left) + "s" : T(SK_N[sk.k]);
    ui.sk.querySelector(".fg").setAttribute("stroke-dashoffset", (113.1 * Math.min(1, k)).toFixed(1)); ui.sk.classList.toggle("ready", sk.left <= 0.2);
  }
  /// after a hunt it helped with: what it did (the swings it saved you, its experience)
  function result(b0, b1, kind, saved) {
    if (!ui || !b1) return; let xp = 0; if (b0) { if (b1.lv > b0.lv) { xp = xpNeed(b0.lv) - b0.xp + b1.xp; for (let l = b0.lv + 1; l < b1.lv; l++) xp += xpNeed(l); } else xp = b1.xp - b0.xp; }
    const parts = []; if (saved > 0) parts.push(T("{n} swings saved", { n: saved })); if (xp > 0) parts.push("XP +" + fmt(xp)); if (b0 && b1.bond > b0.bond) parts.push(T("bond") + " +" + (b1.bond - b0.bond));
    if (!parts.length) return;
    ui.res.innerHTML = `<i aria-hidden="true">${spNow() === "trike" ? "🦕" : "🦖"}</i><div><b>${esc(T("{name} helped!", { name: b1.name }))}</b><small>${esc(parts.join(" · "))}</small></div>`;
    ui.res.hidden = false; ui.res.classList.remove("go"); void ui.res.offsetWidth; ui.res.classList.add("go"); clearTimeout(ui.resT); ui.resT = setTimeout(() => { if (ui) ui.res.hidden = true; }, 3600);
  }
  function command(k) { pref.mode = k; savePref(); snd("tap"); paintCard(); if (B) H.pop(B, T({ follow: "Following!", guard: "On guard!", attack: "Attack!", stay: "Staying." }[k]), "buddy-sk"); }
  const bar = (n, v, max, cls = "") => `<div class="wz-dbar ${cls}"><span>${esc(n)}</span><i><u style="width:${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%"></u></i><b>${typeof v === "number" && !Number.isInteger(v) ? v.toFixed(1) : fmt(v)}${max === 100 ? "" : ""}</b></div>`;
  function ring(k, label, sub) { const r = 54, c = 2 * Math.PI * r; return `<div class="wz-ring"><svg viewBox="0 0 128 128"><circle cx="64" cy="64" r="${r}" class="bg"/><circle cx="64" cy="64" r="${r}" class="fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.max(0, Math.min(1, k)))).toFixed(1)}"/></svg><div><b>${label}</b><small>${sub}</small></div></div>`; }
  function eggHtml() {
    const e = D && D.egg, t = now();
    if (!e && D && D.buddy) return `<div class="wz-dnone"><div class="wz-dbig">${pic()}</div><b>${esc(T("{name} is your companion", { name: D.buddy.name }))}</b><p>${esc(T("One companion per account, for good. The eggs out on the plains are for new tamers."))}</p></div>`;
    if (!e) {
      const mem = (D && D.memorial) || [];
      return `<div class="wz-dnone"><div class="wz-dbig">🥚</div><b>${esc(T("No egg yet"))}</b><p>${esc(T("Rare eggs appear at the nests on the plains — look for a light in the sky. The first to reach one gets it; you can raise one egg at a time."))}</p><p class="wz-dnote">${esc(T("Eggs out right now: {n}", { n: nests.filter((x) => x.to > t).length }))}</p>${!signed() ? `<p class="wz-dnote warn">${esc(T("Sign in with a wallet to raise a dinosaur"))}</p>` : ""}</div>
        ${D && D.first ? `<p class="wz-dwarn gold">🥚 ${esc(T("Your first egg is waiting by the gate — only you can see it."))}</p>` : ""}
        ${D && D.buddy ? "" : forecast(t)}${mem.length ? `<h4>${esc(T("In memory"))}</h4><ul class="wz-dmem">${mem.slice().reverse().map((m) => `<li>🥀 ${esc(T("An egg found {d} — lost on day {n}", { d: new Date(m.found).toLocaleDateString(), n: m.day }))}</li>`).join("")}</ul>` : ""}`;
    }
    const s = e.state || eggState(e, t), v = eggVitals(e, t), k = (t - e.found) / DINO.HATCH, day = Math.min(3, s.day);
    let head = "", warn = "";
    if (s.stage === "READY") head = T("It's moving! Ready to hatch");
    else if (s.stage === "WAIT") head = T("All three days done — it hatches in {t}", { t: dur(s.hatchAt - t) });
    else if (!s.open) head = T("Day {d} of 3 — the next care opens in {t}", { d: day, t: dur(s.opensAt - t) });
    else { head = T("Day {d} of 3 — care for it now", { d: day }); const left = s.closesAt - t; warn = left < 3600e3 ? `<p class="wz-dwarn red">⚠️ ${esc(T("Less than an hour left today — it dies if its care is missed!"))}</p>` : left < 4 * 3600e3 ? `<p class="wz-dwarn">⏰ ${esc(T("Today's care closes in {t}", { t: dur(left) }))}</p>` : `<p class="wz-dnote">${esc(T("Today's care closes in {t}", { t: dur(left) }))}</p>`; }
    const c = s.cares || {}, can = s.open && /^D/.test(s.stage);
    const care = (k2, ic, n, cost) => `<button type="button" class="wz-dcare${c[k2] ? " done" : ""}" data-care="${k2}" ${!can || c[k2] ? "disabled" : ""}><span>${c[k2] ? "✓" : ic}</span><b>${esc(T(n))}</b><small>${esc(cost)}</small></button>`;
    const nDone = (e.done || []).length, dayBar = `<div class="wz-dday"><b>${esc(s.stage === "READY" || s.stage === "WAIT" ? T("Hatching") : T("Day {d}", { d: day }))}</b><i><u style="width:${((nDone / 3) * 100).toFixed(0)}%"></u></i><small>${nDone} / 3</small></div>`;
    return `${dayBar}${ring(k, s.stage === "READY" ? "🐣" : `${Math.min(72, Math.floor((t - e.found) / 36e5))}h`, "/ 72h")}<p class="wz-dhead">${esc(head)}</p>${warn}
      <div class="wz-dsteps">${[1, 2, 3].map((d) => `<i class="${(e.done || []).length >= d ? "on" : d === s.day ? "now" : ""}">${(e.done || []).length >= d ? "✓" : d}</i>`).join("<b></b>")}<i class="${s.stage === "READY" ? "now" : ""}">🐣</i></div>
      <div class="wz-dvit">${bar(T("Temperature") + " °C", v.temp, 40, v.temp >= 35 && v.temp <= 38 ? "ok" : "low")}${bar(T("Water"), v.water, 100)}${bar(T("Food"), v.food, 100)}${bar(T("Health"), v.health, 100, v.health < 50 ? "low" : "ok")}</div>
      ${s.stage === "READY" ? `<div class="wz-dhatch"><input data-name maxlength="14" placeholder="${esc(T("Name your companion"))}"><button type="button" class="go" data-a="hatch">🐣 ${esc(T("Hatch"))}</button></div>` : `<div class="wz-dcares">${care("warm", "🔥", "Warm", "🪵×2")}${care("water", "💧", "Water", T("free"))}${care("feed", "🍖", "Feed", T("treat · meat · 2 berries"))}</div>`}
      <p class="wz-dnote">${esc(T("Treats: {n}", { n: (D && D.treats) || 0 }))} · ${esc(T("Miss a day's window and the egg is lost."))}</p>${notifyBtn()}`;
  }
  /// the next eggs from the schedule (anyone could work it out: it's the same for everyone) — where and when
  function forecast(t) {
    const me = H.me(), live = nests.filter((x) => x.to > t), nx = [...live.map((e) => ({ ...e, from: t - 1 })), ...nextEggs(t, 12, 4).filter((e) => !live.some((l) => l.nest === e.nest && l.to === e.to))].slice(0, 4);
    return `<h4>${esc(T("Egg forecast"))}</h4><ul class="wz-dfore">${nx.map((e) => `<li class="${e.from <= t ? "now" : ""}"><b>${esc(T("Nest {n}", { n: Number(e.nest.slice(1)) + 1 }))}</b><small>${fmt(Math.hypot(e.x - me.x, e.z - me.z))} m</small><em>${esc(e.from <= t ? T("out now") : T("in {t}", { t: dur(e.from - t) }))}</em></li>`).join("")}</ul>
      <p class="wz-dnote">${esc(T("Each egg stays out 10 minutes. The arrow at the top points to the nearest one."))}</p>${notifyBtn()}`;
  }
  /// reminders while the site is open in another tab (the browser's notifications; not when it's closed)
  const canNotify = () => typeof Notification !== "undefined";
  function notifyBtn() { if (!canNotify()) return ""; const on = Notification.permission === "granted"; return `<button type="button" class="wz-dout" data-a="notify" ${on ? "disabled" : ""}>${on ? "🔔 " + esc(T("Reminders are on")) : "🔔 " + esc(T("Remind me (while the site is open)"))}</button>`; }
  function notify(title, body) {
    try { if (!canNotify() || Notification.permission !== "granted" || !document.hidden) return; const o = { body, icon: "/images/brand/apple-touch-icon-v2.png", tag: "arc-dino" };
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then((r) => (r ? r.showNotification(title, o) : new Notification(title, o))).catch(() => {}); else new Notification(title, o); } catch { /* not this browser */ }
  }
  function buddyHtml() {
    const b = D && D.buddy; if (!b) return `<div class="wz-dnone"><div class="wz-dbig">🦖</div><b>${esc(T("No companion yet"))}</b><p>${esc(T("Find an egg and care for it for three days. Only one companion, ever — it grows with you."))}</p></div>`;
    const t = now(), k = stageOf(b, t), st = statsNow(), next = DINO.STAGES[k + 1];
    const G = genesNow(), pc = "#" + ((DINO.PALS.find((x) => x.id === G.pal) || DINO.PALS[0]).c).toString(16).padStart(6, "0");
    return `<div class="wz-dbud"><div class="wz-dav s${k} r-${G.rarity}">${pic()}</div><div><input class="wz-dname" data-rename value="${esc(b.name)}" maxlength="14"><small>${esc(T(STAGE_N[k]))} · Lv ${b.lv}${b.lv >= Math.min(DINO.LV_MAX, (ctx.level ? ctx.level() : 1) + DINO.LV_OVER) ? " · " + esc(T("max for your level")) : ""}</small></div></div>
      <div class="wz-dgenes"><span>${esc(T(CLIP[spNow()].n))}</span><span><i style="background:${pc}"></i>${esc(T(cap(G.pal)))}</span><span>👁 ${esc(T(cap(G.eye)))}</span><span class="r-${G.rarity}">${esc(T(RAR[G.rarity].n))}</span></div>
      ${bar("XP", b.xp, xpNeed(b.lv))}${bar(T("Bond"), b.bond, 100, "bond")}
      <div class="wz-dstats"><span>⚔️ <b>${fmt(st.atk)}</b><small>${esc(T("Attack"))}</small></span><span>🛡️ <b>${fmt(st.def)}</b><small>${esc(T("Defence"))}</small></span><span>❤️ <b>${fmt(st.hp)}</b><small>HP</small></span><span>📅 <b>${daysWith(b, t)}</b><small>${esc(T("days"))}</small></span><span>🦴 <b>${fmt(b.hunts || 0)}</b><small>${esc(T("hunts"))}</small></span></div>
      <h4>${esc(T("Skills"))}</h4><div class="wz-dskills">${SKILLS.map(([ic, n, at]) => `<span class="${k >= at ? "on" : ""}"><i>${ic}</i><b>${esc(T(n))}</b><small>${k >= at ? esc(T("Ready")) : esc(T("From {s}", { s: T(STAGE_N[at]) }))}</small></span>`).join("")}</div>
      ${next ? `<p class="wz-dnote">${esc(T("Next: {s} at Lv {l} and {d} days together", { s: T(STAGE_N[k + 1]), l: next.lv, d: next.days }))}</p>` : `<p class="wz-dnote gold">${esc(T("Fully awakened."))}</p>`}
      <div class="wz-dacts"><button type="button" data-op="feed">🍖 <b>${esc(T("Feed"))}</b><small>+${DINO.BOND.feed} ${esc(T("bond"))}</small></button><button type="button" data-op="pet">✋ <b>${esc(T("Pet"))}</b><small>+${DINO.BOND.pet}</small></button><button type="button" data-op="rest" ${H.homeCamp() && Math.hypot(H.me().x - H.homeCamp().x, H.me().z - H.homeCamp().z) < 12 ? "" : "disabled"}>🏕️ <b>${esc(T("Rest"))}</b><small>${esc(T("at your camp"))}</small></button><button type="button" data-a="look">👀 <b>${esc(T("Look"))}</b></button></div>
      <div class="wz-dcmd">${CMDS.map(([c, ic, n]) => `<button type="button" data-cmd="${c}" class="${pref.mode === c ? "on" : ""}">${ic} ${esc(T(n))}</button>`).join("")}</div>
      ${missionsHtml()}
      <button type="button" class="wz-dout" data-a="out">${pref.out ? "💤 " + esc(T("Let it rest (hide)")) : "🦖 " + esc(T("Call it out"))}</button>
      <p class="wz-dnote">${esc(T("Bond: feeding +5, 10 hunts together +5, a boss +8, a pat +2, a rest +3 — up to 15 a day."))}</p>`;
  }
  const MIS_N = { hunt: "Hunt together {n} times", pet: "Pat it {n} times", rest: "Rest at your camp", battle: "Fight {n} Dino Battles" };
  function missionsHtml() {
    const ms = (D && D.missions) || []; if (!ms.length) return "";
    const rw = (m) => [m.xp ? "XP +" + m.xp : "", m.bond ? T("bond") + " +" + m.bond : "", m.treat ? "🍬 +" + m.treat : ""].filter(Boolean).join(" · ");
    return `<h4>${esc(T("Today's missions"))}</h4><ul class="wz-dmis">${ms.map((m) => `<li class="${m.got ? "got" : m.done ? "done" : ""}"><div><b>${esc(T(MIS_N[m.id] || m.id, { n: m.n }))}</b><i><u style="width:${((m.have / m.n) * 100).toFixed(0)}%"></u></i></div>${m.got ? `<span class="ok">✓</span>` : m.done ? `<button type="button" data-mission="${m.id}">${esc(T("Collect"))}</button>` : `<small>${m.have}/${m.n}<br>${esc(rw(m))}</small>`}</li>`).join("")}</ul>`;
  }
  async function claimMission(id) {
    if (busy) return; busy = true; const r = await api("world-dino-mission", { id }); busy = false;
    if (!r.ok) { toast(errOf(r)); snd("bad"); return; } const lv0 = D && D.buddy ? D.buddy.lv : 0; took(r.j); snd("coin"); toast(`✅ <b>${esc(T("Mission done!"))}</b>`); if (D.buddy && D.buddy.lv > lv0) levelUp();
  }
  // ---------------- Dino Battles: your companion against another player's (theirs plays itself) ----------------
  let ladder = null, fightT = null, lastFight = null;
  function battleHtml() {
    const b = D && D.buddy; if (!b) return `<div class="wz-dnone"><div class="wz-dbig">⚔️</div><b>${esc(T("No companion yet"))}</b><p>${esc(T("Hatch a companion to enter Dino Battles."))}</p></div>`;
    const bt = D.battles || { left: DINO.BATTLES_DAY, rating: DINO.RATING0, w: 0, l: 0 };
    return `<div class="wz-dbrow"><span><b>${fmt(bt.rating)}</b><small>${esc(T("Rating"))}</small></span><span><b>${bt.w}–${bt.l}</b><small>${esc(T("Won–lost"))}</small></span><span><b>${bt.left}</b><small>${esc(T("left today"))}</small></span></div>
      <div class="wz-dfight">${lastFight ? fightHtml(lastFight, lastFight.step ?? lastFight.log.length) : `<p class="wz-dnote">${esc(T("Your companion fights another player's on its own: its level, bond and stage decide. Win or lose, it learns (XP +{x}).", { x: DINO.BATTLE_XP }))}</p>`}</div>
      <button type="button" class="wz-dout go" data-a="fight" ${bt.left > 0 ? "" : "disabled"}>⚔️ ${esc(bt.left > 0 ? T("Find an opponent") : T("That's today's battles"))}</button>
      <h4>${esc(T("Top companions"))}</h4><ol class="wz-dladder">${ladder ? ladder.slice(0, 10).map((x, i) => `<li><em>${i + 1}</em><b>${esc(x.name)}</b><small>Lv ${x.lv} · ${esc(T(STAGE_N[x.stage] || ""))}</small><span>${fmt(x.rating)}</span></li>`).join("") || `<li>${esc(T("No one yet — be the first."))}</li>` : `<li>…</li>`}</ol>
      <p class="wz-dnote">${esc(T("Battles give experience and bond, never ARCL. Five a day."))}</p>`;
  }
  const MOVE_N = { bite: "Bite", claw: "Claw", dash: "Dash", roar: "Roar", fang: "Infinity Fang" };
  function fightHtml(f, step) {
    const L = f.log, cur = L[Math.min(L.length, step) - 1], hp = cur ? cur.hp : [f.me.stats.hp, f.foe.stats.hp], done = step >= L.length;
    const side = (x, h, i) => { const pc = "#" + ((DINO.PALS.find((p) => p.id === x.pal) || DINO.PALS[0]).c).toString(16).padStart(6, "0"); const u = i === 0 ? thumb() : thumb({ species: x.species, pal: x.pal, rarity: x.rarity || "common" }, x.stage || 0);
      return `<div class="wz-dfs ${cur && cur.s === i ? "hit" : ""}"><div class="wz-dav" style="--c:${pc}">${u ? `<img class="wz-dpic" src="${u}" alt="">` : x.species === "trike" ? "🦕" : "🦖"}</div><b>${esc(x.name)}</b><small>Lv ${x.lv || ""}${x.wild ? " · " + esc(T("wild")) : ""}</small><i><u style="width:${((h / x.stats.hp) * 100).toFixed(1)}%"></u></i></div>`; };
    return `<div class="wz-dvs">${side({ ...f.me, lv: D.buddy.lv }, hp[0], 0)}<em>VS</em>${side(f.foe, hp[1], 1)}</div>
      <p class="wz-dmove">${cur ? esc(T("{a} used {m}!", { a: cur.s === 0 ? f.me.name : f.foe.name, m: T(MOVE_N[cur.m]) })) + (cur.d ? ` <b>−${fmt(cur.d)}</b>` : "") : "…"}</p>
      ${done ? `<p class="wz-dres ${f.win ? "win" : "lose"}">${esc(f.win ? T("Victory!") : T("Defeat"))} · ${esc(T("Rating"))} ${fmt(f.rating)}</p>` : ""}`;
  }
  async function loadLadder() { try { const r = await fetch("/api/social?world=dino-ladder", { cache: "no-store" }); if (r.ok) { ladder = (await r.json()).top || []; if (tab === "battle") paintPanel(); } } catch { /* next time */ } }
  async function fight() {
    if (busy) return; busy = true; const r = await api("world-dino-battle"); busy = false;
    if (!r.ok) { toast(errOf(r)); snd("bad"); return; } took(r.j); lastFight = { ...r.j.fight, step: 0 }; snd("growl", 0); clearInterval(fightT);
    fightT = setInterval(() => { if (!lastFight) return clearInterval(fightT); lastFight.step++; const cur = lastFight.log[lastFight.step - 1];
      if (cur && B && cur.s === 0 && !B.R.one) { if (cur.m === "roar") roar(); else B.R.once(cur.m === "claw" ? clip("b") : clip("a"), 1.2); };
      if (cur) snd(cur.m === "roar" ? "growl" : "bite", 0);
      if (lastFight.step >= lastFight.log.length) { clearInterval(fightT); snd(lastFight.win ? "level" : "bad"); loadLadder(); }
      if (tab === "battle" && ui && !ui.panel.hidden) { const el = ui.body.querySelector(".wz-dfight"); if (el) el.innerHTML = fightHtml(lastFight, lastFight.step); } }, 650);
    paintPanel();
  }
  const cap = (x) => String(x || "").charAt(0).toUpperCase() + String(x || "").slice(1);
  function codexHtml() {
    const b = D && D.buddy, k = b ? stageOf(b, now()) : -1;
    return `<p class="wz-dnote">${esc(T("Velociraptor — how it grows"))}</p><div class="wz-dstrip"><span class="${D && (D.egg || D.buddy) ? "on" : ""}"><i>🥚</i><b>${esc(T("Egg"))}</b><small>${esc(T("3 days"))}</small></span>${DINO.STAGES.map((s, i) => `<em>›</em><span class="${i <= k ? "on" : ""}${i === k ? " now" : ""}"><i style="font-size:${16 + i * 4}px">🦖</i><b>${esc(T(STAGE_N[i]))}</b><small>Lv ${s.lv}</small></span>`).join("")}</div><ul class="wz-codex">${DINO.STAGES.map((s, i) => `<li class="${i <= k ? "on" : ""}"><i style="font-size:${18 + i * 7}px">🦖</i><b>${esc(T(STAGE_N[i]))}</b><small>Lv ${s.lv}+ · ${esc(T("{d} days", { d: s.days }))} · ×${s.size}</small><em>${esc(T(["Follows you everywhere", "Learns to bite", "Dashes in", "Roars to protect you", "Infinity Fang"][i]))}</em></li>`).join("")}</ul>
      <h4>${esc(T("Coming next"))}</h4><ul class="wz-droad"><li><b>🏟️ ${esc(T("Live PvP arena"))}</b><small>${esc(T("Real-time battles and tournaments with your companion — a later update. Dino Battles (the Battles tab) are open now."))}</small></li><li><b>💎 ${esc(T("Ownership on Arc"))}</b><small>${esc(T("Eggs and companions you own on-chain — planned for a later phase. Until then your companion stays with your account."))}</small></li></ul>`;
  }
  function shopHtml() { return `<p class="wz-dnote">${esc(T("Dino treats feed an egg or your companion like raw meat. A convenience only — they add no strength."))}</p><div class="wz-dshop">${DINO.FOOD.map((p) => `<button type="button" data-food="${p.id}"><b>🍬 ×${p.n}</b><em>${fmt(p.arcl)} ARCL</em></button>`).join("")}</div><p class="wz-dnote">${esc(T("You have {n} treats · up to {m} a day", { n: (D && D.treats) || 0, m: DINO.FOOD_DAY }))}</p>`; }
  function paintPanel() {
    if (!ui || ui.panel.hidden) return; const tabs = [["egg", "🥚", "Hatchery"], ["buddy", "🦖", "Companion"], ["battle", "⚔️", "Battles"], ["codex", "📖", "Codex"], ["shop", "🍬", "Treats"]];
    ui.body.innerHTML = `<header class="wz-pack-h"><b>${esc(T("DINO SOULMATE"))}</b><button type="button" class="wz-pack-x" data-a="x" aria-label="${esc(T("Close"))}">✕</button></header>
      <div class="wz-dtabs">${tabs.map(([k, ic, n]) => `<button type="button" data-tab="${k}" class="${tab === k ? "on" : ""}"><span aria-hidden="true">${ic}</span>${esc(T(n))}</button>`).join("")}</div>
      <div class="wz-dpane">${tab === "egg" ? eggHtml() : tab === "buddy" ? buddyHtml() : tab === "battle" ? battleHtml() : tab === "codex" ? codexHtml() : shopHtml()}</div>`;
  }
  async function onPanel(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.tab) { tab = b.dataset.tab; snd("tab"); if (tab === "battle") loadLadder(); paintPanel(); return; }
    if (b.dataset.a === "fight") return fight();
    if (b.dataset.a === "x") return closePanel();
    if (b.dataset.cmd) { command(b.dataset.cmd); paintPanel(); return; }
    if (b.dataset.care) return doCare(b.dataset.care);
    if (b.dataset.a === "hatch") return hatch();
    if (b.dataset.op) return doOp(b.dataset.op);
    if (b.dataset.food) return buyFood(b.dataset.food);
    if (b.dataset.a === "out") { pref.out = !pref.out; savePref(); ensureBuddy(); paint(); snd("tap"); return; }
    if (b.dataset.a === "look") return look();
    if (b.dataset.a === "notify") { try { Notification.requestPermission().then(() => paintPanel()); } catch { /* not this browser */ } return; }
    if (b.dataset.mission) return claimMission(b.dataset.mission);
  }
  async function doCare(k) {
    if (busy) return; busy = true; const r = await api("world-dino-care", { kind: k }); busy = false;
    if (!r.ok) { toast(errOf(r)); snd("bad"); if (r.j && r.j.lost) loadState(); return; }
    const done0 = (D && D.egg && D.egg.done ? D.egg.done.length : 0); took(r.j); snd(k === "water" ? "pick" : "equip");
    if (D.egg && (D.egg.done || []).length > done0) { toast(`💚 <b>${esc(T("Day {d} done!", { d: D.egg.done.length }))}</b> ${esc(D.egg.done.length < 3 ? T("Come back in 20–28 hours for the next day's care.") : T("It hatches 72 hours after you found it."))}`); snd("level"); }
  }
  async function hatch() {
    if (busy) return; const name = (ui.body.querySelector("[data-name]") || {}).value || ""; busy = true; const r = await api("world-dino-hatch", { name }); busy = false;
    if (!r.ok) { toast(errOf(r)); snd("bad"); return; }
    took(r.j); tab = "buddy"; closePanel(); snd("level"); if (H.confetti) H.confetti(); born(D.buddy.name);
    toast(`🐣 <b>${esc(T("{name} hatched!", { name: D.buddy.name }))}</b> ${esc(T("Your companion for good. It follows you, hunts with you and grows up."))}`);
  }
  /// the hatch: a moment on the screen (tap it away, or it goes in 5 s), and the companion stepping out beside you
  /// the hatch: the egg in front of you shakes harder and harder, cracks, its shell flies apart, and out it steps —
  /// then the moment on the screen (tap it away, or it goes in 5 s). By the wall clock, so a slow frame can't stall it.
  let HA = null;
  function born(name) {
    if (!ui) return; const me = H.me(), x = me.x + Math.sin(me.face) * 2.6, z = me.z + Math.cos(me.face) * 2.6, y = H.height(x, z);
    const rar = (genesNow() || {}).rarity || "common", egg = eggMesh(rar); egg.position.set(x, y + 0.85, z); H.scene.add(egg);
    if (B) { B.x = x; B.z = z; B.face = me.face + Math.PI; B.g.visible = false; }
    HA = { t0: performance.now(), egg, x, y, z, rar, name, parts: [], cracked: false }; snd("tap");
  }
  function tickHatch() {
    if (!HA) return; const k = (performance.now() - HA.t0) / 1000, e = HA.egg;
    if (!HA.cracked) { const a = Math.min(1, k / 1.8) ** 2; e.rotation.z = Math.sin(k * (10 + 20 * a)) * 0.08 * (1 + a * 3); e.rotation.x = Math.cos(k * 13) * 0.05 * a; e.material.emissiveIntensity = 0.5 + a * 1.4; e.position.y = HA.y + 0.85 + Math.abs(Math.sin(k * 9)) * 0.08 * a;
      if (k > 1.9) { HA.cracked = true; H.scene.remove(e); const P = eggParts(), M = eggMats(HA.rar);
        for (let i = 0; i < 2; i++) { const sh = new THREE.Mesh(P.shell, M.egg); sh.scale.set(1.5, 1.95, 1.5); sh.position.set(HA.x, HA.y + 0.85, HA.z); if (i) sh.rotation.x = Math.PI; H.scene.add(sh); HA.parts.push({ m: sh, vx: (i ? 1 : -1) * (1.5 + Math.random()), vy: 4 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, r: (Math.random() - 0.5) * 8 }); }
        const sg = new THREE.SphereGeometry(0.07, 6, 4), sm = new THREE.MeshBasicMaterial({ color: (RAR[HA.rar] || RAR.common).c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        for (let i = 0; i < 26; i++) { const p = new THREE.Mesh(sg, sm); p.position.set(HA.x, HA.y + 0.9, HA.z); H.scene.add(p); const a2 = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4; HA.parts.push({ m: p, vx: Math.cos(a2) * v, vy: 2 + Math.random() * 4, vz: Math.sin(a2) * v, r: 0, spark: true }); }
        if (B) { B.g.visible = true; roar(); } snd("level");
        ui.born.innerHTML = `<div class="wz-hatched-in"><i aria-hidden="true">🐣</i><b>${esc(T("Hatched!"))}</b><span>${esc(T("A new companion is born: {name}", { name: HA.name }))}</span>${HA.rar !== "common" ? `<em class="r-${HA.rar}">${esc(T(RAR[HA.rar].n))}</em>` : ""}<small>${esc(T("Tap to continue"))}</small></div>`;
        ui.born.hidden = false; clearTimeout(ui.bornT); ui.bornT = setTimeout(() => { if (ui) ui.born.hidden = true; }, 5000); HA.t1 = performance.now(); }
      return; }
    const dt = 1 / 60, k2 = (performance.now() - HA.t1) / 1000;
    for (const p of HA.parts) { p.vy -= 9 * dt; p.m.position.x += p.vx * dt; p.m.position.y = Math.max(HA.y + 0.1, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt; p.m.rotation.z += p.r * dt; if (p.spark) p.m.scale.setScalar(Math.max(0.01, 1 - k2 / 1.2)); }
    if (k2 > 2.4) { for (const p of HA.parts) H.scene.remove(p.m); HA = null; }
  }
  async function doOp(op) {
    if (busy) return; const extra = {}; if (op === "name") extra.name = (ui.body.querySelector("[data-rename]") || {}).value || "";
    busy = true; const r = await api("world-dino-buddy", { op, ...extra }); busy = false;
    if (!r.ok) { toast(errOf(r)); snd("bad"); return; }
    const lv0 = D && D.buddy ? D.buddy.lv : 0; took(r.j); snd(op === "pet" ? "pick" : "equip"); if (B) { H.pop(B, op === "pet" ? "💗" : op === "feed" ? "🍖 +" + DINO.BOND.feed : op === "rest" ? "💤" : "✏️", "buddy-sk"); if (op === "pet") roar(); }
    if (D.buddy && D.buddy.lv > lv0 && lv0) levelUp();
  }
  function levelUp() { const b = D.buddy; toast(`⬆️ <b>${esc(T("{name} reached Lv {n}!", { name: b.name, n: b.lv }))}</b>`); snd("level"); ensureBuddy(); setTag(); }
  async function buyFood(id) {
    const p = DINO.FOOD.find((x) => x.id === id); if (!p || busy) return;
    if (!confirm(T("Buy {n} dino treats for {a} ARCL?", { n: p.n, a: fmt(p.arcl) }))) return;
    busy = true; const r = await api("world-dino-food", { pack: id }); busy = false;
    if (!r.ok) { toast(errOf(r)); snd("bad"); return; } D = { ...(D || {}), treats: r.j.treats }; snd("buy"); toast(`🍬 <b>+${p.n}</b> ${esc(T("dino treats"))} · −${fmt(p.arcl)} ARCL`); if (ctx.refresh) ctx.refresh(); paintPanel();
  }
  /// the companion comes before you and turns round while the camera goes slowly round you both
  function look() { if (!B || !H.setView) return; closePanel(); const me = H.me(); B.x = me.x + Math.sin(me.face) * 3; B.z = me.z + Math.cos(me.face) * 3; B.face = me.face + Math.PI; roar(); snd("growl", 0);
    let k = 0; const y0 = H.camYaw(); const id = setInterval(() => { k += 1; H.setView({ yaw: y0 + (k / 60) * Math.PI * 2 }); if (k >= 60) clearInterval(id); }, 60); }

  // ---------------- each frame ----------------
  let lastWarn = 0;
  function tick(dt, t) {
    if (!ui) return; const T0 = Date.now();
    if (T0 > nextNests) { nextNests = T0 + 60e3; loadNests(); } if (T0 > nextState && signed()) { nextState = T0 + 120e3; loadState(); }
    const me = H.me(); let near = null, nd = 1e9, far = null, fd = 1e9;
    for (const [, o] of eggObjs) { if (o.e.to <= now()) continue; o.egg.rotation.y = t * 0.6; o.egg.position.y = 0.85 + Math.sin(t * 2) * 0.06; o.beam.material.opacity = 0.16 + Math.sin(t * 1.7) * 0.06; const d = Math.hypot(o.e.x - me.x, o.e.z - me.z); if (d < nd) { nd = d; near = o.e; } if (d < fd) { fd = d; far = o.e; } }
    const free = !(D && (D.buddy || D.egg)), can = free && near && nd < 3.2 && !me.down; ui.pick.hidden = !can; ui.pickE = can ? near : null; // (one egg or one companion: with either, eggs are only to look at)
    // the arrow at the top: to the nearest egg out; with none out (and no egg or companion yet), to where the next one comes
    let aim = free && far && fd < 260 && fd >= 3.2 ? far : null, label = aim ? (aim.first ? T("Your first egg · {d} m", { d: Math.round(fd) }) : T("An egg is out · {d} m", { d: Math.round(fd) })) : "";
    if (!far && D && !D.egg && !D.buddy && signed() && T0 > (ui.nextAt || 0)) { ui.nextAt = T0 + 5000; ui.next = nextEggs(now(), 12, 1)[0] || null; }
    if (!aim && free && !far && D && ui.next) { aim = ui.next; label = T("Next egg in {t} · {d} m", { t: dur(aim.from - now()), d: Math.round(Math.hypot(aim.x - me.x, aim.z - me.z)) }); }
    ui.chip.hidden = !aim; ui.chip.classList.toggle("soon", !!(aim && !far)); ui.chip.classList.toggle("first", !!(aim && aim.first));
    if (aim) { const a = Math.atan2(aim.x - me.x, aim.z - me.z), rel = a - (H.camYaw() + Math.PI); ui.chip.querySelector("i").style.transform = `rotate(${(-rel * 180) / Math.PI - 90}deg)`; ui.chip.querySelector("span").textContent = label; }
    if (B && ui.sk && (t * 4) % 1 < dt * 4) paintSkill();
    tickBuddy(dt, t); tickHatch(); if (B && (t * 4) % 1 < dt * 4) paintCard();
    // the reminders: today's care open, or closing soon
    if (T0 - lastWarn > 30e3 && D && D.egg) { lastWarn = T0; const s = eggState(D.egg, now()), key = (D.egg.done || []).length;
      if (s.open && /^D/.test(s.stage)) { const left = s.closesAt - now(); const lvl = left < 3600e3 ? "1h" : left < 4 * 3600e3 ? "4h" : "open";
        if (warned[key] !== lvl) { warned[key] = lvl; toast(lvl === "open" ? `🥚 ${esc(T("Your egg's care is open today."))}` : `${lvl === "1h" ? "⚠️" : "⏰"} <b>${esc(T("Your egg needs care within {t}!", { t: dur(left) }))}</b>`); notify("🥚 DINO SOULMATE", lvl === "open" ? T("Your egg's care is open today.") : T("Your egg needs care within {t}!", { t: dur(left) })); paint(); } }
      else if (s.stage === "READY" && warned.ready !== 1) { warned.ready = 1; toast(`🐣 <b>${esc(T("Your egg is ready to hatch!"))}</b>`); notify("🐣 DINO SOULMATE", T("Your egg is ready to hatch!")); paint(); } }
  }
  function start() { if (!ui) build(); nextNests = nextState = 0; load(); }
  function stop() { riding = false; clearInterval(fightT); if (HA) { H.scene.remove(HA.egg); for (const p of HA.parts) H.scene.remove(p.m); HA = null; if (B) B.g.visible = true; } if (ui) { ui.panel.hidden = true; ui.born.hidden = true; ui.pick.hidden = true; ui.chip.hidden = true; ui.res.hidden = true; } }
  return {
    start, stop, tick, near, hurt, out, ensure: ensureBuddy, open: openPanel, ride, riding: () => riding && canRide(), saddle: () => (B ? (B.R.h || 1.5) * 0.52 : 0),
    onBuddy: (b, kind, saved) => { const b0 = D && D.buddy, lv0 = b0 ? b0.lv : 0; D = { ...(D || {}), buddy: { ...(b0 || {}), ...b } }; result(b0, D.buddy, kind, saved || 0); if (b.lv > lv0 && lv0) levelUp(); paint(); },
    /// tests: the numbers and a few levers
    debug: () => ({ egg: D && D.egg ? { ...(D.egg.state || {}), done: (D.egg.done || []).length } : null, buddy: D && D.buddy ? { lv: D.buddy.lv, bond: D.buddy.bond, name: D.buddy.name, stage: stageNow() } : null, out: out(), mode: pref.mode, nests: nests.length, eggs: eggObjs.size, B: B ? { x: +B.x.toFixed(1), z: +B.z.toFixed(1), hp: Math.round(B.hp), max: B.max, down: !!B.downUntil, tg: B.tg ? B.tg.id : null, tgD: B.tg ? +dist(B, B.tg).toFixed(1) : null, tgHp: B.tg ? B.tg.hpNow ?? null : null, clips: B.R.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name) } : null }),
    tryPick: () => { if (ui && ui.pickE && !ui.pick.hidden) { pickUp(ui.pickE); return true; } return false; },
    cmd: command, pick: () => { const e = nests[0]; if (e) return pickUp(e); }, care: doCare, hatchNow: hatch, op: doOp, tab: (k) => { tab = k; paintPanel(); }, close: closePanel, reload: load,
  };
}

// ---------------- the words (ko · zh · tr) ----------------
Object.assign(LW.ko, {
  "{name} is your companion": "나의 동료, {name}", "One companion per account, for good. The eggs out on the plains are for new tamers.": "동료는 계정당 하나, 영원히. 평원의 알은 새로운 조련사들을 위한 거예요.",
  "Live PvP arena": "실시간 PvP 아레나", "Real-time battles and tournaments with your companion — a later update. Dino Battles (the Battles tab) are open now.": "동료와 함께하는 실시간 배틀과 토너먼트 — 이후 업데이트. 다이노 배틀(배틀 탭)은 지금 열려 있어요.",
  "Ride": "타기", "Get off": "내리기", "Let's go!": "가자!", "You can ride it once it's an Adult (Lv {l}, {d} days)": "성체가 되면 탈 수 있어요 (Lv {l}, {d}일)",
  "Battles give experience and bond, never ARCL. Five a day.": "배틀은 경험치와 유대를 줄 뿐, ARCL은 주지 않아요. 하루 5번.", "Collect": "받기", "Defeat": "패배", "Each egg stays out 10 minutes. The arrow at the top points to the nearest one.": "알은 10분 동안만 나와 있어요. 위쪽 화살표가 가장 가까운 알을 가리켜요.", "Egg forecast": "알 예보", "Find an opponent": "상대 찾기", "Follow the golden light — only you can see it.": "황금빛을 따라가세요 — 나만 볼 수 있어요.", "Hatch a companion to enter Dino Battles.": "동료를 부화시키면 다이노 배틀에 참가할 수 있어요.", "Mission done!": "미션 완료!", "Nest {n}": "둥지 {n}", "Next egg in {t} · {d} m": "다음 알 {t} 후 · {d} m", "No one yet — be the first.": "아직 아무도 없어요 — 첫 번째가 되어 보세요.", "Nothing to fight nearby": "근처에 싸울 상대가 없어요", "Only you can see it": "나만 볼 수 있어요", "Rating": "레이팅", "Remind me (while the site is open)": "알림 받기 (사이트가 열려 있을 때)", "Reminders are on": "알림 켜짐", "That's today's battles": "오늘 배틀은 끝났어요", "Today's missions": "오늘의 미션", "Top companions": "최강 동료", "Victory!": "승리!", "Won–lost": "승–패", "You found a {r} egg!": "{r} 알을 찾았어요!", "Your companion fights another player's on its own: its level, bond and stage decide. Win or lose, it learns (XP +{x}).": "동료가 다른 플레이어의 동료와 스스로 싸워요: 레벨, 유대, 성장 단계가 승부를 가려요. 이기든 지든 배워요 (XP +{x}).", "Your first egg": "나의 첫 번째 알", "Your first egg is waiting by the gate — only you can see it.": "첫 번째 알이 게이트 옆에서 기다려요 — 나만 볼 수 있어요.", "Your first egg is waiting by the gate!": "첫 번째 알이 게이트 옆에서 기다려요!", "Your first egg · {d} m": "나의 첫 번째 알 · {d} m", "in {t}": "{t} 후", "left today": "오늘 남음", "out now": "지금 나와 있음", "wild": "야생", "{a} used {m}!": "{a}의 {m}!", "{name} helped!": "{name}의 활약!", "{n} swings saved": "타격 {n}회 절약", "{r} egg": "{r} 알", "{s} is ready in {n} s": "{s} — {n}초 후 사용 가능", "Common": "일반", "Rare": "희귀", "Epic": "영웅", "Legendary": "전설", "Velociraptor": "벨로키랍토르", "Triceratops": "트리케라톱스", "Jade": "비취", "Sand": "모래", "Ember": "불씨", "Storm": "폭풍", "Violet": "보라", "Ash": "잿빛", "Moss": "이끼", "Frost": "서리", "Amber": "호박색", "Ice": "얼음", "Ruby": "루비", "Gold": "황금", "Battles": "배틀", "Claw": "할퀴기", "Hunt together {n} times": "함께 사냥 {n}회", "Pat it {n} times": "쓰다듬기 {n}회", "Rest at your camp": "캠프에서 휴식", "Fight {n} Dino Battles": "다이노 배틀 {n}회", "It's down — give it a moment": "쓰러졌어요 — 잠시 기다려 주세요", "Call your companion out first": "먼저 동료를 불러내세요",
  "Hatching": "부화 대기", "Day {d}": "{d}일차", "Hatched!": "부화 성공!", "A new companion is born: {name}": "새로운 동료가 태어났어요: {name}", "Tap to continue": "탭해서 계속", "Skills": "스킬", "Bite": "물기", "Dash": "돌진", "Roar": "포효", "Ready": "사용 가능", "From {s}": "{s}부터", "Egg": "알", "3 days": "3일",
  "A day's care was missed. You can look for a new egg.": "하루 돌봄을 놓쳤어요. 새 알을 찾아볼 수 있어요.", "Adult": "성체", "All three days done — it hatches in {t}": "3일 돌봄 완료 — {t} 후 부화해요",
  "An egg found {d} — lost on day {n}": "{d}에 찾은 알 — {n}일째에 잃었어요", "An egg is out · {d} m": "알 발견 · {d} m", "Attack": "공격", "Attack!": "공격!", "Awakened": "각성",
  "Bond": "유대", "Bond: feeding +5, 10 hunts together +5, a boss +8, a pat +2, a rest +3 — up to 15 a day.": "유대: 먹이 +5, 함께 사냥 10회 +5, 보스 +8, 쓰다듬기 +2, 휴식 +3 — 하루 최대 15.",
  "Buy {n} dino treats for {a} ARCL?": "공룡 간식 {n}개를 {a} ARCL에 살까요?", "Call it out": "불러내기", "Care for it today, then every day for three days.": "오늘 돌봐 주고, 3일 동안 매일 돌봐 주세요.",
  "Close": "닫기", "Codex": "도감", "Come back in 20–28 hours for the next day's care.": "20–28시간 뒤에 다음 날 돌봄을 하러 오세요.", "Coming next": "다음 업데이트", "Companion": "동료", "DASH!": "돌진!",
  "DINO SOULMATE": "DINO SOULMATE", "Dashes in": "돌진해요", "Day {d} done!": "{d}일째 완료!", "Day {d} of 3 — care for it now": "3일 중 {d}일째 — 지금 돌봐 주세요", "Day {d} of 3 — the next care opens in {t}": "3일 중 {d}일째 — {t} 후 다음 돌봄이 열려요",
  "Defence": "방어", "Dino Battles": "다이노 배틀", "Dino treats feed an egg or your companion like raw meat. A convenience only — they add no strength.": "공룡 간식은 알이나 동료에게 날고기처럼 먹일 수 있어요. 편의용일 뿐 — 힘은 오르지 않아요.",
  "Eggs and companions you own on-chain — planned for a later phase. Until then your companion stays with your account.": "온체인으로 소유하는 알과 동료 — 다음 단계에서 계획 중이에요. 그때까지 동료는 내 계정에 남아요.",
  "Eggs out right now: {n}": "지금 나와 있는 알: {n}", "Feed": "먹이", "Find an egg and care for it for three days. Only one companion, ever — it grows with you.": "알을 찾아 3일 동안 돌봐 주세요. 동료는 단 하나 — 나와 함께 자라요.",
  "Follow": "따라와", "Following!": "따라갈게!", "Follows you everywhere": "어디든 따라와요", "Food": "먹이", "Fully awakened.": "완전히 각성했어요.", "Guard": "지켜", "Hatch": "부화", "Hatchery": "부화장", "Hatchling": "새끼", "Health": "건강",
  "INFINITY FANG!": "인피니티 팽!", "In memory": "추억", "Infinity Fang": "인피니티 팽", "It hatches 72 hours after you found it.": "찾은 지 72시간 뒤에 부화해요.", "It's moving! Ready to hatch": "움직여요! 부화할 준비가 됐어요", "Juvenile": "어린 공룡",
  "Learns to bite": "물기를 배워요", "Less than an hour left today — it dies if its care is missed!": "오늘 1시간도 안 남았어요 — 돌봄을 놓치면 알이 죽어요!", "Let it rest (hide)": "쉬게 하기 (숨기기)", "Look": "보기",
  "Miss a day's window and the egg is lost.": "하루라도 시간을 놓치면 알을 잃어요.", "Name your companion": "동료 이름 짓기", "Next: {s} at Lv {l} and {d} days together": "다음: {s} — Lv {l}, 함께한 지 {d}일", "No companion yet": "아직 동료가 없어요", "No egg yet": "아직 알이 없어요",
  "On guard!": "지킬게!", "Ownership on Arc": "Arc 위의 소유권", "Pet": "쓰다듬기", "Pick up the egg": "알 줍기", "PvP battles, tournaments and challenges with your companion — a later update.": "동료와 함께하는 PvP 배틀, 토너먼트, 챌린지 — 이후 업데이트.",
  "ROAR!": "포효!", "Rare egg": "희귀한 알", "Rare eggs appear at the nests on the plains — look for a light in the sky. The first to reach one gets it; you can raise one egg at a time.": "평원의 둥지에 희귀한 알이 나타나요 — 하늘로 솟은 빛을 찾으세요. 먼저 도착한 사람이 가져가고, 알은 한 번에 하나만 키울 수 있어요.",
  "Rest": "휴식", "Roars to protect you": "포효로 나를 지켜요", "Sign in with a wallet to raise a dinosaur": "공룡을 키우려면 지갑으로 로그인하세요", "Stay": "멈춰", "Staying.": "기다릴게.", "Temperature": "온도",
  "Today's care closes in {t}": "오늘 돌봄 마감까지 {t}", "Treats": "간식", "Treats: {n}": "간식: {n}", "Velociraptor — how it grows": "벨로키랍토르 — 성장 단계", "Warm": "데우기", "Water": "물", "You found a rare egg!": "희귀한 알을 찾았어요!",
  "You have {n} treats · up to {m} a day": "간식 {n}개 보유 · 하루 최대 {m}개", "Young": "청소년", "Your companion for good. It follows you, hunts with you and grows up.": "영원한 나의 동료. 나를 따라다니고, 함께 사냥하며 자라요.", "Your egg didn't make it.": "알이 살아남지 못했어요.",
  "Your egg is ready to hatch!": "알이 부화할 준비가 됐어요!", "Your egg needs care within {t}!": "{t} 안에 알을 돌봐 주세요!", "Your egg's care is open today.": "오늘의 알 돌봄이 열렸어요.", "at your camp": "내 캠프에서", "bond": "유대", "days": "일", "dino treats": "공룡 간식", "down": "쓰러짐",
  "free": "무료", "hunts": "사냥", "max for your level": "내 레벨의 최대치", "Network trouble — try again": "네트워크 문제 — 다시 시도하세요", "resting": "휴식 중", "treat · meat · 2 berries": "간식 · 고기 · 베리 2", "{d} days": "{d}일", "{h}h {m}m": "{h}시간 {m}분", "{m}m": "{m}분",
  "{name} hatched!": "{name} 부화!", "{name} is back on its feet!": "{name}, 다시 일어났어요!", "{name} is down — back in 60 s, or at once at your camp.": "{name}, 쓰러졌어요 — 60초 뒤, 또는 캠프에 가면 바로 일어나요.", "{name} reached Lv {n}!": "{name} Lv {n} 달성!",
});
Object.assign(LW.zh, {
  "{name} is your companion": "{name} 是你的伙伴", "One companion per account, for good. The eggs out on the plains are for new tamers.": "每个账号只有一个伙伴，永远相伴。平原上的蛋留给新的驯兽师。",
  "Live PvP arena": "实时 PvP 竞技场", "Real-time battles and tournaments with your companion — a later update. Dino Battles (the Battles tab) are open now.": "与伙伴一起的实时对战和锦标赛 — 后续更新。恐龙对战（对战标签）现已开放。",
  "Ride": "骑乘", "Get off": "下来", "Let's go!": "出发！", "You can ride it once it's an Adult (Lv {l}, {d} days)": "成年后就能骑乘（Lv {l}，{d} 天）",
  "Battles give experience and bond, never ARCL. Five a day.": "对战只给经验和羁绊，不给 ARCL。每天 5 次。", "Collect": "领取", "Defeat": "失败", "Each egg stays out 10 minutes. The arrow at the top points to the nearest one.": "每颗蛋只出现 10 分钟。顶部的箭头指向最近的一颗。", "Egg forecast": "蛋预报", "Find an opponent": "寻找对手", "Follow the golden light — only you can see it.": "跟随金色的光 — 只有你能看到。", "Hatch a companion to enter Dino Battles.": "孵化伙伴后即可参加恐龙对战。", "Mission done!": "任务完成！", "Nest {n}": "巢穴 {n}", "Next egg in {t} · {d} m": "下一颗蛋 {t} 后 · {d} 米", "No one yet — be the first.": "还没有人 — 来做第一个吧。", "Nothing to fight nearby": "附近没有可战斗的对象", "Only you can see it": "只有你能看到", "Rating": "积分", "Remind me (while the site is open)": "提醒我（网站打开时）", "Reminders are on": "提醒已开启", "That's today's battles": "今天的对战已结束", "Today's missions": "今日任务", "Top companions": "最强伙伴", "Victory!": "胜利！", "Won–lost": "胜–负", "You found a {r} egg!": "你找到了一颗{r}蛋！", "Your companion fights another player's on its own: its level, bond and stage decide. Win or lose, it learns (XP +{x}).": "你的伙伴会自动与其他玩家的伙伴战斗：等级、羁绊和成长阶段决定胜负。无论输赢都会成长（XP +{x}）。", "Your first egg": "你的第一颗蛋", "Your first egg is waiting by the gate — only you can see it.": "你的第一颗蛋在大门旁等你 — 只有你能看到。", "Your first egg is waiting by the gate!": "你的第一颗蛋在大门旁等你！", "Your first egg · {d} m": "你的第一颗蛋 · {d} 米", "in {t}": "{t} 后", "left today": "今日剩余", "out now": "现在出现", "wild": "野生", "{a} used {m}!": "{a} 使用了{m}！", "{name} helped!": "{name} 帮了忙！", "{n} swings saved": "节省 {n} 次攻击", "{r} egg": "{r}蛋", "{s} is ready in {n} s": "{s} — {n} 秒后可用", "Common": "普通", "Rare": "稀有", "Epic": "史诗", "Legendary": "传说", "Velociraptor": "迅猛龙", "Triceratops": "三角龙", "Jade": "翡翠", "Sand": "沙色", "Ember": "余烬", "Storm": "风暴", "Violet": "紫罗兰", "Ash": "灰烬", "Moss": "苔藓", "Frost": "霜白", "Amber": "琥珀", "Ice": "冰蓝", "Ruby": "红宝石", "Gold": "金色", "Battles": "对战", "Claw": "爪击", "Hunt together {n} times": "一起狩猎 {n} 次", "Pat it {n} times": "抚摸 {n} 次", "Rest at your camp": "在营地休息", "Fight {n} Dino Battles": "进行 {n} 场恐龙对战", "It's down — give it a moment": "它倒下了 — 请稍等", "Call your companion out first": "请先唤出你的伙伴",
  "Hatching": "等待孵化", "Day {d}": "第 {d} 天", "Hatched!": "孵化成功！", "A new companion is born: {name}": "新的伙伴诞生了：{name}", "Tap to continue": "点击继续", "Skills": "技能", "Bite": "撕咬", "Dash": "冲刺", "Roar": "咆哮", "Ready": "可用", "From {s}": "{s}起", "Egg": "蛋", "3 days": "3 天",
  "A day's care was missed. You can look for a new egg.": "错过了一天的照料。你可以去找一颗新蛋。", "Adult": "成年", "All three days done — it hatches in {t}": "三天照料完成 — {t} 后孵化",
  "An egg found {d} — lost on day {n}": "{d} 找到的蛋 — 第 {n} 天失去", "An egg is out · {d} m": "发现恐龙蛋 · {d} 米", "Attack": "攻击", "Attack!": "攻击！", "Awakened": "觉醒",
  "Bond": "羁绊", "Bond: feeding +5, 10 hunts together +5, a boss +8, a pat +2, a rest +3 — up to 15 a day.": "羁绊：喂食 +5，一起狩猎 10 次 +5，首领 +8，抚摸 +2，休息 +3 — 每天最多 15。",
  "Buy {n} dino treats for {a} ARCL?": "用 {a} ARCL 购买 {n} 份恐龙零食？", "Call it out": "唤出", "Care for it today, then every day for three days.": "今天照料它，之后三天每天照料。",
  "Close": "关闭", "Codex": "图鉴", "Come back in 20–28 hours for the next day's care.": "20–28 小时后回来进行下一天的照料。", "Coming next": "即将推出", "Companion": "伙伴", "DASH!": "冲刺！",
  "DINO SOULMATE": "DINO SOULMATE", "Dashes in": "冲刺突进", "Day {d} done!": "第 {d} 天完成！", "Day {d} of 3 — care for it now": "第 {d}/3 天 — 现在照料它", "Day {d} of 3 — the next care opens in {t}": "第 {d}/3 天 — {t} 后开放下一次照料",
  "Defence": "防御", "Dino Battles": "恐龙对战", "Dino treats feed an egg or your companion like raw meat. A convenience only — they add no strength.": "恐龙零食可像生肉一样喂给蛋或伙伴。仅为方便 — 不会增加力量。",
  "Eggs and companions you own on-chain — planned for a later phase. Until then your companion stays with your account.": "链上拥有的蛋和伙伴 — 计划在后续阶段推出。在此之前，伙伴留在你的账号中。",
  "Eggs out right now: {n}": "当前出现的蛋：{n}", "Feed": "喂食", "Find an egg and care for it for three days. Only one companion, ever — it grows with you.": "找到一颗蛋并照料三天。伙伴只有一个 — 它与你一起成长。",
  "Follow": "跟随", "Following!": "跟上了！", "Follows you everywhere": "到处跟着你", "Food": "食物", "Fully awakened.": "已完全觉醒。", "Guard": "守护", "Hatch": "孵化", "Hatchery": "孵化所", "Hatchling": "幼崽", "Health": "健康",
  "INFINITY FANG!": "无限之牙！", "In memory": "纪念", "Infinity Fang": "无限之牙", "It hatches 72 hours after you found it.": "找到后 72 小时孵化。", "It's moving! Ready to hatch": "它在动！可以孵化了", "Juvenile": "幼年",
  "Learns to bite": "学会撕咬", "Less than an hour left today — it dies if its care is missed!": "今天剩余不到一小时 — 错过照料蛋就会死亡！", "Let it rest (hide)": "让它休息（隐藏）", "Look": "观看",
  "Miss a day's window and the egg is lost.": "错过任何一天的时间窗口，蛋就会失去。", "Name your companion": "为伙伴取名", "Next: {s} at Lv {l} and {d} days together": "下一阶段：{s} — Lv {l}，相伴 {d} 天", "No companion yet": "还没有伙伴", "No egg yet": "还没有蛋",
  "On guard!": "守护中！", "Ownership on Arc": "Arc 上的所有权", "Pet": "抚摸", "Pick up the egg": "捡起蛋", "PvP battles, tournaments and challenges with your companion — a later update.": "与伙伴一起的 PvP 对战、锦标赛和挑战 — 后续更新。",
  "ROAR!": "咆哮！", "Rare egg": "稀有蛋", "Rare eggs appear at the nests on the plains — look for a light in the sky. The first to reach one gets it; you can raise one egg at a time.": "稀有蛋会出现在平原的巢穴中 — 寻找冲向天空的光柱。先到者得；一次只能养一颗蛋。",
  "Rest": "休息", "Roars to protect you": "咆哮保护你", "Sign in with a wallet to raise a dinosaur": "用钱包登录来养恐龙", "Stay": "待命", "Staying.": "原地等待。", "Temperature": "温度",
  "Today's care closes in {t}": "今天的照料 {t} 后截止", "Treats": "零食", "Treats: {n}": "零食：{n}", "Velociraptor — how it grows": "迅猛龙 — 成长阶段", "Warm": "保温", "Water": "喂水", "You found a rare egg!": "你找到了一颗稀有蛋！",
  "You have {n} treats · up to {m} a day": "拥有 {n} 份零食 · 每天最多 {m} 份", "Young": "少年", "Your companion for good. It follows you, hunts with you and grows up.": "你永远的伙伴。它跟随你、与你一起狩猎并成长。", "Your egg didn't make it.": "你的蛋没能活下来。",
  "Your egg is ready to hatch!": "你的蛋可以孵化了！", "Your egg needs care within {t}!": "请在 {t} 内照料你的蛋！", "Your egg's care is open today.": "今天的蛋照料已开放。", "at your camp": "在你的营地", "bond": "羁绊", "days": "天", "dino treats": "恐龙零食", "down": "倒下",
  "free": "免费", "hunts": "狩猎", "max for your level": "你等级的上限", "Network trouble — try again": "网络问题 — 请重试", "resting": "休息中", "treat · meat · 2 berries": "零食 · 肉 · 2 浆果", "{d} days": "{d} 天", "{h}h {m}m": "{h}小时 {m}分", "{m}m": "{m}分",
  "{name} hatched!": "{name} 孵化了！", "{name} is back on its feet!": "{name} 重新站起来了！", "{name} is down — back in 60 s, or at once at your camp.": "{name} 倒下了 — 60 秒后恢复，或回营地立即恢复。", "{name} reached Lv {n}!": "{name} 达到 Lv {n}！",
});
Object.assign(LW.tr, {
  "{name} is your companion": "{name} senin yoldaşın", "One companion per account, for good. The eggs out on the plains are for new tamers.": "Hesap başına bir yoldaş, kalıcı olarak. Ovadaki yumurtalar yeni terbiyeciler için.",
  "Live PvP arena": "Canlı PvP arenası", "Real-time battles and tournaments with your companion — a later update. Dino Battles (the Battles tab) are open now.": "Yoldaşınla gerçek zamanlı savaşlar ve turnuvalar — sonraki bir güncelleme. Dino Savaşları (Savaşlar sekmesi) şimdi açık.",
  "Ride": "Bin", "Get off": "İn", "Let's go!": "Hadi!", "You can ride it once it's an Adult (Lv {l}, {d} days)": "Yetişkin olunca binebilirsin (Lv {l}, {d} gün)",
  "Battles give experience and bond, never ARCL. Five a day.": "Savaşlar deneyim ve bağ verir, asla ARCL vermez. Günde beş.", "Collect": "Al", "Defeat": "Yenilgi", "Each egg stays out 10 minutes. The arrow at the top points to the nearest one.": "Her yumurta 10 dakika kalır. Üstteki ok en yakınını gösterir.", "Egg forecast": "Yumurta tahmini", "Find an opponent": "Rakip bul", "Follow the golden light — only you can see it.": "Altın ışığı takip et — sadece sen görebilirsin.", "Hatch a companion to enter Dino Battles.": "Dino Savaşlarına katılmak için bir yoldaş çatlat.", "Mission done!": "Görev tamam!", "Nest {n}": "Yuva {n}", "Next egg in {t} · {d} m": "Sonraki yumurta {t} sonra · {d} m", "No one yet — be the first.": "Henüz kimse yok — ilk sen ol.", "Nothing to fight nearby": "Yakında savaşacak kimse yok", "Only you can see it": "Sadece sen görebilirsin", "Rating": "Puan", "Remind me (while the site is open)": "Hatırlat (site açıkken)", "Reminders are on": "Hatırlatmalar açık", "That's today's battles": "Bugünün savaşları bitti", "Today's missions": "Bugünün görevleri", "Top companions": "En iyi yoldaşlar", "Victory!": "Zafer!", "Won–lost": "Galibiyet–yenilgi", "You found a {r} egg!": "{r} bir yumurta buldun!", "Your companion fights another player's on its own: its level, bond and stage decide. Win or lose, it learns (XP +{x}).": "Yoldaşın başka bir oyuncunun yoldaşıyla kendi başına savaşır: seviyesi, bağı ve evresi belirler. Kazansa da kaybetse de öğrenir (XP +{x}).", "Your first egg": "İlk yumurtan", "Your first egg is waiting by the gate — only you can see it.": "İlk yumurtan kapının yanında bekliyor — sadece sen görebilirsin.", "Your first egg is waiting by the gate!": "İlk yumurtan kapının yanında bekliyor!", "Your first egg · {d} m": "İlk yumurtan · {d} m", "in {t}": "{t} sonra", "left today": "bugün kalan", "out now": "şimdi dışarıda", "wild": "vahşi", "{a} used {m}!": "{a}: {m}!", "{name} helped!": "{name} yardım etti!", "{n} swings saved": "{n} vuruş kazandın", "{r} egg": "{r} yumurta", "{s} is ready in {n} s": "{s} {n} sn sonra hazır", "Common": "Sıradan", "Rare": "Nadir", "Epic": "Destansı", "Legendary": "Efsanevi", "Velociraptor": "Velociraptor", "Triceratops": "Triceratops", "Jade": "Yeşim", "Sand": "Kum", "Ember": "Kor", "Storm": "Fırtına", "Violet": "Menekşe", "Ash": "Kül", "Moss": "Yosun", "Frost": "Ayaz", "Amber": "Kehribar", "Ice": "Buz", "Ruby": "Yakut", "Gold": "Altın", "Battles": "Savaşlar", "Claw": "Pençe", "Hunt together {n} times": "Birlikte {n} av", "Pat it {n} times": "{n} kez okşa", "Rest at your camp": "Kampında dinlen", "Fight {n} Dino Battles": "{n} Dino Savaşı", "It's down — give it a moment": "Yerde — biraz bekle", "Call your companion out first": "Önce yoldaşını çağır",
  "Hatching": "Çatlıyor", "Day {d}": "{d}. gün", "Hatched!": "Çatladı!", "A new companion is born: {name}": "Yeni bir yoldaş doğdu: {name}", "Tap to continue": "Devam için dokun", "Skills": "Yetenekler", "Bite": "Isırık", "Dash": "Atılma", "Roar": "Kükreme", "Ready": "Hazır", "From {s}": "{s} itibarıyla", "Egg": "Yumurta", "3 days": "3 gün",
  "A day's care was missed. You can look for a new egg.": "Bir günün bakımı kaçırıldı. Yeni bir yumurta arayabilirsin.", "Adult": "Yetişkin", "All three days done — it hatches in {t}": "Üç gün tamam — {t} sonra çatlıyor",
  "An egg found {d} — lost on day {n}": "{d} bulunan yumurta — {n}. gün kaybedildi", "An egg is out · {d} m": "Bir yumurta var · {d} m", "Attack": "Saldır", "Attack!": "Saldır!", "Awakened": "Uyanmış",
  "Bond": "Bağ", "Bond: feeding +5, 10 hunts together +5, a boss +8, a pat +2, a rest +3 — up to 15 a day.": "Bağ: besleme +5, birlikte 10 av +5, boss +8, okşama +2, dinlenme +3 — günde en fazla 15.",
  "Buy {n} dino treats for {a} ARCL?": "{a} ARCL karşılığında {n} dino ödülü alınsın mı?", "Call it out": "Çağır", "Care for it today, then every day for three days.": "Bugün bak, sonra üç gün boyunca her gün bak.",
  "Close": "Kapat", "Codex": "Kodeks", "Come back in 20–28 hours for the next day's care.": "Ertesi günün bakımı için 20–28 saat sonra gel.", "Coming next": "Sırada", "Companion": "Yoldaş", "DASH!": "ATIL!",
  "DINO SOULMATE": "DINO SOULMATE", "Dashes in": "Atılır", "Day {d} done!": "{d}. gün tamam!", "Day {d} of 3 — care for it now": "3 günün {d}. günü — şimdi bak", "Day {d} of 3 — the next care opens in {t}": "3 günün {d}. günü — sonraki bakım {t} sonra açılıyor",
  "Defence": "Savunma", "Dino Battles": "Dino Savaşları", "Dino treats feed an egg or your companion like raw meat. A convenience only — they add no strength.": "Dino ödülleri yumurtayı ya da yoldaşını çiğ et gibi besler. Sadece kolaylık — güç katmaz.",
  "Eggs and companions you own on-chain — planned for a later phase. Until then your companion stays with your account.": "Zincir üstünde sahip olduğun yumurtalar ve yoldaşlar — sonraki bir aşamada planlanıyor. O zamana kadar yoldaşın hesabında kalır.",
  "Eggs out right now: {n}": "Şu an dışarıdaki yumurtalar: {n}", "Feed": "Besle", "Find an egg and care for it for three days. Only one companion, ever — it grows with you.": "Bir yumurta bul ve üç gün bak. Tek bir yoldaş — seninle birlikte büyür.",
  "Follow": "Takip", "Following!": "Takipteyim!", "Follows you everywhere": "Seni her yere takip eder", "Food": "Yiyecek", "Fully awakened.": "Tamamen uyandı.", "Guard": "Koru", "Hatch": "Çatlat", "Hatchery": "Kuluçkahane", "Hatchling": "Yavru", "Health": "Sağlık",
  "INFINITY FANG!": "SONSUZ DİŞ!", "In memory": "Anısına", "Infinity Fang": "Sonsuz Diş", "It hatches 72 hours after you found it.": "Bulduktan 72 saat sonra çatlar.", "It's moving! Ready to hatch": "Kıpırdıyor! Çatlamaya hazır", "Juvenile": "Genç",
  "Learns to bite": "Isırmayı öğrenir", "Less than an hour left today — it dies if its care is missed!": "Bugün bir saatten az kaldı — bakım kaçırılırsa ölür!", "Let it rest (hide)": "Dinlendir (gizle)", "Look": "Bak",
  "Miss a day's window and the egg is lost.": "Bir günün süresini kaçırırsan yumurta kaybolur.", "Name your companion": "Yoldaşına isim ver", "Next: {s} at Lv {l} and {d} days together": "Sonraki: {s} — Lv {l} ve birlikte {d} gün", "No companion yet": "Henüz yoldaş yok", "No egg yet": "Henüz yumurta yok",
  "On guard!": "Nöbette!", "Ownership on Arc": "Arc üzerinde sahiplik", "Pet": "Okşa", "Pick up the egg": "Yumurtayı al", "PvP battles, tournaments and challenges with your companion — a later update.": "Yoldaşınla PvP savaşları, turnuvalar ve meydan okumalar — sonraki bir güncelleme.",
  "ROAR!": "KÜKREME!", "Rare egg": "Nadir yumurta", "Rare eggs appear at the nests on the plains — look for a light in the sky. The first to reach one gets it; you can raise one egg at a time.": "Nadir yumurtalar ovadaki yuvalarda belirir — gökyüzüne uzanan ışığı ara. İlk ulaşan alır; aynı anda tek bir yumurta büyütebilirsin.",
  "Rest": "Dinlen", "Roars to protect you": "Seni korumak için kükrer", "Sign in with a wallet to raise a dinosaur": "Dinozor büyütmek için cüzdanla giriş yap", "Stay": "Bekle", "Staying.": "Bekliyorum.", "Temperature": "Sıcaklık",
  "Today's care closes in {t}": "Bugünkü bakım {t} sonra kapanıyor", "Treats": "Ödüller", "Treats: {n}": "Ödüller: {n}", "Velociraptor — how it grows": "Velociraptor — nasıl büyür", "Warm": "Isıt", "Water": "Su", "You found a rare egg!": "Nadir bir yumurta buldun!",
  "You have {n} treats · up to {m} a day": "{n} ödülün var · günde en fazla {m}", "Young": "Ergen", "Your companion for good. It follows you, hunts with you and grows up.": "Kalıcı yoldaşın. Seni takip eder, seninle avlanır ve büyür.", "Your egg didn't make it.": "Yumurtan hayatta kalamadı.",
  "Your egg is ready to hatch!": "Yumurtan çatlamaya hazır!", "Your egg needs care within {t}!": "Yumurtanın {t} içinde bakıma ihtiyacı var!", "Your egg's care is open today.": "Yumurtanın bugünkü bakımı açık.", "at your camp": "kampında", "bond": "bağ", "days": "gün", "dino treats": "dino ödülü", "down": "yerde",
  "free": "ücretsiz", "hunts": "av", "max for your level": "seviyen için en yüksek", "Network trouble — try again": "Ağ sorunu — tekrar dene", "resting": "dinleniyor", "treat · meat · 2 berries": "ödül · et · 2 böğürtlen", "{d} days": "{d} gün", "{h}h {m}m": "{h}sa {m}dk", "{m}m": "{m}dk",
  "{name} hatched!": "{name} çatladı!", "{name} is back on its feet!": "{name} yeniden ayakta!", "{name} is down — back in 60 s, or at once at your camp.": "{name} yere düştü — 60 sn sonra ya da kampında hemen kalkar.", "{name} reached Lv {n}!": "{name} Lv {n} oldu!",
});
