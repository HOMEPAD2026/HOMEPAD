// world-agent.js — AGENT DIMENSION in town (AD1): your own AI agent. The Genesis Lab (pick AURORA, ORION or VEX, name
// it, give it a personality), the agent walking at your side (a human-size character: world-kit.js makeAgent), the
// talk window (20 messages a day, the server asks Claude: api/_world-agent.mjs), errands that run while you're away
// (ARCL up front, real time, materials back: Jurassic's pack or the Mine's ore bag) and the report when it's back.
// Loaded by world-play.js a few seconds after the town starts; a guest sees the Lab and is asked to sign in to create.
// AD2: the agent keeps up (past 15 m it steps out of light beside you), a short wave, a Lab in steps (pick → ID and name →
// personality → its birth: a beam from the sky and the agent forming), errands that leave and come back in light, the
// loot flying to your bag, a speech bubble over it while it answers, its own trail (AURORA's hearts, ORION's shards,
// VEX's afterglow), a ring when it levels up, the day's briefing, an errand asked for in chat (the page asks first),
// its number (Genesis Founder in the pre-launch event), the week's busiest agents and a share card.
//
// AD3: the Vault tab — the player's own trading vault on Arc, run by their agent by the rules they set (every trade
// ≤ 100 USDC, the fee in $ARCIRCLE, money only back to their own wallet; each vault step is signed in their wallet).
//
// ctx: { THREE, K, planet, here(v), facing(), ver, inHub(), calm(), T, esc, toast, sess(), post(body), signIn(), purse(), coarse, reduce, low, burst?, share?, tx?(to, data), arcircle? }
const PORTRAIT = (k) => `/images/agents/${k}-400.webp?v=2`, BIG = (k) => `/images/agents/${k}-800.webp?v=2`; // ?v=2: the see-through portraits (2026-10-22) — a phone kept the old ones with a black box
const ICON = { aurora: "💛", orion: "♾️", vex: "🔻" };
const MAT = { wood: "🪵", stone: "🪨", fiber: "🌿", berries: "🫐", hide: "🟫", bone: "🦴", meat: "🍖", fang: "🦷", cu: "🟠", ag: "⚪" };
const MAT_N = { wood: "wood", stone: "stone", fiber: "fiber", berries: "berries", hide: "hide", bone: "bone", meat: "meat", fang: "fang", cu: "copper ore", ag: "silver ore" };
const PRESETS = ["Cheerful and kind", "Calm and wise", "Witty and bold", "Brave and loyal", "Curious explorer"];
const ROLE = { aurora: "Caretaker & Coordinator", orion: "Strategist & Operator", vex: "Analyst & Hunter" };
const LINE = { aurora: "A brighter world, together.", orion: "From data to a better tomorrow.", vex: "See beyond. Find what others miss." };
const DOES = {
  aurora: ["Gathers wood and stone for your camp (+25%)", "Keeps you company and keeps track of things", "Later: watches your wallet and reminds you of claims"],
  orion: ["Mines ore while you're away (+25%)", "Plans your next step with you", "Later: drafts token launches you approve in your wallet"],
  vex: ["Scouts and hunts in Jurassic (+25%)", "Spots scams and tricks with you", "Later: token safety reports with a public track record"],
};
const DESC = {
  aurora: "A kind AI agent who supports, coordinates and helps your journey in ARCIRCLE WORLD.",
  orion: "A calm AI agent who plans, operates and finds the next step for your journey in ARCIRCLE WORLD.",
  vex: "A sharp AI agent who scouts, tracks and finds what others miss in ARCIRCLE WORLD.",
};
const ASK = ["What should I do next?", "Tell me about yourself", "Any tips for Jurassic World?"];
const no4 = (n) => "#" + String(n || 0).padStart(4, "0");
// AD3: the agent's trading vault on Arc (contracts/contracts/AgentDimension.sol; rules and runs: api/_world-agentvault.mjs)
const USDC = "0x3600000000000000000000000000000000000000";
const SEL = { create: "0x2910b22d", allow: "0xb53472ef", disallow: "0xe79767af", pause: "0x16c38b3c", agentOn: "0x57119941", withdraw: "0xf3fef3a3", transfer: "0xa9059cbb" };
const RK = { dca: "Buy every few hours", buyBelow: "Buy when the price drops to", takeProfit: "Take profit at", stopLoss: "Stop loss at" };
const w64 = (x) => BigInt(x).toString(16).padStart(64, "0"), a64 = (a) => String(a).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const JOB_IC = { gather: "🌲", mine: "⛏️", scout: "🏹" };
const TRAIL = { aurora: { c: "#ffd36a", s: "heart" }, orion: { c: "#7fd8ff", s: "shard" }, vex: { c: "#c07bff", s: "glow" } };

