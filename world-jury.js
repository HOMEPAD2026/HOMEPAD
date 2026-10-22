// world-jury.js — Jurassic World's way-finding and the moments round a fight (b-jy, the owner's "do all of it" list),
// handed the land by world-jurassic.js:
//   · the pointer: one arrow for what you should be walking to — the boss hour's boss first, else your goal's next thing
//     (a tree, a rock, a fern, your camp, a raptor …). On screen it's a marker over the target with the distance; off
//     screen it sits on the screen's edge and points the way. Players: "I can't find the boss", "what do I do first?"
//   · the reveal: the first time an enraged boss is close, the camera turns to it for a moment and the ground shakes
//   · back on your feet: after a knock-out, a card that says what you kept and offers the way back (your camp, armour)
export function createJurY(Y) {
  const { THREE, T, esc, ctx } = Y;
  const Snd = ctx.Snd || {}, reduce = !!ctx.reduce;
  const me = () => Y.me();
  const root = Y.root || document.body;

  // ---------------- the pointer ----------------
  const layer = document.createElement("div"); layer.className = "wz-guide"; layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `<div class="wz-gd" hidden><i class="wz-gd-a"></i><span class="wz-gd-t"></span></div>`; root.appendChild(layer);
  const gd = layer.firstChild, gdT = gd.querySelector(".wz-gd-t"), gdA = gd.querySelector(".wz-gd-a");
  // what each goal step walks you to (world-jursurv.js goal(): [text, how far, step])
  const NODE_FOR = { wood: ["tree", "palm"], stone: ["rock"], fiber: ["fern", "bush"], flint: ["rock"], cu: ["rock"], hardwood: ["ancient"] };
  let tgt = null, tgtAt = 0, lastKey = "", off = false;
  try { off = localStorage.getItem("arc.jur.guide") === "off"; } catch { /* on */ }
  const nearest = (list, px, pz, max = 400) => { let b = null, bd = max; for (const o of list) { const d = Math.hypot(o.x - px, o.z - pz); if (d < bd) { bd = d; b = o; } } return b; };
  function nodeOf(kinds, px, pz) { return nearest(Y.nodes().filter((n) => !n.down && kinds.includes(n.kind)), px, pz); }
  function dinoOf(kind, px, pz) { return nearest(Y.dinos().filter((o) => o.alive && o.kind === kind && o.g && o.g.visible !== false), px, pz, 600); }
  function campOf(px, pz) { const h = Y.surv && Y.surv.homeSpot && Y.surv.homeSpot(); if (h) return { x: h.x, z: h.z, camp: 1 }; const s = (Y.surv && Y.surv.campSpots && Y.surv.campSpots()) || []; const b = nearest(s.map(([x, z]) => ({ x, z })), px, pz, 999); return b ? { ...b, camp: 1 } : null; }
  // the target and what it says
  function pickTarget() {
    const { px, pz } = me(), b = Y.bossNow && Y.bossNow();
    if (b && b.alive) return { o: b, icon: "🔥", name: T(b.kind === "titan" ? "Thornback Titan" : "Alpha Raptor"), boss: true };
    if (off || !Y.surv || !Y.surv.goalNow) return null;
    const [, , step] = Y.surv.goalNow(), have = (m) => (Y.surv.have ? Y.surv.have(m) : 0);
    const nd = (m, icon, name) => { const o = nodeOf(NODE_FOR[m], px, pz); return o ? { o, icon, name: T(name) } : null; };
    switch (step) {
      case 0: return nd("wood", "🪵", "Tree");
      case 1: if (have("wood") < 3) return nd("wood", "🪵", "Tree"); if (have("stone") < 2) return nd("stone", "🪨", "Rock"); if (have("fiber") < 2) return nd("fiber", "🌿", "Fern"); return { pack: true };
      case 3: if (have("flint") < 3) return nd("flint", "🪨", "Rock"); /* falls through: the workbench */
      case 2: case 4: case 6: case 8: case 9: { const c = campOf(px, pz); return c ? { o: c, icon: "🏕️", name: T("Your camp") } : null; }
      case 5: { const o = dinoOf("raptor", px, pz); return o ? { o, icon: "🦖", name: T("Raptor") } : null; }
      case 7: return nd("cu", "🪨", "Rock");
      case 10: return nd("hardwood", "🌳", "Ancient tree");
      case 11: { const o = dinoOf("trike", px, pz); return o ? { o, icon: "🦕", name: T("Triceratops") } : null; }
      case 12: { const o = dinoOf("alpha", px, pz); return o ? { o, icon: "🦖", name: T("Alpha Raptor") } : null; }
      case 13: { const o = dinoOf("titan", px, pz); return o ? { o, icon: "🦖", name: T("Thornback Titan") } : null; }
      default: return null;
    }
  }
  const v = new THREE.Vector3();
  let packHint = false;
  function tickPointer() {
    const w = performance.now(); if (w - tgtAt > 500) { tgtAt = w; tgt = pickTarget();
      const ph = !!(tgt && tgt.pack); if (ph !== packHint) { packHint = ph; const pb = root.querySelector(".wz-packbtn"); if (pb) pb.classList.toggle("wz-hint", ph); } }
    const cam = Y.cam(), { px, pz, down } = me();
    if (!tgt || !tgt.o || down || !cam || (Y.busy && Y.busy())) { if (!gd.hidden) gd.hidden = true; return; }
    const o = tgt.o, d = Math.hypot(o.x - px, o.z - pz);
    if (d < (tgt.boss ? 14 : 7)) { if (!gd.hidden) gd.hidden = true; return; }
    const h = (o.R && o.R.h) || (o.camp ? 2.5 : 2.2);
    v.set(o.x, (o.y ?? Y.height(o.x, o.z)) + h + 0.6, o.z).project(cam);
    let x = v.x, y = v.y; const behind = v.z > 1; if (behind) { x = -x; y = -y; }
    const X0 = Y.coarse ? 0.66 : 0.8, YT = 0.6, YB = -0.48, /* (the label is centred on the point: kept clear of the edges) */ onScreen = !behind && Math.abs(x) < X0 && y < YT && y > YB;
    if (!onScreen) { const s = Math.min(Math.abs(x) > 1e-4 ? X0 / Math.abs(x) : 1e9, y > 1e-4 ? YT / y : y < -1e-4 ? YB / y : 1e9); x *= s; y *= s; if (behind && Math.hypot(x, y) < 0.3) y = YB; }
    const key = (tgt.boss ? "b" : "g") + (onScreen ? 1 : 0) + tgt.icon + tgt.name + Math.round(d);
    if (key !== lastKey) { lastKey = key; gdT.innerHTML = `<b>${tgt.icon} ${esc(tgt.name)}</b><small>${Math.round(d)} m</small>`; gd.classList.toggle("boss", !!tgt.boss); gd.classList.toggle("on", onScreen); }
    gd.hidden = false; gd.style.left = ((x + 1) / 2 * 100).toFixed(2) + "%"; gd.style.top = ((1 - y) / 2 * 100).toFixed(2) + "%";
    gdA.style.transform = onScreen ? "" : `rotate(${(Math.atan2(-y, x) * 180 / Math.PI + 90).toFixed(1)}deg)`; // (the arrow is drawn pointing up)
  }

  // ---------------- the reveal: the camera turns to an enraged boss the first time it's close ----------------
  const revealed = new Set(); let turn = null;
  function tickReveal() {
    const b = Y.bossNow && Y.bossNow(), { px, pz, down } = me();
    if (b && b.alive && !down && !revealed.has(b.kind) && Math.hypot(b.x - px, b.z - pz) < 70) {
      revealed.add(b.kind); const name = T(b.kind === "titan" ? "Thornback Titan" : "Alpha Raptor");
      if (Y.cutin) Y.cutin("⚠️", name, T("It's here — hunt it together!")); if (Snd.roar) Snd.roar(); if (Y.shake) Y.shake(0.35);
      if (!reduce && Y.camYaw && ctx.setView) { const to = Math.atan2(px - b.x, pz - b.z), from = Y.camYaw(); let dd = to - from; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); turn = { from, dd, t0: performance.now() }; }
    }
    if (turn) { const k = Math.min(1, (performance.now() - turn.t0) / 900), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; ctx.setView({ yaw: turn.from + turn.dd * e }); if (k >= 1) turn = null; }
  }

  // ---------------- back on your feet ----------------
  let card = null, cardT = 0, lastW = 0;
  function recovered(where) {
    if (card) card.remove(); card = document.createElement("div"); card.className = "wz-back"; card.setAttribute("role", "status");
    const home = Y.surv && Y.surv.homeSpot && Y.surv.homeSpot(), tl = (Y.surv && Y.surv.tools && Y.surv.tools()) || {}, by = Y.koBy ? Y.koBy() : "";
    card.innerHTML = `<b>💪 ${esc(T("Back on your feet"))}</b><p>${esc(T("Your pack, tools and camp are all still yours."))}${by ? " " + esc(T("Watch out for the {d}.", { d: by })) : ""}</p>
      <div>${home && where !== "camp" ? `<button type="button" data-b="camp">🏕️ ${esc(T("Go to my camp"))}</button>` : ""}${!tl.armor ? `<button type="button" data-b="armor">🛡️ ${esc(T("Make armour"))}</button>` : ""}<button type="button" data-b="x">${esc(T("Keep going"))}</button></div>`;
    card.addEventListener("click", (e) => { const b = e.target.closest("[data-b]"); if (!b) return;
      if (b.dataset.b === "camp" && home && Y.walk) Y.walk(home.x + 3, home.z + 3);
      if (b.dataset.b === "armor" && Y.surv && Y.surv.openTab) Y.surv.openTab("make");
      hideCard(); });
    root.appendChild(card); cardT = performance.now();
  }
  function hideCard() { if (card) { card.remove(); card = null; } }

  // ---------------- b-jy3: the other hunters here, pings, the boss call, the MVP card ----------------
  const peers = new Map(); // id → { g, tag, x, z, tx, tz, f, at, n, lv, hp }
  let hereW = 0, pingQ = 0, hereBusy = false, myPing = null;
  const TINT = { bot: 0x8fd6ff, male: 0x7fe0b0, female: 0xffa8d0, arc: 0x9ff3ff };
  function figure(c, name, lv) {
    const g = new THREE.Group(), tint = TINT[String(c).split("-")[0]] || TINT.bot;
    const mat = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.55, transparent: true, opacity: 0.62, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 4, 10), mat); body.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), mat); head.position.y = 1.62;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 6, 24), new THREE.MeshBasicMaterial({ color: 0xbff8ff })); halo.rotation.x = Math.PI / 2; halo.position.y = 2.02;
    g.add(body, head, halo);
    let tag = null; if (ctx.K && ctx.K.label) { tag = ctx.K.label(`${name || T("Hunter")} · Lv ${lv}`, { accent: "#" + new THREE.Color(tint).getHexString(), size: 0.48 }); tag.position.y = 2.6; g.add(tag); }
    Y.scene.add(g); return { g, tag, body };
  }
  function setPeers(list) {
    const seen = new Set();
    for (const y of list || []) { if (!y || !y.id) continue; seen.add(y.id); let p = peers.get(y.id);
      if (!p) { const f = figure(y.c, y.n, y.lv); p = { ...f, x: y.x, z: y.z }; peers.set(y.id, p); if (Y.ring) Y.ring(y.x, y.z); }
      if (p.n !== y.n || p.lv !== y.lv) { p.n = y.n; p.lv = y.lv; if (p.tag) { p.g.remove(p.tag); p.tag = ctx.K && ctx.K.label ? ctx.K.label(`${y.n || T("Hunter")} · Lv ${y.lv}`, { accent: "#9ff3ff", size: 0.48 }) : null; if (p.tag) { p.tag.position.y = 2.6; p.g.add(p.tag); } } }
      p.tx = y.x; p.tz = y.z; p.f = y.f || 0; p.hp = y.hp; p.at = performance.now();
      if (y.pk && y.pa != null && y.pa < 9000) { const at = Date.now() - y.pa; if (!(p.pingAt && Math.abs(at - p.pingAt) < 3000)) { p.pingAt = at; showPing(y.px ?? y.x, y.pz ?? y.z, y.pk, y.n); } } } // (the same ping comes back with each poll: shown once)
    for (const [id, p] of peers) if (!seen.has(id)) { Y.scene.remove(p.g); peers.delete(id); }
  }
  async function postHere() {
    const s = ctx.sess && ctx.sess(); if (!s || hereBusy || !ctx.post) return; hereBusy = true;
    const { px, pz, face } = me(), v = ctx.vitals ? ctx.vitals() : null, pk = pingQ; pingQ = 0;
    try { const r = await ctx.post({ action: "world-jur-here", ...s, x: px, z: pz, f: face, hp: v && v.max ? Math.round(100 * v.hp / v.max) : 100, c: ctx.char ? ctx.char() : "bot", lv: ctx.level ? ctx.level() : 1, ...(pk ? { pk } : {}) });
      if (r && r.ok && r.j) setPeers(r.j.list); } catch (e) { console.warn("jury here", e); } finally { hereBusy = false; }
  }
  function tickPeers(dt) {
    const w = performance.now(); if (w - hereW > (pingQ ? 300 : 4000)) { hereW = w; postHere(); }
    for (const p of peers.values()) { const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (d > 30) { p.x = p.tx; p.z = p.tz; } else if (d > 0.05) { const k = Math.min(1, dt * Math.max(1.2, d / 3.5)); p.x += dx * k; p.z += dz * k; }
      p.g.position.set(p.x, Y.height(p.x, p.z), p.z); p.g.rotation.y = d > 0.3 ? Math.atan2(dx, dz) : p.f; if (p.body) p.body.position.y = 0.8 + (d > 0.3 ? Math.abs(Math.sin(w / 140)) * 0.08 : 0); }
  }
  // a ping: a pillar of light where it was put, its word over it for a few seconds, a sound; the minimap pulses there
  const PING = { 1: ["🦖", "Dinosaur here!", 0xff5a5a], 2: ["🆘", "Help me!", 0xffb648], 3: ["🔥", "Gather here", 0x5ff0d0] };
  const pings = [];
  function showPing(x, z, k, who) {
    const P = PING[k]; if (!P) return; if (Snd.ping) Snd.ping(k === 2 ? "help" : k === 3 ? "gather" : "here");
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: P[2], transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const y0 = Y.height(x, z); m.position.set(x, y0 + 7, z); Y.scene.add(m);
    let tag = null; if (ctx.K && ctx.K.label) { tag = ctx.K.label(`${P[0]} ${T(P[1])}`, { accent: "#" + new THREE.Color(P[2]).getHexString(), size: 0.8, sub: who || "" }); tag.position.set(x, y0 + 4.2, z); Y.scene.add(tag); }
    pings.push({ m, tag, x, z, k, t: 0 }); if (pings.length > 6) dropPing(0);
    if (who) Y.toast(`${P[0]} <b>${esc(who)}</b> ${esc(T(P[1]))}`);
  }
  function dropPing(i) { const p = pings[i]; Y.scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); if (p.tag) Y.scene.remove(p.tag); pings.splice(i, 1); }
  function tickPings(dt) { for (let i = pings.length - 1; i >= 0; i--) { const p = pings[i]; p.t += dt; p.m.material.opacity = 0.45 * (1 - p.t / 10) * (0.75 + 0.25 * Math.sin(p.t * 6)); if (p.t > 10) dropPing(i); } }
  // the ping button and its three words
  const pb = document.createElement("button"); pb.type = "button"; pb.className = "wz-pingbtn"; pb.innerHTML = `<span aria-hidden="true">📍</span><b>${esc(T("Ping"))}</b>`;
  const pw = document.createElement("div"); pw.className = "wz-pingw"; pw.hidden = true; pw.setAttribute("role", "menu");
  pw.innerHTML = Object.entries(PING).map(([k, [ic, w]]) => `<button type="button" role="menuitem" data-pk="${k}"><i>${ic}</i>${esc(T(w))}</button>`).join("");
  { const top = root.querySelector(".wz-top"); (top || root).appendChild(pb); root.appendChild(pw); }
  pb.addEventListener("click", () => { if (!(ctx.sess && ctx.sess())) { Y.toast(esc(T("Sign in to ping the hunters round you"))); return; } pw.hidden = !pw.hidden; });
  pw.addEventListener("click", (e) => { const b = e.target.closest("[data-pk]"); if (!b) return; const k = Number(b.dataset.pk), { px, pz } = me(); pingQ = k; pw.hidden = true; myPing = { k, at: performance.now() }; showPing(px, pz, k, ""); });

  // the boss call: five minutes before the boss hour (and when it starts), a card with the way there
  const called = new Set(); let call = null;
  function bossSpot(kind) { const b = Y.bossObj && Y.bossObj(kind); return b ? { x: b.home ? b.home.x : b.x, z: b.home ? b.home.z : b.z } : null; }
  function showCall(B, soon) {
    if (call) call.remove(); call = document.createElement("div"); call.className = "wz-call"; call.setAttribute("role", "status");
    const name = T(B.kind === "titan" ? "Thornback Titan" : "Alpha Raptor");
    call.innerHTML = `<b>🔥 ${esc(soon ? T("{b} wakes in 5 minutes", { b: name }) : T("{b} is enraged — boss hour!", { b: name }))}</b><p>${esc(T("Hunt it together: 10 hits each for a hunter's share."))}</p><div><button type="button" data-c="go">🏃 ${esc(T("Take me there"))}</button><button type="button" data-c="x">${esc(T("Later"))}</button></div>`;
    call.addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (!b) return; if (b.dataset.c === "go") goBoss(B.kind); call.remove(); call = null; });
    root.appendChild(call); if (Snd.horn) Snd.horn(); setTimeout(() => { if (call) { call.remove(); call = null; } }, 20000);
  }
  function goBoss(kind) { const s = bossSpot(kind); if (!s || !Y.walk) return; const a = Math.random() * 6.283; Y.walk(s.x + Math.cos(a) * 26, s.z + Math.sin(a) * 26); if (Y.cutin) Y.cutin("🔥", T(kind === "titan" ? "Thornback Titan" : "Alpha Raptor"), T("Hunt it together!")); }
  function tickCall() {
    const B = Y.bossState && Y.bossState(); if (!B || !B.start) return; const left = B.start - (B.now + (Date.now() - (B.at || Date.now())));
    if (!B.on && left > 0 && left < 5 * 60e3 && !called.has(B.id + ":soon")) { called.add(B.id + ":soon"); showCall(B, true); }
    if (B.on && !B.down && !called.has(B.id + ":on")) { called.add(B.id + ":on"); called.add(B.id + ":soon"); const { px, pz } = me(), s = bossSpot(B.kind); if (!s || Math.hypot(s.x - px, s.z - pz) > 50) showCall(B, false); }
  }
  // the MVP card when the boss falls: the top hitters, who landed the last blow, your own hits; the hero cheers
  const mvpShown = new Set(); let mvp = null;
  function tickMvp() {
    const B = Y.bossState && Y.bossState(); if (!B || !B.on || !B.down || mvpShown.has(B.id)) return; mvpShown.add(B.id);
    const top = (B.top || []).slice(0, 3), mine = (B.mine && B.mine.n) || 0, by = (B.top || []).find((x) => x.id === B.by);
    if (mvp) mvp.remove(); mvp = document.createElement("div"); mvp.className = "wz-mvp"; mvp.setAttribute("role", "status");
    mvp.innerHTML = `<small>${esc(T("BOSS DOWN"))}</small><b>${esc(T(B.kind === "titan" ? "Thornback Titan" : "Alpha Raptor"))}</b>
      <ol>${top.map((x, i) => `<li><i>${["🥇", "🥈", "🥉"][i]}</i><span>${esc(x.name || x.id)}</span><em>${x.n.toLocaleString("en-US")} ${esc(T("hits"))}</em></li>`).join("") || `<li><span>${esc(T("{n} hunters", { n: B.hunters || 0 }))}</span></li>`}</ol>
      ${by || B.by ? `<p>🗡️ ${esc(T("Last hit: {n}", { n: (by && by.name) || B.by }))}</p>` : ""}<p class="me">${esc(T("Your hits: {n}", { n: mine }))}${mine >= ((B.mine && B.mine.need) || 10) ? " · " + esc(T("a hunter's share is yours")) : ""}</p>`;
    root.appendChild(mvp); if (Y.cheer) Y.cheer(); if (ctx.confetti) try { ctx.confetti(); } catch { /* extra */ } if (Snd.level) Snd.level();
    setTimeout(() => { if (mvp) { mvp.classList.add("out"); setTimeout(() => { if (mvp) { mvp.remove(); mvp = null; } }, 500); } }, 6500);
  }

  // ---------------- b-jy7: someone's camp you walk into: its card (likes, notes), a like and a note from the list ----------------
  const NOTES = ["Lovely camp!", "Great build!", "Thanks for the fire!", "Hunt together soon?", "Watch out for raptors!", "See you at the boss hour!"];
  const visited = new Set(); let campCard = null, campW = 0;
  async function showCamp(c) {
    let info = null; try { const r = await fetch("/api/social?world=jur-camp&slot=" + c.slot, { cache: "no-store" }); if (r.ok) info = await r.json(); } catch { /* the card waits */ }
    if (!info || !info.ok) return; if (campCard) campCard.remove(); campCard = document.createElement("div"); campCard.className = "wz-campcard"; campCard.setAttribute("role", "dialog");
    const paint = (i) => { campCard.innerHTML = `<button type="button" class="x" data-k="x" aria-label="${esc(T("Close"))}">✕</button><b>🏕️ ${esc(T("{w}'s camp", { w: i.name || i.owner }))}</b><small>👍 ${i.likes} · ${esc(T("{n} living here", { n: i.members }))}</small>
      <ul>${(i.notes || []).slice(0, 3).map((n) => `<li><b>${esc(n.n || T("Hunter"))}</b> ${esc(T(NOTES[n.t] || ""))}</li>`).join("") || `<li class="none">${esc(T("No notes yet — be the first"))}</li>`}</ul>
      <div class="acts"><button type="button" data-k="like">👍 ${esc(T("Like"))}</button><button type="button" data-k="note">✍️ ${esc(T("Leave a note"))}</button></div><div class="notes" hidden>${NOTES.map((n, k) => `<button type="button" data-n="${k}">${esc(T(n))}</button>`).join("")}</div>`; };
    paint(info);
    campCard.addEventListener("click", async (e) => { const b = e.target.closest("button"); if (!b) return; const s = ctx.sess && ctx.sess();
      if (b.dataset.k === "x") { campCard.remove(); campCard = null; return; }
      if (!s) { Y.toast(esc(T("Sign in to like and leave notes"))); return; }
      if (b.dataset.k === "note") { campCard.querySelector(".notes").hidden = false; return; }
      if (b.dataset.k === "like") { const r = await ctx.post({ action: "world-jur-like", ...s, slot: c.slot }); if (r && r.ok) { info.likes = r.j.likes; paint(info); if (Snd.pick) Snd.pick(); } else Y.toast(esc(String((r && r.j && r.j.error) || T("Couldn't like it")))); return; }
      if (b.dataset.n != null) { const r = await ctx.post({ action: "world-jur-note", ...s, slot: c.slot, t: Number(b.dataset.n) }); if (r && r.ok) { info.notes = r.j.notes; paint(info); if (Snd.pick) Snd.pick(); } else Y.toast(esc(String((r && r.j && r.j.error) || T("Couldn't leave a note")))); } });
    root.appendChild(campCard); setTimeout(() => { if (campCard && !campCard.matches(":hover")) { campCard.remove(); campCard = null; } }, 25000);
  }
  function tickCamp() {
    const w = performance.now(); if (w - campW < 1000 || !Y.surv || !Y.surv.campAt) return; campW = w; const { px, pz } = me(), c = Y.surv.campAt(px, pz);
    if (c && !c.mine && !visited.has(c.slot)) { visited.add(c.slot); showCamp(c); }
  }
  // b-jy5: the top row stacks itself — the boss bar, the boss call and the MVP card move down past whatever else is up
  // there on this screen (the egg chip, the dinosaur's card, the clock row), instead of covering it
  let unW = 0;
  function unstack() {
    const w = performance.now(); if (w - unW < 600) return; unW = w;
    const others = [...root.querySelectorAll(".wz-top, .wz-foe:not([hidden]), .wz-call, .wz-back")].concat([...document.querySelectorAll(".wd-chip, .wd-egg, .wp-hud-l")]).filter((e) => e.offsetParent !== null);
    for (const el of root.querySelectorAll(".wz-bossbar:not([hidden]), .wz-mvp")) {
      if (el.dataset.dy == null) el.dataset.dy = "0"; let dy = Number(el.dataset.dy) || 0; el.style.marginTop = "0px"; const r = el.getBoundingClientRect(); if (!r.height || r.top > innerHeight * 0.5) { el.dataset.dy = "0"; continue; }
      dy = 0; for (const o of others) { if (o === el || o.contains(el)) continue; const q = o.getBoundingClientRect(); if (q.right > r.left && q.left < r.right && q.bottom > r.top + dy && q.top < r.bottom + dy) dy = Math.max(dy, q.bottom - r.top + 6); }
      const z = parseFloat(getComputedStyle(el).zoom) || 1; el.dataset.dy = String(dy); el.style.marginTop = dy ? Math.round(dy / z) + "px" : "";
    }
  }
  return {
    peers: () => [...peers.values()].map((p) => ({ x: p.x, z: p.z })),
    pings: () => pings.map((p) => ({ x: p.x, z: p.z, k: p.k })),
    goBoss,
    /// the dinosaur the see-through keeps clear besides the one you're on: the enraged boss when it's close
    focus() { const b = Y.bossNow && Y.bossNow(), { px, pz } = me(); return b && b.alive && Math.hypot(b.x - px, b.z - pz) < 60 ? b : null; },
    guide(on) { off = !on; try { localStorage.setItem("arc.jur.guide", on ? "on" : "off"); } catch { /* this visit */ } tgtAt = 0; },
    recovered,
    tick() {
      try { tickPointer(); } catch (e) { console.warn("jury pointer", e); gd.hidden = true; }
      try { tickReveal(); } catch (e) { console.warn("jury reveal", e); turn = null; }
      try { tickPeers(Math.min(0.1, Math.max(0, (performance.now() - (lastW || performance.now())) / 1000))); tickPings(Math.min(0.1, Math.max(0, (performance.now() - (lastW || performance.now())) / 1000))); } catch (e) { console.warn("jury peers", e); }
      lastW = performance.now();
      try { tickCall(); tickMvp(); } catch (e) { console.warn("jury boss", e); }
      try { unstack(); } catch { /* layout only */ }
      try { tickCamp(); } catch (e) { console.warn("jury camp", e); }
      if (card && performance.now() - cardT > 14000) hideCard();
    },
    stop() { visited.clear(); if (campCard) { campCard.remove(); campCard = null; } for (const p of peers.values()) Y.scene.remove(p.g); peers.clear(); while (pings.length) dropPing(0); pw.hidden = true; if (call) { call.remove(); call = null; } if (mvp) { mvp.remove(); mvp = null; } hereW = 0;
      gd.hidden = true; turn = null; hideCard(); revealed.clear(); const pb = root.querySelector(".wz-packbtn"); if (pb) pb.classList.remove("wz-hint"); packHint = false; },
    debug: () => ({ peers: peers.size, pingsNow: pings.length, called: [...called], mvp: [...mvpShown], tgt: tgt ? (tgt.pack ? "pack" : (tgt.boss ? "boss:" : "") + tgt.name + "@" + Math.round(tgt.o.x) + "," + Math.round(tgt.o.z)) : null, shown: !gd.hidden, on: gd.classList.contains("on"), revealed: [...revealed], off }),
  };
}
