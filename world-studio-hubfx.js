// world-studio-hubfx.js — the Creator Hub's look and motion (HUB 2, 2026-10-28): a light / dark switch, the Korean
// headlines in Noto Sans KR 800 (fetched only for 한국어), one set of card badges (NEW / HOT, the test players' stars and
// clear rate), a card that plays its level for a moment (the mouse over it, a finger held on it — world-studio-prev.js,
// fetched the first time), the home's wall of game art following the mouse or the phone's tilt, the "playing now"
// count kept fresh, and the cut-in for a milestone (your first game out, 100 / 1,000 plays, a new creator level).
// Weak phones (few cores or little memory, a touch screen) and "reduce motion" keep the still pictures.
import { estimate, clampSpec } from "./world-studio-gen.js";

export function makeHubFx(c) {
  const { T, esc, ic, D } = c, html = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, coarse = matchMedia("(pointer: coarse)").matches;
  const lite = reduce || (coarse && ((navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4));
  html.classList.toggle("sgh-lite", lite);
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

  // ---- light / dark ----
  const theme = () => (LS("arc.hub.theme") === "light" ? "light" : "dark");
  const apply = () => { html.dataset.ht = theme(); const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = theme() === "light" ? "#f4f6f8" : "#0b0d10"; };
  apply();
  const themeBtn = () => `<button type="button" class="sgh-ib" data-htog aria-label="${esc(T(theme() === "light" ? "Dark mode" : "Light mode"))}" title="${esc(T(theme() === "light" ? "Dark mode" : "Light mode"))}">${ic(theme() === "light" ? "moon" : "sun")}</button>`;
  function toggle() { LS("arc.hub.theme", theme() === "light" ? "dark" : "light"); html.classList.add("sgh-tswap"); apply(); document.querySelectorAll("button[data-htog]").forEach((b) => { b.outerHTML = themeBtn(); }); setTimeout(() => html.classList.remove("sgh-tswap"), 450); }

  // ---- 한국어: Noto Sans KR 800 for the headlines ----
  if (c.lang === "ko" && !document.querySelector("link[data-krfont]")) { const l = document.createElement("link"); l.rel = "stylesheet"; l.dataset.krfont = "1"; l.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&display=swap"; document.head.appendChild(l); html.classList.add("sgh-ko"); }

  // ---- the card badges: NEW / HOT now, the test players' stars + clear rate a moment later (estimate(), off the main beat) ----
  const DAY = 864e5;
  function badges(g, opt = {}) {
    if (opt.own || !g || !g.id) return "";
    const nw = !g.off && g.at && Date.now() - g.at < 3 * DAY, hot = (g.now || 0) >= 2 || (g.plays || 0) >= 50;
    return `${nw || hot ? `<em class="sgh-flag ${hot ? "hot" : "new"}">${esc(T(hot ? "HOT" : "NEW"))}</em>` : ""}`;
  }
  const difRow = (g) => (g && (g.s || g.spec) ? `<span class="sgh-dif" data-dif="${esc(g.id)}"></span>` : "");
  const difs = new Map(); let difQ = [], difBusy = false;
  function decorate(root) {
    root.querySelectorAll("[data-dif]:not(.on)").forEach((el) => { const id = el.dataset.dif; if (difs.has(id)) paintDif(el, difs.get(id)); else difQ.push(el); });
    if (!difBusy && difQ.length) { difBusy = true; const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 30));
      const step = (dl) => { while (difQ.length && dl.timeRemaining() > 3) { const el = difQ.shift(), id = el.dataset.dif; if (!el.isConnected) continue; let E = difs.get(id); if (!E) { const g = (D.cards || {})[id], sp = g && (g.s || g.spec); try { E = sp ? estimate(clampSpec({ ...sp })) : null; } catch { E = null; } difs.set(id, E); } paintDif(el, E); } if (difQ.length) idle(step); else difBusy = false; };
      idle(step); }
  }
  function paintDif(el, E) { el.classList.add("on"); if (!E) { el.remove(); return; } const p = Math.round(E.clear * 100); el.innerHTML = `<i class="st" title="${esc(T("Difficulty"))}">${"★".repeat(E.stars)}<b>${"★".repeat(5 - E.stars)}</b></i><i class="cl" title="${esc(T("Test players clear {n}%", { n: p }))}"><em style="width:${p}%"></em></i><small>${p}%</small>`; }

  // ---- a card plays its level: the mouse over it (0.3 s), a finger held on it ----
  let P = null, pLoad = null, liveEl = null, hT = 0, held = false;
  const prev = () => (P ? Promise.resolve(P) : pLoad || (pLoad = Promise.all([import("./world-kit.js"), import("./world-studio-prev.js")]).then(([K, M]) => (P = M.makePreview({ THREE: K.THREE, w: 400, h: 229, ver: c.ver, low: true }))).catch(() => null)));
  async function live(card) {
    if (lite) return; const id = card.dataset.gsheet, g = (D.cards || {})[id], sp = g && (g.s || g.spec); if (!sp) return;
    const p = await prev(); if (!p || !card.matches(":hover") && !held) return; still(); liveEl = card; const box = card.querySelector(".sgh-gart"); if (!box) return;
    p.canvas.className = "sgh-cvlive"; box.appendChild(p.canvas); card.classList.add("live"); try { p.set(clampSpec({ ...sp })); } catch { still(); }
  }
  function still() { if (!liveEl) return; liveEl.classList.remove("live"); liveEl = null; if (P) { P.stop(); if (P.canvas.parentNode) P.canvas.remove(); } }
  function bindPreview(root) {
    root.addEventListener("pointerover", (e) => { if (e.pointerType !== "mouse") return; const cd = e.target.closest && e.target.closest(".sgh-gc[data-gsheet]"); if (!cd || cd === liveEl) return; clearTimeout(hT); hT = setTimeout(() => live(cd), 300); });
    root.addEventListener("pointerout", (e) => { if (e.pointerType !== "mouse") return; const cd = e.target.closest && e.target.closest(".sgh-gc[data-gsheet]"); if (cd && (!e.relatedTarget || !cd.contains(e.relatedTarget))) { clearTimeout(hT); if (cd === liveEl) still(); } });
    root.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; const cd = e.target.closest && e.target.closest(".sgh-gc[data-gsheet]"); clearTimeout(hT); if (!cd) return; const x0 = e.clientX, y0 = e.clientY; hT = setTimeout(() => { held = true; live(cd); }, 380); const mv = (m) => { if (Math.hypot(m.clientX - x0, m.clientY - y0) > 12) { clearTimeout(hT); root.removeEventListener("pointermove", mv); } }; root.addEventListener("pointermove", mv); });
    root.addEventListener("pointerup", () => clearTimeout(hT));
    root.addEventListener("click", (e) => { if (held) { held = false; e.stopPropagation(); e.preventDefault(); setTimeout(still, 2600); } }, true); // (the hold showed it: lifting the finger isn't a tap)
  }

  // ---- the home's wall of art follows the mouse / the phone's tilt ----
  let tx = 0, ty = 0, px = 0, py = 0, raf = 0, wall = null;
  const loop = () => { raf = 0; if (!wall || !wall.isConnected || document.hidden) return; px += (tx - px) * 0.07; py += (ty - py) * 0.07; wall.style.setProperty("--px", px.toFixed(2) + "px"); wall.style.setProperty("--py", py.toFixed(2) + "px"); if (Math.abs(tx - px) + Math.abs(ty - py) > 0.05) raf = requestAnimationFrame(loop); };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  addEventListener("pointermove", (e) => { if (!wall || e.pointerType !== "mouse") return; tx = (e.clientX / innerWidth - 0.5) * -36; ty = (e.clientY / innerHeight - 0.5) * -24; kick(); }, { passive: true });
  if (coarse && !lite && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== "function") addEventListener("deviceorientation", (e) => { if (!wall || e.gamma == null) return; tx = Math.max(-1, Math.min(1, e.gamma / 30)) * -22; ty = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 30)) * -16; kick(); }, { passive: true });

  // ---- "playing now", kept fresh on the home (every 30 s while you look) ----
  let liveT = 0;
  function liveCount(root) {
    clearInterval(liveT); if (c.page() !== "home") return;
    liveT = setInterval(async () => { if (c.page() !== "home" || document.hidden || !root.isConnected || c.hidden()) return; c.forget(/^arcade$/); const A = await c.arcade(), n = A.reduce((a, g) => a + (g.now || 0), 0), b = root.querySelector('[data-fill="live"] span:last-child b');
      if (b && String(n) !== b.textContent) { b.textContent = c.num(n); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); } }, 30e3);
  }

  // ---- milestones: a cut-in the first time one shows (kept per wallet on this device) ----
  async function milestones() {
    const w = c.wallet(); if (!w) return; const m = await c.mine(); if (!m) return; const G = (m.games || []).filter((g) => g.pub), plays = G.reduce((a, g) => a + (g.plays || 0), 0), lv = c.LV(plays, G.reduce((a, g) => a + (g.likes || 0), 0), G.length).lv;
    const k = "arc.hub.ms." + w.slice(2, 10); let was = null; try { was = JSON.parse(LS(k) || "null"); } catch { was = null; } LS(k, JSON.stringify({ pub: G.length, plays, lv }));
    if (!was) return; let cut = null;
    if (!was.pub && G.length) cut = { i: "rocket", t: "Your first game is live!", p: "It's in the Creator Arcade and in ARCIRCLE WORLD now. Share the link and get your first players." };
    else if (was.plays < 1000 && plays >= 1000) cut = { i: "trophy", t: "1,000 plays!", p: "Others have played your games a thousand times." };
    else if (was.plays < 100 && plays >= 100) cut = { i: "play", t: "100 plays!", p: "Others have played your games a hundred times." };
    else if (lv > was.lv) cut = { i: "star", t: T("Creator Lv {n}!", { n: lv }), p: "Plays, likes and games raised your creator level." };
    if (cut) cutIn(cut);
  }
  async function cutIn(x) {
    const h = await c.handle(), url = location.origin + (h ? "/game/@" + h : "/studio"), el = document.createElement("div"); el.className = "sgx-cut";
    el.innerHTML = `<div class="sgx-cutin" role="dialog" aria-label="${esc(T(x.t))}"><i class="rays"></i><span class="emb">${ic(x.i)}</span><small>${esc(T("Milestone"))}</small><h2>${esc(T(x.t))}</h2><p>${esc(T(x.p))}</p><div class="sgh-cta"><button type="button" class="sgh-btn pri" data-cs>${ic("ext", "sm")} ${esc(T("Share"))}</button><button type="button" class="sgh-btn" data-cx>${esc(T("Close"))}</button></div>${Array.from({ length: 18 }, (_, i) => `<b class="cf" style="--a:${i * 20}deg;--d:${(i % 6) * 60}ms;--h:${(i * 47) % 360}"></b>`).join("")}</div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on"));
    const x2 = () => { el.classList.remove("on"); setTimeout(() => el.remove(), 300); };
    el.addEventListener("click", async (e) => { if (e.target === el || e.target.closest("[data-cx]")) return x2(); if (e.target.closest("[data-cs]")) { const text = `${T(x.t)} — ARCIRCLE Studio`; if (navigator.share) { try { await navigator.share({ text, url }); } catch { /* closed */ } } else { try { await navigator.clipboard.writeText(text + "\n" + url); c.toast("🔗 " + esc(T("Link copied"))); } catch { c.toast(esc(url)); } } } });
  }

  let bound = false;
  function after(root) {
    if (!bound) { bound = true; bindPreview(root); }
    decorate(root); wall = root.querySelector(".sgh-mosaic"); if (wall && !lite) kick(); liveCount(root);
  }
  function hide() { still(); clearInterval(liveT); if (P) { try { P.dispose(); } catch { /* gone */ } P = null; pLoad = null; } }
  return { themeBtn, toggle, badges, difRow, after, hide, milestones, cutIn, lite };
}
