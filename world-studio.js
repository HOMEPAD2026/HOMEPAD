// world-studio.js — ARCIRCLE Studio Lite (AD-City 3, the owner's call 2026-10-23), opened from Nexus City's ARCIRCLE Studio.
// Make a game from a template (Sky Runner now; Arena / Puzzle / Defense listed as coming), with your agent's help (it
// drafts the settings from your words), test it, save it, publish it to the Creator Arcade, and play everyone's games.
// A game is numbers on a template (world-studio-gen.js, the server's own copy): the level is built from them, seeded,
// so it plays the same for everyone. What's kept and counted is the server's (api/_world-studio.mjs); nothing pays ARCL.
//   the window   Create (templates, the agent's draft, the settings, test / save / publish) · My games · Arcade
//   the runner   its own scene drawn instead of the town (st.view / st.solo, like the Game Village's games): three lanes,
//                your hero runs (sprint), jumps the gaps (jump), slides under lasers (dodge), switches lanes past walls,
//                grabs coins; three hearts; the finish arch; a result card (score, your best, your place)
import { TEMPLATES, THEMES, LENS, LANES, KNOBS, PRESETS, DEF, clampSpec, toBuild, genLevel, scoreOf, speedOf, dashSpeed, estimate, puzzleScore, climbGaps } from "./world-studio-gen.js";
import { makePreview } from "./world-studio-prev.js";
import { level as ringLevel } from "./world-rings-engine.js";
// Studio 2 (2026-10-24): two more templates (Infinity Dash: the lanes without a finish, faster and faster; Arena Survival:
// seen from above, drones from the edge, laser sweeps, coins, last the time), a preview strip of the level in the editor,
// a share link (/play?sg=<id>), and the runs' effects (coin pops and a combo, speed lines, a slow-mo near miss under a
// laser, confetti at the finish, "New best!")
const ICON = { runner: "🏃", dash: "♾️", arena: "🛸", puzzle: "🧩", climb: "🧗", defense: "🛡️" };
const LEN_NAME = { defense: { 30: "5 waves", 45: "8 waves", 60: "10 waves", 90: "15 waves" }, climb: { 30: "120 m", 45: "180 m", 60: "240 m", 90: "360 m" }, dash: { 30: "Gentle", 45: "Steady", 60: "Fast", 90: "Wild" }, puzzle: { 30: "No hints", 45: "1 hint", 60: "2 hints", 90: "3 hints" } };

