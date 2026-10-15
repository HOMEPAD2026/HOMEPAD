// world-support.js — the Help Center, in the game (the Help button) and on the site (/support).
//
//   Ask ARCIA   she answers first, any hour (POST /api/arcia with support: true). When she can't fix it she ends with
//               [REPORT:bug|improve|idea] and the report form opens, filled in from the chat.
//   Report      a bug, an improvement or an idea, with a screenshot (an upload, or the game's view captured here).
//   Board       every report, public: status, the team's reply, "me too". Reviewers (api/_world-support.mjs) set
//               the status here, and an accepted report pays its ARCL reward once.
//   Mine        your own reports.
// ARCL is in-game points; a reward is paid only when the team accepts a report. Reports are public, so the form
// warns against private details and the server refuses anything that looks like a key or a recovery phrase.
const SESS = "arc.world.sess";
const lc = (a) => String(a || "").toLowerCase();
const KINDS = [["bug", "Bug"], ["improve", "Improvement"], ["idea", "Idea"]];
const STATUS = { open: "Received", accepted: "Accepted", done: "Done", declined: "Declined", dupe: "Duplicate" };
const loginMessage = (wallet, issued) => `ARCIRCLE World — sign in\n\nWallet: ${lc(wallet)}\nIssued: ${issued}\n\nThis only proves the wallet is yours. It costs nothing and moves nothing.`;
export const sessGet = () => { try { const s = JSON.parse(localStorage.getItem(SESS) || "null"); return s && Date.now() - Date.parse(s.issued) < 23.5 * 3600e3 ? s : null; } catch { return null; } };

// an image file (or a canvas) → a WebP data URL under ~430 KB, at most 1600 px wide
export async function shrinkImage(src) {
  const img = src instanceof HTMLCanvasElement ? src : await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(src); });
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  for (const [max, q] of [[1600, 0.82], [1280, 0.75], [1024, 0.7], [800, 0.62]]) {
    const k = Math.min(1, max / w0), cv = document.createElement("canvas"); cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    let d = cv.toDataURL("image/webp", q); if (!d.startsWith("data:image/webp")) d = cv.toDataURL("image/jpeg", q);
    if (d.length * 0.75 < 430 * 1024) return d;
  }
  throw new Error("image too large");
}

