// world-play.js — ARCIRCLE World (/play): an open little planet you walk as your own character. Every shop opens
// the real tool, Coin City is built from the real ArcPad coins, a rocket leaves the Launchpad when one launches, the
// Burn Furnace flares on a real $ARCIRCLE burn, the Exchange board shows the live price, the Quantum Lab shows the
// launches in superposition, and the sky follows US Eastern time (day and night) and the market's mood.
//
// It opens in space on the round planet and dives through the clouds onto flat ground: the same districts, unrolled
// around the plaza. How it moves: the player stays at the origin and the world slides under them (so the shadow box,
// the sky and the rain stay put). Movement is camera-relative and slides along walls; the camera orbits freely,
// drifts back behind the player and fades out a building that stands in the way.
// Shops open the real page inside the world (an iframe of the same site; arc-nav.js "in-world" hides its chrome).
// The game never signs a transaction: every one is the page's own, confirmed in the player's wallet.
//
// Accounts: "Sign in with wallet" is a free personal_sign (api/_world.mjs). With it, progress is saved to the wallet
// on the server; without it (guest), progress stays in this browser (localStorage "arc.world"). Settings live in
// "arc.world.set". Who's online and how many have visited come from the same API (heartbeat every 50 s).
// Who may enter Game World follows world-lock.js PHASE (the open beta: everyone); the Platform World stays open.
// a computer showing the game in a smaller window or as a phone (play.html, b416): this page is only the frame around it
if (window.__arcShell) await new Promise(() => {});
if (!window.arcWorldLock || !window.arcWorldLock.ok()) {
  document.getElementById("wp-loading").hidden = true;
  if (window.arcWorldLock) await window.arcWorldLock.ask({ cancelHref: "/?skip" });
  else { (window.__arcFrame ? window.top : window).location.replace("/?skip"); await new Promise(() => {}); }
  document.getElementById("wp-loading").hidden = false;
}
import { WORDS } from "./world-words.js";
const VER = new URL(import.meta.url).search;
// the game's modules (world-all.js): one file in the build, side by side from the source folder
const [K, IS, SHOP, STYLE, HELP, FIGHT, RPG, ZN, QST, SOC, ARCBOT, INBOX, RACE, WARD, DECOR, VFX, GEAR, LOOK, LIFE, WX, MUS, POST, ENV, PART, ICONS, L3D, AMB, HW, DIAG, LIVE, HOL, TRK, CREW, VILL, SFX, PET, CHAT, GV, MV, JG, LANDM, PV, LD, SHUB, SPAD] = (await import("./world-all.js")).default;
const { THREE } = K;
// height fog: the fog settles low and thins with height, so the ground fades into the distance while hills, the
// mountains and tall buildings keep their outline (it used to wash the whole horizon white). Patched into three.js's
// own fog chunks once, before anything compiles; the height comes from mvPosition, so every shader with fog has it.
{ const C = THREE.ShaderChunk;
  if (!/vFogH/.test(C.fog_vertex)) {
    C.fog_pars_vertex = C.fog_pars_vertex.replace("varying float vFogDepth;", "varying float vFogDepth; varying float vFogH;");
    C.fog_vertex = C.fog_vertex.replace("vFogDepth = - mvPosition.z;", "vFogDepth = - mvPosition.z; vFogH = (transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz)).y;");
    C.fog_pars_fragment = C.fog_pars_fragment.replace("varying float vFogDepth;", "varying float vFogDepth; varying float vFogH;");
    C.fog_fragment = C.fog_fragment.replace("gl_FragColor.rgb = mix(", "fogFactor *= 1.0 - 0.5 * smoothstep( 4.0, 60.0, vFogH );\n\tgl_FragColor.rgb = mix(");
  } }
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let land = null; // ARCIRCLE LAND (world-land.js), made once the island is
let jurGame = null, jurOn = false, jurBusy = false; // Jurassic World (openJurassic): GM wallets only for now
let mineGame = null, mineOn = false, mineBusy = false, mineRest = 0; // the ARCL Mine (openMine): up here, read early by the diagnostics and the prompt
// less motion: the device's own setting, or the switch in Settings (arc.world.set → motion: "less")
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || (() => { try { return JSON.parse(localStorage.getItem("arc.world.set") || "{}").motion === "less"; } catch { return false; } })();
if (reduce) document.documentElement.classList.add("wp-less");
const coarse = matchMedia("(pointer: coarse)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lc = (a) => String(a || "").toLowerCase();
const hex = (c) => "#" + c.toString(16).padStart(6, "0");
// the loading screen: the bar, the step it is on, and a little planet whose town rises as each step finishes
// (world-loading3d.js)
const load3d = (() => { try { const h = $("wp-loading"); if (!h || !K.webglOk || !K.webglOk()) return null; const l = L3D.loadingScene(THREE, h, { reduce }); if (l) h.classList.add("has-3d"); return l; } catch { return null; } })();
// (b-st1: the last fifth has steps of its own, named — the bar said "Ready" at 100% while the town was still being
// dressed and the effects warmed, up to ~18 s on a phone)
const FAR_PREBUILD = false; let loadAt = "0%", cxBonus = null, cxTitles = []; /* (cxBonus / cxTitles: the item codex, world-codex.js) */ const loadbar = (k, say) => { loadAt = Math.round(k * 100) + "%" + (say ? " " + say : ""); const b = $("wp-loadbar"); if (b) b.style.width = Math.round(k * 100) + "%"; const n = $("wp-loadpct"); if (n) n.textContent = Math.round(k * 100) + "%";
  if (load3d) load3d.set(k); const sp = document.querySelector("#wp-loading > span"); if (sp) sp.textContent = say || (k >= 1 ? T("Ready") : k >= 0.75 ? T("Calling in the scammers…") : k >= 0.35 ? T("Raising the town…") : T("Building the planet…")); };
const usd = (v) => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Math.round(v).toLocaleString("en-US");

// ---------------- language: the site's dictionaries (i18n.js); templates are translated, then filled ----------------
const LANG = (() => { try { const l = (window.arcI18n && window.arcI18n.get()) || localStorage.getItem("arcircle.lang") || "en"; return l === "ko" || l === "zh" || l === "tr" ? l : "en"; } catch { return "en"; } })();
if (LANG !== "en") for (let i = 0; i < 30 && !(window.__arcDict && window.__arcDict[LANG]); i++) await sleep(100);
const T = (s, v) => { let t = (LANG !== "en" && window.arcI18n && window.arcI18n.translate(s, LANG)) || s; if (v) for (const k in v) t = t.split("{" + k + "}").join(v[k]); return t; };
// single words stay out of the site-wide dictionary (they'd change other pages): a small map just for the game
// (the game's words live in world-words.js: WORDS)
const W = (w) => (WORDS[LANG] && WORDS[LANG][w]) || w;
// for the newer modules: a single word from WORDS, anything longer from the site dictionary
const TW = (s, v) => (WORDS[LANG] && WORDS[LANG][s] != null ? (v ? WORDS[LANG][s].replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : WORDS[LANG][s]) : T(s, v));
/// the opening week's launch card (24 – 31 Oct, Seoul): on every visit, for everyone (guests and agent owners too), on top of
/// everything, the moment the loading screen is done and you're in the town (not over the loading screen: the owner, 2026-10-24).
/// "Go to the AD Tower" pressed before the town is ready waits for it (adpGo).
const AD_PROMO_END = Date.parse("2026-10-31T15:00:00Z");
let adpDone = false, adpGo = false;
const adpReady = () => { try { const l = document.getElementById("wp-loading"), mk = document.getElementById("wp-make"); return (!l || l.classList.contains("done")) /* (it is removed once it fades) */ && mode === "hub" && !introOn && !(mk && !mk.hidden) && !!(typeof P !== "undefined" && P && P.name) /* (not over the character maker: a first visit saw it before making a hero — the funnel lost half there, 2026-10-25; it shows once Go is pressed) */; } catch { return false; /* (still loading) */ } };
function adPromo(force) {
  if ((adpDone && !force) || Date.now() > AD_PROMO_END || document.querySelector(".wp-adp")) return;
  adpDone = true;
  const el = document.createElement("div"); el.className = "wp-adp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", TW("AGENT DIMENSION is open!"));
  el.innerHTML = `<div class="wp-adp-in"><button type="button" class="wp-adp-x" data-later aria-label="${esc(T("Close"))}">×</button>
    <button type="button" class="wp-adp-art" data-go><img src="/images/ad/agent-launch.webp?v=1" srcset="/images/ad/agent-launch-640.webp?v=1 640w, /images/ad/agent-launch.webp?v=1 1100w" sizes="(max-width: 600px) 92vw, 540px" width="1100" height="733" alt="${esc(TW("Choose your AI agent — 100,000 $ARCIRCLE, 50% off"))}"></button>
    <p>${esc(TW("AGENT DIMENSION is open! Pick AURORA, ORION or VEX — 50% of the price is burned, 50% goes to the treasury."))}</p>
    <span><button type="button" class="wp-adp-go" data-go>🚀 ${esc(TW("Go to the AD Tower"))}</button><button type="button" class="wp-adp-later" data-later>${esc(TW("Later"))}</button></span></div>`;
  let was = null; try { was = frozen; frozen = true; keys.clear(); near = null; paintPrompt(); } catch { /* the town isn't up yet */ }
  document.body.appendChild(el); try { if (Snd.click) Snd.click(); } catch { /* no sound */ }
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 220); if (was !== null) try { frozen = was && !!document.querySelector("#wp-make:not([hidden]),.wp-qs"); } catch { /* fine */ } };
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-later]")) return close(); if (e.target.closest("[data-go]")) { close(); if (adpReady()) goAgentTower(); else { adpGo = true; try { toast(TW("Taking you to the AD Tower as soon as the town is ready…")); } catch { /* the toast comes later */ } } } });
}
document.querySelectorAll("[data-w]").forEach((el) => { el.textContent = W(el.dataset.w); });
if (LANG !== "en") { const k = $("wp-keys"); if (k) k.innerHTML = `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ${W("move")} <span>·</span> <kbd>Space</kbd> ${W("jump")} <span>·</span> <kbd>Shift</kbd> ${W("run")} <span>·</span> <kbd>E</kbd> ${W("enter")} <span>·</span> <kbd>F</kbd> ${W("board")} <span>·</span> <kbd>1</kbd><kbd>2</kbd> ${W("emote")} <span>·</span> <kbd>P</kbd> ${W("photo")} <span>·</span> <kbd>M</kbd> ${W("map")} <span>·</span> <kbd>H</kbd> ${W("help")} <span>·</span> ${W("drag to look")}`; }
K.SHOPS.forEach((s) => { s.name = T(s.name); s.line = T(s.line); });
K.DISTRICTS.forEach((d) => { d.name = T(d.name); });
K.SCAMMERS.forEach((s) => { s.name = T(s.name); s.sign = T(s.sign); });

// ---------------- progress and settings ----------------
const SAVE = "arc.world", SETS = "arc.world.set", SESS = "arc.world.sess", VID = "arc.world.vid";
const blank = () => ({ xp: 0, visited: [], beaten: [], cards: [], quests: [], badges: [], char: "", name: "", daily: null, tut: 0, authSeen: false });
const P = (() => { try { return { ...blank(), ...JSON.parse(localStorage.getItem(SAVE) || "{}") }; } catch { return blank(); } })();
if (P.tutBits == null) P.tutBits = (1 << Math.min(3, P.tut | 0)) - 1;
// a fresh start (world-lock.js EPOCH, api/_world-phase.mjs): progress from an earlier test stays behind — level, XP,
// gear, quests, the island's numbers, the ARCL queue. The name, the character, the outfit, settings and friends stay.
const EPOCH = (window.arcWorldLock && window.arcWorldLock.epoch) || 1;
if ((P.ep || 1) !== EPOCH) {
  const friends = P.rpg && P.rpg.x && Array.isArray(P.rpg.x.friends) ? P.rpg.x.friends : null;
  for (const k of ["xp", "xpv", "visited", "beaten", "cards", "quests", "badges", "daily", "rpg", "isle", "vill"]) delete P[k];
  Object.assign(P, { xp: 0, visited: [], beaten: [], cards: [], quests: [], badges: [], daily: null, ...(friends ? { rpg: { x: { friends } } } : {}) });
  for (const k of ["isle", "sold", "ko", "boss", "arclq", "fishwk"]) { try { localStorage.removeItem("arc.world." + k); } catch { /* private */ } }
  P.ep = EPOCH; try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ }
}
P.ep = EPOCH;
const S = (() => { const d = { quality: "auto", sound: true, sens: 1 }; try { return { ...d, ...JSON.parse(localStorage.getItem(SETS) || "{}") }; } catch { return d; } })();
let cloudT = 0;
// the save goes to this browser at most every 1.5 s (a whole save on every knock-out and pickup was a hitch), and
// right away when the page is hidden or closed
let lsT = 0;
const writeLocal = () => { clearTimeout(lsT); lsT = 0; try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private window */ } };
const save = () => { if (!lsT) lsT = setTimeout(writeLocal, 1500); clearTimeout(cloudT); cloudT = setTimeout(cloudSave, 6000); };
addEventListener("pagehide", () => { if (lsT) writeLocal(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && lsT) writeLocal(); });
// a network poller that skips its ticks while the tab is hidden and runs once (staggered) when it comes back
const pollers = [];
const every = (ms, fn) => { const p = { fn, due: false }; pollers.push(p); const run = () => { if (document.hidden) { p.due = true; return; } fn(); }; if (ms >= 10000) setTimeout(() => { run(); setInterval(run, ms); }, Math.round(Math.random() * ms)); else setInterval(run, ms); }; /* (the long ones start at a random point of their period: they used to fire in the same frame every minute) */
document.addEventListener("visibilitychange", () => { if (document.hidden) return; let k = 0; for (const p of pollers) if (p.due) { p.due = false; setTimeout(p.fn, 300 * k++); } });
const saveSet = () => { try { localStorage.setItem(SETS, JSON.stringify(S)); } catch { /* private window */ } };
// the level from XP on a rising curve (world-rpg-data.js); a save from the old 100-a-level curve is converted once,
// keeping its level
if (P.xpv !== RPG.XP_VERSION) { P.xp = RPG.xpFromOld(P.xp); P.xpv = RPG.XP_VERSION; try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ } }
let lvMemo = [-1, 1];
const level = () => { if (lvMemo[0] !== P.xp) lvMemo = [P.xp, RPG.levelOfXp(P.xp)]; return lvMemo[1]; };
let xpBoostUntil = 0; // the Starter Package's 2× EXP (worldOwn.xpBoostUntil, b414)
let xp3Until = 0; // a launch potion's 3× EXP (worldOwn.xp3Until, b453: api/_world-launch.mjs)
let petXpPct = 0, petLuck = 0; // the pet's Scholar (+% XP) and Lucky (gear drop) numbers, set by world-pet.js through onMods
let xpHeld = false; // window.arcWorld.holdXp(true): screenshots and tests keep the level where it is
// the village blessing (world-village.js): +2% XP and +1% max HP for each village level after the first
const bless = () => { const v = P.vill, s = sess(); return (v && s && v.w === lc(s.wallet) && v.blessing) || { xp: 0, hp: 0 }; };
// weekend 2×: XP here, ARCL from play on the server (api/_world-shop.mjs weekendK), both on Seoul's Saturday and Sunday
const weekend2x = () => { const d = new Date(Date.now() + 9 * 3600e3).getUTCDay(); return d === 0 || d === 6; };
function gain(n, why) {
  if (xpHeld) return;
  if (n > 0 && bless().xp) n = Math.round(n * (1 + bless().xp / 100));
  if (n > 0 && xpBoostUntil > Date.now()) n *= 2; // the Starter Package's 2× EXP
  if (n > 0 && xp3Until > Date.now()) n *= 3; // a launch potion's 3× (the server raises the allowance with it)
  if (n > 0 && weekend2x()) n *= 2; // the weekend's 2× (Saturday and Sunday, Seoul time; the server doubles the allowance too)
  if (n > 0 && petXpPct) n = Math.round(n * (1 + petXpPct / 100)); // a Scholar pet (the server's XP allowance still caps what is saved)
  const before = level(); P.xp += n; save(); paintHud();
  if (n > 0) xpFloat(n); // a number beside the XP bar; the why (feed lines, quest toasts) is told elsewhere
  if (level() > before) { Snd.level(); burst(0x39ff88); levelUp(level(), before); } else Snd.pick();
  badges();
}
// a Rare or better find turns over like a card at the top of the screen: the back first, then the piece and its name
function lootCard(it) {
  if (!rpg) return; const R = RPG.RARITY[it.r] || RPG.RARITY[0];
  document.querySelectorAll(".wp-loot").forEach((e) => e.remove());
  const el = document.createElement("div"); el.className = "wp-loot r" + it.r + (it.r >= 4 ? " legend" : ""); el.style.setProperty("--rc", R.color); el.setAttribute("role", "status");
  // a Legendary gets the middle of the screen, turning rays behind it, a chime and a little longer to be admired
  if (it.r >= 4) { try { Snd.level(); } catch { /* sound off */ } if (avatar && avatar.face) avatar.face("star", 2); }
  el.innerHTML = `${it.r >= 4 ? '<i class="wp-loot-rays" aria-hidden="true"></i>' : ""}<div class="wp-loot-in"><div class="wp-loot-back"></div><div class="wp-loot-face">${rpg.thumb ? rpg.thumb(it) : ""}<b>${esc(rpg.itemName(it))}</b><small>${esc(T(R.name))}</small></div></div>`;
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on"));
  const stay = it.r >= 4 ? 3800 : 2600; setTimeout(() => el.classList.add("out"), stay); setTimeout(() => el.remove(), stay + 600);
}
// a critical hit: the edges of the screen flash gold (at most four times a second)
let critEl = null, critT = 0;
function critFlash() {
  if (reduce || performance.now() - critT < 250) return; critT = performance.now();
  if (!critEl) { critEl = document.createElement("div"); critEl.className = "wp-critflash"; critEl.setAttribute("aria-hidden", "true"); document.body.appendChild(critEl); }
  critEl.classList.remove("on"); requestAnimationFrame(() => critEl.classList.add("on"));
}
// the dodge's afterimages: three frozen, see-through copies of you along the dash (computers; a phone keeps the
// lighter streaks)
let ghostMat = null;
function afterimage() {
  if (reduce || liteFx || st.quality.coarse || !avatar || !avatar.obj || !K.poseGhost) return false;
  if (!ghostMat) ghostMat = new THREE.MeshBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 3; i++) setTimeout(() => {
    if (!avatar || !avatar.obj) return;
    avatar.obj.updateMatrixWorld(true);
    const g = K.poseGhost(avatar.obj, ghostMat);
    avatar.obj.matrixWorld.decompose(g.position, g.quaternion, g.scale); st.scene.add(g); planet.attach(g); // stays where you were as the world slides on
    setTimeout(() => K.freeGhost(g), 400 - i * 55);
  }, i * 55);
  // the shared material fades as a whole: each copy lives under 0.4 s, so one fade per dash reads as three
  const t1 = performance.now(), off2 = st.on(() => { const k = (performance.now() - t1) / 520; ghostMat.opacity = 0.34 * Math.max(0, 1 - k); if (k >= 1) off2(); });
  return true;
}
// toasts: a small stack under the top edge, newest on top, three at most; the same line again counts up (×2) instead of
// stacking. Three pooled nodes inside #wp-toast, placed and faded with transform and opacity only
const TOAST_MAX = 3, toastPool = [], toastLive = [], toastHist = []; // toastHist: the last 30 lines for Menu → Recent messages
function toastPlace() { let y = 0; toastLive.forEach((t) => { t.el.style.setProperty("--y", y + "px"); y += t.el.offsetHeight + 6; }); }
function toastOut(t) {
  const i = toastLive.indexOf(t); if (i < 0) return;
  toastLive.splice(i, 1); clearTimeout(t.t); t.el.classList.remove("on"); toastPlace();
  t.t = setTimeout(() => { t.el.hidden = true; toastPool.push(t); }, 260);
}
function toast(msg) {
  const box = $("wp-toast"); if (!box) return; msg = String(msg ?? "");
  // the games hand in a line with a bold part (<b>…</b>, escaped text): shown as plain text (it's set as textContent),
  // without the tags or the escapes showing (they did, in Jurassic World's lines)
  if (/<\/?[a-z][^>]*>|&(?:amp|lt|gt|quot|#39);/i.test(msg)) msg = msg.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  { const am = /\+\s?(\d[\d,.]*)\s?ARCL\b/.exec(msg); if (am) try { coinFly(Number(am[1].replace(/[,.]/g, ""))); } catch { /* still loading */ } } // ARCL earned: coins fly to the Exchange button (b-fx1)
  { const h = toastHist[0]; if (h && h.m === msg) { h.n++; h.t = Date.now(); } else { toastHist.unshift({ m: msg, n: 1, t: Date.now() }); if (toastHist.length > 30) toastHist.pop(); } }
  let t = toastLive.find((x) => x.msg === msg);
  if (t) { t.n++; t.c.textContent = "×" + t.n; t.c.hidden = false; t.el.classList.remove("bump"); void t.el.offsetWidth; t.el.classList.add("bump"); }
  else {
    if (toastLive.length >= TOAST_MAX) toastOut(toastLive[toastLive.length - 1]);
    t = toastPool.pop();
    if (!t) { const el = document.createElement("div"); el.className = "wp-tst"; el.innerHTML = "<span></span><b hidden></b>"; box.appendChild(el); t = { el, s: el.firstChild, c: el.lastChild }; }
    clearTimeout(t.t); t.msg = msg; t.n = 1; t.s.textContent = msg; t.c.hidden = true; t.el.classList.remove("on", "bump"); t.el.hidden = false;
    toastLive.unshift(t); toastPlace(); void t.el.offsetWidth; t.el.classList.add("on");
  }
  clearTimeout(t.t); t.t = setTimeout(() => toastOut(t), 2600 + Math.min(2000, msg.length * 25));
}
// b-fx1: ARCL earned — a handful of coins arc from the middle of the screen into the Exchange button (ARCL ⇄
// $ARCIRCLE), which bumps, and the amount counts up beside it. Once every 0.7 s at most (the mine pays rock by rock);
// nothing to fly to (a game's own screen) or less motion: just the count
let coinAt = 0;
function coinFly(n) {
  if (!(n > 0) || Date.now() - coinAt < 700) return; coinAt = Date.now();
  const tgt = [$("wp-dk-swap"), $("wp-rew-btn"), $("wp-purse")].find((e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden"); if (!tgt) return;
  const r = tgt.getBoundingClientRect(), tx = r.left + r.width / 2, ty = r.top + r.height / 2, sx = innerWidth / 2, sy = innerHeight * 0.55;
  const lab = document.createElement("div"); lab.className = "wp-coin-n"; lab.style.left = tx + "px"; lab.style.top = r.top + "px"; lab.textContent = "+0 ARCL"; document.body.appendChild(lab);
  const fmtC = (v) => "+" + Math.round(v).toLocaleString("en-US") + " ARCL", t0 = performance.now(), dur = 900;
  const up = (t) => { const k = Math.min(1, (t - t0) / dur); lab.textContent = fmtC(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(up); }; requestAnimationFrame(up);
  setTimeout(() => lab.remove(), 1900);
  if (reduce || lowGfx) { tgt.classList.remove("wp-coin-bump"); void tgt.offsetWidth; tgt.classList.add("wp-coin-bump"); return; }
  const k = Math.min(9, 3 + Math.floor(Math.log10(n + 1) * 2));
  for (let i = 0; i < k; i++) {
    const c = document.createElement("img"); c.src = "/images/arcl2-64.png"; c.alt = ""; c.className = "wp-coin"; document.body.appendChild(c);
    const ox = (Math.random() - 0.5) * 140, oy = (Math.random() - 0.5) * 70, mx = (sx + ox + tx) / 2 + (Math.random() - 0.5) * 120, my = Math.min(sy, ty) - 120 - Math.random() * 80;
    const a = c.animate([{ transform: `translate(${sx + ox}px,${sy + oy}px) scale(.3)`, opacity: 0 }, { transform: `translate(${sx + ox}px,${sy + oy - 30}px) scale(1.1)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: 0.55 }, { transform: `translate(${tx}px,${ty}px) scale(.55)`, opacity: 0.9 }], { duration: 760 + i * 55, delay: i * 45, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "both" });
    for (const [lag, op] of [[38, 0.45], [76, 0.22]]) { const t2 = document.createElement("img"); t2.src = c.src; t2.alt = ""; t2.className = "wp-coin wp-coin-trail"; t2.style.opacity = op; document.body.appendChild(t2);
      t2.animate(a.effect.getKeyframes().map((f) => ({ ...f, opacity: (f.opacity ?? 1) * op })), { duration: 760 + i * 55, delay: i * 45 + lag, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "both" }).onfinish = () => t2.remove(); }
    a.onfinish = () => { c.remove(); tgt.classList.remove("wp-coin-bump"); void tgt.offsetWidth; tgt.classList.add("wp-coin-bump"); if (i < 5 && Snd.coin) try { Snd.coin(); } catch { /* quiet */ } };
  }
}
// "+XP" floats up beside the XP bar instead of taking a toast; gains within half a second add up in the one rising
const xpFl = []; let xpFlI = 0, xpFlLast = null;
function xpFloat(n) {
  const host = $("wp-lv"); if (!host || !n) return;
  const now = performance.now();
  if (xpFlLast && now - xpFlLast.at < 500) { xpFlLast.n += n; xpFlLast.el.textContent = "+" + xpFlLast.n.toLocaleString("en-US") + " XP"; return; }
  let f = xpFl[xpFlI]; if (!f) { const el = document.createElement("b"); el.className = "wp-xpf"; el.setAttribute("aria-hidden", "true"); el.setAttribute("data-no-i18n", ""); host.appendChild(el); f = xpFl[xpFlI] = { el }; }
  xpFlI = (xpFlI + 1) % 3; f.n = n; f.at = now; xpFlLast = f;
  f.el.textContent = "+" + n.toLocaleString("en-US") + " XP"; f.el.classList.remove("go"); void f.el.offsetWidth; f.el.classList.add("go");
}

// ---------------- accounts, saving, who's online (api/_world.mjs) ----------------
const AC = window.arcConnect, CFG = (typeof CONFIG !== "undefined" ? CONFIG : window.CONFIG) || {}; // config-arc.js declares CONFIG with const: a global, but not a window property
const addr = () => (AC && AC.address && AC.address()) || "";
const vid = (() => { try { let v = localStorage.getItem(VID); if (!/^[a-z0-9]{20}$/.test(v || "")) { v = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); localStorage.setItem(VID, v); } return v; } catch { return "guest0000000000000000"; } })();
const sess = () => { try { const s = JSON.parse(localStorage.getItem(SESS) || "null"); return s && Date.now() - Date.parse(s.issued) < 23.5 * 3600e3 ? s : null; } catch { return null; } };
// the first minutes, one window at a time (b-ob): whatever opens by itself (the launch card, Getting started, the day's
// tips, a tour, what's new) asks autoShow(name, priority, open) and waits for a calm moment — nothing else up, and a few
// seconds since the last one closed — then the most important one waiting goes first (a lower number first)
const autoQ = new Map(); let calmAt = 0, waveT = 0, idleWaveAt = 0; // (waveT, idleWaveAt: the hero's wave now and then, standing about)
function autoShow(name, prio, open) { autoQ.set(name, { prio, open }); }
const loginMessage = (wallet, issued) => `ARCIRCLE World — sign in\n\nWallet: ${lc(wallet)}\nIssued: ${issued}\n\nThis only proves the wallet is yours. It costs nothing and moves nothing.`;
// a call to the World API: given up after 20 s (a phone's network that stalls once used to leave a request hanging for
// good, and the game waiting on it ignored every tap after — Jurassic crafting and building went dead that way)
const post = (body) => { const ac = typeof AbortController !== "undefined" ? new AbortController() : null, to = ac ? setTimeout(() => ac.abort(), 20000) : 0;
  return fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ep: EPOCH, ...body }), ...(ac ? { signal: ac.signal } : {}) }).then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) })).finally(() => clearTimeout(to)); };
const PROGRESS = ["xp", "xpv", "visited", "beaten", "cards", "quests", "badges", "char", "name", "daily", "rpg", "outfit", "ep"];
async function signIn() {
  if (!AC) throw new Error(T("Wallet connect isn't available here."));
  if (!AC.live || !AC.live()) await AC.connect();
  const a = lc(addr()); if (!a) throw new Error(T("Connect a wallet first."));
  const prov = await AC.provider();
  const issued = new Date().toISOString(), msg = loginMessage(a, issued);
  const hexMsg = "0x" + Array.from(new TextEncoder().encode(msg), (b) => b.toString(16).padStart(2, "0")).join("");
  const signature = await prov.request({ method: "personal_sign", params: [hexMsg, a] });
  const r = await post({ action: "world-login", wallet: a, issued, signature });
  if (r.status === 503) { toast(T("Signed in. Cloud saving isn't switched on yet, so progress stays in this browser.")); return; }
  if (!r.ok) throw new Error(r.j.error || T("Sign-in failed."));
  try { localStorage.setItem(SESS, JSON.stringify({ wallet: a, issued, signature })); localStorage.setItem(LOGGED, issued); } catch { /* private */ }
  loggedIn(r);
}
// the beta pass signs the same message but only checks the balance: the first visit with that signature also signs in
// here (the player is counted, and a save from another device is loaded)
const LOGGED = "arc.world.logged";
async function resumeSession() {
  const s = sess(); if (!s) return;
  // already signed in with this signature: no new sign-in, but the closed beta's reward is still asked for (b411: it
  // only came with a fresh sign-in, so a player who stayed signed in across the open beta's start never got it)
  // b417: the server's save is read on every visit, not only on a new sign-in: progress made on another device since
  // (a phone, then this computer) is loaded instead of this browser's older copy being shown, and saved over it
  const r = await post({ action: "world-login", ...s }).catch(() => null);
  if (!r || !r.ok) return;
  try { localStorage.setItem(LOGGED, s.issued); } catch { /* private */ }
  loggedIn(r, true);
}
// starting over (Settings → Reset): the next save says so, and the server's progress isn't loaded back in
const resetting = (() => { try { return localStorage.getItem("arc.world.reset") === "1"; } catch { return false; } })();
// the server's progress, newer than this browser's: taken over (PROGRESS fields), kept here, then the game reloads so
// every part of it (level, gear, quests) starts from it
function takeServer(sv, why) {
  if (sv.xpv !== RPG.XP_VERSION) { sv.xp = RPG.xpFromOld(sv.xp); sv.xpv = RPG.XP_VERSION; }
  PROGRESS.forEach((k) => { if (sv[k] != null && sv[k] !== "") P[k] = sv[k]; }); P.ep = EPOCH;
  try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ }
  toast(why); setTimeout(() => location.reload(), 1600);
}
function loggedIn(r, quiet) {
  const sv = !resetting && r.j.save && (r.j.save.ep || 1) === EPOCH ? r.j.save : null; // never an earlier test's progress
  if (sv && sv.xpv !== RPG.XP_VERSION) { sv.xp = RPG.xpFromOld(sv.xp); sv.xpv = RPG.XP_VERSION; } // a save from the old level curve
  if (sv && (sv.xp || 0) > P.xp) { PROGRESS.forEach((k) => { if (sv[k] != null && sv[k] !== "") P[k] = sv[k]; }); try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ } toast(T("Welcome back, {name}. Your progress is loaded.", { name: P.name || "" })); }
  else { if (!quiet || r.j.firstTime) toast(r.j.firstTime ? T("Signed in. Welcome to ARCIRCLE World!") : T("Signed in.")); cloudSave(); }
  arclShop.refresh().then(() => { arclShop.flushQueue(); arclChecks(); setTimeout(() => arclShop.maybeDaily(), 1500); });
  setTimeout(() => { village.load(); setNameTag(); }, 600);
  if (r.j.cbt) setTimeout(() => cbtReward(r.j.cbt), 2500);
}
// ---- the closed beta's rewards (api/_world-phase.mjs): asked for once signed in to the open beta. The server keeps
// the pieces with the claim, so asking again returns the same ones; each is added to the bag once (by its id).
async function cbtReward(c) {
  if (!c || !c.eligible || EPOCH < 2) return;
  let ready = false; try { ready = !!rpg; } catch { /* still loading (rpg is declared further down) */ }
  if (!ready) { setTimeout(() => cbtReward(c), 2000); return; }
  const r0 = rpg.data(); r0.x = r0.x || {};
  if (r0.x.cbt === EPOCH) return;
  const s = sess(); if (!s) return;
  const r = await post({ action: "world-cbt-claim", ...s }).catch(() => null);
  if (r && r.status === 404) { r0.x.cbt = EPOCH; save(); return; } // no closed-beta progress on this wallet: don't ask again
  if (!r || !r.ok || !Array.isArray(r.j.items)) return;
  const have = new Set([...Object.values(r0.eq || {}), ...(r0.bag || []), ...(r0.store || [])].filter(Boolean).map((x) => x.id));
  const got = r.j.items.filter((it) => it && it.id && !have.has(it.id));
  for (const it of got) rpg.addItem({ ...it }, true);
  r0.x.cbt = EPOCH; save();
  if (got.length) cbtCard(got, r.j.rank || 0);
}
function cbtCard(items, rank) {
  const el = document.createElement("div"); el.className = "wp-cbt"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wp-cbt-h"); el.setAttribute("data-no-i18n", "");
  const leg = RPG.RARITY[4], wearLv = (RPG.TIERS[(RPG.parseBase(items[0].b) || {}).tier || 0] || {}).lv || 1;
  el.innerHTML = `<div class="wp-cbt-card"><div class="wp-cbt-top" aria-hidden="true"><i></i></div><small>${esc(T("Closed beta reward"))}</small>
    <h2 id="wp-cbt-h">${esc(rank ? T("Rank {n} in the closed beta. Thank you!", { n: rank }) : T("Thank you for playing the closed beta!"))}</h2>
    <p>${esc(items.length > 1 ? T("{n} Legendary pieces for your new start. Worn from level {lv}.", { n: items.length, lv: wearLv }) : T("A Legendary weapon for your new start. Worn from level {lv}.", { lv: wearLv }))}</p>
    <ul>${items.map((it, i) => { const pb = RPG.parseBase(it.b) || { slot: "weapon" }; return `<li style="--i:${i}">${RPG.iconSvg(pb.slot, leg.color)}<b>${esc(RPG.itemName(it))}</b><small>${esc(T("Legendary"))} · ${esc(T(RPG.SLOT_NAME[pb.slot] || pb.slot))} · ${esc(T("Lv {n}", { n: it.lv }))}</small></li>`; }).join("")}</ul>
    <div class="wp-cbt-act"><button type="button" class="wp-cbt-bag">${esc(T("Open the bag"))}</button><button type="button" class="wp-cbt-x">${esc(T("Close"))}</button></div></div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.querySelector(".wp-cbt-x").addEventListener("click", close);
  el.querySelector(".wp-cbt-bag").addEventListener("click", () => { close(); rpg.show(); });
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  setTimeout(() => el.querySelector(".wp-cbt-bag").focus(), 40);
}
// a save that doesn't reach the server (offline, a server hiccup, too soon after the last) is tried again on its own,
// sooner at first and then less often, and right away when the connection comes back; a small note shows meanwhile
let saveFails = 0, saveRetryT = 0;
function paintSaveNote() { const el = $("wp-savenote"); if (!el) return; el.hidden = saveFails < 2; el.textContent = T("Not saved to your wallet yet: trying again"); }
addEventListener("online", () => { if (saveFails) { clearTimeout(saveRetryT); cloudSave(); } });
async function cloudSave() {
  const s = sess(); if (!s) return;
  const data = {}; PROGRESS.forEach((k) => (data[k] = P[k]));
  let retry = 0;
  try { const r = await post({ action: "world-save", ...s, data, ...(resetting ? { reset: true } : {}) });
    if (r.ok && resetting) { try { localStorage.removeItem("arc.world.reset"); } catch { /* private */ } }
    if (r.status === 409 && r.j.behind && r.j.save) { takeServer(r.j.save, T("Your newer progress from another device is loaded.")); return; }
    if (r.status === 400 && /expired/.test(r.j.error || "")) { try { localStorage.setItem(SESS, JSON.stringify({ ...s, issued: new Date(0).toISOString() })); } catch { /* private */ } paintAcct(); }
    else if (r.status === 429) retry = 9000; else if (!r.ok && r.status >= 500 && r.status !== 503) retry = Math.min(120e3, 10e3 * 2 ** saveFails); else if (r.ok) { saveFails = 0; paintSaveNote(); if (r.j && r.j.refer) try { referUI.paid(r.j.refer); } catch { /* shown next visit */ } } }
  catch { retry = Math.min(120e3, 10e3 * 2 ** saveFails); }
  if (retry) { saveFails++; paintSaveNote(); clearTimeout(saveRetryT); saveRetryT = setTimeout(cloudSave, retry); }
}
let stats = null, visitSent = false, dinoOutNow = false; // dinoOutNow: your dinosaur companion walks with you in town (dinoTown)
async function ping() {
  if (document.hidden) return;
  let g; try { if (mode === "hub" && !introOn) { const v = here(new THREE.Vector3()); g = { x: Math.round(v.x * 10) / 10, z: Math.round(v.z * 10) / 10, c: formOf(P.char || "bot"), lv: level(), ...(P.tint ? { tn: P.tint } : {}), ...(tierOf() ? { tr: tierOf() } : {}) }; /* b447: the hero's colour and halo tier, for the others */ if (combat) { const vt = combat.vitals(), zz = combat.zone(); g.h = Math.max(0, Math.min(100, Math.round((100 * vt.hp) / (vt.max || 1)))); if (zz) g.zn = zz.id; } if (said && !said.sent && Date.now() - said.at < 60e3) { g.s = said.s; said.sent = true; } if (P.pal) g.p = P.pal; if (dinoOutNow) g.dn = 1; try { const s0 = landNow === "ad" && agentDim && agentDim.state(); if (s0 && s0.agent) g.ag = 1; } catch { /* still loading */ } const cm = chatUI && chatUI.pending(); if (cm) g.m = cm; } } catch { /* not ready yet */ }
  // signed in and not hidden (Settings): the sign-in goes along, so others see your name and level over your figure
  const se0 = sess(), se = g && S.showName !== false ? se0 : null; // (signed in but hidden: the sign-in still goes, so the site can count wallets — hide keeps the name off)
  try { const r = await post({ action: "world-ping", id: vid, visit: !visitSent, ...(g ? { g } : {}), ...(se0 ? { s: se0 } : {}), ...(se0 && !se ? { hide: 1 } : {}), ...(se && chatUI && chatUI.presenceDue() ? { pr: 1 } : {}) }); if (r.ok) { visitSent = true; stats = r.j; paintOnline(); } } catch { /* offline */ }
}
function paintAuthCount() {
  const c = $("wp-auth-count"); if (!stats || !stats.players) { c.hidden = true; return; }
  c.hidden = false; c.textContent = T("{n} players have signed in so far", { n: stats.players.toLocaleString("en-US") });
}
function paintOnline() {
  if (!$("wp-auth").hidden) paintAuthCount();
  const el = $("wp-online"); if (!stats || stats.online == null) { el.hidden = true; return; }
  el.hidden = false; $("wp-online-n").textContent = stats.online.toLocaleString("en-US");
  $("wp-online-l").textContent = " " + W("online") + (coarse ? "" : " · " + T("{n} visited", { n: (stats.visitors || 0).toLocaleString("en-US") }));
  el.title = T("{n} visited", { n: (stats.visitors || 0).toLocaleString("en-US") }) + " · " + T("{n} signed in with a wallet", { n: (stats.players || 0).toLocaleString("en-US") });
}
setInterval(ping, 50000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) ping(); });

// ---------------- sound: small synthesized effects (world-sfx.js, WebAudio), started by the first touch or key ----------------
const Snd = SFX.createSfx({ S, saveSet, music: () => music, coarse });
// the music (world-music.js): six K-pop tracks in a shuffled order; the note button in the top bar turns it on and off
// (S.bgm), Settings → Music sets the volume, and Sound off silences it too
const musicVol = () => (S.music ?? 55) / 100;
const music = MUS.createMusic({ ver: VER, volume: musicVol(), on: () => !!S.sound && S.bgm !== false && musicVol() > 0 });
// sound may only start from a gesture the browser counts: on a phone that's the end of a tap, not its start. Every tap,
// click and key tries until both the effects and the music are actually running (caught before anything else can
// stop the event)
const wake = () => { if (Snd.ready() && music.unlocked()) return; Snd.unlock(); music.unlock(); };
["pointerup", "touchend", "click", "keydown", "pointerdown"].forEach((ev) => addEventListener(ev, wake, { capture: true, passive: true }));
function paintMusicBtn() {
  const b = $("wp-music-btn"); if (!b) return; const on = S.bgm !== false;
  b.setAttribute("aria-pressed", on ? "true" : "false"); b.classList.toggle("off", !on);
  b.title = on ? T("Music on (tap to turn off)") : T("Music off (tap to turn on)");
}
if ($("wp-music-btn")) {
  $("wp-music-btn").addEventListener("click", (e) => {
    e.stopPropagation(); S.bgm = S.bgm === false; saveSet(); paintMusicBtn();
    if (S.bgm && !S.sound) { S.sound = true; saveSet(); try { Snd.set(true); } catch { /* not ready */ } } // music on with the sound off: sound comes on too
    Snd.init(); music.start(); music.refresh();
  });
  paintMusicBtn();
}

// ---------------- the scene ----------------
const cv = $("wp-cv");
if (!K.webglOk()) {
  $("wp-loading").innerHTML = `<span>${esc(T("This browser can't draw the 3D world."))}</span><a class="wp-cta" href="/?skip">${esc(T("Go to the Platform World"))}</a>`;
  throw new Error("no webgl");
}
try { await document.fonts.load("700 92px Sora"); } catch { /* system font */ }
loadbar(0.15);
// bloom only on what glows: the white halls lit by the sun stay under the threshold (a wider, stronger bloom washed the
// whole screen white on phones when a hall or an arch was close to the camera)
const st = K.makeStage(cv, { fog: 0.0058, bloom: 0.28, bloomRadius: 0.25, bloomThreshold: 1.15, fov: 55, shadows: true, quality: S.quality, groundY: 0, post: true, look: { toon: 0.4 }, // look: the stylized finish (world-kit.js stylize)
  // the graphics context gone for good (rare: a phone short on memory): a way back in
  onLost: () => { if (document.querySelector(".wp-lost")) return; const el = document.createElement("div"); el.className = "wp-leave wp-lost"; el.setAttribute("role", "alertdialog"); el.innerHTML = `<div class="wp-card wp-leave-card"><h2>${esc(T("The graphics paused"))}</h2><p>${esc(T("Your phone needed the memory back. Your progress is saved."))}</p><div class="wp-leave-btns"><button type="button" class="wp-cta" data-reload>${esc(T("Reload the game"))}</button></div></div>`; el.addEventListener("click", (e) => { if (e.target.closest("[data-reload]")) location.reload(); }); document.body.appendChild(el); },
  onRestored: () => { document.querySelectorAll(".wp-lost").forEach((e) => e.remove()); },
});
st.fps(S.fpsCap || (coarse ? 30 : 60)); // the frame limit (Settings; Auto: see capNow — 30 on a phone outside the fast games)
let autoCap = 0, grassThin = false, tmpV3 = null; if (S.quality === "auto" && st.quality.weak && st.fps) { autoCap = 30; st.fps(30); } /* (the weakest phone chips: an even 30 from the start, K.gpuWeak) */ // grassThin: a slow phone's grass halved (dynRes, b447) // 30 once a slow phone was moved to an even 30 fps (dynRes, b447); declared here because diag reads it
// b447: on a phone (unless Ultra was picked), no clear-coat layer: glass, crystals and glossy gear keep their colour and
// shine but skip the second specular layer, which cost each of them about twice the shading. three.js reads clearcoat
// when it builds a shader, so this one switch covers every module and every material, made before or after it
if (st.quality.coarse && !st.quality.ultra) { try { const P = THREE.MeshPhysicalMaterial.prototype, d = Object.getOwnPropertyDescriptor(P, "clearcoat");
  if (d && d.set) Object.defineProperty(P, "clearcoat", { configurable: true, get() { return 0; }, set(v) { d.set.call(this, v); } }); } catch { /* keep the full look */ } }
st.scene.background = null;
const kitP = K.loadKit(VER).catch((e) => { console.warn("world models:", e); return null; });
// the intro: the round planet seen from space, built before the kit switches to flat ground
const intro = new THREE.Group(); intro.visible = false; st.scene.add(intro);
{
  const pl = K.makePlanet({ map: "/models/world/planet-surface.jpg" + VER });
  pl.add(K.makePaths(), K.makeDistrictTints(), K.makeLamps());
  K.SHOPS.forEach((spec) => { const g = K.makeShop(spec); K.placeOn(g, K.dirOf(spec.theta, spec.phi)); pl.add(g); });
  intro.add(pl, K.makeHalo()); intro.userData.pl = pl;
}
K.setFlat(1.35);
K.spreadTown(1.7, 3); // the halls and houses further apart (b403)
// the world: everything on the ground lives in this group, which slides under the player
const planet = new THREE.Group(); planet.name = "world"; st.scene.add(planet);
// where you stand on the plaza: in front of the fountain, facing it (the world slides, so this is its offset)
const HOME = new THREE.Vector3(-1.2, 0, -7.6); planet.position.copy(HOME); // a little off centre, so walking straight on slides past the fountain
// the finishing look (world-look.js): a colour grade per time of day, varied grass, contact shadows under the halls
let grade = LOOK.addGrade(st); st.on((dt) => { LOOK.time.value += dt; });
// the picture after the scene (world-post.js): real antialiasing with bloom, ink edges, AO on Ultra, low fog and sun
// shafts, a 3D colour grade per time of day and ground
// Auto is Medium on computers too (b411): Auto on a computer used to be Ultra (AO, SMAA, sun shafts, a mirror pool, the
// shadow map every frame, 60,000 grass blades), which held a GTX 980 at 30–40 fps. Ultra is still one tap away.
const postLevel = S.quality === "ultra" || S.quality === "high" ? "ultra" : S.quality === "low" || S.quality === "saver" ? "low" : S.quality === "medium" ? "medium" : st.quality.low ? "low" : "medium";
let fxPost = null; const lgrade = LOOK.lutGrade(), sunDir = st.sun.position.clone().sub(st.sun.target.position).normalize();
Promise.resolve(POST.buildPost(st, { level: postLevel, bloom: [0.28, 0.25, 1.15], lite: st.quality.coarse })).then((p) => {
  fxPost = p; if (!p) return;
  p.edge.uniforms.thick.value = Math.max(1, st.renderer.getPixelRatio() * 0.7);
  if (!p.grade) grade = LOOK.addGrade(st); else grade = null; // WebGL 1: the old grade on the new chain
  nightK = -1; dayNight();
}).catch(() => {});
st.on((dt) => { if (fxPost) fxPost.tick(dt, sunDir); });
// worn paths from the plaza out to each hunting ground's gate (the ground shows packed earth, the grass leaves them bare)
const WORN_PATHS = RPG.ZONES.filter((z) => Math.hypot(z.x, z.z) < 260).map((z) => { const d = Math.hypot(z.x, z.z), ux = z.x / d, uz = z.z / d, a = K.flatR ? K.flatR(11) + 1 : 16; return [ux * a, uz * a, ux * (d - z.r + 0.5), uz * (d - z.r + 0.5)]; });
{ const v = MV.MINE_VILLAGE, d = Math.hypot(v.x, v.z), a = K.flatR ? K.flatR(11) + 1 : 16; WORN_PATHS.push([v.x / d * a, v.z / d * a, v.x / d * (d - v.r + 0.5), v.z / d * (d - v.r + 0.5)]); } // the walk out to the Mining Village
// AGENT DIMENSION's Citadel: where it stands on the flat ground, and the walk out to its door
const AGW = (() => { const g = K.AGENT_GATE, d = K.flatR ? K.flatR(g.theta) : 78, a = THREE.MathUtils.degToRad(g.phi); return { x: d * Math.sin(a), z: -d * Math.cos(a), d, r: g.r }; })();
{ const a = K.flatR ? K.flatR(11) + 1 : 16, ux = AGW.x / AGW.d, uz = AGW.z / AGW.d; WORN_PATHS.push([ux * a, uz * a, ux * (AGW.d - AGW.r + 1), uz * (AGW.d - AGW.r + 1)]); }
{ const v = PV.PARTNER_VILLAGE, d = Math.hypot(v.x, v.z), a = K.flatR ? K.flatR(11) + 1 : 16; WORN_PATHS.push([v.x / d * a, v.z / d * a, v.x / d * (d - v.r + 0.5), v.z / d * (d - v.r + 0.5)]); } // the walk out to the Partner Village
if (K.treeOptions) K.treeOptions(!(S.quality === "low" || S.quality === "saver" || (S.quality === "auto" && st.quality.low)), VER); /* (lowGfx is set further down) */
const groundG = K.makeGround(); planet.add(groundG);
{ const gm = groundG.children.find((m) => m.isMesh && m.material && m.material.map); if (gm) LOOK.groundLook(gm.material, { low: S.quality === "low" || S.quality === "saver", paths: WORN_PATHS }); }
// far shadows (world-look.js): halls, trees and the grounds' props shade the ground past the real shadow's reach
// far culling: whole groups (a hall, a hunting ground's props, a decor cell) more than ~150 m away (110 m on a phone)
// are skipped — the fog has them mostly hidden anyway, and they were hundreds of draw calls. Anything that needs the
// whole world (the far-shadow bake, the grass mask, the minimap picture) runs inside farCull.all().
let nearAll = (f) => f(); /* (PF4: nearCull below sets it — farCull.all shows what it hid too) */
const farCull = (() => {
  const SKIP = new Set(["grass", "ambient", "particles", "smoke", "combat", "ghosts", "island", "decor", "life", "zones", "ground", "puddles", "pet", "pumpkings"]); // "pet", "pumpkings" (world-pumpking.js): they move, so a scan-time box would hide them
  const CONT = ["decor", "life", "zones"], R = S.quality === "saver" ? 75 : st.quality.coarse && lowGfx ? 90 : st.quality.coarse ? 110 : postLevel === "ultra" ? 150 : 130, /* b5: battery saver and Low phones draw less far (the fog hides it) */ box = new THREE.Box3(), sph = new THREE.Sphere();
  // b420: on a computer at Medium / Ultra what's culled dissolves over its last 10 m instead of popping (K.fadeLook)
  const FADE = !st.quality.coarse && (postLevel === "medium" || postLevel === "ultra") && K.fadeLook;
  let list = [], at = 0, scanAt = -1e9, hidden = new Set(), sig = "";
  // what's in the world, cheaply: a new scan only when this changes (b413: a full scan every 15 s walked every object in
  // the world, a regular stutter while moving), or at most once a minute
  const sigNow = () => planet.children.length + ":" + CONT.map((n) => { const c = planet.children.find((x) => x.name === n); return c ? c.children.length : 0; }).join(",");
  function scan() {
    list = []; planet.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(planet.matrixWorld).invert();
    const add = (o) => { if (!o.visible && !hidden.has(o)) return; box.setFromObject(o); if (box.isEmpty()) return; box.applyMatrix4(inv); box.getBoundingSphere(sph); if (sph.radius > 60) return; list.push({ o, c: sph.center.clone(), r: sph.radius }); if (FADE) o.traverse((m) => { if (m.isMesh && m.material) [].concat(m.material).forEach(K.fadeLook); }); };
    for (const c of planet.children) { if (SKIP.has(c.name)) { if (CONT.includes(c.name)) c.children.forEach(add); continue; } add(c); }
  }
  function tick() {
    const now = performance.now(); if (now - at < 400) return; at = now;
    if (now - scanAt > 60000 || (now - scanAt > 2000 && sigNow() !== sig)) { sig = sigNow(); const was = [...hidden]; was.forEach((o) => { o.visible = true; }); hidden.clear(); scan(); scanAt = now; }
    const px = -planet.position.x, pz = -planet.position.z, on = mode === "hub"; if (FADE) K.FADE.value = on ? R : 1e6;
    for (const it of list) { const far = on && Math.hypot(it.c.x - px, it.c.z - pz) - it.r > R;
      if (far && it.o.visible) { it.o.visible = false; hidden.add(it.o); } else if (!far && hidden.has(it.o)) { it.o.visible = true; hidden.delete(it.o); } }
  }
  function all(fn) { const was = [...hidden]; was.forEach((o) => { o.visible = true; }); try { return nearAll(fn); } finally { was.forEach((o) => { if (hidden.has(o)) o.visible = false; }); } }
  return { tick, all, rescan: () => { scanAt = -1e9; }, prep: () => { if (FADE) { scan(); scanAt = performance.now(); sig = sigNow(); } } };
})();
st.on(() => { try { farCull.tick(); } catch { /* still loading */ } });
// PF4 (2026-10-27): on a phone the small things — the walking robots (folk), the
// market stalls, the bounty board — are drawn only near you (the pumpkins are one instanced mesh now). farCull skips them (they move, or their group spans the
// town), and in the plaza they were ~70 of the ~240 draw calls a frame. Each child is checked by where it stands now
const nearCull = (() => {
  if (!st.quality.coarse) return { tick() {}, all: (f) => f() };
  const R = S.quality === "saver" || lowGfx ? 35 : 45, KIDS = ["stalls"], SELF = ["folk", "bounty"], hid = new Set(); let at = 0;
  // the Meshy trees (world-arcstyle.js meshyTrees): ~180 k triangles town-wide in four instanced meshes. A phone keeps
  // only the instances within TR of you (rewritten once a second, as you move 6 m); allM holds them all
  const TR = lowGfx || S.quality === "saver" ? 60 : 80; let trees = [], treeAt = 0, tx = 1e9, tz = 1e9;
  function treeCull(px, pz, full) {
    const now = performance.now(); if (!trees.length && now - treeAt > 5000) { treeAt = now; planet.traverse((o) => { if (o.isInstancedMesh && o.userData.allM) trees.push(o); }); }
    if (!trees.length) return; if (!full && Math.hypot(px - tx, pz - tz) < 6) return; tx = full ? 1e9 : px; tz = full ? 1e9 : pz;
    for (const im of trees) { const A = im.userData.allM, B = im.instanceMatrix.array; let n = 0;
      for (let i = 0; i < im.userData.allN; i++) { const o = i * 16; if (!full && Math.hypot(A[o + 12] - px, A[o + 14] - pz) > TR) continue; for (let k = 0; k < 16; k++) B[n * 16 + k] = A[o + k]; n++; }
      im.count = n; im.instanceMatrix.needsUpdate = true; }
  }
  return { tick() { const now = performance.now(); if (now - at < 500) return; at = now;
    const px = -planet.position.x, pz = -planet.position.z, on = mode === "hub"; if (on) treeCull(px, pz, false);
    const test = (o, x, z) => { const far = on && Math.hypot(x - px, z - pz) > R; if (far && o.visible) { o.visible = false; hid.add(o); } else if (!far && hid.has(o)) { o.visible = true; hid.delete(o); } };
    for (const c of planet.children) {
      if (KIDS.includes(c.name)) for (const k of c.children) test(k, c.position.x + k.position.x, c.position.z + k.position.z);
      else if (SELF.includes(c.name)) { const k = c.name === "folk" && c.children[0] ? c.children[0] : c; const x = c === k ? c.position.x : c.position.x + k.position.x, z = c === k ? c.position.z : c.position.z + k.position.z; test(c, x, z); }
    } }, all(fn) { const was = [...hid]; was.forEach((o) => { o.visible = true; }); treeCull(0, 0, true); try { return fn(); } finally { was.forEach((o) => { if (hid.has(o)) o.visible = false; }); tx = tz = 1e9; } } }; /* (all: everything back for a whole-world job; the trees refill on the next tick) */
})();
nearAll = (f) => nearCull.all ? nearCull.all(f) : f();
st.on(() => { try { nearCull.tick(); } catch { /* still loading */ } });
// the frame count, and the sun's shadow map redrawn every other frame below Ultra (the sun stands still; only the
// things that move need it, and they barely move in a 30th of a second)
let frameNo = 0; const shadowEvery = postLevel === "ultra" && !st.quality.coarse ? 1 : st.quality.coarse ? 3 : 2; /* b448: phones every 3rd frame (the sun stands still; the real shadow only covers the area round you) */
if (st.renderer.shadowMap.enabled && shadowEvery > 1) st.renderer.shadowMap.autoUpdate = false;
// b447: a phone still slow at the fewest pixels stops drawing the live shadow (one less pass over the town each
// time it updated): the baked town shade (gshadow) then reaches right up to you, and a soft spot sits under your feet.
// The light keeps its shadow on (switching it off rebuilds every shader); its map is just drawn empty once.
let liveShOff = 0, footSpot = null;
function bakedShadows() {
  if (liveShOff || !gshadow || !st.sun || !st.sun.castShadow || !st.renderer.shadowMap.enabled) return false;
  liveShOff = 1; planet.traverse((o) => { if (o.isMesh) o.castShadow = false; }); if (player) player.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  gshadow.uniforms.gsNear.value = 0; ensureFootSpot(); if (footSpot) footSpot.material.opacity = 1;
  return true;
}
// b447: a soft spot under your feet all the time (the live shadow on a phone redraws every third frame, and on Low there
// is none): faint while the live shadow is there, full once it's gone (bakedShadows)
function ensureFootSpot() {
  if (footSpot) return;
  try { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(0,0,0,0.5)"); g.addColorStop(0.6, "rgba(0,0,0,0.25)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const geo = new THREE.PlaneGeometry(1.3, 1.3); geo.rotateX(-Math.PI / 2);
    footSpot = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false })); footSpot.renderOrder = 1; st.scene.add(footSpot);
    if (compileHidden) compileHidden([footSpot]); } catch { /* no spot */ }
  if (footSpot) footSpot.material.opacity = liveShOff ? 1 : 0.5;
}
st.on(() => { if (!footSpot) return; footSpot.visible = mode === "hub" && player.visible; if (footSpot.visible) { footSpot.position.set(player.position.x, 0.04, player.position.z); footSpot.scale.setScalar(1 / (1 + Math.max(0, hop) * 0.35)); } });
st.on(() => { frameNo++; if (liveShOff) { if (st.renderer.shadowMap.enabled) st.renderer.shadowMap.needsUpdate = liveShOff === 1 || !st.sun.shadow.map; liveShOff = 2; return; } const ev = st.shadowEvery || shadowEvery; if (ev > 1 && st.renderer.shadowMap.enabled) st.renderer.shadowMap.needsUpdate = frameNo % ev === 0; });
const gshadow = st.renderer.shadowMap.enabled ? LOOK.groundShadow({ renderer: st.renderer, planet, sunDir, around: (f) => farCull.all(f) }) : null;
if (gshadow) { const gm = groundG.children.find((m) => m.isMesh && m.material && m.material.map); if (gm) gshadow.receive(gm.material); st.on(() => gshadow.tick()); [3000, 20000].forEach((ms) => setTimeout(() => gshadow.bake(), ms)); }
// the sky (world-env.js): the gradient dome with two layers of drifting cloud and the sun's glow (the plain dome on Low)
const lowGfx = S.quality === "low" || S.quality === "saver" || (S.quality === "auto" && st.quality.low);
// b447: contact shade on everything that stands on the ground, in every place (world-look.js); not on Low
if (!lowGfx) try { LOOK.installContactShade(); } catch { /* the plain look */ }
if (!lowGfx) { const pf = planet.getObjectByName("plaza-floor"); if (pf) LOOK.stoneGrain(pf.material); }
// b447: on an Ultra computer the fountain's water mirrors the plaza round it: a small cube view (128 px) from the fountain,
// redrawn every 30 s one face a frame (six small renders spread out, so no frame stalls); the water hidden while it's
// drawn. Phones and the lower settings keep the sky's reflection only.
let mirror = postLevel === "ultra" && !st.quality.coarse ? { find: 0 } : null;
st.on((dt) => { const M = mirror; if (!M) return; try { if (mode !== "hub") return; } catch { return; /* mode is declared further down (a TDZ before it) */ } const now = performance.now();
  if (!M.cc) { if (now < M.find) return; M.find = now + 2000; try { const f = planet.getObjectByName("fountain"); if (!f) return; const waters = []; f.traverse((o) => { if (o.isMesh && o.material && o.material.transparent && o.material.roughness <= 0.06) waters.push(o); }); if (!waters.length) { mirror = null; return; }
    const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }), cc = new THREE.CubeCamera(0.4, 300, rt);
    cc.position.set(0, 1.4, 0); f.add(cc); const m = waters[0].material; m.envMap = rt.texture; m.envMapIntensity = 1.1; m.needsUpdate = true; Object.assign(M, { rt, cc, waters, face: 0, at: now }); } catch { mirror = null; } return; }
  if (M.face < 0) { if (now - M.at < 30000) return; M.at = now; M.face = 0; }
  try { const r = st.renderer, cc = M.cc, i = M.face, prev = r.getRenderTarget(), sh = r.shadowMap.needsUpdate; if (cc.coordinateSystem !== r.coordinateSystem) { cc.coordinateSystem = r.coordinateSystem; cc.updateCoordinateSystem(); }
    M.waters.forEach((w) => { w.visible = false; }); cc.updateMatrixWorld(true); M.rt.texture.generateMipmaps = i === 5; r.setRenderTarget(M.rt, i); r.render(st.scene, cc.children[i]); r.setRenderTarget(prev); r.shadowMap.needsUpdate = sh;
    M.waters.forEach((w) => { w.visible = true; }); M.face = i === 5 ? -1 : i + 1; } catch { mirror = null; } }); // b447: the plaza's stone gets the village floor's grain
// every character made from here on: the asset packs' palette (not the ARC Bots, drawn in it already) and a dark rim
// and a cool rim of light (all presets but Saver)
if (K.setCharHook) K.setCharHook((obj, arc, o) => { if (!lowGfx) { if (!arc && !(o && o.pbr)) ENV.unifyPalette(obj); /* a hero keeps its own PBR colours */ if (!st.quality.coarse) K.outlineAll(obj, { t: arc ? 0.02 : 0.016 }); } if (S.quality !== "saver" && ENV.rimLight) ENV.rimLight(obj); });
// (b420: every preset but Saver has the cumulus now; the dome reads them from a table baked once, cheaper than before)
const sky = S.quality === "saver" ? K.makeSky() : ENV.makeSkyDome({ lite: st.quality.coarse || lowGfx }); st.scene.add(sky);
if (sky.material.uniforms.uTime) { sky.material.uniforms.uSun.value.copy(sunDir); if (sky.material.uniforms.uMoon) { const mv = sky.material.uniforms.uMoon.value.copy(sunDir); mv.y = Math.min(mv.y, 0.6); mv.normalize(); } /* the moon stands where the night shadows come from */ try { sky.userData.bake(st.renderer); } catch (e) { console.warn("sky:", e); } st.on((dt) => { sky.material.uniforms.uTime.value += dt; }); }
// Low has no picture chain (world-post.js), so its vignette is a still layer over the canvas: no pass of its own
if (postLevel === "low" && S.quality !== "saver") { const v = document.createElement("div"); v.className = "wp-vig"; v.setAttribute("aria-hidden", "true"); v.style.cssText = "position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 50%,transparent 55%,rgba(12,30,56,.24) 100%)"; cv.after(v); }
// rolling hills round the edge of the world (world-env.js) in place of the old round blobs
st.on((dt, t) => { if (K.arcTick) K.arcTick(dt, planet.position); LOOK.lookOrigin.value.copy(planet.position); ENV.CLOUD.t.value = t; try { if (sky.material.uniforms.uT) sky.material.uniforms.uT.value = t; } catch { /* sky not made yet */ } });
// the town's lights pulse with the music's beat (the light lines, the plaza rings); stronger on a concert night
st.on(() => { try { if (mode !== "hub" || reduce) return; const b = music.level ? music.level() : 0, k = b * (concertOn() ? 0.9 : 0.4); if (K.arcPulse) K.arcPulse(k * 0.6); if (fountain.userData.pulse) fountain.userData.pulse(k); } catch { /* still loading */ } });
// concert night: Saturdays 20:00–23:00 Seoul time (?concert=1 to try it): the stage lights up and the town pulses harder
function concertOn() { try { const q = new URLSearchParams(location.search).get("concert"); if (q) return q === "1"; } catch { /* fine */ } const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCDay() === 6 && d.getUTCHours() >= 20 && d.getUTCHours() < 23; }
{ const blobs = groundG.getObjectByName("blobs"); if (blobs) groundG.remove(blobs); groundG.add(ENV.makeHills({ inner: 312, outer: 480 })); if (ENV.makeRange && !/[?&]norange\b/.test(location.search)) groundG.add(ENV.makeRange({ r0: 540, r1: 640 })); /* b-land: pushed back for the LAND ring */ }
const skyPlanets = K.makeSkyPlanets(VER); st.scene.add(skyPlanets);
const stars = K.makeStars(); st.scene.add(stars);
const halo = K.makeHalo(0.5); halo.position.set(0, 135, -360); halo.rotation.set(0.32, 0.2, 0); halo.traverse((o) => { if (o.material) o.material.fog = false; }); st.scene.add(halo);
const clouds = K.makeClouds(); planet.add(clouds);
// mountains on the horizon, birds, butterflies and fish (world-ambient.js; nothing but the mountains on Low)
const amb = AMB.createAmbient({ THREE, planet, low: lowGfx, bats: HW.halloweenOn() }); let ambNight = 0; // ambNight: set by dayNight
// anonymous health counters (world-diag.js): script errors, the frame rate band, a GPU memory climb
// b-st3: the first minutes, counted (world-diag.js funnel): each step once a visit; nw = this browser's first visit
const FUN_NEW = (() => { try { const k = "arc.world.fun0"; const was = localStorage.getItem(k); if (!was) localStorage.setItem(k, String(Date.now())); return !was; } catch { return false; } })();
const funSent = new Set(); const fun = (ev) => { if (funSent.has(ev)) return; funSent.add(ev); try { if (diag && diag.funnel) diag.funnel(ev, FUN_NEW); } catch { /* fine */ } };
const diag = DIAG.createDiag({ who: () => { const s0 = sess(); return s0 ? { w: s0.wallet, nm: (typeof P !== "undefined" && P && P.name) || "" } : {}; }, ver: VER, post, renderer: st.renderer, quality: S.quality || "auto", coarse: !!st.quality.coarse, tier: K.gpuTier ? K.gpuTier() : "", cap: () => { try { return capNow(); } catch { return S.fpsCap || autoCap || 60; } }, work: () => (st.work ? st.work.last : -1), where: () => (survOn ? "surv" : ringsOn ? "rings" : pokerOn ? "poker" : mineOn ? "mine" : defenseOn ? "def" : jumpOn ? "jump" : beatOn ? "beat" : mode === "island" ? "isle" : combat && combat.zone() ? "zone" : (() => { try { return landNow === "ad" ? "city" : landNow === "rq" ? (rqL && rqL.running() ? "raid" : "rqhall") : "hub"; } catch { return "hub"; } })()), busy: () => !!(combat && combat.dangerNear && combat.dangerNear(14)), active: () => { try { return mode === "hub" && !frozen && !photo; } catch { return false; } } });
// a phone turned sideways or back: what its browser did with the page's scale (play.html window.__arcVp), in the player's
// log — a phone in full screen once kept the upright layout and drew the HUD huge, and this container can't hold one
if (document.documentElement.classList.contains("wp-pcphone")) { let was = document.documentElement.classList.contains("wp-land"), vpT = 0; // (the turn's log line ends "→ phone layout" when the page fell back to the phone's own width)
  new MutationObserver(() => { const now = document.documentElement.classList.contains("wp-land"); if (now === was) return; was = now; clearTimeout(vpT);
    vpT = setTimeout(() => { try { const v = window.__arcVp || {}; diag.err(`vp ${now ? "land" : "up"}: W${v.W} iw${innerWidth}x${innerHeight} scr${screen.width}x${screen.height} ${v.o || ""}${document.fullscreenElement ? " fs" : ""}${v.off ? " off→" + (v.after || "?") : ""}${v.dev ? " → phone layout" : ""}`, "vp"); } catch { /* not sent */ } }, 2500); }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] }); }
// a load that hasn't finished after 45 s says where it stopped (?world=diag errors: the step, the quality, the pixel ratio,
// whether the graphics context was lost) — a Mac stayed at 85 % for hours (2026-10-24) and nothing had been reported
let glLost = false; try { st.renderer.domElement.addEventListener("webglcontextlost", () => { glLost = true; glLostLoading(); }); } catch { /* no canvas */ }
// players still stuck on the loading screen (the owner, 2026-10-25; diag: iPhones and an Adreno 730 losing the graphics
// context while the town's shaders compile, three.js then throws "shaderSource … not a WebGLShader" and the load stops):
// lost while loading → Low graphics (fewer shaders, a smaller canvas) and one reload by itself; a second loss shows the
// watchdog's message as before
function glLostLoading() {
  const b = $("wp-loadbar"); if (!b || !b.isConnected || b.style.width === "100%") return;
  let tried = false; try { tried = !!sessionStorage.getItem("arc.gl.retry"); } catch { /* private: try once anyway */ }
  try { diag.err(`gl lost while loading at ${loadAt} · ${S.quality || "auto"}${tried ? " · again" : " · retry light"}`, "load"); } catch { /* not sent */ }
  if (tried) return;
  try { sessionStorage.setItem("arc.gl.retry", "1"); const o = JSON.parse(localStorage.getItem(SETS) || "{}"); o.quality = "low"; localStorage.setItem(SETS, JSON.stringify(o)); } catch { /* reload anyway */ }
  setTimeout(() => location.reload(), 1200);
}
// the loading's waits, each with an end (a step that never settles reports itself once and lets the load go on), and
// the loading screen's "Enter now" (play.html's watchdog, after 20 s on one step) that ends every one of them
let bootSkipped = false, bootSkipFn = null; const bootSkip = new Promise((r) => { bootSkipFn = r; });
window.__arcBootSkip = () => { bootSkipped = true; try { diag.err(`load: Enter now at ${loadAt}`, "load"); } catch { /* no report */ } bootSkipFn(); };
function capWait(p, ms, what, skip = true) { let late = false; return Promise.race([Promise.resolve(p).catch((e) => { try { diag.err(`load ${what}: ${(e && e.message) || e}`, "load"); } catch { /* no report */ } return null; }), new Promise((r) => setTimeout(() => { late = true; r(null); }, ms)), ...(skip ? [bootSkip.then(() => null)] : [])]).then((v) => { if (late) try { diag.err(`load ${what} timed out at ${loadAt}`, "load"); } catch { /* no report */ } return v; }); }
// where the load waits, sent at 15 s too (the 45 s report below came from almost nobody: most leave before that)
setTimeout(() => { const b = $("wp-loadbar"); if (b && b.isConnected && b.style.width !== "100%") try { diag.err(`load slow 15s at ${loadAt} · ${S.quality || "auto"} · ${glLost ? "GL LOST" : "gl ok"} · ${document.hidden ? "hidden" : "shown"}`, "load"); } catch { /* not sent */ } }, 15000);
setTimeout(() => { const b = $("wp-loadbar"); if (b && b.isConnected && b.style.width !== "100%") try { diag.err(`load stall at ${loadAt} · ${S.quality || "auto"} · dpr ${devicePixelRatio} · ${glLost ? "GL LOST" : "gl ok"} · ${document.hidden ? "hidden" : "shown"}`, "load"); } catch { /* not sent */ } }, 45000);
fun("open"); st.on(() => { if (!funSent.has("move") && mode === "hub" && speedNow > 1.5) fun("move"); });
st.on((dt) => { try { diag.tick(dt); } catch { /* health counters must never stop the game */ } });
st.on((dt, t) => { let hub = true; try { hub = mode === "hub"; } catch { /* still loading */ } amb.root.visible = hub; if (hub) amb.tick(dt, t, -planet.position.x, -planet.position.z, ambNight, st.scene.fog && st.scene.fog.color, !!ZN.zoneAt(-planet.position.x, -planet.position.z)); });
// b-lpv (the owner's call, 2026-10-23): the Launchpad Village and the Utility Village are lands of their own past the
// town (world-lands.js), reached by the portals that stand where the shops' ring was; the plaza is open now. The town
// keeps the Dark Market's sign; the roads run from the plaza to the portals
const lands = LD.makeLands({ THREE, K, planet, T: TW, low: lowGfx, ver: VER, groundMat: (groundG.children.find((m) => m.isMesh && m.material && m.material.map) || {}).material || null, onModel: () => { if (labels) labels.dirty = true; farCull.rescan(); if (gshadow) gshadow.rebakeSoon(); } });
planet.add(K.makePaths(lands.spokes)); planet.add(K.makeDistrictSigns(["dark"])); planet.add(K.makeDistrictTints(["dark"]));
st.on((dt, t) => { try { lands.tick(dt, t); } catch { /* a land's sign is drawing */ } });
const lamps = K.makeLamps(); planet.add(lamps);
// b-nx3 (2026-10-26, the owner: the plaza remastered after Meshy's mock-up): benches facing the fountain, flower
// planters and blue banners on the open ring between the plaza's edge and the portals, kept off the portals' and the
// hunting grounds' paths. Meshy models (models/world/plaza, 3.5 k tris and 512 px KTX2 each, ~150 KB), one instanced
// mesh per part (a handful of draws for all of them), loaded once the town is up; fewer on low graphics.
function plazaDress() {
  const ang = (x, z) => ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360, away = [];
  try { for (const w of WORN_PATHS) away.push(ang(w[0], w[1])); } catch { /* no paths */ }
  for (const ph of [0, 70, 150, 300]) away.push(ph);
  const free = []; for (let ph = 4; ph < 360; ph += 8) if (away.every((a) => Math.min(Math.abs(a - ph), 360 - Math.abs(a - ph)) > 7)) free.push(ph);
  const few = lowGfx || S.quality === "saver";
  const pick = (n, off) => { const out = new Set(); for (let i = 0; i < n && free.length; i++) out.add(free[Math.floor((i + off / 4) * free.length / n) % free.length]); return [...out]; };
  const PLAN = [["park-bench", 13, pick(few ? 3 : 6, 0), 0.95, 0], ["flower-planter", 15.6, pick(few ? 4 : 8, 1), 1.0, 0], ["banner-pole", 18.4, pick(few ? 2 : 5, 2), 4.4, 0]];
  if (!few) PLAN.push(["hedge-block", 16.2, pick(5, 3), 0.9, 0]);
  const grp = new THREE.Group(); grp.name = "plaza-dress"; planet.add(grp);
  const o3 = new THREE.Object3D(), mm = new THREE.Matrix4();
  for (const [file, th, phis, h, turn] of PLAN) {
    if (!phis.length) continue;
    K.gltfLoader().load(`/models/world/plaza/${file}.glb${VER}`, (gl) => {
      const src = gl.scene; src.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(src), sz = box.getSize(new THREE.Vector3()), k = h / Math.max(sz.y, 1e-3), c = box.getCenter(new THREE.Vector3());
      const fix = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
      src.traverse((m) => { if (!m.isMesh) return;
        const im = new THREE.InstancedMesh(m.geometry, m.material, phis.length); im.name = "plaza:" + file; im.castShadow = !lowGfx; im.receiveShadow = true;
        phis.forEach((ph, i) => { K.placeOn(o3, K.dirOf(th, ph)); o3.rotateY(turn); o3.updateMatrix(); mm.multiplyMatrices(o3.matrix, fix).multiply(m.matrixWorld); im.setMatrixAt(i, mm); });
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); grp.add(im); });
    }, undefined, () => { /* the plaza stays as it was */ });
  }
}
setTimeout(() => { try { plazaDress(); } catch (e) { console.warn("plaza dress", e); } }, 2500);
// at night the three lamps nearest you really light what's round them (you, scammers, the walls): three point lights
// that move to whichever lamps are closest (a computer; a phone keeps the painted pools)
// the lamps' three point lights cost every lit surface on screen a little more: Ultra only (b411; Auto on a computer had them)
const lampLights = lowGfx || st.quality.coarse || postLevel !== "ultra" ? [] : [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffc27a, 0, 11, 1.7); l.castShadow = false; planet.add(l); return l; });
{ const spots = lamps.userData.spots || [], v = new THREE.Vector3(); let t = 0;
  st.on((dt) => { if (!lampLights.length || !spots.length) return; const k = typeof ambNight === "number" ? ambNight : 0;
    if (k < 0.05) { lampLights.forEach((l) => { l.intensity = 0; }); return; }
    if ((t -= dt) <= 0) { t = 0.5; v.set(-planet.position.x, 0, -planet.position.z); const near = spots.map(([x, z]) => [x, z, (x - v.x) ** 2 + (z - v.z) ** 2]).sort((a, b) => a[2] - b[2]); lampLights.forEach((l, i) => { const p = near[i]; if (p) l.position.set(p[0], 2.75, p[1]); }); }
    lampLights.forEach((l) => { l.intensity = 28 * k; }); }); }
// Halloween (world-halloween.js, 17 Oct – 2 Nov): pumpkins by the lamps and round the fountain, glowing after dark
const halloween = HW.halloweenOn(), pumpkins = halloween && !lowGfx ? HW.createPumpkins({ THREE, planet, spots: lamps.userData.spots || [], extra: Array.from({ length: 8 }, (_, i) => [Math.sin((i / 8) * Math.PI * 2 + 0.2) * 6.4, -Math.cos((i / 8) * Math.PI * 2 + 0.2) * 6.4, 1.1]) }) : null;
// rain wets the world: the ground darkens and turns glossy, puddles gather on the lawns, the halls' shells shine
const puddles = (() => { const g = new THREE.Group(); g.name = "puddles"; g.visible = false; g.userData.noBake = true; let s = 11; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.04, metalness: 0.65, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  for (let i = 0; i < 46; i++) { const a = r() * Math.PI * 2, d = K.flatR(12) + r() * 70, m = new THREE.Mesh(new THREE.CircleGeometry(0.6 + r() * 1.6, 20), mat); m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.55 + r() * 0.6, 1); m.rotation.z = r() * 6; m.position.set(Math.cos(a) * d, 0.045, Math.sin(a) * d); g.add(m); }
  return g; })();
planet.add(puddles);
let wet = false;
function setWet(on) {
  if (on === wet) return; wet = on; puddles.visible = on;
  const gm = groundG.children.find((m) => m.isMesh && m.material && m.material.map);
  if (gm) { gm.material.roughness = on ? 0.5 : 0.95; gm.material.color.setScalar(on ? 0.8 : 1); }
  setTimeout(() => { try { nightK = -1; dayNight(); } catch { /* not set up yet: dayNight runs at the start anyway */ } }, 0); // the grass darkens a touch
}
const spins = [];
// a lighter town (2026-10-26, the owner: "a lighter town"): every few seconds the new things in the world are looked at once —
// a see-through two-sided material draws in one pass instead of two (three.js draws back faces then front ones: for an
// additive glow or a hologram the order can't show), glows and see-through things stop casting shadows, and the
// holograms by the path are hidden when you're far from them
const lightSeen = new WeakSet(), lightFar = [];
// b-perf2 (2026-10-26, diag: PowerVR / Mali-G5x phones under 15 fps, 315 shader programs and ~1,070 materials in the
// town): cheaper materials where it pays. Phones and the lower computer chips: MeshPhysical (the Meshy models' glTF
// extensions) → MeshStandard. The weakest chips (K.gpuWeak) and any phone still slow after the other steps (liteFx):
// MeshStandard → MeshLambert. Only plain ones are swapped: opaque, not glowing, no shader hook of their own, not on a
// skinned body (the heroes and the monsters keep theirs) — what code animates is transparent or glowing. Swapped
// copies with the same look are shared, so there are fewer materials too. ?weakgpu tries the Lambert step on any device.
const PLAIN_HOOK = THREE.Material.prototype.onBeforeCompile, cheapOf = new WeakMap(), cheapKey = new Map();
const physToStd = coarse || K.gpuTier() !== "high" || /[?&]weakgpu\b/.test(location.search);
let lambertOn = false;
function wantLambert() { try { return /[?&]weakgpu\b/.test(location.search) || (S.quality === "auto" && (!!st.quality.weak || !!liteFx)); } catch { return false; } }
const cheapProps = ["map", "alphaMap", "aoMap", "aoMapIntensity", "lightMap", "lightMapIntensity", "normalMap", "normalScale", "bumpMap", "bumpScale", "emissiveMap", "side", "vertexColors", "alphaTest", "fog", "flatShading", "depthWrite", "depthTest", "polygonOffset", "polygonOffsetFactor", "polygonOffsetUnits"];
function cheapMat(m) {
  if (!m || m.transparent || m.onBeforeCompile !== PLAIN_HOOK || (m.userData && m.userData.keep)) return m;
  const glow = !!(m.emissive && m.emissive.getHex() && (m.emissiveIntensity || 0) > 0); // (a glow may be pulsed by code: only the weakest chips' step takes it, as it is now)
  const toL = lambertOn && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial), toS = !toL && !glow && physToStd && m.isMeshPhysicalMaterial;
  if (!toL && !toS) return m;
  const had = cheapOf.get(m); if (had && (had.isMeshLambertMaterial || !toL)) return had;
  const key = [toL ? "L" : "S", m.color && m.color.getHexString(), m.emissive ? m.emissive.getHexString() + "*" + m.emissiveIntensity : "", ...cheapProps.map((k) => { const v = m[k]; return v && v.isTexture ? v.uuid : v && v.isVector2 ? v.x + "," + v.y : String(v); }), toS ? [m.roughness, m.metalness, m.roughnessMap && m.roughnessMap.uuid, m.metalnessMap && m.metalnessMap.uuid, m.envMap && m.envMap.uuid, m.envMapIntensity].join() : ""].join("|");
  let n = cheapKey.get(key);
  if (!n) {
    n = toL ? new THREE.MeshLambertMaterial() : new THREE.MeshStandardMaterial();
    if (m.color) n.color.copy(m.color); if (m.emissive) { n.emissive.copy(m.emissive); n.emissiveIntensity = m.emissiveIntensity; }
    for (const k of cheapProps) { if (m[k] === undefined || n[k] === undefined) continue; if (m[k] && m[k].isVector2) n[k].copy(m[k]); else n[k] = m[k]; }
    if (toS) for (const k of ["roughness", "metalness", "roughnessMap", "metalnessMap", "envMap", "envMapIntensity"]) n[k] = m[k];
    n.name = m.name; n.userData.cheap = true; cheapKey.set(key, n);
  }
  cheapOf.set(m, n); return n;
}
function cheapen(o) {
  if (!o.isMesh || o.isSkinnedMesh || !o.material) return;
  if (Array.isArray(o.material)) { let ch = false; const a = o.material.map((m) => { const n = cheapMat(m); if (n !== m) ch = true; return n; }); if (ch) o.material = a; }
  else { const n = cheapMat(o.material); if (n !== o.material) o.material = n; }
}
// PF6 (2026-10-27, diag: phones still built ~50 MeshPhysical shaders after lighten's pass): a thing added to the scene
// gets its cheaper material at once, before it's ever drawn — lighten() comes by only every 3 s, so a new thing first
// compiled the heavy shader, then the cheap one (two stalls instead of one)
if (physToStd) { const add0 = THREE.Object3D.prototype.add; THREE.Object3D.prototype.add = function (...a) { const r = add0.apply(this, a); try { for (const o of a) if (o && o.traverse && o !== this) o.traverse(cheapen); } catch { /* lighten() catches it */ } return r; }; }
function lighten(root) {
  if (!lambertOn && wantLambert()) { lambertOn = true; root.traverse(cheapen); } // (once it turns on: everything already there too)
  root.traverse((o) => {
    if (!o.isMesh && !o.isSprite && !o.isPoints) return;
    if (!lightSeen.has(o)) { lightSeen.add(o); cheapen(o); if (o.name === "agent-holo" || (o.parent && o.parent.name === "agent-holo")) { /* (the group is checked below) */ }
      for (const m of [].concat(o.material || [])) { if (!m || lightSeen.has(m)) continue; lightSeen.add(m);
        if (m.transparent && m.side === THREE.DoubleSide && (m.blending === THREE.AdditiveBlending || m.depthWrite === false)) m.forceSinglePass = true; }
      const m0 = [].concat(o.material || [])[0]; if (o.castShadow && m0 && (m0.isMeshBasicMaterial || m0.isShaderMaterial || m0.isPointsMaterial || m0.transparent || m0.blending === THREE.AdditiveBlending)) o.castShadow = false; }
  });
  root.children.forEach((g) => { if (g.name === "agent-holo" && !lightSeen.has(g)) { lightSeen.add(g); lightFar.push(g); } });
}
let lightT = 0; // (by the clock: a slow phone's frames mustn't put it off)
const lightV = new THREE.Vector3();
st.on(() => { const nw = performance.now(); if (nw < lightT) return; lightT = nw + 3000; try { lighten(planet); here(lightV); for (const g of lightFar) g.visible = g.position.distanceTo(lightV) < (coarse ? 30 : 70); /* (PF4: 30 m on a phone) */ } catch { /* the world isn't up yet */ } });
let mixLod = 0; const mixV = new THREE.Vector3(), camFr = new THREE.Frustum(), camFrM = new THREE.Matrix4(), camSph = new THREE.Sphere(new THREE.Vector3(), 2.5); // the animation LOD below (the loop)
const shops = K.SHOPS.map((spec) => { const g = K.makeShop(spec); K.placeOn(g, K.dirOf(spec.theta, spec.phi)); g.position.x += LD.LANDS.ut.x; g.position.z += LD.LANDS.ut.z; planet.add(g); /* b-lpv: in the Utility Village, as they stood round the plaza */ K.shadowy(g); spins.push(...g.userData.spin); return g; });
shops.forEach((g) => { const cs = LOOK.contactShadow((g.userData.radius || 3) + 2.2, 0.38); cs.position.x = g.position.x; cs.position.z = g.position.z; planet.add(cs); });
const shopG = (id) => shops.find((g) => g.userData.spec.id === id);
const portal = K.makePortal(T("Platform World")); K.placeOn(portal, K.dirOf(K.PORTAL.theta, K.PORTAL.phi)); planet.add(portal); spins.push(...portal.userData.spin);
// the way to the islands
// the Jurassic Portal (world-jurassic.js): an old stone gate with a swirl of ARCIRCLE blue and mint; GM wallets go in,
// (open to everyone since launch)
const jurGate = JG.makeJurassicGate(THREE, K, TW("Jurassic World"), { low: lowGfx });
K.placeOn(jurGate, K.dirOf(K.spreadTheta(14), 205)); planet.add(jurGate); spins.push(...jurGate.userData.spin);
// the gate's light hangs on the planet itself: inside the gate it went out whenever far culling hid the gate, and a light
// coming and going makes every lit shader in town again (on a phone a blank, half-drawn screen near the portal)
if (jurGate.userData.glow) { planet.updateMatrixWorld(true); planet.attach(jurGate.userData.glow); }
// AGENT DIMENSION's gate: the Nexus Infinity Citadel (the owner's model, models/world/agents/citadel.glb), 20 m tall, due
// east beyond the Exchange (K.AGENT_GATE: open ground, off every road out), facing the plaza. Seen from afar: a sign
// board over it that always faces you and isn't fogged (the town's name labels fade out past 42 m), a 70 m beam, a worn
// path to its door and a mark on the minimap. Walk up to it: the agent window (world-agent.js) opens.
const agentGate = new THREE.Group(); agentGate.name = "agent-gate"; agentGate.userData.radius = K.AGENT_GATE.r;
K.placeOn(agentGate, K.dirOf(K.spreadTheta(K.AGENT_GATE.theta), K.AGENT_GATE.phi)); planet.add(agentGate);
{ const R0 = K.AGENT_GATE.r + 1.5, H = K.AGENT_GATE.h;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0 + 0.5, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x14203a, metalness: 0.6, roughness: 0.35, emissive: 0x0a2a55, emissiveIntensity: 0.6 })); pad.position.y = 0.15; agentGate.add(pad);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.15, 0.12, 8, 128), new THREE.MeshBasicMaterial({ color: 0x5fd3ff, toneMapped: false })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.32; agentGate.add(rim);
  // the sign: a board drawn once (its words in the player's language), turned to the camera as it's drawn
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 288; const g = cv.getContext("2d");
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const bg = g.createLinearGradient(0, 0, 0, 288); bg.addColorStop(0, "rgba(10,24,56,.92)"); bg.addColorStop(1, "rgba(4,10,28,.92)"); rr(8, 8, 1008, 272, 44); g.fillStyle = bg; g.fill();
  g.lineWidth = 8; const bd = g.createLinearGradient(0, 0, 1024, 0); bd.addColorStop(0, "#ffc94a"); bd.addColorStop(0.5, "#5fd3ff"); bd.addColorStop(1, "#b15cff"); g.strokeStyle = bd; g.stroke();
  g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "#5fd3ff"; g.shadowBlur = 24; g.fillStyle = "#ffffff"; g.font = "900 118px Sora, 'Segoe UI', sans-serif"; g.fillText("AGENT DIMENSION", 512, 118, 960);
  g.shadowBlur = 0; g.fillStyle = "#ffe066"; g.font = "800 54px Sora, 'Segoe UI', sans-serif"; g.fillText("🚧 " + TW("Under construction"), 512, 222, 940); // not open yet (the owner's call, 2026-10-22): GM wallets only
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(18, 5.06), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); board.position.set(0, H * 0.7, 8); board.renderOrder = 11; agentGate.add(board); agentGate.userData.sign = board;
  const qp = new THREE.Quaternion(); board.onBeforeRender = (r, sc, cam) => { agentGate.getWorldQuaternion(qp); board.quaternion.copy(qp.invert().multiply(cam.quaternion)); board.updateMatrixWorld(); };
  const beam = K.makeBeacon ? K.makeBeacon(0x5fd3ff, 70) : null; if (beam) { agentGate.add(beam); spins.push(beam.userData.spin); }
  spins.push((dt, t) => { rim.material.color.setHSL(0.55 + Math.sin(t * 0.8) * 0.04, 1, 0.6); board.position.y = H * 0.7 + Math.sin(t * 1.3) * 0.25; }); }
setTimeout(() => { try { K.gltfLoader().load(`/models/world/agents/citadel.glb${VER}`, (g) => {
  const o = g.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), k = K.AGENT_GATE.h / (sz.y || 1);
  o.scale.setScalar(k); o.position.set(-(box.min.x + sz.x / 2) * k, 0.3 - box.min.y * k, -(box.min.z + sz.z / 2) * k);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = !lowGfx; m.receiveShadow = false; } }); agentGate.add(o); agentGate.userData.model = o; if (labels) labels.dirty = true; farCull.rescan(); if (gshadow) gshadow.rebakeSoon();
}, undefined, (e) => console.warn("citadel", e)); } catch (e) { console.warn("citadel", e); } }, 9000); // after the town's own models: it's 1.2 MB and far off the plaza
// RAID QUEENS (world-raidq.js, the owner's design 2026-10-24): the Crimson Eternity Citadel (the owner's GLB) north-west,
// past The Last Rug (open ground ~150 m out), facing the plaza; a sign, a red beam. Walk up → a warp → the land (LD.LANDS.rq)
const RQ_TRY = /[?&]rq=1/.test(location.search); // RAID QUEENS: open to GM wallets only for now (the owner, 2026-10-25); ?rq=1 to look as a guest
const RQ_OPEN = true; // RAID QUEENS open to everyone (the owner, 2026-10-25; world-raidq-data.js / api/_world-raidq.mjs RQ.OPEN)
const rqGM = () => { try { const s0 = sess(); return !!(s0 && VILL.isGM(String(s0.wallet).toLowerCase())); } catch { return false; } };
const rqOn = () => RQ_OPEN || RQ_TRY || rqGM();
const RQ_GATE = { x: -46, z: 143, h: 16, r: 8 }; let rqL = null, rqWait = null; // (rqL: the land, world-raidq.js, built the first time you go in)
const rqGate = new THREE.Group(); rqGate.name = "rq-gate"; rqGate.userData.radius = RQ_GATE.r; rqGate.position.set(RQ_GATE.x, 0, RQ_GATE.z); rqGate.rotation.y = Math.atan2(-RQ_GATE.x, -RQ_GATE.z); rqGate.visible = false; planet.add(rqGate); // (shown, and its model fetched, once rqOn(): rqGateTick)
{ const R0 = RQ_GATE.r + 2.5;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0 + 0.5, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x1e1220, metalness: 0.6, roughness: 0.35, emissive: 0x4a0a22, emissiveIntensity: 0.6 })); pad.position.y = 0.15; rqGate.add(pad);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.15, 0.12, 8, 128), new THREE.MeshBasicMaterial({ color: 0xff4d8d, toneMapped: false })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.32; rqGate.add(rim);
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 288; const g = cv.getContext("2d");
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const bg = g.createLinearGradient(0, 0, 0, 288); bg.addColorStop(0, "rgba(40,8,24,.92)"); bg.addColorStop(1, "rgba(14,4,12,.92)"); rr(8, 8, 1008, 272, 44); g.fillStyle = bg; g.fill();
  g.lineWidth = 8; const bd = g.createLinearGradient(0, 0, 1024, 0); bd.addColorStop(0, "#ffd36a"); bd.addColorStop(0.5, "#ff4d6d"); bd.addColorStop(1, "#9fd4ff"); g.strokeStyle = bd; g.stroke();
  g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "#ff4d6d"; g.shadowBlur = 24; g.fillStyle = "#ffffff"; g.font = "900 124px Sora, 'Segoe UI', sans-serif"; g.fillText("RAID QUEENS", 512, 118, 960);
  g.shadowBlur = 0; g.fillStyle = "#ffd36a"; g.font = "800 50px Sora, 'Segoe UI', sans-serif"; g.fillText(TW("Lv 100+ · A new hunting ground"), 512, 222, 940);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); board.position.set(0, RQ_GATE.h + 3.2, 0); board.renderOrder = 11; rqGate.add(board);
  const qp = new THREE.Quaternion(); board.onBeforeRender = (r, sc, cam) => { rqGate.getWorldQuaternion(qp); board.quaternion.copy(qp.invert().multiply(cam.quaternion)); board.updateMatrixWorld(); };
  const beam = K.makeBeacon ? K.makeBeacon(0xff4d8d, 60) : null; if (beam) { rqGate.add(beam); spins.push(beam.userData.spin); }
  spins.push((dt, t) => { rim.material.color.setHSL(0.94 + Math.sin(t * 0.8) * 0.03, 1, 0.62); board.position.y = RQ_GATE.h + 3.2 + Math.sin(t * 1.3) * 0.25; }); }
function rqGateModel() { if (rqGate.userData.loading) return; rqGate.userData.loading = 1; try { K.gltfLoader().load(`/models/world/raid/gate.glb${VER}`, (g) => {
  const o = g.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), k = RQ_GATE.h / (sz.y || 1);
  o.scale.setScalar(k); o.position.set(-(box.min.x + sz.x / 2) * k, 0.3 - box.min.y * k, -(box.min.z + sz.z / 2) * k);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = !lowGfx; m.receiveShadow = false; } }); rqGate.add(o); rqGate.userData.model = o; if (labels) labels.dirty = true; farCull.rescan(); if (gshadow) gshadow.rebakeSoon();
}, undefined, (e) => { console.warn("raid gate", e); rqGate.userData.loading = 0; }); } catch (e) { console.warn("raid gate", e); rqGate.userData.loading = 0; } }
// (1 MB, far off the plaza: after the town's own models; a GM signing in later sees it appear)
// (2026-10-25, the owner: the Citadel stands in the sky realm now — RAID QUEENS' own land, world-raidq.js hall — reached by the portal on the far hunting ring; this one stays hidden)
// hologram signs along the worn path to it: the three agents' faces turning in light, every ~14 m
{ const holoTex = {}, ld = new THREE.TextureLoader();
  ["aurora", "orion", "vex", "aurora", "orion"].forEach((k, i) => {
    const f = 0.28 + i * 0.13, x = AGW.x * f, z = AGW.z * f, side = i % 2 ? 1 : -1, d = Math.hypot(AGW.x, AGW.z) || 1, nx = -AGW.z / d * side * 3.2, nz = AGW.x / d * side * 3.2;
    const g = new THREE.Group(); g.name = "agent-holo"; K.placeOn(g, K.dirOf(Math.hypot(x + nx, z + nz) / (K.FLAT * K.R) * 180 / Math.PI, (Math.atan2(x + nx, -(z + nz)) * 180 / Math.PI + 360) % 360)); planet.add(g);
    const tx = holoTex[k] || (holoTex[k] = ld.load(`/images/agents/${k}-400.webp${VER}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; }));
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); pl.position.y = 2.2; g.add(pl);
    const col = K.AGENTS[k].color, base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.25, 20), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); base.position.y = 0.12; g.add(base);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.4, 2.2, 20, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); cone.position.y = 1.3; g.add(cone);
    spins.push((dt, t) => { pl.rotation.y = t * 0.9 + i; pl.position.y = 2.2 + Math.sin(t * 1.6 + i) * 0.12; pl.material.opacity = 0.7 + Math.sin(t * 7 + i * 2) * 0.08 + (Math.sin(t * 23 + i) > 0.97 ? -0.4 : 0); });
  }); }
const isleGate = K.makePortal(T("My Island")); K.placeOn(isleGate, K.dirOf(K.spreadTheta(14), 140)); planet.add(isleGate); spins.push(...isleGate.userData.spin);
isleGate.traverse((o) => { if (o.isMesh && o.material && o.material.emissive && !o.material.transparent) { o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(0x7ee0a0), 0.5); o.material.emissive.lerp(new THREE.Color(0x7ee0a0), 0.5); } });
// the plaza: the ARCIRCLE rings fountain in the middle, an arch over each district's way out, the plaza screen
const fountain = K.makeFountain(); planet.add(fountain); spins.push(...fountain.userData.spin);
// the fountain's middle tier is solid; its pool you can still wade through
const fountainCore = new THREE.Group(); fountainCore.userData.radius = 2.1; planet.add(fountainCore);
const arches = [[0, 0x39ff88], [78, 0xffc861], [227, 0x35d8d0], [296, 0xff7ad9]] /* the Research arch on its district's bearing (227°): at 212° it stood right in front of the Jurassic World portal (205°) */.map(([ph, c]) => { const a = K.makeArch(c); K.placeOn(a, K.dirOf(13.2, ph)); planet.add(a); return a; });
const screen = K.makeScreen(); K.placeOn(screen, K.dirOf(9.5, 48)); planet.add(screen);
// the fast-travel pad at the edge of the plaza
const pad = new THREE.Group(); { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.09, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffc861, emissive: 0xffc861, emissiveIntensity: 2 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.18, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.07; const tag = K.label(T("Fast travel"), { accent: "#ffc861", size: 0.55 }); tag.position.y = 2.2; pad.add(ring, disc, tag); pad.userData = { radius: 1.2, spin: [(dt, t) => { ring.rotation.z = t; disc.material.opacity = 0.14 + Math.sin(t * 3) * 0.06; }] }; spins.push(...pad.userData.spin); }
K.placeOn(pad, K.dirOf(7, 90)); planet.add(pad);
// AC Defense moved to the Game Village (world-gamevillage.js): a clearing west of the plaza where the mini-games live,
// each in its own building; walk up to the AC Defense tower's door to play. The square in the middle is the arena
// the wind in the tree crowns (world-kit.js sway): still on low quality and with reduced motion
if (!lowGfx && !reduce && K.wind) st.on((dt) => { K.wind.value += dt; });
// b447 (village remaster): the looks the village takes; Low keeps the plain ones (flat tiles, still water, no contact shade)
const gvLook = { hexFloor: (m, r) => LOOK.hexFloorLook(m, { r, low: lowGfx }), pond: (m) => LOOK.pondLook(m, { low: lowGfx }) }; // (contact shade is everywhere now: installContactShade)
const gv = GV.makeGameVillage({ THREE, K, planet, T: TW, low: lowGfx, look: gvLook, compile: (o) => { try { return compileHidden([o]); } catch { return null; } } }); gv.clear(groundG);
// ARCIRCLE Studio by the plaza (2026-10-26, the owner: moved from Nexus City to the fountain): the building, its door and four arcade cabinets
const stuHub = SHUB.makeStudioHub({ THREE, K, planet, T: TW, low: lowGfx, ver: VER }); stuHub.clear(groundG);
let stuPollT = -9;
st.on((dt, t) => { if (mode !== "hub") return; stuHub.tick(t); if (t - stuPollT > 5) { stuPollT = t; if (Math.hypot(-planet.position.x - stuHub.center.x, -planet.position.z - stuHub.center.z) < 60) stuHub.poll(); } });
// b447: the clearing was one flat pale green: now the town ground's patches, fine grain and drifting cloud shade, and the baked town shade
{ const gg = gv.root.getObjectByName("gv-ground"); if (gg) { LOOK.groundLook(gg.material, { low: lowGfx }); if (gshadow) gshadow.receive(gg.material); } }
st.on((dt, t) => { gv.tick(dt, t, -planet.position.x, -planet.position.z); });
// the Partner Village (world-partnervillage.js, 2026-10-22): our official partners' clearing like the Game Village, 140 m
// south-east; its first building the KAIRO Tower — walk up to it and the KAIRO Finance Hub opens (world-partner.js)
const pvil = PV.makePartnerVillage({ THREE, K, planet, T: TW, ver: VER, low: lowGfx, onModel: () => { if (labels) labels.dirty = true; farCull.rescan(); if (gshadow) gshadow.rebakeSoon(); } });
pvil.clear(groundG);
st.on((dt, t) => { pvil.tick(dt, t, -planet.position.x, -planet.position.z); });

// the Mining Village (world-minevillage.js): the ARCL Mine's tunnel in a clearing south-east of the plaza
const mv = MV.makeMineVillage({ THREE, K, planet, T: TW, low: lowGfx, look: gvLook, ver: VER, compile: (o) => { try { return compileHidden([o]); } catch { return null; } } }); mv.clear(groundG);
{ const mg = mv.root.getObjectByName("mv-ground"); if (mg) { LOOK.groundLook(mg.material, { low: lowGfx }); mg.material.color.set(0xd8b98a); if (gshadow) gshadow.receive(mg.material); } }
st.on((dt, t) => { mv.tick(dt, t, -planet.position.x, -planet.position.z); });
planet.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
const glowLight = new THREE.PointLight(0x35d8d0, 5, 7, 2); glowLight.position.set(0, 0.5, 0); st.scene.add(glowLight);
const aurora = K.makeAurora(); aurora.visible = false; st.scene.add(aurora);
const rain = K.makeRain(); rain.visible = false; st.scene.add(rain);
loadbar(0.35);

// the player: a group at the origin; the character inside it turns to face where it walks
const player = new THREE.Group(); st.scene.add(player);
// a soft dark spot right under you, so you never look as if you float (there even where sun shadows are off)
const meShadow = LOOK.contactShadow(0.85, 0.5); meShadow.position.y = 0.05; meShadow.name = "me-contact"; player.add(meShadow);
// light effects (world-vfx.js): portals, teleports, level ups, impacts, the shield
const vfx = VFX.createVfx({ THREE, st, planet, player, low: lowGfx, reduce, lite: () => { try { return liteFx; } catch { return false; } } }); // (liteFx is declared further down)
// each hunting ground's air: snow, sand, bubbles, spores, dust, embers, stars (world-weather.js)
const air = WX.createWeather({ THREE, planet, zones: RPG.ZONES, low: lowGfx, reduce });
spins.push((dt, t) => air.tick(dt, t, -planet.position.x, -planet.position.z, innerHeight));
st.on((dt) => vfx.tick(dt));
spins.push(vfx.portal(portal), vfx.portal(isleGate, { colors: [[0x2ee07a, 0x9fffd0], [0x2f86ff, 0x38e8ff]] }));
// each gate gets its frame (world-gear3d.js): two white pillars and an arch, its name lifted above it
for (const [g, c] of [[portal, 0x38e8ff], [isleGate, 0x2ee07a]]) { g.add(GEAR.gateFrame(c)); g.children.forEach((o) => { if (o.isSprite && o.position.y > 4) o.position.y = 7.6; }); }
const board = GEAR.hoverboard(); board.visible = false; player.add(board); // world-gear3d.js
// the second ride: the explorer rover (level 10); V switches between the two while riding
const rover = GEAR.rover(); rover.visible = false; player.add(rover);
// the third (level 30): a jetpack — you cruise a few metres up, Space climbs higher or comes back down; in a fight it
// keeps you low (the bosses' ground strikes must still reach you)
const jet = GEAR.jetpack(); jet.visible = false; player.add(jet);
// an airship that cruises round the far ring, high up: lights blinking, its name on the side (scenery)
const ship = GEAR.airship(); planet.add(ship); spins.push((dt, t) => { const a = t * 0.018; ship.position.set(Math.cos(a) * 140, 46 + Math.sin(t * 0.3) * 1.5, Math.sin(a) * 140); ship.rotation.y = -a; ship.userData.update(t); });
let ride = (() => { try { const v = localStorage.getItem("arc.world.ride"); return v === "rover" || v === "jet" ? v : "board"; } catch { return "board"; } })();
const rideObj = () => (ride === "rover" ? rover : ride === "jet" ? jet : board);
let jetHigh = false;
const jetOn = () => boarding && ride === "jet" && mode === "hub";
const jetAlt = () => (document.body.classList.contains("wc-fight") || (combat && combat.dangerNear && combat.dangerNear(24)) ? 0.5 : jetHigh ? 8 : 3.2); // near a boss you come down: its strikes must reach you
function switchRide() {
  if (ride === "board" && level() < 10) { toast(T("The rover opens at level {n}", { n: 10 })); return; }
  ride = ride === "board" ? "rover" : ride === "rover" && level() >= 30 ? "jet" : "board"; try { localStorage.setItem("arc.world.ride", ride); } catch { /* fine */ }
  if (boarding) { showRide(); Snd.board(); }
  toast(ride === "rover" ? T("Ride: explorer rover") : ride === "jet" ? T("Ride: jetpack · Space climbs or comes down") : T("Ride: hoverboard"));
  if (ride === "board" && level() >= 10 && level() < 30) setTimeout(() => toast(T("The jetpack opens at level {n}", { n: 30 })), 1400);
}
function showRide() { board.visible = boarding && ride === "board"; rover.visible = boarding && ride === "rover"; jet.visible = boarding && ride === "jet"; if (avatar) avatar.obj.position.y = !boarding || ride === "jet" ? 0 : ride === "rover" ? 0.84 : 0.45; }
addEventListener("keydown", (e) => { if (!worldReady) return; /* still loading */ if ((e.key === "v" || e.key === "V") && !e.repeat && !e.target.closest("input,textarea,[contenteditable]") && mode === "hub") switchRide(); });
let avatar = null, nameTag = null;
// b447: every player is drawn as a hero (world-kit.js HEROES: ARON for now); the save keeps the character it chose
const heroOf = (id) => (K.heroOf ? K.heroOf(id) : id);
// the portrait in the HP card (ART-SPEC interface: the main HUD shows your character's face)
function paintFace() { const imgs = [$("wc-face-img"), $("wp-lv-face")].filter(Boolean), id = P.char || "arc-arc"; if (!imgs.length) return; const put = () => imgs.forEach((img) => { img.src = thumbCache[id]; }); if (thumbCache[id]) { put(); return; } renderThumbsFor([id]).then(() => { if (thumbCache[id]) put(); }); }
// the heroes' battle forms (world-kit.js HERO_FORMS): earned at Lv 300 or with six Crimson Celestial pieces worn, switched on
// in the Character window → Costumes (P.form); others see it too (presence sends the form's id)
const FORM_LV = 300, FORM_PIECES = 6;
function formOk() { let n = 0; try { n = mythicWorn().length; } catch { /* not loaded */ } return level() >= FORM_LV || n >= FORM_PIECES; }
function formOf(id) { const h = heroOf(id || ""), f = h + "x"; return P.form && K.HERO_FORMS && K.HERO_FORMS[f] && formOk() ? f : id; }
// the Crimson Celestial models worn on the hero (mythicModel, below): declared before the first setAvatar — the minified
// build turns these into vars, and a dress() during loading read MYTH_SIZE while it was still undefined (diag, 2026-10-25)
const mythGlb = {}, MYTH_SIZE = { weapon: 1.05, shield: 0.72, helm: 0.62 };
async function setAvatar(id) {
  // an old phone's hero load that never settles (a texture that never decodes, a lost GPU context) held the loading
  // screen at 80 % "Opening the plaza…" (a Mali-T830 in diag, 2026-10-24): after 20 s you go in as the plain robot,
  // and the hero takes its place if it arrives later
  id = formOf(id); // (the battle form, when it's earned and on: Character → Costumes)
  const want = K.makeCharacter(heroOf(id), VER, P.outfit || null), sw = ++avatarSwap; let late = false;
  let a = await Promise.race([want, new Promise((r) => setTimeout(() => { late = true; r(null); }, 20000))]).catch(() => null);
  if (!a) {
    a = await K.makeCharacter("bot");
    if (late) { try { diag.err(`hero load slow: ${heroOf(id)} · dpr ${devicePixelRatio} · ${glLost ? "GL LOST" : "gl ok"}`, "load"); } catch { /* no report */ } want.then((b) => { if (b && sw === avatarSwap) putAvatar(b); }).catch(() => {}); }
  }
  putAvatar(a);
}
let avatarSwap = 0;
function putAvatar(a) {
  setTimeout(paintFace, 300);
  if (avatar) player.remove(avatar.obj);
  if (a.setTint) a.setTint(P.tint || 0); // b447: the hero in your colour
  headYaw = 0; avatar = a; player.add(a.obj); a.obj.rotation.y = facing; a.obj.position.y = !boarding || ride === "jet" ? 0 : ride === "rover" ? 0.84 : 0.45;
  if (rpg) rpg.dress();
  setNameTag(); paintCrown();
}
const PLATES = { "plate-gold": ["#ffc861", "#ffe7a8"], "plate-pink": ["#ff7ad9", "#ffd1f1"], "plate-green": ["#39ff88", "#c9ffe0"], "plate-purple": ["#b48cff", "#e6d9ff"], "plate-flame": ["#ff7a2a", "#ffe0b8"] };
function setNameTag() {
  if (nameTag) { player.remove(nameTag); nameTag.material.map.dispose(); nameTag = null; }
  if (!P.name && !P.guideSeen) return; // (b-st1: a new player has no "Player" over their head before they pick a name)
  const title = BADGES.find((b) => b.id === P.badges[P.badges.length - 1]);
  const pl = PLATES[(P.style || {}).plate] || ["#35d8d0", "#eef3f7"];
  const s = sess(), gm = !!(s && VILL.isGM(s.wallet)); // the GM wallet wears [GM] in gold
  nameTag = K.label((P.crewTag ? `[${P.crewTag}] ` : "") + (P.name || W("Player")), { accent: pl[0], color: pl[1], size: 0.42, sub: (quests && quests.title()) || (title ? T(title.title) : ""), pre: gm ? "[GM]" : "" }); nameTag.position.y = 3.15; player.add(nameTag);
}
// the hoverboard's light trail (a bought colour, or a faint default)
const TRAILS = { "trail-cyan": 0x35d8d0, "trail-gold": 0xffc861, "trail-pink": 0xff7ad9, "trail-rainbow": 0xff4d6d }; // the rainbow one cycles (see the loop)
const trail = (() => {
  const n = 40, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 2 * 3), alpha = new Float32Array(n * 2);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("a", new THREE.BufferAttribute(alpha, 1));
  const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { c: { value: new THREE.Color(0x9fd8ff) }, k: { value: 0.35 } },
    vertexShader: "attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 c; uniform float k; varying float vA; void main(){ gl_FragColor = vec4(c, vA * k); }" });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false;
  const pts = []; // world-group positions, newest first
  return { mesh, mat, update(on, pp, spd) {
    if (on && spd > 2) pts.unshift(pp.clone()); else if (pts.length) pts.pop();
    if (pts.length > n) pts.length = n;
    mesh.visible = pts.length > 1;
    for (let i = 0; i < n; i++) {
      const p = pts[Math.min(i, pts.length - 1)] || pp, q = pts[Math.min(i + 1, pts.length - 1)] || p;
      const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, wdt = 0.28 * (1 - i / n);
      pos.set([p.x - dz / l * wdt, p.y + 0.3, p.z + dx / l * wdt, p.x + dz / l * wdt, p.y + 0.3, p.z - dx / l * wdt], i * 6);
      alpha[i * 2] = alpha[i * 2 + 1] = i < pts.length ? 1 - i / n : 0;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.a.needsUpdate = true;
  } };
})();
planet.add(trail.mesh);
function paintTrail() { const c = TRAILS[(P.style || {}).trail]; trail.mat.uniforms.c.value.set(c || 0x9fd8ff); trail.mat.uniforms.k.value = c ? 0.85 : 0.35; }

// ---- state that the rest of the file shares (declared before anything can call into it) ----
const cards = [], mixers = [], town = [], lockedStages = [], coinBuildings = [], smokes = [], qOrbs = [];
let headYaw = 0; const tmpLook = new THREE.Vector3(), tmp3t = new THREE.Vector3(); // your head turning toward who is close (the loop)
let coinData = null, lastSeen = 0, myCoins = [], labels = null, npc = null, board3 = null, arcStats = null;
let zoneRoot = null; // the hunting grounds' group (the camera looks through their tall props)
const folk = []; // the town's walking ARC Bots
let stage = null; // ARCIA's stage (makeStage)
// ARCIA's stage in front of her studio: a low platform, a truss with two speakers and four moving spotlights, and a
// screen with the track that's playing. While the music plays she dances; on a concert night the lights go all out.
function makeStage(g, ac) {
  const sg = new THREE.Group(); sg.name = "stage"; g.add(sg);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2, ...o });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.36, 2.2), M(0x2a3446)); deck.position.set(0, 0.18, -0.35); deck.receiveShadow = true; deck.castShadow = true;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.05, 0.05), M(0xff7ad9, { emissive: 0xff7ad9, emissiveIntensity: 1.8 })); edge.position.set(0, 0.34, 0.76);
  const posts = [-1.6, 1.6].map((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.12), M(0x8a96a8, { metalness: 0.7 })); p.position.set(x, 1.6, -1.35); return p; });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.14), M(0x8a96a8, { metalness: 0.7 })); beam.position.set(0, 3.2, -1.35);
  const spk = [-1.95, 1.95].map((x) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.5), M(0x1a1f2a)); b.position.set(x, 0.55, -0.6); const cone = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), M(0x0b0f16, { emissive: 0x35d8d0, emissiveIntensity: 0.4 })); cone.position.set(0, 0.15, 0.26); b.add(cone); return b; });
  // the screen: the track that's playing
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 160; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.81), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); screen.position.set(0, 2.55, -1.3);
  let shown = "";
  const paintScreen = (id) => { if (id === shown) return; shown = id; const c = cv.getContext("2d"), t = (MUS.TITLES || {})[id];
    const gr = c.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, "#1a0f2e"); gr.addColorStop(1, "#0b1a2e"); c.fillStyle = gr; c.fillRect(0, 0, 512, 160);
    c.fillStyle = "#ff7ad9"; c.font = "800 22px Sora, system-ui, sans-serif"; c.fillText(t ? "NOW PLAYING" : "ARCIA STAGE", 24, 40);
    c.fillStyle = "#ffffff"; c.font = "800 44px Sora, system-ui, sans-serif"; c.fillText(t ? t[0] : "♪", 24, 96);
    c.fillStyle = "#9fb1c6"; c.font = "600 24px Sora, system-ui, sans-serif"; c.fillText(t ? t[1] : "", 24, 134); tex.needsUpdate = true; };
  paintScreen("");
  // four spotlights hanging from the truss: soft cones that sweep (additive, a shader that fades along the cone)
  const coneMat = (c) => new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(c) }, uK: { value: 0.3 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: "varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uC; uniform float uK; varying float vY; void main(){ gl_FragColor = vec4(uC, pow(vY, 1.6) * uK); }" });
  const coneG = new THREE.ConeGeometry(0.9, 3.6, 20, 1, true); coneG.translate(0, -1.8, 0);
  const spots = [0xff7ad9, 0x35d8d0, 0xffc861, 0xb48cff].map((c, i) => { const s = new THREE.Group(); s.position.set(-1.2 + i * 0.8, 3.1, -1.25); const m = new THREE.Mesh(coneG, coneMat(c)); s.add(m); sg.add(s); return { s, m, ph: i * 1.7 }; });
  sg.add(deck, edge, ...posts, beam, ...spk, screen);
  ac.obj.position.y = 0.36; // ARCIA stands on it
  let dance = 0, danceT = 0;
  return { tick(dt, t) {
    const st0 = music.state ? music.state() : null, playing = !!(st0 && st0.playing && !st0.paused), concert = concertOn(), b = music.level ? music.level() : 0;
    paintScreen(playing ? st0.playing : "");
    const night = (() => { try { return ambNight; } catch { return 0; } })(), k = (concert ? 1 : 0.35 + night * 0.4) * (0.6 + b * 0.8);
    spots.forEach((p, i) => { p.s.rotation.z = Math.sin(t * (concert ? 1.6 : 0.6) + p.ph) * 0.55; p.s.rotation.x = 0.35 + Math.sin(t * (concert ? 1.1 : 0.4) + p.ph * 1.3) * 0.25; p.m.material.uniforms.uK.value = k * 0.35; });
    edge.material.emissiveIntensity = 1.2 + b * 2.4;
    // she dances while the music plays: a move, a breath, the next move
    if (playing) { danceT -= dt; if (danceT <= 0 && !ac.busy?.()) { danceT = 2.2 + Math.random() * 1.6; ac.play(["emote-yes", "celebrate", "interact-right"][dance++ % 3], { once: true }); } }
  } };
}
let facing = Math.PI, boarding = false, worldReady = false;
const fighters = [];
const floorU = []; st.on((dt) => { for (const u of floorU) u.uFt.value += dt; }); // the grounds' floors (their seams pulse)

// ---- the kit models (Kenney + Quaternius, CC0) ----
let kit = await Promise.race([kitP, new Promise((r) => setTimeout(() => r(null), 12000))]);
// b443: the far grounds' creatures load once you walk 60 m out of the plaza, or 90 s in
{ const t0 = performance.now(), mt = setInterval(() => { const k = kit; if (!k || !k.loadMonsters) return; if (Math.hypot(planet.position.x, planet.position.z) > 60 || performance.now() - t0 > 90000) { clearInterval(mt); k.loadMonsters(); } }, 2000); }
loadbar(0.75);
async function dressWorld(kit) {
  if (!kit) return;
  if (!lowGfx) ENV.unifyPalette(kit.props); // one palette across the asset packs (world-env.js)
  shops.forEach((g) => K.decorate(g, kit));
  shops.forEach(boxOf);
  K.makeTown(kit).forEach((g) => { planet.add(g); town.push(g); spins.push(...g.userData.spin); });
  // the hunting grounds (world-zones.js)
  const zs = (zoneRoot = null, ZN.makeZones({ THREE, K, planet, kit, T, low: lowGfx, ver: VER, onBuilt: () => { if (gshadow) gshadow.rebakeSoon(); farCull.rescan(); } }));
  zoneRoot = zs.root;
  // b-st3: on a computer the far grounds are built now, behind the loading screen, so their shaders are compiled with the
  // rest (st.warm) instead of on the way in; a phone keeps building each as you come near (memory)
  // (2026-10-24: off again — since this went in, computers stopped finishing the load (diag: 50 opened, 18 got in) and a
  // Mac stayed at 85 % for hours: every ground and its shaders at once was too much for the GPU. They build on approach.)
  if (FAR_PREBUILD && !st.quality.coarse && !lowGfx) try { zs.buildAll(); } catch (e) { console.warn("far grounds", e); }
  // each ground's own floor (world-env.js): cracked rock, ripples, moss, paving, ice, glowing seams
  if (!lowGfx) zs.root.children.forEach((g) => { const zn = g.userData && g.userData.zone, gm = g.children.find((c) => c.name === "zone-ground"); if (zn && gm) floorU.push(ENV.zoneFloor(gm.material, zn, { lite: st.quality.coarse })); });
  zs.root.traverse((o) => { if (o.name !== "zone-ground") return; if (!lowGfx) LOOK.stoneGrain(o.material); if (gshadow) gshadow.receive(o.material); }); // b447: the grounds' floors get the plaza's grain too
  spins.push((dt, t) => zs.update(dt, t)); arches.push(...(zs.gates || [])); // (these two had slipped into the comment above)
  // chimneys smoke: the Launchpad's factory and the town's tall chimneys
  [shopG("launch"), ...town.filter((g) => /^town:chimney/.test(g.name))].forEach((g) => {
    if (!g) return; const tw = /^town:/.test(g.name); smokes.push(K.smoke(g, tw ? new THREE.Vector3(0, 5.6 * (g.children[0] ? g.children[0].scale.x : 1), 0) : new THREE.Vector3(-1.5, 6.6, -0.9)));
  });
  // scammers: the first one not yet beaten roams; the rest wait in cages
  K.SCAMMERS.forEach((spec) => {
    if (P.beaten.includes(spec.id)) return;
    const g = new THREE.Group(); g.name = "scam:" + spec.id;
    // the robots load after the town (world-kit.js), so a scammer may get its body a moment later
    const body = () => { const e = K.enemy(kit, spec.model); if (!e) return null; e.obj.scale.setScalar(spec.scale); e.obj.position.y = spec.y; if (spec.tint) e.obj.traverse((m) => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(spec.tint), 0.55); } }); g.add(e.obj); mixers.push(e.mixer); e.play(P.beaten.includes(spec.id) ? "TurnOff" : "Idle"); g.userData.enemy = e; return e; };
    const e = body(); if (!e && kit.enemiesReady) kit.enemiesReady.then(body);
    const sign = K.label(spec.sign, { accent: "#ff4d6d", color: "#ffc861", size: 0.6 }); sign.position.y = spec.y + 1.9 * spec.scale + 0.6; g.add(sign);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.25, 40), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    g.userData = { spec, enemy: e || g.userData.enemy || null, radius: 1.3 + spec.scale * 0.5, ring };
    K.placeOn(g, K.dirOf(spec.theta, spec.phi)); planet.add(g); fighters.push(g);
  });
  arrangeFighters();
  K.CARDS.forEach(([th, ph], i) => {
    const id = "c" + i; if (P.cards.includes(id)) return;
    const g = K.makeCard(kit); K.placeOn(g, K.dirOf(th, ph)); planet.add(g); spins.push(...g.userData.spin); g.userData.id = id; cards.push(g);
  });
  // ARCIA herself, in front of her studio
  const ac = await K.makeCharacter("female-e", VER).catch(() => null);
  if (ac) {
    const g = new THREE.Group(); g.add(ac.obj); const bub = K.bubble(T("Hi! I'm ARCIA. Ask me anything.")); g.add(bub);
    K.placeOn(g, K.dirOf(K.spreadTheta(16), 296)); planet.add(g); g.userData = { radius: 0.9, ac, bub, line: 0 }; npc = g; mixers.push(ac.mixer);
    try { stage = makeStage(g, ac); } catch { stage = null; }
  }
  // town folk: a few ARC Bots walking the ring between the fountain and the halls, stopping now and then to look
  // round or wave (none on Low; two on a phone, six elsewhere). They're scenery: they don't block you or talk.
  if (!lowGfx) {
    const ids = ["arc-neo", "arc-luna", "arc-kai", "arc-pixi", "arc-orbit", "arc-mint"], N = st.quality.coarse ? 2 : 6; /* (PF4: two on a phone — each bot is ~11 draw calls) */
    for (let i = 0; i < N; i++) K.makeCharacter(ids[i], VER).then((c) => {
      if (!c) return; const g = new THREE.Group(); g.name = "folk"; g.add(c.obj); planet.add(g); if (c.mixer) mixers.push(c.mixer);
      folk.push({ g, c, r: 9.2 + (i % 3) * 1.1, a: (i / N) * Math.PI * 2 + Math.random() * 0.4, dir: i % 2 ? 1 : -1, sp: 1.0 + Math.random() * 0.5, wait: 1 + Math.random() * 4, walkT: 0, anim: "" });
    }).catch(() => {});
  }
  // the Exchange's live price board
  const ex = shopG("swap");
  if (ex) { board3 = K.makeBoard(3.4, 1.5); board3.position.set(0, 1.4, 3.35); board3.rotation.x = -0.15; ex.add(board3); paintBoard(); }
  if (coinData) buildCoinCity(coinData);
  if (worldReady) { paintHud(); paintQuests(); }
  if (labels) labels.dirty = true;
}
// a building's footprint (x/z half sizes in its own frame), so walls stop you where they are, not on a circle
function boxOf(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), box = new THREE.Box3(), b = new THREE.Box3(), m = new THREE.Matrix4();
  g.traverse((o) => { if (!o.isMesh || o.isSprite || !o.visible || o.material.transparent || !o.geometry) return; let p = o, vis = true; while (p && p !== g) { if (!p.visible) vis = false; p = p.parent; } if (!vis) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)); if (b.max.y > 0.45) box.union(b); });
  if (box.isEmpty()) return;
  g.userData.box = { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z };
}
function arrangeFighters() {
  // stage n stays caged until stage n-1 is beaten
  const next = K.SCAMMERS.find((s) => !P.beaten.includes(s.id));
  fighters.forEach((g) => {
    const live = next && g.userData.spec.id === next.id;
    g.userData.live = live;
    if (!live && !g.userData.cage) {
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.6, 6, 1, true), new THREE.MeshBasicMaterial({ color: K.C.scam, wireframe: true, transparent: true, opacity: 0.35 }));
      cage.position.y = 1.8; g.add(cage); g.userData.cage = cage;
      const tag = K.label(T("Stage {n} · locked", { n: g.userData.spec.stage }), { accent: "#ff4d6d", color: "#ffd7de", size: 0.7 }); tag.position.y = 4.9; g.add(tag); g.userData.lockTag = tag;
      g.userData.radius = 2.5;
      if (g.userData.enemy) { const a = g.userData.enemy.play("TurnOff", { once: true }); if (a) a.time = a.getClip().duration; }
    }
    if (live && g.userData.cage) {
      g.remove(g.userData.cage); g.remove(g.userData.lockTag); g.userData.cage = null; g.userData.radius = 1.3 + g.userData.spec.scale * 0.5;
      if (g.userData.enemy) g.userData.enemy.play("Idle");
    }
  });
  lockedStages.splice(0, lockedStages.length, ...fighters.filter((g) => !g.userData.live));
  if (labels) labels.dirty = true;
}
if (kit) await dressWorld(kit); else kitP.then((k) => { if (k) { kit = k; dressWorld(k); } }); // a slow connection: the town arrives when it arrives

// ---------------- input ----------------
const keys = new Set();
let hubEl = null; // the menu (built further down)
let inboxDot = 0; // mail waiting (world-inbox.js): a dot on the Menu tile
let chatDot = 0, chatUI = null; // unread messages and friend requests (world-chat.js), and the chat panel
let joy = null, look = null, camYaw = 0, camPitch = 0.05, frozen = false, flying = null, lastLook = 0, runToggle = false, photo = false;
let inK = 0, skyK = 0; /* skyK: 0 … 1 in RAID QUEENS' sky realm (a lower, flatter camera) */ // 0 outside … 1 indoors (the overhead indoor camera)
let camDist = coarse ? 1.7 : 1, /* b447: phones start further out (the owner's pick: more of the town round you); pinch still zooms 0.6–1.9 */ camGoal = camDist, camZoom = 1, shakeT = 0, lastSpeed = 0, lookInit = false; const camLookS = new THREE.Vector3(), lockV = new THREE.Vector3(); // the camera's smoothed aim, its rattle clock; the locked target
const typing = (e) => /input|textarea|select/i.test(e.target.tagName);
/* a window is on screen (the Forge, the wardrobe, a shop…): Esc closes it rather than swapping it for the menu */
const dialogUp = () => [...document.querySelectorAll('[role="dialog"]')].some((d) => d !== hubEl && !d.hidden && d.getClientRects().length > 0 && getComputedStyle(d).visibility !== "hidden");
const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"];
addEventListener("keydown", (e) => {
  if (typing(e)) return;
  if (mode === "island" && !photo && island.keyDown(e)) return;
  const k = String(e.key || "").toLowerCase();
  if (k === "escape") { if (photo) setPhoto(false); else if (hubEl && !hubEl.hidden) closeHub(true); else if (hubEl && !frozen && worldReady && !dialogUp()) openHub(); else closeAll(); return; }
  if (k === "p" && (!frozen || photo)) { setPhoto(!photo); return; }
  if (frozen) return;
  if (k === "e" || k === "enter") { if (near) { e.preventDefault(); enter(near); } return; }
  if (k === "m") { openMap(); return; }
  if (k === "i" && rpg) { closeAll(); rpg.show("inv"); return; }
  if (k === "l" && rpg && quests) { closeAll(); rpg.show("log"); return; }
  if (k === "h") { openHelp(); return; }
  // the dock's keys: B bag, C forge, N pets, U build, in town only (B stays the island's build key there; U on a visited island would leave it)
  if (mode === "hub" && !e.repeat && (k === "b" || (k === "c" && level() < RPG.ULT_LV) || k === "n")) { /* from Lv 300, C is the ultimate (world-combat.js) */ if (k === "n") $("wp-dk-pet").click(); else { const d = $(k === "b" ? "wp-dk-bag" : "wp-dk-craft"); if (d) d.click(); } return; }
  if (k === "u" && !e.repeat && mode === "hub") { const d = $("wp-dk-build"); if (d) d.click(); return; }
  if (combat && mode === "hub" && combat.keyDown(k, e.repeat)) { e.preventDefault(); return; }
  if (k === "f") { setBoard(!boarding); return; }
  if (k === "1") { emote("emote-yes"); return; }
  if (k === "2") { emote("emote-no"); return; }
  if (k === "t") { openWheel(); return; }
  if (k === " ") { e.preventDefault(); jumpDown = true; jump(); return; }
  if (MOVE_KEYS.includes(k)) { keys.add(k); e.preventDefault(); }
});
addEventListener("keyup", (e) => { keys.delete(String(e.key || "").toLowerCase()); if (e.key === " ") jumpDown = false; if (combat) combat.keyUp(String(e.key || "").toLowerCase()); });
addEventListener("blur", () => { if (combat) combat.keyUp("j", true); });
// a game controller (the standard layout): left stick moves (pushed all the way runs), right stick looks, A jumps, X attacks,
// B dodges, Y casts the skill, LB / RB change it, LT / RT drink health / mana, Start opens the map, View the log, D-pad up the emotes
const gpad = { on: false, x: 0, y: 0, run: false, prev: [] };
addEventListener("gamepadconnected", () => toast(T("Controller connected")));
function padTick(dt) {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected && g.mapping === "standard") : null;
  if (!gp) { gpad.on = false; gpad.x = gpad.y = 0; return; }
  gpad.on = true;
  const dz = (v) => (Math.abs(v || 0) < 0.18 ? 0 : v), btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = (i) => btn(i) && !gpad.prev[i];
  gpad.x = frozen && !jurOn ? 0 : dz(gp.axes[0]); gpad.y = frozen && !jurOn ? 0 : -dz(gp.axes[1]); if (gpad.x || gpad.y || gp.buttons.some((b) => b && b.pressed)) lastInput = performance.now(); gpad.run = Math.hypot(gpad.x, gpad.y) > 0.92 || btn(10);
  const rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
  if ((!frozen || jurOn) && (rx || ry)) { camYaw -= rx * dt * 2.6 * S.sens; camPitch = THREE.MathUtils.clamp(camPitch + ry * dt * 1.4 * S.sens, -0.3, 0.75); lastLook = performance.now(); }
  if (edge(9)) { if (!mapEl.hidden) closeMap(); else if (!frozen) openMap(); }
  if (edge(1) && frozen) closeAll();
  if (!btn(0) && gpad.prev[0]) jumpDown = false; // A let go: a jump still going up is cut short
  if (!frozen || jurOn) {
    if (edge(0)) { jumpDown = true; jump(); }
    if (combat && mode === "hub") { if (edge(2)) combat.keyDown("j"); if (!btn(2) && gpad.prev[2]) combat.keyUp("j"); if (edge(1)) combat.keyDown("k"); if (edge(3)) combat.keyDown("z"); if (edge(4) || edge(5)) combat.keyDown("q"); if (edge(6)) combat.keyDown("4"); if (edge(7)) combat.keyDown("5"); }
    if (edge(8) && rpg && quests) { closeAll(); rpg.show("log"); }
    if (edge(12)) openWheel();
    if (edge(13) && near) enter(near);
  }
  gpad.prev = gp.buttons.map((b) => b.pressed);
}
addEventListener("blur", () => { keys.clear(); jumpDown = false; });
const joyEl = $("wp-joy"), knob = joyEl.querySelector("i");
let downAt = null, hoverXY = null, pinch = null;
let JOYMAX = document.documentElement.classList.contains("wp-pcphone") ? 118 : 56; // (let: a phone that refused the scaled page after a turn drops to its own layout — play.html __arcVpOff)
let joyMax = JOYMAX, joyK = 1; let TOUCHK = JOYMAX / 56; // the phone layout is scaled down ~0.4, so tap slop and the pinch dead zone grow with it
// the phone frame on a computer (b416): the mouse works the stick like a thumb (press on the left half and drag)
const mouseStick = window.__arcFrame === "mobile";
const touches = new Map(); // non-stick touches: two of them pinch to zoom
// the stick is fixed (players asked): it starts only near its resting ring at the bottom left, the base stays put, and
// the rest of the screen is free to look around and pinch-zoom with two fingers. The mouse-stick frame keeps the old
// float-anywhere-on-the-left behaviour
const joyRest = document.querySelector(".wp-joyrest");
const restAt = () => { const r = joyRest && joyRest.getBoundingClientRect(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width * 0.75, JOYMAX * 1.3) } : null; };
// the stick's own CSS zoom (sideways at a phone's own width world-skin.css draws the HUD smaller with zoom): its left /
// top and the knob's shift are in its zoomed pixels, so a touch's screen point is divided by it — without that the base
// jumped up and to the left of the thumb the moment you pressed (a player, 2026-10-26)
const joyZ = () => { let z = 1; for (let e = joyEl; e && e.nodeType === 1; e = e.parentElement) { const v = parseFloat(getComputedStyle(e).zoom); if (v > 0) z *= v; } return z; };
const onStick = (e) => { if (e.pointerType === "mouse") return mouseStick && e.clientX < innerWidth * 0.5; const c = restAt(); return c ? Math.hypot(e.clientX - c.x, e.clientY - c.y) < c.r : e.clientX < innerWidth * 0.5; };
// let go of everything (a finger lifted where the browser didn't tell us, the app went to the background): the stick
// used to stay held and the character kept running until another touch
function dropInput() { joy = null; joyEl.classList.remove("on"); knob.style.transform = ""; look = null; pinch = null; touches.clear(); downAt = null; }
cv.addEventListener("contextmenu", (e) => { if (mode === "island") e.preventDefault(); });
cv.addEventListener("pointerdown", (e) => {
  if (frozen && !photo && !jurOn) return; // (Jurassic World keeps the town frozen but plays on the town's stick, look and pinch)
  downAt = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId }; // event time: a slow frame in between does not turn a tap into a hold
  cv.setPointerCapture(e.pointerId);
  // a second finger close to a stick that hasn't moved yet means a pinch; one far away (the right thumb going for the
  // attack button while the left one rests on the stick) is not — that used to zoom the camera in mid-fight
  if (e.pointerType === "touch" && joy && !joy.fixed && e.pointerId !== joy.id && Math.hypot(joy.dx, joy.dy) < 0.2 && Math.hypot(e.clientX - joy.cx, e.clientY - joy.cy) < innerWidth * 0.42) {
    touches.set(joy.id, { x: joy.cx, y: joy.cy }); joy = null; joyEl.classList.remove("on"); knob.style.transform = "";
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...touches.values()];
    pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), cd: camGoal, live: false }; look = null; return;
  }
  const willJoy = !photo && (e.pointerType !== "mouse" || mouseStick) && onStick(e) && !joy;
  if (e.pointerType === "touch" && !willJoy) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // two fingers off the stick are a pinch however far apart they start (b447: zoomed all the way in, the fingers are
    // spread wide, and a pinch starting wider than 60 % of the screen was taken for a look, so you couldn't zoom back out)
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), cd: camGoal, live: false }; look = null; return; }
    if (touches.size > 2) touches.delete(e.pointerId);
  }
  if (willJoy) {
    const c = e.pointerType === "touch" ? restAt() : null, bx = c ? c.x : e.clientX, by = c ? c.y : e.clientY; // touch: the base sits on its ring
    const z = joyZ(), mx = joyMax * z; // (the stick's reach on screen shrinks with its zoom)
    joy = { id: e.pointerId, x: bx, y: by, cx: e.clientX, cy: e.clientY, t: e.timeStamp, dx: 0, dy: 0, fixed: !!c, z, mx };
    joyEl.style.left = bx / z + "px"; joyEl.style.top = by / z + "px"; joyEl.classList.add("on"); knob.style.transform = "";
    if (c) { let dx = e.clientX - bx, dy = e.clientY - by; const m = Math.hypot(dx, dy); if (m > mx) { dx *= mx / m; dy *= mx / m; } joy.dx = dx / mx; joy.dy = dy / mx; knob.style.transform = `translate(${dx / joyK / z}px,${dy / joyK / z}px)`; }
  } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
cv.addEventListener("pointermove", (e) => {
  if (touches.has(e.pointerId)) { touches.get(e.pointerId).x = e.clientX; touches.get(e.pointerId).y = e.clientY; }
  if (pinch && touches.size === 2) {
    const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (!pinch.live && Math.abs(d - pinch.d) < 18 * TOUCHK) return; // a dead zone: fingers resting still don't zoom
    if (!pinch.live) { pinch.live = true; pinch.d = d; pinch.cd = camGoal; }
    camGoal = THREE.MathUtils.clamp(pinch.cd * pinch.d / Math.max(20, d), 0.6, mode === "island" ? 3 : 1.9); return;
  }
  if (e.pointerType === "mouse" && mode === "island") { hoverXY = { x: e.clientX, y: e.clientY }; if (!look) island.hover(e.clientX, e.clientY); }
  if (joy && e.pointerId === joy.id) {
    joy.cx = e.clientX; joy.cy = e.clientY;
    let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const m = Math.hypot(dx, dy), max = joy.mx, z = joy.z;
    if (m > max && joy.fixed) { dx *= max / m; dy *= max / m; } // the fixed base doesn't move: the knob stops at the rim
    else if (m > max) { const k = (m - max) / m; joy.x = Math.min(joy.x + dx * k, innerWidth * 0.5); joy.y += dy * k; joyEl.style.left = joy.x / z + "px"; joyEl.style.top = joy.y / z + "px"; dx *= max / m; dy *= max / m; } // past the rim the base follows the thumb (no dead centre to cross on a turn)
    joy.dx = dx / max; joy.dy = dy / max; knob.style.transform = `translate(${dx / joyK / z}px,${dy / joyK / z}px)`;
  } else if (look && e.pointerId === look.id) {
    camYaw -= (e.clientX - look.x) * 0.006 * S.sens;
    camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - look.y) * 0.004 * S.sens, -0.3, mode === "island" && island.building() ? 1.4 : 0.75);
    look.x = e.clientX; look.y = e.clientY; lastLook = performance.now();
  }
});
const lift = (e) => {
  touches.delete(e.pointerId); if (touches.size < 2) pinch = null;
  // a short tap without a drag is a build action on your island
  if (e.type === "pointerup" && downAt && downAt.id === e.pointerId && mode === "island" && island.building() && !frozen && e.timeStamp - downAt.t < 450 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 9 * TOUCHK) island.tap(e);
  downAt = null;
  if (joy && e.pointerId === joy.id) { joy = null; joyEl.classList.remove("on"); }
  if (look && e.pointerId === look.id) look = null;
};
cv.addEventListener("pointerup", lift); cv.addEventListener("pointercancel", lift); cv.addEventListener("lostpointercapture", lift);
// no finger left on the screen at all, or the page hidden / unfocused: nothing can still be held
addEventListener("touchend", (e) => { if (!e.touches.length) dropInput(); }, { passive: true }); addEventListener("touchcancel", (e) => { if (!e.touches.length) dropInput(); }, { passive: true });
addEventListener("blur", dropInput); document.addEventListener("visibilitychange", () => { if (document.hidden) dropInput(); });
cv.addEventListener("wheel", (e) => { camGoal = THREE.MathUtils.clamp(camGoal + e.deltaY * 0.0012, 0.6, mode === "island" ? 3 : 1.9); }, { passive: true });
// the jump button: pressed jumps, let go early cuts the jump short (a keyboard click on it is a full jump)
{ const jb = $("wp-act-jump"), up = () => { jumpDown = false; };
  jb.addEventListener("pointerdown", (e) => { try { jb.setPointerCapture(e.pointerId); } catch { /* fine */ } jumpDown = true; jump(); });
  jb.addEventListener("pointerup", up); jb.addEventListener("pointercancel", up); jb.addEventListener("click", (e) => { if (!e.detail) { jump(); jumpHeld = false; } }); }
$("wp-act-run").addEventListener("click", (e) => { runToggle = !runToggle; e.currentTarget.setAttribute("aria-pressed", String(runToggle)); });
// the emote wheel: T, or the wave button on a phone
const EMOTES = [["emote-yes", "Wave", "✋"], ["emote-no", "No", "✕"], ["sit", "Sit", "◡"], ["interact-right", "Point", "➚"], ["pick-up", "Pick up", "⇩"], ["die", "Faint", "✶"], ["cheer", "Cheer", "★"], ["dance", "Dance", "♪"]];
const wheel = document.createElement("div"); wheel.className = "wp-wheel"; wheel.hidden = true; wheel.setAttribute("data-no-i18n", "");
// eight fixed lines to say (others see them over your figure for a minute; no free text, so nothing to moderate)
const SAY = ["Hi!", "Nice hit!", "Help!", "Raid now?", "Follow me", "Thanks!", "GG", "Scan before you buy"];
wheel.innerHTML = EMOTES.map(([a, n, g], i) => `<button type="button" data-e="${a}" style="--i:${i}"><b>${ICONS.GLYPH[g] ? ICONS.icon(ICONS.GLYPH[g], 22) : g}</b><span>${esc(n.includes(" ") ? T(n) : W(n))}</span></button>`).join("") +
  `<div class="wp-say" role="group" aria-label="${esc(W("Say"))}">${SAY.map((s, i) => `<button type="button" data-say="${i}">${esc(s.includes(" ") || s.length > 4 ? T(s) : W(s))}</button>`).join("")}<button type="button" class="wp-say-inv" data-invite>${esc(T("Invite a friend"))}</button></div>`;
document.body.appendChild(wheel);
function openWheel() { if (frozen || !grounded) return; wheel.hidden = !wheel.hidden; }
wheel.addEventListener("click", (e) => {
  const sb = e.target.closest("button[data-say]"); if (sb) { wheel.hidden = true; say(+sb.dataset.say); return; }
  if (e.target.closest("[data-invite]")) { wheel.hidden = true; invite(); return; }
  const b = e.target.closest("button[data-e]"); wheel.hidden = true; if (b) emote(b.dataset.e);
});
let said = null, sayBub = null, sayPingAt = 0;
function sayBubble(txt, ms = 4500) {
  if (sayBub) { player.remove(sayBub); sayBub.material.map && sayBub.material.map.dispose(); }
  sayBub = K.label(txt, { accent: "#9fffd0", size: 0.5 }); sayBub.position.y = 2.75; player.add(sayBub); const mine = sayBub;
  setTimeout(() => { if (sayBub === mine) { player.remove(mine); sayBub = null; } }, ms);
}
function say(i) {
  if (!SAY[i]) return;
  sayBubble(SAY[i].includes(" ") || SAY[i].length > 4 ? T(SAY[i]) : W(SAY[i]));
  if (avatar && grounded) avatar.play("emote-yes", { once: true });
  said = { s: i, at: Date.now(), sent: false };
  if (Date.now() - sayPingAt > 15000) { sayPingAt = Date.now(); ping(); } // others see it with the next ping at the latest
}
// play together: a link with your wanderer tag; whoever opens it sees you as a friend (and you them), and near each other you both get +10% XP
const myTag = SOC.tagOf(vid);
const together = () => !!(ghosts && ghosts.palNear && ghosts.palNear(20));
// a hunting party: you and up to three friends, kept by the server (world-party.js, api/_world-rank.mjs: the leader invites
// friends from the chat's Friends tab or their profile card). Their figures show their HP and where they are; with one
// of them within 30 m, knock-outs give +15% XP (instead of the +10% for a friend nearby)
const PARTY = "arc.world.party";
const partyUI = () => chatUI && chatUI.party;
const partyWs = () => { const p = partyUI(); return p ? p.others() : []; };
const inParty = (w) => { const p = partyUI(); return !!p && p.inParty(w); };
const partyNear = (r = 30) => { const party = partyWs(); if (!party.length || !ghosts || mode !== "hub") return false; const me0 = here(new THREE.Vector3()); return ghosts.named().some((g) => inParty(g.wallet) && Math.hypot(g.x - me0.x, g.z - me0.z) < r); };
const partyEl = document.createElement("div"); partyEl.className = "wp-party"; partyEl.id = "wp-party"; partyEl.hidden = true; partyEl.setAttribute("data-no-i18n", ""); partyEl.setAttribute("aria-label", T("Party")); (document.querySelector(".wp-hud-l") || document.body).appendChild(partyEl); // under the quest list
let partyNames = null, partyHtml = ""; // the names read once; the strip rewritten only when its HTML changes
function paintParty() {
  if (document.hidden) return;
  const party = partyWs();
  if (!party.length || mode !== "hub") { partyEl.hidden = true; partyHtml = ""; return; }
  const me0 = here(new THREE.Vector3()), seen = ghosts ? ghosts.named() : [], names = partyNames || (partyNames = (() => { try { return JSON.parse(localStorage.getItem(PARTY + ".n") || "{}"); } catch { return {}; } })());
  partyEl.hidden = false; let named = false;
  const html = `<b>${esc(T("Party"))}${partyNear() ? ` <em>${esc(T("+15% XP"))}</em>` : ""}</b>` + party.map((w) => { const g = seen.find((x) => String(x.wallet).toLowerCase() === w), nm = (g && g.name) || names[w] || partyUI().nameOf(w) || w.slice(0, 6) + "…";
    if (g && names[w] !== g.name) { names[w] = g.name; named = true; }
    const d = g ? Math.round(Math.hypot(g.x - me0.x, g.z - me0.z)) : null, zn = g && g.zn ? (RPG.ZONES.find((z) => z.id === g.zn) || {}).name : "";
    return `<div class="${g ? "" : "away"}"><span>${esc(nm)}${g ? ` <small>Lv ${g.lv}</small>` : ""}</span>${g && g.h != null ? `<i><u style="width:${g.h}%"></u></i>` : ""}<small>${g ? (d < 30 ? esc(T("{n} m away", { n: d })) : zn ? esc(zn) : esc(T("{n} m away", { n: d }))) : esc(T("Not in the world"))}</small></div>`; }).join("");
  if (html !== partyHtml) { partyHtml = html; partyEl.innerHTML = html; }
  if (named) try { localStorage.setItem(PARTY + ".n", JSON.stringify(names)); } catch { /* private */ }
}
{ const c = document.createElement("div"); c.className = "wp-together"; c.id = "wp-together"; c.hidden = true; c.setAttribute("role", "status"); c.textContent = T("With a friend · +10% XP"); document.body.appendChild(c); }
{ const w = (new URLSearchParams(location.search).get("with") || "").toLowerCase(); if (/^[0-9a-z]{7}$/.test(w) && w !== myTag && P.pal !== w) { P.pal = w; save(); setTimeout(() => toast(T("You joined a friend's invite. Find them in town: near each other you both get +10% XP.")), 4000); } }
async function invite() {
  try { if (referUI) { referUI.open(); return; } } catch { /* the page is still loading: the plain link */ }
  const u = location.origin + "/play?with=" + myTag;
  try { if (navigator.share && coarse) { await navigator.share({ title: "ARCIRCLE World", text: T("Play ARCIRCLE World with me"), url: u }); return; } await navigator.clipboard.writeText(u); toast(T("Invite link copied. Near each other in town, you both get +10% XP.")); } catch { toast(u); }
}
$("wp-act-emote").addEventListener("click", openWheel);
const speedLines = document.createElement("div"); speedLines.className = "wp-speed"; speedLines.setAttribute("aria-hidden", "true"); document.body.appendChild(speedLines);
// a long press on the ride button switches ride (the rover from level 10): phones have no V key
{ const bb = $("wp-act-board"); let lpT = 0, lp = false;
  bb.addEventListener("pointerdown", () => { lp = false; clearTimeout(lpT); lpT = setTimeout(() => { lp = true; switchRide(); }, 520); });
  const stop = () => clearTimeout(lpT); bb.addEventListener("pointerup", stop); bb.addEventListener("pointerleave", stop); bb.addEventListener("pointercancel", stop);
  bb.addEventListener("contextmenu", (e) => e.preventDefault());
  bb.addEventListener("click", () => { if (lp) { lp = false; return; } setBoard(!boarding); }); }
$("wp-act-photo").addEventListener("click", () => setPhoto(true));
$("wp-photo-btn").addEventListener("click", () => { if (!frozen) setPhoto(true); });

// ---------------- movement: the world slides under the player ----------------
const Y = new THREE.Vector3(0, 1, 0), prevP = new THREE.Vector3(), EDGE = 300; /* b-land: past the hunting grounds (~206 m) and the LAND ring (20 villages ~270 m out, world-land.js); the hills start at 312 */
let mode = "hub"; // "hub" | "island" (world-island.js takes over the ground)
const at = new THREE.Vector3(0, 0, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dir = new THREE.Vector3(), axis = new THREE.Vector3(), nrm = new THREE.Vector3();
let speedNow = 0, hop = 0, vy = 0, grounded = true, near = null, stepT = 0, walked = 0, shake = 0;
let combat = null, rpg = null, quests = null, pet = null, raid = null, ghosts = null, race = null, decor = null; const knockV = new THREE.Vector3(); // world-combat.js and world-rpg.js, set up further down
function inputs() {
  let x = 0, y = 0;
  if (keys.has("w") || keys.has("arrowup")) y += 1;
  if (keys.has("s") || keys.has("arrowdown")) y -= 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  if (joy) { x += joy.dx; y += -joy.dy; }
  if (gpad.on) { x += gpad.x; y += gpad.y; }
  const m = Math.min(1, Math.hypot(x, y));
  const run = keys.has("shift") || runToggle || (joy && Math.hypot(joy.dx, joy.dy) > 0.95) || (gpad.on && gpad.run);
  return { x, y, m, run };
}
const SOLIDS = () => [gv.solids, mv.solids, shops, [portal, isleGate, fountainCore, agentGate, ...(rqGate.visible ? [rqGate] : [])], pvil.solids, lockedStages, town, coinBuildings, fighters.filter((g) => g.userData.live), decor ? decor.solids() : [], holiday.solids, stuHub.solids, adc ? adc.solids : [], rqL ? rqL.solids : [], ccL ? ccL.solids : []]; // (CCR: Creator City's buildings and props were left out — you walked through them)
const lp = new THREE.Vector3();
// a point on the ground (the world group's coordinates) inside a building? — the street scammers ask
const wp0 = new THREE.Vector3();
// the season's dressing and the market stalls (world-holiday.js): placed once the town stands, on free ground round
// the fountain (each spot checked against what's already there)
const holiday = { solids: [], ticks: [] }; let bounty = null; // the bounty board: the day's hunts (Adventure log → Daily)
function freeSpots(n, radii, gap, step = 12) {
  const out = [], v = new THREE.Vector3();
  for (const r of radii) for (let a = 7; a < 360 && out.length < n; a += step) {
    if (Math.abs(((a + 180) % 360) - 180) < 42) continue; // (b-st1: not between the spawn and its camera — a stall's awning filled the first view)
    const x = Math.sin((a * Math.PI) / 180) * r, z = Math.cos((a * Math.PI) / 180) * r; v.set(x, 0, z);
    if (Math.hypot(x - stuHub.center.x, z - stuHub.center.z) < 15) continue; // (the Studio's front and its cabinets stay clear)
    if (blockedAt(v) || [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => blockedAt(v.set(x + dx, 0, z + dz)))) continue;
    if (out.some(([px, pz]) => Math.hypot(px - x, pz - z) < gap)) continue;
    out.push([x, z, Math.atan2(-x, -z)]);
  }
  return out;
}
let holTries = 0;
const placeHoliday = () => { if (!(kit && town.length) && holTries++ < 30) { setTimeout(placeHoliday, 1000); return; } try {
  const spots = freeSpots(4, [15.5, 17.5], 9);
  const st3 = HOL.createStalls({ THREE, planet, spots: spots.slice(0, 3) }); holiday.solids.push(...st3.stalls); holiday.ticks.push((t, night) => st3.tick(1 / 60, night));
  if (spots[3]) { bounty = HOL.createBountyBoard({ THREE, planet, at: spots[3] }); holiday.solids.push(bounty); }
  if (HOL.christmasOn()) { const t = freeSpots(1, [13, 14.5], 0, 17)[0] || [0, 13]; const x = HOL.createChristmas({ THREE, planet, spots: lamps.userData.spots || [], tree: [t[0], t[1]] }); holiday.ticks.push(x.tick); const tg = new THREE.Group(); tg.position.set(t[0], 0, t[1]); tg.userData.radius = 2.4; planet.add(tg); holiday.solids.push(tg); }
  if (HOL.lunarOn()) { const l = HOL.createLanterns({ THREE, planet, spots: lamps.userData.spots || [] }); holiday.ticks.push(l.tick); }
} catch (err) { console.warn("holiday", err); } };
setTimeout(placeHoliday, 1500);
st.on((dt, t) => { if (holiday.ticks.length && mode === "hub") holiday.ticks.forEach((f) => f(t, ambNight)); });
function blockedAt(v) {
  wp0.set(v.x + planet.position.x, 0, v.z + planet.position.z);
  for (const list of SOLIDS()) for (const g of list) {
    g.getWorldPosition(tmp); if (Math.abs(tmp.x - wp0.x) > 12 || Math.abs(tmp.z - wp0.z) > 12) continue;
    const bx = g.userData.box;
    if (bx) { lp.copy(wp0); lp.y = tmp.y; g.worldToLocal(lp); if (lp.x > bx.x0 - 0.5 && lp.x < bx.x1 + 0.5 && lp.z > bx.z0 - 0.5 && lp.z < bx.z1 + 0.5) return true; continue; }
    if (Math.hypot(tmp.x - wp0.x, tmp.z - wp0.z) < (g.userData.radius || 1) + 0.6) return true;
  }
  return false;
}
let hitDepth = 0;
function blockedBy() {
  let hit = null, best = Infinity;
  for (const list of SOLIDS()) for (const g of list) {
    g.getWorldPosition(tmp);
    const bx = g.userData.box;
    if (bx) {
      if (tmp.distanceTo(at) > 9) continue;
      lp.copy(at); g.worldToLocal(lp);
      const m = 0.42, inX = lp.x > bx.x0 - m && lp.x < bx.x1 + m, inZ = lp.z > bx.z0 - m && lp.z < bx.z1 + m;
      if (inX && inZ) { const d = -Math.min(lp.x - bx.x0 + m, bx.x1 + m - lp.x, lp.z - bx.z0 + m, bx.z1 + m - lp.z); if (d < best) { best = d; hit = g; } }
      continue;
    }
    const d = tmp.distanceTo(at) - (g.userData.radius + 0.55); if (d < 0 && d < best) { best = d; hit = g; }
  }
  hitDepth = best;
  return hit;
}
// the way out of what you walked into: away from the nearest box side, or away from the centre
function hitNormal(hit, out) {
  const bx = hit.userData.box;
  if (!bx) { hit.getWorldPosition(tmp); return out.set(tmp.x, 0, tmp.z).normalize(); }
  lp.copy(at); hit.worldToLocal(lp);
  const d = [lp.x - bx.x0, bx.x1 - lp.x, lp.z - bx.z0, bx.z1 - lp.z], i = d.indexOf(Math.min(...d));
  const n = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)][i];
  return out.copy(n).transformDirection(hit.matrixWorld).setY(0).normalize();
}
// where the player stands, in the world group's coordinates
const here = (v = new THREE.Vector3()) => v.set(-planet.position.x, hop, -planet.position.z);
// b-lpv: past the town's edge, or past the edge of the land you're in (world-lands.js)
function outOfBounds() { const x = -planet.position.x, z = -planet.position.z, L = LD.landAt(x, z); return L ? lands.outside(L.id, x, z) : x * x + z * z > EDGE * EDGE; }
function tryMove(d, dist) {
  prevP.copy(planet.position);
  // already standing inside something (a respawn, a landing): any step that takes you further out is allowed
  let was = null, d0 = 0;
  if (mode !== "island") { planet.updateMatrixWorld(true); was = blockedBy(); d0 = hitDepth; }
  planet.position.addScaledVector(d, -dist);
  let hit = null;
  if (mode === "island") hit = island.blocked(here(tmp2)) ? { axis: true } : null;
  else if (arenaR ? (planet.position.x + gv.center.x) ** 2 + (planet.position.z + gv.center.z) ** 2 > arenaR * arenaR : outOfBounds()) hit = { edge: true };
  else { planet.updateMatrixWorld(true); hit = blockedBy(); if (hit && hit === was && hitDepth > d0 + 1e-4) hit = null; }
  if (hit) planet.position.copy(prevP);
  return hit;
}
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
let jumpBuf = 0; const hitFrom = new THREE.Vector3(); let hitAt = 0, hitPow = 0; // the last blow's push, for the flinch
// variable height: let go of jump early (while still going up fast) and the jump is cut short; coyote time: a jump
// pressed just after walking off an edge (110 ms) still counts
let jumpDown = false, jumpHeld = false, coyoteAt = 0, trickT = 0;
// a running jump carries you forward: the speed you had when you left the ground stays with you in the air
const airV = new THREE.Vector3(), lastDir = new THREE.Vector3(0, 0, 1), skidV = new THREE.Vector3(); let skidT = 0;
function jump() { if (jurOn && jurGame) { jurGame.jump(); return; } if (jetOn() && !frozen) { jetHigh = !jetHigh; Snd.board(); return; } const coy = !grounded && performance.now() - coyoteAt < 110; if (!grounded && !coy && !frozen) { jumpBuf = performance.now(); return; } if ((!grounded && !coy) || frozen) return; coyoteAt = 0; jumpHeld = true; if (boarding && ride === "board" && !reduce) trickT = 0.55; /* a little spin off the board */ vy = (boarding ? 11 : 9) * (combat ? combat.jumpMul() : 1); grounded = false; airV.copy(lastDir).multiplyScalar(speedNow > 1 ? speedNow * 1.08 : 0); Snd.jump(); if (avatar && !boarding) avatar.play("jump", { once: true, fade: 0.08 }); daily("jumps"); tutorialStep(1); }
// an emote; ARC Bots change their face with it. Cheer throws the arms up (a Kenney character waves), Dance twirls
// twice with a bounce
let danceT = 0;
function emote(name) {
  if (!avatar || frozen || !grounded) return;
  const clip = name === "cheer" ? (avatar.arc || avatar.kk ? "celebrate" : "emote-yes") : name === "dance" ? (avatar.arc ? "celebrate" : avatar.kk ? "cheer" : "emote-yes") : name;
  avatar.play(clip, { once: true }); if (pet) pet.emote();
  if (avatar.face) avatar.face(name === "cheer" ? "star" : name === "dance" || name === "emote-yes" ? "happy" : name === "die" ? "ouch" : "", 2);
  if (name === "dance" && !reduce) { danceT = 2.4; vy = 4.5; grounded = false; }
}
// landing from a jump: a ring of light where you touch down (the ARC Bots also squash a little)
function landRing(y) {
  if (reduce) return;
  const r = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 36), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
  r.rotation.x = -Math.PI / 2; here(r.position).setY((y || 0) + 0.05); planet.add(r);
  const t0 = performance.now(), off = st.on(() => { const k = (performance.now() - t0) / 380; r.scale.setScalar(1 + k * 2.4); r.material.opacity = 0.75 * (1 - k); if (k >= 1) { off(); planet.remove(r); r.geometry.dispose(); r.material.dispose(); } });
}
// the head turns toward someone close by: another player, ARCIA, a scammer
let lookT = 0;
function lookAround(dt) {
  if (!avatar || !avatar.look) return;
  lookT -= dt; if (lookT > 0) return; lookT = 0.2;
  if (mode !== "hub" || frozen) { avatar.look(0); return; }
  here(tmp2); let best = null, bd = 7;
  const consider = (x, z) => { const d = Math.hypot(x - tmp2.x, z - tmp2.z); if (d < bd && d > 0.8) { bd = d; best = [x, z]; } };
  if (ghosts) ghosts.named().forEach((w) => consider(w.x, w.z));
  if (npc) { npc.getWorldPosition(tmp); consider(tmp.x - planet.position.x, tmp.z - planet.position.z); }
  if (combat) for (const m of combat.state().mobs || []) if (!m.dead) consider(m.x, m.z);
  if (!best) { avatar.look(0); return; }
  let a = Math.atan2(best[0] - tmp2.x, best[1] - tmp2.z) - facing; a = Math.atan2(Math.sin(a), Math.cos(a));
  avatar.look(Math.abs(a) < 1.7 ? a : 0);
}
// first-time hints: a bubble with a pulsing tap mark, once per thing (gathering, fishing, the rover, charging,
// stepping out of red), remembered in this browser
const HINTS = "arc.world.hints";
let hintEl = null, hintT = 0;
function hint(id, text) {
  let seen = []; try { seen = JSON.parse(localStorage.getItem(HINTS) || "[]"); } catch { /* private */ }
  if (seen.includes(id) || introOn || (hintEl && !hintEl.hidden)) return false;
  seen.push(id); try { localStorage.setItem(HINTS, JSON.stringify(seen)); } catch { /* private */ }
  if (!hintEl) { hintEl = document.createElement("div"); hintEl.className = "wp-fh"; hintEl.setAttribute("role", "status"); hintEl.setAttribute("data-no-i18n", ""); document.body.appendChild(hintEl); hintEl.addEventListener("click", () => { hintEl.hidden = true; }); }
  hintEl.innerHTML = `<i aria-hidden="true"></i><span>${esc(text)}</span>`; hintEl.hidden = false; hintEl.classList.remove("on"); void hintEl.offsetWidth; hintEl.classList.add("on");
  clearTimeout(hintT); hintT = setTimeout(() => { hintEl.hidden = true; }, 6500);
  return true;
}
const tapOr = (key, tap) => (coarse ? tap : key);
function setBoard(on) {
  if (frozen) return;
  if (on && level() >= 10) setTimeout(() => hint("rover", tapOr(T("Press V to switch between the hoverboard and the explorer rover"), T("Hold the ride button to switch to the explorer rover"))), 1200);
  if (on && ride === "jet" && level() < 30) ride = "board"; // a save from a higher level on a fresh one
  boarding = on; showRide(); jetHigh = false;
  $("wp-act-board").setAttribute("aria-pressed", String(on)); Snd.board();
  toast(on ? (ride === "rover" ? T("Rover on: hold Shift (or Run) to speed up · V switches ride") : ride === "jet" ? T("Jetpack on: Space climbs or comes down · V switches ride") : T("Hoverboard on: hold Shift (or Run) to fly")) : T("Hoverboard off"));
}
function step(dt) {
  // the floor: flat ground in the hub, the bricks under your feet on an island
  const floor = mode === "island" ? island.floorAt(here(tmp2)) : jumpOn && jumpRace ? jumpRace.floorAt(-planet.position.x, -planet.position.z, hop) : 0;
  if (jetOn()) { const want = floor + jetAlt(); hop += (want - hop) * Math.min(1, dt * 2.4); vy = 0; grounded = true; player.position.y = hop; }
  else if (!grounded) {
    if (jumpHeld && !jumpDown) { jumpHeld = false; if (vy > 3) vy *= 0.5; } // let go early: a short hop
    vy -= 24 * dt; hop += vy * dt;
    // a big fall (impact over 12) lands heavy: more dust, a harder shake, the world slows for a beat; the rest as before
    if (hop <= floor) { const impact = -vy, heavy = impact > 12; hop = floor; vy = 0; jumpHeld = false; if (avatar && avatar.land && impact > 4) { avatar.land(impact / 14); landRing(floor); } grounded = true; airV.set(0, 0, 0); Snd.land(impact); dust(heavy ? 16 : 6, heavy ? 1 : 0); shake = Math.max(shake, heavy ? 0.22 : 0.12); if (heavy && !reduce) slowUntil = Math.max(slowUntil, performance.now() + 150); if (performance.now() - jumpBuf < 160) { jumpBuf = 0; setTimeout(jump, 0); } }
  }
  else if (jumpOn && hop > floor + 0.05 && hop - floor < 0.25) hop = floor; // b444: a Coin Jump pad going down carries you (no fall-and-land every frame)
  else if (hop > floor + 0.05) { grounded = false; vy = 0; coyoteAt = performance.now(); } // walked off an edge
  else if (floor > hop) hop = floor;
  player.position.y = hop;
  { const cs = meShadow; if (cs) { const up = Math.max(0, hop - floor); cs.position.y = floor - hop + 0.05; cs.material.opacity = 0.5 * Math.max(0.3, 1 - up / 6); cs.scale.setScalar(1 + Math.min(up, 6) * 0.12); cs.visible = (mode === "hub" || mode === "island") && !jumpOn; } /* b443: it stays on the ground (faint) up to any height, so you see where you'll land; Coin Jump has its own marker */ } // the spot stays on the floor as you jump, fainter higher up
  at.y = THREE.MathUtils.lerp(at.y, jetOn() ? hop * 0.75 : floor, grounded ? 0.2 : 0.04);
  if (frozen) { speedNow = THREE.MathUtils.lerp(speedNow, 0, 0.2); return; }
  if (flying) { stepTeleport(); speedNow = 0; return; }
  const { x, y, m, run } = inputs();
  let sp = 0;
  if (skidT > 0) { skidT = Math.max(0, skidT - dt); const v = skidV.length(); if (v > 0.3) { tmp2.copy(skidV).divideScalar(v); tryMove(tmp2, v * dt); } skidV.multiplyScalar(Math.max(0, 1 - dt * 9)); } // the skid slides on
  // in the air with no input: keep gliding the way you jumped, slowing a little
  if (!grounded && m <= 0.05 && airV.lengthSq() > 0.25) { const v = airV.length(); tmp2.copy(airV).divideScalar(v); if (!tryMove(tmp2, v * dt)) sp = v; airV.multiplyScalar(1 - Math.min(1, dt * 0.6)); }
  if (m > 0.05) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    dir.set(rx * x + fx * y, 0, rz * x + fz * y).normalize();
    sp = (boarding ? (run ? 22 : 13) : run ? 12.5 : 6.5) * m * (combat ? combat.speedMul() : 1);
    if (!grounded && airV.lengthSq() > 0.25) sp = Math.max(sp, airV.length() * 0.92); // no slowing down mid-jump
    // turning sharply (over 120 degrees) at a sprint: the feet skid on the old way for a beat, dust, a lean back
    if (grounded && !boarding && speedNow > 9 && skidT <= 0 && dir.dot(lastDir) < -0.5) { skidT = 0.26; skidV.copy(lastDir).multiplyScalar(speedNow * 0.8); dust(5); if (Snd.step) Snd.step(); }
    if (skidT > 0) sp *= 0.3;
    lastDir.copy(dir);
    const hit = tryMove(dir, sp * dt);
    if (hit && hit.axis) {
      // a brick grid: slide along whichever axis is still free
      const ax = new THREE.Vector3(Math.sign(dir.x), 0, 0), az = new THREE.Vector3(0, 0, Math.sign(dir.z));
      const okX = Math.abs(dir.x) > 0.15 && !tryMove(ax, sp * dt * Math.abs(dir.x));
      if (!okX && !(Math.abs(dir.z) > 0.15 && !tryMove(az, sp * dt * Math.abs(dir.z)))) sp *= 0.2;
    } else if (hit) {
      // slide along it: drop the part of the step that goes into the obstacle
      if (hit.edge) nrm.set(-planet.position.x, 0, -planet.position.z).normalize();
      else hitNormal(hit, nrm);
      const into = dir.dot(nrm);
      if (into > 0) { tmp2.copy(dir).addScaledVector(nrm, -into); if (tmp2.lengthSq() > 0.02) { tmp2.normalize(); if (tryMove(tmp2, sp * dt * Math.sqrt(1 - into * into))) sp *= 0.2; } else sp *= 0.2; }
    }
    facing = angLerp(facing, Math.atan2(dir.x, dir.z), 1 - Math.exp(-12 * dt));
    // the camera drifts back behind you only running straight on, 3 s after you last looked round: run diagonally (or look
    // round while running, as in a shooter) and it stays where you put it — the drift used to chase a sideways run round in
    // circles, and swing the view to your back the moment your look thumb let go
    if (!look && performance.now() - lastLook > 3000 && y > 0.5 && Math.abs(x) < 0.2 && !(combat && combat.locked())) camYaw = angLerp(camYaw, facing - Math.PI, dt * 0.9);
    stepT -= dt * sp; if (grounded && stepT < 0 && !boarding) { Snd.step(sp); stepT = 2.6; if (sp > 10) dust(2); const zz = combat && combat.zone(), soft = zz && { peaks: 0xa9bcd4, dunes: 0xa8824e, canyon: 0x8a4a32 }[zz.id]; if (soft && tracks) { here(tmp2); tracks.step(tmp2.x, tmp2.z, facing, soft); } } // prints in snow and sand
    walked += sp * dt; if (walked > 4) tutorialStep(0);
    dailyDist(sp * dt);
  }
  speedNow = THREE.MathUtils.lerp(speedNow, sp, 0.2);
}
// fly to a place (the map): a teleport (b407). The character is drawn up into a beam of light and vanishes, the
// screen flashes, and it forms again in front of the place out of a second beam — instead of the town sliding past
// under it. The player lands in front of the place (things face the plaza) and turns to it.
const TP = (() => { const k = /[?&]tpslow=1\b/.test(location.search) ? 10 : 1; return { OUT: 560 * k, GAP: 160 * k, IN: 760 * k }; })(); // ?tpslow=1: ten times slower, to look at it
const tpGlow = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(150,235,255,.75)"); gr.addColorStop(1, "rgba(60,160,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false, toneMapped: false }));
  sp.position.y = 1.1; sp.visible = false; sp.renderOrder = 12; player.add(sp); return sp;
})();
const tpFlash = document.createElement("div"); tpFlash.className = "wp-tpflash"; tpFlash.setAttribute("aria-hidden", "true"); document.body.appendChild(tpFlash);
function flyTo(g) {
  if (mode !== "hub") leaveIsland();
  const p = g.position, L0 = LD.landAt(p.x, p.z), front = new THREE.Vector3((L0 ? L0.x : 0) - p.x, 0, (L0 ? L0.z : 0) - p.z); // (b-lpv: in a land, facing its middle)
  if (front.lengthSq() < 1e-4) front.set(0, 0, 1);
  front.normalize();
  const stand = new THREE.Vector3(p.x, 0, p.z).addScaledVector(front, (g.userData.radius || 1) + 1.7);
  if (reduce) { planet.position.copy(stand).negate(); facing = Math.atan2(p.x - stand.x, p.z - stand.z); camYaw = facing - Math.PI; vfx.teleport(here()); return; }
  vfx.teleport(here(), { color: 0x7fe9ff, color2: 0x2f86ff });
  if (Snd.dash) Snd.dash();
  flying = { to: stand.clone().negate(), face: Math.atan2(p.x - stand.x, p.z - stand.z), t0: performance.now(), jumped: false };
}
// where to look from on arrival: straight behind you if nothing (a tree, a stall) stands between the camera and you,
// otherwise a little to one side or the other
const tpRay = new THREE.Raycaster(), tpSkip = /^(grass|ground|hills|clouds|puddles|world-ground|sky)/;
function clearYaw(face) {
  planet.updateMatrixWorld(true);
  const near = [], aims = [new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 0.35, 0)]; // the head and the feet: both in view
  for (const c of planet.children) { if (c.visible && !tpSkip.test(c.name || "")) near.push(c); } // big groups too (their origin can be far from what they hold)
  for (const off of [0, 0.5, -0.5, 1.0, -1.0]) {
    const yaw = face - Math.PI + off, cp = new THREE.Vector3(0, 5.2 + camPitch * 6, 9.6).multiplyScalar(camDist * camZoom).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const blocked = aims.some((aim) => { const d = cp.clone().sub(aim), len = d.length(); tpRay.set(aim, d.normalize()); tpRay.far = len; tpRay.camera = st.camera; // sprites need the camera to be tested
      return tpRay.intersectObjects(near, true).some((h) => h.distance > 1.2 && h.object.isMesh && h.object.name !== "grass" && !(h.object.material && h.object.material.transparent)); });
    if (!blocked) return yaw;
  }
  return face - Math.PI;
}
function stepTeleport() {
  const f = flying, t = performance.now() - f.t0, { OUT, GAP, IN } = TP;
  if (t < OUT) {
    // drawn up into the beam: thinner and taller, a white glow swelling round it, a little lift off the ground
    const k = t / OUT, e = k * k * (3 - 2 * k);
    player.scale.set(1 - 0.94 * e, 1 + 1.1 * e, 1 - 0.94 * e); player.position.y += e * 0.6;
    tpGlow.visible = true; tpGlow.material.opacity = 0.25 + 0.75 * e; tpGlow.scale.setScalar(1.2 + 2.6 * e);
    camYaw = angLerp(camYaw, f.face - Math.PI, 0.03);
    if (k > 0.72 && !f.flashed) { f.flashed = true; tpFlash.classList.remove("on"); void tpFlash.offsetWidth; tpFlash.classList.add("on"); }
    return;
  }
  if (!f.jumped) {
    // gone: the jump itself, under the flash; the arrival beam is already falling where you'll stand
    f.jumped = true; player.visible = false;
    planet.position.copy(f.to); facing = f.face; camPitch = 0.32; camYaw = clearYaw(f.face); // a higher look at the arrival, from a side nothing stands in the way of
    vfx.teleport(here(), { color: 0xffe08a, color2: 0x39ff88 });
  }
  if (t < OUT + GAP) return;
  if (t < OUT + GAP + IN) {
    // formed again: out of a thin bright column into the character, with a little overshoot; the glow fades out
    if (!player.visible) { player.visible = true; if (Snd.land) Snd.land(); else if (Snd.enter) Snd.enter(); }
    const k = (t - OUT - GAP) / IN, c1 = 1.70158, c3 = c1 + 1, back = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    const w = 0.06 + 0.94 * back, h = 2.1 - 1.1 * Math.min(1, k * 1.25);
    player.scale.set(w, Math.max(1, h), w);
    tpGlow.material.opacity = Math.max(0, 1 - k * 1.3); tpGlow.scale.setScalar(3.8 - 2.4 * k);
    return;
  }
  player.scale.set(1, 1, 1); tpGlow.visible = false; tpGlow.material.opacity = 0; flying = null;
  dust(6);
}

// ---------------- My Island (world-island.js): a floating island you build, and other players' islands ----------------
const island = IS.createIsland({
  THREE, K, STYLE, st, planet, T, lang: LANG, esc, toast, post, sess, Snd, P, VER, reduce, coarse, level,
  showcase: { fish: LIFE.FISH, zones: RPG.ZONES, fish3d: GEAR.fish, data: () => { const d = rpg && rpg.data(), x = (d && d.x) || {}; return { fish: x.fish || {}, bk: x.bk || {} }; } },
  lines: () => islandLines(), onStats: (x) => { if (!x) return; P.isle = x; save(); checkQuests(); },
  labelsDirty: () => { if (labels) labels.dirty = true; },
  avatarPlay: (n) => { if (avatar && grounded && !boarding) avatar.play(n, { once: true }); },
  goTo: (pos, face) => { planet.position.set(-pos.x, 0, -pos.z); hop = pos.y; at.y = pos.y; vy = 0; grounded = true; facing = face; camYaw = face - Math.PI; flying = null; mode = "island"; },
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
  feet: () => hop, goIsland: (o) => goIsland(o), saveP: () => save(),
  owns: (id) => arclShop.owns(id),
  skyTheme: (th) => { skyOverride = th || ""; nightK = -1; dayNight(); },
  // a saved island and its likes earn ARCL (the server checks the saved island)
  makeCentre: (L) => VILL.makeCentre(THREE, K, L), onVillage: (v) => setVillage(v),
  onSaved: (x) => { [[20, "isle20"], [100, "isle100"], [300, "isle300"]].forEach(([n, k]) => { if (x.bricks >= n) arclClaim(k); }); [[1, "res1"], [5, "res5"]].forEach(([n, k]) => { if (x.residents >= n) arclClaim(k); }); },
  onLiked: () => { if (!P.vq || !P.vq.like) { P.vq = { ...P.vq, like: 1 }; save(); checkQuests(); } }, // a like given to another island (quest "visit-like")
  onShared: () => { if (!P.vq || !P.vq.share) { P.vq = { ...P.vq, share: 1 }; save(); checkQuests(); } }, // the island link was copied (quest "share-isle")
  onLikes: (n) => { [[1, "liked1"], [10, "liked10"], [50, "liked50"]].forEach(([m, k]) => { if (n >= m) arclClaim(k); }); },
  onArcl: (n) => { if (n > 0) { arclShop.refresh().then(() => toast(T("+{n} ARCL · {why}", { n, why: T("Leave a stamp on someone's island") }))); Snd.coin(); } },
});
// ---------------- ARCIRCLE LAND (world-land.js): the 20 villages on the ring past the hunting grounds ----------------
land = LANDM.createLand({ THREE, K, planet, esc, T: TW, toast, post, sess, Snd, CFG, lang: LANG, island, AC, addr, closeAll,
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); }, standAt: (x, z, c) => standAt(x, z, c), visit: (w) => goIsland({ visit: w }), myIsland: () => goIsland({}),
  signIn: () => openAuth(), labelsDirty: () => { if (labels) labels.dirty = true; }, onOwn: () => { if (ownNow) applyOwn(ownNow); } });
st.on((dt, t) => { if (land && mode === "hub") land.tick(dt, t, { x: -planet.position.x, z: -planet.position.z }); });
// ---------------- ARCL (world-shop.js): the counter, the shop, the exchange, the daily check-in ----------------
P.style = P.style || { plate: "", trail: "" };
const arclShop = SHOP.createShop({
  T, lang: LANG, esc, toast, post, sess, Snd, P, coarse, reduce, AC, addr,
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
  openAuth: () => openAuth(), openForge: () => rpg && rpg.show("forge"),
  // the daily chest's bonus (the ARCL part comes from the server): potions, scrap, XP or a gear chest
  dailyBonus: (k) => {
    const r = rpg.data(), out = [], add = (f, n) => { r[f] = (r[f] || 0) + n; };
    if (k === "hp2") { add("hp", 2); out.push({ k: "pot", text: T("+2 health potions") }); }
    else if (k === "scrap60" || k === "scrap120") { const n = k === "scrap60" ? 60 : 120; add("scrap", n); out.push({ k: "scrap", text: T("+{n} scrap", { n }) }); }
    else if (k === "mix") { add("sp", 2); add("recall", 1); out.push({ k: "pot", text: T("+2 mana potions") }, { k: "scroll", text: T("+1 recall scroll") }); }
    else if (k === "pots6") { add("hp", 3); add("sp", 3); out.push({ k: "pot", text: T("+3 health potions") }, { k: "pot", text: T("+3 mana potions") }); }
    else if (k === "xp150") { setTimeout(() => gain(150, T("Daily reward")), 900); out.push({ k: "xp", text: T("+150 XP") }); }
    else if (k === "gear") { const it = rpg.giftPiece(level()); out.push(it ? { k: "gear", text: rpg.itemName(it), color: RPG.RARITY[it.r].color } : { k: "scrap", text: T("Your bag was full, so the piece became scrap") }); }
    if (quests) quests.on.chest();
    save(); rpg.refresh(); if (combat) combat.paintPots();
    return out;
  },
  myCoins: () => myCoins, coins: () => (coinData || []).slice(0, 30),
  onOwn: (o) => applyOwn(o),
  using: (id) => P.style.plate === id || P.style.trail === id || P.style.paint === id || P.isleTheme === id,
  use: (id) => {
    if (id.startsWith("plate-")) P.style.plate = P.style.plate === id ? "" : id;
    else if (id.startsWith("trail-")) P.style.trail = P.style.trail === id ? "" : id;
    else if (id.startsWith("paint-")) P.style.paint = P.style.paint === id ? "" : id;
    else if (id.startsWith("style-")) { P.isleTheme = P.isleTheme === id ? "" : id; island.setTheme(P.isleTheme); }
    save(); setNameTag(); paintTrail();
  },
  buildWith: (id) => buildWith(id),
  onBought: (id) => { if (/^(brick|pack|style)-|^isle(48|64)$/.test(id)) { setTimeout(() => afterBuy(id), 700); if (!P.vq || P.vq.buy == null) { P.vq = { ...P.vq, buy: isleN("bricks") }; save(); } checkQuests(); } if (id === "feature-isle" || id === "billboard") refreshPlaza(); if (id.startsWith("plate-") || id.startsWith("trail-")) arclShop.close(); if (avatar) avatar.play("emote-yes", { once: true }); burst(0x4fd6ff); },
  furnace: () => { const f = shopG("reward"); if (f) f.userData.boost = 1; },
});
// ---------------- your village (world-village.js, api/_world-village.mjs): level, score, blessing, weekly contest ----------------
const village = VILL.createVillage({
  T: TW, esc, toast, post, sess, Snd,
  pay: (id, target, onStatus) => arclShop.pay(id, target, onStatus),
  goVillage: () => goIsland({}), visit: (w) => goIsland({ visit: w }),
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
  onVillage: (v) => setVillage(v),
});
// a bought brick, pack, island style or expansion: use it now on your island, or later (both a tap, neither pushed)
const onMyIsland = () => mode === "island" && island.kind() === "home" && !island.readOnly();
async function buildWith(id) {
  closeAll();
  if (/^style-/.test(id)) { P.isleTheme = id; save(); island.setTheme(id); }
  if (!onMyIsland()) await goIsland({});
  if (!onMyIsland()) return;
  if (/^style-/.test(id)) { island.setTheme(id); toast(T("Your island's style is on")); }
  else if (/^isle(48|64)$/.test(id)) toast(T("Your island is {n}×{n} now: more room to build", { n: id === "isle64" ? 64 : 48 }));
  else island.useItem(id);
}
function afterBuy(id) {
  document.querySelectorAll(".wv-after").forEach((e) => e.remove());
  const style = /^style-/.test(id), grow = /^isle(48|64)$/.test(id);
  const el = document.createElement("div"); el.className = "wp-leave wv-after"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  el.innerHTML = `<div class="wp-card wp-leave-card"><h2>${esc(style ? T("Your new island style is ready") : grow ? T("Your island has more room") : T("Your new pieces are in your builder"))}</h2>
    <p>${esc(style ? T("Put it on your island now, or any time from the shop's Use button.") : grow ? T("Go and build on it now, or come back to it any time.") : T("Build with them now (they'll be in your hotbar), or find them later in the builder's palette. Every new kind of piece raises your village score."))}</p>
    <div class="wp-leave-btns"><button type="button" class="wp-btn" data-later>${esc(TW("Later"))}</button><button type="button" class="wp-btn" data-now>${esc(style ? T("Use it now") : T("Build with it now"))}</button></div></div>`;
  document.body.appendChild(el); frozen = true; keys.clear();
  const done = () => { el.remove(); const sh = $("wa-sheet"); frozen = !!(sh && !sh.hidden); }; // back to the shop if it's still open
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-later]")) done(); else if (e.target.closest("[data-now]")) { done(); buildWith(id); } });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done(); } });
  setTimeout(() => { const b = el.querySelector("[data-later]"); if (b && !coarse) b.focus(); }, 40);
}
function setVillage(v) {
  const s = sess(); if (!v || !s || v.wallet !== lc(s.wallet)) return;
  const prev = P.vill && P.vill.w === v.wallet ? P.vill.level : 0;
  P.vill = { w: v.wallet, level: v.level, xp: v.xp, need: v.need, next: v.next, score: v.score, blessing: v.blessing || { xp: 0, hp: 0 }, payable: !!v.payable };
  save(); paintHud(); if (rpg) rpg.refresh();
  island.setVillage && island.setVillage(v.level, { score: v.score, payable: !!v.payable, next: v.next });
  if (prev && v.level > prev) { toast(T("Your village is now level {n}", { n: v.level })); Snd.level(); burst(0x39ff88); }
}
const done1 = new Set(); // claims already sent this session
function arclClaim(kind, extra = {}, from = null) { if (done1.has(kind)) return; done1.add(kind); arclShop.claim(kind, extra, from).then((n) => { if (!n && !sess()) done1.delete(kind); }); }
let ownNow = null; // the last worldOwn the shop gave (the pets in it are mirrored once the game is up)
function applyOwn(o) {
  ownNow = o; if (pet) pet.mirror(o);
  const items = (o && o.items) || [];
  island.setOwned(land && land.mine() ? [...items, "isle64", "land"] : items, (o && o.lots) || []); // b-land: an owner builds 64×64 and more bricks
  if (P.style.plate && !items.includes(P.style.plate)) P.style.plate = "";
  if (P.style.trail && !items.includes(P.style.trail)) P.style.trail = "";
  if (P.style.paint && !items.includes(P.style.paint)) P.style.paint = ""; // (a paint job is worn only while it's owned)
  if (P.isleTheme && !items.includes(P.isleTheme)) { P.isleTheme = ""; island.setTheme(""); }
  setNameTag(); paintTrail(); if (rpg && rpg.setBagPlus) rpg.setBagPlus(o && o.bag);
  starterOwn(o);
}
// ---------------- the season's Starter Package (api/_world-shop.mjs STARTER, b414) ----------------
// Bought with $ARCIRCLE through the shop's payment (the wallet confirms the transfer; half burned, half to the treasury).
// What it gives waits on the server (worldOwn.starter.gifts) and is taken here once per gift: the Legendary piece goes
// in the bag, the 100 potions on the pile. The 2× EXP runs on the server's clock (xpBoostUntil).
function starterOwn(o) {
  xpBoostUntil = Number(o && o.xpBoostUntil) || 0; paintBoost();
  const gifts = o && o.starter && Array.isArray(o.starter.gifts) ? o.starter.gifts : [];
  let ready = false; try { ready = !!rpg; } catch { /* still loading */ }
  if (!gifts.length || !ready) return;
  const r = rpg.data(); r.x = r.x || {}; const got = new Set(Array.isArray(r.x.sg) ? r.x.sg : []);
  const fresh = gifts.filter((g) => g && g.gid && !got.has(g.gid)); if (!fresh.length) return;
  const have = new Set([...Object.values(r.eq || {}), ...(r.bag || []), ...(r.store || [])].filter(Boolean).map((x) => x.id)), items = [];
  let pots = 0;
  for (const g of fresh) { if (g.item && g.item.id && !have.has(g.item.id)) { rpg.addItem({ ...g.item }, true); items.push(g.item); } pots += Math.max(0, Math.floor(g.hp || 0)); got.add(g.gid); }
  r.hp = (r.hp || 0) + pots; r.x.sg = [...got].slice(-12); save(); rpg.refresh();
  if (items.length || pots) starterCard(items, pots);
}
function paintBoost() { const b = document.querySelector("#wp-starter-btn .wp-st-boost"); if (b) b.hidden = !(xpBoostUntil > Date.now()); }
setInterval(paintBoost, 60e3);
const leftOf = (t) => { const m = Math.max(0, Math.round((t - Date.now()) / 60e3)); return m >= 60 ? T("{h} h {m} min left", { h: Math.floor(m / 60), m: m % 60 }) : T("{m} min left", { m }); };
function starterCard(items, pots) {
  const el = document.createElement("div"); el.className = "wp-cbt"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wp-stc-h"); el.setAttribute("data-no-i18n", "");
  const leg = RPG.RARITY[4];
  el.innerHTML = `<div class="wp-cbt-card"><div class="wp-cbt-top wp-st-top" aria-hidden="true"><img src="/images/world-starter-box.webp" alt=""></div><small>${esc(T("Starter Package"))}</small>
    <h2 id="wp-stc-h">${esc(T("Your Starter Package is in"))}</h2>
    <p>${esc(xpBoostUntil > Date.now() ? T("2× EXP is on: {t}.", { t: leftOf(xpBoostUntil) }) : T("Good hunting!"))}</p>
    <ul>${items.map((it, i) => { const pb = RPG.parseBase(it.b) || { slot: "weapon" }; return `<li style="--i:${i}">${RPG.iconSvg(pb.slot, leg.color)}<b>${esc(RPG.itemName(it))}</b><small>${esc(T("Legendary"))} · ${esc(T(RPG.SLOT_NAME[pb.slot] || pb.slot))} · ${esc(T("Lv {n}", { n: it.lv }))}</small></li>`; }).join("")}
    ${pots ? `<li style="--i:${items.length}"><svg viewBox="0 0 24 24" aria-hidden="true" style="--ic:#ff8fa3"><path d="M12 20s-7-4.3-8.6-8.5C2.2 8.3 4.2 5.2 7.3 5.2c1.9 0 3.2 1 4.7 2.8 1.5-1.8 2.8-2.8 4.7-2.8 3.1 0 5.1 3.1 3.9 6.3C19 15.7 12 20 12 20z"/></svg><b>${esc(T("{n} healing potions", { n: pots }))}</b><small>${esc(T("Added to your potions"))}</small></li>` : ""}</ul>
    <div class="wp-cbt-act"><button type="button" class="wp-cbt-bag">${esc(T("Open the bag"))}</button><button type="button" class="wp-cbt-x">${esc(T("Close"))}</button></div></div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.querySelector(".wp-cbt-x").addEventListener("click", close);
  el.querySelector(".wp-cbt-bag").addEventListener("click", () => { close(); rpg.show(); });
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  setTimeout(() => el.querySelector(".wp-cbt-bag").focus(), 40);
}
// the package's window: what's in it, this season's three prices (the next one marked), and the buy button
async function openStarter() {
  const s = sess(), fmtN = (n) => Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US");
  let v = null; try { const r = await fetch("/api/social?world=starter" + (s ? "&wallet=" + s.wallet : "")); v = r.ok ? await r.json() : null; } catch { v = null; }
  if (!v || !Array.isArray(v.prices)) { toast(T("The Starter Package isn't available right now")); return; }
  if (v.boostUntil) { xpBoostUntil = v.boostUntil; paintBoost(); }
  const el = document.createElement("div"); el.className = "wp-st"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wp-st-h"); el.setAttribute("data-no-i18n", "");
  const ord = [T("1st"), T("2nd"), T("3rd")], left = v.max - v.bought, on = v.open && left > 0;
  const row = (ic, t, d) => `<li><i class="wp-st-ic wp-st-${ic}" aria-hidden="true"></i><div><b>${t}</b><small>${esc(d)}</small></div></li>`;
  el.innerHTML = `<div class="wp-st-card">
    <button type="button" class="wp-st-x" aria-label="${esc(T("Close"))}">×</button>
    <div class="wp-st-head"><div><small>${esc(T("ARCIRCLE World · {s}", { s: T(v.name || "Season 1") }))}</small><h2 id="wp-st-h">${esc(T("Starter Package"))}</h2>
      <p>${esc(T("Up to {n} per account this season.", { n: v.max }))}</p></div><img src="/images/world-starter-box.webp" alt="" width="132" height="108"></div>
    <ul class="wp-st-list">
      ${row("leg", `${esc(T("1 random"))} <em>${esc(T("Legendary item"))}</em>`, T("A Legendary piece in a random slot, the tier you can wear at your level (Lv 15 or more)."))}
      ${row("exp", `<em>${esc(T("2× EXP"))}</em> ${esc(T("for 24 hours"))}`, xpBoostUntil > Date.now() ? T("On now: {t}. Another buy adds 24 hours.", { t: leftOf(xpBoostUntil) }) : T("Starts the moment the payment confirms."))}
      ${row("pot", `<em>100</em> ${esc(T("healing potions"))}`, T("For hunting and boss fights."))}
    </ul>
    <table class="wp-st-price"><thead><tr><th>${esc(T("Purchase"))}</th><th>${esc(T("Price"))}</th></tr></thead><tbody>
      ${v.prices.map((p, i) => `<tr class="${i < v.bought ? "done" : i === v.bought && on ? "next" : ""}"><td>${esc(ord[i] || String(i + 1))}${i < v.bought ? ` <span>${esc(T("Bought"))}</span>` : ""}</td><td><b>${fmtN(p)}</b> $ARCIRCLE</td></tr>`).join("")}
    </tbody></table>
    <p class="wp-st-note">${esc(T("Paid in $ARCIRCLE from your wallet on Arc: 50% is burned and 50% goes to the treasury."))}</p>
    <p class="wp-st-status" role="status" hidden></p>
    <button type="button" class="wp-st-buy"${on ? "" : " disabled"}>${esc(!v.open ? T("Not on sale this season") : left <= 0 ? T("Bought {n} of {n} this season", { n: v.max }) : !s ? T("Sign in to buy") : T("Buy for {n} $ARCIRCLE", { n: fmtN(v.next) }))}</button></div>`;
  document.body.appendChild(el); frozen = true; keys.clear();
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.querySelector(".wp-st-x").addEventListener("click", close);
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  const buy = el.querySelector(".wp-st-buy"), st = el.querySelector(".wp-st-status");
  const say = (t) => { st.textContent = t || ""; st.hidden = !t; };
  buy.addEventListener("click", async () => {
    if (!on || buy.disabled) return;
    if (!sess()) { close(); signIn().then(() => { paintAcct(); openStarter(); }).catch((e) => toast((e && e.message) || T("Sign-in failed."))); return; }
    buy.disabled = true;
    const done = await arclShop.pay("starter", "", say).catch(() => false);
    if (done) { close(); return; } // the gifts arrive through the shop's answer (applyOwn)
    buy.disabled = false;
  });
  setTimeout(() => (on ? buy : el.querySelector(".wp-st-x")).focus(), 40);
}
// ---------------- the welcome week (api/_world-welcome.mjs, b5): seven gifts for a new player, one a day ----------------
// A button up top (a dot when today's gift is waiting; never a popup). Guests below Lv 20 see it too, with a sign-in.
let welcomeV = null;
const WK_ICON = { hp: "pot", arcl: "arcl", egg: "egg", scrap: "scrap", trial: "pick" };
const wkLabel = (g) => g.kind === "supply" ? (g.s === "scrap" ? T("+{n} scrap", { n: g.n }) : T("{n} healing potions", { n: g.n })) : g.kind === "arcl" ? TW("{n} ARCL", { n: Number(g.n).toLocaleString("en-US") }) : g.kind === "egg" ? TW("A pet egg") : TW("Advanced Pickaxe · 7 days");
async function refreshWelcome() {
  const btn = $("wp-gift-btn"); if (!btn) return;
  const s = sess();
  if (!s) { welcomeV = null; btn.hidden = !(level() < 20); btn.classList.remove("ready"); return; }
  try { const r = await fetch("/api/social?world=welcome&wallet=" + s.wallet); welcomeV = r.ok ? await r.json() : null; } catch { welcomeV = null; }
  btn.hidden = !(welcomeV && welcomeV.eligible); btn.classList.toggle("ready", !!(welcomeV && welcomeV.ready));
}
async function openWelcome() {
  const s = sess();
  if (s) await refreshWelcome();
  const v = welcomeV || { eligible: !s, n: 0, ready: false, gifts: [{ kind: "supply", s: "hp", n: 20 }, { kind: "arcl", n: 500 }, { kind: "egg" }, { kind: "arcl", n: 1000 }, { kind: "supply", s: "scrap", n: 50 }, { kind: "arcl", n: 1500 }, { kind: "trial" }] };
  if (s && !v.eligible) { toast(TW("The welcome week is over. Thanks for playing!")); $("wp-gift-btn").hidden = true; return; }
  const el = document.createElement("div"); el.className = "wp-st wp-wk"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wp-wk-h"); el.setAttribute("data-no-i18n", "");
  const days = v.gifts.map((g, i) => `<li class="${i < v.n ? "got" : i === v.n ? (v.ready ? "now" : "next") : ""}" style="--i:${i}"><small>${esc(TW("Day {n}", { n: i + 1 }))}</small><i class="wp-wk-ic wp-wk-${WK_ICON[g.kind === "supply" ? g.s : g.kind]}" aria-hidden="true"></i><b>${esc(wkLabel(g))}</b>${i < v.n ? `<em>✓</em>` : ""}</li>`).join("");
  const left = v.until ? Math.max(0, Math.ceil((v.until - Date.now()) / 864e5)) : 14;
  el.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(T("Close"))}">×</button>
    <div class="wp-st-head"><div><small>${esc(TW("New player gifts"))}</small><h2 id="wp-wk-h">${esc(TW("Welcome Week"))}</h2>
      <p>${esc(TW("One gift a day, seven in all. Days off are fine: finish within {n} days.", { n: v.until ? left : 14 }))}</p></div></div>
    <ol class="wp-wk-days">${days}</ol>
    <p class="wp-st-status" role="status" hidden></p>
    <button type="button" class="wp-st-buy">${esc(!s ? TW("Sign in to claim") : v.ready ? TW("Claim day {n}", { n: v.n + 1 }) : TW("Come back tomorrow for day {n}", { n: v.n + 1 }))}</button></div>`;
  document.body.appendChild(el); frozen = true; keys.clear();
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.querySelector(".wp-st-x").addEventListener("click", close);
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  const go = el.querySelector(".wp-st-buy"), st = el.querySelector(".wp-st-status");
  if (s && !v.ready) go.disabled = true;
  go.addEventListener("click", async () => {
    if (!sess()) { close(); signIn().then(() => { paintAcct(); refreshWelcome().then(openWelcome); }).catch((e) => toast((e && e.message) || T("Sign-in failed."))); return; }
    go.disabled = true;
    const r = await post({ action: "world-welcome-claim", ...sess() }).catch(() => null);
    if (!r || !r.ok) { st.textContent = (r && r.j && r.j.error) || TW("Couldn't claim the gift. Try again."); st.hidden = false; go.disabled = false; return; }
    const j = r.j, g = v.gifts[j.day - 1] || {};
    if (j.supply && rpg && rpg.addSupply) { rpg.addSupply(j.supply.kind, j.supply.n); if (combat) combat.paintPots(); }
    if (j.own) applyOwn(j.own);
    if (j.arcl) refreshPurse(true);
    close(); // b-r2: the day's gift opens from a blue box
    const wkImg = g.kind === "arcl" ? "/images/launch/arcl.webp" : g.kind === "supply" && g.s === "hp" ? "/images/hud/pot-hp.webp" : "/images/brand/arcircle-world-logo-256.webp";
    await giftOpen(TW("Day {n}", { n: j.day }), [{ img: wkImg, t: wkLabel(g) }], "daily");
    toast(TW("Day {n} gift: {g}", { n: j.day, g: wkLabel(g) }) + (j.trialUntil ? " · " + TW("ready in the ARCL Mine") : ""));
    refreshWelcome();
  });
  setTimeout(() => go.focus(), 40);
}
// the plaza screen: the island of the day or a coin, from the shop (GET ?world=plaza)
let plazaNow = null;
async function refreshPlaza() {
  try { const r = await fetch("/api/social?world=plaza"); plazaNow = r.ok ? await r.json() : null; } catch { plazaNow = null; }
  const b = screen.userData.board, isle = plazaNow && plazaNow.isle, coin = plazaNow && plazaNow.coin;
  b.userData.draw((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#0b2340"); gr.addColorStop(1, "#0d3a2c"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8fe9df"; g.font = "700 26px Sora, sans-serif"; g.fillText(isle ? (isle.contest ? T("Last week's top island") : T("Island of the day")) : coin ? T("On ArcPad") : T("This week's island contest"), 24, 44);
    g.fillStyle = "#ffffff"; g.font = "700 58px Sora, sans-serif";
    g.fillText(isle ? isle.name.slice(0, 16) : coin ? "$" + String(coin.symbol || "").slice(0, 10) : T("Build yours"), 24, 130);
    g.fillStyle = "#c9d6e2"; g.font = "600 24px Sora, sans-serif";
    g.fillText(isle || coin ? T("Walk up and press E to visit") : T("The most-liked island this week goes up here next week"), 24, h - 28);
  });
}
every(60000, refreshPlaza);
function islandLines() {
  const out = [];
  if (arcStats && arcStats.change24h != null) out.push(T("$ARCIRCLE is {p} today", { p: (arcStats.change24h >= 0 ? "+" : "") + arcStats.change24h.toFixed(1) + "%" }));
  if (coinData && coinData.length) { const c = coinData.slice().sort((a, b) => b.launchedAt - a.launchedAt)[0]; out.push(T("Did you see {x} launch on ArcPad?", { x: "$" + c.symbol })); }
  if (arcStats && arcStats.burned && arcStats.burned.tokens) out.push(T("{n} $ARCIRCLE burned so far", { n: Math.round(arcStats.burned.tokens).toLocaleString("en-US") }));
  out.push(T("Scan a token before you buy it."), T("I love this island."));
  return out;
}
let isleArea = ""; // whose island you are on (world-chat.js: an island is a chat area)
async function goIsland(opt) {
  if (!opt || (!opt.visit && !opt.lot)) tutorialStep(6);
  closeAll();
  const veil = $("wp-veil"); veil.style.opacity = "1"; await sleep(reduce ? 0 : 260);
  if (mode === "island") island.leave();
  const ok = await island.enter(opt);
  if (ok) isleArea = opt.visit ? lc(opt.visit) : opt.lot ? lc(opt.lot.token) : (sess() ? lc(sess().wallet) : "");
  if (!ok) { if (mode === "island") leaveIsland(); }
  else if (opt.visit && !P.visited.includes("isle-visit")) { P.visited.push("isle-visit"); save(); checkQuests(); }
  near = null; paintPrompt(); veil.style.opacity = "0";
}
function leaveIsland() {
  const wasLot = island.kind && island.kind() === "lot" ? coinBuildings.find((g) => lc(g.userData.coin.token) === isleArea) : null; // b-lpv: back beside the lot you were building
  island.leave(); mode = "hub";
  if (wasLot) { const p = wasLot.position, L = LD.landAt(p.x, p.z), cx = L ? L.x : 0, cz = L ? L.z : 0, d = Math.hypot(cx - p.x, cz - p.z) || 1, r = (wasLot.userData.radius || 3) + 2; standAt(p.x + ((cx - p.x) / d) * r, p.z + ((cz - p.z) / d) * r, { x: p.x, z: p.z }); vfx.teleport(here(), { color: 0x39ff88, color2: 0x2ee07a }); landTick(true); near = null; paintPrompt(); dressLots(); return; }
  const p = isleGate.position, front = new THREE.Vector3(-p.x, 0, -p.z).normalize(), stand = new THREE.Vector3(p.x, 0, p.z).addScaledVector(front, 3.6);
  planet.position.copy(stand).negate(); hop = 0; at.y = 0; vy = 0; grounded = true; facing = Math.atan2(-front.x, -front.z) + Math.PI; camYaw = facing - Math.PI;
  vfx.teleport(here(), { color: 0x39ff88, color2: 0x2ee07a });
  if (labels) labels.dirty = true; near = null; paintPrompt();
}

// ---------------- what's in reach ----------------
function nearest() {
  let best = null, bd = Infinity;
  const consider = (g, kind, extra, reach) => { g.getWorldPosition(tmp); const d = tmp.distanceTo(at) - (g.userData.radius || 1); if (d < reach && d < bd) { bd = d; best = { kind, g, ...extra }; } };
  if (defenseOn || jumpOn || beatOn || mineOn || jurOn || survOn || ringsOn || pokerOn) return null; // in a Game Village game (or the mine) the town is gone
  if (mode === "island") { island.near(consider); return best; }
  if (land) land.near(consider);
  mv.doors.forEach((d) => consider(d, d.userData.game === "miner" ? "miner" : "mine", {}, 2.4));
  gv.doors.forEach((d) => { if (d.userData.game === "defense") consider(d, "defense", {}, 2.4); else if (d.userData.game === "jump") consider(d, "jump", {}, 2.4); else if (d.userData.game === "beat") consider(d, "beat", {}, 2.4); else if (d.userData.game === "surv") consider(d, "surv", {}, 2.6); else if (d.userData.game === "rings") consider(d, "rings", {}, 2.6); else if (d.userData.game === "poker") consider(d, "poker", {}, 2.6); });
  consider(isleGate, "isle", {}, 2.4);
  consider(jurGate, "jurassic", {}, 2.6);
  consider(agentGate, "agentdim", {}, 3.2);
  if (rqL && landNow === "rq" && rqL.hall.visible) { consider(rqL.door, "rqgate", {}, 4); consider(rqL.back, "lport", { to: "town" }, 2.6); } // RAID QUEENS' sky realm: the Citadel's door, the way home
  if (!landNow) stuHub.doors.forEach((d) => consider(d, "adb", { b: d.userData.b }, 2.4)); // the Studio by the plaza and its cabinets
  if (ccL && landNow === "cc") { ccL.doors.forEach((d) => { if (d.parent && d.parent.visible !== false) consider(d, "ccb", { b: d.userData.b }, 2.4); }); consider(ccL.back, "lport", { to: "town" }, 2.6); } // Studio Beta: Creator City
  if (adc && landNow === "ad") { adc.doors.forEach((d) => consider(d, "adb", { b: d.userData.b }, 2.4)); consider(adc.back, "lport", { to: "town" }, 2.6); } // AD-City 1
  pvil.doors.forEach((d) => consider(d, d.userData.partner, {}, 3));
  if (plazaNow && (plazaNow.isle || plazaNow.coin)) consider(screen, "screen", {}, 2.6);
  shops.forEach((g) => consider(g, "shop", { spec: g.userData.spec }, 2.8));
  coinBuildings.forEach((g) => consider(g, "coin", { coin: g.userData.coin }, 2.4));
  consider(portal, "portal", {}, 2.4);
  if (fountDay() !== tipDay() && !landNow) consider(fountain, "fountain", {}, 5.2); // b-st3: today's coin, while it's still to toss
  lands.portals.forEach((g) => consider(g, "lport", { to: g.userData.to }, 2.6)); lands.back.forEach((g) => { if (g.parent && g.parent.visible) consider(g, "lport", { to: "town" }, 2.6); }); // b-lpv
  consider(pad, "pad", {}, 1.6);
  if (race && !race.racing()) consider(race.pad, "race", {}, 1.8);
  if (npc) consider(npc, "npc", {}, 2.4);
  if (bounty) consider(bounty, "bounty", {}, 2.0);
  return best;
}
function paintPrompt() {
  const p = $("wp-prompt");
  // the prompt fades in at the middle of the screen while you're close, and fades out as you walk on
  if (!near || frozen) { if (p.classList.contains("on")) { p.classList.remove("on"); clearTimeout(p._t); p._t = setTimeout(() => { if (!p.classList.contains("on")) p.hidden = true; }, 320); } else p.hidden = true; return; }
  clearTimeout(p._t);
  if (p.hidden) { p.hidden = false; void p.offsetWidth; }
  p.classList.add("on");
  const b = (s) => `<b>${esc(s)}</b>`;
  $("wp-enter-t").innerHTML = near.kind === "fountain" ? esc(TW("Toss a coin in the fountain")) : near.kind === "lport" ? (near.to === "town" ? b(TW("Back to town")) : near.to === "rq" && !rqOn() ? b("RAID QUEENS") + " · " + esc(TW("Under construction")) : TW("Go to {x}", { x: b(landName(near.to)) })) : near.kind === "land" ? land.promptHTML(near.n) : near.kind === "bounty" ? T("Read {x}", { x: b(T("the bounty board")) }) : near.kind === "screen" ? (plazaNow && plazaNow.isle ? T("Visit {x}", { x: b(T("{name}'s island", { name: plazaNow.isle.name })) }) : T("Visit {x}", { x: b("$" + ((plazaNow && plazaNow.coin && plazaNow.coin.symbol) || "")) })) : near.kind === "isle" ? T("Go to {x}", { x: b(T("My Island")) }) : near.kind === "isle-exit" ? esc(T("Back to the world")) : near.kind === "village" ? (near.mine ? T("Open {x}", { x: b(T("My village")) }) : T("Village centre · Lv {n}", { n: near.level })) : near.kind === "resident" ? T("Talk to {x}", { x: b(near.res.name) }) : near.kind === "portal" ? T("Go to {x}", { x: b(T("Platform World")) }) : near.kind === "defense" ? esc(TW("Start AC Defense")) : near.kind === "jump" ? esc(TW("Start Coin Jump")) : near.kind === "miner" ? T("Talk to {x}", { x: b(TW("the miner")) }) : near.kind === "mine" ? (mineRest > Date.now() ? esc(TW("ARCL Mine · opens in {t}", { t: restLeft(mineRest) })) : esc(TW("Enter the ARCL Mine"))) : near.kind === "rqgate" ? (rqOn() ? T("Enter {x}", { x: b("RAID QUEENS") }) : b("RAID QUEENS") + " · " + esc(TW("Under construction"))) : near.kind === "agentdim" ? T("Enter {x}", { x: b(TW("AGENT DIMENSION")) }) : near.kind === "adb" ? cityPrompt(near.b, b) : near.kind === "ccb" ? ccPrompt(near.b, b) : near.kind === "kairo" ? T("Enter {x}", { x: b(TW("KAIRO Finance Hub")) }) : near.kind === "jurassic" ? (jurAllowed() ? T("Enter {x}", { x: b(TW("Jurassic World")) }) : esc(TW("Jurassic World · Coming soon"))) : near.kind === "beat" ? esc(TW("Start Beat Stomp")) : near.kind === "surv" ? esc(TW("Enter Survivors Arena")) : near.kind === "rings" ? esc(TW("Play INFINITY RINGS")) : near.kind === "poker" ? esc(TW("Enter ARCIA Poker Lounge")) : near.kind === "pad" ? esc(T("Fast travel")) : near.kind === "race" ? T("Start the {x}", { x: b(T("hoverboard race")) }) : near.kind === "npc" ? T("Talk to {x}", { x: b("ARCIA") }) : near.kind === "coin" ? T("Visit {x}", { x: b("$" + near.coin.symbol) }) : T("Enter {x}", { x: b(near.spec.name) });
  { const e2 = $("wp-enter2"), on = near.kind === "isle"; e2.hidden = !on; if (on) e2.innerHTML = `<span>${esc(T("Visit a friend's island"))}</span><small>${esc(island.friendCount() ? T("{n} friends, one at random", { n: island.friendCount() }) : T("No friends yet: a random island"))}</small>`; }
}
$("wp-enter").addEventListener("click", () => near && enter(near));
// at the My Island gate, a second button (b406): a friend's island, at random
$("wp-enter2").addEventListener("click", () => { if (near && near.kind === "isle") island.visitFriend(); });

// ---------------- ARCIA's favour of the day ----------------
// Talk to ARCIA on the plaza: once a day she asks a small favour (from a fixed list, the same for everyone that day);
// done, she thanks you with some XP. Kept in this browser.
const ARCIA_TASKS = [
  { id: "kill5", t: "Knock out 5 scammers for me?", n: 5, on: "kill" },
  { id: "elite1", t: "There's an elite out there. Could you knock one out?", n: 1, on: "kill", f: (k) => k && k.rank === "elite" },
  { id: "loot3", t: "Bring back 3 pieces of gear from the hunting grounds?", n: 3, on: "loot" },
  { id: "fish1", t: "I'd love a fish from one of the ponds. Catch one?", n: 1, on: "fish" },
  { id: "zone2", t: "Go and look round 2 hunting grounds for me?", n: 2, on: "zone" },
  { id: "kill12", t: "The streets are busy today. Knock out 12 scammers?", n: 12, on: "kill" },
];
const AQ_KEY = "arc.world.arciaQ";
const aqDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const aqTask = () => ARCIA_TASKS[Math.floor(Date.parse(aqDay()) / 864e5) % ARCIA_TASKS.length];
const aqGet = () => { try { const v = JSON.parse(localStorage.getItem(AQ_KEY) || "null"); return v && v.day === aqDay() ? v : { day: aqDay(), id: aqTask().id, got: 0, on: false, done: false, seen: [] }; } catch { return { day: aqDay(), id: aqTask().id, got: 0, on: false, done: false, seen: [] }; } };
const aqSet = (v) => { try { localStorage.setItem(AQ_KEY, JSON.stringify(v)); } catch { /* private */ } };
function arciaOn(kind, x) {
  const q = aqGet(), t = ARCIA_TASKS.find((y) => y.id === q.id); if (!q.on || q.done || !t || t.on !== kind || (t.f && !t.f(x))) return;
  if (kind === "zone") { const id = x && x.id; if (!id || (q.seen || []).includes(id)) return; q.seen = [...(q.seen || []), id]; }
  q.got = Math.min(t.n, q.got + 1);
  if (q.got >= t.n) { q.done = true; aqSet(q); const xp = 60 + level() * 3; setTimeout(() => { feed(T("ARCIA: thank you! That helps a lot."), "#ff7ad9"); gain(xp, T("A favour for ARCIA")); }, 400); }
  else { aqSet(q); if (q.got === Math.ceil(t.n / 2)) feed(T("ARCIA's favour: {a}/{b}", { a: q.got, b: t.n }), "#ff7ad9"); }
}
/// near ARCIA: her favour first (once a day); false when there's nothing to ask, so the chat opens as before
function arciaAsk() {
  const q = aqGet(), t = ARCIA_TASKS.find((y) => y.id === q.id); if (!t || q.done || (q.on && q.asked)) return false;
  const el = document.createElement("div"); el.className = "wp-arciaq"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", "");
  el.innerHTML = `<div class="wp-arciaq-card"><small>ARCIA</small><p>${esc(q.on ? T("How's it going? {a}/{b} so far.", { a: q.got, b: t.n }) : T(t.t))}</p><div>${q.on ? "" : `<button type="button" class="wp-btn go" data-aq="yes">${esc(T("Sure"))}</button>`}<button type="button" class="wp-btn" data-aq="chat">${esc(T("Just chat"))}</button></div></div>`;
  document.body.appendChild(el); frozen = true; keys.clear(); paintPrompt();
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-aq]"); if (!b && e.target !== el) return; el.remove(); frozen = false;
    if (b && b.dataset.aq === "yes") { q.on = true; q.asked = true; aqSet(q); toast(T("ARCIA's favour: {x}", { x: T(t.t) })); if (avatar && avatar.face) avatar.face("happy", 1.5); }
    else if (b && b.dataset.aq === "chat") { q.asked = q.on; aqSet(q); if (npc) openSheet("ARCIA", T("Arc's AI idol. Ask her anything about a coin, a wallet or this world."), "/arc#arcia"); } });
  return true;
}
// ---------------- shops, coins, ARCIA ----------------
const sheet = $("wp-sheet"), frame = $("wp-frame");
let openShop = null;
let lotCoin = null, frameT = 0;
$("wp-sheet-lot").addEventListener("click", () => { const c = lotCoin; closeSheet(); if (!c) return; const tr = LD.LOT_TIERS[lotTierOf(c)]; goIsland({ lot: { ...c, N: tr.N, max: tr.max } }); }); // b-lpv: the lot's tier: its size and brick limit
function openSheet(title, line, url) {
  $("wp-sheet-lot").hidden = true;
  $("wp-sheet-h").textContent = title; $("wp-sheet-p").textContent = line;
  $("wp-sheet-full").href = url;
  // Most shops are sections of the same page (/arc#launch, /arc#swap, …): switching between them only changes the
  // hash, which doesn't reload the frame, so its load event never comes. Then the page is already there: just move
  // to the section. A slow first load still clears its cover after a while (the page shows its own loading).
  const load = $("wp-frame-load"), cur = frame.getAttribute("src") || "", path = (u) => u.split("#")[0];
  clearTimeout(frameT);
  if (cur === url) load.hidden = true;
  else if (cur && path(cur) === path(url)) {
    load.hidden = true;
    try { frame.contentWindow.location.hash = url.split("#")[1] || ""; } catch { /* another origin: set src below */ }
    frame.setAttribute("src", url);
  } else {
    load.hidden = false;
    frame.onload = () => { load.hidden = true; clearTimeout(frameT); };
    frame.src = url;
    frameT = setTimeout(() => { load.hidden = true; }, 9000);
  }
  sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add("on"));
  frozen = true; keys.clear(); paintPrompt(); Snd.enter();
  if (avatar) avatar.play("interact-right", { once: true });
  $("wp-sheet-x").focus({ preventScroll: true });
}
// the camera leans in toward the door before the shop opens
function doorThen(g, fn) {
  if (reduce || !g) { fn(); return; }
  g.getWorldPosition(tmp); const yaw = Math.atan2(-tmp.x, -tmp.z) + Math.PI;
  const y0 = camYaw, t0 = performance.now(); frozen = true;
  entryGlow(g);
  const off = st.on(() => { const k = Math.min(1, (performance.now() - t0) / 420); camYaw = angLerp(y0, yaw, k); camZoom = 1 - 0.35 * k; if (k >= 1) { off(); fn(); } });
}
// going in: a soft column of light at the hall's door
function entryGlow(g) {
  if (reduce || !g || !g.parent) return;
  const p = g.position.clone(), d = p.clone().setY(0).normalize().multiplyScalar(-((g.userData.radius || 2) + 0.4));
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3.4, 28, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fe6ff).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  col.position.copy(p).add(d).setY(1.7); planet.add(col);
  const t0 = performance.now(), off = st.on(() => { const k = (performance.now() - t0) / 650; col.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.55; col.scale.set(1 - k * 0.3, 1 + k * 0.4, 1 - k * 0.3); if (k >= 1) { off(); planet.remove(col); col.geometry.dispose(); col.material.dispose(); } });
}
// wading through the fountain's pool: ripples behind you
let rippleT = 0;
function ripples(dt) {
  if (reduce || mode !== "hub" || !grounded) return;
  rippleT -= dt; if (rippleT > 0 || speedNow < 1) return;
  here(tmp2); const r = Math.hypot(tmp2.x, tmp2.z); if (r > 4.05 || r < 2.6) return;
  rippleT = speedNow > 9 ? 0.16 : 0.3;
  const m = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.34, 32), new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(tmp2.x, 0.36, tmp2.z); planet.add(m);
  const t0 = performance.now(), off = st.on(() => { const k = (performance.now() - t0) / 900; m.scale.setScalar(1 + k * 3.2); m.material.opacity = 0.8 * (1 - k); if (k >= 1) { off(); planet.remove(m); m.geometry.dispose(); m.material.dispose(); } });
}
// stand at (x, z) facing the point c (a short teleport: arenas, the Game Village)
function standAt(x, z, c = { x: 0, z: 0 }) { planet.position.set(-x, 0, -z); hop = 0; at.y = 0; vy = 0; grounded = true; facing = Math.atan2(c.x - x, c.z - z); camYaw = facing - Math.PI; near = null; if (labels) labels.dirty = true; }
// the menu's Game Village tile: hop to the village gate, facing the square
function goPartnerVillage() { // Menu → Partner Village: to its gate, facing in
  if (frozen || flying || introOn || mode !== "hub") return; closeAll();
  const c = pvil.center, d = Math.hypot(c.x, c.z) || 1, r = pvil.r + 4; pvil.build(); standAt(c.x - (c.x / d) * r, c.z - (c.z / d) * r, c);
  vfx.teleport(here(), { color: 0x38e1d6, color2: 0x7cf5c8 }); paintPrompt();
}
function goPartnerTower(id = "kairo", k = 10) { // the map's Partner Village list: straight to a partner's building, facing its door
  if (frozen || flying || introOn || mode !== "hub") return; const d0 = pvil.door(id); if (!d0) { goPartnerVillage(); return; } closeAll(); pvil.build();
  const g = d0.getWorldPosition(new THREE.Vector3()).sub(planet.position), c = pvil.center, a = Math.atan2(g.x - c.x, g.z - c.z) + 0.55; // (a little to one side, so the camera behind you clears the square's light pillar)
  standAt(g.x - Math.sin(a) * k, g.z - Math.cos(a) * k, { x: g.x, z: g.z }); vfx.teleport(here(), { color: 0x38e1d6, color2: 0x7cf5c8 }); paintPrompt();
}
// b-lpv: a portal's trip (the town's to a land or a village; a land's back to the town, by that land's portal)
const landName = (id) => (id === "cc" ? TW("Creator City") : id === "rq" ? "RAID QUEENS" : id === "ad" ? TW("Nexus City") : id === "lp" ? TW("Launchpad Village") : id === "ut" ? TW("Utility Village") : id === "pv" ? TW("Partner Village") : id === "gv" ? TW("Game Village") : TW("Town"));
const cityPrompt = (id, b) => { if (id === "studio") return T("Enter {x}", { x: b(TW("Creator City")) }) + `<small class="adc-sub">ARCIRCLE STUDIO BETA · ${esc(TW("Make your own game"))}</small>`; if (/^(pick|cab\d)$/.test(id)) { const pk = stuHub.pick(id), cb = stuHub.cabs().find((c) => c.id === id); return pk ? TW("Play {x}", { x: b(pk.title) }) + `<small class="adc-sub">${esc(TW(cb ? cb.name : "Studio pick"))} · ${esc(TW("by {name}", { name: pk.byName || "—" }))}</small>` : T("Open {x}", { x: b(TW("ARCIRCLE Studio")) }); } const B = adc && adc.M.BUILDINGS.find((x) => x.id === id); if (!B) return ""; return (B.open ? T("Enter {x}", { x: b(TW(B.name)) }) : b(TW(B.name)) + " · " + esc(TW("Coming soon"))) + `<small class="adc-sub">${esc(TW(B.sub))}</small>`; };
let landNow = "";
function landGo(to) {
  if (frozen || flying || introOn || mode !== "hub") return;
  if (to === "gv") { goGameVillage(); return; } if (to === "pv") { goPartnerVillage(); return; } if (to === "ad") { cityGo(); return; } if (to === "rq") { rqGo(); return; }
  closeAll();
  if (to === "town" && landNow === "cc") { const c = stuHub.center, d = Math.hypot(c.x, c.z) || 1, k = (d - 9) / d; standAt(c.x * k, c.z * k, { x: c.x, z: c.z }); } // (Creator City: out at the Studio's door by the fountain)
  else if (to === "town" && landNow === "ad") { const v = agentGate.position, d = Math.hypot(v.x, v.z) || 1, k = K.AGENT_GATE.r + 7; standAt(v.x - (v.x / d) * k, v.z - (v.z / d) * k, { x: 0, z: 0 }); } // (AD-City: out by the Citadel)
  else if (to === "town") { const p = lands.portals.find((q) => q.userData.to === landNow) || lands.portals[0], v = p.position, d = Math.hypot(v.x, v.z) || 1, k = Math.max(3.4, (p.userData.radius || 0) + 2.5); standAt(v.x - (v.x / d) * k, v.z - (v.z / d) * k, p.userData.far ? { x: v.x, z: v.z } : { x: 0, z: 0 }); } /* (a far portal: face it, so the camera stays out of the building) */
  else { const a = lands.arrival(to); if (!a) return; standAt(a.x, a.z, a.c); }
  const col = to === "lp" ? 0x39ff88 : to === "ut" ? 0x4f9dff : 0x7fe9ff; vfx.teleport(here(), { color: col, color2: 0x2f86ff }); if (Snd.dash) Snd.dash();
  pullFlash("#" + col.toString(16).padStart(6, "0")); startSweep(1200); // b-st2: a flash of the portal's colour as it pulls you through, and the camera swings in
  landTick(true); paintPrompt();
}
/// which land you're in: its group shown, the quest's arrow through the portals, a title on arrival
function landTick(force) {
  const L = mode === "hub" ? LD.landAt(-planet.position.x, -planet.position.z) : null, id = L ? L.id : "";
  lands.show(id); if (adc) adc.show(id === "ad"); if (rqL) rqL.show(id === "rq"); if (ccL) ccL.show(id === "cc"); if (id === landNow && !force) return;
  const was = landNow; landNow = id; try { stuGate().on("cc", id === "cc"); } catch { /* not on this browser */ } document.body.classList.toggle("wp-in-cc", id === "cc"); if (id === "cc") try { ccBar(); } catch { /* made on the way in */ } /* (2026-10-26, the owner: Creator City has no monsters, and its top-left is the way home) */ if (labels) labels.dirty = true; try { rain.visible = mood === "rain" && id !== "rq"; } catch { /* not made yet */ } /* (no town rain in RAID QUEENS' sky realm) */ try { paintQuests(); } catch { /* the quests aren't up yet */ }
  if (id && id !== was) { toast(`<b>${esc(landName(id))}</b>`); if (id === "lp" && !P.visited.includes("lpv")) { P.visited.push("lpv"); save(); } if (id === "ut" && !P.visited.includes("utv")) { P.visited.push("utv"); save(); } if (id === "ad" && !P.visited.includes("adc")) { P.visited.push("adc"); save(); } if (id === "rq" && !P.visited.includes("rqx")) { P.visited.push("rqx"); save(); } }
}
st.on(() => { try { landTick(false); } catch { /* still loading */ } });
// PF5 (2026-10-27, diag: 850–1,900 textures alive in the raid's and the Studio's lands on phones): eight seconds into
// a land (the town included) a phone lets go of the GPU copies of the textures only hidden things use — the town's in
// a land, a land's once you're back (the raid hall alone held ~300) — three.js uploads a texture again the first time
// it's drawn, from the picture it still holds; back in town the town's own go up again a few a frame
const texRest = (() => {
  if (!coarse) return { tick() {}, count: () => 0 };
  let rested = [], back = [];
  const texOf = (m, out) => { for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.isRenderTargetTexture && !v.isVideoTexture) out.add(v); } };
  const LANDR = /^(land-|rq-hall|rq-sky-realm|rq-back)/;
  function landTex() { const out = new Set(); for (const c of planet.children) if (LANDR.test(c.name) && !c.visible) c.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite || o.isLine) for (const m of [].concat(o.material || [])) if (m) texOf(m, out); }); return out; }
  function rest() {
    const keep = new Set(), maybe = new Set();
    const walk = (o, vis) => { const v = vis && o.visible; if (o.isMesh || o.isPoints || o.isSprite || o.isLine) for (const m of [].concat(o.material || [])) if (m) texOf(m, v ? keep : maybe); for (const c of o.children) walk(c, v); };
    walk(st.scene, true); if (st.scene.background && st.scene.background.isTexture) keep.add(st.scene.background); if (st.scene.environment) keep.add(st.scene.environment);
    // in town only the other lands' hidden groups let go (the town's own far-culled props come back as you walk, and an
    // upload then would be the very hitch this is for); in a land, all that's hidden
    const only = landNow ? null : landTex();
    for (const t of maybe) if (!keep.has(t) && !t.userData.rested && (!only || only.has(t))) { t.dispose(); t.userData.rested = true; rested.push(t); }
  }
  let land0 = null, at0 = 0, done = false; /* (by the clock: a slow phone's frames are clamped) */
  return { tick() { const now = performance.now();
    if (mode !== "hub" || landNow !== land0) { const wasLand = land0; land0 = mode === "hub" ? landNow : null; at0 = now; done = false;
      if (land0 === "" && wasLand && rested.length) try { const L = landTex(); const still = []; for (const t of rested) (L.has(t) ? still : back).push(t); rested = still; } catch { /* they come back when drawn */ } } /* (back in town: the town's own go up again, a few a frame) */
    if (!done && now - at0 > 8000) { done = true; try { rest(); } catch (e) { console.warn("texRest", e); } }
    if (back.length) { for (let i = 0; i < 6 && back.length; i++) { const t = back.pop(); t.userData.rested = false; try { st.renderer.initTexture(t); } catch { /* drawn when it's needed */ } } }
  }, count: () => rested.length };
})();
st.on(() => { try { texRest.tick(); } catch { /* still loading */ } });
/// the quest's target, by the portals when it's in another land: the portal to its land, or the way back to town
function routeTo(g) {
  if (!g) return g; const p = g.position, L = g.parent === planet ? LD.landAt(p.x, p.z) : null, id = L ? L.id : "";
  if (id === landNow) return g;
  if (landNow === "rq") return rqL ? rqL.back : g;
  if (landNow === "cc") return ccL ? ccL.back : g;
  if (landNow) return landNow === "ad" ? (adc ? adc.back : g) : lands.back[landNow === "lp" ? 0 : 1] || g;
  if (id === "ad") return agentGate;
  return lands.portals.find((q) => q.userData.to === id) || g;
}
// how many are in each land now (other players' figures), under the portals' names
// AD-City 4: other players' agents beside them in Nexus City (their presence's ag "kind:name")
every(1000, () => { try { if (!adc || !adc.shown() || !ghosts) return; const L = []; ghosts.each((g, w) => { if (!w.ag || w.gone) return; const [kind, name] = String(w.ag).split(":"); L.push({ key: w.wallet || String(w.at), kind, name, x: g.position.x, z: g.position.z }); }); if (/[?&]adwork=demo/.test(location.search)) { const v = here(new THREE.Vector3()), t = performance.now() / 1000; L.push({ key: "demo-a", kind: "aurora", name: "NOVA", x: v.x + 6 + Math.sin(t / 3) * 5, z: v.z - 4 }, { key: "demo-o", kind: "orion", name: "ATLAS", x: v.x - 6, z: v.z - 5 + Math.cos(t / 3) * 5 }); } /* (?adwork=demo: two other players' agents walking near you) */ adc.others(L); } catch { /* the next second */ } });
every(5000, () => { try { if (!ghosts || mode !== "hub") return; const n = { lp: 0, ut: 0, ad: 0 }; ghosts.each((g, w) => { if (w.gone) return; const L = LD.landAt(g.position.x, g.position.z); if (L) n[L.id]++; }); lands.count("lp", n.lp); lands.count("ut", n.ut); } catch { /* next time */ } });
function goGameVillage() {
  if (defenseOn || frozen || flying || introOn || mode !== "hub") return; closeAll();
  const c = gv.center, d = Math.hypot(c.x, c.z) || 1, r = 36; standAt(c.x - (c.x / d) * r, c.z - (c.z / d) * r, c);
  vfx.teleport(here(), { color: 0xb48cff, color2: 0x38d8ff }); paintPrompt();
}
// AC Defense (world-defense.js): the arena is the Game Village's square (the town hides, the player stays inside arenaR), run by the module
let defense = null, defenseOn = false, defenseBusy = false, arenaR = 0;
async function openDefense() {
  if (defenseOn || defenseBusy || jumpOn || beatOn || frozen || flying || introOn || mode !== "hub" || !combat || (raid && raid.inside && raid.inside()) || combat.vitals().down) return;
  defenseBusy = true; closeAll();
  try {
    if (!defense) {
      toast(TW("Getting ready"));
      let M; try { M = await import("./world-defense.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      defense = M.createDefense({ THREE, planet, st, T: TW, lang: LANG, esc, toast, Snd, vfx, parts, combat, coarse, low: lowGfx, reduce, keep: [gv.root] /* the Game Village stays (its square is the arena); the town hides */, origin: gv.center, sess, post,
        cinema: (ms) => defenseCinema(gv.center, ms), shake: (n) => { if (!reduce) shake = Math.max(shake, n); },
        place: (x, z) => standAt(x, z, gv.center),
        setArena: (r) => { arenaR = r; }, exit: () => { const e = gv.exitOf("defense"); standAt(e.x, e.z, gv.center); }, refresh: () => refreshPurse(true), onWave: () => { if (quests) quests.bump("defwave"); }, level: () => level(), enter: () => { defenseOn = true; near = null; paintPrompt(); }, leave: () => { defenseOn = false; near = null; paintPrompt(); } });
    }
    defenseOn = true; near = null; paintPrompt(); await defense.start();
    if (!defense.active()) throw new Error("start: the arena didn't open");
  } catch (e) { // never fail silently: say why (short), put everything back, and let the next tap try again
    console.warn("defense", e); if (diag && diag.err) diag.err("acd: " + String((e && e.message) || e), "openDefense"); defenseOn = false; arenaR = 0; near = null; paintPrompt();
    try { if (defense && defense.active()) defense.reset(); } catch { /* already reset */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return; // the page predates a deploy and its chunk is gone: the new page takes over
    toast(TW(why.startsWith("load:") ? "AC Defense couldn't load. Refresh the page and try again." : "AC Defense couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { defenseBusy = false; }
}
// Coin Jump (world-jumprace.js): the Game Village's second game — platforms over the square, loaded on first use
let jumpRace = null, jumpOn = false, jumpBusy = false;
async function openJump() {
  if (jumpOn || jumpBusy || defenseOn || beatOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  jumpBusy = true; closeAll();
  try {
    if (!jumpRace) {
      let M; try { M = await import("./world-jumprace.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      jumpRace = M.createJumpRace({ THREE, planet, T: TW, lang: LANG, esc, toast, Snd, vfx, reduce, low: lowGfx, coarse, origin: gv.center, keep: [gv.root],
        pos: () => ({ x: -planet.position.x, y: hop, z: -planet.position.z }), place: (x, z) => standAt(x, z, gv.center), lift: (y) => { hop = y; at.y = y; vy = 0; grounded = true; },
        warm: () => st.warm(2500), onCrown: () => { if (quests) quests.bump("jumpcrown"); if (!P.visited.includes("gvcrown")) { P.visited.push("gvcrown"); save(); checkQuests(); } /* kept in visited: the server keeps that list */ }, sess, post, refresh: () => refreshPurse(true), boost: (v) => { vy = v; grounded = false; jumpHeld = false; }, setArena: (r) => { arenaR = r; }, leave: () => { jumpOn = false; near = null; paintPrompt(); const e = gv.exitOf("jump"); standAt(e.x, e.z, gv.center); } });
      st.on((dt, t) => { if (jumpRace) jumpRace.tick(dt, t); });
    }
    { const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); } } // b446: a short fade in, and the camera comes down over the course
    jumpOn = true; near = null; paintPrompt(); jumpRace.start(); if (!reduce) defenseCinema(gv.center, 1700);
  } catch (e) {
    console.warn("jump", e); if (diag && diag.err) diag.err("jump: " + String((e && e.message) || e), "openJump"); jumpOn = false; arenaR = 0; near = null; paintPrompt();
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW("Coin Jump couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { jumpBusy = false; }
}
// the ARCL Mine (world-mine.js): a side-on cave behind the Mining Village's tunnel, loaded the first time you walk in.
// Its scene is drawn instead of the town (st.view) while you're inside; the town waits, frozen, and you come back out
// in front of the tunnel. What pays is the server's (api/_world-mine.mjs); a guest mines a demo.
const restLeft = (t) => { const m = Math.max(1, Math.ceil((t - Date.now()) / 60e3)); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; };
// the mine's module, made once (openMine, and the preload when you come near the village)
let mineMaking = null;
function ensureMine() { if (mineGame) return Promise.resolve(mineGame); if (mineMaking) return mineMaking; mineMaking = (async () => {
  let M; try { M = await import("./world-mine.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
  mineGame = M.createMine({ THREE, K, st, ver: VER, T: TW, esc, toast, Snd, reduce, low: lowGfx, coarse, sess, post, shop: arclShop, level, gain: (n, why) => gain(n, why),
        makeHero: () => K.makeCharacter(heroOf(P.char || "arc-arc"), VER).then((c) => { if (c && c.setTint) c.setTint(P.tint || 0); return c; }),
        refresh: () => refreshPurse(true), addSupply: (k, n) => !!(rpg && rpg.addSupply && rpg.addSupply(k, n)), onShopClose: () => { frozen = false; keys.clear(); near = null; paintPrompt(); }, goMine: () => setTimeout(() => openMine(), 60),
        onLeave: () => { const veil = $("wp-veil"); mineOn = false; frozen = false; keys.clear(); const e = mv.exit(); standAt(e.x, e.z, { x: e.x + Math.sin(e.face) * 5, z: e.z + Math.cos(e.face) * 5 }); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); mineStatus(); } });
  return mineGame; })().finally(() => { mineMaking = null; }); return mineMaking; }
// ---------------- Jurassic World (world-jurassic.js), loaded the first time a GM walks through the portal ----------------
// the gate is shut to everyone else: a short note, nothing loaded. (The land has no rewards yet; when it does, the server
// checks the GM wallet too.)
const jurAllowed = () => true; // open to everyone (guests walk and look; gathering, crafting and a camp need a signed-in wallet)
setInterval(() => { if ((jurOn || survOn || ringsOn || pokerOn) && !frozen) { frozen = true; keys.clear(); } }, 250); // in Jurassic World the town stays frozen (a window closing there unfroze it)
// b-jy3: the boss hour's call in town — five minutes before 12:00 and 20:00 (Seoul) and as it starts, a card with the way
// there (into Jurassic World and on to the boss). The hours mirror api/_world-jur.mjs JUR.BOSS.at.
const JUR_BOSS_AT = [[12, "alpha"], [20, "titan"]], jurCalled = new Set();
every(20e3, () => {
  if (jurOn || mode !== "hub" || introOn || !jurAllowed()) return;
  const t = Date.now(), k = t + 9 * 3600e3, d0 = Math.floor(k / 864e5) * 864e5;
  for (const off of [0, 1]) for (const [h, kind] of JUR_BOSS_AT) { const st0 = d0 + off * 864e5 + h * 3600e3 - 9 * 3600e3, id = st0 + kind, left = st0 - t, on = t >= st0 && t < st0 + 25 * 60e3;
    if (jurCalled.has(id) || !(on || (left > 0 && left <= 5 * 60e3))) continue; jurCalled.add(id);
    const name = TW(kind === "titan" ? "Thornback Titan" : "Alpha Raptor"), c = document.createElement("div"); c.className = "wp-bosscall"; c.setAttribute("role", "status");
    c.innerHTML = `<b>🦖 ${esc(on ? TW("{b} is enraged — boss hour!", { b: name }) : TW("{b} wakes in 5 minutes", { b: name }))}</b><span>${esc(TW("Jurassic World"))}</span><button type="button" class="wp-btn">${esc(TW("Take me there"))}</button><button type="button" class="x" aria-label="${esc(TW("Close"))}">✕</button>`;
    c.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; c.remove(); if (!b.classList.contains("x")) openJurassic().then(() => { if (jurOn && jurGame && jurGame.goBoss) setTimeout(() => jurGame.goBoss(kind), 2500); }); });
    document.body.appendChild(c); if (Snd.horn) Snd.horn(); setTimeout(() => c.remove(), 30000); return; }
});
async function openJurassic() {
  if (jurOn || jurBusy || mineOn || defenseOn || jumpOn || beatOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  if (!jurAllowed()) { toast(TW("Jurassic World is coming soon. The portal opens to everyone at launch.")); if (avatar && grounded) avatar.play("emote-no", { once: true }); return; }
  jurBusy = true; closeAll(); document.querySelectorAll(".wp-tips").forEach((e) => e.remove()); tipsUp = false; // (town tips still up: Jurassic World's own card comes)
  const veil = $("wp-veil"), card = jurGame ? null : gameCard("jur");
  try {
    if (!jurGame) {
      if (card) await paintFrame();
      let M; try { M = await import("./world-jurassic.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      jurGame = M.createJurassic({ buzz: (p) => buzz(p), input: () => ({ joy: joy ? { dx: joy.dx, dy: joy.dy } : null, run: runToggle || gpad.run, gx: gpad.x, gy: gpad.y, yaw: camYaw, pitch: camPitch, zoom: camGoal }), setView: (v) => { if (v.yaw != null) camYaw = v.yaw; if (v.pitch != null) camPitch = v.pitch; if (v.zoom != null) camGoal = camDist = v.zoom; }, hurt: (n) => (combat ? combat.hurtMe(n) : null), vitals: () => (combat ? combat.vitals() : null), heal: (k) => (combat && combat.heal ? combat.heal(k) : null), coach: (k, steps) => coach(k, steps), tips: (rows, o) => showTips(rows, o), Snd, sess, post, share: (c) => bragCard(c), level, lang: LANG, char: () => P.char || "arc-arc", music: () => music, stats: () => { try { return rpg && rpg.stats ? rpg.stats() : null; } catch { return null; } }, refresh: () => refreshPurse(true), gain: (n, why) => gain(n, why), THREE, K, st, ver: VER, makeGate: (n) => JG.makeJurassicGate(THREE, K, n, { low: lowGfx }), T: TW, esc, toast, reduce, low: lowGfx, coarse,
        makeHero: () => K.makeCharacter(heroOf(P.char || "arc-arc"), VER).then((c) => { if (c && c.setTint) c.setTint(P.tint || 0); return c; }),
        onLeave: () => { jurOn = false; frozen = false; setTimeout(() => dinoTown.look(), 300); try { music.setList(MUS.PLAYLIST); } catch { /* fine */ } keys.clear(); const g = jurGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - g.x / d * 4, g.z - g.z / d * 4, { x: 0, z: 0 }); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); } });
    }
    if (card) card.step(1);
    if (veil && !reduce && !card) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await jurGame.enter();
    if (card) { card.step(2); await card.close(!ok); }
    if (ok) { jurOn = true; try { music.setList(MUS.JURASSIC); } catch { /* the town's music plays on */ } } else frozen = false;
    if (veil) veil.style.opacity = "0";
  } catch (e) {
    if (card) card.close(true);
    console.warn("jurassic", e); if (diag && diag.err) diag.err("jurassic: " + String((e && e.message) || e), "openJurassic"); jurOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); st.solo(null); document.body.classList.remove("wp-jurassic"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW("Jurassic World couldn't open") + " — " + esc(why.slice(0, 80)));
  } finally { jurBusy = false; }
}
async function openMine() {
  if (mineOn || mineBusy || defenseOn || jumpOn || beatOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  mineBusy = true; closeAll();
  const veil = $("wp-veil");
  try {
    await ensureMine();
    if (veil && !reduce) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await mineGame.enter();
    if (ok) mineOn = true; else { frozen = false; mineStatus(); }
    if (veil) veil.style.opacity = "0";
  } catch (e) {
    console.warn("mine", e); if (diag && diag.err) diag.err("mine: " + String((e && e.message) || e), "openMine"); mineOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); document.body.classList.remove("wp-mining"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW(why.startsWith("load:") ? "The ARCL Mine couldn't load. Refresh the page and try again." : "The ARCL Mine couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { mineBusy = false; }
}
/// a game's loading card the first time it opens this visit (the owner's list, 2026-10-25: like RAID QUEENS'): its key art,
/// three steps ticking (game · world · ready) and a turning tip, over the module, its models and its first frame; later
/// visits keep the short veil. RAID QUEENS' look (.rql) with the game's colour (.rql.g-<kind>)
const GAME_CARD = {
  surv: { name: "SURVIVORS ARENA", sub: "12-minute survival", art: "key-surv", tips: ["Walk to dodge — your weapons fire by themselves.", "Pick cards that build toward an evolution: the book shows which pairs.", "Arena coins buy permanent upgrades between runs."] },
  jur: { name: "JURASSIC WORLD", sub: "Survive the Primeval Plains", art: "key-jurassic", tips: ["Chop, mine and pick to fill your pack, then craft at the workbench.", "Boss hour: 12:00 and 20:00 Seoul time — hit it 10 times for a share.", "Nights are dangerous. Light a campfire and sleep in your hut."] },
  cc: { name: "CREATOR CITY", sub: "ARCIRCLE STUDIO BETA", art: "key-cc", tips: ["The Creator Academy walks you through your first game in 10 minutes.", "Every top game has a portal in front of the Game Arcade — walk in to play.", "Rate the games you play: the makers see what you thought."] },
  studio: { name: "ARCIRCLE STUDIO", sub: "Make your own game", art: "key-studio", tips: ["Pick a template, tune it, test it — publish in a few minutes.", "Build it yourself: place every wall, coin and drone by hand.", "Your agent can draft a game from one sentence.", "Publish a game of the week's template for the creator contest."] },
  poker: { name: "ARCIA POKER LOUNGE", sub: "Hold'em · Blackjack · Sit & Go", art: "key-poker", tips: ["Free chips every day. Chips are play money — never ARCL.", "Sit & Go starts every 2 hours: the top 3 share the prize chips.", "Today's rule changes every Seoul day — check its own board."] },
};
function gameCard(kind) {
  const G = GAME_CARD[kind]; if (!G) return null;
  const el = document.createElement("div"); el.className = "rql g-" + kind; el.setAttribute("role", "status"); el.setAttribute("data-no-i18n", "");
  const t0 = performance.now(), tips = G.tips.map((x) => TW(x));
  const art = `url('/images/gw/${G.art}.webp${VER}')`; // (the key art is wide: whole over a blurred copy of itself on a tall phone)
  el.innerHTML = `<div class="rql-bg" style="background-image:${art}"></div><div class="rql-art" style="background-image:${art}"></div>
    <div class="rql-in"><small>${esc(TW(G.sub))}</small><h2>${esc(G.name)}</h2><ol>${["Game", "World", "Ready"].map((k, i) => `<li data-k="${i}">${esc(TW(k))}</li>`).join("")}</ol>
    <i class="rql-bar"><b></b></i><p class="rql-tip">${esc(tips[0])}</p></div>`;
  document.body.appendChild(el);
  let ti = 0; const tipEl = el.querySelector(".rql-tip"), turn = setInterval(() => { ti = (ti + 1) % tips.length; tipEl.classList.remove("on"); void tipEl.offsetWidth; tipEl.textContent = tips[ti]; tipEl.classList.add("on"); }, 3000);
  const done = new Set(), step = (k) => { for (let i = 0; i <= k; i++) done.add(i); el.querySelectorAll("li").forEach((li) => li.classList.toggle("ok", done.has(Number(li.dataset.k)))); el.querySelector(".rql-bar b").style.width = `${(done.size / 3) * 100}%`; };
  let gone = false; const close = async (fast) => { if (gone) return; gone = true; const wait = fast ? 0 : 1200 - (performance.now() - t0); if (wait > 0) await sleep(wait); clearInterval(turn); el.classList.add("out"); setTimeout(() => el.remove(), 450); };
  return { step, close };
}
const paintFrame = () => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 30))); // (the card painted before the module and its files take the page)
// SURVIVORS ARENA (world-survivors.js): the Game Village's 12-minute survival game, loaded the first time its door is used.
// Like the mine, its scene is drawn instead of the town (st.view) while you're in; the town waits, frozen, and you come
// back out in front of the arena's door. What pays is the server's (api/_world-survivors.mjs).
let survGame = null, survOn = false, survBusy = false;
// the arena's module, made once: the Game Village's door and the Studio's MONSTER SURVIVAL games (SB-3: survGame.custom) share it
async function survModule() {
  if (survGame) return survGame;
  let M; try { M = await import("./world-survivors.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
  survGame = M.createSurvivors({ buzz: (p) => buzz(p), THREE, K, st, ver: VER, T: TW, lang: LANG, esc, toast, Snd, reduce, low: lowGfx, coarse, sess, post, share: (c) => bragCard(c), quality: S.quality || "auto", fam: diag.fam || "", fps: (n) => st.fps(n || S.fpsCap || autoCap || 60), fpsSet: () => !!S.fpsCap, refresh: () => refreshPurse(true), gain: (n, why) => gain(n, why),
        makeHero: (id) => K.makeCharacter(id, VER).then((c) => { if (c && c.setTint) c.setTint(P.tint || 0); return c; }), addSupply: (k, n) => { const ok = !!(rpg && rpg.addSupply && rpg.addSupply(k, n)); try { if (ok && combat && combat.paintPots) combat.paintPots(); } catch { /* shown on the next repaint */ } return ok; },
        onLeave: () => { const veil = $("wp-veil"); survOn = false; frozen = false; svAch = null; keys.clear(); const e = gv.exitOf("surv"); standAt(e.x, e.z, gv.center); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); } });
  return survGame;
}
async function openSurvivors() {
  if (survOn || survBusy || mineOn || defenseOn || jumpOn || beatOn || jurOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  survBusy = true; closeAll(); document.querySelectorAll(".wp-tips,.wp-coach,.wp-coach-ring").forEach((e) => e.remove()); tipsUp = false; // (town tips or a tour bubble still up: they'd sit over the arena)
  const veil = $("wp-veil"), card = survGame ? null : gameCard("surv");
  try {
    if (!survGame) {
      if (card) await paintFrame();
      await survModule();
    }
    if (card) card.step(1);
    if (veil && !reduce && !card) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await survGame.enter();
    if (card) { card.step(2); await card.close(!ok); }
    if (ok) survOn = true; else frozen = false;
    if (veil) veil.style.opacity = "0";
  } catch (e) { // never fail silently: say why (short), put the town back, and let the next tap try again
    if (card) card.close(true);
    console.warn("survivors", e); if (diag && diag.err) diag.err("surv: " + String((e && e.message) || e), "openSurvivors"); survOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); st.solo(null); document.body.classList.remove("wp-surv"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW(why.startsWith("load:") ? "Survivors Arena couldn't load. Refresh the page and try again." : "Survivors Arena couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { survBusy = false; }
}
// INFINITY RINGS (world-rings.js): the Game Village's ring puzzle in the palace, loaded the first time its door is used.
// Its own scene is drawn instead of the town (st.view) while you're in, like SURVIVORS ARENA; you come back out in front
// of the palace. What pays is the server's (api/_world-rings.mjs). Level 100 cleared: the INFINITY MASTER title.
let ringsGame = null, ringsOn = false, ringsBusy = false, ringsMaster = false, ringsLegend = false;
try { const j = JSON.parse(localStorage.getItem("arc.world.rings") || "{}"); ringsMaster = !!j.master; ringsLegend = !!j.legend; } catch { /* earned again on the next clear */ }
async function ensureRings(veil = $("wp-veil")) { // (the puzzle hall's game, made the first time it's needed: its door, or a Studio puzzle)
  if (!ringsGame) {
      let M; try { M = await import("./world-rings.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      ringsGame = M.createRings({ THREE, K, st, ver: VER, hero: () => ({ ch: heroOf(P.char || "custom-aron"), tn: P.tint || 0 }), share: (c) => bragCard(c), T: TW, lang: LANG, esc, toast, Snd, reduce, low: lowGfx, coarse, sess, post, quality: S.quality || "auto", fam: diag.fam || "", name: () => P.name || "", refresh: () => refreshPurse(true), gain: (n, why) => gain(n, why),
        onMaster: () => { ringsMaster = true; badges(); paintAura(); },
        onLegend: () => { ringsLegend = true; badges(); },
        onLeave: () => { ringsOn = false; frozen = false; keys.clear(); const e = gv.exitOf("rings"); standAt(e.x, e.z, gv.center); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); } });
    }  return ringsGame;
}
async function openRings() {
  if (ringsOn || ringsBusy || pokerOn || pokerBusy || survOn || mineOn || defenseOn || jumpOn || beatOn || jurOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  ringsBusy = true; closeAll(); document.querySelectorAll(".wp-tips,.wp-coach,.wp-coach-ring").forEach((e) => e.remove()); tipsUp = false;
  const veil = $("wp-veil");
  try {
    await ensureRings(veil);

    if (veil && !reduce) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await ringsGame.enter();
    if (ok) ringsOn = true; else frozen = false;
    if (veil) veil.style.opacity = "0";
  } catch (e) { // never fail silently: say why (short), put the town back, and let the next tap try again
    console.warn("rings", e); if (diag && diag.err) diag.err("rings: " + String((e && e.message) || e), "openRings"); ringsOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); st.solo(null); document.body.classList.remove("wp-rings"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW(why.startsWith("load:") ? "INFINITY RINGS couldn't load. Refresh the page and try again." : "INFINITY RINGS couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { ringsBusy = false; }
}
// ARCIA POKER LOUNGE (world-poker.js): Texas Hold'em in the Game Village's lounge, loaded the first time its door is
// used. Its own scene is drawn instead of the town while you're in, like INFINITY RINGS; you come back out in front of
// the lounge. Chips are play money; the lounge's ARCL is its daily missions, paid by the server (api/_world-poker.mjs).
let pokerGame = null, pokerOn = false, pokerBusy = false;
async function openPoker() {
  if (pokerOn || pokerBusy || ringsOn || ringsBusy || survOn || mineOn || defenseOn || jumpOn || beatOn || jurOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  pokerBusy = true; closeAll(); document.querySelectorAll(".wp-tips,.wp-coach,.wp-coach-ring").forEach((e) => e.remove()); tipsUp = false;
  const veil = $("wp-veil"), card = pokerGame ? null : gameCard("poker");
  try {
    if (!pokerGame) {
      if (card) await paintFrame();
      let M; try { M = await import("./world-poker.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      pokerGame = M.createPoker({ THREE, K, st, ver: VER, hero: () => ({ ch: heroOf(P.char || "custom-aron"), tn: P.tint || 0 }), T: TW, lang: LANG, esc, toast, Snd, reduce, low: lowGfx, coarse, sess, post, share: (c) => bragCard(c), quality: S.quality || "auto", name: () => P.name || "", refresh: () => refreshPurse(true), gain: (n, why) => gain(n, why),
        onLeave: () => { pokerOn = false; frozen = false; keys.clear(); const e = gv.exitOf("poker"); standAt(e.x, e.z, gv.center); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); } });
    }
    if (card) card.step(1);
    if (veil && !reduce && !card) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await pokerGame.enter();
    if (card) { card.step(2); await card.close(!ok); }
    if (ok) pokerOn = true; else frozen = false;
    if (veil) veil.style.opacity = "0";
  } catch (e) { // never fail silently: say why (short), put the town back, and let the next tap try again
    if (card) card.close(true);
    console.warn("poker", e); if (diag && diag.err) diag.err("poker: " + String((e && e.message) || e), "openPoker"); pokerOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); st.solo(null); document.body.classList.remove("wp-poker"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW(why.startsWith("load:") ? "The poker lounge couldn't load. Refresh the page and try again." : "The poker lounge couldn't open") + " — " + esc(why.slice(0, 80)));
  } finally { pokerBusy = false; }
}
// near the Game Village: the arena's game and its monsters' file fetched ahead, so the first visit doesn't wait on them
let survPre = false;
st.on(() => { if (survPre || mode !== "hub") return; const d = Math.hypot(-planet.position.x - gv.center.x, -planet.position.z - gv.center.z); if (d > 70) return; survPre = true;
  import("./world-survivors.js").catch(() => {}); fetch("models/world/survivors/monsters.glb?v=" + VER).catch(() => {}); import("./world-rings.js").catch(() => {}); import("./world-poker.js").catch(() => {}); });
// when the mine opens again (the tunnel's prompt says so); read when you come near and after a visit
let mineAsked = 0;
function mineStatus() { if (!mineGame) { const s = sess(); if (!s) return; fetch("/api/social?world=mine&wallet=" + s.wallet, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { mineRest = (j && j.coolUntil) || 0; paintPrompt(); }).catch(() => {}); return; }
  mineGame.status().then((j) => { mineRest = (j && j.coolUntil) || 0; paintPrompt(); }).catch(() => {}); }
let minePre = false;
st.on(() => { if (mineOn || mode !== "hub") return; const n = performance.now(); if (n - mineAsked < 30000) return; const v = MV.MINE_VILLAGE, d = Math.hypot(-planet.position.x - v.x, -planet.position.z - v.z);
  // coming near (45 m): the mine's module, models and shaders get ready in the background, so the tunnel opens at once
  if (!minePre && d < v.r + 45 && !frozen) { minePre = true; ensureMine().then((g) => g && g.preload && g.preload()).catch((e) => { minePre = false; console.warn("mine preload", e); }); }
  if (d > v.r + 6) return; mineAsked = n; mineStatus(); });
// b446: Beat Stomp, the rhythm game (world-beatstomp.js), loaded the first time its door is used
let beatGame = null, beatOn = false, beatBusy = false;
async function openBeat() {
  if (beatOn || beatBusy || jumpOn || defenseOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  beatBusy = true; closeAll();
  try {
    if (!beatGame) {
      let M; try { M = await import("./world-beatstomp.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      const face = { x: gv.center.x, z: gv.center.z - 10 };
      beatGame = M.createBeatStomp({ THREE, planet, T: TW, lang: LANG, esc, toast, Snd, vfx, reduce, low: lowGfx, coarse, origin: gv.center, keep: [gv.root],
        soundOn: () => !!S.sound, music, place: (x, z) => standAt(x, z, face), boost: (v) => { vy = v; grounded = false; jumpHeld = false; },
        warm: () => st.warm(2500), onDone: () => { if (quests) quests.bump("beatsong"); },
        setArena: (r) => { arenaR = r; }, leave: () => { beatOn = false; near = null; paintPrompt(); const e = gv.exitOf("beat"); standAt(e.x, e.z, gv.center); } });
      st.on((dt, t) => { if (beatGame) beatGame.tick(dt, t); });
    }
    { const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); } }
    beatOn = true; near = null; paintPrompt(); beatGame.start();
  } catch (e) {
    console.warn("beat", e); if (diag && diag.err) diag.err("beat: " + String((e && e.message) || e), "openBeat"); beatOn = false; arenaR = 0; near = null; paintPrompt();
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW("Beat Stomp couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { beatBusy = false; }
}
// A chunk this page was built with is gone from the server (a deploy landed after the page loaded; /w/ keeps a few
// builds, but not forever): the only cure is the new page. At most once per two minutes, so a real outage shows its
// error instead of a reload loop; the game saves first and comes back to the Game Village, where the tap was.
const RESUME = "arc.world.resume", RELOADED = "arc.world.reloadAt";
function staleReload() {
  let last = 0; try { last = Number(sessionStorage.getItem(RELOADED)) || 0; } catch { /* private window */ }
  if (Date.now() - last < 120e3) {
    // it reloaded a moment ago and still asks for an old chunk: the browser gave back a cached copy of the page. Once
    // more, with a fresh address no cache has seen (the ?fresh= comes off the address again when the page loads)
    let fr = 0; try { fr = Number(sessionStorage.getItem("arc.world.freshAt")) || 0; sessionStorage.setItem("arc.world.freshAt", String(Date.now())); } catch { return false; }
    if (Date.now() - fr < 300e3) return false; // (once in five minutes: after that the toast says to refresh)
    try { writeLocal(); } catch { /* best effort */ }
    toast(TW("New version — updating…")); setTimeout(() => { const u = new URL(location.href); u.searchParams.set("fresh", Date.now().toString(36)); location.replace(u.toString()); }, 900);
    return true;
  }
  try { sessionStorage.setItem(RELOADED, String(Date.now())); sessionStorage.setItem(RESUME, "gv"); } catch { return false; }
  try { writeLocal(); } catch { /* best effort */ }
  toast(TW("New version — updating…")); setTimeout(() => location.reload(), 900);
  return true;
}
// the address after a fresh reload (staleReload): the ?fresh= mark comes off
try { const u = new URL(location.href); if (u.searchParams.has("fresh")) { u.searchParams.delete("fresh"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } } catch { /* the mark stays, harmless */ }
// AC Defense's entry: the camera starts high over the arena and eases down to its place behind the player (the landing's
// slow follow, landUntil); any key or tap skips to the quick follow. Nothing with reduced motion
function defenseCinema(c, ms = 2000) {
  if (reduce || introOn) return;
  const x = c.x + planet.position.x, z = c.z + planet.position.z, t = performance.now();
  cam.position.set(x, 24, z + 7); camLookS.set(x, 0, z); lookInit = true; cam.lookAt(camLookS); landUntil = t + ms;
  const skip = () => { if (performance.now() - t > 120) { landUntil = 0; off(); } }, off = () => { removeEventListener("keydown", skip, true); removeEventListener("pointerdown", skip, true); };
  addEventListener("keydown", skip, true); addEventListener("pointerdown", skip, true); setTimeout(off, ms + 50);
}
function enter(n) {
  if (n.kind === "isle") { goIsland({}); return; }
  if (n.kind === "screen") { if (plazaNow && plazaNow.isle) goIsland({ visit: plazaNow.isle.wallet }); else if (plazaNow && plazaNow.coin) openSheet("$" + plazaNow.coin.symbol, T("On the plaza billboard"), "/arc#coin/" + plazaNow.coin.token); return; }
  if (n.kind === "isle-exit") { leaveIsland(); return; }
  if (n.kind === "village") { if (n.mine) openVillage(); else village.show("contest"); return; }
  if (n.kind === "resident") { island.talk(n.res); return; }
  if (n.kind === "portal") { portalGo(n.g); return; }
  if (n.kind === "lport") { landGo(n.to); return; }
  if (n.kind === "fountain") { tossCoin(); return; }
  if (n.kind === "pad") { openMap(); return; }
  if (n.kind === "defense") { openDefense(); return; }
  if (n.kind === "jump") { openJump(); return; }
  if (n.kind === "mine") { openMine(); return; }
  if (n.kind === "jurassic") { openJurassic(); return; }
  if (n.kind === "agentdim") { agentWarp(); return; }
  if (n.kind === "adb") { cityBuilding(n.b); return; }
  if (n.kind === "ccb") { ccBuilding(n.b); return; }
  if (n.kind === "rqgate") { rqWarp(); return; }
  if (n.kind === "kairo") { openPartner("kairo"); return; }
  if (n.kind === "land") { land.refresh().then(() => land.detail(n.n)); return; }
  if (n.kind === "miner") { if (frozen) return; frozen = true; keys.clear(); ensureMine().then((g) => g.openShop("picks")).catch((e) => { frozen = false; toast(TW("The ARCL Mine couldn't load. Refresh the page and try again.") + " — " + esc(String((e && e.message) || e).slice(0, 60))); }); return; }
  if (n.kind === "beat") { openBeat(); return; }
  if (n.kind === "surv") { openSurvivors(); return; }
  if (n.kind === "rings") { openRings(); return; }
  if (n.kind === "poker") { openPoker(); return; }
  if (n.kind === "bounty") { if (quests && rpg) { quests.setTab("daily"); rpg.show("log"); } return; }
  if (n.kind === "race") { race.start(); return; }
  if (n.kind === "npc") { if (arciaAsk()) return; doorThen(n.g, () => openSheet("ARCIA", T("Arc's AI idol. Ask her anything about a coin, a wallet or this world."), "/arc#arcia")); return; }
  if (n.kind === "coin") {
    const c = n.coin;
    doorThen(n.g, () => { openSheet("$" + c.symbol, `${c.name || c.symbol} · ${T("market cap {v}", { v: usd(Number(c.marketCapUsd) || 0) })}${n.g.userData.mine ? " · " + T("your coin") : ""}`, "/arc#coin/" + c.token); $("wp-sheet-lot").hidden = !n.g.userData.mine; lotCoin = { token: lc(c.token), symbol: c.symbol }; });
    openShop = n.g;
    if (!P.visited.includes("coin")) { P.visited.push("coin"); save(); }
    checkQuests(); return;
  }
  const s = n.spec;
  if (s.id === "forge") { doorThen(n.g, () => { camZoom = 1; frozen = false; rpg.show("forge"); }); return; }
  if (s.id === "arcl-shop" || s.id === "arcl-ex") {
    doorThen(n.g, () => { camZoom = 1; frozen = false; if (s.id === "arcl-shop") arclShop.openShop(); else arclShop.openExchange(); });
    if (!P.visited.includes(s.id)) { P.visited.push(s.id); gain(10, T("found the {name}", { name: s.name })); }
    daily("shop", s.id); checkQuests(); return;
  }
  doorThen(n.g, () => openSheet(s.name, s.line, s.url));
  if (n.g.userData.chestOpen) { n.g.userData.chestOpen(); const ch = n.g.userData.chest; if (ch) vfx.chest(ch.getWorldPosition(new THREE.Vector3()).sub(planet.position)); }
  openShop = n.g;
  if (!P.visited.includes(s.id)) { P.visited.push(s.id); gain(10, T("found the {name}", { name: s.name })); }
  daily("shop", s.id); tutorialStep(2);
  checkQuests();
}
function closeSheet() {
  if (sheet.hidden) return;
  if (openShop && openShop.userData.chestClose) openShop.userData.chestClose();
  openShop = null; camZoom = 1;
  sheet.classList.remove("on"); setTimeout(() => { sheet.hidden = true; }, reduce ? 0 : 260);
  frozen = false; refreshPurse(true); refreshCoins();
}
$("wp-sheet-x").addEventListener("click", closeSheet);
addEventListener("message", (e) => { if (e.origin === location.origin && e.data && e.data.arcWorld === "close") closeSheet(); });

// ---------------- Coin City, the live feed and rockets: real ArcPad data (/api/c?view=launches) ----------------
const feedEl = $("wp-feed");
// before the landing, news waits (so the first items aren't gone by the time the dive ends)
let landed = false; const feedQ = [];
function feed(html, color = "#39ff88") {
  if (!landed) { feedQ.push([html, color]); return; }
  const li = document.createElement("li"); li.setAttribute("data-no-i18n", ""); li.innerHTML = `<i style="--c:${color}"></i><span>${html}</span>`;
  feedEl.prepend(li); requestAnimationFrame(() => li.classList.add("on"));
  while (feedEl.children.length > 4) feedEl.lastChild.remove();
  setTimeout(() => { li.classList.remove("on"); setTimeout(() => li.remove(), 400); }, coarse ? 7000 : 16000);
}
// b-lpv: every ArcPad coin's lot in the Launchpad Village (world-lands.js layoutLots), its size by its market cap's tier
// (or the biggest it reached: the server's, lotTiers); the coin's building stands on it, bigger with the tier
const lotTiers = {}; let coinSig = "";
const lotTierOf = (c) => Math.max(LD.tierOfCap(c.marketCapUsd), lotTiers[lc(c.token)] || 0);
// whose coins are yours: the connected wallet, or the signed-in one when the wallet isn't connected on this page
const myW = () => lc(addr() || (sess() && sess().wallet) || "");
function buildCoinCity(list) {
  if (!kit) return;
  coinBuildings.splice(0).forEach((g) => planet.remove(g));
  const me = myW();
  const { lots, r, rings } = LD.layoutLots(list, lotTierOf); lands.sizeTo(r, rings);
  coinSig = list.map((c) => c.token + ":" + lotTierOf(c)).join(",");
  lots.forEach((L) => {
    const c = L.coin, mine = !!me && lc(c.creator) === me, g = lands.makeLot(L);
    const b = K.makeCoinBuilding(kit, c, mine), k = [1.25, 1.6, 2.1, 2.7][L.tier]; b.scale.setScalar(k); g.add(b);
    g.userData = { ...g.userData, coin: c, mine, radius: Math.max(2.5 * k, L.size * 0.42), building: b, tag: b.userData.tag, body: b.userData.body, spin: b.userData.spin, tier: L.tier };
    planet.add(g); spins.push(...b.userData.spin); coinBuildings.push(g);
  });
  lands.setNewest(list.slice().sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0))[0] || null);
  try { launchFireworks(list.slice().sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0))[0]); } catch { /* fine */ }
  if (labels) labels.dirty = true; farCull.rescan();
  dressLots();
}
// a coin's creator can build its lot brick by brick (world-island.js, lot mode); those builds replace the stock building
async function dressLots() {
  if (!coinBuildings.length) return;
  try {
    const ids = coinBuildings.map((g) => lc(g.userData.coin.token)), j = { lots: {}, tiers: {} };
    for (let i = 0; i < ids.length; i += 50) { const r = await fetch("/api/social?world=lots&coins=" + ids.slice(i, i + 50).join(",")); if (!r.ok) return; const q = await r.json(); Object.assign(j.lots, q.lots || {}); Object.assign(j.tiers, q.tiers || {}); }
    // a lot that grew bigger before (the server keeps its biggest tier): built again at that size, once
    let grew = false; for (const [c, t] of Object.entries(j.tiers)) if ((t | 0) > (lotTiers[c] || 0)) { lotTiers[c] = t | 0; grew = true; }
    if (grew && coinData) { buildCoinCity(coinData); return; }
    coinBuildings.forEach((g) => {
      const d = j.lots && j.lots[lc(g.userData.coin.token)]; if (!d || !d.data) return;
      const sg = island.makeStatic(d.data); if (!sg) return;
      if (g.userData.lotG) g.remove(g.userData.lotG);
      const b = g.userData.building, kb = b ? b.scale.x : 1, k = (g.userData.size || 4.6) / (sg.userData.N || 9); sg.scale.setScalar(k); sg.position.y = 0.2; g.add(sg); g.userData.lotG = sg; // (the build fills its lot: half a metre a brick at the tier's own size)
      if (g.userData.body) g.userData.body.visible = false;
      g.userData.tag.position.y = (sg.userData.h * k + 1.9) / kb;
      if (sg.userData.N === 13 && !g.userData.spot) { const bc = K.makeBeacon(0xffc861, 16); g.add(bc); g.userData.spin.push(bc.userData.spin); spins.push(bc.userData.spin); g.userData.spot = bc; } // (the premium lot keeps its spotlight in the village)
    });
    if (labels) labels.dirty = true;
  } catch { /* the stock buildings stay */ }
}
const ago = (t) => { const s = Math.max(1, Date.now() / 1000 - t); return s < 90 ? T("just now") : s < 3600 ? T("{n} min ago", { n: Math.round(s / 60) }) : s < 86400 ? T("{n} h ago", { n: Math.round(s / 3600) }) : T("{n} d ago", { n: Math.round(s / 86400) }); };
async function refreshCoins(first) {
  let j = null;
  try { const r = await fetch("/api/c?view=launches", { cache: "no-store" }); if (r.ok) j = await r.json(); } catch { /* offline: keep what we have */ }
  const list = (j && Array.isArray(j.launches) ? j.launches : []).filter((c) => c && c.token && c.symbol);
  if (!list.length) return;
  const newest = Math.max(...list.map((c) => c.launchedAt || 0));
  const me = myW();
  myCoins = me ? list.filter((c) => lc(c.creator) === me) : [];
  if (first || !coinData) {
    list.slice().sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 3).reverse().forEach((c) => feed(T("{x} launched on ArcPad {when}", { x: `<b>$${esc(c.symbol)}</b>`, when: ago(c.launchedAt) }), "#4f9dff"));
  } else {
    if (newest > lastSeen) { list.filter((c) => c.launchedAt > lastSeen).slice(0, 3).forEach((c) => { feed(T("New on ArcPad: {x} just launched", { x: `<b>$${esc(c.symbol)}</b>` })); launchRocket(); }); const lp = shopG("launch"); if (lp && typeof live !== "undefined") { live.fireworks(lp.position.x, lp.position.z, 7); live.refresh(); } }
    // a building pulses when its coin's market cap climbs
    const old = new Map(coinData.map((c) => [c.token, Number(c.marketCapUsd) || 0]));
    coinBuildings.forEach((g) => { const c = list.find((x) => x.token === g.userData.coin.token); if (!c) return; const was = old.get(c.token) || 0, now = Number(c.marketCapUsd) || 0; if (was > 0 && now > was * 1.03) { (g.userData.building || g).userData.pulse = 1; feed(T("{x} market cap up {p}%", { x: `<b>$${esc(c.symbol)}</b>`, p: Math.round((now / was - 1) * 100) }), "#39ff88"); } });
  }
  lastSeen = newest;
  const changed = !coinData || coinData.length !== list.length || myCoins.length !== (coinData.mine || 0) || list.map((c) => c.token + ":" + lotTierOf(c)).join(",") !== coinSig; // (b-lpv: a coin moving up a tier gets its bigger lot)
  coinData = list; coinData.mine = myCoins.length;
  if (changed) buildCoinCity(list);
  checkQuests(); if (myCoins.length) arclChecks();
}
const rockets = [];
function launchRocket() {
  const lp = shopG("launch"); if (!lp) return;
  rockets.push(K.rocketLaunch(planet, lp.position.clone()));
  lp.getWorldPosition(tmp); if (tmp.distanceTo(at) < 45) { Snd.rocket(); shake = 0.6; }
}
every(45000, () => refreshCoins(false));

// ---------------- $ARCIRCLE: the Exchange board, the Burn Furnace, the whale, the weather (/api/social?token=arcircle) ----------------
let lastBurnTs = 0, lastBig = "", whale = null, mood = "";
function paintBoard() {
  if (!board3) return;
  const s = arcStats;
  board3.userData.draw((g, w, h) => {
    g.fillStyle = "#06101a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8fe9df"; g.font = "700 30px Sora, sans-serif"; g.fillText("$ARCIRCLE", 22, 46);
    const up = s && s.change24h != null && s.change24h >= 0;
    g.fillStyle = "#ffffff"; g.font = "700 64px Sora, sans-serif"; g.fillText(s && s.price ? "$" + (s.price < 0.01 ? s.price.toPrecision(3) : s.price.toFixed(4)) : "—", 22, 128);
    g.fillStyle = s && s.change24h != null ? (up ? "#39ff88" : "#ff6b81") : "#9fb2c4"; g.font = "700 34px Sora, sans-serif";
    g.fillText(s && s.change24h != null ? (up ? "▲ " : "▼ ") + Math.abs(s.change24h).toFixed(2) + "% 24h" : "", 22, 182);
    g.fillStyle = "#9fb2c4"; g.font = "600 24px Sora, sans-serif"; g.fillText(s && s.vol24h != null ? "Vol " + usd(s.vol24h) + (s.burned ? "  ·  Burned " + Math.round(s.burned.tokens).toLocaleString("en-US") : "") : "", 22, h - 18);
  });
}
async function refreshArc() {
  let s = null;
  try { const r = await fetch("/api/social?token=arcircle"); if (r.ok) s = await r.json(); } catch { /* keep the last */ }
  if (!s || s.error) return;
  const first = !arcStats; arcStats = s; paintBoard();
  const list = (s.burned && s.burned.list) || [];
  const newest = list.length ? Math.max(...list.map((b) => b.ts || 0)) : 0;
  if (!first && newest > lastBurnTs) { const b = list.find((x) => x.ts === newest); burnFire(b ? b.tokens : 0); }
  lastBurnTs = Math.max(lastBurnTs, newest);
  const big = (s.recent || []).find((t) => t.usdc >= 250);
  const sig = big ? big.side + big.usdc + big.tokens : "";
  if (!first && big && sig !== lastBig) { swimWhale(); feed(T("A whale {side} {v} of $ARCIRCLE", { side: big.side === "buy" ? W("bought") : W("sold"), v: usd(big.usdc) }), "#4f9dff"); }
  lastBig = sig || lastBig;
  const m = s.change24h == null ? "" : s.change24h >= 5 ? "aurora" : s.change24h <= -5 ? "rain" : "clear";
  if (m !== mood) { if (mood === "rain" && m !== "rain") rainbowT = 240; mood = m; aurora.visible = m === "aurora"; rain.visible = m === "rain" && landNow !== "rq"; setWet(m === "rain"); if (!first && m) feed(m === "aurora" ? T("$ARCIRCLE is up today: an aurora over the planet") : m === "rain" ? T("$ARCIRCLE is down today: rain over the planet") : T("Clear skies over the planet"), "#35d8d0"); }
}
// the weather's moments: lightning now and then while it rains (a flash, then the thunder a second or two later), and
// a rainbow across the sky for a few minutes once the rain stops (?rainbow=1 to see it)
let rainbow = null, rainbowT = 0, flashT = 0, boltIn = 8;
function makeRainbow() {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: { uA: { value: 0 } },
    vertexShader: "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uA; varying vec2 vU;
      vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main(){ float t = vU.y; vec3 c = hue(0.78 * (1.0 - t)); float edge = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.82, t); float foot = smoothstep(0.0, 0.25, vU.x) * smoothstep(1.0, 0.75, vU.x);
        gl_FragColor = vec4(c, uA * 0.42 * edge * (0.35 + 0.65 * foot)); }` });
  const g = new THREE.Mesh(new THREE.RingGeometry(260, 292, 96, 1, 0, Math.PI), m);
  // the ring's uv runs across it; remap so x runs along the arc and y across the band
  const uv = g.geometry.attributes.uv, pos = g.geometry.attributes.position; for (let i = 0; i < uv.count; i++) { const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y); uv.setXY(i, Math.atan2(y, x) / Math.PI, (r - 260) / 32); }
  g.renderOrder = -1; g.frustumCulled = false; st.scene.add(g); return g;
}
st.on((dt) => {
  if (mode !== "hub") return;
  // lightning
  if (mood === "rain" && !reduce && ambNight >= 0) { if ((boltIn -= dt) <= 0) { boltIn = 9 + Math.random() * 14; flashT = 0.35; setTimeout(() => { try { Snd.thunder(); } catch { /* sound off */ } if (!reduce) shake = Math.max(shake, 0.12); }, 900 + Math.random() * 1400); } }
  if (flashT > 0) { flashT = Math.max(0, flashT - dt); const f = flashT > 0.25 ? 1 : flashT > 0.18 ? 0.2 : flashT > 0.1 ? 0.8 : flashT / 0.1 * 0.3; st.hemi.intensity = 0.95 * (1 - Math.max(0, nightK) * 0.4) + f * 2.4; if (flashT === 0) { nightK = -1; dayNight(); } }
  // the rainbow: it rises opposite the sun and fades
  const q = new URLSearchParams(location.search).get("rainbow");
  if (rainbowT > 0 || q === "1") { if (!rainbow) rainbow = makeRainbow(); rainbowT = Math.max(0, rainbowT - dt); const a = q === "1" ? 1 : Math.min(1, (240 - rainbowT) / 12, rainbowT / 20); rainbow.material.uniforms.uA.value = a * (1 - Math.max(0, nightK)); const sd = sunDir || new THREE.Vector3(0, 1, 0); rainbow.position.set(-sd.x * 540, -70, -sd.z * 540 || -540); rainbow.lookAt(0, -70, 0); rainbow.visible = true; }
  else if (rainbow && rainbow.visible) rainbow.visible = false;
});
function burnFire(tokens) {
  const f = shopG("reward"); if (!f) return;
  f.userData.boost = 1;
  feed(T("{n} $ARCIRCLE just burned", { n: Math.round(tokens || 0).toLocaleString("en-US") }), "#ff7a3c");
  f.getWorldPosition(tmp); if (tmp.distanceTo(at) < 45) { Snd.fire(); shake = Math.max(shake, 0.3); }
}
function swimWhale() {
  if (whale) return;
  whale = K.makeWhale(); whale.scale.setScalar(1.6); st.scene.add(whale); Snd.whale();
  const t0 = performance.now(), side = Math.random() < 0.5 ? -1 : 1;
  const off = st.on((dt, t) => {
    const k = (performance.now() - t0) / 12000;
    whale.position.set(side * (-70 + k * 140), 26 + Math.sin(k * 6) * 2, -30 + Math.sin(k * 3) * 10); whale.rotation.y = side > 0 ? 0 : Math.PI; whale.rotation.z = Math.sin(t * 1.5) * 0.06;
    whale.userData.tail.rotation.y = Math.sin(t * 3) * 0.4;
    if (k >= 1) { off(); st.scene.remove(whale); whale = null; }
  });
}
every(60000, refreshArc);

// ---------------- the Quantum Lab: launches in superposition, read from QuantumPad on Arc ----------------
const rpc = (calls) => Promise.all(calls.map((c) => rpcRead("eth_call", [c, "latest"]).catch(() => null))); // one read each, with the fallbacks
const word = (h, i) => "0x" + ((h || "0x").slice(2 + i * 64, 2 + (i + 1) * 64) || "0");
const decStr = (h) => { try { const off = Number(BigInt(word(h, 0))) * 2, len = Number(BigInt("0x" + h.slice(2 + off, 2 + off + 64))); const bytes = h.slice(2 + off + 64, 2 + off + 64 + len * 2); return new TextDecoder().decode(new Uint8Array(bytes.match(/../g).map((x) => parseInt(x, 16)))); } catch { return ""; } };
async function refreshQuantum() {
  const padA = CFG.QUANTUM_PAD_ADDRESS, lab = shopG("quantum"); if (!/^0x[0-9a-fA-F]{40}$/.test(padA || "") || !lab) return;
  try {
    const [lat] = await rpc([{ to: padA, data: "0x0007f4a0" + (6).toString(16).padStart(64, "0") }]);
    const n = Number(BigInt(word(lat, 1)));
    const batches = []; for (let i = 0; i < Math.min(n, 6); i++) batches.push("0x" + word(lat, 2 + i).slice(-40));
    qOrbs.splice(0).forEach((o) => lab.remove(o));
    if (!batches.length) return;
    const res = await rpc(batches.flatMap((b) => [{ to: b, data: "0x0aae7a6b" + "0".repeat(64) }, { to: b, data: "0x95d89b41" }]));
    const live = [];
    batches.forEach((b, i) => { const info = res[i * 2]; if (!info || info.length < 66 * 4) return; const state = Number(BigInt(word(info, 0))); if (state !== 0) return; live.push({ b, sym: decStr(res[i * 2 + 1]), ends: Number(BigInt(word(info, 2))), total: Number(BigInt(word(info, 3))) / 1e6 }); });
    live.slice(0, 4).forEach((q, i) => {
      const o = new THREE.Group();
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: 0x2a1250, emissive: 0xb48cff, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }));
      o.add(orb); o.userData = { q, tag: null, orb };
      lab.add(o); qOrbs.push(o); o.position.set(Math.cos(i * 1.57) * 2.4, 6.3 + i * 0.2, Math.sin(i * 1.57) * 2.4);
    });
    if (labels) labels.dirty = true;
  } catch { /* the RPC will answer next time */ }
}
function tickQuantum(t) {
  const now = Date.now() / 1000;
  qOrbs.forEach((o, i) => {
    const q = o.userData.q, left = Math.max(0, q.ends - now), txt = `$${q.sym} · ${left > 0 ? Math.floor(left / 60) + ":" + String(Math.floor(left % 60)).padStart(2, "0") : W("ready")} · ${usd(q.total)}`;
    if (o.userData.txt !== txt) { if (o.userData.tag) { o.remove(o.userData.tag); o.userData.tag.material.map.dispose(); } o.userData.tag = K.label(txt, { accent: "#b48cff", size: 0.5 }); o.userData.tag.position.y = 0.9; o.add(o.userData.tag); o.userData.txt = txt; if (labels) labels.dirty = true; }
    o.userData.orb.material.emissiveIntensity = 1.1 + Math.sin(t * 3 + i) * 0.4;
    o.position.x = Math.cos(t * 0.4 + i * 1.57) * 2.4; o.position.z = Math.sin(t * 0.4 + i * 1.57) * 2.4;
  });
}
every(30000, refreshQuantum);

// ---------------- quests, daily goals and badges ----------------
const isleN = (k) => (P.isle && P.isle[k]) || 0;
function tutDone() { try { return P.tut >= TUT.length; } catch { return false; } } // TUT is declared further down
const QUESTS = [
  { id: "launchpad", t: "Step through a portal to the Utility Village", xp: 15, done: () => P.visited.includes("launch"), target: () => shopG("launch") },
  { id: "wallet", t: "Connect your wallet", xp: 20, done: () => !!addr(), target: () => null },
  { id: "cards3", t: "Pick up 3 key cards", xp: 20, done: () => P.cards.length >= 3, target: () => nearestOf(cards) },
  { id: "scanner", t: "Open the Scanner Tower", xp: 15, done: () => P.visited.includes("scanner"), target: () => shopG("scanner") },
  { id: "phisher", t: "Beat The Phisher in the Dark Market", xp: 0, done: () => P.beaten.includes("phisher"), target: () => fighters.find((g) => g.userData.spec.id === "phisher") || null },
  { id: "coincity", t: "Visit a coin in the Launchpad Village", xp: 15, done: () => P.visited.includes("coin"), target: () => coinBuildings[0] || null },
  { id: "arcia", t: "Talk to ARCIA", xp: 15, done: () => P.visited.includes("npc"), target: () => npc },
  { id: "gvjump", t: "Reach the Coin Jump crown in the Game Village: 3,000 ARCL a day", xp: 30, done: () => P.visited.includes("gvcrown"), target: () => gv.root }, // b446: new players find the Game Village
  { id: "build20", t: "Place 20 bricks on your island", xp: 20, done: () => ((P.isle && P.isle.bricks) || 0) >= 20, target: () => isleGate },
  // the island tutorial chain: opens once "Getting started" is done, one step after another (the counts per kind come from the island's stats)
  { id: "roof4", t: "Place 4 roof pieces", xp: 20, gate: tutDone, done: () => isleN("roof") >= 4, target: () => isleGate },
  { id: "doorwin", t: "Add a door and 2 windows: a resident moves in", xp: 25, gate: tutDone, done: () => isleN("door") >= 1 && isleN("window") >= 2, target: () => isleGate },
  { id: "light2", t: "Place 2 lights", xp: 20, gate: tutDone, done: () => isleN("light") >= 2, target: () => isleGate },
  { id: "furn3", t: "Place 3 pieces of furniture", xp: 25, gate: tutDone, done: () => isleN("furniture") >= 3, target: () => isleGate },
  { id: "shop1", t: "Buy an island item in the ARCL Shop and place it", xp: 30, gate: tutDone, done: () => !!P.vq && P.vq.buy != null && isleN("bricks") > P.vq.buy, target: () => isleGate },
  { id: "vill2", t: "Grow your village centre to level 2", xp: 40, gate: tutDone, done: () => !!P.vill && P.vill.level >= 2, target: () => isleGate },
  { id: "visit-like", t: "Visit another island and like it", xp: 30, gate: tutDone, done: () => P.visited.includes("isle-visit") && !!P.vq && !!P.vq.like, target: () => isleGate },
  { id: "share-isle", t: "Share your island link: a free pet egg", xp: 50, gate: tutDone, done: () => !!P.vq && !!P.vq.share, target: () => isleGate },
  { id: "resident", t: "Build a door: welcome your first resident", xp: 25, done: () => ((P.isle && P.isle.residents) || 0) >= 1, target: () => isleGate },
  { id: "isle-visit", t: "Visit another player's island", xp: 15, done: () => P.visited.includes("isle-visit"), target: () => isleGate },
  { id: "furnace", t: "Visit the Burn Furnace", xp: 15, done: () => P.visited.includes("reward"), target: () => shopG("reward") },
  { id: "hold", t: "Hold some $ARCIRCLE", xp: 25, done: () => (bal.arc || 0) > 0, target: () => shopG("swap") },
  { id: "stages", t: "Clear all six scammer stages", xp: 150, done: () => K.SCAMMERS.every((s) => P.beaten.includes(s.id)), target: () => fighters.find((g) => g.userData.live) || null },
  { id: "launch", t: "Launch your own coin on ArcPad", xp: 100, done: () => myCoins.length > 0, target: () => shopG("launch") },
];
const BADGES = [
  { id: "first-steps", t: "First steps", title: "Newcomer", done: () => P.quests.includes("launchpad") },
  { id: "collector", t: "All 12 key cards", title: "Collector", done: () => P.cards.length >= K.CARDS.length },
  { id: "hunter", t: "Beat 3 scammers", title: "Scam Hunter", done: () => P.beaten.length >= 3 },
  { id: "slayer", t: "Beat all 6 scammers", title: "Rug Slayer", done: () => K.SCAMMERS.every((s) => P.beaten.includes(s.id)) },
  { id: "explorer", t: "Visit every shop", title: "Explorer", done: () => K.SHOPS.every((s) => P.visited.includes(s.id)) },
  { id: "holder", t: "Hold $ARCIRCLE", title: "Holder", done: () => (bal.arc || 0) > 0 },
  { id: "launcher", t: "Launch a coin", title: "Launcher", done: () => myCoins.length > 0 },
  { id: "streak7", t: "7-day streak", title: "Regular", done: () => ((P.daily && P.daily.streak) || 0) >= 7 },
  { id: "builder", t: "Place 200 bricks", title: "Builder", done: () => ((P.isle && P.isle.bricks) || 0) >= 200 },
  { id: "landlord", t: "Welcome 5 residents", title: "Island host", done: () => ((P.isle && P.isle.residents) || 0) >= 5 },
  { id: "infinity-master", t: "Clear INFINITY RINGS level 100", title: "INFINITY MASTER", done: () => ringsMaster },
  { id: "infinity-legend", t: "Clear INFINITY RINGS level 200", title: "INFINITY LEGEND", done: () => ringsLegend },
];
function badges() {
  let got = false;
  BADGES.forEach((b) => { if (!P.badges.includes(b.id) && b.done()) { P.badges.push(b.id); got = true; feed(T("Badge earned: {b}", { b: `<b>${esc(T(b.t))}</b>` }), "#ffc861"); } });
  if (got) { save(); setNameTag(); try { paintAura(); } catch { /* drawn on the next visit */ } }
}
function nearestOf(list) { let b = null, bd = Infinity; list.forEach((g) => { g.getWorldPosition(tmp); const d = tmp.distanceTo(at); if (d < bd) { bd = d; b = g; } }); return b; }
const beacon = K.makeBeacon(K.C.gold, 22); spins.push(beacon.userData.spin);
let questTarget = null, justDone = null;
function checkQuests() {
  QUESTS.forEach((q) => { if (!P.quests.includes(q.id) && (!q.gate || q.gate()) && q.done()) { P.quests.push(q.id); save(); justDone = { t: T(q.t), at: performance.now() }; Snd.quest(); feed(T("Quest done: {q}", { q: `<b>${esc(T(q.t))}</b>` }), "#ffc861"); if (q.xp) gain(q.xp, T(q.t)); else Snd.win(); } });
  if (P.quests.includes("vill2")) arclClaim("vill2");
  if (P.quests.includes("share-isle")) arclClaim("vquest9");
  badges(); paintQuests();
}
function paintQuests() {
  { const hs = $("wp-quests-h").querySelector("span"), cc = landNow === "cc" && !!ccL && !ccTutDone(); if (hs) hs.textContent = TW(cc ? "Creator tutorial" : "Quests"); if (cc) return paintCcTut(); }
  const shown = QUESTS.filter((q) => !q.gate || q.gate() || P.quests.includes(q.id)); // a gated step stays hidden until its gate opens
  const open = shown.filter((q) => !P.quests.includes(q.id));
  $("wp-quests-n").textContent = `${shown.length - open.length}/${shown.length}`; $("wp-qmini-n").textContent = `${shown.length - open.length}/${shown.length}`;
  const doneRow = justDone && performance.now() - justDone.at < 3000 ? `<li class="done-now"><i></i><span>${esc(justDone.t)}</span></li>` : "";
  $("wp-quests-l").innerHTML = doneRow + (open.slice(0, 3).map((q, i) => `<li${i === 0 ? ` class="cur${questFull === q.id ? " full" : ""}" role="button" tabindex="0" aria-expanded="${questFull === q.id}" data-q="${q.id}"` : ""}><i></i><span>${esc(T(q.t))}</span>${i === 0 ? '<em class="wp-qdist" data-no-i18n></em>' : ""}${q.xp ? `<small>+${q.xp} XP</small>` : ""}</li>`).join("") || `<li class="done"><span>${esc(T("All quests done. More soon."))}</span></li>`);
  if (doneRow) setTimeout(paintQuests, 3100);
  markLongQuest();
  const cur = open[0], tg = routeTo(cur && cur.target());
  if (tg !== questTarget) { if (beacon.parent) beacon.parent.remove(beacon); questTarget = tg; if (tg) tg.add(beacon); }
}
// b-qt: the current quest's title shows two lines; a longer one gets a chevron and a tap shows all of it (kept until the quest changes)
let questFull = "";
function markLongQuest() {
  const li = $("wp-quests-l").querySelector("li.cur"), sp = li && li.querySelector("span");
  if (sp) li.classList.toggle("long", sp.scrollHeight > sp.clientHeight + 1 || li.classList.contains("long"));
  let pop = $("wp-qfull"); const on = !!(li && questFull && li.dataset.q === questFull);
  if (!on) { if (pop) pop.hidden = true; return; }
  if (!pop) { pop = document.createElement("div"); pop.id = "wp-qfull"; pop.className = "wp-qfull"; pop.setAttribute("role", "note"); pop.addEventListener("click", () => { questFull = ""; markLongQuest(); const c = $("wp-quests-l").querySelector("li.cur"); if (c) { c.classList.remove("full"); c.setAttribute("aria-expanded", "false"); } }); $("wp-quests").appendChild(pop); }
  const xp = li.querySelector("small"); pop.innerHTML = `${esc(sp.textContent)}${xp ? `<small>${esc(xp.textContent)}</small>` : ""}`; pop.hidden = false;
}
// the quest card's title folds the card; the book button beside it opens the Adventure log (one tap used to do both)
$("wp-quests-log").addEventListener("click", () => { closeAll(); if (rpg && quests) rpg.show("log"); });
// the current quest row: tap to ping its marker, or (for "Connect your wallet", which has no place) to open sign-in
const questAct = (e) => {
  const li = e.target.closest("li.cur"); if (!li || (e.type === "keydown" && e.key !== "Enter" && e.key !== " ")) return; if (e.type === "keydown") e.preventDefault();
  if (li.dataset.q === "wallet" && !addr()) { if (auth.hidden && !frozen) openAuth(); return; }
  if (li.classList.contains("long") || li.classList.contains("full")) { const on = !li.classList.contains("full"); li.classList.toggle("full", on); li.setAttribute("aria-expanded", String(on)); questFull = on ? li.dataset.q : ""; markLongQuest(); }
  if (questTarget && !qm.hidden) { qm.classList.remove("ping"); void qm.offsetWidth; qm.classList.add("ping"); setTimeout(() => qm.classList.remove("ping"), 900); }
};
$("wp-quests-l").addEventListener("click", questAct); $("wp-quests-l").addEventListener("keydown", questAct);
$("wp-quests-h").addEventListener("click", (e) => { const q = $("wp-quests"); const o = q.classList.toggle("closed"); e.currentTarget.setAttribute("aria-expanded", String(!o)); try { localStorage.setItem("arc.world.qopen", o ? "0" : "1"); } catch { /* private */ } requestAnimationFrame(markLongQuest); });
// on a phone the quest list starts folded to its title once "Getting started" is done (tap to open); the choice is remembered
(() => { let open = null; try { open = localStorage.getItem("arc.world.qopen"); } catch { /* private */ } if (open === "0" || (open === null && coarse && (P.tut | 0) >= 7)) { /* 7 = TUT.length (declared further down): a newcomer keeps the list open */ $("wp-quests").classList.add("closed"); $("wp-quests-h").setAttribute("aria-expanded", "false"); } })();
// b447: the quest card folds away to a round icon (its fold button) and comes back from the icon; remembered. On a
// phone it starts as the icon once "Getting started" is done (a newcomer keeps the card)
const qMini = (on, save = true) => { $("wp-quests").classList.toggle("mini", on); $("wp-qmini").hidden = !on; $("wp-qmini").setAttribute("aria-label", TW("Show quests")); $("wp-quests-fold").setAttribute("aria-label", TW("Hide quests")); if (save) try { localStorage.setItem("arc.world.qmini", on ? "1" : "0"); } catch { /* private */ } };
$("wp-quests-fold").addEventListener("click", (e) => { e.stopPropagation(); qMini(true); });
$("wp-qmini").addEventListener("click", () => { qMini(false); requestAnimationFrame(markLongQuest); });
addEventListener("resize", () => requestAnimationFrame(markLongQuest)); // (a folded card or a turned phone measures the title again)
(() => { let m = null; try { m = localStorage.getItem("arc.world.qmini"); } catch { /* private */ } qMini(m === "1" || (m === null && coarse && (P.tut | 0) >= 7), false); })();
// daily goals (Seoul day): open two shops, jump ten times, walk 300 m — all three keep the streak going
const seoulDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const DAILY = [{ id: "shops", t: "Open 2 shops", n: 2 }, { id: "jumps", t: "Jump 10 times", n: 10 }, { id: "walk", t: "Walk 300 m", n: 300 }];
function dailyState() {
  const today = seoulDay();
  if (!P.daily || P.daily.day !== today) {
    const y = seoulDay(new Date(Date.now() - 86400e3)), was = P.daily;
    // the daily goals' streak takes the same shield as the chest: one missed day a week is forgiven
    const y2 = seoulDay(new Date(Date.now() - 2 * 86400e3)), wk = Math.floor((Date.now() / 86400e3 + 3) / 7), full = was && (was.done || []).length === DAILY.length;
    const shield = full && was.day === y2 && (was.streak || 0) > 0 && was.sw !== wk;
    P.daily = { day: today, done: [], streak: full && (was.day === y || shield) ? was.streak || 0 : 0, c: { shops: [], jumps: 0, walk: 0 }, sw: shield ? wk : (was && was.sw) || 0 };
  }
  P.daily.c = P.daily.c || { shops: [], jumps: 0, walk: 0 };
  P.daily.done = P.daily.done || [];
  return P.daily;
}
let walkAcc = 0;
function dailyDist(m) { walkAcc += m; if (walkAcc > 5) { daily("walk", null, walkAcc); walkAcc = 0; } }
function daily(kind, id, amount = 1) {
  const d = dailyState(), c = d.c;
  if (kind === "shop") { if (!c.shops.includes(id)) c.shops.push(id); } else if (kind === "jumps") c.jumps += 1; else if (kind === "walk") c.walk += amount;
  const val = { shops: c.shops.length, jumps: c.jumps, walk: c.walk };
  DAILY.forEach((g) => { if (!d.done.includes(g.id) && val[g.id] >= g.n) { d.done.push(g.id); feed(T("Daily goal done: {g}", { g: `<b>${esc(T(g.t))}</b>` }), "#35d8d0"); gain(10, T(g.t)); if (d.done.length === DAILY.length) { d.streak = (d.streak || 0) + 1; feed(T("Daily goals complete · {n}-day streak", { n: d.streak }), "#ffc861"); gain(30, T("daily streak")); } } });
  save();
}

// ---------------- map ----------------
const mapEl = $("wp-mapsheet");
function openMap() {
  if (defenseOn) { toast(TW("Quit AC Defense first")); return; }
  const groups = K.DISTRICTS.filter((d) => d.id !== "coins" && d.id !== "dark").map((d) => {
    const list = shops.filter((g) => ({ Launch: "launch", Finance: "finance", Research: "research", ARCIA: "arcia" })[g.userData.spec.district] === d.id);
    return list.length ? `<h3 style="--c:${hex(d.color)}">${esc(d.name)}</h3><ul class="wp-maplist">` + list.map((g) => { const s = g.userData.spec; return `<li><button type="button" data-i="${shops.indexOf(g)}"><i style="--c:${hex(s.color)}"></i><span><b>${esc(s.name)}</b><small>${esc(s.line)}</small></span>${P.visited.includes(s.id) ? `<em>${esc(W("visited"))}</em>` : ""}</button></li>`; }).join("") + "</ul>" : "";
  }).join("");
  const arclList = shops.filter((g) => g.userData.spec.district === "ARCL");
  const arclHtml = `<h3 style="--c:#4fd6ff">ARCL</h3><ul class="wp-maplist">` + arclList.map((g) => { const s = g.userData.spec; return `<li><button type="button" data-i="${shops.indexOf(g)}"><i style="--c:#4fd6ff"></i><span><b>${esc(s.name)}</b><small>${esc(s.line)}</small></span></button></li>`; }).join("") + "</ul>";
  const coinsHtml = coinBuildings.length ? `<h3 style="--c:#39ff88">${esc(TW("Launchpad Village"))}</h3><ul class="wp-maplist">` + coinBuildings.slice(0, 6).map((g, i) => `<li><button type="button" data-c="${i}"><i style="--c:${g.userData.mine ? "#39ff88" : "#4f9dff"}"></i><span><b>$${esc(g.userData.coin.symbol)}</b><small>${esc(g.userData.coin.name || "")}${g.userData.mine ? " · " + esc(W("yours")) : ""}</small></span></button></li>`).join("") + "</ul>" : "";
  const live = fighters.find((g) => g.userData.live);
  const darkHtml = live ? `<h3 style="--c:#ff4d6d">${esc(T("Dark Market"))}</h3><ul class="wp-maplist"><li><button type="button" data-f="1"><i style="--c:#ff4d6d"></i><span><b>${esc(live.userData.spec.name)}</b><small>${esc(T("Stage {n} · scammer", { n: live.userData.spec.stage }))}</small></span></button></li></ul>` : "";
  // the grounds as a ring map: town in the middle, the near five and the far seven where they really are, the ones
  // right for your level ringed, you as a dot; tap one to fly to its gate
  const lvNow = level(), fits = (z) => z.id !== "raid" && lvNow >= z.lv[0] && lvNow <= z.lv[1] + 2;
  const me0 = here(new THREE.Vector3()), S2 = 0.85;
  const ringSvg = `<svg class="wp-ringmap" viewBox="-200 -200 400 400" role="img" aria-label="${esc(T("Hunting grounds"))}"><circle r="178" class="orbit"/><circle r="100" class="orbit"/><circle r="16" class="town"/><text y="4" class="tn">${esc(T("Town"))}</text>`
    + ZN.ZONES.map((z, i) => { const x = z.x * S2, y = z.z * S2, c = "#" + new THREE.Color(z.color).getHexString(); return `<g class="zn${fits(z) ? " fit" : ""}" data-z="${i}" tabindex="0" role="button" aria-label="${esc(z.name)} · ${esc(T("Level {a}–{b}", { a: z.lv[0], b: z.lv[1] }))}" style="--c:${c}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(z.r * S2).toFixed(1)}"/>${fits(z) ? `<circle class="halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(z.r * S2 + 6).toFixed(1)}"/>` : ""}<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}">${z.lv[0]}–${z.lv[1]}</text></g>`; }).join("")
    + `<g class="zn mine" data-mine="1" tabindex="0" role="button" aria-label="${esc(TW("ARCL Mine"))}" style="--c:#ffc23a"><circle cx="${(MV.MINE_VILLAGE.x * S2).toFixed(1)}" cy="${(MV.MINE_VILLAGE.z * S2).toFixed(1)}" r="${(MV.MINE_VILLAGE.r * S2).toFixed(1)}"/><text x="${(MV.MINE_VILLAGE.x * S2).toFixed(1)}" y="${(MV.MINE_VILLAGE.z * S2 + 4).toFixed(1)}">⛏</text></g>`
    + `<g class="zn mine" data-pv="1" tabindex="0" role="button" aria-label="${esc(TW("Partner Village"))}" style="--c:#38e1d6"><circle cx="${(PV.PARTNER_VILLAGE.x * S2).toFixed(1)}" cy="${(PV.PARTNER_VILLAGE.z * S2).toFixed(1)}" r="${(PV.PARTNER_VILLAGE.r * S2).toFixed(1)}"/><text x="${(PV.PARTNER_VILLAGE.x * S2).toFixed(1)}" y="${(PV.PARTNER_VILLAGE.z * S2 + 4).toFixed(1)}">🤝</text></g>`
    + (stuHub ? `<g class="zn mine" data-cc="go" tabindex="0" role="button" aria-label="${esc(TW("Creator City"))}" style="--c:#7cf5c8"><circle cx="${(stuHub.center.x * S2).toFixed(1)}" cy="${(stuHub.center.z * S2).toFixed(1)}" r="9"/><text x="${(stuHub.center.x * S2).toFixed(1)}" y="${(stuHub.center.z * S2 + 4).toFixed(1)}">🎮</text></g>` : "")
    + `<circle class="me" cx="${(me0.x * S2).toFixed(1)}" cy="${(me0.z * S2).toFixed(1)}" r="5"/></svg>`;
  const zoneHtml = `<h3 style="--c:#ff9a4a">${esc(T("Hunting grounds"))}</h3>${ringSvg}<ul class="wp-maplist">` + [...ZN.ZONES, SOC.RAID].map((z, i) => `<li><button type="button" data-z="${i}"><i style="--c:#${new THREE.Color(z.color).getHexString()}"></i><span><b>${esc(z.name)}${fits(z) ? ` <em class="wp-fit">${esc(T("Right for you"))}</em>` : ""}</b><small>${esc(z.id === "raid" ? T("Level {n}+", { n: z.lv[0] }) + (raid && raid.nextText() ? " · " + raid.nextText() : "") : T("Level {a}–{b}", { a: z.lv[0], b: z.lv[1] }))}${level() < z.lv[0] ? " · " + esc(T("Recommended from level {n}", { n: z.lv[0] })) : ""}</small></span></button></li>`).join("") + "</ul>";
  const key = [["#ffc861", "Friends"], ["rgba(159,230,255,.75)", "Other players"], ["#ff4d6d", "Scammers"], ["#2f86ff", "Race pad"], ["#ffc861", "Fast travel"], ["#7ee0a0", "My Island gate"], ["#35d8d0", "Platform World"], ["#ff7ad9", "ARCIA"]];
  const keyHtml = `<details class="wp-mapkey"><summary>${esc(TW("Minimap"))} · ${esc(TW("what the dots mean"))}</summary>${key.map(([c, n]) => `<span><i style="--c:${c}"></i>${esc(T(n))}</span>`).join("")}<span><i class="ring"></i>${esc(T("Where to go next"))}</span><span><i class="sq">L</i>${esc(T("Halls, by their first letter"))}</span></details>`;
  const raceHtml = race ? `<h3 style="--c:#2f86ff">${esc(T("Hoverboard race"))}</h3><ul class="wp-maplist"><li><button type="button" data-race="1"><i style="--c:#2f86ff"></i><span><b>${esc(T("Race pad"))}</b><small>${esc(T("Eight rings around the plaza, against the clock"))}</small></span></button></li></ul>` : "";
  const mineHtml = `<h3 style="--c:#ffc23a">${esc(TW("Mining Village"))}</h3><ul class="wp-maplist"><li><button type="button" data-mine="1"><i style="--c:#ffc23a"></i><span><b>${esc(TW("ARCL Mine"))}</b><small>${esc(TW("Copper, silver and gold rocks · 60 minutes, then a 6-hour rest"))}${mineRest > Date.now() ? " · " + esc(TW("ARCL Mine · opens in {t}", { t: restLeft(mineRest) })) : ""}</small></span></button></li></ul>`;
  const pvHtml = `<h3 style="--c:#38e1d6">🤝 ${esc(TW("Partner Village"))}</h3><ul class="wp-maplist"><li><button type="button" data-pv="1"><i style="--c:#38e1d6"></i><span><b>${esc(TW("Partner Village"))}</b><small>${esc(TW("Official partners of ARCIRCLE WORLD"))} · ${esc(TW("Go to the gate"))}</small></span></button></li><li><button type="button" data-pvk="kairo"><i style="--c:#38e1d6"></i><span><b>KAIRO ${esc(TW("Tower"))}</b><small>${esc(TW("KAIRO Finance Hub"))} · Swap · KLIK · Disperse</small></span></button></li><li><button type="button" data-pvh="kairo"><i style="--c:#7cf5c8"></i><span><b>${esc(TW("KAIRO Finance Hub"))}</b><small>${esc(TW("Open it now"))}</small></span></button></li></ul>`;
  const landsHtml = `<h3 style="--c:#39ff88">🚀 ${esc(TW("Villages"))}</h3><ul class="wp-maplist"><li><button type="button" data-land="lp"><i style="--c:#39ff88"></i><span><b>${esc(TW("Launchpad Village"))}</b><small>${esc(TW("Every coin launched on ArcPad has a lot here"))} · ${coinBuildings.length}</small></span></button></li><li><button type="button" data-land="ut"><i style="--c:#4f9dff"></i><span><b>${esc(TW("Utility Village"))}</b><small>${esc(TW("ARCIRCLE's utilities: launch, swap, stake, scan"))}</small></span></button></li>${landNow ? `<li><button type="button" data-land="town"><i style="--c:#eef3f7"></i><span><b>${esc(TW("Back to town"))}</b></span></button></li>` : ""}</ul>`; // b-lpv
  const adHtml = cityOk && adc ? `<h3 style="--c:#5fd3ff">🌆 ${esc(TW("Nexus City"))}</h3><ul class="wp-maplist"><li><button type="button" data-adc="guide"><i style="--c:#5fd3ff"></i><span><b>${esc(TW("Nexus City"))}</b><small>${esc(TW("AGENT DIMENSION's city: five buildings and agents at work"))}</small></span></button></li>${adc.M.BUILDINGS.map((B) => `<li><button type="button" data-adc="${B.id}"><i style="--c:${B.css}"></i><span><b>${esc(TW(B.name))}</b><small>${esc(TW(B.sub))}${B.open ? "" : " · " + esc(TW("Coming soon"))}</small></span></button></li>`).join("")}</ul>` : cityOk ? `<h3 style="--c:#5fd3ff">🌆 ${esc(TW("Nexus City"))}</h3><ul class="wp-maplist"><li><button type="button" data-adc="guide"><i style="--c:#5fd3ff"></i><span><b>${esc(TW("Nexus City"))}</b><small>${esc(TW("AGENT DIMENSION's city: five buildings and agents at work"))}</small></span></button></li></ul>` : "";
  // RAID QUEENS first, the hunting grounds next (the owner, 2026-10-25)
  const rqHtml = `<h3 style="--c:#ff4d8d">♛ RAID QUEENS</h3><ul class="wp-maplist"><li><button type="button" data-land="rq"><i style="--c:#ff4d8d"></i><span><b>RAID QUEENS</b><small>${esc(TW("Lv 100+ · Waves, then a queen · 3 runs a day"))}${rqOn() ? "" : " · " + esc(TW("Under construction"))}</small></span></button></li></ul>`;
  // SB-1 (the owner, 2026-10-26): Creator City at the very top — its gate, then each building
  const CCF = [["hall", "Hall of Fame", "The top creators and games", "#ffd23a"], ["academy", "Creator Academy", "Your first game in 10 minutes", "#7cf5c8"], ["tower", "Studio Tower", "Make and edit your games", "#5fd3ff"], ["arcade", "Game Arcade", "Play what everyone made", "#ff6fae"], ["contest", "Contest Arena", "This week's creator contest", "#b48cff"], ["factory", "Asset Factory", "Parts you unlock as you create", "#39ff88"], ["market", "Creator Market", "Layouts and kits from creators", "#ff9f2e"], ["launch", "Launch Portal", "Your game's launch — coming soon", "#4f9dff"]];
  const ccHtml = `<h3 style="--c:#7cf5c8">🎮 ${esc(TW("Creator City"))}</h3><ul class="wp-maplist"><li><button type="button" data-cc="go"><i style="--c:#7cf5c8"></i><span><b>${esc(TW("Creator City"))} <em class="wp-fit">BETA</em></b><small>ARCIRCLE STUDIO BETA · ${esc(TW("Make your own game"))}${landNow === "cc" ? "" : " · " + esc(TW("By the fountain"))}</small></span></button></li>${CCF.map(([id, n, sub, c]) => `<li><button type="button" data-cc="${id}"><i style="--c:${c}"></i><span><b>${esc(TW(n))}</b><small>${esc(TW(sub))}</small></span></button></li>`).join("")}</ul>`;
  $("wp-maplist").innerHTML = keyHtml + ccHtml + rqHtml + zoneHtml + adHtml + landsHtml + pvHtml + groups + arclHtml + mineHtml + raceHtml + coinsHtml + darkHtml + `<h3 style="--c:#35d8d0">${esc(T("Ways out"))}</h3><ul class="wp-maplist"><li><button type="button" data-isle="1"><i style="--c:#7ee0a0"></i><span><b>${esc(T("My Island"))}</b><small>${esc(T("Build your own island, brick by brick."))}</small></span></button></li><li><button type="button" data-isles="1"><i style="--c:#7ee0a0"></i><span><b>${esc(TW("Islands"))}</b><small>${esc(T("Visit the islands other players built."))}</small></span></button></li><li><button type="button" data-i="portal"><i style="--c:#35d8d0"></i><span><b>${esc(T("Platform World"))}</b><small>${esc(T("Back to the site as it is."))}</small></span></button></li>${npc ? `<li><button type="button" data-n="1"><i style="--c:#ff7ad9"></i><span><b>ARCIA</b><small>${esc(T("Talk to ARCIA"))}</small></span></button></li>` : ""}</ul>`;
  decorateMap();
  mapEl.hidden = false; frozen = true; keys.clear(); paintPrompt();
  const first = mapEl.querySelector("button[data-i]"); if (first) first.focus({ preventScroll: true });
}
// the owner's look for the map (2026-10-23): the places' own art on their cards (images/ui/map, from the owner's mock-up;
// the games' key art where it has one), the minimap key folded away, and a row of chips that jumps to each section
const MAP_ART = { lp: "map/lp", ut: "map/ut", pv: "map/pv", "kairo-tower": "map/kairo-tower", "kairo-hub": "map/kairo-hub", launch: "map/launch", quantum: "map/quantum", swap: "map/swap", orders: "map/orders", staking: "map/staking", nexus: "map/nexus", research: "map/research", arcia: "map/arcia", rq: "map/rq", ...Object.fromEntries(["spam", "fields", "swamp", "canyon", "depths", "peaks", "dunes", "reef", "wastes", "ruins", "abyss", "void"].map((z) => ["z-" + z, "map/z-" + z])) };
function decorateMap() {
  const box = $("wp-maplist"); if (!box) return;
  box.querySelectorAll("ul.wp-maplist button").forEach((b) => {
    const d = b.dataset, spec = d.i != null && d.i !== "portal" ? (shops[Number(d.i)] || { userData: {} }).userData.spec : null;
    const zn = d.z != null ? [...ZN.ZONES, SOC.RAID][+d.z] : null; // the grounds, Nexus City and the Research district: Meshy's art (2026-10-25)
    const k = d.land || (d.pv ? "pv" : d.pvk ? "kairo-tower" : d.pvh ? "kairo-hub" : zn ? "z-" + zn.id : d.adc === "guide" ? "nexus" : spec ? (spec.district === "Research" ? "research" : spec.id) : "");
    const src = d.cc ? `/images/${d.cc === "go" ? "gw/key-cc-416" : "cc/b-" + d.cc}.webp${VER}` : MAP_ART[k] ? `/images/ui/${MAP_ART[k]}.webp${VER}` : d.mine ? `/images/games/mine-art-300.webp${VER}` : d.race ? `/images/games/jump-art-300.webp${VER}` : "";
    if (src) { b.style.setProperty("--art", `url("${src}")`); b.classList.add("art"); }
  });
  // the section chips: a tap scrolls to it (the list stays one list, so a search or the keyboard still walks all of it)
  const heads = [...box.querySelectorAll(":scope > h3")]; if (heads.length < 3) return;
  const bar = document.createElement("div"); bar.className = "wp-mapchips";
  bar.innerHTML = heads.map((h, i) => `<button type="button" data-sec="${i}" style="${h.getAttribute("style") || ""}">${esc(h.textContent.replace(/^[^\p{L}\p{N}$]+/u, "").trim())}</button>`).join("");
  bar.addEventListener("click", (e) => { const c = e.target.closest("[data-sec]"); if (!c) return; e.stopPropagation(); const h = heads[Number(c.dataset.sec)]; if (h) h.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); });
  const key = box.querySelector(".wp-mapkey"); (key || box.firstChild) ? box.insertBefore(bar, key ? key.nextSibling : box.firstChild) : box.appendChild(bar);
}
function closeMap() { if (mapEl.hidden) return; mapEl.hidden = true; frozen = false; }
$("wp-map-btn").addEventListener("click", openMap);
$("wp-map-x").addEventListener("click", closeMap);
mapEl.addEventListener("keydown", (e) => { const g = e.target.closest && e.target.closest(".wp-ringmap g[data-z],.wp-ringmap g[data-mine],.wp-ringmap g[data-pv],.wp-ringmap g[data-cc]"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); g.dispatchEvent(new MouseEvent("click", { bubbles: true })); } });
mapEl.addEventListener("click", (e) => {
  if (e.target === mapEl) { closeMap(); return; }
  const b = e.target.closest("button[data-i],button[data-c],button[data-f],button[data-n],button[data-isle],button[data-isles],button[data-z],button[data-race],button[data-mine],button[data-pv],button[data-pvk],button[data-pvh],button[data-land],button[data-adc],button[data-cc],.wp-ringmap g[data-z],.wp-ringmap g[data-mine],.wp-ringmap g[data-pv],.wp-ringmap g[data-cc]"); if (!b) return;
  if (b.dataset.cc) { closeMap(); ccTo(b.dataset.cc); return; }
  if (b.dataset.pv) { closeMap(); goPartnerVillage(); return; }
  if (b.dataset.land === "rq") { closeMap(); rqPortalFront(); return; } // (the owner, 2026-10-25: the map's RAID QUEENS takes you to the front of its portal building on the far hunting ring)
  if (b.dataset.land) { closeMap(); landGo(b.dataset.land); return; }
  if (b.dataset.adc) { closeMap(); if (b.dataset.adc === "guide") { if (landNow === "ad") cityGuide(false); else cityGo(); } else cityTo(b.dataset.adc); return; }
  if (b.dataset.pvk) { closeMap(); goPartnerTower(b.dataset.pvk); return; }
  if (b.dataset.pvh) { closeMap(); openPartner(b.dataset.pvh); return; }
  if (b.dataset.mine) { closeMap(); const e2 = mv.exit(); flyTo({ position: new THREE.Vector3(e2.x, 0, e2.z), userData: { radius: 0.5 } }); return; }
  if (b.dataset.race && race) { closeMap(); flyTo(race.pad); return; }
  closeMap();
  if (b.dataset.isle) { goIsland({}); return; }
  if (b.dataset.z != null) { const z = [...ZN.ZONES, SOC.RAID][+b.dataset.z], a = Math.atan2(-z.x, -z.z); flyTo({ position: new THREE.Vector3(z.x + Math.sin(a) * (z.r + 3), 0, z.z + Math.cos(a) * (z.r + 3)), userData: { radius: 0.5 } }); return; }
  if (b.dataset.isles) { island.openIsles(); return; }
  if (b.dataset.c != null) flyTo(coinBuildings[+b.dataset.c]);
  else if (b.dataset.f) { const g = fighters.find((x) => x.userData.live); if (g) flyTo(g); }
  else if (b.dataset.n) { if (npc) flyTo(npc); }
  else flyTo(b.dataset.i === "portal" ? portal : shops[+b.dataset.i]);
});

// ---------------- minimap and the quest marker ----------------
const mini = $("wp-mini"), mg = mini.getContext("2d");
mini.parentNode.addEventListener("click", () => { if (!frozen) openMap(); });
let miniT = 0;
// the minimap's ground: the world rendered once from straight above into a small picture (rows run +z downward)
let miniMap = null; const MINI_E = 480;
// on a phone, small things (pebbles, herbs, lamps' caps, little props) don't draw into the shadow map: dozens of
// draw calls fewer each shadow update, and their shadows were a few pixels anyway
function trimCasters() { const s = new THREE.Vector3(); planet.traverse((o) => { if (!o.isMesh || !o.castShadow || !o.geometry) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.getWorldScale(s); if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.7) o.castShadow = false; }); }
function bakeMiniMap() {
  try {
    const N = st.quality.coarse || lowGfx ? 256 : 512, r = st.renderer, rt = new THREE.WebGLRenderTarget(N, N), /* a phone gets a smaller picture (a shorter pause to read it back) */ cam2 = new THREE.OrthographicCamera(-MINI_E / 2, MINI_E / 2, MINI_E / 2, -MINI_E / 2, 1, 600);
    cam2.position.set(0, 300, 0); cam2.up.set(0, 0, -1); cam2.lookAt(0, 0, 0);
    const pos = planet.position.clone(), off = [];
    planet.traverse((o) => { if (o.visible && (o.isSprite || o.isPoints || o.name === "grass" || o.name === "ambient" || o.name === "particles" || o.name === "smoke" || o.name === "combat" || o.name === "ghosts" || o.name === "clouds" || o.name === "airship")) { o.visible = false; off.push(o); } });
    const skyWas = sky.visible, cloudsWas = clouds.visible; sky.visible = false; clouds.visible = false; const fog = st.scene.fog, fogD = fog && fog.density; if (fog) fog.density = 0; /* b442: density 0, not fog = null: taking the fog away rebuilt every material's shader (seconds of stalls 6 s into the game) */ const bg = st.scene.background; st.scene.background = new THREE.Color(0x0b1a14);
    planet.position.set(0, 0, 0); planet.updateMatrixWorld(true);
    const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.clear(); r.render(st.scene, cam2); r.setRenderTarget(prev);
    planet.position.copy(pos); planet.updateMatrixWorld(true); off.forEach((o) => { o.visible = true; }); sky.visible = skyWas; clouds.visible = cloudsWas; if (fog) fog.density = fogD; st.scene.background = bg;
    const px = new Uint8Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, px); rt.dispose();
    const cv = document.createElement("canvas"); cv.width = cv.height = N; const g = cv.getContext("2d"), img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) img.data.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4); // the picture comes bottom row first
    // the render target holds linear light: brighten it to screen colours, a little richer, so the minimap reads as land
    // (green, paths, roofs) even at night
    const LUT = new Uint8Array(256); for (let i = 0; i < 256; i++) LUT[i] = Math.min(255, Math.round(255 * Math.pow(i / 255, 1 / 2.2) * 1.08));
    const d = img.data; for (let i = 0; i < d.length; i += 4) { const r0 = LUT[d[i]], g0 = LUT[d[i + 1]], b0 = LUT[d[i + 2]], l = (r0 + g0 + b0) / 3; d[i] = Math.max(0, Math.min(255, l + (r0 - l) * 1.25)); d[i + 1] = Math.max(0, Math.min(255, l + (g0 - l) * 1.25)); d[i + 2] = Math.max(0, Math.min(255, l + (b0 - l) * 1.25)); }
    g.putImageData(img, 0, 0); miniMap = cv;
  } catch (e) { console.warn("minimap:", e); }
}
let miniZoom = 1; // the minimap's zoom button: 1 or 2
$("wp-mini-zoom").addEventListener("click", (e) => { miniZoom = miniZoom === 1 ? 2 : 1; e.currentTarget.setAttribute("aria-pressed", String(miniZoom === 2)); });
$("wp-mini-full").addEventListener("click", () => { closeAll(); openMap(); });
function drawMini() {
  const W = mini.width, c = W / 2, range = (mode === "island" ? 26 : 40) / miniZoom, sc = (c - 10) / range;
  mg.clearRect(0, 0, W, W);
  mg.save(); mg.beginPath(); mg.arc(c, c, c - 2, 0, 6.283); mg.clip();
  mg.fillStyle = "#1b4630"; mg.fillRect(0, 0, W, W); // a green ground under everything, like the land
  mg.strokeStyle = "rgba(53,216,208,.14)"; mg.lineWidth = 2; [0.33, 0.66].forEach((k) => { mg.beginPath(); mg.arc(c, c, (c - 2) * k, 0, 6.283); mg.stroke(); });
  const cs = Math.cos(camYaw), sn = Math.sin(camYaw);
  // the ground itself under the marks: a picture of the world from above, turned with the camera (taken once it's built)
  if (mode !== "island" && miniMap) { const E = MINI_E, k = E / miniMap.width, plx = -planet.position.x, plz = -planet.position.z, a = sc * cs * k, b = sc * sn * k;
    mg.save(); mg.globalAlpha = 0.9; mg.setTransform(a, b, -b, a, c + sc * (cs * (-E / 2 - plx) - sn * (-E / 2 - plz)), c + sc * (sn * (-E / 2 - plx) + cs * (-E / 2 - plz))); mg.drawImage(miniMap, 0, 0); mg.restore();
    mg.fillStyle = "rgba(8,20,14,.1)"; mg.fillRect(0, 0, W, W); }
  const put = (g, color, r, glyph) => {
    g.getWorldPosition(tmp);
    const rx = tmp.x * cs - tmp.z * sn, rz = tmp.x * sn + tmp.z * cs;
    let px = c + rx * sc, py = c + rz * sc; const dd = Math.hypot(px - c, py - c), edge = c - 12;
    const out = dd > edge; if (out) { px = c + (px - c) / dd * edge; py = c + (py - c) / dd * edge; }
    if (r) { mg.fillStyle = color; mg.beginPath(); mg.arc(px, py, out ? r * 0.7 : r, 0, 6.283); mg.fill(); }
    if (glyph && !out) { mg.fillStyle = "#04121a"; mg.font = "700 13px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.fillText(glyph, px, py + 0.5); }
    return { px, py };
  };
  if (mode === "island") island.mini(put);
  else {
    // the hunting grounds: a ring each in their colour, and a pulsing mark where a boss is up
    const bossUp = combat && combat.bosses ? combat.bosses() : [];
    for (const zn of landNow ? [] : [...RPG.ZONES, SOC.RAID]) { // (b-lpv: in a land the town's marks stay off the map)
      const wx = zn.x + planet.position.x, wz = zn.z + planet.position.z, rx = wx * cs - wz * sn, rz = wx * sn + wz * cs;
      const px = c + rx * sc, py = c + rz * sc, col = zn._hex || (zn._hex = "#" + new THREE.Color(zn.color).getHexString());
      mg.strokeStyle = col; mg.globalAlpha = 0.55; mg.lineWidth = 2; mg.setLineDash([5, 4]); mg.beginPath(); mg.arc(px, py, zn.r * sc, 0, 6.283); mg.stroke(); mg.setLineDash([]);
      mg.globalAlpha = 0.12; mg.fillStyle = col; mg.fill(); mg.globalAlpha = 1;
      // its levels, written in the middle while it's on the map
      if (zn.lv && Math.hypot(px - c, py - c) < c - 18) { mg.font = "800 10px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.lineWidth = 3; mg.strokeStyle = "rgba(4,10,18,.85)"; const tx = `Lv ${zn.lv[0]}–${zn.lv[1]}`; mg.strokeText(tx, px, py + (bossUp.includes(zn.id) ? 14 : 0)); mg.fillStyle = col; mg.fillText(tx, px, py + (bossUp.includes(zn.id) ? 14 : 0)); }
      if (bossUp.includes(zn.id)) { const pr = 8 + Math.sin(performance.now() / 180) * 2; mg.fillStyle = "#ff4d6d"; mg.beginPath(); mg.arc(px, py, pr, 0, 6.283); mg.fill(); mg.fillStyle = "#fff"; mg.font = "900 12px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.fillText("!", px, py + 0.5); }
    }
    // other players: friends in gold and a little bigger
    if (ghosts) ghosts.each((g, w) => { const L = LD.landAt(g.position.x, g.position.z); if ((L ? L.id : "") !== landNow) return; const fr = !!(w && w.wallet && island.isFriend(w.wallet)); put(g, fr ? "#ffc861" : "rgba(159,230,255,.55)", fr ? 5 : 3); });
    if (landNow === "lp") coinBuildings.forEach((g) => put(g, g.userData.mine ? "#39ff88" : "rgba(238,243,247,.55)", 4));
    if (!landNow) lands.portals.forEach((g) => put(g, "#" + (g.userData.to === "rq" ? "ff4d8d" : g.userData.to === "lp" ? "39ff88" : g.userData.to === "ut" ? "4f9dff" : g.userData.to === "pv" ? "38e1d6" : "ffc861"), 7)); else lands.back.forEach((g) => { if (g.parent && g.parent.visible) put(g, "#eef3f7", 7); });
    if (landNow === "rq" && rqL) { if (rqL.hall.visible) put(rqL.back, "#eef3f7", 7); rqL.marks().forEach((m0) => put(m0.g, m0.down ? "rgba(238,243,247,.4)" : m0.css, m0.s, m0.ch)); } // RAID QUEENS
    if (landNow === "cc" && ccL) { put(ccL.back, "#eef3f7", 7); ccL.marks().forEach((m0) => put(m0.g, m0.css, m0.s, m0.ch)); } // Studio Beta: Creator City
    if (landNow === "ad" && adc) { put(adc.back, "#eef3f7", 7); adc.doors.forEach((d) => { const B = adc.M.BUILDINGS.find((x) => x.id === d.userData.b); put(d, B ? B.css : "#5fd3ff", B && B.open ? 6 : 4.5); }); } // AD-City 1
    if (!landNow) put(stuHub.doors[0], "#7cf5c8", 7, "🎮"); // ARCIRCLE Studio by the plaza
    if (!landNow) { // the town's marks
    // scammers round you: small red dots (an elite a little bigger, gold-edged)
    if (combat) for (const m of combat.mobsRaw()) if (!m.dead && !m.raid && m.rank !== "boss") put(m.g, m.rank === "elite" ? "#ffb35a" : "rgba(255,90,110,.9)", m.rank === "elite" ? 3.4 : 2.4);
    cards.forEach((g) => put(g, "#ffc861", 3.5));
    put(portal, "#35d8d0", 6); put(pad, "#ffc861", 5); put(isleGate, "#7ee0a0", 6); if (npc) put(npc, "#ff7ad9", 5);
    if (race) { put(race.pad, "#2f86ff", 5); const rt = race.target(); if (rt) { const q = put(rt, "", 0); mg.strokeStyle = "#ffc861"; mg.lineWidth = 3; mg.beginPath(); mg.arc(q.px, q.py, 9, 0, 6.283); mg.stroke(); } }
    }
    if (landNow === "ut") shops.forEach((g) => put(g, hex(g.userData.spec.color), 9, g.userData.spec.name[0]));
    if (!landNow) {
    put(mv.door, "#ffc23a", 9, "⛏"); // the ARCL Mine's tunnel
    put(agentGate, "#5fd3ff", 10, "∞"); // AGENT DIMENSION's Citadel
    put(rqGate, "#ff4d8d", 10, "♛"); // RAID QUEENS' Citadel
    put(pvil.root, "#38e1d6", 10, "🤝"); // the Partner Village
    if (pumpKings) for (const k of pumpKings.marks()) if (k.g) put(k.g, k.rage ? "#ff4d1a" : "#ff9a2a", k.rage ? 8 : 6, "🎃"); // the Halloween Pumpkin Kings (Inferno Jack in red)
    fighters.forEach((g) => put(g, g.userData.live ? "#ff4d6d" : "rgba(255,77,109,.45)", g.userData.live ? 6 : 4));
    }
  }
  if (questTarget && mode === "hub") { const p = put(questTarget, "", 0); if (p) { mg.strokeStyle = "#ffc861"; mg.lineWidth = 3; mg.beginPath(); mg.arc(p.px, p.py, 12, 0, 6.283); mg.stroke(); } }
  mg.restore();
  const fa = facing - Math.PI - camYaw;
  mg.save(); mg.translate(c, c); mg.rotate(-fa); mg.beginPath(); mg.moveTo(0, -22); mg.lineTo(15, 16); mg.lineTo(0, 8); mg.lineTo(-15, 16); mg.closePath(); mg.shadowColor = "rgba(0,0,0,.6)"; mg.shadowBlur = 8; mg.fillStyle = "#ffffff"; mg.fill(); mg.shadowBlur = 0; mg.lineWidth = 2.5; mg.strokeStyle = "#0c1534"; mg.stroke(); mg.restore();
  mg.strokeStyle = "rgba(255,255,255,.18)"; mg.lineWidth = 2; mg.beginPath(); mg.arc(c, c, c - 2, 0, 6.283); mg.stroke();
  // north, on the rim: it turns with the camera
  { const r = c - 24, nx = c + r * sn, ny = c - r * cs; mg.font = "900 30px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.lineWidth = 6; mg.strokeStyle = "rgba(6,12,30,.85)"; mg.strokeText("N", nx, ny + 1); mg.fillStyle = "#ffffff"; mg.fillText("N", nx, ny + 1); }
  let dn = "", bd = Infinity;
  if (mode === "island") { dn = island.title(); bd = 0; }
  else if (landNow) { dn = landName(landNow); bd = 0; }
  else K.DISTRICTS.forEach((d) => { if (d.id !== "dark") return; const v = K.spot(d.theta, d.phi).add(planet.position); const dd = v.length(); if (dd < bd) { bd = dd; dn = d.name; } }); // (b-lpv: the other districts are in the Utility Village)
  $("wp-mini-n").textContent = bd < 22 ? dn : "";
}
const qm = $("wp-qmark"), proj = new THREE.Vector3(); let qmZ = 0; addEventListener("resize", () => { qmZ = 0; });
// the way to the goal on the ground at your feet (b405, a player's idea): three gold chevrons pointing toward the
// quest's target, pulsing outward; gone within 8 m of it, in menus and in photo mode
const footGuide = (() => {
  const sh = new THREE.Shape(); sh.moveTo(0, 0.42); sh.lineTo(0.5, -0.16); sh.lineTo(0.28, -0.16); sh.lineTo(0, 0.14); sh.lineTo(-0.28, -0.16); sh.lineTo(-0.5, -0.16); sh.closePath();
  const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2); // flat on the ground, the tip toward -z
  const g = new THREE.Group(); g.name = "foot-guide"; g.visible = false;
  const mats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.7, depthWrite: false, fog: false, toneMapped: false }));
  mats.forEach((m, i) => { const c = new THREE.Mesh(geo, m); c.position.z = -(2.4 + i * 1.25); c.scale.setScalar(1.35 + i * 0.15); c.renderOrder = 3; g.add(c); });
  st.scene.add(g); return { g, mats, p: new THREE.Vector3() };
})();
function paintFootGuide() {
  const g = footGuide.g;
  if (!questTarget || frozen || photo || mode !== "hub" || S.footGuide === false) { g.visible = false; return; }
  questTarget.getWorldPosition(footGuide.p); const dx = footGuide.p.x - at.x, dz = footGuide.p.z - at.z;
  if (Math.hypot(dx, dz) < 8) { g.visible = false; return; }
  g.position.set(at.x, 0.09, at.z); g.rotation.y = Math.atan2(-dx, -dz); g.visible = true;
  const t = performance.now() / 1000; footGuide.mats.forEach((m, i) => { m.opacity = reduce ? 0.7 : 0.4 + 0.5 * Math.max(0, Math.sin(t * 4 - i * 0.9)); });
}
let qmBot = 0, qmBotAt = -1e9;
function qmFloor() { // the top of the bottom controls, read once a second (a layout read every frame costs)
  const now = performance.now(); if (now - qmBotAt < 1000) return qmBot; qmBotAt = now;
  let t = innerHeight; for (const e of [$("wp-dock"), $("wp-joy"), ...document.querySelectorAll("#wp-acts .wp-act")]) { if (!e) continue; const r = e.getBoundingClientRect(); if (r.height > 0 && r.top < t) t = r.top; }
  return (qmBot = Math.max(innerHeight * 0.45, t - 34));
}
function paintMarker() {
  if (!questTarget || frozen || photo || mode !== "hub" || (rqL && rqL.running())) { if (!qm.hidden) qm.hidden = true; return; } /* (not in a RAID QUEENS run: it pointed 2 km off and read the panels' boxes every frame) */
  questTarget.getWorldPosition(proj); const dist = proj.distanceTo(at);
  if (dist < 5) { qm.hidden = true; return; }
  proj.y += 3; proj.project(cam);
  const behind = proj.z > 1, W = innerWidth, H = innerHeight;
  let x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H;
  if (behind) { x = W - x; y = H - y; }
  const m = 46, inside = !behind && x > m && x < W - m && y > m + 60 && y < H - m - 60;
  if (!inside) { const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy, k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m - 60) / Math.abs(dy || 1e-3)); x = cx + dx * k; y = cy + dy * k; }
  // nor under the bottom controls (the dock, the joystick, the action buttons): it stays above them
  if (y > qmFloor()) y = qmFloor();
  // the marker never sits on a panel (the raid card, the minimap, the quests, the boss bar): it steps out beside it
  for (const id of ["wr-raid", "wp-quests", "wc-boss", "wp-mini"]) {
    const e = $(id); if (!e || e.hidden || !e.offsetParent) continue; const r = (id === "wp-mini" ? e.parentElement : e).getBoundingClientRect(), p = 28;
    if (x > r.left - p && x < r.right + p && y > r.top - p && y < r.bottom + p) { const toL = x - (r.left - p), toR = r.right + p - x, toT = y - (r.top - p), toB = r.bottom + p - y, mn = Math.min(r.left > p * 2 ? toL : 1e9, r.right < W - p * 2 ? toR : 1e9, r.top > p * 2 ? toT : 1e9, toB); if (mn === toL) x = r.left - p; else if (mn === toR) x = r.right + p; else if (mn === toT) y = r.top - p; else y = r.bottom + p; }
  }
  qm.hidden = false; qm.classList.toggle("edge", !inside);
  if (!qmZ) qmZ = parseFloat(getComputedStyle(qm).zoom) || 1; const qz = qmZ; qm.style.transform = `translate(${x / qz}px,${y / qz}px)`; // a zoomed marker (phones) moves in its own units
  qm.querySelector("svg").style.transform = inside ? "rotate(180deg)" : `rotate(${Math.atan2(y - H / 2, x - W / 2) * 180 / Math.PI + 90}deg)`;
  $("wp-qmark-d").textContent = Math.round(dist) + " m";
}

// ---------------- scammers: six stages, each a real trick and how to beat it ----------------
const FIGHTS = {
  phisher: { q: "Congratulations! Your wallet won 500 USDC. Approve my contract and I'll send it right over.", opts: [
    { t: "Approve to claim the 500 USDC", win: false, out: "That approval would let him spend every token you hold, now or later. A real airdrop never needs you to approve a stranger's contract." },
    { t: "Check his contract in the Scanner first", win: true, out: "The Scanner flags it: an unverified contract asking for unlimited spending. The Phisher's trick is exposed and he runs off the planet." },
    { t: "Ignore him and walk away", win: false, out: "Safe, but he'll keep fishing for the next player. Expose the trick to beat him." }] },
  airdrop: { q: "Your $ARCIRCLE airdrop is ready! Just send 50 USDC for gas and it's yours.", opts: [
    { t: "Send the 50 USDC", win: false, out: "Gone. A real airdrop arrives in your wallet or is claimed in your own wallet; nobody needs you to send money first." },
    { t: "Check the official ARCIRCLE channels", win: true, out: "No such airdrop on the official X, Telegram or the Airdrops page. The fake falls apart." },
    { t: "Ask him for proof", win: false, out: "He sends a screenshot. Screenshots prove nothing. Check the official channels." }] },
  honeypot: { q: "This coin only goes up! Nobody has sold yet. Buy before it's too late.", opts: [
    { t: "Buy a big bag right now", win: false, out: "You can buy, but the contract blocks selling. That's why nobody has sold." },
    { t: "Dry-run a sell in the Scanner", win: true, out: "The Scanner's dry run shows the sell is refused: a honeypot. You walk away with your USDC." },
    { t: "Buy a small amount to test", win: false, out: "Even a small test is money you can't get back. Dry-run it first, for free." }] },
  doppel: { q: "$ARCIRCLE v2 is here! Same ticker, new contract. Swap your old tokens before they're worthless.", opts: [
    { t: "Swap everything to v2", win: false, out: "Same ticker, different contract: you swapped into a copy. Tickers aren't unique; addresses are." },
    { t: "Compare the contract address with the official one", win: true, out: "The address doesn't match the one on arcircle.app. The Doppelganger is exposed." },
    { t: "Check the price chart", win: false, out: "Fake coins can have charts too. The contract address is what counts." }] },
  golem: { q: "The dev holds 40% of the supply, but don't worry: he promised not to sell.", opts: [
    { t: "Trust the promise", win: false, out: "A promise isn't a lock. One wallet with 40% can sell into the pool at any time." },
    { t: "Check holders and locks in the Scanner and Locker", win: true, out: "40% in one wallet, nothing locked. You know the risk before buying. The Golem crumbles." },
    { t: "Buy because the dev is famous", win: false, out: "Fame doesn't lock tokens. Check the holder list and the Locker." }] },
  dragon: { q: "Liquidity isn't locked, but the team is doxxed. Trust us and ape in.", opts: [
    { t: "Ape in", win: false, out: "Unlocked liquidity can be pulled in one transaction. The pool empties and the price goes to zero." },
    { t: "Check the LP lock in the Locker", win: true, out: "No LP lock. You don't buy, and the Rug Dragon has nothing to pull. Every stage cleared!" },
    { t: "Wait for more holders", win: false, out: "More holders just means more people lose when the liquidity is pulled. Check the LP lock." }] },
};
const fight = $("wp-fight");
let fighting = null, scamCool = 0;
function startFight(g) {
  const s = g.userData.spec, f = FIGHTS[s.id]; if (!f) return;
  fighting = g; frozen = true; keys.clear(); paintPrompt(); Snd.siren();
  if (g.userData.enemy) g.userData.enemy.play("Attack");
  // a short intro: red alert, the camera turns to the scammer and closes in, then the choice
  document.body.classList.add("wp-alert"); setTimeout(() => document.body.classList.remove("wp-alert"), 1500);
  if (!reduce) { fight.hidden = true; doorThen(g, () => { frozen = true; showFight(g); }); return; }
  showFight(g);
}
function showFight(g) {
  const s = g.userData.spec, f = FIGHTS[s.id];
  $("wp-fight-stage").textContent = T("Stage {n} · scammer", { n: s.stage });
  $("wp-fight-h").textContent = s.name;
  $("wp-fight-q").textContent = T(f.q);
  $("wp-fight-opts").innerHTML = f.opts.map((o, i) => `<button type="button" data-i="${i}">${esc(T(o.t))}</button>`).join("");
  $("wp-fight-out").hidden = true;
  fight.hidden = false;
  fight.querySelector("button[data-i]").focus({ preventScroll: true });
}
fight.addEventListener("click", (e) => {
  if (e.target.closest("[data-done]")) { endFight(); return; }
  const b = e.target.closest("button[data-i]"); if (!b || !fighting) return;
  const s = fighting.userData.spec, o = FIGHTS[s.id].opts[+b.dataset.i], out = $("wp-fight-out");
  out.hidden = false; out.className = "wp-fight-out " + (o.win ? "win" : "lose"); out.textContent = T(o.out);
  if (o.win) {
    $("wp-fight-opts").innerHTML = `<button type="button" class="wp-cta" data-done="1">${esc(T("Back to the planet"))}</button>`;
    P.beaten.push(s.id); save();
    { const r = b.getBoundingClientRect(); arclClaim("stage:" + s.id, { answer: +b.dataset.i }, { x: r.left + r.width / 2, y: r.top }); }
    const g = fighting; beam(g); if (g.userData.enemy) g.userData.enemy.play("Hit", { once: true });
    setTimeout(() => poof(g), 600); gain(50, T("beat {name}", { name: s.name })); Snd.win();
    if (avatar) avatar.play("emote-yes", { once: true });
    paintHud(); checkQuests();
  } else { b.disabled = true; Snd.bad(); const e2 = fighting.userData.enemy; if (e2) { if (!e2.play("BackFlip", { once: true })) e2.play("Attack", { once: true }); } }
});
function endFight() { if (fight.hidden) return; fight.hidden = true; frozen = false; scamCool = 4; fighting = null; camZoom = 1; }
function poof(g) {
  const t0 = performance.now();
  const off = st.on(() => { const k = (performance.now() - t0) / 700; g.scale.setScalar(Math.max(0.001, 1 - k)); g.rotation.y += 0.3; if (k >= 1) { off(); planet.remove(g); fighters.splice(fighters.indexOf(g), 1); arrangeFighters(); paintQuests(); } });
}
// the Scanner's beam from the player to the scammer
function beam(g) {
  g.getWorldPosition(tmp); const from = new THREE.Vector3(0, hop + 1.5, 0), to = tmp.clone().add(new THREE.Vector3(0, 1.2, 0));
  const len = from.distanceTo(to), m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, len, 8), new THREE.MeshBasicMaterial({ color: 0x35d8d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(from).add(to).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(Y, to.clone().sub(from).normalize()); st.scene.add(m);
  const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 700; m.material.opacity = 0.9 * (1 - k); m.scale.x = m.scale.z = 1 + k * 2; if (k >= 1) { off(); st.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
}
function moveScammers(t) {
  fighters.forEach((g, i) => { if (!g.userData.live) return; const s = g.userData.spec; K.placeOn(g, K.dirOf(s.theta + Math.sin(t * 0.21 + i) * 4, s.phi + Math.sin(t * 0.13 + i * 2) * 10)); g.userData.ring.material.opacity = 0.35 + Math.sin(t * 4) * 0.2; });
}
function scamCheck(dt) {
  if (scamCool > 0) { scamCool -= dt; return; }
  if (frozen || flying) return;
  for (const g of fighters) { if (!g.userData.live) continue; g.getWorldPosition(tmp); if (tmp.distanceTo(at) < g.userData.radius + 1.3) { startFight(g); return; } }
}

// labels fade out as the camera comes close, and the small ones (coins, orbs) only show nearby.
// Big signs (halls, districts) read as a name up to 55 m; past that a small pin in the sign's colour marks the spot.
// Signs never stack on screen: every few frames the nearest wins its place and any that would overlap it fade out.
let labelT = 0;
const PIN_TEX = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d");
  g.fillStyle = "rgba(6,10,16,.82)"; g.beginPath(); g.arc(32, 32, 25, 0, 7); g.fill(); g.lineWidth = 7; g.strokeStyle = "#fff"; g.stroke(); g.fillStyle = "#fff"; g.beginPath(); g.arc(32, 32, 8, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const NAME_FAR = 42, PIN_FAR = 170, NAME_MAX = 6; // names: the six nearest big signs within 42 m
function pinOf(l) {
  if (l.userData.pin) return l.userData.pin;
  const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: PIN_TEX, color: new THREE.Color(l.userData.accent || "#39ff88"), transparent: true, opacity: 0, depthWrite: false, fog: false }));
  p.renderOrder = 9; p.userData.isPin = true; p.position.copy(l.position); p.visible = false; l.parent.add(p); l.userData.pin = p; return p;
}
const lbV = new THREE.Vector3();
function fadeLabels(dt) {
  if (!labels || labels.dirty) { labels = []; planet.traverse((o) => { if (o.isSprite && o.material.map && !o.userData.isPin) labels.push(o); }); }
  const big = [];
  for (const l of labels) {
    l.getWorldPosition(tmp); const d = tmp.distanceTo(cam.position); l.userData.d = d;
    if (!l.userData.s0) l.userData.s0 = l.scale.clone();
    if (l.userData.s0.x >= 3.6) big.push(l);
    // far signs grow a little and near ones shrink, so a name stays a readable size on screen without crowding you
    if (l.renderOrder === 10) { const sk = l.userData.s0.x >= 3.6 ? THREE.MathUtils.clamp(d / 30, 0.8, 1.5) : THREE.MathUtils.clamp(d / 14, 0.85, 1.35); l.scale.set(l.userData.s0.x * sk, l.userData.s0.y * sk, 1); } // K.label signs only
  }
  if ((labelT -= dt) <= 0) { labelT = 0.2; big.sort((a, b) => a.userData.d - b.userData.d); big.forEach((l, i) => { l.userData.rank = i; }); declutter(); }
  for (const l of labels) {
    const d = l.userData.d, isBig = l.userData.s0.x >= 3.6, far = isBig ? (l.userData.rank < NAME_MAX ? NAME_FAR : 0) : 30;
    const room = l.renderOrder === 10 ? (l.userData.clear === false ? 0 : 1) : 1;
    const want = THREE.MathUtils.clamp((d - (isBig ? 10 : 7.5)) / 5, 0, 1) * THREE.MathUtils.clamp((far - d) / 8, 0, 1) * room;
    // a sign that has to give way goes at once; one that may show comes in gently (two never sit on each other)
    l.material.opacity = THREE.MathUtils.lerp(l.material.opacity, want, want < l.material.opacity ? (room ? 0.3 : 0.6) : 0.12); l.visible = l.material.opacity > 0.02;
    if (isBig && l.parent) {
      const pw = (l.userData.rank < NAME_MAX ? THREE.MathUtils.clamp((d - NAME_FAR + 6) / 8, 0, 1) : 1) * THREE.MathUtils.clamp((PIN_FAR - d) / 20, 0, 1) * (l.userData.pinClear === false ? 0 : 1) * (l.userData.rank < 14 ? 1 : 0);
      if (pw > 0.01 || l.userData.pin) { const p = pinOf(l); p.material.opacity = THREE.MathUtils.lerp(p.material.opacity, pw, pw < p.material.opacity ? 0.5 : 0.1 * (l.material.opacity < 0.2 ? 1 : 0.2)); p.visible = p.material.opacity > 0.02; const s = d * 0.024; p.scale.set(s, s, 1); }
    }
  }
}
// screen space: each sign (and pin) takes its rectangle, nearest first; one that would overlap a taken one waits
function declutter() {
  const H = innerHeight, W = innerWidth, k = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)), taken = [], items = [];
  for (const l of labels) {
    if (l.renderOrder !== 10 || !l.parent) continue;
    const d = l.userData.d, isBig = l.userData.s0.x >= 3.6;
    if (d > (isBig ? PIN_FAR : 32)) { l.userData.clear = true; continue; }
    l.getWorldPosition(lbV); const pin = isBig && (d > NAME_FAR - 2 || l.userData.rank >= NAME_MAX);
    lbV.project(cam); if (lbV.z > 1 || Math.abs(lbV.x) > 1.2 || Math.abs(lbV.y) > 1.2) { l.userData.clear = true; l.userData.pinClear = true; continue; }
    const px = k / Math.max(1, d), x = (lbV.x * 0.5 + 0.5) * W, y = (-lbV.y * 0.5 + 0.5) * H;
    let w, h, cy = y;
    if (pin) { w = h = d * 0.024 * px * 0.8; } else { const pl = l.userData.plate || [0.7, 0.6, 0.5]; w = l.scale.x * pl[0] * px; h = l.scale.y * pl[1] * px; cy = y + (pl[2] - 0.5) * l.scale.y * px; }
    // your own things and fights come first: mobs' names, names over players (smaller scores win)
    const score = d * (l.userData.keep ? 0.3 : 1);
    items.push({ l, pin, score, r: [x - w / 2, cy - h / 2, x + w / 2, cy + h / 2] });
  }
  items.sort((a, b) => a.score - b.score);
  for (const it of items) {
    const r = it.r, hit = taken.some((t) => r[0] < t[2] && t[0] < r[2] && r[1] < t[3] && t[1] < r[3]);
    if (!hit) taken.push(r);
    if (it.pin) it.l.userData.pinClear = !hit; else it.l.userData.clear = !hit;
  }
}

// ---------------- key cards, the stages still locked, little effects ----------------
function pickCards() {
  for (let i = cards.length - 1; i >= 0; i--) {
    const g = cards[i]; g.getWorldPosition(tmp);
    if (tmp.distanceTo(at) < 2.0 + hop) {
      cards.splice(i, 1); P.cards.push(g.userData.id); save();
      flyCard(tmp);
      const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 450; g.scale.setScalar(Math.max(0.001, 1 + k * 0.6 - k * k * 1.6)); if (k >= 1) { off(); planet.remove(g); } });
      if (avatar && grounded && !boarding) avatar.play("pick-up", { once: true });
      gain(5, T("key card {n}/{m}", { n: P.cards.length, m: K.CARDS.length })); checkQuests();
    }
  }
}
function flyCard(world) {
  const p = world.clone(); p.y += 1; p.project(cam);
  const x = (p.x * 0.5 + 0.5) * innerWidth, y = (-p.y * 0.5 + 0.5) * innerHeight, r = $("wp-cards").getBoundingClientRect();
  const el = document.createElement("i"); el.className = "wp-flycard"; el.style.transform = `translate(${x}px,${y}px) scale(1.4)`; document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `translate(${r.left + 14}px,${r.top + 14}px) scale(.5)`; el.style.opacity = "0.2"; }));
  setTimeout(() => { el.remove(); $("wp-cards").classList.remove("bump"); void $("wp-cards").offsetWidth; $("wp-cards").classList.add("bump"); }, 650);
}
let lockCool = 0;
function lockedCheck(dt) {
  if (lockCool > 0) { lockCool -= dt; return; }
  for (const g of lockedStages) {
    g.getWorldPosition(tmp);
    if (tmp.distanceTo(at) < g.userData.radius + 2.2) {
      const s = g.userData.spec, prev = K.SCAMMERS.find((x) => x.stage === s.stage - 1);
      toast(T("Stage {n}, {name}: beat {prev} first", { n: s.stage, name: s.name, prev: prev ? prev.name : "" }));
      lockCool = 5; return;
    }
  }
}
function burst(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, hop + 0.1, 0); st.scene.add(m);
  const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 900; m.scale.setScalar(1 + k * 7); m.material.opacity = 0.9 * (1 - k); if (k >= 1) { off(); st.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
}
function levelUp(n, from) {
  try { const dg = jurOn && jurGame && jurGame.dino ? jurGame.dino() : null; if (dg && dg.cheer) dg.cheer(); else if (dinoTown3d && dinoTown3d.react) dinoTown3d.react(); } catch { /* the companion cheers next time */ } // b-fx2: your companion roars for you
  const grew = (() => { try { const a = RPG.statsOf(from || n - 1, rpg.data().eq), b = RPG.statsOf(n, rpg.data().eq); return [["atk", "Attack"], ["def", "Defense"], ["hp", "Max HP"], ["sp", "Max SP"]].map(([k, l]) => [T(l), b[k] - a[k]]).filter(([, d]) => d > 0); } catch { return []; } })();
  if (avatar && avatar.face) avatar.face("star", 2.4); // star eyes
  // a level-up card across the middle of the screen: the new level, rays behind it, what it opened
  { const el = document.createElement("div"); el.className = "wp-lvup"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.setAttribute("data-no-i18n", "");
    const opens = []; if (n === 10) opens.push(T("The rover")); if (n === 30) opens.push(T("The jetpack")); const z = RPG.ZONES.find((x) => x.lv[0] === n); if (z) opens.push(z.name);
    el.innerHTML = `<i class="wp-lvup-rays" aria-hidden="true"></i><small>${esc(T("Level up"))}</small><b>${n}</b>${opens.length ? `<span>${esc(opens.join(" · "))}</span>` : ""}${grew.length ? `<ul class="wp-lvup-st">${grew.map(([l, d], i) => `<li style="--i:${i}">${esc(l)} <em>+${d}</em></li>`).join("")}</ul>` : ""}`;
    document.body.appendChild(el); setTimeout(() => el.classList.add("out"), reduce ? 1600 : 2200); setTimeout(() => el.remove(), reduce ? 1900 : 2700); }
  const pas = RPG.PASSIVES.find((x) => x.lv === n); if (pas) setTimeout(() => toast(T("New passive: {x} — {y}", { x: T(pas.name), y: T(pas.line) })), 1600);
  if (grounded && !boarding && mode === "hub") { vy = 7.5; grounded = false; } // a little jump for joy
  if (avatar && (avatar.arc || avatar.custom) && !boarding) avatar.play("celebrate", { once: true }); // an ARC Bot throws its arms up; a hero cheers (the borrowed KayKit cheer, world-kit.js kkBorrow)
  vfx.levelUp();
  // the new level rises from your head and fades
  if (!reduce) { const lb = K.label(T("Lv {n}", { n }), { accent: "#ffc861", color: "#ffd27a", size: 0.8 }); lb.position.y = 3.4; player.add(lb); const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 1700; lb.position.y = 3.4 + k * 1.6; lb.material.opacity = Math.min(1, (1 - k) * 2.5); if (k >= 1) { off(); player.remove(lb); lb.material.map && lb.material.map.dispose(); lb.material.dispose(); } }); }
  if (rpg) { const was = RPG.statsOf(from || n - 1, rpg.data().eq); rpg.onLevel(); if (combat) combat.onLevel(n, was); } else if (combat) combat.onLevel(n);
  if (quests) quests.on.level();
  // a new hunting ground opens at this level: a beam of light rises over its gate and the camera turns to it
  const opened = RPG.ZONES.find((z) => z.lv[0] > (from || n - 1) && z.lv[0] <= n && z.lv[0] > 1);
  if (opened && mode === "hub") setTimeout(() => gateReveal(opened), 2200);
}
function gateReveal(z) {
  const a = Math.atan2(-z.x, -z.z), gx = z.x + Math.sin(a) * z.r, gz = z.z + Math.cos(a) * z.r, c = new THREE.Color(z.color);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 90, 24, 1, true), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.position.set(gx, 45, gz); planet.add(beam);
  const t0 = performance.now(), dx = gx - (-planet.position.x), dz = gz - (-planet.position.z), want = Math.atan2(-dx, -dz), y0 = camYaw;
  const off = st.on(() => { const k = (performance.now() - t0) / 7000; beam.material.opacity = Math.min(1, k * 6) * Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3) * 0.55; beam.scale.x = beam.scale.z = 1 + Math.sin(k * 30) * 0.03;
    if (!reduce && !frozen && !look && !joy && k < 0.25) camYaw = angLerp(y0, want, Math.min(1, k * 6)); // (not while you're steering)
    if (k >= 1) { off(); planet.remove(beam); beam.geometry.dispose(); beam.material.dispose(); } });
  toast(T("A hunting ground fits your level now: {x} (level {a}–{b})", { x: z.name, a: z.lv[0], b: z.lv[1] }));
  Snd.level && Snd.level();
}
// footstep, skid and landing dust: puffs on the GPU particle ring (world-particles.js), no mesh or material each;
// big: a heavy landing's wider, slower cloud
const dustAt = new THREE.Vector3();
function dust(n, big = 0) {
  if (reduce) return;
  here(dustAt).y = hop + 0.12; parts.emit({ at: dustAt, kind: "smoke", n, speed: 1.7 + big * 2.2, up: 0.45, size: 0.5 + big * 0.45, life: 0.6 + big * 0.35, grav: -0.4, drag: 2.4, color: 0xcfe0e6, color2: 0xa9b8be, jitter: 0.5 });
}

// ---------------- wallet purse; the crown shows what you hold ----------------
const bal = { usdc: null, arc: null };
// a read on Arc: the config's RPC first, then its listed fallbacks; the last one that answered goes first next time
const RPCS = [CFG.RPC_URL || "https://rpc.mainnet.arc.io", ...(Array.isArray(CFG.RPC_FALLBACKS) ? CFG.RPC_FALLBACKS : [])];
let rpcI = 0;
async function rpcRead(method, params) {
  for (let k = 0; k < RPCS.length; k++) {
    const i = (rpcI + k) % RPCS.length, ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 12000);
    try {
      const j = await (await fetch(RPCS[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: ctl.signal })).json();
      if (j && typeof j.result === "string" && /^0x[0-9a-fA-F]*$/.test(j.result)) { rpcI = i; return j.result === "0x" ? "0x0" : j.result; }
    } catch { /* the next endpoint */ } finally { clearTimeout(tm); }
  }
  throw new Error("no Arc endpoint answered");
}
let purseAt = 0;
// b447: a purse number that changes gives a little hop (not the first time it's filled in)
function hopNum(el, v) { if (!el) return; const was = el.textContent; el.textContent = v; if (was && was !== v && !/[—-]/.test(was)) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); } }
async function refreshPurse(force) {
  const c = addr(), sv = sess(), a = c || (sv && /^0x[0-9a-fA-F]{40}$/.test(sv.wallet || "") ? sv.wallet : "");
  $("wp-wallet-t").textContent = c ? c.slice(0, 6) + "…" + c.slice(-4) : T("Connect wallet");
  $("wp-wallet").classList.toggle("on", !!c);
  // the purse reads the connected wallet, or the one signed in (the beta pass) while the wallet reconnects
  $("wp-purse").hidden = !a;
  if (!a || (!force && Date.now() - purseAt < 30000)) { checkQuests(); return; }
  purseAt = Date.now();
  // two plain reads (no batch: some endpoints refuse or rate-limit items inside one), each falling back through
  // the config's other Arc endpoints; a read that fails keeps the last number instead of showing 0
  // five characters at most, so a balance fits its half of the purse card: 0.86, 99.99, 999, 12.5K, 999K, 1.16M, 25.4M
  const f = (v) => v >= 1e8 ? (v / 1e6).toFixed(0) + "M" : v >= 1e7 ? (v / 1e6).toFixed(1) + "M" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e5 ? (v / 1e3).toFixed(0) + "K" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v >= 100 ? v.toFixed(0) : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const n = (h) => Number(BigInt(h) / 10n ** 14n) / 1e4;
  const tok = /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "";
  $("wp-purse").classList.toggle("loading", bal.arc == null);
  const [u, t] = await Promise.allSettled([
    rpcRead("eth_getBalance", [a, "latest"]),
    tok ? rpcRead("eth_call", [{ to: tok, data: "0x70a08231" + a.slice(2).toLowerCase().padStart(64, "0") }, "latest"])
      // the browser couldn't reach Arc: the server reads the same public balance
      .catch(() => fetch("/api/social?world=holding&wallet=" + a).then((r) => r.json()).then((j) => { if (!/^\d+$/.test(String(j && j.arc))) throw new Error("no balance"); return "0x" + BigInt(j.arc).toString(16); }))
      : Promise.reject(new Error("no token")),
  ]);
  if (u.status === "fulfilled") { bal.usdc = n(u.value); hopNum($("wp-usdc"), f(bal.usdc)); }
  if (t.status === "fulfilled") { bal.arc = n(t.value); hopNum($("wp-arc"), f(bal.arc)); }
  $("wp-purse").classList.toggle("stale", u.status !== "fulfilled" || t.status !== "fulfilled"); $("wp-purse").classList.remove("loading");
  if (u.status !== "fulfilled" || t.status !== "fulfilled") purseAt = Date.now() - 22000; // try again in a few seconds
  if (u.status === "fulfilled" || t.status === "fulfilled") { paintCrown(); arclChecks(); }
  checkQuests();
}
function arclChecks() {
  if ((bal.arc || 0) > 0) arclClaim("hold");
  if (myCoins.length) arclClaim("launch", { coin: lc(myCoins[0].token) });
}
// the holder tier: 0 none, 1 holds $ARCIRCLE, 2 from 100k, 3 from 1M (a hero shows it on its halo, others on the crown)
function tierOf() { let a = 0; try { a = bal.arc || 0; } catch { /* the purse is declared further down (a TDZ before it) */ } return a >= 1e6 ? 3 : a >= 1e5 ? 2 : a > 0 ? 1 : 0; }
function paintCrown() {
  if (!avatar || !avatar.setCrown) return;
  if (avatar.hero) { const sk = heroSkin(); avatar.setCrown(sk && sk.halo ? sk.halo : K.TIER_HALO ? K.TIER_HALO[tierOf()] : null); if (avatar.crownSpikes) avatar.crownSpikes(sk && sk.crown ? sk.crown : null); return; }
  const a = bal.arc || 0;
  if (a >= 1e6) avatar.setCrown(0xffc861, 0xffe7a8); else if (a >= 1e5) avatar.setCrown(0x39ff88, 0x35d8d0); else if (a > 0) avatar.setCrown(0x35d8d0, 0x4f9dff); else avatar.setCrown(0x3f9bff, 0x39ff88);
}
$("wp-wallet").addEventListener("click", () => { if (AC && !addr()) AC.connect().then(() => { refreshPurse(true); refreshCoins(); paintAcct(); }).catch(() => {}); else if (AC) refreshPurse(true); });
if (AC && AC.on) AC.on(() => { refreshPurse(true); refreshCoins(); paintAcct(); });
setTimeout(() => setInterval(() => { if (!document.hidden) refreshPurse(false); }, 30000), 7000 + Math.random() * 15000); // (the return below catches it up)
// back from a swap or a launch in another tab: read the purse again (at most every 5 seconds)
let purseBack = 0; document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - purseBack > 5000) { purseBack = Date.now(); refreshPurse(true); } });

// ---------------- HUD ----------------
let hudLv = 0, xpLvT = 0; // the level the XP bar last showed, and its level-up refill timer
function paintHud() {
  $("wp-lv").querySelector("b").textContent = "Lv " + level();
  const fl = $("wc-face-lv"); if (fl) fl.textContent = String(level());
  const xq = RPG.xpProgress(P.xp), xf = $("wp-xpfill"), L = level();
  if (hudLv && L > hudLv && !reduce) { // a level-up: fill to the top and flash, then start again from empty
    clearTimeout(xpLvT); xf.style.width = "100%"; xf.classList.add("lvflash");
    xpLvT = setTimeout(() => { xpLvT = 0; xf.style.transition = "none"; xf.style.width = "0"; void xf.offsetWidth; xf.style.transition = ""; xf.classList.remove("lvflash"); const q = RPG.xpProgress(P.xp); xf.style.width = Math.min(100, (100 * q.into) / q.need).toFixed(1) + "%"; }, 650);
  } else if (!xpLvT) xf.style.width = Math.min(100, (100 * xq.into) / xq.need).toFixed(1) + "%";
  hudLv = L;
  $("wp-lv").title = `${xq.into.toLocaleString("en-US")} / ${xq.need.toLocaleString("en-US")} XP`; $("wp-lv-xp").textContent = `${xq.into.toLocaleString("en-US")} / ${xq.need.toLocaleString("en-US")}`;
  $("wp-cards").querySelector("b").textContent = `${P.cards.length}/${K.CARDS.length}`;
  const next = K.SCAMMERS.find((s) => !P.beaten.includes(s.id));
  $("wp-stage").textContent = next ? T("Stage {n} · {name}", { n: next.stage, name: next.name }) : T("Every stage cleared");
  // the village level, next to yours (a dot when an upgrade is ready to buy)
  const vc = $("wp-vlv"), s = sess(), v = P.vill && s && P.vill.w === lc(s.wallet) ? P.vill : null;
  if (vc) { vc.hidden = false; vc.querySelector("b").textContent = "Lv " + (v ? v.level : 1); vc.dataset.up = v && v.payable ? "1" : ""; vc.title = v ? T("Village level {n} · score {s} · XP +{x}% · max HP +{h}%", { n: v.level, s: (v.score || 0).toLocaleString("en-US"), x: v.blessing.xp, h: v.blessing.hp }) : T("My village"); }
}
// tutorial: move, jump, then follow the light
// the first three minutes: move, jump, a shop, then a training fight, your gear, the Adventure log and your island
const TUT = ["Move with W A S D, or the stick on the left", "Jump with Space, or the arrow button", "Follow the gold light to the Launchpad",
  "Knock out the training scammer: J, or the red button", "Open your character: I, or the bag button", "Open the Adventure log: L — today's chest is there", "Visit your own island through the green gate"];
const TUT_XP = [0, 0, 0, 25, 15, 15, 30];
// IDEA3 (2026-10-27, the funnel in diag: of 7 new phones that made a hero, 6 moved and only 2 fought): the training
// fight comes right after moving and jumping — before, the Launchpad step sent you through a portal to another land
// first. The steps keep their numbers (saved bits); only the order they're asked in changes
const TUT_ORDER = [0, 1, 3, 2, 4, 5, 6];
let tutT = 0;
function tutorialStep(done) {
  // steps can be done in any order (jumping before walking counts); the hint shows the first one not done yet
  if (done >= 0) {
    const bit = 1 << done; if ((P.tutBits | 0) & bit || P.tut >= TUT.length) return;
    P.tutBits = (P.tutBits | 0) | bit; if (TUT_XP[done] && !P.tutAgain) setTimeout(() => gain(TUT_XP[done], T("Getting started")), 300);
    if (done === 3 && !P.tutAgain) askSave(8); // a guest's first knock-out and its XP: the moment to offer saving it to a wallet (b-fm1: no sign-in before playing)
    let n = TUT.length; for (const k of TUT_ORDER) if (!(P.tutBits & (1 << k))) { n = k; break; }
    if (n === P.tut) { save(); return; }
    P.tut = n; save();
    if (n >= TUT.length) { checkQuests(); setTimeout(() => { toast(T("You know your way around. Have fun out there!")); burst(0x39ff88); }, 600); if (!P.tutAgain) askSave(8); if (!P.tutAgain) setTimeout(() => { if (!frozen && mode === "hub") maybeNew(); }, 9000); } // a new player sees what's new once, after the tutorial
  }
  const h = $("wp-hint");
  if (P.tut >= TUT.length) { h.hidden = true; return; }
  // b419 hid the top banner (it covered the HUD); now a small chip near the bottom that fades after 8 s
  h.innerHTML = `<small>${TUT_ORDER.indexOf(P.tut) + 1}/${TUT.length}</small>${esc(T(TUT[P.tut]))}`; h.hidden = false; h.classList.remove("on"); void h.offsetWidth; h.classList.add("on");
  clearTimeout(tutT); tutT = setTimeout(() => { h.hidden = true; }, 8000);
  // the training fight: a weak scammer shows up a few steps away
  // (tried again until the scammer robots have loaded: on a slow connection they come a little after the town)
  const train = () => { if (P.tut !== 3 || mode !== "hub" || !combat || combat.state().mobs.length) return; if (!combat.spawnNear(6, { lv: 1, free: true })) setTimeout(train, 1500); };
  if (P.tut === 3 && combat && mode === "hub") setTimeout(train, 900);
}
// ---------------- sign in, character maker, settings, photo mode ----------------
const auth = $("wp-auth");
function openAuth(why) {
  auth.hidden = false; frozen = true; $("wp-auth-err").hidden = true;
  // b-fm1: offered after playing (askSave), the card says what signing in keeps; opened from a button, its usual words
  for (const [id, sel, t] of [["h", "#wp-auth-h", "Save your progress"], ["k", ".wp-auth-keep", "Your wins and XP so far come with you, and the launch rewards open up."], ["g", "#wp-auth-guest", "Keep playing as a guest"]]) {
    const e = auth.querySelector(sel); if (!e) continue; if (e.dataset.base == null) e.dataset.base = e.textContent; e.textContent = why === "save" ? TW(t) : e.dataset.base; }
  paintAuthCount();
  setTimeout(() => $("wp-auth-go").focus({ preventScroll: true }), 60);
}
// a guest who finished "Getting started" is asked once to save to their wallet (their progress comes with them);
// waits for a quiet moment in town, gives up after a few tries
function askSave(tries) {
  if (sess() || P.saveAsk || tries <= 0) return;
  if (!auth.hidden || frozen || mode !== "hub") { setTimeout(() => askSave(tries - 1), 5000); return; }
  setTimeout(() => { if (sess() || P.saveAsk || !auth.hidden || frozen || mode !== "hub") return askSave(tries - 1); P.saveAsk = 1; save(); openAuth("save"); }, 2600);
}
function closeAuth() { auth.hidden = true; frozen = false; P.authSeen = true; save(); paintAcct(); if (!P.char) openMake(); else { setAvatar(P.char); tutorialStep(-1); maybeGuide(); } }
$("wp-auth-go").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.disabled = true; b.textContent = T("Check your wallet…");
  try { await signIn(); closeAuth(); refreshPurse(true); refreshCoins(); paintHud(); refreshWelcome(); }
  catch (err) { $("wp-auth-err").hidden = false; $("wp-auth-err").textContent = (err && (err.code === 4001 || /reject|denied|cancel/i.test(err.message || ""))) ? T("You cancelled the signature. You can sign in later from Settings.") : (err && err.message) || T("Sign-in failed."); }
  finally { b.disabled = false; b.textContent = T("Sign in with wallet"); }
});
$("wp-auth-guest").addEventListener("click", closeAuth);
let resignOff = false;
// a sign-in older than a day no longer saves: say so, with a button to sign again (signing is free and moves nothing)
function paintResign() {
  let raw = null; try { raw = JSON.parse(localStorage.getItem(SESS) || "null"); } catch { /* private */ }
  const stale = !!(raw && raw.wallet && !sess()), el = $("wp-resign");
  if (!el) return; el.hidden = !stale || resignOff;
}
setInterval(paintResign, 60000);
$("wp-resign").addEventListener("click", async (e) => {
  if (e.target.closest("[data-rx]")) { resignOff = true; paintResign(); return; }
  if (!e.target.closest("[data-rgo]")) return;
  try { await signIn(); paintAcct(); paintHud(); } catch (err) { toast((err && err.message) || T("Sign-in failed.")); }
});
function paintAcct() {
  paintResign();
  const s = sess(), box = $("wp-set-acct");
  box.innerHTML = s ? `<span data-no-i18n>${esc(s.wallet.slice(0, 6) + "…" + s.wallet.slice(-4))}</span> <button type="button" class="wp-link" id="wp-acct-out">${esc(T("Sign out"))}</button>` : `<button type="button" class="wp-btn" id="wp-acct-in">${esc(T("Sign in with wallet"))}</button>`;
  $("wp-set-note").textContent = s ? T("Progress is saved to your wallet and this browser.") : T("Progress is saved in this browser.");
}
$("wp-set-acct").addEventListener("click", async (e) => {
  if (e.target.id === "wp-acct-out") { try { localStorage.removeItem(SESS); } catch { /* private */ } paintAcct(); toast(T("Signed out. Progress stays in this browser.")); }
  if (e.target.id === "wp-acct-in") { try { await signIn(); paintAcct(); paintHud(); } catch (err) { toast((err && err.message) || T("Sign-in failed.")); } }
});
const make = $("wp-make");
const KK_NAME = { "kk-knight": "Knight", "kk-mage": "Mage", "kk-rogue": "Rogue", "kk-rogue-hooded": "Hooded Rogue", "kk-ranger": "Ranger", "kk-barbarian": "Barbarian" };
let pickChar = heroOf(P.char || "arc-arc"), pickTint = P.tint || 0; // pickTint: the hero's colour (K.HERO_TINTS; b447)
let autoNamed = false;
function openMake() {
  if (!P.char) { fun("maker"); try { const pp = localStorage.getItem("arc.world.prepick"); if (pp && (K.HERO_IDS || []).includes(pp) && pp !== pickChar) { pickChar = pp; if (avatar) setAvatar(pickChar); } } catch { /* private */ } } // b-st3: the hero picked on the loading screen
  // the ARC Bots first (each with its name and role), then the classic characters
  const cell = (id) => { const ab = ARCBOT.arcbotOf(id), nm = ab ? `${ab.name} · ${T(ab.role)}` : id === "bot" ? "ARC Hover Bot" : id.startsWith("kk-") ? T(KK_NAME[id] || id) : K.HEROES && K.HEROES[id] ? K.HEROES[id].name : id.startsWith("custom-") ? id.slice(7).replace(/-/g, " ") : id.replace("-", " "); return `<button type="button" role="radio" aria-checked="${id === pickChar}" data-c="${id}" title="${esc(nm)}">${ab || id === "bot" ? `<img src="/images/brand/mark-sm-v2.png" alt="${esc(nm)}">` : `<img src="/models/world/chars/${id}.webp${VER}" alt="${esc(nm)}">`}${ab ? `<small>${esc(ab.name)}</small>` : K.HEROES && K.HEROES[id] ? `<small>${esc(K.HEROES[id].name)}</small>` : ""}</button>`; };
  const sec = (h, ids) => (ids.length ? `<p class="wp-make-sec">${esc(T(h))}</p>` + ids.map(cell).join("") : "");
  $("wp-make-grid").classList.toggle("heroes", !!K.HERO_ONLY); // b447: big hero cards, and the heroes still to come
  $("wp-make-grid").innerHTML = K.HERO_ONLY ? sec("Heroes", K.HERO_IDS) + (K.HEROES_SOON || []).map((n) => `<button type="button" class="soon" disabled aria-disabled="true" title="${esc(n)}"><i aria-hidden="true">?</i><small>${esc(n)}</small><em>${esc(TW("Soon"))}</em></button>`).join("") : sec("ARC Bots", K.CHARACTERS.filter((id) => id.startsWith("arc-"))) + sec("Adventurers", K.CHARACTERS.filter((id) => id.startsWith("kk-"))) + sec("Classic characters", K.CHARACTERS.filter((id) => !id.startsWith("arc-") && !id.startsWith("kk-") && !K.CUSTOM_CHARS.includes(id))) + sec("Custom characters", K.CUSTOM_CHARS);
  { const tw = $("wp-make-tints"), L = K.HERO_TINTS || []; tw.hidden = !K.HERO_ONLY || !L.length;
    if (!tw.hidden) { pickTint = P.tint || 0; tw.innerHTML = `<p class="wp-make-sec">${esc(TW("Colour"))}</p>` + L.map((c, i) => `<button type="button" role="radio" data-t="${i}" aria-checked="${i === pickTint}" aria-label="${esc(TW("Colour"))} ${i + 1}" style="--c:${c == null ? "#3f8fff" : "#" + c.toString(16).padStart(6, "0")}"></button>`).join(""); } }
  // (2026-10-25, the funnel: half the players who saw the maker never pressed Go) a first visit gets a name ready —
  // pick a hero and go; the first change of that name stays free (P.autoName) — and no keyboard popping up on a phone
  if (!P.name && !$("wp-make-name").value) { const NM = ["Nova", "Pixel", "Comet", "Echo", "Luna", "Bolt", "Sky", "Rook", "Zen", "Vega", "Orbit", "Spark"]; $("wp-make-name").value = NM[Math.floor(Math.random() * NM.length)] + (100 + Math.floor(Math.random() * 900)); autoNamed = true; }
  else $("wp-make-name").value = P.name || "";
  { const pp = make.querySelector(".wp-make-card > p"); if (pp) pp.textContent = TW("One world, eight games. Pick your hero, a colour and a name — you can change them later."); }
  if (!P.guideSeen) firstRun(true); // b-st1: a first visit sees the world and the maker, not every button at once
  make.hidden = false; frozen = true; keys.clear(); paintPrompt();
  camYaw = facing;
  if (!avatar) setAvatar(pickChar);
  renderThumbs();
  if (!coarse) setTimeout(() => $("wp-make-name").focus({ preventScroll: true }), 60);
}
// sharper portraits: each character rendered once in 3D (kept for the maker, the Players list and profile cards)
const thumbCache = {};
let thumbsDone = false, thumbBusy = Promise.resolve();
function renderThumbsFor(ids) {
  const todo = [...new Set(ids)].filter((id) => id && !thumbCache[id] && K.CHARACTERS.includes(id) && id !== "bot");
  if (!todo.length) return thumbBusy;
  thumbBusy = thumbBusy.then(async () => {
    let r = null;
    try {
      r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(128, 128); r.outputColorSpace = THREE.SRGBColorSpace;
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 3, 4); sc.add(dl);
      const cm = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      for (const id of todo) {
        if (thumbCache[id]) continue;
        const c = await K.makeCharacter(heroOf(id), VER).catch(() => null); if (!c) continue; // (a player's portrait shows the hero they're drawn as)
        // an ARC Bot's portrait is closer (its face is the point) and without the crown
        const crown = c.arc ? c.obj.getObjectByName("crown") : null; if (crown) crown.visible = false;
        if (c.arc) { cm.position.set(0.5, 1.5, 3.7); cm.lookAt(0, 1.2, 0); c.obj.rotation.y = 0.25; } else { cm.position.set(0, 1.5, 5.2); cm.lookAt(0, 1.15, 0); }
        sc.add(c.obj); if (c.restPose) c.restPose(c.obj); else c.mixer.update(0.5); r.render(sc, cm); // a hero stands straight (b447)
        thumbCache[id] = r.domElement.toDataURL("image/png"); sc.remove(c.obj);
        const img = make.querySelector(`button[data-c="${id}"] img`); if (img) img.src = thumbCache[id];
        await sleep(0);
      }
    } catch { /* the small previews stay */ }
    if (r) { r.dispose(); r.forceContextLoss(); }
  });
  return thumbBusy;
}
async function renderThumbs() {
  if (thumbsDone) return; thumbsDone = true;
  K.CHARACTERS.forEach((id) => { const img = make.querySelector(`button[data-c="${id}"] img`); if (img && thumbCache[id]) img.src = thumbCache[id]; });
  await renderThumbsFor(K.CHARACTERS);
}
$("wp-make-grid").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-c]"); if (!b) return;
  pickChar = b.dataset.c; $("wp-make-grid").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  // b-st2: each hero greets in its own way (ARON nods, LUMI casts, NEX swings: CU_AS clips), in a puff of light
  const pose = ["emote-yes", "cast", "attack"][[...$("wp-make-grid").querySelectorAll("button[data-c]")].indexOf(b)] || "emote-yes";
  setAvatar(pickChar).then(() => { if (avatar) avatar.play(pose, { once: true }); try { vfx.collect(here(), 0x7fe9ff); } catch { /* fine */ } });
});
// the character maker: the first pick (and first name) is free; changing either later is a Character change,
// 10,000 $ARCIRCLE from your wallet (half burned, half to the treasury), which the server checks on the next save
const CHAR_COST = 10000;
function finishMake(ch, nm) {
  fun("named");
  if (P.autoName && P.name && nm !== P.name) P.autoName = false; else if (!P.name && autoNamed && nm === $("wp-make-name").value) P.autoName = true; autoNamed = false;
  P.char = ch; P.name = nm; if (K.HERO_ONLY) P.tint = pickTint; save();
  setNameTag(); make.hidden = true; frozen = false; camYaw = facing - Math.PI; paintQuests(); tutorialStep(-1); maybeGuide();
  const ask = $("wp-make-ask"); if (ask) ask.remove();
}
$("wp-make-tints").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (!b) return; pickTint = Number(b.dataset.t) || 0; $("wp-make-tints").querySelectorAll("button[data-t]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); if (avatar && avatar.setTint) avatar.setTint(pickTint);
  try { const c = (K.HERO_TINTS || [])[pickTint]; vfx.collect(here(), typeof c === "number" ? c : 0x7fe9ff); if (avatar && !(avatar.busy && avatar.busy())) avatar.play("emote-yes", { once: true }); } catch { /* fine */ } }); // b-st2: a shimmer of the new colour
$("wp-make-go").addEventListener("click", () => {
  const nm = ($("wp-make-name").value || "").replace(/[<>"'`\\]/g, "").trim().slice(0, 16) || W("Player");
  if (P.char && heroOf(P.char) === pickChar) pickChar = P.char; // b447: the hero you're already drawn as: your saved character stays (no Character change)
  const charCh = !!(P.char && P.guideSeen && (pickChar !== P.char || (K.HERO_ONLY && P.tint != null && pickTint !== P.tint))), nameCh /* a new colour counts as a new character (the first one is free; b447) */ = !!(P.name && P.guideSeen && nm !== P.name && !P.autoName); /* (a name the maker picked for you: its first change is free) */
  if (!charCh && !nameCh) { finishMake(pickChar, nm); return; }
  const o = arclShop.own() || {};
  // a change already paid for (or an old ARCL Name change, for a name alone) goes straight through
  if ((o.rechars || 0) > (o.recharsUsed || 0) || (!charCh && (o.renames || 0) > (o.renamesUsed || 0))) { finishMake(pickChar, nm); toast(T("Character changed")); return; }
  let ask = $("wp-make-ask"); if (ask) ask.remove();
  ask = document.createElement("div"); ask.id = "wp-make-ask"; ask.className = "wp-make-ask"; ask.setAttribute("role", "group");
  const signed = !!sess();
  ask.innerHTML = `<p>${esc(signed ? T("Changing your character or name costs {n} $ARCIRCLE from your wallet (half is burned, half goes to the treasury).", { n: CHAR_COST.toLocaleString("en-US") }) : T("Changing your character or name costs {n} $ARCIRCLE. Sign in with your wallet to pay for it.", { n: CHAR_COST.toLocaleString("en-US") }))}</p><p class="wp-make-st" aria-live="polite"></p>
    <div>${signed ? `<button type="button" class="wp-btn go" data-mpay>${esc(T("Pay {n} $ARCIRCLE", { n: CHAR_COST.toLocaleString("en-US") }))}</button>` : ""}<button type="button" class="wp-btn" data-mkeep>${esc(T("Keep my character"))}</button></div>`;
  $("wp-make-go").after(ask);
  ask.addEventListener("click", (e) => {
    if (e.target.closest("[data-mkeep]")) {
      // back to the one you have
      pickChar = P.char; pickTint = P.tint || 0; $("wp-make-name").value = P.name || ""; setAvatar(P.char); ask.remove();
      $("wp-make-grid").querySelectorAll("button[data-c]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.c === P.char)));
      make.hidden = true; frozen = false; return;
    }
    const pb = e.target.closest("[data-mpay]"); if (!pb) return;
    pb.disabled = true; const st = ask.querySelector(".wp-make-st");
    arclShop.pay("rechar", "", (t) => { if (st) st.textContent = t; }).then((ok) => { if (ok) { finishMake(pickChar, nm); toast(T("Character changed")); } else pb.disabled = false; }).catch(() => { pb.disabled = false; });
  });
});
const setEl = $("wp-setsheet");
function openSet() {
  setEl.querySelectorAll("#wp-set-q button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === (S.quality === "high" ? "ultra" : S.quality))));
  $("wp-set-fps").setAttribute("aria-pressed", String(!!S.fps)); $("wp-set-fps").textContent = S.fps ? TW("On") : T("Show");
  setEl.querySelectorAll("#wp-set-cap button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.cap) === (S.fpsCap || 0))));
  setEl.querySelectorAll("#wp-set-lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.l === LANG)));
  $("wp-set-q-note").textContent = qNote(S.quality === "high" ? "ultra" : S.quality);
  $("wp-set-snd").checked = !!S.sound; $("wp-set-sens").value = S.sens; $("wp-set-joyk").value = String([0.85, 1, 1.2].includes(+S.joyK) ? +S.joyK : 1); $("wp-set-joyup").value = +S.joyUp || 0; $("wp-set-motion").checked = S.motion === "less"; $("wp-set-showname").checked = S.showName !== false; $("wp-set-big").checked = !!S.big; $("wp-set-cb").checked = !!S.cb;
  const d = dailyState(), c = d.c, val = { shops: c.shops.length, jumps: c.jumps, walk: Math.round(c.walk) };
  $("wp-daily").innerHTML = DAILY.map((g) => `<li class="${d.done.includes(g.id) ? "ok" : ""}"><i></i><span>${esc(T(g.t))}</span><small data-no-i18n>${Math.min(val[g.id], g.n)}/${g.n}</small></li>`).join("") + `<li class="streak"><span>${esc(T("Streak: {n} days", { n: d.streak || 0 }))}</span></li>`;
  $("wp-badges").innerHTML = BADGES.map((b) => `<li class="${P.badges.includes(b.id) ? "ok" : ""}" title="${esc(T(b.t))}"><b>${esc(T(b.title))}</b><small>${esc(T(b.t))}</small></li>`).join("");
  paintAcct();
  setEl.hidden = false; frozen = true; keys.clear(); paintPrompt();
}
function closeSet() { if (setEl.hidden) return; setEl.hidden = true; frozen = false; }
$("wp-set-btn").addEventListener("click", openSet);
$("wp-set-x").addEventListener("click", closeSet);
setEl.addEventListener("click", (e) => { if (e.target === setEl) closeSet(); if (e.target.id === "wp-set-reload") location.reload(); });
$("wp-set-q").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-q]"); if (!b) return;
  S.quality = b.dataset.q; saveSet();
  setEl.querySelectorAll("#wp-set-q button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("wp-set-q-note").innerHTML = `${esc(qNote(b.dataset.q))} ${esc(T("Applies after a reload."))} <button type="button" class="wp-link" id="wp-set-reload">${esc(T("Reload now"))}</button>`;
});
// what each quality level turns on (shown under the choice)
function qNote(q) {
  return T({ auto: "Picked for your device: the Medium picture at 1.5× pixels on phones and computers, easing off if frames drop. A strong PC can choose Ultra.",
    low: "The lightest: no grass, no picture effects, fewer particles.", medium: "Smooth edges, ink outlines, fog and colour grading, grass (less on phones).",
    ultra: "Everything: soft shade in corners, sun shafts, the fountain's reflection, outlines on characters, the most grass.",
    saver: "Half the frames and 1× pixels, no bloom or shadows: for a long session on battery." }[q] || "");
}
// the frame rate in a corner (Settings → Frame rate): for checking a preset on your own phone
// the frame limit: 30 or 45 saves battery and heat on a phone; 60 is the default
$("wp-set-cap").addEventListener("click", (e) => { const b = e.target.closest("[data-cap]"); if (!b) return; S.fpsCap = Number(b.dataset.cap) || 0; saveSet(); st.fps(capNow()); /* (0 = Auto: capNow) */ setEl.querySelectorAll("#wp-set-cap button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
$("wp-set-fps").addEventListener("click", () => { S.fps = !S.fps; saveSet(); $("wp-set-fps").setAttribute("aria-pressed", String(S.fps)); $("wp-set-fps").textContent = S.fps ? TW("On") : T("Show"); $("wp-fps").hidden = !S.fps; });
{ let n = 0, t0 = performance.now(); $("wp-fps").hidden = !S.fps;
  st.on(() => { if (!S.fps) return; n++; const now = performance.now(); if (now - t0 >= 500) { const dr = diag.draw(); $("wp-fps").textContent = `${Math.round((n * 1000) / (now - t0))} fps · ${dr.calls} draws · ${Math.round(dr.tris / 1000)}k tris`; n = 0; t0 = now; } }); }
$("wp-set-lang").addEventListener("click", (e) => { const b = e.target.closest("button[data-l]"); if (!b || b.dataset.l === LANG) return; try { localStorage.setItem("arcircle.lang", b.dataset.l); } catch { /* private */ } if (window.arcI18n) window.arcI18n.set(b.dataset.l); location.reload(); });

// ---------------- the controls guide: keyboard, mouse and touch, shown once and from Settings ----------------
const guide = document.createElement("div");
guide.className = "wp-guide"; guide.id = "wp-guide"; guide.hidden = true; guide.setAttribute("role", "dialog"); guide.setAttribute("aria-modal", "true"); guide.setAttribute("aria-labelledby", "wp-guide-h"); guide.setAttribute("data-no-i18n", "");
{
  const K2 = (k, c = "") => `<span class="${c}">${k}</span>`;
  const kb = [
    [K2("Esc", "u"), K2("1", "a"), K2("2", "a"), K2("3"), K2("4"), K2("5"), K2("6"), K2("7"), K2("8"), K2("9"), K2("0")],
    [K2("Tab", "b w15"), K2("Q"), K2("W", "m"), K2("E", "a"), K2("R", "b"), K2("T", "a"), K2("Y"), K2("U"), K2("I"), K2("O"), K2("P", "a")],
    [K2("Caps", "w15"), K2("A", "m"), K2("S", "m"), K2("D", "m"), K2("F", "a"), K2("G", "b"), K2("H", "u"), K2("J", "m"), K2("K", "m"), K2("L", "b"), K2("Enter", "a w15")],
    [K2("Shift", "m w2"), K2("Z", "m"), K2("X", "b"), K2("C", "b"), K2("V", "b"), K2("B", "b"), K2("N"), K2("M", "u"), K2(","), K2("Shift", "w2")],
    [K2("Ctrl", "b w15"), K2("Alt"), K2(W("Space"), "m w6"), K2("Alt"), K2("Ctrl", "w15")],
  ].map((r) => `<div class="wp-kb-row">${r.join("")}</div>`).join("");
  const li = (keys, what, c) => `<li><span>${keys.map((k) => `<kbd style="--k:${c[0]};--kc:${c[1]}">${ICONS.GLYPH[k] ? ICONS.icon(ICONS.GLYPH[k], 16) : esc(k)}</kbd>`).join(" ")}</span>${esc(what.includes(" ") ? T(what) : W(what))}</li>`;
  const M = ["#ff5f73", "#fff"], A = ["#ffd34d", "#3b2416"], U = ["#6fdc8c", "#0a2414"], B = ["#7ea3ff", "#0b1838"];
  const legend = `<ul class="wp-guide-legend">
    <h4>${esc(W("Moving"))}</h4>${li(["W", "A", "S", "D"], "Move (or the arrow keys)", M)}${li(["Shift"], "Run (hold)", M)}${li([W("Space")], "Jump", M)}
    <h4>${esc(T("Doing things"))}</h4>${li(["E"], "Enter a shop, talk", A)}${li(["F"], "Hoverboard on and off", A)}${li(["1", "2"], "Wave, shake your head", A)}${li(["T"], "Emote wheel: sit, point, faint…", A)}${li(["P"], "Photo mode", A)}
    <h4>${esc(W("Fighting"))}</h4>${li(["J"], "Attack", M)}${li(["J"], "Hold to charge, let go when the ring is full: each weapon has its own charged attack", M)}${li(["K"], "Dodge: a quick dash nothing can hit", M)}${li(["Z"], "Cast the skill in your slot (skills come at levels 10, 20, 40, 80)", M)}${li(["X"], "Your high skill (Lv 150: Blade Storm, Lv 200: Chrono Field, Lv 250: Void Ray)", M)}${li(["C"], "The ultimate, with a full gauge (Lv 300: Celestial Judgment, Lv 350: Infinity Burst); before Lv 300, C opens the Forge", M)}${li(["Q"], "Change the skill in the slot", M)}${li(["4", "5"], "Health and mana potions", M)}${li(["I"], "Character, gear and bag", M)}${li(["L"], "Adventure log", M)}
    <h4>${esc(W("Menus"))}</h4>${li(["M"], "Map and fast travel", U)}${li(["H"], "Help Center", U)}${li(["Esc"], "Close what's open", U)}
    <h4>${esc(T("Game controller"))}</h4>${li(["A"], "Jump", M)}${li(["X", "B", "Y"], "Attack, dodge, the skill", M)}${li(["LB", "RB"], "Change the skill", M)}${li(["LT", "RT"], "Health and mana potions", M)}${li(["▲", "▼"], "Emotes and lines to say, enter a shop", A)}${li(["Start", "View"], "Map, Adventure log", U)}
    <h4>${esc(T("Building on your island"))}</h4>${li(["B"], "Build mode on and off", B)}${li(["Tab"], "All bricks", B)}${li(["R"], "Rotate the brick", B)}${li(["X"], "Remove tool", B)}${li(["C"], "Paint tool", B)}${li(["V"], "Pick a brick and its colour", B)}${li(["G"], "Mirror", B)}${li(["L"], "Layer lock", B)}${li(["Ctrl", "Z"], "Undo", B)}
  </ul>`;
  const mouse = `<div class="wp-guide-mouse"><svg viewBox="0 0 100 150" aria-hidden="true"><rect x="8" y="6" width="84" height="138" rx="42" fill="#3b3f47" stroke="#22252b" stroke-width="3"/><path d="M50 6v52M8 58h84" stroke="#22252b" stroke-width="3"/><path d="M50 9a41 41 0 0 0-39 46h39z" fill="#ffd34d"/><path d="M50 9a41 41 0 0 1 39 46H50z" fill="#7ea3ff"/><rect x="44" y="20" width="12" height="26" rx="6" fill="#6fdc8c" stroke="#22252b" stroke-width="2.5"/></svg>
    <ul class="wp-guide-legend">${li([W("Drag")], "Look around", U)}${li([W("Wheel")], "Zoom in and out", U)}${li([W("Click")], "Building: place a brick", A)}${li([TW("Right-click")], "Building: remove a brick", B)}</ul></div>`;
  const touch = `<div class="wp-guide-touch"><svg viewBox="0 0 200 380" aria-hidden="true"><rect x="6" y="6" width="188" height="368" rx="30" fill="#141a24" stroke="#3b3f47" stroke-width="5"/><rect x="18" y="40" width="82" height="300" rx="12" fill="rgba(255,95,115,.18)" stroke="#ff5f73" stroke-dasharray="6 5"/><rect x="100" y="40" width="82" height="200" rx="12" fill="rgba(111,220,140,.15)" stroke="#6fdc8c" stroke-dasharray="6 5"/><circle cx="58" cy="270" r="30" fill="none" stroke="#ff5f73" stroke-width="4"/><circle cx="58" cy="270" r="12" fill="#ff5f73"/><circle cx="160" cy="320" r="17" fill="#52d4e3" stroke="#3b2416" stroke-width="3"/><circle cx="124" cy="296" r="11" fill="#ff5f73" stroke="#3b2416" stroke-width="3"/><circle cx="124" cy="266" r="11" fill="#ffd34d" stroke="#3b2416" stroke-width="3"/><circle cx="150" cy="266" r="11" fill="#7ea3ff" stroke="#3b2416" stroke-width="3"/><circle cx="176" cy="266" r="11" fill="#ffa86a" stroke="#3b2416" stroke-width="3"/><text x="58" y="225" fill="#ffb3bd" font-size="15" font-weight="700" text-anchor="middle">${esc(W("Move"))}</text><text x="141" y="140" fill="#b4f0c4" font-size="15" font-weight="700" text-anchor="middle">${esc(W("Look"))}</text></svg>
    <ul class="wp-guide-legend">${li(["◐"], "Left thumb: drag to walk (push far to run)", M)}${li(["◑"], "Right side: drag to look around", U)}${li(["⇲⇱"], "Two fingers: pinch to zoom", U)}
      <h4>${esc(W("Buttons"))}</h4>${li(["↑"], "Jump", ["#52d4e3", "#06222a"])}${li(["▶"], "Run on and off", M)}${li(["✋"], "Emotes: wave, sit, point…", A)}${li(["⏏"], "Hoverboard", B)}${li(["◉"], "Photo mode", ["#ffa86a", "#3b2416"])}${li(["⚔"], "Attack, and the skill slot (hold it to change the skill)", ["#ff6b6b", "#3b0a12"])}
      <h4>${esc(T("Building on your island"))}</h4>${li([W("Tap")], "Place a brick with the tool you picked", B)}</ul></div>`;
  guide.innerHTML = `<div class="wp-guide-card"><h2 id="wp-guide-h">${esc(T("How to play"))}</h2><p>${esc(T("You can open this again any time from Settings."))}</p>
    <nav class="wp-guide-tabs"><button type="button" data-g="kb">${esc(T("Keyboard and mouse"))}</button><button type="button" data-g="touch">${esc(T("Touch screen"))}</button></nav>
    <section data-p="kb"><div class="wp-kb">${kb}</div>${legend}${mouse}</section><section data-p="touch" hidden>${touch}</section>
    <button type="button" class="wp-cta wp-guide-go" id="wp-guide-go">${esc(T("Got it, let's play"))}</button></div>`;
  document.body.appendChild(guide);
}
function guideTab(t) { guide.querySelectorAll("[data-g]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.g === t))); guide.querySelectorAll("[data-p]").forEach((p) => { p.hidden = p.dataset.p !== t; }); }
function openGuide() { guideTab(coarse ? "touch" : "kb"); guide.hidden = false; frozen = true; keys.clear(); paintPrompt(); setTimeout(() => $("wp-guide-go").focus({ preventScroll: true }), 60); }
function closeGuide() { if (guide.hidden) return; guide.hidden = true; frozen = false; if (!P.guideSeen) { P.guideSeen = true; save(); setNameTag(); } firstRun(false); setTimeout(() => arclShop.maybeDaily(), 600); }
guide.addEventListener("click", (e) => { const b = e.target.closest("[data-g]"); if (b) guideTab(b.dataset.g); if (e.target.id === "wp-guide-go" || e.target === guide) closeGuide(); });
// first time in: after the sign-in and the character maker
function maybeGuide() { if (!P.guideSeen && auth.hidden && make.hidden && guide.hidden) setTimeout(() => { if (!P.guideSeen && auth.hidden && make.hidden) quickStart(); }, 500); }
// b-st1: the screen's buttons hidden on a first visit (the maker and the first cards over the world alone), then they
// come in one after another
function firstRun(on) {
  if (on) { document.body.classList.add("wp-first"); return; }
  if (!document.body.classList.contains("wp-first")) return;
  document.body.classList.remove("wp-first"); document.body.classList.add("wp-hudin"); setTimeout(() => document.body.classList.remove("wp-hudin"), 2200);
  startSweep();
}
/// b-st2: as you start, the camera swings round from in front of your hero to its place behind (the landing's slow follow)
function startSweep(ms = 1800) {
  if (reduce || introOn || mode !== "hub") return;
  const a = camYaw + Math.PI * 0.62; cam.position.set(at.x - Math.sin(a) * 5.5, at.y + 2.6, at.z - Math.cos(a) * 5.5); landUntil = performance.now() + ms;
}
let qsAt = 0; // b-st3: when the how-to closed
/// b-st3: back on another day: a card that slides in at the top (your name, how long you were away, what's on next), 6 s
function welcomeBack(days) {
  if (!P.char || document.querySelector(".wp-wb")) return; const ev = plazaEvents()[0], lp = lastPos();
  const el = document.createElement("div"); el.className = "wp-wb"; el.setAttribute("role", "status");
  el.innerHTML = `<b>${esc(TW("Welcome back, {x}!", { x: P.name || TW("hero") }))}</b><small>${esc(days > 1 ? TW("{n} days since your last visit", { n: days }) : TW("Good to see you again today"))}${fountDay() !== tipDay() ? " · " + esc(TW("today's fountain coin is waiting")) : ""}</small>${ev ? `<em>${ev.ic} ${esc(ev.t)} · ${esc(ev.live ? TW("now") : evLeft(ev.at))}</em>` : ""}${lp ? `<button type="button" data-wb="last">📍 ${esc(TW("Back to where I left"))}</button>` : ""}`;
  // b-st3: the spawn choice: the plaza (where you are), or back to where you left off last time (a spot in town)
  el.addEventListener("click", (e) => { if (!e.target.closest('[data-wb="last"]') || !lp || mode !== "hub" || flying || introOn) return; standAt(lp.x, lp.z, { x: lp.x + Math.sin(lp.f || 0), z: lp.z + Math.cos(lp.f || 0) }); vfx.teleport(here(), { color: 0x7fe9ff, color2: 0x2f86ff }); startSweep(1200); el.classList.remove("on"); });
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on")); setTimeout(() => el.classList.remove("on"), lp ? 9000 : 6000); setTimeout(() => el.remove(), lp ? 9600 : 6600);
  if (Snd.quest) Snd.quest();
}
/// b-st3: where you were in town (not the plaza, not a land), kept every 20 s and as the page goes, for "back to where I left"
const LASTPOS = "arc.world.lastpos";
function keepPos() { try { if (!landed || mode !== "hub" || landNow || flying || introOn) return; const x = -planet.position.x, z = -planet.position.z; if (Math.hypot(x, z) < 24) return; localStorage.setItem(LASTPOS, JSON.stringify({ x: +x.toFixed(1), z: +z.toFixed(1), f: +facing.toFixed(2), at: Date.now() })); } catch { /* private */ } }
every(20000, keepPos); addEventListener("pagehide", keepPos);
const lastPos = () => { try { const p = JSON.parse(localStorage.getItem(LASTPOS) || "null"); return p && Date.now() - p.at < 7 * 864e5 && Math.hypot(p.x, p.z) >= 24 && !LD.landAt(p.x, p.z) ? p : null; } catch { return null; } };
/// b-st3: what's on next round town (all on the clock, so every player sees the same): the fountain's show on the hour,
/// Jurassic's boss hour (12:00 and 20:00 Seoul), poker's Sit & Go (even UTC hours), the Pumpkin Kings' night (20:00 US Eastern)
function plazaEvents(now = Date.now()) {
  const ev = [], d = new Date(now), day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  ev.push({ ic: "⛲", t: TW("The fountain's show"), at: now + 3600e3 - (now % 3600e3) });
  for (const h of [3, 11]) { let t = day0 + h * 3600e3; if (t + 30 * 60e3 < now) t += 864e5; ev.push({ ic: "🦖", t: TW("Jurassic boss hour"), at: t, live: t <= now }); }
  { const h = d.getUTCHours(); ev.push({ ic: "🃏", t: TW("Poker Sit & Go"), at: day0 + (h + (h % 2 ? 1 : 2)) * 3600e3 }); }
  let co = false; try { co = cityOk; } catch { /* not declared yet: still loading */ }
  if (co) for (const h of [3, 12]) { let t = day0 + h * 3600e3; if (t + 60 * 60e3 < now) t += 864e5; ev.push({ ic: "🏟️", t: TW("Agent Arena hour"), at: t, live: t <= now }); } /* (12:00 and 21:00 Seoul: api/_world-agarena.mjs ARENA.HOURS) */
  let pk = null; try { pk = pumpKings; } catch { /* not declared yet: still loading */ }
  if (pk) { const eh = etHour(now), live = eh >= 20 || eh < 5; ev.push({ ic: "🎃", t: TW("The Pumpkin Kings wake"), at: live ? now : now + (20 - eh) * 3600e3, live }); }
  return ev.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || a.at - b.at);
}
const evLeft = (at) => { const m = Math.max(0, Math.round((at - Date.now()) / 60e3)); return m >= 60 ? TW("in {h} h {m} min", { h: Math.floor(m / 60), m: m % 60 }) : TW("in {m} min", { m }); };
// on a phone the top row is full (brand, level, buttons): the pill goes just under the quest card (or the HP card),
// centred, where it clears the minimap; a computer has room at the top centre
function placePill(pill) {
  if (!document.documentElement.classList.contains("wp-pcphone")) { pill.style.top = ""; return; }
  let y = 0; for (const e of [...document.querySelectorAll(".wp-hud-l > *"), document.getElementById("wp-qmini"), document.getElementById("wc-vit"), document.querySelector(".wp-chips")]) { /* (everything in the left column, the folded quest button too: the boss bar sat on it, the owner's phone 2026-10-24) */ if (!e || !e.getClientRects().length) continue; const r = e.getBoundingClientRect(); if (r.height > 0) y = Math.max(y, r.bottom); }
  pill.style.top = y ? Math.round(y + 14) + "px" : "";
}
addEventListener("resize", () => { const p = document.getElementById("wp-evt"); if (p && !p.hidden) placePill(p); });
// phone HUD (the owner's call 2026-10-24): one notice at a time, in one place under the top cards (the boss call, the egg,
// the agent, the events pill take turns, 6 s each); while a boss's bar is up it has that place to itself
const NQ = [".wp-bosscall", ".wp-dinochip", ".wag-chip", "#wp-evt"]; let nqI = 0, nqAt = 0, nqTop = 0;
function noticeSlot() { let y = 0; for (const e of [...document.querySelectorAll(".wp-hud-l > *"), document.getElementById("wp-qmini"), document.getElementById("wc-vit"), document.querySelector(".wp-chips")]) { /* (everything in the left column, the folded quest button too: the boss bar sat on it, the owner's phone 2026-10-24) */ if (!e || !e.getClientRects().length) continue; const r = e.getBoundingClientRect(); if (r.height > 0) y = Math.max(y, r.bottom); } return y ? Math.round(y + 20) : 0; }
const nqSeen = new WeakSet(), nqObs = typeof MutationObserver === "function" ? new MutationObserver(() => nqRun()) : null; /* (a notice or the boss bar shown or hidden: the slot is sorted at once, not on the next second) */
every(1000, () => nqRun());
function nqRun() { try {
  const ph = document.documentElement.classList.contains("wp-pcphone"), els = NQ.map((q) => document.querySelector(q)).filter(Boolean);
  if (nqObs) for (const e of [...els, document.getElementById("wc-boss")]) if (e && !nqSeen.has(e)) { nqSeen.add(e); nqObs.observe(e, { attributes: true, attributeFilter: ["hidden", "class"] }); }
  if (!ph) { for (const e of els) if (e.classList.contains("wp-nq-off")) e.classList.remove("wp-nq-off"); return; } /* (only when it is there: remove() writes the class even when nothing changes, the observer above saw that and called this again — an endless loop that froze every computer at 80 %, 2026-10-25) */
  const y = noticeSlot(); if (y && y !== nqTop) { nqTop = y; document.documentElement.style.setProperty("--nq-top", y + "px"); }
  { const mm = document.querySelector(".wp-mini"), r = mm && mm.getClientRects().length ? mm.getBoundingClientRect() : null, right = r && r.bottom > y && r.top < y + 90 ? Math.round(r.left - 14) : innerWidth - 18; /* (the room left of the minimap) */
    const R = document.documentElement.style; if (R.getPropertyValue("--nq-r") !== right + "px") { R.setProperty("--nq-r", right + "px"); R.setProperty("--nq-cx", Math.round((18 + right) / 2) + "px"); R.setProperty("--nq-w", (right - 18) + "px"); } }
  const boss = document.getElementById("wc-boss"), bossOn = !!(boss && !boss.hidden), live = els.filter((e) => !e.hidden);
  const call = live.find((e) => e.matches(".wp-bosscall")); let show = null;
  if (call) show = call; else if (!bossOn && live.length) { if (Date.now() - nqAt > 6000) { nqI++; nqAt = Date.now(); } show = live[nqI % live.length]; }
  for (const e of els) { const off = e !== show; if (e.classList.contains("wp-nq-off") !== off) e.classList.toggle("wp-nq-off", off); }
  if (show && y) { const z = Number(getComputedStyle(show).zoom) || 1, t = Math.round(y / z) + "px"; if (show.style.top !== t) show.style.top = t; }
} catch { /* the next second */ } }
// the pill at the top of the screen: the next three, one at a time (in town only). Off since 2026-10-24 (the owner: it
// stood over the middle of the screen); the schedule is still in the events list and the start's welcome card
const EVT_PILL = false;
{ const pill = document.createElement("div"); pill.className = "wp-evt"; pill.id = "wp-evt"; pill.setAttribute("aria-live", "off"); pill.hidden = true; document.body.appendChild(pill); let i = 0;
  every(6000, () => { try { const on = EVT_PILL && landed && mode === "hub" && !frozen && !introOn && !document.body.classList.contains("wp-first"); pill.hidden = !on; if (!on) return;
    const L = plazaEvents().slice(0, 3), e = L[i++ % L.length]; if (!e) return; pill.innerHTML = `<span>${e.ic}</span><b>${esc(e.t)}</b><small class="${e.live ? "live" : ""}">${esc(e.live ? TW("now") : evLeft(e.at))}</small>`; placePill(pill); pill.classList.remove("in"); void pill.offsetWidth; pill.classList.add("in"); } catch { /* next time */ } }); }
/// b-st3: a coin launched on ArcPad in the last 15 minutes: fireworks over the plaza, once per coin on this device
function launchFireworks(c) {
  if (!c || !c.launchedAt || Date.now() - c.launchedAt > 15 * 60e3 || mode !== "hub" || reduce) return; const k = "arc.world.fw." + String(c.token || c.symbol || "").slice(0, 46);
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, "1"); } catch { return; }
  const C = [0x38d8ff, 0x2ee0a0, 0xffc861, 0xff7ab6, 0x9b8cff];
  for (let n = 0; n < 7; n++) setTimeout(() => { try { vfx.burst(new THREE.Vector3((Math.random() - 0.5) * 14, 14 + Math.random() * 6, (Math.random() - 0.5) * 14), C[n % C.length], true); if (Snd.pop) Snd.pop(); } catch { /* fine */ } }, n * 420);
  feed(`🚀 ${esc(TW("New launch on ArcPad"))}: <b>$${esc(c.symbol || "")}</b>`, "#ffc861");
}
/// b-st3: a coin in the fountain, once a Seoul day: a wish, the jets leap, 10 ARCL (the server checks the day: arcl-claim "fountain")
const WISHES = ["May your next chest be golden.", "May the scammers never find your wallet.", "May your hero level up twice today.", "May your island be the week's best.", "May your dino hatch strong.", "May the river card be yours."];
const fountDay = () => { try { return localStorage.getItem("arc.world.fount") || ""; } catch { return ""; } };
function tossCoin() {
  if (fountDay() === tipDay()) return; try { localStorage.setItem("arc.world.fount", tipDay()); } catch { /* private: once this visit */ } near = null; paintPrompt();
  try { fountain.userData.burst(5); vfx.burst(new THREE.Vector3(0, 2.4, 0), 0xffc861, true); if (Snd.coin) Snd.coin(); if (avatar && !(avatar.busy && avatar.busy())) avatar.play("cast", { once: true }); } catch { /* fine */ }
  toast(`⛲ <b>${esc(TW(WISHES[Math.floor(Math.random() * WISHES.length)]))}</b>`);
  arclShop.claim("fountain", {}, null);
}
/// b-st2: a portal's pull: the screen flashes its colour from the middle out (CSS, gone in 0.7 s)
function pullFlash(c) { if (reduce) return; const f = document.createElement("div"); f.className = "wp-pull"; f.style.setProperty("--c", c); f.setAttribute("aria-hidden", "true"); document.body.appendChild(f); setTimeout(() => f.remove(), 800); }
/// b-st2: the first arrival: a big welcome over the plaza and confetti (DOM, gone in 3 s)
function welcomeBurst() {
  if (reduce) return; const w = document.createElement("div"); w.className = "wp-welcome"; w.setAttribute("aria-hidden", "true");
  const C = ["#38d8ff", "#2ee0a0", "#ffc861", "#ff7ab6", "#9b8cff", "#ffffff"];
  w.innerHTML = `<b>${esc(TW("Welcome!"))}</b><small>ARCIRCLE WORLD</small>` + Array.from({ length: 46 }, (_, i) => `<i style="--x:${(Math.random() * 2 - 1).toFixed(2)};--y:${(0.4 + Math.random()).toFixed(2)};--r:${Math.round(Math.random() * 720 - 360)}deg;--d:${(Math.random() * 0.3).toFixed(2)}s;background:${C[i % C.length]}"></i>`).join("");
  document.body.appendChild(w); setTimeout(() => w.classList.add("out"), 2300); setTimeout(() => w.remove(), 3000);
}
// b-st1: the first-time guide: three cards (move, jump, attack) for this screen; "All controls" opens the full one
function quickStart() {
  if (document.querySelector(".wp-qs")) return;
  const tc = coarse, cards = tc
    ? [["🕹️", TW("Move"), TW("Drag the stick on the left. Push it far to run.")], ["⤴️", TW("Jump"), TW("Tap the big blue arrow.")], ["🗡️", TW("Attack"), TW("Tap the red sword near a scammer.")]]
    : [["⌨️", TW("Move"), TW("W A S D or the arrow keys. Hold Shift to run.")], ["⤴️", TW("Jump"), TW("Space.")], ["🗡️", TW("Attack"), TW("J, or click the red sword near a scammer.")]];
  const el = document.createElement("div"); el.className = "wp-qs"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", TW("How to play"));
  el.innerHTML = `<div class="wp-qs-in"><small>${esc(TW("Welcome to ARCIRCLE WORLD"))}</small><b>${esc(TW("Three things to start"))}</b>
    <ol>${cards.map(([ic, t, p0], i) => `<li style="--i:${i}"><span aria-hidden="true">${ic}</span><div><b>${esc(t)}</b><p>${esc(p0)}</p></div></li>`).join("")}</ol>
    <div class="wp-qs-row"><button type="button" class="wp-btn" data-qs="all">${esc(TW("All controls"))}</button><button type="button" class="wp-cta" data-qs="go">${esc(TW("Let's go!"))}</button></div></div>`;
  frozen = true; keys.clear(); paintPrompt();
  const done = (all) => { fun("start"); qsAt = Date.now(); el.classList.add("out"); setTimeout(() => el.remove(), 260); frozen = false; if (all) { openGuide(); return; } if (!P.guideSeen) { P.guideSeen = true; save(); } firstRun(false); setNameTag(); setTimeout(() => arclShop.maybeDaily(), 600); };
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-qs]"); if (b) done(b.dataset.qs === "all"); });
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on")); setTimeout(() => { const g = el.querySelector('[data-qs="go"]'); if (g) g.focus({ preventScroll: true }); }, 80);
}

// phones: the compact (PC-style) layout or the large one; applied on reload (play.html sets the viewport)
const VP = (() => { try { return localStorage.getItem("arc.world.vp") || "pc"; } catch { return "pc"; } })();
// the screen on a computer (play.html, world-shell.js): the whole window, a smaller window, or a phone; the page around
// the game is reloaded with the choice
{ const cur = window.__arcFrame || "full";
  if (window.__arcFrame || !coarse) {
    $("wp-set-view-row").hidden = false; $("wp-set-view-l").textContent = T("Screen");
    $("wp-set-view").querySelectorAll("button").forEach((b) => { b.textContent = T({ full: "Full", window: "Window", mobile: "Mobile" }[b.dataset.view]); b.setAttribute("aria-pressed", String(b.dataset.view === cur)); });
    $("wp-set-view").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (!b || b.dataset.view === cur) return; try { localStorage.setItem("arc.world.view", b.dataset.view); } catch { /* private */ } window.top.location.reload(); });
  } }
if (coarse && window.__arcFrame !== "mobile") { $("wp-set-vp-row").hidden = false; $("wp-set-vp").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vp === VP))); }
$("wp-set-guide").addEventListener("click", () => { closeSet(); openGuide(); });
$("wp-set-vp").addEventListener("click", (e) => { const b = e.target.closest("button[data-vp]"); if (!b || b.dataset.vp === VP) return; try { localStorage.setItem("arc.world.vp", b.dataset.vp); } catch { /* private */ } location.reload(); });
$("wp-set-snd").addEventListener("change", (e) => Snd.set(e.target.checked));
$("wp-set-music").value = String(S.music ?? 55);
$("wp-set-music").addEventListener("input", (e) => { S.music = Math.round(Number(e.target.value)); music.setVolume(musicVol()); });
Snd.settings(T); // Sound effects and Footsteps, under Music (world-sfx.js)
$("wp-set-music").addEventListener("change", () => { saveSet(); music.start(); });
// vibration on a phone: a hit taken, a boss's strike, a charged attack, a bite on the line, a crit, a level up (off in Settings;
// its own switch: Less motion leaves it on)
// only while you're playing: nothing buzzes when the phone just sits there (a scammer wandering up, a boss's miss)
let lastInput = 0; for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true, capture: true });
const buzz = (ms) => { if (S.vib === false || !navigator.vibrate || performance.now() - lastInput > 4000 || document.hidden) return; try { navigator.vibrate(ms); } catch { /* not allowed */ } };
if (navigator.vibrate && matchMedia("(pointer: coarse)").matches) { $("wp-set-vibrow").hidden = false; $("wp-set-vib").checked = S.vib !== false; $("wp-set-vib").addEventListener("change", (e) => { S.vib = e.target.checked; saveSet(); if (S.vib) buzz(30); }); }
$("wp-set-showname").addEventListener("change", (e) => { S.showName = !!e.target.checked; saveSet(); });
// easier to read: larger text across the HUD and the windows; colours that don't lean on red against green
const paintA11y = () => { document.documentElement.classList.toggle("wp-big", !!S.big); document.documentElement.classList.toggle("wp-cb", !!S.cb); };
paintA11y();
$("wp-set-big").addEventListener("change", (e) => { S.big = !!e.target.checked; saveSet(); paintA11y(); });
$("wp-set-cb").addEventListener("change", (e) => { S.cb = !!e.target.checked; saveSet(); paintA11y(); });
// the tutorial again from the first step (its XP was given the first time, so not again)
$("wp-set-tut").addEventListener("click", () => { P.tut = 0; P.tutBits = 0; P.tutAgain = true; save(); closeSet(); tutorialStep(-1); setTimeout(openGuide, 300); });
$("wp-set-motion").addEventListener("change", (e) => { S.motion = e.target.checked ? "less" : ""; saveSet(); $("wp-set-q-note").innerHTML = `${esc(T("Applies after a reload."))} <button type="button" class="wp-link" id="wp-set-reload">${esc(T("Reload now"))}</button>`; });
$("wp-set-sens").addEventListener("input", (e) => { S.sens = +e.target.value; saveSet(); });
// b448: phones fold the photo, hoverboard and wave buttons behind "⋯" (eight buttons sat in the bottom-right corner)
{ const acts = $("wp-acts"), more = $("wp-act-more");
  if (acts && more) {
    // "⋯" takes the wave button's own place (read from the layout, which the phone CSS sets), and the wave button
    // rises just above it when the fold opens
    const emo = $("wp-act-emote"); let slot = null;
    const place = () => { if (!document.documentElement.classList.contains("wp-pcphone") || !emo) return; const was = acts.classList.contains("open"); acts.classList.add("open"); emo.style.bottom = ""; const cs = getComputedStyle(emo); slot = { r: cs.right, b: cs.bottom, h: emo.offsetHeight }; more.style.right = slot.r; more.style.bottom = slot.b; fold(was); }; /* (read while open: a hidden button has no size) */
    const fold = (open) => { acts.classList.toggle("open", open); more.setAttribute("aria-expanded", String(open)); if (emo && slot) emo.style.bottom = open ? `calc(${slot.b} + ${Math.round(slot.h * 1.15)}px)` : ""; };
    setTimeout(place, 0); addEventListener("orientationchange", () => setTimeout(place, 300)); // (not on resize: reading the layout there fed back into itself)
    more.addEventListener("click", (e) => { e.stopPropagation(); fold(!acts.classList.contains("open")); });
    acts.addEventListener("click", (e) => { if (e.target.closest(".wp-act-board,.wp-act-emote,.wp-act-photo")) setTimeout(() => fold(false), 150); });
    addEventListener("pointerdown", (e) => { if (acts.classList.contains("open") && !e.target.closest("#wp-acts")) fold(false); }, true);
  } }
// b443: the fixed joystick's size and height (phones): CSS variables on <html>; restAt() reads the ring's real box, and
// the knob's reach grows with the ring
const joyApply = () => { const k = [0.85, 1, 1.2].includes(+S.joyK) ? +S.joyK : 1, up = Math.max(0, Math.min(240, +S.joyUp || 0)); document.documentElement.style.setProperty("--joy-k", k); document.documentElement.style.setProperty("--joy-up", up + "px"); joyMax = JOYMAX * k; joyK = k; };
addEventListener("resize", () => { const pcp = document.documentElement.classList.contains("wp-pcphone"), want = pcp ? 118 : 56; if (JOYMAX !== want) { JOYMAX = want; TOUCHK = want / 56; joyMax = JOYMAX * joyK; } });
$("wp-set-joyk").addEventListener("change", (e) => { S.joyK = +e.target.value; saveSet(); joyApply(); });
$("wp-set-joyup").addEventListener("input", (e) => { S.joyUp = +e.target.value; saveSet(); joyApply(); });
joyApply();
$("wp-set-char").addEventListener("click", () => { closeSet(); openMake(); });
let resetArm = 0;
$("wp-set-reset").addEventListener("click", (e) => {
  if (Date.now() - resetArm > 3000) { resetArm = Date.now(); e.currentTarget.textContent = T("Tap again to reset"); return; }
  try { localStorage.removeItem(SAVE); localStorage.setItem("arc.world.reset", "1"); } catch { /* private */ } location.reload();
});
// photo mode: the HUD steps aside, drag to frame the shot, then save or share it
let photoFilter = "none", photoSticker = 0, photoHour = null, photoDof = 0;
// photo mode's focus (world-post.js): you stay sharp, the background (and anything right in front) softens
{ const pw = new THREE.Vector3(); st.on(() => { if (!fxPost || !fxPost.setDof) return; if (!photo || !photoDof) { if (fxPost.dof && fxPost.dof.enabled) fxPost.setDof(null); return; } player.getWorldPosition(pw); pw.y += 1; const d = st.camera.position.distanceTo(pw); fxPost.setDof({ focus: d, range: photoDof === 2 ? Math.max(1.2, d * 0.18) : Math.max(2, d * 0.35), blur: photoDof === 2 ? 12 : 7 }); }); }
const photoStickers = () => ["", quests && quests.title(), (P.rpg && P.rpg.x && P.rpg.x.ach || []).includes("raid1") ? T("Raid Breaker") : "", P.rpg && P.rpg.x && P.rpg.x.stitle ? T("Season Star") : "", "ARCIRCLE World"].filter((x, i) => i === 0 || x);
{ // filters, a sticker and a pose (built here so the words come from the game's own maps)
  const o = document.createElement("div"); o.className = "wp-photo-opts"; o.setAttribute("data-no-i18n", "");
  o.innerHTML = `<div><span>${esc(W("Filter"))}</span>${["none", "warm", "cool", "noir", "neon", "film", "vivid"].map((f) => `<button type="button" data-pf="${f}" aria-pressed="${f === "none"}">${esc(W(f[0].toUpperCase() + f.slice(1)))}</button>`).join("")}</div>
    <div><span>${esc(W("Time"))}</span>${[["", "Now"], [7, "Morning"], [13, "Noon"], [18.3, "Dusk"], [22, "Night"]].map(([h, n]) => `<button type="button" data-ph="${h}" aria-pressed="${h === ""}">${esc(W(n))}</button>`).join("")}</div>
    <div><span>${esc(W("Sticker"))}</span><button type="button" id="wp-photo-sticker">${esc(W("None"))}</button><span>${esc(W("Pose"))}</span>${[["emote-yes", "Wave"], ["sit", "Sit"], ["interact-right", "Point"]].map(([a, n]) => `<button type="button" data-pp="${a}">${esc(W(n))}</button>`).join("")}</div><div class="wp-photo-dof"><span>${esc(W("Focus"))}</span>${[["0", "Off"], ["1", "Soft"], ["2", "Strong"]].map(([v, n]) => `<button type="button" data-pd="${v}" aria-pressed="${v === "0"}">${esc(W(n))}</button>`).join("")}</div>`;
  $("wp-photo-bar").prepend(o);
  o.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.pf) { photoFilter = b.dataset.pf; o.querySelectorAll("[data-pf]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cv.style.filter = SOC.PHOTO_FILTERS[photoFilter] || ""; }
    else if (b.dataset.ph != null) { photoHour = b.dataset.ph === "" ? null : Number(b.dataset.ph); o.querySelectorAll("[data-ph]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); nightK = -1; dayNight(); } // the light of another hour, for this photo
    else if (b.id === "wp-photo-sticker") { const l = photoStickers(); photoSticker = (photoSticker + 1) % l.length; b.textContent = l[photoSticker] || W("None"); }
    else if (b.dataset.pp && avatar) avatar.play(b.dataset.pp, { once: b.dataset.pp !== "sit" });
    else if (b.dataset.pd != null) { photoDof = Number(b.dataset.pd); o.querySelectorAll("[data-pd]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); if (!fxPost && photoDof) toast(T("Focus blur needs Medium quality or higher (Settings)")); }
  });
}
function setPhoto(on) {
  photo = on; document.body.classList.toggle("wp-photo", on); $("wp-photo-bar").hidden = !on;
  if (!on) { cv.style.filter = ""; if (photoHour != null) { photoHour = null; nightK = -1; dayNight(); document.querySelectorAll("[data-ph]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.ph === ""))); } }
  frozen = on; keys.clear(); paintPrompt();
  if (on) toast(T("Photo mode: drag to frame, scroll to zoom"));
}
$("wp-photo-exit").addEventListener("click", () => setPhoto(false));
$("wp-photo-take").addEventListener("click", async () => {
  const bar = $("wp-photo-bar"); bar.hidden = true; Snd.shutter();
  const raw = await st.snap(); bar.hidden = false; if (!raw) return;
  const opt = { name: P.name || "", lv: level(), where: mode === "island" ? island.title() : $("wp-mini-n").textContent || "", filter: photoFilter, sticker: photoStickers()[photoSticker] || "" };
  // the version on screen is made first; the other one only when the frame is switched
  shotSrc = raw; shotOpt = opt; shotRaw = shotFramed = null;
  if (shotFrame) shotFramed = await SOC.frameShot(raw, opt).catch(() => raw); else shotRaw = await SOC.frameShot(raw, { ...opt, frame: false }).catch(() => raw);
  $("wp-shot-frame").hidden = false; $("wp-shot-frame").setAttribute("aria-pressed", String(shotFrame));
  showShot(shotFrame ? shotFramed : shotRaw);
});
// the photo (or card) sheet: save, share, post on X; a photo can wear the game's frame or not
let shotRaw = null, shotFramed = null, shotFrame = true, shotUrl = "", shotSrc = null, shotOpt = {};
function showShot(blob, text) {
  if (shotUrl) URL.revokeObjectURL(shotUrl);
  const msg = text || T("Walking ARCIRCLE World on Circle's Arc ♾");
  shotUrl = URL.createObjectURL(blob); $("wp-shot-img").src = shotUrl; $("wp-shot-dl").href = shotUrl;
  $("wp-shot-x-post").href = "https://x.com/intent/tweet?text=" + encodeURIComponent(msg) + "&url=" + encodeURIComponent("https://www.arcircle.app/play");
  const file = new File([blob], "arcircle-world.png", { type: "image/png" });
  $("wp-shot-share").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  $("wp-shot-share").onclick = () => navigator.share({ files: [file], text: msg, url: "https://www.arcircle.app/play" }).catch(() => {});
  $("wp-shot-frame").hidden = !!text || !shotSrc;
  $("wp-shot-h").textContent = text ? T("Your card") : T("Your photo");
  $("wp-shot").hidden = false;
}
$("wp-shot-frame").addEventListener("click", async () => {
  if (!shotSrc) return; shotFrame = !shotFrame; $("wp-shot-frame").setAttribute("aria-pressed", String(shotFrame));
  if (shotFrame && !shotFramed) shotFramed = await SOC.frameShot(shotSrc, shotOpt).catch(() => shotSrc);
  if (!shotFrame && !shotRaw) shotRaw = await SOC.frameShot(shotSrc, { ...shotOpt, frame: false }).catch(() => shotSrc);
  showShot(shotFrame ? shotFramed : shotRaw);
});
$("wp-shot-x").addEventListener("click", () => { $("wp-shot").hidden = true; shotRaw = shotFramed = shotSrc = null; });

// ---------------- what's new: once after an update, a card with a way to try each new thing ----------------
const NEWV = "b398";
function maybeNew() {
  try { if (localStorage.getItem("arc.world.newv") === NEWV) return; } catch { return; }
  if (!P.char || !P.guideSeen || new URLSearchParams(location.search).has("nointro")) return;
  autoShow("new", 20, () => openNew());
}
function openNew() {
  // the newest three first; everything older folds under "Earlier updates" (a long list was a wall of text on phones)
  const top = [
    ["gv", TW("The Game Village"), TW("A new village west of the plaza for mini-games. AC Defense is the first tower: walk in and defend the Core.")],
    ["pets", TW("Pets"), TW("Hatch companions from eggs, 27 to collect. Each one follows you and helps in its own way.")],
    ["chat", TW("Friends and chat"), TW("Talk with players near you, send 1:1 messages and add friends.")],
  ];
  const items = [
    ["hud", T("A new look on screen"), T("Your portrait and level up top, Shop, Map and Menu tiles, a minimap with north and zoom, and a dock for Character, Bag, Craft and Build.")],
    ["village", T("Your island is a village"), T("Decorate it to raise its score and level. Its village centre grows with it, and each level blesses you with more XP and max HP.")],
    ["contest", T("The weekly village contest"), T("Enter your village each week; the best ones win ARCL (50,000 the first week).")],
    ["buttons", T("Character, Log and Village buttons"), T("One tap from the top bar. Bought bricks and styles now ask if you'd like to build with them right away.")],
    ["card", T("Player cards"), T("A player's card shows the gear they wear and every title they've earned. Yours: Character → My card.")],
    ["inspect", T("Every piece in 3D"), T("Armour, rings and necklaces turn in 3D on their card in the bag, like weapons.")],
    ["crew", T("Crews"), T("Found a crew or join one with its code: a tag before your name and a weekly table. The menu → Crew.")],
    ["master", T("The Forge grows"), T("The Legendary Arc set from level 20, and a Masterwork bench that makes gear at your level, up to +10.")],
    ["lock", T("Lock-on and sharper fights"), T("Tab or the target button locks on; crescent slashes, afterimages when you dodge, elites with an element.")],
    ["bag", T("Storage and gear sets"), T("48 places of storage, two gear sets to swap in one tap, and a bigger bag for $ARCIRCLE.")],
    ["live", T("The town, live"), T("$ARCIRCLE's price, burns and new launches turn round the fountain; fireworks for every launch.")],
    ["sky", T("Weather and seasons"), T("Lightning, rainbows, morning mist, auroras, autumn leaves, and Halloween from 17 October.")],
    ["ko", T("Knockouts"), T("The first each day is free; after that a revive for $ARCIRCLE or a 24-hour rest.")],
  ];
  const el = document.createElement("div"); el.className = "wp-new"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  el.innerHTML = `<div class="wp-new-card"><small>${esc(W("Update"))}</small><h2>${esc(T("What's new in ARCIRCLE World"))}</h2>${(() => { const li = ([k, t, l]) => `<li><button type="button" data-new="${k}"><b>${esc(t)}</b><span>${esc(l)}</span><i aria-hidden="true">›</i></button></li>`; return `<ul>${top.map(li).join("")}</ul><details class="wp-new-more"><summary>${esc(TW("Earlier updates"))}</summary><ul>${items.map(li).join("")}</ul></details>`; })()}<button type="button" class="wp-cta" data-new="close">${esc(T("Let's play"))}</button></div>`;
  document.body.appendChild(el); frozen = true; keys.clear(); paintPrompt();
  const done = () => { el.remove(); frozen = false; try { localStorage.setItem("arc.world.newv", NEWV); } catch { /* private */ } };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-new]"); if (!b && e.target !== el) return; done(); const k = b ? b.dataset.new : "close";
    if (k === "gv") { goGameVillage(); return; } if (k === "chat") { if (chatUI) chatUI.show(); return; }
    if (k === "raid") { const z = SOC.RAID, a = Math.atan2(-z.x, -z.z); flyTo({ position: new THREE.Vector3(z.x + Math.sin(a) * (z.r + 3), 0, z.z + Math.cos(a) * (z.r + 3)), userData: { radius: 0.5 } }); }
    else if (k === "season" || k === "pets" || k === "quiz" || k === "codex") { quests.setTab(k === "quiz" ? "codex" : k); rpg.show("log"); }
    else if (k === "grounds") openMap();
    else if (k === "bench") { if (life) life.showSheet("temper"); }
    else if (k === "records") { quests.setTab("rank"); quests.setRank("fish"); rpg.show("log"); }
    else if (k === "charge" || k === "jet" || k === "party") openGuide();
    else if (k === "together") openWheel();
    else if (k === "bots") openMake();
    else if (k === "pad") openGuide();
    else if (k === "fuse") { rpg.forgeTab("fuse"); rpg.show("forge"); }
    else if (k === "crew") crewUI.show();
    else if (k === "card") { const s0 = sess(); if (s0) openProfile(String(s0.wallet).toLowerCase()); else rpg.show("inv"); }
    else if (k === "inspect") rpg.show("inv");
    else if (k === "master") { rpg.forgeTab("master"); rpg.show("forge"); }
    else if (k === "lock") openGuide();
    else if (k === "bag") rpg.show("inv");
    else if (k === "isles") island.openIsles();
    else if (k === "hud") { if (rpg) rpg.show("inv"); }
    else if (k === "village") village.show();
    else if (k === "contest") village.show("contest");
    else if (k === "buttons") rpg.show("log");
  });
}
// ---------------- closing things ----------------
// the ARCIRCLE logo (b405, a player's idea): a small menu — your island, a player's island (a random one, or the
// list), or the Platform World (where the logo used to go straight away)
const brandA = document.querySelector(".wp-brand"), brandM = document.createElement("div");
// Creator City: the top-left's logo gives its place to "Back to Game World" (straight to the town's plaza)
{ const gb = document.createElement("button"); gb.type = "button"; gb.className = "wp-back-gw"; gb.innerHTML = `<i aria-hidden="true">←</i><span>${esc(TW("Back to Game World"))}</span>`;
  gb.addEventListener("click", () => { if (frozen || landNow !== "cc") return; closeAll(); landGo("town"); });
  if (brandA && brandA.parentNode) brandA.parentNode.insertBefore(gb, brandA); }
brandM.className = "wp-brand-menu"; brandM.id = "wp-brand-menu"; brandM.hidden = true; brandM.setAttribute("role", "menu"); brandM.setAttribute("data-no-i18n", "");
function paintBrandMenu() {
  const ICON = {
    home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
    dice: '<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.4" fill="currentColor" stroke="none"/>',
    list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none"/>',
    globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.6 2.4 2.6 13.6 0 16M12 4c-2.6 2.4-2.6 13.6 0 16"/>',
  };
  const it = (k, icon, t, sub) => `<button type="button" role="menuitem" data-bm="${k}"><span class="wp-bm-i ${icon}" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON[icon]}</svg></span><span class="wp-bm-t"><b>${esc(t)}</b><small>${esc(sub)}</small></span></button>`;
  brandM.innerHTML = it("mine", "home", T("My island"), T("Build and decorate your own")) + it("random", "dice", T("Visit a random island"), T("A player's island you haven't seen")) + it("list", "list", T("Browse islands"), T("Popular, this week, friends")) + it("platform", "globe", T("Platform World"), T("Leave the game for the platform"));
}
if (brandA) {
  document.body.appendChild(brandM);
  // under the logo, in the screen's own coordinates (the HUD may be zoomed on a phone; the menu carries the same zoom)
  const placeBrandMenu = () => { const r = brandA.getBoundingClientRect(), z = parseFloat(getComputedStyle(brandM).zoom) || 1; brandM.style.left = Math.max(8, r.left) / z + "px"; brandM.style.top = (r.bottom + 8) / z + "px"; };
  addEventListener("resize", () => { if (!brandM.hidden) placeBrandMenu(); });
  brandA.setAttribute("aria-haspopup", "menu"); brandA.setAttribute("aria-expanded", "false");
  brandA.addEventListener("click", (e) => { e.preventDefault(); const open = brandM.hidden; if (open) paintBrandMenu(); brandM.hidden = !open; if (open) placeBrandMenu(); brandA.setAttribute("aria-expanded", String(open)); if (open) { const f = brandM.querySelector("button"); if (f) f.focus({ preventScroll: true }); } });
  brandM.addEventListener("click", (e) => {
    const b = e.target.closest("[data-bm]"); if (!b) return; brandM.hidden = true; brandA.setAttribute("aria-expanded", "false");
    const k = b.dataset.bm;
    if (k === "mine") goIsland({}); else if (k === "random") island.tour(); else if (k === "list") island.openIsles(); else if (k === "platform") (window.__arcFrame ? window.top : window).location.href = brandA.getAttribute("href") || "/?skip";
  });
  document.addEventListener("pointerdown", (e) => { if (!brandM.hidden && !brandM.contains(e.target) && !brandA.contains(e.target)) { brandM.hidden = true; brandA.setAttribute("aria-expanded", "false"); } });
  // role=menu: arrows (and Home/End) move between its items, wrapping round
  brandM.addEventListener("keydown", (e) => { const d = { ArrowDown: 1, ArrowUp: -1, Home: -2, End: 2 }[e.key]; if (!d) return; const bs = [...brandM.querySelectorAll("[data-bm]")]; if (!bs.length) return; e.preventDefault(); e.stopPropagation(); const i = bs.indexOf(document.activeElement); bs[d === -2 ? 0 : d === 2 ? bs.length - 1 : i < 0 ? 0 : (i + d + bs.length) % bs.length].focus({ preventScroll: true }); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !brandM.hidden) { brandM.hidden = true; brandA.setAttribute("aria-expanded", "false"); brandA.focus(); } });
}
function closeAll() { try { if (agentDim && agentDim.shown()) agentDim.close(); } catch { /* fine */ } try { if (partnerUi) partnerUi.close(); } catch { /* fine */ } try { if (!brandM.hidden) { brandM.hidden = true; brandA.setAttribute("aria-expanded", "false"); } } catch { /* fine */ } try { village.hide(); crewUI.hide(); chatUI && chatUI.hide(); } catch { /* not built yet */ } closeHub(); closeSheet(); closeMap(); endFight(); closeSet(); closeGuide(); island.closeSheets(); arclShop.close(); try { if (land) land.close(); } catch { /* not built yet */ } try { help.close(); closeLeave(); rpg && rpg.hide(); } catch { /* not built yet */ } $("wp-shot").hidden = true; }
// ---------------- the Help Center (world-support.js): ARCIA first, then a report on the public board ----------------
const help = HELP.createSupport({
  T, lang: LANG, esc, toast, where: mode === "island" ? "island" : "game",
  provider: async () => { if (AC && (!AC.live || !AC.live())) await AC.connect(); return AC ? AC.provider() : window.ethereum; }, address: () => addr(),
  capture: () => st.snap(), freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
  // ARCIA's "What should I do next?" (api/arcia.mjs pageContext): where the player is, in a few short facts
  gameState: () => {
    const shown = QUESTS.filter((q) => !q.gate || q.gate() || P.quests.includes(q.id)), open = shown.filter((q) => !P.quests.includes(q.id));
    const r = rpg ? rpg.data() : {};
    return { lv: level(), signedIn: !!sess(), quests: open.slice(0, 3).map((q) => q.t), questsDone: shown.length - open.length, questsAll: shown.length,
      potions: r.hp || 0, welcome: welcomeV ? { n: welcomeV.n, ready: !!welcomeV.ready } : null, mineRestMin: mineRest > Date.now() ? Math.ceil((mineRest - Date.now()) / 60e3) : 0, starterBoost: xpBoostUntil > Date.now() };
  },
});
function openHelp(t) { closeAll(); help.open(t); }
// ---------------- fighting (world-combat.js): street scammers, the attack, skills learned by level, street items ----------------
// floating numbers: a hit's damage rises from where it landed; quick hits in the same spot add up into one number
// that bumps as it grows (a flurry reads as one total, not a pile of digits)
const floats = [];
// an animation started again without forcing the page to lay itself out (b413: the old remove / offsetWidth / add did,
// on every merged hit, every tap and every crit): the class comes back on the next frame
const replay = (el, cls) => { if (!el) return; el.classList.remove(cls); requestAnimationFrame(() => el.classList.add(cls)); };
// (the number nodes are kept for reuse, b420: a fast fight made and dropped a dozen a second; put back in the page, one
// plays its animation again from the start)
const fltPool = [], fltDone = (el) => { el.remove(); if (fltPool.length < 24) fltPool.push(el); };
const flt = (text, pos, color, big, weight = 0) => {
  const v = pos.clone(); planet.localToWorld(v); v.project(st.camera); if (v.z > 1) return;
  const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight, now = performance.now(), num = /^!?\d+$/.test(String(text)) ? Number(String(text).replace("!", "")) : null;
  for (let i = floats.length - 1; i >= 0; i--) if (!floats[i].el.isConnected || now - floats[i].t > 900) floats.splice(i, 1);
  if (num != null) { const f = floats.find((o) => now - o.t < 420 && Math.hypot(o.x - x, o.y - y) < 70 && o.color === color);
    if (f) { f.n += num; f.t = now; f.el.textContent = (big || f.big ? "!" : "") + f.n; if (big && !f.big) { f.big = true; f.el.classList.add("crit"); } replay(f.el, "bump"); clearTimeout(f.k); f.k = setTimeout(() => fltDone(f.el), 950); return; } }
  const el = fltPool.pop() || document.createElement("div"); el.className = "wp-float-n" + (big ? " crit" : ""); el.textContent = text; el.style.color = color || "#fff"; el.style.removeProperty("--fs");
  if (num != null) { const f = { el, n: num, t: now, x, y, color, big: !!big }; floats.push(f); f.k = setTimeout(() => fltDone(el), 950); }
  el.style.translate = x.toFixed(1) + "px " + y.toFixed(1) + "px"; // the translate property: no layout, and it adds to the keyframed transform
  if (weight > 0) el.style.setProperty("--fs", (1 + Math.min(1, weight * 3) * 0.75).toFixed(2)); // a bigger share of the scammer's HP, a bigger number
  document.body.appendChild(el); if (num == null) setTimeout(() => fltDone(el), 950);
};
rpg = RPG.createRpg({
  hub: (k) => hubAct(k), ver: VER, reduce: () => reduce,
  // the Crimson Celestial pieces worn (and wearable at your level), by slot, for the Character window's slots and its card
  mythicModel: (k) => mythicModel(k), // (a Crimson Celestial piece worn there: its model on your hero — weapon, shield, helmet)
  mythicSlot: (k) => { try { if (!MY) return null; const p = mythicWorn().find((x) => MY.pieceOf(x.def).slot === k); return p ? { ...p, P: MY.pieceOf(p.def), st: MY.mythicStats(p) } : null; } catch { return null; } }, // (try: it can be asked before the Mythic state below is set up)
  mythicHeld: () => { try { if (!MY || !mythicNow) return []; const on = new Set(Object.values(mythicNow.eq || {})); return (mythicNow.pieces || []).filter((p) => MY.pieceOf(p.def) && p.state !== "GAME_LISTED").map((p) => ({ ...p, P: MY.pieceOf(p.def), worn: on.has(p.id) })); } catch { return []; } }, // (the bag's Mythic row)
  mythicSet: () => { try { if (!MY) return null; const worn = mythicWorn(); return { worn: worn.length, bonus: MY.setBonus(worn), BONUS: MY.CC.BONUS, held: ((mythicNow && mythicNow.pieces) || []).length }; } catch { return null; } },
  openMythic: (k) => openMythic(k),
  THREE, T: TW, lang: LANG, esc, toast, P, save: () => save(), level, post, sess, Snd, reduce, scene: () => st.scene,
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); }, avatar: () => avatar, openProfile: (w) => openProfile(w),
  extraStats: () => withMythic((() => { const t = quests ? quests.titleBonus() : null, h = bless().hp, pm = pet ? pet.mods() : null, cx = cxBonus; if (!h && !(pm && (pm.hp || pm.spd)) && !cx) return t; const o = { ...(t || {}) }; if (h || (pm && pm.hp)) o.hpPct = h + (pm ? pm.hp : 0); if (pm && pm.spd) o.spd = (o.spd || 0) + pm.spd;
    if (cx) { for (const k of ["crit", "spd"]) if (cx[k]) o[k] = (o[k] || 0) + cx[k];  for (const k of ["atkPct", "defPct", "hpPct"]) if (cx[k]) o[k] = (o[k] || 0) + cx[k]; } return o; })()), // + a Swift pet's speed, a Sturdy pet's HP and the item codex's full columns (cxBonus)
  dropLuck: () => petLuck,
  titleLine: () => { const b = quests && quests.titleBonus(), t = quests && quests.title(); return t ? `<p class="wr-title-b">${esc(W("Title"))}: <b>${esc(t)}</b>${b ? ` <small>${esc(RPG.bonusLine(b))}</small>` : ""}</p>` : ""; },
  // "Go hunting" (an empty bag): to the gate of the nearest hunting ground that fits your level, as the map's list does
  goHunt: () => { const lv = level(), me0 = here(), ok = ZN.ZONES.filter((z) => lv >= z.lv[0] && lv <= z.lv[1] + 2), zs = ok.length ? ok : ZN.ZONES.filter((z) => lv >= z.lv[0]).slice(-1), z = zs.sort((a, b) => Math.hypot(a.x - me0.x, a.z - me0.z) - Math.hypot(b.x - me0.x, b.z - me0.z))[0] || ZN.ZONES[0], an = Math.atan2(-z.x, -z.z); flyTo({ position: new THREE.Vector3(z.x + Math.sin(an) * (z.r + 3), 0, z.z + Math.cos(an) * (z.r + 3)), userData: { radius: 0.5 } }); },
  buyBag: (onStatus) => arclShop.pay("bagplus", "", onStatus),
  buyRekind: (onStatus) => arclShop.pay("rekind", "", onStatus), own: () => arclShop.own(),
  repairPay: (id, onStatus) => arclShop.pay("repair", id, onStatus), repairFree: (id) => arclShop.repairFree(id), repairLeft: () => arclShop.repairLeft(), atBase: () => mode === "island" && !!island && !island.readOnly(),
  openCraft: (t, id) => { if (life) life.showSheet(t, id); }, onStats: () => { if (combat) combat.onGear(); }, onPots: () => { if (combat) combat.potsCheck(); }, onView: (v) => tutorialStep(v === "log" ? 5 : v === "inv" ? 4 : -1), onEnhance: (n) => quests && quests.on.enhance(n), recall: () => recallHome(), gearModel: (slot, tier, color, glow) => (decor ? decor.gear(slot, tier, color, glow) : null), openWardrobe: () => { rpg.hide(); wardrobe.show(); }, isArc: () => /^arc-/.test(P.char || "arc-arc"), arclFly: (n, from) => arclShop.fly && arclShop.fly(n, from), arclRefresh: () => arclShop.refresh(), arclApply: (j) => arclShop.apply(j), arclDelta: (n, d) => arclShop.delta(n, d), arclDay: () => { const a = arclShop.arcl(); return a ? { today: a.today || 0, cap: a.cap || 30000, sold: a.sold || 0, sellCap: a.sellCap || 1500 } : null; }, arclBal: () => (arclShop.arcl() || {}).bal || 0,
});
rpg.dress();
// the GPU particles (world-particles.js): sparks, streaks, glow and smoke for the fights, in one or two draw calls
const parts = PART.createParticles({ THREE, parent: planet, low: lowGfx || st.quality.coarse });
// the platform, live in the town (world-live.js): the LED band round the fountain, and fireworks for a new launch
const live = LIVE.createLive({ THREE, planet, parts, reduce });
// crews (world-crew.js): the window from the menu, and your crew's tag before your name
const crewUI = CREW.createCrew({ isGM: (w) => VILL.isGM(w), T, esc, toast, post, sess, openProfile: (w) => openProfile(w), onTag: (t) => { if ((P.crewTag || "") !== (t || "")) { P.crewTag = t || ""; setNameTag(); } }, freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); } });
setTimeout(() => { if (sess()) crewUI.load(); }, 4000);
// footprints in snow and sand, and autumn leaves round you in town (world-tracks.js)
const tracks = TRK.createTracks({ THREE, planet, reduce });
st.on((dt) => { if (mode !== "hub") return; here(tmp3t); tracks.tick(dt, tmp3t.x, tmp3t.z, !(combat && combat.zone())); });
st.on((dt) => { if (mode === "hub") live.tick(dt); });
st.on((dt) => parts.tick(dt));
combat = FIGHT.createCombat({ softKO: () => !!(rqL && rqL.running()), alt: (a) => (jurOn && jurGame ? jurGame.act(a) : false), koWhy: () => (jurOn ? "dino" : ""), koBy: () => { try { return jurOn && jurGame && jurGame.koBy ? jurGame.koBy() : ""; } catch { return ""; } }, vfx, parts, wave: (p, power = 1) => { if (!fxPost || !fxPost.shock || reduce) return; const at = p.clone(); fxPost.shock((out) => out.copy(at).add(planet.position).setY(0.6), { power }); },
  THREE, K, planet, st, T, lang: LANG, esc, toast, Snd, reduce, coarse, ver: VER, heroKind: () => { const c = String(P.char || ""); return /lumi/.test(c) ? "lumi" : /nex/.test(c) ? "nex" : "aron"; }, /* the high skills draw in the hero's colours (world-skills.js) */
  kit: () => kit, here: (v) => here(v), facing: () => facing, faceTo: (a) => { facing = angLerp(facing, a, 0.5); }, afterimage: () => afterimage(), critFlash: () => critFlash(), avatar: () => avatar, level, hopY: () => hop, rpg, xp: () => P.xp, xpProg: () => RPG.xpProgress(P.xp),
  blocked: (v) => blockedAt(v),
  moveDir: (out) => { const { x, y, m } = inputs(); if (m < 0.1) return false; const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw); out.set(rx * x + fx * y, 0, rz * x + fz * y).normalize(); return true; },
  dash: (d, dist) => { knockV.copy(d).multiplyScalar(dist * 6); facing = Math.atan2(d.x, d.z); if (avatar && avatar.kk && grounded) avatar.play("dodge", { once: true, speed: 1.4, fade: 0.05 }); },
  onZone: (z) => { nightK = -1; dayNight(); if (quests) quests.on.zone(z); if (z) arciaOn("zone", z); },
  onKill: (k) => { fun("fight"); if (quests) quests.on.kill(k); arciaOn("kill", k); tutorialStep(3); if (k.rank === "boss" && k.zone && rpg) { const d = rpg.data(); d.x = d.x || {}; d.x.bk = d.x.bk || {}; d.x.bk[k.zone] = Math.min(9999, (d.x.bk[k.zone] || 0) + 1); } }, /* the boss trophies on My Island */ onCast: () => quests && quests.on.skill(), onFetch: () => { if (pet && pet.id() === "cat") pet.emote(); }, petPull: () => (pet && pet.visible() ? pet.pull() : 0),
  xpBoost: (zid) => RPG.xpBoost(zid) * (partyNear() ? 1.15 : together() ? 1.1 : 1), inRaid: () => !!(raid && raid.inside()), noStreet: () => landNow === "rq" || landNow === "cc", raidHit: (n) => raid && raid.hit(n),
  onRaidDown: () => { if (raid) raid.load(); },
  onLoot: (it) => { if (quests) quests.on.loot(it); arciaOn("loot", it); if (it.r >= 3) shareDrop(it); if (it.r >= 2) lootCard(it); },
  legend: () => { replay(document.body, "wc-legend"); setTimeout(() => document.body.classList.remove("wc-legend"), 1600); },
  inHub: () => mode === "hub" && !introOn, active: () => mode === "hub" && (!frozen || jurOn) && !flying && !introOn && !photo,
  gain: (n, why) => gain(n, why), claim: (kind, extra, from) => arclClaimRepeat(kind, extra, from),
  knock: (d, p) => { knockV.copy(d).multiplyScalar(p); vy = Math.max(vy, 4); grounded = false; hitFrom.copy(d); hitAt = performance.now(); hitPow = p; },
  hurt: () => { Snd.hurt(); shake = Math.max(shake, 0.25); const h = document.createElement("div"); h.className = "wp-hurt"; document.body.appendChild(h); setTimeout(() => h.remove(), 520); const fresh = performance.now() - hitAt < 200; if (fresh) { kickCam(hitFrom, 0.14); if (hitPow >= 11) hitstop(50); } /* the camera jolts along the blow; a heavy one (a boss, a charge) stops the world a beat */ if (avatar && avatar.hurt) { /* rock away from the blow: forward if it came from behind, sideways from the side */ const f = facing; avatar.hurt(fresh ? hitFrom.x * Math.sin(f) + hitFrom.z * Math.cos(f) : -1, fresh ? hitFrom.x * Math.cos(f) - hitFrom.z * Math.sin(f) : 0); } if (avatar && !avatar.arc && !avatar.bot && !boarding) avatar.play(avatar.kk ? "hit" : "emote-no", { once: true }); },
  screenOf: (p) => { const v = p.clone(); planet.localToWorld(v); v.project(st.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; },
  // a boss arrives: the camera turns to it for a moment and its name card comes up
  bossIntro: (pos, name, zone, lv, line) => {
    const dx = pos.x - (-planet.position.x), dz = pos.z - (-planet.position.z), want = Math.atan2(-dx, -dz), y0 = camYaw, t0 = performance.now();
    if (!reduce && !frozen) { const off = st.on(() => { const k = Math.min(1, (performance.now() - t0) / 700); camYaw = angLerp(y0, want, 1 - Math.pow(1 - k, 3)); if (k >= 1) off(); }); }
    const c = document.createElement("div"); c.className = "wc-bosscard"; c.setAttribute("role", "status"); c.setAttribute("data-no-i18n", "");
    c.innerHTML = `<small>${esc(T("Boss · Lv {n}", { n: lv }))}</small><b>${esc(name)}</b>${line ? `<i>${esc(T(line))}</i>` : ""}<span>${esc(T("appeared in {z}!", { z: zone }))}</span>`;
    // a cut-in: black bars close in from the top and bottom while a band crosses the screen with the name
    const bars = document.createElement("div"); bars.className = "wc-cutin"; bars.setAttribute("aria-hidden", "true"); bars.innerHTML = `<i></i><i></i><div class="wc-cutband"><b>${esc(name)}</b></div>`;
    if (!reduce) document.body.appendChild(bars);
    document.body.appendChild(c); setTimeout(() => c.remove(), 3000); setTimeout(() => bars.remove(), 2600);
  },
  onBossRun: (zone, ms) => { const s = sess(); if (s && ms >= 8000) post({ action: "world-bossrun", ...s, zone, ms }).catch(() => {}); },
  onBoss: () => music.victory(),
  buzz: (ms) => buzz(ms), hint: (id) => hint(id, { charge: tapOr(T("Hold J to charge a stronger blow, let go when the ring is full"), T("Hold the attack button to charge a stronger blow")), dodge: tapOr(T("Red on the ground means a strike is coming: step out, or dodge with K"), T("Red on the ground means a strike is coming: step out, or tap dodge")), pond: T("This ground has a pond with a fish of its own") }[id] || id),
  onSwing: (p, f, heavy, hammer) => (life ? life.swingAt(p, f, heavy, hammer) : false), float: flt, hitstop: (ms) => hitstop(ms), kickCam: (d, k) => kickCam(d, k), shake: (n) => { if (!reduce) shake = Math.max(shake, n * (liteFx || coarse ? 0.7 : 1)); }, lite: () => liteFx, // a phone's small screen shakes less halloween: HW.halloweenOn(), slowmo: (ms) => slowmo(ms), punch: () => { if (!reduce) punch = 1; }, finisher: () => finisher(),
  pay: (id, onStatus) => arclShop.pay(id, "", onStatus), ko: (what) => arclShop.ko(what), signedIn: () => !!sess(),
  // knocked out: lie down and wait; back up on the spot (a revive) or on the plaza
  down: (on, where) => {
    if (jurOn && jurGame) { keys.clear(); jurGame.down(on, where); try { if (on) Snd.ko && Snd.ko(); else Snd.up && Snd.up(); } catch { /* no sound */ } return; } // knocked out in Jurassic World: it lies down there, and gets up there
    if (on && boarding) setBoard(false);
    frozen = on; keys.clear(); paintPrompt();
    if (on) { if (avatar) avatar.play("die", { once: true }); try { Snd.ko && Snd.ko(); } catch { /* no sound */ } return; }
    setTimeout(() => vfx.rise(here()), 60); try { Snd.up && Snd.up(); } catch { /* no sound */ }
    if (where === "plaza") { const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); } planet.position.copy(HOME); hop = 0; vy = 0; grounded = true; facing = Math.PI; camYaw = 0; }
    if (avatar) avatar.play("idle");
  },
});
// b413: scammers and effects readied ahead of the first fight (world-combat.js warm), two models at a time as their
// packs arrive, out of sight, and never while something is fighting you
setTimeout(function warmLoop() { try { if (combat && mode === "hub" && !frozen && !combat.dangerNear(40)) combat.warm(st, 2).catch(() => {}); } catch { /* still loading */ } setTimeout(warmLoop, 900); }, 4000);
// the Adventure log (daily hunts, achievements and titles, the codex, top hunters) and the companion drone
// b-sv7: SURVIVORS ARENA's achievements, worn as titles in town (the server's meta for a wallet, this phone's for a guest; read again after a run)
let rqAch = null, rqAchP = null; // RAID QUEENS: the runs you've won (titles), from the server's clears
const rqAchLoad = (force) => { if (rqAchP && !force) return rqAchP; const s = sess(); rqAchP = (s ? fetch("/api/social?world=rq&wallet=" + s.wallet, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => Object.keys((j && j.clears) || {}).filter((k) => j.clears[k] > 0)) : Promise.resolve([])).then((l) => { rqAch = l; return l; }).catch(() => { rqAchP = null; return []; }); return rqAchP; };
let svAch = null, svAchP = null;
const svAchLoad = () => { if (svAchP) return svAchP; const s = sess();
  svAchP = (s ? fetch("/api/social?world=surv&wallet=" + s.wallet, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.meta && j.meta.ach) || []) : Promise.resolve().then(() => { try { return Object.keys((JSON.parse(localStorage.getItem("arc.surv.meta") || "null") || {}).ach || {}); } catch { return []; } }))
    .catch(() => []).then((a) => { svAch = Array.isArray(a) ? a : []; svAchP = null; if (rpg.isOpen()) rpg.repaint(); }); return svAchP; };
quests = QST.createQuests({ isGM: (w) => VILL.isGM(w), cxTitles: () => cxTitles, rqAch: () => { if (!rqAch) rqAchLoad(); return rqAch; }, gate: (k) => (k === "rq" ? rqOn() : true), openItems: () => { closeAll(); openCodex(); }, svAch: () => svAch, svAchLoad, starterDone: () => { try { const st0 = startSteps(), d = st0.filter((x) => x.done).length; return d >= st0.length ? 5 : Math.min(4, d); } catch { return 0; } },
  T: TW, lang: LANG, esc, toast, P, Snd, rpg, save: () => save(), level, gain: (n, why) => gain(n, why), fishList: LIFE.FISH,
  // Rankings → Players: portraits, who's around now, a player's card
  charThumb: (id) => thumbCache[id] || "", needThumbs: (ids) => renderThumbsFor(ids).then(() => rpg.isOpen() && rpg.repaint()),
  online: () => (ghosts && ghosts.named ? ghosts.named() : []), openProfile: (w) => openProfile(w),
  gmTools: () => { const s0 = sess(); return !!(s0 && VILL.isGM(String(s0.wallet).toLowerCase())); }, gmSend: (w, n) => gmReward.send(w, n), gmList: (w, n) => gmReward.list(w, n),
  dailyDone: () => arclShop.dailyDone(), openDaily: () => { rpg.hide(); arclShop.openDaily(); }, signedIn: () => !!sess(),
  repaint: () => rpg.repaint(), onTitle: () => setNameTag(),
  onAch: () => { setNameTag(); if (pet) pet.sync(); paintBagDot(); },
  onPet: () => { if (pet) pet.sync(); },
  petActive: () => (pet ? pet.active() : ""), petTitle: (id) => (pet ? pet.title(id) : id), petLv: (id) => (pet ? pet.level(id) : 1),
  petHTML: () => (pet ? pet.html() : ""), petClick: (b) => (pet ? pet.click(b) : false),
  shareCard: (o) => shareCard(o),
  bountyReady: () => { const p = partyUI(), f = p && p.full && p.full(); if (!f || (f.next && f.next <= Date.now())) return 0; return (f.bounties || []).filter((b) => b.done && !b.claimed).length + (f.party && f.party.done && !f.party.claimed && f.party.mine >= f.party.min ? 1 : 0); }, // the Log dot counts ready bounties too
  bountyHTML: () => (partyUI() ? partyUI().bountyHTML() : ""), bountyLoad: () => partyUI() && partyUI().loadFull(), bountyClick: (b) => !!partyUI() && partyUI().click(b),
});
rpg.setLog(quests);
// the pets (world-pet.js): eggs from the server, one animal walking with you; the three older companions are drawn by QST.createPet
pet = PET.createPets({ THREE, K, planet, shadow: (r, k) => LOOK.contactShadow(r, k), here: (v) => here(v), facing: () => facing, combat: () => combat, reduce, coarse: st.quality.coarse, low: lowGfx, ver: VER, legacy: QST.createPet({ THREE, K, planet, here: (v) => here(v), facing: () => facing, combat, reduce }), T, esc, rpg: () => rpg, ach: () => { const x = rpg.data().x; return (x && x.ach) || []; }, save: () => save(), toast, Snd,
  buy: (onStatus) => arclShop.pay("petegg", "", onStatus), repaint: () => rpg.repaint(),
  onMods: (m, stats) => { petXpPct = m.xp; petLuck = m.luck; if (stats && rpg) rpg.refresh(); } });
pet.sync(); if (ownNow) pet.mirror(ownNow); setNameTag();
// the weekly raid boss and the wanderers (world-social.js)
raid = SOC.createRaid({
  THREE, K, planet, T, esc, toast, Snd, here: (v) => here(v), level, sess, post, combat, rpg, quests: () => quests, gain: (n, why) => gain(n, why),
  inHub: () => mode === "hub" && !introOn, wallet: () => { const s = sess(); return s ? s.wallet : ""; },
  onArcl: (n) => { arclShop.refresh().then(() => toast(T("+{n} ARCL · {why}", { n, why: T("Weekly raid") }))); Snd.coin(); },
  feed: (h, c) => feed(h, c), shareCard: (o) => shareCard(o), name: () => P.name || "", shake: (n) => { if (!reduce) shake = Math.max(shake, n); }, reduce, clip: (ms) => recordClip(ms),
});
// a short clip of the game's picture (the raid's fall): recorded from the canvas, then offered to save or share
let clipOn = false;
function recordClip(ms = 6000) {
  try {
    if (clipOn || !window.MediaRecorder || !cv.captureStream) return false;
    const type = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t)); if (!type) return false;
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: type, videoBitsPerSecond: 5e6 }), parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = () => { clipOn = false; if (parts.length) offerClip(new Blob(parts, { type: type.split(";")[0] })); };
    clipOn = true; rec.start(500); setTimeout(() => { try { rec.stop(); } catch { clipOn = false; } }, ms);
    return true;
  } catch { clipOn = false; return false; }
}
function offerClip(blob) {
  const ext = /mp4/.test(blob.type) ? "mp4" : "webm", url = URL.createObjectURL(blob), name = `arcircle-raid-${Date.now()}.${ext}`;
  document.querySelectorAll(".wp-clip").forEach((x) => x.remove());
  const c = document.createElement("div"); c.className = "wp-clip"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", T("Raid clip"));
  c.innerHTML = `<video src="${url}" muted autoplay loop playsinline></video><div><b>${esc(T("Your raid clip"))}</b><small>${esc(T("The last seconds of the fall"))}</small></div><a class="wp-btn" href="${url}" download="${name}">${esc(T("Save"))}</a>${navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] }) ? `<button type="button" class="wp-btn" data-cshare>${esc(T("Share"))}</button>` : ""}<button type="button" class="wp-btn wp-x" data-cx aria-label="${esc(T("Close"))}">×</button>`;
  c.addEventListener("click", async (e) => {
    if (e.target.closest("[data-cx]")) { c.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); return; }
    if (e.target.closest("[data-cshare]")) { try { await navigator.share({ files: [new File([blob], name, { type: blob.type })], text: T("{x} in ARCIRCLE World ♾", { x: T("The raid boss fell") }) }); } catch { /* cancelled */ } }
  });
  document.body.appendChild(c); setTimeout(() => { if (c.isConnected) c.remove(); }, 60000);
}
if (raid.gate) arches.push(raid.gate); // the arena's gate steps aside for the camera like the town's arches
ghosts = SOC.createGhosts({ THREE, K, planet, okAt: (x, z) => Math.hypot(x, z) <= 150 || (!!LD.landAt(x, z) && LD.landAt(x, z).id !== "rq"), compile: (o) => (st.renderer.compileAsync ? st.renderer.compileAsync(o, st.camera, st.scene) : Promise.resolve()), T: (s, v) => (s === "Hi!" || s === "Friend" ? W(s) : T(s, v)), here: (v) => here(v), inHub: () => mode === "hub" && !introOn, myTag,
  shadow: (r, k) => LOOK.contactShadow(r, k), isPal: (x) => (P.pal && x.t === P.pal) || x.p === myTag, sayText: (i) => (SAY[i] ? (SAY[i].includes(" ") || SAY[i].length > 4 ? T(SAY[i]) : W(SAY[i])) : ""),
  onPal: (on) => { const c = $("wp-together"); if (c) c.hidden = !on; }, hides: (w) => !!(chatUI && chatUI.hides && chatUI.hides(lc(w))), // muted or blocked: no bubble over them
  // other players stand as their own characters (not the see-through capsules) once the model is in
  makeChar: (id) => (lowGfx ? Promise.resolve(null) : K.makeCharacter(heroOf(id), VER).catch(() => null)), farShadow: !coarse, lite: S.quality === "saver" || (coarse && lowGfx), tierHalo: (i) => (K.TIER_HALO ? K.TIER_HALO[i] : null) });
// ---------------- the inbox: gifts, new stamps, friends playing now ----------------
// stand next to someone in town (a friend from the inbox, a player's card): a short hop, facing them
function goNear(x, z) {
  if (mode !== "hub" || frozen) { toast(T("You can go there from the town")); return; }
  const a = Math.atan2(-x, -z) || 0, sx = x + Math.sin(a) * 1.8, sz = z + Math.cos(a) * 1.8;
  const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); }
  planet.position.set(-sx, 0, -sz); hop = 0; vy = 0; grounded = true; facing = Math.atan2(x - sx, z - sz); camYaw = facing - Math.PI;
  Snd.dash && Snd.dash();
}
const inbox = INBOX.createInbox({ playStudio: (id) => openStudio("arcade").then(() => { if (studio) studio.playId(id); }), refresh: () => refreshPurse(true), onDot: (n) => { inboxDot = n; paintMenuDot(); }, T: TW, esc, post, sess, toast, Snd, rpg: () => rpg, island, ghosts: () => ghosts, goIsland: (o) => goIsland(o), goNear,
  openProfile: (w) => openProfile(w), inHub: () => mode === "hub", bookNew: () => island.bookNew(), save: () => save(), onPots: () => combat && combat.potsCheck() });
// chat (world-chat.js): local lines in the area you stand in, friends and private messages
// the area: an island, a hunting ground, or the nearest district of the town
function chatArea() {
  if (mode === "island") return /^0x[0-9a-f]{40}$/.test(isleArea) ? { id: "i-" + isleArea, name: island.title() } : null;
  const zz = combat && combat.zone(); if (zz && /^[a-z0-9]{2,12}$/.test(zz.id)) return { id: "z-" + zz.id, name: T(zz.name || zz.id) };
  if (landNow) return { id: "h-" + landNow, name: landName(landNow) }; // b-lpv
  let bd = Infinity, best = null; K.DISTRICTS.forEach((d) => { if (d.id !== "dark") return; const v = K.spot(d.theta, d.phi).add(planet.position), dd = v.length(); if (dd < bd && dd < 30) { bd = dd; best = d; } });
  return best && /^[a-z0-9]{2,12}$/.test(best.id) ? { id: "h-" + best.id, name: best.name } : { id: "h-town", name: T("Town") };
}
chatUI = CHAT.createChat({ T, esc, toast, post, sess, Snd, area: chatArea, bubble: (txt) => sayBubble(txt.length > 34 ? txt.slice(0, 33) + "…" : txt, 7000),
  following: () => ((P.rpg && P.rpg.x && P.rpg.x.friends) || []).map((f) => ({ w: lc(f.w), n: f.n })), openProfile: (w) => openProfile(w),
  // a friend standing in town with you, and the hop next to them (the profile's Go there)
  near: (w) => !!(ghosts && mode === "hub" && ghosts.named().some((g) => g.wallet === w)), goTo: (w) => { const g = ghosts && ghosts.named().find((x) => x.wallet === w); if (g) goNear(g.x, g.z); },
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); }, onUnread: (n) => { chatDot = n; paintMenuDot(); },
  onSay: () => { if (Date.now() - sayPingAt > 15000) { sayPingAt = Date.now(); ping(); } }, onParty: () => { paintParty(); if (rpg && rpg.isOpen()) rpg.repaint(); if (quests) paintBagDot(); } });
// ---------------- set dressing from the free model packs (world-decor.js) ----------------
// b448: compile a list of objects while they're hidden (they're made visible only for the call: compileAsync collects them
// right away), so each can be shown once its shaders are ready
const compileHidden = (list) => { if (!st.renderer.compileAsync) return Promise.resolve(); const was = list.map((o) => o.visible); list.forEach((o) => { o.visible = true; }); let ps; try { ps = list.map((o) => st.renderer.compileAsync(o, st.camera, st.scene).catch(() => {})); } finally { list.forEach((o, i) => { o.visible = was[i]; }); } return Promise.race([Promise.all(ps), new Promise((r) => setTimeout(r, 4000))]); };
decor = DECOR.createDecor({ compile: compileHidden, onMore: () => { try { if (gshadow) gshadow.rebakeSoon(); farCull.rescan(); } catch { /* fine */ } }, /* (PF8: the districts came in after the screen lifted) */ THREE, K, planet, blocked: (v) => blockedAt(v), shops, zones: RPG.ZONES, ver: VER, low: lowGfx, lite: S.quality === "medium" || matchMedia("(pointer: coarse)").matches, reduce, here: (v) => here(v), onWeapons: () => rpg && rpg.dress(), avoid: () => [[MV.MINE_VILLAGE.x, MV.MINE_VILLAGE.z, MV.MINE_VILLAGE.r + 3], [PV.PARTNER_VILLAGE.x, PV.PARTNER_VILLAGE.z, PV.PARTNER_VILLAGE.r + 3], ...(race ? [[race.pad.position.x, race.pad.position.z, 3.2], ...race.points().map(([x, z]) => [x, z, 2.6])] : [])] });
st.on((dt) => decor.tick(dt));
st.on((dt) => { if (rpg && rpg.tickSwing) rpg.tickSwing(dt); });
// gathering, the workbench and fishing (world-life.js)
const life = LIFE.createLife({ THREE, planet, T: TW, esc, toast, Snd, onCatch: (f, cm) => { if (avatar && avatar.face) avatar.face("wow", 1.6); if (quests) quests.on.fish(); arciaOn("fish", f); const s = sess(); if (!s || !f) return; const wk = Math.floor((Date.now() - Date.UTC(1970, 0, 5)) / 6048e5); let b = {}; try { b = JSON.parse(localStorage.getItem("arc.world.fishwk") || "{}"); } catch { /* private */ } if (b.wk === wk && b.cm >= cm) return; try { localStorage.setItem("arc.world.fishwk", JSON.stringify({ wk, cm })); } catch { /* private */ } post({ action: "world-fish", ...s, fish: f.id, cm }).catch(() => {}); }, /* this week's biggest catch goes to the board */ buzz: (ms) => buzz(ms), hint: (id) => hint(id, id === "gather" ? tapOr(T("Press G to gather it: any attack works too"), T("Tap Gather to collect it: any attack works too")) : tapOr(T("Press G to cast, then again when the mark is in the green"), T("Tap Fish to cast, then Reel in when the mark is in the green"))), onStats: () => { if (combat) combat.onGear(); }, rpg: () => rpg, here: (v) => here(v), blocked: (v) => blockedAt(v), zones: RPG.ZONES, inHub: () => mode === "hub", save: () => save(), vfx, low: lowGfx, float: flt, hitstop: (ms) => hitstop(ms), kickCam: (d, k) => kickCam(d, k), shake: (n) => { if (!reduce) shake = Math.max(shake, n); }, onPots: () => { if (combat) combat.potsCheck(); } });
// water (world-env.js): foam round the edge, caustics on the floor, the sky at a glance (the fountain and the far ponds)
const waterMats = [], reflHide = [parts.glowMesh, parts.smokeMesh], reflU = [];
if (!lowGfx) {
  const pools = []; fountain.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === "CircleGeometry" && o.material && o.material.transparent) { const m = ENV.waterMat({ r: o.geometry.parameters.radius, color: 0x38c8ff, deep: 0x0a5a8a, glow: 0.22, opacity: 0.86 }); o.material = m; waterMats.push(m); pools.push(o); } });
  for (const m of waterMats) { m.uniforms.uSunDir.value.copy(sunDir); m.uniforms.uSpark.value = reduce ? 0 : 1; }
  // on Ultra the big pool reflects the plaza (redrawn every other frame, without the grass and the particles)
  if (postLevel === "ultra" && !st.quality.coarse && pools.length) { const big = pools.reduce((a, b) => (a.geometry.parameters.radius > b.geometry.parameters.radius ? a : b));
    import("./vendor/three/addons/Reflector.js").then(({ Reflector }) => { const rm = ENV.reflectPool(Reflector, big, st.renderer, reflHide, () => frameNo); reflU.push(rm.material.uniforms); }).catch(() => {}); }
  planet.getObjectByName("life").children.forEach((g) => { if (!/^pond:/.test(g.name)) return; const w = g.children[0]; if (!w || !w.isMesh || !w.material.color) return;
    const hot = g.name === "pond:abyss", c = w.material.color.getHex();
    const m = ENV.waterMat({ r: w.geometry.parameters.radius, color: c, deep: new THREE.Color(c).multiplyScalar(0.4).getHex(), foam: hot ? 0xffd080 : 0xeaffff, glow: hot ? 0.9 : 0.12, opacity: 0.92 });
    m.polygonOffset = true; m.polygonOffsetFactor = -4; m.uniforms.uSunDir.value.copy(sunDir); m.uniforms.uSpark.value = reduce ? 0 : 1; w.material = m; waterMats.push(m); });
  st.on((dt) => { for (const m of waterMats) m.uniforms.uTime.value += dt; for (const u of reflU) u.uTime.value += dt; });
}
// the meadow (world-env.js): blades round you that sway and lie down where you walk (none on Low / Saver). Built once
// the town is up (the mask is painted from what stands on the ground) and repainted once more when the coin city is in
let grass = null, gmask = null;
function makeMeadow() {
  if (lowGfx || grass) return;
  gmask = farCull.all(() => ENV.grassMask({ planet, zones: RPG.ZONES, clear: [{ x: 0, z: 0, r: K.flatR(11) + 0.8 }, { x: GV.VILLAGE.x, z: GV.VILLAGE.z, r: GV.VILLAGE.arenaR + 2.2 } /* b447: the Game Village square (the blades grew through its tiles) */, { x: MV.MINE_VILLAGE.x, z: MV.MINE_VILLAGE.z, r: MV.MINE_VILLAGE.r + 1 } /* the Mining Village clearing */, { x: AGW.x, z: AGW.z, r: AGW.r + 2.5 } /* AGENT DIMENSION's Citadel */, { x: PV.PARTNER_VILLAGE.x, z: PV.PARTNER_VILLAGE.z, r: PV.PARTNER_VILLAGE.r + 1 } /* the Partner Village */], paths: WORN_PATHS }));
  const big = S.quality === "ultra" || S.quality === "high"; // 60,000 blades only when asked for (b411)
  grass = ENV.makeGrass({ count: big ? 60000 : st.quality.coarse ? 8000 : 32000, /* b447: phones 8,000 (Adreno 7xx fell to 30–40 fps once the blades were back) (the blades hadn't drawn on phones since 13 October, a shader that didn't link; the frame rates since were measured without them) */ size: big ? 50 : st.quality.coarse ? 36 : 44, mask: gmask, gshadow, mediump: !!st.quality.coarse }); // phones: the blade colour in half precision (b404)
  planet.add(grass.mesh); reflHide.push(grass.mesh);
  st.on((dt) => { const on = mode === "hub"; grass.mesh.visible = on; if (on) grass.tick(dt, -planet.position.x, -planet.position.z); });
  setTimeout(() => farCull.all(() => gmask.paint()), 20000);
  nightK = -1; dayNight();
}
st.on((dt) => life.tick(dt));
// ?decor=0 leaves it out (to compare frame rates, or on a device that struggles); automated browsers (software
// rendering, a frame a second) get it only with ?decor=1
const decorOn = /[?&]decor=1\b/.test(location.search) || (!navigator.webdriver && !/[?&]decor=0\b/.test(location.search));
if (decorOn) setTimeout(() => decor.start(), 1500);
// ---------------- the ARC Bot wardrobe (world-wardrobe.js) ----------------
const wardrobe = WARD.createWardrobe({ THREE, T: TW, esc, level, charId: () => P.char || "arc-arc", outfit: () => P.outfit || null, toast, Snd,
  save: (o) => { P.outfit = o; save(); setAvatar(P.char || "arc-arc"); delete thumbCache[P.char || "arc-arc"]; } });
// ---------------- the hoverboard race around the plaza (world-race.js) ----------------
race = RACE.createRace({ THREE, K, planet, T: TW, esc, here: (v) => here(v), blocked: (v) => blockedAt(v), boarding: () => boarding, setBoard: (on) => setBoard(on),
  inHub: () => mode === "hub" && !introOn && !flying, post, sess, toast, Snd, reduce, onTop: () => {} });
st.on((dt) => { race.update(); race.spin(dt); });
// ---------------- a player's card (Rankings → Players, or someone around you) ----------------
// the showcase on a player's card: the gear they have on (rarity colour, +level) and the titles they've earned, the
// one they wear lit gold; tap a piece or a title for its name
function showcase(fr, wornT) {
  if (!fr || !Array.isArray(fr.ach)) return "";
  const titled = QST.ACH.filter((a) => a.title), got = titled.filter((a) => fr.ach.includes(a.id)), list = [...got.map((a) => ({ id: a.id, t: T(a.title), line: T(a.line) })), ...(fr.st ? [{ id: "season", t: T("Season Star"), line: T("Season pass, last tier") }] : [])];
  const gear = (fr.gear || []).filter((it) => RPG.parseBase(it.b));
  const tile = (it) => { const R = RPG.RARITY[it.r] || RPG.RARITY[0]; return `<li style="--rc:${R.color}" title="${esc(rpg.itemName(it))} · ${esc(T(R.name))}">${rpg.thumb ? rpg.thumb(it) : ""}${it.p ? `<b>+${it.p}</b>` : ""}</li>`; };
  return `<div class="wp-prof-show">
    ${gear.length ? `<h3>${esc(T("Gear"))}</h3><ul class="wp-prof-gear">${gear.map(tile).join("")}</ul>` : ""}
    <h3>${esc(T("Titles"))} <small>${list.length} / ${titled.length + 1}</small></h3>
    ${list.length ? `<ul class="wp-prof-titles">${list.map((x) => `<li${x.id === wornT ? ' class="worn"' : ""} title="${esc(x.line)}">${esc(x.t)}</li>`).join("")}</ul>` : `<p class="wp-prof-none">${esc(T("No titles yet"))}</p>`}</div>`;
}
async function openProfile(w) {
  if (!/^0x[0-9a-f]{40}$/.test(String(w || ""))) return;
  document.querySelectorAll(".wp-prof").forEach((x) => x.remove());
  const dir = (quests.dir() || {}).list || [], row = dir.find((r) => r.w === w) || {}, el = document.createElement("div");
  el.className = "wp-prof"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  // the Mythic pieces they wear (the Crimson Celestial set, ?world=mythic-worn): their pictures with + and stars
  let myw = null; const mythShow = () => !myw || !myw.n || !MY ? "" : `<div class="wp-prof-show"><h3>MYTHIC · ${esc(TW("Crimson Celestial"))} <small>${myw.n} / ${MY.CC.PIECES.length}</small></h3><ul class="wp-prof-gear wp-prof-myth">${myw.worn.map((x) => { const P0 = MY.pieceOf(x.def); return P0 ? `<li style="--rc:#ff3d6e" title="${esc(TW(P0.name))}"><img src="/images/mythic/${P0.glb}.webp${VER}" alt="">${x.plus ? `<b>+${x.plus}</b>` : ""}${x.stars ? `<i>${"★".repeat(x.stars)}</i>` : ""}</li>` : ""; }).join("")}</ul></div>`;
  const paint = (fr) => {
    const name = row.name || (fr && fr.name) || w.slice(0, 6) + "…" + w.slice(-4), lv = row.lv || (fr && fr.lv) || 1, char = row.char || (fr && fr.char) || "", me = sess() && sess().wallet === w;
    const isFr = island.isFriend(w), ago = row.at ? Math.floor((Date.now() - row.at) / 60000) : null, wornT = (fr && fr.t) || row.t || "";
    el.innerHTML = `<div class="wp-prof-card"><button type="button" class="wp-btn wp-x" data-px aria-label="${esc(T("Close"))}">×</button>
      <div class="wp-prof-face">${thumbCache[char] ? `<img src="${thumbCache[char]}" alt="">` : ""}<b>${lv}</b></div>
      <h2>${VILL.isGM(w) ? '<b class="wv-gmtag">[GM]</b> ' : ""}${fr && fr.cr ? `<span class="wp-crew-tag sm">${esc(fr.cr)}</span>` : ""}${esc(name)}</h2>${quests.titleOf(wornT) ? `<p class="wp-prof-title">${esc(quests.titleOf(wornT))}</p>` : ""}
      <dl><div><dt>${esc(W("Level"))}</dt><dd>${lv}</dd></div><div><dt>${esc(T("Codex pages"))}</dt><dd>${row.cx || 0} / ${QST.CODEX.length + QST.CODEX_STORY.length}</dd></div><div><dt>${esc(T("Island"))}</dt><dd>${fr && fr.isle ? esc(T("{n} bricks", { n: fr.isle })) + " · ♥ " + (fr.likes || 0) : "—"}</dd></div>${fr && fr.village && fr.village.score ? `<div><dt>${esc(T("Village score"))}</dt><dd>${fr.village.score.toLocaleString("en-US")}</dd></div>` : ""}<div><dt>${esc(T("Last seen"))}</dt><dd>${ago == null ? "—" : ago < 15 ? esc(T("just now")) : ago < 60 ? esc(T("{n} min ago", { n: ago })) : ago < 1440 ? esc(T("{n} h ago", { n: Math.floor(ago / 60) })) : ago < 2880 ? esc(T("yesterday")) : esc(T("{n} days ago", { n: Math.floor(ago / 1440) }))}</dd></div></dl>
      ${showcase(fr, wornT)}${mythShow()}
      <div class="wp-prof-acts">${fr && fr.isle ? `<button type="button" class="wp-cta" data-pvisit>${esc(T("Visit their island"))}</button>` : ""}${me ? "" : `<button type="button" class="wp-btn" data-pfriend aria-pressed="${isFr}">${esc(isFr ? W("Friend") : T("Add friend"))}</button>`}${me || !sess() ? "" : `<button type="button" class="wp-btn" data-pparty aria-pressed="${inParty(w)}" ${inParty(w) ? "disabled" : ""}>${esc(inParty(w) ? T("In your party") : T("Add to party"))}</button>`}${!me && mode === "hub" && ghosts && ghosts.named().some((g) => g.wallet === w) ? `<button type="button" class="wp-btn" data-pgo>${esc(T("Go there"))}</button>` : ""}</div>
      ${me || !sess() ? "" : `<div class="wp-prof-gift"><span>${esc(T("Send a gift"))}</span>${inbox.sendOptions().map((g) => `<button type="button" class="wp-btn" data-pgift="${g.kind}:${g.n}" ${g.can ? "" : "disabled"}>${esc(g.label)}</button>`).join("")}</div>`}</div>`;
    if (char && !thumbCache[char]) renderThumbsFor([char]).then(() => { if (el.isConnected) paint(fr); });
  };
  paint(null); document.body.appendChild(el); frozen = true; keys.clear();
  // Escape closes the card first (the Adventure log under it stays open)
  const onKey = (e) => { if (e.key === "Escape" && el.isConnected) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  const close = () => { el.remove(); removeEventListener("keydown", onKey, true); frozen = !!((rpg && rpg.isOpen()) || crewUI.isOpen() || village.isOpen()); };
  addEventListener("keydown", onKey, true);
  let fr = null; try { const r = await fetch("/api/social?world=friends&wallets=" + w); fr = r.ok ? ((await r.json()).friends || {})[w] || null : null; } catch { /* the card stays as it is */ } if (el.isConnected) paint(fr);
  try { if (!MY) MY = await import("./world-mythic-data.js"); const r = await fetch("/api/social?world=mythic-worn&wallet=" + w, { cache: "no-store" }); myw = r.ok ? await r.json() : null; if (el.isConnected && myw && myw.n) paint(fr); } catch { /* no Mythic row */ }
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-px]")) { close(); return; }
    if (e.target.closest("[data-pvisit]")) { close(); rpg.hide(); goIsland({ visit: w }); return; }
    if (e.target.closest("[data-pgo]")) { const g = ghosts && ghosts.named().find((x) => x.wallet === w); if (g) { close(); rpg.hide(); goNear(g.x, g.z); } return; }
    const gb = e.target.closest("[data-pgift]"); if (gb) { const [k, n] = gb.dataset.pgift.split(":"); gb.disabled = true; inbox.send(w, k, Number(n)).then(() => { if (el.isConnected) paint(fr); }); return; }
    if (e.target.closest("[data-pfriend]")) { island.toggleFriend(w, row.name || (fr && fr.name) || ""); paint(fr); }
    if (e.target.closest("[data-pparty]")) { const pu = partyUI(); if (pu) pu.invite(w).then(() => { if (el.isConnected) paint(fr); }); }
  });
}
// a card to share (an achievement): the photo sheet shows it with save / share / post
async function shareCard(o) {
  const blob = await SOC.drawCard({ ...o, name: P.name || W("Player"), lv: level() }); if (!blob) return;
  rpg.hide(); showShot(blob, o.title ? T("{x} in ARCIRCLE World ♾", { x: o.title }) : "");
}
function paintBagDot() { const b = $("wp-log-btn"); if (b) b.dataset.dot = quests.pending() ? String(quests.pending()) : ""; paintMenuDot(); } // rewards waiting: on the Log button, where they are
// the Menu tile's red dot: mail or rewards waiting (on a phone the bell and the Log button live in the menu)
function paintMenuDot() { const m = $("wp-more-btn"); if (m) m.dataset.dot = inboxDot || chatDot || (quests && quests.pending && quests.pending()) ? "1" : ""; }
setInterval(paintBagDot, 4000);
// a recall scroll: straight back to the plaza
function recallHome() {
  if (mode !== "hub" || flying || introOn) { toast(T("Recall scrolls work in the town")); return false; }
  if (!rpg.useRecall()) { toast(T("No recall scrolls — the Forge sells them")); return false; }
  if (boarding) setBoard(false);
  planet.position.copy(HOME); hop = 0; vy = 0; grounded = true; facing = Math.PI; camYaw = 0; knockV.set(0, 0, 0);
  Snd.dash && Snd.dash(); shake = Math.max(shake, 0.2); toast(T("Back on the plaza")); return true;
}
// Epic and Legendary finds go in everyone's feed (a line of text; the server rate-limits it)
function shareDrop(it) { const s = sess(); if (s) post({ action: "world-feed-drop", ...s, b: it.b, r: it.r }).catch(() => {}); }
let dropsSeen = Date.now() - 10 * 60e3;
async function refreshDrops() {
  if (mode !== "hub") return;
  try {
    const r = await fetch("/api/social?world=drops"); if (!r.ok) return;
    const list = ((await r.json()).drops || []).filter((d) => d.at > dropsSeen).sort((a, b) => a.at - b.at);
    for (const d of list.slice(-3)) { if (d.k === "royal") { feed(TW("{who} hit a ROYAL FLUSH at ARCIA POKER LOUNGE!", { who: `<b>${esc(d.name || d.w)}</b>` }), "#ffd23a"); continue; } const rr = RPG.RARITY[d.r] || RPG.RARITY[3]; feed(T("{who} found {x}", { who: `<b>${esc(d.name || d.w)}</b>`, x: `<b style="color:${rr.color}">${esc(RPG.itemName({ b: d.b, p: 0 }))}</b>` }), rr.color); }
    if (list.length) dropsSeen = list[list.length - 1].at;
  } catch { /* the feed waits */ }
}
every(60000, refreshDrops); setTimeout(refreshDrops, 8000);
// repeatable ARCL (street fights, coins): the server keeps the daily limit and the gap between claims
function arclClaimRepeat(kind, extra, from) { arclShop.claim(kind, extra, from); }
$("wp-help-btn").addEventListener("click", () => openHelp());
// the menu: everything in one place, a tap away (the ≡ button on every screen, or Esc with nothing open).
// Grouped by what you're doing; each tile names its key; a dot marks something waiting (rewards, mail).
const HUB = [
  // kept short: what has its own button elsewhere (Shop and Starter up top; Bag, Craft and Pets on the dock; photo and
  // emotes by the attack button; the Workbench in the bag; the Wardrobe in the Character window) isn't repeated here,
  // and the Adventure log's tabs (daily hunts, achievements, season, codex, pets, rankings) are one tile
  // b-ui2: the nine you use most, as big tiles (the owner's mock-up), then everything else
  ["", [["games", "trophy", "Games", ""], ["log", "check", "Quests", "L"], ["rewards", "season", "Rewards", ""], ["shop", "shop", "Shop", ""], ["inv", "bag", "Inventory", "I"], ["petdk", "paw", "Pets", "N"], ["chat", "crew", "Friends", ""], ["set", "gear", "Settings", ""], ["map", "map", "Map", "M"]]],
  ["More", [["agent", "person", "AI Agent", ""], ["partners", "village", "Partner Village", ""], ["raidq", "sword", "Raid Queens", ""], ["mythic", "trophy", "Crimson Celestial", ""], ["forge", "anvil", "Craft", "C"], ["defense", "sword", "Game Village", ""], ["invite", "mail", "Invite friends", ""], ["start", "keys", "New player guide", ""], ["crew", "crew", "Crew", ""], ["island", "island", "Island", ""], ["market", "shop", "Creator Market", ""], ["codex", "book", "Item codex", ""], ["ledger", "book", "ARCL ledger", ""], ["bridge", "shop", "Bring USDC to Arc", ""], ["land", "village", "ARCIRCLE LAND", ""], ["village", "village", "Village and contest", ""], ["inbox", "mail", "Inbox", ""],
    ["arcia", "help", "What should I do next?", ""], ["make", "person", "Change character", ""], ["guide", "keys", "Controls", ""], ["help", "help", "Help Center", "H"], ["music", "music", "Music on / off", ""], ["recent", "book", "Recent messages", ""]]],
];
hubEl = document.createElement("div"); hubEl.className = "wp-hub"; hubEl.hidden = true; hubEl.setAttribute("role", "dialog"); hubEl.setAttribute("aria-modal", "true"); hubEl.setAttribute("data-no-i18n", "");
document.body.appendChild(hubEl);
// the Menu remembers the last 4 tiles you opened (a Recent row on top); on a keyboard, typing filters the tiles and Enter opens the first
let hubRecent = [], hubQ = ""; try { hubRecent = JSON.parse(localStorage.getItem("arc.world.hubRecent") || "[]").filter((x) => typeof x === "string").slice(0, 4); } catch { /* none kept */ }
const JUR_OFF = new Set(["map", "island", "village", "defense", "make"]);
function paintHub() {
  const isArc = String(heroOf(P.char || "arc-arc")).startsWith("arc-"), /* b447: the wardrobe dresses ARC Bots only */ dot = { log: quests && quests.pending ? quests.pending() > 0 : false, inbox: !!document.querySelector('#wp-inbox-btn[data-dot]:not([data-dot=""])'), chat: chatDot > 0 };
  const ok = ([id]) => (id !== "raidq" || rqOn()) && (id !== "petdk" || !!$("wp-dk-pet")) && (id !== "wardrobe" || isArc) && (id !== "island" || mode === "hub") && !(jurOn && JUR_OFF.has(id)) /* (in Jurassic World the tiles that move you round town wait) */, all = HUB.flatMap(([, items]) => items), rec = hubRecent.map((id) => all.find((x) => x[0] === id)).filter((x) => x && ok(x));
  // the owner's look (2026-10-23, from the owner's mock-up): the nine as 3D icons, Recent as cards with the place's art
  // (only what isn't one of the nine, at most three), More as rows with an icon (what's in Recent isn't repeated), and
  // the small things (help, controls, music …) as pills at the end — images/ui/menu
  const G = new Set(["games", "log", "rewards", "shop", "inv", "petdk", "chat", "set", "map"]), IC = new Set(["agent", "partners", "forge", "defense", "invite", "start", "crew", "island", "market", "ledger", "land", "village", "bridge"]), ART = new Set(["partners", "log", "defense"]);
  const img = (k) => `<img class="wp-hub-img" src="/images/ui/menu/${k}.webp${VER}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
  const extra = (id, key) => `${key && !coarse ? `<kbd>${key}</kbd>` : ""}${dot[id] ? '<i class="wp-hub-dot" aria-label="new"></i>' : ""}`;
  const tile = ([id, ic, label, key], kind) => kind === "g" ? `<button type="button" data-hub="${id}" class="wp-hub-g">${img("g-" + id)}<span>${esc(TW(label))}</span>${extra(id, key)}</button>`
    : kind === "r" ? `<button type="button" data-hub="${id}" class="wp-hub-r${id === "defense" ? " pri" : ""}"${ART.has(id) ? ` style="--art:url('/images/ui/menu/r-${id}.webp${VER}')"` : ""}>${IC.has(id) ? img("i-" + id) : ICONS.icon(ic, 26)}<span>${esc(TW(label))}</span>${extra(id, key)}</button>`
    : kind === "p" ? `<button type="button" data-hub="${id}" class="wp-hub-p">${ICONS.icon(ic, 18)}<span>${esc(TW(label))}</span>${extra(id, "")}</button>`
    : `<button type="button" data-hub="${id}" class="wp-hub-m${id === "defense" ? " pri" : ""}">${IC.has(id) ? img("i-" + id) : ICONS.icon(ic, 26)}<span>${esc(TW(label))}</span>${extra(id, key)}</button>`;
  const rec3 = rec.filter((x) => !G.has(x[0])).slice(0, 3), inRec = new Set(rec3.map((x) => x[0]));
  const more = HUB[1][1].filter(ok).filter((x) => !inRec.has(x[0]));
  // MNU (2026-10-27, the owner: the Menu's UI/UX): who you are at the top — your hero, name, level and XP, your ARCL — a tap
  // opens the Character window (the "inv" tile's window)
  const xq = RPG.xpProgress(P.xp), bal = (() => { try { return (arclShop.arcl() || {}).bal; } catch { return null; } })(), face = $("wp-lv-face");
  const me = `<button type="button" class="wp-hub-me" data-hub="inv"><img src="${face && face.src ? esc(face.src) : ""}" alt="" width="52" height="52" onerror="this.style.visibility='hidden'"><span class="wp-hub-me-t"><b>${esc(P.name || "ARCIRCLE")}</b><small>Lv ${level()} · ${xq.into.toLocaleString("en-US")} / ${xq.need.toLocaleString("en-US")} XP</small><i class="wp-hub-xp"><i style="width:${Math.min(100, (100 * xq.into) / Math.max(1, xq.need)).toFixed(1)}%"></i></i></span>${bal != null ? `<span class="wp-hub-arcl"><img src="/images/arcl2-64.png${VER}" alt="" width="22" height="22">${Number(bal).toLocaleString("en-US")}</span>` : ""}</button>`;
  hubEl.innerHTML = `<div class="wp-hub-card"><div class="wp-hub-h"><h2>${esc(T("Menu"))}<small class="wp-hub-q" aria-live="polite"></small></h2><button type="button" class="wp-hub-x" data-hub-x aria-label="${esc(T("Close"))}">${ICONS.icon("no", 20)}</button></div>${me}` +
    (rec3.length ? `<section class="wp-hub-recent"><h3>${esc(TW("Recent"))}</h3><div class="wp-hub-grid">${rec3.map((x) => tile(x, "r")).join("")}</div></section>` : "") +
    `<section class="wp-hub-main"><div class="wp-hub-grid">${HUB[0][1].filter(ok).map((x) => tile(x, "g")).join("")}</div></section>` +
    `<section class="wp-hub-more"><h3>${esc(TW("More"))}</h3><div class="wp-hub-grid">${more.filter((x) => IC.has(x[0])).map((x) => tile(x, "m")).join("")}</div><div class="wp-hub-pills">${more.filter((x) => !IC.has(x[0])).map((x) => tile(x, "p")).join("")}</div></section></div>`;
}
// type-to-filter: tiles whose (translated) name holds what was typed; sections left empty hide
function hubFilter() {
  const q = hubQ.toLowerCase(); let first = null;
  hubEl.querySelectorAll("section").forEach((sec) => { let any = false; sec.querySelectorAll("[data-hub]").forEach((b) => { const on = !q || b.querySelector("span").textContent.toLowerCase().includes(q); b.hidden = !on; if (on) { any = true; first = first || b; } }); sec.hidden = !any || (!!q && sec.classList.contains("wp-hub-recent")); });
  const qs = hubEl.querySelector(".wp-hub-q"); if (qs) qs.textContent = q ? " · " + hubQ : "";
  if (first && !coarse) first.focus({ preventScroll: true }); else hubEl.focus({ preventScroll: true });
}
const moreBtn = $("wp-more-btn");
function hubShown() { hubEl.hidden = false; frozen = true; keys.clear(); paintPrompt(); moreBtn.setAttribute("aria-expanded", "true"); const f = hubEl.querySelector("[data-hub]"); if (f && !coarse) f.focus(); }
function openHub() { if (frozen && hubEl.hidden && !jurOn) return; /* (Jurassic World keeps the town frozen; its Menu still opens) */ closeAll(); hubQ = ""; paintHub(); hubShown(); }
// ret: Esc or the X put focus back on the Menu button (a tile that opens a window leaves it to that window)
function closeHub(ret) { if (!hubEl || hubEl.hidden) return; const had = hubEl.contains(document.activeElement); if (had) document.activeElement.blur(); /* a hidden tile keeps no focus (it would swallow the next Esc) */ hubEl.hidden = true; frozen = false; moreBtn.setAttribute("aria-expanded", "false"); if (ret && had && !coarse) moreBtn.focus({ preventScroll: true }); }
// Menu → Recent messages: the last 30 toasts, newest first; bag lines open the bag
function openRecent() {
  closeAll(); hubQ = ""; const now = Date.now(), ago = (t) => { const m = Math.floor((now - t) / 60000); return m < 1 ? TW("now") : m < 60 ? m + "m" : Math.floor(m / 60) + "h"; };
  hubEl.innerHTML = `<div class="wp-hub-card"><div class="wp-hub-h"><h2>${esc(TW("Recent messages"))}</h2><button type="button" class="wp-hub-x" data-hub-x aria-label="${esc(T("Close"))}">${ICONS.icon("no", 20)}</button></div>` +
    (toastHist.length ? `<ol class="wp-recent">${toastHist.map((h) => { const t = `<span>${esc(h.m)}${h.n > 1 ? ` <b>×${h.n}</b>` : ""}</span><small>${ago(h.t)}</small>`; return /bag|scrap|sold|repair|equipped|가방|고철|背包|废料|çanta|hurda/i.test(h.m) ? `<li><button type="button" class="wp-rc" data-hub="inv">${t}</button></li>` : `<li class="wp-rc">${t}</li>`; }).join("")}</ol>` : `<p class="wp-recent-none">${esc(TW("Nothing yet"))}</p>`) + `</div>`;
  hubShown();
}
hubEl.addEventListener("click", (e) => {
  if (e.target === hubEl || e.target.closest("[data-hub-x]")) { closeHub(!!e.target.closest("[data-hub-x]")); return; }
  const b = e.target.closest("[data-hub]"); if (!b) return; const id = b.dataset.hub; closeHub();
  if (b.closest(".wp-hub-grid") && id !== "recent") { hubRecent = [id, ...hubRecent.filter((x) => x !== id)].slice(0, 4); try { localStorage.setItem("arc.world.hubRecent", JSON.stringify(hubRecent)); } catch { /* not kept */ } }
  if (id === "recent") openRecent(); else
  if (id === "petdk") $("wp-dk-pet").click(); else
  if (id === "agent") openAgent(); else
  if (id === "partners") goPartnerVillage(); else
  if (id === "raidq") openRaidQueens(); else if (id === "mythic") openMythic(); else
  if (id === "games") openGames(); else if (id === "invite") referUI.open(); else if (id === "start") openStart(true); else if (id === "rewards") { const rb = $("wp-rew-btn"); if (rb && rb.getClientRects().length) rb.click(); else (document.querySelector(".wp-launch-btn:not([hidden])") || document.querySelector("#wp-gift-btn:not([hidden])") || $("wp-starter-btn")).click(); } else
  if (id === "inv") rpg && rpg.show("inv", "equip"); /* (Inventory lives in Character → Equipment: the owner, 2026-10-24) */
  else if (id === "wardrobe") wardrobe.show();
  else if (id === "make") openMake();
  else if (id === "crew") crewUI.show();
  else if (id === "log") { if (quests && rpg) rpg.show("log"); }
  else if (id === "codex") openCodex();
  else if (["daily", "ach", "season", "codex", "pets", "rank"].includes(id)) { if (quests && rpg) { quests.setTab(id); rpg.show("log"); } }
  else if (id === "shop") arclShop.openShop();
  else if (id === "forge") rpg && rpg.show("forge");
  else if (id === "bench") { if (life) life.showSheet("make"); }
  else if (id === "map") openMap();
  else if (id === "land") { if (land) land.open(); }
  else if (id === "island") island.openIsles(island.friendCount() ? "friends" : "top"); // b406: your island, your friends' and everyone's, to pick from
  else if (id === "village") village.show();
  else if (id === "market") openMarket("market");
  else if (id === "ledger") openMarket("wallet");
  else if (id === "bridge") openBridge();
  else if (id === "inbox") inbox.show();
  else if (id === "chat") chatUI.show();
  else if (id === "defense") goGameVillage();
  else if (id === "photo") setPhoto(true);
  else if (id === "emote") openWheel();
  else if (id === "guide") openGuide();
  else if (id === "help") openHelp();
  else if (id === "arcia") { closeAll(); help.guide(); }
  else if (id === "set") $("wp-set-btn").click();
  else if (id === "music") $("wp-music-btn").click();
});
hubEl.tabIndex = -1;
hubEl.addEventListener("keydown", (e) => {
  if (hubEl.hidden) return;
  if (e.key === "Escape") { e.stopPropagation(); if (hubQ) { hubQ = ""; hubFilter(); } else closeHub(true); return; }
  // arrows walk the tiles in order (left/up back, right/down on), Home/End the ends
  const nav = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1, Home: -2, End: 2 }[e.key];
  if (nav) { const bs = [...hubEl.querySelectorAll("[data-hub]")].filter((b) => !b.hidden && !b.closest("section[hidden]")); if (!bs.length) return; e.preventDefault(); e.stopPropagation(); const i = bs.indexOf(document.activeElement); bs[nav === -2 ? 0 : nav === 2 ? bs.length - 1 : i < 0 ? 0 : (i + nav + bs.length) % bs.length].focus(); return; }
  if (coarse || e.ctrlKey || e.metaKey || e.altKey || !hubEl.querySelector("section")) return;
  if (e.key === "Enter" && hubQ) { e.preventDefault(); e.stopPropagation(); const f = [...hubEl.querySelectorAll("[data-hub]")].find((b) => !b.hidden && !b.closest("section[hidden]")); if (f) f.click(); return; }
  if (e.key === "Backspace" && hubQ) { e.preventDefault(); e.stopPropagation(); hubQ = hubQ.slice(0, -1); hubFilter(); return; }
  if (e.key.length === 1 && e.key !== " " && hubQ.length < 24) { e.preventDefault(); e.stopPropagation(); hubQ += e.key; hubFilter(); }
});
moreBtn.addEventListener("click", (e) => { e.stopPropagation(); if (hubEl.hidden) openHub(); else closeHub(); });
$("wp-shop-btn").addEventListener("click", () => { closeAll(); arclShop.openShop(); });
$("wp-starter-btn").addEventListener("click", () => { closeAll(); openStarter(); });
$("wp-gift-btn").addEventListener("click", () => { closeAll(); openWelcome(); });
{ const l = document.querySelector("#wp-gift-btn .wp-bl"); if (l) l.textContent = TW("Gifts"); }
{ const l = document.querySelector("#wp-starter-btn .wp-st-l"); if (l) l.textContent = T("Starter"); }
$("wp-bag-btn").addEventListener("click", () => { closeAll(); if (rpg) rpg.show("inv"); });
$("wp-log-btn").addEventListener("click", () => { closeAll(); if (rpg) rpg.show("log"); });
// the dock (bottom left): Character, Bag, Craft (the Forge), Build (your island's builder)
// red dots on the dock: new pieces in the bag, new stamps on your island
// and on Character when a bag piece beats what you wear (only written when it changes)
const dkDot = (el, on) => { const v = on ? "1" : ""; if (el && el.dataset.dot !== v) el.dataset.dot = v; };
setInterval(() => { dkDot($("wp-dk-bag"), rpg && rpg.freshN && rpg.freshN()); dkDot($("wp-dk-build"), island.bookNew && island.bookNew()); dkDot($("wp-dk-char"), rpg && rpg.upN && rpg.upN()); }, 2000);
$("wp-dk-char").addEventListener("click", () => { closeAll(); if (rpg) { rpg.pane("gear"); rpg.show("inv"); } });
$("wp-dk-bag").addEventListener("click", () => { closeAll(); if (rpg) { rpg.pane("bag"); rpg.show("inv"); setTimeout(() => { const b = document.querySelector("#wr-inv .wr-bag, #wr-inv .wr-cells"); if (b) b.scrollIntoView({ block: "nearest" }); }, 60); } });
// the Pets button wears a NEW badge until it's opened once
try { if (localStorage.getItem("arc.world.petSeen")) $("wp-dk-pet-new").hidden = true; } catch { /* private mode */ }
// the Exchange ($ARCL ⇄ $ARCIRCLE by request, world-swap.js): loaded the first time it's opened
let swapUi = null;
try { if (localStorage.getItem("arc.world.swapSeen")) $("wp-dk-swap-new").hidden = true; } catch { /* private mode */ }
$("wp-dk-swap").addEventListener("click", async () => {
  $("wp-dk-swap-new").hidden = true; try { localStorage.setItem("arc.world.swapSeen", "1"); } catch { /* private mode */ } closeAll();
  try { if (!swapUi) { let M; try { M = await import("./world-swap.js"); } catch (e) { if (staleReload()) return; throw e; } swapUi = M.createSwap({ T: TW, esc, toast, sess, post, Snd, refresh: () => refreshPurse(true), onClose: () => { if (!jurOn) frozen = false; } }); }
    frozen = true; keys.clear(); await swapUi.open();
  } catch (e) { frozen = false; console.warn("exchange", e); toast(TW("The exchange couldn't open. Try again.")); if (diag && diag.err) diag.err("exchange: " + String((e && e.message) || e), "swap"); }
});
// the Creator Market (world-market.js, b-ec5): blueprints for ARCL, your creator earnings and settlements, your ARCL ledger,
// the team's tab; loaded the first time it's opened
let marketUi = null;
async function sendArc(to, arc) { // a GM's own transfer of $ARCIRCLE on Arc (a settlement): the wallet signs, the server only reads it back
  const tok = /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "", s = sess(); if (!tok || !AC || !s) throw new Error(TW("Wallet connect isn't available here."));
  if (!AC.live || !AC.live()) await AC.connect();
  if (String(addr()).toLowerCase() !== String(s.wallet).toLowerCase()) throw new Error(TW("Switch your wallet to the one you signed in with ({w})", { w: String(s.wallet).slice(0, 6) + "…" + String(s.wallet).slice(-4) }));
  const prov = await AC.provider(); try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }); } catch (e2) { if (e2 && e2.code === 4001) throw e2; }
  const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0"), wei = BigInt(Math.floor(arc)) * 10n ** 18n;
  return prov.request({ method: "eth_sendTransaction", params: [{ from: addr(), to: tok, data: "0xa9059cbb" + pad(to) + pad(wei.toString(16)) }] });
}
/// an EIP-712 signature from the signed-in wallet (a GM's Crimson Celestial NFT voucher: the key stays in the wallet)
async function walletSignTyped(td) {
  const s = sess(); if (!AC || !s) throw new Error(TW("Wallet connect isn't available here."));
  if (!AC.live || !AC.live()) await AC.connect();
  if (String(addr()).toLowerCase() !== String(s.wallet).toLowerCase()) throw new Error(TW("Switch your wallet to the one you signed in with ({w})", { w: String(s.wallet).slice(0, 6) + "…" + String(s.wallet).slice(-4) }));
  const prov = await AC.provider(); try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }); } catch (e2) { if (e2 && e2.code === 4001) throw e2; }
  const data = { types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], ...td.types }, domain: td.domain, primaryType: td.primaryType, message: td.message };
  return prov.request({ method: "eth_signTypedData_v4", params: [addr(), JSON.stringify(data)] });
}
/// one transaction from the player's own wallet on Arc (the agent's vault: open, fund, allow a token, pause, withdraw)
async function walletTx(to, data) {
  const s = sess(); if (!AC || !s) throw new Error(TW("Wallet connect isn't available here."));
  if (!AC.live || !AC.live()) await AC.connect();
  if (String(addr()).toLowerCase() !== String(s.wallet).toLowerCase()) throw new Error(TW("Switch your wallet to the one you signed in with ({w})", { w: String(s.wallet).slice(0, 6) + "…" + String(s.wallet).slice(-4) }));
  const prov = await AC.provider(); try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }); } catch (e2) { if (e2 && e2.code === 4001) throw e2; }
  return prov.request({ method: "eth_sendTransaction", params: [{ from: addr(), to, data }] });
}
async function openMarket(tab) {
  closeAll();
  try { if (!marketUi) { let M; try { M = await import("./world-market.js"); } catch (e) { if (staleReload()) return; throw e; }
      marketUi = M.createMarket({ T: TW, esc, toast, sess, post, Snd, refresh: () => refreshPurse(true), isGM: () => { const s0 = sess(); return !!(s0 && VILL.isGM(String(s0.wallet).toLowerCase())); },
        myCode: async () => (onMyIsland() ? island.myCode() : null), build: async (code, title) => { if (!onMyIsland()) await goIsland({}); setTimeout(() => { try { island.buildCode(code, title); } catch (e) { toast(TW("The blueprint couldn't open. Try again.")); } }, 700); },
        sendArc, onClose: () => { if (!jurOn) frozen = false; } }); }
    frozen = true; keys.clear(); await marketUi.open(tab);
  } catch (e) { frozen = false; console.warn("market", e); toast(TW("The market couldn't open. Try again.")); if (diag && diag.err) diag.err("market: " + String((e && e.message) || e), "market"); }
}
$("wp-dk-pet").addEventListener("click", () => { $("wp-dk-pet-new").hidden = true; try { localStorage.setItem("arc.world.petSeen", "1"); } catch { /* private mode */ } closeAll(); if (quests && rpg) { quests.setTab("pets"); rpg.show("log"); } });
$("wp-dk-craft").addEventListener("click", () => { closeAll(); if (rpg) rpg.show("forge"); });
$("wp-dk-build").addEventListener("click", async () => {
  closeAll();
  if (!onMyIsland()) await goIsland({});
  if (onMyIsland() && !island.building()) island.keyDown({ key: "b", preventDefault() {} });
});
const openVillage = (tab) => { closeAll(); village.show(tab); };
$("wp-vil-btn").addEventListener("click", () => openVillage());
$("wp-vlv").addEventListener("click", () => openVillage());

// ---------------- the Back button (a phone's, or the browser's) ----------------
// With a window open, Back closes it; on the plain game screen it asks before leaving the game.
const leaveEl = document.createElement("div");
leaveEl.className = "wp-leave"; leaveEl.id = "wp-leave"; leaveEl.hidden = true; leaveEl.setAttribute("role", "alertdialog"); leaveEl.setAttribute("aria-modal", "true"); leaveEl.setAttribute("data-no-i18n", "");
leaveEl.innerHTML = `<div class="wp-card wp-leave-card"><h2>${esc(T("Leave ARCIRCLE World?"))}</h2><p>${esc(sess() ? T("Your progress is saved to your wallet.") : T("Your progress stays in this browser."))}</p><div class="wp-leave-btns"><button type="button" class="wp-btn" id="wp-leave-stay">${esc(T("Keep playing"))}</button><button type="button" class="wp-cta" id="wp-leave-go">${esc(T("Leave the game"))}</button></div></div>`;
document.body.appendChild(leaveEl);
let leaving = false;
const guard = () => { try { history.pushState({ wpGuard: 1 }, "", location.href); } catch { /* old browser */ } };
function closeLeave() { if (leaveEl.hidden) return false; leaveEl.hidden = true; frozen = false; keys.clear(); paintPrompt(); return true; }
function backAction() {
  if (closeLeave()) return true;
  if (combat && combat.vitals().down) return true; // knocked out: the choice on screen stays
  if (photo) { setPhoto(false); return true; }
  if (!wheel.hidden) { wheel.hidden = true; return true; }
  if (mode === "island" && island.keyDown({ key: "Escape", preventDefault() {} })) return true;
  { const xs = [...document.querySelectorAll(".ccw-x, .my-sheet-x, .my-x, .wx-x, .wmk-x, .wbr-x, .cx-x, .wpt-x, .aga-x, .wag-x, .wa-x, .wr-d-x, .wr-raid-x, .wz-pack-x, .rq-x")].filter((e) => e.getClientRects().length && !e.disabled); if (xs.length) { xs[xs.length - 1].click(); return true; } } /* (the owner, 2026-10-27: Back closes the window on top with its own ×, the newest first) */
  if (studio && studio.back()) return true; /* (the Studio, its runs and builders: one step back at a time) */
  if (frozen) { closeAll(); return true; }
  if (mode === "island" && island.building()) { island.keyDown({ key: "b", preventDefault() {} }); return true; }
  return false;
}
addEventListener("popstate", () => {
  if (leaving) return;
  if (!backAction()) { leaveEl.querySelector("p").textContent = sess() ? T("Your progress is saved to your wallet.") : T("Your progress stays in this browser."); leaveEl.hidden = false; frozen = true; keys.clear(); setTimeout(() => $("wp-leave-stay").focus(), 30); }
  guard();
});
leaveEl.addEventListener("click", (e) => {
  if (e.target.id === "wp-leave-stay" || e.target === leaveEl) closeLeave();
  if (e.target.id === "wp-leave-go") { leaving = true; cloudSave(); history.go(-2); setTimeout(() => { (window.__arcFrame ? window.top : window).location.href = "/"; }, 500); }
});
guard();
$("wp-set-help").addEventListener("click", () => openHelp());
if (coarse) $("wp-keys").hidden = true; else $("wp-acts").hidden = true;

// ---------------- HUD context: combat focus, the key legend, the quest distance, controller glyphs ----------------
// combat focus: while you fight (body.wc-fight, world-combat.js) the dock, the shop and starter tiles and the feed step
// back (world-skin.css body.wp-focus), leaving HP/SP, the skills, the boss bar and the minimap; the legend shows the
// fight keys for a few seconds, then goes too (wp-focus-k). It all comes back 2 s after the fight ends
let focusT = 0, focusK = 0;
new MutationObserver(() => {
  const b = document.body.classList, f = b.contains("wc-fight");
  if (f) { clearTimeout(focusT); focusT = 0; if (!b.contains("wp-focus")) { b.add("wp-focus"); clearTimeout(focusK); focusK = setTimeout(() => b.add("wp-focus-k"), 5000); } }
  else if (b.contains("wp-focus") && !focusT) focusT = setTimeout(() => { focusT = 0; clearTimeout(focusK); b.remove("wp-focus", "wp-focus-k"); }, 2000);
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });
// the key legend shows only what works right now: at a door E and what it does, in a fight the fight keys, on a ride
// its keys, otherwise walking. With a controller its buttons instead (drawn glyphs: A B X Y, LB RB, the sticks)
const padG = (g) => `<i class="wp-pad wp-pad-${g === "↑" ? "up" : g === "↓" ? "dn" : g === "☰" ? "st" : g.toLowerCase()}">${esc(g)}</i>`;
const keyRows = (ctx) => {
  const near1 = ctx.startsWith("near:") ? ctx.slice(5) : "", ride1 = ctx.startsWith("ride:") ? ctx.slice(5) : "";
  const move = { k: ["W", "A", "S", "D"], p: ["L"], w: W("move") }, jumpR = { k: ["Space"], p: ["A"], w: W("jump") };
  if (ctx === "fight") return [{ k: ["J"], p: ["X"], w: W("attack") }, { k: ["K"], p: ["B"], w: W("dodge") }, { k: ["Z"], p: ["Y"], w: W("skill") }, { k: ["Q"], p: ["LB", "RB"], w: T("switch skill") }, { k: ["4", "5"], p: ["LT", "RT"], w: W("potions") }, { k: ["Tab"], p: null, w: T("lock on") }, move];
  if (near1) return [{ k: ["E"], p: ["↓"], w: W(near1 === "bounty" ? "read" : near1 === "npc" || near1 === "resident" ? "talk" : near1 === "pad" || near1 === "portal" || near1 === "isle" || near1 === "isle-exit" ? "go" : "enter") }, move, jumpR];
  if (ride1) return [move, ride1 === "jet" ? { k: ["Space"], p: ["A"], w: T("climb / descend") } : jumpR, { k: ["Shift"], p: null, w: W("speed") }, level() >= 10 ? { k: ["V"], p: null, w: T("switch ride") } : null, { k: ["F"], p: null, w: T("get off") }];
  return [move, jumpR, { k: ["Shift"], p: null, w: W("run") }, { k: ["F"], p: null, w: W("board") }, { k: ["1", "2"], p: ["↑"], w: W("emote") }, { k: ["M"], p: ["☰"], w: W("map") }, { k: ["H"], p: null, w: W("help") }, { k: null, p: ["R"], w: W("look") }, { k: [], p: null, w: W("drag to look") }];
};
let keysCtx = "", qdEl = null, qdN = -1; const qdV = new THREE.Vector3();
function paintKeys(ctx) {
  const el = $("wp-keys"); if (!el) return;
  const pad = gpad.on, sig = ctx + (pad ? "|pad" : "") + "|" + (level() >= 10);
  el.hidden = coarse && !pad; document.body.classList.toggle("wp-gpad", pad);
  if (sig === keysCtx) return; keysCtx = sig;
  const rows = keyRows(ctx).filter((r) => r && (pad ? r.p : r.k));
  el.innerHTML = rows.map((r) => (pad ? r.p.map(padG) : r.k.map((k) => `<kbd>${esc(k)}</kbd>`)).join("") + " " + esc(r.w)).join(" <span>·</span> ");
  el.dataset.ctx = ctx.split(":")[0]; el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap");
  const pk = document.querySelector("#wp-enter kbd"); if (pk) pk.innerHTML = pad ? padG("↓") : "E";
}
setInterval(() => {
  if (!worldReady) return;
  const ctx = document.body.classList.contains("wc-fight") ? "fight" : near && near.kind && !frozen ? "near:" + near.kind : boarding && mode === "hub" ? "ride:" + ride : "walk";
  paintKeys(ctx);
  // the distance to the quest's target on the quest line ("· 42 m"), written only when the number changes
  const li = document.querySelector("#wp-quests-l li.cur .wp-qdist"); if (li !== qdEl) { qdEl = li; qdN = -1; }
  if (!qdEl) return;
  let n = -2; if (questTarget && mode === "hub") { questTarget.getWorldPosition(qdV); n = Math.round(qdV.distanceTo(at)); }
  if (n !== qdN) { qdN = n; qdEl.textContent = n >= 0 ? ` · ${n.toLocaleString("en-US")} m` : ""; }
}, 250);
addEventListener("gamepaddisconnected", () => { if (!(navigator.getGamepads ? [...navigator.getGamepads()] : []).some((g) => g && g.connected)) toast(T("Controller disconnected")); });

// ---------------- day and night (US Eastern time, etHour) ----------------
// a blue day sky over the ground, stars and the far planets at night (?hour=21 tries another hour)
const skyU = sky.material.uniforms, DAY = { top: new THREE.Color(0x0e4ed2), mid: new THREE.Color(0x2c9af2), glow: new THREE.Color(0x92d8fc) } /* b420: a clear, saturated anime blue, light cyan at the horizon (deeper than it reads: tone mapping pales it) */, NIGHT = { top: new THREE.Color(0x02030a), mid: new THREE.Color(0x07102a), glow: new THREE.Color(0x173452) }, DUSK = new THREE.Color(0xf0a070);
const HALLOW_FOG = new THREE.Color(0x2a1840); // Halloween nights: a violet fog
const FOG = { day: new THREE.Color(0x9ccff5), /* b440: bluer still: where far grass met the haze it read grey-green */ /* a bluer day haze: distance reads as air, not milk (b420: the horizon's light cyan) */ night: new THREE.Color(0x0b1830), dusk: new THREE.Color(0xd99a80) };
const hourParam = Number(new URLSearchParams(location.search).get("hour"));
let nightK = -1, skyOverride = "";
// island skies from the ARCL Shop
// island skies (world-style.js has the rest of each style); a style without an entry keeps the real day and night
const THEMES = {
  "style-tropical": { top: 0x1f7fd8, mid: 0x7ed6f0, glow: 0xdff6fb, fog: 0xbfe6f0 },
  "style-snow": { top: 0x5f88b8, mid: 0xbcd4ea, glow: 0xf2f7fb, fog: 0xdde8f2 },
  "style-sakura": { top: 0x6a8fd8, mid: 0xf2b8d8, glow: 0xffe6f2, fog: 0xf6d6e6, cloud: 0xffe2f0 },
  "style-desert": { top: 0x3b2c78, mid: 0xf0905e, glow: 0xffd09a, fog: 0xeaa98c, cloud: 0xffd8b8 },
  "style-ocean": { top: 0x1f7fd8, mid: 0x7ed6f0, glow: 0xdff6fb, fog: 0xbfe6f0 },
  "style-aurora": { top: 0x020814, mid: 0x0a2240, glow: 0x1a5a62, fog: 0x0c1d33, aurora: true, dark: true, cloud: 0x2a3a5a },
  "style-celestial": { top: 0x7fb4ff, mid: 0xe6f0ff, glow: 0xfff6dc, fog: 0xf0f4ff },
  "style-volcano": { top: 0x1a0606, mid: 0x5a1a10, glow: 0xff7a3a, fog: 0x3a1a14, dark: true, cloud: 0x4a2a26 },
};
// fireflies over the town at night: soft green-gold specks that drift and blink
const fireflies = (() => {
  const N = reduce ? 30 : 90, pos = new Float32Array(N * 3), base = [];
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 70; base.push([Math.cos(a) * r, 0.6 + Math.random() * 2.4, Math.sin(a) * r, Math.random() * 10]); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dot = document.createElement("canvas"); dot.width = dot.height = 32; { const g = dot.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }
  const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), color: 0xd8ff8a, size: 0.55, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.visible = false; planet.add(pts);
  pts.userData.update = (t) => { for (let i = 0; i < N; i++) { const b = base[i], s = b[3]; pos[i * 3] = b[0] + Math.sin(t * 0.3 + s) * 1.6; pos[i * 3 + 1] = b[1] + Math.sin(t * 0.7 + s * 2) * 0.4; pos[i * 3 + 2] = b[2] + Math.cos(t * 0.25 + s) * 1.6; } geo.attributes.position.needsUpdate = true; mat.size = 0.45 + Math.sin(t * 3) * 0.12; };
  return pts;
})();
// outdoor light on the shiny surfaces: the sky's own colours over a green ground as the environment map (it was a
// studio room before), redone when the day has turned a little
const skyEnv = (() => {
  const pm = new THREE.PMREMGenerator(st.renderer), sc = new THREE.Scene(), geo = new THREE.SphereGeometry(10, 32, 16);
  const col = new Float32Array(geo.attributes.position.count * 3); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  let rt = null, lastK = -1; const c = new THREE.Color(), ground = new THREE.Color();
  return (k) => {
    if (rt && Math.abs(k - lastK) < 0.08) return; lastK = k;
    const top = skyU.top.value, mid = skyU.mid.value, glow = skyU.glow.value, p = geo.attributes.position;
    ground.set(0x4c8a52).lerp(new THREE.Color(0x0a1410), k);
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 10; if (y > 0.25) c.copy(mid).lerp(top, (y - 0.25) / 0.75); else if (y > -0.05) c.copy(glow).lerp(mid, Math.max(0, y) / 0.25); else c.copy(ground); col[i * 3] = c.r * 1.6; col[i * 3 + 1] = c.g * 1.6; col[i * 3 + 2] = c.b * 1.6; }
    geo.attributes.color.needsUpdate = true;
    const old = rt; rt = pm.fromScene(sc, 0.03); st.scene.environment = rt.texture; if (old) old.dispose();
  };
})();
// the air for the post chain: low fog thicker at dawn, dusk and night and in some grounds, sun shafts by day, heat over lava
const AIR_FOG = { swamp: 0.018, peaks: 0.01, void: 0.008, wastes: 0.012, reef: 0.01, depths: 0.008, abyss: 0.006 };
function airFor(k, dusk, zz) {
  const id = zz ? zz.id : "", col = new THREE.Color(0xbfe6fb).lerp(new THREE.Color(0x1a2440), k).lerp(new THREE.Color(0xf0c8a0), dusk);
  if (zz) col.lerp(new THREE.Color(zz.fog), 0.6);
  return { fog: 0.0008 + dusk * 0.012 + k * 0.0047 + (AIR_FOG[id] || 0), color: col, rays: (1 - k) * (0.25 + dusk * 0.6) * (/^(abyss|void|depths)$/.test(id) ? 0.3 : 1), heat: id === "abyss" ? 1 : 0, sunColor: st.sun.color };
}
const MOONC = new THREE.Color(0x9fb8ff); // moonlight
const CLOUD = { night: new THREE.Color(0x3a4660), dusk: new THREE.Color(0xffc8a0), shade: new THREE.Color(0xb2cdf2), /* a soft blue underside */ nshade: new THREE.Color(0x141a2a), dshade: new THREE.Color(0xc87a7a) };
// the town's clock is US Eastern (the owner's call, 2026-10-23: night 20:00–05:00 there, the same as the Pumpkin Kings')
const ET_FMT = (() => { try { return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); } catch { return null; } })();
function etHour(t = Date.now()) {
  if (ET_FMT) try { const p = {}; for (const x of ET_FMT.formatToParts(new Date(t))) p[x.type] = x.value; return (+p.hour % 24) + (+p.minute) / 60; } catch { /* below */ }
  const d = new Date(t - 5 * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; // no time-zone data: Eastern standard time
}
function dayNight() {
  const h = photoHour != null ? photoHour : Number.isFinite(hourParam) && new URLSearchParams(location.search).has("hour") ? hourParam : etHour();
  const k = h >= 20 || h < 5 ? 1 : h >= 17 ? (h - 17) / 3 : h < 7 ? 1 - (h - 5) / 2 : 0;
  if (Math.abs(k - nightK) < 0.01) return; nightK = k;
  // skyEnv is made further down the module, past awaits: a first call that comes too early tries again next time
  setTimeout(() => { try { skyEnv(k); } catch { nightK = -1; } }, 0);
  const dusk = Math.max(0, 1 - Math.abs(k - 0.5) * 2.4);
  if (grade) grade.set(k, dusk);
  if (fxPost) { const zz = mode === "hub" && combat ? combat.zone() : null;
    // b447: the Game Village has its own grade too, easing in over the last 12 m before its edge
    let gz = zz && zz.id, gk = 1; if (!gz && mode === "hub") { const v = here(tmpV3 || (tmpV3 = new THREE.Vector3())), dv = Math.hypot(v.x - GV.VILLAGE.x, v.z - GV.VILLAGE.z); if (dv < GV.VILLAGE.r + 12) { gz = "village"; gk = Math.min(1, (GV.VILLAGE.r + 12 - dv) / 12); } }
    if (lgrade.set(k, dusk, gz, gk)) fxPost.setLut(lgrade.tex()); fxPost.setAir(airFor(k, dusk, zz)); }
  ["top", "mid"].forEach((n) => skyU[n].value.copy(DAY[n]).lerp(NIGHT[n], k));
  skyU.glow.value.copy(DAY.glow).lerp(NIGHT.glow, k).lerp(DUSK, dusk * 0.7);
  // an aurora on one night in three (by the US Eastern date), or with ?aurora=1; strongest in the deep of the night
  if (skyU.uAur) { const q = new URLSearchParams(location.search).get("aurora"), d = Math.floor((Date.now() - 5 * 3600e3 - 12 * 3600e3) / 864e5), on = q === "1" || (q !== "0" && d % 3 === 0); skyU.uAur.value = on ? Math.max(0, (k - 0.55) / 0.45) : 0; }
  st.sun.intensity = 2.15 * (1 - k * 0.62); st.sun.color.setHSL(0.09, 0.35 * (1 - k) + dusk * 0.6, 0.97 - dusk * 0.12); // a warm afternoon sun; a cool moonlight at night
  st.sun.color.lerp(MOONC, k * 0.6);
  st.hemi.intensity = 0.95 * (1 - k * 0.4); st.scene.environmentIntensity = 0.42 + k * 0.25; if (ENV.rimStrength) ENV.rimStrength.value = 0.16 + k * 0.18; st.renderer.toneMappingExposure = 0.8 + k * 0.22; /* a calmer day: the white plaza was glaring */
  const mist = h >= 5 && h < 8.5 ? Math.sin(((h - 5) / 3.5) * Math.PI) : 0; // early morning: a mist that lifts by half past eight
  if (st.scene.fog) st.scene.fog.density = (st.quality.coarse ? 0.0024 : 0.0016) + k * (st.quality.coarse ? 0.0032 : 0.004) + mist * 0.006; /* b420: a clearer day, far hills keep their colour (phones a little less: their culling at 110 m has no fade); nights as before */ ENV.CLOUD.k.value = Math.max(0, 1 - k * 1.4) * ((() => { try { return mood === "rain"; } catch { return false; } })() ? 1.4 : 1); /* cloud shadows by day, more on a rainy one */ st.hemi.color.set(k > 0.5 ? 0x9fd0ff : 0xcfe8ff); lamps.userData.night(k); if (K.arcNight) K.arcNight(k);
  if (st.scene.fog) st.scene.fog.color.copy(FOG.day).lerp(FOG.night, k).lerp(FOG.dusk, dusk * 0.5); if (halloween && st.scene.fog) st.scene.fog.color.lerp(HALLOW_FOG, k * 0.55); if (pumpkins) pumpkins.glow(k);
  stars.material.opacity = 0.85 * k; stars.visible = k > 0.02;
  skyPlanets.children.forEach((p) => { p.material.opacity = 0.95 * k; }); skyPlanets.visible = k > 0.02;
  clouds.userData.mat.color.setHSL(0.6, 0.15, 1 - k * 0.72); clouds.userData.mat.emissiveIntensity = 0.25 * (1 - k);
  const th = THEMES[skyOverride];
  if (th) {
    skyU.top.value.set(th.top); skyU.mid.value.set(th.mid); skyU.glow.value.set(th.glow); if (st.scene.fog) st.scene.fog.color.set(th.fog);
    st.sun.intensity = th.dark ? 0.9 : 2.1; st.hemi.intensity = th.dark ? 0.45 : 0.75; lamps.userData.night(th.dark ? 1 : 0);
    stars.visible = !!th.dark; stars.material.opacity = th.dark ? 0.85 : 0;
    if (th.cloud != null) { clouds.userData.mat.color.set(th.cloud); clouds.userData.mat.emissiveIntensity = th.dark ? 0.05 : 0.25; }
  }
  { const u = sky.material.uniforms; if (u.uCloudLit) { // the drifting cloud layer: white by day, peach at dusk, slate at night
    u.uCloudLit.value.setRGB(1.3, 1.3, 1.3).lerp(CLOUD.night, k).lerp(CLOUD.dusk, dusk * 0.8); u.uCloudShade.value.copy(CLOUD.shade).lerp(CLOUD.nshade, k).lerp(CLOUD.dshade, dusk * 0.6);
    u.uSunCol.value.copy(st.sun.color); u.uCloudK.value = 1 - k * 0.7; u.uNight.value = th && th.dark ? 1 : k; u.uCover.value = mood === "rain" ? 0.3 : 0.48;
    if (th && th.cloud != null) { u.uCloudLit.value.set(th.cloud); u.uCloudShade.value.set(th.cloud).multiplyScalar(0.6); } } }
  ambNight = th && th.dark ? 1 : k;
  if (K.TOON) { K.TOON.rimK.value = 0.5 - k * 0.15 + dusk * 0.2; K.TOON.rim.value.set(0x9fd8ff).lerp(new THREE.Color(0x7a8cff), k).lerp(new THREE.Color(0xffb37a), dusk * 0.7); } // the characters' rim light
  if (grass && lamps.userData.spots) grass.setLamps(lamps.userData.spots, th && th.dark ? 1 : k);
  if (grass) grass.setLight((th && th.dark ? 0.3 : 1 - k * 0.7) * (wet ? 0.82 : 1), k > 0.5 ? 0x5a9a8a : 0x7cc65a);
  for (const u of reflU) u.uLight.value = 1 - k * 0.55;
  for (const m of waterMats) { m.uniforms.uLight.value = 1 - k * 0.6; m.uniforms.uSky.value.copy(skyU.mid.value).lerp(skyU.glow.value, 0.3); m.uniforms.uSunCol.value.copy(st.sun.color); }
  aurora.visible = (th && th.aurora) || mood === "aurora";
  fireflies.visible = k > 0.4 && !th; fireflies.material.opacity = Math.min(1, (k - 0.4) * 2) * 0.9;
  // inside a hunting ground the air takes its colour
  const zz = combat && combat.zone(); if (zz && st.scene.fog && mode === "hub") { st.scene.fog.color.lerp(new THREE.Color(zz.fog), 0.65); if (zz.id === "depths") { skyU.top.value.lerp(new THREE.Color(0x0a0618), 0.6); skyU.mid.value.lerp(new THREE.Color(0x1a1030), 0.6); } }
}
setInterval(dayNight, 60000);

// ---------------- camera: a building between the camera and the player turns see-through ----------------
const ray = new THREE.Raycaster(); ray.camera = st.camera; let camFit = 1, colT = 0;
const ghosted = new Map(), ghostMats = new Map();
const ghostOf = (m) => { let g = ghostMats.get(m); if (!g) { g = m.clone(); g.transparent = true; g.opacity = 0.14; g.depthWrite = false; ghostMats.set(m, g); } return g; };
function ghost(group, on) {
  if (on === !!ghosted.get(group)) return;
  group.traverse((o) => {
    if (!o.isMesh || o.isSprite) return;
    if (on) { if (!o.userData.mat0 && !o.material.transparent) { o.userData.mat0 = o.material; o.material = Array.isArray(o.material) ? o.material.map(ghostOf) : ghostOf(o.material); o.castShadow = false; } }
    else if (o.userData.mat0) { o.material = o.userData.mat0; o.userData.mat0 = null; o.castShadow = true; }
  });
  if (on) ghosted.set(group, true); else ghosted.delete(group);
}
function camCollide(target) {
  const head = new THREE.Vector3(0, hop + 1.6, 0), dirC = target.clone().sub(head), len = dirC.length(); dirC.normalize();
  ray.set(head, dirC); ray.far = len;
  const close = [];
  const lists = mode === "island" ? [] : [shops, town, coinBuildings, arches, adc && landNow === "ad" ? adc.occluders() : []]; // (AD-City 1.5: Nexus City's buildings, its spire and the raised ring too)
  for (const list of lists) for (const g of list) { g.getWorldPosition(tmp); if (tmp.distanceTo(head) < len + 7) close.push(g); }
  // inside a hunting ground: its tall props too (the Dark Market's obelisks filled the screen with black)
  if (zoneRoot && mode !== "island") { const px = -planet.position.x, pz = -planet.position.z, now = performance.now();
    for (const g of zoneRoot.children) { const zn = g.userData && g.userData.zone; if (!zn || Math.hypot(px - zn.x, pz - zn.z) > zn.r + 6) continue;
      if (!g.userData.tallAt || now - g.userData.tallAt > 5000) { g.userData.tallAt = now; const tall = []; g.traverse((o) => { if (!o.isMesh || o.isSprite || o.name === "zone-ground" || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; if (bb.max.y - bb.min.y > 1.6 || o.position.y > 1.2) tall.push(o); }); g.userData.tall = tall; }
      close.push(...g.userData.tall); } }
  const hits = new Set();
  if (close.length) for (const h of ray.intersectObjects(close, true)) { if (!h.object.isMesh || h.object.isSprite || h.distance < 0.4) continue; let o = h.object; while (o.parent && !close.includes(o)) o = o.parent; if (close.includes(o)) hits.add(o); }
  for (const g of [...ghosted.keys()]) if (!hits.has(g)) ghost(g, false);
  hits.forEach((g) => ghost(g, true));
  // a little pull-in only when something is right behind the head
  let fit = 1;
  if (mode === "island" && !island.building()) { // player-built walls: march the grid (no mesh raycasts) and pull in before the first solid cell
    const px = -planet.position.x, pz = -planet.position.z, n = Math.ceil(len / 0.5);
    for (let i = 1; i <= n; i++) { const k = i / n; if (island.solidAt(px + target.x * k, head.y + (target.y - head.y) * k, pz + target.z * k)) { fit = Math.max(0.2, (i - 1.6) / n); break; } }
  }
  camFit = fit < camFit ? fit : THREE.MathUtils.lerp(camFit, fit, 0.08);
}

// ---------------- frame rate watch: drop quality once if the device can't keep up ----------------
let fpsAcc = 0, fpsN = 0, fpsT0 = performance.now(), degraded = false, liteFx = !!(S.quality === "auto" && st.quality.weak); /* (the weakest chips: fewer sparks from the start) */
// dynamic resolution (Auto). A change resizes every render target, which is itself a hitch, so it changes rarely:
// down a step after two slow 4-second spells in a row (under 38 fps), back up only after 20 s of 58+, and never
// within 20 s of the last change (at most twice up a session, so it can't see-saw)
const dynStart = performance.now(); let dynK = 1, dynAcc = 0, dynN = 0, dynT0 = performance.now(), dynGood = 0, dynBad = 0, dynLast = 0, dynUps = 0, capBad = 0;
// b441: AC Defense and Coin Jump on a phone: half the grass (its blades are in random order, so it thins evenly) and
// a quicker dynamic resolution while the game is on; all back on leaving
let gameOn = false;
// b-perf2: the weakest chips (K.gpuWeak, Auto) start where the slow-frame steps would take them anyway: half the grass
// and 85 % of the pixels (dynRes can still go down to 60 %), so their first minute isn't spent finding it out
if (S.quality === "auto" && st.quality.weak && !navigator.webdriver) { const wk = st.on(() => { try { if (!grass || !grass.mesh) return; } catch { return; } grassThin = true; try { const g = grass.mesh.geometry; if (g.userData.full == null) g.userData.full = g.instanceCount; g.instanceCount = 0; } catch { /* no grass */ } if (st.scale && dynK > 0.7) { dynK = 0.7; st.scale(dynK); } /* (IDEA2 2026-10-27, diag: PowerVR GE8320 / Mali-G52 still under 15 fps at 85 % and half the grass — their cost is pixels: 70 % and no grass from the start, and dynRes may go to 50 %) */ if (typeof wk === "function") wk(); }); }
st.on(() => { let on = false; try { on = !!(defenseOn || jumpOn || beatOn); } catch { return; } if (on === gameOn) return; gameOn = on; dynBad = 0;
  try { if (coarse && grass && grass.mesh) { const g = grass.mesh.geometry; if (g.userData.full == null) g.userData.full = g.instanceCount; g.instanceCount = st.quality.weak && S.quality === "auto" && !navigator.webdriver ? 0 : on || grassThin ? Math.round(g.userData.full * 0.5) : g.userData.full; } } catch { /* no grass */ } });
// RAID QUEENS on a phone (2026-10-26, the owner: the phone got hot in raids): a quick phone ran the light raid scene
// flat out at 60 fps and full pixels for minutes. While you're in its land a phone runs at an even 30 and at most 85 %
// of the pixels (a frame limit you chose in Settings stays yours); all back on leaving
const RQ_COOL = { fps: 30, k: 0.85 };
let rqCool = false, rqK = 0;
st.on(() => { let on = false; try { on = !!coarse && landNow === "rq"; } catch { return; } if (on === rqCool) return; rqCool = on; dynBad = 0; dynGood = 0;
  if (S.quality === "auto" && st.scale) { if (on && dynK > RQ_COOL.k) { rqK = dynK; dynK = RQ_COOL.k; st.scale(dynK); } else if (!on && rqK) { dynK = Math.max(dynK, rqK); rqK = 0; st.scale(dynK); } } });
// PF1 (2026-10-27, the owner: "렉·발열 전부 진행"): diag showed phones running 60 fps nearly everywhere (140 reports to 11),
// the GPU never resting. A phone on Auto (no limit picked in Settings) runs an even 30 where you walk, build or read —
// the town, every land, Creator City, the Studio's windows, menus — and up to 60 only in the fast games (Survivors, the
// Game Village games, the hoverboard race, a Studio run); a limit you picked stays yours everywhere
const fastNow = () => { try { return !!(survOn || defenseOn || jumpOn || beatOn || (race && race.racing && race.racing()) || (studio && studio.playing && studio.playing())); } catch { return false; } };
const capNow = () => S.fpsCap || (coarse ? (fastNow() && !rqCool ? autoCap || 60 : 30) : autoCap || 60);
{ let capWas = 0; const capTick = () => { const c = capNow(); if (c !== capWas) { capWas = c; st.fps(c); dynBad = 0; dynGood = 0; } }; capTick(); setInterval(capTick, 400); }
function dynRes(dt) {
  if (S.quality !== "auto" || degraded || photo || navigator.webdriver || !st.scale) return;
  dynAcc += dt; dynN++; if (performance.now() - dynT0 < 4000 || dynAcc < 1.5) return;
  const fps = dynN / dynAcc, now = performance.now(); dynAcc = 0; dynN = 0; dynT0 = now;
  // b411: slow means under 80% of the limit on a phone (48 of 60: phones sat at 40–50 and never eased off) and 70% on
  // a computer; it was 63% for both
  // b447: a phone already at the fewest pixels and still under 40 fps judders between 30 and 45: an even 30 looks smoother
  if (st.quality.coarse && dynK <= 0.6 && fps < (S.fpsCap || 60) * 0.8 && !liveShOff && now - dynLast > 20000 && bakedShadows()) { dynLast = now; dynBad = 0; return; } // b447: then the live shadow goes
  if (st.quality.coarse && !S.fpsCap && !autoCap && liveShOff && dynK <= 0.6 && fps < 40) { if (++capBad >= 2) { autoCap = 30; st.fps(30); } } else capBad = 0;
  const capF = capNow(); dynBad = fps < capF * (st.quality.coarse ? (now - dynStart > 600000 ? 0.9 : 0.8) : 0.7) ? dynBad + 1 : 0; /* b448: after 10 minutes a phone is warm: ease off a step earlier */ dynGood = fps > capF * 0.96 ? dynGood + 1 : 0; // relative to the frame limit
  if (now - dynLast < (gameOn ? 8000 : 20000)) return;
  // b447: on a phone the grass goes to half before the first pixel goes (the blades are back on phones and cost)
  if (dynBad >= (gameOn ? 1 : 2) && st.quality.coarse && !grassThin && grass && grass.mesh) { grassThin = true; try { const g = grass.mesh.geometry; if (g.userData.full == null) g.userData.full = g.instanceCount; g.instanceCount = Math.round(g.userData.full * 0.5); } catch { /* no grass */ } dynBad = 0; dynLast = now; return; }
  const dynMin = st.quality.weak ? 0.5 : 0.6;
  if (dynBad >= (gameOn ? 1 : 2) && dynK > dynMin) { /* b441: in a Game Village game one slow spell is enough */ dynK = Math.max(dynMin, dynK - 0.15); dynBad = 0; dynLast = now; st.scale(dynK); }
  else if (dynGood >= 5 && dynK < 1 && dynUps < 2) { dynK = Math.min(rqCool ? RQ_COOL.k : 1, dynK + 0.15); dynGood = 0; dynUps++; dynLast = now; st.scale(dynK); }
}
function watchFps(dt) {
  if (st.idle) st.idle(!!(frozen && !photo && !introOn && !flying), !!(studio && studio.shown())); // a menu is open: the world behind it rests (STB7: the Studio covers it all — 2 fps)
  if (frozen) { fpsAcc = 0; fpsN = 0; fpsT0 = performance.now(); dynAcc = 0; dynN = 0; dynT0 = performance.now(); return; }
  dynRes(dt);
  if (liteFx || S.quality !== "auto" || photo || navigator.webdriver) return;
  fpsAcc += dt; fpsN++;
  if (performance.now() - fpsT0 > 9000 && fpsAcc > 4) {
    // still slow after that: fewer sparks and puffs in fights
    if (degraded) { if (fpsN / fpsAcc < 22) { liteFx = true; toast(T("Fewer effects to keep things smooth")); } fpsAcc = 0; fpsN = 0; fpsT0 = performance.now(); return; }
    // slow: first fewer pixels (twice at most), and only then no bloom and no shadows
    if (fpsN / fpsAcc < capNow() * 0.43 && !(st.lighter && st.lighter()) && !(st.softer && st.softer())) { degraded = true; st.degrade(); toast(T("Graphics lowered to keep things smooth")); }
    fpsAcc = 0; fpsN = 0; fpsT0 = performance.now();
  }
}

// ---------------- the loop ----------------
const cam = st.camera;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), base = new THREE.Vector3();
let animState = "", npcT = 0, introOn = false, landUntil = 0, hoverT = 0, idleT = 0, idleNext = 7, turnNow = 0, afk = false, afkYaw = 0;
// any input at all (a mouse move too) wakes you from sitting idle; the pad's sticks count through lastInput
let actAt = performance.now(); for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) addEventListener(ev, () => { actAt = performance.now(); }, { passive: true, capture: true });
// phones: keep the screen awake while playing (long fishing waits, Defense waves); let it sleep after 5 idle minutes
let wl = null, wlAsk = false;
const wlGet = async () => { if (wl || wlAsk || document.hidden) return; wlAsk = true; try { wl = await navigator.wakeLock.request("screen"); wl.addEventListener("release", () => { wl = null; }); } catch { wl = null; } wlAsk = false; };
if (coarse && navigator.wakeLock) {
  addEventListener("pointerdown", wlGet, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && performance.now() - actAt < 300000) wlGet(); });
  setInterval(() => { if (wl && performance.now() - actAt > 300000) { wl.release().catch(() => {}); wl = null; } }, 30000);
}
// stepping into the portal: drawn in (smaller, spinning, toward its middle), the screen fills with light and the view
// widens, then off to the platform (0.6 s); a tap or a key goes straight there. Back from it (bfcache), all is undone
const PULL_MS = 620; let pull = null;
const pullGo = () => { (window.__arcFrame ? window.top : window).location.href = "/?skip"; };
function portalGo(g) {
  if (pull) return;
  if (reduce) { pullGo(); return; }
  const p = g.getWorldPosition(new THREE.Vector3()).sub(planet.position); // its spot in the world group
  pull = { t0: performance.now(), k: 0, from: planet.position.clone(), to: new THREE.Vector3(-p.x, 0, -p.z), done: false };
  frozen = true; if (Snd.dash) Snd.dash(); vfx.teleport(here(), { color: 0x7fe9ff, color2: 0x2f86ff });
  const skip = () => { if (pull && !pull.done) { pull.done = true; pullGo(); } };
  setTimeout(() => { addEventListener("pointerdown", skip, { once: true }); addEventListener("keydown", skip, { once: true }); }, 0); // not the tap or key that opened it
}
function stepPull() {
  const k = Math.min(1, (performance.now() - pull.t0) / PULL_MS), e = k * k * (3 - 2 * k); pull.k = e;
  planet.position.lerpVectors(pull.from, pull.to, e * 0.85);
  player.scale.setScalar(Math.max(0.05, 1 - 0.95 * e * e)); player.position.y = hop + e * 0.9; if (avatar) avatar.obj.rotation.y = facing + e * e * Math.PI * 6;
  tpGlow.visible = true; tpGlow.material.opacity = e; tpGlow.scale.setScalar(1.2 + 3 * e);
  tpFlash.style.opacity = String(THREE.MathUtils.smoothstep(k, 0.35, 0.95));
  if (k >= 1 && !pull.done) { pull.done = true; pullGo(); }
}
addEventListener("pageshow", (e) => { if (!e.persisted || !pull) return; planet.position.copy(pull.from); pull = null; player.scale.set(1, 1, 1); tpGlow.visible = false; tpFlash.style.opacity = ""; frozen = false; });
const tmpTr = new THREE.Vector3();
// walking up to a building: it gives a small springy nod, as if the door just opened for you
function greet(g) {
  if (g.userData.greeting) return; g.userData.greeting = true; const y0 = g.scale.y, x0 = g.scale.x, t0 = performance.now();
  const off = st.on(() => { const k = Math.min(1, (performance.now() - t0) / 520), e = Math.sin(k * Math.PI) * (1 - k * 0.5); g.scale.y = y0 * (1 + e * 0.06); g.scale.x = g.scale.z = x0 * (1 - e * 0.025); if (k >= 1) { g.scale.y = y0; g.scale.x = g.scale.z = x0; g.userData.greeting = false; off(); } });
}
// a critical hit slows the world for a beat; the third hit of a combo punches the camera in
let slowUntil = 0, punch = 0, stopUntil = 0, prevSpeed = 0;
// a hit stops the world for a few frames (heavier blows longer) and nudges the camera along the blow
const hitstop = (ms = 45) => { if (reduce) return; stopUntil = Math.max(stopUntil, performance.now() + Math.min(120, ms)); };
const camKick = new THREE.Vector3(); const kickCam = (dir, k = 0.08) => { if (reduce || !dir) return; camKick.x += dir.x * k; camKick.z += dir.z * k; if (camKick.length() > 0.35) camKick.setLength(0.35); };
let finT = 0, finGoal = 1;
const finisher = () => { if (reduce || finT > 0 || mode !== "hub") return; finT = 1.2; finGoal = camGoal; camGoal = Math.max(0.6, camGoal * 0.72); };
const slowmo = (ms = 170) => { if (reduce) return; slowUntil = Math.max(slowUntil, performance.now() + ms); replay(document.body, "wc-crit"); };
st.on((dt0, t) => {
  const now0 = performance.now(), dt = now0 < stopUntil ? dt0 * 0.04 : now0 < slowUntil ? dt0 * 0.3 : dt0;
  punch = Math.max(0, punch - dt0 * 3.2);
  padTick(dt0);
  step(dt); lookAround(dt); ripples(dt);
  spins.forEach((f) => f(dt, t));
  smokes.forEach((f) => f(dt));
  moveScammers(t);
  planet.updateMatrixWorld(true);
  if (avatar) {
    // pushing off from a standstill: a little squash and a puff of dust at the feet
    if (grounded && !boarding && speedNow > 9 && prevSpeed < 3 && !reduce) { if (avatar.land) avatar.land(0.45); parts.emit({ at: new THREE.Vector3(-planet.position.x, 0.15, -planet.position.z), kind: "smoke", n: 6, speed: 1.6, up: 0.6, size: 0.7, life: 0.7, grav: -0.5, drag: 2, color: 0xb8b0a0, jitter: 0.4 }); }
    prevSpeed = speedNow;
    // lean into a run and into turns
    const turn = angLerp(0, facing - (avatar.lastFacing ?? facing), 1) / Math.max(dt, 1e-3); avatar.lastFacing = facing; turnNow = turn;
    const inner = avatar.obj.children[0], fwdLean = skidT > 0 ? -0.26 : grounded && !boarding ? Math.min(1, speedNow / 12.5) * 0.16 : 0; // a skid leans back
    if (avatar.lean) avatar.lean(fwdLean, THREE.MathUtils.clamp(-turn * 0.04, -0.22, 0.22) * Math.min(1, speedNow / 6)); // the ARC Bot leans in its own pose
    else if (inner && !avatar.bot) { inner.rotation.x = THREE.MathUtils.lerp(inner.rotation.x, fwdLean, 0.15); inner.rotation.z = THREE.MathUtils.lerp(inner.rotation.z, THREE.MathUtils.clamp(-turn * 0.04, -0.22, 0.22) * Math.min(1, speedNow / 6), 0.12); }
    if (speedNow > 1 && !wheel.hidden) wheel.hidden = true;
    speedLines.style.opacity = String(THREE.MathUtils.clamp((speedNow - 13) / 8, 0, 0.9));
    // standing still for a while: a look round, now and then
    const still = grounded && !boarding && speedNow < 0.3 && !frozen && !document.body.classList.contains("wc-fight");
    idleT = still ? idleT + dt : 0; let lookOff = 0;
    // away from the keys (25 s with no input at all): sit down, the camera slowly circles; any input and it's back
    const afkNow = still && mode === "hub" && !photo && now0 - Math.max(lastInput, actAt) > 25000;
    if (afkNow !== afk) { afk = afkNow; if (afk) afkYaw = camYaw; else if (!reduce) camYaw = afkYaw; }
    if (afk) { idleT = 0; if (!reduce) camYaw += dt0 * 0.1; }
    if (idleT > idleNext) { const k = (idleT - idleNext) / 3.4; if (k >= 1) { idleT = 0; idleNext = 8 + Math.random() * 7; } else if (!reduce) lookOff = Math.sin(k * Math.PI * 2) * Math.sin(k * Math.PI) * 0.55; }
    if (danceT > 0) { danceT = Math.max(0, danceT - dt); lookOff += (1 - danceT / 2.4) * Math.PI * 4; if (grounded && danceT > 0.4 && Math.floor(danceT * 2.5) !== Math.floor((danceT + dt) * 2.5)) { vy = 3.2; grounded = false; } }
    if (trickT > 0) { trickT = Math.max(0, trickT - dt); const k = 1 - trickT / 0.55; lookOff += Math.PI * 2 * k * k * (3 - 2 * k); } // the board trick: one eased turn
    avatar.obj.rotation.y = facing + lookOff;
    const headJ = avatar.headJ === undefined ? (avatar.headJ = avatar.obj.getObjectByName("head") || null) : avatar.headJ;
    if (headJ) headJ.rotation.y -= headYaw; // take off last frame's turn before the animation runs (it may or may not set the head)
    if (avatar.bot) avatar.update(dt, t, Math.min(1, speedNow / 8), 0);
    else {
      avatar.update(dt, t);
      const want = boarding ? "idle" : !grounded ? (vy > 0 ? "jump" : "fall") : speedNow > 9 ? "sprint" : speedNow > 0.6 ? "walk" : afk ? "sit" : "idle"; // a rig with no sit keeps its idle
      if (combat && combat.vitals().down) { /* lying down until a revive or a respawn */ }
      else if (!avatar.busy() || (grounded && want !== "idle" && !boarding)) { if (want !== "jump") avatar.play(want, { speed: want === "walk" ? Math.max(0.8, speedNow / 6.5) : 1 }); animState = want; }
      // b-r2: standing about, now and then a wave (every 18–28 s after the first 10 s still); a friend coming within 7 m:
      // a wave for them (once every two minutes each)
      waveT = want === "idle" && !frozen && mode === "hub" ? waveT + dt : 0;
      if (waveT > 10 && !avatar.busy() && t > idleWaveAt) { idleWaveAt = t + 18 + Math.random() * 10; avatar.play("emote-yes", { once: true }); }
    }
  }
  const friendWaved = new Map();
setInterval(() => { try {
  if (!avatar || avatar.bot || !ghosts || mode !== "hub" || frozen || !grounded || avatar.busy()) return;
  const fw = new Set([...(chatUI && chatUI.friendWs ? chatUI.friendWs() : []), ...partyWs()]); if (!fw.size) return; const me = here(new THREE.Vector3()), now = Date.now();
  const g = ghosts.named().find((x) => fw.has(String(x.wallet).toLowerCase()) && Math.hypot(x.x - me.x, x.z - me.z) < 7 && now - (friendWaved.get(x.wallet) || 0) > 120e3);
  if (g) { friendWaved.set(g.wallet, now); avatar.play("emote-yes", { once: true }); waveT = 0; }
} catch { /* the next look */ } }, 2000);
// your head turns toward who's close (ARCIA, the walking bots, a scammer coming at you): within 7 m and in front,
  // never past a shoulder
  if (avatar && avatar.headJ) {
    let want = 0;
    if (!reduce && mode === "hub" && !photo) {
      const me = here(tmpLook), body = avatar.obj.rotation.y; let best = 49;
      const consider = (x, z) => { const dx = x - me.x, dz = z - me.z, d2 = dx * dx + dz * dz; if (d2 < 0.5 || d2 > best) return; let a = Math.atan2(dx, dz) - body; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) > 1.7) return; best = d2; want = THREE.MathUtils.clamp(a, -0.85, 0.85); };
      if (npc) consider(npc.position.x, npc.position.z);
      for (const f of folk) consider(f.g.position.x, f.g.position.z);
      if (combat) for (const m of combat.mobsRaw()) if (!m.dead) consider(m.g.position.x, m.g.position.z);
    }
    headYaw += (want - headYaw) * Math.min(1, dt * 5); avatar.headJ.rotation.y += headYaw;
  }
  // the board banks into a turn (as much as you turn, eased) and spins with a trick; the rover's body rolls out of it
  if (boarding) { const ro = rideObj(); ro.userData.update(t, speedNow, ride === "jet" ? (jetHigh ? 1 : 0.5) : 0); ro.rotation.order = "YXZ"; ro.rotation.y = avatar ? avatar.obj.rotation.y : facing;
    const sp = Math.min(1, speedNow / 8), want = ride === "board" ? THREE.MathUtils.clamp(-turnNow * 0.06, -0.38, 0.38) * sp : ride === "rover" ? THREE.MathUtils.clamp(turnNow * 0.03, -0.12, 0.12) * sp : 0;
    ro.rotation.z += (want - ro.rotation.z) * (1 - Math.exp(-dt * 7)); }
  if (npc && (npcT += dt) > 6) { npcT = 0; const lines = ["Hi! I'm ARCIA. Ask me anything.", "Scan a token before you buy it.", "A real airdrop never asks you to pay.", "Check the LP lock before you ape."]; npc.userData.line = (npc.userData.line + 1) % lines.length; npc.remove(npc.userData.bub); npc.userData.bub = K.bubble(T(lines[npc.userData.line])); npc.add(npc.userData.bub); if (labels) labels.dirty = true; if (Math.random() < 0.5) npc.userData.ac.play("emote-yes", { once: true }); }
  if (npc) npc.userData.ac.update(dt, t);
  if (stage && mode === "hub") stage.tick(dt, t);
  if (mode === "hub" && folk.length) for (const f of folk) {
    // b-st3: walk past one and it stops to wave at you (once in a while each)
    if (f.wait <= 0 && t > (f.greet || 0)) { const px = -planet.position.x, pz = -planet.position.z, fx = f.g.position.x, fz = f.g.position.z; if ((fx - px) ** 2 + (fz - pz) ** 2 < 12) { f.greet = t + 25; f.wave = true; f.sit = false; f.wait = 2.4; f.face = Math.atan2(px - fx, pz - fz); } }
    const want = f.wait > 0 ? (f.sit ? "sit" : f.wave ? "emote-yes" : "idle") : "walk";
    if (f.wait > 0) { f.wait -= dt; if (f.wait <= 0) { f.walkT = 8 + Math.random() * 12; f.wave = false; f.sit = false; } }
    else { f.a += (f.dir * f.sp * dt) / f.r; f.walkT -= dt; if (f.walkT <= 0) { const r = Math.random(); f.sit = r < 0.25; f.wave = !f.sit && r < 0.5; f.wait = f.sit ? 6 + Math.random() * 6 : 2.5 + Math.random() * 4; } } // now and then one sits down for a while
    if (want !== f.anim) { f.anim = want; try { f.c.play(want, want === "emote-yes" ? { once: true } : {}); } catch { /* no such clip */ } }
    const x = Math.sin(f.a) * f.r, z = -Math.cos(f.a) * f.r; f.g.position.set(x, 0, z);
    f.g.rotation.y = f.wave && f.wait > 0 && f.face != null ? f.face : Math.atan2(Math.cos(f.a) * f.dir, Math.sin(f.a) * f.dir); // facing along the ring (or you, while it waves)
    if (f.c.update && !f.c.mixer) f.c.update(dt, t); /* an ARC Bot's mixer already steps it */
  }
  if (pull) stepPull();
  tickQuantum(t);
  for (let i = rockets.length - 1; i >= 0; i--) if (!rockets[i](dt)) rockets.splice(i, 1);
  if (aurora.visible) aurora.userData.update(dt, t);
  if (fireflies.visible && mode === "hub") fireflies.userData.update(t);
  if (rain.visible) rain.userData.update(dt, at);
  clouds.userData.update(dt);
  island.tick(dt, t);
  if (combat) combat.tick(dt, t);
  if (pet) pet.tick(dt, t, mode === "hub" && !introOn && !flying);
  if (raid) raid.tick(dt, t);
  Snd.scene(mode !== "hub" || introOn ? "" : raid && raid.inside() ? "raid" : (combat && combat.zone() && combat.zone().id) || "");
  music.set(mode !== "hub" || introOn || !combat ? "calm" : (raid && raid.inside()) || combat.bossNear(40) ? "boss" : combat.zone() ? "hunt" : "calm");
  if (ghosts) ghosts.tick(dt, t);
  if (dinoTown3d) dinoTown3d.tick(dt);
  if (agentDim) agentDim.tick(dt, t);
  if (pumpKings) { try { pumpKings.tick(dt, t); } catch (e) { console.warn("pumpkin kings", e); pumpKings = null; } }
  if (knockV.lengthSq() > 0.01) { const v = knockV.length(); tmp2.copy(knockV).divideScalar(v); tryMove(tmp2, v * dt); knockV.multiplyScalar(Math.max(0, 1 - dt * 6)); }
  trail.update(boarding && !frozen, here(tmpTr), speedNow);
  if (P.style.trail === "trail-rainbow" && trail.mesh.visible) trail.mat.uniforms.c.value.setHSL((t * 0.25) % 1, 0.9, 0.6);
  // an arch right in front of the camera would fill the screen: it steps aside
  arches.forEach((a) => { a.getWorldPosition(tmpTr); a.visible = tmpTr.distanceTo(cam.position) > 7; }); // the AC Defense arena keeps the plaza arches
  if (mode === "island" && island.building() && hoverXY && !look && (hoverT += dt) > 0.12) { hoverT = 0; island.hover(hoverXY.x, hoverXY.y); }
  const n = nearest();
  if ((n && n.g) !== (near && near.g)) { near = n; paintPrompt(); if (n && n.g && n.spec && !reduce) greet(n.g); if (n && n.kind === "npc" && !P.visited.includes("npc")) { P.visited.push("npc"); save(); checkQuests(); } }
  scamCheck(dt);
  // animation LOD (b404): what's beyond 26 m of the camera steps its animation every third frame (the time adds up,
  // so it keeps its pace), what's near steps every frame
  // b441: off screen (or hidden) every 6th frame, past 60 m every 8th
  { const cp = st.camera.position; mixLod = (mixLod + 1) % 24; camFr.setFromProjectionMatrix(camFrM.multiplyMatrices(st.camera.projectionMatrix, st.camera.matrixWorldInverse));
    for (const m of mixers) { const o = m.getRoot && m.getRoot(); if (o && o.getWorldPosition) { o.getWorldPosition(mixV); const d2 = mixV.distanceToSquared(cp); camSph.center.copy(mixV); const every = d2 > 3600 ? 8 : !camFr.intersectsSphere(camSph) ? 6 : d2 > 676 ? 3 : 1; if (every > 1) { m._acc = (m._acc || 0) + dt; if (mixLod % every) continue; m.update(Math.min(m._acc, 0.5)); m._acc = 0; continue; } } m.update(dt + (m._acc || 0)); m._acc = 0; } }
  fadeLabels(dt);
  pickCards();
  lockedCheck(dt);
  if ((miniT += dt) > (coarse ? 0.14 : 0.1)) { miniT = 0; drawMini(); } // b413: 7–10 times a second (it was 12)
  paintMarker(); paintFootGuide();
  watchFps(dt);
  if (introOn) return; // the dive drives the camera
  // camera: behind and above the player, orbiting with camYaw / camPitch, wider when running; build mode sits higher
  // IDEA5 (2026-10-27): a boss's knock-out — the camera leans in and swings round it during the slow motion, then goes back
  if (finT > 0) { finT -= dt0; camYaw += dt0 * 0.6; if (finT <= 0) camGoal = finGoal; }
  camDist += (camGoal - camDist) * (1 - Math.exp(-dt0 * 10)); // zoom eases toward where the wheel/pinch put it
  const bz = mode === "island" && island.building() ? 1.55 : 1;
  // indoors on an island (the roof overhead already hides): the camera rises over the walls and looks down into the room,
  // instead of being pushed right behind the character by the walls (players: "my character fills the screen inside")
  inK += ((mode === "island" && !island.building() && island.indoor && island.indoor() ? 1 : 0) - inK) * (1 - Math.exp(-dt0 * 4));
  // locked on: the camera eases round so the target (and its wind-up ring) stays in view, unless you're steering it
  if (mode === "hub" && combat && combat.lockAt && !look && !photo && !frozen && performance.now() - lastLook > 2500 && combat.lockAt(lockV)) { const dx = lockV.x + planet.position.x - at.x, dz = lockV.z + planet.position.z - at.z; if (dx * dx + dz * dz > 2.25) camYaw = angLerp(camYaw, Math.atan2(dx, dz) + Math.PI, Math.min(1, dt * (reduce ? 1.2 : 3))); }
  // RAID QUEENS' sky realm: the camera lower and flatter, so the sky and the floating spires come into view (the owner: the sky has to show)
  skyK += ((landNow === "rq" && rqL ? (rqL.running() ? 0.6 : rqL.hall.visible ? 1 : 0) : 0) - skyK) * (1 - Math.exp(-dt0 * 3));
  base.set(0, 5.2 * (1 - skyK * 0.42) + camPitch * 6 + inK * 7, 9.6 * (1 - inK * 0.5) * (1 + skyK * 0.08)).multiplyScalar(camDist * camZoom * bz * (landNow === "ad" ? 0.78 : 1) /* (Nexus City: a little closer, among its towers) */ * (1 - Math.sin(Math.min(1, punch) * Math.PI) * 0.07)).applyAxisAngle(Y, camYaw);
  camPos.copy(base).add(at); camPos.y += (hop - at.y) * 0.6;
  if (!photo && inK < 0.5 && (colT += dt) > 0.08) { colT = 0; camCollide(camPos); }
  else if (inK >= 0.5) camFit += (1 - camFit) * 0.1; // over the walls nothing is in the way: the pulled-in distance lets go
  camPos.sub(at).multiplyScalar(photo ? 1 : camFit).add(at);
  if (camKick.lengthSq() > 1e-6) { camPos.add(camKick); camKick.multiplyScalar(Math.exp(-dt0 * 14)); }
  if (shake > 0 && reduce) shake = 0;
  // shake: a smooth rattle that dies away (not a new random jump every frame)
  if (shake > 0) { shake = Math.max(0, shake - dt0); shakeT += dt0; // real time: hit-stop doesn't stretch it
    const a = shake * 0.6; camPos.x += (Math.sin(shakeT * 47) + Math.sin(shakeT * 83) * 0.5) * a; camPos.y += (Math.sin(shakeT * 61 + 1.3) + Math.sin(shakeT * 97) * 0.5) * a; }
  if (mode === "hub") camPos.y = Math.max(camPos.y, 0.6); // never under the ground
  camLook.set(-Math.sin(camYaw) * 2.6, 1.4 + skyK * 2.6 + (hop - at.y) * 0.5, -Math.cos(camYaw) * 2.6).add(at);
  const landing = performance.now() < landUntil;
  cam.position.lerp(camPos, 1 - Math.exp(-dt * (landing ? 2.4 : 10)));
  // the point it looks at follows a touch behind, so steps, hops and landings don't jolt the picture
  if (!lookInit) { camLookS.copy(camLook); lookInit = true; } camLookS.lerp(camLook, 1 - Math.exp(-dt * (landing ? 3 : 14))); cam.lookAt(camLookS);
  // speed widens the view: a little at a run, more on the board and the jetpack (and a kick as a sprint starts)
  const sk = THREE.MathUtils.smoothstep(speedNow, 2, 22), kick = Math.max(0, speedNow - lastSpeed) * 0.35; lastSpeed = THREE.MathUtils.lerp(lastSpeed, speedNow, 1 - Math.exp(-dt * 3));
  const fov = 55 + sk * 11 + Math.min(3, kick) + (jetOn() && jetHigh ? 2 : 0) + (pull ? pull.k * 22 : 0); // the portal pulls the view wide
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = THREE.MathUtils.lerp(cam.fov, fov, 1 - Math.exp(-dt * (fov > cam.fov ? 6 : 3))); cam.updateProjectionMatrix(); }
});

// ---------------- the dive: space, the round planet, down through the clouds onto the ground ----------------
async function dive() {
  if (reduce || new URLSearchParams(location.search).has("nointro")) return;
  // from the home gate (arc-gate.js marks it): it already flew down to the robot, so no second trip out to space
  let fromGate = false; try { const g = Number(sessionStorage.getItem("arc.gate.dove")) || 0; sessionStorage.removeItem("arc.gate.dove"); fromGate = Date.now() - g < 90e3; } catch { /* private mode */ }
  if (fromGate) {
    introOn = true; frozen = true; document.body.classList.add("wp-intro");
    cam.position.set(0, 46, 20); cam.lookAt(0, 0, -4); landUntil = performance.now() + 2200;
    await sleep(60); introOn = false; document.body.classList.remove("wp-intro");
    await sleep(1200); frozen = false; return;
  }
  const veil = $("wp-veil"), fog = st.scene.fog, P0 = new THREE.Vector3(0, 52, 112), P1 = new THREE.Vector3(0, 32 + 2.5, 2.5), L0 = new THREE.Vector3(0, 4, 0), L1 = new THREE.Vector3(0, 32, -7);
  introOn = true; frozen = true; document.body.classList.add("wp-intro");
  planet.visible = false; sky.visible = false; halo.visible = false; player.visible = false;
  st.scene.fog = null; st.scene.background = new THREE.Color(0x02040a); stars.visible = true; stars.material.opacity = 0.9;
  intro.visible = true; cam.position.copy(P0); cam.lookAt(L0);
  let skip = false; const stop = () => { skip = true; };
  addEventListener("keydown", stop, { once: true }); cv.addEventListener("pointerdown", stop, { once: true }); $("wp-intro-skip").addEventListener("click", stop, { once: true });
  const t0 = performance.now(), MS = 2600, look = new THREE.Vector3();
  await new Promise((res) => {
    const off = st.on((dt) => {
      const k = Math.min(1, (performance.now() - t0) / MS), e = k * k * k; // speeding up as it falls
      intro.userData.pl.rotation.y += dt * 0.12 * (1 - k);
      cam.position.lerpVectors(P0, P1, e); look.lerpVectors(L0, L1, Math.min(1, k * 1.4)); cam.lookAt(look);
      veil.style.opacity = String(THREE.MathUtils.smoothstep(k, 0.68, 0.98));
      if (k >= 1 || skip) { off(); res(); }
    });
  });
  veil.style.opacity = "1";
  intro.visible = false; st.scene.remove(intro);
  planet.visible = true; sky.visible = true; halo.visible = true; player.visible = true; st.scene.fog = fog; st.scene.background = null; nightK = -1; dayNight();
  // land: the camera comes down from above the clouds to its place behind the player
  cam.position.set(0, 64, 26); cam.lookAt(0, 0, -4); landUntil = performance.now() + (skip ? 700 : 1700);
  introOn = false; document.body.classList.remove("wp-intro");
  requestAnimationFrame(() => { veil.style.opacity = "0"; });
  await sleep(skip ? 300 : 900);
  frozen = false;
}

// ---------------- start ----------------
dailyState(); makeMeadow(); dayNight(); worldReady = true; if (st.quality.coarse) trimCasters(); // phones: little things stop casting sun shadows
// b442: the minimap's ground drawn behind the loading screen (it was 6 s after it lifted, on the plaza: the world drawn
// once more from above and read back, a stall). If the town wasn't in yet, once more when it is.
const bakeNow = () => { if (mode === "hub") farCull.all(bakeMiniMap); };
if (town.length) bakeNow(); else setTimeout(() => { if (window.requestIdleCallback) requestIdleCallback(bakeNow, { timeout: 4000 }); else bakeNow(); }, 6000);
loadbar(0.8, TW("Opening the plaza…"));
// (each on its own: one that throws must never hold the load at 80 % — Macs stuck there, 2026-10-25)
for (const f of [paintHud, paintQuests, paintAcct, () => refreshPurse(true), () => refreshCoins(true), refreshMythic, refreshArc, refreshQuantum, ping]) { try { const r = f(); if (r && r.catch) r.catch((e) => { try { diag.err("boot: " + (e && e.message || e), "load80"); } catch { /* no report */ } }); } catch (e) { console.warn("boot", e); try { diag.err("boot: " + (e && e.message || e), "load80"); } catch { /* no report */ } } }
setTimeout(resumeSession, 2500);
setTimeout(refreshWelcome, 3500); every(10 * 60e3, refreshWelcome);
// the right edge's tab (world-skin.css .wp-clean-tab): one tap hides the screen's buttons in both worlds, leaving what you
// play with; for this visit only
{ const b = document.createElement("button"); b.type = "button"; b.id = "wp-clean"; b.className = "wp-clean-tab"; b.setAttribute("aria-label", T("Show or hide the screen buttons")); b.setAttribute("aria-pressed", "false"); b.setAttribute("data-no-i18n", "");
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const set = (on) => { document.body.classList.toggle("wp-clean", on); b.setAttribute("aria-pressed", String(on)); try { localStorage.setItem("arc.world.clean", on ? "1" : ""); } catch { /* private */ } };
  b.addEventListener("click", () => set(!document.body.classList.contains("wp-clean")));
  document.body.appendChild(b); try { localStorage.removeItem("arc.world.clean"); } catch { /* private */ } } // (2026-10-26: not kept to the next visit any more — a tap by mistake while the sideways HUD was too big hid players' buttons on every visit after; every visit starts with them shown)
// a first-time tour: a ring round one button at a time and a bubble saying what it does (Next / Got it / Skip);
// each tour shows once in this browser (key). Steps whose button isn't on screen are passed over.
let coachOff = null;
// b-r2: a window you open yourself (a card, the Games list, a gift) comes first: an automatic tour steps aside (shown
// again later) and the day's tips close, so two never stand over each other
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches(".wp-st,.wp-gift-open,.wp-share")) {
  try { if (coachOff && coachOff() === "arc.guide.clean") setTimeout(function again() { autoShow("clean", 40, () => coach("arc.guide.clean", [{ at: "#wp-clean", t: TW("Hide the buttons"), p: TW("Tap this tab to hide the screen's buttons and see more of the world. Tap it again to bring them back.") }])); }, 30000);
  document.querySelectorAll(".wp-tips").forEach((e) => e.remove()); tipsUp = false; } catch { /* still loading */ } return; } }).observe(document.body, { childList: true });
function coach(key, steps) {
  if (survOn || survBusy || ringsOn || ringsBusy || pokerOn || pokerBusy || mineOn) return false; // (a game with its own scene: the town's bubbles wait)
  try { if (localStorage.getItem(key)) return false; } catch { return false; }
  const live = steps.filter((st0) => { const e = document.querySelector(st0.at); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!live.length || document.querySelector(".wp-coach")) return false;
  const ring = document.createElement("div"), tip = document.createElement("div"); ring.className = "wp-coach-ring"; tip.className = "wp-coach"; tip.setAttribute("role", "dialog");
  document.body.append(ring, tip); let i = 0;
  const onEsc = (e) => { if (e.key === "Escape" && !(hubEl && !hubEl.hidden)) { /* (the Menu over it closes first) */ e.preventDefault(); e.stopImmediatePropagation(); done(); } };
  addEventListener("keydown", onEsc, true);
  const done = (seen = true) => { coachOff = null; ring.remove(); tip.remove(); removeEventListener("resize", place); removeEventListener("keydown", onEsc, true); if (seen) try { localStorage.setItem(key, "1"); if (live.some((x) => x.at === "#wp-clean")) localStorage.setItem("arc.guide.clean", "1"); } catch { /* private */ } };
  coachOff = () => { done(false); return key; }; // (a window you open yourself puts the tour away, unseen: it comes back later)
  function place() {
    const S0 = live[i], e = document.querySelector(S0.at); if (!e) { done(); return; } const r = e.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    const z = parseFloat(getComputedStyle(tip).zoom) || 1, W0 = innerWidth, H0 = innerHeight, tw = tip.offsetWidth * z, th = tip.offsetHeight * z;
    let x = r.left + r.width / 2 - tw / 2, y = r.bottom + 14; if (y + th > H0 - 8) y = r.top - th - 14; // under it, or above when there's no room
    if (r.left > W0 * 0.6 && r.height > H0 * 0.04 && r.width < W0 * 0.2) { x = r.left - tw - 14; y = r.top + r.height / 2 - th / 2; } // a button on the right edge: beside it
    x = Math.max(8, Math.min(W0 - tw - 8, x)); y = Math.max(8, Math.min(H0 - th - 8, y));
    tip.style.left = x / z + "px"; tip.style.top = y / z + "px";
  }
  function show() {
    const S0 = live[i];
    tip.innerHTML = `<small>${esc(TW("Quick tour"))} · ${i + 1}/${live.length}</small><b>${esc(S0.t)}</b><p>${esc(S0.p)}</p><div><button type="button" class="wp-coach-skip">${esc(TW("Skip"))}</button><button type="button" class="wp-coach-next">${esc(i < live.length - 1 ? TW("Next") : TW("Got it"))}</button></div>`;
    tip.querySelector(".wp-coach-next").onclick = () => { if (++i >= live.length) done(); else show(); };
    tip.querySelector(".wp-coach-skip").onclick = done;
    requestAnimationFrame(place);
  }
  addEventListener("resize", place); show(); return true;
}
// tips on the way in: three short ones, picked at random each visit (a different three next time), how a feature works
const TIPS = [
  ["🎯", "Lock on", "Tap the crosshair button (or Tab) to lock onto the nearest scammer. Your attacks follow it."],
  ["🙈", "Hide the buttons", "The tab on the right edge hides the screen's buttons so you can see more of the world."],
  ["⛏️", "ARCL Mine", "Every rock you break in the mine pays ARCL and XP. A better pickaxe needs fewer hits."],
  ["🎁", "Daily gifts", "Open Gifts every day: new players get seven days of rewards."],
  ["🧪", "Potions", "Tap the bottle buttons (or keys 4 and 5) to drink HP and SP potions in the middle of a fight."],
  ["💨", "Dodge", "Dodge (K) through an attack to take no damage, then hit back."],
  ["🐾", "Pets", "Hatch a pet egg from Pets: a pet adds XP, luck and help in fights."],
  ["🎮", "Game Village", "Coin Jump, AC Defense and more mini-games wait in the Game Village."],
  ["🏝️", "Your island", "Build your own island: place bricks and decorate it your way."],
  ["🌙", "Weekend 2×", "Saturdays and Sundays (Seoul time) give double XP and double ARCL from play."],
  ["🗺️", "The map", "Open the map (M) to find hunting grounds, bosses and portals."],
  ["⚡", "Skills", "A skill opens at level 10. Swap it with the ⇄ on the skill button."],
  ["🛠️", "Craft", "Upgrade and salvage your gear in Craft: stronger gear makes bosses easier."],
];
let tipsUp = false;
// rows: [icon, title, line] (all of them, in order); without rows, three of TIPS at random. o: { kicker, title, icon, cls }
// once a day each (o.day: its own key; Seoul's date)
const tipDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function showTips(rows, o = {}) {
  if (survOn || survBusy || ringsOn || ringsBusy || pokerOn || pokerBusy || tipsUp || document.querySelector(".wp-tips")) return;
  const dk = "arc.tips." + (o.day || "town"); try { if (localStorage.getItem(dk) === tipDay()) return; localStorage.setItem(dk, tipDay()); } catch { /* private: every visit */ }
  tipsUp = true;
  let pick = rows; if (!pick) { const pool = TIPS.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } pick = pool.slice(0, 3); }
  const el = document.createElement("div"); el.className = "wp-tips" + (o.cls ? " " + o.cls : ""); el.setAttribute("role", "dialog"); el.setAttribute("aria-label", TW("Tips"));
  el.innerHTML = `<div class="wp-tips-in"><header><span class="wp-tips-ic" aria-hidden="true">${o.icon || "💡"}</span><div><small>${esc(o.kicker || "ARCIRCLE WORLD")}</small><b>${esc(o.title || TW("Tips for today"))}</b></div></header>
    <ol>${pick.map(([ic, t, p0]) => `<li><span aria-hidden="true">${ic}</span><div><b>${esc(TW(t))}</b><p>${esc(TW(p0))}</p></div></li>`).join("")}</ol>
    <button type="button" class="wp-tips-go">${esc(o.go || TW("Let's play"))}</button></div>`;
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 260); tipsUp = false; };
  el.querySelector(".wp-tips-go").addEventListener("click", close); el.addEventListener("click", (e) => { if (e.target === el) close(); });
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on"));
}
setTimeout(function tryTips() { if (worldReady && P.guideSeen) autoShow("tips", 30, () => showTips()); else setTimeout(tryTips, 4000); }, 12000);
// the hide tab, shown once in town (a while after you arrive, when nothing else is up)
setTimeout(function tryClean() { if (worldReady && P.guideSeen) autoShow("clean", 40, () => coach("arc.guide.clean", [{ at: "#wp-clean", t: TW("Hide the buttons"), p: TW("Tap this tab to hide the screen's buttons and see more of the world. Tap it again to bring them back.") }])); else setTimeout(tryClean, 15000); }, 25000);
if (sess()) setTimeout(() => village.load(), 3500); // your village level and blessing
// the way in is one move: the robot is dressed while the loading screen is still up, the first frame you see is the
// start of the dive (never the town first and then a jump back out to space), and from the home gate, which has
// already dived down to the robot, the camera only comes down the last stretch to land behind you
// every wait from here on has an end, and the loading screen's "Enter now" (bootSkip, after 20 s on one step) ends them all
await capWait(Promise.resolve().then(() => setAvatar(P.char || "arc-arc")), 30000, "avatar", false); // (not skipped: the town needs its hero) try { ensureFootSpot(); } catch (e) { console.warn("foot spot", e); } // b447: the spot under your feet
loadbar(0.85, TW("Dressing the town…"));
// b443: the town's set dressing (trees, lamps, the districts' props) is placed before the screen lifts, up to 8 s
// (2026-10-25, the funnel: a third of new browsers left before the town showed) a phone on low graphics, or a load
// already slow (past 25 s), gets half these waits: what isn't ready goes on in the background, behind the town
const quickIn = (coarse && lowGfx) || performance.now() > 25000, weakIn = S.quality === "auto" && !!st.quality.weak, qk = (ms) => (weakIn ? Math.round(ms / 4) : quickIn ? Math.round(ms / 2) : ms); // (b-perf2: the weakest chips a quarter: the town shows, the rest comes in behind it)
if (decorOn && decor && decor.townReady) await capWait(Promise.resolve(decor.townReady).catch(() => {}), qk(8000), "decor");
try { farCull.prep(); } catch (e) { console.warn("far cull", e); } // (again for what came in since: the fade's shaders made before warm compiles everything)
loadbar(0.9, TW("Waking the scammers…"));
// b442: the scammers and every effect readied behind the loading screen too (combat.warm: copy, prepare and draw each
// model once out of sight). It used to start 4 s after the screen lifted and go on every 0.9 s: the first minute on
// the plaza stuttered. At most 6 s here; anything left (packs that load later) the warm loop below still does.
if (combat && combat.warm) { const w0 = performance.now(); try { while (!bootSkipped && performance.now() - w0 < qk(6000) && await capWait(combat.warm(st, 6), 2500, "warm")); } catch { /* the loop below tries again */ } }
loadbar(0.95, TW("Polishing the light…"));
try { await capWait(st.warm(quickIn ? 2500 : 4000), qk(6000), "light"); } catch (e) { console.warn("warm", e); } // every shader compiled behind the loading screen: no hitch the first time a fight, a skill or a zone shows
loadbar(1); try { diag.ready(performance.now() / 1000); } catch { /* no report */ }
const landing = dive();
// b440: what arrives after loading (a zone's props, the Game Village, an island, a pet) is compiled in the background as
// soon as it's in the scene, hidden parts too, so its first appearance on screen doesn't stall on shader building
// new things in the scene get their shaders compiled before they're seen — only the objects whose materials are new (it
// used to recompile the whole scene, every hidden land and ground switched on for the call, whenever the count of meshes
// changed: every 2.5 s in a fight or a crowd, a 100–200 ms stall each time)
{ const warmSeen = new WeakSet(); let first = true, busy = false; setInterval(() => {
  if (busy || document.hidden || frozen) return; const fresh = [];
  st.scene.traverse((o) => { const mt = o.material; if (!mt || !(o.isMesh || o.isPoints || o.isSprite)) return; let nw = false; /* (PF3: no array a mesh — this walks the whole scene) */ if (Array.isArray(mt)) { for (const m of mt) if (!warmSeen.has(m)) { warmSeen.add(m); nw = true; } } else if (!warmSeen.has(mt)) { warmSeen.add(mt); nw = true; } if (nw && fresh.length < 40) fresh.push(o); });
  if (first) { first = false; return; } /* (the loading screen's warm-up compiled these) */ if (!fresh.length) return;
  busy = true; compileHidden(fresh).then(() => { busy = false; }, () => { busy = false; });
}, coarse ? 4000 : 2500); }
$("wp-loading").classList.add("done"); fun("ready"); setTimeout(() => { if (sess()) loadCodex().then((c) => c.load()).catch(() => {}); }, 8000); /* the item codex's set bonus and titles, once signed in */
// the most played games' code fetched while the town is quiet, one at a time (entering one then doesn't wait for the
// download); not on data saver or a slow connection, never in a fight; a failure here is only a later download
{ const nc = navigator.connection || {}, slow = nc.saveData || /(^|-)2g|3g/.test(String(nc.effectiveType || ""));
  const pre = [() => import("./world-survivors.js"), () => import("./world-jurassic.js"), () => import("./world-poker.js"), () => import("./world-rings.js")];
  const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 200));
  const next = () => { if (!pre.length) return; if (document.hidden || mode !== "hub" || frozen || document.body.classList.contains("wc-fight")) { setTimeout(next, 8000); return; } idle(() => { const f = pre.shift(); f().catch(() => {}).finally(() => setTimeout(next, 6000)); }); };
  if (!slow && S.quality !== "saver") setTimeout(next, 25000); }
// b-st3: back on another day (this browser was here before, on an earlier Seoul day)
try { const k = "arc.world.funday", d0 = localStorage.getItem(k), d1 = tipDay(); if (d0 && d0 !== d1) { fun("back"); if (P.char) landing.then(() => setTimeout(() => welcomeBack(Math.round((Date.parse(d1) - Date.parse(d0)) / 864e5)), 2200)); } localStorage.setItem(k, d1); } catch { /* private */ }
// weekend 2×: say so once a session, a few seconds in
if (weekend2x()) setTimeout(() => { if (!introOn) toast(TW("Weekend 2×: double XP and double ARCL from play")); else setTimeout(() => toast(TW("Weekend 2×: double XP and double ARCL from play")), 4000); }, 6000);
// a friend's INFINITY RINGS challenge (?rings=<board>&vs=<moves>&by=<name>, world-rings.js share()): to the palace, and
// that very board with their moves to beat; a board that can't be made says so
try { const q = new URLSearchParams(location.search), id = q.get("rings");
  // (a first visit makes a name and sees the intro first: it waits, up to two minutes, until the town is free)
  if (id && /^(\d{1,3}|d:\d{4}-\d\d-\d\d:[0-2]|w:\d{4}-\d\d:[0-6]|e:\d{1,5})$/.test(id)) landing.then(() => { let tries = 0; const go = async () => {
    if (mode !== "hub" || introOn || frozen || flying || ringsBusy || document.querySelector("#wp-make:not([hidden]), #wp-guide:not([hidden]), #wp-auth:not([hidden])")) { if (++tries < 120) setTimeout(go, 1000); return; }
    const e = gv.exitOf("rings"); standAt(e.x, e.z, gv.center); await openRings();
    if (ringsOn && ringsGame && !ringsGame.challenge(id, q.get("vs"), q.get("by"), q.get("w"))) toast(TW("That challenge's board couldn't be found"));
  }; setTimeout(go, 1500); }); } catch { /* a plain visit */ }
// INFINITY MASTER (INFINITY RINGS level 100): a little ∞ of light circling over the hero
let aura = null;
function paintAura() {
  if (!P.badges.includes("infinity-master")) { if (aura) { player.remove(aura); aura = null; } return; }
  if (aura) return;
  aura = new THREE.Group(); const m1 = new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), m2 = m1.clone(); m2.color.setHex(0x2ee0b0);
  [[-0.19, m1], [0.19, m2]].forEach(([x, m]) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.04, 8, 28), m); t.position.x = x; aura.add(t); });
  aura.position.y = 3.75; player.add(aura);
}
spins.push((dt, t) => { if (aura) { aura.rotation.y = t * 1.6; aura.position.y = 3.75 + Math.sin(t * 2) * 0.06; } });
paintAura();
// back from a stale-page reload (staleReload): straight to the Game Village, where the tap was
try { if (sessionStorage.getItem(RESUME) === "gv") { sessionStorage.removeItem(RESUME); landing.then(() => setTimeout(() => { if (mode === "hub" && !introOn && !frozen) goGameVillage(); }, 300)); } } catch { /* private window */ }
// AC Defense's code comes down now, while nothing is happening, so a deploy later can't leave this page without it
setTimeout(() => { const go = () => import("./world-defense.js").catch(() => {}); if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 30000 }); else go(); }, 12000);
setTimeout(() => { if (load3d) load3d.dispose(); $("wp-loading").remove(); }, 600);
await landing;
landed = true; actAt = performance.now(); feedQ.splice(0).slice(-4).forEach(([h, c], i) => setTimeout(() => feed(h, c), i * 250));
{ const we = RPG.WEEK_EVENTS && RPG.weekEvent ? RPG.WEEK_EVENTS[RPG.weekEvent()] : null; if (we) setTimeout(() => feed(T("This week: {x} — {y}", { x: `<b>${esc(T(we.name))}</b>`, y: esc(T(we.line)) }), "#ffc861"), 2600); } // this week's event
// b-fm1: a first visit plays first (the character, the controls, the training scammer); the wallet is offered after
// the first knock-out (askSave) and on the "Your first 5 minutes" card, not before anything has happened
// b-st2: you land in a beam of light, and the fountain throws its jets up; a first visit gets a welcome first
try { vfx.teleport(here(), { color: 0x7fe9ff, color2: 0x2f86ff }); if (fountain.userData.burst) fountain.userData.burst(6); } catch { /* fine without */ }
if (!P.char) { welcomeBurst(); setTimeout(() => { if (!P.char && make.hidden) openMake(); }, reduce ? 0 : 1500); }
else { tutorialStep(-1); maybeGuide(); }
refreshPlaza();
// b-st2: on the hour the fountain puts on a show (20 s)
{ let lastHr = -1; every(15000, () => { const d = new Date(); if (d.getMinutes() !== 0 || d.getHours() === lastHr || mode !== "hub") return; lastHr = d.getHours(); try { fountain.userData.burst(20); feed(`⛲ <b>${esc(TW("The fountain's show"))}</b> · ${esc(TW("on the hour, at the plaza"))}`, "#38d8ff"); } catch { /* fine */ } }); }
// a shared island link (/play?isle=0x…): straight to that island once you're in
// news while you play (friends online, stamps on your island) and, once after an update, what's new
setTimeout(() => island.news((h, c) => feed(h, c)), 5000); every(300000, () => { if (mode === "hub") island.news((h, c) => feed(h, c)); });
maybeNew();
setTimeout(() => quests.seasonNotice((h, c) => feed(esc(h), c)), 8000);
setTimeout(async () => { const p = partyUI(), f = p && await p.loadFull(); if (f) quests.bountyNotice((h, c) => feed(esc(h), c), f); }, 12000); // one bounty read: the Log dot, and Sunday's reminder
// a Studio game's share link (/play?sg=<id>): open the Studio and play that game once the town is up
{ const g = String(new URLSearchParams(location.search).get("sg") || ""); if (/^[\w-]{4,40}$/.test(g) && P.char) setTimeout(async () => { if (mode !== "hub" || frozen) return; await openStudio(); const q = new URLSearchParams(location.search); if (studio && q.get("remix") === "1" && studio.remixId) return studio.remixId(g); if (studio && /^[a-z0-9]{8}$/.test(q.get("ch") || "") && studio.playChal) return studio.playChal(q.get("ch")); if (studio) studio.playId(g, { vs: Math.max(0, Math.floor(Number(q.get("vs")) || 0)), vsBy: String(q.get("by") || "").slice(0, 16) }); }, 1400); } /* (?vs=&by=: a friend's challenge — their score to beat) */
{ const rc = String(new URLSearchParams(location.search).get("race") || ""); if (/^[A-Za-z0-9]{5}$/.test(rc) && P.char) setTimeout(async () => { if (mode !== "hub" || frozen) return; await openStudio("arcade"); if (studio && studio.raceJoin) studio.raceJoin(rc); }, 1400); } /* (WS4: ?race=<code> — a friend's live race) */
setTimeout(async () => { const s0 = sess(); if (!s0 || frozen) return; try { const r = await fetch("/api/social?world=studio-feed&wallet=" + String(s0.wallet).toLowerCase(), { cache: "no-store" }); if (!r.ok) return; const j = await r.json(); let t = 0; try { t = Number(localStorage.getItem("arc.studio.feedSeen") || 0); } catch { /* none */ }
  const n = (j.games || []).filter((x) => x.at > t).length; if (n) toast("🔔 " + esc(n === 1 ? TW("A creator you follow published \"{t}\" — it's in the Creator Arcade", { t: j.games[0].title }) : TW("{n} new games from creators you follow — in the Creator Arcade", { n }))); } catch { /* next visit */ } }, 25000); /* (WS5: once a visit) */
{ const w = (new URLSearchParams(location.search).get("isle") || "").toLowerCase(); if (/^0x[0-9a-f]{40}$/.test(w) && P.char) setTimeout(() => { if (mode === "hub" && !frozen) goIsland({ visit: w }); }, 900); }
arclShop.refresh().then(() => { arclShop.flushQueue(); if (P.guideSeen && auth.hidden && make.hidden) setTimeout(() => arclShop.maybeDaily(), 900); });
// DINO SOULMATE in town (world-dino.js is Jurassic World's): a chip under the purse row while there's something to do —
// your egg's care open (and how long is left), it's ready to hatch, your first egg waiting, or an egg out on the plains —
// and a browser notification when the site is open in another tab. Tap it: you stand at the Jurassic portal.
// THE OFFICIAL LAUNCH (api/_world-launch.mjs): the launch gift — an Advanced dinosaur egg, five 3× EXP potions (an
// hour each) and 5,000 ARCL, once an account in the launch week (playing before the launch, or level 5) — and the
// potions: a button by the Starter one (🎁 until the gift is taken, then the potions left or the 3× running)
const launchUI = (() => {
  let v = null, el = null, shown = false, busyL = false;
  const fmtN = (n) => Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US");
  async function look() {
    const s = sess(); try { const r = await fetch("/api/social?world=launch" + (s ? "&wallet=" + encodeURIComponent(String(s.wallet).toLowerCase()) : ""), { cache: "no-store" }); if (r.ok) v = await r.json(); } catch { /* the next look */ }
    if (v && v.xp3) xp3Until = Number(v.xp3.until) || 0; paint();
    tryShow();
  }
  /// the card by itself once a visit, when you're free (another window up: it waits and tries again)
  function tryShow() {
    const s = sess(); if (!(v && v.open && s && v.eligible && !v.claimed) || shown) return;
    autoShow("launch", 10, () => { if (shown || !(v && v.open && sess() && v.eligible && !v.claimed)) return false; shown = true; openCard(); });
  }
  function paint() {
    if (!el) { const st = $("wp-starter-btn"); if (!st) return; el = document.createElement("button"); el.type = "button"; el.className = "wp-btn wp-starter-btn wp-launch-btn"; el.setAttribute("aria-haspopup", "dialog"); el.title = TW("Official launch"); st.parentNode.insertBefore(el, st); el.addEventListener("click", () => { closeAll(); openCard(); }); }
    const s = sess(), on = xp3Until > Date.now(), n = (v && v.xp3 && v.xp3.n) || 0, gift = v && v.open && !v.claimed;
    el.hidden = !(v && (gift || n > 0 || on)); if (el.hidden) return;
    el.innerHTML = gift ? `<span class="wp-st-l">🎁 ${esc(TW("Launch"))}</span>` : on ? `<img class="wp-launch-bi" src="/images/launch/xp3.webp" alt=""><span class="wp-st-l">3×</span><b class="wp-st-boost">${Math.ceil((xp3Until - Date.now()) / 60e3)}m</b>` : `<img class="wp-launch-bi" src="/images/launch/xp3.webp" alt=""><span class="wp-st-l">×${n}</span>`;
    el.classList.toggle("dot", !!(gift && s && v.eligible));
  }
  function openCard() {
    const s = sess(), g = (v && v.gift) || { arcl: 5000, potions: 5, potionMin: 60, xpK: 3 }, n = (v && v.xp3 && v.xp3.n) || 0, on = xp3Until > Date.now();
    const box = document.createElement("div"); box.className = "wp-st wp-launch"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
    const status = !v ? TW("Couldn't load the launch gift — try again") : !v.open ? (Date.now() < v.start ? TW("The launch gift opens soon") : TW("The launch week is over")) : !s ? TW("Sign in with your wallet to take it") : v.claimed ? TW("Taken — thank you for playing!") : v.eligible ? "" : TW("Reach level {n} to take it (you're level {l})", { n: v.minLv || 5, l: v.lv || 1 });
    const canTake = v && v.open && s && v.eligible && !v.claimed;
    // b-lc: the owner's launch-card design — the art up top (the logo, ARC, ARCIA and the headline), the three gifts as
    // cards (numbered, each in its colour), the potion row, one gold button; the numbers and words are the game's own
    box.classList.add("wp-launch2");
    setTimeout(() => { const m = box.querySelector(".wl2-art em.mid"); if (!m || reduce) return; const t0 = performance.now(), to = g.arcl; const up = (t) => { const k = Math.min(1, (t - t0) / 1200); m.textContent = fmtN(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1 && m.isConnected) requestAnimationFrame(up); }; m.textContent = "0"; requestAnimationFrame(up); }, 650); // (after the gift cards have flipped in)
    box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>
      <div class="wl2-hero"><img src="/images/launch/hero.webp" srcset="/images/launch/hero-640.webp 640w, /images/launch/hero.webp 1024w" sizes="540px" alt="ARCIRCLE WORLD — We're officially live!" width="1024" height="642"><h2 class="wp-sr">${esc(TW("We're officially live!"))}</h2></div>
      <p class="wl2-sub">${esc(TW("Thank you for building this world with us. A launch gift for every player, this week only."))}</p>
      <ol class="wl2-gifts">
        <li class="g1"><header><i>1</i><b>${esc(TW("An Advanced dinosaur egg"))}</b></header><div class="wl2-art"><img src="/images/launch/card-egg.webp" alt="" width="299" height="228"><em>×1</em></div><small>${esc(TW("Care for it 3 days in Jurassic World's Hatchery, then raise it."))}</small></li>
        <li class="g2"><header><i>2</i><b>${esc(TW("3× EXP potions"))}</b></header><div class="wl2-art"><img src="/images/launch/card-xp3.webp" alt="" width="299" height="228"><em>×${g.potions}</em></div><small>${esc(TW("Each one: 3× EXP for {m} minutes. Use them when you like.", { m: g.potionMin }))}</small></li>
        <li class="g3"><header><i>3</i><b>ARCL</b></header><div class="wl2-art"><img src="/images/launch/card-arcl.webp" alt="" width="298" height="228"><em class="mid">${fmtN(g.arcl)}</em></div><small>${esc(TW("Straight into your ARCL balance."))}</small></li>
      </ol>
      ${n > 0 || on ? `<div class="wl2-pot"><span class="wl2-pot-ic"><img src="/images/launch/xp3.webp" alt="" width="52" height="52"><em>×${n}</em></span><div><small>${esc(TW("Launch bonus"))}</small><b>${esc(on ? TW("3× EXP on: {t}", { t: leftOf(xp3Until) }) : TW("No potion running"))}</b></div><button type="button" data-pot ${n > 0 ? "" : "disabled"}>${esc(on ? TW("Add an hour") : TW("Drink one"))}</button></div>` : ""}
      ${status ? `<p class="wl2-status">${esc(status)}</p>` : ""}
      ${canTake ? `<button type="button" class="wl2-claim" data-take><span aria-hidden="true">🎁</span>${esc(TW("Claim all gifts"))}</button>` : ""}
      <p class="wl2-note"><i aria-hidden="true">!</i>${esc(TW("One gift per account during the launch week. New accounts: from level {n}.", { n: (v && v.minLv) || 5 }))}</p></div>`;
    document.body.appendChild(box); frozen = true; keys.clear();
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true); box.querySelector(".wp-st-x").addEventListener("click", close); box.addEventListener("click", (e) => { if (e.target === box) close(); });
    const take = box.querySelector("[data-take]");
    if (take) take.addEventListener("click", async () => { if (busyL) return; busyL = true; take.disabled = true; const s2 = sess(); let r = null; try { r = s2 ? await post({ action: "world-launch-claim", ...s2 }) : null; } catch { r = null; } busyL = false;
      if (!r || !r.ok) { take.disabled = false; toast(TW("Couldn't take the gift: {e}", { e: String((r && r.j && r.j.error) || TW("network")).slice(0, 80) })); return; }
      close(); await giftOpen(TW("Launch gift taken!"), [{ img: "/images/launch/egg.webp", t: TW("An Advanced dinosaur egg") }, { img: "/images/launch/xp3.webp", t: TW("{n} × 3× EXP potions", { n: r.j.potions || g.potions }) }, { img: "/images/launch/arcl.webp", t: fmtN(r.j.arcl || g.arcl) + " ARCL" }]);
      toast(`🎁 <b>${esc(TW("Launch gift taken!"))}</b> ${esc(TW("+{a} ARCL · {n} potions · an Advanced egg in the Hatchery", { a: fmtN(r.j.arcl || g.arcl), n: r.j.potions || g.potions }))}`);
      refreshPurse(true); await look(); dinoTown.look(); setTimeout(() => { if (!document.querySelector(".wp-st")) openCard(); }, 1700); }); // (after the coins have landed)
    const pot = box.querySelector("[data-pot]");
    if (pot) pot.addEventListener("click", async () => { if (busyL) return; busyL = true; pot.disabled = true; const s2 = sess(); let r = null; try { r = s2 ? await post({ action: "world-xp-potion", ...s2 }) : null; } catch { r = null; } busyL = false;
      if (!r || !r.ok) { pot.disabled = false; toast(TW("Couldn't use it: {e}", { e: String((r && r.j && r.j.error) || TW("network")).slice(0, 80) })); return; }
      xp3Until = r.j.until; if (v && v.xp3) { v.xp3.n = r.j.n; v.xp3.until = r.j.until; } if (Snd.level) Snd.level(); toast(`🧪 <b>${esc(TW("3× EXP for an hour!"))}</b> ${esc(leftOf(xp3Until))}`); close(); paint(); });
  }
  setTimeout(look, 7000); setInterval(look, 300e3); setInterval(() => { paint(); tryShow(); }, 15e3);
  return { look, open: openCard, state: () => ({ v, xp3Until }) };
})();
// invite a friend (api/_world-refer.mjs): your link carries your code; a friend who opens it and signs in while new is
// tied to you, and when they reach level 5 you both get 1,000 ARCL and a dinosaur egg (the save that gets them there pays)
// b-gm: a GM rewards a player in $ARCIRCLE, from the GM's own wallet (Rankings → Players → 🎁 Send reward). The wallet
// signs an ordinary transfer; the server notes it once the chain shows it (api/_world-gmreward.mjs), and every player's
// list (Rewards) shows what they were sent, each with its transaction on the explorer and a copy of its link
const gmReward = (() => {
  const EXP = String(CFG.BLOCK_EXPLORER || "https://arc.etherscan.io").replace(/\/$/, ""), TOK = /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "";
  const txUrl = (h) => EXP + "/tx/" + h, short = (w) => w.slice(0, 8) + "…" + w.slice(-6);
  const fmtT = (n) => Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: 4 });
  const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
  /// "12,345.5" → wei (18 decimals), null when it isn't a positive amount
  const toWei = (str) => { const m = /^(\d+)(?:\.(\d{0,18}))?$/.exec(String(str).replace(/[,\s]/g, "")); if (!m) return null; const w = BigInt(m[1]) * 10n ** 18n + BigInt((m[2] || "").padEnd(18, "0") || "0"); return w > 0n ? w : null; };
  const copy = async (t, done) => { try { await navigator.clipboard.writeText(t); toast(done); } catch { toast(t); } };
  function sheet(cls, html) {
    closeAll(); const box = document.createElement("div"); box.className = "wp-st wp-gmr " + cls; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
    box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>${html}</div>`;
    document.body.appendChild(box); frozen = true; keys.clear();
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true); box.querySelector(".wp-st-x").addEventListener("click", close); box.addEventListener("click", (e) => { if (e.target === box) close(); });
    return { box, close };
  }
  const txRow = (r) => `<li><div><b>${fmtT(r.tokens)} $ARCIRCLE</b><small>${esc(new Date(r.at).toLocaleString())}${r.note ? " · " + esc(r.note) : ""}</small><code>${esc(r.tx.slice(0, 10) + "…" + r.tx.slice(-8))}</code></div><span><a class="wp-gmr-b" href="${esc(txUrl(r.tx))}" target="_blank" rel="noopener">${esc(TW("Explorer"))} ↗</a><button type="button" class="wp-gmr-b" data-copytx="${esc(r.tx)}">${esc(TW("Copy tx link"))}</button></span></li>`;
  const wire = (box) => box.addEventListener("click", (e) => { const c = e.target.closest("[data-copytx]"); if (c) copy(txUrl(c.dataset.copytx), TW("Transaction link copied")); const w = e.target.closest("[data-copyw]"); if (w) copy(w.dataset.copyw, TW("Wallet address copied")); });
  async function list(w, name) {
    w = String(w).toLowerCase(); const { box } = sheet("list", `<h2>${esc(TW("Rewards"))}</h2><p class="wp-gmr-who"><b>${esc(name || short(w))}</b><code>${esc(w)}</code><button type="button" class="wp-gmr-b" data-copyw="${esc(w)}">${esc(TW("Copy"))}</button></p><div class="wp-gmr-body"><i class="wp-skel" style="width:70%"></i></div>`); wire(box);
    let v = null; try { const r = await fetch("/api/social?world=gm-rewards&wallet=" + w, { cache: "no-store" }); v = r.ok ? await r.json() : null; } catch { v = null; }
    const body = box.querySelector(".wp-gmr-body"); if (!body) return;
    body.innerHTML = !v ? `<p class="wp-st-note">${esc(TW("Couldn't load the rewards — try again"))}</p>` : v.list.length ? `<p class="wp-gmr-total">${esc(TW("Total sent"))} <b>${fmtT(v.tokens)} $ARCIRCLE</b> · ${v.list.length}</p><ul class="wp-gmr-list">${v.list.map(txRow).join("")}</ul>` : `<p class="wp-st-note">${esc(TW("No rewards sent to this player yet."))}</p>`;
  }
  async function send(w, name) {
    w = String(w).toLowerCase(); const s = sess();
    if (!s || !VILL.isGM(String(s.wallet).toLowerCase())) { toast(TW("Only a GM wallet can send rewards")); return; }
    const { box, close } = sheet("send", `<span class="wp-gmr-ic" aria-hidden="true">🎁</span><h2>${esc(TW("Send a reward"))}</h2>
      <p class="wp-gmr-who"><b>${esc(name || short(w))}</b><code>${esc(w)}</code><button type="button" class="wp-gmr-b" data-copyw="${esc(w)}">${esc(TW("Copy"))}</button></p>
      <p class="wp-gmr-bal">${esc(TW("Your $ARCIRCLE"))} <b data-bal><i class="wp-skel" style="width:90px"></i></b></p>
      <label class="wp-gmr-in"><span>${esc(TW("Amount"))}</span><input type="text" inputmode="decimal" data-amt placeholder="0" autocomplete="off"><em>$ARCIRCLE</em></label>
      <div class="wp-gmr-quick">${[1000, 10000, 100000, 1000000].map((n) => `<button type="button" data-q="${n}">${fmtT(n)}</button>`).join("")}</div>
      <label class="wp-gmr-in"><span>${esc(TW("Note (optional)"))}</span><input type="text" data-note maxlength="80" placeholder="${esc(TW("e.g. Weekly event winner"))}"></label>
      <p class="wp-st-status" data-st hidden></p>
      <button type="button" class="wp-st-buy" data-go>${esc(TW("Send from my wallet"))}</button>
      <div class="wp-gmr-done" data-done hidden></div>
      <p class="wp-st-note">${esc(TW("Your wallet sends the tokens directly to this player. The game only notes it, once the transaction is confirmed."))}</p>`); wire(box);
    const $b = (q) => box.querySelector(q), st = (t) => { const e = $b("[data-st]"); if (!e) return; e.hidden = !t; e.textContent = t || ""; };
    // the GM's balance: through the wallet's own node when connected, else the server's public read
    let have = null;
    (async () => { try { const a = addr() || s.wallet; let hex = null;
      try { hex = await rpcRead("eth_call", [{ to: TOK, data: "0x70a08231" + pad(a) }, "latest"]); } catch { const j = await (await fetch("/api/social?world=holding&wallet=" + a)).json(); hex = "0x" + BigInt(j.arc).toString(16); }
      have = BigInt(hex); const e = $b("[data-bal]"); if (e) e.textContent = fmtT(Number(have / 10n ** 14n) / 1e4) + " $ARCIRCLE"; } catch { const e = $b("[data-bal]"); if (e) e.textContent = "—"; } })();
    box.addEventListener("click", (e) => { const q = e.target.closest("[data-q]"); if (q) $b("[data-amt]").value = q.dataset.q; });
    let busyG = false;
    $b("[data-go]").addEventListener("click", async () => {
      if (busyG) return; const wei = toWei($b("[data-amt]").value); if (!wei) { st(TW("Enter an amount")); return; }
      if (have !== null && wei > have) { st(TW("That's more than your $ARCIRCLE")); return; }
      if (!TOK || !AC) { st(TW("Wallet connect isn't available here.")); return; }
      busyG = true; const go = $b("[data-go]"); go.disabled = true; let tx = null;
      try {
        if (!AC.live || !AC.live()) await AC.connect();
        if (String(addr()).toLowerCase() !== String(s.wallet).toLowerCase()) { st(TW("Switch your wallet to the one you signed in with ({w})", { w: short(s.wallet) })); return; }
        const prov = await AC.provider();
        try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }); } catch (e2) { if (e2 && e2.code === 4001) throw e2; }
        st(TW("Confirm the transfer in your wallet…"));
        tx = await prov.request({ method: "eth_sendTransaction", params: [{ from: addr(), to: TOK, data: "0xa9059cbb" + pad(w) + pad(wei.toString(16)) }] });
        st(TW("Sent. Waiting for the transaction to confirm…"));
        let r = null; for (let i = 0; i < 40; i++) { await new Promise((ok) => setTimeout(ok, i ? 3000 : 2000)); r = await post({ action: "world-gm-reward-log", ...sess(), to: w, tx, note: $b("[data-note]").value }); if (r.status !== 202 && r.status < 500) break; }
        const ok = r && r.ok, d = $b("[data-done]");
        st(ok ? "" : TW("Sent, but the game couldn't note it yet: {e}", { e: String((r && r.j && r.j.error) || TW("network")).slice(0, 90) }));
        if (d) { d.hidden = false; d.innerHTML = `${ok ? `<b>✅ ${esc(TW("Reward sent: {n} $ARCIRCLE", { n: fmtT(r.j.reward.tokens) }))}</b>` : ""}<code>${esc(tx)}</code><span><a class="wp-gmr-b" href="${esc(txUrl(tx))}" target="_blank" rel="noopener">${esc(TW("Explorer"))} ↗</a><button type="button" class="wp-gmr-b" data-copytx="${esc(tx)}">${esc(TW("Copy tx link"))}</button><button type="button" class="wp-gmr-b" data-seelist>${esc(TW("Rewards"))}</button></span>`;
          const sl = d.querySelector("[data-seelist]"); if (sl) sl.addEventListener("click", () => { close(); list(w, name); }); }
        if (ok) { if (Snd.coin) Snd.coin(); go.hidden = true; }
      } catch (err) { st(tx ? TW("Sent, but the game couldn't note it yet: {e}", { e: "network" }) : err && err.code === 4001 ? TW("Cancelled in the wallet") : TW("The transfer didn't go through: {e}", { e: String((err && err.message) || err).slice(0, 90) })); }
      finally { busyG = false; go.disabled = false; }
    });
  }
  return { send, list };
})();
// b-fx1: a gift opening — the box drops in, shakes, bursts open in a flash of light, and what was inside pops out one
// by one; a tap (or the button) closes it. Resolves when closed. Less motion: the contents straight away
function giftOpen(title, items, kind = "launch") {
  return new Promise((done) => {
    const el = document.createElement("div"); el.className = "wp-gift-open k-" + kind + (reduce ? " now" : ""); el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
    el.innerHTML = `<div class="wp-go-rays"></div>${kind === "invite" ? '<div class="wp-go-hearts">' + "<b>💗</b>".repeat(10) + "</div>" : ""}<img class="wp-go-box" src="/images/world-starter-box.webp" alt=""><div class="wp-go-in"><h2>${esc(title)}</h2><ul>${items.map((x, i) => `<li style="--i:${i}"><img src="${esc(x.img)}" alt=""><b>${esc(x.t)}</b></li>`).join("")}</ul><button type="button" class="wp-st-buy">${esc(TW("Claim"))}</button></div>`;
    document.body.appendChild(el); frozen = true; keys.clear();
    if (!reduce) { setTimeout(() => { el.classList.add("burst"); const f = kind === "invite" ? Snd.win || Snd.level : kind === "daily" ? Snd.coin || Snd.level : Snd.level; if (f) try { f(); } catch { /* quiet */ } }, 1250); setTimeout(() => el.classList.add("show"), 1500); } else el.classList.add("burst", "show");
    let shut = false; const close = () => { if (shut) return; shut = true; el.classList.add("bye"); setTimeout(() => { el.remove(); frozen = false; done(); }, 240); };
    el.addEventListener("click", (e) => { if (el.classList.contains("show") && (e.target.closest("button") || e.target === el)) close(); });
    setTimeout(() => { if (!shut) close(); }, 12000);
  });
}
const referUI = (() => {
  const KEY = "arc.ref"; let v = null, code = "", busyR = false;
  const pend = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
  const drop = () => { try { localStorage.removeItem(KEY); } catch { /* private */ } };
  try { const q = String(new URLSearchParams(location.search).get("ref") || "").toLowerCase(); if (/^[0-9a-z]{8}$/.test(q)) localStorage.setItem(KEY, q); } catch { /* private */ }
  const fmtN = (n) => Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US");
  async function look() {
    const s = sess(); if (!s) { v = null; return v; }
    try { const r = await fetch("/api/social?world=refer&wallet=" + encodeURIComponent(String(s.wallet).toLowerCase()), { cache: "no-store" }); if (r.ok) { v = await r.json(); if (v.code) code = v.code; } } catch { /* the next look */ }
    return v;
  }
  async function ensureCode() {
    if (code) return code; const s = sess(); if (!s) return "";
    try { const r = await post({ action: "world-refer-code", ...s }); if (r.ok && r.j.code) code = r.j.code; } catch { /* the plain link */ }
    return code;
  }
  /// a friend's invite waiting: tied once you're signed in (a refusal — your own, an old account, already tied — drops it)
  async function bind() {
    const c = pend(), s = sess(); if (!c || !s || busyR) return; if (code && c === code) { drop(); return; }
    busyR = true; let r = null; try { r = await post({ action: "world-refer-bind", ...s, code: c }); } catch { r = null; } busyR = false;
    if (!r) return;
    if (r.ok) { drop(); toast(`💌 <b>${esc(TW("You joined {name}'s invite!", { name: r.j.name || TW("a friend") }))}</b> ${esc(TW("Reach level {n} and you both get {a} ARCL and a dinosaur egg.", { n: (v && v.minLv) || 5, a: fmtN((v && v.reward && v.reward.arcl) || 1000) }))}`); look(); return; }
    if (r.status >= 400 && r.status < 500 && r.status !== 429) drop();
  }
  function paid(j) {
    giftOpen(TW("Invite reward!"), [{ img: "/images/launch/arcl.webp", t: fmtN(j.arcl || 1000) + " ARCL" }, ...(j.egg ? [{ img: "/images/dino-egg.webp", t: TW("A dinosaur egg") }] : [])], "invite");
    toast(`🎉 <b>${esc(TW("Invite reward!"))}</b> ${esc(TW("+{a} ARCL and a dinosaur egg in the Hatchery — your friend got theirs too.", { a: fmtN(j.arcl || 1000) }))}`);
    refreshPurse(true); try { dinoTown.look(); } catch { /* the next look */ }
  }
  const link = () => location.origin + "/play?with=" + myTag + (code ? "&ref=" + code : "");
  async function open() {
    closeAll(); const s = sess();
    const box = document.createElement("div"); box.className = "wp-st wp-refer"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
    document.body.appendChild(box); frozen = true; keys.clear();
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true);
    const paint = () => {
      const R = (v && v.reward) || { arcl: 1000 }, minLv = (v && v.minLv) || 5, kids = (v && v.kids) || [], lvMe = (v && v.lv) || level();
      const note = !s ? TW("Sign in with your wallet so your invites count (the link works either way).") : lvMe < ((v && v.inviterLv) || 5) ? TW("Your invites count from level {n} — you're level {l}.", { n: (v && v.inviterLv) || 5, l: lvMe }) : "";
      box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>
        <div class="wp-refer-head"><span class="wp-refer-ic">💌</span><h2>${esc(TW("Invite friends"))}</h2><p>${esc(TW("When a friend you invite reaches level {n}, you both get:", { n: minLv }))}</p></div>
        <ul class="wp-st-list"><li><img class="wp-launch-ic" src="/images/launch/arcl.webp" alt="" width="56" height="56"><div><b>${fmtN(R.arcl)} ARCL</b><small>${esc(TW("Each of you, straight into your ARCL balance."))}</small></div></li>
          <li><img class="wp-launch-ic" src="/images/dino-egg.webp" alt="" width="56" height="56"><div><b>${esc(TW("A dinosaur egg"))}</b><small>${esc(TW("Each of you: its grade is rolled like a wild egg's — even Legendary."))}</small></div></li></ul>
        <div class="wp-refer-link"><input readonly value="${esc(link())}" aria-label="${esc(TW("Your invite link"))}"><button type="button" data-copy>${esc(TW("Copy"))}</button></div>
        <div class="wp-share-btns"><button type="button" class="wp-st-buy" data-x>𝕏 ${esc(TW("Share on X"))}</button>${navigator.share ? `<button type="button" data-sh>📤 ${esc(TW("Share"))}</button>` : ""}</div>
        ${note ? `<p class="wp-st-note">${esc(note)}</p>` : ""}
        ${v && v.by ? `<p class="wp-refer-by">${esc(TW("You joined {name}'s invite", { name: v.by.name }))}${v.paidMe ? " · ✅" : " · " + esc(TW("level {n} for the reward", { n: minLv }))}</p>` : ""}
        <h3 class="wp-refer-h">${esc(TW("Friends you invited"))} <small>${v ? `${v.paid || 0} ✅ / ${v.n || 0}` : s ? '<i class="wp-skel" style="width:46px"></i>' : ""}</small></h3>
        ${kids.length ? `<ul class="wp-refer-kids">${kids.map((k) => `<li class="${k.paid ? "paid" : ""}"><b>${esc(k.name)}</b><small>Lv ${k.lv}</small><span>${k.paid ? "✅ " + esc(TW("Rewarded")) : esc(TW("{l} / {n}", { l: Math.min(k.lv, minLv), n: minLv }))}</span><i style="--w:${Math.min(100, (Math.min(k.lv, minLv) / minLv) * 100).toFixed(0)}%"></i></li>`).join("")}</ul>` : `<p class="wp-st-note">${esc(TW("No one yet. Send your link to a friend!"))}</p>`}
        <p class="wp-st-note">${esc(TW("A friend counts when they're new (level 3 or lower) when they join. Rewards for up to {d} friends a day and {c} in all; your friend always gets theirs.", { d: (v && v.day) || 5, c: (v && v.cap) || 30 }))}</p></div>`;
      box.querySelector(".wp-st-x").addEventListener("click", close);
      box.querySelector("[data-copy]").addEventListener("click", async () => { try { await navigator.clipboard.writeText(link()); toast(TW("Invite link copied")); } catch { toast(link()); } });
      const words = TW("Come play ARCIRCLE World with me! 🌍 Raise dinosaurs, play the Game Village, build your island.") + "\n\n♾️ ARCIRCLE WORLD — Play. Build. Battle. Earn.\n$ARCIRCLE #ARCIRCLE #Arc #GameFi";
      box.querySelector("[data-x]").addEventListener("click", () => { const u = "https://x.com/intent/post?text=" + encodeURIComponent(words) + "&url=" + encodeURIComponent(link()); if (!window.open(u, "_blank", "noopener")) location.href = u; });
      const sh = box.querySelector("[data-sh]"); if (sh) sh.addEventListener("click", async () => { try { await navigator.share({ title: "ARCIRCLE World", text: words, url: link() }); } catch { /* closed */ } });
    };
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    paint();
    if (s) { await ensureCode(); await look(); if (box.isConnected) paint(); post({ action: "world-refer-claim", ...s }).then((r) => { if (r && r.ok && r.j.paid && r.j.paid.length) { refreshPurse(true); look().then(() => { if (box.isConnected) paint(); }); } }).catch(() => {}); }
  }
  setTimeout(() => { look().then(bind); }, 9000); setInterval(() => { if (pend() && sess()) look().then(bind); }, 30e3);
  return { open, link, look, paid, ensureCode, bind, state: () => ({ v, code, pend: pend() }) };
})();
// the calm-moment check (autoShow above): every 1.5 s, the most important waiting window opens when nothing else is up
{ const POPS = '.wp-tips,.wp-coach,.wp-st,.wp-cbt,.wp-games,.wp-rew-pop,[role="dialog"],#wp-guide:not([hidden]),#wp-make:not([hidden]),#wp-auth:not([hidden])';
  setInterval(() => {
    if (!autoQ.size) return;
    if (mode !== "hub" || frozen || introOn || jurOn || survOn || pokerOn || ringsOn || mineOn || defenseOn || jumpOn || beatOn || !worldReady || document.hidden) { calmAt = Date.now(); return; }
    if ([...document.querySelectorAll(POPS)].some((d) => !d.hidden && d.getClientRects().length)) { calmAt = Date.now(); return; }
    if (Date.now() - calmAt < 4000) return;
    const [name, e] = [...autoQ].sort((a, b) => a[1].prio - b[1].prio)[0]; autoQ.delete(name);
    try { if (e.open() !== false) calmAt = Date.now(); } catch (err) { console.warn("auto window", name, err); }
  }, 1500); }
// the games, in one list (Menu → Games, the 🎮 button): each with a picture from the game, what it is, what it pays, and
// a button that takes you there (to its door in the Game Village, then in). What each pays is the server's own rules
// (api/_world-shop.mjs EARN); the day's ARCL so far comes from the server.
const GAME_LIST = [
  { id: "jurassic", warp: ["#3dff9a", "#1fae5c", "#c8ff6a"], genre: "Adventure", name: "JURASSIC WORLD", tag: "Raise · Ride · Survive", pay: "Dinosaur eggs, a companion and XP", open: () => openJurassic() },
  { id: "surv", warp: ["#ff8a3a", "#ff4d6d", "#ffd75e"], genre: "Action", name: "SURVIVORS ARENA", tag: "Survive 12 minutes", pay: "Up to 3,000 ARCL a run · 3 paid runs a day", door: "surv", open: () => openSurvivors() },
  { id: "poker", warp: ["#b46cff", "#ffd23a", "#7a4dff"], genre: "Cards", name: "ARCIA POKER LOUNGE", tag: "Hold'em · Blackjack · free chips", pay: "300 ARCL a daily mission (never for winning)", door: "poker", open: () => openPoker() },
  { id: "rings", warp: ["#2ee0b0", "#38d8ff", "#9fe6ff"], genre: "Puzzle", name: "INFINITY RINGS", tag: "Ring puzzles · daily boards", pay: "100 ARCL a new star", door: "rings", open: () => openRings() },
  { id: "mine", warp: ["#ffc23c", "#ff8a3a", "#fff3c2"], genre: "Mining", name: "ARCL MINE", tag: "Mine · Collect", pay: "10–10,000 ARCL a rock", open: () => openMine() },
  { id: "defense", warp: ["#ff6a4d", "#38d8ff", "#ffd75e"], genre: "Strategy", name: "AC DEFENSE", tag: "Tower defence", pay: "5 ARCL a wave · up to 150 a day", door: "defense", open: () => openDefense() },
  { id: "jump", warp: ["#ffc861", "#2f86ff", "#fff3b8"], genre: "Platform", name: "COIN JUMP", tag: "Jump to the crown", pay: "3,000 ARCL at the crown, once a day", door: "jump", open: () => openJump() },
  { id: "beat", warp: ["#ff5ad8", "#7a3cff", "#38d8ff"], genre: "Rhythm", name: "BEAT STOMP", tag: "Rhythm game", pay: "World XP", door: "beat", open: () => openBeat() },
];
const PLAYED = "arc.world.played";
const playedAny = () => { try { return !!localStorage.getItem(PLAYED); } catch { return false; } };
setInterval(() => { if ((jurOn || survOn || pokerOn || ringsOn || mineOn || defenseOn || jumpOn || beatOn) && !playedAny()) try { localStorage.setItem(PLAYED, String(Date.now())); } catch { /* private */ } }, 5000);
function goGame(g) {
  if (mode !== "hub" || introOn || flying) { toast(TW("Go back to the town first")); return; }
  if (jurOn || survOn || pokerOn || ringsOn || mineOn || defenseOn || jumpOn || beatOn) { toast(TW("Leave this game first")); return; }
  closeAll(); frozen = false;
  // b-fx1: a portal swirl round the game's picture, which zooms in, then the game (less motion: none)
  fun("game"); try { if (quests && quests.bump) quests.bump("game"); } catch { /* counted next time */ } if (!reduce) { const w = document.createElement("div"); w.className = "wp-warp"; if (g.warp) g.warp.forEach((c, k) => w.style.setProperty("--w" + (k + 1), c)); w.innerHTML = `<i></i><img src="/images/games/${g.id}-art.webp" alt="">`; document.body.appendChild(w); setTimeout(() => w.classList.add("out"), 900); setTimeout(() => w.remove(), 1400); }
  if (g.door) { const e = gv.exitOf(g.door); standAt(e.x, e.z, gv.center); vfx.teleport(here(), { color: 0xb48cff, color2: 0x38d8ff }); }
  setTimeout(() => { try { const r = g.open(); if (r && r.catch) r.catch((e) => toast(TW("Couldn't start it: {e}", { e: String((e && e.message) || e).slice(0, 60) }))); } catch (e) { toast(TW("Couldn't start it: {e}", { e: String((e && e.message) || e).slice(0, 60) })); } }, reduce ? (g.door ? 350 : 0) : 650);
}
async function openGames() {
  closeAll(); const s = sess(), fmtN = (n) => Number(n || 0).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US");
  const box = document.createElement("div"); box.className = "wp-st wp-games"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
  document.body.appendChild(box); frozen = true; keys.clear();
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  let day = null, friends = null;
  const paint = () => {
    const seen = ghosts ? ghosts.named() : [], on = (friends || []).filter((x) => x.st === "friend" && x.on).slice(0, 6);
    // b-gm: the owner's Games design — a header with ARC pointing at the list, then the eight as picture cards (number,
    // genre, name, what it is, what it pays, Play). No "playing now" counts: the server doesn't count players per game
    // yet, and the list shows nothing it can't back up
    const payHtml = (t) => esc(t).replace(/(\d[\d,.–]*(?:\s?ARCL)?)/, "<b>$1</b>");
    box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>
      <header class="wg-head"><div class="wg-title"><span class="wg-pad" aria-hidden="true"></span><div><h2>${esc(TW("GAMES"))}</h2><p>PLAY. BUILD. BATTLE. <b>EARN.</b></p></div></div>
        <div class="wg-bubble">${esc(TW("Play games, earn rewards, and build your village in ARCIRCLE WORLD!"))}</div><img class="wg-arc" src="/images/games/arc-guide.webp" alt="" width="259" height="246">
        <small class="wg-count">${esc(TW("{n} games in ARCIRCLE World — pick one and go.", { n: GAME_LIST.length }))}</small></header>
      <div class="wp-games-body"><ul class="wp-games-grid wg-grid">${GAME_LIST.map((g, i) => `<li style="--i:${i}"><button type="button" data-game="${g.id}"><span class="wg-art"><img src="/images/games/${g.id}-art.webp" srcset="/images/games/${g.id}-art-300.webp 300w, /images/games/${g.id}-art.webp 468w" sizes="300px" alt="" loading="lazy" width="468" height="139"><i>${i + 1}</i><em>${esc(TW(g.genre))}</em></span><span class="wg-txt"><b>${esc(g.name)}</b><small>${esc(TW(g.tag))}</small></span><span class="wg-foot"><span class="wg-pay"><i aria-hidden="true"></i><span>${payHtml(TW(g.pay))}</span></span><span class="wp-games-go">${esc(TW("Play"))} →</span></span></button></li>`).join("")}</ul>
      <aside class="wp-games-side">
        <section><h3>🎁 ${esc(TW("Today"))}</h3>${s ? (day ? `<p class="wp-games-day"><b>${fmtN(day.today)}</b> / ${fmtN(day.cap)} ARCL</p><i class="wp-games-bar"><u style="width:${Math.min(100, (day.today / Math.max(1, day.cap)) * 100).toFixed(1)}%"></u></i><small>${esc(TW("ARCL you've earned from play today, and the day's limit"))}</small>` : `<p class="wp-games-day"><i class="wp-skel" style="width:60%"></i></p><i class="wp-skel" style="width:100%;height:8px"></i>`) : `<small>${esc(TW("Sign in with your wallet to earn ARCL from the games."))}</small>`}${weekend2x() ? `<p class="wp-games-wk">🌙 ${esc(TW("Weekend 2×: double XP and double ARCL from play"))}</p>` : ""}</section>
        <section><h3>🟢 ${esc(TW("Friends online"))} <small>${friends ? `${on.length} / ${friends.filter((x) => x.st === "friend").length}` : ""}</small></h3>${!s ? `<small>${esc(TW("Sign in to see your friends."))}</small>` : !friends ? `<ul class="wp-games-fr">${'<li><i class="wp-skel" style="width:70%"></i></li>'.repeat(3)}</ul>` : on.length ? `<ul class="wp-games-fr">${on.map((x) => { const g = seen.find((y) => String(y.wallet).toLowerCase() === x.w); return `<li><b>${esc(x.n || x.w.slice(0, 6) + "…")}</b><small>${x.lv ? "Lv " + x.lv : ""}${g ? " · " + esc(TW("in town")) : ""}</small>${g ? `<button type="button" data-near="${esc(x.w)}">${esc(TW("Go there"))}</button>` : ""}</li>`; }).join("")}</ul>` : `<small>${esc(TW("No friends online right now."))}</small>`}
          ${stats && stats.online != null ? `<p class="wp-games-on">${esc(stats.online === 1 ? TW("1 player online now") : TW("{n} players online now", { n: fmtN(stats.online) }))}</p>` : ""}<button type="button" class="wp-games-side-b" data-friends>${esc(TW("Chat and friends"))} →</button></section>
      </aside></div>
      <div class="wp-games-foot"><button type="button" data-start><span>🧭</span><div><b>${esc(TW("New player guide"))}</b><small>${esc(TW("Your first five minutes, step by step"))}</small></div></button><button type="button" data-invite><span>💌</span><div><b>${esc(TW("Invite friends"))}</b><small>${esc(TW("You both get 1,000 ARCL and a dinosaur egg"))}</small></div></button></div></div>`;
  };
  // b-r2: a card leans a little toward the pointer (a mouse; a touch doesn't hover)
  if (matchMedia("(hover:hover)").matches && !reduce) box.addEventListener("pointermove", (e) => { const b = e.target.closest && e.target.closest(".wg-grid button"); box.querySelectorAll(".wg-grid button.tilt").forEach((x) => { if (x !== b) { x.classList.remove("tilt"); x.style.transform = ""; } }); if (!b) return;
    const r = b.getBoundingClientRect(), kx = (e.clientX - r.left) / r.width - 0.5, ky = (e.clientY - r.top) / r.height - 0.5; b.classList.add("tilt"); b.style.transform = `perspective(800px) rotateX(${(-ky * 6).toFixed(2)}deg) rotateY(${(kx * 8).toFixed(2)}deg) translateY(-4px)`; });
  box.addEventListener("click", (e) => {
    if (e.target === box || e.target.closest(".wp-st-x")) { close(); return; }
    const gb = e.target.closest("[data-game]"); if (gb) { const g = GAME_LIST.find((x) => x.id === gb.dataset.game); close(); if (g) goGame(g); return; }
    const nb = e.target.closest("[data-near]"); if (nb) { const g = (ghosts ? ghosts.named() : []).find((y) => String(y.wallet).toLowerCase() === nb.dataset.near); close(); if (g) goNear(g.x, g.z); return; }
    if (e.target.closest("[data-friends]")) { close(); chatUI.show(); return; }
    if (e.target.closest("[data-start]")) { close(); openStart(true); return; }
    if (e.target.closest("[data-invite]")) { close(); referUI.open(); }
  });
  paint();
  if (s) {
    const w = encodeURIComponent(String(s.wallet).toLowerCase());
    await Promise.all([fetch("/api/social?world=arcl&wallet=" + w, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) day = { today: j.today || 0, cap: j.cap || 30000 }; }).catch(() => {}),
      post({ action: "world-friends", ...s }).then((r) => { friends = r && r.ok ? r.j.friends || [] : []; }).catch(() => { friends = []; })]);
    if (box.isConnected) paint();
  }
}
// Getting started (the first five minutes, in one card): your character → the controls → the launch gift → your first
// egg → your first game. Shown once by itself after the controls (instead of that day's tips), and from Games → New
// player guide; each step shows whether it's done and has its button.
const START = "arc.world.start";
function startSteps() {
  const L = launchUI.state().v, D = dinoTown.state(), s = sess(), played = playedAny();
  const gift = L && L.open ? (L.claimed ? "done" : s ? (L.eligible ? "go" : "lv") : "sign") : "none";
  const egg = D ? (D.first ? "go" : "done") : s ? "go" : "sign";
  const steps = [
    { n: 1, ic: "🙂", t: TW("Create your character"), p: TW("Your look and your name — done!"), done: !!P.char },
    { n: 2, ic: "🎮", t: TW("Quick guide"), p: TW("Move, jump, attack and talk. The controls are in Menu → Controls."), done: !!P.guideSeen, b: TW("Controls"), go: () => openGuide() },
    ...(gift === "none" ? [] : [{ n: 3, ic: "🎁", t: TW("Launch rewards"), p: gift === "lv" ? TW("Reach level {n} to take it (you're level {l})", { n: L.minLv || 5, l: L.lv || level() }) : gift === "sign" ? TW("Sign in with your wallet to take it") : TW("An Advanced egg, five 3× EXP potions and 5,000 ARCL"), done: gift === "done", b: gift === "sign" ? TW("Sign in") : TW("Claim"), go: gift === "lv" ? null : () => (gift === "sign" ? openAuth() : launchUI.open()) }]),
    { n: 0, ic: "🥚", t: TW("Your first egg"), p: egg === "sign" ? TW("Sign in with your wallet to raise a dinosaur") : TW("Pick it up in Jurassic World and care for it for 3 days."), done: egg === "done", b: TW("Jurassic World"), go: () => goGame(GAME_LIST[0]) },
    { n: 0, ic: "🕹️", t: TW("Play your first game"), p: TW("Survivors, poker, puzzles, the mine… Try one!"), done: played, b: TW("Games"), go: () => openGames() },
  ].map((x, i) => ({ ...x, n: i + 1 }));
  return steps;
}
function openStart(asked) {
  const steps = startSteps(), left = steps.filter((x) => !x.done).length;
  if (!asked && !left) return false;
  try { localStorage.setItem(START, "1"); localStorage.setItem("arc.tips.town", tipDay()); } catch { /* private */ }
  const box = document.createElement("div"); box.className = "wp-st wp-start"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
  const next = steps.find((x) => !x.done && x.go);
  box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>
    <h2>${esc(TW("Your first 5 minutes"))}</h2><p class="wp-start-sub">${esc(left ? TW("{n} of {m} done — one smooth path to your first game.", { n: steps.length - left, m: steps.length }) : TW("All done — have fun out there!"))}</p>
    <ol class="wp-start-steps">${steps.map((x) => `<li class="${x.done ? "done" : x === next ? "now" : ""}"><i>${x.done ? "✓" : x.n}</i><span class="wp-start-ic">${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(x.p)}</small></div>${!x.done && x.go ? `<button type="button" data-step="${x.n}">${esc(x.b)}</button>` : ""}</li>`).join("")}</ol>
    ${next ? `<button type="button" class="wp-st-buy" data-step="${next.n}">${esc(next.b)} →</button>` : ""}</div>`;
  document.body.appendChild(box); frozen = true; keys.clear();
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  box.addEventListener("click", (e) => { if (e.target === box || e.target.closest(".wp-st-x")) { close(); return; } const b = e.target.closest("[data-step]"); if (!b) return; const st0 = steps.find((x) => x.n === Number(b.dataset.step)); close(); if (st0 && st0.go) st0.go(); });
}
// once by itself: a new player (under level 10) who hasn't seen it, after the controls; it goes after the launch card
setTimeout(function tryStart() { let seen = true; try { seen = !!localStorage.getItem(START); } catch { /* private */ }
  if (seen || level() >= 10) return; if (worldReady && P.guideSeen && Date.now() - qsAt > 60e3) autoShow("start", 15, () => openStart(false)); else setTimeout(tryStart, 4000); }, 10000); // (b-st3: a minute after the how-to, so the plaza comes first)
// phones: the top bar's reward buttons (Gifts, Launch, Starter) and the Shop fold into one 🎁 button with a list; a 🎮 Games button next to it
const rewUI = (() => {
  const bar = document.querySelector(".wp-hud-btns"), ref = $("wp-gift-btn"); if (!bar || !ref) return { paint() {} };
  const gb = document.createElement("button"); gb.type = "button"; gb.className = "wp-btn wp-lbtn wp-games-btn"; gb.id = "wp-games-btn"; gb.title = TW("Games"); gb.setAttribute("aria-haspopup", "dialog"); gb.innerHTML = `<span class="wp-gb-ic" aria-hidden="true">🎮</span><span class="wp-bl">${esc(TW("Games"))}</span>`;
  const rb = document.createElement("button"); rb.type = "button"; rb.className = "wp-btn wp-lbtn wp-rew-btn"; rb.id = "wp-rew-btn"; rb.title = TW("Rewards"); rb.setAttribute("aria-haspopup", "menu"); rb.innerHTML = `<span class="wp-gb-ic" aria-hidden="true">🎁</span><span class="wp-bl">${esc(TW("Rewards"))}</span>`;
  bar.insertBefore(rb, ref);
  // the Studio's shortcut, left of Rewards (2026-10-26, the owner): a portal to Creator City from anywhere in the town
  { const sb = document.createElement("button"); sb.type = "button"; sb.className = "wp-btn wp-lbtn wp-stu-btn"; sb.id = "wp-stu-btn"; sb.title = TW("ARCIRCLE Studio"); sb.setAttribute("aria-haspopup", "dialog"); sb.innerHTML = `<span class="wp-gb-ic" aria-hidden="true">🕹️</span><span class="wp-bl">${esc(TW("Studio"))}</span>`;
    bar.insertBefore(sb, rb); sb.addEventListener("click", () => { if (mode !== "hub" || frozen) return; closeAll(); if (landNow === "cc") openStudio(); else ccGo(); }); } // (SB-1: a portal to Creator City, like the Studio by the fountain; in the city it opens the Studio)
  // the dock's first button (b-ui2): Games; Character moves into the Menu on phones (Menu → Inventory)
  { const dock = $("wp-dock"); if (dock) { gb.className = "wp-dk"; gb.id = "wp-dk-games"; gb.innerHTML = `<span data-no-i18n>${esc(TW("Games"))}</span>`; dock.insertBefore(gb, dock.firstChild); } }
  gb.addEventListener("click", () => { closeAll(); openGames(); });
  const items = () => [
    [".wp-launch-btn", "🚀", TW("Official launch")], ["#wp-gift-btn", "🎁", TW("Welcome Week")], ["#wp-starter-btn", "📦", TW("Starter Package")],
    ["#wp-shop-btn", "🛒", TW("ARCL Shop")], ["invite", "💌", TW("Invite friends")],
  ].filter(([sel]) => sel === "invite" || (document.querySelector(sel) && !document.querySelector(sel).hidden));
  const hot = (sel) => { const e = sel !== "invite" && document.querySelector(sel); return !!(e && (e.classList.contains("dot") || e.classList.contains("ready"))); };
  let pop = null;
  const shut = () => { if (pop) { pop.remove(); pop = null; rb.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", outside, true); } };
  const outside = (e) => { if (pop && !pop.contains(e.target) && !rb.contains(e.target)) shut(); };
  rb.addEventListener("click", () => {
    if (pop) { shut(); return; } closeAll();
    pop = document.createElement("div"); pop.className = "wp-rew-pop"; pop.setAttribute("role", "menu"); pop.setAttribute("data-no-i18n", "");
    pop.innerHTML = items().map(([sel, ic, label]) => `<button type="button" role="menuitem" data-sel="${esc(sel)}"><span>${ic}</span><b>${esc(label)}</b>${hot(sel) ? '<i class="wp-rew-dot"></i>' : ""}</button>`).join("");
    // under the Rewards button, its right edge with the button's: placed in the pop-up's own zoom (1.9 on phones), then
    // measured and nudged once — browsers differ on how zoom maps to CSS pixels (on Samsung Internet it opened mid-screen)
    const r = rb.getBoundingClientRect(); document.body.appendChild(pop); const zp = parseFloat(getComputedStyle(pop).zoom) || 1;
    let top = (r.bottom + 6) / zp, right = Math.max(8, innerWidth - r.right) / zp; pop.style.top = top + "px"; pop.style.right = right + "px";
    { const q = pop.getBoundingClientRect(), k = q.width && pop.offsetWidth ? q.width / pop.offsetWidth : zp; if (k > 0) { top += (r.bottom + 6 - q.top) / k; right += (q.right - r.right) / k; pop.style.top = top + "px"; pop.style.right = Math.max(0, right) + "px"; }
      const q2 = pop.getBoundingClientRect(); if (q2.left < 8) pop.style.right = Math.max(0, right - (8 - q2.left) / k) + "px"; }
    rb.setAttribute("aria-expanded", "true"); document.addEventListener("pointerdown", outside, true);
    pop.addEventListener("click", (e) => { const b = e.target.closest("[data-sel]"); if (!b) return; const sel = b.dataset.sel; shut(); if (sel === "invite") referUI.open(); else { const t = document.querySelector(sel); if (t) t.click(); } });
  });
  const paint = () => { rb.dataset.dot = items().some(([sel]) => hot(sel)) ? "1" : ""; };
  setInterval(paint, 4000); setTimeout(paint, 2500);
  return { paint, shut };
})();
// phones: a pop-up sheet (.wp-st) follows a drag down from its top and closes past 90 px (its own × does the closing,
// so each window's own close runs); a short drag springs back
if (document.documentElement.classList.contains("wp-pcphone")) { let d = null;
  document.addEventListener("pointerdown", (e) => { const card = e.target.closest && e.target.closest(".wp-st .wp-st-card"); if (!card || e.target.closest("button,input,a,select,textarea")) return;
    const z = parseFloat(getComputedStyle(card).zoom) || 1, r = card.getBoundingClientRect(); if (card.scrollTop > 0 || e.clientY - r.top * z > 120 * z) return; d = { card, y: e.clientY, z, dy: 0, id: e.pointerId }; card.closest(".wp-st").classList.add("drag"); }, true);
  addEventListener("pointermove", (e) => { if (!d || e.pointerId !== d.id) return; d.dy = Math.max(0, e.clientY - d.y); d.card.style.transform = `translateY(${d.dy / d.z}px)`; }, true);
  const end = () => { if (!d) return; const { card, dy, z } = d; d = null; const st0 = card.closest(".wp-st"); if (!st0) return; st0.classList.remove("drag");
    if (dy > 90 * Math.min(1, z / 1.6)) { st0.classList.add("out"); card.style.transform = ""; setTimeout(() => { const x = card.querySelector(".wp-st-x"); if (x && card.isConnected) x.click(); else st0.remove(); }, 200); }
    else { card.style.transition = "transform .2s cubic-bezier(.2,.9,.3,1.2)"; card.style.transform = ""; setTimeout(() => { card.style.transition = ""; }, 220); } };
  addEventListener("pointerup", end, true); addEventListener("pointercancel", end, true); }
/// a share card (world-share.js, loaded when first asked): your link with your invite on it
async function bragCard(card) {
  let M; try { M = await import("./world-share.js"); } catch (e) { if (staleReload()) return; toast(TW("Couldn't open the share card")); return; }
  try { await referUI.ensureCode(); } catch { /* the plain link */ }
  try { await M.openShare(card, { T: TW, esc, toast, coarse, link: () => referUI.link() }); } catch (e) { console.warn("share", e); toast(TW("Couldn't open the share card")); }
}
// AGENT DIMENSION (world-agent.js): your AI agent at your side, its talk window and errands; loaded a few seconds in
let agentDim = null, agentFails = 0;
const agentCalm = () => mode === "hub" && !jurOn && !survOn && !ringsOn && !pokerOn && !mineOn && !defenseOn && !jumpOn && !beatOn && !introOn && !document.body.classList.contains("wp-intro");
async function loadAgent() {
  if (agentDim || agentFails > 2) return agentDim;
  try { const M = await import("./world-agent.js"); agentDim = M.createAgentDim({ guide: (k) => openAdGuide(k), THREE, K, planet, here: (v) => here(v), facing: () => facing, ver: VER, inHub: () => mode === "hub" && !introOn && !jurOn, calm: agentCalm,
    T: TW, esc, toast, sess, post, signIn: () => signIn(), purse: (f) => refreshPurse(f), coarse, reduce, low: lowGfx, burst: (c) => burst(c), share: (c) => bragCard(c),
    tx: (to, data) => walletTx(to, data), arcircle: /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "" }); }
  catch (e) { agentFails++; console.warn("agent", e); if (staleReload()) return null; }
  return agentDim;
}
// the Partner Village's windows (world-partner.js): the KAIRO Finance Hub first; loaded the first time one is opened
let partnerUi = null;
async function openPartner(id) {
  let M; try { M = await import("./world-partner.js"); } catch (e) { if (staleReload()) return; toast(TW("Couldn't open it — try again")); return; }
  try { if (!partnerUi) partnerUi = M.createPartners({ T: TW, esc, toast, coarse, reduce, Snd, arcircle: /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "" }); closeAll(); partnerUi.open(id); }
  catch (e) { console.warn("partner", e); toast(TW("Couldn't open it — try again")); }
}
/// stepping through the Citadel's door: a flash of its light, the beam pulses, then the window
function agentWarp() {
  const u = agentGate.userData; if (u.warp) return; u.warp = 1;
  if (!reduce) { const f = document.createElement("div"); f.className = "wag-warp"; document.body.appendChild(f); setTimeout(() => f.remove(), 900); }
  try { if (Snd.perfect) Snd.perfect(); } catch { /* no sound */ }
  setTimeout(async () => { // AD-City 1: those it's open to (GM wallets for now, or ?adcity=1 to try) go into Nexus City; the rest see it being built
    let ok = CITY_TRY; try { if (!ok) { const a = await loadAgent(); ok = !!(a && a.canEnter && await a.canEnter()); } } catch { ok = false; }
    u.warp = 0; if (ok) { cityOk = true; cityGo(); } else openAgent();
  }, reduce ? 0 : 380);
}
// MYTHIC gear (the Crimson Celestial set, world-mythic-data.js + api/_world-mythic.mjs): what the server says you hold and
// wear; the pieces you wear (and can, at your level) take their slots' place and bring their stats and the set's bonuses
let mythicNow = null, MY = null;
async function refreshMythic() {
  const s0 = sess(); if (!s0) { mythicNow = null; return null; }
  try { if (!MY) MY = await import("./world-mythic-data.js"); const r = await fetch(`/api/social?world=mythic&wallet=${s0.wallet}`, { cache: "no-store" }); if (r.ok) { mythicNow = await r.json(); try { if (rpg) { rpg.refresh(); if (rpg.dress) rpg.dress(); if (rpg.isOpen && rpg.isOpen() && rpg.repaint) rpg.repaint(); } } catch { /* not built yet */ } } } catch { /* the gear you had stays */ }
  return mythicNow;
}
let myUI = null;
async function mythicUI() {
  if (myUI) return myUI;
  try { const M = await import("./world-mythic.js"); myUI = M.makeMythicUI({ buzz: (p) => buzz(p), THREE, K, T: TW, esc, post, sess, level, state: () => mythicNow, tx: (to, data) => walletTx(to, data), signTyped: (td) => walletSignTyped(td), isGM: () => rqGM(), usdcArc: async () => { try { const b = await bridgeMod(); return b ? b.arcUsdc() : null; } catch { return null; } }, bridge: (need) => openBridge({ need }), signIn: () => { try { signIn().then(() => refreshMythic()).then(() => { if (myUI && myUI.repaint) myUI.repaint(); }).catch(() => {}); } catch { /* the wallet button is there too */ } }, refresh: () => refreshMythic(), purse: () => refreshPurse(true), toast, reduce, share: (c) => bragCard(c),
    hero: () => { const h = String(heroOf(P.char || "")).replace("custom-", ""); return /^(aron|lumi|nex)$/.test(h) ? h : "aron"; }, eqItem: (slot) => { try { return (rpg && rpg.data().eq || {})[slot] || null; } catch { return null; } }, freeze: (on) => { frozen = !!on; keys.clear(); if (!on) { near = null; paintPrompt(); } }, ver: VER, Snd }); return myUI; }
  catch (e) { console.warn("mythic", e); if (!staleReload()) toast(TW("Couldn't open it — try again")); return null; }
}
// "Bring USDC to Arc" (world-bridge.js, Circle's CCTP with the forwarding hook): loaded the first time it opens
let bridgeUi = null;
async function bridgeMod() {
  if (bridgeUi) return bridgeUi; let M; try { M = await import("./world-bridge.js"); } catch (e) { if (staleReload()) return null; throw e; }
  bridgeUi = M.makeBridge({ T: TW, esc, toast, reduce, config: () => CFG, address: () => addr(), signIn: () => { try { signIn(); } catch { /* the wallet button is there too */ } },
    provider: async () => { if (AC && (!AC.live || !AC.live())) await AC.connect(); return AC ? AC.provider() : window.ethereum; },
    log: (t) => { try { if (diag && diag.err) diag.err(t, "bridge"); } catch { /* fine */ } },
    onArrive: () => { try { if (myUI && myUI.repaint) myUI.repaint(); } catch { /* fine */ } },
    onOpen: () => { frozen = true; keys.clear(); }, onClose: () => { if (!jurOn && !document.querySelector(".my-win, .wst:not([hidden])")) frozen = false; } });
  return bridgeUi;
}
async function openBridge(opt) { try { const b = await bridgeMod(); if (!b) return; b.open(opt || {}); } catch (e) { console.warn("bridge", e); toast(TW("The bridge couldn't open. Try again.")); } }
async function openMythic(slot) { const u = await mythicUI(); if (u) u.open(slot); } // (a guest opens it too: the set, the odds, the market and the boards to look at; acting asks for the wallet — world-mythic.js needSign)
// a worn piece on your hero: its packed model (models/world/mythic, ~7 k triangles), fetched once, sized for the slot with
// its grip / centre where the hand or head holds it; until it's in, the usual piece shows and the hero is dressed again after
// (mythGlb / MYTH_SIZE are declared near the top: the hero is dressed while the town loads, before this line runs)
function mythicModel(slot) {
  if (!MY || !MYTH_SIZE[slot]) return null; const m = mythicWorn().find((p) => MY.pieceOf(p.def).slot === slot); if (!m) return null;
  const P0 = MY.pieceOf(m.def), g = mythGlb[P0.glb];
  if (g && g !== "loading") { const c = g.clone(true); c.userData = { ...g.userData }; return c; }
  if (!g) { mythGlb[P0.glb] = "loading"; K.gltfLoader().load(`/models/world/mythic/${P0.glb}.glb${VER}`, (gl) => {
    const o = gl.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), k = MYTH_SIZE[slot] / Math.max(sz.x, sz.y, sz.z, 1e-3), c = box.getCenter(new THREE.Vector3());
    o.scale.setScalar(k); o.position.set(-c.x * k, slot === "weapon" ? -box.min.y * k - sz.y * k * 0.18 : -c.y * k, -c.z * k); // (a blade held a little above its foot; a shield and a helmet by their middle)
    o.traverse((n) => { if (n.isMesh) { n.castShadow = false; if (n.material && n.material.emissive) { n.material.emissive.set(0xff3d6e); n.material.emissiveIntensity = 0.25; } } });
    const grp = new THREE.Group(); grp.name = "mythic:" + slot; grp.add(o); grp.userData = { hold: slot === "weapon" ? "up" : "", size: sz.clone().multiplyScalar(k) }; mythGlb[P0.glb] = grp;
    try { if (rpg && rpg.dress) rpg.dress(); } catch { /* next dress */ } }, undefined, () => { delete mythGlb[P0.glb]; }); }
  return null;
}
// the six's Crimson aura (Crimson Ascension): a turning rune of crimson light under your feet and motes rising round you
// (low graphics: the rune only); shown while the stats say so
let mythAura = null, mythAuraT = 0;
st.on((dt, t) => {
  const on = !!(rpg && rpg.stats && rpg.stats().aura) && mode === "hub"; // (the stats are cached: cheap to ask each frame)
  if (mythAura) mythAura.visible = on;
  if (on && !mythAura && (mythAuraT -= dt) <= 0) { mythAuraT = 1;
    try {
      const g = new THREE.Group(), tex = new THREE.TextureLoader().load(`/images/mythic/aura-rune.webp${VER}`); tex.colorSpace = THREE.SRGBColorSpace;
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xff6a8a })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.1; disc.renderOrder = 3; disc.material.depthTest = false; g.add(disc);
      if (!lowGfx) { const n = 22, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.9; pos.set([Math.cos(a) * r, Math.random() * 2.2, Math.sin(a) * r], i * 3); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff7a9c, size: 0.09, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(pts); g.userData.pts = pts; }
      g.userData.disc = disc; player.add(g); mythAura = g;
    } catch (e) { console.warn("mythic aura", e); mythAuraT = 30; }
  }
  if (mythAura && mythAura.visible) { const d = mythAura.userData.disc; d.rotation.z += dt * 0.6; d.material.opacity = 0.7 + Math.sin(t * 2.2) * 0.2;
    const pts = mythAura.userData.pts; if (pts) { const a = pts.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * 0.7; if (y > 2.3) y = 0.05; a.setY(i, y); } a.needsUpdate = true; } }
});
// the hero's paint (world-kit.js PAINTS): a paint job you chose in the shop's Style, else the Crimson Celestial set's own
// once 3 pieces are worn (all seven at +10: the resonance's gold); checked twice a second and set only when it changes. In a
// fight the eyes and trim burn brighter (setBattle)
function heroSkin() {
  const pick = P.style && P.style.paint, PA = K.PAINTS || {}; if (pick && PA[pick]) return PA[pick];
  let n = 0; try { n = mythicWorn().length; } catch { /* not loaded */ } if (n < 3) return null;
  const res = !!(rpg && rpg.stats && rpg.stats().sets && MY && MY.setBonus && MY.setBonus(mythicWorn()).resonance);
  return { ...(res ? PA.resonance : PA.crimson), k: n >= 6 ? 1 : 0.82 };
}
// the Crimson Celestial armour on a hero's body (2026-10-25, Meshy parts, models/world/mythic/parts): the armour piece worn →
// pauldrons on both shoulders, a breastplate and a cape; the boots → greaves. They follow the bones' places each frame (the
// body turns with the hero; a pauldron doesn't twist with the arm), and they're left off the battle forms (armoured already)
const PART_FILES = { pauldron: 0.46, chest: 0.5, greave: 0.36, cape: 1.0 }, partSrc = {};
let bodyArm = null, partsKey = "", partsT = 0;
function partModel(n) {
  const g = partSrc[n]; if (g && g !== "loading") { const c = g.clone(true); return c; }
  if (!g) { partSrc[n] = "loading"; K.gltfLoader().load(`/models/world/mythic/parts/${n}.glb${VER}`, (gl) => { const o = gl.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), k = PART_FILES[n] / Math.max(sz.x, sz.y, sz.z, 1e-3), c = box.getCenter(new THREE.Vector3());
    o.scale.setScalar(k); o.position.set(-c.x * k, -c.y * k, -c.z * k); o.traverse((m) => { if (m.isMesh) { m.castShadow = false; if (m.material && m.material.emissive) { m.material.emissive.set(0xff3d6e); m.material.emissiveIntensity = 0.18; } } });
    const w = new THREE.Group(); w.add(o); partSrc[n] = w; partsKey = ""; }, undefined, () => { partSrc[n] = null; }); }
  return null;
}
function bodyParts() {
  if (!avatar || !avatar.custom || !avatar.obj || (avatar.height || 2.1) > 2.2) return null; // (heroes only, not the battle forms)
  let slots = []; try { slots = mythicWorn().map((p) => MY.pieceOf(p.def).slot); } catch { return null; }
  const want = []; if (slots.includes("armor")) want.push(["pauldron", "LeftArm", 1], ["pauldron", "RightArm", -1], ["chest", "Spine2", 0], ["cape", "Spine2", 0]);
  if (slots.includes("boots")) want.push(["greave", "LeftLeg", 1], ["greave", "RightLeg", -1]);
  return want;
}
st.on((dt, t) => {
  if ((partsT -= dt) <= 0) { partsT = 1; const w = bodyParts(), key = w ? avatar.obj.uuid + "|" + w.map((x) => x.join(":")).join(",") + "|" + Object.values(partSrc).filter((x) => x && x !== "loading").length : "";
    if (key !== partsKey) { partsKey = key; if (bodyArm) { bodyArm.g.parent && bodyArm.g.parent.remove(bodyArm.g); bodyArm = null; }
      if (w && w.length) { const g = new THREE.Group(); g.name = "mythic:bodyArm"; const L = [];
        for (const [n, bn, side] of w) { const m = partModel(n); if (!m) continue; let b = null; avatar.obj.traverse((o) => { if (!b && o.isBone && new RegExp(bn + "$", "i").test(o.name.replace(/[^a-z0-9]/gi, ""))) b = o; }); if (!b) continue; g.add(m); L.push({ m, b, n, side }); }
        avatar.obj.add(g); bodyArm = { g, L }; } } }
  if (!bodyArm || !avatar) return;
  const v = new THREE.Vector3();
  for (const p of bodyArm.L) { p.b.getWorldPosition(v); avatar.obj.worldToLocal(v); const m = p.m;
    if (p.n === "pauldron") { m.position.set(v.x + p.side * 0.13, v.y + 0.1, v.z); m.rotation.set(0, 0, p.side * -0.5); m.scale.x = p.side < 0 ? -1 : 1; }
    else if (p.n === "chest") m.position.set(v.x, v.y - 0.04, v.z + 0.26);
    else if (p.n === "cape") { m.position.set(v.x, v.y - 0.36, v.z - 0.3); m.rotation.set(0.12 + Math.sin(t * 2.2) * 0.05 + (speedNow > 1 ? 0.25 : 0), Math.PI, 0); }
    else if (p.n === "greave") m.position.set(v.x + p.side * 0.04, v.y - 0.06, v.z + 0.1); }
});
let skinKey = "-", skinT = 0;
st.on((dt) => {
  if (!avatar || !avatar.setSkin) return;
  if (avatar.setBattle) avatar.setBattle(document.body.classList.contains("wc-fight") || !!(rqL && rqL.running && rqL.running()));
  if ((skinT -= dt) > 0) return; skinT = 0.5;
  const sk = heroSkin(), key = sk ? `${sk.shell}|${sk.panel}|${sk.glow}|${sk.k}` : ""; if (key === skinKey && avatar.userData_skin === key) return;
  skinKey = key; avatar.userData_skin = key; avatar.setSkin(sk); paintCrown();
});
function mythicWorn() { if (!mythicNow || !MY) return []; const lv = level(); return Object.values(mythicNow.eq || {}).map((id) => (mythicNow.pieces || []).find((p) => p.id === id)).filter((p) => p && p.req <= lv && MY.pieceOf(p.def)); }
function withMythic(o) {
  const worn = mythicWorn(); if (!worn.length) return o;
  const x = { ...(o || {}), skip: {} };
  for (const p of worn) { x.skip[MY.pieceOf(p.def).slot] = 1; for (const [k, v] of Object.entries(MY.mythicStats(p))) x[k] = (x[k] || 0) + v; }
  const b = MY.setBonus(worn); for (const [k, v] of Object.entries(b.stats)) if (k !== "aura") x[k] = (x[k] || 0) + v; x.aura = !!b.stats.aura;
  x.mythic = worn.length; if (worn.some((p) => p.def === "CC_WEAPON")) x.reaper = MY.CC.REAPER; // (the Reaper worn: its scythe spin — world-combat.js reaperSpin)
  return x;
}
// RAID QUEENS (world-raidq.js): the land (LD.LANDS.rq), built the first time you go in through the Citadel
function ensureRq() {
  if (rqL) return Promise.resolve(rqL);
  return rqWait || (rqWait = import("./world-raidq.js").then((M) => {
    rqL = M.makeRaidQueens({ THREE, K, planet, cam: () => cam.position, brag: (c) => bragCard(c), onWin: () => { try { quests.bump("raidq"); } catch { /* the mission waits */ } rqAchLoad(true); }, knock: (x, z, p) => { knockV.set(x, 0, z).multiplyScalar(p); }, slowmo: (ms) => slowmo(ms), heroClip: (n) => { if (avatar && !(avatar.busy && avatar.busy())) avatar.play(n, { once: true }); }, T: TW, esc, toast, Snd, ver: VER, low: lowGfx, reduce, coarse, land: LD.LANDS.rq, combat: () => combat, here: (v) => here(v), level, sess, post,
      addItem: (it) => { rpg.addItem(it); save(); }, refresh: () => refreshPurse(true), itemName: (it) => rpg.itemName(it), parts, shake: (n) => { if (!reduce) shake = Math.max(shake, n); },
      stand: (x, z, c) => standAt(x, z, c), freeze: (on) => { frozen = !!on; keys.clear(); if (!on) { near = null; paintPrompt(); } }, compile: (l) => compileHidden(l), active: () => mode === "hub" && !frozen && !introOn && !flying,
      grantXp: (n) => { const before = level(); P.xp += n; save(); paintHud(); xpFloat(n); if (level() > before) { Snd.level(); burst(0x39ff88); levelUp(level(), before); } badges(); }, // (the server's grant: no boosts on top, it's already counted)
      isGM: () => rqGM(), tx: (to, data) => walletTx(to, data), openMythic: (slot) => openMythic(slot), mythicGot: (p) => { refreshMythic().then(() => mythicUI()).then((u) => u && u.reveal(p)); }, signIn: () => signIn().then(() => refreshPurse(true)), home: () => { frozen = false; landGo("town"); }, stats: () => rpg.stats(), music: (k) => { try { if (!jurOn) music.setList(k && MUS.RAIDQ[k] ? [MUS.RAIDQ[k]] : MUS.PLAYLIST); } catch { /* the town's music plays on */ } } });
    rqL.M = M; let rqSkyOff = false; st.on((dt, t) => { try { rqL.tick(dt, t); } catch (e) { console.warn("raid queens", e); }
      // the sky realm draws its own sky (its panorama and sunset): the town's dome, clouds and planets painted over it, so they're put away while you're there
      const off = landNow === "rq"; if (off) { sky.visible = false; clouds.visible = false; skyPlanets.visible = false; halo.visible = false; rqSkyOff = true; } else if (rqSkyOff) { rqSkyOff = false; sky.visible = true; clouds.visible = true; halo.visible = true; nightK = -1; dayNight(); } }); /* (halo: the town sky's big ARCIRCLE rings — a blue ring and a green bar over the Citadel, the owner's screenshot 2026-10-25) */ if (labels) labels.dirty = true; return rqL; })
    .catch((e) => { rqWait = null; console.warn("raid queens", e); if (!staleReload()) toast(TW("Couldn't open it — try again")); return null; }));
}
function rqWarp() {
  if (!rqOn()) { rqSoon(); return; } // (not open yet: the construction card)
  const u = rqGate.userData; if (u.warp) return; u.warp = 1;
  if (!reduce) { const f = document.createElement("div"); f.className = "wag-warp rq-warp"; document.body.appendChild(f); setTimeout(() => f.remove(), 900); }
  try { if (Snd.perfect) Snd.perfect(); } catch { /* no sound */ }
  setTimeout(() => { u.warp = 0; rqLobby(); }, reduce ? 0 : 380);
}
/// the one building for every run: 100 / 200 / 300 / 400 / SECRET (the owner, 2026-10-25: like SURVIVORS ARENA's building)
async function rqLobby() {
  if (frozen || flying || introOn || mode !== "hub") return;
  const card = rqL && rqL.prepared() ? null : rqLoadCard();
  const r = await ensureRq(); if (!r) { if (card) card.close(); return; } await rqReady(r, card); if (frozen || mode !== "hub") return;
  closeAll(); r.openLobby();
}
/// the Citadel before RAID QUEENS opens (anyone but a GM): what's being built, no way in yet
function rqSoon() {
  if (document.querySelector(".rq-soon")) return;
  const el = document.createElement("div"); el.className = "adc-card rq-soon"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", "");
  el.innerHTML = `<div class="adc-in" style="--ac:#ff4d8d"><img src="/images/raid/key-sm.webp${VER}" alt="" style="width:100%;border-radius:12px;margin-bottom:10px"><small>RAID QUEENS</small><h3>🚧 ${esc(TW("Under construction"))}</h3>
    <p>${esc(TW("A new hunting ground for Lv 100+. Three queens — and the Throne of Three."))}</p><p>${esc(TW("Opening soon — get ready!"))}</p>
    <button type="button" class="adc-ok">${esc(T("OK"))}</button></div>`;
  frozen = true; keys.clear();
  const close = () => { el.remove(); frozen = false; near = null; paintPrompt(); };
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest(".adc-ok")) close(); });
  document.body.appendChild(el); try { if (Snd.click) Snd.click(); } catch { /* no sound */ }
}
/// in front of the RAID QUEENS portal building on the far hunting ring, facing it (from the map; walk in to go through)
function rqPortalFront() {
  if (frozen || flying || introOn || mode !== "hub") return;
  const p = lands.portals.find((q) => q.userData.to === "rq"); if (!p) { rqGo(); return; }
  const v = p.position, d = Math.hypot(v.x, v.z) || 1, k = Math.max(5.5, (p.userData.radius || 0) + 3); closeAll(); if (landNow) landTick(true);
  standAt(v.x - (v.x / d) * k, v.z - (v.z / d) * k, { x: v.x, z: v.z });
  vfx.teleport(here(), { color: 0xff4d8d, color2: 0xffd36a }); if (Snd.dash) Snd.dash(); startSweep(1200); landTick(true); paintPrompt();
}
/// the portal on the far hunting ring, the map, the Menu: into the sky realm, at the foot of the Spireway facing the Citadel (walk up → rqWarp → the lobby)
/// RAID QUEENS' loading card (the owner, 2026-10-25): the three queens' cut-ins in turn over the Sky Realm's art, the steps
/// ticking (sky · citadel · queens · monsters), a tip card that turns; the files come in behind it (rqL.prepare) and their
/// shaders compile, so the hall doesn't stutter as it shows. Only until the realm is ready once this visit; at least 1.4 s
function rqLoadCard() {
  const el = document.createElement("div"); el.className = "rql"; el.setAttribute("role", "status"); el.setAttribute("data-no-i18n", "");
  const tall = innerHeight > innerWidth, t0 = performance.now(), mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const tips = [TW("The day's first win of each run pays ARCL ×1.5 and one more piece."), TW("Fill the gold guard bar under her HP to BREAK her: 4 seconds stunned."),
    TW("Each queen has her own trick — frost circles, a sweeping sunbeam, healing blood pools."), TW("A won run can drop a Crimson Celestial piece. Tap it in the set to wear it.")];
  el.innerHTML = `<div class="rql-bg" style="background-image:url('/images/raid/${tall ? "loading-tall" : "loading-wide"}.webp${VER}'),url('/images/raid/key.webp${VER}')"></div>
    <div class="rql-q">${["lysitha", "solvira", "nyxara"].map((id, i) => `<img src="/images/raid/${id}-full.webp${VER}" alt="" style="--i:${i}">`).join("")}</div>
    <div class="rql-in"><small>RAID QUEENS</small><h2>${esc(TW("Sky Realm"))}</h2><ol>${["Sky", "Citadel", "Queens", "Monsters"].map((k, i) => `<li data-k="${i}">${esc(TW(k))}</li>`).join("")}</ol>
    <i class="rql-bar"><b></b></i><p class="rql-tip">${esc(tips[0])}</p></div>`;
  document.body.appendChild(el);
  let ti = 0; const tipEl = el.querySelector(".rql-tip"), turn = setInterval(() => { ti = (ti + 1) % tips.length; tipEl.classList.remove("on"); void tipEl.offsetWidth; tipEl.textContent = tips[ti]; tipEl.classList.add("on"); }, 3000);
  fetch("/api/social?world=rq-top&mode=lysitha", { cache: "no-store" }).then((r) => r.ok && r.json()).then((j) => { const x0 = j && j.top && j.top[0]; if (x0) tips.push(TW("This week's fastest: {n} · {t}", { n: String(x0.name || x0.w || "").slice(0, 16), t: mmss(x0.t || 0) })); }).catch(() => {});
  const done = new Set(); // (0 sky · 1 citadel · 2 queens · 3 monsters; 4 = everything)
  const step = (k) => { if (k >= 4) [0, 1, 2, 3].forEach((i) => done.add(i)); else done.add(k); el.querySelectorAll("li").forEach((li) => li.classList.toggle("ok", done.has(Number(li.dataset.k)))); el.querySelector(".rql-bar b").style.width = `${(done.size / 4) * 100}%`; };
  const close = async () => { const wait = 1400 - (performance.now() - t0); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); clearInterval(turn); el.classList.add("out"); setTimeout(() => el.remove(), 450); };
  return { step, close };
}
/// the card, the realm made ready behind it, then the card goes (a realm already ready this visit: no card)
async function rqReady(r, card) { if (!card) return; card.step(0); await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 30))); /* (the card painted before the files and shaders take the page) */ try { await r.prepare((k) => card.step(k)); } catch { /* it shows and comes in as before */ } await card.close(); }
// walk within 30 m of its portal and the sky realm starts coming in quietly (not on low graphics or a saving / slow connection)
let rqPreT = 0, rqPre = false;
st.on((dt) => { if (rqPre || (rqPreT += dt) < 1) return; rqPreT = 0; if (!rqGate.visible || lowGfx || mode !== "hub" || !rqOn()) return;
  const c = navigator.connection; if (c && (c.saveData || /2g|3g/.test(c.effectiveType || ""))) return;
  const v = here(new THREE.Vector3()); if (Math.hypot(v.x - RQ_GATE.x, v.z - RQ_GATE.z) > 30) return; rqPre = true;
  ensureRq().then((r) => r && r.prepare(() => {}, { quiet: true })).catch(() => { rqPre = false; }); });
async function rqGo() {
  if (!rqOn()) { rqSoon(); return; } // (not open yet: the construction card)
  if (frozen || flying || introOn || mode !== "hub") return;
  const card = rqL && rqL.prepared() ? null : rqLoadCard();
  const r = await ensureRq(); if (!r) { if (card) card.close(); return; } await rqReady(r, card); if (frozen || mode !== "hub") return;
  closeAll(); r.loadHall(); const a = r.arrival(); standAt(a.x, a.z, a.c);
  vfx.teleport(here(), { color: 0xff4d8d, color2: 0xffd36a }); if (Snd.dash) Snd.dash(); pullFlash("#ff4d8d"); startSweep(1600);
  landTick(true); paintPrompt();
}
async function openRaidQueens() { await rqGo(); }
// AD-City 1 (world-adcity.js): NEXUS CITY, AGENT DIMENSION's land (LD.LANDS.ad), built the first time you go in
const CITY_TRY = /[?&]adcity=1/.test(location.search);
let adc = null, adcWait = null, cityOk = CITY_TRY; const camW = new THREE.Vector3();
function ensureCity() {
  if (adc) return Promise.resolve(adc);
  return adcWait || (adcWait = import("./world-adcity.js").then((M) => { adc = M.makeAdCity({ THREE, K, planet, T: TW, low: lowGfx, ver: VER, land: LD.LANDS.ad, demo: /[?&]adwork=demo/.test(location.search), me: () => { try { const s0 = agentDim && agentDim.state(); return s0 && s0.agent ? s0.agent.id : ""; } catch { return ""; } }, onModel: () => { if (labels) labels.dirty = true; try { farCull.rescan(); } catch { /* fine */ } } }); adc.M = M; st.on((dt, t) => { try { adc.tick(dt, t); if (landNow === "ad") adc.seeThrough(st.camera.getWorldPosition(camW), dt); } catch { /* a sign is drawing */ } }); if (labels) labels.dirty = true; try { farCull.rescan(); } catch { /* fine */ } return adc; })
    .catch((e) => { adcWait = null; console.warn("nexus city", e); if (!staleReload()) toast(TW("Couldn't open it — try again")); return null; }));
}
async function cityGo() {
  if (frozen || flying || introOn || mode !== "hub") return;
  const c = await ensureCity(); if (!c || frozen || mode !== "hub") return;
  closeAll(); const a = c.arrival(); standAt(a.x, a.z, a.c);
  let first = false; try { first = !localStorage.getItem("arc.adc.seen"); localStorage.setItem("arc.adc.seen", "1"); } catch { /* not kept */ }
  vfx.teleport(here(), { color: 0x5fd3ff, color2: 0xb48cff }); if (Snd.dash) Snd.dash(); pullFlash("#5fd3ff"); startSweep(first ? 3400 : 1400); // (the first time: a long look round the city)
  if (first && !reduce) setTimeout(() => { try { vfx.teleport(here(), { color: 0xb48cff, color2: 0x7cf5c8 }); } catch { /* fine */ } }, 600);
  landTick(true); paintPrompt();
  if (first) setTimeout(() => cityGuide(true), 3600);
}
/// AD-City 1.5: the city guide — every building and work station, a tap takes you to its door (first visit, the map, the core)
function cityGuide(first) {
  if (!adc || document.querySelector(".adc-card")) return; const M = adc.M;
  const el = document.createElement("div"); el.className = "adc-card adc-guide"; el.setAttribute("role", "dialog");
  const row = (id, name, sub, css, open) => `<button type="button" data-go="${id}" style="--ac:${css}"><i></i><b>${esc(TW(name))}</b><small>${esc(TW(sub))}${open === false ? " · " + esc(TW("Coming soon")) : ""}</small></button>`;
  el.innerHTML = `<div class="adc-in" style="--ac:#5fd3ff"><small>AGENT DIMENSION</small><h3>🌆 ${esc(TW(first ? "Welcome to Nexus City" : "Nexus City"))}</h3>${first ? `<p>${esc(TW("Six buildings for your agent, and the stations where agents work. Tap one to go to its door."))}</p>` : ""}
    <div class="adc-list">${M.BUILDINGS.map((b) => row(b.id, b.name, b.sub, b.css, !!b.open)).join("")}${Object.entries(M.STATIONS).map(([id, st0]) => row(id, st0.name, st0.job, st0.css)).join("")}</div>
    <button type="button" class="adc-ok">${esc(T("OK"))}</button></div>`;
  frozen = true; keys.clear();
  const close = () => { el.remove(); frozen = false; };
  el.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) { close(); cityTo(g.dataset.go); return; } if (e.target === el || e.target.closest(".adc-ok")) close(); });
  document.body.appendChild(el);
}
/// straight to a building's (or a station's) door in the city
async function cityTo(id) {
  if (landNow !== "ad") { await cityGo(); if (landNow !== "ad") return; }
  const p = adc && adc.spotOf(id); if (!p) return; standAt(p.x, p.z, p.c); vfx.teleport(here(), { color: 0x5fd3ff, color2: 0x7cf5c8 }); near = null; paintPrompt();
}
// AD-City 3: ARCIRCLE Studio Lite (world-studio.js), loaded the first time the Studio's door is used; the window keeps
// the town still behind it, and a run is its own scene (st.view / st.solo) like the Game Village's games
let studio = null, studioBusy = false;
let stuCardSeen = false;
// SB-1 (2026-10-26, the owner): Creator City and the Studio need a phone sideways — the gate (world-studio-pad.js makeGate)
// stands in front while it's upright: "Turn sideways" or "Back to Game World" (the Studio closes, Creator City sends you
// to the Studio's door by the fountain); leaving lets go of the lock and asks for the phone upright again
let stuGateM = null;
const stuGate = () => stuGateM || (stuGateM = SPAD.makeGate({ T: TW, esc, coarse, ver: VER, onBack: () => { try { if (studio && document.body.classList.contains("wp-stu-open")) studio.close(); } catch { /* closed */ } setTimeout(() => { frozen = false; if (landNow === "cc") landGo("town"); }, 60); } }));
const stuLand = { landscape: () => stuGate().landscape(), enter() { stuGate().on("studio", true); }, exit() { stuGate().on("studio", false); } };
async function openStudio(tab) {
  if (studioBusy || frozen || mode !== "hub") return; studioBusy = true;
  // (STU-L: a phone held upright is asked to turn sideways — it never turns by itself; STU-6b: the Studio's loading card the
  // first time it opens, like the games')
  try { stuLand.enter(); } catch { /* not on this browser */ }
  let card = null;
  try {
    if (!studio) { card = stuCardSeen ? null : gameCard("studio"); stuCardSeen = true; if (card) await paintFrame();
      let M; try { M = await import("./world-studio.js"); } catch (e) { if (card) card.close(true); if (staleReload()) return; throw e; } if (card) card.step(0);
      studio = M.createStudio({ THREE, K, st, T: TW, esc, toast, Snd, reduce, ver: VER, webLink: true, tx: (to, data) => walletTx(to, data), isGM: () => !!(agentDim && agentDim.state() && agentDim.state().gm), guide: (k) => openAdGuide(k), low: lowGfx, saver: S.quality === "saver", coarse, myName: () => P.name || "", rings: () => ensureRings(), sess, post, signIn: () => signIn(),
        makeHero: () => K.makeCharacter(heroOf(P.char || "custom-aron"), VER).then((c) => { if (c && c.setTint) c.setTint(P.tint || 0); return c; }),
        myChar: () => P.char || "custom-aron", makeHeroOf: (id) => K.makeCharacter(heroOf(id), VER), /* (WS4: the other racers in a live race) */
        agentName: () => { try { const s0 = agentDim && agentDim.state(); return s0 && s0.agent ? s0.agent.name : ""; } catch { return ""; } },
        share: (c) => bragCard(c),
        land: stuLand, onEvent: (k) => { ccStep(k); if (k === "rate") ccStep("play"); if (k === "publish") { ccGamesAt = 0; setTimeout(() => { try { ccGames(); } catch { /* the next look */ } }, 2500); } } /* STB4: a published game shows on Creator City's portals without waiting two minutes */, soundOn: () => S.sound !== false,
        survivors: async (cfg) => { try { await survModule(); return await survGame.custom(cfg); } catch (e) { console.warn("studio survival", e); if (String((e && e.message) || e).startsWith("load:") && staleReload()) return null; return null; } }, // (SB-3: MONSTER SURVIVAL on the arena's engine)
        onOpen: () => { frozen = true; keys.clear(); near = null; paintPrompt(); document.body.classList.add("wp-stu-open"); }, onClose: () => { frozen = false; near = null; paintPrompt(); document.body.classList.remove("wp-stu-open"); if (st.idle) st.idle(false); } });
      if (card) { card.step(1); await Promise.all(["/images/studio/ui/bg-1344.webp", "/images/studio/tpl/runner-400.webp", "/images/studio/ui/tab-make.webp"].map((u) => new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = u + VER; }))); } }
    closeAll(); studio.open(tab); if (card) { card.step(2); card.close(); }
  } catch (e) { console.warn("studio", e); if (card) card.close(true); frozen = false; stuLand.exit(); toast(TW("Couldn't open it — try again")); }
  finally { studioBusy = false; }
}
// ---------------- Studio Beta: CREATOR CITY (world-creatorcity.js, LD.LANDS.cc), through the Studio by the fountain ----------------
let ccL = null, ccWait = null, ccGamesAt = 0, ccCardSeen = false, ccTop = [];
const CC_THC = { neon: "#5fd3ff", jungle: "#39ff88", ice: "#9fe9ff", lava: "#ff6a3d", candy: "#ff6fae" };
function ensureCC() {
  if (ccL) return Promise.resolve(ccL);
  return ccWait || (ccWait = import("./world-creatorcity.js").then((M) => { ccL = M.makeCreatorCity({ THREE, K, planet, T: TW, low: lowGfx, ver: VER, land: LD.LANDS.cc, esc }); ccL.M = M;
    st.on((dt, t) => { try { ccL.tick(dt, t, landNow === "cc" ? here() : null); if (landNow === "cc") ccGames(); } catch { /* fine */ } }); return ccL; })
    .catch((e) => { ccWait = null; console.warn("creator city", e); if (!staleReload()) toast(TW("Couldn't open it — try again")); return null; }));
}
async function ccGames() {
  if (Date.now() - ccGamesAt < 120e3 || !ccL) return; ccGamesAt = Date.now();
  try { const r = await fetch("/api/social?world=studio-arcade"); if (!r.ok) return; const j = await r.json();
    ccTop = (j.games || []).filter((x) => x && x.id).map((x) => ({ ...x, css: CC_THC[x.theme] || "#7cf5c8" })).sort((a, b) => (b.plays || 0) + (b.likes || 0) * 3 - (a.plays || 0) - (a.likes || 0) * 3); ccL.setGames(ccTop); } catch { /* the portals keep what they had */ }
}
// IDEA4 (2026-10-27, place HUD presets): Creator City has no monsters, so its fight buttons (the combat bar) give way
// to the maker's four — the Studio's Create / My games / the Creator Arcade, and the Hall of Fame (shown by CSS, body.wp-in-cc)
const CC_BAR = [["make", "/images/studio/ui/tab-make.webp", "Create"], ["mine", "/images/studio/ui/tab-mine.webp", "My games"], ["arcade", "/images/studio/ui/tab-arcade.webp", "Arcade"], ["hall", "/images/cc/ui/ic-trophy.webp", "Hall of Fame"]];
let ccBarEl = null;
function ccBar() {
  if (ccBarEl) return; ccBarEl = document.createElement("div"); ccBarEl.id = "wp-ccbar"; ccBarEl.className = "wp-ccbar";
  ccBarEl.innerHTML = CC_BAR.map(([k, ic, l]) => `<button type="button" data-cc="${k}"><img src="${ic}${VER}" alt="" width="44" height="44" decoding="async"><span>${esc(TW(l))}</span></button>`).join("");
  ccBarEl.addEventListener("click", (e) => { const b = e.target.closest("[data-cc]"); if (!b || mode !== "hub" || frozen || landNow !== "cc") return; try { if (Snd.click) Snd.click(); } catch { /* no sound */ } const k = b.dataset.cc; if (k === "hall") ccBuilding("hall"); else openStudio(k); });
  document.body.appendChild(ccBarEl);
}
async function ccGo() {
  if (frozen || flying || introOn || mode !== "hub") return;
  const card = ccCardSeen ? null : gameCard("cc"); ccCardSeen = true; if (card) await paintFrame();
  const c = await ensureCC(); if (!c || frozen || mode !== "hub") { if (card) card.close(true); return; } if (card) card.step(0);
  ccBar(); closeAll(); const a = c.arrival(); standAt(a.x, a.z, a.c); landTick(true); if (card) { card.step(1); await sleep(500); card.step(2); card.close(); }
  let first = false; try { first = !localStorage.getItem("arc.cc.seen"); localStorage.setItem("arc.cc.seen", "1"); } catch { /* not kept */ }
  vfx.teleport(here(), { color: 0x7cf5c8, color2: 0x5fd3ff }); if (Snd.dash) Snd.dash(); pullFlash("#7cf5c8"); startSweep(first ? 3000 : 1400); paintPrompt();
  ccGamesAt = 0; ccGames(); if (first) setTimeout(() => ccAcademy(true), 3300);
}
// the map's Creator City: the gate (from the town, through its portal), or a building (in front of its door)
async function ccTo(id) {
  if (landNow !== "cc") { await ccGo(); if (landNow !== "cc") return; if (id === "go") return; await sleep(400); }
  const f = ccL && ccL.FAC.find((x) => x.id === id), L = LD.LANDS.cc; if (!f) return;
  const rad = (f.a * Math.PI) / 180, r = f.r ? Math.max(8, f.r - f.fp / 2 - 6) : f.fp / 2 + 7;
  standAt(L.x + Math.sin(rad) * r, L.z + Math.cos(rad) * r, { x: L.x + Math.sin(rad) * f.r, z: L.z + Math.cos(rad) * f.r }); vfx.teleport(here(), { color: f.col, color2: 0x7cf5c8 }); paintPrompt();
}
const ccPrompt = (id, b) => { if (/^gp\d$/.test(id)) { const gm = ccL && ccL.portalGame(Number(id.slice(2))); return gm ? TW("Play {x}", { x: b(gm.title) }) + `<small class="adc-sub">${esc(TW("by {name}", { name: gm.byName || "—" }))} · ▶ ${gm.plays || 0} · ♥ ${gm.likes || 0}</small>` : ""; }
  const f = ccL && ccL.FAC.find((x) => x.id === id); return f ? T("Enter {x}", { x: b(TW(f.name)) }) + `<small class="adc-sub">${esc(TW(f.sub))}</small>` : ""; };
// the 10-minute first game (the Academy): five steps counted from what you do in the Studio; all five → "I MADE MY FIRST GAME!"
const CC_STEPS = [["tpl", "Pick a template"], ["tune", "Tune it — how hard, how long"], ["test", "Test play it"], ["publish", "Publish it to the arcade"], ["share", "Send the link to a friend"]];
const ccDone = () => { try { return JSON.parse(localStorage.getItem("arc.cc.steps") || "{}"); } catch { return {}; } };
// the creator tutorial (2026-10-26, the owner: "a quest a new player follows to make a game"): Creator City's quest card,
// the gold arrow and the foot chevrons lead to the next place, and in the Studio the button to press glows (ccCoach);
// each step pays a little XP, all seven the title Rookie Creator (quests ACH "cctut"); the same steps as the Academy's
const CC_TUT = [["visit", "Meet the mentor at the Academy", "academy", 40], ["tpl", "Enter the Studio Tower and pick a template", "tower", 40], ["tune", "Tune it — how hard, how long", "tower", 40], ["test", "Test play it", "tower", 60], ["publish", "Publish it to the arcade", "tower", 80], ["share", "Copy your game's link to share it", "tower", 40], ["play", "Play someone's game at a game portal", "gp", 60]];
const CC_TUT_XP = 300;
const ccTutDone = () => !!ccDone().tut;
const ccTutNow = () => { const d = ccDone(); return CC_TUT.find(([k]) => !d[k]) || null; };
function ccTutTarget(where) {
  if (!ccL || !where) return null;
  if (where === "gp") { for (let i = 0; i < 6; i++) if (ccL.portalGame(i)) return ccL.door("gp" + i); return ccL.door("arcade"); }
  return ccL.door(where);
}
function paintCcTut() {
  const d = ccDone(), n = CC_TUT.filter(([k]) => d[k]).length, open = CC_TUT.filter(([k]) => !d[k]);
  $("wp-quests-n").textContent = `${n}/${CC_TUT.length}`; $("wp-qmini-n").textContent = `${n}/${CC_TUT.length}`;
  $("wp-quests-l").innerHTML = open.slice(0, 3).map(([k, t, , xp], i) => `<li${i === 0 ? ` class="cur" role="button" tabindex="0" data-q="cc-${k}"` : ""}><i></i><span>🎓 ${esc(TW(t))}</span>${i === 0 ? '<em class="wp-qdist" data-no-i18n></em>' : ""}<small>+${xp} XP</small></li>`).join("");
  markLongQuest();
  const cur = open[0], st0 = studioShown(), tg = cur && !st0 ? ccTutTarget(cur[2]) : null;
  if (tg !== questTarget) { if (beacon.parent) beacon.parent.remove(beacon); questTarget = tg; if (tg) tg.add(beacon); }
}
const studioShown = () => !!document.querySelector(".wst:not([hidden])");
// in the Studio: the button the tutorial's step wants glows, with a line beside it (looked up twice a second while it's open)
const CC_COACH = { tpl: ['.wst [data-tpl="jump"]', ".wst [data-tpl]"], tune: [".wst [data-next]"], test: [".wst [data-test]"], publish: [".wst [data-pub]", ".wst [data-save]"], share: [".wst [data-share]"] };
let coachEl = null, coachTip = null;
function ccCoach() {
  const cur = landNow === "cc" && !ccTutDone() && studioShown() && !document.querySelector(".wsb:not([hidden]), .wst-run") ? ccTutNow() : null;
  let el = null; if (cur && CC_COACH[cur[0]]) for (const q of CC_COACH[cur[0]]) { el = [...document.querySelectorAll(q)].find((e) => e.offsetParent); if (el) break; }
  if (el !== coachEl) { if (coachEl) coachEl.classList.remove("wp-coach"); coachEl = el; if (el) { el.classList.add("wp-coach"); try { let sc = el.parentElement; while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement; if (sc) { const a = el.getBoundingClientRect(), b0 = sc.getBoundingClientRect(); if (a.bottom > b0.bottom || a.top < b0.top) { const zk = b0.height / (sc.clientHeight || b0.height) || 1; sc.scrollTop += (a.top - b0.top - (b0.height - a.height) / 2) / zk; } } } catch { /* fine */ } /* (only the scrolling list itself: scrollIntoView moved the whole window sideways) */ } }
  if (!el) { if (coachTip) coachTip.hidden = true; return; }
  if (!coachTip) { coachTip = document.createElement("div"); coachTip.className = "wp-coach-tip"; coachTip.setAttribute("role", "status"); document.body.appendChild(coachTip); }
  const r = el.getBoundingClientRect(), z = parseFloat(getComputedStyle(coachTip).zoom) || 1, txt = "👆 " + TW(cur[1]);
  if (coachTip.textContent !== txt) coachTip.textContent = txt;
  const below = r.bottom + 60 < innerHeight; coachTip.hidden = false; coachTip.classList.toggle("up", !below);
  const tw = (coachTip.offsetWidth || 220) * z; coachTip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) / z + "px"; coachTip.style.top = Math.max(8, Math.min(innerHeight - 60, below ? r.bottom + 10 : r.top - 46)) / z + "px";
}
every(500, () => { try { ccCoach(); } catch { /* next time */ } });
function ccStep(k) {
  if (!CC_STEPS.some(([x]) => x === k) && !CC_TUT.some(([x]) => x === k)) return; const d = ccDone(); if (d[k]) return; d[k] = Date.now(); try { localStorage.setItem("arc.cc.steps", JSON.stringify(d)); } catch { /* not kept */ }
  const tu = CC_TUT.find(([x]) => x === k);
  if (tu && !d.tut) { const n2 = CC_TUT.filter(([x]) => d[x]).length; gain(tu[3], TW("Creator tutorial")); try { if (Snd.coin) Snd.coin(); } catch { /* no sound */ }
    if (n2 === CC_TUT.length) { d.tut = Date.now(); try { localStorage.setItem("arc.cc.steps", JSON.stringify(d)); } catch { /* not kept */ } setTimeout(ccTutFinish, d.all ? 900 : 4800); }
    setTimeout(() => { try { paintQuests(); } catch { /* fine */ } }, 50); }
  if (!CC_STEPS.some(([x]) => x === k)) return;
  const n = CC_STEPS.filter(([x]) => d[x]).length; toast(`🎓 ${esc(TW("Creator Academy"))} · ${n}/${CC_STEPS.length} — ${esc(TW(CC_STEPS.find(([x]) => x === k)[1]))} ✓`);
  if (n === CC_STEPS.length && !d.all) { d.all = Date.now(); try { localStorage.setItem("arc.cc.steps", JSON.stringify(d)); } catch { /* not kept */ } setTimeout(ccFirstGame, 900); }
}
function ccTutFinish() {
  gain(CC_TUT_XP, TW("Creator tutorial")); try { if (quests) quests.bump("cctut"); } catch { /* the title waits */ }
  const el = document.createElement("div"); el.className = "cc-cut"; el.innerHTML = `<div><small>🎓 ${esc(TW("Creator tutorial"))}</small><b>${esc(TW("TUTORIAL COMPLETE!"))}</b><span>${esc(TW("You're a Rookie Creator — the title is yours in Character → Titles."))} +${CC_TUT_XP} XP</span></div>`;
  document.body.appendChild(el); try { if (Snd.levelUp) Snd.levelUp(); } catch { /* no sound */ } try { vfx.teleport(here(), { color: 0x7cf5c8, color2: 0xffd23a }); } catch { /* fine */ }
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 600); }, 4200); try { paintQuests(); } catch { /* fine */ }
}
function ccFirstGame() {
  const el = document.createElement("div"); el.className = "cc-cut"; el.innerHTML = `<div><small>ARCIRCLE STUDIO BETA</small><b>${esc(TW("I MADE MY FIRST GAME!"))}</b><span>${esc(TW("Your game is on the Creator Arcade — every play and like counts."))}</span></div>`;
  document.body.appendChild(el); try { if (Snd.levelUp) Snd.levelUp(); } catch { /* no sound */ } try { vfx.teleport(here(), { color: 0xffd23a, color2: 0x7cf5c8 }); } catch { /* fine */ }
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 600); }, 3600);
}
const CC_LV = [0, 100, 300, 700, 1500, 3000, 6000, 10000], CC_LVT = ["Newcomer", "Maker", "Builder", "Designer", "Game Designer", "Creator Star", "Arcade Legend", "Studio Master"];
function ccLevel() { const c = studio && studio.creator ? studio.creator() : { games: 0, pub: 0, plays: 0, likes: 0 }, xp = c.pub * 100 + c.games * 30 + c.plays * 5 + c.likes * 20; let lv = 0; CC_LV.forEach((x, i) => { if (xp >= x) lv = i; }); return { ...c, xp, lv, next: CC_LV[lv + 1] || null, from: CC_LV[lv] }; }
function ccWin(html, cls = "") {
  if (document.querySelector(".ccw")) return null; frozen = true; keys.clear();
  const el = document.createElement("div"); el.className = "ccw " + cls; el.setAttribute("role", "dialog"); el.innerHTML = `<div class="ccw-in"><button type="button" class="ccw-x" aria-label="${esc(TW("Close"))}">×</button>${html}</div>`;
  const close = () => { el.remove(); frozen = false; near = null; paintPrompt(); };
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest(".ccw-x")) close(); }); document.body.appendChild(el); return { el, close };
}
// CCR (2026-10-26): each building's window opens on Meshy's art for it and its 3D icon (images/cc/ui hdr-* / ic-*)
const ccHead = (hdr, ic, name) => `<div class="ccw-hero" style="background-image:url('/images/cc/ui/hdr-${hdr}.webp')" aria-hidden="true"></div><small class="ccw-k"><img src="/images/cc/ui/ic-${ic}.webp" alt="" width="22" height="22"> ${esc(TW(name))}</small>`;
// SB-4: the creator quests (the Academy, after the first game): counted from your games' own numbers, never paid
const CC_QUESTS = [["Publish your first game", (c) => c.pub, 1], ["Make 3 games", (c) => c.games, 3], ["10 plays by other players", (c) => c.plays, 10], ["10 likes on your games", (c) => c.likes, 10], ["Publish 5 games", (c) => c.pub, 5], ["100 plays by other players", (c) => c.plays, 100]];
function ccAcademy(first) {
  ccStep("visit"); const d = ccDone(), n = CC_STEPS.filter(([x]) => d[x]).length, L = ccLevel();
  const w = ccWin(`<div class="ccw-hero" style="background-image:url('/images/ui/kit/hdr-tutorial.webp')" aria-hidden="true"></div><small class="ccw-k"><img src="/images/ui/kit/ic-tutorial-cap.webp" alt="" width="20" height="20"> ${esc(TW("Creator Academy"))}</small><h3>${esc(TW(first ? "Welcome to Creator City!" : "Your first game in 10 minutes"))}</h3><p>${esc(TW("Five steps, no code. Each one ticks itself off as you do it in the Studio."))}</p>
    <ol class="ccw-steps">${CC_STEPS.map(([k, l], i) => `<li class="${d[k] ? "ok" : ""}"><i>${d[k] ? "✓" : i + 1}</i><span>${esc(TW(l))}</span></li>`).join("")}</ol>
    <div class="ccw-bar"><b style="width:${(n / CC_STEPS.length) * 100}%"></b></div><p class="ccw-fine">${d.all ? "🏅 " + esc(TW("I MADE MY FIRST GAME!")) : `${n} / ${CC_STEPS.length}`}${sess() ? "" : " · " + esc(TW("Sign in to publish — your drafts are kept on this device until then."))}</p>
    <div class="ccw-acts"><button type="button" class="ccw-go" data-make>🛠️ ${esc(TW(n ? "Continue in the Studio" : "Start my first game"))}</button>${first ? `<button type="button" class="ccw-alt" data-x>${esc(TW("Look around first"))}</button>` : ""}</div>
    ${first ? "" : `<h4>🎯 ${esc(TW("Creator quests"))}</h4><ul class="ccw-q">${CC_QUESTS.map(([t, f, n2]) => { const v = Math.min(n2, f(L) || 0); return `<li class="${v >= n2 ? "ok" : ""}"><span>${v >= n2 ? "✓ " : ""}${esc(TW(t))}</span><i><b style="width:${(v / n2) * 100}%"></b></i><em>${v}/${n2}</em></li>`; }).join("")}</ul>`}
    <p class="ccw-lv">⭐ ${esc(TW("Creator level"))} ${L.lv + 1} · ${esc(TW(CC_LVT[L.lv]))}</p>`, "ccw-ac");
  if (!w) return; w.el.querySelector("[data-make]").addEventListener("click", () => { w.close(); openStudio("make"); }); const x = w.el.querySelector("[data-x]"); if (x) x.addEventListener("click", () => w.close());
}
async function ccHall() {
  ccGamesAt = 0; await ccGames(); const by = new Map(); for (const g of ccTop) { if (g.off || !g.byName) continue; const c = by.get(g.byName) || { name: g.byName, games: 0, plays: 0, likes: 0 }; c.games++; c.plays += g.plays || 0; c.likes += g.likes || 0; by.set(g.byName, c); }
  const cr = [...by.values()].sort((a, b) => b.plays + b.likes * 5 - a.plays - a.likes * 5).slice(0, 10), gs = ccTop.slice(0, 5);
  const row = (i, a, b2) => `<li class="r${i}"><i>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</i><b>${esc(a)}</b><em>${b2}</em></li>`;
  ccWin(`${ccHead("hall", "trophy", "Hall of Fame")}<h3>${esc(TW("The top creators"))}</h3>${cr.length ? `<ol class="ccw-rank">${cr.map((c, i) => row(i, c.name, `▶ ${c.plays} · ♥ ${c.likes} · 🎮 ${c.games}`)).join("")}</ol>` : `<p>${esc(TW("No creator here yet — publish a game and your name goes up first."))}</p>`}
    ${gs.length ? `<h4>${esc(TW("The most played games"))}</h4><ol class="ccw-rank">${gs.map((g, i) => row(i, g.title, `${esc(g.byName || "")} · ▶ ${g.plays || 0}`)).join("")}</ol>` : ""}`, "ccw-hall");
}
function ccFactory() {
  const L = ccLevel(), pct = L.next ? Math.min(100, ((L.xp - L.from) / (L.next - L.from)) * 100) : 100;
  ccWin(`${ccHead("factory", "factory", "Asset Factory")}<h3>${esc(TW("Creator level"))} ${L.lv + 1} · ${esc(TW(CC_LVT[L.lv]))}</h3>
    <div class="ccw-bar"><b style="width:${pct}%"></b></div><p class="ccw-fine">${L.xp} XP${L.next ? ` / ${L.next}` : ""} · ${esc(TW("Published games, plays and likes raise it"))}</p>
    <ul class="ccw-lvls">${CC_LVT.map((t, i) => `<li class="${i <= L.lv ? "ok" : ""}"><i>${i + 1}</i><b>${esc(TW(t))}</b><em>${CC_LV[i]} XP</em></li>`).join("")}</ul>
    <p class="ccw-fine">${L.signed ? `🎮 ${L.games} · 🚀 ${L.pub} · ▶ ${L.plays} · ♥ ${L.likes}` : esc(TW("Sign in to count your games."))} · ${esc(TW("New parts and themes arrive here as the beta grows."))}</p>`, "ccw-fac");
}
async function ccBuilding(id) {
  if (/^gp\d$/.test(id)) { const gm = ccL && ccL.portalGame(Number(id.slice(2))); if (!gm) return; await openStudio(); if (studio) { studio.playId(gm.id); ccStep("play"); } return; }
  if (id === "tower") return openStudio("make");
  if (id === "arcade" || id === "contest") return openStudio("arcade");
  if (id === "market") return openMarket("market");
  if (id === "academy") return ccAcademy();
  if (id === "hall") return ccHall();
  if (id === "factory") { if (studio && studio.load && sess()) try { await studio.load(); } catch { /* the counts as they are */ } return ccFactory(); }
  if (id === "launch") ccWin(`${ccHead("launch", "rocket", "Launch Portal")}<h3>${esc(TW("Coming soon"))}</h3><p>${esc(TW("When your game has players, you'll be able to launch it from here — with ArcPad, if you choose. Making and publishing games stays free."))}</p>`);
}
/// a Nexus City building: the three that are open lead into the agent window's tabs; the rest show what they'll be
async function cityBuilding(id) {
  // (the owner's call 2026-10-24: AGENT DIMENSION is open to all, ARCIRCLE Studio stays the GMs' for now — others see what it'll be)
  if ((id === "studio" || /^(pick|cab\d)$/.test(id)) && !STUDIO_OPEN && !(agentDim && agentDim.state() && agentDim.state().gm) && !CITY_TRY) { if (!adc || document.querySelector(".adc-card")) return; frozen = true; keys.clear(); if (!adc.M.soonCard({ T: TW, esc }, "studio", () => { frozen = false; })) frozen = false; return; }
  if (id === "studio") { if (stuHub.doors.length && landNow !== "ad") { ccGo(); return; } openStudio(); return; } // (Studio Beta: the Studio by the fountain is Creator City's portal)
  if (id === "arena") { openArena(); return; }
  if (/^(pick|cab\d)$/.test(id)) { const pk = stuHub.pick(id); await openStudio(); if (pk && studio) studio.playId(pk.id); return; }
  if (id === "genesis" || id === "port" || id === "vault") { const a = await loadAgent(); if (!a) { toast(TW("Couldn't open your agent — try again")); return; } closeAll(); a.open(id === "port" ? "jobs" : id === "vault" ? "vault" : undefined); return; }
  if (!adc || document.querySelector(".adc-card")) return; frozen = true; keys.clear();
  try { if (Snd.click) Snd.click(); } catch { /* no sound */ }
  if (!adc.M.soonCard({ T: TW, esc }, id, () => { frozen = false; })) frozen = false;
}
// AD-City 4: the Agent Arena's quiz duels (world-agarena.js), loaded the first time its door is used
let agArena = null, agArenaBusy = false;
async function openArena() {
  if (agArenaBusy || frozen || mode !== "hub") return; agArenaBusy = true;
  try {
    if (!agArena) { let M; try { M = await import("./world-agarena.js"); } catch (e) { if (staleReload()) return; throw e; }
      agArena = M.createAgArena({ T: TW, esc, toast, sess, post, signIn: () => signIn(), Snd, reduce,
        agent: () => { try { const s0 = agentDim && agentDim.state(); return s0 && s0.agent ? { name: s0.agent.name, kind: s0.agent.kind } : null; } catch { return null; } },
        share: (c) => bragCard(c),
        onOpen: () => { frozen = true; keys.clear(); near = null; paintPrompt(); document.body.classList.add("wp-stu-open"); }, onClose: () => { frozen = false; near = null; paintPrompt(); document.body.classList.remove("wp-stu-open"); if (st.idle) st.idle(false); } }); }
    if (!agentDim) await loadAgent().catch(() => null);
    closeAll(); agArena.open();
  } catch (e) { console.warn("agent arena", e); frozen = false; toast(TW("Couldn't open it — try again")); }
  finally { agArenaBusy = false; }
}
// AGENT DIMENSION's opening (the owner's call 2026-10-24): for a week, a signed-in player without an agent sees the owner's
// launch art once a day, when they sign in or come back signed in; its button takes them to the Citadel (the AD Tower)
// and opens the Genesis Lab to buy one
const STUDIO_OPEN = true; /* ARCIRCLE Studio for everyone (the owner, 2026-10-24); the server's STUDIO.OPEN says the same */
/// to the Citadel's door (the AD Tower) with a flash of light, then the agent window (the Genesis Lab when there's none yet)
function goAgentTower() {
  const g = agentGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - (g.x / d) * 16, g.z - (g.z / d) * 16, { x: g.x, z: g.z });
  try { vfx.teleport(here(), { color: 0x5fd3ff, color2: 0xb48cff }); } catch { /* no flash */ } near = null; paintPrompt(); setTimeout(() => openAgent(), 900);
}
every(300, () => { if (!adpDone && adpReady()) adPromo(); if (adpGo && adpReady()) { adpGo = false; goAgentTower(); } }); /* (the card when you step into the town, not over the loading screen: the owner, 2026-10-24) */
/// every boss in the world for the window's Boss pane: live or when next, the way there (2026-10-24, the owner's mock-ups)
function bossList() {
  const now = Date.now(), d = new Date(now), day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), at = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fly = (z) => { const a = Math.atan2(-z.x, -z.z); flyTo({ position: new THREE.Vector3(z.x + Math.sin(a) * (z.r + 3), 0, z.z + Math.cos(a) * (z.r + 3)), userData: { radius: 0.5 } }); };
  const out = [];
  { let t = 0, live = false; for (const h of [3, 11]) { let s0 = day0 + h * 3600e3; if (s0 + 30 * 60e3 < now) s0 += 864e5; if (!t || s0 < t) { t = s0; live = s0 <= now; } }
    out.push({ ic: "🦖", color: "#ff7a4a", name: TW("Jurassic boss hour"), where: TW("Jurassic World"), lv: TW("Everyone"), line: TW("The Alpha Raptor and the Thornback Titan, shared HP: hit it 10 times for a hunter's share."), when: live ? TW("On now") : `${at(t)} · ${evLeft(t)}`, rew: TW("XP, materials, ARCL for a boss share"), live, go: () => openJurassic() }); }
  let pk = false; try { pk = !!pumpKings; } catch { /* not built */ }
  if (pk) { const eh = etHour(now), live = eh >= 20 || eh < 5; out.push({ ic: "🎃", color: "#ff9a2e", name: TW("Inferno Jack"), where: TW("Town"), lv: "Lv 15 · 35 · 55 · 75 · 95", line: TW("Five Pumpkin Kings turn into Inferno Jack at night. The top 3 hitters share the reward."), when: live ? TW("On now") : evLeft(now + (20 - eh) * 3600e3), rew: TW("ARCL and a + piece; Lv 95: Jack's Inferno Blade"), live,
    go: () => import("./world-pumpking-data.js").then((m) => { const lv = level(), ks = m.PK.KINGS.filter((x) => x.lv <= lv + 10), kg = ks[ks.length - 1] || m.PK.KINGS[0], h = m.HOMES[kg.id]; standAt(h[0] + 4, h[1] + 4, { x: h[0], z: h[1] }); }).catch(() => openMap()) }); }
  { const nx = (() => { const t = new Date(now + 9 * 3600e3), dd = (8 - t.getUTCDay()) % 7 || 7; return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + dd) - 9 * 3600e3; })();
    out.push({ ic: "🐙", color: "#39ff88", name: TW(SOC.RAID.boss.name), where: TW(SOC.RAID.name), lv: `Lv ${SOC.RAID.lv[0]}+`, line: TW("The weekly raid boss: everyone in town brings it down together."), when: TW("Resets in {t}", { t: evLeft(nx).replace(/^in /, "") }), rew: TW("Raid gear, XP, the Raid Breaker title"), live: false, go: () => fly(SOC.RAID) }); }
  if (rqOn()) { // RAID QUEENS: a run of your own, 3 a Seoul day (world-raidq.js)
    for (const [q, reg, ic, col] of [["lysitha", "silver", "🤍", "#9fd4ff"], ["solvira", "golden", "☀️", "#ffd36a"], ["nyxara", "crimson", "🩸", "#ff4d6d"], ["throne", "throne", "👑", "#ff7ab8"]]) { const Q = { lysitha: ["CELESTIAL LYSITHA", 100, "Silver Sanctum"], solvira: ["RADIANT SOLVIRA", 200, "Golden Dominion"], nyxara: ["CRIMSON NYXARA", 300, "Crimson Abyss"], throne: ["THRONE OF THREE", 400, "Throne of Three"] }[q];
      out.push({ ic, color: col, name: TW(Q[0]), where: "RAID QUEENS · " + TW(Q[2]), lv: `Lv ${Q[1]}+`, line: TW("A run of your own: clear the waves, then bring the queen down. 3 runs a day."), when: TW("{n} runs a day", { n: 3 }), live: true, go: () => rqGo() }); } }
  const bk = ((rpg && rpg.data().x) || {}).bk || {};
  for (const z of ZN.ZONES) if (z.boss) out.push({ ic: "👑", color: "#" + (z.color || 0x5fd3ff).toString(16).padStart(6, "0"), name: TW(z.boss.name), where: TW(z.name), lv: `Lv ${z.lv[0]}–${z.lv[1]}`, line: TW(z.boss.line || "A hunting ground's boss."), when: TW("Any time"), rew: TW("Gear, XP"), mine: bk[z.id] || 0, live: false, go: () => fly(z) });
  return out;
}
/// what the Character / Forge / Adventure window asks the town for (world-rpg.js hub): places to go, numbers to show
function hubAct(k) {
  if (k === "form") { const f = K.HERO_FORMS && K.HERO_FORMS[heroOf(P.char || "") + "x"]; let n = 0; try { n = mythicWorn().length; } catch { /* not loaded */ } return { has: !!f, ok: formOk(), on: !!P.form, lv: FORM_LV, pieces: FORM_PIECES, n }; }
  if (k === "form:on" || k === "form:off") { if (k === "form:on" && !formOk()) return false; P.form = k === "form:on"; save(); setAvatar(P.char); return true; }
  if (k === "paints") { const items = (ownNow && ownNow.items) || []; return Object.keys(K.PAINTS || {}).filter((id) => id.startsWith("paint-")).map((id) => ({ id, own: items.includes(id), on: P.style.paint === id })); }
  if (k.startsWith("paint:")) { const id = k.slice(6), items = (ownNow && ownNow.items) || []; if (id && !items.includes(id)) return false; P.style.paint = id && P.style.paint !== id ? id : ""; save(); return true; }
  if (k.startsWith("skill:")) { if (combat && combat.setSlot) { combat.setSlot(k.slice(6)); return true; } return false; } // (the slot button and the save follow)
  if (k === "arc") return bal.arc;
  if (k === "bosses") return bossList();
  if (k.startsWith("bossgo:")) { const b = bossList()[+k.slice(7)]; if (b && b.go) b.go(); return true; }
  if (k === "today") { const c = itemCodex && itemCodex.state ? itemCodex.state() : null; let chest = false; try { chest = !!arclShop.dailyDone(); } catch { /* not built yet */ } return { pend: quests && quests.pending ? quests.pending() : 0, chest, codex: c && c.data ? `${c.data.n} / ${c.data.all}` : "" }; }
  if (k === "daily") { rpg.hide(); return arclShop.openDaily(); }
  if (k === "shop") { rpg.hide(); return arclShop.openShop(); }
  if (k === "friendsList") { try { if (!sess()) return null; const f = chatUI && chatUI.friendsList ? chatUI.friendsList() : null; if (f == null && chatUI && chatUI.loadFriends) chatUI.loadFriends().then(() => rpg.repaint()); return f || []; } catch { return null; } }
  if (k === "here") { try { return ghosts ? ghosts.named().filter((g) => g.name).sort((a, b) => (b.lv || 0) - (a.lv || 0)) : []; } catch { return []; } }
  if (k === "lines") { try { return chatUI && chatUI.lines ? chatUI.lines() : []; } catch { return []; } }
  if (k === "top") { const d = quests && quests.dir ? quests.dir() : null; if (!d && quests && quests.loadDir && !topAsk) { topAsk = true; quests.loadDir().then(() => rpg.repaint()).catch(() => {}); } return ((d && d.list) || []).slice().sort((a, b) => (b.lv || 0) - (a.lv || 0)).slice(0, 5).map((r) => ({ n: r.n || r.name, lv: r.lv })); }
  if (k.startsWith("invite:")) { try { const p = partyUI(); if (p && p.invite) p.invite(k.slice(7)); else toast(TW("Sign in with a wallet to make a party.")); } catch { toast(TW("Couldn't open it — try again")); } return true; }
  if (k === "streak") { try { return sess() ? arclShop.streak() : null; } catch { return null; } }
  if (k === "name") return P.name || "";
  if (k === "hero") { const h = String(heroOf(P.char || "")).replace("custom-", ""); return /^(aron|lumi|nex)$/.test(h) ? h : "aron"; }
  if (k === "xp") { const x = RPG.xpProgress(P.xp || 0); return x.need ? { a: x.into, b: x.need, k: Math.max(0, Math.min(1, x.into / x.need)) } : null; }
  if (k === "events") return plazaEvents().map((e) => ({ ...e, left: evLeft(e.at) }));
  if (k === "counts") { const c = itemCodex && itemCodex.state ? itemCodex.state() : null, q = quests && quests.codexCount ? quests.codexCount() : null; return { items: c && c.data ? `${c.data.n} / ${c.data.all}` : "", scam: q ? `${q.got} / ${q.all}` : "", ach: q ? `${q.ach} / ${q.achAll}` : "", bonus: c && c.data ? c.data.bonus : cxBonus }; }
  if (k === "map") return openMap();
  if (k === "crew") return crewUI.show();
  if (k === "friends") return chatUI && chatUI.show();
  if (k === "invite") return referUI && referUI.open();
  if (k === "items") return openCodex();
  if (k === "make") return openMake();
  if (k === "jur") return toast(TW("Open it in Jurassic World: Pack → Codex"));
  return null;
}
/// the item codex (world-codex.js; the marks and the milestones are the server's: api/_world-codex.mjs)
let itemCodex = null, cxWas = false, topAsk = false;
async function loadCodex() {
  if (itemCodex) return itemCodex;
  const M = await import("./world-codex.js");
  itemCodex = M.createCodex({ T: TW, esc, toast, sess, post, signIn, level, ver: VER,
    items: () => { const d = rpg ? rpg.data() : null; return d ? [...Object.values(d.eq || {}), ...(d.bag || []), ...(d.store || [])].filter(Boolean) : []; },
    addSupply: (k, n) => { const ok = !!(rpg && rpg.addSupply && rpg.addSupply(k, n)); try { if (ok) { save(); if (combat && combat.paintPots) combat.paintPots(); } } catch { /* shown on the next repaint */ } return ok; },
    onBonus: (b, t) => { cxBonus = b && Object.keys(b).length ? b : null; cxTitles = t || []; try { if (rpg) rpg.refresh(); } catch { /* not built yet */ } },
    wearTitle: (t) => { try { if (quests && quests.wear) quests.wear(t); } catch { /* worn later from the Adventure log */ } },
    openMonsters: (k) => { if (quests && rpg) { quests.setTab(k === "scam" ? "codex" : "ach"); rpg.show("log"); } },
    openMap: () => openMap(), onClaim: () => refreshPurse(true),
    onOpen: () => { cxWas = frozen; frozen = true; keys.clear(); near = null; paintPrompt(); }, onClose: () => { frozen = cxWas; keys.clear(); } });
  return itemCodex;
}
async function openCodex() {
  try { const c = await loadCodex(); closeAll(); await c.open(); }
  catch (e) { console.warn("item codex", e); toast(TW("Couldn't open it — try again")); staleReload(); }
}
/// the guide to AGENT DIMENSION and ARCIRCLE Studio Lite (world-adguide.js; the words in /ad-guide-data.js, shared with /game)
let adGuide = null;
async function openAdGuide(which) {
  try { if (!adGuide) { const M = await import("./world-adguide.js"); adGuide = M.createAdGuide({ lang: LANG, ver: VER, esc }); } await adGuide.open(which || "ad"); }
  catch (e) { console.warn("ad guide", e); toast(TW("Couldn't open it — try again")); staleReload(); }
}
async function openAgent() { const a = await loadAgent(); if (!a) { toast(TW("Couldn't open your agent — try again")); return; } closeAll(); a.open(); }
setTimeout(() => { loadAgent().catch(() => {}); }, 7000);
// the Halloween Pumpkin Kings (world-pumpking.js, 22 Oct – 5 Nov US Eastern; ?pk=day / ?pk=night to try): five dancing
// kings by day, Inferno Jack rampaging at night (20:00–05:00 US Eastern), everyone's HP, the top 3 hitters rewarded
let pumpKings = null;
const pkCalm = () => mode === "hub" && !introOn && !jurOn && !survOn && !ringsOn && !pokerOn && !mineOn && !defenseOn && !jumpOn && !beatOn;
if (Date.now() < Date.parse("2026-11-06T06:00:00Z") || /[?&]pk=/.test(location.search)) setTimeout(async () => {
  try { const M = await import("./world-pumpking.js");
    pumpKings = M.createPumpKings({ THREE, K, planet, T: TW, esc, toast, Snd, ver: VER, low: lowGfx, coarse, reduce, compile: (l) => compileHidden(l), combat: () => combat, here: (v) => here(v), level, sess, post, blocked: (v) => blockedAt(v),
      addItem: (it) => { rpg.addItem(it); save(); }, refresh: () => refreshPurse(true), parts, shake: (n) => { if (!reduce) shake = Math.max(shake, n); }, inHub: pkCalm, name: (it) => (it.u === "jack" ? TW("Jack's Inferno Blade") + (it.p ? " +" + it.p : "") : rpg.itemName(it)) });
    try { pumpKings.clear(groundG); } catch { /* the trees stay */ }
  } catch (e) { console.warn("pumpkin kings", e); staleReload(); }
}, 5000);
setInterval(() => { if (agentDim) agentDim.paintChip(); }, 1500);
let dinoTown3d = null; // world-dinotown.js, loaded when there's a companion to draw
const dinoTown = (() => {
  let DE = null, st = null, nests = [], seen = {}, el = null, last = 0, fails3d = 0;
  const left = (ms) => { ms = Math.max(0, ms); const h = Math.floor(ms / 36e5), m = Math.max(1, Math.floor((ms % 36e5) / 6e4)); return h ? TW("{h}h {m}m", { h, m }) : TW("{m}m", { m }); };
  const note = (title, body) => { try { if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return; new Notification(title, { body, icon: "/images/brand/apple-touch-icon-v2.png", tag: "arc-dino" }); } catch { /* not this browser */ } };
  async function look() {
    const s = sess(); if (!s) { st = null; return paint(); }
    try { if (!DE) DE = await import("./world-dino-engine.js"); } catch { return; }
    try { const [a, b] = await Promise.all([fetch("/api/social?world=dino&wallet=" + encodeURIComponent(String(s.wallet).toLowerCase()), { cache: "no-store" }), fetch("/api/social?world=dino-nests", { cache: "no-store" })]);
      if (a.ok) st = await a.json(); if (b.ok) nests = (await b.json()).eggs || []; } catch { /* the next look */ }
    last = Date.now(); paint();
  }
  function what() {
    if (!st || !DE) return null; const t = Date.now();
    const eggs = st.eggs || (st.egg ? [st.egg] : []);
    for (const eg of eggs) { const e = DE.eggState(eg, t); if (e.stage === "READY") return { k: "ready", t: "🐣 " + TW("Your egg is ready to hatch!") }; }
    let soon = null; for (const eg of eggs) { const e = DE.eggState(eg, t); if (e.open && /^D/.test(e.stage) && (!soon || e.closesAt < soon.e.closesAt)) soon = { eg, e }; }
    if (soon) { const l = soon.e.closesAt - t; return { k: l < 4 * 3600e3 ? "warn" : "care", t: "🥚 " + TW("Egg care open · {t} left", { t: left(l) }), key: "c" + soon.eg.id + (soon.eg.done || []).length + (l < 3600e3 ? "1h" : l < 4 * 3600e3 ? "4h" : "") }; }
    if (st.canClaim === false || (st.canClaim == null && st.buddy)) return null;
    if (st.first) return { k: "first", t: "🥚 " + TW("Your first egg is waiting in Jurassic World") };
    const e = nests.find((x) => x.to > t); if (e) return { k: "out", t: "🥚 " + TW("A rare egg is out in Jurassic World · {t} left", { t: left(e.to - t) }), key: "o" + e.nest + e.to };
    return null;
  }
  function paint() {
    if (!el) { el = document.createElement("button"); el.type = "button"; el.className = "wp-dinochip"; el.hidden = true; document.body.appendChild(el);
      el.addEventListener("click", () => { if (mode !== "hub" || jurOn || frozen) return; window.arcWorld.jurassic().gate(); toast(TW("Step into the Jurassic World portal")); }); }
    const w = what(), show = !!w && mode === "hub" && !jurOn && !survOn && !ringsOn && !pokerOn && !mineOn && !defenseOn && !jumpOn && !beatOn && !introOn;
    el.hidden = !show; if (!w) return; if (el.textContent !== w.t) el.textContent = w.t; { const c = "wp-dinochip " + w.k + (el.classList.contains("wp-nq-off") ? " wp-nq-off" : ""); if (el.className !== c) el.className = c; } /* (the phone notice queue's wp-nq-off kept) */
    if (w.key && !seen[w.key]) { seen[w.key] = 1; if (w.k === "warn" || w.k === "out") { if (!jurOn) toast(w.t); note("DINO SOULMATE", w.t.replace(/^\S+\s/, "")); } }
  }
  // the companions walking in town: yours (unless it's resting: world-dino.js's "arc.dino" out) and the others' near you
  async function walkers() {
    let out = true; try { out = JSON.parse(localStorage.getItem("arc.dino") || "{}").out !== false; } catch { /* out */ }
    const b = st && st.buddy, mine = b && b.genes && out ? `${b.genes.species === "trike" ? "trike" : "raptor"}.${b.genes.pal}.${b.genes.rarity}.${Math.max(0, Math.min(4, b.stage | 0))}` : "";
    dinoOutNow = !!mine; const theirs = []; if (ghosts) ghosts.each((g, w) => { if (w.dn && !w.gone) theirs.push({ key: w.wallet || String(w.at), x: g.position.x, z: g.position.z, code: w.dn }); });
    if (!mine && !theirs.length && !dinoTown3d) return;
    if (!dinoTown3d && fails3d > 2) return; // (it's only the companions' walk: after three failed loads, a page from before a deploy stops trying)
    if (!dinoTown3d) { try { const M = await import("./world-dinotown.js"); dinoTown3d = M.createTownDinos({ THREE, K, planet, here: (v) => here(v), facing: () => facing, ver: VER, inHub: () => mode === "hub" && !introOn && !jurOn, shadow: (r, k) => LOOK.contactShadow(r, k), low: lowGfx, reduce }); } catch (e) { fails3d++; console.warn("town dino", e); return; } }
    dinoTown3d.set(mine); dinoTown3d.others(theirs);
  }
  setTimeout(look, 6000); setInterval(() => { if (Date.now() - last > (document.hidden ? 120e3 : 75e3)) look(); else paint(); }, 5000);
  setInterval(() => { walkers().catch(() => {}); }, 2000);
  return { look, paint, state: () => st };
})();
window.arcWorld = { texRest: () => texRest.count(), openBridge: (o) => openBridge(o), ccGo: () => ccGo(), landGo: (to) => landGo(to), ccTo: (id) => ccTo(id), cc: () => ccL, ccBuilding: (id) => ccBuilding(id), ccStep: (k) => ccStep(k), landNow: () => landNow, armParts: () => (bodyArm ? bodyArm.L.map((p) => p.n + "@" + p.b.name) : []), /* (tests: the armour on the body) */ heroSkin: () => { try { return heroSkin(); } catch (e) { return "ERR " + e.message; } }, /* (tests: the hero's paint) */ mythAura: () => ({ has: !!mythAura, vis: !!(mythAura && mythAura.visible) }), /* (tests: the six's aura) */ mythOn: () => { const L = []; player.traverse((o) => { if (/^mythic:/.test(o.name)) L.push(o.name); }); return L; }, scene3: () => st.scene, cam3: () => st.camera, gl3: () => st.renderer, /* (tests: what the scene draws) */ rqPortalFront: () => rqPortalFront(), mythic: () => mythicNow, mythicTest: (o) => { mythicNow = o; }, /* (tests: a set to show) */ openMythic: (s0) => openMythic(s0), mythicUI: () => mythicUI(), refreshMythic: () => refreshMythic(), statsNow: () => rpg && rpg.stats && rpg.stats(), nearNow: () => { const n = nearest(); return n ? n.kind + ":" + (n.to || "") : ""; }, rq: () => rqL, rqGo: (id) => rqGo(id), raidQueens: () => openRaidQueens(), rqGate: (k = 18) => { const g = rqGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - g.x / d * k, g.z - g.z / d * k, { x: g.x, z: g.z }); return { model: !!rqGate.userData.model }; }, codex: () => itemCodex, openCodex: () => openCodex(), snd: Snd, adGuide: (k) => openAdGuide(k), adPromo: () => adPromo(true), goAgentTower: () => goAgentTower(), studio: () => studio, ringsNow: () => ringsGame, arena: () => agArena, openArena: () => openArena(), openStudio: () => openStudio(), near: () => (near ? near.kind + ":" + (near.b || near.to || "") : ""), frozen: () => frozen, city: () => adc, cityGo: () => cityGo(), cityBuilding: (id) => cityBuilding(id), welcome: () => welcomeBurst(), fountainBurst: (k = 8) => fountain.userData.burst(k), pk: () => pumpKings, standAt: (x, z, c) => standAt(x, z, c || { x: 0, z: 0 }), combatMobs: () => (combat ? combat.mobsRaw().filter((m) => !m.dead).map((m) => ({ n: m.bossName || m.spec.id, lv: m.lv, hp: Math.round(m.hp), max: m.max, ext: !!m.ext, x: +m.g.position.x.toFixed(1), z: +m.g.position.z.toFixed(1) })) : []), fight: (on) => { if (combat && combat.attack) combat.attack(); }, quests: () => quests, svAch: () => svAch, openLog: (t) => { quests.setTab(t); rpg.show("log"); }, agent: () => agentDim, openAgent: () => openAgent(), partner: (k = 14) => { const d0 = pvil.door("kairo"), g = d0.getWorldPosition(new THREE.Vector3()).sub(planet.position), c = pvil.center, dx = g.x - c.x, dz = g.z - c.z, d = Math.hypot(dx, dz) || 1; standAt(g.x - dx / d * k, g.z - dz / d * k, { x: g.x, z: g.z }); return { model: pvil.ready("kairo") }; }, openMap: () => openMap(), myXZ: () => { const v = here(new THREE.Vector3()); return { x: v.x, z: v.z }; }, pvil: () => pvil, goPartnerVillage: () => goPartnerVillage(), openPartner: (id) => openPartner(id || "kairo"), agentGate: (k = 20) => { const g = agentGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - g.x / d * k, g.z - g.z / d * k, { x: g.x, z: g.z }); return { model: !!agentGate.userData.model }; },
  launch: () => launchUI,
  refer: () => referUI, share: (c) => bragCard(c), games: () => openGames(), start: () => openStart(true), autoQ: () => [...autoQ.keys()], toast: (m) => toast(m),
  dinoTown: () => ({ look: dinoTown.look, d3: dinoTown3d ? dinoTown3d.debug() : null, chip: (document.querySelector(".wp-dinochip") || {}).textContent || "" }),
  applyOwn: (o) => applyOwn(o), // the pets, and a worldOwn to mirror (tests)
  stage: () => st, post: () => fxPost, gshadow: () => gshadow, grass: () => grass, gmask: () => gmask, parts: () => parts, music: () => music, vfx: () => vfx, life: () => life, air: () => air, showcase: () => island.showcase(), ride: () => ride, kit: () => kit, race: () => race, inbox: () => inbox, wardrobe: () => wardrobe, decor: () => decor, openProfile: (w) => openProfile(w),
  level: () => level(), purse: (f) => refreshPurse(f), bakedShadows: () => bakedShadows(), // b447: the slow-phone shadow step, for tests
  poker: () => ({ game: pokerGame, on: pokerOn, open: openPoker, door: () => { const e = gv.exitOf("poker"); standAt(e.x, e.z, gv.center); }, view: () => { const e = gv.exitOf("poker"), c = gv.center; standAt(c.x + (e.x - c.x) * 0.3, c.z + (e.z - c.z) * 0.3, { x: e.x * 2 - c.x, z: e.z * 2 - c.z }); } }),
  rings: () => ({ game: ringsGame, on: ringsOn, open: openRings, door: () => { const e = gv.exitOf("rings"); standAt(e.x, e.z, gv.center); }, view: () => { const e = gv.exitOf("rings"), c = gv.center; standAt(c.x + (e.x - c.x) * 0.3, c.z + (e.z - c.z) * 0.3, { x: e.x * 2 - c.x, z: e.z * 2 - c.z }); } }),
  surv: () => ({ game: survGame, on: survOn, open: openSurvivors, door: () => { const e = gv.exitOf("surv"); standAt(e.x, e.z, gv.center); } }),
  land: () => land,
  jurassic: () => ({ game: jurGame, on: jurOn, open: openJurassic, allowed: jurAllowed(), gate: () => { const g = jurGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - g.x / d * 3, g.z - g.z / d * 3, { x: g.x, z: g.z }); } }),
  mine: () => ({ game: mineGame, on: mineOn, rest: mineRest, open: openMine, door: () => { const e = mv.exit(); standAt(e.x, e.z, { x: e.x + Math.sin(e.face) * 5, z: e.z + Math.cos(e.face) * 5 }); } }),
  jump: () => jumpRace, beat: () => beatGame, mode: () => mode, input: () => ({ joy: joy ? { dx: +joy.dx.toFixed(2), dy: +joy.dy.toFixed(2), fixed: joy.fixed } : null, look: !!look, pinch: !!pinch, touches: touches.size, cam: +camGoal.toFixed(2) }), gv: () => gv, liftTo: (y) => { hop = y; at.y = y; vy = 0; grounded = true; } /* tests: stand at a height (a Coin Jump platform) */, goGameVillage: () => goGameVillage(), island: () => island.debug(), isle: () => island, village: () => village, setVillage: (v) => setVillage(v), goIsland: (o = {}) => goIsland(o), leaveIsland, place: (...a) => island._place(...a), blueprint: (...a) => island._blueprint(...a), introDone: () => !introOn,
  lands: { go: (id) => landGo(id), now: () => landNow, lots: () => coinBuildings.map((g) => ({ sym: g.userData.coin.symbol, tier: g.userData.tier, x: g.position.x, z: g.position.z, size: g.userData.size })), portals: () => lands.portals.map((p) => ({ to: p.userData.to, model: !!p.userData.model, x: p.position.x, z: p.position.z })), shops: () => shops.map((g) => ({ id: g.userData.spec.id, x: g.position.x, z: g.position.z })), stand: (x, z, cx, cz) => standAt(x, z, cx != null ? { x: cx, z: cz } : undefined), out: () => outOfBounds(), coins: (list) => { coinData = list; coinData.mine = 0; buildCoinCity(list); return coinBuildings.length; },
    mine: () => coinBuildings.filter((g) => g.userData.mine).map((g) => ({ sym: g.userData.coin.symbol, token: g.userData.coin.token, tier: g.userData.tier, built: !!g.userData.lotG, x: g.position.x, z: g.position.z })),
    lotOpen: (token) => { const c = (coinData || []).find((x) => lc(x.token) === lc(token)); if (!c) return false; const tr = LD.LOT_TIERS[lotTierOf(c)]; goIsland({ lot: { ...c, N: tr.N, max: tr.max } }); return true; },
    isle: () => island.debug(), fill: (n) => island.testFill(n), save: () => island.save(), leave: () => leaveIsland() }, // b-lpv: tests
  P, planet, flyTo: (id) => { const g = id === "npc" ? npc : shops.find((s) => s.userData.spec.id === id); if (g) flyTo(g); },
  near: () => near && (near.spec ? near.spec.id : near.coin ? "coin:" + near.coin.symbol : near.kind),
  coins: () => coinBuildings.length, rocket: launchRocket, burn: burnFire, whale: swimWhale, previewStyle: (id) => island.setTheme(id), combat: () => combat, robots: () => !!(kit && kit.enemies && kit.enemies.EyeDrone), quests: () => quests, pet: () => pet, rpg: () => rpg, state: () => ({ facing, camYaw, hop, grounded, anim: animState, boarding, camFit, camDist, frozen, mode, arcl: (arclShop.arcl() || {}).bal, owned: ((arclShop.own() || {}).items || []).slice() }),
  // for screenshots and tests: point the camera, ride the board
  cam: (o = {}) => { if (o.yaw != null) camYaw = o.yaw; if (o.pitch != null) camPitch = o.pitch; if (o.dist != null) camDist = camGoal = o.dist; if (o.facing != null) facing = o.facing; }, board: (on) => setBoard(!!on), gain: (n) => gain(n, ""), holdXp: (on) => { xpHeld = !!on; },
  fighters: () => fighters.map((g) => ({ id: g.userData.spec.id, live: !!g.userData.live })),
  // for tests and the art audit: what the last frame drew (draw calls, triangles) and what's in GPU memory
  perf: () => ({ calls: diag.draw().calls, triangles: diag.draw().tris, geometries: st.renderer.info.memory.geometries, textures: st.renderer.info.memory.textures, pixelRatio: st.renderer.getPixelRatio(), avatar: P.char || "" }),
  avatar: () => avatar, live: () => live,
  raid: () => raid, ghosts: () => ghosts, tp: (x, z) => { planet.position.set(-x, 0, -z); hop = 0; vy = 0; grounded = true; },
};
