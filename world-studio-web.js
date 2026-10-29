// world-studio-web.js — a game made in ARCIRCLE Studio, on the web (2026-10-26, the owner: "유저가 게임을 만들면 우리 웹
// /game 뒤로 유저 이름 해서 웹으로 실제 연동되게"). studio-web.html at /game/@<creator>/<game> (a game's page) and
// /game/@<creator> (a creator's games); the server put the data in window.__SG (api/_world-studio.mjs page()).
// The page paints from that at once; the game's engines (three.js, the hero, world-studio.js) load only when Play is
// pressed, and the run is the Studio's own (the same scenes, HUD and result card as in ARCIRCLE WORLD) drawn on a canvas of
// the page — no town behind it. Signed in in ARCIRCLE WORLD on this browser = signed in here (the same session): the run
// goes on the game's board and a like counts. Monster Survival and Ring Puzzle need the World's own games: they open there.
import { WORDS } from "./world-words.js";
import { TEMPLATES, THEMES } from "./world-studio-gen.js";

const D = window.__SG || {}, $m = document.getElementById("sgw-main");
const LANG = (() => { try { const l = (window.arcI18n && window.arcI18n.get()) || localStorage.getItem("arcircle.lang") || "en"; return ["en", "ko", "zh", "tr"].includes(l) ? l : "en"; } catch { return "en"; } })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mark = (n) => { try { performance.mark(n); } catch { /* old browser */ } }; /* (the load's steps, for diag and tests) */
if (LANG !== "en") for (let i = 0; i < 30 && !(window.__arcDict && window.__arcDict[LANG]); i++) await sleep(100);
const fill = (t, v) => (v ? String(t).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : t);
const T = (s, v) => fill((WORDS[LANG] && WORDS[LANG][s]) || (LANG !== "en" && window.arcI18n && window.arcI18n.translate(s, LANG)) || s, v); // (like world-play.js TW: the game's words, then the site's)
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
const coarse = matchMedia("(pointer: coarse)").matches;
const ICON = { runner: "🏃", dash: "⚡", arena: "🛸", puzzle: "💍", climb: "🧗", defense: "🏰", rush: "🪙", jump: "🍄", dungeon: "🗝️", escape: "⏱️", boss: "🐉", mining: "⛏️", survival: "👾", rhythm: "🎵", race: "🏁" };
const HOW = { runner: "← → change lanes · Space jump · ↓ slide", dash: "← → change lanes · Space jump · ↓ slide", arena: "W A S D or the arrow keys to move", rush: "W A S D or the arrow keys to move", climb: "← → steer — you bounce by yourself", defense: "Tap a pad to build a tower", puzzle: "Tap a ring to turn it", jump: "← → run · Space jump", dungeon: "← → run · Space jump", escape: "← → run · Space jump", boss: "← → run · Space jump", mining: "← → run · Space jump · E dig", rhythm: "D F J K on the beat", race: "A / D steer · S slow down", survival: "W A S D or the arrow keys to move" };
const WORLD_ONLY = new Set(["survival", "puzzle"]); // (they run on the World's own games: SURVIVORS ARENA, INFINITY RINGS)
const art = (tpl) => `/images/studio/tpl/${TEMPLATES[tpl] ? tpl : "runner"}-768.webp`;
const tname = (tpl) => T((TEMPLATES[tpl] || TEMPLATES.runner).name);
const thname = (th) => T((THEMES[th] || THEMES.neon).name);
const num = (n) => { n = Number(n) || 0; return n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k" : String(n); };
const urlOf = (h, sl) => `/game/@${h}${sl ? "/" + sl : ""}`;
function toast(msg) { const t = document.createElement("div"); t.className = "sgw-toast"; t.innerHTML = msg; document.body.appendChild(t); requestAnimationFrame(() => t.classList.add("on")); setTimeout(() => { t.classList.remove("on"); setTimeout(() => t.remove(), 400); }, 2600); }

// ---- the session: the same one ARCIRCLE WORLD keeps on this browser (world-play.js SESS / signIn) ----
const SESS = "arc.world.sess", EPOCH = (window.arcWorldLock && window.arcWorldLock.epoch) || 1;
const sess = () => { try { const s = JSON.parse(localStorage.getItem(SESS) || "null"); return s && Date.now() - Date.parse(s.issued) < 23.5 * 3600e3 ? s : null; } catch { return null; } };
const post = (body) => { const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000);
  return fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ep: EPOCH, ...body }), signal: ac.signal }).then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) })).finally(() => clearTimeout(to)); };