/// ctx: { T, lang, esc, toast, mount?: element (the page) | undefined (a full-screen sheet), where: "game" | "site",
///        provider?: async () → EIP-1193, address?: () → string, capture?: async () → canvas | blob, freeze?(on), onOpen?() }
export function createSupport(ctx) {
  const { esc } = ctx;
  // single words stay out of the site-wide dictionary: a small map just for the Help Center
  const LW = { ko: { Report: "접수하기", Board: "접수 게시판", Bug: "버그", Improvement: "개선사항", Idea: "아이디어", Title: "제목", Screenshot: "스크린샷", Accepted: "채택됨", Declined: "반려됨", Duplicate: "중복", "Saved.": "저장했어요." },
    zh: { Report: "提交反馈", Board: "反馈看板", Bug: "Bug", Improvement: "改进建议", Idea: "创意", Title: "标题", Screenshot: "截图", Accepted: "已采纳", Declined: "已驳回", Duplicate: "重复", "Saved.": "已保存。" },
    tr: { Report: "Bildir", Board: "Pano", Bug: "Hata", Improvement: "İyileştirme", Idea: "Fikir", Title: "Başlık", Screenshot: "Ekran görüntüsü", Accepted: "Kabul edildi", Declined: "Reddedildi", Duplicate: "Yinelenen", "Saved.": "Kaydedildi." } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const toast = (m) => (ctx.toast ? ctx.toast(m) : alert(m));
  const post = (body) => fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }));
  const sheet = !ctx.mount;
  const root = ctx.mount || Object.assign(document.createElement("div"), { className: "hc-sheet", id: "hc-sheet", hidden: true });
  if (sheet) { root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Help Center"); document.body.appendChild(root); }
  root.setAttribute("data-no-i18n", "");
  let tab = "ask", chat = [], busy = false, draft = { kind: "bug", title: "", body: "", shot: "" }, filter = { kind: "", status: "" }, admin = null, open = null;
  const $ = (sel) => root.querySelector(sel);
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? T("just now") : s < 3600 ? T("{n} min ago", { n: Math.floor(s / 60) }) : s < 86400 ? T("{n} h ago", { n: Math.floor(s / 3600) }) : new Date(t).toLocaleDateString(); };
  const rewardOf = (k, shot) => ({ bug: 50, improve: 30, idea: 20 }[k] || 0) * (shot ? 2 : 1);

  async function signIn() {
    const s = sessGet(); if (s) return s;
    if (!ctx.provider) throw new Error(T("Connect a wallet first."));
    const prov = await ctx.provider();
    const accts = await prov.request({ method: "eth_requestAccounts" }); const a = lc((ctx.address && ctx.address()) || accts[0]);
    if (!a) throw new Error(T("Connect a wallet first."));
    const issued = new Date().toISOString(), msg = loginMessage(a, issued);
    const hex = "0x" + Array.from(new TextEncoder().encode(msg), (b) => b.toString(16).padStart(2, "0")).join("");
    const signature = await prov.request({ method: "personal_sign", params: [hex, a] });
    const out = { wallet: a, issued, signature }; try { localStorage.setItem(SESS, JSON.stringify(out)); } catch { /* private */ }
    return out;
  }

  // ---------------- the shell ----------------
  function shell() {
    root.innerHTML = `<div class="hc-card">
      <div class="hc-head"><span class="hc-ava"><img src="/images/arcia-avatar-96.jpg" alt="" width="56" height="56"><i class="hc-live" title="${esc(T("Online now"))}"></i></span>
        <div class="hc-title"><h2>${esc(T("Help Center"))}</h2><p>${esc(T("ARCIA answers any hour. What she can't fix goes to the team, on a board everyone can see."))}</p></div>
        ${sheet ? `<button type="button" class="wa-x" data-x aria-label="${esc(T("Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ""}</div>
      <nav class="wa-tabs hc-tabs" role="tablist">${[["ask", "Ask ARCIA"], ["report", "Report"], ["board", "Board"], ["mine", "My reports"]].map(([id, n]) => `<button type="button" role="tab" data-tab="${id}" aria-pressed="${id === tab}">${esc(T(n))}</button>`).join("")}</nav>
      <div class="hc-body" id="hc-body"></div></div>`;
    paint();
  }
  function setTab(t) { tab = t; open = null; root.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab))); paint(); }
  function paint() {
    const body = $("#hc-body"); if (!body) return;
    if (tab === "ask") body.innerHTML = askHTML();
    else if (tab === "report") body.innerHTML = reportHTML();
    else { body.innerHTML = `<p class="wa-empty">${esc(T("Loading…"))}</p>`; open ? showItem(open) : loadList(); }
    if (tab === "ask") { const log = $("#hc-log"); if (log) log.scrollTop = log.scrollHeight; }
  }

  // ---------------- Ask ARCIA ----------------
  const QUICK = ["My wallet won't connect", "A transaction failed", "I lost my game progress", "How do I earn ARCL?", "I found a bug"];
  function askHTML() {
    const msgs = chat.length ? chat : [{ role: "assistant", first: true, content: T("Hi, I'm ARCIA. Tell me what's going on and I'll help you fix it. If I can't, I'll pass it to the team for you.") }];
    return `<div class="hc-chat"><div class="hc-log" id="hc-log" aria-live="polite">${msgs.map(bubble).join("")}${busy ? `<div class="hc-msg a typing"><span></span><span></span><span></span></div>` : ""}</div>
      ${chat.length ? "" : `<div class="hc-quick">${QUICK.map((q) => `<button type="button" data-q="${esc(q)}">${esc(T(q))}</button>`).join("")}</div>`}
      <form class="hc-ask" id="hc-ask"><input id="hc-q" maxlength="600" autocomplete="off" placeholder="${esc(T("Describe the problem…"))}" aria-label="${esc(T("Your message"))}"><button type="submit" class="hc-send" ${busy ? "disabled" : ""} aria-label="${esc(T("Send"))}"><svg viewBox="0 0 24 24"><path d="M4 12 20 4l-6 16-3-7z"/></svg></button></form>
      <p class="hc-safe">${esc(T("ARCIA and the team will never ask for your private key, recovery phrase or password."))}</p></div>`;
  }
  function bubble(m) {
    if (m.role === "user") return `<div class="hc-msg u">${esc(m.content)}</div>`;
    const rep = /\[REPORT:(bug|improve|idea)\]/.exec(m.content), txt = m.content.replace(/\[REPORT:(bug|improve|idea)\]/g, "").trim();
    const html = esc(txt).replace(/(https:\/\/(?:www\.)?arcircle\.app\/[^\s<]*)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, "<br>");
    return `<div class="hc-msg a"><img src="/images/arcia-avatar-96.jpg" alt="" width="28" height="28"><div><p>${html}</p>${m.first ? "" : rep ? `<button type="button" class="hc-escalate" data-esc="${rep[1]}">${esc(T("Send this to the team"))}</button>` : `<button type="button" class="hc-notyet" data-esc="">${esc(T("Not solved? Report it"))}</button>`}</div></div>`;
  }
  async function ask(q) {
    q = String(q || "").trim(); if (!q || busy) return;
    chat.push({ role: "user", content: q }); busy = true; paint();
    let reply = "";
    try {
      const s = sessGet();
      const r = await fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: chat.slice(-10), lang: ctx.lang || "en", support: true, wallet: s ? s.wallet : undefined, page: { tab: "support" } }) });
      const j = await r.json().catch(() => ({})); reply = j.reply || j.error || "";
    } catch { /* offline */ }
    busy = false;
    chat.push({ role: "assistant", content: reply || T("I can't reach my notes right now. You can still send this to the team: tap Report.") + " [REPORT:bug]" });
    if (tab === "ask") paint();
  }
  function escalate(kind) {
    const users = chat.filter((m) => m.role === "user").map((m) => m.content);
    draft = { ...draft, kind: kind || draft.kind || "bug", title: draft.title || (users[0] || "").slice(0, 80), body: draft.body || users.join("\n\n").slice(0, 1500) };
    setTab("report");
  }

  // ---------------- Report ----------------
  function reportHTML() {
    const s = sessGet(), k = draft.kind;
    return `<form class="hc-form" id="hc-form">
      <div class="hc-kinds" role="radiogroup" aria-label="${esc(T("What is it?"))}">${KINDS.map(([id, n]) => `<button type="button" role="radio" data-kind="${id}" aria-checked="${id === k}"><b>${esc(T(n))}</b><small>${esc(T("{n} ARCL", { n: rewardOf(id, false) }))} · ${esc(T("{n} with a screenshot", { n: rewardOf(id, true) }))}</small></button>`).join("")}</div>
      <label class="hc-field"><span>${esc(T("Title"))}</span><input id="hc-title" maxlength="80" value="${esc(draft.title)}" placeholder="${esc(k === "bug" ? T("e.g. The Buy button does nothing on my phone") : k === "improve" ? T("e.g. Make the map easier to read") : T("e.g. Pets that follow you on your island"))}"></label>
      <label class="hc-field"><span>${esc(k === "bug" ? T("What did you do, what did you expect, what happened?") : T("Details"))}</span><textarea id="hc-body-in" rows="6" maxlength="1500">${esc(draft.body)}</textarea></label>
      <div class="hc-shot">${draft.shot ? `<figure><img src="${draft.shot}" alt="${esc(T("Screenshot"))}"><button type="button" class="wp-link" data-shot-x>${esc(T("Remove"))}</button></figure>` : ""}
        <div class="hc-shot-btns"><label class="hc-btn"><input type="file" accept="image/*" id="hc-file" hidden><svg viewBox="0 0 24 24"><path d="M4 16v3h16v-3M12 4v11M7 9l5-5 5 5"/></svg>${esc(T("Upload a screenshot"))}</label>
        ${ctx.capture ? `<button type="button" class="hc-btn" data-capture><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg>${esc(T("Capture the game"))}</button>` : ""}</div>
        <p class="hc-note">${esc(T("A screenshot doubles the reward when the report is accepted."))}</p></div>
      <p class="hc-warn">${esc(T("Reports are public. Never include a private key, a recovery phrase, a password or personal details."))}</p>
      <div class="hc-submit"><span class="hc-pay"><img src="/images/arcl-64.png" alt="" width="20" height="20">${esc(T("{n} ARCL if accepted", { n: rewardOf(k, !!draft.shot) }))}</span>
        <button type="submit" class="hc-go" ${busy ? "disabled" : ""}>${esc(s ? T("Send report") : T("Sign in and send"))}</button></div>
      <p class="hc-fine">${esc(T("ARCL is in-game points. Rewards are paid when the team accepts a report; duplicates and declined reports get none."))}</p></form>`;
  }
  function readDraft() { const t = $("#hc-title"), b = $("#hc-body-in"); if (t) draft.title = t.value; if (b) draft.body = b.value; }
  async function send() {
    readDraft(); if (busy) return;
    if (draft.title.trim().length < 4) { toast(T("Add a short title")); return; }
    if (draft.body.trim().length < 10) { toast(T("Tell us a little more (10 characters or more)")); return; }
    busy = true; paint();
    try {
      const s = await signIn();
      const transcript = chat.map((m) => (m.role === "user" ? "Q: " : "A: ") + m.content.replace(/\[REPORT:\w+\]/g, "")).join("\n").slice(-600);
      const r = await post({ action: "world-support-new", ...s, kind: draft.kind, title: draft.title, body: draft.body, shot: draft.shot || undefined, chat: transcript, where: ctx.where, lang: ctx.lang });
      if (!r.ok) { if (/sign-in expired|signature/.test(r.j.error || "")) try { localStorage.removeItem(SESS); } catch { /* */ } toast(r.j.error || T("Couldn't send it. Try again.")); return; }
      toast(T("Thanks! Report #{id} is on the board.", { id: r.j.ticket.id.slice(0, 6) }));
      draft = { kind: draft.kind, title: "", body: "", shot: "" }; chat = [];
      busy = false; open = r.j.ticket.id; tab = "board"; root.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === "board"))); paint(); return;
    } catch (e) { toast((e && e.message) || T("Couldn't send it. Try again.")); }
    finally { busy = false; if (tab === "report") paint(); }
  }

  // ---------------- Board / Mine ----------------
  async function loadList() {
    const s = sessGet(), q = new URLSearchParams({ world: "support-list" });
    if (tab === "mine") { if (!s) { $("#hc-body").innerHTML = `<div class="hc-empty"><p>${esc(T("Sign in with your wallet to see your reports."))}</p><button type="button" class="hc-go" data-signin>${esc(T("Sign in with wallet"))}</button></div>`; return; } q.set("mine", s.wallet); }
    if (filter.kind) q.set("kind", filter.kind); if (filter.status) q.set("status", filter.status);
    let d = null; try { const r = await fetch("/api/social?" + q); d = r.ok ? await r.json() : null; } catch { /* offline */ }
    if (tab !== "board" && tab !== "mine") return;
    const list = (d && d.list) || [], c = (d && d.counts) || {};
    $("#hc-body").innerHTML = `${tab === "board" ? `<div class="hc-stats">${["open", "accepted", "done"].map((k) => `<span><b>${c[k] || 0}</b>${esc(T(STATUS[k]))}</span>`).join("")}</div>` : ""}
      <div class="hc-filters"><div class="hc-chips">${[["", "All"], ...KINDS].map(([id, n]) => `<button type="button" data-fk="${id}" aria-pressed="${filter.kind === id}">${esc(T(n))}</button>`).join("")}</div>
      <select id="hc-fs" aria-label="${esc(T("Status"))}"><option value="">${esc(T("Any status"))}</option>${Object.entries(STATUS).map(([k, n]) => `<option value="${k}" ${filter.status === k ? "selected" : ""}>${esc(T(n))}</option>`).join("")}</select></div>
      ${list.length ? `<ul class="hc-list">${list.map((x) => `<li><button type="button" data-open="${esc(x.id)}"><span class="hc-kind k-${x.kind}">${esc(T((KINDS.find((k) => k[0] === x.kind) || [, x.kind])[1]))}</span><span class="hc-t"><b>${esc(x.title)}</b><small>${esc(x.w)} · ${esc(ago(x.at))}${x.shot ? ` · <span class="hc-ico" title="${esc(T("Screenshot"))}">▣</span>` : ""}${x.reply ? ` · ${esc(T("Team replied"))}` : ""}</small></span>${x.votes ? `<span class="hc-votes">+${x.votes}</span>` : ""}${x.reward ? `<span class="hc-rew"><img src="/images/arcl-64.png" alt="" width="14" height="14">${x.reward}</span>` : ""}<span class="hc-st s-${x.status}">${esc(T(STATUS[x.status] || x.status))}</span></button></li>`).join("")}</ul>`
        : `<div class="hc-empty"><p>${esc(tab === "mine" ? T("No reports yet. Ask ARCIA first; if she can't fix it, report it.") : d ? T("No reports here yet.") : T("The board opens once cloud saving is switched on."))}</p></div>`}`;
  }
  async function showItem(id) {
    open = id;
    let t = null; try { const r = await fetch("/api/social?world=support-item&id=" + encodeURIComponent(id)); t = r.ok ? (await r.json()).ticket : null; } catch { /* offline */ }
    if (!t) { open = null; loadList(); return; }
    const s = sessGet();
    if (s && admin === null) { try { admin = !!(await (await fetch("/api/social?world=support-admin&wallet=" + s.wallet)).json()).admin; } catch { admin = false; } }
    const kn = T((KINDS.find((k) => k[0] === t.kind) || [, t.kind])[1]);
    $("#hc-body").innerHTML = `<article class="hc-item"><button type="button" class="wp-link hc-back" data-back>← ${esc(T("All reports"))}</button>
      <header class="hc-item-h"><span class="hc-kind k-${t.kind}">${esc(kn)}</span><span class="hc-st s-${t.status}">${esc(T(STATUS[t.status] || t.status))}</span><small>#${esc(t.id.slice(0, 6))} · ${esc(t.w)} · ${esc(ago(t.at))}${t.where ? " · " + esc(t.where) : ""}</small></header>
      <h3>${esc(t.title)}</h3><p class="hc-text">${esc(t.body).replace(/\n/g, "<br>")}</p>
      ${t.shot ? `<a class="hc-shot-big" href="/api/social?world=support-shot&id=${esc(t.id)}" target="_blank" rel="noopener"><img src="/api/social?world=support-shot&id=${esc(t.id)}" alt="${esc(T("Screenshot"))}" loading="lazy"></a>` : ""}
      ${t.reply ? `<div class="hc-reply"><b>${esc(T("ARCIRCLE team"))}</b><p>${esc(t.reply).replace(/\n/g, "<br>")}</p></div>` : `<p class="hc-wait">${esc(T("Waiting for the team. Everyone can see this report and add a \"me too\"."))}</p>`}
      <div class="hc-item-f"><button type="button" class="hc-btn" data-vote="${esc(t.id)}">${esc(T("Me too"))}${t.votes ? ` · ${t.votes}` : ""}</button>${t.reward ? `<span class="hc-rew big"><img src="/images/arcl-64.png" alt="" width="18" height="18">${esc(T("{n} ARCL paid to the reporter", { n: t.reward }))}</span>` : `<span class="hc-note">${esc(T("{n} ARCL if accepted", { n: rewardOf(t.kind, t.shot) }))}</span>`}</div>
      ${admin ? `<div class="hc-admin"><b>${esc(T("Review"))}</b><select id="hc-rs">${Object.entries(STATUS).map(([k, n]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${esc(T(n))}</option>`).join("")}</select><textarea id="hc-rr" rows="3" maxlength="800" placeholder="${esc(T("Reply to the reporter (public)"))}">${esc(t.reply)}</textarea><button type="button" class="hc-go" data-review="${esc(t.id)}">${esc(T("Save review"))}</button><small>${esc(T("Accepted or Done pays the reward once."))}</small></div>` : ""}
    </article>`;
  }

  // ---------------- events ----------------
  root.addEventListener("click", async (e) => {
    if (sheet && (e.target === root || e.target.closest("[data-x]"))) { close(); return; }
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tab) { if (tab === "report") readDraft(); setTab(b.dataset.tab); return; }
    if (b.dataset.q) { ask(T(b.dataset.q)); return; }
    if (b.dataset.esc !== undefined) { escalate(b.dataset.esc); return; }
    if (b.dataset.kind) { readDraft(); draft.kind = b.dataset.kind; paint(); return; }
    if (b.hasAttribute("data-shot-x")) { readDraft(); draft.shot = ""; paint(); return; }
    if (b.hasAttribute("data-capture")) {
      readDraft(); if (sheet) root.hidden = true;
      try { const c = await ctx.capture(); draft.shot = await shrinkImage(c); toast(T("Captured the game view")); } catch { toast(T("Couldn't capture the screen")); }
      if (sheet) root.hidden = false; paint(); return;
    }
    if (b.dataset.fk !== undefined) { filter.kind = b.dataset.fk; loadList(); return; }
    if (b.dataset.open) { showItem(b.dataset.open); return; }
    if (b.hasAttribute("data-back")) { open = null; loadList(); return; }
    if (b.hasAttribute("data-signin")) { try { await signIn(); loadList(); } catch (err) { toast((err && err.message) || T("Sign-in failed.")); } return; }
    if (b.dataset.vote) {
      try { const s = await signIn(); const r = await post({ action: "world-support-vote", ...s, id: b.dataset.vote }); toast(r.ok ? T("Thanks, noted.") : r.j.error || T("Couldn't save that")); if (r.ok) showItem(b.dataset.vote); } catch (err) { toast((err && err.message) || T("Sign-in failed.")); }
      return;
    }
    if (b.dataset.review) {
      try { const s = await signIn(); const r = await post({ action: "world-support-review", ...s, id: b.dataset.review, status: $("#hc-rs").value, reply: $("#hc-rr").value }); toast(r.ok ? (r.j.paid ? T("Saved. {n} ARCL paid.", { n: r.j.paid }) : T("Saved.")) : r.j.error || T("Couldn't save that")); if (r.ok) showItem(b.dataset.review); } catch (err) { toast((err && err.message) || T("Sign-in failed.")); }
    }
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "hc-ask") { const i = $("#hc-q"); const q = i.value; i.value = ""; ask(q); }
    if (e.target.id === "hc-form") send();
  });
  root.addEventListener("change", async (e) => {
    if (e.target.id === "hc-fs") { filter.status = e.target.value; loadList(); }
    if (e.target.id === "hc-file" && e.target.files[0]) { readDraft(); try { draft.shot = await shrinkImage(e.target.files[0]); } catch { toast(T("That image couldn't be used. Try a PNG or JPEG.")); } paint(); }
  });
  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet) { e.stopPropagation(); close(); } else e.stopPropagation(); });

  function openSheet(t) { if (t) tab = t; open = null; if (sheet) { root.hidden = false; if (ctx.freeze) ctx.freeze(true); } shell(); setTimeout(() => { const i = $("#hc-q"); if (i && tab === "ask" && !("ontouchstart" in window)) i.focus(); }, 60); }
  function close() { if (!sheet || root.hidden) return; root.hidden = true; if (ctx.freeze) ctx.freeze(false); }
  if (!sheet) shell();
  return { open: openSheet, close, isOpen: () => sheet && !root.hidden, setTab };
}