export function createAgentDim(ctx) {
  const { THREE, K, planet, here, T, esc } = ctx;
  let st = null, last = 0, el = null, chip = null, tab = "talk", sending = false, pick = null, busy = false, report = null;
  const root = new THREE.Group(); root.name = "pet"; planet.add(root); // (named "pet": the far-cull leaves moving things alone)
  let body = null, bodyKind = "", tag = null, face = 0, labStep = 1, suggest = "", topList = null, topAt = 0, briefSeen = "", briefOn = false, lvUp = 0;
  const draft = { id: "", name: "", persona: "" };
  try { briefSeen = localStorage.getItem("arc.agent.brief") || ""; } catch { /* not kept */ }
  const notified = new Set(); let firstLook = true;
  const me = new THREE.Vector3();
  // ---------------- effects: beams of light, rings, its trail, the speech bubble ----------------
  // (sprites marked isPin: the town's sign fader leaves them alone — it hides small signs close to the camera)
  const fx = (() => {
    const live = [], texs = {};
    const tex = (shape, color) => { const key = shape + color; if (texs[key]) return texs[key]; const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 12;
      if (shape === "heart") { g.font = "44px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("♥", 32, 34); }
      else if (shape === "shard") { g.beginPath(); g.moveTo(32, 8); g.lineTo(46, 32); g.lineTo(32, 56); g.lineTo(18, 32); g.closePath(); g.fill(); }
      else { const r = g.createRadialGradient(32, 32, 2, 32, 32, 28); r.addColorStop(0, color); r.addColorStop(1, "rgba(0,0,0,0)"); g.shadowBlur = 0; g.fillStyle = r; g.fillRect(0, 0, 64, 64); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (texs[key] = t); };
    const add = (o, life, upd) => { root.add(o); live.push({ o, t: 0, life, upd }); };
    const glowMat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    return {
      beam(x, z, color, life = 1, h = 10) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, h, 20, 1, true), glowMat(color, 0.6)); m.position.set(x, h / 2, z);
        add(m, life, (k) => { m.material.opacity = 0.65 * (1 - k * k); m.scale.set(1 + k * 0.7, 1, 1 + k * 0.7); }); },
      ring(x, z, color, r = 2) { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), glowMat(color, 0.9)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z);
        add(m, 1.1, (k) => { m.scale.setScalar(0.4 + k * r); m.material.opacity = 0.9 * (1 - k); }); },
      trail(kind, x, z) { const T0 = TRAIL[kind] || TRAIL.orion, glowy = T0.s === "glow";
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(T0.s, T0.c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.userData.isPin = true;
        const y0 = glowy ? 1.05 : 0.5 + Math.random() * 1.2; sp.position.set(x + (Math.random() - 0.5) * 0.6, y0, z + (Math.random() - 0.5) * 0.6); sp.scale.setScalar(glowy ? 1.5 : 0.32);
        add(sp, glowy ? 0.55 : 0.9, (k) => { sp.material.opacity = (glowy ? 0.55 : 1) * (1 - k); if (!glowy) sp.position.y = y0 + k * 0.8; if (T0.s === "shard") sp.material.rotation = k * 3; }); },
      tick(dt) { for (let i = live.length - 1; i >= 0; i--) { const L = live[i]; L.t += dt; const k = Math.min(1, L.t / L.life); L.upd(k); if (k >= 1) { root.remove(L.o); if (L.o.geometry) L.o.geometry.dispose(); if (L.o.material) L.o.material.dispose(); live.splice(i, 1); } } },
      count: () => live.length,
    };
  })();
  let bubbleS = null, bubbleT = 0;
  /// a speech bubble over its head (the answer's first words, or "…" while it thinks)
  function bubble(text, ms = 4500) {
    if (bubbleS && bubbleS.parent) bubbleS.parent.remove(bubbleS); bubbleS = null; clearTimeout(bubbleT); if (!body || !text) return;
    const C = K.AGENTS[bodyKind] || { color: "#5fd3ff" }, t = String(text).length > 44 ? String(text).slice(0, 42) + "…" : String(text);
    bubbleS = K.label(t, { accent: C.color, size: 0.4 }); bubbleS.userData.isPin = true; bubbleS.position.y = 3.35; body.obj.add(bubbleS);
    if (ms) bubbleT = setTimeout(() => bubble(""), ms);
  }
  const wallet = () => { const s = ctx.sess(); return s ? String(s.wallet).toLowerCase() : ""; };
  const left = (ms) => { const all = Math.max(1, Math.ceil(Math.max(0, ms) / 6e4)), h = Math.floor(all / 60), m = all % 60; return h ? (m ? T("{h}h {m}m", { h, m }) : T("{h}h", { h })) : T("{m}m", { m: all }); };
  const lootLine = (o) => Object.entries(o || {}).map(([k, n]) => `${MAT[k] || "•"} ${n} ${esc(T(MAT_N[k] || k))}`).join(" · ");

  async function look() {
    const w = wallet(); if (!w) { st = null; paintChip(); return; }
    try { const r = await fetch("/api/social?world=agent&wallet=" + encodeURIComponent(w), { cache: "no-store" }); if (r.ok) st = await r.json(); } catch { /* the next look */ }
    last = Date.now(); paintChip(); spawn(); notify(); awayNote();
    if (el && !el.hidden) paint();
  }
  // AD-City 2: errands the job board brought back while you were away — one toast for what's new since last time
  function awayNote() {
    const a = A(); if (!a || !(a.auto || []).length) return; let seen = 0; try { seen = Number(localStorage.getItem("arc.agent.auto") || 0); } catch { /* not kept */ }
    const fresh = a.auto.filter((x) => x.at > seen); if (!fresh.length) return;
    try { localStorage.setItem("arc.agent.auto", String(Math.max(...a.auto.map((x) => x.at)))); } catch { /* not kept */ }
    if (!seen) return; // (the first look on this device: nothing to tell)
    const got = {}; fresh.forEach((x) => { for (const [m, n] of Object.entries(x.loot || {})) got[m] = (got[m] || 0) + n; });
    ctx.toast(`<b>${esc(T("While you were away"))}</b> · ${esc(T("{n} finished {k} errand(s)", { n: a.name, k: fresh.length }))}<br>${lootLine(got)}`);
  }
  // an errand that's done: a toast in town, and a system notice when the page is in the background (if allowed)
  let notifyArmed = false;
  function notify() {
    const a = A(); if (!a) return; const done = backs();
    if (!notifyArmed) { done.forEach((j) => notified.add(j.id)); notifyArmed = true; return; } // the ones already back when the page opened: the chip says so
    for (const j of done) { if (notified.has(j.id)) continue; notified.add(j.id);
      const msg = T("{n} is back! See what it brought", { n: a.name });
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") { try { new Notification("AGENT DIMENSION", { body: msg, icon: PORTRAIT(a.kind), tag: "agent-" + j.id }); } catch { /* not on this browser */ } }
      else if (ctx.calm()) ctx.toast(`${ICON[a.kind]} ${msg}`); }
  }
  const A = () => (st && st.agent) || null;
  const away = () => { const a = A(); return !!(a && a.jobs.some((j) => Date.now() < j.end)); };
  const backs = () => { const a = A(); return a ? a.jobs.filter((j) => Date.now() >= j.end) : []; };

  // ---------------- the agent in town ----------------
  // how it arrives: "birth" (just made: a beam from the sky, it forms), "light" (back from an errand), or quietly
  let arrive = "";
  async function spawn() {
    const a = A(), want = a && !away() ? a.kind : "";
    if (want === bodyKind || busy) { if (tag && a) tag.visible = !!want; return; }
    if (body) { root.remove(body.obj); if (body.dispose) body.dispose(); body = null; } if (tag) { root.remove(tag); tag = null; } bodyKind = "";
    if (!want) return;
    busy = true;
    try {
      const b = await K.makeAgent(want, ctx.ver || ""); here(me); const f = ctx.facing();
      b.obj.position.set(me.x + Math.cos(f) * 1.8, 0, me.z - Math.sin(f) * 1.8); root.add(b.obj); body = b; bodyKind = want; face = f;
      const C = K.AGENTS[want]; tag = K.label(a.name, { accent: C.color, size: 0.5, sub: a.id ? "@" + a.id : T(ROLE[want]) }); tag.position.y = 2.75; b.obj.add(tag);
      const how = arrive || (firstLook ? "" : "light"); arrive = "";
      if (how) { b.obj.scale.setScalar(0.01); const g = (grow = { t: 0, dur: how === "birth" ? 1.6 : 0.7, to: 1 }); setTimeout(() => { if (grow === g) { grow = null; b.obj.scale.setScalar(1); } }, 2500); fx.beam(b.obj.position.x, b.obj.position.z, C.color, how === "birth" ? 2.6 : 1.2, how === "birth" ? 26 : 9); fx.ring(b.obj.position.x, b.obj.position.z, C.color, how === "birth" ? 4.5 : 2.4); }
      if (lvUp) { const X = b.obj.position.x, Z = b.obj.position.z; setTimeout(() => { fx.ring(X, Z, "#ffd75e", 5); fx.beam(X, Z, "#ffd75e", 1.6, 14); bubble(T("Level up! Lv {n}", { n: lvUp }), 3500); lvUp = 0; }, 800); }
      if (b.play) setTimeout(() => { try { if (body === b && !b.busy() && moving < 0.4) b.play("emote-yes", { once: true, speed: 1.5 }); } catch { /* no clip */ } }, how === "birth" ? 1700 : 600);
    } catch (e) { console.warn("agent", e); } finally { busy = false; firstLook = false; }
  }
  /// it leaves on an errand: steps into light and fades, then the town is without it until it's back
  function depart(done) {
    if (!body) { done(); return; } const C = K.AGENTS[bodyKind] || { color: "#5fd3ff" };
    fx.beam(body.obj.position.x, body.obj.position.z, C.color, 1.1, 10); const g = (grow = { t: 0, dur: 0.6, to: 0, done });
    setTimeout(() => { if (grow === g) { grow = null; done(); } }, 1500); // the town not drawing (another game, a slow phone): it still leaves
  }
  let grow = null, moving = 0, trailT = 0;
  const shortest = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  let ticks = 0;
  function tick(dt, t) {
    ticks++;
    const on = ctx.inHub(); root.visible = on; fx.tick(dt); if (!on || !body) return;
    here(me); const f = ctx.facing();
    if (grow) { grow.t += dt; const k = Math.min(1, grow.t / grow.dur), e = grow.to ? 1 - Math.pow(1 - k, 3) : 1 - k; body.obj.scale.setScalar(Math.max(0.01, grow.to ? e * (1 + Math.sin(k * Math.PI) * 0.12) : e)); if (k >= 1) { const d = grow.done; grow = null; if (d) d(); if (!body) return; } }
    // its place: a step to your right and a little behind (the dinosaur companion keeps your left)
    const x = me.x + Math.cos(f) * 1.7 - Math.sin(f) * 1.1, z = me.z - Math.sin(f) * 1.7 - Math.cos(f) * 1.1, o = body.obj;
    const px = o.position.x, pz = o.position.z, dist = Math.hypot(x - px, z - pz);
    if (dist > 15 && !grow) { fx.beam(px, pz, K.AGENTS[bodyKind].color, 0.6, 6); o.position.set(x, 0, z); fx.beam(x, z, K.AGENTS[bodyKind].color, 0.8, 7); fx.ring(x, z, K.AGENTS[bodyKind].color, 1.8); } // left behind: it steps out of light beside you
    else if (dist > 0.3) { const k = 1 - Math.exp(-dt * (dist > 5 ? 4.5 : 2.4)); o.position.x += (x - px) * k; o.position.z += (z - pz) * k; }
    const sp = Math.hypot(o.position.x - px, o.position.z - pz) / Math.max(1e-3, dt); moving = sp;
    if (sp > 0.6 && !ctx.low && !ctx.reduce && (trailT -= dt) <= 0) { trailT = 0.11; fx.trail(bodyKind, o.position.x, o.position.z); }
    if (sp > 0.4) face = Math.atan2(o.position.x - px, o.position.z - pz); else if (dist < 2.5) face = f; // standing by you: it looks where you look
    o.rotation.y += shortest(face - o.rotation.y) * Math.min(1, dt * 7);
    // its clips as the town avatar's: walk scaled to the pace, a sprint when it hurries, else idle (no "run" clip)
    if (!body.busy()) { if (sp > 7) body.play("sprint", { speed: Math.max(0.8, sp / 9) }); else if (sp > 0.4) body.play("walk", { speed: Math.max(0.8, sp / 6.5) }); else body.play("idle"); }
    body.update(dt, t);
  }

  // ---------------- the chip (top centre): what your agent is doing ----------------
  function paintChip() {
    if (!chip) { chip = document.createElement("button"); chip.type = "button"; chip.className = "wag-chip"; chip.hidden = true; document.body.appendChild(chip); chip.addEventListener("click", () => open(backs().length ? "jobs" : undefined)); }
    const a = A(), calm = ctx.calm(); let txt = "", k = "";
    if (!a) { chip.hidden = true; return; } // no agent yet: no chip (the owner's call, 2026-10-23): the Citadel and Menu → AI Agent lead to the Genesis Lab
    if (backs().length) { txt = `${ICON[a.kind]} ${T("{n} is back! See what it brought", { n: a.name })}`; k = "back"; }
    else if (away()) { const j = a.jobs.filter((x) => Date.now() < x.end).sort((p, q) => p.end - q.end)[0]; txt = `${ICON[a.kind]} ${a.name} · ${T(st.jobs[j.job] ? st.jobs[j.job].name : j.job)} · ${left(j.end - Date.now())}`; k = "away"; }
    else { txt = `${ICON[a.kind]} ${T("Talk to {n}", { n: a.name })}`; k = "here"; }
    chip.hidden = !calm; chip.textContent = txt; chip.className = "wag-chip " + k + " " + (a ? a.kind : "");
  }

  // ---------------- the window ----------------
  function shell() {
    if (el) return el;
    el = document.createElement("div"); el.className = "wag"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
    document.body.appendChild(el);
    el.addEventListener("click", onClick); el.addEventListener("input", (e) => { if (e.target.matches(".wag-id")) idInput(e.target); }); el.addEventListener("change", (e) => { if (e.target.matches(".wag-vkind")) { vKind = e.target.value; paint(); } }); el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".wag-in")) { e.preventDefault(); send(); } if (e.key === "Escape") { e.stopPropagation(); close(); } });
    return el;
  }
  function open(t) {
    shell(); if (t) tab = t; report = null; view = ""; el.hidden = false;
    const a = A(); if (a && a.brief && a.brief.day !== briefSeen) { briefOn = true; tab = t || "talk"; briefSeen = a.brief.day; try { localStorage.setItem("arc.agent.brief", briefSeen); } catch { /* not kept */ } }
    paint(); if (Date.now() - last > 15e3) look();
    if (A() && body && body.play && !body.busy()) try { body.play("emote-yes", { once: true }); } catch { /* no clip */ }
  }
  function close() { if (el) el.hidden = true; paintChip(); }
  const shown = () => !!(el && !el.hidden);

  // the window (the owner's mock-up, 2026-10-22): the agent's art on the left — big, its line in script, arrows and the
  // three to look through — and on the right its name, ID, class and words, the tabs and the card; stacked on a phone
  const K3 = ["aurora", "orion", "vex"];
  let view = "";
  function showcase(k, mine) {
    const C = K.AGENTS[k];
    return `<aside class="wag-show ${k}" style="--ac:${C.color}"><small class="wag-dim">${esc(T("AGENT DIMENSION"))}</small>
      <div class="wag-stage"><img class="wag-big" src="${BIG(k)}" alt="${esc(C.name)}"><i class="wag-script">${esc(T(LINE[k]))} ♡</i>${mine === false ? `<b class="wag-peek">${esc(C.name)}</b>` : ""}</div>
      <button type="button" class="wag-nav prev" data-nav="-1" aria-label="‹">‹</button><button type="button" class="wag-nav next" data-nav="1" aria-label="›">›</button>
      <div class="wag-ped" aria-hidden="true"></div>
      <div class="wag-thumbs">${K3.map((x) => `<button type="button" data-view="${x}" class="${x === k ? "on" : ""} ${x}" style="--ac:${K.AGENTS[x].color}" aria-label="${esc(K.AGENTS[x].name)}"><img src="${PORTRAIT(x)}" alt=""></button>`).join("")}</div></aside>`;
  }
  // not open yet (the owner's call, 2026-10-22): only GM wallets go in; a guest or a player sees it being built
  const closed = () => !wallet() || !st || st.closed;
  function paintBuild() {
    const k = view && K3.includes(view) ? view : "orion", C = K.AGENTS[k];
    el.innerHTML = `<div class="wag-card lab build ${k}" style="--ac:${C.color}">${showcase(k)}<section class="wag-main"><header class="wag-h"><small class="wag-kick">${esc(T("AGENT DIMENSION"))}</small>
      <div class="wag-nm"><h2>🚧 ${esc(T("Under construction"))}</h2></div><p class="wag-role">${esc(T("AGENT DIMENSION is being built. It opens soon — stay tuned!"))}</p>
      <button type="button" class="wag-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
      <div class="wag-body"><div class="wag-event"><b>🛠️ ${esc(T("Coming soon"))}</b><span>${esc(T("Create your own AI agent — AURORA, ORION or VEX — and let it walk, talk and run errands with you."))}</span></div>
      <button type="button" class="wag-go" data-x>${esc(T("OK"))}</button></div></section></div>`;
  }
  function paint() {
    if (closed()) { if (wallet() && !st) { el.innerHTML = `<div class="wag-card lab"><section class="wag-main"><div class="wag-body"><p class="wag-fine">${esc(T("Loading…"))}</p></div></section></div>`; return; } return paintBuild(); }
    const a = A();
    if (!a) return paintLab();
    if (!view) view = a.kind;
    const C = K.AGENTS[a.kind], tabs = [["talk", "💬", "Talk"], ["jobs", "📋", "Errands"], ["vault", "💼", "Vault"], ["me", "🤖", "Agent"]];
    const head = `<header class="wag-h"><div class="wag-nm"><h2>${esc(a.name)}</h2><b class="wag-lv">${esc(T("Lv {n}", { n: a.lv }))}</b></div>
      ${a.id ? `<p class="wag-at">@${esc(a.id)}${a.no ? ` <span class="wag-no${a.founder ? " gold" : ""}">${no4(a.no)}${a.founder ? " · " + esc(T("Genesis Founder")) : ""}</span>` : ""}</p>` : ""}<p class="wag-role">${esc(T(ROLE[a.kind]))}</p><q class="wag-quote">${esc(T(LINE[a.kind]))}</q><i class="wag-heart" aria-hidden="true">${ICON[a.kind]}</i>
      <button type="button" class="wag-x" data-x aria-label="${esc(T("Close"))}">×</button></header>`;
    const tb = `<nav class="wag-tabs">${tabs.map(([id, ic, l]) => `<button type="button" data-tab="${id}" class="${tab === id ? "on" : ""}"><span aria-hidden="true">${ic}</span>${esc(T(l))}${id === "jobs" && backs().length ? ' <i class="wag-dot"></i>' : ""}</button>`).join("")}</nav>`;
    el.innerHTML = `<div class="wag-card ${a.kind}" style="--ac:${C.color}">${showcase(view, view === a.kind ? undefined : false)}<section class="wag-main">${head}${tb}<div class="wag-body">${report ? paintReport(a) : tab === "talk" ? paintTalk(a) : tab === "jobs" ? paintJobs(a) : tab === "vault" ? paintVault(a) : paintMe(a)}</div></section></div>`;
    const log = el.querySelector(".wag-log"); if (log) log.scrollTop = log.scrollHeight;
    const inp = el.querySelector(".wag-in"); if (inp && !ctx.coarse) inp.focus({ preventScroll: true });
  }
  // the Genesis Lab in steps: 1 pick one of the three → 2 its ID and name → 3 its personality → (create) its birth
  function paintLab() {
    const signed = !!wallet(), k = pick || "aurora", C = K.AGENTS[k], step = pick ? Math.max(2, labStep) : 1;
    const dots = `<ol class="wag-steps">${["Pick", "ID & name", "Personality", "Birth"].map((x, i) => `<li class="${i + 1 < step ? "done" : i + 1 === step ? "on" : ""}"><i>${i + 1}</i><span>${esc(T(x))}</span></li>`).join("")}</ol>`;
    let form;
    if (step === 1) form = `<div class="wag-picks">${K3.map((x) => `<button type="button" class="wag-pick ${x}" data-pick="${x}" style="--ac:${K.AGENTS[x].color}"><img src="${PORTRAIT(x)}" alt=""><b>${ICON[x]} ${esc(K.AGENTS[x].name)}</b><small>${esc(T(ROLE[x]))}</small></button>`).join("")}</div><p class="wag-fine">${esc(T("Pick one of the three to see what it does."))}</p>`;
    else if (step === 2) form = `<div class="wag-form"><ul class="wag-does">${DOES[pick].map((d) => `<li>${esc(T(d))}</li>`).join("")}</ul>
      <label>${esc(T("Agent ID"))}<span class="wag-idrow"><b>@</b><input class="wag-id" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(draft.id)}" placeholder="${esc(T("e.g. nova_01"))}"></span><small class="wag-idst"></small></label>
      <label>${esc(T("Name"))}<input class="wag-name" maxlength="14" value="${esc(draft.name || K.AGENTS[pick].name)}"></label>
      <div class="wag-cta"><button type="button" data-back>‹ ${esc(T("Back"))}</button><button type="button" class="wag-go" data-next>${esc(T("Next"))} ›</button></div></div>`;
    else form = `<div class="wag-form"><label>${esc(T("Personality"))}<input class="wag-persona" maxlength="160" value="${esc(draft.persona)}" placeholder="${esc(T("e.g. cheerful, loves dinosaurs"))}"></label>
      <div class="wag-presets">${PRESETS.map((p) => `<button type="button" data-preset="${esc(T(p))}">${esc(T(p))}</button>`).join("")}</div>
      <p class="wag-sum">${ICON[pick]} <b>${esc(draft.name || C.name)}</b> · @${esc(draft.id)}</p>
      <div class="wag-cta"><button type="button" data-back>‹ ${esc(T("Back"))}</button><button type="button" class="wag-go" data-create ${paying ? "disabled" : ""}>${!signed ? esc(T("Sign in to create your agent")) : price() ? (paying ? "⏳ " + esc(T(paying)) : "🔥 " + esc(T("Get my agent — {n} $ARCIRCLE", { n: price().toLocaleString("en-US") }))) : esc(T("Create my agent — free"))}</button></div>${price() ? `<p class="wag-fine">🔥 ${esc(T("50% of the price is burned, 50% goes to the ARCIRCLE treasury — sent from your own wallet on Arc."))}</p>` : ""}<p class="wag-fine">${esc(T("Your agent can't move your funds: anything on-chain will always ask your own wallet first."))}</p></div>`;
    el.innerHTML = `<div class="wag-card lab ${k}" style="--ac:${C.color}">${showcase(k)}<section class="wag-main"><header class="wag-h"><small class="wag-kick">${esc(T("Genesis Lab"))} · ${esc(T("Create your Agent. Give it a Purpose."))}</small>
      <div class="wag-nm"><h2>${esc(C.name)}</h2>${ICON[k] ? `<b class="wag-lv">${ICON[k]}</b>` : ""}</div><p class="wag-role">${esc(T(ROLE[k]))}</p><q class="wag-quote">${esc(T(LINE[k]))}</q>
      <button type="button" class="wag-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
      <div class="wag-body">${dots}${price() && step === 1 ? `<div class="wag-event launch"><b>🚀 ${esc(T("AGENT DIMENSION is open!"))}</b><span><s>${(st.pay.list || 0).toLocaleString("en-US")}</s> <em>${price().toLocaleString("en-US")} $ARCIRCLE</em> <i>${esc(T("50% OFF"))}</i></span><small>${esc(T("Pick AURORA, ORION or VEX. 50% of the price is burned, 50% goes to the treasury."))}</small></div>` : st && st.prelaunch !== false && step === 1 ? `<div class="wag-event"><b>🎉 ${esc(T("Pre-launch event"))}</b><span>${esc(T("Create your AI agent for free before AGENT DIMENSION officially opens. After the opening, creating an agent will cost."))}</span></div>` : ""}${form}</div></section></div>`;
    const id = el.querySelector(".wag-id"); if (id && draft.id) idInput(id);
  }
  const keepDraft = () => { const q = (c) => el.querySelector(c); if (q(".wag-id")) draft.id = idNorm(q(".wag-id").value); if (q(".wag-name")) draft.name = q(".wag-name").value; if (q(".wag-persona")) draft.persona = q(".wag-persona").value; };
  /// the birth: a cut-in over the window (its art forming in light, its number, its name)
  function birthCard(a) {
    const C = K.AGENTS[a.kind], d = document.createElement("div"); d.className = "wag-birth " + a.kind; d.style.setProperty("--ac", C.color); d.setAttribute("data-no-i18n", "");
    d.innerHTML = `<div><img src="${BIG(a.kind)}" alt=""><small>${esc(T("AGENT DIMENSION"))}</small><h2>${esc(a.name)}</h2><p>@${esc(a.id)}</p>${a.no ? `<b class="wag-no${a.founder ? " gold" : ""}">${no4(a.no)}${a.founder ? " · " + esc(T("Genesis Founder")) : ""}</b>` : ""}<em>${esc(T("{n} is online!", { n: a.name }))}</em><button type="button" data-share>📸 ${esc(T("Share card"))}</button></div>`;
    document.body.appendChild(d); const end = () => d.remove(); d.addEventListener("click", (e) => { if (e.target.closest("[data-share]")) shareCard(); end(); }); setTimeout(end, ctx.reduce ? 2600 : 4200);
  }
  function shareCard() {
    const a = A(); if (!a || !ctx.share) return; const C = K.AGENTS[a.kind];
    ctx.share({ kind: "agent", accent: C.color, art: BIG(a.kind), tag: T("My AI agent"), title: a.name, sub: `@${a.id} · ${T(ROLE[a.kind])}`, badge: a.founder ? T("Genesis Founder") : "",
      rows: [[T("Agent"), C.name, ICON[a.kind]], [T("Number"), no4(a.no), "#"], [T("Level"), T("Lv {n}", { n: a.lv }), "⭐"], [T("Errands done"), String(a.done || 0), "📋"]], text: T("Meet {n}, my AI agent in ARCIRCLE WORLD's AGENT DIMENSION!", { n: a.name }), foot: "AGENT DIMENSION" });
  }
  function paintTalk(a) {
    const lines = (a.log || []).flatMap((m) => [`<p class="me">${esc(m.q)}</p>`, `<p class="it">${esc(m.a)}</p>`]);
    const empty = `<p class="it">${esc(T("Hi! I'm {n}. Ask me anything about ARCIRCLE World — or send me on an errand.", { n: a.name }))}</p>`;
    const b = a.brief, by = b && b.yesterday;
    const brief = briefOn && b ? `<div class="wag-brief"><b>☀️ ${esc(T("Today's briefing"))}</b><span>${by && by.n ? esc(T("Yesterday: {n} errand(s)", { n: by.n })) + " · " + lootLine(by.loot) : esc(T("No errands yesterday — send me out today!"))}</span><span>${esc(T("Today: {d} errands and {c} messages left", { d: Math.max(0, b.jobsLeft), c: Math.max(0, b.chatLeft) }))}</span><button type="button" data-brief aria-label="${esc(T("Close"))}">×</button></div>` : "";
    const J = suggest && st.jobs && st.jobs[suggest], free = a.jobs.length < a.slots && a.jobsLeft > 0;
    const sug = J ? `<div class="wag-sug"><b>${JOB_IC[suggest] || "•"} ${esc(T("Send {n}: {j}?", { n: a.name, j: T(J.name) }))}</b><small>${J.arcl} ARCL · ⏱ ${esc(left(J.min * 60e3))}</small>${free ? `<span><button type="button" class="wag-go" data-job="${suggest}">${esc(T("Send"))}</button><button type="button" data-nosug>${esc(T("Not now"))}</button></span>` : `<small>${esc(T("No free errand slot right now."))}</small><span><button type="button" data-nosug>${esc(T("OK"))}</button></span>`}</div>` : "";
    return `${brief}<div class="wag-log">${lines.length ? lines.join("") : empty}${sending ? `<p class="it wag-typing"><i></i><i></i><i></i></p>` : ""}</div>${sug}
      <div class="wag-asks">${ASK.map((q) => `<button type="button" data-ask="${esc(T(q))}">${esc(T(q))}</button>`).join("")}</div>
      <div class="wag-send"><input class="wag-in" maxlength="280" placeholder="${esc(T("Say something to {n}", { n: a.name }))}" ${a.chatLeft <= 0 || sending ? "disabled" : ""}><button type="button" data-send ${a.chatLeft <= 0 || sending ? "disabled" : ""}>${esc(T("Send"))}</button></div>
      <p class="wag-fine">${esc(T("{n} of {m} messages left today", { n: Math.max(0, a.chatLeft), m: st.chatDay || 20 }))}</p>`;
  }
  function paintJobs(a) {
    const J = st.jobs || {}, now = Date.now(), best = { aurora: "gather", orion: "mine", vex: "scout" }[a.kind];
    const run = a.jobs.map((j) => { const done = now >= j.end, p = Math.min(1, (now - j.start) / Math.max(1, j.end - j.start));
      return `<div class="wag-run${done ? " done" : ""}"><span class="wag-ring" style="--p:${(p * 100).toFixed(0)}%" aria-hidden="true"><em>${JOB_IC[j.job] || "•"}</em></span><b>${esc(T((J[j.job] || {}).name || j.job))}</b><span>${done ? esc(T("Back!")) : esc(T("{t} left", { t: left(j.end - now) }))}</span>${done ? `<button type="button" data-claim="${esc(j.id)}">${esc(T("See what it brought"))}</button>` : ""}</div>`; }).join("");
    const free = a.jobs.length < a.slots && a.jobsLeft > 0;
    const cards = Object.entries(J).map(([id, j]) => `<div class="wag-job${id === best ? " best" : ""}"><i class="wag-jic" aria-hidden="true">${JOB_IC[id] || "•"}</i><div><b>${esc(T(j.name))}</b>${id === best ? `<em>${esc(T("{n}'s specialty +25%", { n: a.name }))}</em>` : ""}<small>${j.loot.map((m) => `${MAT[m] || "•"} ${esc(T(MAT_N[m] || m))}`).join(" · ")}</small><small>⏱ ${esc(left(j.min * 60e3))} · +${j.xp} XP</small></div>
      <button type="button" data-job="${id}" ${free ? "" : "disabled"}><img src="/images/arcl2-64.png" alt="" onerror="this.remove()"> ${j.arcl}</button></div>`).join("");
    // AD-City 2: the job board — errands lined up start by themselves when a slot frees (paid then), even while you're away
    const q = a.queue || [], qm = a.qMax || 4, note = a.qNote === "arcl" ? T("Waiting: not enough ARCL for the next errand.") : a.qNote === "day" ? T("Today's errands are used up — the board goes on tomorrow.") : "";
    // AD-City 1.5: the board's timeline — what's running and when each waiting errand should start (a slot frees in turn)
    const tl = (() => { const now2 = Date.now(), segs = a.jobs.map((j) => ({ job: j.job, s: Math.max(now2, j.start), e: j.end, run: true })), free = [...a.jobs.map((j) => Math.max(now2, j.end))];
      while (free.length < a.slots) free.push(now2); free.sort((x, y) => x - y);
      for (const id of q) { const J0 = J[id]; if (!J0) continue; const s0 = free.shift(), e0 = s0 + J0.min * 60e3; segs.push({ job: id, s: s0, e: e0 }); free.push(e0); free.sort((x, y) => x - y); }
      if (!segs.length) return ""; const end = Math.max(...segs.map((x) => x.e)), span = Math.max(1, end - now2), pc = (t) => (((t - now2) / span) * 100).toFixed(1);
      const lanes = []; segs.forEach((x) => { let l = lanes.findIndex((ln) => ln <= x.s + 1000); if (l < 0) { lanes.push(0); l = lanes.length - 1; } lanes[l] = x.e; x.l = l; });
      return `<div class="wag-tl" style="--n:${Math.max(1, lanes.length)}">${segs.map((x) => `<i class="${x.run ? "run" : ""} j-${x.job}" style="left:${pc(x.s)}%;width:${Math.max(4, pc(x.e) - pc(x.s))}%;top:calc(${x.l} * 26px)"><span aria-hidden="true">${JOB_IC[x.job] || "•"}</span></i>`).join("")}<b class="wag-tl-a">${esc(T("now"))}</b><b class="wag-tl-b">+${esc(left(span))}</b></div>`; })();
    const board = `<h3>📋 ${esc(T("Job board"))} <small>${q.length}/${qm}</small></h3>${tl}<div class="wag-board">${q.length ? q.map((id, i) => `<span class="wag-q"><i aria-hidden="true">${JOB_IC[id] || "•"}</i>${esc(T((J[id] || {}).name || id))}<button type="button" data-qdel="${i}" aria-label="${esc(T("Remove"))}">×</button></span>`).join("") : `<p class="wag-fine">${esc(T("Line up errands: when a slot frees, the next one starts by itself — even while you're away. Each is paid when it starts."))}</p>`}
      ${note ? `<p class="wag-qnote">${esc(note)}</p>` : ""}<div class="wag-qadd">${Object.entries(J).map(([id, j]) => `<button type="button" data-qadd="${id}" ${q.length >= qm ? "disabled" : ""}>+ ${JOB_IC[id] || "•"} ${esc(T(j.name))}</button>`).join("")}</div></div>`;
    return `${run ? `<h3>${esc(T("On the way"))}</h3>${run}` : ""}${board}<h3>${esc(T("Send {n} on an errand", { n: a.name }))}</h3>${cards}
      <p class="wag-fine">${esc(T("Errands cost ARCL and bring back materials, not ARCL. {k} errand slot(s) · {d} errands left today.", { k: a.slots, d: Math.max(0, a.jobsLeft) }))}${a.lv < 5 ? " " + esc(T("A second slot opens at agent level 5.")) : ""}</p>`;
  }
  function paintMe(a) {
    const lv = a.lv, x0 = 10 * (lv - 1) ** 2, x1 = 10 * lv ** 2, p = Math.min(1, (a.xp - x0) / Math.max(1, x1 - x0));
    return `<div class="wag-me"><div class="wag-xp"><b>${esc(T("Lv {n}", { n: lv }))}</b><i style="--p:${(p * 100).toFixed(0)}%"></i><small>${a.xp} / ${x1} XP</small></div>
      <label>${esc(T("Name"))}<input class="wag-name" maxlength="14" value="${esc(a.name)}"></label>
      <label>${esc(T("Personality"))}<input class="wag-persona" maxlength="160" value="${esc(a.persona || "")}" placeholder="${esc(T("e.g. cheerful, loves dinosaurs"))}"></label>
      <button type="button" class="wag-go" data-save>${esc(T("Save"))}</button>
      <div class="wag-card2">${a.no ? `<b class="wag-no${a.founder ? " gold" : ""}">${no4(a.no)}${a.founder ? " · " + esc(T("Genesis Founder")) : ""}</b>` : ""}<small>${esc(T("{d} errands done", { d: a.done || 0 }))}</small><button type="button" data-share>📸 ${esc(T("Share card"))}</button></div>
      <h3>🏆 ${esc(T("This week's busiest agents"))}</h3>${paintTop(a)}
      <h3>${esc(T("What {n} does", { n: a.name }))}</h3><ul class="wag-does">${DOES[a.kind].map((d) => `<li>${esc(T(d))}</li>`).join("")}</ul>
      <h3>${esc(T("Coming next to AGENT DIMENSION"))}</h3><ul class="wag-does soon"><li>${esc(T("Agent Academy: skills and new looks as it levels"))}</li><li>${esc(T("Agent Arena: weekly agent battles"))}</li><li>${esc(T("Web3 tools: token reports, wallet watch, launch drafts — every on-chain step approved in your own wallet"))}</li></ul></div>`;
  }
  // ---------------- the Vault tab (AD3) ----------------
  let vst = null, vAt = 0, vBusy = false, vKind = "dca";
  async function vLook(force) {
    const w = wallet(); if (!w) return; if (!force && vst && Date.now() - vAt < 20e3) return; vAt = Date.now();
    try { const r = await fetch("/api/social?world=agent-vault&wallet=" + encodeURIComponent(w), { cache: "no-store" }); if (r.ok) vst = await r.json(); } catch { /* the next look */ }
    if (shown() && tab === "vault" && !report) paint();
  }
  const n2 = (x) => (x == null ? "—" : Number(x).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  const short = (x) => String(x).slice(0, 6) + "…" + String(x).slice(-4);
  function ruleLine(r) {
    const t = short(r.token);
    if (r.kind === "dca") return T("Buy {u} USDC of {t} every {h}h", { u: r.usd, t, h: r.everyH });
    if (r.kind === "buyBelow") return T("Buy {u} USDC of {t} at ≤ ${p}", { u: r.usd, t, p: r.price });
    if (r.kind === "takeProfit") return T("Sell {n}% of {t} at ≥ ${p}", { n: r.pct, t, p: r.price });
    return T("Sell {n}% of {t} at ≤ ${p}", { n: r.pct, t, p: r.price });
  }
  function paintVault(a) {
    vLook();
    const v = vst, rules = `<p class="wag-fine">${esc(T("Every trade is at most 100 USDC. The fee is paid in $ARCIRCLE from the vault. Money only ever goes back to your own wallet, and every vault step is signed in your wallet."))}</p>`;
    if (!v) return `<p class="wag-fine">${esc(T("Loading…"))}</p>`;
    if (!v.factory) return `<div class="wag-vault soon"><b>💼 ${esc(T("Agent Vault — opening soon"))}</b><span>${esc(T("Your agent will trade for you from your own vault on Arc: buy every few hours, buy a dip, take profit, stop loss."))}</span></div>${rules}`;
    if (!v.vault) return `<div class="wag-vault"><b>💼 ${esc(T("Open your Agent Vault"))}</b><span>${esc(T("One vault per wallet, on Arc. You set the limits; the agent can never go over them."))}</span>
      <div class="wag-lims"><label>${esc(T("Per trade (USDC)"))}<input class="wag-vmax" type="number" min="1" max="100" value="25"></label><label>${esc(T("A day (USDC)"))}<input class="wag-vday" type="number" min="1" max="10000" value="100"></label><label>${esc(T("Wait between trades (min)"))}<input class="wag-vcd" type="number" min="1" value="10"></label></div>
      <div class="wag-cta"><button type="button" data-vlink>${esc(T("I already have one"))}</button><button type="button" class="wag-go" data-vopen ${vBusy ? "disabled" : ""}>${esc(T("Open my vault"))}</button></div></div>${rules}`;
    const c = v.chain || {};
    const head = `<div class="wag-vault"><div class="wag-vrow"><b>💼 ${esc(short(v.vault))}</b><a href="https://arcscan.app/address/${esc(v.vault)}" target="_blank" rel="noopener">${esc(T("on Arcscan"))} ↗</a></div>
      <div class="wag-vnums"><span><small>USDC</small><b>${n2(c.usdc)}</b></span><span><small>$ARCIRCLE</small><b>${n2(c.fee)}</b></span><span><small>${esc(T("Per trade"))}</small><b>${n2(c.maxPerTx)}</b></span><span><small>${esc(T("Left today"))}</small><b>${n2(c.spendable)}</b></span></div>
      <small class="wag-fine">${esc(T("Fee a trade: {f} $ARCIRCLE", { f: n2(c.tradeFee) }))} · ${esc(T("{n} trades", { n: c.trades || 0 }))}${c.paused ? " · ⏸ " + esc(T("paused")) : ""}${c.agentOn === false ? " · " + esc(T("agent off")) : ""}${v.live ? "" : " · " + esc(T("dry run: the agent's key isn't set yet"))}</small>
      <div class="wag-vfund"><input class="wag-vamt" type="number" min="0" step="any" placeholder="${esc(T("Amount"))}"><button type="button" data-vfund="usdc">+ USDC</button><button type="button" data-vfund="arc">+ $ARCIRCLE</button></div>
      <div class="wag-vfund"><input class="wag-vtok" maxlength="42" placeholder="${esc(T("Token address (0x…)"))}"><button type="button" data-vallow>${esc(T("Allow token"))}</button></div>
      <div class="wag-vbtns"><button type="button" data-vpause="${c.paused ? 0 : 1}">${c.paused ? "▶ " + esc(T("Resume")) : "⏸ " + esc(T("Pause"))}</button><button type="button" data-von="${v.on ? 0 : 1}">${v.on ? esc(T("Stop the agent")) : esc(T("Start the agent"))}</button><button type="button" data-vout>⬇ ${esc(T("Withdraw all USDC"))}</button></div></div>`;
    const list = (v.rules || []).map((r) => `<li class="${r.done ? "done" : ""}"><span>${esc(ruleLine(r))}${r.done ? ` · ✓ ${esc(T("done"))}` : ""}</span><button type="button" data-vdel="${esc(r.id)}" aria-label="${esc(T("Remove"))}">×</button></li>`).join("");
    const k = vKind, f = (cls, ph, min, max) => `<input class="${cls}" type="number" step="any" min="${min}"${max ? ` max="${max}"` : ""} placeholder="${esc(T(ph))}">`;
    const form = `<div class="wag-vrule"><select class="wag-vkind">${Object.entries(RK).map(([id, l]) => `<option value="${id}"${id === k ? " selected" : ""}>${esc(T(l))}</option>`).join("")}</select>
      <input class="wag-vrtok" maxlength="42" placeholder="${esc(T("Token address (0x…)"))}">
      ${k === "dca" || k === "buyBelow" ? f("wag-vusd", "USDC (≤ 100)", 1, 100) : f("wag-vpct", "% of the bag", 1, 100)}${k === "dca" ? f("wag-vh", "Every … hours", 1, 168) : f("wag-vpx", "Price ($)", 0)}
      <button type="button" class="wag-go" data-vadd>${esc(T("Add rule"))}</button></div>`;
    const log = (v.log || []).slice(0, 8).map((x) => `<li><i>${x.buy ? "🟢" : "🔴"}</i><span>${esc(T(RK[x.kind] || x.kind))} · ${esc(short(x.token))}</span><small>${x.tx ? `<a href="https://arcscan.app/tx/${esc(x.tx)}" target="_blank" rel="noopener">tx ↗</a>` : esc(x.err ? T("failed") : T("ready (dry run)"))}</small></li>`).join("");
    return `${head}<h3>${esc(T("Rules"))}</h3><ul class="wag-vrules">${list || `<li class="empty">${esc(T("No rules yet — add one below."))}</li>`}</ul>${form}${log ? `<h3>${esc(T("Activity"))}</h3><ul class="wag-vlog">${log}</ul>` : ""}${rules}`;
  }
  async function vTx(to, data, okMsg) {
    if (!ctx.tx) { ctx.toast(T("Wallet connect isn't available here.")); return false; } vBusy = true;
    try { await ctx.tx(to, data); ctx.toast(okMsg || T("Sent — it shows here once Arc confirms it")); setTimeout(() => vLook(true), 6000); return true; }
    catch (e) { ctx.toast(e && e.code === 4001 ? T("Cancelled in your wallet") : String((e && e.message) || T("Something went wrong — try again")).slice(0, 120)); return false; } finally { vBusy = false; }
  }
  async function vLink(tries = 1) {
    for (let i = 0; i < tries; i++) { const r = await act({ action: "world-agent-vault-link" }); if (r && r.ok) { vst = null; await vLook(true); ctx.toast(T("Your vault is linked")); return true; } if (i < tries - 1) await new Promise((ok) => setTimeout(ok, 5000)); else fail(r); }
    return false;
  }
  async function vRules(list, on) { const r = await act({ action: "world-agent-rules", rules: list, ...(on != null ? { on } : {}) }); if (!r || !r.ok) return fail(r); if (vst) { vst.rules = r.j.rules; vst.on = r.j.on; } paint(); }
  async function vClick(b) {
    const q = (c) => el.querySelector(c), num = (c) => Number((q(c) || {}).value), v = vst || {};
    if (b.hasAttribute("data-vopen")) { const m = num(".wag-vmax"), d = num(".wag-vday"), cd = num(".wag-vcd");
      if (!(m >= 1 && m <= 100) || !(d >= m) || !(cd >= 1)) return ctx.toast(T("Per trade: 1–100 USDC; a day at least that; a wait of at least 1 minute"));
      if (await vTx(v.factory, SEL.create + w64(Math.round(m * 1e6)) + w64(Math.round(d * 1e6)) + w64(Math.round(cd * 60)), T("Opening your vault…"))) vLink(6); return; }
    if (b.hasAttribute("data-vlink")) return vLink(1);
    if (b.dataset.vfund) { const amt = num(".wag-vamt"); if (!(amt > 0)) return ctx.toast(T("Enter an amount"));
      const tok = b.dataset.vfund === "usdc" ? USDC : ctx.arcircle, units = b.dataset.vfund === "usdc" ? BigInt(Math.round(amt * 1e6)) : BigInt(Math.round(amt * 1e6)) * 10n ** 12n;
      if (!tok) return ctx.toast(T("Wallet connect isn't available here."));
      return vTx(tok, SEL.transfer + a64(v.vault) + w64(units)); }
    if (b.hasAttribute("data-vallow")) { const t = String((q(".wag-vtok") || {}).value || "").trim(); if (!/^0x[0-9a-fA-F]{40}$/.test(t)) return ctx.toast(T("Enter a token address (0x…)")); return vTx(v.vault, SEL.allow + a64(t)); }
    if (b.dataset.vpause) return vTx(v.vault, SEL.pause + w64(Number(b.dataset.vpause)));
    if (b.dataset.von) return vRules(v.rules || [], b.dataset.von === "1");
    if (b.hasAttribute("data-vout")) { const c = v.chain; if (!c || !(c.usdc > 0)) return ctx.toast(T("No USDC in the vault")); return vTx(v.vault, SEL.withdraw + a64(USDC) + w64(Math.floor(c.usdc * 1e6))); }
    if (b.dataset.vdel) return vRules((v.rules || []).filter((r) => r.id !== b.dataset.vdel));
    if (b.hasAttribute("data-vadd")) { const kind = (q(".wag-vkind") || {}).value || "dca", token = String((q(".wag-vrtok") || {}).value || "").trim().toLowerCase();
      const r = { id: kind.slice(0, 3) + Date.now().toString(36).slice(-5), kind, token };
      if (kind === "dca" || kind === "buyBelow") r.usd = num(".wag-vusd"); else r.pct = num(".wag-vpct");
      if (kind === "dca") r.everyH = num(".wag-vh"); else r.price = num(".wag-vpx");
      if (!/^0x[0-9a-f]{40}$/.test(token)) return ctx.toast(T("Enter a token address (0x…)"));
      if ((r.usd != null && !(r.usd >= 1 && r.usd <= 100)) || (r.pct != null && !(r.pct >= 1 && r.pct <= 100)) || (r.everyH != null && !(r.everyH >= 1 && r.everyH <= 168)) || (r.price != null && !(r.price > 0))) return ctx.toast(T("Check the numbers: at most 100 USDC a trade"));
      return vRules([...(v.rules || []), r]); }
  }
  function paintTop(a) {
    if (!topList || Date.now() - topAt > 60e3) { topAt = Date.now(); fetch("/api/social?world=agent-top").then((r) => r.json()).then((j) => { topList = j.top || []; if (shown() && tab === "me" && !report) paint(); }).catch(() => { topList = topList || []; }); }
    if (!topList) return `<p class="wag-fine">${esc(T("Loading…"))}</p>`;
    if (!topList.length) return `<p class="wag-fine">${esc(T("No errands this week yet — be the first!"))}</p>`;
    return `<ol class="wag-top">${topList.map((r, i) => `<li class="${r.id && r.id === a.id ? "me" : ""}"><i>${["🥇", "🥈", "🥉"][i] || i + 1}</i><img src="${PORTRAIT(r.kind)}" alt=""><b>${esc(r.name)}</b><small>${r.id ? "@" + esc(r.id) : ""} · ${esc(T("Lv {n}", { n: r.lv }))}</small><em>${r.n}</em></li>`).join("")}</ol>`;
  }
  function paintReport(a) {
    const r = report, chips = Object.entries(r.loot || {}).map(([k, n]) => `<span>${MAT[k] || "•"} ${n} ${esc(T(MAT_N[k] || k))}</span>`).join("");
    return `<div class="wag-rep"><h3>${esc(T("{n} is back!", { n: a.name }))}</h3><p class="wag-desc">${esc(T(DESC[a.kind]))}</p>
      <div class="wag-chips fly">${chips || `<span>${esc(T("Nothing this time"))}</span>`}</div>
      ${r.best ? `<p class="wag-best">» ${esc(T("{n}'s specialty: a quarter more", { n: a.name }))}</p>` : ""}
      <div class="wag-xpbox"><b>⭐ +${r.xp} XP${r.up ? ` · ${esc(T("Level up! Lv {n}", { n: r.lv }))}` : ""}</b><small>${esc(r.job === "mine" ? T("The ore is in your ARCL Mine bag.") : T("The materials are in your Jurassic pack."))}</small></div></div>
      <button type="button" class="wag-go" data-ok>${esc(T("Great!"))}</button>`;
  }
  // the agent ID: lowercase letters, numbers and _, 3–16; checked as you type (the server has the last word)
  const ID_RE = /^[a-z0-9_]{3,16}$/, idNorm = (x) => String(x || "").trim().toLowerCase().replace(/^@/, "");
  let idT = 0, idSeq = 0;
  function idState(t, k) { const e = el && el.querySelector(".wag-idst"); if (e) { e.textContent = t; e.className = "wag-idst " + (k || ""); } }
  function idInput(inp) {
    const v = idNorm(inp.value).replace(/[^a-z0-9_]/g, ""); if (v !== inp.value) inp.value = v; clearTimeout(idT);
    if (!v) return idState("", ""); if (!ID_RE.test(v)) return idState(T("3–16 letters, numbers or _"), "bad");
    idState(T("Checking…"), ""); const n = ++idSeq;
    idT = setTimeout(async () => { try { const r = await fetch("/api/social?world=agent-id&id=" + encodeURIComponent(v), { cache: "no-store" }); const j = await r.json(); if (n !== idSeq) return;
      idState(j.free ? T("@{id} is free", { id: v }) : j.bad ? T("That ID can't be used") : T("@{id} is taken — try another", { id: v }), j.free ? "ok" : "bad"); }
      catch { if (n !== idSeq) return; if (!inp.dataset.retry) { inp.dataset.retry = "1"; setTimeout(() => { if (n === idSeq) idInput(inp); }, 1500); } else idState(T("Couldn't check now — it's checked when you create"), ""); } }, 450);
  }

  // ---------------- actions ----------------
  const fail = (r, msg) => { ctx.toast((r && r.j && r.j.error) || msg || T("Something went wrong — try again")); };
  async function act(body0) {
    const s = ctx.sess(); if (!s) { try { await ctx.signIn(); } catch { return null; } }
    const s2 = ctx.sess(); if (!s2) return null;
    try { return await ctx.post({ ...body0, wallet: s2.wallet, issued: s2.issued, signature: s2.signature }); } catch { return { ok: false, j: { error: T("No connection — try again") } }; }
  }
  let paying = "";
  const price = () => (st && st.pay && !st.prelaunch && st.pay.price > 0 ? st.pay.price : 0);
  async function create() {
    if (!pick) return; keepDraft(); const name = draft.name, persona = draft.persona, id = draft.id;
    if (!ID_RE.test(id)) { labStep = 2; paint(); idState(T("3–16 letters, numbers or _"), "bad"); const f = el.querySelector(".wag-id"); if (f) f.focus(); return; }
    // the launch price: 100,000 $ARCIRCLE from the player's own wallet to FeeBurn (50% burned, 50% to the treasury); a
    // payment already sent (its agent not made yet — an ID taken, a closed tab) is used again, never paid twice
    let tx = "";
    if (price() && st.pay && st.pay.to) {
      const wk = "arc.agent.paid." + wallet(); try { tx = localStorage.getItem(wk) || ""; } catch { tx = ""; }
      if (!tx) {
        const ok = await act({ action: "world-agent-create", kind: pick, id, name, persona, check: 1 }); // (the server checks the ID before anything is paid)
        if (ok && !ok.ok && ok.j && ok.j.taken) { labStep = 2; paint(); idState(T("@{id} is taken — try another", { id }), "bad"); return; }
        if (ok && !ok.ok && ok.j && ok.j.agent) return create2(ok);
        if (!ctx.tx || !st.pay.token) { ctx.toast(T("Wallet connect isn't available here.")); return; }
        paying = "Confirm in your wallet…"; paint();
        const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
        try { tx = await ctx.tx(st.pay.token, "0xa9059cbb" + pad(st.pay.to) + pad(BigInt(st.pay.amount).toString(16))); } catch (e) { paying = ""; paint(); ctx.toast(e && e.code === 4001 ? T("Cancelled in the wallet") : T("The transfer didn't go through: {e}", { e: String((e && e.message) || e).slice(0, 80) })); return; }
        try { localStorage.setItem(wk, tx); } catch { /* the server still keeps the payment for this wallet */ }
      }
      paying = "Waiting for Arc to confirm…"; paint();
      let r = null; for (let i = 0; i < 40; i++) { r = await act({ action: "world-agent-create", kind: pick, id, name, persona, tx }); if (!r || r.status !== 202) break; await new Promise((ok) => setTimeout(ok, 3000)); }
      paying = ""; if (r && (r.ok || (r.j && r.j.agent) || (r.j && /already used/.test(r.j.error || "")))) try { localStorage.removeItem(wk); } catch { /* fine */ }
      if (r && r.status === 202) { paint(); ctx.toast(T("Your payment is still confirming on Arc — try Create again in a minute; it won't charge you twice.")); return; }
      return create2(r);
    }
    const r = await act({ action: "world-agent-create", kind: pick, id, name, persona }); if (!r) return;
    return create2(r);
  }
  async function create2(r) {
    if (!r) { paint(); return; } const id = draft.id;
    if (!r.ok && r.j && r.j.taken) { labStep = 2; paint(); idState(T("@{id} is taken — try another", { id }), "bad"); return; }
    if (!r.ok && !(r.j && r.j.agent)) { paint(); return fail(r); }
    st = { ...(st || {}), agent: r.j.agent }; if (!st.jobs) await look();
    tab = "talk"; labStep = 1; arrive = "birth"; paint(); paintChip(); spawn(); if (ctx.burst) ctx.burst(parseInt(K.AGENTS[pick].color.slice(1), 16));
    birthCard(r.j.agent);
  }
  async function send(text) {
    const inp = el.querySelector(".wag-in"), t = String(text != null ? text : inp ? inp.value : "").trim(); if (!t || sending) return;
    const a = A(); if (!a || a.chatLeft <= 0) return;
    sending = true; suggest = ""; a.log = [...(a.log || []), { q: t, a: "…" }]; paint(); a.log.pop(); bubble("…", 0);
    const r = await act({ action: "world-agent-chat", t }); sending = false;
    if (!r || !r.ok) { bubble(""); paint(); return fail(r); }
    a.log = [...(a.log || []), { q: t, a: r.j.reply }].slice(-12); a.chatLeft = r.j.left; suggest = r.j.suggest || ""; paint(); bubble(r.j.reply);
    if (body && body.play && !body.busy()) try { body.play(r.j.offline ? "emote-no" : "emote-yes", { once: true }); } catch { /* no clip */ }
  }
  async function job(id) {
    const r = await act({ action: "world-agent-job", job: id }); if (!r) return;
    if (!r.ok) return fail(r);
    st.agent = r.j.agent; suggest = ""; ctx.toast(T("{n} set off — back in {t}", { n: r.j.agent.name, t: left(st.jobs[id].min * 60e3) })); if (ctx.purse) ctx.purse(true);
    try { if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {}); } catch { /* not on this browser */ }
    if (body && body.play) try { body.play("emote-yes", { once: true }); } catch { /* no clip */ }
    bubble(T("On my way!"), 1200); setTimeout(() => depart(() => spawn()), 700); paint(); paintChip();
  }
  async function board(o) {
    if (busy) return; busy = true; const r = await act({ action: "world-agent-queue", ...o }); busy = false; if (!r) return;
    if (!r.ok) return fail(r);
    const was = (A() && A().jobs.length) || 0; st.agent = r.j.agent; paint(); paintChip(); if (ctx.purse) ctx.purse(true);
    if (o.op === "add") ctx.toast(st.agent.jobs.length > was ? T("{n} set off — back in {t}", { n: st.agent.name, t: left(st.jobs[o.job].min * 60e3) }) : T("On the job board"));
    if (st.agent.jobs.length > was) setTimeout(() => depart(() => spawn()), 500);
  }
  async function claim(id) {
    const r = await act({ action: "world-agent-claim", id }); if (!r) return;
    if (!r.ok) { if (r.j && r.j.agent) st.agent = r.j.agent; paint(); return fail(r); }
    st.agent = r.j.agent; report = r.j; arrive = "light"; if (r.j.up) lvUp = r.j.lv; paint(); paintChip(); spawn(); flyLoot();
    if (ctx.burst) ctx.burst(parseInt(K.AGENTS[st.agent.kind].color.slice(1), 16));
  }
  /// the loot flies from the report to the bag button (or the bottom of the screen)
  function flyLoot() {
    if (ctx.reduce || !el) return; const to = [...document.querySelectorAll("#wp-dk-bag, #wp-bag-btn, #wp-dock")].find((x) => x.offsetParent), tr = to ? to.getBoundingClientRect() : { left: innerWidth - 60, top: innerHeight - 60, width: 40, height: 40 };
    el.querySelectorAll(".wag-chips.fly span").forEach((c, i) => { const r = c.getBoundingClientRect(), f = c.cloneNode(true); f.className = "wag-fly"; f.style.left = r.left + "px"; f.style.top = r.top + "px"; document.body.appendChild(f);
      const dx = tr.left + tr.width / 2 - r.left - r.width / 2, dy = tr.top + tr.height / 2 - r.top - r.height / 2;
      const an = f.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 80}px) scale(1.15)`, opacity: 1, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) scale(0.3)`, opacity: 0 }], { duration: 900, delay: 500 + i * 140, easing: "ease-in", fill: "forwards" });
      an.onfinish = () => f.remove(); setTimeout(() => f.remove(), 3000); });
  }
  async function save() {
    const name = (el.querySelector(".wag-name") || {}).value, persona = (el.querySelector(".wag-persona") || {}).value;
    const r = await act({ action: "world-agent-edit", name, persona }); if (!r || !r.ok) return fail(r);
    st.agent = r.j.agent; ctx.toast(T("Saved")); bodyKind = ""; spawn(); paint();
  }
  function onClick(e) {
    if (e.target === el || e.target.closest("[data-x]")) return close();
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.tab) { tab = b.dataset.tab; report = null; return paint(); }
    if (b.dataset.pick) { pick = b.dataset.pick; labStep = 2; draft.name = ""; return paint(); }
    if (b.hasAttribute("data-next")) { keepDraft(); if (!ID_RE.test(draft.id)) { idState(T("3–16 letters, numbers or _"), "bad"); return; } labStep = 3; return paint(); }
    if (b.hasAttribute("data-back")) { keepDraft(); if (labStep <= 2) { pick = null; labStep = 1; } else labStep = 2; return paint(); }
    if (b.hasAttribute("data-brief")) { briefOn = false; return paint(); }
    if (b.hasAttribute("data-nosug")) { suggest = ""; return paint(); }
    if (b.hasAttribute("data-share")) return shareCard();
    if (b.dataset.view || b.dataset.nav) { const cur = closed() ? view || "orion" : A() ? view || A().kind : pick || "aurora", nx = b.dataset.view || K3[(K3.indexOf(cur) + Number(b.dataset.nav) + 3) % 3]; if (closed()) { view = nx; return paint(); } if (A()) view = nx; else { if (pick) keepDraft(); pick = nx; draft.name = ""; if (labStep < 2) labStep = 2; } return paint(); }
    if (b.dataset.preset) { const p = el.querySelector(".wag-persona"); if (p) p.value = b.dataset.preset; return; }
    if (b.hasAttribute("data-create")) return create();
    if (b.hasAttribute("data-send")) return send();
    if (b.dataset.ask) return send(b.dataset.ask);
    if (b.dataset.job) return job(b.dataset.job);
    if (b.dataset.claim) return claim(b.dataset.claim);
    if (b.dataset.qadd) return board({ op: "add", job: b.dataset.qadd });
    if (b.dataset.qdel) return board({ op: "del", i: Number(b.dataset.qdel) });
    if (b.hasAttribute("data-save")) return save();
    if (b.hasAttribute("data-ok")) { report = null; return paint(); }
    if (Object.keys(b.dataset).some((k) => k.startsWith("v") && k !== "view")) return vClick(b);
  }

  setTimeout(look, 1500);
  setInterval(() => { if (Date.now() - last > (document.hidden ? 180e3 : 90e3)) look(); else { paintChip(); notify(); if (!away() && A() && !bodyKind) spawn(); if (shown() && tab === "jobs" && !report) paint(); } }, 5000);
  /// AD-City 1: may this player go into Nexus City? (the same gate as the window: GM wallets while AGENT DIMENSION is closed)
  async function canEnter() { if (!wallet()) return false; if (!st || Date.now() - last > 60e3) await look(); return !closed(); }
  return { open, close, shown, look, tick, paintChip, canEnter, state: () => st,
    debug: () => ({ kind: bodyKind, agent: A() && { name: A().name, lv: A().lv, jobs: A().jobs.length, chatLeft: A().chatLeft }, clips: body && body.mixer && body.mixer._actions ? body.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.5).map((x) => x.getClip().name) : [], pos: body ? [+body.obj.position.x.toFixed(1), +body.obj.position.z.toFixed(1)] : null, on: ctx.inHub(), ticks, mt: body && body.mixer ? +body.mixer.time.toFixed(2) : 0, chip: chip ? chip.textContent : "", chipShown: chip ? !chip.hidden : false }) };
}
