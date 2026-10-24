// world-studio.js — ARCIRCLE Studio Lite (AD-City 3, the owner's call 2026-10-23), opened from Nexus City's ARCIRCLE Studio.
// Make a game from a template (Sky Runner now; Arena / Puzzle / Defense listed as coming), with your agent's help (it
// drafts the settings from your words), test it, save it, publish it to the Creator Arcade, and play everyone's games.
// A game is numbers on a template (world-studio-gen.js, the server's own copy): the level is built from them, seeded,
// so it plays the same for everyone. What's kept and counted is the server's (api/_world-studio.mjs); nothing pays ARCL.
//   the window   Create (templates, the agent's draft, the settings, test / save / publish) · My games · Arcade
//   the runner   its own scene drawn instead of the town (st.view / st.solo, like the Game Village's games): three lanes,
//                your hero runs (sprint), jumps the gaps (jump), slides under lasers (dodge), switches lanes past walls,
//                grabs coins; three hearts; the finish arch; a result card (score, your best, your place)
import { TEMPLATES, THEMES, LENS, LANES, KNOBS, PRESETS, clampSpec, genLevel, scoreOf, speedOf, dashSpeed, estimate, puzzleScore } from "./world-studio-gen.js";
import { makePreview } from "./world-studio-prev.js";
import { level as ringLevel } from "./world-rings-engine.js";
// Studio 2 (2026-10-24): two more templates (Infinity Dash: the lanes without a finish, faster and faster; Arena Survival:
// seen from above, drones from the edge, laser sweeps, coins, last the time), a preview strip of the level in the editor,
// a share link (/play?sg=<id>), and the runs' effects (coin pops and a combo, speed lines, a slow-mo near miss under a
// laser, confetti at the finish, "New best!")
const ICON = { runner: "🏃", dash: "♾️", arena: "🛸", puzzle: "🧩", defense: "🛡️" };
const LEN_NAME = { dash: { 30: "Gentle", 45: "Steady", 60: "Fast", 90: "Wild" }, puzzle: { 30: "No hints", 45: "1 hint", 60: "2 hints", 90: "3 hints" } };

