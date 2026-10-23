// world-studio.js — ARCIRCLE Studio Lite (AD-City 3, the owner's call 2026-10-23), opened from Nexus City's ARCIRCLE Studio.
// Make a game from a template (Sky Runner now; Arena / Puzzle / Defense listed as coming), with your agent's help (it
// drafts the settings from your words), test it, save it, publish it to the Creator Arcade, and play everyone's games.
// A game is numbers on a template (world-studio-gen.js, the server's own copy): the level is built from them, seeded,
// so it plays the same for everyone. What's kept and counted is the server's (api/_world-studio.mjs); nothing pays ARCL.
//   the window   Create (templates, the agent's draft, the settings, test / save / publish) · My games · Arcade
//   the runner   its own scene drawn instead of the town (st.view / st.solo, like the Game Village's games): three lanes,
//                your hero runs (sprint), jumps the gaps (jump), slides under lasers (dodge), switches lanes past walls,
//                grabs coins; three hearts; the finish arch; a result card (score, your best, your place)
import { TEMPLATES, THEMES, LENS, LANES, clampSpec, genLevel, scoreOf, speedOf } from "./world-studio-gen.js";

/// ctx: { THREE, K, st, T, esc, toast, Snd, reduce, low, coarse, sess, post, signIn, makeHero(), agentName(), onOpen, onClose }
export function createStudio(ctx) {
  const { THREE, T, esc } = ctx;
  let el = null, tab = "make", spec = clampSpec({ seed: 1 + Math.floor(Math.random() * 99999) }), editId = "", mine = [], arcade = [], busy = false, playing = null, lastRun = null, aiNote = "";
  const wallet = () => { const s = ctx.sess(); return s ? String(s.wallet).toLowerCase() : ""; };
  const hex = (c) => "#" + c.toString(16).padStart(6, "0");
  async function act(body) {
    if (!ctx.sess()) { try { await ctx.signIn(); } catch { return null; } }
    const s = ctx.sess(); if (!s) return null;
    try { return await ctx.post({ ...body, wallet: s.wallet, issued: s.issued, signature: s.signature }); } catch { return { ok: false, j: { error: T("No connection — try again") } }; }
  }
  const fail = (r) => { const e = r && r.j && r.j.error; ctx.toast(e ? (r.j.closed ? "🚧 " + T("Being built") : esc(e)) : T("Couldn't open it — try again")); };
  async function load() {
    try { const r = await fetch("/api/social?world=studio-arcade", { cache: "no-store" }); if (r.ok) arcade = (await r.json()).games || []; } catch { /* the next look */ }
    const w = wallet(); if (w) try { const r = await fetch("/api/social?world=studio-mine&wallet=" + w, { cache: "no-store" }); if (r.ok) mine = (await r.json()).games || []; } catch { /* the next look */ }
    if (el && !el.hidden) paint();
  }

  // ---------------- the window ----------------
  function shell() {
    if (el) return el; el = document.createElement("div"); el.className = "wst"; el.hidden = true; document.body.appendChild(el);
    el.addEventListener("click", onClick); el.addEventListener("input", onInput);
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    return el;
  }
  function open(t) { shell(); if (t) tab = t; el.hidden = false; paint(); load(); if (ctx.onOpen) ctx.onOpen(); }
  function close() { if (el) el.hidden = true; if (ctx.onClose) ctx.onClose(); }
  const shown = () => !!el && !el.hidden;
  const slider = (k, lab, max, min = 0) => `<label class="wst-sl"><span>${esc(T(lab))} <b>${spec[k]}</b></span><input type="range" min="${min}" max="${max}" step="1" value="${spec[k]}" data-k="${k}"></label>`;
  function paintMake() {
    const th = THEMES[spec.theme], tpl = Object.entries(TEMPLATES).map(([id, t]) => `<button type="button" class="wst-tpl${id === spec.tpl ? " on" : ""}${t.open ? "" : " soon"}" ${t.open ? `data-tpl="${id}"` : "disabled"}><i aria-hidden="true">${{ runner: "🏃", arena: "⚔️", puzzle: "🧩", defense: "🛡️" }[id]}</i><b>${esc(T(t.name))}</b>${t.open ? "" : `<small>${esc(T("Coming soon"))}</small>`}</button>`).join("");
    const L = genLevel(spec);
    return `<div class="wst-tpls">${tpl}</div>
      <div class="wst-ai"><b>✨ ${esc(T("Ask {n} to draft it", { n: ctx.agentName() || T("your agent") }))}</b><div class="wst-airow"><input class="wst-aiin" maxlength="240" placeholder="${esc(T("e.g. a fast jungle run with lots of coins"))}"><button type="button" class="wst-go" data-ai ${busy ? "disabled" : ""}>${esc(T("Draft"))}</button></div>${aiNote ? `<small class="wst-ainote">${esc(aiNote)}</small>` : ""}</div>
      <label class="wst-title"><span>${esc(T("Title"))}</span><input class="wst-tin" maxlength="24" value="${esc(spec.title)}"></label>
      <div class="wst-row"><span>${esc(T("Theme"))}</span><div class="wst-chips">${Object.entries(THEMES).map(([id, t]) => `<button type="button" data-theme="${id}" class="${id === spec.theme ? "on" : ""}" style="--c:${hex(t.edge)};--b:${hex(t.sky)}">${esc(T(t.name))}</button>`).join("")}</div></div>
      <div class="wst-row"><span>${esc(T("Length"))}</span><div class="wst-chips">${LENS.map((s) => `<button type="button" data-len="${s}" class="${s === spec.len ? "on" : ""}">${s}s</button>`).join("")}</div></div>
      <div class="wst-sls">${slider("speed", "Speed", 5, 1)}${slider("coins", "Coins", 5)}${slider("walls", "Walls", 5)}${slider("gaps", "Gaps to jump", 3)}${slider("lasers", "Lasers to slide under", 3)}</div>
      <p class="wst-fine" style="--c:${hex(th.edge)}">🎲 ${esc(T("Layout #{n}", { n: spec.seed }))} · ${Math.round(L.len)} m · ${L.coins} ${esc(T("coins"))} <button type="button" class="wst-link" data-seed>${esc(T("New layout"))}</button></p>
      <div class="wst-acts"><button type="button" class="wst-go big" data-test>▶ ${esc(T("Test play"))}</button><button type="button" class="wst-go alt" data-save ${busy ? "disabled" : ""}>💾 ${esc(T(editId ? "Save changes" : "Save"))}</button>${editId ? `<button type="button" class="wst-go alt" data-pub="${esc(editId)}">🚀 ${esc(T((mine.find((g) => g.id === editId) || {}).pub ? "Published ✓" : "Publish"))}</button>` : ""}</div>`;
  }
  const card = (g, own) => `<div class="wst-card" style="--c:${hex((THEMES[g.theme] || THEMES.neon).edge)};--b:${hex((THEMES[g.theme] || THEMES.neon).sky)}"><div class="wst-cv"><i aria-hidden="true">🏃</i><em>${esc(T((THEMES[g.theme] || THEMES.neon).name))}</em></div><div class="wst-ci"><b>${esc(g.title)}</b><small>${own ? (g.pub ? "🚀 " + esc(T("On the Creator Arcade")) : "📝 " + esc(T("Draft"))) : esc(T("by {n}", { n: g.byName || "?" }))} · ▶ ${g.plays || 0} · ♥ ${g.likes || 0}</small>
    <span class="wst-cb"><button type="button" class="wst-go" data-play="${esc(g.id)}">▶ ${esc(T("Play"))}</button>${own ? `<button type="button" data-edit="${esc(g.id)}">${esc(T("Edit"))}</button><button type="button" data-pub="${esc(g.id)}">${esc(T(g.pub ? "Unpublish" : "Publish"))}</button><button type="button" data-del="${esc(g.id)}" aria-label="${esc(T("Delete"))}">🗑</button>` : `<button type="button" data-like="${esc(g.id)}">♥ ${esc(T("Like"))}</button>`}</span></div></div>`;
  function paint() {
    if (!el) return;
    const body = tab === "mine" ? (wallet() ? (mine.length ? mine.map((g) => card(g, true)).join("") : `<p class="wst-empty">${esc(T("No games yet — make your first one in Create."))}</p>`) : `<p class="wst-empty">${esc(T("Sign in with a wallet to keep your games."))}</p>`)
      : tab === "arcade" ? (arcade.length ? arcade.map((g) => card(g, false)).join("") : `<p class="wst-empty">${esc(T("The Creator Arcade is waiting for its first game — publish yours!"))}</p>`)
      : paintMake();
    el.innerHTML = `<div class="wst-in"><header class="wst-h"><small>${esc(T("Nexus City"))}</small><h2>🎮 ARCIRCLE Studio <em>Lite</em></h2><button type="button" class="wst-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
      <nav class="wst-tabs">${[["make", "🛠️", "Create"], ["mine", "📁", "My games"], ["arcade", "🕹️", "Creator Arcade"]].map(([id, ic, l]) => `<button type="button" data-tab="${id}" class="${tab === id ? "on" : ""}"><span aria-hidden="true">${ic}</span>${esc(T(l))}</button>`).join("")}</nav>
      <div class="wst-body">${body}</div><p class="wst-foot">${esc(T("Games are made from templates — no code. Plays, likes and best runs are counted; no ARCL is paid for games yet."))}</p></div>`;
  }
  function onInput(e) {
    const t = e.target;
    if (t.matches("[data-k]")) { spec[t.dataset.k] = Number(t.value); const b = t.parentElement.querySelector("b"); if (b) b.textContent = t.value; const f = el.querySelector(".wst-fine"); if (f) { const L = genLevel(spec); f.firstChild.textContent = `🎲 ${T("Layout #{n}", { n: spec.seed })} · ${Math.round(L.len)} m · ${L.coins} ${T("coins")} `; } }
    if (t.matches(".wst-tin")) spec.title = t.value;
  }
  async function onClick(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) { if (e.target === el) close(); return; }
    if (b.hasAttribute("data-x")) return close();
    if (b.dataset.tab) { tab = b.dataset.tab; paint(); if (tab !== "make") load(); return; }
    if (b.dataset.tpl) { spec.tpl = b.dataset.tpl; return paint(); }
    if (b.dataset.theme) { spec.theme = b.dataset.theme; return paint(); }
    if (b.dataset.len) { spec.len = Number(b.dataset.len); return paint(); }
    if (b.hasAttribute("data-seed")) { spec.seed = 1 + Math.floor(Math.random() * 99999); return paint(); }
    if (b.hasAttribute("data-test")) { spec = clampSpec(spec); return run({ spec, id: editId || "", test: true }); }
    if (b.hasAttribute("data-ai")) return draft();
    if (b.hasAttribute("data-save")) return save();
    if (b.dataset.pub) return publish(b.dataset.pub);
    if (b.dataset.del) return del(b.dataset.del);
    if (b.dataset.edit) { const g = mine.find((x) => x.id === b.dataset.edit); if (g) { spec = clampSpec(g.spec); editId = g.id; tab = "make"; paint(); } return; }
    if (b.dataset.play) return playId(b.dataset.play);
    if (b.dataset.like) return like(b.dataset.like);
  }
  async function draft() {
    const inp = el.querySelector(".wst-aiin"), t = inp ? inp.value.trim() : ""; if (!t) { if (inp) inp.focus(); return; }
    busy = true; aiNote = T("Thinking…"); paint(); const r = await act({ action: "world-studio-ai", t }); busy = false;
    if (!r) { aiNote = ""; paint(); return; }
    if (r.j && r.j.spec) { spec = clampSpec({ ...r.j.spec, seed: r.j.spec.seed }); editId = ""; aiNote = r.j.by === "agent" ? T("{n} drafted it — tweak anything, then test it.", { n: ctx.agentName() || T("Your agent") }) : T("Drafted from your words — tweak anything, then test it."); paint(); if (ctx.Snd && ctx.Snd.perfect) try { ctx.Snd.perfect(); } catch { /* no sound */ } return; }
    aiNote = ""; paint(); fail(r);
  }
  async function save() {
    spec = clampSpec(spec); busy = true; paint(); const r = await act({ action: "world-studio-save", spec, id: editId || undefined }); busy = false;
    if (!r || !r.ok) { paint(); if (r) fail(r); return; }
    editId = r.j.game.id; mine = [r.j.game, ...mine.filter((g) => g.id !== editId)]; ctx.toast("💾 " + esc(T("Saved"))); paint();
  }
  async function publish(id) {
    const g = mine.find((x) => x.id === id), on = !(g && g.pub); const r = await act({ action: "world-studio-publish", id, on }); if (!r || !r.ok) return r && fail(r);
    mine = mine.map((x) => (x.id === id ? r.j.game : x)); ctx.toast(on ? "🚀 " + esc(T("On the Creator Arcade!")) : esc(T("Taken off the Creator Arcade"))); paint(); load();
  }
  async function del(id) {
    if (!confirm(T("Delete this game?"))) return; const r = await act({ action: "world-studio-del", id }); if (!r || !r.ok) return r && fail(r);
    mine = mine.filter((x) => x.id !== id); if (editId === id) editId = ""; paint(); load();
  }
  async function like(id) { const r = await act({ action: "world-studio-like", id }); if (!r || !r.ok) return r && fail(r); arcade = arcade.map((g) => (g.id === id ? { ...g, likes: r.j.likes } : g)); ctx.toast(r.j.already ? esc(T("You liked it already")) : "♥ " + esc(T("Liked"))); paint(); }
  async function playId(id) {
    let g = mine.find((x) => x.id === id && x.spec);
    if (!g) try { const r = await fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id), { cache: "no-store" }); if (r.ok) g = (await r.json()).game; } catch { /* below */ }
    if (!g || !g.spec) { ctx.toast(T("Couldn't open it — try again")); return; }
    run({ spec: clampSpec(g.spec), id, title: g.title, by: g.byName });
  }

  // ---------------- the runner ----------------
  async function run(o) {
    if (playing) return; const vw = el && !el.hidden; if (el) el.hidden = true;
    try { playing = await makeRun(o); }
    catch (e) { console.warn("studio run", e); playing = null; ctx.st.solo(null); ctx.st.view(null); document.body.classList.remove("wp-studio"); ctx.toast(T("The game couldn't start") + " — " + esc(String((e && e.message) || e).slice(0, 60))); if (vw && el) el.hidden = false; }
  }
  async function makeRun(o) {
    const { st } = ctx, th = THEMES[o.spec.theme], L = genLevel(o.spec), v = speedOf(o.spec);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(th.sky); scene.fog = new THREE.Fog(th.fog, 34, 150);
    const cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0xffffff, th.track, 1.15)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(6, 14, -6); scene.add(sun);
    const std = (c, o2 = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2, ...o2 }), glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false });
    // the track: pieces between the gaps, lane lines, glowing edges; pillars down both sides
    const gaps = L.rows.filter((r) => r.k === "gap").map((r) => r.z).sort((a, b) => a - b), GAP = 4.6, W = 7.4;
    const trackM = std(th.track, { roughness: 0.6 }), edgeM = glow(th.edge), laneM = glow(th.edge, 0.35);
    let z0 = -20; const ends = [...gaps.map((g) => [g - GAP / 2, g + GAP / 2]), [L.len + 40, L.len + 40]];
    for (const [a, b] of ends) { const len = a - z0; if (len > 0.5) { const m = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, len), trackM); m.position.set(0, -0.3, z0 + len / 2); scene.add(m); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, len), edgeM); e.position.set((s * W) / 2, 0.04, z0 + len / 2); scene.add(e); } for (const x of [-1.1, 1.1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, len), laneM); l.position.set(x, 0.02, z0 + len / 2); scene.add(l); } } z0 = b; }
    const PN = Math.ceil((L.len + 160) / 14) * 2, pil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(th.prop, { emissive: th.prop, emissiveIntensity: 0.35 }), PN), mt = new THREE.Matrix4();
    { let i = 0, s0 = o.spec.seed; const r = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647); for (let z = -20; i < PN; z += 14) for (const s of [-1, 1]) { if (i >= PN) break; const h = 2 + r() * 9; mt.compose(new THREE.Vector3(s * (W / 2 + 2.5 + r() * 4), h / 2 - 0.6, z), new THREE.Quaternion(), new THREE.Vector3(1.2 + r(), h, 1.2 + r())); pil.setMatrixAt(i++, mt); } }
    scene.add(pil);
    // walls, lasers, coins, the finish
    const walls = L.rows.filter((r) => r.k === "wall"), lasers = L.rows.filter((r) => r.k === "laser"), coinRows = L.rows.filter((r) => r.k === "coin");
    const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 1.7, 0.8), std(th.wall, { emissive: th.wall, emissiveIntensity: 0.45 }), Math.max(1, walls.length));
    walls.forEach((w, i) => { mt.makeTranslation(LANES[w.lane], 0.85, w.z); wm.setMatrixAt(i, mt); }); scene.add(wm);
    for (const l of lasers) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, W, 8), glow(0xff3355)); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.25, l.z); scene.add(bar); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), std(0x2a2f3a)); p.position.set((s * W) / 2, 1, l.z); scene.add(p); } }
    const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18), std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 }), Math.max(1, coinRows.length));
    const got = new Uint8Array(coinRows.length); scene.add(cm);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.3, 10, 48, Math.PI), glow(th.edge)); arch.position.set(0, 0, L.len); scene.add(arch);
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.2), glow(0xffffff, 0.8)); fin.position.set(0, 3.1, L.len); scene.add(fin);
    // your hero
    let hero = null; try { hero = await ctx.makeHero(); } catch (e) { console.warn("studio hero", e); }
    const me = new THREE.Group(); scene.add(me); if (hero) { me.add(hero.obj); try { hero.play("idle"); } catch { /* no clip */ } } else { const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 10), std(0xeef4fb)); cap.position.y = 0.9; me.add(cap); }
    // the HUD and the controls
    document.body.classList.add("wp-studio");
    const hud = document.createElement("div"); hud.className = "wst-hud"; hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || o.spec.title)}</b><span class="wst-hp">❤️❤️❤️</span><span class="wst-hc">🪙 0</span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div><p class="wst-help">${esc(T(ctx.coarse ? "Swipe ← → to switch lanes · ↑ jump · ↓ slide" : "← → switch lanes · ↑ / Space jump · ↓ slide"))}</p>`;
    document.body.appendChild(hud);
    const S = { z: 0, x: 0, lane: 1, y: 0, vy: 0, slide: 0, hearts: 3, inv: 0, coins: 0, t: -3, done: false, over: false, clip: "" };
    const keys = (e) => { if (S.over) return; const k = e.key; if (k === "ArrowLeft" || k === "a" || k === "A") lane(-1); else if (k === "ArrowRight" || k === "d" || k === "D") lane(1); else if (k === "ArrowUp" || k === " " || k === "w" || k === "W") jump(); else if (k === "ArrowDown" || k === "s" || k === "S") slide(); else return; e.preventDefault(); };
    let tx = 0, ty = 0, tt = 0;
    const ts = (e) => { const p = e.changedTouches ? e.changedTouches[0] : e; tx = p.clientX; ty = p.clientY; tt = Date.now(); };
    const te = (e) => { if (e.target.closest && e.target.closest("button")) return; const p = e.changedTouches ? e.changedTouches[0] : e, dx = p.clientX - tx, dy = p.clientY - ty; if (Math.hypot(dx, dy) < 24) { if (Date.now() - tt < 400) jump(); return; } if (Math.abs(dx) > Math.abs(dy)) lane(dx > 0 ? 1 : -1); else if (dy < 0) jump(); else slide(); };
    addEventListener("keydown", keys, true); addEventListener("touchstart", ts, { passive: true }); addEventListener("touchend", te); const pu = (e) => { if (e.pointerType === "mouse") te(e); }; addEventListener("pointerdown", ts); addEventListener("pointerup", pu);
    const play = (c, once) => { if (!hero) return; try { hero.play(c, once ? { once: true } : {}); } catch { /* no clip */ } S.clip = once ? "" : c; };
    function lane(d) { if (S.t < 0) return; S.lane = Math.max(0, Math.min(2, S.lane + d)); if (ctx.Snd && ctx.Snd.dash) try { ctx.Snd.dash(); } catch { /* no sound */ } }
    function jump() { if (S.t < 0 || S.y > 0.01) return; S.vy = 8.6; S.slide = 0; play("jump", true); if (ctx.Snd && ctx.Snd.jump) try { ctx.Snd.jump(); } catch { /* no sound */ } }
    function slide() { if (S.t < 0) return; if (S.y > 0.01) S.vy = Math.min(S.vy, -10); S.slide = 0.7; play("dodge", true); }
    function hurt(why) { if (S.inv > 0 || S.over) return; S.hearts--; S.inv = 1.4; play(S.hearts > 0 ? "hit" : "die", true); if (ctx.Snd && ctx.Snd.hurt) try { ctx.Snd.hurt(); } catch { /* no sound */ } paintHud(); if (S.hearts <= 0) end(false); if (why === "gap") { const g = gaps.find((x) => Math.abs(S.z - x) < GAP); S.y = 0; S.vy = 0; if (g != null) S.z = g + GAP / 2 + 0.6; } } // (back on its far side)
    const paintHud = () => { hud.querySelector(".wst-hp").textContent = "❤️".repeat(Math.max(0, S.hearts)) + "🖤".repeat(3 - Math.max(0, S.hearts)); hud.querySelector(".wst-hc").textContent = "🪙 " + S.coins; hud.querySelector(".wst-bar em").style.width = Math.min(100, (S.z / L.len) * 100).toFixed(1) + "%"; };
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    function tick(dt, t) {
      dt = Math.min(dt, 0.05);
      if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; const n1 = Math.ceil(-S.t); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) { setTimeout(() => cd.remove(), 700); play("sprint"); } } }
      else if (!S.over) {
        S.t += dt; S.z += v * dt; S.inv = Math.max(0, S.inv - dt); S.slide = Math.max(0, S.slide - dt);
        S.vy -= 24 * dt; S.y = Math.max(0, S.y + S.vy * dt); if (S.y === 0) S.vy = 0;
        // over a gap with your feet on the ground: down you go (a heart), back on the far side
        if (S.y < 0.05 && gaps.some((g) => Math.abs(S.z - g) < GAP / 2 - 0.3)) hurt("gap");
        const ln = S.lane, h = S.slide > 0 ? 0.9 : 1.8;
        for (const w of walls) { if (w.z < S.z - 1) continue; if (w.z > S.z + 1) break; if (w.lane === ln && Math.abs(w.z - S.z) < 0.6 && S.y < 1.6) hurt("wall"); }
        for (const l of lasers) if (Math.abs(l.z - S.z) < 0.45 && S.y < 1.3 && S.y + h > 1.15) hurt("laser");
        coinRows.forEach((c, i) => { if (!got[i] && c.lane === ln && Math.abs(c.z - S.z) < 1 && S.y < 2.2) { got[i] = 1; S.coins++; if (ctx.Snd && ctx.Snd.coin) try { ctx.Snd.coin(); } catch { /* no sound */ } } });
        if (S.z >= L.len) { S.z = L.len; end(true); }
        paintHud();
        if (hero && !hero.busy() && S.clip !== "sprint") play("sprint");
      }
      S.x += (LANES[S.lane] - S.x) * Math.min(1, dt * 12);
      me.position.set(S.x, S.y, S.z); me.visible = !(S.inv > 0 && ((t * 12) | 0) % 2);
      if (hero) hero.update(dt, t);
      // the coins near you turn (the rest stay where they are)
      coinRows.forEach((c, i) => { if (c.z < S.z - 4 || c.z > S.z + 70) return; q.setFromAxisAngle(up, t * 3 + i); mt.compose(pv.set(LANES[c.lane], got[i] ? -5 : 1.1, c.z), q.multiply(flip), sc); cm.setMatrixAt(i, mt); });
      cm.instanceMatrix.needsUpdate = true;
      cam.position.set(S.x * 0.6, 4.3 + S.y * 0.4, S.z - 7.6); cam.lookAt(S.x * 0.8, 1.2 + S.y * 0.3, S.z + 9);
      if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    }
    hud.querySelector(".wst-hx").addEventListener("click", () => leave());
    async function end(done) {
      if (S.over) return; S.over = true; S.done = done; play(done ? "emote-yes" : "die", true);
      const score = scoreOf(S.coins, S.z, done); let res = null;
      if (o.id && !o.test && ctx.sess()) { const r = await act({ action: "world-studio-play", id: o.id, coins: S.coins, dist: Math.round(S.z), done }); if (r && r.ok) res = r.j; }
      lastRun = { score, coins: S.coins, dist: Math.round(S.z), done, res };
      const c = document.createElement("div"); c.className = "wst-res"; c.innerHTML = `<div class="wst-rin"><small>${esc(o.title || o.spec.title)}</small><h3>${done ? "🏁 " + esc(T("Finished!")) : "💥 " + esc(T("Out of hearts"))}</h3><b class="wst-score">${score}</b>
        <p>🪙 ${S.coins} / ${L.coins} · ${Math.round(S.z)} / ${Math.round(L.len)} m</p>${res ? `<p>${esc(T("Your best: {n}", { n: res.best }))}${res.place ? " · " + esc(T("#{n} on this game", { n: res.place })) : ""}</p>` : o.test ? `<p class="wst-fine">${esc(T("A test run isn't counted."))}</p>` : ""}
        <span><button type="button" class="wst-go big" data-again>↻ ${esc(T("Play again"))}</button><button type="button" class="wst-go alt" data-back>${esc(T(o.test ? "Back to the editor" : "Back"))}</button></span></div>`;
      hud.appendChild(c);
      c.querySelector("[data-again]").addEventListener("click", () => { leave(true); setTimeout(() => run(o), 50); });
      c.querySelector("[data-back]").addEventListener("click", () => leave());
    }
    function leave(again) {
      removeEventListener("keydown", keys, true); removeEventListener("touchstart", ts); removeEventListener("touchend", te); removeEventListener("pointerdown", ts); removeEventListener("pointerup", pu);
      st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio");
      if (hero) me.remove(hero.obj); // (the hero's materials are the kit's, shared: only what this run made is let go)
      scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });
      playing = null; if (!again && el) { el.hidden = false; paint(); load(); }
    }
    st.view(scene, cam); st.solo(tick); tick(0.016, 0); paintHud();
    return { S, leave, L, clips: (all) => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((x) => x.isRunning() && (all || x.getEffectiveWeight() > 0.5)).map((x) => x.getClip().name) : []), jump, slide, lane };
  }
  return { open, close, shown, playing: () => playing, last: () => lastRun, spec: () => spec, set: (s) => { spec = clampSpec(s); if (el && !el.hidden) paint(); } };
}