const loginMessage = (wallet, issued) => `ARCIRCLE World — sign in\n\nWallet: ${String(wallet).toLowerCase()}\nIssued: ${issued}\n\nThis only proves the wallet is yours. It costs nothing and moves nothing.`;
async function signIn() {
  const AC = window.arcConnect; if (!AC) throw new Error(T("Wallet connect isn't available here."));
  if (!AC.live || !AC.live()) await AC.connect();
  const a = String((AC.address && AC.address()) || "").toLowerCase(); if (!a) throw new Error(T("Connect a wallet first."));
  const prov = await AC.provider(), issued = new Date().toISOString(), msg = loginMessage(a, issued);
  const hex = "0x" + Array.from(new TextEncoder().encode(msg), (b) => b.toString(16).padStart(2, "0")).join("");
  const signature = await prov.request({ method: "personal_sign", params: [hex, a] });
  const r = await post({ action: "world-login", wallet: a, issued, signature });
  if (!r.ok) throw new Error((r.j && r.j.error) || T("Sign-in failed"));
  localStorage.setItem(SESS, JSON.stringify({ wallet: a, issued, signature })); return true;
}
const signed = async (body) => { let s = sess(); if (!s) { await signIn(); s = sess(); } return post({ ...body, wallet: s.wallet, issued: s.issued, signature: s.signature }); };

