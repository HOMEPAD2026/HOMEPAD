// world-pet.js — pets: summoned from eggs (rolled on the server), one walks with you; rarity sets how strong its
// ability is (speed, collecting, luck, vigour, learning, guard).
//
//   The server (api/_world-shop.mjs PET) rolls the egg and keeps the list in worldOwn.pets; the game mirrors it
//   (mirror(own), like starterOwn) and shows a card for each new one. Pet XP = the knock-outs counted here
//   (rpg.x.petXp[species]) plus what duplicates gave on the server. Which pet is out and its name are local
//   (rpg.x.pet, rpg.x.petName); rpg.x.pg holds the reveal cards already shown. The three older companions (drone,
//   cat, Arc wisp) are species too: their achievement still opens them and world-quests.js createPet draws them.
//   An animal is one clone of kenney-pets.glb (the pack the decor loads: K.loadPack shares it), node-animated, no
//   shadow, no outline; its animation runs every frame within 26 m and every third frame beyond.
import { PET_SPECIES, PET_BY, PET_RARITY, PET_AB, petPower, petLevel, petNext, RARITY } from "./world-rpg-data.js";

export const PET_READY = true;
export const EGG_PRICE = 3000, PET_MAX = 30;
const HEIGHT = { giraffe: 1.55, elephant: 1.2, lion: 0.95, tiger: 0.95, polar: 1.0, cow: 1.0, bee: 0.55, fish: 0.55, crab: 0.5, caterpillar: 0.5, chick: 0.6, bunny: 0.7, penguin: 0.75 };
const rarityVar = (r) => `var(--rar-${r})`;