/// ctx: { THREE, K, st, T, esc, toast, Snd, reduce, low, coarse, sess, post, signIn, makeHero(), agentName(), onOpen, onClose }
export function createStudio(ctx) {
  const { THREE, T, esc } = ctx;
  const nextSeen = new Set(); let el = null, tab = "make", gid = "", gdata = null, ghostOn = true, step = 1, prev = null, prevOk = true, snaps = {}, lastTest = null, advOpen = false, spec = clampSpec({ seed: 1 + Math.floor(Math.random() * 99999) }), editId = "", mine = [], arcade = [], busy = false, playing = null, lastRun = null, aiNote = "";
  const wallet = () => { const s = ctx.sess(); return s ? String(s.wallet).toLowerCase() : ""; };
  // STU-A (2026-10-26): a guest's drafts live on this device until they sign in (then they go up with one tap)
  const LKEY = "arc.studio.local", locals = () => { try { const a = JSON.parse(localStorage.getItem(LKEY) || "[]"); return Array.isArray(a) ? a.filter((d) => d && d.id && d.spec) : []; } catch { return []; } };
  const setLocals = (a) => { try { localStorage.setItem(LKEY, JSON.stringify(a.slice(0, 12))); } catch { /* not kept */ } };
  // STU-A: each card's picture is its own level drawn by the preview (one a moment, kept for the window's life)
  const thumbs = new Map(); let thumbQ = [], thumbT = 0;
  // STU-C: the arcade's search / sort / template filter, the weekly contest, a remix's origin
  let aq = "", asort = "pop", atpl = "", week = null, remixFrom = "";
  const hex = (c) => "#" + c.toString(16).padStart(6, "0");
  async function act(body) {
    if (!ctx.sess()) { try { await ctx.signIn(); } catch { return null; } }
    const s = ctx.sess(); if (!s) return null;
    try { return await ctx.post({ ...body, wallet: s.wallet, issued: s.issued, signature: s.signature }); } catch { return { ok: false, j: { error: T("No connection — try again") } }; }
  }
  const fail = (r) => { const e = r && r.j && r.j.error; ctx.toast(e ? (r.j.closed ? "🚧 " + T("Being built") : esc(e)) : T("Couldn't open it — try again")); };
  async function load() {
    try { const r = await fetch("/api/social?world=studio-arcade", { cache: "no-store" }); if (r.ok) arcade = (await r.json()).games || []; } catch { /* the next look */ }
    try { const r = await fetch("/api/social?world=studio-week", { cache: "no-store" }); if (r.ok) week = await r.json(); } catch { /* the next look */ }
    const w = wallet(); if (w) try { const r = await fetch("/api/social?world=studio-mine&wallet=" + w, { cache: "no-store" }); if (r.ok) mine = (await r.json()).games || []; } catch { /* the next look */ }
    if (el && !el.hidden) { if (tab === "game" && gid) return openGame(gid); paint(); } /* (back from a run on a game's page: its top 10 read again) */
  }

  // ---------------- the window ----------------
  function shell() {
    if (el) return el; el = document.createElement("div"); el.className = "wst"; el.hidden = true; document.body.appendChild(el);
    el.addEventListener("click", onClick); el.addEventListener("input", onInput); el.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches(".wst-adv")) advOpen = e.target.open; }, true);
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    return el;
  }
  function open(t) { shell(); if (t) tab = t; el.hidden = false; paint(); load(); if (ctx.onOpen) ctx.onOpen(); }
  function close() { if (el) el.hidden = true; if (prev) { prev.dispose(); prev = null; } if (ctx.onClose) ctx.onClose(); }
  const shown = () => !!el && !el.hidden;
  const slider = (k, lab, max, min = 0) => `<label class="wst-sl"><span>${esc(T(lab))} <b>${spec[k]}</b></span><input type="range" min="${min}" max="${max}" step="1" value="${spec[k]}" data-k="${k}"></label>`;
  // Studio 3: the editor in five steps (a bar at the top, Back / Next at the bottom), the live 3D preview over them
  const STEPS = [["Template", "Pick a template"], ["Theme", "Pick a look"], ["Difficulty", "How hard should it be?"], ["Test", "Try it before anyone else"], ["Publish", "Save it and put it on the arcade"]];
  const PNAME = { easy: "Easy", normal: "Normal", hard: "Hard", extreme: "Extreme" }, WHY = { wall: "walls", gap: "gaps", laser: "lasers", d: "drones", D: "big drones", L: "laser sweeps", mwall: "moving walls", blink: "blinking lasers", g: "grunts", r: "runners", t: "tanks", plat: "platforms", mplat: "moving platforms", break: "breaking platforms", spring: "springs" };
  const starsTxt = (n) => `<span class="wst-stars" aria-label="${n}/5">${"<i>★</i>".repeat(n)}${"<i class=\"off\">★</i>".repeat(5 - n)}</span>`;
  const presetOf = () => Object.keys(PRESETS).find((k) => Object.entries(PRESETS[k]).every(([f, v]) => spec[f] === v)) || "";
  const RULE_UI = [["low", "🪶", "Low gravity"], ["mirror", "🔁", "Mirrored controls"], ["night", "🌙", "Night run"], ["onehp", "💔", "One heart"], ["speedup", "🚀", "Speeds up"]];
  const rulesRow = () => (spec.tpl === "runner" || spec.tpl === "dash" ? `<div class="wst-rules"><span>🃏 ${esc(T("Rule cards (up to 2)"))}</span><div class="wst-chips">${RULE_UI.map(([k, ic, n]) => `<button type="button" data-rule="${k}" class="${(spec.rules || []).includes(k) ? "on" : ""}">${ic} ${esc(T(n))}</button>`).join("")}</div></div>` : "");
  function paintMake() {
    const th = THEMES[spec.theme], L = genLevel(spec), KN = KNOBS[spec.tpl] || KNOBS.runner, E = estimate(spec), cur = mine.find((g) => g.id === editId);
    const bar = `<ol class="wst-steps">${STEPS.map(([l], i) => `<li><button type="button" data-step="${i + 1}" class="${step === i + 1 ? "on" : step > i + 1 ? "done" : ""}"><i>${step > i + 1 ? "✓" : i + 1}</i><span>${esc(T(l))}</span></button></li>`).join("")}</ol>`;
    const box = step <= 4 ? `<div class="wst-3dbox${step === 4 ? " big" : ""}">${prev ? "" : `<canvas class="wst-prev" width="640" height="76" aria-label="${esc(T("Preview"))}"></canvas>`}<span class="wst-3dtag">${ICON[spec.tpl] || "🎮"} ${esc(T(TEMPLATES[spec.tpl].name))} · ${esc(T(th.name))}</span></div>` : "";
    let body = "";
    if (step === 1) body = `<div class="wst-tpls">${Object.entries(TEMPLATES).map(([id, t]) => `<button type="button" class="wst-tpl${id === spec.tpl ? " on" : ""}${t.open ? "" : " soon"}" ${t.open ? `data-tpl="${id}"` : "disabled"}><span class="wst-art" style="background-image:url(/images/ui/studio/${id}.webp?v=1)" aria-hidden="true"></span><b>${esc(T(t.name))}</b>${t.open ? "" : `<small>${esc(T("Coming soon"))}</small>`}</button>`).join("")}</div>
      <div class="wst-ai"><b>✨ ${esc(T("Ask {n} to draft it", { n: ctx.agentName() || T("your agent") }))}</b><div class="wst-airow"><input class="wst-aiin" maxlength="240" placeholder="${esc(T("e.g. a fast jungle run with lots of coins"))}"><button type="button" class="wst-go" data-ai ${busy ? "disabled" : ""}>${esc(T("Draft"))}</button></div>${aiNote ? `<small class="wst-ainote">${esc(aiNote)}</small>` : ""}</div>
      <label class="wst-title"><span>${esc(T("Title"))}</span><input class="wst-tin" maxlength="24" value="${esc(spec.title)}"></label>`;
    else if (step === 2) body = `<div class="wst-themes">${Object.entries(THEMES).map(([id, t]) => `<button type="button" data-theme="${id}" class="wst-thm${id === spec.theme ? " on" : ""}" style="--c:${hex(t.edge)};--b:${hex(t.sky)}"><span class="wst-thi" data-snap="${id}"${snaps[spec.tpl + ":" + id] ? ` style="background-image:url(${snaps[spec.tpl + ":" + id]})"` : ""}></span><b>${esc(T(t.name))}</b></button>`).join("")}</div>`;
    else if (step === 3 && spec.build) { const B = spec.build, ar = !!B.w, td = !!B.td, n = td ? B.path.length + B.pads.length : ar ? B.w.length + B.c.length + B.p.length : B.r.length; // (Studio 4: a hand-built layout — the speed still applies)
      body = `<div class="wst-build on"><i>🛠️</i><div><b>${esc(T("Hand-built layout"))}</b><small>${esc(td ? T("{p} path cells · {d} pads · {w} waves", { p: B.path.length, d: B.pads.length, w: B.waves.length }) : ar ? T("{n} pieces · {s} s", { n, s: spec.len }) : T("{n} pieces · {m} m", { n, m: B.L }))}</small></div><span><button type="button" class="wst-go" data-build>✏️ ${esc(T("Edit the layout"))}</button><button type="button" class="wst-link" data-unbuild>${esc(T("Back to quick start"))}</button></span></div>
      ${rulesRow()}
      <div class="wst-row"><span>${esc(T(KN.speed))}</span><div class="wst-chips">${[1, 2, 3, 4, 5].map((x) => `<button type="button" data-speed="${x}" class="${x === spec.speed ? "on" : ""}">${x}</button>`).join("")}</div></div>
      <div class="wst-est s${E.stars}"><b>${starsTxt(E.stars)}</b><span>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</span>${E.why ? `<small>${esc(T("Most runs end at: {x}", { x: T(WHY[E.why] || E.why) }))}</small>` : ""}</div>
      ${prev ? `<canvas class="wst-prev" width="640" height="76" aria-label="${esc(T("Preview"))}"></canvas>` : ""}`; }
    else if (step === 3) { const pk = presetOf();
      body = `${spec.tpl !== "puzzle" ? `<div class="wst-build"><i>🛠️</i><div><b>${esc(T("Build it yourself"))}</b><small>${esc(T(spec.tpl === "arena" ? "Send every drone, sweep and coin when and where you want, and stand pillars — starting from this arena." : spec.tpl === "climb" ? "Place every platform, spring, spike and coin up the tower by hand — starting from this one." : spec.tpl === "defense" ? "Draw the path, place the tower pads and set every wave by hand — starting from this map." : "Place every wall, gap, laser, coin and heart by hand — starting from this layout."))}</small></div><span><button type="button" class="wst-go" data-build>🛠️ ${esc(T("Open the builder"))}</button></span></div>` : ""}${rulesRow()}${galleryRow()}`;
      body += `<div class="wst-pres">${Object.keys(PRESETS).map((k) => { const e = estimate({ ...spec, ...PRESETS[k] }); return `<button type="button" data-preset="${k}" class="${pk === k ? "on" : ""} p-${k}"><b>${esc(T(PNAME[k]))}</b><small>${starsTxt(e.stars)}</small><em>${Math.round(e.clear * 100)}%</em></button>`; }).join("")}</div><p class="wst-pcap">${esc(T("% = how many of 40 test players finish it"))}</p>
      <div class="wst-row"><span>${esc(T(KN.len))}</span><div class="wst-chips">${LENS.map((x) => `<button type="button" data-len="${x}" class="${x === spec.len ? "on" : ""}">${LEN_NAME[spec.tpl] ? esc(T(LEN_NAME[spec.tpl][x])) : x + "s"}</button>`).join("")}</div></div>
      <div class="wst-est s${E.stars}"><b>${starsTxt(E.stars)}</b><span>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</span>${E.why ? `<small>${esc(T("Most runs end at: {x}", { x: T(WHY[E.why] || E.why) }))}</small>` : ""}</div>
      ${prev ? `<canvas class="wst-prev" width="640" height="76" aria-label="${esc(T("Preview"))}"></canvas>` : ""}
      <details class="wst-adv"${advOpen ? " open" : ""}><summary>⚙️ ${esc(T("Advanced settings"))}</summary><div class="wst-sls">${slider("speed", KN.speed, 5, 1)}${slider("coins", KN.coins, 5)}${slider("walls", KN.walls, 5)}${slider("gaps", KN.gaps, 3)}${slider("lasers", KN.lasers, 3)}</div>
      <p class="wst-fine" style="--c:${hex(th.edge)}">🎲 ${esc(T("Layout #{n}", { n: spec.seed }))} · <span class="wst-sum">${summary(L)}</span> <button type="button" class="wst-link" data-seed>${esc(T("New layout"))}</button></p></details>`; }
    else if (step === 4) body = `<ul class="wst-recap"><li><i>${ICON[spec.tpl]}</i>${esc(T(TEMPLATES[spec.tpl].name))}</li><li><i>🎨</i>${esc(T(th.name))}</li><li><i>🔥</i>${starsTxt(E.stars)} · ${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</li><li><i>📏</i><span class="wst-sum">${summary(L)}</span></li></ul>
      ${lastTest ? `<p class="wst-last">${esc(T("Your test: {s} points", { s: lastTest.score }))}${lastTest.done ? " · 🏁" : ""}</p>` : ""}<button type="button" class="wst-go big wst-testbig" data-test>▶ ${esc(T("Test play"))}</button>`;
    else body = `<div class="wst-pubbox">${cur && cur.pub ? `<p class="wst-ok">🚀 ${esc(T("It's on the Creator Arcade!"))}</p>` : editId ? `<p>💾 ${esc(T("Saved as a draft. Publish it so everyone can play."))}</p>` : `<p>${esc(T("Save it to keep it, then publish it to the Creator Arcade."))}</p>`}
      <label class="wst-title"><span>${esc(T("Title"))}</span><input class="wst-tin" maxlength="24" value="${esc(spec.title)}"></label>
      <div class="wst-acts"><button type="button" class="wst-go alt" data-save ${busy ? "disabled" : ""}>💾 ${esc(T(editId ? "Save changes" : "Save"))}</button>${cur && cur.pub ? `<button type="button" class="wst-go" data-share="${esc(editId)}">🔗 ${esc(T("Copy link"))}</button>` : `<button type="button" class="wst-go big" data-savepub ${busy ? "disabled" : ""}>🚀 ${esc(T(editId ? "Publish" : "Save & publish"))}</button>`}</div>
      ${editId ? `<button type="button" class="wst-link" data-tab="mine">📁 ${esc(T("See it in My games"))}</button>` : ""}</div>`;
    const nav = `<nav class="wst-nav">${step > 1 ? `<button type="button" class="wst-go alt" data-back>← ${esc(T("Back"))}</button>` : "<span></span>"}${step < 4 ? `<button type="button" class="wst-go alt" data-test>▶ ${esc(T("Test"))}</button>` : "<span></span>"}${step < 5 ? `<button type="button" class="wst-go" data-next>${esc(T("Next"))} →</button>` : "<span></span>"}</nav>`;
    return `${bar}<p class="wst-hint">${esc(T(STEPS[step - 1][1]))}</p>${box}<div class="wst-stepbody s${step}">${body}</div>${nav}`;
  }
  /// the live preview: one renderer for the window's life, its canvas moved into each paint (none on low graphics)
  function attachPreview() {
    if (tab !== "make" || step > 4) { if (prev) prev.stop(); return; }
    if (!prev && !ctx.saver && prevOk) { try { prev = makePreview({ THREE }); } catch { prev = null; } if (!prev) { prevOk = false; return paint(); } }
    const bx = el.querySelector(".wst-3dbox"); if (!prev || !bx) return; bx.prepend(prev.canvas); prev.set(spec);
    if (step === 2) setTimeout(fillSnaps, 60);
  }
  function fillSnaps() { if (!prev || tab !== "make" || step !== 2) return; for (const id of Object.keys(THEMES)) { const k = spec.tpl + ":" + id; if (!snaps[k]) { snaps[k] = prev.snap({ ...spec, theme: id }); const im = el.querySelector(`[data-snap="${id}"]`); if (im) im.style.backgroundImage = `url(${snaps[k]})`; return setTimeout(fillSnaps, 30); } } }
  let prevT = 0; const prevSoon = () => { clearTimeout(prevT); prevT = setTimeout(() => { if (prev && tab === "make") prev.set(spec); }, 160); };
  const summary = (L) => spec.tpl === "defense" ? esc(T("{w} waves · {n} foes · {p} pads", { w: L.waves.length, n: L.coins, p: L.pads.length })) : spec.tpl === "climb" ? esc(T("{m} m up · {c} coins", { m: L.len, c: L.coins })) : spec.tpl === "puzzle" ? (() => { const R = ringOf(L.id); return R ? esc(T("{n} rings · par {p}", { n: R.rings.length, p: R.par })) : ""; })() : spec.tpl === "arena" ? esc(T("{s} s · {d} waves · {c} coins", { s: L.secs, d: L.waves.length, c: L.coins })) : spec.tpl === "dash" ? esc(T("endless · {c} coins on the way", { c: L.coins })) : `${Math.round(L.len)} m · ${L.coins} ${esc(T("coins"))}`;
  /// a ring board drawn small (the preview strip, the S4c board gallery); boards are kept once made (the engine solves each for its par)
  const ringCache = new Map(), ringOf = (id) => { if (!ringCache.has(id)) { let R = null; try { R = ringLevel(id); } catch { /* no board */ } ringCache.set(id, R); } return ringCache.get(id); };
  function drawRings(x, w, h, R) { const xs = R.rings.map((r) => r.x), ys = R.rings.map((r) => r.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, k = Math.min((w - 20) / (Math.max(...xs) - Math.min(...xs) + 3), (h - 12) / (Math.max(...ys) - Math.min(...ys) + 3)); x.lineWidth = Math.max(2, Math.min(4, k * 0.12)); for (const r of R.rings) { const g = (r.g * Math.PI) / 4; x.strokeStyle = ["#5fd3ff", "#7cf5c8", "#ffd23a", "#ff6fae", "#b48cff", "#ff9f2e"][r.c % 6]; x.beginPath(); x.arc(w / 2 + (r.x - cx) * k, h / 2 - (r.y - cy) * k, r.r * k * 0.92, -g + 0.45, -g + Math.PI * 2 - 0.45); x.stroke(); } }
  /// S4c: the Ring Puzzle's board gallery — six boards of these settings side by side to pick from, each one re-rollable
  let gal = null, galKey = "";
  function galSeeds() { const k = [spec.speed, spec.coins, spec.walls, spec.gaps, spec.lasers].join(); if (!gal || galKey !== k) { galKey = k; gal = Array.from({ length: 6 }, (_, i) => (i ? 1 + ((spec.seed * 7919 + i * 104729) % 999999) : spec.seed)); } if (!gal.includes(spec.seed)) gal[0] = spec.seed; return gal; }
  const galleryRow = () => spec.tpl !== "puzzle" ? "" : `<div class="wst-gal"><div class="wst-galh"><b>🧩 ${esc(T("Pick your board"))}</b><button type="button" class="wst-link" data-galall>🎲 ${esc(T("6 new boards"))}</button></div><div class="wst-galg">${galSeeds().map((sd, i) => `<div class="wst-gb${sd === spec.seed ? " on" : ""}"><button type="button" class="wst-gbp" data-gal="${sd}"><canvas width="180" height="120" data-galcv="${sd}"></canvas><small data-galtx="${sd}">…</small></button><button type="button" class="wst-gbr" data-galre="${i}" aria-label="${esc(T("Another board"))}">🔄</button></div>`).join("")}</div></div>`;
  function fillGallery() { if (!el || spec.tpl !== "puzzle") return; const cv = el.querySelector("canvas[data-galcv]:not([data-done])"); if (!cv) return; cv.dataset.done = "1"; const sd = Number(cv.dataset.galcv), R = ringOf(genLevel({ ...spec, seed: sd }).id), tx = el.querySelector(`[data-galtx="${sd}"]`);
    if (R) { drawRings(cv.getContext("2d"), cv.width, cv.height, R); if (tx) tx.textContent = T("{n} rings · par {p}", { n: R.rings.length, p: R.par }); } else if (tx) tx.textContent = "—"; setTimeout(fillGallery, 0); }
  /// the level at a glance: the track (or the arena's timeline), walls / gaps / lasers / coins in their colours
  function drawPrev() {
    const cv = el && el.querySelector(".wst-prev"); if (!cv) return; const x = cv.getContext("2d"), w = cv.width, h = cv.height, th = THEMES[spec.theme], L = genLevel(spec);
    x.clearRect(0, 0, w, h); x.fillStyle = hex(th.track); x.globalAlpha = 0.9; x.fillRect(0, 8, w, h - 16); x.globalAlpha = 1;
    if (spec.tpl === "puzzle") { const R = ringOf(L.id); if (R) drawRings(x, w, h, R); return; }
    if (spec.tpl === "defense") { const k = Math.min((w - 8) / DEF.R, (h - 8) / DEF.C), ox = (w - k * DEF.R) / 2, oy = (h - k * DEF.C) / 2; // (the board turned on its side: the portal on the left, the crystal on the right)
      x.fillStyle = hex(th.track); for (const [c, r] of L.path) x.fillRect(ox + r * k + 1, oy + c * k + 1, k - 2, k - 2); x.fillStyle = hex(th.edge); for (const [c, r] of L.pads) { x.beginPath(); x.arc(ox + (r + 0.5) * k, oy + (c + 0.5) * k, k * 0.32, 0, 6.283); x.fill(); }
      if (L.path.length) { const [c0, r0] = L.path[0], [c1, r1] = L.path[L.path.length - 1]; x.fillStyle = "#b48cff"; x.fillRect(ox + r0 * k, oy + c0 * k, k, k); x.fillStyle = "#5fd3ff"; x.fillRect(ox + r1 * k, oy + c1 * k, k, k); } return; }
    if (spec.tpl === "climb") { const X = (z) => (z / L.len) * (w - 8) + 4, Y = (c) => 12 + c * ((h - 24) / 4), C = { plat: hex(th.wall), mplat: "#ff9a3d", break: "#c8a27a", spring: "#7cf5c8", spike: "#ff3355", coin: "#ffd23a", heart: "#ff4d6d" };
      for (const [a, b] of climbGaps(spec, L.rows, L.len)) { x.fillStyle = "rgba(255,59,92,.35)"; x.fillRect(X(a), 4, X(b) - X(a), h - 8); }
      for (const r of L.rows) { x.fillStyle = C[r.k] || "#fff"; if (r.k === "coin") { x.beginPath(); x.arc(X(r.z), Y(r.lane), 2.2, 0, 6.283); x.fill(); } else x.fillRect(X(r.z) - 1.5, Y(r.lane) - 4, 3, 8); } x.fillStyle = "#fff"; x.fillRect(w - 5, 8, 3, h - 16); return; }
    if (spec.tpl === "arena") { const X = (t) => (t / L.secs) * (w - 8) + 4; for (const v of L.waves) { x.fillStyle = v.k === "L" ? "#ff3355" : v.k === "D" ? "#ffb02e" : hex(th.wall); const r = v.k === "D" ? 7 : 4; x.beginPath(); x.arc(X(v.t), 14 + ((v.a * 97) % 1) * (h - 28), r, 0, 6.283); x.fill(); } x.fillStyle = "#ffd23a"; for (const c of L.coinsAt) x.fillRect(X(c.t) - 2, h - 14, 4, 4); return; }
    const span = spec.tpl === "dash" ? Math.min(L.len, 1600) : L.len, X = (z) => (z / span) * (w - 8) + 4, Y = (lane) => 16 + lane * ((h - 32) / 2);
    x.strokeStyle = hex(th.edge); x.globalAlpha = 0.35; for (const l of [0, 1, 2]) { x.beginPath(); x.moveTo(0, Y(l)); x.lineTo(w, Y(l)); x.stroke(); } x.globalAlpha = 1;
    for (const r of L.rows) { if (r.z > span) break; const px = X(r.z); if (r.k === "wall") { x.fillStyle = hex(th.wall); x.fillRect(px - 2, Y(r.lane) - 7, 5, 14); } else if (r.k === "gap") { x.fillStyle = "#020610"; x.fillRect(px - 3, 8, 7, h - 16); } else if (r.k === "laser") { x.fillStyle = "#ff3355"; x.fillRect(px - 1, 8, 3, h - 16); } else { x.fillStyle = "#ffd23a"; x.beginPath(); x.arc(px, Y(r.lane), 2.2, 0, 6.283); x.fill(); } }
    if (spec.tpl !== "dash") { x.fillStyle = "#fff"; x.fillRect(w - 5, 8, 3, h - 16); }
  }
  const thumbKey = (g) => g.id + ":" + (g.up || g.at || 0);
  const coverOf = (g) => thumbs.get(thumbKey(g)) || `/images/ui/studio/${TEMPLATES[g.tpl] ? g.tpl : "runner"}.webp?v=1`;
  const card = (g, own) => `<div class="wst-card${g.off ? " off" : ""}" style="--c:${hex((THEMES[g.theme] || THEMES.neon).edge)};--b:${hex((THEMES[g.theme] || THEMES.neon).sky)}"><div class="wst-cv" data-open="${esc(g.id)}" data-th="${esc(thumbKey(g))}" role="button" tabindex="0" style="background-image:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55)),url(${coverOf(g)})"><i aria-hidden="true">${ICON[g.tpl] || "🏃"}</i><em>${esc(T((THEMES[g.theme] || THEMES.neon).name))}</em>${g.pick ? `<b class="wst-pick">⭐ ${esc(T("Editor's pick"))}</b>` : g.off ? `<b class="wst-pick off">✔ ${esc(T("Official"))}</b>` : ""}</div><div class="wst-ci"><b data-open="${esc(g.id)}" role="button">${esc(g.title)}</b><small>${own ? (g.pub ? "🚀 " + esc(T("On the Creator Arcade")) : "📝 " + esc(T("Draft"))) : esc(T("by {n}", { n: g.byName || "?" }))} · ▶ ${g.plays || 0} · ♥ ${g.likes || 0}</small>
    <span class="wst-cb"><button type="button" class="wst-go" data-play="${esc(g.id)}">▶ ${esc(T("Play"))}</button>${own ? `<button type="button" data-edit="${esc(g.id)}">${esc(T("Edit"))}</button><button type="button" data-pub="${esc(g.id)}">${esc(T(g.pub ? "Unpublish" : "Publish"))}</button><button type="button" data-del="${esc(g.id)}" aria-label="${esc(T("Delete"))}">🗑</button>${g.vers && g.vers.length ? `<button type="button" data-vers="${esc(g.id)}" aria-label="${esc(T("Versions"))}">🕘 ${g.vers.length}</button>` : ""}` : `<button type="button" data-like="${esc(g.id)}">♥ ${esc(T("Like"))}</button>`}${!own && g.pub !== false && ctx.isGM && ctx.isGM() ? `<button type="button" data-gpick="${esc(g.id)}" aria-label="${esc(T("Editor's pick"))}">${g.pick ? "★" : "☆"}</button>` : ""}${g.pub ? `<button type="button" data-share="${esc(g.id)}" aria-label="${esc(T("Copy link"))}">🔗</button>` : ""}</span></div></div>`;
  function wantThumbs(list) { if (ctx.saver || !prevOk) return; for (const g of list) { const sp = g.spec || g.s; if (sp && !thumbs.has(thumbKey(g))) thumbQ.push([thumbKey(g), sp]); } clearTimeout(thumbT); thumbT = setTimeout(nextThumb, 60); }
  function nextThumb() {
    if (!el || el.hidden || !thumbQ.length) return; if (!prev) { try { prev = makePreview({ THREE }); } catch { prev = null; } if (!prev) { prevOk = false; return; } }
    const [k, sp] = thumbQ.shift(); if (!thumbs.has(k)) { let u = ""; try { u = prev.snap(clampSpec({ ...sp })); } catch { /* the template's picture stays */ } if (u) { thumbs.set(k, u); el.querySelectorAll(`[data-th="${CSS.escape(k)}"]`).forEach((c) => { c.style.backgroundImage = `linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55)),url(${u})`; c.classList.add("snap"); }); } }
    thumbT = setTimeout(nextThumb, 40);
  }
  const localCard = (d) => { const th = THEMES[d.spec.theme] || THEMES.neon; return `<div class="wst-card local" style="--c:${hex(th.edge)};--b:${hex(th.sky)}"><div class="wst-cv" data-th="${esc(d.id + ":" + d.at)}" style="background-image:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55)),url(${thumbs.get(d.id + ":" + d.at) || `/images/ui/studio/${TEMPLATES[d.spec.tpl] ? d.spec.tpl : "runner"}.webp?v=1`})"><i aria-hidden="true">${ICON[d.spec.tpl] || "🏃"}</i><em>${esc(T(th.name))}</em></div><div class="wst-ci"><b>${esc(d.spec.title)}</b><small>📱 ${esc(T("On this device"))}</small>
    <span class="wst-cb"><button type="button" class="wst-go" data-ltest="${esc(d.id)}">▶ ${esc(T("Test"))}</button><button type="button" data-ledit="${esc(d.id)}">${esc(T("Edit"))}</button><button type="button" data-ldel="${esc(d.id)}" aria-label="${esc(T("Delete"))}">🗑</button></span></div></div>`; };
  function paintMine() {
    const L = locals(), w = wallet();
    const loc = L.length ? `<div class="wst-local"><b>📱 ${esc(T("{n} drafts on this device", { n: L.length }))}</b><small>${esc(T(w ? "Put them in your account to keep them everywhere and publish them." : "They stay on this phone or computer. Sign in to keep them everywhere and publish them."))}</small><button type="button" class="wst-go" data-${w ? "lup" : "signin"}>${esc(T(w ? "Put them in my account" : "Sign in"))}</button></div>${L.map(localCard).join("")}` : "";
    if (!w) return loc || `<div class="wst-emptybox"><i>🎮</i><b>${esc(T("No games yet"))}</b><small>${esc(T("Make one in Create — you can save it on this device without signing in."))}</small><button type="button" class="wst-go" data-tab="make">🛠️ ${esc(T("Create"))}</button></div>`;
    return loc + (mine.length ? mine.map((g) => card(g, true)).join("") : L.length ? "" : `<div class="wst-emptybox"><i>🎮</i><b>${esc(T("No games yet"))}</b><small>${esc(T("No games yet — make your first one in Create."))}</small><button type="button" class="wst-go" data-tab="make">🛠️ ${esc(T("Create"))}</button></div>`);
  }
  function contestBox() {
    if (!week || !week.tpl || !TEMPLATES[week.tpl]) return ""; const left = Math.max(0, week.ends - Date.now()), d = Math.floor(left / 86400e3), h = Math.floor((left % 86400e3) / 3600e3);
    const top = (week.top || []).slice(0, 3), medal = ["🥇", "🥈", "🥉"];
    return `<div class="wst-contest"><div class="wst-cth"><i>🏆</i><div><small>${esc(T("Weekly creator contest"))}</small><b>${ICON[week.tpl] || "🎮"} ${esc(T("{t} week", { t: T(TEMPLATES[week.tpl].name) }))}</b><em>${esc(T("ends in {d}d {h}h", { d, h }))}</em></div><button type="button" class="wst-go" data-ctmake="${esc(week.tpl)}">🛠️ ${esc(T("Enter"))}</button></div>
      <small class="wst-ctrule">${esc(T("Publish a {t} game — plays by others and likes (×5) this week rank it.", { t: T(TEMPLATES[week.tpl].name) }))}</small>
      ${top.length ? `<ol class="wst-ctop">${top.map((x, i) => `<li data-open="${esc(x.id)}" role="button"><i>${medal[i]}</i><b>${esc(x.title)}</b><span>${esc(x.byName || "?")}</span><em>${x.pts}</em></li>`).join("")}</ol>` : `<p class="wst-ctempty">${esc(T("No entries yet — yours could be #1!"))}</p>`}
      ${week.last && week.last.top && week.last.top.length ? `<p class="wst-ctlast">${esc(T("Last week's winner"))}: 👑 <b data-open="${esc(week.last.top[0].id)}" role="button">${esc(week.last.top[0].title)}</b> · ${esc(week.last.top[0].byName || "?")}</p>` : ""}</div>`;
  }
  const arcTools = () => `<div class="wst-atools"><input class="wst-aq" type="search" maxlength="30" placeholder="🔎 ${esc(T("Search games or makers"))}" value="${esc(aq)}"><div class="wst-chips">${[["pop", "🔥", "Popular"], ["new", "🆕", "New"], ["like", "♥", "Most liked"]].map(([k, ic, l]) => `<button type="button" data-asort="${k}" class="${asort === k ? "on" : ""}">${ic} ${esc(T(l))}</button>`).join("")}</div>
    <div class="wst-chips wst-atpl"><button type="button" data-atpl="" class="${atpl ? "" : "on"}">${esc(T("All"))}</button>${Object.keys(TEMPLATES).map((k) => `<button type="button" data-atpl="${k}" class="${atpl === k ? "on" : ""}" title="${esc(T(TEMPLATES[k].name))}">${ICON[k]} ${esc(T(TEMPLATES[k].name))}</button>`).join("")}</div></div>`;
  const arcList = (L) => { const q = aq.trim().toLowerCase(); let out = L.filter((g) => (!atpl || g.tpl === atpl) && (!q || String(g.title).toLowerCase().includes(q) || String(g.byName || "").toLowerCase().includes(q)));
    out = [...out].sort((a, b) => (b.pick ? 1 : 0) - (a.pick ? 1 : 0) || (asort === "new" ? b.at - a.at : asort === "like" ? (b.likes || 0) - (a.likes || 0) || b.at - a.at : (b.plays + b.likes * 5) - (a.plays + a.likes * 5) || b.at - a.at)); return out; };
  function paintArcade() {
    const off = arcList(arcade.filter((g) => g.off)), rest = arcList(arcade.filter((g) => !g.off)), filtered = aq.trim() || atpl;
    return `${contestBox()}${arcTools()}${off.length ? `<h4 class="wst-sec">✔ ${esc(T("Start here — made by ARCIRCLE"))}</h4><div class="wst-offrow">${off.map((g) => card(g, false)).join("")}</div>` : ""}
      <h4 class="wst-sec">🕹️ ${esc(T("Players' games"))}</h4>${rest.length ? rest.map((g) => card(g, false)).join("") : filtered ? `<p class="wst-empty">${esc(T("No games match — try another word or template"))}</p>` : `<div class="wst-emptybox"><i>🚀</i><b>${esc(T("Be the first creator!"))}</b><small>${esc(T("The Creator Arcade is waiting for its first game — publish yours!"))}</small><button type="button" class="wst-go" data-tab="make">🛠️ ${esc(T("Create"))}</button></div>`}`;
  }
  // Studio 3: a game's own page — its cover, who made it, how hard, the top 10, play / race the #1's ghost / like / challenge
  async function openGame(id) {
    gid = id; gdata = null; tab = "game"; paint();
    try { const [a, b] = await Promise.all([fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id), { cache: "no-store" }), fetch("/api/social?world=studio-ghost&id=" + encodeURIComponent(id), { cache: "no-store" })]);
      const g = a.ok ? (await a.json()).game : null, gh = b.ok ? (await b.json()).ghost : null; if (gid !== id) return; gdata = g ? { ...g, ghost: gh } : { gone: true }; } catch { gdata = { gone: true }; }
    if (tab === "game") paint();
  }
  function paintGame() {
    if (!gdata) return `<p class="wst-empty">${esc(T("Loading…"))}</p>`;
    if (gdata.gone || !gdata.spec) return `<p class="wst-empty">${esc(T("Couldn't open it — try again"))}</p><button type="button" class="wst-go alt" data-tab="arcade">← ${esc(T("Back"))}</button>`;
    const g = gdata, th = THEMES[g.theme] || THEMES.neon, E = estimate(g.spec), own = mine.some((x) => x.id === g.id), my = localBest(g.id);
    return `<div class="wst-gp" style="--c:${hex(th.edge)};--b:${hex(th.sky)}">
      <div class="wst-gcv" style="background-image:linear-gradient(180deg,transparent 30%,rgba(2,8,20,.85)),url(/images/ui/studio/${TEMPLATES[g.tpl] ? g.tpl : "runner"}.webp?v=1)"><small>${ICON[g.tpl] || "🎮"} ${esc(T((TEMPLATES[g.tpl] || TEMPLATES.runner).name))} · ${esc(T(th.name))}</small><h3>${esc(g.title)}</h3><span>${esc(T("by {n}", { n: g.byName || "?" }))} · ▶ ${g.plays || 0} · ♥ ${g.likes || 0}${g.remixes ? ` · 🔀 ${g.remixes}` : ""}</span>${g.from ? `<small class="wst-from" data-open="${esc(g.from.id)}" role="button">🔀 ${esc(T("Remix of {t} by {n}", { t: g.from.title, n: g.from.byName || "?" }))}</small>` : ""}</div>
      <div class="wst-est s${E.stars}">${starsTxt(E.stars)}<span>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</span>${my ? `<small>${esc(T("Your best here: {n}", { n: my }))}</small>` : ""}</div>
      <h4>🏆 ${esc(T("Top 10"))}</h4>${(g.best || []).length ? `<ol class="wst-board">${g.best.map((x, i) => `<li class="${i === 0 ? "gold" : ""}"><i>${i === 0 ? "👑" : i + 1}</i><b>${esc(x.name || "?")}</b><em>${x.score}</em></li>`).join("")}</ol>` : `<p class="wst-empty">${esc(T("Nobody has played it yet — be the first!"))}</p>`}
      ${g.ghost ? `<label class="wst-ghosto"><input type="checkbox" data-ghost ${ghostOn ? "checked" : ""}> 👻 ${esc(T("Race {n}'s ghost ({s})", { n: g.ghost.name || "#1", s: g.ghost.score }))}</label>` : ""}
      <div class="wst-acts"><button type="button" class="wst-go big" data-play="${esc(g.id)}">▶ ${esc(T("Play"))}</button>${own ? "" : `<button type="button" class="wst-go alt" data-like="${esc(g.id)}">♥ ${esc(T("Like"))}</button>`}<button type="button" class="wst-go alt" data-share="${esc(g.id)}" aria-label="${esc(T("Copy link"))}">🔗</button>${ctx.share ? `<button type="button" class="wst-go alt" data-card="${esc(g.id)}" aria-label="${esc(T("Share card"))}">📸</button>` : ""}<button type="button" class="wst-go alt" data-remix="${esc(g.id)}">🔀 ${esc(T("Remix"))}</button></div>
      <button type="button" class="wst-link" data-tab="arcade">← ${esc(T("Creator Arcade"))}</button></div>`;
  }
  const localBest = (id) => { try { return Number(localStorage.getItem("arc.studio.best." + id) || 0); } catch { return 0; } };
  function paint() {
    if (!el) return;
    const body = tab === "mine" ? paintMine() : tab === "game" ? paintGame() : tab === "arcade" ? paintArcade() : paintMake();
    el.innerHTML = `<div class="wst-in"><header class="wst-h"><small>${esc(T("Nexus City"))}</small><h2>🎮 <em>ARCIRCLE</em> Studio</h2><button type="button" class="wst-help" data-guide aria-label="${esc(T("How to use"))}" title="${esc(T("How to use"))}">📖</button><button type="button" class="wst-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
      <nav class="wst-tabs">${[["make", "🛠️", "Create"], ["mine", "📁", "My games"], ["arcade", "🕹️", "Creator Arcade"]].map(([id, ic, l]) => `<button type="button" data-tab="${id}" class="${tab === id ? "on" : ""}"><span aria-hidden="true">${ic}</span>${esc(T(l))}</button>`).join("")}</nav>
      <div class="wst-body">${body}</div><p class="wst-foot">${esc(T("Games are made from templates — no code. Plays, likes and best runs are counted; no ARCL is paid for games yet."))}</p></div>`;
    if (tab === "make") { drawPrev(); attachPreview(); if (step === 3) setTimeout(fillGallery, 30); } else { if (prev) prev.stop(); wantThumbs(tab === "arcade" ? arcade : tab === "mine" ? [...mine, ...locals().map((d) => ({ id: d.id, at: d.at, spec: d.spec }))] : []); }
  }
  let estT = 0;
  const fxStep = () => { if (ctx.Snd && ctx.Snd.click) try { ctx.Snd.click(); } catch { /* no sound */ } };
  /// a repaint that keeps the advanced settings open and the page where it was (the estimate after a slider settles)
  function paintKeep() { const b = el.querySelector(".wst-body"), y = b ? b.scrollTop : 0, d = el.querySelector(".wst-adv"); if (d) advOpen = d.open; paint(); const b2 = el.querySelector(".wst-body"); if (b2) b2.scrollTop = y; }
  function onInput(e) {
    const t = e.target;
    if (t.matches("[data-k]")) { spec[t.dataset.k] = Number(t.value); const b = t.parentElement.querySelector("b"); if (b) b.textContent = t.value; const f = el.querySelector(".wst-sum"); if (f) f.innerHTML = summary(genLevel(spec)); drawPrev(); prevSoon(); clearTimeout(estT); estT = setTimeout(() => { if (tab === "make" && step === 3) paintKeep(); }, 450); }
    if (t.matches(".wst-tin")) spec.title = t.value;
    if (t.matches(".wst-aq")) { aq = t.value; clearTimeout(estT); estT = setTimeout(() => { const pos = t.selectionStart; paintKeep(); const n = el.querySelector(".wst-aq"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* not a text field */ } } }, 250); }
    if (t.matches("[data-ghost]")) ghostOn = t.checked;
  }
  async function onClick(e) {
    const op = e.target.closest("[data-open]"); if (op && !e.target.closest("button")) return openGame(op.dataset.open);
    const b = e.target.closest("button"); if (!b || b.disabled) { if (e.target === el) close(); return; }
    if (b.hasAttribute("data-x")) return close();
    if (b.hasAttribute("data-signin")) { try { await ctx.signIn(); } catch { return; } await load(); paint(); return; }
    if (b.hasAttribute("data-lup")) return uploadLocals();
    if (b.dataset.ltest) { const d = locals().find((x) => x.id === b.dataset.ltest); if (d) run({ spec: clampSpec(d.spec), test: true }); return; }
    if (b.dataset.ledit) { const d = locals().find((x) => x.id === b.dataset.ledit); if (d) { spec = clampSpec(d.spec); editId = ""; localId = d.id; tab = "make"; step = 3; lastTest = null; paint(); } return; }
    if (b.dataset.ldel) { if (!confirm(T("Delete this game?"))) return; setLocals(locals().filter((x) => x.id !== b.dataset.ldel)); if (localId === b.dataset.ldel) localId = ""; paint(); return; }
    if (b.dataset.card) return shareCard(b.dataset.card);
    if (b.dataset.asort) { asort = b.dataset.asort; return paintKeep(); }
    if (b.dataset.atpl != null && b.hasAttribute("data-atpl")) { atpl = b.dataset.atpl; return paintKeep(); }
    if (b.dataset.ctmake) { spec = clampSpec({ ...spec, tpl: b.dataset.ctmake, title: "" }); editId = ""; localId = ""; remixFrom = ""; tab = "make"; step = 1; lastTest = null; paint(); return; }
    if (b.dataset.remix) { const g = gdata && gdata.id === b.dataset.remix ? gdata : null; if (!g || !g.spec) return; spec = clampSpec({ ...g.spec, title: (g.title + " " + T("remix")).slice(0, 24), seed: g.spec.seed }); editId = ""; localId = ""; remixFrom = g.id; tab = "make"; step = 3; lastTest = null; paint(); ctx.toast("🔀 " + esc(T("A copy is open — change anything, then save it as yours"))); return; }
    if (b.hasAttribute("data-guide")) { if (ctx.guide) ctx.guide("studio"); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; paint(); if (tab !== "make") load(); return; }
    if (b.dataset.step) { step = Number(b.dataset.step); return paintKeep(); }
    if (b.hasAttribute("data-next")) { step = Math.min(5, step + 1); fxStep(); return paint(); }
    if (b.hasAttribute("data-back")) { step = Math.max(1, step - 1); return paint(); }
    if (b.dataset.rule) { const k = b.dataset.rule, cur = spec.rules || [], on = cur.includes(k); if (!on && cur.length >= 2) { ctx.toast(esc(T("Two rule cards at most — take one off first"))); return; } spec = clampSpec({ ...spec, rules: on ? cur.filter((x) => x !== k) : [...cur, k] }); return paintKeep(); }
    if (b.dataset.speed) { spec.speed = Number(b.dataset.speed); return paintKeep(); }
    if (b.dataset.gal) { spec = clampSpec({ ...spec, seed: Number(b.dataset.gal) }); lastTest = null; fxStep(); return paintKeep(); }
    if (b.dataset.galre) { galSeeds(); gal[Number(b.dataset.galre)] = 1 + Math.floor(Math.random() * 999998); if (gal[Number(b.dataset.galre)] === spec.seed) gal[Number(b.dataset.galre)]++; return paintKeep(); }
    if (b.hasAttribute("data-galall")) { galSeeds(); const keep = spec.seed; gal = gal.map((_, i) => (i ? 1 + Math.floor(Math.random() * 999998) : keep)); return paintKeep(); }
    if (b.dataset.gpick) { const g = arcade.find((x) => x.id === b.dataset.gpick); const r = await act({ action: "world-studio-pick", id: b.dataset.gpick, on: !(g && g.pick) }); if (r && r.ok) { ctx.toast(r.j.pick ? "⭐ " + esc(T("Editor's pick")) : esc(T("Taken off the picks"))); arcade = arcade.map((x) => (x.id === b.dataset.gpick ? { ...x, pick: r.j.pick ? Date.now() : 0 } : x)).sort((x, y) => (y.pick ? 1 : 0) - (x.pick ? 1 : 0)); paint(); } else if (r) fail(r); return; }
    if (b.hasAttribute("data-build")) return openBuilder();
    if (b.hasAttribute("data-unbuild")) { if (!confirm(T("Go back to the quick-start layout? Your hand-built layout is dropped."))) return; delete spec.build; spec = clampSpec(spec); return paintKeep(); }
    if (b.dataset.preset) { Object.assign(spec, PRESETS[b.dataset.preset]); if (ctx.Snd && ctx.Snd.click) try { ctx.Snd.click(); } catch { /* no sound */ } return paintKeep(); }
    if (b.hasAttribute("data-savepub")) { if (!ctx.sess()) { try { await ctx.signIn(); } catch { return; } if (!ctx.sess()) return; } if (!okToPublish()) return; await save(); if (editId && !(mine.find((g) => g.id === editId) || {}).pub) await publish(editId); return; }
    if (b.dataset.tpl) { spec = clampSpec({ ...spec, tpl: b.dataset.tpl, title: spec.title === "My Sky Run" || spec.title === "My Arena" || spec.title === "My Infinity Dash" ? "" : spec.title }); return paint(); }
    if (b.dataset.theme) { spec.theme = b.dataset.theme; return paintKeep(); }
    if (b.dataset.len) { spec.len = Number(b.dataset.len); return paintKeep(); }
    if (b.hasAttribute("data-seed")) { spec.seed = 1 + Math.floor(Math.random() * 99999); return paintKeep(); }
    if (b.hasAttribute("data-test")) { spec = clampSpec(spec); return run({ spec, id: editId || "", test: true }); }
    if (b.hasAttribute("data-ai")) return draft();
    if (b.hasAttribute("data-save")) return save();
    if (b.dataset.pub) return publish(b.dataset.pub);
    if (b.dataset.del) return del(b.dataset.del);
    if (b.dataset.vers) { const g = mine.find((x) => x.id === b.dataset.vers), card = b.closest(".wst-card") || b.parentElement; if (!g || !card) return; const old = card.querySelector(".wst-vers"); if (old) { old.remove(); return; }
      const box = document.createElement("div"); box.className = "wst-vers"; box.innerHTML = `<small>${esc(T("Earlier saves — open one, then save to keep it"))}</small>` + g.vers.map((v, i) => `<button type="button" data-restore="${esc(g.id)}:${i}"><span>${esc(new Date(v.at).toLocaleString())}</span><b>${v.spec && v.spec.build ? "🛠️ " + v.spec.build.r.length : esc(T(TEMPLATES[(v.spec || {}).tpl] ? TEMPLATES[v.spec.tpl].name : ""))}</b></button>`).join(""); card.appendChild(box); return; }
    if (b.dataset.restore) { const [id, i] = b.dataset.restore.split(":"), g = mine.find((x) => x.id === id), v = g && g.vers && g.vers[Number(i)]; if (!v) return; spec = clampSpec(v.spec); editId = id; tab = "make"; step = 3; lastTest = null; paint(); ctx.toast(esc(T("An earlier save is open — save to keep it"))); return; }
    if (b.dataset.edit) { const g = mine.find((x) => x.id === b.dataset.edit); if (g) { spec = clampSpec(g.spec); editId = g.id; localId = ""; remixFrom = ""; tab = "make"; step = 3; lastTest = null; paint(); } return; }
    if (b.dataset.play) return playId(b.dataset.play, tab === "game" && gdata && gdata.id === b.dataset.play && ghostOn ? { ghost: gdata.ghost } : {});
    if (b.dataset.like) return like(b.dataset.like);
    if (b.dataset.share) { const u = `${location.origin}/play?sg=${encodeURIComponent(b.dataset.share)}`; try { await navigator.clipboard.writeText(u); ctx.toast("🔗 " + esc(T("Link copied — anyone with it plays your game"))); } catch { prompt(T("Copy link"), u); } return; }
  }
  async function draft() {
    const inp = el.querySelector(".wst-aiin"), t = inp ? inp.value.trim() : ""; if (!t) { if (inp) inp.focus(); return; }
    busy = true; aiNote = T("Thinking…"); paint(); const r = await act({ action: "world-studio-ai", t, tpl: spec.tpl }); busy = false;
    if (!r) { aiNote = ""; paint(); return; }
    if (r.j && r.j.spec) { spec = clampSpec({ ...r.j.spec, seed: r.j.spec.seed }); editId = ""; lastTest = null; aiNote = r.j.by === "agent" ? T("{n} drafted it — tweak anything, then test it.", { n: ctx.agentName() || T("Your agent") }) : T("Drafted from your words — tweak anything, then test it."); step = 4; ctx.toast("✨ " + esc(aiNote)); paint(); if (ctx.Snd && ctx.Snd.perfect) try { ctx.Snd.perfect(); } catch { /* no sound */ } return; }
    aiNote = ""; paint(); fail(r);
  }
  let localId = "";
  /// STU-A: almost nobody finishes it and the maker hasn't either — ask first
  function okToPublish() { const E = estimate(spec); if (E.clear >= 0.05 || (lastTest && lastTest.done)) return true; return confirm(T("Almost nobody finishes this one. Publish anyway? (Finish it once in a test first to be sure.)")); }
  async function uploadLocals() {
    const L = locals(); if (!L.length) return; busy = true; let n = 0;
    for (const d of L) { const r = await act({ action: "world-studio-save", spec: clampSpec(d.spec) }); if (!r || !r.ok) { if (r) fail(r); break; } mine = [r.j.game, ...mine]; setLocals(locals().filter((x) => x.id !== d.id)); n++; }
    busy = false; if (n) ctx.toast("💾 " + esc(T("{n} games are in your account now", { n }))); paint();
  }
  async function save() {
    if (!ctx.sess()) { // (a guest: kept on this device)
      spec = clampSpec(spec); const L = locals(), at = Date.now(), id = localId || "l" + at.toString(36);
      if (!localId && L.length >= 12) { ctx.toast(esc(T("you can keep 12 games — delete one first"))); return; }
      localId = id; setLocals([{ id, spec, at }, ...L.filter((x) => x.id !== id)]);
      ctx.toast("📱 " + esc(T("Saved on this device — sign in to keep it everywhere and publish"))); paint(); return;
    }
    spec = clampSpec(spec); busy = true; paint(); const r = await act({ action: "world-studio-save", spec, id: editId || undefined, ...(!editId && remixFrom ? { from: remixFrom } : {}) }); busy = false;
    if (!r || !r.ok) { paint(); if (r) fail(r); return; }
    editId = r.j.game.id; remixFrom = ""; mine = [r.j.game, ...mine.filter((g) => g.id !== editId)]; if (localId) { setLocals(locals().filter((x) => x.id !== localId)); localId = ""; } ctx.toast("💾 " + esc(T("Saved"))); paint();
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
  async function playId(id, opt = {}) {
    let g = mine.find((x) => x.id === id && x.spec);
    if (!g) try { const r = await fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id), { cache: "no-store" }); if (r.ok) g = (await r.json()).game; } catch { /* below */ }
    if (!g || !g.spec) { ctx.toast(T("Couldn't open it — try again")); return; }
    run({ spec: clampSpec(g.spec), id, title: g.title, by: g.byName, ghost: opt.ghost || null, vs: opt.vs || 0, vsBy: opt.vsBy || "" });
  }

  /// STU-A: a 1200×630 share card for a game (its level's picture, who made it, its numbers; the game's own link in the words)
  async function shareCard(id, score) {
    if (!ctx.share) return; let g = (gdata && gdata.id === id ? gdata : null) || arcade.find((x) => x.id === id) || mine.find((x) => x.id === id);
    if (!g || !(g.spec || g.s)) { try { const r = await fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id), { cache: "no-store" }); if (r.ok) g = (await r.json()).game; } catch { /* below */ } }
    if (!g) { ctx.toast(T("Couldn't open it — try again")); return; }
    const sp = g.spec || g.s, th = THEMES[g.theme || sp.theme] || THEMES.neon; let art = thumbs.get(thumbKey(g)) || "";
    if (!art && !ctx.saver) { try { if (!prev) prev = makePreview({ THREE }); art = prev ? prev.snap(clampSpec({ ...sp })) : ""; } catch { art = ""; } }
    const url = `${location.origin}/play?sg=${encodeURIComponent(id)}`;
    ctx.share({ kind: "studio", tag: `${ICON[sp.tpl] || "🎮"} ${T((TEMPLATES[sp.tpl] || TEMPLATES.runner).name)} · ${T(th.name)}`, title: g.title || sp.title || "", sub: T("by {n}", { n: g.byName || "?" }),
      rows: [...(score != null ? [[T("My score"), String(score), "🏆"]] : []), [T("Plays"), String(g.plays || 0), "▶"], [T("Likes"), String(g.likes || 0), "♥"]], art: art || `/images/ui/studio/${TEMPLATES[sp.tpl] ? sp.tpl : "runner"}.webp`, cover: true, accent: hex(th.edge),
      text: `${score != null ? T("I scored {s} in", { s: score }) + " " : ""}"${g.title || sp.title}" — ${T("a game made in ARCIRCLE Studio")} 🎮 ${url}` });
  }
  // ---------------- Studio 4: the builder (world-studio-build.js) ----------------
  let builder = null;
  async function openBuilder() {
    const ar = spec.tpl === "arena", td = spec.tpl === "defense"; let M; try { M = await import(ar ? "./world-studio-arena.js" : td ? "./world-studio-tdbuild.js" : "./world-studio-build.js"); } catch (e) { console.warn("studio builder", e); ctx.toast(esc(T("Couldn't open it — try again"))); return; }
    if (!spec.build) spec = clampSpec({ ...spec, build: toBuild(spec) });
    if (el) el.hidden = true;
    builder = (ar ? M.createArenaBuilder : td ? M.createTdBuilder : M.createBuilder)({ T, esc, toast: ctx.toast, spec,
      onDone: (b, sp) => { spec = clampSpec({ ...spec, ...(sp ? { len: sp.len, coins: sp.coins } : {}), build: b }); lastTest = null; },
      onClose: () => { builder = null; if (el) { el.hidden = false; step = 3; paint(); } },
      onTest: (sp, z) => { const bel = document.querySelector(".wsb"); if (bel) bel.hidden = true; run({ spec: sp, test: true, ...(ar ? { startT: z } : { startZ: z }), onBack: () => { if (bel) bel.hidden = false; if (el) el.hidden = true; } }); } });
    builder.open();
  }
  // ---------------- the runner ----------------
  async function run(o) {
    if (playing) return; const vw = el && !el.hidden; if (el) el.hidden = true;
    if (o.spec.tpl === "puzzle") return playPuzzle(o, vw);
    const env = { ctx, THREE, T, esc, makeFx, makeGhost, result, back: (again, oo) => { playing = null; if (!again && oo.onBack) { oo.onBack(); return; } if (!again && el) { el.hidden = false; paint(); load(); } } }; // (the templates in modules of their own: S4d)
    try { playing = o.spec.tpl === "climb" ? await (await import("./world-studio-climb.js")).makeClimb(o, env) : o.spec.tpl === "defense" ? await (await import("./world-studio-defense.js")).makeDefense(o, env) : o.spec.tpl === "arena" ? await makeArena(o) : await makeRun(o); }
    catch (e) { console.warn("studio run", e); playing = null; ctx.st.solo(null); ctx.st.view(null); document.body.classList.remove("wp-studio"); ctx.toast(T("The game couldn't start") + " — " + esc(String((e && e.message) || e).slice(0, 60))); if (vw && el) el.hidden = false; }
  }
  async function makeRun(o) {
    const { st } = ctx, th = THEMES[o.spec.theme], L = genLevel(o.spec), v = speedOf(o.spec), dash = o.spec.tpl === "dash";
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
    const walls = L.rows.filter((r) => r.k === "wall"), lasers = L.rows.filter((r) => r.k === "laser"), coinRows = L.rows.filter((r) => r.k === "coin"), heartRows = L.rows.filter((r) => r.k === "heart"), hGot = new Uint8Array(heartRows.length);
    const RU = new Set(o.spec.rules || []), mwalls = L.rows.filter((r) => r.k === "mwall"), blinks = L.rows.filter((r) => r.k === "blink"); // (S4b)
    const mwX = (w, t) => Math.sin(t * 1.7 + w.z * 0.37) * LANES[2], blinkOn = (b, t) => Math.sin(t * 2.6 + b.z * 0.21) > -0.25;
    const mwm = mwalls.map((w) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.7, 0.8), std(0xff9a3d, { emissive: 0xff7a1a, emissiveIntensity: 0.5 })); m.position.set(0, 0.85, w.z); scene.add(m); return m; });
    const blm = blinks.map((b) => { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, W, 8), glow(0xff5ad8)); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.25, b.z); scene.add(bar); return bar; });
    if (RU.has("night")) { scene.background = new THREE.Color(0x03050c); scene.fog = new THREE.Fog(0x03050c, 10, 62); }
    const hm = heartRows.map((h) => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), std(0xff4d6d, { emissive: 0xff2d55, emissiveIntensity: 0.7 })); m.position.set(LANES[h.lane], 1.1, h.z); scene.add(m); return m; }); // (Studio 4: a heart back, up to 3)
    const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 1.7, 0.8), std(th.wall, { emissive: th.wall, emissiveIntensity: 0.45 }), Math.max(1, walls.length));
    walls.forEach((w, i) => { mt.makeTranslation(LANES[w.lane], 0.85, w.z); wm.setMatrixAt(i, mt); }); scene.add(wm);
    for (const l of lasers) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, W, 8), glow(0xff3355)); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.25, l.z); scene.add(bar); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), std(0x2a2f3a)); p.position.set((s * W) / 2, 1, l.z); scene.add(p); } }
    const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18), std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 }), Math.max(1, coinRows.length));
    const got = new Uint8Array(coinRows.length); scene.add(cm);
    if (!dash) { const arch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.3, 10, 48, Math.PI), glow(th.edge)); arch.position.set(0, 0, L.len); scene.add(arch);
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.2), glow(0xffffff, 0.8)); fin.position.set(0, 3.1, L.len); scene.add(fin); }
    // a coin taken: a gold ring that opens and fades where it was (a pool of six)
    const pops = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); m.visible = false; scene.add(m); return { m, t: 9 }; });
    let popI = 0; const pop = (x, y, z) => { const p = pops[popI++ % pops.length]; p.t = 0; p.m.position.set(x, y, z); p.m.visible = true; };
    // your hero
    let hero = null; try { hero = await ctx.makeHero(); } catch (e) { console.warn("studio hero", e); }
    const me = new THREE.Group(); scene.add(me); if (hero) { me.add(hero.obj); try { hero.play("idle"); } catch { /* no clip */ } } else { const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 10), std(0xeef4fb)); cap.position.y = 0.9; me.add(cap); }
    const gh = makeGhost(scene, o.ghost, false);
    // the HUD and the controls
    document.body.classList.add("wp-studio");
    const hud = document.createElement("div"); hud.className = "wst-hud"; hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || o.spec.title)}</b><span class="wst-hp">❤️❤️❤️</span><span class="wst-hc">🪙 0</span><span class="wst-combo" hidden></span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div><p class="wst-help">${esc(T(ctx.coarse ? "Swipe ← → to switch lanes · ↑ jump · ↓ slide" : "← → switch lanes · ↑ / Space jump · ↓ slide"))}</p><div class="wst-speed" aria-hidden="true"></div>`;
    document.body.appendChild(hud);
    const S = { z: Math.max(0, Math.min(L.len - 40, o.startZ || 0)), x: 0, lane: 1, y: 0, vy: 0, slide: 0, hearts: (o.spec.rules || []).includes("onehp") ? 1 : 3, inv: 0, coins: 0, t: -3, done: false, over: false, clip: "", combo: 0, lastCoin: -9, slow: 0, nice: new Set(), tr: [] }; // (o.startZ: the editor's "test from here")
    const fx = makeFx(hud);
    const keys = (e) => { if (S.over) return; const k = e.key; if (k === "ArrowLeft" || k === "a" || k === "A") lane(-1); else if (k === "ArrowRight" || k === "d" || k === "D") lane(1); else if (k === "ArrowUp" || k === " " || k === "w" || k === "W") jump(); else if (k === "ArrowDown" || k === "s" || k === "S") slide(); else return; e.preventDefault(); };
    let tx = 0, ty = 0, tt = 0;
    const ts = (e) => { const p = e.changedTouches ? e.changedTouches[0] : e; tx = p.clientX; ty = p.clientY; tt = Date.now(); };
    const te = (e) => { if (e.target.closest && e.target.closest("button")) return; const p = e.changedTouches ? e.changedTouches[0] : e, dx = p.clientX - tx, dy = p.clientY - ty; if (Math.hypot(dx, dy) < 24) { if (Date.now() - tt < 400) jump(); return; } if (Math.abs(dx) > Math.abs(dy)) lane(dx > 0 ? 1 : -1); else if (dy < 0) jump(); else slide(); };
    addEventListener("keydown", keys, true); addEventListener("touchstart", ts, { passive: true }); addEventListener("touchend", te); const pu = (e) => { if (e.pointerType === "mouse") te(e); }; addEventListener("pointerdown", ts); addEventListener("pointerup", pu);
    const play = (c, once) => { if (!hero) return; try { hero.play(c, once ? { once: true } : {}); } catch { /* no clip */ } S.clip = once ? "" : c; };
    function lane(d) { if (S.t < 0) return; if (RU.has("mirror")) d = -d; S.lane = Math.max(0, Math.min(2, S.lane + d)); if (ctx.Snd && ctx.Snd.dash) try { ctx.Snd.dash(); } catch { /* no sound */ } }
    function jump() { if (S.t < 0 || S.y > 0.01) return; S.vy = RU.has("low") ? 7.4 : 8.6; S.slide = 0; play("jump", true); if (ctx.Snd && ctx.Snd.jump) try { ctx.Snd.jump(); } catch { /* no sound */ } }
    function slide() { if (S.t < 0) return; if (S.y > 0.01) S.vy = Math.min(S.vy, -10); S.slide = 0.7; play("dodge", true); }
    function hurt(why) { if (S.inv > 0 || S.over) return; S.hearts--; S.inv = 1.4; play(S.hearts > 0 ? "hit" : "die", true); if (ctx.Snd && ctx.Snd.hurt) try { ctx.Snd.hurt(); } catch { /* no sound */ } paintHud(); if (S.hearts <= 0) end(false); if (why === "gap") { const g = gaps.find((x) => Math.abs(S.z - x) < GAP); S.y = 0; S.vy = 0; if (g != null) S.z = g + GAP / 2 + 0.6; } } // (back on its far side)
    const paintHud = () => { hud.querySelector(".wst-hp").textContent = "❤️".repeat(Math.max(0, S.hearts)) + "🖤".repeat(Math.max(0, ((o.spec.rules || []).includes("onehp") ? 1 : 3) - Math.max(0, S.hearts))); hud.querySelector(".wst-hc").textContent = "🪙 " + S.coins + (dash ? ` · ${Math.round(S.z)} m` : ""); hud.querySelector(".wst-bar em").style.width = dash ? Math.min(100, (S.t / 120) * 100).toFixed(1) + "%" : Math.min(100, (S.z / L.len) * 100).toFixed(1) + "%"; };
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    function tick(dt, t) {
      dt = Math.min(dt, 0.05); if (S.slow > 0) { S.slow -= dt; dt *= 0.35; } // (a near miss: a moment of slow motion)
      if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; const n1 = Math.ceil(-S.t); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) { setTimeout(() => cd.remove(), 700); play("sprint"); } } }
      else if (!S.over) {
        const vNow = dash ? dashSpeed(o.spec, S.t) : RU.has("speedup") ? v * (1 + S.t * 0.006) : v; S.t += dt; S.z += vNow * dt;
        fx.speed(Math.min(1, Math.max(0, (vNow - 15) / 22))); S.inv = Math.max(0, S.inv - dt); S.slide = Math.max(0, S.slide - dt);
        S.vy -= (RU.has("low") ? 13 : 24) * dt; S.y = Math.max(0, S.y + S.vy * dt); if (S.y === 0) S.vy = 0;
        // over a gap with your feet on the ground: down you go (a heart), back on the far side
        if (S.y < 0.05 && gaps.some((g) => Math.abs(S.z - g) < GAP / 2 - 0.3)) hurt("gap");
        const ln = S.lane, h = S.slide > 0 ? 0.9 : 1.8;
        for (const w of walls) { if (w.z < S.z - 1) continue; if (w.z > S.z + 1) break; if (w.lane === ln && Math.abs(w.z - S.z) < 0.6 && S.y < 1.6) hurt("wall"); }
        for (const l of lasers) { const d = Math.abs(l.z - S.z); if (d < 0.45 && S.y < 1.3 && S.y + h > 1.15) hurt("laser"); else if (d < 0.6 && S.slide > 0 && !S.nice.has(l.z) && !ctx.reduce) { S.nice.add(l.z); S.slow = 0.32; fx.say(T("NICE!")); } }
        coinRows.forEach((c, i) => { if (!got[i] && c.lane === ln && Math.abs(c.z - S.z) < 1 && S.y < 2.2) { got[i] = 1; S.coins++; pop(LANES[c.lane], 1.1, c.z); S.combo = S.t - S.lastCoin < 1.4 ? S.combo + 1 : 1; S.lastCoin = S.t; fx.combo(S.combo); if (ctx.Snd && ctx.Snd.coin) try { ctx.Snd.coin(); } catch { /* no sound */ } } });
        mwalls.forEach((w, i) => { const x = mwX(w, S.t); mwm[i].position.x = x; if (Math.abs(w.z - S.z) < 0.6 && Math.abs(x - S.x) < 1.2 && S.y < 1.6) hurt("wall"); });
        blinks.forEach((b2, i) => { const on = blinkOn(b2, S.t); blm[i].visible = on; if (on && Math.abs(b2.z - S.z) < 0.45 && S.y < 1.3 && S.y + h > 1.15) hurt("laser"); });
        heartRows.forEach((h, i) => { if (!hGot[i] && h.lane === ln && Math.abs(h.z - S.z) < 1 && S.y < 2.2) { hGot[i] = 1; hm[i].visible = false; if (S.hearts < (RU.has("onehp") ? 1 : 3)) { S.hearts++; fx.say("❤️ +1"); } pop(LANES[h.lane], 1.1, h.z); } });
        if (!dash && S.z >= L.len) { S.z = L.len; end(true); }
        if (dash && S.z >= L.len - 30) { S.z = L.len - 30; end(true); }
        paintHud();
        if (hero && !hero.busy() && S.clip !== "sprint") play("sprint");
        while (S.tr.length * 0.2 <= S.t && S.tr.length < 900) S.tr.push([Math.round(S.x * 10), Math.round(S.y * 10), Math.round(S.z)]);
      }
      if (gh) gh.at(Math.max(0, S.t), t);
      S.x += (LANES[S.lane] - S.x) * Math.min(1, dt * 12);
      me.position.set(S.x, S.y, S.z); me.visible = !(S.inv > 0 && ((t * 12) | 0) % 2);
      if (hero) hero.update(dt, t);
      // the coins near you turn (the rest stay where they are)
      coinRows.forEach((c, i) => { if (c.z < S.z - 4 || c.z > S.z + 70) return; q.setFromAxisAngle(up, t * 3 + i); mt.compose(pv.set(LANES[c.lane], got[i] ? -5 : 1.1, c.z), q.multiply(flip), sc); cm.setMatrixAt(i, mt); });
      cm.instanceMatrix.needsUpdate = true;
      for (const p of pops) if (p.t < 0.4) { p.t += dt; const k = p.t / 0.4; p.m.scale.setScalar(1 + k * 2.2); p.m.material.opacity = 1 - k; p.m.rotation.y += dt * 6; if (k >= 1) p.m.visible = false; }
      cam.position.set(S.x * 0.6, 4.3 + S.y * 0.4, S.z - 7.6); cam.lookAt(S.x * 0.8, 1.2 + S.y * 0.3, S.z + 9);
      if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    }
    hud.querySelector(".wst-hx").addEventListener("click", () => leave());
    async function end(done) {
      if (S.over) return; S.over = true; S.done = done; play(done ? "emote-yes" : "die", true);
      fx.speed(0);
      await result(o, hud, { trace: S.tr, coins: S.coins, dist: S.z, done, line: dash ? `🪙 ${S.coins} · ${Math.round(S.z)} m` : `🪙 ${S.coins} / ${L.coins} · ${Math.round(S.z)} / ${Math.round(L.len)} m`, head: dash ? "♾️ " + T("{m} m!", { m: Math.round(S.z) }) : done ? "🏁 " + T("Finished!") : "💥 " + T("Out of hearts"), confetti: done || dash }, leave);
    }
    function leave(again) {
      removeEventListener("keydown", keys, true); removeEventListener("touchstart", ts); removeEventListener("touchend", te); removeEventListener("pointerdown", ts); removeEventListener("pointerup", pu);
      st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio");
      if (hero) me.remove(hero.obj); // (the hero's materials are the kit's, shared: only what this run made is let go)
      scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });
      playing = null; if (!again && o.onBack) { o.onBack(); return; } if (!again && el) { el.hidden = false; paint(); load(); }
    }
    st.view(scene, cam); st.solo(tick); tick(0.016, 0); paintHud();
    return { S, leave, L, ghost: () => (gh ? 1 : 0), clips: (all) => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((x) => x.isRunning() && (all || x.getEffectiveWeight() > 0.5)).map((x) => x.getClip().name) : []), jump, slide, lane };
  }
  /// Studio 3c: a Ring Puzzle is played on INFINITY RINGS' own board (world-rings.js playStudio); the clear's moves come back
  /// here, go to the server (which replays them) and get the Studio's result card
  async function playPuzzle(o, vw) {
    const back = () => { playing = null; document.body.classList.remove("wp-studio"); if (el && vw) { el.hidden = false; paint(); load(); } };
    let R = null; try { R = ctx.rings ? await ctx.rings() : null; } catch (e) { console.warn("studio puzzle", e); }
    const L = genLevel(o.spec); playing = { puzzle: true, S: { t: 0 } };
    const ok = R && await R.playStudio(L.id, { hints: L.hints,
      onExit: () => back(),
      onDone: async (r) => {
        document.body.classList.add("wp-studio"); const hud = document.createElement("div"); hud.className = "wst-hud"; document.body.appendChild(hud);
        const leave = (again) => { hud.remove(); playing = null; document.body.classList.remove("wp-studio"); if (!again && el) { el.hidden = false; paint(); load(); } };
        await result(o, hud, { puzzle: r, coins: 0, dist: 0, done: true, line: `🧩 ${T("Moves {n}", { n: r.count })} · ${T("Par {n}", { n: r.par })}${r.hints ? " · 💡 " + r.hints : ""}`, head: "🧩 " + T("Cleared!") + " " + "★".repeat(r.stars), confetti: true }, leave);
      } }).catch((e) => { console.warn("studio puzzle", e); return false; });
    if (!ok) { ctx.toast(T("The game couldn't start")); back(); }
  }
  /// Studio 3: the #1's ghost — a see-through figure that runs their run (a sample every 0.2 s, in between it glides)
  function makeGhost(scene, gst, arena) {
    if (!gst || !Array.isArray(gst.tr) || gst.tr.length < 2) return null;
    const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1, 4, 10), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false })); m.position.y = 0.95; g.add(m);
    try { const tag = ctx.K.label("👻 " + String(gst.name || "#1").slice(0, 16), { accent: "#9fe8ff", size: 0.5 }); tag.position.y = 2.5; g.add(tag); } catch { /* no tag */ }
    scene.add(g); const tr = gst.tr, P = (p) => (arena ? [p[0] / 10, 0, p[1] / 10] : [p[0] / 10, p[1] / 10, p[2]]);
    return { at(t, tt) { const k = t / 0.2, i = Math.min(tr.length - 2, Math.floor(k)), f = Math.min(1, k - i), a = P(tr[i]), b = P(tr[i + 1]); g.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f); g.visible = k < tr.length + 5; m.material.opacity = 0.3 + Math.sin(tt * 4) * 0.08; } };
  }
  /// the run's end: the score (sent when it's a published game and you're signed in), your best on this device, a card
  async function result(o, hud, r, leave) {
    const score = r.puzzle ? puzzleScore(r.puzzle.par, r.puzzle.count, Math.min(genLevel(o.spec).hints, r.puzzle.hints || 0)) : scoreOf(r.coins, r.dist, r.done); let res = null;
    if (o.id && !o.test && ctx.sess()) { const q = await act({ action: "world-studio-play", id: o.id, ...(r.puzzle ? { moves: r.puzzle.moves, hints: r.puzzle.hints || 0 } : { coins: r.coins, dist: Math.round(r.dist), done: r.done, trace: r.trace || [] }) }); if (q && q.ok) res = q.j; }
    let best = 0; const key = "arc.studio.best." + (o.id || "test:" + o.spec.tpl + ":" + o.spec.seed); try { best = Number(localStorage.getItem(key) || 0); if (score > best) localStorage.setItem(key, String(score)); } catch { /* not kept */ }
    const isBest = score > best && best > 0;
    lastRun = { score, coins: r.coins, dist: Math.round(r.dist), done: r.done, res, isBest };
    if (o.test) lastTest = lastRun;
    const c = document.createElement("div"); c.className = "wst-res"; c.innerHTML = `<div class="wst-rin">${isBest ? `<em class="wst-best">✨ ${esc(T("New best!"))}</em>` : ""}<small>${esc(o.title || o.spec.title)}</small><h3>${esc(r.head)}</h3><b class="wst-score">${score}</b>
      <p>${esc(r.line)}</p>${res ? `<p>${esc(T("Your best: {n}", { n: res.best }))}${res.place ? " · " + esc(T("#{n} on this game", { n: res.place })) : ""}</p>` : o.test ? `<p class="wst-fine">${esc(T("A test run isn't counted."))}</p>` : ""}
      ${o.vs ? `<p class="wst-vs ${score > o.vs ? "won" : ""}">${score > o.vs ? "🏆 " + esc(T("You beat {n}'s {s}!", { n: o.vsBy || "?", s: o.vs })) : "⚔️ " + esc(T("{n} scored {s} — {d} to go", { n: o.vsBy || "?", s: o.vs, d: o.vs - score + 1 }))}</p>` : ""}${res && res.ghost ? `<p class="wst-vs won">👻 ${esc(T("You're #1 — your run is the ghost to beat now"))}</p>` : ""}
      <span><button type="button" class="wst-go big" data-again>↻ ${esc(T("Play again"))}</button><button type="button" class="wst-go alt" data-back>${esc(T(o.test ? "Back to the editor" : "Back"))}</button></span>
      ${o.id && !o.test ? `<span><button type="button" class="wst-go alt" data-chal>⚔️ ${esc(T("Challenge a friend"))}</button>${ctx.share ? `<button type="button" class="wst-go alt" data-rcard aria-label="${esc(T("Share card"))}">📸</button>` : ""}<button type="button" class="wst-go" data-nextg>${esc(T("Next game"))} ▶</button></span>` : ""}</div>`;
    hud.appendChild(c); if (r.confetti && !ctx.reduce) confetti(hud);
    c.querySelector("[data-again]").addEventListener("click", () => { leave(true); setTimeout(() => run(o), 50); });
    c.querySelector("[data-back]").addEventListener("click", () => leave());
    const ch = c.querySelector("[data-chal]"); if (ch) ch.addEventListener("click", async () => { const me0 = (ctx.myName && ctx.myName()) || ""; const u = `${location.origin}/play?sg=${encodeURIComponent(o.id)}&vs=${score}${me0 ? "&by=" + encodeURIComponent(me0) : ""}`; try { await navigator.clipboard.writeText(u); ctx.toast("⚔️ " + esc(T("Challenge link copied — can they beat {s}?", { s: score }))); } catch { prompt(T("Copy link"), u); } });
    const rc = c.querySelector("[data-rcard]"); if (rc) rc.addEventListener("click", () => shareCard(o.id, score));
    const nx = c.querySelector("[data-nextg]"); if (nx) nx.addEventListener("click", async () => { if (!arcade.length) await load(); const L2 = arcade.filter((g) => g.id !== o.id); if (!L2.length) { ctx.toast(esc(T("That's every game on the arcade for now"))); return; } const seen = nextSeen.add(o.id), pick = L2.find((g) => !seen.has(g.id)) || L2[0]; leave(true); setTimeout(() => playId(pick.id), 50); });
  }
  function confetti(box) { const cols = ["#5fd3ff", "#7cf5c8", "#ffd23a", "#ff6fae", "#b48cff"]; for (let i = 0; i < 46; i++) { const p = document.createElement("i"); p.className = "wst-conf"; p.style.cssText = `left:${(i * 37) % 100}%;background:${cols[i % 5]};animation-delay:${(i % 9) * 0.06}s;--dx:${((i * 53) % 120) - 60}px;--r:${(i * 71) % 360}deg`; box.appendChild(p); setTimeout(() => p.remove(), 2600); } }
  /// the HUD's effects: speed lines (0–1), the combo (×3 and up), a word that pops (NICE!)
  function makeFx(hud) {
    const sp = hud.querySelector(".wst-speed"), cb = hud.querySelector(".wst-combo");
    return {
      speed(k) { if (sp) sp.style.opacity = ctx.reduce ? 0 : (k * 0.85).toFixed(2); },
      combo(n) { if (!cb) return; if (n < 3) { cb.hidden = true; return; } cb.hidden = false; cb.textContent = "×" + n; cb.classList.remove("pop"); void cb.offsetWidth; cb.classList.add("pop"); },
      say(w) { const e = document.createElement("b"); e.className = "wst-say"; e.textContent = w; hud.appendChild(e); setTimeout(() => e.remove(), 900); },
    };
  }

  // ---------------- the arena (Studio 2): seen from above, drones from the edge, laser sweeps, coins, last the time ----------------
  async function makeArena(o) {
    const { st } = ctx, th = THEMES[o.spec.theme], A = genLevel(o.spec), R = A.R, dSpeed = 2.6 + o.spec.speed * 0.9;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(th.sky); scene.fog = new THREE.Fog(th.fog, 40, 90);
    const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0xffffff, th.track, 1.2)); const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(5, 16, 6); scene.add(sun);
    const std = (c, o2 = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2, ...o2 }), glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false, depthWrite: op >= 1 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.6, 0.6, 64), std(th.track, { roughness: 0.6 })); floor.position.y = -0.3; scene.add(floor);
    for (const [r, w, op] of [[R, 0.14, 1], [R * 0.66, 0.05, 0.5], [R * 0.33, 0.05, 0.5]]) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 96), glow(th.edge, op)); m.rotation.x = Math.PI / 2; m.position.y = 0.03; scene.add(m); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, h = 1.5 + (i % 3); const p = new THREE.Mesh(new THREE.BoxGeometry(1, h, 1), std(th.prop, { emissive: th.prop, emissiveIntensity: 0.35 })); p.position.set(Math.cos(a) * (R + 2.2), h / 2 - 0.6, Math.sin(a) * (R + 2.2)); scene.add(p); }
    // S4c: the maker's pillars — you can't walk through them, and a drone that hits one is gone
    const pil = A.pillars || []; if (pil.length) { const pG = new THREE.CylinderGeometry(1, 1.1, 2.6, 20), pM = std(th.wall, { emissive: th.wall, emissiveIntensity: 0.25 }), capM = glow(th.edge, 0.9); for (const q of pil) { const m = new THREE.Mesh(pG, pM); m.position.set(q.x, 1.3, q.z); scene.add(m); const cap = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.06, 6, 28), capM); cap.rotation.x = Math.PI / 2; cap.position.set(q.x, 2.62, q.z); scene.add(cap); } }
    // the hero and its walk
    let hero = null; try { hero = await ctx.makeHero(); } catch (e) { console.warn("studio hero", e); }
    const me = new THREE.Group(); scene.add(me); if (hero) { me.add(hero.obj); try { hero.play("idle"); } catch { /* no clip */ } } else { const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 10), std(0xeef4fb)); cap.position.y = 0.9; me.add(cap); }
    document.body.classList.add("wp-studio");
    const hud = document.createElement("div"); hud.className = "wst-hud"; hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || o.spec.title)}</b><span class="wst-hp">❤️❤️❤️</span><span class="wst-hc">🪙 0</span><span class="wst-combo" hidden></span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div><p class="wst-help">${esc(T(ctx.coarse ? "Drag anywhere to move · dodge the drones" : "WASD / arrows to move · dodge the drones"))}</p><div class="wst-speed" aria-hidden="true"></div>`;
    document.body.appendChild(hud);
    const off = Math.max(0, Math.min(A.secs - 5, o.startT || 0)), fx = makeFx(hud), S = { x: 0, z: 0, hearts: (o.spec.rules || []).includes("onehp") ? 1 : 3, inv: 0, coins: 0, t: -3, over: false, clip: "", face: 0, combo: 0, lastCoin: -9, tr: [] }, gh = makeGhost(scene, o.ghost, true);
    const keyOn = new Set(), kd = (e) => { const k = e.key.toLowerCase(); if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"].includes(k)) { keyOn.add(k); e.preventDefault(); } }, ku = (e) => keyOn.delete(e.key.toLowerCase());
    let drag = null; const pd = (e) => { if (e.target.closest && e.target.closest("button")) return; drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; }, pm = (e) => { if (drag) { drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y; } }, pu = () => { drag = null; };
    addEventListener("keydown", kd, true); addEventListener("keyup", ku, true); addEventListener("pointerdown", pd); addEventListener("pointermove", pm); addEventListener("pointerup", pu); addEventListener("pointercancel", pu);
    const play = (c, opt) => { if (!hero) return; try { hero.play(c, opt || {}); } catch { /* no clip */ } S.clip = opt && opt.once ? "" : c; }; /* (after a one-shot the move clip is asked for again) */
    // drones, sweeps and coins, made as their time comes
    const dG = new THREE.SphereGeometry(0.55, 16, 12), bG = new THREE.SphereGeometry(1.1, 18, 14), ringG = new THREE.TorusGeometry(0.8, 0.07, 6, 24), dM = std(th.wall, { emissive: th.wall, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.25 }), bM = std(0xffb02e, { emissive: 0xff7a1a, emissiveIntensity: 0.6 }), rM = glow(th.edge, 0.8);
    const drones = [], sweeps = [], coins = []; let wi = 0, ci = 0;
    const cM = std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 }), cG = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18);
    const paintHud = () => { hud.querySelector(".wst-hp").textContent = "❤️".repeat(Math.max(0, S.hearts)) + "🖤".repeat(Math.max(0, ((o.spec.rules || []).includes("onehp") ? 1 : 3) - Math.max(0, S.hearts))); hud.querySelector(".wst-hc").textContent = `🪙 ${S.coins} · ${Math.max(0, Math.ceil(A.secs - Math.max(0, S.t)))}s`; hud.querySelector(".wst-bar em").style.width = Math.min(100, (Math.max(0, S.t) / A.secs) * 100).toFixed(1) + "%"; };
    function hurt() { if (S.inv > 0 || S.over) return; S.hearts--; S.inv = 1.3; play(S.hearts > 0 ? "hit" : "die", { once: true }); if (ctx.Snd && ctx.Snd.hurt) try { ctx.Snd.hurt(); } catch { /* no sound */ } paintHud(); if (S.hearts <= 0) end(false); }
    const mv = new THREE.Vector3();
    function tick(dt, t) {
      dt = Math.min(dt, 0.05);
      if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; if (S.t >= 0 && off) { S.t = off; while (wi < A.waves.length && A.waves[wi].t < off) wi++; while (ci < A.coinsAt.length && A.coinsAt[ci].t < off - 8) ci++; } const n1 = Math.ceil(-Math.min(0, S.t)); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) setTimeout(() => cd.remove(), 700); } }
      else if (!S.over) {
        S.t += dt; S.inv = Math.max(0, S.inv - dt);
        // moving: keys or a drag; the camera's up is −z
        let ix = (keyOn.has("arrowright") || keyOn.has("d") ? 1 : 0) - (keyOn.has("arrowleft") || keyOn.has("a") ? 1 : 0), iz = (keyOn.has("arrowdown") || keyOn.has("s") ? 1 : 0) - (keyOn.has("arrowup") || keyOn.has("w") ? 1 : 0);
        if (drag && Math.hypot(drag.dx, drag.dy) > 8) { const l = Math.hypot(drag.dx, drag.dy); ix = drag.dx / l * Math.min(1, l / 60); iz = drag.dy / l * Math.min(1, l / 60); }
        const il = Math.hypot(ix, iz), spd = 6.8 * Math.min(1, il);
        if (il > 0.05) { S.x += (ix / il) * spd * dt; S.z += (iz / il) * spd * dt; S.face = Math.atan2(ix, iz); const r = Math.hypot(S.x, S.z); if (r > R - 0.8) { S.x *= (R - 0.8) / r; S.z *= (R - 0.8) / r; } for (const q of pil) { const dx = S.x - q.x, dz = S.z - q.z, d = Math.hypot(dx, dz) || 0.01; if (d < 1.55) { S.x = q.x + (dx / d) * 1.55; S.z = q.z + (dz / d) * 1.55; } } }
        if (hero && !hero.busy()) { const want = spd > 5 ? "sprint" : spd > 0.5 ? "walk" : "idle"; if (S.clip !== want) play(want); }
        while (wi < A.waves.length && A.waves[wi].t <= S.t) { const w = A.waves[wi++];
          if (w.k === "L") { const m = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, 0.5), glow(0xff3355, 0.25)); m.rotation.set(-Math.PI / 2, 0, w.a); m.position.y = 0.05; scene.add(m); sweeps.push({ m, a: w.a, t: 0 }); continue; }
          const big = w.k === "D", m = new THREE.Mesh(big ? bG : dG, big ? bM : dM), rg = new THREE.Mesh(ringG, rM); rg.rotation.x = Math.PI / 2; m.add(rg); m.position.set(Math.cos(w.a) * (R + 1), big ? 1.2 : 0.8, Math.sin(w.a) * (R + 1)); scene.add(m);
          drones.push({ m, big, vx: 0, vz: 0, life: 0 }); }
        while (ci < A.coinsAt.length && A.coinsAt[ci].t <= S.t) { const c = A.coinsAt[ci++], m = new THREE.Mesh(cG, cM); m.rotation.x = Math.PI / 2; m.position.set(c.x, 0.9, c.z); scene.add(m); coins.push({ m, t: 0 }); }
        for (let i = drones.length - 1; i >= 0; i--) { const d = drones[i]; d.life += dt; const p = d.m.position, dx = S.x - p.x, dz = S.z - p.z, l = Math.hypot(dx, dz) || 1, sp = d.big ? dSpeed * 0.6 : dSpeed;
          // homing for the first seconds, then straight on (so they can be dodged)
          if (d.life < 2.2) { d.vx = (dx / l) * sp; d.vz = (dz / l) * sp; } p.x += d.vx * dt; p.z += d.vz * dt; d.m.rotation.y += dt * 3;
          if (pil.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < (d.big ? 2.1 : 1.6))) { fx.pop && fx.pop(); scene.remove(d.m); drones.splice(i, 1); continue; }
          if (Math.hypot(dx, dz) < (d.big ? 1.5 : 0.95)) { hurt(); scene.remove(d.m); drones.splice(i, 1); continue; }
          if (Math.hypot(p.x, p.z) > R + 3 && d.life > 2) { scene.remove(d.m); drones.splice(i, 1); } }
        for (let i = sweeps.length - 1; i >= 0; i--) { const w = sweeps[i]; w.t += dt; // a warning for 1.2 s, then the beam for 0.5 s
          if (w.t < 1.2) w.m.material.opacity = 0.15 + Math.abs(Math.sin(w.t * 12)) * 0.25; else { w.m.scale.y = 2.2; w.m.material.opacity = 0.95; const n = Math.abs(-Math.sin(w.a) * S.x + Math.cos(w.a) * S.z); if (n < 0.7) hurt(); }
          if (w.t > 1.7) { scene.remove(w.m); w.m.geometry.dispose(); sweeps.splice(i, 1); } }
        for (let i = coins.length - 1; i >= 0; i--) { const c = coins[i]; c.t += dt; c.m.rotation.z += dt * 3; if (Math.hypot(c.m.position.x - S.x, c.m.position.z - S.z) < 1.1) { S.coins++; S.combo = S.t - S.lastCoin < 2.5 ? S.combo + 1 : 1; S.lastCoin = S.t; fx.combo(S.combo); if (ctx.Snd && ctx.Snd.coin) try { ctx.Snd.coin(); } catch { /* no sound */ } scene.remove(c.m); coins.splice(i, 1); continue; } if (c.t > 9) { scene.remove(c.m); coins.splice(i, 1); } }
        if (S.t >= A.secs) end(true);
        paintHud();
        while (S.tr.length * 0.2 <= S.t && S.tr.length < 900) S.tr.push([Math.round(S.x * 10), Math.round(S.z * 10)]);
      }
      if (gh) gh.at(Math.max(0, S.t), t);
      me.position.set(S.x, 0, S.z); me.rotation.y = S.face; me.visible = !(S.inv > 0 && ((t * 12) | 0) % 2);
      if (hero) hero.update(dt, t);
      cam.position.set(S.x * 0.5, 19, S.z * 0.5 + 13); cam.lookAt(S.x * 0.6, 0, S.z * 0.6);
      if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    }
    hud.querySelector(".wst-hx").addEventListener("click", () => leave());
    async function end(done) { if (S.over) return; S.over = true; play(done ? "emote-yes" : "die", { once: true }); const secs = Math.min(A.secs, Math.max(0, S.t));
      await result(o, hud, { trace: S.tr, coins: S.coins, dist: secs * 20, done, line: `🪙 ${S.coins} / ${A.coins} · ${Math.round(secs)} / ${A.secs} s`, head: done ? "🛸 " + T("You lasted!") : "💥 " + T("Out of hearts"), confetti: done }, leave); }
    function leave(again) {
      removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); removeEventListener("pointerdown", pd); removeEventListener("pointermove", pm); removeEventListener("pointerup", pu); removeEventListener("pointercancel", pu);
      st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio");
      if (hero) me.remove(hero.obj);
      scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });
      playing = null; if (!again && o.onBack) { o.onBack(); return; } if (!again && el) { el.hidden = false; paint(); load(); }
    }
    st.view(scene, cam); st.solo(tick); tick(0.016, 0); paintHud();
    return { S, leave, A, ghost: () => (gh ? 1 : 0), clips: (all) => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((x) => x.isRunning() && (all || x.getEffectiveWeight() > 0.5)).map((x) => x.getClip().name) : []), move: (x, z) => { keyOn.clear(); if (x > 0) keyOn.add("d"); if (x < 0) keyOn.add("a"); if (z > 0) keyOn.add("s"); if (z < 0) keyOn.add("w"); } };
  }
  return { open, close, shown, playId, builder: () => builder, openBuilder: () => openBuilder(), step: (n) => { step = n; if (el && !el.hidden) paint(); }, playing: () => playing, last: () => lastRun, spec: () => spec, set: (s) => { spec = clampSpec(s); if (el && !el.hidden) paint(); } };
}