// ---------------- the page ----------------
const head = (h, name, off) => `<a class="sgw-by" href="${urlOf(h)}"><i class="sgw-av${off ? " off" : ""}">${off ? "∞" : esc((name || h || "?").slice(0, 1).toUpperCase())}</i><span><b>@${esc(h)}</b>${name && name.toLowerCase() !== h ? `<small>${esc(name)}</small>` : ""}</span>${off ? `<em class="sgw-off">${esc(T("Official"))}</em>` : ""}</a>`;
const cardOf = (h, g) => `<a class="sgw-g" href="${urlOf(h, g.slug)}" style="--art:url('${art(g.tpl)}')"><span class="sgw-g-art"><em>${ICON[g.tpl] || "🎮"} ${esc(tname(g.tpl))}</em></span><b>${esc(g.title)}</b><small>▶ ${num(g.plays)} · ♥ ${num(g.likes)}${g.theme ? " · " + esc(thname(g.theme)) : ""}</small></a>`;
function paintGame() {
  const c = D.creator, g = D.game, web = !WORLD_ONLY.has(g.tpl), th = THEMES[g.theme] || THEMES.neon;
  document.body.style.setProperty("--th", "#" + (th.edge != null ? Number(th.edge).toString(16).padStart(6, "0") : "39d3ff"));
  $m.innerHTML = `<section class="sgw-hero" style="--art:url('${art(g.tpl)}')">
    <div class="sgw-hero-in">
      <span class="sgw-chip">${ICON[g.tpl] || "🎮"} ${esc(tname(g.tpl))} · ${esc(thname(g.theme))}</span>
      <h1>${esc(g.title)}</h1>
      ${head(c.h, c.name, c.off)}
      <div class="sgw-stats"><span><b data-plays>${num(g.plays)}</b>${esc(T("Plays"))}</span><span><b data-likes>${num(g.likes)}</b>${esc(T("Likes"))}</span><span><b>${g.best && g.best[0] ? num(g.best[0].score) : "—"}</b>${esc(T("Best"))}</span></div>
      <div class="sgw-acts">
        ${web ? `<button type="button" class="sgw-play" data-play>▶ ${esc(T("Play now"))}</button>` : `<a class="sgw-play" href="/play?sg=${encodeURIComponent(g.id)}">▶ ${esc(T("Play in ARCIRCLE WORLD"))}</a>`}<a class="sgw-remix" href="/play?sg=${encodeURIComponent(g.id)}&remix=1" title="${esc(T("Remix it"))}">🔀 ${esc(T("Remix it"))}</a>
        <button type="button" class="sgw-btn" data-like>♥ ${esc(T("Like"))}</button>
        <button type="button" class="sgw-btn" data-share>🔗 ${esc(T("Share"))}</button>
      </div>
      <div class="sgw-rx" data-rx>${rxHtml(g.rx)}</div>
      <p class="sgw-note">${esc(web ? T("Free in your browser — no download.") : T("This kind of game opens in ARCIRCLE WORLD."))} ${sess() ? esc(T("Signed in: your best run goes on the board.")) : esc(T("Sign in to put your score on the board."))}</p>
    </div>
  </section>
  <section class="sgw-row">
    <div class="sgw-card"><h2>${esc(T("Top 10"))}</h2><ol class="sgw-board" data-board>${boardHtml(g.best)}</ol></div>
    <div class="sgw-card"><h2>${esc(T("How to play"))}</h2><p class="sgw-how">${esc(T(HOW[g.tpl] || HOW.runner))}</p>${coarse ? `<p class="sgw-how sm">📱 ${esc(T("Turn your phone sideways — the buttons appear on screen."))}</p>` : ""}
      ${g.from ? `<p class="sgw-how sm">♻️ ${esc(T("A remix of"))} <b>${esc(g.from.title)}</b> · ${esc(g.from.byName || "")}</p>` : ""}
      <a class="sgw-link" href="/play?sg=${encodeURIComponent(g.id)}">🌍 ${esc(T("Open it in ARCIRCLE WORLD"))} ›</a></div>
  </section>
  <section class="sgw-sec sgw-cmts"><h2>${esc(T("Comments"))} <small data-cn></small></h2>
    <form class="sgw-cf" data-cf><input name="t" maxlength="140" autocomplete="off" placeholder="${esc(T("Say something nice about this game…"))}"><button type="submit" class="sgw-btn">${esc(T("Post"))}</button></form>
    <ul class="sgw-cl" data-cl><li class="none">…</li></ul></section>
  ${D.more && D.more.length ? `<section class="sgw-sec"><h2>${esc(T("More by {n}", { n: "@" + c.h }))}</h2><div class="sgw-grid">${D.more.map((x) => cardOf(c.h, x)).join("")}</div><a class="sgw-link" href="${urlOf(c.h)}">${esc(T("All games"))} ›</a></section>` : ""}
  ${ctaHtml()}`;
}
// STB7 (2026-10-27): reactions and comments on a game; a creator's level, badges and picks
const RX = { fire: "🔥", lol: "😂", wow: "😮", hard: "💀", love: "😍" }, RXN = { fire: "Fire", lol: "Funny", wow: "Wow", hard: "So hard", love: "Love it" };
const rxHtml = (rx) => Object.entries(RX).map(([k, e]) => `<button type="button" class="sgw-rxb" data-r="${k}" title="${esc(T(RXN[k]))}">${e}<b>${num((rx || {})[k] || 0)}</b></button>`).join("");
const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60e3)); return m < 60 ? T("{n} min ago", { n: m }) : m < 1440 ? T("{n} h ago", { n: Math.round(m / 60) }) : T("{n} d ago", { n: Math.round(m / 1440) }); };
const cmtHtml = (L) => (L && L.length ? L.map((c) => `<li${c.maker ? ' class="mk"' : ""}><i class="sgw-av">${esc((c.name || "?").slice(0, 1).toUpperCase())}</i><div><b>${esc(c.name || "Player")}${c.maker ? ` <em>${esc(T("Maker"))}</em>` : ""}</b><small>${esc(ago(c.at))}</small><p>${esc(c.t)}</p></div></li>`).join("") : `<li class="none">${esc(T("No comments yet — be the first!"))}</li>`);
async function loadCmts() { if (!D.game) return; try { const r = await fetch(`/api/social?world=studio-comments&id=${encodeURIComponent(D.game.id)}`, { cache: "no-store" }); if (!r.ok) return; const j = await r.json(); paintCmts(j.comments || []); const x = $m.querySelector("[data-rx]"); if (x) x.innerHTML = rxHtml(j.rx); } catch { /* the list waits */ } }
function paintCmts(L) { const ul = $m.querySelector("[data-cl]"); if (ul) ul.innerHTML = cmtHtml(L); const n = $m.querySelector("[data-cn]"); if (n) n.textContent = L.length ? String(L.length) : ""; }
const BADGE = { p100: ["🎯", "100 plays"], p1k: ["🚀", "1,000 plays"], p10k: ["🌟", "10,000 plays"], l10: ["💖", "10 likes"], l100: ["💎", "100 likes"], g3: ["🧩", "3 games"], g10: ["🏗️", "10 games"] };
const levelHtml = (c) => (c && c.lv ? `<div class="sgw-lv"><span class="sgw-lvn">${esc(T("Creator Lv {n}", { n: c.lv }))}</span><i><em style="width:${Math.min(100, Math.round(((c.xp - c.from) / Math.max(1, c.next - c.from)) * 100))}%"></em></i><small>${num(c.xp)} / ${num(c.next)} XP</small></div>
  ${c.badges && c.badges.length ? `<div class="sgw-badges">${c.badges.map((b) => BADGE[b] ? `<span class="sgw-badge" title="${esc(T(BADGE[b][1]))}">${BADGE[b][0]}<small>${esc(T(BADGE[b][1]))}</small></span>` : "").join("")}</div>` : ""}` : "");
