// world-agarena.js — the Agent Arena (AD-City 4, the owner's "응 다 진행하자" 2026-10-24): quiz duels in Nexus City's
// arena with your agent at your side. 7 questions, 15 s each, the agent's 50 : 50 once a run; the server deals them and
// marks them at the end (api/_world-agarena.mjs), so the page learns what was right only on the result card. The arena
// hour (12:00 and 21:00 Seoul) counts twice; the week's board. No ARCL here.
// ctx: { T, esc, toast, sess, post, signIn, agent: () => ({ name, kind }) | null, Snd, reduce, onOpen, onClose }
const PORTRAIT = (k) => `/images/agents/${k}-400.webp?v=2`;
const COL = { aurora: "#5fd3ff", orion: "#ffc861", vex: "#b48cff" };
const CHEER = ["Locked in!", "Good call.", "Next one!", "Keep going!", "Stay sharp."];

export function createAgArena(ctx) {
  const { T, esc } = ctx;
  let el = null, run = null, top = null, busy = false, timer = 0;
  async function act(body) {
    if (!ctx.sess()) { try { await ctx.signIn(); } catch { return null; } }
    const s = ctx.sess(); if (!s) return null;
    try { return await ctx.post({ ...body, wallet: s.wallet, issued: s.issued, signature: s.signature }); } catch { return { ok: false, j: { error: T("No connection — try again") } }; }
  }
  const fail = (r) => { const e = r && r.j && r.j.error; ctx.toast(e ? (r.j.closed ? "🚧 " + esc(T("Being built")) : esc(e)) : esc(T("Couldn't open it — try again"))); };
  const left = (ms) => { const m = Math.max(1, Math.ceil(ms / 6e4)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
  const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  async function loadTop() { try { const r = await fetch("/api/social?world=agarena-top", { cache: "no-store" }); if (r.ok) top = await r.json(); } catch { /* the next look */ } }

  function open() {
    if (!el) { el = document.createElement("div"); el.className = "adc-card aga"; el.setAttribute("role", "dialog"); el.addEventListener("click", onClick); document.body.appendChild(el); }
    el.hidden = false; run = null; if (ctx.onOpen) ctx.onOpen(); paintLobby(); loadTop().then(() => { if (!run && el && !el.hidden) paintLobby(); });
  }
  function close() { clearInterval(timer); if (el) el.hidden = true; run = null; if (ctx.onClose) ctx.onClose(); }
  const shown = () => !!(el && !el.hidden);
  const head = (sub) => `<button type="button" class="aga-x" data-x aria-label="${esc(T("Close"))}">×</button><small>${esc(T("Nexus City"))}</small><h3><span aria-hidden="true">🏟️</span> ${esc(T("Agent Arena"))}</h3>${sub ? `<p class="aga-sub">${sub}</p>` : ""}`;

  function paintLobby() {
    const a = ctx.agent(), h = top && top.hour, col = COL[a && a.kind] || "#ff6fae";
    const hour = h ? (h.on ? `<b class="aga-hour on">🔥 ${esc(T("Arena hour now · points ×2"))} <em>${esc(left(h.end - Date.now()))}</em></b>` : `<b class="aga-hour">⏰ ${esc(T("Next arena hour {t}", { t: hhmm(h.at) }))} <em>${esc(left(h.at - Date.now()))}</em></b>`) : "";
    const list = top && top.top && top.top.length ? `<ol class="aga-top">${top.top.slice(0, 10).map((x, i) => `<li><i>${i + 1}</i><img src="${PORTRAIT(x.kind || "aurora")}" alt="" loading="lazy"><span><b>${esc(x.agent || "—")}</b><small>${esc(x.name || "")}</small></span><em>${x.pts.toLocaleString()}</em></li>`).join("")}</ol>` : `<p class="aga-empty">${esc(T("Be the first on this week's board!"))}</p>`;
    el.innerHTML = `<div class="adc-in aga-in" style="--ac:#ff6fae">${head(esc(T("Answer 7 questions with your agent. Fast and right scores the most.")))}
      ${a ? `<div class="aga-me" style="--c:${col}"><img src="${PORTRAIT(a.kind)}" alt=""><span><b>${esc(a.name)}</b><small>${esc(T("Your agent helps once a run: 50 : 50"))}</small></span></div>` : `<p class="aga-note">${esc(T("Make your agent in the Genesis Lab first"))}</p>`}
      ${hour}
      <button type="button" class="aga-go" data-start ${a ? "" : "disabled"}>▶ ${esc(T("Start a run"))}</button>
      <p class="aga-fine">${esc(T("{n} runs a day · 15 s a question · no ARCL, points for the week's board", { n: (top && top.runs) || 3 }))}</p>
      <h4>🏆 ${esc(T("This week's sharpest agents"))}</h4>${list}</div>`;
  }

  async function start() {
    if (busy) return; busy = true; const r = await act({ action: "world-agarena-start" }); busy = false;
    if (!r) return; if (!r.ok) return fail(r);
    run = { ...r.j, i: 0, picks: [], ms: [], cut: null, helped: false, t0: 0 }; try { if (ctx.Snd && ctx.Snd.click) ctx.Snd.click(); } catch { /* no sound */ }
    paintQ();
  }
  function paintQ() {
    clearInterval(timer); const q = run.qs[run.i], a = run.agent || ctx.agent() || { name: "", kind: "aurora" }, n = run.qs.length;
    el.innerHTML = `<div class="adc-in aga-in aga-q" style="--ac:${COL[a.kind] || "#ff6fae"}">
      <div class="aga-dots">${run.qs.map((_, j) => `<i class="${j < run.i ? "done" : j === run.i ? "now" : ""}"></i>`).join("")}${run.hour ? `<b class="aga-x2">×2</b>` : ""}</div>
      <small>${esc(T("Question {i} of {n}", { i: run.i + 1, n }))}</small><h3 class="aga-qt">${esc(T(q.q))}</h3>
      <i class="aga-time"><em></em></i>
      <div class="aga-opts">${q.opts.map((o, j) => `<button type="button" data-pick="${j}" ${run.cut != null && run.cut.q === run.i && run.cut.j === j ? "disabled class=\"cut\"" : ""}><i>${"ABC"[j]}</i><span>${esc(T(o))}</span></button>`).join("")}</div>
      <div class="aga-agent"><img src="${PORTRAIT(a.kind)}" alt=""><p class="aga-say">${esc(run.say || T("I'm with you — pick the safe answer."))}</p>
        <button type="button" data-help ${run.helped ? "disabled" : ""}>🤖 ${esc(T("{name}: 50 : 50", { name: a.name }))}</button></div></div>`;
    run.t0 = performance.now(); const bar = el.querySelector(".aga-time em"), S = run.secs * 1000;
    timer = setInterval(() => { const k = (performance.now() - run.t0) / S; if (bar) { bar.style.width = Math.max(0, 100 - k * 100) + "%"; bar.classList.toggle("low", k > 0.7); } if (k >= 1) pick(-1); }, 100);
  }
  function pick(j) {
    if (!run || run.picks.length > run.i) return; clearInterval(timer);
    run.picks.push(j); run.ms.push(Math.round(performance.now() - run.t0));
    const b = el.querySelector(`[data-pick="${j}"]`); if (b) b.classList.add("on"); el.querySelectorAll("[data-pick]").forEach((x) => { x.disabled = true; });
    run.say = j < 0 ? T("Time's up — next one!") : T(CHEER[run.i % CHEER.length]); try { if (ctx.Snd && ctx.Snd.click) ctx.Snd.click(); } catch { /* no sound */ }
    setTimeout(() => { if (!run) return; run.i++; if (run.i < run.qs.length) paintQ(); else finish(); }, ctx.reduce ? 200 : 520);
  }
  async function help() {
    if (!run || run.helped || busy) return; busy = true; const r = await act({ action: "world-agarena-help", q: run.i }); busy = false;
    if (!r || !r.ok) return r && fail(r);
    run.helped = true; run.cut = { q: run.i, j: r.j.cut }; run.say = T("That one's wrong — I'd skip it.");
    const b = el.querySelector(`[data-pick="${r.j.cut}"]`); if (b) { b.disabled = true; b.classList.add("cut"); }
    const hb = el.querySelector("[data-help]"); if (hb) hb.disabled = true; const s = el.querySelector(".aga-say"); if (s) s.textContent = run.say;
  }
  async function finish() {
    el.innerHTML = `<div class="adc-in aga-in" style="--ac:#ff6fae">${head("")}<p class="aga-empty">${esc(T("Marking your answers…"))}</p></div>`;
    const r = await act({ action: "world-agarena-end", picks: run.picks, ms: run.ms }); const R = run; run = null;
    if (!r || !r.ok) { fail(r); paintLobby(); return; }
    const j = r.j, a = R.agent || ctx.agent() || { name: "", kind: "aurora" };
    const word = j.perfect ? T("Perfect run!") : j.correct >= 5 ? T("Sharp!") : j.correct >= 3 ? T("Not bad!") : T("We'll get them next time.");
    el.innerHTML = `<div class="adc-in aga-in aga-res" style="--ac:${COL[a.kind] || "#ff6fae"}">${head("")}
      <div class="aga-agent big"><img src="${PORTRAIT(a.kind)}" alt=""><p class="aga-say">${esc(word)}</p></div>
      <b class="aga-score">${j.pts.toLocaleString()}</b><p class="aga-sub">${esc(T("{c} of {n} right", { c: j.correct, n: R.qs.length }))}${j.hour ? " · 🔥 ×2" : ""}${j.perfect ? " · ✨ " + esc(T("Perfect")) : ""}</p>
      ${j.week && j.week.rank ? `<p class="aga-rank">🏆 ${esc(T("This week: #{r} · {p} points", { r: j.week.rank, p: j.week.pts.toLocaleString() }))}</p>` : ""}
      <ol class="aga-rev">${R.qs.map((q, i) => { const ok = R.picks[i] === j.right[i]; return `<li class="${ok ? "ok" : "no"}"><i>${ok ? "✓" : "✗"}</i><span><b>${esc(T(q.q))}</b><small>${esc(T(q.opts[j.right[i]]))}</small></span></li>`; }).join("")}</ol>
      <span class="aga-row"><button type="button" class="aga-go" data-start>↻ ${esc(T("Another run"))}</button><button type="button" data-lobby>${esc(T("Board"))}</button></span></div>`;
    if (!ctx.reduce && j.correct >= 5) burst(el);
    loadTop();
  }
  function burst(box) { if (!box) return; const cols = ["#ff6fae", "#ffd23a", "#7cf5c8", "#5fd3ff"]; for (let i = 0; i < 28; i++) { const p = document.createElement("i"); p.className = "aga-conf"; p.style.cssText = `left:${(i * 37) % 100}%;background:${cols[i % 4]};animation-delay:${(i % 7) * 0.05}s;--dx:${((i * 53) % 90) - 45}px`; box.appendChild(p); setTimeout(() => p.remove(), 2200); } }
  async function onClick(e) {
    const b = e.target.closest("button"); if (!b) { if (e.target === el && !run) close(); return; } if (b.disabled) return;
    if (b.hasAttribute("data-x")) return close();
    if (b.hasAttribute("data-start")) return start();
    if (b.hasAttribute("data-lobby")) { paintLobby(); return; }
    if (b.dataset.pick != null) return pick(Number(b.dataset.pick));
    if (b.hasAttribute("data-help")) return help();
  }
  return { open, close, shown, playing: () => run, pick, help };
}
