// world-agent.js — AGENT DIMENSION in town (AD1): your own AI agent. The Genesis Lab (pick AURORA, ORION or VEX, name
// it, give it a personality), the agent walking at your side (a human-size character: world-kit.js makeAgent), the
// talk window (20 messages a day, the server asks Claude: api/_world-agent.mjs), errands that run while you're away
// (ARCL up front, real time, materials back: Jurassic's pack or the Mine's ore bag) and the report when it's back.
// Loaded by world-play.js a few seconds after the town starts; a guest sees the Lab and is asked to sign in to create.
//
// ctx: { THREE, K, planet, here(v), facing(), ver, inHub(), calm(), T, esc, toast, sess(), post(body), signIn(), purse(), coarse, reduce, burst? }
const PORTRAIT = (k) => `/images/agents/${k}-400.webp`, BIG = (k) => `/images/agents/${k}-800.webp`;
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

export function createAgentDim(ctx) {
  const { THREE, K, planet, here, T, esc } = ctx;
  let st = null, last = 0, el = null, chip = null, tab = "talk", sending = false, pick = null, busy = false, report = null;
  const root = new THREE.Group(); root.name = "pet"; planet.add(root); // (named "pet": the far-cull leaves moving things alone)
  let body = null, bodyKind = "", tag = null, face = 0;
  const me = new THREE.Vector3();
  const wallet = () => { const s = ctx.sess(); return s ? String(s.wallet).toLowerCase() : ""; };
  const left = (ms) => { const all = Math.max(1, Math.ceil(Math.max(0, ms) / 6e4)), h = Math.floor(all / 60), m = all % 60; return h ? (m ? T("{h}h {m}m", { h, m }) : T("{h}h", { h })) : T("{m}m", { m: all }); };
  const lootLine = (o) => Object.entries(o || {}).map(([k, n]) => `${MAT[k] || "•"} ${n} ${esc(T(MAT_N[k] || k))}`).join(" · ");

  async function look() {
    const w = wallet(); if (!w) { st = null; paintChip(); return; }
    try { const r = await fetch("/api/social?world=agent&wallet=" + encodeURIComponent(w), { cache: "no-store" }); if (r.ok) st = await r.json(); } catch { /* the next look */ }
    last = Date.now(); paintChip(); spawn();
    if (el && !el.hidden) paint();
  }
  const A = () => (st && st.agent) || null;
  const away = () => { const a = A(); return !!(a && a.jobs.some((j) => Date.now() < j.end)); };
  const backs = () => { const a = A(); return a ? a.jobs.filter((j) => Date.now() >= j.end) : []; };

  // ---------------- the agent in town ----------------
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
      if (b.play) setTimeout(() => { try { if (body === b) b.play("emote-yes", { once: true }); } catch { /* no clip */ } }, 600);
    } catch (e) { console.warn("agent", e); } finally { busy = false; }
  }
  const shortest = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  let ticks = 0;
  function tick(dt, t) {
    ticks++;
    const on = ctx.inHub(); root.visible = on; if (!on || !body) return;
    here(me); const f = ctx.facing();
    // its place: a step to your right and a little behind (the dinosaur companion keeps your left)
    const x = me.x + Math.cos(f) * 1.7 - Math.sin(f) * 1.1, z = me.z - Math.sin(f) * 1.7 - Math.cos(f) * 1.1, o = body.obj;
    const px = o.position.x, pz = o.position.z, dist = Math.hypot(x - px, z - pz);
    if (dist > 30) o.position.set(x, 0, z); else if (dist > 0.3) { const k = 1 - Math.exp(-dt * (dist > 5 ? 4.5 : 2.4)); o.position.x += (x - px) * k; o.position.z += (z - pz) * k; }
    const sp = Math.hypot(o.position.x - px, o.position.z - pz) / Math.max(1e-3, dt);
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
    if (!a) { txt = "🤖 " + T("Meet your AI agent"); k = "new"; }
    else if (backs().length) { txt = `${ICON[a.kind]} ${T("{n} is back! See what it brought", { n: a.name })}`; k = "back"; }
    else if (away()) { const j = a.jobs.filter((x) => Date.now() < x.end).sort((p, q) => p.end - q.end)[0]; txt = `${ICON[a.kind]} ${a.name} · ${T(st.jobs[j.job] ? st.jobs[j.job].name : j.job)} · ${left(j.end - Date.now())}`; k = "away"; }
    else { txt = `${ICON[a.kind]} ${T("Talk to {n}", { n: a.name })}`; k = "here"; }
    chip.hidden = !calm; chip.textContent = txt; chip.className = "wag-chip " + k + " " + (a ? a.kind : "");
  }

  // ---------------- the window ----------------
  function shell() {
    if (el) return el;
    el = document.createElement("div"); el.className = "wag"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
    document.body.appendChild(el);
    el.addEventListener("click", onClick); el.addEventListener("input", (e) => { if (e.target.matches(".wag-id")) idInput(e.target); }); el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".wag-in")) { e.preventDefault(); send(); } if (e.key === "Escape") { e.stopPropagation(); close(); } });
    return el;
  }
  function open(t) {
    shell(); if (t) tab = t; report = null; view = ""; el.hidden = false; paint(); if (Date.now() - last > 15e3) look();
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
  function paint() {
    const a = A();
    if (!a) return paintLab();
    if (!view) view = a.kind;
    const C = K.AGENTS[a.kind], tabs = [["talk", "💬", "Talk"], ["jobs", "📋", "Errands"], ["me", "🤖", "Agent"]];
    const head = `<header class="wag-h"><div class="wag-nm"><h2>${esc(a.name)}</h2><b class="wag-lv">${esc(T("Lv {n}", { n: a.lv }))}</b></div>
      ${a.id ? `<p class="wag-at">@${esc(a.id)}</p>` : ""}<p class="wag-role">${esc(T(ROLE[a.kind]))}</p><q class="wag-quote">${esc(T(LINE[a.kind]))}</q><i class="wag-heart" aria-hidden="true">${ICON[a.kind]}</i>
      <button type="button" class="wag-x" data-x aria-label="${esc(T("Close"))}">×</button></header>`;
    const tb = `<nav class="wag-tabs">${tabs.map(([id, ic, l]) => `<button type="button" data-tab="${id}" class="${tab === id ? "on" : ""}"><span aria-hidden="true">${ic}</span>${esc(T(l))}${id === "jobs" && backs().length ? ' <i class="wag-dot"></i>' : ""}</button>`).join("")}</nav>`;
    el.innerHTML = `<div class="wag-card ${a.kind}" style="--ac:${C.color}">${showcase(view, view === a.kind ? undefined : false)}<section class="wag-main">${head}${tb}<div class="wag-body">${report ? paintReport(a) : tab === "talk" ? paintTalk(a) : tab === "jobs" ? paintJobs(a) : paintMe(a)}</div></section></div>`;
    const log = el.querySelector(".wag-log"); if (log) log.scrollTop = log.scrollHeight;
    const inp = el.querySelector(".wag-in"); if (inp && !ctx.coarse) inp.focus({ preventScroll: true });
  }
  function paintLab() {
    const signed = !!wallet(), k = pick || "aurora", C = K.AGENTS[k];
    const form = pick ? `<div class="wag-form"><ul class="wag-does">${DOES[pick].map((d) => `<li>${esc(T(d))}</li>`).join("")}</ul>
      <label>${esc(T("Agent ID"))}<span class="wag-idrow"><b>@</b><input class="wag-id" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(T("e.g. nova_01"))}"></span><small class="wag-idst"></small></label>
      <label>${esc(T("Name"))}<input class="wag-name" maxlength="14" value="${esc(K.AGENTS[pick].name)}"></label>
      <label>${esc(T("Personality"))}<input class="wag-persona" maxlength="160" placeholder="${esc(T("e.g. cheerful, loves dinosaurs"))}"></label>
      <div class="wag-presets">${PRESETS.map((p) => `<button type="button" data-preset="${esc(T(p))}">${esc(T(p))}</button>`).join("")}</div>
      <button type="button" class="wag-go" data-create>${signed ? esc(T("Create my agent — free")) : esc(T("Sign in to create your agent"))}</button><p class="wag-fine">${esc(T("Your agent can't move your funds: anything on-chain will always ask your own wallet first."))}</p></div>`
      : `<div class="wag-picks">${K3.map((x) => `<button type="button" class="wag-pick ${x}" data-pick="${x}" style="--ac:${K.AGENTS[x].color}"><img src="${PORTRAIT(x)}" alt=""><b>${ICON[x]} ${esc(K.AGENTS[x].name)}</b><small>${esc(T(ROLE[x]))}</small></button>`).join("")}</div><p class="wag-fine">${esc(T("Pick one of the three to see what it does."))}</p>`;
    el.innerHTML = `<div class="wag-card lab ${k}" style="--ac:${C.color}">${showcase(k)}<section class="wag-main"><header class="wag-h"><small class="wag-kick">${esc(T("Genesis Lab"))} · ${esc(T("Create your Agent. Give it a Purpose."))}</small>
      <div class="wag-nm"><h2>${esc(C.name)}</h2>${ICON[k] ? `<b class="wag-lv">${ICON[k]}</b>` : ""}</div><p class="wag-role">${esc(T(ROLE[k]))}</p><q class="wag-quote">${esc(T(LINE[k]))}</q>
      <button type="button" class="wag-x" data-x aria-label="${esc(T("Close"))}">×</button></header>
      <div class="wag-body">${st && st.prelaunch !== false ? `<div class="wag-event"><b>🎉 ${esc(T("Pre-launch event"))}</b><span>${esc(T("Create your AI agent for free before AGENT DIMENSION officially opens. After the opening, creating an agent will cost."))}</span></div>` : ""}${form}</div></section></div>`;
  }
  function paintTalk(a) {
    const lines = (a.log || []).flatMap((m) => [`<p class="me">${esc(m.q)}</p>`, `<p class="it">${esc(m.a)}</p>`]);
    const empty = `<p class="it">${esc(T("Hi! I'm {n}. Ask me anything about ARCIRCLE World — or send me on an errand.", { n: a.name }))}</p>`;
    return `<div class="wag-log">${lines.length ? lines.join("") : empty}${sending ? `<p class="it wag-typing"><i></i><i></i><i></i></p>` : ""}</div>
      <div class="wag-asks">${ASK.map((q) => `<button type="button" data-ask="${esc(T(q))}">${esc(T(q))}</button>`).join("")}</div>
      <div class="wag-send"><input class="wag-in" maxlength="280" placeholder="${esc(T("Say something to {n}", { n: a.name }))}" ${a.chatLeft <= 0 || sending ? "disabled" : ""}><button type="button" data-send ${a.chatLeft <= 0 || sending ? "disabled" : ""}>${esc(T("Send"))}</button></div>
      <p class="wag-fine">${esc(T("{n} of {m} messages left today", { n: Math.max(0, a.chatLeft), m: st.chatDay || 20 }))}</p>`;
  }
  function paintJobs(a) {
    const J = st.jobs || {}, now = Date.now(), best = { aurora: "gather", orion: "mine", vex: "scout" }[a.kind];
    const run = a.jobs.map((j) => { const done = now >= j.end, p = Math.min(1, (now - j.start) / Math.max(1, j.end - j.start));
      return `<div class="wag-run${done ? " done" : ""}"><b>${esc(T((J[j.job] || {}).name || j.job))}</b><span>${done ? esc(T("Back!")) : esc(T("{t} left", { t: left(j.end - now) }))}</span><i style="--p:${(p * 100).toFixed(0)}%"></i>${done ? `<button type="button" data-claim="${esc(j.id)}">${esc(T("See what it brought"))}</button>` : ""}</div>`; }).join("");
    const free = a.jobs.length < a.slots && a.jobsLeft > 0;
    const cards = Object.entries(J).map(([id, j]) => `<div class="wag-job${id === best ? " best" : ""}"><div><b>${esc(T(j.name))}</b>${id === best ? `<em>${esc(T("{n}'s specialty +25%", { n: a.name }))}</em>` : ""}<small>${j.loot.map((m) => `${MAT[m] || "•"} ${esc(T(MAT_N[m] || m))}`).join(" · ")}</small><small>⏱ ${esc(left(j.min * 60e3))} · +${j.xp} XP</small></div>
      <button type="button" data-job="${id}" ${free ? "" : "disabled"}><img src="/images/arcl2-64.png" alt="" onerror="this.remove()"> ${j.arcl}</button></div>`).join("");
    return `${run ? `<h3>${esc(T("On the way"))}</h3>${run}` : ""}<h3>${esc(T("Send {n} on an errand", { n: a.name }))}</h3>${cards}
      <p class="wag-fine">${esc(T("Errands cost ARCL and bring back materials, not ARCL. {k} errand slot(s) · {d} errands left today.", { k: a.slots, d: Math.max(0, a.jobsLeft) }))}${a.lv < 5 ? " " + esc(T("A second slot opens at agent level 5.")) : ""}</p>`;
  }
  function paintMe(a) {
    const lv = a.lv, x0 = 10 * (lv - 1) ** 2, x1 = 10 * lv ** 2, p = Math.min(1, (a.xp - x0) / Math.max(1, x1 - x0));
    return `<div class="wag-me"><div class="wag-xp"><b>${esc(T("Lv {n}", { n: lv }))}</b><i style="--p:${(p * 100).toFixed(0)}%"></i><small>${a.xp} / ${x1} XP</small></div>
      <label>${esc(T("Name"))}<input class="wag-name" maxlength="14" value="${esc(a.name)}"></label>
      <label>${esc(T("Personality"))}<input class="wag-persona" maxlength="160" value="${esc(a.persona || "")}" placeholder="${esc(T("e.g. cheerful, loves dinosaurs"))}"></label>
      <button type="button" class="wag-go" data-save>${esc(T("Save"))}</button>
      <h3>${esc(T("What {n} does", { n: a.name }))}</h3><ul class="wag-does">${DOES[a.kind].map((d) => `<li>${esc(T(d))}</li>`).join("")}</ul>
      <h3>${esc(T("Coming next to AGENT DIMENSION"))}</h3><ul class="wag-does soon"><li>${esc(T("Agent Academy: skills and new looks as it levels"))}</li><li>${esc(T("Agent Arena: weekly agent battles"))}</li><li>${esc(T("Web3 tools: token reports, wallet watch, launch drafts — every on-chain step approved in your own wallet"))}</li></ul></div>`;
  }
  function paintReport(a) {
    const r = report, chips = Object.entries(r.loot || {}).map(([k, n]) => `<span>${MAT[k] || "•"} ${n} ${esc(T(MAT_N[k] || k))}</span>`).join("");
    return `<div class="wag-rep"><h3>${esc(T("{n} is back!", { n: a.name }))}</h3><p class="wag-desc">${esc(T(DESC[a.kind]))}</p>
      <div class="wag-chips">${chips || `<span>${esc(T("Nothing this time"))}</span>`}</div>
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
      idState(j.free ? T("@{id} is free", { id: v }) : j.bad ? T("That ID can't be used") : T("@{id} is taken — try another", { id: v }), j.free ? "ok" : "bad"); } catch { /* checked on create */ } }, 450);
  }

  // ---------------- actions ----------------
  const fail = (r, msg) => { ctx.toast((r && r.j && r.j.error) || msg || T("Something went wrong — try again")); };
  async function act(body0) {
    const s = ctx.sess(); if (!s) { try { await ctx.signIn(); } catch { return null; } }
    const s2 = ctx.sess(); if (!s2) return null;
    try { return await ctx.post({ ...body0, wallet: s2.wallet, issued: s2.issued, signature: s2.signature }); } catch { return { ok: false, j: { error: T("No connection — try again") } }; }
  }
  async function create() {
    if (!pick) return; const name = (el.querySelector(".wag-name") || {}).value || "", persona = (el.querySelector(".wag-persona") || {}).value || "", id = idNorm((el.querySelector(".wag-id") || {}).value);
    if (!ID_RE.test(id)) { idState(T("3–16 letters, numbers or _"), "bad"); const f = el.querySelector(".wag-id"); if (f) f.focus(); return; }
    const r = await act({ action: "world-agent-create", kind: pick, id, name, persona }); if (!r) return;
    if (!r.ok && r.j && r.j.taken) { idState(T("@{id} is taken — try another", { id }), "bad"); return; }
    if (!r.ok && !(r.j && r.j.agent)) return fail(r);
    st = { ...(st || {}), agent: r.j.agent }; if (!st.jobs) await look();
    tab = "talk"; paint(); paintChip(); spawn(); if (ctx.burst) ctx.burst(parseInt(K.AGENTS[pick].color.slice(1), 16));
    ctx.toast(T("{n} is online!", { n: r.j.agent.name }));
  }
  async function send(text) {
    const inp = el.querySelector(".wag-in"), t = String(text != null ? text : inp ? inp.value : "").trim(); if (!t || sending) return;
    const a = A(); if (!a || a.chatLeft <= 0) return;
    sending = true; a.log = [...(a.log || []), { q: t, a: "…" }]; paint(); a.log.pop();
    const r = await act({ action: "world-agent-chat", t }); sending = false;
    if (!r || !r.ok) { paint(); return fail(r); }
    a.log = [...(a.log || []), { q: t, a: r.j.reply }].slice(-12); a.chatLeft = r.j.left; paint();
    if (body && body.play && !body.busy()) try { body.play(r.j.offline ? "emote-no" : "emote-yes", { once: true }); } catch { /* no clip */ }
  }
  async function job(id) {
    const r = await act({ action: "world-agent-job", job: id }); if (!r) return;
    if (!r.ok) return fail(r);
    st.agent = r.j.agent; ctx.toast(T("{n} set off — back in {t}", { n: r.j.agent.name, t: left(st.jobs[id].min * 60e3) })); if (ctx.purse) ctx.purse(true);
    if (body && body.play) try { body.play("emote-yes", { once: true }); } catch { /* no clip */ }
    setTimeout(spawn, 1500); paint(); paintChip();
  }
  async function claim(id) {
    const r = await act({ action: "world-agent-claim", id }); if (!r) return;
    if (!r.ok) { if (r.j && r.j.agent) st.agent = r.j.agent; paint(); return fail(r); }
    st.agent = r.j.agent; report = r.j; paint(); paintChip(); spawn();
    if (ctx.burst) ctx.burst(parseInt(K.AGENTS[st.agent.kind].color.slice(1), 16));
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
    if (b.dataset.pick) { pick = b.dataset.pick; return paint(); }
    if (b.dataset.view || b.dataset.nav) { const cur = A() ? view || A().kind : pick || "aurora", nx = b.dataset.view || K3[(K3.indexOf(cur) + Number(b.dataset.nav) + 3) % 3]; if (A()) view = nx; else pick = nx; return paint(); }
    if (b.dataset.preset) { const p = el.querySelector(".wag-persona"); if (p) p.value = b.dataset.preset; return; }
    if (b.hasAttribute("data-create")) return create();
    if (b.hasAttribute("data-send")) return send();
    if (b.dataset.ask) return send(b.dataset.ask);
    if (b.dataset.job) return job(b.dataset.job);
    if (b.dataset.claim) return claim(b.dataset.claim);
    if (b.hasAttribute("data-save")) return save();
    if (b.hasAttribute("data-ok")) { report = null; return paint(); }
  }

  setTimeout(look, 1500);
  setInterval(() => { if (Date.now() - last > (document.hidden ? 180e3 : 90e3)) look(); else { paintChip(); if (!away() && A() && !bodyKind) spawn(); if (shown() && tab === "jobs" && !report) paint(); } }, 5000);
  return { open, close, shown, look, tick, paintChip, state: () => st,
    debug: () => ({ kind: bodyKind, agent: A() && { name: A().name, lv: A().lv, jobs: A().jobs.length, chatLeft: A().chatLeft }, clips: body && body.mixer && body.mixer._actions ? body.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.5).map((x) => x.getClip().name) : [], pos: body ? [+body.obj.position.x.toFixed(1), +body.obj.position.z.toFixed(1)] : null, on: ctx.inHub(), ticks, mt: body && body.mixer ? +body.mixer.time.toFixed(2) : 0, chip: chip ? chip.textContent : "", chipShown: chip ? !chip.hidden : false }) };
}