const boardHtml = (best) => (best && best.length ? best.map((x, i) => `<li${i < 3 ? ` class="m${i + 1}"` : ""}><i>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</i><span>${esc(x.name || "Player")}</span><b>${num(x.score)}</b></li>`).join("") : `<li class="none">${esc(T("Be the first!"))}</li>`);
const ctaHtml = () => `<section class="sgw-cta"><div><h2>${esc(T("Make your own game"))}</h2><p>${esc(T("ARCIRCLE Studio: 15 templates, a builder for every one, your own page on the web."))}</p></div><a class="sgw-play sm" href="/play">${esc(T("Open ARCIRCLE Studio"))}</a></section>`;
function paintCreator() {
  const c = D.creator, L = D.games || [], plays = L.reduce((a, g) => a + (g.plays || 0), 0), likes = L.reduce((a, g) => a + (g.likes || 0), 0);
  $m.innerHTML = `<section class="sgw-hero cr" style="--art:url('/images/gw/key-studio.webp')"><div class="sgw-hero-in">
      <span class="sgw-chip">🎮 ${esc(T("Creator"))}</span>${head(c.h, c.name, c.off)}
      ${levelHtml(c)}
      <div class="sgw-stats"><span><b>${L.length}</b>${esc(T("Games"))}</span><span><b>${num(plays)}</b>${esc(T("Plays"))}</span><span><b>${num(likes)}</b>${esc(T("Likes"))}</span></div>
      <div class="sgw-acts"><button type="button" class="sgw-btn" data-share>🔗 ${esc(T("Share"))}</button></div></div></section>
    <section class="sgw-sec"><h2>${esc(T("Games"))}</h2>${L.length ? `<div class="sgw-grid">${L.map((g) => cardOf(c.h, g)).join("")}</div>` : `<p class="sgw-empty">${esc(T("No games published yet."))}</p>`}</section>
    ${D.picks && D.picks.length ? `<section class="sgw-sec"><h2>${esc(T("{n}'s picks", { n: "@" + c.h }))}</h2><div class="sgw-grid">${D.picks.map((g) => `<a class="sgw-g" href="/play?sg=${encodeURIComponent(g.id)}" style="--art:url('${art(g.tpl)}')"><span class="sgw-g-art"><em>${ICON[g.tpl] || "🎮"} ${esc(tname(g.tpl))}</em></span><b>${esc(g.title)}</b><small>${esc(g.byName || "")} · ▶ ${num(g.plays)}</small></a>`).join("")}</div></section>` : ""}${ctaHtml()}`;
}
function paintMissing() {
  $m.innerHTML = `<section class="sgw-hero miss" style="--art:url('/images/gw/key-studio.webp')"><div class="sgw-hero-in"><span class="sgw-chip">404</span><h1>${esc(T("This game isn't here"))}</h1>
    <p class="sgw-note">${esc(T("It may have been taken down, or the address changed."))}</p><div class="sgw-acts"><a class="sgw-play" href="/game/@arcircle">${esc(T("Play ARCIRCLE's games"))}</a><a class="sgw-btn" href="/play">${esc(T("Play ARCIRCLE WORLD"))}</a></div></div></section>`;
}
function paint() { if (D.app) { /* (the Studio's own page: startApp paints it) */ } else if (D.game) paintGame(); else if (D.creator) paintCreator(); else paintMissing(); document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = T(e.dataset.t); }); }
paint(); if (!D.app) loadCmts();
{ const sel = document.querySelector(".sgw-lang"); if (sel) { sel.value = LANG; sel.addEventListener("change", () => { try { localStorage.setItem("arcircle.lang", sel.value); } catch { /* fine */ } location.reload(); }); } }