/// ctx: { THREE, K, st, T, esc, toast, Snd, reduce, low, coarse, sess, post, signIn, makeHero(), agentName(), onOpen, onClose }
export function createStudio(ctx) {
  const { THREE, T, esc } = ctx;
  const nextSeen = new Set(); let el = null, tab = "make", gid = "", gdata = null, ghostOn = true, step = 1, prev = null, prevOk = true, snaps = {}, lastTest = null, advOpen = false, spec = clampSpec({ seed: 1 + Math.floor(Math.random() * 99999) }), editId = "", mine = [], arcade = [], busy = false, playing = null, lastRun = null, aiNote = "";
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
  const PNAME = { easy: "Easy", normal: "Normal", hard: "Hard", extreme: "Extreme" }, WHY = { wall: "walls", gap: "gaps", laser: "lasers", d: "drones", D: "big drones", L: "laser sweeps" };
  const starsTxt = (n) => `<span class="wst-stars" aria-label="${n}/5">${"<i>★</i>".repeat(n)}${"<i class=\"off\">★</i>".repeat(5 - n)}</span>`;
  const presetOf = () => Object.keys(PRESETS).find((k) => Object.entries(PRESETS[k]).every(([f, v]) => spec[f] === v)) || "";
  function paintMake() {
    const th = THEMES[spec.theme], L = genLevel(spec), KN = KNOBS[spec.tpl] || KNOBS.runner, E = estimate(spec), cur = mine.find((g) => g.id === editId);
    const bar = `<ol class="wst-steps">${STEPS.map(([l], i) => `<li><button type="button" data-step="${i + 1}" class="${step === i + 1 ? "on" : step > i + 1 ? "done" : ""}"><i>${step > i + 1 ? "✓" : i + 1}</i><span>${esc(T(l))}</span></button></li>`).join("")}</ol>`;
    const box = step <= 4 ? `<div class="wst-3dbox${step === 4 ? " big" : ""}">${prev ? "" : `<canvas class="wst-prev" width="640" height="76" aria-label="${esc(T("Preview"))}"></canvas>`}<span class="wst-3dtag">${ICON[spec.tpl] || "🎮"} ${esc(T(TEMPLATES[spec.tpl].name))} · ${esc(T(th.name))}</span></div>` : "";
    let body = "";
    if (step === 1) body = `<div class="wst-tpls">${Object.entries(TEMPLATES).map(([id, t]) => `<button type="button" class="wst-tpl${id === spec.tpl ? " on" : ""}${t.open ? "" : " soon"}" ${t.open ? `data-tpl="${id}"` : "disabled"}><span class="wst-art" style="background-image:url(/images/ui/studio/${id}.webp?v=1)" aria-hidden="true"></span><b>${esc(T(t.name))}</b>${t.open ? "" : `<small>${esc(T("Coming soon"))}</small>`}</button>`).join("")}</div>
      <div class="wst-ai"><b>✨ ${esc(T("Ask {n} to draft it", { n: ctx.agentName() || T("your agent") }))}</b><div class="wst-airow"><input class="wst-aiin" maxlength="240" placeholder="${esc(T("e.g. a fast jungle run with lots of coins"))}"><button type="button" class="wst-go" data-ai ${busy ? "disabled" : ""}>${esc(T("Draft"))}</button></div>${aiNote ? `<small class="wst-ainote">${esc(aiNote)}</small>` : ""}</div>
      <label class="wst-title"><span>${esc(T("Title"))}</span><input class="wst-tin" maxlength="24" value="${esc(spec.title)}"></label>`;
    else if (step === 2) body = `<div class="wst-themes">${Object.entries(THEMES).map(([id, t]) => `<button type="button" data-theme="${id}" class="wst-thm${id === spec.theme ? " on" : ""}" style="--c:${hex(t.edge)};--b:${hex(t.sky)}"><span class="wst-thi" data-snap="${id}"${snaps[spec.tpl + ":" + id] ? ` style="background-image:url(${snaps[spec.tpl + ":" + id]})"` : ""}></span><b>${esc(T(t.name))}</b></button>`).join("")}</div>`;
    else if (step === 3) { const pk = presetOf();
      body = `<div class="wst-pres">${Object.keys(PRESETS).map((k) => { const e = estimate({ ...spec, ...PRESETS[k] }); return `<button type="button" data-preset="${k}" class="${pk === k ? "on" : ""} p-${k}"><b>${esc(T(PNAME[k]))}</b><small>${starsTxt(e.stars)}</small><em>${Math.round(e.clear * 100)}%</em></button>`; }).join("")}</div>
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
  const summary = (L) => spec.tpl === "puzzle" ? (() => { const R = ringLevel(L.id); return R ? esc(T("{n} rings · par {p}", { n: R.rings.length, p: R.par })) : ""; })() : spec.tpl === "arena" ? esc(T("{s} s · {d} waves · {c} coins", { s: L.secs, d: L.waves.length, c: L.coins })) : spec.tpl === "dash" ? esc(T("endless · {c} coins on the way", { c: L.coins })) : `${Math.round(L.len)} m · ${L.coins} ${esc(T("coins"))}`;
  /// the level at a glance: the track (or the arena's timeline), walls / gaps / lasers / coins in their colours
  function drawPrev() {
    const cv = el && el.querySelector(".wst-prev"); if (!cv) return; const x = cv.getContext("2d"), w = cv.width, h = cv.height, th = THEMES[spec.theme], L = genLevel(spec);
    x.clearRect(0, 0, w, h); x.fillStyle = hex(th.track); x.globalAlpha = 0.9; x.fillRect(0, 8, w, h - 16); x.globalAlpha = 1;
    if (spec.tpl === "puzzle") { const R = ringLevel(L.id); if (!R) return; const xs = R.rings.map((r) => r.x), ys = R.rings.map((r) => r.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, k = Math.min((w - 20) / (Math.max(...xs) - Math.min(...xs) + 3), (h - 12) / (Math.max(...ys) - Math.min(...ys) + 3)); x.lineWidth = 3; for (const r of R.rings) { const g = (r.g * Math.PI) / 4; x.strokeStyle = ["#5fd3ff", "#7cf5c8", "#ffd23a", "#ff6fae", "#b48cff", "#ff9f2e"][r.c % 6]; x.beginPath(); x.arc(w / 2 + (r.x - cx) * k, h / 2 - (r.y - cy) * k, r.r * k * 0.92, -g + 0.45, -g + Math.PI * 2 - 0.45); x.stroke(); } return; }
    if (spec.tpl === "arena") { const X = (t) => (t / L.secs) * (w - 8) + 4; for (const v of L.waves) { x.fillStyle = v.k === "L" ? "#ff3355" : v.k === "D" ? "#ffb02e" : hex(th.wall); const r = v.k === "D" ? 7 : 4; x.beginPath(); x.arc(X(v.t), 14 + ((v.a * 97) % 1) * (h - 28), r, 0, 6.283); x.fill(); } x.fillStyle = "#ffd23a"; for (const c of L.coinsAt) x.fillRect(X(c.t) - 2, h - 14, 4, 4); return; }
    const span = spec.tpl === "dash" ? Math.min(L.len, 1600) : L.len, X = (z) => (z / span) * (w - 8) + 4, Y = (lane) => 16 + lane * ((h - 32) / 2);
    x.strokeStyle = hex(th.edge); x.globalAlpha = 0.35; for (const l of [0, 1, 2]) { x.beginPath(); x.moveTo(0, Y(l)); x.lineTo(w, Y(l)); x.stroke(); } x.globalAlpha = 1;
    for (const r of L.rows) { if (r.z > span) break; const px = X(r.z); if (r.k === "wall") { x.fillStyle = hex(th.wall); x.fillRect(px - 2, Y(r.lane) - 7, 5, 14); } else if (r.k === "gap") { x.fillStyle = "#020610"; x.fillRect(px - 3, 8, 7, h - 16); } else if (r.k === "laser") { x.fillStyle = "#ff3355"; x.fillRect(px - 1, 8, 3, h - 16); } else { x.fillStyle = "#ffd23a"; x.beginPath(); x.arc(px, Y(r.lane), 2.2, 0, 6.283); x.fill(); } }
    if (spec.tpl !== "dash") { x.fillStyle = "#fff"; x.fillRect(w - 5, 8, 3, h - 16); }
  }
  const card = (g, own) => `<div class="wst-card" style="--c:${hex((THEMES[g.theme] || THEMES.neon).edge)};--b:${hex((THEMES[g.theme] || THEMES.neon).sky)}"><div class="wst-cv" data-open="${esc(g.id)}" role="button" tabindex="0" style="background-image:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55)),url(/images/ui/studio/${TEMPLATES[g.tpl] ? g.tpl : "runner"}.webp?v=1)"><i aria-hidden="true">${ICON[g.tpl] || "🏃"}</i><em>${esc(T((THEMES[g.theme] || THEMES.neon).name))}</em></div><div class="wst-ci"><b data-open="${esc(g.id)}" role="button">${esc(g.title)}</b><small>${own ? (g.pub ? "🚀 " + esc(T("On the Creator Arcade")) : "📝 " + esc(T("Draft"))) : esc(T("by {n}", { n: g.byName || "?" }))} · ▶ ${g.plays || 0} · ♥ ${g.likes || 0}</small>
    <span class="wst-cb"><button type="button" class="wst-go" data-play="${esc(g.id)}">▶ ${esc(T("Play"))}</button>${own ? `<button type="button" data-edit="${esc(g.id)}">${esc(T("Edit"))}</button><button type="button" data-pub="${esc(g.id)}">${esc(T(g.pub ? "Unpublish" : "Publish"))}</button><button type="button" data-del="${esc(g.id)}" aria-label="${esc(T("Delete"))}">🗑</button>` : `<button type="button" data-like="${esc(g.id)}">♥ ${esc(T("Like"))}</button>`}${g.pub ? `<button type="button" data-share="${esc(g.id)}" aria-label="${esc(T("Copy link"))}">🔗</button>` : ""}</span></div></div>`;
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
      <div class="wst-gcv" style="background-image:linear-gradient(180deg,transparent 30%,rgba(2,8,20,.85)),url(/images/ui/studio/${TEMPLATES[g.tpl] ? g.tpl : "runner"}.webp?v=1)"><small>${ICON[g.tpl] || "🎮"} ${esc(T((TEMPLATES[g.tpl] || TEMPLATES.runner).name))} · ${esc(T(th.name))}</small><h3>${esc(g.title)}</h3><span>${esc(T("by {n}", { n: g.byName || "?" }))} · ▶ ${g.plays || 0} · ♥ ${g.likes || 0}</span></div>
      <div class="wst-est s${E.stars}">${starsTxt(E.stars)}<span>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</span>${my ? `<small>${esc(T("Your best here: {n}", { n: my }))}</small>` : ""}</div>
      <h4>🏆 ${esc(T("Top 10"))}</h4>${(g.best || []).length ? `<ol class="wst-board">${g.best.map((x, i) => `<li class="${i === 0 ? "gold" : ""}"><i>${i === 0 ? "👑" : i + 1}</i><b>${esc(x.name || "?")}</b><em>${x.score}</em></li>`).join("")}</ol>` : `<p class="wst-empty">${esc(T("Nobody has played it yet — be the first!"))}</p>`}
      ${g.ghost ? `<label class="wst-ghosto"><input type="checkbox" data-ghost ${ghostOn ? "checked" : ""}> 👻 ${esc(T("Race {n}'s ghost ({s})", { n: g.ghost.name || "#1", s: g.ghost.score }))}</label>` : ""}
      <div class="wst-acts"><button type="button" class="wst-go big" data-play="${esc(g.id)}">▶ ${esc(T("Play"))}</button>${own ? "" : `<button type="button" class="wst-go alt" data-like="${esc(g.id)}">♥ ${esc(T("Like"))}</button>`}<button type="button" class="wst-go alt" data-share="${esc(g.id)}" aria-label="${esc(T("Copy link"))}">🔗</button></div>
      <button type="button" class="wst-link" data-tab="arcade">← ${esc(T("Creator Arcade"))}</button></div>`;
  }
  const localBest = (id) => { try { return Number(localStorage.getItem("arc.studio.best." + id) || 0); } catch { return 0; } };
  function paint() {
    if (!el) return;
    const body = tab === "mine" ? (wallet() ? (mine.length ? mine.map((g) => card(g, true)).join("") : `<p class="wst-empty">${esc(T("No games yet — make your first one in Create."))}</p>`) : `<p class="wst-empty">${esc(T("Sign in with a wallet to keep your games."))}</p>`)
      : tab === "game" ? paintGame()
      : tab === "arcade" ? (arcade.length ? arcade.map((g) => card(g, false)).join("") : `<p class="wst-empty">${esc(T("The Creator Arcade is waiting for its first game — publish yours!"))}</p>`)
      : paintMake();
    el.innerHTML = `<div class="wst-in"><header class="wst-h"><small>${esc(T("Nexus City"))}</small><h2>🎮 <em>ARCIRCLE</em> Studio Lite</h2><button type="button" class="wst-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
      <nav class="wst-tabs">${[["make", "🛠️", "Create"], ["mine", "📁", "My games"], ["arcade", "🕹️", "Creator Arcade"]].map(([id, ic, l]) => `<button type="button" data-tab="${id}" class="${tab === id ? "on" : ""}"><span aria-hidden="true">${ic}</span>${esc(T(l))}</button>`).join("")}</nav>
      <div class="wst-body">${body}</div><p class="wst-foot">${esc(T("Games are made from templates — no code. Plays, likes and best runs are counted; no ARCL is paid for games yet."))}</p></div>`;
    if (tab === "make") { drawPrev(); attachPreview(); } else if (prev) prev.stop();
  }
  let estT = 0;
  const fxStep = () => { if (ctx.Snd && ctx.Snd.click) try { ctx.Snd.click(); } catch { /* no sound */ } };
  /// a repaint that keeps the advanced settings open and the page where it was (the estimate after a slider settles)
  function paintKeep() { const b = el.querySelector(".wst-body"), y = b ? b.scrollTop : 0, d = el.querySelector(".wst-adv"); if (d) advOpen = d.open; paint(); const b2 = el.querySelector(".wst-body"); if (b2) b2.scrollTop = y; }
  function onInput(e) {
    const t = e.target;
    if (t.matches("[data-k]")) { spec[t.dataset.k] = Number(t.value); const b = t.parentElement.querySelector("b"); if (b) b.textContent = t.value; const f = el.querySelector(".wst-sum"); if (f) f.innerHTML = summary(genLevel(spec)); drawPrev(); prevSoon(); clearTimeout(estT); estT = setTimeout(() => { if (tab === "make" && step === 3) paintKeep(); }, 450); }
    if (t.matches(".wst-tin")) spec.title = t.value;
    if (t.matches("[data-ghost]")) ghostOn = t.checked;
  }
  async function onClick(e) {
    const op = e.target.closest("[data-open]"); if (op && !e.target.closest("button")) return openGame(op.dataset.open);
    const b = e.target.closest("button"); if (!b || b.disabled) { if (e.target === el) close(); return; }
    if (b.hasAttribute("data-x")) return close();
    if (b.dataset.tab) { tab = b.dataset.tab; paint(); if (tab !== "make") load(); return; }
    if (b.dataset.step) { step = Number(b.dataset.step); return paintKeep(); }
    if (b.hasAttribute("data-next")) { step = Math.min(5, step + 1); fxStep(); return paint(); }
    if (b.hasAttribute("data-back")) { step = Math.max(1, step - 1); return paint(); }
    if (b.dataset.preset) { Object.assign(spec, PRESETS[b.dataset.preset]); if (ctx.Snd && ctx.Snd.click) try { ctx.Snd.click(); } catch { /* no sound */ } return paintKeep(); }
    if (b.hasAttribute("data-savepub")) { await save(); if (editId && !(mine.find((g) => g.id === editId) || {}).pub) await publish(editId); return; }
    if (b.dataset.tpl) { spec = clampSpec({ ...spec, tpl: b.dataset.tpl, title: spec.title === "My Sky Run" || spec.title === "My Arena" || spec.title === "My Infinity Dash" ? "" : spec.title }); return paint(); }
    if (b.dataset.theme) { spec.theme = b.dataset.theme; return paintKeep(); }
    if (b.dataset.len) { spec.len = Number(b.dataset.len); return paintKeep(); }
    if (b.hasAttribute("data-seed")) { spec.seed = 1 + Math.floor(Math.random() * 99999); return paintKeep(); }
    if (b.hasAttribute("data-test")) { spec = clampSpec(spec); return run({ spec, id: editId || "", test: true }); }
    if (b.hasAttribute("data-ai")) return draft();
    if (b.hasAttribute("data-save")) return save();
    if (b.dataset.pub) return publish(b.dataset.pub);
    if (b.dataset.del) return del(b.dataset.del);
    if (b.dataset.edit) { const g = mine.find((x) => x.id === b.dataset.edit); if (g) { spec = clampSpec(g.spec); editId = g.id; tab = "make"; step = 3; lastTest = null; paint(); } return; }
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
  async function playId(id, opt = {}) {
    let g = mine.find((x) => x.id === id && x.spec);
    if (!g) try { const r = await fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id), { cache: "no-store" }); if (r.ok) g = (await r.json()).game; } catch { /* below */ }
    if (!g || !g.spec) { ctx.toast(T("Couldn't open it — try again")); return; }
    run({ spec: clampSpec(g.spec), id, title: g.title, by: g.byName, ghost: opt.ghost || null, vs: opt.vs || 0, vsBy: opt.vsBy || "" });
  }

  // ---------------- the runner ----------------
  async function run(o) {
    if (playing) return; const vw = el && !el.hidden; if (el) el.hidden = true;
    if (o.spec.tpl === "puzzle") return playPuzzle(o, vw);
    try { playing = o.spec.tpl === "arena" ? await makeArena(o) : await makeRun(o); }
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
    const walls = L.rows.filter((r) => r.k === "wall"), lasers = L.rows.filter((r) => r.k === "laser"), coinRows = L.rows.filter((r) => r.k === "coin");
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
    const S = { z: 0, x: 0, lane: 1, y: 0, vy: 0, slide: 0, hearts: 3, inv: 0, coins: 0, t: -3, done: false, over: false, clip: "", combo: 0, lastCoin: -9, slow: 0, nice: new Set(), tr: [] };
    const fx = makeFx(hud);
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
    const paintHud = () => { hud.querySelector(".wst-hp").textContent = "❤️".repeat(Math.max(0, S.hearts)) + "🖤".repeat(3 - Math.max(0, S.hearts)); hud.querySelector(".wst-hc").textContent = "🪙 " + S.coins + (dash ? ` · ${Math.round(S.z)} m` : ""); hud.querySelector(".wst-bar em").style.width = dash ? Math.min(100, (S.t / 120) * 100).toFixed(1) + "%" : Math.min(100, (S.z / L.len) * 100).toFixed(1) + "%"; };
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    function tick(dt, t) {
      dt = Math.min(dt, 0.05); if (S.slow > 0) { S.slow -= dt; dt *= 0.35; } // (a near miss: a moment of slow motion)
      if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; const n1 = Math.ceil(-S.t); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) { setTimeout(() => cd.remove(), 700); play("sprint"); } } }
      else if (!S.over) {
        const vNow = dash ? dashSpeed(o.spec, S.t) : v; S.t += dt; S.z += vNow * dt;
        fx.speed(Math.min(1, Math.max(0, (vNow - 15) / 22))); S.inv = Math.max(0, S.inv - dt); S.slide = Math.max(0, S.slide - dt);
        S.vy -= 24 * dt; S.y = Math.max(0, S.y + S.vy * dt); if (S.y === 0) S.vy = 0;
        // over a gap with your feet on the ground: down you go (a heart), back on the far side
        if (S.y < 0.05 && gaps.some((g) => Math.abs(S.z - g) < GAP / 2 - 0.3)) hurt("gap");
        const ln = S.lane, h = S.slide > 0 ? 0.9 : 1.8;
        for (const w of walls) { if (w.z < S.z - 1) continue; if (w.z > S.z + 1) break; if (w.lane === ln && Math.abs(w.z - S.z) < 0.6 && S.y < 1.6) hurt("wall"); }
        for (const l of lasers) { const d = Math.abs(l.z - S.z); if (d < 0.45 && S.y < 1.3 && S.y + h > 1.15) hurt("laser"); else if (d < 0.6 && S.slide > 0 && !S.nice.has(l.z) && !ctx.reduce) { S.nice.add(l.z); S.slow = 0.32; fx.say(T("NICE!")); } }
        coinRows.forEach((c, i) => { if (!got[i] && c.lane === ln && Math.abs(c.z - S.z) < 1 && S.y < 2.2) { got[i] = 1; S.coins++; pop(LANES[c.lane], 1.1, c.z); S.combo = S.t - S.lastCoin < 1.4 ? S.combo + 1 : 1; S.lastCoin = S.t; fx.combo(S.combo); if (ctx.Snd && ctx.Snd.coin) try { ctx.Snd.coin(); } catch { /* no sound */ } } });
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
      playing = null; if (!again && el) { el.hidden = false; paint(); load(); }
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
      ${o.id && !o.test ? `<span><button type="button" class="wst-go alt" data-chal>⚔️ ${esc(T("Challenge a friend"))}</button><button type="button" class="wst-go" data-nextg>${esc(T("Next game"))} ▶</button></span>` : ""}</div>`;
    hud.appendChild(c); if (r.confetti && !ctx.reduce) confetti(hud);
    c.querySelector("[data-again]").addEventListener("click", () => { leave(true); setTimeout(() => run(o), 50); });
    c.querySelector("[data-back]").addEventListener("click", () => leave());
    const ch = c.querySelector("[data-chal]"); if (ch) ch.addEventListener("click", async () => { const me0 = (ctx.myName && ctx.myName()) || ""; const u = `${location.origin}/play?sg=${encodeURIComponent(o.id)}&vs=${score}${me0 ? "&by=" + encodeURIComponent(me0) : ""}`; try { await navigator.clipboard.writeText(u); ctx.toast("⚔️ " + esc(T("Challenge link copied — can they beat {s}?", { s: score }))); } catch { prompt(T("Copy link"), u); } });
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
    // the hero and its walk
    let hero = null; try { hero = await ctx.makeHero(); } catch (e) { console.warn("studio hero", e); }
    const me = new THREE.Group(); scene.add(me); if (hero) { me.add(hero.obj); try { hero.play("idle"); } catch { /* no clip */ } } else { const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 10), std(0xeef4fb)); cap.position.y = 0.9; me.add(cap); }
    document.body.classList.add("wp-studio");
    const hud = document.createElement("div"); hud.className = "wst-hud"; hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || o.spec.title)}</b><span class="wst-hp">❤️❤️❤️</span><span class="wst-hc">🪙 0</span><span class="wst-combo" hidden></span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div><p class="wst-help">${esc(T(ctx.coarse ? "Drag anywhere to move · dodge the drones" : "WASD / arrows to move · dodge the drones"))}</p><div class="wst-speed" aria-hidden="true"></div>`;
    document.body.appendChild(hud);
    const fx = makeFx(hud), S = { x: 0, z: 0, hearts: 3, inv: 0, coins: 0, t: -3, over: false, clip: "", face: 0, combo: 0, lastCoin: -9, tr: [] }, gh = makeGhost(scene, o.ghost, true);
    const keyOn = new Set(), kd = (e) => { const k = e.key.toLowerCase(); if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"].includes(k)) { keyOn.add(k); e.preventDefault(); } }, ku = (e) => keyOn.delete(e.key.toLowerCase());
    let drag = null; const pd = (e) => { if (e.target.closest && e.target.closest("button")) return; drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; }, pm = (e) => { if (drag) { drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y; } }, pu = () => { drag = null; };
    addEventListener("keydown", kd, true); addEventListener("keyup", ku, true); addEventListener("pointerdown", pd); addEventListener("pointermove", pm); addEventListener("pointerup", pu); addEventListener("pointercancel", pu);
    const play = (c, opt) => { if (!hero) return; try { hero.play(c, opt || {}); } catch { /* no clip */ } S.clip = opt && opt.once ? "" : c; }; /* (after a one-shot the move clip is asked for again) */
    // drones, sweeps and coins, made as their time comes
    const dG = new THREE.SphereGeometry(0.55, 16, 12), bG = new THREE.SphereGeometry(1.1, 18, 14), ringG = new THREE.TorusGeometry(0.8, 0.07, 6, 24), dM = std(th.wall, { emissive: th.wall, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.25 }), bM = std(0xffb02e, { emissive: 0xff7a1a, emissiveIntensity: 0.6 }), rM = glow(th.edge, 0.8);
    const drones = [], sweeps = [], coins = []; let wi = 0, ci = 0;
    const cM = std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 }), cG = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18);
    const paintHud = () => { hud.querySelector(".wst-hp").textContent = "❤️".repeat(Math.max(0, S.hearts)) + "🖤".repeat(3 - Math.max(0, S.hearts)); hud.querySelector(".wst-hc").textContent = `🪙 ${S.coins} · ${Math.max(0, Math.ceil(A.secs - Math.max(0, S.t)))}s`; hud.querySelector(".wst-bar em").style.width = Math.min(100, (Math.max(0, S.t) / A.secs) * 100).toFixed(1) + "%"; };
    function hurt() { if (S.inv > 0 || S.over) return; S.hearts--; S.inv = 1.3; play(S.hearts > 0 ? "hit" : "die", { once: true }); if (ctx.Snd && ctx.Snd.hurt) try { ctx.Snd.hurt(); } catch { /* no sound */ } paintHud(); if (S.hearts <= 0) end(false); }
    const mv = new THREE.Vector3();
    function tick(dt, t) {
      dt = Math.min(dt, 0.05);
      if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; const n1 = Math.ceil(-S.t); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) setTimeout(() => cd.remove(), 700); } }
      else if (!S.over) {
        S.t += dt; S.inv = Math.max(0, S.inv - dt);
        // moving: keys or a drag; the camera's up is −z
        let ix = (keyOn.has("arrowright") || keyOn.has("d") ? 1 : 0) - (keyOn.has("arrowleft") || keyOn.has("a") ? 1 : 0), iz = (keyOn.has("arrowdown") || keyOn.has("s") ? 1 : 0) - (keyOn.has("arrowup") || keyOn.has("w") ? 1 : 0);
        if (drag && Math.hypot(drag.dx, drag.dy) > 8) { const l = Math.hypot(drag.dx, drag.dy); ix = drag.dx / l * Math.min(1, l / 60); iz = drag.dy / l * Math.min(1, l / 60); }
        const il = Math.hypot(ix, iz), spd = 6.8 * Math.min(1, il);
        if (il > 0.05) { S.x += (ix / il) * spd * dt; S.z += (iz / il) * spd * dt; S.face = Math.atan2(ix, iz); const r = Math.hypot(S.x, S.z); if (r > R - 0.8) { S.x *= (R - 0.8) / r; S.z *= (R - 0.8) / r; } }
        if (hero && !hero.busy()) { const want = spd > 5 ? "sprint" : spd > 0.5 ? "walk" : "idle"; if (S.clip !== want) play(want); }
        while (wi < A.waves.length && A.waves[wi].t <= S.t) { const w = A.waves[wi++];
          if (w.k === "L") { const m = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, 0.5), glow(0xff3355, 0.25)); m.rotation.set(-Math.PI / 2, 0, w.a); m.position.y = 0.05; scene.add(m); sweeps.push({ m, a: w.a, t: 0 }); continue; }
          const big = w.k === "D", m = new THREE.Mesh(big ? bG : dG, big ? bM : dM), rg = new THREE.Mesh(ringG, rM); rg.rotation.x = Math.PI / 2; m.add(rg); m.position.set(Math.cos(w.a) * (R + 1), big ? 1.2 : 0.8, Math.sin(w.a) * (R + 1)); scene.add(m);
          drones.push({ m, big, vx: 0, vz: 0, life: 0 }); }
        while (ci < A.coinsAt.length && A.coinsAt[ci].t <= S.t) { const c = A.coinsAt[ci++], m = new THREE.Mesh(cG, cM); m.rotation.x = Math.PI / 2; m.position.set(c.x, 0.9, c.z); scene.add(m); coins.push({ m, t: 0 }); }
        for (let i = drones.length - 1; i >= 0; i--) { const d = drones[i]; d.life += dt; const p = d.m.position, dx = S.x - p.x, dz = S.z - p.z, l = Math.hypot(dx, dz) || 1, sp = d.big ? dSpeed * 0.6 : dSpeed;
          // homing for the first seconds, then straight on (so they can be dodged)
          if (d.life < 2.2) { d.vx = (dx / l) * sp; d.vz = (dz / l) * sp; } p.x += d.vx * dt; p.z += d.vz * dt; d.m.rotation.y += dt * 3;
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
      playing = null; if (!again && el) { el.hidden = false; paint(); load(); }
    }
    st.view(scene, cam); st.solo(tick); tick(0.016, 0); paintHud();
    return { S, leave, A, ghost: () => (gh ? 1 : 0), clips: (all) => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((x) => x.isRunning() && (all || x.getEffectiveWeight() > 0.5)).map((x) => x.getClip().name) : []), move: (x, z) => { keyOn.clear(); if (x > 0) keyOn.add("d"); if (x < 0) keyOn.add("a"); if (z > 0) keyOn.add("s"); if (z < 0) keyOn.add("w"); } };
  }
  return { open, close, shown, playId, playing: () => playing, last: () => lastRun, spec: () => spec, set: (s) => { spec = clampSpec(s); if (el && !el.hidden) paint(); } };
}
