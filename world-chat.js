// world-chat.js — local chat around you, friends (requests you answer) and 1:1 private chat with friends.
// The server keeps it all (api/_world-chat.mjs). Tabs: Local (the area you stand in: a district, a hunting ground or
// an island), Friends (requests, friends, blocked, and the one-way list you had before) and DMs (your friends, unread
// first). A line is 120 characters; the server filters it. Nothing polls while the panel is shut except one small
// check for unread messages every minute; with it open, the local area or the open thread is read every 6 seconds.
// Muting is this browser's own (a list of wallets); blocking is the server's, and also shuts the DM.
//
// ctx: { T, esc, toast, post, sess(), area() → { id, name } | null, bubble(text), following() → [{ w, n }], openProfile(w),
//        freeze(on), onUnread(n), onSay(), Snd }
export const CHAT_READY = true;
const MUTE = "arc.world.chatMute", POLL = 6000, ASK_EVERY = 60e3, PRES_EVERY = 170e3, MAX = 120;
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const hhmm = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const WHY = [["spam", "Spam"], ["abuse", "Rude or abusive"], ["scam", "Scam or links"]];

export function createChat(ctx) {
  const { T, esc, toast, post, sess } = ctx;
  const $ = (s) => el.querySelector(s);
  let open = false, tab = "local", timer = 0, busy = false;
  let local = { ch: "", list: [] }, fr = null, thread = null, un = { dm: 0, from: {}, q: 0 }, said = null, presAt = 0, pickW = "", pickMode = "", sure = "";
  let mutes = []; try { const m = JSON.parse(localStorage.getItem(MUTE) || "[]"); if (Array.isArray(m)) mutes = m.filter((x) => x && /^0x[0-9a-f]{40}$/.test(x.w)).slice(0, 100); } catch { /* private window */ }
  const saveMutes = () => { try { localStorage.setItem(MUTE, JSON.stringify(mutes)); } catch { /* private window */ } };
  const muted = (w) => mutes.some((x) => x.w === w);
  const me = () => { const s = sess(); return s ? String(s.wallet).toLowerCase() : ""; };

  // ---- the dock button and the panel ----
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "wp-btn wp-icon wp-chat-btn"; btn.id = "wp-chat-btn"; btn.title = T("Chat and friends"); btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = `<svg class="hi" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="hiChatA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ff3ff"/><stop offset="1" stop-color="#2f86ff"/></linearGradient></defs><path d="M6 5h20a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H15l-6.2 5a.8.8 0 0 1-1.3-.6V23H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="url(#hiChatA)"/><circle cx="10.5" cy="14" r="1.7" fill="#fff"/><circle cx="16" cy="14" r="1.7" fill="#fff"/><circle cx="21.5" cy="14" r="1.7" fill="#fff"/></svg><span class="wp-sr">${esc(T("Chat and friends"))}</span>`;
  const inb = document.getElementById("wp-inbox-btn") || document.getElementById("wp-vil-btn") || document.getElementById("wp-bag-btn");
  if (inb && inb.parentNode) inb.parentNode.insertBefore(btn, inb.nextSibling);
  btn.addEventListener("click", () => (open ? hide() : show()));

  const el = document.createElement("aside"); el.className = "wp-mapsheet wp-chatsheet"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", T("Chat and friends")); el.setAttribute("data-no-i18n", "");
  el.innerHTML = `<div class="wp-card"><div class="wp-sheet-head"><h2>${esc(T("Chat"))}</h2><button type="button" class="wp-btn wp-x" data-x aria-label="${esc(T("Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="wp-chat-tabs" role="tablist"></div><div class="wp-chat-sub"></div><div class="wp-chat-body" aria-live="polite"></div>
    <form class="wp-chat-send" autocomplete="off"><input name="m" maxlength="${MAX}" enterkeyhint="send" autocomplete="off" autocapitalize="sentences" aria-label="${esc(T("Message"))}"><button type="submit" class="wp-cta">${esc(T("Send"))}</button></form></div>`;
  document.body.appendChild(el);
  // the panel follows the visible part of the screen, so the keyboard doesn't cover the line you're writing
  function fit() { const v = window.visualViewport; if (!v) return; el.style.setProperty("--vvh", Math.round(v.height) + "px"); el.style.setProperty("--vvt", Math.round(v.offsetTop) + "px"); }
  if (window.visualViewport) { visualViewport.addEventListener("resize", fit); visualViewport.addEventListener("scroll", fit); }
  addEventListener("keydown", (e) => { if (open && e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); if (thread && tab !== "local") { thread = null; paint(); } else hide(); } }, true);

  // ---- what's said, where ----
  const nameOf = (w) => { const f = fr && fr.list.find((x) => x.w === w); if (f && f.n) return f.n; const fo = ctx.following().find((x) => x.w === w); return (fo && fo.n) || short(w); };
  const dot = (on) => `<i class="wp-chat-dot${on ? " on" : ""}" aria-hidden="true"></i>`;
  const line = (m, mine) => `<li class="wp-chat-m${mine ? " mine" : ""}" data-w="${esc(m.w)}" data-id="${esc(m.id)}"><div><button type="button" class="wp-chat-n" data-n>${m.gm ? '<i class="wv-gmtag">[GM]</i> ' : ""}${esc(m.n || short(m.w))}${m.lv ? `<small> ${esc(T("Lv {n}", { n: m.lv }))}</small>` : ""}</button><time>${hhmm(m.at)}</time></div><p>${esc(m.m)}</p>${pickW === m.w && pickW !== me() && tab === "local" && pickMode === m.id ? acts(m) : ""}</li>`;
  function acts(m) {
    const st = fr && fr.list.find((x) => x.w === m.w), sent = st && st.st;
    const why = sure === "report:" + m.id;
    if (why) return `<div class="wp-chat-act">${WHY.map(([k, l]) => `<button type="button" class="wp-btn" data-why="${k}" data-id="${esc(m.id)}">${esc(T(l))}</button>`).join("")}</div>`;
    return `<div class="wp-chat-act">${ctx.openProfile ? `<button type="button" class="wp-btn" data-prof="${esc(m.w)}">${esc(T("Profile"))}</button>` : ""}`
      + (sent === "friend" ? `<span class="wp-chat-tag">${esc(T("Friends"))}</span>` : sent === "out" ? `<span class="wp-chat-tag">${esc(T("Request sent"))}</span>` : sent === "in" ? `<button type="button" class="wp-btn" data-ok="${esc(m.w)}">${esc(T("Accept"))}</button>` : `<button type="button" class="wp-btn" data-ask="${esc(m.w)}">${esc(T("Add friend"))}</button>`)
      + `<button type="button" class="wp-btn" data-mute="${esc(m.w)}" data-nm="${esc(m.n || "")}">${esc(T("Mute"))}</button><button type="button" class="wp-btn wp-danger" data-rep="${esc(m.id)}">${esc(T("Report"))}</button></div>`;
  }
  function tabs() {
    const t = (id, label, n) => `<button type="button" role="tab" aria-selected="${tab === id}" data-tab="${id}">${esc(T(label))}${n ? `<b>${Math.min(n, 99)}</b>` : ""}</button>`;
    $(".wp-chat-tabs").innerHTML = t("local", "Local", 0) + t("friends", "Friends", un.q) + t("dms", "DMs", un.dm);
  }
  function sub() {
    const a = ctx.area(), s = $(".wp-chat-sub");
    if (tab === "local") s.innerHTML = `<span>${esc(a ? T("Talking in {x}", { x: a.name }) : T("Chat is for the town and the islands"))}</span><small>${esc(T("Everyone here can read this"))}</small>`;
    else if (thread) s.innerHTML = `<button type="button" class="wp-btn" data-back>‹ ${esc(T("Back"))}</button><b>${esc(nameOf(thread.w))}</b>${dot(fr && (fr.list.find((x) => x.w === thread.w) || {}).on)}`;
    else s.innerHTML = "";
  }
  const note = (t) => `<p class="wp-chat-note">${esc(t)}</p>`;
  function bodyLocal() {
    const rows = local.list.filter((m) => !muted(m.w));
    if (!rows.length) return note(sess() ? T("Quiet here. Say hi!") : T("Nobody has said anything here yet."));
    return `<ol class="wp-chat-log">${rows.map((m) => line(m, m.w === me())).join("")}</ol>`;
  }
  function frRow(x, btns) {
    const nm = x.n || nameOf(x.w);
    return `<li data-w="${esc(x.w)}">${dot(x.on)}<span class="wp-chat-who">${ctx.openProfile ? `<button type="button" class="wp-chat-n" data-prof="${esc(x.w)}">${esc(nm)}</button>` : `<b>${esc(nm)}</b>`}${x.lv ? `<small>${esc(T("Lv {n}", { n: x.lv }))}</small>` : ""}</span>${btns}</li>`;
  }
  function bodyFriends() {
    if (!sess()) return note(T("Sign in with your wallet to make friends and send messages."));
    if (!fr) return note(T("Loading…"));
    const L = fr.list, by = (s) => L.filter((x) => x.st === s), b = (k, v, txt, cls = "") => `<button type="button" class="wp-btn ${cls}" data-${k}="${esc(v)}">${esc(T(txt))}</button>`;
    const have = new Set(L.map((x) => x.w)), fo = ctx.following().filter((x) => x && x.w && !have.has(String(x.w).toLowerCase()));
    let h = "";
    if (by("in").length) h += `<h3>${esc(T("Requests"))}</h3><ul class="wp-chat-list">${by("in").map((x) => frRow(x, b("ok", x.w, "Accept", "wp-cta") + b("no", x.w, "Decline"))).join("")}</ul>`;
    h += `<h3>${esc(T("Friends"))}</h3>` + (by("friend").length ? `<ul class="wp-chat-list">${by("friend").map((x) => frRow(x, b("dm", x.w, "Message", "wp-cta") + `<button type="button" class="wp-btn wp-more" data-more="${esc(x.w)}" aria-label="${esc(T("More"))}">⋯</button>`
      + (pickW === x.w && pickMode === "more" ? `<div class="wp-chat-act">${b("rm", x.w, sure === "rm" + x.w ? "Tap again to remove" : "Remove friend", "wp-danger")}${b("bl", x.w, sure === "bl" + x.w ? "Tap again to block" : "Block", "wp-danger")}</div>` : ""))).join("")}</ul>`
      : note(T("No friends yet. Tap a name in the local chat to add one.")));
    if (by("out").length) h += `<h3>${esc(T("Requests sent"))}</h3><ul class="wp-chat-list">${by("out").map((x) => frRow(x, b("rm", x.w, "Cancel"))).join("")}</ul>`;
    if (fo.length) h += `<h3>${esc(T("Following"))}</h3>${note(T("From your old list. Ask them to be friends to chat privately."))}<ul class="wp-chat-list">${fo.map((x) => frRow({ w: String(x.w).toLowerCase(), n: x.n }, b("ask", String(x.w).toLowerCase(), "Add friend"))).join("")}</ul>`;
    if (by("blocked").length) h += `<h3>${esc(T("Blocked"))}</h3><ul class="wp-chat-list">${by("blocked").map((x) => frRow(x, b("unbl", x.w, "Unblock"))).join("")}</ul>`;
    if (mutes.length) h += `<h3>${esc(T("Muted in local chat"))}</h3><ul class="wp-chat-list">${mutes.map((x) => frRow({ w: x.w, n: x.n }, b("unmute", x.w, "Unmute"))).join("")}</ul>`;
    return h;
  }
  function bodyDms() {
    if (!sess()) return note(T("Sign in with your wallet to make friends and send messages."));
    if (!fr) return note(T("Loading…"));
    const fl = fr.list.filter((x) => x.st === "friend").sort((a, b) => (un.from[b.w] || 0) - (un.from[a.w] || 0) || b.on - a.on);
    if (!fl.length) return note(T("Private messages are for friends. Add one from the local chat."));
    return `<ul class="wp-chat-list">${fl.map((x) => `<li data-w="${esc(x.w)}">${dot(x.on)}<button type="button" class="wp-chat-dm" data-dm="${esc(x.w)}"><b>${esc(x.n || nameOf(x.w))}</b>${x.lv ? `<small>${esc(T("Lv {n}", { n: x.lv }))}</small>` : ""}</button>${un.from[x.w] ? `<em class="wp-chat-un">${Math.min(99, un.from[x.w])}</em>` : ""}</li>`).join("")}</ul>`;
  }
  function bodyThread() {
    if (!thread.list) return note(T("Loading…"));
    if (!thread.list.length) return note(T("Say hi to {x}!", { x: nameOf(thread.w) }));
    return `<ol class="wp-chat-log">${thread.list.map((m) => line({ ...m, n: m.w === me() ? T("You") : nameOf(m.w) }, m.w === me())).join("")}</ol>`;
  }
  // repaint the list without losing your place: stay at the bottom if you were there
  function paintBody() {
    const body = $(".wp-chat-body"), atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 40, top = body.scrollTop, first = !body.firstChild;
    body.innerHTML = tab === "local" ? bodyLocal() : tab === "friends" ? bodyFriends() : thread ? bodyThread() : bodyDms();
    const log = body.querySelector(".wp-chat-log");
    if (log && (atEnd || first || pickW === "")) body.scrollTop = body.scrollHeight; else body.scrollTop = top;
  }
  function paintSend() {
    const f = $(".wp-chat-send"), i = f.elements.m, can = !!sess() && (tab === "local" ? !!ctx.area() : !!(thread && tab === "dms"));
    f.hidden = !can; i.placeholder = tab === "local" ? T("Say something…") : T("Write a message…");
  }
  function paint() { tabs(); sub(); paintBody(); paintSend(); }

  // ---- loading ----
  async function loadLocal() {
    const a = ctx.area(); sub(); paintSend();
    if (!a) { local = { ch: "", list: [] }; paintBody(); return; }
    if (local.ch !== a.id) { local = { ch: a.id, list: [] }; paintBody(); }
    try {
      const r = await fetch("/api/social?world=chat&ch=" + encodeURIComponent(a.id)); if (!r.ok || local.ch !== a.id) return;
      const j = await r.json(); local.list = j.list || []; if (open && tab === "local") paintBody();
    } catch { /* next time */ }
  }
  async function loadFriends() {
    const s = sess(); if (!s) { fr = { list: [] }; paintBody(); return; }
    const r = await post({ action: "world-friends", ...s }).catch(() => null);
    if (r && r.ok) { fr = { list: r.j.friends || [] }; un.q = r.j.q || 0; badge(); }
    else if (!fr) fr = { list: [] };
    if (open) paint();
  }
  async function loadUnread() {
    const s = sess(); if (!s) { un = { dm: 0, from: {}, q: 0 }; badge(); return; }
    const r = await post({ action: "world-dm-unread", ...s }).catch(() => null);
    if (r && r.ok) { un = { dm: r.j.dm || 0, from: r.j.from || {}, q: r.j.q || 0 }; badge(); if (open) { tabs(); if (tab === "dms" && !thread) paintBody(); } }
  }
  async function loadThread() {
    const s = sess(); if (!s || !thread) return; const w = thread.w;
    const r = await post({ action: "world-dm-thread", ...s, with: w }).catch(() => null);
    if (!thread || thread.w !== w) return;
    if (r && r.ok) {
      const had = (thread.list || []).length, list = r.j.list || []; thread.list = list;
      if (open && tab === "dms") paintBody();
      // what they sent is read once it's on screen
      if (list.some((m) => m.w === w) && (un.from[w] || 0) > 0) { un.dm = Math.max(0, un.dm - un.from[w]); delete un.from[w]; badge(); tabs(); post({ action: "world-dm-read", ...s, with: w }).catch(() => {}); }
      if (list.length > had && had) ctx.Snd && ctx.Snd.pick && ctx.Snd.pick();
    } else if (r && r.status === 403) { toast(T(r.j.error || "you can only message friends")); thread = null; loadFriends(); paint(); }
  }
  function badge() { const n = un.dm + un.q; btn.dataset.dot = n ? String(Math.min(n, 99)) : ""; ctx.onUnread(n); }
  function tick() { if (!open || document.hidden) return; if (tab === "local") loadLocal(); else if (tab === "dms" && thread) loadThread(); else if (tab === "dms") loadUnread(); }

  // ---- sending ----
  el.querySelector(".wp-chat-send").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.currentTarget, i = f.elements.m, text = i.value.replace(/\s+/g, " ").trim().slice(0, MAX), s = sess();
    if (!text || busy) return; if (!s) { toast(T("Sign in with your wallet first")); return; }
    busy = true; f.querySelector("button").disabled = true;
    try {
      if (tab === "local") {
        const a = ctx.area(); if (!a) return;
        const r = await post({ action: "world-chat-say", ...s, ch: a.id, m: text });
        if (!r.ok) { toast(T(r.j.error || "Couldn't send that right now")); return; }
        i.value = ""; if (local.ch === a.id) local.list = [...local.list.filter((x) => x.id !== r.j.msg.id), r.j.msg].slice(-30);
        said = { m: r.j.msg.m, at: Date.now(), sent: false }; ctx.bubble(r.j.msg.m); ctx.onSay(); paintBody();
      } else if (thread) {
        const r = await post({ action: "world-dm-send", ...s, to: thread.w, m: text });
        if (!r.ok) { toast(T(r.j.error || "Couldn't send that right now")); return; }
        i.value = ""; thread.list = [...(thread.list || []), r.j.msg].slice(-50); paintBody();
      }
    } finally { busy = false; f.querySelector("button").disabled = false; if (!matchMedia("(pointer: coarse)").matches) i.focus(); }
  });

  // ---- actions ----
  async function act(action, to, okMsg) {
    const s = sess(); if (!s || busy) return false; busy = true;
    try {
      const r = await post({ action, ...s, to });
      if (!r.ok) { toast(T(r.j.error || "That didn't work")); return false; }
      if (okMsg) toast(T(okMsg)); await loadFriends(); return true;
    } finally { busy = false; }
  }
  el.addEventListener("click", async (e) => {
    if (e.target === el || e.target.closest("[data-x]")) { hide(); return; }
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset, li = b.closest("li[data-w]");
    if (d.tab) { tab = d.tab; thread = null; pickW = ""; pickMode = ""; sure = ""; $(".wp-chat-send").elements.m.value = ""; paint(); if (tab === "local") loadLocal(); else { if (!fr || tab === "friends") loadFriends(); if (tab === "dms") loadUnread(); } return; }
    if (b.hasAttribute("data-back")) { thread = null; paint(); loadUnread(); return; }
    if (b.hasAttribute("data-n") && li) { const w = li.dataset.w; if (w === me()) return; const same = pickW === w && pickMode === li.dataset.id; pickW = same ? "" : w; pickMode = same ? "" : li.dataset.id; sure = ""; if (!fr) loadFriends(); paintBody(); return; }
    if (d.prof && ctx.openProfile) { hide(); ctx.openProfile(d.prof); return; }
    if (d.ask) { if (await act("world-friend-request", d.ask)) toast(T("Friend request sent")); return; }
    if (d.ok) { if (await act("world-friend-accept", d.ok)) { toast(T("You are friends now")); ctx.Snd && ctx.Snd.win && ctx.Snd.win(); } return; }
    if (d.no) { await act("world-friend-decline", d.no); return; }
    if (d.unbl) { await act("world-friend-unblock", d.unbl, "Unblocked"); return; }
    if (d.more) { pickW = pickW === d.more && pickMode === "more" ? "" : d.more; pickMode = "more"; sure = ""; paintBody(); return; }
    if (d.rm || d.bl) {
      const w = d.rm || d.bl, key = (d.rm ? "rm" : "bl") + w;
      if (sure !== key && fr && fr.list.find((x) => x.w === w && x.st === "friend")) { sure = key; paintBody(); return; }
      sure = ""; pickW = ""; pickMode = "";
      if (d.rm) await act("world-friend-remove", w, "Removed from friends"); else await act("world-friend-block", w, "Blocked");
      return;
    }
    if (d.dm) { tab = "dms"; thread = { w: d.dm, list: null }; pickW = ""; paint(); loadThread(); const i = $(".wp-chat-send").elements.m; if (!matchMedia("(pointer: coarse)").matches) i.focus(); return; }
    if (d.mute) { const w = d.mute; if (!muted(w)) { mutes = [{ w, n: String(d.nm || "").slice(0, 16) }, ...mutes].slice(0, 100); saveMutes(); } pickW = ""; paintBody(); toast(T("Muted. You won't see their lines here.")); return; }
    if (d.unmute) { mutes = mutes.filter((x) => x.w !== d.unmute); saveMutes(); paintBody(); return; }
    if (d.rep) { sure = "report:" + d.rep; paintBody(); return; }
    if (d.why) {
      const s = sess(), a = ctx.area(), m = local.list.find((x) => x.id === d.id); if (!s || !m) return;
      sure = ""; pickW = ""; paintBody();
      const r = await post({ action: "world-chat-report", ...s, target: m.w, why: d.why, ch: (a && a.id) || local.ch, m: m.m }).catch(() => null);
      toast(r && r.ok ? T("Reported. Thank you.") : T((r && r.j && r.j.error) || "Couldn't send the report right now"));
    }
  });

  // ---- show / hide ----
  function show(w) {
    open = true; el.hidden = false; ctx.freeze(true); fit();
    if (w) { tab = "dms"; thread = { w, list: null }; } else if (!ctx.area() && tab === "local") tab = "friends";
    paint(); loadUnread(); if (tab === "local") loadLocal(); else if (tab === "dms" && thread) loadThread(); else loadFriends();
    clearInterval(timer); timer = setInterval(tick, POLL);
  }
  function hide() { if (!open) return; open = false; el.hidden = true; clearInterval(timer); timer = 0; thread = null; pickW = ""; sure = ""; ctx.freeze(false); const i = el.querySelector("input"); if (i) i.blur(); }

  // the unread check while the panel is shut (once a minute, only when someone is signed in and the page is showing)
  setInterval(() => { if (!open && !document.hidden && sess()) loadUnread(); }, ASK_EVERY);
  setTimeout(() => { if (sess()) loadUnread(); }, 5000);
  badge();

  return {
    show, hide, isOpen: () => open, unread: () => un.dm + un.q,
    /// the last line you said in the last minute, once, for the ping (others see it over your figure)
    pending() { if (said && !said.sent && Date.now() - said.at < 60e3) { said.sent = true; return said.m.slice(0, 80); } return ""; },
    /// true about every 3 minutes: the ping then tells the server you're here (the green dot on your friends' lists)
    presenceDue() { if (!sess() || Date.now() - presAt < PRES_EVERY) return false; presAt = Date.now(); return true; },
  };
}