async function refresh() { // (after a run or a like: the board and the numbers read again)
  if (!D.game) return; try { const r = await fetch(`/api/social?world=studio-at&h=${encodeURIComponent(D.creator.h)}&g=${encodeURIComponent(D.game.slug)}`, { cache: "no-store" }); if (!r.ok) return; const j = await r.json(); if (!j.game) return; D.game = { ...D.game, ...j.game };
    const b = $m.querySelector("[data-board]"); if (b) b.innerHTML = boardHtml(D.game.best); const p = $m.querySelector("[data-plays]"); if (p) p.textContent = num(D.game.plays); const l = $m.querySelector("[data-likes]"); if (l) l.textContent = num(D.game.likes); } catch { /* the next look */ }
}
$m.addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.hasAttribute("data-play")) return play(b);
  if (b.hasAttribute("data-share")) {
    const u = location.origin + (D.path || location.pathname), text = D.game ? `🎮 "${D.game.title}" — ${T("a game made in ARCIRCLE Studio")} · @${D.creator.h}` : `🎮 @${D.creator.h} — ${T("games made in ARCIRCLE Studio")}`;
    if (navigator.share && coarse) { try { await navigator.share({ title: document.title, text, url: u }); return; } catch { /* cancelled: copy instead */ } }
    try { await navigator.clipboard.writeText(u); toast("🔗 " + esc(T("Link copied"))); } catch { toast(esc(u)); }
    window.open("https://x.com/intent/post?text=" + encodeURIComponent(text + "\n" + u), "_blank", "noopener"); return;
  }
  if (b.dataset.r) { b.disabled = true;
    try { const r = await signed({ action: "world-studio-react", id: D.game.id, r: b.dataset.r }); if (r.ok) { const x = $m.querySelector("[data-rx]"); if (x) x.innerHTML = rxHtml(r.j.rx); const nb = $m.querySelector(`[data-r="${b.dataset.r}"]`); if (nb) { nb.classList.add("on", "pop"); } if (r.j.already) toast(esc(T("You reacted already"))); } else toast(esc((r.j && r.j.error) || T("Couldn't open it — try again"))); }
    catch (er) { toast(esc((er && er.message) || T("Sign-in failed"))); } finally { b.disabled = false; } return; }
  if (b.hasAttribute("data-like")) {
    b.disabled = true;
    try { const r = await signed({ action: "world-studio-like", id: D.game.id }); if (r.ok) { b.classList.add("on"); toast(r.j.already ? "♥ " + esc(T("You liked this already")) : "♥ " + esc(T("Liked!"))); refresh(); } else toast(esc((r.j && r.j.error) || T("Couldn't open it — try again"))); }
    catch (er) { toast(esc((er && er.message) || T("Sign-in failed"))); } finally { b.disabled = false; }
  }
});

$m.addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-cf]"); if (!f) return; e.preventDefault(); const inp = f.querySelector("input"), t = inp.value.trim(); if (t.length < 2) return;
  const bt = f.querySelector("button"); bt.disabled = true;
  try { const r = await signed({ action: "world-studio-comment", id: D.game.id, t }); if (r.ok) { inp.value = ""; paintCmts(r.j.comments || []); const li = $m.querySelector("[data-cl] li"); if (li) li.classList.add("new"); } else toast(esc((r.j && r.j.error) || T("Couldn't open it — try again"))); }
  catch (er) { toast(esc((er && er.message) || T("Sign-in failed"))); } finally { bt.disabled = false; }
});

