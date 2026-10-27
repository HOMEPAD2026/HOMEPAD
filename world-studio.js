// world-studio.js — ARCIRCLE Studio Lite (AD-City 3, the owner's call 2026-10-23), opened from Nexus City's ARCIRCLE Studio.
// Make a game from a template (Sky Runner now; Arena / Puzzle / Defense listed as coming), with your agent's help (it
// drafts the settings from your words), test it, save it, publish it to the Creator Arcade, and play everyone's games.
// A game is numbers on a template (world-studio-gen.js, the server's own copy): the level is built from them, seeded,
// so it plays the same for everyone. What's kept and counted is the server's (api/_world-studio.mjs); nothing pays ARCL.
//   the window   Create (templates, the agent's draft, the settings, test / save / publish) · My games · Arcade
//   the runner   its own scene drawn instead of the town (st.view / st.solo, like the Game Village's games): three lanes,
//                your hero runs (sprint), jumps the gaps (jump), slides under lasers (dodge), switches lanes past walls,
//                grabs coins; three hearts; the finish arch; a result card (score, your best, your place)
import { TEMPLATES, THEMES, LENS, LANES, KNOBS, PRESETS, DEF, JUMPS, clampSpec, toBuild, genLevel, scoreOf, speedOf, dashSpeed, estimate, puzzleScore, climbGaps } from "./world-studio-gen.js";
import { makePreview } from "./world-studio-prev.js";
import { ask } from "./world-ask.js";
import { look as themeLook, trackUV } from "./world-studio-look.js";
import { level as ringLevel } from "./world-rings-engine.js";
import { makePad, makeLand } from "./world-studio-pad.js";
// Studio 2 (2026-10-24): two more templates (Infinity Dash: the lanes without a finish, faster and faster; Arena Survival:
// seen from above, drones from the edge, laser sweeps, coins, last the time), a preview strip of the level in the editor,
// a share link (/play?sg=<id>), and the runs' effects (coin pops and a combo, speed lines, a slow-mo near miss under a
// laser, confetti at the finish, "New best!")
const ICON = { runner: "🏃", dash: "♾️", arena: "🛸", puzzle: "🧩", climb: "🧗", defense: "🛡️", rush: "💰", jump: "🍄", dungeon: "🗝️", escape: "🚪", boss: "🐉", mining: "⛏️", survival: "🧟", rhythm: "🎵", race: "🏁" };
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
  let aq = "", asort = "pop", atpl = "", week = null, remixFrom = "", today = null, myPicks = [], gcm = null; // (STB7: the day's challenge, my picks, the open game's comments)
  // STB1 (2026-10-27): the sidebar's empty space holds this week's contest — one tap starts a game of that template
  const sideCard = () => { if (!week || !week.tpl || !TEMPLATES[week.tpl]) return ""; const d = Math.max(0, Math.ceil((week.ends - Date.now()) / 86400e3));
    return `<button type="button" class="wst-side-ct" data-ctgo="${esc(week.tpl)}"><span class="wst-side-art" style="background-image:url(/images/studio/tpl/${esc(week.tpl)}-400.webp${ctx.ver || ""})"></span><small><i class="wst-ctic">${ui2("contest", "🏆")}</i>${esc(T("Weekly creator contest"))}</small><b>${ICON[week.tpl] || "🎮"} ${esc(T(TEMPLATES[week.tpl].name))}</b><em>${esc(T("{n} days left", { n: d }))}</em></button>`; };
  // STB3 (2026-10-27): the templates in categories — 15 cards didn't fit and nothing said there were more; NEW on the latest
  const TCATS = [["all", "🎮", "All"], ["run", "🏃", "Run"], ["jump", "🍄", "Jump"], ["survive", "🛡️", "Survive"], ["mind", "🧩", "Puzzle"], ["beat", "🎵", "Rhythm & race"]];
  const TCAT_IC = { all: "cat-all", run: "cat-run", jump: "cat-jump", survive: "cat-survive", mind: "cat-puzzle", beat: "cat-rhythm" }, ui2 = (n, alt) => `<img src="/images/studio/ui2/${n}.webp${ctx.ver || ""}" alt="" onerror="this.replaceWith(document.createTextNode('${alt}'))">`;
  const TCAT_OF = { runner: "run", dash: "run", rush: "run", jump: "jump", dungeon: "jump", escape: "jump", boss: "jump", mining: "jump", climb: "jump", arena: "survive", survival: "survive", defense: "survive", puzzle: "mind", rhythm: "beat", race: "beat" };
  const TNEW = new Set(["jump", "dungeon", "escape", "boss", "mining", "survival", "rhythm", "race"]);
  let tcat = "all";
  // STB2 (2026-10-27): "make it in 30 seconds" — a sentence → the agent's draft (or our own reading of the words for a guest
  // or when the agent can't) → straight into a test run
  const QIDEAS = ["A fast neon run with lots of coins", "A jungle jump level with a dragon boss", "Survive monsters for one minute", "An icy hover race"];
  const QKEYS = [[/jump|mario|platform|점프|마리오|dragon|드래곤|boss|보스/i, "jump"], [/surviv|monster|몬스터|생존/i, "survival"], [/race|hover|레이스|경주/i, "race"], [/beat|rhythm|music|리듬|음악/i, "rhythm"], [/puzzle|ring|퍼즐/i, "puzzle"], [/defen|tower|디펜스|타워/i, "defense"], [/climb|클라임|올라/i, "climb"], [/coin rush|코인 러시/i, "rush"], [/dash|대시|endless|무한/i, "dash"], [/arena|drone|드론|아레나/i, "arena"], [/dungeon|던전/i, "dungeon"], [/escape|탈출/i, "escape"], [/mine|ore|광산|채굴/i, "mining"]];
  const THKEYS = [[/neon|city|네온|도시/i, "neon"], [/jungle|forest|정글|숲/i, "jungle"], [/ice|snow|icy|얼음|눈/i, "ice"], [/lava|fire|volcano|용암|불/i, "lava"], [/candy|sweet|사탕|캔디/i, "candy"]];
  function guessSpec(t) { const tpl = (QKEYS.find(([re]) => re.test(t)) || [0, spec.tpl || "runner"])[1], theme = (THKEYS.find(([re]) => re.test(t)) || [0, spec.theme])[1], hard = /hard|어려|극한|insane/i.test(t) ? 4 : /easy|쉬|초보/i.test(t) ? 1 : 2, coins = /coin|코인/i.test(t) ? 5 : 3;
    return clampSpec({ ...spec, tpl, theme, speed: hard + 1, coins, walls: hard + 1, gaps: hard, lasers: hard, seed: (Math.random() * 1e6) | 0, title: t.slice(0, 24), build: undefined }); }
  async function quick() {
    const inp = el.querySelector(".wst-aiin"), t = inp ? inp.value.trim() : ""; if (!t) { if (inp) inp.focus(); return; }
    let sp = null;
    if (wallet()) { busy = true; aiNote = T("Thinking…"); paint(); const r = await act({ action: "world-studio-ai", t, tpl: guessSpec(t).tpl }); busy = false; aiNote = ""; if (r && r.ok && r.j && r.j.spec) sp = clampSpec({ ...r.j.spec, seed: r.j.spec.seed }); }
    if (!sp) sp = guessSpec(t);
    spec = sp; editId = ""; lastTest = null; step = 4; ev("tpl"); ev("tune"); paint(); ctx.toast("⚡ " + esc(T("Here it is — have a go!")));
    return run({ spec, id: "", test: true });
  }
  let myH = null, hEdit = false; // (the web: your creator ID — your games' page is /game/@<it>; null = not read yet)
  // STU-D: the GM's reported games, a game's numbers open on its card, the report reasons
  let reports = [], statsOpen = "", repOpen = false; const REASONS = [["broken", "🧩", "It doesn't work"], ["unfair", "😤", "Impossible / unfair"], ["rude", "🚫", "Rude name"], ["copy", "📋", "Copied from another game"], ["other", "❓", "Something else"]];
  const hex = (c) => "#" + c.toString(16).padStart(6, "0");
  async function act(body) {
    if (!ctx.sess()) { try { await ctx.signIn(); } catch { return null; } }
    const s = ctx.sess(); if (!s) return null;
    try { return await ctx.post({ ...body, wallet: s.wallet, issued: s.issued, signature: s.signature }); } catch { return { ok: false, j: { error: T("No connection — try again") } }; }
  }
  /// a game's link: its page on the web (/game/@<creator>/<game>) once its maker has an ID, else the World's own link
  const links = new Map();
  async function webLink(id) {
    if (links.has(id)) return links.get(id); let u = `${location.origin}/play?sg=${encodeURIComponent(id)}`;
    try { const r = await fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id), { cache: "no-store" }); if (r.ok) { const g = (await r.json()).game; if (g && g.h && g.slug) u = `${location.origin}/game/@${g.h}/${g.slug}`; } } catch { /* the World's link */ }
    links.set(id, u); return u;
  }
  const hSuggest = () => String((ctx.myName && ctx.myName()) || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9_]/g, "").slice(0, 20);
  function webBox() {
    if (!wallet() || myH == null) return "";
    if (myH && !hEdit) return `<div class="wst-web"><i>🌐</i><div><small>${esc(T("Your games on the web"))}</small><b>arcircle.app/game/@${esc(myH)}</b></div><a class="wst-go" href="/game/@${esc(myH)}" target="_blank" rel="noopener">${esc(T("Open"))}</a><button type="button" data-hcopy>🔗</button><button type="button" data-hedit>${esc(T("Change"))}</button></div>`;
    return `<div class="wst-web pick"><i>🌐</i><div><b>${esc(T(myH ? "Change your creator ID" : "Get your own page on the web"))}</b><small>${esc(T("Pick a creator ID: your games live at arcircle.app/game/@<ID>, playable in any browser."))}</small></div><label class="wst-hin"><span>@</span><input type="text" maxlength="20" autocomplete="off" spellcheck="false" placeholder="${esc(T("your_id"))}" value="${esc(myH || hSuggest())}"></label><button type="button" class="wst-go" data-hsave>${esc(T("Save"))}</button>${myH ? `<button type="button" data-hcancel>✕</button>` : ""}</div>`;
  }
  async function saveHandle() {
    const inp = el && el.querySelector(".wst-hin input"), h = inp ? inp.value.trim().toLowerCase() : ""; if (!/^[a-z0-9_]{3,20}$/.test(h)) { ctx.toast(esc(T("3–20 letters, numbers or _"))); if (inp) inp.focus(); return; }
    const r = await act({ action: "world-studio-handle", h }); if (!r || !r.ok) return r && fail(r);
    myH = r.j.h; hEdit = false; links.clear(); ctx.toast("🌐 " + esc(T("Your page: arcircle.app/game/@{h}", { h: myH }))); paint();
  }
  const fail = (r) => { const e = r && r.j && r.j.error; ctx.toast(e ? (r.j.closed ? "🚧 " + T("Being built") : esc(e)) : T("Couldn't open it — try again")); };
  // WS5 (2026-10-27): the creators you follow — their new games (worldStudioFeedOf), counted as new since you last looked
  let feed = null; const FEED_SEEN = "arc.studio.feedSeen";
  const feedNew = () => { if (!feed || !feed.games) return 0; let t = 0; try { t = Number(localStorage.getItem(FEED_SEEN) || 0); } catch { /* none */ } return feed.games.filter((x) => x.at > t).length; };
  const feedSeen = () => { try { localStorage.setItem(FEED_SEEN, String(Date.now())); } catch { /* not kept */ } };
  async function load() {
    try { const r = await fetch("/api/social?world=studio-arcade", { cache: "no-store" }); if (r.ok) arcade = (await r.json()).games || []; } catch { /* the next look */ }
    try { const r = await fetch("/api/social?world=studio-week", { cache: "no-store" }); if (r.ok) week = await r.json(); } catch { /* the next look */ }
    try { const r = await fetch("/api/social?world=studio-day", { cache: "no-store" }); if (r.ok) today = await r.json(); } catch { /* the next look */ }
    if (wallet()) try { const r = await fetch("/api/social?world=studio-picks&wallet=" + wallet(), { cache: "no-store" }); if (r.ok) myPicks = (await r.json()).ids || []; } catch { /* the next look */ }
    if (ctx.isGM && ctx.isGM()) try { const r = await fetch("/api/social?world=studio-reports", { cache: "no-store" }); if (r.ok) reports = (await r.json()).list || []; } catch { /* the next look */ }
    const w = wallet(); if (w) try { const r = await fetch("/api/social?world=studio-mine&wallet=" + w, { cache: "no-store" }); if (r.ok) { const j = await r.json(); mine = j.games || []; shared = j.shared || []; } setTimeout(() => { try { milestones(); } catch { /* fine */ } }, 600); } catch { /* the next look */ }
    if (w) try { const r = await fetch("/api/social?world=studio-feed&wallet=" + w, { cache: "no-store" }); if (r.ok) feed = await r.json(); } catch { /* the next look */ }
    if (w && myH == null) try { const r = await fetch("/api/social?world=studio-handle&wallet=" + w, { cache: "no-store" }); if (r.ok) myH = (await r.json()).h || ""; } catch { /* the next look */ }
    if (el && !el.hidden) { if (tab === "game" && gid) return openGame(gid); paint(); } /* (back from a run on a game's page: its top 10 read again) */
  }

  // ---------------- the window ----------------
  function shell() {
    if (el) return el; el = document.createElement("div"); el.className = "wst"; el.hidden = true; document.body.appendChild(el);
    el.addEventListener("click", onClick); el.addEventListener("input", onInput); el.addEventListener("submit", onPrizeSet); el.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches(".wst-adv")) advOpen = e.target.open; }, true);
    // WS2 (2026-10-27): a card plays its game for a moment — the mouse over it on a computer, a finger held on it on a
    // phone (the tap still opens it). The one preview renderer is borrowed (the Create tab's is off screen then)
    el.addEventListener("pointerover", (e) => { if (e.pointerType !== "mouse") return; const cv = e.target.closest && e.target.closest(".wst-cv[data-open]"); if (cv && cv !== liveCv) cardLive(cv); });
    el.addEventListener("pointerout", (e) => { if (e.pointerType !== "mouse" || !liveCv) return; if (!e.relatedTarget || !liveCv.contains(e.relatedTarget)) cardStill(); });
    el.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; const cv = e.target.closest && e.target.closest(".wst-cv[data-open]"); clearTimeout(holdT); if (!cv) return; const x0 = e.clientX, y0 = e.clientY; holdT = setTimeout(() => { holdT = 0; cardLive(cv); liveHeld = true; }, 380); const mv = (m) => { if (Math.hypot(m.clientX - x0, m.clientY - y0) > 12) { clearTimeout(holdT); el.removeEventListener("pointermove", mv); } }; el.addEventListener("pointermove", mv); });
    el.addEventListener("pointerup", () => { clearTimeout(holdT); });
    el.addEventListener("click", (e) => { if (liveHeld) { liveHeld = false; e.stopPropagation(); e.preventDefault(); setTimeout(cardStill, 2600); } }, true); /* (the hold showed it: the lift isn't a tap) */
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } else if (e.key === "Enter" && e.target.closest && e.target.closest(".wst-hin")) { e.preventDefault(); saveHandle(); } });
    return el;
  }
  const land = ctx.land || makeLand({ T, esc, coarse: !!ctx.coarse }); // (phones: the Studio sideways while it's open — world-studio-pad.js)
  function open(t) { shell(); if (t) tab = t; el.hidden = false; paint(); load(); land.enter(); if (ctx.onOpen) ctx.onOpen(); }
  function close() { if (el) el.hidden = true; if (prev) { prev.dispose(); prev = null; } land.exit(); if (ctx.onClose) ctx.onClose(); }
  const shown = () => !!el && !el.hidden;
  const slider = (k, lab, max, min = 0) => `<label class="wst-sl"><span>${esc(T(lab))} <b>${spec[k]}</b></span><input type="range" min="${min}" max="${max}" step="1" value="${spec[k]}" data-k="${k}"></label>`;
  // Studio 3: the editor in five steps (a bar at the top, Back / Next at the bottom), the live 3D preview over them
  // STU-B: three steps on screen — Pick (template + look) · Tune · Test & publish (the old pages 1+2 and 4+5 together; step keeps 1 / 3 / 4)
  const VIS = [[1, "Pick", "Pick a template and a look"], [3, "Tune", "How hard should it be?"], [4, "Test & publish", "Try it, then put it on the arcade"]];
  const STEPS = [["Template", "Pick a template"], ["Theme", "Pick a look"], ["Difficulty", "How hard should it be?"], ["Test", "Try it before anyone else"], ["Publish", "Save it and put it on the arcade"]];
  const PNAME = { easy: "Easy", normal: "Normal", hard: "Hard", extreme: "Extreme" }, WHY = { crowd: "the crowd", boss: "a boss", notes: "the notes", e: "walkers", n: "flyers", z: "cannonballs", k: "spikes", l: "lava", B: "the dragon boss", f: "falling platforms", b: "blinking platforms", m: "moving platforms", v: "lifts", i: "ice", pit: "pits", time: "the clock", reach: "a stretch you can't reach", wall: "walls", gap: "gaps", laser: "lasers", d: "drones", D: "big drones", L: "laser sweeps", mwall: "moving walls", blink: "blinking lasers", g: "grunts", r: "runners", t: "tanks", plat: "platforms", mplat: "moving platforms", break: "breaking platforms", spring: "springs" };
  const starsTxt = (n) => `<span class="wst-stars" aria-label="${n}/5">${"<i>★</i>".repeat(n)}${"<i class=\"off\">★</i>".repeat(5 - n)}</span>`;
  const presetOf = () => Object.keys(PRESETS).find((k) => Object.entries(PRESETS[k]).every(([f, v]) => spec[f] === v)) || "";
  const RULE_UI = [["low", "🪶", "Low gravity"], ["mirror", "🔁", "Mirrored controls"], ["night", "🌙", "Night run"], ["onehp", "💔", "One heart"], ["speedup", "🚀", "Speeds up"]];
  const rulesRow = () => (spec.tpl === "runner" || spec.tpl === "dash" ? `<div class="wst-rules"><span>🃏 ${esc(T("Rule cards (up to 2)"))}</span><div class="wst-chips">${RULE_UI.map(([k, ic, n]) => `<button type="button" data-rule="${k}" class="${(spec.rules || []).includes(k) ? "on" : ""}">${ic} ${esc(T(n))}</button>`).join("")}</div></div>` : "");
  /// STU-D: where the 40 test players' runs end along the level (red = many), and where real players' runs ended (the maker's numbers)
  const heatBar = (b) => { const m = Math.max(1, ...b); return `<span class="wst-heatb">${b.map((n, i) => `<i style="--k:${(n / m).toFixed(2)}" title="${i * 10}–${i * 10 + 10}%: ${n}"></i>`).join("")}</span>`; };
  const heatRow = (E) => spec.tpl === "puzzle" || !E.fails || !E.fails.some((x) => x) ? "" : `<div class="wst-heat"><small>🔥 ${esc(T("Where test players fail"))}</small>${heatBar(E.fails)}<em><span>${esc(T("Start"))}</span><span>${esc(T("Finish"))}</span></em></div>`;
  const tweakRow = () => `<div class="wst-ai wst-tweak"><b>✨ ${esc(T("Tell {n} what to change", { n: ctx.agentName() || T("your agent") }))}</b><div class="wst-airow"><input class="wst-twin" maxlength="240" placeholder="${esc(T("e.g. fewer lasers, harder at the end, more coins"))}"><button type="button" class="wst-go" data-tweak ${busy ? "disabled" : ""}>${esc(T("Change it"))}</button></div></div>`;
  function statsBox(g) { const st = g.stats || { runs: 0, clears: 0, sum: 0, ends: [] }, rs = g.reports ? Object.values(g.reports).reduce((a, x) => a + x, 0) : 0;
    return `<div class="wst-stats"><ul><li><b>${g.plays || 0}</b><small>${esc(T("Plays"))}</small></li><li><b>${st.runs ? Math.round((st.clears / st.runs) * 100) : 0}%</b><small>${esc(T("Clear rate"))}</small></li><li><b>${st.runs ? Math.round(st.sum / st.runs) : 0}</b><small>${esc(T("Average score"))}</small></li><li><b>${g.likes || 0}</b><small>${esc(T("Likes"))}</small></li><li><b>${g.remixes || 0}</b><small>${esc(T("Remixes"))}</small></li></ul>
      ${st.ends && st.ends.some((x) => x) ? `<div class="wst-heat"><small>📍 ${esc(T("Where players' runs ended"))}</small>${heatBar(st.ends)}<em><span>${esc(T("Start"))}</span><span>${esc(T("Finish"))}</span></em></div>` : `<p class="wst-fine">${esc(T(st.runs ? "Every run so far reached the end" : "No runs by other players yet — share your link!"))}</p>`}${g.fb && g.fb.up + g.fb.down ? `<p class="wst-fine">👍 ${g.fb.up} · 👎 ${g.fb.down} — ${esc(T("Easy"))} ${(g.fb.d || [])[0] || 0} · ${esc(T("Just right"))} ${(g.fb.d || [])[1] || 0} · ${esc(T("Hard"))} ${(g.fb.d || [])[2] || 0}</p>` : ""}${rs ? `<p class="wst-fine">⚑ ${esc(T("{n} reports", { n: rs }))}</p>` : ""}</div>`; }
  function paintMake() {
    const th = THEMES[spec.theme], L = genLevel(spec), KN = KNOBS[spec.tpl] || KNOBS.runner, E = estimate(spec), cur = mine.find((g) => g.id === editId);
    if (step === 2) step = 1; if (step === 5) step = 4;
    const bar = `<ol class="wst-steps" style="--k:${Math.max(0, VIS.findIndex(([n]) => n === step)) / (VIS.length - 1)}">${VIS.map(([n, l], i) => `<li><button type="button" data-step="${n}" class="${step === n ? "on" : step > n ? "done" : ""}"><i>${step > n ? "✓" : i + 1}</i><span>${esc(T(l))}</span></button></li>`).join("")}</ol>`;
    const box = step <= 4 ? `<div class="wst-3dbox${step === 4 ? " big" : ""}">${prev ? "" : `<canvas class="wst-prev" width="640" height="76" aria-label="${esc(T("Preview"))}"></canvas>`}<span class="wst-3dtag">${ICON[spec.tpl] || "🎮"} ${esc(T(TEMPLATES[spec.tpl].name))} · ${esc(T(th.name))}</span></div>` : "";
    let body = "";
    if (step === 1) body = `<div class="wst-ai wst-quick"><i class="wst-qic">${ui2("quick-make", "⚡")}</i><b>${esc(T("Make it in 30 seconds"))}</b><small class="wst-qsub">${esc(T("Say what you want — {n} makes it and you play it right away.", { n: ctx.agentName() || T("your agent") }))}</small><div class="wst-airow"><input class="wst-aiin" maxlength="240" placeholder="${esc(T("e.g. a fast jungle run with lots of coins"))}"><button type="button" class="wst-go" data-quick ${busy ? "disabled" : ""}>▶ ${esc(T("Make & play"))}</button></div><div class="wst-qideas">${QIDEAS.map((q) => `<button type="button" data-qidea="${esc(q)}">${esc(T(q))}</button>`).join("")}</div><button type="button" class="wst-link" data-ai ${busy ? "disabled" : ""}>${IC("ic-agent")} ${esc(T("Just draft it — I'll tweak it first"))}</button>${aiNote ? `<small class="wst-ainote">${esc(aiNote)}</small>` : ""}</div><div class="wst-tcats" role="tablist">${TCATS.map(([k, ic, l]) => `<button type="button" role="tab" data-tcat="${k}" class="${tcat === k ? "on" : ""}" aria-selected="${tcat === k}"><i>${ui2(TCAT_IC[k], ic)}</i>${esc(T(l))}</button>`).join("")}</div><div class="wst-tpls">${Object.entries(TEMPLATES).filter(([id]) => tcat === "all" || TCAT_OF[id] === tcat).map(([id, t]) => `<button type="button" class="wst-tpl${id === spec.tpl ? " on" : ""}${t.open ? "" : " soon"}" ${t.open ? `data-tpl="${id}"` : "disabled"}><span class="wst-art" style="background-image:url(/images/studio/tpl/${id}-400.webp${ctx.ver || ""})" aria-hidden="true"></span><b>${esc(T(t.name))}</b>${TNEW.has(id) ? `<em class="wst-new">NEW</em>` : ""}${t.open ? "" : `<small>${esc(T("Coming soon"))}</small>`}</button>`).join("")}</div>
      <h4 class="wst-sub">🎨 ${esc(T("Look"))}</h4><div class="wst-themes">${Object.entries(THEMES).map(([id, t]) => `<button type="button" data-theme="${id}" class="wst-thm${id === spec.theme ? " on" : ""}" style="--c:${hex(t.edge)};--b:${hex(t.sky)}"><span class="wst-thi" data-snap="${id}" style="background-image:url(${snaps[spec.tpl + ":" + id] || `/images/studio/th/${id}-sky-768.webp?v=1`})"></span><b>${esc(T(t.name))}</b></button>`).join("")}</div>
      <label class="wst-title"><span>${esc(T("Title"))}</span><input class="wst-tin" maxlength="24" value="${esc(spec.title)}"></label>`;
    else if (step === 3 && spec.build) { const B = spec.build, ln = (x) => (Array.isArray(x) ? x.length : 0), ar = !!B.w && !B.rc, td = !!B.td, n = td ? ln(B.path) + ln(B.pads) : ar ? ln(B.w) + ln(B.c) + ln(B.p) : B.jw ? ln(B.c) : B.bt ? ln(B.n) : B.rc ? ln(B.r) + ln(B.w) + ln(B.o) : ln(B.r); // (SB-2/3: JUMP WORLD's cells, a beat's notes, a race's pieces — a JUMP WORLD layout once stopped this card) // (Studio 4: a hand-built layout — the speed still applies)
      body = `<div class="wst-build on"><i>🛠️</i><div><b>${esc(T("Hand-built layout"))}</b><small>${esc(td ? T("{p} path cells · {d} pads · {w} waves", { p: B.path.length, d: B.pads.length, w: B.waves.length }) : ar || B.bt || B.rc ? T("{n} pieces · {s} s", { n, s: spec.len }) : T("{n} pieces · {m} m", { n, m: B.L || B.W || spec.len }))}</small></div><span><button type="button" class="wst-go" data-build>✏️ ${esc(T("Edit the layout"))}</button><button type="button" class="wst-link" data-unbuild>${esc(T("Back to quick start"))}</button></span></div>
      ${rulesRow()}
      <div class="wst-row"><span>${esc(T(KN.speed))}</span><div class="wst-chips">${[1, 2, 3, 4, 5].map((x) => `<button type="button" data-speed="${x}" class="${x === spec.speed ? "on" : ""}">${x}</button>`).join("")}</div></div>
      <div class="wst-est s${E.stars}" data-p="${Math.round(E.clear * 100)}"><b>${starsTxt(E.stars)}</b><span>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</span><i class="wst-estbar"><i></i></i>${E.why ? `<small>${esc(T("Most runs end at: {x}", { x: T(WHY[E.why] || E.why) }))}</small>` : ""}</div>
      ${prev ? `<canvas class="wst-prev" width="640" height="76" aria-label="${esc(T("Preview"))}"></canvas>` : ""}${heatRow(E)}`; }
    else if (step === 3) { const pk = presetOf();
      body = `${spec.tpl !== "puzzle" && spec.tpl !== "survival" ? `<div class="wst-build"><i>🛠️</i><div><b>${esc(T("Build it yourself"))}</b><small>${esc(T(spec.tpl === "arena" || spec.tpl === "rush" ? "Send every drone, sweep and coin when and where you want, and stand pillars — starting from this arena." : spec.tpl === "climb" ? "Place every platform, spring, spike and coin up the tower by hand — starting from this one." : spec.tpl === "defense" ? "Draw the path, place the tower pads and set every wave by hand — starting from this map." : JUMPS[spec.tpl] ? "Place every block, platform, spring, key, door, enemy and the boss on the grid — starting from this level." : spec.tpl === "rhythm" ? "Place every note on the beat, lane by lane — starting from this song." : spec.tpl === "race" ? "Lay out every ring, boost pad, orb and pillar on the ground — starting from this track." : "Place every wall, gap, laser, coin and heart by hand — starting from this layout."))}</small></div><span><button type="button" class="wst-go" data-build>🛠️ ${esc(T("Open the builder"))}</button></span></div>` : ""}${rulesRow()}${galleryRow()}`;
      body += `<div class="wst-pres">${Object.keys(PRESETS).map((k) => { const e = estimate({ ...spec, ...PRESETS[k] }); return `<button type="button" data-preset="${k}" class="${pk === k ? "on" : ""} p-${k}"><b>${esc(T(PNAME[k]))}</b><small>${starsTxt(e.stars)}</small><em>${Math.round(e.clear * 100)}%</em></button>`; }).join("")}</div><p class="wst-pcap">${esc(T("% = how many of 40 test players finish it"))}</p>
      <div class="wst-row"><span>${esc(T(KN.len))}</span><div class="wst-chips">${LENS.map((x) => `<button type="button" data-len="${x}" class="${x === spec.len ? "on" : ""}">${LEN_NAME[spec.tpl] ? esc(T(LEN_NAME[spec.tpl][x])) : x + "s"}</button>`).join("")}</div></div>
      <div class="wst-est s${E.stars}" data-p="${Math.round(E.clear * 100)}"><b>${starsTxt(E.stars)}</b><span>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</span><i class="wst-estbar"><i></i></i>${E.why ? `<small>${esc(T("Most runs end at: {x}", { x: T(WHY[E.why] || E.why) }))}</small>` : ""}</div>
      ${prev ? `<canvas class="wst-prev" width="640" height="76" aria-label="${esc(T("Preview"))}"></canvas>` : ""}
      ${heatRow(E)}${tweakRow()}
      <details class="wst-adv"${advOpen ? " open" : ""}><summary>⚙️ ${esc(T("Advanced settings"))}</summary><div class="wst-sls">${slider("speed", KN.speed, 5, 1)}${slider("coins", KN.coins, 5)}${slider("walls", KN.walls, 5)}${slider("gaps", KN.gaps, 3)}${slider("lasers", KN.lasers, 3)}</div>
      <p class="wst-fine" style="--c:${hex(th.edge)}">🎲 ${esc(T("Layout #{n}", { n: spec.seed }))} · <span class="wst-sum">${summary(L)}</span> <button type="button" class="wst-link" data-seed>${esc(T("New layout"))}</button></p></details>`; }
    else if (step === 4) body = `<ul class="wst-recap"><li><i>${ICON[spec.tpl]}</i>${esc(T(TEMPLATES[spec.tpl].name))}</li><li><i>🎨</i>${esc(T(th.name))}</li><li><i>🔥</i>${starsTxt(E.stars)} · ${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</li><li><i>📏</i><span class="wst-sum">${summary(L)}</span></li></ul>
      ${lastTest ? `<p class="wst-last">${esc(T("Your test: {s} points", { s: lastTest.score }))}${lastTest.done ? " · 🏁" : ""}</p>` : ""}<button type="button" class="wst-go big wst-testbig" data-test>${IC("ic-test")} ${esc(T("Test play"))}</button>
      <div class="wst-pubbox">${cur && cur.pub ? `<p class="wst-ok">🚀 ${esc(T("It's on the Creator Arcade!"))}</p>` : editId ? `<p>💾 ${esc(T("Saved as a draft. Publish it so everyone can play."))}</p>` : `<p>${esc(T("Save it to keep it, then publish it to the Creator Arcade."))}</p>`}
      <label class="wst-title"><span>${esc(T("Title"))}</span><input class="wst-tin" maxlength="24" value="${esc(spec.title)}"></label>
      <div class="wst-acts"><button type="button" class="wst-go alt" data-save ${busy ? "disabled" : ""}>💾 ${esc(T(editId ? "Save changes" : "Save"))}</button>${cur && cur.pub ? `<button type="button" class="wst-go" data-share="${esc(editId)}">🔗 ${esc(T("Copy link"))}</button>` : `<button type="button" class="wst-go big" data-savepub ${busy ? "disabled" : ""}>${IC("ic-publish")} ${esc(T(editId ? "Publish" : "Save & publish"))}</button>`}</div>
      ${editId ? `<button type="button" class="wst-link" data-tab="mine">📁 ${esc(T("See it in My games"))}</button>` : ""}</div>`;
    else body = "";
    const nav = `<nav class="wst-nav">${step > 1 ? `<button type="button" class="wst-go alt" data-back>← ${esc(T("Back"))}</button>` : "<span></span>"}${step < 4 ? `<button type="button" class="wst-go alt" data-test>${IC("ic-test")} ${esc(T("Test"))}</button>` : "<span></span>"}${step < 4 ? `<button type="button" class="wst-go" data-next>${esc(T("Next"))} →</button>` : "<span></span>"}</nav>`;
    // STU-6: two columns where there's room (a computer, a phone held sideways) — the live preview on the left, the step on the right
    const side = step <= 4 ? `<ul class="wst-facts"><li><i>${ICON[spec.tpl] || "🎮"}</i><span>${esc(T(TEMPLATES[spec.tpl].name))}</span></li><li><i>🎨</i><span>${esc(T(th.name))}</span></li><li><i>🔥</i><span>${starsTxt(E.stars)} ${Math.round(E.clear * 100)}%</span></li></ul>` : "";
    return `<div class="wst-mk s${step}"><div class="wst-mkl">${box}${side}</div><div class="wst-mkr">${bar}<p class="wst-hint">${esc(T((VIS.find((v) => v[0] === step) || VIS[0])[2]))}</p>${penBar()}${saveBar()}<div class="wst-stepbody s${step}">${body}</div></div></div>${nav}`;
  }
  /// the live preview: one renderer for the window's life, its canvas moved into each paint (none on low graphics)
  function attachPreview() {
    if (tab !== "make" || step > 4) { if (prev) prev.stop(); return; }
    if (!prev && !ctx.saver && prevOk) { try { prev = makePreview({ THREE, ver: ctx.ver || "", low: !!ctx.low }); } catch { prev = null; } if (!prev) { prevOk = false; return paint(); } }
    const bx = el.querySelector(".wst-3dbox"); if (!prev || !bx) return; liveCv = null; prev.canvas.classList.remove("wst-cvlive"); bx.prepend(prev.canvas); prev.set(spec);
    /* (STU-B: the theme cards show each theme's Meshy sky; fillSnaps is kept for the old preview pictures) */
  }
  function fillSnaps() { if (!prev || tab !== "make" || step !== 1) return; for (const id of Object.keys(THEMES)) { const k = spec.tpl + ":" + id; if (!snaps[k]) { snaps[k] = prev.snap({ ...spec, theme: id }); const im = el.querySelector(`[data-snap="${id}"]`); if (im) im.style.backgroundImage = `url(${snaps[k]})`; return setTimeout(fillSnaps, 30); } } }
  let prevT = 0; const prevSoon = () => { clearTimeout(prevT); prevT = setTimeout(() => { if (prev && tab === "make") prev.set(spec); }, 160); };
  const summary = (L) => L.survival ? esc(T("{s} s to survive · {b} bosses", { s: L.secs, b: L.bossAt.length })) : L.beat ? esc(T("{n} notes · {b} BPM", { n: L.B.n.length, b: L.bpm })) : L.race ? esc(T("{r} rings · {l} laps · {t} s", { r: L.B.r.length, l: L.B.laps, t: L.limit })) : L.jump ? esc(T("{w} blocks long · {c} coins", { w: L.B.W, c: L.coins })) + (L.timer ? " · ⏱ " + L.timer + " s" : "") : spec.tpl === "defense" ? esc(T("{w} waves · {n} foes · {p} pads", { w: L.waves.length, n: L.coins, p: L.pads.length })) : spec.tpl === "climb" ? esc(T("{m} m up · {c} coins", { m: L.len, c: L.coins })) : spec.tpl === "puzzle" ? (() => { const R = ringOf(L.id); return R ? esc(T("{n} rings · par {p}", { n: R.rings.length, p: R.par })) : ""; })() : spec.tpl === "arena" || spec.tpl === "rush" ? esc(T("{s} s · {d} waves · {c} coins", { s: L.secs, d: L.waves.length, c: L.coins })) : spec.tpl === "dash" ? esc(T("endless · {c} coins on the way", { c: L.coins })) : `${Math.round(L.len)} m · ${L.coins} ${esc(T("coins"))}`;
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
    if (L.survival) { x.fillStyle = "#1a0f1a"; x.fillRect(0, 0, w, h); const X2 = (t) => (t / L.secs) * (w - 16) + 8; for (let i = 0; i < 60; i++) { const t = (i / 60) * L.secs, k = 0.25 + (t / L.secs) * L.rate * 0.6; x.fillStyle = `rgba(255,90,120,${Math.min(0.9, k)})`; x.fillRect(X2(t), h - 10 - k * (h - 30), (w - 16) / 60 - 1, k * (h - 30)); } x.font = "18px sans-serif"; x.textAlign = "center"; for (const b of L.bossAt) x.fillText("👑", X2(b), 22); return; }
    if (L.beat) { x.fillStyle = "#070b1c"; x.fillRect(0, 0, w, h); const X2 = (s0) => (s0 / L.steps) * (w - 8) + 4, cols = ["#ff6fae", "#ffd23a", "#7cf5c8", "#5fd3ff"]; for (const [s0, l] of L.B.n) { x.fillStyle = cols[l]; x.fillRect(X2(s0), 10 + l * ((h - 20) / 4), 2, (h - 20) / 4 - 3); } return; }
    if (L.race) { x.fillStyle = "#060c1e"; x.fillRect(0, 0, w, h); const k = Math.min(w, h) / 160, sx = (v) => w / 2 + v * k, sz = (v) => h / 2 + v * k; x.strokeStyle = hex(th.edge); x.lineWidth = 2; x.beginPath(); L.B.r.forEach((q, i) => (i ? x.lineTo(sx(q[0]), sz(q[1])) : x.moveTo(sx(q[0]), sz(q[1])))); x.closePath(); x.stroke(); x.fillStyle = "#ffd23a"; for (const q of L.B.r) { x.beginPath(); x.arc(sx(q[0]), sz(q[1]), 3, 0, 7); x.fill(); } return; }
    if (L.jump) { const k = Math.min((w - 8) / L.B.W, (h - 8) / 14), ox = (w - k * L.B.W) / 2, oy = h - 4; // (SB-2: the level from the side, every block and thing in its colour)
      x.fillStyle = spec.tpl === "dungeon" || spec.tpl === "mining" ? "#0b0a14" : hex(th.sky); x.fillRect(0, 0, w, h);
      const C = { g: hex(th.track), s: hex(th.wall), i: "#9fd8ff", l: "#ff5a1a", w: "#a8744a", o: "#ffd23a", e: "#b48cff", n: "#ff6fae", z: "#9aa6b8", B: "#2fb36a", F: "#ffd23a", S: "#7cf5c8", y: "#ffd23a", d: "#a8744a", k: "#dfe6f2", r: "#ff3b5c", u: "#3b7bff", p: "#7cf5c8", 1: "#d97a3a", 2: "#dfe6f2", 3: "#ffd23a" };
      for (const c of L.B.c) { x.fillStyle = C[c[2]] || "#cfe0f5"; const sz = c[2] === "B" ? 2 : 1; x.fillRect(ox + c[0] * k, oy - (c[1] + sz) * k, Math.max(1, k * sz - 0.5), Math.max(1, k * sz - 0.5)); } return; }
    if (spec.tpl === "defense") { const k = Math.min((w - 8) / DEF.R, (h - 8) / DEF.C), ox = (w - k * DEF.R) / 2, oy = (h - k * DEF.C) / 2; // (the board turned on its side: the portal on the left, the crystal on the right)
      x.fillStyle = hex(th.track); for (const [c, r] of L.path) x.fillRect(ox + r * k + 1, oy + c * k + 1, k - 2, k - 2); x.fillStyle = hex(th.edge); for (const [c, r] of L.pads) { x.beginPath(); x.arc(ox + (r + 0.5) * k, oy + (c + 0.5) * k, k * 0.32, 0, 6.283); x.fill(); }
      if (L.path.length) { const [c0, r0] = L.path[0], [c1, r1] = L.path[L.path.length - 1]; x.fillStyle = "#b48cff"; x.fillRect(ox + r0 * k, oy + c0 * k, k, k); x.fillStyle = "#5fd3ff"; x.fillRect(ox + r1 * k, oy + c1 * k, k, k); } return; }
    if (spec.tpl === "climb") { const X = (z) => (z / L.len) * (w - 8) + 4, Y = (c) => 12 + c * ((h - 24) / 4), C = { plat: hex(th.wall), mplat: "#ff9a3d", break: "#c8a27a", spring: "#7cf5c8", spike: "#ff3355", coin: "#ffd23a", heart: "#ff4d6d" };
      for (const [a, b] of climbGaps(spec, L.rows, L.len)) { x.fillStyle = "rgba(255,59,92,.35)"; x.fillRect(X(a), 4, X(b) - X(a), h - 8); }
      for (const r of L.rows) { x.fillStyle = C[r.k] || "#fff"; if (r.k === "coin") { x.beginPath(); x.arc(X(r.z), Y(r.lane), 2.2, 0, 6.283); x.fill(); } else x.fillRect(X(r.z) - 1.5, Y(r.lane) - 4, 3, 8); } x.fillStyle = "#fff"; x.fillRect(w - 5, 8, 3, h - 16); return; }
    if (spec.tpl === "arena" || spec.tpl === "rush") { const X = (t) => (t / L.secs) * (w - 8) + 4; for (const v of L.waves) { x.fillStyle = v.k === "L" ? "#ff3355" : v.k === "D" ? "#ffb02e" : hex(th.wall); const r = v.k === "D" ? 7 : 4; x.beginPath(); x.arc(X(v.t), 14 + ((v.a * 97) % 1) * (h - 28), r, 0, 6.283); x.fill(); } x.fillStyle = "#ffd23a"; for (const c of L.coinsAt) x.fillRect(X(c.t) - 2, h - 14, 4, 4); return; }
    const span = spec.tpl === "dash" ? Math.min(L.len, 1600) : L.len, X = (z) => (z / span) * (w - 8) + 4, Y = (lane) => 16 + lane * ((h - 32) / 2);
    x.strokeStyle = hex(th.edge); x.globalAlpha = 0.35; for (const l of [0, 1, 2]) { x.beginPath(); x.moveTo(0, Y(l)); x.lineTo(w, Y(l)); x.stroke(); } x.globalAlpha = 1;
    for (const r of L.rows) { if (r.z > span) break; const px = X(r.z); if (r.k === "wall") { x.fillStyle = hex(th.wall); x.fillRect(px - 2, Y(r.lane) - 7, 5, 14); } else if (r.k === "gap") { x.fillStyle = "#020610"; x.fillRect(px - 3, 8, 7, h - 16); } else if (r.k === "laser") { x.fillStyle = "#ff3355"; x.fillRect(px - 1, 8, 3, h - 16); } else { x.fillStyle = "#ffd23a"; x.beginPath(); x.arc(px, Y(r.lane), 2.2, 0, 6.283); x.fill(); } }
    if (spec.tpl !== "dash") { x.fillStyle = "#fff"; x.fillRect(w - 5, 8, 3, h - 16); }
  }
  const thumbKey = (g) => g.id + ":" + (g.up || g.at || 0);
  const coverOf = (g) => (g.th ? `/api/social?world=studio-thumb&id=${encodeURIComponent(g.id)}&v=${g.th}` : "") || thumbs.get(thumbKey(g)) || `/images/ui/studio/${TEMPLATES[g.tpl] ? g.tpl : "runner"}.webp?v=1`;
  let freshId = ""; /* the game just published: its arcade card wears NEW for this visit */
  const card = (g, own) => `<div class="wst-card${g.off ? " off" : ""}${g.id === freshId ? " fresh" : ""}" style="--c:${hex((THEMES[g.theme] || THEMES.neon).edge)};--b:${hex((THEMES[g.theme] || THEMES.neon).sky)}"><div class="wst-cv" data-open="${esc(g.id)}" data-th="${esc(thumbKey(g))}" role="button" tabindex="0" style="background-image:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55)),url(${coverOf(g)})"><i aria-hidden="true">${ICON[g.tpl] || "🏃"}</i><em>${esc(T((THEMES[g.theme] || THEMES.neon).name))}</em>${g.pick ? `<b class="wst-pick">⭐ ${esc(T("Editor's pick"))}</b>` : g.off ? `<b class="wst-pick off">✔ ${esc(T("Official"))}</b>` : ""}${g.now ? `<b class="wst-now">● ${esc(T("{n} playing now", { n: g.now }))}</b>` : ""}</div><div class="wst-ci"><b data-open="${esc(g.id)}" role="button">${esc(g.title)}</b><small>${own ? (g.pub ? "🚀 " + esc(T("On the Creator Arcade")) : "📝 " + esc(T("Draft"))) : esc(T("by {n}", { n: g.byName || "?" }))} · ▶ ${g.plays || 0} · ♥ ${g.likes || 0}</small>
    <span class="wst-cb"><button type="button" class="wst-go" data-play="${esc(g.id)}">${IC("ic-play")} ${esc(T("Play"))}</button>${own && g.shared ? `<button type="button" data-edit="${esc(g.id)}">${esc(T("Edit"))}</button>` : own ? `<button type="button" data-edit="${esc(g.id)}">${esc(T("Edit"))}</button>${!g.co ? `<button type="button" data-coinv="${esc(g.id)}" aria-label="${esc(T("Build together"))}" title="${esc(T("Build together"))}">👥</button>` : ""}<button type="button" data-pub="${esc(g.id)}">${esc(T(g.pub ? "Unpublish" : "Publish"))}</button><button type="button" data-del="${esc(g.id)}" aria-label="${esc(T("Delete"))}">🗑</button>${g.vers && g.vers.length ? `<button type="button" data-vers="${esc(g.id)}" aria-label="${esc(T("Versions"))}">🕘 ${g.vers.length}</button>` : ""}${g.pub ? `<button type="button" data-stats="${esc(g.id)}" class="${statsOpen === g.id ? "on" : ""}">📊 ${esc(T("Stats"))}</button>` : ""}` : `<button type="button" data-like="${esc(g.id)}">${IC("ic-like")} ${esc(T("Like"))}</button>`}${!own && g.pub !== false && ctx.isGM && ctx.isGM() ? `<button type="button" data-gpick="${esc(g.id)}" aria-label="${esc(T("Editor's pick"))}">${g.pick ? "★" : "☆"}</button>` : ""}${g.pub ? `<button type="button" data-share="${esc(g.id)}" aria-label="${esc(T("Copy link"))}">${IC("ic-share")}</button>` : ""}</span>${own ? coLine(g) : ""}${own && !g.shared && statsOpen === g.id ? statsBox(g) : ""}</div></div>`;
  function wantThumbs(list) { if (ctx.saver || !prevOk) return; for (const g of list) { if (g.th) continue; const sp = g.spec || g.s; if (sp && !thumbs.has(thumbKey(g))) thumbQ.push([thumbKey(g), sp]); } clearTimeout(thumbT); thumbT = setTimeout(nextThumb, 60); }
  /// STB7: the card's picture is made once here, on the maker's page, and kept on the server (384 × 216 JPEG)
  async function upThumb(g) {
    if (!g || !g.id || ctx.saver || !prevOk) return; try {
      if (!prev) prev = makePreview({ THREE, ver: ctx.ver || "", low: !!ctx.low }); if (!prev) return;
      const src = prev.snap(clampSpec({ ...(g.spec || spec) })); if (!src) return; const im = new Image(); await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = src; });
      const c = document.createElement("canvas"); c.width = 384; c.height = 216; const x = c.getContext("2d"), k = Math.max(384 / im.width, 216 / im.height); x.drawImage(im, (384 - im.width * k) / 2, (216 - im.height * k) / 2, im.width * k, im.height * k);
      const r = await act({ action: "world-studio-thumb", id: g.id, img: c.toDataURL("image/jpeg", 0.72) }); if (r && r.ok && r.j.th) { mine = mine.map((q) => (q.id === g.id ? { ...q, th: r.j.th } : q)); }
    } catch (e) { console.warn("studio thumb", e); }
  }
  let liveCv = null, holdT = 0, liveHeld = false;
  function cardLive(cv) {
    if (ctx.saver || !prevOk || tab === "make") return; const id = cv.dataset.open, g = arcade.find((x) => x.id === id) || mine.find((x) => x.id === id), sp = g && (g.spec || g.s); if (!sp) return;
    if (!prev) { try { prev = makePreview({ THREE, ver: ctx.ver || "", low: !!ctx.low }); } catch { prev = null; } if (!prev) { prevOk = false; return; } }
    cardStill(); liveCv = cv; prev.canvas.classList.add("wst-cvlive"); cv.appendChild(prev.canvas); cv.classList.add("live"); try { prev.set(clampSpec({ ...sp })); } catch { cardStill(); }
  }
  function cardStill() { if (!liveCv) return; liveCv.classList.remove("live"); liveCv = null; if (prev) { prev.stop(); prev.canvas.classList.remove("wst-cvlive"); if (prev.canvas.parentNode && tab !== "make") prev.canvas.remove(); } }
  function nextThumb() {
    if (!el || el.hidden || !thumbQ.length) return; if (!prev) { try { prev = makePreview({ THREE, ver: ctx.ver || "", low: !!ctx.low }); } catch { prev = null; } if (!prev) { prevOk = false; return; } }
    const [k, sp] = thumbQ.shift(); if (!thumbs.has(k)) { let u = ""; try { u = prev.snap(clampSpec({ ...sp })); } catch { /* the template's picture stays */ } if (u) { thumbs.set(k, u); el.querySelectorAll(`[data-th="${CSS.escape(k)}"]`).forEach((c) => { c.style.backgroundImage = `linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55)),url(${u})`; c.classList.add("snap"); }); } }
    thumbT = setTimeout(nextThumb, 40);
  }
  const localCard = (d) => { const th = THEMES[d.spec.theme] || THEMES.neon; return `<div class="wst-card local" style="--c:${hex(th.edge)};--b:${hex(th.sky)}"><div class="wst-cv" data-th="${esc(d.id + ":" + d.at)}" style="background-image:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55)),url(${thumbs.get(d.id + ":" + d.at) || `/images/ui/studio/${TEMPLATES[d.spec.tpl] ? d.spec.tpl : "runner"}.webp?v=1`})"><i aria-hidden="true">${ICON[d.spec.tpl] || "🏃"}</i><em>${esc(T(th.name))}</em></div><div class="wst-ci"><b>${esc(d.spec.title)}</b><small>📱 ${esc(T("On this device"))}</small>
    <span class="wst-cb"><button type="button" class="wst-go" data-ltest="${esc(d.id)}">▶ ${esc(T("Test"))}</button><button type="button" data-ledit="${esc(d.id)}">${esc(T("Edit"))}</button><button type="button" data-ldel="${esc(d.id)}" aria-label="${esc(T("Delete"))}">🗑</button></span></div></div>`; };
  // STB6 (2026-10-27): build together — a code for one friend, the pen passed between you (the server keeps who has it)
  let shared = [], pen = null, coCode = {};
  const coOf = (id) => mine.find((g) => g.id === id) || shared.find((g) => g.id === id);
  const penMine = () => !!(pen && pen.w === wallet());
  function coBox() {
    return `<div class="wst-co"><i>👥</i><div><b>${esc(T("Build together"))}</b><small>${esc(T("Got a code from a friend? Join their game and take turns with the pen."))}</small></div><input class="wst-coin" maxlength="6" placeholder="${esc(T("Code"))}" autocomplete="off"><button type="button" class="wst-go" data-cojoin>${esc(T("Join"))}</button></div>`;
  }
  function coLine(g) {
    if (g.shared) return `<p class="wst-coln">👥 ${esc(T("{n}'s game — you build it together", { n: (g.co && g.co.owner) || g.byName || "?" }))}${g.co && g.co.pen ? ` · ✏️ ${esc(g.co.pen.name)}` : ""} <button type="button" data-coleave="${esc(g.id)}">${esc(T("Leave"))}</button></p>`;
    if (g.co) return `<p class="wst-coln">👥 ${esc(T("Built with {n}", { n: g.co.name || "?" }))}${g.co.pen ? ` · ✏️ ${esc(g.co.pen.name)}` : ""} <button type="button" data-coleave="${esc(g.id)}">${esc(T("Remove"))}</button></p>`;
    const c = coCode[g.id] || g.coCode; return c ? `<p class="wst-coln">👥 ${esc(T("Friend's code"))}: <b class="wst-code">${esc(c)}</b> <button type="button" data-cocopy="${esc(c)}">${esc(T("Copy"))}</button></p>` : "";
  }
  // STB7: the save's state stays on screen (a toast was easy to miss), and a shared draft listens for the pen coming back
  let sv = null, penT = 0;
  function saveBar() {
    if (!sv || !editId && sv.k !== "saving") return ""; const hm = sv.at ? new Date(sv.at).toTimeString().slice(0, 5) : "";
    return sv.k === "saving" ? `<p class="wst-sv">⟳ ${esc(T("Saving…"))}</p>` : sv.k === "err" ? `<p class="wst-sv err">⚠ ${esc(T("Not saved — try again"))} <button type="button" data-resave>${esc(T("Retry"))}</button></p>` : `<p class="wst-sv ok">✓ ${esc(T("Saved {t}", { t: hm }))}</p>`;
  }
  function penWatch() {
    clearInterval(penT); penT = 0; const g = editId && coOf(editId); if (!g || !(g.co || g.shared) || !wallet()) return;
    penT = setInterval(async () => {
      if (!el || el.hidden || tab !== "make" || !editId) { clearInterval(penT); penT = 0; return; } if (penMine()) return;
      try { const r = await fetch("/api/social?world=studio-mine&wallet=" + wallet(), { cache: "no-store" }); if (!r.ok) return; const j = await r.json(), all = [...(j.games || []), ...(j.shared || []).map((x) => ({ ...x, shared: true }))], n = all.find((x) => x.id === editId); if (!n) return;
        const was = pen && pen.name; mine = j.games || mine; shared = (j.shared || []).map((x) => ({ ...x, shared: true })); pen = n.co ? n.co.pen : null;
        if (was && !pen) { ctx.toast("✏️ " + esc(T("{n} passed you the pen", { n: was }))); paint(); } else if (pen && pen.name !== was) paint();
        if (n.spec && !penMine() && JSON.stringify(n.spec) !== JSON.stringify(spec)) { spec = clampSpec(n.spec); paint(); } } catch { /* the next look */ }
    }, 12000);
  }
  function penBar() {
    const g = editId && coOf(editId); if (!g || !(g.co || g.shared)) return "";
    return penMine() ? `<div class="wst-pen on">✏️ <b>${esc(T("You have the pen"))}</b><small>${esc(T("Your friend can look, but only you save — pass it when you're done."))}</small><button type="button" data-copen="off">${esc(T("Pass the pen"))}</button></div>`
      : `<div class="wst-pen">🔒 <b>${esc(pen && pen.name ? T("{n} has the pen", { n: pen.name }) : T("Nobody has the pen"))}</b><small>${esc(T("You can look and test. Take the pen to change it."))}</small><button type="button" data-copen="on">${esc(T("Take the pen"))}</button></div>`;
  }
  async function takePen(on) {
    const r = await act({ action: "world-studio-co-pen", id: editId, ...(on ? {} : { off: true }) });
    if (r && r.ok) { pen = r.j.pen; if (pen) ctx.toast("✏️ " + esc(T("You have the pen"))); else ctx.toast(esc(T("You passed the pen"))); }
    else { pen = r && r.j && r.j.pen ? { name: r.j.pen.name } : pen; if (r) fail(r); }
    paint();
  }
  function paintMine() {
    const L = locals(), w = wallet();
    const loc = L.length ? `<div class="wst-local"><b>📱 ${esc(T("{n} drafts on this device", { n: L.length }))}</b><small>${esc(T(w ? "Put them in your account to keep them everywhere and publish them." : "They stay on this phone or computer. Sign in to keep them everywhere and publish them."))}</small><button type="button" class="wst-go" data-${w ? "lup" : "signin"}>${esc(T(w ? "Put them in my account" : "Sign in"))}</button></div>${L.map(localCard).join("")}` : "";
    if (!w) return loc || `<div class="wst-emptybox"><i>🎮</i><b>${esc(T("No games yet"))}</b><small>${esc(T("Make one in Create — you can save it on this device without signing in."))}</small><button type="button" class="wst-go" data-tab="make">🛠️ ${esc(T("Create"))}</button></div>`;
    return webBox() + coBox() + loc + (shared.length ? `<h4 class="wst-sub">👥 ${esc(T("Built with friends"))}</h4>` + shared.map((g) => card(g, true)).join("") + `<h4 class="wst-sub">🎮 ${esc(T("My games"))}</h4>` : "") + (mine.length ? mine.map((g) => card(g, true)).join("") : L.length ? "" : `<div class="wst-emptybox"><i>🎮</i><b>${esc(T("No games yet"))}</b><small>${esc(T("No games yet — make your first one in Create."))}</small><button type="button" class="wst-go" data-tab="make">🛠️ ${esc(T("Create"))}</button></div>`);
  }
  // ARC3: the week's USDC prize (a GM sets it; paid after the week from the GM's own wallet, checked by the server)
  const usd = (c) => (c / 100).toFixed(c % 100 ? 2 : 0);
  function prizeLine(pz, last) {
    if (!pz || !pz.usd) return ""; const medal = ["🥇", "🥈", "🥉"];
    return `<div class="wst-prize"><img src="/images/ui/kit/ic-prize-trophy.webp" alt="" width="28" height="28"><b>${esc(T("USDC prize"))}</b>${pz.usd.map((c, i) => (c ? `<span>${medal[i]} ${usd(c)} USDC${last && pz.paid && pz.paid[i] ? ` <a href="https://arcscan.app/tx/${esc(pz.paid[i].tx)}" target="_blank" rel="noopener" title="${esc(T("Paid"))}">✓</a>` : ""}</span>` : "")).join("")}</div>`;
  }
  function gmPrize() {
    if (!(ctx.isGM && ctx.isGM())) return ""; const pz = (week && week.prize) || { usd: [0, 0, 0] }, lp = week && week.last && week.last.prize;
    const due = lp && week.last.top ? week.last.top.slice(0, 3).map((x, i) => ({ x, i, c: lp.usd[i] || 0, paid: lp.paid && lp.paid[i] })).filter((r) => r.c && !r.paid) : [];
    return `<details class="wst-gmprize"><summary>GM · ${esc(T("USDC prize"))}</summary><form data-prizef>${[0, 1, 2].map((i) => `<label>${["🥇", "🥈", "🥉"][i]}<input type="number" min="0" max="1000" step="1" value="${(pz.usd[i] || 0) / 100}"> USDC</label>`).join("")}<button type="submit" class="wst-go">${esc(T("Set this week's prize"))}</button></form>
      ${due.length ? `<p>${esc(T("Last week's prizes to pay:"))}</p>${due.map((r) => `<button type="button" class="wst-go" data-prizepay="${r.i}" data-week="${esc(week.last.week)}" data-amt="${r.c}" data-gid="${esc(r.x.id)}">${["🥇", "🥈", "🥉"][r.i]} ${esc(r.x.title)} · ${usd(r.c)} USDC — ${esc(T("Pay from my wallet"))}</button>`).join("")}` : ""}</details>`;
  }
  // STB7 (2026-10-27): the day's creator challenge — a template and a theme a Seoul day; a game published today in both
  // enters, and others' plays + likes ×5 today rank it
  function dayBox() {
    if (!today || !TEMPLATES[today.tpl]) return ""; const left = Math.max(0, today.ends - Date.now()), h = Math.floor(left / 3600e3), m = Math.floor((left % 3600e3) / 60e3), th = THEMES[today.theme] || THEMES.neon;
    const top = (today.top || []).slice(0, 3), medal = ["🥇", "🥈", "🥉"];
    return `<div class="wst-contest wst-day" style="--c:${hex(th.edge)}"><div class="wst-cth"><i class="wst-dayic">🌞</i><div><small>${esc(T("Today's creator challenge"))}</small><b>${ICON[today.tpl] || "🎮"} ${esc(T(TEMPLATES[today.tpl].name))} · ${esc(T(th.name))}</b><em>${esc(T("ends in {h}h {m}m", { h, m }))}</em></div><button type="button" class="wst-go" data-daymake="${esc(today.tpl)}:${esc(today.theme)}">🛠️ ${esc(T("Enter"))}</button></div>
      <small class="wst-ctrule">${esc(T("Publish a {t} game in the {th} theme today — the most played wins the day.", { t: T(TEMPLATES[today.tpl].name), th: T(th.name) }))}</small>
      ${top.length ? `<ol class="wst-ctop">${top.map((x, i) => `<li data-open="${esc(x.id)}" role="button"><i>${medal[i]}</i><b>${esc(x.title)}</b><span>${esc(x.byName || "?")}</span><em>${x.score}</em></li>`).join("")}</ol>` : `<p class="wst-ctempty">${esc(T("No entries yet — yours could be #1!"))}</p>`}
      ${today.last && today.last.top && today.last.top.length ? `<p class="wst-ctlast">${esc(T("Yesterday's winner"))}: 👑 <b data-open="${esc(today.last.top[0].id)}" role="button">${esc(today.last.top[0].title)}</b> · ${esc(today.last.top[0].byName || "?")}</p>` : ""}</div>`;
  }
  const RX = { fire: "🔥", lol: "😂", wow: "😮", hard: "💀", love: "😍" };
  function socialBox(g, own) {
    const rx = (gcm && gcm.rx) || g.rx || {}, L = (gcm && gcm.comments) || [], picked = myPicks.includes(g.id);
    return `<div class="wst-soc"><div class="wst-rx">${Object.entries(RX).map(([k, e]) => `<button type="button" data-rx="${k}">${e}<b>${rx[k] || 0}</b></button>`).join("")}${own ? "" : `<button type="button" class="wst-pick${picked ? " on" : ""}" data-mypick="${esc(g.id)}">⭐ ${esc(T(picked ? "In my picks" : "Add to my picks"))}</button>`}</div>
      <form class="wst-cmf" data-cmtf><input maxlength="140" autocomplete="off" placeholder="${esc(T("Say something nice about this game…"))}"><button type="submit" class="wst-go alt">${esc(T("Post"))}</button></form>
      <ul class="wst-cml">${L.length ? L.slice(0, 20).map((c) => `<li${c.maker ? ' class="mk"' : ""}><b>${esc(c.name || "Player")}${c.maker ? ` <em>${esc(T("Maker"))}</em>` : ""}</b><span>${esc(c.t)}</span>${own ? `<button type="button" class="wst-link" data-uncmt="${esc(c.k)}" aria-label="${esc(T("Delete"))}">✕</button>` : ""}</li>`).join("") : `<li class="none">${esc(gcm ? T("No comments yet — be the first!") : T("Loading…"))}</li>`}</ul></div>`;
  }
  function contestBox() {
    if (!week || !week.tpl || !TEMPLATES[week.tpl]) return ""; const left = Math.max(0, week.ends - Date.now()), d = Math.floor(left / 86400e3), h = Math.floor((left % 86400e3) / 3600e3);
    const top = (week.top || []).slice(0, 3), medal = ["🥇", "🥈", "🥉"];
    return `<div class="wst-contest"><div class="wst-cth"><i>${IC("ic-trophy")}</i><div><small>${esc(T("Weekly creator contest"))}</small><b>${ICON[week.tpl] || "🎮"} ${esc(T("{t} week", { t: T(TEMPLATES[week.tpl].name) }))}</b><em>${esc(T("ends in {d}d {h}h", { d, h }))}</em></div><button type="button" class="wst-go" data-ctmake="${esc(week.tpl)}">🛠️ ${esc(T("Enter"))}</button></div>
      <small class="wst-ctrule">${esc(T("Publish a {t} game — plays by others and likes (×5) this week rank it.", { t: T(TEMPLATES[week.tpl].name) }))}</small>
      ${prizeLine(week.prize)}${gmPrize()}
      ${top.length ? `<ol class="wst-ctop">${top.map((x, i) => `<li data-open="${esc(x.id)}" role="button"><i>${medal[i]}</i><b>${esc(x.title)}</b><span>${esc(x.byName || "?")}</span><em>${x.pts}</em></li>`).join("")}</ol>` : `<p class="wst-ctempty">${esc(T("No entries yet — yours could be #1!"))}</p>`}
      ${week.last && week.last.top && week.last.top.length ? `<p class="wst-ctlast">${esc(T("Last week's winner"))}: 👑 <b data-open="${esc(week.last.top[0].id)}" role="button">${esc(week.last.top[0].title)}</b> · ${esc(week.last.top[0].byName || "?")}</p>${prizeLine(week.last.prize, true)}` : ""}</div>`;
  }
  const arcTools = () => `<div class="wst-atools"><input class="wst-aq" type="search" maxlength="30" placeholder="🔎 ${esc(T("Search games or makers"))}" value="${esc(aq)}"><div class="wst-chips">${[["pop", "🔥", "Popular"], ["new", "🆕", "New"], ["like", "♥", "Most liked"]].map(([k, ic, l]) => `<button type="button" data-asort="${k}" class="${asort === k ? "on" : ""}">${ic} ${esc(T(l))}</button>`).join("")}</div>
    <div class="wst-chips wst-atpl"><button type="button" data-atpl="" class="${atpl ? "" : "on"}">${esc(T("All"))}</button>${Object.keys(TEMPLATES).map((k) => `<button type="button" data-atpl="${k}" class="${atpl === k ? "on" : ""}" title="${esc(T(TEMPLATES[k].name))}">${ICON[k]} ${esc(T(TEMPLATES[k].name))}</button>`).join("")}</div></div>`;
  const arcList = (L) => { const q = aq.trim().toLowerCase(); let out = L.filter((g) => (!atpl || g.tpl === atpl) && (!q || String(g.title).toLowerCase().includes(q) || String(g.byName || "").toLowerCase().includes(q)));
    out = [...out].sort((a, b) => (b.pick ? 1 : 0) - (a.pick ? 1 : 0) || (asort === "new" ? b.at - a.at : asort === "like" ? (b.likes || 0) - (a.likes || 0) || b.at - a.at : (b.plays + b.likes * 5) - (a.plays + a.likes * 5) || b.at - a.at)); return out; };
  function paintArcade() {
    const off = arcList(arcade.filter((g) => g.off)), rest = arcList(arcade.filter((g) => !g.off)), filtered = aq.trim() || atpl;
    const rbox = ctx.isGM && ctx.isGM() && reports.length ? `<div class="wst-reports"><b>⚑ ${esc(T("Reported games (GM)"))}</b>${reports.slice(0, 8).map((x) => `<div><span data-open="${esc(x.id)}" role="button">${esc(x.title)} · ${esc(x.byName || "?")}</span><em>${x.n}</em></div>`).join("")}</div>` : "";
    // STB5 (2026-10-27): what people are playing right now, and today's three (the same three for everyone all day)
    const hot = filtered ? [] : arcade.filter((g) => g.now > 0).sort((p, q) => q.now - p.now).slice(0, 6);
    const pool = arcade.filter((g) => !g.off).sort((p, q) => (q.plays + q.likes * 5) - (p.plays + p.likes * 5)).slice(0, 24), dk = Number(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ""));
    const today = filtered || pool.length < 4 ? [] : [0, 1, 2].map((i) => pool[(dk * (i + 7) * 2654435761 >>> 0) % pool.length]).filter((g, i, a) => a.indexOf(g) === i);
    // WS5: the curated home — new from creators you follow, rising (published this week), the most played, the editors' picks
    const byId = new Map(arcade.map((g) => [g.id, g])), wk = Date.now() - 7 * 86400e3, shown = new Set([...hot, ...today].map((g) => g.id));
    const folw = filtered || !feed ? [] : (feed.games || []).map((x) => byId.get(x.id)).filter(Boolean).slice(0, 6); folw.forEach((g) => shown.add(g.id));
    const rising = filtered ? [] : arcade.filter((g) => !g.off && g.at > wk && !shown.has(g.id)).sort((p, q) => (q.plays + q.likes * 5) - (p.plays + p.likes * 5)).slice(0, 6);
    const most = filtered ? [] : arcade.filter((g) => !g.off && !shown.has(g.id) && !rising.includes(g)).sort((p, q) => q.plays - p.plays).slice(0, 6).filter((g) => g.plays > 0);
    const picks = filtered ? [] : arcade.filter((g) => g.pick).slice(0, 6);
    const curated = `${folw.length ? `<h4 class="wst-sec">🔔 ${esc(T("New from creators you follow"))}</h4><div class="wst-offrow">${folw.map((g) => card(g, false)).join("")}</div>` : ""}${picks.length ? `<h4 class="wst-sec">⭐ ${esc(T("Editors' picks"))}</h4><div class="wst-offrow">${picks.map((g) => card(g, false)).join("")}</div>` : ""}${rising.length ? `<h4 class="wst-sec">🚀 ${esc(T("Rising this week"))}</h4><div class="wst-offrow">${rising.map((g) => card(g, false)).join("")}</div>` : ""}${most.length ? `<h4 class="wst-sec">🏆 ${esc(T("Most played"))}</h4><div class="wst-offrow">${most.map((g) => card(g, false)).join("")}</div>` : ""}`;
    if (folw.length) setTimeout(feedSeen, 1500); /* (seen once the row is on the screen) */
    const rows = `${hot.length ? `<h4 class="wst-sec">🔥 ${esc(T("Playing right now"))}</h4><div class="wst-offrow">${hot.map((g) => card(g, false)).join("")}</div>` : ""}${today.length ? `<h4 class="wst-sec">📅 ${esc(T("Today's three"))}</h4><div class="wst-offrow">${today.map((g) => card(g, false)).join("")}</div>` : ""}${curated}`;
    const join = `<form class="wst-rjoin" data-rjoin><b>🏁 ${esc(T("Live race"))}</b><small>${esc(T("Got a code from a friend?"))}</small><input maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCDE" aria-label="${esc(T("Race code"))}"><button type="submit" class="wst-go">${esc(T("Join"))}</button></form>`;
    return `${rbox}${join}${dayBox()}${contestBox()}${arcTools()}${rows}${off.length ? `<h4 class="wst-sec">✔ ${esc(T("Start here — made by ARCIRCLE"))}</h4><div class="wst-offrow">${off.map((g) => card(g, false)).join("")}</div>` : ""}
      <h4 class="wst-sec">🕹️ ${esc(T("Players' games"))}</h4>${rest.length ? `<div class="wst-offrow">${rest.map((g) => card(g, false)).join("")}</div>` : filtered ? `<p class="wst-empty">${esc(T("No games match — try another word or template"))}</p>` : `<div class="wst-emptybox"><i>🚀</i><b>${esc(T("Be the first creator!"))}</b><small>${esc(T("The Creator Arcade is waiting for its first game — publish yours!"))}</small><button type="button" class="wst-go" data-tab="make">🛠️ ${esc(T("Create"))}</button></div>`}`;
  }
  // Studio 3: a game's own page — its cover, who made it, how hard, the top 10, play / race the #1's ghost / like / challenge
  function remixOf(g) { spec = clampSpec({ ...g.spec, title: (g.title + " " + T("remix")).slice(0, 24), seed: g.spec.seed }); editId = ""; localId = ""; remixFrom = g.id; tab = "make"; step = 3; lastTest = null; paint(); ctx.toast("🔀 " + esc(T("A copy is open — change anything, then save it as yours"))); }
  // STB5 (2026-10-27): the web page's Remix button lands here (/play?sg=<id>&remix=1): the game's page opens, then the copy
  async function remixId(id) { await openGame(id); if (gdata && gdata.spec) remixOf(gdata); }
  // STB5: a creator's milestones — the first play by someone else, then 10, 50, 100, 500, 1,000 plays — celebrated once
  // each on this device when My games or the arcade is read
  const MS = [1, 10, 50, 100, 500, 1000];
  function milestones() { let seen = {}; try { seen = JSON.parse(localStorage.getItem("arc.studio.ms") || "{}"); } catch { /* fresh */ }
    for (const g of mine) { if (!g || !g.pub) continue; const m = MS.filter((x) => (g.plays || 0) >= x).pop(); if (!m || (seen[g.id] || 0) >= m) continue; seen[g.id] = m;
      ctx.toast("🎉 " + esc(m === 1 ? T("Someone played \"{t}\" for the first time!", { t: g.title }) : T("\"{t}\" reached {n} plays!", { t: g.title, n: m.toLocaleString("en-US") })));
      if (!ctx.reduce) { const w = document.createElement("div"); w.className = "wst-launch ms"; w.innerHTML = `<div class="wst-live"><b>🎉 ${esc(m === 1 ? T("First play!") : T("{n} plays!", { n: m.toLocaleString("en-US") }))}</b></div>`; document.body.appendChild(w); confetti(w); setTimeout(() => w.remove(), 2600); }
      break; } // (one celebration at a time)
    try { localStorage.setItem("arc.studio.ms", JSON.stringify(seen)); } catch { /* not kept */ } }
  async function openGame(id) {
    gid = id; gdata = null; gcm = null; tab = "game"; paint();
    fetch("/api/social?world=studio-comments&id=" + encodeURIComponent(id), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && gid === id) { gcm = j; if (tab === "game") paint(); } }).catch(() => { /* none shown */ });
    try { const [a, b] = await Promise.all([fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id) + (wallet() ? "&me=" + wallet() : ""), { cache: "no-store" }), fetch("/api/social?world=studio-ghost&id=" + encodeURIComponent(id), { cache: "no-store" })]);
      const g = a.ok ? (await a.json()).game : null, gh = b.ok ? (await b.json()).ghost : null; if (gid !== id) return; gdata = g ? { ...g, ghost: gh } : { gone: true }; } catch { gdata = { gone: true }; }
    if (tab === "game") paint();
  }
  function paintGame() {
    if (!gdata) return `<p class="wst-empty">${esc(T("Loading…"))}</p>`;
    if (gdata.gone || !gdata.spec) return `<p class="wst-empty">${esc(T("Couldn't open it — try again"))}</p><button type="button" class="wst-go alt" data-tab="arcade">← ${esc(T("Back"))}</button>`;
    const g = gdata, th = THEMES[g.theme] || THEMES.neon, E = estimate(g.spec), own = mine.some((x) => x.id === g.id), my = localBest(g.id);
    return `<div class="wst-gp" style="--c:${hex(th.edge)};--b:${hex(th.sky)}"><div class="wst-gpl">
      <div class="wst-gcv" style="background-image:linear-gradient(180deg,transparent 30%,rgba(2,8,20,.85)),url(/images/studio/tpl/${TEMPLATES[g.tpl] ? g.tpl : "runner"}-768.webp${ctx.ver || ""})"><small>${ICON[g.tpl] || "🎮"} ${esc(T((TEMPLATES[g.tpl] || TEMPLATES.runner).name))} · ${esc(T(th.name))}</small><h3>${esc(g.title)}</h3><span>${esc(T("by {n}", { n: g.byName || "?" }))} · ▶ ${g.plays || 0} · ♥ ${g.likes || 0}${g.remixes ? ` · 🔀 ${g.remixes}` : ""}</span>${g.from ? `<small class="wst-from" data-open="${esc(g.from.id)}" role="button">🔀 ${esc(T("Remix of {t} by {n}", { t: g.from.title, n: g.from.byName || "?" }))}</small>` : ""}</div>
      <div class="wst-est s${E.stars}">${starsTxt(E.stars)}<span>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</span>${my ? `<small>${esc(T("Your best here: {n}", { n: my }))}</small>` : ""}</div>
      ${g.ghost ? `<label class="wst-ghosto"><input type="checkbox" data-ghost ${ghostOn ? "checked" : ""}> 👻 ${esc(T("Race {n}'s ghost ({s})", { n: g.ghost.name || "#1", s: g.ghost.score }))}</label>` : ""}
      ${!own && !g.off && g.fans != null ? `<div class="wst-fol"><span>👥 ${esc(g.fans === 1 ? T("1 follower") : T("{n} followers", { n: g.fans }))}</span><button type="button" class="wst-go ${g.fol ? "alt" : ""}" data-follow="${esc(g.id)}" data-on="${g.fol ? 0 : 1}">${g.fol ? "✓ " + esc(T("Following")) : "➕ " + esc(g.byName ? T("Follow {n}", { n: g.byName }) : T("Follow"))}</button></div>` : ""}
      <div class="wst-acts"><button type="button" class="wst-go big" data-play="${esc(g.id)}">${IC("ic-play")} ${esc(T("Play"))}</button>${RACE_TPLS.includes(g.tpl) && g.pub !== false ? `<button type="button" class="wst-go wst-racebtn" data-racenew="${esc(g.id)}">🏁 ${esc(T("Race friends live"))}</button>` : ""}${own ? "" : `<button type="button" class="wst-go alt" data-like="${esc(g.id)}">${IC("ic-like")} ${esc(T("Like"))}</button>`}<button type="button" class="wst-go alt" data-share="${esc(g.id)}" aria-label="${esc(T("Copy link"))}">${IC("ic-share")}</button>${ctx.share ? `<button type="button" class="wst-go alt" data-card="${esc(g.id)}" aria-label="${esc(T("Share card"))}">📸</button>` : ""}<button type="button" class="wst-go alt" data-remix="${esc(g.id)}">${IC("ic-remix")} ${esc(T("Remix"))}</button></div>
      ${own ? "" : `<div class="wst-rep">${repOpen ? `<small>${esc(T("What's wrong with it?"))}</small><div class="wst-chips">${REASONS.map(([k, ic, l]) => `<button type="button" data-report="${k}">${ic} ${esc(T(l))}</button>`).join("")}</div>` : `<button type="button" class="wst-link" data-repopen>${IC("ic-report")} ${esc(T("Report this game"))}</button>`}${ctx.isGM && ctx.isGM() ? ` <button type="button" class="wst-link" data-ghide="${g.hidden ? 0 : 1}">${g.hidden ? "👁 " + esc(T("Show it again")) : "🙈 " + esc(T("Hide from the arcade (GM)"))}</button>` : ""}</div>`}
      ${socialBox(g, own)}
      <button type="button" class="wst-link" data-tab="arcade">← ${esc(T("Creator Arcade"))}</button></div>
      <aside class="wst-gpr"><h4>${IC("ic-trophy")} ${esc(T("Top 10"))}</h4>${(g.best || []).length ? `<ol class="wst-board">${g.best.map((x, i) => `<li class="${i === 0 ? "gold" : ""}"><i>${i === 0 ? "👑" : i + 1}</i><b>${esc(x.name || "?")}</b><em>${x.score}</em>${x.gh ? `<button type="button" class="wst-gpb" data-gp="${i + 1}" aria-label="${esc(T("Race {n}'s ghost", { n: x.name || "?" }))}">👻</button>` : ""}</li>`).join("")}</ol>` : `<p class="wst-empty">${esc(T("Nobody has played it yet — be the first!"))}</p>`}</aside></div>`;
  }
  const localBest = (id) => { try { return Number(localStorage.getItem("arc.studio.best." + id) || 0); } catch { return 0; } };
  const ev = (k) => { try { if (ctx.onEvent) ctx.onEvent(k); } catch { /* fine */ } }; // (Studio Beta: the Academy's 10-minute first game counts these)
  const IC = (n) => `<img class="wst-ic" src="/images/studio/ui/${n}.webp${ctx.ver || ""}" alt="" aria-hidden="true">`; // (STU-6b: Meshy's glass icons)
  const isWide = () => { const z = (el && parseFloat(getComputedStyle(el).zoom)) || 1; return innerWidth / z >= 820 && innerWidth > innerHeight * 1.15; }; // (z: a sideways phone at its own width draws the Studio smaller — world-skin.css html.wp-vpfb — so it has the room of a wide screen)
  addEventListener("resize", () => { if (el && !el.hidden && el.classList.contains("wide") !== isWide()) paint(); });
  function paint() {
    if (!el) return;
    const body = tab === "mine" ? paintMine() : tab === "game" ? paintGame() : tab === "arcade" ? paintArcade() : paintMake();
    el.classList.toggle("wide", isWide()); // (STU-6: a computer or a phone held sideways — the rail-and-columns layout)
    el.innerHTML = `<div class="wst-in"><header class="wst-h"><small>${esc(T("Make your own game"))}</small><h2>🎮 <em>ARCIRCLE</em> Studio</h2><button type="button" class="wst-help" data-guide aria-label="${esc(T("How to use"))}" title="${esc(T("How to use"))}">${IC("ic-guide")}</button><button type="button" class="wst-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
      <nav class="wst-tabs">${[["make", "tab-make", "Create"], ["mine", "tab-mine", "My games"], ["arcade", "tab-arcade", "Creator Arcade"]].map(([id, ic, l]) => `<button type="button" data-tab="${id}" class="${tab === id ? "on" : ""}"><span aria-hidden="true">${IC(ic)}</span>${esc(T(l))}${id === "arcade" && feedNew() ? `<em class="wst-badge" title="${esc(T("New from creators you follow"))}">${feedNew()}</em>` : ""}</button>`).join("")}</nav>
      <div class="wst-body">${body}</div><div class="wst-foot">${sideCard()}${ctx.webLink ? `<a class="wst-weblink" href="/studio" target="_blank" rel="noopener">🌐 ${esc(T("Open ARCIRCLE Studio on the web — faster"))} ↗</a>` : ""}<span>${esc(T("Games are made from templates — no code. Plays, likes and best runs are counted; no ARCL is paid for games yet."))}</span></div></div>`;
    estRoll();
    if (tab === "make") { drawPrev(); attachPreview(); if (step === 3) setTimeout(fillGallery, 30); } else { if (prev) prev.stop(); wantThumbs(tab === "arcade" ? arcade : tab === "mine" ? [...mine, ...locals().map((d) => ({ id: d.id, at: d.at, spec: d.spec }))] : []); }
  }
  let estT = 0, estLast = null;
  // STB4 (2026-10-27): the clear rate rolls to its new number and its bar fills from where it was
  function estRoll() {
    const ee = el && el.querySelector(".wst-est[data-p]"); if (!ee) return; const p = Number(ee.dataset.p), from = estLast == null ? p : estLast, bar = ee.querySelector(".wst-estbar>i"), sp = ee.querySelector("span"); estLast = p;
    if (bar) bar.style.width = from + "%"; if (from === p || ctx.reduce) { if (bar) bar.style.width = p + "%"; return; }
    ee.classList.add(p > from ? "up" : "down"); const t0 = performance.now(), txt = (v) => T("Estimated clear rate {p}%", { p: v });
    const tick = (now) => { const k = Math.min(1, (now - t0) / 450), v = Math.round(from + (p - from) * (1 - (1 - k) ** 3)); if (sp && sp.isConnected) sp.textContent = txt(v); if (k < 1 && ee.isConnected) requestAnimationFrame(tick); };
    requestAnimationFrame(() => { if (bar) bar.style.width = p + "%"; requestAnimationFrame(tick); });
  }
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
  async function onPrizeSet(e) {
    if (e.target.closest && e.target.closest("[data-rjoin]")) { e.preventDefault(); const inp = e.target.closest("[data-rjoin]").querySelector("input"); return raceJoin(inp ? inp.value : ""); }
    if (e.target.closest && e.target.closest("[data-cmtf]")) { e.preventDefault(); const f = e.target.closest("[data-cmtf]"), inp = f.querySelector("input"), t = inp.value.trim(); if (t.length < 2 || !gdata) return;
      const r = await act({ action: "world-studio-comment", id: gdata.id, t }); if (!r || !r.ok) return r && fail(r); gcm = { ...(gcm || {}), comments: r.j.comments }; ctx.toast("💬 " + esc(T("Posted"))); paint(); return; }
    const f = e.target.closest("[data-prizef]"); if (!f) return; e.preventDefault();
    const usdv = [...f.querySelectorAll("input")].map((i) => Math.round((Number(i.value) || 0) * 100)); const r = await act({ action: "world-studio-prize", op: "set", usd: usdv });
    if (!r || !r.ok) return fail(r); week = { ...week, prize: r.j.prize }; ctx.toast("🏆 " + esc(T("Prize set"))); paint();
  }
  async function payPrize(b) {
    if (!ctx.tx) { ctx.toast(esc(T("Wallet connect isn't available here."))); return; }
    const q = await act({ action: "world-studio-prize", op: "to", week: b.dataset.week, rank: Number(b.dataset.prizepay) }), to = q && q.ok && q.j.to;
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(to || ""))) { ctx.toast(esc(T("That game has no maker's wallet"))); return; }
    const cents = Number(b.dataset.amt); if (!(await ask(T, T("Send {p} USDC to {w} from your wallet?", { p: (cents / 100).toFixed(2), w: to.slice(0, 6) + "…" + to.slice(-4) }), { ok: T("Send") }))) return;
    b.disabled = true; let tx;
    try { tx = await ctx.tx("0x3600000000000000000000000000000000000000", "0xa9059cbb" + to.slice(2).toLowerCase().padStart(64, "0") + (BigInt(cents) * 10000n).toString(16).padStart(64, "0")); } catch (e2) { b.disabled = false; ctx.toast(esc(e2 && e2.code === 4001 ? T("Cancelled") : (e2 && e2.message) || T("The wallet didn't send it"))); return; }
    for (let i = 0; i < 16; i++) { const r = await act({ action: "world-studio-prize", op: "paid", week: b.dataset.week, rank: Number(b.dataset.prizepay), tx }); if (r && r.status === 202) { await new Promise((ok) => setTimeout(ok, 4000)); continue; } if (!r || !r.ok) { b.disabled = false; return fail(r); } week = { ...week, last: { ...week.last, prize: r.j.prize } }; ctx.toast("🏆 " + esc(T("Paid — the server checked your transfer"))); paint(); return; }
    b.disabled = false; ctx.toast(esc(T("The transaction is still not confirmed — it will be checked when you try again.")));
  }
  async function onClick(e) {
    const op = e.target.closest("[data-open]"); if (op && !e.target.closest("button")) return openGame(op.dataset.open);
    const b = e.target.closest("button"); if (!b || b.disabled) { if (e.target === el) close(); return; }
    if (b.hasAttribute("data-x")) return close();
    if (b.hasAttribute("data-signin")) { try { await ctx.signIn(); } catch { return; } await load(); paint(); return; }
    if (b.hasAttribute("data-lup")) return uploadLocals();
    if (b.dataset.ltest) { const d = locals().find((x) => x.id === b.dataset.ltest); if (d) run({ spec: clampSpec(d.spec), test: true }); return; }
    if (b.dataset.ledit) { const d = locals().find((x) => x.id === b.dataset.ledit); if (d) { spec = clampSpec(d.spec); editId = ""; localId = d.id; tab = "make"; step = 3; lastTest = null; paint(); } return; }
    if (b.dataset.ldel) { if (!(await ask(T, T("Delete this game?"), { ok: T("Delete"), danger: true }))) return; setLocals(locals().filter((x) => x.id !== b.dataset.ldel)); if (localId === b.dataset.ldel) localId = ""; paint(); return; }
    if (b.dataset.card) return shareCard(b.dataset.card);
    if (b.dataset.asort) { asort = b.dataset.asort; return paintKeep(); }
    if (b.dataset.stats) { statsOpen = statsOpen === b.dataset.stats ? "" : b.dataset.stats; if (statsOpen) await load(); return paintKeep(); }
    if (b.hasAttribute("data-repopen")) { repOpen = true; return paintKeep(); }
    if (b.dataset.report && gdata) { const r = await act({ action: "world-studio-report", id: gdata.id, why: b.dataset.report }); repOpen = false; if (r && r.ok) ctx.toast(r.j.already ? esc(T("You reported it already")) : "⚑ " + esc(T("Thanks — a GM will look at it"))); else if (r) fail(r); return paintKeep(); }
    if (b.dataset.ghide && gdata) { const r = await act({ action: "world-studio-hide", id: gdata.id, on: b.dataset.ghide === "1" }); if (r && r.ok) { gdata = { ...gdata, hidden: r.j.hidden }; ctx.toast(r.j.hidden ? "🙈 " + esc(T("Hidden from the arcade")) : "👁 " + esc(T("Back on the arcade"))); load(); } else if (r) fail(r); return paintKeep(); }
    if (b.hasAttribute("data-tweak")) return tweakIt();
    if (b.dataset.atpl != null && b.hasAttribute("data-atpl")) { atpl = b.dataset.atpl; return paintKeep(); }
    if (b.dataset.prizepay) { await payPrize(b); return; }
    if (b.dataset.daymake) { const [tp, th] = b.dataset.daymake.split(":"); spec = clampSpec({ ...spec, tpl: tp, theme: th, title: "" }); editId = ""; localId = ""; remixFrom = ""; tab = "make"; step = 1; lastTest = null; paint(); return; }
    if (b.dataset.rx && gdata) { b.disabled = true; const r = await act({ action: "world-studio-react", id: gdata.id, r: b.dataset.rx }); if (!r || !r.ok) { b.disabled = false; return r && fail(r); } gcm = { ...(gcm || { comments: [] }), rx: r.j.rx }; if (r.j.already) ctx.toast(esc(T("You reacted already"))); paint(); const nb = el.querySelector(`[data-rx="${b.dataset.rx}"]`); if (nb) nb.classList.add("pop"); return; }
    if (b.dataset.mypick) { const id = b.dataset.mypick, on = !myPicks.includes(id), next = on ? [id, ...myPicks] : myPicks.filter((x) => x !== id); const r = await act({ action: "world-studio-picks", ids: next.slice(0, 20) }); if (!r || !r.ok) return r && fail(r); myPicks = r.j.ids || []; ctx.toast(on ? "⭐ " + esc(T("Added to your picks — they show on your web page")) : esc(T("Taken out of your picks"))); paint(); return; }
    if (b.dataset.uncmt && gdata) { const r = await act({ action: "world-studio-uncomment", id: gdata.id, k: b.dataset.uncmt }); if (!r || !r.ok) return r && fail(r); gcm = { ...(gcm || {}), comments: r.j.comments }; paint(); return; }
    if (b.dataset.ctmake) { spec = clampSpec({ ...spec, tpl: b.dataset.ctmake, title: "" }); editId = ""; localId = ""; remixFrom = ""; tab = "make"; step = 1; lastTest = null; paint(); return; }
    if (b.dataset.remix) { const g = gdata && gdata.id === b.dataset.remix ? gdata : null; if (!g || !g.spec) return; return remixOf(g); }
    if (b.hasAttribute("data-guide")) { if (ctx.guide) ctx.guide("studio"); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; paint(); if (tab !== "make") load(); return; }
    if (b.dataset.step) { step = Number(b.dataset.step); return paintKeep(); }
    if (b.hasAttribute("data-next")) { step = step <= 2 ? 3 : 4; if (step === 3) ev("tune"); fxStep(); return paint(); }
    if (b.hasAttribute("data-back")) { step = step >= 4 ? 3 : 1; return paint(); }
    if (b.dataset.rule) { const k = b.dataset.rule, cur = spec.rules || [], on = cur.includes(k); if (!on && cur.length >= 2) { ctx.toast(esc(T("Two rule cards at most — take one off first"))); return; } spec = clampSpec({ ...spec, rules: on ? cur.filter((x) => x !== k) : [...cur, k] }); return paintKeep(); }
    if (b.dataset.speed) { spec.speed = Number(b.dataset.speed); return paintKeep(); }
    if (b.dataset.gal) { spec = clampSpec({ ...spec, seed: Number(b.dataset.gal) }); lastTest = null; fxStep(); return paintKeep(); }
    if (b.dataset.galre) { galSeeds(); gal[Number(b.dataset.galre)] = 1 + Math.floor(Math.random() * 999998); if (gal[Number(b.dataset.galre)] === spec.seed) gal[Number(b.dataset.galre)]++; return paintKeep(); }
    if (b.hasAttribute("data-galall")) { galSeeds(); const keep = spec.seed; gal = gal.map((_, i) => (i ? 1 + Math.floor(Math.random() * 999998) : keep)); return paintKeep(); }
    if (b.dataset.gpick) { const g = arcade.find((x) => x.id === b.dataset.gpick); const r = await act({ action: "world-studio-pick", id: b.dataset.gpick, on: !(g && g.pick) }); if (r && r.ok) { ctx.toast(r.j.pick ? "⭐ " + esc(T("Editor's pick")) : esc(T("Taken off the picks"))); arcade = arcade.map((x) => (x.id === b.dataset.gpick ? { ...x, pick: r.j.pick ? Date.now() : 0 } : x)).sort((x, y) => (y.pick ? 1 : 0) - (x.pick ? 1 : 0)); paint(); } else if (r) fail(r); return; }
    if (b.hasAttribute("data-build")) return openBuilder();
    if (b.hasAttribute("data-unbuild")) { if (!(await ask(T, T("Go back to the quick-start layout? Your hand-built layout is dropped."), { danger: true }))) return; delete spec.build; spec = clampSpec(spec); return paintKeep(); }
    if (b.dataset.preset) { Object.assign(spec, PRESETS[b.dataset.preset]); if (ctx.Snd && ctx.Snd.click) try { ctx.Snd.click(); } catch { /* no sound */ } return paintKeep(); }
    if (b.hasAttribute("data-savepub")) { if (!ctx.sess()) { try { await ctx.signIn(); } catch { return; } if (!ctx.sess()) return; } if (!(await okToPublish())) return; await save(); if (editId && !(mine.find((g) => g.id === editId) || {}).pub) await publish(editId); return; }
    if (b.dataset.tcat) { tcat = b.dataset.tcat; return paint(); }
    if (b.dataset.ctgo) { tab = "make"; step = 1; tcat = "all"; spec = clampSpec({ ...spec, tpl: b.dataset.ctgo }); ev("tpl"); return paint(); }
    if (b.dataset.tpl) { ev("tpl"); spec = clampSpec({ ...spec, tpl: b.dataset.tpl, title: spec.title === "My Sky Run" || spec.title === "My Arena" || spec.title === "My Infinity Dash" ? "" : spec.title }); return paint(); }
    if (b.dataset.theme) { spec.theme = b.dataset.theme; return paintKeep(); }
    if (b.dataset.len) { spec.len = Number(b.dataset.len); return paintKeep(); }
    if (b.hasAttribute("data-seed")) { spec.seed = 1 + Math.floor(Math.random() * 99999); return paintKeep(); }
    if (b.hasAttribute("data-test")) { spec = clampSpec(spec); return run({ spec, id: editId || "", test: true }); }
    if (b.hasAttribute("data-ai")) return draft();
    if (b.hasAttribute("data-quick")) return quick();
    if (b.dataset.qidea) { const inp = el.querySelector(".wst-aiin"); if (inp) { inp.value = T(b.dataset.qidea); inp.focus(); } return; }
    if (b.hasAttribute("data-save")) return save();
    if (b.dataset.pub) return publish(b.dataset.pub);
    if (b.dataset.del) return del(b.dataset.del);
    if (b.dataset.vers) { const g = mine.find((x) => x.id === b.dataset.vers), card = b.closest(".wst-card") || b.parentElement; if (!g || !card) return; const old = card.querySelector(".wst-vers"); if (old) { old.remove(); return; }
      const box = document.createElement("div"); box.className = "wst-vers"; box.innerHTML = `<small>${esc(T("Earlier saves — open one, then save to keep it"))}</small>` + g.vers.map((v, i) => `<button type="button" data-restore="${esc(g.id)}:${i}"><span>${esc(new Date(v.at).toLocaleString())}</span><b>${v.spec && v.spec.build ? "🛠️ " + v.spec.build.r.length : esc(T(TEMPLATES[(v.spec || {}).tpl] ? TEMPLATES[v.spec.tpl].name : ""))}</b></button>`).join(""); card.appendChild(box); return; }
    if (b.dataset.restore) { const [id, i] = b.dataset.restore.split(":"), g = mine.find((x) => x.id === id), v = g && g.vers && g.vers[Number(i)]; if (!v) return; spec = clampSpec(v.spec); editId = id; tab = "make"; step = 3; lastTest = null; paint(); ctx.toast(esc(T("An earlier save is open — save to keep it"))); return; }
    if (b.dataset.edit) { repOpen = false; const g = coOf(b.dataset.edit); if (g) { spec = clampSpec(g.spec); editId = g.id; localId = ""; remixFrom = ""; tab = "make"; step = 3; lastTest = null; pen = g.co && g.co.pen ? g.co.pen : null; sv = null; paint(); if ((g.co || g.shared) && !pen) takePen(true); penWatch(); } return; }
    if (b.dataset.copen) return takePen(b.dataset.copen === "on");
    if (b.hasAttribute("data-resave")) return save();
    if (b.dataset.coinv) { const id = b.dataset.coinv; act({ action: "world-studio-co-invite", id }).then((r) => { if (!r || !r.ok) return r && fail(r); coCode[id] = r.j.code; try { navigator.clipboard.writeText(r.j.code); } catch { /* shown on the card */ } ctx.toast("👥 " + esc(T("Code {c} — send it to one friend (open for a day)", { c: r.j.code }))); paint(); }); return; }
    if (b.dataset.cocopy) { try { navigator.clipboard.writeText(b.dataset.cocopy); ctx.toast("📋 " + esc(T("Copied"))); } catch { /* shown */ } return; }
    if (b.hasAttribute("data-cojoin")) { const inp = el.querySelector(".wst-coin"), code = inp ? inp.value.trim() : ""; if (!/^[a-z0-9]{6}$/i.test(code)) { ctx.toast(esc(T("A code has 6 letters"))); return; }
      act({ action: "world-studio-co-join", code }).then((r) => { if (!r || !r.ok) return r && fail(r); shared = [r.j.game, ...shared.filter((x) => x.id !== r.j.game.id)]; ctx.toast("👥 " + esc(T("You joined {t}", { t: r.j.game.title }))); paint(); }); return; }
    if (b.dataset.coleave) { const id = b.dataset.coleave; if (!(await ask(T, T("Stop building this game together?"), { danger: true }))) return; act({ action: "world-studio-co-leave", id }).then((r) => { if (!r || !r.ok) return r && fail(r); shared = shared.filter((x) => x.id !== id); if (editId === id && !mine.some((x) => x.id === id)) { editId = ""; } pen = null; load(); }); return; }
    if (b.dataset.gp && gdata && gdata.id) { const id = gdata.id; b.disabled = true; // (STB5: race any board player's best, not only the #1's)
      fetch("/api/social?world=studio-ghost&id=" + encodeURIComponent(id) + "&p=" + encodeURIComponent(b.dataset.gp), { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j && j.ghost) playId(id, { ghost: j.ghost }); else { b.disabled = false; ctx.toast(esc(T("That ghost isn't there any more"))); } }).catch(() => { b.disabled = false; ctx.toast(esc(T("Couldn't open it — try again"))); });
      return; }
    if (b.dataset.play) return playId(b.dataset.play, tab === "game" && gdata && gdata.id === b.dataset.play && ghostOn ? { ghost: gdata.ghost } : {});
    if (b.dataset.like) return like(b.dataset.like);
    if (b.dataset.racenew) return raceNew(b.dataset.racenew);
    if (b.dataset.follow) { const on = b.dataset.on === "1"; b.disabled = true; const r = await act({ action: "world-studio-follow", id: b.dataset.follow, on }); b.disabled = false; if (!r || !r.ok) return r && fail(r);
      if (gdata && gdata.id === b.dataset.follow) gdata = { ...gdata, fol: on, fans: r.j.fans }; ctx.toast(on ? "🔔 " + esc(T("Following — their new games show in your arcade")) : esc(T("Unfollowed"))); paint(); if (on) load(); return; }
    if (b.hasAttribute("data-hsave")) return saveHandle();
    if (b.hasAttribute("data-hedit")) { hEdit = true; paint(); return; }
    if (b.hasAttribute("data-hcancel")) { hEdit = false; paint(); return; }
    if (b.hasAttribute("data-hcopy")) { const u = `${location.origin}/game/@${myH}`; try { await navigator.clipboard.writeText(u); ctx.toast("🔗 " + esc(T("Link copied"))); } catch { prompt(T("Copy link"), u); } return; }
    if (b.dataset.share) { ev("share"); const u = await webLink(b.dataset.share); try { await navigator.clipboard.writeText(u); ctx.toast("🔗 " + esc(T("Link copied — anyone with it plays your game"))); } catch { prompt(T("Copy link"), u); } return; }
  }
  async function draft() {
    const inp = el.querySelector(".wst-aiin"), t = inp ? inp.value.trim() : ""; if (!t) { if (inp) inp.focus(); return; }
    busy = true; aiNote = T("Thinking…"); paint(); const r = await act({ action: "world-studio-ai", t, tpl: spec.tpl }); busy = false;
    if (!r) { aiNote = ""; paint(); return; }
    if (r.j && r.j.spec) { spec = clampSpec({ ...r.j.spec, seed: r.j.spec.seed }); editId = ""; lastTest = null; aiNote = r.j.by === "agent" ? T("{n} drafted it — tweak anything, then test it.", { n: ctx.agentName() || T("Your agent") }) : T("Drafted from your words — tweak anything, then test it."); step = 4; ctx.toast("✨ " + esc(aiNote)); paint(); { const bx = el.querySelector(".wst-3dbox"); if (bx && !ctx.reduce) bx.classList.add("wst-build-in"); } if (ctx.Snd && ctx.Snd.perfect) try { ctx.Snd.perfect(); } catch { /* no sound */ } return; }
    aiNote = ""; paint(); fail(r);
  }
  let localId = "";
  /// STU-A: almost nobody finishes it and the maker hasn't either — ask first
  async function okToPublish() { const E = estimate(spec); if (E.clear >= 0.05 || (lastTest && lastTest.done)) return true; return ask(T, T("Almost nobody finishes this one. Publish anyway? (Finish it once in a test first to be sure.)")); }
  async function uploadLocals() {
    const L = locals(); if (!L.length) return; busy = true; let n = 0;
    for (const d of L) { const r = await act({ action: "world-studio-save", spec: clampSpec(d.spec) }); if (!r || !r.ok) { if (r) fail(r); break; } mine = [r.j.game, ...mine]; setLocals(locals().filter((x) => x.id !== d.id)); n++; }
    busy = false; if (n) ctx.toast("💾 " + esc(T("{n} games are in your account now", { n }))); paint();
  }
  async function tweakIt() {
    const inp = el.querySelector(".wst-twin"), t = inp ? inp.value.trim() : ""; if (!t) { if (inp) inp.focus(); return; }
    const before = JSON.stringify(spec); busy = true; paintKeep(); const r = await act({ action: "world-studio-tweak", t, spec: clampSpec(spec) }); busy = false;
    if (!r || !r.ok || !r.j.spec) { paintKeep(); if (r) fail(r); return; }
    spec = clampSpec({ ...r.j.spec, ...(spec.build ? { build: spec.build } : {}) }); lastTest = null; paintKeep(); prevSoon();
    const changed = before !== JSON.stringify(spec); ctx.toast("✨ " + esc(r.j.say || (changed ? T("Changed — test it to feel the difference") : T("Nothing to change from those words — try saying it another way"))));
    const box = el.querySelector(".wst-3dbox, .wst-est"); if (box && changed && !ctx.reduce) { box.classList.remove("wst-flash"); void box.offsetWidth; box.classList.add("wst-flash"); }
  }
  async function save() {
    if (!ctx.sess()) { // (a guest: kept on this device)
      spec = clampSpec(spec); const L = locals(), at = Date.now(), id = localId || "l" + at.toString(36);
      if (!localId && L.length >= 12) { ctx.toast(esc(T("you can keep 12 games — delete one first"))); return; }
      localId = id; setLocals([{ id, spec, at }, ...L.filter((x) => x.id !== id)]);
      ctx.toast("📱 " + esc(T("Saved on this device — sign in to keep it everywhere and publish"))); paint(); return;
    }
    spec = clampSpec(spec); busy = true; sv = { k: "saving" }; paint(); const r = await act({ action: "world-studio-save", spec, id: editId || undefined, ...(!editId && remixFrom ? { from: remixFrom } : {}) }); busy = false;
    if (!r || !r.ok) { sv = { k: "err" }; paint(); if (r) fail(r); return; }
    sv = { k: "ok", at: Date.now() };
    editId = r.j.game.id; remixFrom = ""; if (shared.some((g) => g.id === editId)) shared = shared.map((g) => (g.id === editId ? { ...r.j.game, shared: true } : g)); else mine = [r.j.game, ...mine.filter((g) => g.id !== editId)]; if (r.j.game.co) pen = r.j.game.co.pen; if (r.j.game.pub) upThumb(r.j.game); if (localId) { setLocals(locals().filter((x) => x.id !== localId)); localId = ""; } ctx.toast("💾 " + esc(T("Saved"))); paint();
  }
  async function publish(id) {
    const g = mine.find((x) => x.id === id), on = !(g && g.pub); const r = await act({ action: "world-studio-publish", id, on }); if (!r || !r.ok) return r && fail(r);
    mine = mine.map((x) => (x.id === id ? r.j.game : x)); links.delete(id); if (on) upThumb(r.j.game); ctx.toast(on ? "🚀 " + esc(T("On the Creator Arcade!")) + (myH && r.j.game.slug ? " · 🌐 /game/@" + esc(myH) + "/" + esc(r.j.game.slug) : myH === "" ? " · 🌐 " + esc(T("Pick a creator ID in My games for its own web page")) : "") : esc(T("Taken off the Creator Arcade"))); paint(); load();
    if (on) { ev("publish"); freshId = id; let first = false; try { first = !localStorage.getItem("arc.studio.pub1"); localStorage.setItem("arc.studio.pub1", "1"); } catch { /* not kept */ } launchFx(first); }
  }
  async function del(id) {
    if (!(await ask(T, T("Delete this game?"), { ok: T("Delete"), danger: true }))) return; const r = await act({ action: "world-studio-del", id }); if (!r || !r.ok) return r && fail(r);
    mine = mine.filter((x) => x.id !== id); if (editId === id) editId = ""; paint(); load();
  }
  async function like(id) { const r = await act({ action: "world-studio-like", id }); if (!r || !r.ok) return r && fail(r); arcade = arcade.map((g) => (g.id === id ? { ...g, likes: r.j.likes } : g)); ctx.toast(r.j.already ? esc(T("You liked it already")) : "♥ " + esc(T("Liked"))); paint(); }
  async function playChal(code) {
    let c = null; try { const r = await fetch("/api/social?world=studio-chal&c=" + encodeURIComponent(code), { cache: "no-store" }); if (r.ok) c = (await r.json()).chal; } catch { /* below */ }
    if (!c) { ctx.toast(esc(T("That challenge has ended — try the game anyway"))); return false; }
    ctx.toast("⚔️ " + esc(T("{n} challenges you — beat {s}! Their run is the ghost.", { n: c.name, s: c.score }))); return playId(c.id, { ghost: c.tr ? { name: c.name, score: c.score, tr: c.tr } : null, vs: c.score, vsBy: c.name });
  }
  async function playId(id, opt = {}) {
    let g = mine.find((x) => x.id === id && x.spec);
    if (!g) try { const r = await fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id), { cache: "no-store" }); if (r.ok) g = (await r.json()).game; } catch { /* below */ }
    if (!g || !g.spec) { ctx.toast(T("Couldn't open it — try again")); return; }
    run({ spec: clampSpec(g.spec), id, title: g.title, by: g.byName, ghost: opt.ghost || null, vs: opt.vs || 0, vsBy: opt.vsBy || "", ...(opt.onBack ? { onBack: opt.onBack } : {}) }); // (onBack: the web page's own way back, world-studio-web.js)
  }

  /// STU-A: a 1200×630 share card for a game (its level's picture, who made it, its numbers; the game's own link in the words)
  async function shareCard(id, score) {
    if (!ctx.share) return; let g = (gdata && gdata.id === id ? gdata : null) || arcade.find((x) => x.id === id) || mine.find((x) => x.id === id);
    if (!g || !(g.spec || g.s)) { try { const r = await fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id), { cache: "no-store" }); if (r.ok) g = (await r.json()).game; } catch { /* below */ } }
    if (!g) { ctx.toast(T("Couldn't open it — try again")); return; }
    const sp = g.spec || g.s, th = THEMES[g.theme || sp.theme] || THEMES.neon; let art = thumbs.get(thumbKey(g)) || "";
    if (!art && !ctx.saver) { try { if (!prev) prev = makePreview({ THREE, ver: ctx.ver || "", low: !!ctx.low }); art = prev ? prev.snap(clampSpec({ ...sp })) : ""; } catch { art = ""; } }
    const url = await webLink(id);
    ctx.share({ kind: "studio", tag: `${ICON[sp.tpl] || "🎮"} ${T((TEMPLATES[sp.tpl] || TEMPLATES.runner).name)} · ${T(th.name)}`, title: g.title || sp.title || "", sub: T("by {n}", { n: g.byName || "?" }),
      rows: [...(score != null ? [[T("My score"), String(score), "🏆"]] : []), [T("Plays"), String(g.plays || 0), "▶"], [T("Likes"), String(g.likes || 0), "♥"]], art: art || `/images/ui/studio/${TEMPLATES[sp.tpl] ? sp.tpl : "runner"}.webp`, cover: true, accent: hex(th.edge),
      text: `${score != null ? T("I scored {s} in", { s: score }) + " " : ""}"${g.title || sp.title}" — ${T("a game made in ARCIRCLE Studio")} 🎮 ${url}` });
  }
  // ---------------- Studio 4: the builder (world-studio-build.js) ----------------
  let builder = null;
  async function openBuilder() {
    const ar = spec.tpl === "arena" || spec.tpl === "rush", td = spec.tpl === "defense", jw = !!JUMPS[spec.tpl], bt = spec.tpl === "rhythm", rc = spec.tpl === "race"; if (spec.tpl === "survival") return; let M; try { M = await import(bt ? "./world-studio-rhythm.js" : rc ? "./world-studio-race.js" : jw ? "./world-studio-jbuild.js" : ar ? "./world-studio-arena.js" : td ? "./world-studio-tdbuild.js" : "./world-studio-build.js"); } catch (e) { console.warn("studio builder", e); ctx.toast(esc(T("Couldn't open it — try again"))); return; }
    // STB7: what you built is kept on this device as you go (every change, 1.5 s later), until Done — a slip of Back loses nothing
    const AK = "arc.studio.auto", who = editId || localId || "new"; let auto = null; try { auto = JSON.parse(localStorage.getItem(AK) || "null"); } catch { auto = null; }
    if (auto && auto.tpl === spec.tpl && auto.who === who && auto.b && JSON.stringify(auto.b) !== JSON.stringify(spec.build || null)) {
      const t = new Date(auto.at || Date.now()), hm = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      if (await ask(T, T("You have changes you didn't keep (from {t}). Bring them back?", { t: hm }), { ok: T("Bring them back"), cancel: T("Start fresh") })) { try { spec = clampSpec({ ...spec, build: auto.b }); } catch { /* the saved one stays */ } }
      else { try { localStorage.removeItem(AK); } catch { /* fine */ } } }
    if (!spec.build) spec = clampSpec({ ...spec, build: toBuild(spec) });
    if (el) el.hidden = true; let autoT = 0;
    builder = (bt ? M.createBeatBuilder : rc ? M.createRaceBuilder : jw ? M.createJumpBuilder : ar ? M.createArenaBuilder : td ? M.createTdBuilder : M.createBuilder)({ T, esc, toast: ctx.toast, spec,
      onDone: (b, sp) => { clearTimeout(autoT); try { localStorage.removeItem(AK); } catch { /* fine */ } spec = clampSpec({ ...spec, ...(sp ? { len: sp.len, coins: sp.coins } : {}), build: b }); lastTest = null; },
      onChange: (b) => { clearTimeout(autoT); autoT = setTimeout(() => { try { localStorage.setItem(AK, JSON.stringify({ tpl: spec.tpl, who, b, at: Date.now() })); } catch { /* full or private */ } }, 1500); },
      onClose: () => { builder = null; if (el) { el.hidden = false; step = 3; paint(); } },
      onTest: (sp, z) => { const bel = document.querySelector(".wsb"); if (bel) bel.hidden = true; run({ spec: sp, test: true, ...(ar ? { startT: z } : { startZ: z }), ...(jw ? { onEdit: (col) => { if (builder && builder.scrollTo) builder.scrollTo(col - 4); } } : {}), onBack: () => { if (bel) bel.hidden = false; if (el) el.hidden = true; } }); } });
    builder.open();
  }
  // ---------------- the runner ----------------
  async function run(o) {
    if (playing) return; const vw = el && !el.hidden; if (el) el.hidden = true; if (prev) prev.stop(); /* STB5: the preview rests while you play */
    if (o.spec.tpl === "puzzle") return playPuzzle(o, vw);
    const env = { ctx, THREE, T, esc, makeFx, makeGhost, result, back: (again, oo) => { playing = null; if (!again && oo.onBack) { oo.onBack(); return; } if (!again && el) { el.hidden = false; paint(); load(); } } }; // (the templates in modules of their own: S4d)
    try { playing = JUMPS[o.spec.tpl] ? await (await import("./world-studio-jump.js")).makeJump(o, { ...env, ouch }) : o.spec.tpl === "rhythm" ? await (await import("./world-studio-rhythm.js")).makeBeat(o, env) : o.spec.tpl === "race" ? await (await import("./world-studio-race.js")).makeRace(o, { ...env, ouch }) : o.spec.tpl === "survival" ? await makeSurvRun(o, env) : o.spec.tpl === "climb" ? await (await import("./world-studio-climb.js")).makeClimb(o, env) : o.spec.tpl === "defense" ? await (await import("./world-studio-defense.js")).makeDefense(o, env) : o.spec.tpl === "arena" || o.spec.tpl === "rush" ? await makeArena(o) : await makeRun(o); }
    catch (e) { console.warn("studio run", e); playing = null; ctx.st.solo(null); ctx.st.view(null); document.body.classList.remove("wp-studio"); ctx.toast(T("The game couldn't start") + " — " + esc(String((e && e.message) || e).slice(0, 60))); if (vw && el) el.hidden = false; }
  }
  /// SB-3 MONSTER SURVIVAL: SURVIVORS ARENA's own engine runs the maker's numbers (world-play.js lends it: ctx.survivors);
  /// the Studio shows the result over the town when the arena lets go
  async function makeSurvRun(o, env) {
    if (!ctx.survivors) throw new Error(T("The arena couldn't open"));
    const L = genLevel(o.spec), r = await ctx.survivors({ secs: L.secs, rate: L.rate, hp: L.hp, elite: L.elite, bossAt: L.bossAt, diff: L.diff });
    if (!r) throw new Error(T("The arena couldn't open"));
    const hud = document.createElement("div"); hud.className = "wst-hud wst-sv"; document.body.appendChild(hud); document.body.classList.add("wp-studio");
    const mm = (x) => Math.floor(x / 60) + ":" + String(x % 60).padStart(2, "0");
    const leave = (again) => { hud.remove(); document.body.classList.remove("wp-studio"); env.back(again, o); };
    result(o, hud, { trace: [], coins: Math.min(L.coins, r.kills), dist: Math.min(L.len, r.secs * 20), done: !!r.clear, line: `⏱ ${mm(r.secs)} / ${mm(L.secs)} · 💀 ${r.kills}${r.bosses ? " · 👑 " + r.bosses : ""}`, head: r.clear ? "🏆 " + T("You survived!") : "💀 " + T("Knocked out"), confetti: !!r.clear }, leave);
    return { isSurv: true, out: r, leave };
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
    const topM = std(th.track, { roughness: 0.7 }), floors = []; // (STU-B: the painted floor on top of each piece)
    for (const [a, b] of ends) { const len = a - z0; if (len > 0.5) { const m = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, len), trackM); m.position.set(0, -0.3, z0 + len / 2); scene.add(m);
      const tp = new THREE.Mesh(trackUV(new THREE.PlaneGeometry(W, len), W, len, 4), topM); tp.rotation.x = -Math.PI / 2; tp.position.set(0, 0.005, z0 + len / 2); scene.add(tp); floors.push(tp); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, len), edgeM); e.position.set((s * W) / 2, 0.04, z0 + len / 2); scene.add(e); } for (const x of [-1.1, 1.1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, len), laneM); l.position.set(x, 0.02, z0 + len / 2); scene.add(l); } } z0 = b; }
    const PN = Math.ceil((L.len + 160) / 14) * 2, pil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(th.prop, { emissive: th.prop, emissiveIntensity: 0.35 }), PN), mt = new THREE.Matrix4();
    const props = [], every = ctx.low ? 6 : 3; // (STU-B: every 3rd roadside slot gets the theme's Meshy piece, every 6th on low graphics; blocks in between)
    { let i = 0, k = 0, s0 = o.spec.seed; const r = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647); for (let z = -20; i < PN; z += 14) for (const s of [-1, 1]) { if (i >= PN) break; const h = 2 + r() * 9, x = s * (W / 2 + 2.5 + r() * 4), w0 = 1.2 + r(), d0 = 1.2 + r();
      if (k++ % every === 0) { props.push([x + s * 1.5, z, 5 + h * 0.6, r() * 6.28]); mt.makeScale(0, 0, 0); } else mt.compose(new THREE.Vector3(x, h / 2 - 0.6, z), new THREE.Quaternion(), new THREE.Vector3(w0, h, d0)); pil.setMatrixAt(i++, mt); } }
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
    scene.userData.live = true; dressRun(scene, o.spec.theme, { floors, walls: [wm, ...mwm], props, night: RU.has("night") });
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
    const hud = document.createElement("div"); hud.className = "wst-hud"; hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || o.spec.title)}</b><span class="wst-hp">❤️❤️❤️</span><span class="wst-hc">🪙 0</span><span class="wst-combo" hidden></span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div><p class="wst-hint">${esc(T(ctx.coarse ? "Stick ← → to switch lanes · ⤒ jump · ⤓ slide (or swipe)" : "← → switch lanes · ↑ / Space jump · ↓ slide"))}</p><div class="wst-speed" aria-hidden="true"></div>`;
    document.body.appendChild(hud);
    const S = { z: Math.max(0, Math.min(L.len - 40, o.startZ || 0)), x: 0, lane: 1, y: 0, vy: 0, slide: 0, hearts: (o.spec.rules || []).includes("onehp") ? 1 : 3, inv: 0, coins: 0, t: -3, done: false, over: false, clip: "", combo: 0, lastCoin: -9, slow: 0, nice: new Set(), tr: [] }; // (o.startZ: the editor's "test from here")
    const LV = o.live ? makeLive(scene, o, S, hud) : null; if (LV) { S.t = LV.t0(); hud.querySelector(".wst-cd").textContent = String(Math.max(1, Math.ceil(-S.t))); }
    const fx = makeFx(hud), pad = ctx.coarse ? makePad(hud, { mode: "lanes", T, onLane: (d) => lane(d), onJump: () => jump(), onSlide: () => slide() }) : null;
    const keys = (e) => { if (S.over) return; const k = e.key; if (k === "ArrowLeft" || k === "a" || k === "A") lane(-1); else if (k === "ArrowRight" || k === "d" || k === "D") lane(1); else if (k === "ArrowUp" || k === " " || k === "w" || k === "W") jump(); else if (k === "ArrowDown" || k === "s" || k === "S") slide(); else return; e.preventDefault(); };
    let tx = 0, ty = 0, tt = 0;
    const ts = (e) => { const p = e.changedTouches ? e.changedTouches[0] : e; tx = p.clientX; ty = p.clientY; tt = Date.now(); };
    const te = (e) => { if (e.target.closest && e.target.closest("button")) return; const p = e.changedTouches ? e.changedTouches[0] : e, dx = p.clientX - tx, dy = p.clientY - ty; if (Math.hypot(dx, dy) < 24) { if (Date.now() - tt < 400) jump(); return; } if (Math.abs(dx) > Math.abs(dy)) lane(dx > 0 ? 1 : -1); else if (dy < 0) jump(); else slide(); };
    addEventListener("keydown", keys, true); addEventListener("touchstart", ts, { passive: true }); addEventListener("touchend", te); const pu = (e) => { if (e.pointerType === "mouse") te(e); }; addEventListener("pointerdown", ts); addEventListener("pointerup", pu);
    const play = (c, once) => { if (!hero) return; try { hero.play(c, once ? { once: true } : {}); } catch { /* no clip */ } S.clip = once ? "" : c; };
    function lane(d) { if (S.t < 0) return; if (RU.has("mirror")) d = -d; S.lane = Math.max(0, Math.min(2, S.lane + d)); if (ctx.Snd && ctx.Snd.dash) try { ctx.Snd.dash(); } catch { /* no sound */ } }
    function jump() { if (S.t < 0 || S.y > 0.01) return; S.vy = RU.has("low") ? 7.4 : 8.6; S.slide = 0; play("jump", true); if (ctx.Snd && ctx.Snd.jump) try { ctx.Snd.jump(); } catch { /* no sound */ } }
    function slide() { if (S.t < 0) return; if (S.y > 0.01) S.vy = Math.min(S.vy, -10); S.slide = 0.7; play("dodge", true); }
    function hurt(why) { if (S.inv > 0 || S.over) return; S.hearts--; S.inv = 1.4; play(S.hearts > 0 ? "hit" : "die", true); if (ctx.Snd && ctx.Snd.hurt) try { ctx.Snd.hurt(); } catch { /* no sound */ } ouch(hud); paintHud(); if (S.hearts <= 0) end(false); if (why === "gap") { const g = gaps.find((x) => Math.abs(S.z - x) < GAP); S.y = 0; S.vy = 0; if (g != null) S.z = g + GAP / 2 + 0.6; } } // (back on its far side)
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
      if (gh) gh.at(Math.max(0, S.t), t); if (LV) LV.tick(dt, t);
      S.x += (LANES[S.lane] - S.x) * Math.min(1, dt * 12);
      me.position.set(S.x, S.y, S.z); me.visible = !(S.inv > 0 && ((t * 12) | 0) % 2);
      if (hero) hero.update(dt, t);
      // the coins near you turn (the rest stay where they are)
      coinRows.forEach((c, i) => { if (c.z < S.z - 4 || c.z > S.z + 70) return; q.setFromAxisAngle(up, t * 3 + i); mt.compose(pv.set(LANES[c.lane], got[i] ? -5 : 1.1, c.z), q.multiply(flip), sc); cm.setMatrixAt(i, mt); });
      cm.instanceMatrix.needsUpdate = true;
      for (const p of pops) if (p.t < 0.4) { p.t += dt; const k = p.t / 0.4; p.m.scale.setScalar(1 + k * 2.2); p.m.material.opacity = 1 - k; p.m.rotation.y += dt * 6; if (k >= 1) p.m.visible = false; }
      // STB4 (2026-10-27): the countdown flies down the track from high up and settles behind the runner by GO
      if (S.t < 0 && !ctx.reduce) { const k = Math.min(1, -S.t / 3), e = k * k * (3 - 2 * k), fz = S.z + 70 * e; cam.position.set(S.x * 0.6 + Math.sin(e * 2.2) * 6 * e, 4.3 + 16 * e, S.z - 7.6 + (fz - S.z) * 0.9); cam.lookAt(S.x * 0.8, 1.2, S.z + 9 * (1 - e)); }
      else { cam.position.set(S.x * 0.6, 4.3 + S.y * 0.4, S.z - 7.6); cam.lookAt(S.x * 0.8, 1.2 + S.y * 0.3, S.z + 9); }
      if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    }
    hud.querySelector(".wst-hx").addEventListener("click", () => leave());
    async function end(done) {
      if (S.over) return; S.over = true; S.done = done; if (pad) pad.hide(); play(done ? "emote-yes" : "die", true);
      fx.speed(0); if (LV) LV.end(done); if (!done && !dash) { deathMark(scene, S.x, S.z); await beat(hud); } // (STU-B: where it ended, a moment before the card)
      await result(o, hud, { live: LV, trace: S.tr, coins: S.coins, dist: S.z, done, line: dash ? `🪙 ${S.coins} · ${Math.round(S.z)} m` : `🪙 ${S.coins} / ${L.coins} · ${Math.round(S.z)} / ${Math.round(L.len)} m`, head: dash ? "♾️ " + T("{m} m!", { m: Math.round(S.z) }) : done ? "🏁 " + T("Finished!") : "💥 " + T("Out of hearts"), confetti: done || dash }, leave);
    }
    function leave(again) {
      removeEventListener("keydown", keys, true); removeEventListener("touchstart", ts); removeEventListener("touchend", te); removeEventListener("pointerdown", ts); removeEventListener("pointerup", pu);
      st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio"); if (LV) LV.stop(!S.over);
      if (hero) me.remove(hero.obj); // (the hero's materials are the kit's, shared: only what this run made is let go)
      scene.userData.live = false; scene.traverse((m) => { if (m.userData && m.userData.shared) return; if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });
      playing = null; if (!again && o.onBack) { o.onBack(); return; } if (!again && el) { el.hidden = false; paint(); load(); }
    }
    st.view(scene, cam); st.solo(tick); tick(0.016, 0); paintHud();
    return { S, leave, L, live: LV, ghost: () => (gh ? 1 : 0), clips: (all) => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((x) => x.isRunning() && (all || x.getEffectiveWeight() > 0.5)).map((x) => x.getClip().name) : []), jump, slide, lane };
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
  // ---------------- WS4 (2026-10-27, the owner: "1, 2번 진행하자"): the live race (api/_world-studio.mjs RACE) ----------------
  // a code for a Sky Runner / Infinity Dash game, 2–4 racers in a lobby card, the host starts it on the server's clock; in
  // the run each racer sends where they are every 0.7 s and sees the others as their heroes on the same track (in between
  // they glide on their last speed), a board of places on the HUD; the result card keeps the places until everyone is in
  let lobby = null; const RACE_TPLS = ["runner", "dash"];
  const myW = () => { const s = ctx.sess && ctx.sess(); return s ? String(s.wallet).toLowerCase() : ""; };
  const myC = () => String((ctx.myChar && ctx.myChar()) || "");
  const RCOL = ["#ff7ad9", "#7cf5c8", "#ffd23a", "#8fb5ff"];
  async function raceGet(code) { try { const r = await fetch("/api/social?world=studio-race&code=" + encodeURIComponent(code), { cache: "no-store" }); const j = await r.json().catch(() => ({})); return r.ok ? j.race : { err: j.error || "gone" }; } catch { return null; } }
  async function raceNew(id, from) { const r = await act({ action: "world-studio-race-new", id, c: myC(), ...(from ? { from } : {}) }); if (!r || !r.ok) return r && fail(r); raceLobby(r.j.race); }
  async function raceJoin(code) {
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (code.length !== 5) { ctx.toast(esc(T("A race code has 5 letters"))); return; }
    const r = await act({ action: "world-studio-race-join", code, c: myC() }); if (!r || !r.ok) return r && fail(r); raceLobby(r.j.race);
  }
  const raceLink = (code) => `${location.origin}${/^\/(studio|game)/.test(location.pathname) ? "/studio" : "/play"}?race=${code}`;
  function raceLobby(rc) {
    if (lobby) lobby.close(false); if (playing) return; const box = document.createElement("div"); box.className = "wst-rl"; document.body.appendChild(box);
    let cur = rc, off = rc.now - Date.now(), timer = 0, gone = false, joining = false;
    const close = (leave) => { gone = true; clearTimeout(timer); box.remove(); lobby = null; if (leave) act({ action: "world-studio-race-leave", code: cur.code }); };
    let drawn = "";
    const draw = () => { const me = myW(), host = cur.host === me, n = cur.players.length, key = JSON.stringify([cur.host, cur.players.map((p) => p.w + p.name)]); if (key === drawn) return; if (drawn) box.classList.add("shown"); drawn = key; /* (redrawn only when someone comes or goes; the card pops in once) */
      box.innerHTML = `<div class="wst-rlc"><small>🏁 ${esc(T("Live race"))}</small><h3>${esc(cur.title)}</h3>
        <div class="wst-rlcode"><span>${esc(T("Race code"))}</span><b>${esc(cur.code)}</b><button type="button" class="wst-go alt" data-rlcopy>🔗 ${esc(T("Copy link"))}</button></div>
        <ol class="wst-rlp">${[0, 1, 2, 3].map((i) => { const p = cur.players[i]; return p ? `<li class="${p.w === me ? "me" : ""}" style="--c:${RCOL[i]}"><i>${i + 1}</i><b>${esc(p.name)}${p.w === me ? ` <small>(${esc(T("you"))})</small>` : ""}</b>${p.w === cur.host ? "<em>👑</em>" : ""}</li>` : `<li class="empty"><i>${i + 1}</i><b>${esc(T("Waiting for a racer…"))}</b></li>`; }).join("")}</ol>
        <p class="wst-rlh">${esc(host ? (n < 2 ? T("Send the code to friends — start when someone joins") : T("Everyone here? Start the race!")) : T("Waiting for the host to start…"))}</p>
        <div class="wst-rla">${host ? `<button type="button" class="wst-go big" data-rlgo ${n < 2 ? "disabled" : ""}>🏁 ${esc(T("Start the race"))}</button>` : ""}<button type="button" class="wst-go alt" data-rlx>${esc(T("Leave"))}</button></div></div>`; };
    const go = async () => { if (gone) return; gone = true; clearTimeout(timer);
      let g = null; try { const r = await fetch("/api/social?world=studio-game&id=" + encodeURIComponent(cur.id), { cache: "no-store" }); if (r.ok) g = (await r.json()).game; } catch { /* below */ }
      box.remove(); lobby = null; if (!g || !g.spec) { ctx.toast(T("Couldn't open it — try again")); act({ action: "world-studio-race-leave", code: cur.code }); return; }
      run({ spec: clampSpec(g.spec), id: cur.id, title: g.title, by: g.byName, live: { code: cur.code, start: cur.start, off, players: cur.players, host: cur.host } }); };
    box.addEventListener("click", async (e) => { const t = e.target.closest("button"); if (!t) return;
      if (t.matches("[data-rlx]")) return close(true);
      if (t.matches("[data-rlcopy]")) { const u = raceLink(cur.code); try { await navigator.clipboard.writeText(u); ctx.toast("🔗 " + esc(T("Link copied — friends join with it"))); } catch { prompt(T("Copy link"), u); }
        if (navigator.share && ctx.coarse) navigator.share({ title: cur.title, text: T("Race me live in \"{t}\"! Code {c}", { t: cur.title, c: cur.code }), url: u }).catch(() => { /* closed */ }); return; }
      if (t.matches("[data-rlgo]")) { t.disabled = true; const r = await act({ action: "world-studio-race-start", code: cur.code }); if (!r || !r.ok) { t.disabled = false; return r && fail(r); } cur = r.j.race; off = cur.now - Date.now(); go(); } });
    const poll = async () => { if (gone) return; const r = await raceGet(cur.code); if (gone) return;
      if (r && r.err) { ctx.toast(esc(T("The race was closed"))); return close(false); }
      if (r) { cur = r; off = r.now - Date.now(); if (r.start) return go();
        if (!joining && !r.players.some((p) => p.w === myW())) { joining = true; const j = await act({ action: "world-studio-race-join", code: r.code, c: myC() }); joining = false; if (j && j.ok) cur = j.j.race; else if (j) { fail(j); return close(false); } } // (a seat lost to two joining at once comes back)
        draw(); }
      timer = setTimeout(poll, 1500); };
    draw(); timer = setTimeout(poll, 1500); lobby = { close }; ev("race");
  }
  function makeLive(scene, o, S, hud) {
    const lv = o.live, me = myW(), F = new Map(), fins = new Set(); let off = lv.off, cur = { players: lv.players }, busy2 = false, last = 0, stopped = false, myFin = 0;
    const board = document.createElement("ol"); board.className = "wst-rbd"; hud.appendChild(board);
    const sNow = () => Date.now() + off;
    function fig(p, i) { const g = new THREE.Group(), col = RCOL[i % 4];
      const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 10), new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.6, emissive: col, emissiveIntensity: 0.25 })); cap.position.y = 0.95; g.add(cap);
      try { const tag = ctx.K.label(String(p.name || "?").slice(0, 16), { accent: col, size: 0.5 }); tag.position.y = 2.5; g.add(tag); } catch { /* no tag */ }
      g.position.set(p.x, p.y, p.z); scene.add(g); const f = { g, cap, hero: null, clip: "", z: p.z, x: p.x, y: p.y, p, v: 0, pz: p.z, pat: p.at || 0 };
      if (p.c && ctx.makeHeroOf && !ctx.saver) ctx.makeHeroOf(p.c).then((h) => { if (!h || stopped) return; f.hero = h; g.add(h.obj); cap.visible = false; f.clip = ""; }).catch(() => { /* the capsule stays */ });
      return f; }
    function apply(rc) { if (!rc || rc.err) return; off = rc.now - Date.now(); cur = rc;
      rc.players.forEach((p, i) => { if (p.w === me) { if (p.fin) myFin = p.fin; return; } let f = F.get(p.w); if (!f) { f = fig(p, i); F.set(p.w, f); }
        if (p.at && p.at !== f.pat) { const dt2 = (p.at - f.pat) / 1000; if (f.pat && dt2 > 0.05) f.v = Math.max(0, Math.min(60, (p.z - f.pz) / dt2)); f.pz = p.z; f.pat = p.at; } f.p = p;
        if ((p.fin || p.out) && !fins.has(p.w)) { fins.add(p.w); if (p.fin) ctx.toast("🏁 " + esc(T("{n} crossed the line!", { n: p.name }))); } });
      paintBoard(); }
    const order = () => { const L2 = cur.players.map((p) => (p.w === me ? { ...p, z: S.over && (p.fin || p.out) ? p.z : S.z, fin: myFin || p.fin, out: p.out || (S.over && !S.done), you: true } : p));
      return L2.sort((a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : a.out !== b.out ? (a.out ? 1 : -1) : b.z - a.z)); };
    const mmss = (ms) => { const t2 = ms / 1000; return Math.floor(t2 / 60) + ":" + (t2 % 60).toFixed(1).padStart(4, "0"); };
    const row = (p, i, full) => `<li class="${p.you ? "me" : ""}${p.out ? " out" : ""}"><i>${full && p.fin && i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</i><b>${esc(p.you ? T("You") : p.name)}</b><em>${p.fin ? "🏁 " + mmss(p.fin) : p.out ? "💥 " + Math.round(p.z) + " m" : Math.round(p.z) + " m"}</em></li>`;
    function paintBoard() { board.innerHTML = order().map((p, i) => row(p, i, false)).join(""); }
    async function send(extra) { if (busy2 && !extra) return; busy2 = true; last = performance.now();
      const r = await act({ action: "world-studio-race-tick", code: lv.code, z: +S.z.toFixed(1), x: +S.x.toFixed(2), y: +S.y.toFixed(2), hp: Math.max(0, S.hearts), coins: S.coins, ...(extra || {}) }); busy2 = false; if (r && r.ok) apply(r.j.race); }
    paintBoard();
    return {
      t0: () => Math.max(-6, Math.min(-0.3, -(lv.start - sNow()) / 1000)),
      others: () => [...F.values()].map((f) => ({ name: f.p.name, c: f.p.c, z: f.z, x: f.x, hero: !!f.hero, vis: f.g.visible, clips: f.hero && f.hero.mixer ? f.hero.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name) : [] })), // (tests: the clip each racer's hero runs)
      tick(dt, t) {
        if (!stopped && S.t > -0.5 && !S.over && performance.now() - last > 700) send();
        const nowS = sNow();
        for (const f of F.values()) { const p = f.p, run2 = !p.fin && !p.out && nowS >= lv.start, tz = run2 ? p.z + f.v * Math.min(1.5, Math.max(0, (nowS - (p.at || nowS)) / 1000)) : p.z;
          f.z += (Math.max(f.z, tz) - f.z) * Math.min(1, dt * 6); f.x += (p.x - f.x) * Math.min(1, dt * 8); f.y += (p.y - f.y) * Math.min(1, dt * 10); f.g.position.set(f.x, f.y, f.z);
          if (f.hero) { const want = p.out ? "die" : p.fin ? "emote-yes" : run2 ? (p.y > 0.3 ? "jump" : "sprint") : "idle"; if (want !== f.clip && !f.hero.busy()) { try { f.hero.play(want, want === "die" || want === "emote-yes" || want === "jump" ? { once: true } : {}); } catch { /* no clip */ } f.clip = want; } f.hero.update(dt, t); } }
        if (((t * 4) | 0) !== ((((t - dt) * 4) | 0))) paintBoard();
      },
      end(done) { const fin = () => (busy2 ? setTimeout(fin, 80) : send(done ? { fin: 1 } : { out: 1 })); fin(); }, // (after a tick still on its way, so it can't land on top)
      stop(quit) { if (stopped) return; stopped = true; if (quit) act({ action: "world-studio-race-leave", code: lv.code }); for (const f of F.values()) if (f.hero) f.g.remove(f.hero.obj); },
      result(c, leave) { const box = c.querySelector("[data-rres]"), rm = c.querySelector("[data-rematch]"), host = lv.host === me; let n = 0, next = "";
        const draw = () => { const L2 = order(), k = L2.findIndex((p) => p.you), all = L2.every((p) => p.fin || p.out);
          box.innerHTML = `<b>${k === 0 && L2[0].fin ? "🏆 " + esc(T("You won the race!")) : all ? "🏁 " + esc(T("Race over — place {n}", { n: k + 1 })) : "⏳ " + esc(T("Waiting for the others…"))}</b><ol>${L2.map((p, i) => row(p, i, true)).join("")}</ol>`;
          if (rm) { rm.hidden = !(host || next); rm.textContent = next && !host ? "🏁 " + T("Join the rematch") : "🏁 " + T("Rematch"); }
          return all; };
        if (rm) rm.addEventListener("click", () => { leave(true); setTimeout(() => (next && !host ? raceJoin(next) : raceNew(o.id, lv.code)), 50); });
        draw(); const poll = async () => { if (!c.isConnected || n++ > 80) return; const r = await raceGet(lv.code); if (r && !r.err) { apply(r); if (r.next) next = r.next; } if (!c.isConnected) return; const all = draw(); if (!all || (!host && !next)) setTimeout(poll, 1500); };
        setTimeout(poll, 800); },
    };
  }
  /// the run's end: the score (sent when it's a published game and you're signed in), your best on this device, a card
  async function result(o, hud, r, leave) {
    const score = r.puzzle ? puzzleScore(r.puzzle.par, r.puzzle.count, Math.min(genLevel(o.spec).hints, r.puzzle.hints || 0)) : scoreOf(r.coins, r.dist, r.done); let res = null;
    if (o.id && !o.test && ctx.sess()) { const q = await act({ action: "world-studio-play", id: o.id, ...(r.puzzle ? { moves: r.puzzle.moves, hints: r.puzzle.hints || 0 } : { coins: r.coins, dist: Math.round(r.dist), done: r.done, trace: r.trace || [] }) }); if (q && q.ok) res = q.j; }
    let best = 0; const key = "arc.studio.best." + (o.id || "test:" + o.spec.tpl + ":" + o.spec.seed); try { best = Number(localStorage.getItem(key) || 0); if (score > best) localStorage.setItem(key, String(score)); } catch { /* not kept */ }
    const isBest = score > best && best > 0;
    lastRun = { score, coins: r.coins, dist: Math.round(r.dist), done: r.done, res, isBest };
    if (o.test) { lastTest = lastRun; ev("test"); }
    const c = document.createElement("div"); c.className = "wst-res"; c.innerHTML = `<div class="wst-rin">${isBest ? `<em class="wst-best">✨ ${esc(T("New best!"))}</em>` : ""}<small>${esc(o.title || o.spec.title)}</small><h3>${esc(r.head)}</h3><b class="wst-score">${score}</b>
      <p>${esc(r.line)}</p>${o.id && !o.test && !mine.some((x) => x.id === o.id) && !String(o.id).startsWith("goff") ? `<div class="wst-rate" data-rid="${esc(o.id)}"><small>${esc(T("How was it?"))}</small><span><button type="button" data-fun="1">👍 ${esc(T("Fun"))}</button><button type="button" data-fun="-1">👎 ${esc(T("Not for me"))}</button></span><span><button type="button" data-dif="0">${esc(T("Easy"))}</button><button type="button" data-dif="1">${esc(T("Just right"))}</button><button type="button" data-dif="2">${esc(T("Hard"))}</button></span></div>` : ""}${res ? `<p>${esc(T("Your best: {n}", { n: res.best }))}${res.place ? " · " + esc(T("#{n} on this game", { n: res.place })) : ""}</p>` : o.test ? `<p class="wst-fine">${esc(T("A test run isn't counted."))}</p>` : ""}
      ${o.vs ? `<p class="wst-vs ${score > o.vs ? "won" : ""}">${score > o.vs ? "🏆 " + esc(T("You beat {n}'s {s}!", { n: o.vsBy || "?", s: o.vs })) : "⚔️ " + esc(T("{n} scored {s} — {d} to go", { n: o.vsBy || "?", s: o.vs, d: o.vs - score + 1 }))}</p>` : ""}${res && res.ghost ? `<p class="wst-vs won">👻 ${esc(T("You're #1 — your run is the ghost to beat now"))}</p>` : ""}
      ${r.live ? `<div class="wst-rres" data-rres></div>` : ""}<span>${r.live ? `<button type="button" class="wst-go big" data-rematch hidden>🏁 ${esc(T("Rematch"))}</button>` : `<button type="button" class="wst-go big" data-again>↻ ${esc(T("Play again"))}${ctx.coarse ? "" : " <kbd>R</kbd>"}</button>`}<button type="button" class="wst-go alt" data-back>${esc(T(o.test ? "Back to the editor" : "Back"))}</button></span>
      ${o.id && !o.test ? `<span><button type="button" class="wst-go alt" data-chal>⚔️ ${esc(T("Challenge a friend"))}</button>${ctx.share ? `<button type="button" class="wst-go alt" data-rcard aria-label="${esc(T("Share card"))}">📸</button>` : ""}<button type="button" class="wst-go" data-nextg>${esc(T("Next game"))} ▶</button></span>` : ""}</div>`;
    hud.appendChild(c); if (r.confetti && !ctx.reduce) confetti(hud);
    // WS3 (2026-10-27): the score counts up, a new best lands as a stamp with a flash, R / Space plays again
    if (!ctx.reduce) { const sc = c.querySelector(".wst-score"), t0 = performance.now(), D = Math.min(1100, 400 + score * 2); const up = (now) => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3); sc.textContent = String(Math.round(score * e)); if (k < 1 && sc.isConnected) requestAnimationFrame(up); else { sc.textContent = String(score); sc.classList.add("done"); } }; sc.textContent = "0"; requestAnimationFrame(up);
      if (isBest) { const bs = c.querySelector(".wst-best"); if (bs) { bs.classList.add("stamp"); setTimeout(() => { const f = document.createElement("i"); f.className = "wst-flash"; hud.appendChild(f); setTimeout(() => f.remove(), 700); }, D * 0.9); } } }
    if (r.live) r.live.result(c, leave);
    const keyAgain = (e) => { if (!c.isConnected || !c.querySelector("[data-again]")) { removeEventListener("keydown", keyAgain); return; } if ((e.key === "r" || e.key === "R" || e.key === " ") && !e.target.closest("input,textarea")) { e.preventDefault(); removeEventListener("keydown", keyAgain); c.querySelector("[data-again]").click(); } };
    setTimeout(() => addEventListener("keydown", keyAgain), 450); /* (not the jump key still held from the run) */
    const ag = c.querySelector("[data-again]"); if (ag) ag.addEventListener("click", () => { removeEventListener("keydown", keyAgain); leave(true); setTimeout(() => run(o), 50); });
    c.querySelector("[data-back]").addEventListener("click", () => leave());
    const ch = c.querySelector("[data-chal]"); if (ch) ch.addEventListener("click", async () => { const me0 = (ctx.myName && ctx.myName()) || "", base = /^\/(studio|game)/.test(location.pathname) ? "/studio" : "/play"; let u = `${location.origin}${base}?sg=${encodeURIComponent(o.id)}&vs=${score}${me0 ? "&by=" + encodeURIComponent(me0) : ""}`;
      if (ctx.sess() && !r.puzzle && (r.trace || []).length > 1) { ch.disabled = true; const q = await act({ action: "world-studio-chal", id: o.id, coins: r.coins, dist: Math.round(r.dist), done: r.done, trace: r.trace }); ch.disabled = false; if (q && q.ok) u = `${location.origin}${base}?sg=${encodeURIComponent(o.id)}&ch=${q.j.code}`; } /* (WS5: your run comes along as the ghost they race) */ try { await navigator.clipboard.writeText(u); ctx.toast("⚔️ " + esc(T("Challenge link copied — can they beat {s}?", { s: score }))); } catch { prompt(T("Copy link"), u); } });
    const rc = c.querySelector("[data-rcard]"); if (rc) rc.addEventListener("click", () => shareCard(o.id, score));
    const rt = c.querySelector(".wst-rate"); if (rt) { const fb = {}; rt.addEventListener("click", async (e) => { const bt = e.target.closest("button"); if (!bt) return; if (bt.dataset.fun) fb.fun = Number(bt.dataset.fun); if (bt.dataset.dif) fb.dif = Number(bt.dataset.dif); bt.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === bt));
      if (fb.fun != null && fb.dif != null && !fb.sent) { fb.sent = true; if (ctx.sess()) await act({ action: "world-studio-rate", id: rt.dataset.rid, fun: fb.fun, dif: fb.dif }); rt.classList.add("done"); rt.querySelector("small").textContent = T("Thanks — the maker sees it"); ev("rate"); } }); }
    const nx = c.querySelector("[data-nextg]"); if (nx) nx.addEventListener("click", async () => { if (!arcade.length) await load(); const L2 = arcade.filter((g) => g.id !== o.id); if (!L2.length) { ctx.toast(esc(T("That's every game on the arcade for now"))); return; } const seen = nextSeen.add(o.id), pick = L2.find((g) => !seen.has(g.id)) || L2[0]; leave(true); setTimeout(() => playId(pick.id), 50); });
  }
  /// STU-B: a run dressed in its theme's Meshy look once it's in (the drawn colours until then; nothing breaks without it)
  function dressRun(scene, theme, o) {
    themeLook(THREE, theme, { ver: ctx.ver || "", low: !!(ctx.low || ctx.coarse), loader: ctx.K && ctx.K.gltfLoader }).then((lk) => {
      if (!scene.parent && !scene.userData.live) return; // (the run already left)
      if (lk.sky && !o.night) scene.background = lk.sky;
      if (lk.track) for (const m of o.floors || []) { m.material.map = lk.track; m.material.color.set(0xffffff); m.material.needsUpdate = true; }
      if (lk.wall) for (const m of o.walls || []) { m.material.map = lk.wall; m.material.color.lerp(new THREE.Color(0xffffff), 0.55); m.material.needsUpdate = true; }
      if (lk.prop && o.props && o.props.length) { const im = new THREE.InstancedMesh(lk.prop.geo, lk.prop.mat, o.props.length), mt2 = new THREE.Matrix4(), q2 = new THREE.Quaternion();
        o.props.forEach(([x, z, h, ry], i) => { q2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); mt2.compose(new THREE.Vector3(x, -0.6, z), q2, new THREE.Vector3(h, h, h)); im.setMatrixAt(i, mt2); });
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.userData.shared = true; im.frustumCulled = false; scene.add(im); if (o.onProps) o.onProps(); }
    }).catch(() => { /* the drawn look stays */ });
  }
  /// STU-B: a heart lost — the screen's edge flashes red; a run lost — a red mark where it ended, then a moment's pause
  function ouch(hud) { if (ctx.reduce) return; hud.classList.remove("ouch"); void hud.offsetWidth; hud.classList.add("ouch"); }
  function deathMark(scene, x, z) { try { const g = new THREE.Group(); const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, 5, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false })); beam.position.y = 2.5; g.add(beam);
    try { const tag = ctx.K.label("💥 " + T("Here"), { accent: "#ff3355", size: 0.55 }); tag.position.y = 5.4; g.add(tag); } catch { /* no tag */ } g.position.set(x, 0, z); scene.add(g); } catch { /* no mark */ } }
  const beat = (hud) => new Promise((ok) => { if (ctx.reduce) return ok(); hud.classList.add("lost"); setTimeout(() => { hud.classList.remove("lost"); ok(); }, 800); });
  /// STU-B: a game goes on the arcade — a rocket takes it up; the first time ever, a bigger card
  function launchFx(first) {
    if (ctx.reduce) return; const w = document.createElement("div"); w.className = "wst-launch" + (first ? " first" : "");
    w.innerHTML = `<i>🚀</i>${first ? `<div><b>${esc(T("Your first game is live!"))}</b><small>${esc(T("Share the link — every play and like counts."))}</small></div>` : `<div class="wst-live"><b>${esc(T("Live in the Creator Arcade!"))}</b></div>`}`; document.body.appendChild(w); if (first) confetti(w); setTimeout(() => w.remove(), first ? 3200 : 1600);
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
    const ftop = new THREE.Mesh(trackUV(new THREE.CircleGeometry(R, 64), R * 2, R * 2, 5), std(th.track, { roughness: 0.7 })); ftop.rotation.x = -Math.PI / 2; ftop.position.y = 0.006; scene.add(ftop); // (STU-B)
    for (const [r, w, op] of [[R, 0.14, 1], [R * 0.66, 0.05, 0.5], [R * 0.33, 0.05, 0.5]]) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 96), glow(th.edge, op)); m.rotation.x = Math.PI / 2; m.position.y = 0.03; scene.add(m); }
    const ringBoxes = [], ringProps = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, h = 1.5 + (i % 3); const p = new THREE.Mesh(new THREE.BoxGeometry(1, h, 1), std(th.prop, { emissive: th.prop, emissiveIntensity: 0.35 })); p.position.set(Math.cos(a) * (R + 2.2), h / 2 - 0.6, Math.sin(a) * (R + 2.2)); scene.add(p); ringBoxes.push(p); ringProps.push([Math.cos(a) * (R + 3), Math.sin(a) * (R + 3), 2.2 + (i % 3) * 0.6, -a]); }
    scene.userData.live = true; dressRun(scene, o.spec.theme, { floors: [ftop], props: ringProps, onProps: () => ringBoxes.forEach((b) => { b.visible = false; }) });
    // S4c: the maker's pillars — you can't walk through them, and a drone that hits one is gone
    const pil = A.pillars || []; if (pil.length) { const pG = new THREE.CylinderGeometry(1, 1.1, 2.6, 20), pM = std(th.wall, { emissive: th.wall, emissiveIntensity: 0.25 }), capM = glow(th.edge, 0.9); for (const q of pil) { const m = new THREE.Mesh(pG, pM); m.position.set(q.x, 1.3, q.z); scene.add(m); const cap = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.06, 6, 28), capM); cap.rotation.x = Math.PI / 2; cap.position.set(q.x, 2.62, q.z); scene.add(cap); } }
    // the hero and its walk
    let hero = null; try { hero = await ctx.makeHero(); } catch (e) { console.warn("studio hero", e); }
    const me = new THREE.Group(); scene.add(me); if (hero) { me.add(hero.obj); try { hero.play("idle"); } catch { /* no clip */ } } else { const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 10), std(0xeef4fb)); cap.position.y = 0.9; me.add(cap); }
    document.body.classList.add("wp-studio");
    const hud = document.createElement("div"); hud.className = "wst-hud"; hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || o.spec.title)}</b><span class="wst-hp">❤️❤️❤️</span><span class="wst-hc">🪙 0</span><span class="wst-combo" hidden></span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div><p class="wst-hint">${esc(T(o.spec.tpl === "rush" ? (ctx.coarse ? "Move with the stick · grab every coin" : "WASD / arrows to move · grab every coin") : ctx.coarse ? "Move with the stick · dodge the drones" : "WASD / arrows to move · dodge the drones"))}</p><div class="wst-speed" aria-hidden="true"></div>`;
    document.body.appendChild(hud);
    const off = Math.max(0, Math.min(A.secs - 5, o.startT || 0)), fx = makeFx(hud), S = { x: 0, z: 0, hearts: (o.spec.rules || []).includes("onehp") ? 1 : 3, inv: 0, coins: 0, t: -3, over: false, clip: "", face: 0, combo: 0, lastCoin: -9, tr: [] }, gh = makeGhost(scene, o.ghost, true), pad = ctx.coarse ? makePad(hud, { mode: "stick", T }) : null;
    const keyOn = new Set(), kd = (e) => { const k = e.key.toLowerCase(); if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"].includes(k)) { keyOn.add(k); e.preventDefault(); } }, ku = (e) => keyOn.delete(e.key.toLowerCase());
    let drag = null; const pd = (e) => { if (e.target.closest && e.target.closest("button")) return; drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; }, pm = (e) => { if (drag) { drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y; } }, pu = () => { drag = null; };
    addEventListener("keydown", kd, true); addEventListener("keyup", ku, true); addEventListener("pointerdown", pd); addEventListener("pointermove", pm); addEventListener("pointerup", pu); addEventListener("pointercancel", pu);
    const play = (c, opt) => { if (!hero) return; try { hero.play(c, opt || {}); } catch { /* no clip */ } S.clip = opt && opt.once ? "" : c; }; /* (after a one-shot the move clip is asked for again) */
    // drones, sweeps and coins, made as their time comes
    const dG = new THREE.SphereGeometry(0.55, 16, 12), bG = new THREE.SphereGeometry(1.1, 18, 14), ringG = new THREE.TorusGeometry(0.8, 0.07, 6, 24), dM = std(th.wall, { emissive: th.wall, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.25 }), bM = std(0xffb02e, { emissive: 0xff7a1a, emissiveIntensity: 0.6 }), rM = glow(th.edge, 0.8);
    const drones = [], sweeps = [], coins = []; let wi = 0, ci = 0;
    const cM = std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 }), cG = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18);
    const paintHud = () => { hud.querySelector(".wst-hp").textContent = "❤️".repeat(Math.max(0, S.hearts)) + "🖤".repeat(Math.max(0, ((o.spec.rules || []).includes("onehp") ? 1 : 3) - Math.max(0, S.hearts))); hud.querySelector(".wst-hc").textContent = `🪙 ${S.coins} · ${Math.max(0, Math.ceil(A.secs - Math.max(0, S.t)))}s`; hud.querySelector(".wst-bar em").style.width = Math.min(100, (Math.max(0, S.t) / A.secs) * 100).toFixed(1) + "%"; };
    function hurt() { if (S.inv > 0 || S.over) return; S.hearts--; S.inv = 1.3; play(S.hearts > 0 ? "hit" : "die", { once: true }); if (ctx.Snd && ctx.Snd.hurt) try { ctx.Snd.hurt(); } catch { /* no sound */ } ouch(hud); paintHud(); if (S.hearts <= 0) end(false); }
    const mv = new THREE.Vector3();
    function tick(dt, t) {
      dt = Math.min(dt, 0.05);
      if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; if (S.t >= 0 && off) { S.t = off; while (wi < A.waves.length && A.waves[wi].t < off) wi++; while (ci < A.coinsAt.length && A.coinsAt[ci].t < off - 8) ci++; } const n1 = Math.ceil(-Math.min(0, S.t)); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) setTimeout(() => cd.remove(), 700); } }
      else if (!S.over) {
        S.t += dt; S.inv = Math.max(0, S.inv - dt);
        // moving: keys or a drag; the camera's up is −z
        let ix = (keyOn.has("arrowright") || keyOn.has("d") ? 1 : 0) - (keyOn.has("arrowleft") || keyOn.has("a") ? 1 : 0), iz = (keyOn.has("arrowdown") || keyOn.has("s") ? 1 : 0) - (keyOn.has("arrowup") || keyOn.has("w") ? 1 : 0);
        if (drag && Math.hypot(drag.dx, drag.dy) > 8) { const l = Math.hypot(drag.dx, drag.dy); ix = drag.dx / l * Math.min(1, l / 60); iz = drag.dy / l * Math.min(1, l / 60); }
        if (pad && pad.on) { ix = pad.x; iz = pad.y; } // (phones: the stick)
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
    async function end(done) { if (S.over) return; S.over = true; if (pad) pad.hide(); play(done ? "emote-yes" : "die", { once: true }); const secs = Math.min(A.secs, Math.max(0, S.t)); if (!done) { deathMark(scene, S.x, S.z); await beat(hud); }
      await result(o, hud, { trace: S.tr, coins: S.coins, dist: secs * 20, done, line: `🪙 ${S.coins} / ${A.coins} · ${Math.round(secs)} / ${A.secs} s`, head: done ? (o.spec.tpl === "rush" ? "💰 " + T("Time's up — {n} coins!", { n: S.coins }) : "🛸 " + T("You lasted!")) : "💥 " + T("Out of hearts"), confetti: done }, leave); }
    function leave(again) {
      removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); removeEventListener("pointerdown", pd); removeEventListener("pointermove", pm); removeEventListener("pointerup", pu); removeEventListener("pointercancel", pu);
      st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio");
      if (hero) me.remove(hero.obj);
      scene.userData.live = false; scene.traverse((m) => { if (m.userData && m.userData.shared) return; if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });
      playing = null; if (!again && o.onBack) { o.onBack(); return; } if (!again && el) { el.hidden = false; paint(); load(); }
    }
    st.view(scene, cam); st.solo(tick); tick(0.016, 0); paintHud();
    return { S, leave, A, ghost: () => (gh ? 1 : 0), clips: (all) => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((x) => x.isRunning() && (all || x.getEffectiveWeight() > 0.5)).map((x) => x.getClip().name) : []), move: (x, z) => { keyOn.clear(); if (x > 0) keyOn.add("d"); if (x < 0) keyOn.add("a"); if (z > 0) keyOn.add("s"); if (z < 0) keyOn.add("w"); } };
  }
  const creator = () => ({ games: mine.length, pub: mine.filter((x) => x.pub).length, plays: mine.reduce((n, x) => n + (x.plays || 0), 0), likes: mine.reduce((n, x) => n + (x.likes || 0), 0), signed: !!ctx.sess() });
  /// one step back (a phone's Back, the × on a wide window): out of a run's result or the run, out of a builder, a step or
  /// a game's page back, then the window closes — true when something went back
  function back() {
    const vis = (q) => [...document.querySelectorAll(q)].find((e) => e.getClientRects().length);
    const b = vis(".wst-res [data-back]") || vis(".wst-hud .wst-hx") || vis(".wsb-h [data-close]");
    if (b) { b.click(); return true; }
    if (!el || el.hidden) return false;
    if (tab === "game") { tab = "arcade"; paint(); return true; }
    if (tab === "make" && step > 1) { step = step >= 4 ? 3 : 1; paint(); return true; }
    close(); return true;
  }
  return { back, creator, load: () => load(), arcadeList: () => arcade, open, close, shown, playId, remixId, raceJoin: (c) => raceJoin(c), raceNew: (id) => raceNew(id), playChal: (c) => playChal(c), feedNew: () => feedNew(), builder: () => builder, openBuilder: () => openBuilder(), step: (n) => { step = n; if (el && !el.hidden) paint(); }, playing: () => playing, last: () => lastRun, spec: () => spec, set: (s) => { spec = clampSpec(s); if (el && !el.hidden) paint(); } };
}
