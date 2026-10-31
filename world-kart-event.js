// world-kart-event.js — the ARCIRCLE KART GRAND OPENING EVENT's screens (2026-10-31, the owner's rules: 3 days · 3 events;
// the numbers in world-kart-event-data.js KEV, the server in api/_world-kartevent.mjs). Loaded by world-play.js while the
// event runs (the popup on every visit) or when its window is opened (the popup, the 🏁 EVENT chip on KART's pick screen,
// Menu → KART Grand Opening, the GM Team tab).
//   popup()      on top of everything (z-index 13000, like the AD launch card it replaced): the owner's event poster (it
//                carries the three events and their rewards), the countdown, the window in five zones, See the events /
//                Later; only between START and END
//   open(tab, k) the event window: a live countdown to the end (and the window in five time zones), the three events with
//                your progress (races n/10, your Magma Run best + place, your clip), Race now / Time Attack on Magma Run /
//                Submit clip, the rules in short lines, the championship's board (top 50 + your place). Only the tally: the
//                GMs pay the prizes by hand after the event (?world=kart-event-gm).
// ctx: { T, lang, esc, toast, sess, post, Snd, openKart({ mode, track }), signIn(), ver, hold() → release }
import { KEV, kevPhase, taPrize, clipOf, TA_TOTAL, kevTimes } from "./world-kart-event-data.js";