// ---------------- the run: the Studio's engines on this page's canvas ----------------
let host = null, busy = false;
async function makeHost() {
  if (host) return host;
  if (!document.querySelector('link[href^="/studio.min.css"]')) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/studio.min.css" + (new URL(import.meta.url).search || ""); /* (only the Studio's rules — world.min.css is the whole World's) */ document.head.appendChild(l); await new Promise((r) => { l.onload = r; l.onerror = r; setTimeout(r, 4000); }); } // (the Studio's HUD, result card and the sideways card)
  const [K, ST, SFX, PAD] = await Promise.all([import("./world-kit.js"), import("./world-studio.js"), import("./world-sfx.js"), import("./world-studio-pad.js")]); mark("sg:mods");
  const cv = document.getElementById("sgw-cv"); cv.hidden = false;
  const S = (() => { const d = { quality: "auto", sound: true, sfx: 70 }; try { return { ...d, ...JSON.parse(localStorage.getItem("arc.world.set") || "{}") }; } catch { return d; } })();
  mark("sg:stage0"); const st = K.makeStage(cv, { quality: S.quality, envLater: D.app ? 600 : null }), VER = new URL(import.meta.url).search, low = S.quality === "low" || S.quality === "saver" || st.quality.low;
  mark("sg:stage1");
  const Snd = SFX.createSfx({ S, coarse });
  const P = (() => { try { return JSON.parse(localStorage.getItem("arc.world") || "{}") || {}; } catch { return {}; } })();
  const gate = PAD.makeGate({ T, esc, coarse, ver: VER, place: D.game ? D.game.title : "ARCIRCLE Studio", line: "This game is made for landscape — turn your phone to play.", back: "Back to the game's page", onBack: () => { const g = host && host.studio.playing && host.studio.playing(); if (g && g.leave) g.leave(); else done(); } });
  mark("sg:pre-studio");
  const studio = ST.createStudio({ THREE: K.THREE, K, st, T, esc, toast: (m) => toast(m), Snd, reduce: matchMedia("(prefers-reduced-motion: reduce)").matches, ver: VER, isGM: () => false, guide: () => {}, low, saver: S.quality === "saver", coarse,
    myName: () => P.name || "", sess, post, signIn: () => signIn().then((x) => { paintMe(); return x; }),
    onClose: () => { if (D.app) setTimeout(() => { try { toHub(); } catch { /* fine */ } }, 0); }, /* (/studio: × goes back to the Creator Hub) */ soundOn: () => S.sound !== false, agentName: () => "", share: null, onEvent: () => {},
    land: { landscape: () => gate.landscape(), enter() {}, exit() {} },
    makeHero: () => K.makeCharacter(K.heroOf ? K.heroOf(/^custom-/.test(P.char || "") ? P.char : "custom-aron") : "custom-aron", VER).then((c) => { if (c && c.setTint) c.setTint(P.tint || 0); return c; }),
    myChar: () => (/^custom-/.test(P.char || "") ? P.char : "custom-aron"), makeHeroOf: (id) => K.makeCharacter(K.heroOf ? K.heroOf(/^custom-/.test(id) ? id : "custom-aron") : "custom-aron", VER) }); /* (WS4: the other racers) */
  if (coarse && st.fps) { let was = 0; const cap = () => { const c = studio.playing() ? 60 : 30; if (c !== was) { was = c; st.fps(c); } }; cap(); setInterval(cap, 500); } /* (PF1: a phone draws the Studio windows and preview at 30, a game at 60) */
  mark("sg:host"); host = { K, st, studio, gate, cv }; return host;
}
function done() { // (the run's way back: the page again)
  document.body.classList.remove("sgw-on"); if (host) { host.gate.on("web", false); host.cv.hidden = true; } busy = false; refresh();
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* fine */ }
}
async function play(btn) {
  if (busy) return; busy = true; btn.classList.add("busy");
  if (coarse) { try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: "hide" }); if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape").catch(() => {}); } catch { /* the sideways card asks instead */ } }
  const ld = document.createElement("div"); ld.className = "sgw-load"; ld.style.setProperty("--art", `url('${art(D.game.tpl)}')`); ld.innerHTML = `<div><b>${esc(D.game.title)}</b><i><em></em></i><small>${esc(T("Loading the game…"))}</small></div>`; document.body.appendChild(ld);
  try {
    const h = await makeHost(); document.body.classList.add("sgw-on"); h.cv.hidden = false; h.gate.on("web", true);
    await h.studio.playId(D.game.id, { onBack: done });
    for (let i = 0; i < 150 && !h.studio.playing() && busy; i++) await sleep(200); // (the run builds its scene and the hero first: a few seconds on a phone)
    if (!h.studio.playing() && busy) throw new Error("no run"); // (the Studio's own toast already said why when it failed)
  } catch (e) { console.warn("studio web", e); toast("⚠️ " + esc(T("The game couldn't start")) + " — " + esc(T("try again, or open it in ARCIRCLE WORLD"))); done(); }
  finally { ld.classList.add("out"); setTimeout(() => ld.remove(), 500); btn.classList.remove("busy"); }
}
if (D.game && new URLSearchParams(location.search).has("play") && !WORLD_ONLY.has(D.game.tpl)) { const b = $m.querySelector("[data-play]"); if (b && !coarse) play(b); } // (?play: straight in, on a computer — a phone waits for the tap it needs for full screen)
// ---------------- /studio: ARCIRCLE Studio as a page of its own (2026-10-27, the owner: "the Studio on the web, fast") ----------------
// The Studio window is the page (under the top bar); the stage's canvas sits behind it for the preview and the runs; a
// phone held upright sees the sideways card only while a game runs. A deep link: /studio?tab=arcade|mine|make, ?sg=<id>.
const WALLET_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a1 1 0 0 1 1 1v1.5H6.5a.75.75 0 0 0 0 1.5H19a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 16.5z"/><circle cx="16.4" cy="14" r="1.35" fill="#0b1630"/></svg>';
function paintMe() { /* (the wallet button: a gradient-ringed pill with a wallet badge; signed in, the badge turns into the wallet's own colours + a live dot, and the address) */
  const b = document.querySelector("[data-signin]"); if (!b) return; const s = sess(); b.hidden = false; b.classList.toggle("on", !!s);
  if (s) { const w = s.wallet, h = parseInt(w.slice(2, 8), 16) % 360, h2 = (h + 70 + (parseInt(w.slice(-4), 16) % 120)) % 360;
    b.innerHTML = `<i class="sga-me-ic" style="--h1:${h};--h2:${h2}"><em></em></i><span><small>${esc(T("Signed in"))}</small><b>${esc(w.slice(0, 6) + "…" + w.slice(-4))}</b></span>`; b.title = w; b.setAttribute("aria-label", w); }
  else { b.innerHTML = `<i class="sga-me-ic">${WALLET_SVG}</i><span><b>${esc(T("Connect wallet"))}</b></span>`; b.title = ""; b.setAttribute("aria-label", T("Connect wallet")); }
}
// the top bar's Portrait | Landscape switch (2026-10-27, the owner: "web Studio in both, a switch at the top"): phones only;
// the lit half is how the phone is held now; the other one asks for full screen and turns the screen there (Android);
// where the browser can't (iPhone, auto-rotate off) a toast says how to turn it by hand
function orientUI() {
  const g = document.querySelector(".sga-or"); if (!g || !coarse) return; g.hidden = false;
  const isL = () => matchMedia("(orientation: landscape)").matches;
  const mark = () => g.querySelectorAll("[data-or]").forEach((b) => { const on = (b.dataset.or === "landscape") === isL(); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  mark(); for (const k of ["resize", "orientationchange"]) addEventListener(k, () => setTimeout(mark, 250));
  g.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-or]"); if (!b) return; const want = b.dataset.or; if ((want === "landscape") === isL()) return;
    g.classList.add("busy");
    const de = document.documentElement, mine = !document.fullscreenElement, cap = (pr, ms) => Promise.race([pr, sleep(ms).then(() => { throw new Error("slow"); })]);
    try { /* (a browser that never answers the lock mustn't leave the switch dimmed: both steps are capped) */
      if (mine && de.requestFullscreen) await cap(de.requestFullscreen({ navigationUI: "hide" }), 1500);
      if (!screen.orientation || !screen.orientation.lock) throw new Error("no lock");
      await cap(screen.orientation.lock(want), 1500);
    } catch { /* (the check below says what to do) */ }
    await sleep(500);
    if ((want === "landscape") !== isL()) { /* (it didn't turn: Samsung Internet / iPhone without a lock, or auto-rotate off — say how, and give the full screen back) */
      if (mine && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      toast("📱 " + esc(T(want === "landscape" ? "Turn your phone sideways — if it doesn't turn, switch on Auto rotate." : "Turn your phone upright — if it doesn't turn, switch on Auto rotate.")));
    }
    g.classList.remove("busy"); mark();
  });
}
// HUB (2026-10-28, the owner: Roblox's Creator Hub as the reference): /studio opens on the Creator Hub (world-studio-hub.js) —
// its own front page and menus, painted at once without three.js; the Studio window is the workspace it opens (Create,
// Edit, Play, a race), and the window's × or the browser's Back comes back to the hub. A deep link (?tab= / ?sg= / ?race=
// / ?ch=) still goes straight into the workspace.
let hub = null, ran = false;
function toHub() { if (!hub) return; document.body.classList.remove("sga-on", "sga-run"); hub.show(); if (history.state && history.state.ws === 1) history.back(); else history.replaceState(null, "", "/studio" + (new URLSearchParams(location.search).get("p") ? location.search : "")); }
async function workspace(fn, tab, direct) {
  let ld = null; if (!host) { ld = document.createElement("div"); ld.className = "sga-boot sgh-boot"; ld.innerHTML = `<img src="/images/studio/ui/tab-make.webp" alt="" width="96" height="96"><b>${esc(T("Opening ARCIRCLE Studio…"))}</b><i><em style="width:30%"></em></i>`; document.body.appendChild(ld); }
  try {
    const h = await makeHost(); if (hub) hub.hide(); document.body.classList.add("sga-on"); h.cv.hidden = false;
    if (direct) history.replaceState({ ws: 2 }, "", location.href); else if (!(history.state && history.state.ws)) history.pushState({ ws: 1 }, "", "/studio?tab=" + (tab || "make")); /* (ws 2: the page was opened at the workspace — × replaces the address instead of going back off the site) */
    if (!ran) { ran = true; let on = false; setInterval(() => { const p = !!h.studio.playing(); if (p !== on) { on = p; document.body.classList.toggle("sga-run", p); } }, 400); orientUI(); } /* (/studio plays held either way — the top bar's switch turns it) */
    await fn(h.studio); mark("sg:open");
  } catch (e) { console.warn("studio app", e); toast("⚠️ " + esc(T("The Studio couldn't open")) + " — " + esc(T("Try again"))); if (hub) hub.show(); else $m.innerHTML = `<div class="sga-boot err"><b>⚠️ ${esc(T("The Studio couldn't open"))}</b><a class="sgw-play sm" href="/studio">${esc(T("Try again"))}</a><a class="sgw-btn" href="/play">${esc(T("Open it in ARCIRCLE WORLD"))}</a></div>`; }
  finally { if (ld) { ld.classList.add("out"); setTimeout(() => ld.remove(), 300); } }
}
async function startApp() {
  paintMe(); document.querySelector("[data-signin]").addEventListener("click", async () => { if (sess()) return; try { await signIn(); paintMe(); toast("👛 " + esc(T("Signed in"))); if (host) host.studio.load(); if (hub) hub.refresh(); } catch (e) { toast(esc((e && e.message) || T("Sign-in failed"))); } });
  const hm = document.querySelector("[data-hubmenu]"); if (hm) hm.addEventListener("click", () => { if (hub && hub.menu) hub.menu(); else location.href = "/studio"; }); // (the workspace's ≡ opens the Creator Hub's menu, 2026-10-29)
  const hb = document.querySelector("[data-tohub]"); if (hb) hb.addEventListener("click", () => { try { host && host.studio.shown() ? host.studio.close() : toHub(); } catch { toHub(); } });
  const q = new URLSearchParams(location.search), deep = /^[A-Za-z0-9]{5}$/.test(q.get("race") || "") || /^[a-z0-9]{8}$/.test(q.get("ch") || "") || !!q.get("sg") || /^[A-Za-z0-9_-]{4,40}$/.test(q.get("edit") || "") || ["arcade", "mine", "make", "3d"].includes(q.get("tab"));
  try {
    const HUB = await import("./world-studio-hub.js");
    const W = (fn, tab) => workspace(fn, tab);
    hub = HUB.makeHub({ T, esc, toast, num, ver: new URL(import.meta.url).search, lang: LANG, sess, signed, signIn: () => signIn().then((x) => { paintMe(); if (host) host.studio.load(); return x; }),
      ws: { open: (t) => W((s) => s.open(t), t), use: (tpl, th) => W((s) => s.useTpl(tpl, th), "make"), edit: (id) => W((s) => s.editId(id), "mine"), local: (id) => W((s) => s.editLocal(id), "make"), play: (id) => W((s) => s.playId(id), "arcade"),
        remix: (id) => W((s) => s.remixId(id), "make"), race: (c) => W((s) => { s.open("arcade"); return s.raceJoin(c); }, "arcade"), quick: () => W((s) => { s.open("arcade"); return s.raceQuick(); }, "arcade") } });
    mark("sg:hub"); const b0 = document.querySelector(".sga-boot"); if (b0) b0.remove();
    addEventListener("popstate", () => { if (hub.shown() || !host) return; if (!(history.state && history.state.ws)) { try { host.studio.close(); } catch { /* fine */ } document.body.classList.remove("sga-on", "sga-run"); hub.show(); } });
    if (deep) { hub.hide(); await workspace((s) => { if (/^[A-Za-z0-9]{5}$/.test(q.get("race") || "")) { s.open("arcade"); s.raceJoin(q.get("race")); } else if (/^[a-z0-9]{8}$/.test(q.get("ch") || "")) s.playChal(q.get("ch")); else if (/^[A-Za-z0-9_-]{4,40}$/.test(q.get("edit") || "")) return s.editId(q.get("edit")).then(() => { if (s.spec().tpl === "obby") s.openBuilder(); }); /* (ED1: a phone's draft handed to the PC) */ else if (q.get("sg")) s.playId(q.get("sg"), { vs: Math.max(0, Math.floor(Number(q.get("vs")) || 0)), vsBy: String(q.get("by") || "").slice(0, 16) }); else s.open(q.get("tab")); }, q.get("tab") || "arcade", true); }
    else setTimeout(() => { Promise.all([import("./world-kit.js"), import("./world-studio.js"), import("./world-sfx.js"), import("./world-studio-pad.js")]).catch(() => {}); }, 2500); /* (the workspace's code, fetched while you look round: Create opens at once) */
  } catch (e) { console.warn("studio hub", e); $m.innerHTML = `<div class="sga-boot err"><b>⚠️ ${esc(T("The Studio couldn't open"))}</b><a class="sgw-play sm" href="/studio">${esc(T("Try again"))}</a><a class="sgw-btn" href="/play">${esc(T("Open it in ARCIRCLE WORLD"))}</a></div>`; }
}
if (D.app) startApp();
window.__sgw = { host: () => host, play: () => { const b = $m.querySelector("[data-play]"); return b ? play(b) : null; } }; // (tests)