/// ctx: { THREE, K, planet, here(v), facing(), combat(), reduce, coarse, low, ver, legacy (createPet's), T, esc, rpg(), ach(),
///        save(), toast(), Snd, buy() → Promise<bool>, repaint(), onMods(m) }
export function createPets(ctx) {
  const { THREE, K, planet, here, facing, T, esc, reduce, legacy } = ctx;
  const lite = !!(ctx.coarse || ctx.low); // a phone or the low setting: no name plate over the pet
  const root = new THREE.Group(); root.name = "pet"; planet.add(root); // named: world-play.js farCull leaves it alone
  let server = { list: [], n: 0, pity: 0, fresh: [] }, M = { id: "", spd: 0, hp: 0, regen: 0, xp: 0, luck: 0, pull: 0, guard: 0 }, eggBusy = false, eggNote = ""; // eggNote: the payment's status line under the egg

  // ---------------- what you have ----------------
  const R = () => (ctx.rpg ? ctx.rpg() : null);
  const X = () => { const r = R(); if (!r) return null; const d = r.data(); d.x = d.x || {}; d.x.petXp = d.x.petXp || {}; return d.x; };
  const dup = () => new Map(server.list.map((p) => [p.s, Number(p.x) || 0]));
  const has = (id) => { const sp = PET_BY[id]; if (!sp) return false; if (dup().has(id)) return true; return !!(sp.need && ctx.ach().includes(sp.need)); };
  const owned = () => PET_SPECIES.filter((p) => has(p.id));
  const xpOf = (id) => ((X() || { petXp: {} }).petXp[id] || 0) + (dup().get(id) || 0);
  const lvOf = (id) => petLevel(xpOf(id));
  const nameOf = (id) => { const x = X(); return ((x && x.petName && x.petName[id]) || "").slice(0, 12); };
  const titleOf = (id) => T(PET_BY[id].name);
  /// the pet that's out: your pick, or the rarest you have; "none" leaves them at home
  function active() {
    const x = X(); if (!x || x.pet === "none") return "";
    const o = owned(); if (!o.length) return "";
    return (o.find((p) => p.id === x.pet) || o.reduce((a, b) => (b.r >= a.r ? b : a))).id;
  }
  function calc() {
    const id = active(), sp = id ? PET_BY[id] : null, v = sp ? petPower(sp, lvOf(id)) : 0, is = (a) => (sp && sp.ab === a ? v : 0);
    return { id, spd: is("speed"), hp: is("vigour"), regen: is("vigour") / 1000, xp: is("scholar"), luck: is("luck") / 100, pull: is("collector"), guard: is("guard") };
  }

  // ---------------- the animal: one clone of the shared pack ----------------
  let packP = null, packObj = null;
  const pack = () => (packP = packP || K.loadPack("/models/world/packs/kenney-pets.glb", ctx.ver).then((p) => (packObj = p)).catch(() => null));
  const me = new THREE.Vector3(), want = new THREE.Vector3(), last = new THREE.Vector3(), zapAt = new THREE.Vector3();
  let h = null, body = null, mixer = null, acts = {}, curAct = null, curId = "", tok = 0, plate = null, plateKey = "";
  let emoteT = 0, idleT = 0, stillT = 0, abT = 3, regT = 5, acc = 0, fc = 0, once = 0, heading = 0, curLv = 1;
  const meLast = new THREE.Vector3();
  function unmount() {
    tok++; if (mixer) mixer.stopAllAction(); mixer = null; acts = {}; curAct = null;
    if (plate) { plate.material.map && plate.material.map.dispose(); plate.material.dispose(); plate = null; plateKey = ""; }
    if (h) { root.remove(h); h = null; body = null; } curId = "";
  }
  async function mount(id) {
    const sp = PET_BY[id], t = ++tok; unmount(); tok = t;
    const p = await pack(); if (t !== tok || !p) return;
    const o = K.packClone(p, sp.m); if (!o) return;
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    o.position.set(-c.x, -b.min.y, -c.z); o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
    body = new THREE.Group(); body.add(o); body.scale.setScalar((HEIGHT[id] || 0.85) / Math.max(0.01, sz.y));
    h = new THREE.Group(); h.add(body); h.userData.h = (HEIGHT[id] || 0.85);
    here(me); h.position.set(me.x, me.y, me.z); root.add(h); curId = id;
    mixer = new THREE.AnimationMixer(body);
    for (const n of ["idle", "walk", "run", "eat", "dance", "gesture-positive"]) { const clip = p.clips.find((k) => k.name === sp.m + "/" + n); if (clip) { const a = mixer.clipAction(clip); if (n === "eat" || n === "gesture-positive") { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } acts[n] = a; } }
    mixer.addEventListener("finished", () => { once = 0; play(emoteT > 0 ? "dance" : "idle"); });
    play("idle"); dress();
  }
  function play(n) {
    const a = acts[n] || acts.idle; if (!a || a === curAct) return;
    a.reset().fadeIn(0.2).play(); if (curAct) curAct.fadeOut(0.2); curAct = a;
  }
  function dress() {
    if (!h) return;
    const key = curId + ":" + curLv + ":" + nameOf(curId);
    if (lite || key === plateKey) return;
    if (plate) { h.remove(plate); plate.material.map && plate.material.map.dispose(); plate.material.dispose(); }
    const sp = PET_BY[curId];
    plate = K.label(nameOf(curId) || titleOf(curId), { accent: RARITY[sp.r].color, size: 0.28, sub: "Lv " + curLv }); plate.position.y = h.userData.h + 0.4; plate.visible = false; h.add(plate); plateKey = key;
  }

  // ---------------- keeping the world in step ----------------
  let lv0 = 0, id0 = "", wantId = "";
  function sync() {
    const n = calc(), old = M; M = n;
    const id = n.id, sp = id ? PET_BY[id] : null, lv = id ? lvOf(id) : 1;
    if (sp && sp.m) { legacy.set(null); if (wantId !== id) { wantId = id; mount(id); } }
    else { if (wantId) { wantId = ""; unmount(); } legacy.set(sp ? { id, lv, name: nameOf(id) } : null); }
    curLv = lv; if (h) dress();
    if (id && id === id0 && lv > lv0 && lv0) emoteT = 1.6; // it grew: a little dance
    id0 = id; lv0 = lv;
    const stats = old.spd !== n.spd || old.hp !== n.hp;
    ctx.onMods(n, stats); // world-play.js: the XP and luck numbers, and rpg.refresh() when speed or HP changed
    reveal();
    return n;
  }
  function mirror(o) {
    const p = o && o.pets; if (!p || !Array.isArray(p.list)) return;
    server = { list: p.list.filter((q) => q && PET_BY[q.s]).slice(0, PET_MAX), n: Number(p.n) || 0, pity: Number(p.pity) || 0, fresh: Array.isArray(p.fresh) ? p.fresh : [] };
    sync(); if (ctx.repaint) ctx.repaint();
  }

  // ---------------- portraits: one small renderer, a few per frame, then let go ----------------
  const pics = {}, tried = new Set(); let rend = null, rendT = 0, fillP = Promise.resolve(), legacyPics = null;
  const fill = (ids) => (fillP = fillP.then(() => doFill(ids)));
  async function doFill(ids) {
    const todo = ids.filter((id) => !pics[id] && !tried.has(id)); if (!todo.length) return; todo.forEach((id) => tried.add(id));
    try {
      const need = todo.filter((id) => PET_BY[id].m), sp = todo.filter((id) => !PET_BY[id].m);
      if (sp.length) { try { legacyPics = legacyPics || legacy.portraits(); } catch { legacyPics = {}; } sp.forEach((id) => { pics[id] = legacyPics[id] || ""; }); }
      if (need.length) {
        const p = await pack(); if (!p) return;
        clearTimeout(rendT);
        if (!rend) { rend = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); rend.setSize(112, 112); rend.setPixelRatio(1); rend.outputColorSpace = THREE.SRGBColorSpace; }
        const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.6)); const dl = new THREE.DirectionalLight(0xffffff, 1.8); dl.position.set(2, 3, 4); sc.add(dl);
        const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
        for (let i = 0; i < need.length; i += 3) {
          for (const id of need.slice(i, i + 3)) {
            const o = K.packClone(p, PET_BY[id].m); if (!o) continue;
            const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), k = 1.2 / Math.max(0.01, s.y);
            const g = new THREE.Group(); o.position.set(-c.x, -c.y, -c.z); g.add(o); g.scale.setScalar(k); g.rotation.y = 0.55; sc.add(g);
            cam.position.set(0.8, 0.45, 2.3).multiplyScalar(Math.max(1, s.x * k / 1.0, s.z * k / 1.0)); cam.lookAt(0, -0.05, 0);
            rend.render(sc, cam); pics[id] = rend.domElement.toDataURL("image/png"); sc.remove(g);
          }
          await new Promise((r) => requestAnimationFrame(r)); // a few a frame: no hitch on a phone
        }
      }
    } catch { /* the pictures just stay empty */ }
    finally {
      clearTimeout(rendT); rendT = setTimeout(() => { if (rend) { rend.dispose(); rend.forceContextLoss(); rend = null; } }, 4000);
      if (ctx.repaint) ctx.repaint();
    }
  }
  const pic = (id) => pics[id] ? `<img src="${pics[id]}" alt="">` : "";

  // ---------------- the Character panel's Pets tab ----------------
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const bar = (n, of) => `<i class="wq-bar"><b style="width:${Math.min(100, (100 * n) / of)}%"></b></i>`;
  function abText(sp, lv) {
    const v = petPower(sp, lv);
    if (sp.ab === "guard") return sp.mode === "heal" ? T("Mends {v}% of your max HP every few seconds", { v: ((0.01 + 0.002 * lv) * v * 100).toFixed(1) }) : T("Zaps the nearest scammer for about {v}% of your attack", { v: Math.round(12 * (1 + 0.12 * (lv - 1)) * v) });
    return T(PET_AB[sp.ab].line, { v });
  }
  const abName = (sp) => (sp.ab === "guard" ? T("Guardian") : T(PET_AB[sp.ab].name));
  function html() {
    const x = X(); if (!x) return "";
    const own = owned(), act = active();
    fill(PET_SPECIES.map((p) => p.id));
    const left = Math.max(1, 10 - (server.pity || 0));
    const egg = `<div class="wq-egg"><span class="wq-egg-art" aria-hidden="true"></span><div><b>${esc(T("Pet egg"))}</b><small>${esc(T("Hatches a random companion, Common to Legendary. Duplicates turn into pet XP."))}</small><small class="wq-egg-pity">${esc(left <= 1 ? T("The next egg is Rare or better!") : T("A Rare or better pet within {n} eggs, guaranteed.", { n: left }))}${server.n ? " · " + esc(T("Eggs opened: {n}", { n: server.n })) : ""}</small></div><button type="button" class="wq-egg-go" data-pt="egg"${eggBusy ? " disabled" : ""}>${esc(eggBusy ? T("Waiting for your wallet…") : T("Summon egg"))}<small>${esc(fmtN(EGG_PRICE))} $ARCIRCLE</small></button>${eggNote ? `<p class="wa-status" role="status">${esc(eggNote)}</p>` : ""}</div>`;
    const rows = [...own].sort((a, b) => b.r - a.r || lvOf(b.id) - lvOf(a.id)).map((p) => {
      const xp = xpOf(p.id), lv = petLevel(xp), nx = petNext(lv), prev = lv > 1 ? petNext(lv - 1) : 0;
      return `<article class="wq-pet r${p.r} p-${p.id}${act === p.id ? " on" : ""}" style="--rc:${rarityVar(p.r)}"><span class="wq-pet-art" aria-hidden="true">${pic(p.id)}</span><div><b>${esc(nameOf(p.id) || titleOf(p.id))} <small>${esc(T("Lv {n}", { n: lv }))}</small></b><small class="wq-prar">${esc(T(PET_RARITY[p.r]))} · ${esc(abName(p))}${nameOf(p.id) ? " · " + esc(titleOf(p.id)) : ""}</small><small>${esc(abText(p, lv))}</small><span class="wq-petname"><input data-petname="${p.id}" maxlength="12" value="${esc(nameOf(p.id))}" placeholder="${esc(T("Give it a name"))}" autocomplete="off" spellcheck="false"><button type="button" data-pt="save:${p.id}">${esc(T("Save"))}</button></span>${lv < 10 ? `<small class="wq-petnext">${esc(T("Stronger every level, up to level 10"))}</small>` : ""}${nx ? bar(xp - prev, nx - prev) : `<small class="max">${esc(T("Fully grown"))}</small>`}</div><button type="button" data-pt="bring:${p.id}" aria-pressed="${act === p.id}">${esc(act === p.id ? T("With you") : T("Bring"))}</button></article>`;
    }).join("");
    const grid = PET_SPECIES.map((p) => { const got = has(p.id); return `<div class="wq-ptile r${p.r}${got ? "" : " off"}${act === p.id ? " on" : ""}" style="--rc:${rarityVar(p.r)}" title="${esc(got ? titleOf(p.id) + " · " + T(PET_RARITY[p.r]) : T("Not found yet"))}"><span aria-hidden="true">${pic(p.id)}</span><small>${esc(got ? titleOf(p.id) : "???")}</small></div>`; }).join("");
    return `<p class="wr-note">${esc(T("Companions hatch from eggs. One walks with you, helps with its ability and grows with every scammer knocked out beside it."))}</p>${egg}
      ${own.length ? `<div class="wq-pets">${rows}</div>${act ? `<p class="wq-petoff"><button type="button" data-pt="none">${esc(T("Leave companions at home"))}</button></p>` : ""}` : `<p class="wr-note">${esc(T("No companion yet. Summon an egg, or earn Drone, Cat and Arc Wisp with achievements."))}</p>`}
      <h4 class="wq-codex-sec">${esc(T("Collection"))} <small>${esc(T("{n} of {m}", { n: own.length, m: PET_SPECIES.length }))}</small></h4><div class="wq-pgrid">${grid}</div>
      <p class="wr-note">${esc(T("You can keep up to {n} pets. Odds: Common 60%, Uncommon 25%, Rare 10%, Epic 4%, Legendary 1%.", { n: PET_MAX }))}</p>`;
  }
  async function buyEgg() {
    if (eggBusy || !ctx.buy) return;
    eggBusy = true; ctx.repaint();
    eggNote = "";
    try { if (await ctx.buy((t) => { eggNote = t || ""; ctx.repaint(); })) eggNote = ""; } finally { eggBusy = false; ctx.repaint(); }
  }
  function click(b) {
    const a = String(b.dataset.pt || ""), x = X(); if (!a || !x) return false;
    if (a === "egg") { buyEgg(); return true; }
    if (a === "none") { x.pet = "none"; ctx.save(); sync(); return true; }
    const [k, id] = a.split(":");
    if (k === "bring" && PET_BY[id] && has(id)) { x.pet = id; ctx.save(); sync(); return true; }
    if (k === "save" && PET_BY[id] && has(id)) {
      const inp = b.parentElement.querySelector("input"), v = String((inp && inp.value) || "").replace(/[\u0000-\u001f<>"'`\\]/g, "").trim().slice(0, 12);
      x.petName = { ...(x.petName || {}), [id]: v }; ctx.save(); sync(); ctx.toast(v ? T("Your companion is called {x}", { x: v }) : T("Name cleared")); return true;
    }
    return false;
  }

  // ---------------- the reveal card for a new pet ----------------
  let showing = false;
  function reveal() {
    const x = X(); if (!x || showing) return;
    const seen = new Set(Array.isArray(x.pg) ? x.pg : []), fresh = server.fresh.filter((c) => c && c.gid && PET_BY[c.s] && !seen.has(c.gid)); if (!fresh.length) return;
    fresh.forEach((c) => seen.add(c.gid)); x.pg = [...seen].slice(-12); ctx.save();
    showing = true; (async () => { for (const c of fresh) await card(c); showing = false; })();
  }
  async function card(c) {
    await fill([c.s]);
    return new Promise((done) => {
      const sp = PET_BY[c.s], R0 = RARITY[sp.r], lv = lvOf(c.s);
      const el = document.createElement("div"); el.className = "wp-cbt wp-pc r" + sp.r; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wp-pc-h"); el.setAttribute("data-no-i18n", ""); el.style.setProperty("--rc", rarityVar(sp.r));
      el.innerHTML = `<div class="wp-cbt-card wp-pc-card"><div class="wp-cbt-top wp-pc-top" aria-hidden="true"><i class="wp-pc-rays"></i><span class="wp-pc-art">${pic(c.s)}</span></div><small>${esc(T(PET_RARITY[sp.r]))} · ${esc(abName(sp))}</small>
        <h2 id="wp-pc-h">${esc(c.dup ? T("Your {x} is stronger", { x: titleOf(c.s) }) : T("{x} joined you!", { x: titleOf(c.s) }))}</h2>
        <p>${esc(abText(sp, lv))}</p>
        ${c.dup ? `<p class="wp-pc-dup">${esc(T("Already yours: +{n} pet XP", { n: c.xp }))}</p>` : ""}
        <div class="wp-cbt-act"><button type="button" class="wp-cbt-bag">${esc(T("Bring it"))}</button><button type="button" class="wp-cbt-x">${esc(T("Close"))}</button></div></div>`;
      el.querySelector(".wp-pc-card").style.setProperty("border-color", R0.color);
      document.body.appendChild(el);
      try { ctx.Snd[sp.r >= 3 ? "level" : "win"] && ctx.Snd[sp.r >= 3 ? "level" : "win"](); } catch { /* sound off */ }
      const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); done(); };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
      document.addEventListener("keydown", onKey, true);
      el.querySelector(".wp-cbt-x").addEventListener("click", close);
      el.querySelector(".wp-cbt-bag").addEventListener("click", () => { const x = X(); if (x) { x.pet = c.s; ctx.save(); sync(); } close(); });
      el.addEventListener("click", (e) => { if (e.target === el) close(); });
      setTimeout(() => { const f = el.querySelector(".wp-cbt-bag"); f && f.focus(); }, 40);
    });
  }

  // ---------------- every frame ----------------
  const shortest = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function tick(dt, t, inHub) {
    legacy.tick(dt, t, inHub);
    if (!h) return;
    here(me); const f = facing(), sp = PET_BY[curId];
    want.set(me.x - Math.sin(f) * 1.5 + Math.cos(f) * 0.75, me.y, me.z - Math.cos(f) * 1.5 - Math.sin(f) * 0.75);
    last.copy(h.position);
    const d = h.position.distanceTo(want);
    if (d > 20) h.position.copy(want); else if (d > 0.3) h.position.lerp(want, 1 - Math.exp(-dt * (d > 4 ? 6 : 3)));
    h.position.y = me.y;
    const sped = last.distanceTo(h.position) / Math.max(1e-3, dt), moving = sped > 0.45;
    if (moving) heading = Math.atan2(h.position.x - last.x, h.position.z - last.z); else heading = f;
    h.rotation.y += shortest(heading - h.rotation.y) * Math.min(1, dt * 7);
    // which clip: a dance for an emote or a level, run or walk by speed, idle, and now and then a bite to eat
    idleT = moving ? 0 : idleT + dt;
    if (emoteT > 0) { emoteT -= dt; if (!once) play("dance"); }
    else if (!once) {
      if (moving) { play(sped > 3.4 && acts.run ? "run" : "walk"); const a = acts[sped > 3.4 && acts.run ? "run" : "walk"]; if (a) a.timeScale = Math.max(0.7, Math.min(1.8, sped / 1.7)); }
      else if (idleT > 9 && acts.eat && !reduce) { idleT = 0; once = 1; play("eat"); }
      else play("idle");
    }
    // within 26 m the animation runs every frame, beyond it every third
    if (Math.hypot(h.position.x - me.x, h.position.z - me.z) < 26) { mixer.update(dt + acc); acc = 0; } else { acc += dt; if (++fc % 3 === 0) { mixer.update(acc); acc = 0; } }
    if (plate) { stillT = Math.hypot(me.x - meLast.x, me.z - meLast.z) < 0.02 ? stillT + dt : 0; plate.visible = stillT > 1.2 || emoteT > 0; meLast.copy(me); }
    // the ability: a guard zaps or mends, a sturdy pet mends a little
    const c = ctx.combat();
    if (inHub && c) {
      zapAt.copy(h.position); zapAt.y += h.userData.h * 0.8;
      if (M.guard && sp.ab === "guard" && (abT -= dt) <= 0) {
        if (sp.mode === "heal") { abT = 6; c.heal && c.heal((0.01 + 0.002 * curLv) * M.guard, zapAt.clone()); }
        else { abT = Math.max(2.5, 5 - 0.25 * (curLv - 1)); c.petZap && c.petZap(zapAt, (1 + 0.12 * (curLv - 1)) * M.guard); }
      }
      if (M.regen && (regT -= dt) <= 0) { regT = 5; c.heal && c.heal(M.regen, zapAt.clone()); }
    }
  }

  return {
    sync, mirror, html, click, tick, fill,
    mods: () => M, active, title: titleOf, level: lvOf,
    /// the active pet's id once it's drawn
    id: () => (h ? curId : legacy.visible() ? legacy.id() : null),
    visible: () => !!h || legacy.visible(),
    /// how far a collector pulls street items and opens chests (m); 0 for the others
    pull: () => (M.pull && (h || legacy.visible()) ? M.pull : 0),
    emote() { emoteT = 1.6; legacy.emote(); },
    thumb: (id) => pics[id] || "",
    owned: () => owned().map((p) => p.id),
    debug: () => ({ id: curId, active: active(), mods: M, anim: curAct && curAct.getClip().name, pos: h && h.position.toArray(), list: server.list, fresh: server.fresh, pics: Object.keys(pics).length }),
  };
}