const IMG = "/images/kart/event/";
const fmtN = (n) => Math.floor(n || 0).toLocaleString("en-US");
const fmtT = (s) => { if (!(s > 0)) return "—"; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? "0" : ""}${r.toFixed(2)}`; };
const pad2 = (n) => String(n).padStart(2, "0");
/// a countdown: "2d 03:14:09"
export const leftOf = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return `${d ? d + "d " : ""}${pad2(h)}:${pad2(m)}:${pad2(s % 60)}`; };

export function createKartEvent(ctx) {
  const { T, esc } = ctx, Snd = ctx.Snd || {};
  let el = null, tab = "events", data = null, board = null, tick = 0, release = null, busy = false, focusK = "";
  const toast = (s) => { try { ctx.toast(s); } catch { /* fine */ } };
  const me = () => { const s = ctx.sess && ctx.sess(); return s && s.wallet ? String(s.wallet).toLowerCase() : ""; };
  const get = async (q) => { try { const r = await fetch("/api/social?world=" + q, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; } };
  const act = async (body) => { const s = ctx.sess && ctx.sess(); if (!s) return { ok: false, status: 401, j: { error: T("Connect your wallet first") } }; try { return await ctx.post({ ...body, ...s }); } catch (e) { return { ok: false, status: 0, j: { error: String((e && e.message) || e) } }; } };
  const when = (t) => { try { return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const icon = (k, e) => `<span class="kev-ic"><img src="${IMG}icon-${k}.webp${ctx.ver || ""}" alt="" width="96" height="96" loading="lazy" onerror="this.remove()"><i aria-hidden="true">${e}</i></span>`;
  const phase = () => kevPhase(Date.now());
  /// START → END in the reader's own zone first, then ET · PT · KST · CST · TRT (Intl with each zone: DST-safe)
  const whenHtml = () => { let w = null; try { w = kevTimes(ctx.lang || "en"); } catch { return ""; } return `<p class="kev-when">${w.main.map((x) => `<b>${esc(x)}</b>`).join("")}<small>${esc(w.rest)}</small></p>`; };

  // ---------------- the popup ----------------
  function popup() {
    if (phase() !== "on" || document.querySelector(".kev-pop")) return false;
    const p = document.createElement("div"); p.className = "kev-pop"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", T("ARCIRCLE KART Grand Opening Event")); p.setAttribute("data-no-i18n", "");
    p.innerHTML = `<div class="kev-pop-in"><button type="button" class="kev-pop-x" data-later aria-label="${esc(T("Close"))}">×</button>
      <button type="button" class="kev-pop-art" data-k="races"><img src="${IMG}poster-800.webp${ctx.ver || ""}" srcset="${IMG}poster-800.webp${ctx.ver || ""} 800w, ${IMG}poster-1600.webp${ctx.ver || ""} 1600w" sizes="(max-width: 700px) 92vw, 540px" width="800" height="727" alt="${esc(T("ARCIRCLE KART Grand Opening Event"))}"></button>
      <i class="kev-conf" aria-hidden="true"></i><h3>🏁 ${esc(T("ARCIRCLE KART GRAND OPENING"))}</h3><p class="kev-pop-sub">${esc(T("3 days · 3 events"))} · <b data-left>${esc(leftOf(KEV.END - Date.now()))}</b> ${esc(T("left"))}</p>${whenHtml()}
      <span class="kev-pop-b"><button type="button" class="kev-pop-go" data-k="races">🏎️ ${esc(T("See the events"))}</button><button type="button" class="kev-pop-later" data-later>${esc(T("Later"))}</button></span></div>`;
    const rel = ctx.hold ? ctx.hold() : null; document.body.appendChild(p); try { if (Snd.click) Snd.click(); } catch { /* no sound */ }
    const iv = setInterval(() => { const b = p.querySelector("[data-left]"); if (!p.isConnected) return clearInterval(iv); if (b) b.textContent = leftOf(KEV.END - Date.now()); }, 1000);
    const close = (next) => { clearInterval(iv); p.classList.add("out"); setTimeout(() => p.remove(), 200); if (next) next(); else if (rel) rel(); };
    p.addEventListener("click", (e) => { if (e.target === p || e.target.closest("[data-later]")) return close(); const b = e.target.closest("[data-k]"); if (b) close(() => { if (rel) rel(); open("events", b.dataset.k); }); });
    return true;
  }

  // ---------------- the window ----------------
  function build() {
    el = document.createElement("div"); el.className = "kev"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", T("ARCIRCLE KART Grand Opening Event")); el.setAttribute("data-no-i18n", "");
    el.innerHTML = `<div class="kev-in"><header class="kev-hd"><picture><source media="(max-width: 700px)" srcset="${IMG}key-wide-800.webp${ctx.ver || ""}"><img src="${IMG}key-wide.webp${ctx.ver || ""}" alt="" width="1344" height="768"></picture><div><small>ARCIRCLE KART</small><h2>${esc(T("GRAND OPENING EVENT"))}</h2><p class="kev-cd" aria-live="off"></p>${whenHtml()}</div><button type="button" class="kev-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
      <nav class="kev-tabs" role="tablist"></nav><div class="kev-body"></div></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", onClick);
    addEventListener("keydown", (e) => { if (e.key === "Escape" && el && !el.hidden && !document.querySelector(".wak,.kev-gh")) { e.stopPropagation(); close(); } }, true);
  }
  async function open(t, k) {
    if (!el) build(); if (t) tab = t; focusK = k || "";
    if (el.hidden) { release = ctx.hold ? ctx.hold() : null; el.hidden = false; requestAnimationFrame(() => el && el.classList.add("on")); }
    paint(); clearInterval(tick); tick = setInterval(paintCd, 1000); paintCd();
    await load(); paint();
    if (focusK) { const c = el.querySelector(`[data-card="${focusK}"]`); if (c) { c.scrollIntoView({ block: "center", behavior: "smooth" }); c.classList.add("hi"); setTimeout(() => c.classList.remove("hi"), 1800); } focusK = ""; }
  }
  function close() { if (!el || el.hidden) return; el.classList.remove("on"); el.hidden = true; clearInterval(tick); const r = release; release = null; if (r) r(); }
  async function load() {
    const w = me();
    const jobs = [get("kart-event" + (w ? "&wallet=" + w : "")).then((j) => { data = j; }), get("kart-event-ta" + (w ? "&wallet=" + w : "")).then((j) => { board = j; })];
    await Promise.all(jobs);
  }
  function paintCd() {
    if (!el || el.hidden) return; const cd = el.querySelector(".kev-cd"), now = Date.now(), ph = kevPhase(now);
    if (cd) cd.innerHTML = ph === "soon" ? `${esc(T("Starts in"))} <b>${esc(leftOf(KEV.START - now))}</b>` : ph === "on" ? `${esc(T("Ends in"))} <b>${esc(leftOf(KEV.END - now))}</b>` : `<b>${esc(T("The event is over"))}</b> · ${esc(T("Rewards are paid after review"))}`;
  }
  function paint() {
    if (!el) return;
    el.querySelector(".kev-tabs").innerHTML = [["events", T("Events")], ["board", T("Magma Run board")]].map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" class="${tab === k ? "on" : ""}" aria-selected="${tab === k}">${esc(n)}</button>`).join("");
    const B = el.querySelector(".kev-body");
    if (tab === "board") B.innerHTML = boardHtml(true);
    else B.innerHTML = eventsHtml();
  }
  function eventsHtml() {
    const d = data || {}, w = me(), ph = d.phase || phase(), on = ph === "on", R = d.races || { n: 0, need: KEV.RACES.need }, ta = d.ta, c = d.clip;
    const signHint = w ? "" : `<p class="kev-sign"><button type="button" data-signin>🔑 ${esc(T("Sign in to take part"))}</button></p>`;
    const n = Math.min(R.n || 0, KEV.RACES.need), pct = Math.round((n / KEV.RACES.need) * 100);
    const races = `<section class="kev-card" data-card="races"><div class="kev-ch">${icon("flag", "🏁")}<div><small>EVENT 01</small><h3>${esc(T("KART RACE CHALLENGE"))}</h3><p>${esc(T("Finish 10 races (Race or Daily) during the event → 50,000 ARCL."))}</p></div></div>
      ${w ? `<div class="kev-prog"><i style="width:${pct}%"></i><b>${n}/${KEV.RACES.need}</b></div><p class="kev-st">${n >= KEV.RACES.need ? "🎉 " + esc(T("Done! Reward paid after the event, after review")) : esc(T("Reward paid after the event, after review"))}</p>` : ""}
      ${on ? `<button type="button" class="kev-go" data-race>🏎️ ${esc(T("Race now"))}</button>` : ""}</section>`;
    const prizes = `<ol class="kev-prz"><li><b>1</b>${fmtN(taPrize(1))}</li><li><b>2</b>${fmtN(taPrize(2))}</li><li><b>3</b>${fmtN(taPrize(3))}</li><li><b>4–5</b>${fmtN(taPrize(4))}</li><li><b>6–10</b>${fmtN(taPrize(6))}</li></ol>`;
    const taC = `<section class="kev-card" data-card="ta"><div class="kev-ch">${icon("stopwatch", "⏱️")}<div><small>EVENT 02</small><h3>${esc(T("TIME ATTACK CHAMPIONSHIP"))}</h3><p>${esc(T("Magma Run · Time Attack · the best total time wins. Ties go to whoever set it first."))}</p></div></div>
      ${prizes}<p class="kev-note">${esc(T("ARCL by place · {n} ARCL in all", { n: fmtN(TA_TOTAL) }))}</p>
      ${w ? `<p class="kev-st">${ta ? `🏁 ${esc(T("Your best"))} <b>${esc(fmtT(ta.t))}</b> · ${esc(T("Place"))} <b>#${ta.rank}</b>` : esc(T("No time yet — race Magma Run in Time Attack"))}</p>` : ""}
      ${boardHtml(false)}
      <div class="kev-bb">${on ? `<button type="button" class="kev-go" data-ta>⏱️ ${esc(T("Time Attack on Magma Run"))}</button>` : ""}<button type="button" class="kev-out" data-tab="board">${esc(T("Full board"))}</button></div></section>`;
    const clipC = `<section class="kev-card" data-card="clip"><div class="kev-ch">${icon("clip", "🎬")}<div><small>EVENT 03</small><h3>${esc(T("KART CLIP CONTEST"))}</h3><p>${esc(T("60 USDC pool: 1st 30 · 2nd 20 · 3rd 10 USDC"))}</p></div></div>
      <ol class="kev-steps"><li>${esc(T("Record 15–60 s of real KART gameplay."))}</li><li>${esc(T("Post it on X tagging {tag} with the game link {u}", { tag: KEV.CLIP.tag, u: "arcircle.app/game" }))}</li><li>${esc(T("Paste your X post's link here — one per player, editable until the end."))}</li></ol>
      ${w ? (on ? `<div class="kev-form"><input type="url" inputmode="url" class="kev-url" placeholder="https://x.com/you/status/…" value="${esc((c && c.url) || "")}" aria-label="${esc(T("Your X post's link"))}"><button type="button" class="kev-go" data-clip>${esc(c ? T("Update") : T("Submit clip"))}</button></div>${c ? `<p class="kev-st">✅ ${esc(T("Submitted"))}: <a href="${esc(c.url)}" target="_blank" rel="noopener">@${esc(c.user)}</a> · ${esc(when(c.at))}</p>` : ""}` : c ? `<p class="kev-st">${esc(T("Your clip"))}: <a href="${esc(c.url)}" target="_blank" rel="noopener">@${esc(c.user)}</a></p>` : "") : ""}
      <button type="button" class="kev-out" data-copy>📋 ${esc(T("Copy the post text"))}</button></section>`;
    const rules = `<section class="kev-rules"><h4>${esc(T("Rules"))}</h4><ul><li>${esc(T("Rewards are paid after the event, after review."))}</li><li>${esc(T("Signed-in wallets only; races count when the server accepts them."))}</li><li>${esc(T("Time Attack doesn't count toward the 10 races."))}</li><li>${esc(T("Times are checked on the server; the top 10's runs are kept for review."))}</li><li>${esc(T("Clips must be real gameplay, 15–60 s, on X with {tag}.", { tag: KEV.CLIP.tag }))}</li></ul></section>`;
    return signHint + races + taC + clipC + rules;
  }
  function boardHtml(full) {
    const top = (board && board.top) || [], mine = board && board.me, list = full ? top : top.slice(0, 5);
    if (!board) return `<p class="kev-load">…</p>`;
    return `${full ? `<h3 class="kev-bh">⏱️ ${esc(T("Magma Run · Time Attack"))}</h3>` : ""}${list.length ? `<ol class="kev-board">${list.map((x, i) => `<li class="${mine && mine.rank === i + 1 ? "me" : ""}${i < 10 ? " paid" : ""}"><b>${i + 1}</b>${x.racer ? `<img src="/images/kart/card-${esc(x.racer)}.webp" alt="" width="22" height="28">` : ""}<span>${esc(x.name || x.w)}</span><i>${esc(fmtT(x.t))}</i>${full && i < 10 ? `<em>${fmtN(taPrize(i + 1))}</em>` : ""}</li>`).join("")}</ol>` : `<p class="kev-note">${esc(T("Be the first on the board!"))}</p>`}${mine && (full || mine.rank > 5) ? `<p class="kev-st">${esc(T("Your place: {n}", { n: "#" + mine.rank }))} · ${esc(fmtT(mine.t))}</p>` : ""}`;
  }
  // ---------------- actions ----------------
  async function onClick(e) {
    if (e.target === el || e.target.closest("[data-x]")) return close();
    const b = e.target.closest("button"); if (!b || busy) return;
    if (b.dataset.tab) { tab = b.dataset.tab; if (Snd.tab) Snd.tab(); paint(); if (tab === "board") { board = await get("kart-event-ta" + (me() ? "&wallet=" + me() : "")); paint(); } return; }
    if (b.dataset.signin != null) { close(); try { if (ctx.signIn) await ctx.signIn(); } catch { /* the wallet button is there too */ } return; }
    if (b.dataset.race != null) { close(); ctx.openKart({ mode: "race" }); return; }
    if (b.dataset.ta != null) { close(); ctx.openKart({ mode: "ta", track: KEV.TA.track }); return; }
    if (b.dataset.copy != null) { const txt = T("My ARCIRCLE KART run 🏎️ {tag} #ARCIRCLE #ARCIRCLEKART", { tag: KEV.CLIP.tag }) + " " + KEV.LINK; try { await navigator.clipboard.writeText(txt); toast("📋 " + esc(T("Copied"))); } catch { toast(esc(txt)); } return; }
    busy = true; try {
      if (b.dataset.clip != null) { const v = el.querySelector(".kev-url").value, c = clipOf(v); if (!c) { toast(esc(T("That isn't an X post's link (https://x.com/<name>/status/<number>)"))); return; }
        const r = await act({ action: "world-kev-clip", url: c.url }); if (!r.ok) { toast(esc(String((r.j && r.j.error) || T("Couldn't send it — try again")))); return; }
        toast("🎬 " + esc(T("Clip submitted!"))); if (Snd.coin) Snd.coin(); await load(); paint(); return; }
    } finally { busy = false; }
  }
  return { popup, open, close, isOpen: () => !!(el && !el.hidden) };
}
